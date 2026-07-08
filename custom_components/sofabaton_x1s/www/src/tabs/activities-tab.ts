/**
 * The live "Activities" tab (Phase L2 of
 * docs/internal/live-activity-editor-plan.md).
 *
 * Lists the hub's activities, captures the whole-hub bundle when one is
 * clicked (reusing the existing backup/export operation + progress
 * subscription), then hosts the extracted <sofabaton-edit-detail-view>
 * in mode="live". L2 is deliberately a skeleton: the edit view is
 * interactive but ephemeral — `bundle-change` updates an in-memory
 * `working` clone so drill-ins respond, but nothing is written back to the
 * hub, there is no dirty/Review/Sync, and only the captured `baseline` is
 * persisted to a localStorage session. Change tracking (L3) and the sync
 * engine (L4) build on top of this.
 */
import { LitElement, css, html, nothing } from "lit";
import { operationProgressStyles, renderOperationProgress } from "../components/operation-progress";
import type {
  BackupBundlePayload,
  BackupProgressEvent,
  CacheHubState,
  ControlPanelHubState,
  HassLike,
} from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { formatError, remoteAttrsForHub } from "../shared/utils/control-panel-selectors";
import { TOOLS_CARD_STRINGS } from "../strings";
import { diffActivityForReview, type ActivityReviewGroup } from "./activity-diff";
import "./edit-detail-view";
import "../components/refresh-cache-button";

type ActivitiesStage = "list" | "capturing" | "editing" | "syncing" | "sync_failed" | "needs_refresh";

interface ActivityListItem {
  id: number;
  name: string;
  deviceCount: number;
  shortcutCount: number;
}

const S = TOOLS_CARD_STRINGS.activities;

class SofabatonActivitiesTab extends LitElement {
  private static readonly _SESSION_TTL_MS = 60 * 60 * 1000;
  private static readonly _SESSION_KEY_PREFIX = "sofabaton_x1s:activities_tab:session:v1:";
  // Grace window after loading a bundle during which cache_generation
  // increases are absorbed (re-anchored) rather than flagged stale. The hub
  // bumps its generation many times as a refresh burst settles, so a naive
  // "built != current" check false-positives immediately after a refresh.
  private static readonly _STALE_GRACE_MS = 6000;

  static properties = {
    hass: { attribute: false },
    hub: { attribute: false },
    cacheHub: { attribute: false },
    refreshControlPanelState: { attribute: false },
    loading: { type: Boolean },
    error: { type: String },
    blockedTitle: { type: String },
    blockedMessage: { type: String },
    selectedHubProxyConnected: { type: Boolean },
    _stage: { state: true },
    _activityId: { state: true },
    _baseline: { state: true },
    _working: { state: true },
    _captureProgress: { state: true },
    _captureError: { state: true },
    _sessionRestored: { state: true },
    _sessionSavedAt: { state: true },
    _dirty: { state: true },
    _reviewOpen: { state: true },
    _discardConfirmOpen: { state: true },
    _syncProgress: { state: true },
    _syncError: { state: true },
    _syncFailedAt: { state: true },
    _syncSuccessNotice: { state: true },
    _cacheStale: { state: true },
  };

  static styles = [operationProgressStyles, css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      flex-direction: column;
    }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow: hidden; }
    .tab-panel--flush { padding: 0; }
    .state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); }
    .state.error { color: var(--error-color, #db4437); }
    .list-subtitle { font-size: 13px; line-height: 1.5; color: var(--secondary-text-color); }
    .list-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .activity-list { display: grid; gap: 6px; }
    .activity-row {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, 12px);
      padding: 10px 12px;
      background: var(--secondary-background-color, var(--ha-card-background));
      text-align: left;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease;
    }
    .activity-row:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .activity-row-lead { flex: 0 0 auto; color: var(--primary-color); display: inline-flex; }
    .activity-row-lead ha-icon { --mdc-icon-size: 22px; }
    .activity-row-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .activity-row-name { font-size: 14px; font-weight: 700; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .activity-row-meta { font-size: 12px; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .activity-row-chevron { flex: 0 0 auto; color: var(--secondary-text-color); display: inline-flex; }
    .activity-row-chevron ha-icon { --mdc-icon-size: 20px; }
    .guard-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      line-height: 1.6;
    }
    .guard-icon { color: var(--secondary-text-color); }
    .guard-icon ha-icon { --mdc-icon-size: 40px; }
    .guard-title { color: var(--primary-text-color); font-size: 16px; font-weight: 700; }
    .guard-sub { max-width: 360px; font-size: 13px; }
    .capture-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      line-height: 1.55;
    }
    .capture-error-title { color: var(--primary-text-color); font-size: 16px; font-weight: 700; }
    .action-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
    .btn {
      border: 1px solid var(--divider-color);
      border-radius: calc(var(--ha-card-border-radius, 12px) * 0.85);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: 700;
      padding: 8px 14px;
      cursor: pointer;
    }
    .btn:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .editing-shell { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .editing-shell sofabaton-edit-detail-view { flex: 1; min-height: 0; display: flex; }
    .session-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--divider-color);
      background: color-mix(in srgb, var(--primary-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      font-size: 13px;
    }
    .session-banner-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .session-banner-btn {
      flex: 0 0 auto;
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      background: transparent;
      color: var(--primary-color);
      font: inherit;
      font-weight: 700;
      padding: 4px 12px;
      cursor: pointer;
    }
    .session-banner-btn:hover { border-color: var(--primary-color); }
    .sync-success-banner { background: color-mix(in srgb, #48b851 14%, var(--ha-card-background, var(--card-background-color))); }
    .sync-success-banner .session-banner-text { display: inline-flex; align-items: center; gap: 6px; color: #2e7d32; }
    .sync-success-banner ha-icon { --mdc-icon-size: 18px; }
    .btn-danger { border-color: color-mix(in srgb, var(--error-color, #db4437) 55%, var(--divider-color)); color: var(--error-color, #db4437); }
    .btn-danger:hover { border-color: var(--error-color, #db4437); background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent); }
    /* Review / discard / sync dialogs (§4.4). */
    .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
    .dialog {
      width: min(640px, calc(100vw - 36px));
      max-height: min(82vh, 820px);
      display: flex;
      flex-direction: column;
      border-radius: calc(var(--ha-card-border-radius, 12px) * 1.33);
      border: 1px solid var(--divider-color);
      background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
      box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28));
      overflow: hidden;
    }
    .dialog--small { width: min(460px, calc(100vw - 36px)); }
    .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .dialog-header { border-bottom: 1px solid var(--divider-color); }
    .dialog-title { font-size: 16px; font-weight: 700; flex: 1; color: var(--primary-text-color); }
    .dialog-close {
      width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--divider-color); border-radius: calc(var(--ha-card-border-radius, 12px) * 0.7);
      background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); cursor: pointer;
    }
    .dialog-close:hover { border-color: var(--primary-color); color: var(--primary-text-color); }
    .dialog-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
    .dialog-text { font-size: 14px; line-height: 1.55; color: var(--primary-text-color); }
    .dialog-footer { border-top: 1px solid var(--divider-color); justify-content: space-between; }
    .dialog-footer-actions { display: flex; gap: 8px; }
    .review-group { display: flex; flex-direction: column; gap: 6px; }
    .review-group-title {
      font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color);
    }
    .review-entry-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
    .review-entry { font-size: 13.5px; line-height: 1.5; color: var(--primary-text-color); }
    .review-global-note { color: var(--secondary-text-color); font-style: italic; margin-left: 6px; }
    .review-empty { font-size: 14px; color: var(--secondary-text-color); }
    @media (max-width: 640px) {
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog--small { width: 100%; max-height: 100%; border-radius: 0; }
    }
  `];

  hass: HassLike | null = null;
  hub: ControlPanelHubState | null = null;
  cacheHub: CacheHubState | null = null;
  refreshControlPanelState?: (() => Promise<unknown> | void) | null;
  loading = false;
  error: string | null = null;
  blockedTitle: string | null = null;
  blockedMessage: string | null = null;
  selectedHubProxyConnected = false;

  private _stage: ActivitiesStage = "list";
  private _activityId: number | null = null;
  private _baseline: BackupBundlePayload | null = null;
  private _working: BackupBundlePayload | null = null;
  private _captureProgress: BackupProgressEvent | null = null;
  private _captureError: string | null = null;
  private _sessionRestored = false;
  private _sessionSavedAt = 0;
  private _dirty = false;
  private _reviewOpen = false;
  private _discardConfirmOpen = false;
  private _syncProgress: BackupProgressEvent | null = null;
  private _syncError: string | null = null;
  private _syncFailedAt: string | null = null;
  private _syncSuccessNotice = false;
  private _cacheStale = false;
  // The hub cache_generation observed when the current bundle was loaded into
  // the editor. The stale banner fires only when the backend moves *beyond*
  // this — i.e. the cache diverges from what the editor is showing.
  private _loadedGeneration = 0;
  private _staleGraceUntil = 0;

  private _captureOperationId: string | null = null;
  private _syncOperationId: string | null = null;
  private _progressUnsub: (() => void) | null = null;
  private _sessionRestoreTried = false;
  private _syncStateHydratedFor: string | null = null;
  // entry_id of the hub the current stage/session belongs to. The `hub` prop
  // is a fresh object on every control_panel/state refresh, so we key reset
  // decisions on the entry_id — not object identity — to avoid tearing down
  // an in-flight capture/edit whenever state refreshes.
  private _hubEntryId: string | null = null;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardownProgressSubscription();
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("hub")) {
      const nextEntryId = this.hub?.entry_id ?? null;
      // Only a *real* hub switch (entry_id change) resets the tab. The `hub`
      // prop object changes on every state refresh — including the one our
      // own capture triggers — so keying off object identity here would yank
      // the user out of an in-flight capture/edit and back to the list.
      if (this._hubEntryId !== null && nextEntryId !== this._hubEntryId) {
        this._teardownProgressSubscription();
        this._resetToList();
        this._sessionRestoreTried = false;
        this._syncStateHydratedFor = null;
      }
      this._hubEntryId = nextEntryId;
    }
    if (!this._sessionRestoreTried && this.hub && this._stage === "list" && !this._baseline) {
      this._sessionRestoreTried = true;
      this._restoreSession();
    }
    if (this.hub && this._syncStateHydratedFor !== this.hub.entry_id) {
      this._syncStateHydratedFor = this.hub.entry_id;
      void this._hydrateRunningSync();
    }
    if (changed.has("_baseline") || changed.has("_working") || changed.has("_activityId")) {
      this._persistSession();
    }
    if (changed.has("hass")) {
      this._evaluateCacheStaleness();
    }
  }

  // Card reloaded mid-sync: pick up a running activity_sync op from the
  // shared backup/state registry and resubscribe to its progress.
  private async _hydrateRunningSync() {
    if (!this.hub || !this.hass) return;
    try {
      const state = await this.api().getBackupState(this.hub.entry_id);
      const op = state?.activity_sync ?? null;
      const running = !!op && ["pending", "running"].includes(String(op.status || ""));
      if (running && op?.operation_id) {
        this._syncOperationId = op.operation_id;
        this._syncProgress = op;
        this._stage = "syncing";
        await this._subscribeSync(op.operation_id);
      }
    } catch {
      // Best-effort; a fresh sync can still be started.
    }
  }

  private api() {
    if (!this.hass) throw new Error("Home Assistant is not available");
    return new ControlPanelApi(this.hass);
  }

  // ── Session persistence (baseline + working; §4.6) ─────────────────

  private _sessionKey(): string | null {
    const entryId = this.hub?.entry_id;
    if (!entryId) return null;
    return `${SofabatonActivitiesTab._SESSION_KEY_PREFIX}${entryId}`;
  }

  private _persistSession() {
    const key = this._sessionKey();
    if (!key) return;
    try {
      if (!this._baseline || this._activityId == null) {
        window.localStorage.removeItem(key);
        return;
      }
      const captureGeneration = Number(remoteAttrsForHub(this.hass, this.hub).cache_generation ?? 0);
      const savedAt = this._sessionSavedAt || Date.now();
      this._sessionSavedAt = savedAt;
      const payload = {
        savedAt,
        activityId: this._activityId,
        baseline: this._baseline,
        working: this._working ?? this._baseline,
        dirty: this._dirty,
        captureGeneration,
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // localStorage can throw (quota, privacy mode) — degrade to memory-only.
    }
  }

  private _clearSession() {
    const key = this._sessionKey();
    if (!key) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  private _restoreSession() {
    const key = this._sessionKey();
    if (!key) return;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        savedAt?: number;
        activityId?: number;
        baseline?: unknown;
        working?: unknown;
        dirty?: boolean;
        captureGeneration?: number;
      };
      const savedAt = Number(parsed?.savedAt);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > SofabatonActivitiesTab._SESSION_TTL_MS) {
        window.localStorage.removeItem(key);
        return;
      }
      const baseline = parsed.baseline as BackupBundlePayload | undefined;
      const activityId = Number(parsed.activityId);
      if (!baseline || !Array.isArray(baseline.activities) || !Number.isFinite(activityId)) {
        window.localStorage.removeItem(key);
        return;
      }
      this._baseline = baseline;
      this._working = (parsed.working as BackupBundlePayload | undefined) ?? structuredClone(baseline);
      this._activityId = activityId;
      this._sessionSavedAt = savedAt;
      this._sessionRestored = true;
      this._recomputeDirty();
      // A restored session was captured earlier; anchor to the generation it
      // was saved at (no grace) so a hub change since then surfaces as stale.
      this._loadedGeneration = Number(parsed.captureGeneration ?? this._currentCacheGeneration());
      this._staleGraceUntil = 0;
      this._stage = "editing";
      this._evaluateCacheStaleness();
    } catch {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }

  // ── Capture flow (§4.2) — sourced from the blob-free structural cache ──
  // Instead of a multi-minute whole-hub blob backup, read the cached
  // structural hub_bundle (built by "Refresh entire hub cache"). If it's
  // missing, prompt the user to refresh; if it's older than the hub's current
  // cache generation, open the editor but flag it as possibly stale.

  private _startCapture = async (activityId: number) => {
    if (!this.hub || !this.hass) return;
    this._activityId = activityId;
    this._captureError = null;
    this._captureProgress = null;
    this._sessionRestored = false;
    this._cacheStale = false;
    this._stage = "capturing";
    try {
      const res = await this.api().getStructuralBundle(this.hub.entry_id);
      const bundle = res?.bundle ?? null;
      const hasActivity = !!bundle && (bundle.activities ?? []).some(
        (candidate) => Number(candidate.device?.device_id) === activityId,
      );
      if (!bundle || !hasActivity) {
        this._stage = "needs_refresh";
        return;
      }
      this._baseline = bundle;
      this._working = structuredClone(bundle);
      this._dirty = false;
      this._sessionSavedAt = Date.now();
      // Anchor staleness to the generation the frontend sees *now*, and give
      // the refresh burst a grace window to settle. The bundle's own build
      // generation is not used here (it lags the settled value); the backend
      // sync pre-flight is the authoritative guard against a truly stale load.
      this._loadedGeneration = this._currentCacheGeneration();
      this._staleGraceUntil = Date.now() + SofabatonActivitiesTab._STALE_GRACE_MS;
      this._cacheStale = false;
      this._stage = "editing";
    } catch (error) {
      this._captureError = formatError(error);
    }
  };

  private _teardownProgressSubscription() {
    const unsub = this._progressUnsub;
    this._progressUnsub = null;
    if (unsub) {
      try { unsub(); } catch { /* ignore */ }
    }
  }

  private _isProgressRunning(progress: BackupProgressEvent | null) {
    return !!progress && ["pending", "running"].includes(String(progress.status || ""));
  }

  // ── Editing (§4.3) — interactive but ephemeral in L2 ───────────────

  private _handleBundleChange = (event: CustomEvent<{ bundle: BackupBundlePayload }>) => {
    // The detail element already ran its HA-action prune sweep. Store the
    // edited bundle, recompute dirty against the captured baseline, and let
    // updated() persist it to the session (§4.4).
    this._working = event.detail.bundle;
    this._recomputeDirty();
  };

  private _recomputeDirty() {
    this._dirty = !!this._baseline
      && !!this._working
      && JSON.stringify(this._working) !== JSON.stringify(this._baseline);
  }

  private _currentCacheGeneration(): number {
    return Number(remoteAttrsForHub(this.hass, this.hub).cache_generation ?? 0);
  }

  // Re-evaluate whether the backend cache has diverged from the loaded bundle.
  // Called on every hass update while an activity is open. During the grace
  // window we absorb the settling bumps from our own refresh; after it, a
  // higher generation means a genuine change landed under the editor.
  private _evaluateCacheStaleness(): void {
    if (!this._baseline || this._stage !== "editing") return;
    const current = this._currentCacheGeneration();
    if (current <= this._loadedGeneration) return;
    if (Date.now() < this._staleGraceUntil) {
      this._loadedGeneration = current;
      return;
    }
    this._cacheStale = true;
  }

  // ── Review / Sync / Discard (§4.4) ─────────────────────────────────

  private _reviewGroups(): ActivityReviewGroup[] {
    if (this._activityId == null) return [];
    return diffActivityForReview(this._baseline, this._working, this._activityId);
  }

  private _openReview = () => {
    if (!this._dirty) return;
    this._reviewOpen = true;
  };

  private _closeReview = () => {
    this._reviewOpen = false;
  };

  // Start the real sync engine (§4.5): diff baseline vs working on the
  // backend and issue targeted in-place writes, streaming progress.
  private _requestSync = async () => {
    if (!this._dirty || this._activityId == null || !this.hub || !this._baseline || !this._working) return;
    this._reviewOpen = false;
    this._syncError = null;
    this._syncFailedAt = null;
    this._syncProgress = null;
    this._syncSuccessNotice = false;
    this._stage = "syncing";
    try {
      const start = await this.api().startActivitySync(
        this.hub.entry_id,
        this._activityId,
        this._baseline,
        this._working,
      );
      this._syncOperationId = start.operation_id;
      await this.refreshControlPanelState?.();
      await this._subscribeSync(start.operation_id);
    } catch (error) {
      this._syncError = formatError(error);
      this._syncFailedAt = null;
      this._stage = "sync_failed";
    }
  };

  private async _subscribeSync(operationId: string) {
    this._teardownProgressSubscription();
    const unsub = await this.api().subscribeBackupProgress(operationId, async (payload) => {
      if (payload.status === "success") {
        this._teardownProgressSubscription();
        await this._onSyncSuccess(operationId);
        return;
      }
      if (payload.status === "failed") {
        this._teardownProgressSubscription();
        this._syncError = String(payload.error || payload.message || "Sync failed.");
        this._syncFailedAt = String(payload.failed_at || "");
        this._syncProgress = null;
        this._stage = "sync_failed";
        return;
      }
      this._syncProgress = payload;
    });
    this._progressUnsub = unsub;
  }

  private async _onSyncSuccess(operationId: string) {
    // Promote working → baseline so the editor's baseline advances; dirty
    // clears and the session persists the new baseline.
    if (this._working) this._baseline = structuredClone(this._working);
    this._recomputeDirty();
    this._syncProgress = null;
    this._syncOperationId = null;
    this._sessionSavedAt = Date.now();
    this._syncSuccessNotice = true;
    // Our own sync bumps cache_generation (post-sync cache refresh); re-anchor
    // so that self-inflicted bump isn't mistaken for an external change.
    this._loadedGeneration = this._currentCacheGeneration();
    this._staleGraceUntil = Date.now() + SofabatonActivitiesTab._STALE_GRACE_MS;
    this._cacheStale = false;
    this._stage = "editing";
    try { await this.api().clearBackupResult(operationId); } catch { /* ignore */ }
    try { await this.refreshControlPanelState?.(); } catch { /* ignore */ }
  }

  private _retrySync = () => {
    void this._requestSync();
  };

  private _openDiscardConfirm = () => {
    if (!this._dirty) return;
    this._discardConfirmOpen = true;
  };

  private _closeDiscardConfirm = () => {
    this._discardConfirmOpen = false;
  };

  private _discardChanges = () => {
    if (this._baseline) this._working = structuredClone(this._baseline);
    this._recomputeDirty();
    this._reviewOpen = false;
    this._discardConfirmOpen = false;
  };

  private _closeEditor = () => {
    // Leaving the editor deliberately discards the draft and its persisted
    // session; a re-open re-captures fresh from the hub.
    this._clearSession();
    this._resetToList();
  };

  private _reloadFromHub = () => {
    if (this._activityId == null) return;
    void this._startCapture(this._activityId);
  };

  private _resetToList() {
    this._stage = "list";
    this._activityId = null;
    this._baseline = null;
    this._working = null;
    this._captureProgress = null;
    this._captureError = null;
    this._captureOperationId = null;
    this._sessionRestored = false;
    this._sessionSavedAt = 0;
    this._dirty = false;
    this._reviewOpen = false;
    this._discardConfirmOpen = false;
    this._syncProgress = null;
    this._syncError = null;
    this._syncFailedAt = null;
    this._syncOperationId = null;
    this._syncSuccessNotice = false;
    this._cacheStale = false;
    this._loadedGeneration = 0;
    this._staleGraceUntil = 0;
  }

  // ── Data ───────────────────────────────────────────────────────────

  private _activityItems(): ActivityListItem[] {
    // Source: the persistent cache (`cacheHub.activities`) — the same source
    // the Cache tab renders from, which carries id/name plus favorite/macro
    // counts. Fall back to the control-panel/state hub summary if the cache
    // hasn't populated yet.
    const activities = (this.cacheHub?.activities ?? this.hub?.activities ?? []) as Array<{
      id: number;
      name?: string;
      favorite_count?: number;
      macro_count?: number;
    }>;
    const cacheFavorites = this.cacheHub?.activity_favorites ?? {};
    const cacheMacros = this.cacheHub?.activity_macros ?? {};
    return [...activities]
      .map((activity) => {
        const id = Number(activity.id);
        const key = String(id);
        const favorites = Number(
          activity.favorite_count ?? (Array.isArray(cacheFavorites[key]) ? cacheFavorites[key].length : 0),
        );
        const macros = Number(
          activity.macro_count ?? (Array.isArray(cacheMacros[key]) ? cacheMacros[key].length : 0),
        );
        return {
          id,
          // Device membership isn't surfaced on the hub-state activity
          // summary (nor cheaply derivable from the cache), so the list meta
          // line shows only the shortcut count until capture reveals the
          // precise device set. rowMeta renders 0 devices gracefully.
          name: String(activity.name || "").trim() || S.activityFallback(id),
          deviceCount: 0,
          shortcutCount: favorites + macros,
        };
      })
      .sort((left, right) => left.id - right.id);
  }

  // ── Render ─────────────────────────────────────────────────────────

  protected render() {
    if (this.loading) {
      return html`<div class="tab-panel"><div class="state">${S.loading}</div></div>`;
    }
    if (this.error) {
      return html`<div class="tab-panel"><div class="state error">${this.error}</div></div>`;
    }
    if (!this.hub || !this.hass) {
      return html`<div class="tab-panel"><div class="state">${S.selectHub}</div></div>`;
    }
    if (this.blockedTitle && this.blockedMessage) {
      return this._renderGuard("mdi:lan-disconnect", this.blockedTitle, this.blockedMessage);
    }

    if (this._stage === "needs_refresh") {
      return this._renderNeedsRefresh();
    }
    if (this._stage === "syncing") {
      return this._renderSyncing();
    }
    if (this._stage === "sync_failed") {
      return this._renderSyncFailed();
    }
    if (this._stage === "editing" && this._baseline && this._working && this._activityId != null) {
      return this._renderEditing();
    }
    if (this._stage === "capturing") {
      return this._renderCapturing();
    }
    return this._renderList();
  }

  private _renderGuard(icon: string, title: string, sub: string) {
    return html`
      <div class="tab-panel">
        <div class="guard-state">
          <div class="guard-icon"><ha-icon icon=${icon}></ha-icon></div>
          <div class="guard-title">${title}</div>
          <div class="guard-sub">${sub}</div>
        </div>
      </div>
    `;
  }

  private _renderList() {
    // Guard panels (§4.1), full-panel, in priority order.
    if (this.selectedHubProxyConnected) {
      return this._renderGuard("mdi:cellphone-link", S.appConnectedTitle, S.appConnectedBody);
    }
    if (this._isProgressRunning(this.hub?.active_backup_operation ?? null)) {
      return this._renderGuard("mdi:progress-clock", S.operationRunningTitle, S.operationRunningBody);
    }
    const items = this._activityItems();
    if (!items.length) {
      return this._renderGuard("mdi:playlist-remove", S.emptyTitle, S.emptyBody);
    }
    return html`
      <div class="tab-panel">
        <div class="list-subtitle">${S.listSubtitle}</div>
        <div class="list-scroll">
          <div class="activity-list">
            ${items.map((item) => html`
              <button class="activity-row" @click=${() => void this._startCapture(item.id)}>
                <span class="activity-row-lead"><ha-icon icon="mdi:play-circle-outline"></ha-icon></span>
                <span class="activity-row-main">
                  <span class="activity-row-name">${item.name}</span>
                  <span class="activity-row-meta">${S.rowMeta(item.deviceCount, item.shortcutCount)}</span>
                </span>
                <span class="activity-row-chevron"><ha-icon icon="mdi:chevron-right"></ha-icon></span>
              </button>
            `)}
          </div>
        </div>
      </div>
    `;
  }

  private _renderCapturing() {
    if (this._captureError) {
      return html`
        <div class="tab-panel">
          <div class="capture-error">
            <div class="guard-icon"><ha-icon icon="mdi:alert-circle-outline"></ha-icon></div>
            <div class="capture-error-title">${S.captureFailedTitle}</div>
            <div class="guard-sub">${this._captureError}</div>
            <div class="action-row">
              <button class="btn btn-primary" @click=${this._reloadFromHub}>${S.retry}</button>
              <button class="btn" @click=${() => this._resetToList()}>${S.back}</button>
            </div>
          </div>
        </div>
      `;
    }
    return html`
      <div class="tab-panel">
        <div class="guard-state">
          <div class="guard-icon"><ha-icon icon="mdi:database-arrow-down-outline"></ha-icon></div>
          <div class="guard-sub">${S.capturingFromCache}</div>
        </div>
      </div>
    `;
  }

  private _renderNeedsRefresh() {
    const S = TOOLS_CARD_STRINGS.activities;
    return html`
      <div class="tab-panel">
        <div class="capture-error">
          <div class="guard-icon"><ha-icon icon="mdi:database-refresh-outline"></ha-icon></div>
          <div class="capture-error-title">${S.needsRefreshTitle}</div>
          <div class="guard-sub">${S.needsRefreshBody}</div>
          <div class="action-row">
            <sofabaton-refresh-cache-button
              .hass=${this.hass}
              .entryId=${this.hub?.entry_id ?? ""}
              @refreshed=${() => { if (this._activityId != null) void this._startCapture(this._activityId); }}
            ></sofabaton-refresh-cache-button>
            <button class="btn" @click=${() => this._resetToList()}>${S.back}</button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderEditing() {
    return html`
      <div class="editing-shell">
        ${this._sessionRestored ? this._renderSessionBanner() : nothing}
        ${this._syncSuccessNotice ? this._renderSyncSuccessBanner() : nothing}
        ${this._cacheStale ? this._renderStaleCacheBanner() : nothing}
        <sofabaton-edit-detail-view
          .bundle=${this._working}
          kind="activity"
          .entityId=${this._activityId}
          .dirty=${this._dirty}
          mode="live"
          @bundle-change=${this._handleBundleChange}
          @review-request=${this._openReview}
          @sync-request=${this._requestSync}
          @discard-request=${this._openDiscardConfirm}
          @close=${this._closeEditor}
        ></sofabaton-edit-detail-view>
        ${this._reviewOpen ? this._renderReviewDialog() : nothing}
        ${this._discardConfirmOpen ? this._renderDiscardDialog() : nothing}
      </div>
    `;
  }

  private _renderStaleCacheBanner() {
    const S = TOOLS_CARD_STRINGS.activities;
    return html`
      <div class="session-banner">
        <span class="session-banner-text">${S.cacheStaleBanner}</span>
        <sofabaton-refresh-cache-button
          .hass=${this.hass}
          .entryId=${this.hub?.entry_id ?? ""}
          .label=${S.cacheStaleRefresh}
          @refreshed=${() => { if (this._activityId != null) void this._startCapture(this._activityId); }}
        ></sofabaton-refresh-cache-button>
      </div>
    `;
  }

  private _renderSyncSuccessBanner() {
    return html`
      <div class="session-banner sync-success-banner">
        <span class="session-banner-text"><ha-icon icon="mdi:check-circle-outline"></ha-icon> ${TOOLS_CARD_STRINGS.activities.syncSuccess}</span>
        <button class="session-banner-btn" @click=${() => { this._syncSuccessNotice = false; }}>${TOOLS_CARD_STRINGS.activities.discardConfirmCancel}</button>
      </div>
    `;
  }

  private _renderSyncing() {
    const S = TOOLS_CARD_STRINGS.activities;
    const progress = this._syncProgress;
    const message = String(progress?.message || S.syncingMessage);
    return html`
      <div class="tab-panel">
        ${renderOperationProgress({ mode: "restore", title: S.syncingTitle, message })}
      </div>
    `;
  }

  private _renderSyncFailed() {
    const S = TOOLS_CARD_STRINGS.activities;
    const isStale = this._syncFailedAt === "stale_check";
    return html`
      <div class="tab-panel">
        <div class="capture-error">
          <div class="guard-icon"><ha-icon icon=${isStale ? "mdi:sync-alert" : "mdi:alert-circle-outline"}></ha-icon></div>
          <div class="capture-error-title">${isStale ? S.syncStaleTitle : S.syncFailedTitle}</div>
          <div class="guard-sub">
            ${isStale ? S.syncStaleBody : (this._syncError || S.syncFailedStep(String(this._syncFailedAt || "")))}
          </div>
          <div class="action-row">
            ${isStale
              ? nothing
              : html`<button class="btn btn-primary" @click=${this._retrySync}>${S.syncRetry}</button>`}
            <button class="btn ${isStale ? "btn-primary" : ""}" @click=${this._reloadFromHub}>${S.syncReload}</button>
            <button class="btn" @click=${() => { this._stage = "editing"; this._syncError = null; this._syncFailedAt = null; }}>${S.back}</button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderReviewDialog() {
    const S = TOOLS_CARD_STRINGS.activities;
    const groups = this._reviewGroups();
    return html`
      <div class="modal-backdrop" @click=${this._closeReview}>
        <div class="dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S.reviewTitle}</div>
            <button class="dialog-close" @click=${this._closeReview}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${groups.length
              ? groups.map((group) => html`
                  <div class="review-group">
                    <div class="review-group-title">${this._reviewSectionTitle(group.section)}</div>
                    <ul class="review-entry-list">
                      ${group.entries.map((entry) => html`
                        <li class="review-entry">
                          ${entry.text}
                          ${entry.global
                            ? html`<span class="review-global-note">(${S.reviewAppliesEverywhere})</span>`
                            : nothing}
                        </li>
                      `)}
                    </ul>
                  </div>
                `)
              : html`<div class="review-empty">${S.reviewEmpty}</div>`}
          </div>
          <div class="dialog-footer">
            <button class="btn btn-danger" @click=${this._openDiscardConfirm}>${S.reviewDiscardAll}</button>
            <div class="dialog-footer-actions">
              <button class="btn" @click=${this._closeReview}>${S.reviewKeepEditing}</button>
              <button class="btn btn-primary" @click=${this._requestSync}>${S.reviewSyncNow}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _reviewSectionTitle(section: ActivityReviewGroup["section"]): string {
    const R = TOOLS_CARD_STRINGS.activities.review;
    switch (section) {
      case "devices": return R.sectionDevices;
      case "start": return R.sectionStart;
      case "buttons": return R.sectionButtons;
      case "shortcuts": return R.sectionShortcuts;
      case "end": return R.sectionEnd;
      case "device_wide": return R.sectionDeviceWide;
    }
  }

  private _renderDiscardDialog() {
    const S = TOOLS_CARD_STRINGS.activities;
    return html`
      <div class="modal-backdrop" @click=${this._closeDiscardConfirm}>
        <div class="dialog dialog--small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S.discardConfirmTitle}</div>
            <button class="dialog-close" @click=${this._closeDiscardConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body"><div class="dialog-text">${S.discardConfirmBody}</div></div>
          <div class="dialog-footer">
            <span></span>
            <div class="dialog-footer-actions">
              <button class="btn" @click=${this._closeDiscardConfirm}>${S.discardConfirmCancel}</button>
              <button class="btn btn-danger" @click=${this._discardChanges}>${S.discardConfirmConfirm}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }


  private _renderSessionBanner() {
    const activity = (this._baseline?.activities ?? []).find(
      (candidate) => Number(candidate.device?.device_id) === this._activityId,
    );
    const name = String(activity?.device?.name || "").trim()
      || S.activityFallback(Number(this._activityId));
    const time = new Date(this._sessionSavedAt || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return html`
      <div class="session-banner">
        <span class="session-banner-text">${S.sessionRestoreBanner(name, time)}</span>
        <button class="session-banner-btn" @click=${this._reloadFromHub}>${S.sessionReload}</button>
      </div>
    `;
  }
}

if (!customElements.get("sofabaton-activities-tab")) {
  customElements.define("sofabaton-activities-tab", SofabatonActivitiesTab);
}
