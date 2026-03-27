const TOOLS_TYPE = "sofabaton-control-panel";
const TOOLS_VERSION = "0.0.1";
const TOOLS_LOG_ONCE_KEY = `__${TOOLS_TYPE}_logged__`;

// Mirrors ButtonName from lib/protocol_const.py — same .title() label transform.
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

// Call at module load (top-level)
logOnce();

class SofabatonControlPanelCard extends HTMLElement {
  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  static getConfigElement() {
    return document.createElement(`${TOOLS_TYPE}-editor`);
  }

  setConfig(config) {
    this._config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
    const fingerprint = this._hassFingerprint();

    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._openSection = "activities";
      this._openEntity = null;
      this._lastHassFingerprint = fingerprint;
      this._loadState();
      this._render();
      return;
    }

    if (fingerprint !== this._lastHassFingerprint) {
      this._lastHassFingerprint = fingerprint;
      this._render();
    }
  }

  getCardSize() {
    return 8;
  }

  // ─── WebSocket helpers ────────────────────────────────────────────────────────

  async _ws(msg) {
    return this._hass.callWS(msg);
  }

  async _loadState() {
    this._loading = true;
    this._loadError = null;
    this._render();

    try {
      const [state, contents] = await Promise.all([
        this._ws({ type: "sofabaton_x1s/persistent_cache/get" }),
        this._ws({ type: "sofabaton_x1s/persistent_cache/contents" }),
      ]);
      this._state = state;
      this._contents = contents;
      this._syncSelection();
    } catch (err) {
      this._loadError = this._formatError(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  // ─── Entity finders ───────────────────────────────────────────────────────────

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

  _proxyClientConnected(hub) {
    if (!hub) return false;
    const entityId = this._entityForHub(hub);
    return !!(this._hass?.states[entityId]?.attributes?.proxy_client_connected);
  }

  // ─── Fingerprint ──────────────────────────────────────────────────────────────

  _hassFingerprint() {
    if (!this._hass?.states) return "";

    return this._remoteEntities()
      .sort()
      .map((id) => {
        const attrs = this._hass.states[id]?.attributes || {};
        return `${id};${attrs.entry_id || ""};${attrs.proxy_client_connected ? "1" : "0"}`;
      })
      .join("||");
  }

  // ─── Cache data helpers ───────────────────────────────────────────────────────

  _syncSelection() {
    const hubs = Array.isArray(this._contents?.hubs) ? this._contents.hubs : [];
    if (!hubs.length) {
      this._selectedHubEntryId = null;
      return;
    }
    if (!hubs.some((h) => h.entry_id === this._selectedHubEntryId)) {
      this._selectedHubEntryId = hubs[0].entry_id;
    }
  }

  _selectedHub() {
    const hubs = Array.isArray(this._contents?.hubs) ? this._contents.hubs : [];
    return hubs.find((h) => h.entry_id === this._selectedHubEntryId) || hubs[0] || null;
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
    // hub.buttons[actId] = array of physical button IDs assigned to this activity
    const ids = hub?.buttons?.[String(activityId)];
    return Array.isArray(ids) ? ids.map(Number) : [];
  }

  _buttonName(btnId) {
    return BUTTON_NAMES[btnId] || `Button ${btnId}`;
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

  // ─── Sorting ──────────────────────────────────────────────────────────────────

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

  // ─── Utilities ────────────────────────────────────────────────────────────────

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
    const bodyTop   = body.getBoundingClientRect().top;
    body.scrollTo({ top: body.scrollTop + (entityTop - bodyTop), behavior: "smooth" });
  }

  // ─── Actions ──────────────────────────────────────────────────────────────────

  async _togglePersistent(enabled) {
    try {
      await this._ws({ type: "sofabaton_x1s/persistent_cache/set", enabled: !!enabled });
      await this._loadState();
    } catch (err) {
      this._render();
    }
  }

  _refreshPayload(kind, hubEntryId, targetId) {
    const hubs = Array.isArray(this._contents?.hubs) ? this._contents.hubs : [];
    const hub = hubs.find((h) => h.entry_id === hubEntryId);
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
      await this._loadState();
    } catch (err) {
      // intentionally silent
    } finally {
      this._refreshBusy = false;
      this._activeRefreshLabel = null;
      this._render();
      requestAnimationFrame(() => this._scrollEntityToTop(key));
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
        kind: sectionId,  // "activities" or "devices"
      });
      await this._loadState();
    } catch (err) {
      // intentionally silent
    } finally {
      this._refreshBusy = false;
      this._activeRefreshLabel = null;
      this._render();
    }
  }

  // ─── Styles ───────────────────────────────────────────────────────────────────

  _styles() {
    return `<style>
      :host { display: block; }
      *, *::before, *::after { box-sizing: border-box; }

      /* Fixed-height flex column inside ha-card — border-radius + overflow clips content to card corners */
      .card-inner {
        height: var(--tools-card-height, 480px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border-radius: var(--ha-card-border-radius, 12px);
      }

      /* ── Header ── */
      .card-header {
        flex-shrink: 0;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 0 16px;
        border-bottom: 1px solid var(--divider-color);
      }
      .card-title { font-size: 16px; font-weight: 600; }
      /* ── Hub picker (custom dropdown — no native select) ── */
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

      /* Dialog sits in the top layer — not clipped by card overflow */
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

      /* ── Main body: fills remaining height after header ── */
      .card-body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }

      /* ── Cache panel: accordion ── */
      .cache-panel {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
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

      .chevron {
        font-size: 10px;
        color: var(--secondary-text-color);
        transition: transform 150ms;
        flex-shrink: 0;
      }
      .accordion-section.open .chevron { transform: rotate(180deg); }

      /* Scrollable body — only present when section is open */
      .acc-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0 16px 12px;
        display: grid;
        gap: 6px;
        align-content: start;
      }

      /* ── Entity blocks ── */
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

      /* Sticky header while open entity scrolls within acc-body */
      .entity-block.open > .entity-summary {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--secondary-background-color, var(--ha-card-background));
        border-bottom: 1px solid var(--divider-color);
        /* Keep top corners rounded whether or not the entity-block top is in view */
        border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0;
      }

      .entity-body { display: none; }
      .entity-block.open .entity-body { display: block; }

      .inner-section-label {
        padding: 7px 12px 3px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
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

      /* ── Cache panel states ── */
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
      .cache-state-icon  { font-size: 32px; line-height: 1; margin-bottom: 4px; }
      .cache-state-title { font-size: 14px; font-weight: 600; color: var(--primary-text-color); }
      .cache-state-sub   { font-size: 12px; line-height: 1.5; max-width: 220px; }

      /* ── Cache footer (always visible — cache on/off toggle) ── */
      .cache-footer {
        flex-shrink: 0;
        height: 44px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 16px;
        border-top: 1px solid var(--divider-color);
      }
      .cache-footer-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--secondary-text-color);
      }

    </style>`;
  }

  // ─── Render: Activity entity block ────────────────────────────────────────────

  _renderActivity(hub, activity) {
    const id = Number(activity.id);
    const key = `act-${id}`;
    const isOpen = this._openEntity === key;
    const proxyLocked = this._proxyClientConnected(hub);
    const locked = this._refreshBusy || proxyLocked;
    const isSpinning = this._refreshBusy && this._activeRefreshLabel === key;

    const favCount = Number(activity.favorite_count ?? 0);
    const macCount = Number(activity.macro_count ?? 0);
    // Use hub.buttons[actId] for the authoritative assigned-button count
    const btnIds   = this._activityButtons(hub, id);
    const btnCount = btnIds.length;

    let bodyHtml = "";
    if (isOpen) {
      const favorites = this._activityFavorites(hub, id);
      const macros    = this._activityMacros(hub, id);

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

  // ─── Render: Device entity block ──────────────────────────────────────────────

  _renderDevice(hub, device) {
    const id = Number(device.id);
    const key = `dev-${id}`;
    const isOpen = this._openEntity === key;
    const proxyLocked = this._proxyClientConnected(hub);
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

  // ─── Render: Accordion section ────────────────────────────────────────────────

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
          <button class="icon-btn${this._refreshBusy ? " spinning" : ""}"
            id="refresh-${sectionId}"
            title="${proxyLocked ? "Unavailable while proxy client is connected" : `Refresh ${title.toLowerCase()}`}"
            ${locked ? "disabled" : ""}>↻</button>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? `<div class="acc-body" id="acc-body-${sectionId}">${itemsHtml}</div>` : ""}
      </div>`;
  }

  // ─── Render: Cache panel ──────────────────────────────────────────────────────

  _renderCache(hub) {
    if (this._loading) {
      return `<div class="cache-state">Loading…</div>`;
    }
    if (this._loadError) {
      return `<div class="cache-state error">${this._escape(this._loadError)}</div>`;
    }
    if (!this._state?.enabled) {
      return `
        <div class="cache-state">
          <div class="cache-state-icon">💾</div>
          <div class="cache-state-title">Persistent cache is off</div>
          <div class="cache-state-sub">Enable it using the toggle below to browse cached activities and devices</div>
        </div>`;
    }
    if (!hub) {
      return `<div class="cache-state">No hubs found.</div>`;
    }

    const activities = this._hubActivities(hub);
    const devices = this._devicesForHub(hub);

    return `
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
      </div>`;
  }

  // ─── Render: Main ─────────────────────────────────────────────────────────────

  _render() {
    if (!this._hass || !this._root) return;

    const hub = this._selectedHub();
    const hubs = Array.isArray(this._contents?.hubs) ? this._contents.hubs : [];

    this._root.innerHTML = `
      ${this._styles()}
      <ha-card>
        <div class="card-inner" style="height:${this._config?.card_height ?? 480}px">
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
          <div class="card-body">
            ${this._renderCache(hub)}
          </div>
          <div class="cache-footer">
            <span class="cache-footer-label">Persistent cache</span>
            <div class="flex-spacer"></div>
            <ha-switch id="sw-cache"></ha-switch>
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
  }

  // ─── Event wiring ─────────────────────────────────────────────────────────────

  _wireUp(hub) {
    const root = this._root;
    const entryId = hub?.entry_id || null;

    // ── Hub picker (custom dropdown via <dialog>) ──
    const pickerBtn    = root.getElementById("hub-picker-btn");
    const pickerDialog = root.getElementById("hub-picker-dialog");
    if (pickerBtn && pickerDialog) {
      pickerBtn.addEventListener("click", () => {
        const rect = pickerBtn.getBoundingClientRect();
        pickerDialog.style.top  = (rect.bottom + 4) + "px";
        pickerDialog.style.left = Math.max(8, rect.right - (pickerDialog.offsetWidth || 160)) + "px";
        pickerDialog.showModal();
        // Re-align now that browser has laid out the dialog
        pickerDialog.style.left = Math.max(8, rect.right - pickerDialog.offsetWidth) + "px";
      });
      pickerDialog.addEventListener("click", (e) => {
        const opt = e.target.closest(".hub-option");
        if (opt) {
          this._selectedHubEntryId = opt.dataset.entryId;
          this._openEntity = null;
          pickerDialog.close();
          this._render();
        } else {
          pickerDialog.close();
        }
      });
    }

    // ── Cache footer toggle (always present) ──
    const swCache = root.getElementById("sw-cache");
    if (swCache) {
      swCache.checked  = !!this._state?.enabled;
      swCache.disabled = !!this._loading;
      swCache.addEventListener("change", (ev) => this._togglePersistent(!!ev.target?.checked));
    }

    // ── Cache accordion ──
    root.querySelectorAll("[data-section]").forEach((header) => {
      header.addEventListener("click", (e) => {
        if (e.target.closest(".icon-btn")) return;
        const sectionId = header.dataset.section;
        this._openSection = this._openSection === sectionId ? null : sectionId;
        this._openEntity = null;
        this._render();
      });
    });

    // Section refresh buttons — refresh all entities in the section sequentially
    ["activities", "devices"].forEach((sectionId) => {
      root.getElementById(`refresh-${sectionId}`)?.addEventListener("click", (e) => {
        e.stopPropagation();
        this._refreshSection(sectionId);
      });
    });

    // Entity expand / collapse (single-open)
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

    // Per-entity refresh
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
    const height = this._config?.card_height ?? 480;
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
      <div class="editor-hint">Controls how much of the activity/device lists is visible. Default: 480 px.</div>
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
