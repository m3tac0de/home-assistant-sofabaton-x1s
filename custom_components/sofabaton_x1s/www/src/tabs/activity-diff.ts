/**
 * Review diff for the live Activities editor (Phase L3 of
 * docs/internal/live-activity-editor-plan.md, §5.4).
 *
 * Pure and display-only: turns a {baseline, edited} bundle pair into a
 * human-readable list of pending changes for the review dialog. It never
 * drives writes — the authoritative write plan is the Python
 * `build_activity_sync_plan` (L4). Both consume the identical bundle
 * shapes; this side speaks the editor's strings.
 *
 * Comparison reuses the same selectors the editor renders from, so the
 * review list stays in lock-step with what the user sees.
 */
import type { BackupBundlePayload } from "../shared/ha-context";
import { TOOLS_CARD_STRINGS } from "../strings";
import {
  ACTIVITY_ROLE_GROUPS,
  activityMacroStepItems,
  activityMemberViews,
  activityQuickAccessItems,
  activityRoleAssignments,
  deviceButtonBindingItems,
  deviceCommandItems,
  deviceIdleBehavior,
  bundleDeviceOptions,
  type BackupActivityMemberView,
  type BackupActivityQuickAccessItem,
} from "./backup-state";

const R = TOOLS_CARD_STRINGS.activities.review;

const POWER_ON_MACRO_BUTTON_ID = 198;
const POWER_OFF_MACRO_BUTTON_ID = 199;

export type ActivityReviewSection =
  | "devices"
  | "start"
  | "buttons"
  | "shortcuts"
  | "end"
  | "device_wide";

export interface ActivityReviewEntry {
  text: string;
  /** Device-global effect (idle behavior, command rename) — the dialog
   *  appends an "applies everywhere" note. */
  global?: boolean;
}

export interface ActivityReviewGroup {
  section: ActivityReviewSection;
  entries: ActivityReviewEntry[];
}

const SECTION_ORDER: ActivityReviewSection[] = [
  "devices",
  "start",
  "buttons",
  "shortcuts",
  "end",
  "device_wide",
];

export function diffActivityForReview(
  baseline: BackupBundlePayload | null,
  edited: BackupBundlePayload | null,
  activityId: number,
): ActivityReviewGroup[] {
  const buckets: Record<ActivityReviewSection, ActivityReviewEntry[]> = {
    devices: [],
    start: [],
    buttons: [],
    shortcuts: [],
    end: [],
    device_wide: [],
  };
  if (!baseline || !edited) return [];

  const baseMembers = activityMemberViews(baseline, activityId);
  const editMembers = activityMemberViews(edited, activityId);
  const baseById = new Map(baseMembers.map((member) => [member.deviceId, member]));
  const editById = new Map(editMembers.map((member) => [member.deviceId, member]));

  diffMembership(buckets, baseById, editById);
  diffStart(buckets, baseline, edited, activityId, baseById, editById);
  diffButtons(buckets, baseline, edited, activityId);
  diffShortcuts(buckets, baseline, edited, activityId);
  diffEnd(buckets, baseById, editById);
  diffDeviceWide(buckets, baseline, edited, editMembers);

  return SECTION_ORDER
    .map((section) => ({ section, entries: buckets[section] }))
    .filter((group) => group.entries.length > 0);
}

// ── Device review (live device editor) ────────────────────────────────

export type DeviceReviewSection = "power" | "buttons" | "macros";

export interface DeviceReviewGroup {
  section: DeviceReviewSection;
  entries: ActivityReviewEntry[];
}

const DEVICE_SECTION_ORDER: DeviceReviewSection[] = ["power", "buttons", "macros"];

interface RawMacroRow {
  button_id?: number;
  name?: string;
  steps?: unknown[];
}

function rawDeviceMacros(bundle: BackupBundlePayload, deviceId: number): Map<number, RawMacroRow> {
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === Number(deviceId),
  ) as { macros?: RawMacroRow[] } | undefined;
  const rows = new Map<number, RawMacroRow>();
  for (const macro of device?.macros ?? []) {
    const buttonId = Number(macro?.button_id || 0);
    if (buttonId > 0) rows.set(buttonId, macro);
  }
  return rows;
}

function macroStepsSignature(macro: RawMacroRow | undefined): string {
  return JSON.stringify(macro?.steps ?? []);
}

export function diffDeviceForReview(
  baseline: BackupBundlePayload | null,
  edited: BackupBundlePayload | null,
  deviceId: number,
): DeviceReviewGroup[] {
  const D = TOOLS_CARD_STRINGS.activities.deviceReview;
  const buckets: Record<DeviceReviewSection, ActivityReviewEntry[]> = {
    power: [],
    buttons: [],
    macros: [],
  };
  if (!baseline || !edited) return [];

  // Power: automatic power control byte + the two power sequences.
  const idleBefore = deviceIdleBehavior(baseline, deviceId);
  const idleAfter = deviceIdleBehavior(edited, deviceId);
  if (idleBefore !== idleAfter) {
    const label = R.idleShort[Number(idleAfter ?? 0)] ?? String(idleAfter);
    buckets.power.push({ text: D.powerControlChanged(label) });
  }
  const baseMacros = rawDeviceMacros(baseline, deviceId);
  const editMacros = rawDeviceMacros(edited, deviceId);
  for (const [buttonId, text] of [
    [POWER_ON_MACRO_BUTTON_ID, D.powerOnChanged],
    [POWER_OFF_MACRO_BUTTON_ID, D.powerOffChanged],
  ] as Array<[number, string]>) {
    if (macroStepsSignature(baseMacros.get(buttonId)) !== macroStepsSignature(editMacros.get(buttonId))) {
      buckets.power.push({ text });
    }
  }

  // Macros (non-power): added / removed / renamed / steps edited.
  const isPower = (id: number) => id === POWER_ON_MACRO_BUTTON_ID || id === POWER_OFF_MACRO_BUTTON_ID;
  for (const [buttonId, macro] of editMacros) {
    if (isPower(buttonId)) continue;
    const before = baseMacros.get(buttonId);
    const name = String(macro?.name || `Macro ${buttonId}`);
    if (!before) {
      buckets.macros.push({ text: D.macroAdded(name) });
      continue;
    }
    const renamed = String(before?.name || "") !== String(macro?.name || "");
    const stepsChanged = macroStepsSignature(before) !== macroStepsSignature(macro);
    if (renamed) buckets.macros.push({ text: D.macroRenamed(String(before?.name || ""), name) });
    if (stepsChanged) buckets.macros.push({ text: D.macroChanged(name) });
  }
  for (const [buttonId, macro] of baseMacros) {
    if (isPower(buttonId) || editMacros.has(buttonId)) continue;
    buckets.macros.push({ text: D.macroRemoved(String(macro?.name || `Macro ${buttonId}`)) });
  }

  // Buttons: the device's own binding rows.
  const baseBindings = new Map(deviceButtonBindingItems(baseline, deviceId).map((item) => [item.buttonId, item]));
  const editBindings = new Map(deviceButtonBindingItems(edited, deviceId).map((item) => [item.buttonId, item]));
  for (const [buttonId, item] of editBindings) {
    const before = baseBindings.get(buttonId);
    const changed = !before
      || before.commandId !== item.commandId
      || (before.longPress?.commandId ?? null) !== (item.longPress?.commandId ?? null);
    if (changed) buckets.buttons.push({ text: D.bindingBound(item.buttonName, item.shortPressLabel) });
  }
  for (const [buttonId, item] of baseBindings) {
    if (!editBindings.has(buttonId)) buckets.buttons.push({ text: D.bindingCleared(item.buttonName) });
  }

  return DEVICE_SECTION_ORDER
    .map((section) => ({ section, entries: buckets[section] }))
    .filter((group) => group.entries.length > 0);
}

// ── Devices (membership) ──────────────────────────────────────────────

function diffMembership(
  buckets: Record<ActivityReviewSection, ActivityReviewEntry[]>,
  baseById: Map<number, BackupActivityMemberView>,
  editById: Map<number, BackupActivityMemberView>,
) {
  for (const [deviceId, member] of editById) {
    if (!baseById.has(deviceId)) buckets.devices.push({ text: R.deviceAdded(member.deviceName) });
  }
  for (const [deviceId, member] of baseById) {
    if (!editById.has(deviceId)) buckets.devices.push({ text: R.deviceRemoved(member.deviceName) });
  }
}

// ── When it starts (power-on + inputs + sequence order) ───────────────

function diffStart(
  buckets: Record<ActivityReviewSection, ActivityReviewEntry[]>,
  baseline: BackupBundlePayload,
  edited: BackupBundlePayload,
  activityId: number,
  baseById: Map<number, BackupActivityMemberView>,
  editById: Map<number, BackupActivityMemberView>,
) {
  for (const [deviceId, member] of editById) {
    const before = baseById.get(deviceId);
    if (!before) continue; // added/removed handled by membership
    if ((member.inputCommandId ?? null) !== (before.inputCommandId ?? null)) {
      buckets.start.push({
        text: member.inputCommandId != null && member.inputCommandName
          ? R.inputChanged(member.deviceName, member.inputCommandName)
          : R.inputCleared(member.deviceName),
      });
    }
  }
  // Order of the power-on member references, ignoring per-device flag/input
  // changes already reported above.
  const baseOrder = powerSequenceOrder(baseline, activityId);
  const editOrder = powerSequenceOrder(edited, activityId);
  if (baseOrder.length === editOrder.length && baseOrder.join(",") !== editOrder.join(",")) {
    buckets.start.push({ text: R.startReordered });
  }
}

function powerSequenceOrder(bundle: BackupBundlePayload, activityId: number): number[] {
  return activityMacroStepItems(bundle, activityId, POWER_ON_MACRO_BUTTON_ID)
    .map((step) => Number(step.deviceId ?? 0))
    .filter((id) => id > 0);
}

// ── Buttons (role assignments) ────────────────────────────────────────

function diffButtons(
  buckets: Record<ActivityReviewSection, ActivityReviewEntry[]>,
  baseline: BackupBundlePayload,
  edited: BackupBundlePayload,
  activityId: number,
) {
  const baseRoles = new Map(activityRoleAssignments(baseline, activityId).map((role) => [role.group, role]));
  const editRoles = new Map(activityRoleAssignments(edited, activityId).map((role) => [role.group, role]));
  for (const group of ACTIVITY_ROLE_GROUPS) {
    const before = baseRoles.get(group);
    const after = editRoles.get(group);
    if (!after) continue;
    const changed = !before
      || before.state !== after.state
      || (before.deviceId ?? null) !== (after.deviceId ?? null);
    if (!changed) continue;
    const label = R.roleGroups[group] ?? group;
    if (after.state === "unused") {
      buckets.buttons.push({ text: R.roleCleared(label) });
    } else if (after.state === "device" && after.deviceName) {
      buckets.buttons.push({ text: R.roleNowControls(label, after.deviceName) });
    } else {
      buckets.buttons.push({ text: R.roleCustomized(label) });
    }
  }
}

// ── Shortcuts (quick access) ──────────────────────────────────────────

function shortcutIdentity(item: BackupActivityQuickAccessItem): string {
  // The editor reassigns quick-access button_ids positionally on every edit,
  // so button_id is a display position, not a stable identity. A favorite's
  // durable identity is its content (device + command); fall back to button_id
  // only for macros, which have no single command.
  if (item.kind === "favorite" && item.deviceId != null && item.commandId != null) {
    return `favorite:${item.deviceId}:${item.commandId}`;
  }
  return `${item.kind}:${item.buttonId}`;
}

function diffShortcuts(
  buckets: Record<ActivityReviewSection, ActivityReviewEntry[]>,
  baseline: BackupBundlePayload,
  edited: BackupBundlePayload,
  activityId: number,
) {
  const base = activityQuickAccessItems(baseline, activityId);
  const edit = activityQuickAccessItems(edited, activityId);
  const baseById = new Map(base.map((item) => [shortcutIdentity(item), item]));
  const editById = new Map(edit.map((item) => [shortcutIdentity(item), item]));

  for (const [id, item] of editById) {
    if (!baseById.has(id)) buckets.shortcuts.push({ text: R.shortcutAdded(item.label) });
  }
  for (const [id, item] of baseById) {
    if (!editById.has(id)) buckets.shortcuts.push({ text: R.shortcutRemoved(item.label) });
  }
  for (const [id, item] of editById) {
    const before = baseById.get(id);
    if (before && before.label !== item.label) {
      buckets.shortcuts.push({ text: R.shortcutRenamed(before.label, item.label) });
    }
  }
  // Reorder: identical membership, different order.
  const baseIds = base.map(shortcutIdentity);
  const editIds = edit.map(shortcutIdentity);
  if (
    baseIds.length === editIds.length
    && baseIds.length > 0
    && [...baseIds].sort().join(",") === [...editIds].sort().join(",")
    && baseIds.join(",") !== editIds.join(",")
  ) {
    buckets.shortcuts.push({ text: R.shortcutsReordered });
  }
}

// ── When it ends (power-off) ──────────────────────────────────────────

function diffEnd(
  _buckets: Record<ActivityReviewSection, ActivityReviewEntry[]>,
  _baseById: Map<number, BackupActivityMemberView>,
  _editById: Map<number, BackupActivityMemberView>,
) {
  // Per-device end behavior is encoded by device-wide idle behavior, not by
  // optional activity POWER_OFF refs. The idle diff is reported under
  // Device-wide changes because it applies everywhere that device is used.
}

// ── Device-wide (idle behavior, command renames) ──────────────────────

function diffDeviceWide(
  buckets: Record<ActivityReviewSection, ActivityReviewEntry[]>,
  baseline: BackupBundlePayload,
  edited: BackupBundlePayload,
  editMembers: BackupActivityMemberView[],
) {
  // Idle behavior — only for devices this activity includes (the editor's
  // End section is where it changes), but the effect is global.
  for (const member of editMembers) {
    const before = deviceIdleBehavior(baseline, member.deviceId);
    const after = deviceIdleBehavior(edited, member.deviceId);
    if (before !== after) {
      const label = R.idleShort[Number(after ?? 0)] ?? String(after);
      buckets.device_wide.push({ text: R.idleChanged(member.deviceName, label), global: true });
    }
  }
  // Command renames — compare every device's command labels; a favorite
  // "rename" rewrites the device command globally.
  for (const device of bundleDeviceOptions(edited)) {
    const deviceId = device.id;
    const before = new Map(deviceCommandItems(baseline, deviceId).map((cmd) => [cmd.commandId, cmd.label]));
    const after = deviceCommandItems(edited, deviceId);
    for (const cmd of after) {
      const prev = before.get(cmd.commandId);
      if (prev != null && prev !== cmd.label) {
        buckets.device_wide.push({ text: R.commandRenamed(prev, cmd.label, device.label), global: true });
      }
    }
  }
}
