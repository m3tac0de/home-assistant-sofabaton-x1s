// The Server page (docs/internal/server-panel-state-plan.md, decision
// 10): what the first panel's header said (versions, instance, the
// callback listener) with the listener's retry, the stream state and
// the hub count. Under the cog menu; no hub is needed.

import { LitElement, html, css, type TemplateResult } from "lit";

import { problemText, type CallbackListener, type PanelApi, type ServerInfo } from "../panel-api";
import { PANEL_BASE_CSS } from "../panel-styles";

export const SERVER_VIEW_TAG = "sb-panel-server";

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
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; }
      .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 18px; margin: 6px 0 14px; padding: 0; }
      .facts div { min-width: 0; }
      .facts dt { color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .facts dd { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
    const facts: [string, string][] = [
      ["server", this.error ?? (info ? info.version : "connecting…")],
      ["library", info?.library_version ?? "?"],
      ["api", info?.api_version ?? "?"],
      ["instance", info?.instance_id ?? "?"],
      ["hubs", String(this.hubCount)],
      ["event stream", this.streamOn ? "live" : "off"],
      ["callback listener", listenerText],
    ];
    return html`
      <div class="panel" id="server-detail">
        <h2>Server <span class="spacer"></span><span class="hint mono" id="server-meta">${info ? `server ${info.version} · library ${info.library_version} · api ${info.api_version}` : this.error ?? ""}</span></h2>
        <dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        <div class="actions">
          <button class="small" id="listener-retry" ?disabled=${this._retrying || !this.reachable} @click=${this._retry} title="POST /server/callback-listener/retry">${this._retrying ? "retrying…" : "Retry callback listener"}</button>
          <span class="msg" id="server-status">${this._status}</span>
        </div>
        <div class="hint" style="margin-top: 10px">The callback listener is the port the hubs deliver button presses to (the Wifi Events device); it comes up when a hub has a callback device deployed. The event stream is this page's live feed from the server.</div>
      </div>
    `;
  }
}

export function defineServerView(): void {
  if (!customElements.get(SERVER_VIEW_TAG)) customElements.define(SERVER_VIEW_TAG, SbPanelServer);
}
