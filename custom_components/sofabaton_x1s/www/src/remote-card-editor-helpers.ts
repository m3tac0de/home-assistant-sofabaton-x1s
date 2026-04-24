import {
  DEFAULT_KEY_LABELS,
  HARD_BUTTON_ID_MAP,
  X2_ONLY_HARD_BUTTON_IDS,
} from "./remote-card-layout";

export function normalizeCustomFavorite(item: any, idx = 0) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name ?? item.label ?? "").trim();
  if (!name) return null;

  const icon =
    item.icon != null && String(item.icon).trim()
      ? String(item.icon).trim()
      : null;

  const action =
    item.action && typeof item.action === "object"
      ? item.action
      : item.tap_action && typeof item.tap_action === "object"
        ? item.tap_action
        : null;

  const rawCmd =
    item.command_id ??
    item.key_id ??
    item.command ??
    item.key ??
    item.id ??
    null;
  const rawDev =
    item.device_id ??
    item.activity_id ??
    item.device ??
    item.activity ??
    null;

  const cmd = rawCmd != null ? Number(rawCmd) : null;
  const dev = rawDev != null ? Number(rawDev) : null;

  const hasIds =
    Number.isFinite(cmd) && (rawDev == null || Number.isFinite(dev));
  const hasAction = !!(
    action &&
    (action.action ||
      action.service ||
      action.perform_action ||
      action.navigation_path ||
      action.url_path)
  );

  if (!hasIds && !hasAction) return null;

  return {
    __custom: true,
    name,
    icon,
    action: hasAction ? action : null,
    command_id: Number.isFinite(cmd) ? cmd : null,
    device_id: Number.isFinite(dev) ? dev : null,
    _idx: idx,
    _raw: item,
  };
}

export function customFavoritesSignature(items: any[]) {
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

export function normalizeCommandAction(action: any) {
  const defaultAction = { action: "perform-action" };
  if (Array.isArray(action)) {
    const first = action.find((item) => item && typeof item === "object");
    const normalized = first || defaultAction;
    return normalized?.action
      ? normalized
      : { ...normalized, ...defaultAction };
  }
  if (action && typeof action === "object") {
    return action?.action ? action : { ...action, ...defaultAction };
  }
  return defaultAction;
}

export function commandSlotDefault(idx: number) {
  return {
    name: `Command ${idx + 1}`,
    add_as_favorite: true,
    hard_button: "",
    long_press_enabled: false,
    activities: [],
    action: { action: "perform-action" },
    long_press_action: { action: "perform-action" },
  };
}

export function normalizeCommandsForStorage(
  nextCommands: any[],
  sanitizeCommandName: (name: string) => string,
) {
  return Array.from({ length: 10 }, (_, idx) => {
    const item = nextCommands?.[idx] || {};
    return {
      ...commandSlotDefault(idx),
      name: sanitizeCommandName(item.name ?? `Command ${idx + 1}`),
      add_as_favorite:
        item?.add_as_favorite === undefined
          ? commandSlotDefault(idx).add_as_favorite
          : Boolean(item.add_as_favorite),
      hard_button: String(item.hard_button ?? ""),
      long_press_enabled:
        Boolean(item.long_press_enabled) && Boolean(String(item.hard_button ?? "")),
      activities: Array.isArray(item.activities)
        ? item.activities.map((id) => String(id)).filter((id) => id !== "")
        : [],
      action: normalizeCommandAction(item.action),
      long_press_action: normalizeCommandAction(item.long_press_action),
    };
  });
}

export function editorHardButtonOptions() {
  const group = (keys: string[], title: string) =>
    keys
      .filter((key) => DEFAULT_KEY_LABELS[key])
      .map((key) => ({
        value: key,
        label: `${title} • ${DEFAULT_KEY_LABELS[key]}`,
      }));

  return [
    ...group(
      ["up", "down", "left", "right", "ok", "back", "home", "menu"],
      "Navigation",
    ),
    ...group(["volup", "voldn", "mute", "chup", "chdn"], "Transport"),
    ...group(
      ["play", "pause", "rew", "fwd", "guide", "dvr", "exit"],
      "Media",
    ),
    ...group(["a", "b", "c"], "ABC"),
    ...group(["red", "green", "yellow", "blue"], "Color"),
  ];
}

export function editorAvailableHardButtonOptions(showX2Keys: boolean) {
  return editorHardButtonOptions().filter((option) => {
    const key = String(option?.value || "");
    const id = HARD_BUTTON_ID_MAP[key];
    if (!Number.isFinite(id)) return false;
    if (X2_ONLY_HARD_BUTTON_IDS.has(id) && !showX2Keys) return false;
    return true;
  });
}
