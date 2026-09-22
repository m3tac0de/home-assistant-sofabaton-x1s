// The API view (docs/internal/server-panel-plan.md, decision 6): the
// request / response console. Pick an operation from the OpenAPI document
// or type a method and path, send, read the exact request and the raw
// response; follow a 202's job; the last requests are kept as history.

import { LitElement, html, css, type PropertyValues, type TemplateResult } from "lit";

import type { ApiResponse, HubView, Operation, PanelApi } from "../panel-api";
import type { HubContext } from "../panel-context";
import { HISTORY_LIMIT, loadHistory, parseHeaderLines, prettyJson, saveHistory, type HistoryEntry } from "../panel-state";
import { PANEL_BASE_CSS } from "../panel-styles";

export const API_VIEW_TAG = "sb-panel-api";

interface LastJob {
  hub_id: string;
  job_id: string;
}

const TERMINAL_JOB = new Set(["done", "failed", "cancelled"]);

export class SbPanelApi extends LitElement {
  static properties = {
    api: { attribute: false },
    ctx: { attribute: false },
    hub: { attribute: false },
    operations: { attribute: false },
    _request: { state: true },
    _response: { state: true },
    _timing: { state: true },
    _pretty: { state: true },
    _history: { state: true },
    _sending: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; }
      .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
      .status { font-weight: 600; }
      .s2 { color: var(--sbp-ok); } .s3 { color: var(--sbp-accent); } .s4 { color: var(--sbp-warn); } .s5 { color: var(--sbp-err); }
      .history { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
      .history button { text-align: left; font-family: var(--sbp-mono); font-size: 11px; padding: 4px 8px; background: var(--sbp-bg); }
      @media (max-width: 960px) { .split { grid-template-columns: 1fr; } }
    `,
  ];

  api!: PanelApi;
  ctx: HubContext | null = null;
  hub: HubView | null = null;
  operations: Operation[] = [];
  private _request = "nothing sent yet";
  private _response: ApiResponse | null = null;
  private _timing = "";
  private _pretty = true;
  private _history: HistoryEntry[] = [];
  private _sending = false;
  private _lastJob: LastJob | null = null;
  private _storage: Storage | null = null;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }

  connectedCallback(): void {
    super.connectedCallback();
    try {
      this._storage = window.localStorage;
    } catch {
      this._storage = null;
    }
    this._history = loadHistory(this._storage);
  }

  private _field<T extends HTMLElement>(id: string): T | null {
    return this.renderRoot.querySelector<T>(`#${id}`);
  }

  private _value(id: string): string {
    return (this._field<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id)?.value ?? "").trim();
  }

  private _setValue(id: string, value: string): void {
    const el = this._field<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
    if (el) el.value = value;
  }

  private _pickOperation(event: Event): void {
    const index = Number((event.target as HTMLSelectElement).value);
    const op = this.operations[index];
    if (!op) return;
    this._setValue("method", op.method);
    this._setValue("path", op.path);
    if (op.hasBody && !this._value("reqbody")) this._setValue("reqbody", "{}");
  }

  private _resolvePath(raw: string): string {
    let p = raw.trim();
    if (!p.startsWith("/")) p = `/${p}`;
    p = p.replace(/\{hub_id\}/g, this.hub?.hub_id ?? "{hub_id}");
    if (this._lastJob && /\{job_id\}/.test(p)) p = p.replace(/\{job_id\}/g, this._lastJob.job_id);
    return p;
  }

  private async _send(preset?: { method: string; path: string; query: string; body: string; headers: Record<string, string> }): Promise<void> {
    const method = preset?.method ?? this._value("method");
    const rawPath = preset?.path ?? this._value("path");
    const path = this._resolvePath(rawPath);
    const query = preset?.query ?? this._value("query");
    const headers = preset?.headers ?? parseHeaderLines(this._field<HTMLTextAreaElement>("headers")?.value ?? "");
    let body = preset?.body ?? (this._field<HTMLTextAreaElement>("reqbody")?.value ?? "").trim();
    if (method === "GET") body = "";
    const url = new URL(this.api.url(path, query));
    const sentHeaders: Record<string, string> = { ...headers };
    if (body && !Object.keys(sentHeaders).some((k) => k.toLowerCase() === "content-type")) sentHeaders["Content-Type"] = "application/json";
    const lines = [`${method} ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`];
    for (const [k, v] of Object.entries(sentHeaders)) lines.push(`${k}: ${v}`);
    if (body) lines.push(`Content-Length: ${new TextEncoder().encode(body).length}`, "", body);
    this._request = lines.join("\n");
    this._timing = "";
    this._sending = true;
    const t0 = performance.now();
    let response: ApiResponse;
    try {
      response = await this.api.request(method, path, { query, headers, rawBody: body });
    } catch (err) {
      this._response = { ok: false, status: 0, statusText: `request failed: ${String(err)}`, headers: [], text: "", body: null };
      this._sending = false;
      return;
    }
    this._sending = false;
    this._timing = `${Math.round(performance.now() - t0)} ms`;
    this._response = response;
    const job = response.body as { job_id?: string; hub_id?: string } | null;
    if (response.status === 202 && job?.job_id && job.hub_id) this._lastJob = { hub_id: job.hub_id, job_id: job.job_id };
    this._history = [{ method, path: rawPath, query, body, status: response.status, at: new Date().toLocaleTimeString() }, ...this._history].slice(0, HISTORY_LIMIT);
    saveHistory(this._storage, this._history);
    this.dispatchEvent(new CustomEvent("sb-request-sent", { bubbles: true, composed: true }));
  }

  private async _follow(): Promise<void> {
    const job = this._lastJob;
    if (!job) {
      this._response = { ok: false, status: 0, statusText: "no 202 job to follow yet", headers: [], text: "", body: null };
      return;
    }
    for (let i = 0; i < 600; i++) {
      await this._send({ method: "GET", path: `/hubs/${job.hub_id}/jobs/${job.job_id}`, query: "", body: "", headers: {} });
      const status = (this._response?.body as { status?: string } | null)?.status;
      if (!status || TERMINAL_JOB.has(status)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private _recall(entry: HistoryEntry): void {
    this._setValue("method", entry.method);
    this._setValue("path", entry.path);
    this._setValue("query", entry.query);
    this._setValue("reqbody", entry.body);
    this._setValue("op", "");
  }

  private _renderResponse(): TemplateResult {
    const r = this._response;
    if (!r) return html`<pre id="rawres">${this._sending ? "…" : "no response yet"}</pre>`;
    if (r.status === 0) return html`<pre id="rawres">${r.statusText}</pre>`;
    const cls = `s${String(r.status)[0]}`;
    const headers = r.headers.map(([k, v]) => `${k}: ${v}`).join("\n");
    const body = this._pretty ? prettyJson(r.text) : r.text;
    return html`<pre id="rawres"><span class="status ${cls}">HTTP/1.1 ${r.status} ${r.statusText}</span>\n${headers}\n\n${body}</pre>`;
  }

  render(): TemplateResult {
    return html`
      <div class="split">
        <div class="panel">
          <h2>Request <span class="spacer"></span><span class="hint mono" id="api-base">${new URL(this.api.apiRoot, location.href).pathname}/</span></h2>
          <label>Operation (from openapi.json)</label>
          <select id="op" @change=${this._pickOperation}>
            <option value="">custom…</option>
            ${this.operations.map((op, i) => html`<option value=${String(i)}>${op.method.padEnd(6)} ${op.path}  —  ${op.summary}</option>`)}
          </select>
          <div class="row">
            <div class="fixed" style="width: 110px"><label>Method</label>
              <select id="method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option></select></div>
            <div><label>Path (relative to the API root; <code>{hub_id}</code> is the selected hub)</label>
              <input id="path" value="/hubs/{hub_id}/status" @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") void this._send(); }}></div>
          </div>
          <label>Query (a=b&amp;c=d)</label>
          <input id="query" placeholder="after=12&limit=50">
          <label>Headers (one per line, <code>Name: value</code>)</label>
          <textarea id="headers" placeholder='If-Match: "snapshot id"'></textarea>
          <label>Body (JSON; sent when non-empty and the method is not GET)</label>
          <textarea id="reqbody" style="min-height: 120px" @keydown=${(e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void this._send(); }}></textarea>
          <div class="actions" style="margin-top: 10px">
            <button class="primary" id="send" ?disabled=${this._sending} @click=${() => this._send()}>Send</button>
            <button id="follow" title="poll GET /hubs/{hub_id}/jobs/{job_id} from the last 202 until it finishes" @click=${this._follow}>Follow job</button>
            <button id="clear-hist" class="small" style="margin-left: auto" @click=${() => { this._history = []; saveHistory(this._storage, []); }}>clear history</button>
          </div>
          <label>Sent (raw)</label>
          <pre id="rawreq">${this._request}</pre>
          <label>History</label>
          <div class="history" id="history">
            ${this._history.map((h) => html`<button @click=${() => this._recall(h)}>${h.at}  ${h.status}  ${h.method} ${h.path}${h.query ? `?${h.query}` : ""}</button>`)}
          </div>
        </div>
        <div class="panel">
          <h2>Response <span class="spacer"></span><span class="hint" id="timing">${this._timing}</span>
            <button class="small" id="toggle-pretty" @click=${() => { this._pretty = !this._pretty; }}>${this._pretty ? "raw" : "pretty"}</button></h2>
          ${this._renderResponse()}
        </div>
      </div>
    `;
  }
}

export function defineApiView(): void {
  if (!customElements.get(API_VIEW_TAG)) customElements.define(API_VIEW_TAG, SbPanelApi);
}
