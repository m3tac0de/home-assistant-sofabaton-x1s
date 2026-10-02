import { LitElement, css, html } from "lit";
import type { HassLike } from "./shared/ha-context";
import { TOOLS_CARD_STRINGS } from "./strings";

/**
 * The "Sofabaton X" sidebar panel: the Control Panel card hosted full-page.
 *
 * Home Assistant registers this element as a custom panel when the card's
 * global "Sidebar Panel" setting is on (sidebar_panel.py). HA loads
 * tools-card.js as the panel module and sets `hass`, `narrow`, `route` and
 * `panel` on the element; custom panels draw their own header, so this one
 * carries the menu button that opens the sidebar on narrow screens.
 *
 * The card is created once with `fill_height` and handed every `hass`
 * update; its own store, tabs, dialogs and dock work unchanged. The page
 * keeps the server panel's reading width (1040px) and, on a narrow screen,
 * drops the gutters and squares the card shell so the card is the page
 * (its contents keep the theme's corner radius).
 */

const PANEL_TYPE = "sofabaton-x-panel";
const CARD_TYPE = "sofabaton-control-panel";

interface ControlPanelCardElement extends HTMLElement {
  hass: HassLike;
  setConfig(config: Record<string, unknown>): void;
}

class SofabatonXPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      height: 100vh;
      height: 100dvh;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
    }
    *, *::before, *::after { box-sizing: border-box; }
    /* HA's own page header (hass-subpage): same height, colours and border. */
    .header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      height: var(--header-height, 56px);
      padding: 0 12px 0 4px;
      padding-top: env(safe-area-inset-top);
      background-color: var(--app-header-background-color, var(--primary-color));
      color: var(--app-header-text-color, var(--text-primary-color));
      border-bottom: var(--app-header-border-bottom, none);
      font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, inherit));
    }
    .header-title {
      flex: 1 1 auto;
      min-width: 0;
      margin: var(--margin-title, 0 0 0 20px);
      font-size: var(--ha-font-size-xl, 20px);
      font-weight: var(--ha-font-weight-normal, 400);
      line-height: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .content {
      flex: 1 1 auto;
      min-height: 0;
    }
    .page {
      height: 100%;
      max-width: 1040px;
      margin: 0 auto;
      padding: 16px;
      padding-bottom: calc(16px + env(safe-area-inset-bottom));
    }
    sofabaton-control-panel {
      display: block;
      height: 100%;
    }
    /* Narrow (phone): the card is the page. */
    :host([narrow]) .page {
      padding: 0;
      padding-bottom: env(safe-area-inset-bottom);
    }
    /* Only the card shell goes square; --ha-card-border-radius is left
       alone so the tabs, blocks, menus and dialogs inside the card keep
       the theme's corner radius. */
    :host([narrow]) sofabaton-control-panel {
      --tools-card-outer-radius: 0;
      --ha-card-border-width: 0;
    }
  `;

  private _hass: HassLike | null = null;
  private _narrow = false;
  private _card: ControlPanelCardElement | null = null;

  set hass(value: HassLike) {
    this._hass = value;
    if (this._card) this._card.hass = value;
    this.requestUpdate();
  }

  get hass(): HassLike {
    return this._hass as HassLike;
  }

  set narrow(value: boolean) {
    const next = Boolean(value);
    if (next === this._narrow) return;
    this._narrow = next;
    this.toggleAttribute("narrow", next);
    this.requestUpdate();
  }

  get narrow(): boolean {
    return this._narrow;
  }

  // HA hands every custom panel its route and panel config; neither is used.
  set route(_value: unknown) {}

  set panel(_value: unknown) {}

  /** The one card instance: created on first render (after the whole
   *  module, card definition included, has run), sized to the page. */
  private card(): ControlPanelCardElement {
    if (!this._card) {
      const card = document.createElement(CARD_TYPE) as ControlPanelCardElement;
      card.setConfig({ fill_height: true });
      if (this._hass) card.hass = this._hass;
      this._card = card;
    }
    return this._card;
  }

  protected render() {
    return html`
      <div class="header">
        <ha-menu-button .hass=${this._hass} .narrow=${this._narrow}></ha-menu-button>
        <div class="header-title">${TOOLS_CARD_STRINGS.sidebarPanel.title}</div>
      </div>
      <div class="content">
        <div class="page">${this.card()}</div>
      </div>
    `;
  }
}

if (!customElements.get(PANEL_TYPE)) customElements.define(PANEL_TYPE, SofabatonXPanel);
