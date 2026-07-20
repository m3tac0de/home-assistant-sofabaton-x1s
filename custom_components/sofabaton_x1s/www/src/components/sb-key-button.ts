// Host element for ONE hui-button-card (or color key) inside the Lit card.
// HA's button cards must be created once and mutated (recreating them on every
// render flickers and drops internal state), so this element owns the instance
// imperatively while Lit renders the host. Renders into LIGHT DOM: the card's
// shadow stylesheet targets `.key hui-button-card` etc., and the host carries
// the legacy wrapper classes.
//
// The child is created in connectedCallback — never during upgrade — so Lit
// template cloning stays index-stable (see the Phase 2 harness lesson).

import { attachPrimaryAction } from "../remote-card-gestures";
import type { HassLike } from "../remote-card-types";

interface HuiButtonCardLike extends HTMLElement {
  hass?: HassLike | null;
  setConfig?(config: Record<string, unknown>): void;
  updateComplete?: Promise<unknown>;
}

export class SbKeyButton extends HTMLElement {
  private _btn: HuiButtonCardLike | null = null;
  private _hass: HassLike | null = null;
  private _syncedHass: HassLike | null = null;
  private _buttonConfig: Record<string, unknown> | null = null;
  private _configApplied = false;
  private _color: string | null = null;
  private _sizeVar: string | null = null;
  private _wired = false;

  /** Called on a (gated) primary action while the host is not .disabled. */
  onTrigger: ((ev: Event) => void) | null = null;

  set buttonConfig(config: Record<string, unknown> | null) {
    this._buttonConfig = config;
    if (this._btn && config && !this._configApplied) {
      this._configApplied = true;
      this._btn.setConfig?.(config);
    }
  }

  set hass(hass: HassLike | null) {
    this._hass = hass;
    this.syncHass();
  }

  /** Color key accent (adds the colorBar and --sb-color). */
  set color(value: string | null) {
    this._color = value;
  }

  /** CSS var applied to the button's inner text (legacy _applyButtonTextSizing). */
  set sizeVar(value: string | null) {
    this._sizeVar = value;
  }

  private syncHass(): void {
    if (!this._btn || !this._hass) return;
    if (this._syncedHass === this._hass) return;
    this._btn.hass = this._hass;
    this._syncedHass = this._hass;
  }

  connectedCallback(): void {
    if (this._wired) {
      this.syncHass();
      return;
    }
    this._wired = true;

    if (this._color) {
      this.style.setProperty("--sb-color", this._color);
    }

    const btn = document.createElement("hui-button-card") as HuiButtonCardLike;
    this._btn = btn;
    if (this._hass) {
      btn.hass = this._hass;
      this._syncedHass = this._hass;
    }
    if (this._buttonConfig && !this._configApplied) {
      this._configApplied = true;
      btn.setConfig?.(this._buttonConfig);
    }
    this.appendChild(btn);

    if (this._color) {
      const bar = document.createElement("div");
      bar.className = "colorBar";
      this.appendChild(bar);
    }

    attachPrimaryAction([this, btn], (ev) => {
      if (this.classList.contains("disabled")) return;
      this.onTrigger?.(ev);
    }, {
      fireHaptic: () => {
        this.dispatchEvent(
          new CustomEvent("haptic", {
            detail: "light",
            bubbles: true,
            composed: true,
          }),
        );
      },
    });

    if (this._sizeVar) {
      applyButtonTextSizing(btn, this._sizeVar);
    }
  }
}

/** Push a font-size var into hui-button-card's shadow internals. */
export function applyButtonTextSizing(
  btn: HuiButtonCardLike | null,
  sizeVar: string,
): void {
  const apply = (attempt = 0) => {
    const root = btn?.shadowRoot;
    if (!root) return;

    const value = `var(${sizeVar})`;
    const card = root.querySelector("ha-card") as HTMLElement | null;
    const name = root.querySelector(".name") as HTMLElement | null;
    const label = root.querySelector(".label") as HTMLElement | null;
    const state = root.querySelector(".state") as HTMLElement | null;

    if (card) card.style.setProperty("font-size", value);
    if (name) name.style.fontSize = value;
    if (label) label.style.fontSize = value;
    if (state) state.style.fontSize = value;

    if (!name && !label && !state && attempt < 2) {
      requestAnimationFrame(() => apply(attempt + 1));
    }
  };

  if (btn?.updateComplete && typeof btn.updateComplete.then === "function") {
    void btn.updateComplete.then(() => apply());
  } else {
    requestAnimationFrame(() => apply());
  }
}

if (!customElements.get("sb-key-button")) {
  customElements.define("sb-key-button", SbKeyButton);
}
