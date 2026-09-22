// The Hub tab's Activities / Devices view, pure parts: merging the typed
// rows with the snapshot's provenance and table counts, the card's count
// line, the bound-button filter, the job phrase, and the API client's
// catalog routes plus job following over a fake fetch.

import assert from "node:assert/strict";
import test from "node:test";

import { PanelApi, type JobView, type SnapshotDocument } from "../../server-panel/src/panel-api";
import { boundButtons, buildCatalog, countLine, countsFromSnapshot, entryKey, jobPhrase, movedIds, workingOrder } from "../../server-panel/src/views/catalog-view";

const DEVICES = [
  { device_id: 1, name: "TV", brand: "Sony", device_class: "ir", device_class_code: 1, power_state: 0, idle_behavior: 2, sort: 1 },
  { device_id: 7, name: "Amp", brand: null, device_class: null, device_class_code: null, power_state: null, idle_behavior: null, sort: 0 },
];
const ACTIVITIES = [{ activity_id: 101, name: "Watch TV", active: true, needs_confirm: false, sort: 1 }];
const SNAPSHOT: SnapshotDocument = {
  snapshot_id: "abc",
  captured_at: "2026-09-16T10:00:00Z",
  engine_generation: 3,
  complete: false,
  payload_profile: "x1s",
  devices: [{ kind: "device", device: { device_id: 1, name: "TV" }, complete: true, editable: true, fetched_at: "2026-09-16T09:00:00Z", commands: [{ command_id: 1 }, { command_id: 17 }] }],
  activities: [{ kind: "activity", device: { device_id: 101, name: "Watch TV" }, complete: false, editable: false, fetched_at: "2026-09-16T09:30:00Z", favorite_slots: [{}], macros: [], button_bindings: [{}, {}, {}] }],
};

test("buildCatalog lists devices then activities, with the snapshot's provenance and table counts where it has any", () => {
  const entries = buildCatalog(DEVICES, ACTIVITIES, SNAPSHOT);
  assert.deepEqual(
    entries.map((e) => [e.kind, e.id, e.name, e.complete, e.fetched_at, e.counts]),
    [
      ["device", 1, "TV", true, "2026-09-16T09:00:00Z", { commands: 2 }],
      ["device", 7, "Amp", false, null, null],
      ["activity", 101, "Watch TV", false, "2026-09-16T09:30:00Z", { favorites: 1, macros: 0, buttons: 3 }],
    ],
  );
  assert.equal(entries[0].device?.brand, "Sony");
  assert.equal(entries[2].activity?.active, true);
  assert.equal(entryKey(entries[2].kind, entries[2].id), "activity:101");
  // Without a snapshot nothing is marked fetched and nothing is counted.
  assert.ok(buildCatalog(DEVICES, ACTIVITIES, null).every((e) => !e.complete && e.fetched_at === null && e.counts === null));
});

test("the rows keep the typed lists' order (the hub's display order the library lists in), whatever the snapshot's array order", () => {
  const activities = [102, 101, 103].map((id, i) => ({ activity_id: id, name: `A${id}`, active: false, needs_confirm: false, sort: i + 1 }));
  const row = (id: number) => ({ kind: "activity", device: { device_id: id }, complete: true, editable: true, fetched_at: null });
  const snapshot = { ...SNAPSHOT, activities: [row(101), row(102)] } as SnapshotDocument;
  assert.deepEqual(buildCatalog([], activities, snapshot).map((e) => e.id), [102, 101, 103]);
  assert.deepEqual(buildCatalog([], activities, null).map((e) => e.id), [102, 101, 103]);
  assert.deepEqual(workingOrder([{ id: 1 }, { id: 2 }, { id: 3 }], [3, 9, 1]).map((e) => e.id), [3, 1, 2]);
  assert.deepEqual(movedIds([1, 2, 3], 0, 2), [2, 3, 1]);
  assert.deepEqual(movedIds([1, 2, 3], 0, 5), [1, 2, 3]);
});

test("countsFromSnapshot reads the bundle's tables and stays null for a structural profile", () => {
  assert.deepEqual(countsFromSnapshot("device", { kind: "device", device: { device_id: 1 }, complete: true, editable: true, fetched_at: null, commands: [] }), { commands: 0 });
  assert.equal(countsFromSnapshot("device", { kind: "device", device: { device_id: 1 }, complete: true, editable: true, fetched_at: null }), null);
  assert.deepEqual(countsFromSnapshot("activity", { kind: "activity", device: { device_id: 101 }, complete: true, editable: true, fetched_at: null, macros: [{}] }), { favorites: 0, macros: 1, buttons: 0 });
  assert.equal(countsFromSnapshot("activity", undefined), null);
});

test("countLine is the card's wording, singular and plural", () => {
  assert.equal(countLine("device", { commands: 1 }), "1 cmd");
  assert.equal(countLine("device", { commands: 12 }), "12 cmds");
  assert.equal(countLine("activity", { favorites: 1, macros: 0, buttons: 2 }), "1 fav / 0 macros / 2 buttons");
  assert.equal(countLine("activity", { favorites: 2, macros: 1, buttons: 1 }), "2 favs / 1 macro / 1 button");
  assert.equal(countLine("device", null), null);
});

test("activity summaries exclude internal power sequences while counting user macros", () => {
  const activity = { ...SNAPSHOT.activities[0], macros: [
    { button_id: 198, name: "POWER_ON", steps: [{ device_id: 1, command_id: 1 }] },
    { button_id: 199, name: "POWER_OFF", steps: [] },
  ] };
  assert.equal(countsFromSnapshot("activity", activity)?.macros, 0);
  assert.equal(countsFromSnapshot("activity", { ...activity, macros: [...activity.macros,
    { button_id: 1, name: "Movie time", steps: [] }, { button_id: 2, name: "Lights", steps: [] },
  ] })?.macros, 2);
});

test("boundButtons keeps the buttons the hub maps to a command", () => {
  const rows = [
    { button_code: 151, name: "OK", device_id: 1, command_id: 9 },
    { button_code: 152, name: "Back", device_id: null, command_id: null },
    { button_code: 153, name: "Menu", device_id: null, command_id: 3 },
  ];
  assert.deepEqual(boundButtons(rows).map((b) => b.button_code), [151, 153]);
});

test("jobPhrase carries the status and the step count when there is one", () => {
  const job = (status: string, progress: JobView["progress"]): JobView => ({
    job_id: "j", hub_id: "h", kind: "refresh", status, cancellable: false, created_at: "t", started_at: null, finished_at: null, progress, result: null, error: null,
  });
  assert.equal(jobPhrase(job("queued", null)), "queued");
  assert.equal(jobPhrase(job("running", { completed_steps: 2, total_steps: 5 })), "running 2/5");
  assert.equal(jobPhrase(job("running", { total_steps: 5 })), "running 0/5");
});

test("the catalog routes and refresh scopes hit the documented paths; followJob polls to a terminal state", async () => {
  const calls: { method: string; path: string; body: string | undefined }[] = [];
  let polls = 0;
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = url.slice("http://host/api/v1".length);
    calls.push({ method: init?.method ?? "GET", path, body: init?.body as string | undefined });
    if (path === "/hubs/h/snapshot/refresh") {
      return new Response(JSON.stringify({ job_id: "j1", hub_id: "h", kind: "refresh_entity", status: "queued" }), { status: 202, headers: { "content-type": "application/json" } });
    }
    if (path === "/hubs/h/jobs/j1") {
      polls++;
      const status = polls < 3 ? "running" : "done";
      return new Response(JSON.stringify({ job_id: "j1", hub_id: "h", kind: "refresh_entity", status, progress: { completed_steps: polls, total_steps: 3 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  };
  const api = new PanelApi("http://host", fetchImpl);
  await api.snapshot("h");
  await api.devices("h");
  await api.activities("h");
  await api.deviceCommands("h", 7);
  await api.entityButtons("h", 101);
  await api.activityMacros("h", 101);
  await api.activityFavorites("h", 101);
  await api.refreshSnapshot("h", { device_id: 7 });
  await api.refreshSnapshot("h", { activity_id: 101 });
  await api.refreshSnapshot("h");
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}${c.body ? " " + c.body : ""}`),
    [
      "GET /hubs/h/snapshot",
      "GET /hubs/h/devices",
      "GET /hubs/h/activities",
      "GET /hubs/h/devices/7/commands",
      "GET /hubs/h/entities/101/buttons",
      "GET /hubs/h/activities/101/macros",
      "GET /hubs/h/activities/101/favorites",
      'POST /hubs/h/snapshot/refresh {"device_id":7}',
      'POST /hubs/h/snapshot/refresh {"activity_id":101}',
      "POST /hubs/h/snapshot/refresh {}",
    ],
  );

  const seen: string[] = [];
  const job = await api.followJob("h", "j1", { intervalMs: 1, onUpdate: (j) => seen.push(jobPhrase(j)), sleep: async () => {} });
  assert.equal(job?.status, "done");
  assert.deepEqual(seen, ["running 1/3", "running 2/3", "done 3/3"]);

  // The poll budget bounds a job that never ends.
  polls = -1000;
  const stuck = await api.followJob("h", "j1", { maxPolls: 2, sleep: async () => {} });
  assert.equal(stuck?.status, "running");
});
