// tests/frontend/wifi-commands-state.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-state.ts
function findRunningWifiDevice(devices, selectedDeviceKey, selectedSyncStatus, selectedDeviceName = "") {
  const runningDevice = devices.find((device) => String(device?.status || "") === "running");
  if (runningDevice) return runningDevice;
  const deviceKey = String(selectedDeviceKey || "").trim();
  if (deviceKey && String(selectedSyncStatus || "") === "running") {
    return {
      device_key: deviceKey,
      device_name: selectedDeviceName,
      status: "running"
    };
  }
  return null;
}
function shouldFinalizeWifiHubLoad({
  entryId,
  entityId,
  deviceListLoaded
}) {
  return Boolean(String(entryId || "").trim()) && Boolean(String(entityId || "").trim()) && deviceListLoaded;
}
function selectedDeviceOwnsPendingSync({
  selectedDeviceKey,
  commandSyncRunning,
  commandSyncDeviceKey
}) {
  return commandSyncRunning && String(commandSyncDeviceKey || "").trim() !== "" && String(selectedDeviceKey || "").trim() === String(commandSyncDeviceKey || "").trim();
}

// tests/frontend/wifi-commands-state.test.ts
test("findRunningWifiDevice returns the hub device currently syncing from the device list", () => {
  const runningDevice = findRunningWifiDevice(
    [
      { device_key: "dev-1", device_name: "TV", status: "idle" },
      { device_key: "dev-2", device_name: "Receiver", status: "running" }
    ],
    "dev-1",
    "idle",
    "TV"
  );
  assert.equal(runningDevice?.device_key, "dev-2");
  assert.equal(runningDevice?.device_name, "Receiver");
});
test("findRunningWifiDevice falls back to the selected device while sync status is still local", () => {
  const runningDevice = findRunningWifiDevice([], "dev-3", "running", "Projector");
  assert.deepEqual(runningDevice, {
    device_key: "dev-3",
    device_name: "Projector",
    status: "running"
  });
});
test("shouldFinalizeWifiHubLoad waits for a resolvable hub entity", () => {
  assert.equal(
    shouldFinalizeWifiHubLoad({
      entryId: "hub-2",
      entityId: "",
      deviceListLoaded: false
    }),
    false
  );
  assert.equal(
    shouldFinalizeWifiHubLoad({
      entryId: "hub-2",
      entityId: "remote.bedroom",
      deviceListLoaded: true
    }),
    true
  );
});
test("selectedDeviceOwnsPendingSync only unlocks the device that started the sync", () => {
  assert.equal(
    selectedDeviceOwnsPendingSync({
      selectedDeviceKey: "dev-1",
      commandSyncRunning: true,
      commandSyncDeviceKey: "dev-1"
    }),
    true
  );
  assert.equal(
    selectedDeviceOwnsPendingSync({
      selectedDeviceKey: "dev-2",
      commandSyncRunning: true,
      commandSyncDeviceKey: "dev-1"
    }),
    false
  );
});
