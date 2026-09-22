// The panel's selectors (docs/internal/server-panel-state-plan.md, SP2):
// gates, busy, interaction, the job phrases and progress, the notice a
// finished job leaves, the dock model's precedence, the list summary.

import assert from "node:assert/strict";
import test from "node:test";

import type { HubStatus, HubView, JobView } from "../../server-panel/src/panel-api";
import {
  busyFor,
  connectivityFor,
  dockModel,
  gateFor,
  hubsSummary,
  interactionFor,
  jobLabel,
  jobHeadline,
  jobNarration,
  jobProgress,
  noticeForJob,
  runtimeFor,
  selectedHub,
} from "../../server-panel/src/panel-selectors";
import { hubRoute } from "../../server-panel/src/panel-route";
import type { HubRuntime, PanelSnapshot } from "../../server-panel/src/panel-store";

function hub(overrides: Partial<Omit<HubView, "status">> & { status?: Partial<HubStatus> | null } = {}): HubView {
  const base: HubView = {
    hub_id: "e26a44861b45",
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
  };
  const status: HubStatus | null = overrides.status === null ? null : overrides.status ? { ...base.status!, ...overrides.status } : base.status;
  return { ...base, ...overrides, status };
}

function job(overrides: Partial<JobView> = {}): JobView {
  return {
    job_id: "j1",
    hub_id: "e26a44861b45",
    kind: "restore",
    status: "running",
    cancellable: false,
    created_at: "2026-09-17T10:00:00Z",
    started_at: "2026-09-17T10:00:01Z",
    finished_at: null,
    progress: null,
    result: null,
    error: null,
    ...overrides,
  };
}

function runtime(h: HubView = hub(), extra: Partial<HubRuntime> = {}): HubRuntime {
  return { hub: h, localBusy: null, notice: null, stoppedApplies: [], cancelRequestedJobId: null, lastPress: null, draft: null, draftCheck: "unchecked", ...extra };
}

function snapshot(runtimes: HubRuntime[], extra: Partial<PanelSnapshot> = {}): PanelSnapshot {
  return {
    server: { info: null, reachable: true, error: null, instanceId: null },
    stream: { connected: true, messageCount: 0 },
    hubs: runtimes,
    listLoaded: true,
    seen: [],
    operations: [],
    selectedHubId: runtimes[0]?.hub.hub_id ?? null,
    route: hubRoute(runtimes[0]?.hub.hub_id ?? null),
    routeReplace: true,
    theme: "auto",
    message: null,
    ...extra,
  };
}

test("selection: the runtime and hub for the selected id, null otherwise", () => {
  const r = runtime();
  const s = snapshot([r]);
  assert.equal(runtimeFor(s, "e26a44861b45"), r);
  assert.equal(runtimeFor(s, "nope"), null);
  assert.equal(selectedHub(s)?.hub_id, "e26a44861b45");
  assert.equal(selectedHub(snapshot([r], { selectedHubId: null })), null);
});

test("gates, in the order the panel checks them", () => {
  const r = runtime();
  assert.equal(gateFor(snapshot([r], { server: { info: null, reachable: false, error: null, instanceId: null } }), r), "server_unreachable");
  assert.equal(gateFor(snapshot([r]), runtime(hub({ enabled: false }))), "hub_disabled");
  assert.equal(gateFor(snapshot([r]), runtime(hub({ status: null }))), "hub_disabled");
  assert.equal(gateFor(snapshot([r]), runtime(hub({ status: { hub_connected: false } }))), "hub_offline");
  assert.equal(gateFor(snapshot([r]), runtime(hub({ status: { mode: "disconnected" } }))), "hub_offline");
  assert.equal(gateFor(snapshot([r]), runtime(hub({ status: { mode: "observe", app_connected: true } }))), "app_holds_hub");
  assert.equal(gateFor(snapshot([r]), runtime(hub({ status: { catalog_ready: false } }))), "first_sync");
  assert.equal(gateFor(snapshot([r]), r), "pass");
  assert.equal(gateFor(snapshot([]), null), "pass");
});

test("busy: a live job first, then a local call, else nothing; a finished active_job does not count", () => {
  assert.equal(busyFor(null), null);
  assert.equal(busyFor(runtime()), null);
  const running = runtime(hub({ active_job: job() }), { localBusy: { key: "rename", label: "Renaming" } });
  assert.deepEqual(busyFor(running), { kind: "job", job: job() });
  assert.deepEqual(busyFor(runtime(hub(), { localBusy: { key: "rename", label: "Renaming" } })), { kind: "local", key: "rename", label: "Renaming" });
  assert.equal(busyFor(runtime(hub({ active_job: job({ status: "done" }) }))), null);
});

test("interaction: a gate outranks a job, a job outranks a local call", () => {
  const busyHub = hub({ active_job: job({ progress: { phase: "device", message: "Writing device 8", completed_steps: 3, total_steps: 12 } }) });
  assert.deepEqual(interactionFor(snapshot([runtime()]), runtime(busyHub)), { kind: "blocked", reason: "job", label: "Restoring the backup · Writing device 8 · 3/12" });
  assert.deepEqual(interactionFor(snapshot([runtime()]), runtime(hub({ ...busyHub, status: { ...busyHub.status!, mode: "observe" } }))), {
    kind: "blocked",
    reason: "app_holds_hub",
    label: "The Sofabaton app holds the hub",
  });
  assert.deepEqual(interactionFor(snapshot([runtime()]), runtime(hub(), { localBusy: { key: "send", label: "Sending" } })), { kind: "blocked", reason: "local", label: "Sending" });
  assert.deepEqual(interactionFor(snapshot([runtime()]), runtime()), { kind: "free" });
});

test("job phrases: labels per kind, narration from the progress record, progress percentages", () => {
  assert.equal(jobLabel("refresh"), "Refreshing the hub");
  assert.equal(jobLabel("deploy_callback_device"), "Deploying the callback device");
  assert.equal(jobLabel("something_new"), "something_new");
  assert.equal(jobNarration(job({ kind: "refresh", status: "queued" })), "Refreshing the hub · queued");
  // A step that restates the headline replaces it: each thing is said once.
  assert.equal(jobNarration(job({ kind: "refresh", progress: { phase: "device", message: "Refreshing device 13…", completed_steps: 1, total_steps: 4, entity_kind: "device", entity_id: 13 } })), "Refreshing device 13 · 1/4");
  assert.equal(jobNarration(job({ kind: "refresh", progress: { phase: "finalizing", message: "Finalizing snapshot…", completed_steps: 4, total_steps: 4 } })), "Refreshing the hub · Finalizing snapshot · 4/4");
  assert.equal(jobNarration(job({ kind: "backup", progress: { phase: "device", message: "Backed up device 3.", completed_steps: 2, total_steps: 9, entity_kind: "device", entity_id: 3 } })), "Backed up device 3 · 2/9");
  assert.equal(jobNarration(job({ kind: "restore", progress: { phase: "activity", message: "Restoring activity 101…", completed_steps: 5, total_steps: 9, entity_kind: "activity", entity_id: 101 } })), "Restoring activity 101 · 5/9");
  // An entity's job names the entity in its headline, and keeps the headline over a restating step.
  assert.equal(jobNarration(job({ kind: "sync_device", status: "queued" })), "Syncing the device to the hub · queued");
  assert.equal(jobNarration(job({ kind: "sync_device", progress: { phase: "writing", message: "Renaming the device…", completed_steps: 1, total_steps: 5, entity_kind: "device", entity_id: 13 } })), "Syncing device 13 to the hub · Renaming the device · 1/5");
  assert.equal(jobNarration(job({ kind: "sync_device", progress: { phase: "writing", message: "Updating inputs on device 13…", completed_steps: 2, total_steps: 5, entity_kind: "device", entity_id: 13 } })), "Syncing device 13 to the hub · Updating inputs · 2/5");
  assert.equal(jobNarration(job({ kind: "sync_activity", progress: { phase: "writing", message: "Updating inputs on device 13…", completed_steps: 2, total_steps: 5, entity_kind: "activity", entity_id: 101 } })), "Syncing activity 101 to the hub · Updating inputs on device 13 · 2/5");
  assert.equal(jobNarration(job({ kind: "sync_device", progress: { phase: "completed", message: "Synced to hub.", completed_steps: 5, total_steps: 5, entity_kind: "device", entity_id: 13 } })), "Syncing device 13 to the hub · 5/5");
  assert.equal(jobNarration(job({ kind: "refresh_entity", progress: { phase: "device", message: "Refreshing device 13…", completed_steps: 0, total_steps: 1, entity_kind: "device", entity_id: 13 } })), "Refreshing device 13 · 0/1");
  assert.equal(jobHeadline(job({ kind: "refresh_entity" })), "Refreshing from the hub");
  // Two counters carry their names; an entity no phrase mentions is appended, matched as a whole number.
  assert.equal(jobNarration(job({ kind: "sync_hub", progress: { phase: "item", message: "Rename TV", completed_steps: 0, total_steps: 1, item_index: 1, item_count: 5 } })), "Applying the document · Rename TV · item 2/5 · step 0/1");
  assert.equal(jobNarration(job({ kind: "backup", progress: { phase: "reading", message: "", completed_steps: 0, total_steps: 0, entity_kind: "activity", entity_id: 101 } })), "Backing up the hub · activity 101");
  assert.equal(jobNarration(job({ kind: "sync_hub", progress: { phase: "item", message: "Creating device 113", completed_steps: 0, total_steps: 0, entity_kind: "device", entity_id: 13 } })), "Applying the document · Creating device 113 · device 13");
  assert.deepEqual(jobProgress(job({ progress: { completed_steps: 3, total_steps: 12 } })), { current: 3, total: 12, percent: 25, indeterminate: false });
  assert.deepEqual(jobProgress(job({ progress: { completed_steps: 30, total_steps: 12 } })), { current: 30, total: 12, percent: 100, indeterminate: false });
  assert.deepEqual(jobProgress(job()), { current: 0, total: null, percent: null, indeterminate: true });
});

test("noticeForJob: nothing while running; success and cancelled expire, a failure is sticky with the problem", () => {
  assert.equal(noticeForJob(job(), 5), null);
  assert.deepEqual(noticeForJob(job({ status: "done" }), 5), { tone: "success", label: "Restoring the backup: done", detail: null, jobId: "j1", sticky: false, at: 5 });
  assert.deepEqual(noticeForJob(job({ status: "cancelled", kind: "refresh" }), 5), { tone: "neutral", label: "Refreshing the hub: cancelled", detail: null, jobId: "j1", sticky: false, at: 5 });
  const failed = job({ status: "failed", error: { type: "hub_disconnected", title: "Hub disconnected", status: 503, detail: "the hub went away" } });
  assert.deepEqual(noticeForJob(failed, 5), { tone: "error", label: "Restoring the backup: Hub disconnected", detail: "the hub went away", jobId: "j1", sticky: true, at: 5 });
  assert.equal(noticeForJob(job({ status: "failed", error: null }), 5)?.label, "Restoring the backup: failed");
  assert.equal(noticeForJob(job({ status: "done", kind: "sync_device", progress: { phase: "completed", message: "Synced to hub.", completed_steps: 5, total_steps: 5, entity_kind: "device", entity_id: 13 } }), 5)?.label, "Syncing device 13 to the hub: done");
});

test("dockModel precedence: running job, notice, stopped apply, gate, idle", () => {
  const notice = { tone: "error" as const, label: "Restoring: failed", detail: null, jobId: "j0", sticky: true, at: 1 };
  const stopped = { apply_id: "a1", hub_id: "e26a44861b45", status: "stopped", resumable: true, job_id: null, created_at: "", updated_at: "" };
  const everything = runtime(hub({ active_job: job({ cancellable: true }), status: { mode: "observe" } }), { notice, stoppedApplies: [stopped] });
  const s = snapshot([everything]);
  const running = dockModel(s, everything);
  assert.equal(running.kind, "running");
  if (running.kind === "running") {
    assert.equal(running.text, "Restoring the backup");
    assert.equal(running.cancellable, true);
    assert.equal(running.cancelling, false);
    assert.equal(running.progress.indeterminate, true);
  }
  const cancelling = dockModel(s, { ...everything, cancelRequestedJobId: "j1" });
  assert.equal(cancelling.kind, "running");
  if (cancelling.kind === "running") {
    assert.equal(cancelling.text, "Restoring the backup · cancelling");
    assert.equal(cancelling.cancelling, true);
  }
  const noJob = runtime(hub({ status: { mode: "observe" } }), { notice, stoppedApplies: [stopped] });
  assert.deepEqual(dockModel(s, noJob), { kind: "notice", notice });
  const noNotice = runtime(hub({ status: { mode: "observe" } }), { stoppedApplies: [stopped] });
  assert.deepEqual(dockModel(s, noNotice), { kind: "apply_stopped", applyId: "a1", resumable: true, text: "An apply stopped (stopped); resume or discard it" });
  // A draft: stale asks, otherwise the dirty banner; both outrank a gate, a stopped apply outranks both.
  const draft = { scope: "hub/devices", snapshotId: "old", data: { x: 1 }, updatedAt: 1 };
  assert.deepEqual(dockModel(s, runtime(hub({ status: { mode: "observe" } }), { draft, draftCheck: "stale" })), { kind: "draft_stale", scope: "hub/devices", text: "Unsaved changes from an older snapshot: the hub moved on" });
  assert.deepEqual(dockModel(s, runtime(hub({ status: { mode: "observe" } }), { draft, draftCheck: "fresh" })), { kind: "dirty", scope: "hub/devices", text: "Unsaved changes" });
  assert.deepEqual(dockModel(s, runtime(hub(), { draft, draftCheck: "kept" })), { kind: "dirty", scope: "hub/devices", text: "Unsaved changes" });
  assert.deepEqual(dockModel(s, runtime(hub(), { draft, draftCheck: "unchecked" })), { kind: "dirty", scope: "hub/devices", text: "Unsaved changes" });
  assert.equal(dockModel(s, runtime(hub(), { draft, draftCheck: "stale", stoppedApplies: [stopped] })).kind, "apply_stopped");
  assert.deepEqual(dockModel(s, runtime(hub({ status: { mode: "observe" } }))), { kind: "gate", gate: "app_holds_hub", text: "The Sofabaton app holds the hub" });
  assert.deepEqual(dockModel(s, runtime()), { kind: "idle" });
  assert.deepEqual(dockModel(s, null), { kind: "idle" });
  // An unreachable server is said even with no hub selected.
  const down = snapshot([], { server: { info: null, reachable: false, error: null, instanceId: null } });
  assert.deepEqual(dockModel(down, null), { kind: "gate", gate: "server_unreachable", text: "The server is not answering" });
});

test("connectivity and the list summary", () => {
  assert.deepEqual(connectivityFor(runtime(hub({ status: { app_connected: true } }))), { hub: true, app: true });
  assert.deepEqual(connectivityFor(runtime(hub({ status: null }))), { hub: false, app: false });
  assert.deepEqual(connectivityFor(null), { hub: false, app: false });
  const two = [runtime(), runtime(hub({ hub_id: "b", status: { hub_connected: false } }))];
  assert.equal(hubsSummary(snapshot(two)), "1/2 connected");
  assert.equal(hubsSummary(snapshot([])), "");
  assert.equal(hubsSummary(snapshot(two, { server: { info: null, reachable: false, error: null, instanceId: null } })), "list unavailable");
});

test("the Backup tab's unsaved file takes the dock after a draft and before a gate, with the card's wording", () => {
  const idle = runtime();
  const s = snapshot([idle]);
  assert.deepEqual(dockModel(s, idle), { kind: "idle" });
  assert.deepEqual(dockModel(s, idle, { unsavedBackup: true }), { kind: "unsaved_backup", text: "Unsaved changes — download the edited backup" });
  const drafted = runtime(hub(), { draft: { scope: "hub/devices/4", snapshotId: "s1", data: {}, updatedAt: 1 }, draftCheck: "fresh" });
  assert.equal(dockModel(snapshot([drafted]), drafted, { unsavedBackup: true }).kind, "dirty");
  const offline = runtime(hub({ status: { hub_connected: false, controllable: false, mode: "disconnected" } }));
  assert.equal(dockModel(snapshot([offline]), offline).kind, "gate");
  assert.equal(dockModel(snapshot([offline]), offline, { unsavedBackup: true }).kind, "unsaved_backup");
});
