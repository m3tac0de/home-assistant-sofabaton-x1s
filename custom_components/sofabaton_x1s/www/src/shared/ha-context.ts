export type TabId = "settings" | "wifi_commands" | "blobs" | "cache" | "logs";
export type SectionId = "activities" | "devices";
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
  activities?: Array<{ id: number; name?: string; favorite_count?: number; macro_count?: number }>;
  devices_list?: Array<{
    id: number;
    name?: string;
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

export interface ControlPanelStateResponse {
  persistent_cache_enabled: boolean;
  tools_frontend_version: string;
  hubs: ControlPanelHubState[];
}

export interface CacheHubState {
  entry_id: string;
  name?: string;
  activities?: Array<{ id: number; name?: string; favorite_count?: number; macro_count?: number }>;
  devices_list?: Array<{
    id: number;
    name?: string;
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

export interface BlobFetchCommandResult {
  command_label?: string | null;
  device_id: number;
  command_id?: number | null;
  device_class?: string | null;
  blob_kind?: string | null;
  command_blob?: string | null;
  parsed_blob?: string | null;
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

export interface BlobPersistResponse {
  status: string;
  device_id: number;
  command_id: number;
  command_name: string;
  page_count?: number | null;
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
  openSection: SectionId | null;
  openEntity: string | null;
  staleData: boolean;
  refreshBusy: boolean;
  activeRefreshLabel: string | null;
  externalHubCommandBusy: boolean;
  externalHubCommandLabel: string | null;
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
}
