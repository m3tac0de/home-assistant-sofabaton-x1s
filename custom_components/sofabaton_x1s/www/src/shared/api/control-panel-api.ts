import type {
  BackupBundlePayload,
  BackupOperationStateResponse,
  BackupOperationStartResponse,
  BackupProgressEvent,
  BackupRestoreResult,
  CacheContentsResponse,
  ControlPanelStateResponse,
  BlobFetchResponse,
  BlobPersistResponse,
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

  persistIrBlob(entryId: string, deviceId: number, commandName: string, blob: string) {
    return this.hass.callWS<BlobPersistResponse>({
      type: "sofabaton_x1s/blobs/persist",
      entry_id: entryId,
      device_id: deviceId,
      command_name: commandName,
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
}
