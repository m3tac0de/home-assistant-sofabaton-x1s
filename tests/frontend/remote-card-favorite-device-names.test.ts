// Favorites device name band: the show_favorite_device_names layout key
// (activity side only, default off, inherits Default -> activity) and the
// band on favorites buttons, which renders only when a name resolves.

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEVICE_LAYOUT_KEYS,
  LAYOUT_KEYS,
  favoriteDeviceNamesEnabled,
  layoutConfigForActivity,
} from "../../remote-card/src/remote-card-layout";
import {
  applyLayoutConfigPatch,
  favoriteDeviceNamesForEditor,
  favoriteDeviceNamesPatch,
} from "../../remote-card/src/remote-card-editor-layout";
import {
  renderCustomFavoriteButton,
  renderDrawerButton,
  type MacroFavoritesParams,
} from "../../remote-card/src/sections/macro-favorites";

function templateText(template: unknown): string {
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (template && typeof template === "object") {
    const maybeTemplate = template as { strings?: unknown[]; values?: unknown[] };
    const strings = maybeTemplate.strings ?? [];
    const values = maybeTemplate.values ?? [];
    let text = "";
    for (let index = 0; index < strings.length; index += 1) {
      text += templateText(strings[index]);
      if (index < values.length) text += templateText(values[index]);
    }
    return text;
  }
  return "";
}

const DEVICES: Record<number, string> = { 3: "Living Room Receiver", 7: "Apple TV" };

function mfParams(overrides: Partial<MacroFavoritesParams> = {}): MacroFavoritesParams {
  return {
    visible: true,
    showMacrosButton: true,
    showFavoritesButton: true,
    single: false,
    macrosDisabled: false,
    favoritesDisabled: false,
    activeDrawer: "favorites",
    drawerUp: false,
    macros: [],
    favorites: [],
    customFavorites: [],
    currentActivityId: 101,
    favoriteDeviceName: (id) => DEVICES[id] ?? "",
    renderMacrosContent: false,
    renderFavoritesContent: true,
    onToggleMacros: () => undefined,
    onToggleFavorites: () => undefined,
    onDrawerItem: () => undefined,
    onCustomFavorite: () => undefined,
    ...overrides,
  };
}

// ---------- config layer ----------

test("show_favorite_device_names is an activity layout key, off by default", () => {
  assert.equal(LAYOUT_KEYS.includes("show_favorite_device_names" as never), true);
  assert.equal(DEVICE_LAYOUT_KEYS.includes("show_favorite_device_names" as never), false);
  assert.equal(favoriteDeviceNamesEnabled({}), false);
  assert.equal(favoriteDeviceNamesEnabled(layoutConfigForActivity({ entity: "remote.x" }, 101)), false);
});

test("the Default activity layout's setting is inherited and overridable per activity", () => {
  let config: Record<string, any> = { entity: "remote.x" };
  config = applyLayoutConfigPatch(config, "default", favoriteDeviceNamesPatch(true)).nextConfig;
  assert.equal(config.layouts.default.show_favorite_device_names, true);
  assert.equal(favoriteDeviceNamesForEditor(config, "101"), true);

  config = applyLayoutConfigPatch(config, "101", favoriteDeviceNamesPatch(false)).nextConfig;
  assert.equal(favoriteDeviceNamesForEditor(config, "101"), false);
  assert.equal(favoriteDeviceNamesForEditor(config, "102"), true);

  // Flipping it back to the inherited value prunes the override.
  config = applyLayoutConfigPatch(config, "101", favoriteDeviceNamesPatch(true)).nextConfig;
  assert.equal(config.layouts["101"], undefined);

  // Back to the built-in default: nothing stored at all.
  config = applyLayoutConfigPatch(config, "default", favoriteDeviceNamesPatch(false)).nextConfig;
  assert.equal(config.layouts, undefined);
});

// ---------- band rendering ----------

test("favorites carry the band with their device's name", () => {
  const text = templateText(
    renderDrawerButton(mfParams(), { name: "Netflix", command_id: 12, device_id: 7 }, "favorites"),
  );
  assert.equal(text.includes("drawer-btn--banded"), true);
  assert.equal(text.includes("drawer-btn__device"), true);
  assert.equal(text.includes("Apple TV"), true);
});

test("no band while the setting is off, for macros, or for an unknown device", () => {
  const off = templateText(
    renderDrawerButton(
      mfParams({ favoriteDeviceName: null }),
      { name: "Netflix", command_id: 12, device_id: 7 },
      "favorites",
    ),
  );
  assert.equal(off.includes("drawer-btn__device"), false);

  const macro = templateText(
    renderDrawerButton(mfParams(), { name: "Movie", command_id: 5, device_id: 3 }, "macros"),
  );
  assert.equal(macro.includes("drawer-btn__device"), false);

  const unknown = templateText(
    renderDrawerButton(mfParams(), { name: "X", command_id: 1, device_id: 99 }, "favorites"),
  );
  assert.equal(unknown.includes("drawer-btn__device"), false);
  assert.equal(unknown.includes("drawer-btn--banded"), false);
});

test("custom favorites get the band only when they name a hub device", () => {
  const withDevice = templateText(
    renderCustomFavoriteButton(mfParams(), { name: "Input", command_id: 4, device_id: 3 }),
  );
  assert.equal(withDevice.includes("Living Room Receiver"), true);

  // A bare command_id targets the current activity, not a device.
  const activityCommand = templateText(
    renderCustomFavoriteButton(mfParams(), { name: "Input", command_id: 4 }),
  );
  assert.equal(activityCommand.includes("drawer-btn__device"), false);

  const action = templateText(
    renderCustomFavoriteButton(mfParams(), {
      name: "Lights",
      device_id: 3,
      action: { action: "toggle" },
    }),
  );
  assert.equal(action.includes("drawer-btn__device"), false);
});
