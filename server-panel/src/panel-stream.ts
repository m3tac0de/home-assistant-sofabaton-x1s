// The panel's connection to `/api/v1/events` (docs/internal/server-panel-plan.md,
// decision 7): a bounded message buffer, listeners for messages and for
// the connection state, and a reconnect that keeps trying for as long as
// the stream is wanted (a server restart must not leave the panel deaf).
// The WebSocket constructor is injectable for the node tests.

export interface StreamMessage {
  /** Wall-clock time of arrival, for the list. */
  at: string;
  /** The raw frame. */
  text: string;
  /** The parsed frame, or `{type: "raw"}` when it is not JSON. */
  data: Record<string, unknown>;
}

type WebSocketLike = {
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
};
type WebSocketCtor = new (url: string) => WebSocketLike;

export interface PanelStreamOptions {
  /** The API root (`<base>/api/v1`); the stream lives at `/events` under it. */
  apiRoot: string;
  WebSocketImpl?: WebSocketCtor;
  reconnectMs?: number;
  /** Messages kept; older ones drop off the front. */
  limit?: number;
  now?: () => string;
}

const DEFAULT_LIMIT = 500;

export class PanelStream {
  readonly messages: StreamMessage[] = [];
  /** Hub ids the server should filter the stream to; applied on the next (re)connect. */
  hubFilter: string[] = [];
  connected = false;
  /** True between start() and stop(): the stream should be up and reconnects. */
  wanted = false;

  private readonly _apiRoot: string;
  private readonly _WebSocket: WebSocketCtor;
  private readonly _reconnectMs: number;
  private readonly _limit: number;
  private readonly _now: () => string;
  private _socket: WebSocketLike | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _messageListeners = new Set<(message: StreamMessage) => void>();
  private readonly _stateListeners = new Set<(connected: boolean) => void>();

  constructor(options: PanelStreamOptions) {
    this._apiRoot = options.apiRoot.replace(/\/+$/, "");
    this._WebSocket = options.WebSocketImpl ?? (WebSocket as unknown as WebSocketCtor);
    this._reconnectMs = options.reconnectMs ?? 3000;
    this._limit = options.limit ?? DEFAULT_LIMIT;
    this._now = options.now ?? (() => new Date().toLocaleTimeString());
  }

  /** `ws(s)://.../api/v1/events?hub_id=…`, from the API root's scheme. */
  url(): string {
    const u = new URL(`${this._apiRoot}/events`);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    for (const hub of this.hubFilter) u.searchParams.append("hub_id", hub);
    return u.toString();
  }

  onMessage(listener: (message: StreamMessage) => void): () => void {
    this._messageListeners.add(listener);
    return () => this._messageListeners.delete(listener);
  }

  onState(listener: (connected: boolean) => void): () => void {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }

  start(): void {
    this.wanted = true;
    this._clearTimer();
    if (this._socket) return;
    const socket = new this._WebSocket(this.url());
    this._socket = socket;
    socket.onopen = () => this._setConnected(true);
    socket.onclose = () => {
      if (this._socket === socket) this._socket = null;
      this._setConnected(false);
      if (this.wanted) this._reconnectTimer = setTimeout(() => this.start(), this._reconnectMs);
    };
    socket.onmessage = (event) => this._receive(String(event.data));
  }

  stop(): void {
    this.wanted = false;
    this._clearTimer();
    const socket = this._socket;
    this._socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    this._setConnected(false);
  }

  /** Drop the socket and dial again (the hub filter changed). */
  restart(): void {
    const wanted = this.wanted;
    this.stop();
    if (wanted) this.start();
  }

  clear(): void {
    this.messages.length = 0;
  }

  private _receive(text: string): void {
    let data: Record<string, unknown>;
    try {
      const parsed = JSON.parse(text) as unknown;
      data = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : { type: "raw", raw: text };
    } catch {
      data = { type: "raw", raw: text };
    }
    const message: StreamMessage = { at: this._now(), text, data };
    this.messages.push(message);
    if (this.messages.length > this._limit) this.messages.splice(0, this.messages.length - this._limit);
    for (const listener of this._messageListeners) listener(message);
  }

  private _setConnected(connected: boolean): void {
    if (this.connected === connected) return;
    this.connected = connected;
    for (const listener of this._stateListeners) listener(connected);
  }

  private _clearTimer(): void {
    if (this._reconnectTimer !== null) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
  }
}

/** One line per frame, the way the events list shows it. */
export function summarizeMessage(data: Record<string, unknown>): string {
  const m = data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (m.type) {
    case "press":
      return `press seq=${m.seq} ${m.hub_id} dev=${m.device_id} slot=${m.slot} ${m.press_type} "${m.label}" ${m.resolution}`;
    case "hub_event":
      return `hub_event ${m.hub_id} ${m.event?.kind} seq=${m.event?.seq}`;
    case "server_event":
      return `server_event ${m.hub_id} ${m.kind}`;
    case "job_event": {
      const progress = m.job?.progress;
      const suffix = progress ? ` ${progress.completed_steps ?? ""}/${progress.total_steps ?? ""}` : "";
      return `job_event ${m.hub_id} ${m.job?.kind} ${m.job?.status}${suffix}`;
    }
    case "hello":
      return `hello v${m.server_version} instance=${m.instance_id} hubs=${((m.hubs as { hub_id: string }[]) ?? []).map((h) => h.hub_id).join(",")}`;
    case "dropped":
      return `dropped ${m.count}`;
    default:
      return String(m.type ?? "?");
  }
}

/** The lifecycle-shaped frames after which the hub list should be re-read. */
const HUB_EVENT_KINDS = new Set(["catalog_ready", "hub_state", "app_state", "status_changed"]);

export function isHubRefreshTrigger(data: Record<string, unknown>): boolean {
  // A hub's lifecycle reloads the list; the server-wide kinds (an update check finished) do not.
  if (data.type === "server_event") return data.kind !== "update_check";
  if (data.type === "hub_event") {
    const event = data.event as { kind?: string } | undefined;
    return Boolean(event?.kind && HUB_EVENT_KINDS.has(event.kind));
  }
  return false;
}
