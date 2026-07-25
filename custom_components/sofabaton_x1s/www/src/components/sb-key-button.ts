// Lightweight host for one remote-card control. Its native button lives in a
// shadow root so Lit cannot mistake the imperative child nodes for template
// content when the surrounding card re-renders.

import { attachPrimaryAction } from "../remote-card-gestures";

const CONTROL_CSS = `
  :host {
    display: block;
    min-width: 0;
  }

  .sb-key-control {
    appearance: none;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 100%;
    padding: 0 10px;
    border-radius: var(
      --sb-control-radius,
      var(--sb-group-radius, var(--ha-card-border-radius, 18px))
    );
    border: var(--sb-control-border-width, var(--ha-card-border-width, 1px)) solid
      var(--sb-control-border-color, var(--ha-card-border-color, var(--divider-color)));
    background: var(
      --sb-control-background,
      var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))
    );
    box-shadow: var(--sb-control-box-shadow, var(--ha-card-box-shadow, none));
    color: inherit;
    font: inherit;
    font-size: var(--sb-control-font-size, inherit);
    text-align: center;
    cursor: pointer;
    position: relative;
    z-index: 1;
    overflow: hidden;
    -webkit-tap-highlight-color: transparent;
  }

  .sb-key-control::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: inherit;
    background: rgba(var(--sb-overlay-rgb, var(--rgb-primary-text-color, 0, 0, 0)), 0.08);
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
  }

  @media (hover: hover) {
    .sb-key-control:not(:disabled):hover::before {
      opacity: 1;
    }
  }

  .sb-key-control:not(:disabled):active::before {
    background: rgba(var(--sb-overlay-rgb, var(--rgb-primary-text-color, 0, 0, 0)), 0.16);
    opacity: 1;
  }

  .sb-key-control:focus-visible {
    outline: 2px solid rgba(var(--rgb-primary-color), 0.55);
    outline-offset: -2px;
  }

  .sb-key-control:disabled {
    cursor: default;
  }

  .sb-key-control__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.2em;
    height: 1.2em;
    line-height: 1;
    flex: 0 0 auto;
    --mdc-icon-size: 1.2em;
    color: var(--primary-color);
    position: relative;
    z-index: 1;
  }

  .sb-key-control__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
    z-index: 1;
  }

  [hidden] {
    display: none !important;
  }
`;

let sharedControlSheet: CSSStyleSheet | null = null;

function installControlStyles(root: ShadowRoot): void {
  if (
    typeof CSSStyleSheet !== "undefined" &&
    "replaceSync" in CSSStyleSheet.prototype &&
    "adoptedStyleSheets" in root
  ) {
    if (!sharedControlSheet) {
      sharedControlSheet = new CSSStyleSheet();
      sharedControlSheet.replaceSync(CONTROL_CSS);
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sharedControlSheet];
    return;
  }

  const style = document.createElement("style");
  style.textContent = CONTROL_CSS;
  root.appendChild(style);
}

export class SbKeyButton extends HTMLElement {
  private _control: HTMLButtonElement | null = null;
  private _iconEl: HTMLElement | null = null;
  private _labelEl: HTMLSpanElement | null = null;
  private _label = "";
  private _icon: string | null = null;
  private _accessibilityLabel = "";
  private _color: string | null = null;
  private _sizeVar: string | null = null;
  private _disabled = false;
  private _wired = false;

  /** Called on a primary pointer action or keyboard activation. */
  onTrigger: ((ev: Event) => void) | null = null;

  set label(value: string | null) {
    this._label = String(value ?? "");
    this.syncContent();
  }

  set icon(value: string | null) {
    this._icon = value ? String(value) : null;
    this.syncContent();
  }

  set accessibilityLabel(value: string | null) {
    this._accessibilityLabel = String(value ?? "");
    this.syncContent();
  }

  set color(value: string | null) {
    this._color = value ? String(value) : null;
    if (this._color) {
      this.style.setProperty("--sb-color", this._color);
      this.style.setProperty("--sb-control-background", this._color);
    } else {
      this.style.removeProperty("--sb-color");
      this.style.removeProperty("--sb-control-background");
    }
  }

  /** CSS var applied to the native control's icon/name. */
  set sizeVar(value: string | null) {
    this._sizeVar = value ? String(value) : null;
    if (this._sizeVar) {
      this.style.setProperty("--sb-control-font-size", `var(${this._sizeVar})`);
    } else {
      this.style.removeProperty("--sb-control-font-size");
    }
  }

  set disabled(value: boolean) {
    this._disabled = Boolean(value);
    if (this._control) this._control.disabled = this._disabled;
  }

  get disabled(): boolean {
    return this._disabled;
  }

  private fireHaptic(): void {
    this.dispatchEvent(
      new CustomEvent("haptic", {
        detail: "light",
        bubbles: true,
        composed: true,
      }),
    );
  }

  private trigger(ev: Event): void {
    if (this._disabled || this.classList.contains("disabled")) return;
    this.onTrigger?.(ev);
  }

  private syncContent(): void {
    if (!this._control || !this._iconEl || !this._labelEl) return;

    if (this._icon) {
      this._iconEl.setAttribute("icon", this._icon);
      this._iconEl.hidden = false;
    } else {
      this._iconEl.removeAttribute("icon");
      this._iconEl.hidden = true;
    }

    this._labelEl.textContent = this._label;
    this._labelEl.hidden = !this._label;
    this._control.setAttribute(
      "aria-label",
      this._accessibilityLabel || this._label || "Remote button",
    );
  }

  connectedCallback(): void {
    if (this._wired) return;
    this._wired = true;

    const root = this.attachShadow({ mode: "open" });
    installControlStyles(root);

    const control = document.createElement("button");
    control.type = "button";
    control.className = "sb-key-control";
    control.disabled = this._disabled;

    const icon = document.createElement("ha-icon");
    icon.className = "sb-key-control__icon";
    const label = document.createElement("span");
    label.className = "sb-key-control__label";

    control.append(icon, label);
    root.appendChild(control);
    this._control = control;
    this._iconEl = icon;
    this._labelEl = label;
    this.syncContent();

    attachPrimaryAction([this, control], (ev) => this.trigger(ev), {
      fireHaptic: () => this.fireHaptic(),
    });

    // Pointer-generated clicks are handled by pointerup above. A native
    // keyboard click has detail=0, so retain Enter/Space accessibility
    // without opening another duplicate-send path.
    control.addEventListener("click", (ev) => {
      if (ev.detail !== 0 || this._disabled) return;
      this.fireHaptic();
      this.trigger(ev);
    });
  }
}

if (!customElements.get("sb-key-button")) {
  customElements.define("sb-key-button", SbKeyButton);
}
