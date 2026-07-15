import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setMaxListeners } from "node:events";

// node:test in Node 20.2 attaches a fresh abort listener to the parent test
// AbortSignal per hook invocation (TestHook.run does `once(signal, 'abort')`
// without ever removing it). With our 12 tests × 2 hooks each that pushes past
// EventTarget's default 10-listener warning threshold and trips
// MaxListenersExceededWarning. This is a runner bug, not a real leak — but the
// warning surfaces as a fake "1 fail" in directory-mode summaries. Bumping the
// signal's allowed listener count to unlimited makes the warning (and the
// noisy fake failure) go away.
setMaxListeners(0);
import { ControlPanelStore } from "../../custom_components/sofabaton_x1s/www/src/state/control-panel-store";
import { deviceClassIcon, resolveRuntimeState } from "../../custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors";
import type { HassLike } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const VIEW_STATE_STORAGE_KEY = "sofabaton_x1s:tools_card:view_state:v1";

const baseState = {
  persistent_cache_enabled: true,
  tools_frontend_version: "dev",
  hubs: [
    {
      entry_id: "hub-1",
      name: "Living Room",
      activity_count: 2,
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
      activities: [{ id: 101, name: "Watch TV" }],
      devices_list: [{ id: 1, name: "Television", command_count: 2 }],
      buttons: { "101": [174, 175] },
      commands: { "1": { "10": "Power Toggle" } },
      activity_favorites: { "101": [{ button_id: 10, command_id: 10, device_id: 1, label: "Power" }] },
      activity_macros: { "101": [{ command_id: 11, label: "Macro" }] },
    },
  ],
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.has(key) ? this.values.get(key) ?? null : null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

type TestGlobals = typeof globalThis & {
  window?: { localStorage?: StorageLike };
  localStorage?: StorageLike;
};

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

function installStorage() {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { localStorage: storage },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage,
  });
  return storage;
}

function restoreGlobal(name: "window" | "localStorage", descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }
  delete (globalThis as TestGlobals)[name];
}

// Stores started via createStore() register themselves here so afterEach can
// call disconnected() on them. Without that teardown, each test leaves a
// repeating runtime-state-poll setTimeout alive; Node's test runner attaches an
// abort listener per test to chain cancellation, and 11+ accumulated listeners
// on the same AbortSignal trip MaxListenersExceededWarning. Visible as the
// suite hanging after the last named test in directory-mode (`node --test
// tests/frontend-dist`) because the timers keep the event loop alive.
const liveStores: { disconnected(): void }[] = [];

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  while (liveStores.length) {
    const store = liveStores.pop();
    try { store?.disconnected(); } catch { /* ignore teardown errors */ }
  }
  restoreGlobal("window", originalWindowDescriptor);
  restoreGlobal("localStorage", originalLocalStorageDescriptor);
});

function createHass(overrides: {
  handlers?: Record<string, (message: Record<string, unknown>) => unknown | Promise<unknown>>;
  states?: HassLike["states"];
  subscribe?: ((callback: (payload: unknown) => void, message: Record<string, unknown>) => Promise<() => void>) | null;
} = {}): HassLike {
  const handlers = overrides.handlers ?? {};
  return {
    states: overrides.states ?? {},
    async callWS<T>(message: Record<string, unknown>) {
      const type = String(message.type ?? "");
      const handler = handlers[type];
      if (handler) return (await handler(message)) as T;
      if (type === "sofabaton_x1s/control_panel/state") return baseState as T;
      if (type === "sofabaton_x1s/persistent_cache/contents") return baseContents as T;
      if (type === "sofabaton_x1s/logs/get") return { lines: [] } as T;
      return { ok: true } as T;
    },
    connection: overrides.subscribe
      ? {
          subscribeMessage: overrides.subscribe,
        }
      : null,
  };
}

function createStore() {
  const snapshots: unknown[] = [];
  const store = new ControlPanelStore((snapshot) => snapshots.push(snapshot), {
    loadedFrontendVersion: "dev",
  });
  liveStores.push(store);
  return { store, snapshots };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("cache tab is selectable even when persistent cache is disabled", async () => {
  const { store } = createStore();
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => ({
          ...baseState,
          persistent_cache_enabled: false,
        }),
      },
    }),
  );

  await store.loadState();
  store.selectTab("cache");

  assert.equal(store.snapshot.selectedTab, "cache");
  assert.equal(store.snapshot.state?.persistent_cache_enabled, false);
});

test("loadState restores the most recent hub and tab from local storage", async () => {
  globalThis.localStorage?.setItem(
    VIEW_STATE_STORAGE_KEY,
    JSON.stringify({
      selectedHubEntryId: "hub-2",
      selectedTab: "backup",
    }),
  );
  const store = new ControlPanelStore(() => undefined, {
    loadedFrontendVersion: "dev",
  });
  liveStores.push(store);
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => ({
          ...baseState,
          hubs: [
            ...baseState.hubs,
            {
              entry_id: "hub-2",
              name: "Bedroom",
              activity_count: 1,
              device_count: 1,
              settings: {
                proxy_enabled: false,
                hex_logging_enabled: false,
                wifi_device_enabled: false,
              },
            },
          ],
        }),
      },
      subscribe: async () => () => undefined,
    }),
  );

  await store.loadState();

  assert.equal(store.snapshot.selectedHubEntryId, "hub-2");
  assert.equal(store.snapshot.selectedTab, "backup");
});

test("loadState falls back to the first available hub when the saved hub no longer exists", async () => {
  globalThis.localStorage?.setItem(
    VIEW_STATE_STORAGE_KEY,
    JSON.stringify({
      selectedHubEntryId: "missing-hub",
      selectedTab: "settings",
    }),
  );
  const store = new ControlPanelStore(() => undefined, {
    loadedFrontendVersion: "dev",
  });
  liveStores.push(store);
  store.connected();
  store.setHass(createHass());

  await store.loadState();

  assert.equal(store.snapshot.selectedHubEntryId, "hub-1");
  assert.equal(
    JSON.parse(globalThis.localStorage?.getItem(VIEW_STATE_STORAGE_KEY) || "{}").selectedHubEntryId,
    "hub-1",
  );
});

test("selectHub and selectTab persist the updated view state", async () => {
  const { store } = createStore();
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => ({
          ...baseState,
          hubs: [
            ...baseState.hubs,
            {
              entry_id: "hub-2",
              name: "Bedroom",
              activity_count: 1,
              device_count: 1,
              settings: {
                proxy_enabled: false,
                hex_logging_enabled: false,
                wifi_device_enabled: false,
              },
            },
          ],
        }),
      },
    }),
  );
  await store.loadState();

  store.selectHub("hub-2");
  store.selectTab("wifi_commands");

  assert.deepEqual(
    JSON.parse(globalThis.localStorage?.getItem(VIEW_STATE_STORAGE_KEY) || "{}"),
    {
      selectedHubEntryId: "hub-2",
      selectedTab: "wifi_commands",
      // Keys renamed from open* to selected* in the tools-card refactor; the
      // store now persists the active per-tab section under selectedCacheSection
      // (cache panel) and selectedBackupSection.
      selectedCacheSection: "activities",
      selectedBackupSection: "make",
    },
  );
});

test("loadState keeps tools card unblocked when frontend version matches backend", async () => {
  const { store } = createStore();
  store.connected();
  store.setHass(createHass());

  await store.loadState();

  assert.equal(store.snapshot.toolsFrontendVersionLoaded, "dev");
  assert.equal(store.snapshot.toolsFrontendVersionExpected, "dev");
  assert.equal(store.snapshot.toolsFrontendVersionMismatch, false);
});

test("loadState blocks tools card when backend expects a different frontend version", async () => {
  const store = new ControlPanelStore(() => undefined, {
    loadedFrontendVersion: "2026.5.0",
  });
  liveStores.push(store);
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => ({
          ...baseState,
          tools_frontend_version: "2026.5.1",
        }),
      },
    }),
  );

  await store.loadState();

  assert.equal(store.snapshot.toolsFrontendVersionExpected, "2026.5.1");
  assert.equal(store.snapshot.toolsFrontendVersionMismatch, true);
});

test("later control-panel refresh can transition tools card into blocked mismatch state", async () => {
  const { store } = createStore();
  let currentVersion = "dev";
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => ({
          ...baseState,
          tools_frontend_version: currentVersion,
        }),
      },
    }),
  );

  await store.loadState();
  assert.equal(store.snapshot.toolsFrontendVersionMismatch, false);

  currentVersion = "2026.5.1";
  await store.loadControlPanelState();

  assert.equal(store.snapshot.toolsFrontendVersionExpected, "2026.5.1");
  assert.equal(store.snapshot.toolsFrontendVersionMismatch, true);
});

test("setSetting applies optimistic state and rolls back on failure", async () => {
  const { store } = createStore();
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/set_setting": () => {
          throw new Error("backend failed");
        },
      },
    }),
  );
  await store.loadState();

  const pending = store.setSetting("proxy_enabled", true);
  assert.equal(store.snapshot.pendingSettingKey, "proxy_enabled");
  assert.equal(store.snapshot.state?.hubs[0].settings?.proxy_enabled, true);

  await pending;
  assert.equal(store.snapshot.pendingSettingKey, null);
  assert.equal(store.snapshot.state?.hubs[0].settings?.proxy_enabled, false);
});

test("setHass marks cache as stale when generation changes outside refresh grace", async () => {
  const { store } = createStore();
  store.connected();
  store.setHass(
    createHass({
      states: {
        "remote.living_room": {
          state: "on",
          attributes: { entry_id: "hub-1", cache_generation: 1, proxy_client_connected: false },
        },
      },
    }),
  );
  await store.loadState();

  (store as unknown as { _refreshGraceUntil: number })._refreshGraceUntil = 0;
  store.setHass(
    createHass({
      states: {
        "remote.living_room": {
          state: "on",
          attributes: { entry_id: "hub-1", cache_generation: 2, proxy_client_connected: false },
        },
      },
    }),
  );

  assert.equal(store.snapshot.staleData, true);
});

test("logs tab subscribes, loads history, and appends live lines", async () => {
  const { store } = createStore();
  let pushMessage: ((payload: unknown) => void) | null = null;
  store.connected();
  store.setHass(
    createHass({
      subscribe: async (callback) => {
        pushMessage = callback;
        return () => undefined;
      },
      handlers: {
        "sofabaton_x1s/logs/get": () => ({
          lines: [{ time: "10:00:00", level: "info", message: "history" }],
        }),
      },
    }),
  );
  await store.loadState();
  store.selectTab("logs");
  await flush();
  await flush();

  assert.equal(store.snapshot.logsSubscribedEntryId, "hub-1");
  assert.equal(store.snapshot.logsLines.length >= 1, true);

  pushMessage?.({ time: "10:00:01", level: "warning", message: "live" });
  assert.equal(store.snapshot.logsLines.at(-1)?.message, "live");
});

test("refreshForHub uses entity_id when a matching remote entity exists", async () => {
  const { store } = createStore();
  const messages: Record<string, unknown>[] = [];
  store.connected();
  store.setHass(
    createHass({
      states: {
        "remote.living_room": {
          state: "on",
          attributes: { entry_id: "hub-1", cache_generation: 1, proxy_client_connected: false },
        },
      },
      handlers: {
        "sofabaton_x1s/persistent_cache/refresh": (message) => {
          messages.push(message);
          return { ok: true };
        },
      },
    }),
  );
  await store.loadState();

  await store.refreshForHub("activity", 101, "act-101");

  assert.equal(messages.length, 1);
  assert.equal(messages[0].entity_id, "remote.living_room");
  assert.equal(messages[0].entry_id, undefined);
});

test("busy state and completion notices stay scoped to the hub they ran on", async () => {
  const { store } = createStore();
  const twoHubState = {
    ...baseState,
    hubs: [
      baseState.hubs[0],
      { ...baseState.hubs[0], entry_id: "hub-2", name: "Bedroom" },
    ],
  };
  let progressCallback: ((payload: unknown) => void) | null = null;
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => twoHubState,
        "sofabaton_x1s/cache/refresh_all": () => ({ operation_id: "op-1" }),
      },
      subscribe: async (callback, message) => {
        if (String(message.type) === "sofabaton_x1s/backup/progress_subscribe") {
          progressCallback = callback;
        }
        return () => {};
      },
    }),
  );
  await store.loadState();
  assert.equal(store.snapshot.selectedHubEntryId, "hub-1");

  const refreshPromise = store.refreshAllForHub();
  await flush();
  await flush();

  // Hub 1 selected: the running refresh surfaces in the dock.
  assert.ok("hub-1" in store.snapshot.refreshBusyByHub);
  assert.equal(resolveRuntimeState(store.snapshot)?.kind, "notice");

  // Hub 2 selected: hub 1's refresh must not leak into the dock.
  store.selectHub("hub-2");
  await flush();
  assert.equal(resolveRuntimeState(store.snapshot), null);

  progressCallback?.({ status: "success" });
  await refreshPromise;

  // The completion toast belongs to hub 1 and stays invisible on hub 2...
  assert.deepEqual(store.snapshot.refreshBusyByHub, {});
  assert.ok(store.snapshot.runtimeCompletionNoticeByHub["hub-1"]);
  assert.equal(resolveRuntimeState(store.snapshot), null);

  // ...but is shown when switching back to hub 1.
  store.selectHub("hub-1");
  assert.equal(resolveRuntimeState(store.snapshot)?.kind, "completion");
});

test("deviceClassIcon maps known cache device classes to the expected icons", () => {
  assert.equal(deviceClassIcon("ir"), "mdi:remote");
  assert.equal(deviceClassIcon("bluetooth"), "mdi:bluetooth");
  assert.equal(deviceClassIcon("wifi_roku"), "mdi:wifi");
  assert.equal(deviceClassIcon("wifi_hue"), "mdi:wifi");
  assert.equal(deviceClassIcon("wifi_mqtt"), "mdi:wifi");
  assert.equal(deviceClassIcon("wifi_ip"), "mdi:wifi");
  assert.equal(deviceClassIcon("something_else"), "mdi:radio-tower");
  assert.equal(deviceClassIcon(undefined), "mdi:radio-tower");
});
