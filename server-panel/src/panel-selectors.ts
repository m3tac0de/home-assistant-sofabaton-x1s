// Everything the panel derives from its snapshot (docs/internal/
// server-panel-state-plan.md, decisions 3, 6, 7, 11): which hub is
// selected, what gates it, whether it is busy and by what, whether a
// view may be touched, what the bottom dock should say, and how a job
// reads as a phrase. Pure functions over the snapshot, so the node
// tests cover them without a DOM.

import type { HubView, JobView } from "./panel-api";
import { TERMINAL_JOB_STATES } from "./panel-api";
import type { Draft, DraftCheck, HubNotice, HubRuntime, PanelSnapshot } from "./panel-store";

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
export type Gate = "server_unreachable" | "hub_disabled" | "hub_offline" | "app_holds_hub" | "first_sync" | "pass";

export function gateFor(snapshot: PanelSnapshot, runtime: HubRuntime | null): Gate {
  if (!snapshot.server.reachable) return "server_unreachable";
  if (!runtime) return "pass";
  const hub = runtime.hub;
  if (!hub.enabled || !hub.status) return "hub_disabled";
  if (!hub.status.hub_connected || hub.status.mode === "disconnected") return "hub_offline";
  if (hub.status.mode === "observe") return "app_holds_hub";
  if (!hub.status.catalog_ready) return "first_sync";
  return "pass";
}

export const GATE_LABELS: Record<Exclude<Gate, "pass">, string> = {
  server_unreachable: "The server is not answering",
  hub_disabled: "This hub is disabled",
  hub_offline: "Waiting for the hub to connect",
  app_holds_hub: "The Sofabaton app holds the hub",
  first_sync: "First sync running",
};

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
  refresh_entity: "Refreshing an entity",
  sync_device: "Writing a device",
  sync_activity: "Writing an activity",
  sync_hub: "Applying the document",
  resume_apply: "Resuming the apply",
  backup: "Making a backup",
  restore: "Restoring",
  erase: "Erasing the hub",
  learn_ir: "Learning an IR code",
  deploy_callback_device: "Deploying the callback device",
  update_callback_device: "Updating the callback device",
  remove_callback_device: "Removing the callback device",
  redeploy_callback_device: "Redeploying the callback device",
};

export function jobLabel(kind: string): string {
  return JOB_LABELS[kind] ?? kind;
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

/** "Restoring · Writing device 8 · 3/12" style, from the kind and the last progress. */
export function jobNarration(job: JobView): string {
  const parts: string[] = [jobLabel(job.kind)];
  const p = (job.progress ?? {}) as Record<string, unknown>;
  const message = typeof p.message === "string" ? p.message.trim() : "";
  if (message) parts.push(message);
  const entityKind = typeof p.entity_kind === "string" ? p.entity_kind : null;
  const entityId = typeof p.entity_id === "number" ? p.entity_id : null;
  if (entityId !== null && !message.includes(String(entityId))) parts.push(`${entityKind ?? "entity"} ${entityId}`);
  const itemIndex = typeof p.item_index === "number" ? p.item_index : null;
  const itemCount = typeof p.item_count === "number" ? p.item_count : null;
  if (itemIndex !== null && itemCount !== null && itemCount > 0) parts.push(`item ${itemIndex + 1}/${itemCount}`);
  const progress = jobProgress(job);
  if (!progress.indeterminate) parts.push(`${progress.current ?? 0}/${progress.total}`);
  else if (job.status === "queued") parts.push("queued");
  return parts.join(" · ");
}

/** The notice a finished job leaves (decision 6); null while it is not finished. */
export function noticeForJob(job: JobView, at: number): HubNotice | null {
  if (!TERMINAL_JOB_STATES.has(job.status)) return null;
  const label = jobLabel(job.kind);
  if (job.status === "failed") {
    const problem = job.error;
    const head = problem?.title || problem?.type || "failed";
    return { tone: "error", label: `${label}: ${head}`, detail: problem?.detail ?? null, jobId: job.job_id, sticky: true, at };
  }
  if (job.status === "cancelled") return { tone: "neutral", label: `${label}: cancelled`, detail: null, jobId: job.job_id, sticky: false, at };
  return { tone: "success", label: `${label}: done`, detail: null, jobId: job.job_id, sticky: false, at };
}

// -- the dock ---------------------------------------------------------------------------------

export type DockModel =
  | { kind: "running"; job: JobView; text: string; progress: JobProgressModel; cancellable: boolean; cancelling: boolean }
  | { kind: "notice"; notice: HubNotice }
  | { kind: "apply_stopped"; applyId: string; resumable: boolean; text: string }
  | { kind: "draft_stale"; scope: string; text: string }
  | { kind: "dirty"; scope: string; text: string }
  | { kind: "gate"; gate: Exclude<Gate, "pass">; text: string }
  | { kind: "idle" };

/** The hub's unsaved work when there is any (decision 8). */
export function draftFor(runtime: HubRuntime | null): { draft: Draft; check: DraftCheck } | null {
  if (!runtime?.draft) return null;
  return { draft: runtime.draft, check: runtime.draftCheck };
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
export function dockModel(snapshot: PanelSnapshot, runtime: HubRuntime | null): DockModel {
  const job = activeJob(runtime?.hub);
  if (job) {
    const cancelling = runtime?.cancelRequestedJobId === job.job_id;
    return { kind: "running", job, text: cancelling ? `${jobNarration(job)} · cancelling` : jobNarration(job), progress: jobProgress(job), cancellable: job.cancellable, cancelling };
  }
  if (runtime?.notice) return { kind: "notice", notice: runtime.notice };
  const stopped = runtime?.stoppedApplies[0];
  if (stopped) return { kind: "apply_stopped", applyId: stopped.apply_id, resumable: stopped.resumable, text: `An apply stopped (${stopped.status}); ${stopped.resumable ? "resume or discard it" : "discard it"}` };
  const draft = draftFor(runtime);
  if (draft?.check === "stale") return { kind: "draft_stale", scope: draft.draft.scope, text: "Unsaved changes from an older snapshot: the hub moved on" };
  if (draft) return { kind: "dirty", scope: draft.draft.scope, text: draftBannerText(draft.draft.scope) };
  const gate = gateFor(snapshot, runtime);
  if (gate === "server_unreachable" || (gate !== "pass" && runtime)) return { kind: "gate", gate, text: GATE_LABELS[gate] };
  return { kind: "idle" };
}

export interface Connectivity {
  hub: boolean;
  app: boolean;
}

export function connectivityFor(runtime: HubRuntime | null): Connectivity {
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
