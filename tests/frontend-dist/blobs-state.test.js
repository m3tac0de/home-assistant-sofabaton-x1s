// tests/frontend/blobs-state.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// custom_components/sofabaton_x1s/www/src/tabs/blobs-state.ts
function blobDeviceOptions(hub) {
  return [...hub?.devices_list ?? []].map((device) => ({
    value: String(Number(device.id)),
    label: String(device.name || `Device ${Number(device.id)}`),
    deviceClass: String(device.device_class || ""),
    commandCount: Number(device.command_count || 0)
  })).sort((left, right) => left.label.localeCompare(right.label));
}
function blobCommandOptions(hub, deviceId) {
  if (!hub || !Number.isInteger(deviceId)) return [];
  const commands = hub.commands?.[String(deviceId)] ?? {};
  return Object.entries(commands).map(([id, label]) => ({
    value: String(Number(id)),
    label: String(label || `Command ${id}`)
  })).sort((left, right) => left.label.localeCompare(right.label));
}
function blobFetchBlockedReason(params) {
  if (!params.persistentCacheEnabled) return "cache_disabled";
  if (Number.isInteger(params.selectedDeviceId) && params.commandCount <= 0) return "no_commands";
  return null;
}

// tests/frontend/blobs-state.test.ts
var cacheHub = {
  entry_id: "hub-1",
  devices_list: [
    { id: 2, name: "Receiver", command_count: 0, device_class: "IR" },
    { id: 1, name: "Television", command_count: 2, device_class: "wifi_ip" }
  ],
  commands: {
    "1": {
      "9": "Volume Down",
      "3": "Power Toggle"
    }
  }
};
test("blobDeviceOptions sorts devices by label and keeps device metadata", () => {
  assert.deepEqual(blobDeviceOptions(cacheHub), [
    { value: "2", label: "Receiver", deviceClass: "IR", commandCount: 0 },
    { value: "1", label: "Television", deviceClass: "wifi_ip", commandCount: 2 }
  ]);
});
test("blobCommandOptions returns sorted cached command labels for the selected device", () => {
  assert.deepEqual(blobCommandOptions(cacheHub, 1), [
    { value: "3", label: "Power Toggle" },
    { value: "9", label: "Volume Down" }
  ]);
});
test("blobFetchBlockedReason reflects cache gating and empty cached command lists", () => {
  assert.equal(
    blobFetchBlockedReason({
      persistentCacheEnabled: false,
      selectedDeviceId: null,
      commandCount: 0
    }),
    "cache_disabled"
  );
  assert.equal(
    blobFetchBlockedReason({
      persistentCacheEnabled: true,
      selectedDeviceId: 2,
      commandCount: 0
    }),
    "no_commands"
  );
  assert.equal(
    blobFetchBlockedReason({
      persistentCacheEnabled: true,
      selectedDeviceId: 1,
      commandCount: 2
    }),
    null
  );
});
