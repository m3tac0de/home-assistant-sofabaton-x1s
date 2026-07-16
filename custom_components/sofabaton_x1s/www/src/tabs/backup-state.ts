import type {
  BackupBundleActivityPayload,
  BackupBundleButtonBinding,
  BackupBundleCommandRow,
  BackupBundleDeviceBlock,
  BackupBundleDevicePayload,
  BackupBundleFavoriteSlot,
  BackupBundleInputEntry,
  BackupBundleInputRecord,
  BackupBundleMacroRow,
  BackupBundleMacroStep,
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
  /** User picks plus activities forced in by cross-activity chains. */
  selectedActivityIds: number[];
  /** Activities pulled in only because a selected one references them. */
  forcedActivityIds: number[];
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
    subtitle: "Edits replay through the hub's descriptive-IR writer. Only descriptive-protocol payloads (P:… D:… F:…) are decodable; raw learned-IR payloads are not editable here.",
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

/**
 * Read a command's raw wire payload (`restore_data.data_hex`) for the
 * payload editor. Returns `null` when the command carries no captured
 * payload — structural bundles, or classes whose export produces neither
 * restore shape. The string keeps the bundle's own formatting
 * (space-separated lowercase byte pairs).
 */
export function commandRawPayloadHex(
  bundle: BackupBundlePayload | null,
  deviceId: number,
  commandId: number,
): string | null {
  if (!bundle) return null;
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === Number(deviceId),
  );
  if (!device) return null;
  const command = (device.commands ?? []).find(
    (entry) => Number(entry?.command_id || 0) === Number(commandId),
  );
  if (!command) return null;
  const restoreData = (command as { restore_data?: unknown }).restore_data;
  if (!restoreData || typeof restoreData !== "object") return null;
  const dataHex = String((restoreData as Record<string, unknown>).data_hex ?? "").trim();
  return dataHex || null;
}

/**
 * Normalize user-entered payload hex to the bundle's canonical form
 * (space-separated lowercase byte pairs, the shape `bytes.hex(" ")`
 * produced on capture). Tolerates `0x` prefixes, commas, and arbitrary
 * whitespace. Returns `null` when the input is not plausible hex
 * (empty, odd digit count, or non-hex characters).
 */
export function normalizeCommandPayloadHex(raw: string): string | null {
  const cleaned = String(raw ?? "").replace(/0x/gi, "").replace(/[\s,]+/g, "");
  if (!cleaned || cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    return null;
  }
  return (cleaned.toLowerCase().match(/.{2}/g) ?? []).join(" ");
}

/**
 * Replace a command's raw payload (`restore_data.data_hex`) verbatim.
 * Any `decoded` block is dropped in the same write: its structured
 * fields no longer describe the new bytes, and leaving it (or its
 * `edited` flag) in place would make the restore path re-encode stale
 * fields instead of replaying the user's hex.
 *
 * No-op when the command has no `restore_data` to edit.
 */
export function updateCommandRawPayload(
  bundle: BackupBundlePayload,
  deviceId: number,
  commandId: number,
  dataHex: string,
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
          const { decoded: _stale, ...rest } = restoreData as Record<string, unknown>;
          return {
            ...command,
            restore_data: { ...rest, data_hex: dataHex },
          };
        }),
      };
    }),
  };
}

/**
 * Set (replace) a command's entire `restore_data` block.
 *
 * Used by the *live* device editor: the structural cache bundle carries no
 * command payloads, so editing one fetches the blob on demand and writes a
 * fully-built `restore_data` here in one shot — including the `edited`
 * marker the device-sync planner keys on. (Backup mode instead mutates an
 * already-present block via `updateCommandRawPayload` /
 * `updateCommandDecodedFields`.) No-op when the device or command is absent.
 */
export function setCommandRestoreData(
  bundle: BackupBundlePayload,
  deviceId: number,
  commandId: number,
  restoreData: Record<string, unknown>,
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
          return { ...command, restore_data: restoreData };
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
      const block = activity?.device;
      const id = Number(block?.device_id || 0);
      return {
        id,
        sortKey: readSortKey(block),
        label: String(block?.name || `Activity ${id}`),
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
      const block = device?.device;
      const id = Number(block?.device_id || 0);
      return {
        id,
        sortKey: readSortKey(block),
        label: String(block?.name || `Device ${id}`),
        meta: String(block?.device_class || "").trim() || undefined,
      };
    })
    .filter((option) => option.id > 0)
    .sort(compareByHubOrder)
    .map(({ id, label, meta }) => ({ id, label, meta }));
}

// The hub's shared 8-bit entity-id space: devices 0x01-0x63, activities
// 0x65-0xFF. An id at or above this threshold inside a binding / macro
// step / favorite is a cross-activity reference, not a source device.
const ACTIVITY_ENTITY_ID_MIN = 0x65;

/**
 * Foreign activities this activity chains to — ids in the activity
 * range referenced by its bindings, macro steps, or favorites that
 * exist as activities in the bundle (self excluded). Restore needs
 * these present and restored first.
 */
export function activityChainDependencyIds(
  bundle: BackupBundlePayload | null,
  activityId: number,
): number[] {
  const activity = (bundle?.activities ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === Number(activityId),
  );
  if (!bundle || !activity) return [];
  const selfId = Number(activity?.device?.device_id || 0);
  const bundleActivityIds = new Set(
    (bundle.activities ?? []).map((entry) => Number(entry?.device?.device_id || 0)),
  );
  const refs = new Set<number>();
  const add = (value: unknown) => {
    const id = Number(value || 0);
    if (
      id >= ACTIVITY_ENTITY_ID_MIN
      && id !== 0xFF
      && id !== selfId
      && bundleActivityIds.has(id)
    ) refs.add(id);
  };
  for (const binding of activity.button_bindings ?? []) {
    add(binding?.device_id);
    add(binding?.long_press_device_id);
  }
  for (const macro of activity.macros ?? []) {
    for (const step of macro?.steps ?? []) {
      if (Number(step?.device_id || 0) === 0xFF) continue;
      add(step?.device_id);
    }
  }
  for (const slot of activity.favorite_slots ?? []) add(slot?.device_id);
  return [...refs].sort((left, right) => left - right);
}

/** Transitive closure of chain dependencies, minus the original picks. */
export function forcedRestoreActivityIds(
  bundle: BackupBundlePayload | null,
  selectedActivityIds: number[],
): number[] {
  const selected = new Set(selectedActivityIds.map((value) => Number(value)));
  const reached = new Set(selected);
  const queue = [...reached];
  while (queue.length) {
    const current = queue.pop()!;
    for (const dep of activityChainDependencyIds(bundle, current)) {
      if (!reached.has(dep)) {
        reached.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...reached].filter((id) => !selected.has(id)).sort((left, right) => left - right);
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
  // Cross-activity chains first: a selected activity pulls in the
  // activities it references (transitively), which in turn pull in
  // their linked devices below.
  const forcedActivityIds = forcedRestoreActivityIds(params.bundle, params.selectedActivityIds);
  const selectedActivityIds = [
    ...new Set([
      ...(params.selectedActivityIds ?? []).map((value) => Number(value)),
      ...forcedActivityIds,
    ]),
  ].sort((left, right) => left - right);
  const forcedDeviceIds = forcedRestoreDeviceIds(params.bundle, selectedActivityIds);
  const selected = new Set<number>(forcedDeviceIds);
  for (const deviceId of params.manualSelectedDeviceIds ?? []) {
    const normalized = Number(deviceId);
    if (normalized > 0) selected.add(normalized);
  }
  return {
    forcedDeviceIds,
    selectedDeviceIds: [...selected].sort((left, right) => left - right),
    selectedActivityIds,
    forcedActivityIds,
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
  // A missing payload_profile means a legacy full backup; an explicitly
  // structural bundle is the blob-free cache shape and can't be restored.
  const profile = String(bundle.payload_profile || "full_backup");
  if (profile !== "full_backup") {
    throw new Error(
      "This file is a structural cache bundle (no command payloads); it cannot be edited or restored. Export a full backup instead.",
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
  const next: BackupBundlePayload = {
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
  return next;
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
  // Order by the hub's family-0x61 slot table (favorites_order) when present:
  // favorites and macro shortcuts share one fav-id namespace and are shown in
  // slot order, which a reorder rewrites WITHOUT renumbering button_ids — so
  // button_id order alone can't reflect a reorder. An entry whose button_id is
  // absent from favorites_order ranks after every listed one (a freshly-added
  // shortcut appends at the tail). Absent/empty → pure button_id order, the
  // legacy behaviour for older bundles and the device path.
  const order = activity.favorites_order ?? [];
  const rankById = new Map<number, number>();
  order.forEach((favId, index) => {
    const bid = Number(favId) & 0xFF;
    if (!rankById.has(bid)) rankById.set(bid, index);
  });
  const rankOf = (buttonId: number): number => {
    const bid = Number(buttonId) & 0xFF;
    return rankById.has(bid) ? (rankById.get(bid) as number) : rankById.size + bid;
  };
  return items.sort((left, right) => {
    const delta = rankOf(left.buttonId) - rankOf(right.buttonId);
    return delta !== 0 ? delta : left.buttonId - right.buttonId;
  });
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
 * Idle / automatic-power behavior mode bytes (the hub's 0x0242 value).
 * One byte encodes the whole "Power On/Off Setup" + "Idle Behavior" story:
 * when automatic power control is disabled the app skips the idle screen
 * and the hub reports DISABLED.
 */
export const IDLE_BEHAVIOR_AUTO_OFF = 1;
export const IDLE_BEHAVIOR_ALWAYS_ON = 2;
export const IDLE_BEHAVIOR_STAY_ON = 3;
export const IDLE_BEHAVIOR_DISABLED = 4;

/**
 * Read a device's idle/automatic-power mode from the bundle. Prefers the
 * dedicated `idle_behavior` field; falls back to `power_mode` for older
 * backups that predate it (mirroring the restore-side resolution). Returns
 * `null` when the device is absent or carries no usable value.
 */
export function deviceIdleBehavior(
  bundle: BackupBundlePayload | null,
  deviceId: number,
): number | null {
  if (!bundle) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId,
  );
  if (!device?.device) return null;
  const raw = device.device.idle_behavior ?? device.device.power_mode;
  if (raw == null) return null;
  const mode = Number(raw);
  return Number.isFinite(mode) ? mode & 0xff : null;
}

/**
 * Write a new idle/automatic-power `mode` byte into the device head. Sets
 * the dedicated `idle_behavior` field so capture, restore, and the editor
 * all agree on one source of truth. No-op when the device is absent.
 */
export function updateBundleDeviceIdleBehavior(
  bundle: BackupBundlePayload,
  deviceId: number,
  mode: number,
): BackupBundlePayload {
  const normalizedId = Number(deviceId);
  const normalizedMode = Number(mode) & 0xff;
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedId) return device;
      if (!device.device) return device;
      return {
        ...device,
        device: { ...device.device, idle_behavior: normalizedMode },
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
 * The next free command id on a Device (lowest unused id >= 1, capped at
 * 0xFF like the hub's one-byte command-id space). Returns `null` when the
 * device is absent or its id space is exhausted.
 */
export function nextFreeDeviceCommandId(
  bundle: BackupBundlePayload | null,
  deviceId: number,
): number | null {
  if (!bundle) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId,
  );
  if (!device) return null;
  const used = new Set(
    (device.commands ?? []).map((command) => Number(command?.command_id || 0)),
  );
  for (let candidate = 1; candidate <= 0xff; candidate += 1) {
    if (!used.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Append a brand-new command row to a Device.
 *
 * Live-editor path: the row carries a provisional `command_id` (allocated
 * against the bundle via `nextFreeDeviceCommandId`) and a fully-built
 * `restore_data` block whose `new: true` marker tells the device-sync
 * planner to emit a `command_add` step (a fresh family-0x0E record write)
 * instead of an in-place overwrite. No-op when the device is absent or the
 * id is already taken (the caller allocated stale).
 */
export function addBundleDeviceCommand(
  bundle: BackupBundlePayload,
  deviceId: number,
  commandId: number,
  name: string,
  restoreData: Record<string, unknown>,
): BackupBundlePayload {
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  const trimmed = String(name ?? "").trim();
  if (normalizedCommandId < 1 || normalizedCommandId > 0xff) return bundle;
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      const commands = device.commands ?? [];
      const taken = commands.some(
        (command) => Number(command?.command_id || 0) === normalizedCommandId,
      );
      if (taken) return device;
      return {
        ...device,
        commands: [
          ...commands,
          {
            command_id: normalizedCommandId,
            name: trimmed || `Command ${normalizedCommandId}`,
            restore_data: { ...restoreData, new: true },
          },
        ],
      };
    }),
  };
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
  const orderedMacroButtonIds = new Set(
    orderedItems.filter((item) => item.kind === "macro").map((item) => Number(item.buttonId)),
  );
  const macroRows: BackupBundleMacroRow[] = [];
  const favoriteRows: BackupBundleFavoriteSlot[] = [];
  const macroIdRemap = new Map<number, number>();
  orderedItems.forEach((item, index) => {
    const nextButtonId = index + 1;
    if (item.kind === "macro") {
      const row = macrosByButtonId.get(Number(item.buttonId));
      if (row) {
        macroRows.push({ ...row, button_id: nextButtonId });
        if (Number(item.buttonId) !== nextButtonId) {
          macroIdRemap.set(Number(item.buttonId), nextButtonId);
        }
      }
      return;
    }
    const row = favoritesByButtonId.get(Number(item.buttonId));
    if (row) favoriteRows.push({ ...row, button_id: nextButtonId });
  });
  // Re-append macros the caller did not reorder. Internal power macros
  // (button 198 / 199) are filtered out of the editable quick-access list
  // and so never appear in `orderedItems`; rebuilding `macros` from the
  // ordered editable rows alone would silently drop them and lose them on
  // a Replace restore. Their reserved button_ids don't collide with the
  // 1..N editable range, so they pass through untouched, in original order.
  for (const row of activity.macros ?? []) {
    if (!orderedMacroButtonIds.has(Number(row?.button_id || 0))) {
      macroRows.push(row);
    }
  }
  return updateActivity(bundle, normalizedActivityId, (current) => ({
    ...current,
    macros: macroRows,
    favorite_slots: favoriteRows,
    // Keep favorites_order in step with the new positional button_ids. The
    // reordered items are renumbered 1..N in display order, so the slot table
    // is exactly [1..N]; leaving the stale baseline order here would make
    // activityQuickAccessItems (and the sync planner) re-derive the OLD order.
    favorites_order: orderedItems.map((_item, index) => index + 1),
    // Macro-target bindings reference a macro by its button_id (with
    // device_id = the activity's own id). Renumbering the macros without
    // following those references would leave the bundle internally
    // inconsistent — a later reorder, or the sync planner, would resolve
    // them against the wrong macro.
    button_bindings: remapMacroTargetBindings(
      current.button_bindings,
      normalizedActivityId,
      macroIdRemap,
    ),
  }));
}

/** Rewrite macro-target binding references through `macroIdRemap`
 * (old macro button_id → new). Rows that don't reference a renumbered
 * macro pass through unchanged (same array if nothing changed). */
function remapMacroTargetBindings(
  bindings: BackupBundleButtonBinding[] | null | undefined,
  activityId: number,
  macroIdRemap: Map<number, number>,
): BackupBundleButtonBinding[] | null | undefined {
  if (!bindings || macroIdRemap.size === 0) return bindings;
  let changed = false;
  const next = bindings.map((row) => {
    let updated = row;
    if (Number(row?.device_id || 0) === activityId && macroIdRemap.has(Number(row?.command_id || 0))) {
      updated = { ...updated, command_id: macroIdRemap.get(Number(row?.command_id || 0)) };
      changed = true;
    }
    if (
      Number(updated?.long_press_device_id || 0) === activityId
      && macroIdRemap.has(Number(updated?.long_press_command_id || 0))
    ) {
      updated = {
        ...(updated === row ? { ...row } : updated),
        long_press_command_id: macroIdRemap.get(Number(updated?.long_press_command_id || 0)),
      };
      changed = true;
    }
    return updated;
  });
  return changed ? next : bindings;
}

/**
 * Identifies a single entity the Edit view can delete from a loaded
 * bundle. Mirrors the shapes already used by the rename dialog so the
 * view can pass a target straight through to {@link applyBundleDelete}
 * and {@link bundleDeleteImpact}.
 */
export type BackupDeleteTarget =
  | { kind: "activity"; activityId: number }
  | { kind: "device"; deviceId: number }
  | { kind: "command"; deviceId: number; commandId: number }
  | { kind: "favorite"; activityId: number; buttonId: number }
  | { kind: "macro"; activityId: number; buttonId: number }
  | { kind: "activity_binding"; activityId: number; buttonId: number }
  | { kind: "device_binding"; deviceId: number; buttonId: number }
  // Remove a device FROM one activity (the device stays in the bundle).
  | { kind: "activity_member"; activityId: number; deviceId: number };

/**
 * Cascade impact of a delete, surfaced in the confirm dialog so the
 * user is never surprised by references that disappear elsewhere in the
 * bundle. All counts are zero for targets that have no downward
 * references (activities, and individual favorites / macros).
 */
export interface BackupDeleteImpact {
  /** favorite_slots that will be removed as a side effect. */
  favorites: number;
  /** macro steps that will be removed as a side effect. */
  macroSteps: number;
  /** steps removed from the owning device's power on/off sequences. */
  powerSteps: number;
  /** activities whose referenced_source_device_ids point at the device. */
  activities: number;
  /** button bindings removed, or whose long-press is cleared, as a side effect. */
  bindings: number;
}

function stepMatchesDevice(step: BackupBundleMacroStep, deviceId: number): boolean {
  return Number(step?.device_id || 0) === deviceId;
}

function stepMatchesCommand(step: BackupBundleMacroStep, deviceId: number, commandId: number): boolean {
  return Number(step?.device_id || 0) === deviceId && Number(step?.command_id || 0) === commandId;
}

// A DEVICE macro step carries no device_id (the owning device is implicit),
// so command-delete matching goes by command_id alone — guarded against the
// 0xFF delay sentinel, which shares that slot.
function deviceMacroStepMatchesCommand(step: BackupBundleMacroStep, commandId: number): boolean {
  return !isMacroDelayStep(step) && Number(step?.command_id || 0) === commandId;
}

// A pure wait/delay macro step uses 0xFF (255) as a sentinel in its
// device_id / command_id slots (mirrors `is_delay_step` in
// backup_export.py). A delay row trails the command step it belongs to.
const MACRO_DELAY_SENTINEL = 255;

function isMacroDelayStep(step: BackupBundleMacroStep): boolean {
  return Number(step?.device_id || 0) === MACRO_DELAY_SENTINEL
    || Number(step?.command_id || 0) === MACRO_DELAY_SENTINEL;
}

/**
 * Filter macro steps, dropping every step the predicate matches AND any
 * delay/wait row(s) immediately following it. A trailing delay belongs
 * to the command it sits behind, so removing that command must take its
 * wait along rather than leaving an orphaned pause at the front of the
 * next action. Delays that follow a surviving step are left untouched.
 */
function filterMacroSteps(
  steps: BackupBundleMacroStep[] | null | undefined,
  shouldRemove: (step: BackupBundleMacroStep) => boolean,
): BackupBundleMacroStep[] {
  const list = steps ?? [];
  const result: BackupBundleMacroStep[] = [];
  for (let index = 0; index < list.length; index += 1) {
    if (shouldRemove(list[index])) {
      while (index + 1 < list.length && isMacroDelayStep(list[index + 1])) {
        index += 1;
      }
      continue;
    }
    result.push(list[index]);
  }
  return result;
}

/** Count of steps a `shouldRemove` predicate strips, including consumed delays. */
function countRemovedMacroSteps(
  steps: BackupBundleMacroStep[] | null | undefined,
  shouldRemove: (step: BackupBundleMacroStep) => boolean,
): number {
  const original = (steps ?? []).length;
  return original - filterMacroSteps(steps, shouldRemove).length;
}

function clearBindingLongPress(binding: BackupBundleButtonBinding): BackupBundleButtonBinding {
  const { long_press_device_id, long_press_command_id, ...rest } = binding;
  return rest;
}

/**
 * Resolve how an activity button binding reacts to a target device being
 * deleted: drop it entirely when its short press targets that device, or
 * just clear the long press when only that references the device. Returns
 * the same reference when untouched (so callers can cheaply detect change).
 */
function cascadeBindingForDeletedDevice(
  binding: BackupBundleButtonBinding,
  deviceId: number,
): BackupBundleButtonBinding | null {
  if (Number(binding?.device_id || 0) === deviceId) return null;
  if (Number(binding?.long_press_device_id || 0) === deviceId) return clearBindingLongPress(binding);
  return binding;
}

/**
 * How a button binding reacts to a command being deleted. `deviceScoped`
 * is true for device-level bindings (command refers to the owning device,
 * so the `deviceId` match is implicit); false for activity-level bindings
 * (which must match both the target device and the command).
 */
function cascadeBindingForDeletedCommand(
  binding: BackupBundleButtonBinding,
  deviceId: number,
  commandId: number,
  deviceScoped: boolean,
): BackupBundleButtonBinding | null {
  const shortMatches = deviceScoped
    ? Number(binding?.command_id || 0) === commandId
    : Number(binding?.device_id || 0) === deviceId && Number(binding?.command_id || 0) === commandId;
  if (shortMatches) return null;
  const longMatches = deviceScoped
    ? Number(binding?.long_press_command_id || 0) === commandId
    : Number(binding?.long_press_device_id || 0) === deviceId
      && Number(binding?.long_press_command_id || 0) === commandId;
  if (longMatches) return clearBindingLongPress(binding);
  return binding;
}

/**
 * How an activity button binding reacts to one of the activity's own MACROS
 * being deleted. A macro binding stores `device_id` = the activity's own id
 * and `command_id` = the macro's `button_id`. Drop the binding when its short
 * press targets the deleted macro; clear only the long press when that alone
 * references it.
 */
function cascadeBindingForDeletedMacro(
  binding: BackupBundleButtonBinding,
  activityId: number,
  macroButtonId: number,
): BackupBundleButtonBinding | null {
  const shortMatches = Number(binding?.device_id || 0) === activityId
    && Number(binding?.command_id || 0) === macroButtonId;
  if (shortMatches) return null;
  const longMatches = Number(binding?.long_press_device_id || 0) === activityId
    && Number(binding?.long_press_command_id || 0) === macroButtonId;
  if (longMatches) return clearBindingLongPress(binding);
  return binding;
}

/** Apply a binding-cascade transform to a list, dropping the nulls. */
function applyBindingCascade(
  bindings: BackupBundleButtonBinding[] | null | undefined,
  transform: (binding: BackupBundleButtonBinding) => BackupBundleButtonBinding | null,
): BackupBundleButtonBinding[] {
  const result: BackupBundleButtonBinding[] = [];
  for (const binding of bindings ?? []) {
    const next = transform(binding);
    if (next !== null) result.push(next);
  }
  return result;
}

/** Count bindings a cascade transform drops (→ null) or modifies (→ new ref). */
function countAffectedBindings(
  bindings: BackupBundleButtonBinding[] | null | undefined,
  transform: (binding: BackupBundleButtonBinding) => BackupBundleButtonBinding | null,
): number {
  let count = 0;
  for (const binding of bindings ?? []) {
    const next = transform(binding);
    if (next === null || next !== binding) count += 1;
  }
  return count;
}

/**
 * Count the references a delete will clear elsewhere in the bundle.
 * Pure read — does not mutate. Drives the confirm dialog's impact list.
 */
export function bundleDeleteImpact(
  bundle: BackupBundlePayload | null,
  target: BackupDeleteTarget,
): BackupDeleteImpact {
  const empty: BackupDeleteImpact = { favorites: 0, macroSteps: 0, powerSteps: 0, activities: 0, bindings: 0 };
  if (!bundle) return empty;
  if (target.kind === "device") {
    const deviceId = Number(target.deviceId);
    let favorites = 0;
    let macroSteps = 0;
    let activities = 0;
    let bindings = 0;
    for (const activity of bundle.activities ?? []) {
      if ((activity?.referenced_source_device_ids ?? []).some((id) => Number(id) === deviceId)) {
        activities += 1;
      }
      for (const slot of activity?.favorite_slots ?? []) {
        if (Number(slot?.device_id || 0) === deviceId) favorites += 1;
      }
      for (const macro of activity?.macros ?? []) {
        macroSteps += countRemovedMacroSteps(macro?.steps, (step) => stepMatchesDevice(step, deviceId));
      }
      bindings += countAffectedBindings(
        activity?.button_bindings,
        (binding) => cascadeBindingForDeletedDevice(binding, deviceId),
      );
    }
    return { favorites, macroSteps, powerSteps: 0, activities, bindings };
  }
  if (target.kind === "command") {
    const deviceId = Number(target.deviceId);
    const commandId = Number(target.commandId);
    let favorites = 0;
    let macroSteps = 0;
    let bindings = 0;
    for (const activity of bundle.activities ?? []) {
      for (const slot of activity?.favorite_slots ?? []) {
        if (Number(slot?.device_id || 0) === deviceId && Number(slot?.command_id || 0) === commandId) {
          favorites += 1;
        }
      }
      for (const macro of activity?.macros ?? []) {
        macroSteps += countRemovedMacroSteps(macro?.steps, (step) => stepMatchesCommand(step, deviceId, commandId));
      }
      bindings += countAffectedBindings(
        activity?.button_bindings,
        (binding) => cascadeBindingForDeletedCommand(binding, deviceId, commandId, false),
      );
    }
    // Device-level bindings on the owning device that play this command.
    const device = (bundle.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === deviceId);
    bindings += countAffectedBindings(
      device?.button_bindings,
      (binding) => cascadeBindingForDeletedCommand(binding, deviceId, commandId, true),
    );
    // Steps in the owning device's own macros that play this command. The
    // power on/off sequences (198/199) get their own count so the dialog
    // can name them; device user macros fold into the generic step count.
    let powerSteps = 0;
    for (const macro of device?.macros ?? []) {
      const removed = countRemovedMacroSteps(macro?.steps, (step) => deviceMacroStepMatchesCommand(step, commandId));
      if (INTERNAL_POWER_MACRO_BUTTON_IDS.has(Number(macro?.button_id || 0))) powerSteps += removed;
      else macroSteps += removed;
    }
    return { favorites, macroSteps, powerSteps, activities: 0, bindings };
  }
  if (target.kind === "activity_member") {
    return activityMemberRemovalImpact(bundle, target.activityId, target.deviceId);
  }
  return empty;
}

/** True when at least one reference will be cleared as a side effect. */
export function backupDeleteHasCascade(impact: BackupDeleteImpact): boolean {
  return impact.favorites > 0 || impact.macroSteps > 0 || impact.powerSteps > 0
    || impact.activities > 0 || impact.bindings > 0;
}

/** Remove a top-level Activity. Activities are referenced by nothing else. */
export function deleteBundleActivity(bundle: BackupBundlePayload, activityId: number): BackupBundlePayload {
  const id = Number(activityId);
  return {
    ...bundle,
    activities: (bundle.activities ?? []).filter((activity) => Number(activity?.device?.device_id || 0) !== id),
  };
}

function stripDeviceFromActivity(
  activity: BackupBundleActivityPayload,
  deviceId: number,
): BackupBundleActivityPayload {
  return {
    ...activity,
    referenced_source_device_ids: (activity.referenced_source_device_ids ?? []).filter(
      (id) => Number(id) !== deviceId,
    ),
    favorite_slots: (activity.favorite_slots ?? []).filter((slot) => Number(slot?.device_id || 0) !== deviceId),
    macros: (activity.macros ?? []).map((macro) => ({
      ...macro,
      steps: filterMacroSteps(macro?.steps, (step) => stepMatchesDevice(step, deviceId)),
    })),
    button_bindings: applyBindingCascade(
      activity.button_bindings,
      (binding) => cascadeBindingForDeletedDevice(binding, deviceId),
    ),
  };
}

/**
 * Remove a top-level Device and clear every reference to it: the
 * `referenced_source_device_ids` entry on each Activity, any favorite
 * slots that target it, and any macro steps that play one of its
 * commands. Removed rows leave their `button_id`s as-is — gaps are
 * harmless and self-heal the next time the user reorders.
 */
export function deleteBundleDevice(bundle: BackupBundlePayload, deviceId: number): BackupBundlePayload {
  const id = Number(deviceId);
  const next: BackupBundlePayload = {
    ...bundle,
    devices: (bundle.devices ?? []).filter((device) => Number(device?.device?.device_id || 0) !== id),
    activities: (bundle.activities ?? []).map((activity) => stripDeviceFromActivity(activity, id)),
  };
  return reconcileBundlePowerMacros(next);
}

/**
 * Remove a single command from a Device and clear the favorites / macro
 * steps that referenced exactly that command. Other commands on the
 * device, and references to them, are untouched.
 */
export function deleteBundleDeviceCommand(
  bundle: BackupBundlePayload,
  deviceId: number,
  commandId: number,
): BackupBundlePayload {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  const next: BackupBundlePayload = {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== dId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).filter((command) => Number(command?.command_id || 0) !== cId),
        button_bindings: applyBindingCascade(
          device.button_bindings,
          (binding) => cascadeBindingForDeletedCommand(binding, dId, cId, true),
        ),
        // The device's own macros (power on/off sequences and user macros)
        // reference commands by id — prune those steps too, or the bundle
        // keeps dangling references sync validation rejects.
        macros: (device.macros ?? []).map((macro) => ({
          ...macro,
          steps: filterMacroSteps(macro?.steps, (step) => deviceMacroStepMatchesCommand(step, cId)),
        })),
      };
    }),
    activities: (bundle.activities ?? []).map((activity) => ({
      ...activity,
      favorite_slots: (activity.favorite_slots ?? []).filter(
        (slot) => !(Number(slot?.device_id || 0) === dId && Number(slot?.command_id || 0) === cId),
      ),
      macros: (activity.macros ?? []).map((macro) => ({
        ...macro,
        steps: filterMacroSteps(macro?.steps, (step) => stepMatchesCommand(step, dId, cId)),
      })),
      button_bindings: applyBindingCascade(
        activity.button_bindings,
        (binding) => cascadeBindingForDeletedCommand(binding, dId, cId, false),
      ),
    })),
  };
  return reconcileBundleMembershipChange(bundle, next);
}

/**
 * Remove a single quick-access entry (a favorite slot or a whole macro)
 * from an Activity by its `button_id`. Surgical by design: it touches
 * only the targeted row, so internal power macros (button 198 / 199,
 * filtered out of the editable list) are preserved. We deliberately do
 * NOT renumber the survivors — the resulting gap is harmless and the
 * existing reorder path renumbers contiguously on the next drag.
 */
export function deleteBundleActivityQuickAccess(
  bundle: BackupBundlePayload,
  activityId: number,
  kind: "favorite" | "macro",
  buttonId: number,
): BackupBundlePayload {
  const bId = Number(buttonId);
  const next = updateActivity(bundle, activityId, (activity) => {
    if (kind === "favorite") {
      return {
        ...activity,
        favorite_slots: (activity.favorite_slots ?? []).filter((slot) => Number(slot?.button_id || 0) !== bId),
      };
    }
    return {
      ...activity,
      macros: (activity.macros ?? []).filter((macro) => Number(macro?.button_id || 0) !== bId),
      // A button bound to this macro now dangles — drop it (or clear the
      // long press if only that referenced the macro).
      button_bindings: applyBindingCascade(
        activity.button_bindings,
        (binding) => cascadeBindingForDeletedMacro(binding, Number(activityId), bId),
      ),
    };
  });
  return reconcileActivityMembershipChange(bundle, next, Number(activityId));
}

/**
 * Next free quick-access `button_id` for an Activity: one past the
 * highest editable slot in use. Internal power macros (198 / 199) live
 * in their own reserved range and never count toward the editable max.
 */
function nextQuickAccessButtonId(activity: BackupBundleActivityPayload): number {
  let max = 0;
  const consider = (value: number) => {
    if (value > 0 && !INTERNAL_POWER_MACRO_BUTTON_IDS.has(value) && value > max) max = value;
  };
  for (const slot of activity.favorite_slots ?? []) consider(Number(slot?.button_id || 0));
  for (const macro of activity.macros ?? []) consider(Number(macro?.button_id || 0));
  return max + 1;
}

/**
 * Append a favorite that plays `commandId` on `deviceId` to an
 * Activity, at the next free quick-access slot. No-op when the device
 * or command id is missing. `name` is the favorite's display label;
 * blank falls back to the command name at render time.
 */
export function addBundleActivityFavorite(
  bundle: BackupBundlePayload,
  activityId: number,
  deviceId: number,
  commandId: number,
  name: string,
): BackupBundlePayload {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  if (dId <= 0 || cId <= 0) return bundle;
  const trimmed = String(name ?? "").trim();
  const next = updateActivity(bundle, activityId, (activity) => {
    const slot: BackupBundleFavoriteSlot = {
      button_id: nextQuickAccessButtonId(activity),
      device_id: dId,
      command_id: cId,
      name: trimmed,
    };
    return { ...activity, favorite_slots: [...(activity.favorite_slots ?? []), slot] };
  });
  return reconcileActivityPowerMacros(next, Number(activityId));
}

/** Dispatch a {@link BackupDeleteTarget} to the matching delete helper. */
export function applyBundleDelete(
  bundle: BackupBundlePayload,
  target: BackupDeleteTarget,
): BackupBundlePayload {
  switch (target.kind) {
    case "activity":
      return deleteBundleActivity(bundle, target.activityId);
    case "device":
      return deleteBundleDevice(bundle, target.deviceId);
    case "command":
      return deleteBundleDeviceCommand(bundle, target.deviceId, target.commandId);
    case "favorite":
      return deleteBundleActivityQuickAccess(bundle, target.activityId, "favorite", target.buttonId);
    case "macro":
      return deleteBundleActivityQuickAccess(bundle, target.activityId, "macro", target.buttonId);
    case "activity_binding":
      return deleteActivityButtonBinding(bundle, target.activityId, target.buttonId);
    case "device_binding":
      return deleteDeviceButtonBinding(bundle, target.deviceId, target.buttonId);
    case "activity_member":
      return removeActivityMemberDevice(bundle, target.activityId, target.deviceId);
  }
}

// ── Activity power-macro invariant ──────────────────────────────────
//
// The hub requires every device an Activity uses to be represented in
// that Activity's POWER_ON (button 198 / 0xC6) and POWER_OFF (199 / 0xC7)
// macros. Each step references the device's OWN power macros / inputs by
// ordinal — it does not store the device's power command directly:
//
//   POWER_ON, per device D:
//     {D, command_id 0xC6}  → play D's power-on        (button_code 0)
//     delay row             → 1s pause                 (byte 100)
//     {D, command_id 0xC5}  → select D's input N       (duration = 1-based
//                              ordinal into D's input_record; 0 = unset)
//     delay row             → 0
//   POWER_OFF, per device D:
//     {D, command_id 0xC7}  → play D's power-off        (button_code 0)
//     delay row             → 0
//
// Membership = devices already represented in either Activity power macro,
// plus devices referenced by favorites, button bindings (incl. long-press),
// and user-macro steps. Devices stay members until explicitly removed.
// button_code is forced to 0 for 0xC5/0xC6/0xC7 (mirrors macros.py:471);
// delay/wait rows use device_id/command_id 0xFF with the pause in `delay`.
const POWER_ON_MACRO_BUTTON_ID = 198;
const POWER_OFF_MACRO_BUTTON_ID = 199;
const DEVICE_POWER_ON_REF_COMMAND = 0xC6;
const DEVICE_POWER_OFF_REF_COMMAND = 0xC7;
const DEVICE_INPUT_REF_COMMAND = 0xC5;
const POWER_MACRO_DELAY_BUTTON_CODE = 0xFFFFFFFFFFFF;
// Default `delay` byte for a freshly-added power step. Real exports carry
// 0xFF here (firmware "use default timing"); user-visible waits are modeled
// as separate trailing delay rows that stay attached to the row they follow.
// Power steps for one device are a flat, possibly-interleaved list:
//   {device_id D, command_id 0xC6}  → play D's power-on
//   {device_id D, command_id 0xC5, duration=input ordinal}  → set D's input
//   {device_id D, command_id 0xC7}  → play D's power-off (in POWER_OFF)
const POWER_STEP_DEFAULT_DELAY = 0xFF;

// Delay/wait row used inside activity macros (a pure pause between steps).
function powerMacroDelayRow(delay: number): BackupBundleMacroStep {
  return {
    device_id: 0xFF,
    command_id: 0xFF,
    button_code: POWER_MACRO_DELAY_BUTTON_CODE,
    duration: 0xFF,
    delay: delay & 0xFF,
  };
}

function powerStep(deviceId: number, commandId: number, duration = 0): BackupBundleMacroStep {
  return {
    device_id: Number(deviceId),
    command_id: commandId,
    button_code: 0,
    duration: duration & 0xFF,
    delay: POWER_STEP_DEFAULT_DELAY,
  };
}

/**
 * Devices already represented in an Activity's power macros — those with a
 * power-on (0xC6), input (0xC5), or power-off (0xC7) step. Crucially this
 * includes "power-only" devices (e.g. an AVR/display) that carry no
 * favorite / binding / macro reference, so the reconcile never drops them.
 */
function activityPowerDeviceIds(activity: BackupBundleActivityPayload): Set<number> {
  const ids = new Set<number>();
  for (const macro of activity.macros ?? []) {
    const buttonId = Number(macro?.button_id || 0);
    if (buttonId !== POWER_ON_MACRO_BUTTON_ID && buttonId !== POWER_OFF_MACRO_BUTTON_ID) continue;
    for (const step of macro?.steps ?? []) {
      if (isMacroDelayStep(step)) continue;
      const command = Number(step?.command_id || 0);
      if (
        command === DEVICE_POWER_ON_REF_COMMAND
        || command === DEVICE_INPUT_REF_COMMAND
        || command === DEVICE_POWER_OFF_REF_COMMAND
      ) {
        const deviceId = Number(step?.device_id || 0);
        if (deviceId > 0) ids.add(deviceId);
      }
    }
  }
  return ids;
}

/**
 * Devices directly used by editable Activity content. Mandatory power/input
 * reference rows are generated linkage and deliberately do not count here.
 */
function activityUsageDeviceIds(activity: BackupBundleActivityPayload): Set<number> {
  const selfId = Number(activity?.device?.device_id || 0);
  const ids = new Set<number>();
  const add = (value: unknown) => {
    const id = Number(value || 0);
    // The activity's own id appears as a binding target for MACRO bindings;
    // it is not a source device and must not pull power steps for itself.
    if (id > 0 && id !== selfId) ids.add(id);
  };
  for (const slot of activity.favorite_slots ?? []) add(slot?.device_id);
  for (const binding of activity.button_bindings ?? []) {
    add(binding?.device_id);
    add(binding?.long_press_device_id);
  }
  // Real command steps in ANY macro (user macros AND user-added commands in
  // the power macros) make their device a member. The power-macro ref steps
  // (0xC5/0xC6/0xC7) are already counted by activityPowerDeviceIds.
  for (const macro of activity.macros ?? []) {
    for (const step of macro?.steps ?? []) {
      if (isMacroDelayStep(step) || isPowerRefStep(step)) continue;
      add(step?.device_id);
    }
  }
  return ids;
}

/**
 * Devices an Activity currently links: presence in its generated power
 * macros is canonical, while direct editable references are included so
 * reconciliation can repair a missing power row.
 */
function activityMemberDeviceIds(activity: BackupBundleActivityPayload): number[] {
  const ids = activityPowerDeviceIds(activity);
  for (const id of activityUsageDeviceIds(activity)) ids.add(id);
  return [...ids].sort((left, right) => left - right);
}

/**
 * Reconcile one power macro's flat step list to `members`: preserve every
 * existing member step (and any wait rows) verbatim, drop steps for devices
 * that are no longer members, and add any missing mandatory reference rows.
 * The user may reorder required rows in the sequence editor, but absence is
 * not a power policy; device-wide idle behavior controls that.
 */
function reconcilePowerMacroSteps(
  existingSteps: BackupBundleMacroStep[] | null | undefined,
  members: number[],
  refCommands: number[],
): BackupBundleMacroStep[] {
  const memberSet = new Set(members);
  const { prefix, groups } = groupMacroSteps(existingSteps);
  const kept = flattenMacroGroups(prefix, groups.filter((group) => {
    const deviceId = Number(group.head?.device_id || 0);
    return deviceId > 0 ? memberSet.has(deviceId) : true;
  }));
  const out = [...kept];
  const memberOrder = new Map(members.map((id, index) => [id, index]));
  const findRef = (deviceId: number, command: number) => out.findIndex(
    (step) => !isMacroDelayStep(step) && stepMatchesCommand(step, deviceId, command),
  );
  const indexAfterGroupAt = (headIndex: number): number => {
    let index = headIndex + 1;
    while (index < out.length && isMacroDelayStep(out[index])) index += 1;
    return index;
  };
  const insertIndexFor = (deviceId: number, command: number): number => {
    if (command === DEVICE_POWER_ON_REF_COMMAND) {
      const inputIndex = findRef(deviceId, DEVICE_INPUT_REF_COMMAND);
      if (inputIndex >= 0) return inputIndex;
    }
    if (command === DEVICE_INPUT_REF_COMMAND) {
      const powerIndex = findRef(deviceId, DEVICE_POWER_ON_REF_COMMAND);
      if (powerIndex >= 0) return indexAfterGroupAt(powerIndex);
    }

    const myOrder = memberOrder.get(deviceId) ?? members.length;
    const laterIndex = out.findIndex((step) => {
      if (isMacroDelayStep(step) || !isPowerRefStep(step)) return false;
      const otherOrder = memberOrder.get(Number(step?.device_id || 0));
      return otherOrder != null && otherOrder > myOrder;
    });
    return laterIndex >= 0 ? laterIndex : out.length;
  };
  for (const deviceId of members) {
    for (const command of refCommands) {
      const present = out.some(
        (step) => Number(step?.device_id || 0) === deviceId && Number(step?.command_id || 0) === command,
      );
      if (!present) out.splice(insertIndexFor(deviceId, command), 0, powerStep(deviceId, command));
    }
  }
  return out;
}

/**
 * Bring an Activity's POWER_ON / POWER_OFF macros (and its
 * `referenced_source_device_ids`) into line with its member devices.
 * Idempotent and non-destructive: existing steps (inputs, delays, order)
 * are preserved, while missing mandatory reference rows are repaired.
 * `extraMemberIds` explicitly seed devices with no editable reference.
 */
export function reconcileActivityPowerMacros(
  bundle: BackupBundlePayload,
  activityId: number,
  extraMemberIds: number[] = [],
): BackupBundlePayload {
  return updateActivity(bundle, activityId, (activity) => {
    const selfId = Number(activity?.device?.device_id || 0);
    const memberSet = new Set(activityMemberDeviceIds(activity));
    for (const id of extraMemberIds) {
      const extraId = Number(id || 0);
      if (extraId > 0 && extraId !== selfId) memberSet.add(extraId);
    }
    const members = [...memberSet].sort((left, right) => left - right);
    const macros = [...(activity.macros ?? [])];
    const ensure = (buttonId: number, name: string, refCommands: number[]) => {
      const index = macros.findIndex((macro) => Number(macro?.button_id || 0) === buttonId);
      const existing = index >= 0 ? macros[index] : null;
      if (!existing && members.length === 0) return;
      const steps = reconcilePowerMacroSteps(existing?.steps, members, refCommands);
      const next: BackupBundleMacroRow = {
        ...(existing ?? {}),
        button_id: buttonId,
        name: existing?.name ?? name,
        steps,
      };
      if (index >= 0) macros[index] = next;
      else macros.push(next);
    };
    ensure(POWER_ON_MACRO_BUTTON_ID, "POWER_ON", [DEVICE_POWER_ON_REF_COMMAND, DEVICE_INPUT_REF_COMMAND]);
    ensure(POWER_OFF_MACRO_BUTTON_ID, "POWER_OFF", [DEVICE_POWER_OFF_REF_COMMAND]);
    return { ...activity, macros, referenced_source_device_ids: members };
  });
}

/** Run {@link reconcileActivityPowerMacros} for every Activity in the bundle. */
export function reconcileBundlePowerMacros(bundle: BackupBundlePayload): BackupBundlePayload {
  let next = bundle;
  for (const activity of bundle.activities ?? []) {
    const id = Number(activity?.device?.device_id || 0);
    if (id > 0) next = reconcileActivityPowerMacros(next, id);
  }
  return next;
}

/**
 * Remove generated linkage only for devices whose final editable reference
 * disappeared during a mutation. Existing power-only members that were not
 * affected by the edit are preserved.
 */
function reconcileActivityMembershipChange(
  before: BackupBundlePayload,
  after: BackupBundlePayload,
  activityId: number,
): BackupBundlePayload {
  const aId = Number(activityId);
  const beforeActivity = (before.activities ?? []).find(
    (activity) => Number(activity?.device?.device_id || 0) === aId,
  );
  const afterActivity = (after.activities ?? []).find(
    (activity) => Number(activity?.device?.device_id || 0) === aId,
  );
  if (!afterActivity) return after;

  const beforeUsage = beforeActivity ? activityUsageDeviceIds(beforeActivity) : new Set<number>();
  const afterUsage = activityUsageDeviceIds(afterActivity);
  const lost = new Set([...beforeUsage].filter((deviceId) => !afterUsage.has(deviceId)));
  if (lost.size === 0) return reconcileActivityPowerMacros(after, aId);

  const pruned = updateActivity(after, aId, (activity) => ({
    ...activity,
    referenced_source_device_ids: (activity.referenced_source_device_ids ?? []).filter(
      (deviceId) => !lost.has(Number(deviceId)),
    ),
    macros: (activity.macros ?? []).map((macro) => ({
      ...macro,
      steps: filterMacroSteps(
        macro.steps,
        (step) => isPowerRefStep(step) && lost.has(Number(step?.device_id || 0)),
      ),
    })),
  }));
  return reconcileActivityPowerMacros(pruned, aId);
}

/** Apply membership transition reconciliation to every surviving Activity. */
function reconcileBundleMembershipChange(
  before: BackupBundlePayload,
  after: BackupBundlePayload,
): BackupBundlePayload {
  let next = after;
  for (const activity of after.activities ?? []) {
    const activityId = Number(activity?.device?.device_id || 0);
    if (activityId > 0) next = reconcileActivityMembershipChange(before, next, activityId);
  }
  return next;
}

// ── Activity membership editing ─────────────────────────────────────
//
// Membership is encoded by power-ref steps; `referenced_source_device_ids`
// is a recomputed mirror. Favorites, button bindings, and real macro steps
// automatically create that linkage, and removing a device's final editable
// reference removes its generated power rows.

function findBundleActivity(
  bundle: BackupBundlePayload | null,
  activityId: number,
): BackupBundleActivityPayload | undefined {
  return (bundle?.activities ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === Number(activityId),
  );
}

/**
 * Per-device member view of an Activity, spanning all three power-facing
 * concerns the narrative editor renders: chips (membership), the start
 * section (power-on + input), and the end section (power-off). Order
 * follows POWER_ON step appearance, then POWER_OFF, then remaining
 * members by id.
 */
export interface BackupActivityMemberView {
  deviceId: number;
  deviceName: string;
  /** Device has a 0xC6 power-on ref step. Missing rows are repaired. */
  powersOn: boolean;
  /** 1-based ordinal from the device's 0xC5 input step; 0 = unset. */
  inputOrdinal: number;
  inputCommandId: number | null;
  inputCommandName: string | null;
  /** Device has a 0xC7 power-off ref step. Missing rows are repaired. */
  powersOff: boolean;
}

export function activityMemberViews(
  bundle: BackupBundlePayload | null,
  activityId: number,
): BackupActivityMemberView[] {
  const activity = findBundleActivity(bundle, activityId);
  if (!bundle || !activity) return [];
  const members = activityMemberDeviceIds(activity);
  const memberSet = new Set(members);
  const macroFor = (buttonId: number) =>
    (activity.macros ?? []).find((macro) => Number(macro?.button_id || 0) === buttonId);
  const powerOn = macroFor(POWER_ON_MACRO_BUTTON_ID);
  const powerOff = macroFor(POWER_OFF_MACRO_BUTTON_ID);
  const order: number[] = [];
  const push = (value: unknown) => {
    const id = Number(value || 0);
    if (id > 0 && memberSet.has(id) && !order.includes(id)) order.push(id);
  };
  for (const step of powerOn?.steps ?? []) {
    if (!isMacroDelayStep(step) && isPowerRefStep(step)) push(step?.device_id);
  }
  for (const step of powerOff?.steps ?? []) {
    if (!isMacroDelayStep(step) && isPowerRefStep(step)) push(step?.device_id);
  }
  for (const id of members) push(id);
  return order.map((deviceId) => {
    const onSteps = (powerOn?.steps ?? []).filter(
      (step) => !isMacroDelayStep(step) && Number(step?.device_id || 0) === deviceId,
    );
    const powersOn = onSteps.some(
      (step) => Number(step?.command_id || 0) === DEVICE_POWER_ON_REF_COMMAND,
    );
    const inputStep = onSteps.find(
      (step) => Number(step?.command_id || 0) === DEVICE_INPUT_REF_COMMAND,
    );
    const inputOrdinal = Number(inputStep?.duration || 0);
    const input = deviceInputEntries(bundle, deviceId).find((entry) => entry.ordinal === inputOrdinal);
    const powersOff = (powerOff?.steps ?? []).some(
      (step) => !isMacroDelayStep(step)
        && stepMatchesCommand(step, deviceId, DEVICE_POWER_OFF_REF_COMMAND),
    );
    return {
      deviceId,
      deviceName: deviceNameFor(bundle, deviceId),
      powersOn,
      inputOrdinal,
      inputCommandId: input?.commandId ?? null,
      inputCommandName: input?.name || (inputOrdinal > 0 ? `Input ${inputOrdinal}` : null),
      powersOff,
    };
  });
}

/** Bundle devices not yet members of the Activity — the "Add device" menu. */
export function activityAddableDevices(
  bundle: BackupBundlePayload | null,
  activityId: number,
): BackupSelectionOption[] {
  const activity = findBundleActivity(bundle, activityId);
  if (!bundle || !activity) return [];
  const members = new Set(activityMemberDeviceIds(activity));
  return bundleDeviceOptions(bundle).filter(
    (option) => !members.has(option.id),
  );
}

/**
 * Add a device to an Activity by seeding its full power-ref step set
 * (0xC6 + 0xC5 in POWER_ON, 0xC7 in POWER_OFF) — the reference that
 * makes it a member. Idempotent; no-op for unknown devices, the
 * activity's own id, or existing members.
 */
export function addActivityMemberDevice(
  bundle: BackupBundlePayload,
  activityId: number,
  deviceId: number,
): BackupBundlePayload {
  const dId = Number(deviceId);
  const aId = Number(activityId);
  if (dId <= 0 || dId === aId || !findDevice(bundle, dId)) return bundle;
  const activity = findBundleActivity(bundle, aId);
  if (!activity) return bundle;
  if (activityMemberDeviceIds(activity).includes(dId)) return bundle;
  return reconcileActivityPowerMacros(bundle, aId, [dId]);
}

/**
 * Remove a device from an Activity: strip every reference to it inside
 * this activity (power steps, favorites, bindings incl. long-press,
 * macro steps) and reconcile. The device itself stays in the bundle.
 */
export function removeActivityMemberDevice(
  bundle: BackupBundlePayload,
  activityId: number,
  deviceId: number,
): BackupBundlePayload {
  const aId = Number(activityId);
  const next = updateActivity(bundle, aId, (activity) =>
    stripDeviceFromActivity(activity, Number(deviceId)),
  );
  return reconcileActivityPowerMacros(next, aId);
}

/**
 * What removing a device from this Activity takes with it, scoped to the
 * activity (contrast {@link bundleDeleteImpact}, which spans the bundle).
 * `macroSteps` counts user-visible steps only — the power-ref rows the
 * reconcile machinery manages are implementation detail and would only
 * confuse the confirm dialog.
 */
export function activityMemberRemovalImpact(
  bundle: BackupBundlePayload | null,
  activityId: number,
  deviceId: number,
): BackupDeleteImpact {
  const empty: BackupDeleteImpact = { favorites: 0, macroSteps: 0, powerSteps: 0, activities: 0, bindings: 0 };
  const activity = findBundleActivity(bundle, activityId);
  if (!activity) return empty;
  const dId = Number(deviceId);
  let favorites = 0;
  for (const slot of activity.favorite_slots ?? []) {
    if (Number(slot?.device_id || 0) === dId) favorites += 1;
  }
  let macroSteps = 0;
  for (const macro of activity.macros ?? []) {
    if (INTERNAL_POWER_MACRO_BUTTON_IDS.has(Number(macro?.button_id || 0))) {
      for (const step of macro?.steps ?? []) {
        if (!isMacroDelayStep(step) && !isPowerRefStep(step) && stepMatchesDevice(step, dId)) {
          macroSteps += 1;
        }
      }
    } else {
      macroSteps += countRemovedMacroSteps(macro?.steps, (step) => stepMatchesDevice(step, dId));
    }
  }
  const bindings = countAffectedBindings(
    activity.button_bindings,
    (binding) => cascadeBindingForDeletedDevice(binding, dId),
  );
  return { favorites, macroSteps, powerSteps: 0, activities: 0, bindings };
}

// ── Macro editing ───────────────────────────────────────────────────

// The X1 synthetic command code used by keymap / input / macro writes.
// Mirrors `synthesize_command_code` in device_create.py. Activity macro
// steps carry this as `button_code`; restore takes it verbatim (device
// macros omit it and let restore re-synthesize).
const SYNTHETIC_COMMAND_CODE_BASE = 0x4E20;

export function synthesizeCommandCode(commandId: number): number {
  return SYNTHETIC_COMMAND_CODE_BASE + (Number(commandId) & 0xFF);
}

function findDevice(bundle: BackupBundlePayload | null, deviceId: number): BackupBundleDevicePayload | undefined {
  return (bundle?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
}

function inputEntryOrdinal(entry: BackupBundleInputEntry): number {
  return Number(entry?.input_index ?? entry?.ordinal ?? 0);
}

/** A device's configured inputs (TV inputs etc.), sorted by ordinal. */
export function deviceInputEntries(
  bundle: BackupBundlePayload | null,
  deviceId: number,
): Array<{ commandId: number; ordinal: number; name: string }> {
  const device = findDevice(bundle, deviceId);
  const entries = device?.input_record?.entries ?? [];
  return entries
    .map((entry) => ({
      commandId: Number(entry?.command_id || 0),
      ordinal: inputEntryOrdinal(entry),
      name: String(entry?.name || entry?.label || "").trim(),
    }))
    .filter((entry) => entry.commandId > 0)
    .sort((left, right) => left.ordinal - right.ordinal);
}

/**
 * Ensure `commandId` exists as an input on the device, returning the new
 * bundle and the input's 1-based ordinal. Reuse-or-append: an existing
 * input for that command keeps its ordinal; otherwise a fresh entry is
 * appended (ordinal = max + 1) with the synthetic fid.
 */
function ensureDeviceInput(
  bundle: BackupBundlePayload,
  deviceId: number,
  commandId: number,
): { bundle: BackupBundlePayload; ordinal: number } {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  const device = findDevice(bundle, dId);
  const existingEntries = device?.input_record?.entries ?? [];
  const reused = existingEntries.find((entry) => Number(entry?.command_id || 0) === cId);
  if (reused) {
    return { bundle, ordinal: inputEntryOrdinal(reused) };
  }
  const nextOrdinal = existingEntries.reduce((max, entry) => Math.max(max, inputEntryOrdinal(entry)), 0) + 1;
  const newEntry: BackupBundleInputEntry = {
    command_id: cId,
    fid: synthesizeCommandCode(cId),
    input_index: nextOrdinal,
    name: commandLabelFor(bundle, dId, cId) || `Input ${cId}`,
  };
  const nextBundle: BackupBundlePayload = {
    ...bundle,
    devices: (bundle.devices ?? []).map((entry) => {
      if (Number(entry?.device?.device_id || 0) !== dId) return entry;
      const record: BackupBundleInputRecord = { ...(entry.input_record ?? {}) };
      record.entries = [...existingEntries, newEntry];
      return { ...entry, input_record: record };
    }),
  };
  return { bundle: nextBundle, ordinal: nextOrdinal };
}

export interface BackupActivityPowerDevice {
  deviceId: number;
  deviceName: string;
  /** 1-based input ordinal the device's POWER_ON 0xC5 step points at; 0 = unset. */
  inputOrdinal: number;
  inputCommandId: number | null;
  inputCommandName: string | null;
}

/**
 * Per-device view of an Activity's POWER_ON macro for the power editor.
 * The macro is a flat, interleaved step list, so a device's input is read
 * from its own `{device_id, command_id 0xC5}` step's `duration` ordinal
 * (not from any positional grouping). Device order follows first appearance.
 */
export function activityPowerDevices(
  bundle: BackupBundlePayload | null,
  activityId: number,
): BackupActivityPowerDevice[] {
  if (!bundle) return [];
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  if (!activity) return [];
  const powerOn = (activity.macros ?? []).find((macro) => Number(macro?.button_id || 0) === POWER_ON_MACRO_BUTTON_ID);
  const steps = powerOn?.steps ?? [];
  const order: number[] = [];
  const seen = new Set<number>();
  for (const step of steps) {
    if (isMacroDelayStep(step)) continue;
    const command = Number(step?.command_id || 0);
    if (command !== DEVICE_POWER_ON_REF_COMMAND && command !== DEVICE_INPUT_REF_COMMAND) continue;
    const deviceId = Number(step?.device_id || 0);
    if (deviceId > 0 && !seen.has(deviceId)) {
      seen.add(deviceId);
      order.push(deviceId);
    }
  }
  return order.map((deviceId) => {
    const inputStep = steps.find(
      (step) => !isMacroDelayStep(step)
        && Number(step?.device_id || 0) === deviceId
        && Number(step?.command_id || 0) === DEVICE_INPUT_REF_COMMAND,
    );
    const inputOrdinal = Number(inputStep?.duration || 0);
    const input = deviceInputEntries(bundle, deviceId).find((entry) => entry.ordinal === inputOrdinal);
    return {
      deviceId,
      deviceName: deviceNameFor(bundle, deviceId),
      inputOrdinal,
      inputCommandId: input?.commandId ?? null,
      inputCommandName: input?.name || (inputOrdinal > 0 ? `Input ${inputOrdinal}` : null),
    };
  });
}

/**
 * Point a device's POWER_ON 0xC5 input step at `ordinal` (0 clears it),
 * appending the step if the device somehow has none. Other devices' steps
 * are untouched.
 */
function setActivityPowerInputOrdinal(
  activity: BackupBundleActivityPayload,
  deviceId: number,
  ordinal: number,
): BackupBundleActivityPayload {
  const dId = Number(deviceId);
  return {
    ...activity,
    macros: (activity.macros ?? []).map((macro) => {
      if (Number(macro?.button_id || 0) !== POWER_ON_MACRO_BUTTON_ID) return macro;
      let found = false;
      const steps = (macro.steps ?? []).map((step) => {
        if (
          !isMacroDelayStep(step)
          && Number(step?.device_id || 0) === dId
          && Number(step?.command_id || 0) === DEVICE_INPUT_REF_COMMAND
        ) {
          found = true;
          return { ...step, duration: ordinal & 0xFF };
        }
        return step;
      });
      if (!found) steps.push(powerStep(dId, DEVICE_INPUT_REF_COMMAND, ordinal));
      return { ...macro, steps };
    }),
  };
}

/**
 * Designate `commandId` as device `deviceId`'s input within Activity
 * `activityId`'s power-on macro. Adds the command to the device's inputs
 * (reuse-or-append) and points the device's 0xC5 step at that ordinal.
 */
export function setActivityDeviceInput(
  bundle: BackupBundlePayload,
  activityId: number,
  deviceId: number,
  commandId: number,
): BackupBundlePayload {
  const cId = Number(commandId);
  if (cId <= 0) return bundle;
  const ensured = ensureDeviceInput(bundle, deviceId, cId);
  const reconciled = reconcileActivityPowerMacros(ensured.bundle, Number(activityId));
  return updateActivity(reconciled, activityId, (activity) =>
    setActivityPowerInputOrdinal(activity, deviceId, ensured.ordinal),
  );
}

/** Clear a device's designated input in an Activity's power-on macro (ordinal 0). */
export function clearActivityDeviceInput(
  bundle: BackupBundlePayload,
  activityId: number,
  deviceId: number,
): BackupBundlePayload {
  const reconciled = reconcileActivityPowerMacros(bundle, Number(activityId));
  return updateActivity(reconciled, activityId, (activity) => setActivityPowerInputOrdinal(activity, deviceId, 0));
}

// ── Device macro step editing ───────────────────────────────────────
//
// A macro is a step sequence. Two timing concepts, both in 0.5-second
// units (matching the Sofabaton app, which labels a command "Click" /
// "Hold X.Xs" and shows separate "Delay X.Xs" rows):
//   • a COMMAND step's `duration` is its HOLD time (0 = a single click).
//     Its own `delay` field is always 0xFF (the firmware "no delay"
//     sentinel) — real waits are NOT stored there.
//   • a DELAY step is a standalone wait row (command_id 0xFF) whose `delay`
//     byte is the wait length in 0.5s units.

// Mandatory activity power-macro components — reorderable, never deletable:
//   "power" = a device power-on/off reference (0xC6/0xC7); display only.
//   "input" = a device input reference (0xC5); its target command IS editable
//             (sets the input), but it can't be deleted.
// Editor item kinds. Waits are no longer their own items — each command's
// trailing delay is folded onto it as `wait`, so there is no "delay" kind.
export type MacroStepKind = "command" | "power" | "input";

export interface BackupMacroStepItem {
  index: number;
  kind: MacroStepKind;
  commandId: number | null;
  /** Target device for an activity macro command step; null for device macros. */
  deviceId: number | null;
  label: string;
  /** Command-step HOLD byte (0.5s units; 0 = click). 0 for delay steps. */
  hold: number;
  /** Delay-step WAIT byte (0.5s units). 0 for command steps. */
  wait: number;
  /** Mandatory power-macro ref: reorder allowed, delete/edit not. */
  protected?: boolean;
}

/** True for an activity power-macro device reference (0xC5 / 0xC6 / 0xC7). */
function isPowerRefStep(step: BackupBundleMacroStep): boolean {
  const command = Number(step?.command_id || 0);
  return command === DEVICE_INPUT_REF_COMMAND
    || command === DEVICE_POWER_ON_REF_COMMAND
    || command === DEVICE_POWER_OFF_REF_COMMAND;
}

export interface BackupDeviceMacroSummary {
  buttonId: number;
  name: string;
  isPower: boolean;
  commandStepCount: number;
}

function defaultMacroName(buttonId: number): string {
  if (buttonId === POWER_ON_MACRO_BUTTON_ID) return "POWER_ON";
  if (buttonId === POWER_OFF_MACRO_BUTTON_ID) return "POWER_OFF";
  return `Macro ${buttonId}`;
}

function deviceMacroDelayStep(delay: number): BackupBundleMacroStep {
  return { command_id: 0xFF, duration: 0xFF, delay: Number(delay) & 0xFF };
}

// ── Command-group model ─────────────────────────────────────────────
//
// The editor treats a macro as a list of command-groups, mirroring the
// Sofabaton app: a group is one command-like head step (a real command,
// or a power/input reference) plus the consecutive delay/wait step(s)
// that trail it — that trailing delay is the command's attached "wait".
// Reordering/removing a command therefore carries its wait along. Delay
// steps before the first head (an anomaly real exports don't produce)
// are preserved verbatim as `prefix`.

interface MacroStepGroup {
  head: BackupBundleMacroStep;
  trailing: BackupBundleMacroStep[];
}

function groupMacroSteps(
  steps: BackupBundleMacroStep[] | null | undefined,
): { prefix: BackupBundleMacroStep[]; groups: MacroStepGroup[] } {
  const prefix: BackupBundleMacroStep[] = [];
  const groups: MacroStepGroup[] = [];
  for (const step of steps ?? []) {
    if (isMacroDelayStep(step)) {
      if (groups.length === 0) prefix.push(step);
      else groups[groups.length - 1].trailing.push(step);
    } else {
      groups.push({ head: step, trailing: [] });
    }
  }
  return { prefix, groups };
}

function flattenMacroGroups(
  prefix: BackupBundleMacroStep[],
  groups: MacroStepGroup[],
): BackupBundleMacroStep[] {
  const out = [...prefix];
  for (const group of groups) out.push(group.head, ...group.trailing);
  return out;
}

/** A group's attached wait byte — the value of its first trailing delay (0 if none). */
function groupWait(group: MacroStepGroup): number {
  return group.trailing.length > 0 ? Number(group.trailing[0]?.delay || 0) : 0;
}

/**
 * Set a group's attached wait. Patches the first trailing delay in place
 * (kept even at 0), or inserts one when the group has no delay yet and the
 * wait is non-zero. A zero wait on a group with no delay is a no-op, so we
 * never materialize delay-0 rows nor auto-delete an existing one.
 */
function applyGroupWait(group: MacroStepGroup, waitByte: number, isActivity: boolean): void {
  const value = Number(waitByte) & 0xFF;
  if (group.trailing.length > 0) {
    group.trailing = [{ ...group.trailing[0], delay: value }, ...group.trailing.slice(1)];
  } else if (value > 0) {
    group.trailing = [isActivity ? powerMacroDelayRow(value) : deviceMacroDelayStep(value)];
  }
}

/** Summaries of a device's macros (its power-on/off plus any user macros). */
export function deviceMacroSummaries(
  bundle: BackupBundlePayload | null,
  deviceId: number,
): BackupDeviceMacroSummary[] {
  const device = findDevice(bundle, deviceId);
  return (device?.macros ?? [])
    .map((macro) => {
      const buttonId = Number(macro?.button_id || 0);
      return {
        buttonId,
        name: String(macro?.name || defaultMacroName(buttonId)),
        isPower: buttonId === POWER_ON_MACRO_BUTTON_ID || buttonId === POWER_OFF_MACRO_BUTTON_ID,
        commandStepCount: (macro?.steps ?? []).filter((step) => !isMacroDelayStep(step)).length,
      };
    })
    .filter((macro) => macro.buttonId > 0)
    .sort((left, right) => left.buttonId - right.buttonId);
}

/** Step list for one of a device's macros, in the shape the editor renders. */
export function deviceMacroStepItems(
  bundle: BackupBundlePayload | null,
  deviceId: number,
  buttonId: number,
): BackupMacroStepItem[] {
  const device = findDevice(bundle, deviceId);
  const macro = (device?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  const { groups } = groupMacroSteps(macro?.steps);
  return groups.map((group, index) => {
    const commandId = Number(group.head?.command_id || 0);
    return {
      index,
      kind: "command",
      commandId,
      deviceId: null,
      label: commandNameOrFallback(bundle as BackupBundlePayload, Number(deviceId), commandId),
      hold: Number(group.head?.duration || 0),
      wait: groupWait(group),
    };
  });
}

function updateDeviceMacro(
  bundle: BackupBundlePayload,
  deviceId: number,
  buttonId: number,
  transform: (steps: BackupBundleMacroStep[]) => BackupBundleMacroStep[],
): BackupBundlePayload {
  const dId = Number(deviceId);
  const bId = Number(buttonId);
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== dId) return device;
      const macros = [...(device.macros ?? [])];
      const index = macros.findIndex((macro) => Number(macro?.button_id || 0) === bId);
      const existing = index >= 0 ? macros[index] : null;
      const next: BackupBundleMacroRow = {
        ...(existing ?? {}),
        button_id: bId,
        name: existing?.name ?? defaultMacroName(bId),
        steps: transform(existing?.steps ?? []),
      };
      if (index >= 0) macros[index] = next;
      else macros.push(next);
      return { ...device, macros };
    }),
  };
}

interface MacroStepPatch {
  commandId?: number;
  deviceId?: number;
  /** Command-step hold byte (duration). */
  hold?: number;
  /** Delay-step wait byte (delay). */
  wait?: number;
}

function patchMacroStep(
  step: BackupBundleMacroStep,
  patch: MacroStepPatch,
  isActivityMacro: boolean,
): BackupBundleMacroStep {
  const next: BackupBundleMacroStep = { ...step };
  if (isMacroDelayStep(step)) {
    if (patch.wait !== undefined) next.delay = Number(patch.wait) & 0xFF;
    return next;
  }
  if (patch.commandId !== undefined) {
    next.command_id = Number(patch.commandId);
    if (isActivityMacro) next.button_code = synthesizeCommandCode(Number(patch.commandId));
  }
  if (patch.deviceId !== undefined && isActivityMacro) next.device_id = Number(patch.deviceId);
  if (patch.hold !== undefined) next.duration = Number(patch.hold) & 0xFF;
  return next;
}

export function addDeviceMacroCommandStep(
  bundle: BackupBundlePayload,
  deviceId: number,
  buttonId: number,
  commandId: number,
  hold = 0,
): BackupBundlePayload {
  if (Number(commandId) <= 0) return bundle;
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => [
    ...steps,
    { command_id: Number(commandId), duration: Number(hold) & 0xFF, delay: 0xFF },
  ]);
}

// Macro step indices below are GROUP indices (one per command-like step),
// not flat step indices: a command and its trailing wait move/delete as one.
export function updateDeviceMacroStep(
  bundle: BackupBundlePayload,
  deviceId: number,
  buttonId: number,
  index: number,
  patch: MacroStepPatch,
): BackupBundlePayload {
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    group.head = patchMacroStep(group.head, patch, false);
    return flattenMacroGroups(prefix, groups);
  });
}

/** Set the attached wait (delay byte) on a command group. */
export function setDeviceMacroStepWait(
  bundle: BackupBundlePayload,
  deviceId: number,
  buttonId: number,
  index: number,
  wait: number,
): BackupBundlePayload {
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    applyGroupWait(group, wait, false);
    return flattenMacroGroups(prefix, groups);
  });
}

export function removeDeviceMacroStep(
  bundle: BackupBundlePayload,
  deviceId: number,
  buttonId: number,
  index: number,
): BackupBundlePayload {
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    if (Number(index) < 0 || Number(index) >= groups.length) return steps;
    groups.splice(Number(index), 1);
    return flattenMacroGroups(prefix, groups);
  });
}

export function reorderDeviceMacroSteps(
  bundle: BackupBundlePayload,
  deviceId: number,
  buttonId: number,
  orderedIndices: number[],
): BackupBundlePayload {
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const reordered = orderedIndices
      .map((i) => groups[Number(i)])
      .filter((group): group is MacroStepGroup => Boolean(group));
    if (reordered.length !== groups.length) return steps;
    return flattenMacroGroups(prefix, reordered);
  });
}

// ── Activity user macro step editing ────────────────────────────────
//
// Activity user macros (button_id not 198/199) play commands on member
// devices. Steps carry `{device_id, command_id, button_code, delay}`;
// restore takes button_code verbatim, so a new command step synthesizes
// it. Step edits change device membership, so they re-run the power-macro
// reconcile. Delay steps use the activity 0xFF/0xFF sentinel form.

export interface BackupActivityMacroSummary {
  buttonId: number;
  name: string;
  commandStepCount: number;
}

/** A device's user macros (excludes the auto-managed power macros 198/199). */
export function activityUserMacroSummaries(
  bundle: BackupBundlePayload | null,
  activityId: number,
): BackupActivityMacroSummary[] {
  const activity = (bundle?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  return (activity?.macros ?? [])
    .map((macro) => ({ buttonId: Number(macro?.button_id || 0), macro }))
    .filter(({ buttonId }) => buttonId > 0 && buttonId !== POWER_ON_MACRO_BUTTON_ID && buttonId !== POWER_OFF_MACRO_BUTTON_ID)
    .map(({ buttonId, macro }) => ({
      buttonId,
      name: String(macro?.name || `Macro ${buttonId}`),
      commandStepCount: (macro?.steps ?? []).filter((step) => !isMacroDelayStep(step)).length,
    }))
    .sort((left, right) => left.buttonId - right.buttonId);
}

/** Step list for one activity user macro, in the shape the editor renders. */
export function activityMacroStepItems(
  bundle: BackupBundlePayload | null,
  activityId: number,
  buttonId: number,
): BackupMacroStepItem[] {
  const activity = (bundle?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const macro = (activity?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  const { groups } = groupMacroSteps(macro?.steps);
  return groups.map((group, index) => {
    const head = group.head;
    const wait = groupWait(group);
    const deviceId = Number(head?.device_id || 0);
    const commandId = Number(head?.command_id || 0);
    const deviceName = deviceNameFor(bundle, deviceId);
    // Mandatory power-macro references (only present in the 198/199 macros).
    if (commandId === DEVICE_POWER_ON_REF_COMMAND || commandId === DEVICE_POWER_OFF_REF_COMMAND) {
      const verb = commandId === DEVICE_POWER_ON_REF_COMMAND ? "Power on" : "Power off";
      return { index, kind: "power", commandId, deviceId, label: `${verb} · ${deviceName}`, hold: 0, wait, protected: true };
    }
    if (commandId === DEVICE_INPUT_REF_COMMAND) {
      const ordinal = Number(head?.duration || 0);
      const input = deviceInputEntries(bundle, deviceId).find((entry) => entry.ordinal === ordinal);
      const inputLabel = input?.name || (ordinal > 0 ? `Input ${ordinal}` : "no input");
      // commandId carries the resolved input command (or null) so the editor
      // can pre-select it; the step itself is identified as an input ref.
      return { index, kind: "input", commandId: input?.commandId ?? null, deviceId, label: `Input · ${deviceName}: ${inputLabel}`, hold: 0, wait, protected: true };
    }
    return {
      index,
      kind: "command",
      commandId,
      deviceId,
      label: `${deviceName} · ${commandNameOrFallback(bundle as BackupBundlePayload, deviceId, commandId)}`,
      hold: Number(head?.duration || 0),
      wait,
    };
  });
}

function updateActivityMacro(
  bundle: BackupBundlePayload,
  activityId: number,
  buttonId: number,
  transform: (steps: BackupBundleMacroStep[]) => BackupBundleMacroStep[],
): BackupBundlePayload {
  const bId = Number(buttonId);
  const next = updateActivity(bundle, activityId, (activity) => {
    const macros = [...(activity.macros ?? [])];
    const index = macros.findIndex((macro) => Number(macro?.button_id || 0) === bId);
    const existing = index >= 0 ? macros[index] : null;
    const nextMacro: BackupBundleMacroRow = {
      ...(existing ?? {}),
      button_id: bId,
      name: existing?.name ?? `Macro ${bId}`,
      steps: transform(existing?.steps ?? []),
    };
    if (index >= 0) macros[index] = nextMacro;
    else macros.push(nextMacro);
    return { ...activity, macros };
  });
  // Step edits can change which devices the activity uses.
  return reconcileActivityMembershipChange(bundle, next, Number(activityId));
}

/** Create an empty user macro on an Activity at the next quick-access slot. */
export function addActivityUserMacro(
  bundle: BackupBundlePayload,
  activityId: number,
  name: string,
): BackupBundlePayload {
  return updateActivity(bundle, activityId, (activity) => ({
    ...activity,
    macros: [...(activity.macros ?? []), {
      button_id: nextQuickAccessButtonId(activity),
      name: String(name ?? "").trim() || "Macro",
      steps: [],
    }],
  }));
}

export function addActivityMacroCommandStep(
  bundle: BackupBundlePayload,
  activityId: number,
  buttonId: number,
  deviceId: number,
  commandId: number,
  hold = 0,
): BackupBundlePayload {
  if (Number(deviceId) <= 0 || Number(commandId) <= 0) return bundle;
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => [...steps, {
    device_id: Number(deviceId),
    command_id: Number(commandId),
    button_code: synthesizeCommandCode(Number(commandId)),
    duration: Number(hold) & 0xFF,
    delay: 0xFF,
  }]);
}

// Macro step indices below are GROUP indices (see device equivalents).
export function updateActivityMacroStep(
  bundle: BackupBundlePayload,
  activityId: number,
  buttonId: number,
  index: number,
  patch: MacroStepPatch,
): BackupBundlePayload {
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    group.head = patchMacroStep(group.head, patch, true);
    return flattenMacroGroups(prefix, groups);
  });
}

/** Set the attached wait on an activity-macro command group (incl. power refs). */
export function setActivityMacroStepWait(
  bundle: BackupBundlePayload,
  activityId: number,
  buttonId: number,
  index: number,
  wait: number,
): BackupBundlePayload {
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    applyGroupWait(group, wait, true);
    return flattenMacroGroups(prefix, groups);
  });
}

export function removeActivityMacroStep(
  bundle: BackupBundlePayload,
  activityId: number,
  buttonId: number,
  index: number,
): BackupBundlePayload {
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    // Mandatory power-macro refs can be reordered but never deleted.
    if (isPowerRefStep(group.head)) return steps;
    groups.splice(Number(index), 1);
    return flattenMacroGroups(prefix, groups);
  });
}

export function reorderActivityMacroSteps(
  bundle: BackupBundlePayload,
  activityId: number,
  buttonId: number,
  orderedIndices: number[],
): BackupBundlePayload {
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const reordered = orderedIndices
      .map((i) => groups[Number(i)])
      .filter((group): group is MacroStepGroup => Boolean(group));
    if (reordered.length !== groups.length) return steps;
    return flattenMacroGroups(prefix, reordered);
  });
}

// ── Button bindings ─────────────────────────────────────────────────

export interface ButtonCatalogEntry {
  /** Wire button code, stored as `button_id`. */
  code: number;
  name: string;
  group: string;
}

// Physical-button universe, mirroring `ButtonName` in protocol_const.py.
// POWER_ON / POWER_OFF (0xC6 / 0xC7) are the activity power macros, not
// bindable buttons, so they're intentionally absent.
const SHARED_BUTTON_CATALOG: ButtonCatalogEntry[] = [
  { code: 0xAE, name: "Up", group: "Navigation" },
  { code: 0xB2, name: "Down", group: "Navigation" },
  { code: 0xAF, name: "Left", group: "Navigation" },
  { code: 0xB1, name: "Right", group: "Navigation" },
  { code: 0xB0, name: "OK", group: "Navigation" },
  { code: 0xB4, name: "Home", group: "Navigation" },
  { code: 0xB3, name: "Back", group: "Navigation" },
  { code: 0xB5, name: "Menu", group: "Navigation" },
  { code: 0xB6, name: "Volume Up", group: "Volume & Channel" },
  { code: 0xB9, name: "Volume Down", group: "Volume & Channel" },
  { code: 0xB8, name: "Mute", group: "Volume & Channel" },
  { code: 0xB7, name: "Channel Up", group: "Volume & Channel" },
  { code: 0xBA, name: "Channel Down", group: "Volume & Channel" },
  { code: 0xBB, name: "Rewind", group: "Transport" },
  { code: 0xBC, name: "Pause", group: "Transport" },
  { code: 0xBD, name: "Forward", group: "Transport" },
  { code: 0xBE, name: "Red", group: "Colour" },
  { code: 0xBF, name: "Green", group: "Colour" },
  { code: 0xC0, name: "Yellow", group: "Colour" },
  { code: 0xC1, name: "Blue", group: "Colour" },
];

// X2-only extended keys (codes below 0xAE).
const X2_EXTRA_BUTTON_CATALOG: ButtonCatalogEntry[] = [
  { code: 0x99, name: "A", group: "Extra" },
  { code: 0x98, name: "B", group: "Extra" },
  { code: 0x97, name: "C", group: "Extra" },
  { code: 0x9A, name: "Exit", group: "Extra" },
  { code: 0x9B, name: "DVR", group: "Extra" },
  { code: 0x9C, name: "Play", group: "Extra" },
  { code: 0x9D, name: "Guide", group: "Extra" },
];

const BUTTON_NAME_BY_CODE = new Map<number, string>(
  [...SHARED_BUTTON_CATALOG, ...X2_EXTRA_BUTTON_CATALOG].map((entry) => [entry.code, entry.name]),
);

/**
 * Bindable physical buttons for the bundle's hub model. X2 adds seven
 * extended keys (A / B / C / Exit / DVR / Play / Guide) on top of the
 * shared set; X1 / X1S expose the shared set only. Catalog order.
 */
export function bundleButtonCatalog(bundle: BackupBundlePayload | null): ButtonCatalogEntry[] {
  if (normalizeHubVersion(bundle?.hub?.version) === "X2") {
    return [...SHARED_BUTTON_CATALOG, ...X2_EXTRA_BUTTON_CATALOG];
  }
  return [...SHARED_BUTTON_CATALOG];
}

/** Resolve a button code to its display name, falling back to a hex label. */
export function buttonName(code: number): string {
  return BUTTON_NAME_BY_CODE.get(Number(code)) ?? `Button 0x${Number(code).toString(16).toUpperCase()}`;
}

export interface BackupButtonBindingItem {
  buttonId: number;
  buttonName: string;
  /** Target device for the short press (activity-level bindings only). */
  deviceId?: number;
  commandId: number;
  /** Activity binding whose target is one of the activity's own macros. */
  isMacroTarget?: boolean;
  /** "<device> · <command>" for activities, "<command>" for devices. */
  shortPressLabel: string;
  longPress?: {
    deviceId?: number;
    commandId: number;
    isMacroTarget?: boolean;
    label: string;
  };
}

function deviceNameFor(bundle: BackupBundlePayload | null, deviceId: number): string {
  const device = (bundle?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  return String(device?.device?.name || "").trim() || `Device ${Number(deviceId)}`;
}

function commandNameOrFallback(bundle: BackupBundlePayload, deviceId: number, commandId: number): string {
  return commandLabelFor(bundle, deviceId, commandId) || `Command ${Number(commandId)}`;
}

/** Display name of one of an activity's own macros (for macro-bound buttons). */
function activityMacroName(bundle: BackupBundlePayload | null, activityId: number, buttonId: number): string {
  const activity = (bundle?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const macro = (activity?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  return String(macro?.name || "").trim() || `Macro ${Number(buttonId)}`;
}

/**
 * Label for an activity button-binding target. A binding whose target
 * `device_id` equals the activity's own id is a MACRO binding: `command_id`
 * is the macro's `button_id` (mirrors the hub keymap, where device_id=activity
 * and command_id=macro key). Otherwise it's a command on a source device.
 */
function activityBindingTargetLabel(
  bundle: BackupBundlePayload,
  activityId: number,
  targetDeviceId: number,
  targetCommandId: number,
): string {
  if (targetDeviceId === Number(activityId)) {
    return `Macro · ${activityMacroName(bundle, activityId, targetCommandId)}`;
  }
  return `${deviceNameFor(bundle, targetDeviceId)} · ${commandNameOrFallback(bundle, targetDeviceId, targetCommandId)}`;
}

function sortBindingsByButtonId(rows: BackupBundleButtonBinding[] | null | undefined): BackupBundleButtonBinding[] {
  return [...(rows ?? [])].sort((left, right) => Number(left?.button_id || 0) - Number(right?.button_id || 0));
}

/** Configured activity button bindings, sorted by button id, with labels. */
export function activityButtonBindingItems(
  bundle: BackupBundlePayload | null,
  activityId: number,
): BackupButtonBindingItem[] {
  if (!bundle) return [];
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  if (!activity) return [];
  const items: BackupButtonBindingItem[] = [];
  for (const row of sortBindingsByButtonId(activity.button_bindings)) {
    const buttonId = Number(row?.button_id || 0);
    const deviceId = Number(row?.device_id || 0);
    const commandId = Number(row?.command_id || 0);
    if (buttonId <= 0 || deviceId <= 0) continue;
    const item: BackupButtonBindingItem = {
      buttonId,
      buttonName: buttonName(buttonId),
      deviceId,
      commandId,
      isMacroTarget: deviceId === Number(activityId),
      shortPressLabel: activityBindingTargetLabel(bundle, Number(activityId), deviceId, commandId),
    };
    const lpDeviceId = Number(row?.long_press_device_id || 0);
    const lpCommandId = Number(row?.long_press_command_id || 0);
    if (lpDeviceId > 0 && lpCommandId > 0) {
      item.longPress = {
        deviceId: lpDeviceId,
        commandId: lpCommandId,
        isMacroTarget: lpDeviceId === Number(activityId),
        label: activityBindingTargetLabel(bundle, Number(activityId), lpDeviceId, lpCommandId),
      };
    }
    items.push(item);
  }
  return items;
}

/** Configured device button bindings (bound to the device's own commands). */
export function deviceButtonBindingItems(
  bundle: BackupBundlePayload | null,
  deviceId: number,
): BackupButtonBindingItem[] {
  if (!bundle) return [];
  const normalizedDeviceId = Number(deviceId);
  const device = (bundle.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === normalizedDeviceId);
  if (!device) return [];
  const items: BackupButtonBindingItem[] = [];
  for (const row of sortBindingsByButtonId(device.button_bindings)) {
    const buttonId = Number(row?.button_id || 0);
    const commandId = Number(row?.command_id || 0);
    if (buttonId <= 0 || commandId <= 0) continue;
    const item: BackupButtonBindingItem = {
      buttonId,
      buttonName: buttonName(buttonId),
      commandId,
      shortPressLabel: commandNameOrFallback(bundle, normalizedDeviceId, commandId),
    };
    const lpCommandId = Number(row?.long_press_command_id || 0);
    if (lpCommandId > 0) {
      item.longPress = {
        commandId: lpCommandId,
        label: commandNameOrFallback(bundle, normalizedDeviceId, lpCommandId),
      };
    }
    items.push(item);
  }
  return items;
}

function boundButtonIds(rows: BackupBundleButtonBinding[] | null | undefined): Set<number> {
  return new Set((rows ?? []).map((row) => Number(row?.button_id || 0)).filter((id) => id > 0));
}

/** Catalog buttons not yet bound on an Activity (for the Add-binding picker). */
export function unboundButtonsForActivity(
  bundle: BackupBundlePayload | null,
  activityId: number,
): ButtonCatalogEntry[] {
  const activity = (bundle?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const used = boundButtonIds(activity?.button_bindings);
  return bundleButtonCatalog(bundle).filter((entry) => !used.has(entry.code));
}

/** Catalog buttons not yet bound on a Device (for the Add-binding picker). */
export function unboundButtonsForDevice(
  bundle: BackupBundlePayload | null,
  deviceId: number,
): ButtonCatalogEntry[] {
  const device = (bundle?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  const used = boundButtonIds(device?.button_bindings);
  return bundleButtonCatalog(bundle).filter((entry) => !used.has(entry.code));
}

function upsertBindingRow(
  rows: BackupBundleButtonBinding[] | null | undefined,
  row: BackupBundleButtonBinding,
): BackupBundleButtonBinding[] {
  const buttonId = Number(row.button_id || 0);
  const next = (rows ?? []).filter((entry) => Number(entry?.button_id || 0) !== buttonId);
  next.push(row);
  return sortBindingsByButtonId(next);
}

export interface ActivityBindingInput {
  buttonId: number;
  deviceId: number;
  commandId: number;
  longPress?: { deviceId: number; commandId: number } | null;
}

/**
 * Add or replace (by button id) an Activity button binding. No-op when the
 * button, target device, or command id is missing. A long press is written
 * only when both its device and command are present.
 */
export function upsertActivityButtonBinding(
  bundle: BackupBundlePayload,
  activityId: number,
  input: ActivityBindingInput,
): BackupBundlePayload {
  const buttonId = Number(input.buttonId);
  const deviceId = Number(input.deviceId);
  const commandId = Number(input.commandId);
  if (buttonId <= 0 || deviceId <= 0 || commandId <= 0) return bundle;
  const row: BackupBundleButtonBinding = {
    button_id: buttonId,
    button_name: buttonName(buttonId),
    device_id: deviceId,
    command_id: commandId,
  };
  const lpDeviceId = Number(input.longPress?.deviceId || 0);
  const lpCommandId = Number(input.longPress?.commandId || 0);
  if (lpDeviceId > 0 && lpCommandId > 0) {
    row.long_press_device_id = lpDeviceId;
    row.long_press_command_id = lpCommandId;
  }
  const next = updateActivity(bundle, activityId, (activity) => ({
    ...activity,
    button_bindings: upsertBindingRow(activity.button_bindings, row),
  }));
  return reconcileActivityMembershipChange(bundle, next, Number(activityId));
}

export interface DeviceBindingInput {
  buttonId: number;
  commandId: number;
  longPressCommandId?: number | null;
}

/** Add or replace (by button id) a Device button binding (own commands). */
export function upsertDeviceButtonBinding(
  bundle: BackupBundlePayload,
  deviceId: number,
  input: DeviceBindingInput,
): BackupBundlePayload {
  const normalizedDeviceId = Number(deviceId);
  const buttonId = Number(input.buttonId);
  const commandId = Number(input.commandId);
  if (buttonId <= 0 || commandId <= 0) return bundle;
  const row: BackupBundleButtonBinding = {
    button_id: buttonId,
    button_name: buttonName(buttonId),
    command_id: commandId,
    command_name: commandLabelFor(bundle, normalizedDeviceId, commandId) || undefined,
  };
  const lpCommandId = Number(input.longPressCommandId || 0);
  if (lpCommandId > 0) row.long_press_command_id = lpCommandId;
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return { ...device, button_bindings: upsertBindingRow(device.button_bindings, row) };
    }),
  };
}

/** Remove an Activity button binding by button id. */
export function deleteActivityButtonBinding(
  bundle: BackupBundlePayload,
  activityId: number,
  buttonId: number,
): BackupBundlePayload {
  const bId = Number(buttonId);
  const next = updateActivity(bundle, activityId, (activity) => ({
    ...activity,
    button_bindings: (activity.button_bindings ?? []).filter((row) => Number(row?.button_id || 0) !== bId),
  }));
  return reconcileActivityMembershipChange(bundle, next, Number(activityId));
}

/** Remove a Device button binding by button id. */
export function deleteDeviceButtonBinding(
  bundle: BackupBundlePayload,
  deviceId: number,
  buttonId: number,
): BackupBundlePayload {
  const dId = Number(deviceId);
  const bId = Number(buttonId);
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== dId) return device;
      return {
        ...device,
        button_bindings: (device.button_bindings ?? []).filter((row) => Number(row?.button_id || 0) !== bId),
      };
    }),
  };
}

// ── Role-based button assignment ─────────────────────────────────────
//
// The narrative editor's "Buttons on the remote" section asks
// four questions ("Volume buttons control …") instead of ~20 per-button
// dialogs. Each answer fans out to individual KeyToKey binding rows,
// copied from the target device's DEVICE-MODE bindings — cloud-sourced
// devices ship with those, so no label heuristics are needed. Reading an
// existing configuration back is lossy by design: a group that doesn't
// match any clean assignment reports "customized" / "custom" rather
// than pretending.

export type ActivityRoleGroupId = "volume" | "navigation" | "playback" | "channels";

export const ACTIVITY_ROLE_GROUPS: ActivityRoleGroupId[] = [
  "volume",
  "navigation",
  "playback",
  "channels",
];

// Role groups cover the shared X1/X1S/X2 buttons plus the X2-only Play
// key; colour buttons and the remaining X2 extras (A/B/C/Exit/DVR/Guide)
// are one-off assignments and live only in the per-button view.
const ROLE_GROUP_BUTTON_IDS: Record<ActivityRoleGroupId, number[]> = {
  volume: [0xB6, 0xB9, 0xB8],
  navigation: [0xAE, 0xB2, 0xAF, 0xB1, 0xB0, 0xB3, 0xB4, 0xB5],
  playback: [0x9C, 0xBC, 0xBB, 0xBD],
  channels: [0xB7, 0xBA],
};

/** A role group's buttons on the bundle's hub model, catalog-filtered. */
function roleGroupButtons(bundle: BackupBundlePayload | null, group: ActivityRoleGroupId): number[] {
  const catalog = new Set(bundleButtonCatalog(bundle).map((entry) => entry.code));
  return ROLE_GROUP_BUTTON_IDS[group].filter((code) => catalog.has(code));
}

/** A device's device-mode bindings for a role group's buttons, by button id. */
function deviceRoleBindings(
  bundle: BackupBundlePayload | null,
  deviceId: number,
  group: ActivityRoleGroupId,
): Map<number, BackupBundleButtonBinding> {
  const device = findDevice(bundle, Number(deviceId));
  const groupIds = new Set(roleGroupButtons(bundle, group));
  const byButton = new Map<number, BackupBundleButtonBinding>();
  for (const row of device?.button_bindings ?? []) {
    const buttonId = Number(row?.button_id || 0);
    if (groupIds.has(buttonId) && Number(row?.command_id || 0) > 0) byButton.set(buttonId, row);
  }
  return byButton;
}

/** How many of a group's buttons `deviceId`'s device-mode map covers. */
export function roleMappableButtonCount(
  bundle: BackupBundlePayload | null,
  deviceId: number,
  group: ActivityRoleGroupId,
): number {
  return deviceRoleBindings(bundle, deviceId, group).size;
}

export type ActivityRoleState = "device" | "customized" | "custom" | "unused";

export interface ActivityRoleAssignment {
  group: ActivityRoleGroupId;
  /**
   * "device"     — every bound group button matches `deviceId`'s device-mode
   *                mapping exactly (incl. long press), and nothing extra.
   * "customized" — one target device, but commands/coverage diverge from
   *                its device-mode mapping.
   * "custom"     — mixed target devices, or a macro-bound button.
   * "unused"     — no group button is bound.
   */
  state: ActivityRoleState;
  deviceId: number | null;
  deviceName: string | null;
  /** Group buttons bound in this activity. */
  boundCount: number;
  /** Group buttons that exist on this hub model. */
  totalCount: number;
}

/** Classify each role group's current binding state for one Activity. */
export function activityRoleAssignments(
  bundle: BackupBundlePayload | null,
  activityId: number,
): ActivityRoleAssignment[] {
  const activity = findBundleActivity(bundle, activityId);
  return ACTIVITY_ROLE_GROUPS.map((group) => {
    const buttons = roleGroupButtons(bundle, group);
    const totalCount = buttons.length;
    const groupSet = new Set(buttons);
    const bound = (activity?.button_bindings ?? []).filter(
      (row) => groupSet.has(Number(row?.button_id || 0)) && Number(row?.device_id || 0) > 0,
    );
    const unused: ActivityRoleAssignment = {
      group, state: "unused", deviceId: null, deviceName: null, boundCount: 0, totalCount,
    };
    if (!bundle || !activity || bound.length === 0) return unused;
    const selfId = Number(activity.device?.device_id || 0);
    const targetIds = new Set<number>();
    for (const row of bound) {
      targetIds.add(Number(row?.device_id || 0));
      const lpDeviceId = Number(row?.long_press_device_id || 0);
      if (lpDeviceId > 0) targetIds.add(lpDeviceId);
    }
    const [only] = [...targetIds];
    if (targetIds.size !== 1 || only === selfId) {
      return { group, state: "custom", deviceId: null, deviceName: null, boundCount: bound.length, totalCount };
    }
    const mapped = deviceRoleBindings(bundle, only, group);
    const exact = bound.length === mapped.size && bound.every((row) => {
      const ref = mapped.get(Number(row?.button_id || 0));
      if (!ref) return false;
      if (Number(row?.command_id || 0) !== Number(ref?.command_id || 0)) return false;
      const rowLp = Number(row?.long_press_command_id || 0);
      const refLp = Number(ref?.long_press_command_id || 0);
      if (rowLp !== refLp) return false;
      return rowLp === 0 || Number(row?.long_press_device_id || 0) === only;
    });
    return {
      group,
      state: exact ? "device" : "customized",
      deviceId: only,
      deviceName: deviceNameFor(bundle, only),
      boundCount: bound.length,
      totalCount,
    } satisfies ActivityRoleAssignment;
  });
}

/**
 * Point a role group at a device: clear the group's activity bindings,
 * then copy the device's device-mode bindings for every group button it
 * covers (long-press targets ride along). `null` clears the group
 * ("Not used"). Other groups' bindings are untouched; membership is
 * reconciled afterwards, so a newly-referenced device joins the activity.
 */
export function setActivityRoleDevice(
  bundle: BackupBundlePayload,
  activityId: number,
  group: ActivityRoleGroupId,
  deviceId: number | null,
): BackupBundlePayload {
  const aId = Number(activityId);
  const buttons = roleGroupButtons(bundle, group);
  const groupSet = new Set(buttons);
  const mapped = deviceId != null && Number(deviceId) > 0
    ? deviceRoleBindings(bundle, Number(deviceId), group)
    : null;
  const next = updateActivity(bundle, aId, (activity) => {
    let rows = (activity.button_bindings ?? []).filter(
      (row) => !groupSet.has(Number(row?.button_id || 0)),
    );
    if (mapped) {
      const dId = Number(deviceId);
      for (const buttonId of buttons) {
        const ref = mapped.get(buttonId);
        if (!ref) continue;
        const row: BackupBundleButtonBinding = {
          button_id: buttonId,
          button_name: buttonName(buttonId),
          device_id: dId,
          command_id: Number(ref.command_id),
        };
        const lpCommandId = Number(ref?.long_press_command_id || 0);
        if (lpCommandId > 0) {
          row.long_press_device_id = dId;
          row.long_press_command_id = lpCommandId;
        }
        rows = upsertBindingRow(rows, row);
      }
    }
    return { ...activity, button_bindings: rows };
  });
  return reconcileActivityMembershipChange(bundle, next, aId);
}


/** Device options for the edit overview. */
export function bundleEditableDeviceOptions(bundle: BackupBundlePayload | null): BackupSelectionOption[] {
  return bundleDeviceOptions(bundle);
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
