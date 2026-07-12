import test from "node:test";
import assert from "node:assert/strict";
import {
  addActivityMacroCommandStep,
  addBundleActivityFavorite,
  deleteActivityButtonBinding,
  deleteBundleActivityQuickAccess,
  reconcileActivityPowerMacros,
  removeActivityMacroStep,
  reorderActivityMacroSteps,
  setActivityMacroStepWait,
  upsertActivityButtonBinding,
} from "../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";
import type {
  BackupBundleActivityPayload,
  BackupBundleMacroRow,
  BackupBundleMacroStep,
  BackupBundlePayload,
} from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const POWER_ON = 0xC6;
const INPUT = 0xC5;
const POWER_OFF = 0xC7;
const DELAY = 0xFF;

function isDelay(step: BackupBundleMacroStep): boolean {
  return Number(step.device_id ?? 0) === DELAY || Number(step.command_id ?? 0) === DELAY;
}

function macro(activity: BackupBundleActivityPayload, buttonId: number): BackupBundleMacroRow {
  const row = (activity.macros ?? []).find((candidate) => Number(candidate.button_id) === buttonId);
  if (!row) throw new Error(`activity must contain macro ${buttonId}`);
  return row;
}

function headSteps(row: BackupBundleMacroRow): BackupBundleMacroStep[] {
  return (row.steps ?? []).filter((step) => !isDelay(step));
}

function sorted(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

/**
 * Independent oracle for the activity membership invariants enforced by the
 * editor reducers. This deliberately inspects the resulting bundle instead
 * of calling the production membership helpers, so a shared implementation
 * bug cannot make the test agree with itself.
 */
function assertActivityMembershipInvariant(bundle: BackupBundlePayload, activityId: number): void {
  const activity = (bundle.activities ?? []).find(
    (candidate) => Number(candidate.device?.device_id ?? 0) === activityId,
  );
  if (!activity) throw new Error(`activity ${activityId} must exist`);

  const linked = sorted((activity.referenced_source_device_ids ?? []).map(Number));
  assert.deepEqual(activity.referenced_source_device_ids ?? [], linked, "linked-device mirror must be sorted and unique");

  const onHeads = headSteps(macro(activity, 198));
  const offHeads = headSteps(macro(activity, 199));
  const refs = new Set<number>();

  for (const slot of activity.favorite_slots ?? []) refs.add(Number(slot.device_id ?? 0));
  for (const binding of activity.button_bindings ?? []) {
    refs.add(Number(binding.device_id ?? 0));
    refs.add(Number(binding.long_press_device_id ?? 0));
  }
  for (const row of activity.macros ?? []) {
    for (const step of headSteps(row)) {
      const commandId = Number(step.command_id ?? 0);
      if (commandId !== INPUT && commandId !== POWER_ON && commandId !== POWER_OFF) {
        refs.add(Number(step.device_id ?? 0));
      }
    }
  }
  refs.delete(0);
  refs.delete(activityId); // activity-macro binding targets are not devices

  const powerMembers = new Set<number>();
  for (const step of [...onHeads, ...offHeads]) {
    const commandId = Number(step.command_id ?? 0);
    if (commandId === INPUT || commandId === POWER_ON || commandId === POWER_OFF) {
      powerMembers.add(Number(step.device_id ?? 0));
    }
  }
  powerMembers.delete(0);

  assert.deepEqual(linked, sorted(powerMembers), "presence in the power macros must define linkage");
  for (const deviceId of refs) {
    assert.equal(powerMembers.has(deviceId), true, `referenced device ${deviceId} must be linked through power rows`);
  }

  for (const deviceId of linked) {
    const count = (steps: BackupBundleMacroStep[], commandId: number) => steps.filter(
      (step) => Number(step.device_id ?? 0) === deviceId && Number(step.command_id ?? 0) === commandId,
    ).length;
    assert.equal(count(onHeads, POWER_ON), 1, `device ${deviceId} must have one start power row`);
    assert.equal(count(onHeads, INPUT), 1, `device ${deviceId} must have one start input row`);
    assert.equal(count(offHeads, POWER_OFF), 1, `device ${deviceId} must have one shutdown power row`);
  }
}

function assertNonzeroWaitRowsAreAttached(row: BackupBundleMacroRow): void {
  const steps = row.steps ?? [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!isDelay(step) || Number(step.delay ?? 0) === 0) continue;
    assert.ok(index > 0 && !isDelay(steps[index - 1]), "a nonzero wait row must immediately follow its command");
  }
}

function emptyBundle(model: "X1" | "X1S" | "X2"): BackupBundlePayload {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: model },
    devices: [
      { device: { device_id: 1, name: "TV" }, commands: [{ command_id: 10, name: "Power" }] },
      { device: { device_id: 2, name: "AVR" }, commands: [{ command_id: 20, name: "Power" }] },
      { device: { device_id: 3, name: "Streamer" }, commands: [{ command_id: 30, name: "Home" }] },
    ],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      referenced_source_device_ids: [],
      favorite_slots: [],
      button_bindings: [],
      macros: [],
    }],
  } as BackupBundlePayload;
}

for (const model of ["X1", "X1S", "X2"] as const) {
  test(`${model}: favorite, macro, and binding transitions maintain activity membership`, () => {
    let bundle = addBundleActivityFavorite(emptyBundle(model), 101, 1, 10, "TV Power");
    assert.deepEqual(bundle.activities[0].referenced_source_device_ids, [1]);
    assertActivityMembershipInvariant(bundle, 101);

    bundle = addActivityMacroCommandStep(bundle, 101, 1, 2, 20, 0);
    assert.deepEqual(bundle.activities[0].referenced_source_device_ids, [1, 2]);
    assertActivityMembershipInvariant(bundle, 101);

    bundle = upsertActivityButtonBinding(bundle, 101, { buttonId: 0xB0, deviceId: 3, commandId: 30 });
    assert.deepEqual(bundle.activities[0].referenced_source_device_ids, [1, 2, 3]);
    assertActivityMembershipInvariant(bundle, 101);

    bundle = deleteActivityButtonBinding(bundle, 101, 0xB0);
    assert.deepEqual(bundle.activities[0].referenced_source_device_ids, [1, 2]);
    assertActivityMembershipInvariant(bundle, 101);

    bundle = removeActivityMacroStep(bundle, 101, 1, 0);
    assert.deepEqual(bundle.activities[0].referenced_source_device_ids, [1]);
    assertActivityMembershipInvariant(bundle, 101);

    bundle = deleteBundleActivityQuickAccess(bundle, 101, "favorite", 1);
    assert.deepEqual(bundle.activities[0].referenced_source_device_ids, []);
    assertActivityMembershipInvariant(bundle, 101);
  });
}

test("reconcile repairs every missing start/shutdown row and is idempotent", () => {
  const bundle = emptyBundle("X1S");
  bundle.activities[0] = {
    ...bundle.activities[0],
    favorite_slots: [{ button_id: 1, device_id: 2, command_id: 20, name: "AVR" }],
    referenced_source_device_ids: [1],
    macros: [{
      button_id: 198,
      name: "POWER_ON",
      steps: [{ device_id: 1, command_id: POWER_ON, button_code: 0, duration: 0, delay: DELAY }],
    }],
  };

  const repaired = reconcileActivityPowerMacros(bundle, 101);
  assert.deepEqual(repaired.activities[0].referenced_source_device_ids, [1, 2]);
  assertActivityMembershipInvariant(repaired, 101);
  assert.deepEqual(reconcileActivityPowerMacros(repaired, 101), repaired);
});

test("a zero wait accepts either an omitted or retained physical delay row", () => {
  let bundle = addActivityMacroCommandStep(emptyBundle("X1S"), 101, 1, 1, 10, 0);
  let userMacro = macro(bundle.activities[0], 1);

  assert.equal((userMacro.steps ?? []).filter(isDelay).length, 0);

  bundle = setActivityMacroStepWait(bundle, 101, 1, 0, 5);
  userMacro = macro(bundle.activities[0], 1);
  assert.deepEqual(
    (userMacro.steps ?? []).map((step) => [step.device_id, step.command_id, step.delay]),
    [[1, 10, DELAY], [DELAY, DELAY, 5]],
  );

  bundle = setActivityMacroStepWait(bundle, 101, 1, 0, 0);
  userMacro = macro(bundle.activities[0], 1);
  assert.deepEqual(
    (userMacro.steps ?? []).map((step) => [step.device_id, step.command_id, step.delay]),
    [[1, 10, DELAY], [DELAY, DELAY, 0]],
  );
});

test("a nonzero macro wait remains attached through reorder", () => {
  let bundle = addActivityMacroCommandStep(emptyBundle("X1S"), 101, 1, 1, 10, 0);
  bundle = setActivityMacroStepWait(bundle, 101, 1, 0, 8);
  bundle = addActivityMacroCommandStep(bundle, 101, 1, 2, 20, 0);
  const reordered = reorderActivityMacroSteps(bundle, 101, 1, [1, 0]);
  const userMacro = macro(reordered.activities[0], 1);

  assertNonzeroWaitRowsAreAttached(userMacro);
  assert.deepEqual(
    (userMacro.steps ?? []).map((step) => [step.device_id, step.command_id, step.delay]),
    [[2, 20, DELAY], [1, 10, DELAY], [DELAY, DELAY, 8]],
  );
  assertActivityMembershipInvariant(reordered, 101);
});
