// The control panel's shell (docs/internal/server-panel-state-plan.md,
// decisions 3, 9, 10, 11, 14): one narrow-first column with a sticky top
// dock (brand, hub picker, cog menu, tabs and subtabs), the mounted view
// (under a scrim while the hub is unavailable; a busy hub is the views' to
// show, as on the HA card), and the bottom dock fixed at the viewport's bottom. It renders the store's snapshot
// and coordinates the hub picker's transient forms and actions. The store owns
// the hub list, the selection, the route and the resync points; the
// shell mirrors the route into the URL hash and forwards the views'
// events (sb-message, sb-hubs-changed, sb-select-hub, sb-navigate).

import { LitElement, html, css, nothing, type TemplateResult } from "lit";

import { renderBottomDock, type DockLink } from "./components/bottom-dock";
import { HUB_PICKER_CSS, renderHubPicker, type HubAction } from "./components/hub-picker";
import { renderTabBar } from "./components/tab-bar";
import { PanelApi, problemText, serverBaseFromPanelUrl, type HubCreate, type HubView, type Problem } from "./panel-api";
import { actionOutcome, hubDisplayName } from "./panel-state";
import { hubContextFor, type HubContext } from "./panel-context";
import { hashFor, hubRoute, parseRoute, routeScope, toolRoute, type HubTab, type Route, type ToolPage } from "./panel-route";
import { connectivityFor, dockModel, hasDirtyDraft, selectedHub, selectedRuntime } from "./panel-selectors";
import { PanelStore, type PanelSnapshot } from "./panel-store";
import { PanelStream } from "./panel-stream";
import { PANEL_BASE_CSS } from "./panel-styles";
import type { SbPanelEntityEditor } from "./views/entity-editor-base";
import type { SbPanelWifiDevices } from "./views/wifi-devices-view";

export const PANEL_TAG = "sofabaton-server-panel";

const README = "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/README.md";
const DOC_LINKS: Record<HubTab, DockLink> = {
  hub: { href: `${README}#control-panel`, label: "Control panel docs" },
  backup: { href: `${README}#ir-payloads-backup-restore`, label: "Backup and restore docs" },
  remote: { href: `${README}#web-remote`, label: "Web remote docs" },
  wifi: { href: `${README}#wifi-commands`, label: "Wifi Commands docs" },
};

function storageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class SofabatonServerPanel extends LitElement {
  static properties = {
    _snapshot: { state: true },
    _pickerOpen: { state: true },
    _cogOpen: { state: true },
    _backupDirty: { state: true },
    _wifiDirty: { state: true },
    _pickerManual: { state: true },
    _pickerActionsHubId: { state: true },
    _pickerConfirmRemove: { state: true },
    _pickerBusy: { state: true },
    _pickerAdding: { state: true },
    _pickerScanning: { state: true },
    _pickerError: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; min-height: 100%; background: var(--sbp-bg); container-type: inline-size; }
      .page {
        --dock-surface: linear-gradient(180deg, color-mix(in srgb, var(--sbp-accent) 8%, var(--sbp-panel)), color-mix(in srgb, var(--sbp-accent) 4%, var(--sbp-panel)));
        --page-gutter: 16px;
        max-width: 1040px; min-height: 100dvh; margin: 0 auto;
        padding: 0 var(--page-gutter) calc(var(--bottom-dock-height, 56px) + 16px);
      }
      button:focus-visible, a:focus-visible { outline: 2px solid var(--sbp-accent); outline-offset: -3px; }

      /* -- top dock -------------------------------------------------------- */
      /* The dock's lower band, where the subtab row sits, shares the page's background with the area under it; only the two tab rows carry the panel colour. */
      .top-dock { position: sticky; top: 0; z-index: 40; margin: 0 calc(-1 * var(--page-gutter)); padding: env(safe-area-inset-top, 0px) var(--page-gutter) 0; background: var(--sbp-bg); }
      .top-row { position: relative; display: flex; align-items: center; gap: 12px; min-height: 48px; margin: 0 calc(-1 * var(--page-gutter)); padding: 6px var(--page-gutter); background: var(--dock-surface); border-bottom: 1px solid var(--sbp-line); }
      .brand { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      .brand b { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; white-space: nowrap; }
      .brand-caption { color: var(--sbp-muted); font-size: 11px; white-space: nowrap; }
      .picker-slot { flex: 1 1 auto; min-width: 0; display: flex; justify-content: flex-end; }
      .stream { display: inline-flex; align-items: center; gap: 6px; color: var(--sbp-muted); font-size: 11px; }

      .hub-picker { position: relative; max-width: 100%; }
      .hub-picker-btn { display: flex; align-items: center; gap: 6px; max-width: min(100%, 360px); min-height: 36px; border: 1px solid var(--sbp-line); border-radius: 999px; padding: 0 12px 0 10px; background: var(--sbp-panel); color: var(--sbp-text); user-select: none; }
      button.hub-picker-btn { cursor: pointer; }
      button.hub-picker-btn:hover, button.hub-picker-btn.is-open { border-color: var(--sbp-accent); }
      .chip-prefix { flex: 0 0 auto; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sbp-muted); }
      .chip-name { font-size: 12px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .chip-arrow { flex: 0 0 auto; width: 16px; height: 16px; color: var(--sbp-muted); }

      .menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 40; display: flex; flex-direction: column; min-width: 220px; max-width: calc(100vw - 48px); max-height: calc(100dvh - 160px); overflow-y: auto; overscroll-behavior: contain; padding: 4px 0; background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: var(--sbp-radius); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18); }
      .menu-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 8px 14px; border: 0; border-radius: 0; background: transparent; text-align: left; white-space: normal; }
      .menu-item:hover { background: var(--sbp-panel-2); border-color: transparent; }
      .menu-item.selected { background: rgba(var(--sbp-accent-rgb), 0.12); }
      .menu-main { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 3px; }
      .menu-title { font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
      .menu-sub { font-size: 11px; color: var(--sbp-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .menu-sep { border-top: 1px solid var(--sbp-line); margin: 4px 0; }
      .badge { display: inline-block; min-width: 18px; padding: 0 5px; border-radius: 9px; background: var(--sbp-panel-2); color: var(--sbp-muted); font-size: 11px; text-align: center; font-weight: 500; }

      .tabs { display: flex; align-items: stretch; gap: 2px; min-width: 0; margin: 0 calc(-1 * var(--page-gutter)); padding: 0 var(--page-gutter); border-bottom: 1px solid var(--sbp-line); background: var(--sbp-panel); }
      .tabs-scroll { display: flex; gap: 2px; flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; }
      .tabs-scroll::-webkit-scrollbar { display: none; }
      .tab-btn { position: relative; flex: 0 0 auto; border: 0; border-radius: 0; background: transparent; color: var(--sbp-muted); font-size: 14px; font-weight: 700; padding: 12px 16px; user-select: none; }
      .tab-btn:hover { color: var(--sbp-text); border-color: transparent; }
      .tab-btn.active { color: var(--sbp-text); box-shadow: inset 0 -3px 0 var(--sbp-accent); }
      .tab-menu { position: relative; flex: 0 0 auto; margin-left: auto; display: flex; }
      .tab-btn--menu { display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 8px 12px 8px 10px; min-width: 44px; }
      .tab-btn--menu.is-open { color: var(--sbp-accent); }
      .cog-icon { width: 20px; height: 20px; }
      .page { --connected-inline: 16px; --connected-radius: 21px; }
      .subtabs { display: flex; align-items: stretch; min-height: 36px; overflow-x: auto; scrollbar-width: none; margin: 10px var(--connected-inline) 0; border: 1px solid color-mix(in srgb, var(--sbp-line) 84%, transparent); border-radius: var(--connected-radius) var(--connected-radius) 0 0; overflow: hidden; background: linear-gradient(180deg, color-mix(in srgb, var(--sbp-panel) 96%, transparent), color-mix(in srgb, var(--sbp-panel-2) 68%, transparent)); box-shadow: 0 1px 0 rgba(255, 255, 255, 0.5); }
      .subtabs::-webkit-scrollbar { display: none; }
      .subtab-btn { flex: 1 1 0; min-width: 0; min-height: 36px; padding: 0 16px; border: 0; border-right: 1px solid color-mix(in srgb, var(--sbp-line) 86%, transparent); border-radius: 0; background: transparent; color: color-mix(in srgb, var(--sbp-muted) 88%, var(--sbp-text) 12%); font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; }
      .subtab-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
      .subtab-icon { width: 18px; height: 18px; flex: 0 0 auto; }
      .subtab-count { flex: 0 0 auto; padding: 0 5px; border: 1px solid var(--sbp-line); border-radius: 999px; font-size: 9px; font-weight: 700; line-height: 1.2; background: color-mix(in srgb, var(--sbp-panel) 92%, transparent); }
      .subtab-btn:last-child { border-right: 0; }
      .subtab-btn:hover { color: var(--sbp-text); background: rgba(var(--sbp-accent-rgb), 0.05); }
      .subtab-btn.active { color: var(--sbp-text); background: transparent; box-shadow: inset 0 -3px 0 var(--sbp-accent); }

      /* -- the view and its scrim ------------------------------------------- */
      .view { position: relative; margin: 0 var(--connected-inline) 16px; min-height: 40vh; border: 1px solid color-mix(in srgb, var(--sbp-line) 84%, transparent); border-top: 0; border-radius: 0 0 var(--connected-radius) var(--connected-radius); background: radial-gradient(circle at top center, rgba(var(--sbp-accent-rgb), 0.05), transparent 48%), var(--sbp-panel); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.03); }
      .stage { min-width: 0; padding: 12px 16px 16px; }
      /* No filter here: it would make the stage the containing block of the views' fixed dialogs and clip them. */
      .stage[inert] { opacity: 0.5; pointer-events: none; }
      .scrim { position: absolute; inset: 0; z-index: 20; display: flex; align-items: flex-start; justify-content: center; padding-top: 40px; }
      .scrim-card { max-width: 420px; padding: 14px 18px; background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: var(--sbp-radius); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14); text-align: center; }
      .scrim-card b { display: block; font-size: 14px; margin-bottom: 4px; }
      .scrim-card .hint { font-size: 12px; }

      /* -- bottom dock -------------------------------------------------------- */
      /* The dock is the column's width, centred like it, not the viewport's. */
      .dock { position: fixed; left: 0; right: 0; bottom: 0; margin-inline: auto; max-width: 1040px; z-index: 30; background: var(--dock-surface); border-top: 1px solid var(--sbp-line); padding-bottom: env(safe-area-inset-bottom, 0px); box-shadow: 0 -3px 8px rgba(0, 0, 0, 0.03); overflow: hidden; }
      .dock-inner { min-height: 48px; padding: 6px var(--page-gutter); display: flex; align-items: center; gap: 16px; }
      .dock-center { flex: 1 1 auto; min-width: 0; display: flex; justify-content: center; align-items: center; font-size: 12px; line-height: 1.5; }
      .dock-status { min-width: 0; overflow-wrap: anywhere; max-height: 30dvh; overflow-y: auto; }
      .dock-detail { color: var(--sbp-muted); }
      .dock-link { font-size: 12px; color: var(--sbp-muted); text-decoration: none; }
      .dock-link:hover { color: var(--sbp-accent); }
      .dock-actions { display: flex; align-items: center; gap: 6px; }
      .dock-action { flex: 0 0 auto; min-height: 36px; }
      .dock--success, .dock--message { --dock-surface: color-mix(in srgb, var(--sbp-ok) 8%, var(--sbp-panel)); border-top-color: color-mix(in srgb, var(--sbp-ok) 40%, var(--sbp-line)); }
      .dock--error { --dock-surface: color-mix(in srgb, var(--sbp-err) 8%, var(--sbp-panel)); border-top-color: color-mix(in srgb, var(--sbp-err) 40%, var(--sbp-line)); }
      .dock--warn, .dock--dirty { --dock-surface: color-mix(in srgb, var(--sbp-warn) 8%, var(--sbp-panel)); border-top-color: color-mix(in srgb, var(--sbp-warn) 40%, var(--sbp-line)); }
      .dock--running .dock-status { color: var(--sbp-accent); font-weight: 600; }
      .dock--success .dock-status, .dock--message .dock-status { color: var(--sbp-ok); }
      .dock--error .dock-status { color: var(--sbp-err); }
      .dock--warn .dock-status { color: var(--sbp-text); }
      .dock--dirty .dock-status { color: var(--sbp-text); font-weight: 600; }
      .dock--neutral .dock-status, .dock--gate .dock-status, .dock--info .dock-status { color: var(--sbp-muted); }
      .dock-right { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; }
      .dock-pill-pair { display: inline-flex; flex: 0 0 auto; border: 1px solid var(--sbp-line); border-radius: 999px; overflow: hidden; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; background: var(--sbp-panel); }
      .dock-pill-half { padding: 4px 9px; color: var(--sbp-muted); }
      .dock-pill-half.on { background: rgba(var(--rgb-success-color, 67, 160, 71), 0.16); color: var(--sbp-ok); }
      .dock-pill-half + .dock-pill-half { border-left: 1px solid var(--sbp-line); }
      .dock-inner { position: relative; }
      .dock-progress { position: absolute; top: -1px; left: 0; height: 3px; border-radius: 2px; background: linear-gradient(90deg, rgba(var(--sbp-accent-rgb), 0.6), var(--sbp-accent) 45%, rgba(var(--sbp-accent-rgb), 0.75) 55%, var(--sbp-accent)); box-shadow: 0 0 8px rgba(var(--sbp-accent-rgb), 0.7); transition: width 180ms ease; animation: dockProgressPulse 1.4s ease-in-out infinite; }
      .dock-progress[data-indeterminate="true"] { width: 35% !important; animation: dockProgressIndeterminate 1.2s ease-in-out infinite, dockProgressPulse 1.4s ease-in-out infinite; }
      @keyframes dockProgressIndeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
      @keyframes dockProgressPulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
      /* A press on the physical remote: one soft accent band sweeps the dock left to right, as in the HA card. */
      .dock-flash { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
      .dock-flash::before { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 38%; background: linear-gradient(90deg, transparent 0%, rgba(var(--sbp-accent-rgb), 0.22) 35%, rgba(var(--sbp-accent-rgb), 0.38) 50%, rgba(var(--sbp-accent-rgb), 0.22) 65%, transparent 100%); transform: translateX(-100%); animation: dockPressWipe 720ms cubic-bezier(0.22, 0.61, 0.36, 1) 1 forwards; }
      @keyframes dockPressWipe { 0% { transform: translateX(-100%); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translateX(280%); opacity: 0; } }
      .stream.lost { color: var(--sbp-warn); }
      @media (prefers-reduced-motion: reduce) {
        .dock-progress, .dock-progress[data-indeterminate="true"] { animation: none; }
        .dock-flash::before { animation: none; opacity: 0; }
      }

      /* -- narrow ------------------------------------------------------------- */
      @container (max-width: 600px) {
        .brand-caption { display: none; }
        .page { --page-gutter: 12px; }
        .top-row { gap: 8px; }
        .brand b { font-size: 10px; letter-spacing: 0.06em; }
        .hub-picker-btn { min-height: 40px; padding-inline: 9px; }
        .tab-btn { padding-inline: 6px; }
        .tabs-scroll { gap: 0; }
        .page { --connected-inline: 12px; }
        .subtabs { min-height: 34px; margin-top: 7px; }
        /* Narrow: the label gets every pixel, as on the card; the icon is decorative. */
        .subtab-icon { display: none; }
        .subtab-btn { min-height: 34px; padding-inline: 8px; gap: 4px; letter-spacing: 0.04em; }
        .subtab-count { padding: 1px 5px; }
        .stage { padding: 12px 12px 12px; }
        .dock-inner { gap: 8px; }
        .dock:has(.dock-actions) .dock-inner { flex-direction: column; align-items: stretch; padding-block: 8px; }
        .dock:has(.dock-actions) .dock-center { justify-content: flex-start; }
        .dock:has(.dock-actions) .dock-right { justify-content: space-between; }
        .dock-action { min-height: 40px; }
        .view { padding-top: 12px; }
      }
    `,
    HUB_PICKER_CSS,
  ];

  readonly api: PanelApi;
  readonly stream: PanelStream;
  readonly store: PanelStore;
  private _snapshot: PanelSnapshot;
  private _pickerOpen = false;
  private _cogOpen = false;
  /** The Backup tab's Edit section holds edits only a download keeps (its sb-backup-dirty). */
  private _backupDirty = false;
  /** The Wifi Devices view holds unsynced edits (its sb-view-dirty); leaving it asks first. */
  private _wifiDirty = false;
  private _pickerManual = false;
  private _pickerActionsHubId: string | null = null;
  private _pickerConfirmRemove: string | null = null;
  private _pickerBusy = new Set<string>();
  private _pickerAdding = false;
  private _pickerScanning = false;
  private _pickerError: string | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _dockObserver: ResizeObserver | null = null;
  private readonly _onHashChange = () => {
    const parsed = parseRoute(location.hash);
    if (parsed) this.store.navigate(parsed, { replace: true });
    else this._syncHash();
  };
  private readonly _onDocumentClick = (event: Event) => {
    if (!this._pickerOpen && !this._cogOpen) return;
    const path = event.composedPath();
    const inside = (id: string) => {
      const el = this.renderRoot.querySelector(`#${id}`);
      return Boolean(el && path.includes(el));
    };
    if (this._pickerOpen && !inside("hub-picker")) this._pickerOpen = false;
    if (this._cogOpen && !inside("cog")) this._cogOpen = false;
  };
  private readonly _onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      if (this._pickerOpen) this.renderRoot.querySelector<HTMLButtonElement>("#hub-picker-btn")?.focus();
      this._pickerOpen = false;
      this._cogOpen = false;
    }
  };

  constructor() {
    super();
    this.api = new PanelApi(serverBaseFromPanelUrl(location.href));
    this.stream = new PanelStream({ apiRoot: this.api.apiRoot });
    this.store = new PanelStore({ api: this.api, stream: this.stream, storage: storageOrNull(), initialRoute: parseRoute(location.hash) });
    this._snapshot = this.store.snapshot;
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = this.store.subscribe((snapshot) => {
      this._snapshot = snapshot;
      this._applyTheme();
      this._syncHash();
    });
    this._applyTheme();
    this._syncHash();
    window.addEventListener("hashchange", this._onHashChange);
    document.addEventListener("click", this._onDocumentClick);
    document.addEventListener("keydown", this._onKeyDown);
    this.store.connect();
    void this.updateComplete.then(() => {
      if (!this.isConnected) return;
      this._dockObserver?.disconnect();
      this._dockObserver = new ResizeObserver((entries) => {
        // Notices can wrap, actions can take a second row, and safe-area
        // padding varies by device. Reserve the actual height, not a guess.
        // The top dock's height is what a view's sticky headers (the Hub
        // tab's open drawer) pin under, since the page scrolls under it.
        for (const entry of entries) {
          const height = entry.borderBoxSize[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
          this.style.setProperty(entry.target.id === "top-dock" ? "--top-dock-height" : "--bottom-dock-height", `${height}px`);
        }
      });
      for (const id of ["#bottom-dock", "#top-dock"]) {
        const dock = this.renderRoot.querySelector(id);
        if (dock) this._dockObserver.observe(dock);
      }
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this._onHashChange);
    document.removeEventListener("click", this._onDocumentClick);
    document.removeEventListener("keydown", this._onKeyDown);
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._dockObserver?.disconnect();
    this._dockObserver = null;
    this.store.disconnect();
  }

  // -- state --------------------------------------------------------------------

  get selectedHub(): HubView | null {
    return selectedHub(this._snapshot);
  }

  get route(): Route {
    return this._snapshot.route;
  }

  private _syncHash(): void {
    const want = hashFor(this._snapshot.route);
    if (location.hash === want) return;
    if (this._snapshot.routeReplace) history.replaceState(null, "", want);
    else location.hash = want;
  }

  private _applyTheme(): void {
    // The palette pins light or dark with data-theme on <html>; "auto" removes it.
    const theme = this._snapshot.theme;
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  }

  /** Leaving the draft's screen or its hub with unsaved work asks first (decision 8); nothing is lost either way.
   *  An open editor asks with the card's own "Unsynced changes" dialog and finishes the move itself (device editor plan, decision 3). */
  private _confirmLeave(target: { hubId?: string | null; route?: Route }): boolean {
    if (this._wifiDirty && this._snapshot.route.kind === "hub" && this._snapshot.route.tab === "wifi") {
      // The draft lives in the view: the view asks (the card's dialog) and finishes the move itself.
      const current = this._snapshot.route;
      const staying = target.route?.kind === "hub" && target.route.tab === "wifi" && target.route.item === current.item && target.hubId === undefined;
      const view = this.renderRoot.querySelector<SbPanelWifiDevices>("sb-panel-wifi-devices");
      if (!staying && view && view.hasUnsyncedChanges()) {
        view.askToLeave(() => {
          this._wifiDirty = false;
          if (target.route) this.store.navigate(target.route);
          else if (target.hubId !== undefined) this.store.selectHub(target.hubId);
        });
        return false;
      }
    }
    const runtime = selectedRuntime(this._snapshot);
    if (!runtime || !hasDirtyDraft(runtime)) return true;
    const scope = runtime.draft!.scope;
    const current = this._snapshot.route;
    const currentScope = current.kind === "hub" ? routeScope(current) : null;
    if (currentScope !== scope) return true;                       // not on the draft's screen: nothing to interrupt
    const leavingHub = target.hubId !== undefined && target.hubId !== runtime.hub.hub_id;
    const targetScope = target.route ? routeScope(target.route) : null;
    const leavingScope = targetScope !== null && targetScope !== scope;
    if (!leavingHub && !leavingScope) return true;
    const editor = this.renderRoot.querySelector<SbPanelEntityEditor>("sb-panel-device-editor, sb-panel-activity-editor");
    if (editor && editor.hasUnsyncedChanges()) {
      editor.askToLeave(() => {
        if (target.route) this.store.navigate(target.route);
        else if (target.hubId !== undefined) this.store.selectHub(target.hubId);
      });
      return false;
    }
    return confirm("You have unsaved changes here. They are kept for when you come back.\n\nLeave anyway?");
  }

  private _go(route: Route): void {
    this._pickerOpen = false;
    this._cogOpen = false;
    if (!this._confirmLeave({ route })) return;
    this.store.navigate(route);
  }

  private _goTab(tab: HubTab): void {
    const current = this._snapshot.route;
    const sub = current.kind === "hub" && current.tab === tab ? current.sub : undefined;
    this._go(hubRoute(null, tab, sub));
  }

  private _goSub(sub: string): void {
    const current = this._snapshot.route;
    this._go(current.kind === "hub" ? hubRoute(null, current.tab, sub) : toolRoute(current.page, sub));
  }

  private _goPage(page: ToolPage): void {
    this._go(toolRoute(page));
  }

  // -- hub picker ---------------------------------------------------------------------

  private _togglePicker(): void {
    this._pickerOpen = !this._pickerOpen;
    this._cogOpen = false;
    if (this._pickerOpen) {
      this._pickerManual = false;
      this._pickerActionsHubId = null;
      this._pickerConfirmRemove = null;
      this._pickerError = null;
      void this.store.refreshSeen();
      void this._scanPicker();
    }
  }

  private _pickerMessage(text: string, ok = true): void {
    this._pickerError = ok ? null : text;
    this.store.say(text, ok);
  }

  private async _scanPicker(): Promise<void> {
    if (this._pickerScanning) return;
    this._pickerScanning = true;
    this._pickerError = null;
    try {
      const response = await this.api.scan(5);
      if (!response.ok) this._pickerMessage(problemText(response), false);
      await this.store.refreshSeen();
    } catch (err) {
      this._pickerMessage(`Could not scan for hubs: ${String(err)}`, false);
    } finally {
      this._pickerScanning = false;
    }
  }

  private async _pickerAct(hub: HubView, action: HubAction): Promise<void> {
    const id = hub.hub_id;
    if (this._pickerBusy.has(id)) return;
    // Removal asks inline first (never a native confirm(): suppressed
    // dialogs answer "cancel" silently); the confirm button calls back here.
    if (action === "remove" && this._pickerConfirmRemove !== id) {
      this._pickerConfirmRemove = id;
      return;
    }
    this._pickerBusy = new Set(this._pickerBusy).add(id);
    this._pickerError = null;
    try {
      const response = action === "remove" ? await this.api.removeHub(id) : action === "enable" ? await this.api.enableHub(id) : await this.api.disableHub(id);
      this._pickerMessage(`${hubDisplayName(hub)}: ${response.ok ? actionOutcome(action, hub) : problemText(response)}`, response.ok);
      await this.store.refreshAll();
      if (response.ok && action === "remove") {
        this._pickerActionsHubId = null;
        await this.updateComplete;
        this.renderRoot.querySelector<HTMLButtonElement>("#hub-picker-btn")?.focus();
      }
    } catch (err) {
      this._pickerMessage(String(err), false);
      await this.store.refreshAll();
    } finally {
      const busy = new Set(this._pickerBusy);
      busy.delete(id);
      this._pickerBusy = busy;
      if (action === "remove") this._pickerConfirmRemove = null;
    }
  }

  private async _pickerAdd(body: HubCreate): Promise<void> {
    if (this._pickerAdding) return;
    const selectionBefore = this._snapshot.selectedHubId;
    const routeBefore = hashFor(this._snapshot.route);
    this._pickerAdding = true;
    this._pickerError = null;
    try {
      const response = await this.api.addHub(body);
      let hubId: string | null = null;
      if (response.status === 201 && response.body) {
        hubId = response.body.hub_id;
        this._pickerMessage(`added ${hubId}${response.body.enabled ? "" : " (disabled)"}`);
      } else if (response.status === 503 && (response.body as unknown as Problem | null)?.type === "hub_start_failed") {
        const problem = response.body as unknown as Problem;
        hubId = problem.hub_id || body.host;
        this._pickerMessage(`${hubId} is registered but its proxy did not start: ${problem.detail ?? ""}. Fix the cause and press Retry start.`, false);
        this._pickerActionsHubId = hubId;
      } else {
        this._pickerMessage(problemText(response), false);
      }
      await this.store.refreshAll();
      if (hubId) {
        const registrationId = hubId;
        // Initial sync may have re-keyed an address registration before the list returned.
        hubId = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId || r.hub.config.host === body.host)?.hub.hub_id ?? hubId;
        this._pickerManual = false;
        if (this._pickerActionsHubId === registrationId) this._pickerActionsHubId = hubId;
        // Respect both unsaved work and navigation made while registration was pending.
        if ((!selectionBefore || this._snapshot.selectedHubId === selectionBefore) && hashFor(this._snapshot.route) === routeBefore) {
          if (this._confirmLeave({ hubId })) this.store.selectHub(hubId);
          else this._pickerOpen = false;
        }
        await this.updateComplete;
        const target = Array.from(this.renderRoot.querySelectorAll<HTMLButtonElement>(".hub-option")).find((el) => el.dataset.hub === hubId);
        target?.focus();
      }
    } catch (err) {
      this._pickerMessage(String(err), false);
      await this.store.refreshAll();
    } finally {
      this._pickerAdding = false;
    }
  }

  private _pickerSubmit(event: Event): void {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const host = String(values.get("host") ?? "").trim();
    if (!host) return;
    const name = String(values.get("name") ?? "").trim();
    void this._pickerAdd({ host, ...(name ? { name } : {}), enabled: !values.has("disabled") });
  }

  private async _showManual(show: boolean): Promise<void> {
    this._pickerManual = show;
    this._pickerError = null;
    await this.updateComplete;
    this.renderRoot.querySelector<HTMLElement>(show ? "#add-host" : "#hub-picker-manual")?.focus();
  }

  private async _pickerKeyDown(event: KeyboardEvent): Promise<void> {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || event.target instanceof HTMLInputElement) return;
    event.preventDefault();
    if (!this._pickerOpen) this._togglePicker();
    await this.updateComplete;
    const buttons = Array.from(this.renderRoot.querySelectorAll<HTMLButtonElement>("#hub-picker-menu button:not(:disabled)"));
    if (!buttons.length) return;
    const current = buttons.indexOf((this.renderRoot as ShadowRoot).activeElement as HTMLButtonElement);
    const index = event.key === "Home" ? 0 : event.key === "End" || (current < 0 && event.key === "ArrowUp") ? buttons.length - 1 :
      (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].focus();
  }

  // -- events from the views -----------------------------------------------------------

  private _onMessage(event: CustomEvent<{ text: string; ok: boolean }>): void {
    this.store.say(event.detail.text, event.detail.ok);
  }

  private _onHubsChanged(): void {
    void this.store.refreshAll();
  }

  private _onSelectHub(event: CustomEvent<{ hubId: string }>): void {
    this.store.selectHub(event.detail.hubId);
    void this.store.refreshHubs();
  }

  private _onNavigate(event: CustomEvent<{ tab?: HubTab; sub?: string; page?: ToolPage; entity?: number; item?: string }>): void {
    const d = event.detail;
    if (d.page) this._go(toolRoute(d.page));
    else if (d.tab) this._go(hubRoute(null, d.tab, d.sub, d.entity, d.item));
  }

  // -- render ---------------------------------------------------------------------------

  private _renderView(ctx: HubContext): TemplateResult {
    const s = this._snapshot;
    const route = s.route;
    if (route.kind === "tool") {
      switch (route.page) {
        case "server":
          return html`<sb-panel-server .api=${this.api} .info=${s.server.info} .error=${s.server.error} .reachable=${s.server.reachable} .streamOn=${s.stream.connected} .hubCount=${s.hubs.length}></sb-panel-server>`;
        case "debug":
          return route.sub === "events"
            ? html`<sb-panel-events .stream=${this.stream}></sb-panel-events>`
            : html`<sb-panel-api .api=${this.api} .ctx=${ctx} .operations=${s.operations} @sb-request-sent=${() => void this.store.refreshAll()}></sb-panel-api>`;
        default:
          return html`<sb-panel-hubs .api=${this.api} .ctx=${ctx} .hubs=${s.hubs.map((r) => r.hub)} @sb-open-picker=${() => { if (!this._pickerOpen) this._togglePicker(); }}></sb-panel-hubs>`;
      }
    }
    switch (route.tab) {
      case "backup":
        return html`<sb-panel-backup .ctx=${ctx} .store=${this.store} .section=${route.sub} @sb-backup-dirty=${(event: CustomEvent<{ dirty: boolean }>) => { this._backupDirty = Boolean(event.detail?.dirty); }}></sb-panel-backup>`;
      case "wifi":
        return html`<sb-panel-wifi-devices .api=${this.api} .ctx=${ctx} .deviceKey=${route.item ?? null} @sb-view-dirty=${(event: CustomEvent<{ dirty: boolean }>) => { this._wifiDirty = Boolean(event.detail?.dirty); }}></sb-panel-wifi-devices>`;
      case "remote":
        return html`<sb-panel-remote .api=${this.api} .ctx=${ctx} .section=${route.sub}></sb-panel-remote>`;
      default:
        if (route.entity !== undefined && route.sub === "devices") {
          return html`<sb-panel-device-editor .api=${this.api} .ctx=${ctx} .store=${this.store} .deviceId=${route.entity}></sb-panel-device-editor>`;
        }
        if (route.entity !== undefined && route.sub === "activities") {
          return html`<sb-panel-activity-editor .api=${this.api} .ctx=${ctx} .store=${this.store} .activityId=${route.entity}></sb-panel-activity-editor>`;
        }
        return html`<sb-panel-catalog .api=${this.api} .ctx=${ctx} .kind=${route.sub === "activities" ? "activity" : "device"}></sb-panel-catalog>`;
    }
  }

  render(): TemplateResult {
    const s = this._snapshot;
    const ctx = hubContextFor(s, this.api);
    const runtime = selectedRuntime(s);
    const route = s.route;
    const viewId = route.kind === "tool" ? `${route.page}-${route.sub}` : route.tab;
    // An unavailable hub puts the view under the scrim. A busy hub does not (the HA card's way): the
    // views lock their own controls, the view that started the job shows it, and the dock narrates it.
    const unavailable = ctx.interaction.kind === "blocked" && ctx.interaction.reason !== "job" && ctx.interaction.reason !== "local";
    const blocked = route.kind === "hub" && ctx.hub !== null && unavailable && ctx.interaction.kind === "blocked" ? ctx.interaction : null;
    const streamOn = s.stream.connected;
    // The stream down while REST answers: a hint, nothing blocked (decision 13).
    const streamLost = !streamOn && s.server.reachable && s.listLoaded;
    return html`
      <div class="page">
        <header class="top-dock" id="top-dock">
          <div class="top-row">
            <div class="brand"><span class="stream ${streamLost ? "lost" : ""}" id="stream-state" role="img" aria-label=${streamOn ? "Event stream live" : streamLost ? "Live updates paused, reconnecting" : "Event stream off, reconnecting"} title=${streamOn ? "Event stream live" : streamLost ? "Live updates paused, reconnecting" : "Event stream off, reconnecting"}><span class="dot ${streamOn ? "ok" : streamLost ? "warn" : "off"}" id="ws-dot"></span></span><b>Sofabaton X</b><span class="brand-caption">control panel</span></div>
            <div class="picker-slot">
              ${renderHubPicker({
                hubs: s.hubs,
                seen: s.seen,
                selectedHubId: s.selectedHubId,
                open: this._pickerOpen,
                manual: this._pickerManual,
                actionsHubId: this._pickerActionsHubId,
                confirmRemoveHubId: this._pickerConfirmRemove,
                busy: this._pickerBusy,
                adding: this._pickerAdding,
                scanning: this._pickerScanning,
                error: this._pickerError,
                onToggle: () => this._togglePicker(),
                onSelect: (hubId) => {
                  // A tool page (setup, the API console) is per hub too: stay on it.
                  this._pickerOpen = false;
                  if (!this._confirmLeave({ hubId })) return;
                  this.store.selectHub(hubId);
                },
                onActions: (hubId) => {
                  this._pickerActionsHubId = this._pickerActionsHubId === hubId ? null : hubId;
                  this._pickerConfirmRemove = null;
                },
                onAction: (hub, action) => void this._pickerAct(hub, action),
                onConfirmRemove: (hubId) => { this._pickerConfirmRemove = hubId; },
                onAdd: (seen) => void this._pickerAdd({ ...seen.config, enabled: true }),
                onManual: (show) => void this._showManual(show),
                onSubmit: (event) => this._pickerSubmit(event),
                onScan: () => void this._scanPicker(),
                onKeyDown: (event) => void this._pickerKeyDown(event),
              })}
            </div>
          </div>
          ${renderTabBar({
            route,
            cogOpen: this._cogOpen,
            theme: s.theme,
            eventCount: s.stream.messageCount,
            subCounts: route.kind === "hub" && route.tab === "hub" && ctx.hub?.status
              ? { activities: ctx.hub.status.activities_cached, devices: ctx.hub.status.devices_cached }
              : undefined,
            onTab: (tab) => this._goTab(tab),
            onSub: (sub) => this._goSub(sub),
            onToggleCog: () => {
              this._cogOpen = !this._cogOpen;
              this._pickerOpen = false;
            },
            onPage: (page) => this._goPage(page),
            onTheme: () => this.store.cycleTheme(),
          })}
        </header>
        <main class="view" id="view-${viewId}" @sb-message=${this._onMessage} @sb-hubs-changed=${this._onHubsChanged} @sb-select-hub=${this._onSelectHub} @sb-navigate=${this._onNavigate}>
          <div class="stage" id="stage-wrap" ?inert=${Boolean(blocked)}>${this._renderView(ctx)}</div>
          ${blocked
            ? html`<div class="scrim" id="blocked-scrim"><div class="scrim-card"><b>Hub unavailable</b><div class="hint">${blocked.label}</div></div></div>`
            : nothing}
        </main>
        ${renderBottomDock({
          model: dockModel(s, runtime, { unsavedBackup: this._backupDirty, unsyncedWifi: this._wifiDirty && route.kind === "hub" && route.tab === "wifi" }),
          message: s.message,
          connectivity: connectivityFor(runtime),
          hasHub: ctx.hub !== null,
          press: runtime?.lastPress ?? null,
          docLink: route.kind === "hub" ? DOC_LINKS[route.tab] : null,
          onDismiss: () => {
            if (s.selectedHubId) this.store.dismissNotice(s.selectedHubId);
          },
          onCancel: () => {
            if (s.selectedHubId) void this.store.cancelActiveJob(s.selectedHubId);
          },
          onResume: (applyId) => {
            if (s.selectedHubId) void this.store.resumeApply(s.selectedHubId, applyId);
          },
          onDiscard: (applyId) => {
            if (s.selectedHubId && confirm("Discard this stopped apply? Its record is forgotten; the hub is not changed.")) void this.store.discardApply(s.selectedHubId, applyId);
          },
          onKeepDraft: () => {
            if (s.selectedHubId) this.store.keepStaleDraft(s.selectedHubId);
          },
          onDiscardDraft: () => {
            if (s.selectedHubId && confirm("Discard your unsaved changes? The hub is not changed.")) this.store.discardDraft(s.selectedHubId);
          },
        })}
      </div>
    `;
  }
}

export function definePanel(): void {
  if (!customElements.get(PANEL_TAG)) customElements.define(PANEL_TAG, SofabatonServerPanel);
}
