// The Wifi Commands tab (docs/internal/server-panel-wifi-commands-plan.md):
// the view's pure helpers (the draft, the card's slot dialog rules, the hard
// buttons, the tile's meta line, the cross-device button cleanup, the roster
// status, the press matching behind the glow),
// the route's fourth segment, the API client's wifi-devices calls and the
// dock's unsynced line. No DOM.

import assert from "node:assert/strict";
import test from "node:test";

import { PanelApi, type WifiDeviceSpec, type WifiDeviceView } from "../../server-panel/src/panel-api";
import { HUB_TABS, SUBTABS, hashFor, hubRoute, parseRoute, routeScope, subtabLabel } from "../../server-panel/src/panel-route";
import { jobLabel } from "../../server-panel/src/panel-selectors";
import type { PressEvent } from "../../server-panel/src/panel-store";
import {
  HARD_BUTTONS,
  PRESS_FLASH_MS,
  WIFI_SLOT_COUNT,
  activitiesEnabled,
  availableHardButtons,
  buttonCleanups,
  configuredCount,
  defaultSlotLabel,
  deviceStatus,
  draftFromSpec,
  draftsEqual,
  hardButtonByCode,
  isSlotConfigured,
  nameProblem,
  otherDeviceHoldingButton,
  pressIsFresh,
  pressMatchesDevice,
  pressMatchesSlot,
  sanitizeWifiName,
  slotEditFrom,
  slotHoldingButton,
  slotHoldingInput,
  slotMeta,
  specFromDraft,
  supportsPowerInput,
  targetMoved,
  withActivityToggled,
  withDefaultActivity,
  withPowerSlot,
  withSlotCleared,
  withSlotLabel,
  withSlotSaved,
  type SlotEdit,
} from "../../server-panel/src/views/wifi-devices-state";

function spec(overrides: Partial<WifiDeviceSpec> = {}): WifiDeviceSpec {
  // The server's normalized form: ten slots, long labels filled in.
  const slots = Array.from({ length: WIFI_SLOT_COUNT }, (_row, i) => ({ label: `Button ${i + 1}`, long_label: `Button ${i + 1} Long` }));
  slots[0] = { label: "Lights on", long_label: "Lights on Long", favorite: true, button: 182, long_press: true, activities: [102, 101], input_activity_id: null } as (typeof slots)[number];
  slots[1] = { label: "Lights off", long_label: "All off" };
  return { name: "Lights", slots, power_on_slot: 1, power_off_slot: null, input_slots: [2], brand: "c0-a1b2c3d4", ...overrides };
}

function device(overrides: Partial<WifiDeviceView> = {}): WifiDeviceView {
  return {
    key: "a1b2c3d4", transport: "http", device_id: 7, spec: spec(), target: { host: "192.168.1.10", port: 8060, action_id: "aabb" },
    labels: {}, hub_version: "X1S", deployed_at: "t", adopted: false, stale: false, deployed: true, pending: null,
    effective_destination: { host: "192.168.1.10", port: 8060 }, ...overrides,
  };
}

function press(overrides: Partial<PressEvent> = {}): PressEvent {
  return { seq: 1, deviceId: 7, deviceKey: "a1b2c3d4", slot: 2, commandId: 2, label: "Lights off", pressType: "short", resolution: "deployed", at: 1000, ...overrides };
}

test("the draft round-trips the server's spec and keeps only long labels someone set", () => {
  const draft = draftFromSpec(spec());
  assert.equal(draft.slots.length, WIFI_SLOT_COUNT);
  assert.deepEqual(draft.slots[0], { label: "Lights on", longLabel: null, favorite: true, button: 182, longPress: true, activities: [101, 102], inputActivityId: null });   // `<label> Long` follows the label
  assert.equal(draft.slots[1].longLabel, "All off");                                  // a label set through the API stays
  assert.deepEqual([draft.powerOn, draft.powerOff, draft.inputs], [1, null, [2]]);
  const body = specFromDraft(draft);
  assert.deepEqual(body.slots[0], { label: "Lights on", long_label: null, favorite: true, button: 182, long_press: true, activities: [101, 102], input_activity_id: null });
  assert.deepEqual(body.slots[1], { label: "Lights off", long_label: "All off", favorite: false, button: null, long_press: false, activities: [], input_activity_id: null });
  assert.equal(body.slots.length, WIFI_SLOT_COUNT);                                   // every slot is sent: an omitted one would be reset
  assert.deepEqual([body.name, body.power_on_slot, body.power_off_slot, body.input_slots], ["Lights", 1, null, [2]]);
  assert.equal("brand" in body, false);                                               // the server owns the brand
  // A record from before slots had references (the 0.2.0 callback device) reads as plain slots.
  const old = draftFromSpec({ name: "Server", slots: [{ label: "Play", long_label: "Play Long" }], power_on_slot: null, power_off_slot: null, input_slots: [] });
  assert.deepEqual(old.slots[0], { label: "Play", longLabel: null, favorite: false, button: null, longPress: false, activities: [], inputActivityId: null });
  // A short or empty spec (a brand-new device) pads to ten unnamed slots.
  const fresh = draftFromSpec(null);
  assert.equal(fresh.slots[9].label, defaultSlotLabel(10));
  assert.equal(configuredCount(fresh), 0);
  assert.equal(draftsEqual(draftFromSpec(spec()), draft), true);
  // An activity list with nothing to hold it never travels (issue #258).
  const loose = { ...fresh, slots: fresh.slots.map((slot, i) => (i === 0 ? { ...slot, label: "X", activities: [101], longPress: true } : slot)) };
  assert.deepEqual([specFromDraft(loose).slots[0].activities, specFromDraft(loose).slots[0].long_press], [[], false]);
});

test("an unnamed slot is the Make Command tile; clearing resets the name and the roles", () => {
  let draft = draftFromSpec(spec());
  assert.equal(isSlotConfigured(draft, 0), true);
  assert.equal(isSlotConfigured(draft, 2), false);
  assert.equal(configuredCount(draft), 2);
  draft = withSlotLabel(draft, 2, "Scene");
  assert.equal(configuredCount(draft), 3);
  draft = withSlotCleared(draft, 0);                                                  // slot 1 was the power-on hook, a favorite and on VOL+
  assert.deepEqual([draft.slots[0].label, draft.slots[0].favorite, draft.slots[0].button, draft.slots[0].activities, draft.powerOn], ["Button 1", false, null, [], null]);
  draft = withSlotCleared(draft, 1);                                                  // slot 2 was an input with its own long label
  assert.deepEqual([draft.slots[1].label, draft.slots[1].longLabel, draft.inputs], ["Button 2", null, []]);
  assert.equal(draftsEqual(draft, draftFromSpec(spec())), false);
});

test("the slot dialog's save follows the card: one slot per button, one input per activity, an input is no power command", () => {
  const draft = draftFromSpec(spec());
  // Opening a slot: an unnamed one starts with an empty name; a favorite or a button with no activity takes the first.
  assert.equal(slotEditFrom(draft, 4).label, "");
  assert.equal(slotEditFrom(draft, 0).label, "Lights on");
  const blank = slotEditFrom(draft, 4);
  assert.deepEqual(withDefaultActivity({ ...blank, favorite: true }, [101, 102]).activities, [101]);
  assert.deepEqual(withDefaultActivity(blank, [101, 102]).activities, []);
  assert.deepEqual(withDefaultActivity({ ...blank, favorite: true }, []).activities, []);
  // The chips: toggling adds and removes, but the last one stays; nothing toggles without a favorite or a button.
  let edit: SlotEdit = { ...blank, label: "Scene", button: 182, longPress: true, activities: [101] };
  assert.equal(activitiesEnabled(edit), true);
  edit = withActivityToggled(edit, 102);
  assert.deepEqual(edit.activities, [101, 102]);
  assert.deepEqual(withActivityToggled(withActivityToggled(edit, 101), 102).activities, [102]);
  assert.deepEqual(withActivityToggled(blank, 101).activities, []);

  // Slot 5 takes VOL+ from slot 1: slot 1 keeps its favorite and its activities, loses the button and the long press.
  assert.equal(slotHoldingButton(draft, 182, 4), 0);
  assert.equal(slotHoldingButton(draft, 182, 0), -1);
  let saved = withSlotSaved(draft, 4, edit, { powerInput: true });
  assert.deepEqual(saved.slots[4], { label: "Scene", longLabel: null, favorite: false, button: 182, longPress: true, activities: [101, 102], inputActivityId: null });
  assert.deepEqual([saved.slots[0].button, saved.slots[0].longPress, saved.slots[0].favorite, saved.slots[0].activities], [null, false, true, [101, 102]]);
  // A slot that only had the button loses its activities with it.
  const onlyButton = withSlotSaved(draftFromSpec(spec()), 5, { ...blank, label: "B", button: 185, activities: [101] }, { powerInput: true });
  assert.deepEqual(withSlotSaved(onlyButton, 6, { ...blank, label: "C", button: 185, activities: [102] }, { powerInput: true }).slots[5].activities, []);

  // An input: slot 1 (the power ON command) becomes activity 101's input and stops being a power command;
  // the slot that was 101's input gives it up.
  saved = withSlotSaved(saved, 6, { ...blank, label: "Old input", inputActivityId: 101 }, { powerInput: true });
  assert.equal(slotHoldingInput(saved, 101, 0), 6);
  saved = withSlotSaved(saved, 0, { ...slotEditFrom(saved, 0), inputActivityId: 101 }, { powerInput: true });
  assert.deepEqual([saved.slots[0].inputActivityId, saved.slots[6].inputActivityId, saved.powerOn], [101, null, null]);
  // ... and pointing a power line at an input slot clears the input (the library refuses both).
  const power = withPowerSlot(saved, "off", 1);
  assert.deepEqual([power.powerOff, power.slots[0].inputActivityId], [1, null]);
  assert.deepEqual([withPowerSlot(draft, "off", 2).powerOff, withPowerSlot(draft, "off", 2).inputs], [2, []]);   // slot 2 was on the input list
  assert.equal(withPowerSlot(draft, "on", null).powerOn, null);
  // One command can be both power commands, as on the card.
  const both = withPowerSlot(withPowerSlot(draft, "on", 4), "off", 4);
  assert.deepEqual([both.powerOn, both.powerOff], [4, 4]);
  // On an X1 the dialog has no input switch, and a save never touches what the spec carried.
  const x1 = withSlotSaved(saved, 0, { ...slotEditFrom(saved, 0), inputActivityId: null }, { powerInput: false });
  assert.equal(x1.slots[0].inputActivityId, 101);
});

test("hard buttons: the card's table, the X2's extra keys only on an X2", () => {
  assert.equal(HARD_BUTTONS.length, 27);
  assert.equal(new Set(HARD_BUTTONS.map((b) => b.code)).size, 27);
  assert.deepEqual([hardButtonByCode(182)?.name, hardButtonByCode(151)?.name, hardButtonByCode(198), hardButtonByCode(null)], ["volup", "c", null, null]);
  assert.equal(availableHardButtons("X2").length, 27);
  assert.equal(availableHardButtons("X1S").length, 20);
  assert.equal(availableHardButtons("X1").some((b) => b.name === "play"), false);
  assert.equal(availableHardButtons("X1").some((b) => b.name === "pause"), true);
});

test("the tile's meta line is the card's", () => {
  let draft = draftFromSpec(spec());
  assert.deepEqual(slotMeta(draft, 0, { powerInput: true }), { kind: "activities", count: 2 });        // a favorite and a button win over the power role
  assert.deepEqual(slotMeta(draft, 1, { powerInput: true }), { kind: "input", activityId: null });      // on the API's input list
  draft = withSlotLabel(draft, 2, "Named only");
  assert.deepEqual(slotMeta(draft, 2, { powerInput: true }), { kind: "unconfigured" });
  assert.equal(isSlotConfigured(draft, 2), true);
  draft = withPowerSlot(withPowerSlot(draft, "on", 3), "off", 3);
  assert.deepEqual(slotMeta(draft, 2, { powerInput: true }), { kind: "power", on: true, off: true });
  draft = withSlotSaved(draft, 3, { ...slotEditFrom(draft, 3), label: "In", inputActivityId: 102 }, { powerInput: true });
  assert.deepEqual(slotMeta(draft, 3, { powerInput: true }), { kind: "input", activityId: 102 });
  // An X1 shows neither power nor input wording.
  assert.deepEqual(slotMeta(draft, 2, { powerInput: false }), { kind: "activities", count: 0 });
});

test("a button taken from another Wifi Device is cleared from that device's spec after the sync", () => {
  const blinds = device({ key: "0badf00d", device_id: 8, spec: spec({ name: "Blinds", power_on_slot: null, input_slots: [] }) });   // its slot 1 holds VOL+ (182)
  const stale = device({ key: "5ca1ab1e", device_id: 9, stale: true, spec: spec({ name: "Gone" }) });
  const mine = device({ key: "a1b2c3d4", spec: spec({ slots: [] }) });
  const devices = [mine, blinds, stale];
  assert.deepEqual(otherDeviceHoldingButton(devices, "a1b2c3d4", 182)?.slotLabel, "Lights on");
  assert.equal(otherDeviceHoldingButton(devices, "a1b2c3d4", 185), null);
  assert.equal(otherDeviceHoldingButton([mine], "a1b2c3d4", 182), null);
  const blank = slotEditFrom(draftFromSpec(mine.spec), 0);
  const draft = withSlotSaved(draftFromSpec(mine.spec), 0, { ...blank, label: "Vol", button: 182, activities: [101] }, { powerInput: true });
  const cleanups = buttonCleanups(devices, "a1b2c3d4", draft);
  assert.deepEqual(cleanups.map((c) => c.device.key), ["0badf00d"]);                   // a stale device has nothing to write
  const theirs = cleanups[0].spec.slots[0];
  assert.deepEqual([theirs.button, theirs.long_press, theirs.favorite, theirs.activities], [null, false, true, [101, 102]]);
  assert.equal(cleanups[0].spec.name, "Blinds");
  assert.deepEqual(buttonCleanups(devices, "a1b2c3d4", draftFromSpec(mine.spec)), []);
});

test("names: the card's sanitiser per hub model, 20 wide, and the save checks", () => {
  assert.equal(sanitizeWifiName("X1", "Küche: Licht!"), "Kche Licht");
  assert.equal(sanitizeWifiName("X1S", "Küche: Licht!"), "Küche: Licht!");
  assert.equal(sanitizeWifiName("X2", "x".repeat(40)).length, 20);
  assert.equal(supportsPowerInput("X1"), false);
  assert.equal(supportsPowerInput("X1S"), true);
  assert.equal(supportsPowerInput("X2"), true);
  const messages = { required: "required", leadingSpace: "leading" };
  assert.equal(nameProblem("", messages), "required");
  assert.equal(nameProblem("   ", messages), "required");
  assert.equal(nameProblem(" Lights", messages), "leading");
  assert.equal(nameProblem("Lights", messages), null);
});

test("the roster's status and the moved-address check", () => {
  assert.deepEqual(deviceStatus(device()), { tone: "sync-ok", label: "Synced" });
  assert.deepEqual(deviceStatus(device({ stale: true, deployed: false })), { tone: "sync-error", label: "Missing from hub" });
  assert.deepEqual(deviceStatus(device({ device_id: null, pending: { op: "create", started_at: "t" } })), { tone: "sync-pending", label: "Pending" });
  assert.equal(deviceStatus(device(), { deleting: true }).tone, "sync-running");
  assert.equal(targetMoved(device()), false);
  assert.equal(targetMoved(device({ effective_destination: { host: "192.168.1.99", port: 8060 } })), true);
  assert.equal(targetMoved(device({ effective_destination: { host: "192.168.1.10", port: 8061 } })), true);
  assert.equal(targetMoved(device({ effective_destination: null })), false);          // the hub is disabled: nothing to compare
});

test("the glow: fresh for 720 ms, matched by key (or by device id), a long press lights its slot's tile", () => {
  assert.equal(PRESS_FLASH_MS, 720);
  assert.equal(pressIsFresh(press(), 1000), true);
  assert.equal(pressIsFresh(press(), 1719), true);
  assert.equal(pressIsFresh(press(), 1720), false);
  assert.equal(pressIsFresh(press(), 999), false);
  assert.equal(pressIsFresh(null, 1000), false);
  assert.equal(pressMatchesDevice(press(), device()), true);
  assert.equal(pressMatchesDevice(press(), device({ key: "ffffffff" })), false);      // the key decides, even on a reused device id
  assert.equal(pressMatchesDevice(press({ deviceKey: null }), device({ key: "ffffffff" })), true);   // an older server: by device id
  assert.equal(pressMatchesDevice(press({ deviceKey: null, deviceId: 9 }), device()), false);
  assert.equal(pressMatchesSlot(press(), device(), 1), true);
  assert.equal(pressMatchesSlot(press(), device(), 0), false);
  assert.equal(pressMatchesSlot(press({ pressType: "long", commandId: 12 }), device(), 1), true);
  assert.equal(pressMatchesSlot(press({ slot: null, resolution: "unknown_slot" }), device(), 1), false);
});

test("the route: a Wifi Commands tab whose fourth segment is a device key", () => {
  assert.deepEqual([...HUB_TABS], ["hub", "wifi", "backup", "remote"]);
  assert.deepEqual([...SUBTABS.wifi], ["devices"]);
  assert.equal(subtabLabel("wifi", "devices"), "Wifi Devices");
  assert.equal(subtabLabel("hub", "devices"), "Devices");
  assert.deepEqual(parseRoute("#/aabb/wifi"), { kind: "hub", hubId: "aabb", tab: "wifi", sub: "devices" });
  assert.deepEqual(parseRoute("#/aabb/wifi/devices/a1b2c3d4"), { kind: "hub", hubId: "aabb", tab: "wifi", sub: "devices", item: "a1b2c3d4" });
  assert.deepEqual(parseRoute("#/aabb/wifi/devices/default"), { kind: "hub", hubId: "aabb", tab: "wifi", sub: "devices", item: "default" });
  assert.equal(hashFor(hubRoute("aabb", "wifi", "devices", null, "a1b2c3d4")), "#/aabb/wifi/devices/a1b2c3d4");
  assert.equal(routeScope(hubRoute("aabb", "wifi", "devices", null, "a1b2c3d4")), "wifi/devices/a1b2c3d4");
  // A key belongs on this tab only, an entity id on the Hub tab only.
  assert.deepEqual(hubRoute("aabb", "hub", "devices", 12, "a1b2c3d4"), { kind: "hub", hubId: "aabb", tab: "hub", sub: "devices", entity: 12 });
  assert.deepEqual(hubRoute("aabb", "wifi", "devices", 12, "a1b2c3d4"), { kind: "hub", hubId: "aabb", tab: "wifi", sub: "devices", item: "a1b2c3d4" });
  assert.deepEqual(parseRoute("#/aabb/wifi/devices/bad%20key"), { kind: "hub", hubId: "aabb", tab: "wifi", sub: "devices" });
  assert.deepEqual(parseRoute("#/aabb/hub/devices/12"), { kind: "hub", hubId: "aabb", tab: "hub", sub: "devices", entity: 12 });
});

test("the API client's wifi-devices calls and the job labels", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const api = new PanelApi("http://host:8480", async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({}), { status: 202, headers: { "content-type": "application/json" } });
  });
  const body = specFromDraft(draftFromSpec(spec()));
  await api.wifiDevices("aa bb");
  await api.createWifiDevice("aabb", body, "http");
  await api.updateWifiDevice("aabb", "a1b2c3d4", body);
  await api.removeWifiDevice("aabb", "a1b2c3d4");
  await api.removeWifiDevice("aabb", "a1b2c3d4", true);
  await api.redeployWifiDevice("aabb", "a1b2c3d4");
  assert.deepEqual(calls.map((c) => `${c.init?.method} ${c.url.replace("http://host:8480/api/v1/", "")}`), [
    "GET hubs/aa%20bb/wifi-devices",
    "POST hubs/aabb/wifi-devices",
    "PUT hubs/aabb/wifi-devices/a1b2c3d4",
    "DELETE hubs/aabb/wifi-devices/a1b2c3d4",
    "DELETE hubs/aabb/wifi-devices/a1b2c3d4?force=true",
    "POST hubs/aabb/wifi-devices/a1b2c3d4/redeploy",
  ]);
  const created = JSON.parse(String(calls[1].init?.body));
  assert.equal(created.transport, "http");
  assert.equal(created.slots.length, WIFI_SLOT_COUNT);
  assert.equal("transport" in JSON.parse(String(calls[2].init?.body)), false);         // a deployed device's transport is fixed
  assert.equal(jobLabel("deploy_wifi_device"), "Deploying the Wifi Device");
  assert.equal(jobLabel("update_wifi_device"), "Syncing the Wifi Device");
});
