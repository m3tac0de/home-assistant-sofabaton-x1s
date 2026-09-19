// The command payload dialog (docs/internal/server-panel-device-editor-plan.md,
// decision 6): the HA card's "Add command" / "Edit payload" dialog recreated
// with its bodies, rules and wording. Three bodies: the IR hex tabs (Pronto
// Hex and Sofabaton Hex, kept in sync by the card's converters), the
// structured per-class forms the library can round-trip (the descriptor
// form on the X2, the wifi classes) and the raw hex textarea. Test plays the
// current bytes through `POST /play`; Save hands the editor the
// `restore_data` the card would write. No learn mode (Marcel, 2026-09-18)
// and no Unfolded Circle HEX conversion (plan decision 14): a pasted UC HEX
// code shows a hint instead.

import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { mdiAlertCircleOutline, mdiCheckCircleOutline, mdiClose, mdiFlashOutline, mdiProgressClock } from "@mdi/js";

import {
  IrFormatError,
  buildSofabatonBlob,
  detectIrPayloadFormat,
  formatHexForDisplay,
  isUcHexCode,
  parseProntoHex,
  parseSofabatonBlob,
  renderProntoHex,
  unwrapUcCodesetRow,
} from "../../../custom_components/sofabaton_x1s/www/src/shared/ir-format";
import {
  DECODED_CLASS_FORM_SPECS,
  normalizeCommandPayloadHex,
  type BackupCommandDecodedBlock,
  type DecodedFieldSpec,
} from "../../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";
import { problemText, type PanelApi } from "../panel-api";
import { PANEL_BASE_CSS } from "../panel-styles";
import { sanitizeName } from "./device-editor-state";

export const PAYLOAD_DIALOG_TAG = "sb-payload-dialog";

const DOCS_URL = "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/command_payloads.md";

// -- the card's strings, verbatim -------------------------------------------------------------

const S = {
  addCommandTitle: "Add command",
  editPayloadTitle: "Edit payload",
  deviceClass: "Device class",
  name: "Name",
  nameHelper: "Shown on the remote and in every command picker.",
  prontoHexTab: "Pronto Hex",
  sofabatonHexTab: "Sofabaton Hex",
  descriptorTab: "Descriptor",
  prontoUnavailable: "This payload does not parse as raw IR timings, so it cannot be shown as Pronto Hex.",
  prontoHelper: 'Paste a learned-format Pronto Hex code such as "0000 006D 0022 0000 00AB …". The editor converts it to Sofabaton bytes automatically.',
  payloadHexHelper: 'Byte pairs like "0a 4f 22"; whitespace and 0x prefixes are tolerated.',
  invalidProntoHex: "This is not a valid learned-format Pronto Hex code.",
  descriptorX2Only: "Descriptive IR payloads are supported on X2 hubs only.",
  ucHexUnsupported: "Unfolded Circle HEX codes are not supported here. Paste a Pronto Hex code or the Sofabaton bytes instead.",
  rawPayload: "Raw payload",
  rawPayloadDescription: "No structured editor exists for this device class; the bytes below are replayed to the hub verbatim on restore.",
  payloadHex: "Payload (hex bytes)",
  verifyPayloadLive: "Verify a changed payload before saving: Test plays the current bytes on the hub without saving. Save folds the payload into the device's next Sync.",
  sendingToHub: "Sending to the hub…",
  sentToHub: "Sent to the hub for one-shot playback.",
  testFailed: "Test failed.",
  nothingToTest: "Nothing to test yet.",
  test: "Test",
  cancel: "Cancel",
  save: "Save",
  payloadDocs: "Payload documentation",
  newCommandNameRequired: "Enter a name for the new command.",
  descriptiveIrRequired: "Enter a descriptive IR payload starting with P: (e.g. P:Sony12 R:40000 D:1 F:18).",
  payloadHexRequired: "Enter the payload as hex bytes (an even number of hex digits; spaces are fine).",
};

/** What the dialog hands back on Save: the row's `restore_data` as the card writes it, and the name in add mode. */
export interface PayloadSaveDetail {
  name: string;
  restoreData: Record<string, unknown>;
}

type TestStatus = "idle" | "testing" | "success" | "error";

function icon(path: string, cls = ""): TemplateResult {
  return html`<svg class="mdi ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${path}></path></svg>`;
}

function fieldValueToDraft(spec: DecodedFieldSpec, value: unknown): string {
  if (value === null || value === undefined) return "";
  if (spec.numeric) return String(Number(value) || 0);
  if (spec.escapedDisplay) return String(value).replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  return String(value);
}

function draftToFieldValue(spec: DecodedFieldSpec, draft: string): unknown {
  if (spec.numeric) {
    const n = Number(draft);
    return Number.isFinite(n) ? n : 0;
  }
  if (spec.escapedDisplay) return draft.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  if (spec.crlfOnWire) return draft.replace(/\r\n|\r|\n/g, "\r\n");
  return draft;
}

function irFormatMessage(err: unknown): string {
  return err instanceof IrFormatError ? `${S.invalidProntoHex} (${err.code})` : S.invalidProntoHex;
}

export class SbPayloadDialog extends LitElement {
  static properties = {
    api: { attribute: false },
    hubId: { attribute: false },
    hubVersion: { attribute: false },
    deviceClass: { attribute: false },
    mode: { attribute: false },
    snapshot: { attribute: false },
    rawHex: { attribute: false },
    fetchedHex: { attribute: false },
    _name: { state: true },
    _decoded: { state: true },
    _drafts: { state: true },
    _raw: { state: true },
    _hexTab: { state: true },
    _pronto: { state: true },
    _prontoAvailable: { state: true },
    _formatError: { state: true },
    _error: { state: true },
    _testStatus: { state: true },
    _testError: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: contents; }
      .mdi { width: 16px; height: 16px; flex: 0 0 auto; }
      .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
      .dialog { width: min(640px, calc(100vw - 36px)); max-height: min(82vh, 900px); display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--sbp-line); background: var(--sbp-panel); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28); overflow: hidden; color: var(--sbp-text); }
      .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
      .dialog-header { border-bottom: 1px solid var(--sbp-line); }
      .dialog-title-group { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
      .dialog-title { font-size: 16px; flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sbp-text); }
      .payload-class-badge { flex: 0 0 auto; font-family: var(--sbp-mono); font-size: 11px; font-weight: 700; letter-spacing: 0.02em; padding: 2px 9px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--sbp-accent) 40%, var(--sbp-line)); color: var(--sbp-text); background: rgba(var(--sbp-accent-rgb), 0.12); }
      .dialog-close { flex: 0 0 auto; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--sbp-line); border-radius: 10px; background: var(--sbp-panel); color: var(--sbp-muted); cursor: pointer; padding: 0; }
      .dialog-close:hover { border-color: var(--sbp-accent); color: var(--sbp-text); }
      .dialog-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
      .dialog-footer { border-top: 1px solid var(--sbp-line); justify-content: space-between; flex-wrap: wrap; }
      .dialog-footer-actions { display: flex; gap: 8px; margin-left: auto; }
      .dialog-footer-note { flex: 1 1 140px; min-height: 18px; min-width: 0; font-size: 13px; color: var(--sbp-err); }
      .payload-dialog-note { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; }
      .payload-doc-link { color: var(--sbp-accent); text-decoration: underline; text-decoration-color: var(--sbp-accent); font-weight: 400; font-size: 13px; white-space: nowrap; }
      .payload-doc-link:hover { color: var(--sbp-text); }
      .dialog-btn { border: 1px solid var(--sbp-line); border-radius: 10px; padding: 8px 12px; background: transparent; color: var(--sbp-text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
      .dialog-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
      .dialog-btn-primary { border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.18); }
      .dialog-btn:disabled { opacity: 0.45; cursor: default; }
      .payload-test-btn { display: inline-flex; align-items: center; gap: 6px; margin-right: auto; }
      .decoded-form { display: flex; flex-direction: column; gap: 10px; }
      .decoded-form-head { display: flex; flex-direction: column; gap: 2px; }
      .decoded-form-title { font-size: 13px; font-weight: 600; color: var(--sbp-text); }
      .decoded-form-sub { font-size: 12px; color: var(--sbp-muted); line-height: 1.4; }
      .payload-format-tabs { display: flex; gap: 2px; align-items: flex-end; }
      .payload-format-tab { appearance: none; border: none; background: none; padding: 4px 10px 5px; font: inherit; font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--sbp-muted); border-bottom: 2px solid transparent; border-radius: 4px 4px 0 0; cursor: pointer; }
      .payload-format-tab:hover:not(:disabled):not(.active) { color: var(--sbp-text); background: color-mix(in srgb, var(--sbp-text) 10%, transparent); }
      .payload-format-tab.active { color: var(--sbp-accent); border-bottom-color: var(--sbp-accent); cursor: default; }
      .payload-format-tab:disabled { opacity: 0.45; cursor: not-allowed; }
      .payload-format-error { color: var(--sbp-err); }
      /* The panel's base styles every <label> as a small uppercase caption; the card's field wrapper is a plain block. */
      label.decoded-field, .decoded-field { display: flex; flex-direction: column; gap: 4px; margin: 0; font-size: inherit; letter-spacing: 0; text-transform: none; color: inherit; }
      .decoded-field-label { font-size: 12px; font-weight: 600; color: var(--sbp-muted); text-transform: uppercase; letter-spacing: 0.04em; }
      .decoded-field-input { width: 100%; box-sizing: border-box; font: inherit; font-size: 13px; color: var(--sbp-text); background: var(--sbp-input); border: 1px solid var(--sbp-line); border-radius: 10px; padding: 8px 10px; }
      .decoded-field-input:focus { outline: none; border-color: var(--sbp-accent); }
      .decoded-field-input:disabled { opacity: 0.6; }
      .decoded-field-input--multiline { font-family: var(--sbp-mono); resize: vertical; min-height: 60px; white-space: pre-wrap; overflow-wrap: anywhere; }
      .decoded-field-input--escaped { white-space: pre-wrap; word-break: break-all; overflow-wrap: anywhere; }
      .decoded-field-helper { font-size: 11px; color: var(--sbp-muted); line-height: 1.35; }
      .payload-test-note { display: flex; align-items: flex-start; gap: 8px; margin-top: 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--sbp-warn) 45%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-warn) 10%, transparent); color: var(--sbp-text); font-size: 12.5px; line-height: 1.45; }
      .payload-test-note .mdi { width: 18px; height: 18px; color: var(--sbp-warn); margin-top: 1px; }
      .section-status { display: flex; align-items: center; gap: 8px; margin-top: 10px; padding: 8px 12px; border: 1px solid var(--sbp-line); border-radius: 10px; font-size: 13px; line-height: 1.4; color: var(--sbp-muted); }
      .section-status .mdi { width: 18px; height: 18px; }
      .section-status.error { color: var(--sbp-err); border-color: color-mix(in srgb, var(--sbp-err) 30%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-err) 6%, var(--sbp-panel)); }
      .section-status.success { color: #2e7d32; border-color: color-mix(in srgb, #2e7d32 30%, var(--sbp-line)); background: color-mix(in srgb, #2e7d32 6%, var(--sbp-panel)); }
      @media (max-width: 640px) {
        .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
        .dialog { width: min(100vw, 100%); max-height: calc(100vh - max(env(safe-area-inset-top), 8px)); border-radius: 22px 22px 0 0; }
        .dialog-footer { flex-direction: column; align-items: stretch; }
        .dialog-footer-actions { width: 100%; }
        .dialog-footer-actions .dialog-btn { flex: 1 1 0; }
        /* The footer is a column here, so the note's 140px basis would be a height. */
        .dialog-footer-note { flex: 0 0 auto; min-height: 0; }
        .payload-test-btn { margin-right: 0; }
      }
    `,
  ];

  api!: PanelApi;
  hubId = "";
  hubVersion: string | null = null;
  deviceClass = "";
  mode: "add" | "edit" = "edit";
  /** The pristine structured block (null for the hex or raw body). */
  snapshot: BackupCommandDecodedBlock | null = null;
  /** The pristine Sofabaton / raw hex when there is no structured block. */
  rawHex = "";
  /** The fetched body, kept on a structured live save (the card's `_payloadLiveFetched.dataHex`). */
  fetchedHex = "";

  private _name = "";
  private _decoded: BackupCommandDecodedBlock | null = null;
  private _drafts: Record<string, string> = {};
  private _raw = "";
  private _rawSnapshot = "";
  private _hexTab: "pronto" | "sofabaton" = "pronto";
  private _pronto = "";
  private _prontoAvailable = true;
  private _formatError = "";
  private _error = "";
  private _testStatus: TestStatus = "idle";
  private _testError = "";
  private _seeded = false;

  protected willUpdate(changed: PropertyValues): void {
    if (!this._seeded || changed.has("snapshot") || changed.has("rawHex") || changed.has("mode")) {
      this._seeded = true;
      this._seed();
    }
  }

  private _seed(): void {
    this._name = "";
    this._decoded = this.snapshot ? { ...this.snapshot, fields: { ...this.snapshot.fields } } : null;
    this._drafts = this._decoded ? this._initialDrafts(this._decoded) : {};
    this._rawSnapshot = this.rawHex;
    this._raw = this.rawHex;
    this._error = "";
    this._testStatus = "idle";
    this._testError = "";
    this._resetHexTabs();
  }

  private get _isIr(): boolean {
    return String(this.deviceClass ?? "").trim().toLowerCase() === "ir";
  }

  private get _isX2(): boolean {
    return String(this.hubVersion ?? "").toUpperCase().includes("X2");
  }

  private _initialDrafts(block: BackupCommandDecodedBlock): Record<string, string> {
    const spec = DECODED_CLASS_FORM_SPECS[block.className];
    const drafts: Record<string, string> = {};
    for (const field of spec?.fields ?? []) drafts[field.key] = fieldValueToDraft(field, block.fields[field.key]);
    return drafts;
  }

  // -- IR hex tabs: the two projections stay in sync (the card's converters) ------------------

  private _resetHexTabs(): void {
    this._formatError = "";
    this._hexTab = "pronto";
    this._pronto = "";
    this._prontoAvailable = true;
    if (!this._isIr) return;
    if (this._raw.trim()) {
      this._syncProntoFromRaw();
      if (!this._prontoAvailable) this._hexTab = "sofabaton";
    }
  }

  private _syncProntoFromRaw(): void {
    try {
      this._pronto = renderProntoHex(parseSofabatonBlob(this._raw));
      this._prontoAvailable = true;
    } catch {
      this._pronto = "";
      this._prontoAvailable = false;
    }
  }

  private _applyProntoDraft(text: string): void {
    this._pronto = text;
    if (!text.trim()) {
      this._formatError = "";
      return;
    }
    try {
      this._raw = formatHexForDisplay(buildSofabatonBlob(parseProntoHex(text)));
      this._formatError = "";
    } catch (err) {
      this._formatError = irFormatMessage(err);
    }
  }

  private _morphToHex(text: string, tab: "pronto" | "sofabaton"): void {
    this._decoded = null;
    this._drafts = {};
    this._formatError = "";
    if (tab === "pronto") {
      this._hexTab = "pronto";
      this._prontoAvailable = true;
      this._applyProntoDraft(text);
    } else {
      this._hexTab = "sofabaton";
      this._raw = text;
      this._syncProntoFromRaw();
    }
  }

  private _morphToDescriptor(text: string): void {
    this._decoded = { className: "ir", fields: { descriptor: "" }, trailerHex: "", edited: false };
    this._drafts = { descriptor: text.trim() };
    this._formatError = "";
  }

  /** A pasted Unfolded Circle code: detected as the card does, refused with a hint (no converter on the server). */
  private _ucPaste(text: string): boolean {
    const row = unwrapUcCodesetRow(text);
    const code = row && /^HEX$/i.test(row.format) ? row.code : text;
    if (!isUcHexCode(code)) return false;
    this._formatError = S.ucHexUnsupported;
    return true;
  }

  private _onProntoInput = (event: Event): void => {
    const text = (event.currentTarget as HTMLTextAreaElement).value;
    this._error = "";
    this._pronto = text;
    if (this._ucPaste(text)) return;
    const format = detectIrPayloadFormat(text);
    if (format === "descriptor") {
      if (this._isX2) this._morphToDescriptor(text);
      else this._formatError = S.descriptorX2Only;
      return;
    }
    if (format === "sofabaton") {
      try {
        parseSofabatonBlob(text);
        this._morphToHex(text, "sofabaton");
        return;
      } catch {
        // partial pronto typing can look hex-ish: fall through
      }
    }
    this._applyProntoDraft(text);
  };

  private _onRawInput = (event: Event): void => {
    const text = (event.currentTarget as HTMLTextAreaElement).value;
    this._error = "";
    if (!this._isIr) {
      this._raw = text;
      return;
    }
    if (this._ucPaste(text)) {
      this._raw = text;
      return;
    }
    const format = detectIrPayloadFormat(text);
    if (format === "pronto") {
      this._morphToHex(text, "pronto");
      return;
    }
    if (format === "descriptor") {
      if (this._isX2) this._morphToDescriptor(text);
      else {
        this._raw = text;
        this._formatError = S.descriptorX2Only;
      }
      return;
    }
    this._raw = text;
    this._formatError = "";
    this._syncProntoFromRaw();
  };

  private _onFieldInput(field: DecodedFieldSpec, event: Event): void {
    const value = (event.currentTarget as HTMLInputElement | HTMLTextAreaElement).value;
    this._error = "";
    if (this._decoded?.className === "ir" && field.key === "descriptor") {
      // The descriptor field flips back to hex on a pasted code the hex tabs own.
      if (this._ucPaste(value)) {
        this._drafts = { ...this._drafts, [field.key]: value };
        return;
      }
      const format = detectIrPayloadFormat(value);
      if (format === "pronto") {
        this._morphToHex(value, "pronto");
        return;
      }
      if (format === "sofabaton") {
        try {
          parseSofabatonBlob(value);
          this._morphToHex(value, "sofabaton");
          return;
        } catch {
          // keep as descriptor text
        }
      }
      this._formatError = "";
    }
    this._drafts = { ...this._drafts, [field.key]: value };
  }

  private _selectHexTab(tab: "pronto" | "sofabaton"): void {
    if (tab === "pronto" && !this._prontoAvailable) return;
    this._hexTab = tab;
    this._formatError = "";
  }

  // -- test and save --------------------------------------------------------------------------------

  private async _test(): Promise<void> {
    if (this._formatError) {
      this._testStatus = "error";
      this._testError = this._formatError;
      return;
    }
    const descriptor = this._decoded?.className === "ir" ? String(this._drafts.descriptor ?? "").trim() : "";
    const raw = this._raw.trim();
    const value = descriptor || raw;
    if (!value) {
      this._testStatus = "error";
      this._testError = S.nothingToTest;
      return;
    }
    this._testStatus = "testing";
    this._testError = "";
    try {
      const response = await this.api.playPayload(this.hubId, descriptor ? { descriptor } : { hex: raw });
      if (!response.ok) {
        this._testStatus = "error";
        this._testError = problemText(response);
        return;
      }
      this._testStatus = "success";
    } catch (err) {
      this._testStatus = "error";
      this._testError = err instanceof Error ? err.message : String(err);
    }
  }

  private _changedFields(block: BackupCommandDecodedBlock): Record<string, unknown> | null {
    const spec = DECODED_CLASS_FORM_SPECS[block.className];
    if (!spec) return null;
    const changed: Record<string, unknown> = {};
    let touched = false;
    for (const field of spec.fields) {
      const draft = this._drafts[field.key] ?? "";
      if (draft === fieldValueToDraft(field, block.fields[field.key])) continue;
      changed[field.key] = draftToFieldValue(field, draft);
      touched = true;
    }
    return touched ? changed : null;
  }

  private _close = (): void => {
    this.dispatchEvent(new CustomEvent("sb-payload-close", { bubbles: true, composed: true }));
  };

  private _save = (): void => {
    if (this._formatError) {
      this._error = this._formatError;
      return;
    }
    const detail = this.mode === "add" ? this._addDetail() : this._editDetail();
    if (detail === undefined) return;
    if (detail === null) {
      this._close();
      return;
    }
    this.dispatchEvent(new CustomEvent<PayloadSaveDetail>("sb-payload-save", { bubbles: true, composed: true, detail }));
  };

  /** The card's live edit: a structured or raw `restore_data` with the `edited` marker; null when nothing changed; undefined on an error shown. */
  private _editDetail(): PayloadSaveDetail | null | undefined {
    const block = this._decoded;
    if (block) {
      const changed = this._changedFields(block);
      if (!changed) return null;
      return {
        name: "",
        restoreData: {
          transport: "hub_code_record",
          data_hex: this.fetchedHex,
          decoded: { class: block.className, trailer_hex: block.trailerHex, fields: { ...block.fields, ...changed }, edited: true },
        },
      };
    }
    const normalized = normalizeCommandPayloadHex(this._raw);
    if (!normalized) {
      this._error = S.payloadHexRequired;
      return undefined;
    }
    if (normalized === (normalizeCommandPayloadHex(this._rawSnapshot) ?? "")) return null;
    return { name: "", restoreData: { transport: "hub_code_record", data_hex: normalized, edited: true } };
  }

  /** The card's add: every field serialised (no baseline), or the normalised bytes. */
  private _addDetail(): PayloadSaveDetail | undefined {
    const name = sanitizeName(this.hubVersion, this._name).trim();
    if (!name) {
      this._error = S.newCommandNameRequired;
      return undefined;
    }
    const block = this._decoded;
    if (block) {
      const spec = DECODED_CLASS_FORM_SPECS[block.className];
      const fields: Record<string, unknown> = { ...block.fields };
      for (const field of spec?.fields ?? []) fields[field.key] = draftToFieldValue(field, this._drafts[field.key] ?? "");
      if (block.className === "ir" && !/^P:/i.test(String(fields.descriptor ?? "").trim())) {
        this._error = S.descriptiveIrRequired;
        return undefined;
      }
      return { name, restoreData: { transport: "hub_code_record", decoded: { class: block.className, trailer_hex: block.trailerHex, fields, edited: true } } };
    }
    const normalized = normalizeCommandPayloadHex(this._raw);
    if (!normalized) {
      this._error = S.payloadHexRequired;
      return undefined;
    }
    return { name, restoreData: { transport: "hub_code_record", data_hex: normalized } };
  }

  // -- render ---------------------------------------------------------------------------------------

  render(): TemplateResult {
    const isAdd = this.mode === "add";
    const deviceClass = String(this.deviceClass ?? "").trim();
    const body = this._decoded ? this._renderDecodedForm(this._decoded) : this._isIr ? this._renderIrHexForm() : this._renderRawForm();
    return html`
      <div class="modal-backdrop" @click=${this._close}>
        <div class="dialog" id="payload-dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title-group">
              <div class="dialog-title">${isAdd ? S.addCommandTitle : S.editPayloadTitle}</div>
              ${deviceClass ? html`<span class="payload-class-badge" title=${S.deviceClass}>${deviceClass}</span>` : nothing}
            </div>
            <button class="dialog-close" type="button" aria-label=${S.cancel} @click=${this._close}>${icon(mdiClose)}</button>
          </div>
          <div class="dialog-body">
            ${isAdd
              ? html`<label class="decoded-field">
                  <span class="decoded-field-label">${S.name}</span>
                  <input class="decoded-field-input" id="payload-name" type="text" maxlength="20" .value=${this._name} @input=${(event: Event) => { const input = event.currentTarget as HTMLInputElement; const value = sanitizeName(this.hubVersion, input.value); input.value = value; this._name = value; this._error = ""; }} />
                  <span class="decoded-field-helper">${S.nameHelper}</span>
                </label>`
              : nothing}
            ${body}
            ${this._isIr ? html`<div class="payload-test-note">${icon(mdiFlashOutline)}<span>${S.verifyPayloadLive}</span></div>` : nothing}
            ${this._testStatus === "idle"
              ? nothing
              : html`<div class="section-status payload-test-status ${this._testStatus}" id="payload-test-status" role="status" aria-live="polite">
                  ${icon(this._testStatus === "testing" ? mdiProgressClock : this._testStatus === "success" ? mdiCheckCircleOutline : mdiAlertCircleOutline)}
                  <span>${this._testStatus === "testing" ? S.sendingToHub : this._testStatus === "success" ? S.sentToHub : this._testError || S.testFailed}</span>
                </div>`}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note payload-dialog-note">
              <a class="payload-doc-link" href=${DOCS_URL} target="_blank" rel="noreferrer noopener">${S.payloadDocs}</a>
              ${this._error ? html`<span class="payload-dialog-error" id="payload-error">${this._error}</span>` : nothing}
            </div>
            <div class="dialog-footer-actions">
              ${this._isIr
                ? html`<button class="dialog-btn payload-test-btn" id="payload-test" type="button" ?disabled=${this._testStatus === "testing"} @click=${() => void this._test()}>${icon(mdiFlashOutline)}<span>${S.test}</span></button>`
                : nothing}
              <button class="dialog-btn" type="button" @click=${this._close}>${S.cancel}</button>
              <button class="dialog-btn dialog-btn-primary" id="payload-save" type="button" @click=${this._save}>${S.save}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderIrHexForm(): TemplateResult {
    const active = this._prontoAvailable ? this._hexTab : "sofabaton";
    const helper = this._formatError || (active === "pronto" ? S.prontoHelper : S.payloadHexHelper);
    return html`
      <div class="decoded-form">
        <div class="payload-format-tabs" role="tablist">
          <button class="payload-format-tab ${active === "pronto" ? "active" : ""}" type="button" role="tab" data-tab="pronto" aria-selected=${String(active === "pronto")} ?disabled=${!this._prontoAvailable} title=${this._prontoAvailable ? "" : S.prontoUnavailable} @click=${() => this._selectHexTab("pronto")}>${S.prontoHexTab}</button>
          <button class="payload-format-tab ${active === "sofabaton" ? "active" : ""}" type="button" role="tab" data-tab="sofabaton" aria-selected=${String(active === "sofabaton")} @click=${() => this._selectHexTab("sofabaton")}>${S.sofabatonHexTab}</button>
        </div>
        <label class="decoded-field">
          ${active === "pronto"
            ? html`<textarea class="decoded-field-input decoded-field-input--multiline" id="payload-pronto" rows="6" spellcheck="false" .value=${this._pronto} @input=${this._onProntoInput}></textarea>`
            : html`<textarea class="decoded-field-input decoded-field-input--multiline" id="payload-raw" rows="6" spellcheck="false" .value=${this._raw} @input=${this._onRawInput}></textarea>`}
          <span class="decoded-field-helper ${this._formatError ? "payload-format-error" : ""}" id="payload-helper">${helper}</span>
        </label>
      </div>
    `;
  }

  private _renderRawForm(): TemplateResult {
    return html`
      <div class="decoded-form">
        <div class="decoded-form-head"><div class="decoded-form-title">${S.rawPayload}</div><div class="decoded-form-sub">${S.rawPayloadDescription}</div></div>
        <label class="decoded-field">
          <span class="decoded-field-label">${S.payloadHex}</span>
          <textarea class="decoded-field-input decoded-field-input--multiline" id="payload-raw" rows="6" spellcheck="false" .value=${this._raw} @input=${this._onRawInput}></textarea>
          <span class="decoded-field-helper" id="payload-helper">${S.payloadHexHelper}</span>
        </label>
      </div>
    `;
  }

  private _renderDecodedForm(block: BackupCommandDecodedBlock): TemplateResult {
    const spec = DECODED_CLASS_FORM_SPECS[block.className];
    const head = block.className === "ir"
      ? html`<div class="payload-format-tabs" role="tablist"><button class="payload-format-tab active" type="button" role="tab" aria-selected="true">${S.descriptorTab}</button></div>
          ${spec?.subtitle ? html`<div class="decoded-form-sub">${spec.subtitle}</div>` : nothing}`
      : html`<div class="decoded-form-head"><div class="decoded-form-title">${spec?.title ?? block.className}</div>${spec?.subtitle ? html`<div class="decoded-form-sub">${spec.subtitle}</div>` : nothing}</div>`;
    return html`
      <div class="decoded-form" data-class=${block.className}>
        ${head}
        ${(spec?.fields ?? []).map((field) => this._renderField(field))}
      </div>
    `;
  }

  private _renderField(field: DecodedFieldSpec): TemplateResult {
    const value = this._drafts[field.key] ?? "";
    const helper = field.key === "descriptor" && this._formatError ? this._formatError : field.helper;
    const helperClass = field.key === "descriptor" && this._formatError ? "payload-format-error" : "";
    return html`
      <label class="decoded-field" data-field=${field.key}>
        <span class="decoded-field-label">${field.label}</span>
        ${field.multiline
          ? html`<textarea class="decoded-field-input decoded-field-input--multiline ${field.escapedDisplay ? "decoded-field-input--escaped" : ""}" rows="4" spellcheck="false" .value=${value} ?disabled=${Boolean(field.readonly)} @input=${(event: Event) => this._onFieldInput(field, event)}></textarea>`
          : html`<input class="decoded-field-input" type=${field.numeric ? "number" : "text"} .value=${value} ?disabled=${Boolean(field.readonly)} @input=${(event: Event) => this._onFieldInput(field, event)} />`}
        ${helper ? html`<span class="decoded-field-helper ${helperClass}">${helper}</span>` : nothing}
      </label>
    `;
  }
}

export function definePayloadDialog(): void {
  if (!customElements.get(PAYLOAD_DIALOG_TAG)) customElements.define(PAYLOAD_DIALOG_TAG, SbPayloadDialog);
}
