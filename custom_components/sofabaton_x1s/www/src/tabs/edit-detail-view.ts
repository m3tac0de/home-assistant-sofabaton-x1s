/**
 * The bundle edit-detail environment, extracted from backup-tab.ts
 * (Phase L1 of docs/internal/live-activity-editor-plan.md).
 *
 * One standalone element hosts everything below the entity list: the
 * detail shell (sticky header, crumbs, scroll-spy section nav), the
 * device and activity section stacks, the sub-views (per-button
 * bindings, macro step editor), and every dialog they open (rename with
 * structured-payload foldout, delete confirm, add-shortcut / HA action,
 * binding picker, step editor, role-overwrite confirm).
 *
 * The element is deliberately write-backend-agnostic: every edit is a
 * pure `bundle → bundle` transform committed through
 * `_commitEditBundleEdit`, which emits a `bundle-change` event. The
 * host owns the bundle (and its persistence/dirty semantics); this
 * element owns all transient view state. `close` asks the host to leave
 * the detail view. The Backup → Edit tab embeds it with mode="backup";
 * the live Activities tab will embed it with mode="live" and a
 * different write backend behind the same events.
 */
import { LitElement, css, html, nothing } from "lit";
import { TOOLS_CARD_STRINGS } from "../strings";
import {
  activityEditorStyles,
  renderActivityRolesBlock,
} from "./activity-editor";
import { backupTabStyles } from "./backup-tab-styles";
import type { BackupBundlePayload, BlobFetchDecodedBlock } from "../shared/ha-context";
import {
  activityButtonBindingItems,
  activityMacroStepItems,
  activityRoleAssignments,
  type ActivityRoleGroupId,
  activityUserMacroSummaries,
  roleMappableButtonCount,
  setActivityRoleDevice,
  addActivityMacroCommandStep,
  addActivityUserMacro,
  addBundleActivityFavorite,
  addBundleDeviceCommand,
  addDeviceMacroCommandStep,
  applyBundleDelete,
  activityQuickAccessItems,
  backupDeleteHasCascade,
  type BackupButtonBindingItem,
  type BackupCommandDecodedBlock,
  type BackupDeleteTarget,
  type BackupDeviceCommandItem,
  type BackupMacroStepItem,
  type ButtonCatalogEntry,
  type DecodableCommandClass,
  type DecodedFieldSpec,
  bundleDeleteImpact,
  bundleActivityOptions,
  bundleDeviceClass,
  bundleEditableDeviceOptions,
  bundleDeviceOptions,
  buttonName,
  clearActivityDeviceInput,
  commandDecodedBlock,
  commandRawPayloadHex,
  normalizeCommandPayloadHex,
  setCommandRestoreData,
  updateCommandRawPayload,
  DECODED_CLASS_FORM_SPECS,
  deviceButtonBindingItems,
  deviceCommandItems,
  deviceMacroStepItems,
  deviceIpAddress,
  deviceIdleBehavior,
  nextFreeDeviceCommandId,
  updateBundleDeviceIdleBehavior,
  IDLE_BEHAVIOR_AUTO_OFF,
  IDLE_BEHAVIOR_ALWAYS_ON,
  IDLE_BEHAVIOR_STAY_ON,
  IDLE_BEHAVIOR_DISABLED,
  removeActivityMacroStep,
  removeDeviceMacroStep,
  reorderActivityMacroSteps,
  reorderBundleActivityQuickAccess,
  reorderDeviceMacroSteps,
  renameBundleActivity,
  renameBundleActivityFavorite,
  renameBundleActivityMacro,
  renameBundleDevice,
  renameBundleDeviceCommand,
  renameBundleHub,
  setActivityDeviceInput,
  setActivityMacroStepWait,
  setDeviceMacroStepWait,
  unboundButtonsForActivity,
  unboundButtonsForDevice,
  updateActivityMacroStep,
  updateBundleDeviceIp,
  updateCommandDecodedFields,
  updateDeviceMacroStep,
  upsertActivityButtonBinding,
  upsertDeviceButtonBinding,
} from "./backup-state";

export type BackupEditTargetKind = "activity" | "device";

/**
 * A command payload fetched on demand from the hub (live mode). `dataHex` is
 * the raw stored blob; `decoded` is the structured block when the class /
 * hub supports it (raw IR on X1/X1S has none). Supplied by the host's
 * `fetchCommandPayload` callback — the detail view stays hass-free.
 */
export interface FetchedCommandPayload {
  dataHex: string;
  decoded: BlobFetchDecodedBlock | null;
}
// POWER_ON / POWER_OFF macro slots. These carry fixed semantic names
// ("Power On"/"Power Off") and a binding refers to them by slot, so they
// are not renameable — unlike user macros bound to activity buttons.
const POWER_MACRO_BUTTON_IDS = new Set([198, 199]);
type BackupEditDetailSectionId =
  | "power"
  | "quick_access"
  | "network"
  | "commands"
  | "bindings";
type BackupQuickAccessKind = "macro" | "favorite";
type ActivityBindingTargetKind = "command" | "action";
type MacroTargetMode = "existing" | "new";
// Step-dialog modes. "input" edits an activity power-macro input ref;
// "power" refs never open the dialog so aren't included here. Waits are no
// longer a dialog mode — they're edited inline on each command row.
type MacroStepKind = "command" | "input";
type BackupRenameDialogTarget =
  | { kind: "detail"; entityKind: BackupEditTargetKind; entityId: number }
  | { kind: "macro"; activityId: number; buttonId: number }
  | { kind: "favorite"; activityId: number; buttonId: number }
  | { kind: "command"; deviceId: number; commandId: number }
  | { kind: "device_ip"; deviceId: number }
  | { kind: "hub_name" };

// Device classes whose `ip_address` lives in the device head and is
// the source of truth for the device's network address. wifi_ip is
// deliberately excluded: it ships its IP inside each command blob,
// editable via the per-command structured-payload form.
const IP_HEAD_DEVICE_CLASSES = new Set(["wifi_hue", "wifi_roku", "wifi_sonos"]);

const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

// ── Name rules shared with the host ─────────────────────────────────
// The hub-rename dialog stays in backup-tab (it opens from the edit
// overview, outside any detail view), so the name-sanitizing rules are
// exported functions over the bundle instead of private methods.

export function bundleSupportsUnicodeNames(bundle: BackupBundlePayload | null): boolean {
  const version = String(bundle?.hub?.version || "").toUpperCase();
  return version.includes("X2") || version.includes("X1S");
}

export function sanitizeBundleName(bundle: BackupBundlePayload | null, value: unknown): string {
  const pattern = bundleSupportsUnicodeNames(bundle)
    ? /[^\p{L}\p{N}\p{M} !-\/:-@\[-`{-~]+/gu
    : /[^A-Za-z0-9 ]+/g;
  // 30 UTF-16 code units = the 30-byte ASCII (X1) / 60-byte UTF-16BE
  // (X1S/X2) name slot on the wire.
  return String(value ?? "").replace(pattern, "").slice(0, 30);
}

export function useLegacyTextField(): boolean {
  return Boolean(customElements.get("ha-textfield")) && !customElements.get("ha-input");
}

export class SofabatonEditDetailView extends LitElement {
  static properties = {
    bundle: { attribute: false },
    kind: { attribute: false },
    entityId: { attribute: false },
    dirty: { type: Boolean },
    mode: { type: String },
    _editDetailActiveSection: { state: true },
    _editDetailNameDraft: { state: true },
    _editRenameDialogOpen: { state: true },
    _editRenameDialogDraft: { state: true },
    _editRenameDialogError: { state: true },
    _editRenameDialogTarget: { state: true },
    _payloadDialogOpen: { state: true },
    _payloadDialogTarget: { state: true },
    _payloadDialogDecodedDrafts: { state: true },
    _payloadDialogDecodedSnapshot: { state: true },
    _payloadDialogRawDraft: { state: true },
    _payloadDialogError: { state: true },
    fetchCommandPayload: { attribute: false },
    testCommandPayload: { attribute: false },
    _payloadFetchingCommandId: { state: true },
    _payloadFetchError: { state: true },
    _payloadDialogTestStatus: { state: true },
    _payloadDialogTestError: { state: true },
    _payloadDialogAddMode: { state: true },
    _payloadDialogNameDraft: { state: true },
    _addCommandPreparing: { state: true },
    _confirmDeleteTarget: { state: true },
    _confirmDeleteLabel: { state: true },
    _addFavoriteOpen: { state: true },
    _addFavoriteDeviceId: { state: true },
    _addFavoriteCommandId: { state: true },
    _addFavoriteName: { state: true },
    _addFavoriteError: { state: true },
    _bindingDialogOpen: { state: true },
    _bindingScope: { state: true },
    _bindingEditButtonId: { state: true },
    _bindingButtonId: { state: true },
    _bindingDeviceId: { state: true },
    _bindingCommandId: { state: true },
    _bindingLongPressEnabled: { state: true },
    _bindingLpDeviceId: { state: true },
    _bindingLpCommandId: { state: true },
    _bindingTargetKind: { state: true },
    _bindingActionName: { state: true },
    _bindingMacroMode: { state: true },
    _bindingMacroId: { state: true },
    _bindingLpTargetKind: { state: true },
    _bindingLpMacroMode: { state: true },
    _bindingLpMacroId: { state: true },
    _bindingLpActionName: { state: true },
    _bindingError: { state: true },
    _macroEditor: { state: true },
    _stepDialogOpen: { state: true },
    _stepDialogEditIndex: { state: true },
    _stepKind: { state: true },
    _stepDeviceId: { state: true },
    _stepCommandId: { state: true },
    _stepHoldSeconds: { state: true },
    _stepError: { state: true },
    _haSortableReady: { state: true },
    _powerControlMenuOpen: { state: true },
    _roleMenuOpen: { state: true },
    _roleConfirm: { state: true },
    _bindingsView: { state: true },
    _addShortcutKind: { state: true },
    _addShortcutActionName: { state: true },
    _addShortcutMacroMode: { state: true },
    _addShortcutMacroId: { state: true },
  };

  // The whole backup-tab stylesheet ships to both shadow roots (see
  // backup-tab-styles.ts); the :host rule it carries gives this element
  // the same flex-fill layout the tab-panel had inside backup-tab.
  static styles = [activityEditorStyles, backupTabStyles, css`
    :host {
      flex-direction: column;
    }
    /* Live-mode header Sync button — styled identically to the Wifi command
       editor's .detail-sync-btn (primary when there are pending changes, a
       green "up to date" disabled state when clean). */
    .detail-sync-btn {
      border: 1px solid var(--divider-color);
      border-radius: calc(var(--ha-card-border-radius, 12px) * 0.85);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
      white-space: nowrap;
      transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease;
    }
    .detail-sync-btn:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .detail-sync-btn.sync-btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .detail-sync-btn:disabled {
      cursor: default;
      opacity: 0.42;
      color: var(--disabled-text-color, var(--secondary-text-color));
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .detail-sync-btn:disabled:hover { border-color: color-mix(in srgb, var(--divider-color) 88%, transparent); }
    .detail-sync-btn.detail-sync-btn--state-ok,
    .detail-sync-btn.detail-sync-btn--state-ok:disabled {
      border-color: color-mix(in srgb, #48b851 45%, var(--divider-color));
      background: color-mix(in srgb, #48b851 14%, var(--ha-card-background, var(--card-background-color)));
      color: #2e7d32;
      opacity: 1;
    }
    /* Spinner used on the live "fetch payload" command-row button. */
    @keyframes sb-spin { to { transform: rotate(360deg); } }
    ha-icon.sb-spin { animation: sb-spin 720ms linear infinite; }
    /* Inline status line (fetch error + in-dialog Test result). */
    .section-status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      padding: 8px 12px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, 10px);
      font-size: 13px;
      line-height: 1.4;
      color: var(--secondary-text-color);
    }
    .section-status ha-icon { --mdc-icon-size: 18px; flex: 0 0 auto; }
    .section-status.error {
      color: var(--error-color, #db4437);
      border-color: color-mix(in srgb, var(--error-color, #db4437) 30%, var(--divider-color));
      background: color-mix(in srgb, var(--error-color, #db4437) 6%, var(--ha-card-background, var(--card-background-color)));
    }
    .payload-test-status.success {
      color: #2e7d32;
      border-color: color-mix(in srgb, #2e7d32 30%, var(--divider-color));
      background: color-mix(in srgb, #2e7d32 6%, var(--ha-card-background, var(--card-background-color)));
    }
    .payload-test-btn { display: inline-flex; align-items: center; gap: 6px; margin-right: auto; }
    .payload-test-btn ha-icon { --mdc-icon-size: 16px; }
    /* Device-class indicator in the payload dialog header. */
    .dialog-title-group { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
    .dialog-title-group .dialog-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .payload-class-badge {
      flex: 0 0 auto;
      font-family: var(--code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      padding: 2px 9px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 40%, var(--divider-color));
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
  `];

  // ── Host-owned props ───────────────────────────────────────────────
  bundle: BackupBundlePayload | null = null;
  kind: BackupEditTargetKind = "activity";
  entityId: number | null = null;
  dirty = false;
  mode: "backup" | "live" = "backup";

  // ── Transient view state (moved 1:1 from backup-tab) ──────────────
  private _editDetailActiveSection: BackupEditDetailSectionId = "power";
  private _powerControlMenuOpen = false;
  private _roleMenuOpen: ActivityRoleGroupId | null = null;
  // Trigger rects for the fixed-position overlay menus (overlayMenuPosition).
  // Captured at click time; not reactive — they change only together with
  // the open-state fields above/below.
  private _roleMenuAnchor: DOMRect | null = null;
  private _roleConfirm: { group: ActivityRoleGroupId; deviceId: number | null } | null = null;
  // Full sub-view for individual button bindings (never an accordion).
  private _bindingsView = false;
  private _addShortcutKind: "command" | "action" = "command";
  private _addShortcutActionName = "";
  private _addShortcutMacroMode: MacroTargetMode = "new";
  private _addShortcutMacroId: number | null = null;
  private _editDetailNameDraft = "";
  private _editRenameDialogOpen = false;
  private _editRenameDialogDraft = "";
  private _editRenameDialogError = "";
  private _editRenameDialogTarget: BackupRenameDialogTarget | null = null;
  // ── Payload dialog (structured decoded form OR raw hex) ────────────
  // Separate from the rename dialog: renaming is the common case and
  // stays a compact name-only form; payload editing has its own button
  // and popup on each command row.
  private _payloadDialogOpen = false;
  private _payloadDialogTarget: { deviceId: number; commandId: number } | null = null;
  private _payloadDialogDecodedDrafts: Record<string, string> = {};
  private _payloadDialogDecodedSnapshot: BackupCommandDecodedBlock | null = null;
  private _payloadDialogRawSnapshot = "";
  private _payloadDialogRawDraft = "";
  private _payloadDialogError = "";
  // ── Live payload editing (host-provided I/O) ───────────────────────
  // The detail view is hass-free; the live Activities host injects these
  // to fetch a command's blob on demand and to Test it on the hub. Absent
  // in backup mode (the payload already lives in the bundle there).
  fetchCommandPayload: ((deviceId: number, commandId: number) => Promise<FetchedCommandPayload | null>) | null = null;
  testCommandPayload: ((hex: string) => Promise<void>) | null = null;
  private _payloadFetchingCommandId: number | null = null;
  private _payloadFetchError = "";
  private _payloadLiveFetched: FetchedCommandPayload | null = null;
  private _payloadDialogTestStatus: "idle" | "testing" | "success" | "error" = "idle";
  private _payloadDialogTestError = "";
  // ── Add-command mode of the payload dialog (live mode only) ────────
  // Same payload controls as command edit, plus a Name field. Decodable
  // wifi classes seed their form (and the opaque record trailer) from an
  // existing command fetched as a template; IR synthesizes from the
  // descriptor alone on the backend, so it needs no template.
  private _payloadDialogAddMode = false;
  private _payloadDialogNameDraft = "";
  private _addCommandPreparing = false;
  private _confirmDeleteTarget: BackupDeleteTarget | null = null;
  private _confirmDeleteLabel = "";
  private _addFavoriteOpen = false;
  private _addFavoriteDeviceId: number | null = null;
  private _addFavoriteCommandId: number | null = null;
  private _addFavoriteName = "";
  private _addFavoriteError = "";
  private _bindingDialogOpen = false;
  private _bindingScope: BackupEditTargetKind = "activity";
  private _bindingEditButtonId: number | null = null;
  private _bindingButtonId: number | null = null;
  private _bindingDeviceId: number | null = null;
  private _bindingCommandId: number | null = null;
  private _bindingLongPressEnabled = false;
  private _bindingLpDeviceId: number | null = null;
  private _bindingLpCommandId: number | null = null;
  private _bindingTargetKind: ActivityBindingTargetKind = "command";
  private _bindingActionName = "";
  private _bindingMacroMode: MacroTargetMode = "new";
  private _bindingMacroId: number | null = null;
  private _bindingLpTargetKind: ActivityBindingTargetKind = "command";
  private _bindingLpMacroMode: MacroTargetMode = "new";
  private _bindingLpMacroId: number | null = null;
  private _bindingLpActionName = "";
  private _bindingError = "";
  private _detailScrollTop = 0;
  private _bindingsScrollTop = 0;
  private _macroEditor: { scope: BackupEditTargetKind; entityId: number; buttonId: number; name: string } | null = null;
  private _stepDialogOpen = false;
  private _stepDialogEditIndex: number | null = null;
  private _stepKind: MacroStepKind = "command";
  private _stepDeviceId: number | null = null;
  private _stepCommandId: number | null = null;
  private _stepHoldSeconds = "0";
  private _stepError = "";
  private _haSortableReady = Boolean(customElements.get("ha-sortable"));

  connectedCallback(): void {
    super.connectedCallback();
    if (!this._haSortableReady) {
      void customElements.whenDefined("ha-sortable").then(() => {
        this._haSortableReady = true;
      });
    }
  }

  // Lit reuses the element instance when the host re-renders with a
  // different entity, so all transient view state must reset exactly the
  // way backup-tab's _openEditDetail/_closeEditDetail pair used to.
  protected willUpdate(changed: Map<string, unknown>) {
    if (changed.has("kind") || changed.has("entityId")) {
      this._resetForEntity();
    }
  }

  private _resetForEntity() {
    this._editDetailActiveSection = "power";
    this._powerControlMenuOpen = false;
    this._roleMenuOpen = null;
    this._roleMenuAnchor = null;
    this._roleConfirm = null;
    this._bindingsView = false;
    this._editDetailNameDraft = sanitizeBundleName(this.bundle, this._selectedEditTitle());
    this._closeEditRenameDialog();
    this._closeCommandPayloadDialog();
    this._payloadFetchingCommandId = null;
    this._payloadFetchError = "";
    this._addCommandPreparing = false;
    this._closeDeleteConfirm();
    this._closeAddFavoriteDialog();
    this._closeBindingDialog();
    this._macroEditor = null;
    this._closeStepDialog();
  }

  /**
   * Commit a mutated bundle from any edit handler. The element updates its
   * own prop synchronously (handlers read the fresh bundle in the same
   * tick), then hands the result to the host, which owns dirty/persistence
   * semantics.
   */
  private _commitEditBundleEdit(next: BackupBundlePayload) {
    this.bundle = next;
    this.dispatchEvent(new CustomEvent("bundle-change", { detail: { bundle: this.bundle } }));
  }

  /** Ask the host to leave the detail view (back button, entity delete). */
  private _requestClose = () => {
    this.dispatchEvent(new CustomEvent("close"));
  };

  // ── Live-mode header (§4.3) ─────────────────────────────────────────
  // The live header mirrors the Wifi command editor: Back (= discard, via the
  // host's exit-confirm) on the left, rename/delete + a single stateful Sync
  // button on the right. The element only signals sync intent; the host owns
  // the write. In backup mode there is no Sync button and the chip reads
  // "Unsaved".
  private _requestSync = () => this.dispatchEvent(new CustomEvent("sync-request"));

  private _renderDirtyChip() {
    // Live mode has no dirty chip — the Sync button's state carries that
    // signal (matching the Wifi command editor). Backup mode keeps "Unsaved".
    if (this.mode === "live" || !this.dirty) return nothing;
    return html`<span class="edit-unsaved-chip" title="You have unsaved changes. Download the backup to save them.">Unsaved</span>`;
  }

  private _renderLiveSyncButton() {
    const S = TOOLS_CARD_STRINGS.activities;
    const dirty = this.dirty;
    const label = dirty ? S.syncToHub : S.syncUpToDate;
    const classes = `detail-sync-btn${dirty ? " sync-btn-primary" : " detail-sync-btn--state-ok"}`;
    return html`<button class=${classes} ?disabled=${!dirty} @click=${dirty ? this._requestSync : null}>${label}</button>`;
  }

  // Rename (pencil) + delete (trash) header buttons — shared by live and
  // backup mode so both editors expose the identical affordance. In live
  // mode rename rides the normal Sync (a bundle mutation → dirty → Sync);
  // delete executes immediately on the hub through the host (see
  // _confirmDelete).
  private _renderDetailRenameDeleteButtons(kind: BackupEditTargetKind) {
    return html`
      <button class="icon-btn" @click=${this._openDetailRenameDialog} aria-label=${`Rename ${kind}`}>
        <ha-icon icon="mdi:pencil"></ha-icon>
      </button>
      <button
        class="icon-btn icon-btn--danger"
        @click=${this._openDetailDeleteConfirm}
        aria-label=${kind === "activity"
          ? TOOLS_CARD_STRINGS.backup.deleteActivityAria
          : TOOLS_CARD_STRINGS.backup.deleteDeviceAria}
      >
        <ha-icon icon="mdi:trash-can-outline"></ha-icon>
      </button>
    `;
  }

  protected render() {
    if (!this.bundle || this.entityId == null) return nothing;
    if (this._macroEditor) {
      return this._renderMacroStepEditorView(this._macroEditor);
    }
    if (this._bindingsView && this.kind === "activity") {
      return this._renderActivityBindingsView();
    }
    const title = this._selectedEditTitle();
    if (!title) return nothing;
    return this._renderEditDetailView({ kind: this.kind, title });
  }

  private _renderEditDetailView(params: {
    kind: BackupEditTargetKind;
    title: string;
  }) {
    const sectionItems = this._editDetailSectionItems(params.kind);
    const activityQuickAccess = params.kind === "activity" && this.entityId != null
      ? activityQuickAccessItems(this.bundle, this.entityId)
      : [];
    const deviceCommands = params.kind === "device" && this.entityId != null
      ? deviceCommandItems(this.bundle, this.entityId)
      : [];
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._requestClose}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title-stack">
                  ${this._renderDetailCrumbs([
                    { label: this._entityKindCrumbLabel(params.kind), onClick: this._requestClose },
                  ])}
                  <div class="detail-title">${params.title}</div>
                </div>
                ${this._renderDirtyChip()}
                <div class="detail-title-actions">
                  ${this._renderDetailRenameDeleteButtons(params.kind)}
                  ${this.mode === "live" ? this._renderLiveSyncButton() : nothing}
                </div>
              </div>
            </div>
            ${this._renderEditDetailSectionNav(sectionItems)}
          </div>
          <div class="detail-scroll" @scroll=${this._handleEditDetailScroll}>
            ${params.kind === "activity"
              ? html`
                  ${this._renderPowerSetupSection("activity", Number(this.entityId))}
                  ${this._renderButtonBindingsSection("activity")}
                  ${this._renderActivityQuickAccessSection(activityQuickAccess)}
                `
              : html`
                  ${this._renderPowerSetupSection("device", Number(this.entityId))}
                  ${this._renderDeviceNetworkSection()}
                  ${this._renderDeviceCommandsSection(deviceCommands)}
                  ${this._renderButtonBindingsSection("device")}
                `}
          </div>
        </div>
        ${this._renderEditRenameDialog()}
        ${this._renderCommandPayloadDialog()}
        ${this._renderDeleteConfirmDialog()}
        ${this._renderAddFavoriteDialog()}
        ${this._renderBindingDialog()}
        ${this._renderRoleConfirmDialog()}
      </div>
    `;
  }

  private _editDetailSectionItems(kind: BackupEditTargetKind): Array<{
    id: BackupEditDetailSectionId;
    icon: string;
    label: string;
  }> {
    if (kind === "activity") {
      return [];
    }

    const hasNetworkSection = this.entityId != null && this.bundle
      ? IP_HEAD_DEVICE_CLASSES.has(bundleDeviceClass(this.bundle, Number(this.entityId)) ?? "")
      : false;
    return [
      { id: "power", icon: "mdi:power-plug-outline", label: "Power" },
      ...(hasNetworkSection ? [{ id: "network" as const, icon: "mdi:lan-connect", label: "Network" }] : []),
      { id: "commands", icon: "mdi:format-list-bulleted", label: "Commands" },
      { id: "bindings", icon: "mdi:gesture-tap-button", label: "Buttons" },
    ];
  }

  private _renderEditDetailSectionNav(
    items: Array<{ id: BackupEditDetailSectionId; icon: string; label: string }>,
  ) {
    if (items.length <= 1) return nothing;
    const activeId = items.some((item) => item.id === this._editDetailActiveSection)
      ? this._editDetailActiveSection
      : items[0].id;

    return html`
      <div class="detail-section-nav" role="tablist" aria-label="Detail sections">
        ${items.map((item) => html`
          <button
            class=${`detail-section-nav-btn${item.id === activeId ? " active" : ""}`}
            type="button"
            role="tab"
            aria-selected=${item.id === activeId ? "true" : "false"}
            @click=${() => this._scrollEditDetailSection(item.id)}
          >
            <ha-icon icon=${item.icon}></ha-icon>
            <span class="detail-section-nav-label">${item.label}</span>
          </button>
        `)}
      </div>
    `;
  }

  private _scrollEditDetailSection(sectionId: BackupEditDetailSectionId) {
    const scrollEl = this.renderRoot.querySelector<HTMLElement>(".detail-scroll");
    const sectionEl = scrollEl?.querySelector<HTMLElement>(`[data-edit-section="${sectionId}"]`);
    if (!scrollEl || !sectionEl) return;
    const targetTop = sectionEl.getBoundingClientRect().top
      - scrollEl.getBoundingClientRect().top
      + scrollEl.scrollTop;
    scrollEl.scrollTop = Math.max(0, targetTop);
    this._editDetailActiveSection = sectionId;
  }

  private _handleEditDetailScroll = (event: Event) => {
    const scrollEl = event.currentTarget as HTMLElement | null;
    if (!scrollEl) return;
    // Overlay menus are viewport-fixed (overlayMenuPosition); scrolling
    // would leave one hanging away from its trigger, so close it instead.
    if (this._roleMenuOpen !== null) {
      this._roleMenuAnchor = null;
      this._roleMenuOpen = null;
    }
    const sections = Array.from(
      scrollEl.querySelectorAll<HTMLElement>("[data-edit-section]"),
    );
    if (!sections.length) return;

    if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 2) {
      const lastSection = sections[sections.length - 1];
      const lastActive = String(lastSection.dataset.editSection || "power") as BackupEditDetailSectionId;
      if (lastActive !== this._editDetailActiveSection) {
        this._editDetailActiveSection = lastActive;
      }
      return;
    }

    const markerTop = scrollEl.getBoundingClientRect().top + 24;
    let active = String(sections[0].dataset.editSection || "power") as BackupEditDetailSectionId;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= markerTop) {
        active = String(section.dataset.editSection || active) as BackupEditDetailSectionId;
      }
    }
    if (active !== this._editDetailActiveSection) {
      this._editDetailActiveSection = active;
    }
  };

  private _renderBindingsListBody(kind: BackupEditTargetKind) {
    if (this.entityId == null || !this.bundle) return nothing;
    const entityId = Number(this.entityId);
    const items = kind === "activity"
      ? activityButtonBindingItems(this.bundle, entityId)
      : deviceButtonBindingItems(this.bundle, entityId);
    if (!items.length) {
      return html`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.buttonBindingsEmpty}</div>`;
    }
    return html`
      <div class="quick-access-list">
        <div class="quick-access-sortable-container">
          ${items.map((item) => this._renderButtonBindingRow(item, kind))}
        </div>
      </div>
    `;
  }

  private _renderAddBindingButton(kind: BackupEditTargetKind) {
    if (this.entityId == null || !this.bundle) return nothing;
    const entityId = Number(this.entityId);
    const unbound = kind === "activity"
      ? unboundButtonsForActivity(this.bundle, entityId)
      : unboundButtonsForDevice(this.bundle, entityId);
    return html`
      <button
        class="quick-access-add-btn"
        @click=${() => this._openAddBindingDialog(kind)}
        ?disabled=${unbound.length === 0}
      >
        <ha-icon icon="mdi:plus"></ha-icon>
        <span>${TOOLS_CARD_STRINGS.backup.addBinding}</span>
      </button>
    `;
  }

  private _renderButtonBindingsSection(kind: BackupEditTargetKind) {
    if (this.entityId == null || !this.bundle) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    const isActivity = kind === "activity";
    return html`
      <div class="quick-access-section" data-edit-section="bindings">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">
              ${isActivity ? S.activityRunningTitle : S.buttonBindingsTitle}
            </div>
            <div class="quick-access-sub">
              ${isActivity ? S.activityRunningSub : S.buttonBindingsDeviceSub}
            </div>
          </div>
          ${isActivity ? nothing : this._renderAddBindingButton(kind)}
        </div>
        ${isActivity
          ? this._renderActivityRolesBlock()
          : this._renderBindingsListBody(kind)}
      </div>
    `;
  }

  private _closeBindingsView = () => {
    this._bindingsView = false;
    this._closeBindingDialog();
    this._closeDeleteConfirm();
    this._restoreMainScroll();
  };

  // Sub-view for per-button customization — same navigation pattern as
  // the step editor (breadcrumbs + back), never an inline accordion.
  private _renderActivityBindingsView() {
    const S = TOOLS_CARD_STRINGS.backup;
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._closeBindingsView}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title-stack">
                  ${this._renderDetailCrumbs([
                    { label: this._entityKindCrumbLabel("activity"), onClick: this._requestClose },
                    { label: this._selectedEditTitle(), onClick: this._closeBindingsView },
                  ])}
                  <div class="detail-title">${S.bindingsViewTitle}</div>
                </div>
                ${this._renderDirtyChip()}
              </div>
            </div>
          </div>
          <div class="detail-scroll">
            <div class="quick-access-section">
              <div class="quick-access-head">
                <div class="quick-access-head-main">
                  <div class="quick-access-title">${S.buttonBindingsTitle}</div>
                  <div class="quick-access-sub">${S.buttonBindingsActivitySub}</div>
                </div>
                ${this._renderAddBindingButton("activity")}
              </div>
              ${this._renderBindingsListBody("activity")}
            </div>
          </div>
        </div>
        ${this._renderBindingDialog()}
        ${this._renderDeleteConfirmDialog()}
      </div>
    `;
  }

  // ── Role-based button assignment (activity) ──────────────────────────

  private _renderActivityRolesBlock() {
    if (this.entityId == null || !this.bundle) return nothing;
    const bundle = this.bundle;
    const activityId = Number(this.entityId);
    const deviceOptions = bundleEditableDeviceOptions(bundle).map((device) => ({
      deviceId: device.id,
      label: device.label,
    }));
    const S = TOOLS_CARD_STRINGS.backup;
    const bindingCount = activityButtonBindingItems(bundle, activityId).length;
    return renderActivityRolesBlock({
      roles: activityRoleAssignments(bundle, activityId),
      optionsFor: (group) => deviceOptions.map((option) => ({
        ...option,
        mappable: roleMappableButtonCount(bundle, option.deviceId, group),
      })),
      openGroup: this._roleMenuOpen,
      menuAnchor: this._roleMenuAnchor,
      onToggleMenu: (group, anchor) => {
        this._roleMenuAnchor = group == null ? null : anchor ?? null;
        this._roleMenuOpen = group;
      },
      onAssign: this._handleRoleAssign,
      customize: {
        label: S.customizeButtonsToggle,
        meta: bindingCount > 0 ? S.bindingsConfiguredCount(bindingCount) : S.bindingsNoneConfigured,
        onOpen: () => {
          this._captureCurrentScrollPosition();
          this._bindingsView = true;
        },
      },
    });
  }

  private _handleRoleAssign = (group: ActivityRoleGroupId, deviceId: number | null) => {
    this._roleMenuOpen = null;
    if (!this.bundle || this.entityId == null) return;
    const current = activityRoleAssignments(this.bundle, Number(this.entityId))
      .find((role) => role.group === group);
    if (current && current.deviceId === deviceId && current.state !== "customized" && deviceId != null) return;
    // Overwriting hand-tuned bindings (customized / custom) needs a confirm.
    if (current && (current.state === "customized" || current.state === "custom")) {
      this._roleConfirm = { group, deviceId };
      return;
    }
    this._applyRoleAssign(group, deviceId);
  };

  private _applyRoleAssign(group: ActivityRoleGroupId, deviceId: number | null) {
    if (!this.bundle || this.entityId == null) return;
    this._commitEditBundleEdit(
      setActivityRoleDevice(this.bundle, Number(this.entityId), group, deviceId),
    );
  }

  private _closeRoleConfirm = () => {
    this._roleConfirm = null;
  };

  private _confirmRoleAssign = () => {
    const pending = this._roleConfirm;
    this._roleConfirm = null;
    if (!pending) return;
    this._applyRoleAssign(pending.group, pending.deviceId);
  };

  private _renderRoleConfirmDialog() {
    if (!this._roleConfirm) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    return html`
      <div class="modal-backdrop" @click=${this._closeRoleConfirm}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S.roleConfirmTitle}</div>
            <button class="dialog-close" @click=${this._closeRoleConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="backup-drawer-sub">${S.roleConfirmBody}</div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note"></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeRoleConfirm}>${S.roleConfirmCancel}</button>
              <button class="dialog-btn dialog-btn-danger" @click=${this._confirmRoleAssign}>${S.roleConfirmReplace}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderButtonBindingRow(item: BackupButtonBindingItem, kind: BackupEditTargetKind) {
    return html`
      <div class="quick-access-sortable-item" data-kind="binding" data-button-id=${item.buttonId}>
        <div class="quick-access-row quick-access-row--no-drag">
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.buttonName}</div>
              <div class="quick-access-chip">button</div>
            </div>
            <div class="quick-access-meta">${item.shortPressLabel}</div>
            ${item.longPress
              ? html`<div class="quick-access-meta">${TOOLS_CARD_STRINGS.backup.bindingLongPressMeta(item.longPress.label)}</div>`
              : nothing}
          </div>
          <div class="quick-access-actions">
            <button
              class="icon-btn"
              @click=${() => this._openEditBindingDialog(kind, item.buttonId)}
              aria-label="Edit binding"
            >
              <ha-icon icon="mdi:pencil"></ha-icon>
            </button>
            <button
              class="icon-btn icon-btn--danger"
              @click=${() => this._openBindingDeleteConfirm(kind, item.buttonId, item.buttonName)}
              aria-label=${TOOLS_CARD_STRINGS.backup.deleteBindingAria}
            >
              <ha-icon icon="mdi:trash-can-outline"></ha-icon>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * "Network" section shown above Commands in the Device detail view
   * for hue / roku / sonos devices, where the IP address lives on the
   * device head and the hub uses it to build Host headers / addressing
   * at replay time. wifi_ip devices are deliberately excluded — their
   * IP lives inside each command blob and is edited per-command via
   * the structured-payload form.
   */
  private _renderDeviceNetworkSection() {
    if (this.entityId == null || !this.bundle) return nothing;
    const deviceId = Number(this.entityId);
    const deviceClass = bundleDeviceClass(this.bundle, deviceId) ?? "";
    if (!IP_HEAD_DEVICE_CLASSES.has(deviceClass)) return nothing;
    const ip = deviceIpAddress(this.bundle, deviceId);
    return html`
      <div class="quick-access-section" data-edit-section="network">
        <div class="quick-access-head">
          <div class="quick-access-title">Network</div>
          <div class="quick-access-sub">
            The device's IP address lives in the device record. The hub uses it to address the device at replay time (Host header for Hue / Sonos, base URL for Roku).
          </div>
        </div>
        <div class="quick-access-list">
          <div class="quick-access-sortable-container">
            <div class="quick-access-sortable-item">
              <div class="quick-access-row quick-access-row--no-drag">
                <div class="quick-access-main">
                  <div class="quick-access-label-row">
                    <div class="quick-access-label">${ip ?? "(not set)"}</div>
                    <div class="quick-access-chip">ip</div>
                  </div>
                  <div class="quick-access-meta">IPv4 dotted-decimal address</div>
                </div>
                <div class="quick-access-actions">
                  <button
                    class="icon-btn"
                    @click=${() => this._openDeviceIpRenameDialog(deviceId)}
                    aria-label="Edit IP address"
                  >
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderDeviceCommandsSection(items: BackupDeviceCommandItem[]) {
    if (this.entityId == null) return nothing;
    return html`
      <div class="quick-access-section" data-edit-section="commands">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">Commands</div>
            <div class="quick-access-sub">
              ${this.mode === "live"
                ? "Use the pencil to rename a command and the braces to fetch its payload from the hub and edit it. Deleting commands stays in Backup → Edit."
                : "Use the pencil to rename a command (names update everywhere it is referenced) and the braces to edit its payload."}
            </div>
          </div>
          ${this.mode === "live"
            ? html`
                <div class="quick-access-head-actions">
                  <button
                    class="quick-access-add-btn"
                    ?disabled=${this._addCommandPreparing}
                    @click=${() => void this._openAddCommandDialog()}
                  >
                    <ha-icon
                      icon=${this._addCommandPreparing ? "mdi:loading" : "mdi:plus"}
                      class=${this._addCommandPreparing ? "sb-spin" : ""}
                    ></ha-icon>
                    <span>Add command</span>
                  </button>
                </div>
              `
            : nothing}
        </div>
        ${this._payloadFetchError
          ? html`
              <div class="section-status error" role="alert">
                <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                <span>${this._payloadFetchError}</span>
              </div>
            `
          : nothing}
        ${items.length
          ? html`
              <div class="quick-access-list">
                <div class="quick-access-sortable-container">
                  ${items.map((item) => this._renderDeviceCommandRow(item))}
                </div>
              </div>
            `
          : html`<div class="quick-access-empty">This Device does not currently have any commands.</div>`}
      </div>
    `;
  }

  private _renderDeviceCommandRow(item: BackupDeviceCommandItem) {
    const pendingAdd = this._commandIsPendingAdd(item.commandId);
    return html`
      <div class="quick-access-sortable-item" data-kind="command" data-command-id=${item.commandId}>
        <div class="quick-access-row quick-access-row--no-drag">
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">${pendingAdd ? "new command" : "command"}</div>
            </div>
            <div class="quick-access-meta">
              Command ID ${item.commandId}
            </div>
          </div>
          <div class="quick-access-actions">
            <button
              class="icon-btn"
              @click=${() => this._openDeviceCommandRenameDialog(item.commandId)}
              aria-label="Rename command"
            >
              <ha-icon icon="mdi:pencil"></ha-icon>
            </button>
            ${this.mode !== "live" && this._commandHasEditablePayload(item.commandId)
              ? html`
                  <button
                    class="icon-btn"
                    @click=${() => this._openCommandPayloadDialog(item.commandId)}
                    aria-label="Edit payload"
                    title="Edit payload"
                  >
                    <ha-icon icon="mdi:code-braces"></ha-icon>
                  </button>
                `
              : nothing}
            ${this.mode === "live" && !pendingAdd
              ? html`
                  <button
                    class="icon-btn"
                    @click=${() => void this._liveFetchAndOpenPayload(item.commandId)}
                    ?disabled=${this._payloadFetchingCommandId != null}
                    aria-label="Edit payload"
                    title="Fetch and edit this command's payload"
                  >
                    <ha-icon
                      icon=${this._payloadFetchingCommandId === item.commandId ? "mdi:loading" : "mdi:code-braces"}
                      class=${this._payloadFetchingCommandId === item.commandId ? "sb-spin" : ""}
                    ></ha-icon>
                  </button>
                `
              : nothing}
            ${this.mode === "live"
              ? nothing
              : html`
                  <button
                    class="icon-btn icon-btn--danger"
                    @click=${() => this._openCommandDeleteConfirm(item.commandId, item.label)}
                    aria-label=${TOOLS_CARD_STRINGS.backup.deleteCommandAria}
                  >
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                  </button>
                `}
          </div>
        </div>
      </div>
    `;
  }

  private _renderActivityQuickAccessSection(items: ReturnType<typeof activityQuickAccessItems>) {
    if (this.entityId == null) return nothing;
    const rows = items.map((item) => this._renderActivityQuickAccessRow(item));
    return html`
      <div class="quick-access-section" data-edit-section="quick_access">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">${TOOLS_CARD_STRINGS.backup.activityShortcutsTitle}</div>
            <div class="quick-access-sub">
              ${this._haSortableReady
                ? TOOLS_CARD_STRINGS.backup.activityShortcutsSubSortable
                : TOOLS_CARD_STRINGS.backup.activityShortcutsSubStatic}
            </div>
          </div>
          <div class="quick-access-head-actions">
            <button class="quick-access-add-btn" @click=${this._openAddShortcutDialog}>
              <ha-icon icon="mdi:plus"></ha-icon>
              <span>${TOOLS_CARD_STRINGS.backup.addShortcutButton}</span>
            </button>
          </div>
        </div>
        ${items.length
          ? html`
              <div class="quick-access-list">
                ${this._haSortableReady
                  ? html`
                      <ha-sortable
                        class="quick-access-sortable"
                        draggable-selector=".quick-access-sortable-item"
                        handle-selector=".quick-access-drag"
                        animation="180"
                        @item-moved=${this._handleActivityQuickAccessSort}
                      >
                        <div class="quick-access-sortable-container">
                          ${rows}
                        </div>
                      </ha-sortable>
                    `
                  : rows}
              </div>
            `
          : html`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.activityShortcutsEmpty}</div>`}
      </div>
    `;
  }

  // Narrative meta line: a custom action shows its step count; a command
  // shortcut shows which device it plays on. Slot ids are storage detail.
  private _quickAccessRowMeta(item: ReturnType<typeof activityQuickAccessItems>[number]): string {
    if (item.kind === "macro") {
      const summary = this.entityId != null
        ? activityUserMacroSummaries(this.bundle, Number(this.entityId))
          .find((macro) => macro.buttonId === item.buttonId)
        : undefined;
      return TOOLS_CARD_STRINGS.backup.macroStepsCount(summary?.commandStepCount ?? 0);
    }
    const device = (this.bundle?.devices ?? [])
      .find((entry) => Number(entry?.device?.device_id || 0) === Number(item.deviceId || 0));
    return String(device?.device?.name || "").trim() || `Device ${item.deviceId ?? "?"}`;
  }

  private _renderActivityQuickAccessRow(item: ReturnType<typeof activityQuickAccessItems>[number]) {
    return html`
      <div class="quick-access-sortable-item" data-kind=${item.kind} data-button-id=${item.buttonId}>
        <div class="quick-access-row">
          <div class="quick-access-drag" aria-hidden="true">
            <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
          </div>
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">
                ${item.kind === "macro"
                  ? TOOLS_CARD_STRINGS.backup.shortcutChipAction
                  : TOOLS_CARD_STRINGS.backup.shortcutChipCommand}
              </div>
            </div>
            <div class="quick-access-meta">${this._quickAccessRowMeta(item)}</div>
          </div>
          <div class="quick-access-actions">
            ${this._haSortableReady ? nothing : html`
              <button
                class="icon-btn"
                @click=${() => this._moveQuickAccessByIdentity(item.kind, item.buttonId, -1)}
                aria-label="Move up"
              >
                <ha-icon icon="mdi:chevron-up"></ha-icon>
              </button>
              <button
                class="icon-btn"
                @click=${() => this._moveQuickAccessByIdentity(item.kind, item.buttonId, 1)}
                aria-label="Move down"
              >
                <ha-icon icon="mdi:chevron-down"></ha-icon>
              </button>
            `}
            ${item.kind === "macro"
              ? html`
                  <button
                    class="icon-btn"
                    @click=${() => this._openMacroEditor("activity", Number(this.entityId), item.buttonId, item.label)}
                    aria-label=${TOOLS_CARD_STRINGS.backup.editStepsAria}
                  >
                    <ha-icon icon="mdi:playlist-edit"></ha-icon>
                  </button>
                `
              : nothing}
            ${this.mode === "live" && item.kind === "favorite"
              ? nothing
              : html`
                  <button
                    class="icon-btn"
                    @click=${() => this._openQuickAccessRenameDialog(item.kind, item.buttonId)}
                    aria-label=${TOOLS_CARD_STRINGS.backup.shortcutRenameAria(item.kind)}
                  >
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                `}
            <button
              class="icon-btn icon-btn--danger"
              @click=${() => this._openQuickAccessDeleteConfirm(item.kind, item.buttonId, item.label)}
              aria-label=${TOOLS_CARD_STRINGS.backup.shortcutDeleteAria(item.kind)}
            >
              <ha-icon icon="mdi:trash-can-outline"></ha-icon>
            </button>
          </div>
        </div>
      </div>
    `;
  }


  private _renderEditRenameDialog() {
    if (!this._editRenameDialogOpen || !this._editRenameDialogTarget) return nothing;
    const label = this._editRenameDialogLabel();
    return html`
      <div class="modal-backdrop" @click=${this._closeEditRenameDialog}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${label}</div>
            <button class="dialog-close" @click=${this._closeEditRenameDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${useLegacyTextField()
              ? html`
                  <ha-textfield
                    id="sb-backup-edit-name"
                    .label=${this._editRenameFieldLabel()}
                    .maxLength=${this._editRenameFieldMaxLength()}
                    .value=${this._editRenameDialogDraft}
                    @input=${this._handleEditRenameDialogInput}
                    @change=${this._handleEditRenameDialogInput}
                    @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); this._applyEditRenameDialog(); } }}
                  ></ha-textfield>
                `
              : html`
                  <ha-input
                    id="sb-backup-edit-name"
                    type="text"
                    .label=${this._editRenameFieldLabel()}
                    .maxlength=${this._editRenameFieldMaxLength()}
                    .value=${this._editRenameDialogDraft}
                    @input=${this._handleEditRenameDialogInput}
                    @change=${this._handleEditRenameDialogInput}
                    @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); this._applyEditRenameDialog(); } }}
                  ></ha-input>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._editRenameDialogError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeEditRenameDialog}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyEditRenameDialog}>Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * The payload popup: structured per-class form when the command has a
   * decoded block, raw hex replacement otherwise. Every command with a
   * captured payload (`restore_data.data_hex`) is editable — classes
   * without a parser just get the raw bytes.
   */
  private _renderCommandPayloadDialog() {
    if (!this._payloadDialogOpen || !this._payloadDialogTarget) return nothing;
    const decoded = this._payloadDialogDecodedSnapshot;
    const deviceClass = String(
      bundleDeviceClass(this.bundle, this._payloadDialogTarget.deviceId) || "",
    ).trim();
    return html`
      <div class="modal-backdrop" @click=${this._closeCommandPayloadDialog}>
        <div class="dialog medium" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title-group">
              <div class="dialog-title">${this._payloadDialogAddMode ? "Add Command" : "Edit Payload"}</div>
              ${deviceClass
                ? html`<span class="payload-class-badge" title="Device class">${deviceClass}</span>`
                : nothing}
            </div>
            <button class="dialog-close" @click=${this._closeCommandPayloadDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${this._payloadDialogAddMode
              ? html`
                  <label class="decoded-field">
                    <span class="decoded-field-label">Name</span>
                    <input
                      class="decoded-field-input"
                      type="text"
                      maxlength="20"
                      spellcheck="false"
                      .value=${this._payloadDialogNameDraft}
                      @input=${this._handleAddCommandNameInput}
                      @change=${this._handleAddCommandNameInput}
                    />
                    <span class="decoded-field-helper">Shown on the remote and in every command picker.</span>
                  </label>
                `
              : nothing}
            ${decoded
              ? this._renderDecodedPayloadForm(decoded.className)
              : this._renderRawPayloadForm()}
            ${this._liveDeviceIsIr()
              ? html`
                  <div class="payload-test-note">
                    <ha-icon icon="mdi:flash-outline"></ha-icon>
                    <span>
                      ${this.mode === "live"
                        ? html`Verify a changed payload before saving: <strong>Test</strong> plays the current bytes on the hub without saving. Save folds the payload into the device's next Sync.`
                        : html`Verify a changed payload before trusting it: <strong>Test</strong> plays the bytes on the hub without saving. Save here only once the payload does what you expect.`}
                    </span>
                  </div>
                `
              : nothing}
            ${this._payloadDialogTestStatus !== "idle"
              ? html`
                  <div class="section-status payload-test-status ${this._payloadDialogTestStatus}" role="status" aria-live="polite">
                    <ha-icon icon=${this._payloadDialogTestStatus === "success"
                      ? "mdi:check-circle-outline"
                      : this._payloadDialogTestStatus === "error"
                        ? "mdi:alert-circle-outline"
                        : "mdi:progress-clock"}></ha-icon>
                    <span>
                      ${this._payloadDialogTestStatus === "testing"
                        ? "Sending to the hub…"
                        : this._payloadDialogTestStatus === "success"
                          ? "Sent to the hub for one-shot playback."
                          : this._payloadDialogTestError || "Test failed."}
                    </span>
                  </div>
                `
              : nothing}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._payloadDialogError}</div>
            <div class="dialog-footer-actions">
              ${this.mode === "live" && this._liveDeviceIsIr() && this.testCommandPayload
                ? html`
                    <button
                      class="dialog-btn payload-test-btn"
                      ?disabled=${this._payloadDialogTestStatus === "testing"}
                      @click=${() => void this._runLivePayloadTest()}
                    >
                      <ha-icon icon="mdi:flash-outline"></ha-icon>
                      <span>Test</span>
                    </button>
                  `
                : nothing}
              <button class="dialog-btn" @click=${this._closeCommandPayloadDialog}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyCommandPayloadDialog}>Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderRawPayloadForm() {
    return html`
      <div class="decoded-form">
        <div class="decoded-form-head">
          <div class="decoded-form-title">Raw payload</div>
          <div class="decoded-form-sub">
            No structured editor exists for this device class; the bytes below
            are replayed to the hub verbatim on restore.
          </div>
        </div>
        <label class="decoded-field">
          <span class="decoded-field-label">Payload (hex bytes)</span>
          <textarea
            class="decoded-field-input decoded-field-input--multiline"
            rows="6"
            spellcheck="false"
            .value=${this._payloadDialogRawDraft}
            @input=${this._handleRawPayloadInput}
            @change=${this._handleRawPayloadInput}
          ></textarea>
          <span class="decoded-field-helper">
            Byte pairs like "0a 4f 22" &mdash; whitespace and 0x prefixes are tolerated.
          </span>
        </label>
      </div>
    `;
  }

  private _handleAddCommandNameInput = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const value = sanitizeBundleName(this.bundle, input.value);
    input.value = value;
    this._payloadDialogNameDraft = value;
    this._payloadDialogError = "";
  };

  private _handleRawPayloadInput = (event: Event) => {
    const input = event.currentTarget as HTMLTextAreaElement;
    this._payloadDialogRawDraft = input.value;
    this._payloadDialogError = "";
  };

  private _renderDecodedPayloadForm(className: DecodableCommandClass) {
    const spec = DECODED_CLASS_FORM_SPECS[className];
    if (!spec) return nothing;
    return html`
      <div class="decoded-form">
        <div class="decoded-form-head">
          <div class="decoded-form-title">${spec.title}</div>
          ${spec.subtitle ? html`<div class="decoded-form-sub">${spec.subtitle}</div>` : nothing}
        </div>
        ${spec.fields.map((field) => this._renderDecodedField(field))}
      </div>
    `;
  }

  private _renderDecodedField(field: DecodedFieldSpec) {
    const value = this._payloadDialogDecodedDrafts[field.key] ?? "";
    const onInput = (event: Event) => this._handleDecodedFieldInput(event, field.key);
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
                @input=${onInput}
                @change=${onInput}
              />
            `}
        ${field.helper ? html`<span class="decoded-field-helper">${field.helper}</span>` : nothing}
      </label>
    `;
  }

  private _editRenameDialogLabel() {
    const target = this._editRenameDialogTarget;
    if (!target) return "Rename";
    if (target.kind === "detail") {
      return target.entityKind === "activity" ? "Rename Activity" : "Rename Device";
    }
    if (target.kind === "macro") return "Rename Macro";
    if (target.kind === "favorite") return "Rename Favorite";
    if (target.kind === "device_ip") return "Edit IP address";
    if (target.kind === "hub_name") return "Rename Hub";
    return "Rename Command";
  }

  /** Per-target label & max length used by the dialog's primary text input. */
  private _editRenameFieldLabel(): string {
    return this._editRenameDialogTarget?.kind === "device_ip" ? "IP address" : "Name";
  }

  private _editRenameFieldMaxLength(): number {
    // "255.255.255.255" is 15 chars; everything else uses the 30-char
    // wire name slot.
    return this._editRenameDialogTarget?.kind === "device_ip" ? 15 : 30;
  }

  /**
   * Diff each spec field against the open-dialog snapshot. Returns a
   * record of fields that changed (mapped back through the wire-format
   * coercion in `_draftToFieldValue`), or `null` when nothing changed
   * and the bundle should be left untouched.
   */
  private _collectChangedDecodedFields(
    snapshot: BackupCommandDecodedBlock,
  ): Record<string, unknown> | null {
    const spec = DECODED_CLASS_FORM_SPECS[snapshot.className];
    if (!spec) return null;
    const changed: Record<string, unknown> = {};
    let touched = false;
    for (const field of spec.fields) {
      const draft = this._payloadDialogDecodedDrafts[field.key] ?? "";
      const original = this._fieldValueToDraft(snapshot.fields[field.key], field);
      if (draft === original) continue;
      changed[field.key] = this._draftToFieldValue(draft, field);
      touched = true;
    }
    return touched ? changed : null;
  }

  /**
   * Convert a draft string from a form control to the value shape the
   * decoder expects. `numeric` fields become numbers; `crlfOnWire`
   * fields get `\n` line endings normalized to `\r\n` so the wire
   * round-trip stays exact even though the browser textarea hides the
   * `\r`. Everything else passes through verbatim.
   */
  private _draftToFieldValue(draft: string, field: DecodedFieldSpec): unknown {
    if (field.numeric) {
      const numeric = Number(draft);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    if (field.escapedDisplay) {
      // Inverse of the display escape in `_fieldValueToDraft`. We do
      // NOT touch lone backslashes — body_block content in observed
      // Hue / Sonos commands never contains literal `\` text, and
      // honoring `\\` would force the user to double-escape ordinary
      // backslashes in pasted JSON.
      let result = draft.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      // If the user pressed Enter inside the textarea, that produces
      // a real LF in the input value. Keep it — they meant a newline,
      // and the next render will re-escape it for display. The above
      // replace order means typed `\n` text wins over rendered LF,
      // which is what we want.
      return result;
    }
    if (field.crlfOnWire) {
      return draft.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    }
    return draft;
  }

  private _handleDecodedFieldInput = (event: Event, fieldKey: string) => {
    const input = event.currentTarget as HTMLInputElement | HTMLTextAreaElement;
    this._payloadDialogDecodedDrafts = {
      ...this._payloadDialogDecodedDrafts,
      [fieldKey]: input.value,
    };
  };

  private _handleEditRenameDialogInput = (event: Event) => {
    const input = event.currentTarget as HTMLElement & { value: string };
    // Name-style targets get the historical sanitizer (printable set
    // limited to what the X1 / X1S firmware accepts in stored labels).
    // The `device_ip` target needs `.` characters and is constrained by
    // its own IPv4 validation at save time, so it passes through raw.
    if (this._editRenameDialogTarget?.kind === "device_ip") {
      this._editRenameDialogDraft = input.value;
    } else {
      const value = sanitizeBundleName(this.bundle, input.value);
      input.value = value;
      this._editRenameDialogDraft = value;
    }
    this._editRenameDialogError = "";
  };

  private _openDetailRenameDialog = () => {
    if (!this.kind || this.entityId == null) return;
    this._editRenameDialogTarget = {
      kind: "detail",
      entityKind: this.kind,
      entityId: this.entityId,
    };
    this._editRenameDialogDraft = this._selectedEditTitle();
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  };

  private _openHubNameRenameDialog = () => {
    if (!this.bundle) return;
    this._editRenameDialogTarget = { kind: "hub_name" };
    this._editRenameDialogDraft = sanitizeBundleName(this.bundle, String(this.bundle.hub?.name ?? ""));
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  };

  private _openDeviceIpRenameDialog(deviceId: number) {
    const normalizedId = Number(deviceId);
    this._editRenameDialogTarget = { kind: "device_ip", deviceId: normalizedId };
    this._editRenameDialogDraft = deviceIpAddress(this.bundle, normalizedId) || "";
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  }

  private _openDeviceCommandRenameDialog(commandId: number) {
    if (this.entityId == null) return;
    const deviceId = Number(this.entityId);
    const normalizedCommandId = Number(commandId);
    this._editRenameDialogTarget = { kind: "command", deviceId, commandId: normalizedCommandId };
    const item = deviceCommandItems(this.bundle, deviceId).find(
      (entry) => entry.commandId === normalizedCommandId,
    );
    this._editRenameDialogDraft = item?.label || "";
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  }

  /**
   * True when the command is a not-yet-synced addition (live mode): its
   * bundle row carries the `restore_data.new` marker and there is nothing
   * on the hub to fetch for it yet.
   */
  private _commandIsPendingAdd(commandId: number): boolean {
    if (this.entityId == null || !this.bundle) return false;
    const device = (this.bundle.devices ?? []).find(
      (entry) => Number(entry?.device?.device_id || 0) === Number(this.entityId),
    );
    const command = (device?.commands ?? []).find(
      (row) => Number(row?.command_id || 0) === Number(commandId),
    );
    return Boolean((command?.restore_data as Record<string, unknown> | null | undefined)?.["new"]);
  }

  /** True when the command carries anything the payload dialog can edit. */
  private _commandHasEditablePayload(commandId: number): boolean {
    if (this.entityId == null) return false;
    const deviceId = Number(this.entityId);
    return Boolean(
      commandDecodedBlock(this.bundle, deviceId, Number(commandId))
      || commandRawPayloadHex(this.bundle, deviceId, Number(commandId)),
    );
  }

  /**
   * True for IR devices. Live payload *editing* is offered for all classes
   * (raw hex, or the structured form where a parser exists), but the Test
   * button — `playIrBlob` — is IR-only, so it gates on this.
   */
  private _liveDeviceIsIr(): boolean {
    if (this.entityId == null || !this.bundle) return false;
    return String(bundleDeviceClass(this.bundle, Number(this.entityId)) || "")
      .trim()
      .toLowerCase() === "ir";
  }

  /**
   * Live "edit payload": fetch this one command's blob from the hub on
   * demand (the structural bundle is blob-free), then open the same payload
   * dialog backup uses — populated from the fetch, not the bundle, so the
   * fetch itself never marks the bundle dirty. The host supplies the fetch.
   */
  private async _liveFetchAndOpenPayload(commandId: number) {
    if (this.mode !== "live" || this.entityId == null || !this.fetchCommandPayload) return;
    if (this._payloadFetchingCommandId != null) return;
    const deviceId = Number(this.entityId);
    const normalizedCommandId = Number(commandId);
    this._payloadFetchingCommandId = normalizedCommandId;
    this._payloadFetchError = "";
    try {
      const fetched = await this.fetchCommandPayload(deviceId, normalizedCommandId);
      if (!fetched || !String(fetched.dataHex || "").trim()) {
        this._payloadFetchError = "The hub returned no payload for this command.";
        return;
      }
      this._openLivePayloadDialog(deviceId, normalizedCommandId, fetched);
    } catch (error) {
      this._payloadFetchError = error instanceof Error ? error.message : String(error);
    } finally {
      this._payloadFetchingCommandId = null;
    }
  }

  private _openLivePayloadDialog(deviceId: number, commandId: number, fetched: FetchedCommandPayload) {
    const decoded = this._decodedSnapshotFromFetch(fetched.decoded);
    const rawHex = decoded ? "" : (normalizeCommandPayloadHex(fetched.dataHex) ?? fetched.dataHex);
    this._payloadDialogTarget = { deviceId, commandId };
    this._payloadLiveFetched = fetched;
    this._payloadDialogDecodedSnapshot = decoded;
    this._payloadDialogDecodedDrafts = decoded ? this._initialDecodedDrafts(decoded) : {};
    this._payloadDialogRawSnapshot = rawHex;
    this._payloadDialogRawDraft = rawHex;
    this._payloadDialogError = "";
    this._payloadDialogTestStatus = "idle";
    this._payloadDialogTestError = "";
    this._payloadDialogOpen = true;
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
  private async _openAddCommandDialog() {
    if (this.mode !== "live" || this.entityId == null || !this.bundle) return;
    if (this._addCommandPreparing) return;
    const deviceId = Number(this.entityId);
    const deviceClass = String(bundleDeviceClass(this.bundle, deviceId) || "").trim().toLowerCase();
    this._payloadFetchError = "";

    if (deviceClass === "ir") {
      this._openAddDialogWithSnapshot(deviceId, {
        className: "ir",
        fields: { descriptor: "" },
        trailerHex: "",
        edited: false,
      });
      return;
    }

    const existing = deviceCommandItems(this.bundle, deviceId);
    if (!existing.length) {
      this._payloadFetchError =
        "This device has no commands to use as a template — add its first command with the Sofabaton app.";
      return;
    }

    if (deviceClass in DECODED_CLASS_FORM_SPECS && this.fetchCommandPayload) {
      this._addCommandPreparing = true;
      try {
        const fetched = await this.fetchCommandPayload(deviceId, existing[0].commandId);
        const decoded = this._decodedSnapshotFromFetch(fetched?.decoded ?? null);
        if (decoded) {
          this._openAddDialogWithSnapshot(deviceId, decoded);
          return;
        }
      } catch (error) {
        this._payloadFetchError = error instanceof Error ? error.message : String(error);
        return;
      } finally {
        this._addCommandPreparing = false;
      }
    }

    // Non-decodable class (BT / RF / learned-IR style records) or the
    // template did not decode: raw hex entry.
    this._openAddDialogWithSnapshot(deviceId, null);
  }

  private _openAddDialogWithSnapshot(deviceId: number, decoded: BackupCommandDecodedBlock | null) {
    this._payloadDialogTarget = { deviceId, commandId: 0 };
    this._payloadDialogAddMode = true;
    this._payloadDialogNameDraft = "";
    this._payloadLiveFetched = null;
    this._payloadDialogDecodedSnapshot = decoded;
    this._payloadDialogDecodedDrafts = decoded ? this._initialDecodedDrafts(decoded) : {};
    this._payloadDialogRawSnapshot = "";
    this._payloadDialogRawDraft = "";
    this._payloadDialogError = "";
    this._payloadDialogTestStatus = "idle";
    this._payloadDialogTestError = "";
    this._payloadDialogOpen = true;
  }

  /**
   * Commit a new command from the add dialog: allocate the next free id on
   * the device and append a row whose `restore_data` carries the
   * `new: true` marker the device-sync planner turns into a `command_add`
   * step. Decoded forms serialize every field (there is no pristine
   * baseline to diff against); raw entry normalizes the hex.
   */
  private _applyAddCommandDialog(target: { deviceId: number; commandId: number }) {
    if (!this.bundle) return;
    const name = sanitizeBundleName(this.bundle, this._payloadDialogNameDraft).trim();
    if (!name) {
      this._payloadDialogError = "Enter a name for the new command.";
      return;
    }
    let restoreData: Record<string, unknown>;
    const snapshot = this._payloadDialogDecodedSnapshot;
    if (snapshot) {
      const spec = DECODED_CLASS_FORM_SPECS[snapshot.className];
      const fields: Record<string, unknown> = {};
      for (const field of spec.fields) {
        fields[field.key] = this._draftToFieldValue(this._payloadDialogDecodedDrafts[field.key] ?? "", field);
      }
      if (snapshot.className === "ir") {
        const descriptor = String(fields["descriptor"] ?? "").trim();
        if (!descriptor.startsWith("P:")) {
          this._payloadDialogError = "Enter a descriptive IR payload starting with P: (e.g. P:Sony12 R:40000 D:1 F:18).";
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
      const normalized = normalizeCommandPayloadHex(this._payloadDialogRawDraft);
      if (!normalized) {
        this._payloadDialogError = "Enter the payload as hex bytes (an even number of hex digits; spaces are fine).";
        return;
      }
      restoreData = { transport: "hub_code_record", data_hex: normalized };
    }
    const newId = nextFreeDeviceCommandId(this.bundle, target.deviceId);
    if (newId == null) {
      this._payloadDialogError = "This device has no free command slot left.";
      return;
    }
    this._commitEditBundleEdit(
      addBundleDeviceCommand(this.bundle, target.deviceId, newId, name, restoreData),
    );
    this._closeCommandPayloadDialog();
  }

  /** Convert a fetched decoded block into the editor's snapshot shape. */
  private _decodedSnapshotFromFetch(decoded: BlobFetchDecodedBlock | null): BackupCommandDecodedBlock | null {
    if (!decoded) return null;
    const className = String(decoded.class ?? "").trim().toLowerCase();
    if (!(className in DECODED_CLASS_FORM_SPECS)) return null;
    return {
      className: className as DecodableCommandClass,
      fields: { ...(decoded.fields ?? {}) },
      trailerHex: String(decoded.trailer_hex ?? ""),
      edited: false,
    };
  }

  /**
   * Commit a live payload edit. The working command has no restore_data yet
   * (blob-free bundle), so build the whole block — carrying the `edited`
   * marker the device-sync planner keys on — and set it via
   * `setCommandRestoreData`. A pristine (unchanged) dialog commits nothing.
   */
  private _applyLivePayloadDialog(target: { deviceId: number; commandId: number }) {
    if (!this.bundle) return;
    const snapshot = this._payloadDialogDecodedSnapshot;
    if (snapshot) {
      const changedFields = this._collectChangedDecodedFields(snapshot);
      if (!changedFields) {
        this._closeCommandPayloadDialog();
        return;
      }
      const restoreData = {
        transport: "hub_code_record",
        data_hex: this._payloadLiveFetched?.dataHex ?? "",
        decoded: {
          class: snapshot.className,
          trailer_hex: snapshot.trailerHex,
          fields: { ...snapshot.fields, ...changedFields },
          edited: true,
        },
      };
      this._commitEditBundleEdit(setCommandRestoreData(this.bundle, target.deviceId, target.commandId, restoreData));
      this._closeCommandPayloadDialog();
      return;
    }
    const normalized = normalizeCommandPayloadHex(this._payloadDialogRawDraft);
    if (!normalized) {
      this._payloadDialogError = "Enter the payload as hex bytes (an even number of hex digits; spaces are fine).";
      return;
    }
    if (normalized === normalizeCommandPayloadHex(this._payloadDialogRawSnapshot)) {
      this._closeCommandPayloadDialog();
      return;
    }
    const restoreData = { transport: "hub_code_record", data_hex: normalized, edited: true };
    this._commitEditBundleEdit(setCommandRestoreData(this.bundle, target.deviceId, target.commandId, restoreData));
    this._closeCommandPayloadDialog();
  }

  /** Test the current draft on the hub (IR only), via the host's callback. */
  private async _runLivePayloadTest() {
    if (!this.testCommandPayload) return;
    const value = this._payloadDialogDecodedSnapshot
      ? String(this._payloadDialogDecodedDrafts["descriptor"] ?? "").trim()
      : String(this._payloadDialogRawDraft ?? "").trim();
    if (!value) {
      this._payloadDialogTestStatus = "error";
      this._payloadDialogTestError = "Nothing to test yet.";
      return;
    }
    this._payloadDialogTestStatus = "testing";
    this._payloadDialogTestError = "";
    try {
      await this.testCommandPayload(value);
      this._payloadDialogTestStatus = "success";
    } catch (error) {
      this._payloadDialogTestStatus = "error";
      this._payloadDialogTestError = error instanceof Error ? error.message : String(error);
    }
  }

  private _openCommandPayloadDialog(commandId: number) {
    if (this.mode === "live") return;
    if (this.entityId == null) return;
    const deviceId = Number(this.entityId);
    const normalizedCommandId = Number(commandId);
    // A decoded block gets the structured per-class form; anything else
    // with a captured payload gets the raw hex editor. Commands with no
    // restore_data at all never reach here (the row hides the button).
    const decoded = commandDecodedBlock(this.bundle, deviceId, normalizedCommandId);
    const rawHex = decoded
      ? null
      : commandRawPayloadHex(this.bundle, deviceId, normalizedCommandId);
    if (!decoded && !rawHex) return;
    this._payloadDialogTarget = { deviceId, commandId: normalizedCommandId };
    this._payloadDialogDecodedSnapshot = decoded;
    this._payloadDialogDecodedDrafts = decoded ? this._initialDecodedDrafts(decoded) : {};
    this._payloadDialogRawSnapshot = rawHex ?? "";
    this._payloadDialogRawDraft = rawHex ?? "";
    this._payloadDialogError = "";
    this._payloadDialogOpen = true;
  }

  private _closeCommandPayloadDialog = () => {
    this._payloadDialogOpen = false;
    this._payloadDialogTarget = null;
    this._payloadDialogDecodedSnapshot = null;
    this._payloadDialogDecodedDrafts = {};
    this._payloadDialogRawSnapshot = "";
    this._payloadDialogRawDraft = "";
    this._payloadDialogError = "";
    this._payloadLiveFetched = null;
    this._payloadDialogTestStatus = "idle";
    this._payloadDialogTestError = "";
    this._payloadDialogAddMode = false;
    this._payloadDialogNameDraft = "";
  };

  private _applyCommandPayloadDialog = () => {
    const target = this._payloadDialogTarget;
    if (!target || !this.bundle) return;
    if (this._payloadDialogAddMode) {
      this._applyAddCommandDialog(target);
      return;
    }
    if (this.mode === "live") {
      this._applyLivePayloadDialog(target);
      return;
    }
    const snapshot = this._payloadDialogDecodedSnapshot;
    if (snapshot) {
      // Structured form: diff against the open-dialog snapshot and only
      // push a bundle update when something changed, so `edited: true`
      // stays off pristine rows (which would otherwise force restore
      // through a re-encode + round-trip verify for no reason).
      const changedFields = this._collectChangedDecodedFields(snapshot);
      if (changedFields) {
        this._commitEditBundleEdit(updateCommandDecodedFields(
          this.bundle,
          target.deviceId,
          target.commandId,
          changedFields,
        ));
      }
      this._closeCommandPayloadDialog();
      return;
    }
    const normalized = normalizeCommandPayloadHex(this._payloadDialogRawDraft);
    if (!normalized) {
      this._payloadDialogError = "Enter the payload as hex bytes (an even number of hex digits; spaces are fine).";
      return;
    }
    if (normalized !== normalizeCommandPayloadHex(this._payloadDialogRawSnapshot)) {
      this._commitEditBundleEdit(updateCommandRawPayload(
        this.bundle,
        target.deviceId,
        target.commandId,
        normalized,
      ));
    }
    this._closeCommandPayloadDialog();
  };

  private _initialDecodedDrafts(decoded: BackupCommandDecodedBlock): Record<string, string> {
    const spec = DECODED_CLASS_FORM_SPECS[decoded.className];
    if (!spec) return {};
    const drafts: Record<string, string> = {};
    for (const field of spec.fields) {
      drafts[field.key] = this._fieldValueToDraft(decoded.fields[field.key], field);
    }
    return drafts;
  }

  private _fieldValueToDraft(value: unknown, field: DecodedFieldSpec): string {
    if (value == null) return "";
    if (field.numeric) return String(Number(value) || 0);
    const stringValue = String(value);
    if (field.escapedDisplay) {
      // Surface the wire `\n` / `\r` characters as their two-char
      // escape sequences so the user can see and edit the literal
      // string. `_draftToFieldValue` performs the reverse on save.
      return stringValue.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    }
    return stringValue;
  }

  private _openQuickAccessRenameDialog(kind: BackupQuickAccessKind, buttonId: number) {
    if (this.mode === "live" && kind === "favorite") return;
    if (this.entityId == null) return;
    this._editRenameDialogTarget = kind === "macro"
      ? { kind: "macro", activityId: this.entityId, buttonId }
      : { kind: "favorite", activityId: this.entityId, buttonId };
    const item = activityQuickAccessItems(this.bundle, this.entityId).find(
      (entry) => entry.kind === kind && entry.buttonId === Number(buttonId),
    );
    this._editRenameDialogDraft = item?.label || "";
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  }

  private _closeEditRenameDialog = () => {
    this._editRenameDialogOpen = false;
    this._editRenameDialogDraft = "";
    this._editRenameDialogError = "";
    this._editRenameDialogTarget = null;
  };

  // ── Delete (with cascade-aware confirm) ─────────────────────────────
  private _openDetailDeleteConfirm = () => {
    if (!this.kind || this.entityId == null) return;
    const id = Number(this.entityId);
    this._confirmDeleteTarget = this.kind === "activity"
      ? { kind: "activity", activityId: id }
      : { kind: "device", deviceId: id };
    this._confirmDeleteLabel = this._selectedEditTitle();
  };

  private _openCommandDeleteConfirm(commandId: number, label: string) {
    if (this.entityId == null) return;
    this._confirmDeleteTarget = {
      kind: "command",
      deviceId: Number(this.entityId),
      commandId: Number(commandId),
    };
    this._confirmDeleteLabel = label;
  }

  private _openQuickAccessDeleteConfirm(kind: BackupQuickAccessKind, buttonId: number, label: string) {
    if (this.entityId == null) return;
    const activityId = Number(this.entityId);
    this._confirmDeleteTarget = kind === "macro"
      ? { kind: "macro", activityId, buttonId: Number(buttonId) }
      : { kind: "favorite", activityId, buttonId: Number(buttonId) };
    this._confirmDeleteLabel = label;
  }

  private _closeDeleteConfirm = () => {
    this._confirmDeleteTarget = null;
    this._confirmDeleteLabel = "";
  };

  private _confirmDelete = () => {
    const target = this._confirmDeleteTarget;
    if (!target || !this.bundle) return;
    // Live mode: deleting the whole activity/device executes immediately on
    // the hub. The confirm dialog already gated it; hand the intent to the
    // host, which owns the hub write and the return-to-list. Row-level
    // deletes (command / favorite / macro / binding) stay pure bundle edits
    // and ride the normal Sync, in both modes.
    if (this.mode === "live" && (target.kind === "activity" || target.kind === "device")) {
      const entityId = target.kind === "activity" ? target.activityId : target.deviceId;
      this._closeDeleteConfirm();
      this.dispatchEvent(new CustomEvent("delete-request", {
        detail: { kind: target.kind, entityId },
      }));
      return;
    }
    this._commitEditBundleEdit(applyBundleDelete(this.bundle, target));
    // Deleting the entity we're inside removes its detail page — fall back
    // to the overview. Row-level deletes (command / favorite / macro) keep
    // the detail open so the user can continue trimming the list.
    if (target.kind === "activity" || target.kind === "device") {
      this._requestClose();
    }
    this._closeDeleteConfirm();
  };

  private _deleteConfirmTitle(target: BackupDeleteTarget, label: string): string {
    const name = label || "this item";
    switch (target.kind) {
      case "activity":
        return TOOLS_CARD_STRINGS.backup.deleteActivityTitle(name);
      case "device":
        return TOOLS_CARD_STRINGS.backup.deleteDeviceTitle(name);
      case "command":
        return TOOLS_CARD_STRINGS.backup.deleteCommandTitle(name);
      case "favorite":
        return TOOLS_CARD_STRINGS.backup.deleteFavoriteTitle(name);
      case "macro":
        return TOOLS_CARD_STRINGS.backup.deleteMacroTitle(name);
      case "activity_binding":
      case "device_binding":
        return TOOLS_CARD_STRINGS.backup.deleteBindingTitle(name);
      case "activity_member":
        return TOOLS_CARD_STRINGS.backup.activityRemoveDeviceTitle(name);
    }
  }

  private _openBindingDeleteConfirm(kind: BackupEditTargetKind, buttonId: number, name: string) {
    if (this.entityId == null) return;
    const entityId = Number(this.entityId);
    this._confirmDeleteTarget = kind === "activity"
      ? { kind: "activity_binding", activityId: entityId, buttonId: Number(buttonId) }
      : { kind: "device_binding", deviceId: entityId, buttonId: Number(buttonId) };
    this._confirmDeleteLabel = name;
  }

  private _renderDeleteConfirmDialog() {
    const target = this._confirmDeleteTarget;
    if (!target || !this.bundle) return nothing;
    const impact = bundleDeleteImpact(this.bundle, target);
    const hasCascade = backupDeleteHasCascade(impact);
    const S = TOOLS_CARD_STRINGS.backup;
    const isLive = this.mode === "live";
    // Live activity/device deletes hit the hub immediately; row-level deletes
    // (command/favorite/macro/binding/member) ride the next Sync. Backup-mode
    // deletes only reach the hub via a Replace restore.
    const isImmediate = isLive && (target.kind === "activity" || target.kind === "device");
    const intro = isLive
      ? (hasCascade ? S.deleteCascadeIntroLive : S.deleteSimpleBodyLive)
      : (hasCascade ? S.deleteCascadeIntro : S.deleteSimpleBody);
    const note = isLive
      ? (isImmediate ? S.deleteImmediateNote : S.deleteSyncNote)
      : S.deleteReplaceNote;
    return html`
      <div class="modal-backdrop" @click=${this._closeDeleteConfirm}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${this._deleteConfirmTitle(target, this._confirmDeleteLabel)}</div>
            <button class="dialog-close" @click=${this._closeDeleteConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="backup-drawer-sub">
              ${intro}
            </div>
            ${hasCascade
              ? html`
                  <ul class="delete-impact-list">
                    ${impact.activities > 0
                      ? html`<li><ha-icon icon="mdi:link-variant"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactActivities(impact.activities)}</span></li>`
                      : nothing}
                    ${impact.favorites > 0
                      ? html`<li><ha-icon icon="mdi:star-outline"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactFavorites(impact.favorites)}</span></li>`
                      : nothing}
                    ${impact.macroSteps > 0
                      ? html`<li><ha-icon icon="mdi:format-list-numbered"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactMacroSteps(impact.macroSteps)}</span></li>`
                      : nothing}
                    ${impact.powerSteps > 0
                      ? html`<li><ha-icon icon="mdi:power"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactPowerSteps(impact.powerSteps)}</span></li>`
                      : nothing}
                    ${impact.bindings > 0
                      ? html`<li><ha-icon icon="mdi:gesture-tap-button"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactBindings(impact.bindings)}</span></li>`
                      : nothing}
                  </ul>
                `
              : nothing}
            <div class="delete-replace-note">
              <ha-icon icon="mdi:information-outline"></ha-icon>
              <span>${note}</span>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note"></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeDeleteConfirm}>${TOOLS_CARD_STRINGS.backup.deleteCancel}</button>
              <button class="dialog-btn dialog-btn-danger" @click=${this._confirmDelete}>${TOOLS_CARD_STRINGS.backup.deleteConfirm}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Add favorite (device → command picker) ──────────────────────────
  // One entry point for everything that can land on the remote screen:
  // a device command or a macro (existing or new). The kind selector
  // swaps the dialog's fields.
  private _openAddShortcutDialog = () => {
    if (this.entityId == null || !this.bundle) return;
    const devices = bundleEditableDeviceOptions(this.bundle);
    const firstDeviceId = devices[0]?.id ?? null;
    const commands = firstDeviceId != null ? deviceCommandItems(this.bundle, firstDeviceId) : [];
    this._addShortcutKind = "command";
    this._addFavoriteDeviceId = firstDeviceId;
    this._addFavoriteCommandId = commands[0]?.commandId ?? null;
    this._addFavoriteName = commands[0]?.label ?? "";
    this._addFavoriteError = "";
    this._addShortcutActionName = "";
    this._resetMacroTarget("shortcut");
    this._addFavoriteOpen = true;
  };

  private _closeAddFavoriteDialog = () => {
    this._addFavoriteOpen = false;
    this._addFavoriteDeviceId = null;
    this._addFavoriteCommandId = null;
    this._addFavoriteName = "";
    this._addFavoriteError = "";
    this._addShortcutKind = "command";
    this._addShortcutActionName = "";
    this._addShortcutMacroMode = "new";
    this._addShortcutMacroId = null;
  };

  private _handleAddFavoriteDeviceChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._addFavoriteDeviceId = Number.isFinite(value) ? value : null;
    const commands = this._addFavoriteDeviceId != null && this.bundle
      ? deviceCommandItems(this.bundle, this._addFavoriteDeviceId)
      : [];
    this._addFavoriteCommandId = commands[0]?.commandId ?? null;
    this._addFavoriteName = commands[0]?.label ?? "";
    this._addFavoriteError = "";
  };

  private _handleAddFavoriteCommandChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._addFavoriteCommandId = Number.isFinite(value) ? value : null;
    if (this.bundle && this._addFavoriteDeviceId != null && this._addFavoriteCommandId != null) {
      const command = deviceCommandItems(this.bundle, this._addFavoriteDeviceId)
        .find((item) => item.commandId === this._addFavoriteCommandId);
      this._addFavoriteName = command?.label ?? "";
    }
    this._addFavoriteError = "";
  };

  private _handleAddFavoriteNameInput = (event: Event) => {
    this._addFavoriteName = (event.target as HTMLInputElement).value;
  };

  private _applyAddFavorite = () => {
    if (!this.bundle || this.entityId == null) return;
    if (this._addFavoriteDeviceId == null || this._addFavoriteCommandId == null) {
      this._addFavoriteError = TOOLS_CARD_STRINGS.backup.addFavoriteNoCommands;
      return;
    }
    const name = sanitizeBundleName(this.bundle, this._addFavoriteName);
    this._commitEditBundleEdit(addBundleActivityFavorite(
      this.bundle,
      Number(this.entityId),
      this._addFavoriteDeviceId,
      this._addFavoriteCommandId,
      name,
    ));
    this._closeAddFavoriteDialog();
  };

  private _applyAddShortcut = () => {
    if (!this.bundle || this.entityId == null) return;
    if (this._addShortcutKind === "command") {
      this._applyAddFavorite();
      return;
    }
    // "action" (custom macro).
    const activityId = Number(this.entityId);
    if (this._addShortcutMacroMode === "existing") {
      const existing = activityUserMacroSummaries(this.bundle, activityId)
        .find((macro) => macro.buttonId === Number(this._addShortcutMacroId));
      if (!existing) {
        this._addFavoriteError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return;
      }
      this._closeAddFavoriteDialog();
      this._openMacroEditor("activity", activityId, existing.buttonId, existing.name);
      return;
    }
    const name = sanitizeBundleName(this.bundle, this._addShortcutActionName).trim()
      || TOOLS_CARD_STRINGS.backup.newMacroName;
    const next = addActivityUserMacro(this.bundle, activityId, name);
    this._commitEditBundleEdit(next);
    this._closeAddFavoriteDialog();
    const summaries = activityUserMacroSummaries(next, activityId);
    const created = summaries[summaries.length - 1];
    if (created) this._openMacroEditor("activity", activityId, created.buttonId, created.name);
  };

  private _renderAddFavoriteDialog() {
    if (!this._addFavoriteOpen || !this.bundle) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    const kind = this._addShortcutKind;
    const devices = bundleEditableDeviceOptions(this.bundle);
    const macros = this._macroOptions();
    const commands = this._addFavoriteDeviceId != null
      ? deviceCommandItems(this.bundle, this._addFavoriteDeviceId)
      : [];
    const canAdd = kind !== "command"
      || (this._addFavoriteDeviceId != null && this._addFavoriteCommandId != null);
    const commandFields = devices.length === 0
      ? html`<div class="backup-drawer-sub">${S.addFavoriteNoDevices}</div>`
      : html`
          <div class="decoded-field">
            <label class="decoded-field-label" for="sb-add-fav-device">${S.addFavoriteDevice}</label>
            <select id="sb-add-fav-device" class="decoded-field-input" @change=${this._handleAddFavoriteDeviceChange}>
              ${devices.map((device) => html`
                <option value=${device.id} ?selected=${device.id === this._addFavoriteDeviceId}>${device.label}</option>
              `)}
            </select>
          </div>
          <div class="decoded-field">
            <label class="decoded-field-label" for="sb-add-fav-command">${S.addFavoriteCommand}</label>
            ${commands.length === 0
              ? html`<div class="quick-access-empty">${S.addFavoriteNoCommands}</div>`
              : html`
                  <select id="sb-add-fav-command" class="decoded-field-input" @change=${this._handleAddFavoriteCommandChange}>
                    ${commands.map((command) => html`
                      <option value=${command.commandId} ?selected=${command.commandId === this._addFavoriteCommandId}>${command.label}</option>
                    `)}
                  </select>
                `}
          </div>
          <div class="decoded-field">
            <label class="decoded-field-label" for="sb-add-fav-name">${S.addFavoriteName}</label>
            <input
              id="sb-add-fav-name"
              class="decoded-field-input"
              maxlength="20"
              .value=${this._addFavoriteName}
              @input=${this._handleAddFavoriteNameInput}
            />
          </div>
        `;
    const actionFields = html`
      <div class="decoded-field">
        <label class="decoded-field-label" for="sb-add-action-name">${S.addShortcutActionName}</label>
        <input
          id="sb-add-action-name"
          class="decoded-field-input"
          maxlength="20"
          .value=${this._addShortcutActionName}
          @input=${(event: Event) => {
            this._addShortcutActionName = (event.target as HTMLInputElement).value;
          }}
        />
        <div class="decoded-field-helper">${S.addShortcutActionHelper}</div>
      </div>
    `;
    const macroFields = html`
      ${macros.length
        ? html`
            <div class="decoded-field">
              <label class="decoded-field-label" for="sb-add-macro-target">${S.macroTargetLabel}</label>
              <select
                id="sb-add-macro-target"
                class="decoded-field-input"
                @change=${(event: Event) => {
                  const value = (event.target as HTMLSelectElement).value;
                  if (value === "__new__") {
                    this._addShortcutMacroMode = "new";
                    this._addShortcutMacroId = null;
                  } else {
                    this._addShortcutMacroMode = "existing";
                    this._addShortcutMacroId = Number(value);
                  }
                  this._addFavoriteError = "";
                }}
              >
                ${macros.map((macro) => html`
                  <option value=${macro.value} ?selected=${this._addShortcutMacroMode === "existing" && macro.value === this._addShortcutMacroId}>${macro.label}</option>
                `)}
                <option value="__new__" ?selected=${this._addShortcutMacroMode === "new"}>${S.macroTargetCreateNew}</option>
              </select>
            </div>
          `
        : html`<div class="quick-access-empty">${S.macroTargetNoExisting}</div>`}
      ${this._addShortcutMacroMode === "new" ? actionFields : nothing}
    `;
    return html`
      <div class="modal-backdrop" @click=${this._closeAddFavoriteDialog}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S.addShortcutTitle}</div>
            <button class="dialog-close" @click=${this._closeAddFavoriteDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="decoded-field">
              <label class="decoded-field-label" for="sb-add-shortcut-kind">${S.addShortcutKindLabel}</label>
              <select
                id="sb-add-shortcut-kind"
                class="decoded-field-input"
                @change=${(event: Event) => {
                  this._addShortcutKind = (event.target as HTMLSelectElement).value as
                    | "command" | "action";
                  if (this._addShortcutKind === "action") this._resetMacroTarget("shortcut");
                  this._addFavoriteError = "";
                }}
              >
                <option value="command" ?selected=${kind === "command"}>${S.shortcutKindCommand}</option>
                <option value="action" ?selected=${kind === "action"}>${S.shortcutKindAction}</option>
              </select>
            </div>
            ${kind === "command" ? commandFields : macroFields}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._addFavoriteError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeAddFavoriteDialog}>${S.addFavoriteCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyAddShortcut} ?disabled=${!canAdd}>${S.addFavoriteAdd}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _applyActivityRename(activityId: number, name: string) {
    if (!this.bundle) return;
    this._commitEditBundleEdit(renameBundleActivity(this.bundle, activityId, name));
  }

  private _applyDeviceRename(deviceId: number, name: string) {
    if (!this.bundle) return;
    this._commitEditBundleEdit(renameBundleDevice(this.bundle, deviceId, name));
  }

  private _entityKindCrumbLabel(kind: BackupEditTargetKind): string {
    return kind === "activity"
      ? TOOLS_CARD_STRINGS.backup.crumbActivities
      : TOOLS_CARD_STRINGS.backup.crumbDevices;
  }

  // Compact ancestor trail shown above the detail/editor title. Each crumb
  // is a tappable button that pops back to that level; the trailing "›"
  // leads the eye into the current page's big title beneath it.
  private _renderDetailCrumbs(crumbs: Array<{ label: string; onClick: () => void }>) {
    if (!crumbs.length) return nothing;
    return html`
      <div class="detail-crumbs">
        ${crumbs.map((crumb, index) => html`
          ${index > 0 ? html`<span class="detail-crumb-sep" aria-hidden="true">›</span>` : nothing}
          <button class="detail-crumb" type="button" @click=${crumb.onClick}>${crumb.label}</button>
        `)}
        <span class="detail-crumb-sep" aria-hidden="true">›</span>
      </div>
    `;
  }

  private _applyEditDetailRename() {
    const next = sanitizeBundleName(this.bundle, this._editDetailNameDraft);
    if (!next || !this.kind || this.entityId == null) return;
    if (this.kind === "activity") this._applyActivityRename(this.entityId, next);
    else this._applyDeviceRename(this.entityId, next);
    this._editDetailNameDraft = next;
  }

  private _applyEditRenameDialog = () => {
    const target = this._editRenameDialogTarget;
    if (!target || !this.bundle) return;
    // The IP dialog runs through its own validation / save path; it
    // does not share the name-sanitizer's empty-string guard because
    // an empty IP is the legitimate "no IP set" shape for the wire.
    if (target.kind === "device_ip") {
      const draft = this._editRenameDialogDraft.trim();
      if (draft && !IPV4_PATTERN.test(draft)) {
        this._editRenameDialogError = "Enter a dotted-decimal IPv4 address (e.g. 192.168.1.42), or clear the field to remove the IP.";
        return;
      }
      this._commitEditBundleEdit(updateBundleDeviceIp(this.bundle, target.deviceId, draft));
      this._closeEditRenameDialog();
      return;
    }
    const next = sanitizeBundleName(this.bundle, this._editRenameDialogDraft);
    if (!next) {
      this._editRenameDialogError = "Enter a name to continue.";
      return;
    }
    if (target.kind === "detail") {
      this._editDetailNameDraft = next;
      if (target.entityKind === "activity") this._applyActivityRename(target.entityId, next);
      else this._applyDeviceRename(target.entityId, next);
      this._closeEditRenameDialog();
      return;
    }
    if (target.kind === "hub_name") {
      this._commitEditBundleEdit(renameBundleHub(this.bundle, next));
      this._closeEditRenameDialog();
      return;
    }
    if (target.kind === "macro") {
      this._commitEditBundleEdit(renameBundleActivityMacro(this.bundle, target.activityId, target.buttonId, next));
      // If the renamed macro is the one open in the step editor, refresh its
      // title so the rename shows immediately without backing out.
      if (
        this._macroEditor &&
        this._macroEditor.scope === "activity" &&
        this._macroEditor.entityId === target.activityId &&
        this._macroEditor.buttonId === target.buttonId
      ) {
        this._macroEditor = { ...this._macroEditor, name: next };
      }
      this._closeEditRenameDialog();
      return;
    }
    if (target.kind === "command") {
      // Name only (both modes): payload edits live in the dedicated payload
      // dialog. In live mode this flows through a command_rename sync step.
      this._commitEditBundleEdit(
        renameBundleDeviceCommand(this.bundle, target.deviceId, target.commandId, next),
      );
      this._closeEditRenameDialog();
      return;
    }
    if (this.mode === "live") {
      this._closeEditRenameDialog();
      return;
    }
    this._commitEditBundleEdit(renameBundleActivityFavorite(this.bundle, target.activityId, target.buttonId, next));
    this._closeEditRenameDialog();
  };

  private _moveActivityQuickAccessItem(index: number, delta: -1 | 1) {
    if (!this.bundle || this.entityId == null) return;
    const items = activityQuickAccessItems(this.bundle, this.entityId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || index >= items.length || nextIndex >= items.length) return;
    const nextItems = [...items];
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(nextIndex, 0, moved);
    this._commitEditBundleEdit(reorderBundleActivityQuickAccess(
      this.bundle,
      this.entityId,
      nextItems.map((item) => ({ kind: item.kind, buttonId: item.buttonId })),
    ));
  }

  private _moveQuickAccessByIdentity(kind: BackupQuickAccessKind, buttonId: number, delta: -1 | 1) {
    if (!this.bundle || this.entityId == null) return;
    const items = activityQuickAccessItems(this.bundle, this.entityId);
    const index = items.findIndex((item) => item.kind === kind && item.buttonId === Number(buttonId));
    if (index === -1) return;
    this._moveActivityQuickAccessItem(index, delta);
  }

  private _handleActivityQuickAccessSort = (event: Event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (!this.bundle || this.entityId == null) return;
    const sortableEvent = event as CustomEvent<{ oldIndex?: number; newIndex?: number }>;
    const oldIndex = Number(sortableEvent.detail?.oldIndex);
    const newIndex = Number(sortableEvent.detail?.newIndex);
    if (!Number.isFinite(oldIndex) || !Number.isFinite(newIndex) || oldIndex === newIndex) return;
    const items = activityQuickAccessItems(this.bundle, this.entityId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex >= items.length || newIndex >= items.length) return;
    const nextItems = [...items];
    const [moved] = nextItems.splice(oldIndex, 1);
    if (!moved) return;
    nextItems.splice(newIndex, 0, moved);
    this._commitEditBundleEdit(reorderBundleActivityQuickAccess(
      this.bundle,
      this.entityId,
      nextItems.map((item) => ({ kind: item.kind, buttonId: item.buttonId })),
    ));
  };

  // ── Button bindings (add / edit picker) ─────────────────────────────
  private _bindingCommandDeviceOptions(): Array<{ value: number; label: string }> {
    if (!this.bundle) return [];
    return bundleEditableDeviceOptions(this.bundle)
      .map((device) => ({ value: device.id, label: device.label }));
  }

  private _bindingTargetKindFor(
    deviceId: number | null | undefined,
  ): ActivityBindingTargetKind {
    if (!this.bundle || this.entityId == null) return "command";
    const dId = Number(deviceId || 0);
    if (dId === Number(this.entityId)) return "action";
    return "command";
  }

  private _macroName(buttonId: number | null | undefined): string {
    if (!this.bundle || this.entityId == null) return "";
    const bId = Number(buttonId || 0);
    return activityUserMacroSummaries(this.bundle, Number(this.entityId))
      .find((macro) => macro.buttonId === bId)?.name ?? "";
  }

  private _macroOptions(): Array<{ value: number; label: string }> {
    if (!this.bundle || this.entityId == null) return [];
    return activityUserMacroSummaries(this.bundle, Number(this.entityId))
      .map((macro) => ({ value: macro.buttonId, label: macro.name }));
  }

  private _resetMacroTarget(prefix: "shortcut" | "binding" | "bindingLp") {
    const firstMacro = this._macroOptions()[0] ?? null;
    const mode: MacroTargetMode = firstMacro ? "existing" : "new";
    if (prefix === "shortcut") {
      this._addShortcutMacroMode = mode;
      this._addShortcutMacroId = firstMacro?.value ?? null;
      return;
    }
    if (prefix === "binding") {
      this._bindingMacroMode = mode;
      this._bindingMacroId = firstMacro?.value ?? null;
      return;
    }
    this._bindingLpMacroMode = mode;
    this._bindingLpMacroId = firstMacro?.value ?? null;
  }

  private _captureCurrentScrollPosition() {
    const root = this.renderRoot as ParentNode | undefined;
    const scrollEl = root?.querySelector<HTMLElement>(".detail-scroll");
    if (!scrollEl) return;
    if (this._bindingsView) this._bindingsScrollTop = scrollEl.scrollTop;
    else this._detailScrollTop = scrollEl.scrollTop;
  }

  private _restoreMainScroll() {
    void this.updateComplete.then(() => {
      const root = this.renderRoot as ParentNode | undefined;
      const scrollEl = root?.querySelector<HTMLElement>(".detail-scroll");
      if (scrollEl) scrollEl.scrollTop = this._detailScrollTop;
    });
  }

  private _restoreBindingsScroll() {
    void this.updateComplete.then(() => {
      const root = this.renderRoot as ParentNode | undefined;
      const scrollEl = root?.querySelector<HTMLElement>(".detail-scroll");
      if (scrollEl) scrollEl.scrollTop = this._bindingsScrollTop;
    });
  }

  // Command options for a chosen target: the activity's own macros when the
  // target is the activity itself, otherwise the target device's commands.
  private _bindingCommandOptions(targetDeviceId: number | null): Array<{ value: number; label: string }> {
    if (targetDeviceId == null || !this.bundle) return [];
    if (this._bindingScope === "activity" && this.entityId != null && targetDeviceId === Number(this.entityId)) {
      return activityUserMacroSummaries(this.bundle, Number(this.entityId))
        .map((macro) => ({ value: macro.buttonId, label: macro.name }));
    }
    return deviceCommandItems(this.bundle, targetDeviceId).map((command) => ({ value: command.commandId, label: command.label }));
  }

  private _openAddBindingDialog(kind: BackupEditTargetKind) {
    if (this.entityId == null || !this.bundle) return;
    const entityId = Number(this.entityId);
    const unbound = kind === "activity"
      ? unboundButtonsForActivity(this.bundle, entityId)
      : unboundButtonsForDevice(this.bundle, entityId);
    if (!unbound.length) return;
    this._bindingScope = kind;
    this._bindingEditButtonId = null;
    this._bindingButtonId = unbound[0].code;
    this._bindingTargetKind = "command";
    this._bindingActionName = "";
    this._resetMacroTarget("binding");
    this._bindingLpTargetKind = "command";
    this._bindingLpActionName = "";
    this._resetMacroTarget("bindingLp");
    if (kind === "activity") {
      const devices = this._bindingCommandDeviceOptions();
      this._bindingDeviceId = devices[0]?.value ?? null;
    } else {
      this._bindingDeviceId = entityId;
    }
    const commandDeviceId = kind === "activity" ? this._bindingDeviceId : entityId;
    const commands = commandDeviceId != null ? deviceCommandItems(this.bundle, commandDeviceId) : [];
    this._bindingCommandId = commands[0]?.commandId ?? null;
    this._bindingLongPressEnabled = false;
    this._bindingLpDeviceId = this._bindingDeviceId;
    this._bindingLpCommandId = this._bindingCommandId;
    this._bindingError = "";
    this._bindingDialogOpen = true;
  }

  private _openEditBindingDialog(kind: BackupEditTargetKind, buttonId: number) {
    if (this.entityId == null || !this.bundle) return;
    const entityId = Number(this.entityId);
    const items = kind === "activity"
      ? activityButtonBindingItems(this.bundle, entityId)
      : deviceButtonBindingItems(this.bundle, entityId);
    const item = items.find((entry) => entry.buttonId === Number(buttonId));
    if (!item) return;
    this._bindingScope = kind;
    this._bindingEditButtonId = item.buttonId;
    this._bindingButtonId = item.buttonId;
    this._bindingDeviceId = kind === "activity" ? (item.deviceId ?? null) : entityId;
    this._bindingCommandId = item.commandId;
    this._bindingTargetKind = kind === "activity"
      ? this._bindingTargetKindFor(item.deviceId)
      : "command";
    this._bindingActionName = this._bindingTargetKind === "action"
      ? this._macroName(item.commandId)
      : "";
    this._bindingMacroMode = this._bindingTargetKind === "action" ? "existing" : "new";
    this._bindingMacroId = this._bindingTargetKind === "action" ? item.commandId : null;
    this._bindingLongPressEnabled = Boolean(item.longPress);
    this._bindingLpDeviceId = kind === "activity"
      ? (item.longPress?.deviceId ?? item.deviceId ?? null)
      : entityId;
    this._bindingLpCommandId = item.longPress?.commandId ?? null;
    this._bindingLpTargetKind = kind === "activity"
      ? this._bindingTargetKindFor(this._bindingLpDeviceId)
      : "command";
    this._bindingLpActionName = this._bindingLpTargetKind === "action"
      ? this._macroName(this._bindingLpCommandId)
      : "";
    this._bindingLpMacroMode = this._bindingLpTargetKind === "action" ? "existing" : "new";
    this._bindingLpMacroId = this._bindingLpTargetKind === "action" ? this._bindingLpCommandId : null;
    this._bindingError = "";
    this._bindingDialogOpen = true;
  }

  private _closeBindingDialog = () => {
    this._bindingDialogOpen = false;
    this._bindingEditButtonId = null;
    this._bindingButtonId = null;
    this._bindingDeviceId = null;
    this._bindingCommandId = null;
    this._bindingLongPressEnabled = false;
    this._bindingLpDeviceId = null;
    this._bindingLpCommandId = null;
    this._bindingTargetKind = "command";
    this._bindingActionName = "";
    this._bindingMacroMode = "new";
    this._bindingMacroId = null;
    this._bindingLpTargetKind = "command";
    this._bindingLpMacroMode = "new";
    this._bindingLpMacroId = null;
    this._bindingLpActionName = "";
    this._bindingError = "";
  };

  private _handleBindingButtonChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._bindingButtonId = Number.isFinite(value) ? value : null;
  };

  private _handleBindingDeviceChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._bindingDeviceId = Number.isFinite(value) ? value : null;
    this._bindingCommandId = this._bindingCommandOptions(this._bindingDeviceId)[0]?.value ?? null;
  };

  private _handleBindingCommandChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._bindingCommandId = Number.isFinite(value) ? value : null;
  };

  private _handleBindingTargetKindChange = (event: Event) => {
    const kind = (event.target as HTMLSelectElement).value as ActivityBindingTargetKind;
    this._bindingTargetKind = kind;
    this._bindingError = "";
    if (kind === "command") {
      const devices = this._bindingCommandDeviceOptions();
      if (!devices.some((device) => device.value === this._bindingDeviceId)) {
        this._bindingDeviceId = devices[0]?.value ?? null;
      }
      this._bindingCommandId = this._bindingCommandOptions(this._bindingDeviceId)[0]?.value ?? null;
      return;
    }
    // "action"
    this._resetMacroTarget("binding");
    this._bindingActionName ||= this._macroName(this._bindingCommandId);
  };

  private _handleBindingActionNameInput = (event: Event) => {
    this._bindingActionName = (event.target as HTMLInputElement).value;
    this._bindingError = "";
  };

  private _handleBindingMacroTargetChange = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "__new__") {
      this._bindingMacroMode = "new";
      this._bindingMacroId = null;
    } else {
      this._bindingMacroMode = "existing";
      this._bindingMacroId = Number(value);
    }
    this._bindingError = "";
  };

  private _handleBindingLpTargetKindChange = (event: Event) => {
    const kind = (event.target as HTMLSelectElement).value as ActivityBindingTargetKind;
    this._bindingLpTargetKind = kind;
    this._bindingError = "";
    if (kind === "command") {
      const devices = this._bindingCommandDeviceOptions();
      if (!devices.some((device) => device.value === this._bindingLpDeviceId)) {
        this._bindingLpDeviceId = devices[0]?.value ?? null;
      }
      this._bindingLpCommandId = this._bindingCommandOptions(this._bindingLpDeviceId)[0]?.value ?? null;
      return;
    }
    // "action"
    this._resetMacroTarget("bindingLp");
    this._bindingLpActionName ||= this._macroName(this._bindingLpCommandId);
  };

  private _handleBindingLpActionNameInput = (event: Event) => {
    this._bindingLpActionName = (event.target as HTMLInputElement).value;
    this._bindingError = "";
  };

  private _handleBindingLpMacroTargetChange = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "__new__") {
      this._bindingLpMacroMode = "new";
      this._bindingLpMacroId = null;
    } else {
      this._bindingLpMacroMode = "existing";
      this._bindingLpMacroId = Number(value);
    }
    this._bindingError = "";
  };

  private _handleBindingLongPressToggle = (event: Event) => {
    const enabled = Boolean((event.target as { checked?: boolean }).checked);
    this._bindingLongPressEnabled = enabled;
    if (!enabled || !this.bundle) return;
    this._bindingLpTargetKind = "command";
    if (this._bindingScope === "activity") {
      const devices = this._bindingCommandDeviceOptions();
      if (!devices.some((device) => device.value === this._bindingLpDeviceId)) {
        this._bindingLpDeviceId = devices[0]?.value ?? null;
      }
    } else if (this._bindingLpDeviceId == null) {
      this._bindingLpDeviceId = Number(this.entityId);
    }
    const commands = this._bindingCommandOptions(this._bindingLpDeviceId);
    if (!commands.some((command) => command.value === this._bindingLpCommandId)) {
      this._bindingLpCommandId = commands[0]?.value ?? null;
    }
  };

  private _handleBindingLpDeviceChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._bindingLpDeviceId = Number.isFinite(value) ? value : null;
    this._bindingLpCommandId = this._bindingCommandOptions(this._bindingLpDeviceId)[0]?.value ?? null;
  };

  private _handleBindingLpCommandChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._bindingLpCommandId = Number.isFinite(value) ? value : null;
  };

  private _resolveMacroTarget(
    bundle: BackupBundlePayload,
    activityId: number,
    mode: MacroTargetMode,
    macroId: number | null,
    rawName: string,
  ): { bundle: BackupBundlePayload; macroId: number; name: string; created: boolean } | null {
    if (mode === "existing") {
      const existing = activityUserMacroSummaries(bundle, activityId)
        .find((macro) => macro.buttonId === Number(macroId));
      return existing
        ? { bundle, macroId: existing.buttonId, name: existing.name, created: false }
        : null;
    }
    const name = sanitizeBundleName(bundle, rawName).trim()
      || TOOLS_CARD_STRINGS.backup.newMacroName;
    const next = addActivityUserMacro(bundle, activityId, name);
    const summaries = activityUserMacroSummaries(next, activityId);
    const created = summaries[summaries.length - 1];
    return created
      ? { bundle: next, macroId: created.buttonId, name: created.name, created: true }
      : null;
  }

  private _resolveActivityLongPressTarget(
    bundle: BackupBundlePayload,
    activityId: number,
  ): {
    bundle: BackupBundlePayload;
    longPress: { deviceId: number; commandId: number } | null;
    createdMacro: { buttonId: number; name: string } | null;
  } | null {
    if (!this._bindingLongPressEnabled) {
      return { bundle, longPress: null, createdMacro: null };
    }
    if (this._bindingLpTargetKind === "command") {
      if (!this._bindingLpDeviceId || !this._bindingLpCommandId) {
        this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return null;
      }
      return {
        bundle,
        longPress: {
          deviceId: Number(this._bindingLpDeviceId),
          commandId: Number(this._bindingLpCommandId),
        },
        createdMacro: null,
      };
    }
    // "action"
    const resolved = this._resolveMacroTarget(
      bundle,
      activityId,
      this._bindingLpMacroMode,
      this._bindingLpMacroId,
      this._bindingLpActionName,
    );
    if (!resolved) {
      this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
      return null;
    }
    return {
      bundle: resolved.bundle,
      longPress: { deviceId: activityId, commandId: resolved.macroId },
      createdMacro: resolved.created ? { buttonId: resolved.macroId, name: resolved.name } : null,
    };
  }

  private _applyBinding = () => {
    if (!this.bundle || this.entityId == null) return;
    const buttonId = Number(this._bindingButtonId);
    const entityId = Number(this.entityId);
    if (!buttonId) {
      this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
      return;
    }
    if (this._bindingScope === "activity") {
      const activityId = entityId;
      let next = this.bundle;
      let macroToOpen: { buttonId: number; name: string } | null = null;
      const longPressTarget = this._resolveActivityLongPressTarget(next, activityId);
      if (!longPressTarget) return;
      next = longPressTarget.bundle;
      macroToOpen = longPressTarget.createdMacro;
      const longPress = longPressTarget.longPress;
      if (this._bindingTargetKind === "command") {
        const commandId = Number(this._bindingCommandId);
        if (!commandId || !this._bindingDeviceId) {
          this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
          return;
        }
        this._commitEditBundleEdit(upsertActivityButtonBinding(next, activityId, {
          buttonId,
          deviceId: Number(this._bindingDeviceId),
          commandId,
          longPress,
        }));
        this._closeBindingDialog();
        if (macroToOpen) this._openMacroEditor("activity", activityId, macroToOpen.buttonId, macroToOpen.name);
        return;
      }
      // "action"
      const resolved = this._resolveMacroTarget(
        next,
        activityId,
        this._bindingMacroMode,
        this._bindingMacroId,
        this._bindingActionName,
      );
      if (!resolved) {
        this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return;
      }
      next = upsertActivityButtonBinding(resolved.bundle, activityId, {
        buttonId,
        deviceId: activityId,
        commandId: resolved.macroId,
        longPress,
      });
      this._commitEditBundleEdit(next);
      this._closeBindingDialog();
      if (resolved.created) macroToOpen = { buttonId: resolved.macroId, name: resolved.name };
      if (macroToOpen) this._openMacroEditor("activity", activityId, macroToOpen.buttonId, macroToOpen.name);
    } else {
      const commandId = Number(this._bindingCommandId);
      if (!commandId) {
        this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return;
      }
      const longPressCommandId = this._bindingLongPressEnabled && this._bindingLpCommandId
        ? Number(this._bindingLpCommandId)
        : null;
      this._commitEditBundleEdit(upsertDeviceButtonBinding(this.bundle, entityId, {
        buttonId,
        commandId,
        longPressCommandId,
      }));
      this._closeBindingDialog();
    }
  };

  private _renderBindingSelect(params: {
    id: string;
    label: string;
    value: number | null;
    options: Array<{ value: number; label: string }>;
    onChange: (event: Event) => void;
    emptyText?: string;
  }) {
    return html`
      <div class="decoded-field">
        <label class="decoded-field-label" for=${params.id}>${params.label}</label>
        ${params.options.length === 0
          ? html`<div class="quick-access-empty">${params.emptyText ?? ""}</div>`
          : html`
              <select id=${params.id} class="decoded-field-input" @change=${params.onChange}>
                ${params.options.map((option) => html`
                  <option value=${option.value} ?selected=${option.value === params.value}>${option.label}</option>
                `)}
              </select>
            `}
      </div>
    `;
  }

  private _renderMacroTargetFields(params: {
    idPrefix: string;
    mode: MacroTargetMode;
    macroId: number | null;
    name: string;
    onMacroChange: (event: Event) => void;
    onNameInput: (event: Event) => void;
  }) {
    const S = TOOLS_CARD_STRINGS.backup;
    const macros = this._macroOptions();
    return html`
      ${macros.length
        ? html`
            <div class="decoded-field">
              <label class="decoded-field-label" for=${`${params.idPrefix}-macro-target`}>${S.macroTargetLabel}</label>
              <select
                id=${`${params.idPrefix}-macro-target`}
                class="decoded-field-input"
                @change=${params.onMacroChange}
              >
                ${macros.map((macro) => html`
                  <option value=${macro.value} ?selected=${params.mode === "existing" && macro.value === params.macroId}>${macro.label}</option>
                `)}
                <option value="__new__" ?selected=${params.mode === "new"}>${S.macroTargetCreateNew}</option>
              </select>
            </div>
          `
        : html`<div class="quick-access-empty">${S.macroTargetNoExisting}</div>`}
      ${params.mode === "new"
        ? html`
            <div class="decoded-field">
              <label class="decoded-field-label" for=${`${params.idPrefix}-macro-name`}>${S.addShortcutActionName}</label>
              <input
                id=${`${params.idPrefix}-macro-name`}
                class="decoded-field-input"
                maxlength="20"
                .value=${params.name}
                @input=${params.onNameInput}
              />
              <div class="decoded-field-helper">${S.addShortcutActionHelper}</div>
            </div>
          `
        : nothing}
    `;
  }

  private _renderBindingDialog() {
    if (!this._bindingDialogOpen || !this.bundle || this.entityId == null) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    const scope = this._bindingScope;
    const entityId = Number(this.entityId);
    const isEdit = this._bindingEditButtonId != null;
    const isActivity = scope === "activity";
    const targetKind = isActivity ? this._bindingTargetKind : "command";
    const lpTargetKind = isActivity ? this._bindingLpTargetKind : "command";
    const unbound: ButtonCatalogEntry[] = scope === "activity"
      ? unboundButtonsForActivity(this.bundle, entityId)
      : unboundButtonsForDevice(this.bundle, entityId);
    const commandDeviceOptions = this._bindingCommandDeviceOptions();
    const commandDeviceId = scope === "activity" && targetKind === "command" ? this._bindingDeviceId : entityId;
    const commandOptions = this._bindingCommandOptions(commandDeviceId);
    const lpDeviceId = scope === "activity" && lpTargetKind === "command" ? this._bindingLpDeviceId : entityId;
    const lpCommandOptions = this._bindingCommandOptions(lpDeviceId);
    const canSave = this._bindingButtonId != null && (
      scope === "device"
        ? this._bindingCommandId != null
        : targetKind === "command"
          ? this._bindingDeviceId != null && this._bindingCommandId != null
          : true
    );
    const title = isEdit
      ? S.bindingDialogEditTitle(buttonName(Number(this._bindingButtonId)))
      : S.bindingDialogAddTitle;
    const commandFields = html`
      ${scope === "activity"
        ? this._renderBindingSelect({
            id: "sb-binding-device",
            label: S.bindingTargetDevice,
            value: this._bindingDeviceId,
            options: commandDeviceOptions,
            onChange: this._handleBindingDeviceChange,
            emptyText: S.bindingNoDevices,
          })
        : nothing}
      ${this._renderBindingSelect({
        id: "sb-binding-command",
        label: S.bindingCommand,
        value: this._bindingCommandId,
        options: commandOptions,
        onChange: this._handleBindingCommandChange,
        emptyText: S.bindingNoCommands,
      })}
    `;
    const actionFields = this._renderMacroTargetFields({
      idPrefix: "sb-binding",
      mode: this._bindingMacroMode,
      macroId: this._bindingMacroId,
      name: this._bindingActionName,
      onMacroChange: this._handleBindingMacroTargetChange,
      onNameInput: this._handleBindingActionNameInput,
    });
    const lpCommandFields = html`
      ${scope === "activity"
        ? this._renderBindingSelect({
            id: "sb-binding-lp-device",
            label: S.bindingLongPressDevice,
            value: this._bindingLpDeviceId,
            options: commandDeviceOptions,
            onChange: this._handleBindingLpDeviceChange,
            emptyText: S.bindingNoDevices,
          })
        : nothing}
      ${this._renderBindingSelect({
        id: "sb-binding-lp-command",
        label: S.bindingLongPressCommand,
        value: this._bindingLpCommandId,
        options: lpCommandOptions,
        onChange: this._handleBindingLpCommandChange,
        emptyText: S.bindingNoCommands,
      })}
    `;
    const lpActionFields = this._renderMacroTargetFields({
      idPrefix: "sb-binding-lp",
      mode: this._bindingLpMacroMode,
      macroId: this._bindingLpMacroId,
      name: this._bindingLpActionName,
      onMacroChange: this._handleBindingLpMacroTargetChange,
      onNameInput: this._handleBindingLpActionNameInput,
    });
    return html`
      <div class="modal-backdrop" @click=${this._closeBindingDialog}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${title}</div>
            <button class="dialog-close" @click=${this._closeBindingDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${isEdit
              ? html`
                  <div class="decoded-field">
                    <span class="decoded-field-label">${S.bindingButton}</span>
                    <div class="binding-static-field">${buttonName(Number(this._bindingButtonId))}</div>
                  </div>
                `
              : this._renderBindingSelect({
                  id: "sb-binding-button",
                  label: S.bindingButton,
                  value: this._bindingButtonId,
                  options: unbound.map((entry) => ({ value: entry.code, label: entry.name })),
                  onChange: this._handleBindingButtonChange,
                  emptyText: S.bindingNoButtons,
                })}
            ${isActivity
              ? html`
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-binding-kind">${S.addShortcutKindLabel}</label>
                    <select
                      id="sb-binding-kind"
                      class="decoded-field-input"
                      @change=${this._handleBindingTargetKindChange}
                    >
                      <option value="command" ?selected=${targetKind === "command"}>${S.shortcutKindCommand}</option>
                      <option value="action" ?selected=${targetKind === "action"}>${S.shortcutKindAction}</option>
                    </select>
                  </div>
                `
              : nothing}
            ${targetKind === "command" ? commandFields : actionFields}
            <div class="binding-toggle-row">
              <span class="decoded-field-label">${S.bindingEnableLongPress}</span>
              <ha-switch
                .checked=${this._bindingLongPressEnabled}
                @change=${this._handleBindingLongPressToggle}
              ></ha-switch>
            </div>
            ${this._bindingLongPressEnabled
              ? html`
                  ${isActivity
                    ? html`
                        <div class="decoded-field">
                          <label class="decoded-field-label" for="sb-binding-lp-kind">${S.addShortcutKindLabel}</label>
                          <select
                            id="sb-binding-lp-kind"
                            class="decoded-field-input"
                            @change=${this._handleBindingLpTargetKindChange}
                          >
                            <option value="command" ?selected=${lpTargetKind === "command"}>${S.shortcutKindCommand}</option>
                            <option value="action" ?selected=${lpTargetKind === "action"}>${S.shortcutKindAction}</option>
                          </select>
                        </div>
                      `
                    : nothing}
                  ${lpTargetKind === "command" ? lpCommandFields : lpActionFields}
                `
              : nothing}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._bindingError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeBindingDialog}>${S.bindingCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyBinding} ?disabled=${!canSave}>
                ${isEdit ? S.bindingSave : S.bindingAdd}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Macro step editor (device macros + activity user macros) ────────
  private _openMacroEditor(scope: BackupEditTargetKind, entityId: number, buttonId: number, name: string) {
    this._captureCurrentScrollPosition();
    this._macroEditor = { scope, entityId: Number(entityId), buttonId: Number(buttonId), name };
  }

  private _closeMacroEditor = () => {
    this._macroEditor = null;
    this._closeStepDialog();
    if (this._bindingsView) this._restoreBindingsScroll();
    else this._restoreMainScroll();
  };

  // Rename the macro currently open in the step editor. Reuses the shared
  // rename dialog (kind "macro"); applying it also refreshes the editor's
  // own title via the macro branch in _applyEditRenameDialog.
  private _openMacroNameRenameDialog = () => {
    const editor = this._macroEditor;
    if (!editor || editor.scope !== "activity" || POWER_MACRO_BUTTON_IDS.has(editor.buttonId)) return;
    this._editRenameDialogTarget = { kind: "macro", activityId: editor.entityId, buttonId: editor.buttonId };
    this._editRenameDialogDraft = editor.name;
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  };

  // Macro time bytes are in 0.5-second units (a hold byte of 4 = 2.0s),
  // matching the Sofabaton app. 0 = a single click / no wait.
  private _byteToSeconds(byteValue: number): string {
    return (Number(byteValue) * 0.5).toFixed(1).replace(/\.0$/, "");
  }

  private _secondsToByte(value: string): number {
    const seconds = parseFloat(String(value));
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.min(255, Math.max(0, Math.round(seconds * 2)));
  }

  /** Snap a typed seconds value to the hub's 0.5s grid (returns the string form). */
  private _snapHalfSeconds(value: string): string {
    return this._byteToSeconds(this._secondsToByte(value));
  }

  private _currentMacroStepItems(): BackupMacroStepItem[] {
    const editor = this._macroEditor;
    if (!editor || !this.bundle) return [];
    return editor.scope === "device"
      ? deviceMacroStepItems(this.bundle, editor.entityId, editor.buttonId)
      : activityMacroStepItems(this.bundle, editor.entityId, editor.buttonId);
  }

  private _openAddStepDialog = () => {
    const editor = this._macroEditor;
    if (!editor || !this.bundle) return;
    this._stepDialogEditIndex = null;
    this._stepKind = "command";
    this._stepDeviceId = editor.scope === "activity"
      ? (bundleEditableDeviceOptions(this.bundle)[0]?.id ?? null)
      : editor.entityId;
    const commandDeviceId = editor.scope === "activity" ? this._stepDeviceId : editor.entityId;
    const commands = commandDeviceId != null ? deviceCommandItems(this.bundle, commandDeviceId) : [];
    this._stepCommandId = commands[0]?.commandId ?? null;
    this._stepHoldSeconds = "0";
    this._stepError = "";
    this._stepDialogOpen = true;
  };

  private _openEditStepDialog(item: BackupMacroStepItem) {
    const editor = this._macroEditor;
    if (!editor) return;
    this._stepDialogEditIndex = item.index;
    this._stepError = "";
    this._stepDialogOpen = true;
    // An input ref: pick the device's command that drives the input (or none).
    if (item.kind === "input") {
      this._stepKind = "input";
      this._stepDeviceId = item.deviceId ?? null;
      this._stepCommandId = item.commandId ?? null;
      return;
    }
    this._stepKind = "command";
    this._stepDeviceId = editor.scope === "activity" ? (item.deviceId ?? null) : editor.entityId;
    this._stepCommandId = item.commandId ?? null;
    this._stepHoldSeconds = this._byteToSeconds(item.hold);
  }

  private _closeStepDialog = () => {
    this._stepDialogOpen = false;
    this._stepDialogEditIndex = null;
    this._stepKind = "command";
    this._stepDeviceId = null;
    this._stepCommandId = null;
    this._stepHoldSeconds = "0";
    this._stepError = "";
  };

  private _handleStepDeviceChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._stepDeviceId = Number.isFinite(value) ? value : null;
    const commands = this._stepDeviceId != null && this.bundle
      ? deviceCommandItems(this.bundle, this._stepDeviceId)
      : [];
    this._stepCommandId = commands[0]?.commandId ?? null;
  };

  private _handleStepCommandChange = (event: Event) => {
    const raw = (event.target as HTMLSelectElement).value;
    this._stepCommandId = raw === "" ? null : Number(raw);
  };

  private _handleStepHoldInput = (event: Event) => {
    this._stepHoldSeconds = (event.target as HTMLInputElement).value;
  };

  // Snap the dialog's hold field to the 0.5s grid when the user commits it
  // (on blur / Enter), so the field can't keep an off-grid value like 0.3.
  private _handleStepHoldChange = (event: Event) => {
    this._stepHoldSeconds = this._snapHalfSeconds((event.target as HTMLInputElement).value);
  };

  // Inline per-row wait edit: the attached delay travels with its command.
  private _handleStepWaitChange = (item: BackupMacroStepItem, event: Event) => {
    const editor = this._macroEditor;
    if (!editor || !this.bundle) return;
    const input = event.target as HTMLInputElement;
    const waitByte = this._secondsToByte(input.value);
    // Reflect the snapped 0.5s value in the field immediately. A re-render
    // alone can't fix it when the typed value rounds to the current byte:
    // the bound value is unchanged, so Lit leaves the stray text in place.
    input.value = this._byteToSeconds(waitByte);
    const next = editor.scope === "device"
      ? setDeviceMacroStepWait(this.bundle, editor.entityId, editor.buttonId, item.index, waitByte)
      : setActivityMacroStepWait(this.bundle, editor.entityId, editor.buttonId, item.index, waitByte);
    this._commitEditBundleEdit(next);
  };

  private _applyStep = () => {
    const editor = this._macroEditor;
    if (!editor || !this.bundle) return;
    const timeByte = this._secondsToByte(this._stepHoldSeconds);
    const editIndex = this._stepDialogEditIndex;
    const isDevice = editor.scope === "device";
    // Editing an activity power-macro input ref: set (or clear) the input.
    if (this._stepKind === "input") {
      const deviceId = Number(this._stepDeviceId);
      if (deviceId > 0) {
        const next = this._stepCommandId == null
          ? clearActivityDeviceInput(this.bundle, editor.entityId, deviceId)
          : setActivityDeviceInput(this.bundle, editor.entityId, deviceId, Number(this._stepCommandId));
        this._commitEditBundleEdit(next);
      }
      this._closeStepDialog();
      return;
    }
    const commandId = Number(this._stepCommandId);
    if (!commandId || (!isDevice && !this._stepDeviceId)) {
      this._stepError = TOOLS_CARD_STRINGS.backup.stepNoCommands;
      return;
    }
    const deviceId = Number(this._stepDeviceId);
    let next: BackupBundlePayload;
    if (editIndex === null) {
      next = isDevice
        ? addDeviceMacroCommandStep(this.bundle, editor.entityId, editor.buttonId, commandId, timeByte)
        : addActivityMacroCommandStep(this.bundle, editor.entityId, editor.buttonId, deviceId, commandId, timeByte);
    } else {
      next = isDevice
        ? updateDeviceMacroStep(this.bundle, editor.entityId, editor.buttonId, editIndex, { commandId, hold: timeByte })
        : updateActivityMacroStep(this.bundle, editor.entityId, editor.buttonId, editIndex, { deviceId, commandId, hold: timeByte });
    }
    this._commitEditBundleEdit(next);
    this._closeStepDialog();
  };

  private _removeStep(index: number) {
    const editor = this._macroEditor;
    if (!editor || !this.bundle) return;
    const next = editor.scope === "device"
      ? removeDeviceMacroStep(this.bundle, editor.entityId, editor.buttonId, index)
      : removeActivityMacroStep(this.bundle, editor.entityId, editor.buttonId, index);
    this._commitEditBundleEdit(next);
  }

  private _handleStepReorder = (event: Event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    const editor = this._macroEditor;
    if (!editor || !this.bundle) return;
    const sortableEvent = event as CustomEvent<{ oldIndex?: number; newIndex?: number }>;
    const oldIndex = Number(sortableEvent.detail?.oldIndex);
    const newIndex = Number(sortableEvent.detail?.newIndex);
    const items = this._currentMacroStepItems();
    if (!Number.isFinite(oldIndex) || !Number.isFinite(newIndex) || oldIndex === newIndex) return;
    if (oldIndex < 0 || newIndex < 0 || oldIndex >= items.length || newIndex >= items.length) return;
    const order = items.map((_, index) => index);
    const [moved] = order.splice(oldIndex, 1);
    order.splice(newIndex, 0, moved);
    const next = editor.scope === "device"
      ? reorderDeviceMacroSteps(this.bundle, editor.entityId, editor.buttonId, order)
      : reorderActivityMacroSteps(this.bundle, editor.entityId, editor.buttonId, order);
    this._commitEditBundleEdit(next);
  };

  private _renderMacroStepEditorView(editor: { scope: BackupEditTargetKind; entityId: number; buttonId: number; name: string }) {
    const items = this._currentMacroStepItems();
    // User macros (activity-bound) can be renamed right here so a freshly
    // created one can be named without backing out. Power On/Off slots keep
    // their fixed names, so no pencil for those.
    const canRename = editor.scope === "activity" && !POWER_MACRO_BUTTON_IDS.has(editor.buttonId);
    const sortable = this._haSortableReady && items.length > 1;
    const renderRows = () => items.map((item) => this._renderMacroStepRow(item, sortable));
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._closeMacroEditor}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title-stack">
                  ${this._renderDetailCrumbs([
                    { label: this._entityKindCrumbLabel(editor.scope), onClick: this._requestClose },
                    { label: this._selectedEditTitle(), onClick: this._closeMacroEditor },
                  ])}
                  <div class="detail-title">${editor.name}</div>
                </div>
                ${this._renderDirtyChip()}
                ${canRename
                  ? html`
                      <div class="detail-title-actions">
                        <button
                          class="icon-btn"
                          @click=${this._openMacroNameRenameDialog}
                          aria-label=${TOOLS_CARD_STRINGS.backup.renameMacroAria}
                        >
                          <ha-icon icon="mdi:pencil"></ha-icon>
                        </button>
                      </div>
                    `
                  : nothing}
              </div>
            </div>
          </div>
          <div class="detail-scroll">
            <div class="quick-access-section">
              <div class="quick-access-head">
                <div class="quick-access-head-main">
                  <div class="quick-access-title">Steps</div>
                  <div class="quick-access-sub">
                    ${this._haSortableReady
                      ? "Drag to reorder. Each step plays a command; set the wait that follows it on the right."
                      : "Each step plays a command; set the wait that follows it on the right."}
                  </div>
                </div>
                <button class="quick-access-add-btn" @click=${this._openAddStepDialog}>
                  <ha-icon icon="mdi:plus"></ha-icon>
                  <span>${TOOLS_CARD_STRINGS.backup.addStep}</span>
                </button>
              </div>
              ${items.length
                ? html`
                    <div class="quick-access-list">
                      ${sortable
                        ? html`
                            <ha-sortable
                              class="quick-access-sortable"
                              draggable-selector=".quick-access-sortable-item"
                              handle-selector=".quick-access-drag"
                              animation="180"
                              @item-moved=${this._handleStepReorder}
                            >
                              <div class="quick-access-sortable-container">${renderRows()}</div>
                            </ha-sortable>
                          `
                        : html`<div class="quick-access-sortable-container">${renderRows()}</div>`}
                    </div>
                  `
                : html`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.noMacroSteps}</div>`}
            </div>
          </div>
        </div>
        ${this._renderStepDialog()}
        ${this._renderEditRenameDialog()}
      </div>
    `;
  }

  private _renderMacroStepRow(item: BackupMacroStepItem, sortable: boolean) {
    const isPower = item.kind === "power";
    const isInput = item.kind === "input";
    const meta = item.kind === "command" && item.hold > 0
      ? TOOLS_CARD_STRINGS.backup.holdLabel(this._byteToSeconds(item.hold))
      : "";
    const chip = isPower || isInput ? "required" : "command";
    // Power refs: command/order protected (no rename/delete) but their
    // attached wait is editable. Input refs: editable (change input), no
    // delete. Commands: full edit + delete. Every row owns an inline wait.
    return html`
      <div class="quick-access-sortable-item" data-step-index=${item.index}>
        <div class="quick-access-row">
          ${sortable
            ? html`<div class="quick-access-drag" aria-hidden="true"><ha-icon icon="mdi:drag-vertical-variant"></ha-icon></div>`
            : html`<span></span>`}
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">${chip}</div>
            </div>
            ${meta ? html`<div class="quick-access-meta">${meta}</div>` : nothing}
          </div>
          <div class="quick-access-actions">
            <label class="step-wait" title=${TOOLS_CARD_STRINGS.backup.stepWaitAria}>
              <span class="step-wait-caption">${TOOLS_CARD_STRINGS.backup.stepWaitLabel}</span>
              <span class="step-wait-field">
                <input
                  class="step-wait-input"
                  type="number"
                  min="0"
                  max="120"
                  step="0.5"
                  aria-label=${TOOLS_CARD_STRINGS.backup.stepWaitAria}
                  .value=${this._byteToSeconds(item.wait)}
                  @change=${(event: Event) => this._handleStepWaitChange(item, event)}
                />
                <span class="step-wait-unit">${TOOLS_CARD_STRINGS.backup.stepWaitUnit}</span>
              </span>
            </label>
            ${isPower
              ? nothing
              : html`
                  <button class="icon-btn" @click=${() => this._openEditStepDialog(item)} aria-label=${TOOLS_CARD_STRINGS.backup.editStepAria}>
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                  ${isInput
                    ? nothing
                    : html`
                        <button class="icon-btn icon-btn--danger" @click=${() => this._removeStep(item.index)} aria-label=${TOOLS_CARD_STRINGS.backup.deleteStepAria}>
                          <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                        </button>
                      `}
                `}
          </div>
        </div>
      </div>
    `;
  }

  private _renderStepDialog() {
    if (!this._stepDialogOpen || !this.bundle || !this._macroEditor) return nothing;
    const editor = this._macroEditor;
    const isEdit = this._stepDialogEditIndex !== null;
    const isActivity = editor.scope === "activity";
    const isInput = this._stepKind === "input";
    const devices = bundleEditableDeviceOptions(this.bundle);
    const commandDeviceId = isInput ? this._stepDeviceId : (isActivity ? this._stepDeviceId : editor.entityId);
    const commands = commandDeviceId != null ? deviceCommandItems(this.bundle, commandDeviceId) : [];
    const canSave = isInput || (this._stepCommandId != null && (!isActivity || this._stepDeviceId != null));
    const title = isInput
      ? TOOLS_CARD_STRINGS.backup.inputStepTitle
      : isEdit
        ? TOOLS_CARD_STRINGS.backup.stepDialogEditTitle
        : TOOLS_CARD_STRINGS.backup.stepDialogAddTitle;
    return html`
      <div class="modal-backdrop" @click=${this._closeStepDialog}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${title}</div>
            <button class="dialog-close" @click=${this._closeStepDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${isInput
              ? html`
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-step-input">${TOOLS_CARD_STRINGS.backup.inputStepCommand}</label>
                    <select id="sb-step-input" class="decoded-field-input" @change=${this._handleStepCommandChange}>
                      <option value="" ?selected=${this._stepCommandId == null}>${TOOLS_CARD_STRINGS.backup.inputStepNone}</option>
                      ${commands.map((command) => html`
                        <option value=${command.commandId} ?selected=${command.commandId === this._stepCommandId}>${command.label}</option>
                      `)}
                    </select>
                  </div>
                `
              : html`
                  ${isActivity
                    ? this._renderBindingSelect({
                        id: "sb-step-device",
                        label: TOOLS_CARD_STRINGS.backup.stepDevice,
                        value: this._stepDeviceId,
                        options: devices.map((device) => ({ value: device.id, label: device.label })),
                        onChange: this._handleStepDeviceChange,
                        emptyText: TOOLS_CARD_STRINGS.backup.bindingNoDevices,
                      })
                    : nothing}
                  ${this._renderBindingSelect({
                    id: "sb-step-command",
                    label: TOOLS_CARD_STRINGS.backup.stepCommand,
                    value: this._stepCommandId,
                    options: commands.map((command) => ({ value: command.commandId, label: command.label })),
                    onChange: this._handleStepCommandChange,
                    emptyText: TOOLS_CARD_STRINGS.backup.stepNoCommands,
                  })}
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-step-hold">${TOOLS_CARD_STRINGS.backup.stepHoldSeconds}</label>
                    <input
                      id="sb-step-hold"
                      class="decoded-field-input"
                      type="number"
                      min="0"
                      max="120"
                      step="0.5"
                      .value=${this._stepHoldSeconds}
                      @input=${this._handleStepHoldInput}
                      @change=${this._handleStepHoldChange}
                    />
                  </div>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._stepError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeStepDialog}>${TOOLS_CARD_STRINGS.backup.stepCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyStep} ?disabled=${!canSave}>
                ${isEdit ? TOOLS_CARD_STRINGS.backup.stepSave : TOOLS_CARD_STRINGS.backup.stepAdd}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ── Power On/Off setup (shared by Device and Activity details) ──────
  private _powerSetupStepCount(scope: BackupEditTargetKind, entityId: number, buttonId: number): number {
    if (!this.bundle) return 0;
    return scope === "device"
      ? deviceMacroStepItems(this.bundle, entityId, buttonId).length
      : activityMacroStepItems(this.bundle, entityId, buttonId).length;
  }

  private _renderPowerSetupRow(
    scope: BackupEditTargetKind,
    entityId: number,
    buttonId: number,
    label: string,
    disabled: boolean,
  ) {
    const count = this._powerSetupStepCount(scope, entityId, buttonId);
    return html`
      <div class="quick-access-sortable-item">
        <button
          class="edit-selection-row"
          aria-disabled=${disabled ? "true" : "false"}
          tabindex=${disabled ? "-1" : "0"}
          @click=${() => {
            if (!disabled) this._openMacroEditor(scope, entityId, buttonId, label);
          }}
        >
          <span class="selection-main">
            <span class="selection-label">${label}</span>
            <span class="selection-sub">${TOOLS_CARD_STRINGS.backup.macroStepsCount(count)}</span>
          </span>
          <span class="selection-chevron"><ha-icon icon="mdi:chevron-right"></ha-icon></span>
        </button>
      </div>
    `;
  }

  // The device Power section folds two concepts the hub keeps separate but
  // the app presents together: the automatic-power / idle-behavior selector
  // (one 0x0242 byte) and the POWER_ON/POWER_OFF command sequences. Choosing
  // "Don't control power" makes the hub ignore the sequences, so they render
  // inert. Activities have no idle behavior, so they get only the sequences.
  private _renderPowerSetupSection(scope: BackupEditTargetKind, entityId: number) {
    if (this.entityId == null || !this.bundle) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    const isDevice = scope === "device";
    const mode = isDevice ? deviceIdleBehavior(this.bundle, entityId) : null;
    const sequencesDisabled = isDevice && mode === IDLE_BEHAVIOR_DISABLED;
    return html`
      <div class="quick-access-section" data-edit-section="power">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">${S.powerSetupTitle}</div>
            <div class="quick-access-sub">
              ${isDevice ? S.powerSetupDeviceSub : S.powerSetupActivitySub}
            </div>
          </div>
        </div>
        ${isDevice ? this._renderPowerControlDropdown(entityId, mode) : nothing}
        <div class="quick-access-list">
          ${sequencesDisabled
            ? html`<div class="power-sequences-note">${S.powerSequencesDisabledNote}</div>`
            : nothing}
          <div
            class="quick-access-sortable-container power-sequences"
            data-disabled=${sequencesDisabled ? "true" : "false"}
          >
            ${this._renderPowerSetupRow(scope, entityId, 198, S.powerOnLabel, sequencesDisabled)}
            ${this._renderPowerSetupRow(scope, entityId, 199, S.powerOffLabel, sequencesDisabled)}
          </div>
        </div>
      </div>
    `;
  }

  // ── Automatic power control selector (device only) ──────────────────
  // One hub byte (the 0x0242 reply) encodes both the "Power On/Off Setup"
  // toggle and the "Idle Behavior" choice, so it surfaces here as a single
  // two-line dropdown. It lives in its own hub query, not the device
  // record, so it is captured/restored separately.
  private _powerControlOptions(): Array<{ mode: number; label: string; sub: string }> {
    const S = TOOLS_CARD_STRINGS.backup;
    return [
      { mode: IDLE_BEHAVIOR_DISABLED, label: S.powerControlDisabled, sub: S.powerControlDisabledSub },
      { mode: IDLE_BEHAVIOR_AUTO_OFF, label: S.powerControlAutoOff, sub: S.powerControlAutoOffSub },
      { mode: IDLE_BEHAVIOR_STAY_ON, label: S.powerControlStayOn, sub: S.powerControlStayOnSub },
      { mode: IDLE_BEHAVIOR_ALWAYS_ON, label: S.powerControlAlwaysOn, sub: S.powerControlAlwaysOnSub },
    ];
  }

  private _togglePowerControlMenu = () => {
    this._powerControlMenuOpen = !this._powerControlMenuOpen;
  };

  private _selectPowerControl(deviceId: number, mode: number) {
    this._powerControlMenuOpen = false;
    if (!this.bundle) return;
    if (deviceIdleBehavior(this.bundle, deviceId) === mode) return;
    this._commitEditBundleEdit(updateBundleDeviceIdleBehavior(this.bundle, deviceId, mode));
  }

  private _renderPowerControlDropdown(deviceId: number, mode: number | null) {
    const S = TOOLS_CARD_STRINGS.backup;
    const options = this._powerControlOptions();
    const selected = options.find((opt) => opt.mode === mode) ?? null;
    const open = this._powerControlMenuOpen;
    return html`
      <div class="power-control" data-open=${open ? "true" : "false"}>
        <button
          class="power-control-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded=${open ? "true" : "false"}
          @click=${this._togglePowerControlMenu}
        >
          <span class="selection-main">
            <span class="selection-label">${selected ? selected.label : S.powerControlUnset}</span>
            <span class="selection-sub">${selected ? selected.sub : S.powerControlUnsetSub}</span>
          </span>
          <span class="selection-chevron"><ha-icon icon="mdi:chevron-down"></ha-icon></span>
        </button>
        ${open
          ? html`
              <button
                class="power-control-backdrop"
                type="button"
                tabindex="-1"
                aria-hidden="true"
                @click=${this._togglePowerControlMenu}
              ></button>
              <div class="power-control-menu" role="listbox" aria-label=${S.powerControlTitle}>
                ${options.map((opt) => {
                  const isSel = opt.mode === mode;
                  return html`
                    <button
                      class="power-control-option"
                      type="button"
                      role="option"
                      aria-selected=${isSel ? "true" : "false"}
                      aria-checked=${isSel ? "true" : "false"}
                      @click=${() => this._selectPowerControl(deviceId, opt.mode)}
                    >
                      <span class="selection-main">
                        <span class="selection-label">${opt.label}</span>
                        <span class="selection-sub">${opt.sub}</span>
                      </span>
                      <span class="selection-chevron">
                        ${isSel ? html`<ha-icon icon="mdi:check"></ha-icon>` : nothing}
                      </span>
                    </button>
                  `;
                })}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _selectedEditTitle() {
    if (!this.bundle || !this.kind || this.entityId == null) return "";
    const options = this.kind === "activity"
      ? bundleActivityOptions(this.bundle)
      : bundleDeviceOptions(this.bundle);
    return options.find((option) => option.id === this.entityId)?.label || "";
  }
}

if (!customElements.get("sofabaton-edit-detail-view")) {
  customElements.define("sofabaton-edit-detail-view", SofabatonEditDetailView);
}

declare global {
  interface HTMLElementTagNameMap {
    "sofabaton-edit-detail-view": SofabatonEditDetailView;
  }
}
