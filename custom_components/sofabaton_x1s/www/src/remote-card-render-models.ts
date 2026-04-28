export function drawerCommandType(type: string) {
  if (type === "macros") return "macro";
  if (type === "favorites") return "favorite";
  return "assigned";
}

export function drawerButtonModel(
  item: any,
  type: string,
  fallbackDeviceId: unknown,
) {
  return {
    label: item?.name || "Unknown",
    commandId: Number(item?.command_id ?? item?.id),
    deviceId: Number(item?.device_id ?? item?.device ?? fallbackDeviceId),
    icon: item?.icon ? String(item.icon) : null,
    commandType: drawerCommandType(type),
  };
}

export function customFavoriteButtonModel(
  favorite: any,
  fallbackDeviceId: unknown,
) {
  const commandId = Number(favorite?.command_id);
  const explicitDeviceId =
    favorite?.device_id != null ? Number(favorite.device_id) : null;
  const deviceId =
    explicitDeviceId != null ? explicitDeviceId : Number(fallbackDeviceId);
  return {
    label: String(favorite?.name ?? "Favorite"),
    icon: favorite?.icon ? String(favorite.icon) : null,
    action: favorite?.action ?? null,
    commandId,
    deviceId,
  };
}

export function actionButtonModel({
  label,
  icon,
  extraClass = "",
}: {
  label?: string;
  icon?: string | null;
  extraClass?: string;
}) {
  return {
    wrapClassName: `macroFavoritesButton ${extraClass}`.trim(),
    buttonConfig: {
      type: "button",
      show_name: true,
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || undefined,
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    },
  };
}

export function huiButtonModel({
  label,
  icon,
  extraClass = "",
  size = "normal",
}: {
  label?: string;
  icon?: string | null;
  extraClass?: string;
  size?: string;
}) {
  return {
    wrapClassName: `key key--${size} ${extraClass}`.trim(),
    buttonConfig: {
      type: "button",
      show_name: Boolean(label),
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || undefined,
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    },
  };
}

export function colorKeyModel(color: string) {
  return {
    wrapClassName: "key key--color",
    color,
    buttonConfig: {
      type: "button",
      show_name: false,
      show_icon: false,
      tap_action: {
        action: "none",
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    },
  };
}
