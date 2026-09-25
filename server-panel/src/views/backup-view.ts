// The Backup tab (docs/internal/server-panel-backup-plan.md): the HA control
// panel card's Backup tab (`tabs/backup-tab.ts`) recreated on the server's
// API, with the card's sections, containers, class names and wording (state
// plan decision 12: mirror, do not share the templates). The bundle work is
// the card's pure `backup-state.ts`; the panel's own rules live in
// `backup-view-state.ts`.
//
// Make starts a `backup` job and offers the finished bundle as a download
// while the server stages it (five minutes, like the integration; "Complete"
// drops it). Edit loads a backup file into the browser, keeps it as an edit
// session in local storage for an hour, opens the panel's device and
// activity editors on it in offline mode and downloads the result. Restore
// loads a file, picks what to write and starts a `restore` job. The server
// keeps no backup archive: the downloaded file is the backup.
//
// A running job is narrated by the shell's bottom dock like every job; the
// sections show the card's progress card in place of their content.

import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import {
  mdiAlertCircleOutline,
  mdiCheckCircleOutline,
  mdiCheckDecagramOutline,
  mdiChevronRight,
  mdiClockAlertOutline,
  mdiClose,
  mdiDragVerticalVariant,
  mdiPencil,
} from "@mdi/js";

import type { BackupBundlePayload } from "../../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { TOOLS_CARD_STRINGS } from "../../../custom_components/sofabaton_x1s/www/src/strings";
import {
  assertBackupBundleRestoreCompatible,
  bundleActivityOptions,
  bundleDeviceOptions,
  bundleEditableDeviceOptions,
  pruneBackupBundle,
  reconcileRestoreSelection,
  renameBundleHub,
  reorderBundleActivities,
  reorderBundleDevices,
  validateBackupBundle,
  type BackupSelectionOption,
} from "../../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";
import { problemText, type HubView, type JobView, type PanelApi } from "../panel-api";
import type { HubContext } from "../panel-context";
import { firmwareFloor, type Gate } from "../panel-selectors";
import { FIRMWARE_BLOCK_CSS, renderFirmwareBlock } from "../components/firmware-block";
import type { PanelStore } from "../panel-store";
import { OPERATION_PROGRESS_CSS, renderOperationProgress } from "../components/operation-progress";
import { PANEL_BASE_CSS } from "../panel-styles";
import { PointerReorder } from "../pointer-reorder";
import {
  backupResultFacts,
  editedFilename,
  jobFailureText,
  jobProgressMessage,
  jobRunning,
  loadEditSession,
  loadResultAcks,
  saveEditSession,
  saveResultAcks,
  sectionJob,
  type BackupEditTargetKind,
  type BackupSectionId,
  type StorageLike,
} from "./backup-view-state";
import { sanitizeName, snapshotAsBundle } from "./device-editor-state";

export const BACKUP_VIEW_TAG = "sb-panel-backup";

const S = TOOLS_CARD_STRINGS.backup;
const C = TOOLS_CARD_STRINGS.common;

// The panel's own lines: the card says "Home Assistant" and asks for its persistent cache.
const P = {
  pickHub: "Pick a hub above.",
  devicesUnavailable: "The hub's device list is not available yet, so only the entire hub can be backed up. Refresh the hub on the Hub tab to choose devices.",
  dragRowAria: "Drag to reorder (arrow keys move the row)",
};

type BackupScope = "whole_hub" | "individual_devices";

function icon(path: string, cls = ""): TemplateResult {
  return html`<svg class="mdi ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${path}></path></svg>`;
}

function localStorageOrNull(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export class SbPanelBackup extends LitElement {
  static properties = {
    ctx: { attribute: false },
    store: { attribute: false },
    section: { attribute: false },
    _jobs: { state: true },
    _scope: { state: true },
    _deviceOptions: { state: true },
    _deviceIds: { state: true },
    _backupError: { state: true },
    _starting: { state: true },
    _restoreBundle: { state: true },
    _restoreFilename: { state: true },
    _restoreActivityIds: { state: true },
    _restoreManualDeviceIds: { state: true },
    _restoreMode: { state: true },
    _restoreError: { state: true },
    _editBundle: { state: true },
    _editFilename: { state: true },
    _editError: { state: true },
    _editDirty: { state: true },
    _detail: { state: true },
    _hubRename: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    OPERATION_PROGRESS_CSS,
    FIRMWARE_BLOCK_CSS,
    css`
      :host { display: block; container-type: inline-size; --bk-radius-sm: 10px; --bk-radius-md: 12px; --bk-radius-xl: 22px; }
      .mdi { width: 18px; height: 18px; flex: 0 0 auto; }
      input[type="file"] { display: none; }
      /* The view fits between the docks, as the card does in HA: only the list card gives up height (and scrolls), so the
         action buttons under it stay on screen. Below the floor the page scrolls instead of squeezing the list away. */
      .backup-panel { display: flex; flex-direction: column; max-height: max(300px, calc(100dvh - var(--top-dock-height, 0px) - var(--bottom-dock-height, 0px) - var(--view-chrome-block, 0px))); }
      .backup-body, .restore-body, .edit-body { display: flex; flex-direction: column; gap: 12px; min-width: 0; flex: 0 1 auto; min-height: 0; }
      .backup-config-view, .restore-config-view, .edit-config-view { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
      .backup-body > *, .restore-body > *, .edit-body > *, .backup-config-view > *, .restore-config-view > *, .edit-config-view > * { flex: 0 0 auto; }
      .backup-body > .backup-config-view, .restore-body > .restore-config-view, .edit-body > .edit-config-view,
      .backup-config-view > .selection-card, .restore-config-view > .selection-card, .edit-config-view > .selection-card { flex: 0 1 auto; min-height: 0; }
      .backup-drawer-sub { color: var(--sbp-muted); font-size: 13px; line-height: 1.5; }
      .backup-section-title { color: var(--sbp-text); font-size: 13px; font-weight: 700; }

      /* -- scope radios and checkboxes (the card's compat controls) ------------------------------ */
      .backup-scope-group { display: grid; gap: 8px; }
      .compat-radio-group { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; width: 100%; }
      label.compat-radio-option { min-width: 0; display: flex; align-items: center; gap: 10px; margin: 0; padding: 12px 14px; border: 1px solid var(--sbp-line); border-radius: var(--bk-radius-md); background: var(--sbp-panel); color: var(--sbp-text); font-size: inherit; letter-spacing: 0; text-transform: none; cursor: pointer; transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease; }
      .compat-radio-option:hover { border-color: color-mix(in srgb, var(--sbp-accent) 45%, var(--sbp-line)); }
      .compat-radio-option.selected { border-color: color-mix(in srgb, var(--sbp-accent) 70%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-accent) 10%, var(--sbp-panel)); }
      .compat-radio-option.disabled { opacity: 0.58; cursor: default; }
      .compat-radio-option-label { min-width: 0; flex: 1 1 auto; font-size: 13px; font-weight: 600; line-height: 1.4; }
      input.compat-choice { width: 18px; height: 18px; margin: 0; padding: 0; flex: 0 0 auto; accent-color: var(--sbp-accent); }
      @container (max-width: 360px) { .compat-radio-group { grid-template-columns: 1fr; } }

      /* -- the selection list ---------------------------------------------------------------------- */
      .backup-devices-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
      .backup-devices-head-main { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
      .backup-selected-count { color: var(--sbp-accent); font-size: 12px; font-weight: 700; }
      button.backup-link-btn { border: none; background: transparent; color: var(--sbp-accent); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; padding: 0; }
      button.backup-link-btn:disabled { opacity: 0.48; cursor: default; }
      .selection-card { border: 1px solid var(--sbp-line); border-radius: var(--bk-radius-md); background: color-mix(in srgb, var(--sbp-panel-2) 72%, transparent); overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; min-width: 0; }
      .selection-list { display: flex; flex-direction: column; }
      .selection-empty { padding: 16px 14px; font-size: 13px; color: var(--sbp-muted); }
      .selection-group-header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; min-height: 36px; padding: 0 14px; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--sbp-muted); background: color-mix(in srgb, var(--sbp-panel-2) 94%, white 6%); border-top: 1px solid color-mix(in srgb, var(--sbp-line) 72%, transparent); }
      .selection-group-header:first-child { border-top: none; }
      .selection-row { display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-top: 1px solid color-mix(in srgb, var(--sbp-line) 72%, transparent); cursor: pointer; min-width: 0; }
      .selection-row:first-child { border-top: none; }
      .selection-row.locked { cursor: default; }
      .selection-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; flex: 1 1 auto; }
      .selection-label { color: var(--sbp-text); font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
      .selection-meta { color: var(--sbp-muted); font-size: 12px; font-weight: 600; white-space: nowrap; margin-left: 8px; }
      .selection-chevron { color: var(--sbp-muted); flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; }

      /* -- the Edit overview rows: a drag handle and the row's own button ----------------------- */
      .edit-selection-row { display: flex; align-items: stretch; border-top: 1px solid color-mix(in srgb, var(--sbp-line) 72%, transparent); background: transparent; min-width: 0; }
      .selection-group-header + .edit-order-sortable-container .edit-selection-row:first-child { border-top: none; }
      .edit-selection-row:hover { background: color-mix(in srgb, var(--sbp-accent) 6%, transparent); }
      button.edit-row-open { flex: 1 1 auto; min-width: 0; border: none; border-radius: 0; background: transparent; color: inherit; font: inherit; text-align: left; white-space: normal; display: flex; gap: 12px; align-items: center; padding: 10px 14px; cursor: pointer; }
      button.edit-row-drag { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; border: none; border-radius: 8px; background: transparent; color: var(--sbp-muted); cursor: grab; touch-action: none; padding: 0 2px 0 10px; }
      button.edit-row-drag:active { cursor: grabbing; }
      .edit-row-drag + .edit-row-open { padding-left: 6px; }
      .edit-order-sortable-container { display: block; }
      .edit-config-view.is-sorting { user-select: none; -webkit-user-select: none; }
      .edit-selection-row.is-dragging { position: relative; z-index: 2; background: var(--sbp-panel); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22); }
      .edit-selection-row.is-shifting { transition: transform 140ms ease; }

      /* -- buttons ----------------------------------------------------------------------------------- */
      .backup-action-row { display: flex; justify-content: flex-start; }
      .action-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: center; }
      .restore-action-row { display: flex; justify-content: flex-start; align-items: center; gap: 10px; flex-wrap: nowrap; min-width: 0; }
      .restore-action-row .primary-btn { flex: 0 0 auto; }
      button.primary-btn, button.secondary-btn { border-radius: var(--bk-radius-md); padding: 10px 16px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: transform 120ms ease, border-color 120ms ease, background 120ms ease; }
      button.primary-btn { border: 1px solid color-mix(in srgb, var(--sbp-accent) 65%, var(--sbp-line)); color: var(--sbp-text); background: color-mix(in srgb, var(--sbp-accent) 16%, var(--sbp-panel)); }
      button.secondary-btn { border: 1px solid var(--sbp-line); color: var(--sbp-text); background: transparent; }
      button.primary-btn:hover:not(:disabled), button.secondary-btn:hover:not(:disabled) { transform: translateY(-1px); }
      button.primary-btn:disabled, button.secondary-btn:disabled { opacity: 0.48; cursor: default; transform: none; }
      button.header-primary-btn { min-width: 114px; min-height: 42px; padding: 0 18px; line-height: 1; }
      button.filename-btn { flex: 1 1 0; min-width: 0; max-width: 100%; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .primary-btn--unsaved::after { content: ""; display: inline-block; width: 8px; height: 8px; margin-left: 8px; border-radius: 50%; background: var(--sbp-warn); vertical-align: middle; }

      /* -- status, progress, complete ----------------------------------------------------------------- */
      .status-box { display: flex; align-items: flex-start; gap: 10px; border: 1px solid var(--sbp-line); border-radius: var(--bk-radius-sm); padding: 10px 12px; font-size: 13px; line-height: 1.45; color: var(--sbp-muted); }
      .status-box.error { color: var(--sbp-err); border-color: color-mix(in srgb, var(--sbp-err) 35%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-err) 5%, var(--sbp-panel)); }
      .status-box.warning { border-color: color-mix(in srgb, var(--sbp-warn) 35%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-warn) 5%, var(--sbp-panel)); }
      .status-icon { display: inline-flex; color: inherit; flex: 0 0 auto; }
      .backup-complete-card { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; border: 1px solid color-mix(in srgb, var(--sbp-accent) 20%, var(--sbp-line)); border-radius: var(--bk-radius-xl); padding: 28px 18px; background: radial-gradient(circle at top, color-mix(in srgb, var(--sbp-accent) 14%, transparent), transparent 44%), color-mix(in srgb, var(--sbp-panel) 92%, transparent); }
      .backup-complete-icon { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 999px; color: var(--sbp-accent); background: color-mix(in srgb, var(--sbp-accent) 14%, transparent); }
      .backup-complete-icon .mdi { width: 30px; height: 30px; }
      .backup-complete-title { color: var(--sbp-text); font-size: 20px; font-weight: 700; }
      .backup-complete-sub { color: var(--sbp-muted); font-size: 13px; line-height: 1.5; }
      .backup-downloaded-note, .backup-expired-note { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; font-weight: 600; }
      .backup-downloaded-note { color: var(--sbp-ok); }
      .backup-expired-note { color: var(--sbp-warn); }
      .backup-downloaded-note .mdi, .backup-expired-note .mdi { width: 16px; height: 16px; }

      /* -- the Edit overview's hub name row and its dialog ------------------------------------------ */
      .edit-hub-name-row { display: flex; align-items: center; gap: 8px; padding: 4px 10px; border-radius: var(--bk-radius-sm); border: 1px solid color-mix(in srgb, var(--sbp-line) 72%, transparent); background: color-mix(in srgb, var(--sbp-panel) 96%, black); font-size: 13px; min-width: 0; }
      .edit-hub-name-label { flex: 0 0 auto; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--sbp-muted); }
      .edit-hub-name-value { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sbp-text); }
      button.icon-btn, button.dialog-close { flex: 0 0 auto; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--sbp-line); border-radius: var(--bk-radius-sm); background: var(--sbp-panel); color: var(--sbp-muted); cursor: pointer; padding: 0; }
      button.icon-btn:hover, button.dialog-close:hover { border-color: var(--sbp-accent); color: var(--sbp-text); }
      .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
      .dialog { width: min(440px, calc(100vw - 36px)); display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--sbp-line); background: var(--sbp-panel); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28); overflow: hidden; color: var(--sbp-text); }
      .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
      .dialog-header { border-bottom: 1px solid var(--sbp-line); justify-content: space-between; }
      .dialog-title { font-size: 16px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      button.dialog-close { width: 34px; height: 34px; }
      .dialog-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
      .dialog-footer { border-top: 1px solid var(--sbp-line); justify-content: space-between; flex-wrap: wrap; }
      .dialog-footer-note { flex: 1 1 140px; min-height: 18px; min-width: 0; font-size: 13px; color: var(--sbp-err); }
      .dialog-footer-actions { display: flex; gap: 8px; margin-left: auto; }
      button.dialog-btn { border: 1px solid var(--sbp-line); border-radius: 10px; padding: 8px 12px; background: transparent; color: var(--sbp-text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
      button.dialog-btn-primary { border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.18); }
      label.decoded-field { display: flex; flex-direction: column; gap: 4px; margin: 0; font-size: inherit; letter-spacing: 0; text-transform: none; color: inherit; }
      .decoded-field-label { font-size: 12px; font-weight: 600; color: var(--sbp-muted); text-transform: uppercase; letter-spacing: 0.04em; }
      input.decoded-field-input { width: 100%; font: inherit; font-size: 13px; color: var(--sbp-text); background: var(--sbp-input); border: 1px solid var(--sbp-line); border-radius: 10px; padding: 8px 10px; }
      @media (max-width: 640px) {
        .modal-backdrop { padding: 0; align-items: flex-end; }
        .dialog { width: 100%; border-radius: 22px 22px 0 0; }
      }
    `,
  ];

  ctx: HubContext | null = null;
  store: PanelStore | null = null;
  section: BackupSectionId | string = "make";
  /** Injectable for tests; the browser's own by default. */
  storage: StorageLike | null = localStorageOrNull();
  now: () => number = () => Date.now();

  private _jobs: JobView[] = [];
  private _acks: Set<string> = new Set();
  private _shownBackupJobId: string | null = null;
  private _shownRestoreJobId: string | null = null;
  private _hubId: string | null = null;
  private _jobsSeq = 0;
  private _jobsKey = "";
  /** The hub's gate when the device list was last read; anything but "pass" asks for another read once it passes. */
  private _devicesGate: Gate | null = null;
  private _expiryTimer: number | null = null;

  // Make
  private _scope: BackupScope = "whole_hub";
  private _deviceOptions: BackupSelectionOption[] = [];
  private _deviceIds: number[] = [];
  private _backupError: string | null = null;
  private _starting: "backup" | "restore" | null = null;
  private readonly _scopeRadioName = `sb-backup-scope-${Math.random().toString(36).slice(2)}`;

  // Restore
  private _restoreBundle: BackupBundlePayload | null = null;
  private _restoreFilename = "";
  private _restoreActivityIds: number[] = [];
  private _restoreManualDeviceIds: number[] = [];
  private _restoreMode: "replace" | "merge" = "merge";
  private _restoreError: string | null = null;

  // Edit
  private _editBundle: BackupBundlePayload | null = null;
  private _editFilename = "";
  private _editError: string | null = null;
  private _editDirty = false;
  private _detail: { kind: BackupEditTargetKind; id: number } | null = null;
  private _hubRename: { draft: string; error: string } | null = null;
  private _editSessionTried = false;
  /** The download ended the session: the file stays on screen, but only a new edit or a new file is stored again. */
  private _editSessionEnded = false;
  private _dirtyAnnounced = false;
  private readonly _activitySorter = this._makeSorter("activity");
  private readonly _deviceSorter = this._makeSorter("device");

  private _makeSorter(kind: BackupEditTargetKind): PointerReorder {
    return new PointerReorder(
      () => Array.from(this.renderRoot.querySelectorAll<HTMLElement>(`.edit-selection-row[data-kind="${kind}"]`)),
      () => this.requestUpdate(),
      (from, to) => this._moveTopLevel(kind, from, to),
      () => parseFloat(getComputedStyle(this).getPropertyValue("--top-dock-height")) || 0,
      () => 0,
      () => this.renderRoot.querySelector<HTMLElement>("#edit-list")?.closest<HTMLElement>(".selection-card") ?? null,
    );
  }

  // -- lifecycle ---------------------------------------------------------------------------------------

  connectedCallback(): void {
    super.connectedCallback();
    this._acks = loadResultAcks(this.storage);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._clearExpiryTimer();
    this._activitySorter.cancel();
    this._deviceSorter.cancel();
    this._announceDirty(false);
  }

  private get _hub(): HubView | null {
    return this.ctx?.hub ?? null;
  }

  private get _api(): PanelApi | null {
    return this.ctx?.api ?? null;
  }

  protected willUpdate(changed: PropertyValues): void {
    const hubId = this._hub?.hub_id ?? null;
    if (hubId !== this._hubId) {
      const previous = this._hubId;
      this._hubId = hubId;
      this._onHubChanged(previous);
    }
    if (changed.has("ctx") || changed.has("section")) {
      // A job that started or finished, or a bundle that was downloaded or expired, moves this key.
      const hub = this._hub;
      const key = hub ? `${hub.hub_id}|${hub.active_job?.job_id ?? ""}|${hub.last_job?.job_id ?? ""}|${JSON.stringify(hub.last_job?.result ?? null)}` : "";
      if (key !== this._jobsKey) {
        this._jobsKey = key;
        void this._loadJobs();
      }
      // A device list read while the hub could not answer (disabled: a 409) is read again once it passes its gates.
      if (hubId && this.ctx?.gate === "pass" && this._devicesGate !== "pass") void this._loadDevices();
    }
    if (!this._editSessionTried && hubId && this.section === "edit" && !this._editBundle) {
      // Only on the Edit section itself: restoring elsewhere would pull an open detail view over another screen.
      this._editSessionTried = true;
      const session = loadEditSession(this.storage, hubId, this.now());
      if (session) {
        this._editBundle = session.bundle;
        this._editFilename = session.filename;
        this._editDirty = session.dirty;
        this._detail = session.detail;
      }
    }
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("_editBundle") || changed.has("_editFilename") || changed.has("_detail") || changed.has("_editDirty")) this._persistEditSession();
    this._announceDirty(this.section === "edit" && Boolean(this._hub) && Boolean(this._editBundle) && this._editDirty);
  }

  /** A loaded file belongs to the hub it was picked on: the restore file was checked against that hub's
   *  model, and the edit session is stored per hub. */
  private _onHubChanged(previous: string | null): void {
    this._jobs = [];
    this._jobsKey = "";
    this._shownBackupJobId = null;
    this._shownRestoreJobId = null;
    this._backupError = null;
    this._starting = null;
    this._scope = "whole_hub";
    this._deviceOptions = [];
    this._deviceIds = [];
    if (previous !== null) this._resetRestoreFile();
    this._editBundle = null;
    this._editFilename = "";
    this._editError = null;
    this._editDirty = false;
    this._detail = null;
    this._hubRename = null;
    this._editSessionTried = false;
    this._editSessionEnded = false;
    if (this._hubId) void this._loadDevices();
  }

  // -- jobs: what each section shows ------------------------------------------------------------------------

  private async _loadJobs(): Promise<void> {
    const hubId = this._hubId;
    const api = this._api;
    if (!hubId || !api) return;
    const seq = ++this._jobsSeq;
    try {
      const response = await api.listJobs(hubId);
      if (seq !== this._jobsSeq || hubId !== this._hubId) return;
      if (response.ok && Array.isArray(response.body)) this._jobs = response.body;
    } catch {
      // The shell says when the server is unreachable; the sections keep what they had.
    }
  }

  /** The job list with the stream's fresher views of the running and the last finished job folded in. */
  private _mergedJobs(): JobView[] {
    const hub = this._hub;
    const live = [hub?.active_job, hub?.last_job].filter((job): job is JobView => Boolean(job));
    const ids = new Set(live.map((job) => job.job_id));
    return [...live, ...this._jobs.filter((job) => !ids.has(job.job_id))].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  }

  private _sectionJob(kind: "backup" | "restore"): JobView | null {
    const shown = kind === "backup" ? this._shownBackupJobId : this._shownRestoreJobId;
    const job = sectionJob(this._mergedJobs(), kind, { acks: this._acks, now: this.now(), shownJobId: shown });
    const id = job?.job_id ?? null;
    if (kind === "backup") {
      this._shownBackupJobId = id;
      this._armExpiryTimer(job);
    } else {
      this._shownRestoreJobId = id;
    }
    return job;
  }

  /** An expiry announced while a newer job is the hub's last one never reaches `ctx`: ask again when it is due. */
  private _armExpiryTimer(job: JobView | null): void {
    this._clearExpiryTimer();
    const expiresAt = (job?.result as { bundle_expires_at?: unknown } | null)?.bundle_expires_at;
    const due = typeof expiresAt === "string" ? Date.parse(expiresAt) : NaN;
    if (!Number.isFinite(due)) return;
    this._expiryTimer = window.setTimeout(() => void this._loadJobs(), Math.max(1000, due - this.now() + 1500));
  }

  private _clearExpiryTimer(): void {
    if (this._expiryTimer !== null) window.clearTimeout(this._expiryTimer);
    this._expiryTimer = null;
  }

  private _acknowledge(jobId: string): void {
    const live = new Set(this._jobs.map((job) => job.job_id));
    this._acks = new Set([...this._acks].filter((id) => live.has(id) || id === jobId));
    this._acks.add(jobId);
    saveResultAcks(this.storage, this._acks);
  }

  private get _busy(): boolean {
    return this._starting !== null || !this.ctx?.free || jobRunning(this._hub?.active_job ?? null);
  }

  // -- Make ------------------------------------------------------------------------------------------------------

  private async _loadDevices(): Promise<void> {
    const hubId = this._hubId;
    const api = this._api;
    if (!hubId || !api) return;
    this._devicesGate = this.ctx?.gate ?? null;
    try {
      const response = await api.snapshot(hubId);
      if (hubId !== this._hubId || !response.ok || !response.body) return;
      this._deviceOptions = bundleDeviceOptions(snapshotAsBundle(response.body));
      if (!this._deviceIds.length) this._deviceIds = this._deviceOptions.map((device) => device.id);
    } catch {
      // Whole-hub backups need no list.
    }
  }

  private _setDevice(deviceId: number, checked: boolean): void {
    const next = new Set(this._deviceIds);
    if (checked) next.add(deviceId);
    else next.delete(deviceId);
    this._deviceIds = [...next].sort((left, right) => left - right);
  }

  private _toggleAllDevices = (): void => {
    const all = this._deviceOptions.map((device) => device.id);
    this._deviceIds = this._deviceIds.length === all.length ? [] : all;
  };

  private async _runBackup(): Promise<void> {
    const hubId = this._hubId;
    const api = this._api;
    if (!hubId || !api || this._busy) return;
    this._backupError = null;
    this._shownBackupJobId = null;
    // A stale draft must not be mistaken for the file about to be produced.
    this._discardEditSession();
    this._starting = "backup";
    try {
      const response = await api.startBackup(hubId, this._scope === "whole_hub" ? null : this._deviceIds);
      if (response.status !== 202 || !response.body) {
        if (!this.store?.noteResponse(hubId, response)) this._backupError = problemText(response);
        return;
      }
      await this._loadJobs();
    } catch (err) {
      this._backupError = err instanceof Error ? err.message : String(err);
    } finally {
      this._starting = null;
    }
  }

  private _downloadBackup(job: JobView): void {
    const hubId = this._hubId;
    const api = this._api;
    if (!hubId || !api) return;
    // A plain attachment link: the server answers with Content-Disposition, which every browser
    // (and a phone's share sheet) handles, and marks the bundle as downloaded.
    const anchor = document.createElement("a");
    anchor.target = "_blank";
    anchor.rel = "noopener";
    anchor.href = api.backupBundleUrl(hubId, job.job_id);
    anchor.download = backupResultFacts(job).filename;
    document.body.appendChild(anchor);
    anchor.dispatchEvent(new MouseEvent("click"));
    document.body.removeChild(anchor);
    window.setTimeout(() => void this._loadJobs(), 1500);
  }

  private async _completeBackup(job: JobView): Promise<void> {
    const hubId = this._hubId;
    this._acknowledge(job.job_id);
    this._shownBackupJobId = null;
    this._backupError = null;
    this._scope = "whole_hub";
    this._deviceIds = this._deviceOptions.map((device) => device.id);
    this.requestUpdate();
    if (hubId && this._api) {
      try {
        await this._api.dropBackupBundle(hubId, job.job_id);
      } catch {
        // The bundle then ages out on the server's own clock.
      }
    }
  }

  // -- Restore ---------------------------------------------------------------------------------------------------

  private _resetRestoreFile(): void {
    this._restoreBundle = null;
    this._restoreFilename = "";
    this._restoreActivityIds = [];
    this._restoreManualDeviceIds = [];
    this._restoreMode = "merge";
    this._restoreError = null;
  }

  private _hubVersion(): string | null {
    const hub = this._hub;
    return hub?.status?.hub_version ?? hub?.config?.hub_version ?? null;
  }

  private _openFilePicker(id: string): void {
    this.renderRoot.querySelector<HTMLInputElement>(`#${id}`)?.click();
  }

  private _onRestoreFilePicked = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this._restoreError = null;
    try {
      const bundle = validateBackupBundle(JSON.parse(await file.text()));
      assertBackupBundleRestoreCompatible(bundle, this._hubVersion());
      this._restoreBundle = bundle;
      this._restoreFilename = file.name;
      this._restoreMode = "merge";
      this._restoreActivityIds = bundleActivityOptions(bundle).map((activity) => activity.id);
      this._restoreManualDeviceIds = bundleDeviceOptions(bundle).map((device) => device.id);
    } catch (err) {
      this._resetRestoreFile();
      this._restoreError = err instanceof Error ? err.message : String(err);
    } finally {
      if (input) input.value = "";
    }
  };

  private _setRestoreActivity(activityId: number, checked: boolean): void {
    const next = new Set(this._restoreActivityIds);
    if (checked) next.add(activityId);
    else next.delete(activityId);
    this._restoreActivityIds = [...next].sort((left, right) => left - right);
  }

  private _setRestoreDevice(deviceId: number, checked: boolean): void {
    const next = new Set(this._restoreManualDeviceIds);
    if (checked) next.add(deviceId);
    else next.delete(deviceId);
    this._restoreManualDeviceIds = [...next].sort((left, right) => left - right);
  }

  private async _runRestore(): Promise<void> {
    const hubId = this._hubId;
    const api = this._api;
    const bundle = this._restoreBundle;
    if (!hubId || !api || !bundle || this._busy) return;
    const selection = reconcileRestoreSelection({ bundle, selectedActivityIds: this._restoreActivityIds, manualSelectedDeviceIds: this._restoreManualDeviceIds });
    // The expanded set: activities pulled in by a chain reference come along.
    const filtered = pruneBackupBundle({ bundle, selectedActivityIds: selection.selectedActivityIds, selectedDeviceIds: selection.selectedDeviceIds });
    this._restoreError = null;
    this._shownRestoreJobId = null;
    this._discardEditSession();
    this._starting = "restore";
    try {
      const response = await api.startRestore(hubId, filtered, this._restoreMode === "replace");
      if (response.status !== 202 || !response.body) {
        if (!this.store?.noteResponse(hubId, response)) this._restoreError = problemText(response);
        return;
      }
      await this._loadJobs();
    } catch (err) {
      this._restoreError = err instanceof Error ? err.message : String(err);
    } finally {
      this._starting = null;
    }
  }

  private _completeRestore(job: JobView): void {
    this._acknowledge(job.job_id);
    this._shownRestoreJobId = null;
    this._restoreError = null;
    this._restoreMode = "merge";
    this.requestUpdate();
  }

  // -- Edit --------------------------------------------------------------------------------------------------------

  private _persistEditSession(): void {
    if (!this._hubId || this._editSessionEnded) return;
    saveEditSession(this.storage, this._hubId, this._editBundle ? { filename: this._editFilename, bundle: this._editBundle, dirty: this._editDirty, detail: this._detail } : null, this.now());
  }

  private _discardEditSession(): void {
    this._editBundle = null;
    this._editFilename = "";
    this._editError = null;
    this._editDirty = false;
    this._detail = null;
    if (this._hubId) saveEditSession(this.storage, this._hubId, null, this.now());
  }

  /** The shell's bottom dock carries the card's "download the edited backup" banner while the Edit section holds unsaved edits. */
  private _announceDirty(dirty: boolean): void {
    if (dirty === this._dirtyAnnounced) return;
    this._dirtyAnnounced = dirty;
    this.dispatchEvent(new CustomEvent("sb-backup-dirty", { bubbles: true, composed: true, detail: { dirty } }));
  }

  private _onEditFilePicked = async (event: Event): Promise<void> => {
    const input = event.currentTarget as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    this._editError = null;
    try {
      this._editBundle = validateBackupBundle(JSON.parse(await file.text()));
      this._editFilename = file.name;
    } catch (err) {
      this._editBundle = null;
      this._editFilename = "";
      this._editError = err instanceof Error ? err.message : String(err);
    } finally {
      // A fresh load from disk carries no edits yet.
      this._editSessionEnded = false;
      this._editDirty = false;
      this._detail = null;
      if (input) input.value = "";
    }
  };

  private _commitEdit(next: BackupBundlePayload): void {
    this._editSessionEnded = false;
    this._editBundle = next;
    this._editDirty = true;
  }

  private _onDetailBundleChange = (event: CustomEvent<{ bundle: BackupBundlePayload }>): void => {
    event.stopPropagation();
    this._commitEdit(event.detail.bundle);
  };

  private _closeDetail = (event?: Event): void => {
    event?.stopPropagation();
    this._detail = null;
    window.scrollTo({ top: 0 });
  };

  private _openDetail(kind: BackupEditTargetKind, id: number): void {
    if (this._activitySorter.state || this._deviceSorter.state) return;
    this._detail = { kind, id: Number(id) };
    window.scrollTo({ top: 0 });
  }

  private _detailExists(): boolean {
    const detail = this._detail;
    if (!detail || !this._editBundle) return false;
    const options = detail.kind === "activity" ? bundleActivityOptions(this._editBundle) : bundleDeviceOptions(this._editBundle);
    return options.some((option) => option.id === detail.id);
  }

  private _moveTopLevel(kind: BackupEditTargetKind, from: number, to: number): void {
    const bundle = this._editBundle;
    if (!bundle) return;
    const current = kind === "activity" ? bundleActivityOptions(bundle) : bundleDeviceOptions(bundle);
    if (from === to || from < 0 || to < 0 || from >= current.length || to >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    const ids = next.map((option) => option.id);
    this._commitEdit(kind === "activity" ? reorderBundleActivities(bundle, ids) : reorderBundleDevices(bundle, ids));
  }

  private _downloadEdited = (): void => {
    const bundle = this._editBundle;
    if (!bundle) return;
    // The edited file never leaves the browser: a blob download, unlike the card, which has to
    // route it through Home Assistant for its mobile apps' web views.
    const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = editedFilename(this._editFilename);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    // The download is the "I am done" signal: the session ends, the loaded file stays on screen, clean.
    this._editSessionEnded = true;
    if (this._hubId) saveEditSession(this.storage, this._hubId, null, this.now());
    this._editDirty = false;
  };

  private _openHubRename = (): void => {
    if (!this._editBundle) return;
    this._hubRename = { draft: sanitizeName(this._editBundle.hub?.version ?? null, String(this._editBundle.hub?.name ?? "")).slice(0, 20), error: "" };
  };

  private _onHubRenameInput = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const value = sanitizeName(this._editBundle?.hub?.version ?? null, input.value).slice(0, 20);
    input.value = value;
    this._hubRename = { draft: value, error: "" };
  };

  private _applyHubRename = (): void => {
    const bundle = this._editBundle;
    const dialog = this._hubRename;
    if (!bundle || !dialog) return;
    const next = sanitizeName(bundle.hub?.version ?? null, dialog.draft).trim();
    if (!next) {
      this._hubRename = { ...dialog, error: S.enterName };
      return;
    }
    this._commitEdit(renameBundleHub(bundle, next));
    this._hubRename = null;
  };

  // -- render -------------------------------------------------------------------------------------------------------

  render(): TemplateResult {
    if (!this._hub) return html`<div class="panel"><div class="hint">${P.pickHub}</div></div>`;
    // The card's whole-tab block (a restore to such a hub would be ACKed and dropped; the card blocks Make and Edit with it).
    const floor = firmwareFloor(this._hub);
    if (floor) return html`<div class="backup-panel" id="backup-view" data-section=${this.section}>${renderFirmwareBlock(floor, TOOLS_CARD_STRINGS.availability.backupUnavailable, "backup-firmware-block")}</div>`;
    if (this.section === "edit" && this._detail && this._detailExists()) return this._renderDetail(this._detail);
    const body = this.section === "edit" ? this._renderEdit() : this.section === "restore" ? this._renderRestore() : this._renderMake();
    return html`<div class="backup-panel" id="backup-view" data-section=${this.section}>${body}</div>`;
  }

  private _renderStatus(tone: "warning" | "error", iconPath: string, message: string, id: string): TemplateResult {
    return html`<div class="status-box ${tone}" id=${id} role=${tone === "error" ? "alert" : "status"}><span class="status-icon">${icon(iconPath)}</span><span>${message}</span></div>`;
  }

  private _renderCheckbox(checked: boolean, disabled: boolean, onChange: (checked: boolean) => void): TemplateResult {
    return html`<input class="compat-choice compat-choice--checkbox" type="checkbox" .checked=${checked} ?disabled=${disabled}
      @click=${(event: Event) => event.stopPropagation()}
      @change=${(event: Event) => onChange((event.currentTarget as HTMLInputElement).checked)} />`;
  }

  private _renderProgress(job: JobView, mode: "backup" | "restore"): TemplateResult {
    return renderOperationProgress({
      id: "backup-progress",
      mode,
      title: mode === "backup" ? TOOLS_CARD_STRINGS.progress.backupTitle : TOOLS_CARD_STRINGS.progress.restoreTitle,
      message: jobProgressMessage(job) || TOOLS_CARD_STRINGS.progress.working,
    });
  }

  private _renderMake(): TemplateResult {
    const job = this._sectionJob("backup");
    const running = jobRunning(job);
    const success = job?.status === "done";
    const failure = this._backupError ?? jobFailureText(job, S.backupFailed);
    const devices = this._deviceOptions;
    const wholeHub = this._scope === "whole_hub";
    const locked = this._busy;
    const allSelected = devices.length > 0 && this._deviceIds.length === devices.length;
    return html`
      <div class="backup-body">
        <div class="backup-drawer-sub">${running ? S.creatingSubtitle : success ? S.readySubtitle : S.chooseSubtitle}</div>
        ${!running && !success && !devices.length ? this._renderStatus("warning", mdiAlertCircleOutline, P.devicesUnavailable, "backup-no-devices") : nothing}
        ${failure && !running ? this._renderStatus("error", mdiAlertCircleOutline, failure, "backup-error") : nothing}
        ${running && job
          ? this._renderProgress(job, "backup")
          : success && job
            ? this._renderBackupComplete(job)
            : html`
                <div class="backup-config-view">
                  <div class="backup-scope-group">
                    <div class="compat-radio-group" role="radiogroup" aria-disabled=${String(locked)}>
                      ${([["whole_hub", S.entireHub], ["individual_devices", S.selectedDevices]] as Array<[BackupScope, string]>).map(([value, label]) => {
                        const disabled = locked || (value === "individual_devices" && !devices.length);
                        return html`<label class="compat-radio-option ${value === this._scope ? "selected" : ""} ${disabled ? "disabled" : ""}">
                          <input class="compat-choice compat-choice--radio" type="radio" name=${this._scopeRadioName} .value=${value} .checked=${value === this._scope} ?disabled=${disabled}
                            @change=${(event: Event) => { if ((event.currentTarget as HTMLInputElement).checked) this._scope = value; }} />
                          <span class="compat-radio-option-label">${label}</span>
                        </label>`;
                      })}
                    </div>
                  </div>
                  ${wholeHub
                    ? nothing
                    : html`
                        <div class="backup-devices-head">
                          <div class="backup-devices-head-main">
                            <div class="backup-section-title">${S.devicesToInclude}</div>
                            <div class="backup-selected-count" id="backup-selected-count">${S.selectedCount(this._deviceIds.length)}</div>
                          </div>
                          <button class="backup-link-btn" id="backup-select-all" type="button" ?disabled=${locked} @click=${this._toggleAllDevices}>${allSelected ? S.deselectAll : S.selectAll}</button>
                        </div>
                        <div class="selection-card"><div class="selection-list" id="backup-device-list">
                          ${devices.length
                            ? devices.map((device) => {
                                const checked = this._deviceIds.includes(device.id);
                                return html`<div class="selection-row" data-device-id=${device.id} @click=${() => { if (!locked) this._setDevice(device.id, !checked); }}>
                                  ${this._renderCheckbox(checked, locked, (value) => this._setDevice(device.id, value))}
                                  <span class="selection-main"><span class="selection-label">${device.label}</span></span>
                                  ${device.meta ? html`<span class="selection-meta">${device.meta}</span>` : nothing}
                                </div>`;
                              })
                            : html`<div class="selection-empty">${S.noDevicesAvailable}</div>`}
                        </div></div>`}
                  <div class="backup-action-row">
                    <button class="primary-btn header-primary-btn" id="backup-start" type="button" ?disabled=${locked || (!wholeHub && this._deviceIds.length === 0)} @click=${() => void this._runBackup()}>
                      ${this._starting === "backup" ? S.working : S.startBackup}
                    </button>
                  </div>
                </div>`}
      </div>
    `;
  }

  private _renderBackupComplete(job: JobView): TemplateResult {
    const facts = backupResultFacts(job);
    return html`
      <div class="backup-complete-card" id="backup-complete">
        <div class="backup-complete-icon">${icon(mdiCheckDecagramOutline)}</div>
        <div class="backup-complete-title">${S.completedTitle}</div>
        <div class="backup-complete-sub">${S.backupResultSummary(facts.activities, facts.devices)}</div>
        ${!facts.available
          ? html`<div class="backup-expired-note" id="backup-expired">${icon(mdiClockAlertOutline)}${S.expired}</div>`
          : facts.downloaded
            ? html`<div class="backup-downloaded-note" id="backup-downloaded">${icon(mdiCheckCircleOutline)}${S.downloaded}</div>`
            : nothing}
        <div class="action-row">
          <button class="primary-btn" id="backup-download" type="button" ?disabled=${!facts.available} @click=${() => this._downloadBackup(job)}>${facts.downloaded ? S.downloadAgain : S.downloadBackup}</button>
          <button class="secondary-btn" id="backup-complete-btn" type="button" @click=${() => void this._completeBackup(job)}>${S.complete}</button>
        </div>
      </div>
    `;
  }

  private _renderRestore(): TemplateResult {
    const job = this._sectionJob("restore");
    const running = jobRunning(job);
    const success = job?.status === "done";
    const failure = this._restoreError ?? jobFailureText(job, S.restoreFailed);
    const locked = this._busy;
    const bundle = this._restoreBundle;
    const activities = bundleActivityOptions(bundle);
    const devices = bundleDeviceOptions(bundle);
    const selection = reconcileRestoreSelection({ bundle, selectedActivityIds: this._restoreActivityIds, manualSelectedDeviceIds: this._restoreManualDeviceIds });
    const total = activities.length + devices.length;
    const selected = selection.selectedActivityIds.length + selection.selectedDeviceIds.length;
    const allSelected = total > 0 && selected === total;
    const picker = html`<button class="secondary-btn filename-btn" id="restore-file-btn" type="button" ?disabled=${locked} @click=${() => this._openFilePicker("restore-file-input")}>${this._restoreFilename || S.chooseBackupFile}</button>`;
    const row = (option: BackupSelectionOption, forced: boolean, checked: boolean, kind: "activity" | "device", toggle: (next: boolean) => void) => html`
      <div class="selection-row ${forced ? "locked" : ""}" data-kind=${kind} data-id=${option.id} @click=${() => { if (!forced && !locked) toggle(!checked); }}>
        ${this._renderCheckbox(checked, forced || locked, toggle)}
        <span class="selection-main"><span class="selection-label">${option.label}</span></span>
        ${option.meta || forced ? html`<span class="selection-meta">${[option.meta, forced ? S.linked : ""].filter(Boolean).join(" · ")}</span>` : nothing}
      </div>`;
    return html`
      <div class="restore-body">
        <div class="backup-drawer-sub">${running ? S.restoreRunningSubtitle : success ? S.restoreFinishedSubtitle : S.restoreChooseSubtitle}</div>
        ${failure && !running ? this._renderStatus("error", mdiAlertCircleOutline, failure, "restore-error") : nothing}
        ${running && job
          ? this._renderProgress(job, "restore")
          : success && job
            ? html`<div class="backup-complete-card" id="restore-complete">
                <div class="backup-complete-icon">${icon(mdiCheckDecagramOutline)}</div>
                <div class="backup-complete-title">${S.restoreCompletedTitle}</div>
                <div class="backup-complete-sub">${S.restoreCompletedSubtitle}</div>
                <div class="action-row"><button class="primary-btn" id="restore-complete-btn" type="button" @click=${() => this._completeRestore(job)}>${S.complete}</button></div>
              </div>`
            : nothing}
        <input id="restore-file-input" type="file" accept=".json,application/json" @change=${this._onRestoreFilePicked} />
        ${running || success
          ? nothing
          : bundle
            ? html`
                <div class="restore-config-view">
                  <div class="backup-devices-head">
                    <div class="backup-devices-head-main">
                      <div class="backup-section-title">${S.itemsToRestore}</div>
                      <div class="backup-selected-count" id="restore-selected-count">${S.selectedCount(selected)}</div>
                    </div>
                    <button class="backup-link-btn" id="restore-select-all" type="button" ?disabled=${locked} @click=${() => {
                      this._restoreActivityIds = allSelected ? [] : activities.map((activity) => activity.id);
                      this._restoreManualDeviceIds = allSelected ? [] : devices.map((device) => device.id);
                    }}>${allSelected ? S.deselectAll : S.selectAll}</button>
                  </div>
                  <div class="selection-card"><div class="selection-list" id="restore-list">
                    ${activities.length
                      ? html`<div class="selection-group-header">${S.activities}</div>
                          ${activities.map((activity) => row(activity, selection.forcedActivityIds.includes(activity.id), selection.selectedActivityIds.includes(activity.id), "activity", (next) => this._setRestoreActivity(activity.id, next)))}`
                      : html`<div class="selection-empty">${S.noActivitiesInFile}</div>`}
                    ${devices.length
                      ? html`<div class="selection-group-header">${S.devices}</div>
                          ${devices.map((device) => row(device, selection.forcedDeviceIds.includes(device.id), selection.selectedDeviceIds.includes(device.id), "device", (next) => this._setRestoreDevice(device.id, next)))}`
                      : html`<div class="selection-empty">${S.noDevicesInFile}</div>`}
                  </div></div>
                  <div class="backup-scope-group">
                    <div class="selection-row" id="restore-erase-row" @click=${() => { if (!locked) this._restoreMode = this._restoreMode === "replace" ? "merge" : "replace"; }}>
                      ${this._renderCheckbox(this._restoreMode === "replace", locked, (checked) => { this._restoreMode = checked ? "replace" : "merge"; })}
                      <span class="selection-main"><span class="selection-label">${S.eraseExisting}</span></span>
                    </div>
                  </div>
                  <div class="restore-action-row">
                    <button class="primary-btn" id="restore-start" type="button" ?disabled=${locked || selected === 0} @click=${() => void this._runRestore()}>${this._starting === "restore" ? S.working : S.startRestore}</button>
                    ${picker}
                  </div>
                </div>`
            : html`<div class="restore-action-row">${picker}</div>`}
      </div>
    `;
  }

  private _renderEdit(): TemplateResult {
    const bundle = this._editBundle;
    const picker = html`<button class="secondary-btn filename-btn" id="edit-file-btn" type="button" @click=${() => this._openFilePicker("edit-file-input")}>${this._editFilename || S.chooseBackupFile}</button>`;
    return html`
      <div class="edit-body">
        ${this._editError ? this._renderStatus("error", mdiAlertCircleOutline, this._editError, "edit-error") : nothing}
        <input id="edit-file-input" type="file" accept=".json,application/json" @change=${this._onEditFilePicked} />
        ${bundle
          ? this._renderEditOverview(bundle, picker)
          : html`<div class="edit-config-view"><div class="backup-drawer-sub">${S.editLoadPrompt}</div><div class="restore-action-row">${picker}</div></div>`}
        ${this._renderHubRenameDialog()}
      </div>
    `;
  }

  private _renderEditOverview(bundle: BackupBundlePayload, picker: TemplateResult): TemplateResult {
    const activities = bundleActivityOptions(bundle);
    const devices = bundleEditableDeviceOptions(bundle);
    const hubName = String(bundle.hub?.name ?? "").trim();
    const sorting = Boolean(this._activitySorter.state || this._deviceSorter.state);
    const rows = (kind: BackupEditTargetKind, options: BackupSelectionOption[], sorter: PointerReorder) => {
      const sortable = options.length > 1;
      return html`<div class="edit-order-sortable-container">
        ${options.map((option, position) => {
          const drag = sorter.state;
          const transform = sorter.transform(position);
          return html`<div class="edit-selection-row ${drag?.from === position ? "is-dragging" : drag ? "is-shifting" : ""}" data-kind=${kind} data-id=${option.id} style=${transform ? `transform: ${transform}` : ""}>
            ${sortable
              ? html`<button class="edit-row-drag" type="button" aria-label=${P.dragRowAria} title=${P.dragRowAria}
                  @mousedown=${(event: MouseEvent) => event.preventDefault()}
                  @pointerdown=${(event: PointerEvent) => sorter.start(event, position)}
                  @pointermove=${(event: PointerEvent) => sorter.move(event)}
                  @pointerup=${(event: PointerEvent) => sorter.end(event)}
                  @pointercancel=${(event: PointerEvent) => sorter.cancel(event)}
                  @keydown=${(event: KeyboardEvent) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    this._moveTopLevel(kind, position, position + (event.key === "ArrowUp" ? -1 : 1));
                  }}>${icon(mdiDragVerticalVariant)}</button>`
              : nothing}
            <button class="edit-row-open" type="button" @click=${() => this._openDetail(kind, option.id)}>
              <span class="selection-main"><span class="selection-label">${option.label}</span></span>
              ${option.meta ? html`<span class="selection-meta">${option.meta}</span>` : nothing}
              <span class="selection-chevron">${icon(mdiChevronRight)}</span>
            </button>
          </div>`;
        })}
      </div>`;
    };
    return html`
      <div class="edit-config-view ${sorting ? "is-sorting" : ""}" id="edit-overview">
        <div class="backup-drawer-sub">${S.editLoadPrompt}${S.reorderHint}</div>
        <div class="edit-hub-name-row" title=${S.hubNameRestoreOnlyAria}>
          <span class="edit-hub-name-label">${S.hubName}</span>
          <span class="edit-hub-name-value" id="edit-hub-name">${hubName || S.hubNameNotSet}</span>
          <button class="icon-btn" id="edit-hub-rename" type="button" aria-label=${S.renameHub} title=${S.renameHub} @click=${this._openHubRename}>${icon(mdiPencil)}</button>
        </div>
        <div class="selection-card"><div class="selection-list" id="edit-list">
          ${activities.length ? html`<div class="selection-group-header">${S.activities}</div>${rows("activity", activities, this._activitySorter)}` : html`<div class="selection-empty">${S.noActivitiesInFile}</div>`}
          ${devices.length ? html`<div class="selection-group-header">${S.devices}</div>${rows("device", devices, this._deviceSorter)}` : html`<div class="selection-empty">${S.noDevicesInFile}</div>`}
        </div></div>
        <div class="restore-action-row">
          <button class="primary-btn ${this._editDirty ? "primary-btn--unsaved" : ""}" id="edit-download" type="button" @click=${this._downloadEdited}>${S.downloadEditedBackup}</button>
          ${picker}
        </div>
      </div>
    `;
  }

  private _renderHubRenameDialog(): TemplateResult | typeof nothing {
    const dialog = this._hubRename;
    if (!dialog) return nothing;
    const close = () => { this._hubRename = null; };
    return html`
      <div class="modal-backdrop" @click=${close}>
        <div class="dialog small" id="hub-rename-dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${S.renameDialogTitle}</div><button class="dialog-close" type="button" aria-label=${C.cancel} @click=${close}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">
            <label class="decoded-field">
              <span class="decoded-field-label">Name</span>
              <input class="decoded-field-input" id="hub-rename-input" type="text" maxlength="20" .value=${dialog.draft} @input=${this._onHubRenameInput}
                @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); this._applyHubRename(); } }} />
            </label>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note" id="hub-rename-error">${dialog.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" @click=${close}>${C.cancel}</button>
              <button class="dialog-btn dialog-btn-primary" id="hub-rename-save" type="button" @click=${this._applyHubRename}>${C.save}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /** The panel's own editors on the loaded file (offline mode): the card's `mode="backup"` detail view. */
  private _renderDetail(detail: { kind: BackupEditTargetKind; id: number }): TemplateResult {
    const api = this._api;
    return detail.kind === "device"
      ? html`<sb-panel-device-editor id="backup-detail" .api=${api} .ctx=${this.ctx} .store=${this.store} .deviceId=${detail.id} .offlineBundle=${this._editBundle} .offlineDirty=${this._editDirty}
          @sb-bundle-change=${this._onDetailBundleChange} @sb-editor-close=${this._closeDetail}></sb-panel-device-editor>`
      : html`<sb-panel-activity-editor id="backup-detail" .api=${api} .ctx=${this.ctx} .store=${this.store} .activityId=${detail.id} .offlineBundle=${this._editBundle} .offlineDirty=${this._editDirty}
          @sb-bundle-change=${this._onDetailBundleChange} @sb-editor-close=${this._closeDetail}></sb-panel-activity-editor>`;
  }
}

export function defineBackupView(): void {
  if (!customElements.get(BACKUP_VIEW_TAG)) customElements.define(BACKUP_VIEW_TAG, SbPanelBackup);
}
