import { LitElement, html } from "lit";
import { cardStyles } from "./shared/styles/card-styles";
import type { BackupSectionId, BlobsSectionId, HassLike, HubAction, SettingKey, TabId } from "./shared/ha-context";
import { ControlPanelStore } from "./state/control-panel-store";
import { hubConnected, persistentCacheEnabled, proxyClientConnected, selectedHub, selectedHubCache } from "./shared/utils/control-panel-selectors";
import { renderHubPicker } from "./components/hub-picker";
import { renderTabBar } from "./components/tab-bar";
import { renderSettingsTab } from "./tabs/settings-tab";
import { renderCacheTab } from "./tabs/cache-tab";
import { renderLogsTab } from "./tabs/logs-tab";
import "./tabs/blobs-tab";
import "./tabs/backup-tab";
import "./tabs/wifi-commands-tab";

const TOOLS_TYPE = "sofabaton-control-panel";
const LOG_ONCE_KEY = `__${TOOLS_TYPE}_logged__`;
const EDITOR_TYPE = `${TOOLS_TYPE}-editor`;

function resolveLoadedToolsFrontendVersion() {
  const version = new URL(import.meta.url, window.location.href).searchParams.get("v");
  return String(version || "").trim() || "dev";
}

const LOADED_TOOLS_FRONTEND_VERSION = resolveLoadedToolsFrontendVersion();
const TOOLS_VERSION = LOADED_TOOLS_FRONTEND_VERSION;

function logOnce() {
  const windowWithFlag = window as Window & Record<string, unknown>;
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

class SofabatonControlPanelCard extends LitElement {
  static styles = [cardStyles];

  private _config: Record<string, unknown> = {};
  private _snapshot;
  private readonly _store;
  private _hubPickerOpen = false;
  private _toolsMenuOpen = false;
  private _lastRenderedTab: TabId | null = null;
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
  }

  set hass(value: HassLike) {
    this._store.setHass(value);
  }

  getCardSize() {
    return 8;
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
    this._store.connected();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._store.disconnected();
    document.removeEventListener("pointerdown", this._boundHandleDocumentPointerDown, true);
    this._hubPickerOpen = false;
    this._toolsMenuOpen = false;
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
    this._store.selectTab(tabId);
  }

  private handleSettingToggle(setting: SettingKey, enabled: boolean) {
    void this._store.setSetting(setting, enabled);
  }

  private handleAction(action: HubAction) {
    void this._store.runAction(action);
  }

  private captureCacheScrollState() {
    const state = {
      section: this._snapshot.openSection || null,
      sectionTop: 0,
      panelTop: 0,
    };
    const body = state.section
      ? this.renderRoot.querySelector<HTMLElement>(`#acc-body-${state.section}`)
      : null;
    const panel = this.renderRoot.querySelector<HTMLElement>(".tab-panel");
    if (body) state.sectionTop = body.scrollTop || 0;
    if (panel) state.panelTop = panel.scrollTop || 0;
    return state;
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

      const body = snapshot.section
        ? this.renderRoot.querySelector<HTMLElement>(`#acc-body-${snapshot.section}`)
        : null;
      if (body) body.scrollTop = Number(snapshot.sectionTop || 0);

      if (pendingEntityKey) {
        requestAnimationFrame(() => this.scrollEntityToTop(pendingEntityKey));
      }
    });
  }

  private scrollEntityToTop(key: string) {
    const entity = this.renderRoot.querySelector<HTMLElement>(`#entity-${key}`);
    if (!entity) return;
    const body = entity.closest(".acc-body") as HTMLElement | null;
    if (!body) return;
    const entityTop = entity.getBoundingClientRect().top;
    const bodyTop = body.getBoundingClientRect().top;
    body.scrollTo({
      top: body.scrollTop + (entityTop - bodyTop),
      behavior: "smooth",
    });
  }

  private renderHeaderStatus(hub: ReturnType<typeof selectedHub>) {
    if (!hub) return null;
    const connected = hubConnected(this._snapshot.hass, hub);
    const proxyOn = proxyClientConnected(this._snapshot.hass, hub);
    const integrationVersion = String(this._snapshot.toolsFrontendVersionExpected ?? "").trim() || "unknown";
    return html`
      <div class="card-header-status">
        <div class="dock-seg ${connected ? "dock-seg--hub-on" : "dock-seg--off"}">
          <span class="dock-seg-dot"></span>
          <span>Hub ${connected ? "connected" : "not connected"}</span>
        </div>
        <div class="dock-sep"></div>
        <div class="dock-seg ${proxyOn ? "dock-seg--app-on" : "dock-seg--off"}">
          <span class="dock-seg-dot"></span>
          <span>App ${proxyOn ? "connected" : "not connected"}</span>
        </div>
        <div class="dock-sep"></div>
        <div class="dock-seg dock-seg--version">
          <ha-icon class="dock-version-icon" icon="mdi:cog-outline"></ha-icon>
          <span>v<span class="dock-status-value">${integrationVersion}</span></span>
        </div>
      </div>
    `;
  }

  private renderBackendUnavailable(height: number) {
    return html`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          <div class="card-header">
            <span class="card-title">Sofabaton Control Panel</span>
          </div>
          <div class="card-body">
            <div class="backend-unavailable-state">
              <div class="backend-unavailable-icon"><ha-icon icon="mdi:cloud-off-outline"></ha-icon></div>
              <div class="backend-unavailable-title">Backend not available</div>
              <div class="backend-unavailable-copy">
                Waiting for the Sofabaton X1S integration to finish starting…
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
          <div class="card-header">
            <span class="card-title">Sofabaton Control Panel</span>
          </div>
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

  protected render() {
    const hub = selectedHub(this._snapshot);
    const cacheHub = selectedHubCache(this._snapshot);
    const cacheEnabled = persistentCacheEnabled(this._snapshot);
    const hubs = this._snapshot.state?.hubs ?? [];
    const height = Number(this._config.card_height ?? 600);
    if (this._snapshot.toolsFrontendVersionMismatch) {
      return this.renderVersionMismatch(height);
    }
    if (this._snapshot.backendUnavailable) {
      return this.renderBackendUnavailable(height);
    }
    const activeBackupOperation = hub?.active_backup_operation;
    const backupBusy =
      !!activeBackupOperation &&
      ["pending", "running"].includes(String(activeBackupOperation.status || ""));
    const sharedHubCommandBusy = Boolean(
      this._snapshot.refreshBusy ||
      this._snapshot.externalHubCommandBusy ||
      this._snapshot.pendingActionKey ||
      backupBusy,
    );
    const sharedHubCommandLabel = this._snapshot.externalHubCommandLabel
      || (this._snapshot.refreshBusy ? "Refreshing cache…" : null)
      || (backupBusy ? String(activeBackupOperation?.message || "Backup or restore in progress…") : null)
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
      activeTab = html`
        <sofabaton-wifi-commands-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .hub=${hub}
          .hass=${this._snapshot.hass}
          .hubCommandBusy=${sharedHubCommandBusy}
          .hubCommandBusyLabel=${sharedHubCommandLabel}
          .setHubCommandBusy=${(busy: boolean, label?: string | null) => this._store.setExternalHubCommandBusy(busy, label ?? null)}
          .refreshControlPanelState=${() => this._store.loadControlPanelState()}
        ></sofabaton-wifi-commands-tab>
      `;
    } else if (this._snapshot.selectedTab === "blobs") {
      activeTab = html`
        <sofabaton-blobs-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .hub=${hub}
          .cacheHub=${cacheHub}
          .hass=${this._snapshot.hass}
          .persistentCacheEnabled=${cacheEnabled}
          .hubCommandBusy=${sharedHubCommandBusy}
          .hubCommandBusyLabel=${sharedHubCommandLabel}
          .openSection=${this._snapshot.openBlobsSection}
          .toggleOpenSection=${(section: BlobsSectionId) => this._store.toggleBlobsSection(section)}
          .setHubCommandBusy=${(busy: boolean, label?: string | null) => this._store.setExternalHubCommandBusy(busy, label ?? null)}
          .refreshControlPanelState=${() => this._store.loadState({ silent: true })}
        ></sofabaton-blobs-tab>
      `;
    } else if (this._snapshot.selectedTab === "backup") {
      activeTab = html`
        <sofabaton-backup-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .hub=${hub}
          .cacheHub=${cacheHub}
          .hass=${this._snapshot.hass}
          .persistentCacheEnabled=${cacheEnabled}
          .selectedHubProxyConnected=${proxyClientConnected(this._snapshot.hass, hub)}
          .hubCommandBusy=${sharedHubCommandBusy}
          .hubCommandBusyLabel=${sharedHubCommandLabel}
          .openSection=${this._snapshot.openBackupSection}
          .setOpenSection=${(section: BackupSectionId) => this._store.setBackupSection(section)}
          .setHubCommandBusy=${(busy: boolean, label?: string | null) => this._store.setExternalHubCommandBusy(busy, label ?? null)}
          .refreshControlPanelState=${() => this._store.loadState({ silent: true })}
        ></sofabaton-backup-tab>
      `;
    } else if (this._snapshot.selectedTab === "cache") {
      activeTab = renderCacheTab({
        loading: this._snapshot.loading,
        error: this._snapshot.loadError,
        hub: cacheHub,
        persistentCacheEnabled: cacheEnabled,
        staleData: this._snapshot.staleData,
        refreshBusy: this._snapshot.refreshBusy,
        hubCommandBusy: sharedHubCommandBusy,
        activeRefreshLabel: this._snapshot.activeRefreshLabel,
        openSection: this._snapshot.openSection,
        openEntity: this._snapshot.openEntity,
        selectedHubProxyConnected: proxyClientConnected(this._snapshot.hass, hub),
        enablingPersistentCache: this._snapshot.pendingSettingKey === "persistent_cache",
        onEnablePersistentCache: () => this.handleSettingToggle("persistent_cache", true),
        onRefreshStale: () => void this._store.refreshStale(),
        onToggleSection: (sectionId) => this._store.toggleSection(sectionId),
        onToggleEntity: (key) => this._store.toggleEntity(key),
        onRefreshSection: (sectionId) => void this._store.refreshSection(sectionId),
        onRefreshEntry: (kind, targetId, key) => void this._store.refreshForHub(kind, targetId, key),
      });
    }

    return html`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          ${renderTabBar({
            selectedTab: this._snapshot.selectedTab,
            toolsMenuOpen: this._toolsMenuOpen,
            onSelect: (tabId) => this.handleTabSelect(tabId),
            onToggleToolsMenu: () => this.toggleToolsMenu(),
          })}
          <div class="card-body">${activeTab}</div>
          <div class="card-bottom-dock">
            ${this.renderHeaderStatus(hub)}
            ${renderHubPicker({
              visible: hubs.length > 1,
              open: this._hubPickerOpen,
              selectedLabel: hub?.name || hub?.entry_id || "",
              hubs,
              selectedEntryId: this._snapshot.selectedHubEntryId,
              onToggle: () => this.toggleHubPicker(),
              onSelect: (entryId) => {
                this._hubPickerOpen = false;
                this._store.selectHub(entryId);
              },
            })}
          </div>
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

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TOOLS_TYPE)) {
  window.customCards.push({
    type: TOOLS_TYPE,
    name: "Sofabaton Control Panel",
    description:
      "A control panel for Sofabaton hub tools, cache, logs, settings, and Wi-Fi commands.",
  });
}
