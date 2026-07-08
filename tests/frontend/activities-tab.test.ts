import test from "node:test";
import assert from "node:assert/strict";
import "../../custom_components/sofabaton_x1s/www/src/tabs/activities-tab";
import type { BackupBundlePayload, HassLike } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { TOOLS_CARD_STRINGS } from "../../custom_components/sofabaton_x1s/www/src/strings";

const ActivitiesTabElement = customElements.get("sofabaton-activities-tab") as {
  new (): HTMLElement;
};

const S = TOOLS_CARD_STRINGS.activities;

function sampleBundle(): BackupBundlePayload {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1" },
    devices: [],
    activities: [{ device: { device_id: 101, name: "Watch TV" } }],
  } as unknown as BackupBundlePayload;
}

// Fake hass serving the blob-free structural bundle from the cache.
function createHass(
  bundle: BackupBundlePayload | null = sampleBundle(),
  generation = 0,
): HassLike {
  return {
    states: {},
    async callWS<T>(message: Record<string, unknown>) {
      const type = String(message.type ?? "");
      if (type === "sofabaton_x1s/cache/structural_bundle") return { bundle, generation } as T;
      throw new Error(`Unexpected WS call: ${type}`);
    },
    connection: null,
  };
}

test("activities tab loads the baseline from the structural cache and clones working", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const bundle = sampleBundle();
  element.hass = createHass(bundle);
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };

  await element._startCapture(101);

  assert.equal(element._stage, "editing");
  assert.equal(element._activityId, 101);
  assert.equal(element._baseline, bundle);
  // working is an independent deep clone — mutating it must not touch baseline.
  assert.notEqual(element._working, bundle);
  assert.deepEqual(element._working, bundle);
  element._working.activities[0].device.name = "Changed";
  assert.equal(element._baseline.activities[0].device.name, "Watch TV");
});

test("activities tab prompts to refresh when the structural cache is missing", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hass = createHass(null);
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };

  await element._startCapture(101);

  assert.equal(element._stage, "needs_refresh");
  assert.equal(element._baseline, null);
});

test("activities tab surfaces a structural-bundle read failure", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hass = {
    states: {},
    async callWS() { throw new Error("boom"); },
    connection: null,
  } as HassLike;
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };

  await element._startCapture(101);

  assert.equal(element._stage, "capturing");
  assert.match(String(element._captureError || ""), /boom/);
});

test("activities tab shows the app-connected guard ahead of the list", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };
  element.selectedHubProxyConnected = true;

  const result = element._renderList();
  assert.equal((result.values as unknown[]).includes(S.appConnectedTitle), true);
});

test("activities tab shows the busy guard when another operation is running", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = {
    entry_id: "hub-1",
    activities: [{ id: 101, name: "Watch TV" }],
    active_backup_operation: { operation_id: "x", kind: "backup_export", entry_id: "hub-1", status: "running" },
  };

  const result = element._renderList();
  assert.equal((result.values as unknown[]).includes(S.operationRunningTitle), true);
});

test("activities tab renders the empty guard when the hub has no activities", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", activities: [] };

  const result = element._renderList();
  assert.equal((result.values as unknown[]).includes(S.emptyTitle), true);
});

test("activities tab lists activities sorted by id when connected and idle", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = {
    entry_id: "hub-1",
    activities: [
      { id: 102, name: "Listen", favorite_count: 2, macro_count: 1 },
      { id: 101, name: "Watch TV", favorite_count: 0, macro_count: 0 },
    ],
  };

  const items = element._activityItems();
  assert.deepEqual(items.map((item: { id: number }) => item.id), [101, 102]);
  assert.equal(items[1].shortcutCount, 3);

  const result = element._renderList();
  assert.match(result.strings.join(""), /activity-list/);
});

test("activities tab persists the baseline session and restores it on re-entry", () => {
  const store = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  };
  try {
    const bundle = sampleBundle();
    const writer = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
    writer.hub = { entry_id: "hub-1", activities: [] };
    writer._baseline = bundle;
    writer._working = structuredClone(bundle);
    writer._activityId = 101;
    writer._persistSession();
    assert.equal(store.size, 1);

    const reader = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
    reader.hub = { entry_id: "hub-1", activities: [] };
    reader.updated(new Map());
    assert.equal(reader._stage, "editing");
    assert.equal(reader._activityId, 101);
    assert.equal(reader._sessionRestored, true);
    assert.deepEqual(reader._baseline, bundle);
  } finally {
    delete (globalThis as any).window;
  }
});

test("activities tab drops the in-memory session when the hub picker switches hubs", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", activities: [] };
  // Establish the current hub's entry_id (as the first render would).
  element.updated(new Map<string, unknown>([["hub", undefined]]));
  element._stage = "editing";
  element._baseline = sampleBundle();
  element._working = sampleBundle();
  element._activityId = 101;

  element.hub = { entry_id: "hub-2", activities: [] };
  element.updated(new Map<string, unknown>([["hub", undefined]]));

  assert.equal(element._stage, "list");
  assert.equal(element._baseline, null);
  assert.equal(element._activityId, null);
});

test("activities tab keeps an in-flight capture when the hub object refreshes (same entry_id)", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.updated(new Map<string, unknown>([["hub", undefined]]));
  element._stage = "capturing";
  element._activityId = 101;

  // A control_panel/state refresh hands us a NEW hub object with the SAME
  // entry_id (e.g. active_backup_operation now populated by our own capture).
  element.hub = { entry_id: "hub-1", activities: [], active_backup_operation: { status: "running" } };
  element.updated(new Map<string, unknown>([["hub", undefined]]));

  assert.equal(element._stage, "capturing");
  assert.equal(element._activityId, 101);
});

test("activities tab tracks dirty on bundle-change and clears it when reverted", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const base = sampleBundle();
  element._baseline = base;
  element._working = structuredClone(base);
  element._activityId = 101;
  element._recomputeDirty();
  assert.equal(element._dirty, false);

  const mutated = structuredClone(base);
  mutated.activities[0].device!.name = "Changed";
  element._handleBundleChange({ detail: { bundle: mutated } });
  assert.equal(element._dirty, true);

  // Revert back to the baseline shape → dirty clears.
  element._handleBundleChange({ detail: { bundle: structuredClone(base) } });
  assert.equal(element._dirty, false);
});

test("activities tab discard restores the working bundle to the baseline and clears dirty", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const base = sampleBundle();
  element._baseline = base;
  const mutated = structuredClone(base);
  mutated.activities[0].device!.name = "Changed";
  element._working = mutated;
  element._activityId = 101;
  element._recomputeDirty();
  element._discardConfirmOpen = true;
  assert.equal(element._dirty, true);

  element._discardChanges();
  assert.equal(element._dirty, false);
  assert.equal(element._working.activities[0].device.name, "Watch TV");
  assert.equal(element._discardConfirmOpen, false);
});

test("activities tab opens the review dialog only when dirty", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element._baseline = sampleBundle();
  element._working = structuredClone(element._baseline);
  element._activityId = 101;
  element._dirty = false;
  element._openReview();
  assert.equal(element._reviewOpen, false);

  element._dirty = true;
  element._openReview();
  assert.equal(element._reviewOpen, true);
});

function createSyncHass() {
  let progressCb: ((payload: unknown) => void) | undefined;
  const calls: string[] = [];
  const hass = {
    states: {},
    async callWS<T>(message: Record<string, unknown>) {
      const type = String(message.type ?? "");
      calls.push(type);
      if (type === "sofabaton_x1s/activity/sync") return { operation_id: "sync-1" } as T;
      if (type === "sofabaton_x1s/backup/clear_result") return { ok: true } as T;
      throw new Error(`Unexpected WS call: ${type}`);
    },
    connection: {
      async subscribeMessage(cb: (payload: unknown) => void) {
        progressCb = cb;
        return () => {};
      },
    },
    __emit: (payload: unknown) => progressCb?.(payload),
    __calls: calls,
  };
  return hass as typeof hass & { __emit: (p: unknown) => Promise<void> | void; __calls: string[] };
}

test("activities tab sync starts the engine and enters the syncing stage", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const hass = createSyncHass();
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.refreshControlPanelState = () => undefined;
  element._baseline = sampleBundle();
  element._working = structuredClone(element._baseline);
  element._activityId = 101;
  element._dirty = true;
  element._reviewOpen = true;

  await element._requestSync();
  assert.equal(element._reviewOpen, false);
  assert.equal(element._stage, "syncing");
  assert.equal(hass.__calls.includes("sofabaton_x1s/activity/sync"), true);
});

test("activities tab sync success promotes working to baseline and clears dirty", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const hass = createSyncHass();
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.refreshControlPanelState = () => undefined;
  element._baseline = sampleBundle();
  const edited = structuredClone(element._baseline);
  edited.activities[0].device!.name = "Edited";
  element._working = edited;
  element._activityId = 101;
  element._recomputeDirty();
  assert.equal(element._dirty, true);

  await element._requestSync();
  await hass.__emit({ operation_id: "sync-1", kind: "activity_sync", entry_id: "hub-1", status: "success", total_steps: 2 });

  assert.equal(element._stage, "editing");
  assert.equal(element._dirty, false);
  assert.equal(element._baseline.activities[0].device.name, "Edited");
  assert.equal(element._syncSuccessNotice, true);
});

test("activities tab sync failure surfaces the failed step, stale maps to reload", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const hass = createSyncHass();
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.refreshControlPanelState = () => undefined;
  element._baseline = sampleBundle();
  element._working = structuredClone(element._baseline);
  element._activityId = 101;
  element._dirty = true;

  await element._requestSync();
  await hass.__emit({ operation_id: "sync-1", kind: "activity_sync", entry_id: "hub-1", status: "failed", failed_at: "stale_check", error: "changed" });

  assert.equal(element._stage, "sync_failed");
  assert.equal(element._syncFailedAt, "stale_check");
  // Edits are preserved on failure (baseline untouched).
  assert.equal(element._dirty, true);
});
