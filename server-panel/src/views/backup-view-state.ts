// The Backup tab's own pure helpers (docs/internal/server-panel-backup-plan.md):
// which finished job each section shows, the acknowledged results, and the
// edit session kept in local storage. The bundle work itself (options,
// validation, selection, prune, rename, reorder) is the HA card's
// `backup-state.ts`, imported by the view. No DOM here: node-tested.

import type { BackupBundlePayload } from "../../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { validateBackupBundle } from "../../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";
import { TERMINAL_JOB_STATES, humanizeSlug, type JobView } from "../panel-api";

export type BackupSectionId = "make" | "edit" | "restore";
export type BackupEditTargetKind = "activity" | "device";

/** How long a finished backup or restore stays on screen: the server holds a
 *  bundle this long, and the card's results age out on the same clock. */
export const RESULT_KEEP_MS = 300 * 1000;
/** The card's edit session lifetime. */
export const EDIT_SESSION_TTL_MS = 60 * 60 * 1000;
const EDIT_SESSION_PREFIX = "sofabaton-panel-backup-edit:";
const RESULT_ACKS_KEY = "sofabaton-panel-backup-acks";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// -- the finished job a section shows -------------------------------------------------------------------

/** What a finished `backup` job's result says about its bundle. */
export interface BackupResultFacts {
  filename: string;
  activities: number;
  devices: number;
  available: boolean;
  downloaded: boolean;
  expired: boolean;
}

export function backupResultFacts(job: JobView | null): BackupResultFacts {
  const result = (job?.result ?? {}) as Record<string, unknown>;
  const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return {
    filename: typeof result.filename === "string" && result.filename ? result.filename : "sofabaton_backup.json",
    activities: count(result.activities),
    devices: count(result.devices),
    available: result.bundle_available === true,
    downloaded: result.bundle_downloaded === true,
    expired: result.bundle_expired === true,
  };
}

/**
 * The newest job of `kind` a section still has something to say about, from
 * the hub's job list (newest first): a running one, or a finished one that is
 * recent, not acknowledged and, for a backup, still downloadable. `shownJobId`
 * is the job already on screen: it stays (with its expired note) rather than
 * vanish under the user, exactly as the card keeps its card until Complete.
 */
export function sectionJob(jobs: readonly JobView[], kind: "backup" | "restore", options: { acks: ReadonlySet<string>; now: number; shownJobId?: string | null }): JobView | null {
  const job = jobs.find((row) => row.kind === kind) ?? null;
  if (!job) return null;
  if (!TERMINAL_JOB_STATES.has(job.status)) return job;
  if (options.acks.has(job.job_id) || job.status === "cancelled") return null;
  if (options.shownJobId === job.job_id) return job;
  const finished = job.finished_at ? Date.parse(job.finished_at) : NaN;
  if (Number.isFinite(finished) && options.now - finished > RESULT_KEEP_MS) return null;
  if (kind === "backup" && job.status === "done" && !backupResultFacts(job).available) return null;
  return job;
}

export function jobRunning(job: JobView | null): boolean {
  return job !== null && !TERMINAL_JOB_STATES.has(job.status);
}

/** A failed job as one line: the Problem's detail, else its title or type. */
export function jobFailureText(job: JobView | null, fallback: string): string | null {
  if (!job || job.status !== "failed") return null;
  const problem = job.error;
  return String(problem?.detail || problem?.title || (problem?.type ? humanizeSlug(problem.type) : "") || fallback);
}

export function jobProgressMessage(job: JobView | null): string {
  const message = (job?.progress as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message.trim() : "";
}

// -- acknowledged results ("Complete") ---------------------------------------------------------------------

export function loadResultAcks(storage: StorageLike | null): Set<string> {
  if (!storage) return new Set();
  try {
    const data = JSON.parse(storage.getItem(RESULT_ACKS_KEY) || "[]") as unknown;
    return new Set(Array.isArray(data) ? data.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

/** Persist the acks, keeping only ids some hub still lists, so the set cannot grow without bound. */
export function saveResultAcks(storage: StorageLike | null, acks: ReadonlySet<string>): void {
  if (!storage) return;
  try {
    if (!acks.size) storage.removeItem(RESULT_ACKS_KEY);
    else storage.setItem(RESULT_ACKS_KEY, JSON.stringify([...acks].slice(-50)));
  } catch {
    // storage can throw (quota, privacy mode): the ack then lasts for this page only
  }
}

// -- the edit session (the card's, per hub, one hour) ----------------------------------------------------------

export interface EditSession {
  filename: string;
  bundle: BackupBundlePayload;
  dirty: boolean;
  detail: { kind: BackupEditTargetKind; id: number } | null;
}

function editSessionKey(hubId: string): string {
  return `${EDIT_SESSION_PREFIX}${hubId}`;
}

export function saveEditSession(storage: StorageLike | null, hubId: string, session: EditSession | null, now: number): void {
  if (!storage || !hubId) return;
  try {
    if (!session) storage.removeItem(editSessionKey(hubId));
    else storage.setItem(editSessionKey(hubId), JSON.stringify({ savedAt: now, ...session }));
  } catch {
    // quota or privacy mode: the session then lives in memory only
  }
}

/** The stored session when it is younger than an hour and still a valid bundle; anything else is dropped. */
export function loadEditSession(storage: StorageLike | null, hubId: string, now: number): EditSession | null {
  if (!storage || !hubId) return null;
  const key = editSessionKey(hubId);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { savedAt?: number; filename?: unknown; bundle?: unknown; dirty?: unknown; detail?: { kind?: unknown; id?: unknown } | null };
    const savedAt = Number(parsed?.savedAt);
    if (!Number.isFinite(savedAt) || now - savedAt > EDIT_SESSION_TTL_MS) throw new Error("expired");
    const bundle = validateBackupBundle(parsed.bundle);
    const kind = parsed.detail?.kind;
    const id = Number(parsed.detail?.id);
    return {
      filename: typeof parsed.filename === "string" ? parsed.filename : "",
      bundle,
      dirty: Boolean(parsed.dirty),
      detail: (kind === "activity" || kind === "device") && Number.isFinite(id) ? { kind, id } : null,
    };
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
    return null;
  }
}

/** `<name>_edited.json`, the card's name for a downloaded edit. */
export function editedFilename(filename: string): string {
  const base = String(filename ?? "").replace(/\.json$/i, "") || "sofabaton_backup";
  return `${base}_edited.json`;
}
