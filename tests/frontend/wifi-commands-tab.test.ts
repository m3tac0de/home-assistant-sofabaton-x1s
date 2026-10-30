import { nothing } from "lit";
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

test("a saved button changes hands only in the activities both commands name (issue #306)", async () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };
  element._selectedDeviceKey = "soundbar";
  const volup = (activities: string[], extra: Record<string, unknown> = {}) =>
    ({ name: "Volume Up", add_as_favorite: false, hard_button: "volup", activities, ...extra });
  const devices = [
    { device_key: "soundbar", device_name: "Soundbar", commands: [] },
    { device_key: "amp", device_name: "Amp", commands: [volup(["102"])] },                      // Cinema only
    { device_key: "atv", device_name: "Apple TV", commands: [volup(["101", "103"])] },           // TV and PS5
    { device_key: "hifi", device_name: "Hifi", commands: [volup(["101", "102"], { add_as_favorite: true })] },
  ];
  const { hass, calls } = fakeWsHass({
    "command_config/set": () => ({}),
    "command_devices/list": () => ({ devices }),
    "command_sync/progress": () => ({ status: "idle" }),
  });
  (hass as any).states = {
    "remote.living": { state: "on", attributes: { entry_id: "hub-1", activities: [{ id: 101, name: "TV" }, { id: 102, name: "Cinema" }, { id: 103, name: "PS5" }] } },
  };
  element.hass = hass;
  element._wifiDevices = devices;
  element._commandsData = element._normalizeCommandsForStorage([
    { name: "Louder", add_as_favorite: false, hard_button: "volup", activities: ["101", "103"] },
    { name: "Quiet", add_as_favorite: false, hard_button: "voldn", activities: ["101"] },
  ]);
  element._activeCommandSlot = 2;
  element._updateActiveCommandDraft({ name: "Volume Up", add_as_favorite: false, hard_button: "volup", activities: ["101"] });   // VOL+ in TV

  assert.deepEqual(element._hardButtonReplacementLabels(), [
    'Replaces "Louder" on this button in TV',
    'Replaces "Volume Up" from Apple TV in TV',
    'Replaces "Volume Up" from Hifi',                       // a favorite's activities are its button's too
  ]);

  await element._saveActiveCommandModal();
  const sets = calls.filter((call) => call.type === "sofabaton_x1s/command_config/set");
  assert.deepEqual(sets.map((call) => call.device_key), ["atv", "hifi", "soundbar"]);   // the Amp binds VOL+ in Cinema only: left alone
  const [atv, hifi, soundbar] = sets.map((call) => (call.commands as Array<Record<string, unknown>>)[0]);
  assert.deepEqual([atv.hard_button, atv.activities], ["volup", ["103"]]);
  assert.deepEqual([hifi.hard_button, hifi.add_as_favorite, hifi.activities], ["", true, ["101", "102"]]);
  assert.deepEqual([soundbar.hard_button, soundbar.activities], ["volup", ["103"]]);
  const saved = (sets[2].commands as Array<Record<string, unknown>>)[2];
  assert.deepEqual([saved.hard_button, saved.activities], ["volup", ["101"]]);
});

test("a button in activities nobody else binds it in replaces nothing", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };
  element._selectedDeviceKey = "soundbar";
  element.hass = { states: { "remote.living": { state: "on", attributes: { entry_id: "hub-1", activities: [{ id: 101, name: "TV" }, { id: 102, name: "Cinema" }] } } } };
  element._wifiDevices = [
    { device_key: "amp", device_name: "Amp", commands: [{ name: "Volume Up", add_as_favorite: false, hard_button: "volup", activities: ["102"] }] },
  ];
  element._activeCommandSlot = 0;
  element._updateActiveCommandDraft({ name: "Volume Up", add_as_favorite: false, hard_button: "volup", activities: ["101"] });
  assert.deepEqual(element._hardButtonReplacementLabels(), []);
  element._updateActiveCommandDraft({ activities: ["101", "102"] });
  assert.deepEqual(element._hardButtonReplacementLabels(), ['Replaces "Volume Up" from Amp']);   // Cinema was all it had
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

// ── Delivery method pill on the selected Wifi Device (read-only) ────────

test("a device row's pill is read-only, shows on every hub and warns when presses don't arrive", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1" };
  const device = { device_key: "dev-1", device_name: "TV", configured_slot_count: 1, deployed_device_id: 3, deployed_transport: "http", requested_transport: "http" };
  // No MQTT for this hub (an X1 / X1S): the pill shows anyway.
  element._mqttAvailable = false;
  const deployed = JSON.stringify(element._renderTransportPill(device));
  assert.match(deployed, /"transport-pill http"/);
  assert.match(deployed, /HTTP/);
  assert.doesNotMatch(deployed, /<button|<select/);
  const pending = JSON.stringify(element._renderTransportPill({ ...device, requested_transport: "mqtt", transport_switch_pending: true }));
  assert.match(pending, /transport-pill mqtt pending/);
  const failed = JSON.stringify(element._renderTransportPill({ ...device, delivery: { status: "not_delivered" } }));
  assert.match(failed, /transport-pill http attention/);
  // Not on the hub yet: a stale result never warns.
  const fresh = JSON.stringify(element._renderTransportPill({ ...device, deployed_device_id: null, delivery: { status: "not_delivered" } }));
  assert.doesNotMatch(fresh, /attention"/);
});

// ── Edit device (name, icon, X2 color) on a deployed Wifi Device ────────

function editDeviceHass(bundle: Record<string, unknown>) {
  const calls: Array<Record<string, unknown>> = [];
  const hass = {
    states: {},
    callWS: async (message: Record<string, unknown>) => {
      calls.push(message);
      const type = String(message.type).replace("sofabaton_x1s/", "");
      if (type === "cache/structural_bundle") return { bundle: structuredClone(bundle), generation: 1 };
      if (type === "device/sync") return { operation_id: "op-1" };
      return {};
    },
    connection: {
      subscribeMessage: async (onMessage: (payload: Record<string, unknown>) => void, message: Record<string, unknown>) => {
        calls.push(message);
        queueMicrotask(() => onMessage({ status: "running", message: "Updating the device…" }));
        setTimeout(() => onMessage({ status: "success" }), 0);
        return () => undefined;
      },
    },
  };
  return { hass, calls };
}

function editDeviceElement(bundle: Record<string, unknown>) {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", version: "X2" };
  element._wifiDevices = [{ device_key: "dev-1", device_name: "TV", configured_slot_count: 1, deployed_device_id: 7 }];
  element._selectedDeviceKey = "dev-1";
  const { hass, calls } = editDeviceHass(bundle);
  element.hass = hass;
  const notices: Array<{ tone: string; label: string }> = [];
  element.showCompletion = (notice: { tone: string; label: string }) => { notices.push(notice); };
  return { element, calls, notices };
}

const EDIT_BUNDLE = {
  hub: { version: "X2" },
  activities: [],
  devices: [{ device: { device_id: 7, name: "TV", brand: "m3-dev-1-abc", icon: 3, color_id: 0 }, commands: [] }],
};

test("the Edit device pencil shows only once the Wifi Device is on the hub", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", version: "X2" };
  const device = { device_key: "dev-1", device_name: "TV", configured_slot_count: 0 };
  assert.equal(element._renderDeviceEdit({ ...device, deployed_device_id: null }, false), nothing);
  const deployed = JSON.stringify(element._renderDeviceEdit({ ...device, deployed_device_id: 7 }, false));
  assert.match(deployed, /mdi:pencil/);
  assert.match(deployed, /Edit device/);
});

test("saving the Edit device dialog syncs only what changed and keeps the name", async () => {
  const { element, calls, notices } = editDeviceElement(EDIT_BUNDLE);
  await element._openEditDeviceDialog();
  assert.equal(element._editDeviceDialog.cached, true);
  assert.equal(element._editDeviceDialog.name, "TV");
  assert.deepEqual(element._editDeviceDialog.appearance, { icon: 3, colorId: 0 });

  element._patchEditDeviceDialog({ appearance: { icon: 12, colorId: 0 } });
  await element._saveEditDeviceDialog();

  const sync = calls.find((call) => call.type === "sofabaton_x1s/device/sync") as Record<string, any>;
  assert.ok(sync, "device/sync was called");
  assert.equal(sync.device_id, 7);
  assert.equal(sync.baseline.devices[0].device.icon, 3);
  assert.deepEqual(
    { name: sync.edited.devices[0].device.name, icon: sync.edited.devices[0].device.icon, color_id: sync.edited.devices[0].device.color_id },
    { name: "TV", icon: 12, color_id: 0 },
  );
  assert.ok(calls.some((call) => call.type === "sofabaton_x1s/backup/progress_subscribe" && call.operation_id === "op-1"));
  assert.equal(element._editDeviceDialog, null);
  assert.equal(element._deviceEditRunning, false);
  assert.deepEqual(notices.map((notice) => notice.tone), ["success"]);
});

test("an untouched Edit device dialog writes nothing", async () => {
  const { element, calls } = editDeviceElement(EDIT_BUNDLE);
  await element._openEditDeviceDialog();
  await element._saveEditDeviceDialog();
  assert.equal(element._editDeviceDialog, null);
  assert.equal(calls.some((call) => call.type === "sofabaton_x1s/device/sync"), false);
});

test("the Edit device dialog refuses to save a device the hub cache does not hold", async () => {
  const { element, calls } = editDeviceElement({ ...EDIT_BUNDLE, devices: [] });
  await element._openEditDeviceDialog();
  assert.equal(element._editDeviceDialog.cached, false);
  assert.ok(element._editDeviceDialog.error);
  element._patchEditDeviceDialog({ name: "Telly" });
  await element._saveEditDeviceDialog();
  assert.ok(element._editDeviceDialog, "the dialog stays open");
  assert.equal(calls.some((call) => call.type === "sofabaton_x1s/device/sync"), false);
});

test("the Wifi device header swaps its pencil for the record's tile once the remote entity publishes it", () => {
  const element = new WifiCommandsTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", version: "X2" };
  const device = { device_key: "dev-1", device_name: "TV", configured_slot_count: 0, deployed_device_id: 7 };
  const remote = (devices: unknown[]) => ({ states: { "remote.living": { state: "on", attributes: { entry_id: "hub-1", hub_version: "X2", devices } } } });
  element.hass = remote([]);
  const plain = JSON.stringify(element._renderDeviceEdit(device, false));
  assert.match(plain, /mdi:pencil/);
  assert.doesNotMatch(plain, /detail-entity-tile/);
  element.hass = remote([{ id: 7, name: "TV", icon: 16, color_id: 2 }]);
  const rendered = JSON.stringify(element._renderDeviceEdit(device, false));
  assert.match(rendered, /detail-entity-tile/);
  assert.match(rendered, /#F16161/);
  assert.equal(element._renderDeviceEdit({ ...device, deployed_device_id: null }, false), nothing);
});

test("the header tile opens the Edit device dialog with the picker on demand", async () => {
  const { element } = editDeviceElement(EDIT_BUNDLE);
  await element._openEditDeviceDialog();
  assert.equal(element._editDeviceDialog.pickerOpen, false);
});
