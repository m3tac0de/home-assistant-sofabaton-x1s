import test from "node:test";
import assert from "node:assert/strict";
import {
  blobCommandOptions,
  blobDeviceOptions,
  blobFetchBlockedReason,
} from "../../custom_components/sofabaton_x1s/www/src/tabs/blobs-state";

const cacheHub = {
  entry_id: "hub-1",
  devices_list: [
    { id: 2, name: "Receiver", command_count: 0, device_class: "IR" },
    { id: 1, name: "Television", command_count: 2, device_class: "wifi_ip" },
  ],
  commands: {
    "1": {
      "9": "Volume Down",
      "3": "Power Toggle",
    },
  },
};

test("blobDeviceOptions sorts devices by label and keeps device metadata", () => {
  assert.deepEqual(blobDeviceOptions(cacheHub), [
    { value: "2", label: "Receiver", deviceClass: "IR", commandCount: 0 },
    { value: "1", label: "Television", deviceClass: "wifi_ip", commandCount: 2 },
  ]);
});

test("blobCommandOptions returns sorted cached command labels for the selected device", () => {
  assert.deepEqual(blobCommandOptions(cacheHub, 1), [
    { value: "3", label: "Power Toggle" },
    { value: "9", label: "Volume Down" },
  ]);
});

test("blobFetchBlockedReason reflects cache gating and empty cached command lists", () => {
  assert.equal(
    blobFetchBlockedReason({
      persistentCacheEnabled: false,
      selectedDeviceId: null,
      commandCount: 0,
    }),
    "cache_disabled",
  );

  assert.equal(
    blobFetchBlockedReason({
      persistentCacheEnabled: true,
      selectedDeviceId: 2,
      commandCount: 0,
    }),
    "no_commands",
  );

  assert.equal(
    blobFetchBlockedReason({
      persistentCacheEnabled: true,
      selectedDeviceId: 1,
      commandCount: 2,
    }),
    null,
  );
});
