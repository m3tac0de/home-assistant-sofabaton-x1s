const TOOLS_TYPE = "sofabaton-power-tools";

class SofabatonPowerToolsCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
    const fingerprint = this._hassFingerprint();

    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
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

  _escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  _hassFingerprint() {
    if (!this._hass?.states) return "";

    const remoteData = this._remoteEntities()
      .sort()
      .map((entityId) => {
        const attrs = this._hass.states[entityId]?.attributes || {};
        const activities = Array.isArray(attrs.activities)
          ? attrs.activities.map((activity) => `${activity?.id}:${activity?.name || ""}`).join("|")
          : "";
        return `${entityId};${attrs.entry_id || ""};${activities}`;
      });

    return remoteData.join("||");
  }

  _remoteEntities() {
    return Object.keys(this._hass?.states || {}).filter((entityId) => entityId.startsWith("remote."));
  }

  _entityForHub(hub) {
    const entities = this._remoteEntities();
    return entities.find((entityId) => this._hass.states[entityId]?.attributes?.entry_id === hub.entry_id) || null;
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

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }

    const asString = String(err || "").trim();
    if (asString && asString !== "[object Object]") {
      return asString;
    }

    return "Unknown error (check Home Assistant logs)";
  }

  _sortByName(items) {
    return [...(items || [])].sort((left, right) =>
      String(left?.name || left?.label || "").localeCompare(String(right?.name || right?.label || ""))
    );
  }

  _sortById(items) {
    return [...(items || [])].sort((left, right) => Number(left?.id || left?.button_id || 0) - Number(right?.id || right?.button_id || 0));
  }

  _syncSelection() {
    const hubs = Array.isArray(this._contents?.hubs) ? this._contents.hubs : [];
    if (!hubs.length) {
      this._selectedHubEntryId = null;
      this._selectedActivityId = null;
      return;
    }

    if (!hubs.some((hub) => hub.entry_id === this._selectedHubEntryId)) {
      this._selectedHubEntryId = hubs[0].entry_id;
    }

    const hub = this._selectedHub();
    const activities = Array.isArray(hub?.activities) ? this._sortById(hub.activities) : [];

    if (!activities.length) {
      this._selectedActivityId = null;
      return;
    }

    if (!activities.some((activity) => Number(activity.id) === Number(this._selectedActivityId))) {
      this._selectedActivityId = Number(activities[0].id);
    }
  }

  _selectedHub() {
    const hubs = Array.isArray(this._contents?.hubs) ? this._contents.hubs : [];
    return hubs.find((hub) => hub.entry_id === this._selectedHubEntryId) || hubs[0] || null;
  }

  _selectedActivity(hub = this._selectedHub()) {
    const activities = Array.isArray(hub?.activities) ? hub.activities : [];
    return activities.find((activity) => Number(activity.id) === Number(this._selectedActivityId)) || activities[0] || null;
  }

  _hubActivities(hub) {
    return this._sortById(Array.isArray(hub?.activities) ? hub.activities : []);
  }

  _activityFavorites(hub, activityId) {
    const rows = hub?.activity_favorites?.[String(activityId)];
    return this._sortById(Array.isArray(rows) ? rows : []);
  }

  _activityKeybindings(hub, activityId) {
    const rows = hub?.activity_keybindings?.[String(activityId)];
    return this._sortByName(Array.isArray(rows) ? rows : []);
  }

  _activityMacros(hub, activityId) {
    const rows = hub?.activity_macros?.[String(activityId)];
    return this._sortByName(Array.isArray(rows) ? rows : []);
  }

  _devicesForHub(hub) {
    return this._sortByName(Array.isArray(hub?.devices_list) ? hub.devices_list : []);
  }

  _deviceCommands(hub, deviceId) {
    const commands = hub?.commands?.[String(deviceId)] || {};
    return Object.entries(commands)
      .map(([commandId, label]) => ({
        id: Number(commandId),
        label: String(label || `Command ${commandId}`),
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  async _togglePersistent(enabled) {
    await this._ws({ type: "sofabaton_x1s/persistent_cache/set", enabled: !!enabled });
    this._actionMessage = null;
    await this._loadState();
  }

  async _refreshForHub(kind, hubEntryId, targetId) {
    if (this._refreshBusy) return;

    const hubs = Array.isArray(this._contents?.hubs) ? this._contents.hubs : [];
    const hub = hubs.find((item) => item.entry_id === hubEntryId);
    const entityId = hub ? this._entityForHub(hub) : null;
    const payload = {
      type: "sofabaton_x1s/persistent_cache/refresh",
      kind,
      target_id: Number(targetId),
    };

    if (entityId) {
      payload.entity_id = entityId;
    } else {
      payload.entry_id = hubEntryId;
    }

    this._refreshBusy = true;
    this._actionMessage = `Refreshing ${kind} ${targetId} for ${hub?.name || hubEntryId}...`;
    this._render();

    try {
      await this._ws(payload);
      this._actionMessage = `Refreshed ${kind} ${targetId} for ${hub?.name || hubEntryId}.`;
      await this._loadState();
    } catch (err) {
      this._actionMessage = `Refresh failed: ${this._formatError(err)}`;
      this._render();
    } finally {
      this._refreshBusy = false;
      this._render();
    }
  }

  _renderStatus() {
    if (this._loadError) {
      return `<div class="status status-error">${this._escape(this._loadError)}</div>`;
    }

    if (this._actionMessage) {
      return `<div class="status">${this._escape(this._actionMessage)}</div>`;
    }

    if (this._loading) {
      return `<div class="status status-subtle">Loading cache contents...</div>`;
    }

    if (this._refreshBusy) {
      return `<div class="status status-subtle">Refresh in progress, please wait...</div>`;
    }

    return "";
  }

  _renderToggle() {
    return `
      <div class="toolbar-chip toolbar-chip--toggle">
        <span class="toolbar-label">Cache</span>
        <ha-switch id="persist-toggle" aria-label="Persistent cache"></ha-switch>
      </div>
    `;
  }

  _renderHubPicker(hub) {
    const hubs = Array.isArray(this._contents?.hubs) ? this._contents.hubs : [];
    if (!hubs.length) return "";

    return `
      <label class="toolbar-chip toolbar-chip--select">
        <span class="toolbar-label">Hub</span>
        <select id="hub-select" class="field-control">
          ${hubs
            .map(
              (item) =>
                `<option value="${this._escape(item.entry_id)}" ${item.entry_id === hub?.entry_id ? "selected" : ""}>${this._escape(item.name || item.entry_id)}</option>`
            )
            .join("")}
        </select>
      </label>
    `;
  }

  _renderToolbar(hub, enabled) {
    return `
      <div class="toolbar">
        <div class="toolbar-title">
          <span class="title">Sofabaton Power Tools</span>
          <span class="subtitle subtitle--inline">Cache inspector</span>
        </div>
        <div class="toolbar-actions">
          ${enabled ? this._renderHubPicker(hub) : ""}
          ${this._renderToggle()}
        </div>
      </div>
    `;
  }

  _renderActivityTabs(hub, selectedActivity) {
    const activities = this._hubActivities(hub);
    if (!activities.length) {
      return `
        <div class="empty-card">
          <div class="empty-title">No cached activities</div>
          <div class="empty-copy">Refresh an activity once persistent cache is enabled to populate this workspace.</div>
        </div>
      `;
    }

    return `
      <div class="activity-strip" role="tablist" aria-label="Activities">
        ${activities
          .map((activity) => {
            const isSelected = Number(activity.id) === Number(selectedActivity?.id);
            return `
              <button
                class="activity-tab ${isSelected ? "is-active" : ""}"
                type="button"
                role="tab"
                aria-selected="${isSelected ? "true" : "false"}"
                data-activity-id="${Number(activity.id)}"
              >
                <span class="activity-tab__title">${this._escape(activity.name || `Activity ${activity.id}`)}</span>
                <span class="activity-tab__meta">
                  ${Number(activity.favorite_count || 0)} favorites
                  · ${Number(activity.keybinding_count || 0)} bindings
                  · ${Number(activity.macro_count || 0)} macros
                </span>
              </button>
            `;
          })
          .join("")}
      </div>
    `;
  }

  _renderFavoritesSection(hub, selectedActivity) {
    const favorites = this._activityFavorites(hub, selectedActivity?.id);
    if (!favorites.length) {
      return `
        <div class="section-card">
          <div class="section-heading">Favorites</div>
          <div class="empty-card empty-card--flat">
            <div class="empty-title">No cached favorites</div>
            <div class="empty-copy">This activity does not currently expose any cached quick-access favorites.</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="section-card">
        <div class="section-heading">Favorites</div>
        <div class="list-grid">
          ${favorites
            .map(
              (favorite) => `
                <div class="data-row">
                  <div class="data-row__main">
                    <div class="data-row__title">${this._escape(favorite.label || `Command ${favorite.command_id}`)}</div>
                    <div class="data-row__meta">${this._escape(favorite.device_name || `Device ${favorite.device_id}`)} · Command ${Number(favorite.command_id)}</div>
                  </div>
                  <div class="data-row__badge">Slot ${Number(favorite.button_id)}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  _renderMacrosSection(hub, selectedActivity) {
    const macros = this._activityMacros(hub, selectedActivity?.id);
    if (!macros.length) {
      return `
        <div class="section-card">
          <div class="section-heading">Macros</div>
          <div class="empty-card empty-card--flat">
            <div class="empty-title">No cached macros</div>
            <div class="empty-copy">Macro data will appear here once this activity has been cached.</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="section-card">
        <div class="section-heading">Macros</div>
        <div class="list-grid">
          ${macros
            .map(
              (macro) => `
                <div class="data-row">
                  <div class="data-row__main">
                    <div class="data-row__title">${this._escape(macro.label || macro.name || `Macro ${macro.command_id}`)}</div>
                    <div class="data-row__meta">Macro command ${Number(macro.command_id)}</div>
                  </div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  _renderKeybindingsSection(hub, selectedActivity) {
    const keybindings = this._activityKeybindings(hub, selectedActivity?.id);
    if (!keybindings.length) {
      return `
        <div class="section-card section-card--full">
          <div class="section-heading">Key bindings</div>
          <div class="empty-card empty-card--flat">
            <div class="empty-title">No cached keybindings</div>
            <div class="empty-copy">Mapped hard buttons for this activity will appear here when available in cache.</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="section-card section-card--full">
        <div class="section-heading">Key bindings</div>
        <div class="list-grid">
          ${keybindings
            .map(
              (binding) => `
                <div class="data-row">
                  <div class="data-row__main">
                    <div class="data-row__title">${this._escape(binding.button_name || `Button ${binding.button_id}`)}</div>
                    <div class="data-row__meta">${this._escape(binding.device_name || `Device ${binding.device_id}`)} · ${this._escape(binding.label || `Command ${binding.command_id}`)}</div>
                  </div>
                  <div class="data-row__badge">#${Number(binding.button_id)}</div>
                </div>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  _renderActivityWorkspace(hub) {
    const selectedActivity = this._selectedActivity(hub);
    const activityTitle = selectedActivity?.name || "Activity workspace";

    if (!selectedActivity) {
      return `
        <div class="workspace-header">
          <div>
            <div class="workspace-title">Activity workspace</div>
            <div class="workspace-subtitle">Choose a hub with cached activity data to inspect favorites and keybindings.</div>
          </div>
        </div>
        ${this._renderActivityTabs(hub, selectedActivity)}
      `;
    }

    return `
      <div class="workspace-header workspace-header--compact">
        <div class="workspace-header__main">
          <div class="workspace-title">${this._escape(activityTitle)}</div>
          <div class="workspace-metrics">
            <span>${Number(selectedActivity.favorite_count || 0)} favorites</span>
            <span>${Number(selectedActivity.keybinding_count || 0)} bindings</span>
            <span>${Number(selectedActivity.macro_count || 0)} macros</span>
          </div>
        </div>
        <button
          class="action-btn action-btn--small"
          type="button"
          data-refresh-kind="activity"
          data-refresh-target="${Number(selectedActivity.id)}"
          ${this._refreshBusy ? "disabled" : ""}
        >
          ${this._refreshBusy ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      ${this._renderActivityTabs(hub, selectedActivity)}
      <div class="workspace-grid">
        <div class="workspace-column">
          ${this._renderFavoritesSection(hub, selectedActivity)}
          ${this._renderMacrosSection(hub, selectedActivity)}
        </div>
        <div class="workspace-column">
          ${this._renderKeybindingsSection(hub, selectedActivity)}
        </div>
      </div>
    `;
  }

  _renderDevicesSection(hub) {
    const devices = this._devicesForHub(hub);
    if (!devices.length) {
      return `
        <details class="device-panel">
          <summary class="device-panel__summary">
            <span class="section-heading section-heading--compact">Devices cache</span>
            <span class="device-panel__meta">0 devices</span>
          </summary>
          <div class="device-panel__body">
            <div class="empty-card empty-card--flat">
              <div class="empty-title">No cached devices</div>
              <div class="empty-copy">Device cache entries will appear here after individual devices are refreshed.</div>
            </div>
          </div>
        </details>
      `;
    }

    return `
      <details class="device-panel">
        <summary class="device-panel__summary">
          <span class="section-heading section-heading--compact">Devices cache</span>
          <span class="device-panel__meta">${devices.length} devices</span>
        </summary>
        <div class="device-panel__body">
          <div class="devices-list">
            ${devices
              .map((device) => {
                const commands = this._deviceCommands(hub, device.id);
                return `
                  <details class="device-card">
                    <summary class="device-card__summary">
                      <div class="device-card__main">
                        <div class="device-card__title">${this._escape(device.name || `Device ${device.id}`)}</div>
                        <div class="device-card__meta">${Number(device.command_count || 0)} cached commands</div>
                      </div>
                      <button
                        class="action-btn action-btn--small"
                        type="button"
                        data-refresh-kind="device"
                        data-refresh-target="${Number(device.id)}"
                        ${this._refreshBusy ? "disabled" : ""}
                      >
                        ${this._refreshBusy ? "Refreshing..." : "Refresh"}
                      </button>
                    </summary>
                    <div class="device-card__body">
                      ${
                        commands.length
                          ? `<div class="list-grid">${commands
                              .map(
                                (command) => `
                                  <div class="data-row data-row--compact">
                                    <div class="data-row__main">
                                      <div class="data-row__title">${this._escape(command.label)}</div>
                                    </div>
                                    <div class="data-row__badge">#${Number(command.id)}</div>
                                  </div>
                                `
                              )
                              .join("")}</div>`
                          : `<div class="empty-card empty-card--flat"><div class="empty-title">No cached commands</div><div class="empty-copy">Refresh this device to fetch command labels into cache.</div></div>`
                      }
                    </div>
                  </details>
                `;
              })
              .join("")}
          </div>
        </div>
      </details>
    `;
  }

  _renderDisabledState() {
    return `
      <div class="empty-card">
        <div class="empty-title">Persistent cache is disabled</div>
        <div class="empty-copy">Enable persistent cache to browse hub cache contents and inspect activity favorites, macros, and keybindings.</div>
      </div>
    `;
  }

  _renderEmptyState() {
    return `
      <div class="empty-card">
        <div class="empty-title">No hubs found</div>
        <div class="empty-copy">Add or reconnect a Sofabaton hub to use the power tools workspace.</div>
      </div>
    `;
  }

  _styles() {
    return `
      <style>
        :host {
          display: block;
          color: var(--primary-text-color);
        }

        ha-card {
          overflow: hidden;
        }

        .card-shell {
          display: grid;
          gap: 12px;
          padding: 14px;
        }

        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .toolbar-title {
          display: flex;
          align-items: baseline;
          gap: 10px;
          min-width: 0;
        }

        .title {
          margin: 0;
          font-size: 18px;
          font-weight: 500;
          line-height: 1.2;
        }

        .subtitle {
          color: var(--secondary-text-color);
          font-size: 12px;
          line-height: 1.3;
        }

        .subtitle--inline {
          white-space: nowrap;
        }

        .workspace-header,
        .section-card,
        .empty-card,
        .device-card,
        .activity-tab,
        .status,
        .device-panel,
        .toolbar-chip {
          border: 1px solid var(--divider-color);
          border-radius: 12px;
          background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        }

        .toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .toolbar-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 38px;
          padding: 0 10px;
        }

        .toolbar-chip--select {
          min-width: 180px;
          padding-right: 6px;
        }

        .toolbar-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
        }

        .field-control {
          min-height: 30px;
          border: 0;
          background: transparent;
          color: var(--primary-text-color);
          padding: 0 6px 0 0;
          font: inherit;
        }

        .status {
          padding: 8px 10px;
          font-size: 12px;
          line-height: 1.4;
        }

        .status-subtle {
          color: var(--secondary-text-color);
        }

        .status-error {
          color: var(--error-color);
        }

        .workspace-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
        }

        .workspace-header--compact {
          margin-top: 2px;
        }

        .workspace-header__main {
          display: grid;
          gap: 4px;
        }

        .workspace-title {
          font-size: 18px;
          font-weight: 500;
          line-height: 1.2;
        }

        .workspace-metrics {
          display: flex;
          flex-wrap: wrap;
          gap: 6px 12px;
          color: var(--secondary-text-color);
          font-size: 12px;
          line-height: 1.35;
        }

        .activity-strip {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 1px;
        }

        .activity-tab {
          min-width: 156px;
          display: grid;
          gap: 2px;
          padding: 8px 10px;
          text-align: left;
          cursor: pointer;
          color: inherit;
          font: inherit;
          transition: border-color 120ms ease, box-shadow 120ms ease, background-color 120ms ease;
        }

        .activity-tab.is-active {
          border-color: var(--primary-color);
          box-shadow: inset 0 -2px 0 var(--primary-color);
        }

        .activity-tab__title {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.2;
        }

        .activity-tab__meta {
          color: var(--secondary-text-color);
          font-size: 11px;
          line-height: 1.35;
        }

        .workspace-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        }

        .workspace-column {
          display: grid;
          gap: 12px;
          align-content: start;
        }

        .section-card {
          display: grid;
          gap: 10px;
          padding: 10px 12px;
        }

        .section-card--full {
          min-height: 100%;
        }

        .section-heading {
          font-size: 15px;
          font-weight: 500;
          line-height: 1.2;
        }

        .section-heading--compact {
          font-size: 14px;
        }

        .list-grid,
        .devices-list {
          display: grid;
          gap: 8px;
        }

        .data-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 10px;
          border: 1px solid var(--divider-color);
          border-radius: 10px;
          background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color)));
        }

        .data-row--compact {
          padding: 7px 9px;
        }

        .data-row__main {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        .data-row__title {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.25;
          word-break: break-word;
        }

        .data-row__meta {
          color: var(--secondary-text-color);
          font-size: 11px;
          line-height: 1.4;
          word-break: break-word;
        }

        .data-row__badge {
          white-space: nowrap;
          color: var(--secondary-text-color);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        .empty-card {
          display: grid;
          gap: 6px;
          padding: 12px;
        }

        .empty-card--flat {
          border-style: dashed;
          background: transparent;
        }

        .empty-title {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.3;
        }

        .empty-copy {
          color: var(--secondary-text-color);
          font-size: 12px;
          line-height: 1.5;
        }

        .action-btn {
          min-height: 32px;
          padding: 0 10px;
          border: 1px solid var(--divider-color);
          border-radius: 10px;
          background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
          color: var(--primary-text-color);
          font: inherit;
          cursor: pointer;
        }

        .action-btn--small {
          min-height: 28px;
          padding: 0 8px;
          font-size: 12px;
        }

        .action-btn:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .device-panel {
          overflow: hidden;
        }

        .device-panel__summary {
          list-style: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          cursor: pointer;
        }

        .device-panel__summary::-webkit-details-marker {
          display: none;
        }

        .device-panel__meta {
          color: var(--secondary-text-color);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }

        .device-panel__body {
          padding: 0 12px 12px;
        }

        .device-card {
          overflow: hidden;
        }

        .device-card__summary {
          list-style: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          cursor: pointer;
        }

        .device-card__summary::-webkit-details-marker {
          display: none;
        }

        .device-card__main {
          display: grid;
          gap: 2px;
          min-width: 0;
        }

        .device-card__title {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.3;
        }

        .device-card__meta {
          color: var(--secondary-text-color);
          font-size: 11px;
          line-height: 1.4;
        }

        .device-card__body {
          padding: 0 12px 12px;
        }

        @media (max-width: 900px) {
          .workspace-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .workspace-header,
          .device-card__summary,
          .toolbar,
          .toolbar-actions,
          .device-panel__summary {
            flex-direction: column;
            align-items: stretch;
          }

          .action-btn,
          .action-btn--small {
            width: 100%;
          }
        }
      </style>
    `;
  }

  _renderEnabledContent() {
    const hub = this._selectedHub();
    if (!hub) {
      return this._renderEmptyState();
    }

    return `
      ${this._renderToolbar(hub, true)}
      ${this._renderStatus()}
      ${this._renderActivityWorkspace(hub)}
      ${this._renderDevicesSection(hub)}
    `;
  }

  _render() {
    if (!this._hass || !this._root) return;

    const enabled = !!this._state?.enabled;
    const content = enabled ? this._renderEnabledContent() : `
      ${this._renderToolbar(null, false)}
      ${this._renderStatus()}
      ${this._renderDisabledState()}
    `;

    this._root.innerHTML = `
      ${this._styles()}
      <ha-card>
        <div class="card-shell">
          ${content}
        </div>
      </ha-card>
    `;

    const switchEl = this._root.querySelector("#persist-toggle");
    if (switchEl) {
      switchEl.checked = enabled;
      switchEl.disabled = this._loading || this._refreshBusy;
      switchEl.addEventListener("change", (ev) => {
        const checked = !!ev.target?.checked;
        this._togglePersistent(checked);
      });
    }

    this._root.querySelector("#hub-select")?.addEventListener("change", (ev) => {
      this._selectedHubEntryId = ev.target?.value || null;
      const hub = this._selectedHub();
      const firstActivity = this._hubActivities(hub)[0] || null;
      this._selectedActivityId = firstActivity ? Number(firstActivity.id) : null;
      this._render();
    });

    this._root.querySelectorAll("[data-activity-id]").forEach((button) => {
      button.addEventListener("click", () => {
        this._selectedActivityId = Number(button.getAttribute("data-activity-id"));
        this._render();
      });
    });

    this._root.querySelectorAll("[data-refresh-kind]").forEach((button) => {
      button.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const kind = button.getAttribute("data-refresh-kind");
        const targetId = button.getAttribute("data-refresh-target");
        const hub = this._selectedHub();
        if (!kind || !targetId || !hub?.entry_id) return;
        this._refreshForHub(kind, hub.entry_id, Number(targetId));
      });
    });
  }
}

if (!customElements.get(TOOLS_TYPE)) {
  customElements.define(TOOLS_TYPE, SofabatonPowerToolsCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.find((card) => card.type === TOOLS_TYPE)) {
  window.customCards.push({
    type: TOOLS_TYPE,
    name: "Sofabaton Power Tools",
    description: "Manage and inspect the Sofabaton integration cache",
  });
}
