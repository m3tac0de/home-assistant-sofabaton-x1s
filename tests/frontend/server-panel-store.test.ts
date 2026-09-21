// The panel's store (docs/internal/server-panel-state-plan.md, SP2) over
// a fake API and the real stream on a fake socket: loading and the
// selection, the unreachable server and its retry, job frames and the
// notices they leave, acknowledgements across a reload, the resync
// points (reconnect, a new instance id, lifecycle frames), local busy,
// the job-conflict answer, applies and cancel.

import assert from "node:assert/strict";
import test from "node:test";

import type { ApiResponse, ApplySummary, HubView, JobView, PanelApi } from "../../server-panel/src/panel-api";
import { PanelStore, loadAcks, saveAcks, type StorageLike } from "../../server-panel/src/panel-store";
import { hubRoute, toolRoute } from "../../server-panel/src/panel-route";
import { PanelStream } from "../../server-panel/src/panel-stream";

// -- fakes ------------------------------------------------------------------------------

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  open(): void {
    this.onopen?.({});
  }
  push(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  drop(): void {
    this.onclose?.({});
  }
  close(): void {}
}

class Clock {
  now = 1_000_000;
  private _timers: { id: number; at: number; fn: () => void }[] = [];
  private _seq = 0;
  setTimer = (fn: () => void, ms: number): unknown => {
    const id = ++this._seq;
    this._timers.push({ id, at: this.now + ms, fn });
    return id;
  };
  clearTimer = (handle: unknown): void => {
    this._timers = this._timers.filter((t) => t.id !== handle);
  };
  pending(): number[] {
    return this._timers.map((t) => t.at - this.now).sort((a, b) => a - b);
  }
  async advance(ms: number): Promise<void> {
    const until = this.now + ms;
    for (;;) {
      const next = this._timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this._timers = this._timers.filter((t) => t.id !== next.id);
      this.now = next.at;
      next.fn();
      await flush();
    }
    this.now = until;
  }
}

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function ok<T>(body: T, status = 200): ApiResponse<T> {
  return { ok: status < 400, status, statusText: "", headers: [], text: JSON.stringify(body), body };
}

function hub(overrides: Partial<HubView> = {}): HubView {
  return {
    hub_id: "a",
    enabled: true,
    config: { host: "192.168.1.50", name: "Living room" },
    added_at: "2026-09-15T00:00:00Z",
    last_seen: null,
    status: {
      hub_connected: true,
      app_connected: false,
      controllable: true,
      mode: "control",
      hub_version: "X1S",
      proxy_enabled: true,
      running_activity: null,
      activities_cached: 0,
      devices_cached: 0,
      catalog_ready: true,
    },
    active_job: null,
    last_job: null,
    ...overrides,
  };
}

function job(overrides: Partial<JobView> = {}): JobView {
  return {
    job_id: "j1",
    hub_id: "a",
    kind: "refresh",
    status: "running",
    cancellable: true,
    created_at: "2026-09-17T10:00:00Z",
    started_at: "2026-09-17T10:00:01Z",
    finished_at: null,
    progress: null,
    result: null,
    error: null,
    ...overrides,
  };
}

class FakeApi {
  hubs: HubView[] | Error = [hub()];
  applies: ApplySummary[] = [];
  calls: string[] = [];
  cancelled: string[] = [];
  serverInfo = async () => {
    this.calls.push("server");
    return ok({ version: "0.2.0", library_version: "0.2.0", api_version: "1", instance_id: "i1" });
  };
  operations = async () => {
    this.calls.push("operations");
    return [];
  };
  listHubs = async () => {
    this.calls.push("hubs");
    if (this.hubs instanceof Error) throw this.hubs;
    return ok(this.hubs);
  };
  discoveredHubs = async () => {
    this.calls.push("seen");
    return ok([]);
  };
  listApplies = async (hubId: string) => {
    this.calls.push(`applies:${hubId}`);
    return ok(this.applies);
  };
  cancelJob = async (hubId: string, jobId: string) => {
    this.cancelled.push(`${hubId}/${jobId}`);
    // The server acknowledges; the job drains and ends through a job_event.
    return ok(job({ job_id: jobId }));
  };
  resumed: string[] = [];
  discarded: string[] = [];
  resumeApply = async (hubId: string, applyId: string) => {
    this.resumed.push(`${hubId}/${applyId}`);
    this.applies = this.applies.filter((a) => a.apply_id !== applyId);
    return ok(job({ job_id: "jr", kind: "resume_apply" }), 202);
  };
  snapshotId = "snap-1";
  snapshot = async (hubId: string) => {
    this.calls.push(`snapshot:${hubId}`);
    return ok({ snapshot_id: this.snapshotId, captured_at: "t", engine_generation: 1, complete: true, payload_profile: "x", devices: [], activities: [] });
  };
  discardApply = async (hubId: string, applyId: string) => {
    this.discarded.push(`${hubId}/${applyId}`);
    this.applies = this.applies.filter((a) => a.apply_id !== applyId);
    return { ok: true, status: 204, statusText: "", headers: [], text: "", body: null } as ApiResponse<never>;
  };
  count(name: string): number {
    return this.calls.filter((c) => c === name).length;
  }
}

function rig(options: { storage?: MemoryStorage; api?: FakeApi; now?: number; initialRoute?: import("../../server-panel/src/panel-route").Route | null } = {}) {
  FakeSocket.instances = [];
  const api = options.api ?? new FakeApi();
  const clock = new Clock();
  if (options.now !== undefined) clock.now = options.now;
  const storage = options.storage ?? new MemoryStorage();
  const stream = new PanelStream({ apiRoot: "http://host:8480/api/v1", WebSocketImpl: FakeSocket, reconnectMs: 5, now: () => "t" });
  const store = new PanelStore({
    api: api as unknown as PanelApi,
    stream,
    storage,
    initialRoute: options.initialRoute ?? null,
    now: () => clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    isVisible: () => true,
    tickMs: 5000,
    debounceMs: 300,
    noticeTtlMs: 6000,
    retryMinMs: 2000,
    retryMaxMs: 10000,
  });
  const socket = () => FakeSocket.instances[FakeSocket.instances.length - 1];
  return { api, clock, storage, stream, store, socket };
}

const rt = (store: PanelStore, id = "a") => store.snapshot.hubs.find((r) => r.hub.hub_id === id)!;

// -- tests ---------------------------------------------------------------------------------

test("connect loads the server, the hubs, the discovered list and the operations; the selection lands on the first hub", async () => {
  const { api, store, socket } = rig();
  const seen: number[] = [];
  store.subscribe((s) => seen.push(s.hubs.length));
  store.connect();
  await flush();
  assert.ok(socket(), "the stream dialled");
  assert.equal(store.snapshot.listLoaded, true);
  assert.equal(store.snapshot.server.info?.version, "0.2.0");
  assert.equal(store.snapshot.server.reachable, true);
  assert.equal(store.snapshot.selectedHubId, "a");
  assert.equal(api.count("applies:a"), 1, "the selected hub's applies were read");
  assert.ok(seen.includes(1));
  store.disconnect();
});

test("a failing hub list marks the server unreachable and retries with a growing delay until it answers", async () => {
  const { api, clock, store } = rig();
  api.hubs = new Error("connection refused");
  store.connect();
  await flush();
  assert.equal(store.snapshot.server.reachable, false);
  assert.equal(store.snapshot.listLoaded, false);
  assert.deepEqual(clock.pending(), [2000, 5000], "a retry at 2 s, the tick at 5 s");
  await clock.advance(2000);
  assert.equal(api.count("hubs"), 2);
  assert.ok(clock.pending().includes(3000), "the next retry backs off to 3 s");
  await clock.advance(3000);
  assert.equal(api.count("hubs"), 3);
  await clock.advance(5000);
  // Ticks do not read the list while unreachable; the retry owns the cadence.
  assert.equal(api.count("hubs"), 4);
  api.hubs = [hub()];
  await clock.advance(10000);
  assert.equal(store.snapshot.server.reachable, true);
  assert.equal(store.snapshot.listLoaded, true);
  const before = api.count("hubs");
  await clock.advance(5000);
  assert.equal(api.count("hubs"), before + 1, "reachable again: the tick reads the list");
  store.disconnect();
});

test("job frames mutate the hub record; a finished job leaves a notice that expires and is then acknowledged", async () => {
  const { api, clock, storage, store, socket } = rig();
  store.connect();
  await flush();
  socket().open();
  await flush();
  socket().push({ type: "job_event", hub_id: "a", job: job({ status: "queued" }) });
  assert.equal(rt(store).hub.active_job?.status, "queued");
  socket().push({ type: "job_event", hub_id: "a", job: job({ progress: { completed_steps: 1, total_steps: 3 } }) });
  assert.equal(rt(store).hub.active_job?.progress?.completed_steps, 1);
  const hubsBefore = api.count("hubs");
  socket().push({ type: "job_event", hub_id: "a", job: job({ status: "done", finished_at: "2026-09-17T10:00:09Z" }) });
  assert.equal(rt(store).hub.active_job, null);
  assert.equal(rt(store).hub.last_job?.status, "done");
  assert.deepEqual(rt(store).notice, { tone: "success", label: "Refreshing the hub: done", detail: null, jobId: "j1", sticky: false, at: clock.now });
  await clock.advance(300);
  assert.equal(api.count("hubs"), hubsBefore + 1, "a terminal frame reloads the hub list");
  await clock.advance(6000);
  assert.equal(rt(store).notice, null, "the success notice expired");
  assert.deepEqual(loadAcks(storage), { a: "j1" });
  store.disconnect();
});

test("a finished job announced again (a staged backup bundle downloaded or expired) is no new ending", async () => {
  const { api, clock, store, socket } = rig();
  store.connect();
  await flush();
  socket().open();
  await flush();
  const backup = job({ job_id: "b1", kind: "backup", status: "done", cancellable: false, finished_at: "2026-09-17T10:00:09Z", result: { bundle_available: true, bundle_downloaded: false } });
  api.hubs = [hub({ last_job: backup })];
  socket().push({ type: "job_event", hub_id: "a", job: backup });
  assert.equal(rt(store).notice?.label, "Making a backup: done");
  store.dismissNotice("a");

  // The same job, downloaded: the record follows, the notice does not come back.
  const downloaded = { ...backup, result: { bundle_available: true, bundle_downloaded: true } };
  socket().push({ type: "job_event", hub_id: "a", job: downloaded });
  assert.deepEqual(rt(store).hub.last_job?.result, { bundle_available: true, bundle_downloaded: true });
  assert.equal(rt(store).notice, null);

  // A newer job ends and its notice expires; the old backup's expiry must not take last_job back or speak again.
  const refresh = job({ job_id: "j2", status: "done", created_at: "2026-09-17T10:02:00Z", finished_at: "2026-09-17T10:02:05Z" });
  api.hubs = [hub({ last_job: refresh })];
  socket().push({ type: "job_event", hub_id: "a", job: refresh });
  await clock.advance(6500);
  assert.equal(rt(store).notice, null);
  socket().push({ type: "job_event", hub_id: "a", job: { ...backup, result: { bundle_available: false, bundle_expired: true } } });
  assert.equal(rt(store).hub.last_job?.job_id, "j2");
  assert.equal(rt(store).notice, null);
  store.disconnect();
});

test("a failed job is sticky until dismissed; the acknowledgement stops a reload from repeating it", async () => {
  const storage = new MemoryStorage();
  const failed = job({ status: "failed", finished_at: "2026-09-17T10:00:09Z", error: { type: "hub_disconnected", title: "Hub disconnected", status: 503, detail: "went away" } });
  const first = rig({ storage });
  first.store.connect();
  await flush();
  first.socket().open();
  await flush();
  first.socket().push({ type: "job_event", hub_id: "a", job: failed });
  assert.equal(rt(first.store).notice?.tone, "error");
  assert.equal(rt(first.store).notice?.sticky, true);
  await first.clock.advance(60000);
  assert.equal(rt(first.store).notice?.jobId, "j1", "still there a minute later");
  first.store.dismissNotice("a");
  assert.equal(rt(first.store).notice, null);
  first.store.disconnect();

  // A reload: the server still lists the failure as last_job, but it was seen.
  const api = new FakeApi();
  api.hubs = [hub({ last_job: failed })];
  const second = rig({ storage, api });
  second.store.connect();
  await flush();
  assert.equal(rt(second.store).notice, null);
  second.store.disconnect();
});

test("on load an unacknowledged recent job shows its notice; an old one does not", async () => {
  const finishedAt = "2026-09-17T10:00:09Z";
  const recent = new FakeApi();
  recent.hubs = [hub({ last_job: job({ status: "done", finished_at: finishedAt }) })];
  const a = rig({ api: recent, now: Date.parse(finishedAt) + 60_000 });
  a.store.connect();
  await flush();
  assert.equal(rt(a.store).notice?.label, "Refreshing the hub: done");
  a.store.disconnect();

  const old = new FakeApi();
  old.hubs = [hub({ last_job: job({ status: "done", finished_at: finishedAt }) })];
  const b = rig({ api: old, now: Date.parse(finishedAt) + 2 * 24 * 60 * 60 * 1000 });
  b.store.connect();
  await flush();
  assert.equal(rt(b.store).notice, null);
  b.store.disconnect();
});

test("every stream connect is a resync; a new instance id means the server restarted", async () => {
  const { api, store, socket } = rig();
  store.connect();
  await flush();
  const hubsAfterConnect = api.count("hubs");
  socket().open();
  await flush();
  assert.equal(api.count("hubs"), hubsAfterConnect + 1, "the connect re-read the list");
  socket().push({ type: "hello", instance_id: "i1", hubs: [] });
  assert.equal(store.snapshot.server.instanceId, "i1");
  assert.equal(store.snapshot.message, null);

  socket().push({ type: "job_event", hub_id: "a", job: job({ status: "failed", finished_at: "2026-09-17T10:00:09Z" }) });
  assert.equal(rt(store).notice?.tone, "error");
  socket().drop();
  await new Promise((resolve) => setTimeout(resolve, 20));
  socket().open();
  await flush();
  const before = api.count("hubs");
  socket().push({ type: "hello", instance_id: "i2", hubs: [] });
  await flush();
  assert.equal(store.snapshot.server.instanceId, "i2");
  assert.equal(rt(store).notice, null, "the old server's notices are gone");
  assert.deepEqual(store.snapshot.message, { text: "The server restarted; state reloaded.", ok: true });
  assert.equal(api.count("hubs"), before + 1);
  store.disconnect();
});

test("lifecycle frames reload the list once per burst; other frames do not", async () => {
  const { api, clock, store, socket } = rig();
  store.connect();
  await flush();
  socket().open();
  await flush();
  const before = api.count("hubs");
  socket().push({ type: "server_event", hub_id: "a", kind: "hub_enabled" });
  socket().push({ type: "hub_event", hub_id: "a", event: { kind: "catalog_ready", seq: 1 } });
  socket().push({ type: "hub_event", hub_id: "a", event: { kind: "activity_changed", seq: 2 } });
  socket().push({ type: "press", seq: 1, hub_id: "a" });
  assert.equal(api.count("hubs"), before);
  await clock.advance(300);
  assert.equal(api.count("hubs"), before + 1);
  assert.equal(store.snapshot.stream.messageCount, 4);
  store.disconnect();
});

test("runLocal marks the hub busy for the call's duration, also when it throws", async () => {
  const { store } = rig();
  store.connect();
  await flush();
  let inside: string | null = null;
  const result = await store.runLocal("a", "rename", "Renaming", async () => {
    inside = rt(store).localBusy?.label ?? null;
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(inside, "Renaming");
  assert.equal(rt(store).localBusy, null);
  await assert.rejects(store.runLocal("a", "send", "Sending", async () => {
    throw new Error("boom");
  }));
  assert.equal(rt(store).localBusy, null);
  store.disconnect();
});

test("a job-conflict answer is a resync, not an error; other answers are left to the caller", async () => {
  const { api, store } = rig();
  store.connect();
  await flush();
  const before = api.count("hubs");
  assert.equal(store.noteResponse("a", ok({ type: "hub_job_running", title: "A job holds the hub", status: 409 }, 409)), true);
  await flush();
  assert.equal(api.count("hubs"), before + 1);
  assert.equal(store.noteResponse("a", ok({ type: "hub_disabled", title: "Disabled", status: 409 }, 409)), false);
  assert.equal(store.noteResponse("a", ok({ type: "validation_error", title: "Invalid", status: 422 }, 422)), false);
  assert.equal(api.count("hubs"), before + 1);
  store.disconnect();
});

test("selection follows a removal and a re-key, is persisted, and reads the hub's stopped applies", async () => {
  const storage = new MemoryStorage();
  const api = new FakeApi();
  api.hubs = [hub({ hub_id: "192.168.1.50" }), hub({ hub_id: "b" })];
  api.applies = [
    { apply_id: "x", hub_id: "b", status: "success", resumable: false, job_id: null, created_at: "", updated_at: "" },
    { apply_id: "y", hub_id: "b", status: "stopped", resumable: true, job_id: null, created_at: "", updated_at: "" },
  ];
  const { store, clock } = rig({ storage, api });
  store.connect();
  await flush();
  assert.equal(store.snapshot.selectedHubId, "192.168.1.50");
  store.selectHub("b");
  await flush();
  assert.deepEqual(rt(store, "b").stoppedApplies.map((a) => a.apply_id), ["y"]);
  assert.equal(JSON.parse(storage.getItem("sofabaton-panel")!).hub, "b");
  // The first hub re-keys to its MAC; the selection stays on b, the list follows.
  api.hubs = [hub({ hub_id: "aabbccddeeff" }), hub({ hub_id: "b" })];
  await clock.advance(5000);
  assert.deepEqual(store.snapshot.hubs.map((r) => r.hub.hub_id), ["aabbccddeeff", "b"]);
  assert.equal(store.snapshot.selectedHubId, "b");
  api.hubs = [hub({ hub_id: "aabbccddeeff" })];
  await clock.advance(5000);
  assert.equal(store.snapshot.selectedHubId, "aabbccddeeff", "the removed hub's selection moved to the first");
  api.hubs = [];
  await clock.advance(5000);
  assert.equal(store.snapshot.selectedHubId, null);
  store.disconnect();
});

test("cancelActiveJob asks the server only for a live, cancellable job", async () => {
  const { api, store, socket } = rig();
  store.connect();
  await flush();
  socket().open();
  await flush();
  assert.equal(await store.cancelActiveJob("a"), false);
  socket().push({ type: "job_event", hub_id: "a", job: job({ cancellable: false }) });
  assert.equal(await store.cancelActiveJob("a"), false);
  socket().push({ type: "job_event", hub_id: "a", job: job({ job_id: "j2", cancellable: true }) });
  assert.equal(await store.cancelActiveJob("a"), true);
  assert.deepEqual(api.cancelled, ["a/j2"]);
  store.disconnect();
});

test("acknowledgements survive a broken store and ignore junk", () => {
  assert.deepEqual(loadAcks(null), {});
  const storage = new MemoryStorage();
  storage.setItem("sofabaton-panel-acks", "not json");
  assert.deepEqual(loadAcks(storage), {});
  storage.setItem("sofabaton-panel-acks", JSON.stringify({ a: "j1", b: 7, c: null }));
  assert.deepEqual(loadAcks(storage), { a: "j1" });
  saveAcks(storage, { a: "j9" });
  assert.deepEqual(loadAcks(storage), { a: "j9" });
  saveAcks(null, { a: "j9" });
});

test("routes: the URL wins over the preferences, a hub route follows the selection, no hubs lands on setup", async () => {
  const storage = new MemoryStorage();
  storage.setItem("sofabaton-panel", JSON.stringify({ hub: "b", tab: "remote", sub: "layout", theme: "dark" }));
  const api = new FakeApi();
  api.hubs = [hub({ hub_id: "a" }), hub({ hub_id: "b" })];
  // A bare URL: the preferences fill it in.
  const bare = rig({ storage, api });
  assert.deepEqual(bare.store.snapshot.route, { kind: "hub", hubId: "b", tab: "remote", sub: "layout" });
  assert.equal(bare.store.snapshot.selectedHubId, "b");
  assert.equal(bare.store.snapshot.theme, "dark");
  // A hub in the URL becomes the selection.
  const deep = rig({ storage, api, initialRoute: hubRoute("a", "backup", "restore") });
  assert.equal(deep.store.snapshot.selectedHubId, "a");
  deep.store.connect();
  await flush();
  assert.deepEqual(deep.store.snapshot.route, { kind: "hub", hubId: "a", tab: "backup", sub: "restore" });
  // A tab click keeps the hub; a tool page keeps the selection and remembers the way back.
  deep.store.navigate(hubRoute(null, "hub", "nonsense"));
  assert.deepEqual(deep.store.snapshot.route, { kind: "hub", hubId: "a", tab: "hub", sub: "activities" });
  assert.equal(deep.store.snapshot.routeReplace, false);
  deep.store.navigate(toolRoute("debug", "api"));
  assert.deepEqual(deep.store.snapshot.route, { kind: "tool", page: "debug", sub: "api" });
  assert.deepEqual(deep.store.lastHubRoute(), { kind: "hub", hubId: "a", tab: "hub", sub: "activities" });
  assert.equal(JSON.parse(storage.getItem("sofabaton-panel")!).tab, "hub");
  // Picking another hub on a tool page changes the selection only; on a hub route the route follows.
  deep.store.selectHub("b");
  assert.deepEqual(deep.store.snapshot.route, { kind: "tool", page: "debug", sub: "api" });
  deep.store.navigate(hubRoute(null, "remote"));
  assert.deepEqual(deep.store.snapshot.route, { kind: "hub", hubId: "b", tab: "remote", sub: "card" });
  deep.store.selectHub("a");
  assert.deepEqual(deep.store.snapshot.route, { kind: "hub", hubId: "a", tab: "remote", sub: "card" });
  assert.equal(deep.store.snapshot.routeReplace, true);
  // An open editor does not follow: the id means something else on the other hub.
  deep.store.navigate(hubRoute(null, "hub", "devices", 12));
  assert.deepEqual(deep.store.snapshot.route, { kind: "hub", hubId: "a", tab: "hub", sub: "devices", entity: 12 });
  deep.store.selectHub("b");
  assert.deepEqual(deep.store.snapshot.route, { kind: "hub", hubId: "b", tab: "hub", sub: "devices" });
  deep.store.selectHub("a");
  // A hub the list does not know falls back to the first; an empty list lands on setup.
  deep.store.navigate(hubRoute("zzz", "hub"));
  await deep.clock.advance(5000);
  assert.equal(deep.store.snapshot.selectedHubId, "a");
  assert.deepEqual(deep.store.snapshot.route, { kind: "hub", hubId: "a", tab: "hub", sub: "activities" });
  api.hubs = [];
  await deep.clock.advance(5000);
  assert.deepEqual(deep.store.snapshot.route, { kind: "tool", page: "setup", sub: "hubs" });
  assert.equal(deep.store.snapshot.selectedHubId, null);
  deep.store.disconnect();
});

test("a message clears itself; a newer one is left alone", async () => {
  const { clock, store } = rig();
  store.connect();
  await flush();
  store.say("added x");
  assert.deepEqual(store.snapshot.message, { text: "added x", ok: true });
  await clock.advance(4000);
  store.say("removed y", false);
  await clock.advance(4500);
  assert.deepEqual(store.snapshot.message, { text: "removed y", ok: false });
  await clock.advance(4000);
  assert.equal(store.snapshot.message, null);
  store.disconnect();
});

test("a cancel is remembered on the record until the job ends; a refused one is forgotten", async () => {
  const { api, store, socket } = rig();
  store.connect();
  await flush();
  socket().open();
  await flush();
  socket().push({ type: "job_event", hub_id: "a", job: job({ cancellable: true }) });
  assert.equal(await store.cancelActiveJob("a"), true);
  assert.equal(rt(store).cancelRequestedJobId, "j1");
  assert.equal(await store.cancelActiveJob("a"), true, "asking twice sends once");
  assert.deepEqual(api.cancelled, ["a/j1"]);
  socket().push({ type: "job_event", hub_id: "a", job: job({ cancellable: true, status: "cancelled", finished_at: "2026-09-17T10:00:09Z" }) });
  assert.equal(rt(store).cancelRequestedJobId, null);
  assert.equal(rt(store).notice?.label, "Refreshing the hub: cancelled");

  api.cancelJob = async () => ok({ type: "job_not_cancellable", title: "x", status: 409 }, 409) as unknown as ApiResponse<JobView>;
  socket().push({ type: "job_event", hub_id: "a", job: job({ job_id: "j2", cancellable: true }) });
  assert.equal(await store.cancelActiveJob("a"), false);
  assert.equal(rt(store).cancelRequestedJobId, null);
  assert.equal(store.snapshot.message?.ok, false);
  store.disconnect();
});

test("a stopped apply is resumed as a job or discarded, and the records reload either way", async () => {
  const api = new FakeApi();
  api.applies = [
    { apply_id: "y", hub_id: "a", status: "stopped", resumable: true, job_id: null, created_at: "", updated_at: "" },
    { apply_id: "z", hub_id: "a", status: "cancelled", resumable: true, job_id: null, created_at: "", updated_at: "" },
  ];
  const { store } = rig({ api });
  store.connect();
  await flush();
  assert.deepEqual(rt(store).stoppedApplies.map((a) => a.apply_id), ["y", "z"]);
  assert.equal(await store.resumeApply("a", "y"), true);
  assert.deepEqual(api.resumed, ["a/y"]);
  assert.equal(rt(store).hub.active_job?.kind, "resume_apply");
  assert.deepEqual(rt(store).stoppedApplies.map((a) => a.apply_id), ["z"]);
  assert.equal(await store.discardApply("a", "z"), true);
  assert.deepEqual(api.discarded, ["a/z"]);
  assert.deepEqual(rt(store).stoppedApplies, []);
  store.disconnect();
});

test("a press frame lands on its hub's record with the panel's clock", async () => {
  const { clock, store, socket } = rig();
  store.connect();
  await flush();
  socket().open();
  await flush();
  socket().push({ type: "press", seq: 7, hub_id: "a", device_id: 61, device_key: "a1b2c3d4", command_id: 12, slot: 2, label: "Lights", press_type: "long", resolution: "deployed", transport: "http" });
  // The slot, the key and the command ride along: the Wifi Devices view lights the matching tile with them.
  assert.deepEqual(rt(store).lastPress, { seq: 7, deviceId: 61, deviceKey: "a1b2c3d4", slot: 2, commandId: 12, label: "Lights", pressType: "long", resolution: "deployed", at: clock.now });
  socket().push({ type: "press", seq: 8, hub_id: "nope", device_id: 61, label: "x", press_type: "short" });
  assert.equal(rt(store).lastPress?.seq, 7);
  store.disconnect();
});

test("a draft is kept on the record, mirrored to storage, and cleared on discard", async () => {
  const storage = new MemoryStorage();
  const { clock, store } = rig({ storage });
  store.connect();
  await flush();
  assert.equal(rt(store).draft, null);
  store.setDraft("a", { scope: "hub/devices", snapshotId: "snap-1", data: { renamed: "TV" } });
  assert.deepEqual(rt(store).draft, { scope: "hub/devices", snapshotId: "snap-1", data: { renamed: "TV" }, updatedAt: clock.now });
  assert.equal(rt(store).draftCheck, "fresh");
  assert.equal(JSON.parse(storage.getItem("sofabaton-panel-draft:a")!).scope, "hub/devices");
  store.discardDraft("a");
  assert.equal(rt(store).draft, null);
  assert.equal(storage.getItem("sofabaton-panel-draft:a"), null);
  store.disconnect();
});

test("a restored draft is checked against the hub's snapshot: fresh restores silently, stale asks, keep remembers", async () => {
  const storage = new MemoryStorage();
  storage.setItem("sofabaton-panel-draft:a", JSON.stringify({ scope: "hub/devices", snapshotId: "snap-1", data: 1, updatedAt: 5 }));
  const fresh = rig({ storage });
  fresh.store.connect();
  await flush();
  assert.equal(rt(fresh.store).draftCheck, "fresh");
  assert.equal(fresh.api.count("snapshot:a"), 1);
  fresh.store.disconnect();

  const moved = new FakeApi();
  moved.snapshotId = "snap-2";
  const stale = rig({ storage, api: moved });
  stale.store.connect();
  await flush();
  assert.equal(rt(stale.store).draftCheck, "stale");
  stale.store.keepStaleDraft("a");
  assert.equal(rt(stale.store).draftCheck, "kept");
  assert.equal(JSON.parse(storage.getItem("sofabaton-panel-draft:a")!).acceptedStale, true);
  stale.store.disconnect();

  // A reload after "keep" does not ask again, and reads no snapshot for it.
  const again = rig({ storage, api: new FakeApi() });
  again.store.connect();
  await flush();
  assert.equal(rt(again.store).draftCheck, "kept");
  assert.equal(again.api.count("snapshot:a"), 0);
  again.store.disconnect();

  // Junk in storage is no draft.
  storage.setItem("sofabaton-panel-draft:a", "{not json");
  const junk = rig({ storage });
  junk.store.connect();
  await flush();
  assert.equal(rt(junk.store).draft, null);
  junk.store.disconnect();
});
