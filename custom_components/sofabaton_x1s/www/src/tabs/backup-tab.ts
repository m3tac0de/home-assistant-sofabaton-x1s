import { LitElement, css, html, nothing } from "lit";
import type {
  BackupBundlePayload,
  BackupProgressEvent,
  CacheHubState,
  ControlPanelHubState,
  HassLike,
} from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { formatError, hubIcon } from "../shared/utils/control-panel-selectors";
import {
  backupDeviceOptions,
  bundleActivityOptions,
  bundleDeviceOptions,
  pruneBackupBundle,
  reconcileRestoreSelection,
  validateBackupBundle,
} from "./backup-state";

type BackupScope = "whole_hub" | "individual_devices";

class SofabatonBackupTab extends LitElement {
  static properties = {
    hass: { attribute: false },
    hub: { attribute: false },
    cacheHub: { attribute: false },
    setHubCommandBusy: { attribute: false },
    refreshControlPanelState: { attribute: false },
    hubCommandBusy: { type: Boolean },
    hubCommandBusyLabel: { type: String },
    loading: { type: Boolean },
    error: { type: String },
    persistentCacheEnabled: { type: Boolean },
    selectedHubProxyConnected: { type: Boolean },
    _openSection: { state: true },
    _backupScope: { state: true },
    _backupSearchQuery: { state: true },
    _backupDeviceIds: { state: true },
    _backupError: { state: true },
    _backupProgress: { state: true },
    _restoreError: { state: true },
    _restoreSuccess: { state: true },
    _restoreProgress: { state: true },
    _restoreMode: { state: true },
    _restoreBundle: { state: true },
    _restoreFilename: { state: true },
    _restoreActivityIds: { state: true },
    _restoreManualDeviceIds: { state: true },
    _loadedBackupEntryId: { state: true },
    _backupHydrating: { state: true },
  };

  static styles = css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      --backup-radius-sm: calc(var(--ha-card-border-radius, 12px) * 0.85);
      --backup-radius-md: var(--ha-card-border-radius, 12px);
      --backup-radius-lg: calc(var(--ha-card-border-radius, 12px) * 1.33);
      --backup-radius-xl: calc(var(--ha-card-border-radius, 12px) * 1.8);
      --backup-radius-pill: calc(var(--ha-card-border-radius, 12px) * 999);
    }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow-y: auto; }
    .state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
      text-align: center;
      padding: 24px;
      line-height: 1.6;
    }
    .state.error { color: var(--error-color, #db4437); }
    .blocked-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      line-height: 1.6;
    }
    .blocked-state-title {
      color: var(--primary-text-color);
      font-size: 16px;
      font-weight: 700;
    }
    .blocked-state-sub {
      max-width: 340px;
      font-size: 13px;
    }
    .backup-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      margin: -16px;
    }
    .accordion-section { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--divider-color); }
    .accordion-section:first-child { border-top: none; }
    .accordion-section.open { flex: 1; }
    .acc-header {
      flex-shrink: 0;
      height: 44px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      cursor: pointer;
      user-select: none;
      transition: background-color 120ms ease;
    }
    .acc-header:hover { background: color-mix(in srgb, var(--primary-color) 6%, var(--ha-card-background, var(--card-background-color))); }
    .acc-header-icon { color: var(--secondary-text-color); display: inline-flex; flex: 0 0 auto; }
    .accordion-section.open .acc-header-icon { color: var(--primary-color); }
    .acc-header-icon ha-icon { --mdc-icon-size: 18px; }
    .acc-title { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
    .flex-spacer { flex: 1; }
    .chevron { font-size: 9px; color: var(--secondary-text-color); transition: transform 150ms; }
    .accordion-section.open .chevron { transform: rotate(180deg); }
    .acc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; display: grid; gap: 12px; align-content: start; }
    .backup-body {
      padding-top: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-content: normal;
    }
    .restore-body {
      padding-top: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-content: normal;
    }

    .header-primary-btn {
      flex: 0 0 auto;
      min-width: 114px;
      min-height: 42px;
      padding: 0 18px;
      border-radius: var(--backup-radius-pill);
      border: 1px solid color-mix(in srgb, var(--primary-color) 75%, white 10%);
      background: color-mix(in srgb, var(--primary-color) 20%, white 80%);
      color: var(--primary-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .header-primary-btn:hover:not(:disabled) {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 24%, white 76%);
    }
    .header-primary-btn:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .backup-action-row {
      display: flex;
      justify-content: flex-start;
    }
    .backup-drawer-sub { color: var(--secondary-text-color); font-size: 12px; line-height: 1.45; }
    .backup-section-title { color: var(--primary-text-color); font-size: 13px; font-weight: 700; }

    .backup-config-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .restore-config-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .backup-scope-group { display: grid; gap: 8px; }
    .backup-scope-options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
      overflow: hidden;
    }
    .backup-scope-option {
      display: flex;
      cursor: pointer;
      min-width: 0;
    }
    .backup-scope-option + .backup-scope-option {
      border-left: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
    }
    .backup-scope-option.selected {
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    .backup-scope-option ha-formfield {
      width: 100%;
      min-width: 0;
      --mdc-theme-text-primary-on-background: var(--primary-text-color);
    }
    .backup-scope-option .scope-form {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0;
    }
    .backup-scope-option ha-radio { flex: 0 0 auto; }

    .backup-devices-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .backup-devices-head-main {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .backup-selected-count {
      color: var(--primary-color);
      font-size: 12px;
      font-weight: 700;
    }
    .backup-link-btn {
      border: none;
      background: transparent;
      color: var(--primary-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      padding: 0;
    }
    .backup-link-btn:disabled { opacity: 0.48; cursor: default; }

    .backup-search { position: relative; }
    .backup-search ha-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--secondary-text-color);
      --mdc-icon-size: 18px;
      pointer-events: none;
    }
    .backup-search input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 96%, transparent);
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      padding: 12px 14px 12px 40px;
      outline: none;
    }
    .backup-search input::placeholder { color: var(--secondary-text-color); }

    .selection-card {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
      overflow: hidden;
      min-height: 0;
    }
    .backup-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .restore-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .selection-list { display: flex; flex-direction: column; max-height: 340px; overflow-y: auto; }
    .backup-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .restore-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .selection-empty {
      padding: 16px 14px;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .selection-group-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      min-height: 36px;
      padding: 0 14px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 94%, white 6%);
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
    }
    .selection-group-header:first-child { border-top: none; }
    .selection-row {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      cursor: pointer;
    }
    .selection-row:first-child { border-top: none; }
    .selection-row ha-checkbox { flex: 0 0 auto; }
    .selection-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1 1 auto;
    }
    .selection-label {
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 600;
    }
    .selection-meta {
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      margin-left: 8px;
    }
    .selection-sub {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.45;
    }

    .status-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.45;
      color: var(--secondary-text-color);
    }
    .status-box.success {
      color: #2e7d32;
      border-color: color-mix(in srgb, #2e7d32 35%, var(--divider-color));
      background: color-mix(in srgb, #2e7d32 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-box.error {
      color: var(--error-color, #db4437);
      border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--error-color, #db4437) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-box.warning {
      border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-icon { display: inline-flex; color: inherit; flex: 0 0 auto; }
    .status-icon ha-icon { --mdc-icon-size: 18px; }

    .action-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: center; }
    .primary-btn, .secondary-btn {
      border-radius: var(--backup-radius-pill);
      padding: 10px 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .primary-btn {
      border: 1px solid color-mix(in srgb, var(--primary-color) 65%, var(--divider-color));
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-color) 16%, var(--ha-card-background, var(--card-background-color)));
    }
    .secondary-btn {
      border: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      background: transparent;
    }
    .primary-btn:hover:not(:disabled), .secondary-btn:hover:not(:disabled) { transform: translateY(-1px); }
    .primary-btn:disabled, .secondary-btn:disabled { opacity: 0.48; cursor: default; transform: none; }

    .file-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--backup-radius-pill);
      border: 1px solid var(--divider-color);
      font-size: 12px;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
    }

    .backup-complete-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 10px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--divider-color));
      border-radius: var(--backup-radius-xl);
      padding: 28px 18px;
      background:
        radial-gradient(circle at top, color-mix(in srgb, var(--primary-color) 14%, transparent), transparent 44%),
        color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, transparent);
    }
    .backup-complete-icon {
      width: 64px;
      height: 64px;
      display: grid;
      place-items: center;
      border-radius: var(--backup-radius-pill);
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    }
    .backup-complete-icon ha-icon { --mdc-icon-size: 30px; }
    .backup-complete-title {
      color: var(--primary-text-color);
      font-size: 20px;
      font-weight: 700;
    }
    .backup-complete-sub {
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
    }

    .mode-option-btn {
      width: 100%;
      min-width: 0;
      min-height: 36px;
      border: none;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      padding: 8px 14px;
    }
    .restore-action-row {
      display: flex;
      justify-content: flex-start;
      gap: 10px;
      flex-wrap: wrap;
    }

    .progress-shell {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-xl);
      padding: 18px;
      background: transparent;
      color: var(--primary-text-color);
    }
    .progress-shell[data-mode="restore"] .packet { animation-name: backupMove; }
    .progress-stage {
      position: relative;
      display: flex;
      flex-wrap: nowrap;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      min-height: 110px;
      min-width: 0;
    }
    .progress-node { display: grid; justify-items: center; gap: 10px; z-index: 2; }
    .progress-disc {
      width: 76px;
      height: 76px;
      display: grid;
      place-items: center;
      border-radius: var(--backup-radius-lg);
      background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 88%, transparent);
      border: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
    }
    .progress-node.home .progress-disc { color: #41bdf5; }
    .progress-node.hub .progress-disc { color: var(--primary-color); }
    .progress-disc ha-icon { --mdc-icon-size: 40px; }
    .progress-disc .progress-hub-svg { width: 48px; height: 48px; }
    .progress-node-label {
      color: var(--secondary-text-color);
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .progress-route { position: relative; flex: 1 1 auto; min-width: 84px; height: 42px; }
    .progress-route::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 2px;
      background: color-mix(in srgb, var(--divider-color) 75%, transparent);
      transform: translateY(-50%);
    }
    .packet {
      position: absolute;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #5ff0a0;
      box-shadow: 0 0 0 4px rgba(95,240,160,.12);
      animation: restoreMove 1.75s cubic-bezier(.55,0,.25,1) infinite;
    }
    .packet:nth-child(2) { animation-delay: .38s; opacity: .78; transform: scale(.82); }
    .packet:nth-child(3) { animation-delay: .76s; opacity: .55; transform: scale(.68); }
    .progress-copy {
      margin-top: 8px;
      text-align: center;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .progress-title {
      font-size: clamp(20px, 3vw, 28px);
      letter-spacing: -.03em;
      font-weight: 700;
    }
    .progress-message { color: var(--secondary-text-color); font-size: 14px; line-height: 1.5; }
    .progress-bar {
      margin-top: 14px;
      height: 8px;
      overflow: hidden;
      border-radius: var(--backup-radius-pill);
      background: color-mix(in srgb, var(--divider-color) 55%, transparent);
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #41bdf5, #5ff0a0, #a78bfa);
      transition: width 180ms ease;
    }
    .progress-meta {
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }

    input[type="file"] { display: none; }
    @keyframes backupMove {
      0% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(.55); }
      18% { opacity: 1; }
      82% { opacity: 1; }
      100% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes restoreMove {
      0% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(.55); }
      18% { opacity: 1; }
      82% { opacity: 1; }
      100% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); }
    }

    @media (max-width: 760px) {
      .backup-scope-options { grid-template-columns: 1fr; }
      .backup-scope-option + .backup-scope-option {
        border-left: none;
        border-top: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      }
      .progress-disc { width: 64px; height: 64px; }
      .progress-disc .progress-hub-svg { width: 40px; height: 40px; }
      .progress-route { min-width: 56px; }
    }
  `;

  hass: HassLike | null = null;
  hub: ControlPanelHubState | null = null;
  cacheHub: CacheHubState | null = null;
  setHubCommandBusy?: (busy: boolean, label?: string | null) => void;
  refreshControlPanelState?: () => Promise<unknown>;
  hubCommandBusy = false;
  hubCommandBusyLabel: string | null = null;
  loading = false;
  error: string | null = null;
  persistentCacheEnabled = false;
  selectedHubProxyConnected = false;

  private _openSection: "make" | "restore" = "make";
  private _backupScope: BackupScope = "whole_hub";
  private _backupSearchQuery = "";
  private _backupDeviceIds: number[] = [];
  private _backupError: string | null = null;
  private _backupProgress: BackupProgressEvent | null = null;
  private _restoreError: string | null = null;
  private _restoreSuccess: string | null = null;
  private _restoreProgress: BackupProgressEvent | null = null;
  private _restoreMode: "replace" | "merge" = "merge";
  private _restoreBundle: BackupBundlePayload | null = null;
  private _restoreFilename = "";
  private _restoreActivityIds: number[] = [];
  private _restoreManualDeviceIds: number[] = [];
  private _progressUnsub: (() => void) | null = null;
  private _downloadUrl: string | null = null;
  private _loadedBackupEntryId = "";
  private _backupHydrating = false;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardownProgressSubscription();
    this._revokeDownloadUrl();
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("hub")) {
      void this._syncBackupOperationState();
    }
    if (changed.has("cacheHub") && this.cacheHub && !this._backupDeviceIds.length) {
      this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
    }
  }

  protected render() {
    if (this.loading) {
      return html`<div class="tab-panel"><div class="state">Loading backup tools…</div></div>`;
    }
    if (this.error) {
      return html`<div class="tab-panel"><div class="state error">${this.error}</div></div>`;
    }
    if (!this.hub || !this.hass) {
      return html`<div class="tab-panel"><div class="state">Select a hub to manage backups.</div></div>`;
    }
    if (this.selectedHubProxyConnected) {
      return html`
        <div class="tab-panel">
          <div class="blocked-state">
            <div class="blocked-state-title">Backup unavailable</div>
            <div class="blocked-state-sub">Backup cannot be used while the Sofabaton app is connected to the hub through the proxy.</div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="tab-panel">
        <div class="backup-panel">
          ${this._renderBackupSection()}
          ${this._renderRestoreSection()}
        </div>
      </div>
    `;
  }

  private _renderBackupSection() {
    const isOpen = this._openSection === "make";
    const devices = backupDeviceOptions(this.cacheHub);
    const filteredDevices = this._filterBackupDevices(devices);
    const wholeHub = this._backupScope === "whole_hub";
    const selectedDeviceIds = wholeHub ? devices.map((device) => device.id) : this._backupDeviceIds;
    const isRunning = this._isProgressRunning(this._backupProgress);
    const isSuccess = String(this._backupProgress?.status || "") === "success";
    const allDevicesSelected = devices.length > 0 && this._backupDeviceIds.length === devices.length;
    const summary = this._backupResultSummary(this._backupProgress?.backup);

    return html`
      <div class="accordion-section ${isOpen ? "open" : ""}">
        <div class="acc-header" @click=${() => this._toggleSection("make")}>
          <span class="acc-header-icon"><ha-icon icon="mdi:content-save-move-outline"></ha-icon></span>
          <span class="acc-title">Make A Backup</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
          <div class="acc-body backup-body">
            <div class="backup-drawer-sub">
              ${isRunning
                ? "The hub is creating your backup."
                : isSuccess
                  ? "Your backup is ready."
                  : "Choose what to include in this backup."}
            </div>
            ${!this.persistentCacheEnabled || !this.cacheHub
              ? this._renderStatus("warning", "mdi:database-off-outline", "Enable persistent cache to choose backup contents from the card.")
              : nothing}
            ${this._backupError
              ? this._renderStatus("error", "mdi:alert-circle-outline", this._backupError)
              : nothing}
            ${isRunning && this._backupProgress
              ? this._renderProgressCard(this._backupProgress, "backup")
              : isSuccess
                ? html`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">Backup completed</div>
                    <div class="backup-complete-sub">${summary}</div>
                    <div class="action-row">
                      <button class="primary-btn" ?disabled=${!this._backupProgress?.backup} @click=${this._downloadLatestBackup}>
                        Download backup
                      </button>
                      <button class="secondary-btn" @click=${this._resetBackupComposer}>New backup</button>
                    </div>
                  </div>
                `
                : html`
                  <div class="backup-config-view">
                  <div class="backup-scope-group">
                    <div class="backup-scope-options">
                      <label
                        class="backup-scope-option ${wholeHub ? "selected" : ""}"
                        @click=${() => {
                          if (this._backupLocked() || !this.cacheHub) return;
                          this._setBackupScope("whole_hub");
                        }}
                      >
                        <ha-formfield class="scope-form" label="Entire hub">
                          <ha-radio
                            name="backup-scope"
                            .checked=${wholeHub}
                            ?disabled=${this._backupLocked() || !this.cacheHub}
                          ></ha-radio>
                        </ha-formfield>
                      </label>
                      <label
                        class="backup-scope-option ${!wholeHub ? "selected" : ""}"
                        @click=${() => {
                          if (this._backupLocked() || !this.cacheHub) return;
                          this._setBackupScope("individual_devices");
                        }}
                      >
                        <ha-formfield class="scope-form" label="Selected devices">
                          <ha-radio
                            name="backup-scope"
                            .checked=${!wholeHub}
                            ?disabled=${this._backupLocked() || !this.cacheHub}
                          ></ha-radio>
                        </ha-formfield>
                      </label>
                    </div>
                  </div>
                  ${!wholeHub ? html`
                    <div class="backup-devices-head">
                      <div class="backup-devices-head-main">
                        <div class="backup-section-title">Devices to include</div>
                        <div class="backup-selected-count">${this._backupDeviceIds.length} selected</div>
                      </div>
                      <button class="backup-link-btn" ?disabled=${this._backupLocked() || !this.cacheHub} @click=${this._toggleAllBackupDevices}>
                        ${allDevicesSelected ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div class="backup-search">
                      <ha-icon icon="mdi:magnify"></ha-icon>
                      <input
                        type="text"
                        .value=${this._backupSearchQuery}
                        ?disabled=${this._backupLocked() || !this.cacheHub}
                        placeholder="Search devices"
                        @input=${(event: Event) => {
                          this._backupSearchQuery = (event.currentTarget as HTMLInputElement).value;
                        }}
                      />
                    </div>
                    <div class="selection-card">
                      <div class="selection-list">
                        ${filteredDevices.length
                          ? filteredDevices.map((device) => html`
                              <div
                                class="selection-row"
                                @click=${() => {
                                  if (this._backupLocked() || !this.cacheHub) return;
                                  this._setBackupDevice(device.id, !selectedDeviceIds.includes(device.id));
                                }}
                              >
                                <ha-checkbox
                                  .checked=${selectedDeviceIds.includes(device.id)}
                                  ?disabled=${this._backupLocked() || !this.cacheHub}
                                  @click=${(event: Event) => event.stopPropagation()}
                                  @change=${(event: Event) => {
                                    const target = event.currentTarget as { checked?: boolean };
                                    this._setBackupDevice(device.id, !!target.checked);
                                  }}
                                ></ha-checkbox>
                                <span class="selection-main">
                                  <span class="selection-label">${device.label}</span>
                                </span>
                                ${device.meta ? html`<span class="selection-meta">${device.meta}</span>` : nothing}
                              </div>
                            `)
                          : html`<div class="selection-empty">No devices match your search.</div>`}
                      </div>
                    </div>
                  ` : nothing}
                  <div class="backup-action-row">
                    <button
                      class="primary-btn header-primary-btn"
                      ?disabled=${this._backupActionDisabled()}
                      @click=${() => void this._runBackup()}
                    >
                      ${isRunning ? "Working" : "Start backup"}
                    </button>
                  </div>
                  </div>
                `}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderRestoreSectionLegacy() {
    const isOpen = this._openSection === "restore";
    const isRunning = this._isProgressRunning(this._restoreProgress);
    const activityOptions = bundleActivityOptions(this._restoreBundle);
    const deviceOptions = bundleDeviceOptions(this._restoreBundle);
    const restoreSelection = reconcileRestoreSelection({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      manualSelectedDeviceIds: this._restoreManualDeviceIds,
    });

    return html`
      <div class="accordion-section ${isOpen ? "open" : ""}">
        <div class="acc-header" @click=${() => this._toggleSection("restore")}>
          <span class="acc-header-icon"><ha-icon icon="mdi:database-import-outline"></ha-icon></span>
          <span class="acc-title">Restore A Backup</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
          <div class="acc-body restore-body">
            <div class="backup-drawer-sub">
              Load a backup file, then choose exactly what to restore. Activities automatically pull in the Devices they depend on.
            </div>
            ${this._restoreError ? this._renderStatus("error", "mdi:alert-circle-outline", this._restoreError) : nothing}
            ${this._restoreSuccess ? this._renderStatus("success", "mdi:check-circle-outline", this._restoreSuccess) : nothing}
            ${isRunning && this._restoreProgress ? this._renderProgressCard(this._restoreProgress, "restore") : nothing}
            <input id="restore-file-input" type="file" accept=".json,application/json" @change=${this._handleFilePicked} />
            <div class="action-row" style="justify-content:flex-start;">
              <button class="secondary-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>Choose backup file</button>
              ${this._restoreFilename ? html`<span class="file-chip"><ha-icon icon="mdi:file-document-outline"></ha-icon>${this._restoreFilename}</span>` : nothing}
            </div>
            ${this._restoreBundle ? html`
              <div class="mode-tabs">
                <button class="mode-tab ${this._restoreMode === "replace" ? "active" : ""}" ?disabled=${this._restoreLocked()} @click=${() => this._restoreMode = "replace"}>Replace</button>
                <button class="mode-tab ${this._restoreMode === "merge" ? "active" : ""}" ?disabled=${this._restoreLocked()} @click=${() => this._restoreMode = "merge"}>Merge</button>
              </div>
              ${this._renderStatus(
                "warning",
                this._restoreMode === "replace" ? "mdi:alert-outline" : "mdi:plus-circle-outline",
                this._restoreMode === "replace"
                  ? "Replace erases the destination hub first, then restores the selected content."
                  : "Merge keeps the current hub content and adds the selected backup content as new items.",
              )}
              <div class="selection-card">
                <div class="selection-list">
                  ${activityOptions.length ? activityOptions.map((activity) => html`
                    <div class="selection-row">
                      <ha-checkbox
                        .checked=${this._restoreActivityIds.includes(activity.id)}
                        ?disabled=${this._restoreLocked()}
                        @change=${(event: Event) => {
                          const target = event.currentTarget as { checked?: boolean };
                          this._setRestoreActivity(activity.id, !!target.checked);
                        }}
                      ></ha-checkbox>
                      <span class="selection-main">
                        <span class="selection-label">${activity.label}</span>
                        ${activity.meta ? html`<span class="selection-sub">${activity.meta}</span>` : nothing}
                      </span>
                    </div>
                  `) : html`<div class="selection-empty">This backup file has no activities.</div>`}
                </div>
              </div>
              <div class="selection-card">
                <div class="selection-list">
                  ${deviceOptions.length ? deviceOptions.map((device) => {
                    const forced = restoreSelection.forcedDeviceIds.includes(device.id);
                    return html`
                      <div class="selection-row ${forced ? "locked" : ""}">
                        <ha-checkbox
                          .checked=${restoreSelection.selectedDeviceIds.includes(device.id)}
                          ?disabled=${forced || this._restoreLocked()}
                          @change=${(event: Event) => {
                            const target = event.currentTarget as { checked?: boolean };
                            this._setRestoreDevice(device.id, !!target.checked);
                          }}
                        ></ha-checkbox>
                        <span class="selection-main">
                          <span class="selection-label">${device.label}</span>
                          ${device.meta ? html`<span class="selection-sub">${forced ? `${device.meta} · required by selected activities` : device.meta}</span>` : nothing}
                        </span>
                      </div>
                    `;
                  }) : html`<div class="selection-empty">This backup file has no devices.</div>`}
                </div>
              </div>
              <div class="action-row" style="justify-content:flex-start;">
                <button class="primary-btn" ?disabled=${this._restoreActionDisabled(restoreSelection.selectedDeviceIds)} @click=${this._runRestore}>Start restore</button>
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderRestoreSection() {
    const isOpen = this._openSection === "restore";
    const isRunning = this._isProgressRunning(this._restoreProgress);
    const isSuccess = String(this._restoreProgress?.status || "") === "success";
    const activityOptions = bundleActivityOptions(this._restoreBundle);
    const deviceOptions = bundleDeviceOptions(this._restoreBundle);
    const restoreSelection = reconcileRestoreSelection({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      manualSelectedDeviceIds: this._restoreManualDeviceIds,
    });
    const totalRestoreOptions = activityOptions.length + deviceOptions.length;
    const totalRestoreSelected = this._restoreActivityIds.length + restoreSelection.selectedDeviceIds.length;
    const allRestoreSelected = totalRestoreOptions > 0 && totalRestoreSelected === totalRestoreOptions;

    return html`
      <div class="accordion-section ${isOpen ? "open" : ""}">
        <div class="acc-header" @click=${() => this._toggleSection("restore")}>
          <span class="acc-header-icon"><ha-icon icon="mdi:database-import-outline"></ha-icon></span>
          <span class="acc-title">Restore A Backup</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
          <div class="acc-body restore-body">
            <div class="backup-drawer-sub">
              ${isRunning
                ? "The hub is restoring your backup."
                : isSuccess
                  ? "Your restore has completed."
                  : "Load a backup file, then choose exactly what to restore. Activities automatically pull in the Devices they depend on."}
            </div>
            ${this._restoreError ? this._renderStatus("error", "mdi:alert-circle-outline", this._restoreError) : nothing}
            ${isRunning && this._restoreProgress
              ? this._renderProgressCard(this._restoreProgress, "restore")
              : isSuccess
                ? html`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">Restore completed</div>
                    <div class="backup-complete-sub">The selected Activities and Devices were restored to the hub.</div>
                    <div class="action-row">
                      <button class="primary-btn" @click=${this._resetRestoreComposer}>Complete</button>
                    </div>
                  </div>
                `
                : nothing}
            <input id="restore-file-input" type="file" accept=".json,application/json" @change=${this._handleFilePicked} />
            ${!isRunning && !isSuccess && this._restoreBundle ? html`
              <div class="restore-config-view">
                <div class="backup-scope-group">
                  <div
                    class="selection-row"
                    @click=${() => {
                      if (this._restoreLocked()) return;
                      this._restoreMode = this._restoreMode === "replace" ? "merge" : "replace";
                    }}
                  >
                    <ha-checkbox
                      .checked=${this._restoreMode === "replace"}
                      ?disabled=${this._restoreLocked()}
                      @click=${(event: Event) => event.stopPropagation()}
                      @change=${(event: Event) => {
                        const target = event.currentTarget as { checked?: boolean };
                        this._restoreMode = target.checked ? "replace" : "merge";
                      }}
                    ></ha-checkbox>
                    <span class="selection-main">
                      <span class="selection-label">Erase existing Devices and Activities</span>
                    </span>
                  </div>
                </div>
                <div class="backup-devices-head">
                  <div class="backup-devices-head-main">
                    <div class="backup-section-title">Items to restore</div>
                    <div class="backup-selected-count">${totalRestoreSelected} selected</div>
                  </div>
                  <button class="backup-link-btn" ?disabled=${this._restoreLocked()} @click=${allRestoreSelected ? this._clearRestoreSelection : this._selectAllRestoreItems}>
                    ${allRestoreSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div class="selection-card">
                  <div class="selection-list">
                    ${activityOptions.length
                      ? html`
                        <div class="selection-group-header">Activities</div>
                        ${activityOptions.map((activity) => html`
                          <div
                            class="selection-row"
                            @click=${() => {
                              if (this._restoreLocked()) return;
                              this._setRestoreActivity(activity.id, !this._restoreActivityIds.includes(activity.id));
                            }}
                          >
                            <ha-checkbox
                              .checked=${this._restoreActivityIds.includes(activity.id)}
                              ?disabled=${this._restoreLocked()}
                              @click=${(event: Event) => event.stopPropagation()}
                              @change=${(event: Event) => {
                                const target = event.currentTarget as { checked?: boolean };
                                this._setRestoreActivity(activity.id, !!target.checked);
                              }}
                            ></ha-checkbox>
                            <span class="selection-main">
                              <span class="selection-label">${activity.label}</span>
                            </span>
                            ${activity.meta ? html`<span class="selection-meta">${activity.meta}</span>` : nothing}
                          </div>
                        `)}
                      `
                      : html`<div class="selection-empty">This backup file has no activities.</div>`}
                    ${deviceOptions.length
                      ? html`
                        <div class="selection-group-header">Devices</div>
                        ${deviceOptions.map((device) => {
                          const forced = restoreSelection.forcedDeviceIds.includes(device.id);
                          return html`
                            <div
                              class="selection-row ${forced ? "locked" : ""}"
                              @click=${() => {
                                if (forced || this._restoreLocked()) return;
                                this._setRestoreDevice(device.id, !restoreSelection.selectedDeviceIds.includes(device.id));
                              }}
                            >
                              <ha-checkbox
                                .checked=${restoreSelection.selectedDeviceIds.includes(device.id)}
                                ?disabled=${forced || this._restoreLocked()}
                                @click=${(event: Event) => event.stopPropagation()}
                                @change=${(event: Event) => {
                                  const target = event.currentTarget as { checked?: boolean };
                                  this._setRestoreDevice(device.id, !!target.checked);
                                }}
                              ></ha-checkbox>
                              <span class="selection-main">
                                <span class="selection-label">${device.label}</span>
                              </span>
                              ${device.meta ? html`<span class="selection-meta">${forced ? `${device.meta} · linked` : device.meta}</span>` : nothing}
                            </div>
                          `;
                        })}
                      `
                      : html`<div class="selection-empty">This backup file has no devices.</div>`}
                  </div>
                </div>
                <div class="restore-action-row">
                  <button class="primary-btn" ?disabled=${this._restoreActionDisabled(restoreSelection.selectedDeviceIds)} @click=${this._runRestore}>Start restore</button>
                  <button class="secondary-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
                </div>
              </div>
            ` : !isRunning && !isSuccess ? html`
              <div class="restore-action-row">
                <button class="secondary-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
              </div>
            ` : nothing}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderStatus(tone: "warning" | "error" | "success", icon: string, message: string) {
    return html`
      <div class="status-box ${tone}">
        <span class="status-icon"><ha-icon icon=${icon}></ha-icon></span>
        <span>${message}</span>
      </div>
    `;
  }

  private _renderProgressCard(progress: BackupProgressEvent, mode: "backup" | "restore") {
    const total = Math.max(0, Number(progress.total_steps || 0));
    const done = Math.max(0, Number(progress.completed_steps || 0));
    const percent = total > 0 ? Math.max(6, Math.min(100, Math.round((done / total) * 100))) : 36;
    return html`
      <div class="progress-shell" data-mode=${mode}>
        <div class="progress-stage">
          <div class="progress-node home">
            <div class="progress-disc"><ha-icon icon="mdi:home-assistant"></ha-icon></div>
            <div class="progress-node-label">Home Assistant</div>
          </div>
          <div class="progress-route" aria-hidden="true">
            <i class="packet"></i>
            <i class="packet"></i>
            <i class="packet"></i>
          </div>
          <div class="progress-node hub">
            <div class="progress-disc">${hubIcon("hero", "progress-hub-svg")}</div>
            <div class="progress-node-label">Sofabaton Hub</div>
          </div>
        </div>
        <div class="progress-copy">
          <div class="progress-title">${mode === "backup" ? "Creating backup" : "Restoring backup"}</div>
          <div class="progress-message">${String(progress.message || "Working…")}</div>
        </div>
        <div class="progress-bar"><div class="progress-bar-fill" style=${`width:${percent}%`}></div></div>
        <div class="progress-meta">
          <span>${String(progress.phase || "running").replace(/_/g, " ")}</span>
          <span>${total > 0 ? `${done}/${total} steps` : "Preparing…"}</span>
        </div>
      </div>
    `;
  }

  private _toggleSection(section: "make" | "restore") {
    this._openSection = section;
  }

  private _backupLocked() {
    return this.hubCommandBusy || this._isProgressRunning(this._backupProgress) || this._isProgressRunning(this._restoreProgress);
  }

  private _restoreLocked() {
    return this.hubCommandBusy || this._isProgressRunning(this._restoreProgress) || this._isProgressRunning(this._backupProgress);
  }

  private _isProgressRunning(progress: BackupProgressEvent | null) {
    return !!progress && ["pending", "running"].includes(String(progress.status || ""));
  }

  private _setBackupScope(scope: BackupScope) {
    this._backupScope = scope;
    if (!this._backupDeviceIds.length && this.cacheHub) {
      this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
    }
    if (scope === "whole_hub") {
      this._backupSearchQuery = "";
    }
  }

  private _setBackupDevice(deviceId: number, checked: boolean) {
    const next = new Set(this._backupDeviceIds);
    if (checked) next.add(deviceId);
    else next.delete(deviceId);
    this._backupDeviceIds = [...next].sort((left, right) => left - right);
  }

  private _toggleAllBackupDevices = () => {
    const devices = backupDeviceOptions(this.cacheHub);
    const allIds = devices.map((device) => device.id);
    this._backupDeviceIds = this._backupDeviceIds.length === allIds.length ? [] : allIds;
  };

  private _filterBackupDevices(devices: ReturnType<typeof backupDeviceOptions>) {
    const query = this._backupSearchQuery.trim().toLowerCase();
    if (!query) return devices;
    return devices.filter((device) => `${device.label} ${device.meta || ""}`.toLowerCase().includes(query));
  }

  private _setRestoreActivity(activityId: number, checked: boolean) {
    const next = new Set(this._restoreActivityIds);
    if (checked) next.add(activityId);
    else next.delete(activityId);
    this._restoreActivityIds = [...next].sort((left, right) => left - right);
  }

  private _setRestoreDevice(deviceId: number, checked: boolean) {
    const next = new Set(this._restoreManualDeviceIds);
    if (checked) next.add(deviceId);
    else next.delete(deviceId);
    this._restoreManualDeviceIds = [...next].sort((left, right) => left - right);
  }

  private _selectAllRestoreItems = () => {
    const activities = bundleActivityOptions(this._restoreBundle).map((activity) => activity.id);
    const devices = bundleDeviceOptions(this._restoreBundle).map((device) => device.id);
    this._restoreActivityIds = activities;
    this._restoreManualDeviceIds = devices;
  };

  private _clearRestoreSelection = () => {
    this._restoreActivityIds = [];
    this._restoreManualDeviceIds = [];
  };

  private _backupActionDisabled() {
    if (this._backupLocked()) return true;
    if (!this.hub || !this.hass || !this.cacheHub || !this.persistentCacheEnabled) return true;
    if (String(this._backupProgress?.status || "") === "success") return true;
    if (this._backupScope === "whole_hub") return false;
    return this._backupDeviceIds.length === 0;
  }

  private _restoreActionDisabled(selectedDeviceIds: number[]) {
    if (this._restoreLocked()) return true;
    if (!this.hub || !this.hass || !this._restoreBundle) return true;
    return selectedDeviceIds.length === 0 && this._restoreActivityIds.length === 0;
  }

  private api() {
    if (!this.hass) throw new Error("Home Assistant is not available");
    return new ControlPanelApi(this.hass);
  }

  private async _runBackup() {
    if (!this.hub) return;
    this._backupError = null;
    this._backupProgress = null;
    this._revokeDownloadUrl();
    const deviceIds = this._backupScope === "whole_hub" ? null : this._backupDeviceIds;
    this.setHubCommandBusy?.(true, "Starting backup…");
    try {
      const start = await this.api().startBackupExport(this.hub.entry_id, deviceIds);
      await this._subscribeToOperation(start.operation_id, "backup");
    } catch (error) {
      this._backupError = formatError(error);
      this.setHubCommandBusy?.(false, null);
    }
  }

  private async _runRestore() {
    if (!this.hub || !this._restoreBundle) return;
    const selection = reconcileRestoreSelection({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      manualSelectedDeviceIds: this._restoreManualDeviceIds,
    });
    const filtered = pruneBackupBundle({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      selectedDeviceIds: selection.selectedDeviceIds,
    });
    this._restoreError = null;
    this._restoreSuccess = null;
    this._restoreProgress = null;
    this.setHubCommandBusy?.(true, "Starting restore…");
    try {
      const start = await this.api().startBackupRestore(this.hub.entry_id, filtered, this._restoreMode);
      await this._subscribeToOperation(start.operation_id, "restore");
    } catch (error) {
      this._restoreError = formatError(error);
      this.setHubCommandBusy?.(false, null);
    }
  }

  private async _subscribeToOperation(operationId: string, kind: "backup" | "restore") {
    this._teardownProgressSubscription();
    const unsubscribe = await this.api().subscribeBackupProgress(operationId, async (payload) => {
      if (kind === "backup") {
        this._backupProgress = payload;
        if (payload.status === "success") {
          this.setHubCommandBusy?.(false, null);
          try {
            await this.refreshControlPanelState?.();
          } catch {
            // Ignore refresh failures here; the success state is already known.
          }
        } else if (payload.status === "failed") {
          this._backupError = String(payload.error || payload.message || "Backup failed.");
          this.setHubCommandBusy?.(false, null);
          try {
            await this.refreshControlPanelState?.();
          } catch {
            // Ignore refresh failures here; the operation state is already known.
          }
        }
      } else {
        this._restoreProgress = payload;
        if (payload.status === "success") {
          this._restoreSuccess = "Restore completed.";
          this.setHubCommandBusy?.(false, null);
          try {
            await this.refreshControlPanelState?.();
          } catch {
            // Ignore refresh failures here; the success state is already known.
          }
        } else if (payload.status === "failed") {
          this._restoreError = String(payload.error || payload.message || "Restore failed.");
          this.setHubCommandBusy?.(false, null);
        }
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

  private _openFilePicker() {
    this.renderRoot.querySelector<HTMLInputElement>("#restore-file-input")?.click();
  }

  private async _handleFilePicked(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this._restoreError = null;
    this._restoreSuccess = null;
    try {
      const text = await file.text();
      const bundle = validateBackupBundle(JSON.parse(text));
      this._restoreBundle = bundle;
      this._restoreFilename = file.name;
      this._restoreMode = "merge";
      this._restoreActivityIds = bundleActivityOptions(bundle).map((activity) => activity.id);
      this._restoreManualDeviceIds = bundleDeviceOptions(bundle).map((device) => device.id);
    } catch (error) {
      this._restoreBundle = null;
      this._restoreFilename = "";
      this._restoreActivityIds = [];
      this._restoreManualDeviceIds = [];
      this._restoreError = formatError(error);
    } finally {
      if (input) input.value = "";
    }
  }

  private async _downloadLatestBackup() {
    const backup = this._backupProgress?.backup;
    if (!backup) return;
    this._revokeDownloadUrl();
    this._downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = this._downloadUrl;
    anchor.download = String(this._backupProgress?.filename || "sofabaton_backup.json");
    anchor.click();
    try {
      if (this._backupProgress?.operation_id) {
        await this.api().clearBackupResult(this._backupProgress.operation_id);
        this._backupProgress = { ...this._backupProgress, backup_downloaded: true };
      }
    } catch {
      // Keep the local copy available even if backend cleanup fails.
    }
  }

  private _backupResultSummary(bundle: BackupBundlePayload | null | undefined) {
    const activityCount = Array.isArray(bundle?.activities) ? bundle.activities.length : 0;
    const deviceCount = Array.isArray(bundle?.devices) ? bundle.devices.length : 0;
    return `${activityCount} Activities and ${deviceCount} Devices backed up`;
  }

  private _resetBackupComposer = () => {
    this._backupError = null;
    this._backupProgress = null;
    this._backupScope = "whole_hub";
    this._backupSearchQuery = "";
    this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
    this._revokeDownloadUrl();
  };

  private _resetRestoreComposer = () => {
    this._restoreError = null;
    this._restoreSuccess = null;
    this._restoreProgress = null;
    this._restoreMode = "merge";
  };

  private async _syncBackupOperationState() {
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entryId || !this.hass) return;
    if (this._loadedBackupEntryId === entryId && this._backupHydrating) return;
    const activeOperation = this.hub?.active_backup_operation || null;
    const activeOperationId = this._isProgressRunning(activeOperation)
      ? String(activeOperation?.operation_id || "").trim()
      : "";
    const localOperationId = String(
      this._backupProgress?.operation_id || this._restoreProgress?.operation_id || "",
    ).trim();
    const localProgressRunning =
      this._isProgressRunning(this._backupProgress) || this._isProgressRunning(this._restoreProgress);
    if (
      this._loadedBackupEntryId === entryId &&
      this._progressUnsub &&
      !!activeOperationId &&
      localProgressRunning &&
      localOperationId === activeOperationId
    ) {
      return;
    }
    this._loadedBackupEntryId = entryId;
    this._backupHydrating = true;
    this._teardownProgressSubscription();
    try {
      const state = await this.api().getBackupState(entryId);
      this._backupProgress = state?.backup_export || null;
      this._restoreProgress = state?.backup_restore || null;
      this._backupError =
        String(this._backupProgress?.status || "") === "failed"
          ? String(this._backupProgress?.error || this._backupProgress?.message || "Backup failed.")
          : null;
      this._restoreError =
        String(this._restoreProgress?.status || "") === "failed"
          ? String(this._restoreProgress?.error || this._restoreProgress?.message || "Restore failed.")
          : null;
      this._restoreSuccess =
        String(this._restoreProgress?.status || "") === "success" ? "Restore completed." : null;
      const active = state?.active_operation || null;
      if (active && String(active.kind || "") === "backup_export" && active.operation_id) {
        this.setHubCommandBusy?.(true, String(active.message || "Backup in progress…"));
        await this._subscribeToOperation(active.operation_id, "backup");
      } else if (active && String(active.kind || "") === "backup_restore" && active.operation_id) {
        this.setHubCommandBusy?.(true, String(active.message || "Restore in progress…"));
        await this._subscribeToOperation(active.operation_id, "restore");
      } else {
        this.setHubCommandBusy?.(false, null);
      }
    } catch {
      // Ignore hydration failures; the tab can still start a fresh operation.
    } finally {
      this._backupHydrating = false;
    }
  }

  private _revokeDownloadUrl() {
    if (!this._downloadUrl) return;
    URL.revokeObjectURL(this._downloadUrl);
    this._downloadUrl = null;
  }
}

if (!customElements.get("sofabaton-backup-tab")) {
  customElements.define("sofabaton-backup-tab", SofabatonBackupTab);
}
