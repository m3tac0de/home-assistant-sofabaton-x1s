// The control panel's API client (docs/internal/server-panel-plan.md,
// section 4): one place that knows the server's base URL, builds
// requests, and reads the Problem body every failure carries. Everything
// is injectable (fetch) so the node tests run it without a browser.

import { SERVER_API_PREFIX } from "../../remote-card/src/backend/server-backend";
import { serverBaseFromPageUrl } from "../../remote-card/src/remote-web-config";
import type { components } from "../../sofabaton-x-server/openapi";

// The server's wire contract, generated from sofabaton-x-server/openapi.json
// (`npm run gen:server-types`, CR-X3-5). The types below are aliases of its
// schemas; a local refinement says why.
type Schemas = components["schemas"];

export type RunningActivity = Schemas["RunningActivity"];

/** `GET /hubs/{id}/info`: identity from the connect banner; `known` false until read. */
export type HubInfo = Schemas["HubInfo"];

export type HubStatus = Schemas["HubStatus"];

export type HubConfig = Schemas["HubConfig"];

/** One row of `GET /hubs` (openapi `HubView`). `active_job` is the job
 *  queued or running on the hub now, `last_job` the newest finished one
 *  (server panel state plan, decision 1); older fixtures may omit them. */
export type HubView = Schemas["HubView"];

/** One row of `GET /discovery/hubs` (openapi `SeenHub`). */
export type SeenHub = Schemas["SeenHub"];

/** The error body every route answers with (RFC 9457 shape). */
export type Problem = Schemas["Problem"];

/** `GET /server/callback-listener` (openapi `CallbackListener`), also embedded in `ServerInfo`. */
export type CallbackListener = Schemas["CallbackListenerView"];

/** `GET /server/updates` (openapi `UpdateStatus`), also the `update` block of `ServerInfo`: the last
 *  PyPI check judged against the running version. `failed` means nothing is known about newer
 *  releases; it never reads as up to date. */
export type UpdateStatus = Schemas["UpdateStatus"];

export type ServerInfo = Schemas["ServerInfo"];

/** `GET /auth` (openapi `AuthStatus`). */
export type AuthStatus = Schemas["AuthStatus"];

/** A write token as `GET /auth/tokens` lists it (openapi `TokenInfo`); never the secret. */
export type TokenInfo = Schemas["TokenInfo"];

/** `POST /auth/tokens` (openapi `TokenCreated`): the only answer that carries `token`. */
export type TokenCreated = Schemas["TokenCreated"];

/** A signed-in browser (openapi `SessionView`). */
export type SessionView = Schemas["SessionView"];

/** The Problem types that mean "this browser is not (or no longer) signed in". */
export const SIGNED_OUT_PROBLEMS = new Set(["auth_required", "invalid_credentials"]);

/** One command slot of a Wifi Device's spec (openapi `CallbackSlot`). */
export type WifiSlot = Schemas["CallbackSlot"];

/** A Wifi Device's spec: what `POST` and `PUT /wifi-devices` take, whole (openapi `WifiDeviceRequest`). Hook slots are 1-based. */
export type WifiDeviceSpec = Required<Omit<Schemas["WifiDeviceRequest"], "transport">> & { brand?: string };

/** One managed Wifi Device as the server keeps it (openapi `CallbackDeviceView`). */
// The document types the stored spec as an open object: it is the deploy
// request, whole, plus the brand the server gave the device.
export type WifiDeviceView = Omit<Schemas["CallbackDeviceView"], "key" | "spec"> & { key: string; spec: WifiDeviceSpec };

/** `GET /hubs/{id}/wifi-devices` (openapi `WifiDeviceList`). */
export type WifiDeviceList = Omit<Schemas["WifiDeviceList"], "devices"> & { devices: WifiDeviceView[] };

/** `GET /server/mqtt` (openapi `MqttView`): the server's broker connection. The broker comes from the
 *  panel's MQTT broker page (mqtt.json) or, read-only, from the command line or environment; the
 *  password is in no answer. */
export type MqttState = Schemas["MqttState"];

/** `GET /server/mqtt/config` (openapi `MqttConfigView`): the broker settings, never the password. */
export type MqttConfigView = Schemas["MqttConfigView"];

/** The body of `PUT /server/mqtt/config` and `POST /server/mqtt/test`. Leave `password` out to keep the stored one
 *  (only while the destination stays the same); send "" to remove it. */
export type MqttConfigBody = Schemas["MqttConfigBody"];

export type MqttTestResult = Schemas["MqttTestResult"];

/** One port in `GET /server/settings` (openapi `PortSetting`). */
export type PortSetting = Schemas["PortSetting"];

export type ServerPortName = "hub_listen_port" | "app_discovery_port" | "callback_port";

/** `allowed_origins` in `GET|PUT /server/settings` (openapi `OriginsSetting`); applied live. */
export type OriginsSetting = Schemas["OriginsSetting"];

/** `GET|PUT /server/settings` (openapi `ServerSettingsView`). */
export type ServerSettings = Schemas["ServerSettingsView"];

/** The body of `PUT /server/settings`. */
export type ServerSettingsUpdate = Schemas["ServerSettingsUpdate"];

export type RemoteCardDocument = Schemas["RemoteCardDocument"];

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

export type HubCreate = Schemas["HubCreate"];

// -- the catalog (openapi Device, Command, Activity, Button, Macro, Favorite) --

export type Device = Schemas["Device"];

export type Command = Schemas["Command"];

export type Activity = Schemas["Activity"];

export type Button = Schemas["Button"];

export type Macro = Schemas["Macro"];

export type Favorite = Schemas["Favorite"];

/** One entity's provenance in `GET /hubs/{id}/snapshot` (the tables ride along untyped). */
export type SnapshotEntity = Schemas["SnapshotEntityPayload"];

export type SnapshotDocument = Schemas["SnapshotDocument"];

export type JobProgress = Schemas["WriteProgress"];

/** `JobView`: what a 202 returns and what `GET /jobs/{id}` reports. */
export type JobView = Schemas["JobView"];

export const TERMINAL_JOB_STATES: ReadonlySet<string> = new Set(["done", "failed", "cancelled"]);

/** One row of `GET /hubs/{id}/applies` (openapi `ApplySummary`). */
export type ApplySummary = Schemas["ApplySummary"];

/** `POST /snapshot/refresh` body: one entity, or neither for the whole hub. */
export type RefreshScope = { device_id: number } | { activity_id: number } | Record<string, never>;

/** `GET .../commands/{cid}/payload`: the stored body and what the library could read from it. */
// The document types `decoded` as an open object; it is `restore_data.decoded`'s shape.
export type PayloadView = Omit<Schemas["PayloadView"], "decoded"> & {
  decoded?: { class: string; fields: Record<string, unknown>; trailer_hex?: string } | null;
};

/** One payload in any supported source format (exactly one field), for `POST /play`. */
export type PayloadSpec = { hex: string } | { pronto: string } | { descriptor: string } | { timings_us: number[]; carrier_hz: number };

/** The base the panel derives from its own URL: the page lives at `<base>/ui/`. */
export function serverBaseFromPanelUrl(href: string): string {
  return serverBaseFromPageUrl(href, "/ui/");
}

/** "hub_not_found" as "Hub not found": the last resort when a Problem carries no title. */
export function humanizeSlug(slug: string): string {
  const words = slug.replace(/[_-]+/gu, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
}

/** A Problem as one line (`title: detail`); its machine `type` only when it has no title. */
export function problemSummary(problem: Partial<Problem> | null | undefined): string {
  if (!problem) return "";
  const head = problem.title || (problem.type ? humanizeSlug(problem.type) : "");
  return [head, problem.detail].filter((part): part is string => Boolean(part)).join(": ");
}

/** A Problem body as one line (`title: detail`); anything else by status. */
export function problemText(response: ApiResponse): string {
  const body = response.body as Partial<Problem> | null;
  if (!body || typeof body !== "object") return `HTTP ${response.status}`;
  return problemSummary(body) || `HTTP ${response.status}`;
}

/** User-facing job failure, selected by code; diagnostics stay on the job. */
export function jobFailureReason(problem: Partial<Problem> | null | undefined): string {
  const reasons: Record<string, string> = {
    hub_disconnected: "Hub disconnected.",
    hub_not_connected: "Hub disconnected.",
    hub_timeout: "The hub did not respond. Try again.",
    hub_busy: "Close the Sofabaton app and try again.",
    hub_disabled: "Enable the hub and try again.",
    hub_start_failed: "The hub could not start.",
    hub_not_found: "This hub is no longer available.",
    hub_rejected: "The hub refused a change.",
    snapshot_outdated: "Hub data changed. Refresh and try again.",
    snapshot_incomplete: "Refresh the hub cache and try again.",
    entity_not_editable: "Refresh the hub cache and try again.",
    callback_update_declined: "The Wifi Device could not be updated.",
    callback_update_failed: "The Wifi Device update failed.",
    apply_stopped: "Changes were not fully applied.",
    restore_failed: "Restore did not finish.",
    sync_failed: "Sync did not finish.",
    ir_learn_failed: "No IR code captured. Try again.",
    invalid_request: "Check the entered values and try again.",
  };
  return reasons[problem?.type ?? ""] ?? "Operation failed.";
}

/** Why a followed job did not finish, as one line; null when it did. */
export function jobOutcomeText(job: JobView | null): string | null {
  if (!job) return "The job could not be followed";
  if (job.status === "done") return null;
  if (job.error) return jobFailureReason(job.error);
  if (job.status === "cancelled") return "Cancelled";
  if (job.status === "failed") return "Failed";
  // The follow gave up waiting, not the job: it may still finish (CR-F5a-5).
  return "Still running on the server; the dock shows when it ends";
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class PanelApi {
  readonly baseUrl: string;
  readonly apiRoot: string;
  private readonly _fetch: FetchLike;
  /** Called when a request answers 401 for a signed-out browser (the shell shows the sign-in). */
  onSignedOut: ((problem: Problem) => void) | null = null;

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
    if (response.status === 401 && this.onSignedOut && !path.replace(/^\/+/, "").startsWith("auth/login")) {
      const problem = body as unknown as Problem | null;
      if (problem && typeof problem === "object" && SIGNED_OUT_PROBLEMS.has(String(problem.type))) this.onSignedOut(problem);
    }
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

  mqttConfig(): Promise<ApiResponse<MqttConfigView>> {
    return this.request<MqttConfigView>("GET", "server/mqtt/config");
  }

  updateMqttConfig(body: MqttConfigBody): Promise<ApiResponse<MqttConfigView>> {
    return this.request<MqttConfigView>("PUT", "server/mqtt/config", { body });
  }

  removeMqttConfig(): Promise<ApiResponse<null>> {
    return this.request<null>("DELETE", "server/mqtt/config");
  }

  testMqttConfig(body: MqttConfigBody): Promise<ApiResponse<MqttTestResult>> {
    return this.request<MqttTestResult>("POST", "server/mqtt/test", { body });
  }

  retryCallbackListener(): Promise<ApiResponse<CallbackListener>> {
    return this.request<CallbackListener>("POST", "server/callback-listener/retry");
  }

  // -- access (auth plan, section 6) ---------------------------------------------

  authStatus(): Promise<ApiResponse<AuthStatus>> {
    return this.request<AuthStatus>("GET", "auth");
  }

  setupAdmin(username: string, password: string, remember: boolean): Promise<ApiResponse<AuthStatus>> {
    return this.request<AuthStatus>("POST", "auth/setup", { body: { username, password, remember } });
  }

  signIn(username: string, password: string, remember: boolean): Promise<ApiResponse<AuthStatus>> {
    return this.request<AuthStatus>("POST", "auth/login", { body: { username, password, remember } });
  }

  signOut(): Promise<ApiResponse<null>> {
    return this.request<null>("POST", "auth/logout");
  }

  updateAdmin(change: { current_password: string; username?: string; new_password?: string }): Promise<ApiResponse<AuthStatus>> {
    return this.request<AuthStatus>("PUT", "auth/admin", { body: change });
  }

  listTokens(): Promise<ApiResponse<TokenInfo[]>> {
    return this.request<TokenInfo[]>("GET", "auth/tokens");
  }

  createToken(name: string): Promise<ApiResponse<TokenCreated>> {
    return this.request<TokenCreated>("POST", "auth/tokens", { body: { name } });
  }

  renameToken(id: string, name: string): Promise<ApiResponse<TokenInfo>> {
    return this.request<TokenInfo>("PATCH", `auth/tokens/${encodeURIComponent(id)}`, { body: { name } });
  }

  revokeToken(id: string): Promise<ApiResponse<null>> {
    return this.request<null>("DELETE", `auth/tokens/${encodeURIComponent(id)}`);
  }

  listSessions(): Promise<ApiResponse<SessionView[]>> {
    return this.request<SessionView[]>("GET", "auth/sessions");
  }

  revokeOtherSessions(): Promise<ApiResponse<null>> {
    return this.request<null>("DELETE", "auth/sessions");
  }

  revokeSession(id: string): Promise<ApiResponse<null>> {
    return this.request<null>("DELETE", `auth/sessions/${encodeURIComponent(id)}`);
  }

  serverSettings(): Promise<ApiResponse<ServerSettings>> {
    return this.request<ServerSettings>("GET", "server/settings");
  }

  /** Saves to server.json; the ports apply on the next server start. */
  updateServerSettings(changes: ServerSettingsUpdate): Promise<ApiResponse<ServerSettings>> {
    return this.request<ServerSettings>("PUT", "server/settings", { body: changes });
  }

  /** One check against PyPI now; enables nothing, downloads nothing. */
  checkForUpdates(): Promise<ApiResponse<UpdateStatus>> {
    return this.request<UpdateStatus>("POST", "server/updates/check");
  }

  /** The daily automatic check, saved to server.json (409 when the environment pinned it). */
  configureUpdateCheck(automatic: boolean): Promise<ApiResponse<UpdateStatus>> {
    return this.request<UpdateStatus>("PUT", "server/updates", { body: { automatic } });
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

  setHubProxy(hubId: string, enabled: boolean): Promise<ApiResponse<HubView>> {
    return this.request<HubView>("POST", `hubs/${encodeURIComponent(hubId)}/proxy/${enabled ? "enable" : "disable"}`);
  }

  /** The server's IPv4 address toward the hub; null returns to automatic. */
  setHubLocalAddress(hubId: string, address: string | null): Promise<ApiResponse<HubView>> {
    return this.request<HubView>("PUT", `hubs/${encodeURIComponent(hubId)}/local-address`, { body: { address } });
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
   * Poll a job until it reaches a terminal state; `onUpdate` sees every
   * answer. Jobs are server-authoritative, so a poll that fails in transit
   * (a network blip, a 5xx) backs off and polls again instead of reporting
   * the job as failed; only a terminal state, a 4xx answer (the job is
   * gone) or the long cap ends it (CR-F5a-5). Resolves with the last view,
   * which after the cap can still be running.
   */
  async followJob(hubId: string, jobId: string, options: { intervalMs?: number; maxPolls?: number; onUpdate?: (job: JobView) => void; sleep?: (ms: number) => Promise<void> } = {}): Promise<JobView | null> {
    const interval = options.intervalMs ?? 500;
    // About half an hour at the default interval: long X1 command deletes
    // (L-P9) run for minutes.
    const maxPolls = options.maxPolls ?? 3600;
    const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    let last: JobView | null = null;
    let failures = 0;
    for (let i = 0; i < maxPolls; i++) {
      let response: ApiResponse<JobView> | null = null;
      try {
        response = await this.job(hubId, jobId);
      } catch {
        response = null;
      }
      if (response && response.ok && response.body) {
        failures = 0;
        last = response.body;
        options.onUpdate?.(last);
        if (TERMINAL_JOB_STATES.has(last.status)) return last;
        await sleep(interval);
        continue;
      }
      // A 4xx answer is final (job_not_found, hub gone); anything else is in transit.
      if (response && response.status >= 400 && response.status < 500) return last;
      failures += 1;
      await sleep(Math.min(interval * 2 ** Math.min(failures, 5), 10_000));
    }
    return last;
  }
}
