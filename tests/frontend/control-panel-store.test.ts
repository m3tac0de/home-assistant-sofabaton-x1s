import test from "node:test";
import assert from "node:assert/strict";
import { ControlPanelStore } from "../../custom_components/sofabaton_x1s/www/src/state/control-panel-store";
import type { HassLike } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

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
  return { store, snapshots };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("loadState keeps cache tab unavailable when persistent cache is disabled", async () => {
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

  assert.equal(store.snapshot.selectedTab, "settings");
  assert.equal(store.snapshot.state?.persistent_cache_enabled, false);
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
