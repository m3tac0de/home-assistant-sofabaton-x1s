import test from "node:test";
import assert from "node:assert/strict";
import {
  backupUsesWholeHub,
  forcedRestoreDeviceIds,
  pruneBackupBundle,
  reconcileRestoreSelection,
  validateBackupBundle,
} from "../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";

const bundle = {
  kind: "hub_bundle",
  schema_version: 4,
  devices: [
    { device: { device_id: 1, name: "TV", device_class: "ir" } },
    { device: { device_id: 2, name: "AVR", device_class: "ir" } },
    { device: { device_id: 3, name: "Streamer", device_class: "wifi_ip" } },
  ],
  activities: [
    { device: { device_id: 101, name: "Watch TV", entity_type: "activity" }, referenced_source_device_ids: [1, 2] },
    { device: { device_id: 102, name: "Game", entity_type: "activity" }, referenced_source_device_ids: [2, 3] },
  ],
};

test("backupUsesWholeHub switches on when any activity is selected", () => {
  assert.equal(backupUsesWholeHub([]), false);
  assert.equal(backupUsesWholeHub([101]), true);
});

test("forcedRestoreDeviceIds unions linked devices for selected activities", () => {
  assert.deepEqual(forcedRestoreDeviceIds(bundle, [101]), [1, 2]);
  assert.deepEqual(forcedRestoreDeviceIds(bundle, [101, 102]), [1, 2, 3]);
});

test("reconcileRestoreSelection keeps manual device picks alongside forced ones", () => {
  assert.deepEqual(
    reconcileRestoreSelection({
      bundle,
      selectedActivityIds: [101],
      manualSelectedDeviceIds: [3],
    }),
    {
      forcedDeviceIds: [1, 2],
      selectedDeviceIds: [1, 2, 3],
    },
  );
});

test("pruneBackupBundle keeps only selected devices and activities", () => {
  const pruned = pruneBackupBundle({
    bundle,
    selectedActivityIds: [102],
    selectedDeviceIds: [2, 3],
  });
  assert.deepEqual(
    pruned.devices.map((device) => device.device?.device_id),
    [2, 3],
  );
  assert.deepEqual(
    pruned.activities.map((activity) => activity.device?.device_id),
    [102],
  );
});

test("validateBackupBundle rejects wrong kinds and schemas", () => {
  assert.equal(validateBackupBundle(bundle).kind, "hub_bundle");
  assert.throws(() => validateBackupBundle({ kind: "device_backup", schema_version: 4 }), /not a Sofabaton hub bundle/i);
  assert.throws(() => validateBackupBundle({ kind: "hub_bundle", schema_version: 3, devices: [], activities: [] }), /schema_version must be 4/i);
});
