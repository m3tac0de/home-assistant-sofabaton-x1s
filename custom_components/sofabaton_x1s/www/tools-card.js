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
    this._state = await this._ws({ type: "sofabaton_x1s/persistent_cache/get" });
    this._contents = await this._ws({ type: "sofabaton_x1s/persistent_cache/contents" });
    this._render();
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

  _activityName(entityId, activityId) {
    const activities = this._hass?.states?.[entityId]?.attributes?.activities;
    if (!Array.isArray(activities)) return null;
    return activities.find((activity) => Number(activity?.id) === Number(activityId))?.name || null;
  }

  _activitiesForHub(hub, entityId) {
    const activities = this._hass?.states?.[entityId]?.attributes?.activities;
    if (Array.isArray(activities) && activities.length) {
      return activities
        .map((activity) => ({
          id: Number(activity?.id),
          name: activity?.name || null,
        }))
        .filter((activity) => Number.isFinite(activity.id) && activity.id >= 1 && activity.id <= 255)
        .sort((a, b) => a.id - b.id);
    }

    const activityIds = new Set([
      ...Object.keys(hub.activity_macros || {}),
      ...Object.keys(hub.activity_favorite_slots || {}),
      ...Object.keys(hub.activity_favorite_labels || {}),
      ...Object.keys(hub.activity_members || {}),
    ]);

    return Array.from(activityIds)
      .map((id) => ({ id: Number(id), name: null }))
      .filter((activity) => Number.isFinite(activity.id) && activity.id >= 1 && activity.id <= 255)
      .sort((a, b) => a.id - b.id);
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

    try {
      const seen = new WeakSet();
      const serialized = JSON.stringify(err, (key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        return value;
      });
      if (serialized && serialized !== "{}") return serialized;
    } catch (_jsonErr) {
      // ignore and use fallback below
    }

    return "Unknown error (check Home Assistant logs)";
  }

  async _togglePersistent(ev) {
    const enabled = !!ev.target.checked;
    await this._ws({ type: "sofabaton_x1s/persistent_cache/set", enabled });
    this._actionMessage = null;
    await this._loadState();
  }

  _favoritesForActivity(hub, activityId) {
    const labels = hub.activity_favorite_labels?.[activityId] || [];
    if (labels.length) {
      return labels.map((favorite) => ({
        label: favorite.label || `Device ${favorite.device_id} · Command ${favorite.command_id}`,
        detail: `Device ${favorite.device_id} · Command ${favorite.command_id}`,
      }));
    }

    const slots = hub.activity_favorite_slots?.[activityId] || [];
    return slots.map((slot) => ({
      label: `Slot ${slot.button_id}`,
      detail: `Device ${slot.device_id} · Command ${slot.command_id}`,
    }));
  }

  _renderDeviceCommands(hub, deviceId) {
    const commands = hub.commands?.[deviceId] || {};
    const entries = Object.entries(commands);
    if (!entries.length) {
      return "<div style=\"padding-left:16px;opacity:0.7;\">No cached commands</div>";
    }

    return `<ul style="margin:6px 0 0 16px;">${entries
      .map(([commandId, label]) => `<li>${this._escape(label)} <small>(#${commandId})</small></li>`)
      .join("")}</ul>`;
  }

  _renderActivityChildren(hub, activityId) {
    const macros = hub.activity_macros?.[activityId] || [];
    const favorites = this._favoritesForActivity(hub, activityId);

    return `
      <details style="margin-left:16px;">
        <summary>Macros (${macros.length})</summary>
        ${
          macros.length
            ? `<ul style="margin:6px 0 0 16px;">${macros
                .map(
                  (macro) =>
                    `<li>${this._escape(macro.label || `Macro #${macro.command_id}`)} <small>(#${macro.command_id})</small></li>`
                )
                .join("")}</ul>`
            : '<div style="padding-left:16px;opacity:0.7;">No cached macros</div>'
        }
      </details>
      <details style="margin-left:16px;">
        <summary>Favorites (${favorites.length})</summary>
        ${
          favorites.length
            ? `<ul style="margin:6px 0 0 16px;">${favorites
                .map((favorite) => `<li>${this._escape(favorite.label)} <small>${this._escape(favorite.detail)}</small></li>`)
                .join("")}</ul>`
            : '<div style="padding-left:16px;opacity:0.7;">No cached favorites</div>'
        }
      </details>
    `;
  }

  _renderHubTree(hub) {
    const entityId = this._entityForHub(hub);
    const deviceEntries = Object.entries(hub.devices || {});
    const activityList = this._activitiesForHub(hub, entityId);

    return `
      <details>
        <summary>${this._escape(hub.name)} (${this._escape(hub.entry_id)})</summary>
        <div style="margin-left:12px;display:grid;gap:8px;">
          ${
            entityId
              ? `<div style="font-size:12px;opacity:0.7;">Remote entity: ${this._escape(entityId)}</div>`
              : ""
          }

          <details>
            <summary>Devices (${deviceEntries.length})</summary>
            ${
              deviceEntries.length
                ? deviceEntries
                    .map(
                      ([deviceId, device]) => `
                        <details style="margin-left:12px;">
                          <summary style="display:flex;align-items:center;gap:8px;">
                            <span>${this._escape(device.name || `Device ${deviceId}`)} <small>(#${deviceId})</small></span>
                            <button class="refresh-btn" data-hub-entry="${this._escape(hub.entry_id)}" data-kind="device" data-target-id="${this._escape(deviceId)}" ${this._refreshBusy ? "disabled" : ""}>${this._refreshBusy ? "Refreshing..." : "Refresh"}</button>
                          </summary>
                          ${this._renderDeviceCommands(hub, deviceId)}
                        </details>
                      `
                    )
                    .join("")
                : '<div style="padding-left:16px;opacity:0.7;">No cached devices</div>'
            }
          </details>

          <details>
            <summary>Activities (${activityList.length})</summary>
            ${
              activityList.length
                ? activityList
                    .map((activity) => {
                      const activityId = activity.id;
                      const activityName = activity.name || (entityId ? this._activityName(entityId, activityId) : null);
                      return `
                        <details style="margin-left:12px;">
                          <summary style="display:flex;align-items:center;gap:8px;">
                            <span>${this._escape(activityName || `Activity ${activityId}`)} <small>(#${activityId})</small></span>
                            <button class="refresh-btn" data-hub-entry="${this._escape(hub.entry_id)}" data-kind="activity" data-target-id="${this._escape(activityId)}" ${this._refreshBusy ? "disabled" : ""}>${this._refreshBusy ? "Refreshing..." : "Refresh"}</button>
                          </summary>
                          ${this._renderActivityChildren(hub, String(activityId))}
                        </details>
                      `;
                    })
                    .join("")
                : '<div style="padding-left:16px;opacity:0.7;">No cached activities</div>'
            }
          </details>
        </div>
      </details>
    `;
  }

  async _refreshForHub(kind, hubEntryId, targetId) {
    if (this._refreshBusy) return;

    const hub = (this._contents?.hubs || []).find((item) => item.entry_id === hubEntryId);
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

  _renderCacheTree() {
    if (!this._contents?.enabled) return "<p>Persistent cache is disabled.</p>";
    const hubs = Array.isArray(this._contents.hubs) ? this._contents.hubs : [];
    if (!hubs.length) return "<p>No hubs found.</p>";
    return hubs.map((hub) => this._renderHubTree(hub)).join("");
  }

  _render() {
    if (!this._hass || !this._root) return;
    const enabled = !!this._state?.enabled;

    this._root.innerHTML = `
      <ha-card header="Sofabaton Power Tools">
        <div style="padding:16px;display:grid;gap:12px;">
          <label style="display:flex;align-items:center;gap:8px;">
            <span>Persistent cache</span>
            <input type="checkbox" ${enabled ? "checked" : ""} id="persist-toggle" />
          </label>

          ${
            enabled
              ? `
                <div style="font-size:13px;opacity:0.8;">
                  Browse cached hub data and refresh cache entries per device or activity.
                </div>
                ${
                  this._actionMessage
                    ? `<div style="font-size:13px;color:var(--primary-text-color);">${this._escape(this._actionMessage)}</div>`
                    : ""
                }
                ${this._refreshBusy ? '<div style="font-size:13px;opacity:0.8;">Refresh in progress, please wait…</div>' : ""}
                <div>${this._renderCacheTree()}</div>
              `
              : "<p>Enable persistent cache to access power tools.</p>"
          }
        </div>
      </ha-card>
    `;

    this._root.querySelector("#persist-toggle")?.addEventListener("change", (ev) => this._togglePersistent(ev));

    this._root.querySelectorAll(".refresh-btn").forEach((button) => {
      button.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const kind = button.getAttribute("data-kind");
        const hubEntryId = button.getAttribute("data-hub-entry");
        const targetId = button.getAttribute("data-target-id");
        if (!kind || !hubEntryId || !targetId) return;
        this._refreshForHub(kind, hubEntryId, targetId);
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
