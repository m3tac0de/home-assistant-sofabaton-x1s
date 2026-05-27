import { LitElement, css, html, nothing } from "lit";
import type {
  BackupBundlePayload,
  BackupProgressEvent,
  CacheHubState,
  ControlPanelHubState,
  HassLike,
} from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { formatError } from "../shared/utils/control-panel-selectors";
import {
  backupActivityOptions,
  backupDeviceOptions,
  backupUsesWholeHub,
  bundleActivityOptions,
  bundleDeviceOptions,
  pruneBackupBundle,
  reconcileRestoreSelection,
  validateBackupBundle,
} from "./backup-state";

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
    _openSection: { state: true },
    _backupActivityIds: { state: true },
    _backupDeviceIds: { state: true },
    _backupError: { state: true },
    _backupSuccess: { state: true },
    _backupProgress: { state: true },
    _restoreError: { state: true },
    _restoreSuccess: { state: true },
    _restoreProgress: { state: true },
    _restoreMode: { state: true },
    _restoreBundle: { state: true },
    _restoreFilename: { state: true },
    _restoreActivityIds: { state: true },
    _restoreManualDeviceIds: { state: true },
  };

  static styles = css`
    :host { display: flex; flex: 1; min-height: 0; }
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
    .acc-header { flex-shrink: 0; height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 16px; cursor: pointer; user-select: none; transition: background-color 120ms ease; }
    .acc-header:hover { background: color-mix(in srgb, var(--primary-color) 6%, var(--ha-card-background, var(--card-background-color))); }
    .acc-header-icon { color: var(--secondary-text-color); display: inline-flex; flex: 0 0 auto; }
    .accordion-section.open .acc-header-icon { color: var(--primary-color); }
    .acc-header-icon ha-icon { --mdc-icon-size: 18px; }
    .acc-title { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
    .flex-spacer { flex: 1; }
    .chevron { font-size: 9px; color: var(--secondary-text-color); transition: transform 150ms; }
    .accordion-section.open .chevron { transform: rotate(180deg); }
    .acc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 12px; display: grid; gap: 10px; align-content: start; }
    .section-copy { font-size: 13px; line-height: 1.55; color: var(--secondary-text-color); }
    .section-copy strong { color: var(--primary-text-color); }
    .selection-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .selection-card {
      border: 1px solid var(--divider-color);
      border-radius: 16px;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
      overflow: hidden;
      min-height: 0;
    }
    .selection-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 14px;
      border-bottom: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 82%, transparent);
    }
    .selection-card-title { font-size: 13px; font-weight: 700; color: var(--primary-text-color); }
    .selection-card-meta { font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.05em; }
    .selection-list { display: flex; flex-direction: column; }
    .selection-empty {
      padding: 16px 14px;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .selection-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      padding: 12px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
    }
    .selection-row:first-child { border-top: none; }
    .selection-row input { margin-top: 2px; }
    .selection-row.locked { opacity: 0.72; }
    .selection-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .selection-label {
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 600;
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
      border-radius: 12px;
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
    .mode-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
    .mode-tab {
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      padding: 8px 12px;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
    }
    .mode-tab.active {
      border-color: var(--primary-color);
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    .action-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .primary-btn, .secondary-btn {
      border-radius: 999px;
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
      border-radius: 999px;
      border: 1px solid var(--divider-color);
      font-size: 12px;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
    }
    .progress-shell {
      border: 1px solid rgba(255,255,255,.10);
      border-radius: 24px;
      padding: 18px;
      background:
        radial-gradient(circle at 18% 18%, rgba(65,189,245,.13), transparent 34%),
        radial-gradient(circle at 82% 84%, rgba(167,139,250,.13), transparent 36%),
        linear-gradient(145deg, rgba(13,27,45,.96), rgba(8,18,31,.9));
      color: #eaf3ff;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
    }
    .progress-shell[data-mode="restore"] .packet { animation-name: restoreMove; }
    .progress-stage {
      position: relative;
      display: grid;
      grid-template-columns: 1fr 1.15fr 1fr;
      gap: 10px;
      align-items: center;
      min-height: 150px;
    }
    .progress-node { display: grid; justify-items: center; gap: 10px; z-index: 2; }
    .progress-disc {
      width: 86px;
      height: 86px;
      display: grid;
      place-items: center;
      border-radius: 24px;
      background: rgba(255,255,255,.055);
      border: 1px solid rgba(255,255,255,.12);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 14px 34px rgba(0,0,0,.18);
    }
    .progress-node.home .progress-disc { color: #41bdf5; }
    .progress-node.hub .progress-disc { color: #a78bfa; }
    .progress-disc ha-icon { --mdc-icon-size: 44px; }
    .progress-node-label {
      color: #8fa4bd;
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .progress-route {
      position: relative;
      height: 100px;
      display: grid;
      place-items: center;
    }
    .progress-route::before {
      content: "";
      position: absolute;
      left: 4%;
      right: 4%;
      top: 50%;
      height: 2px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,.18), transparent);
      transform: translateY(-50%);
    }
    .packet {
      position: absolute;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #5ff0a0;
      box-shadow: 0 0 0 7px rgba(95,240,160,.12), 0 0 24px rgba(95,240,160,.82);
      animation: backupMove 1.75s cubic-bezier(.55,0,.25,1) infinite;
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
    .progress-message { color: #8fa4bd; font-size: 14px; line-height: 1.5; }
    .progress-bar {
      margin-top: 14px;
      height: 8px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(255,255,255,.08);
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
      color: #b9cadf;
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
      .selection-grid { grid-template-columns: 1fr; }
      .progress-stage { grid-template-columns: 1fr; min-height: 290px; }
      .progress-route { transform: rotate(90deg); }
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

  private _openSection: "make" | "restore" = "make";
  private _backupActivityIds: number[] = [];
  private _backupDeviceIds: number[] = [];
  private _backupError: string | null = null;
  private _backupSuccess: string | null = null;
  private _backupProgress: BackupProgressEvent | null = null;
  private _restoreError: string | null = null;
  private _restoreSuccess: string | null = null;
  private _restoreProgress: BackupProgressEvent | null = null;
  private _restoreMode: "replace" | "merge" = "replace";
  private _restoreBundle: BackupBundlePayload | null = null;
  private _restoreFilename = "";
  private _restoreActivityIds: number[] = [];
  private _restoreManualDeviceIds: number[] = [];
  private _progressUnsub: (() => void) | null = null;
  private _downloadUrl: string | null = null;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardownProgressSubscription();
    this._revokeDownloadUrl();
  }

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("cacheHub") && this.cacheHub && !this._backupActivityIds.length && !this._backupDeviceIds.length) {
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
    const activities = backupActivityOptions(this.cacheHub);
    const devices = backupDeviceOptions(this.cacheHub);
    const wholeHub = backupUsesWholeHub(this._backupActivityIds);
    const selectedDeviceIds = wholeHub ? devices.map((device) => device.id) : this._backupDeviceIds;
    const isRunning = this._isProgressRunning(this._backupProgress);

    return html`
      <div class="accordion-section ${isOpen ? "open" : ""}">
        <div class="acc-header" @click=${() => this._toggleSection("make")}>
          <span class="acc-header-icon"><ha-icon icon="mdi:content-save-move-outline"></ha-icon></span>
          <span class="acc-title">Make A Backup</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
          <div class="acc-body">
            <div class="section-copy">
              Choose what to include. <strong>Selecting any Activity switches backup to full-hub mode</strong>, so all Devices are included automatically.
            </div>
            ${!this.persistentCacheEnabled || !this.cacheHub ? this._renderStatus("warning", "mdi:database-off-outline", "Enable persistent cache to choose backup contents from the card.") : nothing}
            ${this._backupError ? this._renderStatus("error", "mdi:alert-circle-outline", this._backupError) : nothing}
            ${this._backupSuccess ? this._renderStatus("success", "mdi:check-circle-outline", this._backupSuccess) : nothing}
            ${isRunning && this._backupProgress ? this._renderProgressCard(this._backupProgress, "backup") : nothing}
            <div class="selection-grid">
              <div class="selection-card">
                <div class="selection-card-header">
                  <div class="selection-card-title">Activities</div>
                  <div class="selection-card-meta">${activities.length} total</div>
                </div>
                <div class="selection-list">
                  ${activities.length ? activities.map((activity) => html`
                    <label class="selection-row">
                      <input
                        type="checkbox"
                        .checked=${this._backupActivityIds.includes(activity.id)}
                        ?disabled=${this._backupLocked() || !this.cacheHub}
                        @change=${(event: Event) => this._setBackupActivity(activity.id, (event.currentTarget as HTMLInputElement).checked)}
                      />
                      <span class="selection-main">
                        <span class="selection-label">${activity.label}</span>
                        ${activity.meta ? html`<span class="selection-sub">${activity.meta}</span>` : nothing}
                      </span>
                    </label>
                  `) : html`<div class="selection-empty">No cached activities available yet.</div>`}
                </div>
              </div>
              <div class="selection-card">
                <div class="selection-card-header">
                  <div class="selection-card-title">Devices</div>
                  <div class="selection-card-meta">${selectedDeviceIds.length}/${devices.length} selected</div>
                </div>
                <div class="selection-list">
                  ${devices.length ? devices.map((device) => {
                    const locked = wholeHub;
                    return html`
                      <label class="selection-row ${locked ? "locked" : ""}">
                        <input
                          type="checkbox"
                          .checked=${selectedDeviceIds.includes(device.id)}
                          ?disabled=${locked || this._backupLocked() || !this.cacheHub}
                          @change=${(event: Event) => this._setBackupDevice(device.id, (event.currentTarget as HTMLInputElement).checked)}
                        />
                        <span class="selection-main">
                          <span class="selection-label">${device.label}</span>
                          ${device.meta ? html`<span class="selection-sub">${locked ? `${device.meta} · included by full-hub backup` : device.meta}</span>` : nothing}
                        </span>
                      </label>
                    `;
                  }) : html`<div class="selection-empty">No cached devices available yet.</div>`}
                </div>
              </div>
            </div>
            <div class="action-row">
              <button class="primary-btn" ?disabled=${this._backupActionDisabled()} @click=${this._runBackup}>Start backup</button>
              ${this._backupProgress?.backup ? html`<button class="secondary-btn" @click=${this._downloadLatestBackup}>Download JSON</button>` : nothing}
            </div>
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderRestoreSection() {
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
          <div class="acc-body">
            <div class="section-copy">
              Load a backup file, then choose exactly what to restore. Activities automatically pull in the Devices they depend on.
            </div>
            ${this._restoreError ? this._renderStatus("error", "mdi:alert-circle-outline", this._restoreError) : nothing}
            ${this._restoreSuccess ? this._renderStatus("success", "mdi:check-circle-outline", this._restoreSuccess) : nothing}
            ${isRunning && this._restoreProgress ? this._renderProgressCard(this._restoreProgress, "restore") : nothing}
            <input id="restore-file-input" type="file" accept=".json,application/json" @change=${this._handleFilePicked} />
            <div class="action-row">
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
                  : "Merge keeps the current hub content and adds the selected backup content as new items."
              )}
              <div class="selection-grid">
                <div class="selection-card">
                  <div class="selection-card-header">
                    <div class="selection-card-title">Activities In File</div>
                    <div class="selection-card-meta">${this._restoreActivityIds.length}/${activityOptions.length} selected</div>
                  </div>
                  <div class="selection-list">
                    ${activityOptions.length ? activityOptions.map((activity) => html`
                      <label class="selection-row">
                        <input
                          type="checkbox"
                          .checked=${this._restoreActivityIds.includes(activity.id)}
                          ?disabled=${this._restoreLocked()}
                          @change=${(event: Event) => this._setRestoreActivity(activity.id, (event.currentTarget as HTMLInputElement).checked)}
                        />
                        <span class="selection-main">
                          <span class="selection-label">${activity.label}</span>
                          ${activity.meta ? html`<span class="selection-sub">${activity.meta}</span>` : nothing}
                        </span>
                      </label>
                    `) : html`<div class="selection-empty">This backup file has no activities.</div>`}
                  </div>
                </div>
                <div class="selection-card">
                  <div class="selection-card-header">
                    <div class="selection-card-title">Devices In File</div>
                    <div class="selection-card-meta">${restoreSelection.selectedDeviceIds.length}/${deviceOptions.length} selected</div>
                  </div>
                  <div class="selection-list">
                    ${deviceOptions.length ? deviceOptions.map((device) => {
                      const forced = restoreSelection.forcedDeviceIds.includes(device.id);
                      return html`
                        <label class="selection-row ${forced ? "locked" : ""}">
                          <input
                            type="checkbox"
                            .checked=${restoreSelection.selectedDeviceIds.includes(device.id)}
                            ?disabled=${forced || this._restoreLocked()}
                            @change=${(event: Event) => this._setRestoreDevice(device.id, (event.currentTarget as HTMLInputElement).checked)}
                          />
                          <span class="selection-main">
                            <span class="selection-label">${device.label}</span>
                            ${device.meta ? html`<span class="selection-sub">${forced ? `${device.meta} · required by selected activities` : device.meta}</span>` : nothing}
                          </span>
                        </label>
                      `;
                    }) : html`<div class="selection-empty">This backup file has no devices.</div>`}
                  </div>
                </div>
              </div>
              <div class="action-row">
                <button class="primary-btn" ?disabled=${this._restoreActionDisabled(restoreSelection.selectedDeviceIds)} @click=${this._runRestore}>Start restore</button>
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
            <div class="progress-disc"><ha-icon icon="mdi:remote-tv"></ha-icon></div>
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
    this._openSection = this._openSection === section ? section : section;
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

  private _setBackupActivity(activityId: number, checked: boolean) {
    const next = new Set(this._backupActivityIds);
    if (checked) next.add(activityId);
    else next.delete(activityId);
    this._backupActivityIds = [...next].sort((left, right) => left - right);
    if (!this._backupActivityIds.length && this.cacheHub) {
      this._backupDeviceIds = this._backupDeviceIds.length
        ? [...new Set(this._backupDeviceIds)].sort((left, right) => left - right)
        : backupDeviceOptions(this.cacheHub).map((device) => device.id);
    }
  }

  private _setBackupDevice(deviceId: number, checked: boolean) {
    const next = new Set(this._backupDeviceIds);
    if (checked) next.add(deviceId);
    else next.delete(deviceId);
    this._backupDeviceIds = [...next].sort((left, right) => left - right);
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

  private _backupActionDisabled() {
    if (this._backupLocked()) return true;
    if (!this.hub || !this.hass || !this.cacheHub || !this.persistentCacheEnabled) return true;
    if (backupUsesWholeHub(this._backupActivityIds)) return false;
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
    this._backupSuccess = null;
    this._backupProgress = null;
    this._revokeDownloadUrl();
    const deviceIds = backupUsesWholeHub(this._backupActivityIds) ? null : this._backupDeviceIds;
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
          this._backupSuccess = "Backup completed. Download the JSON file when you’re ready.";
          this.setHubCommandBusy?.(false, null);
        } else if (payload.status === "failed") {
          this._backupError = String(payload.error || payload.message || "Backup failed.");
          this.setHubCommandBusy?.(false, null);
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

  private _downloadLatestBackup() {
    const backup = this._backupProgress?.backup;
    if (!backup) return;
    this._revokeDownloadUrl();
    this._downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = this._downloadUrl;
    anchor.download = String(this._backupProgress?.filename || "sofabaton_backup.json");
    anchor.click();
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
