import { LitElement, html } from "lit";
import { cardStyles } from "./shared/styles/card-styles";
import type { HassLike, HubAction, SettingKey, TabId } from "./shared/ha-context";
import { ControlPanelStore } from "./state/control-panel-store";
import { persistentCacheEnabled, proxyClientConnected, selectedHub, selectedHubCache } from "./shared/utils/control-panel-selectors";
import { renderHubPicker } from "./components/hub-picker";
import { renderTabBar } from "./components/tab-bar";
import { renderHubTab } from "./tabs/hub-tab";
import { renderSettingsTab } from "./tabs/settings-tab";
import { renderCacheTab } from "./tabs/cache-tab";
import { renderLogsTab } from "./tabs/logs-tab";
import "./tabs/wifi-commands-tab";

const TOOLS_TYPE = "sofabaton-control-panel";
const TOOLS_VERSION = "0.1.0";
const LOG_ONCE_KEY = `__${TOOLS_TYPE}_logged__`;
const EDITOR_TYPE = `${TOOLS_TYPE}-editor`;

function logOnce() {
  const windowWithFlag = window as Window & Record<string, unknown>;
  if (windowWithFlag[LOG_ONCE_KEY]) return;
  windowWithFlag[LOG_ONCE_KEY] = true;
  console.log(`Sofabaton Control Panel ${TOOLS_VERSION}`);
}

class SofabatonControlPanelCard extends LitElement {
  static styles = [cardStyles];

  private _config: Record<string, unknown> = {};
  private _snapshot;
  private readonly _store;
  private _lastRenderedTab: TabId | null = null;
  private _pendingCacheScrollSnapshot: {
    section: string | null;
    sectionTop: number;
    panelTop: number;
  } | null = null;

  constructor() {
    super();
    this._store = new ControlPanelStore((snapshot) => {
      this._snapshot = snapshot;
      this.requestUpdate();
    });
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

  connectedCallback() {
    super.connectedCallback();
    logOnce();
    this._store.connected();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._store.disconnected();
    this.renderRoot.querySelector<HTMLDialogElement>("#hub-picker-dialog")?.close();
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

  private openHubPicker() {
    const button = this.renderRoot.querySelector<HTMLElement>("#hub-picker-btn");
    const dialog = this.renderRoot.querySelector<HTMLDialogElement>("#hub-picker-dialog");
    if (!button || !dialog) return;
    const rect = button.getBoundingClientRect();
    dialog.style.top = `${rect.bottom + 4}px`;
    dialog.style.left = `${Math.max(8, rect.right - 180)}px`;
    dialog.showModal();
  }

  private handleTabSelect(tabId: TabId) {
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

  protected render() {
    const hub = selectedHub(this._snapshot);
    const cacheHub = selectedHubCache(this._snapshot);
    const cacheEnabled = persistentCacheEnabled(this._snapshot);
    const hubs = this._snapshot.state?.hubs ?? [];
    const height = Number(this._config.card_height ?? 600);
    const sharedHubCommandBusy = Boolean(
      this._snapshot.refreshBusy ||
      this._snapshot.externalHubCommandBusy ||
      this._snapshot.pendingActionKey,
    );
    const sharedHubCommandLabel = this._snapshot.externalHubCommandLabel
      || (this._snapshot.refreshBusy ? "Refreshing cache…" : null)
      || (this._snapshot.pendingActionKey ? "Hub command in progress…" : null);
    let activeTab = renderHubTab({
      loading: this._snapshot.loading,
      error: this._snapshot.loadError,
      hub,
      hass: this._snapshot.hass,
    });

    if (this._snapshot.selectedTab === "settings") {
      activeTab = renderSettingsTab({
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
    } else if (this._snapshot.selectedTab === "logs") {
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
        ></sofabaton-wifi-commands-tab>
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
          <div class="card-header">
            <span class="card-title">Sofabaton Control Panel</span>
            ${renderHubPicker({
              visible: hubs.length > 1,
              selectedLabel: hub?.name || hub?.entry_id || "",
              hubs,
              selectedEntryId: this._snapshot.selectedHubEntryId,
              onOpen: () => this.openHubPicker(),
              onSelect: (entryId) => {
                this.renderRoot.querySelector<HTMLDialogElement>("#hub-picker-dialog")?.close();
                this._store.selectHub(entryId);
              },
            })}
          </div>
          ${renderTabBar({
            selectedTab: this._snapshot.selectedTab,
            persistentCacheEnabled: cacheEnabled,
            onSelect: (tabId) => this.handleTabSelect(tabId),
          })}
          <div class="card-body">${activeTab}</div>
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
