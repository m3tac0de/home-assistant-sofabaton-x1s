export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hasOwn(obj: any, key: any) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

export function initHubRuntimeState(requestSeen: any, queue: any) {
  return {
    requestSeen: requestSeen || {},
    queue: Array.isArray(queue) ? queue : [],
  };
}

export function markHubRequested(requestSeen: Record<string, boolean>, key: string) {
  if (!key) return requestSeen;
  requestSeen[key] = true;
  return requestSeen;
}

export function wasHubRequested(requestSeen: Record<string, boolean>, key: string) {
  return Boolean(key && requestSeen[key]);
}

export function enqueueHubCommand(
  queue: any[],
  list: any[],
  { priority = false, gapMs = 150 } = {},
) {
  const item = { list, gapMs: Number(gapMs) };
  if (priority) {
    queue.unshift(item);
  } else {
    queue.push(item);
  }
  return queue;
}

export function throttleHubRequest(
  cache: Record<string, number>,
  key: string,
  minIntervalMs = 3000,
  now = Date.now(),
) {
  const last = cache[key] || 0;
  if (now - last < minIntervalMs) return false;
  cache[key] = now;
  return true;
}

export function basicDataRequestKey(entityId: string) {
  return `req:basic:${entityId}`;
}

export function requestBasicDataCommand() {
  return ["type:request_basic_data"];
}

export function requestAssignedKeysCommand(activityId: unknown) {
  if (activityId == null) return null;
  return ["type:request_assigned_keys", `activity_id:${Number(activityId)}`];
}

export function requestFavoriteKeysCommand(activityId: unknown) {
  if (activityId == null) return null;
  return ["type:request_favorite_keys", `activity_id:${Number(activityId)}`];
}

export function requestMacroKeysCommand(activityId: unknown) {
  if (activityId == null) return null;
  return ["type:request_macro_keys", `activity_id:${Number(activityId)}`];
}

export function startActivityCommand(activityId: unknown) {
  if (activityId == null) return null;
  return ["type:start_activity", `activity_id:${Number(activityId)}`];
}

export function stopActivityCommand(activityId: unknown) {
  if (activityId == null) return null;
  return ["type:stop_activity", `activity_id:${Number(activityId)}`];
}
