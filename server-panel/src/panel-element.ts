// The control panel's shell (docs/internal/server-panel-state-plan.md,
// decisions 3, 9, 10, 11, 14): one narrow-first column with a sticky top
// dock (brand, hub picker, cog menu, tabs and subtabs), the mounted view
// under a blocked scrim when the hub may not be touched, and the bottom
// dock fixed at the viewport's bottom. It renders the store's snapshot
// and nothing else: the store owns the API client, the event stream,
// the hub list, the selection, the route and the resync points; the
// shell mirrors the route into the URL hash and forwards the views'
// events (sb-message, sb-hubs-changed, sb-select-hub, sb-navigate).

import { LitElement, html, css, nothing, type TemplateResult } from "lit";

import { renderBottomDock, type DockLink } from "./components/bottom-dock";
import { renderHubPicker } from "./components/hub-picker";
import { renderTabBar } from "./components/tab-bar";
import { PanelApi, serverBaseFromPanelUrl, type HubView } from "./panel-api";
import { hubContextFor, type HubContext } from "./panel-context";
import { hashFor, hubRoute, parseRoute, toolRoute, type HubTab, type Route, type ToolPage } from "./panel-route";
import { connectivityFor, dockModel, hasDirtyDraft, selectedHub, selectedRuntime } from "./panel-selectors";
import { PanelStore, type PanelSnapshot } from "./panel-store";
import { PanelStream } from "./panel-stream";
import { PANEL_BASE_CSS } from "./panel-styles";
import type { SbPanelHubs } from "./views/hubs-view";

export const PANEL_TAG = "sofabaton-server-panel";

const README = "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/README.md";
const DOC_LINKS: Record<HubTab, DockLink> = {
  hub: { href: `${README}#control-panel`, label: "Control panel docs" },
  backup: { href: `${README}#ir-payloads-backup-restore`, label: "Backup and restore docs" },
  remote: { href: `${README}#web-remote`, label: "Web remote docs" },
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
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; min-height: 100%; background: var(--sbp-bg); container-type: inline-size; }
      .page { max-width: 1040px; margin: 0 auto; padding: 0 16px calc(72px + env(safe-area-inset-bottom, 0px)); }

      /* -- top dock -------------------------------------------------------- */
      .top-dock { position: sticky; top: 0; z-index: 30; margin: 0 -16px; padding: 0 16px; background: var(--sbp-panel); border-bottom: 1px solid var(--sbp-line); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.03); }
      .top-row { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 4px 0; }
      .brand { display: flex; align-items: baseline; gap: 6px; flex: 0 0 auto; }
      .brand b { font-size: 15px; font-weight: 650; letter-spacing: 0.01em; white-space: nowrap; }
      .brand span { color: var(--sbp-muted); font-size: 12px; white-space: nowrap; }
      .picker-slot { flex: 1 1 auto; min-width: 0; display: flex; justify-content: center; }
      .top-right { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
      .stream { display: inline-flex; align-items: center; gap: 5px; color: var(--sbp-muted); font-size: 12px; }

      .hub-picker { position: relative; max-width: 100%; }
      .hub-picker-btn { display: inline-flex; align-items: center; gap: 6px; max-width: min(100%, 420px); min-height: 32px; border: 1px solid var(--sbp-line); border-radius: 999px; padding: 0 12px 0 10px; background: rgba(var(--sbp-accent-rgb), 0.06); color: var(--sbp-text); user-select: none; }
      button.hub-picker-btn { cursor: pointer; }
      button.hub-picker-btn:hover, button.hub-picker-btn.is-open { border-color: var(--sbp-accent); }
      .hub-picker-btn--static { cursor: default; }
      .chip-prefix { font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sbp-muted); }
      .chip-name { font-size: 13px; font-weight: 700; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .chip-arrow { font-size: 11px; color: var(--sbp-muted); }
      .hub-picker-menu { left: 50%; right: auto; transform: translateX(-50%); }

      .menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 40; display: flex; flex-direction: column; min-width: 220px; max-width: calc(100vw - 24px); padding: 4px 0; background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: var(--sbp-radius); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18); }
      .menu-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 8px 14px; border: 0; border-radius: 0; background: transparent; text-align: left; white-space: normal; }
      .menu-item:hover { background: var(--sbp-panel-2); border-color: transparent; }
      .menu-item.selected { background: rgba(var(--sbp-accent-rgb), 0.12); }
      .menu-main { display: flex; flex-direction: column; min-width: 0; }
      .menu-title { font-size: 13px; font-weight: 600; }
      .menu-sub { font-size: 11px; color: var(--sbp-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .menu-sep { border-top: 1px solid var(--sbp-line); margin: 4px 0; }
      .badge { display: inline-block; min-width: 18px; padding: 0 5px; border-radius: 9px; background: var(--sbp-panel-2); color: var(--sbp-muted); font-size: 11px; text-align: center; font-weight: 500; }

      .tabs { display: flex; align-items: stretch; border-top: 1px solid var(--sbp-line); }
      .tabs-scroll { display: flex; flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; }
      .tabs-scroll::-webkit-scrollbar { display: none; }
      .tab-btn { flex: 0 0 auto; min-height: 44px; padding: 8px 14px; border: 0; border-bottom: 2px solid transparent; border-radius: 0; background: transparent; color: var(--sbp-muted); font-weight: 600; }
      .tab-btn:hover { color: var(--sbp-text); border-color: transparent; border-bottom-color: var(--sbp-line); }
      .tab-btn.active { color: var(--sbp-text); border-bottom-color: var(--sbp-accent); }
      .tab-menu { position: relative; flex: 0 0 auto; margin-left: auto; display: flex; }
      .tab-btn--menu { display: inline-flex; align-items: center; gap: 3px; padding: 8px 10px; }
      .cog-icon { font-size: 18px; line-height: 1; }
      .subtabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 8px 0 10px; }
      .subtabs::-webkit-scrollbar { display: none; }
      .subtab-btn { flex: 0 0 auto; min-height: 36px; padding: 6px 14px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--sbp-muted); font-size: 13px; font-weight: 600; }
      .subtab-btn:hover { color: var(--sbp-text); border-color: var(--sbp-line); }
      .subtab-btn.active { color: var(--sbp-text); background: rgba(var(--sbp-accent-rgb), 0.12); border-color: rgba(var(--sbp-accent-rgb), 0.35); }

      /* -- the view and its scrim ------------------------------------------- */
      .view { position: relative; padding: 16px 0 8px; min-height: 40vh; }
      .stage { min-width: 0; }
      .stage[inert] { opacity: 0.5; filter: saturate(0.5); pointer-events: none; }
      .scrim { position: absolute; inset: 0; z-index: 20; display: flex; align-items: flex-start; justify-content: center; padding-top: 40px; }
      .scrim-card { max-width: 420px; padding: 14px 18px; background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: var(--sbp-radius); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14); text-align: center; }
      .scrim-card b { display: block; font-size: 14px; margin-bottom: 4px; }
      .scrim-card .hint { font-size: 12px; }

      /* -- bottom dock -------------------------------------------------------- */
      /* The dock is the column's width, centred like it, not the viewport's. */
      .dock { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: 100%; max-width: 1040px; z-index: 30; background: var(--sbp-panel); border-top: 1px solid var(--sbp-line); padding-bottom: env(safe-area-inset-bottom, 0px); }
      .dock-inner { min-height: 48px; padding: 6px 16px; display: flex; align-items: center; gap: 10px; }
      .dock-center { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; }
      .dock-status { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .dock-detail { color: var(--sbp-muted); }
      .dock-link { font-size: 12px; color: var(--sbp-muted); text-decoration: none; }
      .dock-link:hover { color: var(--sbp-accent); }
      .dock-action { flex: 0 0 auto; }
      .dock--running .dock-status { color: var(--sbp-accent); font-weight: 600; }
      .dock--success .dock-status, .dock--message .dock-status { color: var(--sbp-ok); }
      .dock--error .dock-status { color: var(--sbp-err); }
      .dock--warn .dock-status { color: var(--sbp-warn); }
      .dock--dirty .dock-status { color: var(--sbp-warn); font-weight: 600; }
      .dock--neutral .dock-status, .dock--gate .dock-status, .dock--info .dock-status { color: var(--sbp-muted); }
      .dock-right { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; }
      .dock-pill-pair { display: inline-flex; border: 1px solid var(--sbp-line); border-radius: 999px; overflow: hidden; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
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
        .brand span, .stream-label { display: none; }
        .view { padding-top: 12px; }
      }
    `,
  ];

  readonly api: PanelApi;
  readonly stream: PanelStream;
  readonly store: PanelStore;
  private _snapshot: PanelSnapshot;
  private _pickerOpen = false;
  private _cogOpen = false;
  private _unsubscribe: (() => void) | null = null;
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
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this._onHashChange);
    document.removeEventListener("click", this._onDocumentClick);
    document.removeEventListener("keydown", this._onKeyDown);
    this._unsubscribe?.();
    this._unsubscribe = null;
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

  /** Leaving the draft's screen or its hub with unsaved work asks first (decision 8); nothing is lost either way. */
  private _confirmLeave(target: { hubId?: string | null; route?: Route }): boolean {
    const runtime = selectedRuntime(this._snapshot);
    if (!runtime || !hasDirtyDraft(runtime)) return true;
    const scope = runtime.draft!.scope;
    const current = this._snapshot.route;
    const currentScope = current.kind === "hub" ? `${current.tab}/${current.sub}` : null;
    if (currentScope !== scope) return true;                       // not on the draft's screen: nothing to interrupt
    const leavingHub = target.hubId !== undefined && target.hubId !== runtime.hub.hub_id;
    const targetScope = target.route ? (target.route.kind === "hub" ? `${target.route.tab}/${target.route.sub}` : `${target.route.page}/${target.route.sub}`) : null;
    const leavingScope = targetScope !== null && targetScope !== scope;
    if (!leavingHub && !leavingScope) return true;
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

  private _goSetup(): void {
    this._goPage("setup");
    void this.updateComplete.then(() => {
      const view = this.renderRoot.querySelector<SbPanelHubs>("sb-panel-hubs");
      view?.focusAddress();
    });
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

  private _onNavigate(event: CustomEvent<{ tab?: HubTab; sub?: string; page?: ToolPage }>): void {
    const d = event.detail;
    if (d.page) this._go(toolRoute(d.page));
    else if (d.tab) this._go(hubRoute(null, d.tab, d.sub));
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
          return html`<sb-panel-hubs .api=${this.api} .ctx=${ctx} .hubs=${s.hubs.map((r) => r.hub)} .seen=${s.seen}></sb-panel-hubs>`;
      }
    }
    switch (route.tab) {
      case "backup":
        return html`<sb-panel-backup .ctx=${ctx} .section=${route.sub}></sb-panel-backup>`;
      case "remote":
        return html`<sb-panel-remote .api=${this.api} .ctx=${ctx} .section=${route.sub}></sb-panel-remote>`;
      default:
        return html`<sb-panel-catalog .api=${this.api} .ctx=${ctx} .kind=${route.sub === "activities" ? "activity" : "device"}></sb-panel-catalog>`;
    }
  }

  render(): TemplateResult {
    const s = this._snapshot;
    const ctx = hubContextFor(s, this.api);
    const runtime = selectedRuntime(s);
    const route = s.route;
    const viewId = route.kind === "tool" ? `${route.page}-${route.sub}` : route.tab;
    const blocked = route.kind === "hub" && ctx.hub !== null && ctx.interaction.kind === "blocked" ? ctx.interaction : null;
    const streamOn = s.stream.connected;
    // The stream down while REST answers: a hint, nothing blocked (decision 13).
    const streamLost = !streamOn && s.server.reachable && s.listLoaded;
    return html`
      <div class="page">
        <header class="top-dock">
          <div class="top-row">
            <div class="brand"><b>Sofabaton X</b><span>control panel</span></div>
            <div class="picker-slot">
              ${renderHubPicker({
                hubs: s.hubs,
                selectedHubId: s.selectedHubId,
                open: this._pickerOpen,
                onToggle: () => {
                  this._pickerOpen = !this._pickerOpen;
                  this._cogOpen = false;
                },
                onSelect: (hubId) => {
                  // A tool page (setup, the API console) is per hub too: stay on it.
                  this._pickerOpen = false;
                  if (!this._confirmLeave({ hubId })) return;
                  this.store.selectHub(hubId);
                },
                onSetup: () => this._goSetup(),
              })}
            </div>
            <div class="top-right">
              <span class="stream ${streamLost ? "lost" : ""}" id="stream-state" title=${streamOn ? "event stream live" : "event stream off, reconnecting"}><span class="dot ${streamOn ? "ok" : streamLost ? "warn" : "off"}" id="ws-dot"></span><span class="stream-label" id="ws-state">${streamOn ? "stream live" : streamLost ? "live updates paused, reconnecting" : "stream off"}</span></span>
            </div>
          </div>
          ${renderTabBar({
            route,
            cogOpen: this._cogOpen,
            theme: s.theme,
            eventCount: s.stream.messageCount,
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
            ? html`<div class="scrim" id="blocked-scrim"><div class="scrim-card"><b>${blocked.reason === "job" || blocked.reason === "local" ? "Hub busy" : "Hub unavailable"}</b><div class="hint">${blocked.label}</div></div></div>`
            : nothing}
        </main>
        ${renderBottomDock({
          model: dockModel(s, runtime),
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
