import test from "node:test";
import assert from "node:assert/strict";
import "../../custom_components/sofabaton_x1s/www/src/tabs/backup-tab";
import type { BackupOperationStateResponse, HassLike } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";

const BackupTabElement = customElements.get("sofabaton-backup-tab") as {
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
