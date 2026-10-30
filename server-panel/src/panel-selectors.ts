// Everything the panel derives from its snapshot (docs/internal/
// server-panel-state-plan.md, decisions 3, 6, 7, 11): which hub is
// selected, what gates it, whether it is busy and by what, whether a
// view may be touched, what the bottom dock should say, and how a job
// reads as a phrase. Pure functions over the snapshot, so the node
// tests cover them without a DOM.

import {
  ENTITY_SYNC_STEP_KINDS,
  WIFI_DEPLOY_PHASES,
  WIFI_INPLACE_STEP_KINDS,
  localizeBackendProgress,
  type BackendOperation,
  type ProgressLike,
} from "../../custom_components/sofabaton_x1s/www/src/shared/utils/backend-state-localization";
import type { HubView, JobView } from "./panel-api";
import { TERMINAL_JOB_STATES, humanizeSlug, problemSummary, jobFailureReason } from "./panel-api";
import type { Draft, HubNotice, HubRuntime, PanelSnapshot } from "./panel-store";

// -- selection ----------------------------------------------------------------------

export function runtimeFor(snapshot: PanelSnapshot, hubId: string | null | undefined): HubRuntime | null {
  if (!hubId) return null;
  return snapshot.hubs.find((r) => r.hub.hub_id === hubId) ?? null;
}

export function selectedRuntime(snapshot: PanelSnapshot): HubRuntime | null {
  return runtimeFor(snapshot, snapshot.selectedHubId);
}

export function selectedHub(snapshot: PanelSnapshot): HubView | null {
  return selectedRuntime(snapshot)?.hub ?? null;
}

// -- gates ----------------------------------------------------------------------------

/** Why a hub cannot be worked on right now, or "pass". */
export type Gate = "server_unreachable" | "hub_disabled" | "hub_not_running" | "hub_offline" | "app_holds_hub" | "first_sync" | "pass";

export function gateFor(snapshot: PanelSnapshot, runtime: HubRuntime | null): Gate {
  if (!snapshot.server.reachable) return "server_unreachable";
  if (!runtime) return "pass";
  const hub = runtime.hub;
  if (!hub.enabled) return "hub_disabled";
  // Enabled but no status: the proxy did not start (the picker offers Retry start).
  if (!hub.status) return "hub_not_running";
  if (!hub.status.hub_connected || hub.status.mode === "disconnected") return "hub_offline";
  if (hub.status.mode === "observe") return "app_holds_hub";
  if (!hub.status.catalog_ready) return "first_sync";
  return "pass";
}

export const GATE_LABELS: Record<Exclude<Gate, "pass">, string> = {
  server_unreachable: "The server is not answering",
  hub_disabled: "This hub is disabled",
  hub_not_running: "The hub's proxy did not start",
  hub_offline: "Waiting for the hub to connect",
  app_holds_hub: "The Sofabaton app holds the hub",
  first_sync: "First sync running",
};

// -- the firmware floor ------------------------------------------------------------------

export interface FirmwareFloor {
  installed: number | "?";
  required: number | "?";
}

/** The hub's firmware is below the library's supported floor (`status.firmware_unsupported`,
 *  computed by the server): such a hub ACKs writes and silently drops them, so the
 *  write surfaces (the editors, Wifi Commands, Backup) show the HA card's block in
 *  their place. Reads stay open, which is why this is not a gate. */
export function firmwareFloor(hub: HubView | null | undefined): FirmwareFloor | null {
  const status = hub?.status;
  if (!status?.firmware_unsupported) return null;
  return { installed: status.firmware_version ?? "?", required: status.firmware_min_supported ?? "?" };
}

// -- busy ------------------------------------------------------------------------------

export type Busy = { kind: "job"; job: JobView } | { kind: "local"; key: string; label: string } | null;

export function activeJob(hub: HubView | null | undefined): JobView | null {
  const job = hub?.active_job ?? null;
  return job && !TERMINAL_JOB_STATES.has(job.status) ? job : null;
}

export function busyFor(runtime: HubRuntime | null): Busy {
  if (!runtime) return null;
  const job = activeJob(runtime.hub);
  if (job) return { kind: "job", job };
  if (runtime.localBusy) return { kind: "local", key: runtime.localBusy.key, label: runtime.localBusy.label };
  return null;
}

// -- interaction ---------------------------------------------------------------------------

export type Interaction = { kind: "free" } | { kind: "blocked"; reason: Exclude<Gate, "pass"> | "job" | "local"; label: string };

/** Whether a view of this hub may be touched; the reason when it may not. */
export function interactionFor(snapshot: PanelSnapshot, runtime: HubRuntime | null): Interaction {
  const gate = gateFor(snapshot, runtime);
  if (gate !== "pass") return { kind: "blocked", reason: gate, label: GATE_LABELS[gate] };
  const busy = busyFor(runtime);
  if (busy?.kind === "job") return { kind: "blocked", reason: "job", label: jobNarration(busy.job) };
  if (busy?.kind === "local") return { kind: "blocked", reason: "local", label: busy.label };
  return { kind: "free" };
}

// -- jobs as phrases ---------------------------------------------------------------------------

const JOB_LABELS: Record<string, string> = {
  refresh: "Refreshing the hub",
  refresh_entity: "Refreshing from the hub",
  sync_device: "Syncing the device to the hub",
  sync_activity: "Syncing the activity to the hub",
  add_device: "Adding the device",
  remove_device: "Deleting the device",
  add_activity: "Adding the activity",
  remove_activity: "Deleting the activity",
  reorder_devices: "Reordering the devices",
  reorder_activities: "Reordering the activities",
  rename_hub: "Renaming the hub",
  sync_hub: "Applying the document",
  resume_apply: "Resuming the apply",
  backup: "Backing up the hub",
  restore: "Restoring the backup",
  erase: "Erasing the hub",
  learn_ir: "Learning an IR code",
  deploy_callback_device: "Deploying the callback device",
  update_callback_device: "Updating the callback device",
  remove_callback_device: "Removing the callback device",
  redeploy_callback_device: "Redeploying the callback device",
  deploy_wifi_device: "Deploying the Wifi Device",
  update_wifi_device: "Syncing the Wifi Device",
  remove_wifi_device: "Deleting the Wifi Device",
  redeploy_wifi_device: "Redeploying the Wifi Device",
  test_wifi_delivery: "Testing that button presses reach the server",
};

export function jobLabel(kind: string): string {
  return JOB_LABELS[kind] ?? humanizeSlug(kind);
}

export interface JobProgressModel {
  current: number | null;
  total: number | null;
  percent: number | null;
  indeterminate: boolean;
}

export function jobProgress(job: JobView | null): JobProgressModel {
  const p = job?.progress ?? null;
  const total = Number(p?.total_steps ?? 0);
  const current = Number(p?.completed_steps ?? 0);
  const hasTotal = Number.isFinite(total) && total > 0;
  const percent = hasTotal ? Math.max(0, Math.min(100, Math.round((Math.max(0, current) / total) * 100))) : null;
  return { current: Number.isFinite(current) ? current : null, total: hasTotal ? total : null, percent, indeterminate: !hasTotal };
}

/** The jobs that work on one device or activity: their phrase names it once the progress does. */
const ENTITY_JOB_LABELS: Record<string, (entity: string) => string> = {
  refresh_entity: (entity) => `Refreshing ${entity}`,
  sync_device: (entity) => `Syncing ${entity} to the hub`,
  sync_activity: (entity) => `Syncing ${entity} to the hub`,
};

/** "device 13", from the last progress; null while it names none. */
function jobEntity(job: JobView): string | null {
  const p = (job.progress ?? {}) as Record<string, unknown>;
  if (typeof p.entity_id !== "number") return null;
  return `${typeof p.entity_kind === "string" ? p.entity_kind : "entity"} ${p.entity_id}`;
}

/** What the job is, in one phrase: "Refreshing the hub", "Syncing device 13 to the hub". */
export function jobHeadline(job: JobView): string {
  const entity = jobEntity(job);
  return entity && job.kind in ENTITY_JOB_LABELS ? ENTITY_JOB_LABELS[job.kind](entity) : jobLabel(job.kind);
}

/** A step without its closing "…" or ".", also before a counter the card put on it,
 *  so every counter reads "<step> (n/total)". */
function bareStep(text: string): string {
  return text.trim().replace(/(…|\.+)$/u, "").replace(/(…|\.+)(\s*\(\d+\s*\/\s*\d+\))$/u, "$2").trim();
}

/** The library's step message as it came; "" when there is none. */
function stepMessage(job: JobView): string {
  const message = (job.progress as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message.trim() : "";
}

/** Which of the control panel card's progress vocabularies a job speaks. */
const JOB_OPERATIONS: Record<string, BackendOperation> = {
  refresh: "cache_refresh",
  refresh_entity: "cache_refresh",
  backup: "backup_export",
  restore: "backup_restore",
  sync_device: "entity_sync",
  sync_activity: "entity_sync",
  deploy_wifi_device: "wifi_deploy",
  update_wifi_device: "wifi_deploy",
  redeploy_wifi_device: "wifi_deploy",
  test_wifi_delivery: "wifi_deploy",
  deploy_callback_device: "wifi_deploy",
  update_callback_device: "wifi_deploy",
  redeploy_callback_device: "wifi_deploy",
};

const ENTITY_PHASES = new Set(["stale_check", "plan", "settling", "cache_refresh", "completed", "complete"]);
const REFRESH_PHASES = new Set(["preparing", "finalizing", "completed", "complete"]);
const RESTORE_PHASES = new Set(["validation", "erase", "hub", "cache_warm"]);
/** The card's copy for this phase names Home Assistant: the server's own message says "the server". */
const HA_WIFI_PHASES = new Set(["testing_delivery"]);

/** The job's progress in the card's shape (the server reports the library's WriteProgress). */
function progressLike(job: JobView, operation: BackendOperation): ProgressLike {
  const p = (job.progress ?? {}) as Record<string, unknown>;
  const stepKind = typeof p.step_kind === "string" ? p.step_kind.trim().toLowerCase() : "";
  const completed = Number(p.completed_steps ?? 0);
  const entityId = typeof p.entity_id === "number" ? p.entity_id : null;
  const like: ProgressLike = {
    phase: typeof p.phase === "string" ? p.phase : null,
    step_kind: stepKind || null,
    message: typeof p.message === "string" ? p.message : null,
    completed_steps: Number.isFinite(completed) ? completed : 0,
    total_steps: typeof p.total_steps === "number" ? p.total_steps : null,
    current_device_id: p.entity_kind === "device" ? entityId : null,
    current_activity_id: p.entity_kind === "activity" ? entityId : null,
  };
  // The Wifi in-place steps count 1-based (the step being written); the library
  // reports the steps already done.
  if (operation === "wifi_deploy" && WIFI_INPLACE_STEP_KINDS[stepKind]) like.current_step = like.completed_steps! + 1;
  return like;
}

/** The step in the card's own words when the card knows it (its phases and step kinds), else "". */
function localizedStep(job: JobView): string {
  const operation = JOB_OPERATIONS[job.kind];
  const p = (job.progress ?? null) as Record<string, unknown> | null;
  if (!operation || !p) return "";
  const like = progressLike(job, operation);
  const phase = String(like.phase ?? "").trim().toLowerCase();
  const stepKind = String(like.step_kind ?? "");
  const known = operation === "wifi_deploy"
    ? !HA_WIFI_PHASES.has(phase) && Boolean(WIFI_DEPLOY_PHASES[phase] || WIFI_INPLACE_STEP_KINDS[stepKind])
    : operation === "entity_sync"
      ? ENTITY_PHASES.has(phase) || (phase === "writing" && Boolean(ENTITY_SYNC_STEP_KINDS[stepKind]))
      : operation === "backup_restore"
        ? RESTORE_PHASES.has(phase) || ((phase === "device" || phase === "activity") && p.entity_id != null)
        : REFRESH_PHASES.has(phase) || ((phase === "device" || phase === "activity") && p.entity_id != null);
  return known ? localizeBackendProgress(like, operation) : "";
}

/** "<step> (n/total)", the card's counter, once; a text that already counts keeps its own. */
function withCounter(text: string, job: JobView): string {
  if (/\d+\s*\/\s*\d+/u.test(text)) return text;
  const p = (job.progress ?? {}) as Record<string, unknown>;
  const index = p.item_index;
  const count = p.item_count;
  if (typeof index === "number" && Number.isFinite(index) && typeof count === "number" && Number.isFinite(count) && count > 0) {
    return `${text} (${Math.min(count, Math.max(1, index + 1))}/${count})`;
  }
  const progress = jobProgress(job);
  return progress.indeterminate ? text : `${text} (${Math.min(progress.total!, Math.max(0, progress.current ?? 0))}/${progress.total})`;
}

/** The running step with its counter, as the dock, the editors and the Backup tab say it:
 *  the card's words when the card knows the step, else the library's message. "" without a step. */
export function jobStepText(job: JobView | null): string {
  if (!job) return "";
  const text = bareStep(localizedStep(job) || stepMessage(job));
  return text ? withCounter(text, job) : "";
}

/** One current step, or the operation when no step is available, with one counter. */
export function jobNarration(job: JobView): string {
  const step = jobStepText(job);
  if (job.status === "queued") return `${step || jobHeadline(job)} · queued`;
  return step || withCounter(jobHeadline(job), job);
}

const JOB_COMPLETIONS: Record<string, string> = {
  refresh: "Hub refreshed.", refresh_entity: "Cache refreshed.",
  sync_device: "Device synced.", sync_activity: "Activity synced.",
  add_device: "Device added.", remove_device: "Device deleted.",
  add_activity: "Activity added.", remove_activity: "Activity deleted.",
  reorder_devices: "Device order updated.", reorder_activities: "Activity order updated.",
  rename_hub: "Hub renamed.", sync_hub: "Changes applied.", resume_apply: "Changes applied.",
  backup: "Backup completed.", restore: "Restore completed.", erase: "Hub erased.",
  learn_ir: "IR code captured.",
  deploy_callback_device: "Wifi Events deployed.", update_callback_device: "Wifi Events synced.",
  remove_callback_device: "Wifi Events deleted.", redeploy_callback_device: "Wifi Events redeployed.",
  deploy_wifi_device: "Wifi Device deployed.", update_wifi_device: "Wifi Device synced.",
  remove_wifi_device: "Wifi Device deleted.", redeploy_wifi_device: "Wifi Device redeployed.",
  test_wifi_delivery: "Delivery tested.",
};

/** A Wifi Device job whose test press did not arrive: the deploy landed, the path did not (wifi webhook plan 4.4). */
const DELIVERY_JOBS = new Set(["deploy_wifi_device", "update_wifi_device", "redeploy_wifi_device", "test_wifi_delivery",
  "deploy_callback_device", "update_callback_device", "redeploy_callback_device"]);

export function jobDeliveryFailed(job: JobView): boolean {
  if (!DELIVERY_JOBS.has(job.kind) || job.status !== "done") return false;
  const status = (job.result as { delivery?: { status?: unknown } | null } | null)?.delivery?.status;
  return status === "not_delivered" || status === "not_sent";
}

/** Compact outcomes; backend diagnostics are available through Details. */
export function noticeForJob(job: JobView, at: number): HubNotice | null {
  if (!TERMINAL_JOB_STATES.has(job.status)) return null;
  if (job.status === "failed") {
    return { tone: "error", label: jobFailureReason(job.error), detail: problemSummary(job.error) || null, jobId: job.job_id, sticky: false, at };
  }
  if (job.status === "cancelled") return { tone: "neutral", label: "Operation cancelled.", detail: null, jobId: job.job_id, sticky: false, at };
  if (jobDeliveryFailed(job)) {
    const delivery = (job.result as { delivery?: { status?: string } } | null)?.delivery;
    if (delivery?.status === "not_sent") {
      return { tone: "error", label: job.kind === "test_wifi_delivery" ? "Could not send the test command. Try again." : "Synced, but delivery could not be tested.", detail: null, jobId: job.job_id, sticky: false, at };
    }
    // The card's line: the write landed, presses do not arrive yet; the device's panel says what to allow.
    return { tone: "error", label: job.kind === "test_wifi_delivery" ? "The test command did not reach the server." : "Synced, but the test command did not reach the server.", detail: null, jobId: job.job_id, sticky: false, at };
  }
  return { tone: "success", label: JOB_COMPLETIONS[job.kind] ?? "Operation completed.", detail: null, jobId: job.job_id, sticky: false, at };
}

// -- the dock ---------------------------------------------------------------------------------

export type DockModel =
  | { kind: "running"; job: JobView; text: string; progress: JobProgressModel; cancellable: boolean; cancelling: boolean }
  | { kind: "notice"; notice: HubNotice }
  | { kind: "apply_stopped"; applyId: string; resumable: boolean; text: string }
  | { kind: "dirty"; scope: string; text: string }
  | { kind: "unsaved_backup"; text: string }
  | { kind: "unsynced_view"; text: string }
  | { kind: "gate"; gate: Exclude<Gate, "pass">; text: string }
  | { kind: "idle" };

/** The hub's unsaved work when there is any (decision 8). */
export function draftFor(runtime: HubRuntime | null): Draft | null {
  return runtime?.draft ?? null;
}

export function hasDirtyDraft(runtime: HubRuntime | null): boolean {
  return Boolean(runtime?.draft);
}

/** An editor's draft (a scope with an entity id, `hub/devices/12`) carries the
 *  HA card's banner; other drafts keep the panel's wording (device editor
 *  plan, decision 3). */
export function draftBannerText(scope: string): string {
  return /\/\d+$/.test(scope) ? "Unsynced changes — sync to the hub to apply them" : "Unsaved changes";
}

/** What the bottom dock narrates for a hub, by the card's precedence: a
 *  running job, then a notice, then a stopped apply, then a gate, then idle.
 *  An unreachable server is said even with no hub selected. */
export function dockModel(snapshot: PanelSnapshot, runtime: HubRuntime | null, view: { unsavedBackup?: boolean; unsyncedWifi?: boolean; unsavedLayout?: boolean } = {}): DockModel {
  const job = activeJob(runtime?.hub);
  if (job) {
    const cancelling = runtime?.cancelRequestedJobId === job.job_id;
    return { kind: "running", job, text: cancelling ? `${jobNarration(job)} · cancelling` : jobNarration(job), progress: jobProgress(job), cancellable: job.cancellable, cancelling };
  }
  if (runtime?.notice) return { kind: "notice", notice: runtime.notice };
  const stopped = runtime?.stoppedApplies[0];
  if (stopped) return { kind: "apply_stopped", applyId: stopped.apply_id, resumable: stopped.resumable, text: `${stopped.status === "cancelled" ? "An apply was cancelled partway" : "An apply stopped partway"}; ${stopped.resumable ? "resume or discard it" : "discard it"}` };
  // A draft from an older snapshot is no question for the dock: the editor
  // carries it over to the hub's current state when it opens (bundle-rebase.ts).
  const draft = draftFor(runtime);
  if (draft) return { kind: "dirty", scope: draft.scope, text: draftBannerText(draft.scope) };
  // The Backup tab's edited file (the card's banner): kept in the browser's edit session, so nothing to discard here.
  if (view.unsavedBackup) return { kind: "unsaved_backup", text: "Unsaved changes — download the edited backup" };
  // The Wifi Device's draft lives in its view (wifi commands plan, section 3); Sync to Hub is up in the view's header.
  if (view.unsyncedWifi) return { kind: "unsynced_view", text: "Unsynced changes — sync to the hub to apply them" };
  // The Remote > Layout document lives in its view; Save is in the view (CR-F5a-4).
  if (view.unsavedLayout) return { kind: "unsynced_view", text: "Unsaved layout changes — Save keeps them" };
  const gate = gateFor(snapshot, runtime);
  if (gate === "server_unreachable" || (gate !== "pass" && runtime)) return { kind: "gate", gate, text: GATE_LABELS[gate] };
  return { kind: "idle" };
}

export interface Connectivity {
  /** null means the server cannot currently confirm the connection. */
  hub: boolean | null;
  app: boolean | null;
}

/** The dock's Hub/App pill. Both halves go dark while the server is unreachable:
 *  the last status is not a link anyone can use. */
export function connectivityFor(runtime: HubRuntime | null, reachable = true): Connectivity {
  if (!reachable) return { hub: null, app: null };
  const status = runtime?.hub.status ?? null;
  return { hub: Boolean(status?.hub_connected), app: Boolean(status?.app_connected) };
}

// -- the hub list ------------------------------------------------------------------------------

/** "2/3 connected", "list unavailable", or "" with no hubs. */
export function hubsSummary(snapshot: PanelSnapshot): string {
  if (!snapshot.server.reachable) return "list unavailable";
  if (!snapshot.hubs.length) return "";
  const connected = snapshot.hubs.filter((r) => r.hub.status?.hub_connected).length;
  return `${connected}/${snapshot.hubs.length} connected`;
}
