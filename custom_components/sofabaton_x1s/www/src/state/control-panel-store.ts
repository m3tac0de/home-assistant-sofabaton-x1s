import type {
  BackupProgressEvent,
  BackupSectionId,
  ControlPanelSnapshot,
  HassLike,
  HubAction,
  HubEventFireEvent,
  RefreshKind,
  RuntimeCompletionNotice,
  SectionId,
  SettingKey,
  TabId,
  WifiPressEvent,
} from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import {
  cacheGenerationSnapshot,
  canRunHubActions,
  connectionFingerprint,
  didHubGenerationChange,
  entityForHub,
  formatError,
  formatLogEntry,
  hassFingerprint,
  isBackendUnavailableError,
  persistentCacheEnabled,
  proxyClientConnected,
  selectedHub,
} from "../shared/utils/control-panel-selectors";

const BACKEND_RETRY_MIN_MS = 2000;
const BACKEND_RETRY_MAX_MS = 10000;

const VIEW_STATE_STORAGE_KEY = "sofabaton_x1s:tools_card:view_state:v1";
const VALID_TABS = new Set<TabId>(["settings", "wifi_commands", "backup", "cache", "logs"]);

/** activeRefreshLabel sentinel for the whole-hub "Refresh all" operation. */
export const REFRESH_ALL_KEY = "__refresh_all__";
const VALID_CACHE_SECTIONS = new Set<SectionId>(["activities", "devices"]);
const VALID_BACKUP_SECTIONS = new Set<BackupSectionId>(["make", "edit", "restore"]);

interface PersistedViewState {
  selectedHubEntryId?: string | null;
  selectedTab?: TabId;
  selectedCacheSection?: SectionId;
  selectedBackupSection?: BackupSectionId;
  openSection?: SectionId | null;
  openBackupSection?: BackupSectionId;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function viewStateStorage(): StorageLike | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch (_error) {
    // Ignore storage access failures.
  }
  return null;
}

function readPersistedViewState(): PersistedViewState {
  const storage = viewStateStorage();
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(VIEW_STATE_STORAGE_KEY) || "{}") as PersistedViewState;
    const selectedHubEntryId = String(parsed?.selectedHubEntryId ?? "").trim() || null;
    const selectedTab = VALID_TABS.has(parsed?.selectedTab as TabId) ? parsed.selectedTab : undefined;
    const selectedCacheSection = VALID_CACHE_SECTIONS.has(parsed?.selectedCacheSection as SectionId)
      ? (parsed.selectedCacheSection as SectionId)
      : VALID_CACHE_SECTIONS.has(parsed?.openSection as SectionId)
        ? (parsed.openSection as SectionId)
        : "activities";
    const selectedBackupSection = VALID_BACKUP_SECTIONS.has(parsed?.selectedBackupSection as BackupSectionId)
      ? (parsed.selectedBackupSection as BackupSectionId)
      : VALID_BACKUP_SECTIONS.has(parsed?.openBackupSection as BackupSectionId)
        ? (parsed.openBackupSection as BackupSectionId)
        : "make";
    return {
      selectedHubEntryId,
      ...(selectedTab ? { selectedTab } : {}),
      selectedCacheSection,
      selectedBackupSection,
    };
  } catch (_error) {
    return {};
  }
}

function normalizeLoadedFrontendVersion(value: unknown): string {
  const version = String(value ?? "").trim();
  return version || "dev";
}

function normalizeExpectedFrontendVersion(value: unknown): string | null {
  const version = String(value ?? "").trim();
  return version || null;
}

const INITIAL_SNAPSHOT: ControlPanelSnapshot = {
  hass: null,
  state: null,
  contents: null,
  toolsFrontendVersionLoaded: "dev",
  toolsFrontendVersionExpected: null,
  toolsFrontendVersionMismatch: false,
  loading: false,
  loadError: null,
  backendUnavailable: false,
  selectedHubEntryId: null,
  selectedTab: "cache",
  selectedCacheSection: "activities",
  selectedBackupSection: "make",
  openEntity: null,
  staleData: false,
  refreshBusyByHub: {},
  externalHubCommandByHub: {},
  runtimeCompletionNoticeByHub: {},
  pendingSettingKey: null,
  pendingActionKey: null,
  logsLines: [],
  logsError: null,
  logsLoading: false,
  logsLoadedEntryId: null,
  logsSubscribedEntryId: null,
  logsStickToBottom: true,
  logsScrollBehavior: "auto",
  pendingScrollEntityKey: null,
  lastWifiPress: null,
  wifiPressSubscribedEntryId: null,
  lastHubEvent: null,
  hubEventsSubscribedEntryId: null,
};

interface ControlPanelStoreOptions {
  loadedFrontendVersion?: string;
}

export class ControlPanelStore {
  private _snapshot: ControlPanelSnapshot = { ...INITIAL_SNAPSHOT };
  private _loadingStatePromise: Promise<void> | null = null;
  private _pendingLiveStateRefresh: Promise<void> | null = null;
  private _isConnected = false;
  private _refreshGraceUntil = 0;
  private _logsUnsub: (() => void) | null = null;
  private _logsLoadSeq = 0;
  private _logsSubscribeSeq = 0;
  private _lastObservedGenerations = cacheGenerationSnapshot(null);
  private _lastHassFingerprint = "";
  private _lastConnectionFingerprint = "";
  private _backendRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private _backendRetryDelay = BACKEND_RETRY_MIN_MS;
  private _backupOpUnsub: (() => void) | null = null;
  private _backupOpEntryId: string | null = null;
  private _backupOpId: string | null = null;
  private _runtimeStatePollTimer: ReturnType<typeof setTimeout> | null = null;
  private _runtimeCompletionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private _wifiPressUnsub: (() => void) | null = null;
  private _wifiPressSubscribeSeq = 0;
  private _hubEventsUnsub: (() => void) | null = null;
  private _hubEventsSubscribeSeq = 0;
  // Hub to pre-select when the card was created from a hub-specific entity (via
  // the card picker). Applied once when the hub becomes available; the user can
  // freely switch hubs afterwards.
  private _preferredHubEntryId: string | null = null;
  private _preferredHubApplied = false;
  private readonly _loadedFrontendVersion: string;

  constructor(
    private readonly onChange: (snapshot: ControlPanelSnapshot) => void,
    options: ControlPanelStoreOptions = {},
  ) {
    this._loadedFrontendVersion = normalizeLoadedFrontendVersion(options.loadedFrontendVersion);
    this._snapshot = {
      ...INITIAL_SNAPSHOT,
      ...readPersistedViewState(),
      toolsFrontendVersionLoaded: this._loadedFrontendVersion,
    };
  }

  get snapshot() {
    return this._snapshot;
  }

  connected() {
    this._isConnected = true;
    if (this._snapshot.hass && !this._snapshot.state && !this._loadingStatePromise) {
      void this.loadState();
    } else if (this._snapshot.backendUnavailable) {
      this._scheduleBackendRetry();
    }
    void this._syncBackupOperationFeed();
    void this._syncWifiPressFeed();
    void this._syncHubEventsFeed();
    this._scheduleRuntimeStatePoll();
    if (this._snapshot.selectedTab === "logs") {
      void this.syncLogsFeed();
    }
  }

  disconnected() {
    this._isConnected = false;
    this._snapshot = {
      ...this._snapshot,
      externalHubCommandByHub: {},
      runtimeCompletionNoticeByHub: {},
      lastWifiPress: null,
      lastHubEvent: null,
    };
    this._clearRuntimeStatePoll();
    this._clearRuntimeCompletionTimers();
    this._clearBackendRetry();
    void this._teardownBackupOperationFeed();
    void this._teardownWifiPressFeed();
    void this._teardownHubEventsFeed();
    void this.unsubscribeLogs();
  }

  private _clearBackendRetry() {
    if (this._backendRetryTimer) {
      clearTimeout(this._backendRetryTimer);
      this._backendRetryTimer = null;
    }
    this._backendRetryDelay = BACKEND_RETRY_MIN_MS;
  }

  private _clearRuntimeCompletionTimers(entryId?: string) {
    if (entryId !== undefined) {
      const timer = this._runtimeCompletionTimers.get(entryId);
      if (timer) clearTimeout(timer);
      this._runtimeCompletionTimers.delete(entryId);
      return;
    }
    for (const timer of this._runtimeCompletionTimers.values()) clearTimeout(timer);
    this._runtimeCompletionTimers.clear();
  }

  private _clearRuntimeStatePoll() {
    if (this._runtimeStatePollTimer) {
      clearTimeout(this._runtimeStatePollTimer);
      this._runtimeStatePollTimer = null;
    }
  }

  private _scheduleRuntimeStatePoll() {
    this._clearRuntimeStatePoll();
    if (!this._isConnected) return;
    const hub = selectedHub(this._snapshot);
    const isRunning = hub?.runtime_state?.kind === "operation_running";
    const interval = isRunning ? 1000 : 5000;
    this._runtimeStatePollTimer = setTimeout(() => {
      this._runtimeStatePollTimer = null;
      void this._refreshRuntimeState();
    }, interval);
  }

  private async _refreshRuntimeState() {
    if (!this._isConnected) return;
    try {
      await this.loadControlPanelState();
    } catch {
      this._scheduleRuntimeStatePoll();
      return;
    }
    this._scheduleRuntimeStatePoll();
  }

  private _scheduleBackendRetry() {
    if (!this._isConnected) return;
    if (this._backendRetryTimer) return;
    const delay = this._backendRetryDelay;
    this._backendRetryDelay = Math.min(BACKEND_RETRY_MAX_MS, Math.round(delay * 1.5));
    this._backendRetryTimer = setTimeout(() => {
      this._backendRetryTimer = null;
      if (!this._isConnected || !this._snapshot.backendUnavailable) return;
      void this.loadState({ silent: true });
    }, delay);
  }

  private _markBackendUnavailable() {
    const wasUnavailable = this._snapshot.backendUnavailable;
    this._snapshot = {
      ...this._snapshot,
      backendUnavailable: true,
      loadError: null,
      logsError: null,
    };
    if (!wasUnavailable) this._backendRetryDelay = BACKEND_RETRY_MIN_MS;
    this._scheduleBackendRetry();
  }

  private _clearBackendUnavailable() {
    if (!this._snapshot.backendUnavailable) return;
    this._snapshot = { ...this._snapshot, backendUnavailable: false };
    this._clearBackendRetry();
  }

  setHass(hass: HassLike) {
    const previousHass = this._snapshot.hass;
    this._snapshot = { ...this._snapshot, hass };
    const fingerprint = hassFingerprint(hass);
    const nextConnectionFingerprint = connectionFingerprint(hass);
    const generationSnapshot = cacheGenerationSnapshot(hass);

    if (!previousHass) {
      this._lastObservedGenerations = generationSnapshot;
      this._lastHassFingerprint = fingerprint;
      this._lastConnectionFingerprint = nextConnectionFingerprint;
      this.emit();
      return;
    }

    if (fingerprint !== this._lastHassFingerprint) {
      const connectionChanged = nextConnectionFingerprint !== this._lastConnectionFingerprint;
      if (
        this._isConnected &&
        !this._isAnyHubCommandBusy() &&
        !this._snapshot.loading &&
        Date.now() > this._refreshGraceUntil &&
        didHubGenerationChange(this._lastObservedGenerations, generationSnapshot)
      ) {
        this._snapshot = { ...this._snapshot, staleData: true };
      }
      this._lastObservedGenerations = generationSnapshot;
      this._lastHassFingerprint = fingerprint;
      this._lastConnectionFingerprint = nextConnectionFingerprint;

      if (
        this._isConnected &&
        connectionChanged &&
        !this._snapshot.loading &&
        !this._loadingStatePromise &&
        !this._pendingLiveStateRefresh
      ) {
        this._pendingLiveStateRefresh = this.loadControlPanelState()
          .catch(() => undefined)
          .finally(() => {
            this._pendingLiveStateRefresh = null;
            if (this._isConnected) this.emit();
          });
      }
      this.emit();
    }
  }

  selectHub(entryId: string) {
    this._snapshot = {
      ...this._snapshot,
      selectedHubEntryId: entryId,
      openEntity: null,
      logsLoadedEntryId: null,
      logsLines: [],
      logsError: null,
      logsStickToBottom: true,
      logsScrollBehavior: "auto",
      lastWifiPress: null,
      lastHubEvent: null,
    };
    this.persistViewState();
    this.emit();
    void (async () => {
      await this._teardownBackupOperationFeed();
      await this._teardownWifiPressFeed();
      await this._teardownHubEventsFeed();
      await this.unsubscribeLogs();
      await this.loadControlPanelState();
      await this._syncBackupOperationFeed();
      await this._syncWifiPressFeed();
      await this._syncHubEventsFeed();
      if (this._snapshot.selectedTab === "logs") await this.syncLogsFeed();
    })();
  }

  /**
   * Pre-select a hub by config-entry id (e.g. when the card was instantiated
   * from a hub-specific entity). Applied once when the hub is available; the
   * user can still switch hubs afterwards. Passing null clears the preference.
   */
  setPreferredHub(entryId: string | null) {
    const next = String(entryId ?? "").trim() || null;
    this._preferredHubEntryId = next;
    this._preferredHubApplied = false;
    if (!next) return;
    const hubs = this._snapshot.state?.hubs ?? [];
    if (hubs.some((hub) => hub.entry_id === next)) {
      this._preferredHubApplied = true;
      if (this._snapshot.selectedHubEntryId !== next) this.selectHub(next);
    }
  }

  selectTab(tabId: TabId) {
    this._snapshot = {
      ...this._snapshot,
      selectedTab: tabId,
      logsStickToBottom: tabId === "logs" ? true : this._snapshot.logsStickToBottom,
      logsScrollBehavior: tabId === "logs" ? "auto" : this._snapshot.logsScrollBehavior,
    };
    this.persistViewState();
    if (tabId === "logs") void this.syncLogsFeed();
    else void this.unsubscribeLogs();
    this.emit();
  }

  selectCacheSection(sectionId: SectionId) {
    if (this._snapshot.selectedCacheSection === sectionId && this._snapshot.openEntity === null) return;
    this._snapshot = {
      ...this._snapshot,
      selectedCacheSection: sectionId,
      openEntity: null,
    };
    this.persistViewState();
    this.emit();
  }

  setSelectedBackupSection(sectionId: BackupSectionId) {
    if (this._snapshot.selectedBackupSection === sectionId) return;
    this._snapshot = { ...this._snapshot, selectedBackupSection: sectionId };
    this.persistViewState();
    this.emit();
  }

  toggleEntity(key: string) {
    const opening = this._snapshot.openEntity !== key;
    this._snapshot = {
      ...this._snapshot,
      openEntity: opening ? key : null,
      pendingScrollEntityKey: opening ? key : null,
    };
    this.emit();
  }

  clearPendingScrollEntityKey() {
    if (!this._snapshot.pendingScrollEntityKey) return;
    this._snapshot = { ...this._snapshot, pendingScrollEntityKey: null };
  }

  /**
   * Busy state is stored per hub: callers whose operation may outlive the
   * current hub selection (tab subscriptions, async finallys) pass the
   * entry_id captured when the operation started so a late clear/set can
   * never touch another hub's state. Without an entry_id the currently
   * selected hub is used.
   */
  setExternalHubCommandBusy(busy: boolean, label: string | null = null, entryId?: string | null) {
    const key = String(entryId ?? selectedHub(this._snapshot)?.entry_id ?? "").trim();
    if (!key) return;
    const byHub = { ...this._snapshot.externalHubCommandByHub };
    if (busy) byHub[key] = String(label || "").trim() || "Hub command in progress…";
    else delete byHub[key];
    this._snapshot = {
      ...this._snapshot,
      externalHubCommandByHub: byHub,
    };
    this.emit();
  }

  showRuntimeCompletion(notice: RuntimeCompletionNotice | null, entryId?: string | null, ttlMs = 6000) {
    const key = String(entryId ?? selectedHub(this._snapshot)?.entry_id ?? "").trim();
    if (!key) return;
    this._clearRuntimeCompletionTimers(key);
    const byHub = { ...this._snapshot.runtimeCompletionNoticeByHub };
    if (notice) byHub[key] = notice;
    else delete byHub[key];
    this._snapshot = {
      ...this._snapshot,
      runtimeCompletionNoticeByHub: byHub,
    };
    this.emit();
    if (!notice) return;
    this._runtimeCompletionTimers.set(key, setTimeout(() => {
      this._runtimeCompletionTimers.delete(key);
      if (!(key in this._snapshot.runtimeCompletionNoticeByHub)) return;
      const next = { ...this._snapshot.runtimeCompletionNoticeByHub };
      delete next[key];
      this._snapshot = {
        ...this._snapshot,
        runtimeCompletionNoticeByHub: next,
      };
      this.emit();
    }, ttlMs));
  }

  async loadState(options: { silent?: boolean } = {}) {
    if (this._loadingStatePromise) return this._loadingStatePromise;
    const silent = !!options.silent;
    if (!silent) {
      this._snapshot = { ...this._snapshot, loading: true, loadError: null };
      this.emit();
    }
    const api = this.api();
    this._loadingStatePromise = (async () => {
      try {
        const [state, contents] = await Promise.all([api.loadState(), api.loadCacheContents()]);
        this.applyControlPanelState(state);
        this._snapshot = { ...this._snapshot, contents };
        this.syncSelection();
        this._clearBackendUnavailable();
        await this._syncBackupOperationFeed();
        await this._syncWifiPressFeed();
        await this._syncHubEventsFeed();
      } catch (error) {
        if (isBackendUnavailableError(error, this._snapshot.hass)) {
          this._markBackendUnavailable();
        } else {
          this._snapshot = { ...this._snapshot, loadError: formatError(error), backendUnavailable: false };
          this._clearBackendRetry();
        }
      } finally {
        this._loadingStatePromise = null;
        this._snapshot = { ...this._snapshot, loading: false, staleData: false };
        this._refreshGraceUntil = Date.now() + 10000;
        this.emit();
        if (this._snapshot.selectedTab === "logs") void this.syncLogsFeed();
      }
    })();
    return this._loadingStatePromise;
  }

  async loadControlPanelState() {
    try {
      const state = await this.api().loadState();
      this.applyControlPanelState(state);
      this.syncSelection();
      this._clearBackendUnavailable();
      await this._syncBackupOperationFeed();
      await this._syncWifiPressFeed();
      await this._syncHubEventsFeed();
      this.emit();
    } catch (error) {
      if (isBackendUnavailableError(error, this._snapshot.hass)) {
        this._markBackendUnavailable();
        this.emit();
        return;
      }
      throw error;
    }
  }

  async loadCacheContents() {
    const contents = await this.api().loadCacheContents();
    this._snapshot = { ...this._snapshot, contents };
    this.emit();
  }

  async setSetting(setting: SettingKey, enabled: boolean) {
    const hub = selectedHub(this._snapshot);
    if (!hub || this._snapshot.pendingSettingKey || this._snapshot.pendingActionKey) return;

    const previousPersistentCacheEnabled = persistentCacheEnabled(this._snapshot);
    this._snapshot = { ...this._snapshot, pendingSettingKey: setting };
    this.applyOptimisticSetting(setting, enabled);

    try {
      await this.api().setSetting(hub.entry_id, setting, enabled);
      if (setting === "persistent_cache") {
        if (enabled) await this.loadCacheContents();
        else await this.loadControlPanelState();
      } else {
        await this.loadControlPanelState();
      }
    } catch (_error) {
      this.applyOptimisticSetting(
        setting,
        setting === "persistent_cache" ? previousPersistentCacheEnabled : !enabled,
      );
    } finally {
      this._snapshot = { ...this._snapshot, pendingSettingKey: null };
      this.emit();
    }
  }

  async runAction(action: HubAction) {
    const hub = selectedHub(this._snapshot);
    if (!hub || this._snapshot.pendingSettingKey || this._snapshot.pendingActionKey) return;

    this._snapshot = { ...this._snapshot, pendingActionKey: action };
    try {
      await this.api().runAction(hub.entry_id, action);
      await this.loadControlPanelState();
    } finally {
      this._snapshot = { ...this._snapshot, pendingActionKey: null };
      this.emit();
    }
  }

  async refreshStale() {
    this._snapshot = { ...this._snapshot, staleData: false };
    this.emit();
    await this.loadState();
  }

  private _setRefreshBusy(entryId: string, label: string | null) {
    this._snapshot = {
      ...this._snapshot,
      refreshBusyByHub: { ...this._snapshot.refreshBusyByHub, [entryId]: label },
    };
    this.emit();
  }

  private _clearRefreshBusy(entryId: string) {
    const byHub = { ...this._snapshot.refreshBusyByHub };
    delete byHub[entryId];
    this._snapshot = { ...this._snapshot, refreshBusyByHub: byHub, staleData: false };
    this.emit();
  }

  async refreshSection(sectionId: SectionId) {
    if (this._isHubCommandBusy()) return;
    const hub = selectedHub(this._snapshot);
    if (!hub) return;
    this._setRefreshBusy(hub.entry_id, null);
    try {
      await this.api().refreshCatalog(hub.entry_id, sectionId);
      await this.loadState({ silent: true });
    } finally {
      this._clearRefreshBusy(hub.entry_id);
    }
  }

  /**
   * Whole-hub structural cache refresh ("Refresh all" in the Hub tab).
   * Starts the backend cache_refresh operation and follows its progress;
   * running state and phase messages surface through the bottom dock
   * (hub.runtime_state), so the button itself only spins.
   *
   * Resolves with `null` on success or a failure message — the same one shown
   * in the dock — so embedded starters (the Activities tab's refresh button)
   * can react to the outcome.
   */
  async refreshAllForHub(): Promise<string | null> {
    if (this._isHubCommandBusy()) return "Another hub operation is already running.";
    const hub = selectedHub(this._snapshot);
    if (!hub) return "No hub selected.";
    this._setRefreshBusy(hub.entry_id, REFRESH_ALL_KEY);
    let unsubscribe: (() => void) | null = null;
    try {
      const start = await this.api().startCacheRefresh(hub.entry_id);
      // Pull runtime_state promptly so the dock picks up the running operation.
      void this.loadControlPanelState().catch(() => undefined);
      const failure = await new Promise<string | null>((resolve) => {
        this.api()
          .subscribeBackupProgress(start.operation_id, (payload: BackupProgressEvent) => {
            if (payload.status === "success") resolve(null);
            else if (payload.status === "failed") {
              resolve(String(payload.error || payload.message || "Cache refresh failed."));
            }
          })
          .then((unsub) => { unsubscribe = unsub; })
          .catch((error) => resolve(formatError(error)));
      });
      this.showRuntimeCompletion(
        failure
          ? { tone: "error", label: failure }
          : { tone: "success", label: "Hub cache refreshed." },
        hub.entry_id,
      );
      await this.loadState({ silent: true });
      return failure;
    } catch (error) {
      const failure = formatError(error);
      this.showRuntimeCompletion({ tone: "error", label: failure }, hub.entry_id);
      return failure;
    } finally {
      if (unsubscribe) {
        try { (unsubscribe as () => void)(); } catch { /* ignore */ }
      }
      this._clearRefreshBusy(hub.entry_id);
    }
  }

  /**
   * Immediate live write of the hub's stored activity display order.
   * ``orderedIds`` is the full activity id list in the desired order.
   * Resolves with `null` on success or a failure message for the caller's UI.
   */
  async reorderActivities(orderedIds: number[]): Promise<string | null> {
    if (this._isHubCommandBusy()) return "Another hub operation is already running.";
    const hub = selectedHub(this._snapshot);
    if (!hub) return "No hub selected.";
    this.setExternalHubCommandBusy(true, "Reordering activities…", hub.entry_id);
    try {
      await this.api().reorderActivities(hub.entry_id, orderedIds.map((id) => Number(id)));
    } catch (error) {
      return formatError(error);
    } finally {
      this.setExternalHubCommandBusy(false, null, hub.entry_id);
    }
    await this.loadState({ silent: true });
    return null;
  }

  /**
   * Immediate live write of the hub's stored device display order.
   * ``orderedIds`` is the full device id list in the desired order.
   * Resolves with `null` on success or a failure message for the caller's UI.
   */
  async reorderDevices(orderedIds: number[]): Promise<string | null> {
    if (this._isHubCommandBusy()) return "Another hub operation is already running.";
    const hub = selectedHub(this._snapshot);
    if (!hub) return "No hub selected.";
    this.setExternalHubCommandBusy(true, "Reordering devices…", hub.entry_id);
    try {
      await this.api().reorderDevices(hub.entry_id, orderedIds.map((id) => Number(id)));
    } catch (error) {
      return formatError(error);
    } finally {
      this.setExternalHubCommandBusy(false, null, hub.entry_id);
    }
    await this.loadState({ silent: true });
    return null;
  }

  /**
   * Create a fresh, empty activity on the hub, then pull its cache entry so
   * the live editor can capture it right away. Resolves with the assigned
   * activity id or an error message.
   */
  async createActivity(name: string): Promise<{ activityId: number } | { error: string }> {
    if (this._isHubCommandBusy()) return { error: "Another hub operation is already running." };
    const hub = selectedHub(this._snapshot);
    if (!hub) return { error: "No hub selected." };
    this.setExternalHubCommandBusy(true, "Creating activity…", hub.entry_id);
    let activityId = 0;
    try {
      const result = await this.api().createActivity(hub.entry_id, name);
      activityId = Number(result?.activity_id || 0);
      if (!activityId) return { error: "The hub did not return the new activity id." };
    } catch (error) {
      return { error: formatError(error) };
    } finally {
      this.setExternalHubCommandBusy(false, null, hub.entry_id);
    }
    // Per-entity cache refresh: makes the new activity part of the
    // persistent/structural cache (and the visible list) before the caller
    // opens the editor on it. The editor's needs-refresh guard covers the
    // case where this refresh fails.
    await this.refreshForHub("activity", activityId, `act-${activityId}`);
    return { activityId };
  }

  async refreshForHub(kind: RefreshKind, targetId: number, key: string) {
    if (this._isHubCommandBusy()) return;
    const hub = selectedHub(this._snapshot);
    if (!hub) return;
    this._setRefreshBusy(hub.entry_id, key);
    try {
      await this.api().refreshCacheEntry({
        hubEntryId: hub.entry_id,
        entityId: entityForHub(this._snapshot.hass, hub),
        kind,
        targetId,
      });
      await this.loadState({ silent: true });
    } finally {
      // Scroll-to-entry only makes sense if the user is still on the hub
      // whose entry was refreshed.
      if (this._snapshot.selectedHubEntryId === hub.entry_id) {
        this._snapshot = { ...this._snapshot, pendingScrollEntityKey: key };
      }
      this._clearRefreshBusy(hub.entry_id);
    }
  }

  async syncLogsFeed() {
    const hub = selectedHub(this._snapshot);
    if (!this._isConnected || this._snapshot.selectedTab !== "logs" || !hub) {
      await this.unsubscribeLogs();
      return;
    }

    const entryId = hub.entry_id;
    if (this._snapshot.logsLoadedEntryId !== entryId && !this._snapshot.logsLoading) {
      this._snapshot = { ...this._snapshot, logsStickToBottom: true };
      this.emit();
      void this.loadHubLogs(entryId);
    }

    if (this._snapshot.logsSubscribedEntryId === entryId) return;

    await this.unsubscribeLogs();
    const subscribeSeq = ++this._logsSubscribeSeq;
    this._snapshot = { ...this._snapshot, logsSubscribedEntryId: entryId };
    this.emit();

    try {
      const unsubscribe = await this.api().subscribeLogs(entryId, (payload) => {
        if (subscribeSeq !== this._logsSubscribeSeq) return;
        if (this._snapshot.logsSubscribedEntryId !== entryId) return;
        this.handleHubLogMessage(entryId, payload);
      });
      if (subscribeSeq !== this._logsSubscribeSeq) {
        try { unsubscribe(); } catch { /* ignore */ }
        return;
      }
      this._logsUnsub = unsubscribe;
      await this.loadHubLogs(entryId, { preserveLines: true });
    } catch (error) {
      if (subscribeSeq !== this._logsSubscribeSeq) return;
      if (isBackendUnavailableError(error, this._snapshot.hass)) {
        this._snapshot = { ...this._snapshot, logsSubscribedEntryId: null };
        this._markBackendUnavailable();
        this.emit();
        return;
      }
      this._snapshot = {
        ...this._snapshot,
        logsError: formatError(error),
        logsSubscribedEntryId: null,
      };
      this.emit();
    }
  }

  onLogsScrolled(metrics: { top: number; clientHeight: number; scrollHeight: number }) {
    const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
    this._snapshot = {
      ...this._snapshot,
      logsStickToBottom: maxScrollTop - metrics.top <= 8,
    };
  }

  private async loadHubLogs(entryId: string, options: { preserveLines?: boolean } = {}) {
    const seq = ++this._logsLoadSeq;
    this._snapshot = {
      ...this._snapshot,
      logsLoading: true,
      logsError: null,
      logsScrollBehavior: "auto",
      logsLines: options.preserveLines ? this._snapshot.logsLines : [],
    };
    this.emit();
    try {
      const result = await this.api().getLogs(entryId);
      if (seq !== this._logsLoadSeq) return;
      this._snapshot = {
        ...this._snapshot,
        logsLines: Array.isArray(result?.lines) ? result.lines : [],
        logsLoadedEntryId: entryId,
      };
    } catch (error) {
      if (seq !== this._logsLoadSeq) return;
      if (isBackendUnavailableError(error, this._snapshot.hass)) {
        this._snapshot = { ...this._snapshot, logsLoadedEntryId: entryId };
        this._markBackendUnavailable();
      } else {
        this._snapshot = {
          ...this._snapshot,
          logsError: formatError(error),
          logsLoadedEntryId: entryId,
        };
      }
    } finally {
      if (seq !== this._logsLoadSeq) return;
      this._snapshot = { ...this._snapshot, logsLoading: false };
      this.emit();
    }
  }

  private handleHubLogMessage(entryId: string, payload: unknown) {
    if (!this._isConnected || this._snapshot.selectedTab !== "logs") return;
    const message = payload as Record<string, unknown>;
    const line = {
      ts: String(message.ts ?? ""),
      time: String(message.time ?? ""),
      timestamp: String(message.timestamp ?? ""),
      level: String(message.level ?? "log"),
      message: String(message.message ?? message.msg ?? ""),
      msg: String(message.msg ?? ""),
      line: String(message.line ?? message.message ?? message.msg ?? ""),
      logger: String(message.logger ?? ""),
      entry_id: String(message.entry_id ?? ""),
    };
    const _formatted = formatLogEntry(line);
    this._snapshot = {
      ...this._snapshot,
      logsError: null,
      logsLoadedEntryId: entryId,
      logsLines: [...this._snapshot.logsLines, line].slice(-400),
    };
    void _formatted;
    this.emit();
  }

  private async unsubscribeLogs() {
    this._logsSubscribeSeq++;
    const unsub = this._logsUnsub;
    this._logsUnsub = null;
    this._snapshot = { ...this._snapshot, logsSubscribedEntryId: null };
    if (!unsub) return;
    try {
      await unsub();
    } catch {
      /* ignore — the backend may already be gone */
    }
  }

  private applyControlPanelState(state: ControlPanelSnapshot["state"]) {
    const previousHub = selectedHub(this._snapshot);
    const previousRuntime = previousHub?.runtime_state;
    const expectedVersion = normalizeExpectedFrontendVersion(state?.tools_frontend_version);
    this._snapshot = {
      ...this._snapshot,
      state,
      loadError: null,
      toolsFrontendVersionExpected: expectedVersion,
      toolsFrontendVersionMismatch:
        expectedVersion !== null && expectedVersion !== this._loadedFrontendVersion,
    };
    const nextHub = selectedHub(this._snapshot);
    const nextRuntime = nextHub?.runtime_state;
    if (
      previousRuntime?.kind === "operation_running"
      && nextRuntime?.kind !== "operation_running"
      // Cache refreshes report their own completion (success or failure)
      // through refreshAllForHub's progress subscription, which knows the
      // real terminal status — the poll transition doesn't.
      && previousRuntime.operation !== "cache_refresh"
    ) {
      const operation = previousRuntime.operation;
      const successLabel = operation === "backup_restore"
        ? "Restore completed successfully."
        : operation === "backup_export"
          ? "Backup completed successfully."
          : operation === "entity_sync"
            ? "Synced to hub."
            : "Wifi Device deployed successfully.";
      this.showRuntimeCompletion(
        {
          tone: "success",
          label: successLabel,
        },
        nextHub?.entry_id ?? previousHub?.entry_id ?? null,
      );
    }
    this._scheduleRuntimeStatePoll();
  }

  private applyOptimisticSetting(setting: SettingKey, enabled: boolean) {
    if (!this._snapshot.state) return;
    const hub = selectedHub(this._snapshot);
    if (!hub) return;

    if (setting === "persistent_cache") {
      this._snapshot = {
        ...this._snapshot,
        state: {
          ...this._snapshot.state,
          persistent_cache_enabled: enabled,
          hubs: this._snapshot.state.hubs.map((item) => ({
            ...item,
            persistent_cache_enabled: enabled,
          })),
        },
      };
      return;
    }

    const hubs = this._snapshot.state.hubs.map((item) =>
      item.entry_id === hub.entry_id
        ? {
            ...item,
            settings: {
              ...(item.settings ?? {}),
              [setting]: enabled,
            },
          }
        : item,
    );
    this._snapshot = {
      ...this._snapshot,
      state: {
        ...this._snapshot.state,
        hubs,
      },
    };
  }

  private syncSelection() {
    const hubs = this._snapshot.state?.hubs ?? [];
    if (!hubs.length) {
      this._snapshot = { ...this._snapshot, selectedHubEntryId: null };
      this.persistViewState();
      return;
    }
    if (
      !this._preferredHubApplied &&
      this._preferredHubEntryId &&
      hubs.some((hub) => hub.entry_id === this._preferredHubEntryId)
    ) {
      this._preferredHubApplied = true;
      this._snapshot = { ...this._snapshot, selectedHubEntryId: this._preferredHubEntryId };
      this.persistViewState();
      return;
    }
    if (!hubs.some((hub) => hub.entry_id === this._snapshot.selectedHubEntryId)) {
      this._snapshot = { ...this._snapshot, selectedHubEntryId: hubs[0].entry_id };
    }
    this.persistViewState();
  }

  private api() {
    if (!this._snapshot.hass) throw new Error("Home Assistant context is unavailable");
    return new ControlPanelApi(this._snapshot.hass);
  }

  private persistViewState() {
    const storage = viewStateStorage();
    if (!storage) return;
    try {
      storage.setItem(
        VIEW_STATE_STORAGE_KEY,
        JSON.stringify({
          selectedHubEntryId: this._snapshot.selectedHubEntryId,
          selectedTab: this._snapshot.selectedTab,
          selectedCacheSection: this._snapshot.selectedCacheSection,
          selectedBackupSection: this._snapshot.selectedBackupSection,
        } satisfies PersistedViewState),
      );
    } catch (_error) {
      // Ignore storage access failures.
    }
  }

  private _isHubCommandBusy() {
    const hub = selectedHub(this._snapshot);
    const entryId = hub?.entry_id ?? null;
    const activeBackupOperation = hub?.active_backup_operation;
    const backupBusy =
      !!activeBackupOperation &&
      ["pending", "running"].includes(String(activeBackupOperation.status || ""));
    return Boolean(
      (entryId && entryId in this._snapshot.refreshBusyByHub) ||
      (entryId && entryId in this._snapshot.externalHubCommandByHub) ||
      this._snapshot.pendingActionKey ||
      backupBusy,
    );
  }

  /** Busy on ANY hub — used to suppress the stale-data banner while one of
   * our own operations is bumping cache generations in the background. */
  private _isAnyHubCommandBusy() {
    const backupBusy = (this._snapshot.state?.hubs ?? []).some((hub) =>
      !!hub.active_backup_operation &&
      ["pending", "running"].includes(String(hub.active_backup_operation.status || "")),
    );
    return Boolean(
      Object.keys(this._snapshot.refreshBusyByHub).length ||
      Object.keys(this._snapshot.externalHubCommandByHub).length ||
      this._snapshot.pendingActionKey ||
      backupBusy,
    );
  }

  private async _syncBackupOperationFeed() {
    const hub = selectedHub(this._snapshot);
    const active = hub?.active_backup_operation;
    const entryId = String(hub?.entry_id || "").trim() || null;
    const operationId =
      active && ["pending", "running"].includes(String(active.status || ""))
        ? String(active.operation_id || "").trim() || null
        : null;

    if (!this._isConnected || !entryId || !operationId || !this._snapshot.hass) {
      await this._teardownBackupOperationFeed();
      return;
    }
    if (this._backupOpEntryId === entryId && this._backupOpId === operationId && this._backupOpUnsub) {
      return;
    }

    await this._teardownBackupOperationFeed();
    this._backupOpEntryId = entryId;
    this._backupOpId = operationId;

    try {
      const unsubscribe = await this.api().subscribeBackupProgress(operationId, (payload) => {
        if (this._backupOpId !== operationId || this._backupOpEntryId !== entryId) return;
        this._applyBackupProgressToSnapshot(entryId, payload);
        if (!["pending", "running"].includes(String(payload.status || ""))) {
          void this._teardownBackupOperationFeed();
        }
      });
      if (this._backupOpId !== operationId || this._backupOpEntryId !== entryId) {
        try { unsubscribe(); } catch { /* ignore */ }
        return;
      }
      this._backupOpUnsub = unsubscribe;
    } catch {
      this._backupOpEntryId = null;
      this._backupOpId = null;
      this._backupOpUnsub = null;
    }
  }

  private _applyBackupProgressToSnapshot(entryId: string, payload: BackupProgressEvent) {
    if (!this._snapshot.state) return;
    const isRunning = ["pending", "running"].includes(String(payload.status || ""));
    const hubs = this._snapshot.state.hubs.map((hub) =>
      hub.entry_id === entryId
        ? {
            ...hub,
            active_backup_operation: isRunning ? payload : null,
          }
        : hub,
    );
    this._snapshot = {
      ...this._snapshot,
      state: {
        ...this._snapshot.state,
        hubs,
      },
    };
    this.emit();
  }

  private async _teardownBackupOperationFeed() {
    const unsub = this._backupOpUnsub;
    this._backupOpUnsub = null;
    this._backupOpEntryId = null;
    this._backupOpId = null;
    if (!unsub) return;
    try {
      await unsub();
    } catch {
      /* ignore */
    }
  }

  private async _syncWifiPressFeed() {
    const hub = selectedHub(this._snapshot);
    const entryId = String(hub?.entry_id || "").trim() || null;

    if (!this._isConnected || !entryId || !this._snapshot.hass) {
      await this._teardownWifiPressFeed();
      return;
    }
    if (this._snapshot.wifiPressSubscribedEntryId === entryId && this._wifiPressUnsub) {
      return;
    }

    await this._teardownWifiPressFeed();
    const subscribeSeq = ++this._wifiPressSubscribeSeq;
    this._snapshot = { ...this._snapshot, wifiPressSubscribedEntryId: entryId };

    try {
      const unsubscribe = await this.api().subscribeWifiPresses(entryId, (payload) => {
        if (subscribeSeq !== this._wifiPressSubscribeSeq) return;
        if (this._snapshot.wifiPressSubscribedEntryId !== entryId) return;
        this._handleWifiPressMessage(entryId, payload);
      });
      if (subscribeSeq !== this._wifiPressSubscribeSeq) {
        try { unsubscribe(); } catch { /* ignore */ }
        return;
      }
      this._wifiPressUnsub = unsubscribe;
    } catch {
      // Wifi-press events are a UX-only enhancement; if the subscription
      // fails (older backend, transient WS error) we silently degrade
      // and the dock simply won't pulse — no user-visible error.
      if (subscribeSeq === this._wifiPressSubscribeSeq) {
        this._snapshot = { ...this._snapshot, wifiPressSubscribedEntryId: null };
      }
    }
  }

  private _handleWifiPressMessage(entryId: string, payload: unknown) {
    const message = (payload && typeof payload === "object") ? (payload as Record<string, unknown>) : null;
    if (!message) return;
    const timestamp = Number(message.timestamp);
    if (!Number.isFinite(timestamp)) return;
    const pressType = message.press_type === "long" ? "long" : "short";
    const commandIndex =
      typeof message.command_index === "number" && message.command_index >= 0
        ? Math.trunc(message.command_index)
        : null;
    const event: WifiPressEvent = {
      entryId,
      deviceId: typeof message.device_id === "number" ? message.device_id : null,
      deviceName:
        typeof message.device_name === "string" && message.device_name.trim()
          ? String(message.device_name)
          : null,
      commandIndex,
      commandLabel: typeof message.command_label === "string" ? String(message.command_label) : "",
      pressType,
      timestamp,
      // The server timestamp drives identity (so a card reopened mid-pulse
      // doesn't re-trigger); receivedAt drives the animation epoch so the
      // dock pulse restarts cleanly on every fresh press, even repeats.
      receivedAt: Date.now(),
    };
    this._snapshot = { ...this._snapshot, lastWifiPress: event };
    this.emit();
  }

  private async _teardownWifiPressFeed() {
    this._wifiPressSubscribeSeq++;
    const unsub = this._wifiPressUnsub;
    this._wifiPressUnsub = null;
    this._snapshot = { ...this._snapshot, wifiPressSubscribedEntryId: null };
    if (!unsub) return;
    try {
      await unsub();
    } catch {
      /* ignore */
    }
  }

  private async _syncHubEventsFeed() {
    const hub = selectedHub(this._snapshot);
    const entryId = String(hub?.entry_id || "").trim() || null;

    if (!this._isConnected || !entryId || !this._snapshot.hass) {
      await this._teardownHubEventsFeed();
      return;
    }
    if (this._snapshot.hubEventsSubscribedEntryId === entryId && this._hubEventsUnsub) {
      return;
    }

    await this._teardownHubEventsFeed();
    const subscribeSeq = ++this._hubEventsSubscribeSeq;
    this._snapshot = { ...this._snapshot, hubEventsSubscribedEntryId: entryId };

    try {
      const unsubscribe = await this.api().subscribeHubEvents(entryId, (payload) => {
        if (subscribeSeq !== this._hubEventsSubscribeSeq) return;
        if (this._snapshot.hubEventsSubscribedEntryId !== entryId) return;
        this._handleHubEventMessage(entryId, payload);
      });
      if (subscribeSeq !== this._hubEventsSubscribeSeq) {
        try { unsubscribe(); } catch { /* ignore */ }
        return;
      }
      this._hubEventsUnsub = unsubscribe;
    } catch {
      // Hub-event firings are a UX-only enhancement; if the subscription
      // fails (older backend, transient WS error) we silently degrade
      // and the rows in the Events tab simply won't glow.
      if (subscribeSeq === this._hubEventsSubscribeSeq) {
        this._snapshot = { ...this._snapshot, hubEventsSubscribedEntryId: null };
      }
    }
  }

  private _handleHubEventMessage(entryId: string, payload: unknown) {
    const message = (payload && typeof payload === "object") ? (payload as Record<string, unknown>) : null;
    if (!message) return;
    const timestamp = Number(message.timestamp);
    if (!Number.isFinite(timestamp)) return;
    const type = message.type === "redundant_off" ? "redundant_off" : message.type === "activity_change" ? "activity_change" : null;
    if (!type) return;
    const activityId = (value: unknown) =>
      typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
    const event: HubEventFireEvent = {
      entryId,
      type,
      fromActivityId: activityId(message.from_activity_id),
      toActivityId: activityId(message.to_activity_id),
      timestamp,
      // Same split as wifi presses: the server timestamp is identity, the
      // local receipt time drives the glow animation epoch.
      receivedAt: Date.now(),
    };
    this._snapshot = { ...this._snapshot, lastHubEvent: event };
    this.emit();
  }

  private async _teardownHubEventsFeed() {
    this._hubEventsSubscribeSeq++;
    const unsub = this._hubEventsUnsub;
    this._hubEventsUnsub = null;
    this._snapshot = { ...this._snapshot, hubEventsSubscribedEntryId: null };
    if (!unsub) return;
    try {
      await unsub();
    } catch {
      /* ignore */
    }
  }

  private emit() {
    this.onChange(this._snapshot);
  }
}
