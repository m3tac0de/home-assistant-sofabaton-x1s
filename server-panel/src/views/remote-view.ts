// The Remote view (docs/internal/server-panel-plan.md, decision 5): the
// remote card mounted directly over a ServerRemoteBackend for the
// selected hub, next to the editor for the hub's layout document. A saved
// document is applied to the mounted card at once; the web remote page in
// its own tab picks it up on its next load.

import { LitElement, html, css, type PropertyValues, type TemplateResult } from "lit";

import { ServerRemoteBackend } from "../../../remote-card/src/backend/server-backend";
import type { SofabatonRemoteCard } from "../../../remote-card/src/remote-card-element";
import { CARD_VERSION, TYPE } from "../../../remote-card/src/remote-card-shared";
import { cardConfigForWebRemote } from "../../../remote-card/src/remote-web-config";
import { problemText, type HubView, type PanelApi } from "../panel-api";
import type { HubContext } from "../panel-context";
import { formatWhen, hubDisplayName } from "../panel-state";
import { PANEL_BASE_CSS } from "../panel-styles";

export const REMOTE_VIEW_TAG = "sb-panel-remote";

export class SbPanelRemote extends LitElement {
  static properties = {
    api: { attribute: false },
    ctx: { attribute: false },
    hub: { attribute: false },
    section: { attribute: false },
    _status: { state: true },
    _statusOk: { state: true },
    _banner: { state: true },
    _documentText: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; height: 100%; }
      .frame { max-width: 420px; margin: 0 auto; }
      .frame { background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: var(--sbp-radius); overflow: hidden; }
      .bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--sbp-line); font-size: 12px; color: var(--sbp-muted); white-space: nowrap; }
      .bar .title { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .stage { padding: 10px; }
      .banner { margin: 10px 10px 0; padding: 8px 12px; border-radius: 8px; background: rgba(var(--rgb-error-color, 219, 68, 55), 0.12); color: var(--sbp-err); font-size: 13px; }
      .foot { padding: 6px 10px 8px; color: var(--sbp-muted); font-size: 11px; text-align: center; }
      textarea { min-height: 260px; margin-top: 10px; }
    `,
  ];

  api!: PanelApi;
  ctx: HubContext | null = null;
  hub: HubView | null = null;
  /** The Remote tab's subtab: the mounted card, or the layout document. */
  section: "card" | "layout" = "card";
  private _status = "";
  private _statusOk = true;
  private _banner: string | null = null;
  private _documentText = "";
  private _backend: ServerRemoteBackend | null = null;
  private _card: SofabatonRemoteCard | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _mountedFor: string | null = null;
  private _document: Record<string, unknown> | null = null;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unmount();
  }

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("hub")) {
      const id = this.hub?.hub_id ?? null;
      if (id !== this._mountedFor) {
        this._unmount();
        if (id) void this._mount(id);
      }
    }
    // The stage div is re-rendered with the view; keep the card in it.
    const stage = this.renderRoot.querySelector<HTMLElement>("#stage");
    if (stage && this._card && this._card.parentElement !== stage) stage.appendChild(this._card);
  }

  private _unmount(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._card?.setBackend(null);
    this._card?.remove();
    this._card = null;
    this._backend?.stop();
    this._backend = null;
    this._mountedFor = null;
    this._banner = null;
    this._document = null;
    this._documentText = "";
    this._setStatus("");
  }

  private async _mount(hubId: string): Promise<void> {
    this._mountedFor = hubId;
    const response = await this.api.remoteCardDocument(hubId);
    if (this._mountedFor !== hubId) return; // the selection moved on while loading
    if (response.ok && response.body) {
      this._document = response.body.document;
      this._documentText = this._document ? JSON.stringify(this._document, null, 2) : "";
      this._setStatus(this._document ? `stored document (updated ${formatWhen(response.body.updated_at)})` : "no document stored: the card uses its defaults");
    } else {
      this._document = null;
      this._documentText = "";
      this._setStatus(problemText(response), false);
    }
    const backend = new ServerRemoteBackend({ baseUrl: this.api.baseUrl });
    backend.setTarget(hubId);
    this._backend = backend;
    const card = document.createElement(TYPE) as SofabatonRemoteCard;
    card.setConfig(cardConfigForWebRemote(hubId, this._document));
    card.setLanguage(navigator.language);
    card.setBackend(backend);
    this._card = card;
    this._unsubscribe = backend.subscribe(() => this._syncBanner());
    this._syncBanner();
    this.requestUpdate();
  }

  private _syncBanner(): void {
    const backend = this._backend;
    if (!backend) return;
    const snapshot = backend.snapshot();
    const unavailable = !snapshot || snapshot.state === "unavailable";
    this._banner = unavailable
      ? backend.lastError
        ? `The server cannot reach the hub (${backend.lastError}).`
        : "The hub is not controllable right now (offline, disabled, or the Sofabaton app is connected)."
      : null;
  }

  private _setStatus(text: string, ok = true): void {
    this._status = text;
    this._statusOk = ok;
  }

  private _readDocument(): Record<string, unknown> | null {
    const text = this._textarea()?.value.trim() ?? "";
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch (err) {
      this._setStatus(`not valid JSON: ${(err as Error).message}`, false);
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this._setStatus("the document must be a JSON object", false);
      return null;
    }
    return parsed as Record<string, unknown>;
  }

  private _textarea(): HTMLTextAreaElement | null {
    return this.renderRoot.querySelector<HTMLTextAreaElement>("#remote-doc");
  }

  private _apply(document: Record<string, unknown> | null): void {
    this._document = document;
    this._documentText = document ? JSON.stringify(document, null, 2) : "";
    const textarea = this._textarea();
    if (textarea) textarea.value = this._documentText;
    if (this._card && this._mountedFor) this._card.setConfig(cardConfigForWebRemote(this._mountedFor, document));
  }

  private async _save(): Promise<void> {
    const hubId = this._mountedFor;
    if (!hubId) return;
    const document = this._readDocument();
    if (!document) return;
    try {
      const response = await this.api.putRemoteCardDocument(hubId, document);
      if (!response.ok || !response.body) {
        this._setStatus(problemText(response), false);
        return;
      }
      this._apply(response.body.document);
      this._setStatus(`saved (updated ${formatWhen(response.body.updated_at)}); applied to the remote`);
    } catch (err) {
      this._setStatus(String(err), false);
    }
  }

  private async _reload(): Promise<void> {
    const hubId = this._mountedFor;
    if (!hubId) return;
    try {
      const response = await this.api.remoteCardDocument(hubId);
      if (!response.ok || !response.body) {
        this._setStatus(problemText(response), false);
        return;
      }
      this._apply(response.body.document);
      this._setStatus(response.body.document ? `stored document (updated ${formatWhen(response.body.updated_at)})` : "no document stored: the card uses its defaults");
    } catch (err) {
      this._setStatus(String(err), false);
    }
  }

  private async _reset(): Promise<void> {
    const hubId = this._mountedFor;
    if (!hubId) return;
    try {
      const response = await this.api.deleteRemoteCardDocument(hubId);
      if (response.status !== 204) {
        this._setStatus(problemText(response), false);
        return;
      }
      this._apply(null);
      this._setStatus("reset: the card uses its defaults");
    } catch (err) {
      this._setStatus(String(err), false);
    }
  }

  render(): TemplateResult {
    const hub = this.hub;
    return this.section === "layout" ? this._renderLayout(hub) : this._renderCard(hub);
  }

  private _renderCard(hub: HubView | null): TemplateResult {
    return html`
        <div class="frame">
          <div class="bar">
            <span class="title" id="remote-title" title=${hub ? `web remote for ${hub.hub_id}` : ""}>${hub ? hubDisplayName(hub) : "no hub selected"}</span>
            <span class="spacer"></span>
            <a class="hint" id="remote-link" href=${this.api.remoteUrl(hub?.hub_id ?? null)} target="_blank" rel="noopener" title="open the remote in its own tab">open ↗</a>
          </div>
          ${this._banner ? html`<div class="banner" id="remote-banner">${this._banner}</div>` : ""}
          <div class="stage" id="stage">${hub ? "" : html`<div class="hint">Pick a hub above.</div>`}</div>
          ${hub ? html`<div class="foot">${hubDisplayName(hub)} · remote card ${CARD_VERSION}</div>` : ""}
        </div>
    `;
  }

  private _renderLayout(hub: HubView | null): TemplateResult {
    return html`
        <div class="panel">
          <h2>Layout <span class="spacer"></span><span class="hint mono">PUT /hubs/{hub_id}/ui/remote-card</span></h2>
          <div class="hint">The card configuration for this hub, stored on the server and shared by every phone, tablet and wall panel that opens the remote: the Home Assistant card's YAML as JSON, minus <code>entity</code>, <code>theme</code> and Home Assistant actions. An empty object resets to the card's defaults. Saving applies it to the remote on the left.</div>
          <textarea id="remote-doc" .value=${this._documentText} ?disabled=${!hub} placeholder='{ "show_dpad": true, "group_order": ["activity", "dpad", "nav"] }'></textarea>
          <div class="actions" style="margin-top: 10px">
            <button class="primary" id="remote-save" ?disabled=${!hub} @click=${this._save}>Save</button>
            <button id="remote-load" ?disabled=${!hub} @click=${this._reload}>Reload document</button>
            <button class="danger" id="remote-delete" ?disabled=${!hub} @click=${this._reset}>Reset to defaults</button>
            <span class="msg ${this._statusOk ? "msg-ok" : "msg-err"}" id="remote-status">${this._status}</span>
          </div>
        </div>
    `;
  }
}

export function defineRemoteView(): void {
  if (!customElements.get(REMOTE_VIEW_TAG)) customElements.define(REMOTE_VIEW_TAG, SbPanelRemote);
}
