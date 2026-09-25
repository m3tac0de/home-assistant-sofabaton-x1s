// Server settings > MQTT broker: the broker an X2 publishes its Wifi Device
// presses to (the one set in the Sofabaton app), as this panel stores it
// in the server's mqtt.json. The server owns the rules (routes_mqtt.py):
// only the signed-in admin may change or test it, the password is
// write-only, and moving the destination without a new password drops
// the stored one. Settings from the command line or the environment own
// the broker; the page then shows them read-only.

import { LitElement, html, css, nothing, type TemplateResult } from "lit";

import {
  problemText,
  type AuthStatus,
  type MqttConfigBody,
  type MqttConfigView,
  type MqttState,
  type MqttTestResult,
  type PanelApi,
} from "../panel-api";
import type { PanelStream, StreamMessage } from "../panel-stream";
import { PANEL_BASE_CSS } from "../panel-styles";

export const MQTT_VIEW_TAG = "sb-panel-mqtt";

export interface Draft {
  host: string;
  port: string;
  username: string;
  password: string;
  clearPassword: boolean;
  tls: boolean;
  tls_ca: string;
  tls_insecure: boolean;
  client_id: string;
}

const DESTINATION: (keyof Draft)[] = ["host", "port", "username", "tls", "tls_ca", "tls_insecure"];

function draftFrom(config: MqttConfigView | null): Draft {
  return {
    host: config?.host ?? "",
    port: config?.port ? String(config.port) : "",
    username: config?.username ?? "",
    password: "",
    clearPassword: false,
    tls: Boolean(config?.tls),
    tls_ca: config?.tls_ca ?? "",
    tls_insecure: Boolean(config?.tls_insecure),
    client_id: config?.client_id ?? "",
  };
}

/** The request body for a draft: the password only when typed (set) or cleared (""). */
export function bodyFor(draft: Draft): MqttConfigBody | string {
  const host = draft.host.trim();
  if (!host) return "Enter the broker's address.";
  const portText = draft.port.trim();
  const port = portText ? Number(portText) : null;
  if (portText && (!/^\d+$/.test(portText) || port! < 1 || port! > 65535)) return "The port must be between 1 and 65535.";
  const body: MqttConfigBody = {
    host,
    port,
    username: draft.username.trim() || null,
    tls: draft.tls,
    tls_ca: draft.tls ? draft.tls_ca.trim() || null : null,
    tls_insecure: draft.tls && draft.tls_insecure,
    client_id: draft.client_id.trim() || null,
  };
  if (draft.password) body.password = draft.password;
  else if (draft.clearPassword) body.password = "";
  return body;
}

export class SbPanelMqtt extends LitElement {
  static properties = {
    api: { attribute: false },
    auth: { attribute: false },
    stream: { attribute: false },
    reachable: { attribute: false },
    _config: { state: true },
    _state: { state: true },
    _draft: { state: true },
    _busy: { state: true },
    _msg: { state: true },
    _test: { state: true },
    _confirmRemove: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; }
      .intro { margin-bottom: 10px; }
      .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0 14px; }
      .checks { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 14px 0 4px; }
      .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 18px; margin: 6px 0 10px; padding: 0; }
      .facts div { min-width: 0; }
      .facts dt { color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .facts dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
      .pw-note { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; font-size: 12px; color: var(--sbp-muted); }
      .warn { margin-top: 10px; padding: 8px 10px; border-radius: 8px; font-size: 12px; line-height: 1.45; border: 1px solid color-mix(in srgb, var(--sbp-warn) 50%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-warn) 9%, var(--sbp-panel)); }
      .result { margin-top: 10px; font-size: 13px; }
      .actions { margin-top: 14px; }
      details { margin-top: 10px; }
      summary { cursor: pointer; font-size: 12px; color: var(--sbp-muted); }
    `,
  ];

  api!: PanelApi;
  auth: AuthStatus | null = null;
  stream: PanelStream | null = null;
  reachable = true;
  private _config: MqttConfigView | null = null;
  private _state: MqttState | null = null;
  private _draft: Draft = draftFrom(null);
  private _busy: "" | "save" | "test" | "remove" = "";
  private _msg: { text: string; ok: boolean } | null = null;
  private _test: MqttTestResult | null = null;
  private _confirmRemove = false;
  private _offStream: (() => void) | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    void this._load(true);
    this._offStream = this.stream?.onMessage((message: StreamMessage) => {
      const kind = String(message.data.kind ?? "");
      if (message.data.type === "server_event" && (kind === "mqtt_config" || kind.startsWith("mqtt_"))) void this._load(kind === "mqtt_config" && !this._dirty());
    }) ?? null;
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._offStream?.();
    this._offStream = null;
  }

  private get _canEdit(): boolean {
    return Boolean(this._config?.editable && this.auth?.claimed && this.auth.signed_in);
  }

  private _dirty(): boolean {
    const saved = draftFrom(this._config);
    const d = this._draft;
    return Boolean(d.password) || d.clearPassword || (Object.keys(saved) as (keyof Draft)[]).some((k) => k !== "password" && k !== "clearPassword" && saved[k] !== d[k]);
  }

  /** The saved password would be dropped: the destination moved and no new one was typed. */
  private _dropsPassword(): boolean {
    if (!this._config?.password_set || this._draft.password || this._draft.clearPassword) return false;
    const saved = draftFrom(this._config);
    return DESTINATION.some((k) => String(saved[k]).trim() !== String(this._draft[k]).trim());
  }

  private async _load(resetDraft: boolean): Promise<void> {
    if (!this.api) return;
    const [config, state] = await Promise.all([this.api.mqttConfig().catch(() => null), this.api.mqttState().catch(() => null)]);
    if (config?.ok && config.body) {
      this._config = config.body;
      if (resetDraft) this._draft = draftFrom(config.body);
    }
    if (state?.ok && state.body) this._state = state.body;
  }

  private _set<K extends keyof Draft>(key: K, value: Draft[K]): void {
    this._draft = { ...this._draft, [key]: value };
    this._msg = null;
    this._test = null;
  }

  private async _save(): Promise<void> {
    const body = bodyFor(this._draft);
    if (typeof body === "string") {
      this._msg = { text: body, ok: false };
      return;
    }
    this._busy = "save";
    this._msg = null;
    try {
      const response = await this.api.updateMqttConfig(body);
      if (response.ok && response.body) {
        this._config = response.body;
        this._draft = draftFrom(response.body);
        this._msg = { text: response.body.password_dropped ? "Saved. The saved password was dropped because the destination changed." : "Saved; the server uses it now.", ok: !response.body.password_dropped };
        const state = await this.api.mqttState();
        if (state.ok && state.body) this._state = state.body;
      } else {
        this._msg = { text: problemText(response), ok: false };
      }
    } catch (err) {
      this._msg = { text: String(err), ok: false };
    } finally {
      this._busy = "";
    }
  }

  private async _runTest(): Promise<void> {
    const body = bodyFor(this._draft);
    if (typeof body === "string") {
      this._msg = { text: body, ok: false };
      return;
    }
    this._busy = "test";
    this._test = null;
    this._msg = null;
    try {
      const response = await this.api.testMqttConfig(body);
      if (response.ok && response.body) this._test = response.body;
      else this._msg = { text: problemText(response), ok: false };
    } catch (err) {
      this._msg = { text: String(err), ok: false };
    } finally {
      this._busy = "";
    }
  }

  private async _remove(): Promise<void> {
    this._busy = "remove";
    try {
      const response = await this.api.removeMqttConfig();
      this._confirmRemove = false;
      if (!response.ok) {
        this._msg = { text: problemText(response), ok: false };
        return;
      }
      this._msg = { text: "Removed. The server has no broker now.", ok: true };
      await this._load(true);
    } catch (err) {
      this._msg = { text: String(err), ok: false };
    } finally {
      this._busy = "";
    }
  }

  private _renderState(): TemplateResult {
    const s = this._state;
    const at = s?.host ? `${s.host}:${s.port}${s.tls ? " (TLS)" : ""}` : "";
    const text = !s ? "unknown" : !s.configured ? "no broker" : s.connected ? `connected to ${at}` : s.wanted ? `not connected to ${at}${s.last_error ? `: ${s.last_error}` : ""}` : `${at}, idle (no device uses MQTT)`;
    const tone = !s?.configured ? "off" : s.connected ? "ok" : s.wanted ? "err" : "off";
    return html`
      <div class="panel" id="mqtt-state">
        <h2>Connection</h2>
        <dl class="facts">
          <div><dt>state</dt><dd id="mqtt-state-text"><span class="dot ${tone}"></span> ${text}</dd></div>
          <div><dt>Wifi Devices on MQTT</dt><dd id="mqtt-devices">${this._config?.devices_using ?? 0}</dd></div>
          <div><dt>subscribed topics</dt><dd class="mono">${s?.topics.length ? s.topics.join(", ") : "none"}</dd></div>
          <div><dt>set by</dt><dd id="mqtt-source">${this._config?.source === "startup" ? "command line / environment" : this._config?.source === "panel" ? "this panel" : "nobody yet"}</dd></div>
        </dl>
        <div class="hint">The server connects only while a Wifi Device uses the mqtt transport. It must be the same broker as the one set for the hub in the Sofabaton app.</div>
      </div>
    `;
  }

  private _renderReadOnly(): TemplateResult {
    const c = this._config!;
    return html`
      <div class="panel" id="mqtt-startup">
        <h2>Broker</h2>
        <div class="hint intro">Set where the server starts (<span class="mono">--mqtt-*</span> flags or <span class="mono">SOFABATON_MQTT_*</span> environment variables), so it is read-only here. Change it there and restart the server.</div>
        <dl class="facts">
          <div><dt>host</dt><dd>${c.host ?? ""}</dd></div>
          <div><dt>port</dt><dd>${c.effective_port ?? ""}</dd></div>
          <div><dt>user name</dt><dd>${c.username ?? "none"}</dd></div>
          <div><dt>password</dt><dd>${c.password_set ? "set" : "none"}</dd></div>
          <div><dt>TLS</dt><dd>${c.tls ? (c.tls_insecure ? "on, certificate not checked" : "on") : "off"}</dd></div>
        </dl>
      </div>
    `;
  }

  private _renderForm(): TemplateResult {
    const d = this._draft;
    const c = this._config;
    const busy = this._busy !== "";
    const dirty = this._dirty();
    return html`
      <div class="panel" id="mqtt-form">
        <h2>Broker</h2>
        <div class="fields">
          <div><label for="mqtt-host">Host</label><input id="mqtt-host" type="text" autocomplete="off" spellcheck="false" placeholder="192.168.1.20 or broker.lan" .value=${d.host} @input=${(e: Event) => this._set("host", (e.target as HTMLInputElement).value)} /></div>
          <div><label for="mqtt-port">Port</label><input id="mqtt-port" type="number" min="1" max="65535" inputmode="numeric" placeholder=${d.tls ? "8883" : "1883"} .value=${d.port} @input=${(e: Event) => this._set("port", (e.target as HTMLInputElement).value)} /></div>
          <div><label for="mqtt-username">User name</label><input id="mqtt-username" type="text" autocomplete="off" spellcheck="false" .value=${d.username} @input=${(e: Event) => this._set("username", (e.target as HTMLInputElement).value)} /></div>
          <div>
            <label for="mqtt-password">Password</label>
            <input id="mqtt-password" type="password" autocomplete="new-password" placeholder=${c?.password_set && !d.clearPassword ? "saved; leave empty to keep" : ""} .value=${d.password} ?disabled=${d.clearPassword} @input=${(e: Event) => this._set("password", (e.target as HTMLInputElement).value)} />
            ${c?.password_set
              ? html`<div class="pw-note">${d.clearPassword
                  ? html`<span id="mqtt-password-clearing">The saved password is removed on Save.</span><button class="small" type="button" @click=${() => this._set("clearPassword", false)}>Keep it</button>`
                  : html`<button class="small" type="button" id="mqtt-password-clear" @click=${() => { this._draft = { ...this._draft, password: "", clearPassword: true }; }}>Remove saved password</button>`}</div>`
              : nothing}
          </div>
        </div>
        <div class="checks">
          <label class="inline" for="mqtt-tls"><input id="mqtt-tls" type="checkbox" .checked=${d.tls} @change=${(e: Event) => this._set("tls", (e.target as HTMLInputElement).checked)} /> Connect over TLS</label>
          <label class="inline" for="mqtt-insecure"><input id="mqtt-insecure" type="checkbox" .checked=${d.tls_insecure} ?disabled=${!d.tls} @change=${(e: Event) => this._set("tls_insecure", (e.target as HTMLInputElement).checked)} /> Do not check the broker's certificate</label>
        </div>
        ${d.tls
          ? html`<div class="fields"><div><label for="mqtt-ca">CA certificate file on the server (optional)</label><input id="mqtt-ca" type="text" spellcheck="false" placeholder="/data/ca.pem; empty = the system's store" .value=${d.tls_ca} @input=${(e: Event) => this._set("tls_ca", (e.target as HTMLInputElement).value)} /></div></div>`
          : nothing}
        <details ?open=${Boolean(d.client_id)}>
          <summary>Advanced</summary>
          <div class="fields"><div><label for="mqtt-client-id">Client id</label><input id="mqtt-client-id" type="text" spellcheck="false" placeholder="automatic" .value=${d.client_id} @input=${(e: Event) => this._set("client_id", (e.target as HTMLInputElement).value)} /></div></div>
        </details>
        ${this._dropsPassword()
          ? html`<div class="warn" id="mqtt-drop-warning">You changed where the password is sent. The saved password is dropped on Save unless you enter it again, so it never goes to a new place by itself.</div>`
          : nothing}
        ${d.tls && d.tls_insecure ? html`<div class="warn">Without a certificate check, anyone in the path can pose as the broker and read the password.</div>` : nothing}
        ${this._test
          ? html`<div class="result ${this._test.ok ? "msg-ok" : "msg-err"}" id="mqtt-test-result">${this._test.ok ? `Connected (${this._test.elapsed_ms} ms). Nothing was saved.` : `Could not connect: ${this._test.error}`}</div>`
          : nothing}
        <div class="actions">
          <button class="small" id="mqtt-test" type="button" ?disabled=${busy || !this.reachable} @click=${this._runTest}>${this._busy === "test" ? "testing…" : "Test connection"}</button>
          <button class="small primary" id="mqtt-save" type="button" ?disabled=${busy || !dirty || !this.reachable} @click=${this._save}>${this._busy === "save" ? "saving…" : "Save"}</button>
          ${dirty ? html`<button class="small" id="mqtt-revert" type="button" ?disabled=${busy} @click=${() => { this._draft = draftFrom(this._config); this._msg = null; this._test = null; }}>Revert</button>` : nothing}
          ${c?.source === "panel"
            ? this._confirmRemove
              ? html`<button class="small danger" id="mqtt-remove-confirm" type="button" ?disabled=${busy} @click=${this._remove}>Remove the broker${c.devices_using ? ` (${c.devices_using} Wifi Device${c.devices_using === 1 ? "" : "s"} stop receiving presses)` : ""}</button><button class="small" type="button" @click=${() => { this._confirmRemove = false; }}>Keep</button>`
              : html`<button class="small danger" id="mqtt-remove" type="button" ?disabled=${busy} @click=${() => { this._confirmRemove = true; }}>Remove broker</button>`
            : nothing}
          ${this._msg ? html`<span class="msg ${this._msg.ok ? "msg-ok" : "msg-err"}" id="mqtt-msg">${this._msg.text}</span>` : nothing}
        </div>
        <div class="hint" style="margin-top: 12px">Stored on the server in <span class="mono">mqtt.json</span> in its data directory, readable only by the server's user. The password is kept in plain text there (the server has to send it to the broker), so backups of the data directory contain it. To keep it off the disk, start the server with <span class="mono">--mqtt-password-file</span> or <span class="mono">SOFABATON_MQTT_*</span> instead; this page then shows those settings read-only.</div>
      </div>
    `;
  }

  render(): TemplateResult {
    const c = this._config;
    if (!c) return html`<div class="panel"><div class="hint">loading…</div></div>`;
    let body: TemplateResult;
    if (c.source === "startup") body = this._renderReadOnly();
    else if (this._canEdit) body = this._renderForm();
    else if (this.auth && !this.auth.claimed) {
      body = html`<div class="panel" id="mqtt-needs-access">
        <h2>Broker</h2>
        <div class="hint intro">The broker's password is a secret this server stores, so only a signed-in admin can set it. Set up access first.</div>
        <div class="actions"><button class="small primary" id="mqtt-setup-access" ?disabled=${!this.reachable} @click=${() => this.dispatchEvent(new CustomEvent("sb-auth-setup", { bubbles: true, composed: true }))}>Set up access</button></div>
      </div>`;
    } else {
      body = html`<div class="panel"><div class="hint">This server did not report its access settings, so the broker cannot be changed here.</div></div>`;
    }
    return html`${this._renderState()}${body}`;
  }
}

export function defineMqttView(): void {
  if (!customElements.get(MQTT_VIEW_TAG)) customElements.define(MQTT_VIEW_TAG, SbPanelMqtt);
}
