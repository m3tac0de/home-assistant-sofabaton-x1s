// The Backup tab's pure helpers (docs/internal/server-panel-backup-plan.md):
// which finished job a section shows and for how long, the acknowledged
// results, the hour-long edit session, the edited file's name.

import assert from "node:assert/strict";
import test from "node:test";

import type { JobView } from "../../server-panel/src/panel-api";
import {
  EDIT_SESSION_TTL_MS,
  RESULT_KEEP_MS,
  backupResultFacts,
  editedFilename,
  jobFailureText,
  jobProgressMessage,
  jobRunning,
  loadEditSession,
  loadResultAcks,
  saveEditSession,
  saveResultAcks,
  sectionJob,
} from "../../server-panel/src/views/backup-view-state";

class MemoryStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.has(key) ? this.items.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const NOW = Date.parse("2026-09-20T12:00:00Z");

function job(overrides: Partial<JobView> = {}): JobView {
  return {
    job_id: "b1", hub_id: "a", kind: "backup", status: "done", cancellable: false,
    created_at: "2026-09-20T11:58:00Z", started_at: "2026-09-20T11:58:01Z", finished_at: "2026-09-20T11:59:00Z",
    progress: null, result: { filename: "f.json", activities: 2, devices: 3, bundle_available: true, bundle_downloaded: false, bundle_expired: false }, error: null,
    ...overrides,
  };
}

function bundle(): Record<string, unknown> {
  return { kind: "hub_bundle", schema_version: 5, payload_profile: "full_backup", hub: { name: "Living room", version: "X1S" }, devices: [], activities: [] };
}

test("a backup result is read from the job, with the card's fallback file name", () => {
  assert.deepEqual(backupResultFacts(job()), { filename: "f.json", activities: 2, devices: 3, available: true, downloaded: false, expired: false });
  assert.deepEqual(backupResultFacts(job({ result: null })), { filename: "sofabaton_backup.json", activities: 0, devices: 0, available: false, downloaded: false, expired: false });
  assert.deepEqual(backupResultFacts(null).available, false);
});

test("a section shows the newest job of its kind: running always, finished while recent, staged and not acknowledged", () => {
  const acks = new Set<string>();
  const restore = job({ job_id: "r1", kind: "restore", result: { status: "success" } });
  const jobs = [job({ job_id: "x", kind: "refresh" }), job(), restore, job({ job_id: "b0" })];
  assert.equal(sectionJob(jobs, "backup", { acks, now: NOW })?.job_id, "b1", "the newest backup, not an older one");
  assert.equal(sectionJob(jobs, "restore", { acks, now: NOW })?.job_id, "r1", "kinds are tracked apart");
  assert.equal(sectionJob([], "backup", { acks, now: NOW }), null);

  const running = job({ status: "running", finished_at: null, result: null });
  assert.equal(sectionJob([running], "backup", { acks: new Set(["b1"]), now: NOW + 10 * RESULT_KEEP_MS })?.job_id, "b1", "a running job is never hidden");
  assert.equal(jobRunning(running), true);
  assert.equal(jobRunning(job()), false);
  assert.equal(jobRunning(null), false);

  assert.equal(sectionJob(jobs, "backup", { acks: new Set(["b1"]), now: NOW }), null, "Complete acknowledged it; an older backup does not resurface");
  assert.equal(sectionJob([job({ status: "cancelled" })], "backup", { acks, now: NOW }), null);
});

test("finished results age out after five minutes, and an expired bundle is not worth a card on a fresh look", () => {
  const acks = new Set<string>();
  const finished = Date.parse("2026-09-20T11:59:00Z");
  assert.equal(sectionJob([job()], "backup", { acks, now: finished + RESULT_KEEP_MS })?.job_id, "b1");
  assert.equal(sectionJob([job()], "backup", { acks, now: finished + RESULT_KEEP_MS + 1 }), null);
  const failed = job({ status: "failed", result: null, error: { type: "hub_timeout", title: "The hub did not answer", status: 504, detail: "device 3 never answered" } });
  assert.equal(sectionJob([failed], "backup", { acks, now: NOW })?.job_id, "b1", "a recent failure is said");
  assert.equal(sectionJob([failed], "backup", { acks, now: finished + RESULT_KEEP_MS + 1 }), null, "an old one is not");

  const expired = job({ result: { filename: "f.json", bundle_available: false, bundle_expired: true } });
  assert.equal(sectionJob([expired], "backup", { acks, now: NOW }), null, "after a reload the expired backup is gone");
  assert.equal(sectionJob([expired], "backup", { acks, now: NOW + RESULT_KEEP_MS * 3, shownJobId: "b1" })?.job_id, "b1", "on screen it stays, with its expired note, until Complete");
  // A restore has no bundle to lose: it shows while recent.
  assert.equal(sectionJob([job({ job_id: "r1", kind: "restore", result: { status: "success" } })], "restore", { acks, now: NOW })?.job_id, "r1");
});

test("a failure is one line, from the most specific part of the Problem", () => {
  assert.equal(jobFailureText(job(), "Backup failed"), null);
  assert.equal(jobFailureText(null, "Backup failed"), null);
  const failed = (error: JobView["error"]) => job({ status: "failed", error });
  assert.equal(jobFailureText(failed({ type: "restore_failed", title: "The restore stopped", status: 502, detail: "failed at device 4" }), "x"), "failed at device 4");
  assert.equal(jobFailureText(failed({ type: "restore_failed", title: "The restore stopped", status: 502 }), "x"), "The restore stopped");
  assert.equal(jobFailureText(failed(null), "Restore failed"), "Restore failed");
  assert.equal(jobProgressMessage(job({ progress: { message: "  Backing up device 1 " } })), "Backing up device 1");
  assert.equal(jobProgressMessage(job()), "");
});

test("acknowledged results survive a reload and tolerate a broken or missing store", () => {
  const storage = new MemoryStorage();
  assert.deepEqual([...loadResultAcks(storage)], []);
  saveResultAcks(storage, new Set(["b1", "r1"]));
  assert.deepEqual([...loadResultAcks(storage)].sort(), ["b1", "r1"]);
  saveResultAcks(storage, new Set());
  assert.equal(storage.items.size, 0, "an empty set leaves nothing behind");
  storage.setItem("sofabaton-panel-backup-acks", "{ not json");
  assert.deepEqual([...loadResultAcks(storage)], []);
  assert.deepEqual([...loadResultAcks(null)], []);
  saveResultAcks(null, new Set(["b1"]));
});

test("the edit session is per hub, keeps the file, the dirty flag and the open entity, and lasts an hour", () => {
  const storage = new MemoryStorage();
  const session = { filename: "living.json", bundle: bundle() as never, dirty: true, detail: { kind: "device" as const, id: 4 } };
  saveEditSession(storage, "a", session, NOW);
  assert.deepEqual(loadEditSession(storage, "a", NOW + EDIT_SESSION_TTL_MS), session);
  assert.equal(loadEditSession(storage, "b", NOW), null, "another hub has its own session");

  assert.equal(loadEditSession(storage, "a", NOW + EDIT_SESSION_TTL_MS + 1), null, "past the hour it is not restored");
  assert.equal(storage.items.size, 0, "and it is removed");

  // A session saved before any edit comes back clean; a detail that makes no sense is ignored.
  saveEditSession(storage, "a", { ...session, dirty: false, detail: null }, NOW);
  assert.equal(loadEditSession(storage, "a", NOW)?.dirty, false);
  storage.setItem("sofabaton-panel-backup-edit:a", JSON.stringify({ savedAt: NOW, filename: 7, bundle: bundle(), dirty: 1, detail: { kind: "hub", id: 1 } }));
  assert.deepEqual(loadEditSession(storage, "a", NOW), { filename: "", bundle: bundle(), dirty: true, detail: null });

  saveEditSession(storage, "a", null, NOW);
  assert.equal(storage.items.size, 0, "null clears it");
});

test("a stored session that is no longer a restorable bundle is dropped, not restored", () => {
  const storage = new MemoryStorage();
  for (const broken of ["{ not json", JSON.stringify({ savedAt: NOW, bundle: { kind: "nope" } }), JSON.stringify({ savedAt: NOW, bundle: { ...bundle(), payload_profile: "structural" } }), JSON.stringify({ bundle: bundle() })]) {
    storage.setItem("sofabaton-panel-backup-edit:a", broken);
    assert.equal(loadEditSession(storage, "a", NOW), null);
    assert.equal(storage.items.size, 0);
  }
  assert.equal(loadEditSession(null, "a", NOW), null);
  assert.equal(loadEditSession(storage, "", NOW), null);
});

test("an edited file downloads under the card's name", () => {
  assert.equal(editedFilename("2026-09-20_10-11-12_Living_room.json"), "2026-09-20_10-11-12_Living_room_edited.json");
  assert.equal(editedFilename("Backup.JSON"), "Backup_edited.json");
  assert.equal(editedFilename(""), "sofabaton_backup_edited.json");
});
