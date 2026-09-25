// RemoteBackend over sofabaton-x-server's REST + WebSocket API
// (docs/internal/web-remote-plan.md, section 4.2, R3). It produces the same
// entity attribute contract the HA remote entity publishes, so the store
// and every pure derivation behind it run unchanged on the web remote.
//
// Data flow: one initial load (status, catalog, running activity, then the
// running activity's buttons / macros / favorites), then the `/events`
// stream keeps it current: `activity_changed` moves the running activity
// and fetches that activity's pages on first sight, `snapshot_changed`
// re-reads the catalog, drops the pages it names and re-reads the device
// pages the card has open, connection and status events re-read `/status`,
// `catalog_ready`, a `dropped` notice and every socket (re)open reload
// everything.
//
// Ordering rules (review of the R3 build): every reload request bumps
// `loadEpoch`, and an in-flight load whose epoch is no longer current
// discards its results and runs again, so an event that lands mid-load is
// never lost. `activity_changed` bumps `runningEpoch`, so a `GET /activity`
// answer issued before the event can never revert it. Status refreshes are
// coalesced to one in flight plus one pending. A failed load or page fetch
// is retried with backoff for as long as someone is subscribed.

import type {
  DeviceKeymapResponse,
  RemoteEntityAttributes,
} from "../remote-card-types";
import type {
  RemoteActivityRef,
  RemoteBackend,
  RemoteIntegration,
  RemoteSnapshot,
} from "./remote-backend";

export const SERVER_API_PREFIX = "/api/v1";

// ---------- server wire shapes (openapi.json components) ----------

interface ServerRunningActivity {
  activity_id: number;
  name: string | null;
}

interface ServerHubStatus {
  hub_connected: boolean;
  app_connected: boolean;
  controllable: boolean;
  mode: "disconnected" | "observe" | "control";
  hub_version: string | null;
  running_activity: ServerRunningActivity | null;
  catalog_ready?: boolean;
}

interface ServerHubStatusView {
  hub_id: string;
  enabled: boolean;
  status: ServerHubStatus | null;
}

interface ServerActivity {
  activity_id: number;
  name: string;
  active: boolean;
}

interface ServerDevice {
  device_id: number;
  name: string;
  device_class: string | null;
  power_state: number | null;
  idle_behavior: number | null;
}

interface ServerCommand {
  command_id: number;
  label: string;
}

interface ServerButton {
  button_code: number;
  name: string | null;
  device_id: number | null;
  command_id: number | null;
  long_press_device_id?: number | null;
  long_press_command_id?: number | null;
}

interface ServerMacro {
  command_id: number;
  label: string | null;
}

interface ServerFavorite {
  device_id: number;
  command_id: number;
  label: string | null;
}

interface ServerHubEvent {
  seq: number;
  kind: string;
  payload: Record<string, unknown> | null;
}

interface ServerWsMessage {
  type: string;
  hub_id?: string;
  kind?: string;
  event?: ServerHubEvent;
  count?: number;
}

// ---------- minimal WebSocket surface (injectable for tests) ----------

export interface WebSocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  close(): void;
}

export type WebSocketFactory = (url: string) => WebSocketLike;

export interface ServerRemoteBackendOptions {
  /**
   * The server's base URL: origin plus any root path the server is mounted
   * under, no trailing slash. "" means same origin at the root.
   */
  baseUrl?: string;
  fetch?: typeof fetch;
  webSocket?: WebSocketFactory;
  /** First reconnect / retry delay; doubles up to 30 s. */
  reconnectDelayMs?: number;
}

interface ActivityPages {
  buttons: ServerButton[];
  macros: ServerMacro[];
  favorites: ServerFavorite[];
}

interface DevicePage {
  buttons: ServerButton[];
  commands: ServerCommand[];
}

const MAX_RECONNECT_DELAY_MS = 30000;

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * The hub's long-press pair per button. The library already applies the
 * pairing rule (a pair needs a device and a command; both null otherwise),
 * so this only maps the non-null pairs into the attribute shape.
 */
function longPressPairs(
  buttons: ServerButton[],
): Record<string, { device_id: number; command_id: number }> {
  const out: Record<string, { device_id: number; command_id: number }> = {};
  for (const button of buttons) {
    const device = toNumber(button.long_press_device_id);
    const command = toNumber(button.long_press_command_id);
    if (device && command != null) {
      out[String(button.button_code)] = { device_id: device, command_id: command };
    }
  }
  return out;
}

export class ServerRemoteBackend implements RemoteBackend {
  readonly kind = "server" as const;

  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly wsFactory: WebSocketFactory | null;
  private readonly retryBaseMs: number;

  private hubId = "";
  private listeners: Array<() => void> = [];

  // Server-side state, in wire shapes
  private hubStatus: ServerHubStatusView | null = null;
  private activities: ServerActivity[] = [];
  private devices: ServerDevice[] = [];
  private running: ServerRunningActivity | null = null;
  private activityPages: Record<string, ActivityPages> = {};
  private devicePages: Record<string, DevicePage> = {};
  /** Bumped when a device page is re-read; the store refetches on a change. */
  private devicePageVersions: Record<string, number> = {};
  private loaded = false;
  /** The catalog has been read at least once (a disabled hub answers 409 to reads). */
  private catalogLoaded = false;
  private _lastError: string | null = null;
  /** True until the server has answered (or failed) once for this target. */
  private firstAnswerPending = true;

  // Load ordering
  private loadEpoch = 0;
  private loadPromise: Promise<void> | null = null;
  private loadDirty = false;
  private runningEpoch = 0;
  private statusPromise: Promise<void> | null = null;
  private statusDirty = false;
  private pagePromises: Record<string, Promise<void>> = {};

  // Retry of failed HTTP work (independent of the socket)
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay: number;

  // Snapshot cache: rebuilt lazily, invalidated on every mutation
  private snapshotCache: RemoteSnapshot | undefined | null = null;

  // Stream
  private socket: WebSocketLike | null = null;
  private socketGeneration = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number;
  private streaming = false;

  constructor(options: ServerRemoteBackendOptions = {}) {
    this.baseUrl = String(options.baseUrl ?? "").replace(/\/+$/, "");
    this.fetchImpl =
      options.fetch ??
      ((input, init) => globalThis.fetch(input, init));
    this.wsFactory =
      options.webSocket ??
      (typeof WebSocket === "function"
        ? (url) => new WebSocket(url) as unknown as WebSocketLike
        : null);
    this.retryBaseMs = Math.max(100, options.reconnectDelayMs ?? 1000);
    this.reconnectDelay = this.retryBaseMs;
    this.retryDelay = this.retryBaseMs;
  }

  // ---------- RemoteBackend ----------

  get target(): string {
    return this.hubId;
  }

  /** The last failed request or stream error, for the page to show. */
  get lastError(): string | null {
    return this._lastError;
  }

  setTarget(target: string): void {
    const next = String(target ?? "");
    if (next === this.hubId) return;
    this.hubId = next;
    this.resetState();
    this.closeSocket();
    if (this.listeners.length) this.start();
  }

  snapshot(): RemoteSnapshot | undefined {
    if (!this.hubId) return undefined;
    if (this.snapshotCache === null) this.snapshotCache = this.buildSnapshot();
    return this.snapshotCache;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    if (this.listeners.length === 1) this.start();
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
      if (!this.listeners.length) this.stop();
    };
  }

  async probeIntegration(): Promise<RemoteIntegration> {
    if (!this.hubId) throw new Error("no hub selected");
    await this.ensureLoaded();
    if (!this.hubStatus) throw new Error(this._lastError ?? "hub status unavailable");
    return "x1s";
  }

  async devicePowerState(deviceId: number): Promise<0 | 1 | null> {
    try {
      const response = await this.get<{ power_state: number | null }>(
        `/devices/${deviceId}/power-state`,
      );
      const raw = response?.power_state;
      return raw === 1 ? 1 : raw === 0 ? 0 : null;
    } catch (_err) {
      return null;
    }
  }

  /**
   * `null` ("cannot fetch yet, ask again") until the catalog has been read
   * from a healthy hub; a device missing from a loaded catalog is a real
   * miss. The page is fetched once and re-read when `snapshot_changed`
   * names the device; the store follows through `keymap_versions`.
   */
  async deviceKeymap(deviceId: number): Promise<DeviceKeymapResponse | null> {
    if (!this.hubId) return null;
    await this.ensureLoaded();
    if (!this.hubStatus || !this.loaded || !this.catalogLoaded) return null;
    const device = this.devices.find((entry) => entry.device_id === deviceId);
    if (!device) return { keymap: null, reason: "cache_miss" };
    const key = String(deviceId);
    if (!this.devicePages[key]) {
      await this.readDevicePage(deviceId);
      if (!this.devicePages[key]) return null;
    }
    const page = this.devicePages[key];
    return {
      keymap: {
        device: {
          device_id: device.device_id,
          name: device.name,
          device_class: device.device_class ?? undefined,
        },
        buttons: page.buttons.map((button) => button.button_code),
        bindings: page.buttons
          .filter((button) => button.command_id != null)
          .map((button) => ({
            button_id: button.button_code,
            button_name: button.name,
            command_id: Number(button.command_id),
            long_press_command_id: button.long_press_command_id ?? null,
          })),
        commands: page.commands.map((command) => ({
          command_id: command.command_id,
          name: command.label,
        })),
        // Same gate as the HA projection: idle-behavior byte 1..3.
        power_configured:
          device.idle_behavior != null && [1, 2, 3].includes(Number(device.idle_behavior)),
      },
    };
  }

  async sendCommand(commandId: unknown, scopeId: unknown): Promise<void> {
    const command = toNumber(commandId);
    if (command == null) return;
    // HA coerced a missing scope to device 0; the server needs a real
    // entity, so a missing scope means the running activity.
    let scope = toNumber(scopeId);
    if (!scope) scope = this.running?.activity_id ?? null;
    if (scope == null) return;
    await this.post(`/send`, { entity_id: scope, command_id: command });
  }

  async startActivity(activity: RemoteActivityRef): Promise<void> {
    const id =
      activity.id ??
      this.activities.find((entry) => entry.name === activity.name)?.activity_id ??
      null;
    if (id == null) return;
    await this.post(`/activities/${id}/start`);
  }

  async stopActivity(): Promise<void> {
    const id = this.running?.activity_id;
    if (id == null) return;
    await this.post(`/activities/${id}/stop`);
  }

  // ---------- lifecycle ----------

  /** Begin loading and streaming; idempotent. subscribe() calls it. */
  start(): void {
    if (!this.hubId) return;
    void this.ensureLoaded();
    this.openSocket();
  }

  stop(): void {
    this.closeSocket();
    this.cancelRetry();
  }

  private resetState(): void {
    this.hubStatus = null;
    this.firstAnswerPending = true;
    this.activities = [];
    this.devices = [];
    this.running = null;
    this.activityPages = {};
    this.devicePages = {};
    this.devicePageVersions = {};
    this.loaded = false;
    this.catalogLoaded = false;
    this._lastError = null;
    // Everything in flight belongs to the old target.
    this.loadEpoch += 1;
    this.runningEpoch += 1;
    this.loadDirty = false;
    this.statusDirty = false;
    this.pagePromises = {};
    this.cancelRetry();
    this.invalidate();
  }

  /**
   * Reads other than /status answer 409 while the hub is disabled. An
   * app-held (observe) hub still answers reads from the cache, so the
   * catalog is read and shown greyed out.
   */
  private static readable(status: ServerHubStatusView | null): boolean {
    return Boolean(status && status.enabled && status.status);
  }

  private invalidate(): void {
    this.snapshotCache = null;
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  // ---------- HTTP ----------

  private url(path: string): string {
    return `${this.baseUrl}${SERVER_API_PREFIX}/hubs/${encodeURIComponent(this.hubId)}${path}`;
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(this.url(path), {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`GET ${path} -> ${response.status}`);
    return (await response.json()) as T;
  }

  private async post(path: string, body?: Record<string, unknown>): Promise<void> {
    const response = await this.fetchImpl(this.url(path), {
      method: "POST",
      headers: body
        ? { accept: "application/json", "content-type": "application/json" }
        : { accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`POST ${path} -> ${response.status}`);
  }

  // ---------- loading ----------

  /** Load once; a load already in flight is shared. */
  private ensureLoaded(): Promise<void> {
    if (this.loaded) return Promise.resolve();
    return this.loadPromise ?? this.reload();
  }

  /**
   * Request a full reload. A load in flight is superseded: its results are
   * discarded when they arrive and the load runs again, so a request that
   * lands mid-load is never lost.
   */
  private reload(): Promise<void> {
    this.loadEpoch += 1;
    if (this.loadPromise) {
      this.loadDirty = true;
      return this.loadPromise;
    }
    this.loadPromise = (async () => {
      do {
        this.loadDirty = false;
        await this.loadAll(this.loadEpoch);
      } while (this.loadDirty);
    })().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }

  /**
   * Full load: status first, then (only while the hub is readable) the
   * catalog, the running activity, and the running activity's pages. A
   * disabled or app-held hub keeps whatever catalog was read before and
   * shows as unavailable, not as unreachable.
   */
  private async loadAll(epoch: number): Promise<void> {
    if (!this.hubId) return;
    const hubId = this.hubId;
    const runningEpoch = this.runningEpoch;
    const current = () => epoch === this.loadEpoch && hubId === this.hubId;
    try {
      const status = await this.get<ServerHubStatusView>(`/status`);
      if (!current()) return; // superseded or target moved
      this.hubStatus = status;
      this.firstAnswerPending = false;
      this._lastError = null;
      if (ServerRemoteBackend.readable(status)) {
        const [activities, devices, running] = await Promise.all([
          this.get<ServerActivity[]>(`/activities`),
          this.get<ServerDevice[]>(`/devices`),
          this.get<ServerRunningActivity | null>(`/activity`),
        ]);
        if (!current()) return;
        this.activities = activities;
        this.devices = devices;
        // A stream event in the meantime is newer than this answer.
        if (runningEpoch === this.runningEpoch) this.running = running;
        this.catalogLoaded = true;
      } else {
        this.running = null;
      }
      this.loaded = true;
      this.cancelRetry();
    } catch (err) {
      if (!current()) return;
      this._lastError = errorText(err);
      this.hubStatus = null;
      this.firstAnswerPending = false;
      this.loaded = false;
      this.scheduleRetry();
    }
    this.invalidate();
    this.notify();
    if (current() && this.running) await this.ensureActivityPages(this.running.activity_id);
  }

  /** Re-read /status (and the running activity); one in flight, one pending. */
  private refreshStatus(): Promise<void> {
    if (this.statusPromise) {
      this.statusDirty = true;
      return this.statusPromise;
    }
    this.statusPromise = (async () => {
      do {
        this.statusDirty = false;
        await this.readStatus();
      } while (this.statusDirty);
    })().finally(() => {
      this.statusPromise = null;
    });
    return this.statusPromise;
  }

  private async readStatus(): Promise<void> {
    const hubId = this.hubId;
    const epoch = this.loadEpoch;
    const runningEpoch = this.runningEpoch;
    const current = () => epoch === this.loadEpoch && hubId === this.hubId;
    try {
      const status = await this.get<ServerHubStatusView>(`/status`);
      if (!current()) return;
      this.hubStatus = status;
      this.firstAnswerPending = false;
      this._lastError = null;
      if (ServerRemoteBackend.readable(status)) {
        if (!this.catalogLoaded) {
          // Became readable with nothing loaded (opened while disabled).
          void this.reload();
          return;
        }
        const running = await this.get<ServerRunningActivity | null>(`/activity`);
        if (!current()) return;
        if (runningEpoch === this.runningEpoch) this.running = running;
      } else {
        this.running = null;
      }
    } catch (err) {
      if (!current()) return;
      this._lastError = errorText(err);
      this.hubStatus = null;
      this.firstAnswerPending = false;
      this.scheduleRetry();
    }
    this.invalidate();
    this.notify();
  }

  private ensureActivityPages(activityId: number): Promise<void> {
    const key = String(activityId);
    if (this.activityPages[key]) return Promise.resolve();
    if (!this.pagePromises[key]) {
      this.pagePromises[key] = this.loadActivityPages(activityId).finally(() => {
        delete this.pagePromises[key];
      });
    }
    return this.pagePromises[key];
  }

  private async loadActivityPages(activityId: number): Promise<void> {
    const hubId = this.hubId;
    const epoch = this.loadEpoch;
    const current = () => epoch === this.loadEpoch && hubId === this.hubId;
    try {
      const [buttons, macros, favorites] = await Promise.all([
        this.get<ServerButton[]>(`/entities/${activityId}/buttons`),
        this.get<ServerMacro[]>(`/activities/${activityId}/macros`),
        this.get<ServerFavorite[]>(`/activities/${activityId}/favorites`),
      ]);
      if (!current()) return;
      this.activityPages[String(activityId)] = { buttons, macros, favorites };
    } catch (err) {
      if (!current()) return;
      // Nothing to show for this activity until the read succeeds: retry.
      this._lastError = errorText(err);
      this.scheduleRetry();
      return;
    }
    this.invalidate();
    this.notify();
  }

  /** Read (or re-read) one device page; bumps its version on success. */
  private async readDevicePage(deviceId: number): Promise<void> {
    const key = String(deviceId);
    const hubId = this.hubId;
    const epoch = this.loadEpoch;
    try {
      const [buttons, commands] = await Promise.all([
        this.get<ServerButton[]>(`/entities/${deviceId}/buttons`),
        this.get<ServerCommand[]>(`/devices/${deviceId}/commands`),
      ]);
      if (epoch !== this.loadEpoch || hubId !== this.hubId) return;
      this.devicePages[key] = { buttons, commands };
      this.devicePageVersions[key] = (this.devicePageVersions[key] ?? 0) + 1;
    } catch (err) {
      if (epoch !== this.loadEpoch || hubId !== this.hubId) return;
      this._lastError = errorText(err);
      return;
    }
    this.invalidate();
    this.notify();
  }

  // ---------- retry of failed HTTP work ----------

  private scheduleRetry(): void {
    if (!this.listeners.length || this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RECONNECT_DELAY_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.listeners.length || !this.hubId) return;
      if (!this.loaded || !this.hubStatus) {
        void this.reload();
      } else if (this.running && !this.activityPages[String(this.running.activity_id)]) {
        void this.ensureActivityPages(this.running.activity_id);
      }
    }, delay);
  }

  private cancelRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryDelay = this.retryBaseMs;
  }

  // ---------- stream ----------

  private wsUrl(): string {
    let base = this.baseUrl;
    if (!base && typeof location !== "undefined") base = location.origin;
    const ws = base.replace(/^http/, "ws");
    return `${ws}${SERVER_API_PREFIX}/events?hub_id=${encodeURIComponent(this.hubId)}`;
  }

  private openSocket(): void {
    if (!this.wsFactory || !this.hubId || this.socket) return;
    this.streaming = true;
    const generation = ++this.socketGeneration;
    let socket: WebSocketLike;
    try {
      socket = this.wsFactory(this.wsUrl());
    } catch (err) {
      this._lastError = errorText(err);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (generation !== this.socketGeneration) return;
      this.reconnectDelay = this.retryBaseMs;
      // Anything that happened while we were away is unknown, and a load
      // that failed while we were away must run again: always reload.
      void this.reload();
    };
    socket.onmessage = (event) => {
      if (generation !== this.socketGeneration) return;
      this.handleMessage(event.data);
    };
    socket.onerror = () => {
      /* onclose follows; nothing to do here */
    };
    socket.onclose = () => {
      if (generation !== this.socketGeneration) return;
      this.socket = null;
      if (this.streaming) this.scheduleReconnect();
    };
  }

  private closeSocket(): void {
    this.streaming = false;
    this.socketGeneration += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        socket.close();
      } catch (_err) {
        /* already closed */
      }
    }
  }

  private scheduleReconnect(): void {
    if (!this.streaming || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.streaming) this.openSocket();
    }, delay);
  }

  /** Exposed for tests and the page host; routes one stream message. */
  handleMessage(raw: unknown): void {
    let message: ServerWsMessage;
    try {
      message = (typeof raw === "string" ? JSON.parse(raw) : raw) as ServerWsMessage;
    } catch (_err) {
      return;
    }
    if (!message || typeof message !== "object") return;
    switch (message.type) {
      case "hello":
        return;
      case "dropped":
        void this.reload();
        return;
      case "server_event":
        if (message.kind === "hub_rekeyed" && message.hub_id && message.hub_id !== this.hubId) {
          // The stream is narrowed to our hub and follows it to its MAC,
          // so a re-key that arrives here is ours: the page opened the hub
          // by host before its first sync. Move with it; the old id is
          // gone from the API, and anything in flight under it is stale.
          this.hubId = String(message.hub_id);
          void this.reload();
          return;
        }
        if (message.hub_id !== this.hubId) return;
        if (message.kind === "hub_removed") {
          // A verdict, not a wait: the page shows the hub as gone.
          this.hubStatus = null;
          this.firstAnswerPending = false;
          this.invalidate();
          this.notify();
        } else {
          void this.refreshStatus();
        }
        return;
      case "hub_event":
        if (message.hub_id !== this.hubId || !message.event) return;
        this.handleHubEvent(message.event);
        return;
      default:
        return;
    }
  }

  private handleHubEvent(event: ServerHubEvent): void {
    const payload = event.payload ?? {};
    switch (event.kind) {
      case "activity_changed": {
        const id = toNumber(payload.activity_id);
        this.running =
          id == null
            ? null
            : { activity_id: id, name: (payload.name as string | null) ?? null };
        // Any /activity answer still in flight is older than this.
        this.runningEpoch += 1;
        this.invalidate();
        this.notify();
        if (id != null) void this.ensureActivityPages(id);
        return;
      }
      case "hub_state":
      case "app_state":
      case "status_changed":
        void this.refreshStatus();
        return;
      case "catalog_ready":
        if (payload.ready) void this.reload();
        else void this.refreshStatus();
        return;
      case "snapshot_changed": {
        const deviceIds = Array.isArray(payload.device_ids) ? payload.device_ids : [];
        const activityIds = Array.isArray(payload.activity_ids) ? payload.activity_ids : [];
        const everything = !deviceIds.length && !activityIds.length;
        // Device pages the card has open are re-read (the store follows
        // the version bump); the rest is dropped and read on demand.
        const heldDevices = everything
          ? Object.keys(this.devicePages)
          : deviceIds.map(String).filter((key) => this.devicePages[key]);
        if (everything || deviceIds.length) {
          // A device edit changes the bindings on every page that maps to
          // it; the per-activity pages are cheap, drop them all.
          this.activityPages = {};
        } else {
          for (const id of activityIds) delete this.activityPages[String(id)];
        }
        for (const key of heldDevices) delete this.devicePages[key];
        void this.reload().then(() =>
          Promise.all(heldDevices.map((key) => this.readDevicePage(Number(key)))),
        );
        return;
      }
      default:
        return;
    }
  }

  // ---------- the attribute contract ----------

  private runningPagesReady(): boolean {
    return !this.running || Boolean(this.activityPages[String(this.running.activity_id)]);
  }

  private buildSnapshot(): RemoteSnapshot | undefined {
    const status = this.hubStatus?.status ?? null;
    const enabled = this.hubStatus?.enabled ?? false;
    const available = Boolean(this.hubStatus && enabled && status?.controllable);
    // Nothing heard from the server yet: a quiet "loading" entity (off, no
    // catalog, load_state loading), never "unavailable". Unavailable is a
    // verdict (a failed read, a disabled or removed hub), and it paints the
    // page with the banner and the card's warning until the answer lands.
    const pending = this.firstAnswerPending && !this.hubStatus;
    const runningId = this.running?.activity_id ?? null;

    // The server lists both catalogs in the hub's display order (the
    // library sorts like the physical remote, as the HA integration's
    // remote entity does); the card renders the lists as-is.
    const activities = this.activities.map((activity) => ({
      id: activity.activity_id,
      name: activity.name,
      state: activity.activity_id === runningId ? "on" : "off",
    }));
    const devices = this.devices.map((device) => ({
      id: device.device_id,
      name: device.name,
      device_class: device.device_class ?? undefined,
    }));

    const assignedKeys: Record<string, number[]> = {};
    const macroKeys: Record<string, Array<{ id: number; name: string }>> = {};
    const favoriteKeys: Record<string, Array<{ id: number; name: string; device_id: number }>> = {};
    const longPressKeys: Record<string, Record<string, { device_id: number; command_id: number }>> = {};

    for (const [key, page] of Object.entries(this.activityPages)) {
      assignedKeys[key] = page.buttons.map((button) => button.button_code);
      macroKeys[key] = page.macros.map((macro) => ({
        id: macro.command_id,
        name: macro.label ?? "",
      }));
      favoriteKeys[key] = page.favorites.map((favorite) => ({
        id: favorite.command_id,
        name: favorite.label ?? "",
        device_id: favorite.device_id,
      }));
      const pairs = longPressPairs(page.buttons);
      if (Object.keys(pairs).length) longPressKeys[key] = pairs;
    }
    for (const [key, page] of Object.entries(this.devicePages)) {
      const pairs = longPressPairs(page.buttons);
      if (Object.keys(pairs).length) longPressKeys[key] = pairs;
    }

    const currentName =
      this.running?.name ??
      activities.find((activity) => activity.id === runningId)?.name ??
      undefined;

    const attributes: RemoteEntityAttributes & Record<string, unknown> = {
      hub_version: String(status?.hub_version ?? "").toUpperCase(),
      current_activity: available ? currentName : undefined,
      current_activity_id: available ? runningId : null,
      // "loading" until the running activity's pages are in as well: the
      // card disables its keys while the backend says it is still loading
      // and holds no keys for the activity (HA reports the same while it
      // primes an activity's buttons after a switch).
      load_state: this.loaded && this.runningPagesReady() ? "ready" : "loading",
      activities,
      devices,
      assigned_keys: assignedKeys,
      macro_keys: macroKeys,
      favorite_keys: favoriteKeys,
      long_press_keys: longPressKeys,
      keymap_versions: { ...this.devicePageVersions },
      hub_id: this.hubId,
    };

    return {
      state: pending ? "off" : !available ? "unavailable" : runningId != null ? "on" : "off",
      attributes,
    };
  }
}
