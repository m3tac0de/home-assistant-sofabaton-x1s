export function hubAssignedKeyCommand(activityId: unknown, commandId: unknown) {
  const activity = Number(activityId);
  const key = Number(commandId);
  if (!Number.isFinite(activity) || !Number.isFinite(key)) return null;
  return [
    "type:send_assigned_key",
    `activity_id:${activity}`,
    `key_id:${key}`,
  ];
}

export function hubMacroKeyCommand(activityId: unknown, commandId: unknown) {
  const activity = Number(activityId);
  const key = Number(commandId);
  if (!Number.isFinite(activity) || !Number.isFinite(key)) return null;
  return [
    "type:send_macro_key",
    `activity_id:${activity}`,
    `key_id:${key}`,
  ];
}

export function hubFavoriteKeyCommand(deviceId: unknown, commandId: unknown) {
  const device = Number(deviceId);
  const key = Number(commandId);
  if (!Number.isFinite(device) || !Number.isFinite(key)) return null;
  return [
    "type:send_favorite_key",
    `device_id:${device}`,
    `key_id:${key}`,
  ];
}

export function remoteSendCommandData(
  entityId: string,
  commandId: unknown,
  deviceId: unknown,
) {
  const command = Number(commandId);
  const device = Number(deviceId);
  if (!entityId || !Number.isFinite(command) || !Number.isFinite(device)) return null;
  return {
    entity_id: entityId,
    command,
    device,
  };
}
