const CARD_NAME = "Sofabaton Virtual Remote";
const CARD_VERSION = "0.0.3";
const LOG_ONCE_KEY = `__${CARD_NAME}_logged__`;
const TYPE = "sofabaton-virtual-remote";
const EDITOR = "sofabaton-virtual-remote-editor";

// Numeric IDs (for enabled_buttons)
const ID = {
  UP: 174, DOWN: 178, LEFT: 175, RIGHT: 177, OK: 176,
  BACK: 179, HOME: 180, MENU: 181,
  VOL_UP: 182, VOL_DOWN: 185, MUTE: 184,
  CH_UP: 183, CH_DOWN: 186,

  GUIDE: 157,      // X2
  DVR: 155,        // X2
  PLAY: 156,       // X2
  EXIT: 154,       // X2
  A: 153, B: 152, C: 151, // X2

  REW: 187, PAUSE: 188, FWD: 189,
  RED: 190, GREEN: 191, YELLOW: 192, BLUE: 193,
};

const POWERED_OFF_LABELS = new Set(["powered off", "powered_off", "off"]);

function logPillsOnce() {
  if (window[LOG_ONCE_KEY]) return;
  window[LOG_ONCE_KEY] = true;

  // Base pill styling (console supports these reliably)
  const base =
    "padding:2px 10px;" +
    "border-radius:999px;" +
    "font-weight:700;" +
    "font-size:12px;" +
    "line-height:18px;";

  const red    = base + "background:#ef4444;color:#fff;";
  const green  = base + "background:#22c55e;color:#062b12;";
  const yellow = base + "background:#facc15;color:#111827;";
  const blue   = base + "background:#3b82f6;color:#fff;";

  // A tiny spacer between pills (just normal text)
  const gap = "color:transparent;"; // keeps spacing without visible characters

  console.log(
    `%cSofabaton%c %c Virtual %c %c  Remote  %c %c   ${CARD_VERSION}   `,
    red, gap,
    green, gap,
    yellow, gap,
    blue
  );
}

// Call at module load (top-level)
logPillsOnce();

class SofabatonRemoteCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Select a Sofabaton remote entity");
    }

    // Defaults first, then user config overwrites
    this._config = {
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_media: true,
      show_colors: true,
      show_abc: true,
      theme: "",
      background_override: null,
      show_macro_favorites: true,
      show_macros_button: null,
      show_favorites_button: null,
      custom_favorites: [],
      max_width: 360,
      ...config,
    };

    this._activeDrawer = null;

    this._initPromise = this._initPromise || this._ensureHaElements();
    this._initPromise.then(() => {
      this._render();
      this._update();
    });
  }

  set hass(hass) {
    this._hass = hass;
    (this._initPromise || Promise.resolve()).then(async () => {
      await this._ensureIntegration();
      this._update();
    });
  }
  // ---------- State helpers ----------
  _remoteState() {
    return this._hass?.states?.[this._config?.entity];
  }

  // ---------- Integration detection (x1s vs hub) ----------
  async _ensureIntegration() {
    if (!this._hass?.callWS || !this._config?.entity) return;

    const entityId = String(this._config.entity);

    // Entity changed -> clear Hub bootstrap/request state so we can re-initialize cleanly.
    if (this._integrationEntityId && this._integrationEntityId !== entityId) {
      this._hubRequestCache = null;
      this._hubRequestSeen = null;
      this._hubQueue = null;
      this._hubQueueBusy = false;
      this._hubActivitiesCache = null;
      this._hubAssignedKeysCache = null;
      this._hubMacrosCache = null;
      this._hubFavoritesCache = null;
    }

    if (this._integrationEntityId === entityId && this._integrationDomain) return;
    if (this._integrationDetectingFor === entityId) return;

    this._integrationDetectingFor = entityId;
    try {
      const entry = await this._hass.callWS({
        type: "config/entity_registry/get",
        entity_id: entityId,
      });
      // Entity registry exposes the integration as `platform` for the entity
      this._integrationDomain = String(entry?.platform || "");
      this._integrationEntityId = entityId;
    } catch (e) {
      this._integrationDomain = null;
      this._integrationEntityId = entityId;
    } finally {
      this._integrationDetectingFor = null;
    }
  }

  _isHubIntegration() {
    return String(this._integrationDomain || "") === "sofabaton_hub";
  }

  _showMacrosButton() {
    // Backwards-compatible: if the new per-button option isn't set, fall back to the old combined toggle
    if (typeof this._config?.show_macros_button === 'boolean') return this._config.show_macros_button;
    return Boolean(this._config?.show_macro_favorites);
  }

  _showFavoritesButton() {
    if (typeof this._config?.show_favorites_button === 'boolean') return this._config.show_favorites_button;
    return Boolean(this._config?.show_macro_favorites);
  }

  _customFavorites() {
    const arr = this._config?.custom_favorites;
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const norm = this._normalizeCustomFavorite(arr[i], i);
      if (norm) out.push(norm);
    }
    return out;
  }

  _normalizeCustomFavorite(item, idx = 0) {
    if (!item || typeof item !== 'object') return null;
    const name = String(item.name ?? item.label ?? '').trim();
    if (!name) return null;

    const icon = item.icon != null && String(item.icon).trim() ? String(item.icon).trim() : null;

    // Either: explicit IDs OR an arbitrary Lovelace Action
    const action = (item.action && typeof item.action === 'object') ? item.action : ((item.tap_action && typeof item.tap_action === 'object') ? item.tap_action : null);

    const rawCmd = item.command_id ?? item.key_id ?? item.command ?? item.key ?? item.id ?? null;
    const rawDev = item.device_id ?? item.activity_id ?? item.device ?? item.activity ?? null;

    const cmd = rawCmd != null ? Number(rawCmd) : null;
    const dev = rawDev != null ? Number(rawDev) : null;

    const hasIds = Number.isFinite(cmd) && (rawDev == null || Number.isFinite(dev));
    const hasAction = !!(action && (action.action || action.service || action.perform_action || action.navigation_path || action.url_path));

    if (!hasIds && !hasAction) return null;

    return {
      __custom: true,
      name,
      icon,
      action: hasAction ? action : null,
      command_id: Number.isFinite(cmd) ? cmd : null,
      device_id: Number.isFinite(dev) ? dev : null,
      _idx: idx,
      _raw: item,
    };
  }

  _customFavoritesSignature(items) {
    const list = Array.isArray(items) ? items : [];
    const parts = list.map((it) => {
      const n = String(it?.name ?? '');
      const ic = String(it?.icon ?? '');
      const cmd = String(it?.command_id ?? '');
      const dev = String(it?.device_id ?? '');
      let act = '';
      try { act = it?.action ? JSON.stringify(it.action) : ''; } catch (e) { act = '[unserializable]'; }
      return `${n}|${ic}|${cmd}|${dev}|${act}`;
    });
    return `${parts.length}:${parts.join(';;')}`;
  }


  // ---------- Hub request queue (prevents parallel requests) ----------
  _hubInitState() {
    this._hubRequestSeen = this._hubRequestSeen || {};
    this._hubQueue = this._hubQueue || [];
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _hasOwn(obj, key) {
    return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
  }

  _hubMarkRequested(key) {
    this._hubInitState();
    if (!key) return;
    this._hubRequestSeen[key] = true;
  }

  _hubWasRequested(key) {
    this._hubInitState();
    return Boolean(key && this._hubRequestSeen[key]);
  }

  _hubEnqueueCommand(list, { priority = false, gapMs = 150 } = {}) {
    if (!this._isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;

    this._hubInitState();

    const item = { list, gapMs: Number(gapMs) };
    if (priority) {
      this._hubQueue.unshift(item);
    } else {
      this._hubQueue.push(item);
    }

    // Fire and forget drain (single-flight)
    this._hubDrainQueue().catch(() => {});
  }

  _hubEnqueueRequest(list, requestKey) {
    if (!this._isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;

    this._hubInitState();

    // Card-level de-dupe: we intentionally do NOT rely on the attributes changing
    // because some requests can validly result in an empty array.
    if (requestKey && this._hubWasRequested(requestKey)) return;
    if (requestKey) this._hubMarkRequested(requestKey);

    // Requests are more fragile than normal key presses; keep a larger gap.
    this._hubEnqueueCommand(list, { priority: false, gapMs: 3000 });
  }

  async _hubDrainQueue() {
    if (!this._isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;

    this._hubInitState();
    if (this._hubQueueBusy) return;
    this._hubQueueBusy = true;
    try {
      while (this._hubQueue.length) {
        const next = this._hubQueue.shift();
        if (!next?.list) continue;
        await this._callService("remote", "send_command", {
          entity_id: this._config.entity,
          command: next.list,
        });

        // A small delay between calls improves reliability.
        const gap = Number.isFinite(Number(next?.gapMs)) ? Number(next.gapMs) : 750;
        await this._sleep(gap);
      }
    } finally {
      this._hubQueueBusy = false;
    }
  }

  _hubThrottle(key, minIntervalMs = 3000) {
    this._hubRequestCache = this._hubRequestCache || {};
    const now = Date.now();
    const last = this._hubRequestCache[key] || 0;
    if (now - last < minIntervalMs) return false;
    this._hubRequestCache[key] = now;
    return true;
  }

  async _hubSendCommandList(list, throttleKey = null, minIntervalMs = 3000) {
    if (!this._isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;

    // If we're already running queued hub traffic (e.g. bootstrapping request_* calls),
    // serialize user commands too (but prioritize them) to reduce dropped calls.
    this._hubInitState();

    if (throttleKey) {
      if (!this._hubThrottle(throttleKey, minIntervalMs)) return;
    }

    if (this._hubQueueBusy || (Array.isArray(this._hubQueue) && this._hubQueue.length)) {
      this._hubEnqueueCommand(list, { priority: true, gapMs: 150 });
      return;
    }

    await this._callService("remote", "send_command", {
      entity_id: this._config.entity,
      command: list,
    });
  }

  async _hubRequestBasicData() {
    const entityId = String(this._config?.entity || "");
    this._hubEnqueueRequest(["type:request_basic_data"], "req:basic:" + entityId);
  }

  async _hubRequestAssignedKeys(activityId) {
    if (activityId == null) return;
    this._hubEnqueueRequest(
      ["type:request_assigned_keys", "activity_id:" +  Number(activityId) ],
      "req:assigned:" + String(activityId)
    );
  }

  async _hubRequestFavoriteKeys(activityId) {
    if (activityId == null) return;
    this._hubEnqueueRequest(
      [ "type:request_favorite_keys", "activity_id:" +  Number(activityId) ],
      "req:fav:" + String(activityId)
    );
  }

  async _hubRequestMacroKeys(activityId) {
    if (activityId == null) return;
    this._hubEnqueueRequest(
      [ "type:request_macro_keys", "activity_id:" +  Number(activityId) ],
      "req:macro:" + String(activityId)
    );
  }

  async _hubStartActivity(activityId) {
    if (activityId == null) return;
    await this._hubSendCommandList([ "type:start_activity", "activity_id:"+  Number(activityId) ]);
  }

  async _hubStopActivity(activityId) {
    if (activityId == null) return;
    await this._hubSendCommandList([ "type:stop_activity", "activity_id:"+  Number(activityId) ]);
  }

  async _sendDrawerItem(itemType, commandId, deviceId, rawItem) {
    // X1S/X1 path
    if (!this._isHubIntegration()) {
      return this._sendCommand(commandId, deviceId);
    }

    // Hub path
    if (!this._hass || !this._config?.entity) return;

    const activityId = Number(deviceId ?? this._currentActivityId());
    const keyId = Number(commandId);
    if (!Number.isFinite(keyId)) return;

    if (itemType === 'macros') {
      if (!Number.isFinite(activityId)) return;
      return this._hubSendCommandList([ "type:send_macro_key", "activity_id:" +  activityId, "key_id:" + keyId ]);
    }

    if (itemType === 'favorites') {
      const device = Number(rawItem?.device_id ?? rawItem?.device);
      if (!Number.isFinite(device)) return;
      return this._hubSendCommandList([ "type:send_favorite_key", "device_id:" + device, "key_id:" + keyId ]);
    }

    // Default: assigned key (normal buttons)
    if (!Number.isFinite(activityId)) return;
    return this._hubSendCommandList([ "type:send_assigned_key", "activity_id:" + activityId, "key_id:" + keyId ]);
  }

  _hubVersion() {
    return String(this._remoteState()?.attributes?.hub_version || "").toUpperCase();
  }

  _isX2() {
    // sofabaton_hub == X2 hub always
    if (this._isHubIntegration()) return true;

    return this._hubVersion().includes("X2");
  }

  _enabledButtons() {
    return this._enabledButtonsCache || [];
  }

  _isEnabled(id) {
    const enabled = this._enabledButtons();
    if (this._enabledButtonsInvalid) return true;
    if (!enabled.length) return true; // fail-open
    return enabled.some((entry) => entry.command === Number(id));
  }

  _commandTarget(id) {
    const enabled = this._enabledButtons();
    const match = enabled.find((entry) => entry.command === Number(id));
    return match || null;
  }

  _currentActivityId() {
    const remote = this._remoteState();
    const activityId = remote?.attributes?.current_activity_id;
    if (activityId != null) return Number(activityId);
    return null;
  }

  _activities() {
    const list = this._remoteState()?.attributes?.activities;

    // Hub integration can clear attributes entirely when all activities are off.
    // Keep the last known activities list in-card so the selector remains useful
    // without constantly re-requesting basic data.
    const source = Array.isArray(list) && list.length
      ? list
      : (this._isHubIntegration() && Array.isArray(this._hubActivitiesCache) ? this._hubActivitiesCache : []);

    const mapped = source
      .map((activity) => ({
        id: Number(activity?.id),
        name: String(activity?.name ?? ""),
        state: String(activity?.state ?? ""),
      }))
      .filter((activity) => Number.isFinite(activity.id) && activity.name);

    if (this._isHubIntegration() && Array.isArray(list) && list.length) {
      this._hubActivitiesCache = list;
    }

    return mapped;
  }

  _currentActivityLabel() {
    const remoteActivity = this._remoteState()?.attributes?.current_activity;
    if (remoteActivity) return String(remoteActivity);
    const activityId = this._currentActivityId();
    const match = this._activities().find((activity) => activity.id === activityId);
    return match?.name || "";
  }

  _isPoweredOffLabel(state) {
    const s = String(state || "").trim().toLowerCase();
    return POWERED_OFF_LABELS.has(s);
  }

  _isActivityOn(activityId, activities = null) {
    if (activityId == null) return false;
    const id = Number(activityId);
    if (!Number.isFinite(id)) return false;

    // Prefer explicit activity state if we have it.
    const list = Array.isArray(activities) ? activities : this._activities();
    const match = Array.isArray(list) ? list.find((a) => Number(a?.id) === id) : null;
    if (match && match.state != null && String(match.state).trim() !== "") {
      const s = String(match.state).trim().toLowerCase();
      // Any non-off label is treated as ON.
      return !this._isPoweredOffLabel(s) && s !== "off";
    }

    // Fallback: if HA reports a current_activity_id, treat it as ON unless the label is powered off.
    const label = this._currentActivityLabel();
    return Boolean(label) && !this._isPoweredOffLabel(label);
  }

  _isLoadingActive() {
    const isActivityLoading = Boolean(this._activityLoadActive);
    const isPulse = this._commandPulseUntil && Date.now() < this._commandPulseUntil;
    return isActivityLoading || isPulse;
  }

  _updateLoadIndicator() {
    if (!this._loadIndicator) return;
    const active = this._isLoadingActive();
    if (this._loadIndicatorActive === active) return;
    this._loadIndicatorActive = active;
    this._loadIndicator.classList.toggle("is-loading", active);
  }

  _triggerCommandPulse() {
    this._commandPulseUntil = Date.now() + 1000;
    this._updateLoadIndicator();
    clearTimeout(this._commandPulseTimeout);
    this._commandPulseTimeout = setTimeout(() => {
      this._updateLoadIndicator();
    }, 1000);
  }

  _startActivityLoading(target) {
    this._activityLoadTarget = String(target ?? "");
    this._activityLoadActive = true;
    this._activityLoadStartedAt = Date.now();
    this._updateLoadIndicator();
    clearTimeout(this._activityLoadTimeout);
    this._activityLoadTimeout = setTimeout(() => {
      if (this._activityLoadActive) {
        this._activityLoadActive = false;
        this._updateLoadIndicator();
      }
    }, 60000);
  }

  _stopActivityLoading() {
    if (!this._activityLoadActive) return;
    this._activityLoadActive = false;
    this._activityLoadTarget = null;
    this._activityLoadStartedAt = null;
    clearTimeout(this._activityLoadTimeout);
    this._updateLoadIndicator();
  }

  // ---------- Services ----------
  async _callService(domain, service, data) {
    await this._hass.callService(domain, service, data);
  }

  _fireEvent(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  async _runLovelaceAction(actionConfig, context = null) {
    if (!actionConfig || typeof actionConfig !== 'object') return;

    const action = String(actionConfig.action || '').toLowerCase();

    // If the config looks like a service action but omitted `action:`, treat it as one.
    const implicitService = (!action || action === 'default') && (actionConfig.service || actionConfig.perform_action);

    if (action === 'none') return;

    if (action === 'call-service' || action === 'perform-action' || implicitService) {
      const svc = String(actionConfig.service || actionConfig.perform_action || '').trim();
      if (!svc.includes('.')) return;
      const [domain, service] = svc.split('.', 2);

      const serviceData = { ...(actionConfig.service_data || actionConfig.data || {}) };
      const target = actionConfig.target;
      // Home Assistant allows passing `target` inside the data payload.
      const payload = target && typeof target === 'object' ? { ...serviceData, target } : serviceData;

      await this._callService(domain, service, payload);
      return;
    }

    if (action === 'toggle') {
      const entityId = actionConfig.entity_id || actionConfig.entity || context?.entity_id || context?.entityId;
      if (!entityId) return;
      await this._callService('homeassistant', 'toggle', { entity_id: entityId });
      return;
    }

    if (action === 'more-info') {
      const entityId = actionConfig.entity_id || actionConfig.entity || context?.entity_id || context?.entityId;
      if (!entityId) return;
      this._fireEvent('hass-more-info', { entityId });
      return;
    }

    if (action === 'navigate') {
      const path = actionConfig.navigation_path;
      if (!path) return;
      history.pushState(null, '', path);
      window.dispatchEvent(new Event('location-changed', { bubbles: true, composed: true }));
      return;
    }

    if (action === 'url') {
      const url = actionConfig.url_path;
      if (!url) return;
      window.open(url, '_blank');
      return;
    }

    if (action === 'fire-dom-event') {
      // Pass through - this is commonly used for browser_mod / custom integrations.
      this._fireEvent('ll-custom', actionConfig);
      return;
    }

    // Unknown/unsupported action -> no-op
  }

  async _sendCommand(commandId, deviceId = null) {
    if (!this._hass || !this._config?.entity) return;

    // If deviceId isn't provided, fall back to enabled_buttons override (activity_id) or current_activity_id
    const resolvedDevice =
      deviceId != null
        ? Number(deviceId)
        : (this._commandTarget(commandId)?.activity_id ?? this._currentActivityId());

    // Hub uses a different command payload
    if (this._isHubIntegration()) {
      if (resolvedDevice == null || !Number.isFinite(Number(resolvedDevice))) return;
      await this._hubSendCommandList(["type:send_assigned_key", "activity_id:" + Number(resolvedDevice), "key_id:"+ Number(commandId) ]);
      return;
    }

    // X1S/X1 style
    if (resolvedDevice == null || !Number.isFinite(Number(resolvedDevice))) return;

    await this._callService("remote", "send_command", {
      entity_id: this._config.entity,
      command: Number(commandId),
      device: Number(resolvedDevice),
    });
  }
  async _setActivity(option) {
    if (option == null || option === "") return;
    const selected = String(option);
    const current = this._currentActivityLabel();
    if (selected === current) return;

    this._pendingActivity = selected;
    this._pendingActivityAt = Date.now();
    this._startActivityLoading(selected);

    // Hub path: start/stop activities via send_command
    if (this._isHubIntegration()) {
      if (this._isPoweredOffLabel(selected)) {
        const currentId = this._currentActivityId();
        if (currentId != null) {
          await this._hubStopActivity(currentId);
        }
        return;
      }

      const match = this._activities().find((a) => a.name === selected);
      const activityId = match?.id;
      if (activityId == null) return;

      await this._hubStartActivity(activityId);
      return;
    }

    // X1S/X1 path
    if (this._isPoweredOffLabel(selected)) {
      await this._callService("remote", "turn_off", {
        entity_id: this._config.entity,
      });
      return;
    }

    await this._callService("remote", "turn_on", {
      entity_id: this._config.entity,
      activity: selected,
    });
  }

  // ---------- Theme/background helpers (per-card) ----------
  _rgbToCss(rgb) {
    // color_rgb selector returns [r,g,b] in HA
    if (Array.isArray(rgb) && rgb.length >= 3) {
      const r = Number(rgb[0]);
      const g = Number(rgb[1]);
      const b = Number(rgb[2]);
      if ([r, g, b].some((n) => Number.isNaN(n))) return "";
      return `rgb(${r}, ${g}, ${b})`;
    }
    // (Sometimes) can be { r, g, b }
    if (rgb && typeof rgb === "object" && rgb.r != null && rgb.g != null && rgb.b != null) {
      const r = Number(rgb.r);
      const g = Number(rgb.g);
      const b = Number(rgb.b);
      if ([r, g, b].some((n) => Number.isNaN(n))) return "";
      return `rgb(${r}, ${g}, ${b})`;
    }
    return "";
  }

  _applyLocalTheme(themeName) {
    if (!this._root || !this._hass) return;

    const bgOverrideCss = this._rgbToCss(this._config?.background_override);
    const appliedKey = `${themeName || ""}||${bgOverrideCss}`;

    if (this._appliedThemeKey === appliedKey) return;

    // Remove previously applied vars/properties
    if (this._appliedThemeVars?.length) {
      for (const cssVar of this._appliedThemeVars) {
        this._root.style.removeProperty(cssVar);
      }
    }
    this._appliedThemeVars = [];
    this._appliedThemeKey = appliedKey;

    // Apply selected theme vars as CSS vars on the card only
    let vars = null;
    if (themeName) {
      const themes = this._hass.themes?.themes;
      const def = themes?.[themeName];
      if (def && typeof def === "object") {
        vars = def;

        // Support themes with modes (light/dark)
        if (def.modes && typeof def.modes === "object") {
          const mode = this._hass.themes?.darkMode ? "dark" : "light";
          vars = { ...def, ...(def.modes?.[mode] || {}) };
          delete vars.modes;
        }

        for (const [k, v] of Object.entries(vars)) {
          if (v == null || (typeof v !== "string" && typeof v !== "number")) continue;
          const cssVar = k.startsWith("--") ? k : `--${k}`;
          this._root.style.setProperty(cssVar, String(v));
          this._appliedThemeVars.push(cssVar);
        }
      }
    }

    // Determine background and force it to stick
    const themeBg =
      vars?.["ha-card-background"] ??
      vars?.["card-background-color"] ??
      vars?.["ha-card-background-color"] ??
      vars?.["primary-background-color"] ??
      null;

    const finalBg = bgOverrideCss || themeBg;

    if (finalBg) {
      this._root.style.setProperty("--ha-card-background", String(finalBg));
      this._root.style.setProperty("--card-background-color", String(finalBg));
      this._root.style.setProperty("--ha-card-background-color", String(finalBg));

      // Force actual background so it doesn't "revert"
      this._root.style.setProperty("background", String(finalBg));
      this._root.style.setProperty("background-color", String(finalBg));

      this._appliedThemeVars.push(
        "--ha-card-background",
        "--card-background-color",
        "--ha-card-background-color",
        "background",
        "background-color"
      );
    } else {
      // EXPLICIT REVERT: If no override or theme background exists, 
      // ensure the forced properties are cleared.
      this._root.style.removeProperty("background");
      this._root.style.removeProperty("background-color");
    }
  }

  _updateGroupRadius() {
    if (!this._root) return;

    const cs = getComputedStyle(this._root);
    const candidates = [
      "--ha-card-border-radius",
      "--ha-control-border-radius",
      "--mdc-shape-medium",
      "--mdc-shape-small",
      "--mdc-shape-large",
    ];

    let radius = "";
    for (const name of candidates) {
      const v = (cs.getPropertyValue(name) || "").trim();
      if (v) { radius = v; break; }
    }
    if (!radius) radius = "18px";

    this._root.style.setProperty("--sb-group-radius", radius);

    // Track for cleanup on theme change
    this._appliedThemeVars = this._appliedThemeVars || [];
    if (!this._appliedThemeVars.includes("--sb-group-radius")) {
      this._appliedThemeVars.push("--sb-group-radius");
    }
  }

  _optionsSignature(options) {
    // Signature uses ordered activity names + count since labels drive select options.
    const names = Array.isArray(options) ? options.map((opt) => String(opt ?? "")) : [];
    return `${names.length}:${names.join(",")}`;
  }

  _drawerItemsSignature(items) {
    // Signature uses ordered command_id/id, device_id/device, and name for stable macro/favorite identity.
    const entries = Array.isArray(items)
      ? items.map((item) => {
        const commandId = String(item?.command_id ?? item?.id ?? "");
        const deviceId = String(item?.device_id ?? item?.device ?? "");
        const name = String(item?.name ?? "");
        return `${commandId}:${deviceId}:${name}`;
      })
      : [];
    return `${entries.length}:${entries.join(",")}`;
  }

  _enabledButtonsSignature(raw) {
    // Signature uses the raw assigned_keys entry for the active activity (order + values).
    if (!Array.isArray(raw)) return String(raw ?? "");
    return `${raw.length}:${raw.map((entry) => String(entry ?? "")).join(",")}`;
  }

  // ---------- UI helpers ----------
  _setVisible(el, on) {
    if (!el) return;
    if (on) {
      el.style.removeProperty("display");
    } else {
      // Use !important because some elements (e.g. macroFavoritesButton) force display with !important
      el.style.setProperty("display", "none", "important");
    }
  }
  
  _installOutsideCloseHandler() {
    if (this._outsideCloseInstalled) return;
    this._outsideCloseInstalled = true;

    this._onOutsidePointerDown = (e) => {
      // Nothing open -> nothing to do
      if (!this._activeDrawer) return;

      // Use composedPath so it works through shadow DOM + HA components
      const path = (typeof e.composedPath === "function") ? e.composedPath() : [];
      

      const clickedInOverlay =
        path.includes(this._macrosOverlayEl) || path.includes(this._favoritesOverlayEl);

      // Also exempt the toggle row/buttons so clicking Macros/Favorites still toggles normally
      const clickedInToggleRow =
        path.includes(this._macroFavoritesRow) ||
        path.includes(this._macrosButtonWrap) ||
        path.includes(this._favoritesButtonWrap);

      if (clickedInOverlay || clickedInToggleRow ) return;

      // Clicked "somewhere else" -> close
      this._activeDrawer = null;
      this._applyDrawerVisuals();
    };

    // Capture phase so we catch taps even if inner components stop propagation
    document.addEventListener("pointerdown", this._onOutsidePointerDown, true);
  }

  _removeOutsideCloseHandler() {
    if (!this._outsideCloseInstalled) return;
    this._outsideCloseInstalled = false;
    document.removeEventListener("pointerdown", this._onOutsidePointerDown, true);
    this._onOutsidePointerDown = null;
  }

  disconnectedCallback() {
    this._removeOutsideCloseHandler();
    clearTimeout(this._commandPulseTimeout);
    clearTimeout(this._activityLoadTimeout);
  }

  _toggleDrawer(type) {
    this._activeDrawer = (this._activeDrawer === type) ? null : type;
      this._applyDrawerVisuals();
  }

	_applyDrawerVisuals() {
    if (!this._macrosOverlayEl || !this._favoritesOverlayEl) return;

    const isMacro = this._activeDrawer === 'macros';
    const isFav = this._activeDrawer === 'favorites';

    this._macrosOverlayEl.classList.toggle('open', isMacro);
    this._favoritesOverlayEl.classList.toggle('open', isFav);

    this._macrosButtonWrap.classList.toggle('active-tab', isMacro); 
    this._favoritesButtonWrap.classList.toggle('active-tab', isFav);

    const anyOpen = isMacro || isFav;
    this._macroFavoritesRow.style.borderBottomLeftRadius = anyOpen ? "0" : "var(--sb-group-radius)";
    this._macroFavoritesRow.style.borderBottomRightRadius = anyOpen ? "0" : "var(--sb-group-radius)";
    this._macroFavoritesRow.style.transition = "border-radius 0.2s ease";
  }

  _attachPrimaryAction(els, fn) {
    const targets = Array.isArray(els) ? els.filter(Boolean) : [els].filter(Boolean);

    // One shared gate per attached action group (across wrapper + hui-button-card),
    // so we don't double-fire when both elements see the same user gesture.
    const gate = {
      ts: 0,
      pointerId: null,
      type: null,
    };

    const wrapped = (ev) => {
      const now = Date.now();

      // Robust de-dupe across: pointerup + touchend + click/ha-click, and across multiple elements.
      const pid = (ev && typeof ev.pointerId === 'number') ? ev.pointerId : null;
      const etype = ev?.type || null;

      const delta = now - gate.ts;

      // If we already handled a very recent event, drop subsequent ones.
      // (Mobile browsers / HA can dispatch multiple event types for one gesture.)
      if (delta < 450) {
        // If the pointerId matches, it's definitely the same interaction.
        if (pid !== null && gate.pointerId === pid) return;
        return;
      }

      // Additional guard: "ghost click" arriving after touch/pointer on some mobile setups.
      // If we just handled pointer/touch, ignore any subsequent click-ish event for a bit longer.
      if (
        delta < 1200 &&
        (gate.type === 'pointerup' || gate.type === 'touchend') &&
        (etype === 'click' || etype === 'ha-click' || etype === 'tap')
      ) {
        return;
      }

      gate.ts = now;
      gate.pointerId = pid;
      gate.type = etype;

      // Prevent Home Assistant / inner elements from swallowing the action.
      if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
      if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
      if (ev && typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();

      try { fn(ev); } catch (e) { /* no-op */ }
    };

    const hasPointer = typeof window !== 'undefined' && 'PointerEvent' in window;
    for (const el of targets) {
      // Capture phase so we still trigger even if inner elements stop bubbling.
      // Use the smallest viable event set; extra listeners are a major source of duplicate sends.
      if (hasPointer) {
        el.addEventListener('pointerup', wrapped, { capture: true, passive: false });
      } else {
        el.addEventListener('touchend', wrapped, { capture: true, passive: false });
        el.addEventListener('click', wrapped, { capture: true });
      }
      // Home Assistant sometimes dispatches custom click events (keep as fallback)
      el.addEventListener('ha-click', wrapped, { capture: true });
    }
  }

  _mkHuiButton({ key, label, icon, id, cmd, extraClass = "", size = "normal" }) {
    const wrap = document.createElement("div");
    wrap.className = `key key--${size} ${extraClass}`.trim();

    const btn = document.createElement("hui-button-card");
    btn.hass = this._hass;

    this._attachPrimaryAction([wrap, btn], () => {
      if (!wrap.classList.contains("disabled")) {
        this._triggerCommandPulse();
        this._sendCommand(cmd, (this._commandTarget(id)?.activity_id ?? this._currentActivityId()));
      }
    });

    btn.hass = this._hass;

    btn.setConfig({
      type: "button",
      show_name: Boolean(label),
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || undefined,
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    });

    wrap.appendChild(btn);

    this._keys.push({
      key,
      id,
      cmd,
      wrap,
      btn,
      isX2Only: this._x2OnlyIds.has(id),
    });

    return wrap;
  }

  _mkColorKey({ key, id, cmd, color }) {
    const wrap = document.createElement("div");
    wrap.className = "key key--color";
    wrap.style.setProperty("--sb-color", color);

    const btn = document.createElement("hui-button-card");
    btn.hass = this._hass;

    this._attachPrimaryAction([wrap, btn], () => {
      if (!wrap.classList.contains("disabled")) {
        this._triggerCommandPulse();
        this._sendCommand(cmd, (this._commandTarget(id)?.activity_id ?? this._currentActivityId()));
      }
    });

    btn.hass = this._hass;

    btn.setConfig({
      type: "button",
      show_name: false,
      show_icon: false,
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    });

    wrap.appendChild(btn);

    const bar = document.createElement("div");
    bar.className = "colorBar";
    wrap.appendChild(bar);

    this._keys.push({
      key,
      id,
      cmd,
      wrap,
      btn,
      isX2Only: false,
    });

    return wrap;
  }

    _mkActionButton({ label, icon, extraClass = "", onClick = null }) {
    const wrap = document.createElement("div");
    wrap.className = `macroFavoritesButton ${extraClass}`.trim();
    
    if (onClick) {
      this._attachPrimaryAction(wrap, (e) => {
        if (!wrap.classList.contains("disabled")) onClick(e);
      });
    }

    const btn = document.createElement("hui-button-card");
    btn.hass = this._hass;

    btn.setConfig({
      type: "button",
      show_name: true,
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || undefined,
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    });

    wrap.appendChild(btn);

    return { wrap, btn };
  }

  _mkDrawerButton(item, type) {
    const label = item.name || "Unknown";
    const command_id = Number(item?.command_id ?? item?.id);
    const fallbackDeviceId = this._currentActivityId();
    const device_id = Number(item?.device_id ?? item?.device ?? fallbackDeviceId);

    const card = document.createElement('ha-card');
    card.classList.add('drawer-btn');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;

    const inner = document.createElement('div');
    inner.className = 'drawer-btn__inner drawer-btn__inner--stack';

    if (item?.icon) {
      const ic = document.createElement('ha-icon');
      ic.className = 'drawer-btn__icon';
      ic.setAttribute('icon', String(item.icon));
      inner.appendChild(ic);
    }

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = label;
    inner.appendChild(name);

    card.appendChild(inner);

    // Manually handle tap/click
    this._attachPrimaryAction(card, () => {
      if (!Number.isFinite(command_id) || !Number.isFinite(device_id)) return;
      this._triggerCommandPulse();
      this._sendDrawerItem(type, command_id, device_id, item);
    });

    return card;
  }

  _mkCustomFavoriteButton(fav) {
    const label = String(fav?.name ?? 'Favorite');
    const icon = fav?.icon ? String(fav.icon) : null;

    const card = document.createElement('ha-card');
    card.classList.add('drawer-btn', 'drawer-btn--custom');
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    // Span across both columns
    card.style.gridColumn = '1 / -1';

    const inner = document.createElement('div');
    inner.className = 'drawer-btn__inner drawer-btn__inner--row';

    if (icon) {
      const ic = document.createElement('ha-icon');
      ic.className = 'drawer-btn__icon';
      ic.setAttribute('icon', icon);
      inner.appendChild(ic);
    }

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = label;
    inner.appendChild(name);

    card.appendChild(inner);

    this._attachPrimaryAction(card, () => {
      // If the user configured an arbitrary Lovelace Action, run it
      if (fav?.action) {
        this._runLovelaceAction(fav.action, fav);
        return;
      }

      const cmd = Number(fav?.command_id);
      const dev = (fav?.device_id != null) ? Number(fav.device_id) : this._currentActivityId();
      if (!Number.isFinite(cmd) || dev == null || !Number.isFinite(Number(dev))) return;

      this._triggerCommandPulse();
      this._sendCustomFavoriteCommand(cmd, dev);
    });

    return card;
  }

  async _sendCustomFavoriteCommand(commandId, deviceId) {
    if (!this._hass || !this._config?.entity) return;

    const cmd = Number(commandId);
    const dev = Number(deviceId);
    if (!Number.isFinite(cmd) || !Number.isFinite(dev)) return;

    if (this._isHubIntegration()) {
      // Send as a 'favorite' command in the hub integration (it accepts arbitrary IDs).
      await this._hubSendCommandList([
        'type:send_favorite_key',
        'device_id:' + dev,
        'key_id:' + cmd,
      ]);
      return;
    }

    // X1S/X1 style: send_command with device + numeric command
    await this._callService('remote', 'send_command', {
      entity_id: this._config.entity,
      command: cmd,
      device: dev,
    });
  }

  async _ensureHaElements() {
    // These must exist before we call setConfig() on them
    await Promise.all([
      customElements.whenDefined("hui-button-card"),
      customElements.whenDefined("ha-select"),
      customElements.whenDefined("mwc-list-item").catch(() => {}), // optional
    ]);
  }

  // ---------- Render ----------
  _render() {
    if (this._root) return;

    this._keys = [];
    this._x2OnlyIds = new Set([ID.C, ID.B, ID.A, ID.EXIT, ID.DVR, ID.PLAY, ID.GUIDE]);

    const card = document.createElement("ha-card");
    this._root = card;

    const style = document.createElement("style");
    style.textContent = `
      :host {
        --sb-group-radius: var(--ha-card-border-radius, 18px);
        --remote-max-width: 360px;
        --sb-overlay-rgb: var(--rgb-primary-text-color, 0, 0, 0);

        display: block;
      }

      ha-card {
        width: 100%;
        max-width: var(--remote-max-width);
        margin-left: auto;
        margin-right: auto;
      }

      .wrap { padding: 12px; display: grid; gap: 12px; position: relative; }
      ha-select { width: 100%; }

      .activityRow { 
        display: grid; 
        grid-template-columns: 1fr; 
        position: relative;
        z-index: 3;
      }

 	  .loadIndicator {
	    height: 4px;
	    width: 100%;
	    border-radius: 2px;
	    opacity: 0;
	    /* Use a transparent base with a bright highlight "shimmering" over it */
	    background: var(--primary-color, #03a9f4);
	    background-image: linear-gradient(
  		  90deg, 
		  transparent, 
		  rgba(255, 255, 255, 0.4), 
		  transparent
	    );
	    background-size: 200% 100%;
	    background-repeat: no-repeat;
	    transition: opacity 0.3s ease-in-out;
	    pointer-events: none;
	  }

	  .loadIndicator.is-loading {
	    opacity: 1; /* Increased from 0.45 for better visibility */
	    animation: sb-shimmer 1.5s infinite linear;
	  }

	  @keyframes sb-shimmer {
	    0% {
		  background-position: -200% 0;
	    }
	    100% {
		  background-position: 200% 0;
	    }
	  }

			.remote { 
        position: relative;
        z-index: 0; /* Base layer */
        display: grid; 
        gap: 12px; 
      }

      /* Group containers - border radius matches theme */
      .dpad, .mid, .media, .colors, .abc {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
      }

			.macroFavoritesGrid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important; 
        width: 100% !important;
      }
			.macroFavoritesGrid.single {
        grid-template-columns: 1fr !important;
      }
			.macroFavoritesGrid.single .macroFavoritesButton + .macroFavoritesButton {
        border-left: none;
      }
			.macroFavoritesGrid.single .macroFavoritesButton:first-child {
        border-right: none;
      }
			.macroFavoritesButton {
        cursor: pointer;
        padding: 4px 0;
        display: block !important;
        position: relative;
        overflow: hidden;
        transition: background 0.2s ease;
        --ha-card-box-shadow: none;
      }
      
      .macroFavoritesButton.active-tab hui-button-card {
         --primary-text-color: var(--primary-color);
      }

      .macroFavoritesButton + .macroFavoritesButton {
        border-left: 1px solid var(--divider-color);
      }
      .macroFavoritesButton hui-button-card {
        height: 22px;
        display: block;
      }
			.macroFavoritesButton:first-child {
        border-right: 1px solid var(--divider-color);
      }
			.mf-container {
        position: relative; 
        z-index: 2;
      }

      /* Ensure taps go to the wrapper that has the click handler */
      .macroFavoritesButton > hui-button-card {
        pointer-events: none;
        position: relative;
        z-index: 1;
        -webkit-tap-highlight-color: transparent;
      }

			.macroFavorites {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
        overflow: hidden; 
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        position: relative;
        z-index: 4;
      }

			.mf-overlay {
        position: absolute;
        top: 100%; 
        left: 0;
        right: 0;
        z-index: 1; /* Lowered: Sits behind the buttons, above the remote body */
        
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        border: 1px solid var(--divider-color);
        border-top: none; 
        border-bottom-left-radius: var(--sb-group-radius);
        border-bottom-right-radius: var(--sb-group-radius);
        box-shadow: 0px 8px 16px rgba(0,0,0,0.25);
        
        transform-origin: top;
        transform: scaleY(0);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
        
        max-height: 350px;
        overflow-y: auto;
        padding: 12px;
        margin-top: -1px; /* Overlaps the bottom border of the button row for a seamless look */
      }

			.mf-overlay.open {
        transform: scaleY(1);
        opacity: 1;
        pointer-events: auto;
      }

      .mf-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      /* Drawer buttons (Macros/Favorites) */
      .drawer-btn {
        height: 50px !important;
        font-size: 13px !important;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      /* Hover/press overlay (restores hui-button-card style feedback without card_mod) */
      .macroFavoritesButton::before,
      .drawer-btn::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: rgba(var(--sb-overlay-rgb), 0.06);
        opacity: 0;
        transition: opacity 0.15s ease, background 0.15s ease;
        pointer-events: none;
      }

      .macroFavoritesButton:hover::before,
      .drawer-btn:hover::before {
        opacity: 1;
      }

      .macroFavoritesButton:active::before,
      .drawer-btn:active::before {
        opacity: 1;
        background: rgba(var(--sb-overlay-rgb), 0.14);
      }

      .macroFavoritesButton:focus-visible,
      .drawer-btn:focus-visible {
        outline: 2px solid rgba(var(--rgb-primary-color), 0.55);
        outline-offset: 2px;
      }

      .drawer-btn__inner {
        height: 100%;
        width: 100%;
        box-sizing: border-box;
        position: relative;
        z-index: 1;
      }

      /* Matches default hui-button-card "button" look: centered icon + name */
      .drawer-btn__inner--stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 2px;
        padding: 4px;
      }

      /* Custom favorites: row layout with ellipsis */
      .drawer-btn__inner--row {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        padding: 0 12px;
        gap: 10px;
      }

      .drawer-btn--custom .drawer-btn__icon {
        --mdc-icon-size: 18px;
        width: 15% !important;
        flex: 0 0 15%;
      }

      .drawer-btn--custom .name {
        margin: 0 !important;
        text-align: left !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

			.mf-container:has(.mf-overlay.open) .macroFavorites {
					border-bottom-left-radius: 0;
					border-bottom-right-radius: 0;
					transition: border-radius 0.2s ease;
			}

      /* Active state for buttons */
      .macroFavoritesButton.active-tab {
        background: rgba(var(--rgb-primary-color), 0.1);
        color: var(--primary-color);
      }

      .macroFavoritesButton hui-button-card {
        --ha-card-box-shadow: none;
        --ha-card-border-width: 0;
        --ha-card-border-color: transparent;
        --ha-card-background: transparent;
        --ha-card-border-radius: 0;
      }

      /* D-pad cluster */
      .dpad {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-areas:
          ". up ."
          "left ok right"
          ". down .";
        gap: 10px;
        align-items: center;
        justify-items: stretch;
      }
      .dpad .area-up { grid-area: up; }
      .dpad .area-left { grid-area: left; }
      .dpad .area-ok { grid-area: ok; }
      .dpad .area-right { grid-area: right; }
      .dpad .area-down { grid-area: down; }

      /* Back / Home / Menu row */
      .row3 {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      /* Mid: VOL rocker | Guide+Mute | CH rocker */
      .mid {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        align-items: stretch;
      }
      .col { display: grid; gap: 10px; align-content: start; }

      /* Center column alignment fix (X1: center mute; X2: guide top, mute bottom) */
      .midCenter {
        display: flex;
        flex-direction: column;
        gap: 10px;
        justify-content: center;
      }
      .midCenter.x2 {
        justify-content: space-between;
      }

      /* Media: X1 is 1 row; X2 is 2 rows */
      .media {
        padding: 12px;
        display: grid;
        gap: 10px;
        align-items: stretch;
      }
      .media.x1 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-areas: "rew pause fwd";
      }
      .media.x2 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-areas:
          "rew play fwd"
          "dvr pause exit";
      }
      .media .area-rew   { grid-area: rew; }
      .media .area-play  { grid-area: play; }
      .media .area-fwd   { grid-area: fwd; }
      .media .area-dvr   { grid-area: dvr; }
      .media .area-pause { grid-area: pause; }
      .media .area-exit  { grid-area: exit; }

      /* Colors + ABC blocks */
      .colors, .abc {
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .colorsGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .abcGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }

      /* Key wrapper for disabled styling */
      .key.disabled,
      .macroFavoritesButton.disabled {
        opacity: 0.35;
        pointer-events: none;
        filter: grayscale(0.2);
      }

      /* sizing */

/* Allow grid children to shrink (prevents overflow on mobile / narrow cards) */
.key { min-width: 0; position: relative; width: 100%; }
.key hui-button-card { min-width: 0; }

/* --- Square remote keys (scalable) --- */
.key:not(.key--color) {
  aspect-ratio: 1 / 1;
}

/* Fill wrapper */
.key:not(.key--color) hui-button-card {
  display: block;
  width: 100%;
  height: 100% !important;
}

/* Re-introduce relative sizing (scales with card width) */
.key--small  { transform: scale(0.82); transform-origin: center; }
.key--normal { transform: scale(0.92); transform-origin: center; }
.key--big    { transform: scale(1.00); transform-origin: center; }
.okKey       { transform: scale(1.06); transform-origin: center; }

/* Keep color keys as strips (not square) */
.key--color {
  aspect-ratio: auto;
  transform: none;
}
.key--color hui-button-card {
  height: 18px !important;
  width: 100%;
  display: block;
}

/* Color keys: overlay a pill/strip on top of the hui-button-card */

      .key--color .colorBar {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: var(--sb-color);
        pointer-events: none;
      }

      .warn {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        z-index: 10;
        font-size: 12px;
        opacity: .9;
        border-left: 3px solid var(--warning-color, orange);
        padding-left: 10px;
      }
    `;

    const wrap = document.createElement("div");
    wrap.className = "wrap";

    // Activity selector (full width)
    this._activityRow = document.createElement("div");
    this._activityRow.className = "activityRow";

    this._activitySelect = document.createElement("ha-select");
    this._activitySelect.label = "Activity";

    const handleActivitySelect = (ev) => {
      if (this._suppressActivityChange) return;
      const value = ev?.detail?.value ?? ev?.target?.value ?? this._activitySelect.value;
      if (value != null) {
        Promise.resolve(this._setActivity(value)).catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[sofabaton-virtual-remote] Failed to set activity:", err);
        });
      }
    };

    // ha-select has emitted both "selected" and "change" across versions.
    this._activitySelect.addEventListener("selected", handleActivitySelect);
    this._activitySelect.addEventListener("change", handleActivitySelect);

    this._activityRow.appendChild(this._activitySelect);
    this._loadIndicator = document.createElement("div");
    this._loadIndicator.className = "loadIndicator";
    this._activityRow.appendChild(this._loadIndicator);

    wrap.appendChild(this._activityRow);

    // Macro/Favorite quick actions
        const mfContainer = document.createElement("div");
    mfContainer.className = "mf-container";

    

    this._mfContainer = mfContainer;this._macroFavoritesRow = document.createElement("div");
    this._macroFavoritesRow.className = "macroFavorites";

    const macroFavoritesGrid = document.createElement("div");
    macroFavoritesGrid.className = "macroFavoritesGrid";

    this._macroFavoritesGrid = macroFavoritesGrid;

    const macrosButton = this._mkActionButton({
      label: "Macros >",
      onClick: () => this._toggleDrawer('macros')
    });
    this._macrosButtonWrap = macrosButton.wrap;
    this._macrosButton = macrosButton.btn;
    macroFavoritesGrid.appendChild(this._macrosButtonWrap);

    const favoritesButton = this._mkActionButton({
      label: "Favorites >",
      onClick: () => this._toggleDrawer('favorites')
    });
    this._favoritesButtonWrap = favoritesButton.wrap;
    this._favoritesButton = favoritesButton.btn;
    macroFavoritesGrid.appendChild(this._favoritesButtonWrap);

    this._macroFavoritesRow.appendChild(macroFavoritesGrid);
    mfContainer.appendChild(this._macroFavoritesRow);

		// Macros Overlay
    this._macrosOverlayEl = document.createElement("div");
    this._macrosOverlayEl.className = "mf-overlay mf-overlay--macros";
    this._macrosOverlayGrid = document.createElement("div");
    this._macrosOverlayGrid.className = "mf-grid";
    this._macrosOverlayEl.appendChild(this._macrosOverlayGrid);
    mfContainer.appendChild(this._macrosOverlayEl);

    // Favorites Overlay
    this._favoritesOverlayEl = document.createElement("div");
    this._favoritesOverlayEl.className = "mf-overlay mf-overlay--favorites";
    this._favoritesOverlayGrid = document.createElement("div");
    this._favoritesOverlayGrid.className = "mf-grid";
    this._favoritesOverlayEl.appendChild(this._favoritesOverlayGrid);
    mfContainer.appendChild(this._favoritesOverlayEl);
    
    wrap.appendChild(mfContainer);

    this._installOutsideCloseHandler();

    // Remote body
    const remote = document.createElement("div");
    remote.className = "remote";

    // D-pad
    this._dpadEl = document.createElement("div");
    this._dpadEl.className = "dpad";
    this._dpadEl.appendChild(this._mkHuiButton({ key: "up", label: "", icon: "mdi:chevron-up", id: ID.UP, cmd: ID.UP, extraClass: "area-up" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "left", label: "", icon: "mdi:chevron-left", id: ID.LEFT, cmd: ID.LEFT, extraClass: "area-left" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "ok", label: "OK", icon: "", id: ID.OK, cmd: ID.OK, extraClass: "area-ok okKey", size: "big" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "right", label: "", icon: "mdi:chevron-right", id: ID.RIGHT, cmd: ID.RIGHT, extraClass: "area-right" }));
    this._dpadEl.appendChild(this._mkHuiButton({ key: "down", label: "", icon: "mdi:chevron-down", id: ID.DOWN, cmd: ID.DOWN, extraClass: "area-down" }));
    remote.appendChild(this._dpadEl);

    // Back / Home / Menu
    this._navRowEl = document.createElement("div");
    this._navRowEl.className = "row3";
    this._navRowEl.appendChild(this._mkHuiButton({ key: "back", label: "", icon: "mdi:arrow-u-left-top", id: ID.BACK, cmd: ID.BACK }));
    this._navRowEl.appendChild(this._mkHuiButton({ key: "home", label: "", icon: "mdi:home", id: ID.HOME, cmd: ID.HOME }));
    this._navRowEl.appendChild(this._mkHuiButton({ key: "menu", label: "", icon: "mdi:menu", id: ID.MENU, cmd: ID.MENU }));
    remote.appendChild(this._navRowEl);

    // Mid section: VOL | Guide+Mute | CH
    this._midEl = document.createElement("div");
    this._midEl.className = "mid";

    const volCol = document.createElement("div");
    volCol.className = "col";
    volCol.appendChild(this._mkHuiButton({ key: "volup", label: "", icon: "mdi:volume-plus", id: ID.VOL_UP, cmd: ID.VOL_UP }));
    volCol.appendChild(this._mkHuiButton({ key: "voldn", label: "", icon: "mdi:volume-minus", id: ID.VOL_DOWN, cmd: ID.VOL_DOWN }));
    this._midEl.appendChild(volCol);

    const centerCol = document.createElement("div");
    centerCol.className = "col midCenter";
    this._midCenterCol = centerCol;
    centerCol.appendChild(this._mkHuiButton({ key: "guide", label: "Guide", icon: "", id: ID.GUIDE, cmd: ID.GUIDE }));
    centerCol.appendChild(this._mkHuiButton({ key: "mute", label: "", icon: "mdi:volume-mute", id: ID.MUTE, cmd: ID.MUTE }));
    this._midEl.appendChild(centerCol);

    const chCol = document.createElement("div");
    chCol.className = "col";
    chCol.appendChild(this._mkHuiButton({ key: "chup", label: "", icon: "mdi:chevron-up", id: ID.CH_UP, cmd: ID.CH_UP }));
    chCol.appendChild(this._mkHuiButton({ key: "chdn", label: "", icon: "mdi:chevron-down", id: ID.CH_DOWN, cmd: ID.CH_DOWN }));
    this._midEl.appendChild(chCol);

    remote.appendChild(this._midEl);

    // Media cluster with X2 layout:
    this._mediaEl = document.createElement("div");
    this._mediaEl.className = "media x1";

    this._mediaEl.appendChild(this._mkHuiButton({ key: "rew", label: "", icon: "mdi:rewind", id: ID.REW, cmd: ID.REW, extraClass: "area-rew" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "play", label: "", icon: "mdi:play", id: ID.PLAY, cmd: ID.PLAY, extraClass: "area-play" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "fwd", label: "", icon: "mdi:fast-forward", id: ID.FWD, cmd: ID.FWD, extraClass: "area-fwd" }));

    this._mediaEl.appendChild(this._mkHuiButton({ key: "dvr", label: "DVR", icon: "", id: ID.DVR, cmd: ID.DVR, extraClass: "area-dvr" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "pause", label: "", icon: "mdi:pause", id: ID.PAUSE, cmd: ID.PAUSE, extraClass: "area-pause" }));
    this._mediaEl.appendChild(this._mkHuiButton({ key: "exit", label: "Exit", icon: "", id: ID.EXIT, cmd: ID.EXIT, extraClass: "area-exit" }));

    remote.appendChild(this._mediaEl);

    // Colors row (colored bars, no text)
    this._colorsEl = document.createElement("div");
    this._colorsEl.className = "colors";
    const colorsGrid = document.createElement("div");
    colorsGrid.className = "colorsGrid";
    colorsGrid.appendChild(this._mkColorKey({ key: "red", id: ID.RED, cmd: ID.RED, color: "#d32f2f" }));
    colorsGrid.appendChild(this._mkColorKey({ key: "green", id: ID.GREEN, cmd: ID.GREEN, color: "#388e3c" }));
    colorsGrid.appendChild(this._mkColorKey({ key: "yellow", id: ID.YELLOW, cmd: ID.YELLOW, color: "#fbc02d" }));
    colorsGrid.appendChild(this._mkColorKey({ key: "blue", id: ID.BLUE, cmd: ID.BLUE, color: "#1976d2" }));
    this._colorsEl.appendChild(colorsGrid);
    remote.appendChild(this._colorsEl);

    // A/B/C (X2)
    this._abcEl = document.createElement("div");
    this._abcEl.className = "abc";
    const abcGrid = document.createElement("div");
    abcGrid.className = "abcGrid";
    abcGrid.appendChild(this._mkHuiButton({ key: "a", label: "A", icon: "", id: ID.A, cmd: ID.A, size: "small" }));
    abcGrid.appendChild(this._mkHuiButton({ key: "b", label: "B", icon: "", id: ID.B, cmd: ID.B, size: "small" }));
    abcGrid.appendChild(this._mkHuiButton({ key: "c", label: "C", icon: "", id: ID.C, cmd: ID.C, size: "small" }));
    this._abcEl.appendChild(abcGrid);
    remote.appendChild(this._abcEl);

    wrap.appendChild(remote);

    // Warning
    this._warn = document.createElement("div");
    this._warn.className = "warn";
    this._warn.style.display = "none";
    wrap.appendChild(this._warn);

    card.appendChild(style);
    card.appendChild(wrap);
    this.appendChild(card);
  }

  _update() {
    if (!this._root || !this._config || !this._hass) return;

    // Apply per-card theme (and background) first
    this._applyLocalTheme(this._config?.theme);
    this._updateGroupRadius();

    // Apply per-card max width (centered via CSS)
    const mw = this._config?.max_width;
    if (mw == null || mw === "" || mw === 0) {
      this.style.removeProperty("--remote-max-width");
    } else if (typeof mw === "number" && Number.isFinite(mw) && mw > 0) {
      this.style.setProperty("--remote-max-width", `${mw}px`);
    } else if (typeof mw === "string" && mw.trim()) {
      this.style.setProperty("--remote-max-width", mw.trim());
    }

    const remote = this._remoteState();
    const isUnavailable = remote?.state === "unavailable";
    const loadState = remote?.attributes?.load_state;
    const activityId = this._currentActivityId();
    const activities = this._activities();
    const assignedKeys = remote?.attributes?.assigned_keys;
    const macroKeys = remote?.attributes?.macro_keys;
    const favoriteKeys = remote?.attributes?.favorite_keys;
    // For hub integration, the backend may drop per-activity keys/macros/favorites
    // from the attributes when switching activities. Cache per-activity data client-side
    // for the lifetime of the card so switching back restores UI without re-fetching.
    this._hubAssignedKeysCache = this._hubAssignedKeysCache || {};
    this._hubMacrosCache = this._hubMacrosCache || {};
    this._hubFavoritesCache = this._hubFavoritesCache || {};

    const actKey = activityId != null ? String(activityId) : null;

    const _assignedMap = (assignedKeys && typeof assignedKeys === "object") ? assignedKeys : null;
    const _macroMap = (macroKeys && typeof macroKeys === "object") ? macroKeys : null;
    const _favMap = (favoriteKeys && typeof favoriteKeys === "object") ? favoriteKeys : null;

    // Update caches from attributes if the property exists (even if it's an empty array)
    if (this._isHubIntegration() && actKey != null) {
      if (_assignedMap && (this._hasOwn(_assignedMap, actKey) || this._hasOwn(_assignedMap, activityId))) {
        const v = _assignedMap[actKey] ?? _assignedMap[activityId];
        this._hubAssignedKeysCache[actKey] = Array.isArray(v) ? v : [];
      }
      if (_macroMap && (this._hasOwn(_macroMap, actKey) || this._hasOwn(_macroMap, activityId))) {
        const v = _macroMap[actKey] ?? _macroMap[activityId];
        this._hubMacrosCache[actKey] = Array.isArray(v) ? v : [];
      }
      if (_favMap && (this._hasOwn(_favMap, actKey) || this._hasOwn(_favMap, activityId))) {
        const v = _favMap[actKey] ?? _favMap[activityId];
        this._hubFavoritesCache[actKey] = Array.isArray(v) ? v : [];
      }
    }

    const macros = _macroMap && actKey != null && (this._hasOwn(_macroMap, actKey) || this._hasOwn(_macroMap, activityId))
      ? (_macroMap[actKey] ?? _macroMap[activityId] ?? [])
      : (this._isHubIntegration() && actKey != null ? (this._hubMacrosCache[actKey] ?? []) : []);

    const favorites = _favMap && actKey != null && (this._hasOwn(_favMap, actKey) || this._hasOwn(_favMap, activityId))
      ? (_favMap[actKey] ?? _favMap[activityId] ?? [])
      : (this._isHubIntegration() && actKey != null ? (this._hubFavoritesCache[actKey] ?? []) : []);

    const customFavorites = this._customFavorites();

    const rawAssignedKeys = _assignedMap && actKey != null && (this._hasOwn(_assignedMap, actKey) || this._hasOwn(_assignedMap, activityId))
      ? (_assignedMap[actKey] ?? _assignedMap[activityId] ?? null)
      : (this._isHubIntegration() && actKey != null ? (this._hubAssignedKeysCache[actKey] ?? null) : null);


    // Hub integration: fetch activities / keys on-demand
    if (this._isHubIntegration() && !isUnavailable) {
      // When hub is idle/off it may expose no attributes; request activities once
      if (activities.length === 0 && loadState !== "loading") {
        this._hubRequestBasicData();
      }

      // Only request per-activity data once we know the activity is actually ON.
      // The hub is sensitive: querying keys while an activity is starting (or not active)
      // can cause dropped/ignored responses.
      if (activityId != null && this._isActivityOn(activityId, activities)) {
        const aKey = String(activityId);
        const hasAssignedAttr = (assignedKeys && typeof assignedKeys === "object") && (this._hasOwn(assignedKeys, aKey) || this._hasOwn(assignedKeys, activityId));
        const hasMacroAttr = (macroKeys && typeof macroKeys === "object") && (this._hasOwn(macroKeys, aKey) || this._hasOwn(macroKeys, activityId));
        const hasFavAttr = (favoriteKeys && typeof favoriteKeys === "object") && (this._hasOwn(favoriteKeys, aKey) || this._hasOwn(favoriteKeys, activityId));

        const hasAssignedCache = this._hasOwn(this._hubAssignedKeysCache, aKey);
        const hasMacroCache = this._hasOwn(this._hubMacrosCache, aKey);
        const hasFavCache = this._hasOwn(this._hubFavoritesCache, aKey);

        if (!hasAssignedAttr && !hasAssignedCache) this._hubRequestAssignedKeys(activityId);
        if (!hasMacroAttr && !hasMacroCache) this._hubRequestMacroKeys(activityId);
        if (!hasFavAttr && !hasFavCache) this._hubRequestFavoriteKeys(activityId);
      }
    }

    const enabledButtonsSig = this._enabledButtonsSignature(rawAssignedKeys);
    if (this._enabledButtonsCacheKey !== enabledButtonsSig) {
      this._enabledButtonsCacheKey = enabledButtonsSig;
      const parsed = Array.isArray(rawAssignedKeys)
        ? rawAssignedKeys
            .map((entry) => ({
              command: Number(entry),
              activity_id: activityId,
            }))
            .filter((entry) => Number.isFinite(entry.command))
        : [];
      this._enabledButtonsInvalid = Array.isArray(rawAssignedKeys) && parsed.length === 0;
      this._enabledButtonsCache = parsed;
    }

    const isX2 = this._isX2();

    // Center column alignment behavior
    if (this._midCenterCol) {
      this._midCenterCol.classList.toggle("x2", isX2);
    }

    // Media layout class toggles
    if (this._mediaEl) {
      this._mediaEl.classList.toggle("x2", isX2);
      this._mediaEl.classList.toggle("x1", !isX2);
    }

    // Activity select sync + Powered Off detection
    let isPoweredOff = false;
    const pendingActivity = this._pendingActivity;
    const pendingAge = this._pendingActivityAt
      ? Date.now() - this._pendingActivityAt
      : null;
    const pendingExpired = pendingAge != null && pendingAge > 15000;

    if (isUnavailable) {
      this._activitySelect.disabled = true;
      this._activitySelect.innerHTML = "";
      isPoweredOff = false;
      this._stopActivityLoading();
    } else {
      const options = ["Powered Off", ...activities.map((activity) => activity.name)];
      const current = this._currentActivityLabel() || "Powered Off";

      isPoweredOff = activityId == null || this._isPoweredOffLabel(current);
      if (pendingActivity && (pendingExpired || current === pendingActivity)) {
        this._pendingActivity = null;
        this._pendingActivityAt = null;
      }

      const sig = this._optionsSignature(options);
      if (this._activityOptionsSig !== sig) {
        this._activityOptionsSig = sig;
        this._activitySelect.innerHTML = "";
        for (const opt of options) {
          const item = document.createElement("mwc-list-item");
          item.value = opt;
          item.textContent = opt;
          this._activitySelect.appendChild(item);
        }
      }

      // Prevent loops while syncing UI
      this._suppressActivityChange = true;
      if (pendingActivity && !pendingExpired && pendingActivity !== current) {
        this._activitySelect.value = pendingActivity;
      } else {
        this._activitySelect.value = current;
      }
      this._suppressActivityChange = false;

      this._activitySelect.disabled = options.length <= 1;

      const currentActivity = this._currentActivityLabel();
      if (this._activityLoadActive && this._activityLoadTarget) {
        const targetIsOff = this._isPoweredOffLabel(this._activityLoadTarget);
        if ((targetIsOff && isPoweredOff) || currentActivity === this._activityLoadTarget) {
          this._stopActivityLoading();
        }
      }
    }

    if (!isUnavailable && activities.length === 0 && loadState !== "loading") {
      this._warn.style.display = "block";
      this._warn.textContent = "No activities found in remote attributes.";
    } else {
      this._warn.style.display = "none";
    }

    // Visibility toggles (user config)
    this._setVisible(this._activityRow, this._config.show_activity);

    const showMacrosBtn = this._showMacrosButton();
    const showFavoritesBtn = this._showFavoritesButton();
    const showMF = showMacrosBtn || showFavoritesBtn;

    this._setVisible(this._mfContainer, showMF);
    this._setVisible(this._macrosButtonWrap, showMacrosBtn);
    this._setVisible(this._favoritesButtonWrap, showFavoritesBtn);

    if (this._macroFavoritesGrid) {
      const visibleCount = (showMacrosBtn ? 1 : 0) + (showFavoritesBtn ? 1 : 0);
      this._macroFavoritesGrid.classList.toggle('single', visibleCount === 1);
    }

    // If macro/favorites are hidden, or the active drawer tab is hidden, close any open drawer
    if (!showMF && this._activeDrawer) {
      this._activeDrawer = null;
    }
    if (this._activeDrawer === 'macros' && !showMacrosBtn) this._activeDrawer = null;
    if (this._activeDrawer === 'favorites' && !showFavoritesBtn) this._activeDrawer = null;

    this._setVisible(this._dpadEl, this._config.show_dpad);
    this._setVisible(this._navRowEl, this._config.show_nav);
    this._setVisible(this._midEl, this._config.show_mid);
    this._setVisible(this._mediaEl, this._config.show_media);
    this._setVisible(this._colorsEl, this._config.show_colors);

    // ABC: must be enabled in config AND X2
    this._setVisible(this._abcEl, this._config.show_abc && isX2);

    if (this._macrosButton) {
      this._macrosButton.hass = this._hass;
      
      const macrosEnabled = macros.length > 0; 
      this._macrosButtonWrap.classList.toggle("disabled", isUnavailable || !macrosEnabled);
    }

    if (this._favoritesButton) {
      this._favoritesButton.hass = this._hass;
      
      const favoritesEnabled = (favorites.length + customFavorites.length) > 0;
      this._favoritesButtonWrap.classList.toggle("disabled", isUnavailable || !favoritesEnabled);
    }

		// POPULATE MACROS (Only if data changed)
    const macroSig = this._drawerItemsSignature(macros);
    if (this._macroDataSig !== macroSig && this._macrosOverlayGrid) {
        this._macroDataSig = macroSig;
        this._macrosOverlayGrid.innerHTML = "";
        macros.forEach(macro => {
            const btn = this._mkDrawerButton(macro, 'macros');
            btn.hass = this._hass;
            this._macrosOverlayGrid.appendChild(btn);
        });
    }

    // POPULATE FAVORITES (Only if data changed)
    const favSig = this._drawerItemsSignature(favorites);
    const customFavSig = this._customFavoritesSignature(customFavorites);
    const combinedFavSig = `${customFavSig}||${favSig}`;
    if (this._favDataSig !== combinedFavSig && this._favoritesOverlayGrid) {
        this._favDataSig = combinedFavSig;
        this._favoritesOverlayGrid.innerHTML = "";

        // 1) Custom favorites from card config (always on top, span 2 columns)
        customFavorites.forEach((fav) => {
            const btn = this._mkCustomFavoriteButton(fav);
            btn.hass = this._hass;
            this._favoritesOverlayGrid.appendChild(btn);
        });

        // 2) Favorites fetched from the remote entity (occupy 1 column)
        favorites.forEach((fav) => {
            const btn = this._mkDrawerButton(fav, 'favorites');
            btn.hass = this._hass;
            this._favoritesOverlayGrid.appendChild(btn);
        });
    }

    this._applyDrawerVisuals();

    // Update all keys: hass + enabled/disabled + X2-only visibility
    for (const k of this._keys) {
      k.btn.hass = this._hass;

      // Hide X2-only buttons on X1/X1S
      if (k.isX2Only) {
        this._setVisible(k.wrap, isX2);
      }

      // Disable all buttons if Powered Off
      const enabled = !isUnavailable && !isPoweredOff && this._isEnabled(k.id);
      k.wrap.classList.toggle("disabled", !enabled);
    }

    if (remote?.state === "unavailable") {
      this._warn.style.display = "block";
      this._warn.textContent = "Remote is unavailable (possibly because the Sofabaton app is connected).";
    }

    this._updateLoadIndicator();
  }

  getCardSize() {
    return 12;
  }

  static getConfigElement() {
    return document.createElement(EDITOR);
  }

  static getStubConfig(hass) {
    return {
      entity: "",
      theme: "",
      background_override: null,
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_media: true,
      show_colors: true,
      show_abc: true,
      show_macro_favorites: true,
      show_macros_button: null,
      show_favorites_button: null,
      custom_favorites: [],
      max_width: 360,
    };
  }
}

// Editor
class SofabatonRemoteCardEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
  }

  setConfig(config) {
    this._config = { ...(config || {}) };
    this._render();
  }

  _render() {
    if (!this._hass) return;

    if (!this._form) {
      const form = document.createElement("ha-form");
      form.hass = this._hass;

      form.computeLabel = (schema) => {
        const labels = {
          entity: "Select a Sofabaton Remote Entity",
          theme: "Apply a theme to the card",
          use_background_override: "Customize background color",
          background_override: "Select Background Color",
          show_activity: "Activity Selector",
          show_dpad: "Direction Pad",
          show_nav: "Back/Home/Menu Keys",
          show_mid: "Volume/Channel Rockers",
          show_media: "Media Playback Controls",
          show_colors: "Red/Green/Yellow/Blue",
          show_abc: "A/B/C Buttons (X2 only)"
        ,
          show_macros_button: "Macros Button",
          show_favorites_button: "Favorites Button",
          custom_favorites: "Custom Favorites (advanced)",
          show_macro_favorites: "Macros/Favorites Buttons (deprecated)",
          max_width: "Maximum Card Width (px)"};
        return labels[schema.name] || schema.name;
      };

      form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const newValue = { ...ev.detail.value };
        
        // 1. If toggle is off, wipe the color data
        if (newValue.use_background_override === false) {
          delete newValue.background_override;
        }

        // 2. STABILITY CHECK: Only fire if something actually changed
        if (JSON.stringify(this._config) === JSON.stringify(newValue)) return;

        this._config = newValue;
        this._fireChanged();
      });

      const wrapper = document.createElement("div");
      wrapper.style.padding = "12px 0";
      wrapper.appendChild(form);
      this.appendChild(wrapper);
      this._form = form;
    }

    // Determine if we should show the color picker
    const showColorPicker = this._config.use_background_override || !!this._config.background_override;

    this._form.schema = [
      { name: "entity", selector: { entity: { filter: [ { domain: "remote", integration: "sofabaton_x1s" }, { domain: "remote", integration: "sofabaton_hub" } ] } }, required: true },
      {
        type: "expandable",
        title: "Styling Options",
        icon: "mdi:palette",
        schema: [
          // We removed the 'grid' type here so items stack vertically
          { name: "theme", selector: { theme: {} } },
          { 
            name: "max_width", 
            selector: { number: { min: 0, max: 1200, step: 10, unit_of_measurement: "px" } } 
          },
          { name: "use_background_override", selector: { boolean: {} } },
          ...(showColorPicker ? [{ name: "background_override", selector: { color_rgb: {} } }] : []),
        ]
      },
      {
        type: "expandable",
        title: "Button Visibility",
        icon: "mdi:eye-settings",
        schema: [
          {
            type: "grid",
            name: "",
            schema: [
              { name: "show_activity", selector: { boolean: {} } },
              { name: "show_dpad", selector: { boolean: {} } },
              { name: "show_nav", selector: { boolean: {} } },
              { name: "show_mid", selector: { boolean: {} } },
              { name: "show_media", selector: { boolean: {} } },
              { name: "show_colors", selector: { boolean: {} } },
              { name: "show_abc", selector: { boolean: {} } },
              { name: "show_macros_button", selector: { boolean: {} } },
              { name: "show_favorites_button", selector: { boolean: {} } },
            ]
          }
        ]
      }

      ,{
        type: "expandable",
        title: "Custom Favorites",
        icon: "mdi:star-plus",
        schema: [
          {
            name: "custom_favorites",
            selector: { object: {} }
          }
        ]
      }
    ];

    this._form.data = {
      ...this._config,
      entity: this._config.entity || "",
      theme: this._config.theme || "",
      // Maintain the toggle state correctly
      use_background_override: this._config.use_background_override ?? !!this._config.background_override,
      background_override: this._config.background_override ?? [255, 255, 255],
      show_activity: this._config.show_activity ?? true,
      show_dpad: this._config.show_dpad ?? true,
      show_nav: this._config.show_nav ?? true,
      show_mid: this._config.show_mid ?? true,
      show_media: this._config.show_media ?? true,
      show_colors: this._config.show_colors ?? true,
      show_abc: this._config.show_abc ?? true,
      show_macros_button: this._config.show_macros_button ?? (this._config.show_macro_favorites ?? true),
      show_favorites_button: this._config.show_favorites_button ?? (this._config.show_macro_favorites ?? true),
      custom_favorites: this._config.custom_favorites ?? [],
      show_macro_favorites: this._config.show_macro_favorites ?? true,
      max_width: this._config.max_width ?? 360,
    };
  }

  _fireChanged() {
    // 3. CLEANUP: Strip out the helper toggle before saving to HASS YAML
    const finalConfig = { ...this._config };
    delete finalConfig.use_background_override;

    this.dispatchEvent(
      new CustomEvent("config-changed", { 
        detail: { config: finalConfig }, 
        bubbles: true, 
        composed: true 
      })
    );
  }
}

if (!customElements.get(EDITOR)) customElements.define(EDITOR, SofabatonRemoteCardEditor);
if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TYPE)) {
  window.customCards.push({
    type: TYPE,
    name: "Sofabaton Virtual Remote",
    description: "A configurable remote for the Sofabaton X1, X1S and X2 integration.",
  });
}
