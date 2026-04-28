// custom_components/sofabaton_x1s/www/src/remote-card-layout.ts
var DEFAULT_GROUP_ORDER = [
  "activity",
  "macro_favorites",
  "dpad",
  "nav",
  "mid",
  "media",
  "colors",
  "abc"
];
var DEFAULT_GROUP_ORDER_SET = new Set(DEFAULT_GROUP_ORDER);
var LAYOUT_KEYS = [
  "group_order",
  "show_activity",
  "show_dpad",
  "show_nav",
  "show_mid",
  "show_volume",
  "show_channel",
  "show_media",
  "show_dvr",
  "show_colors",
  "show_abc",
  "show_macros_button",
  "show_favorites_button"
];
function layoutBaseConfig(config) {
  const base = {};
  if (!config || typeof config !== "object") return base;
  for (const key of LAYOUT_KEYS) {
    if (config[key] !== void 0) {
      base[key] = config[key];
    }
  }
  return base;
}
function layoutDefaultConfig(config) {
  const base = layoutBaseConfig(config);
  const defaultLayout = config?.layouts?.default;
  if (defaultLayout && typeof defaultLayout === "object") {
    return { ...base, ...defaultLayout };
  }
  return base;
}
function layoutConfigForActivity(config, activityId) {
  const base = layoutDefaultConfig(config);
  const layouts = config?.layouts;
  if (!layouts || typeof layouts !== "object" || activityId == null) {
    return base;
  }
  const key = String(activityId);
  const override = layouts[key] ?? (Number.isFinite(Number(activityId)) ? layouts[Number(activityId)] : null);
  if (override && typeof override === "object") {
    return { ...base, ...override };
  }
  return base;
}
function macrosButtonEnabled(layout) {
  if (typeof layout?.show_macros_button === "boolean") {
    return layout.show_macros_button;
  }
  return true;
}
function favoritesButtonEnabled(layout) {
  if (typeof layout?.show_favorites_button === "boolean") {
    return layout.show_favorites_button;
  }
  return true;
}
function volumeGroupEnabled(layout) {
  if (typeof layout?.show_volume === "boolean") return layout.show_volume;
  if (typeof layout?.show_mid === "boolean") return layout.show_mid;
  return true;
}
function channelGroupEnabled(layout) {
  if (typeof layout?.show_channel === "boolean") return layout.show_channel;
  if (typeof layout?.show_mid === "boolean") return layout.show_mid;
  return true;
}
function mediaGroupEnabled(layout) {
  if (typeof layout?.show_media === "boolean") return layout.show_media;
  return true;
}
function dvrGroupEnabled(layout) {
  if (typeof layout?.show_dvr === "boolean") return layout.show_dvr;
  return true;
}
function normalizedGroupOrder(configured) {
  const source = Array.isArray(configured) ? configured : DEFAULT_GROUP_ORDER;
  const order = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of source) {
    const key = String(entry ?? "").trim();
    if (!DEFAULT_GROUP_ORDER_SET.has(key) || seen.has(key)) continue;
    order.push(key);
    seen.add(key);
  }
  for (const key of DEFAULT_GROUP_ORDER) {
    if (!seen.has(key)) order.push(key);
  }
  return order;
}
var GROUP_LABELS = {
  activity: "Activity Selector",
  macro_favorites: "Macros/Favorites",
  dpad: "Direction Pad",
  nav: "Back/Home/Menu",
  mid: "Volume/Channel",
  media: "Media Controls",
  colors: "Color Buttons",
  abc: "A/B/C"
};
var GROUP_VISIBILITY_KEYS = {
  activity: "show_activity",
  dpad: "show_dpad",
  nav: "show_nav",
  mid: "show_mid",
  media: "show_media",
  colors: "show_colors",
  abc: "show_abc"
};
var ID = {
  UP: 174,
  DOWN: 178,
  LEFT: 175,
  RIGHT: 177,
  OK: 176,
  BACK: 179,
  HOME: 180,
  MENU: 181,
  VOL_UP: 182,
  VOL_DOWN: 185,
  MUTE: 184,
  CH_UP: 183,
  CH_DOWN: 186,
  GUIDE: 157,
  DVR: 155,
  PLAY: 156,
  EXIT: 154,
  A: 153,
  B: 152,
  C: 151,
  REW: 187,
  PAUSE: 188,
  FWD: 189,
  RED: 190,
  GREEN: 191,
  YELLOW: 192,
  BLUE: 193
};
var POWERED_OFF_LABELS = /* @__PURE__ */ new Set(["powered off", "powered_off", "off"]);
var DEFAULT_KEY_LABELS = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  ok: "OK",
  back: "Back",
  home: "Home",
  menu: "Menu",
  volup: "Vol +",
  voldn: "Vol -",
  mute: "Mute",
  chup: "Ch +",
  chdn: "Ch -",
  guide: "Guide",
  dvr: "DVR",
  play: "Play",
  exit: "Exit",
  rew: "Rewind",
  pause: "Pause",
  fwd: "Fast Forward",
  red: "Red",
  green: "Green",
  yellow: "Yellow",
  blue: "Blue",
  a: "A",
  b: "B",
  c: "C"
};
var HARD_BUTTON_ID_MAP = {
  up: ID.UP,
  down: ID.DOWN,
  left: ID.LEFT,
  right: ID.RIGHT,
  ok: ID.OK,
  back: ID.BACK,
  home: ID.HOME,
  menu: ID.MENU,
  volup: ID.VOL_UP,
  voldn: ID.VOL_DOWN,
  mute: ID.MUTE,
  chup: ID.CH_UP,
  chdn: ID.CH_DOWN,
  guide: ID.GUIDE,
  dvr: ID.DVR,
  play: ID.PLAY,
  exit: ID.EXIT,
  rew: ID.REW,
  pause: ID.PAUSE,
  fwd: ID.FWD,
  red: ID.RED,
  green: ID.GREEN,
  yellow: ID.YELLOW,
  blue: ID.BLUE,
  a: ID.A,
  b: ID.B,
  c: ID.C
};
var X2_ONLY_HARD_BUTTON_IDS = /* @__PURE__ */ new Set([
  ID.C,
  ID.B,
  ID.A,
  ID.EXIT,
  ID.DVR,
  ID.PLAY,
  ID.GUIDE
]);

// custom_components/sofabaton_x1s/www/src/remote-card-editor-helpers.ts
function normalizeCustomFavorite(item, idx = 0) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name ?? item.label ?? "").trim();
  if (!name) return null;
  const icon = item.icon != null && String(item.icon).trim() ? String(item.icon).trim() : null;
  const action = item.action && typeof item.action === "object" ? item.action : item.tap_action && typeof item.tap_action === "object" ? item.tap_action : null;
  const rawCmd = item.command_id ?? item.key_id ?? item.command ?? item.key ?? item.id ?? null;
  const rawDev = item.device_id ?? item.activity_id ?? item.device ?? item.activity ?? null;
  const cmd = rawCmd != null ? Number(rawCmd) : null;
  const dev = rawDev != null ? Number(rawDev) : null;
  const hasIds = Number.isFinite(cmd) && (rawDev == null || Number.isFinite(dev));
  const hasAction = !!(action && (action.action || action.service || action.perform_action || action.navigation_path || action.url_path));
  if (!hasIds && !hasAction) return null;
  return {
    __custom: true,
    name,
    icon,
    action: hasAction ? action : null,
    command_id: Number.isFinite(cmd) ? cmd : null,
    device_id: Number.isFinite(dev) ? dev : null,
    _idx: idx,
    _raw: item
  };
}
function customFavoritesSignature(items) {
  const list = Array.isArray(items) ? items : [];
  const parts = list.map((it) => {
    const n = String(it?.name ?? "");
    const ic = String(it?.icon ?? "");
    const cmd = String(it?.command_id ?? "");
    const dev = String(it?.device_id ?? "");
    let act = "";
    try {
      act = it?.action ? JSON.stringify(it.action) : "";
    } catch (e) {
      act = "[unserializable]";
    }
    return `${n}|${ic}|${cmd}|${dev}|${act}`;
  });
  return `${parts.length}:${parts.join(";;")}`;
}

// custom_components/sofabaton_x1s/www/src/remote-card-editor-layout.ts
function layoutHasCustomOverride(config, selection) {
  const layouts = config?.layouts;
  if (!layouts || typeof layouts !== "object") return false;
  const key = String(selection ?? "");
  const override = layouts[key] ?? (Number.isFinite(Number(selection)) ? layouts[Number(selection)] : null);
  return Boolean(override && typeof override === "object");
}
function layoutSelectionNote(config, selection) {
  if (selection === "default") {
    return "Used for Activities without their own layout";
  }
  return layoutHasCustomOverride(config, selection) ? "Using custom layout" : "Using default layout";
}
function editorActivitiesFromState(state) {
  const list = state?.attributes?.activities;
  if (!Array.isArray(list)) return [];
  return list.map((activity) => ({
    id: Number(activity?.id),
    name: String(activity?.name ?? "")
  })).filter((activity) => Number.isFinite(activity.id) && activity.name);
}
function layoutConfigForSelection(config, selection) {
  if (selection === "default") {
    return layoutDefaultConfig(config);
  }
  return layoutConfigForActivity(config, selection);
}
function applyLayoutConfigPatch(config, selection, patch) {
  const next = { ...config || {} };
  if (selection === "default") {
    const defaultLayout = next.layouts?.default;
    if (defaultLayout && typeof defaultLayout === "object") {
      next.layouts = {
        ...next.layouts || {},
        default: { ...defaultLayout, ...patch }
      };
      return { nextConfig: next, syncFormPatch: null };
    }
    Object.assign(next, patch);
    return { nextConfig: next, syncFormPatch: patch };
  }
  const layouts = { ...next.layouts || {} };
  const existing = layouts[selection] && typeof layouts[selection] === "object" ? layouts[selection] : {};
  layouts[selection] = { ...existing, ...patch };
  next.layouts = layouts;
  return { nextConfig: next, syncFormPatch: null };
}
function groupOrderListForEditor(config, selection) {
  const layout = layoutConfigForSelection(config, selection);
  return normalizedGroupOrder(layout?.group_order);
}
function groupLabel(key) {
  return GROUP_LABELS[key] || key;
}
function isGroupEnabled(config, selection, key) {
  const prop = GROUP_VISIBILITY_KEYS[key];
  if (!prop) return true;
  const layout = layoutConfigForSelection(config, selection);
  return layout?.[prop] ?? true;
}
function macroEnabled(config, selection) {
  return macrosButtonEnabled(layoutConfigForSelection(config, selection));
}
function favoritesEnabled(config, selection) {
  return favoritesButtonEnabled(layoutConfigForSelection(config, selection));
}
function volumeEnabled(config, selection) {
  return volumeGroupEnabled(layoutConfigForSelection(config, selection));
}
function channelEnabled(config, selection) {
  return channelGroupEnabled(layoutConfigForSelection(config, selection));
}
function mediaEnabled(config, selection) {
  return mediaGroupEnabled(layoutConfigForSelection(config, selection));
}
function dvrEnabled(config, selection) {
  return dvrGroupEnabled(layoutConfigForSelection(config, selection));
}
function macroTogglePatch(config, selection, enabled) {
  return {
    show_macros_button: !!enabled,
    show_favorites_button: !!favoritesEnabled(config, selection)
  };
}
function favoritesTogglePatch(config, selection, enabled) {
  return {
    show_macros_button: !!macroEnabled(config, selection),
    show_favorites_button: !!enabled
  };
}
function volumeTogglePatch(config, selection, enabled) {
  const channel = channelEnabled(config, selection);
  return {
    show_volume: !!enabled,
    show_mid: !!enabled || !!channel
  };
}
function channelTogglePatch(config, selection, enabled) {
  const volume = volumeEnabled(config, selection);
  return {
    show_channel: !!enabled,
    show_mid: !!enabled || !!volume
  };
}
function dvrTogglePatch(enabled) {
  return {
    show_dvr: !!enabled
  };
}
function groupEnabledPatch(key, enabled) {
  const prop = GROUP_VISIBILITY_KEYS[key];
  return prop ? { [prop]: !!enabled } : null;
}

// custom_components/sofabaton_x1s/www/src/remote-card-state.ts
function hasOwn(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}
function currentActivityIdFromRemote(remoteState) {
  const activityId = remoteState?.attributes?.current_activity_id;
  if (activityId != null) return Number(activityId);
  return null;
}
function normalizeActivities(source) {
  return (Array.isArray(source) ? source : []).map((activity) => ({
    id: Number(activity?.id),
    name: String(activity?.name ?? ""),
    state: String(activity?.state ?? "")
  })).filter((activity) => Number.isFinite(activity.id) && activity.name);
}
function activitiesFromRemote(remoteState, isHubIntegration, hubActivitiesCache) {
  const list = remoteState?.attributes?.activities;
  const source = Array.isArray(list) && list.length ? list : isHubIntegration && Array.isArray(hubActivitiesCache) ? hubActivitiesCache : [];
  return {
    activities: normalizeActivities(source),
    nextHubActivitiesCache: isHubIntegration && Array.isArray(list) && list.length ? list : hubActivitiesCache
  };
}
function activityNameForId(activities, activityId) {
  if (activityId == null) return "";
  const id = Number(activityId);
  if (!Number.isFinite(id)) return "";
  const match = Array.isArray(activities) ? activities.find((activity) => activity.id === id) : null;
  return match?.name || "";
}
function currentActivityLabelFromRemote(remoteState, activities) {
  const remoteActivity = remoteState?.attributes?.current_activity;
  if (remoteActivity) return String(remoteActivity);
  const activityId = currentActivityIdFromRemote(remoteState);
  return activityNameForId(activities, activityId);
}
function previewSelection(editMode, previewActivity, activities) {
  if (!editMode) return null;
  const selection = previewActivity;
  if (selection == null || selection === "") {
    return {
      activityId: null,
      label: "Default Layout",
      poweredOff: false
    };
  }
  if (selection === "powered_off") {
    return {
      activityId: null,
      label: "Powered Off",
      poweredOff: true
    };
  }
  const id = Number(selection);
  if (!Number.isFinite(id)) return null;
  return {
    activityId: id,
    label: activityNameForId(activities, id),
    poweredOff: false
  };
}
function isPoweredOffLabel(state) {
  const s = String(state || "").trim().toLowerCase();
  return POWERED_OFF_LABELS.has(s);
}
function isActivityOn(activityId, activities, currentActivityLabel) {
  if (activityId == null) return false;
  const id = Number(activityId);
  if (!Number.isFinite(id)) return false;
  const match = Array.isArray(activities) ? activities.find((activity) => Number(activity?.id) === id) : null;
  if (match && match.state != null && String(match.state).trim() !== "") {
    const s = String(match.state).trim().toLowerCase();
    return !isPoweredOffLabel(s) && s !== "off";
  }
  return Boolean(currentActivityLabel) && !isPoweredOffLabel(currentActivityLabel);
}
function optionsSignature(options) {
  const names = Array.isArray(options) ? options.map((opt) => String(opt ?? "")) : [];
  return `${names.length}:${names.join(",")}`;
}
function drawerItemsSignature(items) {
  const entries = Array.isArray(items) ? items.map((item) => {
    const commandId = String(item?.command_id ?? item?.id ?? "");
    const deviceId = String(item?.device_id ?? item?.device ?? "");
    const name = String(item?.name ?? "");
    return `${commandId}:${deviceId}:${name}`;
  }) : [];
  return `${entries.length}:${entries.join(",")}`;
}
function enabledButtonsSignature(raw) {
  if (!Array.isArray(raw)) return String(raw ?? "");
  return `${raw.length}:${raw.map((entry) => String(entry ?? "")).join(",")}`;
}
function resolveHubActivityData({
  isHubIntegration,
  activityId,
  assignedKeys,
  macroKeys,
  favoriteKeys,
  hubAssignedKeysCache,
  hubMacrosCache,
  hubFavoritesCache
}) {
  const nextAssignedCache = { ...hubAssignedKeysCache || {} };
  const nextMacrosCache = { ...hubMacrosCache || {} };
  const nextFavoritesCache = { ...hubFavoritesCache || {} };
  const actKey = activityId != null ? String(activityId) : null;
  const assignedMap = assignedKeys && typeof assignedKeys === "object" ? assignedKeys : null;
  const macroMap = macroKeys && typeof macroKeys === "object" ? macroKeys : null;
  const favoriteMap = favoriteKeys && typeof favoriteKeys === "object" ? favoriteKeys : null;
  if (isHubIntegration && actKey != null) {
    if (assignedMap && (hasOwn(assignedMap, actKey) || hasOwn(assignedMap, activityId))) {
      const v = assignedMap[actKey] ?? assignedMap[activityId];
      nextAssignedCache[actKey] = Array.isArray(v) ? v : [];
    }
    if (macroMap && (hasOwn(macroMap, actKey) || hasOwn(macroMap, activityId))) {
      const v = macroMap[actKey] ?? macroMap[activityId];
      nextMacrosCache[actKey] = Array.isArray(v) ? v : [];
    }
    if (favoriteMap && (hasOwn(favoriteMap, actKey) || hasOwn(favoriteMap, activityId))) {
      const v = favoriteMap[actKey] ?? favoriteMap[activityId];
      nextFavoritesCache[actKey] = Array.isArray(v) ? v : [];
    }
  }
  const macros = macroMap && actKey != null && (hasOwn(macroMap, actKey) || hasOwn(macroMap, activityId)) ? macroMap[actKey] ?? macroMap[activityId] ?? [] : isHubIntegration && actKey != null ? nextMacrosCache[actKey] ?? [] : [];
  const favorites = favoriteMap && actKey != null && (hasOwn(favoriteMap, actKey) || hasOwn(favoriteMap, activityId)) ? favoriteMap[actKey] ?? favoriteMap[activityId] ?? [] : isHubIntegration && actKey != null ? nextFavoritesCache[actKey] ?? [] : [];
  const rawAssignedKeys = assignedMap && actKey != null && (hasOwn(assignedMap, actKey) || hasOwn(assignedMap, activityId)) ? assignedMap[actKey] ?? assignedMap[activityId] ?? null : isHubIntegration && actKey != null ? nextAssignedCache[actKey] ?? null : null;
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
    rawAssignedKeys
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-runtime-display.ts
function midModeState({
  showVolume,
  showChannel,
  isX2
}) {
  const midMode = showVolume && showChannel ? "dual" : showVolume ? "volume" : showChannel ? "channel" : "off";
  return {
    midMode,
    classMap: {
      "mid--dual": midMode === "dual",
      "mid--volume": midMode === "volume",
      "mid--channel": midMode === "channel",
      "mid--x2": isX2,
      "mid--x1": !isX2
    }
  };
}
function mediaModeState({
  isX2,
  showMedia,
  showDvr
}) {
  const mediaMode = isX2 ? showMedia && showDvr ? "both" : showMedia ? "play" : showDvr ? "dvr" : "off" : showMedia || showDvr ? "play" : "off";
  return {
    mediaMode,
    classMap: {
      "media--play": mediaMode === "play",
      "media--dvr": mediaMode === "dvr",
      "media--both": mediaMode === "both",
      "media--x2": isX2,
      "media--x1": !isX2
    }
  };
}
function runtimeButtonVisibility({
  isX2,
  showVolume,
  showChannel,
  showMedia,
  showDvr
}) {
  const showPause = showDvr || !isX2 && showMedia;
  return {
    volup: showVolume,
    voldn: showVolume,
    mute: showVolume,
    guide: isX2 && showChannel,
    chup: showChannel,
    chdn: showChannel,
    rew: showMedia,
    play: showMedia && isX2,
    fwd: showMedia,
    dvr: isX2 && showDvr,
    pause: showPause,
    exit: isX2 && showDvr
  };
}
function macroFavoriteDisplayState({
  editMode,
  showMacrosButton,
  showFavoritesButton,
  macros,
  favorites,
  customFavorites,
  disableAllButtons
}) {
  const showMF = showMacrosButton || showFavoritesButton;
  const visibleCount = (showMacrosButton ? 1 : 0) + (showFavoritesButton ? 1 : 0);
  const macrosEnabled = editMode ? true : macros.length > 0;
  const favoritesEnabled2 = editMode ? true : favorites.length + customFavorites.length > 0;
  return {
    showMF,
    visibleCount,
    macrosDisabled: disableAllButtons || !macrosEnabled,
    favoritesDisabled: disableAllButtons || !favoritesEnabled2
  };
}
function combinedFavoritesSignature(customFavoritesSig, favoritesSig) {
  return `${customFavoritesSig}||${favoritesSig}`;
}

// custom_components/sofabaton_x1s/www/src/remote-card-actions.ts
function hubAssignedKeyCommand(activityId, commandId) {
  const activity = Number(activityId);
  const key = Number(commandId);
  if (!Number.isFinite(activity) || !Number.isFinite(key)) return null;
  return [
    "type:send_assigned_key",
    `activity_id:${activity}`,
    `key_id:${key}`
  ];
}
function hubMacroKeyCommand(activityId, commandId) {
  const activity = Number(activityId);
  const key = Number(commandId);
  if (!Number.isFinite(activity) || !Number.isFinite(key)) return null;
  return [
    "type:send_macro_key",
    `activity_id:${activity}`,
    `key_id:${key}`
  ];
}
function hubFavoriteKeyCommand(deviceId, commandId) {
  const device = Number(deviceId);
  const key = Number(commandId);
  if (!Number.isFinite(device) || !Number.isFinite(key)) return null;
  return [
    "type:send_favorite_key",
    `device_id:${device}`,
    `key_id:${key}`
  ];
}
function remoteSendCommandData(entityId, commandId, deviceId) {
  const command = Number(commandId);
  const device = Number(deviceId);
  if (!entityId || !Number.isFinite(command) || !Number.isFinite(device)) return null;
  return {
    entity_id: entityId,
    command,
    device
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-render-models.ts
function drawerCommandType(type) {
  if (type === "macros") return "macro";
  if (type === "favorites") return "favorite";
  return "assigned";
}
function drawerButtonModel(item, type, fallbackDeviceId) {
  return {
    label: item?.name || "Unknown",
    commandId: Number(item?.command_id ?? item?.id),
    deviceId: Number(item?.device_id ?? item?.device ?? fallbackDeviceId),
    icon: item?.icon ? String(item.icon) : null,
    commandType: drawerCommandType(type)
  };
}
function customFavoriteButtonModel(favorite, fallbackDeviceId) {
  const commandId = Number(favorite?.command_id);
  const explicitDeviceId = favorite?.device_id != null ? Number(favorite.device_id) : null;
  const deviceId = explicitDeviceId != null ? explicitDeviceId : Number(fallbackDeviceId);
  return {
    label: String(favorite?.name ?? "Favorite"),
    icon: favorite?.icon ? String(favorite.icon) : null,
    action: favorite?.action ?? null,
    commandId,
    deviceId
  };
}
function actionButtonModel({
  label,
  icon,
  extraClass = ""
}) {
  return {
    wrapClassName: `macroFavoritesButton ${extraClass}`.trim(),
    buttonConfig: {
      type: "button",
      show_name: true,
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || void 0,
      tap_action: {
        action: "none"
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" }
    }
  };
}
function huiButtonModel({
  label,
  icon,
  extraClass = "",
  size = "normal"
}) {
  return {
    wrapClassName: `key key--${size} ${extraClass}`.trim(),
    buttonConfig: {
      type: "button",
      show_name: Boolean(label),
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || void 0,
      tap_action: {
        action: "none"
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" }
    }
  };
}
function colorKeyModel(color) {
  return {
    wrapClassName: "key key--color",
    color,
    buttonConfig: {
      type: "button",
      show_name: false,
      show_icon: false,
      tap_action: {
        action: "none"
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" }
    }
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-drawer-row.ts
function buildMacroFavoritesSection({
  createActionButton,
  onMacrosClick,
  onFavoritesClick
}) {
  const container = document.createElement("div");
  container.className = "mf-container";
  const row = document.createElement("div");
  row.className = "macroFavorites";
  const grid = document.createElement("div");
  grid.className = "macroFavoritesGrid";
  const macrosButton = createActionButton({
    label: "Macros >",
    onClick: onMacrosClick
  });
  const favoritesButton = createActionButton({
    label: "Favorites >",
    onClick: onFavoritesClick
  });
  grid.appendChild(macrosButton.wrap);
  grid.appendChild(favoritesButton.wrap);
  row.appendChild(grid);
  container.appendChild(row);
  const macrosOverlayEl = document.createElement("div");
  macrosOverlayEl.className = "mf-overlay mf-overlay--macros";
  const macrosOverlayGrid = document.createElement("div");
  macrosOverlayGrid.className = "mf-grid";
  macrosOverlayEl.appendChild(macrosOverlayGrid);
  container.appendChild(macrosOverlayEl);
  const favoritesOverlayEl = document.createElement("div");
  favoritesOverlayEl.className = "mf-overlay mf-overlay--favorites";
  const favoritesOverlayGrid = document.createElement("div");
  favoritesOverlayGrid.className = "mf-grid";
  favoritesOverlayEl.appendChild(favoritesOverlayGrid);
  container.appendChild(favoritesOverlayEl);
  return {
    container,
    row,
    grid,
    macrosButtonWrap: macrosButton.wrap,
    macrosButton: macrosButton.btn,
    favoritesButtonWrap: favoritesButton.wrap,
    favoritesButton: favoritesButton.btn,
    macrosOverlayEl,
    macrosOverlayGrid,
    favoritesOverlayEl,
    favoritesOverlayGrid
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-activity-row.ts
function buildActivityRow({
  onSelect,
  onMenuOpened,
  onMenuClosed,
  openEvents,
  closeEvents
}) {
  const row = document.createElement("div");
  row.className = "activityRow";
  const select = document.createElement("ha-select");
  select.label = "Activity";
  select.classList.add("sb-activity-select");
  select.addEventListener("selected", onSelect);
  select.addEventListener("change", onSelect);
  openEvents.forEach((eventName) => {
    select.addEventListener(eventName, onMenuOpened, true);
  });
  closeEvents.forEach((eventName) => {
    select.addEventListener(eventName, onMenuClosed, true);
  });
  select.addEventListener("change", onMenuClosed, true);
  select.addEventListener("blur", onMenuClosed, true);
  row.appendChild(select);
  const loadIndicator = document.createElement("div");
  loadIndicator.className = "loadIndicator";
  row.appendChild(loadIndicator);
  return {
    row,
    select,
    loadIndicator
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-activity-state.ts
function buildActivitySelectState({
  editMode,
  preview,
  activities,
  currentActivityLabel,
  pendingActivity,
  pendingExpired
}) {
  const options = [
    ...editMode ? ["Default Layout"] : [],
    "Powered Off",
    ...activities.map((activity) => activity.name)
  ];
  const previewLabel = preview ? preview.poweredOff ? "Powered Off" : preview.label || `Activity ${preview.activityId}` : null;
  if (previewLabel && !options.includes(previewLabel)) {
    options.push(previewLabel);
  }
  const current = previewLabel || currentActivityLabel || "Powered Off";
  const poweredOff = preview ? preview.poweredOff : isPoweredOffLabel(current);
  const resolvedValue = pendingActivity && !pendingExpired && pendingActivity !== current ? pendingActivity : current;
  const disabled = editMode || (preview ? true : options.length <= 1);
  return {
    options,
    previewLabel,
    current,
    poweredOff,
    resolvedValue,
    disabled,
    clearPending: Boolean(pendingActivity && (pendingExpired || current === pendingActivity))
  };
}
function noActivitiesWarning(isUnavailable, activitiesLength, loadState) {
  if (!isUnavailable && activitiesLength === 0 && loadState !== "loading") {
    return "No activities found in remote attributes.";
  }
  return "";
}

// custom_components/sofabaton_x1s/www/src/remote-card-drawer-display.ts
function drawerVisibilityState({
  activeDrawer,
  showMacrosButton,
  showFavoritesButton,
  editMode,
  macros,
  favorites,
  customFavorites,
  disableAllButtons
}) {
  const display = macroFavoriteDisplayState({
    editMode,
    showMacrosButton,
    showFavoritesButton,
    macros,
    favorites,
    customFavorites,
    disableAllButtons
  });
  let nextActiveDrawer = activeDrawer;
  if (!display.showMF && nextActiveDrawer) nextActiveDrawer = null;
  if (nextActiveDrawer === "macros" && !showMacrosButton) nextActiveDrawer = null;
  if (nextActiveDrawer === "favorites" && !showFavoritesButton) nextActiveDrawer = null;
  return {
    ...display,
    nextActiveDrawer,
    closedByVisibility: Boolean(activeDrawer && !nextActiveDrawer)
  };
}
function drawerRefreshState({
  macroDataSig,
  macroSig,
  customFavoritesSig,
  favoritesSig,
  favoritesDataSig
}) {
  const nextFavoritesSig = combinedFavoritesSignature(
    customFavoritesSig,
    favoritesSig
  );
  return {
    refreshMacros: macroDataSig !== macroSig,
    nextMacroSig: macroSig,
    refreshFavorites: favoritesDataSig !== nextFavoritesSig,
    nextFavoritesSig
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-drawer-buttons.ts
function buildDrawerButtonElement({
  model,
  rawItem,
  itemType,
  attachPrimaryAction,
  onTrigger
}) {
  const card = document.createElement("ha-card");
  card.classList.add("drawer-btn");
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  const inner = document.createElement("div");
  inner.className = "drawer-btn__inner drawer-btn__inner--stack";
  if (model.icon) {
    const ic = document.createElement("ha-icon");
    ic.className = "drawer-btn__icon";
    ic.setAttribute("icon", model.icon);
    inner.appendChild(ic);
  }
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = model.label;
  inner.appendChild(name);
  card.appendChild(inner);
  attachPrimaryAction(card, () => {
    if (!Number.isFinite(model.commandId) || !Number.isFinite(model.deviceId)) return;
    onTrigger({ model, itemType, rawItem });
  });
  return card;
}
function buildCustomFavoriteButtonElement({
  model,
  rawFavorite,
  attachPrimaryAction,
  onTrigger
}) {
  const card = document.createElement("ha-card");
  card.classList.add("drawer-btn", "drawer-btn--custom");
  card.setAttribute("role", "button");
  card.tabIndex = 0;
  card.style.gridColumn = "1 / -1";
  const inner = document.createElement("div");
  inner.className = "drawer-btn__inner drawer-btn__inner--row";
  if (model.icon) {
    const ic = document.createElement("ha-icon");
    ic.className = "drawer-btn__icon";
    ic.setAttribute("icon", model.icon);
    inner.appendChild(ic);
  }
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = model.label;
  inner.appendChild(name);
  card.appendChild(inner);
  attachPrimaryAction(card, () => {
    onTrigger({ model, rawFavorite });
  });
  return card;
}

// custom_components/sofabaton_x1s/www/src/remote-card-groups.ts
function buildRemoteGroups({
  createHuiButton,
  createColorKey,
  ids
}) {
  const dpadEl = document.createElement("div");
  dpadEl.className = "dpad";
  dpadEl.appendChild(
    createHuiButton({
      key: "up",
      label: "",
      icon: "mdi:chevron-up",
      id: ids.UP,
      cmd: ids.UP,
      extraClass: "area-up"
    })
  );
  dpadEl.appendChild(
    createHuiButton({
      key: "left",
      label: "",
      icon: "mdi:chevron-left",
      id: ids.LEFT,
      cmd: ids.LEFT,
      extraClass: "area-left"
    })
  );
  dpadEl.appendChild(
    createHuiButton({
      key: "ok",
      label: "OK",
      icon: "",
      id: ids.OK,
      cmd: ids.OK,
      extraClass: "area-ok okKey",
      size: "big"
    })
  );
  dpadEl.appendChild(
    createHuiButton({
      key: "right",
      label: "",
      icon: "mdi:chevron-right",
      id: ids.RIGHT,
      cmd: ids.RIGHT,
      extraClass: "area-right"
    })
  );
  dpadEl.appendChild(
    createHuiButton({
      key: "down",
      label: "",
      icon: "mdi:chevron-down",
      id: ids.DOWN,
      cmd: ids.DOWN,
      extraClass: "area-down"
    })
  );
  const navRowEl = document.createElement("div");
  navRowEl.className = "row3";
  navRowEl.appendChild(
    createHuiButton({
      key: "back",
      label: "",
      icon: "mdi:arrow-u-left-top",
      id: ids.BACK,
      cmd: ids.BACK
    })
  );
  navRowEl.appendChild(
    createHuiButton({
      key: "home",
      label: "",
      icon: "mdi:home",
      id: ids.HOME,
      cmd: ids.HOME
    })
  );
  navRowEl.appendChild(
    createHuiButton({
      key: "menu",
      label: "",
      icon: "mdi:menu",
      id: ids.MENU,
      cmd: ids.MENU
    })
  );
  const midEl = document.createElement("div");
  midEl.className = "mid";
  const midButtons = {
    volup: createHuiButton({
      key: "volup",
      label: "",
      icon: "mdi:volume-plus",
      id: ids.VOL_UP,
      cmd: ids.VOL_UP,
      extraClass: "mid-btn mid-btn-volup"
    }),
    voldn: createHuiButton({
      key: "voldn",
      label: "",
      icon: "mdi:volume-minus",
      id: ids.VOL_DOWN,
      cmd: ids.VOL_DOWN,
      extraClass: "mid-btn mid-btn-voldn"
    }),
    guide: createHuiButton({
      key: "guide",
      label: "Guide",
      icon: "",
      id: ids.GUIDE,
      cmd: ids.GUIDE,
      extraClass: "mid-btn mid-btn-guide"
    }),
    mute: createHuiButton({
      key: "mute",
      label: "",
      icon: "mdi:volume-mute",
      id: ids.MUTE,
      cmd: ids.MUTE,
      extraClass: "mid-btn mid-btn-mute"
    }),
    chup: createHuiButton({
      key: "chup",
      label: "",
      icon: "mdi:chevron-up",
      id: ids.CH_UP,
      cmd: ids.CH_UP,
      extraClass: "mid-btn mid-btn-chup"
    }),
    chdn: createHuiButton({
      key: "chdn",
      label: "",
      icon: "mdi:chevron-down",
      id: ids.CH_DOWN,
      cmd: ids.CH_DOWN,
      extraClass: "mid-btn mid-btn-chdn"
    })
  };
  Object.values(midButtons).forEach((btn) => midEl.appendChild(btn));
  const mediaEl = document.createElement("div");
  mediaEl.className = "media";
  const mediaButtons = {
    rew: createHuiButton({
      key: "rew",
      label: "",
      icon: "mdi:rewind",
      id: ids.REW,
      cmd: ids.REW,
      extraClass: "area-rew"
    }),
    play: createHuiButton({
      key: "play",
      label: "",
      icon: "mdi:play",
      id: ids.PLAY,
      cmd: ids.PLAY,
      extraClass: "area-play"
    }),
    fwd: createHuiButton({
      key: "fwd",
      label: "",
      icon: "mdi:fast-forward",
      id: ids.FWD,
      cmd: ids.FWD,
      extraClass: "area-fwd"
    }),
    dvr: createHuiButton({
      key: "dvr",
      label: "DVR",
      icon: "",
      id: ids.DVR,
      cmd: ids.DVR,
      extraClass: "area-dvr"
    }),
    pause: createHuiButton({
      key: "pause",
      label: "",
      icon: "mdi:pause",
      id: ids.PAUSE,
      cmd: ids.PAUSE,
      extraClass: "area-pause"
    }),
    exit: createHuiButton({
      key: "exit",
      label: "Exit",
      icon: "",
      id: ids.EXIT,
      cmd: ids.EXIT,
      extraClass: "area-exit"
    })
  };
  Object.values(mediaButtons).forEach((btn) => mediaEl.appendChild(btn));
  const colorsEl = document.createElement("div");
  colorsEl.className = "colors";
  const colorsGrid = document.createElement("div");
  colorsGrid.className = "colorsGrid";
  colorsGrid.appendChild(
    createColorKey({
      key: "red",
      id: ids.RED,
      cmd: ids.RED,
      color: "#d32f2f"
    })
  );
  colorsGrid.appendChild(
    createColorKey({
      key: "green",
      id: ids.GREEN,
      cmd: ids.GREEN,
      color: "#388e3c"
    })
  );
  colorsGrid.appendChild(
    createColorKey({
      key: "yellow",
      id: ids.YELLOW,
      cmd: ids.YELLOW,
      color: "#fbc02d"
    })
  );
  colorsGrid.appendChild(
    createColorKey({
      key: "blue",
      id: ids.BLUE,
      cmd: ids.BLUE,
      color: "#1976d2"
    })
  );
  colorsEl.appendChild(colorsGrid);
  const abcEl = document.createElement("div");
  abcEl.className = "abc";
  const abcGrid = document.createElement("div");
  abcGrid.className = "abcGrid";
  abcGrid.appendChild(
    createHuiButton({
      key: "a",
      label: "A",
      icon: "",
      id: ids.A,
      cmd: ids.A,
      size: "small"
    })
  );
  abcGrid.appendChild(
    createHuiButton({
      key: "b",
      label: "B",
      icon: "",
      id: ids.B,
      cmd: ids.B,
      size: "small"
    })
  );
  abcGrid.appendChild(
    createHuiButton({
      key: "c",
      label: "C",
      icon: "",
      id: ids.C,
      cmd: ids.C,
      size: "small"
    })
  );
  abcEl.appendChild(abcGrid);
  return {
    dpadEl,
    navRowEl,
    midEl,
    midButtons,
    mediaEl,
    mediaButtons,
    colorsEl,
    abcEl
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-key-buttons.ts
function buildHuiButtonElement({
  model,
  hass
}) {
  const wrap = document.createElement("div");
  wrap.className = model.wrapClassName;
  const btn = document.createElement("hui-button-card");
  btn.hass = hass;
  btn.setConfig(model.buttonConfig);
  wrap.appendChild(btn);
  return { wrap, btn };
}
function buildColorKeyElement({
  model,
  hass
}) {
  const wrap = document.createElement("div");
  wrap.className = model.wrapClassName;
  wrap.style.setProperty("--sb-color", model.color);
  const btn = document.createElement("hui-button-card");
  btn.hass = hass;
  btn.setConfig(model.buttonConfig);
  wrap.appendChild(btn);
  const bar = document.createElement("div");
  bar.className = "colorBar";
  wrap.appendChild(bar);
  return { wrap, btn };
}

// custom_components/sofabaton_x1s/www/src/remote-card-ui-helpers.ts
function automationAssistLabelForKey(key, label) {
  const trimmed = String(label ?? "").trim();
  if (trimmed) return trimmed;
  const fallback = DEFAULT_KEY_LABELS[String(key ?? "").toLowerCase()];
  if (fallback) return fallback;
  if (!key) return "Button";
  return String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function rgbToCss(rgb) {
  if (Array.isArray(rgb) && rgb.length >= 3) {
    const r = Number(rgb[0]);
    const g = Number(rgb[1]);
    const b = Number(rgb[2]);
    if ([r, g, b].some((n) => Number.isNaN(n))) return "";
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (rgb && typeof rgb === "object" && rgb.r != null && rgb.g != null && rgb.b != null) {
    const r = Number(rgb.r);
    const g = Number(rgb.g);
    const b = Number(rgb.b);
    if ([r, g, b].some((n) => Number.isNaN(n))) return "";
    return `rgb(${r}, ${g}, ${b})`;
  }
  return "";
}

// custom_components/sofabaton_x1s/www/src/remote-card-hub.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function hasOwn2(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}
function initHubRuntimeState(requestSeen, queue) {
  return {
    requestSeen: requestSeen || {},
    queue: Array.isArray(queue) ? queue : []
  };
}
function markHubRequested(requestSeen, key) {
  if (!key) return requestSeen;
  requestSeen[key] = true;
  return requestSeen;
}
function wasHubRequested(requestSeen, key) {
  return Boolean(key && requestSeen[key]);
}
function enqueueHubCommand(queue, list, { priority = false, gapMs = 150 } = {}) {
  const item = { list, gapMs: Number(gapMs) };
  if (priority) {
    queue.unshift(item);
  } else {
    queue.push(item);
  }
  return queue;
}
function throttleHubRequest(cache, key, minIntervalMs = 3e3, now = Date.now()) {
  const last = cache[key] || 0;
  if (now - last < minIntervalMs) return false;
  cache[key] = now;
  return true;
}
function basicDataRequestKey(entityId) {
  return `req:basic:${entityId}`;
}
function requestBasicDataCommand() {
  return ["type:request_basic_data"];
}
function requestAssignedKeysCommand(activityId) {
  if (activityId == null) return null;
  return ["type:request_assigned_keys", `activity_id:${Number(activityId)}`];
}
function requestFavoriteKeysCommand(activityId) {
  if (activityId == null) return null;
  return ["type:request_favorite_keys", `activity_id:${Number(activityId)}`];
}
function requestMacroKeysCommand(activityId) {
  if (activityId == null) return null;
  return ["type:request_macro_keys", `activity_id:${Number(activityId)}`];
}
function startActivityCommand(activityId) {
  if (activityId == null) return null;
  return ["type:start_activity", `activity_id:${Number(activityId)}`];
}
function stopActivityCommand(activityId) {
  if (activityId == null) return null;
  return ["type:stop_activity", `activity_id:${Number(activityId)}`];
}

// custom_components/sofabaton_x1s/www/src/remote-card.ts
var CARD_NAME = "Sofabaton Virtual Remote";
var CARD_VERSION = "0.1.5.9";
var KEY_CAPTURE_HELP_URL = "https://github.com/m3tac0de/sofabaton-virtual-remote/blob/main/docs/keycapture.md";
var LOG_ONCE_KEY = `__${CARD_NAME}_logged__`;
var AUTOMATION_ASSIST_SESSION_KEY = "__sofabatonAutomationAssistSession__";
var PREVIEW_ACTIVITY_CACHE_KEY = "__sofabatonPreviewActivityCache__";
var TYPE = "sofabaton-virtual-remote";
var EDITOR = "sofabaton-virtual-remote-editor";
var readPreviewActivity = (entityId) => {
  if (!entityId || typeof window === "undefined") return null;
  const cache = window[PREVIEW_ACTIVITY_CACHE_KEY];
  if (!cache || typeof cache !== "object") return null;
  return cache[entityId] ?? null;
};
var writePreviewActivity = (entityId, value) => {
  if (!entityId || typeof window === "undefined") return;
  const cache = window[PREVIEW_ACTIVITY_CACHE_KEY] && typeof window[PREVIEW_ACTIVITY_CACHE_KEY] === "object" ? window[PREVIEW_ACTIVITY_CACHE_KEY] : {};
  cache[entityId] = value ?? "";
  window[PREVIEW_ACTIVITY_CACHE_KEY] = cache;
};
function logPillsOnce() {
  if (window[LOG_ONCE_KEY]) return;
  window[LOG_ONCE_KEY] = true;
  const base = "padding:2px 10px;border-radius:999px;font-weight:700;font-size:12px;line-height:18px;";
  const red = base + "background:#ef4444;color:#fff;";
  const green = base + "background:#22c55e;color:#062b12;";
  const yellow = base + "background:#facc15;color:#111827;";
  const blue = base + "background:#3b82f6;color:#fff;";
  const gap = "color:transparent;";
  console.log(
    `%cSofabaton%c %c Virtual %c %c  Remote  %c %c   ${CARD_VERSION}   `,
    red,
    gap,
    green,
    gap,
    yellow,
    gap,
    blue
  );
}
logPillsOnce();
var SofabatonRemoteCard = class extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("Select a Sofabaton remote entity");
    }
    if (Object.prototype.hasOwnProperty.call(config, "preview_activity")) {
      this._previewActivity = config?.preview_activity ?? "";
      writePreviewActivity(config?.entity, this._previewActivity);
    } else if (this._previewActivity == null) {
      const cached = readPreviewActivity(config?.entity);
      this._previewActivity = cached ?? "";
    }
    this._config = {
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
      theme: "",
      background_override: null,
      show_automation_assist: false,
      show_macros_button: null,
      show_favorites_button: null,
      custom_favorites: [],
      max_width: 360,
      // Shrink the entire card using CSS `zoom` (0 = no shrink, higher = smaller)
      shrink: 0,
      group_order: DEFAULT_GROUP_ORDER.slice(),
      ...config
    };
    this._activeDrawer = null;
    this._activityMenuOpen = false;
    this._drawerDirection = "down";
    this._drawerResetTimer = null;
    this._lastActivityLabel = null;
    this._lastActivityId = null;
    this._lastPoweredOff = null;
    this._initPromise = this._initPromise || this._ensureHaElements();
    this._initPromise.then(() => {
      this._render();
      this._update();
    });
  }
  set hass(hass) {
    this._hass = hass;
    (this._initPromise || Promise.resolve()).then(async () => {
      await this._ensureIntegration();
      this._update();
    });
  }
  set editMode(value) {
    this._editMode = !!value;
    if (this._editMode && this._automationAssistActive) {
      this._setAutomationAssistActive(false);
    }
    this._update();
    this._updateAutomationAssistUI();
  }
  // ---------- State helpers ----------
  _remoteState() {
    return this._hass?.states?.[this._config?.entity];
  }
  // ---------- Integration detection (x1s vs hub) ----------
  async _ensureIntegration() {
    if (!this._hass?.callWS || !this._config?.entity) return;
    const entityId = String(this._config.entity);
    if (this._integrationEntityId && this._integrationEntityId !== entityId) {
      this._hubRequestCache = null;
      this._hubRequestSeen = null;
      this._hubQueue = null;
      this._hubQueueBusy = false;
      this._hubActivitiesCache = null;
      this._hubAssignedKeysCache = null;
      this._hubMacrosCache = null;
      this._hubFavoritesCache = null;
      this._x2LastFetchedActivityId = null;
    }
    if (this._integrationEntityId === entityId && this._integrationDomain)
      return;
    if (this._integrationDetectingFor === entityId) return;
    this._integrationDetectingFor = entityId;
    try {
      const entry = await this._hass.callWS({
        type: "config/entity_registry/get",
        entity_id: entityId
      });
      this._integrationDomain = String(entry?.platform || "");
      this._integrationEntityId = entityId;
    } catch (e) {
      this._integrationDomain = null;
      this._integrationEntityId = entityId;
    } finally {
      this._integrationDetectingFor = null;
    }
  }
  _isHubIntegration() {
    return String(this._integrationDomain || "") === "sofabaton_hub";
  }
  _showMacrosButton() {
    const layout = layoutConfigForActivity(
      this._config,
      this._effectiveActivityId()
    );
    return macrosButtonEnabled(layout);
  }
  _showFavoritesButton() {
    const layout = layoutConfigForActivity(
      this._config,
      this._effectiveActivityId()
    );
    return favoritesButtonEnabled(layout);
  }
  _volumeEnabled(layout) {
    return volumeGroupEnabled(layout);
  }
  _channelEnabled(layout) {
    return channelGroupEnabled(layout);
  }
  _mediaEnabled(layout) {
    return mediaGroupEnabled(layout);
  }
  _dvrEnabled(layout) {
    return dvrGroupEnabled(layout);
  }
  _automationAssistEnabled() {
    return Boolean(this._config?.show_automation_assist);
  }
  _normalizeHubMac(value) {
    if (!value) return null;
    const normalized = String(value).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    if (!normalized || normalized.length < 6) return null;
    return normalized;
  }
  _automationAssistLabelForKey(key, label) {
    return automationAssistLabelForKey(key, label);
  }
  _customFavorites() {
    const arr = this._config?.custom_favorites;
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const norm = this._normalizeCustomFavorite(arr[i], i);
      if (norm) out.push(norm);
    }
    return out;
  }
  _normalizeCustomFavorite(item, idx = 0) {
    return normalizeCustomFavorite(item, idx);
  }
  _customFavoritesSignature(items) {
    return customFavoritesSignature(items);
  }
  _groupOrderList(activityId = null) {
    const layout = layoutConfigForActivity(
      this._config,
      activityId ?? this._effectiveActivityId()
    );
    return normalizedGroupOrder(layout?.group_order);
  }
  _applyGroupOrder() {
    if (!this._layoutContainer || !this._groupEls) return;
    const order = this._groupOrderList();
    const sig = order.join("|");
    if (sig === this._groupOrderSig) return;
    this._groupOrderSig = sig;
    for (const key of order) {
      const el = this._groupEls[key];
      if (el) this._layoutContainer.appendChild(el);
    }
    if (this._warn) {
      this._layoutContainer.appendChild(this._warn);
    }
  }
  _layoutSignature(activityId, layoutConfig) {
    const order = this._groupOrderList(activityId);
    const parts = [
      `activity:${activityId ?? "off"}`,
      `order:${order.join(",")}`
    ];
    for (const key of LAYOUT_KEYS) {
      if (key === "group_order") continue;
      parts.push(`${key}:${String(layoutConfig?.[key])}`);
    }
    return parts.join("|");
  }
  _prefersReducedMotion() {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  _clearLayoutOverlay() {
    if (this._layoutOverlayEl) {
      this._layoutOverlayEl.remove();
      this._layoutOverlayEl = null;
    }
  }
  _maybeAnimateLayoutChange(nextSignature) {
    if (!this._layoutContainer || !this._wrap) return;
    if (this._layoutSignatureCache == null) {
      this._layoutSignatureCache = nextSignature;
      return;
    }
    if (this._layoutSignatureCache === nextSignature) return;
    this._layoutSignatureCache = nextSignature;
    if (this._prefersReducedMotion()) {
      this._clearLayoutOverlay();
      return;
    }
    const wrapRect = this._wrap.getBoundingClientRect();
    const layoutRect = this._layoutContainer.getBoundingClientRect();
    if (!wrapRect.width || !layoutRect.width) return;
    this._clearLayoutOverlay();
    const overlay = document.createElement("div");
    overlay.className = "layout-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.top = `${layoutRect.top - wrapRect.top}px`;
    overlay.style.left = `${layoutRect.left - wrapRect.left}px`;
    overlay.style.width = `${layoutRect.width}px`;
    overlay.style.height = `${layoutRect.height}px`;
    overlay.appendChild(this._layoutContainer.cloneNode(true));
    this._wrap.appendChild(overlay);
    this._layoutOverlayEl = overlay;
    const cleanup = () => {
      if (this._layoutOverlayEl === overlay) {
        overlay.remove();
        this._layoutOverlayEl = null;
      }
    };
    overlay.addEventListener(
      "transitionend",
      (ev) => {
        if (ev.target === overlay) cleanup();
      },
      { once: true }
    );
    requestAnimationFrame(() => {
      overlay.classList.add("layout-overlay--fade");
    });
    setTimeout(cleanup, 320);
  }
  // ---------- Hub request queue (prevents parallel requests) ----------
  _hubInitState() {
    const next = initHubRuntimeState(this._hubRequestSeen, this._hubQueue);
    this._hubRequestSeen = next.requestSeen;
    this._hubQueue = next.queue;
  }
  _sleep(ms) {
    return sleep(ms);
  }
  _hasOwn(obj, key) {
    return hasOwn2(obj, key);
  }
  _hubMarkRequested(key) {
    this._hubInitState();
    this._hubRequestSeen = markHubRequested(this._hubRequestSeen, key);
  }
  _hubWasRequested(key) {
    this._hubInitState();
    return wasHubRequested(this._hubRequestSeen, key);
  }
  _hubEnqueueCommand(list, { priority = false, gapMs = 150 } = {}) {
    if (!this._isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;
    this._hubInitState();
    this._hubQueue = enqueueHubCommand(this._hubQueue, list, {
      priority,
      gapMs
    });
    this._hubDrainQueue().catch(() => {
    });
  }
  _hubEnqueueRequest(list, requestKey) {
    if (!this._isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;
    this._hubInitState();
    if (requestKey && this._hubWasRequested(requestKey)) return;
    if (requestKey) this._hubMarkRequested(requestKey);
    this._hubEnqueueCommand(list, { priority: false, gapMs: 3e3 });
  }
  async _hubDrainQueue() {
    if (!this._isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;
    this._hubInitState();
    if (this._hubQueueBusy) return;
    this._hubQueueBusy = true;
    try {
      while (this._hubQueue.length) {
        const next = this._hubQueue.shift();
        if (!next?.list) continue;
        await this._callService("remote", "send_command", {
          entity_id: this._config.entity,
          command: next.list
        });
        const gap = Number.isFinite(Number(next?.gapMs)) ? Number(next.gapMs) : 750;
        await this._sleep(gap);
      }
    } finally {
      this._hubQueueBusy = false;
      this._updateAutomationAssistUI();
      this._syncAutomationAssistMqtt();
    }
  }
  _hubThrottle(key, minIntervalMs = 3e3) {
    this._hubRequestCache = this._hubRequestCache || {};
    return throttleHubRequest(this._hubRequestCache, key, minIntervalMs);
  }
  async _hubSendCommandList(list, throttleKey = null, minIntervalMs = 3e3) {
    if (this._editMode) return;
    if (!this._isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;
    this._hubInitState();
    if (throttleKey) {
      if (!this._hubThrottle(throttleKey, minIntervalMs)) return;
    }
    if (this._hubQueueBusy || Array.isArray(this._hubQueue) && this._hubQueue.length) {
      this._hubEnqueueCommand(list, { priority: true, gapMs: 150 });
      return;
    }
    await this._callService("remote", "send_command", {
      entity_id: this._config.entity,
      command: list
    });
  }
  async _hubRequestBasicData() {
    const entityId = String(this._config?.entity || "");
    this._hubEnqueueRequest(requestBasicDataCommand(), basicDataRequestKey(entityId));
  }
  async _hubRequestAssignedKeys(activityId) {
    const command = requestAssignedKeysCommand(activityId);
    if (!command) return;
    this._hubEnqueueCommand(command, { priority: false, gapMs: 3e3 });
  }
  async _hubRequestFavoriteKeys(activityId) {
    const command = requestFavoriteKeysCommand(activityId);
    if (!command) return;
    this._hubEnqueueCommand(command, { priority: false, gapMs: 3e3 });
  }
  async _hubRequestMacroKeys(activityId) {
    const command = requestMacroKeysCommand(activityId);
    if (!command) return;
    this._hubEnqueueCommand(command, { priority: false, gapMs: 3e3 });
  }
  async _hubStartActivity(activityId) {
    const command = startActivityCommand(activityId);
    if (!command) return;
    await this._hubSendCommandList(command);
  }
  async _hubStopActivity(activityId) {
    const command = stopActivityCommand(activityId);
    if (!command) return;
    await this._hubSendCommandList(command);
  }
  async _sendDrawerItem(itemType, commandId, deviceId, rawItem) {
    if (this._editMode) return;
    if (!this._isHubIntegration()) {
      return this._sendCommand(commandId, deviceId);
    }
    if (!this._hass || !this._config?.entity) return;
    const activityId = Number(deviceId ?? this._currentActivityId());
    const keyId = Number(commandId);
    if (!Number.isFinite(keyId)) return;
    if (itemType === "macros") {
      const command2 = hubMacroKeyCommand(activityId, keyId);
      if (!command2) return;
      return this._hubSendCommandList(command2);
    }
    if (itemType === "favorites") {
      const device = Number(rawItem?.device_id ?? rawItem?.device);
      const command2 = hubFavoriteKeyCommand(device, keyId);
      if (!command2) return;
      return this._hubSendCommandList(command2);
    }
    const command = hubAssignedKeyCommand(activityId, keyId);
    if (!command) return;
    return this._hubSendCommandList(command);
  }
  _hubVersion() {
    return String(
      this._remoteState()?.attributes?.hub_version || ""
    ).toUpperCase();
  }
  _isX2() {
    if (this._isHubIntegration()) return true;
    return this._hubVersion().includes("X2");
  }
  // Returns true for X1S and X2 hubs, which encode button labels as UTF-16-LE
  // and therefore correctly display any Unicode character in the Sofabaton app.
  // X1 hubs encode labels as ASCII (dropping non-ASCII), so umlauts would appear
  // garbled in the app even though routing still works.
  _supportsUnicodeCommandNames() {
    return this._isX2() || this._hubVersion().includes("X1S");
  }
  _enabledButtons() {
    return this._enabledButtonsCache || [];
  }
  _isEnabled(id) {
    const enabled = this._enabledButtons();
    if (this._enabledButtonsInvalid) return true;
    if (!enabled.length) return true;
    return enabled.some((entry) => entry.command === Number(id));
  }
  _commandTarget(id) {
    const enabled = this._enabledButtons();
    const match = enabled.find((entry) => entry.command === Number(id));
    return match || null;
  }
  _currentActivityId() {
    return currentActivityIdFromRemote(this._remoteState());
  }
  _activities() {
    const { activities, nextHubActivitiesCache } = activitiesFromRemote(
      this._remoteState(),
      this._isHubIntegration(),
      this._hubActivitiesCache
    );
    this._hubActivitiesCache = nextHubActivitiesCache;
    return activities;
  }
  _currentActivityLabel() {
    return currentActivityLabelFromRemote(this._remoteState(), this._activities());
  }
  _activityNameForId(activityId) {
    return activityNameForId(this._activities(), activityId);
  }
  _previewSelection(activities = null) {
    return previewSelection(
      this._editMode,
      this._previewActivity,
      Array.isArray(activities) ? activities : this._activities()
    );
  }
  _effectiveActivityId() {
    if (this._previewState) return this._previewState.activityId;
    return this._currentActivityId();
  }
  _isPoweredOffLabel(state) {
    return isPoweredOffLabel(state);
  }
  _isActivityOn(activityId, activities = null) {
    return isActivityOn(
      activityId,
      Array.isArray(activities) ? activities : this._activities(),
      this._currentActivityLabel()
    );
  }
  _isLoadingActive() {
    const isActivityLoading = Boolean(this._activityLoadActive);
    const isPulse = this._commandPulseUntil && Date.now() < this._commandPulseUntil;
    return isActivityLoading || isPulse;
  }
  _resolveCommandDeviceId(commandId, deviceId = null) {
    const resolved = deviceId != null ? Number(deviceId) : this._commandTarget(commandId)?.activity_id ?? this._currentActivityId();
    if (resolved == null || !Number.isFinite(Number(resolved))) return null;
    return Number(resolved);
  }
  _recordAutomationAssistActivityChange({
    activityId,
    activityName,
    poweredOff = false
  }) {
    if (!this._ensureAutomationAssistCaptureStarted()) return;
    const id = Number(activityId);
    const resolvedId = Number.isFinite(id) ? id : null;
    const label = poweredOff ? "Powered Off" : String(activityName || "Activity");
    this._automationAssistCapture = {
      label,
      activityId: resolvedId,
      activityName: poweredOff ? "Powered Off" : String(activityName || label),
      kind: poweredOff ? "power" : "activity"
    };
    this._automationAssistMqttMatch = false;
    this._automationAssistMqttPayload = null;
    this._automationAssistMqttDeviceName = null;
    this._automationAssistMqttCommandName = null;
    this._automationAssistMqttExisting = false;
    this._automationAssistMqttDiscoveryCreated = false;
    this._automationAssistMqttDiscoveryWorking = false;
    this._automationAssistMqttDiscoveryDeviceId = null;
    this._automationAssistStatusMessage = null;
    this._updateAutomationAssistUI();
    this._notifyAutomationAssistCapture();
  }
  _recordAutomationAssistClick({
    label,
    commandId,
    deviceId = null,
    commandType = "assigned",
    icon = null
  }) {
    if (!this._ensureAutomationAssistCaptureStarted()) return;
    const command = Number(commandId);
    if (!Number.isFinite(command)) return;
    const resolvedDevice = commandType === "favorite" || commandType === "macro" ? deviceId != null ? Number(deviceId) : this._currentActivityId() : this._resolveCommandDeviceId(command, deviceId);
    if (resolvedDevice == null || !Number.isFinite(Number(resolvedDevice))) {
      return;
    }
    const activityName = this._activityNameForId(resolvedDevice) || this._currentActivityLabel() || "Unknown";
    this._automationAssistCapture = {
      label: String(label ?? "Button"),
      commandId: command,
      deviceId: Number(resolvedDevice),
      commandType,
      icon: icon ? String(icon) : null,
      activityName,
      kind: "button"
    };
    this._automationAssistMqttMatch = false;
    this._automationAssistMqttPayload = null;
    this._automationAssistMqttDeviceName = null;
    this._automationAssistMqttCommandName = null;
    this._automationAssistMqttExisting = false;
    this._automationAssistMqttDiscoveryCreated = false;
    this._automationAssistMqttDiscoveryWorking = false;
    this._automationAssistMqttDiscoveryDeviceId = null;
    this._automationAssistStatusMessage = null;
    this._updateAutomationAssistUI();
    this._notifyAutomationAssistCapture();
  }
  _automationAssistRemoteYaml() {
    const capture = this._automationAssistCapture;
    if (!capture || !this._config?.entity) return "";
    const entityId = this._config.entity;
    const kind = capture.kind || "button";
    if (kind === "activity") {
      if (this._isHubIntegration()) {
        if (!Number.isFinite(Number(capture.activityId))) return "";
        return [
          "action: remote.send_command",
          "target:",
          `  entity_id: ${entityId}`,
          "data:",
          "  command:",
          "    - type:start_activity",
          `    - activity_id:${capture.activityId}`
        ].join("\n");
      }
      return [
        "action: remote.turn_on",
        "target:",
        `  entity_id: ${entityId}`,
        "data:",
        `  activity: ${capture.activityName}`
      ].join("\n");
    }
    if (kind === "power") {
      if (this._isHubIntegration()) {
        if (!Number.isFinite(Number(capture.activityId))) return "";
        return [
          "action: remote.send_command",
          "target:",
          `  entity_id: ${entityId}`,
          "data:",
          "  command:",
          "    - type:stop_activity",
          `    - activity_id:${capture.activityId}`
        ].join("\n");
      }
      return [
        "action: remote.turn_off",
        "target:",
        `  entity_id: ${entityId}`
      ].join("\n");
    }
    if (this._isHubIntegration()) {
      const payloadType = capture.commandType === "macro" ? "send_macro_key" : capture.commandType === "favorite" ? "send_favorite_key" : "send_assigned_key";
      const deviceKey = capture.commandType === "favorite" ? "device_id" : "activity_id";
      return [
        "action: remote.send_command",
        "target:",
        `  entity_id: ${entityId}`,
        "data:",
        "  command:",
        `    - type:${payloadType}`,
        `    - ${deviceKey}:${capture.deviceId}`,
        `    - key_id:${capture.commandId}`
      ].join("\n");
    }
    return [
      "action: remote.send_command",
      "target:",
      `  entity_id: ${entityId}`,
      "data:",
      `  command: ${capture.commandId}`,
      `  device: ${capture.deviceId}`
    ].join("\n");
  }
  _automationAssistButtonYaml() {
    const capture = this._automationAssistCapture;
    if (!capture || !this._config?.entity) return "";
    const kind = capture.kind || "button";
    const label = capture.label || "Automation Assist";
    const icon = kind === "activity" ? "mdi:television-classic" : kind === "power" ? "mdi:power" : capture.commandType === "favorite" ? "mdi:star" : capture.commandType === "macro" ? "mdi:cogs" : capture.icon || "mdi:remote";
    const serviceYaml = this._automationAssistRemoteYaml().split("\n").map((line) => `  ${line}`).join("\n");
    return [
      "type: button",
      `name: ${label}`,
      `icon: ${icon}`,
      "tap_action:",
      "  action: perform-action",
      "  perform_" + serviceYaml.substring(2),
      "hold_action:",
      "  action: none"
    ].join("\n");
  }
  _automationAssistNotificationBody() {
    const capture = this._automationAssistCapture;
    if (!capture) return "";
    const kind = capture.kind || "button";
    const activityName = capture.activityName || this._activityNameForId(capture.deviceId) || this._currentActivityLabel() || "Unknown";
    const eventLabel = kind === "button" ? `Button: ${capture.label}` : kind === "activity" ? `Activity Change: ${capture.label}` : `Event: ${capture.label}`;
    const buttonYaml = this._automationAssistButtonYaml();
    const remoteYaml = this._automationAssistRemoteYaml();
    return [
      "---",
      "",
      `**Activity: ${activityName} | ${eventLabel}**`,
      "",
      "---",
      "\u{1F4CB} **Lovelace Button Code**",
      "",
      "*Copy this to your Dashboard YAML:*",
      "```yaml",
      buttonYaml,
      "```",
      "\u2699\uFE0F **Service Call (Automation)**",
      "",
      "*Use this in your Scripts or Automations:*",
      "```yaml",
      remoteYaml,
      "```"
    ].join("\n");
  }
  _notifyAutomationAssistCapture() {
    if (!this._automationAssistEnabled()) return;
    if (!this._hass) return;
    const body = this._automationAssistNotificationBody();
    if (!body) return;
    this._hass.callService("persistent_notification", "create", {
      title: "\u{1F6E0}\uFE0F Automation Assist",
      message: body
    });
  }
  _automationAssistMqttSupported() {
    return this._isX2();
  }
  _automationAssistMqttAvailable() {
    return this._automationAssistMqttSupported() && this._automationAssistActive && Boolean(this._hubMac) && !this._automationAssistMqttDiscoveryCreated && !this._automationAssistMqttDiscoveryWorking && this._automationAssistMqttReady();
  }
  _automationAssistMqttReady() {
    if (!this._isHubIntegration()) return true;
    const queue = Array.isArray(this._hubQueue) ? this._hubQueue.length : 0;
    return !this._hubQueueBusy && queue === 0;
  }
  _ensureHubMac() {
    if (!this._hass || !this._config?.entity) return;
    if (this._hubMac || this._hubMacDetecting) return;
    const attrMac = this._normalizeHubMac(
      this._remoteState()?.attributes?.hub_mac
    );
    if (attrMac) {
      this._hubMac = attrMac;
      return;
    }
    if (this._integrationDomain !== "sofabaton_hub") return;
    if (!this._hass?.connection?.subscribeMessage) return;
    this._hubMacDetecting = true;
    const topic = "activity/+/list";
    let timeoutId = null;
    let unsub = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      const unsubscribe = unsub;
      unsub = null;
      this._safeUnsubscribe(unsubscribe);
      this._hubMacDetecting = false;
      this._updateAutomationAssistUI();
      this._syncAutomationAssistMqtt();
    };
    this._hass.connection.subscribeMessage(
      (msg) => {
        const topicMatch = String(msg?.topic || "").match(
          /^activity\/([^/]+)\/list$/
        );
        const normalized = topicMatch?.[1] ? this._normalizeHubMac(topicMatch[1]) : null;
        if (!normalized) return;
        this._hubMac = normalized;
        finish();
      },
      { type: "mqtt/subscribe", topic }
    ).then((unsubscribe) => {
      unsub = unsubscribe;
      this._hubRequestBasicData();
      timeoutId = setTimeout(() => finish(), 4e3);
    }).catch(() => {
      finish();
    });
  }
  _syncAutomationAssistMqtt() {
    if (!this._automationAssistEnabled()) {
      this._unsubscribeAutomationAssistMqtt();
      return;
    }
    if (!this._automationAssistActive) {
      this._unsubscribeAutomationAssistMqtt();
      return;
    }
    if (!this._automationAssistMqttSupported()) {
      this._unsubscribeAutomationAssistMqtt();
      return;
    }
    if (!this._automationAssistMqttReady()) {
      return;
    }
    this._ensureHubMac();
    const mac = this._hubMac;
    if (!mac) return;
    const topic = `${mac}/up`;
    if (this._automationAssistMqttTopic === topic && this._mqttUnsub) return;
    this._unsubscribeAutomationAssistMqtt();
    if (!this._hass?.connection?.subscribeMessage) return;
    this._automationAssistMqttTopic = topic;
    this._hass.connection.subscribeMessage((msg) => this._handleAutomationAssistMqtt(msg), {
      type: "mqtt/subscribe",
      topic
    }).then((unsub) => {
      this._mqttUnsub = unsub;
    }).catch(() => {
      this._mqttUnsub = null;
    });
  }
  _unsubscribeAutomationAssistMqtt() {
    if (this._mqttUnsub) {
      const unsubscribe = this._mqttUnsub;
      this._mqttUnsub = null;
      this._safeUnsubscribe(unsubscribe);
    }
    this._automationAssistMqttTopic = null;
  }
  _parseMqttPayload(payload) {
    if (payload == null) return null;
    if (typeof payload === "object") return payload;
    try {
      return JSON.parse(String(payload));
    } catch (e) {
      return null;
    }
  }
  _automationAssistMqttTriggerExists(payload, topic) {
    return false;
  }
  _automationAssistSessionState() {
    if (!window[AUTOMATION_ASSIST_SESSION_KEY]) {
      window[AUTOMATION_ASSIST_SESSION_KEY] = {
        hideMqttModal: false,
        discoveryDeviceIds: /* @__PURE__ */ new Set(),
        activityTriggersCreated: false
      };
    }
    return window[AUTOMATION_ASSIST_SESSION_KEY];
  }
  _shouldSuppressMqttModal(deviceId) {
    const session = this._automationAssistSessionState();
    if (session.hideMqttModal) return true;
    return session.discoveryDeviceIds.has(deviceId);
  }
  _openAutomationAssistMqttModal(deviceId) {
    if (!this._automationAssistMqttModal) return;
    if (!Number.isFinite(deviceId)) return;
    if (this._shouldSuppressMqttModal(deviceId)) return;
    this._automationAssistMqttModalDeviceId = deviceId;
    this._automationAssistMqttModalOpen = true;
    if (this._automationAssistMqttModalOptOutInput) {
      this._automationAssistMqttModalOptOutInput.checked = false;
    }
    if (this._automationAssistMqttModalActivityInput) {
      this._automationAssistMqttModalActivityInput.checked = false;
    }
    this._updateAutomationAssistModalUI();
  }
  _closeAutomationAssistMqttModal() {
    if (!this._automationAssistMqttModalOpen) return;
    this._automationAssistMqttModalOpen = false;
    this._updateAutomationAssistModalUI();
  }
  _handleAutomationAssistMqtt(msg) {
    const payload = this._parseMqttPayload(msg?.payload);
    if (!payload) return;
    const deviceId = Number(payload.device_id);
    if (Number.isFinite(deviceId) && this._automationAssistMqttDiscoveryDeviceId !== deviceId) {
      this._automationAssistMqttDiscoveryDeviceId = deviceId;
      this._automationAssistMqttDiscoveryCreated = false;
      this._automationAssistMqttDiscoveryWorking = false;
    }
    this._automationAssistMqttMatch = true;
    this._automationAssistMqttPayload = payload;
    this._automationAssistMqttDeviceName = null;
    this._automationAssistMqttCommandName = null;
    this._automationAssistMqttExisting = this._automationAssistMqttTriggerExists(
      payload,
      this._automationAssistMqttTopic
    );
    this._updateAutomationAssistUI();
    this._primeAutomationAssistMqttMetadata(payload);
    this._openAutomationAssistMqttModal(deviceId);
  }
  async _handleAutomationAssistMqttClick() {
    if (!this._automationAssistMqttAvailable()) return;
    const mac = this._hubMac;
    const payload = this._automationAssistMqttPayload;
    if (!mac || !payload) return;
    const deviceId = Number(payload.device_id);
    if (!Number.isFinite(deviceId)) return;
    this._automationAssistMqttDiscoveryWorking = true;
    this._updateAutomationAssistUI();
    try {
      const [deviceName, commands] = await Promise.all([
        this._requestMqttDeviceName(mac, deviceId),
        this._requestMqttDeviceCommands(mac, deviceId)
      ]);
      if (!commands || commands.size === 0) {
        this._setAutomationAssistStatus("No MQTT commands discovered yet");
        return;
      }
      const deviceLabel = deviceName || `Device ${deviceId}`;
      const topic = `${mac}/up`;
      const macLower = String(mac).toLowerCase();
      const macUpper = String(mac).toUpperCase();
      const session = this._automationAssistSessionState();
      const allowActivityTriggers = !session.activityTriggersCreated;
      const includeActivityTriggers = allowActivityTriggers && Boolean(this._automationAssistMqttModalActivityInput?.checked);
      let createdCount = 0;
      let createdActivityCount = 0;
      for (const [keyId, commandName] of commands.entries()) {
        const payloadObj = { device_id: deviceId, key_id: Number(keyId) };
        if (!Number.isFinite(payloadObj.key_id)) continue;
        if (this._automationAssistMqttTriggerExists(payloadObj, topic)) {
          continue;
        }
        const displayCommand = commandName || `Command ${payloadObj.key_id}`;
        const uniqueId = `sofabaton_${macLower}_d${deviceId}_k${payloadObj.key_id}`;
        this._automationAssistDiscoveryIds = this._automationAssistDiscoveryIds || /* @__PURE__ */ new Set();
        if (this._automationAssistDiscoveryIds.has(uniqueId)) continue;
        const subtype = `X2 ${deviceLabel} ${displayCommand}`;
        const config = {
          automation_type: "trigger",
          type: "button_short_press",
          subtype,
          payload: JSON.stringify(payloadObj),
          topic: `${macUpper}/up`,
          device: {
            identifiers: [`sofabaton_x2_remote_${deviceId}`],
            name: `X2 \u2192 ${deviceLabel}`,
            model: "X2",
            manufacturer: "Sofabaton"
          }
        };
        await this._enqueueMqttPublish(async () => {
          await this._callService("mqtt", "publish", {
            topic: `homeassistant/device_automation/${uniqueId}/config`,
            payload: JSON.stringify(config),
            retain: true
          });
          this._automationAssistDiscoveryIds.add(uniqueId);
          await this._sleep(250);
        });
        createdCount += 1;
      }
      if (includeActivityTriggers) {
        const activityTopic = `activity/${macLower}/activity_control_up`;
        const activityDevice = {
          identifiers: ["sofabaton_x2_remote_activities"],
          name: "X2 \u2192 Activities",
          model: "X2",
          manufacturer: "Sofabaton"
        };
        const activities = this._activities();
        const activityEntries = activities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          state: "on"
        }));
        activityEntries.push({
          id: 255,
          name: "Powered Off",
          state: "off"
        });
        for (const activity of activityEntries) {
          const activityId = Number(activity.id);
          if (!Number.isFinite(activityId)) continue;
          const payloadObj = { activity_id: activityId, state: activity.state };
          const uniqueId = `sofabaton_${macLower}_activity_${activityId}`;
          this._automationAssistDiscoveryIds = this._automationAssistDiscoveryIds || /* @__PURE__ */ new Set();
          if (this._automationAssistDiscoveryIds.has(uniqueId)) continue;
          const subtype = `X2 Activity ${activity.name}`;
          const config = {
            automation_type: "trigger",
            type: "button_short_press",
            subtype,
            payload: JSON.stringify(payloadObj),
            topic: activityTopic,
            device: activityDevice
          };
          await this._enqueueMqttPublish(async () => {
            await this._callService("mqtt", "publish", {
              topic: `homeassistant/device_automation/${uniqueId}/config`,
              payload: JSON.stringify(config),
              retain: true
            });
            this._automationAssistDiscoveryIds.add(uniqueId);
            await this._sleep(250);
          });
          createdActivityCount += 1;
        }
        session.activityTriggersCreated = true;
      }
      this._automationAssistMqttDiscoveryCreated = true;
      this._automationAssistMqttDiscoveryDeviceId = deviceId;
      session.discoveryDeviceIds.add(deviceId);
      if (createdCount > 0 || createdActivityCount > 0) {
        const activityNote = includeActivityTriggers && createdActivityCount > 0 && createdCount > 0 ? ` plus ${createdActivityCount} activity triggers` : "";
        const base = createdCount > 0 ? `Created ${createdCount} MQTT discovery triggers for ${deviceLabel}` : `Created ${createdActivityCount} activity triggers for X2 \u2192 Activities`;
        this._setAutomationAssistStatus(`${base}${activityNote}`);
      } else {
        this._setAutomationAssistStatus(
          `All MQTT discovery triggers already exist for ${deviceLabel}`
        );
      }
    } finally {
      this._automationAssistMqttDiscoveryWorking = false;
      this._updateAutomationAssistUI();
    }
  }
  _primeAutomationAssistMqttMetadata(payload) {
    const mac = this._hubMac;
    if (!mac || !payload) return;
    const deviceId = Number(payload.device_id);
    const keyId = Number(payload.key_id);
    if (!Number.isFinite(deviceId) || !Number.isFinite(keyId)) return;
    const lookupId = (this._automationAssistMqttLookupId || 0) + 1;
    this._automationAssistMqttLookupId = lookupId;
    Promise.all([
      this._requestMqttDeviceName(mac, deviceId),
      this._requestMqttDeviceCommandName(mac, deviceId, keyId)
    ]).then(([deviceName, commandName]) => {
      if (this._automationAssistMqttLookupId !== lookupId) return;
      if (deviceName) this._automationAssistMqttDeviceName = deviceName;
      if (commandName) this._automationAssistMqttCommandName = commandName;
      this._updateAutomationAssistUI();
    });
  }
  async _requestMqttDeviceName(mac, deviceId) {
    if (!this._hass?.connection?.subscribeMessage) return null;
    if (!Number.isFinite(deviceId)) return null;
    this._mqttDeviceNames = this._mqttDeviceNames || /* @__PURE__ */ new Map();
    const cacheKey = `${mac}:${deviceId}`;
    if (this._mqttDeviceNames.has(cacheKey)) {
      return this._mqttDeviceNames.get(cacheKey);
    }
    const topic = `device/${mac}/list`;
    const requestTopic = `device/${mac}/list_request`;
    const payload = JSON.stringify({ data: "device_list" });
    return this._enqueueMqttRequest(
      () => new Promise((resolve) => {
        let timeoutId = null;
        let unsub = null;
        const finish = (name) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (unsub) {
            const unsubscribe = unsub;
            unsub = null;
            this._safeUnsubscribe(unsubscribe);
          }
          if (name) {
            this._mqttDeviceNames.set(cacheKey, name);
          }
          resolve(name || null);
        };
        this._hass.connection.subscribeMessage(
          (msg) => {
            const data = this._parseMqttPayload(msg?.payload);
            const devices = Array.isArray(data?.data) ? data.data : [];
            const match = devices.find(
              (device) => Number(device?.device_id) === deviceId
            );
            finish(match?.device_name ? String(match.device_name) : null);
          },
          { type: "mqtt/subscribe", topic }
        ).then((unsubscribe) => {
          unsub = unsubscribe;
          this._callService("mqtt", "publish", {
            topic: requestTopic,
            payload
          });
          timeoutId = setTimeout(() => finish(null), 4e3);
        }).catch(() => finish(null));
      })
    );
  }
  async _requestMqttDeviceCommandName(mac, deviceId, keyId) {
    if (!Number.isFinite(keyId)) return null;
    const commands = await this._requestMqttDeviceCommands(mac, deviceId);
    if (!commands) return null;
    return commands.get(Number(keyId)) || null;
  }
  async _requestMqttDeviceCommands(mac, deviceId) {
    if (!this._hass?.connection?.subscribeMessage) return null;
    if (!Number.isFinite(deviceId)) return null;
    this._mqttDeviceCommands = this._mqttDeviceCommands || /* @__PURE__ */ new Map();
    const cacheKey = `${mac}:${deviceId}`;
    if (this._mqttDeviceCommands.has(cacheKey)) {
      return this._mqttDeviceCommands.get(cacheKey);
    }
    const topic = `device/${mac}/keys_list`;
    const requestTopic = `device/${mac}/keys_request`;
    const payload = JSON.stringify({ data: { device_id: deviceId } });
    return this._enqueueMqttRequest(
      () => new Promise((resolve) => {
        let timeoutId = null;
        let unsub = null;
        const finish = (commands) => {
          if (timeoutId) clearTimeout(timeoutId);
          if (unsub) {
            const unsubscribe = unsub;
            unsub = null;
            this._safeUnsubscribe(unsubscribe);
          }
          if (commands) {
            this._mqttDeviceCommands.set(cacheKey, commands);
          }
          resolve(commands || null);
        };
        this._hass.connection.subscribeMessage(
          (msg) => {
            const data = this._parseMqttPayload(msg?.payload);
            if (Number(data?.device_id) !== deviceId) return;
            const keys = Array.isArray(data?.data) ? data.data : [];
            const commands = /* @__PURE__ */ new Map();
            keys.forEach((entry) => {
              const key = Number(entry?.key_id);
              if (!Number.isFinite(key)) return;
              const name = entry?.key_name ? String(entry.key_name) : null;
              if (name) commands.set(key, name);
            });
            finish(commands);
          },
          { type: "mqtt/subscribe", topic }
        ).then((unsubscribe) => {
          unsub = unsubscribe;
          this._callService("mqtt", "publish", {
            topic: requestTopic,
            payload
          });
          timeoutId = setTimeout(() => finish(null), 4e3);
        }).catch(() => finish(null));
      })
    );
  }
  _enqueueMqttRequest(task) {
    this._mqttRequestQueue = this._mqttRequestQueue || Promise.resolve();
    const run = async () => task();
    this._mqttRequestQueue = this._mqttRequestQueue.then(run, run);
    return this._mqttRequestQueue;
  }
  _enqueueMqttPublish(task) {
    this._mqttPublishQueue = this._mqttPublishQueue || Promise.resolve();
    const run = async () => task();
    this._mqttPublishQueue = this._mqttPublishQueue.then(run, run);
    return this._mqttPublishQueue;
  }
  _automationAssistSlug(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/_+/g, "_") || "command";
  }
  _setAutomationAssistStatus(text) {
    this._automationAssistStatusMessage = String(text ?? "");
    if (!this._automationAssistStatus) return;
    this._automationAssistStatus.textContent = this._automationAssistStatusMessage;
  }
  _safeUnsubscribe(unsubscribe) {
    if (typeof unsubscribe !== "function") return;
    try {
      const maybePromise = unsubscribe();
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {
        });
      }
    } catch (e) {
    }
  }
  _ensureAutomationAssistCaptureStarted() {
    if (!this._automationAssistEnabled()) return false;
    if (this._editMode) return false;
    if (!this._automationAssistActive) {
      this._setAutomationAssistActive(true);
    }
    return this._automationAssistActive;
  }
  _primeAutomationAssistActivityBaseline() {
    const currentLabel = this._currentActivityLabel();
    const currentId = this._currentActivityId();
    this._lastActivityLabel = currentLabel;
    this._lastActivityId = Number.isFinite(Number(currentId)) ? Number(currentId) : null;
    this._lastPoweredOff = this._isPoweredOffLabel(currentLabel);
  }
  _setAutomationAssistActive(active) {
    const next = !!active;
    if (this._automationAssistActive === next) return;
    this._automationAssistActive = next;
    if (!next) {
      this._automationAssistCapture = null;
      this._automationAssistMqttMatch = false;
      this._automationAssistMqttPayload = null;
      this._automationAssistMqttDeviceName = null;
      this._automationAssistMqttCommandName = null;
      this._automationAssistMqttExisting = false;
      this._automationAssistMqttDiscoveryCreated = false;
      this._automationAssistMqttDiscoveryWorking = false;
      this._automationAssistMqttDiscoveryDeviceId = null;
      this._automationAssistStatusMessage = null;
      this._unsubscribeAutomationAssistMqtt();
      this._closeAutomationAssistMqttModal();
    } else {
      this._automationAssistStatusMessage = null;
      this._primeAutomationAssistActivityBaseline();
      this._syncAutomationAssistMqtt();
    }
    this._updateAutomationAssistUI();
  }
  _updateAutomationAssistUI() {
    if (!this._automationAssistLabel || !this._automationAssistStatus) return;
    const capture = this._automationAssistCapture;
    const isActive = this._automationAssistActive;
    const hasCapture = !!capture;
    const mqttSupported = this._automationAssistMqttSupported();
    if (!isActive) {
      this._automationAssistStatus.textContent = this._editMode ? "Exit Edit mode to begin" : "Waiting for keypress";
    } else if (this._automationAssistStatusMessage) {
      this._automationAssistStatus.textContent = this._automationAssistStatusMessage;
    } else if (hasCapture) {
      this._automationAssistStatus.textContent = `Captured: ${capture.label}`;
    } else {
      this._automationAssistStatus.textContent = "Waiting for keypress";
    }
    this._updateAutomationAssistModalUI();
  }
  _updateAutomationAssistModalUI() {
    if (!this._automationAssistMqttModal) return;
    const isActive = this._automationAssistActive;
    const mqttSupported = this._automationAssistMqttSupported();
    const modalOpen = Boolean(this._automationAssistMqttModalOpen);
    this._automationAssistMqttModal.classList.toggle("open", modalOpen);
    if (!modalOpen) return;
    if (this._automationAssistMqttModalActivityRow) {
      const session = this._automationAssistSessionState();
      this._setVisible(
        this._automationAssistMqttModalActivityRow,
        !session.activityTriggersCreated
      );
    }
    const payload = this._automationAssistMqttPayload;
    const deviceId = Number(payload?.device_id);
    const commandId = Number(payload?.key_id);
    const deviceName = this._automationAssistMqttDeviceName || (Number.isFinite(deviceId) ? `Device ${deviceId}` : "Unknown device");
    const commandName = this._automationAssistMqttCommandName || (Number.isFinite(commandId) ? `Command ${commandId}` : null);
    if (this._automationAssistMqttModalText) {
      const lines = [`Detected MQTT device: ${deviceName}.`];
      if (commandName) {
        lines.push(`Last command: ${commandName}.`);
      }
      if (this._automationAssistMqttExisting) {
        lines.push("Existing MQTT automation triggers were found.");
      }
      this._automationAssistMqttModalText.textContent = lines.join(" ");
    }
    if (this._automationAssistMqttModalStart) {
      this._setVisible(this._automationAssistMqttModalStart, !isActive);
    }
    if (this._automationAssistMqttModalCreate) {
      const showCreate = mqttSupported && isActive;
      this._setVisible(this._automationAssistMqttModalCreate, showCreate);
      const discoveryWorking = this._automationAssistMqttDiscoveryWorking;
      const discoveryReady = this._automationAssistMqttDiscoveryCreated;
      if (discoveryWorking) {
        this._automationAssistMqttModalCreate.textContent = "Working...";
      } else {
        this._automationAssistMqttModalCreate.textContent = discoveryReady ? "Triggers ready for use" : "Create MQTT Discovery triggers";
      }
      this._automationAssistMqttModalCreate.disabled = discoveryWorking || discoveryReady || !this._automationAssistMqttAvailable();
      this._automationAssistMqttModalCreate.classList.toggle(
        "disabled",
        this._automationAssistMqttModalCreate.disabled
      );
    }
  }
  _updateLoadIndicator() {
    if (!this._loadIndicator) return;
    const active = this._isLoadingActive();
    if (this._loadIndicatorActive === active) return;
    this._loadIndicatorActive = active;
    this._loadIndicator.classList.toggle("is-loading", active);
  }
  _triggerCommandPulse() {
    this._commandPulseUntil = Date.now() + 1e3;
    this._updateLoadIndicator();
    clearTimeout(this._commandPulseTimeout);
    this._commandPulseTimeout = setTimeout(() => {
      this._updateLoadIndicator();
    }, 1e3);
  }
  _startActivityLoading(target) {
    this._activityLoadTarget = String(target ?? "");
    this._activityLoadActive = true;
    this._activityLoadStartedAt = Date.now();
    this._updateLoadIndicator();
    clearTimeout(this._activityLoadTimeout);
    this._activityLoadTimeout = setTimeout(() => {
      if (this._activityLoadActive) {
        this._activityLoadActive = false;
        this._updateLoadIndicator();
      }
    }, 6e4);
  }
  _stopActivityLoading() {
    if (!this._activityLoadActive) return;
    this._activityLoadActive = false;
    this._activityLoadTarget = null;
    this._activityLoadStartedAt = null;
    clearTimeout(this._activityLoadTimeout);
    this._updateLoadIndicator();
  }
  // ---------- Services ----------
  async _callService(domain, service, data, target = void 0) {
    await this._hass.callService(domain, service, data, target);
  }
  _fireEvent(type, detail = {}) {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true })
    );
  }
  async _runLovelaceAction(actionConfig, context = null) {
    if (this._editMode) return;
    if (!actionConfig || typeof actionConfig !== "object") return;
    const action = String(actionConfig.action || "").toLowerCase();
    const implicitService = (!action || action === "default") && (actionConfig.service || actionConfig.perform_action);
    if (action === "none") return;
    if (action === "call-service" || action === "perform-action" || implicitService) {
      const svc = String(
        actionConfig.service || actionConfig.perform_action || ""
      ).trim();
      if (!svc.includes(".")) return;
      const [domain, service] = svc.split(".", 2);
      const serviceData = {
        ...actionConfig.service_data || actionConfig.data || {}
      };
      const target = actionConfig.target && typeof actionConfig.target === "object" ? actionConfig.target : void 0;
      await this._callService(domain, service, serviceData, target);
      return;
    }
    if (action === "toggle") {
      const entityId = actionConfig.entity_id || actionConfig.entity || context?.entity_id || context?.entityId;
      if (!entityId) return;
      await this._callService("homeassistant", "toggle", {
        entity_id: entityId
      });
      return;
    }
    if (action === "more-info") {
      const entityId = actionConfig.entity_id || actionConfig.entity || context?.entity_id || context?.entityId;
      if (!entityId) return;
      this._fireEvent("hass-more-info", { entityId });
      return;
    }
    if (action === "navigate") {
      const path = actionConfig.navigation_path;
      if (!path) return;
      history.pushState(null, "", path);
      window.dispatchEvent(
        new Event("location-changed", { bubbles: true, composed: true })
      );
      return;
    }
    if (action === "url") {
      const url = actionConfig.url_path;
      if (!url) return;
      window.open(url, "_blank");
      return;
    }
    if (action === "fire-dom-event") {
      this._fireEvent("ll-custom", actionConfig);
      return;
    }
  }
  async _sendCommand(commandId, deviceId = null) {
    if (this._editMode) return;
    if (!this._hass || !this._config?.entity) return;
    const resolvedDevice = this._resolveCommandDeviceId(commandId, deviceId);
    if (this._isHubIntegration()) {
      const command = hubAssignedKeyCommand(resolvedDevice, commandId);
      if (!command) return;
      await this._hubSendCommandList(command);
      return;
    }
    const serviceData = remoteSendCommandData(
      this._config.entity,
      commandId,
      resolvedDevice
    );
    if (!serviceData) return;
    await this._callService("remote", "send_command", serviceData);
  }
  async _setActivity(option) {
    if (this._editMode) return;
    if (option == null || option === "") return;
    const selected = String(option);
    const current = this._currentActivityLabel();
    if (selected === current) return;
    this._pendingActivity = selected;
    this._pendingActivityAt = Date.now();
    this._startActivityLoading(selected);
    this._update();
    if (this._isHubIntegration()) {
      if (this._isPoweredOffLabel(selected)) {
        const currentId = this._currentActivityId();
        if (currentId != null) {
          await this._hubStopActivity(currentId);
        }
        return;
      }
      const match = this._activities().find((a) => a.name === selected);
      const activityId = match?.id;
      if (activityId == null) return;
      await this._hubStartActivity(activityId);
      return;
    }
    if (this._isPoweredOffLabel(selected)) {
      await this._callService("remote", "turn_off", {
        entity_id: this._config.entity
      });
      return;
    }
    await this._callService("remote", "turn_on", {
      entity_id: this._config.entity,
      activity: selected
    });
  }
  // ---------- Theme/background helpers (per-card) ----------
  _rgbToCss(rgb) {
    return rgbToCss(rgb);
  }
  _applyLocalTheme(themeName) {
    if (!this._root || !this._hass) return;
    const bgOverrideCss = this._rgbToCss(this._config?.background_override);
    const appliedKey = `${themeName || ""}||${bgOverrideCss}`;
    if (this._appliedThemeKey === appliedKey) return;
    if (this._appliedThemeVars?.length) {
      for (const cssVar of this._appliedThemeVars) {
        this._root.style.removeProperty(cssVar);
      }
    }
    this._appliedThemeVars = [];
    this._appliedThemeKey = appliedKey;
    let vars = null;
    if (themeName) {
      const themes = this._hass.themes?.themes;
      const def = themes?.[themeName];
      if (def && typeof def === "object") {
        vars = def;
        if (def.modes && typeof def.modes === "object") {
          const mode = this._hass.themes?.darkMode ? "dark" : "light";
          vars = { ...def, ...def.modes?.[mode] || {} };
          delete vars.modes;
        }
        for (const [k, v] of Object.entries(vars)) {
          if (v == null || typeof v !== "string" && typeof v !== "number")
            continue;
          const cssVar = k.startsWith("--") ? k : `--${k}`;
          this._root.style.setProperty(cssVar, String(v));
          this._appliedThemeVars.push(cssVar);
        }
      }
    }
    const themeBg = vars?.["ha-card-background"] ?? vars?.["card-background-color"] ?? vars?.["ha-card-background-color"] ?? vars?.["primary-background-color"] ?? null;
    const finalBg = bgOverrideCss || themeBg;
    if (finalBg) {
      this._root.style.setProperty("--ha-card-background", String(finalBg));
      this._root.style.setProperty("--card-background-color", String(finalBg));
      this._root.style.setProperty(
        "--ha-card-background-color",
        String(finalBg)
      );
      this._root.style.setProperty("background", String(finalBg));
      this._root.style.setProperty("background-color", String(finalBg));
      this._appliedThemeVars.push(
        "--ha-card-background",
        "--card-background-color",
        "--ha-card-background-color",
        "background",
        "background-color"
      );
    } else {
      this._root.style.removeProperty("background");
      this._root.style.removeProperty("background-color");
    }
  }
  _updateGroupRadius() {
    if (!this._root) return;
    const cs = getComputedStyle(this._root);
    const candidates = [
      "--ha-card-border-radius",
      "--ha-control-border-radius",
      "--mdc-shape-medium",
      "--mdc-shape-small",
      "--mdc-shape-large"
    ];
    let radius = "";
    for (const name of candidates) {
      const v = (cs.getPropertyValue(name) || "").trim();
      if (v) {
        radius = v;
        break;
      }
    }
    if (!radius) radius = "18px";
    this._root.style.setProperty("--sb-group-radius", radius);
    this._appliedThemeVars = this._appliedThemeVars || [];
    if (!this._appliedThemeVars.includes("--sb-group-radius")) {
      this._appliedThemeVars.push("--sb-group-radius");
    }
  }
  _optionsSignature(options) {
    return optionsSignature(options);
  }
  _drawerItemsSignature(items) {
    return drawerItemsSignature(items);
  }
  _enabledButtonsSignature(raw) {
    return enabledButtonsSignature(raw);
  }
  // ---------- UI helpers ----------
  _setVisible(el, on) {
    if (!el) return;
    if (on) {
      el.style.removeProperty("display");
    } else {
      el.style.setProperty("display", "none", "important");
    }
  }
  _installOutsideCloseHandler() {
    if (this._outsideCloseInstalled) return;
    this._outsideCloseInstalled = true;
    this._onOutsidePointerDown = (e) => {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      if (this._activeDrawer) {
        const clickedInOverlay = path.includes(this._macrosOverlayEl) || path.includes(this._favoritesOverlayEl);
        const clickedInToggleRow = path.includes(this._macroFavoritesRow) || path.includes(this._macrosButtonWrap) || path.includes(this._favoritesButtonWrap);
        if (!(clickedInOverlay || clickedInToggleRow)) {
          this._activeDrawer = null;
          this._scheduleDrawerDirectionReset();
          this._applyDrawerVisuals();
          this._syncLayering();
        }
      }
      if (this._activityMenuOpen) {
        const clickedInActivity = path.includes(this._activityRow) || path.includes(this._activitySelect);
        if (!clickedInActivity) {
          this._activityMenuOpen = false;
          this._syncLayering();
        }
      }
    };
    document.addEventListener("pointerdown", this._onOutsidePointerDown, true);
  }
  _removeOutsideCloseHandler() {
    if (!this._outsideCloseInstalled) return;
    this._outsideCloseInstalled = false;
    document.removeEventListener(
      "pointerdown",
      this._onOutsidePointerDown,
      true
    );
    this._onOutsidePointerDown = null;
  }
  connectedCallback() {
    this._installOutsideCloseHandler();
    if (!this._onResize) {
      this._onResize = () => {
        if (!this._activeDrawer) return;
        this._updateDrawerDirection();
        this._applyDrawerVisuals();
        this._syncLayering();
      };
    }
    window.addEventListener("resize", this._onResize, { passive: true });
    if (!this._onPreviewActivity) {
      this._onPreviewActivity = (event) => {
        const detail = event?.detail || {};
        if (detail.entity && this._config?.entity && detail.entity !== this._config.entity) {
          return;
        }
        this._previewActivity = detail.previewActivity ?? "";
        if (this._editMode) this._update();
      };
    }
    window.addEventListener(
      "sofabaton-preview-activity",
      this._onPreviewActivity
    );
  }
  disconnectedCallback() {
    this._removeOutsideCloseHandler();
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
      this._onResize = null;
    }
    if (this._onPreviewActivity) {
      window.removeEventListener(
        "sofabaton-preview-activity",
        this._onPreviewActivity
      );
    }
    clearTimeout(this._commandPulseTimeout);
    clearTimeout(this._activityLoadTimeout);
    clearTimeout(this._drawerResetTimer);
  }
  _getDrawerDesiredHeight() {
    const el = this._activeDrawer === "favorites" ? this._favoritesOverlayEl : this._macrosOverlayEl;
    if (!el) return 0;
    const maxH = 350;
    const desired = Math.min(el.scrollHeight || 0, maxH);
    return desired + 8;
  }
  _updateDrawerDirection() {
    if (!this._macroFavoritesRow || !this._mfContainer) return;
    if (!this._activeDrawer) return;
    const rowRect = this._macroFavoritesRow.getBoundingClientRect();
    const desired = this._getDrawerDesiredHeight();
    const cardRect = this._root && typeof this._root.getBoundingClientRect === "function" ? this._root.getBoundingClientRect() : null;
    if (!cardRect) {
      const spaceBelow = window.innerHeight - rowRect.bottom;
      const spaceAbove = rowRect.top;
      const shouldOpenUp2 = spaceBelow < desired && spaceAbove > spaceBelow;
      this._drawerDirection = shouldOpenUp2 ? "up" : "down";
      this._mfContainer.classList.toggle("drawer-up", shouldOpenUp2);
      return;
    }
    const spaceBelowInCard = cardRect.bottom - rowRect.bottom;
    const spaceAboveInCard = rowRect.top - cardRect.top;
    const overlapDown = Math.max(0, Math.min(desired, spaceBelowInCard));
    const overlapUp = Math.max(0, Math.min(desired, spaceAboveInCard));
    const shouldOpenUp = overlapUp > overlapDown;
    this._drawerDirection = shouldOpenUp ? "up" : "down";
    this._mfContainer.classList.toggle("drawer-up", shouldOpenUp);
  }
  _scheduleDrawerDirectionReset() {
    if (!this._mfContainer) return;
    clearTimeout(this._drawerResetTimer);
    this._drawerResetTimer = setTimeout(() => {
      if (this._activeDrawer) return;
      this._drawerDirection = "down";
      this._mfContainer.classList.remove("drawer-up");
    }, 260);
  }
  _toggleDrawer(type) {
    this._activeDrawer = this._activeDrawer === type ? null : type;
    if (this._activeDrawer) {
      this._updateDrawerDirection();
    } else {
      this._scheduleDrawerDirectionReset();
    }
    this._applyDrawerVisuals();
    this._syncLayering();
  }
  _applyDrawerVisuals() {
    if (!this._macrosOverlayEl || !this._favoritesOverlayEl) return;
    const isMacro = this._activeDrawer === "macros";
    const isFav = this._activeDrawer === "favorites";
    this._macrosOverlayEl.classList.toggle("open", isMacro);
    this._favoritesOverlayEl.classList.toggle("open", isFav);
    this._macrosButtonWrap.classList.toggle("active-tab", isMacro);
    this._favoritesButtonWrap.classList.toggle("active-tab", isFav);
    const anyOpen = isMacro || isFav;
    const r = "var(--sb-group-radius)";
    const up = this._drawerDirection === "up";
    this._macroFavoritesRow.style.borderTopLeftRadius = anyOpen && up ? "0" : r;
    this._macroFavoritesRow.style.borderTopRightRadius = anyOpen && up ? "0" : r;
    this._macroFavoritesRow.style.borderBottomLeftRadius = anyOpen && !up ? "0" : r;
    this._macroFavoritesRow.style.borderBottomRightRadius = anyOpen && !up ? "0" : r;
    this._macroFavoritesRow.style.transition = "border-radius 0.2s ease";
  }
  _syncLayering() {
    if (!this._activityRow || !this._mfContainer) return;
    const drawerOpen = Boolean(this._activeDrawer);
    const menuOpen = Boolean(this._activityMenuOpen);
    if (menuOpen) {
      this._activityRow.style.zIndex = "10";
      this._mfContainer.style.zIndex = drawerOpen ? "9" : "2";
      return;
    }
    if (drawerOpen) {
      this._activityRow.style.zIndex = "2";
      this._mfContainer.style.zIndex = "10";
      return;
    }
    this._activityRow.style.zIndex = "3";
    this._mfContainer.style.zIndex = "2";
  }
  _attachPrimaryAction(els, fn) {
    const targets = Array.isArray(els) ? els.filter(Boolean) : [els].filter(Boolean);
    const gate = {
      ts: 0,
      pointerId: null,
      type: null
    };
    const wrapped = (ev) => {
      const now = Date.now();
      const pid = ev && typeof ev.pointerId === "number" ? ev.pointerId : null;
      const etype = ev?.type || null;
      const delta = now - gate.ts;
      if (delta < 450) {
        if (pid !== null && gate.pointerId === pid) return;
        return;
      }
      if (delta < 1200 && (gate.type === "pointerup" || gate.type === "touchend") && (etype === "click" || etype === "ha-click" || etype === "tap")) {
        return;
      }
      gate.ts = now;
      gate.pointerId = pid;
      gate.type = etype;
      if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
      if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
      if (ev && typeof ev.stopImmediatePropagation === "function")
        ev.stopImmediatePropagation();
      try {
        this._fireEvent("haptic", "light");
        fn(ev);
      } catch (e) {
      }
    };
    const hasPointer = typeof window !== "undefined" && "PointerEvent" in window;
    for (const el of targets) {
      if (hasPointer) {
        el.addEventListener("pointerup", wrapped, {
          capture: true,
          passive: false
        });
      } else {
        el.addEventListener("touchend", wrapped, {
          capture: true,
          passive: false
        });
        el.addEventListener("click", wrapped, { capture: true });
      }
      el.addEventListener("ha-click", wrapped, { capture: true });
    }
  }
  _applyButtonTextSizing(btn, sizeVar) {
    const apply = (attempt = 0) => {
      const root = btn?.shadowRoot;
      if (!root) return;
      const value = `var(${sizeVar})`;
      const card = root.querySelector("ha-card");
      const name = root.querySelector(".name");
      const label = root.querySelector(".label");
      const state = root.querySelector(".state");
      if (card) card.style.setProperty("font-size", value);
      if (name) name.style.fontSize = value;
      if (label) label.style.fontSize = value;
      if (state) state.style.fontSize = value;
      if (!name && !label && !state && attempt < 2) {
        requestAnimationFrame(() => apply(attempt + 1));
      }
    };
    if (btn?.updateComplete && typeof btn.updateComplete.then === "function") {
      btn.updateComplete.then(() => apply());
    } else {
      requestAnimationFrame(() => apply());
    }
  }
  _mkHuiButton({
    key,
    label,
    icon,
    id,
    cmd,
    extraClass = "",
    size = "normal"
  }) {
    const model = huiButtonModel({ label, icon, extraClass, size });
    const { wrap, btn } = buildHuiButtonElement({
      model,
      hass: this._hass
    });
    this._attachPrimaryAction([wrap, btn], () => {
      if (!wrap.classList.contains("disabled")) {
        this._recordAutomationAssistClick({
          label: this._automationAssistLabelForKey(key, label),
          commandId: cmd,
          deviceId: this._commandTarget(id)?.activity_id ?? null,
          commandType: "assigned",
          icon
        });
        this._triggerCommandPulse();
        this._sendCommand(
          cmd,
          this._commandTarget(id)?.activity_id ?? this._currentActivityId()
        );
      }
    });
    this._applyButtonTextSizing(btn, "--sb-key-font-size");
    this._keys.push({
      key,
      id,
      cmd,
      wrap,
      btn,
      isX2Only: this._x2OnlyIds.has(id)
    });
    return wrap;
  }
  _mkColorKey({ key, id, cmd, color }) {
    const model = colorKeyModel(color);
    const { wrap, btn } = buildColorKeyElement({
      model,
      hass: this._hass
    });
    this._attachPrimaryAction([wrap, btn], () => {
      if (!wrap.classList.contains("disabled")) {
        this._recordAutomationAssistClick({
          label: this._automationAssistLabelForKey(key, key),
          commandId: cmd,
          deviceId: this._commandTarget(id)?.activity_id ?? null,
          commandType: "assigned",
          icon: null
        });
        this._triggerCommandPulse();
        this._sendCommand(
          cmd,
          this._commandTarget(id)?.activity_id ?? this._currentActivityId()
        );
      }
    });
    this._keys.push({
      key,
      id,
      cmd,
      wrap,
      btn,
      isX2Only: false
    });
    return wrap;
  }
  _mkActionButton({ label, icon, extraClass = "", onClick = null }) {
    const model = actionButtonModel({ label, icon, extraClass });
    const wrap = document.createElement("div");
    wrap.className = model.wrapClassName;
    if (onClick) {
      this._attachPrimaryAction(wrap, (e) => {
        if (!wrap.classList.contains("disabled")) onClick(e);
      });
    }
    const btn = document.createElement("hui-button-card");
    btn.hass = this._hass;
    btn.setConfig(model.buttonConfig);
    wrap.appendChild(btn);
    this._applyButtonTextSizing(btn, "--sb-tab-font-size");
    return { wrap, btn };
  }
  _mkDrawerButton(item, type) {
    const model = drawerButtonModel(item, type, this._currentActivityId());
    return buildDrawerButtonElement({
      model,
      rawItem: item,
      itemType: type,
      attachPrimaryAction: (target, handler) => this._attachPrimaryAction(target, handler),
      onTrigger: ({ model: nextModel, itemType, rawItem }) => {
        this._recordAutomationAssistClick({
          label: nextModel.label,
          commandId: nextModel.commandId,
          deviceId: nextModel.deviceId,
          commandType: nextModel.commandType,
          icon: nextModel.icon
        });
        this._triggerCommandPulse();
        this._sendDrawerItem(
          itemType,
          nextModel.commandId,
          nextModel.deviceId,
          rawItem
        );
      }
    });
  }
  _mkCustomFavoriteButton(fav) {
    const model = customFavoriteButtonModel(fav, this._currentActivityId());
    return buildCustomFavoriteButtonElement({
      model,
      rawFavorite: fav,
      attachPrimaryAction: (target, handler) => this._attachPrimaryAction(target, handler),
      onTrigger: ({ model: nextModel, rawFavorite }) => {
        if (this._automationAssistActive) {
          this._setAutomationAssistStatus("Not captured.");
        }
        if (nextModel.action) {
          this._runLovelaceAction(nextModel.action, rawFavorite);
          return;
        }
        if (!Number.isFinite(nextModel.commandId) || !Number.isFinite(nextModel.deviceId)) {
          return;
        }
        this._triggerCommandPulse();
        this._sendCustomFavoriteCommand(
          nextModel.commandId,
          nextModel.deviceId
        );
      }
    });
  }
  async _sendCustomFavoriteCommand(commandId, deviceId) {
    if (this._editMode) return;
    if (!this._hass || !this._config?.entity) return;
    const cmd = Number(commandId);
    const dev = Number(deviceId);
    if (!Number.isFinite(cmd) || !Number.isFinite(dev)) return;
    if (this._isHubIntegration()) {
      const command = hubFavoriteKeyCommand(dev, cmd);
      if (!command) return;
      await this._hubSendCommandList(command);
      return;
    }
    const serviceData = remoteSendCommandData(this._config.entity, cmd, dev);
    if (!serviceData) return;
    await this._callService("remote", "send_command", serviceData);
  }
  async _ensureHaElements() {
    const dropdownItemTag = this._selectItemTagName();
    await Promise.all([
      customElements.whenDefined("hui-button-card"),
      customElements.whenDefined("ha-select"),
      customElements.whenDefined(dropdownItemTag).catch(() => {
      })
      // optional
    ]);
  }
  _selectItemTagName() {
    return customElements.get("ha-dropdown-item") ? "ha-dropdown-item" : "mwc-list-item";
  }
  _selectOpenEvents() {
    return customElements.get("ha-dropdown-item") ? ["wa-open"] : ["opened"];
  }
  _selectCloseEvents() {
    return customElements.get("ha-dropdown-item") ? ["wa-close"] : ["closed"];
  }
  _setSelectValueCompat(selectEl, value, options = []) {
    if (!selectEl) return;
    const resolvedValue = String(value ?? "");
    const useDropdownItems = Boolean(customElements.get("ha-dropdown-item"));
    if (!useDropdownItems) {
      selectEl.value = resolvedValue;
      return;
    }
    const selectedOption = options.find(
      (option) => String(option?.value ?? "") === resolvedValue
    );
    selectEl.value = selectedOption ? String(selectedOption.label ?? selectedOption.value ?? "") : resolvedValue;
  }
  // ---------- Render ----------
  _render() {
    if (this._root) return;
    this._keys = [];
    this._x2OnlyIds = /* @__PURE__ */ new Set([
      ID.C,
      ID.B,
      ID.A,
      ID.EXIT,
      ID.DVR,
      ID.PLAY,
      ID.GUIDE
    ]);
    const card = document.createElement("ha-card");
    this._root = card;
    const style = document.createElement("style");
    style.textContent = `
      :host {
        --sb-group-radius: var(--ha-card-border-radius, 18px);
        --remote-max-width: 360px;
        --remote-zoom: 1;
        --sb-overlay-rgb: var(--rgb-primary-text-color, 0, 0, 0);

        display: block;
      }

      ha-card {
        width: 100%;
        max-width: var(--remote-max-width);
        zoom: var(--remote-zoom);
        margin-left: auto;
        margin-right: auto;
        --sb-key-font-size: clamp(11px, 7cqw, 50px);
        --sb-tab-font-size: clamp(14px, 6cqw, 50px);
        --sb-tab-height: clamp(20px, 3cqw, 50px);
        --sb-color-key-min-height: clamp(12px, 3.2cqw, 20px);
        container-type: inline-size;
      }

      .wrap { padding: 12px; display: grid; gap: 12px; position: relative; }
      .layout-container { display: grid; gap: 12px; }
      .layout-overlay {
        position: absolute;
        opacity: 1;
        transition: opacity 240ms ease;
        pointer-events: none;
        z-index: 2;
      }
      .layout-overlay--fade { opacity: 0; }
      @media (prefers-reduced-motion: reduce) {
        .layout-overlay { transition: none; }
      }
      ha-select { width: 100%; }

      /* HA 2026.04 introduced --ha-color-form-background (used by ha-combo-box-item
         inside ha-select). Community themes predate this variable so it falls back
         to the built-in light default (rgb(243,243,243)) even in dark themes.
         Override it here with theme-aware fallbacks so the field matches the theme. */
      .sb-activity-select {
        --ha-color-form-background: var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243)));
      }

      .activityRow { 
        display: grid; 
        grid-template-columns: 1fr; 
        position: relative;
        z-index: 3;
      }

      .automationAssist {
        display: grid;
        gap: 4px;
        padding: 12px;
        border-radius: var(--sb-group-radius);
        border: 1px solid rgba(var(--rgb-primary-color), 0.25);
        background: rgba(var(--rgb-primary-color), 0.08);
      }

      .automationAssist__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .automationAssist__label {
        font-size: 13px;
        font-weight: 600;
      }

      .automationAssist__status {
        font-size: 12px;
        opacity: 0.75;
        min-height: 14px; /* reserves 1 line so height doesn't jump */
      }

      /* small pill button */
      .automationAssist__startBtn {
        border: 1px solid rgba(var(--rgb-primary-color), 0.35);
        background: rgba(var(--rgb-primary-color), 0.10);
        color: var(--primary-text-color);
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        line-height: 1;
      }

      .automationAssist__mqttBtn {
        border: 1px solid rgba(var(--rgb-primary-color), 0.35);
        background: rgba(var(--rgb-primary-color), 0.10);
        color: var(--primary-text-color);
        border-radius: 999px;
        margin:10px;
        padding: 10px 10px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        line-height: 1;
      }

      .automationAssist__startBtn:hover {
        background: rgba(var(--rgb-primary-color), 0.16);
      }

      .automationAssist__startBtn:active {
        transform: scale(0.98);
      }

      .automationAssist__startBtn[disabled] {
        opacity: 0.5;
        cursor: default;
      }

      .automationAssist__mqttBtn[disabled] {
        opacity: 0.5;
        cursor: default;
      }


 	  .loadIndicator {
	    height: 4px;
	    width: 100%;
	    border-radius: 2px;
	    opacity: 0;
	    /* Use a transparent base with a bright highlight "shimmering" over it */
	    background: var(--primary-color, #03a9f4);
	    background-image: linear-gradient(
  		  90deg, 
		  transparent, 
		  rgba(255, 255, 255, 0.4), 
		  transparent
	    );
	    background-size: 200% 100%;
	    background-repeat: no-repeat;
	    transition: opacity 0.3s ease-in-out;
	    pointer-events: none;
	  }

	  .loadIndicator.is-loading {
	    opacity: 1; /* Increased from 0.45 for better visibility */
	    animation: sb-shimmer 1.5s infinite linear;
	  }

	  @keyframes sb-shimmer {
	    0% {
		  background-position: -200% 0;
	    }
	    100% {
		  background-position: 200% 0;
	    }
	  }

			.remote { 
        position: relative;
        z-index: 0; /* Base layer */
        display: grid; 
        gap: 12px; 
      }

      /* Group containers - border radius matches theme */
      .dpad, .mid, .media, .colors, .abc {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
      }

			.macroFavoritesGrid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important; 
        width: 100% !important;
      }
			.macroFavoritesGrid.single {
        grid-template-columns: 1fr !important;
      }
			.macroFavoritesGrid.single .macroFavoritesButton + .macroFavoritesButton {
        border-left: none;
      }
			.macroFavoritesGrid.single .macroFavoritesButton:first-child {
        border-right: none;
      }
			.macroFavoritesButton {
        cursor: pointer;
        padding: 4px 0;
        display: block !important;
        position: relative;
        overflow: hidden;
        transition: background 0.2s ease;
        --ha-card-box-shadow: none;
      }
      
      .macroFavoritesButton.active-tab hui-button-card {
         --primary-text-color: var(--primary-color);
      }

      .macroFavoritesButton + .macroFavoritesButton {
        border-left: 1px solid var(--divider-color);
      }
      .macroFavoritesButton hui-button-card {
        height: var(--sb-tab-height);
        display: block;
        --mdc-typography-button-font-size: var(--sb-tab-font-size);
        --paper-font-body1_-_font-size: var(--sb-tab-font-size);
        font-size: var(--sb-tab-font-size);
      }
			.macroFavoritesButton:first-child {
        border-right: 1px solid var(--divider-color);
      }
			.mf-container {
        position: relative; 
        z-index: 2;
      }

      /* Ensure taps go to the wrapper that has the click handler */
      .macroFavoritesButton > hui-button-card {
        pointer-events: none;
        position: relative;
        z-index: 1;
        -webkit-tap-highlight-color: transparent;
      }

			.macroFavorites {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
        overflow: hidden; 
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        position: relative;
        z-index: 4;
      }

			.mf-overlay {
        position: absolute;
        top: 100%; 
        left: 0;
        right: 0;
        z-index: 1; /* Lowered: Sits behind the buttons, above the remote body */
        
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        border: 1px solid var(--divider-color);
        border-top: none; 
        border-bottom-left-radius: var(--sb-group-radius);
        border-bottom-right-radius: var(--sb-group-radius);
        box-shadow: 0px 8px 16px rgba(0,0,0,0.25);
        
        transform-origin: top;
        transform: scaleY(0);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
        
        max-height: 350px;
        overflow-y: auto;
        padding: 12px;
        margin-top: -1px; /* Overlaps the bottom border of the button row for a seamless look */
      }


      .mf-container.drawer-up .mf-overlay {
        top: auto;
        bottom: 100%;

        border-top: 1px solid var(--divider-color);
        border-bottom: none;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        border-top-left-radius: var(--sb-group-radius);
        border-top-right-radius: var(--sb-group-radius);

        transform-origin: bottom;

        margin-top: 0;
        margin-bottom: -1px; /* Overlaps the top border of the button row for a seamless look */
        box-shadow: 0px -8px 16px rgba(0,0,0,0.25);
      }

			.mf-overlay.open {
        transform: scaleY(1);
        opacity: 1;
        pointer-events: auto;
      }

      .mf-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      /* Drawer buttons (Macros/Favorites) */
      .drawer-btn {
        height: 50px !important;
        font-size: 13px !important;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      /* Hover/press overlay  */
      .macroFavoritesButton::before,
      .drawer-btn::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: rgba(var(--sb-overlay-rgb), 0.06);
        opacity: 0;
        transition: opacity 0.15s ease, background 0.15s ease;
        pointer-events: none;
      }

      .macroFavoritesButton:hover::before,
      .drawer-btn:hover::before {
        opacity: 1;
      }

      .macroFavoritesButton:active::before,
      .drawer-btn:active::before {
        opacity: 1;
        background: rgba(var(--sb-overlay-rgb), 0.14);
      }

      .macroFavoritesButton:focus-visible,
      .drawer-btn:focus-visible {
        outline: 2px solid rgba(var(--rgb-primary-color), 0.55);
        outline-offset: 2px;
      }

      .drawer-btn__inner {
        height: 100%;
        width: 100%;
        box-sizing: border-box;
        position: relative;
        z-index: 1;
      }

      /* Matches default hui-button-card "button" look: centered icon + name */
      .drawer-btn__inner--stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 2px;
        padding: 4px;
      }

      /* Custom favorites: row layout with ellipsis */
      .drawer-btn__inner--row {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        padding: 0 12px;
        gap: 10px;
      }

      .drawer-btn--custom .drawer-btn__icon {
        --mdc-icon-size: 18px;
        width: 15% !important;
        flex: 0 0 15%;
      }

      .drawer-btn--custom .name {
        margin: 0 !important;
        text-align: left !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }


      /* Active state for buttons */
      .macroFavoritesButton.active-tab {
        background: rgba(var(--rgb-primary-color), 0.1);
        color: var(--primary-color);
      }

      .macroFavoritesButton hui-button-card {
        --ha-card-box-shadow: none;
        --ha-card-border-width: 0;
        --ha-card-border-color: transparent;
        --ha-card-background: transparent;
        --ha-card-border-radius: 0;
      }

      /* D-pad cluster */
      .dpad {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-areas:
          ". up ."
          "left ok right"
          ". down .";
        gap: 10px;
        align-items: center;
        justify-items: stretch;
      }
      .dpad .area-up { grid-area: up; }
      .dpad .area-left { grid-area: left; }
      .dpad .area-ok { grid-area: ok; }
      .dpad .area-right { grid-area: right; }
      .dpad .area-down { grid-area: down; }

      /* Back / Home / Menu row */
      .row3 {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      /* Mid: Volume/Channel layout variations */
      .mid {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        align-items: stretch;
      }
      .mid--dual {
        grid-template-rows: repeat(2, minmax(0, 1fr));
        grid-template-areas:
          "volup mute chup"
          "voldn mute chdn";
      }
      .mid--dual.mid--x2 {
        grid-template-areas:
          "volup guide chup"
          "voldn mute chdn";
      }
      .mid--volume {
        grid-template-rows: 1fr;
        grid-template-areas: "mute voldn volup";
      }
      .mid--channel.mid--x2 {
        grid-template-rows: 1fr;
        grid-template-areas: "guide chdn chup";
      }
      .mid--channel.mid--x1 {
        grid-template-rows: 1fr;
        grid-template-areas: "chdn . chup";
      }
      .mid-btn-volup { grid-area: volup; }
      .mid-btn-voldn { grid-area: voldn; }
      .mid-btn-mute { grid-area: mute; align-self: center; }
      .mid-btn-guide { grid-area: guide; }
      .mid-btn-chup { grid-area: chup; }
      .mid-btn-chdn { grid-area: chdn; }

      /* Media: X1 is 1 row; X2 is 2 rows */
      .media {
        padding: 12px;
        display: grid;
        gap: 10px;
        align-items: stretch;
      }
      .media--play,
      .media--dvr,
      .media--both.media--x1,
      .media--both.media--x2 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .media--play {
        grid-template-areas: "rew play fwd";
      }
      .media--play.media--x1 {
        grid-template-areas: "rew pause fwd";
      }
      .media--dvr {
        grid-template-areas: "dvr pause exit";
      }
      .media--both.media--x1 {
        grid-template-areas: "rew pause fwd";
      }
      .media--both.media--x2 {
        grid-template-areas:
          "rew play fwd"
          "dvr pause exit";
      }
      .media .area-rew   { grid-area: rew; }
      .media .area-play  { grid-area: play; }
      .media .area-fwd   { grid-area: fwd; }
      .media .area-dvr   { grid-area: dvr; }
      .media .area-pause { grid-area: pause; }
      .media .area-exit  { grid-area: exit; }

      /* Colors + ABC blocks */
      .colors, .abc {
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .colorsGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .abcGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }

      /* Key wrapper for disabled styling */
      .key.disabled,
      .macroFavoritesButton.disabled {
        opacity: 0.35;
        pointer-events: none;
        filter: grayscale(0.2);
      }

      /* sizing */

/* Allow grid children to shrink (prevents overflow on mobile / narrow cards) */
.key { min-width: 0; position: relative; width: 100%; }
.key hui-button-card {
  min-width: 0;
  --mdc-typography-button-font-size: var(--sb-key-font-size);
  --paper-font-body1_-_font-size: var(--sb-key-font-size);
  font-size: var(--sb-key-font-size);
}

/* --- Square remote keys (scalable) --- */
.key:not(.key--color) {
  aspect-ratio: 1 / 1;
}

/* Fill wrapper */
.key:not(.key--color) hui-button-card {
  display: block;
  width: 100%;
  height: 100% !important;
}

/* Re-introduce relative sizing (scales with card width) */
.key--small  { transform: scale(0.82); transform-origin: center; }
.key--normal { transform: scale(0.92); transform-origin: center; }
.key--big    { transform: scale(1.00); transform-origin: center; }
.okKey       { transform: scale(1.06); transform-origin: center; }

/* Keep color keys as strips (not square) */
.key--color {
  aspect-ratio: 3 / 1;
  min-height: var(--sb-color-key-min-height);
  transform: none;
}
.key--color hui-button-card {
  height: 100% !important;
  width: 100%;
  display: block;
}

/* Color keys: overlay a pill/strip on top of the hui-button-card */

      .key--color .colorBar {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: var(--sb-color);
        pointer-events: none;
      }

      .warn {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        z-index: 10;
        font-size: 12px;
        opacity: .9;
        border-left: 3px solid var(--warning-color, orange);
        padding-left: 10px;
      }

      .sb-modal {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.45);
        z-index: 999;
      }

      .sb-modal.open {
        display: flex;
      }

      .sb-modal__dialog {
        width: min(420px, 90vw);
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        color: var(--primary-text-color);
        border-radius: 16px;
        border: 1px solid var(--divider-color);
        padding: 16px;
        display: grid;
        gap: 12px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
      }

      .sb-modal__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .sb-modal__title {
        font-weight: 600;
        font-size: 14px;
      }

      .sb-modal__close {
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }

      .sb-modal__text {
        font-size: 13px;
        opacity: 0.85;
      }

      .sb-modal__optout {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        opacity: 0.85;
      }

      .sb-modal__actions {
        display: grid;
        gap: 8px;
      }

      .sb-modal__link {
        font-size: 12px;
        color: var(--primary-color, #03a9f4);
        text-decoration: underline;
      }
    `;
    const wrap = document.createElement("div");
    wrap.className = "wrap";
    this._wrap = wrap;
    this._layoutContainer = document.createElement("div");
    this._layoutContainer.className = "layout-container";
    this._automationAssistRow = document.createElement("div");
    this._automationAssistRow.className = "automationAssist";
    const assistLabel = document.createElement("div");
    assistLabel.className = "automationAssist__label";
    assistLabel.textContent = "Key capture";
    this._automationAssistLabel = assistLabel;
    const assistStatus = document.createElement("div");
    assistStatus.className = "automationAssist__status";
    this._automationAssistStatus = assistStatus;
    const mkAssistButton = (label, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "automationAssist__startBtn";
      btn.textContent = label || "Start";
      this._attachPrimaryAction(btn, onClick);
      return btn;
    };
    const assistHeader = document.createElement("div");
    assistHeader.className = "automationAssist__header";
    assistHeader.appendChild(assistLabel);
    this._automationAssistRow.appendChild(assistHeader);
    this._automationAssistRow.appendChild(assistStatus);
    this._wrap.appendChild(this._automationAssistRow);
    this._wrap.appendChild(this._layoutContainer);
    this._automationAssistMqttModal = document.createElement("div");
    this._automationAssistMqttModal.className = "sb-modal";
    this._automationAssistMqttModal.setAttribute("role", "dialog");
    this._automationAssistMqttModal.setAttribute("aria-modal", "true");
    this._automationAssistMqttModal.addEventListener("click", (ev) => {
      if (ev.target === this._automationAssistMqttModal) {
        this._closeAutomationAssistMqttModal();
      }
    });
    const modalDialog = document.createElement("div");
    modalDialog.className = "sb-modal__dialog";
    const modalHeader = document.createElement("div");
    modalHeader.className = "sb-modal__header";
    const modalTitle = document.createElement("div");
    modalTitle.className = "sb-modal__title";
    modalTitle.textContent = "Home Assistant device detected.";
    const modalClose = document.createElement("button");
    modalClose.type = "button";
    modalClose.className = "sb-modal__close";
    modalClose.setAttribute("aria-label", "Close");
    modalClose.textContent = "\u2715";
    modalClose.addEventListener(
      "click",
      () => this._closeAutomationAssistMqttModal()
    );
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(modalClose);
    const modalBody = document.createElement("div");
    modalBody.className = "sb-modal__body";
    const modalText = document.createElement("div");
    modalText.className = "sb-modal__text";
    this._automationAssistMqttModalText = modalText;
    modalBody.appendChild(modalText);
    const modalActions = document.createElement("div");
    modalActions.className = "sb-modal__actions";
    const modalActivityToggle = document.createElement("label");
    modalActivityToggle.className = "sb-modal__optout";
    this._automationAssistMqttModalActivityRow = modalActivityToggle;
    const modalActivityInput = document.createElement("input");
    modalActivityInput.type = "checkbox";
    this._automationAssistMqttModalActivityInput = modalActivityInput;
    const modalActivityText = document.createElement("span");
    modalActivityText.textContent = "Also create triggers for Activity changes.";
    modalActivityToggle.appendChild(modalActivityInput);
    modalActivityToggle.appendChild(modalActivityText);
    const modalDocsLink = document.createElement("a");
    modalDocsLink.className = "sb-modal__link";
    modalDocsLink.href = `https://github.com/m3tac0de/sofabaton-virtual-remote/blob/${CARD_VERSION}/docs/automation_triggers.md`;
    modalDocsLink.target = "_blank";
    modalDocsLink.rel = "noopener noreferrer";
    modalDocsLink.textContent = "See documentation for this feature.";
    this._automationAssistMqttModalCreate = mkAssistButton(
      "Create MQTT Discovery triggers",
      () => this._handleAutomationAssistMqttClick()
    );
    this._automationAssistMqttModalCreate.classList.add(
      "automationAssist__mqttBtn"
    );
    this._automationAssistMqttModalStart = mkAssistButton(
      "Start capturing commands",
      () => this._setAutomationAssistActive(true)
    );
    const modalOptOut = document.createElement("label");
    modalOptOut.className = "sb-modal__optout";
    const modalOptOutInput = document.createElement("input");
    modalOptOutInput.type = "checkbox";
    this._automationAssistMqttModalOptOutInput = modalOptOutInput;
    modalOptOutInput.addEventListener("change", () => {
      if (modalOptOutInput.checked) {
        const session = this._automationAssistSessionState();
        session.hideMqttModal = true;
        this._closeAutomationAssistMqttModal();
      }
    });
    const modalOptOutText = document.createElement("span");
    modalOptOutText.textContent = "Not show this again for this device (in this session).";
    modalOptOut.appendChild(modalOptOutInput);
    modalOptOut.appendChild(modalOptOutText);
    modalActions.appendChild(modalActivityToggle);
    modalActions.appendChild(modalDocsLink);
    modalActions.appendChild(this._automationAssistMqttModalCreate);
    modalActions.appendChild(modalOptOut);
    modalActions.appendChild(this._automationAssistMqttModalStart);
    modalDialog.appendChild(modalHeader);
    modalDialog.appendChild(modalBody);
    modalDialog.appendChild(modalActions);
    this._automationAssistMqttModal.appendChild(modalDialog);
    card.appendChild(this._automationAssistMqttModal);
    let lastSelectedActivityValue = null;
    let lastSelectedActivityAt = 0;
    const handleActivitySelect = (ev) => {
      if (this._editMode) return;
      if (this._suppressActivityChange) return;
      const value = ev?.detail?.value ?? ev?.target?.value ?? this._activitySelect.value;
      if (value != null) {
        const now = Date.now();
        if (String(value) === lastSelectedActivityValue && now - lastSelectedActivityAt < 250) {
          return;
        }
        lastSelectedActivityValue = String(value);
        lastSelectedActivityAt = now;
        this._fireEvent("haptic", "light");
        Promise.resolve(this._setActivity(value)).catch((err) => {
          console.error(
            "[sofabaton-virtual-remote] Failed to set activity:",
            err
          );
        });
      }
    };
    const onMenuOpened = () => {
      this._activityMenuOpen = true;
      this._syncLayering();
    };
    const onMenuClosed = () => {
      this._activityMenuOpen = false;
      this._syncLayering();
    };
    const activityRowSection = buildActivityRow({
      onSelect: handleActivitySelect,
      onMenuOpened,
      onMenuClosed,
      openEvents: this._selectOpenEvents(),
      closeEvents: this._selectCloseEvents()
    });
    this._activityRow = activityRowSection.row;
    this._activitySelect = activityRowSection.select;
    this._loadIndicator = activityRowSection.loadIndicator;
    const macroFavoritesSection = buildMacroFavoritesSection({
      createActionButton: (options) => this._mkActionButton(options),
      onMacrosClick: () => this._toggleDrawer("macros"),
      onFavoritesClick: () => this._toggleDrawer("favorites")
    });
    const mfContainer = macroFavoritesSection.container;
    this._mfContainer = mfContainer;
    this._macroFavoritesRow = macroFavoritesSection.row;
    this._macroFavoritesGrid = macroFavoritesSection.grid;
    this._macrosButtonWrap = macroFavoritesSection.macrosButtonWrap;
    this._macrosButton = macroFavoritesSection.macrosButton;
    this._favoritesButtonWrap = macroFavoritesSection.favoritesButtonWrap;
    this._favoritesButton = macroFavoritesSection.favoritesButton;
    this._macrosOverlayEl = macroFavoritesSection.macrosOverlayEl;
    this._macrosOverlayGrid = macroFavoritesSection.macrosOverlayGrid;
    this._favoritesOverlayEl = macroFavoritesSection.favoritesOverlayEl;
    this._favoritesOverlayGrid = macroFavoritesSection.favoritesOverlayGrid;
    this._installOutsideCloseHandler();
    const groupSection = buildRemoteGroups({
      createHuiButton: (options) => this._mkHuiButton(options),
      createColorKey: (options) => this._mkColorKey(options),
      ids: ID
    });
    this._dpadEl = groupSection.dpadEl;
    this._navRowEl = groupSection.navRowEl;
    this._midEl = groupSection.midEl;
    this._midButtons = groupSection.midButtons;
    this._mediaEl = groupSection.mediaEl;
    this._mediaButtons = groupSection.mediaButtons;
    this._colorsEl = groupSection.colorsEl;
    this._abcEl = groupSection.abcEl;
    this._warn = document.createElement("div");
    this._warn.className = "warn";
    this._warn.style.display = "none";
    this._groupEls = {
      activity: this._activityRow,
      macro_favorites: mfContainer,
      dpad: this._dpadEl,
      nav: this._navRowEl,
      mid: this._midEl,
      media: this._mediaEl,
      colors: this._colorsEl,
      abc: this._abcEl
    };
    this._applyGroupOrder();
    this._syncLayering();
    this._updateAutomationAssistUI();
    this._syncAutomationAssistMqtt();
    card.appendChild(style);
    card.appendChild(wrap);
    this.appendChild(card);
  }
  _update() {
    if (!this._root || !this._config || !this._hass) return;
    this._applyLocalTheme(this._config?.theme);
    this._updateGroupRadius();
    const remote = this._remoteState();
    const activities = this._activities();
    const preview = this._previewSelection(activities);
    this._previewState = preview;
    const activityId = preview ? preview.activityId : this._currentActivityId();
    const layoutConfig = layoutConfigForActivity(this._config, activityId);
    this._maybeAnimateLayoutChange(
      this._layoutSignature(activityId, layoutConfig)
    );
    this._applyGroupOrder();
    const mw = this._config?.max_width;
    if (mw == null || mw === "" || mw === 0) {
      this.style.removeProperty("--remote-max-width");
    } else if (typeof mw === "number" && Number.isFinite(mw) && mw > 0) {
      this.style.setProperty("--remote-max-width", `${mw}px`);
    } else if (typeof mw === "string" && mw.trim()) {
      this.style.setProperty("--remote-max-width", mw.trim());
    }
    const shrink = this._config?.shrink;
    const shrinkNum = typeof shrink === "number" ? shrink : typeof shrink === "string" ? Number(shrink) : 0;
    if (!Number.isFinite(shrinkNum) || shrinkNum <= 0) {
      this.style.removeProperty("--remote-zoom");
    } else {
      const z = Math.max(0.1, Math.min(1, 1 - shrinkNum / 100));
      this.style.setProperty("--remote-zoom", String(z));
    }
    const isUnavailable = remote?.state === "unavailable";
    const loadState = remote?.attributes?.load_state;
    const assignedKeys = remote?.attributes?.assigned_keys;
    const macroKeys = remote?.attributes?.macro_keys;
    const favoriteKeys = remote?.attributes?.favorite_keys;
    const resolvedHubData = resolveHubActivityData({
      isHubIntegration: this._isHubIntegration(),
      activityId,
      assignedKeys,
      macroKeys,
      favoriteKeys,
      hubAssignedKeysCache: this._hubAssignedKeysCache || {},
      hubMacrosCache: this._hubMacrosCache || {},
      hubFavoritesCache: this._hubFavoritesCache || {}
    });
    this._hubAssignedKeysCache = resolvedHubData.hubAssignedKeysCache;
    this._hubMacrosCache = resolvedHubData.hubMacrosCache;
    this._hubFavoritesCache = resolvedHubData.hubFavoritesCache;
    const actKey = resolvedHubData.actKey;
    const _assignedMap = resolvedHubData.assignedMap;
    const _macroMap = resolvedHubData.macroMap;
    const _favMap = resolvedHubData.favoriteMap;
    const macros = resolvedHubData.macros;
    const favorites = resolvedHubData.favorites;
    const customFavorites = this._customFavorites();
    const rawAssignedKeys = resolvedHubData.rawAssignedKeys;
    if (this._isHubIntegration() && !isUnavailable) {
      if (activities.length === 0 && loadState !== "loading") {
        this._hubRequestBasicData();
      }
      if (activityId != null) {
        const aKey = String(activityId);
        const hasAssignedAttr = assignedKeys && typeof assignedKeys === "object" && (this._hasOwn(assignedKeys, aKey) || this._hasOwn(assignedKeys, activityId));
        const hasMacroAttr = macroKeys && typeof macroKeys === "object" && (this._hasOwn(macroKeys, aKey) || this._hasOwn(macroKeys, activityId));
        const hasFavAttr = favoriteKeys && typeof favoriteKeys === "object" && (this._hasOwn(favoriteKeys, aKey) || this._hasOwn(favoriteKeys, activityId));
        const confirmedActivityId = Number(activityId);
        if (this._x2LastFetchedActivityId !== confirmedActivityId) {
          this._x2LastFetchedActivityId = confirmedActivityId;
          this._hubRequestAssignedKeys(confirmedActivityId);
          this._hubRequestMacroKeys(confirmedActivityId);
          this._hubRequestFavoriteKeys(confirmedActivityId);
        }
      }
    } else if (this._isHubIntegration() && activityId == null) {
      this._x2LastFetchedActivityId = null;
    }
    const enabledButtonsSig = this._enabledButtonsSignature(rawAssignedKeys);
    if (this._enabledButtonsCacheKey !== enabledButtonsSig) {
      this._enabledButtonsCacheKey = enabledButtonsSig;
      const parsed = Array.isArray(rawAssignedKeys) ? rawAssignedKeys.map((entry) => ({
        command: Number(entry),
        activity_id: activityId
      })).filter((entry) => Number.isFinite(entry.command)) : [];
      this._enabledButtonsInvalid = Array.isArray(rawAssignedKeys) && parsed.length === 0;
      this._enabledButtonsCache = parsed;
    }
    const isX2 = this._isX2();
    const showVolume = this._volumeEnabled(layoutConfig);
    const showChannel = this._channelEnabled(layoutConfig);
    const showMedia = this._mediaEnabled(layoutConfig);
    const showDvr = this._dvrEnabled(layoutConfig);
    const midEnabled = (layoutConfig.show_mid ?? true) && (showVolume || showChannel);
    const mediaEnabled2 = isX2 ? showMedia || showDvr : showMedia;
    if (this._midEl) {
      const midState = midModeState({ showVolume, showChannel, isX2 });
      Object.entries(midState.classMap).forEach(([className, enabled]) => {
        this._midEl.classList.toggle(className, enabled);
      });
    }
    if (this._mediaEl) {
      const mediaState = mediaModeState({ isX2, showMedia, showDvr });
      Object.entries(mediaState.classMap).forEach(([className, enabled]) => {
        this._mediaEl.classList.toggle(className, enabled);
      });
    }
    this._buttonVisibility = runtimeButtonVisibility({
      isX2,
      showVolume,
      showChannel,
      showMedia,
      showDvr
    });
    let isPoweredOff = false;
    let current = "";
    const pendingActivity = this._pendingActivity;
    const pendingAge = this._pendingActivityAt ? Date.now() - this._pendingActivityAt : null;
    const pendingExpired = pendingAge != null && pendingAge > 15e3;
    this._activitySelect.hass = this._hass;
    if (isUnavailable) {
      this._activitySelect.disabled = true;
      this._activitySelect.innerHTML = "";
      this._activityOptionsSig = null;
      isPoweredOff = false;
      this._stopActivityLoading();
    } else {
      const selectState = buildActivitySelectState({
        editMode: this._editMode,
        preview,
        activities,
        currentActivityLabel: this._currentActivityLabel(),
        pendingActivity,
        pendingExpired
      });
      const options = selectState.options;
      current = selectState.current;
      isPoweredOff = preview ? Boolean(preview.poweredOff) : activityId == null || Boolean(selectState.poweredOff);
      if (selectState.clearPending) {
        this._pendingActivity = null;
        this._pendingActivityAt = null;
      }
      const sig = this._optionsSignature(options);
      if (this._activityOptionsSig !== sig) {
        this._activityOptionsSig = sig;
        this._activitySelect.innerHTML = "";
        for (const opt of options) {
          const item = document.createElement(this._selectItemTagName());
          item.value = opt;
          item.textContent = opt;
          this._activitySelect.appendChild(item);
        }
      }
      this._suppressActivityChange = true;
      this._activitySelect.value = selectState.resolvedValue;
      this._suppressActivityChange = false;
      this._activitySelect.disabled = selectState.disabled;
      const currentActivity = this._currentActivityLabel();
      if (this._activityLoadActive && this._activityLoadTarget) {
        const targetIsOff = this._isPoweredOffLabel(this._activityLoadTarget);
        if (targetIsOff && isPoweredOff || currentActivity === this._activityLoadTarget) {
          this._stopActivityLoading();
        }
      }
      if (this._automationAssistEnabled() && //this._automationAssistActive &&
      this._lastActivityLabel != null && current !== this._lastActivityLabel) {
        if (this._isPoweredOffLabel(current)) {
          this._recordAutomationAssistActivityChange({
            activityId: this._lastActivityId,
            activityName: "Powered Off",
            poweredOff: true
          });
        } else {
          this._recordAutomationAssistActivityChange({
            activityId,
            activityName: current,
            poweredOff: false
          });
        }
      }
    }
    const noActivitiesMessage = noActivitiesWarning(
      isUnavailable,
      activities.length,
      loadState
    );
    if (noActivitiesMessage) {
      this._warn.style.display = "block";
      this._warn.textContent = noActivitiesMessage;
    } else {
      this._warn.style.display = "none";
    }
    if (isUnavailable) {
      this._lastActivityLabel = null;
      this._lastActivityId = null;
      this._lastPoweredOff = null;
    } else {
      this._lastActivityLabel = current;
      this._lastActivityId = activityId;
      this._lastPoweredOff = isPoweredOff;
    }
    this._setVisible(
      this._automationAssistRow,
      this._config.show_automation_assist
    );
    if (!this._automationAssistEnabled() && this._automationAssistActive) {
      this._setAutomationAssistActive(false);
    }
    this._syncAutomationAssistMqtt();
    this._setVisible(this._activityRow, layoutConfig.show_activity);
    const showMacrosBtn = this._showMacrosButton();
    const showFavoritesBtn = this._showFavoritesButton();
    const disableAllButtons = isUnavailable || this._activityLoadActive || !this._editMode && isPoweredOff;
    const drawerDisplayState = drawerVisibilityState({
      activeDrawer: this._activeDrawer,
      showMacrosButton: showMacrosBtn,
      showFavoritesButton: showFavoritesBtn,
      editMode: this._editMode,
      macros,
      favorites,
      customFavorites,
      disableAllButtons
    });
    this._setVisible(this._mfContainer, drawerDisplayState.showMF);
    this._setVisible(this._macrosButtonWrap, showMacrosBtn);
    this._setVisible(this._favoritesButtonWrap, showFavoritesBtn);
    if (this._macroFavoritesGrid) {
      this._macroFavoritesGrid.classList.toggle(
        "single",
        drawerDisplayState.visibleCount === 1
      );
    }
    const prevDrawer = this._activeDrawer;
    this._activeDrawer = drawerDisplayState.nextActiveDrawer;
    if (drawerDisplayState.closedByVisibility) {
      this._scheduleDrawerDirectionReset();
      this._applyDrawerVisuals();
      this._syncLayering();
    }
    this._setVisible(this._dpadEl, layoutConfig.show_dpad);
    this._setVisible(this._navRowEl, layoutConfig.show_nav);
    this._setVisible(this._midEl, midEnabled);
    this._setVisible(this._mediaEl, mediaEnabled2);
    this._setVisible(this._colorsEl, layoutConfig.show_colors);
    this._setVisible(this._abcEl, layoutConfig.show_abc && isX2);
    if (this._macrosButton) {
      this._macrosButton.hass = this._hass;
      this._macrosButtonWrap.classList.toggle(
        "disabled",
        drawerDisplayState.macrosDisabled
      );
    }
    if (this._favoritesButton) {
      this._favoritesButton.hass = this._hass;
      this._favoritesButtonWrap.classList.toggle(
        "disabled",
        drawerDisplayState.favoritesDisabled
      );
    }
    const macroSig = this._drawerItemsSignature(macros);
    const favSig = this._drawerItemsSignature(favorites);
    const customFavSig = this._customFavoritesSignature(customFavorites);
    const drawerRefresh = drawerRefreshState({
      macroDataSig: this._macroDataSig,
      macroSig,
      customFavoritesSig: customFavSig,
      favoritesSig: favSig,
      favoritesDataSig: this._favDataSig
    });
    if (drawerRefresh.refreshMacros && this._macrosOverlayGrid) {
      this._macroDataSig = drawerRefresh.nextMacroSig;
      this._macrosOverlayGrid.innerHTML = "";
      macros.forEach((macro) => {
        const btn = this._mkDrawerButton(macro, "macros");
        btn.hass = this._hass;
        this._macrosOverlayGrid.appendChild(btn);
      });
    }
    if (drawerRefresh.refreshFavorites && this._favoritesOverlayGrid) {
      this._favDataSig = drawerRefresh.nextFavoritesSig;
      this._favoritesOverlayGrid.innerHTML = "";
      customFavorites.forEach((fav) => {
        const btn = this._mkCustomFavoriteButton(fav);
        btn.hass = this._hass;
        this._favoritesOverlayGrid.appendChild(btn);
      });
      favorites.forEach((fav) => {
        const btn = this._mkDrawerButton(fav, "favorites");
        btn.hass = this._hass;
        this._favoritesOverlayGrid.appendChild(btn);
      });
    }
    this._updateDrawerDirection();
    this._applyDrawerVisuals();
    for (const k of this._keys) {
      k.btn.hass = this._hass;
      const layoutVisible = this._buttonVisibility && k.key in this._buttonVisibility ? this._buttonVisibility[k.key] : true;
      const shouldShow = k.isX2Only ? isX2 && layoutVisible : layoutVisible;
      this._setVisible(k.wrap, shouldShow);
      const enabled = !disableAllButtons && (this._editMode || this._isEnabled(k.id));
      k.wrap.classList.toggle("disabled", !enabled);
    }
    if (remote?.state === "unavailable") {
      this._warn.style.display = "block";
      this._warn.textContent = "Remote is unavailable (possibly because the Sofabaton app is connected).";
    }
    this._updateLoadIndicator();
  }
  getCardSize() {
    return 12;
  }
  static getConfigElement() {
    return document.createElement(EDITOR);
  }
  static getStubConfig(hass) {
    return {
      entity: "",
      theme: "",
      background_override: null,
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
      show_automation_assist: false,
      show_macros_button: null,
      show_favorites_button: null,
      custom_favorites: [],
      max_width: 360,
      shrink: 0,
      group_order: DEFAULT_GROUP_ORDER.slice()
    };
  }
};
var SofabatonRemoteCardEditor = class extends HTMLElement {
  async _ensureEditorIntegration() {
    if (!this._hass?.callWS || !this._config?.entity) return;
    const entityId = String(this._config.entity);
    if (this._editorIntegrationEntityId === entityId && this._editorIntegrationDomain)
      return;
    if (this._editorIntegrationDetectingFor === entityId) return;
    this._editorIntegrationDetectingFor = entityId;
    try {
      const entry = await this._hass.callWS({
        type: "config/entity_registry/get",
        entity_id: entityId
      });
      this._editorIntegrationDomain = String(entry?.platform || "");
      this._editorIntegrationEntityId = entityId;
    } catch (e) {
      this._editorIntegrationDomain = null;
      this._editorIntegrationEntityId = entityId;
    } finally {
      this._editorIntegrationDetectingFor = null;
    }
  }
  _isHubIntegrationForEditor() {
    return String(this._editorIntegrationDomain || "") === "sofabaton_hub";
  }
  _editorHubVersion() {
    const entityId = String(this._config?.entity || "").trim();
    if (!entityId) return "";
    return String(
      this._hass?.states?.[entityId]?.attributes?.hub_version || ""
    ).toUpperCase();
  }
  _isEditorX2() {
    if (this._isHubIntegrationForEditor()) return true;
    return this._editorHubVersion().includes("X2");
  }
  _supportsUnicodeCommandNames() {
    return this._isEditorX2() || this._editorHubVersion().includes("X1S");
  }
  _editorRemoteUnavailable(entityId = void 0) {
    const resolved = String((entityId ?? this._config?.entity) || "").trim();
    if (!resolved) return false;
    return this._hass?.states?.[resolved]?.state === "unavailable";
  }
  _sanitizeCommandName(value) {
    const pattern = this._supportsUnicodeCommandNames() ? /[^\p{L}\p{N} ]+/gu : /[^A-Za-z0-9 ]+/g;
    const cleaned = String(value ?? "").replace(pattern, "").slice(0, 20);
    return cleaned;
  }
  _selectItemTagName() {
    return customElements.get("ha-dropdown-item") ? "ha-dropdown-item" : "mwc-list-item";
  }
  _selectCloseEvents() {
    return customElements.get("ha-dropdown-item") ? ["wa-close"] : ["closed"];
  }
  _setSelectValueCompat(selectEl, value, options = []) {
    if (!selectEl) return;
    const resolvedValue = String(value ?? "");
    const useDropdownItems = Boolean(customElements.get("ha-dropdown-item"));
    if (!useDropdownItems) {
      selectEl.value = resolvedValue;
      return;
    }
    const selectedOption = options.find(
      (option) => String(option?.value ?? "") === resolvedValue
    );
    selectEl.value = selectedOption ? String(selectedOption.label ?? selectedOption.value ?? "") : resolvedValue;
  }
  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    const entityId = String(this._config?.entity || "").trim();
    if (!entityId) return;
    if (this._editorIntegrationEntityId !== entityId && this._editorIntegrationDetectingFor !== entityId) {
      this._ensureEditorIntegration().then(() => this._renderCommandsEditor());
    }
    const remoteUnavailable = this._editorRemoteUnavailable(entityId);
    const availabilityChanged = this._lastEditorRemoteUnavailable !== remoteUnavailable;
    this._lastEditorRemoteUnavailable = remoteUnavailable;
    if (availabilityChanged) {
      this._renderCommandsEditor();
    }
  }
  setConfig(config) {
    const incomingConfig = { ...config || {} };
    const isInitialEditorConfig = !this._form;
    if ("preview_activity" in incomingConfig) {
      delete incomingConfig.preview_activity;
    }
    if (Object.prototype.hasOwnProperty.call(config, "preview_activity")) {
      this._previewActivity = config?.preview_activity ?? "";
      writePreviewActivity(config?.entity, this._previewActivity);
    } else if (this._previewActivity == null) {
      const cached = readPreviewActivity(config?.entity);
      this._previewActivity = cached ?? "";
    }
    if (isInitialEditorConfig) {
      this._layoutSelection = "default";
      this._previewActivity = "";
      writePreviewActivity(config?.entity, "");
      window.dispatchEvent(
        new CustomEvent("sofabaton-preview-activity", {
          detail: { entity: config?.entity, previewActivity: "" }
        })
      );
    }
    const nextEntity = String(incomingConfig?.entity || "");
    if (nextEntity !== String(this._editorIntegrationEntityId || "")) {
      this._editorIntegrationEntityId = null;
      this._editorIntegrationDomain = null;
      this._editorIntegrationDetectingFor = null;
    }
    if ("commands" in incomingConfig) delete incomingConfig.commands;
    const configUnchanged = !!this._form && JSON.stringify(this._config || {}) === JSON.stringify(incomingConfig);
    this._config = incomingConfig;
    if (configUnchanged) {
      return;
    }
    if (!isInitialEditorConfig) {
      this._syncLayoutSelectionWithPreview();
    }
    this._render();
  }
  _render() {
    if (!this._hass) return;
    if (!this._form) {
      const form = document.createElement("ha-form");
      form.hass = this._hass;
      form.computeLabel = (schema) => {
        const labels = {
          entity: "Select a Sofabaton Remote Entity",
          theme: "Apply a theme to the card",
          use_background_override: "Customize background color",
          background_override: "Select Background Color",
          show_activity: "Activity Selector",
          show_dpad: "Direction Pad",
          show_nav: "Back/Home/Menu Keys",
          show_mid: "Volume/Channel Rockers",
          show_media: "Media Playback Controls",
          show_colors: "Red/Green/Yellow/Blue",
          show_abc: "A/B/C Buttons",
          show_macros_button: "Macros Button",
          show_favorites_button: "Favorites Button",
          max_width: "Maximum Card Width (px)",
          group_order: "Group Order"
        };
        return labels[schema.name] || schema.name;
      };
      form.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const newValue = { ...this._config, ...ev.detail.value };
        const entityChanged = newValue.entity !== this._config.entity;
        if (newValue.use_background_override === false) {
          delete newValue.background_override;
        }
        if (JSON.stringify(this._config) === JSON.stringify(newValue)) return;
        if (entityChanged) {
          const prevConfig = this._config;
          this._config = { ...prevConfig, entity: newValue.entity };
          this._layoutSelection = "default";
          this._setPreviewActivityForSelection("default");
          this._config = prevConfig;
          if (prevConfig?.entity) {
            writePreviewActivity(prevConfig.entity, "");
            window.dispatchEvent(
              new CustomEvent("sofabaton-preview-activity", {
                detail: { entity: prevConfig.entity, previewActivity: "" }
              })
            );
          }
        }
        this._config = newValue;
        this._fireChanged();
        if (entityChanged) this._renderGroupOrderEditor();
      });
      const wrapper = document.createElement("div");
      wrapper.style.padding = "12px 0";
      wrapper.appendChild(form);
      this.appendChild(wrapper);
      this._form = form;
      if (!this._stylingWrap) {
        const stylingWrap = document.createElement("div");
        stylingWrap.className = "sb-styling-wrap";
        stylingWrap.style.padding = "0 0 12px 0";
        this.appendChild(stylingWrap);
        this._stylingWrap = stylingWrap;
      }
      if (!this._layoutWrap) {
        const layoutWrap = document.createElement("div");
        layoutWrap.className = "sb-layout-wrap";
        layoutWrap.style.padding = "0 0 12px 0";
        this.appendChild(layoutWrap);
        this._layoutWrap = layoutWrap;
      }
      if (!this._commandsWrap) {
        const commandsWrap = document.createElement("div");
        commandsWrap.className = "sb-commands-wrap";
        this.appendChild(commandsWrap);
        this._commandsWrap = commandsWrap;
      }
      if (!this._editorStyle) {
        const st = document.createElement("style");
        st.textContent = `
          .sb-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45); z-index: 9999; }
          .sb-modal.open { display: flex; }
          .sb-modal__dialog { width: min(560px, 92vw); max-height: 90vh; overflow: auto; background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); color: var(--primary-text-color); border-radius: 16px; border: 1px solid var(--divider-color); padding: 16px; display: grid; gap: 12px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35); }
          .sb-modal__header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
          .sb-modal__title { font-weight: 700; font-size: 18px; }
          .sb-modal__close { border: none; background: transparent; color: inherit; cursor: pointer; font-size: 22px; line-height: 1; }
          .sb-modal__text { font-size: 15px; line-height: 1.5; opacity: 0.95; }
          .sb-modal__optout { display: flex; align-items: center; gap: 8px; font-size: 14px; }
          .sb-modal__actions { display: flex; gap: 8px; justify-content: flex-end; }
          .sb-exp { border: 1px solid var(--divider-color); border-radius: 12px; overflow: visible; }
          .sb-exp-hdr { width: 100%; display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 12px; background: var(--ha-card-background, transparent); border: 0; cursor: pointer; transition: background-color 120ms ease; }
          .sb-exp-hdr-left { display:flex; align-items:center; gap: 10px; min-width: 0; }
          .sb-exp-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .sb-exp-body { padding: 8px 12px 12px 12px; }
          .sb-exp-collapsed .sb-exp-body { display: none; }
          .sb-exp:not(.sb-exp-collapsed) > .sb-exp-hdr { background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); border-radius: 12px 12px 0 0; }
                    
          .sb-layout-title { font-weight: 600; margin: 10px 0 6px; }
          .sb-layout-card { border: 1px solid var(--divider-color); border-radius: 12px; padding: 10px; }
          .sb-layout-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; }
          .sb-layout-row-order { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 10px; }
          .sb-layout-row + .sb-layout-row { border-top: 1px solid var(--divider-color); }
          .sb-layout-actions { display: inline-flex; align-items:center; gap: 10px; }
          .sb-layout-actions-full { flex: 1; }
          .sb-layout-actions-full ha-select { width: 100%; }
          .sb-layout-note { font-size: 12px; opacity: 0.7; text-align: right; padding: 2px 0 6px; }
          .sb-icon-btn { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--divider-color); background: var(--ha-card-background, transparent); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
          .sb-icon-btn[disabled] { opacity: 0.4; cursor: default; }
          .sb-layout-footer { margin-top: 10px; display:flex; justify-content:flex-end; }
          .sb-reset-btn { border: 1px solid var(--divider-color); border-radius: 10px; padding: 6px 10px; background: transparent; cursor:pointer; }
          .sb-switch { display:flex; align-items:center; }
          .sb-styling-wrap { padding: 0 0 12px 0; }
          .sb-styling-card { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; }
          .sb-layout-switch-item { display:flex; align-items:center; gap:8px; min-width: 0; }
          .sb-layout-switch-item-empty { visibility: hidden; }
          .sb-layout-switch-label { font-size: 13px; opacity: 0.9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .sb-move-wrap { display:flex; flex-direction:row; align-items:center; gap:6px; justify-self: end; }
          .sb-commands-wrap { padding: 0 0 12px 0; }
          .sb-commands-meta { margin-bottom: 12px; }
          .sb-yaml-helper-row { display:flex; align-items:flex-start; justify-content:space-between; gap: 10px; margin-bottom: 10px; }
          .sb-yaml-helper-drag { color: var(--secondary-text-color); opacity: 0.75; padding-top: 2px; }
          .sb-yaml-helper-drag ha-icon { --mdc-icon-size: 20px; }
          .sb-yaml-helper-main { display:flex; flex-direction:column; gap: 4px; flex: 1; min-width: 0; }
          .sb-yaml-helper-label-wrap { display:flex; align-items:center; gap: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
          .sb-yaml-helper-label { line-height: 1.2; }
          .sb-yaml-helper-desc { font-size: 13px; color: var(--secondary-text-color); line-height: 1.3; }
          .sb-yaml-helper-link { color: var(--secondary-text-color); display:flex; align-items:center; justify-content:center; text-decoration:none; opacity: 0.85; }
          .sb-yaml-helper-link:hover { color: var(--primary-color); opacity: 1; }
          .sb-yaml-helper-link ha-icon { --mdc-icon-size: 16px; }
          .sb-commands-divider { height: 1px; background: var(--divider-color); margin: 12px 0 14px; }
          .sb-commands-section-title-wrap { display:flex; align-items:center; gap: 8px; margin-bottom: 2px; }
          .sb-commands-section-title { font-size: 18px; font-weight: 600; line-height: 1.2; }
          .sb-commands-section-help { color: var(--secondary-text-color); display:inline-flex; align-items:center; justify-content:center; text-decoration:none; opacity: 0.85; }
          .sb-commands-section-help:hover { color: var(--primary-color); opacity: 1; }
          .sb-commands-section-help ha-icon { --mdc-icon-size: 16px; }
          .sb-commands-section-subtitle { font-size: 13px; color: var(--secondary-text-color); margin-bottom: 10px; }
          .sb-command-sync-row { margin: 0 0 12px; border: 1px solid var(--divider-color); border-radius: 12px; padding: 10px 12px; display:flex; align-items:center; justify-content:space-between; gap: 10px; }
          .sb-command-sync-row-running { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
          .sb-command-sync-row-error { border-color: var(--error-color); background: color-mix(in srgb, var(--error-color) 10%, transparent); }
          .sb-command-sync-row-ok { border-color: color-mix(in srgb, var(--success-color, #22c55e) 70%, var(--divider-color)); background: color-mix(in srgb, var(--success-color, #22c55e) 12%, transparent); }
          .sb-command-sync-message-wrap { display:flex; align-items:center; gap: 8px; min-width: 0; }
          .sb-command-sync-message-wrap ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
          .sb-command-sync-row-ok .sb-command-sync-message-wrap ha-icon { color: var(--success-color, #22c55e); }
          .sb-command-sync-row-error .sb-command-sync-message-wrap ha-icon { color: var(--error-color); }
          .sb-command-sync-row-running .sb-command-sync-message-wrap ha-icon { color: var(--primary-color); }
          .sb-command-sync-message { font-size: 13px; color: var(--secondary-text-color); }
          .sb-command-sync-btn { border: 1px solid var(--primary-color); border-radius: 10px; min-height: 34px; padding: 0 12px; background: color-mix(in srgb, var(--primary-color) 18%, transparent); color: var(--primary-text-color); cursor: pointer; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
          .sb-command-sync-btn:hover { background: color-mix(in srgb, var(--primary-color) 28%, transparent); border-color: color-mix(in srgb, var(--primary-color) 85%, #000); }
          .sb-command-sync-btn:active { transform: translateY(1px); }
          .sb-command-sync-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 45%, transparent); }
          .sb-command-sync-btn[disabled],
          .sb-command-sync-btn.sb-command-sync-btn-static { opacity: 0.6; cursor: default; transform: none; pointer-events: none; }
          .sb-command-sync-btn.sb-command-sync-btn-static { display: inline-flex; align-items: center; }
          .sb-command-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
          .sb-command-slot-btn { position: relative; border: 1px solid var(--divider-color); border-radius: 12px; min-height: 108px; cursor: pointer; padding: 0; text-align: left; display:flex; flex-direction:column; overflow: hidden; background: var(--ha-card-background, var(--card-background-color)); }
          .sb-command-slot-btn:hover { border-color: var(--primary-color); }
          .sb-command-slot-main { position: relative; display:flex; align-items:flex-start; gap: 8px; padding: 14px 12px 10px; min-width: 0; }
                    .sb-command-slot-icon-wrap { width: 20px; min-width: 20px; min-height: 20px; display:flex; align-items:center; justify-content:center; }
          .sb-command-slot-icon-wrap ha-icon { --mdc-icon-size: 20px; color: var(--state-icon-color); }
          .sb-command-slot-name { font-weight: 700; font-size: 16px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--primary-text-color); }
          .sb-command-slot-meta { margin-top: 3px; font-size: 12px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display:flex; align-items:center; gap: 4px; }
          .sb-command-slot-favorite { color: var(--error-color); display:inline-flex; }
          .sb-command-slot-favorite ha-icon { --mdc-icon-size: 14px; }
          .sb-command-slot-meta-icon { color: var(--state-icon-color); display:inline-flex; }
          .sb-command-slot-meta-icon ha-icon { --mdc-icon-size: 14px; }
          .sb-command-slot-text-wrap { min-width: 0; padding-top: 1px; flex: 1; }
          .sb-command-slot-clear { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; min-width: 26px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); display:inline-flex; align-items:center; justify-content:center; padding: 0; cursor: pointer; z-index: 1; opacity: 0.9; }
          .sb-command-slot-clear:hover { opacity: 1; border-color: var(--primary-color); }
          .sb-command-slot-clear ha-icon { --mdc-icon-size: 16px; }
          .sb-command-slot-action-btn { margin: 0 10px 10px; border: 1px solid var(--divider-color); border-radius: 10px; min-height: 44px; width: auto; background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 14px; font-weight: 500; line-height: 1.2; text-align: left; padding: 10px 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
          .sb-command-slot-action-btn:hover { border-color: var(--primary-color); background: var(--ha-card-background, var(--card-background-color)); }
          .sb-command-slot-action-btn:active { transform: translateY(1px); }
          .sb-command-slot-action-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--primary-color); }
          .sb-command-slot-confirm { padding: 14px 12px 10px; display:flex; flex-direction:column; }
          .sb-command-slot-confirm-title { font-weight: 700; font-size: 16px; line-height: 1.15; color: var(--primary-text-color); }
          .sb-command-slot-confirm-sub { margin-top: 1px; font-size: 12px; color: var(--secondary-text-color); }
          .sb-command-slot-confirm-actions { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 10px 10px; }
          .sb-command-slot-confirm-actions .sb-command-slot-action-btn { margin: 0; text-align: center; justify-content: center; display:flex; align-items:center; }
          .sb-command-slot-empty { border-color: var(--divider-color); background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); }
          .sb-command-slot-empty .sb-command-slot-main { gap: 12px; align-items: center; justify-content: center; flex-direction: column; }
          .sb-command-slot-empty .sb-command-slot-empty-text { font-size: 64px; line-height: 1; color: var(--secondary-text-color); display:inline-flex; align-items:center; justify-content:center; opacity: 0.8; }
          .sb-command-slot-empty .sb-command-slot-name { font-size: 18px; font-weight: 500; text-align: center; color: var(--secondary-text-color); }
          .sb-command-modal { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.52); display:none; align-items:center; justify-content:center; padding: 18px; }
          .sb-command-modal.open { display:flex; }
          .sb-command-dialog { width: min(640px, 100%); max-height: min(680px, 100%); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); color: var(--primary-text-color); border-radius: 16px; border: 1px solid var(--divider-color); display:flex; flex-direction:column; overflow:hidden; box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); }
          .sb-command-dialog-header { display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--divider-color); }
          .sb-command-dialog-title { font-size: 16px; font-weight: 700; }
          .sb-command-dialog-close { border: 0; background: transparent; cursor: pointer; color: inherit; display:flex; align-items:center; justify-content:center; }
          .sb-command-dialog-body { padding: 16px; display:flex; flex-direction:column; gap: 12px; overflow:auto; }
          .sb-command-dialog-footer { display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--divider-color); }
          .sb-command-dialog-footer-note { font-size: 13px; color: var(--error-color); text-align: left; }
          .sb-command-dialog-footer-actions { display:flex; align-items:center; justify-content:flex-end; gap: 8px; margin-left: auto; }
          .sb-command-dialog-btn { border: 1px solid var(--divider-color); border-radius: 10px; min-height: 36px; padding: 0 12px; background: var(--ha-card-background, var(--card-background-color)); color: var(--primary-text-color); cursor: pointer; font-size: 14px; }
          .sb-command-dialog-btn:hover { border-color: var(--primary-color); }
          .sb-command-dialog-btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
          .sb-hub-version-warn-btn { all: unset; cursor: pointer; text-decoration: underline; display: block; }
          .sb-hub-version-chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
          .sb-hub-version-chip { border: 1px solid var(--divider-color); border-radius: 20px; padding: 4px 14px; background: transparent; color: var(--primary-text-color); cursor: pointer; font-size: 13px; }
          .sb-hub-version-chip.active { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
          .sb-command-dialog-note { border: 1px solid color-mix(in srgb, var(--info-color, var(--primary-color)) 42%, var(--divider-color)); border-radius: 12px; padding: 12px; background: color-mix(in srgb, var(--info-color, var(--primary-color)) 12%, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 13px; line-height: 1.45; display:flex; align-items:flex-start; gap:10px; }
          .sb-command-dialog-note::before { content: ""; width: 18px; height: 18px; border-radius: 50%; background: color-mix(in srgb, var(--info-color, var(--primary-color)) 22%, transparent); flex: 0 0 18px; margin-top: 1px; }
          .sb-command-config-block { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; display:flex; flex-direction:column; gap:12px; }
          .sb-command-input-row { display:flex; flex-direction:column; gap:6px; }
          .sb-command-input-label { font-size: 12px; opacity: 0.78; }
          .sb-command-name-field { width: 100%; }
          .sb-command-input-select { border: 1px solid var(--divider-color); border-radius: 999px; background: var(--ha-card-background, transparent); color: inherit; min-height: 40px; padding: 6px 12px; }
          .sb-command-checkbox { width: 100%; border: 0; background: transparent; padding: 0; display:flex; align-items:center; justify-content:space-between; gap:10px; font-size: 13px; cursor: pointer; color: inherit; }
          .sb-command-checkbox-icon { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--divider-color); background: color-mix(in srgb, var(--ha-card-background, transparent) 88%, #000); display:flex; align-items:center; justify-content:center; transition: background-color 120ms ease, border-color 120ms ease; }
          .sb-command-checkbox-icon ha-icon { --mdc-icon-size: 16px; }
          .sb-command-checkbox-left { display:flex; align-items:center; gap:10px; }
          .sb-command-checkbox.sb-command-favorite-active .sb-command-checkbox-icon { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 20%, transparent); }
          .sb-command-helper { font-size: 12px; opacity: 0.8; margin-top: 2px; }
          .sb-command-activity-chip-row { display:flex; flex-wrap:wrap; gap:8px; }
          .sb-command-activity-chip { border: 1px solid var(--divider-color); border-radius: 999px; background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 6px 12px; cursor: pointer; }
          .sb-command-activity-chip.active { background: color-mix(in srgb, var(--primary-color) 20%, transparent); border-color: var(--primary-color); }
          .sb-command-action-wrap { display:flex; flex-direction:column; gap:8px; }
          .sb-command-action-tabs { display:flex; gap:8px; }
          .sb-command-action-tab { border: 1px solid var(--divider-color); border-radius: 999px; background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 8px 12px; cursor:pointer; font: inherit; }
          .sb-command-action-tab.active { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
          .sb-command-dialog-body ha-textfield,
          .sb-command-dialog-body ha-selector { width: 100%; }
          @media (max-width: 760px) {
            .sb-command-grid { grid-template-columns: 1fr; }
          }
          @media (max-width: 700px) {
            .sb-command-modal { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
            .sb-command-dialog { width: 100%; max-height: 100%; border-radius: 0 0 16px 16px; }
            .sb-command-dialog-footer { padding-bottom: max(env(safe-area-inset-bottom), 12px); }
          }
        `;
        this.appendChild(st);
        this._editorStyle = st;
      }
    }
    this._form.schema = [
      {
        name: "entity",
        selector: {
          entity: {
            filter: [
              { domain: "remote", integration: "sofabaton_x1s" },
              { domain: "remote", integration: "sofabaton_hub" }
            ]
          }
        },
        required: true
      }
    ];
    this._form.data = {
      ...this._config,
      entity: this._config.entity || "",
      theme: this._config.theme || "",
      // Maintain the toggle state correctly
      use_background_override: this._config.use_background_override ?? !!this._config.background_override,
      background_override: this._config.background_override ?? [255, 255, 255],
      max_width: this._config.max_width ?? 360,
      group_order: this._config.group_order ?? DEFAULT_GROUP_ORDER.slice(),
      show_automation_assist: this._config.show_automation_assist ?? false
    };
    this._renderStylingOptionsEditor();
    this._renderGroupOrderEditor();
    this._renderCommandsEditor();
  }
  _renderCommandsEditor() {
    if (!this._commandsWrap || !this._hass) return;
    const entityId = String(this._config?.entity || "").trim();
    if (entityId && this._editorIntegrationEntityId !== entityId && this._editorIntegrationDetectingFor !== entityId) {
      this._ensureEditorIntegration().then(() => this._renderCommandsEditor());
    }
    if (typeof this._commandsExpanded !== "boolean") {
      this._commandsExpanded = false;
    }
    this._commandsWrap.innerHTML = "";
    const exp = document.createElement("section");
    exp.className = `sb-exp ${this._commandsExpanded ? "" : "sb-exp-collapsed"}`.trim();
    const header = document.createElement("button");
    header.type = "button";
    header.className = "sb-exp-hdr";
    header.setAttribute("aria-expanded", String(!!this._commandsExpanded));
    header.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._commandsExpanded = !this._commandsExpanded;
      this._renderCommandsEditor();
    });
    const headerLeft = document.createElement("div");
    headerLeft.className = "sb-exp-hdr-left";
    headerLeft.innerHTML = `
      <ha-icon icon="mdi:play-box-multiple-outline"></ha-icon>
      <div class="sb-exp-title">Automation Assist</div>
    `;
    const chev = document.createElement("ha-icon");
    chev.className = "sb-exp-chevron";
    chev.setAttribute(
      "icon",
      this._commandsExpanded ? "mdi:chevron-up" : "mdi:chevron-down"
    );
    header.appendChild(headerLeft);
    header.appendChild(chev);
    const body = document.createElement("div");
    body.className = "sb-exp-body";
    const meta = document.createElement("div");
    meta.className = "sb-commands-meta";
    const helperRow = document.createElement("label");
    helperRow.className = "sb-yaml-helper-row";
    const helperDrag = document.createElement("div");
    helperDrag.className = "sb-yaml-helper-drag";
    helperDrag.innerHTML = '<ha-icon icon="mdi:drag-vertical-variant"></ha-icon>';
    const helperMain = document.createElement("div");
    helperMain.className = "sb-yaml-helper-main";
    const helperLabelWrap = document.createElement("div");
    helperLabelWrap.className = "sb-yaml-helper-label-wrap";
    const helperLabel = document.createElement("span");
    helperLabel.className = "sb-yaml-helper-label";
    helperLabel.textContent = "Key capture";
    const helperDesc = document.createElement("div");
    helperDesc.className = "sb-yaml-helper-desc";
    helperDesc.textContent = "Send button presses to the hub: Capture button presses to generate ready-to-use YAML for dashboard buttons and automations.";
    const helperLink = document.createElement("a");
    helperLink.className = "sb-yaml-helper-link";
    helperLink.href = KEY_CAPTURE_HELP_URL;
    helperLink.target = "_blank";
    helperLink.rel = "noopener noreferrer";
    helperLink.title = "Learn more about Key capture";
    helperLink.setAttribute("aria-label", "Key capture documentation");
    helperLink.innerHTML = '<ha-icon icon="mdi:help-circle-outline"></ha-icon>';
    helperLink.addEventListener("click", (ev) => ev.stopPropagation());
    helperLabelWrap.appendChild(helperLabel);
    helperLabelWrap.appendChild(helperLink);
    helperMain.appendChild(helperLabelWrap);
    helperMain.appendChild(helperDesc);
    const helperSwitch = document.createElement("ha-switch");
    helperSwitch.checked = !!this._config.show_automation_assist;
    helperSwitch.addEventListener("change", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._setAutomationAssistEnabled(!!helperSwitch.checked);
    });
    helperLabelWrap.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      helperSwitch.checked = !helperSwitch.checked;
      this._setAutomationAssistEnabled(!!helperSwitch.checked);
    });
    helperRow.appendChild(helperDrag);
    helperRow.appendChild(helperMain);
    helperRow.appendChild(helperSwitch);
    meta.appendChild(helperRow);
    const divider = document.createElement("div");
    divider.className = "sb-commands-divider";
    meta.appendChild(divider);
    const sectionTitle = document.createElement("div");
    sectionTitle.className = "sb-commands-section-title";
    sectionTitle.textContent = "Wifi Commands Moved";
    meta.appendChild(sectionTitle);
    const sectionSub = document.createElement("div");
    sectionSub.className = "sb-commands-section-subtitle";
    sectionSub.textContent = "Wifi Commands are no longer configured from the Sofabaton Virtual Remote. Open the Sofabaton Control Panel card to manage this feature.";
    meta.appendChild(sectionSub);
    body.appendChild(meta);
    exp.appendChild(header);
    exp.appendChild(body);
    this._commandsWrap.appendChild(exp);
  }
  _layoutSelectionKey() {
    return this._layoutSelection ?? "default";
  }
  _syncLayoutSelectionWithPreview() {
    const preview = this._previewActivity;
    if (preview == null || preview === "" || preview === "powered_off") {
      this._layoutSelection = "default";
      return;
    }
    this._layoutSelection = String(preview);
  }
  _layoutHasCustomOverride(selection) {
    return layoutHasCustomOverride(this._config, selection);
  }
  _layoutSelectionNote() {
    return layoutSelectionNote(this._config, this._layoutSelectionKey());
  }
  _setPreviewActivityForSelection(selection) {
    const nextPreview = selection === "default" ? "" : String(selection);
    if (this._previewActivity === nextPreview) return;
    this._previewActivity = nextPreview;
    writePreviewActivity(this._config?.entity, nextPreview);
    window.dispatchEvent(
      new CustomEvent("sofabaton-preview-activity", {
        detail: { entity: this._config?.entity, previewActivity: nextPreview }
      })
    );
  }
  _editorActivities() {
    const entityId = this._config?.entity;
    if (!entityId || !this._hass) return [];
    return editorActivitiesFromState(this._hass?.states?.[entityId]);
  }
  _layoutConfigForSelection() {
    return layoutConfigForSelection(this._config, this._layoutSelectionKey());
  }
  _updateLayoutConfig(patch) {
    const selection = this._layoutSelectionKey();
    const { nextConfig, syncFormPatch } = applyLayoutConfigPatch(
      this._config,
      selection,
      patch
    );
    this._config = nextConfig;
    if (syncFormPatch) this._syncFormData(syncFormPatch);
    this._fireChanged();
    this._renderGroupOrderEditor();
  }
  _groupOrderListForEditor() {
    return groupOrderListForEditor(this._config, this._layoutSelectionKey());
  }
  _groupLabel(key) {
    return groupLabel(key);
  }
  _isGroupEnabled(key) {
    return isGroupEnabled(this._config, this._layoutSelectionKey(), key);
  }
  _macroEnabled(cfg = this._layoutConfigForSelection()) {
    return cfg === void 0 ? macroEnabled(this._config, this._layoutSelectionKey()) : macrosButtonEnabled(cfg);
  }
  _favoritesEnabled(cfg = this._layoutConfigForSelection()) {
    return cfg === void 0 ? favoritesEnabled(this._config, this._layoutSelectionKey()) : favoritesButtonEnabled(cfg);
  }
  _volumeEnabled(cfg = this._layoutConfigForSelection()) {
    return cfg === void 0 ? volumeEnabled(this._config, this._layoutSelectionKey()) : volumeGroupEnabled(cfg);
  }
  _channelEnabled(cfg = this._layoutConfigForSelection()) {
    return cfg === void 0 ? channelEnabled(this._config, this._layoutSelectionKey()) : channelGroupEnabled(cfg);
  }
  _mediaEnabled(cfg = this._layoutConfigForSelection()) {
    return cfg === void 0 ? mediaEnabled(this._config, this._layoutSelectionKey()) : mediaGroupEnabled(cfg);
  }
  _dvrEnabled(cfg = this._layoutConfigForSelection()) {
    return cfg === void 0 ? dvrEnabled(this._config, this._layoutSelectionKey()) : dvrGroupEnabled(cfg);
  }
  _syncFormData(patch) {
    if (!this._form) return;
    this._form.data = { ...this._form.data || {}, ...patch || {} };
  }
  _setMacroEnabled(enabled) {
    this._updateLayoutConfig(
      macroTogglePatch(this._config, this._layoutSelectionKey(), enabled)
    );
  }
  _setFavoritesEnabled(enabled) {
    this._updateLayoutConfig(
      favoritesTogglePatch(this._config, this._layoutSelectionKey(), enabled)
    );
  }
  _setVolumeEnabled(enabled) {
    this._updateLayoutConfig(
      volumeTogglePatch(this._config, this._layoutSelectionKey(), enabled)
    );
  }
  _setChannelEnabled(enabled) {
    this._updateLayoutConfig(
      channelTogglePatch(this._config, this._layoutSelectionKey(), enabled)
    );
  }
  _setDvrEnabled(enabled) {
    this._updateLayoutConfig(dvrTogglePatch(enabled));
  }
  _setGroupEnabled(key, enabled) {
    const patch = groupEnabledPatch(key, enabled);
    if (patch) this._updateLayoutConfig(patch);
  }
  _setAutomationAssistEnabled(enabled) {
    const next = { ...this._config, show_automation_assist: !!enabled };
    this._config = next;
    this._syncFormData(next);
    this._fireChanged();
  }
  _renderStylingOptionsEditor() {
    if (!this._stylingWrap || !this._hass) return;
    if (typeof this._stylingExpanded !== "boolean")
      this._stylingExpanded = false;
    const showColorPicker = this._config.use_background_override || !!this._config.background_override;
    this._stylingWrap.innerHTML = "";
    const exp = document.createElement("div");
    exp.className = `sb-exp ${this._stylingExpanded ? "" : "sb-exp-collapsed"}`.trim();
    const hdr = document.createElement("button");
    hdr.type = "button";
    hdr.className = "sb-exp-hdr";
    hdr.setAttribute("aria-expanded", String(!!this._stylingExpanded));
    hdr.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._stylingExpanded = !this._stylingExpanded;
      this._renderStylingOptionsEditor();
    });
    const hdrLeft = document.createElement("div");
    hdrLeft.className = "sb-exp-hdr-left";
    const hdrIcon = document.createElement("ha-icon");
    hdrIcon.setAttribute("icon", "mdi:palette");
    const hdrTitle = document.createElement("div");
    hdrTitle.className = "sb-exp-title";
    hdrTitle.textContent = "Styling Options";
    hdrLeft.appendChild(hdrIcon);
    hdrLeft.appendChild(hdrTitle);
    const chev = document.createElement("ha-icon");
    chev.className = "sb-exp-chevron";
    chev.setAttribute(
      "icon",
      this._stylingExpanded ? "mdi:chevron-up" : "mdi:chevron-down"
    );
    hdr.appendChild(hdrLeft);
    hdr.appendChild(chev);
    exp.appendChild(hdr);
    const body = document.createElement("div");
    body.className = "sb-exp-body";
    const card = document.createElement("div");
    card.className = "sb-styling-card";
    const form = document.createElement("ha-form");
    form.hass = this._hass;
    form.computeLabel = (schema) => {
      const labels = {
        theme: "Apply a theme to the card",
        max_width: "Maximum Card Width (px)",
        use_background_override: "Customize background color",
        background_override: "Select Background Color"
      };
      return labels[schema.name] || schema.name;
    };
    form.schema = [
      { name: "theme", selector: { theme: {} } },
      {
        name: "max_width",
        selector: {
          number: {
            min: 230,
            max: 1200,
            step: 5,
            unit_of_measurement: "px"
          }
        }
      },
      { name: "use_background_override", selector: { boolean: {} } },
      ...showColorPicker ? [{ name: "background_override", selector: { color_rgb: {} } }] : []
    ];
    form.data = {
      theme: this._config.theme || "",
      max_width: this._config.max_width ?? 360,
      use_background_override: this._config.use_background_override ?? !!this._config.background_override,
      background_override: this._config.background_override ?? [255, 255, 255]
    };
    form.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const newValue = { ...this._config, ...ev.detail.value };
      if (newValue.use_background_override === false) {
        delete newValue.background_override;
      }
      if (JSON.stringify(this._config) === JSON.stringify(newValue)) return;
      this._config = newValue;
      this._syncFormData(newValue);
      this._fireChanged();
      this._renderStylingOptionsEditor();
    });
    card.appendChild(form);
    body.appendChild(card);
    exp.appendChild(body);
    this._stylingWrap.appendChild(exp);
  }
  _renderGroupOrderEditor() {
    if (!this._layoutWrap) return;
    if (typeof this._layoutExpanded !== "boolean") this._layoutExpanded = false;
    this._layoutWrap.innerHTML = "";
    const exp = document.createElement("div");
    exp.className = `sb-exp ${this._layoutExpanded ? "" : "sb-exp-collapsed"}`.trim();
    const hdr = document.createElement("button");
    hdr.type = "button";
    hdr.className = "sb-exp-hdr";
    hdr.setAttribute("aria-expanded", String(!!this._layoutExpanded));
    hdr.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._layoutExpanded = !this._layoutExpanded;
      this._renderGroupOrderEditor();
    });
    const hdrLeft = document.createElement("div");
    hdrLeft.className = "sb-exp-hdr-left";
    const hdrIcon = document.createElement("ha-icon");
    hdrIcon.setAttribute("icon", "mdi:sort");
    const hdrTitle = document.createElement("div");
    hdrTitle.className = "sb-exp-title";
    hdrTitle.textContent = "Layout Options";
    hdrLeft.appendChild(hdrIcon);
    hdrLeft.appendChild(hdrTitle);
    const chev = document.createElement("ha-icon");
    chev.className = "sb-exp-chevron";
    chev.setAttribute(
      "icon",
      this._layoutExpanded ? "mdi:chevron-up" : "mdi:chevron-down"
    );
    hdr.appendChild(hdrLeft);
    hdr.appendChild(chev);
    const body = document.createElement("div");
    body.className = "sb-exp-body";
    const activities = this._editorActivities();
    const selectionOptions = [
      { value: "default", label: "Default layout" },
      ...activities.map((activity) => ({
        value: String(activity.id),
        label: activity.name
      }))
    ];
    const selectionValues = new Set(
      selectionOptions.map((option) => option.value)
    );
    if (!selectionValues.has(this._layoutSelectionKey())) {
      this._layoutSelection = "default";
    }
    const order = this._groupOrderListForEditor();
    const card = document.createElement("div");
    card.className = "sb-layout-card";
    const selectRow = document.createElement("div");
    selectRow.className = "sb-layout-row";
    const selectActions = document.createElement("div");
    selectActions.className = "sb-layout-actions sb-layout-actions-full";
    const layoutSelect = document.createElement("ha-select");
    layoutSelect.fixedMenuPosition = true;
    layoutSelect.label = "Layout";
    layoutSelect.hass = this._hass;
    this._setSelectValueCompat(
      layoutSelect,
      this._layoutSelectionKey(),
      selectionOptions
    );
    layoutSelect.innerHTML = "";
    selectionOptions.forEach((option) => {
      const item = document.createElement(this._selectItemTagName());
      item.value = option.value;
      item.textContent = option.label;
      layoutSelect.appendChild(item);
    });
    const handleLayoutSelect = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation?.();
      const selected = ev?.detail?.value ?? ev?.target?.value ?? layoutSelect.value;
      const nextSelection = selectionValues.has(selected) ? selected : "default";
      if (nextSelection === this._layoutSelectionKey()) return;
      this._layoutSelection = nextSelection;
      this._setPreviewActivityForSelection(nextSelection);
      this._renderGroupOrderEditor();
    };
    layoutSelect.addEventListener("selected", handleLayoutSelect);
    layoutSelect.addEventListener("change", handleLayoutSelect);
    this._selectCloseEvents().forEach((eventName) => {
      layoutSelect.addEventListener(eventName, (ev) => {
        ev.stopPropagation();
      });
    });
    selectActions.appendChild(layoutSelect);
    selectRow.appendChild(selectActions);
    card.appendChild(selectRow);
    const note = document.createElement("div");
    note.className = "sb-layout-note";
    note.textContent = this._layoutSelectionNote();
    card.appendChild(note);
    const isEditorX2 = this._isEditorX2();
    const visibleOrder = order.filter(
      (key) => this._isEditorGroupVisible(key, isEditorX2)
    );
    visibleOrder.forEach((key, i) => {
      const row = document.createElement("div");
      row.className = "sb-layout-row sb-layout-row-order";
      const mkIconBtn = (icon, aria, disabled, onClick) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sb-icon-btn";
        btn.disabled = !!disabled;
        btn.setAttribute("aria-label", aria);
        const ic = document.createElement("ha-icon");
        ic.setAttribute("icon", icon);
        btn.appendChild(ic);
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          if (btn.disabled) return;
          onClick();
        });
        return btn;
      };
      const upBtn = mkIconBtn(
        "mdi:chevron-up",
        `Move ${this._groupLabel(key)} up`,
        i === 0,
        () => this._moveGroupByKey(key, -1, isEditorX2)
      );
      const downBtn = mkIconBtn(
        "mdi:chevron-down",
        `Move ${this._groupLabel(key)} down`,
        i === visibleOrder.length - 1,
        () => this._moveGroupByKey(key, 1, isEditorX2)
      );
      const moveWrap = document.createElement("div");
      moveWrap.className = "sb-move-wrap";
      moveWrap.appendChild(upBtn);
      moveWrap.appendChild(downBtn);
      const makeItem = (text, checked, onSet) => {
        const item = document.createElement("div");
        item.className = "sb-layout-switch-item";
        const sw = document.createElement("ha-switch");
        sw.checked = !!checked;
        sw.addEventListener("change", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          onSet(!!sw.checked);
        });
        item.appendChild(sw);
        const t = document.createElement("div");
        t.className = "sb-layout-switch-label";
        t.textContent = text;
        item.appendChild(t);
        return item;
      };
      if (key === "macro_favorites") {
        row.appendChild(
          makeItem(
            "Macros",
            this._macroEnabled(),
            (val) => this._setMacroEnabled(val)
          )
        );
        row.appendChild(
          makeItem(
            "Favorites",
            this._favoritesEnabled(),
            (val) => this._setFavoritesEnabled(val)
          )
        );
        row.appendChild(moveWrap);
      } else if (key === "mid") {
        row.appendChild(
          makeItem(
            "Volume",
            this._volumeEnabled(),
            (val) => this._setVolumeEnabled(val)
          )
        );
        row.appendChild(
          makeItem(
            "Channel",
            this._channelEnabled(),
            (val) => this._setChannelEnabled(val)
          )
        );
        row.appendChild(moveWrap);
      } else if (key === "media") {
        row.appendChild(
          makeItem(
            "Media Controls",
            this._mediaEnabled(),
            (val) => this._setGroupEnabled("media", val)
          )
        );
        if (isEditorX2) {
          row.appendChild(
            makeItem(
              "DVR",
              this._dvrEnabled(),
              (val) => this._setDvrEnabled(val)
            )
          );
        } else {
          const emptySlot = document.createElement("div");
          emptySlot.className = "sb-layout-switch-item sb-layout-switch-item-empty";
          emptySlot.setAttribute("aria-hidden", "true");
          row.appendChild(emptySlot);
        }
        row.appendChild(moveWrap);
      } else {
        row.appendChild(
          makeItem(
            this._groupLabel(key),
            this._isGroupEnabled(key),
            (val) => this._setGroupEnabled(key, val)
          )
        );
        const emptySlot = document.createElement("div");
        emptySlot.className = "sb-layout-switch-item sb-layout-switch-item-empty";
        emptySlot.setAttribute("aria-hidden", "true");
        row.appendChild(emptySlot);
        row.appendChild(moveWrap);
      }
      card.appendChild(row);
    });
    const footer = document.createElement("div");
    footer.className = "sb-layout-footer";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "sb-reset-btn";
    reset.textContent = this._layoutSelectionKey() === "default" ? "Reset to card default" : "Reset to default layout";
    reset.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this._resetGroupOrder();
    });
    footer.appendChild(reset);
    card.appendChild(footer);
    body.appendChild(card);
    exp.appendChild(hdr);
    exp.appendChild(body);
    this._layoutWrap.appendChild(exp);
  }
  _isEditorGroupVisible(key, isEditorX2 = this._isEditorX2()) {
    if (!isEditorX2 && key === "abc") return false;
    return true;
  }
  _moveGroupByKey(groupKey, delta, isEditorX2 = this._isEditorX2()) {
    const order = this._groupOrderListForEditor();
    const visibleOrder = order.filter(
      (key) => this._isEditorGroupVisible(key, isEditorX2)
    );
    const fromVisible = visibleOrder.indexOf(String(groupKey));
    if (fromVisible < 0) return;
    const toVisible = fromVisible + Number(delta);
    if (toVisible < 0 || toVisible >= visibleOrder.length) return;
    const toKey = visibleOrder[toVisible];
    const from = order.indexOf(String(groupKey));
    const to = order.indexOf(toKey);
    if (from < 0 || to < 0) return;
    const next = order.slice();
    const tmp = next[from];
    next[from] = next[to];
    next[to] = tmp;
    this._updateLayoutConfig({ group_order: next });
  }
  _resetGroupOrder() {
    const selection = this._layoutSelectionKey();
    if (selection !== "default") {
      const next2 = { ...this._config };
      const layouts = { ...next2.layouts || {} };
      delete layouts[selection];
      if (Number.isFinite(Number(selection))) {
        delete layouts[Number(selection)];
      }
      if (Object.keys(layouts).length) {
        next2.layouts = layouts;
      } else {
        delete next2.layouts;
      }
      this._config = next2;
      this._fireChanged();
      this._renderGroupOrderEditor();
      return;
    }
    const nextOrder = DEFAULT_GROUP_ORDER.slice();
    const enabledDefaults = {
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_volume: true,
      show_channel: true,
      show_media: true,
      show_colors: true,
      show_abc: true,
      show_dvr: true,
      show_macros_button: true,
      show_favorites_button: true,
      group_order: nextOrder
    };
    const next = { ...this._config };
    const defaultLayout = next.layouts?.default;
    if (defaultLayout && typeof defaultLayout === "object") {
      next.layouts = {
        ...next.layouts || {},
        default: { ...defaultLayout, ...enabledDefaults }
      };
    } else {
      Object.assign(next, enabledDefaults);
    }
    this._config = next;
    if (this._form) {
      this._form.data = {
        ...this._form.data || {},
        ...enabledDefaults
      };
    }
    this._fireChanged();
    this._renderGroupOrderEditor();
  }
  _fireChanged() {
    const finalConfig = { ...this._config };
    delete finalConfig.use_background_override;
    delete finalConfig.preview_activity;
    delete finalConfig.commands;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: finalConfig },
        bubbles: true,
        composed: true
      })
    );
  }
};
if (!customElements.get(EDITOR))
  customElements.define(EDITOR, SofabatonRemoteCardEditor);
if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === TYPE)) {
  window.customCards.push({
    type: TYPE,
    name: "Sofabaton Virtual Remote",
    description: "A configurable remote for the Sofabaton X1, X1S and X2 integration."
  });
}
