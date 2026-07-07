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

interface FakeHass extends HassLike {
  __emit: (payload: unknown) => Promise<void> | void;
}

function createHass(exportBundle: BackupBundlePayload | null = sampleBundle()): FakeHass {
  let progressCb: ((payload: unknown) => void) | undefined;
  return {
    states: {},
    async callWS<T>(message: Record<string, unknown>) {
      const type = String(message.type ?? "");
      if (type === "sofabaton_x1s/backup/export") return { operation_id: "op-1" } as T;
      throw new Error(`Unexpected WS call: ${type}`);
    },
    connection: {
      async subscribeMessage(cb: (payload: unknown) => void) {
        progressCb = cb;
        return () => {};
      },
    },
    __emit: (payload: unknown) => progressCb?.(payload),
  } as FakeHass;
}

test("activities tab captures whole-hub and enters the edit stage with a cloned working bundle", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const bundle = sampleBundle();
  const hass = createHass(bundle);
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };
  element.refreshControlPanelState = () => undefined;

  await element._startCapture(101);
  assert.equal(element._stage, "capturing");

  await hass.__emit({
    operation_id: "op-1",
    kind: "backup_export",
    entry_id: "hub-1",
    status: "success",
    backup: bundle,
  });

  assert.equal(element._stage, "editing");
  assert.equal(element._activityId, 101);
  assert.equal(element._baseline, bundle);
  // working is an independent deep clone — mutating it must not touch baseline.
  assert.notEqual(element._working, bundle);
  assert.deepEqual(element._working, bundle);
  element._working.activities[0].device.name = "Changed";
  assert.equal(element._baseline.activities[0].device.name, "Watch TV");
});

test("activities tab surfaces a capture failure without leaving the capturing stage", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const hass = createHass();
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };
  element.refreshControlPanelState = () => undefined;

  await element._startCapture(101);
  await hass.__emit({
    operation_id: "op-1",
    kind: "backup_export",
    entry_id: "hub-1",
    status: "failed",
    error: "hub dropped",
  });

  assert.equal(element._stage, "capturing");
  assert.equal(element._baseline, null);
  assert.match(String(element._captureError || ""), /hub dropped/);
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

test("activities tab sync is stubbed to a coming-soon notice (no hub write)", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element._baseline = sampleBundle();
  element._working = structuredClone(element._baseline);
  element._activityId = 101;
  element._dirty = true;
  element._reviewOpen = true;
  element._requestSync();
  assert.equal(element._reviewOpen, false);
  assert.equal(element._syncNoticeOpen, true);
});
