import type {
  CacheContentsResponse,
  ControlPanelStateResponse,
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
