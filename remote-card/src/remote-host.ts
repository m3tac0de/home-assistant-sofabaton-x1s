// Host logic shared by the web remote page (<sofabaton-remote-web>) and the
// embeddable element (<sofabaton-remote>) (docs/internal/remote-embed-plan.md,
// E1): the server base URL, resolving the hub the host asked for, loading
// its stored layout, and naming what went wrong so both hosts show the
// same notices. Pure over an injected fetch, so the node suite covers it;
// the DOM glue stays in the two hosts.

import { SERVER_API_PREFIX } from "./backend/server-backend";
import { normalizeHubId } from "./remote-web-config";

/** One row of `GET /hubs`, as far as a host needs it. */
export interface HubSummary {
  hub_id: string;
  enabled: boolean;
  config?: { host?: string; name?: string | null };
  status?: { hub_version?: string | null; mode?: string } | null;
}

interface UiDocumentResponse {
  hub_id: string;
  document: Record<string, unknown> | null;
  updated_at: string | null;
}

/** The error codes a host maps to a notice and, on the element, an event. */
export type HostErrorCode =
  | "server_missing"
  | "server_unreachable"
  | "cross_origin_refused"
  | "mixed_content"
  | "hub_missing"
  | "hub_not_found"
  | "server_too_old";

/**
 * The oldest server the npm package works with (plan, decision 8): the
 * release that ships `allowed_origins`, without which no other origin can
 * call the server. Newer servers are accepted; the API is additive within
 * `/api/v1`. The server-served build never checks (same commit).
 */
export const MIN_SERVER_VERSION = "0.2.2";
export const SUPPORTED_API_VERSION = "1";

export interface HostError {
  code: HostErrorCode;
  message: string;
}

export interface HubResolution {
  /** The hub as the server spells it, when found. */
  hub: HubSummary | null;
  /** Every hub the server listed (empty when the list could not be read). */
  hubs: HubSummary[];
  error: HostError | null;
}

/** The slice of `fetch` the host logic uses; tests fake it. */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (input: string, init?: RequestInit) => Promise<FetchResponseLike>;

/**
 * The server base a host was given (the `server` attribute): absolute,
 * without a trailing slash and without the API prefix, so
 * `${base}/api/v1/...` is the API and the events socket follows from it.
 * A relative value resolves against `pageHref`. Anything that is not an
 * http(s) URL is null.
 */
export function normalizeServerBase(value: unknown, pageHref?: string): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = pageHref ? new URL(raw, pageHref) : new URL(raw);
  } catch (_err) {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  let path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith(SERVER_API_PREFIX)) path = path.slice(0, -SERVER_API_PREFIX.length);
  return `${url.origin}${path}`.replace(/\/+$/, "");
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * An https page cannot call an http server: the browser blocks the
 * request before it is sent (mixed content), which would otherwise read
 * as an unreachable server. Null when the pair is fine.
 */
export function mixedContentError(pageProtocol: string | undefined, serverBase: string): HostError | null {
  if (pageProtocol !== "https:" || !/^http:/i.test(serverBase)) return null;
  return {
    code: "mixed_content",
    message:
      `This page is https but the server at ${serverBase} is http, which browsers block. ` +
      "Serve the server over TLS (a reverse proxy or --tls-cert) and use its https address.",
  };
}

/** Numeric dotted-version compare: negative, zero or positive; a pre-release suffix is ignored. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    String(v ?? "")
      .trim()
      .split(/[-+]/)[0]
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * The npm package's compatibility check (decision 8): `GET /server` must
 * report at least `minVersion` and the supported API generation. A server
 * that does not answer this read is left alone (the hub list already
 * answered, so something else is wrong and will surface on its own).
 */
export async function checkServerVersion(
  serverBase: string,
  fetchImpl: FetchLike,
  minVersion: string = MIN_SERVER_VERSION,
): Promise<HostError | null> {
  let info: { version?: unknown; api_version?: unknown } | null = null;
  try {
    const response = await fetchImpl(`${serverBase}${SERVER_API_PREFIX}/server`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    const body = await response.json();
    info = body && typeof body === "object" ? (body as { version?: unknown; api_version?: unknown }) : null;
  } catch (_err) {
    return null;
  }
  if (!info) return null;
  const version = String(info.version ?? "");
  const api = String(info.api_version ?? "");
  if (api && api !== SUPPORTED_API_VERSION) {
    return {
      code: "server_too_old",
      message: `The server speaks API generation ${api}; this package needs generation ${SUPPORTED_API_VERSION}.`,
    };
  }
  if (version && compareVersions(version, minVersion) < 0) {
    return {
      code: "server_too_old",
      message: `The server is version ${version}; this package needs sofabaton-x-server ${minVersion} or newer.`,
    };
  }
  return null;
}

/**
 * A read that the browser refused looks the same whether the server is
 * down or the page's origin is not in `allowed_origins` (reads from an
 * unlisted origin are answered without a CORS header, which the browser
 * turns into a network error). A `no-cors` probe tells them apart: it
 * resolves (opaquely) when the server answered at all.
 */
export async function classifyFetchFailure(
  serverBase: string,
  fetchImpl: FetchLike,
  err: unknown,
  options: { pageOrigin?: string } = {},
): Promise<HostError> {
  try {
    await fetchImpl(`${serverBase}${SERVER_API_PREFIX}/server`, { mode: "no-cors", cache: "no-store" });
  } catch (_probeErr) {
    return {
      code: "server_unreachable",
      message: `The server at ${serverBase} did not answer (${describe(err)}).`,
    };
  }
  const origin = options.pageOrigin ? ` ${options.pageOrigin}` : "";
  return {
    code: "cross_origin_refused",
    message:
      `The server at ${serverBase} refused this page: add this page's origin${origin} ` +
      "to the server's allowed_origins setting (control panel, Server settings).",
  };
}

/**
 * Find the hub a host asked for. The id is matched in any MAC spelling and
 * the server's own spelling is what comes back, so every later request
 * uses the id the server knows.
 */
export async function resolveHub(
  serverBase: string,
  requested: unknown,
  fetchImpl: FetchLike,
  options: { pageOrigin?: string } = {},
): Promise<HubResolution> {
  const wanted = normalizeHubId(requested);
  const api = `${serverBase}${SERVER_API_PREFIX}`;
  let hubs: HubSummary[] = [];
  try {
    const response = await fetchImpl(`${api}/hubs`, { headers: { accept: "application/json" } });
    if (!response.ok) {
      return {
        hub: null,
        hubs,
        error: {
          code: "server_unreachable",
          message: `The server at ${serverBase} answered GET ${SERVER_API_PREFIX}/hubs with ${response.status}.`,
        },
      };
    }
    const body = await response.json();
    hubs = Array.isArray(body) ? (body as HubSummary[]) : [];
  } catch (err) {
    return { hub: null, hubs, error: await classifyFetchFailure(serverBase, fetchImpl, err, options) };
  }
  if (!wanted) {
    return {
      hub: null,
      hubs,
      error: { code: "hub_missing", message: "No hub id given: set hub to the hub's MAC (any spelling)." },
    };
  }
  const hub = hubs.find((row) => normalizeHubId(row.hub_id) === wanted) ?? null;
  if (!hub) {
    return {
      hub: null,
      hubs,
      error: { code: "hub_not_found", message: `No hub with id ${wanted} is registered on this server.` },
    };
  }
  return { hub, hubs, error: null };
}

/**
 * The layout saved for the hub in the control panel (Remote > Layout), or
 * null when none is stored or the read failed: the card then runs on its
 * defaults, which is what the page did before layouts could be stored.
 */
export async function loadStoredDocument(
  serverBase: string,
  hubId: string,
  fetchImpl: FetchLike,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetchImpl(
      `${serverBase}${SERVER_API_PREFIX}/hubs/${encodeURIComponent(hubId)}/ui/remote-card`,
      { headers: { accept: "application/json" } },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as UiDocumentResponse;
    return body && typeof body === "object" ? body.document ?? null : null;
  } catch (_err) {
    return null;
  }
}

/** A value for a single-quoted HTML attribute: `&`, `'` and `<` escaped. */
export function escapeSingleQuotedAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/</g, "&lt;");
}

/**
 * The markup a dashboard pastes to embed the remote (control panel,
 * Remote > Layout > "Copy embed HTML"): the server's script and the
 * element. With a `document`, the layout rides along as the `config`
 * attribute and the dashboard owns it (the element then never reads the
 * server's saved layout); without one, the element follows the layout
 * saved on the server.
 */
export function embedHtmlSnippet(options: {
  serverBase: string;
  hubId: string;
  document?: Record<string, unknown> | null;
}): string {
  const base = options.serverBase.replace(/\/+$/, "");
  const attributes = [`hub="${escapeSingleQuotedAttribute(options.hubId).replace(/"/g, "&quot;")}"`];
  if (options.document) {
    attributes.push(`config='${escapeSingleQuotedAttribute(JSON.stringify(options.document))}'`);
  }
  return (
    `<script type="module" src="${base}/ui/embed/sofabaton-remote.js"></script>\n` +
    `<sofabaton-remote ${attributes.join(" ")}></sofabaton-remote>`
  );
}

/** The banner text for a hub the server cannot control right now, or null. */
export function unavailableBannerText(
  snapshot: { state?: string } | undefined,
  lastError: string | null,
): string | null {
  const unavailable = !snapshot || snapshot.state === "unavailable";
  if (!unavailable) return null;
  return lastError
    ? `The server cannot reach the hub (${lastError}).`
    : "The hub is not controllable right now (offline, disabled, or the Sofabaton app is connected).";
}
