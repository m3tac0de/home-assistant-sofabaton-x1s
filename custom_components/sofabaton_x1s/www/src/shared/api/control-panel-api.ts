import type {
  BackupBundlePayload,
  BackupOperationStateResponse,
  BackupOperationStartResponse,
  BackupProgressEvent,
  CacheContentsResponse,
  ControlPanelStateResponse,
  HubStatePush,
  BlobFetchResponse,
  BlobPlayResponse,
  HassLike,
  HubAction,
  HubEventActionsResponse,
  HubClickAction,
  HubMqttLinkState,
  SidebarPanelMode,
  IrEmissionsEvent,
  IrEmitterConsumersResponse,
  IrEmitterStatusResponse,
  IrLearnEvent,
  IrPayloadConvertResponse,
  IrPayloadForeignFormat,
  LogsResponse,
  RefreshKind,
  RfBand,
  SettingKey,
  WifiCommandConfigResponse,
  WifiCommandSyncState,
  WifiDelivery,
  WifiDeliveryInfo,
  WifiDeviceSummary,
  WifiDevicesListResponse,
  WifiEventCreateResponse,
  WifiEventsListResponse,
} from "../ha-context";
import { TOOLS_CARD_STRINGS } from "../../strings";

/** A new activity's / device's icon and X2 color, when the user picked them. */
export interface CreateAppearance {
  icon?: number | null;
  colorId?: number | null;
}

function appearanceFields(appearance: CreateAppearance): { icon?: number; color_id?: number } {
  return {
    ...(appearance.icon != null ? { icon: appearance.icon } : {}),
    ...(appearance.colorId != null ? { color_id: appearance.colorId } : {}),
  };
}

export class ControlPanelApi {
  constructor(private readonly hass: HassLike) {}

  loadState() {
    return this.hass.callWS<ControlPanelStateResponse>({
      type: "sofabaton_x1s/control_panel/state",
    });
  }

  /** One hub's cache rows when `entryId` is given, every hub's otherwise. */
  loadCacheContents(entryId?: string) {
    return this.hass.callWS<CacheContentsResponse>({
      type: "sofabaton_x1s/persistent_cache/contents",
      ...(entryId ? { entry_id: entryId } : {}),
    });
  }

  /** The hub's control-panel state, pushed whenever it changes (the first
   *  event comes at once): runtime state, cache generation, config revision. */
  subscribeHubState(entryId: string, onMessage: (payload: HubStatePush) => void) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error(TOOLS_CARD_STRINGS.errors.hubStateNoSocket));
    }
    return this.hass.connection.subscribeMessage(
      onMessage as (payload: unknown) => void,
      { type: "sofabaton_x1s/hub_state/subscribe", entry_id: entryId },
    );
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

  // Global dropdown setting: the "Sofabaton X" sidebar panel mode.
  setSidebarPanelMode(entryId: string, value: SidebarPanelMode) {
    return this.hass.callWS({
      type: "sofabaton_x1s/control_panel/set_setting",
      entry_id: entryId,
      setting: "sidebar_panel",
      value,
    });
  }

  // Global setting: the panel's name in the sidebar ("" = the product name).
  setSidebarPanelTitle(entryId: string, title: string) {
    return this.hass.callWS<{ ok: boolean; title: string }>({
      type: "sofabaton_x1s/control_panel/set_setting",
      entry_id: entryId,
      setting: "sidebar_panel_title",
      title,
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

  /** One-shot play of a stored code: IR, or RF on `band` (433 / 315 MHz). */
  playIrBlob(entryId: string, blob: string, band: RfBand | null = null) {
    return this.hass.callWS<BlobPlayResponse>({
      type: "sofabaton_x1s/blobs/play",
      entry_id: entryId,
      blob,
      ...(band != null ? { band } : {}),
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
   * terminal event cancels the window on the hub. With `band` the hub's
   * RF receiver listens instead of its IR one.
   */
  subscribeIrLearn(
    entryId: string,
    timeoutS: number,
    onMessage: (event: IrLearnEvent) => void,
    band: RfBand | null = null,
  ) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error(TOOLS_CARD_STRINGS.errors.irLearnNoSocket));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      {
        type: "sofabaton_x1s/ir_learn/subscribe",
        entry_id: entryId,
        timeout: Math.round(timeoutS),
        ...(band != null ? { band } : {}),
      },
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

  /** An X2's paired remotes and repeaters for the IR pill: `refresh` asks
   *  the hub (a few seconds), otherwise the last read without asking. */
  getIrEmitterStatus(entryId: string, refresh = false) {
    return this.hass.callWS<IrEmitterStatusResponse>({
      type: "sofabaton_x1s/ir_emitters/status",
      entry_id: entryId,
      refresh,
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

  // Immediate live write of the hub's own name (Settings tab pencil).
  renameHub(entryId: string, name: string) {
    return this.hass.callWS<{ status?: string; name?: string }>({
      type: "sofabaton_x1s/hub/rename",
      entry_id: entryId,
      name,
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
  createActivity(entryId: string, name: string, appearance: CreateAppearance = {}) {
    return this.hass.callWS<{ status?: string; activity_id?: number }>({
      type: "sofabaton_x1s/activity/create",
      entry_id: entryId,
      name,
      ...appearanceFields(appearance),
    });
  }

  // Create an EMPTY device of the given class on the hub (Hub tab "Add
  // device"); resolves with the hub-assigned device id so the caller can
  // open the live editor on it. Commands are added there.
  createDevice(entryId: string, name: string, deviceClass: string, appearance: CreateAppearance = {}) {
    return this.hass.callWS<{ status?: string; device_id?: number }>({
      type: "sofabaton_x1s/device/create",
      entry_id: entryId,
      name,
      device_class: deviceClass,
      ...appearanceFields(appearance),
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

  /** Set the desired delivery method of a Wifi Device record (the reserved
   *  Wifi Events record included). A store write: on a deployed record a
   *  value other than the deployed one makes the next sync a transport
   *  switch, the deployed value cancels a pending one. Answers with the
   *  events state for the events record, the device's row otherwise. */
  setWifiTransport(hubEntryId: string, deviceKey: string, transport: "mqtt" | "http") {
    return this.hass.callWS<WifiEventsListResponse & WifiDeviceSummary>({
      type: "sofabaton_x1s/command_config/set_transport",
      entry_id: hubEntryId,
      device_key: deviceKey,
      transport,
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
    return this.hass.callWS<{ delivery?: WifiDelivery | null } & Record<string, unknown>>({
      type: "sofabaton_x1s/command_sync/run",
      entry_id: hubEntryId,
      device_key: deviceKey,
    });
  }

  /** How presses of one deployed Wifi Device reach Home Assistant (the
   *  Wifi Events device included, key `haevents`). */
  getWifiDelivery(hubEntryId: string, deviceKey: string) {
    return this.hass.callWS<WifiDeliveryInfo>({
      type: "sofabaton_x1s/command_config/delivery",
      entry_id: hubEntryId,
      device_key: deviceKey,
    });
  }

  /** Test again: the deploy's test press on its own (no Action runs). */
  testWifiDelivery(hubEntryId: string, deviceKey: string) {
    return this.hass.callWS<WifiDelivery>({
      type: "sofabaton_x1s/command_config/test_delivery",
      entry_id: hubEntryId,
      device_key: deviceKey,
    });
  }

  getHubMqttStatus(hubEntryId: string) {
    return this.hass.callWS<HubMqttLinkState>({
      type: "sofabaton_x1s/hub_mqtt/status",
      entry_id: hubEntryId,
    });
  }

  /** Point an X2 at a broker; replaces whatever broker it had. With
   *  `use_ha_login` the backend sends Home Assistant's own MQTT login. */
  setHubMqttBroker(
    hubEntryId: string,
    broker: { host: string; port: number; useHaLogin: boolean; username?: string; password?: string },
  ) {
    return this.hass.callWS<HubMqttLinkState & { connected: boolean }>({
      type: "sofabaton_x1s/hub_mqtt/setup",
      entry_id: hubEntryId,
      host: broker.host,
      port: broker.port,
      use_ha_login: broker.useHaLogin,
      ...(broker.useHaLogin ? {} : { username: broker.username ?? "", password: broker.password ?? "" }),
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

  setWifiEventAction(hubEntryId: string, slotIndex: number, action: Record<string, unknown>) {
    return this.hass.callWS<WifiEventsListResponse>({
      type: "sofabaton_x1s/wifi_event/set_action",
      entry_id: hubEntryId,
      slot_index: slotIndex,
      action,
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
