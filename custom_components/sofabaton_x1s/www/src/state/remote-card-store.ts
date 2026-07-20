// State store for the remote card, extracted from the legacy card class for
// the Lit port (docs/internal/remote-card-refactor-plan.md, Phase 3). Owns
// hass/config, the integration probe, the hub command queue, activity/preview
// state, the enabled-buttons cache, and the load indicator; all pure
// derivations keep delegating to the existing remote-card-* satellites.
//
// Unlike ControlPanelStore this exposes methods instead of a materialized
// snapshot: every derivation is a cheap pure function over hass state, and
// the card renders once per onChange anyway.

import {
  DEFAULT_GROUP_ORDER,
  LAYOUT_KEYS,
  channelGroupEnabled,
  dvrGroupEnabled,
  favoritesButtonEnabled,
  layoutConfigForActivity,
  macrosButtonEnabled,
  mediaGroupEnabled,
  normalizedGroupOrder,
  volumeGroupEnabled,
} from "../remote-card-layout";
import {
  activitiesFromRemote,
  activityNameForId,
  currentActivityIdFromRemote,
  currentActivityLabelFromRemote,
  enabledButtonsSignature,
  isActivityOn,
  isPoweredOffLabel,
  previewSelection,
  resolveHubActivityData,
} from "../remote-card-state";
import { buildActivitySelectState, noActivitiesWarning } from "../remote-card-activity-state";
import {
  basicDataRequestKey,
  enqueueHubCommand,
  initHubRuntimeState,
  markHubRequested,
  requestAssignedKeysCommand,
  requestBasicDataCommand,
  requestFavoriteKeysCommand,
  requestMacroKeysCommand,
  sleep,
  startActivityCommand,
  stopActivityCommand,
  throttleHubRequest,
  wasHubRequested,
} from "../remote-card-hub";
import {
  hubAssignedKeyCommand,
  hubFavoriteKeyCommand,
  hubMacroKeyCommand,
  remoteSendCommandData,
} from "../remote-card-actions";
import {
  customFavoritesSignature,
  normalizeCustomFavorite,
} from "../remote-card-editor-helpers";
import { hubVersionFor, isX2Hub, supportsUnicodeCommandNames } from "../remote-card-compat";
import { str } from "../remote-card-strings";
import {
  readPreviewActivity,
  stableJsonSignature,
  writePreviewActivity,
} from "../remote-card-shared";
import type { HassLike, RemoteCardConfig } from "../remote-card-types";

export interface RemoteCardStoreHost {
  /** DOM event dispatch for haptic / hass-more-info / ll-custom / location events. */
  fireEvent(type: string, detail?: unknown): void;
  /** Hub queue went idle — the assist controller re-checks MQTT readiness. */
  onHubQueueDrained?(): void;
}

interface HubQueueEntry {
  list: unknown[];
  gapMs?: number;
}

export interface EnabledButtonEntry {
  command: number;
  activity_id: unknown;
}

export function normalizeRemoteCardConfig(
  config: RemoteCardConfig,
): RemoteCardConfig {
  // Defaults first, then user config overwrites (legacy setConfig).
  return {
    show_activity: true,
    show_dpad: true,
    show_nav: true,
    show_mid: true,
    show_volume: true,
    show_channel: true,
    show_media: true,
    show_dvr: true,
    show_colors: true,
    show_abc: true,
    theme: "",
    background_override: null,
    show_automation_assist: false,
    show_macros_button: null,
    show_favorites_button: null,
    custom_favorites: [],
    max_width: 360,
    // Shrink the entire card using CSS `zoom` (0 = no shrink, higher = smaller)
    shrink: 0,
    group_order: DEFAULT_GROUP_ORDER.slice() as unknown as string[],
    ...config,
  };
}

export class RemoteCardStore {
  private readonly onChange: () => void;
  private readonly host: RemoteCardStoreHost;

  private _hass: HassLike | null = null;
  private _config: RemoteCardConfig | null = null;
  private _editMode = false;
  previewActivity: string | null = null;

  // Integration detection (x1s vs hub)
  private integrationDomain: string | null = null;
  private integrationEntityId: string | null = null;
  private integrationDetectingFor: string | null = null;

  // Hub request queue (prevents parallel requests)
  private hubRequestSeen: Record<string, boolean> | null = null;
  private hubQueue: HubQueueEntry[] | null = null;
  private hubQueueBusy = false;
  private hubRequestCache: Record<string, number> | null = null;

  // Hub/X2 attribute caches (attributes may drop while switching)
  private hubActivitiesCache: unknown = null;
  private hubAssignedKeysCache: Record<string, unknown> | null = null;
  private hubMacrosCache: Record<string, unknown> | null = null;
  private hubFavoritesCache: Record<string, unknown> | null = null;
  private x2LastFetchedActivityId: number | null = null;

  // Enabled-buttons cache
  private enabledButtonsCache: EnabledButtonEntry[] = [];
  private enabledButtonsCacheKey: string | null = null;
  private enabledButtonsInvalid = false;

  // Activity switching / load indicator
  private pendingActivity: string | null = null;
  private pendingActivityAt: number | null = null;
  private activityLoadActive = false;
  private activityLoadTarget: string | null = null;
  private activityLoadTimeout: ReturnType<typeof setTimeout> | null = null;
  private commandPulseUntil = 0;
  private commandPulseTimeout: ReturnType<typeof setTimeout> | null = null;

  // Preview state resolved during the last derivation
  private previewState: { activityId: number | null; poweredOff?: boolean } | null =
    null;

  // Drawer / menu UI state (direction math stays in the element)
  activeDrawer: "macros" | "favorites" | null = null;
  activityMenuOpen = false;

  // Update gating
  private lastUpdateFingerprint: string | null = null;

  constructor(onChange: () => void, host: RemoteCardStoreHost) {
    this.onChange = onChange;
    this.host = host;
  }

  // ---------- core wiring ----------

  get hass(): HassLike | null {
    return this._hass;
  }

  get config(): RemoteCardConfig | null {
    return this._config;
  }

  get editMode(): boolean {
    return this._editMode;
  }

  setConfig(config: RemoteCardConfig): void {
    if (!config || !config.entity) {
      throw new Error(str().card.selectEntityError);
    }

    if (Object.prototype.hasOwnProperty.call(config, "preview_activity")) {
      this.previewActivity = String(config?.preview_activity ?? "");
      writePreviewActivity(config?.entity, this.previewActivity);
    } else if (this.previewActivity == null) {
      const cached = readPreviewActivity(config?.entity);
      this.previewActivity = cached ?? "";
    }

    this._config = normalizeRemoteCardConfig(config);

    this.activeDrawer = null;
    this.activityMenuOpen = false;
    this.invalidateFingerprint();
    this.onChange();
  }

  setHass(hass: HassLike): void {
    this._hass = hass;
    void this.ensureIntegration().then(() => {
      if (!this.shouldNotifyForHass(hass)) return;
      this.onChange();
    });
  }

  setEditMode(value: boolean): void {
    this._editMode = !!value;
    this.invalidateFingerprint();
    this.onChange();
  }

  setPreviewActivity(value: string | null | undefined): void {
    this.previewActivity = value ?? "";
    this.invalidateFingerprint();
  }

  connected(): void {
    /* no store-side listeners today; symmetry with ControlPanelStore */
  }

  disconnected(): void {
    if (this.commandPulseTimeout) clearTimeout(this.commandPulseTimeout);
    if (this.activityLoadTimeout) clearTimeout(this.activityLoadTimeout);
  }

  // ---------- update gating ----------

  invalidateFingerprint(): void {
    this.lastUpdateFingerprint = null;
  }

  shouldNotifyForHass(hass: HassLike | null): boolean {
    const nextFingerprint = this.updateFingerprint(hass);
    if (nextFingerprint === this.lastUpdateFingerprint) return false;
    this.lastUpdateFingerprint = nextFingerprint;
    return true;
  }

  updateFingerprint(hass: HassLike | null = this._hass): string {
    const entityId = String(this._config?.entity || "");
    const remote = entityId ? hass?.states?.[entityId] : null;
    const attrs = (remote?.attributes || {}) as Record<string, unknown>;
    const themeName = String(this._config?.theme || "");
    const themes = (hass as { themes?: { themes?: Record<string, unknown>; darkMode?: boolean } } | null)
      ?.themes;
    const themeDef = themeName ? themes?.themes?.[themeName] : null;
    const themeMode = themes?.darkMode ? "dark" : "light";

    return [
      entityId,
      String(remote?.state ?? ""),
      String(attrs?.current_activity_id ?? ""),
      String(attrs?.current_activity ?? ""),
      String(attrs?.load_state ?? ""),
      String(attrs?.hub_version ?? ""),
      stableJsonSignature(attrs?.activities),
      stableJsonSignature(attrs?.assigned_keys),
      stableJsonSignature(attrs?.macro_keys),
      stableJsonSignature(attrs?.favorite_keys),
      stableJsonSignature(this._config?.background_override),
      themeName,
      themeMode,
      stableJsonSignature(themeDef),
      this._editMode ? "1" : "0",
      String(this.previewActivity ?? ""),
      this.integrationDomain || "",
    ].join("|");
  }

  // ---------- integration detection ----------

  async ensureIntegration(): Promise<void> {
    if (!this._hass?.callWS || !this._config?.entity) return;

    const entityId = String(this._config.entity);

    // Entity changed -> clear Hub bootstrap/request state so we can re-initialize cleanly.
    if (this.integrationEntityId && this.integrationEntityId !== entityId) {
      this.hubRequestCache = null;
      this.hubRequestSeen = null;
      this.hubQueue = null;
      this.hubQueueBusy = false;
      this.hubActivitiesCache = null;
      this.hubAssignedKeysCache = null;
      this.hubMacrosCache = null;
      this.hubFavoritesCache = null;
      this.x2LastFetchedActivityId = null;
    }

    if (this.integrationEntityId === entityId && this.integrationDomain) return;
    if (this.integrationDetectingFor === entityId) return;

    this.integrationDetectingFor = entityId;
    try {
      const entry = await this._hass.callWS<{ platform?: string }>({
        type: "config/entity_registry/get",
        entity_id: entityId,
      });
      // Entity registry exposes the integration as `platform` for the entity
      this.integrationDomain = String(entry?.platform || "");
      this.integrationEntityId = entityId;
    } catch (e) {
      this.integrationDomain = null;
      this.integrationEntityId = entityId;
    } finally {
      this.integrationDetectingFor = null;
      this.invalidateFingerprint();
    }
  }

  isHubIntegration(): boolean {
    return String(this.integrationDomain || "") === "sofabaton_hub";
  }

  hubVersion(): string {
    return hubVersionFor(this._hass, this._config?.entity);
  }

  isX2(): boolean {
    return isX2Hub(this.hubVersion(), this.isHubIntegration());
  }

  supportsUnicodeCommandNames(): boolean {
    return supportsUnicodeCommandNames(this.hubVersion(), this.isHubIntegration());
  }

  // ---------- basic state helpers ----------

  remoteState() {
    return this._hass?.states?.[String(this._config?.entity ?? "")];
  }

  currentActivityId(): number | null {
    return currentActivityIdFromRemote(this.remoteState());
  }

  activities(): Array<{ id: number; name: string; state?: string }> {
    const { activities, nextHubActivitiesCache } = activitiesFromRemote(
      this.remoteState(),
      this.isHubIntegration(),
      this.hubActivitiesCache,
    );
    this.hubActivitiesCache = nextHubActivitiesCache;
    return activities;
  }

  currentActivityLabel(): string {
    return currentActivityLabelFromRemote(this.remoteState(), this.activities());
  }

  activityNameForId(activityId: unknown): string | null {
    return activityNameForId(this.activities(), activityId) ?? null;
  }

  previewSelectionState(activities?: Array<{ id: number; name: string }>) {
    return previewSelection(
      this._editMode,
      this.previewActivity,
      Array.isArray(activities) ? activities : this.activities(),
    );
  }

  effectiveActivityId(): number | null {
    if (this.previewState) return this.previewState.activityId;
    return this.currentActivityId();
  }

  isActivityOn(activityId: unknown, activities?: Array<{ id: number; name: string; state?: string }>): boolean {
    return isActivityOn(
      activityId,
      Array.isArray(activities) ? activities : this.activities(),
      this.currentActivityLabel(),
    );
  }

  // ---------- layout / capability gating ----------

  layoutConfig(activityId: unknown = this.effectiveActivityId()) {
    return layoutConfigForActivity(this._config, activityId);
  }

  groupOrderList(activityId: unknown = null): string[] {
    const layout = layoutConfigForActivity(
      this._config,
      activityId ?? this.effectiveActivityId(),
    );
    return normalizedGroupOrder(layout?.group_order);
  }

  layoutSignature(activityId: unknown, layoutConfig: Record<string, unknown>): string {
    const order = this.groupOrderList(activityId);
    const parts = [
      `activity:${activityId ?? "off"}`,
      `order:${order.join(",")}`,
    ];
    for (const key of LAYOUT_KEYS) {
      if (key === "group_order") continue;
      parts.push(`${key}:${String(layoutConfig?.[key])}`);
    }
    return parts.join("|");
  }

  showMacrosButton(): boolean {
    return macrosButtonEnabled(this.layoutConfig());
  }

  showFavoritesButton(): boolean {
    return favoritesButtonEnabled(this.layoutConfig());
  }

  customFavorites(): Array<Record<string, unknown>> {
    const arr = this._config?.custom_favorites;
    if (!Array.isArray(arr)) return [];
    const out: Array<Record<string, unknown>> = [];
    for (let i = 0; i < arr.length; i++) {
      const norm = normalizeCustomFavorite(arr[i], i);
      if (norm) out.push(norm);
    }
    return out;
  }

  customFavoritesSignature(items: Array<Record<string, unknown>>): string {
    return customFavoritesSignature(items);
  }

  automationAssistEnabled(): boolean {
    return Boolean(this._config?.show_automation_assist);
  }

  // ---------- enabled buttons ----------

  enabledButtons(): EnabledButtonEntry[] {
    return this.enabledButtonsCache || [];
  }

  isEnabled(id: unknown): boolean {
    const enabled = this.enabledButtons();
    if (this.enabledButtonsInvalid) return true;
    if (!enabled.length) return true; // fail-open
    return enabled.some((entry) => entry.command === Number(id));
  }

  commandTarget(id: unknown): EnabledButtonEntry | null {
    const enabled = this.enabledButtons();
    const match = enabled.find((entry) => entry.command === Number(id));
    return match || null;
  }

  resolveCommandDeviceId(commandId: unknown, deviceId: unknown = null): number | null {
    const resolved =
      deviceId != null
        ? Number(deviceId)
        : (this.commandTarget(commandId)?.activity_id ?? this.currentActivityId());
    if (resolved == null || !Number.isFinite(Number(resolved))) return null;
    return Number(resolved);
  }

  // ---------- load indicator ----------

  /** The narrow activity-switch flag (excludes the command pulse). */
  activityLoadingActive(): boolean {
    return this.activityLoadActive;
  }

  isLoadingActive(): boolean {
    const isActivityLoading = Boolean(this.activityLoadActive);
    const isPulse = this.commandPulseUntil && Date.now() < this.commandPulseUntil;
    return isActivityLoading || Boolean(isPulse);
  }

  triggerCommandPulse(): void {
    this.commandPulseUntil = Date.now() + 1000;
    this.onChange();
    if (this.commandPulseTimeout) clearTimeout(this.commandPulseTimeout);
    this.commandPulseTimeout = setTimeout(() => {
      this.onChange();
    }, 1000);
  }

  startActivityLoading(target: unknown): void {
    this.activityLoadTarget = String(target ?? "");
    this.activityLoadActive = true;
    this.onChange();
    if (this.activityLoadTimeout) clearTimeout(this.activityLoadTimeout);
    this.activityLoadTimeout = setTimeout(() => {
      if (this.activityLoadActive) {
        this.activityLoadActive = false;
        this.onChange();
      }
    }, 60000);
  }

  stopActivityLoading(): void {
    if (!this.activityLoadActive) return;
    this.activityLoadActive = false;
    this.activityLoadTarget = null;
    if (this.activityLoadTimeout) clearTimeout(this.activityLoadTimeout);
    this.onChange();
  }

  // ---------- hub request queue ----------

  private hubInitState(): void {
    const next = initHubRuntimeState(this.hubRequestSeen, this.hubQueue);
    this.hubRequestSeen = next.requestSeen;
    this.hubQueue = next.queue;
  }

  hubQueueIdle(): boolean {
    const queue = Array.isArray(this.hubQueue) ? this.hubQueue.length : 0;
    return !this.hubQueueBusy && queue === 0;
  }

  hubEnqueueCommand(
    list: unknown[],
    { priority = false, gapMs = 150 }: { priority?: boolean; gapMs?: number } = {},
  ): void {
    if (!this.isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;

    this.hubInitState();

    this.hubQueue = enqueueHubCommand(this.hubQueue!, list, { priority, gapMs });

    // Fire and forget drain (single-flight)
    this.hubDrainQueue().catch(() => {});
  }

  hubEnqueueRequest(list: unknown[], requestKey: string | null): void {
    if (!this.isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;

    this.hubInitState();

    // Card-level de-dupe: we intentionally do NOT rely on the attributes changing
    // because some requests can validly result in an empty array.
    if (requestKey && wasHubRequested(this.hubRequestSeen!, requestKey)) return;
    if (requestKey) {
      this.hubRequestSeen = markHubRequested(this.hubRequestSeen!, requestKey);
    }

    // Requests are more fragile than normal key presses; keep a larger gap.
    this.hubEnqueueCommand(list, { priority: false, gapMs: 3000 });
  }

  async hubDrainQueue(): Promise<void> {
    if (!this.isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;

    this.hubInitState();
    if (this.hubQueueBusy) return;
    this.hubQueueBusy = true;
    try {
      while (this.hubQueue!.length) {
        const next = this.hubQueue!.shift();
        if (!next?.list) continue;
        await this.callService("remote", "send_command", {
          entity_id: this._config.entity,
          command: next.list,
        });

        // A small delay between calls improves reliability.
        const gap = Number.isFinite(Number(next?.gapMs)) ? Number(next.gapMs) : 750;
        await sleep(gap);
      }
    } finally {
      this.hubQueueBusy = false;
      this.host.onHubQueueDrained?.();
    }
  }

  private hubThrottle(key: string, minIntervalMs = 3000): boolean {
    this.hubRequestCache = this.hubRequestCache || {};
    return throttleHubRequest(this.hubRequestCache, key, minIntervalMs);
  }

  async hubSendCommandList(
    list: unknown[],
    throttleKey: string | null = null,
    minIntervalMs = 3000,
  ): Promise<void> {
    if (this._editMode) return;
    if (!this.isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;

    // If we're already running queued hub traffic (e.g. bootstrapping request_* calls),
    // serialize user commands too (but prioritize them) to reduce dropped calls.
    this.hubInitState();

    if (throttleKey) {
      if (!this.hubThrottle(throttleKey, minIntervalMs)) return;
    }

    if (this.hubQueueBusy || (Array.isArray(this.hubQueue) && this.hubQueue.length)) {
      this.hubEnqueueCommand(list, { priority: true, gapMs: 150 });
      return;
    }

    await this.callService("remote", "send_command", {
      entity_id: this._config.entity,
      command: list,
    });
  }

  hubRequestBasicData(): void {
    const entityId = String(this._config?.entity || "");
    this.hubEnqueueRequest(requestBasicDataCommand(), basicDataRequestKey(entityId));
  }

  hubRequestAssignedKeys(activityId: unknown): void {
    const command = requestAssignedKeysCommand(activityId);
    if (!command) return;
    // For the official sofabaton_hub path, activity revisits must re-fetch.
    // Do not use request de-dupe here.
    this.hubEnqueueCommand(command, { priority: false, gapMs: 3000 });
  }

  hubRequestFavoriteKeys(activityId: unknown): void {
    const command = requestFavoriteKeysCommand(activityId);
    if (!command) return;
    this.hubEnqueueCommand(command, { priority: false, gapMs: 3000 });
  }

  hubRequestMacroKeys(activityId: unknown): void {
    const command = requestMacroKeysCommand(activityId);
    if (!command) return;
    this.hubEnqueueCommand(command, { priority: false, gapMs: 3000 });
  }

  async hubStartActivity(activityId: unknown): Promise<void> {
    const command = startActivityCommand(activityId);
    if (!command) return;
    await this.hubSendCommandList(command);
  }

  async hubStopActivity(activityId: unknown): Promise<void> {
    const command = stopActivityCommand(activityId);
    if (!command) return;
    await this.hubSendCommandList(command);
  }

  // ---------- actions ----------

  async callService(
    domain: string,
    service: string,
    data: Record<string, unknown>,
    target: Record<string, unknown> | undefined = undefined,
  ): Promise<void> {
    await this._hass!.callService!(domain, service, data, target);
  }

  async runLovelaceAction(
    actionConfig: Record<string, unknown> | null | undefined,
    context: Record<string, unknown> | null = null,
  ): Promise<void> {
    if (this._editMode) return;
    if (!actionConfig || typeof actionConfig !== "object") return;

    const action = String(actionConfig.action || "").toLowerCase();

    // If the config looks like a service action but omitted `action:`, treat it as one.
    const implicitService =
      (!action || action === "default") &&
      (actionConfig.service || actionConfig.perform_action);

    if (action === "none") return;

    if (action === "call-service" || action === "perform-action" || implicitService) {
      const svc = String(actionConfig.service || actionConfig.perform_action || "").trim();
      if (!svc.includes(".")) return;
      const [domain, service] = svc.split(".", 2);

      const serviceData = {
        ...((actionConfig.service_data as Record<string, unknown>) ||
          (actionConfig.data as Record<string, unknown>) ||
          {}),
      };
      const target =
        actionConfig.target && typeof actionConfig.target === "object"
          ? (actionConfig.target as Record<string, unknown>)
          : undefined;

      await this.callService(domain, service, serviceData, target);
      return;
    }

    if (action === "toggle") {
      const entityId =
        actionConfig.entity_id ||
        actionConfig.entity ||
        context?.entity_id ||
        context?.entityId;
      if (!entityId) return;
      await this.callService("homeassistant", "toggle", { entity_id: entityId });
      return;
    }

    if (action === "more-info") {
      const entityId =
        actionConfig.entity_id ||
        actionConfig.entity ||
        context?.entity_id ||
        context?.entityId;
      if (!entityId) return;
      this.host.fireEvent("hass-more-info", { entityId });
      return;
    }

    if (action === "navigate") {
      const path = actionConfig.navigation_path;
      if (!path) return;
      history.pushState(null, "", String(path));
      window.dispatchEvent(
        new Event("location-changed", { bubbles: true, composed: true } as EventInit),
      );
      return;
    }

    if (action === "url") {
      const url = actionConfig.url_path;
      if (!url) return;
      window.open(String(url), "_blank");
      return;
    }

    if (action === "fire-dom-event") {
      // Pass through - this is commonly used for browser_mod / custom integrations.
      this.host.fireEvent("ll-custom", actionConfig);
      return;
    }

    // Unknown/unsupported action -> no-op
  }

  async sendCommand(commandId: unknown, deviceId: unknown = null): Promise<void> {
    if (this._editMode) return;
    if (!this._hass || !this._config?.entity) return;

    // If deviceId isn't provided, fall back to enabled_buttons override (activity_id) or current_activity_id
    const resolvedDevice = this.resolveCommandDeviceId(commandId, deviceId);

    // Hub uses a different command payload
    if (this.isHubIntegration()) {
      const command = hubAssignedKeyCommand(resolvedDevice, commandId);
      if (!command) return;
      await this.hubSendCommandList(command);
      return;
    }

    // X1S/X1 style
    const serviceData = remoteSendCommandData(this._config.entity, commandId, resolvedDevice);
    if (!serviceData) return;
    await this.callService("remote", "send_command", serviceData);
  }

  async sendDrawerItem(
    itemType: string,
    commandId: unknown,
    deviceId: unknown,
    rawItem: Record<string, unknown> | null | undefined,
  ): Promise<void> {
    if (this._editMode) return;
    // X1S/X1 path
    if (!this.isHubIntegration()) {
      return this.sendCommand(commandId, deviceId);
    }

    // Hub path
    if (!this._hass || !this._config?.entity) return;

    const activityId = Number(deviceId ?? this.currentActivityId());
    const keyId = Number(commandId);
    if (!Number.isFinite(keyId)) return;

    if (itemType === "macros") {
      const command = hubMacroKeyCommand(activityId, keyId);
      if (!command) return;
      return this.hubSendCommandList(command);
    }

    if (itemType === "favorites") {
      const device = Number(rawItem?.device_id ?? rawItem?.device);
      const command = hubFavoriteKeyCommand(device, keyId);
      if (!command) return;
      return this.hubSendCommandList(command);
    }

    // Default: assigned key (normal buttons)
    const command = hubAssignedKeyCommand(activityId, keyId);
    if (!command) return;
    return this.hubSendCommandList(command);
  }

  async sendCustomFavoriteCommand(commandId: unknown, deviceId: unknown): Promise<void> {
    if (this._editMode) return;
    if (!this._hass || !this._config?.entity) return;

    const cmd = Number(commandId);
    const dev = Number(deviceId);
    if (!Number.isFinite(cmd) || !Number.isFinite(dev)) return;

    if (this.isHubIntegration()) {
      // Send as a 'favorite' command in the hub integration (it accepts arbitrary IDs).
      const command = hubFavoriteKeyCommand(dev, cmd);
      if (!command) return;
      await this.hubSendCommandList(command);
      return;
    }

    // X1S/X1 style: send_command with device + numeric command
    const serviceData = remoteSendCommandData(this._config.entity, cmd, dev);
    if (!serviceData) return;
    await this.callService("remote", "send_command", serviceData);
  }

  async setActivity(option: unknown): Promise<void> {
    if (this._editMode) return;
    if (option == null || option === "") return;
    const selected = String(option);
    const current = this.currentActivityLabel();
    if (selected === current) return;

    this.pendingActivity = selected;
    this.pendingActivityAt = Date.now();
    this.startActivityLoading(selected);

    // Hub path: start/stop activities via send_command
    if (this.isHubIntegration()) {
      if (isPoweredOffLabel(selected)) {
        const currentId = this.currentActivityId();
        if (currentId != null) {
          await this.hubStopActivity(currentId);
        }
        return;
      }

      const match = this.activities().find((a) => a.name === selected);
      const activityId = match?.id;
      if (activityId == null) return;

      await this.hubStartActivity(activityId);
      return;
    }

    // X1S/X1 path
    if (isPoweredOffLabel(selected)) {
      await this.callService("remote", "turn_off", {
        entity_id: this._config!.entity,
      });
      return;
    }

    await this.callService("remote", "turn_on", {
      entity_id: this._config!.entity,
      activity: selected,
    });
  }

  // ---------- runtime derivation (the state half of the legacy _update) ----------

  /**
   * Resolve everything the render needs for the current hass/config state,
   * updating the hub caches, firing the on-demand hub fetches, refreshing the
   * enabled-buttons cache, and settling pending-activity bookkeeping — the
   * exact sequence the legacy _update() ran before touching the DOM.
   */
  deriveRuntimeState() {
    const remote = this.remoteState();
    const activities = this.activities();
    const preview = this.previewSelectionState(activities);
    this.previewState = preview;
    const activityId = preview ? preview.activityId : this.currentActivityId();
    const layoutConfig = layoutConfigForActivity(this._config, activityId);

    const isUnavailable = remote?.state === "unavailable";
    const attrs = (remote?.attributes ?? {}) as Record<string, unknown>;
    const loadState = attrs?.load_state;
    const assignedKeys = attrs?.assigned_keys;
    const macroKeys = attrs?.macro_keys;
    const favoriteKeys = attrs?.favorite_keys;
    const resolvedHubData = resolveHubActivityData({
      isHubIntegration: this.isHubIntegration(),
      activityId,
      assignedKeys,
      macroKeys,
      favoriteKeys,
      hubAssignedKeysCache: this.hubAssignedKeysCache || {},
      hubMacrosCache: this.hubMacrosCache || {},
      hubFavoritesCache: this.hubFavoritesCache || {},
    });
    this.hubAssignedKeysCache = resolvedHubData.hubAssignedKeysCache;
    this.hubMacrosCache = resolvedHubData.hubMacrosCache;
    this.hubFavoritesCache = resolvedHubData.hubFavoritesCache;

    // Hub integration: fetch activities / keys on-demand
    if (this.isHubIntegration() && !isUnavailable) {
      // When hub is idle/off it may expose no attributes; request activities once
      if (activities.length === 0 && loadState !== "loading") {
        this.hubRequestBasicData();
      }

      // X2 baseline behavior: on each confirmed current_activity_id change,
      // fetch assigned keys, macros, and favorites for that exact activity.
      if (activityId != null) {
        const confirmedActivityId = Number(activityId);
        if (this.x2LastFetchedActivityId !== confirmedActivityId) {
          this.x2LastFetchedActivityId = confirmedActivityId;
          this.hubRequestAssignedKeys(confirmedActivityId);
          this.hubRequestMacroKeys(confirmedActivityId);
          this.hubRequestFavoriteKeys(confirmedActivityId);
        }
      }
    } else if (this.isHubIntegration() && activityId == null) {
      this.x2LastFetchedActivityId = null;
    }

    const rawAssignedKeys = resolvedHubData.rawAssignedKeys;
    const enabledButtonsSig = enabledButtonsSignature(rawAssignedKeys);
    if (this.enabledButtonsCacheKey !== enabledButtonsSig) {
      this.enabledButtonsCacheKey = enabledButtonsSig;
      const parsed = Array.isArray(rawAssignedKeys)
        ? rawAssignedKeys
            .map((entry: unknown) => ({
              command: Number(entry),
              activity_id: activityId,
            }))
            .filter((entry) => Number.isFinite(entry.command))
        : [];
      this.enabledButtonsInvalid =
        Array.isArray(rawAssignedKeys) && parsed.length === 0;
      this.enabledButtonsCache = parsed;
    }

    // Activity select state + pending-activity bookkeeping
    const pendingAge = this.pendingActivityAt
      ? Date.now() - this.pendingActivityAt
      : null;
    const pendingExpired = pendingAge != null && pendingAge > 15000;

    let selectState: ReturnType<typeof buildActivitySelectState> | null = null;
    let isPoweredOff = false;
    let currentLabel = "";
    if (isUnavailable) {
      this.stopActivityLoading();
    } else {
      selectState = buildActivitySelectState({
        editMode: this._editMode,
        preview,
        activities,
        currentActivityLabel: this.currentActivityLabel(),
        pendingActivity: this.pendingActivity,
        pendingExpired,
      });
      currentLabel = selectState.current;
      isPoweredOff = preview
        ? Boolean(preview.poweredOff)
        : activityId == null || Boolean(selectState.poweredOff);
      if (selectState.clearPending) {
        this.pendingActivity = null;
        this.pendingActivityAt = null;
      }

      const currentActivity = this.currentActivityLabel();
      if (this.activityLoadActive && this.activityLoadTarget) {
        const targetIsOff = isPoweredOffLabel(this.activityLoadTarget);
        if ((targetIsOff && isPoweredOff) || currentActivity === this.activityLoadTarget) {
          this.stopActivityLoading();
        }
      }
    }

    const showVolume = volumeGroupEnabled(layoutConfig);
    const showChannel = channelGroupEnabled(layoutConfig);
    const showMedia = mediaGroupEnabled(layoutConfig);
    const showDvr = dvrGroupEnabled(layoutConfig);

    return {
      remote,
      isUnavailable,
      loadState,
      activities,
      preview,
      activityId,
      layoutConfig,
      layoutSignature: this.layoutSignature(activityId, layoutConfig as Record<string, unknown>),
      macros: resolvedHubData.macros,
      favorites: resolvedHubData.favorites,
      customFavorites: this.customFavorites(),
      rawAssignedKeys,
      selectState,
      currentLabel,
      isPoweredOff,
      isX2: this.isX2(),
      showVolume,
      showChannel,
      showMedia,
      showDvr,
      noActivitiesMessage: noActivitiesWarning(isUnavailable, activities.length, loadState),
    };
  }
}
