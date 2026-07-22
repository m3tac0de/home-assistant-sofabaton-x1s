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
