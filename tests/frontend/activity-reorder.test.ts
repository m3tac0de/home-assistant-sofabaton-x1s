import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setMaxListeners } from "node:events";

// See control-panel-store.test.ts for why this is needed with node:test hooks.
setMaxListeners(0);
import { ControlPanelStore } from "../../custom_components/sofabaton_x1s/www/src/state/control-panel-store";
import { hubActivities, hubDevices } from "../../custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors";
import type { CacheHubState, HassLike } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const baseState = {
  persistent_cache_enabled: true,
  tools_frontend_version: "dev",
  hubs: [
    {
      entry_id: "hub-1",
      name: "Living Room",
      activity_count: 3,
      device_count: 1,
      settings: {
        proxy_enabled: false,
        hex_logging_enabled: false,
        wifi_device_enabled: false,
      },
    },
  ],
};

const baseContents = {
  enabled: true,
  hubs: [
    {
      entry_id: "hub-1",
      name: "Living Room",
      activities: [
        { id: 101, name: "Watch TV" },
        { id: 102, name: "Play Xbox" },
        { id: 103, name: "Listen Music" },
      ],
      devices_list: [],
    },
  ],
};

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.has(key) ? this.values.get(key) ?? null : null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const liveStores: { disconnected(): void }[] = [];

beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
});

afterEach(() => {
  while (liveStores.length) {
    const store = liveStores.pop();
    try { store?.disconnected(); } catch { /* ignore teardown errors */ }
  }
  for (const [name, descriptor] of [
    ["window", originalWindowDescriptor],
    ["localStorage", originalLocalStorageDescriptor],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete (globalThis as Record<string, unknown>)[name];
  }
});

function createHass(
  handlers: Record<string, (message: Record<string, unknown>) => unknown | Promise<unknown>> = {},
): HassLike {
  return {
    states: {},
    async callWS<T>(message: Record<string, unknown>) {
      const type = String(message.type ?? "");
      const handler = handlers[type];
      if (handler) return (await handler(message)) as T;
      if (type === "sofabaton_x1s/control_panel/state") return baseState as T;
      if (type === "sofabaton_x1s/persistent_cache/contents") return baseContents as T;
      return { ok: true } as T;
    },
    connection: null,
  };
}

function createStore() {
  const store = new ControlPanelStore(() => undefined, { loadedFrontendVersion: "dev" });
  liveStores.push(store);
  return store;
}

test("hubActivities follows the hub's stored sort order, zeros last by id", () => {
  const hub = {
    entry_id: "hub-1",
    activities: [
      { id: 101, name: "Watch TV", sort: 3 },
      { id: 102, name: "Play Xbox", sort: 1 },
      { id: 103, name: "Listen Music", sort: 2 },
      { id: 105, name: "New Later" },
      { id: 104, name: "New Earlier", sort: 0 },
    ],
  } as CacheHubState;

  assert.deepEqual(
    hubActivities(hub).map((activity) => activity.id),
    [102, 103, 101, 104, 105],
  );
});

test("hubActivities keeps id order when the hub never stored an order", () => {
  const hub = {
    entry_id: "hub-1",
    activities: [
      { id: 103, name: "C", sort: 0 },
      { id: 101, name: "A", sort: 0 },
      { id: 102, name: "B" },
    ],
  } as CacheHubState;

  assert.deepEqual(
    hubActivities(hub).map((activity) => activity.id),
    [101, 102, 103],
  );
});

test("hubDevices follows the hub's stored sort order, ties and zeros by id", () => {
  // Real hubs restamp the sort byte only on reorder, so lists carry ties
  // (devices added since the last reorder share a value) and zeros.
  const hub = {
    entry_id: "hub-1",
    devices_list: [
      { id: 8, name: "testing", sort: 13 },
      { id: 10, name: "Lights", sort: 8 },
      { id: 9, name: "Sonytst", sort: 8 },
      { id: 2, name: "Philips hue", sort: 2 },
      { id: 1, name: "AWOLVision", sort: 1 },
      { id: 3, name: "Zebra", sort: 0 },
    ],
  } as CacheHubState;

  assert.deepEqual(
    hubDevices(hub).map((device) => device.id),
    [1, 2, 9, 10, 8, 3],
  );
});

test("reorderActivities sends the full ordered id list and reloads state", async () => {
  const calls: Record<string, unknown>[] = [];
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/activity/reorder": (message) => {
        calls.push(message);
        return { status: "success", ordered_ids: message.ordered_ids };
      },
    }),
  );
  await store.loadState();

  const failure = await store.reorderActivities([103, 101, 102]);

  assert.equal(failure, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].entry_id, "hub-1");
  assert.deepEqual(calls[0].ordered_ids, [103, 101, 102]);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});

test("reorderActivities surfaces the backend failure message", async () => {
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/activity/reorder": () => {
        throw new Error("The hub did not confirm the new activity order");
      },
    }),
  );
  await store.loadState();

  const failure = await store.reorderActivities([103, 101, 102]);

  assert.match(String(failure), /did not confirm the new activity order/);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});

test("reorderDevices sends the full ordered id list and reloads state", async () => {
  const calls: Record<string, unknown>[] = [];
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/device/reorder": (message) => {
        calls.push(message);
        return { status: "success", ordered_ids: message.ordered_ids };
      },
    }),
  );
  await store.loadState();

  const failure = await store.reorderDevices([3, 1, 2]);

  assert.equal(failure, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].entry_id, "hub-1");
  assert.deepEqual(calls[0].ordered_ids, [3, 1, 2]);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});

test("reorderDevices surfaces the backend failure message", async () => {
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/device/reorder": () => {
        throw new Error("The hub did not confirm the new device order");
      },
    }),
  );
  await store.loadState();

  const failure = await store.reorderDevices([3, 1, 2]);

  assert.match(String(failure), /did not confirm the new device order/);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});

test("createActivity resolves the assigned id and refreshes its cache entry", async () => {
  const refreshCalls: Record<string, unknown>[] = [];
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/activity/create": (message) => {
        assert.equal(message.name, "Movie Night");
        return { status: "success", activity_id: 105 };
      },
      "sofabaton_x1s/persistent_cache/refresh": (message) => {
        refreshCalls.push(message);
        return { ok: true };
      },
    }),
  );
  await store.loadState();

  const result = await store.createActivity("Movie Night");

  assert.deepEqual(result, { activityId: 105 });
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].kind, "activity");
  assert.equal(refreshCalls[0].target_id, 105);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});

test("createActivity reports the backend error without opening the editor id", async () => {
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/activity/create": () => {
        throw new Error("The hub did not confirm creation of the new activity");
      },
    }),
  );
  await store.loadState();

  const result = await store.createActivity("Movie Night");

  assert.ok("error" in result);
  assert.match(String((result as { error: string }).error), /did not confirm creation/);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});
