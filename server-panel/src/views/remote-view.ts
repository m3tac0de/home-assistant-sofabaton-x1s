// The Remote view (docs/internal/server-panel-plan.md, decision 5): the
// remote card mounted directly over a ServerRemoteBackend for the
// selected hub. The layout subtab edits a local draft with visual/JSON
// controls and an inert card preview. Only Save publishes the document;
// the standalone web remote picks it up on its next load.

import { LitElement, html, css, type PropertyValues, type TemplateResult } from "lit";

import { ServerRemoteBackend } from "../../../remote-card/src/backend/server-backend";
import type { SofabatonRemoteCard } from "../../../remote-card/src/remote-card-element";
import { CARD_VERSION, TYPE } from "../../../remote-card/src/remote-card-shared";
import type { RemoteSnapshot } from "../../../remote-card/src/backend/remote-backend";
import { deviceModeEnabledInConfig, isDeviceLayoutKey } from "../../../remote-card/src/remote-card-layout";
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
    _mode: { state: true }, _busy: { state: true }, _loaded: { state: true }, _draft: { state: true }, _snapshot: { state: true },
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
      textarea { min-height: 380px; margin-top: 10px; }
      .layout-content { min-width: 0; }
      .layout-content h2 { margin: 0 0 10px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
      .layout-content h2 .hint { font-weight: 400; }
      .layout-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(270px, 380px); gap: 20px; align-items: start; }
      .preview { position: sticky; top: calc(var(--top-dock-height, 0px) + 12px); min-width: 0; }
      .preview h3 { margin-top: 0; }
      .preview .frame { max-width: none; }
      .preview .stage { overflow: auto; }
      .editor { min-width: 0; }
      .mode-tabs { display: flex; gap: 6px; margin: 14px 0 0; }
      .mode-tabs button[aria-pressed=true] { color: var(--sbp-accent); border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), .08); }
      fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
      .actions { flex-wrap: wrap; }
      .layout-actions { position: sticky; bottom: var(--bottom-dock-height, 56px); z-index: 20; margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--sbp-line); background: var(--dock-surface, var(--sbp-panel)); box-shadow: 0 -3px 8px #00000008; }
      .layout-actions .msg { margin: 8px 0 0; font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; max-height: 15dvh; overflow-y: auto; }
      @media (max-width: 900px) { .layout-grid { grid-template-columns: minmax(0, 1fr); } .preview { position: static; } .preview .frame { max-width: 420px; } }

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
  private _mode: "visual" | "json" = "visual";
  private _busy = false;
  private _loaded = false;
  private _draft: Record<string, unknown> = {};
  private _snapshot: RemoteSnapshot | undefined;
  private _selection = "default";
  private _generation = 0;
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
    if (changed.has("section")) this._updateCard();
    // The stage div is re-rendered with the view; keep the card in it.
    const stage = this.renderRoot.querySelector<HTMLElement>("#stage");
    if (stage && this._card && this._card.parentElement !== stage) stage.appendChild(this._card);
  }

  private _unmount(): void {
    this._generation++;
    this._loaded = false;
    this._busy = false;
    this._draft = {};
    this._snapshot = undefined;
    this._selection = "default";
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
    this._busy = true;
    this._setStatus("Loading configuration…");
    const generation = this._generation;
    let response;
    try { response = await this.api.remoteCardDocument(hubId); }
    catch (error) { if (generation === this._generation) this._setStatus(String(error), false); }
    if (generation !== this._generation) return; // the selection moved on while loading
    if (response?.ok && response.body) {
      this._loaded = true;
      this._draft = response.body.document || {};
      this._document = response.body.document;
      this._documentText = this._document ? JSON.stringify(this._document, null, 2) : "";
      this._setStatus(this._document ? `stored document (updated ${formatWhen(response.body.updated_at)})` : "no document stored: the card uses its defaults");
    } else {
      this._document = null;
      this._documentText = "";
      if (response) this._setStatus(problemText(response), false);
    }
    const backend = new ServerRemoteBackend({ baseUrl: this.api.baseUrl });
    backend.setTarget(hubId);
    this._backend = backend;
    const card = document.createElement(TYPE) as SofabatonRemoteCard;
    card.setConfig(cardConfigForWebRemote(hubId, this._document));
    card.setLanguage(navigator.language);
    card.setBackend(backend);
    this._card = card;
    this._updateCard();
    this._unsubscribe = backend.subscribe(() => this._syncBanner());
    this._syncBanner();
    this._busy = false;
    this.requestUpdate();
  }

  private _syncBanner(): void {
    const backend = this._backend;
    if (!backend) return;
    const snapshot = backend.snapshot();
    this._snapshot = snapshot;
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
    const text = this._documentText.trim();
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
    this._draft = document || {};
    this._loaded = true;
    this._documentText = document ? JSON.stringify(document, null, 2) : "";
    const textarea = this._textarea();
    if (textarea) textarea.value = this._documentText;
    this._updateCard();
  }

  private _updateCard(): void {
    if (!this._card || !this._mountedFor) return;
    const editing = this.section === "layout";
    if (!deviceModeEnabledInConfig(this._draft) && isDeviceLayoutKey(this._selection)) this._selection = "default";
    const config = cardConfigForWebRemote(this._mountedFor, editing ? this._draft : this._document);
    this._card.editMode = editing;
    config.preview_activity = editing && this._selection !== "default" ? this._selection : "";
    this._card.setConfig(config);
  }

  private _edit(document: Record<string, unknown>): void {
    this._draft = document;
    this._documentText = JSON.stringify(document, null, 2);
    this._setStatus("Unsaved changes — preview updated. Save to share this configuration.");
    this._updateCard();
  }

  private _switchMode(mode: "visual" | "json"): void {
    if (mode === this._mode) return;
    if (mode === "visual") {
      const parsed = this._readDocument();
      if (!parsed) return;
      this._draft = parsed;
      this._updateCard();
    }
    this._mode = mode;
  }

  private async _save(): Promise<void> {
    const hubId = this._mountedFor;
    if (!hubId || this._busy || !this._loaded) return;
    const generation = this._generation;
    const document = this._mode === "json" ? this._readDocument() : this._draft;
    if (!document) return;
    this._busy = true;
    try {
      const response = await this.api.putRemoteCardDocument(hubId, document);
      if (generation !== this._generation) return;
      if (!response.ok || !response.body) {
        this._setStatus(problemText(response), false);
        return;
      }
      this._apply(response.body.document);
      this._setStatus(`saved (updated ${formatWhen(response.body.updated_at)}); applied to the remote`);
    } catch (err) {
      if (generation === this._generation) this._setStatus(String(err), false);
    } finally {
      if (generation === this._generation) this._busy = false;
    }
  }

  private async _reload(): Promise<void> {
    const hubId = this._mountedFor;
    if (!hubId || this._busy) return;
    const generation = this._generation;
    this._busy = true;
    try {
      const response = await this.api.remoteCardDocument(hubId);
      if (generation !== this._generation) return;
      if (!response.ok || !response.body) {
        this._setStatus(problemText(response), false);
        return;
      }
      this._apply(response.body.document);
      this._setStatus(response.body.document ? `stored document (updated ${formatWhen(response.body.updated_at)})` : "no document stored: the card uses its defaults");
    } catch (err) {
      if (generation === this._generation) this._setStatus(String(err), false);
    } finally {
      if (generation === this._generation) this._busy = false;
    }
  }

  private async _reset(): Promise<void> {
    const hubId = this._mountedFor;
    if (!hubId || this._busy) return;
    const generation = this._generation;
    this._busy = true;
    try {
      const response = await this.api.deleteRemoteCardDocument(hubId);
      if (generation !== this._generation) return;
      if (response.status !== 204) {
        this._setStatus(problemText(response), false);
        return;
      }
      this._apply(null);
      this._setStatus("reset: the card uses its defaults");
    } catch (err) {
      if (generation === this._generation) this._setStatus(String(err), false);
    } finally {
      if (generation === this._generation) this._busy = false;
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
    const dirty = this._documentText !== (this._document ? JSON.stringify(this._document, null, 2) : "");
    return html`
      <div class="layout-content">
        <h2>Remote configuration <span class="spacer"></span><span class="hint">${dirty ? "Unsaved changes" : "Saved configuration"}</span></h2>
        <div class="hint">Customize the remote shared by every phone, tablet and wall panel for ${hub ? hubDisplayName(hub) : "this hub"}. Changes stay in the preview until you save.</div>
        <div class="layout-grid">
          <div class="editor">
            <fieldset ?disabled=${!hub || !this._loaded || this._busy}>
              <div class="mode-tabs" aria-label="Configuration editor">
                <button id="remote-visual" aria-pressed=${this._mode === "visual"} @click=${() => this._switchMode("visual")}>Visual editor</button>
                <button id="remote-json" aria-pressed=${this._mode === "json"} @click=${() => this._switchMode("json")}>JSON</button>
              </div>
              ${this._mode === "visual" ? html`
                <sb-panel-remote-editor ?inert=${!hub || !this._loaded || this._busy} .selection=${this._selection} .config=${this._draft} .backend=${this._backend} .snapshot=${this._snapshot}
                  @document-changed=${(ev: CustomEvent<{ document: Record<string, unknown> }>) => { ev.stopPropagation(); this._edit(ev.detail.document); }}
                  @layout-selected=${(ev: CustomEvent<{ selection: string }>) => { ev.stopPropagation(); this._selection = ev.detail.selection; this._updateCard(); }}
                ></sb-panel-remote-editor>` : html`
                <textarea id="remote-doc" aria-label="Remote configuration JSON" .value=${this._documentText} @input=${(ev: Event) => { this._documentText = (ev.target as HTMLTextAreaElement).value; this._setStatus("Unsaved JSON changes"); }} placeholder='{ "show_dpad": true }'></textarea>
                <button @click=${() => { const parsed = this._readDocument(); if (parsed) this._edit(parsed); }}>Update preview</button>`}
            </fieldset>
          </div>
          <aside class="preview"><h3>Preview</h3><p class="hint">Preview only — buttons do not control the hub.</p>
            <div class="frame"><div class="stage" id="stage" inert></div></div>
          </aside>
        </div>
        <footer class="layout-actions" aria-label="Remote configuration actions">
            <div class="actions">
              <button class="primary" id="remote-save" ?disabled=${!hub || !this._loaded || this._busy} @click=${this._save}>${this._busy ? "Working…" : "Save"}</button>
              <button id="remote-load" ?disabled=${!hub || this._busy} @click=${this._reload}>Reload document</button>
              <button class="danger" id="remote-delete" ?disabled=${!hub || !this._loaded || this._busy} @click=${this._reset}>Reset to defaults</button>
            </div>
            <p class="msg ${this._statusOk ? "msg-ok" : "msg-err"}" id="remote-status" role="status">${this._status}</p>
        </footer>
      </div>`;
  }

}

export function defineRemoteView(): void {
  if (!customElements.get(REMOTE_VIEW_TAG)) customElements.define(REMOTE_VIEW_TAG, SbPanelRemote);
}
