// The Server page (docs/internal/server-panel-state-plan.md, decision
// 10): what the first panel's header said (versions, instance, the
// callback listener) with the listener's retry, the stream state and
// the hub count, plus the three host-side ports (the Home Assistant
// integration's port step, same wording), and the PyPI update check
// (manual by default, a daily automatic check on request; notification
// only). Under the cog menu; no hub is needed.

import { LitElement, html, css, type TemplateResult } from "lit";

import {
  problemText,
  type CallbackListener,
  type PanelApi,
  type ServerInfo,
  type ServerPortName,
  type ServerSettings,
  type UpdateStatus,
} from "../panel-api";
import { PANEL_BASE_CSS } from "../panel-styles";

export const SERVER_VIEW_TAG = "sb-panel-server";

// Labels and descriptions from the integration's config flow
// (custom_components/sofabaton_x1s/translations/en.json, step "ports"),
// in the order that form shows them.
const PORT_FIELDS: { name: ServerPortName; label: string; description: string }[] = [
  {
    name: "app_discovery_port",
    label: "App UDP listener port",
    description: "UDP port used for official app discovery and connections. Keep port 8102 for iOS compatibility unless another service already uses it.",
  },
  {
    name: "hub_listen_port",
    label: "Hub TCP listener port",
    description: "TCP port used by physical hubs to connect to the integration.",
  },
  {
    name: "callback_port",
    label: "Wi-Fi command HTTP listener port",
    description: "HTTP port used to receive Wi-Fi device button presses. Changing it breaks X1 compatibility and requires existing Wi-Fi devices and commands to be synchronized again.",
  },
];

const PORT_PATTERN = /^\d+$/;

/** A server timestamp as the browser shows it; the raw text when it does not parse. */
function localTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}

export class SbPanelServer extends LitElement {
  static properties = {
    api: { attribute: false },
    info: { attribute: false },
    error: { attribute: false },
    reachable: { attribute: false },
    streamOn: { attribute: false },
    hubCount: { attribute: false },
    _listener: { state: true },
    _status: { state: true },
    _retrying: { state: true },
    _ports: { state: true },
    _portDraft: { state: true },
    _portStatus: { state: true },
    _portError: { state: true },
    _saving: { state: true },
    _update: { state: true },
    _checking: { state: true },
    _updateSaving: { state: true },
    _updateMsg: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; }
      .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 18px; margin: 6px 0 14px; padding: 0; }
      .facts div { min-width: 0; }
      .facts dt { color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .facts dd { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .port { margin-bottom: 12px; }
      .port input { max-width: 160px; }
      .port .hint { margin-top: 4px; }
      .port .note { color: var(--sbp-muted); font-size: 12px; margin-left: 8px; }
      .updates dl { margin: 0 0 10px; }
      .update-line { margin: 8px 0; font-size: 13px; }
      .update-line.available { color: var(--sbp-accent); font-weight: 600; }
      .update-line.failed { color: var(--sbp-err); }
      .update-links { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 13px; margin: 4px 0 8px; }
      .update-links a { color: var(--sbp-accent); }
      .auto { display: flex; align-items: center; gap: 8px; margin: 10px 0 4px; font-size: 13px; }
      .auto input { width: auto; margin: 0; }
    `,
  ];

  api!: PanelApi;
  info: ServerInfo | null = null;
  error: string | null = null;
  reachable = true;
  streamOn = false;
  hubCount = 0;
  private _listener: CallbackListener | null = null;
  private _status = "";
  private _retrying = false;
  private _ports: ServerSettings | null = null;
  private _portDraft: Partial<Record<ServerPortName, string>> = {};
  private _portStatus = "";
  private _portError = false;
  private _saving = false;
  private _update: UpdateStatus | null = null;
  private _checking = false;
  private _updateSaving = false;
  private _updateMsg = "";

  connectedCallback(): void {
    super.connectedCallback();
    void this._loadPorts();
  }

  willUpdate(changed: Map<PropertyKey, unknown>): void {
    // The store's copy (GET /server, re-read when a check finishes) wins
    // when it is newer than what this page's own calls answered.
    if (changed.has("info")) {
      const fromStore = this.info?.update ?? null;
      const mine = this._update;
      if (fromStore && (!mine || (fromStore.checked_at ?? "") > (mine.checked_at ?? ""))) this._update = fromStore;
    }
  }

  private async _loadPorts(): Promise<void> {
    if (!this.api) return;
    try {
      const response = await this.api.serverSettings();
      if (response.ok && response.body) {
        this._ports = response.body;
        this._portDraft = {};
      } else {
        this._setPortStatus(problemText(response), true);
      }
    } catch (err) {
      this._setPortStatus(String(err), true);
    }
  }

  private _setPortStatus(text: string, error: boolean): void {
    this._portStatus = text;
    this._portError = error;
  }

  private _portValue(name: ServerPortName): string {
    return this._portDraft[name] ?? String(this._ports?.[name].configured ?? "");
  }

  /** The edited ports that differ from what is saved; null when one is not a port number. */
  private _portChanges(): Partial<Record<ServerPortName, number>> | null {
    const ports = this._ports;
    if (!ports) return {};
    const changes: Partial<Record<ServerPortName, number>> = {};
    for (const { name } of PORT_FIELDS) {
      const raw = this._portDraft[name]?.trim();
      if (raw === undefined) continue;
      const value = Number(raw);
      if (!PORT_PATTERN.test(raw) || value < 1 || value > 65535) return null;
      if (value !== ports[name].configured) changes[name] = value;
    }
    return changes;
  }

  private _onPortInput(name: ServerPortName, event: Event): void {
    this._portDraft = { ...this._portDraft, [name]: (event.target as HTMLInputElement).value };
    this._setPortStatus("", false);
  }

  private _revertPorts(): void {
    this._portDraft = {};
    this._setPortStatus("", false);
  }

  private async _savePorts(): Promise<void> {
    const changes = this._portChanges();
    if (this._saving || !changes || !Object.keys(changes).length) return;
    this._saving = true;
    try {
      const response = await this.api.updateServerSettings(changes);
      if (response.ok && response.body) {
        this._ports = response.body;
        this._portDraft = {};
        this._setPortStatus(response.body.restart_required ? "Saved. Restart the server to apply." : "Saved.", false);
      } else {
        this._setPortStatus(problemText(response), true);
      }
    } catch (err) {
      this._setPortStatus(String(err), true);
    } finally {
      this._saving = false;
    }
  }

  private _renderPorts(): TemplateResult {
    const ports = this._ports;
    const changes = this._portChanges();
    const invalid = changes === null;
    const dirty = invalid || Object.keys(changes).length > 0;
    const pending = ports ? PORT_FIELDS.some(({ name }) => ports[name].running !== ports[name].configured) : false;
    return html`
      <div class="panel" id="server-ports">
        <h2>Ports</h2>
        <div class="hint" style="margin-bottom: 4px">These ports are shared by all Sofabaton hubs configured in this server. Most users can keep the defaults.</div>
        ${PORT_FIELDS.map(({ name, label, description }) => {
          const setting = ports?.[name];
          const inputId = `port-${name.replace(/_/g, "-")}`;
          return html`
            <div class="port">
              <label for=${inputId}>${label}</label>
              <input
                id=${inputId}
                type="number"
                min="1"
                max="65535"
                inputmode="numeric"
                .value=${this._portValue(name)}
                ?disabled=${!setting || setting.pinned || this._saving || !this.reachable}
                @input=${(event: Event) => this._onPortInput(name, event)}
              />
              ${setting?.pinned ? html`<span class="note">set by an environment variable or command-line flag</span>` : ""}
              ${setting && setting.running !== setting.configured ? html`<span class="note">running on ${setting.running}</span>` : ""}
              <div class="hint">${description}</div>
            </div>
          `;
        })}
        <div class="actions">
          <button class="small primary" id="ports-save" ?disabled=${!dirty || invalid || this._saving || !this.reachable} @click=${this._savePorts}>${this._saving ? "saving…" : "Save"}</button>
          ${dirty ? html`<button class="small" id="ports-revert" ?disabled=${this._saving} @click=${this._revertPorts}>Revert</button>` : ""}
          <span class="msg ${this._portError || invalid ? "msg-err" : "msg-ok"}" id="ports-status">${invalid ? "Enter a port between 1 and 65535." : this._portStatus}</span>
        </div>
        ${pending && !this._portStatus ? html`<div class="hint" style="margin-top: 8px">Saved changes apply after the server restarts.</div>` : ""}
      </div>
    `;
  }

  // -- updates -----------------------------------------------------------------------------

  private async _checkForUpdates(): Promise<void> {
    if (this._checking) return;
    this._checking = true;
    this._updateMsg = "";
    try {
      const response = await this.api.checkForUpdates();
      if (response.ok && response.body) this._update = response.body;
      else this._updateMsg = problemText(response);
    } catch (err) {
      this._updateMsg = String(err);
    } finally {
      this._checking = false;
    }
  }

  private async _setAutomatic(event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const wanted = box.checked;
    if (this._updateSaving) return;
    this._updateSaving = true;
    this._updateMsg = "";
    try {
      const response = await this.api.configureUpdateCheck(wanted);
      if (response.ok && response.body) this._update = response.body;
      else {
        box.checked = !wanted;
        this._updateMsg = problemText(response);
      }
    } catch (err) {
      box.checked = !wanted;
      this._updateMsg = String(err);
    } finally {
      this._updateSaving = false;
    }
  }

  private _renderUpdates(): TemplateResult {
    const u = this._update;
    const installed = u?.installed_version ?? this.info?.version ?? "?";
    const checked = u?.checked_at ? `${localTime(u.checked_at)}${u.checked_by === "automatic" ? " (automatic)" : ""}` : "Never";
    let line: TemplateResult | string = "";
    let cls = "";
    switch (u?.status) {
      case "update_available":
        cls = "available";
        line = `Update available: ${u.latest_version}`;
        break;
      case "up_to_date":
        line = `No newer release found as of ${localTime(u.checked_at)}.`;
        break;
      case "failed":
        cls = "failed";
        line = `Couldn't check${u.error ? `: ${u.error}` : ""}.`;
        break;
      default:
        line = "Not checked.";
    }
    const links = u?.status === "update_available"
      ? html`<div class="update-links" id="update-links">
          <a href=${u.release_notes_url} target="_blank" rel="noopener">Release notes</a>
          <a href=${u.upgrade_url} target="_blank" rel="noopener">Update instructions</a>
          <a href=${u.pypi_url} target="_blank" rel="noopener">PyPI</a>
        </div>`
      : "";
    const busy = this._checking || u?.checking === true;
    return html`
      <div class="panel updates" id="server-updates">
        <h2>Updates</h2>
        <dl class="facts">
          <div><dt>installed version</dt><dd id="update-installed">${installed}</dd></div>
          <div><dt>last checked</dt><dd id="update-checked">${checked}</dd></div>
          ${u?.next_check_at ? html`<div><dt>next check</dt><dd id="update-next">${localTime(u.next_check_at)}</dd></div>` : ""}
        </dl>
        <div class="update-line ${cls}" id="update-status" data-status=${u?.status ?? "not_checked"}>${line}</div>
        ${links}
        <div class="actions">
          <button class="small" id="update-check" ?disabled=${busy || !this.reachable} @click=${this._checkForUpdates} title="POST /server/updates/check">${busy ? "checking…" : "Check for updates"}</button>
          <span class="msg msg-err" id="update-msg">${this._updateMsg}</span>
        </div>
        <label class="auto" for="update-auto">
          <input id="update-auto" type="checkbox" .checked=${u?.automatic === true} ?disabled=${!u || u.automatic_pinned || this._updateSaving || !this.reachable} @change=${this._setAutomatic} />
          <span>Automatically check once a day</span>
          ${u?.automatic_pinned ? html`<span class="note">set by an environment variable</span>` : ""}
        </label>
        <div class="hint">Checks contact PyPI for public release information. No hub information, configuration, installed version or installation identifier is sent. Checking never downloads or installs anything.</div>
      </div>
    `;
  }

  private _emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private async _retry(): Promise<void> {
    if (this._retrying) return;
    this._retrying = true;
    try {
      const response = await this.api.retryCallbackListener();
      if (response.ok && response.body) {
        this._listener = response.body;
        this._status = response.body.bound ? `listener bound on :${response.body.bound_port}` : "listener still not bound";
      } else {
        this._status = problemText(response);
      }
    } catch (err) {
      this._status = String(err);
    } finally {
      this._retrying = false;
    }
    this._emit("sb-hubs-changed");
  }

  render(): TemplateResult {
    const info = this.info;
    const listener = this._listener ?? info?.callback_listener ?? null;
    const listenerText = !listener ? "unknown" : listener.bound ? `bound on :${listener.bound_port}` : listener.wanted ? "wanted, not bound" : "idle (no callback devices)";
    // Set on the server's command line or in its environment only; the panel shows it, never edits it.
    const mqtt = (info?.mqtt ?? null) as { configured?: boolean; connected?: boolean; wanted?: boolean; host?: string | null; port?: number | null; tls?: boolean; last_error?: string | null } | null;
    const mqttAt = mqtt ? `${mqtt.host}:${mqtt.port}${mqtt.tls ? " (TLS)" : ""}` : "";
    const mqttText = !mqtt ? "unknown" : !mqtt.configured ? "not configured (see MQTT broker)" : mqtt.connected ? `connected to ${mqttAt}` : mqtt.wanted ? `not connected to ${mqttAt}${mqtt.last_error ? `: ${mqtt.last_error}` : ""}` : `${mqttAt}, idle (no mqtt devices)`;
    const facts: [string, string][] = [
      ["server", this.error ?? (info ? info.version : "connecting…")],
      ["library", info?.library_version ?? "?"],
      ["api", info?.api_version ?? "?"],
      ["instance", info?.instance_id ?? "?"],
      ["hubs", String(this.hubCount)],
      ["event stream", this.streamOn ? "live" : "off"],
      ["callback listener", listenerText],
      ["mqtt broker", mqttText],
    ];
    return html`
      <div class="panel" id="server-detail">
        <h2>Server <span class="spacer"></span><span class="hint mono" id="server-meta">${info ? `server ${info.version} · library ${info.library_version} · api ${info.api_version}` : this.error ?? ""}</span></h2>
        <dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        <div class="actions">
          <button class="small" id="listener-retry" ?disabled=${this._retrying || !this.reachable} @click=${this._retry} title="POST /server/callback-listener/retry">${this._retrying ? "retrying…" : "Retry callback listener"}</button>
          <span class="msg" id="server-status">${this._status}</span>
        </div>
        <div class="hint" style="margin-top: 10px">The callback listener is the port the hubs deliver button presses to (the Wifi Events device); it comes up when a hub has a callback device deployed. The MQTT broker is where an X2's Wifi Devices on the mqtt transport publish their presses; it is set on the MQTT broker page (or with <span class="mono">--mqtt-*</span> / <span class="mono">SOFABATON_MQTT_*</span> when the server starts) and connected only while a device uses it. The event stream is this page's live feed from the server.</div>
      </div>
      ${this._renderUpdates()}
      ${this._renderPorts()}
    `;
  }
}

export function defineServerView(): void {
  if (!customElements.get(SERVER_VIEW_TAG)) customElements.define(SERVER_VIEW_TAG, SbPanelServer);
}
