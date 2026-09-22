// The control panel's API client (docs/internal/server-panel-plan.md,
// section 4): one place that knows the server's base URL, builds
// requests, and reads the Problem body every failure carries. Everything
// is injectable (fetch) so the node tests run it without a browser.

import { SERVER_API_PREFIX } from "../../remote-card/src/backend/server-backend";
import { serverBaseFromPageUrl } from "../../remote-card/src/remote-web-config";

export interface RunningActivity {
  activity_id: number;
  name?: string | null;
}

/** `GET /hubs/{id}/info`: identity from the connect banner; `known` false until read. */
export interface HubInfo {
  known: boolean;
  model: string | null;
  name: string | null;
  mac: string | null;
  firmware_version: number | null;
  production_batch: string | null;
}

export interface HubStatus {
  hub_connected: boolean;
  app_connected: boolean;
  controllable: boolean;
  mode: "disconnected" | "observe" | "control" | string;
  hub_version: string | null;
  proxy_enabled: boolean;
  running_activity: RunningActivity | null;
  activities_cached: number;
  devices_cached: number;
  catalog_ready: boolean;
}

export interface HubConfig {
  host: string;
  name?: string | null;
  hub_version?: string | null;
  mac?: string | null;
  [key: string]: unknown;
}

/** One row of `GET /hubs` (openapi `HubView`). `active_job` is the job
 *  queued or running on the hub now, `last_job` the newest finished one
 *  (server panel state plan, decision 1); older fixtures may omit them. */
export interface HubView {
  hub_id: string;
  enabled: boolean;
  config: HubConfig;
  added_at: string;
  last_seen: string | null;
  status: HubStatus | null;
  active_job?: JobView | null;
  last_job?: JobView | null;
  /** The hub's own name from its banner; shown when no name was configured. */
  hub_name?: string | null;
}

/** One row of `GET /discovery/hubs` (openapi `SeenHub`). */
export interface SeenHub {
  key: string;
  config: HubConfig;
  first_seen: string;
  last_seen: string;
  present: boolean;
  registered_hub_id: string | null;
}

/** The error body every route answers with (RFC 9457 shape). */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string | null;
  hub_id?: string | null;
  mode?: string | null;
}

/** `GET /server/callback-listener` (openapi `CallbackListener`), also embedded in `ServerInfo`. */
export interface CallbackListener {
  wanted?: boolean;
  bound?: boolean;
  bound_port?: number | null;
  [key: string]: unknown;
}

export interface ServerInfo {
  version: string;
  library_version: string;
  api_version: string;
  instance_id?: string;
  hubs?: number;
  callback_listener?: CallbackListener;
  [key: string]: unknown;
}

/** One command slot of a Wifi Device's spec (openapi `CallbackSlot`). */
export interface WifiSlot {
  label: string;
  long_label?: string | null;
  /** A favorite in each of `activities`. */
  favorite?: boolean;
  /** The hub button code bound to this command in each of `activities`. */
  button?: number | null;
  /** Also bind the slot's long record to that button's long press. */
  long_press?: boolean;
  activities?: number[];
  /** The activity whose start performs this command (X1S, X2). */
  input_activity_id?: number | null;
}

/** A Wifi Device's spec: what `POST` and `PUT /wifi-devices` take, whole (openapi `WifiDeviceRequest`). Hook slots are 1-based. */
export interface WifiDeviceSpec {
  name: string;
  slots: WifiSlot[];
  power_on_slot: number | null;
  power_off_slot: number | null;
  input_slots: number[];
  brand?: string;
}

/** One managed Wifi Device as the server keeps it (openapi `CallbackDeviceView`). */
export interface WifiDeviceView {
  key: string;
  transport: string;
  device_id: number | null;
  spec: WifiDeviceSpec;
  /** The address the device calls; null for an mqtt device, which calls nothing. */
  target: { host: string; port: number; action_id: string } | null;
  /** An mqtt device's press topic on the broker, `<MAC>/up`. */
  mqtt_topic?: string | null;
  labels: Record<string, string>;
  hub_version: string;
  deployed_at: string | null;
  adopted: boolean;
  stale: boolean;
  deployed: boolean;
  pending?: { op: string; started_at: string } | null;
  last_press?: { seq: number; received_at: string } | null;
  effective_destination?: { host: string; port: number } | null;
}

/** `GET /hubs/{id}/wifi-devices` (openapi `WifiDeviceList`). */
export interface WifiDeviceList {
  devices: WifiDeviceView[];
  max_devices: number;
  /** How a press can reach the server; a chooser appears once there is more than one. */
  transports: string[];
  effective_destination?: { host: string; port: number } | null;
}

/** `GET /server/mqtt` (openapi `MqttView`): the server's broker connection. The broker is set on the
 *  server's command line or in its environment only; the password is in no answer. */
export interface MqttState {
  configured: boolean;
  /** A device uses the transport; the connection exists only then. */
  wanted: boolean;
  connected: boolean;
  host: string | null;
  port: number | null;
  tls: boolean;
  username: string | null;
  topics: string[];
  last_error: string | null;
  connected_at: string | null;
  next_retry_at: string | null;
}

/** One port in `GET /server/settings` (openapi `PortSetting`). */
export interface PortSetting {
  running: number;
  configured: number;
  default: number;
  pinned: boolean;
}

export type ServerPortName = "hub_listen_port" | "app_discovery_port" | "callback_port";

/** `GET|PUT /server/settings` (openapi `ServerSettingsView`). */
export type ServerSettings = Record<ServerPortName, PortSetting> & { restart_required: boolean };

export interface RemoteCardDocument {
  hub_id: string;
  document: Record<string, unknown> | null;
  updated_at: string | null;
}

/** One operation from the OpenAPI document, as the API view lists them. */
export interface Operation {
  id: string;
  method: string;
  path: string;
  summary: string;
  hasBody: boolean;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  statusText: string;
  headers: [string, string][];
  text: string;
  /** The parsed JSON body, or null when the body is empty or not JSON. */
  body: T | null;
}

export interface RequestOptions {
  /** Query string, with or without the leading `?`. */
  query?: string;
  headers?: Record<string, string>;
  /** A JSON body; serialised and sent with `application/json`. */
  body?: unknown;
  /** A body typed by hand (the API view); sent as-is. */
  rawBody?: string;
}

export interface HubCreate {
  host: string;
  name?: string | null;
  enabled?: boolean;
  [key: string]: unknown;
}

// -- the catalog (openapi Device, Command, Activity, Button, Macro, Favorite) --

export interface Device {
  device_id: number;
  name: string;
  brand: string | null;
  device_class: string | null;
  device_class_code: number | null;
  power_state: number | null;
  idle_behavior: number | null;
  /** The hub's stored display position (0 = none); the list already comes in that order. */
  sort: number;
}

export interface Command {
  command_id: number;
  label: string;
}

export interface Activity {
  activity_id: number;
  name: string;
  active: boolean;
  needs_confirm: boolean;
  /** The hub's stored display position (0 = none); the list already comes in that order. */
  sort: number;
}

export interface Button {
  button_code: number;
  name: string | null;
  device_id: number | null;
  command_id: number | null;
  long_press_device_id?: number | null;
  long_press_command_id?: number | null;
}

export interface Macro {
  command_id: number;
  label: string | null;
}

export interface Favorite {
  device_id: number;
  command_id: number;
  label: string | null;
}

/** One entity's provenance in `GET /hubs/{id}/snapshot` (the tables ride along untyped). */
export interface SnapshotEntity {
  kind: string;
  device: { device_id: number; name?: string | null; [key: string]: unknown };
  complete: boolean;
  editable: boolean;
  fetched_at: string | null;
  [key: string]: unknown;
}

export interface SnapshotDocument {
  snapshot_id: string;
  captured_at: string;
  engine_generation: number;
  complete: boolean;
  payload_profile: string;
  devices: SnapshotEntity[];
  activities: SnapshotEntity[];
  [key: string]: unknown;
}

export interface JobProgress {
  completed_steps?: number | null;
  total_steps?: number | null;
  [key: string]: unknown;
}

/** `JobView`: what a 202 returns and what `GET /jobs/{id}` reports. */
export interface JobView {
  job_id: string;
  hub_id: string;
  kind: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled" | string;
  cancellable: boolean;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  progress: JobProgress | null;
  result: Record<string, unknown> | null;
  error: Problem | null;
}

export const TERMINAL_JOB_STATES: ReadonlySet<string> = new Set(["done", "failed", "cancelled"]);

/** One row of `GET /hubs/{id}/applies` (openapi `ApplySummary`). */
export interface ApplySummary {
  apply_id: string;
  hub_id: string;
  status: string;
  resumable: boolean;
  job_id: string | null;
  created_at: string;
  updated_at: string;
  runs?: number;
  cursor?: number;
  item_count?: number;
  writes?: number;
  [key: string]: unknown;
}

/** `POST /snapshot/refresh` body: one entity, or neither for the whole hub. */
export type RefreshScope = { device_id: number } | { activity_id: number } | Record<string, never>;

/** `GET .../commands/{cid}/payload`: the stored body and what the library could read from it. */
export interface PayloadView {
  kind: "raw" | "descriptive" | string;
  hex: string;
  descriptor: string | null;
  carrier_hz: number | null;
  /** The library's structured block for the classes it round-trips (`restore_data.decoded`'s shape); null when the body stays raw. */
  decoded: { class: string; fields: Record<string, unknown>; trailer_hex?: string } | null;
}

/** One payload in any supported source format (exactly one field), for `POST /play`. */
export type PayloadSpec = { hex: string } | { pronto: string } | { descriptor: string } | { timings_us: number[]; carrier_hz: number };

/** The base the panel derives from its own URL: the page lives at `<base>/ui/`. */
export function serverBaseFromPanelUrl(href: string): string {
  return serverBaseFromPageUrl(href, "/ui/");
}

/** A Problem body as one line (`type: detail`); anything else by status. */
export function problemText(response: ApiResponse): string {
  const body = response.body as Partial<Problem> | null;
  if (!body || typeof body !== "object") return `HTTP ${response.status}`;
  const head = body.type || body.title;
  const parts = [head, body.detail].filter((part): part is string => Boolean(part));
  return parts.join(": ") || `HTTP ${response.status}`;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PanelApi {
  readonly baseUrl: string;
  readonly apiRoot: string;
  private readonly _fetch: FetchLike;

  constructor(baseUrl: string, fetchImpl?: FetchLike) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiRoot = `${this.baseUrl}${SERVER_API_PREFIX}`;
    this._fetch = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** `path` is relative to the API root, with or without a leading slash. */
  url(path: string, query?: string): string {
    const rel = path.replace(/^\/+/, "");
    let out = `${this.apiRoot}/${rel}`;
    const q = (query ?? "").trim();
    if (q) out += q.startsWith("?") ? q : `?${q}`;
    return out;
  }

  /** The `/ui/remote/` page for a hub, next to the API root. */
  remoteUrl(hubId: string | null): string {
    return `${this.baseUrl}/ui/remote/${hubId ? `?hub=${encodeURIComponent(hubId)}` : ""}`;
  }

  async request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    const init: RequestInit = { method, headers };
    if (options.rawBody !== undefined) {
      if (options.rawBody !== "") {
        if (!Object.keys(headers).some((k) => k.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
        init.body = options.rawBody;
      }
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    const response = await this._fetch(this.url(path, options.query), init);
    const text = await response.text();
    let body: T | null = null;
    if (text) {
      try {
        body = JSON.parse(text) as T;
      } catch {
        body = null;
      }
    }
    const responseHeaders: [string, string][] = [];
    response.headers.forEach((value, key) => responseHeaders.push([key, value]));
    return { ok: response.ok, status: response.status, statusText: response.statusText, headers: responseHeaders, text, body };
  }

  // -- server ----------------------------------------------------------------

  serverInfo(): Promise<ApiResponse<ServerInfo>> {
    return this.request<ServerInfo>("GET", "server");
  }

  callbackListener(): Promise<ApiResponse<CallbackListener>> {
    return this.request<CallbackListener>("GET", "server/callback-listener");
  }

  mqttState(): Promise<ApiResponse<MqttState>> {
    return this.request<MqttState>("GET", "server/mqtt");
  }

  retryCallbackListener(): Promise<ApiResponse<CallbackListener>> {
    return this.request<CallbackListener>("POST", "server/callback-listener/retry");
  }

  serverSettings(): Promise<ApiResponse<ServerSettings>> {
    return this.request<ServerSettings>("GET", "server/settings");
  }

  /** Saves to server.json; the ports apply on the next server start. */
  updateServerSettings(changes: Partial<Record<ServerPortName, number>>): Promise<ApiResponse<ServerSettings>> {
    return this.request<ServerSettings>("PUT", "server/settings", { body: changes });
  }

  /** The operations from `openapi.json`, sorted by path then method. */
  async operations(): Promise<Operation[]> {
    const response = await this.request<{ paths?: Record<string, Record<string, { operationId?: string; summary?: string; requestBody?: unknown }>> }>(
      "GET",
      "openapi.json",
    );
    const paths = response.body?.paths ?? {};
    // The document's paths carry the API prefix but never a root path
    // (that lives in its `servers` entry), so strip the prefix alone.
    const out: Operation[] = [];
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const rel = path.startsWith(SERVER_API_PREFIX) ? path.slice(SERVER_API_PREFIX.length) : path;
        out.push({ id: op.operationId ?? "", method: method.toUpperCase(), path: rel, summary: op.summary ?? "", hasBody: Boolean(op.requestBody) });
      }
    }
    out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
    return out;
  }

  // -- hubs ------------------------------------------------------------------

  listHubs(): Promise<ApiResponse<HubView[]>> {
    return this.request<HubView[]>("GET", "hubs");
  }

  addHub(body: HubCreate): Promise<ApiResponse<HubView>> {
    return this.request<HubView>("POST", "hubs", { body });
  }

  enableHub(hubId: string): Promise<ApiResponse<HubView>> {
    return this.request<HubView>("POST", `hubs/${encodeURIComponent(hubId)}/enable`);
  }

  disableHub(hubId: string): Promise<ApiResponse<HubView>> {
    return this.request<HubView>("POST", `hubs/${encodeURIComponent(hubId)}/disable`);
  }

  removeHub(hubId: string): Promise<ApiResponse<never>> {
    return this.request<never>("DELETE", `hubs/${encodeURIComponent(hubId)}`);
  }

  // -- discovery ---------------------------------------------------------------

  discoveredHubs(): Promise<ApiResponse<SeenHub[]>> {
    return this.request<SeenHub[]>("GET", "discovery/hubs");
  }

  scan(timeoutSeconds = 5): Promise<ApiResponse<SeenHub[]>> {
    return this.request<SeenHub[]>("POST", "discovery/scan", { body: { timeout: timeoutSeconds } });
  }

  // -- the web remote's document ---------------------------------------------------

  remoteCardDocument(hubId: string): Promise<ApiResponse<RemoteCardDocument>> {
    return this.request<RemoteCardDocument>("GET", `hubs/${encodeURIComponent(hubId)}/ui/remote-card`);
  }

  putRemoteCardDocument(hubId: string, document: Record<string, unknown>): Promise<ApiResponse<RemoteCardDocument>> {
    return this.request<RemoteCardDocument>("PUT", `hubs/${encodeURIComponent(hubId)}/ui/remote-card`, { body: { document } });
  }

  deleteRemoteCardDocument(hubId: string): Promise<ApiResponse<never>> {
    return this.request<never>("DELETE", `hubs/${encodeURIComponent(hubId)}/ui/remote-card`);
  }

  // -- the catalog -----------------------------------------------------------------

  private _hub(hubId: string): string {
    return `hubs/${encodeURIComponent(hubId)}`;
  }

  snapshot(hubId: string): Promise<ApiResponse<SnapshotDocument>> {
    return this.request<SnapshotDocument>("GET", `${this._hub(hubId)}/snapshot`);
  }

  hubInfo(hubId: string): Promise<ApiResponse<HubInfo>> {
    return this.request<HubInfo>("GET", `${this._hub(hubId)}/info`);
  }

  /** A command's stored payload, read from the hub (404 `payload_not_found` when it has none). */
  commandPayload(hubId: string, deviceId: number, commandId: number): Promise<ApiResponse<PayloadView>> {
    return this.request<PayloadView>("GET", `${this._hub(hubId)}/devices/${deviceId}/commands/${commandId}/payload`);
  }

  /** Make the physical remotes run a full sync with the hub (409 while a job holds it). */
  resyncRemote(hubId: string): Promise<ApiResponse<{ accepted: boolean; mode: string }>> {
    return this.request<{ accepted: boolean; mode: string }>("POST", `${this._hub(hubId)}/resync-remote`);
  }

  /** Fire a payload from the hub's blaster once; nothing is saved. */
  playPayload(hubId: string, spec: PayloadSpec): Promise<ApiResponse<{ accepted: boolean; mode: string }>> {
    return this.request<{ accepted: boolean; mode: string }>("POST", `${this._hub(hubId)}/play`, { body: spec });
  }

  /** Write an edited device element (the snapshot's `devices[]` entry) as a job; `If-Match` carries the snapshot it was edited on. */
  editDevice(hubId: string, deviceId: number, element: SnapshotEntity, snapshotId: string): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("PUT", `${this._hub(hubId)}/devices/${deviceId}`, { body: element, headers: { "If-Match": `"${snapshotId}"` } });
  }

  /** Delete a device (a job); the hub cascades the removal into its activities. */
  removeDevice(hubId: string, deviceId: number): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("DELETE", `${this._hub(hubId)}/devices/${deviceId}`);
  }

  /** Write an edited activity element as a job; `devices` are the device elements the edit touched (a new input entry), sent only when there are any. */
  editActivity(hubId: string, activityId: number, element: SnapshotEntity, devices: SnapshotEntity[], snapshotId: string): Promise<ApiResponse<JobView>> {
    const body = devices.length ? { ...element, devices } : element;
    return this.request<JobView>("PUT", `${this._hub(hubId)}/activities/${activityId}`, { body, headers: { "If-Match": `"${snapshotId}"` } });
  }

  /** Delete an activity (a job). */
  removeActivity(hubId: string, activityId: number): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("DELETE", `${this._hub(hubId)}/activities/${activityId}`);
  }

  /** Create an empty activity (a job); the result carries the hub-assigned `activity_id`. */
  addActivity(hubId: string, name: string): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("POST", `${this._hub(hubId)}/activities`, { body: { name } });
  }

  /** Create an empty device of a class the hub can create (a job); the result carries the hub-assigned `device_id`. */
  addDevice(hubId: string, name: string, deviceClass: string): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("POST", `${this._hub(hubId)}/devices`, { body: { name, device_class: deviceClass } });
  }

  /** Store the display order of every activity or device, once each (a job). */
  reorderEntities(hubId: string, kind: "activity" | "device", order: number[]): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("PUT", `${this._hub(hubId)}/${kind === "device" ? "devices" : "activities"}/order`, { body: { order } });
  }

  devices(hubId: string): Promise<ApiResponse<Device[]>> {
    return this.request<Device[]>("GET", `${this._hub(hubId)}/devices`);
  }

  activities(hubId: string): Promise<ApiResponse<Activity[]>> {
    return this.request<Activity[]>("GET", `${this._hub(hubId)}/activities`);
  }

  deviceCommands(hubId: string, deviceId: number): Promise<ApiResponse<Command[]>> {
    return this.request<Command[]>("GET", `${this._hub(hubId)}/devices/${deviceId}/commands`);
  }

  entityButtons(hubId: string, entityId: number): Promise<ApiResponse<Button[]>> {
    return this.request<Button[]>("GET", `${this._hub(hubId)}/entities/${entityId}/buttons`);
  }

  activityMacros(hubId: string, activityId: number): Promise<ApiResponse<Macro[]>> {
    return this.request<Macro[]>("GET", `${this._hub(hubId)}/activities/${activityId}/macros`);
  }

  activityFavorites(hubId: string, activityId: number): Promise<ApiResponse<Favorite[]>> {
    return this.request<Favorite[]>("GET", `${this._hub(hubId)}/activities/${activityId}/favorites`);
  }

  /** Start a refresh job; the 202 body is the job to follow. */
  refreshSnapshot(hubId: string, scope: RefreshScope = {}): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("POST", `${this._hub(hubId)}/snapshot/refresh`, { body: scope });
  }

  job(hubId: string, jobId: string): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("GET", `${this._hub(hubId)}/jobs/${encodeURIComponent(jobId)}`);
  }

  /** Recent jobs on the hub, newest first. */
  listJobs(hubId: string): Promise<ApiResponse<JobView[]>> {
    return this.request<JobView[]>("GET", `${this._hub(hubId)}/jobs`);
  }

  cancelJob(hubId: string, jobId: string): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("DELETE", `${this._hub(hubId)}/jobs/${encodeURIComponent(jobId)}`);
  }

  // -- wifi devices (the Wifi Commands tab) -------------------------------------------------

  wifiDevices(hubId: string): Promise<ApiResponse<WifiDeviceList>> {
    return this.request<WifiDeviceList>("GET", `${this._hub(hubId)}/wifi-devices`);
  }

  /** Deploy a new Wifi Device (a job); the result is its record, with the key. */
  createWifiDevice(hubId: string, spec: Omit<WifiDeviceSpec, "brand">, transport: string): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("POST", `${this._hub(hubId)}/wifi-devices`, { body: { ...spec, transport } });
  }

  /** Write a Wifi Device's whole spec in place (a job); the bindings made in the activity editor survive. */
  updateWifiDevice(hubId: string, key: string, spec: Omit<WifiDeviceSpec, "brand">): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("PUT", `${this._hub(hubId)}/wifi-devices/${encodeURIComponent(key)}`, { body: spec });
  }

  /** Remove a Wifi Device from the hub (a job); 409 `callback_device_referenced` unless `force`. */
  removeWifiDevice(hubId: string, key: string, force = false): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("DELETE", `${this._hub(hubId)}/wifi-devices/${encodeURIComponent(key)}`, force ? { query: "force=true" } : {});
  }

  /** Deploy a stale Wifi Device again from its stored spec (a job). */
  redeployWifiDevice(hubId: string, key: string): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("POST", `${this._hub(hubId)}/wifi-devices/${encodeURIComponent(key)}/redeploy`);
  }

  // -- backup and restore ------------------------------------------------------------

  /** Read a full, restorable bundle from the hub (a job); `deviceIds` limits it to those devices, without activities. */
  startBackup(hubId: string, deviceIds: number[] | null = null): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("POST", `${this._hub(hubId)}/backup`, { body: deviceIds ? { device_ids: deviceIds } : {} });
  }

  /** Write a bundle onto the hub (a job, not cancellable); `replace` erases the hub first. */
  startRestore(hubId: string, bundle: unknown, replace: boolean): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("POST", `${this._hub(hubId)}/restore`, { body: { bundle, replace } });
  }

  /** Where a finished backup's bundle downloads from, while the server still holds it. */
  backupBundleUrl(hubId: string, jobId: string): string {
    return this.url(`${this._hub(hubId)}/jobs/${encodeURIComponent(jobId)}/bundle`);
  }

  /** Done with a finished backup: the server drops its bundle now. */
  dropBackupBundle(hubId: string, jobId: string): Promise<ApiResponse<never>> {
    return this.request<never>("DELETE", `${this._hub(hubId)}/jobs/${encodeURIComponent(jobId)}/bundle`);
  }

  /** The hub's apply records, newest first, documents omitted. */
  listApplies(hubId: string): Promise<ApiResponse<ApplySummary[]>> {
    return this.request<ApplySummary[]>("GET", `${this._hub(hubId)}/applies`);
  }

  /** Continue a stopped or cancelled apply; the 202 body is the job. */
  resumeApply(hubId: string, applyId: string): Promise<ApiResponse<JobView>> {
    return this.request<JobView>("POST", `${this._hub(hubId)}/applies/${encodeURIComponent(applyId)}/resume`);
  }

  /** Forget an apply record. */
  discardApply(hubId: string, applyId: string): Promise<ApiResponse<never>> {
    return this.request<never>("DELETE", `${this._hub(hubId)}/applies/${encodeURIComponent(applyId)}`);
  }

  /**
   * Poll a job until it reaches a terminal state (or the poll count runs
   * out); `onUpdate` sees every answer. Resolves with the last view.
   */
  async followJob(hubId: string, jobId: string, options: { intervalMs?: number; maxPolls?: number; onUpdate?: (job: JobView) => void; sleep?: (ms: number) => Promise<void> } = {}): Promise<JobView | null> {
    const interval = options.intervalMs ?? 500;
    const maxPolls = options.maxPolls ?? 600;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let last: JobView | null = null;
    for (let i = 0; i < maxPolls; i++) {
      const response = await this.job(hubId, jobId);
      if (!response.ok || !response.body) return last;
      last = response.body;
      options.onUpdate?.(last);
      if (TERMINAL_JOB_STATES.has(last.status)) return last;
      await sleep(interval);
    }
    return last;
  }
}
