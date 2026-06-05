import type {
  BackupProgressEvent,
  BackupSectionId,
  BlobsSectionId,
  ControlPanelSnapshot,
  HassLike,
  HubAction,
  RefreshKind,
  RuntimeCompletionNotice,
  SectionId,
  SettingKey,
  TabId,
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
const VALID_TABS = new Set<TabId>(["settings", "wifi_commands", "blobs", "backup", "cache", "logs"]);
const VALID_CACHE_SECTIONS = new Set<SectionId>(["activities", "devices"]);
const VALID_BACKUP_SECTIONS = new Set<BackupSectionId>(["make", "edit", "restore"]);
const VALID_BLOBS_SECTIONS = new Set<BlobsSectionId>(["fetch", "test", "save"]);

interface PersistedViewState {
  selectedHubEntryId?: string | null;
  selectedTab?: TabId;
  selectedCacheSection?: SectionId;
  selectedBackupSection?: BackupSectionId;
  selectedBlobsSection?: BlobsSectionId;
  openSection?: SectionId | null;
  openBackupSection?: BackupSectionId;
  openBlobsSection?: BlobsSectionId | null;
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
    const selectedBlobsSection = VALID_BLOBS_SECTIONS.has(parsed?.selectedBlobsSection as BlobsSectionId)
      ? (parsed.selectedBlobsSection as BlobsSectionId)
      : VALID_BLOBS_SECTIONS.has(parsed?.openBlobsSection as BlobsSectionId)
        ? (parsed.openBlobsSection as BlobsSectionId)
        : "fetch";
    return {
      selectedHubEntryId,
      ...(selectedTab ? { selectedTab } : {}),
      selectedCacheSection,
      selectedBackupSection,
      selectedBlobsSection,
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
  selectedBlobsSection: "fetch",
  openEntity: null,
  staleData: false,
  refreshBusy: false,
  activeRefreshLabel: null,
  externalHubCommandBusy: false,
  externalHubCommandLabel: null,
  runtimeCompletionNotice: null,
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
  private _runtimeCompletionTimer: ReturnType<typeof setTimeout> | null = null;
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
    this._scheduleRuntimeStatePoll();
    if (this._snapshot.selectedTab === "logs") {
      void this.syncLogsFeed();
    }
  }

  disconnected() {
    this._isConnected = false;
    this._snapshot = {
      ...this._snapshot,
      externalHubCommandBusy: false,
      externalHubCommandLabel: null,
      runtimeCompletionNotice: null,
    };
    this._clearRuntimeStatePoll();
    this._clearRuntimeCompletionTimer();
    this._clearBackendRetry();
    void this._teardownBackupOperationFeed();
    void this.unsubscribeLogs();
  }

  private _clearBackendRetry() {
    if (this._backendRetryTimer) {
      clearTimeout(this._backendRetryTimer);
      this._backendRetryTimer = null;
    }
    this._backendRetryDelay = BACKEND_RETRY_MIN_MS;
  }

  private _clearRuntimeCompletionTimer() {
    if (this._runtimeCompletionTimer) {
      clearTimeout(this._runtimeCompletionTimer);
      this._runtimeCompletionTimer = null;
    }
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
    if (hub?.runtime_state?.kind !== "operation_running") return;
    this._runtimeStatePollTimer = setTimeout(() => {
      this._runtimeStatePollTimer = null;
      void this._refreshRuntimeState();
    }, 1000);
  }

  private async _refreshRuntimeState() {
    if (!this._isConnected) return;
    const previousHub = selectedHub(this._snapshot);
    const previousRuntime = previousHub?.runtime_state;
    try {
      await this.loadControlPanelState();
      const nextHub = selectedHub(this._snapshot);
      const nextRuntime = nextHub?.runtime_state;
      if (
        previousRuntime?.kind === "operation_running"
        && nextRuntime?.kind !== "operation_running"
      ) {
        const operation = previousRuntime.operation;
        const successLabel = operation === "backup_restore"
          ? "Restore completed successfully."
          : operation === "backup_export"
            ? "Backup completed successfully."
            : "Wifi Device deployed successfully.";
        this.showRuntimeCompletion({
          tone: "success",
          label: successLabel,
        });
      }
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
        !this._isHubCommandBusy() &&
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
      externalHubCommandBusy: false,
      externalHubCommandLabel: null,
      runtimeCompletionNotice: null,
    };
    this._clearRuntimeCompletionTimer();
    this.persistViewState();
    this.emit();
    void (async () => {
      await this._teardownBackupOperationFeed();
      await this.unsubscribeLogs();
      await this.loadControlPanelState();
      await this._syncBackupOperationFeed();
      if (this._snapshot.selectedTab === "logs") await this.syncLogsFeed();
    })();
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

  setSelectedBlobsSection(sectionId: BlobsSectionId) {
    if (this._snapshot.selectedBlobsSection === sectionId) return;
    this._snapshot = { ...this._snapshot, selectedBlobsSection: sectionId };
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

  setExternalHubCommandBusy(busy: boolean, label: string | null = null) {
    this._snapshot = {
      ...this._snapshot,
      externalHubCommandBusy: busy,
      externalHubCommandLabel: busy ? String(label || "").trim() || "Hub command in progress…" : null,
    };
    this.emit();
  }

  showRuntimeCompletion(notice: RuntimeCompletionNotice | null, ttlMs = 4000) {
    this._clearRuntimeCompletionTimer();
    this._snapshot = {
      ...this._snapshot,
      runtimeCompletionNotice: notice,
    };
    this.emit();
    if (!notice) return;
    this._runtimeCompletionTimer = setTimeout(() => {
      this._runtimeCompletionTimer = null;
      if (!this._snapshot.runtimeCompletionNotice) return;
      this._snapshot = {
        ...this._snapshot,
        runtimeCompletionNotice: null,
      };
      this.emit();
    }, ttlMs);
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

  async refreshSection(sectionId: SectionId) {
    if (this._isHubCommandBusy()) return;
    const hub = selectedHub(this._snapshot);
    if (!hub) return;
    this._snapshot = { ...this._snapshot, refreshBusy: true, activeRefreshLabel: null };
    this.emit();
    try {
      await this.api().refreshCatalog(hub.entry_id, sectionId);
      await this.loadState({ silent: true });
    } finally {
      this._snapshot = {
        ...this._snapshot,
        refreshBusy: false,
        activeRefreshLabel: null,
        staleData: false,
      };
      this.emit();
    }
  }

  async refreshForHub(kind: RefreshKind, targetId: number, key: string) {
    if (this._isHubCommandBusy()) return;
    const hub = selectedHub(this._snapshot);
    if (!hub) return;
    this._snapshot = { ...this._snapshot, refreshBusy: true, activeRefreshLabel: key };
    this.emit();
    try {
      await this.api().refreshCacheEntry({
        hubEntryId: hub.entry_id,
        entityId: entityForHub(this._snapshot.hass, hub),
        kind,
        targetId,
      });
      await this.loadState({ silent: true });
    } finally {
      this._snapshot = {
        ...this._snapshot,
        refreshBusy: false,
        activeRefreshLabel: null,
        staleData: false,
        pendingScrollEntityKey: key,
      };
      this.emit();
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
    const expectedVersion = normalizeExpectedFrontendVersion(state?.tools_frontend_version);
    this._snapshot = {
      ...this._snapshot,
      state,
      loadError: null,
      toolsFrontendVersionExpected: expectedVersion,
      toolsFrontendVersionMismatch:
        expectedVersion !== null && expectedVersion !== this._loadedFrontendVersion,
    };
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
          selectedBlobsSection: this._snapshot.selectedBlobsSection,
        } satisfies PersistedViewState),
      );
    } catch (_error) {
      // Ignore storage access failures.
    }
  }

  private _isHubCommandBusy() {
    const hub = selectedHub(this._snapshot);
    const activeBackupOperation = hub?.active_backup_operation;
    const backupBusy =
      !!activeBackupOperation &&
      ["pending", "running"].includes(String(activeBackupOperation.status || ""));
    return Boolean(
      this._snapshot.refreshBusy ||
      this._snapshot.externalHubCommandBusy ||
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

  private emit() {
    this.onChange(this._snapshot);
  }
}
