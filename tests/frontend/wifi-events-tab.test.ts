/**
 * W4 tests for the WIFI EVENTS group in the Events secondary tab
 * (docs/internal/wifi-events-plan.md §5 / §9-W4): action-target routing,
 * press-flash matching, delete reference scan, and mutation plumbing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import "../../custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab";
import type { WifiEvent } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const WifiCommandsTabElement = customElements.get("sofabaton-wifi-commands-tab") as {
  new (): HTMLElement;
};

const EVENT: WifiEvent = {
  slot_index: 0,
  name: "Movie Night",
  long_press_enabled: true,
  action: { action: "perform-action", perform_action: "script.short" },
  long_press_action: { action: "perform-action", perform_action: "script.long" },
  command_id: 1,
  long_press_command_id: 51,
  device_id: 10,
  deployed: true,
};

function makeTab(callWS?: (msg: Record<string, unknown>) => Promise<unknown>) {
  const element = new WifiCommandsTabElement() as any;
  element.hub = { entry_id: "entry-1" };
  element.hass = {
    callWS: callWS ?? (async () => ({})),
    states: { "remote.hub": { attributes: { entry_id: "entry-1" } } },
  };
  element._wifiEventsRows = [EVENT];
  return element;
}

test("action target routing reads short and long actions per press type", () => {
  const tab = makeTab();
  const shortAction = tab._actionForHubEventTarget({ kind: "wifi_event", slotIndex: 0, pressType: "short" });
  const longAction = tab._actionForHubEventTarget({ kind: "wifi_event", slotIndex: 0, pressType: "long" });
  assert.equal(shortAction.perform_action, "script.short");
  assert.equal(longAction.perform_action, "script.long");
  // unknown slot falls back to the default (do-nothing) action
  const missing = tab._actionForHubEventTarget({ kind: "wifi_event", slotIndex: 7, pressType: "short" });
  assert.equal(missing.perform_action, undefined);
});

test("modal titles distinguish short and long press", () => {
  const tab = makeTab();
  assert.match(tab._hubEventEditorTitle({ kind: "wifi_event", slotIndex: 0, pressType: "short" }), /Movie Night/);
  assert.match(tab._hubEventEditorTitle({ kind: "wifi_event", slotIndex: 0, pressType: "long" }), /long/i);
});

test("press flash matches on device id + slot index + press type", () => {
  const tab = makeTab();
  const press = (over: Record<string, unknown>) => ({
    entryId: "entry-1",
    deviceId: 10,
    deviceName: "Wifi Events",
    commandIndex: 0,
    commandLabel: "Movie Night",
    pressType: "short",
    timestamp: 0,
    receivedAt: Date.now(),
    ...over,
  });
  assert.equal(tab._pressMatchesWifiEvent(press({}), EVENT, "short"), true);
  assert.equal(tab._pressMatchesWifiEvent(press({ pressType: "long" }), EVENT, "long"), true);
  assert.equal(tab._pressMatchesWifiEvent(press({ pressType: "long" }), EVENT, "short"), false);
  assert.equal(tab._pressMatchesWifiEvent(press({ deviceId: 9 }), EVENT, "short"), false);
  assert.equal(tab._pressMatchesWifiEvent(press({ commandIndex: 1 }), EVENT, "short"), false);
  assert.equal(tab._pressMatchesWifiEvent(null, EVENT, "short"), false);
});

test("set_action write goes through the narrow wifi_event endpoint", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const tab = makeTab(async (msg) => {
    calls.push(msg);
    return { events: [{ ...EVENT, action: { action: "perform-action", perform_action: "script.new" } }] };
  });
  const saved = await tab._writeHubEventAction(
    { kind: "wifi_event", slotIndex: 0, pressType: "short" },
    { action: "perform-action", perform_action: "script.new" },
  );
  assert.equal(saved, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "sofabaton_x1s/wifi_event/set_action");
  assert.equal(calls[0].slot_index, 0);
  assert.equal(calls[0].press_type, "short");
  // the response's events list replaces the rows
  assert.equal(tab._wifiEventsRows[0].action.perform_action, "script.new");
});

test("W7: the tab exposes no lifecycle mutations (actions only)", () => {
  // Delete / long-press-toggle / retry affordances were removed — the
  // event lifecycle lives in the editors' sync cycle.
  const tab = makeTab();
  assert.equal(tab._toggleWifiEventLongPress, undefined);
  assert.equal(tab._retryWifiEventsSync, undefined);
  assert.equal(tab._confirmWifiEventDelete, undefined);
  assert.equal(tab._scanWifiEventRefs, undefined);
  assert.equal(tab._renderWifiEventDeleteConfirm, undefined);
});

test("orphaned notice gates on configured rows plus a null record device id", () => {
  const tab = makeTab();
  // makeTab seeds one row and the default record device id (null).
  assert.equal(tab._wifiEventsOrphaned(), true);
  tab._wifiEventsDeviceId = 10;
  assert.equal(tab._wifiEventsOrphaned(), false);
  tab._wifiEventsDeviceId = null;
  tab._wifiEventsRows = [];
  assert.equal(tab._wifiEventsOrphaned(), false);
});

test("state payloads carry the record-level device id into the tab", () => {
  const tab = makeTab();
  tab._applyWifiEventsState({ events: [EVENT], device_id: 10 });
  assert.equal(tab._wifiEventsDeviceId, 10);
  assert.equal(tab._wifiEventsRows.length, 1);
  // a payload without device_id reads as not deployed
  tab._applyWifiEventsState({ events: [EVENT] });
  assert.equal(tab._wifiEventsDeviceId, null);
});

test("remove-config goes through wifi_event/clear_all and applies the response", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const tab = makeTab(async (msg) => {
    calls.push(msg);
    return { events: [], record_needs_sync: false, device_id: null };
  });
  tab._wifiEventsStaleConfirm = true;
  await tab._removeWifiEventsConfig();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, "sofabaton_x1s/wifi_event/clear_all");
  assert.deepEqual(tab._wifiEventsRows, []);
  assert.equal(tab._wifiEventsStaleConfirm, false);
  assert.equal(tab._wifiEventsStaleError, "");
});

test("configured detection drives the section pill and unconfigured filter", () => {
  const tab = makeTab();
  // EVENT has both actions configured.
  assert.equal(tab._wifiEventConfigured(EVENT), true);
  // Long action alone counts only while long press is enabled.
  const longOnly = { ...EVENT, action: { action: "perform-action" } };
  assert.equal(tab._wifiEventConfigured(longOnly), true);
  assert.equal(tab._wifiEventConfigured({ ...longOnly, long_press_enabled: false }), false);
  const bare = {
    ...EVENT,
    action: { action: "perform-action" },
    long_press_action: { action: "perform-action" },
  };
  assert.equal(tab._wifiEventConfigured(bare), false);

  // Activity entries: start or stop configured counts.
  tab._activityEventActions = {
    "101": { start: { action: "perform-action", perform_action: "scene.turn_on" }, stop: { action: "perform-action" } },
    "102": { start: { action: "perform-action" }, stop: { action: "perform-action" } },
  };
  assert.equal(tab._activityEventConfigured("101"), true);
  assert.equal(tab._activityEventConfigured("102"), false);
  assert.equal(tab._activityEventConfigured("103"), false);
});

test("remove-config failure keeps the rows and surfaces the error", async () => {
  const tab = makeTab(async () => {
    throw new Error("boom");
  });
  tab._wifiEventsStaleConfirm = true;
  await tab._removeWifiEventsConfig();
  assert.equal(tab._wifiEventsRows.length, 1);
  assert.equal(tab._wifiEventsStaleConfirm, true);
  assert.notEqual(tab._wifiEventsStaleError, "");
});
