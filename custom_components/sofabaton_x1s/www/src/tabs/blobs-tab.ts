import { LitElement, css, html, nothing } from "lit";
import type {
  BlobFetchResponse,
  BlobPersistResponse,
  CacheHubState,
  ControlPanelHubState,
  HassLike,
} from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { formatError, proxyClientConnected } from "../shared/utils/control-panel-selectors";
import {
  blobCommandOptions,
  blobDeviceOptions,
  blobFetchBlockedReason,
  type BlobCommandOption,
  type BlobDeviceOption,
} from "./blobs-state";

class SofabatonBlobsTab extends LitElement {
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
    _selectedDeviceId: { state: true },
    _selectedCommandId: { state: true },
    _fetchLoading: { state: true },
    _fetchError: { state: true },
    _fetchResponse: { state: true },
    _testBlobInput: { state: true },
    _testLoading: { state: true },
    _testError: { state: true },
    _testSuccess: { state: true },
    _saveDeviceIdInput: { state: true },
    _saveCommandName: { state: true },
    _saveBlobInput: { state: true },
    _saveLoading: { state: true },
    _saveError: { state: true },
    _saveSuccess: { state: true },
    _saveResult: { state: true },
    _loadedEntryId: { state: true },
    _openSection: { state: true },
  };

  static styles = css`
    :host { display: flex; flex: 1; min-height: 0; }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow-y: auto; }
    .state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); }
    .state.error { color: var(--error-color, #db4437); }
    .blob-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; margin: -16px; }
    .accordion-section { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--divider-color); }
    .accordion-section:first-child { border-top: none; }
    .accordion-section.open { flex: 1; }
    .acc-header { flex-shrink: 0; height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 16px; cursor: pointer; user-select: none; transition: background-color 120ms ease; }
    .acc-header:hover { background: color-mix(in srgb, var(--primary-color) 6%, var(--ha-card-background, var(--card-background-color))); }
    .acc-title { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
    .flex-spacer { flex: 1; }
    .chevron { font-size: 9px; color: var(--secondary-text-color); transition: transform 150ms; }
    .accordion-section.open .chevron { transform: rotate(180deg); }
    .acc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 12px; display: grid; gap: 6px; align-content: start; }
    .blob-section-content { display: flex; flex-direction: column; gap: 14px; padding-top: 12px; min-width: 0; }
    .blob-section-title { font-size: 16px; font-weight: 800; color: var(--primary-text-color); }
    .blob-section-subtitle { font-size: 13px; line-height: 1.5; color: var(--secondary-text-color); }
    .section-status {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.45;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 80%, transparent);
    }
    .section-status.error {
      color: var(--error-color, #db4437);
      border-color: color-mix(in srgb, var(--error-color, #db4437) 30%, var(--divider-color));
      background: color-mix(in srgb, var(--error-color, #db4437) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .section-status.success {
      color: #2e7d32;
      border-color: color-mix(in srgb, #2e7d32 30%, var(--divider-color));
      background: color-mix(in srgb, #2e7d32 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .section-status.warning {
      border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-icon { color: inherit; display: inline-flex; flex: 0 0 auto; }
    .status-icon ha-icon { --mdc-icon-size: 18px; }
    .control-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
      align-items: end;
    }
    .control-grid ha-selector {
      width: 100%;
      min-width: 0;
    }
    .copy-btn {
      border: 1px solid var(--divider-color);
      border-radius: 10px;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
    }
    .copy-btn:hover {
      border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
    }
    .copy-btn:disabled {
      opacity: 0.46;
      cursor: default;
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .results-list {
      display: grid;
      gap: 12px;
    }
    .result-card {
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color));
      border-radius: 14px;
      padding: 14px;
      display: grid;
      gap: 10px;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 78%, transparent);
    }
    .result-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .result-title {
      font-size: 14px;
      font-weight: 800;
      color: var(--primary-text-color);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .result-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .result-badge {
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      color: var(--secondary-text-color);
      background: var(--ha-card-background, var(--card-background-color));
    }
    .result-block {
      display: grid;
      gap: 6px;
    }
    .result-block-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .result-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .result-pre {
      margin: 0;
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color));
      border-radius: 12px;
      background: color-mix(in srgb, #05070b 94%, var(--card-background-color, #fff));
      color: #e7edf6;
      font-family: "SF Mono", "Fira Code", Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      padding: 10px 12px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      user-select: text;
      -webkit-user-select: text;
    }
    .result-pre--scrollable {
      height: calc((12px * 1.55 * 8) + 20px);
      overflow: auto;
    }
    .test-textarea {
      display: block;
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      min-height: 132px;
      resize: vertical;
      border: 1px solid var(--divider-color);
      border-radius: 14px;
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      line-height: 1.5;
      padding: 12px 14px;
    }
    .test-textarea:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 35%, transparent);
    }
    .test-textarea:disabled {
      opacity: 0.7;
      cursor: default;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 80%, transparent);
    }
    .text-input {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid var(--divider-color);
      border-radius: 14px;
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      line-height: 1.4;
      padding: 12px 14px;
    }
    .text-input:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 35%, transparent);
    }
    .text-input:disabled {
      opacity: 0.7;
      cursor: default;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 80%, transparent);
    }
    @media (max-width: 760px) {
      .chevron { display: none; }
    }
    @media (max-width: 980px) {
      .control-grid {
        grid-template-columns: 1fr;
      }
    }
  `;

  hass: HassLike | null = null;
  hub: ControlPanelHubState | null = null;
  cacheHub: CacheHubState | null = null;
  setHubCommandBusy: ((busy: boolean, label?: string | null) => void) | null = null;
  refreshControlPanelState: (() => Promise<void> | void) | null = null;
  hubCommandBusy = false;
  hubCommandBusyLabel: string | null = null;
  loading = false;
  error: string | null = null;
  persistentCacheEnabled = false;

  private _selectedDeviceId: number | null = null;
  private _selectedCommandId: number | null = null;
  private _fetchLoading = false;
  private _fetchError = "";
  private _fetchResponse: BlobFetchResponse | null = null;
  private _testBlobInput = "";
  private _testLoading = false;
  private _testError = "";
  private _testSuccess = "";
  private _saveDeviceIdInput = "";
  private _saveCommandName = "";
  private _saveBlobInput = "";
  private _saveLoading = false;
  private _saveError = "";
  private _saveSuccess = "";
  private _saveResult: BlobPersistResponse | null = null;
  private _loadedEntryId = "";
  private _openSection: "fetch" | "test" | "save" | null = "fetch";

  protected updated(changed: Map<string, unknown>) {
    if (changed.has("hub")) this._handleHubChanged();
    if (changed.has("cacheHub")) this._normalizeSelections();
  }

  protected render() {
    if (this.loading) return html`<div class="state">Loading…</div>`;
    if (this.error) return html`<div class="state error">${this.error}</div>`;
    if (!this.hub) return html`<div class="state">No hubs found.</div>`;

    return html`
      <div class="tab-panel">
        <div class="blob-panel">
          ${this._renderFetchSection(this._openSection === "fetch")}
          ${this._renderTestSection(this._openSection === "test")}
          ${this._renderSaveSection(this._openSection === "save")}
        </div>
      </div>
    `;
  }

  private _renderFetchSection(isOpen: boolean) {
    const deviceOptions = this._deviceOptions();
    const commandOptions = this._commandOptions();
    const fetchBlocked = blobFetchBlockedReason({
      persistentCacheEnabled: this.persistentCacheEnabled,
      selectedDeviceId: this._selectedDeviceId,
      commandCount: commandOptions.length,
    });
    const disabled = this._busy() || !this.persistentCacheEnabled;

    return html`
      <div class="accordion-section${isOpen ? " open" : ""}" id="acc-fetch">
        <div class="acc-header" @click=${() => this._toggleSection("fetch")}>
          <span class="acc-title">Fetch</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
        <div class="acc-body" id="acc-body-fetch">
          <div class="blob-section-content">
          <div>
            <div class="blob-section-title">Fetch</div>
            <div class="blob-section-subtitle">Retrieve a normalized blob from a cached hub device command.</div>
          </div>
          ${fetchBlocked === "cache_disabled"
            ? this._renderStatus(
                "warning",
                "mdi:database-off-outline",
                "Enable persistent cache in the Hub tab before using Fetch.",
              )
            : nothing}
          <div class="control-grid">
            <ha-selector
              .hass=${this.hass}
              .selector=${{ select: { mode: "dropdown", options: [{ value: "__none__", label: "Select one" }, ...deviceOptions.map((option) => ({ value: option.value, label: option.label }))] } }}
              .label=${"Device"}
              .value=${this._selectedDeviceId == null ? "__none__" : String(this._selectedDeviceId)}
              .disabled=${disabled}
              @value-changed=${(event: CustomEvent) => this._handleDeviceChanged(event)}
            ></ha-selector>
            <ha-selector
              .hass=${this.hass}
              .selector=${{ select: { mode: "dropdown", options: [{ value: "__none__", label: "Select one" }, ...commandOptions.map((option) => ({ value: option.value, label: option.label }))] } }}
              .label=${"Command"}
              .value=${this._selectedCommandId == null ? "__none__" : String(this._selectedCommandId)}
              .disabled=${disabled || this._selectedDeviceId == null || fetchBlocked === "no_commands"}
              @value-changed=${(event: CustomEvent) => this._handleCommandChanged(event)}
            ></ha-selector>
          </div>
          ${fetchBlocked === "no_commands"
            ? this._renderStatus(
                "warning",
                "mdi:refresh-circle",
                "This device has no cached commands yet. Refresh that device from the Cache tab first.",
              )
            : nothing}
          ${this._fetchError
            ? this._renderStatus("error", "mdi:alert-circle-outline", this._fetchError)
            : nothing}
          ${this._fetchResponse ? this._renderFetchResults() : nothing}
          </div>
        </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderFetchResults() {
    const commands = this._fetchResponse?.commands ?? [];
    if (!commands.length) {
      return this._renderStatus(
        "warning",
        "mdi:file-search-outline",
        "The hub returned no blob records for this request.",
      );
    }

    return html`
      <div class="results-list">
        ${commands.map((command) => html`
          <article class="result-card">
            <div class="result-head">
              <div class="result-title">${String(command.command_label || `Command ${command.command_id ?? "unknown"}`)}</div>
              <div class="result-badges">
                <span class="result-badge">${this._deviceClassLabel(command.device_class)}</span>
                <span class="result-badge">Cmd ${String(command.command_id ?? "?")}</span>
              </div>
            </div>
            ${command.parsed_blob
              ? html`
                  <div class="result-block">
                    <div class="result-label">Descriptor</div>
                    <pre class="result-pre">${command.parsed_blob}</pre>
                  </div>
                `
              : nothing}
            <div class="result-block">
              <div class="result-block-head">
                <div class="result-label">Raw Blob</div>
                <button class="copy-btn" @click=${() => this._copyText(String(command.command_blob || ""))}>Copy</button>
              </div>
              <pre class="result-pre result-pre--scrollable">${String(command.command_blob || "")}</pre>
            </div>
          </article>
        `)}
      </div>
    `;
  }

  private _renderTestSection(isOpen: boolean) {
    const proxyConnected = proxyClientConnected(this.hass, this.hub);
    const busy = this._busy();
    const canSubmit = !busy && !proxyConnected && String(this._testBlobInput || "").trim() !== "";

    return html`
      <div class="accordion-section${isOpen ? " open" : ""}" id="acc-test">
        <div class="acc-header" @click=${() => this._toggleSection("test")}>
          <span class="acc-title">Test</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
        <div class="acc-body" id="acc-body-test">
          <div class="blob-section-content">
          <div>
            <div class="blob-section-title">Test</div>
            <div class="blob-section-subtitle">Play a raw blob body or a descriptive protocol string starting with P: without saving it on the hub.</div>
          </div>
          ${proxyConnected
            ? this._renderStatus(
                "warning",
                "mdi:access-point-network-off",
                "Blob playback is unavailable while the Sofabaton app is connected through the proxy.",
              )
            : nothing}
          <textarea
            class="test-textarea"
            .value=${this._testBlobInput}
            .disabled=${busy || proxyConnected}
            placeholder="Paste blob hex here, or enter a descriptor such as P:Sony12 R:40000 D:1 F:18 MUL:2"
            @input=${(event: Event) => {
              this._testBlobInput = String((event.currentTarget as HTMLTextAreaElement).value || "");
              this._testError = "";
              this._testSuccess = "";
            }}
          ></textarea>
          <div>
            <button class="section-action primary" ?disabled=${!canSubmit} @click=${this._runTest}>${this._testLoading ? "Testing…" : "Test"}</button>
          </div>
          ${this._testError
            ? this._renderStatus("error", "mdi:alert-circle-outline", this._testError)
            : nothing}
          ${this._testSuccess
            ? this._renderStatus("success", "mdi:check-circle-outline", this._testSuccess)
            : nothing}
          </div>
        </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderSaveSection(isOpen: boolean) {
    const proxyConnected = proxyClientConnected(this.hass, this.hub);
    const busy = this._busy();
    const parsedDeviceId = Number.parseInt(String(this._saveDeviceIdInput || "").trim(), 10);
    const deviceIdValid = Number.isInteger(parsedDeviceId) && parsedDeviceId >= 1 && parsedDeviceId <= 255;
    const canSubmit =
      !busy
      && !proxyConnected
      && deviceIdValid
      && String(this._saveCommandName || "").trim() !== ""
      && String(this._saveBlobInput || "").trim() !== "";

    return html`
      <div class="accordion-section${isOpen ? " open" : ""}" id="acc-save">
        <div class="acc-header" @click=${() => this._toggleSection("save")}>
          <span class="acc-title">Save</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
        <div class="acc-body" id="acc-body-save">
          <div class="blob-section-content">
          <div>
            <div class="blob-section-title">Save</div>
            <div class="blob-section-subtitle">Add a new command to an existing IR device by saving a canonical blob body or descriptor string onto the hub.</div>
          </div>
          ${proxyConnected
            ? this._renderStatus(
                "warning",
                "mdi:access-point-network-off",
                "Blob saving is unavailable while the Sofabaton app is connected through the proxy.",
              )
            : nothing}
          ${this._renderStatus(
            "warning",
            "mdi:infrared",
            "Save currently targets existing IR devices. Enter the hub device id and the new command name.",
          )}
          <div class="control-grid">
            <input
              class="text-input"
              type="number"
              min="1"
              max="255"
              .value=${this._saveDeviceIdInput}
              .disabled=${busy || proxyConnected}
              placeholder="Device id"
              @input=${(event: Event) => {
                this._saveDeviceIdInput = String((event.currentTarget as HTMLInputElement).value || "");
                this._saveError = "";
                this._saveSuccess = "";
                this._saveResult = null;
              }}
            />
            <input
              class="text-input"
              type="text"
              .value=${this._saveCommandName}
              .disabled=${busy || proxyConnected}
              placeholder="Command name"
              @input=${(event: Event) => {
                this._saveCommandName = String((event.currentTarget as HTMLInputElement).value || "");
                this._saveError = "";
                this._saveSuccess = "";
                this._saveResult = null;
              }}
            />
          </div>
          <textarea
            class="test-textarea"
            .value=${this._saveBlobInput}
            .disabled=${busy || proxyConnected}
            placeholder="Paste blob hex here, or enter a descriptor such as P:Sony12 R:40000 D:1 F:18 MUL:2"
            @input=${(event: Event) => {
              this._saveBlobInput = String((event.currentTarget as HTMLTextAreaElement).value || "");
              this._saveError = "";
              this._saveSuccess = "";
              this._saveResult = null;
            }}
          ></textarea>
          <div>
            <button class="section-action primary" ?disabled=${!canSubmit} @click=${this._runSave}>${this._saveLoading ? "Saving…" : "Save"}</button>
          </div>
          ${this._saveError
            ? this._renderStatus("error", "mdi:alert-circle-outline", this._saveError)
            : nothing}
          ${this._saveSuccess
            ? this._renderStatus("success", "mdi:check-circle-outline", this._saveSuccess)
            : nothing}
          </div>
        </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderStatus(tone: "warning" | "error" | "success", icon: string, message: string) {
    return html`
      <div class="section-status ${tone}">
        <span class="status-icon"><ha-icon icon=${icon}></ha-icon></span>
        <span>${message}</span>
      </div>
    `;
  }

  private _handleHubChanged() {
    const nextEntryId = String(this.hub?.entry_id || "").trim();
    if (nextEntryId === this._loadedEntryId) return;
    this._loadedEntryId = nextEntryId;
    this._selectedDeviceId = null;
    this._selectedCommandId = null;
    this._fetchLoading = false;
    this._fetchError = "";
    this._fetchResponse = null;
    this._testBlobInput = "";
    this._testLoading = false;
    this._testError = "";
    this._testSuccess = "";
    this._saveDeviceIdInput = "";
    this._saveCommandName = "";
    this._saveBlobInput = "";
    this._saveLoading = false;
    this._saveError = "";
    this._saveSuccess = "";
    this._saveResult = null;
  }

  private _normalizeSelections() {
    const deviceOptions = this._deviceOptions();
    if (this._selectedDeviceId != null && !deviceOptions.some((option) => Number(option.value) === this._selectedDeviceId)) {
      this._selectedDeviceId = null;
      this._selectedCommandId = null;
      this._fetchResponse = null;
      this._fetchError = "";
      return;
    }

    const commandOptions = this._commandOptions();
    if (this._selectedCommandId != null && !commandOptions.some((option) => Number(option.value) === this._selectedCommandId)) {
      this._selectedCommandId = null;
      this._fetchResponse = null;
      this._fetchError = "";
    }
  }

  private _handleDeviceChanged(event: CustomEvent) {
    const value = String(event.detail?.value ?? "");
    this._selectedDeviceId = value && value !== "__none__" ? Number(value) : null;
    this._selectedCommandId = null;
    this._fetchResponse = null;
    this._fetchError = "";
  }

  private _handleCommandChanged(event: CustomEvent) {
    const value = String(event.detail?.value ?? "");
    this._selectedCommandId = value && value !== "__none__" ? Number(value) : null;
    this._fetchResponse = null;
    this._fetchError = "";
    if (this._selectedDeviceId != null && this._selectedCommandId != null) void this._runFetch();
  }

  private _deviceOptions(): BlobDeviceOption[] {
    return blobDeviceOptions(this.cacheHub);
  }

  private _commandOptions(): BlobCommandOption[] {
    return blobCommandOptions(this.cacheHub, this._selectedDeviceId);
  }

  private _selectedDevice() {
    return this._deviceOptions().find((option) => Number(option.value) === this._selectedDeviceId) ?? null;
  }

  private _deviceClassLabel(deviceClass: string | null | undefined) {
    const normalized = String(deviceClass || "").trim();
    return normalized || "Unknown class";
  }

  private async _copyText(value: string) {
    const text = String(value || "");
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }

  private _toggleSection(section: "fetch" | "test" | "save") {
    this._openSection = this._openSection === section ? null : section;
  }

  private _busy() {
    return Boolean(this.hubCommandBusy || this._fetchLoading || this._testLoading || this._saveLoading);
  }

  private _api() {
    if (!this.hass) throw new Error("Home Assistant context is unavailable");
    return new ControlPanelApi(this.hass);
  }

  private _setSharedBusy(busy: boolean, label?: string | null) {
    this.setHubCommandBusy?.(busy, label ?? null);
  }

  private async _refreshControlPanelState() {
    await this.refreshControlPanelState?.();
  }

  private _runFetch = async () => {
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entryId || this._selectedDeviceId == null || this._selectedCommandId == null || this._busy()) return;

    this._fetchLoading = true;
    this._fetchError = "";
    this._fetchResponse = null;
    this._setSharedBusy(true, "Fetching blob…");
    try {
      this._fetchResponse = await this._api().fetchBlob(entryId, this._selectedDeviceId, this._selectedCommandId);
    } catch (error) {
      this._fetchError = formatError(error);
    } finally {
      this._fetchLoading = false;
      this._setSharedBusy(false);
    }
  };

  private _runTest = async () => {
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entryId || this._busy() || proxyClientConnected(this.hass, this.hub)) return;
    if (!String(this._testBlobInput || "").trim()) return;

    this._testLoading = true;
    this._testError = "";
    this._testSuccess = "";
    this._setSharedBusy(true, "Testing blob…");
    try {
      await this._api().playIrBlob(entryId, this._testBlobInput);
      this._testSuccess = "Blob sent to the hub for one-shot playback.";
    } catch (error) {
      this._testError = formatError(error);
    } finally {
      this._testLoading = false;
      this._setSharedBusy(false);
    }
  };

  private _runSave = async () => {
    const entryId = String(this.hub?.entry_id || "").trim();
    const deviceId = Number.parseInt(String(this._saveDeviceIdInput || "").trim(), 10);
    if (!entryId || this._busy() || proxyClientConnected(this.hass, this.hub)) return;
    if (!Number.isInteger(deviceId) || deviceId < 1 || deviceId > 255) return;
    if (!String(this._saveCommandName || "").trim() || !String(this._saveBlobInput || "").trim()) return;

    this._saveLoading = true;
    this._saveError = "";
    this._saveSuccess = "";
    this._saveResult = null;
    this._setSharedBusy(true, "Saving blob…");
      try {
        this._saveResult = await this._api().persistIrBlob(
          entryId,
          deviceId,
          this._saveCommandName,
          this._saveBlobInput,
        );
        await this._refreshControlPanelState();
        this._saveSuccess =
          `Saved command ${this._saveResult.command_name} as id ${this._saveResult.command_id} on device ${this._saveResult.device_id}.`;
      } catch (error) {
        this._saveError = formatError(error);
      } finally {
      this._saveLoading = false;
      this._setSharedBusy(false);
    }
  };
}

if (!customElements.get("sofabaton-blobs-tab")) {
  customElements.define("sofabaton-blobs-tab", SofabatonBlobsTab);
}
