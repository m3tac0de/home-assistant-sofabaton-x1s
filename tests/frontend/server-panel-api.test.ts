// The control panel's API client (docs/internal/server-panel-plan.md, P3):
// URL building, bodies and headers, the Problem text, the OpenAPI
// operation list. Runs over a fake fetch; no DOM.

import assert from "node:assert/strict";
import test from "node:test";

import { PanelApi, problemText, serverBaseFromPanelUrl, type ApiResponse } from "../../server-panel/src/panel-api";

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function fakeFetch(answer: (url: string, init?: RequestInit) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const a = answer(url, init);
    const text = a.body === undefined ? null : typeof a.body === "string" ? a.body : JSON.stringify(a.body);
    return new Response(text, { status: a.status, headers: a.headers ?? { "content-type": "application/json" } });
  };
  return { calls, fetchImpl };
}

test("serverBaseFromPanelUrl strips the /ui/ page path, keeping a root path", () => {
  assert.equal(serverBaseFromPanelUrl("http://host:8480/ui/"), "http://host:8480");
  assert.equal(serverBaseFromPanelUrl("https://home.example/sofabaton/ui/#hubs"), "https://home.example/sofabaton");
  assert.equal(serverBaseFromPanelUrl("http://127.0.0.1:4173/pkg/sofabaton_server/ui/panel/index.html"), "http://127.0.0.1:4173/pkg/sofabaton_server");
  assert.equal(serverBaseFromPanelUrl("http://host/elsewhere/index.html"), "http://host");
});

test("urls are built under the API root, with the query normalised", () => {
  const api = new PanelApi("http://host:8480/");
  assert.equal(api.apiRoot, "http://host:8480/api/v1");
  assert.equal(api.url("hubs"), "http://host:8480/api/v1/hubs");
  assert.equal(api.url("/hubs/x/status"), "http://host:8480/api/v1/hubs/x/status");
  assert.equal(api.url("hubs", "after=1&limit=5"), "http://host:8480/api/v1/hubs?after=1&limit=5");
  assert.equal(api.url("hubs", "?a=b"), "http://host:8480/api/v1/hubs?a=b");
  assert.equal(api.remoteUrl("e26a44861b45"), "http://host:8480/ui/remote/?hub=e26a44861b45");
  assert.equal(api.remoteUrl(null), "http://host:8480/ui/remote/");
});

test("a JSON body is serialised with its content type; a raw body is sent as typed", async () => {
  const { calls, fetchImpl } = fakeFetch(() => ({ status: 201, body: { hub_id: "h" } }));
  const api = new PanelApi("http://host", fetchImpl);
  const created = await api.addHub({ host: "192.168.1.50", enabled: true });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body, { hub_id: "h" });
  assert.equal(calls[0].url, "http://host/api/v1/hubs");
  assert.equal(calls[0].init?.method, "POST");
  assert.equal((calls[0].init?.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.equal(calls[0].init?.body, '{"host":"192.168.1.50","enabled":true}');

  await api.request("PUT", "x", { rawBody: "{}", headers: { "content-type": "text/plain" } });
  assert.equal((calls[1].init?.headers as Record<string, string>)["content-type"], "text/plain");
  assert.equal(calls[1].init?.body, "{}");

  await api.request("GET", "x", { rawBody: "" });
  assert.equal(calls[2].init?.body, undefined);
});

test("responses carry status, headers and the parsed body, or null when not JSON", async () => {
  const { fetchImpl } = fakeFetch((url) =>
    url.endsWith("/plain") ? { status: 200, body: "not json", headers: { "content-type": "text/plain", "x-a": "1" } } : { status: 204 },
  );
  const api = new PanelApi("http://host", fetchImpl);
  const plain = await api.request("GET", "plain");
  assert.equal(plain.ok, true);
  assert.equal(plain.body, null);
  assert.equal(plain.text, "not json");
  assert.deepEqual(plain.headers.find(([k]) => k === "x-a"), ["x-a", "1"]);
  const empty = await api.removeHub("h");
  assert.equal(empty.status, 204);
  assert.equal(empty.body, null);
});

test("the lifecycle and document routes hit the documented paths", async () => {
  const { calls, fetchImpl } = fakeFetch(() => ({ status: 200, body: {} }));
  const api = new PanelApi("http://host", fetchImpl);
  await api.enableHub("a b");
  await api.disableHub("h");
  await api.removeHub("h");
  await api.discoveredHubs();
  await api.scan(7);
  await api.remoteCardDocument("h");
  await api.putRemoteCardDocument("h", { show_dpad: true });
  await api.deleteRemoteCardDocument("h");
  await api.resyncRemote("h");
  assert.deepEqual(
    calls.map((c) => `${c.init?.method} ${c.url.slice("http://host/api/v1".length)}`),
    [
      "POST /hubs/a%20b/enable",
      "POST /hubs/h/disable",
      "DELETE /hubs/h",
      "GET /discovery/hubs",
      "POST /discovery/scan",
      "GET /hubs/h/ui/remote-card",
      "PUT /hubs/h/ui/remote-card",
      "DELETE /hubs/h/ui/remote-card",
      "POST /hubs/h/resync-remote",
    ],
  );
  assert.equal(calls[4].init?.body, '{"timeout":7}');
  assert.equal(calls[6].init?.body, '{"document":{"show_dpad":true}}');
});

test("problemText reads title and detail, humanizing the type only without a title, falling back to the status", () => {
  const mk = (status: number, body: unknown): ApiResponse => ({ ok: false, status, statusText: "", headers: [], text: "", body });
  assert.equal(problemText(mk(409, { type: "hub_conflict", title: "Hub already registered", status: 409, detail: "hub already registered as x" })), "Hub already registered: hub already registered as x");
  assert.equal(problemText(mk(404, { type: "hub_not_found", title: "Unknown hub", status: 404, detail: null })), "Unknown hub");
  assert.equal(problemText(mk(404, { type: "hub_not_found", status: 404 })), "Hub not found");
  assert.equal(problemText(mk(500, { title: "Boom", status: 500 })), "Boom");
  assert.equal(problemText(mk(502, null)), "HTTP 502");
  assert.equal(problemText(mk(503, "text")), "HTTP 503");
});

test("operations come from the OpenAPI document, relative to the API root, sorted", async () => {
  const { fetchImpl } = fakeFetch(() => ({
    status: 200,
    body: {
      paths: {
        "/api/v1/hubs/{hub_id}/status": { get: { operationId: "getStatus", summary: "Status" } },
        "/api/v1/hubs": {
          post: { operationId: "addHub", summary: "Register", requestBody: {} },
          get: { operationId: "listHubs", summary: "List" },
        },
      },
    },
  }));
  const api = new PanelApi("http://host/root", fetchImpl);
  const ops = await api.operations();
  assert.deepEqual(
    ops.map((o) => `${o.method} ${o.path} ${o.hasBody ? "body" : "-"} ${o.summary}`),
    ["GET /hubs - List", "POST /hubs body Register", "GET /hubs/{hub_id}/status - Status"],
  );
});
