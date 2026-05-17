import { LitElement, css, html, nothing } from "lit";
import type {
  BlobFetchResponse,
  BlobPersistResponse,
  CacheHubState,
  ControlPanelHubState,
  HassLike,
} from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { formatError, proxyClientConnected, remoteAttrsForHub } from "../shared/utils/control-panel-selectors";
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
    _testFlash: { state: true },
    _saveFlash: { state: true },
    _copyFlashKey: { state: true },
    _resultViewMode: { state: true },
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
    .acc-header { flex-shrink: 0; height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 16px; cursor: pointer; user-select: none; transition: background-color 120ms ease; }
    .acc-header-icon { color: var(--secondary-text-color); display: inline-flex; flex: 0 0 auto; }
    .acc-header-icon ha-icon { --mdc-icon-size: 18px; }
    .accordion-section.open .acc-header-icon { color: var(--primary-color); }
    .acc-header:hover { background: color-mix(in srgb, var(--primary-color) 6%, var(--ha-card-background, var(--card-background-color))); }
    .acc-title { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
    .flex-spacer { flex: 1; }
    .chevron { font-size: 9px; color: var(--secondary-text-color); transition: transform 150ms; }
    .accordion-section.open .chevron { transform: rotate(180deg); }
    .acc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 12px; display: grid; gap: 6px; align-content: start; }
    .blob-section-content { display: flex; flex-direction: column; gap: 14px; padding-top: 0; min-width: 0; }
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
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, 10px);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 10px;
      cursor: pointer;
      transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
    }
    .copy-btn ha-icon {
      --mdc-icon-size: 15px;
      display: inline-flex;
    }
    .copy-btn:hover:not([data-state="success"]) {
      border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
      color: var(--primary-color);
    }
    .copy-btn:disabled {
      opacity: 0.46;
      cursor: default;
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .view-toggle {
      display: inline-flex;
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      padding: 2px;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 80%, transparent);
    }
    .view-toggle-btn {
      border: none;
      background: transparent;
      color: var(--secondary-text-color);
      font: inherit;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 999px;
      cursor: pointer;
      transition: background 140ms ease, color 140ms ease;
    }
    .view-toggle-btn:hover:not(.active) {
      color: var(--primary-text-color);
    }
    .view-toggle-btn.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .copy-btn[data-state="success"] {
      background: #2e7d32;
      border-color: #2e7d32;
      color: #ffffff;
    }
    .action-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    /* Primary action button. Visual base matches the Wifi Commands modal
       Save/Cancel buttons:
         .dialog-btn        — outlined neutral
         .dialog-btn-primary — outlined primary (1px primary border + 18%
                              primary-tinted fill + primary-text-color text)
       wifi-commands-tab.ts:374–377. Each blob action keeps that base and
       swaps the tint hue for busy/success/error states.

       Border-radius adapts via --ha-card-border-radius for theme parity. */
    .blob-action-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 38px;
      padding: 8px 14px;
      border-radius: var(--ha-card-border-radius, 10px);
      border: 1px solid var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 140ms ease, color 140ms ease, border-color 140ms ease, transform 80ms ease;
    }
    .blob-action-btn:hover:not([data-state="busy"]):not([data-state="disabled"]) {
      border-color: color-mix(in srgb, var(--primary-color) 80%, var(--primary-text-color));
      background: color-mix(in srgb, var(--primary-color) 26%, transparent);
    }
    .blob-action-btn:active:not([data-state="busy"]):not([data-state="disabled"]) {
      transform: translateY(1px);
    }
    .blob-action-btn:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--primary-color) 60%, transparent);
      outline-offset: 2px;
    }
    .blob-action-btn[data-state="busy"] {
      cursor: progress;
      border-color: color-mix(in srgb, var(--primary-color) 70%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    .blob-action-btn[data-state="success"] {
      border-color: #2e7d32;
      background: color-mix(in srgb, #2e7d32 18%, transparent);
      color: #2e7d32;
    }
    .blob-action-btn[data-state="error"] {
      border-color: var(--error-color, #db4437);
      background: color-mix(in srgb, var(--error-color, #db4437) 18%, transparent);
      color: var(--error-color, #db4437);
    }
    .blob-action-btn[data-state="disabled"] {
      cursor: default;
      border-color: var(--divider-color);
      background: transparent;
      color: color-mix(in srgb, var(--primary-text-color) 45%, transparent);
    }
    .blob-action-btn ha-icon {
      --mdc-icon-size: 16px;
      display: inline-flex;
    }
    .blob-action-spinner {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
      border-top-color: var(--primary-color);
      animation: blobActionSpin 720ms linear infinite;
    }
    @keyframes blobActionSpin {
      to { transform: rotate(360deg); }
    }
    .blob-input-host {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      width: 100%;
      min-width: 0;
    }
    .blob-input-host ha-textfield,
    .blob-input-host ha-input,
    .blob-input-host ha-textarea,
    .blob-input-host ha-selector {
      display: block;
      width: 100%;
    }
    /* ha-input ships with a built-in --ha-input-padding-bottom (default
       var(--ha-space-2), ~8px) that pushes the field above its baseline.
       ha-select has no equivalent, so the two controls otherwise sit at
       different bottoms in the same row. Zero it out here so the row
       bottom-aligns. */
    .blob-input-host ha-input {
      --ha-input-padding-bottom: 0px;
      --ha-input-padding-top: 0px;
    }
    .blob-input-host ha-textarea {
      --ha-textarea-resize: vertical;
    }
    .control-grid .blob-input-host {
      /* Pin the actual input controls to the row's baseline so a select and a
         textfield with different label heights still bottom-align. */
      align-self: end;
    }
    .results-list {
      display: grid;
      gap: 12px;
    }
    .result-card {
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color));
      border-radius: var(--ha-card-border-radius, 14px);
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
      border-radius: var(--ha-card-border-radius, 12px);
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
      height: calc((12px * 1.55 * 4) + 20px);
      overflow: auto;
    }
    /* Console-styled blob input. Visual sibling of .result-pre so the user
       sees the same dark monospace surface whether they're entering or viewing
       a blob hex / descriptor string. */
    .test-textarea {
      display: block;
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      min-height: 132px;
      resize: vertical;
      margin: 0;
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color));
      border-radius: var(--ha-card-border-radius, 12px);
      background: color-mix(in srgb, #05070b 94%, var(--card-background-color, #fff));
      color: #e7edf6;
      caret-color: #e7edf6;
      font-family: "SF Mono", "Fira Code", Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      padding: 10px 12px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .test-textarea::placeholder {
      color: color-mix(in srgb, #e7edf6 45%, transparent);
    }
    .test-textarea:focus {
      outline: none;
      border-color: color-mix(in srgb, var(--primary-color) 65%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 35%, transparent),
                  inset 0 0 0 1px color-mix(in srgb, #05070b 100%, transparent);
    }
    .test-textarea:disabled {
      opacity: 0.55;
      cursor: default;
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
  private _testFlash = false;
  private _saveFlash = false;
  private _copyFlashKey: string | null = null;
  private _resultViewMode: Record<string, "descriptor" | "hex"> = {};
  private _testFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private _saveFlashTimer: ReturnType<typeof setTimeout> | null = null;
  private _copyFlashTimer: ReturnType<typeof setTimeout> | null = null;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._testFlashTimer) { clearTimeout(this._testFlashTimer); this._testFlashTimer = null; }
    if (this._saveFlashTimer) { clearTimeout(this._saveFlashTimer); this._saveFlashTimer = null; }
    if (this._copyFlashTimer) { clearTimeout(this._copyFlashTimer); this._copyFlashTimer = null; }
  }

  private _useLegacyTextField() {
    return Boolean(customElements.get("ha-textfield")) && !customElements.get("ha-input");
  }

  /** Uppercase hub model — mirrors wifi-commands-tab's _hubVersion(). */
  private _hubVersion() {
    return String(remoteAttrsForHub(this.hass, this.hub)?.hub_version || this.hub?.version || "").toUpperCase();
  }

  /** Descriptor parsing (P:Sony12 R:... strings) is X2-only on the hub side. */
  private _supportsDescriptors() {
    return this._hubVersion().includes("X2");
  }

  /** Unicode command names (and the extended punctuation set) are X1S/X2 only. */
  private _supportsUnicodeCommandNames() {
    const v = this._hubVersion();
    return v.includes("X2") || v.includes("X1S");
  }

  /**
   * Sanitize a command name input. Pattern + length matches wifi-commands-tab's
   * _sanitizeCommandName so the user gets the same character allow-list as the
   * Wifi Commands tab uses for renaming command slots.
   */
  private _sanitizeCommandName(value: unknown) {
    const pattern = this._supportsUnicodeCommandNames()
      ? /[^\p{L}\p{N}\p{M} +&.'()_-]+/gu
      : /[^A-Za-z0-9 ]+/g;
    return String(value ?? "").replace(pattern, "").slice(0, 20);
  }

  private _blobInputPlaceholder() {
    return this._supportsDescriptors()
      ? "Paste blob hex here, or enter a descriptor such as P:Sony12 R:40000 D:1 F:18 MUL:2"
      : "Paste blob hex here.";
  }

  private _saveSubtitleText() {
    return this._supportsDescriptors()
      ? "Add a new command to an existing IR device by saving a canonical blob body or descriptor string onto the hub."
      : "Add a new command to an existing IR device by saving a canonical blob body onto the hub.";
  }

  private _testSubtitleText() {
    return this._supportsDescriptors()
      ? "Play a raw blob body or a descriptive protocol string starting with P: without saving it on the hub."
      : "Play a raw blob body without saving it on the hub.";
  }

  private _buttonState(args: {
    busy: boolean;
    error: boolean;
    success: boolean;
    canSubmit: boolean;
  }): "idle" | "busy" | "success" | "error" | "disabled" {
    if (args.busy) return "busy";
    if (args.success) return "success";
    if (args.error) return "error";
    if (!args.canSubmit) return "disabled";
    return "idle";
  }

  private _renderActionButton(args: {
    label: string;
    busyLabel: string;
    state: "idle" | "busy" | "success" | "error" | "disabled";
    idleIcon?: string;
    onClick: () => void;
  }) {
    const { label, busyLabel, state, idleIcon, onClick } = args;
    const interactive = state === "idle" || state === "success" || state === "error";
    let leadingIcon = nothing as unknown;
    if (state === "busy") {
      leadingIcon = html`<span class="blob-action-spinner" aria-hidden="true"></span>`;
    } else if (state === "success") {
      leadingIcon = html`<ha-icon icon="mdi:check-circle-outline"></ha-icon>`;
    } else if (state === "error") {
      leadingIcon = html`<ha-icon icon="mdi:alert-circle-outline"></ha-icon>`;
    } else if ((state === "idle" || state === "disabled") && idleIcon) {
      leadingIcon = html`<ha-icon icon=${idleIcon}></ha-icon>`;
    }
    const text = state === "busy" ? busyLabel : label;
    return html`
      <button
        class="blob-action-btn"
        data-state=${state}
        aria-busy=${state === "busy" ? "true" : "false"}
        ?disabled=${!interactive}
        @click=${onClick}
      >
        ${leadingIcon}
        <span>${text}</span>
      </button>
    `;
  }

  private _scheduleSuccessRevert(which: "test" | "save") {
    if (which === "test") {
      this._testFlash = true;
      if (this._testFlashTimer) clearTimeout(this._testFlashTimer);
      this._testFlashTimer = setTimeout(() => {
        this._testFlash = false;
        this._testFlashTimer = null;
      }, 1800);
    } else {
      this._saveFlash = true;
      if (this._saveFlashTimer) clearTimeout(this._saveFlashTimer);
      this._saveFlashTimer = setTimeout(() => {
        this._saveFlash = false;
        this._saveFlashTimer = null;
      }, 1800);
    }
  }

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
          <span class="acc-header-icon"><ha-icon icon="mdi:cloud-download-outline"></ha-icon></span>
          <span class="acc-title">Fetch From Hub</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
        <div class="acc-body" id="acc-body-fetch">
          <div class="blob-section-content">
          <div class="blob-section-subtitle">Retrieve a normalized blob from a cached hub device command.</div>
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
        ${commands.map((command) => {
          const cmdKey = `cmd-${command.device_id ?? "?"}-${command.command_id ?? "?"}`;
          const copied = this._copyFlashKey === cmdKey;
          const descriptor = String(command.parsed_blob ?? "").trim();
          const rawBlob = String(command.command_blob ?? "");
          const hasDescriptor = descriptor !== "";
          const mode: "descriptor" | "hex" = hasDescriptor
            ? (this._resultViewMode[cmdKey] ?? "descriptor")
            : "hex";
          const shownText = mode === "descriptor" ? descriptor : rawBlob;
          const copyTarget = mode === "descriptor" ? descriptor : rawBlob;
          return html`
          <article class="result-card">
            <div class="result-head">
              <div class="result-title">${String(command.command_label || `Command ${command.command_id ?? "unknown"}`)}</div>
              <div class="result-badges">
                <span class="result-badge">${this._deviceClassLabel(command.device_class)}</span>
                <span class="result-badge">Cmd ${String(command.command_id ?? "?")}</span>
              </div>
            </div>
            <div class="result-block">
              <div class="result-block-head">
                ${hasDescriptor
                  ? html`
                      <div
                        class="view-toggle"
                        role="tablist"
                        aria-label="Blob view mode"
                      >
                        <button
                          class="view-toggle-btn${mode === "descriptor" ? " active" : ""}"
                          role="tab"
                          aria-selected=${mode === "descriptor" ? "true" : "false"}
                          @click=${() => this._setResultViewMode(cmdKey, "descriptor")}
                        >Descriptor</button>
                        <button
                          class="view-toggle-btn${mode === "hex" ? " active" : ""}"
                          role="tab"
                          aria-selected=${mode === "hex" ? "true" : "false"}
                          @click=${() => this._setResultViewMode(cmdKey, "hex")}
                        >Hex</button>
                      </div>
                    `
                  : html`<div class="result-label">Raw Blob</div>`}
                <button
                  class="copy-btn"
                  data-state=${copied ? "success" : "idle"}
                  aria-live="polite"
                  @click=${() => void this._copyText(copyTarget, cmdKey)}
                >
                  <ha-icon icon=${copied ? "mdi:check" : "mdi:content-copy"}></ha-icon>
                  <span>${copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre class="result-pre result-pre--scrollable">${shownText}</pre>
            </div>
          </article>
        `;
        })}
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
          <span class="acc-header-icon"><ha-icon icon="mdi:flash-outline"></ha-icon></span>
          <span class="acc-title">Test A Blob</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
        <div class="acc-body" id="acc-body-test">
          <div class="blob-section-content">
          <div class="blob-section-subtitle">${this._testSubtitleText()}</div>
          ${proxyConnected
            ? this._renderStatus(
                "warning",
                "mdi:access-point-network-off",
                "Blob playback is unavailable while the Sofabaton app is connected through the proxy.",
              )
            : nothing}
          ${this._renderBlobTextarea({
            value: this._testBlobInput,
            disabled: busy || proxyConnected,
            placeholder: this._blobInputPlaceholder(),
            onInput: (value: string) => {
              this._testBlobInput = value;
              this._testError = "";
              this._testSuccess = "";
              this._testFlash = false;
            },
          })}
          <div class="action-row">
            ${this._renderActionButton({
              label: "Test",
              busyLabel: "Testing…",
              idleIcon: "mdi:flash-outline",
              state: this._buttonState({
                busy: this._testLoading,
                error: Boolean(this._testError),
                success: this._testFlash && Boolean(this._testSuccess),
                canSubmit,
              }),
              onClick: () => void this._runTest(),
            })}
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
    const irDeviceOptions = this._deviceOptions().filter(
      (option) => String(option.deviceClass || "").trim().toLowerCase() === "ir",
    );
    const canSubmit =
      !busy
      && !proxyConnected
      && deviceIdValid
      && String(this._saveCommandName || "").trim() !== ""
      && String(this._saveBlobInput || "").trim() !== "";

    return html`
      <div class="accordion-section${isOpen ? " open" : ""}" id="acc-save">
        <div class="acc-header" @click=${() => this._toggleSection("save")}>
          <span class="acc-header-icon"><ha-icon icon="mdi:content-save-outline"></ha-icon></span>
          <span class="acc-title">Save To Hub</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? html`
        <div class="acc-body" id="acc-body-save">
          <div class="blob-section-content">
          <div class="blob-section-subtitle">${this._saveSubtitleText()}</div>
          ${proxyConnected
            ? this._renderStatus(
                "warning",
                "mdi:access-point-network-off",
                "Blob saving is unavailable while the Sofabaton app is connected through the proxy.",
              )
            : nothing}
          ${irDeviceOptions.length === 0 && !proxyConnected
            ? this._renderStatus(
                "warning",
                "mdi:refresh-circle",
                "No IR devices found in the cache. Refresh devices from the Cache tab first.",
              )
            : nothing}
          <div class="control-grid">
            <div class="blob-input-host">
              <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [{ value: "__none__", label: "Select one" }, ...irDeviceOptions.map((option) => ({ value: option.value, label: option.label }))] } }}
                .label=${"IR device"}
                .value=${this._saveDeviceIdInput && this._saveDeviceIdInput !== "__none__" ? this._saveDeviceIdInput : "__none__"}
                .disabled=${busy || proxyConnected || irDeviceOptions.length === 0}
                @value-changed=${(event: CustomEvent) => {
                  const raw = String(event.detail?.value ?? "");
                  this._saveDeviceIdInput = raw && raw !== "__none__" ? raw : "";
                  this._saveError = "";
                  this._saveSuccess = "";
                  this._saveResult = null;
                  this._saveFlash = false;
                }}
              ></ha-selector>
            </div>
            ${this._renderCommandNameInput(busy, proxyConnected)}
          </div>
          ${this._renderBlobTextarea({
            value: this._saveBlobInput,
            disabled: busy || proxyConnected,
            placeholder: this._blobInputPlaceholder(),
            onInput: (value: string) => {
              this._saveBlobInput = value;
              this._saveError = "";
              this._saveSuccess = "";
              this._saveResult = null;
              this._saveFlash = false;
            },
          })}
          <div class="action-row">
            ${this._renderActionButton({
              label: "Save",
              busyLabel: "Saving…",
              idleIcon: "mdi:content-save-outline",
              state: this._buttonState({
                busy: this._saveLoading,
                error: Boolean(this._saveError),
                success: this._saveFlash && Boolean(this._saveSuccess),
                canSubmit,
              }),
              onClick: () => void this._runSave(),
            })}
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

/**
   * Command-name input that matches the Wifi Commands tab character allow-list
   * and length cap exactly:
   *   - X1S/X2: Unicode letters/numbers/marks + ` +&.'()_-`
   *   - X1:    `[A-Za-z0-9 ]`
   *   - Max 20 chars
   * Pattern follows wifi-commands-tab._sanitizeCommandName via shared logic.
   *
   * The @input handler only rewrites the live DOM value (no state update) to
   * avoid a state-driven re-render every keystroke (which would reset cursor
   * position). State commits on @change.
   */
  private _renderCommandNameInput(busy: boolean, proxyConnected: boolean) {
    const onInputLive = (event: Event) => {
      const input = event.currentTarget as HTMLElement & { value: string };
      const value = this._sanitizeCommandName(input.value);
      if (input.value !== value) input.value = value;
    };
    const onCommit = (event: Event) => {
      const input = event.currentTarget as HTMLElement & { value: string };
      const value = this._sanitizeCommandName(input.value);
      input.value = value;
      this._saveCommandName = value;
      this._saveError = "";
      this._saveSuccess = "";
      this._saveResult = null;
      this._saveFlash = false;
    };
    const disabled = busy || proxyConnected;

    if (this._useLegacyTextField()) {
      return html`
        <div class="blob-input-host">
          <ha-textfield
            .label=${"Command name"}
            .maxLength=${20}
            .value=${this._saveCommandName}
            .disabled=${disabled}
            @input=${onInputLive}
            @change=${onCommit}
          ></ha-textfield>
        </div>
      `;
    }

    if (customElements.get("ha-input")) {
      return html`
        <div class="blob-input-host">
          <ha-input
            type="text"
            .label=${"Command name"}
            .maxlength=${20}
            .value=${this._saveCommandName}
            .disabled=${disabled}
            @input=${onInputLive}
            @change=${onCommit}
          ></ha-input>
        </div>
      `;
    }

    return html`
      <input
        class="text-input"
        type="text"
        maxlength="20"
        .value=${this._saveCommandName}
        .disabled=${disabled}
        placeholder="Command name"
        @input=${onInputLive}
        @change=${onCommit}
      />
    `;
  }

  private _renderSingleLineInput(args: {
    kind: "text" | "number";
    label: string;
    value: string;
    disabled: boolean;
    placeholder: string;
    min?: number;
    max?: number;
    onInput: (value: string) => void;
  }) {
    const { kind, label, value, disabled, placeholder, min, max, onInput } = args;
    const handleInputEvent = (event: Event) => {
      const target = event.currentTarget as HTMLElement & { value?: string };
      onInput(String(target?.value ?? ""));
    };

    if (this._useLegacyTextField()) {
      return html`
        <div class="blob-input-host">
          <ha-textfield
            type=${kind}
            .label=${label}
            .value=${value}
            .disabled=${disabled}
            .placeholder=${placeholder}
            min=${min ?? nothing}
            max=${max ?? nothing}
            @input=${handleInputEvent}
            @change=${handleInputEvent}
          ></ha-textfield>
        </div>
      `;
    }

    if (customElements.get("ha-input")) {
      return html`
        <div class="blob-input-host">
          <ha-input
            type=${kind}
            .label=${label}
            .value=${value}
            .disabled=${disabled}
            .placeholder=${placeholder}
            min=${min ?? nothing}
            max=${max ?? nothing}
            @input=${handleInputEvent}
            @change=${handleInputEvent}
          ></ha-input>
        </div>
      `;
    }

    return html`
      <input
        class="text-input"
        type=${kind}
        .value=${value}
        .disabled=${disabled}
        placeholder=${placeholder}
        min=${min ?? nothing}
        max=${max ?? nothing}
        @input=${handleInputEvent}
      />
    `;
  }

  /**
   * Blob hex / descriptor textarea. Always rendered as a native textarea
   * styled to look like the result console (.result-pre) — dark monospace
   * surface, light text — since this is a code-editor field, not a form
   * label field. Using ha-textarea here would fight HA's light-surface
   * theming and break the console look.
   */
  private _renderBlobTextarea(args: {
    value: string;
    disabled: boolean;
    placeholder: string;
    onInput: (value: string) => void;
  }) {
    const { value, disabled, placeholder, onInput } = args;
    const handleInputEvent = (event: Event) => {
      const target = event.currentTarget as HTMLElement & { value?: string };
      onInput(String(target?.value ?? ""));
    };

    return html`
      <textarea
        class="test-textarea"
        .value=${value}
        .disabled=${disabled}
        placeholder=${placeholder}
        spellcheck="false"
        autocapitalize="off"
        autocorrect="off"
        @input=${handleInputEvent}
      ></textarea>
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
    this._testFlash = false;
    this._saveFlash = false;
    if (this._testFlashTimer) { clearTimeout(this._testFlashTimer); this._testFlashTimer = null; }
    if (this._saveFlashTimer) { clearTimeout(this._saveFlashTimer); this._saveFlashTimer = null; }
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

  private _setResultViewMode(cmdKey: string, mode: "descriptor" | "hex") {
    if (this._resultViewMode[cmdKey] === mode) return;
    this._resultViewMode = { ...this._resultViewMode, [cmdKey]: mode };
  }

  private async _copyText(value: string, flashKey: string) {
    const text = String(value || "");
    if (!text) return;
    let copied = false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        // Fall back to legacy execCommand path below — modern API can reject
        // when the document is unfocused or permissions block silent writes.
      }
    }
    if (!copied) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        copied = false;
      }
    }
    if (!copied) return;
    this._copyFlashKey = flashKey;
    if (this._copyFlashTimer) clearTimeout(this._copyFlashTimer);
    this._copyFlashTimer = setTimeout(() => {
      this._copyFlashKey = null;
      this._copyFlashTimer = null;
    }, 1500);
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
      this._scheduleSuccessRevert("test");
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
        this._scheduleSuccessRevert("save");
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
