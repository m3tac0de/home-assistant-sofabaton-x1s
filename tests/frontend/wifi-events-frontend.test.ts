/**
 * W3 frontend tests for the Wifi Events Add-dialog plumbing
 * (docs/internal/wifi-events-plan.md §9-W3): the brand helper, the
 * bundle graft, and the live-mode picker filtering / editor unlock.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  bundleDeviceBrand,
  bundleEditableDeviceOptions,
  graftDeviceIntoBundle,
  isManagedWifiBrand,
  isWifiEventsBrand,
} from "../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";
import type { BackupBundlePayload } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const EVENTS_BRAND = "m3-haevents-abc123def456789";

function liveBundle(): BackupBundlePayload {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      { device: { device_id: 1, name: "TV", device_class: "ir" } },
      { device: { device_id: 5, name: "Lights", device_class: "wifi_ip", brand: "m3-a1b2c3d4-ffff" } },
      { device: { device_id: 10, name: "Wifi Events", device_class: "wifi_ip", brand: EVENTS_BRAND } },
    ],
    activities: [
      { device: { device_id: 101, name: "Watch TV", entity_type: "activity" } },
    ],
  } as unknown as BackupBundlePayload;
}

test("isWifiEventsBrand matches only the reserved brand", () => {
  assert.equal(isWifiEventsBrand(EVENTS_BRAND), true);
  assert.equal(isWifiEventsBrand("m3-haevents-"), false);
  assert.equal(isWifiEventsBrand("m3-a1b2c3d4-ffff"), false);
  assert.equal(isWifiEventsBrand("m3tac0de-legacy"), false);
  assert.equal(isWifiEventsBrand(""), false);
  // the events brand is still a managed brand (reconcile paths etc.)
  assert.equal(isManagedWifiBrand(EVENTS_BRAND), true);
});

test("graftDeviceIntoBundle inserts a new device entry", () => {
  const bundle = liveBundle();
  const entry = {
    device: { device_id: 11, name: "Grafted", device_class: "wifi_ip", brand: "m3-x-y" },
    commands: [{ command_id: 1, name: "Cmd" }],
  };
  const next = graftDeviceIntoBundle(bundle, entry as never)!;
  assert.equal(next.devices?.length, 4);
  assert.notEqual(next, bundle); // immutable
  assert.equal(bundle.devices?.length, 3);
  assert.equal(bundleDeviceBrand(next, 11), "m3-x-y");
});

test("graftDeviceIntoBundle replaces an existing entry by device id", () => {
  const bundle = liveBundle();
  const entry = {
    device: { device_id: 10, name: "Wifi Events", device_class: "wifi_ip", brand: EVENTS_BRAND },
    commands: [
      { command_id: 1, name: "Movie Night" },
      { command_id: 51, name: "Movie Night Long Press" },
    ],
  };
  const next = graftDeviceIntoBundle(bundle, entry as never)!;
  assert.equal(next.devices?.length, 3);
  const grafted = next.devices?.find((d) => Number(d?.device?.device_id) === 10);
  assert.equal(grafted?.commands?.length, 2);
});

test("graftDeviceIntoBundle tolerates null bundle / entry / bad ids", () => {
  const bundle = liveBundle();
  assert.equal(graftDeviceIntoBundle(null, { device: { device_id: 1 } } as never), null);
  assert.equal(graftDeviceIntoBundle(bundle, null), bundle);
  assert.equal(graftDeviceIntoBundle(bundle, { device: { device_id: 0 } } as never), bundle);
});

test("bundleEditableDeviceOptions itself keeps every device (offline path)", () => {
  // The live-mode filter lives in the detail view's _editableDeviceOptions;
  // the shared helper must keep showing everything for the offline editor.
  const options = bundleEditableDeviceOptions(liveBundle());
  assert.deepEqual(options.map((o) => o.id).sort((a, b) => a - b), [1, 5, 10]);
});

test("live picker filtering drops exactly the events device", () => {
  // Mirror of _editableDeviceOptions' live-mode filter expression.
  const bundle = liveBundle();
  const filtered = bundleEditableDeviceOptions(bundle).filter(
    (option) => !isWifiEventsBrand(bundleDeviceBrand(bundle, option.id)),
  );
  assert.deepEqual(filtered.map((o) => o.id).sort((a, b) => a - b), [1, 5]);
});

test("managed lock carve-out: events brand is managed but not locked", () => {
  // _isManagedWifiLiveDevice locks on isManagedWifiBrand && !isWifiEventsBrand.
  const bundle = liveBundle();
  const lockExpr = (deviceId: number) => {
    const brand = bundleDeviceBrand(bundle, deviceId);
    return isManagedWifiBrand(brand) && !isWifiEventsBrand(brand);
  };
  assert.equal(lockExpr(5), true);   // user managed wifi device stays locked
  assert.equal(lockExpr(10), false); // events device fully editable
  assert.equal(lockExpr(1), false);  // plain IR device never locked
});
