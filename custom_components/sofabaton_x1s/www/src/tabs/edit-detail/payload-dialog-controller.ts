// The command payload dialog as a Lit reactive controller (R6, CR-F2-14).
//
// It owns the dialog state (target, raw and decoded drafts, the IR hex
// tabs, foreign-code conversion, live fetch and Test, add-command mode)
// and its rendering. Edits still commit through the element, and the
// learn mode stays in IrLearnController.

import {
  html,
  nothing,
  type ReactiveController,
  type ReactiveControllerHost,
} from "lit";
import { DOC_URLS } from "../../shared/doc-links";
import { TOOLS_CARD_STRINGS } from "../../strings";
import {
  IrFormatError,
  buildSofabatonBlob,
  detectIrPayloadFormat,
  formatHexForDisplay,
  parseProntoHex,
  parseSofabatonBlob,
  renderProntoHex,
  resolveUcPaste,
} from "../../shared/ir-format";
import type { IrPayloadForeignFormat } from "../../shared/ha-context";
import { localizeBackendError } from "../../shared/utils/backend-state-localization";
import {
  addBundleDeviceCommand,
  type BackupCommandDecodedBlock,
  type DecodableCommandClass,
  type DecodedFieldSpec,
  bundleDeviceClass,
  commandDecodedBlock,
  commandRawPayloadHex,
  normalizeCommandPayloadHex,
  setCommandRestoreData,
  updateCommandRawPayload,
  DECODED_CLASS_FORM_SPECS,
  defaultDecodedSnapshotForClass,
  deviceCommandItems,
  nextFreeDeviceCommandId,
  updateCommandDecodedFields,
} from "../backup-state";
import type { FetchedCommandPayload } from "./host-types";
import { bundleIsX2, editorErrorMessage, sanitizeBundleName } from "./names";
import { decodedSnapshotFromFetch, draftToFieldValue, fieldValueToDraft } from "./payload-drafts";
import type { SofabatonEditDetailView } from "../edit-detail-view";

/** The element members the controller reaches. */
export type PayloadDialogHost = ReactiveControllerHost &
  Pick<
    SofabatonEditDetailView,
    "_commitEditBundleEdit"
    | "_learn"
    | "bundle"
    | "convertForeignPayload"
    | "entityId"
    | "fetchCommandPayload"
    | "mode"
    | "testCommandPayload"
  >;

export class PayloadDialogController implements ReactiveController {
  // ── Payload dialog (structured decoded form OR raw hex) ────────────
  // Separate from the rename dialog: renaming is the common case and
  // stays a compact name-only form; payload editing has its own button
  // and popup on each command row.
  private _open = false;
  get open(): boolean {
    return this._open;
  }
  set open(value: boolean) {
    if (value === this._open) return;
    this._open = value;
    this.host.requestUpdate();
  }
  private _target: { deviceId: number; commandId: number } | null = null;
  get target(): { deviceId: number; commandId: number } | null {
    return this._target;
  }
  set target(value: { deviceId: number; commandId: number } | null) {
    if (value === this._target) return;
    this._target = value;
    this.host.requestUpdate();
  }
  private _decodedDrafts: Record<string, string> = {};
  get decodedDrafts(): Record<string, string> {
    return this._decodedDrafts;
  }
  set decodedDrafts(value: Record<string, string>) {
    if (value === this._decodedDrafts) return;
    this._decodedDrafts = value;
    this.host.requestUpdate();
  }
  private _decodedSnapshot: BackupCommandDecodedBlock | null = null;
  get decodedSnapshot(): BackupCommandDecodedBlock | null {
    return this._decodedSnapshot;
  }
  set decodedSnapshot(value: BackupCommandDecodedBlock | null) {
    if (value === this._decodedSnapshot) return;
    this._decodedSnapshot = value;
    this.host.requestUpdate();
  }
  rawSnapshot = "";
  private _rawDraft = "";
  get rawDraft(): string {
    return this._rawDraft;
  }
  set rawDraft(value: string) {
    if (value === this._rawDraft) return;
    this._rawDraft = value;
    this.host.requestUpdate();
  }
  // ── IR hex format tabs (IR8) ───────────────────────────────────────
  // For IR devices the raw-payload textarea carries two projections of
  // one canonical signal: the Sofabaton blob (always the byte source of
  // truth for Test/Save via _payloadDialogRawDraft) and its pronto hex
  // rendering. Pronto is the default view; it is unavailable when the
  // stored bytes do not parse as raw timings (descriptive payloads,
  // unknown variants) and the sofabaton tab then acts as passthrough.
  private _hexTab: "pronto" | "sofabaton" = "pronto";
  get hexTab(): "pronto" | "sofabaton" {
    return this._hexTab;
  }
  set hexTab(value: "pronto" | "sofabaton") {
    if (value === this._hexTab) return;
    this._hexTab = value;
    this.host.requestUpdate();
  }
  private _prontoDraft = "";
  get prontoDraft(): string {
    return this._prontoDraft;
  }
  set prontoDraft(value: string) {
    if (value === this._prontoDraft) return;
    this._prontoDraft = value;
    this.host.requestUpdate();
  }
  private _prontoAvailable = true;
  get prontoAvailable(): boolean {
    return this._prontoAvailable;
  }
  set prontoAvailable(value: boolean) {
    if (value === this._prontoAvailable) return;
    this._prontoAvailable = value;
    this.host.requestUpdate();
  }
  private _formatError = "";
  get formatError(): string {
    return this._formatError;
  }
  set formatError(value: string) {
    if (value === this._formatError) return;
    this._formatError = value;
    this.host.requestUpdate();
  }
  private _error = "";
  get error(): string {
    return this._error;
  }
  set error(value: string) {
    if (value === this._error) return;
    this._error = value;
    this.host.requestUpdate();
  }
  // ── Foreign IR codes (Unfolded Circle HEX) ─────────────────────────
  // Detection is local (the shape is exact); rendering needs protocol
  // knowledge and runs on the backend through the host callback. While a
  // conversion is in flight the sofabaton bytes are stale, so Test/Save
  // wait for it; a newer paste supersedes an older one via the sequence.
  private _converting = false;
  get converting(): boolean {
    return this._converting;
  }
  set converting(value: boolean) {
    if (value === this._converting) return;
    this._converting = value;
    this.host.requestUpdate();
  }
  conversionSeq = 0;
  private _fetchingCommandId: number | null = null;
  get fetchingCommandId(): number | null {
    return this._fetchingCommandId;
  }
  set fetchingCommandId(value: number | null) {
    if (value === this._fetchingCommandId) return;
    this._fetchingCommandId = value;
    this.host.requestUpdate();
  }
  private _fetchError = "";
  get fetchError(): string {
    return this._fetchError;
  }
  set fetchError(value: string) {
    if (value === this._fetchError) return;
    this._fetchError = value;
    this.host.requestUpdate();
  }
  liveFetched: FetchedCommandPayload | null = null;
  private _testStatus: "idle" | "testing" | "success" | "error" = "idle";
  get testStatus(): "idle" | "testing" | "success" | "error" {
    return this._testStatus;
  }
  set testStatus(value: "idle" | "testing" | "success" | "error") {
    if (value === this._testStatus) return;
    this._testStatus = value;
    this.host.requestUpdate();
  }
  private _testError = "";
  get testError(): string {
    return this._testError;
  }
  set testError(value: string) {
    if (value === this._testError) return;
    this._testError = value;
    this.host.requestUpdate();
  }
  // ── Add-command mode of the payload dialog (live mode only) ────────
  // Same payload controls as command edit, plus a Name field. Decodable
  // wifi classes seed their form (and the opaque record trailer) from an
  // existing command fetched as a template; IR synthesizes from the
  // descriptor alone on the backend, so it needs no template.
  private _addMode = false;
  get addMode(): boolean {
    return this._addMode;
  }
  set addMode(value: boolean) {
    if (value === this._addMode) return;
    this._addMode = value;
    this.host.requestUpdate();
  }
  private _nameDraft = "";
  get nameDraft(): string {
    return this._nameDraft;
  }
  set nameDraft(value: string) {
    if (value === this._nameDraft) return;
    this._nameDraft = value;
    this.host.requestUpdate();
  }
  private _addPreparing = false;
  get addPreparing(): boolean {
    return this._addPreparing;
  }
  set addPreparing(value: boolean) {
    if (value === this._addPreparing) return;
    this._addPreparing = value;
    this.host.requestUpdate();
  }

  constructor(private readonly host: PayloadDialogHost) {
    host.addController(this);
  }

  hostConnected(): void {}

  /**
   * The payload popup: structured per-class form when the command has a
   * decoded block, raw hex replacement otherwise. Every command with a
   * captured payload (`restore_data.data_hex`) is editable — classes
   * without a parser just get the raw bytes.
   */
  render() {
    if (!this.open || !this.target) return nothing;
    const decoded = this.decodedSnapshot;
    const deviceClass = String(
      bundleDeviceClass(this.host.bundle, this.target.deviceId) || "",
    ).trim();
    return html`
      <div class="modal-backdrop" @click=${this.close}>
        <div class="dialog medium" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title-group">
              <div class="dialog-title">${this.addMode
                ? TOOLS_CARD_STRINGS.backup.addCommandTitle
                : TOOLS_CARD_STRINGS.backup.editPayloadTitle}</div>
              ${deviceClass
                ? html`<span class="payload-class-badge" title=${TOOLS_CARD_STRINGS.backup.deviceClass}>${deviceClass}</span>`
                : nothing}
            </div>
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} @click=${this.close}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${this.addMode && this.host._learn.view === "off"
              ? html`
                  <label class="decoded-field">
                    <span class="decoded-field-label">${TOOLS_CARD_STRINGS.backup.name}</span>
                    <input
                      class="decoded-field-input"
                      type="text"
                      maxlength="20"
                      spellcheck="false"
                      .value=${this.nameDraft}
                      @input=${this.handleNameInput}
                      @change=${this.handleNameInput}
                    />
                    <span class="decoded-field-helper">${TOOLS_CARD_STRINGS.backup.nameHelper}</span>
                  </label>
                `
              : nothing}
            ${this.host._learn.view !== "off"
              ? this.host._learn.renderPanel()
              : decoded
                ? this.renderDecodedForm(decoded.className)
                : this.liveDeviceIsIr()
                  ? this.renderIrHexForm()
                  : this.renderRawForm()}
            ${this.host._learn.view === "off" && this.host._learn.sourceNote
              ? html`
                  <div class="section-status payload-test-status success" role="status" aria-live="polite">
                    <ha-icon icon="mdi:check-circle-outline"></ha-icon>
                    <span>${this.host._learn.sourceNote}</span>
                  </div>
                `
              : nothing}
            ${this.host._learn.view === "off" && this.liveDeviceIsIr()
              ? html`
                  <div class="payload-test-note">
                    <ha-icon icon="mdi:flash-outline"></ha-icon>
                    <span>
                      ${this.host.mode === "live"
                        ? TOOLS_CARD_STRINGS.backup.verifyPayloadLive
                        : TOOLS_CARD_STRINGS.backup.verifyPayloadBackup}
                    </span>
                  </div>
                `
              : nothing}
            ${this.host._learn.view === "off" && this.testStatus !== "idle"
              ? html`
                  <div class="section-status payload-test-status ${this.testStatus}" role="status" aria-live="polite">
                    <ha-icon icon=${this.testStatus === "success"
                      ? "mdi:check-circle-outline"
                      : this.testStatus === "error"
                        ? "mdi:alert-circle-outline"
                        : "mdi:progress-clock"}></ha-icon>
                    <span>
                      ${this.testStatus === "testing"
                        ? TOOLS_CARD_STRINGS.backup.sendingToHub
                        : this.testStatus === "success"
                          ? TOOLS_CARD_STRINGS.backup.sentToHub
                          : this.testError || TOOLS_CARD_STRINGS.backup.testFailed}
                    </span>
                  </div>
                `
              : nothing}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note payload-dialog-note">
              <a
                class="payload-doc-link"
                href=${DOC_URLS.commandPayloads}
                target="_blank"
                rel="noreferrer noopener"
              >${TOOLS_CARD_STRINGS.backup.payloadDocsLink}</a>
              ${this.host._learn.view === "off" && this.error
                ? html`<span class="payload-dialog-error">${this.error}</span>`
                : nothing}
            </div>
            <div class="dialog-footer-actions">
              ${this.host._learn.view !== "off"
                ? this.host._learn.renderFooterActions()
                : nothing}
              ${this.host._learn.view === "off" && this.host.mode === "live" && this.liveDeviceIsIr() && this.host.testCommandPayload
                ? html`
                    <button
                      class="dialog-btn payload-test-btn"
                      ?disabled=${this.testStatus === "testing"}
                      @click=${() => void this.runLiveTest()}
                    >
                      <ha-icon icon="mdi:flash-outline"></ha-icon>
                      <span>${TOOLS_CARD_STRINGS.backup.test}</span>
                    </button>
                  `
                : nothing}
              ${this.host._learn.view === "off"
                ? html`
                    <button class="dialog-btn" @click=${this.close}>${TOOLS_CARD_STRINGS.common.cancel}</button>
                    <button class="dialog-btn dialog-btn-primary" @click=${this.apply}>${TOOLS_CARD_STRINGS.common.save}</button>
                  `
                : nothing}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderRawForm() {
    return html`
      <div class="decoded-form">
        <div class="decoded-form-head">
          <div class="decoded-form-title">${TOOLS_CARD_STRINGS.backup.rawPayload}</div>
          <div class="decoded-form-sub">
            ${TOOLS_CARD_STRINGS.backup.rawPayloadDescription}
          </div>
        </div>
        <label class="decoded-field">
          <span class="decoded-field-label">${TOOLS_CARD_STRINGS.backup.payloadHex}</span>
          <textarea
            class="decoded-field-input decoded-field-input--multiline"
            rows="6"
            spellcheck="false"
            .value=${this.rawDraft}
            @input=${this.handleRawInput}
            @change=${this.handleRawInput}
          ></textarea>
          <span class="decoded-field-helper">
            ${TOOLS_CARD_STRINGS.backup.payloadHexHelper}
          </span>
        </label>
      </div>
    `;
  }

  /**
   * IR payload entry with format tabs (IR8): PRONTO HEX (default) and
   * SOFABATON HEX are two views of the same signal. Sofabaton bytes in
   * `rawDraft` stay the source of truth for Test/Save;
   * pronto edits write through via conversion. Pasting a descriptive
   * `P:` payload morphs the dialog into descriptor mode (X2 only).
   */
  renderIrHexForm() {
    const S = TOOLS_CARD_STRINGS.backup;
    const tab = this.prontoAvailable ? this.hexTab : "sofabaton";
    const prontoActive = tab === "pronto";
    return html`
      <div class="decoded-form">
        <div class="payload-format-tabs" role="tablist">
          <button
            class="payload-format-tab ${prontoActive ? "active" : ""}"
            role="tab"
            aria-selected=${prontoActive ? "true" : "false"}
            ?disabled=${!this.prontoAvailable}
            title=${this.prontoAvailable ? "" : S.prontoUnavailable}
            @click=${() => this.selectHexTab("pronto")}
          >${S.prontoHexTab}</button>
          <button
            class="payload-format-tab ${prontoActive ? "" : "active"}"
            role="tab"
            aria-selected=${prontoActive ? "false" : "true"}
            @click=${() => this.selectHexTab("sofabaton")}
          >${S.sofabatonHexTab}</button>
          ${this.host._learn.renderEntryButton()}
        </div>
        <label class="decoded-field">
          <textarea
            class="decoded-field-input decoded-field-input--multiline"
            rows="6"
            spellcheck="false"
            .value=${prontoActive ? this.prontoDraft : this.rawDraft}
            @input=${prontoActive ? this.handleProntoInput : this.handleRawInput}
            @change=${prontoActive ? this.handleProntoInput : this.handleRawInput}
          ></textarea>
          <span class="decoded-field-helper ${this.formatError ? "payload-format-error" : ""}">
            ${this.formatError
              || (this.converting ? S.ucHexConverting : "")
              || (prontoActive ? S.prontoHexHelper : S.payloadHexHelper)}
          </span>
        </label>
      </div>
    `;
  }

  selectHexTab(tab: "pronto" | "sofabaton") {
    if (tab === "pronto" && !this.prontoAvailable) return;
    this.hexTab = tab;
    this.formatError = "";
  }

  /** Map an IrFormatError to a user string; anything else falls through. */
  irFormatMessage(error: unknown, fallback: string): string {
    if (error instanceof IrFormatError) return `${fallback} (${error.code})`;
    return fallback;
  }

  /**
   * Re-derive the pronto projection after the sofabaton draft changed.
   * Unparseable bytes are legal (passthrough for unknown variants); they
   * only disable the pronto tab.
   */
  syncProntoFromRaw() {
    try {
      const signal = parseSofabatonBlob(this.rawDraft);
      this.prontoDraft = renderProntoHex(signal);
      this.prontoAvailable = true;
    } catch {
      this.prontoDraft = "";
      this.prontoAvailable = false;
    }
  }

  /** Morph the open dialog to descriptor mode from pasted `P:` text. */
  morphToDescriptor(text: string) {
    this.decodedSnapshot = {
      className: "ir",
      fields: { descriptor: "" },
      trailerHex: "",
      edited: false,
    };
    this.decodedDrafts = { descriptor: text.trim() };
    this.formatError = "";
  }

  /** Morph the open dialog from descriptor mode to the hex tabs. */
  morphToHex(text: string, format: "pronto" | "sofabaton") {
    this.decodedSnapshot = null;
    this.decodedDrafts = {};
    this.formatError = "";
    if (format === "pronto") {
      this.hexTab = "pronto";
      this.prontoDraft = text.trim();
      this.applyProntoDraft(text.trim());
    } else {
      this.hexTab = "sofabaton";
      this.rawDraft = text.trim();
      this.syncProntoFromRaw();
    }
  }

  /**
   * Unfolded Circle paste (IR10): a bare `<protocol>;<0xvalue>;<bits>;<repeat>`
   * HEX code or a whole codeset CSV row. PRONTO rows unwrap locally; HEX
   * codes go to the backend, which renders them through infrared-protocols
   * and returns both hex projections. Returns false when the text is not a
   * UC paste so the caller continues with its own handling.
   */
  tryForeignPaste(text: string): boolean {
    const paste = resolveUcPaste(text);
    if (!paste) return false;
    if (paste.name && this.addMode && !this.nameDraft.trim()) {
      this.nameDraft = sanitizeBundleName(this.host.bundle, paste.name);
    }
    if (paste.kind === "pronto") {
      this.morphToHex(paste.code, "pronto");
      return true;
    }
    void this.convertForeignCode(paste.code, "uc_hex");
    return true;
  }

  async convertForeignCode(code: string, format: IrPayloadForeignFormat) {
    // Show the pasted code on the pronto tab while the backend works; the
    // stale sofabaton bytes underneath are fenced off by `_converting`.
    this.decodedSnapshot = null;
    this.decodedDrafts = {};
    this.hexTab = "pronto";
    this.prontoAvailable = true;
    this.prontoDraft = code;
    this.formatError = "";
    const seq = ++this.conversionSeq;
    if (!this.host.convertForeignPayload) {
      this.formatError = TOOLS_CARD_STRINGS.backup.ucHexNoHost;
      return;
    }
    this.converting = true;
    try {
      const result = await this.host.convertForeignPayload(code, format);
      if (seq !== this.conversionSeq) return;
      // The backend's sofabaton bytes are the truth (they are what the
      // emitter would send); the pronto view is re-derived from them.
      this.morphToHex(formatHexForDisplay(result.sofabaton_hex), "sofabaton");
      this.hexTab = "pronto";
    } catch (error) {
      if (seq !== this.conversionSeq) return;
      this.formatError = localizeBackendError(error, "ir_convert");
    } finally {
      if (seq === this.conversionSeq) this.converting = false;
    }
  }

  /** Parse a pronto draft and write the sofabaton bytes through. */
  applyProntoDraft(text: string) {
    if (!text.trim()) {
      this.formatError = "";
      return;
    }
    try {
      const signal = parseProntoHex(text);
      this.rawDraft = formatHexForDisplay(buildSofabatonBlob(signal));
      this.prontoAvailable = true;
      this.formatError = "";
    } catch (error) {
      this.formatError = this.irFormatMessage(
        error,
        TOOLS_CARD_STRINGS.backup.invalidProntoHex,
      );
    }
  }

  handleProntoInput = (event: Event) => {
    const input = event.currentTarget as HTMLTextAreaElement;
    const text = input.value;
    this.error = "";
    if (this.tryForeignPaste(text)) return;
    // Any further typing supersedes an in-flight conversion.
    this.conversionSeq += 1;
    this.converting = false;
    const detected = detectIrPayloadFormat(text);
    if (detected === "descriptor") {
      if (bundleIsX2(this.host.bundle)) {
        this.morphToDescriptor(text);
        return;
      }
      this.prontoDraft = text;
      this.formatError = TOOLS_CARD_STRINGS.backup.descriptorX2Only;
      return;
    }
    if (detected === "sofabaton") {
      // Only steal the paste when it is a complete, parseable blob -
      // partial pronto typing also looks hex-ish and must stay put.
      try {
        parseSofabatonBlob(text);
        this.morphToHex(text, "sofabaton");
        return;
      } catch {
        // fall through: treat as in-progress pronto input
      }
    }
    this.prontoDraft = text;
    this.applyProntoDraft(text);
  };

  handleNameInput = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const value = sanitizeBundleName(this.host.bundle, input.value);
    input.value = value;
    this.nameDraft = value;
    this.error = "";
  };

  handleRawInput = (event: Event) => {
    const input = event.currentTarget as HTMLTextAreaElement;
    const text = input.value;
    this.error = "";
    if (this.liveDeviceIsIr()) {
      if (this.tryForeignPaste(text)) return;
      this.conversionSeq += 1;
      this.converting = false;
      const detected = detectIrPayloadFormat(text);
      if (detected === "pronto") {
        this.morphToHex(text, "pronto");
        return;
      }
      if (detected === "descriptor") {
        if (bundleIsX2(this.host.bundle)) {
          this.morphToDescriptor(text);
          return;
        }
        this.rawDraft = text;
        this.formatError = TOOLS_CARD_STRINGS.backup.descriptorX2Only;
        return;
      }
      this.rawDraft = text;
      this.formatError = "";
      this.syncProntoFromRaw();
      return;
    }
    this.rawDraft = text;
  };

  renderDecodedForm(className: DecodableCommandClass) {
    const spec = DECODED_CLASS_FORM_SPECS[className];
    if (!spec) return nothing;
    // IR descriptor mode shows a single DESCRIPTOR tab in place of the
    // form title, mirroring the hex-mode tab row (IR8); pasting hex into
    // the field switches back to the hex tabs.
    const head = className === "ir"
      ? html`
          <div class="payload-format-tabs" role="tablist">
            <button class="payload-format-tab active" role="tab" aria-selected="true">
              ${TOOLS_CARD_STRINGS.backup.descriptorTab}
            </button>
            ${this.host._learn.renderEntryButton()}
          </div>
          ${spec.subtitle ? html`<div class="decoded-form-sub">${spec.subtitle}</div>` : nothing}
        `
      : html`
          <div class="decoded-form-head">
            <div class="decoded-form-title">${spec.title}</div>
            ${spec.subtitle ? html`<div class="decoded-form-sub">${spec.subtitle}</div>` : nothing}
          </div>
        `;
    return html`
      <div class="decoded-form">
        ${head}
        ${spec.fields.map((field) => this.renderDecodedField(field))}
      </div>
    `;
  }

  renderDecodedField(field: DecodedFieldSpec) {
    const value = this.decodedDrafts[field.key] ?? "";
    const onInput = (event: Event) => this.handleDecodedFieldInput(event, field.key);
    const multilineClass = field.escapedDisplay
      ? "decoded-field-input--multiline decoded-field-input--escaped"
      : "decoded-field-input--multiline";
    return html`
      <label class="decoded-field">
        <span class="decoded-field-label">${field.label}</span>
        ${field.multiline
          ? html`
              <textarea
                class="decoded-field-input ${multilineClass}"
                rows="4"
                spellcheck="false"
                .value=${value}
                @input=${onInput}
                @change=${onInput}
              ></textarea>
            `
          : html`
              <input
                class="decoded-field-input"
                type=${field.numeric ? "number" : "text"}
                spellcheck="false"
                .value=${value}
                ?disabled=${Boolean(field.readonly)}
                @input=${field.readonly ? null : onInput}
                @change=${field.readonly ? null : onInput}
              />
            `}
        ${field.helper ? html`<span class="decoded-field-helper">${field.helper}</span>` : nothing}
      </label>
    `;
  }

  /**
   * Diff each spec field against the open-dialog snapshot. Returns a
   * record of fields that changed (mapped back through the wire-format
   * coercion in `_draftToFieldValue`), or `null` when nothing changed
   * and the bundle should be left untouched.
   */
  collectChangedDecodedFields(
    snapshot: BackupCommandDecodedBlock,
  ): Record<string, unknown> | null {
    const spec = DECODED_CLASS_FORM_SPECS[snapshot.className];
    if (!spec) return null;
    const changed: Record<string, unknown> = {};
    let touched = false;
    for (const field of spec.fields) {
      const draft = this.decodedDrafts[field.key] ?? "";
      const original = fieldValueToDraft(snapshot.fields[field.key], field);
      if (draft === original) continue;
      changed[field.key] = draftToFieldValue(draft, field);
      touched = true;
    }
    return touched ? changed : null;
  }

  handleDecodedFieldInput = (event: Event, fieldKey: string) => {
    const input = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    // IR descriptor field: pasting hex flips the dialog to the hex tabs
    // (IR8 format auto-recognition). Complete blobs only, so typing a
    // descriptor with digits never gets hijacked.
    if (
      fieldKey === "descriptor" &&
      this.decodedSnapshot?.className === "ir"
    ) {
      if (this.tryForeignPaste(input.value)) return;
      const detected = detectIrPayloadFormat(input.value);
      if (detected === "pronto") {
        this.morphToHex(input.value, "pronto");
        return;
      }
      if (detected === "sofabaton") {
        try {
          parseSofabatonBlob(input.value);
          this.morphToHex(input.value, "sofabaton");
          return;
        } catch {
          // not a complete blob: keep treating it as descriptor text
        }
      }
    }
    this.decodedDrafts = {
      ...this.decodedDrafts,
      [fieldKey]: input.value,
    };
  };

  /**
   * True for IR devices. Live payload *editing* is offered for all classes
   * (raw hex, or the structured form where a parser exists), but the Test
   * button — `playIrBlob` — is IR-only, so it gates on this.
   */
  liveDeviceIsIr(): boolean {
    if (this.host.entityId == null || !this.host.bundle) return false;
    return String(bundleDeviceClass(this.host.bundle, Number(this.host.entityId)) || "")
      .trim()
      .toLowerCase() === "ir";
  }

  /**
   * Live "edit payload": fetch this one command's blob from the hub on
   * demand (the structural bundle is blob-free), then open the same payload
   * dialog backup uses — populated from the fetch, not the bundle, so the
   * fetch itself never marks the bundle dirty. The host supplies the fetch.
   */
  async liveFetchAndOpen(commandId: number) {
    if (this.host.mode !== "live" || this.host.entityId == null || !this.host.fetchCommandPayload) return;
    if (this.fetchingCommandId != null) return;
    const deviceId = Number(this.host.entityId);
    const normalizedCommandId = Number(commandId);
    this.fetchingCommandId = normalizedCommandId;
    this.fetchError = "";
    try {
      const fetched = await this.host.fetchCommandPayload(deviceId, normalizedCommandId);
      if (!fetched || !String(fetched.dataHex || "").trim()) {
        this.fetchError = TOOLS_CARD_STRINGS.backup.noPayloadReturned;
        return;
      }
      this.openLive(deviceId, normalizedCommandId, fetched);
    } catch (error) {
      this.fetchError = editorErrorMessage(error, "hub_request");
    } finally {
      this.fetchingCommandId = null;
    }
  }

  openLive(deviceId: number, commandId: number, fetched: FetchedCommandPayload) {
    const decoded = decodedSnapshotFromFetch(fetched.decoded);
    const rawHex = decoded ? "" : (normalizeCommandPayloadHex(fetched.dataHex) ?? fetched.dataHex);
    this.target = { deviceId, commandId };
    this.liveFetched = fetched;
    this.decodedSnapshot = decoded;
    this.decodedDrafts = decoded ? this.initialDecodedDrafts(decoded) : {};
    this.rawSnapshot = rawHex;
    this.rawDraft = rawHex;
    this.error = "";
    this.testStatus = "idle";
    this.testError = "";
    this.resetIrHexTabState();
    this.open = true;
  }

  /**
   * Seed the IR hex-tab state after the raw draft was (re)set: pronto is
   * the default view when the blob parses as raw timings (IR8).
   */
  resetIrHexTabState() {
    this.formatError = "";
    this.hexTab = "pronto";
    this.prontoDraft = "";
    this.prontoAvailable = true;
    if (!this.liveDeviceIsIr()) return;
    if (String(this.rawDraft ?? "").trim()) {
      this.syncProntoFromRaw();
      if (!this.prontoAvailable) this.hexTab = "sofabaton";
    }
  }

  /**
   * Open the payload dialog in add-command mode (live only). The controls
   * mirror command edit for the device's class:
   *
   * * `ir` — blank descriptor form. The backend synthesizes the record
   *   from the descriptor alone (`build_descriptive_ir_blob_body`), so no
   *   template is needed and Test works before anything is saved.
   * * decodable wifi classes — the structured form, seeded from an
   *   existing command fetched as a template. The template supplies the
   *   record's opaque trailer (a checksum region we cannot synthesize)
   *   plus sensible defaults like host/port.
   * * everything else — raw hex entry.
   *
   * Non-IR devices need at least one existing command: the template
   * trailer and the codec (`library_type`) are both read from it.
   */
  async openAdd() {
    if (this.host.mode !== "live" || this.host.entityId == null || !this.host.bundle) return;
    if (this.addPreparing) return;
    const deviceId = Number(this.host.entityId);
    const deviceClass = String(bundleDeviceClass(this.host.bundle, deviceId) || "").trim().toLowerCase();
    this.fetchError = "";

    if (deviceClass === "ir") {
      // Descriptive synthesis is X2-only (IR8 decision 5); other hubs
      // open straight in the hex tabs, pronto view, empty.
      this.openAddWithSnapshot(
        deviceId,
        bundleIsX2(this.host.bundle)
          ? { className: "ir", fields: { descriptor: "" }, trailerHex: "", edited: false }
          : null,
      );
      return;
    }

    const existing = deviceCommandItems(this.host.bundle, deviceId);
    if (!existing.length) {
      // A device created empty (Hub tab "Add device") has no template
      // command to clone a decoded snapshot from: open the class's form
      // with neutral defaults, or raw hex for classes without a form.
      this.openAddWithSnapshot(
        deviceId,
        defaultDecodedSnapshotForClass(deviceClass, {
          deviceId,
          commandId: nextFreeDeviceCommandId(this.host.bundle, deviceId),
        }),
      );
      return;
    }

    if (deviceClass in DECODED_CLASS_FORM_SPECS && this.host.fetchCommandPayload) {
      this.addPreparing = true;
      try {
        const fetched = await this.host.fetchCommandPayload(deviceId, existing[0].commandId);
        const decoded = decodedSnapshotFromFetch(fetched?.decoded ?? null);
        if (decoded) {
          this.openAddWithSnapshot(deviceId, decoded);
          return;
        }
      } catch (error) {
        this.fetchError = editorErrorMessage(error, "hub_request");
        return;
      } finally {
        this.addPreparing = false;
      }
    }

    // Non-decodable class (BT / RF / learned-IR style records) or the
    // template did not decode: raw hex entry.
    this.openAddWithSnapshot(deviceId, null);
  }

  openAddWithSnapshot(deviceId: number, decoded: BackupCommandDecodedBlock | null) {
    this.target = { deviceId, commandId: 0 };
    this.addMode = true;
    this.nameDraft = "";
    this.liveFetched = null;
    this.decodedSnapshot = decoded;
    this.decodedDrafts = decoded ? this.initialDecodedDrafts(decoded) : {};
    this.rawSnapshot = "";
    this.rawDraft = "";
    this.error = "";
    this.testStatus = "idle";
    this.testError = "";
    this.resetIrHexTabState();
    this.open = true;
  }

  /**
   * Commit a new command from the add dialog: allocate the next free id on
   * the device and append a row whose `restore_data` carries the
   * `new: true` marker the device-sync planner turns into a `command_add`
   * step. Decoded forms serialize every field (there is no pristine
   * baseline to diff against); raw entry normalizes the hex.
   */
  applyAdd(target: { deviceId: number; commandId: number }) {
    if (!this.host.bundle) return;
    const name = sanitizeBundleName(this.host.bundle, this.nameDraft).trim();
    if (!name) {
      this.error = TOOLS_CARD_STRINGS.backup.newCommandNameRequired;
      return;
    }
    let restoreData: Record<string, unknown>;
    const snapshot = this.decodedSnapshot;
    if (snapshot) {
      const spec = DECODED_CLASS_FORM_SPECS[snapshot.className];
      const fields: Record<string, unknown> = {};
      for (const field of spec.fields) {
        fields[field.key] = draftToFieldValue(this.decodedDrafts[field.key] ?? "", field);
      }
      if (snapshot.className === "wifi_mqtt") {
        // Read-only ids: keep them equal to this device and the id the
        // commit is about to allocate (the hub ignores both bytes anyway).
        fields["device_id"] = target.deviceId & 0xff;
        fields["command_id"] = (nextFreeDeviceCommandId(this.host.bundle, target.deviceId) ?? (Number(fields["command_id"]) || 1)) & 0xff;
      }
      if (snapshot.className === "ir") {
        const descriptor = String(fields["descriptor"] ?? "").trim();
        if (!descriptor.startsWith("P:")) {
          this.error = TOOLS_CARD_STRINGS.backup.descriptiveIrRequired;
          return;
        }
      }
      restoreData = {
        transport: "hub_code_record",
        decoded: {
          class: snapshot.className,
          trailer_hex: snapshot.trailerHex,
          fields,
          edited: true,
        },
      };
    } else {
      const normalized = normalizeCommandPayloadHex(this.rawDraft);
      if (!normalized) {
        this.error = TOOLS_CARD_STRINGS.backup.payloadHexRequired;
        return;
      }
      restoreData = { transport: "hub_code_record", data_hex: normalized };
    }
    const newId = nextFreeDeviceCommandId(this.host.bundle, target.deviceId);
    if (newId == null) {
      this.error = TOOLS_CARD_STRINGS.backup.noFreeCommandSlot;
      return;
    }
    this.host._commitEditBundleEdit(
      addBundleDeviceCommand(this.host.bundle, target.deviceId, newId, name, restoreData),
    );
    this.close();
  }

  /**
   * Commit a live payload edit. The working command has no restore_data yet
   * (blob-free bundle), so build the whole block — carrying the `edited`
   * marker the device-sync planner keys on — and set it via
   * `setCommandRestoreData`. A pristine (unchanged) dialog commits nothing.
   */
  applyLive(target: { deviceId: number; commandId: number }) {
    if (!this.host.bundle) return;
    const snapshot = this.decodedSnapshot;
    if (snapshot) {
      const changedFields = this.collectChangedDecodedFields(snapshot);
      if (!changedFields) {
        this.close();
        return;
      }
      const restoreData = {
        transport: "hub_code_record",
        data_hex: this.liveFetched?.dataHex ?? "",
        decoded: {
          class: snapshot.className,
          trailer_hex: snapshot.trailerHex,
          fields: { ...snapshot.fields, ...changedFields },
          edited: true,
        },
      };
      this.host._commitEditBundleEdit(setCommandRestoreData(this.host.bundle, target.deviceId, target.commandId, restoreData));
      this.close();
      return;
    }
    const normalized = normalizeCommandPayloadHex(this.rawDraft);
    if (!normalized) {
      this.error = TOOLS_CARD_STRINGS.backup.payloadHexRequired;
      return;
    }
    if (normalized === normalizeCommandPayloadHex(this.rawSnapshot)) {
      this.close();
      return;
    }
    const restoreData = { transport: "hub_code_record", data_hex: normalized, edited: true };
    this.host._commitEditBundleEdit(setCommandRestoreData(this.host.bundle, target.deviceId, target.commandId, restoreData));
    this.close();
  }

  /** Test the current draft on the hub (IR only), via the host's callback. */
  async runLiveTest() {
    if (!this.host.testCommandPayload) return;
    if (this.formatError) {
      // The active hex tab holds unparseable text; the sofabaton bytes
      // behind Test/Save would be stale.
      this.testStatus = "error";
      this.testError = this.formatError;
      return;
    }
    if (this.converting) {
      this.testStatus = "error";
      this.testError = TOOLS_CARD_STRINGS.backup.ucHexConverting;
      return;
    }
    const value = this.decodedSnapshot
      ? String(this.decodedDrafts["descriptor"] ?? "").trim()
      : String(this.rawDraft ?? "").trim();
    if (!value) {
      this.testStatus = "error";
      this.testError = TOOLS_CARD_STRINGS.backup.nothingToTest;
      return;
    }
    this.testStatus = "testing";
    this.testError = "";
    try {
      await this.host.testCommandPayload(value);
      this.testStatus = "success";
    } catch (error) {
      this.testStatus = "error";
      this.testError = editorErrorMessage(error, "hub_request");
    }
  }

  openFromBundle(commandId: number) {
    if (this.host.mode === "live") return;
    if (this.host.entityId == null) return;
    const deviceId = Number(this.host.entityId);
    const normalizedCommandId = Number(commandId);
    // A decoded block gets the structured per-class form; anything else
    // with a captured payload gets the raw hex editor. Commands with no
    // restore_data at all never reach here (the row hides the button).
    const decoded = commandDecodedBlock(this.host.bundle, deviceId, normalizedCommandId);
    const rawHex = decoded
      ? null
      : commandRawPayloadHex(this.host.bundle, deviceId, normalizedCommandId);
    if (!decoded && !rawHex) return;
    this.target = { deviceId, commandId: normalizedCommandId };
    this.decodedSnapshot = decoded;
    this.decodedDrafts = decoded ? this.initialDecodedDrafts(decoded) : {};
    this.rawSnapshot = rawHex ?? "";
    this.rawDraft = rawHex ?? "";
    this.error = "";
    this.resetIrHexTabState();
    this.open = true;
  }

  close = () => {
    this.host._learn.exit();
    this.host._learn.sourceNote = "";
    // A conversion still in flight must not land in the next dialog.
    this.conversionSeq += 1;
    this.converting = false;
    this.open = false;
    this.target = null;
    this.decodedSnapshot = null;
    this.decodedDrafts = {};
    this.rawSnapshot = "";
    this.rawDraft = "";
    this.error = "";
    this.liveFetched = null;
    this.testStatus = "idle";
    this.testError = "";
    this.addMode = false;
    this.nameDraft = "";
    this.hexTab = "pronto";
    this.prontoDraft = "";
    this.prontoAvailable = true;
    this.formatError = "";
  };

  apply = () => {
    const target = this.target;
    if (!target || !this.host.bundle) return;
    if (this.formatError) {
      this.error = this.formatError;
      return;
    }
    if (this.converting) {
      this.error = TOOLS_CARD_STRINGS.backup.ucHexConverting;
      return;
    }
    if (this.addMode) {
      this.applyAdd(target);
      return;
    }
    if (this.host.mode === "live") {
      this.applyLive(target);
      return;
    }
    const snapshot = this.decodedSnapshot;
    if (snapshot) {
      // Structured form: diff against the open-dialog snapshot and only
      // push a bundle update when something changed, so `edited: true`
      // stays off pristine rows (which would otherwise force restore
      // through a re-encode + round-trip verify for no reason).
      const changedFields = this.collectChangedDecodedFields(snapshot);
      if (changedFields) {
        this.host._commitEditBundleEdit(updateCommandDecodedFields(
          this.host.bundle,
          target.deviceId,
          target.commandId,
          changedFields,
        ));
      }
      this.close();
      return;
    }
    const normalized = normalizeCommandPayloadHex(this.rawDraft);
    if (!normalized) {
      this.error = TOOLS_CARD_STRINGS.backup.payloadHexRequired;
      return;
    }
    if (normalized !== normalizeCommandPayloadHex(this.rawSnapshot)) {
      this.host._commitEditBundleEdit(updateCommandRawPayload(
        this.host.bundle,
        target.deviceId,
        target.commandId,
        normalized,
      ));
    }
    this.close();
  };

  initialDecodedDrafts(decoded: BackupCommandDecodedBlock): Record<string, string> {
    const spec = DECODED_CLASS_FORM_SPECS[decoded.className];
    if (!spec) return {};
    const drafts: Record<string, string> = {};
    for (const field of spec.fields) {
      drafts[field.key] = fieldValueToDraft(decoded.fields[field.key], field);
    }
    return drafts;
  }
}
