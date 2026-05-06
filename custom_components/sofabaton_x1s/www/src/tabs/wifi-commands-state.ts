export interface WifiDeviceSyncLike {
  device_key?: string | null;
  device_name?: string | null;
  status?: string | null;
}

export function findRunningWifiDevice(
  devices: WifiDeviceSyncLike[],
  selectedDeviceKey: string | null | undefined,
  selectedSyncStatus: string | null | undefined,
  selectedDeviceName = "",
): WifiDeviceSyncLike | null {
  const runningDevice = devices.find((device) => String(device?.status || "") === "running");
  if (runningDevice) return runningDevice;

  const deviceKey = String(selectedDeviceKey || "").trim();
  if (deviceKey && String(selectedSyncStatus || "") === "running") {
    return {
      device_key: deviceKey,
      device_name: selectedDeviceName,
      status: "running",
    };
  }

  return null;
}

export function shouldFinalizeWifiHubLoad({
  entryId,
  entityId,
  deviceListLoaded,
}: {
  entryId: string | null | undefined;
  entityId: string | null | undefined;
  deviceListLoaded: boolean;
}) {
  return Boolean(String(entryId || "").trim()) && Boolean(String(entityId || "").trim()) && deviceListLoaded;
}

export function selectedDeviceOwnsPendingSync({
  selectedDeviceKey,
  commandSyncRunning,
  commandSyncDeviceKey,
}: {
  selectedDeviceKey: string | null | undefined;
  commandSyncRunning: boolean;
  commandSyncDeviceKey: string | null | undefined;
}) {
  return commandSyncRunning
    && String(commandSyncDeviceKey || "").trim() !== ""
    && String(selectedDeviceKey || "").trim() === String(commandSyncDeviceKey || "").trim();
}
