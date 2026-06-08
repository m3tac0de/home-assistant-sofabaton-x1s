import { LitElement, css, html, nothing } from "lit";
import { renderSecondaryTabContent, renderSecondaryTabShell, secondaryTabStyles, type SecondaryTabItem } from "../components/secondary-tab";
import type {
  BackupBundlePayload,
  BackupProgressEvent,
  BackupSectionId,
  CacheHubState,
  ControlPanelHubState,
  HassLike,
} from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { formatError } from "../shared/utils/control-panel-selectors";
import { operationProgressStyles, renderOperationProgress } from "../components/operation-progress";
import {
  assertBackupBundleRestoreCompatible,
  backupDeviceOptions,
  bundleActivityOptions,
  bundleDeviceOptions,
  pruneBackupBundle,
  reconcileRestoreSelection,
  renameBundleActivity,
  renameBundleDevice,
  renameBundleHub,
  validateBackupBundle,
} from "./backup-state";

type BackupScope = "whole_hub" | "individual_devices";

const BACKUP_SECTION_ITEMS: SecondaryTabItem<BackupSectionId>[] = [
  { id: "make", icon: "mdi:content-save-move-outline", label: "Make" },
  { id: "edit", icon: "mdi:pencil-box-outline", label: "Edit" },
  { id: "restore", icon: "mdi:database-import-outline", label: "Restore" },
];

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
    blockedTitle: { type: String },
    blockedMessage: { type: String },
    selectedSection: { attribute: false },
    setSelectedSection: { attribute: false },
    _backupScope: { state: true },
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
    _editBundle: { state: true },
    _editFilename: { state: true },
    _editError: { state: true },
    _editingKey: { state: true },
  };

  static styles = [secondaryTabStyles, operationProgressStyles, css`
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
    }
    .backup-body {
      gap: 12px;
    }
    .restore-body {
      gap: 12px;
    }

    .header-primary-btn {
      flex: 0 0 auto;
      min-width: 114px;
      min-height: 42px;
      padding: 0 18px;
      border-radius: var(--backup-radius-md);
      border: 1px solid color-mix(in srgb, var(--primary-color) 75%, white 10%);
      background: color-mix(in srgb, var(--primary-color) 20%, white 80%);
      color: var(--primary-color);
      font: inherit;
      font-size: 13px;
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
    .backup-drawer-sub { color: var(--secondary-text-color); font-size: 13px; line-height: 1.5; }
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
    ha-radio-group.scope-form--md {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
      --ha-radio-option-active-color: var(--primary-color);
      --ha-radio-option-checked-background-color: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    ha-radio-group.scope-form--md ha-radio-option {
      min-width: 0;
    }
    @media (max-width: 380px) {
      ha-radio-group.scope-form--md { grid-template-columns: 1fr; }
    }
    .compat-radio-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
    }
    .compat-radio-option {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease;
    }
    .compat-radio-option:hover {
      border-color: color-mix(in srgb, var(--primary-color) 45%, var(--divider-color));
    }
    .compat-radio-option.selected {
      border-color: color-mix(in srgb, var(--primary-color) 70%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    .compat-radio-option.disabled {
      opacity: 0.58;
      cursor: default;
    }
    .compat-radio-option-label {
      min-width: 0;
      flex: 1 1 auto;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
    }
    @media (max-width: 380px) {
      .compat-radio-group { grid-template-columns: 1fr; }
    }
    .compat-choice {
      width: 18px;
      height: 18px;
      margin: 0;
      flex: 0 0 auto;
      accent-color: var(--primary-color);
    }

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

    .edit-body { padding-top: 0; padding-bottom: 8px; display: flex; flex-direction: column; gap: 8px; align-content: normal; }
    .edit-config-view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
    .edit-config-view .selection-card { flex: 1 1 auto; min-height: 0; }
    .edit-config-view .selection-list { max-height: none; height: 100%; min-height: 0; }
    .edit-action-row { display: flex; justify-content: flex-start; align-items: center; gap: 10px; flex-wrap: nowrap; min-width: 0; }
    .edit-action-row .primary-btn { flex: 0 0 auto; }
    .edit-hub-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 14px 8px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
    }
    .edit-hub-caption { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
    .edit-hub-inline { display: flex; align-items: center; gap: 4px; }
    .edit-row { display: flex; align-items: center; gap: 4px; padding: 4px 14px; border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent); }
    .edit-row:first-child { border-top: none; }
    .edit-row-label {
      flex: 0 1 auto;
      min-width: 0;
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .edit-row-meta {
      margin-left: auto;
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .edit-row-input {
      flex: 0 1 220px;
      width: 220px;
      min-width: 0;
      max-width: 100%;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
      background: var(--ha-card-background, var(--card-background-color));
      border: 1px solid color-mix(in srgb, var(--primary-color) 65%, var(--divider-color));
      border-radius: var(--backup-radius-sm);
      padding: 4px 10px;
      outline: none;
    }
    .edit-row-input:focus { border-color: var(--primary-color); }
    .icon-btn {
      flex: 0 0 auto;
      display: inline-grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: var(--backup-radius-pill);
      border: 1px solid transparent;
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
    }
    .icon-btn:hover:not(:disabled) {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    }
    .icon-btn:disabled { opacity: 0.45; cursor: default; }
    .icon-btn ha-icon { --mdc-icon-size: 16px; }

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
      border-radius: var(--backup-radius-md);
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

    .backup-downloaded-note,
    .backup-expired-note {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      font-size: 12px;
      font-weight: 600;
    }
    .backup-downloaded-note {
      color: var(--success-color, #43a047);
    }
    .backup-expired-note {
      color: var(--warning-color, #ff9800);
    }
    .backup-downloaded-note ha-icon,
    .backup-expired-note ha-icon {
      --mdc-icon-size: 16px;
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
      align-items: center;
      gap: 10px;
      flex-wrap: nowrap;
      min-width: 0;
    }
    .restore-action-row .primary-btn { flex: 0 0 auto; }
    .filename-btn {
      flex: 1 1 0;
      min-width: 0;
      max-width: 100%;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    input[type="file"] { display: none; }

    @media (max-width: 380px) {
      .backup-scope-options { grid-template-columns: 1fr; }
      .backup-scope-option + .backup-scope-option {
        border-left: none;
        border-top: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      }
    }
  `];

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
  blockedTitle: string | null = null;
  blockedMessage: string | null = null;
  selectedSection: BackupSectionId = "make";
  setSelectedSection: (section: BackupSectionId) => void = () => {};

  private _backupScope: BackupScope = "whole_hub";
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
  private _loadedBackupEntryId = "";
  private _backupHydrating = false;
  private _editBundle: BackupBundlePayload | null = null;
  private _editFilename = "";
  private _editError: string | null = null;
  private _editingKey: string | null = null;
  private readonly _backupScopeRadioName = `sofabaton-backup-scope-${Math.random().toString(36).slice(2)}`;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardownProgressSubscription();
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
    if (this.blockedTitle && this.blockedMessage) {
      return html`
        <div class="tab-panel">
          <div class="blocked-state">
            <div class="blocked-state-title">${this.blockedTitle}</div>
            <div class="blocked-state-sub">${this.blockedMessage}</div>
          </div>
        </div>
      `;
    }

    return html`
      <div class="tab-panel">
        ${renderSecondaryTabShell({
          items: BACKUP_SECTION_ITEMS,
          selectedId: this.selectedSection,
          onSelect: (section) => this.setSelectedSection(section),
          connected: true,
          shellClassName: "backup-panel secondary-view-shell--edge",
          content:
            this.selectedSection === "make"
              ? this._renderBackupSectionContent()
              : this.selectedSection === "edit"
                ? this._renderEditSectionContent()
                : this._renderRestoreSectionContent(),
        })}
      </div>
    `;
  }

  private _renderBackupSectionContent() {
    const devices = backupDeviceOptions(this.cacheHub);
    const wholeHub = this._backupScope === "whole_hub";
    const selectedDeviceIds = wholeHub ? devices.map((device) => device.id) : this._backupDeviceIds;
    const isRunning = this._isProgressRunning(this._backupProgress);
    const isSuccess = String(this._backupProgress?.status || "") === "success";
    const allDevicesSelected = devices.length > 0 && this._backupDeviceIds.length === devices.length;
    const summary = this._backupResultSummary(this._backupProgress?.backup);

    return html`
      ${renderSecondaryTabContent({
        connected: true,
        contentClassName: "backup-body",
        content: html`
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
                ? (() => {
                    const hasBundle = !!this._backupProgress?.backup;
                    const wasDownloaded = !!this._backupProgress?.backup_downloaded;
                    const expired = !!this._backupProgress?.backup_expired;
                    return html`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">Backup completed</div>
                    <div class="backup-complete-sub">${summary}</div>
                    ${expired
                      ? html`<div class="backup-expired-note">
                          <ha-icon icon="mdi:clock-alert-outline"></ha-icon>
                          Backup expired. Start a new backup to download again.
                        </div>`
                      : wasDownloaded
                        ? html`<div class="backup-downloaded-note">
                            <ha-icon icon="mdi:check-circle-outline"></ha-icon>
                            Downloaded
                          </div>`
                        : nothing}
                    <div class="action-row">
                      <button class="primary-btn" ?disabled=${!hasBundle} @click=${this._downloadLatestBackup}>
                        ${wasDownloaded ? "Download again" : "Download backup"}
                      </button>
                      <button class="secondary-btn" @click=${() => void this._completeBackupResult()}>Complete</button>
                    </div>
                  </div>
                `;
                  })()
                : html`
                  <div class="backup-config-view">
                  <div class="backup-scope-group">
                    ${this._renderScopeGroup({
                      value: this._backupScope,
                      disabled: this._backupLocked() || !this.cacheHub,
                      options: [
                        { value: "whole_hub", label: "Entire hub" },
                        { value: "individual_devices", label: "Selected devices" },
                      ],
                      onChange: (next) => this._setBackupScope(next),
                    })}
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
                    <div class="selection-card">
                      <div class="selection-list">
                        ${devices.length
                          ? devices.map((device) => html`
                              <div
                                class="selection-row"
                                @click=${() => {
                                  if (this._backupLocked() || !this.cacheHub) return;
                                  this._setBackupDevice(device.id, !selectedDeviceIds.includes(device.id));
                                }}
                              >
                                ${this._renderCheckboxControl({
                                  checked: selectedDeviceIds.includes(device.id),
                                  disabled: this._backupLocked() || !this.cacheHub,
                                  onChange: (checked) => this._setBackupDevice(device.id, checked),
                                })}
                                <span class="selection-main">
                                  <span class="selection-label">${device.label}</span>
                                </span>
                                ${device.meta ? html`<span class="selection-meta">${device.meta}</span>` : nothing}
                              </div>
                            `)
                          : html`<div class="selection-empty">No devices available.</div>`}
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
        `,
      })}
    `;
  }

  private _renderEditSectionContent() {
    const bundle = this._editBundle;
    const activityOptions = bundleActivityOptions(bundle);
    const deviceOptions = bundleDeviceOptions(bundle);
    const hubName = String(bundle?.hub?.name || "").trim();
    return html`
      ${renderSecondaryTabContent({
        connected: true,
        contentClassName: "edit-body",
        content: html`
            <div class="backup-drawer-sub">
              ${bundle
                ? "Rename the hub, activities, and devices in this backup. Edits stay in your browser until you download the modified file."
                : "Load a backup file to rename its hub, activities, and devices before downloading it again."}
            </div>
            ${this._editError ? this._renderStatus("error", "mdi:alert-circle-outline", this._editError) : nothing}
            <input id="edit-file-input" type="file" accept=".json,application/json" @change=${this._handleEditFilePicked} />
            ${bundle ? html`
              <div class="edit-config-view">
                <div class="edit-hub-row">
                  <span class="edit-hub-caption">Hub name</span>
                  <div class="edit-hub-inline">
                    ${this._renderEditableLabel({
                      editKey: "hub",
                      value: hubName || "Unnamed hub",
                      placeholder: "Hub name",
                      onSave: (next) => this._applyHubRename(next),
                    })}
                  </div>
                </div>
                <div class="selection-card">
                  <div class="selection-list">
                    ${activityOptions.length
                      ? html`
                        <div class="selection-group-header">Activities</div>
                        ${activityOptions.map((activity) => this._renderEditRow({
                          editKey: `activity:${activity.id}`,
                          label: activity.label,
                          meta: activity.meta,
                          onSave: (next) => this._applyActivityRename(activity.id, next),
                        }))}
                      `
                      : html`<div class="selection-empty">This backup file has no activities.</div>`}
                    ${deviceOptions.length
                      ? html`
                        <div class="selection-group-header">Devices</div>
                        ${deviceOptions.map((device) => this._renderEditRow({
                          editKey: `device:${device.id}`,
                          label: device.label,
                          meta: device.meta,
                          onSave: (next) => this._applyDeviceRename(device.id, next),
                        }))}
                      `
                      : html`<div class="selection-empty">This backup file has no devices.</div>`}
                  </div>
                </div>
                <div class="edit-action-row">
                  <button class="primary-btn" @click=${this._downloadEditedBundle}>Download edited backup</button>
                  <button class="secondary-btn filename-btn" @click=${this._openEditFilePicker}>${this._editFilename || "Choose backup file"}</button>
                </div>
              </div>
            ` : html`
              <div class="edit-action-row">
                <button class="secondary-btn filename-btn" @click=${this._openEditFilePicker}>${this._editFilename || "Choose backup file"}</button>
              </div>
            `}
        `,
      })}
    `;
  }

  private _renderEditRow(params: {
    editKey: string;
    label: string;
    meta?: string;
    onSave: (value: string) => void;
  }) {
    const isEditing = this._editingKey === params.editKey;
    return html`
      <div class="edit-row">
        ${this._renderEditableLabel({
          editKey: params.editKey,
          value: params.label,
          placeholder: "Name",
          onSave: params.onSave,
        })}
        ${params.meta && !isEditing
          ? html`<span class="edit-row-meta">${params.meta}</span>`
          : nothing}
      </div>
    `;
  }

  private _renderEditableLabel(params: {
    editKey: string;
    value: string;
    placeholder: string;
    onSave: (value: string) => void;
  }) {
    const isEditing = this._editingKey === params.editKey;
    if (!isEditing) {
      return html`
        <span class="edit-row-label" title=${params.value}>${params.value}</span>
        <button
          class="icon-btn"
          title="Rename"
          @click=${() => { this._editingKey = params.editKey; }}
        >
          <ha-icon icon="mdi:pencil-outline"></ha-icon>
        </button>
      `;
    }
    const sanitize = (raw: string) => this._sanitizeBundleName(raw);
    const commit = (input: HTMLInputElement | null) => {
      const next = sanitize(String(input?.value ?? ""));
      if (next) params.onSave(next);
      this._editingKey = null;
    };
    return html`
      <input
        class="edit-row-input"
        type="text"
        .value=${params.value}
        placeholder=${params.placeholder}
        maxlength="20"
        autofocus
        @input=${(event: Event) => {
          const input = event.currentTarget as HTMLInputElement;
          const cleaned = sanitize(input.value);
          if (cleaned !== input.value) {
            const caret = Math.max(0, (input.selectionStart ?? cleaned.length) - (input.value.length - cleaned.length));
            input.value = cleaned;
            input.setSelectionRange(caret, caret);
          }
        }}
        @keydown=${(event: KeyboardEvent) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget as HTMLInputElement);
          } else if (event.key === "Escape") {
            event.preventDefault();
            this._editingKey = null;
          }
        }}
        @blur=${(event: Event) => commit(event.currentTarget as HTMLInputElement)}
      />
      <button
        class="icon-btn"
        title="Save"
        @mousedown=${(event: Event) => event.preventDefault()}
        @click=${(event: Event) => {
          const root = (event.currentTarget as HTMLElement).parentElement;
          const input = root?.querySelector<HTMLInputElement>(".edit-row-input") ?? null;
          commit(input);
        }}
      >
        <ha-icon icon="mdi:check"></ha-icon>
      </button>
    `;
  }

  private _bundleSupportsUnicodeNames() {
    const version = String(this._editBundle?.hub?.version || "").toUpperCase();
    return version.includes("X2") || version.includes("X1S");
  }

  private _sanitizeBundleName(value: unknown) {
    const pattern = this._bundleSupportsUnicodeNames()
      ? /[^\p{L}\p{N}\p{M} +&.'()_-]+/gu
      : /[^A-Za-z0-9 ]+/g;
    return String(value ?? "").replace(pattern, "").slice(0, 20);
  }

  private _openEditFilePicker = () => {
    this.renderRoot.querySelector<HTMLInputElement>("#edit-file-input")?.click();
  };

  private _handleEditFilePicked = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this._editError = null;
    try {
      const text = await file.text();
      const bundle = validateBackupBundle(JSON.parse(text));
      this._editBundle = bundle;
      this._editFilename = file.name;
      this._editingKey = null;
    } catch (error) {
      this._editBundle = null;
      this._editFilename = "";
      this._editingKey = null;
      this._editError = formatError(error);
    } finally {
      if (input) input.value = "";
    }
  };

  private _applyHubRename(name: string) {
    if (!this._editBundle) return;
    this._editBundle = renameBundleHub(this._editBundle, name);
  }

  private _applyActivityRename(activityId: number, name: string) {
    if (!this._editBundle) return;
    this._editBundle = renameBundleActivity(this._editBundle, activityId, name);
  }

  private _applyDeviceRename(deviceId: number, name: string) {
    if (!this._editBundle) return;
    this._editBundle = renameBundleDevice(this._editBundle, deviceId, name);
  }

  private _downloadEditedBundle = () => {
    if (!this._editBundle) return;
    const json = JSON.stringify(this._editBundle, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const base = this._editFilename.replace(/\.json$/i, "") || "sofabaton_backup";
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${base}_edited.json`;
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new MouseEvent("click"));
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  private _renderRestoreSectionContent() {
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
      ${renderSecondaryTabContent({
        connected: true,
        contentClassName: "restore-body",
        content: html`
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
                            ${this._renderCheckboxControl({
                              checked: this._restoreActivityIds.includes(activity.id),
                              disabled: this._restoreLocked(),
                              onChange: (checked) => this._setRestoreActivity(activity.id, checked),
                            })}
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
                              ${this._renderCheckboxControl({
                                checked: restoreSelection.selectedDeviceIds.includes(device.id),
                                disabled: forced || this._restoreLocked(),
                                onChange: (checked) => this._setRestoreDevice(device.id, checked),
                              })}
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
                <div class="backup-scope-group">
                  <div
                    class="selection-row"
                    @click=${() => {
                      if (this._restoreLocked()) return;
                      this._restoreMode = this._restoreMode === "replace" ? "merge" : "replace";
                    }}
                  >
                    ${this._renderCheckboxControl({
                      checked: this._restoreMode === "replace",
                      disabled: this._restoreLocked(),
                      onChange: (checked) => {
                        this._restoreMode = checked ? "replace" : "merge";
                      },
                    })}
                    <span class="selection-main">
                      <span class="selection-label">Erase existing Devices and Activities</span>
                    </span>
                  </div>
                </div>
                <div class="restore-action-row">
                  <button class="primary-btn" ?disabled=${this._restoreActionDisabled(restoreSelection.selectedDeviceIds)} @click=${this._runRestore}>Start restore</button>
                  <button class="secondary-btn filename-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
                </div>
              </div>
            ` : !isRunning && !isSuccess ? html`
              <div class="restore-action-row">
                <button class="secondary-btn filename-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
              </div>
            ` : nothing}
        `,
      })}
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

  private _renderScopeGroup<T extends string>(params: {
    value: T;
    disabled: boolean;
    options: Array<{ value: T; label: string; disabled?: boolean }>;
    onChange: (value: T) => void;
  }) {
    const isOption = (raw: unknown): raw is T =>
      typeof raw === "string" && params.options.some((option) => option.value === raw);
    return html`
      <div class="compat-radio-group" role="radiogroup" aria-disabled=${params.disabled ? "true" : "false"}>
        ${params.options.map((option) => html`
          <label
            class="compat-radio-option ${option.value === params.value ? "selected" : ""} ${params.disabled || !!option.disabled ? "disabled" : ""}"
          >
            <input
              class="compat-choice compat-choice--radio"
              type="radio"
              name=${this._backupScopeRadioName}
              .value=${option.value}
              .checked=${option.value === params.value}
              ?disabled=${params.disabled || !!option.disabled}
              @change=${(event: Event) => {
                const target = event.currentTarget as HTMLInputElement;
                if (target.checked && isOption(target.value) && target.value !== params.value) {
                  params.onChange(target.value);
                }
              }}
            />
            <span class="compat-radio-option-label">${option.label}</span>
          </label>
        `)}
      </div>
    `;
  }

  private _renderCheckboxControl(params: {
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
    stopClick?: boolean;
  }) {
    const stopClick = params.stopClick !== false;
    if (customElements.get("ha-checkbox")) {
      return html`
        <ha-checkbox
          .checked=${params.checked}
          ?disabled=${params.disabled}
          @click=${stopClick ? ((event: Event) => event.stopPropagation()) : (() => {})}
          @change=${(event: Event) => {
            const target = event.currentTarget as { checked?: boolean };
            params.onChange(!!target.checked);
          }}
        ></ha-checkbox>
      `;
    }
    return html`
      <input
        class="compat-choice compat-choice--checkbox"
        type="checkbox"
        .checked=${params.checked}
        ?disabled=${params.disabled}
        @click=${stopClick ? ((event: Event) => event.stopPropagation()) : (() => {})}
        @change=${(event: Event) => {
          const target = event.currentTarget as HTMLInputElement;
          params.onChange(!!target.checked);
        }}
      />
    `;
  }

  private _renderProgressCard(progress: BackupProgressEvent, mode: "backup" | "restore") {
    return renderOperationProgress({
      mode,
      title: mode === "backup" ? "Creating backup" : "Restoring backup",
      message: String(progress.message || "Working…"),
    });
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
    const deviceIds = this._backupScope === "whole_hub" ? null : this._backupDeviceIds;
    this.setHubCommandBusy?.(true, "Starting backup…");
    try {
      const start = await this.api().startBackupExport(this.hub.entry_id, deviceIds);
      await this.refreshControlPanelState?.();
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
      await this.refreshControlPanelState?.();
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
      assertBackupBundleRestoreCompatible(bundle, this.hub?.version);
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
    const operationId = this._backupProgress?.operation_id;
    if (!operationId || !this.hass) return;
    const filename = String(this._backupProgress?.filename || "sofabaton_backup.json");
    const path = `/api/sofabaton_x1s/backup/download/${encodeURIComponent(operationId)}`;
    let url = path;
    try {
      const signed = await this.hass.callWS<{ path: string }>({
        type: "auth/sign_path",
        path,
        // Generous expiry. The 60s default created a flaky window where
        // slow user interactions or share-sheet handoffs could let the
        // signature expire before the WebView delegate fetched it.
        expires: 600,
      });
      if (signed?.path) url = signed.path;
    } catch (error) {
      console.error("[sofabaton] auth/sign_path failed", error);
      return;
    }
    // Replicates HA's own fileDownload helper (used by HA core for
    // backup / diagnostics / camera snapshot downloads). Attached anchor,
    // target=_blank, default bubbling click. The HA mobile apps'
    // WebView delegates intercept the response via Content-Disposition.
    const anchor = document.createElement("a");
    anchor.target = "_blank";
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new MouseEvent("click"));
    document.body.removeChild(anchor);
    // No clearBackupResult call here: the browser's download fetch is
    // async on the network thread, and racing the registry cleanup
    // against it would (and did) cause the view to 410 the request
    // before the bytes were read. The server marks the bundle as
    // downloaded and schedules its own short TTL after successfully
    // serving the response. The push subscription will update
    // _backupProgress.backup_downloaded for us when that happens.
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
    this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
  };

  private async _completeBackupResult() {
    const operationId = String(this._backupProgress?.operation_id || "").trim();
    this._backupError = null;
    if (operationId) {
      try {
        await this.api().clearBackupResult(operationId);
      } catch (error) {
        this._backupError = formatError(error);
      }
    }
    try {
      await this.refreshControlPanelState?.();
    } catch {
      // Ignore refresh failures here; local state still resets and the next
      // normal poll will reconcile the view.
    }
    this._resetBackupComposer();
  }

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

}

if (!customElements.get("sofabaton-backup-tab")) {
  customElements.define("sofabaton-backup-tab", SofabatonBackupTab);
}

