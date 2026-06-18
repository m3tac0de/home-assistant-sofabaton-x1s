import test from "node:test";
import assert from "node:assert/strict";
import {
  activityButtonBindingItems,
  addBundleActivityFavorite,
  applyBundleDelete,
  assertBackupBundleRestoreCompatible,
  backupUsesWholeHub,
  bundleButtonCatalog,
  bundleDeleteImpact,
  deleteActivityButtonBinding,
  deleteBundleActivity,
  deleteBundleActivityQuickAccess,
  deleteBundleDevice,
  deleteBundleDeviceCommand,
  deviceButtonBindingItems,
  forcedRestoreDeviceIds,
  normalizeHubVersion,
  pruneBackupBundle,
  reconcileActivityPowerMacros,
  reconcileRestoreSelection,
  reorderBundleActivityQuickAccess,
  unboundButtonsForActivity,
  upsertActivityButtonBinding,
  upsertDeviceButtonBinding,
  validateBackupBundle,
} from "../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";

const bundle = {
  kind: "hub_bundle",
  schema_version: 5,
  hub: {
    version: "X1",
  },
  devices: [
    { device: { device_id: 1, name: "TV", device_class: "ir" } },
    { device: { device_id: 2, name: "AVR", device_class: "ir" } },
    { device: { device_id: 3, name: "Streamer", device_class: "wifi_ip" } },
  ],
  activities: [
    { device: { device_id: 101, name: "Watch TV", entity_type: "activity" }, referenced_source_device_ids: [1, 2] },
    { device: { device_id: 102, name: "Game", entity_type: "activity" }, referenced_source_device_ids: [2, 3] },
  ],
};

test("backupUsesWholeHub switches on when any activity is selected", () => {
  assert.equal(backupUsesWholeHub([]), false);
  assert.equal(backupUsesWholeHub([101]), true);
});

test("forcedRestoreDeviceIds unions linked devices for selected activities", () => {
  assert.deepEqual(forcedRestoreDeviceIds(bundle, [101]), [1, 2]);
  assert.deepEqual(forcedRestoreDeviceIds(bundle, [101, 102]), [1, 2, 3]);
});

test("reconcileRestoreSelection keeps manual device picks alongside forced ones", () => {
  assert.deepEqual(
    reconcileRestoreSelection({
      bundle,
      selectedActivityIds: [101],
      manualSelectedDeviceIds: [3],
    }),
    {
      forcedDeviceIds: [1, 2],
      selectedDeviceIds: [1, 2, 3],
    },
  );
});

test("pruneBackupBundle keeps only selected devices and activities", () => {
  const pruned = pruneBackupBundle({
    bundle,
    selectedActivityIds: [102],
    selectedDeviceIds: [2, 3],
  });
  assert.deepEqual(
    pruned.devices.map((device) => device.device?.device_id),
    [2, 3],
  );
  assert.deepEqual(
    pruned.activities.map((activity) => activity.device?.device_id),
    [102],
  );
});

test("validateBackupBundle rejects wrong kinds and schemas", () => {
  assert.equal(validateBackupBundle(bundle).kind, "hub_bundle");
  assert.throws(() => validateBackupBundle({ kind: "device_backup", schema_version: 5 }), /not a Sofabaton hub bundle/i);
  assert.throws(() => validateBackupBundle({ kind: "hub_bundle", schema_version: 4, devices: [], activities: [] }), /schema_version must be 5/i);
});

test("normalizeHubVersion canonicalizes known hub model labels", () => {
  assert.equal(normalizeHubVersion("x1"), "X1");
  assert.equal(normalizeHubVersion("Sofabaton X1S"), "X1S");
  assert.equal(normalizeHubVersion("x2 "), "X2");
  assert.equal(normalizeHubVersion("unknown"), null);
});

test("assertBackupBundleRestoreCompatible allows upward-compatible restores only", () => {
  assert.doesNotThrow(() => assertBackupBundleRestoreCompatible(bundle, "X1"));
  assert.doesNotThrow(() => assertBackupBundleRestoreCompatible(bundle, "X1S"));
  assert.doesNotThrow(() => assertBackupBundleRestoreCompatible(bundle, "X2"));
  assert.throws(
    () => assertBackupBundleRestoreCompatible({ ...bundle, hub: { version: "X1S" } }, "X1"),
    /cannot be restored onto a Sofabaton X1 hub/i,
  );
  assert.throws(
    () => assertBackupBundleRestoreCompatible({ ...bundle, hub: { version: "X2" } }, "X1S"),
    /cannot be restored onto a Sofabaton X1S hub/i,
  );
});

test("assertBackupBundleRestoreCompatible rejects missing source or destination hub models", () => {
  assert.throws(
    () => assertBackupBundleRestoreCompatible({ ...bundle, hub: {} }, "X2"),
    /missing its source hub model/i,
  );
  assert.throws(
    () => assertBackupBundleRestoreCompatible(bundle, ""),
    /destination hub model is unknown/i,
  );
});

// Richer fixture for the Phase 1 delete / add helpers: device 1 is
// referenced by activity 101 in three ways (linked device, a favorite,
// and a macro step). Activity 101 also carries an internal power macro
// (button 198) that must survive single-row deletes.
function editableBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      {
        device: { device_id: 1, name: "TV", device_class: "ir" },
        commands: [
          { command_id: 10, name: "Power" },
          { command_id: 11, name: "Volume Up" },
        ],
      },
      { device: { device_id: 2, name: "AVR", device_class: "ir" }, commands: [{ command_id: 20, name: "Power" }] },
    ],
    activities: [
      {
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        referenced_source_device_ids: [1, 2],
        favorite_slots: [
          { button_id: 1, device_id: 1, command_id: 10, name: "TV Power" },
          { button_id: 2, device_id: 2, command_id: 20, name: "AVR Power" },
        ],
        macros: [
          { button_id: 3, name: "Combo", steps: [
            { device_id: 1, command_id: 11 },
            { device_id: 2, command_id: 20 },
          ] },
          { button_id: 198, name: "POWER_ON", steps: [{ device_id: 1, command_id: 10 }] },
        ],
      },
    ],
  };
}

function activity101(b: ReturnType<typeof applyBundleDelete>) {
  return (b.activities ?? []).find((a) => a.device?.device_id === 101);
}

test("deleteBundleActivity removes only the targeted activity", () => {
  const next = deleteBundleActivity(editableBundle(), 101);
  assert.deepEqual(next.activities.map((a) => a.device?.device_id), []);
  assert.equal(next.devices.length, 2);
});

test("deleteBundleDevice clears references across activities", () => {
  const next = deleteBundleDevice(editableBundle(), 1);
  assert.deepEqual(next.devices.map((d) => d.device?.device_id), [2]);
  const act = activity101(next)!;
  assert.deepEqual(act.referenced_source_device_ids, [2]);
  assert.deepEqual(act.favorite_slots?.map((s) => s.device_id), [2]);
  // The device-1 step is gone; the device-2 step in the same macro stays.
  assert.deepEqual(act.macros?.find((m) => m.button_id === 3)?.steps?.map((s) => s.device_id), [2]);
});

test("deleteBundleDeviceCommand removes the command and its exact references", () => {
  const next = deleteBundleDeviceCommand(editableBundle(), 1, 10);
  const device1 = next.devices.find((d) => d.device?.device_id === 1)!;
  assert.deepEqual(device1.commands?.map((c) => c.command_id), [11]);
  const act = activity101(next)!;
  // Favorite (1,10) removed; favorite (2,20) and the device-1 macro step on
  // command 11 are untouched.
  assert.deepEqual(act.favorite_slots?.map((s) => [s.device_id, s.command_id]), [[2, 20]]);
  assert.deepEqual(act.macros?.find((m) => m.button_id === 3)?.steps?.map((s) => s.command_id), [11, 20]);
});

test("deleteBundleDeviceCommand also removes the deleted command's trailing delay row", () => {
  // A pure wait/delay step (device_id 255 / command_id 255) sits right
  // after the command it belongs to. Deleting command 10 must take its
  // trailing delay too, while the delay that trails the surviving
  // command 11 stays put.
  const b = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [{
      device: { device_id: 1, name: "TV", device_class: "ir" },
      commands: [{ command_id: 10, name: "Power" }, { command_id: 11, name: "Vol Up" }],
    }],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      referenced_source_device_ids: [1],
      favorite_slots: [],
      macros: [{ button_id: 3, name: "Seq", steps: [
        { device_id: 1, command_id: 10 },
        { device_id: 255, command_id: 255, delay: 5 },
        { device_id: 1, command_id: 11 },
        { device_id: 255, command_id: 255, delay: 3 },
      ] }],
    }],
  };
  const next = deleteBundleDeviceCommand(b, 1, 10);
  assert.deepEqual(next.activities[0].macros![0].steps, [
    { device_id: 1, command_id: 11 },
    { device_id: 255, command_id: 255, delay: 3 },
  ]);
  // Impact reflects both removed rows (command + its trailing delay).
  assert.deepEqual(
    bundleDeleteImpact(b, { kind: "command", deviceId: 1, commandId: 10 }),
    { favorites: 0, macroSteps: 2, activities: 0, bindings: 0 },
  );
});

test("deleteBundleActivityQuickAccess removes one row and preserves power macros", () => {
  const noFav = deleteBundleActivityQuickAccess(editableBundle(), 101, "favorite", 1);
  assert.deepEqual(activity101(noFav)!.favorite_slots?.map((s) => s.button_id), [2]);
  // Deleting the editable macro (3) removes it; the power macros stay
  // (reconcile keeps 198 and ensures 199 for the still-referenced devices).
  const macroIds = activity101(deleteBundleActivityQuickAccess(editableBundle(), 101, "macro", 3))!
    .macros?.map((m) => m.button_id);
  assert.equal(macroIds?.includes(3), false);
  assert.equal(macroIds?.includes(198), true);
  assert.equal(macroIds?.includes(199), true);
});

test("addBundleActivityFavorite appends at the next editable slot", () => {
  const next = addBundleActivityFavorite(editableBundle(), 101, 1, 11, "Vol Up");
  const slots = activity101(next)!.favorite_slots!;
  // Highest editable button_id is 3 (the macro); the power macro (198) is
  // ignored, so the new favorite lands at slot 4.
  assert.deepEqual(slots[slots.length - 1], { button_id: 4, device_id: 1, command_id: 11, name: "Vol Up" });
  // Missing device / command is a no-op (favorite count unchanged).
  const noop = addBundleActivityFavorite(editableBundle(), 101, 0, 11, "x");
  assert.equal(activity101(noop)!.favorite_slots?.length, 2);
});

test("bundleDeleteImpact counts cascade references", () => {
  const b = editableBundle();
  // device 1 is used by a Combo step (cmd 11) and the POWER_ON macro step (cmd 10) → 2 steps.
  assert.deepEqual(bundleDeleteImpact(b, { kind: "device", deviceId: 1 }), { favorites: 1, macroSteps: 2, activities: 1, bindings: 0 });
  assert.deepEqual(bundleDeleteImpact(b, { kind: "command", deviceId: 2, commandId: 20 }), { favorites: 1, macroSteps: 1, activities: 0, bindings: 0 });
  assert.deepEqual(bundleDeleteImpact(b, { kind: "activity", activityId: 101 }), { favorites: 0, macroSteps: 0, activities: 0, bindings: 0 });
});

test("reorderBundleActivityQuickAccess preserves internal power macros", () => {
  // Reorder the editable quick-access items (favorites 1 & 2 + macro 3).
  // The power macro (button 198) is filtered out of the editable list and
  // must survive untouched rather than being dropped from the rebuilt array.
  const next = reorderBundleActivityQuickAccess(editableBundle(), 101, [
    { kind: "macro", buttonId: 3 },
    { kind: "favorite", buttonId: 1 },
    { kind: "favorite", buttonId: 2 },
  ]);
  const act = activity101(next)!;
  const power = act.macros?.find((m) => m.button_id === 198);
  assert.ok(power, "power macro 198 should survive the reorder");
  assert.deepEqual(power?.steps, [{ device_id: 1, command_id: 10 }]);
  // The editable macro was renumbered to slot 1 (first in the ordered list).
  assert.equal(act.macros?.find((m) => m.name === "Combo")?.button_id, 1);
  // Favorites renumbered to slots 2 and 3, in the given order.
  assert.deepEqual(act.favorite_slots?.map((s) => s.button_id), [2, 3]);
});

test("applyBundleDelete dispatches by target kind", () => {
  const next = applyBundleDelete(editableBundle(), { kind: "command", deviceId: 1, commandId: 10 });
  assert.deepEqual(
    next.devices.find((d) => d.device?.device_id === 1)?.commands?.map((c) => c.command_id),
    [11],
  );
});

// Fixture with button bindings: a device-level binding (OK → own Power,
// long-press own Vol Up) and two activity-level bindings (Volume Up →
// Soundbar Power; OK → TV Power with a long-press to Soundbar Power).
function bindingBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X2" },
    devices: [
      {
        device: { device_id: 1, name: "TV", device_class: "ir" },
        commands: [{ command_id: 10, name: "Power" }, { command_id: 11, name: "Vol Up" }],
        button_bindings: [
          { button_id: 0xB0, button_name: "OK", command_id: 10, long_press_command_id: 11 },
        ],
      },
      {
        device: { device_id: 2, name: "Soundbar", device_class: "ir" },
        commands: [{ command_id: 20, name: "Power" }],
      },
    ],
    activities: [
      {
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        referenced_source_device_ids: [1, 2],
        button_bindings: [
          { button_id: 0xB6, button_name: "Volume Up", device_id: 2, command_id: 20 },
          {
            button_id: 0xB0, button_name: "OK", device_id: 1, command_id: 10,
            long_press_device_id: 2, long_press_command_id: 20,
          },
        ],
      },
    ],
  };
}

test("bundleButtonCatalog adapts to hub model", () => {
  assert.equal(bundleButtonCatalog({ ...bindingBundle(), hub: { version: "X1S" } }).length, 20);
  assert.equal(bundleButtonCatalog(bindingBundle()).length, 27); // X2 adds 7 extended keys
});

test("activityButtonBindingItems resolves labels and long-press, sorted by button id", () => {
  const items = activityButtonBindingItems(bindingBundle(), 101);
  assert.deepEqual(items.map((i) => i.buttonName), ["OK", "Volume Up"]); // 0xB0 before 0xB6
  const ok = items.find((i) => i.buttonName === "OK")!;
  assert.equal(ok.shortPressLabel, "TV · Power");
  assert.equal(ok.longPress?.label, "Soundbar · Power");
});

test("deviceButtonBindingItems resolves own-command labels", () => {
  const items = deviceButtonBindingItems(bindingBundle(), 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].shortPressLabel, "Power");
  assert.equal(items[0].longPress?.label, "Vol Up");
});

test("unboundButtonsForActivity excludes already-bound buttons", () => {
  const unbound = unboundButtonsForActivity(bindingBundle(), 101).map((b) => b.code);
  assert.equal(unbound.includes(0xB0), false);
  assert.equal(unbound.includes(0xB6), false);
  assert.equal(unbound.includes(0xAE), true); // Up still free
});

test("upsertActivityButtonBinding adds, then replaces by button id", () => {
  let b = upsertActivityButtonBinding(bindingBundle(), 101, { buttonId: 0xAE, deviceId: 1, commandId: 11 });
  assert.equal(b.activities[0].button_bindings!.length, 3);
  // Replacing the OK binding swaps its command and drops the old long press.
  b = upsertActivityButtonBinding(b, 101, { buttonId: 0xB0, deviceId: 1, commandId: 11 });
  assert.equal(b.activities[0].button_bindings!.length, 3); // replaced, not duplicated
  const ok = b.activities[0].button_bindings!.find((r) => r.button_id === 0xB0)!;
  assert.equal(ok.command_id, 11);
  assert.equal(ok.long_press_command_id, undefined);
});

test("upsertDeviceButtonBinding writes a device-level binding", () => {
  const b = upsertDeviceButtonBinding(bindingBundle(), 2, { buttonId: 0xB8, commandId: 20 });
  const dev2 = b.devices.find((d) => d.device?.device_id === 2)!;
  assert.deepEqual(dev2.button_bindings!.map((r) => [r.button_id, r.command_id]), [[0xB8, 20]]);
});

test("deleteActivityButtonBinding removes one binding", () => {
  const b = deleteActivityButtonBinding(bindingBundle(), 101, 0xB0);
  assert.deepEqual(b.activities[0].button_bindings!.map((r) => r.button_id), [0xB6]);
});

test("deleting a device cascades to activity button bindings", () => {
  const b = bindingBundle();
  // Device 2 is the short-press target of Volume Up and the long-press of OK.
  assert.equal(bundleDeleteImpact(b, { kind: "device", deviceId: 2 }).bindings, 2);
  const bindings = deleteBundleDevice(b, 2).activities[0].button_bindings!;
  // Volume Up dropped; OK kept with its long press cleared, short press intact.
  assert.deepEqual(bindings.map((r) => r.button_id), [0xB0]);
  assert.equal(bindings[0].long_press_device_id, undefined);
  assert.equal(bindings[0].command_id, 10);
});

test("deleting a command cascades to device and activity bindings", () => {
  const b = bindingBundle();
  assert.equal(bundleDeleteImpact(b, { kind: "command", deviceId: 1, commandId: 10 }).bindings, 2);
  const next = deleteBundleDeviceCommand(b, 1, 10);
  assert.deepEqual(next.devices.find((d) => d.device?.device_id === 1)!.button_bindings, []);
  assert.deepEqual(next.activities[0].button_bindings!.map((r) => r.button_id), [0xB6]);
});

// Activity that references device 1 via a favorite and device 2 via a
// button binding, with no power macros yet.
function powerMacroBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      { device: { device_id: 1, name: "TV" }, commands: [{ command_id: 10, name: "Power" }] },
      { device: { device_id: 2, name: "AVR" }, commands: [{ command_id: 20, name: "Power" }] },
    ],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      referenced_source_device_ids: [],
      favorite_slots: [{ button_id: 1, device_id: 1, command_id: 10 }],
      button_bindings: [{ button_id: 0xB6, device_id: 2, command_id: 20 }],
      macros: [],
    }],
  };
}

test("reconcileActivityPowerMacros builds power blocks for referenced devices", () => {
  const next = reconcileActivityPowerMacros(powerMacroBundle(), 101);
  const act = next.activities[0];
  assert.deepEqual(act.referenced_source_device_ids, [1, 2]);
  const on = act.macros!.find((m) => m.button_id === 198)!;
  const off = act.macros!.find((m) => m.button_id === 199)!;
  // Power-on: per device → [0xC6, delay(100), 0xC5 ordinal 0, delay(0)].
  assert.deepEqual(on.steps!.map((s) => [s.device_id, s.command_id, s.duration, s.delay]), [
    [1, 0xC6, 0, 0], [0xFF, 0xFF, 0xFF, 100], [1, 0xC5, 0, 0], [0xFF, 0xFF, 0xFF, 0],
    [2, 0xC6, 0, 0], [0xFF, 0xFF, 0xFF, 100], [2, 0xC5, 0, 0], [0xFF, 0xFF, 0xFF, 0],
  ]);
  // Power-off: per device → [0xC7, delay(0)].
  assert.deepEqual(off.steps!.map((s) => [s.device_id, s.command_id, s.delay]), [
    [1, 0xC7, 0], [0xFF, 0xFF, 0], [2, 0xC7, 0], [0xFF, 0xFF, 0],
  ]);
  // button_code is 0 for the device-ref / input steps.
  assert.equal(on.steps!.find((s) => s.command_id === 0xC6)!.button_code, 0);
});

test("reconcileActivityPowerMacros preserves configured input ordinals and is idempotent", () => {
  const reconciled = reconcileActivityPowerMacros(powerMacroBundle(), 101);
  const on = reconciled.activities[0].macros!.find((m) => m.button_id === 198)!;
  // Configure device 1's input ordinal to 3, then reconcile again.
  on.steps!.find((s) => s.device_id === 1 && s.command_id === 0xC5)!.duration = 3;
  const again = reconcileActivityPowerMacros(reconciled, 101);
  const onAgain = again.activities[0].macros!.find((m) => m.button_id === 198)!;
  assert.equal(onAgain.steps!.find((s) => s.device_id === 1 && s.command_id === 0xC5)!.duration, 3);
  assert.deepEqual(onAgain.steps, on.steps); // unchanged bytes → idempotent
});

test("adding a favorite pulls its device into the power macros", () => {
  // Activity starts with only device 2 referenced.
  const start = reconcileActivityPowerMacros({
    ...powerMacroBundle(),
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      favorite_slots: [],
      button_bindings: [{ button_id: 0xB6, device_id: 2, command_id: 20 }],
      macros: [],
    }],
  }, 101);
  assert.deepEqual(start.activities[0].referenced_source_device_ids, [2]);
  const next = addBundleActivityFavorite(start, 101, 1, 10, "TV Power");
  assert.deepEqual(next.activities[0].referenced_source_device_ids, [1, 2]);
  const on = next.activities[0].macros!.find((m) => m.button_id === 198)!;
  assert.deepEqual(
    [...new Set(on.steps!.filter((s) => s.command_id === 0xC6).map((s) => s.device_id))],
    [2, 1], // device 2's existing block kept first, device 1 appended
  );
});

test("removing a device's last reference drops it from the power macros", () => {
  const seeded = reconcileActivityPowerMacros({
    ...powerMacroBundle(),
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      favorite_slots: [
        { button_id: 1, device_id: 1, command_id: 10 },
        { button_id: 2, device_id: 2, command_id: 20 },
      ],
      button_bindings: [],
      macros: [],
    }],
  }, 101);
  assert.deepEqual(seeded.activities[0].referenced_source_device_ids, [1, 2]);
  // Delete the device-1 favorite (its only reference).
  const next = deleteBundleActivityQuickAccess(seeded, 101, "favorite", 1);
  assert.deepEqual(next.activities[0].referenced_source_device_ids, [2]);
  const on = next.activities[0].macros!.find((m) => m.button_id === 198)!;
  assert.deepEqual(
    [...new Set(on.steps!.filter((s) => s.command_id === 0xC6).map((s) => s.device_id))],
    [2],
  );
});
