// Number pad behind the D-pad (docs/internal/numpad-plan.md): the key
// specs, the layout switch on both chains, the editor row, and the
// store's fail-closed "any keypad key bound" gate.

import test from "node:test";
import assert from "node:assert/strict";
import { nothing } from "lit";
import {
  ID,
  NUMPAD_KEY_IDS,
  DEVICE_LAYOUT_KEYS,
  LAYOUT_KEYS,
  layoutConfigForDevice,
  numpadEnabled,
} from "../../remote-card/src/remote-card-layout";
import {
  applyLayoutConfigPatch,
  numpadEnabledForEditor,
  numpadTogglePatch,
} from "../../remote-card/src/remote-card-editor-layout";
import { NUMPAD_KEYS, X2_ONLY_KEY_IDS } from "../../remote-card/src/sections/key-groups";
import { renderGroupOrderSection } from "../../remote-card/src/editor-sections/group-order";
import { RemoteCardStore } from "../../remote-card/src/state/remote-card-store";
import { automationAssistLabelForKey } from "../../remote-card/src/remote-card-ui-helpers";
import type { HassLike, RemoteCardConfig } from "../../remote-card/src/remote-card-types";

const ENTITY = "remote.living_room";

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

function templateText(template: unknown): string {
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (template && typeof template === "object") {
    const maybe = template as { strings?: unknown[]; values?: unknown[] };
    const strings = maybe.strings ?? [];
    const values = maybe.values ?? [];
    let text = "";
    for (let i = 0; i < strings.length; i += 1) {
      text += templateText(strings[i]);
      if (i < values.length) text += templateText(values[i]);
    }
    return text;
  }
  return "";
}

function x2State(assigned: number[], overrides: Record<string, unknown> = {}) {
  return {
    state: "on",
    attributes: {
      hub_version: "X2",
      current_activity: "Watch TV",
      current_activity_id: 101,
      load_state: "idle",
      entry_id: "entry-1",
      activities: [{ id: 101, name: "Watch TV", state: "on" }],
      devices: [{ id: 3, name: "TV", sort: 1 }],
      assigned_keys: { 101: assigned },
      macro_keys: {},
      favorite_keys: {},
      ...overrides,
    },
  };
}

function createHass(options: {
  state: Record<string, unknown>;
  keymapResponse?: unknown;
}): HassLike {
  return {
    states: { [ENTITY]: options.state as never },
    async callWS<T>(message: Record<string, unknown>) {
      if (String(message.type) === "config/entity_registry/get") {
        return { platform: "sofabaton_x1s" } as T;
      }
      if (String(message.type) === "sofabaton_x1s/device/keymap") {
        return (options.keymapResponse ?? { keymap: null, reason: "cache_miss" }) as T;
      }
      return { ok: true } as T;
    },
    async callService() {
      return undefined;
    },
  };
}

function createStore(hass: HassLike, config: Partial<RemoteCardConfig> = {}) {
  const store = new RemoteCardStore(() => undefined, { fireEvent: () => undefined });
  store.setConfig({ entity: ENTITY, ...config } as RemoteCardConfig);
  store.setHass(hass);
  return store;
}

// ---------- key specs ----------

test("the keypad is twelve X2-only keys in phone order", () => {
  assert.deepEqual(
    NUMPAD_KEYS.map((k) => k.label),
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "-", "0", "E"],
  );
  assert.deepEqual(
    NUMPAD_KEYS.map((k) => k.id),
    [169, 168, 167, 166, 165, 164, 163, 162, 161, 160, 159, 158],
  );
  for (const spec of NUMPAD_KEYS) {
    assert.equal(spec.cmd, spec.id, spec.key);
    assert.equal(X2_ONLY_KEY_IDS.has(spec.id), true, spec.key);
    assert.equal(NUMPAD_KEY_IDS.includes(spec.id), true, spec.key);
  }
  assert.equal(NUMPAD_KEY_IDS.length, 12);
  assert.equal(ID.NUM_ENTER, 158);
  assert.equal(ID.NUM_1, 169);
});

test("Key capture labels: digits stay themselves, E resolves to Enter", () => {
  assert.equal(automationAssistLabelForKey("num7", "7"), "7");
  assert.equal(automationAssistLabelForKey("numenter", ""), "Enter");
  assert.equal(automationAssistLabelForKey("numdash", "-"), "-");
});

// ---------- layout switch ----------

test("show_numpad is admitted on both layout chains and defaults on", () => {
  assert.equal(LAYOUT_KEYS.includes("show_numpad" as never), true);
  assert.equal(DEVICE_LAYOUT_KEYS.includes("show_numpad" as never), true);
  assert.equal(numpadEnabled({}), true);
  assert.equal(numpadEnabled(null), true);
  assert.equal(numpadEnabled({ show_numpad: false }), false);
  assert.equal(layoutConfigForDevice({}, 3).show_numpad, true);
  assert.equal(
    layoutConfigForDevice(
      { device_mode: { layouts: { default: { show_numpad: false } } } },
      3,
    ).show_numpad,
    false,
  );
});

test("the numpad toggle patch prunes to nothing at the default and stores an off", () => {
  const on = applyLayoutConfigPatch({}, "default", numpadTogglePatch(true));
  assert.equal("show_numpad" in on.nextConfig, false);
  // The Default Activity layout is written to layouts.default.
  const off = applyLayoutConfigPatch({}, "default", numpadTogglePatch(false));
  assert.equal(off.nextConfig.layouts.default.show_numpad, false);
  assert.equal(numpadEnabledForEditor(off.nextConfig, "default"), false);
  assert.equal(numpadEnabledForEditor(off.nextConfig, "101"), false);

  const device = applyLayoutConfigPatch({}, "device:3", numpadTogglePatch(false));
  assert.equal(device.nextConfig.device_mode.layouts["3"].show_numpad, false);
  assert.equal(numpadEnabledForEditor(device.nextConfig, "device:3"), false);
  assert.equal(numpadEnabledForEditor(device.nextConfig, "device:default"), true);
});

// ---------- editor row ----------

function groupOrderParams(overrides: Record<string, unknown> = {}) {
  return {
    hass: null,
    expanded: true,
    selection: "default",
    selectionOptions: [{ value: "default", label: "Default" }],
    selectionNote: "note",
    visibleOrder: ["dpad"],
    isEditorX2: true,
    asRows: false,
    visibleRows: 2,
    sortableReady: false,
    macroEnabled: true,
    favoritesEnabled: true,
    volumeEnabled: true,
    channelEnabled: true,
    mediaEnabled: true,
    dvrEnabled: true,
    showNumpadSwitch: true,
    numpadEnabled: true,
    isDeviceSelection: false,
    shortcutsStrip: nothing as typeof nothing,
    shortcutsPanel: nothing as typeof nothing,
    commandsEnabled: true,
    powerEnabled: true,
    showDeviceModeSwitch: false,
    deviceModeEnabled: true,
    isGroupEnabled: () => true,
    groupLabel: (key: string) => key,
    onToggleExpanded: () => undefined,
    onSelectLayout: () => undefined,
    onSetMacro: () => undefined,
    onSetFavorites: () => undefined,
    onSetCommands: () => undefined,
    onSetPower: () => undefined,
    onSetDeviceMode: () => undefined,
    onSetVolume: () => undefined,
    onSetChannel: () => undefined,
    onSetMedia: () => undefined,
    onSetDvr: () => undefined,
    onSetNumpad: () => undefined,
    onSetGroupEnabled: () => undefined,
    rowMenuKey: null,
    onToggleRowMenu: () => undefined,
    favoriteDeviceNamesAvailable: true,
    favoriteDeviceNames: false,
    onSetFavoriteDeviceNames: () => undefined,
    onSetMfAsRows: () => undefined,
    onSetMfRowVisibleRows: () => undefined,
    onMoveGroupByKey: () => undefined,
    onMoveGroupByVisibleIndex: () => undefined,
    onResetGroupOrder: () => undefined,
    ...overrides,
  };
}

test("the D-pad row carries the Number pad switch only when the shell allows it", () => {
  const shown = templateText(renderGroupOrderSection(groupOrderParams()));
  assert.equal(shown.includes("Number pad"), true);
  // Independent of the D-pad switch: the keypad can stand on its own.
  const dpadOff = renderGroupOrderSection(groupOrderParams({ isGroupEnabled: () => false }));
  assert.equal(templateText(dpadOff).includes("Number pad"), true);

  const hidden = templateText(
    renderGroupOrderSection(groupOrderParams({ showNumpadSwitch: false })),
  );
  assert.equal(hidden.includes("Number pad"), false);
  assert.equal(hidden.includes("sb-layout-switch-item-empty"), true);
});

// ---------- store gate ----------

test("anyKeyBound fails closed without data and reads the activity page", async () => {
  // The enabled-keys cache is built by deriveRuntimeState, which the card
  // runs before the gate on every render.
  const bound = createStore(createHass({ state: x2State([174, 176, 169]) }));
  await flush();
  bound.deriveRuntimeState();
  assert.equal(bound.anyKeyBound(NUMPAD_KEY_IDS), true);

  const unbound = createStore(createHass({ state: x2State([174, 176]) }));
  await flush();
  unbound.deriveRuntimeState();
  assert.equal(unbound.anyKeyBound(NUMPAD_KEY_IDS), false);
  // isEnabled keeps its fail-open contract for keys; the gate must not.
  assert.equal(unbound.isEnabled(169), false);

  const noData = createStore(createHass({ state: x2State([]) }));
  await flush();
  noData.deriveRuntimeState();
  assert.equal(noData.isEnabled(169), true);
  assert.equal(noData.anyKeyBound(NUMPAD_KEY_IDS), false);
});

test("anyKeyBound reads the device keymap in device mode", async () => {
  const keymap = {
    keymap: {
      device: { device_id: 3, name: "TV" },
      buttons: [174, 158],
      bindings: [{ button_id: 158, command_id: 9, command_name: "Enter" }],
      commands: [{ command_id: 9, name: "Enter" }],
    },
    generation: 1,
  };
  const store = createStore(createHass({ state: x2State([174]), keymapResponse: keymap }));
  await flush();
  assert.equal(store.anyKeyBound(NUMPAD_KEY_IDS), false);
  store.setMode("device");
  store.setDevice(3);
  await flush();
  await flush();
  assert.equal(store.mode(), "device");
  assert.equal(store.anyKeyBound(NUMPAD_KEY_IDS), true);
  assert.equal(store.anyKeyBound([ID.NUM_5]), false);
});
