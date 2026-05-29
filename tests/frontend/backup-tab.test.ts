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
