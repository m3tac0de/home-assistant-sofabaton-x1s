import type {
  BackupBundlePayload,
  BackupOperationStateResponse,
  BackupOperationStartResponse,
  BackupProgressEvent,
  CacheContentsResponse,
  ControlPanelStateResponse,
  BlobFetchResponse,
  BlobPlayResponse,
  HassLike,
  HubAction,
  HubEventActionsResponse,
  HubClickAction,
  IrEmissionsEvent,
  IrEmitterConsumersResponse,
  IrLearnEvent,
  IrPayloadConvertResponse,
  IrPayloadForeignFormat,
  LogsResponse,
  RefreshKind,
  SettingKey,
  WifiCommandConfigResponse,
  WifiCommandSyncState,
  WifiDevicesListResponse,
  WifiEventCreateResponse,
  WifiEventsListResponse,
} from "../ha-context";
import { TOOLS_CARD_STRINGS } from "../../strings";

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

  // Global (all-hubs) dropdown setting: what a Hub-tab row click does.
  setHubClickAction(entryId: string, value: HubClickAction) {
    return this.hass.callWS({
      type: "sofabaton_x1s/control_panel/set_setting",
      entry_id: entryId,
      setting: "hub_click_action",
      value,
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

  /**
   * Render a foreign IR code (Unfolded Circle HEX) through the backend's
   * protocol library. Hub-independent: no entry id, nothing is sent.
   */
  convertIrPayload(text: string, format: IrPayloadForeignFormat = "uc_hex") {
    return this.hass.callWS<IrPayloadConvertResponse>({
      type: "sofabaton_x1s/ir_payload/convert",
      text,
      format,
    });
  }

  // ── Payload-editor learn mode (IR9) ───────────────────────────────────
  /**
   * Arm one hub learn window. Events arrive on `onMessage` (`listening`,
   * then a terminal state); calling the returned unsubscribe before the
   * terminal event cancels the window on the hub.
   */
  subscribeIrLearn(entryId: string, timeoutS: number, onMessage: (event: IrLearnEvent) => void) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error(TOOLS_CARD_STRINGS.errors.irLearnNoSocket));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/ir_learn/subscribe", entry_id: entryId, timeout: Math.round(timeoutS) },
    );
  }

  /** Emitter inbox: the intercept ring, replayed on connect and after every send. */
  subscribeIrEmissions(entryId: string, onMessage: (event: IrEmissionsEvent) => void) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error(TOOLS_CARD_STRINGS.errors.irLearnNoSocket));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/ir_emissions/subscribe", entry_id: entryId },
    );
  }

  getIrEmitterConsumers(entryId: string) {
    return this.hass.callWS<IrEmitterConsumersResponse>({
      type: "sofabaton_x1s/ir_emitter/consumers",
      entry_id: entryId,
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

  // Create an EMPTY device of the given class on the hub (Hub tab "Add
  // device"); resolves with the hub-assigned device id so the caller can
  // open the live editor on it. Commands are added there.
  createDevice(entryId: string, name: string, deviceClass: string) {
    return this.hass.callWS<{ status?: string; device_id?: number }>({
      type: "sofabaton_x1s/device/create",
      entry_id: entryId,
      name,
      device_class: deviceClass,
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
      return Promise.reject(new Error(TOOLS_CARD_STRINGS.errors.backupProgressNoSocket));
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

  // ── Wifi Commands devices (the Automation tab) ──────────────────────

  getWifiCommandDevices(hubEntryId: string) {
    return this.hass.callWS<WifiDevicesListResponse>({
      type: "sofabaton_x1s/command_devices/list",
      entry_id: hubEntryId,
    });
  }

  createWifiCommandDevice(hubEntryId: string, deviceName: string, transport?: string) {
    return this.hass.callWS<{ device_key?: string }>({
      type: "sofabaton_x1s/command_device/create",
      entry_id: hubEntryId,
      device_name: deviceName,
      ...(transport ? { transport } : {}),
    });
  }

  deleteWifiCommandDevice(hubEntryId: string, deviceKey: string) {
    return this.hass.callWS({
      type: "sofabaton_x1s/command_device/delete",
      entry_id: hubEntryId,
      device_key: deviceKey,
    });
  }

  getWifiCommandConfig(hubEntryId: string, deviceKey: string) {
    return this.hass.callWS<WifiCommandConfigResponse>({
      type: "sofabaton_x1s/command_config/get",
      entry_id: hubEntryId,
      device_key: deviceKey,
    });
  }

  setWifiCommandConfig(
    hubEntryId: string,
    deviceKey: string,
    commands: unknown[],
    powerOnCommandId: number | null,
    powerOffCommandId: number | null,
  ) {
    return this.hass.callWS({
      type: "sofabaton_x1s/command_config/set",
      entry_id: hubEntryId,
      device_key: deviceKey,
      commands,
      power_on_command_id: powerOnCommandId ?? undefined,
      power_off_command_id: powerOffCommandId ?? undefined,
    });
  }

  getWifiCommandSyncProgress(hubEntryId: string, deviceKey: string) {
    return this.hass.callWS<Partial<WifiCommandSyncState>>({
      type: "sofabaton_x1s/command_sync/progress",
      entry_id: hubEntryId,
      device_key: deviceKey,
    });
  }

  /** Deploy one Wifi Device's staged config. A WS command rather than the
   *  sync_command_config action: a failure comes back as a code the card
   *  shows in its dock, never as Home Assistant's error toast. */
  syncWifiCommandConfig(hubEntryId: string, deviceKey: string) {
    return this.hass.callWS<Record<string, unknown>>({
      type: "sofabaton_x1s/command_sync/run",
      entry_id: hubEntryId,
      device_key: deviceKey,
    });
  }

  getHubEventActions(hubEntryId: string) {
    return this.hass.callWS<HubEventActionsResponse>({
      type: "sofabaton_x1s/hub_event_actions/get",
      entry_id: hubEntryId,
    });
  }

  /** Both maps are stored wholesale; the backend normalizes them. */
  setHubEventActions(
    hubEntryId: string,
    actions: Record<string, unknown>,
    activityActions: Record<string, unknown>,
  ) {
    return this.hass.callWS<HubEventActionsResponse>({
      type: "sofabaton_x1s/hub_event_actions/set",
      entry_id: hubEntryId,
      actions,
      activity_actions: activityActions,
    });
  }

  // ── Wifi Events (reserved haevents record) ────────────────────────────

  listWifiEvents(hubEntryId: string) {
    return this.hass.callWS<WifiEventsListResponse>({
      type: "sofabaton_x1s/wifi_event/list",
      entry_id: hubEntryId,
    });
  }

  createWifiEvent(hubEntryId: string, name: string) {
    return this.hass.callWS<WifiEventCreateResponse>({
      type: "sofabaton_x1s/wifi_event/create",
      entry_id: hubEntryId,
      name,
    });
  }

  /** W7 phase 1: deploy the events record without store changes. */
  syncWifiEvents(hubEntryId: string) {
    return this.hass.callWS<WifiEventsListResponse>({
      type: "sofabaton_x1s/wifi_event/sync",
      entry_id: hubEntryId,
    });
  }

  /** Drop every stored Wifi Event (the orphaned-config notice's remedy). */
  clearWifiEvents(hubEntryId: string) {
    return this.hass.callWS<WifiEventsListResponse>({
      type: "sofabaton_x1s/wifi_event/clear_all",
      entry_id: hubEntryId,
    });
  }

  deleteWifiEvent(hubEntryId: string, slotIndex: number) {
    return this.hass.callWS<WifiEventsListResponse>({
      type: "sofabaton_x1s/wifi_event/delete",
      entry_id: hubEntryId,
      slot_index: slotIndex,
    });
  }

  setWifiEventAction(
    hubEntryId: string,
    slotIndex: number,
    pressType: "short" | "long",
    action: Record<string, unknown>,
  ) {
    return this.hass.callWS<WifiEventsListResponse>({
      type: "sofabaton_x1s/wifi_event/set_action",
      entry_id: hubEntryId,
      slot_index: slotIndex,
      press_type: pressType,
      action,
    });
  }

  setWifiEventLongpress(hubEntryId: string, slotIndex: number, enabled: boolean) {
    return this.hass.callWS<WifiEventsListResponse>({
      type: "sofabaton_x1s/wifi_event/set_longpress",
      entry_id: hubEntryId,
      slot_index: slotIndex,
      enabled,
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
      return Promise.reject(new Error(TOOLS_CARD_STRINGS.errors.logsNoSocket));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/logs/subscribe", entry_id: entryId },
    );
  }

  subscribeWifiPresses(entryId: string, onMessage: (payload: unknown) => void) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error(TOOLS_CARD_STRINGS.errors.wifiPressNoSocket));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/wifi_presses/subscribe", entry_id: entryId },
    );
  }

  subscribeHubEvents(entryId: string, onMessage: (payload: unknown) => void) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error(TOOLS_CARD_STRINGS.errors.hubEventsNoSocket));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/hub_events/subscribe", entry_id: entryId },
    );
  }
}
