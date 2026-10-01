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
import { TOOLS_CARD_STRINGS } from "../../custom_components/sofabaton_x1s/www/src/strings";
import { ControlPanelStore } from "../../custom_components/sofabaton_x1s/www/src/state/control-panel-store";
import { deviceClassIcon, isBackendUnavailableError, resolveCardGateState, resolveRuntimeState } from "../../custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors";
import type { HassConnectionLike, HassLike } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const VIEW_STATE_STORAGE_KEY = "sofabaton_x1s:tools_card:view_state:v1";

const baseState = {
  persistent_cache_enabled: true,
  sidebar_panel: "off",
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
          subscribeMessage: overrides.subscribe as HassConnectionLike["subscribeMessage"],
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
      selectedWifiSection: "hub_events",
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
  assert.equal(store.snapshot.selectedWifiSection, "hub_events");
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
      selectedWifiSection: "wifi",
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

// HA restart with the card open: a backend-retry load can succeed in the
// window where the WS API is registered but no hub entries are set up yet,
// leaving both payloads with an empty hub list. The state-only refresh paths
// (runtime poll, connection changes, hub switches) must then heal `contents`
// too (before the fix the Hub/Backup tabs stayed on "No hubs found" until a
// manual card reload), and the persisted hub selection must survive the
// transient empty window.
test("state refresh reloads cache contents when hubs appear after a restart window", async () => {
  globalThis.localStorage?.setItem(
    VIEW_STATE_STORAGE_KEY,
    JSON.stringify({ selectedHubEntryId: "hub-1", selectedTab: "cache" }),
  );
  const store = new ControlPanelStore(() => undefined, {
    loadedFrontendVersion: "dev",
  });
  liveStores.push(store);
  let hubsReady = false;
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () =>
          hubsReady ? baseState : { ...baseState, hubs: [] },
        "sofabaton_x1s/persistent_cache/contents": () =>
          hubsReady ? baseContents : { enabled: true, hubs: [] },
      },
    }),
  );

  // The retry that lands mid-startup: both payloads are empty.
  await store.loadState();
  assert.equal(store.snapshot.state?.hubs.length, 0);
  assert.equal(store.snapshot.contents?.hubs.length, 0);
  assert.equal(store.snapshot.selectedHubEntryId, "hub-1");

  // The next state-only refresh (runtime poll) sees the hubs come up.
  hubsReady = true;
  await store.loadControlPanelState();

  assert.equal(store.snapshot.state?.hubs.length, 1);
  assert.equal(store.snapshot.contents?.hubs.length, 1);
  assert.equal(store.snapshot.contents?.hubs[0]?.entry_id, "hub-1");
  assert.equal(store.snapshot.selectedHubEntryId, "hub-1");
});

test("state refresh leaves cache contents alone when they already cover the hubs", async () => {
  const { store } = createStore();
  let contentsCalls = 0;
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/persistent_cache/contents": () => {
          contentsCalls += 1;
          return baseContents;
        },
      },
    }),
  );

  await store.loadState();
  assert.equal(contentsCalls, 1);

  await store.loadControlPanelState();
  assert.equal(contentsCalls, 1);
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

test("renameHub writes the name through hub/rename and reloads the hub state", async () => {
  const { store } = createStore();
  const messages: Record<string, unknown>[] = [];
  let name = "Living Room";
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => ({
          ...baseState,
          hubs: [{ ...baseState.hubs[0], name }],
        }),
        "sofabaton_x1s/hub/rename": (message) => {
          messages.push(message);
          name = String(message.name);
          return { status: "success", name };
        },
      },
    }),
  );
  await store.loadState();

  const error = await store.renameHub("Den");

  assert.equal(error, null);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].entry_id, "hub-1");
  assert.equal(messages[0].name, "Den");
  assert.equal(store.snapshot.state?.hubs[0].name, "Den");
});

test("renameHub localizes a refused name and leaves the state alone", async () => {
  const { store } = createStore();
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/hub/rename": () => {
          throw { code: "invalid_name", message: "The hub cannot store this hub name" };
        },
      },
    }),
  );
  await store.loadState();

  const error = await store.renameHub("a\\b");

  assert.equal(error, "The hub cannot store this name.");
  assert.equal(store.snapshot.state?.hubs[0].name, "Living Room");
});

test("setSidebarPanelMode applies optimistic state and rolls back on failure", async () => {
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

  const pending = store.setSidebarPanelMode("admin");
  assert.equal(store.snapshot.pendingSettingKey, "sidebar_panel");
  assert.equal(store.snapshot.state?.sidebar_panel, "admin");

  await pending;
  assert.equal(store.snapshot.pendingSettingKey, null);
  assert.equal(store.snapshot.state?.sidebar_panel, "off");
});

test("setSidebarPanelMode persists the mode through set_setting", async () => {
  const { store } = createStore();
  const messages: Record<string, unknown>[] = [];
  let mode = "off";
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => ({ ...baseState, sidebar_panel: mode }),
        "sofabaton_x1s/control_panel/set_setting": (message) => {
          messages.push(message);
          mode = String(message.value);
          return { ok: true, value: mode };
        },
      },
    }),
  );
  await store.loadState();

  await store.setSidebarPanelMode("all");

  assert.equal(messages.length, 1);
  assert.equal(messages[0].setting, "sidebar_panel");
  assert.equal(messages[0].value, "all");
  assert.equal(messages[0].entry_id, "hub-1");
  assert.equal(store.snapshot.state?.sidebar_panel, "all");
});

test("setHubClickAction applies optimistic state and rolls back on failure", async () => {
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

  const pending = store.setHubClickAction("send");
  assert.equal(store.snapshot.pendingSettingKey, "hub_click_action");
  assert.equal(store.snapshot.state?.hub_click_action, "send");

  await pending;
  assert.equal(store.snapshot.pendingSettingKey, null);
  assert.equal(store.snapshot.state?.hub_click_action, "none");
});

test("setHubClickAction persists the value through set_setting", async () => {
  const { store } = createStore();
  const messages: Record<string, unknown>[] = [];
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/set_setting": (message) => {
          messages.push(message);
          return { ok: true, value: message.value };
        },
      },
    }),
  );
  await store.loadState();

  await store.setHubClickAction("copy");

  assert.equal(messages.length, 1);
  assert.equal(messages[0].setting, "hub_click_action");
  assert.equal(messages[0].value, "copy");
  assert.equal(messages[0].entry_id, "hub-1");
});

test("sendHubClickCommand sends via the hub's remote entity and pulses the dock", async () => {
  const { store } = createStore();
  const calls: Array<{ domain: string; service: string; data?: Record<string, unknown> }> = [];
  const hass = createHass({
    states: {
      "remote.living_room": {
        state: "on",
        attributes: { entry_id: "hub-1", proxy_client_connected: false },
      },
    },
  });
  hass.callService = async (domain, service, data) => {
    calls.push({ domain, service, data });
    return undefined;
  };
  store.connected();
  store.setHass(hass);
  await store.loadState();

  await store.sendHubClickCommand({
    kind: "command",
    label: "Power Toggle",
    contextLabel: "Television",
    targetId: 1,
    commandId: 10,
  });

  assert.deepEqual(calls, [
    {
      domain: "remote",
      service: "send_command",
      data: { entity_id: "remote.living_room", command: 10, device: 1 },
    },
  ]);
  assert.equal(store.snapshot.lastCommandSend?.entryId, "hub-1");
  assert.equal(store.snapshot.lastCommandSend?.commandLabel, "Power Toggle");
  assert.equal(store.snapshot.lastCommandSend?.contextLabel, "Television");
});

test("copyHubClickCommand creates a persistent notification with the command YAML", async () => {
  const { store } = createStore();
  const calls: Array<{ domain: string; service: string; data?: Record<string, unknown> }> = [];
  const hass = createHass({
    states: {
      "remote.living_room": {
        state: "on",
        attributes: { entry_id: "hub-1", proxy_client_connected: false },
      },
    },
  });
  hass.callService = async (domain, service, data) => {
    calls.push({ domain, service, data });
    return undefined;
  };
  store.connected();
  store.setHass(hass);
  await store.loadState();

  await store.copyHubClickCommand({
    kind: "favorite",
    label: "Power",
    contextLabel: "Watch TV",
    targetId: 1,
    commandId: 10,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].domain, "persistent_notification");
  assert.equal(calls[0].service, "create");
  const message = String(calls[0].data?.message ?? "");
  assert.match(message, /Activity: Watch TV \| Favorite: Power/);
  assert.match(message, /action: remote\.send_command/);
  assert.match(message, /entity_id: remote\.living_room/);
  assert.match(message, /command: 10/);
  assert.match(message, /device: 1/);
  // Sidebar copy leaves a success notice in the dock.
  assert.equal(
    store.snapshot.runtimeCompletionNoticeByHub["hub-1"]?.tone,
    "success",
  );
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
  let pushMessage: ((payload: unknown) => void) | undefined;
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
  let progressCallback: ((payload: unknown) => void) | undefined;
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
  assert.equal(deviceClassIcon("wifi_sonos"), "mdi:wifi");   // CR-F1-16
  assert.equal(deviceClassIcon("something_else"), "mdi:radio-tower");
  assert.equal(deviceClassIcon(undefined), "mdi:radio-tower");
});

// CR-F1-1: the dock announced "success" whenever a running operation left the
// poll, although a failed restore/sync/deploy looks the same. The backend now
// reports how it ended; the store follows that and stays quiet when unknown.
async function runTransition(running: Record<string, unknown>, idle: Record<string, unknown>) {
  const { store } = createStore();
  let runtime: Record<string, unknown> = running;
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => ({
          ...baseState,
          hubs: [{ ...baseState.hubs[0], runtime_state: runtime }],
        }),
      },
    }),
  );
  await store.loadState();
  runtime = idle;
  await store.loadControlPanelState();
  return store.snapshot.runtimeCompletionNoticeByHub["hub-1"] ?? null;
}

const RUNNING_RESTORE = { kind: "operation_running", operation: "backup_restore", operation_id: "op-7" };
const IDLE = { kind: "idle", operation: null };

test("dock reports a failed restore as an error, not success", async () => {
  const notice = await runTransition(RUNNING_RESTORE, {
    ...IDLE, last_operation: { operation_id: "op-7", status: "failed" }, last_wifi_deploys: {},
  });
  assert.equal(notice?.tone, "error");
});

test("dock reports a successful restore as success", async () => {
  const notice = await runTransition(RUNNING_RESTORE, {
    ...IDLE, last_operation: { operation_id: "op-7", status: "success" }, last_wifi_deploys: {},
  });
  assert.equal(notice?.tone, "success");
});

test("dock stays quiet when the outcome is unknown", async () => {
  // An older backend (no last_operation) or an outcome of a different operation.
  assert.equal(await runTransition(RUNNING_RESTORE, IDLE), null);
  assert.equal(
    await runTransition(RUNNING_RESTORE, { ...IDLE, last_operation: { operation_id: "op-6", status: "success" } }),
    null,
  );
});

test("dock reports a failed Wifi deploy per device key", async () => {
  const notice = await runTransition(
    { kind: "operation_running", operation: "wifi_deploy", device_key: "livingroom" },
    { ...IDLE, last_operation: null, last_wifi_deploys: { livingroom: "failed", other: "success" } },
  );
  assert.equal(notice?.tone, "error");
});

test("dock names why a Wifi deploy failed", async () => {
  const notice = await runTransition(
    { kind: "operation_running", operation: "wifi_deploy", device_key: "livingroom" },
    {
      ...IDLE,
      last_operation: null,
      last_wifi_deploys: { livingroom: "failed" },
      last_wifi_deploy_errors: { livingroom: "activities_changed" },
    },
  );
  assert.equal(notice?.tone, "error");
  assert.equal(notice?.label, TOOLS_CARD_STRINGS.wifiCommands.syncFailedActivitiesChanged);
});

// ── R5 batch 3.1: failure paths ─────────────────────────────────────────

function stateWithOperation(operation: Record<string, unknown> | null) {
  return {
    ...baseState,
    hubs: [{ ...baseState.hubs[0], hub_connected: true, active_backup_operation: operation }],
  };
}

test("refresh all settles when its operation vanishes without a terminal event (CR-F1-3)", async () => {
  let current: Record<string, unknown> = stateWithOperation(null);
  const { store } = createStore();
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => current,
        "sofabaton_x1s/cache/refresh_all": () => ({ operation_id: "op-1" }),
      },
      // HA restarted: the progress subscription never delivers anything.
      subscribe: async () => () => undefined,
    }),
  );
  await store.loadState();

  const done = store.refreshAllForHub();
  await flush();
  current = stateWithOperation({ operation_id: "op-1", status: "running", kind: "cache_refresh" });
  await store.loadControlPanelState();
  assert.ok("hub-1" in store.snapshot.refreshBusyByHub, "still running");

  current = stateWithOperation(null);   // the operation is gone after the restart
  await store.loadControlPanelState();
  const outcome = await Promise.race([done, new Promise((resolve) => setTimeout(() => resolve("hung"), 2000))]);
  assert.notEqual(outcome, "hung", "refresh all never settled");
  assert.equal(outcome, null);          // unknown outcome: no failure reported
  assert.equal("hub-1" in store.snapshot.refreshBusyByHub, false);
});

test("a failed per-entry refresh is shown, and a create still opens its editor (CR-F1-2)", async () => {
  const { store } = createStore();
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => stateWithOperation(null),
        "sofabaton_x1s/activity/create": () => ({ status: "success", activity_id: 105 }),
        "sofabaton_x1s/persistent_cache/refresh": () => { throw { code: "timeout", message: "the hub did not answer" }; },
      },
    }),
  );
  await store.loadState();

  const result = await store.createActivity("Movie");
  assert.deepEqual(result, { activityId: 105 });
  const runtime = store.snapshot.runtimeCompletionNoticeByHub?.["hub-1"] ?? null;
  assert.ok(runtime && runtime.tone === "error", "the failed refresh is reported");
  assert.equal("hub-1" in store.snapshot.refreshBusyByHub, false);
});

test("Hub-tab send refuses while the Sofabaton app holds the hub (CR-F1-4)", async () => {
  const sent: unknown[] = [];
  const { store } = createStore();
  store.connected();
  const hass = createHass({
    states: {
      "remote.living_room": { state: "unavailable", attributes: { entry_id: "hub-1", proxy_client_connected: true } },
    },
  });
  (hass as HassLike & { callService: unknown }).callService = async (...args: unknown[]) => { sent.push(args); };
  store.setHass(hass);
  await store.loadState();

  await store.sendHubClickCommand({ commandId: 10, targetId: 1, label: "Power", contextLabel: "Television" } as never);
  assert.equal(sent.length, 0);
  assert.equal(store.snapshot.lastCommandSend ?? null, null);
});

test("a hub action that fails says so in the dock (CR-F1-8)", async () => {
  const { store } = createStore();
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/run_action": () => { throw { code: "busy", message: "busy" }; },
      },
    }),
  );
  await store.loadState();
  await store.runAction("find_remote" as never);
  const runtime = store.snapshot.runtimeCompletionNoticeByHub?.["hub-1"] ?? null;
  assert.ok(runtime && runtime.tone === "error");
  assert.equal(store.snapshot.pendingActionKey, null);
});


test("a hub whose remote entity is disabled still passes the card gate (CR-X2-2)", async () => {
  const { store } = createStore();
  store.connected();
  // No remote.* entity in hass.states at all: the user disabled it.
  store.setHass(createHass({ handlers: { "sofabaton_x1s/control_panel/state": () => stateWithOperation(null) } }));
  await store.loadState();
  assert.equal(resolveCardGateState(store.snapshot).kind, "pass");

  store.setHass(createHass({
    handlers: {
      "sofabaton_x1s/control_panel/state": () => ({
        ...baseState, hubs: [{ ...baseState.hubs[0], hub_connected: false }],
      }),
    },
  }));
  await store.loadState();
  assert.equal(resolveCardGateState(store.snapshot).kind, "hub_unavailable");
});

test("not_found is one hub, not a missing integration (CR-X2-8)", () => {
  assert.equal(isBackendUnavailableError({ code: "not_found" }, null), false);
  assert.equal(isBackendUnavailableError({ code: "unknown_command" }, null), true);
});

test("two state loads racing on one operation leave one subscription (CR-F1-6)", async () => {
  let subscribed = 0;
  let released = 0;
  let current: Record<string, unknown> = stateWithOperation(null);
  const { store } = createStore();
  store.connected();
  store.setHass(
    createHass({
      handlers: {
        "sofabaton_x1s/control_panel/state": () => current,
      },
      subscribe: async (_callback, message) => {
        // Only the backup-progress feed: the press and event feeds share the socket.
        if (message.type !== "sofabaton_x1s/backup/progress_subscribe") return () => undefined;
        subscribed += 1;
        await flush();
        return () => { released += 1; };
      },
    }),
  );
  await store.loadState();
  // The operation starts; two loads land within one round trip.
  current = stateWithOperation({ operation_id: "op-7", status: "running", kind: "backup_restore" });
  await Promise.all([store.loadControlPanelState(), store.loadControlPanelState()]);
  await flush();
  assert.ok(subscribed >= 1);
  assert.equal(subscribed - released, 1, "exactly one live subscription");
});

test("the Hub tab's send reports in the dock, never as Home Assistant's error toast", async () => {
  const { store } = createStore();
  const calls: unknown[][] = [];
  const hass = createHass({
    states: {
      "remote.living_room": { state: "on", attributes: { entry_id: "hub-1", proxy_client_connected: false } },
    },
  });
  (hass as HassLike & { callService: unknown }).callService = async (...args: unknown[]) => {
    calls.push(args);
    throw { code: "home_assistant_error", message: "Hub not connected" };
  };
  store.connected();
  store.setHass(hass);
  await store.loadState();

  await store.sendHubClickCommand({ kind: "command", label: "Power", contextLabel: "Television", targetId: 1, commandId: 10 });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][4], false, "notifyOnError must be false");
  assert.equal(store.snapshot.runtimeCompletionNoticeByHub["hub-1"]?.tone, "error");
});

test("dock errors stay 8 seconds, successes 6", () => {
  const delays: number[] = [];
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((fn: () => void, ms?: number) => {
    delays.push(Number(ms));
    return realSetTimeout(() => undefined, 0);
  }) as typeof setTimeout;
  try {
    const { store } = createStore();
    store.showRuntimeCompletion({ tone: "error", label: "The hub did not answer. Sync again." }, "hub-1");
    store.showRuntimeCompletion({ tone: "success", label: "Done" }, "hub-2");
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.deepEqual(delays, [8000, 6000]);
});
