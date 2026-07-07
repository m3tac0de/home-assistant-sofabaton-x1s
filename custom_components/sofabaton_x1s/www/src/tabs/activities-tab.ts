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
import "./edit-detail-view";

type ActivitiesStage = "list" | "capturing" | "editing";

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

  private _captureOperationId: string | null = null;
  private _progressUnsub: (() => void) | null = null;
  private _sessionRestoreTried = false;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardownProgressSubscription();
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("hub")) {
      // Hub identity changed — a captured/edited activity belongs to the
      // previous hub. Drop the in-memory session and re-attempt restore
      // against the newly selected hub's stored session.
      this._teardownProgressSubscription();
      this._resetToList();
      this._sessionRestoreTried = false;
    }
    if (!this._sessionRestoreTried && this.hub && this._stage === "list" && !this._baseline) {
      this._sessionRestoreTried = true;
      this._restoreSession();
    }
    if (changed.has("_baseline") || changed.has("_working") || changed.has("_activityId")) {
      this._persistSession();
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
      this._stage = "editing";
    } catch {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }

  // ── Capture flow (§4.2) ────────────────────────────────────────────

  private _startCapture = async (activityId: number) => {
    if (!this.hub) return;
    this._activityId = activityId;
    this._captureError = null;
    this._captureProgress = null;
    this._sessionRestored = false;
    this._stage = "capturing";
    try {
      const start = await this.api().startBackupExport(this.hub.entry_id, null);
      this._captureOperationId = start.operation_id;
      await this.refreshControlPanelState?.();
      await this._subscribeCapture(start.operation_id);
    } catch (error) {
      this._captureError = formatError(error);
    }
  };

  private async _subscribeCapture(operationId: string) {
    this._teardownProgressSubscription();
    const unsubscribe = await this.api().subscribeBackupProgress(operationId, async (payload) => {
      const transient = Boolean((payload as { transient?: boolean })?.transient);
      if (transient && payload.status === "failed") {
        this._captureError = String(payload.error || payload.message || S.captureFailedBody);
        this._teardownProgressSubscription();
        return;
      }
      this._captureProgress = payload;
      if (payload.status === "success") {
        const bundle = payload.backup ?? null;
        this._teardownProgressSubscription();
        if (bundle) {
          this._baseline = bundle;
          this._working = structuredClone(bundle);
          this._sessionSavedAt = Date.now();
          this._sessionRestored = false;
          this._captureProgress = null;
          this._stage = "editing";
        } else {
          this._captureError = S.captureFailedBody;
        }
        try {
          await this.refreshControlPanelState?.();
        } catch {
          // Ignore refresh failures; the captured bundle is already in hand.
        }
      } else if (payload.status === "failed") {
        this._captureError = String(payload.error || payload.message || S.captureFailedBody);
        this._teardownProgressSubscription();
      }
      if (!this._isProgressRunning(payload)) {
        this._teardownProgressSubscription();
      }
    });
    this._progressUnsub = unsubscribe;
  }

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
    // The detail element already ran its HA-action prune sweep. In L2 the
    // edited bundle is ephemeral: keep it in memory so drill-ins respond,
    // but do not mark anything for sync.
    this._working = event.detail.bundle;
  };

  private _closeEditor = () => {
    // Leaving the editor deliberately discards the (ephemeral) draft and its
    // persisted baseline; a re-open re-captures fresh from the hub.
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
  }

  // ── Data ───────────────────────────────────────────────────────────

  private _activityItems(): ActivityListItem[] {
    const activities = this.hub?.activities ?? [];
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
        ${renderOperationProgress({
          mode: "backup",
          title: S.captureTitle,
          message: this._captureMessage(),
        })}
      </div>
    `;
  }

  private _captureMessage(): string {
    const progress = this._captureProgress;
    const current = Number(progress?.completed_steps ?? 0);
    const total = Number(progress?.total_steps ?? 0);
    if (total > 0 && current > 0) {
      return S.captureMessageWithStep(Math.min(current, total), total);
    }
    return String(progress?.message || S.captureMessage);
  }

  private _renderEditing() {
    return html`
      <div class="editing-shell">
        ${this._sessionRestored ? this._renderSessionBanner() : nothing}
        <sofabaton-edit-detail-view
          .bundle=${this._working}
          kind="activity"
          .entityId=${this._activityId}
          .dirty=${false}
          mode="live"
          @bundle-change=${this._handleBundleChange}
          @close=${this._closeEditor}
        ></sofabaton-edit-detail-view>
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
