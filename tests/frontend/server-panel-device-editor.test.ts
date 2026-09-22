// The device editor's pure parts (docs/internal/server-panel-device-editor-plan.md):
// the snapshot read as a bundle, the element splice, the draft scope and
// restore, the name sanitiser per hub model, the firmware floor, the Wifi
// Events pairing, and the API client's device write with its If-Match.

import assert from "node:assert/strict";
import test from "node:test";

import { PanelApi, type SnapshotDocument } from "../../server-panel/src/panel-api";
import { draftBannerText } from "../../server-panel/src/panel-selectors";
import { hashFor, hubRoute, parseRoute, routeScope } from "../../server-panel/src/panel-route";
import {
  deviceDraftScope,
  deviceElement,
  draftElementFor,
  elementsEqual,
  firmwareUnsupported,
  isLongRecord,
  sanitizeName,
  snapshotAsBundle,
  supportsUnicodeNames,
  wifiEventsSlotCount,
  withDeviceElement,
} from "../../server-panel/src/views/device-editor-state";

const SNAPSHOT: SnapshotDocument = {
  snapshot_id: "snap-1",
  captured_at: "2026-09-18T00:00:00Z",
  engine_generation: 1,
  complete: true,
  payload_profile: "structural",
  hub: { name: "X1S HUB", version: "X1S" },
  devices: [
    { kind: "device_backup", device: { device_id: 1, name: "TV", device_class: "ir", idle_behavior: 1 }, complete: true, editable: true, fetched_at: "t", commands: [{ command_id: 1, name: "Power" }, { command_id: 2, name: "Mute" }], button_bindings: [], macros: [] },
    { kind: "device_backup", device: { device_id: 12, name: "Wifi Events", brand: "m3-haevents-abc" }, complete: true, editable: true, fetched_at: "t", commands: [{ command_id: 1, name: "One" }, { command_id: 2, name: "Two" }, { command_id: 3, name: "One Long" }, { command_id: 4, name: "Two Long" }] },
  ],
  activities: [],
};

test("the snapshot document reads as the card's bundle and one device element can be swapped", () => {
  const bundle = snapshotAsBundle(SNAPSHOT);
  assert.equal(bundle.kind, "hub_bundle");
  assert.equal(bundle.hub?.version, "X1S");
  assert.equal(bundle.devices.length, 2);
  const tv = deviceElement(bundle, 1)!;
  assert.equal(tv.device?.name, "TV");
  assert.equal(deviceElement(bundle, 99), null);
  const renamed = { ...tv, device: { ...tv.device, name: "Living room TV" } };
  const next = withDeviceElement(bundle, 1, renamed);
  assert.equal(deviceElement(next, 1)?.device?.name, "Living room TV");
  assert.equal(deviceElement(next, 12)?.device?.name, "Wifi Events");
  assert.equal(deviceElement(bundle, 1)?.device?.name, "TV", "the source bundle is untouched");
  assert.equal(elementsEqual(tv, structuredClone(tv)), true);
  assert.equal(elementsEqual(tv, renamed), false);
});

test("the draft scope is the editor's route scope and a stored draft is restored only for its own device", () => {
  assert.equal(deviceDraftScope(12), "hub/devices/12");
  assert.equal(routeScope(hubRoute("h", "hub", "devices", 12)), "hub/devices/12");
  assert.equal(routeScope(hubRoute("h", "hub", "devices")), "hub/devices");
  const element = deviceElement(snapshotAsBundle(SNAPSHOT), 1)!;
  const draft = { scope: "hub/devices/1", snapshotId: "snap-1", data: { element }, updatedAt: 1 };
  assert.equal(draftElementFor(draft, 1)?.device?.name, "TV");
  assert.equal(draftElementFor(draft, 12), null, "another device's scope");
  assert.equal(draftElementFor({ ...draft, data: { element: { ...element, device: { device_id: 2 } } } }, 1), null, "an element that names another device");
  assert.equal(draftElementFor({ ...draft, data: null }, 1), null);
  assert.equal(draftElementFor(null, 1), null);
  // The dock's banner: the card's wording for an editor's draft, the panel's for the rest.
  assert.equal(draftBannerText("hub/devices/1"), "Unsynced changes — sync to the hub to apply them");
  assert.equal(draftBannerText("hub/devices"), "Unsaved changes");
});

test("routes carry an entity id on the Hub tab only", () => {
  assert.deepEqual(parseRoute("#/aabb/hub/devices/12"), { kind: "hub", hubId: "aabb", tab: "hub", sub: "devices", entity: 12 });
  assert.equal(hashFor(hubRoute("aabb", "hub", "devices", 12)), "#/aabb/hub/devices/12");
  assert.deepEqual(parseRoute("#/aabb/hub/devices/zzz"), { kind: "hub", hubId: "aabb", tab: "hub", sub: "devices" });
  assert.deepEqual(parseRoute("#/aabb/hub/devices/0"), { kind: "hub", hubId: "aabb", tab: "hub", sub: "devices" });
  assert.deepEqual(hubRoute("aabb", "backup", "restore", 12), { kind: "hub", hubId: "aabb", tab: "backup", sub: "restore" });
  assert.deepEqual(parseRoute("#/aabb/hub/activities/101"), { kind: "hub", hubId: "aabb", tab: "hub", sub: "activities", entity: 101 });
});

test("names follow the hub model: the X1 is ASCII only, every model caps at 30 code units", () => {
  assert.equal(supportsUnicodeNames("X1"), false);
  assert.equal(supportsUnicodeNames("X1S"), true);
  assert.equal(supportsUnicodeNames("X2"), true);
  assert.equal(sanitizeName("X1", "Télé salon!"), "Tl salon");
  assert.equal(sanitizeName("X1S", "Télé salon!"), "Télé salon!");
  assert.equal(sanitizeName("X1S", "a".repeat(40)).length, 30);
  assert.equal(sanitizeName("X2", null), "");
});

test("the firmware floor mirrors the library's table", () => {
  assert.deepEqual(firmwareUnsupported("X1S", 2), { installed: 2, required: 5 });
  assert.equal(firmwareUnsupported("X1S", 5), null);
  assert.deepEqual(firmwareUnsupported("X1", 16), { installed: 16, required: 17 });
  assert.equal(firmwareUnsupported("X2", 9), null);
  assert.equal(firmwareUnsupported("X1S", null), null, "unknown firmware never blocks");
  assert.equal(firmwareUnsupported("Y9", 1), null, "unknown model never blocks");
});

test("the Wifi Events pairing: half the commands are slots, ids above are long records", () => {
  const events = deviceElement(snapshotAsBundle(SNAPSHOT), 12)!;
  assert.equal(wifiEventsSlotCount(events), 2);
  assert.equal(isLongRecord(events, 1), false);
  assert.equal(isLongRecord(events, 3), true);
  assert.equal(isLongRecord(null, 3), false);
  assert.equal(wifiEventsSlotCount(deviceElement(snapshotAsBundle(SNAPSHOT), 1)), 1);
});

test("editDevice sends the element with the quoted snapshot id as If-Match; removeDevice deletes", async () => {
  const calls: { method: string; path: string; headers: Record<string, string>; body: string | undefined }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ method: init?.method ?? "GET", path: url.slice("http://host/api/v1".length), headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined });
    return new Response(JSON.stringify({ job_id: "j1", hub_id: "h", kind: "sync_device", status: "queued" }), { status: 202, headers: { "content-type": "application/json" } });
  };
  const api = new PanelApi("http://host", fetchImpl);
  const element = SNAPSHOT.devices[0];
  const started = await api.editDevice("h", 1, element, "snap-1");
  assert.equal(started.status, 202);
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].path, "/hubs/h/devices/1");
  assert.equal(calls[0].headers["If-Match"], '"snap-1"');
  assert.deepEqual(JSON.parse(calls[0].body!), element);
  await api.removeDevice("h", 1);
  assert.equal(calls[1].method, "DELETE");
  assert.equal(calls[1].path, "/hubs/h/devices/1");
  await api.hubInfo("h");
  assert.equal(calls[2].path, "/hubs/h/info");
});
