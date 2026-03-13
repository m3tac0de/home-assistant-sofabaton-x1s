/**
 * Sofabaton Power Tools — Lovelace card
 *
 * Always injected, no YAML configuration required.
 * Provides persistent-cache management and per-entity cache refresh.
 */

const CARD_TYPE = "sofabaton-power-tools";
const CARD_NAME = "Sofabaton Power Tools";
const DOMAIN = "sofabaton_x1s";

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const STYLES = `
  :host {
    display: block;
    font-family: var(--paper-font-body1_-_font-family, inherit);
    font-size: var(--paper-font-body1_-_font-size, 14px);
  }
  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 16px 0;
    font-size: 1.1em;
    font-weight: 500;
    color: var(--primary-text-color);
  }
  .card-header svg {
    flex-shrink: 0;
  }
  .card-content {
    padding: 12px 16px 16px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
  }
  .row:last-child {
    border-bottom: none;
  }
  .row-label {
    font-weight: 500;
    color: var(--primary-text-color);
  }
  .row-sub {
    font-size: 0.85em;
    color: var(--secondary-text-color);
    margin-top: 2px;
  }
  .toggle {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }
  .toggle input {
    opacity: 0;
    width: 0;
    height: 0;
  }
  .slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background: var(--switch-unchecked-track-color, #ccc);
    border-radius: 24px;
    transition: background 0.2s;
  }
  .slider::before {
    content: "";
    position: absolute;
    width: 18px;
    height: 18px;
    left: 3px;
    bottom: 3px;
    background: white;
    border-radius: 50%;
    transition: transform 0.2s;
  }
  input:checked + .slider {
    background: var(--switch-checked-track-color, var(--primary-color, #03a9f4));
  }
  input:checked + .slider::before {
    transform: translateX(20px);
  }
  select {
    width: 100%;
    padding: 6px 8px;
    margin-top: 4px;
    border: 1px solid var(--divider-color, #ccc);
    border-radius: 4px;
    background: var(--card-background-color, white);
    color: var(--primary-text-color);
    font-size: 1em;
    cursor: pointer;
  }
  .section-title {
    font-size: 0.8em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--secondary-text-color);
    margin: 12px 0 4px;
  }
  .entity-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid var(--divider-color, #e0e0e0);
  }
  .entity-row:last-child {
    border-bottom: none;
  }
  .entity-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badges {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
    margin: 0 8px;
  }
  .badge {
    font-size: 0.7em;
    padding: 1px 5px;
    border-radius: 10px;
    font-weight: 600;
  }
  .badge-ok {
    background: var(--success-color, #4caf50);
    color: white;
  }
  .badge-miss {
    background: var(--divider-color, #e0e0e0);
    color: var(--secondary-text-color);
  }
  .refresh-btn {
    background: none;
    border: 1px solid var(--primary-color, #03a9f4);
    color: var(--primary-color, #03a9f4);
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 0.85em;
    flex-shrink: 0;
    transition: background 0.15s, color 0.15s;
  }
  .refresh-btn:hover {
    background: var(--primary-color, #03a9f4);
    color: white;
  }
  .refresh-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  details {
    margin-top: 8px;
  }
  summary {
    cursor: pointer;
    font-weight: 500;
    color: var(--primary-text-color);
    padding: 4px 0;
    user-select: none;
  }
  .cache-browser {
    margin-top: 8px;
    font-size: 0.8em;
    color: var(--secondary-text-color);
  }
  .cache-section {
    margin: 6px 0;
  }
  .cache-section-title {
    font-weight: 600;
    color: var(--primary-text-color);
    margin-bottom: 2px;
  }
  .cache-entry {
    padding: 2px 0 2px 12px;
    border-left: 2px solid var(--divider-color, #e0e0e0);
    margin: 2px 0;
    font-family: var(--code-font-family, monospace);
    word-break: break-all;
  }
  .empty-msg {
    color: var(--secondary-text-color);
    font-style: italic;
    text-align: center;
    padding: 16px 0;
  }
  .error-msg {
    color: var(--error-color, #f44336);
    font-size: 0.85em;
    padding: 4px 0;
  }
`;

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function callWS(hass, msg) {
  return hass.callWS(msg);
}

function getSofabatonEntities(hass) {
  const entities = hass.entities || {};
  return Object.values(entities).filter(
    (e) => e.platform === DOMAIN && e.entity_id.startsWith("remote.")
  );
}

function friendlyName(hass, entityId) {
  const state = hass.states[entityId];
  return (state && state.attributes && state.attributes.friendly_name) || entityId;
}

/* ------------------------------------------------------------------ */
/* Card element                                                         */
/* ------------------------------------------------------------------ */

class SofabatonPowerTools extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._cacheEnabled = false;
    this._selectedEntity = null;
    this._snapshot = null;
    this._refreshing = {};
    this._shadow = this.attachShadow({ mode: "open" });
    this._mounted = false;
  }

  setConfig(_config) {
    // No configuration needed
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._mounted) {
      this._mounted = true;
      this._init();
    } else {
      this._updateEntityList();
    }
  }

  async _init() {
    this._render();
    await this._loadSettings();
    this._render();
    if (this._cacheEnabled && this._selectedEntity) {
      await this._loadSnapshot();
      this._render();
    }
  }

  async _loadSettings() {
    try {
      const result = await callWS(this._hass, {
        type: `${DOMAIN}/cache/get_settings`,
      });
      this._cacheEnabled = Boolean(result.persistent_cache_enabled);
    } catch (e) {
      this._cacheEnabled = false;
    }
  }

  async _loadSnapshot() {
    if (!this._selectedEntity) return;
    try {
      this._snapshot = await callWS(this._hass, {
        type: `${DOMAIN}/cache/get_snapshot`,
        entity_id: this._selectedEntity,
      });
    } catch (e) {
      this._snapshot = null;
    }
    this._render();
  }

  async _toggleCache(enabled) {
    try {
      await callWS(this._hass, {
        type: `${DOMAIN}/cache/set_enabled`,
        enabled: enabled,
      });
      this._cacheEnabled = enabled;
      if (enabled && this._selectedEntity && !this._snapshot) {
        await this._loadSnapshot();
      }
      this._render();
    } catch (e) {
      console.error("[SofabatonPowerTools] Failed to set cache enabled:", e);
    }
  }

  async _selectEntity(entityId) {
    this._selectedEntity = entityId;
    this._snapshot = null;
    this._render();
    if (entityId) {
      await this._loadSnapshot();
    }
  }

  async _refreshActivity(activityId) {
    if (!this._selectedEntity) return;
    this._refreshing[activityId] = true;
    this._render();
    try {
      await callWS(this._hass, {
        type: `${DOMAIN}/cache/refresh_activity`,
        entity_id: this._selectedEntity,
        activity_id: activityId,
      });
      await this._loadSnapshot();
    } catch (e) {
      console.error("[SofabatonPowerTools] refresh_activity error:", e);
    } finally {
      delete this._refreshing[activityId];
      this._render();
    }
  }

  async _refreshDevice(deviceId) {
    if (!this._selectedEntity) return;
    this._refreshing[deviceId] = true;
    this._render();
    try {
      await callWS(this._hass, {
        type: `${DOMAIN}/cache/refresh_device`,
        entity_id: this._selectedEntity,
        device_id: deviceId,
      });
      await this._loadSnapshot();
    } catch (e) {
      console.error("[SofabatonPowerTools] refresh_device error:", e);
    } finally {
      delete this._refreshing[deviceId];
      this._render();
    }
  }

  _updateEntityList() {
    const sel = this._shadow.querySelector("#entity-select");
    if (!sel) return;
    const entities = getSofabatonEntities(this._hass);
    const currentVal = sel.value;
    sel.innerHTML = this._entityOptions(entities);
    if (currentVal && entities.some((e) => e.entity_id === currentVal)) {
      sel.value = currentVal;
    }
  }

  _entityOptions(entities) {
    if (!entities.length) {
      return '<option value="">No Sofabaton hubs found</option>';
    }
    const placeholder = '<option value="">— Select hub —</option>';
    const opts = entities
      .map((e) => {
        const name = friendlyName(this._hass, e.entity_id);
        return `<option value="${e.entity_id}">${name}</option>`;
      })
      .join("");
    return placeholder + opts;
  }

  _renderActivities() {
    const snap = this._snapshot || {};
    const activities = snap.activities || {};
    const buttons = snap.buttons || {};
    const macros = snap.macros || {};
    const favorites = snap.favorites || {};

    const ids = Object.keys(activities);
    if (!ids.length) {
      return '<div class="empty-msg">No activities in cache</div>';
    }

    return ids
      .map((idStr) => {
        const id = parseInt(idStr, 10);
        const act = activities[idStr] || {};
        const name = act.name || `Activity ${idStr}`;
        const hasButtons = idStr in buttons;
        const hasMacros = idStr in macros;
        const hasFavorites = idStr in favorites;
        const busy = this._refreshing[id];

        return `
          <div class="entity-row">
            <span class="entity-name" title="${name}">${name}</span>
            <div class="badges">
              <span class="badge ${hasButtons ? "badge-ok" : "badge-miss"}" title="Buttons">BTN</span>
              <span class="badge ${hasMacros ? "badge-ok" : "badge-miss"}" title="Macros">MAC</span>
              <span class="badge ${hasFavorites ? "badge-ok" : "badge-miss"}" title="Favorites">FAV</span>
            </div>
            <button class="refresh-btn" data-kind="activity" data-id="${id}" ${busy ? "disabled" : ""}>
              ${busy ? "…" : "↻"}
            </button>
          </div>`;
      })
      .join("");
  }

  _renderDevices() {
    const snap = this._snapshot || {};
    const devices = snap.devices || {};
    const commands = snap.commands || {};

    const ids = Object.keys(devices);
    if (!ids.length) {
      return '<div class="empty-msg">No devices in cache</div>';
    }

    return ids
      .map((idStr) => {
        const id = parseInt(idStr, 10);
        const dev = devices[idStr] || {};
        const name = dev.name || `Device ${idStr}`;
        const hasCommands = idStr in commands;
        const busy = this._refreshing[id];

        return `
          <div class="entity-row">
            <span class="entity-name" title="${name}">${name}</span>
            <div class="badges">
              <span class="badge ${hasCommands ? "badge-ok" : "badge-miss"}" title="Commands">CMD</span>
            </div>
            <button class="refresh-btn" data-kind="device" data-id="${id}" ${busy ? "disabled" : ""}>
              ${busy ? "…" : "↻"}
            </button>
          </div>`;
      })
      .join("");
  }

  _renderCacheBrowser() {
    const snap = this._snapshot || {};

    const renderSection = (title, data, renderEntry) => {
      const keys = Object.keys(data || {});
      if (!keys.length) return "";
      const entries = keys.map(renderEntry).join("");
      return `
        <div class="cache-section">
          <div class="cache-section-title">${title} (${keys.length})</div>
          ${entries}
        </div>`;
    };

    const activities = snap.activities || {};
    const devices = snap.devices || {};

    const btnSection = renderSection("Buttons", snap.buttons || {}, (k) => {
      const name = (activities[k] || {}).name || k;
      const val = (snap.buttons[k] || []).join(", ") || "—";
      return `<div class="cache-entry"><b>${name}</b>: [${val}]</div>`;
    });

    const cmdSection = renderSection("Commands", snap.commands || {}, (k) => {
      const name = (devices[k] || {}).name || k;
      const cmds = snap.commands[k] || {};
      const count = Object.keys(cmds).length;
      return `<div class="cache-entry"><b>${name}</b>: ${count} command(s)</div>`;
    });

    const macSection = renderSection("Macros", snap.macros || {}, (k) => {
      const name = (activities[k] || {}).name || k;
      const count = (snap.macros[k] || []).length;
      return `<div class="cache-entry"><b>${name}</b>: ${count} macro(s)</div>`;
    });

    const favSection = renderSection("Favorites", snap.favorites || {}, (k) => {
      const name = (activities[k] || {}).name || k;
      const count = (snap.favorites[k] || []).length;
      return `<div class="cache-entry"><b>${name}</b>: ${count} favorite(s)</div>`;
    });

    const content = btnSection + cmdSection + macSection + favSection;
    if (!content) return '<div class="empty-msg">Cache is empty</div>';
    return `<div class="cache-browser">${content}</div>`;
  }

  _render() {
    const hass = this._hass;
    if (!hass) return;

    const entities = getSofabatonEntities(hass);

    // Auto-select first entity if none selected and entities available
    if (!this._selectedEntity && entities.length === 1) {
      this._selectedEntity = entities[0].entity_id;
    }

    const enabledSection = this._cacheEnabled
      ? `
        <div class="row">
          <div>
            <div class="row-label">Hub</div>
          </div>
        </div>
        <select id="entity-select">
          ${this._entityOptions(entities)}
        </select>

        ${
          this._selectedEntity
            ? `
          <div class="section-title">Activities</div>
          ${this._renderActivities()}

          <div class="section-title">Devices</div>
          ${this._renderDevices()}

          <details>
            <summary>Cache Browser</summary>
            ${this._renderCacheBrowser()}
          </details>
        `
            : '<div class="empty-msg">Select a hub above</div>'
        }
      `
      : "";

    this._shadow.innerHTML = `
      <style>${STYLES}</style>
      <div class="card-header">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
        </svg>
        ${CARD_NAME}
      </div>
      <div class="card-content">
        <div class="row">
          <div>
            <div class="row-label">Persistent Cache Storage</div>
            <div class="row-sub">Survive restarts · applies to all hubs</div>
          </div>
          <label class="toggle">
            <input type="checkbox" id="cache-toggle" ${this._cacheEnabled ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>
        ${enabledSection}
      </div>
    `;

    // Wire toggle
    const toggle = this._shadow.querySelector("#cache-toggle");
    if (toggle) {
      toggle.addEventListener("change", (e) => {
        this._toggleCache(e.target.checked);
      });
    }

    // Wire entity select
    const sel = this._shadow.querySelector("#entity-select");
    if (sel) {
      if (this._selectedEntity) sel.value = this._selectedEntity;
      sel.addEventListener("change", (e) => {
        this._selectEntity(e.target.value || null);
      });
    }

    // Wire refresh buttons
    this._shadow.querySelectorAll(".refresh-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const kind = btn.dataset.kind;
        const id = parseInt(btn.dataset.id, 10);
        if (kind === "activity") this._refreshActivity(id);
        else if (kind === "device") this._refreshDevice(id);
      });
    });
  }

  getCardSize() {
    return 3;
  }
}

/* ------------------------------------------------------------------ */
/* Register                                                             */
/* ------------------------------------------------------------------ */

if (!customElements.get(CARD_TYPE)) {
  customElements.define(CARD_TYPE, SofabatonPowerTools);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TYPE)) {
  window.customCards.push({
    type: CARD_TYPE,
    name: CARD_NAME,
    description: "Manage Sofabaton hub cache and settings. No configuration required.",
  });
}
