// The embeddable remote (docs/internal/remote-embed-plan.md, E1 + E2):
// <sofabaton-remote hub="..."> for other people's dashboards, talking to
// sofabaton-x-server directly. A thin host around the shared card element:
// it resolves the hub, loads the layout saved in the control panel (or the
// `config` override), hands the card a ServerRemoteBackend, and sets the
// theme on itself. It never touches document, <html> or :root: everything
// it needs lives on the element, so a host page keeps its own styling.
//
// Attributes / properties: hub (required), server (base URL; derived from
// this script's URL in the server build), theme (inherit | light | dark),
// lang, device, config (JSON attribute or object property).
// Events (bubbling, composed): sofabaton-remote-ready {hub, name},
// sofabaton-remote-error {code, message}. Methods: refreshTheme(), reload().
//
// The HA build never sees this file; the server's own /ui/remote/ page
// keeps its own host (remote-web.ts).

import { ServerRemoteBackend } from "./backend/server-backend";
import { SofabatonRemoteCard } from "./remote-card-element";
import { CARD_VERSION, TYPE, logPillsOnce } from "./remote-card-shared";
import {
  normalizeEmbedTheme,
  parseCssColor,
  planEmbedTheme,
  type EmbedTheme,
  type RgbColor,
} from "./remote-embed-theme";
import {
  MIN_SERVER_VERSION,
  checkServerVersion,
  loadStoredDocument,
  mixedContentError,
  normalizeServerBase,
  resolveHub,
  unavailableBannerText,
  type HostError,
  type HubSummary,
} from "./remote-host";
import { cardConfigForWebRemote, serverBaseFromPageUrl } from "./remote-web-config";
import { defineRemoteWebElements } from "./shims/index";
import "./remote-card-translations";

export const EMBED_TAG = "sofabaton-remote";
/** Where the server serves this bundle; the base URL is everything before it. */
export const EMBED_MARKER = "/ui/embed/";

// Set by the build (esbuild define): "server" for the bundle the server
// serves, "npm" for the package. Source and tests run as the server build.
// Module-local on purpose: the minifier folds a local const, so the npm-only
// code (the version check, the package banner) drops out of the served
// build; an exported const would keep it.
declare const __SBX_EMBED_DIST__: "server" | "npm" | undefined;
// `IS_NPM` is written out at each site: only a literal comparison on the
// defined identifier folds, a const holding the result does not.
export const EMBED_DIST: "server" | "npm" = typeof __SBX_EMBED_DIST__ === "string" ? __SBX_EMBED_DIST__ : "server";
// The npm package's own version (its package.json), for the console banner.
declare const __SBX_PACKAGE_VERSION__: string | undefined;
const PACKAGE_VERSION: string | null = typeof __SBX_PACKAGE_VERSION__ === "string" ? __SBX_PACKAGE_VERSION__ : null;
export { MIN_SERVER_VERSION };

/**
 * The server build knows its server from its own URL (decision 7): the
 * script is served at `<base>/ui/embed/sofabaton-remote.js`. The npm build
 * is served by the dashboard, so it cannot know and requires `server`.
 */
function scriptServerBase(): string | null {
  if (typeof __SBX_EMBED_DIST__ === "string" && __SBX_EMBED_DIST__ === "npm") return null;
  let url: string;
  try {
    url = import.meta.url;
  } catch (_err) {
    return null;
  }
  if (typeof url !== "string" || !url.includes(EMBED_MARKER)) return null;
  return serverBaseFromPageUrl(url, EMBED_MARKER);
}

const SCRIPT_SERVER_BASE = scriptServerBase();

const OBSERVED = ["hub", "server", "theme", "lang", "device", "config"] as const;

const HOST_CSS = `
  :host {
    display: block;
    box-sizing: border-box;
    color: var(--primary-text-color);
    font-family: Roboto, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  :host([hidden]) { display: none; }
  .notice, .banner {
    box-sizing: border-box;
    max-width: 360px;
    margin: 0 auto 8px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.4;
  }
  .notice {
    background: var(--card-background-color);
    border: 1px solid var(--divider-color);
    color: var(--primary-text-color);
  }
  .banner {
    background: rgba(var(--rgb-error-color), 0.12);
    color: var(--error-color);
  }
  .probe {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
`;

export class SofabatonRemote extends HTMLElement {
  static get observedAttributes(): readonly string[] {
    return OBSERVED;
  }

  private readonly _shadow: ShadowRoot;
  private _stage: HTMLElement | null = null;
  private _notice: HTMLElement | null = null;
  private _banner: HTMLElement | null = null;
  private _probe: HTMLElement | null = null;

  private _backend: ServerRemoteBackend | null = null;
  private _card: SofabatonRemoteCard | null = null;
  private _unsubscribe: (() => void) | null = null;
  private _hub: HubSummary | null = null;
  private _lastBanner: string | null = null;

  private _bootEpoch = 0;
  private _bootQueued = false;
  private _configOverride: Record<string, unknown> | null = null;

  private _appliedThemeVars: string[] = [];
  private _media: MediaQueryList | null = null;
  private readonly _onMediaChange = (): void => this._applyTheme();

  constructor() {
    super();
    this._shadow = this.attachShadow({ mode: "open" });
  }

  // ---------- attributes as properties ----------

  get hub(): string {
    return this.getAttribute("hub") ?? "";
  }

  set hub(value: string | null | undefined) {
    this._setOrRemove("hub", value);
  }

  get server(): string {
    return this.getAttribute("server") ?? "";
  }

  set server(value: string | null | undefined) {
    this._setOrRemove("server", value);
  }

  get theme(): EmbedTheme {
    return normalizeEmbedTheme(this.getAttribute("theme"));
  }

  set theme(value: string | null | undefined) {
    this._setOrRemove("theme", value);
  }

  get lang(): string {
    return this.getAttribute("lang") ?? "";
  }

  set lang(value: string | null | undefined) {
    this._setOrRemove("lang", value);
  }

  get device(): number | null {
    const raw = this.getAttribute("device");
    if (raw == null || raw.trim() === "") return null;
    const id = Number(raw);
    return Number.isFinite(id) ? id : null;
  }

  set device(value: number | string | null | undefined) {
    this._setOrRemove("device", value == null ? null : String(value));
  }

  /** A layout override (the same document the panel stores); null uses the server's. */
  get config(): Record<string, unknown> | null {
    return this._configOverride;
  }

  set config(value: Record<string, unknown> | string | null | undefined) {
    if (typeof value === "string") {
      this._setOrRemove("config", value);
      return;
    }
    this._configOverride = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : null;
    if (this.hasAttribute("config")) this.removeAttribute("config");
    else this._scheduleBoot();
  }

  /** The hub as the server spells it, once loaded. */
  get hubId(): string | null {
    return this._hub?.hub_id ?? null;
  }

  /** Re-run the theme fill-in after the host changed its variables. */
  refreshTheme(): void {
    if (this.isConnected) this._applyTheme();
  }

  /** Start over: resolve the hub and load again (after the server was fixed or the origin listed). */
  reload(): void {
    this._scheduleBoot();
  }

  private _setOrRemove(name: string, value: string | null | undefined): void {
    if (value == null || value === "") this.removeAttribute(name);
    else this.setAttribute(name, String(value));
  }

  // ---------- lifecycle ----------

  connectedCallback(): void {
    this._renderShell();
    if (typeof matchMedia === "function" && !this._media) {
      this._media = matchMedia("(prefers-color-scheme: dark)");
      this._media.addEventListener("change", this._onMediaChange);
    }
    this._applyTheme();
    this._scheduleBoot();
  }

  disconnectedCallback(): void {
    this._bootEpoch += 1;
    this._teardown();
    if (this._media) {
      this._media.removeEventListener("change", this._onMediaChange);
      this._media = null;
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;
    if (name === "config") {
      this._configOverride = parseConfigAttribute(newValue);
    }
    if (!this.isConnected) return;
    if (name === "theme") {
      this._applyTheme();
      return;
    }
    if (name === "lang") {
      this._card?.setLanguage(this._language());
      return;
    }
    this._scheduleBoot();
  }

  // ---------- boot ----------

  private _scheduleBoot(): void {
    if (!this.isConnected || this._bootQueued) return;
    this._bootQueued = true;
    queueMicrotask(() => {
      this._bootQueued = false;
      if (this.isConnected) void this._boot();
    });
  }

  private async _boot(): Promise<void> {
    const epoch = ++this._bootEpoch;
    this._teardown();
    const serverBase = this._serverBase();
    if (!serverBase) {
      this._fail({
        code: "server_missing",
        message:
          (typeof __SBX_EMBED_DIST__ === "string" && __SBX_EMBED_DIST__ === "npm") || !this.server
            ? "Set the server attribute to the sofabaton-x-server base URL (for example http://nas:8480)."
            : `The server attribute is not an http(s) URL: ${this.server}`,
      });
      return;
    }
    const mixed = mixedContentError(typeof location !== "undefined" ? location.protocol : undefined, serverBase);
    if (mixed) {
      this._fail(mixed);
      return;
    }
    const fetchImpl: typeof fetch = (input, init) => fetch(input, init);
    const pageOrigin = typeof location !== "undefined" ? location.origin : undefined;
    const resolution = await resolveHub(serverBase, this.hub, fetchImpl, { pageOrigin });
    if (epoch !== this._bootEpoch) return;
    if (resolution.error || !resolution.hub) {
      this._fail(resolution.error ?? { code: "hub_not_found", message: "No such hub." });
      return;
    }
    const hub = resolution.hub;
    if (typeof __SBX_EMBED_DIST__ === "string" && __SBX_EMBED_DIST__ === "npm") {
      // The package may be older or newer than the server; the served
      // build is the server's own and skips this (decision 8).
      const tooOld = await checkServerVersion(serverBase, fetchImpl);
      if (epoch !== this._bootEpoch) return;
      if (tooOld) {
        this._fail(tooOld);
        return;
      }
    }

    let document_: Record<string, unknown> | null = this._configOverride;
    if (!document_) {
      document_ = await loadStoredDocument(serverBase, hub.hub_id, fetchImpl);
      if (epoch !== this._bootEpoch) return;
    }

    const backend = new ServerRemoteBackend({ baseUrl: serverBase });
    backend.setTarget(hub.hub_id);
    const card = document.createElement(TYPE) as SofabatonRemoteCard;
    card.setConfig(cardConfigForWebRemote(hub.hub_id, document_, { openDevice: this.device }));
    card.setLanguage(this._language());
    card.setBackend(backend);

    this._backend = backend;
    this._card = card;
    this._hub = hub;
    if (this._notice) this._notice.hidden = true;
    this._stage?.replaceChildren(card);
    this._unsubscribe = backend.subscribe(() => this._syncBanner());
    this._syncBanner();
    this.dispatchEvent(
      new CustomEvent("sofabaton-remote-ready", {
        detail: { hub: hub.hub_id, name: hub.config?.name ?? null },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _teardown(): void {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._card?.setBackend(null);
    this._card?.remove();
    this._card = null;
    this._backend?.stop();
    this._backend = null;
    this._hub = null;
    this._lastBanner = null;
    if (this._banner) {
      this._banner.hidden = true;
      this._banner.textContent = "";
    }
  }

  private _fail(error: HostError): void {
    if (this._notice) {
      this._notice.textContent = error.message;
      this._notice.hidden = false;
    }
    this.dispatchEvent(
      new CustomEvent("sofabaton-remote-error", {
        detail: { code: error.code, message: error.message },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private _serverBase(): string | null {
    const pageHref = typeof location !== "undefined" ? location.href : undefined;
    const given = this.server;
    if (given) return normalizeServerBase(given, pageHref);
    return SCRIPT_SERVER_BASE;
  }

  private _language(): string | undefined {
    const fromNavigator = typeof navigator !== "undefined" ? navigator.language : "";
    return (this.lang || fromNavigator || "").trim() || undefined;
  }

  // ---------- rendering ----------

  private _renderShell(): void {
    if (this._stage) return;
    this._shadow.innerHTML = `<style>${HOST_CSS}</style>
      <div class="probe" aria-hidden="true"></div>
      <div class="banner" part="banner" hidden></div>
      <div class="notice" part="notice" hidden></div>
      <div class="stage" part="stage"></div>`;
    this._probe = this._shadow.querySelector(".probe");
    this._banner = this._shadow.querySelector(".banner");
    this._notice = this._shadow.querySelector(".notice");
    this._stage = this._shadow.querySelector(".stage");
  }

  private _syncBanner(): void {
    if (!this._banner || !this._backend) return;
    const text = unavailableBannerText(this._backend.snapshot(), this._backend.lastError);
    if (text === this._lastBanner) return;
    this._lastBanner = text;
    this._banner.hidden = !text;
    this._banner.textContent = text ?? "";
  }

  // ---------- theme (E2) ----------

  private _applyTheme(): void {
    // Clear last time's fill-ins first, so the reads below see the host's
    // values and not our own.
    for (const name of this._appliedThemeVars) this.style.removeProperty(name);
    this._appliedThemeVars = [];
    this.style.removeProperty("color-scheme");
    const computed = getComputedStyle(this);
    const plan = planEmbedTheme({
      theme: this.theme,
      hostValue: (name) => computed.getPropertyValue(name).trim(),
      prefersDark: this._media?.matches ?? false,
      resolveColor: (css) => this._resolveColor(css),
      hostColorScheme: computed.getPropertyValue("color-scheme").trim(),
    });
    for (const [name, value] of Object.entries(plan.values)) {
      this.style.setProperty(name, value);
      this._appliedThemeVars.push(name);
    }
    if (plan.colorScheme) this.style.setProperty("color-scheme", plan.colorScheme);
  }

  /** Any CSS colour to its sRGB channels, through the browser's own parser. */
  private _resolveColor(css: string): RgbColor | null {
    const probe = this._probe;
    if (!probe) return parseCssColor(css);
    probe.style.color = "";
    probe.style.color = css;
    if (!probe.style.color) return null;
    const resolved = parseCssColor(getComputedStyle(probe).color);
    probe.style.color = "";
    return resolved;
  }
}

function parseConfigAttribute(raw: string | null): Record<string, unknown> | null {
  if (raw == null || raw.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch (_err) {
    // fall through
  }
  console.warn(`<${EMBED_TAG}>: the config attribute is not a JSON object; using the server's layout.`);
  return null;
}

declare global {
  interface HTMLElementTagNameMap {
    "sofabaton-remote": SofabatonRemote;
  }
}

export function bootstrapRemoteEmbed(): void {
  defineRemoteWebElements();
  logPillsOnce();
  if (typeof __SBX_EMBED_DIST__ === "string" && __SBX_EMBED_DIST__ === "npm" && PACKAGE_VERSION) {
    console.info(`sofabaton-x-remote ${PACKAGE_VERSION} (remote card ${CARD_VERSION}, needs sofabaton-x-server ${MIN_SERVER_VERSION}+)`);
  }
  if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);
  if (!customElements.get(EMBED_TAG)) customElements.define(EMBED_TAG, SofabatonRemote);
}

if (typeof window !== "undefined" && typeof customElements !== "undefined") {
  bootstrapRemoteEmbed();
}
