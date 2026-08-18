import { POWERED_OFF_LABELS } from "./remote-card-layout";
import { isLocalizedPoweredOffLabel, str } from "./remote-card-strings";

function hasOwn(obj: any, key: any) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

export function currentActivityIdFromRemote(remoteState: any) {
  const activityId = remoteState?.attributes?.current_activity_id;
  if (activityId != null) return Number(activityId);
  return null;
}

export function normalizeActivities(source: any) {
  return (Array.isArray(source) ? source : [])
    .map((activity) => ({
      id: Number(activity?.id),
      name: String(activity?.name ?? ""),
      state: String(activity?.state ?? ""),
    }))
    .filter((activity) => Number.isFinite(activity.id) && activity.name);
}

export function activitiesFromRemote(
  remoteState: any,
  isHubIntegration: boolean,
  hubActivitiesCache: any,
) {
  const list = remoteState?.attributes?.activities;
  const source =
    Array.isArray(list) && list.length
      ? list
      : isHubIntegration && Array.isArray(hubActivitiesCache)
        ? hubActivitiesCache
        : [];

  return {
    activities: normalizeActivities(source),
    nextHubActivitiesCache:
      isHubIntegration && Array.isArray(list) && list.length
        ? list
        : hubActivitiesCache,
  };
}

/**
 * Normalize the remote entity's `devices` attribute (x1s integration only;
 * published only while the persistent cache is enabled, which is also the
 * device-mode capability signal).
 */
export function devicesFromRemote(remoteState: any) {
  const list = remoteState?.attributes?.devices;
  return (Array.isArray(list) ? list : [])
    .map((device) => ({
      id: Number(device?.id),
      name: String(device?.name ?? ""),
      device_class:
        device?.device_class != null ? String(device.device_class) : undefined,
    }))
    .filter((device) => Number.isFinite(device.id) && device.name);
}

export function deviceNameForId(devices: any[], deviceId: unknown) {
  if (deviceId == null) return "";
  const id = Number(deviceId);
  if (!Number.isFinite(id)) return "";
  const match = Array.isArray(devices)
    ? devices.find((device) => device.id === id)
    : null;
  return match?.name || "";
}

export function activityNameForId(activities: any[], activityId: unknown) {
  if (activityId == null) return "";
  const id = Number(activityId);
  if (!Number.isFinite(id)) return "";
  const match = Array.isArray(activities)
    ? activities.find((activity) => activity.id === id)
    : null;
  return match?.name || "";
}

export function currentActivityLabelFromRemote(remoteState: any, activities: any[]) {
  const remoteActivity = remoteState?.attributes?.current_activity;
  if (remoteActivity) return String(remoteActivity);
  const activityId = currentActivityIdFromRemote(remoteState);
  return activityNameForId(activities, activityId);
}

export interface PreviewSelectionState {
  activityId: number | null;
  label: string;
  poweredOff: boolean;
  /** Editor previews a device layout ("device:<id>" / "device:default"). */
  mode?: "activity" | "device";
  deviceId?: number | null;
}

export function previewSelection(
  editMode: boolean,
  previewActivity: any,
  activities: any[],
): PreviewSelectionState | null {
  if (!editMode) return null;
  const selection = previewActivity;
  if (selection == null || selection === "") {
    return {
      activityId: null,
      label: str().card.defaultLayout,
      poweredOff: false,
    };
  }
  if (selection === "powered_off") {
    return {
      activityId: null,
      label: str().card.poweredOff,
      poweredOff: true,
    };
  }
  if (typeof selection === "string" && selection.startsWith("device:")) {
    const rest = selection.slice("device:".length);
    if (rest === "default") {
      return {
        activityId: null,
        label: str().card.allDevicesLayout,
        poweredOff: false,
        mode: "device",
        deviceId: null,
      };
    }
    const deviceId = Number(rest);
    if (!Number.isFinite(deviceId)) return null;
    return {
      activityId: null,
      label: "",
      poweredOff: false,
      mode: "device",
      deviceId,
    };
  }
  const id = Number(selection);
  if (!Number.isFinite(id)) return null;
  return {
    activityId: id,
    label: activityNameForId(activities, id),
    poweredOff: false,
  };
}

export function isPoweredOffLabel(state: any) {
  const s = String(state || "")
    .trim()
    .toLowerCase();
  // POWERED_OFF_LABELS covers the protocol/state values coming from HA and
  // the hub; the localized check covers the translated select option label.
  return POWERED_OFF_LABELS.has(s) || isLocalizedPoweredOffLabel(s);
}

export function isActivityOn(
  activityId: unknown,
  activities: any[],
  currentActivityLabel: string,
) {
  if (activityId == null) return false;
  const id = Number(activityId);
  if (!Number.isFinite(id)) return false;
  const match = Array.isArray(activities)
    ? activities.find((activity) => Number(activity?.id) === id)
    : null;
  if (match && match.state != null && String(match.state).trim() !== "") {
    const s = String(match.state).trim().toLowerCase();
    return !isPoweredOffLabel(s) && s !== "off";
  }
  return Boolean(currentActivityLabel) && !isPoweredOffLabel(currentActivityLabel);
}

export function optionsSignature(options: any[]) {
  const names = Array.isArray(options)
    ? options.map((opt) => String(opt ?? ""))
    : [];
  return `${names.length}:${names.join(",")}`;
}

export function drawerItemsSignature(items: any[]) {
  const entries = Array.isArray(items)
    ? items.map((item) => {
        const commandId = String(item?.command_id ?? item?.id ?? "");
        const deviceId = String(item?.device_id ?? item?.device ?? "");
        const name = String(item?.name ?? "");
        return `${commandId}:${deviceId}:${name}`;
      })
    : [];
  return `${entries.length}:${entries.join(",")}`;
}

export function enabledButtonsSignature(raw: any) {
  if (!Array.isArray(raw)) return String(raw ?? "");
  return `${raw.length}:${raw.map((entry) => String(entry ?? "")).join(",")}`;
}

export function resolveHubActivityData({
  isHubIntegration,
  activityId,
  assignedKeys,
  macroKeys,
  favoriteKeys,
  hubAssignedKeysCache,
  hubMacrosCache,
  hubFavoritesCache,
}: {
  isHubIntegration: boolean;
  activityId: unknown;
  assignedKeys: any;
  macroKeys: any;
  favoriteKeys: any;
  hubAssignedKeysCache: Record<string, any>;
  hubMacrosCache: Record<string, any>;
  hubFavoritesCache: Record<string, any>;
}) {
  const nextAssignedCache = { ...(hubAssignedKeysCache || {}) };
  const nextMacrosCache = { ...(hubMacrosCache || {}) };
  const nextFavoritesCache = { ...(hubFavoritesCache || {}) };
  const actKey = activityId != null ? String(activityId) : null;

  const assignedMap =
    assignedKeys && typeof assignedKeys === "object" ? assignedKeys : null;
  const macroMap = macroKeys && typeof macroKeys === "object" ? macroKeys : null;
  const favoriteMap =
    favoriteKeys && typeof favoriteKeys === "object" ? favoriteKeys : null;

  if (isHubIntegration && actKey != null) {
    if (
      assignedMap &&
      (hasOwn(assignedMap, actKey) || hasOwn(assignedMap, activityId))
    ) {
      const v = assignedMap[actKey] ?? assignedMap[activityId as any];
      nextAssignedCache[actKey] = Array.isArray(v) ? v : [];
    }
    if (macroMap && (hasOwn(macroMap, actKey) || hasOwn(macroMap, activityId))) {
      const v = macroMap[actKey] ?? macroMap[activityId as any];
      nextMacrosCache[actKey] = Array.isArray(v) ? v : [];
    }
    if (
      favoriteMap &&
      (hasOwn(favoriteMap, actKey) || hasOwn(favoriteMap, activityId))
    ) {
      const v = favoriteMap[actKey] ?? favoriteMap[activityId as any];
      nextFavoritesCache[actKey] = Array.isArray(v) ? v : [];
    }
  }

  const macros =
    macroMap &&
    actKey != null &&
    (hasOwn(macroMap, actKey) || hasOwn(macroMap, activityId))
      ? (macroMap[actKey] ?? macroMap[activityId as any] ?? [])
      : isHubIntegration && actKey != null
        ? (nextMacrosCache[actKey] ?? [])
        : [];

  const favorites =
    favoriteMap &&
    actKey != null &&
    (hasOwn(favoriteMap, actKey) || hasOwn(favoriteMap, activityId))
      ? (favoriteMap[actKey] ?? favoriteMap[activityId as any] ?? [])
      : isHubIntegration && actKey != null
        ? (nextFavoritesCache[actKey] ?? [])
        : [];

  const rawAssignedKeys =
    assignedMap &&
    actKey != null &&
    (hasOwn(assignedMap, actKey) || hasOwn(assignedMap, activityId))
      ? (assignedMap[actKey] ?? assignedMap[activityId as any] ?? null)
      : isHubIntegration && actKey != null
        ? (nextAssignedCache[actKey] ?? null)
        : null;

  return {
    actKey,
    assignedMap,
    macroMap,
    favoriteMap,
    hubAssignedKeysCache: nextAssignedCache,
    hubMacrosCache: nextMacrosCache,
    hubFavoritesCache: nextFavoritesCache,
    macros,
    favorites,
    rawAssignedKeys,
  };
}
