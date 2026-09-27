// Entry for the web remote (docs/internal/web-remote-plan.md, R5): the
// remote card served by sofabaton-x-server at /ui/remote/. Installs the
// platform shims, then mounts <sofabaton-remote-web>, a thin host that
// resolves the hub from the URL, loads the per-hub configuration document,
// and hands the card a ServerRemoteBackend. The HA build never sees this
// file; the card element itself is shared unchanged.
//
// URL parameters: hub=<hub id> (required), lang=<bcp47>, device=<id>
// (open in device mode), zoom=<factor>, theme=light|dark.

import { ServerRemoteBackend, SERVER_API_PREFIX } from "./backend/server-backend";
import { SofabatonRemoteCard } from "./remote-card-element";
import { CARD_VERSION, TYPE, logPillsOnce } from "./remote-card-shared";
import {
  loadStoredDocument,
  resolveHub,
  unavailableBannerText,
  type HubSummary,
} from "./remote-host";
import {
  cardConfigForWebRemote,
  parseWebRemoteParams,
  serverBaseFromPageUrl,
  type WebRemoteParams,
} from "./remote-web-config";
import { installRemoteWebShims } from "./shims/index";
import "./remote-card-translations";

export const WEB_REMOTE_TAG = "sofabaton-remote-web";

const HOST_CSS = `
  :host {
    display: block;
    min-height: 100vh;
    box-sizing: border-box;
    padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    background: var(--primary-background-color);
    color: var(--primary-text-color);
    font-family: Roboto, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .stage {
    max-width: 480px;
    margin: 0 auto;
    padding: 12px;
  }
  .notice {
    max-width: 480px;
    margin: 24px auto;
    padding: 20px;
    border-radius: 12px;
    background: var(--card-background-color);
    border: 1px solid var(--divider-color);
    line-height: 1.5;
  }
  .notice h1 { font-size: 20px; margin: 0 0 8px; }
  .notice code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .notice ul { padding-left: 20px; }
  .notice a { color: var(--primary-color); }
  .banner {
    max-width: 480px;
    margin: 0 auto 8px;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(var(--rgb-error-color), 0.12);
    color: var(--error-color);
    font-size: 13px;
  }
  .foot {
    max-width: 480px;
    margin: 8px auto 0;
    text-align: center;
    color: var(--secondary-text-color);
    font-size: 11px;
  }
`;

export class SofabatonRemoteWeb extends HTMLElement {
  private readonly _shadow: ShadowRoot;
  private _backend: ServerRemoteBackend | null = null;
  private _card: SofabatonRemoteCard | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _params: WebRemoteParams | null = null;
  private _lastBanner: string | null = null;

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });
  }

  connectedCallback(): void {
    void this._boot();
  }

  disconnectedCallback(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._card?.setBackend(null);
    this._backend?.stop();
  }

  private async _boot(): Promise<void> {
    const params = parseWebRemoteParams(location.search, navigator.language);
    this._params = params;
    if (params.theme) document.documentElement.dataset.theme = params.theme;
    // The server may be mounted under a root path; the page's own URL says where.
    const serverBase = serverBaseFromPageUrl(location.href);
    const fetchImpl: typeof fetch = (input, init) => fetch(input, init);

    // Shared with the embeddable element (remote-host.ts): the hub is
    // matched in any spelling and the server's own spelling is used from
    // here on.
    const resolution = await resolveHub(serverBase, params.hub, fetchImpl, { pageOrigin: location.origin });
    const known = resolution.hub;
    if (!known) {
      const listError =
        resolution.error && resolution.error.code !== "hub_missing" && resolution.error.code !== "hub_not_found"
          ? resolution.error.message
          : null;
      this._renderInstructions(params.hub, resolution.hubs, listError);
      return;
    }
    const hubId = known.hub_id;

    const storedDocument = await loadStoredDocument(serverBase, hubId, fetchImpl);

    const backend = new ServerRemoteBackend({ baseUrl: serverBase });
    backend.setTarget(hubId);
    this._backend = backend;

    const card = document_createCard();
    card.setConfig(cardConfigForWebRemote(hubId, storedDocument, { openDevice: params.device }));
    card.setLanguage(params.lang);
    card.setBackend(backend);
    this._card = card;

    this._renderStage(card, known);
    this._unsubscribe = backend.subscribe(() => this._syncBanner());
    this._syncBanner();
  }

  private _renderStage(card: HTMLElement, hub: HubSummary): void {
    const zoom = this._params?.zoom;
    this._shadow.innerHTML = `<style>${HOST_CSS}</style>
      <div class="banner" id="banner" hidden></div>
      <div class="stage" id="stage"></div>
      <div class="foot">${escapeHtml(hub.config?.name || hub.hub_id)} · sofabaton-x-server · remote card ${CARD_VERSION}</div>`;
    const stage = this._shadow.getElementById("stage") as HTMLElement;
    if (zoom) stage.style.zoom = String(zoom);
    stage.appendChild(card);
  }

  private _syncBanner(): void {
    const banner = this._shadow.getElementById("banner") as HTMLElement | null;
    if (!banner || !this._backend) return;
    const text = unavailableBannerText(this._backend.snapshot(), this._backend.lastError);
    if (text === this._lastBanner) return;
    this._lastBanner = text;
    banner.hidden = !text;
    banner.textContent = text ?? "";
  }

  private _renderInstructions(requested: string, hubs: HubSummary[], error: string | null): void {
    const list = hubs.length
      ? `<ul>${hubs
          .map((hub) => {
            const href = `?hub=${encodeURIComponent(hub.hub_id)}`;
            const label = `${escapeHtml(hub.config?.name || hub.hub_id)} (${escapeHtml(hub.status?.hub_version || "?")}, ${hub.enabled ? escapeHtml(hub.status?.mode || "starting") : "disabled"})`;
            return `<li><a href="${href}">${label}</a> <code>${escapeHtml(hub.hub_id)}</code></li>`;
          })
          .join("")}</ul>`
      : error
        ? `<p>The server did not answer <code>${SERVER_API_PREFIX}/hubs</code>: ${escapeHtml(error)}</p>`
        : `<p>This server has no hubs registered yet. Add one with <code>POST ${SERVER_API_PREFIX}/hubs</code> or from the <a href="../">control panel</a>.</p>`;
    const why = requested
      ? `<p>No hub with id <code>${escapeHtml(requested)}</code> is registered on this server.</p>`
      : `<p>Open this page with <code>?hub=&lt;hub id&gt;</code>. The id is the hub's MAC (any spelling), or the host it was registered by before its first sync.</p>`;
    this._shadow.innerHTML = `<style>${HOST_CSS}</style>
      <div class="notice">
        <h1>Sofabaton web remote</h1>
        ${why}
        ${list}
        <p>Optional parameters: <code>lang=</code>, <code>device=&lt;device id&gt;</code> to open in device mode, <code>zoom=</code>, <code>theme=light|dark</code>.</p>
      </div>`;
  }
}

function document_createCard(): SofabatonRemoteCard {
  return document.createElement(TYPE) as SofabatonRemoteCard;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export function bootstrapWebRemote(): void {
  installRemoteWebShims();
  logPillsOnce();
  if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);
  if (!customElements.get(WEB_REMOTE_TAG)) customElements.define(WEB_REMOTE_TAG, SofabatonRemoteWeb);
}

if (typeof window !== "undefined" && typeof customElements !== "undefined") {
  bootstrapWebRemote();
}
