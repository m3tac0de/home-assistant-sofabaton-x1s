import type {
  BackupBundleActivityPayload,
  BackupBundleCommandRow,
  BackupBundleDeviceBlock,
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

export interface BackupDeviceCommandItem {
  deviceId: number;
  commandId: number;
  label: string;
}

/**
 * Device-class strings whose command blobs can be round-tripped through
 * `lib/blob_decoders.py`. Mirrors `DECODABLE_CLASSES` on the Python side.
 * These names show up verbatim in `restore_data.decoded.class`.
 */
export type DecodableCommandClass =
  | "wifi_ip"
  | "wifi_roku"
  | "wifi_hue"
  | "wifi_sonos"
  | "ir";

/**
 * Per-field UI spec for the decoded payload editor.
 * Field keys mirror the Python decoder's `fields` dict keys exactly.
 */
export interface DecodedFieldSpec {
  key: string;
  label: string;
  multiline?: boolean;
  numeric?: boolean;
  // True when the wire form of this field separates lines with CRLF.
  // Set ONLY for fields where the protocol confidently dictates CRLF
  // (currently: the HTTP `header` field in wifi_ip). On save we
  // normalize the user's `\n` to `\r\n` so the wire round-trip stays
  // valid even though the browser's textarea hides the `\r`.
  crlfOnWire?: boolean;
  // True for fields that are a single opaque wire string where every
  // byte is part of the device-side protocol (Hue / Sonos body_block:
  // the literal string carries its own Content-Length declaration,
  // its own line separators, and its own body bytes). The editor
  // displays `\r` and `\n` as their two-character escape sequences so
  // the user sees the string for what it is, and unescapes on save.
  // Independent of `multiline` — a multiline textarea is still the
  // right control because long escaped strings need to wrap visually.
  escapedDisplay?: boolean;
  helper?: string;
}

export interface DecodedFormSpec {
  title: string;
  /** Short note shown under the form title to help the user. */
  subtitle?: string;
  fields: DecodedFieldSpec[];
}

/**
 * Per-class form layouts. The shape mirrors the corresponding decoder
 * in `lib/blob_decoders.py`. Adding a new decodable class requires:
 *   (a) extending DecodableCommandClass,
 *   (b) registering its form here,
 *   (c) implementing the decoder/encoder on the Python side.
 */
export const DECODED_CLASS_FORM_SPECS: Record<DecodableCommandClass, DecodedFormSpec> = {
  wifi_ip: {
    title: "HTTP request",
    subtitle: "Edits replay through the hub's wifi_ip writer. Host, port, and Content-Length are derived; you do not set them here.",
    fields: [
      { key: "host", label: "Host (IPv4)", helper: "e.g. 192.168.2.77" },
      { key: "port", label: "Port", numeric: true },
      { key: "method", label: "HTTP method", helper: "e.g. GET, POST" },
      { key: "path", label: "Path" },
      {
        key: "header",
        label: "Extra headers",
        multiline: true,
        crlfOnWire: true,
        helper: "One header per line. Host and Content-Length are added automatically.",
      },
      { key: "content_type", label: "Content type" },
      { key: "body", label: "Body", multiline: true },
    ],
  },
  wifi_roku: {
    title: "Roku ECP request",
    fields: [
      { key: "path", label: "ECP URL path", helper: "e.g. /launch/12 or /keypress/Home" },
    ],
  },
  wifi_hue: {
    title: "Hue REST request",
    subtitle: "Body block is injected verbatim between Host headers and the network write.",
    fields: [
      { key: "path", label: "URL path" },
      {
        key: "body_block",
        label: "Body block (raw wire string)",
        multiline: true,
        escapedDisplay: true,
        helper: "Single literal string sent to the device. Newlines are shown as \\n. You own the Content-Length value — it must match the body byte count.",
      },
    ],
  },
  wifi_sonos: {
    title: "Sonos UPnP request",
    subtitle: "Body block is injected verbatim between Host headers and the network write.",
    fields: [
      { key: "path", label: "URL path" },
      {
        key: "body_block",
        label: "Body block (raw wire string)",
        multiline: true,
        escapedDisplay: true,
        helper: "Single literal string sent to the device. Newlines are shown as \\n. You own the Content-Length value — it must match the body byte count.",
      },
    ],
  },
  ir: {
    title: "Descriptive IR payload",
    subtitle: "Edits replay through the hub's descriptive-IR writer. Only descriptive-protocol payloads (P:… D:… F:…) are decodable; raw learned-IR blobs are not editable here.",
    fields: [
      {
        key: "descriptor",
        label: "Descriptor",
        helper: "e.g. P:Sony12 R:40000 D:1 F:18 MUL:2",
      },
    ],
  },
};

/**
 * Shape of the `decoded` block as it lives inside `restore_data` in the
 * bundle JSON. `edited` is set to `true` by the editor to tell the
 * restore path to re-encode the payload from `fields` instead of using
 * the canonical `data_hex`.
 */
export interface BackupCommandDecodedBlock {
  className: DecodableCommandClass;
  fields: Record<string, unknown>;
  trailerHex: string;
  edited: boolean;
}

function normalizeDecodableClass(value: unknown): DecodableCommandClass | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized in DECODED_CLASS_FORM_SPECS) {
    return normalized as DecodableCommandClass;
  }
  return null;
}

/**
 * Read a command's `restore_data.decoded` block (if any), in the shape
 * the editor consumes. Returns `null` for commands that aren't in a
 * decodable class, or whose decoded block is missing / malformed.
 */
export function commandDecodedBlock(
  bundle: BackupBundlePayload | null,
  deviceId: number,
  commandId: number,
): BackupCommandDecodedBlock | null {
  if (!bundle) return null;
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedDeviceId,
  );
  if (!device) return null;
  const command = (device.commands ?? []).find(
    (entry) => Number(entry?.command_id || 0) === normalizedCommandId,
  );
  if (!command) return null;
  const restoreData = (command as { restore_data?: unknown }).restore_data;
  if (!restoreData || typeof restoreData !== "object") return null;
  const decoded = (restoreData as Record<string, unknown>).decoded;
  if (!decoded || typeof decoded !== "object") return null;
  const decodedRecord = decoded as Record<string, unknown>;
  const className = normalizeDecodableClass(decodedRecord.class);
  if (!className) return null;
  const fields = decodedRecord.fields;
  if (!fields || typeof fields !== "object") return null;
  return {
    className,
    fields: { ...(fields as Record<string, unknown>) },
    trailerHex: String(decodedRecord.trailer_hex ?? ""),
    edited: Boolean(decodedRecord.edited),
  };
}

/**
 * Write the user's edits into a command's `restore_data.decoded.fields`
 * and set `decoded.edited = true`. `data_hex` and `trailer_hex` are NOT
 * touched — the restore path re-encodes from `decoded` when the flag
 * is set, and re-uses the captured trailer verbatim.
 *
 * No-op when the targeted command, device, or decoded block is absent.
 */
export function updateCommandDecodedFields(
  bundle: BackupBundlePayload,
  deviceId: number,
  commandId: number,
  newFields: Record<string, unknown>,
): BackupBundlePayload {
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).map((command) => {
          if (Number(command?.command_id || 0) !== normalizedCommandId) return command;
          const restoreData = (command as { restore_data?: unknown }).restore_data;
          if (!restoreData || typeof restoreData !== "object") return command;
          const decoded = (restoreData as Record<string, unknown>).decoded;
          if (!decoded || typeof decoded !== "object") return command;
          const decodedRecord = decoded as Record<string, unknown>;
          const existingFields = (decodedRecord.fields ?? {}) as Record<string, unknown>;
          return {
            ...command,
            restore_data: {
              ...(restoreData as Record<string, unknown>),
              decoded: {
                ...decodedRecord,
                fields: { ...existingFields, ...newFields },
                edited: true,
              },
            },
          };
        }),
      };
    }),
  };
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

// The hub stores a per-record `sort` byte (body offset 6 of every
// device / activity record) that drives the display order shown in
// the official app and on the physical remote. The wire export already
// carries it via `bundle.{devices,activities}[].device.sort`, so all we
// need to do here is honor it. Id is a stable tiebreaker for records
// where the user never reordered (and so all sort values are 0).
interface OrderedBlock {
  device_id?: number | null;
  sort?: number | null;
}

function compareByHubOrder(
  left: { id: number; sortKey: number },
  right: { id: number; sortKey: number },
): number {
  return (left.sortKey - right.sortKey) || (left.id - right.id);
}

function readSortKey(block: OrderedBlock | undefined | null): number {
  const value = Number(block?.sort);
  return Number.isFinite(value) ? value : 0;
}

export function bundleActivityOptions(bundle: BackupBundlePayload | null): BackupSelectionOption[] {
  return [...(bundle?.activities ?? [])]
    .map((activity) => {
      const block = activity?.device || {};
      const id = Number(block.device_id || 0);
      return {
        id,
        sortKey: readSortKey(block),
        label: String(block.name || `Activity ${id}`),
        meta: `${(activity?.referenced_source_device_ids ?? []).length} linked devices`,
      };
    })
    .filter((option) => option.id > 0)
    .sort(compareByHubOrder)
    .map(({ id, label, meta }) => ({ id, label, meta }));
}

export function bundleDeviceOptions(bundle: BackupBundlePayload | null): BackupSelectionOption[] {
  return [...(bundle?.devices ?? [])]
    .map((device) => {
      const block = device?.device || {};
      const id = Number(block.device_id || 0);
      return {
        id,
        sortKey: readSortKey(block),
        label: String(block.name || `Device ${id}`),
        meta: String(block.device_class || "").trim() || undefined,
      };
    })
    .filter((option) => option.id > 0)
    .sort(compareByHubOrder)
    .map(({ id, label, meta }) => ({ id, label, meta }));
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

/**
 * List the commands on a given Device, sorted by command id. Returns the
 * shape consumed by the Device detail view's command list.
 */
export function deviceCommandItems(
  bundle: BackupBundlePayload | null,
  deviceId: number,
): BackupDeviceCommandItem[] {
  if (!bundle) return [];
  const normalizedDeviceId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedDeviceId,
  );
  if (!device) return [];
  const items: BackupDeviceCommandItem[] = [];
  for (const row of device.commands ?? []) {
    const commandId = Number(row?.command_id || 0);
    if (commandId <= 0) continue;
    const label = String(row?.name || "").trim() || `Command ${commandId}`;
    items.push({ deviceId: normalizedDeviceId, commandId, label });
  }
  return items.sort((left, right) => left.commandId - right.commandId);
}

/**
 * Read a device's `device_class` string from the bundle, normalized to
 * lowercase. Returns `null` when the device is missing.
 */
export function bundleDeviceClass(
  bundle: BackupBundlePayload | null,
  deviceId: number,
): string | null {
  if (!bundle) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId,
  );
  if (!device) return null;
  return String(device.device?.device_class ?? "").trim().toLowerCase() || null;
}

/**
 * Read a device's `ip_address` from the bundle's device head. Returns
 * `null` for missing devices and empty / unset values (so the UI can
 * treat "no IP" uniformly regardless of whether the field was absent
 * or empty-string).
 */
export function deviceIpAddress(
  bundle: BackupBundlePayload | null,
  deviceId: number,
): string | null {
  if (!bundle) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId,
  );
  if (!device?.device) return null;
  const raw = String(device.device.ip_address ?? "").trim();
  return raw || null;
}

/**
 * Write a new `ip_address` value into the bundle's device head. Empty
 * string clears it (mapped to `null` on the way out so the restore-side
 * `_encode_ip` helper bails the IP marker cleanly). No-op when the
 * targeted device is absent.
 */
export function updateBundleDeviceIp(
  bundle: BackupBundlePayload,
  deviceId: number,
  ip: string,
): BackupBundlePayload {
  const normalizedId = Number(deviceId);
  const trimmed = String(ip ?? "").trim();
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedId) return device;
      if (!device.device) return device;
      return {
        ...device,
        device: { ...device.device, ip_address: trimmed || null },
      };
    }),
  };
}

/**
 * Rename a single command on a Device. Mirrors `renameBundleActivityFavorite`
 * but without the activity-side mirroring, since a Device command lives in
 * exactly one place.
 */
export function renameBundleDeviceCommand(
  bundle: BackupBundlePayload,
  deviceId: number,
  commandId: number,
  name: string,
): BackupBundlePayload {
  return updateDeviceCommandLabel(bundle, Number(deviceId), Number(commandId), String(name ?? "").trim());
}

/**
 * Rewrite the per-record `sort` byte on every Activity in `orderedActivityIds`
 * to match the new ordering (1-based, ascending). Activities not in the list
 * keep their existing sort value, so we never silently renumber records the
 * user didn't move. The frontend reads byte 6 via the `sort` field; the
 * restore flow writes byte 6 back to the wire, so this is end-to-end.
 */
export function reorderBundleActivities(
  bundle: BackupBundlePayload,
  orderedActivityIds: number[],
): BackupBundlePayload {
  return reorderBundleTopLevelEntries(bundle, "activities", orderedActivityIds);
}

/** Same as `reorderBundleActivities`, but for the top-level Devices list. */
export function reorderBundleDevices(
  bundle: BackupBundlePayload,
  orderedDeviceIds: number[],
): BackupBundlePayload {
  return reorderBundleTopLevelEntries(bundle, "devices", orderedDeviceIds);
}

function reorderBundleTopLevelEntries(
  bundle: BackupBundlePayload,
  key: "activities" | "devices",
  orderedIds: number[],
): BackupBundlePayload {
  const entries = (bundle[key] ?? []) as Array<{ device?: { device_id?: number | null; sort?: number | null } | null }>;
  const newSortById = new Map<number, number>();
  orderedIds.forEach((id, index) => {
    const normalized = Number(id);
    if (normalized > 0) newSortById.set(normalized, index + 1);
  });
  const nextEntries = entries.map((entry) => {
    const block = entry?.device;
    if (!block) return entry;
    const entryId = Number(block.device_id || 0);
    const nextSort = newSortById.get(entryId);
    if (nextSort === undefined) return entry;
    return { ...entry, device: { ...block, sort: nextSort } };
  });
  return { ...bundle, [key]: nextEntries } as BackupBundlePayload;
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
