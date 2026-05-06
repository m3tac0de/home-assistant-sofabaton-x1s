import type {
  ControlPanelSnapshot,
  HassLike,
  HubAction,
  RefreshKind,
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
  persistentCacheEnabled,
  proxyClientConnected,
  selectedHub,
} from "../shared/utils/control-panel-selectors";

const VIEW_STATE_STORAGE_KEY = "sofabaton_x1s:tools_card:view_state:v1";
const VALID_TABS = new Set<TabId>(["hub", "settings", "wifi_commands", "cache", "logs"]);

interface PersistedViewState {
  selectedHubEntryId?: string | null;
  selectedTab?: TabId;
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
    return {
      selectedHubEntryId,
      ...(selectedTab ? { selectedTab } : {}),
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
  selectedHubEntryId: null,
  selectedTab: "hub",
  openSection: "activities",
  openEntity: null,
  staleData: false,
  refreshBusy: false,
  activeRefreshLabel: null,
  externalHubCommandBusy: false,
  externalHubCommandLabel: null,
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
  private _lastObservedGenerations = cacheGenerationSnapshot(null);
  private _lastHassFingerprint = "";
  private _lastConnectionFingerprint = "";
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
    }
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
    };
    this.unsubscribeLogs();
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
    };
    this.persistViewState();
    this.unsubscribeLogs();
    this.emit();
    void this.loadControlPanelState().finally(() => {
      if (this._snapshot.selectedTab === "logs") void this.syncLogsFeed();
    });
  }

  selectTab(tabId: TabId) {
    const nextTab = tabId === "cache" && !persistentCacheEnabled(this._snapshot) ? "settings" : tabId;
    this._snapshot = {
      ...this._snapshot,
      selectedTab: nextTab,
      logsStickToBottom: nextTab === "logs" ? true : this._snapshot.logsStickToBottom,
      logsScrollBehavior: nextTab === "logs" ? "auto" : this._snapshot.logsScrollBehavior,
    };
    this.persistViewState();
    if (nextTab === "logs") void this.syncLogsFeed();
    else this.unsubscribeLogs();
    this.emit();
  }

  toggleSection(sectionId: SectionId) {
    this._snapshot = {
      ...this._snapshot,
      openSection: this._snapshot.openSection === sectionId ? null : sectionId,
      openEntity: null,
    };
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
      } catch (error) {
        this._snapshot = { ...this._snapshot, loadError: formatError(error) };
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
    const state = await this.api().loadState();
    this.applyControlPanelState(state);
    this.syncSelection();
    this.emit();
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
        if (!enabled && this._snapshot.selectedTab === "cache") {
          this._snapshot = { ...this._snapshot, selectedTab: "settings" };
          await this.loadState();
          return;
        }
        if (enabled) await this.loadCacheContents();
        else await this.loadControlPanelState();
      } else {
        await this.loadControlPanelState();
      }
      if (this._snapshot.selectedTab === "cache" && !persistentCacheEnabled(this._snapshot)) {
        this._snapshot = { ...this._snapshot, selectedTab: "settings" };
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
      this.unsubscribeLogs();
      return;
    }

    const entryId = hub.entry_id;
    if (this._snapshot.logsLoadedEntryId !== entryId && !this._snapshot.logsLoading) {
      this._snapshot = { ...this._snapshot, logsStickToBottom: true };
      this.emit();
      void this.loadHubLogs(entryId);
    }

    if (this._snapshot.logsSubscribedEntryId === entryId) return;

    this.unsubscribeLogs();
    this._snapshot = { ...this._snapshot, logsSubscribedEntryId: entryId };
    this.emit();

    try {
      const unsubscribe = await this.api().subscribeLogs(entryId, (payload) => {
        if (this._snapshot.logsSubscribedEntryId !== entryId) return;
        this.handleHubLogMessage(entryId, payload);
      });
      if (this._snapshot.logsSubscribedEntryId !== entryId) {
        unsubscribe();
        return;
      }
      this._logsUnsub = unsubscribe;
      await this.loadHubLogs(entryId, { preserveLines: true });
    } catch (error) {
      if (this._snapshot.logsSubscribedEntryId !== entryId) return;
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
      this._snapshot = {
        ...this._snapshot,
        logsError: formatError(error),
        logsLoadedEntryId: entryId,
      };
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

  private unsubscribeLogs() {
    this._logsUnsub?.();
    this._logsUnsub = null;
    this._snapshot = { ...this._snapshot, logsSubscribedEntryId: null };
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
    if (this._snapshot.selectedTab === "cache" && !persistentCacheEnabled(this._snapshot)) {
      this._snapshot = { ...this._snapshot, selectedTab: "settings" };
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
        } satisfies PersistedViewState),
      );
    } catch (_error) {
      // Ignore storage access failures.
    }
  }

  private _isHubCommandBusy() {
    return Boolean(
      this._snapshot.refreshBusy ||
      this._snapshot.externalHubCommandBusy ||
      this._snapshot.pendingActionKey,
    );
  }

  private emit() {
    this.onChange(this._snapshot);
  }
}
