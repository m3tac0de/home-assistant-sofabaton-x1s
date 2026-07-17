import type {
  BackupBundlePayload,
  BackupOperationStateResponse,
  BackupOperationStartResponse,
  BackupProgressEvent,
  BackupRestoreResult,
  CacheContentsResponse,
  ControlPanelStateResponse,
  BlobFetchResponse,
  BlobPlayResponse,
  HassLike,
  HubAction,
  LogsResponse,
  RefreshKind,
  SettingKey,
} from "../ha-context";

export class ControlPanelApi {
  constructor(private readonly hass: HassLike) {}

  loadState() {
    return this.hass.callWS<ControlPanelStateResponse>({
      type: "sofabaton_x1s/control_panel/state",
    });
  }

  loadCacheContents() {
    return this.hass.callWS<CacheContentsResponse>({
      type: "sofabaton_x1s/persistent_cache/contents",
    });
  }

  setSetting(entryId: string, setting: SettingKey, enabled: boolean) {
    return this.hass.callWS({
      type: "sofabaton_x1s/control_panel/set_setting",
      entry_id: entryId,
      setting,
      enabled,
    });
  }

  runAction(entryId: string, action: HubAction) {
    return this.hass.callWS({
      type: "sofabaton_x1s/control_panel/run_action",
      entry_id: entryId,
      action,
    });
  }

  fetchBlob(entryId: string, deviceId: number, commandId?: number | null) {
    return this.hass.callWS<BlobFetchResponse>({
      type: "sofabaton_x1s/blobs/fetch",
      entry_id: entryId,
      device_id: deviceId,
      ...(commandId != null ? { command_id: commandId } : {}),
    });
  }

  playIrBlob(entryId: string, blob: string) {
    return this.hass.callWS<BlobPlayResponse>({
      type: "sofabaton_x1s/blobs/play",
      entry_id: entryId,
      blob,
    });
  }

  startBackupExport(entryId: string, deviceIds?: number[] | null) {
    return this.hass.callWS<BackupOperationStartResponse>({
      type: "sofabaton_x1s/backup/export",
      entry_id: entryId,
      ...(deviceIds?.length ? { device_ids: deviceIds } : {}),
    });
  }

  startActivitySync(
    entryId: string,
    activityId: number,
    baseline: BackupBundlePayload,
    edited: BackupBundlePayload,
  ) {
    return this.hass.callWS<BackupOperationStartResponse>({
      type: "sofabaton_x1s/activity/sync",
      entry_id: entryId,
      activity_id: activityId,
      baseline,
      edited,
    });
  }

  activitySyncPlan(
    entryId: string,
    activityId: number,
    baseline: BackupBundlePayload,
    edited: BackupBundlePayload,
  ) {
    return this.hass.callWS<{ step_count: number; steps: Array<{ kind: string; label: string }> }>({
      type: "sofabaton_x1s/activity/sync_plan",
      entry_id: entryId,
      activity_id: activityId,
      baseline,
      edited,
    });
  }

  startDeviceSync(
    entryId: string,
    deviceId: number,
    baseline: BackupBundlePayload,
    edited: BackupBundlePayload,
  ) {
    return this.hass.callWS<BackupOperationStartResponse>({
      type: "sofabaton_x1s/device/sync",
      entry_id: entryId,
      device_id: deviceId,
      baseline,
      edited,
    });
  }

  deviceSyncPlan(
    entryId: string,
    deviceId: number,
    baseline: BackupBundlePayload,
    edited: BackupBundlePayload,
  ) {
    return this.hass.callWS<{ step_count: number; steps: Array<{ kind: string; label: string }> }>({
      type: "sofabaton_x1s/device/sync_plan",
      entry_id: entryId,
      device_id: deviceId,
      baseline,
      edited,
    });
  }

  // Immediate live delete of a whole activity/device from the hub. Both wrap
  // the id-generic hub delete primitive; separate types keep the id range and
  // validation explicit per entity kind.
  deleteActivity(entryId: string, activityId: number) {
    return this.hass.callWS<{ status?: string }>({
      type: "sofabaton_x1s/activity/delete",
      entry_id: entryId,
      activity_id: activityId,
    });
  }

  deleteDevice(entryId: string, deviceId: number) {
    return this.hass.callWS<{ status?: string }>({
      type: "sofabaton_x1s/device/delete",
      entry_id: entryId,
      device_id: deviceId,
    });
  }

  // Immediate live write of the hub's stored activity display order.
  // ordered_ids is the full activity id list in the desired order.
  reorderActivities(entryId: string, orderedIds: number[]) {
    return this.hass.callWS<{ status?: string; ordered_ids?: number[] }>({
      type: "sofabaton_x1s/activity/reorder",
      entry_id: entryId,
      ordered_ids: orderedIds,
    });
  }

  // Immediate live write of the hub's stored device display order.
  // ordered_ids is the full device id list in the desired order.
  reorderDevices(entryId: string, orderedIds: number[]) {
    return this.hass.callWS<{ status?: string; ordered_ids?: number[] }>({
      type: "sofabaton_x1s/device/reorder",
      entry_id: entryId,
      ordered_ids: orderedIds,
    });
  }

  // Create a fresh, empty activity on the hub; resolves with the
  // hub-assigned activity id so the caller can open the live editor on it.
  createActivity(entryId: string, name: string) {
    return this.hass.callWS<{ status?: string; activity_id?: number }>({
      type: "sofabaton_x1s/activity/create",
      entry_id: entryId,
      name,
    });
  }

  startCacheRefresh(entryId: string) {
    return this.hass.callWS<BackupOperationStartResponse>({
      type: "sofabaton_x1s/cache/refresh_all",
      entry_id: entryId,
    });
  }

  getStructuralBundle(entryId: string) {
    return this.hass.callWS<{ bundle: BackupBundlePayload | null; generation: number | null }>({
      type: "sofabaton_x1s/cache/structural_bundle",
      entry_id: entryId,
    });
  }

  stashEditedBackup(entryId: string, backup: BackupBundlePayload, filename: string) {
    return this.hass.callWS<{ operation_id: string }>({
      type: "sofabaton_x1s/backup/stash_edited",
      entry_id: entryId,
      backup,
      filename,
    });
  }

  startBackupRestore(entryId: string, backup: BackupBundlePayload, mode: "replace" | "merge") {
    return this.hass.callWS<BackupOperationStartResponse>({
      type: "sofabaton_x1s/backup/restore",
      entry_id: entryId,
      backup,
      mode,
    });
  }

  subscribeBackupProgress(operationId: string, onMessage: (payload: BackupProgressEvent) => void) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error("Backup progress is unavailable without a websocket connection"));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/backup/progress_subscribe", operation_id: operationId },
    );
  }

  getBackupState(entryId: string) {
    return this.hass.callWS<BackupOperationStateResponse>({
      type: "sofabaton_x1s/backup/state",
      entry_id: entryId,
    });
  }

  getWifiCommandDevices(entityId: string) {
    return this.hass.callWS<{ devices?: Array<Record<string, unknown>>; max_devices?: number }>({
      type: "sofabaton_x1s/command_devices/list",
      entity_id: entityId,
    });
  }

  clearBackupResult(operationId: string) {
    return this.hass.callWS<{ ok: boolean }>({
      type: "sofabaton_x1s/backup/clear_result",
      operation_id: operationId,
    });
  }

  clearRestoreResult(operationId: string) {
    // Server-side ``backup/clear_result`` is generic — it fully drops
    // any terminal op (backup_export or backup_restore). Wrapping it
    // here for call-site readability and to give the two screens an
    // obvious symmetric pair.
    return this.hass.callWS<{ ok: boolean }>({
      type: "sofabaton_x1s/backup/clear_result",
      operation_id: operationId,
    });
  }

  refreshCatalog(entryId: string, kind: "activities" | "devices") {
    return this.hass.callWS({
      type: "sofabaton_x1s/catalog/refresh",
      entry_id: entryId,
      kind,
    });
  }

  refreshCacheEntry(payload: {
    hubEntryId: string;
    entityId?: string | null;
    kind: RefreshKind;
    targetId: number;
  }) {
    const message: Record<string, unknown> = {
      type: "sofabaton_x1s/persistent_cache/refresh",
      kind: payload.kind,
      target_id: payload.targetId,
    };
    if (payload.entityId) message.entity_id = payload.entityId;
    else message.entry_id = payload.hubEntryId;
    return this.hass.callWS(message);
  }

  getLogs(entryId: string, limit = 250) {
    return this.hass.callWS<LogsResponse>({
      type: "sofabaton_x1s/logs/get",
      entry_id: entryId,
      limit,
    });
  }

  subscribeLogs(entryId: string, onMessage: (payload: unknown) => void) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error("Live logs are unavailable without a websocket connection"));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/logs/subscribe", entry_id: entryId },
    );
  }

  subscribeWifiPresses(entryId: string, onMessage: (payload: unknown) => void) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error("Wifi press events are unavailable without a websocket connection"));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/wifi_presses/subscribe", entry_id: entryId },
    );
  }

  subscribeHubEvents(entryId: string, onMessage: (payload: unknown) => void) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error("Hub events are unavailable without a websocket connection"));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/hub_events/subscribe", entry_id: entryId },
    );
  }
}
