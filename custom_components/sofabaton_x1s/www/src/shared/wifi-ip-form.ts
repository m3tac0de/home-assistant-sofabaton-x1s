/**
 * The wifi_ip payload form: one HTTP form for both record kinds.
 *
 * A wifi_ip device holds request-text records (code type 0x1C: IPv4,
 * port and the HTTP request text, on the X1S and X2) and, on the X2 only,
 * URL records (0x21: URL, method, header pairs and body; the Sofabaton
 * app writes X2 Wifi commands this way). lib/blob_decoders.py decodes the
 * two to different field sets; the editor shows both as the same form and
 * picks the kind on save:
 *
 * * a new command is request text unless it needs a URL record (https or
 *   a host name, X2 only);
 * * an existing command keeps its kind, except that request text becomes
 *   a URL record when it needs one. A URL record is never rewritten as
 *   request text (that direction was never benched).
 *
 * The decoded fields stay the library's own (the sync and restore paths
 * round-trip them exactly), so a kind switch replaces the whole field set.
 * Parts of a stored record whose drafts the user did not touch are kept
 * verbatim, so editing only the body leaves the rest byte-identical. An
 * empty port, path or method saves as its default (80 or 443, "/", GET),
 * which is what the form's placeholders show.
 */

export type WifiIpRecordKind = "text" | "url";

/** The protocol choices of the form; https needs a URL record. */
export const WIFI_IP_SCHEMES: readonly string[] = ["http", "https"];

/** The methods a URL record can carry (its method byte: 0, 1, 2). */
export const WIFI_IP_URL_METHODS: readonly string[] = ["GET", "POST", "PUT"];

/** The draft keys of the form, in display order. */
export const WIFI_IP_DRAFT_KEYS: readonly string[] = [
  "scheme",
  "host",
  "port",
  "method",
  "path",
  "header",
  "content_type",
  "body",
];

export type WifiIpFormErrorCode =
  | "host_required"
  | "host_invalid"
  | "host_needs_ipv4"
  | "port_invalid"
  | "method_unsupported"
  | "header_line_invalid";

/**
 * A draft the chosen record kind cannot hold, with a machine-readable code.
 * The editors map codes to translated strings.
 */
export class WifiIpFormError extends Error {
  constructor(public readonly code: WifiIpFormErrorCode) {
    super(code);
    this.name = "WifiIpFormError";
  }
}

export interface WifiIpRecord {
  fields: Record<string, unknown>;
  trailerHex: string;
}

export function wifiIpRecordKind(fields: Record<string, unknown>): WifiIpRecordKind {
  return "url" in fields ? "url" : "text";
}

function fieldText(value: unknown): string {
  return value == null ? "" : String(value);
}

/** The method a draft saves as: uppercased, GET when left empty. */
function methodOf(draft: string | undefined): string {
  return String(draft ?? "").trim().toUpperCase() || "GET";
}

function sameLines(a: string, b: string): boolean {
  return a.replace(/\r\n|\r/g, "\n") === b.replace(/\r\n|\r/g, "\n");
}

/** "scheme://host:port/path?query" into its drafts; an unparseable URL lands whole in host. */
function splitUrl(url: string): { scheme: string; host: string; port: string; path: string } {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)([\s\S]*)$/.exec(url);
  if (!match) return { scheme: "http", host: url, port: "", path: "" };
  const [, scheme, authority, path] = match;
  // "[::1]:80" and "host:80" carry a port; a bare "[::1]" ends in "]".
  const withPort = /^(.*):(\d*)$/.exec(authority);
  return {
    scheme: scheme.toLowerCase(),
    host: withPort ? withPort[1] : authority,
    port: withPort ? withPort[2] : "",
    path,
  };
}

function headerDrafts(pairs: unknown): { header: string; contentType: string } {
  let contentType: string | null = null;
  const lines: string[] = [];
  for (const pair of Array.isArray(pairs) ? pairs : []) {
    const [name, value] = Array.isArray(pair) ? [fieldText(pair[0]), fieldText(pair[1])] : ["", ""];
    if (contentType === null && name.toLowerCase() === "content-type") {
      contentType = value;
      continue;
    }
    lines.push(`${name}: ${value}`);
  }
  return { header: lines.join("\r\n"), contentType: contentType ?? "" };
}

/** The form drafts for a stored wifi_ip command of either kind. */
export function wifiIpDraftsFromFields(fields: Record<string, unknown>): Record<string, string> {
  if (wifiIpRecordKind(fields) === "url") {
    const { scheme, host, port, path } = splitUrl(fieldText(fields.url));
    const { header, contentType } = headerDrafts(fields.headers);
    return {
      scheme,
      host,
      port,
      method: fieldText(fields.method),
      path,
      header,
      content_type: contentType,
      body: fieldText(fields.body),
    };
  }
  return {
    scheme: "http",
    host: fieldText(fields.host),
    port: fields.port == null ? "" : String(Number(fields.port) || 0),
    method: fieldText(fields.method),
    path: fieldText(fields.path),
    header: fieldText(fields.header),
    content_type: fieldText(fields.content_type),
    body: fieldText(fields.body),
  };
}

/** True when any draft differs from the stored command's (line endings aside). */
export function wifiIpDraftsChanged(fields: Record<string, unknown>, drafts: Record<string, string>): boolean {
  const original = wifiIpDraftsFromFields(fields);
  return WIFI_IP_DRAFT_KEYS.some((key) => !sameLines(drafts[key] ?? "", original[key] ?? ""));
}

/**
 * The drafts after a protocol change: a port left at the old protocol's
 * default moves to the new one's, so switching to https does not keep 80.
 */
export function wifiIpDraftsWithScheme(drafts: Record<string, string>, scheme: string): Record<string, string> {
  const port = String(drafts.port ?? "").trim();
  const nextPort = scheme === "https" && port === "80"
    ? "443"
    : scheme === "http" && port === "443"
      ? "80"
      : drafts.port ?? "";
  return { ...drafts, scheme, port: nextPort };
}

/** The port a request goes to when the Port field is left empty. */
export function wifiIpDefaultPort(scheme: string | undefined): string {
  return String(scheme ?? "").trim().toLowerCase() === "https" ? "443" : "80";
}

/**
 * The request the drafts describe, for the form's summary line: the method
 * and the URL as typed (no validation, so a mistake shows in it), an empty
 * method or path as what it saves as. Null until there is a host.
 */
export function wifiIpRequestPreview(drafts: Record<string, string>): { method: string; url: string } | null {
  const host = String(drafts.host ?? "").trim();
  if (!host) return null;
  const scheme = String(drafts.scheme ?? "").trim().toLowerCase() === "https" ? "https" : "http";
  const port = String(drafts.port ?? "").trim();
  // Brackets for IPv6 only: one colon is a mistake (see urlHost) and shows as typed.
  const shownHost = (host.match(/:/g) ?? []).length > 1 && !host.startsWith("[") ? `[${host}]` : host;
  return {
    method: methodOf(drafts.method),
    url: `${scheme}://${shownHost}${port ? `:${port}` : ""}${urlPath(String(drafts.path ?? "")) || "/"}`,
  };
}

/** The dotted quad without leading zeros (the record packs four bytes), or null. */
function canonicalIpv4(host: string): string | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets.join(".") : null;
}

function urlHost(host: string): string {
  if (/[\s/?#@]/.test(host)) throw new WifiIpFormError("host_invalid");
  if (host.startsWith("[")) return host;
  const colons = (host.match(/:/g) ?? []).length;
  // One colon is a port typed into the host field; two or more is IPv6.
  if (colons === 1) throw new WifiIpFormError("host_invalid");
  return colons ? `[${host}]` : host;
}

function urlPath(path: string): string {
  const trimmed = path.trim();
  return !trimmed || /^[/?#]/.test(trimmed) ? trimmed : `/${trimmed}`;
}

function headerPairs(header: string, contentType: string): string[][] {
  const pairs: string[][] = [];
  for (const line of header.split(/\r\n|\r|\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    const name = colon < 0 ? "" : line.slice(0, colon).trim();
    if (!name) throw new WifiIpFormError("header_line_invalid");
    pairs.push([name, line.slice(colon + 1).trim()]);
  }
  if (contentType.trim()) pairs.push(["Content-Type", contentType.trim()]);
  return pairs;
}

/**
 * The decoded fields and trailer to save for the form's drafts.
 *
 * `original` is the command being edited (`existing`) or the template a new
 * command was seeded from (null for neutral defaults). Throws a
 * {@link WifiIpFormError} for drafts the chosen kind cannot hold.
 */
export function buildWifiIpRecord(
  drafts: Record<string, string>,
  options: { original: WifiIpRecord | null; existing: boolean; isX2: boolean },
): WifiIpRecord {
  const { original, existing } = options;
  const scheme = String(drafts.scheme ?? "").trim().toLowerCase() === "https" ? "https" : "http";
  const host = String(drafts.host ?? "").trim();
  if (!host) throw new WifiIpFormError("host_required");
  const ipv4 = canonicalIpv4(host);
  const portDraft = String(drafts.port ?? "").trim();
  const port = portDraft ? Number(portDraft) : null;
  if (port !== null && !(Number.isInteger(port) && port >= 1 && port <= 0xffff)) {
    throw new WifiIpFormError("port_invalid");
  }

  const originalKind = original ? wifiIpRecordKind(original.fields) : "text";
  const keepsUrl = existing && originalKind === "url";
  const needsUrl = scheme === "https" || ipv4 === null;
  // A stored URL record proves the hub is an X2 even when the bundle cannot say.
  if (needsUrl && !options.isX2 && !keepsUrl) throw new WifiIpFormError("host_needs_ipv4");
  const kind: WifiIpRecordKind = needsUrl || keepsUrl ? "url" : "text";

  // The stored record's own values win where their drafts are untouched; a
  // kind switch starts afresh, with no trailer (as the library builds them).
  const same = original !== null && originalKind === kind ? original : null;
  const originalDrafts = same ? wifiIpDraftsFromFields(same.fields) : null;
  const untouched = (...keys: string[]) =>
    originalDrafts !== null && keys.every((key) => sameLines(drafts[key] ?? "", originalDrafts[key] ?? ""));
  const keep = <T>(key: string, value: () => T): unknown => (same && untouched(key) ? same.fields[key] : value());
  const trailerHex = same ? same.trailerHex : "";

  if (kind === "text") {
    return {
      trailerHex,
      fields: {
        host: keep("host", () => ipv4),
        port: keep("port", () => port ?? 80),
        method: keep("method", () => methodOf(drafts.method)),
        path: keep("path", () => String(drafts.path ?? "").trim() || "/"),
        header: keep("header", () => String(drafts.header ?? "").replace(/\r\n|\r|\n/g, "\r\n")),
        content_type: keep("content_type", () => String(drafts.content_type ?? "")),
        body: keep("body", () => String(drafts.body ?? "")),
      },
    };
  }

  const method = methodOf(drafts.method);
  if (!WIFI_IP_URL_METHODS.includes(method)) throw new WifiIpFormError("method_unsupported");
  const url = same && untouched("scheme", "host", "port", "path")
    ? fieldText(same.fields.url)
    : `${scheme}://${ipv4 ?? urlHost(host)}${port === null ? "" : `:${port}`}${urlPath(String(drafts.path ?? ""))}`;
  const headers = same && untouched("header", "content_type")
    ? (Array.isArray(same.fields.headers) ? same.fields.headers : []).map((pair) => [...(pair as unknown[])])
    : headerPairs(String(drafts.header ?? ""), String(drafts.content_type ?? ""));
  return {
    trailerHex,
    fields: { url, method, headers, body: keep("body", () => String(drafts.body ?? "")) },
  };
}
