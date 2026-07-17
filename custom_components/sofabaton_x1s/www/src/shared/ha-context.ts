export type TabId = "settings" | "wifi_commands" | "backup" | "cache" | "logs";
export type SectionId = "activities" | "devices";
export type BackupSectionId = "make" | "edit" | "restore";
export type SettingKey =
  | "persistent_cache"
  | "hex_logging_enabled"
  | "proxy_enabled"
  | "wifi_device_enabled";
export type HubAction = "find_remote" | "sync_remote";
export type RefreshKind = "activity" | "device";

export interface HassEntityState {
  state?: string;
  attributes?: Record<string, unknown>;
}

export interface HassConnectionLike {
  subscribeMessage<T>(
    callback: (message: T) => void,
    message: Record<string, unknown>,
  ): Promise<() => void>;
}

export interface HassLike {
  states: Record<string, HassEntityState>;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
  callService?(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
  ): Promise<unknown>;
  connection?: HassConnectionLike | null;
}

export interface ControlPanelHubState {
  entry_id: string;
  name?: string;
  version?: string;
  firmware_version?: number | string | null;
  ip_address?: string;
  activity_count?: number;
  device_count?: number;
  proxy_client_connected?: boolean;
  settings?: Partial<Record<Exclude<SettingKey, "persistent_cache">, boolean>>;
  activities?: Array<{ id: number; name?: string; sort?: number; favorite_count?: number; macro_count?: number }>;
  devices_list?: Array<{
    id: number;
    name?: string;
    sort?: number;
    command_count?: number;
    device_class?: string;
    device_class_code?: number;
  }>;
  buttons?: Record<string, number[]>;
  commands?: Record<string, Record<string, string>>;
  activity_favorites?: Record<
    string,
    Array<{ button_id: number; command_id: number; device_id: number; label?: string }>
  >;
  activity_macros?: Record<
    string,
    Array<{ command_id: number; name?: string; label?: string }>
  >;
  active_backup_operation?: BackupProgressEvent | null;
  runtime_state?: ControlPanelRuntimeState | null;
}

export interface ControlPanelStateResponse {
  persistent_cache_enabled: boolean;
  tools_frontend_version: string;
  hubs: ControlPanelHubState[];
}

export interface ControlPanelRuntimeState {
  kind: "idle" | "app_connected" | "operation_running";
  operation?: "wifi_deploy" | "backup_export" | "backup_restore" | "cache_refresh" | "entity_sync" | null;
  label?: string | null;
  detail?: string | null;
  current_step?: number | null;
  total_steps?: number | null;
  device_key?: string | null;
  device_name?: string | null;
}

export interface CacheHubState {
  entry_id: string;
  name?: string;
  activities?: Array<{ id: number; name?: string; sort?: number; favorite_count?: number; macro_count?: number }>;
  devices_list?: Array<{
    id: number;
    name?: string;
    sort?: number;
    command_count?: number;
    device_class?: string;
    device_class_code?: number;
  }>;
  buttons?: Record<string, number[]>;
  commands?: Record<string, Record<string, string>>;
  activity_favorites?: Record<
    string,
    Array<{ button_id: number; command_id: number; device_id: number; label?: string }>
  >;
  activity_macros?: Record<
    string,
    Array<{ command_id: number; name?: string; label?: string }>
  >;
}

export interface CacheContentsResponse {
  enabled: boolean;
  hubs: CacheHubState[];
}

export interface ControlPanelLogLine {
  ts?: string;
  time?: string;
  timestamp?: string;
  level?: string;
  message?: string;
  msg?: string;
  line?: string;
  logger?: string;
  entry_id?: string;
}

export interface LogsResponse {
  lines: ControlPanelLogLine[];
}

/**
 * Structural view of a virtual-device command blob (wifi_ip, wifi_roku,
 * wifi_hue, wifi_sonos). Populated by the hub when the device class is
 * decodable and the decoder's round-trip verifier passes; null otherwise.
 *
 * The Fetch Blob view uses this as the "Descriptor" mode for these
 * classes, the same way the existing toggle works for X2 descriptive
 * IR payloads (which surface as `parsed_blob`). For the structural
 * classes the rendered descriptor text already lives in `parsed_blob`
 * — this field exposes the raw structured fields for editor surfaces
 * downstream.
 */
export interface BlobFetchDecodedBlock {
  class: string;
  trailer_hex: string;
  fields: Record<string, unknown>;
}

export interface BlobFetchCommandResult {
  command_label?: string | null;
  device_id: number;
  command_id?: number | null;
  device_class?: string | null;
  blob_kind?: string | null;
  command_blob?: string | null;
  parsed_blob?: string | null;
  decoded?: BlobFetchDecodedBlock | null;
  replay_tail_checksum?: number | null;
  command_checksum?: number | null;
}

export interface BlobFetchResponse {
  device_id: number;
  requested_command_id?: number | null;
  total_commands?: number | null;
  received_command_count?: number | null;
  complete?: boolean;
  commands: BlobFetchCommandResult[];
}

export interface BlobPlayResponse {
  ok: boolean;
}

export interface BackupBundleDeviceBlock {
  device_id: number;
  name?: string | null;
  brand?: string | null;
  device_class?: string | null;
  device_class_code?: number | null;
  entity_type?: string | null;
  // Byte 6 of the wire device record. The hub uses this as the display
  // order in the app / on the physical remote (within a list of devices
  // and within the activity-device list). Lower value sorts first.
  sort?: number | null;
  // Dotted-decimal IPv4 address stored in the device head's tail slot.
  // Populated for the network-IP device classes (wifi_hue / wifi_roku /
  // wifi_sonos rely on this for Host headers and replay addressing);
  // null / empty for non-network devices. wifi_ip carries its IP inside
  // each command blob instead, not here.
  ip_address?: string | null;
  // Automatic-power / idle-behavior mode byte (the hub's 0x0242 reply).
  // One byte encodes the whole "Power On/Off Setup" + "Idle Behavior"
  // story. Lives in its own hub query, captured/restored separately from
  // the device record. Absent on backups that predate idle-behavior
  // capture, which fall back to `power_mode`.
  idle_behavior?: number | null;
  // Legacy device-record power byte; retained for fallback on older
  // backups that lack `idle_behavior`.
  power_mode?: number | null;
}

export interface BackupBundleDevicePayload {
  kind?: string | null;
  complete?: boolean;
  device?: BackupBundleDeviceBlock | null;
  commands?: BackupBundleCommandRow[] | null;
  button_bindings?: BackupBundleButtonBinding[] | null;
  // The device's own macros (incl. its power-on/off at button 198/199).
  // Steps carry no device_id — they play this device's own commands.
  macros?: BackupBundleMacroRow[] | null;
  // The device's input list (TV inputs etc.). Activity power-on macros
  // reference these by 1-based ordinal (input_index) via a 0xC5 step.
  input_record?: BackupBundleInputRecord | null;
}

export interface BackupBundleInputEntry {
  command_id?: number | null;
  // Synthetic command code; restore falls back to 0x4E20 + command_id.
  fid?: number | null;
  // 1-based ordinal an activity power-on 0xC5 step points at.
  input_index?: number | null;
  ordinal?: number | null;
  name?: string | null;
  label?: string | null;
}

export interface BackupBundleInputRecord {
  entries?: BackupBundleInputEntry[] | null;
  // control_keys / favorites / flags / state_byte are preserved opaquely.
  [key: string]: unknown;
}

// A physical-button binding. At the device level a binding plays one of
// the device's own commands (no `device_id`; long-press is same-device).
// At the activity level it targets a command on some source device, so it
// carries `device_id` (and `long_press_device_id` for the long press).
export interface BackupBundleButtonBinding {
  button_id?: number | null;
  button_name?: string | null;
  device_id?: number | null;
  command_id?: number | null;
  command_name?: string | null;
  long_press_device_id?: number | null;
  long_press_command_id?: number | null;
}

export interface BackupBundleCommandRow {
  command_id?: number | null;
  name?: string | null;
  restore_data?: Record<string, unknown> | null;
}

export interface BackupBundleFavoriteSlot {
  button_id?: number | null;
  device_id?: number | null;
  command_id?: number | null;
  name?: string | null;
}

export interface BackupBundleMacroStep {
  device_id?: number | null;
  command_id?: number | null;
  button_code?: number | null;
  duration?: number | null;
  delay?: number | null;
}

export interface BackupBundleMacroRow {
  button_id?: number | null;
  name?: string | null;
  steps?: BackupBundleMacroStep[] | null;
}

export interface BackupBundleActivityPayload {
  kind?: string | null;
  complete?: boolean;
  device?: BackupBundleDeviceBlock | null;
  referenced_source_device_ids?: number[] | null;
  favorite_slots?: BackupBundleFavoriteSlot[] | null;
  macros?: BackupBundleMacroRow[] | null;
  button_bindings?: BackupBundleButtonBinding[] | null;
  /** Quick-access display order: hub ids (favorite fav_ids / macro key ids,
   * one shared namespace) in family-0x61 slot order. An advisory ordering
   * hint, never an identity — a reorder rewrites this slot table WITHOUT
   * renumbering button_ids. Absent on older bundles → button_id order. */
  favorites_order?: number[] | null;
}

export interface BackupBundlePayload {
  kind: string;
  schema_version: number;
  captured_at?: string | null;
  complete?: boolean | null;
  /** "full_backup" (payload-bearing, restorable) or "structural" (blob-free
   * cache bundle, never restorable). Absent on legacy files == full_backup. */
  payload_profile?: string | null;
  hub?: {
    entry_id?: string | null;
    name?: string | null;
    version?: string | null;
  } | null;
  devices: BackupBundleDevicePayload[];
  activities: BackupBundleActivityPayload[];
}

export const BACKUP_BUNDLE_SCHEMA_VERSION = 5;

export interface BackupOperationStartResponse {
  operation_id: string;
}

export interface BackupRestoreResult {
  status: string;
  failed_at?: [string, number | null] | null;
  device_id_map?: Record<string, number> | null;
  restored_devices?: Array<Record<string, unknown>> | null;
  restored_activities?: Array<Record<string, unknown>> | null;
}

export interface BackupProgressEvent {
  operation_id: string;
  kind: string;
  entry_id: string;
  status: string;
  phase?: string | null;
  mode?: string | null;
  message?: string | null;
  completed_steps?: number | null;
  total_steps?: number | null;
  current_device_id?: number | null;
  current_activity_id?: number | null;
  // Activity-sync surfaces the failed plan step here (string kind + target);
  // distinct from BackupRestoreResult.failed_at (a [phase, index] tuple).
  failed_at?: string | null;
  filename?: string | null;
  backup?: BackupBundlePayload | null;
  backup_downloaded?: boolean | null;
  backup_expired?: boolean | null;
  result?: BackupRestoreResult | null;
  error?: string | null;
}

export interface BackupOperationStateResponse {
  backup_export?: BackupProgressEvent | null;
  backup_restore?: BackupProgressEvent | null;
  activity_sync?: BackupProgressEvent | null;
  device_sync?: BackupProgressEvent | null;
  active_operation?: BackupProgressEvent | null;
}

export interface RuntimeCompletionNotice {
  tone: "success" | "error";
  label: string;
}

export interface WifiPressEvent {
  entryId: string;
  deviceId: number | null;
  deviceName: string | null;
  commandIndex: number | null;
  commandLabel: string;
  pressType: "short" | "long";
  timestamp: number;
  receivedAt: number;
}

/** A hub-level event firing (activity transition or redundant OFF press),
 *  pushed live to drive the row glow in the Events tab. An
 *  `activity_change` frame carries the full transition so one event can
 *  light every affected row (global rows + per-activity start/stop). */
export interface HubEventFireEvent {
  entryId: string;
  type: "activity_change" | "redundant_off";
  fromActivityId: number | null;
  toActivityId: number | null;
  timestamp: number;
  receivedAt: number;
}

export interface ControlPanelSnapshot {
  hass: HassLike | null;
  state: ControlPanelStateResponse | null;
  contents: CacheContentsResponse | null;
  toolsFrontendVersionLoaded: string;
  toolsFrontendVersionExpected: string | null;
  toolsFrontendVersionMismatch: boolean;
  loading: boolean;
  loadError: string | null;
  backendUnavailable: boolean;
  selectedHubEntryId: string | null;
  selectedTab: TabId;
  selectedCacheSection: SectionId;
  selectedBackupSection: BackupSectionId;
  openEntity: string | null;
  staleData: boolean;
  // Long-running/busy UI state is keyed by hub entry_id so an operation on
  // one hub never surfaces in the dock (or locks the UI) while another hub
  // is selected. Key presence = busy; the value is the display label
  // (refresh entries use null for a label-less section refresh).
  refreshBusyByHub: Record<string, string | null>;
  externalHubCommandByHub: Record<string, string>;
  runtimeCompletionNoticeByHub: Record<string, RuntimeCompletionNotice>;
  pendingSettingKey: SettingKey | null;
  pendingActionKey: HubAction | null;
  logsLines: ControlPanelLogLine[];
  logsError: string | null;
  logsLoading: boolean;
  logsLoadedEntryId: string | null;
  logsSubscribedEntryId: string | null;
  logsStickToBottom: boolean;
  logsScrollBehavior: ScrollBehavior;
  pendingScrollEntityKey: string | null;
  lastWifiPress: WifiPressEvent | null;
  wifiPressSubscribedEntryId: string | null;
  lastHubEvent: HubEventFireEvent | null;
  hubEventsSubscribedEntryId: string | null;
}
