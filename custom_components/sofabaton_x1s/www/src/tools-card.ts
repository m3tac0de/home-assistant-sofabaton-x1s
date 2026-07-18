import { LitElement, css, html, nothing } from "lit";
import { keyed } from "lit/directives/keyed.js";
import { cardStyles } from "./shared/styles/card-styles";
import type { BackupSectionId, HassLike, HubAction, SettingKey, TabId } from "./shared/ha-context";
import { ControlPanelStore, REFRESH_ALL_KEY } from "./state/control-panel-store";
import {
  hubActivities,
  hubDevices,
  hubConnected,
  hubIcon,
  persistentCacheEnabled,
  hubActiveRefreshLabel,
  hubExternalCommandLabel,
  hubRefreshBusy,
  proxyClientConnected,
  resolveCardGateState,
  resolveRuntimeState,
  resolveTabAvailability,
  selectedHub,
  selectedHubCache,
} from "./shared/utils/control-panel-selectors";
import { renderHubPicker } from "./components/hub-picker";
import { renderTabBar } from "./components/tab-bar";
import { renderSettingsTab } from "./tabs/settings-tab";
import { renderCacheTab } from "./tabs/cache-tab";
import { renderLogsTab } from "./tabs/logs-tab";
import { TOOLS_CARD_STRINGS } from "./strings";
import "./tabs/backup-tab";
import "./tabs/wifi-commands-tab";
import "./tabs/activities-tab";

const TOOLS_TYPE = "sofabaton-control-panel";
const LOG_ONCE_KEY = `__${TOOLS_TYPE}_logged__`;
const EDITOR_TYPE = `${TOOLS_TYPE}-editor`;

declare global {
  interface Window {
    customCards?: Array<Record<string, unknown> & { type: string }>;
  }
}

function resolveLoadedToolsFrontendVersion() {
  const version = new URL(import.meta.url, window.location.href).searchParams.get("v");
  return String(version || "").trim() || "dev";
}

const LOADED_TOOLS_FRONTEND_VERSION = resolveLoadedToolsFrontendVersion();
const TOOLS_VERSION = LOADED_TOOLS_FRONTEND_VERSION;
const DOC_LINKS: Partial<Record<TabId, { href: string; label: string }>> = {
  wifi_commands: {
    href: TOOLS_CARD_STRINGS.docs.wifiCommandsUrl,
    label: TOOLS_CARD_STRINGS.tabDocs.wifi_commands,
  },
  backup: {
    href: TOOLS_CARD_STRINGS.docs.backupUrl,
    label: TOOLS_CARD_STRINGS.tabDocs.backup,
  },
};

function logOnce() {
  const windowWithFlag = window as unknown as Record<string, unknown>;
  if (windowWithFlag[LOG_ONCE_KEY]) return;
  windowWithFlag[LOG_ONCE_KEY] = true;

  const base =
    "padding:2px 10px;" +
    "border-radius:999px;" +
    "font-weight:700;" +
    "font-size:12px;" +
    "line-height:18px;" +
    "border:1px solid transparent;";

  const red = base + "background:#fff;color:#ef4444;border-color:#ef4444;";
  const green = base + "background:#062b12;color:#22c55e;border-color:#22c55e;";
  const yellow = base + "background:#111827;color:#facc15;border-color:#facc15;";
  const blue = base + "background:#fff;color:#3b82f6;border-color:#3b82f6;";
  const gap = "color:transparent;";

  console.log(
    `%cSofabaton%c %c Control %c %c  Panel  %c %c   ${TOOLS_VERSION}   `,
    red,
    gap,
    green,
    gap,
    yellow,
    gap,
    blue,
  );
}

// Compact, self-contained styling for the card-picker / editor preview, which
// renders in a narrow (~330px) tile where the full interactive panel does not fit.
const previewStyles = css`
  .sb-preview {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    box-sizing: border-box;
  }
  .sb-preview-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .sb-preview-logo {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--primary-color);
  }
  .sb-preview-hub {
    width: 52px;
    height: auto;
  }
  .sb-preview-sub {
    font-size: 12px;
    line-height: 1.35;
    color: var(--secondary-text-color);
  }
  .sb-preview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .sb-preview-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
    color: var(--primary-text-color);
    font-size: 12.5px;
    font-weight: 500;
    min-width: 0;
  }
  .sb-preview-chip ha-icon {
    flex: 0 0 auto;
    color: var(--primary-color);
    --mdc-icon-size: 18px;
  }
  .sb-preview-chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

class SofabatonControlPanelCard extends LitElement {
  static styles = [cardStyles, previewStyles];

  // Match the dockIrFlash / dockIrIcon keyframes (720ms). After this we
  // drop the overlay nodes so they don't sit in the DOM forever and so
  // the next animation cleanly restarts via Lit's keyed remount.
  private static readonly _IR_FLASH_DURATION_MS = 720;

  private _config: Record<string, unknown> = {};
  private _preview = false;
  private _snapshot;
  private readonly _store;
  private _hubPickerOpen = false;
  private _toolsMenuOpen = false;
  private _lastRenderedTab: TabId | null = null;
  // Entity currently open in the live editor (wrench buttons in the Hub
  // tab); while set, the Hub tab renders the editor instead of the cache.
  private _editingEntity: { kind: "activity" | "device"; id: number } | null = null;
  // True while an open editor (live activity/device editor or a Wifi
  // Commands device editor) holds changes that only a sync will persist to
  // the hub. Driven by `editor-dirty-changed` events from the tab elements;
  // cleared here on the paths where the emitting element unmounts without
  // getting a chance to send its own dirty=false (tab switch, editor exit,
  // hub switch while the live editor is open).
  private _editorSyncPending = false;
  // Re-order mode ("Change order" under the Activities / Devices list).
  private _reorderMode = false;
  private _reorderKind: "activity" | "device" = "activity";
  private _reorderIds: number[] = [];
  private _reorderSyncing = false;
  private _reorderError: string | null = null;
  // "Add Activity" dialog state.
  private _addActivityOpen = false;
  private _addActivityBusy = false;
  private _addActivityError: string | null = null;
  private _irFlashClearTimer: ReturnType<typeof setTimeout> | null = null;
  private _irFlashClearForReceivedAt: number | null = null;
  private _pendingCacheScrollSnapshot: {
    section: string | null;
    sectionTop: number;
    panelTop: number;
  } | null = null;
  private readonly _boundHandleDocumentPointerDown = (event: PointerEvent) => {
    this.handleDocumentPointerDown(event);
  };

  constructor() {
    super();
    this._store = new ControlPanelStore(
      (snapshot) => {
        this._snapshot = snapshot;
        this.requestUpdate();
      },
      { loadedFrontendVersion: LOADED_TOOLS_FRONTEND_VERSION },
    );
    this._snapshot = this._store.snapshot;
  }

  setConfig(config: Record<string, unknown>) {
    this._config = config || {};
    // When created from a hub-specific entity (card picker), pre-select that hub.
    const hub = typeof this._config.hub === "string" ? this._config.hub.trim() : "";
    this._store.setPreferredHub(hub || null);
  }

  set hass(value: HassLike) {
    this._store.setHass(value);
  }

  // HA's hui-card sets `element.preview = true` when rendering inside the card
  // picker / editor preview. Render a compact branded summary instead of the
  // full interactive panel, and don't open live backend subscriptions.
  set preview(value: boolean) {
    const next = Boolean(value);
    if (next === this._preview) return;
    this._preview = next;
    if (next) {
      this._store.disconnected();
    } else if (this.isConnected) {
      this._store.connected();
    }
    this.requestUpdate();
  }

  get preview() {
    return this._preview;
  }

  getCardSize() {
    return this._preview ? 3 : 8;
  }

  static getConfigElement() {
    return document.createElement(EDITOR_TYPE);
  }

  static getStubConfig() {
    return {
      card_height: 600,
    };
  }

  connectedCallback() {
    super.connectedCallback();
    logOnce();
    document.addEventListener("pointerdown", this._boundHandleDocumentPointerDown, true);
    if (!this._preview) this._store.connected();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._store.disconnected();
    document.removeEventListener("pointerdown", this._boundHandleDocumentPointerDown, true);
    this._hubPickerOpen = false;
    this._toolsMenuOpen = false;
    if (this._irFlashClearTimer) {
      clearTimeout(this._irFlashClearTimer);
      this._irFlashClearTimer = null;
      this._irFlashClearForReceivedAt = null;
    }
  }

  protected willUpdate() {
    if (this._lastRenderedTab === "cache") {
      this._pendingCacheScrollSnapshot = this.captureCacheScrollState();
    }
  }

  protected updated() {
    const pendingEntityKey = this._snapshot.pendingScrollEntityKey;
    if (this._snapshot.selectedTab === "cache") {
      this.restoreCacheScrollState(this._pendingCacheScrollSnapshot, pendingEntityKey);
      this._pendingCacheScrollSnapshot = null;
      if (pendingEntityKey) this._store.clearPendingScrollEntityKey();
    } else {
      this._pendingCacheScrollSnapshot = null;
      if (pendingEntityKey) this._store.clearPendingScrollEntityKey();
    }

    if (this._snapshot.selectedTab === "logs" && this._snapshot.logsStickToBottom) {
      const consoleElement = this.renderRoot.querySelector<HTMLElement>("#logs-console");
      if (consoleElement) consoleElement.scrollTop = consoleElement.scrollHeight;
    }
    const consoleElement = this.renderRoot.querySelector<HTMLElement>("#logs-console");
    if (consoleElement) {
      consoleElement.onscroll = () =>
        this._store.onLogsScrolled({
          top: consoleElement.scrollTop,
          clientHeight: consoleElement.clientHeight,
          scrollHeight: consoleElement.scrollHeight,
        });
    }

    this._lastRenderedTab = this._snapshot.selectedTab;
  }

  private handleDocumentPointerDown(event: PointerEvent) {
    const path = event.composedPath();
    const hubPickerRoot = this.renderRoot.querySelector("#hub-picker-root");
    const toolsMenuRoot = this.renderRoot.querySelector("#tools-tab-menu-root");
    const clickedHubPicker = hubPickerRoot ? path.includes(hubPickerRoot) : false;
    const clickedToolsMenu = toolsMenuRoot ? path.includes(toolsMenuRoot) : false;

    let changed = false;
    if (this._hubPickerOpen && !clickedHubPicker) {
      this._hubPickerOpen = false;
      changed = true;
    }
    if (this._toolsMenuOpen && !clickedToolsMenu) {
      this._toolsMenuOpen = false;
      changed = true;
    }
    if (changed) this.requestUpdate();
  }

  private toggleHubPicker() {
    this._hubPickerOpen = !this._hubPickerOpen;
    if (this._hubPickerOpen) this._toolsMenuOpen = false;
    this.requestUpdate();
  }

  private toggleToolsMenu() {
    this._toolsMenuOpen = !this._toolsMenuOpen;
    if (this._toolsMenuOpen) this._hubPickerOpen = false;
    this.requestUpdate();
  }

  private handleTabSelect(tabId: TabId) {
    this._toolsMenuOpen = false;
    // Leaving the Hub tab abandons an open edit session (same behavior the
    // standalone Activities tab had when switching away) and any pending
    // re-order / add-activity interaction.
    if (tabId !== "cache") {
      this._editingEntity = null;
      this.resetActivityListInteractions();
    }
    // Switching tabs unmounts whichever editor raised the dirty flag; it
    // can't send dirty=false itself at that point.
    if (tabId !== this._snapshot.selectedTab) this._editorSyncPending = false;
    this._store.selectTab(tabId);
  }

  private _handleEditorDirtyChanged = (event: CustomEvent<{ dirty: boolean }>) => {
    const dirty = Boolean(event.detail?.dirty);
    if (dirty === this._editorSyncPending) return;
    this._editorSyncPending = dirty;
    this.requestUpdate();
  };

  // Drops re-order mode and the Add Activity dialog (tab switch, hub switch).
  private resetActivityListInteractions() {
    this._reorderMode = false;
    this._reorderIds = [];
    this._reorderSyncing = false;
    this._reorderError = null;
    this._addActivityOpen = false;
    this._addActivityBusy = false;
    this._addActivityError = null;
  }

  // ── Activity / Device re-order mode ────────────────────────────────

  private startReorder(kind: "activity" | "device") {
    if (this._reorderMode) return;
    // Close any open drawer first, then snapshot the current display order
    // as the working order.
    const openEntity = this._snapshot.openEntity;
    if (openEntity) this._store.toggleEntity(openEntity);
    const cacheHub = selectedHubCache(this._snapshot);
    this._reorderIds = (kind === "activity" ? hubActivities(cacheHub) : hubDevices(cacheHub))
      .map((row) => Number(row.id));
    this._reorderMode = true;
    this._reorderKind = kind;
    this._reorderSyncing = false;
    this._reorderError = null;
    this.requestUpdate();
  }

  private cancelReorder() {
    if (this._reorderSyncing) return;
    this.resetActivityListInteractions();
    this.requestUpdate();
  }

  private moveReorderItem(oldIndex: number, newIndex: number) {
    const ids = [...this._reorderIds];
    if (oldIndex < 0 || oldIndex >= ids.length || newIndex < 0 || newIndex >= ids.length) return;
    const [moved] = ids.splice(oldIndex, 1);
    ids.splice(newIndex, 0, moved);
    this._reorderIds = ids;
    this.requestUpdate();
  }

  private async syncReorder() {
    if (!this._reorderMode || this._reorderSyncing) return;
    this._reorderSyncing = true;
    this._reorderError = null;
    this.requestUpdate();
    const failure = this._reorderKind === "activity"
      ? await this._store.reorderActivities(this._reorderIds)
      : await this._store.reorderDevices(this._reorderIds);
    this._reorderSyncing = false;
    if (failure) {
      this._reorderError = failure;
    } else {
      this.resetActivityListInteractions();
    }
    this.requestUpdate();
  }

  // ── Add Activity flow (name prompt → live editor) ──────────────────

  private openAddActivity() {
    this._addActivityOpen = true;
    this._addActivityBusy = false;
    this._addActivityError = null;
    this.requestUpdate();
  }

  private closeAddActivity() {
    if (this._addActivityBusy) return;
    this._addActivityOpen = false;
    this._addActivityError = null;
    this.requestUpdate();
  }

  private async confirmAddActivity(name: string) {
    if (this._addActivityBusy) return;
    this._addActivityBusy = true;
    this._addActivityError = null;
    this.requestUpdate();
    const result = await this._store.createActivity(name);
    this._addActivityBusy = false;
    if ("error" in result) {
      this._addActivityError = result.error;
      this.requestUpdate();
      return;
    }
    // Open the live editor on the freshly assigned id; from here the flow
    // mirrors the Edit (wrench) behavior exactly.
    this._addActivityOpen = false;
    this._editingEntity = { kind: "activity", id: result.activityId };
    this.requestUpdate();
  }

  private handleSettingToggle(setting: SettingKey, enabled: boolean) {
    void this._store.setSetting(setting, enabled);
  }

  private handleAction(action: HubAction) {
    void this._store.runAction(action);
  }

  private captureCacheScrollState() {
    const state = {
      section: this._snapshot.selectedCacheSection || null,
      sectionTop: 0,
      panelTop: 0,
    };
    const body = this.cacheScrollBody();
    const panel = this.renderRoot.querySelector<HTMLElement>(".tab-panel");
    if (body) state.sectionTop = body.scrollTop || 0;
    if (panel) state.panelTop = panel.scrollTop || 0;
    return state;
  }

  private cacheScrollBody() {
    return this.renderRoot.querySelector<HTMLElement>(".cache-panel-body");
  }

  private restoreCacheScrollState(
    snapshot: { section: string | null; sectionTop: number; panelTop: number } | null,
    pendingEntityKey: string | null,
  ) {
    if (!snapshot) {
      if (pendingEntityKey) {
        requestAnimationFrame(() => this.scrollEntityToTop(pendingEntityKey));
      }
      return;
    }

    requestAnimationFrame(() => {
      const panel = this.renderRoot.querySelector<HTMLElement>(".tab-panel");
      if (panel) panel.scrollTop = Number(snapshot.panelTop || 0);

      const body = this.cacheScrollBody();
      if (body) body.scrollTop = Number(snapshot.sectionTop || 0);

      if (pendingEntityKey) {
        requestAnimationFrame(() => this.scrollEntityToTop(pendingEntityKey));
      }
    });
  }

  private scrollEntityToTop(key: string) {
    const entity = this.renderRoot.querySelector<HTMLElement>(`#entity-${key}`);
    if (!entity) return;
    const body = entity.closest(".cache-panel-body, .secondary-panel-body, .acc-body") as HTMLElement | null;
    if (!body) return;
    const entityTop = entity.getBoundingClientRect().top;
    const bodyTop = body.getBoundingClientRect().top;
    body.scrollTo({
      top: body.scrollTop + (entityTop - bodyTop),
      behavior: "smooth",
    });
  }

  private renderConnectivityPill(hub: ReturnType<typeof selectedHub>) {
    if (!hub) return null;
    const connected = hubConnected(this._snapshot.hass, hub);
    const proxyOn = proxyClientConnected(this._snapshot.hass, hub);
    return html`
      <div class="dock-pill-pair" role="group" aria-label="Connectivity">
        <span class="dock-pill-half ${connected ? "dock-pill-half--hub-on" : "dock-pill-half--hub-off"}">HUB</span>
        <span class="dock-pill-half ${proxyOn ? "dock-pill-half--app-on" : "dock-pill-half--app-off"}">APP</span>
      </div>
    `;
  }

  private renderBrandLabel() {
    const version =
      String(this._snapshot.toolsFrontendVersionExpected ?? this._snapshot.toolsFrontendVersionLoaded ?? "").trim()
      || "unknown";
    return html`<div class="card-brand">SOFABATON CONTROL PANEL - v${version}</div>`;
  }

  private renderBottomDock(hub: ReturnType<typeof selectedHub>) {
    const runtimeState = resolveRuntimeState(this._snapshot);
    // Runtime activity (running operation / completion notice) always wins
    // over the editor dirty banner: while a sync is actually running the
    // dock should narrate that, not nag about the changes it is persisting.
    const editorSyncPending = this._editorSyncPending && !runtimeState;
    const docLink = runtimeState || editorSyncPending ? null : DOC_LINKS[this._snapshot.selectedTab] ?? null;
    const statusText = runtimeState ? runtimeState.detail || runtimeState.label : null;
    const progressPercent = runtimeState?.kind === "operation_running" ? runtimeState.progress.percent : null;
    const dockClass = runtimeState?.kind === "completion"
      ? `card-bottom-dock card-bottom-dock--${runtimeState.tone}`
      : editorSyncPending
        ? "card-bottom-dock card-bottom-dock--dirty"
        : "card-bottom-dock";
    const irFlash = this._activeIrFlash(hub?.entry_id ?? null);

    return html`
      <div class=${dockClass}>
        ${runtimeState?.kind === "operation_running"
          ? html`
              <div
                class="card-bottom-dock-progress-line"
                data-indeterminate=${runtimeState.progress.indeterminate ? "true" : "false"}
                style=${runtimeState.progress.indeterminate || progressPercent == null ? "width: 35%" : `width:${progressPercent}%`}
              ></div>
            `
          : null}
        ${irFlash
          ? keyed(
              irFlash.receivedAt,
              html`
                <div
                  class="card-bottom-dock-ir-flash"
                  title=${this._irFlashTitle(irFlash)}
                  aria-hidden="true"
                ></div>
              `,
            )
          : nothing}
        <div class="card-bottom-dock-center">
          ${runtimeState
            ? html`<span class="card-bottom-dock-status">${statusText}</span>`
            : editorSyncPending
              ? html`<span class="card-bottom-dock-status">${TOOLS_CARD_STRINGS.dock.unsyncedChanges}</span>`
              : docLink
                ? html`<a class="card-bottom-dock-link" href=${docLink.href} target="_blank" rel="noreferrer noopener">${docLink.label}</a>`
                : nothing}
        </div>
        <div class="card-bottom-dock-right">
          ${this.renderConnectivityPill(hub)}
        </div>
      </div>
    `;
  }

  private _activeIrFlash(selectedEntryId: string | null) {
    const press = this._snapshot.lastWifiPress;
    if (!press || !selectedEntryId || press.entryId !== selectedEntryId) return null;
    const elapsed = Date.now() - press.receivedAt;
    if (elapsed < 0 || elapsed >= SofabatonControlPanelCard._IR_FLASH_DURATION_MS) return null;
    if (this._irFlashClearForReceivedAt !== press.receivedAt) {
      if (this._irFlashClearTimer) clearTimeout(this._irFlashClearTimer);
      this._irFlashClearForReceivedAt = press.receivedAt;
      this._irFlashClearTimer = setTimeout(() => {
        this._irFlashClearTimer = null;
        this._irFlashClearForReceivedAt = null;
        this.requestUpdate();
      }, SofabatonControlPanelCard._IR_FLASH_DURATION_MS - elapsed + 16);
    }
    return press;
  }

  private _irFlashTitle(press: NonNullable<ReturnType<typeof this._activeIrFlash>>) {
    const device = press.deviceName?.trim() || "Wifi device";
    const command = press.commandLabel?.trim() || "Wifi command";
    return press.pressType === "long" ? `${device} • ${command} (long press)` : `${device} • ${command}`;
  }

  private renderBackendUnavailable(height: number) {
    return html`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          <div class="card-body">
            <div class="backend-unavailable-state">
              <div class="backend-unavailable-icon"><ha-icon icon="mdi:cloud-off-outline"></ha-icon></div>
              <div class="backend-unavailable-title">Backend not available</div>
              <div class="backend-unavailable-copy">
                Waiting for the Sofabaton X integration to finish starting…
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private renderVersionMismatch(height: number) {
    return html`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          <div class="card-body">
            <div class="version-mismatch-state">
              <div class="version-mismatch-header">
                <div class="version-mismatch-icon"><ha-icon icon="mdi:alert-circle"></ha-icon></div>
                <div class="version-mismatch-title">Refresh required to update the Sofabaton Control Panel card</div>
              </div>
              <div class="version-mismatch-copy">
                This dashboard is still using an older cached version of the Sofabaton Control Panel card than the one now running in Home Assistant.
                Refresh or reopen the dashboard/browser before using the control panel again so the updated card can load.
              </div>
              <div class="version-mismatch-versions">
                <div class="version-mismatch-row">
                  <div class="version-mismatch-label">Backend expects</div>
                  <div class="version-mismatch-value">${this._snapshot.toolsFrontendVersionExpected || "unknown"}</div>
                </div>
                <div class="version-mismatch-row">
                  <div class="version-mismatch-label">Card loaded</div>
                  <div class="version-mismatch-value">${this._snapshot.toolsFrontendVersionLoaded}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }

  private renderHubUnavailable() {
    return html`
      <div class="card-body">
        <div class="card-blocked-state">
          <div class="card-blocked-icon"><ha-icon icon="mdi:lan-disconnect"></ha-icon></div>
          <div class="card-blocked-title">Hub unavailable</div>
          <div class="card-blocked-copy">
            This hub is not connected, so the control panel is unavailable until the hub reconnects.
          </div>
        </div>
      </div>
    `;
  }

  private renderPreview() {
    const features: Array<{ icon: string; label: string }> = [
      { icon: "mdi:database-outline", label: TOOLS_CARD_STRINGS.tabs.cache },
      { icon: "mdi:robot-outline", label: TOOLS_CARD_STRINGS.tabs.wifiCommands },
      { icon: "mdi:cloud-upload-outline", label: TOOLS_CARD_STRINGS.tabs.backup },
      { icon: "mdi:cog-outline", label: TOOLS_CARD_STRINGS.tabs.settings },
      { icon: "mdi:text-box-outline", label: TOOLS_CARD_STRINGS.tabs.logs },
    ];
    return html`
      <ha-card>
        <div class="sb-preview">
          <div class="sb-preview-header">
            <div class="sb-preview-logo">${hubIcon("hero", "sb-preview-hub")}</div>
            <div class="sb-preview-sub">
              Tools, cache, backups, logs &amp; automations for your hub
            </div>
          </div>
          <div class="sb-preview-grid">
            ${features.map(
              (feature) => html`
                <div class="sb-preview-chip">
                  <ha-icon icon=${feature.icon}></ha-icon>
                  <span>${feature.label}</span>
                </div>
              `,
            )}
          </div>
        </div>
      </ha-card>
    `;
  }

  protected render() {
    if (this._preview) return this.renderPreview();
    const hub = selectedHub(this._snapshot);
    const cacheHub = selectedHubCache(this._snapshot);
    const cacheEnabled = persistentCacheEnabled(this._snapshot);
    const hubs = this._snapshot.state?.hubs ?? [];
    const height = Number(this._config.card_height ?? 600);
    const cardGateState = resolveCardGateState(this._snapshot);
    if (cardGateState.kind === "version_mismatch") {
      return this.renderVersionMismatch(height);
    }
    if (cardGateState.kind === "backend_unavailable") {
      return this.renderBackendUnavailable(height);
    }
    const selectedHubConnected = cardGateState.kind !== "hub_unavailable";
    const activeBackupOperation = hub?.active_backup_operation;
    const runtimeState = resolveRuntimeState(this._snapshot);
    const runtimeOperationBusy = runtimeState?.kind === "operation_running";
    const hubEntryId = hub?.entry_id ?? null;
    const hubRefreshing = hubRefreshBusy(this._snapshot, hubEntryId);
    const hubExternalLabel = hubExternalCommandLabel(this._snapshot, hubEntryId);
    const sharedHubCommandBusy = Boolean(
      runtimeOperationBusy ||
      hubRefreshing ||
      hubExternalLabel !== null ||
      this._snapshot.pendingActionKey,
    );
    const sharedHubCommandLabel = (runtimeOperationBusy ? (runtimeState!.detail || runtimeState!.label) : null)
      || hubExternalLabel
      || (hubRefreshing ? "Refreshing cache…" : null)
      || (this._snapshot.pendingActionKey ? "Hub command in progress…" : null);
    let activeTab = renderSettingsTab({
      loading: this._snapshot.loading,
      error: this._snapshot.loadError,
      hub,
      hass: this._snapshot.hass,
      persistentCacheEnabled: cacheEnabled,
      hubCommandBusy: sharedHubCommandBusy,
      pendingSettingKey: this._snapshot.pendingSettingKey,
      pendingActionKey: this._snapshot.pendingActionKey,
      onToggleSetting: (setting, enabled) => this.handleSettingToggle(setting, enabled),
      onRunAction: (action) => this.handleAction(action),
    });

    if (this._snapshot.selectedTab === "logs") {
      activeTab = renderLogsTab({
        lines: this._snapshot.logsLines,
        loading: this._snapshot.logsLoading,
        error: this._snapshot.logsError,
      });
    } else if (this._snapshot.selectedTab === "wifi_commands") {
      const availability = resolveTabAvailability(this._snapshot, "wifi_commands");
      activeTab = html`
        <sofabaton-wifi-commands-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .blockedTitle=${availability.kind === "blocked" ? availability.title : null}
          .blockedMessage=${availability.kind === "blocked" ? availability.message : null}
          .hub=${hub}
          .hass=${this._snapshot.hass}
          .hubCommandBusy=${sharedHubCommandBusy}
          .hubCommandBusyLabel=${sharedHubCommandLabel}
          .lastWifiPress=${this._snapshot.lastWifiPress}
          .lastHubEvent=${this._snapshot.lastHubEvent}
          .setHubCommandBusy=${(busy: boolean, label?: string | null, entryId?: string) => this._store.setExternalHubCommandBusy(busy, label ?? null, entryId ?? null)}
          .refreshControlPanelState=${() => this._store.loadState({ silent: true })}
          @editor-dirty-changed=${this._handleEditorDirtyChanged}
        ></sofabaton-wifi-commands-tab>
      `;
    } else if (this._snapshot.selectedTab === "backup") {
      const availability = resolveTabAvailability(this._snapshot, "backup");
      activeTab = html`
        <sofabaton-backup-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .blockedTitle=${availability.kind === "blocked" ? availability.title : null}
          .blockedMessage=${availability.kind === "blocked" ? availability.message : null}
          .hub=${hub}
          .cacheHub=${cacheHub}
          .hass=${this._snapshot.hass}
          .persistentCacheEnabled=${cacheEnabled}
          .selectedHubProxyConnected=${proxyClientConnected(this._snapshot.hass, hub)}
          .hubCommandBusy=${sharedHubCommandBusy}
          .hubCommandBusyLabel=${sharedHubCommandLabel}
          .selectedSection=${this._snapshot.selectedBackupSection}
          .setSelectedSection=${(section: BackupSectionId) => this._store.setSelectedBackupSection(section)}
          .setHubCommandBusy=${(busy: boolean, label?: string | null, entryId?: string) => this._store.setExternalHubCommandBusy(busy, label ?? null, entryId ?? null)}
          .refreshControlPanelState=${() => this._store.loadState({ silent: true })}
        ></sofabaton-backup-tab>
      `;
    } else if (this._snapshot.selectedTab === "cache") {
      if (this._editingEntity != null) {
        activeTab = html`
          <sofabaton-activities-tab
            .loading=${this._snapshot.loading}
            .error=${this._snapshot.loadError}
            .hub=${hub}
            .hass=${this._snapshot.hass}
            .kind=${this._editingEntity.kind}
            .entityId=${this._editingEntity.id}
            .selectedHubProxyConnected=${proxyClientConnected(this._snapshot.hass, hub)}
            .refreshControlPanelState=${() => this._store.loadState({ silent: true })}
            .startRefreshAll=${() => this._store.refreshAllForHub()}
            @editor-dirty-changed=${this._handleEditorDirtyChanged}
            @editor-exit=${() => {
              this._editingEntity = null;
              this._editorSyncPending = false;
              this.requestUpdate();
            }}
          ></sofabaton-activities-tab>
        `;
      } else {
        activeTab = renderCacheTab({
          loading: this._snapshot.loading,
          error: this._snapshot.loadError,
          hub: cacheHub,
          persistentCacheEnabled: cacheEnabled,
          staleData: this._snapshot.staleData,
          refreshBusy: hubRefreshing,
          hubCommandBusy: sharedHubCommandBusy,
          activeRefreshLabel: hubActiveRefreshLabel(this._snapshot, hubEntryId),
          selectedSection: this._snapshot.selectedCacheSection,
          openEntity: this._snapshot.openEntity,
          selectedHubProxyConnected: proxyClientConnected(this._snapshot.hass, hub),
          enablingPersistentCache: this._snapshot.pendingSettingKey === "persistent_cache",
          onEnablePersistentCache: () => this.handleSettingToggle("persistent_cache", true),
          onRefreshStale: () => void this._store.refreshStale(),
          onSelectSection: (sectionId) => {
            // Switching between the Activities / Devices lists abandons any
            // pending re-order / add-activity interaction.
            this.resetActivityListInteractions();
            this._store.selectCacheSection(sectionId);
          },
          onToggleEntity: (key) => this._store.toggleEntity(key),
          onRefreshSection: (sectionId) => void this._store.refreshSection(sectionId),
          onRefreshEntry: (kind, targetId, key) => void this._store.refreshForHub(kind, targetId, key),
          refreshAllSpinning:
            hubActiveRefreshLabel(this._snapshot, hubEntryId) === REFRESH_ALL_KEY,
          onRefreshAll: () => void this._store.refreshAllForHub(),
          onEditActivity: (activityId) => {
            this._editingEntity = { kind: "activity", id: activityId };
            this.requestUpdate();
          },
          onEditDevice: (deviceId) => {
            this._editingEntity = { kind: "device", id: deviceId };
            this.requestUpdate();
          },
          reorderMode: this._reorderMode,
          reorderKind: this._reorderKind,
          reorderIds: this._reorderIds,
          reorderSyncing: this._reorderSyncing,
          reorderError: this._reorderError,
          onStartReorder: (kind) => this.startReorder(kind),
          onCancelReorder: () => this.cancelReorder(),
          onReorderMove: (oldIndex, newIndex) => this.moveReorderItem(oldIndex, newIndex),
          onSyncReorder: () => void this.syncReorder(),
          addActivityOpen: this._addActivityOpen,
          addActivityBusy: this._addActivityBusy,
          addActivityError: this._addActivityError,
          onOpenAddActivity: () => this.openAddActivity(),
          onCloseAddActivity: () => this.closeAddActivity(),
          onConfirmAddActivity: (name) => void this.confirmAddActivity(name),
        });
      }
    }

    return html`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          <div class="card-topbar">
            ${this.renderBrandLabel()}
            ${hubs.length > 1
              ? renderHubPicker({
                  interactive: true,
                  open: this._hubPickerOpen,
                  selectedLabel: hub?.name || hub?.entry_id || "",
                  prefixLabel: "HUB",
                  hubs,
                  selectedEntryId: this._snapshot.selectedHubEntryId,
                  onToggle: () => this.toggleHubPicker(),
                  onSelect: (entryId) => {
                    this._hubPickerOpen = false;
                    // The live editor is hub-specific: left open across a
                    // switch it would keep editing the previous hub's
                    // entity id against the new hub's cache. The Wifi
                    // Commands tab stays mounted across a hub switch and
                    // resets its own state (sending dirty=false itself), so
                    // only the unmounting live editor needs the flag
                    // cleared here.
                    if (entryId !== this._snapshot.selectedHubEntryId) {
                      this._editingEntity = null;
                      if (this._snapshot.selectedTab !== "wifi_commands") {
                        this._editorSyncPending = false;
                      }
                    }
                    this.resetActivityListInteractions();
                    this._store.selectHub(entryId);
                  },
                })
              : null}
          </div>
          ${renderTabBar({
            selectedTab: this._snapshot.selectedTab,
            toolsMenuOpen: this._toolsMenuOpen,
            onSelect: (tabId) => this.handleTabSelect(tabId),
            onToggleToolsMenu: () => this.toggleToolsMenu(),
          })}
          ${selectedHubConnected ? html`<div class="card-body">${activeTab}</div>` : this.renderHubUnavailable()}
          ${this.renderBottomDock(hub)}
        </div>
      </ha-card>
    `;
  }
}

class SofabatonControlPanelEditor extends HTMLElement {
  private _config: Record<string, unknown> = {};

  setConfig(config: Record<string, unknown>) {
    this._config = config || {};
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    const height = Number(this._config.card_height ?? 600);
    this.innerHTML = `
      <style>
        .editor-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
        .editor-row label { flex: 1; font-size: 14px; color: var(--primary-text-color); }
        .editor-row input[type=number] { width: 90px; padding: 6px 8px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); }
        .editor-hint { font-size: 12px; color: var(--secondary-text-color); padding-bottom: 4px; }
      </style>
      <div class="editor-row">
        <label for="tools-card-height">Card height</label>
        <input id="tools-card-height" type="number" min="240" step="10" value="${height}" />
      </div>
      <div class="editor-hint">Controls how much of the activity/device lists is visible. Default: 600 px.</div>
    `;
    this.querySelector<HTMLInputElement>("#tools-card-height")?.addEventListener("change", (event) => {
      const value = Number((event.currentTarget as HTMLInputElement).value || 600);
      this.dispatchEvent(new CustomEvent("config-changed", {
        detail: { config: { ...this._config, card_height: value } },
        bubbles: true,
        composed: true,
      }));
    });
  }
}

if (!customElements.get(TOOLS_TYPE)) customElements.define(TOOLS_TYPE, SofabatonControlPanelCard);
if (!customElements.get(EDITOR_TYPE)) customElements.define(EDITOR_TYPE, SofabatonControlPanelEditor);

// Sofabaton integration platforms that own the control entities below.
const SOFABATON_PLATFORMS = new Set(["sofabaton_x1s", "sofabaton_hub"]);
// translation_key values of the hub-control entities that this card manages.
// Set on the Python side (switch.py / button.py / sensor.py) precisely so the
// card picker can recognise them without an async entity-registry lookup.
const TOOLS_CONTROL_TRANSLATION_KEYS = new Set([
  "proxy",
  "hex_logging",
  "wifi_device",
  "find_remote",
  "resync_remote",
  "ip_commands",
  "client",
  "hub_connected",
]);

interface SuggestionHass {
  entities?: Record<
    string,
    { platform?: string; device_id?: string; translation_key?: string } | undefined
  >;
  devices?: Record<
    string,
    { primary_config_entry?: string | null; config_entries?: string[] } | undefined
  >;
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TOOLS_TYPE)) {
  window.customCards.push({
    type: TOOLS_TYPE,
    name: "Sofabaton Control Panel",
    description:
      "A control panel for Sofabaton hub tools, cache, logs, settings, and Wi-Fi commands.",
    // No `preview: true`: the "By card" grid renders the *real* card (squished),
    // not renderPreview() — it only honours `preview` in the by-entity flow.
    // Card picker (HA 2026.6+): recommend this card for the hub-control
    // entities, pre-selecting the hub the entity belongs to.
    getEntitySuggestion: (hass: SuggestionHass, entityId: string) => {
      const entry = hass?.entities?.[entityId];
      if (!entry) return null;
      if (!SOFABATON_PLATFORMS.has(String(entry.platform || ""))) return null;
      if (!TOOLS_CONTROL_TRANSLATION_KEYS.has(String(entry.translation_key || "")))
        return null;
      const config: Record<string, unknown> = { type: `custom:${TOOLS_TYPE}` };
      // Resolve the owning hub (config entry) so the panel opens on the right
      // hub for multi-hub setups.
      const device = entry.device_id ? hass?.devices?.[entry.device_id] : undefined;
      const hubEntryId =
        device?.primary_config_entry || device?.config_entries?.[0] || null;
      if (hubEntryId) config.hub = hubEntryId;
      return { config };
    },
  });
}
