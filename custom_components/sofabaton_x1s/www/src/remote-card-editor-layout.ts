import {
  GROUP_LABELS,
  GROUP_VISIBILITY_KEYS,
  channelGroupEnabled,
  dvrGroupEnabled,
  favoritesButtonEnabled,
  layoutConfigForActivity,
  layoutDefaultConfig,
  macrosButtonEnabled,
  mediaGroupEnabled,
  normalizedGroupOrder,
  volumeGroupEnabled,
} from "./remote-card-layout";

export function layoutHasCustomOverride(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
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
    return "Used for Activities without their own layout";
  }
  return layoutHasCustomOverride(config, selection)
    ? "Using custom layout"
    : "Using default layout";
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

export function layoutConfigForSelection(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  if (selection === "default") {
    return layoutDefaultConfig(config);
  }
  return layoutConfigForActivity(config, selection);
}

export function applyLayoutConfigPatch(
  config: Record<string, any> | null | undefined,
  selection: unknown,
  patch: Record<string, any>,
) {
  const next = { ...(config || {}) };
  if (selection === "default") {
    const defaultLayout = next.layouts?.default;
    if (defaultLayout && typeof defaultLayout === "object") {
      next.layouts = {
        ...(next.layouts || {}),
        default: { ...defaultLayout, ...patch },
      };
      return { nextConfig: next, syncFormPatch: null };
    }
    Object.assign(next, patch);
    return { nextConfig: next, syncFormPatch: patch };
  }

  const layouts = { ...(next.layouts || {}) };
  const existing =
    layouts[selection] && typeof layouts[selection] === "object"
      ? layouts[selection]
      : {};
  layouts[selection] = { ...existing, ...patch };
  next.layouts = layouts;
  return { nextConfig: next, syncFormPatch: null };
}

export function groupOrderListForEditor(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  const layout = layoutConfigForSelection(config, selection);
  return normalizedGroupOrder(layout?.group_order);
}

export function groupLabel(key: string) {
  return GROUP_LABELS[key] || key;
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

export function macroEnabled(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  return macrosButtonEnabled(layoutConfigForSelection(config, selection));
}

export function favoritesEnabled(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  return favoritesButtonEnabled(layoutConfigForSelection(config, selection));
}

export function volumeEnabled(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  return volumeGroupEnabled(layoutConfigForSelection(config, selection));
}

export function channelEnabled(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  return channelGroupEnabled(layoutConfigForSelection(config, selection));
}

export function mediaEnabled(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  return mediaGroupEnabled(layoutConfigForSelection(config, selection));
}

export function dvrEnabled(
  config: Record<string, any> | null | undefined,
  selection: unknown,
) {
  return dvrGroupEnabled(layoutConfigForSelection(config, selection));
}

export function macroTogglePatch(
  config: Record<string, any> | null | undefined,
  selection: unknown,
  enabled: boolean,
) {
  return {
    show_macros_button: !!enabled,
    show_favorites_button: !!favoritesEnabled(config, selection),
  };
}

export function favoritesTogglePatch(
  config: Record<string, any> | null | undefined,
  selection: unknown,
  enabled: boolean,
) {
  return {
    show_macros_button: !!macroEnabled(config, selection),
    show_favorites_button: !!enabled,
  };
}

export function volumeTogglePatch(
  config: Record<string, any> | null | undefined,
  selection: unknown,
  enabled: boolean,
) {
  const channel = channelEnabled(config, selection);
  return {
    show_volume: !!enabled,
    show_mid: !!enabled || !!channel,
  };
}

export function channelTogglePatch(
  config: Record<string, any> | null | undefined,
  selection: unknown,
  enabled: boolean,
) {
  const volume = volumeEnabled(config, selection);
  return {
    show_channel: !!enabled,
    show_mid: !!enabled || !!volume,
  };
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
