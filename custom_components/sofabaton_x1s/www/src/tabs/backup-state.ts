import type {
  BackupBundleActivityPayload,
  BackupBundleCommandRow,
  BackupBundleDevicePayload,
  BackupBundleFavoriteSlot,
  BackupBundleMacroRow,
  BackupBundlePayload,
  CacheHubState,
} from "../shared/ha-context";
import { BACKUP_BUNDLE_SCHEMA_VERSION } from "../shared/ha-context";
import { hubActivities, hubDevices } from "../shared/utils/control-panel-selectors";

export interface BackupSelectionOption {
  id: number;
  label: string;
  meta?: string;
}

export interface RestoreSelectionState {
  forcedDeviceIds: number[];
  selectedDeviceIds: number[];
}

export interface BackupActivityQuickAccessItem {
  kind: "macro" | "favorite";
  activityId: number;
  buttonId: number;
  label: string;
  deviceId?: number;
  commandId?: number;
}

const HUB_VERSION_RANK: Record<string, number> = {
  X1: 1,
  X1S: 2,
  X2: 3,
};
const INTERNAL_POWER_MACRO_BUTTON_IDS = new Set([198, 199]);

export function backupActivityOptions(hub: CacheHubState | null): BackupSelectionOption[] {
  return hubActivities(hub).map((activity) => ({
    id: Number(activity.id),
    label: String(activity.name || `Activity ${activity.id}`),
    meta: `${Number(activity.favorite_count || 0)} favs · ${Number(activity.macro_count || 0)} macros`,
  }));
}

export function backupDeviceOptions(hub: CacheHubState | null): BackupSelectionOption[] {
  return hubDevices(hub).map((device) => ({
    id: Number(device.id),
    label: String(device.name || `Device ${device.id}`),
    meta: String(device.device_class || "").trim() || undefined,
  }));
}

export function bundleActivityOptions(bundle: BackupBundlePayload | null): BackupSelectionOption[] {
  return [...(bundle?.activities ?? [])]
    .map((activity) => {
      const block = activity?.device || {};
      const id = Number(block.device_id || 0);
      return {
        id,
        label: String(block.name || `Activity ${id}`),
        meta: `${(activity?.referenced_source_device_ids ?? []).length} linked devices`,
      };
    })
    .filter((option) => option.id > 0)
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function bundleDeviceOptions(bundle: BackupBundlePayload | null): BackupSelectionOption[] {
  return [...(bundle?.devices ?? [])]
    .map((device) => {
      const block = device?.device || {};
      const id = Number(block.device_id || 0);
      return {
        id,
        label: String(block.name || `Device ${id}`),
        meta: String(block.device_class || "").trim() || undefined,
      };
    })
    .filter((option) => option.id > 0)
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function forcedRestoreDeviceIds(bundle: BackupBundlePayload | null, selectedActivityIds: number[]): number[] {
  const selected = new Set(selectedActivityIds.map((value) => Number(value)));
  const forced = new Set<number>();
  for (const activity of bundle?.activities ?? []) {
    const activityId = Number(activity?.device?.device_id || 0);
    if (!selected.has(activityId)) continue;
    for (const deviceId of activity?.referenced_source_device_ids ?? []) {
      const normalized = Number(deviceId);
      if (normalized > 0) forced.add(normalized);
    }
  }
  return [...forced].sort((left, right) => left - right);
}

export function reconcileRestoreSelection(params: {
  bundle: BackupBundlePayload | null;
  selectedActivityIds: number[];
  manualSelectedDeviceIds: number[];
}): RestoreSelectionState {
  const forcedDeviceIds = forcedRestoreDeviceIds(params.bundle, params.selectedActivityIds);
  const selected = new Set<number>(forcedDeviceIds);
  for (const deviceId of params.manualSelectedDeviceIds ?? []) {
    const normalized = Number(deviceId);
    if (normalized > 0) selected.add(normalized);
  }
  return {
    forcedDeviceIds,
    selectedDeviceIds: [...selected].sort((left, right) => left - right),
  };
}

export function backupUsesWholeHub(selectedActivityIds: number[]): boolean {
  return (selectedActivityIds ?? []).length > 0;
}

export function pruneBackupBundle(params: {
  bundle: BackupBundlePayload;
  selectedActivityIds: number[];
  selectedDeviceIds: number[];
}): BackupBundlePayload {
  const selectedActivityIds = new Set((params.selectedActivityIds ?? []).map((value) => Number(value)));
  const selectedDeviceIds = new Set((params.selectedDeviceIds ?? []).map((value) => Number(value)));
  return {
    ...params.bundle,
    devices: (params.bundle.devices ?? []).filter((device) => selectedDeviceIds.has(Number(device?.device?.device_id || 0))),
    activities: (params.bundle.activities ?? []).filter((activity) => selectedActivityIds.has(Number(activity?.device?.device_id || 0))),
  };
}

export function validateBackupBundle(raw: unknown): BackupBundlePayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("Backup file must contain a JSON object.");
  }
  const bundle = raw as BackupBundlePayload;
  if (String(bundle.kind || "") !== "hub_bundle") {
    throw new Error("Backup file is not a Sofabaton hub bundle.");
  }
  if (Number(bundle.schema_version || 0) !== BACKUP_BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `Backup file schema_version must be ${BACKUP_BUNDLE_SCHEMA_VERSION} (got ${String(bundle.schema_version || "") || "unknown"}).`,
    );
  }
  if (!Array.isArray(bundle.devices) || !Array.isArray(bundle.activities)) {
    throw new Error("Backup file is missing devices or activities arrays.");
  }
  return bundle;
}

export function normalizeHubVersion(value: unknown): string | null {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes("X1S")) return "X1S";
  if (normalized.includes("X2")) return "X2";
  if (normalized.includes("X1")) return "X1";
  return null;
}

export function renameBundleHub(bundle: BackupBundlePayload, name: string): BackupBundlePayload {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return bundle;
  return {
    ...bundle,
    hub: { ...(bundle.hub ?? {}), name: trimmed },
  };
}

function renameInList<T extends { device?: BackupBundleDeviceBlock | null }>(
  list: T[] | undefined,
  id: number,
  name: string,
): T[] {
  const trimmed = String(name ?? "").trim();
  return (list ?? []).map((entry) => {
    const block = entry?.device;
    if (!block || Number(block.device_id || 0) !== id) return entry;
    return { ...entry, device: { ...block, name: trimmed || block.name || `Device ${id}` } };
  });
}

export function renameBundleActivity(
  bundle: BackupBundlePayload,
  activityId: number,
  name: string,
): BackupBundlePayload {
  return { ...bundle, activities: renameInList(bundle.activities, Number(activityId), name) };
}

export function renameBundleDevice(
  bundle: BackupBundlePayload,
  deviceId: number,
  name: string,
): BackupBundlePayload {
  return { ...bundle, devices: renameInList(bundle.devices, Number(deviceId), name) };
}

function updateActivity(
  bundle: BackupBundlePayload,
  activityId: number,
  updater: (activity: BackupBundleActivityPayload) => BackupBundleActivityPayload,
): BackupBundlePayload {
  const normalizedId = Number(activityId);
  return {
    ...bundle,
    activities: (bundle.activities ?? []).map((activity) => {
      if (Number(activity?.device?.device_id || 0) !== normalizedId) return activity;
      return updater(activity);
    }),
  };
}

function updateDeviceCommandLabel(
  bundle: BackupBundlePayload,
  deviceId: number,
  commandId: number,
  name: string,
): BackupBundlePayload {
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  const trimmed = String(name ?? "").trim();
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).map((command) => {
          if (Number(command?.command_id || 0) !== normalizedCommandId) return command;
          return { ...command, name: trimmed };
        }),
      };
    }),
  };
}

function commandLabelFor(bundle: BackupBundlePayload, deviceId: number, commandId: number) {
  const device = (bundle.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  const command = (device?.commands ?? []).find((entry) => Number(entry?.command_id || 0) === Number(commandId));
  return String(command?.name || "").trim();
}

function favoriteLabel(bundle: BackupBundlePayload, row: BackupBundleFavoriteSlot) {
  const explicit = String(row?.name || "").trim();
  if (explicit) return explicit;
  const deviceId = Number(row?.device_id || 0);
  const commandId = Number(row?.command_id || 0);
  const derived = commandLabelFor(bundle, deviceId, commandId);
  if (derived) return derived;
  return `Favorite ${Number(row?.button_id || 0) || "?"}`;
}

function sortByButtonId<T extends { button_id?: number | null }>(rows: T[] | null | undefined): T[] {
  return [...(rows ?? [])].sort((left, right) => Number(left?.button_id || 0) - Number(right?.button_id || 0));
}

function isEditableActivityMacro(row: BackupBundleMacroRow) {
  const buttonId = Number(row?.button_id || 0);
  const normalizedName = String(row?.name || "").trim().toUpperCase();
  if (INTERNAL_POWER_MACRO_BUTTON_IDS.has(buttonId)) return false;
  if (normalizedName === "POWER_ON" || normalizedName === "POWER_OFF") return false;
  return true;
}

export function activityQuickAccessItems(
  bundle: BackupBundlePayload | null,
  activityId: number,
): BackupActivityQuickAccessItem[] {
  if (!bundle) return [];
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  if (!activity) return [];
  const items: BackupActivityQuickAccessItem[] = [];
  for (const row of sortByButtonId<BackupBundleMacroRow>(activity.macros).filter(isEditableActivityMacro)) {
    const buttonId = Number(row?.button_id || 0);
    if (buttonId <= 0) continue;
    items.push({
      kind: "macro",
      activityId: Number(activityId),
      buttonId,
      label: String(row?.name || `Macro ${buttonId}`),
    });
  }
  for (const row of sortByButtonId<BackupBundleFavoriteSlot>(activity.favorite_slots)) {
    const buttonId = Number(row?.button_id || 0);
    if (buttonId <= 0) continue;
    items.push({
      kind: "favorite",
      activityId: Number(activityId),
      buttonId,
      label: favoriteLabel(bundle, row),
      deviceId: Number(row?.device_id || 0) || undefined,
      commandId: Number(row?.command_id || 0) || undefined,
    });
  }
  return items.sort((left, right) => left.buttonId - right.buttonId);
}

export function renameBundleActivityMacro(
  bundle: BackupBundlePayload,
  activityId: number,
  buttonId: number,
  name: string,
): BackupBundlePayload {
  const normalizedButtonId = Number(buttonId);
  const trimmed = String(name ?? "").trim();
  return updateActivity(bundle, activityId, (activity) => ({
    ...activity,
    macros: (activity.macros ?? []).map((row) => (
      Number(row?.button_id || 0) === normalizedButtonId ? { ...row, name: trimmed } : row
    )),
  }));
}

export function renameBundleActivityFavorite(
  bundle: BackupBundlePayload,
  activityId: number,
  buttonId: number,
  name: string,
): BackupBundlePayload {
  const normalizedButtonId = Number(buttonId);
  const trimmed = String(name ?? "").trim();
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const row = (activity?.favorite_slots ?? []).find((entry) => Number(entry?.button_id || 0) === normalizedButtonId);
  const deviceId = Number(row?.device_id || 0);
  const commandId = Number(row?.command_id || 0);
  let nextBundle = bundle;
  if (deviceId > 0 && commandId > 0) {
    nextBundle = updateDeviceCommandLabel(nextBundle, deviceId, commandId, trimmed);
  }
  return updateActivity(nextBundle, activityId, (current) => ({
    ...current,
    favorite_slots: (current.favorite_slots ?? []).map((entry) => (
      Number(entry?.button_id || 0) === normalizedButtonId ? { ...entry, name: trimmed } : entry
    )),
  }));
}

export function reorderBundleActivityQuickAccess(
  bundle: BackupBundlePayload,
  activityId: number,
  orderedItems: Array<Pick<BackupActivityQuickAccessItem, "kind" | "buttonId">>,
): BackupBundlePayload {
  const normalizedActivityId = Number(activityId);
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === normalizedActivityId);
  if (!activity) return bundle;
  const macrosByButtonId = new Map<number, BackupBundleMacroRow>();
  for (const row of activity.macros ?? []) {
    macrosByButtonId.set(Number(row?.button_id || 0), row);
  }
  const favoritesByButtonId = new Map<number, BackupBundleFavoriteSlot>();
  for (const row of activity.favorite_slots ?? []) {
    favoritesByButtonId.set(Number(row?.button_id || 0), row);
  }
  const macroRows: BackupBundleMacroRow[] = [];
  const favoriteRows: BackupBundleFavoriteSlot[] = [];
  orderedItems.forEach((item, index) => {
    const nextButtonId = index + 1;
    if (item.kind === "macro") {
      const row = macrosByButtonId.get(Number(item.buttonId));
      if (row) macroRows.push({ ...row, button_id: nextButtonId });
      return;
    }
    const row = favoritesByButtonId.get(Number(item.buttonId));
    if (row) favoriteRows.push({ ...row, button_id: nextButtonId });
  });
  return updateActivity(bundle, normalizedActivityId, (current) => ({
    ...current,
    macros: macroRows,
    favorite_slots: favoriteRows,
  }));
}

export function assertBackupBundleRestoreCompatible(bundle: BackupBundlePayload, destinationHubVersion: unknown) {
  const sourceVersion = normalizeHubVersion(bundle?.hub?.version);
  if (!sourceVersion) {
    throw new Error("Backup file is missing its source hub model, so compatibility cannot be verified.");
  }
  const destinationVersion = normalizeHubVersion(destinationHubVersion);
  if (!destinationVersion) {
    throw new Error("The destination hub model is unknown, so restore compatibility cannot be verified.");
  }
  if (HUB_VERSION_RANK[destinationVersion] < HUB_VERSION_RANK[sourceVersion]) {
    throw new Error(
      `This backup was created on a Sofabaton ${sourceVersion} hub and cannot be restored onto a Sofabaton ${destinationVersion} hub.`,
    );
  }
}
