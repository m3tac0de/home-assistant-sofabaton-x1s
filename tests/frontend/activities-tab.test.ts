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
  (element._working as any).activities[0].device.name = "Changed";
  assert.equal((element._baseline as any).activities[0].device.name, "Watch TV");
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

function createSyncHass(structuralBundle?: () => unknown) {
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
      if (type === "sofabaton_x1s/cache/structural_bundle" && structuralBundle) {
        return { bundle: structuralBundle(), generation: 1 } as T;
      }
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

test("activities tab sync success rebases the baseline from the backend capture", async () => {
  // The hub canonicalizes bytes the editor does not model (e.g. power-row
  // duration), so a successful sync must adopt the backend's post-sync
  // capture — not the local working copy — or the next sync's stale
  // preflight false-positives.
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const canonical = sampleBundle();
  canonical.activities[0].device!.name = "Canonical";
  const hass = createSyncHass(() => structuredClone(canonical));
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.refreshControlPanelState = () => undefined;
  element._baseline = sampleBundle();
  const edited = structuredClone(element._baseline);
  edited.activities[0].device!.name = "Edited";
  element._working = edited;
  element._entityId = 101;
  element._recomputeDirty();

  await element._requestSync();
  await hass.__emit({ operation_id: "sync-1", kind: "activity_sync", entry_id: "hub-1", status: "success", total_steps: 2 });

  assert.equal(element._stage, "editing");
  assert.equal(element._dirty, false);
  assert.equal(element._baseline.activities[0].device.name, "Canonical");
  assert.equal(element._working.activities[0].device.name, "Canonical");
});

test("activities tab sync success falls back to local promotion when recapture is unavailable", async () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const hass = createSyncHass(); // no structural_bundle handler -> recapture throws
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
  assert.equal("_syncSuccessNotice" in element, false);
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

const RefreshCacheButtonElement = customElements.get("sofabaton-refresh-cache-button") as {
  new (): HTMLElement;
};

test("refresh cache button routes through runRefresh and emits refreshed on success", async () => {
  const element = new RefreshCacheButtonElement() as HTMLElement & Record<string, any>;
  element.entryId = "hub-1";
  element.hass = {
    states: {},
    async callWS() { throw new Error("must not start the refresh itself when runRefresh is set"); },
    connection: null,
  } as HassLike;
  let runs = 0;
  element.runRefresh = async () => { runs += 1; return null; };
  let refreshed = 0;
  element.addEventListener("refreshed", () => { refreshed += 1; });

  await element._start();

  assert.equal(runs, 1);
  assert.equal(refreshed, 1);
  assert.equal(element._running, false);
  assert.equal(element._error, null);
});

test("refresh cache button surfaces the failure message from runRefresh", async () => {
  const element = new RefreshCacheButtonElement() as HTMLElement & Record<string, any>;
  element.entryId = "hub-1";
  element.hass = { states: {}, async callWS() { return {}; }, connection: null } as HassLike;
  element.runRefresh = async () => "Cache refresh failed.";
  let refreshed = 0;
  element.addEventListener("refreshed", () => { refreshed += 1; });

  await element._start();

  assert.equal(refreshed, 0);
  assert.equal(element._running, false);
  assert.equal(element._error, "Cache refresh failed.");
});

test("needs-refresh and sync-failed views forward startRefreshAll to the refresh button", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hub = { entry_id: "hub-1", activities: [] };
  const runner = async () => null;
  element.startRefreshAll = runner;

  const needsRefresh = element._renderNeedsRefresh();
  assert.equal((needsRefresh.values as unknown[]).includes(runner), true);
  const syncFailed = element._renderSyncFailed();
  assert.equal((syncFailed.values as unknown[]).includes(runner), true);
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

test("activity editor announces dirty state transitions for the host dock", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const events: boolean[] = [];
  element.addEventListener("editor-dirty-changed", (event) => {
    events.push(Boolean((event as CustomEvent<{ dirty: boolean }>).detail.dirty));
  });

  element._stage = "editing";
  element._dirty = true;
  element._notifyDirtyDock();
  assert.deepEqual(events, [true]);

  // No re-dispatch without a transition.
  element._notifyDirtyDock();
  assert.deepEqual(events, [true]);

  // While syncing the dock narrates the running operation instead.
  element._stage = "syncing";
  element._notifyDirtyDock();
  assert.deepEqual(events, [true, false]);

  // A failed sync leaves unsynced changes sitting in the editor.
  element._stage = "sync_failed";
  element._notifyDirtyDock();
  assert.deepEqual(events, [true, false, true]);

  // Leaving the editor clears the flag.
  element._resetToList();
  element._notifyDirtyDock();
  assert.deepEqual(events, [true, false, true, false]);
});

test("activity editor does not announce dirty while the bundle matches the baseline", () => {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  const events: boolean[] = [];
  element.addEventListener("editor-dirty-changed", (event) => {
    events.push(Boolean((event as CustomEvent<{ dirty: boolean }>).detail.dirty));
  });

  element._stage = "editing";
  element._dirty = false;
  element._notifyDirtyDock();
  assert.deepEqual(events, []);
});

// ── W7 phase 1 of the Sync press (CR-F2-3, CR-F2-13) ─────────────────

const EVENTS_BRAND = "m3-haevents-hub1";

function eventsActivityBundle(eventsDeviceId: number | null, refDeviceId: number | null): BackupBundlePayload {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: eventsDeviceId == null ? [] : [{ device: { device_id: eventsDeviceId, name: "Wifi Events", brand: EVENTS_BRAND }, commands: [] }],
    activities: [{
      device: { device_id: 101, name: "Watch TV" },
      favorite_slots: refDeviceId == null ? [] : [{ button_id: 1, device_id: refDeviceId, command_id: 1 }],
      button_bindings: [],
      macros: [],
    }],
  } as unknown as BackupBundlePayload;
}

function phaseHass(handlers: Record<string, (message: Record<string, unknown>) => unknown>) {
  const calls: Array<Record<string, unknown>> = [];
  const hass: HassLike = {
    states: {},
    async callWS<T>(message: Record<string, unknown>) {
      calls.push(message);
      const handler = handlers[String(message.type ?? "")];
      if (!handler) throw new Error(`Unexpected WS call: ${String(message.type)}`);
      return await handler(message) as T;
    },
    connection: null,
  };
  return { hass, calls };
}

function syncingEditor(hass: HassLike, baseline: BackupBundlePayload, working: BackupBundlePayload) {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hass = hass;
  element.kind = "activity";
  element.hub = { entry_id: "hub-1", activities: [{ id: 101, name: "Watch TV" }] };
  element._entityId = 101;
  element._baseline = baseline;
  element._working = working;
  element._dirty = true;
  element._stage = "editing";
  return element;
}

const types = (calls: Array<Record<string, unknown>>) => calls.map((call) => String(call.type).replace("sofabaton_x1s/", ""));

test("a failing Wifi Events list lands in sync_failed instead of hanging on Syncing", async () => {
  const { hass, calls } = phaseHass({
    "sofabaton_x1s/wifi_event/list": () => { throw { code: "not_found", message: "Could not resolve Sofabaton hub" }; },
  });
  const element = syncingEditor(hass, eventsActivityBundle(9, null), eventsActivityBundle(9, 9));

  await element._requestSync();

  assert.equal(element._stage, "sync_failed");
  assert.ok(element._syncError);
  assert.equal(element._syncProgress, null);
  assert.deepEqual(types(calls), ["wifi_event/list"]);
});

test("an activity without Wifi Event references skips phase 1", async () => {
  const { hass, calls } = phaseHass({
    "sofabaton_x1s/activity/sync": () => { throw new Error("stop here"); },
  });
  const baseline = eventsActivityBundle(9, null);
  const working = structuredClone(baseline);
  (working as any).activities[0].device.name = "Movies";
  const element = syncingEditor(hass, baseline, working);

  await element._requestSync();

  assert.deepEqual(types(calls), ["activity/sync"]);
  assert.equal(element._stage, "sync_failed");
});

test("an out-of-step events record is deployed before the activity sync", async () => {
  const { hass, calls } = phaseHass({
    "sofabaton_x1s/wifi_event/list": () => ({ device_id: 9, record_needs_sync: true, events: [] }),
    "sofabaton_x1s/wifi_event/sync": () => ({ device_id: 9, record_needs_sync: false, events: [] }),
    "sofabaton_x1s/activity/sync": () => { throw new Error("stop here"); },
  });
  const element = syncingEditor(hass, eventsActivityBundle(9, null), eventsActivityBundle(9, 9));

  await element._requestSync();

  assert.deepEqual(types(calls), ["wifi_event/list", "wifi_event/sync", "activity/sync"]);
});

test("a first-ever event deploy rewrites the placeholder to the hub's device id", async () => {
  const deployed = eventsActivityBundle(42, null);
  let edited: BackupBundlePayload | null = null;
  const { hass, calls } = phaseHass({
    "sofabaton_x1s/wifi_event/list": () => ({ device_id: null, record_needs_sync: true, events: [] }),
    "sofabaton_x1s/wifi_event/sync": () => ({ device_id: 42, record_needs_sync: false, events: [] }),
    "sofabaton_x1s/cache/structural_bundle": () => ({ bundle: deployed, generation: 1 }),
    "sofabaton_x1s/activity/sync": (message) => {
      edited = message.edited as BackupBundlePayload;
      throw new Error("stop here");
    },
  });
  // Placeholder id 1 stands in for the events device until phase 1 deploys it.
  const element = syncingEditor(hass, eventsActivityBundle(null, null), eventsActivityBundle(1, 1));
  element._wifiEventsPlaceholderId = 1;

  await element._requestSync();

  assert.deepEqual(types(calls), ["wifi_event/list", "wifi_event/sync", "cache/structural_bundle", "activity/sync"]);
  const activity = (edited as any).activities[0];
  assert.equal(activity.favorite_slots[0].device_id, 42);
  assert.deepEqual((edited as any).devices.map((entry: any) => entry.device.device_id), [42]);
  assert.equal(element._wifiEventsPlaceholderId, null);
});

// ── Wifi Events as single records (wifi-events-single-record-plan) ───

function legacyEventsBundle(): BackupBundlePayload {
  const commands = Array.from({ length: 50 }, (_, index) => ({ command_id: index + 1, name: `R${index + 1}` }));
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [{ device: { device_id: 9, name: "Wifi Events", brand: EVENTS_BRAND }, commands }],
    activities: [{
      device: { device_id: 101, name: "Watch TV" },
      favorite_slots: [{ button_id: 1, device_id: 9, command_id: 1 }],
      button_bindings: [{ button_id: 0xB6, device_id: 3, command_id: 7, long_press_device_id: 9, long_press_command_id: 27 }],
      macros: [],
    }],
  } as unknown as BackupBundlePayload;
}

test("phase 1 that retires the long records rebases both bundles before the activity sync", async () => {
  let sent: { baseline: any; edited: any } | null = null;
  const { hass, calls } = phaseHass({
    "sofabaton_x1s/wifi_event/list": () => ({ device_id: 9, record_needs_sync: true, slot_count: 25, events: [] }),
    "sofabaton_x1s/wifi_event/sync": () => ({ device_id: 9, record_needs_sync: false, slot_count: 25, events: [] }),
    "sofabaton_x1s/activity/sync": (message) => {
      sent = { baseline: message.baseline, edited: message.edited };
      throw new Error("stop here");
    },
  });
  const working = legacyEventsBundle();
  (working as any).activities[0].device.name = "Movies";
  const element = syncingEditor(hass, legacyEventsBundle(), working);

  await element._requestSync();

  assert.deepEqual(types(calls), ["wifi_event/list", "wifi_event/sync", "activity/sync"]);
  for (const bundle of [sent!.baseline, sent!.edited]) {
    assert.equal(bundle.activities[0].button_bindings[0].long_press_command_id, 2);
    assert.equal(bundle.devices[0].commands.length, 25);
  }
  // the user's own edit survives
  assert.equal(sent!.edited.activities[0].device.name, "Movies");
});

function eventsDeviceEditor(hass: HassLike) {
  const element = new ActivitiesTabElement() as HTMLElement & Record<string, any>;
  element.hass = hass;
  element.hub = { entry_id: "hub-1", activities: [] };
  element.refreshControlPanelState = () => undefined;
  element.kind = "device";
  return element;
}

test("the Wifi Events device editor offers Sync while its record waits for one", async () => {
  const fresh = legacyEventsBundle();
  (fresh as any).devices[0].commands = (fresh as any).devices[0].commands.slice(0, 25);
  let captures = 0;
  const { hass, calls } = phaseHass({
    "sofabaton_x1s/cache/structural_bundle": () => {
      captures += 1;
      return { bundle: captures === 1 ? legacyEventsBundle() : fresh, generation: captures };
    },
    "sofabaton_x1s/wifi_event/list": () => ({ device_id: 9, record_needs_sync: true, slot_count: 25, events: [] }),
    "sofabaton_x1s/wifi_event/sync": () => ({ device_id: 9, record_needs_sync: false, slot_count: 25, events: [] }),
  });
  const element = eventsDeviceEditor(hass);

  await element._startCapture(9);
  assert.equal(element._stage, "editing");
  assert.equal(element._dirty, false);
  assert.equal(element._eventsRecordNeedsSync, true);

  await element._requestSync();

  // No edits of the user's own: the events deploy is the whole sync.
  assert.deepEqual(types(calls), ["cache/structural_bundle", "wifi_event/list", "wifi_event/sync", "cache/structural_bundle"]);
  assert.equal(element._stage, "editing");
  assert.equal(element._eventsRecordNeedsSync, false);
  assert.equal(element._working.devices[0].commands.length, 25);
});

test("Wifi Events device edits sync after the events deploy, on rebased bundles", async () => {
  let sent: { baseline: any; edited: any } | null = null;
  const { hass, calls } = phaseHass({
    "sofabaton_x1s/wifi_event/sync": () => ({ device_id: 9, record_needs_sync: false, slot_count: 25, events: [] }),
    "sofabaton_x1s/device/sync": (message) => {
      sent = { baseline: message.baseline, edited: message.edited };
      throw new Error("stop here");
    },
  });
  const element = eventsDeviceEditor(hass);
  element._entityId = 9;
  element._baseline = legacyEventsBundle();
  const working = legacyEventsBundle();
  (working as any).devices[0].commands[0].name = "Movie Night";
  element._working = working;
  element._eventsRecordNeedsSync = true;
  element._recomputeDirty();
  element._stage = "editing";

  await element._requestSync();

  assert.deepEqual(types(calls), ["wifi_event/sync", "device/sync"]);
  assert.equal(sent!.baseline.devices[0].commands.length, 25);
  assert.equal(sent!.edited.devices[0].commands.length, 25);
  assert.equal(sent!.edited.devices[0].commands[0].name, "Movie Night");
});
