// The activity editor's pure parts (docs/internal/server-panel-activity-editor-plan.md):
// the entity element inside the snapshot-as-bundle, the draft slot carrying
// the device elements an activity edit touched, the callback device's slots
// as the panel's Wifi Events, the target kind of a binding or a step, the
// macro time bytes, and the API client's activity write with its If-Match.

import assert from "node:assert/strict";
import test from "node:test";

import { setActivityDeviceInput } from "../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";
import { PanelApi, type SnapshotDocument, type SnapshotEntity } from "../../server-panel/src/panel-api";
import { draftBannerText } from "../../server-panel/src/panel-selectors";
import { hashFor, hubRoute, parseRoute, routeScope } from "../../server-panel/src/panel-route";
import { targetKindFor, wifiEventSlots } from "../../server-panel/src/views/activity-editor-state";
import { snapshotAsBundle } from "../../server-panel/src/views/device-editor-state";
import {
  byteToSeconds,
  entityDraftData,
  entityDraftScope,
  entityElement,
  secondsToByte,
  touchedDevices,
  withDraftData,
  withEntityElement,
} from "../../server-panel/src/views/entity-editor-state";

const SNAPSHOT: SnapshotDocument = {
  snapshot_id: "snap-1",
  captured_at: "2026-09-19T00:00:00Z",
  engine_generation: 1,
  complete: true,
  payload_profile: "structural",
  hub: { name: "X1S HUB", version: "X1S" },
  devices: [
    { kind: "device_backup", device: { device_id: 1, name: "TV", device_class: "ir" }, complete: true, editable: true, fetched_at: "t", commands: [{ command_id: 1, name: "Power" }, { command_id: 20, name: "HDMI 1" }], button_bindings: [], macros: [], input_record: null },
    { kind: "device_backup", device: { device_id: 3, name: "Server", device_class: "wifi_ip" }, complete: true, editable: true, fetched_at: "t", commands: [{ command_id: 2, name: "" }, { command_id: 1, name: "Doorbell" }, { command_id: 3, name: "Doorbell Long" }, { command_id: 4, name: "Button 2 Long" }] },
  ],
  activities: [
    {
      kind: "activity_backup", device: { device_id: 101, name: "Watch TV" }, complete: true, editable: true, fetched_at: "t",
      referenced_source_device_ids: [1], favorite_slots: [], button_bindings: [],
      macros: [
        { button_id: 198, name: "POWER_ON", steps: [{ device_id: 1, command_id: 198, button_code: 0, duration: 0, delay: 255 }, { device_id: 1, command_id: 197, button_code: 0, duration: 0, delay: 255 }] },
        { button_id: 199, name: "POWER_OFF", steps: [{ device_id: 1, command_id: 199, button_code: 0, duration: 0, delay: 255 }] },
      ],
    },
  ],
} as unknown as SnapshotDocument;

test("an activity element is read and swapped by kind; devices keep their own id space", () => {
  const bundle = snapshotAsBundle(SNAPSHOT);
  assert.equal(entityElement(bundle, "activity", 101)?.device?.name, "Watch TV");
  assert.equal(entityElement(bundle, "device", 101), null);
  assert.equal(entityElement(bundle, "activity", 1), null);
  const renamed = { ...entityElement(bundle, "activity", 101)!, device: { device_id: 101, name: "Movies" } };
  const next = withEntityElement(bundle, "activity", 101, renamed);
  assert.equal(entityElement(next, "activity", 101)?.device?.name, "Movies");
  assert.equal(next.devices, bundle.devices);
  assert.equal(entityElement(bundle, "activity", 101)?.device?.name, "Watch TV");
});

test("the editor's route, scope and dock wording follow the device editor's", () => {
  const route = hubRoute("hub1", "hub", "activities", 101);
  assert.equal(hashFor(route), "#/hub1/hub/activities/101");
  assert.deepEqual(parseRoute("#/hub1/hub/activities/101"), route);
  assert.equal(routeScope(route), entityDraftScope("activity", 101));
  assert.equal(entityDraftScope("device", 12), "hub/devices/12");
  assert.equal(draftBannerText(entityDraftScope("activity", 101)), "Unsynced changes — sync to the hub to apply them");
});

test("Set input touches the device: the draft carries it and a fresh snapshot gets both back", () => {
  const baseline = snapshotAsBundle(SNAPSHOT);
  assert.deepEqual(touchedDevices(baseline, baseline), []);
  const working = setActivityDeviceInput(baseline, 101, 1, 20);
  const touched = touchedDevices(working, baseline);
  assert.deepEqual(touched.map((entry) => entry.device?.device_id), [1]);
  assert.deepEqual((touched[0].input_record as { entries: Array<{ command_id: number }> }).entries.map((entry) => entry.command_id), [20]);

  const scope = entityDraftScope("activity", 101);
  const draft = { scope, snapshotId: "snap-1", updatedAt: 1, data: { element: entityElement(working, "activity", 101), devices: touched } };
  const data = entityDraftData(draft, "activity", 101);
  assert.ok(data);
  assert.equal(entityDraftData(draft, "activity", 102), null);
  assert.equal(entityDraftData(draft, "device", 101), null);
  assert.equal(entityDraftData({ ...draft, data: { element: { device: { device_id: 7 } } } }, "activity", 101), null);
  const restored = withDraftData(snapshotAsBundle(SNAPSHOT), "activity", 101, data!);
  assert.deepEqual(entityElement(restored, "activity", 101), entityElement(working, "activity", 101));
  assert.deepEqual(entityElement(restored, "device", 1), entityElement(working, "device", 1));
  // A draft without touched devices stays the device editor's shape.
  assert.deepEqual(Object.keys(entityDraftData({ scope, snapshotId: "s", updatedAt: 1, data: { element: entityElement(baseline, "activity", 101), devices: [] } }, "activity", 101)!), ["element"]);
});

test("the callback device's slots are the panel's Wifi Events: short record n, long record n + slots", () => {
  const bundle = snapshotAsBundle(SNAPSHOT);
  assert.deepEqual(wifiEventSlots(bundle, null), []);
  assert.deepEqual(wifiEventSlots(bundle, 9), []);           // a stale record: the device is not in the snapshot
  assert.deepEqual(wifiEventSlots(bundle, 3), [
    { slot: 0, label: "Doorbell", shortCommandId: 1, longCommandId: 3 },
    { slot: 1, label: "Button 2", shortCommandId: 2, longCommandId: 4 },   // an empty label falls back to the default
  ]);
});

test("a target on the activity itself is a macro, on the callback device a Wifi Event, anything else a command", () => {
  assert.equal(targetKindFor(101, 3, true, 101), "action");
  assert.equal(targetKindFor(101, 3, true, 3), "wifi_event");
  assert.equal(targetKindFor(101, 3, false, 3), "command");
  assert.equal(targetKindFor(101, null, true, 3), "command");
  assert.equal(targetKindFor(101, 3, true, 1), "command");
  assert.equal(targetKindFor(101, 3, true, null), "command");
});

test("macro time bytes are half seconds, snapped and clamped", () => {
  assert.equal(byteToSeconds(0), "0");
  assert.equal(byteToSeconds(3), "1.5");
  assert.equal(byteToSeconds(4), "2");
  assert.equal(secondsToByte("1.3"), 3);
  assert.equal(secondsToByte("-2"), 0);
  assert.equal(secondsToByte("nope"), 0);
  assert.equal(secondsToByte("500"), 255);
});

test("the API client writes an activity with If-Match and sends touched devices only when there are any", async () => {
  const calls: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
  const api = new PanelApi("http://server", (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: String(init?.method), headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify({ job_id: "j1" }), { status: 202, headers: { "content-type": "application/json" } });
  }) as typeof fetch);
  const element = { kind: "activity_backup", device: { device_id: 101, name: "Movies" }, complete: true } as SnapshotEntity;
  const touched = { kind: "device_backup", device: { device_id: 1 }, complete: true } as SnapshotEntity;
  await api.editActivity("hub 1", 101, element, [], "snap-1");
  await api.editActivity("hub 1", 101, element, [touched], "snap-1");
  await api.removeActivity("hub 1", 101);
  assert.equal(calls[0].url, "http://server/api/v1/hubs/hub%201/activities/101");
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].headers["If-Match"], '"snap-1"');
  assert.deepEqual(calls[0].body, element);
  assert.deepEqual(calls[1].body, { ...element, devices: [touched] });
  assert.equal(calls[2].method, "DELETE");
  assert.equal(calls[2].url, "http://server/api/v1/hubs/hub%201/activities/101");
});
