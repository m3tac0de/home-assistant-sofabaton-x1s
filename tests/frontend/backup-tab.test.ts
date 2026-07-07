import test from "node:test";
import assert from "node:assert/strict";
import "../../custom_components/sofabaton_x1s/www/src/tabs/backup-tab";
import type { BackupOperationStateResponse, HassLike } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { activityQuickAccessItems, reorderBundleActivityQuickAccess } from "../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";

const BackupTabElement = customElements.get("sofabaton-backup-tab") as {
  new (): HTMLElement;
};
const EditDetailViewElement = customElements.get("sofabaton-edit-detail-view") as {
  new (): HTMLElement;
};

function createHass(state: BackupOperationStateResponse, onBackupState?: () => void): HassLike {
  return {
    states: {},
    async callWS<T>(message: Record<string, unknown>) {
      const type = String(message.type ?? "");
      if (type === "sofabaton_x1s/backup/state") {
        onBackupState?.();
        return state as T;
      }
      throw new Error(`Unexpected WS call: ${type}`);
    },
    connection: null,
  };
}

test("backup tab rehydrates a stale running restore when the hub no longer reports an active operation", async () => {
  let unsubscribed = false;
  let backupStateCalls = 0;
  const element = new BackupTabElement() as HTMLElement & Record<string, unknown>;

  element.hass = createHass(
    {
      backup_restore: {
        operation_id: "restore-1",
        kind: "backup_restore",
        entry_id: "hub-1",
        status: "success",
        phase: "completed",
        message: "Restore completed.",
        completed_steps: 4,
        total_steps: 4,
      },
      active_operation: null,
    },
    () => {
      backupStateCalls += 1;
    },
  );
  element.hub = {
    entry_id: "hub-1",
    active_backup_operation: null,
  };
  element.setHubCommandBusy = () => undefined;
  element._loadedBackupEntryId = "hub-1";
  element._progressUnsub = () => {
    unsubscribed = true;
  };
  element._restoreProgress = {
    operation_id: "restore-1",
    kind: "backup_restore",
    entry_id: "hub-1",
    status: "running",
    phase: "hub",
    message: "Restored hub name.",
    completed_steps: 4,
    total_steps: 4,
  };

  await (element as any)._syncBackupOperationState();

  assert.equal(backupStateCalls, 1);
  assert.equal(unsubscribed, true);
  assert.equal((element._restoreProgress as any)?.status, "success");
  assert.equal(element._restoreSuccess, "Restore completed.");
});

test("backup tab rejects restore files from newer hub generations", async () => {
  const element = new BackupTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = {
    entry_id: "hub-1",
    version: "X1S",
  };

  const file = new File(
    [
      JSON.stringify({
        kind: "hub_bundle",
        schema_version: 5,
        hub: { version: "X2" },
        devices: [],
        activities: [],
      }),
    ],
    "x2-backup.json",
    { type: "application/json" },
  );

  const input = {
    files: [file],
    value: "chosen",
  } as unknown as HTMLInputElement;

  await (element as any)._handleFilePicked({ currentTarget: input });

  assert.equal(element._restoreBundle, null);
  assert.equal(element._restoreFilename, "");
  assert.match(String(element._restoreError || ""), /cannot be restored onto a Sofabaton X1S hub/i);
  assert.equal(input.value, "");
});

test("backup tab drops a loaded restore bundle when the hub picker switches hubs", () => {
  const element = new BackupTabElement() as HTMLElement & Record<string, unknown>;
  // Simulate first mount on hub-1 (X2) with a successfully picked bundle.
  element.hub = { entry_id: "hub-1", version: "X2" };
  element._restoreBundle = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X2" },
    devices: [],
    activities: [],
  };
  element._restoreFilename = "x2-backup.json";
  element._restoreActivityIds = [1, 2];
  element._restoreManualDeviceIds = [10];
  // The first hub assignment recorded entry_id; mirror that bookkeeping.
  (element as any)._restoreHubEntryId = "hub-1";

  // Switch the picker to a different hub. The bundle was validated against
  // hub-1's X2 firmware and would sidestep the X2-onto-X1S guard if it stuck
  // around, so the tab should drop it.
  element.hub = { entry_id: "hub-2", version: "X1S" };
  (element as any).updated(new Map<string, unknown>([["hub", undefined]]));

  assert.equal(element._restoreBundle, null);
  assert.equal(element._restoreFilename, "");
  assert.deepEqual(element._restoreActivityIds, []);
  assert.deepEqual(element._restoreManualDeviceIds, []);
  assert.equal((element as any)._restoreHubEntryId, "hub-2");
});

test("backup tab keeps the loaded restore bundle on a no-op hub update", () => {
  const element = new BackupTabElement() as HTMLElement & Record<string, unknown>;
  element.hub = { entry_id: "hub-1", version: "X2" };
  const bundle = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X2" },
    devices: [],
    activities: [],
  };
  element._restoreBundle = bundle;
  element._restoreFilename = "x2-backup.json";
  (element as any)._restoreHubEntryId = "hub-1";

  // Hub object changes (e.g. state refresh) but entry_id stays the same.
  element.hub = { entry_id: "hub-1", version: "X2", refreshed: true };
  (element as any).updated(new Map<string, unknown>([["hub", undefined]]));

  assert.equal(element._restoreBundle, bundle);
  assert.equal(element._restoreFilename, "x2-backup.json");
});

test("backup tab renders native radios for scope selection", () => {
  const element = new BackupTabElement() as HTMLElement & Record<string, unknown>;

  const result = element._renderScopeGroup({
    value: "whole_hub",
    disabled: false,
    options: [
      { value: "whole_hub", label: "Entire hub" },
      { value: "individual_devices", label: "Selected devices" },
    ],
    onChange: () => undefined,
  });

  assert.match(result.strings.join(""), /compat-radio-group/);
  assert.equal(Array.isArray(result.values), true);
  assert.equal(result.values.length > 0, true);
});

test("backup complete dismiss clears backend result and resets the make view", async () => {
  const calls: string[] = [];
  const element = new BackupTabElement() as HTMLElement & Record<string, unknown>;

  element.hass = {
    states: {},
    async callWS<T>(message: Record<string, unknown>) {
      const type = String(message.type ?? "");
      calls.push(type);
      if (type === "sofabaton_x1s/backup/clear_result") return { ok: true } as T;
      throw new Error(`Unexpected WS call: ${type}`);
    },
    connection: null,
  };
  element.cacheHub = {
    entry_id: "hub-1",
    devices_list: [{ id: 7, name: "TV", command_count: 1 }],
  };
  let refreshed = 0;
  element.refreshControlPanelState = async () => {
    refreshed += 1;
  };
  element._backupError = "old error";
  element._backupScope = "individual_devices";
  element._backupDeviceIds = [];
  element._backupProgress = {
    operation_id: "backup-1",
    kind: "backup_export",
    entry_id: "hub-1",
    status: "success",
    phase: "completed",
    message: "Backup completed.",
    completed_steps: 2,
    total_steps: 2,
  };

  await (element as any)._completeBackupResult();

  assert.deepEqual(calls, ["sofabaton_x1s/backup/clear_result"]);
  assert.equal(refreshed, 1);
  assert.equal(element._backupError, null);
  assert.equal(element._backupProgress, null);
  assert.equal(element._backupScope, "whole_hub");
  assert.deepEqual(element._backupDeviceIds, [7]);
});

test("backup edit detail rename updates the selected device name in the bundle", () => {
  // The rename flow lives in the extracted edit-detail element; the
  // backup tab only routes the resulting bundle-change event.
  const element = new EditDetailViewElement() as HTMLElement & Record<string, unknown>;
  element.bundle = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { name: "Living Room", version: "X1S" },
    activities: [],
    devices: [
      {
        kind: "device",
        complete: true,
        device: { device_id: 7, name: "TV", device_class: "tv" },
      },
    ],
  };
  element.kind = "device";
  element.entityId = 7;
  element._editDetailNameDraft = "Media Center";

  element._applyEditDetailRename();

  assert.equal(element._selectedEditTitle(), "Media Center");
  assert.equal((element.bundle as { devices: Array<{ device?: { name?: string } }> }).devices[0].device?.name, "Media Center");
});

test("edit detail element reports edits through bundle-change", () => {
  const element = new EditDetailViewElement() as HTMLElement & Record<string, unknown>;
  element.bundle = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { name: "Living Room", version: "X1S" },
    activities: [],
    devices: [
      {
        kind: "device",
        complete: true,
        device: { device_id: 7, name: "TV", device_class: "tv" },
      },
    ],
  };
  element.kind = "device";
  element.entityId = 7;
  let emitted: { devices: Array<{ device?: { name?: string } }> } | null = null;
  (element as unknown as EventTarget).addEventListener("bundle-change", (event) => {
    emitted = (event as CustomEvent<{ bundle: typeof emitted }>).detail.bundle;
  });
  element._editDetailNameDraft = "Media Center";

  element._applyEditDetailRename();

  assert.ok(emitted, "bundle-change should fire on commit");
  assert.equal(emitted!.devices[0].device?.name, "Media Center");
});

test("backup activity quick-access items derive favorite labels from bundled device commands", () => {
  const bundle = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    activities: [
      {
        kind: "activity_backup",
        complete: true,
        device: { device_id: 101, name: "Movie Night", entity_type: "activity" },
        macros: [{ button_id: 2, name: "Lights Down", steps: [] }],
        favorite_slots: [{ button_id: 1, device_id: 7, command_id: 3 }],
      },
    ],
    devices: [
      {
        kind: "device_backup",
        complete: true,
        device: { device_id: 7, name: "Projector", device_class: "tv" },
        commands: [{ command_id: 3, name: "HDMI 1" }],
      },
    ],
  } as any;

  const items = activityQuickAccessItems(bundle, 101);

  assert.deepEqual(items.map((item) => ({ kind: item.kind, label: item.label, buttonId: item.buttonId })), [
    { kind: "favorite", label: "HDMI 1", buttonId: 1 },
    { kind: "macro", label: "Lights Down", buttonId: 2 },
  ]);
});

test("backup activity quick-access reorder rewrites macro and favorite button ids from mixed order", () => {
  const bundle = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    activities: [
      {
        kind: "activity_backup",
        complete: true,
        device: { device_id: 101, name: "Movie Night", entity_type: "activity" },
        macros: [{ button_id: 2, name: "Lights Down", steps: [] }],
        favorite_slots: [{ button_id: 1, device_id: 7, command_id: 3, name: "HDMI 1" }],
      },
    ],
    devices: [],
  } as any;

  const reordered = reorderBundleActivityQuickAccess(bundle, 101, [
    { kind: "macro", buttonId: 2 },
    { kind: "favorite", buttonId: 1 },
  ]);

  assert.equal(reordered.activities[0].macros?.[0]?.button_id, 1);
  assert.equal(reordered.activities[0].favorite_slots?.[0]?.button_id, 2);
});

test("backup activity quick-access items hide internal power macros", () => {
  const bundle = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    activities: [
      {
        kind: "activity_backup",
        complete: true,
        device: { device_id: 101, name: "Movie Night", entity_type: "activity" },
        macros: [
          { button_id: 198, name: "POWER_ON", steps: [] },
          { button_id: 199, name: "POWER_OFF", steps: [] },
          { button_id: 2, name: "Lights Down", steps: [] },
        ],
        favorite_slots: [{ button_id: 1, device_id: 7, command_id: 3, name: "HDMI 1" }],
      },
    ],
    devices: [],
  } as any;

  const items = activityQuickAccessItems(bundle, 101);

  assert.deepEqual(items.map((item) => item.label), ["HDMI 1", "Lights Down"]);
  assert.deepEqual(items.map((item) => item.buttonId), [1, 2]);
});
