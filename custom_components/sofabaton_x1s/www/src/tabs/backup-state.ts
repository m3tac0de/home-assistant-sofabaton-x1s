import type {
  BackupBundleActivityPayload,
  BackupBundleDevicePayload,
  BackupBundlePayload,
  CacheHubState,
} from "../shared/ha-context";
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
  if (Number(bundle.schema_version || 0) !== 4) {
    throw new Error(`Backup file schema_version must be 4 (got ${String(bundle.schema_version || "") || "unknown"}).`);
  }
  if (!Array.isArray(bundle.devices) || !Array.isArray(bundle.activities)) {
    throw new Error("Backup file is missing devices or activities arrays.");
  }
  return bundle;
}
