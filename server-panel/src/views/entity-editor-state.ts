// Pure helpers both editors share (activity editor plan, decision 3): the
// entity's element inside the snapshot-as-bundle, the draft slot's shape and
// the macro time bytes. The device editor's own helpers stay in
// device-editor-state.ts, the activity editor's in activity-editor-state.ts.

import type {
  BackupBundleActivityPayload,
  BackupBundleDevicePayload,
  BackupBundlePayload,
} from "../../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import type { Draft } from "../panel-store";

export type EntityKind = "device" | "activity";
export type EntityElement = BackupBundleDevicePayload | BackupBundleActivityPayload;

function rowsOf(bundle: BackupBundlePayload | null, kind: EntityKind): EntityElement[] {
  return ((kind === "device" ? bundle?.devices : bundle?.activities) ?? []) as EntityElement[];
}

function idOf(entry: EntityElement | null | undefined): number {
  return Number(entry?.device?.device_id ?? -1);
}

export function entityElement(bundle: BackupBundlePayload | null, kind: EntityKind, entityId: number): EntityElement | null {
  return rowsOf(bundle, kind).find((entry) => idOf(entry) === Number(entityId)) ?? null;
}

/** The bundle with one element replaced (a draft's element spliced into a fresh snapshot). */
export function withEntityElement(bundle: BackupBundlePayload, kind: EntityKind, entityId: number, element: EntityElement): BackupBundlePayload {
  const id = Number(entityId);
  const swap = (rows: EntityElement[] | null | undefined) => (rows ?? []).map((entry) => (idOf(entry) === id ? element : entry));
  return kind === "device"
    ? { ...bundle, devices: swap(bundle.devices) as BackupBundleDevicePayload[] }
    : { ...bundle, activities: swap(bundle.activities as EntityElement[]) as BackupBundlePayload["activities"] };
}

/** The list subtab an entity kind lives under. */
export function entityListSub(kind: EntityKind): "devices" | "activities" {
  return kind === "device" ? "devices" : "activities";
}

/** The draft scope (state plan decision 8): the editor's route scope. */
export function entityDraftScope(kind: EntityKind, entityId: number): string {
  return `hub/${entityListSub(kind)}/${Number(entityId)}`;
}

/** What an editor keeps in the draft slot: its element, and for an activity the device elements its edit touched. */
export interface EntityDraftData {
  element: EntityElement;
  devices?: BackupBundleDevicePayload[];
}

/** The stored draft's data when it belongs to this entity and looks like one; null otherwise. */
export function entityDraftData(draft: Draft | null | undefined, kind: EntityKind, entityId: number): EntityDraftData | null {
  if (!draft || draft.scope !== entityDraftScope(kind, entityId)) return null;
  const data = draft.data as Partial<EntityDraftData> | null | undefined;
  const element = data?.element;
  if (!element || typeof element !== "object" || idOf(element) !== Number(entityId)) return null;
  const devices = Array.isArray(data?.devices) ? data!.devices!.filter((entry) => entry && typeof entry === "object" && idOf(entry) > 0) : [];
  return devices.length ? { element, devices } : { element };
}

/** Device elements of `working` that differ from `baseline` (an activity edit's device-side effects, e.g. Set input). */
export function touchedDevices(working: BackupBundlePayload | null, baseline: BackupBundlePayload | null): BackupBundleDevicePayload[] {
  const before = new Map((baseline?.devices ?? []).map((entry) => [idOf(entry), JSON.stringify(entry)]));
  return (working?.devices ?? []).filter((entry) => before.has(idOf(entry)) && before.get(idOf(entry)) !== JSON.stringify(entry));
}

/** A bundle with the draft's data spliced back in. */
export function withDraftData(bundle: BackupBundlePayload, kind: EntityKind, entityId: number, data: EntityDraftData): BackupBundlePayload {
  let next = withEntityElement(bundle, kind, entityId, data.element);
  for (const device of data.devices ?? []) next = withEntityElement(next, "device", idOf(device), device);
  return next;
}

// -- macro time bytes (0.5 s units; a byte of 4 = 2.0 s; 0 = a click / no wait) -----------------

export function byteToSeconds(byteValue: number): string {
  return (Number(byteValue) * 0.5).toFixed(1).replace(/\.0$/, "");
}

export function secondsToByte(value: string): number {
  const seconds = parseFloat(String(value));
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(255, Math.max(0, Math.round(seconds * 2)));
}
