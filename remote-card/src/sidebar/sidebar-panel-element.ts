// The "Sofabaton X" sidebar panel (docs/internal/sidebar-remote-plan.md).
//
// Home Assistant registers this element as a custom panel (sidebar_panel.py)
// and sets `hass`, `narrow`, `route` and `panel` on it. The panel is HA
// chrome: a menu button, the title, an admin-only cog that swaps the
// sidebar remote for the Control Panel card, and the hub picker as an
// HA-style menu. The panel owns the selected hub and hands it to whichever
// view is mounted. The Control Panel's bundle (tools-card.js) is imported
// by URL only when an admin opens it, so other users never download it.

import { LitElement, css, html, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import type { HassLike } from "../backend/hass-types";
import { remoteCardDirection, remoteCardLanguage, setRemoteCardLanguage, str } from "../remote-card-strings";
import type { SidebarRuntimeState } from "./sidebar-busy";
import { SIDEBAR_REMOTE_TAG, type SofabatonSidebarRemote } from "./sidebar-remote-element";

export const SIDEBAR_PANEL_TAG = "sofabaton-x-panel";
const CONTROL_PANEL_TAG = "sofabaton-control-panel";
const CONTROL_PANEL_BUNDLE = "tools-card.js";
const HUB_STORAGE_KEY = "sofabaton_x1s:sidebar:hub";
const POLL_MS = 4000;

export interface SidebarHub {
  entry_id: string;
  name?: string;
  version?: string;
  hub_connected?: boolean;
  proxy_client_connected?: boolean;
  runtime_state?: SidebarRuntimeState;
}

interface ControlPanelElement extends HTMLElement {
  hass: HassLike;
  setConfig(config: Record<string, unknown>): void;
}

/** The remote entity of a hub: the `remote.*` state carrying its entry id. */
export function entityForHub(hass: HassLike | null, entryId: string | null): string | null {
  if (!hass || !entryId) return null;
  for (const [id, state] of Object.entries(hass.states ?? {})) {
    if (!id.startsWith("remote.")) continue;
    if (String(state?.attributes?.entry_id ?? "") === entryId) return id;
  }
  return null;
}

/** The hub to show: the remembered one if it still exists, else the first. */
/** The panel's URL path (sidebar_panel.py registers it). */
export const PANEL_URL_PATH = "/sofabaton-x";
const VIEW_PATHS: Record<"remote" | "panel", string> = { remote: "/virtual-remote", panel: "/control-panel" };

/** The tab a route path names, or null for the plain panel path. */
export function viewForPath(path: string): "remote" | "panel" | null {
  const clean = String(path ?? "").replace(/\/+$/, "");
  for (const [view, sub] of Object.entries(VIEW_PATHS) as Array<["remote" | "panel", string]>) {
    if (clean === sub) return view;
  }
  return null;
}

export function pathForView(view: "remote" | "panel"): string {
  return VIEW_PATHS[view];
}

export function pickHub(hubs: SidebarHub[], remembered: string | null): string | null {
  if (!hubs.length) return null;
  if (remembered && hubs.some((hub) => hub.entry_id === remembered)) return remembered;
  return hubs[0].entry_id;
}

export class SofabatonXPanel extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      height: 100vh;
      height: 100dvh;
      /* The dashboard ground (hui-view): the theme's background image when it has one. */
      background: var(--lovelace-background, var(--primary-background-color));
      color: var(--primary-text-color);
      font-family: var(--ha-font-family-body, Roboto, "Segoe UI", system-ui, sans-serif);
    }
    *, *::before, *::after { box-sizing: border-box; }
    /* The header is tokenized like hui-root's: the theme's header colour (which
       may be translucent), its backdrop filter, its border on the toolbar, and
       tabs that follow HA's tab group (14px medium, 2px indicator in the
       selection-bar colour, inactive tabs at 80%). */
    .header {
      position: relative;
      flex: 0 0 auto;
      background-color: var(--app-header-background-color, var(--primary-color));
      color: var(--app-header-text-color, white);
      backdrop-filter: var(--app-header-backdrop-filter, none);
      padding-top: var(--safe-area-inset-top, env(safe-area-inset-top));
    }
    .toolbar {
      display: flex;
      align-items: center;
      height: var(--header-height, 56px);
      padding: 0 12px;
      border-bottom: var(--app-header-border-bottom, none);
      font-size: var(--ha-font-size-xl, 20px);
      font-weight: var(--ha-font-weight-normal, 400);
    }
    :host([narrow]) .toolbar { padding: 0 4px; }
    .tabs {
      flex: 1 1 auto; min-width: 0; align-self: stretch; display: flex; align-items: stretch; position: relative; overflow: hidden;
      margin-inline-start: 4px;
      --tab-indicator: var(--ha-tab-indicator-color, var(--app-header-selection-bar-color, var(--app-header-text-color, white)));
      --tab-active: var(--ha-tab-active-text-color, var(--app-header-text-color, white));
    }
    .tab, .title {
      display: inline-flex; align-items: center; gap: 8px; padding: 0 16px; white-space: nowrap; flex: 0 0 auto; position: relative;
    }
    .tab { font-size: var(--ha-font-size-m, 14px); font-weight: var(--ha-font-weight-medium, 500); opacity: 0.8; transition: opacity 0.15s; }
    .tab:hover { opacity: 1; }
    .tab.active { opacity: 1; color: var(--tab-active); }
    .tab.active::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--tab-indicator); }
    .tab:disabled { opacity: 0.5; cursor: default; }
    .tab ha-icon, .title ha-icon { --mdc-icon-size: 24px; flex: 0 0 auto; }
    /* One tab only (not an admin): a plain icon + label in the page-title style, nothing selected. */
    .title { padding: 0 8px; min-width: 0; }
    .title .label { overflow: hidden; text-overflow: ellipsis; }
    :host(:not([narrow])) .title { margin-inline-start: var(--ha-space-4, 16px); }
    /* The labels drop as soon as they stop fitting; the probe is the labelled strip, measured off-screen. */
    .tabs.compact .label { display: none; }
    .tabs.compact .tab { padding: 0 12px; }
    .probe { position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; display: inline-flex; white-space: nowrap; }
    button {
      font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer;
      -webkit-tap-highlight-color: transparent; user-select: none;
    }
    button:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 55%, transparent); outline-offset: -2px; }
    /* the subview's back arrow sits where the menu button sits (ha-icon-button metrics) */
    .back { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto; }
    .back ha-icon { --mdc-icon-size: 24px; }
    .back:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
    .hub {
      display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 8px 0 12px; border-radius: 17px; flex: 0 0 auto;
      font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; max-width: 45vw;
      background: color-mix(in srgb, currentColor 12%, transparent);
    }
    .hub .name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hub ha-icon { --mdc-icon-size: 18px; opacity: 0.7; flex: 0 0 auto; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: #7f9a72; transition: background 0.15s, box-shadow 0.15s; }
    .dot.down { background: #c0504d; }
    .dot.tx { background: var(--primary-color); box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 28%, transparent); }
    .dot.err { background: #c0504d; box-shadow: 0 0 0 4px rgba(192, 80, 77, 0.28); }
    .dot.busy { background: var(--primary-color); animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary-color) 35%, transparent); } 50% { box-shadow: 0 0 0 5px transparent; } }
    .menu {
      position: absolute; right: 8px; top: calc(100% - 4px); z-index: 8; min-width: 232px; padding: 6px 0; border-radius: 12px;
      background: var(--card-background-color, var(--primary-background-color)); color: var(--primary-text-color);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22), 0 1px 3px rgba(0, 0, 0, 0.12); font-size: 14px;
    }
    .mi { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 14px; height: 48px; padding: 0 16px; width: 100%; text-align: start; }
    .mi ha-icon { --mdc-icon-size: 22px; opacity: 0.7; }
    .mi small { font-size: 11px; letter-spacing: 0.06em; color: var(--secondary-text-color); margin-left: 6px; }
    .mi.current { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
    .mi.current ha-icon { opacity: 1; }
    .mi:hover { background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
    .content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
    sofabaton-sidebar-remote { flex: 1 1 auto; min-height: 0; }
    .page { height: 100%; max-width: 1040px; margin: 0 auto; padding: 16px; padding-bottom: calc(16px + env(safe-area-inset-bottom)); width: 100%; }
    sofabaton-control-panel { display: block; height: 100%; }
    :host([narrow]) .page { padding: 0; padding-bottom: env(safe-area-inset-bottom); }
    :host([narrow]) sofabaton-control-panel { --tools-card-outer-radius: 0; --ha-card-border-width: 0; }
    .empty { margin: auto; padding: 24px; color: var(--secondary-text-color); text-align: center; }
  `;

  private _hass: HassLike | null = null;
  private _narrow = false;
  private _hubs: SidebarHub[] = [];
  private _selected: string | null = null;
  private _view: "remote" | "panel" = "remote";
  /** Opened on a tab's own path: back arrow instead of the menu button. */
  private _subview = false;
  /** Tab labels hidden because the labelled strip does not fit beside the hub picker. */
  private _compact = false;
  private _tabsObserver: ResizeObserver | null = null;
  private _menuOpen = false;
  private _controlPanel: ControlPanelElement | null = null;
  private _controlPanelLoading = false;
  private _controlPanelFailed = false;
  private _pollTimer: ReturnType<typeof setTimeout> | null = null;
  private _polling = false;
  private _hassSeen = false;
  private _errUntil = 0;
  private _onVisibility: (() => void) | null = null;
  private _onOutside: ((ev: Event) => void) | null = null;

  set hass(value: HassLike) {
    this._hass = value;
    const language = value?.locale?.language ?? value?.language;
    if (setRemoteCardLanguage(language)) this.requestUpdate();
    this.lang = remoteCardLanguage();
    this.dir = remoteCardDirection();
    if (this._controlPanel) this._controlPanel.hass = value;
    // The first `hass` is what makes the hub poll possible (connectedCallback
    // usually runs before HA sets it).
    if (!this._hassSeen) {
      this._hassSeen = true;
      void this._poll();
    }
    this.requestUpdate();
  }

  get hass(): HassLike | null {
    return this._hass;
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

  /** HA's route for the panel: `/sofabaton-x` opens as before; the sub-paths
   *  `/virtual-remote` and `/control-panel` open that tab as a subview, with a
   *  back arrow in place of the menu button (like hass-subpage), so a
   *  dashboard can link straight to one tab and the user can come back. */
  set route(value: unknown) {
    const path = String((value as { path?: unknown } | null)?.path ?? "");
    const view = viewForPath(path);
    this._subview = view != null;
    if (view != null && view !== this._view) void this._setView(view, false);
    this.requestUpdate();
  }

  set panel(_value: unknown) {}

  get selectedHub(): string | null {
    return this._selected;
  }

  get view(): "remote" | "panel" {
    return this._view;
  }

  private get isAdmin(): boolean {
    return this._hass?.user?.is_admin === true;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._selected = this._readStoredHub();
    this._onVisibility = () => {
      if (document.visibilityState === "visible") void this._poll();
    };
    document.addEventListener("visibilitychange", this._onVisibility);
    this._onOutside = (ev: Event) => {
      if (!this._menuOpen) return;
      const menu = this.renderRoot.querySelector(".menu");
      const chip = this.renderRoot.querySelector(".hub");
      const path = ev.composedPath();
      if ((menu && path.includes(menu)) || (chip && path.includes(chip))) return;
      this._menuOpen = false;
      this.requestUpdate();
    };
    document.addEventListener("pointerdown", this._onOutside, { capture: true });
    this.addEventListener("sidebar-remote-failed", this._onRemoteFailed);
    void this._poll();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
    if (this._onVisibility) document.removeEventListener("visibilitychange", this._onVisibility);
    if (this._onOutside) document.removeEventListener("pointerdown", this._onOutside, { capture: true });
    this.removeEventListener("sidebar-remote-failed", this._onRemoteFailed);
    this._tabsObserver?.disconnect();
    this._tabsObserver = null;
  }

  private readonly _onRemoteFailed = (): void => {
    this._errUntil = Date.now() + 900;
    this.requestUpdate();
    setTimeout(() => this.requestUpdate(), 950);
  };

  // ---------- hubs ----------

  private _readStoredHub(): string | null {
    try {
      return window.localStorage.getItem(HUB_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  private _storeHub(entryId: string | null): void {
    try {
      if (entryId) window.localStorage.setItem(HUB_STORAGE_KEY, entryId);
      else window.localStorage.removeItem(HUB_STORAGE_KEY);
    } catch {
      /* private mode */
    }
  }

  /** Poll the light hub list while the panel is visible. */
  private async _poll(): Promise<void> {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
    if (!this.isConnected) return;
    if (!this._polling && this._hass?.callWS) {
      this._polling = true;
      try {
        const result = await this._hass.callWS<{ hubs?: SidebarHub[] }>({ type: "sofabaton_x1s/sidebar/state" });
        this._applyHubs(Array.isArray(result?.hubs) ? result.hubs : []);
      } catch {
        /* keep the last list; the entity availability still drives the dot */
      } finally {
        this._polling = false;
      }
    }
    if (document.visibilityState === "visible") {
      this._pollTimer = setTimeout(() => void this._poll(), POLL_MS);
    }
  }

  private _applyHubs(hubs: SidebarHub[]): void {
    this._hubs = hubs;
    const next = pickHub(hubs, this._selected);
    if (next !== this._selected) this._selectHub(next, false);
    this.requestUpdate();
  }

  /** Select a hub by config-entry id (the menu's action; harnesses and audits use it too). */
  selectHub(entryId: string): void {
    if (!this._hubs.some((hub) => hub.entry_id === entryId)) return;
    this._selectHub(entryId);
  }

  private _selectHub(entryId: string | null, remember = true): void {
    this._selected = entryId;
    this._menuOpen = false;
    if (remember) this._storeHub(entryId);
    if (this._controlPanel && entryId) {
      this._controlPanel.setConfig({ fill_height: true, host: "panel", hub: entryId });
    }
    this.requestUpdate();
  }

  private _selectedHub(): SidebarHub | null {
    return this._hubs.find((hub) => hub.entry_id === this._selected) ?? null;
  }

  // ---------- views ----------

  /** `fromUser`: a tab click. In a subview that also moves the URL to the tab's
   *  path (replace, not push), so a reload or a share lands on the same tab. */
  private async _setView(view: "remote" | "panel", fromUser = true): Promise<void> {
    if (fromUser && this._subview) this._replacePath(view);
    if (view === "remote") {
      if (this._view !== "remote") {
        this._view = "remote";
        this.requestUpdate();
      }
      return;
    }
    if (this._view === "panel") return;
    if (!this._controlPanel) {
      this._controlPanelLoading = true;
      this._controlPanelFailed = false;
      this.requestUpdate();
      try {
        if (!customElements.get(CONTROL_PANEL_TAG)) {
          const own = new URL(import.meta.url);
          const url = new URL(CONTROL_PANEL_BUNDLE, own);
          url.search = own.search;
          await import(/* @vite-ignore */ url.href);
        }
        const card = document.createElement(CONTROL_PANEL_TAG) as ControlPanelElement;
        card.setConfig({ fill_height: true, host: "panel", hub: this._selected ?? undefined });
        if (this._hass) card.hass = this._hass;
        this._controlPanel = card;
      } catch {
        this._controlPanelFailed = true;
      } finally {
        this._controlPanelLoading = false;
      }
    }
    if (this._controlPanel) this._view = "panel";
    this.requestUpdate();
  }

  /* Navigation mirrors HA's own helpers (src/common/navigate.ts): HA pushes a
     history entry with `{ from: <previous path> }` and marks the app's first
     entry `{ root: true }`; its goBack() steps back only when `from` is set
     and otherwise replaces the entry with the default dashboard. The
     companion apps (Android's back button, iOS) ride on that same history,
     so the panel keeps to the same state shape and the same
     `location-changed` event instead of inventing its own. */

  private _replacePath(view: "remote" | "panel"): void {
    const path = `${PANEL_URL_PATH}${pathForView(view)}`;
    if (typeof window === "undefined" || window.location.pathname === path) return;
    const current = (window.history.state ?? {}) as { root?: boolean; from?: string };
    const data = current.root ? { root: true } : undefined;
    const state = current.from === undefined ? (data ?? null) : { ...data, from: current.from };
    try {
      window.history.replaceState(state, "", path);
    } catch {
      return;
    }
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: true } }));
  }

  /** The subview's back arrow, as HA's goBack(): one step back when HA
   *  navigated here (the entry carries `from`), else the default dashboard
   *  replaces this entry (a fresh tab, a deep link from outside). */
  private _back(): void {
    if (typeof window === "undefined") return;
    const current = (window.history.state ?? {}) as { root?: boolean; from?: string };
    if (current.from !== undefined) {
      window.history.back();
      return;
    }
    try {
      window.history.replaceState(current.root ? { root: true } : null, "", "/");
    } catch {
      return;
    }
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: true } }));
  }

  // ---------- header measurement ----------

  protected updated(): void {
    // Only until the observer is attached: from then on real size changes of
    // the strip or the probe (labels, language) drive it. A re-measure from
    // every update could re-render without end if it ever disagreed with
    // the layout it produced.
    if (!this._tabsObserver) this._measureTabs();
  }

  /** Labels show when the labelled strip (the hidden probe) fits the space the tabs get. */
  private _measureTabs(): void {
    const strip = this.renderRoot.querySelector(".tabs") as HTMLElement | null;
    const probe = this.renderRoot.querySelector(".probe") as HTMLElement | null;
    if (!strip || !probe) return;
    if (!this._tabsObserver && typeof ResizeObserver !== "undefined") {
      this._tabsObserver = new ResizeObserver(() => this._measureTabs());
      this._tabsObserver.observe(strip);
      this._tabsObserver.observe(probe);
    }
    const compact = probe.offsetWidth > strip.clientWidth;
    if (compact !== this._compact) {
      this._compact = compact;
      this.requestUpdate();
    }
  }

  // ---------- render ----------

  protected render(): TemplateResult {
    const s = str();
    const hub = this._selectedHub();
    const entityId = entityForHub(this._hass, this._selected);
    const entityState = entityId ? this._hass?.states?.[entityId]?.state : undefined;
    const reachable = hub ? hub.hub_connected !== false && entityState !== "unavailable" : false;
    const runtime = hub?.runtime_state ?? null;
    const remote = this.renderRoot.querySelector(SIDEBAR_REMOTE_TAG) as SofabatonSidebarRemote | null;
    const inFlight = Boolean(remote?.store.isLoadingActive()) && runtime?.kind !== "operation_running";
    const dotClass = {
      dot: true,
      down: !reachable,
      busy: runtime?.kind === "operation_running" || Boolean(remote?.store.activityLoadingActive()),
      tx: inFlight,
      err: Date.now() < this._errUntil,
    };
    const tabs = this.isAdmin
      ? html`<div class=${classMap({ tabs: true, compact: this._compact })} role="tablist">
          ${this._renderTab("remote", "mdi:remote-tv", s.sidebar.title)}
          ${this._renderTab("panel", "mdi:cog-outline", s.sidebar.controlPanel)}
          <div class="probe" aria-hidden="true">
            <span class="tab"><ha-icon .icon=${"mdi:remote-tv"}></ha-icon><span>${s.sidebar.title}</span></span>
            <span class="tab"><ha-icon .icon=${"mdi:cog-outline"}></ha-icon><span>${s.sidebar.controlPanel}</span></span>
          </div>
        </div>`
      : html`<div class=${classMap({ tabs: true, single: true, compact: this._compact })}>
          <div class="title"><ha-icon .icon=${"mdi:remote-tv"}></ha-icon><span class="label">${s.sidebar.title}</span></div>
          <div class="probe" aria-hidden="true"><span class="title"><ha-icon .icon=${"mdi:remote-tv"}></ha-icon><span>${s.sidebar.title}</span></span></div>
        </div>`;
    return html`
      <div class="header">
        <div class="toolbar">
          ${this._subview
            ? html`<button class="back" type="button" aria-label=${s.sidebar.back} title=${s.sidebar.back} @click=${this._back}>
                <ha-icon .icon=${"mdi:arrow-left"}></ha-icon>
              </button>`
            : html`<ha-menu-button .hass=${this._hass} .narrow=${this._narrow}></ha-menu-button>`}
          ${tabs}
          ${this._hubs.length > 1
            ? html`<button class="hub" type="button" aria-haspopup="menu" aria-expanded=${this._menuOpen ? "true" : "false"} aria-label=${s.sidebar.hubMenu} @click=${() => { this._menuOpen = !this._menuOpen; this.requestUpdate(); }}>
                <span class=${classMap(dotClass)}></span>
                <span class="name">${hub?.name || hub?.entry_id || ""}</span>
                <ha-icon .icon=${"mdi:menu-down"}></ha-icon>
              </button>`
            : nothing}
          ${this._menuOpen ? this._renderMenu() : nothing}
        </div>
      </div>
      <div class="content">
        ${this._view === "panel" && this._controlPanel
          ? html`<div class="page">${this._controlPanel}</div>`
          : html`<sofabaton-sidebar-remote .hass=${this._hass} .entityId=${entityId ?? ""} .runtime=${runtime} ?narrow=${this._narrow}></sofabaton-sidebar-remote>`}
        ${this._controlPanelFailed ? html`<div class="empty">${s.card.serverReadFailed}</div>` : nothing}
      </div>
    `;
  }

  private _renderTab(view: "remote" | "panel", iconName: string, label: string): TemplateResult {
    const active = this._view === view;
    return html`<button
      class=${classMap({ tab: true, [view]: true, active })}
      type="button"
      role="tab"
      aria-selected=${active ? "true" : "false"}
      title=${label}
      aria-label=${label}
      ?disabled=${view === "panel" && this._controlPanelLoading}
      @click=${() => this._setView(view)}
    ><ha-icon .icon=${iconName}></ha-icon><span class="label">${label}</span></button>`;
  }

  private _renderMenu(): TemplateResult {
    const s = str();
    return html`<div class="menu" role="menu">
      ${this._hubs.map((hub) => {
        const entityId = entityForHub(this._hass, hub.entry_id);
        const reachable = hub.hub_connected !== false && this._hass?.states?.[entityId ?? ""]?.state !== "unavailable";
        return html`<button class=${classMap({ mi: true, current: hub.entry_id === this._selected })} role="menuitemradio" aria-checked=${hub.entry_id === this._selected ? "true" : "false"} type="button" @click=${() => this._selectHub(hub.entry_id)}>
          <ha-icon .icon=${"mdi:remote"}></ha-icon>
          <span>${hub.name || hub.entry_id}${hub.version ? html`<small>${hub.version}</small>` : nothing}</span>
          <span class=${classMap({ dot: true, down: !reachable })} title=${reachable ? s.sidebar.hubReachable : s.sidebar.hubUnreachable}></span>
        </button>`;
      })}
    </div>`;
  }
}
