// Device-mode frontend tests (docs/internal/device-mode-plan.md):
// store gating/plumbing, the namespaced device layout chain, and the editor
// selection helpers.

import test from "node:test";
import assert from "node:assert/strict";
import { RemoteCardStore } from "../../custom_components/sofabaton_x1s/www/src/state/remote-card-store";
import {
  layoutConfigForDevice,
  deviceLayoutKey,
  isDeviceLayoutKey,
  parseDeviceLayoutKey,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-layout";
import { previewSelection } from "../../custom_components/sofabaton_x1s/www/src/remote-card-state";
import {
  applyLayoutConfigPatch,
  editorDevicesFromState,
  layoutConfigForSelection,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-editor-layout";
import type {
  HassLike,
  RemoteCardConfig,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-types";

const ENTITY = "remote.living_room";

// Minimal window with a working localStorage for the last-device memory.
const storageBacking = new Map<string, string>();
if (typeof (globalThis as Record<string, unknown>).window === "undefined") {
  (globalThis as Record<string, unknown>).window = {
    dispatchEvent: () => true,
    localStorage: {
      getItem: (key: string) => storageBacking.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageBacking.set(key, String(value));
      },
      removeItem: (key: string) => {
        storageBacking.delete(key);
      },
    },
  };
}

const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

function deviceState(overrides: Record<string, unknown> = {}) {
  return {
    state: "on",
    attributes: {
      hub_version: "X1S",
      current_activity: "Watch a movie",
      current_activity_id: 101,
      load_state: "idle",
      entry_id: "entry-1",
      activities: [{ id: 101, name: "Watch a movie", state: "on" }],
      devices: [
        { id: 3, name: "TV", sort: 1 },
        { id: 9, name: "Amp", sort: 2 },
      ],
      assigned_keys: { 101: [174, 176] },
      macro_keys: {},
      favorite_keys: {},
      ...(overrides.attributes as Record<string, unknown> | undefined),
    },
    ...overrides,
  };
}

function createHass(options: {
  platform?: string;
  state?: Record<string, unknown> | null;
  calls?: ServiceCall[];
  keymapResponse?: unknown;
  keymapCalls?: Array<Record<string, unknown>>;
} = {}): HassLike {
  const platform = options.platform ?? "sofabaton_x1s";
  const calls = options.calls ?? [];
  return {
    states: options.state ? { [ENTITY]: options.state as never } : {},
    async callWS<T>(message: Record<string, unknown>) {
      if (String(message.type) === "config/entity_registry/get") {
        return { platform } as T;
      }
      if (String(message.type) === "sofabaton_x1s/device/keymap") {
        options.keymapCalls?.push(message);
        if (options.keymapResponse instanceof Error) throw options.keymapResponse;
        return (options.keymapResponse ?? { keymap: null, reason: "cache_miss" }) as T;
      }
      return { ok: true } as T;
    },
    async callService(domain: string, service: string, data?: Record<string, unknown>) {
      calls.push({ domain, service, data: data ?? {} });
      return undefined;
    },
  };
}

function createStore(hass?: HassLike, config: Partial<RemoteCardConfig> = {}) {
  const store = new RemoteCardStore(() => undefined, {
    fireEvent: () => undefined,
  });
  store.setConfig({ entity: ENTITY, ...config } as RemoteCardConfig);
  if (hass) store.setHass(hass);
  return store;
}

const READY_KEYMAP = {
  keymap: {
    device: { device_id: 3, name: "TV" },
    buttons: [174, 176],
    bindings: [
      { button_id: 174, command_id: 1, command_name: "Up" },
      { button_id: 180, command_id: 4, command_name: "Home" },
    ],
    commands: [
      { command_id: 2, name: "Mute" },
      { command_id: 1, name: "Power" },
      { command_id: 3, name: "Aux Input" },
    ],
  },
  generation: 7,
};

// ---------- availability gating ----------

test("device mode is unavailable for the hub integration and without devices", async () => {
  const hubStore = createStore(createHass({ platform: "sofabaton_hub", state: deviceState() }));
  await flush();
  assert.equal(hubStore.deviceModeAvailable(), false);

  const noDevices = createStore(
    createHass({ state: deviceState({ attributes: { devices: undefined } }) }),
  );
  await flush();
  assert.equal(noDevices.deviceModeAvailable(), false);

  const available = createStore(createHass({ state: deviceState() }));
  await flush();
  assert.equal(available.deviceModeAvailable(), true);
});

test("show_device_toggle=false hides the toggle but not the capability", async () => {
  // The per-layout Mode toggle switch only hides the BUTTON (which may
  // strand the user in one mode by design); the mode itself stays available.
  const store = createStore(createHass({ state: deviceState() }), {
    show_device_toggle: false,
  });
  await flush();
  assert.equal(store.deviceModeAvailable(), true);
  assert.equal(store.deriveRuntimeState().deviceModeAvailable, false);
});

test("device_mode.enabled=false removes the capability entirely", async () => {
  const store = createStore(createHass({ state: deviceState() }), {
    device_mode: { enabled: false },
  });
  await flush();
  assert.equal(store.deviceModeAvailable(), false);
  const derived = store.deriveRuntimeState();
  assert.equal(derived.deviceModeAvailable, false);
  assert.equal(derived.mode, "activity");
});

test("device_mode.open_device opens the card in device mode on that device", async () => {
  storageBacking.clear();
  const keymapCalls: Array<Record<string, unknown>> = [];
  const store = createStore(
    createHass({ state: deviceState(), keymapResponse: READY_KEYMAP, keymapCalls }),
    { device_mode: { open_device: 9 } },
  );
  await flush();

  const derived = store.deriveRuntimeState();
  assert.equal(derived.mode, "device");
  assert.equal(derived.deviceId, 9);
  await flush();
  assert.equal(keymapCalls.length, 1);
  assert.equal(keymapCalls[0].device_id, 9);
});

test("open_device is ignored when device mode is disabled or unknown", async () => {
  const disabled = createStore(createHass({ state: deviceState() }), {
    device_mode: { enabled: false, open_device: 9 },
  });
  await flush();
  assert.equal(disabled.deriveRuntimeState().mode, "activity");

  // Unknown device id: stays on the current activity.
  const unknown = createStore(createHass({ state: deviceState() }), {
    device_mode: { open_device: 77 },
  });
  await flush();
  assert.equal(unknown.deriveRuntimeState().mode, "activity");
});

// ---------- keymap fetch + enabled set ----------

test("selecting a device fetches its keymap once and derives the enabled set", async () => {
  storageBacking.clear();
  const keymapCalls: Array<Record<string, unknown>> = [];
  const hass = createHass({
    state: deviceState(),
    keymapResponse: READY_KEYMAP,
    keymapCalls,
  });
  const store = createStore(hass);
  await flush();

  store.setMode("device");
  assert.equal(store.mode(), "device");
  // No remembered device: nothing selected, nothing fetched.
  assert.equal(store.currentDeviceId(), null);
  assert.equal(keymapCalls.length, 0);

  store.setDevice(3);
  await flush();
  assert.equal(keymapCalls.length, 1);
  assert.deepEqual(keymapCalls[0], {
    type: "sofabaton_x1s/device/keymap",
    entry_id: "entry-1",
    device_id: 3,
  });

  const entry = store.deviceKeymapState();
  assert.equal(entry?.status, "ready");
  // Enabled set = REQ_BUTTONS list ∪ binding targets.
  assert.deepEqual([...(entry?.buttons ?? [])].sort((a, b) => a - b), [174, 176, 180]);
  assert.equal(store.isEnabled(174), true);
  assert.equal(store.isEnabled(179), false); // fail-closed on real data

  // Reselecting never refetches: the remote card does not manage cache.
  store.setDevice(null);
  store.setDevice(3);
  await flush();
  assert.equal(keymapCalls.length, 1);
});

test("enabled set fails open until a fetch has succeeded", async () => {
  const store = createStore(
    createHass({ state: deviceState(), keymapResponse: new Error("boom") }),
  );
  await flush();
  store.setMode("device");
  assert.equal(store.isEnabled(174), true);
  store.setDevice(3);
  await flush();
  // Fetch errored: still fail-open (no real data ever arrived).
  assert.equal(store.deviceKeymapState()?.status, "error");
  assert.equal(store.isEnabled(179), true);
});

test("commands are filtered and alphabetically sorted", async () => {
  const store = createStore(
    createHass({ state: deviceState(), keymapResponse: READY_KEYMAP }),
  );
  await flush();
  store.setMode("device");
  store.setDevice(3);
  await flush();

  assert.deepEqual(
    store.filteredCommands().map((command) => command.name),
    ["Aux Input", "Mute", "Power"],
  );
  store.setCommandFilter("po");
  assert.deepEqual(
    store.filteredCommands().map((command) => command.name),
    ["Power"],
  );
});

test("last device is remembered per entity via localStorage", async () => {
  storageBacking.clear();
  const first = createStore(
    createHass({ state: deviceState(), keymapResponse: READY_KEYMAP }),
  );
  await flush();
  first.setMode("device");
  first.setDevice(9);
  await flush();

  const second = createStore(
    createHass({ state: deviceState(), keymapResponse: READY_KEYMAP }),
  );
  await flush();
  second.setMode("device");
  assert.equal(second.currentDeviceId(), 9);

  // A remembered device that no longer exists falls back to the placeholder.
  const third = createStore(
    createHass({
      state: deviceState({ attributes: { devices: [{ id: 3, name: "TV" }] } }),
      keymapResponse: READY_KEYMAP,
    }),
  );
  await flush();
  third.setMode("device");
  assert.equal(third.currentDeviceId(), null);
});

// ---------- sends ----------

test("device mode scopes key and command sends to the selected device", async () => {
  const calls: ServiceCall[] = [];
  const store = createStore(
    createHass({ state: deviceState(), calls, keymapResponse: READY_KEYMAP }),
  );
  await flush();
  store.setMode("device");
  store.setDevice(3);
  await flush();

  await store.sendCommand(174);
  assert.deepEqual(calls.at(-1), {
    domain: "remote",
    service: "send_command",
    data: { entity_id: ENTITY, command: 174, device: 3 },
  });

  await store.sendCommand(2, 3);
  assert.deepEqual(calls.at(-1)?.data, { entity_id: ENTITY, command: 2, device: 3 });

  // No device selected: nothing is sent.
  store.setDevice(null);
  const before = calls.length;
  await store.sendCommand(174);
  assert.equal(calls.length, before);
});

// ---------- derived state ----------

test("deriveRuntimeState carries device select state and cache-miss notice", async () => {
  const store = createStore(
    createHass({
      state: deviceState(),
      keymapResponse: { keymap: null, reason: "cache_miss" },
    }),
  );
  await flush();
  store.setMode("device");
  store.setDevice(3);
  await flush();

  const derived = store.deriveRuntimeState();
  assert.equal(derived.mode, "device");
  assert.equal(derived.deviceId, 3);
  assert.equal(derived.keymapEntry?.status, "cache_miss");
  assert.deepEqual(derived.commands, []);
  assert.match(String(derived.noActivitiesMessage), /not cached yet/);

  // Placeholder + one option per device, keyed by id (names may collide).
  assert.deepEqual(derived.deviceSelectState?.options, [
    { value: "", label: "Select device" },
    { value: "3", label: "TV" },
    { value: "9", label: "Amp" },
  ]);
  assert.equal(derived.deviceSelectState?.resolvedValue, "3");
});

test("editor device previews force device mode with the device layout chain", async () => {
  const config = {
    show_nav: true,
    layouts: {
      default: { show_dpad: false }, // activity default must NOT leak
      "3": { show_colors: false }, // activity 3, not device 3
    },
    device_mode: {
      layouts: {
        default: { show_media: false },
        "3": { show_nav: false },
      },
    },
  };
  const store = createStore(createHass({ state: deviceState() }), config);
  await flush();
  store.setEditMode(true);
  store.setPreviewActivity("device:3");

  const derived = store.deriveRuntimeState();
  assert.equal(derived.mode, "device");
  assert.equal(derived.deviceId, 3);
  const layout = derived.layoutConfig as Record<string, unknown>;
  assert.equal(layout.show_nav, false); // device:3 override
  assert.equal(layout.show_media, false); // device:default layer
  // Base defaults (true) survive: layouts.default and activity "3" set these
  // to false and must NOT leak into the device chain.
  assert.equal(layout.show_dpad, true);
  assert.equal(layout.show_colors, true);
});

// ---------- layout namespace helpers ----------

test("device selection keys stay namespaced and collision-safe", () => {
  // "device:" is the editor/preview *selection* namespace; storage keys by
  // plain id inside device_mode.layouts.
  assert.equal(deviceLayoutKey(8), "device:8");
  assert.equal(deviceLayoutKey(null), "device:default");
  assert.equal(isDeviceLayoutKey("device:8"), true);
  assert.equal(isDeviceLayoutKey("8"), false);
  assert.equal(parseDeviceLayoutKey("device:8"), 8);
  assert.equal(parseDeviceLayoutKey("device:default"), null);

  const config = {
    layouts: {
      "8": { show_dpad: false }, // activity 8, not device 8
    },
    device_mode: {
      layouts: {
        "8": { show_nav: false },
      },
    },
  };
  const layout = layoutConfigForDevice(config, 8);
  assert.equal(layout.show_nav, false);
  // Activity 8's override must not apply: the device chain seeds from its
  // own defaults (true) instead.
  assert.equal(layout.show_dpad, true);
});

test("device chain is decoupled from the activity side entirely", () => {
  // Top-level keys (the "Default Activity layout" base) and layouts.default
  // are activity-only; the Default Device layout plays that role for devices.
  const config = {
    show_colors: false,
    layouts: {
      default: { show_media: false },
    },
  };
  const layout = layoutConfigForDevice(config, 8);
  assert.equal(layout.show_colors, true);
  assert.equal(layout.show_media, true);
  // The raw-read flags the card gates on are seeded explicitly.
  assert.equal(layout.show_activity, true);
  assert.equal(layout.show_commands_button, true);
});

test("device layouts store c_as_rows and validate against their own key set", () => {
  const config = {
    device_mode: {
      layouts: {
        default: { c_as_rows: true, c_row_visible_rows: 3 },
        // Activity-side spellings and keys are dropped, not honored.
        "3": { mf_as_rows: true, show_macros_button: false, show_dpad: false },
      },
    },
  };
  const shared = layoutConfigForDevice(config, null);
  assert.equal(shared.mf_as_rows, true); // c_as_rows -> internal name
  assert.equal(shared.mf_row_visible_rows, 3);

  const specific = layoutConfigForDevice(config, 3);
  assert.equal(specific.show_dpad, false);
  assert.equal(specific.mf_as_rows, true); // from the default layer
  assert.equal("show_macros_button" in specific, false);
});

test("previewSelection understands device keys", () => {
  const deviceSel = previewSelection(true, "device:8", []);
  assert.equal(deviceSel?.mode, "device");
  assert.equal(deviceSel?.deviceId, 8);
  const sharedSel = previewSelection(true, "device:default", []);
  assert.equal(sharedSel?.mode, "device");
  assert.equal(sharedSel?.deviceId, null);
  const activitySel = previewSelection(true, "8", []);
  assert.equal(activitySel?.mode, undefined);
  assert.equal(activitySel?.activityId, 8);
});

// ---------- editor helpers ----------

test("editor selection helpers route device keys through the device chain", () => {
  const config = {
    layouts: {
      default: { show_dpad: false },
    },
    device_mode: {
      layouts: {
        default: { show_media: false },
        "3": { show_nav: false },
      },
    },
  };
  const shared = layoutConfigForSelection(config, "device:default");
  assert.equal(shared.show_media, false);
  // layouts.default (activity side) never leaks; the chain's own default wins.
  assert.equal(shared.show_dpad, true);

  const specific = layoutConfigForSelection(config, "device:3");
  assert.equal(specific.show_nav, false);
  assert.equal(specific.show_media, false);

  const { nextConfig } = applyLayoutConfigPatch(config, "device:3", {
    show_colors: false,
  });
  assert.deepEqual(nextConfig.device_mode.layouts["3"], {
    show_nav: false,
    show_colors: false,
  });
  // The activity-side layouts map is untouched by device writes.
  assert.deepEqual(nextConfig.layouts, { default: { show_dpad: false } });
});

test("device patches store the c_* spelling and clean up empty layers", () => {
  // The editor patches in the internal spelling; storage translates.
  const { nextConfig } = applyLayoutConfigPatch({}, "device:default", {
    mf_as_rows: true,
  });
  assert.deepEqual(nextConfig.device_mode, {
    layouts: { default: { c_as_rows: true } },
  });

  // Toggling back to the default prunes the layer, the map, and the block.
  const { nextConfig: reverted } = applyLayoutConfigPatch(
    nextConfig,
    "device:default",
    { mf_as_rows: false },
  );
  assert.equal("device_mode" in reverted, false);

  // enabled/open_device survive layer cleanup.
  const withSettings = {
    device_mode: {
      open_device: 9,
      layouts: { "9": { c_as_rows: true } },
    },
  };
  const { nextConfig: cleaned } = applyLayoutConfigPatch(
    withSettings,
    "device:9",
    { mf_as_rows: false },
  );
  assert.deepEqual(cleaned.device_mode, { open_device: 9 });
});

test("editorDevicesFromState mirrors the devices attribute", () => {
  const devices = editorDevicesFromState({
    attributes: {
      devices: [
        { id: 3, name: "TV" },
        { id: "9", name: "Amp" },
        { id: 4, name: "" },
      ],
    },
  });
  assert.deepEqual(devices, [
    { id: 3, name: "TV" },
    { id: 9, name: "Amp" },
  ]);
});
