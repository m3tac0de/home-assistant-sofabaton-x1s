// `ha-select` + `mwc-list-item` for the web remote (docs/internal/
// web-remote-plan.md, R4). The activity row renders
// <ha-select .label .value .disabled><mwc-list-item .value>label</...>
// and listens for "selected" / "change" plus the open ("opened") and close
// ("closed") events remote-card-compat resolves for the mwc generation
// (ha-dropdown-item is never defined on the page, so that branch is the
// one the card takes). This is the harness stub promoted to a real
// element: a labelled trigger, a dropdown list, keyboard support, and the
// same token contract as HA's field so the card's styling rules apply.

interface SelectOption {
  value: string;
  label: string;
  defaultLayout: boolean;
}

export class SbMwcListItem extends HTMLElement {
  private _value: string | null = null;

  get value(): string {
    return this._value ?? this.getAttribute("value") ?? "";
  }

  set value(next: unknown) {
    this._value = next == null ? "" : String(next);
    this.setAttribute("value", this._value);
  }
}

export class SbHaSelect extends HTMLElement {
  static get observedAttributes(): string[] {
    return ["label", "disabled"];
  }

  private readonly _shadow: ShadowRoot;
  private readonly _observer: MutationObserver;
  private _labelEl: HTMLElement | null = null;
  private _valueEl: HTMLElement | null = null;
  private _trigger: HTMLButtonElement | null = null;
  private _menu: HTMLElement | null = null;
  private _label = "";
  private _value = "";
  private _options: SelectOption[] = [];
  private _connected = false;
  private readonly _onViewportChange = (): void => this._placeMenu();

  constructor() {
    super();
    this._observer = new MutationObserver(() => this._syncOptions());
    this._shadow = this.attachShadow({ mode: "open" });
    this._shadow.innerHTML = `
      <style>
        :host { display: block; position: relative; }
        .label {
          font-size: 12px;
          color: var(--mdc-select-label-ink-color, rgba(0, 0, 0, 0.6));
          line-height: 1.2;
        }
        .trigger {
          width: 100%;
          border: 0;
          background: var(--ha-color-form-background, #f3f3f3);
          border-radius: var(--mdc-shape-small, 4px);
          min-height: 56px;
          padding: 10px 14px 8px 16px;
          color: var(--primary-text-color, #141414);
          font: inherit;
          text-align: left;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          grid-template-rows: auto auto;
          gap: 2px 10px;
          cursor: pointer;
          box-shadow: inset 0 -1px 0 var(--ha-color-border-neutral-loud, rgba(0, 0, 0, 0.55));
          transition: box-shadow 180ms ease-in-out;
        }
        /* HA's field lights its line on any focus (mouse included) and
           keeps it while the menu is open; the card's mode toggle mirrors
           the field through :focus-within and the open state, so the two
           must light together. */
        .trigger:focus,
        :host([open]) .trigger {
          outline: none;
          box-shadow: inset 0 -2px 0 var(--mdc-theme-primary, var(--primary-color, #009ac7));
        }
        .trigger:hover:not([disabled]) {
          background: color-mix(in srgb, var(--primary-text-color, #141414) 8%, var(--ha-color-form-background, #f3f3f3));
        }
        .trigger:active:not([disabled]) {
          background: color-mix(in srgb, var(--primary-text-color, #141414) 12%, var(--ha-color-form-background, #f3f3f3));
        }
        .trigger[disabled] { cursor: default; opacity: 0.6; }
        .value {
          font-size: 16px;
          line-height: 1.3;
          color: var(--primary-text-color, #141414);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .caret {
          grid-column: 2;
          grid-row: 1 / span 2;
          align-self: center;
          width: 24px;
          height: 24px;
          color: var(--secondary-text-color, #5e5e5e);
        }
        .caret svg { width: 100%; height: 100%; fill: currentColor; }
        /* Fixed, not absolute: the card clips the host (overflow: hidden
           ellipsizes long names and rounds the field), which would swallow
           an in-flow popup. HA's own select floats its menu surface the
           same way. Placed from the trigger's rect on open; see _placeMenu. */
        .menu {
          position: fixed;
          left: 0;
          top: 0;
          width: 0;
          box-sizing: border-box;
          display: none;
          max-height: 60vh;
          overflow-y: auto;
          background: var(--card-background-color, var(--mdc-theme-surface, #fff));
          border-radius: 12px;
          border: 1px solid var(--ha-color-border-neutral-quiet, var(--divider-color, #e6e6e6));
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08), 0 12px 28px rgba(0, 0, 0, 0.16);
          padding: 6px;
          z-index: 40;
        }
        :host([open]) .menu { display: block; }
        .option {
          width: 100%;
          border: 0;
          background: transparent;
          color: var(--primary-text-color, #141414);
          text-align: left;
          font: inherit;
          font-size: 16px;
          line-height: 1.3;
          padding: 12px 14px;
          border-radius: 8px;
          cursor: pointer;
        }
        .option:hover, .option:focus-visible {
          outline: none;
          background: var(--wa-color-neutral-fill-normal, var(--ha-color-fill-neutral-normal-resting, #e6e6e6));
        }
        .option[data-selected="true"] {
          background: var(--ha-color-fill-primary-quiet-resting, #eff9fe);
          color: var(--sb-select-selected-text, var(--primary-color, inherit));
        }
        .option + .option { margin-top: 2px; }
      </style>
      <button class="trigger" part="trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="options">
        <span class="label" part="label"></span>
        <span class="value" part="value"></span>
        <span class="caret"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z"></path></svg></span>
      </button>
      <div class="menu" part="menu" id="options" role="listbox"></div>
    `;
    this._labelEl = this._shadow.querySelector(".label");
    this._valueEl = this._shadow.querySelector(".value");
    this._trigger = this._shadow.querySelector(".trigger");
    this._menu = this._shadow.querySelector(".menu");
  }

  connectedCallback(): void {
    if (!this._connected) {
      this._connected = true;
      this._trigger?.addEventListener("click", () => {
        if (this.disabled) return;
        if (this.hasAttribute("open")) this._closeMenu();
        else this._openMenu();
      });
      this._trigger?.addEventListener("keydown", (event) => {
        if (this.disabled) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (!this.hasAttribute("open")) this._openMenu();
          const buttons = Array.from(this._menu?.querySelectorAll<HTMLButtonElement>(".option") ?? []);
          const index = Math.max(0, this._options.findIndex((option) => option.value === this._value));
          const next = event.key === "ArrowDown" ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1);
          buttons[next]?.focus();
        } else if (event.key === "Escape" && this.hasAttribute("open")) {
          event.preventDefault();
          this._closeMenu();
        }
      });
      this._shadow.addEventListener("focusout", (event) => {
        const next = (event as FocusEvent).relatedTarget as Node | null;
        if (next && this._shadow.contains(next)) return;
        if (this.hasAttribute("open")) this._closeMenu();
      });
      this._menu?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this._closeMenu();
          this._trigger?.focus();
          return;
        }
        const buttons = Array.from(this._menu?.querySelectorAll<HTMLButtonElement>(".option") ?? []);
        const index = buttons.indexOf(this._shadow.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? Math.min(buttons.length - 1, index + 1)
          : event.key === "ArrowUp" ? Math.max(0, index - 1)
          : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
        if (next != null) { event.preventDefault(); buttons[next]?.focus(); }
      });
    }
    this._observer.observe(this, { childList: true, subtree: true, characterData: true });
    this._renderLabel();
    this._syncOptions();
  }

  disconnectedCallback(): void {
    this._observer.disconnect();
    this._closeMenu();
  }

  attributeChangedCallback(name: string): void {
    if (name === "label") this._renderLabel();
    if (name === "disabled" && this._trigger) this._trigger.disabled = this.disabled;
  }

  get label(): string {
    return this._label || this.getAttribute("label") || "";
  }

  set label(value: unknown) {
    this._label = value == null ? "" : String(value);
    this._renderLabel();
  }

  get value(): string {
    return this._value;
  }

  set value(next: unknown) {
    this._value = next == null ? "" : String(next);
    this._renderValue();
    this._renderOptions();
  }

  get disabled(): boolean {
    return this.hasAttribute("disabled");
  }

  set disabled(next: unknown) {
    if (next) this.setAttribute("disabled", "");
    else this.removeAttribute("disabled");
    if (this._trigger) this._trigger.disabled = Boolean(next);
  }

  private _renderLabel(): void {
    if (this._labelEl) this._labelEl.textContent = this.label;
  }

  private _syncOptions(): void {
    const current = this._value;
    const items = Array.from(this.children) as Array<HTMLElement & { value?: string }>;
    this._options = items.map((item) => ({
      value: String(item.value ?? item.getAttribute("value") ?? item.textContent ?? ""),
      label: (item.textContent ?? "").trim(),
      defaultLayout: item.classList.contains("sb-option-default"),
    }));
    if (!this._options.some((option) => option.value === current)) {
      this._value = this._options[0]?.value ?? "";
    }
    this._renderValue();
    this._renderOptions();
  }

  private _renderValue(): void {
    if (!this._valueEl) return;
    const match = this._options.find((option) => option.value === this._value);
    this._valueEl.textContent = match?.label ?? this._value;
  }

  private _renderOptions(): void {
    if (!this._menu) return;
    this._menu.textContent = "";
    for (const option of this._options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.setAttribute("part", option.defaultLayout ? "option default-option" : "option");
      button.dataset.value = option.value;
      button.setAttribute("role", "option");
      button.textContent = option.label;
      button.dataset.selected = String(option.value === this._value);
      button.setAttribute("aria-selected", button.dataset.selected);
      button.addEventListener("click", () => {
        this._value = option.value;
        this._renderValue();
        this._renderOptions();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.dispatchEvent(
          new CustomEvent("selected", { detail: { value: this._value }, bubbles: true, composed: true }),
        );
        this._closeMenu();
        this._trigger?.focus();
      });
      this._menu.appendChild(button);
    }
  }

  private _openMenu(): void {
    this.setAttribute("open", "");
    this._trigger?.setAttribute("aria-expanded", "true");
    this._placeMenu();
    window.addEventListener("scroll", this._onViewportChange, true);
    window.addEventListener("resize", this._onViewportChange);
    this.dispatchEvent(new Event("opened", { bubbles: true, composed: true }));
  }

  private _closeMenu(): void {
    window.removeEventListener("scroll", this._onViewportChange, true);
    window.removeEventListener("resize", this._onViewportChange);
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this._trigger?.setAttribute("aria-expanded", "false");
    this.dispatchEvent(new Event("closed", { bubbles: true, composed: true }));
  }

  /**
   * Put the fixed menu on the roomier side of the trigger, within the
   * visible card where possible. Measured as a delta from where
   * the menu lands at (0, 0): a transformed ancestor (the card animates
   * with one) makes itself the containing block for fixed descendants,
   * and a zoomed ancestor (the page's zoom= parameter) scales the length
   * units, so absolute viewport coordinates would be wrong in both cases.
   */
  private _placeMenu(): void {
    const menu = this._menu;
    const trigger = this._trigger;
    if (!menu || !trigger || !this.hasAttribute("open")) return;
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.width = "0px";
    const origin = menu.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const zoom = effectiveZoom(this);
    menu.style.left = `${(anchor.left - origin.left) / zoom}px`;
    menu.style.top = `${(anchor.bottom + 4 - origin.top) / zoom}px`;
    menu.style.width = `${anchor.width / zoom}px`;
    // The remote's selector can be reordered to any row. Prefer the
    // visible card's bounds; editor selects have only the viewport bound.
    const card = this.closest("ha-card")?.getBoundingClientRect();
    const viewportTop = 8;
    const viewportBottom = window.innerHeight - 8;
    let top = Math.max(viewportTop, card ? card.top + 8 : viewportTop);
    let bottom = Math.min(viewportBottom, card ? card.bottom - 8 : viewportBottom);
    // A selector-only card cannot contain even one usable option. Let
    // its menu extend into the viewport instead of collapsing to nothing.
    const minimumHeight = Math.min(menu.scrollHeight * zoom, 64 * zoom);
    if (Math.max(anchor.top - 4 - top, bottom - anchor.bottom - 4) < minimumHeight) {
      top = viewportTop;
      bottom = viewportBottom;
    }
    const below = Math.max(0, bottom - anchor.bottom - 4);
    const above = Math.max(0, anchor.top - 4 - top);
    const upwards = above > below;
    menu.style.maxHeight = `${Math.min(window.innerHeight * 0.6, upwards ? above : below) / zoom}px`;
    if (upwards) menu.style.top = `${(anchor.top - 4 - origin.top - menu.getBoundingClientRect().height) / zoom}px`;
  }
}

/** Cumulative CSS zoom on the element (1 where the browser has none). */
function effectiveZoom(element: Element): number {
  const current = (element as Element & { currentCSSZoom?: number }).currentCSSZoom;
  if (typeof current === "number" && current > 0) return current;
  let zoom = 1;
  let node: Element | null = element;
  while (node) {
    const value = parseFloat(getComputedStyle(node).zoom);
    if (Number.isFinite(value) && value > 0) zoom *= value;
    node = node.parentElement ?? ((node.getRootNode() as ShadowRoot).host ?? null);
  }
  return zoom;
}

export function defineHaSelectShim(): void {
  if (!customElements.get("mwc-list-item")) customElements.define("mwc-list-item", SbMwcListItem);
  if (!customElements.get("ha-select")) customElements.define("ha-select", SbHaSelect);
}
