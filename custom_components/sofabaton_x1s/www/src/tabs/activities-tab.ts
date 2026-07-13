/**
 * The live entity editor session (Phase L2 of
 * docs/internal/live-activity-editor-plan.md, extended to devices).
 *
 * Opened from the Hub tab's Activities or Devices list (wrench button) with
 * `kind` + `entityId` set: it captures that entity's bundle from the
 * structural cache, then hosts the extracted <sofabaton-edit-detail-view>
 * in mode="live". `bundle-change` updates an in-memory `working` clone;
 * changes stay alive while this edit view is active and are written to the
 * hub only through the sync flow (`activity/sync` or `device/sync`).
 * Leaving the editor dispatches `editor-exit` so the host card returns to
 * the Hub tab.
 */
import { LitElement, css, html, nothing } from "lit";
import { operationProgressStyles, renderOperationProgress } from "../components/operation-progress";
import type {
  BackupBundlePayload,
  BackupProgressEvent,
  ControlPanelHubState,
  HassLike,
} from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { formatError } from "../shared/utils/control-panel-selectors";
import { TOOLS_CARD_STRINGS } from "../strings";
import "./edit-detail-view";
import "../components/refresh-cache-button";

// "list" is the idle stage: no capture running yet (waiting on guards) or the
// session is winding down after an exit.
type ActivitiesStage = "list" | "capturing" | "editing" | "syncing" | "sync_failed" | "needs_refresh" | "deleting";

const S = TOOLS_CARD_STRINGS.activities;

class SofabatonActivitiesTab extends LitElement {
  static properties = {
    hass: { attribute: false },
    hub: { attribute: false },
    refreshControlPanelState: { attribute: false },
    kind: { type: String },
    entityId: { type: Number },
    loading: { type: Boolean },
    error: { type: String },
    blockedTitle: { type: String },
    blockedMessage: { type: String },
    selectedHubProxyConnected: { type: Boolean },
    _stage: { state: true },
    _entityId: { state: true },
    _baseline: { state: true },
    _working: { state: true },
    _captureProgress: { state: true },
    _captureError: { state: true },
    _dirty: { state: true },
    _deleteError: { state: true },
    _exitConfirmOpen: { state: true },
    _syncProgress: { state: true },
    _syncError: { state: true },
    _syncFailedAt: { state: true },
    _syncSuccessNotice: { state: true },
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
    .notice-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--divider-color);
      background: color-mix(in srgb, var(--primary-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      font-size: 13px;
    }
    .notice-banner-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .notice-banner-btn {
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
    .notice-banner-btn:hover { border-color: var(--primary-color); }
    .sync-success-banner { background: color-mix(in srgb, #48b851 14%, var(--ha-card-background, var(--card-background-color))); }
    .sync-success-banner .notice-banner-text { display: inline-flex; align-items: center; gap: 6px; color: #2e7d32; }
    .sync-success-banner ha-icon { --mdc-icon-size: 18px; }
    .delete-error-banner { background: color-mix(in srgb, var(--error-color, #db4437) 12%, var(--ha-card-background, var(--card-background-color))); }
    .delete-error-banner .notice-banner-text { display: inline-flex; align-items: center; gap: 6px; color: var(--error-color, #db4437); }
    .delete-error-banner ha-icon { --mdc-icon-size: 18px; }
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
  refreshControlPanelState?: (() => Promise<unknown> | void) | null;
  /** What is being edited; the host sets both before mounting. */
  kind: "activity" | "device" = "activity";
  entityId: number | null = null;
  loading = false;
  error: string | null = null;
  blockedTitle: string | null = null;
  blockedMessage: string | null = null;
  selectedHubProxyConnected = false;

  private _stage: ActivitiesStage = "list";
  private _entityId: number | null = null;
  private _baseline: BackupBundlePayload | null = null;
  private _working: BackupBundlePayload | null = null;
  private _captureProgress: BackupProgressEvent | null = null;
  private _captureError: string | null = null;
  private _dirty = false;
  private _deleteError: string | null = null;
  private _exitConfirmOpen = false;
  private _syncProgress: BackupProgressEvent | null = null;
  private _syncError: string | null = null;
  private _syncFailedAt: string | null = null;
  private _syncSuccessNotice = false;

  private _captureOperationId: string | null = null;
  private _syncOperationId: string | null = null;
  private _progressUnsub: (() => void) | null = null;
  private _syncStateHydratedFor: string | null = null;
  private _exitAfterSync = false;
  // Which requested activityId we already auto-opened, so returning to the
  // idle stage (close) doesn't immediately re-capture the same activity.
  private _autoOpenedEntityId: number | null = null;
  // entry_id of the hub the current stage belongs to. The `hub` prop
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
        this._syncStateHydratedFor = null;
      }
      this._hubEntryId = nextEntryId;
    }
    if (this.hub && this._syncStateHydratedFor !== this.hub.entry_id) {
      this._syncStateHydratedFor = this.hub.entry_id;
      void this._hydrateRunningSync();
    }
    this._maybeAutoOpen();
  }

  // Direct-open: capture the requested entity as soon as the guards clear.
  // Runs once per requested id — a close (back to the idle stage) must not
  // re-capture; the host tears the element down on `editor-exit`.
  private _maybeAutoOpen() {
    const requested = this.entityId == null ? null : Number(this.entityId);
    if (requested == null || !Number.isFinite(requested)) return;
    if (this._stage !== "list" || this._autoOpenedEntityId === requested) return;
    if (this._openBlocked()) return;
    this._autoOpenedEntityId = requested;
    void this._startCapture(requested);
  }

  private _openBlocked() {
    return this.selectedHubProxyConnected
      || this._isProgressRunning(this.hub?.active_backup_operation ?? null);
  }

  // Card reloaded mid-sync: pick up a running sync op for this kind from the
  // shared backup/state registry and resubscribe to its progress.
  private async _hydrateRunningSync() {
    if (!this.hub || !this.hass) return;
    try {
      const state = await this.api().getBackupState(this.hub.entry_id);
      const op = (this.kind === "device" ? state?.device_sync : state?.activity_sync) ?? null;
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

  // ── Live command-payload editing (host-provided I/O) ────────────────
  // The detail view is hass-free, so it delegates the on-demand blob fetch
  // and the Test playback to these callbacks. The fetch is per-command (not
  // part of the structural cache), so payloads only leave the hub when the
  // user actually opens the payload editor.
  private _fetchCommandPayload = async (deviceId: number, commandId: number) => {
    if (!this.hub) return null;
    const response = await this.api().fetchBlob(this.hub.entry_id, deviceId, commandId);
    const commands = response.commands ?? [];
    const command = commands.find((c) => Number(c.command_id) === Number(commandId)) ?? commands[0];
    const dataHex = String(command?.command_blob ?? "").trim();
    if (!command || !dataHex) return null;
    return { dataHex, decoded: command.decoded ?? null };
  };

  private _testCommandPayload = async (hex: string) => {
    if (!this.hub) throw new Error("No hub is selected.");
    await this.api().playIrBlob(this.hub.entry_id, hex);
  };

  // ── Capture flow (§4.2) — sourced from the blob-free structural cache ──
  // Read the structural hub_bundle the backend assembles on demand from the
  // canonical persistent cache (per-entity refreshes and syncs update it in
  // place; payloads carry a per-entity `fetched_at`). If it's missing —
  // meaning no structural refresh has ever run — prompt the user to refresh.
  // While editing, this bundle *is* the truth — the editor never
  // second-guesses whether the hub has since changed. That reconciliation
  // happens once, authoritatively, at sync time (the backend stale
  // pre-flight).

  private _startCapture = async (entityId: number) => {
    if (!this.hub || !this.hass) return;
    this._entityId = entityId;
    this._captureError = null;
    this._captureProgress = null;
    this._stage = "capturing";
    try {
      const res = await this.api().getStructuralBundle(this.hub.entry_id);
      const bundle = res?.bundle ?? null;
      const entries = (this.kind === "device" ? bundle?.devices : bundle?.activities) ?? [];
      const hasEntity = !!bundle && entries.some(
        (candidate) => Number(candidate.device?.device_id) === entityId,
      );
      if (!bundle || !hasEntity) {
        this._stage = "needs_refresh";
        return;
      }
      this._baseline = bundle;
      this._working = structuredClone(bundle);
      this._dirty = false;
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
    // edited bundle and recompute dirty against the captured baseline.
    this._working = event.detail.bundle;
    this._recomputeDirty();
  };

  private _recomputeDirty() {
    this._dirty = !!this._baseline
      && !!this._working
      && JSON.stringify(this._working) !== JSON.stringify(this._baseline);
  }

  // ── Sync / Delete (§4.4) ────────────────────────────────────────────

  // Start the real sync engine (§4.5): diff baseline vs working on the
  // backend and issue targeted in-place writes, streaming progress.
  private _requestSync = async () => {
    if (!this._dirty || this._entityId == null || !this.hub || !this._baseline || !this._working) return;
    this._exitConfirmOpen = false;
    this._syncError = null;
    this._syncFailedAt = null;
    this._syncProgress = null;
    this._syncSuccessNotice = false;
    this._stage = "syncing";
    try {
      const start = this.kind === "device"
        ? await this.api().startDeviceSync(this.hub.entry_id, this._entityId, this._baseline, this._working)
        : await this.api().startActivitySync(this.hub.entry_id, this._entityId, this._baseline, this._working);
      this._syncOperationId = start.operation_id;
      await this.refreshControlPanelState?.();
      await this._subscribeSync(start.operation_id);
    } catch (error) {
      this._syncError = formatError(error);
      this._syncFailedAt = null;
      this._exitAfterSync = false;
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
        this._exitAfterSync = false;
        this._stage = "sync_failed";
        return;
      }
      this._syncProgress = payload;
    });
    this._progressUnsub = unsub;
  }

  private async _onSyncSuccess(operationId: string) {
    // Promote working → baseline so the editor's baseline advances and dirty clears.
    if (this._working) this._baseline = structuredClone(this._working);
    this._recomputeDirty();
    this._syncProgress = null;
    this._syncOperationId = null;
    const exitAfterSync = this._exitAfterSync;
    this._exitAfterSync = false;
    this._syncSuccessNotice = true;
    try { await this.api().clearBackupResult(operationId); } catch { /* ignore */ }
    try { await this.refreshControlPanelState?.(); } catch { /* ignore */ }
    if (exitAfterSync) {
      this._resetToList();
      return;
    }
    this._stage = "editing";
  }

  private _retrySync = () => {
    void this._requestSync();
  };

  // ── Immediate delete (entity delete executes on the hub right away) ──
  // The detail view gates the delete behind its are-you-sure dialog and then
  // emits `delete-request`; we run the targeted hub delete and, on success,
  // leave the editor (the entity no longer exists to edit).
  private _handleDeleteRequest = async (event: CustomEvent<{ kind: "activity" | "device"; entityId: number }>) => {
    if (!this.hub || !this.hass) return;
    if (this._stage === "deleting" || this._stage === "syncing") return;
    const entityId = Number(event.detail?.entityId);
    if (!Number.isFinite(entityId)) return;
    this._deleteError = null;
    this._stage = "deleting";
    try {
      if (event.detail.kind === "device") {
        await this.api().deleteDevice(this.hub.entry_id, entityId);
      } else {
        await this.api().deleteActivity(this.hub.entry_id, entityId);
      }
      await this.refreshControlPanelState?.();
      this._resetToList();
    } catch (error) {
      this._deleteError = formatError(error);
      this._stage = "editing";
    }
  };

  private _closeEditor = () => {
    if (this._dirty) {
      this._exitConfirmOpen = true;
      return;
    }
    this._resetToList();
  };

  private _closeExitConfirm = () => {
    this._exitConfirmOpen = false;
  };

  private _leaveWithoutSync = () => {
    this._exitAfterSync = false;
    this._resetToList();
  };

  private _syncAndLeave = () => {
    this._exitAfterSync = true;
    void this._requestSync();
  };

  private _reloadFromHub = () => {
    if (this._entityId == null) return;
    void this._startCapture(this._entityId);
  };

  private _resetToList() {
    const wasActive = this._stage !== "list" || this._entityId != null;
    this._stage = "list";
    this._entityId = null;
    this._baseline = null;
    this._working = null;
    this._captureProgress = null;
    this._captureError = null;
    this._captureOperationId = null;
    this._dirty = false;
    this._deleteError = null;
    this._exitConfirmOpen = false;
    this._syncProgress = null;
    this._syncError = null;
    this._syncFailedAt = null;
    this._syncOperationId = null;
    this._syncSuccessNotice = false;
    this._exitAfterSync = false;
    if (wasActive) {
      this.dispatchEvent(new CustomEvent("editor-exit", { bubbles: true, composed: true }));
    }
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
    if (this._stage === "deleting") {
      return this._renderDeleting();
    }
    if (this._stage === "sync_failed") {
      return this._renderSyncFailed();
    }
    if (this._stage === "editing" && this._baseline && this._working && this._entityId != null) {
      return this._renderEditing();
    }
    if (this._stage === "capturing") {
      return this._renderCapturing();
    }
    return this._renderIdle();
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

  // Idle stage: capture hasn't started yet (guards active) or the session is
  // closing. Guard panels (§4.1) render full-panel, in priority order;
  // otherwise _maybeAutoOpen is about to kick off the capture.
  private _renderIdle() {
    if (this.selectedHubProxyConnected) {
      return this._renderGuard("mdi:cellphone-link", S.appConnectedTitle, S.appConnectedBody);
    }
    if (this._isProgressRunning(this.hub?.active_backup_operation ?? null)) {
      return this._renderGuard("mdi:progress-clock", S.operationRunningTitle, S.operationRunningBody);
    }
    return html`
      <div class="tab-panel">
        <div class="guard-state">
          <div class="guard-icon"><ha-icon icon="mdi:database-arrow-down-outline"></ha-icon></div>
          <div class="guard-sub">${S.capturingFromCache(this.kind)}</div>
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
          <div class="guard-sub">${S.capturingFromCache(this.kind)}</div>
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
          <div class="guard-sub">${S.needsRefreshBody(this.kind)}</div>
          <div class="action-row">
            <sofabaton-refresh-cache-button
              .hass=${this.hass}
              .entryId=${this.hub?.entry_id ?? ""}
              @refreshed=${() => { if (this._entityId != null) void this._startCapture(this._entityId); }}
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
        ${this._syncSuccessNotice ? this._renderSyncSuccessBanner() : nothing}
        ${this._deleteError ? this._renderDeleteErrorBanner() : nothing}
        <sofabaton-edit-detail-view
          .bundle=${this._working}
          .kind=${this.kind}
          .entityId=${this._entityId}
          .dirty=${this._dirty}
          mode="live"
          .fetchCommandPayload=${this._fetchCommandPayload}
          .testCommandPayload=${this._testCommandPayload}
          @bundle-change=${this._handleBundleChange}
          @sync-request=${this._requestSync}
          @delete-request=${this._handleDeleteRequest}
          @close=${this._closeEditor}
        ></sofabaton-edit-detail-view>
        ${this._exitConfirmOpen ? this._renderExitConfirmDialog() : nothing}
      </div>
    `;
  }

  private _renderSyncSuccessBanner() {
    return html`
      <div class="notice-banner sync-success-banner">
        <span class="notice-banner-text"><ha-icon icon="mdi:check-circle-outline"></ha-icon> ${TOOLS_CARD_STRINGS.activities.syncSuccess}</span>
        <button class="notice-banner-btn" @click=${() => { this._syncSuccessNotice = false; }}>${TOOLS_CARD_STRINGS.activities.discardConfirmCancel}</button>
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

  private _renderDeleting() {
    const S = TOOLS_CARD_STRINGS.activities;
    return html`
      <div class="tab-panel">
        ${renderOperationProgress({ mode: "restore", title: S.deletingTitle(this.kind), message: S.deletingMessage(this.kind) })}
      </div>
    `;
  }

  private _renderDeleteErrorBanner() {
    return html`
      <div class="notice-banner delete-error-banner">
        <span class="notice-banner-text"><ha-icon icon="mdi:alert-circle-outline"></ha-icon> ${this._deleteError}</span>
        <button class="notice-banner-btn" @click=${() => { this._deleteError = null; }}>${TOOLS_CARD_STRINGS.activities.discardConfirmCancel}</button>
      </div>
    `;
  }

  private _renderSyncFailed() {
    const S = TOOLS_CARD_STRINGS.activities;
    const isStale = this._syncFailedAt === "stale_check";
    // "Reload from hub" must fetch genuinely fresh state — refresh the whole
    // structural cache, then re-open the activity. Re-reading the existing
    // (possibly stale) cache would just re-fail. Reloading discards edits.
    return html`
      <div class="tab-panel">
        <div class="capture-error">
          <div class="guard-icon"><ha-icon icon=${isStale ? "mdi:sync-alert" : "mdi:alert-circle-outline"}></ha-icon></div>
          <div class="capture-error-title">${isStale ? S.syncStaleTitle(this.kind) : S.syncFailedTitle}</div>
          <div class="guard-sub">
            ${isStale ? S.syncStaleBody(this.kind) : (this._syncError || S.syncFailedStep(String(this._syncFailedAt || "")))}
          </div>
          <div class="action-row">
            ${isStale
              ? nothing
              : html`<button class="btn btn-primary" @click=${this._retrySync}>${S.syncRetry}</button>`}
            <sofabaton-refresh-cache-button
              .hass=${this.hass}
              .entryId=${this.hub?.entry_id ?? ""}
              .label=${S.syncReload}
              @refreshed=${() => { if (this._entityId != null) void this._startCapture(this._entityId); }}
            ></sofabaton-refresh-cache-button>
            <button class="btn" @click=${() => { this._stage = "editing"; this._syncError = null; this._syncFailedAt = null; }}>${S.syncKeepEditing}</button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderExitConfirmDialog() {
    const S = TOOLS_CARD_STRINGS.activities;
    return html`
      <div class="modal-backdrop" @click=${this._closeExitConfirm}>
        <div class="dialog dialog--small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S.exitUnsyncedTitle}</div>
            <button class="dialog-close" @click=${this._closeExitConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body"><div class="dialog-text">${S.exitUnsyncedBody(this.kind)}</div></div>
          <div class="dialog-footer">
            <button class="btn btn-danger" @click=${this._leaveWithoutSync}>${S.exitWithoutSync}</button>
            <div class="dialog-footer-actions">
              <button class="btn" @click=${this._closeExitConfirm}>${S.discardConfirmCancel}</button>
              <button class="btn btn-primary" @click=${this._syncAndLeave}>${S.exitSyncNow}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("sofabaton-activities-tab")) {
  customElements.define("sofabaton-activities-tab", SofabatonActivitiesTab);
}
