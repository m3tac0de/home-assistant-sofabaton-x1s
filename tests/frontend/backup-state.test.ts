import test from "node:test";
import assert from "node:assert/strict";
import {
  activityAddableDevices,
  activityButtonBindingItems,
  activityChainDependencyIds,
  activityRoleAssignments,
  bundleEditableDeviceOptions,
  roleMappableButtonCount,
  setActivityRoleDevice,
  activityMacroStepItems,
  activityMemberRemovalImpact,
  activityMemberViews,
  activityPowerDevices,
  addActivityMemberDevice,
  removeActivityMemberDevice,
  addActivityMacroCommandStep,
  addActivityUserMacro,
  addBundleActivityFavorite,
  addDeviceMacroCommandStep,
  clearActivityDeviceInput,
  removeActivityMacroStep,
  reorderActivityMacroSteps,
  updateActivityMacroStep,
  deviceMacroStepItems,
  removeDeviceMacroStep,
  reorderDeviceMacroSteps,
  updateDeviceMacroStep,
  setActivityDeviceInput,
  setActivityMacroStepWait,
  setDeviceMacroStepWait,
  synthesizeCommandCode,
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
  commandDecodedBlock,
  commandRawPayloadHex,
  normalizeCommandPayloadHex,
  updateCommandRawPayload,
  deviceButtonBindingItems,
  deviceIdleBehavior,
  updateBundleDeviceIdleBehavior,
  IDLE_BEHAVIOR_DISABLED,
  forcedRestoreActivityIds,
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
      selectedActivityIds: [101],
      forcedActivityIds: [],
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

test("validateBackupBundle rejects structural cache bundles, accepts explicit full", () => {
  assert.throws(
    () => validateBackupBundle({ ...bundle, payload_profile: "structural" }),
    /structural cache bundle/i,
  );
  assert.equal(validateBackupBundle({ ...bundle, payload_profile: "full_backup" }).kind, "hub_bundle");
  // Legacy files carry no payload_profile: the base fixture above already
  // proves those keep validating.
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

test("deviceIdleBehavior prefers idle_behavior, falls back to power_mode", () => {
  const b = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1" },
    devices: [
      { device: { device_id: 1, idle_behavior: 4, power_mode: 1 } },
      { device: { device_id: 2, power_mode: 3 } },
      { device: { device_id: 3 } },
    ],
    activities: [],
  };
  assert.equal(deviceIdleBehavior(b, 1), 4); // dedicated field wins
  assert.equal(deviceIdleBehavior(b, 2), 3); // legacy fallback
  assert.equal(deviceIdleBehavior(b, 3), null); // neither present
  assert.equal(deviceIdleBehavior(b, 99), null); // missing device
});

test("updateBundleDeviceIdleBehavior writes the dedicated field only on the target", () => {
  const b = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1" },
    devices: [
      { device: { device_id: 1, power_mode: 1 } },
      { device: { device_id: 2, idle_behavior: 1 } },
    ],
    activities: [],
  };
  const next = updateBundleDeviceIdleBehavior(b, 1, IDLE_BEHAVIOR_DISABLED);
  assert.equal(deviceIdleBehavior(next, 1), IDLE_BEHAVIOR_DISABLED);
  assert.equal(deviceIdleBehavior(next, 2), 1); // untouched
  assert.equal(deviceIdleBehavior(b, 1), 1); // original not mutated
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

// Activity with a user macro, for macro-binding tests. A macro binding
// stores device_id = the activity's own id and command_id = the macro
// button_id (mirrors the hub keymap).
function activityWithMacroBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X2" },
    devices: [
      { device: { device_id: 1, name: "TV", device_class: "ir" }, commands: [{ command_id: 10, name: "Power" }] },
    ],
    activities: [
      {
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        referenced_source_device_ids: [1],
        button_bindings: [],
        macros: [
          { button_id: 5, name: "Movie Night", steps: [
            { device_id: 1, command_id: 10, button_code: 0x4E0A, duration: 0, delay: 0xFF },
          ] },
        ],
      },
    ],
  };
}

test("activityButtonBindingItems labels a macro binding (device_id == activity id)", () => {
  const b = upsertActivityButtonBinding(activityWithMacroBundle(), 101, { buttonId: 0xAE, deviceId: 101, commandId: 5 });
  const item = activityButtonBindingItems(b, 101).find((i) => i.buttonId === 0xAE)!;
  assert.equal(item.isMacroTarget, true);
  assert.equal(item.shortPressLabel, "Macro · Movie Night");
});

test("binding a macro does not add the activity's own id to power-macro membership", () => {
  const b = upsertActivityButtonBinding(activityWithMacroBundle(), 101, { buttonId: 0xAE, deviceId: 101, commandId: 5 });
  // device 1 is referenced (via the macro's step); the activity's own id (101) must NOT appear.
  assert.equal(b.activities[0].referenced_source_device_ids!.includes(101), false);
  assert.deepEqual(b.activities[0].referenced_source_device_ids, [1]);
});

test("deleting a macro drops a button bound to it and clears a long-press to it", () => {
  let b = upsertActivityButtonBinding(activityWithMacroBundle(), 101, { buttonId: 0xAE, deviceId: 101, commandId: 5 });
  // A second button uses the macro only as its long press.
  b = upsertActivityButtonBinding(b, 101, {
    buttonId: 0xB2, deviceId: 1, commandId: 10, longPress: { deviceId: 101, commandId: 5 },
  });
  const after = deleteBundleActivityQuickAccess(b, 101, "macro", 5).activities[0].button_bindings!;
  assert.deepEqual(after.map((r) => r.button_id), [0xB2]); // the macro short-press binding is gone
  const survivor = after.find((r) => r.button_id === 0xB2)!;
  assert.equal(survivor.long_press_command_id ?? null, null); // long-press to the macro cleared
  assert.equal(survivor.long_press_device_id ?? null, null);
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
  let b = deleteActivityButtonBinding(bindingBundle(), 101, 0xB0);
  assert.deepEqual(b.activities[0].button_bindings!.map((r) => r.button_id), [0xB6]);
  assert.deepEqual(b.activities[0].referenced_source_device_ids, [2]);

  b = deleteActivityButtonBinding(b, 101, 0xB6);
  assert.deepEqual(b.activities[0].button_bindings, []);
  assert.deepEqual(b.activities[0].referenced_source_device_ids, []);
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

test("reconcileActivityPowerMacros builds flat power steps for referenced devices", () => {
  const next = reconcileActivityPowerMacros(powerMacroBundle(), 101);
  const act = next.activities[0];
  assert.deepEqual(act.referenced_source_device_ids, [1, 2]);
  const on = act.macros!.find((m) => m.button_id === 198)!;
  const off = act.macros!.find((m) => m.button_id === 199)!;
  // Flat: per device, a 0xC6 then a 0xC5 step (no separate delay rows).
  assert.deepEqual(on.steps!.map((s) => [s.device_id, s.command_id, s.duration, s.delay]), [
    [1, 0xC6, 0, 0xFF], [1, 0xC5, 0, 0xFF],
    [2, 0xC6, 0, 0xFF], [2, 0xC5, 0, 0xFF],
  ]);
  assert.deepEqual(off.steps!.map((s) => [s.device_id, s.command_id, s.delay]), [
    [1, 0xC7, 0xFF], [2, 0xC7, 0xFF],
  ]);
  assert.equal(on.steps!.find((s) => s.command_id === 0xC6)!.button_code, 0);
});

// Real-format POWER_ON: flat, interleaved 0xC6/0xC5 steps where the input
// ordinal lives in each device's own 0xC5 step's `duration` (mirrors the X2
// export that exposed the input-not-showing bug).
function realPowerActivity() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X2" },
    devices: [
      { device: { device_id: 3, name: "Projector" }, commands: [{ command_id: 27, name: "On" }] },
      {
        device: { device_id: 9, name: "Denon" },
        commands: [{ command_id: 52, name: "Input aux1" }],
        input_record: { entries: [{ command_id: 52, input_index: 1, name: "Input aux1" }] },
      },
    ],
    activities: [{
      device: { device_id: 101, name: "Watch a movie", entity_type: "activity" },
      referenced_source_device_ids: [3, 9],
      favorite_slots: [{ button_id: 1, device_id: 9, command_id: 52 }],
      button_bindings: [],
      macros: [
        { button_id: 198, name: "POWER_ON", steps: [
          { device_id: 3, command_id: 198, button_code: 0, duration: 1, delay: 255 },
          { device_id: 9, command_id: 197, button_code: 0, duration: 1, delay: 255 },
          { device_id: 9, command_id: 198, button_code: 0, duration: 1, delay: 255 },
          { device_id: 3, command_id: 197, button_code: 0, duration: 0, delay: 255 },
        ] },
        { button_id: 199, name: "POWER_OFF", steps: [
          { device_id: 3, command_id: 199, button_code: 0, duration: 1, delay: 255 },
          { device_id: 9, command_id: 199, button_code: 0, duration: 1, delay: 255 },
        ] },
      ],
    }],
  };
}

test("activityPowerDevices reads each device's input from its own 0xC5 step (flat, interleaved)", () => {
  const devices = activityPowerDevices(realPowerActivity(), 101);
  // Device 9's input (ordinal 1) must resolve even though its 0xC5 step is
  // interleaved before device 3's — the bug the X2 backup exposed.
  assert.deepEqual(devices.map((d) => [d.deviceId, d.inputOrdinal, d.inputCommandId]), [
    [3, 0, null], [9, 1, 52],
  ]);
  assert.equal(devices.find((d) => d.deviceId === 9)!.inputCommandName, "Input aux1");
});

test("reconcile preserves power-only devices and existing input ordinals", () => {
  // Device 3 is power-only (no favorite/binding/macro). It must survive an
  // edit, and device 9's configured input must be preserved.
  const next = reconcileActivityPowerMacros(realPowerActivity(), 101);
  const act = next.activities[0];
  assert.deepEqual(act.referenced_source_device_ids, [3, 9]); // device 3 kept
  const on = act.macros!.find((m) => m.button_id === 198)!;
  assert.equal(on.steps!.find((s) => s.device_id === 9 && s.command_id === 197)!.duration, 1);
  assert.deepEqual(on.steps, realPowerActivity().activities[0].macros![0].steps); // idempotent
});

test("adding a favorite appends only the new device's power steps", () => {
  const next = addBundleActivityFavorite(reconcileActivityPowerMacros(powerMacroBundle(), 101), 101, 1, 10, "TV Power");
  const on = next.activities[0].macros!.find((m) => m.button_id === 198)!;
  assert.deepEqual([...new Set(on.steps!.filter((s) => s.command_id === 0xC6).map((s) => s.device_id))], [1, 2]);
});

// Activity referencing device 1 (with HDMI 1 already a configured input) and
// device 2 (no inputs yet), reconciled to flat power steps.
function powerEditorBundle() {
  return reconcileActivityPowerMacros({
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      {
        device: { device_id: 1, name: "TV" },
        commands: [{ command_id: 10, name: "Power" }, { command_id: 12, name: "HDMI 1" }],
        input_record: { entries: [{ command_id: 12, input_index: 1, name: "HDMI 1" }] },
      },
      { device: { device_id: 2, name: "AVR" }, commands: [{ command_id: 20, name: "Power" }] },
    ],
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
}

test("synthesizeCommandCode mirrors the X1 formula", () => {
  assert.equal(synthesizeCommandCode(0), 0x4E20);
  assert.equal(synthesizeCommandCode(18), 0x4E32);
});

test("activityPowerDevices lists members with their input", () => {
  const devices = activityPowerDevices(powerEditorBundle(), 101);
  assert.deepEqual(devices.map((d) => [d.deviceId, d.inputOrdinal]), [[1, 0], [2, 0]]);
});

test("setActivityDeviceInput reuses an existing device input", () => {
  const next = setActivityDeviceInput(powerEditorBundle(), 101, 1, 12);
  // Device 1 already has command 12 at ordinal 1 → reused, no new entry.
  assert.equal(next.devices.find((d) => d.device?.device_id === 1)!.input_record!.entries!.length, 1);
  const view = activityPowerDevices(next, 101).find((d) => d.deviceId === 1)!;
  assert.equal(view.inputOrdinal, 1);
  assert.equal(view.inputCommandId, 12);
  assert.equal(view.inputCommandName, "HDMI 1");
});

test("setActivityDeviceInput appends a new device input when absent", () => {
  const next = setActivityDeviceInput(powerEditorBundle(), 101, 2, 20);
  const dev2 = next.devices.find((d) => d.device?.device_id === 2)!;
  assert.deepEqual(
    dev2.input_record!.entries!.map((e) => [e.command_id, e.input_index, e.fid]),
    [[20, 1, synthesizeCommandCode(20)]],
  );
  assert.equal(activityPowerDevices(next, 101).find((d) => d.deviceId === 2)!.inputOrdinal, 1);
});

test("clearActivityDeviceInput resets the input ordinal to 0", () => {
  const set = setActivityDeviceInput(powerEditorBundle(), 101, 1, 12);
  const cleared = clearActivityDeviceInput(set, 101, 1);
  assert.equal(activityPowerDevices(cleared, 101).find((d) => d.deviceId === 1)!.inputOrdinal, 0);
});

function deviceMacroBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [{
      device: { device_id: 1, name: "TV" },
      commands: [{ command_id: 10, name: "Power" }, { command_id: 11, name: "Vol Up" }],
      macros: [{ button_id: 198, name: "POWER_ON", steps: [{ command_id: 10, duration: 0, delay: 0 }] }],
    }],
    activities: [],
  };
}

test("deviceMacroStepItems folds the trailing delay onto its command as wait", () => {
  const base = deviceMacroBundle();
  // One command, no delay yet → a single command item with wait 0.
  assert.deepEqual(
    deviceMacroStepItems(base, 1, 198).map((i) => [i.kind, i.label, i.hold, i.wait]),
    [["command", "Power", 0, 0]],
  );
  // Setting the wait folds onto that same command (no standalone delay row).
  const withWait = setDeviceMacroStepWait(base, 1, 198, 0, 4);
  assert.deepEqual(
    deviceMacroStepItems(withWait, 1, 198).map((i) => [i.kind, i.wait]),
    [["command", 4]],
  );
});

test("setDeviceMacroStepWait inserts, updates in place, and no-ops at zero", () => {
  const base = deviceMacroBundle(); // one command, no trailing delay
  const steps = (b: ReturnType<typeof deviceMacroBundle>) =>
    b.devices[0].macros!.find((m) => m.button_id === 198)!.steps!;
  // Zero wait on a group with no delay materializes nothing.
  assert.equal(steps(setDeviceMacroStepWait(base, 1, 198, 0, 0)).length, 1);
  // Non-zero inserts a delay row right after the command.
  const ins = setDeviceMacroStepWait(base, 1, 198, 0, 4);
  assert.deepEqual(steps(ins).map((s) => [s.command_id, s.delay]), [[10, 0], [255, 4]]);
  // Re-setting patches the existing delay in place (kept even at 0).
  const upd = setDeviceMacroStepWait(ins, 1, 198, 0, 0);
  assert.deepEqual(steps(upd).map((s) => [s.command_id, s.delay]), [[10, 0], [255, 0]]);
});

test("addDeviceMacroCommandStep appends with a hold (delay sentinel 0xFF), and creates the macro if absent", () => {
  const appended = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 198, 11, 4); // hold 4 = 2.0s
  const steps = appended.devices[0].macros!.find((m) => m.button_id === 198)!.steps!;
  assert.deepEqual(steps.map((s) => [s.command_id, s.duration]), [[10, 0], [11, 4]]);
  assert.equal(steps[1].delay, 0xFF); // command-step delay stays the sentinel
  // Adding to a non-existent macro (POWER_OFF) creates it.
  const created = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 199, 10);
  const off = created.devices[0].macros!.find((m) => m.button_id === 199)!;
  assert.equal(off.name, "POWER_OFF");
  assert.deepEqual(off.steps!.map((s) => s.command_id), [10]);
  assert.equal("button_code" in off.steps![0], false);
});

test("updateDeviceMacroStep edits command and hold", () => {
  const added = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 198, 11, 0);
  const edited = updateDeviceMacroStep(added, 1, 198, 1, { commandId: 10, hold: 7 });
  assert.deepEqual(edited.devices[0].macros!.find((m) => m.button_id === 198)!.steps![1], {
    command_id: 10, duration: 7, delay: 0xFF,
  });
});

test("removeDeviceMacroStep and reorderDeviceMacroSteps", () => {
  const two = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 198, 11, 0); // [10, 11]
  assert.deepEqual(deviceMacroStepItems(reorderDeviceMacroSteps(two, 1, 198, [1, 0]), 1, 198).map((i) => i.commandId), [11, 10]);
  assert.deepEqual(deviceMacroStepItems(removeDeviceMacroStep(two, 1, 198, 0), 1, 198).map((i) => i.commandId), [11]);
});

test("a command's attached wait follows it through reorder and remove", () => {
  let two = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 198, 11, 0); // commands [10, 11]
  two = setDeviceMacroStepWait(two, 1, 198, 0, 6); // command 10 waits 6
  const steps = (b: typeof two) => b.devices[0].macros!.find((m) => m.button_id === 198)!.steps!;
  // Reordering moves the wait with command 10 (now last).
  const reordered = reorderDeviceMacroSteps(two, 1, 198, [1, 0]);
  assert.deepEqual(deviceMacroStepItems(reordered, 1, 198).map((i) => [i.commandId, i.wait]), [[11, 0], [10, 6]]);
  assert.deepEqual(steps(reordered).map((s) => s.command_id), [11, 10, 255]);
  // Removing command 10 (group index 1) takes its trailing wait too.
  const removed = removeDeviceMacroStep(reordered, 1, 198, 1);
  assert.deepEqual(steps(removed).map((s) => s.command_id), [11]);
});

function userMacroBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      { device: { device_id: 1, name: "TV" }, commands: [{ command_id: 10, name: "Power" }, { command_id: 11, name: "Vol" }] },
      { device: { device_id: 2, name: "AVR" }, commands: [{ command_id: 20, name: "Power" }] },
    ],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      favorite_slots: [],
      button_bindings: [],
      macros: [{ button_id: 1, name: "Combo", steps: [] }],
    }],
  };
}

test("addActivityMacroCommandStep synthesizes button_code and pulls the device into the power macros", () => {
  const next = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 5); // hold 5
  assert.deepEqual(next.activities[0].macros!.find((m) => m.button_id === 1)!.steps![0], {
    device_id: 1, command_id: 10, button_code: synthesizeCommandCode(10), duration: 5, delay: 0xFF,
  });
  assert.deepEqual(next.activities[0].referenced_source_device_ids, [1]);
  assert.equal(next.activities[0].macros!.some((m) => m.button_id === 198), true);
});

test("activityMacroStepItems labels device · command and folds the wait onto it", () => {
  let b = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b = setActivityMacroStepWait(b, 101, 1, 0, 30); // wait after TV · Power
  b = addActivityMacroCommandStep(b, 101, 1, 2, 20, 0);
  assert.deepEqual(activityMacroStepItems(b, 101, 1).map((i) => [i.kind, i.label, i.wait]), [
    ["command", "TV · Power", 30], ["command", "AVR · Power", 0],
  ]);
});

test("reorderActivityMacroSteps carries a command's attached wait", () => {
  let b = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b = setActivityMacroStepWait(b, 101, 1, 0, 12); // TV · Power waits 12
  b = addActivityMacroCommandStep(b, 101, 1, 2, 20, 0);
  const reordered = reorderActivityMacroSteps(b, 101, 1, [1, 0]);
  assert.deepEqual(activityMacroStepItems(reordered, 101, 1).map((i) => [i.label, i.wait]), [
    ["AVR · Power", 0], ["TV · Power", 12],
  ]);
});

test("removeActivityMacroStep unlinks a device after its final macro reference is removed", () => {
  let b = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b = addActivityMacroCommandStep(b, 101, 1, 2, 20, 0);
  assert.deepEqual(b.activities[0].referenced_source_device_ids, [1, 2]);
  // Device 2 has no remaining editable reference, so its generated linkage
  // rows disappear while device 1 remains linked through its macro step.
  b = removeActivityMacroStep(b, 101, 1, 1);
  assert.deepEqual(b.activities[0].referenced_source_device_ids, [1]);
  const powerRows = b.activities[0].macros!
    .filter((macro) => macro.button_id === 198 || macro.button_id === 199)
    .flatMap((macro) => macro.steps ?? []);
  assert.equal(powerRows.some((step) => step.device_id === 2), false);
});

test("updateActivityMacroStep re-synthesizes button_code when the command changes", () => {
  let b = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b = updateActivityMacroStep(b, 101, 1, 0, { commandId: 11, hold: 9 });
  assert.deepEqual(b.activities[0].macros!.find((m) => m.button_id === 1)!.steps![0], {
    device_id: 1, command_id: 11, button_code: synthesizeCommandCode(11), duration: 9, delay: 0xFF,
  });
});

test("addActivityUserMacro creates an empty macro at the next slot", () => {
  const macro = addActivityUserMacro(userMacroBundle(), 101, "New Macro").activities[0].macros!.find((m) => m.name === "New Macro")!;
  assert.equal(macro.button_id, 2);
  assert.deepEqual(macro.steps, []);
});

test("activityMacroStepItems marks power-macro refs as protected and labels them", () => {
  const items = activityMacroStepItems(realPowerActivity(), 101, 198);
  assert.equal(items.every((i) => (i.kind === "power" || i.kind === "input") && i.protected === true), true);
  // The input ref resolves device 9's input command (52) for pre-selection.
  const inputRef = items.find((i) => i.kind === "input" && i.deviceId === 9)!;
  assert.equal(inputRef.label, "Input · Denon: Input aux1");
  assert.equal(inputRef.commandId, 52);
  assert.equal(items.find((i) => i.kind === "power" && i.deviceId === 3)!.label, "Power on · Projector");
});

test("removeActivityMacroStep refuses to delete a mandatory power ref", () => {
  const before = activityMacroStepItems(realPowerActivity(), 101, 198).length;
  const next = removeActivityMacroStep(realPowerActivity(), 101, 198, 0);
  assert.equal(activityMacroStepItems(next, 101, 198).length, before);
});

test("setActivityMacroStepWait edits the wait on a protected power ref without touching the ref", () => {
  const next = setActivityMacroStepWait(realPowerActivity(), 101, 198, 0, 8);
  const items = activityMacroStepItems(next, 101, 198);
  // Same number of (protected) ref rows; group 0's attached wait is now 8.
  assert.equal(items.length, activityMacroStepItems(realPowerActivity(), 101, 198).length);
  assert.equal(items[0].wait, 8);
  assert.equal(items[0].protected, true);
  // The protected ref step itself (device 3, power-on) is unchanged.
  const headStep = next.activities[0].macros!.find((m) => m.button_id === 198)!.steps![0];
  assert.deepEqual([headStep.device_id, headStep.command_id], [3, 198]);
});

test("reconcile inserts repaired input refs after an attached power wait", () => {
  const base = realPowerActivity();
  const partial = {
    ...base,
    activities: [{
      ...base.activities[0],
      macros: base.activities[0].macros!.map((macro) => {
        if (macro.button_id !== 198) return macro;
        return {
          ...macro,
          steps: [
            macro.steps![0],
            { device_id: 0xFF, command_id: 0xFF, button_code: 0xFFFFFFFFFFFF, duration: 0xFF, delay: 8 },
            ...macro.steps!.slice(1).filter((step) => !(step.device_id === 3 && step.command_id === 0xC5)),
          ],
        };
      }),
    }],
  };
  const fixed = reconcileActivityPowerMacros(partial, 101);
  const steps = fixed.activities[0].macros!.find((m) => m.button_id === 198)!.steps!;
  const c6 = steps.findIndex((step) => step.device_id === 3 && step.command_id === 0xC6);
  const c5 = steps.findIndex((step) => step.device_id === 3 && step.command_id === 0xC5);
  assert.deepEqual([steps[c6 + 1].device_id, steps[c6 + 1].command_id, steps[c6 + 1].delay], [0xFF, 0xFF, 8]);
  assert.equal(c5, c6 + 2);
});

test("a user command added to a power macro is a deletable (non-protected) step", () => {
  const added = addActivityMacroCommandStep(realPowerActivity(), 101, 198, 9, 52, 0);
  const cmd = activityMacroStepItems(added, 101, 198).find((i) => i.kind === "command")!;
  assert.equal(cmd.protected, undefined);
  const removed = removeActivityMacroStep(added, 101, 198, cmd.index);
  assert.equal(activityMacroStepItems(removed, 101, 198).some((i) => i.kind === "command"), false);
  // The mandatory refs survive the add + remove.
  assert.equal(activityMacroStepItems(removed, 101, 198).some((i) => i.kind === "power" || i.kind === "input"), true);
});

test("deleting a device's final favorite removes its generated power linkage", () => {
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
  // Device 1's favorite was its final editable reference.
  const afterFav = deleteBundleActivityQuickAccess(seeded, 101, "favorite", 1);
  assert.deepEqual(afterFav.activities[0].referenced_source_device_ids, [2]);
  const on = afterFav.activities[0].macros!.find((m) => m.button_id === 198)!;
  assert.deepEqual([...new Set(on.steps!.filter((s) => s.command_id === 0xC6).map((s) => s.device_id))], [2]);
});

// ── Activity membership editing ─────────────────────────────────────

// Three devices; activity 101 references 1 (favorite) and 2 (binding),
// reconciled so both carry full power refs. Device 3 is unused.
function membershipBundle() {
  return reconcileActivityPowerMacros({
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      {
        device: { device_id: 1, name: "TV" },
        commands: [{ command_id: 10, name: "Power" }, { command_id: 12, name: "HDMI 1" }],
        input_record: { entries: [{ command_id: 12, input_index: 1, name: "HDMI 1" }] },
      },
      { device: { device_id: 2, name: "AVR" }, commands: [{ command_id: 20, name: "Power" }] },
      { device: { device_id: 3, name: "Streamer" }, commands: [{ command_id: 30, name: "Home" }] },
    ],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      favorite_slots: [{ button_id: 1, device_id: 1, command_id: 10, name: "TV Power" }],
      button_bindings: [
        { button_id: 0xB6, device_id: 2, command_id: 20 },
        { button_id: 0xB0, device_id: 1, command_id: 10, long_press_device_id: 2, long_press_command_id: 20 },
      ],
      macros: [{ button_id: 3, name: "Combo", steps: [
        { device_id: 1, command_id: 12 },
        { device_id: 255, command_id: 255, delay: 4 },
        { device_id: 2, command_id: 20 },
      ] }],
    }],
  }, 101);
}

test("activityMemberViews lists members with power-on/input/power-off state", () => {
  const views = activityMemberViews(membershipBundle(), 101);
  assert.deepEqual(
    views.map((v) => [v.deviceId, v.powersOn, v.powersOff, v.inputOrdinal]),
    [[1, true, true, 0], [2, true, true, 0]],
  );
  const withInput = setActivityDeviceInput(membershipBundle(), 101, 1, 12);
  const tv = activityMemberViews(withInput, 101).find((v) => v.deviceId === 1)!;
  assert.deepEqual([tv.inputOrdinal, tv.inputCommandId, tv.inputCommandName], [1, 12, "HDMI 1"]);
});

test("activityAddableDevices excludes current members", () => {
  assert.deepEqual(activityAddableDevices(membershipBundle(), 101).map((o) => o.id), [3]);
});

test("addActivityMemberDevice seeds full power refs for the new device", () => {
  const next = addActivityMemberDevice(membershipBundle(), 101, 3);
  const view = activityMemberViews(next, 101).find((v) => v.deviceId === 3)!;
  assert.deepEqual([view.powersOn, view.powersOff, view.inputOrdinal], [true, true, 0]);
  assert.deepEqual(next.activities[0].referenced_source_device_ids, [1, 2, 3]);
  // Membership sticks: a later plain reconcile keeps the device.
  const reconciled = reconcileActivityPowerMacros(next, 101);
  assert.deepEqual(reconciled.activities[0].referenced_source_device_ids, [1, 2, 3]);
});

test("addActivityMemberDevice is a no-op for members, unknown devices, and self", () => {
  const b = membershipBundle();
  assert.deepEqual(addActivityMemberDevice(b, 101, 1), b);
  assert.deepEqual(addActivityMemberDevice(b, 101, 99), b);
  assert.deepEqual(addActivityMemberDevice(b, 101, 101), b);
});

test("removeActivityMemberDevice strips every in-activity reference", () => {
  const next = removeActivityMemberDevice(membershipBundle(), 101, 2);
  const act = next.activities[0];
  assert.deepEqual(act.referenced_source_device_ids, [1]);
  // The volume binding (short press → 2) dropped; OK kept, long press cleared.
  assert.deepEqual(act.button_bindings!.map((r) => r.button_id), [0xB0]);
  assert.equal(act.button_bindings![0].long_press_device_id, undefined);
  // Combo lost device 2's step; device 2 gone from both power macros.
  assert.deepEqual(
    act.macros!.find((m) => m.button_id === 3)!.steps!.map((s) => s.device_id),
    [1, 255],
  );
  assert.equal(activityMemberViews(next, 101).some((v) => v.deviceId === 2), false);
  // The device itself stays in the bundle.
  assert.equal(next.devices.some((d) => d.device?.device_id === 2), true);
});

test("activityMemberRemovalImpact counts scoped user-visible references only", () => {
  const b = membershipBundle();
  // Device 2: volume binding dropped + OK long-press cleared + one Combo step.
  assert.deepEqual(
    activityMemberRemovalImpact(b, 101, 2),
    { favorites: 0, macroSteps: 1, activities: 0, bindings: 2 },
  );
  // Device 1: favorite + OK short-press binding + Combo step (with its wait
  // row consumed) — power-ref rows are managed detail and never counted.
  assert.deepEqual(
    activityMemberRemovalImpact(b, 101, 1),
    { favorites: 1, macroSteps: 2, activities: 0, bindings: 1 },
  );
});

test("reconcile restores missing mandatory power refs for a member", () => {
  const partial = addActivityMemberDevice(membershipBundle(), 101, 3);
  const missing = {
    ...partial,
    activities: [{
      ...partial.activities[0],
      macros: partial.activities[0].macros!.map((m) => {
        if (m.button_id === 198) {
          return { ...m, steps: m.steps!.filter((s) => !(s.device_id === 3 && s.command_id === 0xC6)) };
        }
        if (m.button_id === 199) {
          return { ...m, steps: m.steps!.filter((s) => !(s.device_id === 3 && s.command_id === 0xC7)) };
        }
        return m;
      }),
    }],
  };
  const before = activityMemberViews(missing, 101).find((v) => v.deviceId === 3)!;
  assert.deepEqual([before.powersOn, before.powersOff, before.inputOrdinal], [false, false, 0]);
  const reconciled = reconcileActivityPowerMacros(missing, 101);
  const after = activityMemberViews(reconciled, 101).find((v) => v.deviceId === 3)!;
  assert.deepEqual([after.powersOn, after.powersOff, after.inputOrdinal], [true, true, 0]);
});

// ── Role-based button assignment ─────────────────────────────────────

// AVR (id 9) has a full device-mode volume mapping (with a long press on
// Mute); Streamer (id 7) covers navigation partially (Up/Down/OK only).
// Activity 101 starts with no group bindings.
function roleBundle(hubVersion = "X1S") {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: hubVersion },
    devices: [
      {
        device: { device_id: 9, name: "AVR" },
        commands: [
          { command_id: 90, name: "Vol Up" }, { command_id: 91, name: "Vol Up Fast" },
          { command_id: 92, name: "Vol Down" }, { command_id: 93, name: "Mute" },
        ],
        button_bindings: [
          { button_id: 0xB6, command_id: 90, long_press_command_id: 91 },
          { button_id: 0xB9, command_id: 92 },
          { button_id: 0xB8, command_id: 93 },
        ],
      },
      {
        device: { device_id: 7, name: "Streamer" },
        commands: [
          { command_id: 70, name: "Up" }, { command_id: 71, name: "Down" }, { command_id: 72, name: "OK" },
          { command_id: 77, name: "Play" },
        ],
        button_bindings: [
          { button_id: 0xAE, command_id: 70 },
          { button_id: 0xB2, command_id: 71 },
          { button_id: 0xB0, command_id: 72 },
          { button_id: 0x9C, command_id: 77 },
        ],
      },
    ],
    activities: [{
      device: { device_id: 101, name: "Watch a movie", entity_type: "activity" },
      favorite_slots: [{ button_id: 1, device_id: 9, command_id: 93 }],
      button_bindings: [],
      macros: [],
    }],
  };
}

function roleFor(b: Parameters<typeof activityRoleAssignments>[0], group: string) {
  return activityRoleAssignments(b, 101).find((r) => r.group === group)!;
}

test("activityRoleAssignments reports unused groups with model-aware totals", () => {
  const roles = activityRoleAssignments(roleBundle(), 101);
  assert.deepEqual(roles.map((r) => [r.group, r.state, r.totalCount]), [
    ["volume", "unused", 3],
    ["navigation", "unused", 8],
    ["playback", "unused", 3],
    ["channels", "unused", 2],
  ]);
  // X2 exposes the Play key, growing the playback group to 4.
  assert.equal(roleFor(roleBundle("X2"), "playback").totalCount, 4);
});

test("setActivityRoleDevice copies the device-mode mapping, long press included", () => {
  const next = setActivityRoleDevice(roleBundle(), 101, "volume", 9);
  const rows = next.activities[0].button_bindings!;
  assert.deepEqual(
    rows.map((r) => [r.button_id, r.device_id, r.command_id, r.long_press_device_id ?? 0, r.long_press_command_id ?? 0]),
    [
      [0xB6, 9, 90, 9, 91],
      [0xB8, 9, 93, 0, 0],
      [0xB9, 9, 92, 0, 0],
    ],
  );
  const role = roleFor(next, "volume");
  assert.deepEqual([role.state, role.deviceId, role.boundCount, role.totalCount], ["device", 9, 3, 3]);
  // The AVR joins the activity's power macros via the reconcile.
  assert.equal(activityMemberViews(next, 101).some((v) => v.deviceId === 9), true);
});

test("partial device-mode coverage binds what exists and stays state 'device'", () => {
  assert.equal(roleMappableButtonCount(roleBundle(), 7, "navigation"), 3);
  const next = setActivityRoleDevice(roleBundle(), 101, "navigation", 7);
  const role = roleFor(next, "navigation");
  assert.deepEqual([role.state, role.boundCount, role.totalCount], ["device", 3, 8]);
});

test("X1S playback ignores the X2-only Play key when copying", () => {
  const next = setActivityRoleDevice(roleBundle(), 101, "playback", 7);
  // Streamer only maps Play (0x9C), which doesn't exist on X1S → nothing bound.
  assert.equal(roleFor(next, "playback").state, "unused");
  const x2 = setActivityRoleDevice(roleBundle("X2"), 101, "playback", 7);
  assert.deepEqual([roleFor(x2, "playback").state, roleFor(x2, "playback").boundCount], ["device", 1]);
});

test("diverging from the device-mode mapping reads back as 'customized'", () => {
  const assigned = setActivityRoleDevice(roleBundle(), 101, "volume", 9);
  const tweaked = upsertActivityButtonBinding(assigned, 101, { buttonId: 0xB8, deviceId: 9, commandId: 92 });
  assert.deepEqual([roleFor(tweaked, "volume").state, roleFor(tweaked, "volume").deviceId], ["customized", 9]);
  // Deleting one of the copied bindings is also a divergence.
  const trimmed = deleteActivityButtonBinding(assigned, 101, 0xB9);
  assert.equal(roleFor(trimmed, "volume").state, "customized");
});

test("mixed target devices or macro targets read back as 'custom'", () => {
  const assigned = setActivityRoleDevice(roleBundle(), 101, "volume", 9);
  const mixed = upsertActivityButtonBinding(assigned, 101, { buttonId: 0xB8, deviceId: 7, commandId: 72 });
  assert.equal(roleFor(mixed, "volume").state, "custom");
  // A macro-bound button (target = the activity's own id) is custom too.
  const withMacro = upsertActivityButtonBinding(
    { ...roleBundle(), activities: [{ ...roleBundle().activities[0], macros: [{ button_id: 3, name: "M", steps: [] }] }] },
    101,
    { buttonId: 0xB6, deviceId: 101, commandId: 3 },
  );
  assert.equal(roleFor(withMacro, "volume").state, "custom");
});

test("setActivityRoleDevice(null) clears only that group", () => {
  let b = setActivityRoleDevice(roleBundle(), 101, "volume", 9);
  b = setActivityRoleDevice(b, 101, "navigation", 7);
  const cleared = setActivityRoleDevice(b, 101, "volume", null);
  assert.equal(roleFor(cleared, "volume").state, "unused");
  assert.deepEqual([roleFor(cleared, "navigation").state, roleFor(cleared, "navigation").boundCount], ["device", 3]);
});

// ── Raw payload editing ──────────────────────────────────────────────

function rawPayloadBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    activities: [],
    devices: [
      {
        device: { device_id: 9, name: "Soundbar", device_class: "bluetooth" },
        commands: [
          {
            command_id: 1,
            name: "Power",
            restore_data: {
              transport: "hub_code_record",
              library_type: 0x0e,
              command_code: "00 00 00 00 12 34",
              data_hex: "aa bb cc",
            },
          },
          { command_id: 2, name: "Label only" },
          {
            command_id: 3,
            name: "Decoded",
            restore_data: {
              transport: "hub_code_record",
              library_type: 0x1c,
              data_hex: "0a 0b",
              decoded: { class: "wifi_roku", fields: { path: "/keypress/Home" }, trailer_hex: "" },
            },
          },
        ],
      },
    ],
  } as any;
}

test("normalizeCommandPayloadHex canonicalizes tolerant input and rejects bad hex", () => {
  assert.equal(normalizeCommandPayloadHex("AABBCC"), "aa bb cc");
  assert.equal(normalizeCommandPayloadHex("0xAA 0xBB\ncc,dd"), "aa bb cc dd");
  assert.equal(normalizeCommandPayloadHex(""), null);
  assert.equal(normalizeCommandPayloadHex("abc"), null);
  assert.equal(normalizeCommandPayloadHex("zz"), null);
});

test("commandRawPayloadHex reads data_hex and is null without restore data", () => {
  const bundle = rawPayloadBundle();
  assert.equal(commandRawPayloadHex(bundle, 9, 1), "aa bb cc");
  assert.equal(commandRawPayloadHex(bundle, 9, 2), null);
  assert.equal(commandRawPayloadHex(bundle, 9, 99), null);
});

test("updateCommandRawPayload replaces data_hex and drops a stale decoded block", () => {
  const bundle = rawPayloadBundle();
  const next = updateCommandRawPayload(bundle, 9, 3, "de ad be ef");
  const command = next.devices[0].commands!.find((row: any) => row.command_id === 3)!;
  const restore = command.restore_data as Record<string, any>;
  assert.equal(restore.data_hex, "de ad be ef");
  // The old decoded fields no longer describe the bytes; restore must
  // replay the new hex verbatim, so the block is gone entirely.
  assert.equal("decoded" in restore, false);
  assert.equal(commandDecodedBlock(next, 9, 3), null);
  // Untouched siblings and non-payload fields survive.
  assert.equal(restore.library_type, 0x1c);
  assert.equal(commandRawPayloadHex(next, 9, 1), "aa bb cc");
  // Commands without restore_data are a no-op.
  const untouched = updateCommandRawPayload(bundle, 9, 2, "de ad");
  assert.equal(commandRawPayloadHex(untouched, 9, 2), null);
});

test("reconcile repairs missing power refs in interleaved macros", () => {
  const partial = {
    ...realPowerActivity(),
    activities: [{
      ...realPowerActivity().activities[0],
      macros: realPowerActivity().activities[0].macros!.map((m) => {
        if (m.button_id === 198) {
          return { ...m, steps: m.steps!.filter((s) => !(s.device_id === 3 && s.command_id === 0xC6)) };
        }
        if (m.button_id === 199) {
          return { ...m, steps: m.steps!.filter((s) => !(s.device_id === 3 && s.command_id === 0xC7)) };
        }
        return m;
      }),
    }],
  };
  const fixed = reconcileActivityPowerMacros(partial, 101);
  const onSteps = fixed.activities[0].macros!.find((m) => m.button_id === 198)!.steps!;
  const c6 = onSteps.findIndex((s) => s.device_id === 3 && s.command_id === 0xC6);
  const c5 = onSteps.findIndex((s) => s.device_id === 3 && s.command_id === 0xC5);
  assert.ok(c6 >= 0 && c5 >= 0 && c6 < c5, `expected repaired 0xC6 before 0xC5, got ${c6}/${c5}`);
  const offSteps = fixed.activities[0].macros!.find((m) => m.button_id === 199)!.steps!;
  assert.deepEqual(offSteps.map((s) => [s.device_id, s.command_id]), [[3, 0xC7], [9, 0xC7]]);
});

// ── Cross-activity chain references (restore selection) ─────────────

// Activity 101's power-off chains into 102 (a step targeting the other
// activity's id); 102 chains into 103. Devices give each activity its
// own linked-device footprint.
function chainBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      { device: { device_id: 1, name: "TV" }, commands: [{ command_id: 10, name: "Power" }] },
      { device: { device_id: 2, name: "AVR" }, commands: [{ command_id: 20, name: "Power" }] },
    ],
    activities: [
      {
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        referenced_source_device_ids: [1],
        favorite_slots: [],
        button_bindings: [],
        macros: [{ button_id: 199, name: "POWER_OFF", steps: [
          { device_id: 1, command_id: 0xC7, button_code: 0, duration: 0, delay: 255 },
          { device_id: 102, command_id: 0xC6, button_code: 0, duration: 0, delay: 255 },
        ] }],
      },
      {
        device: { device_id: 102, name: "Home", entity_type: "activity" },
        referenced_source_device_ids: [2],
        favorite_slots: [],
        button_bindings: [],
        macros: [{ button_id: 199, name: "POWER_OFF", steps: [
          { device_id: 103, command_id: 0xC6, button_code: 0, duration: 0, delay: 255 },
        ] }],
      },
      {
        device: { device_id: 103, name: "All Off", entity_type: "activity" },
        referenced_source_device_ids: [],
        favorite_slots: [],
        button_bindings: [],
        macros: [],
      },
    ],
  };
}

test("activityChainDependencyIds finds foreign activity ids in macro steps", () => {
  assert.deepEqual(activityChainDependencyIds(chainBundle(), 101), [102]);
  assert.deepEqual(activityChainDependencyIds(chainBundle(), 102), [103]);
  assert.deepEqual(activityChainDependencyIds(chainBundle(), 103), []);
});

test("forcedRestoreActivityIds is transitive and excludes the picks", () => {
  assert.deepEqual(forcedRestoreActivityIds(chainBundle(), [101]), [102, 103]);
  assert.deepEqual(forcedRestoreActivityIds(chainBundle(), [102]), [103]);
  assert.deepEqual(forcedRestoreActivityIds(chainBundle(), [101, 102]), [103]);
});

test("reconcileRestoreSelection pulls chained activities and their devices in", () => {
  const selection = reconcileRestoreSelection({
    bundle: chainBundle(),
    selectedActivityIds: [101],
    manualSelectedDeviceIds: [],
  });
  assert.deepEqual(selection.selectedActivityIds, [101, 102, 103]);
  assert.deepEqual(selection.forcedActivityIds, [102, 103]);
  // Device 2 is linked only to the FORCED activity 102 — it must come along.
  assert.deepEqual(selection.forcedDeviceIds, [1, 2]);
});
