const TOOLS_TYPE = "sofabaton-power-tools";

class SofabatonPowerToolsCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._root) {
      this._root = this.attachShadow({ mode: "open" });
      this._loadState();
    }
    this._render();
  }

  getCardSize() {
    return 5;
  }

  async _ws(msg) {
    return this._hass.callWS(msg);
  }

  async _loadState() {
    this._state = await this._ws({ type: "sofabaton_x1s/persistent_cache/get" });
    this._contents = await this._ws({ type: "sofabaton_x1s/persistent_cache/contents" });
    this._render();
  }

  _remoteEntities() {
    return Object.keys(this._hass?.states || {}).filter((entityId) => entityId.startsWith("remote.sofabaton_"));
  }

  async _togglePersistent(ev) {
    const enabled = !!ev.target.checked;
    await this._ws({ type: "sofabaton_x1s/persistent_cache/set", enabled });
    await this._loadState();
  }

  async _refresh(kind) {
    if (!this._selectedEntity || !this._selectedId) return;
    await this._ws({
      type: "sofabaton_x1s/persistent_cache/refresh",
      entity_id: this._selectedEntity,
      kind,
      target_id: Number(this._selectedId),
    });
    await this._loadState();
  }

  _renderCacheTree() {
    if (!this._contents?.enabled) return "<p>Persistent cache is disabled.</p>";
    const hubs = Array.isArray(this._contents.hubs) ? this._contents.hubs : [];
    return hubs
      .map((hub) => {
        const devices = Object.keys(hub.devices || {}).length;
        const commands = Object.keys(hub.commands || {}).length;
        const macros = Object.keys(hub.activity_macros || {}).length;
        return `<details><summary>${hub.name} (${hub.entry_id})</summary>
          <div>Devices: ${devices}</div>
          <div>Command entities: ${commands}</div>
          <div>Activity macros: ${macros}</div>
        </details>`;
      })
      .join("");
  }

  _render() {
    if (!this._hass || !this._root) return;
    const enabled = !!this._state?.enabled;
    const entities = this._remoteEntities();

    this._root.innerHTML = `
      <ha-card header="Sofabaton Power Tools">
        <div style="padding:16px;display:grid;gap:12px;">
          <label style="display:flex;align-items:center;gap:8px;">
            <span>Persistent cache</span>
            <input type="checkbox" ${enabled ? "checked" : ""} id="persist-toggle" />
          </label>

          ${enabled ? `
            <label>Remote entity
              <select id="entity-select" style="width:100%;margin-top:4px;">
                <option value="">Select entity...</option>
                ${entities.map((e) => `<option value="${e}" ${this._selectedEntity === e ? "selected" : ""}>${e}</option>`).join("")}
              </select>
            </label>
            <label>Target ID (Activity or Device)
              <input id="target-id" type="number" min="1" max="255" value="${this._selectedId || ""}" style="width:100%;margin-top:4px;" />
            </label>
            <div style="display:flex;gap:8px;">
              <button id="refresh-activity">Refresh Activity cache</button>
              <button id="refresh-device">Refresh Device cache</button>
            </div>
            <div>${this._renderCacheTree()}</div>
          ` : "<p>Enable persistent cache to access power tools.</p>"}
        </div>
      </ha-card>
    `;

    this._root.querySelector("#persist-toggle")?.addEventListener("change", (ev) => this._togglePersistent(ev));
    this._root.querySelector("#entity-select")?.addEventListener("change", (ev) => {
      this._selectedEntity = ev.target.value;
    });
    this._root.querySelector("#target-id")?.addEventListener("input", (ev) => {
      this._selectedId = ev.target.value;
    });
    this._root.querySelector("#refresh-activity")?.addEventListener("click", () => this._refresh("activity"));
    this._root.querySelector("#refresh-device")?.addEventListener("click", () => this._refresh("device"));
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
