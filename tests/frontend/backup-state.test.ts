import test from "node:test";
import assert from "node:assert/strict";
import {
  activityButtonBindingItems,
  activityMacroStepItems,
  activityPowerDevices,
  addActivityMacroCommandStep,
  addActivityMacroDelayStep,
  addActivityUserMacro,
  addBundleActivityFavorite,
  addDeviceMacroCommandStep,
  addDeviceMacroDelayStep,
  clearActivityDeviceInput,
  removeActivityMacroStep,
  updateActivityMacroStep,
  deviceMacroStepItems,
  removeDeviceMacroStep,
  reorderDeviceMacroSteps,
  updateDeviceMacroStep,
  setActivityDeviceInput,
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

test("deviceMacroStepItems lists command (hold) and delay (wait) steps", () => {
  const items = deviceMacroStepItems(addDeviceMacroDelayStep(deviceMacroBundle(), 1, 198, 4), 1, 198);
  assert.deepEqual(
    items.map((i) => [i.kind, i.label, i.hold, i.wait]),
    [["command", "Power", 0, 0], ["delay", "Wait", 0, 4]],
  );
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

test("activityMacroStepItems labels device and command", () => {
  let b = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b = addActivityMacroDelayStep(b, 101, 1, 30);
  b = addActivityMacroCommandStep(b, 101, 1, 2, 20, 0);
  assert.deepEqual(activityMacroStepItems(b, 101, 1).map((i) => [i.kind, i.label]), [
    ["command", "TV · Power"], ["delay", "Wait"], ["command", "AVR · Power"],
  ]);
});

test("removeActivityMacroStep keeps the device in the power macros (additive membership)", () => {
  let b = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b = addActivityMacroCommandStep(b, 101, 1, 2, 20, 0);
  assert.deepEqual(b.activities[0].referenced_source_device_ids, [1, 2]);
  // Removing device 2's only macro step does NOT drop it from the power
  // macros — once a device is powered by the activity it stays (a device is
  // only removed by deleting the device itself). Avoids dropping power-only
  // devices that have no favorite/binding/macro reference.
  b = removeActivityMacroStep(b, 101, 1, 1);
  assert.deepEqual(b.activities[0].referenced_source_device_ids, [1, 2]);
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

test("a user command added to a power macro is a deletable (non-protected) step", () => {
  const added = addActivityMacroCommandStep(realPowerActivity(), 101, 198, 9, 52, 0);
  const cmd = activityMacroStepItems(added, 101, 198).find((i) => i.kind === "command")!;
  assert.equal(cmd.protected, undefined);
  const removed = removeActivityMacroStep(added, 101, 198, cmd.index);
  assert.equal(activityMacroStepItems(removed, 101, 198).some((i) => i.kind === "command"), false);
  // The mandatory refs survive the add + remove.
  assert.equal(activityMacroStepItems(removed, 101, 198).some((i) => i.kind === "power" || i.kind === "input"), true);
});

test("deleting a favorite keeps its device in the power macros, but deleting the device removes it", () => {
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
  // Deleting device 1's favorite leaves it in the power macros (additive).
  const afterFav = deleteBundleActivityQuickAccess(seeded, 101, "favorite", 1);
  assert.deepEqual(afterFav.activities[0].referenced_source_device_ids, [1, 2]);
  // Deleting the device entirely DOES remove it from the power macros.
  const afterDevice = deleteBundleDevice(afterFav, 1);
  assert.deepEqual(afterDevice.activities[0].referenced_source_device_ids, [2]);
  const on = afterDevice.activities[0].macros!.find((m) => m.button_id === 198)!;
  assert.deepEqual([...new Set(on.steps!.filter((s) => s.command_id === 0xC6).map((s) => s.device_id))], [2]);
});
