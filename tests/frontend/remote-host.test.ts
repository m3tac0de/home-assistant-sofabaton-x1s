// The host logic shared by the web remote page and the embeddable element
// (docs/internal/remote-embed-plan.md, E1): server base normalisation, hub
// resolution with the server's spelling, the failure classes a host shows,
// and the stored layout read.

import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_SERVER_VERSION,
  checkServerVersion,
  classifyFetchFailure,
  compareVersions,
  embedHtmlSnippet,
  loadStoredDocument,
  mixedContentError,
  normalizeServerBase,
  resolveHub,
  unavailableBannerText,
  type FetchLike,
} from "../../remote-card/src/remote-host";

const HUB = { hub_id: "e26a44861b45", enabled: true, config: { host: "192.168.1.50", name: "Living room" } };

type Handler = (url: string, init?: RequestInit) => { ok?: boolean; status?: number; body?: unknown } | Error;

function fakeFetch(handler: Handler): FetchLike & { calls: Array<{ url: string; init?: RequestInit }> } {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const answer = handler(url, init);
    if (answer instanceof Error) throw answer;
    return {
      ok: answer.ok ?? true,
      status: answer.status ?? 200,
      json: async () => answer.body,
    };
  }) as FetchLike & { calls: typeof calls };
  impl.calls = calls;
  return impl;
}

test("normalizeServerBase strips slashes and the API prefix and resolves relative values", () => {
  assert.equal(normalizeServerBase("http://nas:8480"), "http://nas:8480");
  assert.equal(normalizeServerBase("http://nas:8480/"), "http://nas:8480");
  assert.equal(normalizeServerBase("http://nas:8480/api/v1/"), "http://nas:8480");
  assert.equal(normalizeServerBase("https://home.example/sofabaton/api/v1"), "https://home.example/sofabaton");
  assert.equal(normalizeServerBase("  http://nas:8480/sofabaton/  "), "http://nas:8480/sofabaton");
  assert.equal(normalizeServerBase("/sofabaton", "https://dash.example/pages/tv.html"), "https://dash.example/sofabaton");
  assert.equal(normalizeServerBase("//nas:8480", "https://dash.example/"), "https://nas:8480");
  assert.equal(normalizeServerBase("", "https://dash.example/"), null);
  assert.equal(normalizeServerBase(null), null);
  assert.equal(normalizeServerBase("nas:8480"), null);
  assert.equal(normalizeServerBase("ftp://nas"), null);
  assert.equal(normalizeServerBase("not a url"), null);
});

test("resolveHub matches the id in any spelling and answers with the server's", async () => {
  const fetchImpl = fakeFetch(() => ({ body: [HUB, { hub_id: "aabbccddeeff", enabled: false }] }));
  const found = await resolveHub("http://nas:8480", "E2:6A:44:86:1B:45", fetchImpl);
  assert.equal(found.error, null);
  assert.equal(found.hub?.hub_id, "e26a44861b45");
  assert.equal(found.hubs.length, 2);
  assert.equal(fetchImpl.calls[0].url, "http://nas:8480/api/v1/hubs");
});

test("resolveHub names a missing and an unknown hub, with the list to choose from", async () => {
  const fetchImpl = fakeFetch(() => ({ body: [HUB] }));
  const missing = await resolveHub("http://nas:8480", "", fetchImpl);
  assert.equal(missing.error?.code, "hub_missing");
  assert.deepEqual(missing.hubs, [HUB]);
  const unknown = await resolveHub("http://nas:8480", "nope", fetchImpl);
  assert.equal(unknown.error?.code, "hub_not_found");
  assert.match(unknown.error?.message ?? "", /No hub with id nope/);
  assert.deepEqual(unknown.hubs, [HUB]);
});

test("resolveHub treats a non-2xx list as an unreachable server", async () => {
  const fetchImpl = fakeFetch(() => ({ ok: false, status: 503, body: null }));
  const result = await resolveHub("http://nas:8480", HUB.hub_id, fetchImpl);
  assert.equal(result.error?.code, "server_unreachable");
  assert.match(result.error?.message ?? "", /503/);
});

test("a failed read is an unlisted origin when the no-cors probe still answers", async () => {
  const fetchImpl = fakeFetch((url, init) => {
    if (init?.mode === "no-cors") return { status: 0, body: null };
    return new TypeError("Failed to fetch");
  });
  const result = await resolveHub("http://nas:8480", HUB.hub_id, fetchImpl, { pageOrigin: "https://dash.example" });
  assert.equal(result.error?.code, "cross_origin_refused");
  assert.match(result.error?.message ?? "", /allowed_origins/);
  assert.match(result.error?.message ?? "", /https:\/\/dash\.example/);
  assert.equal(fetchImpl.calls[1].url, "http://nas:8480/api/v1/server");
  assert.equal(fetchImpl.calls[1].init?.mode, "no-cors");
});

test("a failed read is an unreachable server when the probe fails too", async () => {
  const fetchImpl = fakeFetch(() => new TypeError("Failed to fetch"));
  const result = await resolveHub("http://nas:8480", HUB.hub_id, fetchImpl);
  assert.equal(result.error?.code, "server_unreachable");
  assert.match(result.error?.message ?? "", /http:\/\/nas:8480/);
  assert.match(result.error?.message ?? "", /Failed to fetch/);
  const direct = await classifyFetchFailure("http://nas:8480", fetchImpl, new Error("boom"));
  assert.equal(direct.code, "server_unreachable");
});

test("loadStoredDocument returns the document, or null when none is stored or the read fails", async () => {
  const stored = fakeFetch(() => ({ body: { hub_id: HUB.hub_id, document: { show_dpad: false }, updated_at: "2026-09-26T00:00:00Z" } }));
  assert.deepEqual(await loadStoredDocument("http://nas:8480", HUB.hub_id, stored), { show_dpad: false });
  assert.equal(stored.calls[0].url, "http://nas:8480/api/v1/hubs/e26a44861b45/ui/remote-card");
  const empty = fakeFetch(() => ({ body: { hub_id: HUB.hub_id, document: null, updated_at: null } }));
  assert.equal(await loadStoredDocument("http://nas:8480", HUB.hub_id, empty), null);
  const gone = fakeFetch(() => ({ ok: false, status: 404, body: { type: "hub_not_found" } }));
  assert.equal(await loadStoredDocument("http://nas:8480", HUB.hub_id, gone), null);
  const down = fakeFetch(() => new TypeError("Failed to fetch"));
  assert.equal(await loadStoredDocument("http://nas:8480", HUB.hub_id, down), null);
  const odd = fakeFetch(() => ({ body: { hub_id: "x:y", document: { a: 1 }, updated_at: null } }));
  await loadStoredDocument("http://nas:8480", "x:y", odd);
  assert.equal(odd.calls[0].url, "http://nas:8480/api/v1/hubs/x%3Ay/ui/remote-card");
});

test("mixedContentError only fires for an https page against an http server", () => {
  const error = mixedContentError("https:", "http://nas:8480");
  assert.equal(error?.code, "mixed_content");
  assert.match(error?.message ?? "", /TLS/);
  assert.equal(mixedContentError("https:", "https://nas:8480"), null);
  assert.equal(mixedContentError("http:", "http://nas:8480"), null);
  assert.equal(mixedContentError(undefined, "http://nas:8480"), null);
});

test("compareVersions is numeric per segment and ignores a pre-release suffix", () => {
  assert.ok(compareVersions("0.2.2", "0.2.2") === 0);
  assert.ok(compareVersions("0.2.10", "0.2.9") > 0);
  assert.ok(compareVersions("0.3", "0.2.9") > 0);
  assert.ok(compareVersions("1.0.0", "0.9.9") > 0);
  assert.ok(compareVersions("0.2.1", "0.2.2") < 0);
  assert.ok(compareVersions("0.2.2-rc1", "0.2.2") === 0);
  assert.ok(compareVersions("0.2", "0.2.0") === 0);
  assert.ok(compareVersions("", "0.2.2") < 0);
});

test("checkServerVersion accepts the floor and newer, refuses older and another API generation, ignores a failed read", async () => {
  const server = (version: string, api = "1") =>
    fakeFetch(() => ({ body: { name: "sofabaton-x-server", version, api_version: api } }));
  assert.equal(await checkServerVersion("http://nas:8480", server(MIN_SERVER_VERSION)), null);
  assert.equal(await checkServerVersion("http://nas:8480", server("0.9.0")), null);
  const old = await checkServerVersion("http://nas:8480", server("0.2.1"));
  assert.equal(old?.code, "server_too_old");
  assert.match(old?.message ?? "", /0\.2\.1/);
  assert.match(old?.message ?? "", new RegExp(MIN_SERVER_VERSION.replace(/\./g, "\\.")));
  const generation = await checkServerVersion("http://nas:8480", server("9.0.0", "2"));
  assert.equal(generation?.code, "server_too_old");
  assert.match(generation?.message ?? "", /generation 2/);
  assert.equal(await checkServerVersion("http://nas:8480", fakeFetch(() => new TypeError("Failed to fetch"))), null);
  assert.equal(await checkServerVersion("http://nas:8480", fakeFetch(() => ({ ok: false, status: 500, body: null }))), null);
  assert.equal(await checkServerVersion("http://nas:8480", fakeFetch(() => ({ body: "garbage" }))), null);
  const custom = await checkServerVersion("http://nas:8480", server("0.5.0"), "0.6.0");
  assert.equal(custom?.code, "server_too_old");
});

test("embedHtmlSnippet is the script and the element, with the layout inlined and attribute-safe", () => {
  const withLayout = embedHtmlSnippet({
    serverBase: "http://nas:8480/",
    hubId: "e26a44861b45",
    document: { show_dpad: false, custom_favorites: [{ name: "Marcel's <TV> & amp", command_id: 1, device_id: 2 }] },
  });
  assert.equal(
    withLayout,
    '<script type="module" src="http://nas:8480/ui/embed/sofabaton-remote.js"></script>\n' +
      "<sofabaton-remote hub=\"e26a44861b45\" config='" +
      '{"show_dpad":false,"custom_favorites":[{"name":"Marcel&#39;s &lt;TV> &amp; amp","command_id":1,"device_id":2}]}' +
      "'></sofabaton-remote>",
  );
  // What the browser reads back from that attribute is the document again.
  const attribute = withLayout.match(/config='([^']*)'/)?.[1] ?? "";
  const decoded = attribute.replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
  assert.deepEqual(JSON.parse(decoded), {
    show_dpad: false,
    custom_favorites: [{ name: "Marcel's <TV> & amp", command_id: 1, device_id: 2 }],
  });
  const empty = embedHtmlSnippet({ serverBase: "http://nas:8480", hubId: "e26a44861b45", document: {} });
  assert.match(empty, /config='\{\}'/);
  const serverLayout = embedHtmlSnippet({ serverBase: "http://nas:8480", hubId: "e26a44861b45" });
  assert.equal(serverLayout.includes("config="), false);
  assert.match(serverLayout, /<sofabaton-remote hub="e26a44861b45"><\/sofabaton-remote>$/);
});

test("unavailableBannerText names the server's error, a generic reason, or nothing", () => {
  assert.equal(unavailableBannerText(undefined, null), "The hub is not controllable right now (offline, disabled, or the Sofabaton app is connected).");
  assert.equal(unavailableBannerText({ state: "unavailable" }, "GET /status -> 504"), "The server cannot reach the hub (GET /status -> 504).");
  assert.equal(unavailableBannerText({ state: "on" }, "stale"), null);
});
