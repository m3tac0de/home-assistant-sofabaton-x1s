// The server adapter (docs/internal/web-remote-plan.md, R3): REST + one
// WebSocket stream in, the remote entity's attribute contract out. Fixture
// bodies follow sofabaton-x-server/openapi.json component shapes.

import assert from "node:assert/strict";
import nodeTest from "node:test";

import {
  SERVER_API_PREFIX,
  ServerRemoteBackend,
  type WebSocketLike,
} from "../../remote-card/src/backend/server-backend";
import { RemoteCardStore } from "../../remote-card/src/state/remote-card-store";

const HUB = "E2:6A:44:86:1B:45";
const BASE = "http://server.test";
const PREFIX = `${BASE}${SERVER_API_PREFIX}/hubs/${encodeURIComponent(HUB)}`;

type Body = unknown | ((init?: RequestInit) => unknown);

interface Rig {
  backend: ServerRemoteBackend;
  requests: Array<{ url: string; method: string; body: unknown }>;
  routes: Record<string, Body>;
  sockets: FakeSocket[];
}

class FakeSocket implements WebSocketLike {
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;
  constructor(public readonly url: string) {}
  close(): void {
    this.closed = true;
  }
  open(): void {
    this.onopen?.({});
  }
  push(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
  drop(): void {
    this.onclose?.({});
  }
}

const STATUS = {
  hub_id: HUB,
  enabled: true,
  status: {
    hub_connected: true,
    app_connected: false,
    controllable: true,
    mode: "control",
    hub_version: "x1s",
    proxy_enabled: true,
    running_activity: { activity_id: 101, name: "Watch TV" },
    activities_cached: 2,
    devices_cached: 2,
    catalog_ready: true,
  },
};

function defaultRoutes(): Record<string, Body> {
  return {
    "GET /status": STATUS,
    "GET /activities": [
      { activity_id: 101, name: "Watch TV", active: true, needs_confirm: false },
      { activity_id: 102, name: "Listen", active: false, needs_confirm: false },
    ],
    "GET /devices": [
      { device_id: 1, name: "TV", brand: "Sony", device_class: "ir", device_class_code: 1, power_state: 0, idle_behavior: 2 },
      { device_id: 2, name: "Amp", brand: "Denon", device_class: "ir", device_class_code: 1, power_state: 1, idle_behavior: null },
    ],
    "GET /activity": { activity_id: 101, name: "Watch TV" },
    "GET /entities/101/buttons": [
      { button_code: 174, name: "UP", device_id: 1, command_id: 17, long_press_device_id: null, long_press_command_id: null },
      { button_code: 175, name: "DOWN", device_id: 1, command_id: 18, long_press_device_id: 2, long_press_command_id: 5 },
    ],
    "GET /activities/101/macros": [{ command_id: 200, label: "All On" }],
    "GET /activities/101/favorites": [{ device_id: 1, command_id: 1, label: "Power" }],
    "GET /entities/102/buttons": [{ button_code: 151, name: "OK", device_id: 2, command_id: 3 }],
    "GET /activities/102/macros": [],
    "GET /activities/102/favorites": [],
    "GET /entities/1/buttons": [
      { button_code: 151, name: "OK", device_id: 1, command_id: 9, long_press_device_id: 1, long_press_command_id: 10 },
    ],
    "GET /devices/1/commands": [
      { command_id: 9, label: "Select" },
      { command_id: 10, label: "Menu" },
    ],
    "GET /devices/1/power-state": { device_id: 1, power_state: 0 },
    "GET /devices/2/power-state": { device_id: 2, power_state: null },
    "POST /send": {},
    "POST /activities/102/start": { accepted: true, mode: "control" },
    "POST /activities/101/stop": { accepted: true, mode: "control" },
  };
}

/** A gate a test can close to hold one route's answers until it opens it. */
class Gate {
  private waiters: Array<() => void> = [];
  private closed = false;
  hold(): void {
    this.closed = true;
  }
  release(): void {
    this.closed = false;
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((resolve) => resolve());
  }
  wait(): Promise<void> {
    if (!this.closed) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

function createRig(overrides: Record<string, Body> = {}, gates: Record<string, Gate> = {}): Rig {
  const routes = { ...defaultRoutes(), ...overrides };
  const requests: Rig["requests"] = [];
  const sockets: FakeSocket[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ url, method, body });
    const gateKey = Object.keys(gates).find((suffix) => url.endsWith(suffix));
    if (gateKey) await gates[gateKey].wait();
    // Any hub id: the re-key test moves the target mid-run. `GET /hubs`
    // (the hub list) is routed as "GET /hubs-list".
    const match = url === `${BASE}${SERVER_API_PREFIX}/hubs`
      ? [url, "/hubs-list"]
      : url.match(/^http:\/\/server\.test\/api\/v1\/hubs\/[^/]+(\/.*)$/);
    assert.ok(match, `unexpected url ${url}`);
    const key = `${method} ${match![1]}`;
    const route = routes[key];
    if (route === undefined) {
      return { ok: false, status: 404, json: async () => ({ type: "not_found" }) } as Response;
    }
    const payload = typeof route === "function" ? (route as (init?: RequestInit, url?: string) => unknown)(init, url) : route;
    if (payload === undefined) {
      return { ok: false, status: 404, json: async () => ({ type: "not_found" }) } as Response;
    }
    if (payload instanceof Error) {
      return { ok: false, status: 504, json: async () => ({ type: "timeout" }) } as Response;
    }
    return { ok: true, status: 200, json: async () => payload } as Response;
  }) as typeof fetch;
  const backend = new ServerRemoteBackend({
    baseUrl: BASE,
    fetch: fetchImpl,
    webSocket: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    reconnectDelayMs: 100,
  });
  // Every subscription is released when the file ends: a rig left in a
  // failed state keeps a retry timer armed, which would hold the runner open.
  const subscribe = backend.subscribe.bind(backend);
  backend.subscribe = (listener) => {
    const unsubscribe = subscribe(listener);
    OPEN_SUBSCRIPTIONS.push(unsubscribe);
    return unsubscribe;
  };
  return { backend, requests, routes, sockets };
}

const OPEN_SUBSCRIPTIONS: Array<() => void> = [];

/**
 * Every test releases the subscriptions it opened when it ends. A rig left
 * subscribed in a failed state keeps a retry timer armed, and node's test
 * runner only finishes the file once the event loop drains, so a root-level
 * after() hook would never get its turn.
 */
const test = (name: string, fn: () => Promise<void> | void) =>
  nodeTest(name, async () => {
    const mark = OPEN_SUBSCRIPTIONS.length;
    try {
      await fn();
    } finally {
      for (const unsubscribe of OPEN_SUBSCRIPTIONS.splice(mark)) unsubscribe();
    }
  });

const flush = async (rounds = 4) => {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

test("server adapter: initial load produces the entity attribute contract", async () => {
  const { backend, sockets } = createRig();
  backend.setTarget(HUB);
  // Nothing heard yet: a quiet loading entity, not an unavailable verdict.
  assert.equal(backend.snapshot()?.state, "off", "nothing loaded yet");
  assert.equal(backend.snapshot()?.attributes?.load_state, "loading");
  assert.deepEqual(backend.snapshot()?.attributes?.activities, []);
  const changes: number[] = [];
  backend.subscribe(() => changes.push(Date.now()));
  assert.equal(await backend.probeIntegration(), "x1s");
  await flush();

  const snapshot = backend.snapshot();
  assert.equal(snapshot?.state, "on");
  const attrs = snapshot?.attributes ?? {};
  assert.equal(attrs.hub_version, "X1S");
  assert.equal(attrs.current_activity, "Watch TV");
  assert.equal(attrs.current_activity_id, 101);
  assert.equal(attrs.load_state, "ready");
  assert.deepEqual(attrs.activities, [
    { id: 101, name: "Watch TV", state: "on" },
    { id: 102, name: "Listen", state: "off" },
  ]);
  assert.deepEqual(attrs.devices, [
    { id: 1, name: "TV", device_class: "ir" },
    { id: 2, name: "Amp", device_class: "ir" },
  ]);
  assert.deepEqual(attrs.assigned_keys, { "101": [174, 175] });
  assert.deepEqual(attrs.macro_keys, { "101": [{ id: 200, name: "All On" }] });
  assert.deepEqual(attrs.favorite_keys, { "101": [{ id: 1, name: "Power", device_id: 1 }] });
  assert.deepEqual(attrs.long_press_keys, { "101": { "175": { device_id: 2, command_id: 5 } } });
  assert.ok(changes.length >= 1, "subscribers were notified");
  assert.equal(sockets.length, 1);
  assert.equal(
    sockets[0].url,
    `ws://server.test${SERVER_API_PREFIX}/events?hub_id=${encodeURIComponent(HUB)}`,
  );
});

test("server adapter: load_state stays loading until the running activity's pages are in", async () => {
  const gate = new Gate();
  gate.hold();
  const { backend } = createRig({}, { "/entities/101/buttons": gate });
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  let snapshot = backend.snapshot();
  assert.equal(snapshot?.state, "on", "catalog and running activity are known");
  assert.equal(snapshot?.attributes?.current_activity_id, 101);
  assert.equal(snapshot?.attributes?.load_state, "loading", "keys not in yet");
  assert.deepEqual(snapshot?.attributes?.assigned_keys, {});

  gate.release();
  await flush();
  snapshot = backend.snapshot();
  assert.equal(snapshot?.attributes?.load_state, "ready");
  assert.deepEqual(snapshot?.attributes?.assigned_keys, { "101": [174, 175] });
});

test("server adapter: unavailable when the hub is not controllable or the load fails", async () => {
  const observed = createRig({
    "GET /status": { ...STATUS, status: { ...STATUS.status, controllable: false, mode: "observe", app_connected: true } },
  });
  observed.backend.setTarget(HUB);
  observed.backend.subscribe(() => undefined);
  await flush();
  assert.equal(observed.backend.snapshot()?.state, "unavailable");
  assert.equal(observed.backend.snapshot()?.attributes?.current_activity_id, null);
  assert.equal(observed.backend.snapshot()?.attributes?.activities?.length, 2, "catalog still listed");

  const failing = createRig({ "GET /status": new Error("timeout") });
  failing.backend.setTarget(HUB);
  failing.backend.subscribe(() => undefined);
  await flush();
  assert.equal(failing.backend.snapshot()?.state, "unavailable");
  assert.equal(failing.backend.snapshot()?.attributes?.load_state, "loading");
  assert.match(failing.backend.lastError ?? "", /504/);
  await assert.rejects(() => failing.backend.probeIntegration());
});

test("server adapter: sends, activity start/stop use the hub routes", async () => {
  const { backend, requests } = createRig();
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  requests.length = 0;

  await backend.sendCommand(174, 101);
  await backend.sendCommand(17, 1);
  await backend.sendCommand(174, null); // no scope: the running activity
  await backend.sendCommand("x", 101); // never sent
  await backend.startActivity({ id: null, name: "Listen" });
  await backend.stopActivity();
  assert.deepEqual(
    requests.map((request) => [request.method, request.url.slice(PREFIX.length), request.body]),
    [
      ["POST", "/send", { entity_id: 101, command_id: 174 }],
      ["POST", "/send", { entity_id: 1, command_id: 17 }],
      ["POST", "/send", { entity_id: 101, command_id: 174 }],
      ["POST", "/activities/102/start", undefined],
      ["POST", "/activities/101/stop", undefined],
    ],
  );
});

test("server adapter: device keymap and power state mirror the HA projections", async () => {
  const { backend, requests } = createRig();
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();

  const keymap = await backend.deviceKeymap(1);
  assert.deepEqual(keymap, {
    keymap: {
      device: { device_id: 1, name: "TV", device_class: "ir" },
      buttons: [151],
      bindings: [{ button_id: 151, button_name: "OK", command_id: 9, long_press_command_id: 10 }],
      commands: [
        { command_id: 9, name: "Select" },
        { command_id: 10, name: "Menu" },
      ],
      power_configured: true,
    },
  });
  // The device page's long-press pair joins the attribute contract.
  assert.deepEqual(backend.snapshot()?.attributes?.long_press_keys?.["1"], {
    "151": { device_id: 1, command_id: 10 },
  });
  const before = requests.length;
  await backend.deviceKeymap(1);
  assert.equal(requests.length, before, "second read served from the page cache");
  assert.deepEqual(await backend.deviceKeymap(99), { keymap: null, reason: "cache_miss" });

  assert.equal(await backend.devicePowerState(1), 0);
  assert.equal(await backend.devicePowerState(2), null);
  assert.equal(await backend.devicePowerState(99), null, "404 reads as unreadable");
});

test("server adapter: stream events move the running activity and reload on catalog changes", async () => {
  const { backend, sockets, routes, requests } = createRig();
  backend.setTarget(HUB);
  const changes: string[] = [];
  backend.subscribe(() => changes.push(String(backend.snapshot()?.attributes?.current_activity_id)));
  await flush();
  const socket = sockets[0];
  socket.open();
  await flush();

  socket.push({
    type: "hub_event",
    hub_id: HUB,
    event: { seq: 7, kind: "activity_changed", payload: { activity_id: 102, previous_activity_id: 101, name: "Listen" } },
  });
  await flush();
  assert.equal(backend.snapshot()?.attributes?.current_activity_id, 102);
  assert.equal(backend.snapshot()?.attributes?.current_activity, "Listen");
  assert.deepEqual(backend.snapshot()?.attributes?.assigned_keys, { "101": [174, 175], "102": [151] });
  assert.equal(backend.snapshot()?.attributes?.activities?.[1]?.state, "on");

  socket.push({
    type: "hub_event",
    hub_id: HUB,
    event: { seq: 8, kind: "activity_changed", payload: { activity_id: null, previous_activity_id: 102, name: null } },
  });
  await flush();
  assert.equal(backend.snapshot()?.state, "off");
  assert.equal(backend.snapshot()?.attributes?.current_activity_id, null);

  // Another hub's events are ignored.
  socket.push({ type: "hub_event", hub_id: "other", event: { seq: 1, kind: "activity_changed", payload: { activity_id: 101 } } });
  await flush();
  assert.equal(backend.snapshot()?.attributes?.current_activity_id, null);

  // A snapshot change naming activity 101 drops its page and re-reads the catalog.
  routes["GET /activities"] = [
    { activity_id: 101, name: "Watch Movies", active: false, needs_confirm: false },
    { activity_id: 102, name: "Listen", active: false, needs_confirm: false },
  ];
  routes["GET /entities/101/buttons"] = [{ button_code: 190, name: "MENU", device_id: 1, command_id: 30 }];
  routes["GET /activity"] = { activity_id: 101, name: "Watch Movies" };
  requests.length = 0;
  socket.push({
    type: "hub_event",
    hub_id: HUB,
    event: { seq: 9, kind: "snapshot_changed", payload: { snapshot_id: "s2", engine_generation: 3, device_ids: [], activity_ids: [101] } },
  });
  await flush();
  assert.equal(backend.snapshot()?.attributes?.activities?.[0]?.name, "Watch Movies");
  assert.deepEqual(backend.snapshot()?.attributes?.assigned_keys?.["101"], [190]);
  assert.deepEqual(backend.snapshot()?.attributes?.assigned_keys?.["102"], [151], "untouched page kept");

  // hub_state down: status re-read; the fixture now says disconnected.
  routes["GET /status"] = { ...STATUS, status: { ...STATUS.status, hub_connected: false, controllable: false, mode: "disconnected" } };
  socket.push({ type: "hub_event", hub_id: HUB, event: { seq: 10, kind: "hub_state", payload: { connected: false } } });
  await flush();
  assert.equal(backend.snapshot()?.state, "unavailable");
  assert.ok(changes.length >= 4);
});

test("server adapter: a dropped socket reconnects with backoff and reloads; unsubscribe stops it", async () => {
  const { backend, sockets, requests } = createRig();
  backend.setTarget(HUB);
  const unsubscribe = backend.subscribe(() => undefined);
  await flush();
  sockets[0].open();
  await flush();
  requests.length = 0;
  sockets[0].drop();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(sockets.length, 2, "reconnected after the first delay");
  sockets[1].open();
  await flush();
  assert.ok(
    requests.some((request) => request.url.endsWith("/status")),
    "reconnect reloads the state",
  );
  unsubscribe();
  assert.equal(sockets[1].closed, true);
  sockets[1].drop();
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(sockets.length, 2, "no reconnect once stopped");
});

test("server adapter: retargeting resets state and reconnects", async () => {
  const { backend, sockets } = createRig();
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  assert.equal(backend.snapshot()?.state, "on");
  backend.setTarget("AA:BB");
  // A new target is a new first load: quiet, not unavailable.
  assert.equal(backend.snapshot()?.state, "off");
  assert.equal(backend.snapshot()?.attributes?.load_state, "loading");
  assert.deepEqual(backend.snapshot()?.attributes?.activities, []);
  assert.equal(sockets[0].closed, true);
  await flush();
  assert.equal(sockets.length, 2);
  assert.match(sockets[1].url, /hub_id=AA%3ABB$/);
});

test("store over the server adapter: the card's derivations run unchanged", async () => {
  const { backend, requests } = createRig();
  let changes = 0;
  const store = new RemoteCardStore(() => (changes += 1), { fireEvent: () => undefined });
  store.setConfig({ entity: HUB });
  store.setBackend(backend);
  await flush();

  assert.equal(store.hass, null);
  assert.equal(store.hubVersion(), "X1S");
  assert.equal(store.isX2(), false);
  assert.equal(store.currentActivityId(), 101);
  assert.equal(store.currentActivityLabel(), "Watch TV");
  assert.deepEqual(store.activities().map((activity) => activity.id), [101, 102]);
  assert.equal(store.deviceModeAvailable(), true);
  const derived = store.deriveRuntimeState();
  assert.equal(derived.isUnavailable, false);
  assert.deepEqual(derived.rawAssignedKeys, [174, 175]);
  assert.equal(store.isEnabled(174), true);
  assert.equal(store.isEnabled(151), false, "not on the activity's page");
  assert.deepEqual(store.longPressBindingForButton(175, 101), { device_id: 2, command_id: 5 });
  assert.equal(store.longPressBindingForButton(174, 101), null);

  requests.length = 0;
  await store.sendCommand(174);
  await store.sendLongPress(175, 101);
  await store.setActivity("Listen");
  assert.deepEqual(
    requests.map((request) => [request.url.slice(PREFIX.length), request.body]),
    [
      ["/send", { entity_id: 101, command_id: 174 }],
      ["/send", { entity_id: 2, command_id: 5 }],
      ["/activities/102/start", undefined],
    ],
  );
  assert.ok(changes > 0);
  store.disconnected();
});

test("server adapter: disable, dropped notices and a re-key are followed", async () => {
  const { backend, sockets, routes, requests } = createRig();
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  sockets[0].open();
  await flush();

  // hub_disabled: status is re-read; enabled=false makes the remote unavailable.
  routes["GET /status"] = { ...STATUS, enabled: false, status: null };
  sockets[0].push({ type: "server_event", hub_id: HUB, kind: "hub_disabled" });
  await flush();
  assert.equal(backend.snapshot()?.state, "unavailable");
  routes["GET /status"] = STATUS;
  sockets[0].push({ type: "server_event", hub_id: HUB, kind: "hub_enabled" });
  await flush();
  assert.equal(backend.snapshot()?.state, "on");

  // dropped: everything may have changed while the queue overflowed.
  requests.length = 0;
  sockets[0].push({ type: "dropped", count: 12 });
  await flush();
  assert.ok(requests.some((request) => request.url.endsWith("/activities")), "catalog reloaded");

  // hub_removed: nothing to show any more.
  sockets[0].push({ type: "server_event", hub_id: HUB, kind: "hub_removed" });
  await flush();
  assert.equal(backend.snapshot()?.state, "unavailable");
});

test("server adapter: a re-key moves the target to the hub's new id", async () => {
  const { backend, sockets, requests } = createRig();
  const NEW = "e26a44861b45";
  backend.setTarget("192.168.1.50");
  backend.subscribe(() => undefined);
  await flush();
  sockets[0].open();
  await flush();
  requests.length = 0;
  sockets[0].push({ type: "server_event", hub_id: NEW, kind: "hub_rekeyed" });
  await flush();
  assert.equal(backend.target, NEW);
  assert.ok(
    requests.some((request) => request.url.includes(`/hubs/${NEW}/`)),
    "reloaded under the new id",
  );
  assert.equal(backend.snapshot()?.state, "on");
});

test("server adapter: a disabled hub is unavailable, not unreachable, and loads once enabled", async () => {
  const DISABLED = { ...STATUS, enabled: false, status: null };
  const { backend, sockets, routes, requests } = createRig({
    "GET /status": DISABLED,
    // Every other read answers 409 while the hub is disabled.
    "GET /activities": new Error("409"),
    "GET /devices": new Error("409"),
    "GET /activity": new Error("409"),
  });
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  assert.equal(backend.snapshot()?.state, "unavailable");
  assert.equal(backend.lastError, null, "a disabled hub is not a reachability error");
  assert.equal(backend.snapshot()?.attributes?.load_state, "ready");
  assert.ok(!requests.some((request) => request.url.endsWith("/activities")), "catalog not read while disabled");

  sockets[0].open();
  await flush();
  routes["GET /status"] = STATUS;
  routes["GET /activities"] = defaultRoutes()["GET /activities"];
  routes["GET /devices"] = defaultRoutes()["GET /devices"];
  routes["GET /activity"] = defaultRoutes()["GET /activity"];
  sockets[0].push({ type: "server_event", hub_id: HUB, kind: "hub_enabled" });
  await flush(8);
  assert.equal(backend.snapshot()?.state, "on");
  assert.equal(backend.snapshot()?.attributes?.activities?.length, 2, "catalog loaded on enable");

  // Disabled again mid-run: the catalog is kept, the remote goes unavailable.
  routes["GET /status"] = DISABLED;
  routes["GET /activity"] = new Error("409");
  sockets[0].push({ type: "server_event", hub_id: HUB, kind: "hub_disabled" });
  await flush();
  assert.equal(backend.snapshot()?.state, "unavailable");
  assert.equal(backend.lastError, null);
  assert.equal(backend.snapshot()?.attributes?.activities?.length, 2);
});

// ---------- ordering rules (review of the R3 build) ----------

test("server adapter: a reload requested mid-load supersedes the load in flight", async () => {
  const gate = new Gate();
  const { backend, sockets, routes, requests } = createRig({}, { "/activities": gate });
  gate.hold();
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  // The first load is stuck on /activities with the old catalog answer pending.
  routes["GET /activities"] = [
    { activity_id: 101, name: "Watch TV", active: true, needs_confirm: false },
    { activity_id: 102, name: "Listen", active: false, needs_confirm: false },
    { activity_id: 103, name: "Music", active: false, needs_confirm: false },
  ];
  sockets[0].open();
  sockets[0].push({ type: "hub_event", hub_id: HUB, event: { seq: 5, kind: "catalog_ready", payload: { ready: true } } });
  await flush();
  const before = requests.filter((request) => request.url.endsWith("/activities")).length;
  gate.release();
  await flush(8);
  assert.equal(backend.snapshot()?.attributes?.activities?.length, 3, "the superseding load's catalog won");
  assert.ok(
    requests.filter((request) => request.url.endsWith("/activities")).length > before,
    "the load ran again after the event",
  );
  assert.equal(backend.snapshot()?.attributes?.load_state, "ready");
});

test("server adapter: a stale /activity answer never reverts a newer activity_changed", async () => {
  const gate = new Gate();
  const { backend, sockets } = createRig({}, { "/activity": gate });
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  sockets[0].open();
  await flush();
  // A status refresh is in flight and its /activity read is held.
  gate.hold();
  sockets[0].push({ type: "hub_event", hub_id: HUB, event: { seq: 6, kind: "status_changed", payload: { mode: "control", previous_mode: "control" } } });
  await flush();
  sockets[0].push({
    type: "hub_event",
    hub_id: HUB,
    event: { seq: 7, kind: "activity_changed", payload: { activity_id: 102, previous_activity_id: 101, name: "Listen" } },
  });
  await flush();
  assert.equal(backend.snapshot()?.attributes?.current_activity_id, 102);
  gate.release(); // the held answer still says 101
  await flush(6);
  assert.equal(backend.snapshot()?.attributes?.current_activity_id, 102, "the stream event is newer than the answer");
});

test("server adapter: a failed load is retried on reconnect and by the retry timer", async () => {
  const { backend, sockets, routes, requests } = createRig({ "GET /status": new Error("down") });
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  assert.equal(backend.snapshot()?.state, "unavailable");
  assert.match(backend.lastError ?? "", /504/);

  // The server comes back: the socket opens and the page reloads.
  routes["GET /status"] = STATUS;
  requests.length = 0;
  sockets[0].open();
  await flush(6);
  assert.equal(backend.snapshot()?.state, "on");
  assert.ok(requests.some((request) => request.url.endsWith("/status")));

  // A load that fails with the socket already up is retried on its own.
  routes["GET /status"] = new Error("blip");
  sockets[0].push({ type: "dropped", count: 1 });
  await flush();
  assert.equal(backend.snapshot()?.state, "unavailable");
  routes["GET /status"] = STATUS;
  await new Promise((resolve) => setTimeout(resolve, 150));
  await flush(6);
  assert.equal(backend.snapshot()?.state, "on", "the retry timer reloaded");
});

test("server adapter: snapshot_changed re-reads an open device page and bumps its version", async () => {
  const { backend, sockets, routes } = createRig();
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  sockets[0].open();
  await flush();
  assert.deepEqual((await backend.deviceKeymap(1))?.keymap?.commands.map((c) => c.name), ["Select", "Menu"]);
  assert.equal(backend.snapshot()?.attributes?.keymap_versions?.["1"], 1);
  assert.deepEqual(backend.snapshot()?.attributes?.long_press_keys?.["1"], { "151": { device_id: 1, command_id: 10 } });

  routes["GET /devices/1/commands"] = [{ command_id: 9, label: "Select" }, { command_id: 10, label: "Menu" }, { command_id: 11, label: "Guide" }];
  routes["GET /entities/1/buttons"] = [{ button_code: 151, name: "OK", device_id: 1, command_id: 9, long_press_device_id: 1, long_press_command_id: 11 }];
  sockets[0].push({
    type: "hub_event",
    hub_id: HUB,
    event: { seq: 9, kind: "snapshot_changed", payload: { snapshot_id: "s3", engine_generation: 4, device_ids: [1], activity_ids: [] } },
  });
  await flush(8);
  assert.equal(backend.snapshot()?.attributes?.keymap_versions?.["1"], 2, "version bumped after the re-read");
  assert.deepEqual(backend.snapshot()?.attributes?.long_press_keys?.["1"], { "151": { device_id: 1, command_id: 11 } });
  assert.deepEqual((await backend.deviceKeymap(1))?.keymap?.commands.map((c) => c.name), ["Select", "Menu", "Guide"]);
});

test("server adapter: a failed activity page is retried while the activity runs", async () => {
  const { backend, sockets, routes } = createRig({ "GET /entities/101/buttons": new Error("502") });
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush(6);
  sockets[0].open();
  await flush(6);
  assert.equal(backend.snapshot()?.attributes?.assigned_keys?.["101"], undefined, "page missing after the failure");
  routes["GET /entities/101/buttons"] = defaultRoutes()["GET /entities/101/buttons"];
  await new Promise((resolve) => setTimeout(resolve, 150));
  await flush(6);
  assert.deepEqual(backend.snapshot()?.attributes?.assigned_keys?.["101"], [174, 175], "retried and landed");
});

test("server adapter: a status read under the old id cannot clobber the re-keyed load", async () => {
  const gate = new Gate();
  const { backend, sockets } = createRig({}, { "/hubs/192.168.1.50/status": gate });
  backend.setTarget("192.168.1.50");
  backend.subscribe(() => undefined);
  await flush();
  sockets[0].open();
  await flush(6);
  gate.hold();
  sockets[0].push({ type: "hub_event", hub_id: "192.168.1.50", event: { seq: 2, kind: "hub_state", payload: { connected: true } } });
  await flush();
  sockets[0].push({ type: "server_event", hub_id: "e26a44861b45", kind: "hub_rekeyed" });
  await flush(6);
  assert.equal(backend.target, "e26a44861b45");
  assert.equal(backend.snapshot()?.state, "on");
  gate.release();
  await flush(6);
  assert.equal(backend.snapshot()?.state, "on", "the old-id answer was discarded");
  assert.equal(backend.lastError, null);
});

test("server adapter: deviceKeymap says 'not yet' until the catalog is loaded from a healthy hub", async () => {
  const gate = new Gate();
  const { backend } = createRig({}, { "/activities": gate });
  gate.hold();
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  const pending = backend.deviceKeymap(1);
  await flush();
  gate.release();
  assert.notEqual(await pending, null, "resolves once the load completes");

  const failing = createRig({ "GET /status": new Error("down") });
  failing.backend.setTarget(HUB);
  failing.backend.subscribe(() => undefined);
  await flush();
  assert.equal(await failing.backend.deviceKeymap(1), null, "a failed load is not a cache miss");
  assert.equal(await failing.backend.deviceKeymap(99), null);
});

test("server adapter: bursts of status events coalesce to one refresh plus one pending", async () => {
  const { backend, sockets, requests } = createRig();
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  sockets[0].open();
  await flush(6);
  requests.length = 0;
  for (const kind of ["hub_state", "status_changed", "app_state", "status_changed"]) {
    sockets[0].push({ type: "hub_event", hub_id: HUB, event: { seq: 1, kind, payload: {} } });
  }
  await flush(8);
  const statusReads = requests.filter((request) => request.url.endsWith("/status")).length;
  assert.ok(statusReads >= 1 && statusReads <= 2, `expected 1-2 status reads, got ${statusReads}`);
});

test("server adapter: a reload during an activity-page read starts its own read (CR-F4a-4)", async () => {
  const gate = new Gate();
  const { backend, sockets } = createRig({}, { "/entities/102/buttons": gate });
  backend.setTarget(HUB);
  backend.subscribe(() => undefined);
  await flush();
  sockets[0].open();
  await flush();
  gate.hold();
  // The hub switches to an activity whose pages are not read yet...
  sockets[0].push({
    type: "hub_event",
    hub_id: HUB,
    event: { seq: 7, kind: "activity_changed", payload: { activity_id: 102, previous_activity_id: 101, name: "Listen" } },
  });
  await flush();
  // ...and a reload lands while that read is still out.
  sockets[0].push({ type: "hub_event", hub_id: HUB, event: { seq: 8, kind: "catalog_ready", payload: { ready: true } } });
  await flush();
  gate.release();
  await flush(10);
  assert.equal(backend.snapshot()?.attributes?.load_state, "ready");
});

test("server adapter: a re-key missed while the socket was down is found by host (CR-X3-2)", async () => {
  const HOST = "192.168.1.50";
  const NEW = "e26a44861b45";
  const { backend, sockets, routes } = createRig();
  routes["GET /status"] = (_init?: RequestInit, url?: string) =>
    String(url).includes(`/hubs/${encodeURIComponent(HOST)}/`) ? undefined : STATUS;
  routes["GET /hubs-list"] = [{ hub_id: NEW, enabled: true, config: { host: HOST } }];
  let notified = 0;
  backend.setTarget(HOST);
  backend.subscribe(() => { notified += 1; });
  await flush(10);
  assert.equal(backend.target, NEW);
  assert.ok(notified > 0);
  assert.equal(backend.snapshot()?.state, "on");
  // The socket follows the hub to its new id.
  assert.ok(sockets.at(-1)!.url.endsWith(`hub_id=${NEW}`));
});

test("server adapter: a refused command is recorded for the host's banner (CR-F4a-7)", async () => {
  const { backend, sockets, routes } = createRig();
  backend.setTarget(HUB);
  let notified = 0;
  backend.subscribe(() => { notified += 1; });
  await flush();
  sockets[0].open();
  await flush();
  delete routes["POST /send"]; // the server answers 404
  const before = notified;
  await assert.rejects(backend.sendCommand(17, 101));
  assert.equal(backend.controlRefused, true);
  assert.ok(notified > before);
});

test("store: a refused activity switch ends the wait instead of holding the keys (CR-F4a-7)", () => {
  const store = new RemoteCardStore(() => undefined, { fireEvent: () => undefined });
  store.startActivityLoading("Listen");
  assert.equal((store as unknown as { activityLoadActive: boolean }).activityLoadActive, true);
  store.controlFailed();
  assert.equal((store as unknown as { activityLoadActive: boolean }).activityLoadActive, false);
});
