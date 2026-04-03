const TOOLS_TYPE = "sofabaton-control-panel";
const TOOLS_VERSION = "0.0.2";
const TOOLS_LOG_ONCE_KEY = `__${TOOLS_TYPE}_logged__`;

const BUTTON_NAMES = {
  0x97: "C",        0x98: "B",        0x99: "A",        0x9A: "Exit",
  0x9B: "Dvr",      0x9C: "Play",     0x9D: "Guide",
  0xAE: "Up",       0xB2: "Down",     0xAF: "Left",     0xB1: "Right",
  0xB0: "Ok",       0xB4: "Home",     0xB3: "Back",     0xB5: "Menu",
  0xB6: "Vol Up",   0xB9: "Vol Down", 0xB8: "Mute",
  0xB7: "Ch Up",    0xBA: "Ch Down",
  0xBB: "Rew",      0xBC: "Pause",    0xBD: "Fwd",
  0xBE: "Red",      0xBF: "Green",    0xC0: "Yellow",   0xC1: "Blue",
  0xC6: "Power On", 0xC7: "Power Off",
};

function logOnce() {
  if (window[TOOLS_LOG_ONCE_KEY]) return;
  window[TOOLS_LOG_ONCE_KEY] = true;
  const pill =
    "padding:2px 10px;" +
    "border-radius:999px;" +
    "font-weight:600;" +
    "font-size:12px;" +
    "line-height:18px;" +
    "background:#334155;color:#94a3b8;";
  console.log(`%cSofabaton Control Panel  ${TOOLS_VERSION}`, pill);
}

logOnce();

class SofabatonControlPanelCard extends HTMLElement {
  connectedCallback() {
    this._isCardConnected = true;
    if (!this._root) return;
    this._render();
    if (!this._state && !this._loadingStatePromise) {
      this._loadState();
    }
  }

  disconnectedCallback() {
    this._isCardConnected = false;
    const pickerDialog = this._root?.getElementById("hub-picker-dialog");
    if (pickerDialog?.open) pickerDialog.close();
  }

  static getConfigElement() {
    return document.createElement(`${TOOLS_TYPE}-editor`);
  }

  setConfig(config) {
    this._config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
    const fingerprint = this._hassFingerprint();
    const connectionFingerprint = this._connectionFingerprint();
    const generationSnapshot = this._cacheGenerationSnapshot();

    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._openSection = "activities";
      this._openEntity = null;
      this._selectedTab = "hub";
      this._isCardConnected = this.isConnected;
      this._staleData = false;
      this._refreshGraceUntil = 0;
      this._pendingSettingKey = null;
      this._pendingActionKey = null;
      this._pendingLiveStateRefresh = null;
      this._lastObservedGenerations = generationSnapshot;
      this._lastHassFingerprint = fingerprint;
      this._lastConnectionFingerprint = connectionFingerprint;
      if (this._isCardConnected) {
        this._loadState();
        this._render();
      }
      return;
    }

    if (fingerprint !== this._lastHassFingerprint) {
      const connectionChanged = connectionFingerprint !== this._lastConnectionFingerprint;
      if (
        this._isCardConnected &&
        !this._refreshBusy &&
        !this._loading &&
        Date.now() > this._refreshGraceUntil &&
        this._didHubGenerationChange(this._lastObservedGenerations, generationSnapshot)
      ) {
        this._staleData = true;
      }
      this._lastObservedGenerations = generationSnapshot;
      this._lastHassFingerprint = fingerprint;
      this._lastConnectionFingerprint = connectionFingerprint;
      if (this._isCardConnected) {
        if (
          connectionChanged &&
          !this._loading &&
          !this._loadingStatePromise &&
          !this._pendingLiveStateRefresh
        ) {
          this._pendingLiveStateRefresh = this._loadControlPanelState()
            .catch(() => {
              // best-effort live refresh only
            })
            .finally(() => {
              this._pendingLiveStateRefresh = null;
              if (!this._isCardConnected) return;
              if (this._selectedTab === "settings") {
                this._syncTabButtonsUi();
                this._syncSettingsTabUi();
              } else {
                this._render();
              }
            });
        }

        if (this._selectedTab === "settings") {
          this._syncTabButtonsUi();
          this._syncSettingsTabUi();
        } else {
          this._render();
        }
      }
    }
  }

  getCardSize() {
    return 8;
  }

  async _ws(msg) {
    return this._hass.callWS(msg);
  }

  async _loadState(options = {}) {
    if (this._loadingStatePromise) return this._loadingStatePromise;

    const silent = !!options?.silent;

    this._loading = true;
    this._loadError = null;
    if (!silent) this._render();

    this._loadingStatePromise = (async () => {
      try {
        const [state, contents] = await Promise.all([
          this._ws({ type: "sofabaton_x1s/control_panel/state" }),
          this._ws({ type: "sofabaton_x1s/persistent_cache/contents" }),
        ]);
        this._state = state;
        this._contents = contents;
        this._syncSelection();
      } catch (err) {
        this._loadError = this._formatError(err);
      } finally {
        this._loading = false;
        this._loadingStatePromise = null;
        this._staleData = false;
        this._refreshGraceUntil = Date.now() + 10000;
        this._render();
      }
    })();

    return this._loadingStatePromise;
  }

  async _loadControlPanelState() {
    const state = await this._ws({ type: "sofabaton_x1s/control_panel/state" });
    this._state = state;
    this._syncSelection();
    return state;
  }

  _remoteEntities() {
    return Object.keys(this._hass?.states || {}).filter((id) => id.startsWith("remote."));
  }

  _entityForHub(hub) {
    return (
      this._remoteEntities().find(
        (id) => this._hass.states[id]?.attributes?.entry_id === hub.entry_id
      ) || null
    );
  }

  _remoteAttrsForHub(hub) {
    if (!hub) return {};
    const entityId = this._entityForHub(hub);
    return this._hass?.states?.[entityId]?.attributes || {};
  }

  _remoteAvailableForHub(hub) {
    if (!hub) return false;
    const entityId = this._entityForHub(hub);
    const stateObj = entityId ? this._hass?.states?.[entityId] : null;
    const state = String(stateObj?.state || "").toLowerCase();
    return !!state && state !== "unavailable" && state !== "unknown";
  }

  _proxyClientConnected(hub) {
    if (!hub) return false;
    const attrs = this._remoteAttrsForHub(hub);
    if (typeof attrs.proxy_client_connected === "boolean") return attrs.proxy_client_connected;
    return !!hub.proxy_client_connected;
  }

  _hubConnected(hub) {
    return this._remoteAvailableForHub(hub) || this._proxyClientConnected(hub);
  }

  _canRunHubActions(hub) {
    return this._remoteAvailableForHub(hub);
  }

  _cacheGenerationSnapshot() {
    const snapshot = {};
    for (const id of this._remoteEntities()) {
      const attrs = this._hass?.states[id]?.attributes || {};
      const entryId = String(attrs.entry_id || "").trim();
      if (!entryId) continue;
      snapshot[entryId] = Number(attrs.cache_generation || 0);
    }
    return snapshot;
  }

  _didHubGenerationChange(previous, next) {
    const prev = previous || {};
    const curr = next || {};
    return Object.keys(curr).some(
      (entryId) =>
        Object.prototype.hasOwnProperty.call(prev, entryId) &&
        Number(curr[entryId] || 0) !== Number(prev[entryId] || 0)
    );
  }

  _hassFingerprint() {
    if (!this._hass?.states) return "";

    return this._remoteEntities()
      .sort()
      .map((id) => {
        const state = String(this._hass.states[id]?.state || "");
        const attrs = this._hass.states[id]?.attributes || {};
        return `${id};${attrs.entry_id || ""};${state};${attrs.proxy_client_connected ? "1" : "0"};${Number(attrs.cache_generation || 0)}`;
      })
      .join("||");
  }

  _connectionFingerprint() {
    if (!this._hass?.states) return "";

    return this._remoteEntities()
      .sort()
      .map((id) => {
        const state = String(this._hass.states[id]?.state || "");
        const attrs = this._hass.states[id]?.attributes || {};
        return `${id};${attrs.entry_id || ""};${state};${attrs.proxy_client_connected ? "1" : "0"}`;
      })
      .join("||");
  }

  _syncSelection() {
    const hubs = Array.isArray(this._state?.hubs) ? this._state.hubs : [];
    if (!hubs.length) {
      this._selectedHubEntryId = null;
      return;
    }
    if (!hubs.some((h) => h.entry_id === this._selectedHubEntryId)) {
      this._selectedHubEntryId = hubs[0].entry_id;
    }
    if (this._selectedTab === "cache" && !this._persistentCacheEnabled()) {
      this._selectedTab = "settings";
    }
  }

  _selectedHub() {
    const hubs = Array.isArray(this._state?.hubs) ? this._state.hubs : [];
    return hubs.find((h) => h.entry_id === this._selectedHubEntryId) || hubs[0] || null;
  }

  _selectedHubCache() {
    const hubs = Array.isArray(this._contents?.hubs) ? this._contents.hubs : [];
    return hubs.find((h) => h.entry_id === this._selectedHubEntryId) || hubs[0] || null;
  }

  _persistentCacheEnabled() {
    return !!this._state?.persistent_cache_enabled;
  }

  _hubActivities(hub) {
    return this._sortById(Array.isArray(hub?.activities) ? hub.activities : []);
  }

  _activityFavorites(hub, activityId) {
    const rows = hub?.activity_favorites?.[String(activityId)];
    return this._sortById(Array.isArray(rows) ? rows : []);
  }

  _activityMacros(hub, activityId) {
    const rows = hub?.activity_macros?.[String(activityId)];
    return Array.isArray(rows) ? rows : [];
  }

  _activityButtons(hub, activityId) {
    const ids = hub?.buttons?.[String(activityId)];
    return Array.isArray(ids) ? ids.map(Number) : [];
  }

  _buttonName(btnId) {
    return BUTTON_NAMES[btnId] || `Button ${btnId}`;
  }

  _hubIconSvg(kind, classes = "") {
    const cls = classes ? ` class="${classes}"` : "";
    const icons = {
      hero: `
        <svg${cls} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 421.04 173.01" aria-hidden="true" fill="currentColor">
          <path d="M87.39,45.33c0,21.03,50.51,44.46,123,44.46s123-23.43,123-44.46S282.87.87,210.39.87s-123,23.43-123,44.46Z"></path>
          <path d="M25.79,116h367c11.44,0,18.11-2.01,23.05-6.95,6.19-6.19,6.93-17.18,1.79-26.73l-28.97-54.94C375.65,4.75,344.58,0,320.79,0h-22.52c2.26.78,4.48,1.59,6.62,2.43,27.41,10.85,42.5,26.08,42.5,42.9s-15.09,32.05-42.5,42.9c-25.35,10.04-58.92,15.56-94.5,15.56s-69.15-5.53-94.5-15.56c-27.41-10.85-42.5-26.08-42.5-42.9S88.48,13.28,115.89,2.43c2.14-.85,4.36-1.65,6.62-2.43h-19.72c-23.82,0-54.95,4.77-67.92,27.47L1.18,85.93c-2.61,7.76-.85,15.91,4.88,22.46,5.4,6.3,13.71,7.61,19.73,7.61Z"></path>
          <path d="M25.79,130c-7.42,0-14.04-1.44-19.67-4.22,5.85,12.19,14.63,22.79,26.26,31.66,9.25,7.11,24.67,15.57,45.76,15.57h264c14.9,0,28.65-4.5,42.02-13.76,12.95-9.01,22.84-19.89,29.61-32.48-6.92,2.72-14.25,3.23-20.98,3.23H25.79Z"></path>
        </svg>`,
      activities: `
        <ha-icon${cls} icon="mdi:play-circle-outline"></ha-icon>`,
      devices: `
        <ha-icon${cls} icon="mdi:remote"></ha-icon>`,
      ip: `
        <ha-icon${cls} icon="mdi:router-wireless"></ha-icon>`,
      version: `
        <ha-icon${cls} icon="mdi:cog-outline"></ha-icon>`,
    };
    return icons[kind] || "";
  }

  _devicesForHub(hub) {
    return this._sortByName(Array.isArray(hub?.devices_list) ? hub.devices_list : []);
  }

  _deviceCommands(hub, deviceId) {
    const commands = hub?.commands?.[String(deviceId)] || {};
    return Object.entries(commands)
      .map(([cmdId, label]) => ({
        id: Number(cmdId),
        label: String(label || `Command ${cmdId}`),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  _sortByName(items) {
    return [...(items || [])].sort((a, b) =>
      String(a?.name || a?.label || "").localeCompare(String(b?.name || b?.label || ""))
    );
  }

  _sortById(items) {
    return [...(items || [])].sort(
      (a, b) => Number(a?.id || a?.button_id || 0) - Number(b?.id || b?.button_id || 0)
    );
  }

  _escape(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  _idBadge(type, value) {
    return `<span class="id-badge"><span class="id-type">${type}:</span><span class="id-value">${this._escape(String(value))}</span></span>`;
  }

  _formatError(err) {
    if (!err) return "Unknown error";
    if (typeof err === "string") return err;
    const candidates = [
      err?.message,
      err?.error?.message,
      err?.body?.message,
      err?.error,
      err?.code,
      err?.statusText,
      err?.type,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c;
    }
    const s = String(err || "").trim();
    if (s && s !== "[object Object]") return s;
    return "Unknown error (check Home Assistant logs)";
  }

  _scrollEntityToTop(key) {
    const entity = this._root.getElementById(`entity-${key}`);
    if (!entity) return;
    const body = entity.closest(".acc-body");
    if (!body) return;
    const entityTop = entity.getBoundingClientRect().top;
    const bodyTop = body.getBoundingClientRect().top;
    body.scrollTo({ top: body.scrollTop + (entityTop - bodyTop), behavior: "smooth" });
  }

  _captureCacheScrollState() {
    if (!this._root || this._selectedTab !== "cache") return null;
    const state = {
      section: this._openSection || null,
      sectionTop: 0,
      panelTop: 0,
    };
    const body = state.section ? this._root.getElementById(`acc-body-${state.section}`) : null;
    const panel = this._root.querySelector(".tab-panel");
    if (body) state.sectionTop = body.scrollTop || 0;
    if (panel) state.panelTop = panel.scrollTop || 0;
    return state;
  }

  _restoreCacheScrollState(snapshot) {
    if (!snapshot || !this._root || this._selectedTab !== "cache") return;
    requestAnimationFrame(() => {
      const panel = this._root.querySelector(".tab-panel");
      if (panel) panel.scrollTop = Number(snapshot.panelTop || 0);

      const body = snapshot.section
        ? this._root.getElementById(`acc-body-${snapshot.section}`)
        : null;
      if (body) body.scrollTop = Number(snapshot.sectionTop || 0);
    });
  }

  _applyOptimisticSetting(setting, enabled) {
    if (!this._state) return;
    const hub = this._selectedHub();
    if (!hub) return;

    if (setting === "persistent_cache") {
      this._state = {
        ...this._state,
        persistent_cache_enabled: !!enabled,
        hubs: (this._state.hubs || []).map((item) => ({
          ...item,
          persistent_cache_enabled: !!enabled,
        })),
      };
      return;
    }

    hub.settings = {
      ...(hub.settings || {}),
      [setting]: !!enabled,
    };
  }

  _syncTabButtonsUi() {
    if (!this._root) return;
    const cacheTab = this._root.querySelector('[data-tab="cache"]');
    if (!cacheTab) return;
    const disabled = !this._persistentCacheEnabled();
    cacheTab.classList.toggle("tab-disabled", disabled);
    if (disabled) cacheTab.setAttribute("aria-disabled", "true");
    else cacheTab.removeAttribute("aria-disabled");
  }

  _syncSettingsTabUi() {
    if (!this._root || this._selectedTab !== "settings") return;
    const hub = this._selectedHub();
    if (!hub) return;

    const settingKeys = [
      "persistent_cache",
      "hex_logging_enabled",
      "proxy_enabled",
      "wifi_device_enabled",
    ];

    for (const settingKey of settingKeys) {
      const tile = this._root.querySelector(`[data-setting-tile="${settingKey}"]`);
      const sw = this._root.getElementById(`setting-${settingKey}`);
      if (!tile || !sw) continue;

      let checked = false;
      if (settingKey === "persistent_cache") checked = this._persistentCacheEnabled();
      else checked = !!hub?.settings?.[settingKey];

      if (sw.checked !== checked) sw.checked = checked;
      if (sw.disabled) sw.disabled = false;
      tile.classList.remove("disabled");
    }

    const actionBusy = !!this._pendingActionKey;
    const canFind = this._canRunHubActions(hub) && !actionBusy;
    const canSync = this._canRunHubActions(hub) && !actionBusy;
    const findTile = this._root.querySelector('[data-action-tile="find_remote"]');
    const syncTile = this._root.querySelector('[data-action-tile="sync_remote"]');
    if (findTile) findTile.classList.toggle("disabled", !canFind);
    if (syncTile) syncTile.classList.toggle("disabled", !canSync);
  }

  async _setSetting(setting, enabled) {
    const hub = this._selectedHub();
    if (!hub || this._pendingSettingKey || this._pendingActionKey) return;

    const previousPersistentCacheEnabled = this._persistentCacheEnabled();
    this._pendingSettingKey = setting;
    this._applyOptimisticSetting(setting, enabled);
    this._syncTabButtonsUi();
    this._syncSettingsTabUi();
    try {
      await this._ws({
        type: "sofabaton_x1s/control_panel/set_setting",
        entry_id: hub.entry_id,
        setting,
        enabled: !!enabled,
      });
      if (setting === "persistent_cache") {
        if (!enabled && this._selectedTab === "cache") {
          this._selectedTab = "settings";
          await this._loadState();
          return;
        }
        await this._loadControlPanelState();
      } else {
        await this._loadControlPanelState();
      }
      if (this._selectedTab === "cache" && !this._persistentCacheEnabled()) {
        this._selectedTab = "settings";
      }
      this._syncTabButtonsUi();
      this._syncSettingsTabUi();
    } catch (_err) {
      this._applyOptimisticSetting(
        setting,
        setting === "persistent_cache" ? previousPersistentCacheEnabled : !enabled
      );
      this._syncTabButtonsUi();
      this._syncSettingsTabUi();
    } finally {
      this._pendingSettingKey = null;
      this._syncTabButtonsUi();
      this._syncSettingsTabUi();
    }
  }

  async _runHubAction(action) {
    const hub = this._selectedHub();
    if (!hub || this._pendingSettingKey || this._pendingActionKey) return;

    this._pendingActionKey = action;
    this._syncSettingsTabUi();
    try {
      await this._ws({
        type: "sofabaton_x1s/control_panel/run_action",
        entry_id: hub.entry_id,
        action,
      });
      await this._loadControlPanelState();
      this._syncSettingsTabUi();
    } catch (_err) {
      this._syncSettingsTabUi();
    } finally {
      this._pendingActionKey = null;
      this._syncSettingsTabUi();
    }
  }

  _refreshPayload(kind, hubEntryId, targetId) {
    const hub = this._selectedHub();
    const entityId = hub ? this._entityForHub(hub) : null;
    const payload = {
      type: "sofabaton_x1s/persistent_cache/refresh",
      kind,
      target_id: Number(targetId),
    };
    if (entityId) payload.entity_id = entityId;
    else payload.entry_id = hubEntryId;
    return payload;
  }

  async _refreshForHub(kind, hubEntryId, targetId, key) {
    if (this._refreshBusy) return;

    this._refreshBusy = true;
    this._activeRefreshLabel = key;
    this._render();

    try {
      await this._ws(this._refreshPayload(kind, hubEntryId, targetId));
      await this._loadState({ silent: true });
    } catch (_err) {
      // intentionally silent
    } finally {
      this._refreshBusy = false;
      this._activeRefreshLabel = null;
      this._staleData = false;
      this._render();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => this._scrollEntityToTop(key));
      });
    }
  }

  async _refreshSection(sectionId) {
    if (this._refreshBusy) return;
    const hub = this._selectedHub();
    if (!hub) return;

    this._refreshBusy = true;
    this._render();

    try {
      await this._ws({
        type: "sofabaton_x1s/catalog/refresh",
        entry_id: hub.entry_id,
        kind: sectionId,
      });
      await this._loadState({ silent: true });
    } catch (_err) {
      // intentionally silent
    } finally {
      this._refreshBusy = false;
      this._activeRefreshLabel = null;
      this._staleData = false;
      this._render();
    }
  }

  _styles() {
    return `<style>
      :host { display: block; }
      *, *::before, *::after { box-sizing: border-box; }

      .card-inner {
        height: var(--tools-card-height, 600px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: var(--ha-card-border-radius, 12px);
      }

      .card-header {
        flex-shrink: 0;
        min-height: 52px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px 8px;
      }
      .card-title { font-size: 16px; font-weight: 700; }

      .hub-picker-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--divider-color);
        border-radius: 999px;
        padding: 4px 10px;
        background: var(--secondary-background-color, var(--ha-card-background));
        cursor: pointer;
        font-family: inherit;
        color: var(--primary-text-color);
        flex-shrink: 0;
      }
      .hub-picker-btn:hover { border-color: var(--primary-color); }
      .hub-picker-btn .chip-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .hub-picker-btn .chip-name {
        font-size: 13px;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .hub-picker-btn .chip-arrow { font-size: 10px; color: var(--secondary-text-color); }

      .hub-picker-dialog {
        position: fixed;
        margin: 0;
        padding: 0;
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--card-background-color, var(--ha-card-background, white));
        color: var(--primary-text-color);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
        min-width: 160px;
        overflow: hidden;
      }
      .hub-picker-dialog::backdrop { background: transparent; }
      .hub-option {
        padding: 9px 14px;
        font-size: 13px;
        cursor: pointer;
        color: var(--primary-text-color);
      }
      .hub-option:hover { background: var(--secondary-background-color, var(--primary-background-color)); }
      .hub-option.selected { font-weight: 600; color: var(--primary-color); }

      .tabs {
        flex-shrink: 0;
        display: flex;
        gap: 2px;
        padding: 0 16px;
        border-bottom: 1px solid var(--divider-color);
      }
      .tab-btn {
        position: relative;
        border: none;
        border-bottom: 3px solid transparent;
        background: transparent;
        color: var(--secondary-text-color);
        font: inherit;
        font-size: 14px;
        font-weight: 700;
        padding: 12px 16px 11px;
        cursor: pointer;
      }
      .tab-btn.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
      }
      .tab-btn.tab-disabled {
        color: var(--disabled-text-color, var(--secondary-text-color));
        opacity: 0.45;
        cursor: default;
      }

      .card-body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }

      .tab-panel {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        padding: 16px;
        gap: 14px;
      }
      .tab-panel.scrollable {
        overflow-y: auto;
      }
      .hub-hero {
        display: grid;
        gap: 10px;
        padding: 2px 0 0;
      }
      .hub-connection-strip {
        display: grid;
        grid-template-columns: auto minmax(26px, 1fr) auto minmax(26px, 1fr) auto;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color));
        border-radius: calc(var(--ha-card-border-radius, 12px) + 4px);
        background:
          radial-gradient(circle at top center, color-mix(in srgb, var(--primary-color) 8%, transparent), transparent 55%),
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--card-background-color, #fff) 92%, transparent),
            color-mix(in srgb, var(--card-background-color, #fff) 86%, transparent)
          );
        overflow: hidden;
      }
      .hub-connection-node {
        position: relative;
        width: 54px;
        height: 54px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 18px;
        border: 1px solid color-mix(in srgb, var(--primary-text-color) 12%, var(--divider-color));
        background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
        color: color-mix(in srgb, var(--primary-text-color) 34%, var(--secondary-text-color));
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        transition: color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease, background 180ms ease;
      }
      .hub-connection-node.is-active {
        color: color-mix(in srgb, var(--primary-color) 72%, white 10%);
        border-color: color-mix(in srgb, var(--primary-color) 45%, var(--divider-color));
        background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--primary-color) 12%, transparent),
          0 0 18px color-mix(in srgb, var(--primary-color) 14%, transparent);
      }
      .hub-connection-node.is-bridged {
        color: color-mix(in srgb, #67b7ff 75%, white 10%);
        border-color: color-mix(in srgb, #67b7ff 45%, var(--divider-color));
        background: color-mix(in srgb, #67b7ff 11%, transparent);
        box-shadow:
          0 0 0 1px color-mix(in srgb, #67b7ff 12%, transparent),
          0 0 18px color-mix(in srgb, #67b7ff 16%, transparent);
      }
      .hub-connection-node.is-active .hub-connection-node-icon {
        animation: hubNodePulse 2.8s ease-in-out infinite;
      }
      .hub-connection-node-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .hub-connection-node-icon--hub {
        width: 33px;
        height: 33px;
      }
      .hub-connection-node-icon--mdi ha-icon {
        --mdc-icon-size: 24px;
      }
      .hub-hero-icon {
        width: 33px;
        height: 33px;
        display: block;
      }
      .hub-connection-link {
        position: relative;
        height: 12px;
        display: flex;
        align-items: center;
      }
      .hub-connection-link-line {
        position: relative;
        width: 100%;
        height: 2px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color));
        overflow: hidden;
      }
      .hub-connection-link-line::after {
        content: "";
        position: absolute;
        inset: 0 auto 0 -35%;
        width: 35%;
        background: linear-gradient(
          90deg,
          transparent,
          color-mix(in srgb, var(--primary-color) 45%, white 10%),
          transparent
        );
        opacity: 0;
      }
      .hub-connection-link.is-active .hub-connection-link-line {
        background: color-mix(in srgb, var(--primary-color) 28%, var(--divider-color));
        box-shadow: 0 0 8px color-mix(in srgb, var(--primary-color) 14%, transparent);
      }
      .hub-connection-link.is-active .hub-connection-link-line::after {
        opacity: 0.9;
        animation: hubSignalTravel 2.4s ease-in-out infinite alternate;
      }
      @keyframes hubSignalTravel {
        from { transform: translateX(0); }
        to { transform: translateX(380%); }
      }
      @keyframes hubNodePulse {
        0%, 100% { transform: scale(1); opacity: 0.96; }
        50% { transform: scale(1.03); opacity: 1; }
      }
      .hub-ident {
        min-width: 0;
      }
      .hub-ident--hero {
        display: grid;
        gap: 0;
        padding: 0 2px;
        margin: 8px 0 12px;
      }
      .hub-ident-name {
        font-size: 18px;
        line-height: 1.1;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: var(--primary-text-color);
      }

      .overview-grid,
      .settings-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .overview-tile,
      .setting-tile {
        border: 1px solid var(--divider-color);
        border-radius: calc(var(--ha-card-border-radius, 12px) + 2px);
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--card-background-color, #fff) 92%, white),
          var(--card-background-color, #fff)
        );
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02);
      }
      .overview-tile {
        min-height: 92px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 6px;
      }
      .overview-label {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .overview-value {
        font-size: 16px;
        font-weight: 700;
        color: var(--primary-text-color);
        line-height: 1.25;
        word-break: break-word;
      }
      .setting-tile {
        min-height: 132px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .setting-tile.toggle,
      .setting-tile.action {
        cursor: pointer;
        transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
      }
      .setting-tile.toggle:hover,
      .setting-tile.action:hover {
        border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
        transform: translateY(-1px);
      }
      .setting-tile.toggle:active,
      .setting-tile.action:active,
      .setting-tile.pressed {
        border-color: color-mix(in srgb, var(--primary-color) 70%, var(--divider-color));
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 25%, transparent);
        transform: translateY(0);
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--card-background-color, #fff) 84%, var(--primary-color)),
          color-mix(in srgb, var(--card-background-color, #fff) 92%, var(--primary-color))
        );
      }
      .setting-tile.disabled {
        opacity: 0.55;
        cursor: default;
        box-shadow: none;
        transform: none;
      }
      .setting-tile-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .setting-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--primary-text-color);
      }
      .setting-description {
        font-size: 13px;
        line-height: 1.45;
        color: var(--secondary-text-color);
      }
      .setting-icon {
        font-size: 22px;
        line-height: 1;
      }
      .cache-panel {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        margin: -16px;
      }
      .accordion-section {
        display: flex;
        flex-direction: column;
        min-height: 0;
        border-top: 1px solid var(--divider-color);
      }
      .accordion-section:first-child { border-top: none; }
      .accordion-section.open { flex: 1; }
      .acc-header {
        flex-shrink: 0;
        height: 44px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 16px;
        cursor: pointer;
        user-select: none;
      }
      .acc-title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .badge {
        font-size: 11px;
        font-weight: 700;
        color: var(--secondary-text-color);
        background: var(--secondary-background-color, var(--ha-card-background));
        border: 1px solid var(--divider-color);
        border-radius: 999px;
        padding: 1px 7px;
      }
      .flex-spacer { flex: 1; }
      .icon-btn {
        width: 26px;
        height: 26px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--divider-color);
        border-radius: calc(var(--ha-card-border-radius, 12px) * 0.6);
        background: transparent;
        color: var(--secondary-text-color);
        font-size: 13px;
        cursor: pointer;
        flex-shrink: 0;
        transition: color 120ms, border-color 120ms, background 120ms;
        padding: 0;
        line-height: 1;
      }
      .icon-btn:hover {
        color: var(--primary-color);
        border-color: var(--primary-color);
        background: rgba(3, 169, 244, 0.05);
      }
      .icon-btn:disabled {
        opacity: 0.35;
        cursor: default;
        pointer-events: none;
      }
      .icon-btn.spinning {
        animation: spin 0.7s linear infinite;
        color: var(--primary-color);
        border-color: var(--primary-color);
        opacity: 1 !important;
        pointer-events: none;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .refresh-list-label {
        font-size: 11px;
        color: var(--secondary-text-color);
        margin-right: 2px;
        user-select: none;
      }
      .chevron {
        font-size: 10px;
        color: var(--secondary-text-color);
        transition: transform 150ms;
        flex-shrink: 0;
      }
      .accordion-section.open .chevron { transform: rotate(180deg); }
      .acc-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0 16px 12px;
        display: grid;
        gap: 6px;
        align-content: start;
      }
      .entity-block {
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-card-border-radius, 12px);
        background: var(--secondary-background-color, var(--ha-card-background));
        overflow-x: clip;
      }
      .entity-summary {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 10px 9px 12px;
        cursor: pointer;
        user-select: none;
      }
      .entity-name {
        font-size: 13px;
        font-weight: 500;
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .id-badge {
        display: inline-flex;
        align-items: center;
        font-size: 10px;
        font-weight: 600;
        font-family: "SF Mono", "Fira Code", Consolas, monospace;
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        border: 1px solid var(--divider-color);
        border-radius: calc(var(--ha-card-border-radius, 12px) * 0.4);
        padding: 2px 5px;
        flex-shrink: 0;
        white-space: nowrap;
        min-width: 68px;
        justify-content: space-between;
      }
      .id-badge .id-type { color: var(--secondary-text-color); opacity: 0.75; }

      .hub-badges {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        padding: 8px 0 12px;
      }
      .hub-conn-badge,
      .hub-proxy-badge {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        min-height: 38px;
        padding: 0 14px 0 12px;
        border-radius: 999px;
        border: 1px solid var(--divider-color);
        font-size: 13px;
        font-weight: 700;
        backdrop-filter: blur(4px);
      }
      .hub-conn-badge::before,
      .hub-proxy-badge::before {
        content: "";
        width: 9px;
        height: 9px;
        border-radius: 50%;
        background: currentColor;
        flex-shrink: 0;
      }
      .hub-conn-badge--on {
        color: #48b851;
        border-color: color-mix(in srgb, #48b851 45%, var(--divider-color));
        background: color-mix(in srgb, #48b851 14%, transparent);
        box-shadow: inset 0 0 0 1px color-mix(in srgb, #48b851 14%, transparent);
      }
      .hub-conn-badge--off,
      .hub-proxy-badge--off {
        color: color-mix(in srgb, var(--primary-text-color) 82%, var(--secondary-text-color));
        border-color: color-mix(in srgb, var(--primary-text-color) 12%, var(--divider-color));
        background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
      }
      .hub-proxy-badge--on {
        color: #67b7ff;
        border-color: color-mix(in srgb, #67b7ff 42%, var(--divider-color));
        background: color-mix(in srgb, #67b7ff 14%, transparent);
      }
      .hub-info-list {
        border: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color));
        border-radius: calc(var(--ha-card-border-radius, 12px) + 4px);
        background: linear-gradient(
          180deg,
          color-mix(in srgb, var(--card-background-color, #fff) 90%, transparent),
          color-mix(in srgb, var(--card-background-color, #fff) 84%, transparent)
        );
        overflow: hidden;
      }
      .hub-row {
        min-height: 58px;
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 0 16px;
        border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color));
      }
      .hub-row:first-child {
        border-top: none;
      }
      .hub-row-icon {
        width: 24px;
        height: 24px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #6b8fbe;
      }
      .hub-row-icon-svg {
        --mdc-icon-size: 22px;
        width: 22px;
        height: 22px;
        display: block;
      }
      .hub-row-label {
        font-size: 13px;
        font-weight: 500;
        color: color-mix(in srgb, var(--primary-text-color) 88%, var(--secondary-text-color));
      }
      .hub-row-value {
        font-size: 13px;
        font-weight: 700;
        color: var(--primary-text-color);
        text-align: right;
        word-break: break-word;
      }
      .id-badge .id-value { color: var(--primary-text-color); text-align: right; }
      .entity-count {
        font-size: 11px;
        color: var(--secondary-text-color);
        flex-shrink: 0;
        white-space: nowrap;
      }
      .entity-chevron {
        font-size: 9px;
        color: var(--secondary-text-color);
        transition: transform 150ms;
        flex-shrink: 0;
      }
      .entity-block.open .entity-chevron { transform: rotate(180deg); }
      .entity-block.open > .entity-summary {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--secondary-background-color, var(--ha-card-background));
        border-bottom: 1px solid var(--divider-color);
        border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0;
      }
      .entity-body { display: none; }
      .entity-block.open .entity-body { display: block; }
      .inner-section-label {
        padding: 5px 12px 4px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
        background: var(--primary-background-color, rgba(0,0,0,0.04));
        border-top: 1px solid var(--divider-color);
        margin-top: 2px;
      }
      .inner-section-label:first-child {
        border-top: none;
        margin-top: 0;
      }
      .inner-row {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 8px;
      }
      .inner-row:hover { background: rgba(0, 0, 0, 0.03); }
      .inner-label {
        font-size: 12px;
        font-weight: 500;
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .inner-badges { display: flex; gap: 4px; flex-shrink: 0; }
      .buttons-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        column-gap: 6px;
      }
      .buttons-col { display: flex; flex-direction: column; }
      .inner-empty {
        padding: 8px 12px;
        font-size: 11px;
        color: var(--secondary-text-color);
        font-style: italic;
      }
      .cache-state {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 24px 16px;
        text-align: center;
        font-size: 13px;
        line-height: 1.6;
        color: var(--secondary-text-color);
      }
      .cache-state.error { color: var(--error-color, #db4437); }
      .cache-state-icon { font-size: 32px; line-height: 1; margin-bottom: 4px; }
      .cache-state-title { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .cache-state-sub { font-size: 12px; line-height: 1.5; max-width: 260px; }
      .stale-banner {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 12px; margin: 0 0 8px;
        border-radius: 8px;
        background: color-mix(in srgb, var(--warning-color, #ff9800) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--warning-color, #ff9800) 30%, transparent);
        font-size: 12px; color: var(--primary-text-color);
      }
      .stale-banner-text { flex: 1; }
      .stale-banner-btn {
        background: none; border: 1px solid var(--divider-color); border-radius: 6px;
        padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer;
        color: var(--primary-text-color); white-space: nowrap;
      }
      .stale-banner-btn:hover { background: var(--secondary-background-color); }
      /* ── Hub tab overview ── */
      @media (max-width: 640px) {
        .overview-grid,
        .settings-grid {
          grid-template-columns: 1fr;
        }
        .hub-hero {
          gap: 8px;
        }
        .hub-connection-strip {
          grid-template-columns: auto minmax(14px, 1fr) auto minmax(14px, 1fr) auto;
          gap: 6px;
          padding: 8px 10px;
        }
        .hub-connection-node {
          width: 42px;
          height: 42px;
          border-radius: 14px;
        }
        .hub-connection-node-icon--hub,
        .hub-hero-icon {
          width: 25px;
          height: 25px;
        }
        .hub-connection-node-icon--mdi ha-icon {
          --mdc-icon-size: 19px;
        }
        .hub-ident-name {
          font-size: 15px;
        }
        .hub-conn-badge,
        .hub-proxy-badge {
          min-height: 34px;
          font-size: 12px;
          padding: 0 12px;
        }
        .hub-row {
          min-height: 52px;
          grid-template-columns: 24px minmax(0, 1fr) auto;
          gap: 10px;
          padding: 0 14px;
        }
        .hub-row-label {
          font-size: 12px;
        }
        .hub-row-value {
          grid-column: auto;
          text-align: right;
          font-size: 12px;
          white-space: nowrap;
        }
      }
    </style>`;
  }

  _renderActivity(hub, activity) {
    const id = Number(activity.id);
    const key = `act-${id}`;
    const isOpen = this._openEntity === key;
    const proxyLocked = this._proxyClientConnected(this._selectedHub());
    const locked = this._refreshBusy || proxyLocked;
    const isSpinning = this._refreshBusy && this._activeRefreshLabel === key;

    const favCount = Number(activity.favorite_count ?? 0);
    const macCount = Number(activity.macro_count ?? 0);
    const btnIds = this._activityButtons(hub, id);
    const btnCount = btnIds.length;

    let bodyHtml = "";
    if (isOpen) {
      const favorites = this._activityFavorites(hub, id);
      const macros = this._activityMacros(hub, id);

      const favHtml = favorites.length
        ? `<div class="inner-section-label">Favorites</div>` +
          favorites
            .map(
              (f) => `
              <div class="inner-row">
                <span class="inner-label">${this._escape(f.label)}</span>
                <span class="inner-badges">
                  ${this._idBadge("FavID", f.button_id)}
                  ${this._idBadge("DevID", f.device_id)}
                  ${this._idBadge("ComID", f.command_id)}
                </span>
              </div>`
            )
            .join("")
        : "";

      const macHtml = macros.length
        ? `<div class="inner-section-label">Macros</div>` +
          macros
            .map(
              (m) => `
              <div class="inner-row">
                <span class="inner-label">${this._escape(m.label || m.name || `Macro ${m.command_id}`)}</span>
                <span class="inner-badges">
                  ${this._idBadge("FavID", m.command_id)}
                  ${this._idBadge("ComID", m.command_id)}
                </span>
              </div>`
            )
            .join("")
        : "";
      const btnHtml = (() => {
        if (!btnIds.length) return "";
        const half = Math.ceil(btnIds.length / 2);
        const cols = [btnIds.slice(0, half), btnIds.slice(half)];
        return (
          `<div class="inner-section-label">Buttons</div>` +
          `<div class="buttons-grid">` +
          cols
            .map(
              (col) =>
                `<div class="buttons-col">` +
                col
                  .map(
                    (btnId) => `
                  <div class="inner-row">
                    <span class="inner-label">${this._escape(this._buttonName(btnId))}</span>
                    <span class="inner-badges">${this._idBadge("ComID", btnId)}</span>
                  </div>`
                  )
                  .join("") +
                `</div>`
            )
            .join("") +
          `</div>`
        );
      })();

      const empty =
        !favorites.length && !macros.length && !btnIds.length
          ? `<div class="inner-empty">No cached data yet.</div>`
          : "";

      bodyHtml = `<div class="entity-body">${favHtml}${macHtml}${btnHtml}${empty}</div>`;
    }

    return `
      <div class="entity-block${isOpen ? " open" : ""}" id="entity-${key}">
        <div class="entity-summary" data-entity-key="${key}">
          <span class="entity-name">${this._escape(activity.name || `Activity ${id}`)}</span>
          ${this._idBadge("DevID", id)}
          <span class="entity-count">${favCount} favs · ${macCount} macros · ${btnCount} btns</span>
          <button class="icon-btn${isSpinning ? " spinning" : ""}"
            title="${proxyLocked ? "Unavailable while proxy client is connected" : "Refresh"}"
            data-refresh-kind="activity"
            data-refresh-target="${id}"
            ${locked ? "disabled" : ""}>↻</button>
          <span class="entity-chevron">▼</span>
        </div>
        ${bodyHtml}
      </div>`;
  }

  _renderDevice(hub, device) {
    const id = Number(device.id);
    const key = `dev-${id}`;
    const isOpen = this._openEntity === key;
    const proxyLocked = this._proxyClientConnected(this._selectedHub());
    const locked = this._refreshBusy || proxyLocked;
    const isSpinning = this._refreshBusy && this._activeRefreshLabel === key;

    let bodyHtml = "";
    if (isOpen) {
      const commands = this._deviceCommands(hub, id);
      bodyHtml =
        `<div class="entity-body">` +
        (commands.length
          ? commands
              .map(
                (c) => `
              <div class="inner-row">
                <span class="inner-label">${this._escape(c.label)}</span>
                <span class="inner-badges">${this._idBadge("ComID", c.id)}</span>
              </div>`
              )
              .join("")
          : `<div class="inner-empty">No cached commands.</div>`) +
        `</div>`;
    }

    return `
      <div class="entity-block${isOpen ? " open" : ""}" id="entity-${key}">
        <div class="entity-summary" data-entity-key="${key}">
          <span class="entity-name">${this._escape(device.name || `Device ${id}`)}</span>
          ${this._idBadge("DevID", id)}
          <span class="entity-count">${Number(device.command_count || 0)} cmds</span>
          <button class="icon-btn${isSpinning ? " spinning" : ""}"
            title="${proxyLocked ? "Unavailable while proxy client is connected" : "Refresh"}"
            data-refresh-kind="device"
            data-refresh-target="${id}"
            ${locked ? "disabled" : ""}>↻</button>
          <span class="entity-chevron">▼</span>
        </div>
        ${bodyHtml}
      </div>`;
  }

  _renderAccordionSection(sectionId, title, count, itemsHtml) {
    const isOpen = this._openSection === sectionId;
    const proxyLocked = this._proxyClientConnected(this._selectedHub());
    const locked = this._refreshBusy || proxyLocked;

    return `
      <div class="accordion-section${isOpen ? " open" : ""}" id="acc-${sectionId}">
        <div class="acc-header" data-section="${sectionId}">
          <span class="acc-title">${title}</span>
          <span class="badge">${count}</span>
          <span class="flex-spacer"></span>
          <span class="refresh-list-label">Refresh list</span>
          <button class="icon-btn${this._refreshBusy ? " spinning" : ""}"
            id="refresh-${sectionId}"
            title="${proxyLocked ? "Unavailable while proxy client is connected" : `Refresh ${title.toLowerCase()} list`}"
            ${locked ? "disabled" : ""}>↻</button>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? `<div class="acc-body" id="acc-body-${sectionId}">${itemsHtml}</div>` : ""}
      </div>`;
  }

  _renderHubTab(hub) {
    if (this._loading) {
      return `<div class="cache-state">Loading…</div>`;
    }
    if (this._loadError) {
      return `<div class="cache-state error">${this._escape(this._loadError)}</div>`;
    }
    if (!hub) {
      return `<div class="cache-state">No hubs found.</div>`;
    }

    const connected = this._hubConnected(hub);
    const proxyOn   = this._proxyClientConnected(hub);
    const haActive = connected || proxyOn;
    const haFullyActive = connected && proxyOn;
    const row = (kind, label, value) => `
      <div class="hub-row">
        <span class="hub-row-icon">${this._hubIconSvg(kind, "hub-row-icon-svg")}</span>
        <span class="hub-row-label">${label}</span>
        <span class="hub-row-value">${value}</span>
      </div>`;

    return `
      <div class="tab-panel scrollable">
        <div class="hub-hero">
          <div class="hub-ident hub-ident--hero">
            <div class="hub-ident-name">${this._escape(hub.name || "Unknown")}</div>
          </div>
          <div class="hub-connection-strip" role="img" aria-label="Hub connection status">
            <div class="hub-connection-node hub-connection-node--hub${connected ? " is-active" : ""}">
              <span class="hub-connection-node-icon hub-connection-node-icon--hub">
                ${this._hubIconSvg("hero", "hub-hero-icon")}
              </span>
            </div>
            <div class="hub-connection-link${connected ? " is-active" : ""}">
              <span class="hub-connection-link-line"></span>
            </div>
            <div class="hub-connection-node hub-connection-node--ha${haActive ? " is-active" : ""}${haFullyActive ? " is-bridged" : ""}">
              <span class="hub-connection-node-icon hub-connection-node-icon--mdi">
                <ha-icon icon="mdi:home-assistant"></ha-icon>
              </span>
            </div>
            <div class="hub-connection-link${proxyOn ? " is-active" : ""}">
              <span class="hub-connection-link-line"></span>
            </div>
            <div class="hub-connection-node hub-connection-node--app${proxyOn ? " is-active" : ""}">
              <span class="hub-connection-node-icon hub-connection-node-icon--mdi">
                <ha-icon icon="mdi:tablet-cellphone"></ha-icon>
              </span>
            </div>
          </div>
        </div>
        <div class="hub-badges">
          <span class="hub-conn-badge ${connected ? "hub-conn-badge--on" : "hub-conn-badge--off"}">
            ${connected ? "Hub connected" : "Hub not connected"}
          </span>
          <span class="hub-proxy-badge ${proxyOn ? "hub-proxy-badge--on" : "hub-proxy-badge--off"}">
            ${proxyOn ? "App connected" : "App not connected"}
          </span>
        </div>
        <div class="hub-info-list">
          ${hub.version    ? row("version", "Version", "Sofabaton " + this._escape(hub.version))    : ""}
          ${hub.ip_address ? row("ip", "IP Address", this._escape(hub.ip_address)) : ""}
          ${row("activities", "Activities", Number(hub.activity_count || 0))}
          ${row("devices", "Devices", Number(hub.device_count || 0))}
        </div>
      </div>`;
  }

  _renderSettingTile({ title, description, controlHtml, classes = "", attrs = "" }) {
    return `
      <div class="setting-tile ${classes}" ${attrs}>
        <div class="setting-tile-header">
          <div class="setting-title">${title}</div>
          ${controlHtml || ""}
        </div>
        <div class="setting-description">${description}</div>
      </div>`;
  }

  _renderSettingsTab(hub) {
    if (this._loading) {
      return `<div class="cache-state">Loading…</div>`;
    }
    if (this._loadError) {
      return `<div class="cache-state error">${this._escape(this._loadError)}</div>`;
    }
    if (!hub) {
      return `<div class="cache-state">No hubs found.</div>`;
    }

    const settings = hub.settings || {};
    const busy = !!(this._pendingSettingKey || this._pendingActionKey);
    const canFind = this._canRunHubActions(hub) && !busy;
    const canSync = this._canRunHubActions(hub) && !busy;
    return `
      <div class="tab-panel scrollable">
        <div class="acc-title">Configuration</div>
        <div class="settings-grid">
          ${this._renderSettingTile({
            title: "Persistent Cache",
            description: "Store activity and device data locally for faster access.",
            controlHtml: `<ha-switch id="setting-persistent_cache"></ha-switch>`,
            classes: `toggle${this._pendingSettingKey || this._pendingActionKey ? " disabled" : ""}`,
            attrs: `data-setting-tile="persistent_cache"`,
          })}
          ${this._renderSettingTile({
            title: "Hex Logging",
            description: "Write raw IR hex codes to the HA log for debugging.",
            controlHtml: `<ha-switch id="setting-hex_logging_enabled"></ha-switch>`,
            classes: `toggle${this._pendingSettingKey || this._pendingActionKey ? " disabled" : ""}`,
            attrs: `data-setting-tile="hex_logging_enabled"`,
          })}
          ${this._renderSettingTile({
            title: "Proxy",
            description: "Let the official Sofabaton app share the hub connection with HA simultaneously.",
            controlHtml: `<ha-switch id="setting-proxy_enabled"></ha-switch>`,
            classes: `toggle${this._pendingSettingKey || this._pendingActionKey ? " disabled" : ""}`,
            attrs: `data-setting-tile="proxy_enabled"`,
          })}
          ${this._renderSettingTile({
            title: "WiFi Device",
            description: "Enable the HTTP listener that captures remote button presses and routes them to HA actions.",
            controlHtml: `<ha-switch id="setting-wifi_device_enabled"></ha-switch>`,
            classes: `toggle${this._pendingSettingKey || this._pendingActionKey ? " disabled" : ""}`,
            attrs: `data-setting-tile="wifi_device_enabled"`,
          })}
          ${this._renderSettingTile({
            title: "Find Remote",
            description: "Make the remote beep so you can locate it.",
            controlHtml: `<span class="setting-icon">🔔</span>`,
            classes: `action${canFind ? "" : " disabled"}`,
            attrs: `data-action-tile="find_remote"`,
          })}
          ${this._renderSettingTile({
            title: "Sync Remote",
            description: "Push the latest configuration to the physical remote.",
            controlHtml: `<span class="setting-icon">🔄</span>`,
            classes: `action${canSync ? "" : " disabled"}`,
            attrs: `data-action-tile="sync_remote"`,
          })}
        </div>
      </div>`;
  }

  _renderCacheTab(hub) {
    if (this._loading) {
      return `<div class="cache-state">Loading…</div>`;
    }
    if (this._loadError) {
      return `<div class="cache-state error">${this._escape(this._loadError)}</div>`;
    }
    if (!this._persistentCacheEnabled()) {
      return `
        <div class="cache-state">
          <div class="cache-state-icon">💾</div>
          <div class="cache-state-title">Persistent cache is off</div>
          <div class="cache-state-sub">Enable it from the Settings tab to browse cached activities and devices.</div>
        </div>`;
    }
    if (!hub) {
      return `<div class="cache-state">No hubs found.</div>`;
    }

    const activities = this._hubActivities(hub);
    const devices = this._devicesForHub(hub);

    const staleBanner = this._staleData
      ? `<div class="stale-banner">
           <span class="stale-banner-text">Cache was updated externally. Refresh to see latest data.</span>
           <button class="stale-banner-btn" data-action="refresh-stale">Refresh</button>
         </div>`
      : "";

    return `
      <div class="tab-panel">
        ${staleBanner}
        <div class="cache-panel">
          ${this._renderAccordionSection(
            "activities",
            "Activities",
            activities.length,
            activities.map((a) => this._renderActivity(hub, a)).join("")
          )}
          ${this._renderAccordionSection(
            "devices",
            "Devices",
            devices.length,
            devices.map((d) => this._renderDevice(hub, d)).join("")
          )}
        </div>
      </div>`;
  }

  _renderTabButtons() {
    const tabs = [
      { id: "hub", label: "Hub", disabled: false },
      { id: "settings", label: "Settings", disabled: false },
      { id: "cache", label: "Cache", disabled: !this._persistentCacheEnabled() },
    ];
    return tabs
      .map(
        (tab) => `
          <button
            class="tab-btn${this._selectedTab === tab.id ? " active" : ""}${tab.disabled ? " tab-disabled" : ""}"
            data-tab="${tab.id}"
            ${tab.disabled ? 'aria-disabled="true"' : ""}
          >${tab.label}</button>`
      )
      .join("");
  }

  _renderActiveTab(hub, hubCache) {
    if (this._selectedTab === "settings") return this._renderSettingsTab(hub);
    if (this._selectedTab === "cache") return this._renderCacheTab(hubCache);
    return this._renderHubTab(hub);
  }

  _render() {
    if (!this._hass || !this._root || !this._isCardConnected) return;

    const scrollSnapshot = this._captureCacheScrollState();

    const hub = this._selectedHub();
    const hubCache = this._selectedHubCache();
    const hubs = Array.isArray(this._state?.hubs) ? this._state.hubs : [];

    this._root.innerHTML = `
      ${this._styles()}
      <ha-card>
        <div class="card-inner" style="height:${this._config?.card_height ?? 600}px">
          <div class="card-header">
            <span class="card-title">Sofabaton Control Panel</span>
            ${
              hubs.length > 1
                ? `<button class="hub-picker-btn" id="hub-picker-btn">
                    <span class="chip-label">Hub</span>
                    <span class="chip-name">${this._escape(hub?.name || hub?.entry_id || "")}</span>
                    <span class="chip-arrow">▾</span>
                  </button>`
                : ""
            }
          </div>
          <div class="tabs">${this._renderTabButtons()}</div>
          <div class="card-body">
            ${this._renderActiveTab(hub, hubCache)}
          </div>
        </div>
      </ha-card>
      ${
        hubs.length > 1
          ? `<dialog id="hub-picker-dialog" class="hub-picker-dialog">
              ${hubs
                .map(
                  (h) =>
                    `<div class="hub-option${h.entry_id === this._selectedHubEntryId ? " selected" : ""}" data-entry-id="${this._escape(h.entry_id)}">${this._escape(h.name || h.entry_id)}</div>`
                )
                .join("")}
             </dialog>`
          : ""
      }
    `;

    this._wireUp(hub);
    this._restoreCacheScrollState(scrollSnapshot);
  }

  _wireUp(hub) {
    const root = this._root;

    const pickerBtn = root.getElementById("hub-picker-btn");
    const pickerDialog = root.getElementById("hub-picker-dialog");
    if (pickerBtn && pickerDialog) {
      pickerBtn.addEventListener("click", () => {
        const rect = pickerBtn.getBoundingClientRect();
        pickerDialog.style.top = `${rect.bottom + 4}px`;
        pickerDialog.style.left = `${Math.max(8, rect.right - (pickerDialog.offsetWidth || 160))}px`;
        pickerDialog.showModal();
        pickerDialog.style.left = `${Math.max(8, rect.right - pickerDialog.offsetWidth)}px`;
      });
      pickerDialog.addEventListener("click", (e) => {
        const opt = e.target.closest(".hub-option");
        if (opt) {
          this._selectedHubEntryId = opt.dataset.entryId;
          this._openEntity = null;
          pickerDialog.close();
          this._render();
          this._loadControlPanelState().then(() => this._render());
        } else {
          pickerDialog.close();
        }
      });
    }

    root.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tabId = btn.getAttribute("data-tab");
        if (btn.classList.contains("tab-disabled")) return;
        this._selectedTab = tabId;
        this._render();
      });
    });

    ["persistent_cache", "hex_logging_enabled", "proxy_enabled", "wifi_device_enabled"].forEach((settingKey) => {
      const sw = root.getElementById(`setting-${settingKey}`);
      if (!sw) return;

      let checked = false;
      if (settingKey === "persistent_cache") checked = this._persistentCacheEnabled();
      else checked = !!hub?.settings?.[settingKey];

      sw.checked = checked;
      sw.disabled = !!(this._pendingSettingKey || this._pendingActionKey);
      sw.addEventListener("change", (ev) => this._setSetting(settingKey, !!ev.target?.checked));
    });

    root.querySelectorAll("[data-setting-tile]").forEach((tile) => {
      const clearPressed = () => tile.classList.remove("pressed");
      tile.addEventListener("pointerdown", () => {
        if (tile.classList.contains("disabled")) return;
        tile.classList.add("pressed");
      });
      tile.addEventListener("pointerup", clearPressed);
      tile.addEventListener("pointercancel", clearPressed);
      tile.addEventListener("pointerleave", clearPressed);
      tile.addEventListener("click", (ev) => {
        if (tile.classList.contains("disabled")) return;
        if (ev.target.closest("ha-switch")) return;
        const settingKey = tile.getAttribute("data-setting-tile");
        if (!settingKey) return;

        const currentHub = this._selectedHub();
        let enabled = false;
        if (settingKey === "persistent_cache") enabled = !this._persistentCacheEnabled();
        else enabled = !currentHub?.settings?.[settingKey];

        this._setSetting(settingKey, enabled);
      });
    });

    root.querySelectorAll("[data-action-tile]").forEach((tile) => {
      const clearPressed = () => tile.classList.remove("pressed");
      tile.addEventListener("pointerdown", () => {
        if (tile.classList.contains("disabled")) return;
        tile.classList.add("pressed");
      });
      tile.addEventListener("pointerup", clearPressed);
      tile.addEventListener("pointercancel", clearPressed);
      tile.addEventListener("pointerleave", clearPressed);
      tile.addEventListener("click", () => {
        if (tile.classList.contains("disabled")) return;
        this._runHubAction(tile.getAttribute("data-action-tile"));
      });
    });

    root.querySelector('[data-action="refresh-stale"]')?.addEventListener("click", () => {
      this._staleData = false;
      this._loadState();
    });

    root.querySelectorAll("[data-section]").forEach((header) => {
      header.addEventListener("click", (e) => {
        if (e.target.closest(".icon-btn")) return;
        const sectionId = header.dataset.section;
        this._openSection = this._openSection === sectionId ? null : sectionId;
        this._openEntity = null;
        this._render();
      });
    });

    ["activities", "devices"].forEach((sectionId) => {
      root.getElementById(`refresh-${sectionId}`)?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._refreshSection(sectionId);
      });
    });

    root.querySelectorAll("[data-entity-key]").forEach((summary) => {
      summary.addEventListener("click", (e) => {
        if (e.target.closest(".icon-btn")) return;
        const key = summary.dataset.entityKey;
        const opening = this._openEntity !== key;
        this._openEntity = opening ? key : null;
        this._render();
        if (opening) requestAnimationFrame(() => this._scrollEntityToTop(key));
      });
    });

    root.querySelectorAll("[data-refresh-kind]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!hub) return;
        const kind = btn.getAttribute("data-refresh-kind");
        const targetId = Number(btn.getAttribute("data-refresh-target"));
        const key = `${kind === "activity" ? "act" : "dev"}-${targetId}`;
        this._refreshForHub(kind, hub.entry_id, targetId, key);
      });
    });
  }
}

class SofabatonControlPanelEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  _render() {
    const height = this._config?.card_height ?? 600;
    this.innerHTML = `
      <style>
        .editor-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
        .editor-row label { flex: 1; font-size: 14px; color: var(--primary-text-color); }
        .editor-row input[type=number] {
          width: 90px; padding: 6px 8px;
          border: 1px solid var(--divider-color);
          border-radius: 6px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font-size: 14px;
        }
        .editor-hint { font-size: 12px; color: var(--secondary-text-color); padding-bottom: 4px; }
      </style>
      <div class="editor-row">
        <label>Card height (px)</label>
        <input type="number" id="card-height" min="200" max="1200" step="10" value="${height}">
      </div>
      <div class="editor-hint">Controls how much of the activity/device lists is visible. Default: 600 px.</div>
    `;
    this.querySelector("#card-height").addEventListener("change", (ev) => {
      const value = parseInt(ev.target.value, 10);
      if (!isNaN(value) && value >= 200 && value <= 1200) {
        this.dispatchEvent(new CustomEvent("config-changed", {
          detail: { config: { ...this._config, card_height: value } },
          bubbles: true,
          composed: true,
        }));
      }
    });
  }
}

const EDITOR_TYPE = `${TOOLS_TYPE}-editor`;
if (!customElements.get(TOOLS_TYPE)) {
  customElements.define(TOOLS_TYPE, SofabatonControlPanelCard);
}
if (!customElements.get(EDITOR_TYPE)) {
  customElements.define(EDITOR_TYPE, SofabatonControlPanelEditor);
}

window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === TOOLS_TYPE)) {
  window.customCards.push({
    type: TOOLS_TYPE,
    name: "Sofabaton Control Panel",
    description: "Manage and inspect the Sofabaton X1S integration",
  });
}
