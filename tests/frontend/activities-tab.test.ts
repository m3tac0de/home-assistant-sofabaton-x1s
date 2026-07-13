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
  assert.equal(element._entityId, 101);
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

test("activity editor shows the app-connected guard instead of opening", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };
  element.selectedHubProxyConnected = true;

  const result = element._renderIdle();
  assert.equal((result.values as unknown[]).includes(S.appConnectedTitle), true);
});

test("activity editor shows the busy guard when another operation is running", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = {
    entry_id: "hub-1",
    activities: [{ id: 101, name: "Watch TV" }],
    active_backup_operation: { operation_id: "x", kind: "backup_export", entry_id: "hub-1", status: "running" },
  };

  const result = element._renderIdle();
  assert.equal((result.values as unknown[]).includes(S.operationRunningTitle), true);
});

test("activity editor auto-opens the requested activity once guards are clear", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hass = createHass(sampleBundle());
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };
  element.entityId = 101;

  element.updated(new Map<string, unknown>([["hub", undefined]]));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(element._stage, "editing");
  assert.equal(element._entityId, 101);
});

test("activity editor does not auto-open while a guard is active", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hass = createHass(sampleBundle());
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };
  element.selectedHubProxyConnected = true;
  element.entityId = 101;

  element.updated(new Map<string, unknown>([["hub", undefined]]));

  assert.equal(element._stage, "list");
  assert.equal(element._entityId, null);
});

test("activity editor does not re-open the same activity after closing", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hass = createHass(sampleBundle());
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };
  element.entityId = 101;

  element.updated(new Map<string, unknown>([["hub", undefined]]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(element._stage, "editing");

  element._closeEditor();
  assert.equal(element._stage, "list");

  element.updated(new Map<string, unknown>([["hub", undefined]]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(element._stage, "list");
});

test("activity editor dispatches editor-exit when the session closes", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hass = createHass(sampleBundle());
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };
  const events: string[] = [];
  element.dispatchEvent = (event: Event) => { events.push(event.type); return true; };

  await element._startCapture(101);
  assert.equal(element._stage, "editing");

  element._closeEditor();
  assert.equal(events.includes("editor-exit"), true);
});

test("activities tab does not restore a previous edit session on entry", () => {
  (globalThis as any).window = {
    localStorage: {
      getItem: () => { throw new Error("activity edit should not read persisted sessions"); },
      setItem: () => { throw new Error("activity edit should not write persisted sessions"); },
      removeItem: () => { throw new Error("activity edit should not clear persisted sessions"); },
    },
  };
  try {
    const reader = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
    reader.hub = { entry_id: "hub-1", activities: [] };
    reader.updated(new Map<string, unknown>([["hub", undefined]]));

    assert.equal(reader._stage, "list");
    assert.equal(reader._entityId, null);
    assert.equal(reader._baseline, null);
    assert.equal(reader._working, null);
  } finally {
    delete (globalThis as any).window;
  }
});

test("activities tab drops the active edit state when the hub picker switches hubs", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", activities: [] };
  // Establish the current hub's entry_id (as the first render would).
  element.updated(new Map<string, unknown>([["hub", undefined]]));
  element._stage = "editing";
  element._baseline = sampleBundle();
  element._working = sampleBundle();
  element._entityId = 101;

  element.hub = { entry_id: "hub-2", activities: [] };
  element.updated(new Map<string, unknown>([["hub", undefined]]));

  assert.equal(element._stage, "list");
  assert.equal(element._baseline, null);
  assert.equal(element._entityId, null);
});

test("activities tab keeps an in-flight capture when the hub object refreshes (same entry_id)", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.updated(new Map<string, unknown>([["hub", undefined]]));
  element._stage = "capturing";
  element._entityId = 101;

  // A control_panel/state refresh hands us a NEW hub object with the SAME
  // entry_id (e.g. active_backup_operation now populated by our own capture).
  element.hub = { entry_id: "hub-1", activities: [], active_backup_operation: { status: "running" } };
  element.updated(new Map<string, unknown>([["hub", undefined]]));

  assert.equal(element._stage, "capturing");
  assert.equal(element._entityId, 101);
});

test("activities tab tracks dirty on bundle-change and clears it when reverted", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const base = sampleBundle();
  element._baseline = base;
  element._working = structuredClone(base);
  element._entityId = 101;
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

test("activities tab delete-request runs the hub delete and returns to the list", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const calls: string[] = [];
  element.hass = {
    states: {},
    async callWS<T>(message: Record<string, unknown>) {
      const type = String(message.type ?? "");
      calls.push(type);
      if (type === "sofabaton_x1s/activity/delete") return { status: "success" } as T;
      throw new Error(`Unexpected WS call: ${type}`);
    },
  };
  element.hub = { entry_id: "hub-1", activities: [] };
  element.refreshControlPanelState = () => undefined;
  element._stage = "editing";
  element._baseline = sampleBundle();
  element._working = structuredClone(element._baseline);
  element._entityId = 101;

  await element._handleDeleteRequest({ detail: { kind: "activity", entityId: 101 } });

  assert.equal(calls.includes("sofabaton_x1s/activity/delete"), true);
  assert.equal(element._stage, "list");
  assert.equal(element._entityId, null);
  assert.equal(element._deleteError, null);
});

test("activities tab back prompts before leaving a dirty edit", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const base = sampleBundle();
  const edited = structuredClone(base);
  edited.activities[0].device!.name = "Edited";
  element._stage = "editing";
  element._baseline = base;
  element._working = edited;
  element._entityId = 101;
  element._recomputeDirty();

  element._closeEditor();

  assert.equal(element._stage, "editing");
  assert.equal(element._exitConfirmOpen, true);
  assert.equal(element._dirty, true);
  assert.equal(element._working.activities[0].device.name, "Edited");
});

test("activities tab leaving without sync discards the active edit", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const base = sampleBundle();
  const edited = structuredClone(base);
  edited.activities[0].device!.name = "Edited";
  element._stage = "editing";
  element._baseline = base;
  element._working = edited;
  element._entityId = 101;
  element._exitConfirmOpen = true;
  element._recomputeDirty();

  element._leaveWithoutSync();

  assert.equal(element._stage, "list");
  assert.equal(element._entityId, null);
  assert.equal(element._baseline, null);
  assert.equal(element._working, null);
  assert.equal(element._dirty, false);
  assert.equal(element._exitConfirmOpen, false);
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
      if (type === "sofabaton_x1s/device/sync") return { operation_id: "sync-1" } as T;
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
  element._entityId = 101;
  element._dirty = true;

  await element._requestSync();
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
  element._entityId = 101;
  element._recomputeDirty();
  assert.equal(element._dirty, true);

  await element._requestSync();
  await hass.__emit({ operation_id: "sync-1", kind: "activity_sync", entry_id: "hub-1", status: "success", total_steps: 2 });

  assert.equal(element._stage, "editing");
  assert.equal(element._dirty, false);
  assert.equal(element._baseline.activities[0].device.name, "Edited");
  assert.equal(element._syncSuccessNotice, true);
});

test("activities tab sync-and-leave exits after a successful sync", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const hass = createSyncHass();
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.refreshControlPanelState = () => undefined;
  element._stage = "editing";
  element._baseline = sampleBundle();
  const edited = structuredClone(element._baseline);
  edited.activities[0].device!.name = "Edited";
  element._working = edited;
  element._entityId = 101;
  element._exitConfirmOpen = true;
  element._recomputeDirty();

  element._syncAndLeave();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(element._stage, "syncing");
  assert.equal(hass.__calls.includes("sofabaton_x1s/activity/sync"), true);

  await hass.__emit({ operation_id: "sync-1", kind: "activity_sync", entry_id: "hub-1", status: "success", total_steps: 2 });

  assert.equal(element._stage, "list");
  assert.equal(element._entityId, null);
  assert.equal(element._baseline, null);
  assert.equal(element._working, null);
  assert.equal(element._dirty, false);
  assert.equal(element._exitConfirmOpen, false);
});

function sampleDeviceBundle(): BackupBundlePayload {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1" },
    devices: [{
      device: { device_id: 5, name: "Television" },
      macros: [{ button_id: 198, name: "PWRON", steps: [] }],
      button_bindings: [],
    }],
    activities: [],
  } as unknown as BackupBundlePayload;
}

test("device editor auto-opens the requested device from the devices list", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hass = createHass(sampleDeviceBundle());
  element.hub = { entry_id: "hub-1", activities: [] };
  element.kind = "device";
  element.entityId = 5;

  element.updated(new Map<string, unknown>([["hub", undefined]]));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(element._stage, "editing");
  assert.equal(element._entityId, 5);
});

test("device editor prompts to refresh when the device is missing from the cache", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  // Bundle exists but only carries activities — the requested device is absent.
  element.hass = createHass(sampleBundle());
  element.hub = { entry_id: "hub-1", activities: [] };
  element.kind = "device";

  await element._startCapture(5);

  assert.equal(element._stage, "needs_refresh");
});

test("device editor sync goes through device/sync", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const hass = createSyncHass();
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.refreshControlPanelState = () => undefined;
  element.kind = "device";
  element._baseline = sampleDeviceBundle();
  const edited = structuredClone(element._baseline);
  edited.devices[0].macros[0].steps = [{ device_id: 5, command_id: 1, button_code: 2, duration: 0, delay: 0 }];
  element._working = edited;
  element._entityId = 5;
  element._recomputeDirty();
  assert.equal(element._dirty, true);

  await element._requestSync();
  assert.equal(element._stage, "syncing");
  assert.equal(hass.__calls.includes("sofabaton_x1s/device/sync"), true);
  assert.equal(hass.__calls.includes("sofabaton_x1s/activity/sync"), false);

  await hass.__emit({ operation_id: "sync-1", kind: "device_sync", entry_id: "hub-1", status: "success", total_steps: 1 });
  assert.equal(element._stage, "editing");
  assert.equal(element._dirty, false);
});

test("activities tab sync failure surfaces the failed step, stale maps to reload", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const hass = createSyncHass();
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.refreshControlPanelState = () => undefined;
  element._baseline = sampleBundle();
  element._working = structuredClone(element._baseline);
  element._entityId = 101;
  element._dirty = true;

  await element._requestSync();
  await hass.__emit({ operation_id: "sync-1", kind: "activity_sync", entry_id: "hub-1", status: "failed", failed_at: "stale_check", error: "changed" });

  assert.equal(element._stage, "sync_failed");
  assert.equal(element._syncFailedAt, "stale_check");
  // Edits are preserved on failure (baseline untouched).
  assert.equal(element._dirty, true);
});
