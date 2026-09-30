import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  hubEventModalTitle,
  hubEventRows,
  wifiSectionRows,
} from "../../custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab";
import "../../custom_components/sofabaton_x1s/www/src/control-panel-translations";
import { setToolsCardLanguage } from "../../custom_components/sofabaton_x1s/www/src/strings";

const WifiCommandsTabElement = customElements.get("sofabaton-wifi-commands-tab") as {
  new (): HTMLElement;
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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

beforeEach(() => {
  installStorage();
});

afterEach(() => {
  setToolsCardLanguage("en");
  restoreGlobal("window", originalWindowDescriptor);
  restoreGlobal("localStorage", originalLocalStorageDescriptor);
});

test("wifi Events labels are resolved after the active locale is selected", () => {
  setToolsCardLanguage("de-DE");

  assert.equal(wifiSectionRows()[1].label, "Ereignisse");
  assert.deepEqual(
    hubEventRows().map((row) => row.label),
    [
      "Wenn der Hub AUSGESCHALTET wird",
      "Wenn AUS gedrückt wird, während der Hub bereits AUS ist",
    ],
  );
  assert.equal(hubEventModalTitle("power_off"), "Wenn der Hub AUSGESCHALTET wird");
});

test("wifi commands persists the selected device detail view per hub", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };
  element._selectedDeviceKey = "dev-2";

  (element as any)._persistSelectedDeviceSession();

  const persisted = JSON.parse(globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1") || "{}");
  assert.equal(persisted.deviceKey, "dev-2");
  assert.equal(Number.isFinite(Number(persisted.savedAt)), true);
});

test("wifi commands restores the selected device detail view when the device still exists", () => {
  globalThis.localStorage?.setItem(
    "sofabaton_x1s:wifi_commands:selected_device:hub-1",
    JSON.stringify({ deviceKey: "dev-2", savedAt: Date.now() }),
  );

  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };
  element._wifiDevices = [
    { device_key: "dev-1", device_name: "TV" },
    { device_key: "dev-2", device_name: "Receiver" },
  ];

  (element as any)._restoreSelectedDeviceSession();

  assert.equal(element._selectedDeviceKey, "dev-2");
});

test("wifi commands does not wipe the persisted selection before restore has been attempted", () => {
  globalThis.localStorage?.setItem(
    "sofabaton_x1s:wifi_commands:selected_device:hub-1",
    JSON.stringify({ deviceKey: "dev-2", savedAt: Date.now() }),
  );

  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };
  // _selectedDeviceKey is still null and _deviceSessionRestoreTried is still
  // false — this mirrors the state on the first render after a reload, before
  // the async hub-load has had a chance to call _restoreSelectedDeviceSession.
  (element as any)._persistSelectedDeviceSession();

  assert.equal(
    globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1"),
    JSON.stringify({ deviceKey: "dev-2", savedAt: JSON.parse(globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1") || "{}").savedAt }),
  );
});

test("wifi commands drops a stale selected device session when that device no longer exists", () => {
  globalThis.localStorage?.setItem(
    "sofabaton_x1s:wifi_commands:selected_device:hub-1",
    JSON.stringify({ deviceKey: "missing-device", savedAt: Date.now() }),
  );

  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };
  element._wifiDevices = [
    { device_key: "dev-1", device_name: "TV" },
  ];

  (element as any)._restoreSelectedDeviceSession();

  assert.equal(element._selectedDeviceKey, null);
  assert.equal(globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1"), null);
});

test("unconfigured slots stay empty tiles regardless of the active locale", () => {
  // The backend always stores the English protocol default name
  // (command_config.py _default_slot); the configured-slot detection must not
  // compare it against a localized string (regression: 20bba0b).
  setToolsCardLanguage("nl");

  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };

  const backendDefault = {
    name: "Command 3",
    add_as_favorite: true,
    hard_button: "",
    long_press_enabled: false,
    input_activity_id: "",
    activities: [],
    action: { action: "perform-action" },
    long_press_action: { action: "perform-action" },
  };

  assert.equal((element as any)._commandSlotDefault(2).name, "Command 3");
  assert.equal((element as any)._isCommandConfigured(backendDefault, 2), false);
  assert.equal((element as any)._isCommandConfigured({ ...backendDefault, name: "Volume up" }, 2), true);

  // Clearing a slot persists the protocol default, not the localized label.
  const normalized = (element as any)._normalizeCommandsForStorage([{}, {}, {}]);
  assert.equal(normalized[2].name, "Command 3");
});

test("wifi commands save drops orphaned activities when favorite and button are off", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };

  const normalized = (element as any)._normalizeCommandsForStorage([
    { name: "Orphan", add_as_favorite: false, hard_button: "", activities: ["101", "102"] },
    { name: "Favorite", add_as_favorite: true, hard_button: "", activities: ["101"] },
    { name: "Button", add_as_favorite: false, hard_button: "red", activities: ["102"] },
  ]);

  assert.deepEqual(normalized[0].activities, []);
  assert.deepEqual(normalized[1].activities, ["101"]);
  assert.deepEqual(normalized[2].activities, ["102"]);
});

test("power/input config support is gated per hub version (X1 collapses transition callbacks)", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;

  element.hub = { entry_id: "hub-1", version: "X1" };
  assert.equal((element as any)._supportsPowerInputConfig(), false);

  element.hub = { entry_id: "hub-1", version: "X1S" };
  assert.equal((element as any)._supportsPowerInputConfig(), true);

  element.hub = { entry_id: "hub-1", version: "X2" };
  assert.equal((element as any)._supportsPowerInputConfig(), true);

  // Unknown/absent versions keep the full UI (no flash-hide while loading).
  element.hub = { entry_id: "hub-1" };
  assert.equal((element as any)._supportsPowerInputConfig(), true);
});

test("X1 hides power/input roles from the slot meta label but keeps them on X1S", () => {
  const powerSlot = {
    name: "Power",
    add_as_favorite: false,
    hard_button: "",
    long_press_enabled: false,
    is_power_on: true,
    is_power_off: false,
    input_activity_id: "",
    activities: [],
  };
  const inputSlot = { ...powerSlot, is_power_on: false, input_activity_id: "101" };

  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1", version: "X1S" };
  assert.equal((element as any)._commandSlotMetaLabel(powerSlot), "Power ON command");
  assert.match(String((element as any)._commandSlotMetaLabel(inputSlot)), /^Input for /);

  element.hub = { entry_id: "hub-1", version: "X1" };
  assert.equal((element as any)._commandSlotMetaLabel(powerSlot), "in 0 activities");
  assert.equal((element as any)._commandSlotMetaLabel(inputSlot), "in 0 activities");
});

test("hub events tab normalizes activity event actions and drops invalid ids", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;

  const normalized = (element as any)._normalizeActivityEventActions({
    "101": { start: { action: "perform-action", perform_action: "scene.movie_on" } },
    "not-a-number": { start: { perform_action: "scene.bad" } },
    "-2": { stop: { perform_action: "scene.negative" } },
  });

  assert.deepEqual(Object.keys(normalized), ["101"]);
  assert.equal(normalized["101"].start.perform_action, "scene.movie_on");
  // The unset phase always comes back as the default no-op payload.
  assert.deepEqual(normalized["101"].stop, { action: "perform-action" });
});

test("hub events save ships both maps and targets the requested activity phase", async () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1" };
  (element as any)._entityId = () => "remote.hub";
  (element as any)._activityEventActions = {
    "101": { start: { action: "perform-action", perform_action: "scene.keep" }, stop: { action: "perform-action" } },
  };

  const calls: Array<Record<string, unknown>> = [];
  element.hass = {
    callWS: async (msg: Record<string, unknown>) => {
      calls.push(msg);
      return { actions: msg.actions, activity_actions: msg.activity_actions };
    },
  };

  await (element as any)._writeHubEventAction(
    { kind: "activity", id: "102", phase: "stop" },
    { action: "perform-action", perform_action: "scene.music_off" },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "sofabaton_x1s/hub_event_actions/set");
  const shipped = calls[0].activity_actions as Record<string, { start: unknown; stop: { perform_action?: string } }>;
  // Existing entries ride along untouched; the target phase lands on 102.
  assert.equal((shipped["101"].start as { perform_action?: string }).perform_action, "scene.keep");
  assert.equal(shipped["102"].stop.perform_action, "scene.music_off");
  assert.deepEqual(shipped["102"].start, { action: "perform-action" });
  // The hub-level map is always sent alongside.
  assert.deepEqual(Object.keys(calls[0].actions as object).sort(), ["activity_start", "activity_stop", "power_off", "redundant_off"]);
});

test("hub event flash matching lights the affected action links for a transition", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;

  const powerOff = { entryId: "hub-1", type: "activity_change", fromActivityId: 5, toActivityId: null, timestamp: 1, receivedAt: 1 };
  const started = { entryId: "hub-1", type: "activity_change", fromActivityId: 5, toActivityId: 7, timestamp: 2, receivedAt: 2 };
  const redundant = { entryId: "hub-1", type: "redundant_off", fromActivityId: null, toActivityId: null, timestamp: 3, receivedAt: 3 };

  // Hub-level rows.
  assert.equal((element as any)._flashMatchesHubEventRow(powerOff, "power_off"), true);
  assert.equal((element as any)._flashMatchesHubEventRow(powerOff, "activity_start"), false);
  assert.equal((element as any)._flashMatchesHubEventRow(started, "activity_start"), true);
  assert.equal((element as any)._flashMatchesHubEventRow(started, "power_off"), false);
  // Any transition away from an activity lights the stop hook — including
  // powering off.
  assert.equal((element as any)._flashMatchesHubEventRow(started, "activity_stop"), true);
  assert.equal((element as any)._flashMatchesHubEventRow(powerOff, "activity_stop"), true);
  assert.equal((element as any)._flashMatchesHubEventRow(redundant, "activity_stop"), false);
  assert.equal((element as any)._flashMatchesHubEventRow(redundant, "redundant_off"), true);
  assert.equal((element as any)._flashMatchesHubEventRow(null, "redundant_off"), false);

  // Per-activity rows: a switch lights the stopping activity's stop link and
  // the starting activity's start link — not the sibling phase.
  assert.equal((element as any)._flashMatchesActivityPhase(started, 5, "stop"), true);
  assert.equal((element as any)._flashMatchesActivityPhase(started, 5, "start"), false);
  assert.equal((element as any)._flashMatchesActivityPhase(started, 7, "start"), true);
  assert.equal((element as any)._flashMatchesActivityPhase(started, 7, "stop"), false);
  assert.equal((element as any)._flashMatchesActivityPhase(started, 9, "start"), false);
  assert.equal((element as any)._flashMatchesActivityPhase(powerOff, 5, "stop"), true);
  assert.equal((element as any)._flashMatchesActivityPhase(redundant, 5, "stop"), false);
});

test("hub events load resets per-activity actions when the backend omits them", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, unknown>;
  (element as any)._activityEventActions = {
    "101": { start: { action: "perform-action", perform_action: "scene.stale" }, stop: { action: "perform-action" } },
  };

  (element as any)._applyHubEventActionsResult({ actions: {} });

  assert.deepEqual((element as any)._activityEventActions, {});
});

test("wifi commands announces editor dirty state only inside the device editor", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  const events: boolean[] = [];
  element.addEventListener("editor-dirty-changed", (event) => {
    events.push(Boolean((event as CustomEvent<{ dirty: boolean }>).detail.dirty));
  });
  element.hub = { entry_id: "hub-1" };
  element._wifiDevices = [{ device_key: "dev-1", device_name: "TV" }];
  element._syncState = { ...(element as any)._defaultSyncState(), sync_needed: true };

  // List view: a sync is needed but the user is not in the editor.
  (element as any)._notifyDirtyDock();
  assert.deepEqual(events, []);

  // Detail view with a pending sync → dirty.
  element._selectedDeviceKey = "dev-1";
  (element as any)._notifyDirtyDock();
  assert.deepEqual(events, [true]);

  // No re-dispatch without a transition.
  (element as any)._notifyDirtyDock();
  assert.deepEqual(events, [true]);

  // Deploy running: the dock narrates the operation instead.
  element._syncState = { ...element._syncState, status: "running" };
  (element as any)._notifyDirtyDock();
  assert.deepEqual(events, [true, false]);

  // A failed deploy leaves the config still needing a sync.
  element._syncState = { ...element._syncState, status: "failed" };
  (element as any)._notifyDirtyDock();
  assert.deepEqual(events, [true, false, true]);

  // Back to the device list clears the flag.
  element._selectedDeviceKey = null;
  (element as any)._notifyDirtyDock();
  assert.deepEqual(events, [true, false, true, false]);
});

test("wifi commands does not announce dirty from the Events section or guard states", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  const events: boolean[] = [];
  element.addEventListener("editor-dirty-changed", (event) => {
    events.push(Boolean((event as CustomEvent<{ dirty: boolean }>).detail.dirty));
  });
  element.hub = { entry_id: "hub-1" };
  element._wifiDevices = [{ device_key: "dev-1", device_name: "TV" }];
  element._selectedDeviceKey = "dev-1";
  element._syncState = { ...(element as any)._defaultSyncState(), sync_needed: true };

  element.selectedSection = "hub_events";
  (element as any)._notifyDirtyDock();
  assert.deepEqual(events, []);

  element.selectedSection = "wifi";
  element.blockedTitle = "Hub busy";
  element.blockedMessage = "Try again later";
  (element as any)._notifyDirtyDock();
  assert.deepEqual(events, []);
});

// ── Load and save failures, stale replies, re-entry (CR-F3-4/5/6/7/11/18) ──

function fakeWsHass(handlers: Record<string, (message: Record<string, unknown>) => unknown>) {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    hass: {
      states: {},
      callWS: async (message: Record<string, unknown>) => {
        calls.push(message);
        const handler = handlers[String(message.type).replace("sofabaton_x1s/", "")];
        if (!handler) throw new Error(`Unexpected WS call: ${String(message.type)}`);
        return await handler(message);
      },
    },
  };
}

test("a failed event-actions load blocks saves that would erase the stored maps", async () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };
  const { hass, calls } = fakeWsHass({
    "hub_event_actions/get": () => { throw { code: "not_found", message: "gone" }; },
    "hub_event_actions/set": () => ({}),
  });
  element.hass = hass;

  await element._loadHubEventActions(true);
  assert.equal(element._hubEventActionsLoadFailed, true);

  await assert.rejects(element._writeHubEventAction({ kind: "hub", key: "power_off" }, { action: "perform-action", perform_action: "scene.x" }));
  assert.deepEqual(calls.map((call) => call.type), ["sofabaton_x1s/hub_event_actions/get"]);

  // A cleared action that fails says so instead of doing nothing (CR-F3-18).
  await element._resetHubEventAction({ kind: "hub", key: "power_off" });
  assert.ok(element._hubEventResetError);
});

test("a failed slot save keeps the stored slots and reports the error", async () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };
  element._selectedDeviceKey = "dev-1";
  const before = element._commandsData;
  const { hass } = fakeWsHass({
    "command_config/set": () => { throw { code: "not_found", message: "gone" }; },
  });
  element.hass = hass;
  const next = element._commandsList();
  next[0] = { ...next[0], name: "Lights on" };

  assert.equal(await element._setCommands(next), false);
  assert.equal(element._commandsData, before);
  assert.ok(element._commandsSaveError);
});

test("a failed command-config load refuses to save empty slots over the stored ones", async () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };
  element._selectedDeviceKey = "dev-1";
  const { hass, calls } = fakeWsHass({
    "command_config/get": () => { throw { code: "not_found", message: "gone" }; },
    "command_config/set": () => ({}),
  });
  element.hass = hass;

  await element._loadCommandConfigFromBackend(true);
  assert.equal(element._commandConfigLoadFailed, true);
  assert.equal(await element._setCommands(element._commandsList()), false);
  assert.deepEqual(calls.map((call) => call.type), ["sofabaton_x1s/command_config/get"]);
});

test("a late command-config reply for the previous device is dropped", async () => {
  // Proves CR-F3-6: without the guard, device A's slots land under B.
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };
  let releaseA: (value: unknown) => void = () => {};
  const { hass } = fakeWsHass({
    "command_config/get": (message) => message.device_key === "dev-a"
      ? new Promise((resolve) => { releaseA = resolve; })
      : { commands: [{ name: "B slot" }] },
  });
  element.hass = hass;

  element._selectedDeviceKey = "dev-a";
  const loadA = element._loadCommandConfigFromBackend(true);
  element._selectedDeviceKey = "dev-b";
  await element._loadCommandConfigFromBackend(true);
  releaseA({ commands: [{ name: "A slot" }] });
  await loadA;

  assert.equal(element._commandsData[0].name, "B slot");
});

test("re-entrant hub loads join the running chain instead of restarting it", async () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };
  let release: (value: unknown) => void = () => {};
  const { hass, calls } = fakeWsHass({
    "command_devices/list": () => new Promise((resolve) => { release = resolve; }),
    "hub_event_actions/get": () => ({ actions: {}, activity_actions: {} }),
    "wifi_event/list": () => ({ events: [], device_id: null }),
  });
  element.hass = hass;

  const first = element._ensureLoadedForCurrentHub();
  const second = element._ensureLoadedForCurrentHub();
  assert.equal(first, second);
  release({ devices: [], max_devices: 5 });
  await first;
  assert.equal(calls.filter((call) => call.type === "sofabaton_x1s/command_devices/list").length, 1);
});

test("the Wifi device card leaves Enter on its delete button to the button", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };
  element._wifiDevices = [{ device_key: "dev-1", device_name: "TV", configured_slot_count: 0 }];
  let opened = 0;
  element._selectWifiDevice = () => { opened += 1; };
  const handler = findHandler(element._renderDeviceListView(), "@keydown=");
  let prevented = false;
  const card = {};
  handler({ key: "Enter", target: {}, currentTarget: card, preventDefault: () => { prevented = true; } });
  assert.equal(opened, 0);
  assert.equal(prevented, false);
  handler({ key: "Enter", target: card, currentTarget: card, preventDefault: () => { prevented = true; } });
  assert.equal(opened, 1);
});

function findHandler(template: unknown, binding: string): (event: unknown) => void {
  const stack = [template];
  while (stack.length) {
    const node = stack.pop() as { strings?: string[]; values?: unknown[] } | unknown[] | null;
    if (!node || typeof node !== "object") continue;
    if (Array.isArray(node)) { stack.push(...node); continue; }
    const { strings, values } = node as { strings?: string[]; values?: unknown[] };
    if (strings && values) {
      for (let index = 0; index < values.length; index += 1) {
        if (strings[index].trimEnd().endsWith(binding) && typeof values[index] === "function") {
          return values[index] as (event: unknown) => void;
        }
      }
      stack.push(...values);
    }
  }
  throw new Error(`no ${binding} handler rendered`);
}
