// The panel's store (docs/internal/server-panel-state-plan.md, decisions
// 2, 4, 5, 6, 8, 9, 13): one snapshot the shell renders, per-hub runtime
// records that mirror the server's jobs, the route, the resync points,
// the notices a finished job leaves and their acknowledgements, the
// little persisted preferences. It talks to the API client and the event
// stream and nothing else; timers, storage and the clock are injectable
// so the node tests drive it deterministically.

import type { ApiResponse, ApplySummary, HubView, JobView, Operation, PanelApi, SeenHub, ServerInfo } from "./panel-api";
import { TERMINAL_JOB_STATES } from "./panel-api";
import { hashFor, hubRoute, normalizeSub, normalizeToolSub, sameRoute, toolRoute, withHub, type HubTab, type Route } from "./panel-route";
import { loadPrefs, nextTheme, savePrefs, type ThemeChoice } from "./panel-state";
import type { PanelStream, StreamMessage } from "./panel-stream";
import { isHubRefreshTrigger } from "./panel-stream";
import { noticeForJob } from "./panel-selectors";

export interface HubNotice {
  tone: "success" | "error" | "neutral" | "info";
  label: string;
  detail: string | null;
  /** The job this notice reports; acknowledged by id (decision 6). */
  jobId: string | null;
  /** Sticky notices stay until dismissed; the others expire. */
  sticky: boolean;
  at: number;
}

export interface LocalBusy {
  key: string;
  label: string;
}

/** A button press the hub delivered to the callback listener (a `press` frame). */
export interface PressEvent {
  seq: number;
  deviceId: number | null;
  label: string | null;
  pressType: string;
  /** The panel's clock when it arrived; keys the dock's flash. */
  at: number;
}

/** An editor's unsaved work on a hub (decision 8): what it edits (`scope`,
 *  the tab and subtab), the snapshot it was taken from, and the editor's
 *  own data. Mirrored to local storage so a reload keeps it. */
export interface Draft {
  scope: string;
  snapshotId: string;
  data: unknown;
  updatedAt: number;
  /** The user chose to keep editing after the hub moved on (the stale prompt). */
  acceptedStale?: boolean;
}

/** Whether a restored draft still matches the hub: not yet checked, fresh,
 *  stale (the prompt), or kept (stale, but the user chose to go on). */
export type DraftCheck = "unchecked" | "fresh" | "stale" | "kept";

/** One hub as the panel tracks it: the server's view plus the panel's own bits. */
export interface HubRuntime {
  hub: HubView;
  localBusy: LocalBusy | null;
  notice: HubNotice | null;
  /** Stopped or cancelled apply records the dock surfaces (decision 6). */
  stoppedApplies: ApplySummary[];
  /** The active job a cancel was asked for; cleared when the job ends. */
  cancelRequestedJobId: string | null;
  /** The last press the stream delivered for this hub. */
  lastPress: PressEvent | null;
  /** The editor's unsaved work on this hub, if any (decision 8). */
  draft: Draft | null;
  draftCheck: DraftCheck;
}

export interface PanelSnapshot {
  server: {
    info: ServerInfo | null;
    /** The last REST call answered (decision 13). */
    reachable: boolean;
    error: string | null;
    instanceId: string | null;
  };
  stream: { connected: boolean; messageCount: number };
  /** In the server's order. */
  hubs: HubRuntime[];
  /** At least one hub list answered since connect(). */
  listLoaded: boolean;
  seen: SeenHub[];
  operations: Operation[];
  selectedHubId: string | null;
  /** Where the panel is (decision 9); the shell mirrors it into the URL hash. */
  route: Route;
  /** True when the last route change corrects the URL rather than following a click. */
  routeReplace: boolean;
  theme: ThemeChoice;
  /** The one-line feedback the dock shows (a view's sb-message); clears itself. */
  message: { text: string; ok: boolean } | null;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

type TimerHandle = unknown;

export interface PanelStoreOptions {
  api: PanelApi;
  stream: PanelStream;
  storage?: StorageLike | null;
  /** The URL hash at load; a bare one is filled in from the preferences. */
  initialRoute?: Route | null;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  isVisible?: () => boolean;
  tickMs?: number;
  debounceMs?: number;
  noticeTtlMs?: number;
  /** A finished job older than this leaves no notice on load. */
  noticeWindowMs?: number;
  messageTtlMs?: number;
  retryMinMs?: number;
  retryMaxMs?: number;
}

const ACKS_KEY = "sofabaton-panel-acks";
const DRAFT_PREFIX = "sofabaton-panel-draft:";
const STOPPED_APPLY_STATES: ReadonlySet<string> = new Set(["stopped", "cancelled"]);
const CONFLICT_TYPE = "hub_job_running";

export class PanelStore {
  private _snapshot: PanelSnapshot;
  private readonly _listeners = new Set<(snapshot: PanelSnapshot) => void>();
  private readonly _api: PanelApi;
  private readonly _stream: PanelStream;
  private readonly _storage: StorageLike | null;
  private readonly _now: () => number;
  private readonly _setTimer: (fn: () => void, ms: number) => TimerHandle;
  private readonly _clearTimer: (handle: TimerHandle) => void;
  private readonly _isVisible: () => boolean;
  private readonly _tickMs: number;
  private readonly _debounceMs: number;
  private readonly _noticeTtlMs: number;
  private readonly _noticeWindowMs: number;
  private readonly _messageTtlMs: number;
  private readonly _retryMinMs: number;
  private readonly _retryMaxMs: number;
  private _acks: Record<string, string> = {};
  private _connected = false;
  private _offStream: (() => void)[] = [];
  private _tick: TimerHandle | null = null;
  private _debounce: TimerHandle | null = null;
  private _retry: TimerHandle | null = null;
  private _messageTimer: TimerHandle | null = null;
  private _retryDelay: number;
  private readonly _noticeTimers = new Map<string, TimerHandle>();
  private _hubsKey = "";
  /** The last hub tab and subtab, for the preferences and for tool pages that lead back. */
  private _lastHubTab: { tab: HubTab; sub: string };

  constructor(options: PanelStoreOptions) {
    this._api = options.api;
    this._stream = options.stream;
    this._storage = options.storage ?? null;
    this._now = options.now ?? (() => Date.now());
    this._setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this._clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    this._isVisible = options.isVisible ?? (() => typeof document === "undefined" || document.visibilityState === "visible");
    this._tickMs = options.tickMs ?? 5000;
    this._debounceMs = options.debounceMs ?? 300;
    this._noticeTtlMs = options.noticeTtlMs ?? 6000;
    this._noticeWindowMs = options.noticeWindowMs ?? 24 * 60 * 60 * 1000;
    this._messageTtlMs = options.messageTtlMs ?? 8000;
    this._retryMinMs = options.retryMinMs ?? 2000;
    this._retryMaxMs = options.retryMaxMs ?? 10000;
    this._retryDelay = this._retryMinMs;
    const prefs = loadPrefs(this._storage);
    this._acks = loadAcks(this._storage);
    this._lastHubTab = { tab: prefs.tab, sub: prefs.sub };
    // The URL wins; a bare one is filled in from the preferences (decision 9).
    const initial = options.initialRoute ?? hubRoute(prefs.hub, prefs.tab, prefs.sub);
    const selected = initial.kind === "hub" && initial.hubId ? initial.hubId : prefs.hub;
    if (initial.kind === "hub") this._lastHubTab = { tab: initial.tab, sub: initial.sub };
    this._snapshot = {
      server: { info: null, reachable: true, error: null, instanceId: null },
      stream: { connected: false, messageCount: 0 },
      hubs: [],
      listLoaded: false,
      seen: [],
      operations: [],
      selectedHubId: selected,
      route: initial.kind === "hub" ? withHub(initial, selected) : initial,
      routeReplace: true,
      theme: prefs.theme,
      message: null,
    };
  }

  get snapshot(): PanelSnapshot {
    return this._snapshot;
  }

  subscribe(listener: (snapshot: PanelSnapshot) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _set(patch: Partial<PanelSnapshot>): void {
    this._snapshot = { ...this._snapshot, ...patch };
    for (const listener of this._listeners) listener(this._snapshot);
  }

  private _patchRuntime(hubId: string, patch: Partial<HubRuntime>): boolean {
    const index = this._snapshot.hubs.findIndex((r) => r.hub.hub_id === hubId);
    if (index < 0) return false;
    const hubs = this._snapshot.hubs.slice();
    hubs[index] = { ...hubs[index], ...patch };
    this._set({ hubs });
    return true;
  }

  // -- lifecycle -----------------------------------------------------------------------

  connect(): void {
    if (this._connected) return;
    this._connected = true;
    this._offStream = [
      this._stream.onState((connected) => this._onStreamState(connected)),
      this._stream.onMessage((message) => this._onStreamMessage(message)),
    ];
    this._stream.start();
    void this._api.operations().then((operations) => this._set({ operations })).catch(() => undefined);
    void this.refreshAll();
    this._scheduleTick();
  }

  disconnect(): void {
    if (!this._connected) return;
    this._connected = false;
    for (const off of this._offStream) off();
    this._offStream = [];
    this._stream.stop();
    this._clearHandle("_tick");
    this._clearHandle("_debounce");
    this._clearHandle("_retry");
    this._clearHandle("_messageTimer");
    for (const handle of this._noticeTimers.values()) this._clearTimer(handle);
    this._noticeTimers.clear();
  }

  private _clearHandle(name: "_tick" | "_debounce" | "_retry" | "_messageTimer"): void {
    const handle = this[name];
    if (handle !== null) this._clearTimer(handle);
    this[name] = null;
  }

  private _scheduleTick(): void {
    this._clearHandle("_tick");
    if (!this._connected) return;
    this._tick = this._setTimer(() => {
      this._tick = null;
      // While unreachable the retry owns the cadence (decision 13).
      if (this._isVisible() && this._snapshot.server.reachable) {
        void this.refreshHubs();
        // Discovery is available from the picker on every page.
        void this.refreshSeen();
      }
      this._scheduleTick();
    }, this._tickMs);
  }

  // -- selection, route, theme, message ----------------------------------------------------------

  selectHub(hubId: string | null): void {
    if (hubId === this._snapshot.selectedHubId) return;
    const route = this._snapshot.route;
    const patch: Partial<PanelSnapshot> = { selectedHubId: hubId };
    // A hub route follows the selection (the picker, a re-key, a removal),
    // but only down to the subtab: an entity id means another activity or
    // device on another hub, or nothing at all.
    if (route.kind === "hub" && route.hubId !== hubId) {
      patch.route = hubRoute(hubId, route.tab, route.sub);
      patch.routeReplace = true;
    }
    this._set(patch);
    this._savePrefs();
    if (hubId) {
      void this._loadApplies(hubId);
      void this._checkDraft(hubId);
    }
  }

  /** Go somewhere (decision 9). A hub route without a hub takes the selected one; a hub in it becomes the selection. */
  navigate(route: Route, { replace = false }: { replace?: boolean } = {}): void {
    let next = route;
    if (next.kind === "hub") {
      const hubId = next.hubId ?? this._snapshot.selectedHubId;
      // Prefs remember the tab and subtab, never an open editor.
      this._lastHubTab = { tab: next.tab, sub: normalizeSub(next.tab, next.sub) };
      next = hubRoute(hubId, next.tab, next.sub, next.entity);
    } else {
      next = { kind: "tool", page: next.page, sub: normalizeToolSub(next.page, next.sub) };
    }
    if (sameRoute(next, this._snapshot.route)) {
      if (replace !== this._snapshot.routeReplace) this._set({ routeReplace: replace });
    } else {
      this._set({ route: next, routeReplace: replace });
    }
    if (next.kind === "hub" && next.hubId && next.hubId !== this._snapshot.selectedHubId) this.selectHub(next.hubId);
    this._savePrefs();
  }

  /** The hub route to return to from a tool page: the last tab and subtab on the selected hub. */
  lastHubRoute(): Route {
    return hubRoute(this._snapshot.selectedHubId, this._lastHubTab.tab, this._lastHubTab.sub);
  }

  cycleTheme(): void {
    this._set({ theme: nextTheme(this._snapshot.theme) });
    this._savePrefs();
  }

  say(text: string, ok = true): void {
    this._set({ message: { text, ok } });
    this._clearHandle("_messageTimer");
    this._messageTimer = this._setTimer(() => {
      this._messageTimer = null;
      if (this._snapshot.message?.text === text) this._set({ message: null });
    }, this._messageTtlMs);
  }

  clearMessage(): void {
    this._clearHandle("_messageTimer");
    if (this._snapshot.message) this._set({ message: null });
  }

  private _savePrefs(): void {
    savePrefs(this._storage, { hub: this._snapshot.selectedHubId, tab: this._lastHubTab.tab, sub: this._lastHubTab.sub, theme: this._snapshot.theme });
  }

  // -- loading and resync ---------------------------------------------------------------------

  /** The full resync (decision 5): server info, the hub list, the discovered list, the selected hub's applies. */
  async refreshAll(): Promise<void> {
    const selectedBefore = this._snapshot.selectedHubId;
    await Promise.all([this._loadServer(), this.refreshHubs(), this.refreshSeen()]);
    // A selection the list just moved (first hub, re-key, removal) read
    // its applies in selectHub already; an unchanged one is re-read here.
    const selected = this._snapshot.selectedHubId;
    if (selected && selected === selectedBefore) {
      await this._loadApplies(selected);
      await this._checkDraft(selected);
    }
  }

  /** Reload the hub list soon, coalescing bursts of triggers. */
  refreshSoon(): void {
    this._clearHandle("_debounce");
    this._debounce = this._setTimer(() => {
      this._debounce = null;
      void this.refreshHubs();
      void this.refreshSeen();
    }, this._debounceMs);
  }

  private async _loadServer(): Promise<void> {
    try {
      const response = await this._api.serverInfo();
      if (response.ok && response.body) this._set({ server: { ...this._snapshot.server, info: response.body, error: null } });
      else this._set({ server: { ...this._snapshot.server, error: `server answered ${response.status}` } });
    } catch (err) {
      this._set({ server: { ...this._snapshot.server, error: `server unreachable: ${String(err)}` } });
    }
  }

  async refreshHubs(): Promise<void> {
    let hubs: HubView[] | null = null;
    try {
      const response = await this._api.listHubs();
      hubs = response.ok && Array.isArray(response.body) ? response.body : null;
    } catch {
      hubs = null;
    }
    if (!hubs) {
      this._markUnreachable();
      return;
    }
    this._markReachable();
    this._applyHubList(hubs);
  }

  async refreshSeen(): Promise<void> {
    try {
      const response = await this._api.discoveredHubs();
      if (response.ok && Array.isArray(response.body)) {
        if (JSON.stringify(response.body) !== JSON.stringify(this._snapshot.seen)) this._set({ seen: response.body });
      }
    } catch {
      // the picker keeps its last answer
    }
  }

  private async _loadApplies(hubId: string): Promise<void> {
    try {
      const response = await this._api.listApplies(hubId);
      if (!response.ok || !Array.isArray(response.body)) return;
      const stopped = response.body.filter((a) => STOPPED_APPLY_STATES.has(a.status));
      const current = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
      if (current && JSON.stringify(current.stoppedApplies) !== JSON.stringify(stopped)) this._patchRuntime(hubId, { stoppedApplies: stopped });
    } catch {
      // the record keeps what it had
    }
  }

  private _markUnreachable(): void {
    if (this._snapshot.server.reachable) this._retryDelay = this._retryMinMs;
    this._set({ server: { ...this._snapshot.server, reachable: false } });
    this._scheduleRetry();
  }

  private _markReachable(): void {
    if (!this._snapshot.server.reachable) {
      this._set({ server: { ...this._snapshot.server, reachable: true } });
      this._clearHandle("_retry");
      this._retryDelay = this._retryMinMs;
    }
  }

  private _scheduleRetry(): void {
    if (!this._connected || this._retry !== null) return;
    const delay = this._retryDelay;
    this._retryDelay = Math.min(this._retryMaxMs, Math.round(delay * 1.5));
    this._retry = this._setTimer(() => {
      this._retry = null;
      if (!this._connected || this._snapshot.server.reachable) return;
      void this.refreshHubs();
    }, delay);
  }

  /** A fresh hub list: keep each hub's panel-side record, notice finished jobs, follow the selection and the route. */
  private _applyHubList(hubs: HubView[]): void {
    const key = JSON.stringify(hubs);
    const previous = new Map(this._snapshot.hubs.map((r) => [r.hub.hub_id, r]));
    if (key !== this._hubsKey) {
      this._hubsKey = key;
      const runtimes: HubRuntime[] = hubs.map((hub) => {
        const old = previous.get(hub.hub_id);
        if (old) return { ...old, hub };
        const draft = loadDraft(this._storage, hub.hub_id);
        return { hub, localBusy: null, notice: null, stoppedApplies: [], cancelRequestedJobId: null, lastPress: null, draft, draftCheck: draft?.acceptedStale ? "kept" : "unchecked" };
      });
      this._set({ hubs: runtimes, listLoaded: true });
      for (const hub of hubs) if (hub.last_job) this._noteFinished(hub.hub_id, hub.last_job, { onLoad: !previous.has(hub.hub_id) });
    } else if (!this._snapshot.listLoaded) {
      this._set({ listLoaded: true });
    }
    // The selection follows a re-key (host id to MAC) and a removal; the
    // route follows the selection, and with no hubs at all lands on setup.
    const selected = this._snapshot.selectedHubId;
    if (hubs.length && !hubs.some((h) => h.hub_id === selected)) this.selectHub(hubs[0].hub_id);
    if (!hubs.length) {
      if (selected !== null) this.selectHub(null);
      if (this._snapshot.route.kind === "hub") this.navigate(toolRoute("setup"), { replace: true });
    }
  }

  // -- the stream ------------------------------------------------------------------------------

  private _onStreamState(connected: boolean): void {
    this._set({ stream: { ...this._snapshot.stream, connected } });
    // Every (re)connect is a resync point: whatever happened while deaf is re-read.
    if (connected) void this.refreshAll();
  }

  private _onStreamMessage(message: StreamMessage): void {
    this._set({ stream: { ...this._snapshot.stream, messageCount: this._stream.messages.length } });
    const data = message.data as Record<string, unknown>;
    switch (data.type) {
      case "hello":
        this._onHello(typeof data.instance_id === "string" ? data.instance_id : null);
        return;
      case "job_event": {
        const job = data.job as JobView | undefined;
        if (job && typeof data.hub_id === "string") this._onJobEvent(data.hub_id, job);
        return;
      }
      case "press":
        if (typeof data.hub_id === "string") this._onPress(data.hub_id, data);
        return;
      default:
        if (isHubRefreshTrigger(data)) this.refreshSoon();
    }
  }

  private _onHello(instanceId: string | null): void {
    const previous = this._snapshot.server.instanceId;
    if (instanceId && previous && instanceId !== previous) {
      // The server restarted: its jobs are gone, so are their notices.
      for (const handle of this._noticeTimers.values()) this._clearTimer(handle);
      this._noticeTimers.clear();
      this._set({ hubs: this._snapshot.hubs.map((r) => ({ ...r, notice: null, localBusy: null })) });
      this.say("The server restarted; state reloaded.");
      this._hubsKey = "";
      void this.refreshAll();
    }
    if (instanceId && instanceId !== previous) this._set({ server: { ...this._snapshot.server, instanceId } });
  }

  /** A job frame mutates the hub's record directly; a terminal one reloads the hub afterwards. */
  private _onJobEvent(hubId: string, job: JobView): void {
    const runtime = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
    if (!runtime) {
      this.refreshSoon();
      return;
    }
    const hub = runtime.hub;
    if (TERMINAL_JOB_STATES.has(job.status)) {
      const active = hub.active_job && hub.active_job.job_id === job.job_id ? null : hub.active_job ?? null;
      const cancelRequestedJobId = runtime.cancelRequestedJobId === job.job_id ? null : runtime.cancelRequestedJobId;
      // A finished job can be announced again (a staged backup bundle was
      // downloaded, dropped or expired): that is no new ending, and an older
      // job's frame never replaces a newer last_job.
      const previous = hub.last_job && TERMINAL_JOB_STATES.has(hub.last_job.status) ? hub.last_job : null;
      const older = previous !== null && previous.job_id !== job.job_id && previous.created_at > job.created_at;
      const again = previous !== null && previous.job_id === job.job_id;
      this._patchRuntime(hubId, { hub: { ...hub, active_job: active, last_job: older ? previous : job }, cancelRequestedJobId });
      if (!older && !again) this._noteFinished(hubId, job, { onLoad: false });
      this.refreshSoon();
    } else {
      this._patchRuntime(hubId, { hub: { ...hub, active_job: job } });
    }
  }

  private _onPress(hubId: string, data: Record<string, unknown>): void {
    const press: PressEvent = {
      seq: typeof data.seq === "number" ? data.seq : 0,
      deviceId: typeof data.device_id === "number" ? data.device_id : null,
      label: typeof data.label === "string" ? data.label : null,
      pressType: typeof data.press_type === "string" ? data.press_type : "short",
      at: this._now(),
    };
    this._patchRuntime(hubId, { lastPress: press });
  }

  // -- notices (decision 6) --------------------------------------------------------------------------

  private _noteFinished(hubId: string, job: JobView, { onLoad }: { onLoad: boolean }): void {
    if (!TERMINAL_JOB_STATES.has(job.status)) return;
    if (this._acks[hubId] === job.job_id) return;
    const runtime = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
    if (!runtime || runtime.notice?.jobId === job.job_id) return;
    const now = this._now();
    if (onLoad) {
      const finished = job.finished_at ? Date.parse(job.finished_at) : NaN;
      if (Number.isFinite(finished) && now - finished > this._noticeWindowMs) return;
    }
    const notice = noticeForJob(job, now);
    if (!notice) return;
    this._patchRuntime(hubId, { notice });
    const old = this._noticeTimers.get(hubId);
    if (old !== undefined) this._clearTimer(old);
    this._noticeTimers.delete(hubId);
    if (!notice.sticky) {
      this._noticeTimers.set(
        hubId,
        this._setTimer(() => {
          this._noticeTimers.delete(hubId);
          const current = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
          if (current?.notice?.jobId === notice.jobId) this.dismissNotice(hubId);
        }, this._noticeTtlMs),
      );
    }
  }

  /** Drop the hub's notice and remember its job as seen, so a reload does not repeat it. */
  dismissNotice(hubId: string): void {
    const runtime = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
    if (!runtime?.notice) return;
    if (runtime.notice.jobId) {
      this._acks = { ...this._acks, [hubId]: runtime.notice.jobId };
      saveAcks(this._storage, this._acks);
    }
    const handle = this._noticeTimers.get(hubId);
    if (handle !== undefined) this._clearTimer(handle);
    this._noticeTimers.delete(hubId);
    this._patchRuntime(hubId, { notice: null });
  }

  // -- short calls, conflicts, jobs (decision 4) -------------------------------------------------------

  /** Run a short non-job call with the hub marked busy for its duration. */
  async runLocal<T>(hubId: string, key: string, label: string, fn: () => Promise<T>): Promise<T> {
    this._patchRuntime(hubId, { localBusy: { key, label } });
    try {
      return await fn();
    } finally {
      const current = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
      if (current?.localBusy?.key === key) this._patchRuntime(hubId, { localBusy: null });
    }
  }

  /** A 409 because a job holds the hub is not an error: the store resyncs instead. Returns true when it was one. */
  noteResponse(hubId: string, response: ApiResponse): boolean {
    const body = response.body as { type?: string } | null;
    if (response.status === 409 && body && typeof body === "object" && body.type === CONFLICT_TYPE) {
      void this.refreshHubs();
      return true;
    }
    return false;
  }

  /** Cancel the hub's active job, when it has one that allows it. The job
   *  stays active until the server drains it; the record remembers the ask. */
  async cancelActiveJob(hubId: string): Promise<boolean> {
    const runtime = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
    const job = runtime?.hub.active_job;
    if (!job || !job.cancellable || TERMINAL_JOB_STATES.has(job.status)) return false;
    if (runtime?.cancelRequestedJobId === job.job_id) return true;
    this._patchRuntime(hubId, { cancelRequestedJobId: job.job_id });
    try {
      const response = await this._api.cancelJob(hubId, job.job_id);
      if (!response.ok) {
        this._patchRuntime(hubId, { cancelRequestedJobId: null });
        this.say(`Cancel refused: HTTP ${response.status}`, false);
      }
      return response.ok;
    } catch (err) {
      this._patchRuntime(hubId, { cancelRequestedJobId: null });
      this.say(`Cancel failed: ${String(err)}`, false);
      return false;
    }
  }

  // -- stopped applies (decision 6) --------------------------------------------------------------------

  /** Continue a stopped apply as a job; the job frames take it from there. */
  async resumeApply(hubId: string, applyId: string): Promise<boolean> {
    try {
      const response = await this._api.resumeApply(hubId, applyId);
      if (response.status === 202 && response.body) {
        const runtime = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
        if (runtime) this._patchRuntime(hubId, { hub: { ...runtime.hub, active_job: response.body } });
        await this._loadApplies(hubId);
        return true;
      }
      if (!this.noteResponse(hubId, response)) this.say(`Resume refused: ${problemLine(response)}`, false);
      return false;
    } catch (err) {
      this.say(`Resume failed: ${String(err)}`, false);
      return false;
    }
  }

  /** Forget a stopped apply record. */
  async discardApply(hubId: string, applyId: string): Promise<boolean> {
    try {
      const response = await this._api.discardApply(hubId, applyId);
      if (response.status === 204 || response.ok) {
        const runtime = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
        if (runtime) this._patchRuntime(hubId, { stoppedApplies: runtime.stoppedApplies.filter((a) => a.apply_id !== applyId) });
        await this._loadApplies(hubId);
        return true;
      }
      this.say(`Discard refused: ${problemLine(response)}`, false);
      return false;
    } catch (err) {
      this.say(`Discard failed: ${String(err)}`, false);
      return false;
    }
  }

  // -- drafts (decision 8) -------------------------------------------------------------------------

  /** An editor's unsaved work: kept on the record and mirrored to storage. Null clears it. */
  setDraft(hubId: string, draft: Omit<Draft, "updatedAt"> | null): void {
    const full: Draft | null = draft ? { ...draft, updatedAt: this._now() } : null;
    if (this._patchRuntime(hubId, { draft: full, draftCheck: full ? "fresh" : "unchecked" })) saveDraft(this._storage, hubId, full);
  }

  /** Drop the hub's draft, in memory and in storage. */
  discardDraft(hubId: string): void {
    this.setDraft(hubId, null);
  }

  /** The stale prompt's "Keep editing": the draft stays, marked as accepted so a reload does not ask again. */
  keepStaleDraft(hubId: string): void {
    const runtime = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
    if (!runtime?.draft) return;
    const draft: Draft = { ...runtime.draft, acceptedStale: true };
    this._patchRuntime(hubId, { draft, draftCheck: "kept" });
    saveDraft(this._storage, hubId, draft);
  }

  /** A restored draft is checked against the hub's current snapshot once: the same id is fresh, another is stale (the prompt). */
  private async _checkDraft(hubId: string): Promise<void> {
    const runtime = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
    if (!runtime?.draft || runtime.draftCheck !== "unchecked") return;
    try {
      const response = await this._api.snapshot(hubId);
      if (!response.ok || !response.body) return;
      const current = this._snapshot.hubs.find((r) => r.hub.hub_id === hubId);
      if (!current?.draft || current.draftCheck !== "unchecked") return;
      this._patchRuntime(hubId, { draftCheck: response.body.snapshot_id === current.draft.snapshotId ? "fresh" : "stale" });
    } catch {
      // unchecked: the banner shows, the prompt waits for a check that works
    }
  }
}

/** The hash the shell should show for a snapshot. */
export function hashForSnapshot(snapshot: PanelSnapshot): string {
  return hashFor(snapshot.route);
}

function problemLine(response: ApiResponse): string {
  const body = response.body as { type?: string; detail?: string } | null;
  if (body && typeof body === "object" && (body.type || body.detail)) return [body.type, body.detail].filter(Boolean).join(": ");
  return `HTTP ${response.status}`;
}

// -- persisted acknowledgements ----------------------------------------------------------------------

export function loadAcks(storage: Pick<StorageLike, "getItem"> | null): Record<string, string> {
  if (!storage) return {};
  try {
    const data = JSON.parse(storage.getItem(ACKS_KEY) || "{}") as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: Record<string, string> = {};
    for (const [hub, job] of Object.entries(data as Record<string, unknown>)) if (typeof job === "string") out[hub] = job;
    return out;
  } catch {
    return {};
  }
}

export function saveAcks(storage: Pick<StorageLike, "setItem"> | null, acks: Record<string, string>): void {
  if (!storage) return;
  try {
    storage.setItem(ACKS_KEY, JSON.stringify(acks));
  } catch {
    // private mode or a full store: the panel still works
  }
}

// -- persisted drafts (decision 8) -------------------------------------------------------------------

export function draftKey(hubId: string): string {
  return `${DRAFT_PREFIX}${hubId}`;
}

export function loadDraft(storage: Pick<StorageLike, "getItem"> | null, hubId: string): Draft | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftKey(hubId));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Draft>;
    if (!data || typeof data !== "object" || typeof data.scope !== "string" || typeof data.snapshotId !== "string") return null;
    return {
      scope: data.scope,
      snapshotId: data.snapshotId,
      data: data.data,
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
      ...(data.acceptedStale ? { acceptedStale: true } : {}),
    };
  } catch {
    return null;
  }
}

export function saveDraft(storage: StorageLike | null, hubId: string, draft: Draft | null): void {
  if (!storage) return;
  try {
    if (draft) storage.setItem(draftKey(hubId), JSON.stringify(draft));
    else if (storage.removeItem) storage.removeItem(draftKey(hubId));
    else storage.setItem(draftKey(hubId), "");
  } catch {
    // private mode or a full store: the draft lives in memory for this page
  }
}
