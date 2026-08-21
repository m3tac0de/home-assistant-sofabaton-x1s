import {
  DEFAULT_GROUP_ORDER,
  DEFAULT_ROW_VISIBLE_ROWS,
  DEVICE_DEFAULT_LAYOUT_KEY,
  DEVICE_LAYOUT_DEFAULTS,
  GROUP_VISIBILITY_KEYS,
  LAYOUT_KEYS,
  channelGroupEnabled,
  commandsButtonEnabled,
  deviceToggleEnabled,
  favoritesButtonEnabled,
  isDeviceLayoutKey,
  layoutBaseConfig,
  layoutConfigForActivity,
  layoutConfigForDevice,
  layoutDefaultConfig,
  macrosButtonEnabled,
  mfAsRows,
  mfRowVisibleRows,
  normalizedGroupOrder,
  parseDeviceLayoutKey,
  resolveStoredDeviceLayer,
  storedDeviceLayer,
  toStoredDeviceLayer,
  volumeGroupEnabled,
} from "./remote-card-layout";
import { str } from "./remote-card-strings";

/** Stored layer key inside device_mode.layouts for a "device:*" selection. */
export function deviceStoredLayerKey(selection: unknown): string {
  const id = parseDeviceLayoutKey(selection);
  return id == null ? "default" : String(id);
}

export function layoutHasCustomOverride(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  if (isDeviceLayoutKey(selection)) {
    return Boolean(storedDeviceLayer(config, deviceStoredLayerKey(selection)));
  }
  const layouts = config?.layouts;
  if (!layouts || typeof layouts !== "object") return false;
  const key = String(selection ?? "");
  const override =
    layouts[key] ??
    (Number.isFinite(Number(selection)) ? layouts[Number(selection)] : null);
  return Boolean(override && typeof override === "object");
}

export function layoutSelectionNote(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  if (selection === "default") {
    return str().editor.noteDefaultLayout;
  }
  if (selection === DEVICE_DEFAULT_LAYOUT_KEY) {
    return str().editor.noteDeviceDefaultLayout;
  }
  // Name the scope in both notes: activity and device labels can be
  // similar, and this line signals which of the two the user is editing.
  const isDevice = isDeviceLayoutKey(selection);
  if (layoutHasCustomOverride(config, selection)) {
    return isDevice
      ? str().editor.noteCustomDeviceLayout
      : str().editor.noteCustomActivityLayout;
  }
  return isDevice
    ? str().editor.noteUsingDeviceDefault
    : str().editor.noteUsingActivityDefault;
}

export function editorActivitiesFromState(state: any) {
  const list = state?.attributes?.activities;
  if (!Array.isArray(list)) return [];
  return list
    .map((activity) => ({
      id: Number(activity?.id),
      name: String(activity?.name ?? ""),
    }))
    .filter((activity) => Number.isFinite(activity.id) && activity.name);
}

/** Mirror of editorActivitiesFromState for the `devices` attribute. */
export function editorDevicesFromState(state: any) {
  const list = state?.attributes?.devices;
  if (!Array.isArray(list)) return [];
  return list
    .map((device) => ({
      id: Number(device?.id),
      name: String(device?.name ?? ""),
    }))
    .filter((device) => Number.isFinite(device.id) && device.name);
}

export function layoutConfigForSelection(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  if (selection === "default") {
    return layoutDefaultConfig(config);
  }
  if (isDeviceLayoutKey(selection)) {
    // "device:default" resolves to the shared device layer; "device:<id>"
    // stacks the per-device override on top.
    return layoutConfigForDevice(config, parseDeviceLayoutKey(selection));
  }
  return layoutConfigForActivity(config, selection);
}

// ---------- write path: patch + prune ----------
//
// Every write prunes the target layer down to intentional overrides: a key
// whose value matches what the layer would inherit anyway is dropped, and a
// layer (or map) left empty disappears. Saved YAML then only ever contains
// deviations, not the churn of toggles flipped away and back.

// Built-in activity-side defaults, spelled out for the pruning comparison
// (absent = these values throughout the resolution helpers).
const ACTIVITY_LAYOUT_DEFAULTS: Record<string, unknown> = Object.freeze({
  show_activity: true,
  show_dpad: true,
  show_nav: true,
  show_mid: true,
  show_volume: true,
  show_channel: true,
  show_media: true,
  show_dvr: true,
  show_colors: true,
  show_abc: true,
  show_macros_button: true,
  show_favorites_button: true,
  show_device_toggle: true,
  mf_as_rows: false,
  mf_row_visible_rows: DEFAULT_ROW_VISIBLE_ROWS,
  group_order: Object.freeze(DEFAULT_GROUP_ORDER.slice()),
});

const sameLayoutValue = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The value a raw merged config resolves to for one layout key, the way the
 * card actually reads it: show_mid fallback for volume/channel, null
 * tri-states meaning "shown", group_order normalized, built-in defaults for
 * absent keys.
 */
function effectiveValueFor(
  key: string,
  raw: Record<string, unknown>,
  defaults: Record<string, unknown>,
): unknown {
  switch (key) {
    case "show_volume":
      return volumeGroupEnabled(raw);
    case "show_channel":
      return channelGroupEnabled(raw);
    case "show_macros_button":
      return macrosButtonEnabled(raw);
    case "show_favorites_button":
      return favoritesButtonEnabled(raw);
    case "group_order":
      return normalizedGroupOrder(raw.group_order);
    default:
      return raw[key] !== undefined ? raw[key] : defaults[key];
  }
}

/**
 * Drop every layer key whose removal would leave the resolved value
 * unchanged. Comparing resolved values (not raw ones) keeps the coupled
 * semantics honest — e.g. `show_volume: true` next to a `show_mid: false`
 * is load-bearing and survives, while over a plain base it is noise.
 */
function pruneLayoutLayer(
  layer: Record<string, unknown>,
  rawBase: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const pruned: Record<string, unknown> = {};
  const withLayer = { ...rawBase, ...layer };
  for (const [key, value] of Object.entries(layer)) {
    if (value === undefined) continue;
    const without = { ...withLayer };
    if (rawBase[key] !== undefined) {
      without[key] = rawBase[key];
    } else {
      delete without[key];
    }
    const kept = effectiveValueFor(key, withLayer, defaults);
    const dropped = effectiveValueFor(key, without, defaults);
    if (dropped !== undefined && sameLayoutValue(kept, dropped)) continue;
    pruned[key] = value;
  }
  return pruned;
}

/** Assign `value` under `key` when non-empty, else remove the key. */
function setOrDelete(
  target: Record<string, any>,
  key: string,
  value: Record<string, unknown>,
): void {
  if (Object.keys(value).length) {
    target[key] = value;
  } else {
    delete target[key];
  }
}

export function applyLayoutConfigPatch(
  config: Record<string, any> | null | undefined,
  selection: unknown,
  patch: Record<string, any>,
) {
  const next = { ...(config || {}) };

  if (isDeviceLayoutKey(selection)) {
    // Device layers live under device_mode.layouts and are stored in the
    // device spelling (c_as_rows); patches and pruning run in the internal
    // shape and translate at the boundary.
    const layerKey = deviceStoredLayerKey(selection);
    const block = { ...(next.device_mode || {}) };
    const layouts = { ...(block.layouts || {}) };
    const current = resolveStoredDeviceLayer(storedDeviceLayer(next, layerKey));
    const rawBase =
      layerKey === "default"
        ? {}
        : resolveStoredDeviceLayer(storedDeviceLayer(next, "default"));
    const merged = pruneLayoutLayer(
      { ...current, ...patch },
      rawBase,
      DEVICE_LAYOUT_DEFAULTS,
    );
    setOrDelete(layouts, layerKey, toStoredDeviceLayer(merged));
    setOrDelete(block, "layouts", layouts);
    setOrDelete(next, "device_mode", block);
    return { nextConfig: next };
  }

  if (selection === "default") {
    // The Default Activity layout is written to layouts.default — the same
    // shape the device side uses (device_mode.layouts.default), keeping the
    // top level for card settings only. Top-level layout keys (the released
    // stored shape) are relocated into the layer on first write: they are the
    // base BENEATH layouts.default, so folding them in preserves resolution
    // for every reader, and layouts.default has been understood since
    // per-activity layouts first shipped.
    const defaultLayout = next.layouts?.default;
    const existing =
      defaultLayout && typeof defaultLayout === "object" ? defaultLayout : {};
    const merged = pruneLayoutLayer(
      { ...layoutBaseConfig(next), ...existing, ...patch },
      {},
      ACTIVITY_LAYOUT_DEFAULTS,
    );
    for (const key of LAYOUT_KEYS) delete next[key];
    const layouts = { ...(next.layouts || {}) };
    setOrDelete(layouts, "default", merged);
    setOrDelete(next, "layouts", layouts);
    return { nextConfig: next };
  }

  const layouts = { ...(next.layouts || {}) };
  const selectionKey = String(selection);
  const existing =
    layouts[selectionKey] && typeof layouts[selectionKey] === "object"
      ? layouts[selectionKey]
      : {};
  const merged = pruneLayoutLayer(
    { ...existing, ...patch },
    layoutDefaultConfig(next),
    ACTIVITY_LAYOUT_DEFAULTS,
  );
  setOrDelete(layouts, selectionKey, merged);
  setOrDelete(next, "layouts", layouts);
  return { nextConfig: next };
}

export function groupOrderListForEditor(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  const layout = layoutConfigForSelection(config, selection);
  return normalizedGroupOrder(layout?.group_order);
}

export function groupLabel(key: string) {
  return str().groups[key] || key;
}

export function isGroupEnabled(
  config: Record<string, any> | null | undefined,
  selection: unknown,
  key: string,
) {
  const prop = GROUP_VISIBILITY_KEYS[key];
  if (!prop) return true;
  const layout = layoutConfigForSelection(config, selection);
  return layout?.[prop] ?? true;
}

export function macroTogglePatch(enabled: boolean) {
  return { show_macros_button: !!enabled };
}

export function favoritesTogglePatch(enabled: boolean) {
  return { show_favorites_button: !!enabled };
}

// ---------- device mode (docs/internal/device-mode-plan.md §5) ----------

export function commandsEnabled(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  return commandsButtonEnabled(layoutConfigForSelection(config, selection));
}

export function commandsTogglePatch(enabled: boolean) {
  return { show_commands_button: !!enabled };
}

export function deviceToggleEnabledForEditor(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  return deviceToggleEnabled(layoutConfigForSelection(config, selection));
}

export function deviceTogglePatch(enabled: boolean) {
  return { show_device_toggle: !!enabled };
}

export function mfAsRowsForEditor(
  config: Record<string, any> | null | undefined,
  selection: unknown,
): boolean {
  return mfAsRows(layoutConfigForSelection(config, selection));
}

export function mfRowVisibleRowsForEditor(
  config: Record<string, any> | null | undefined,
  selection: unknown,
): number {
  return mfRowVisibleRows(layoutConfigForSelection(config, selection));
}

export function mfAsRowsPatch(enabled: boolean) {
  return { mf_as_rows: !!enabled };
}

export function mfRowVisibleRowsPatch(value: number) {
  return { mf_row_visible_rows: value };
}

// Volume/channel patches touch only their own key. The legacy composite
// `show_mid` stays a read-side fallback (old configs), but is never written:
// the mid row renders whenever volume or channel resolves visible.
export function volumeTogglePatch(enabled: boolean) {
  return { show_volume: !!enabled };
}

export function channelTogglePatch(enabled: boolean) {
  return { show_channel: !!enabled };
}

export function dvrTogglePatch(enabled: boolean) {
  return {
    show_dvr: !!enabled,
  };
}

export function groupEnabledPatch(key: string, enabled: boolean) {
  const prop = GROUP_VISIBILITY_KEYS[key];
  return prop ? { [prop]: !!enabled } : null;
}

// Drag-and-drop reorder: move a group from one *visible* index to another.
// Hidden groups keep their slots in the full order; visible slots are
// refilled in the new visible sequence. Returns null when out of bounds or
// a no-op.
export function moveVisibleGroup(
  order: string[],
  isVisible: (key: string) => boolean,
  fromVisible: number,
  toVisible: number,
): string[] | null {
  const visibleOrder = order.filter(isVisible);
  if (
    !Number.isInteger(fromVisible) ||
    !Number.isInteger(toVisible) ||
    fromVisible < 0 ||
    fromVisible >= visibleOrder.length ||
    toVisible < 0 ||
    toVisible >= visibleOrder.length ||
    fromVisible === toVisible
  ) {
    return null;
  }

  const nextVisible = visibleOrder.slice();
  const [moved] = nextVisible.splice(fromVisible, 1);
  nextVisible.splice(toVisible, 0, moved);

  let vi = 0;
  return order.map((key) => (isVisible(key) ? nextVisible[vi++] : key));
}
