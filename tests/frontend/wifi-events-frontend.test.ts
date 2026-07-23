/**
 * W3 frontend tests for the Wifi Events Add-dialog plumbing
 * (docs/internal/wifi-events-plan.md §9-W3): the brand helper, the
 * bundle graft, and the live-mode picker filtering / editor unlock.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  addBundleActivityFavorite,
  bundleDeviceBrand,
  bundleEditableDeviceOptions,
  graftDeviceIntoBundle,
  isManagedWifiBrand,
  isWifiEventsBrand,
  removeBundleDevice,
  rewriteWifiEventPlaceholderRefs,
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
  assert.equal(graftDeviceIntoBundle(bundle, { device: { device_id: -1 } } as never), bundle);
  // id 0 is LEGAL (W7 placeholder block for a not-yet-deployed device)
  const withPlaceholder = graftDeviceIntoBundle(
    bundle, { device: { device_id: 0, name: "Wifi Events", brand: "m3-haevents-staged0000000" } } as never,
  )!;
  assert.equal(withPlaceholder.devices?.length, 4);
});

test("removeBundleDevice retires the placeholder block", () => {
  const bundle = graftDeviceIntoBundle(
    liveBundle(), { device: { device_id: 0, name: "Wifi Events" } } as never,
  )!;
  const cleaned = removeBundleDevice(bundle, 0)!;
  assert.equal(cleaned.devices?.length, 3);
  // no-op when absent (same object back)
  assert.equal(removeBundleDevice(cleaned, 0), cleaned);
});

test("W7 invariant: the events placeholder id must be POSITIVE (id 0 drops the ref)", () => {
  // addBundleActivityFavorite no-ops on device_id <= 0 (0 = "no device"
  // across the codebase). This is exactly why the host uses a computed
  // free positive placeholder rather than 0 for a not-yet-deployed events
  // device — a first-ever event's favorite would otherwise vanish.
  const bundle = {
    kind: "hub_bundle", schema_version: 5, hub: { version: "X1S" },
    devices: [{ device: { device_id: 5, name: "E", brand: EVENTS_BRAND } }],
    activities: [{ device: { device_id: 101, name: "A", entity_type: "activity" } }],
  } as unknown as BackupBundlePayload;
  const dropped = addBundleActivityFavorite(bundle, 101, 0, 1, "Ev");
  assert.equal((dropped.activities?.[0]?.favorite_slots ?? []).length, 0);
  const kept = addBundleActivityFavorite(bundle, 101, 5, 1, "Ev");
  assert.equal((kept.activities?.[0]?.favorite_slots ?? []).length, 1);
});

test("rewriteWifiEventPlaceholderRefs swaps a non-zero placeholder in all ref kinds", () => {
  // The real host placeholder is a computed free positive id (e.g. 7).
  const bundle = {
    kind: "hub_bundle", schema_version: 5, hub: { version: "X1S" },
    devices: [],
    activities: [{
      device: { device_id: 101, name: "A", entity_type: "activity" },
      favorite_slots: [{ button_id: 5, device_id: 7, command_id: 1, name: "Ev" }],
      button_bindings: [{ button_id: 190, device_id: 7, command_id: 1, long_press_device_id: 7, long_press_command_id: 51 }],
      macros: [{ button_id: 20, name: "M", steps: [{ device_id: 7, command_id: 2, button_code: 20002, duration: 0, delay: 255 }] }],
    }],
  } as unknown as BackupBundlePayload;
  const out = rewriteWifiEventPlaceholderRefs(bundle, 101, 12, 7)!;
  const act = out.activities?.[0] as never as {
    favorite_slots: Array<{ device_id: number }>;
    button_bindings: Array<{ device_id: number; long_press_device_id: number }>;
    macros: Array<{ steps: Array<{ device_id: number }> }>;
  };
  assert.equal(act.favorite_slots[0].device_id, 12);
  assert.equal(act.button_bindings[0].device_id, 12);
  assert.equal(act.button_bindings[0].long_press_device_id, 12);
  assert.equal(act.macros[0].steps[0].device_id, 12);
});

test("rewriteWifiEventPlaceholderRefs swaps id 0 for the real id in all ref kinds", () => {
  let bundle = liveBundle();
  bundle = {
    ...bundle,
    activities: [
      {
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        favorite_slots: [
          { button_id: 5, device_id: 0, command_id: 1, name: "Ev" },
          { button_id: 6, device_id: 1, command_id: 3, name: "Other" },
        ],
        button_bindings: [
          { button_id: 190, device_id: 0, command_id: 1, long_press_device_id: 0, long_press_command_id: 51 },
        ],
        macros: [
          { button_id: 20, name: "M", steps: [
            { device_id: 0, command_id: 2, button_code: 20002, duration: 0, delay: 255 },
            { device_id: 1, command_id: 9, button_code: 20009, duration: 0, delay: 255 },
          ] },
        ],
      },
    ],
  } as never;
  const rewritten = rewriteWifiEventPlaceholderRefs(bundle, 101, 12)!;
  const act = rewritten.activities?.[0] as never as {
    favorite_slots: Array<{ device_id: number }>;
    button_bindings: Array<{ device_id: number; long_press_device_id: number }>;
    macros: Array<{ steps: Array<{ device_id: number }> }>;
  };
  assert.equal(act.favorite_slots[0].device_id, 12);
  assert.equal(act.favorite_slots[1].device_id, 1); // untouched
  assert.equal(act.button_bindings[0].device_id, 12);
  assert.equal(act.button_bindings[0].long_press_device_id, 12);
  assert.equal(act.macros[0].steps[0].device_id, 12);
  assert.equal(act.macros[0].steps[1].device_id, 1); // untouched
  // no-op guards
  assert.equal(rewriteWifiEventPlaceholderRefs(null, 101, 12), null);
  assert.equal(rewriteWifiEventPlaceholderRefs(bundle, 101, 0), bundle);
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
