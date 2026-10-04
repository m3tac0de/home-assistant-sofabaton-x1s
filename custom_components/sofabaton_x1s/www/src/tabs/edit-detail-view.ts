/**
 * The bundle edit-detail environment, extracted from backup-tab.ts
 * (Phase L1 of docs/internal/live-activity-editor-plan.md).
 *
 * One standalone element hosts everything below the entity list: the
 * detail shell (sticky header, crumbs, scroll-spy section nav), the
 * device and activity section stacks, the sub-views (per-button
 * bindings, macro step editor), and every dialog they open (rename,
 * command payload editor with IR learn, delete confirm, add shortcut,
 * binding picker, step editor, role-overwrite confirm).
 *
 * The element is deliberately write-backend-agnostic: every edit is a
 * pure `bundle → bundle` transform committed through
 * `_commitEditBundleEdit`, which emits a `bundle-change` event. The
 * host owns the bundle (and its persistence/dirty semantics); this
 * element owns all transient view state. `close` asks the host to leave
 * the detail view. The Backup → Edit tab embeds it with mode="backup";
 * the live Activities tab embeds it with mode="live" and syncs the
 * edits to the hub behind the same events.
 *
 * The larger state islands live in reactive controllers under
 * edit-detail/ (R6, CR-F2-14): IR learn (_learn), the payload dialog
 * (_payload), the Wifi Event target (_events), the binding picker
 * (_binding) and the macro step editor (_steps).
 */
import { LitElement, html, nothing } from "lit";
import { IP_HEAD_DEVICE_CLASSES, IPV4_PATTERN } from "../shared/hub-rules";
import { TOOLS_CARD_STRINGS } from "../strings";
import {
  activityEditorStyles,
  renderActivityRolesBlock,
} from "./activity-editor";
import { backupTabStyles } from "./backup-tab-styles";
import { addButtonStyles } from "../shared/styles/add-button-styles";
import type { BackupBundlePayload, IrPayloadConvertResponse, IrPayloadForeignFormat, WifiEvent } from "../shared/ha-context";
import {
  activityAddableDevices,
  activityButtonBindingItems,
  activityMacroStepItems,
  activityMemberViews,
  activityRoleAssignments,
  addActivityMemberDevice,
  type ActivityRoleGroupId,
  activityHasFavorite,
  activityShortcutCommandItems,
  activityShortcutDeviceOptions,
  activityUserMacroSummaries,
  roleMappableButtonCount,
  setActivityRoleDevice,
  addActivityUserMacro,
  copyActivityUserMacro,
  copyableActivityMacroSummaries,
  macroTargetFromValue,
  addBundleActivityFavorite,
  applyBundleDelete,
  activityQuickAccessItems,
  backupDeleteHasCascade,
  type BackupButtonBindingItem,
  type BackupDeleteTarget,
  type BundleDeleteOptions,
  type BackupDeviceCommandItem,
  bundleDeleteImpact,
  bundleActivityOptions,
  bundleDeviceBrand,
  bundleDeviceClass,
  isManagedWifiBrand,
  isWifiEventsBrand,
  bundleDeviceOptions,
  commandDecodedBlock,
  commandRawPayloadHex,
  normalizeCommandPayloadHex,
  deviceButtonBindingItems,
  deviceCommandItems,
  deviceMacroStepItems,
  deviceIpAddress,
  deviceIdleBehavior,
  updateBundleDeviceIdleBehavior,
  IDLE_BEHAVIOR_AUTO_OFF,
  IDLE_BEHAVIOR_ALWAYS_ON,
  IDLE_BEHAVIOR_STAY_ON,
  IDLE_BEHAVIOR_DISABLED,
  reorderBundleActivityQuickAccess,
  renameBundleActivity,
  renameBundleActivityFavorite,
  renameBundleActivityMacro,
  renameBundleDevice,
  renameBundleDeviceCommand,
  unboundButtonsForActivity,
  unboundButtonsForDevice,
  updateBundleDeviceIp,
} from "./backup-state";
import type {
  ActivityBindingTargetKind,
  BackupEditDetailSectionId,
  BackupEditTargetKind,
  BackupQuickAccessKind,
  BackupRenameDialogTarget,
  FetchedCommandPayload,
  IrLearnHost,
  MacroTargetMode,
  WifiEventsHost,
} from "./edit-detail/host-types";
import { renderKindSegments } from "./edit-detail/kind-segments";
import { editorErrorMessage, sanitizeBundleName, useLegacyTextField } from "./edit-detail/names";
import { editDetailViewStyles } from "./edit-detail/styles";
import { IrLearnController } from "./edit-detail/ir-learn-controller";
import { PayloadDialogController } from "./edit-detail/payload-dialog-controller";
import { WifiEventTargets } from "./edit-detail/wifi-event-targets";
import { BindingDialogController } from "./edit-detail/binding-dialog-controller";
import { MacroStepEditorController } from "./edit-detail/macro-step-editor";

// The element's public names, kept here for its importers (R6, CR-F2-14).
export type { BackupEditTargetKind, FetchedCommandPayload, IrLearnHost, WifiEventsHost } from "./edit-detail/host-types";
export { bundleIsX2, bundleSupportsUnicodeNames, editorErrorMessage, sanitizeBundleName, useLegacyTextField } from "./edit-detail/names";

export class SofabatonEditDetailView extends LitElement {
  static properties = {
    bundle: { attribute: false },
    kind: { attribute: false },
    entityId: { attribute: false },
    dirty: { type: Boolean },
    mode: { type: String },
    wifiEvents: { attribute: false },
    _editDetailActiveSection: { state: true },
    _editRenameDialogOpen: { state: true },
    _editRenameDialogDraft: { state: true },
    _editRenameDialogError: { state: true },
    _editRenameDialogTarget: { state: true },
    fetchCommandPayload: { attribute: false },
    testCommandPayload: { attribute: false },
    irLearn: { attribute: false },
    _confirmDeleteTarget: { state: true },
    _confirmDeleteLabel: { state: true },
    _addFavoriteOpen: { state: true },
    _addMemberOpen: { state: true },
    _addMemberDeviceId: { state: true },
    _addFavoriteDeviceId: { state: true },
    _addFavoriteCommandId: { state: true },
    _addFavoriteError: { state: true },
    _haSortableReady: { state: true },
    _powerControlMenuOpen: { state: true },
    _roleMenuOpen: { state: true },
    _roleConfirm: { state: true },
    _bindingsView: { state: true },
    _addShortcutKind: { state: true },
    _addShortcutActionName: { state: true },
    _addShortcutMacro: { state: true },
  };

  // The whole backup-tab stylesheet ships to both shadow roots (see
  // backup-tab-styles.ts); the :host rule it carries gives this element
  // the same flex-fill layout the tab-panel had inside backup-tab.
  static styles = [activityEditorStyles, backupTabStyles, addButtonStyles, editDetailViewStyles];

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
  _bindingsView = false;
  private _addShortcutKind: ActivityBindingTargetKind = "command";
  private _addShortcutActionName = "";
  // The macro kind: a new macro, or another activity's macro copied over ("copy").
  private _addShortcutMacro: { mode: MacroTargetMode; macroId: number | null; sourceId: number | null } = { mode: "new", macroId: null, sourceId: null };
  // ── Wifi Event kind (live mode; host facade + shared dialog state) ──
  // `_events.primary` serves whichever Add dialog is open (shortcut,
  // step, or binding); `_events.longPress` is the binding's long-press leg.
  // A Wifi Event is one record: long press is a property of the binding
  // (docs/internal/wifi-events-single-record-plan.md).
  wifiEvents: WifiEventsHost | null = null;
  _editRenameDialogOpen = false;
  _editRenameDialogDraft = "";
  _editRenameDialogError = "";
  _editRenameDialogTarget: BackupRenameDialogTarget | null = null;
  // ── Live payload editing (host-provided I/O) ───────────────────────
  // The detail view is hass-free; the live Activities host injects these
  // to fetch a command's blob on demand and to Test it on the hub. Absent
  // in backup mode (the payload already lives in the bundle there).
  fetchCommandPayload: ((deviceId: number, commandId: number) => Promise<FetchedCommandPayload | null>) | null = null;
  testCommandPayload: ((hex: string) => Promise<void>) | null = null;
  // Both hosts (live and backup) provide this: it needs Home Assistant, not a hub.
  convertForeignPayload:
    | ((text: string, format: IrPayloadForeignFormat) => Promise<IrPayloadConvertResponse>)
    | null = null;
  // ── Learn mode of the payload dialog (IR9, live IR devices only) ───
  // Two capture sources with opposite shapes. The hub receiver is a
  // *listener*: one armed window per attempt, countdown, cancel. The HA
  // emitter is an *inbox*: the backend's intercept ring, replayed on
  // subscribe and pushed on every send, so nothing has to stay alive in
  // the browser while the user walks off to press a button elsewhere.
  // "New" is judged against the ring as first seen when learn mode
  // opened (payload -> timestamp), never against the browser clock.
  irLearn: IrLearnHost | null = null;
  readonly _learn = new IrLearnController(this);
  readonly _payload = new PayloadDialogController(this);
  readonly _events = new WifiEventTargets(this);
  readonly _binding = new BindingDialogController(this);
  readonly _steps = new MacroStepEditorController(this);
  private _confirmDeleteTarget: BackupDeleteTarget | null = null;
  private _confirmDeleteLabel = "";
  private _addFavoriteOpen = false;
  private _addMemberOpen = false;
  private _addMemberDeviceId: number | null = null;
  private _addFavoriteDeviceId: number | null = null;
  private _addFavoriteCommandId: number | null = null;
  private _addFavoriteError = "";
  private _detailScrollTop = 0;
  private _bindingsScrollTop = 0;
  _haSortableReady = Boolean(customElements.get("ha-sortable"));

  connectedCallback(): void {
    super.connectedCallback();
    if (!this._haSortableReady) {
      void customElements.whenDefined("ha-sortable").then(() => {
        this._haSortableReady = true;
      });
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    // Leaving the editor (Back, sidebar, tab switch) ends learn mode: the
    // hub window is released and the inbox and ticker stop (CR-F2-4).
    this._learn.exit();
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
    this._closeEditRenameDialog();
    this._payload.close();
    this._payload.fetchingCommandId = null;
    this._payload.fetchError = "";
    this._payload.addPreparing = false;
    this._closeDeleteConfirm();
    this._closeAddFavoriteDialog();
    this._closeAddMemberDialog();
    this._binding.close();
    this._steps.editor = null;
    this._steps.closeDialog();
  }

  /**
   * Commit a mutated bundle from any edit handler. The element updates its
   * own prop synchronously (handlers read the fresh bundle in the same
   * tick), then hands the result to the host, which owns dirty/persistence
   * semantics.
   */
  _commitEditBundleEdit(next: BackupBundlePayload) {
    this.bundle = next;
    this.dispatchEvent(new CustomEvent("bundle-change", { detail: { bundle: this.bundle } }));
  }

  /** Ask the host to leave the detail view (back button, entity delete). */
  _requestClose = () => {
    this.dispatchEvent(new CustomEvent("close"));
  };

  // ── Live-mode header (§4.3) ─────────────────────────────────────────
  // The live header mirrors the Wifi command editor: Back (= discard, via the
  // host's exit-confirm) on the left, rename/delete + a single stateful Sync
  // button on the right. The element only signals sync intent; the host owns
  // the write. In backup mode there is no Sync button and the chip reads
  // "Unsaved".
  private _requestSync = () => this.dispatchEvent(new CustomEvent("sync-request"));

  _renderDirtyChip() {
    // Live mode has no dirty chip — the Sync button's state carries that
    // signal (matching the Wifi command editor). Backup mode keeps "Unsaved".
    if (this.mode === "live" || !this.dirty) return nothing;
    return html`<span class="edit-unsaved-chip" title=${TOOLS_CARD_STRINGS.backup.unsavedTooltip}>${TOOLS_CARD_STRINGS.backup.unsaved}</span>`;
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
    // A managed Wifi Device keeps its rename affordance (it stays in sync
    // with the Wifi Commands store) but loses delete — removing it belongs in
    // the Wifi Commands tab, which also clears its stored configuration.
    const managed = this._isManagedWifiLiveDevice();
    return html`
      <button class="icon-btn" @click=${this._openDetailRenameDialog} aria-label=${TOOLS_CARD_STRINGS.backup.renameKind(kind)}>
        <ha-icon icon="mdi:pencil"></ha-icon>
      </button>
      ${managed
        ? nothing
        : html`
            <button
              class="icon-btn icon-btn--danger"
              @click=${this._openDetailDeleteConfirm}
              aria-label=${kind === "activity"
                ? TOOLS_CARD_STRINGS.backup.deleteActivityAria
                : TOOLS_CARD_STRINGS.backup.deleteDeviceAria}
            >
              <ha-icon icon="mdi:trash-can-outline"></ha-icon>
            </button>
          `}
    `;
  }

  private _renderManagedWifiLockNotice() {
    return html`
      <div class="managed-wifi-lock">
        <div class="managed-wifi-lock-chip">
          <ha-icon icon="mdi:wifi-cog"></ha-icon>
          <span>${TOOLS_CARD_STRINGS.backup.managedWifiTitle}</span>
        </div>
        <p class="managed-wifi-lock-copy">
          ${TOOLS_CARD_STRINGS.backup.managedWifiIntro}
          ${TOOLS_CARD_STRINGS.backup.managedWifiBody}
        </p>
        <p class="managed-wifi-lock-copy">
          ${TOOLS_CARD_STRINGS.backup.managedWifiRename}
        </p>
      </div>
    `;
  }

  protected render() {
    if (!this.bundle || this.entityId == null) return nothing;
    if (this._steps.editor) {
      return this._steps.render(this._steps.editor);
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
                <button class="back-btn" aria-label=${TOOLS_CARD_STRINGS.common.backAria} @click=${this._requestClose}>
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
              : this._isManagedWifiLiveDevice()
                ? this._renderManagedWifiLockNotice()
                : html`
                    ${this._renderPowerSetupSection("device", Number(this.entityId))}
                    ${this._renderDeviceNetworkSection()}
                    ${this._renderDeviceCommandsSection(deviceCommands)}
                    ${this._renderButtonBindingsSection("device")}
                  `}
          </div>
        </div>
        ${this._renderEditRenameDialog()}
        ${this._payload.render()}
        ${this._renderDeleteConfirmDialog()}
        ${this._renderAddFavoriteDialog()}
        ${this._renderAddMemberDialog()}
        ${this._binding.render()}
        ${this._renderRoleConfirmDialog()}
      </div>
    `;
  }

  /**
   * True when the LIVE editor is showing a managed Wifi Commands device.
   * Such a device's records (commands, power, input, bindings) are owned by
   * the Wifi Commands tab — editing them here would silently diverge and be
   * overwritten on the next sync — so the live editor locks everything but
   * the device name (renaming is coordinated with the Wifi Commands store).
   * The offline Backup editor is unaffected (mode !== "live").
   */
  private _isManagedWifiLiveDevice(): boolean {
    // The reserved Wifi Events device is carved out: this editor is its
    // ONLY hub-side editing UI (it never appears in the Wifi Commands
    // tab), so the name-only lock must not apply — the store follows the
    // hub via the §6a reconcile pass instead. Command ADD for it is
    // blocked backend-side in the device-sync plan.
    const brand = this.entityId != null
      ? bundleDeviceBrand(this.bundle, Number(this.entityId))
      : "";
    return (
      this.mode === "live" &&
      this.kind === "device" &&
      this.entityId != null &&
      isManagedWifiBrand(brand) &&
      !isWifiEventsBrand(brand)
    );
  }

  /**
   * Device options for pickers/dialogs. In LIVE mode the reserved Wifi
   * Events device is filtered out — its commands are offered through the
   * dedicated "Wifi Event" kind, so listing the device too would present
   * every event twice. The offline Backup editor keeps showing everything.
   */
  _editableDeviceOptions() {
    const options = bundleDeviceOptions(this.bundle);
    if (this.mode !== "live") return options;
    return options.filter(
      (option) => !isWifiEventsBrand(bundleDeviceBrand(this.bundle, option.id)),
    );
  }

  private _editDetailSectionItems(kind: BackupEditTargetKind): Array<{
    id: BackupEditDetailSectionId;
    icon: string;
    label: string;
  }> {
    if (kind === "activity") {
      return [];
    }
    if (this._isManagedWifiLiveDevice()) {
      // Locked: no editable sections, so no section nav.
      return [];
    }

    const hasNetworkSection = this.entityId != null && this.bundle
      ? IP_HEAD_DEVICE_CLASSES.has(bundleDeviceClass(this.bundle, Number(this.entityId)) ?? "")
      : false;
    return [
      { id: "power", icon: "mdi:power-plug-outline", label: TOOLS_CARD_STRINGS.backup.detailPower },
      ...(hasNetworkSection ? [{ id: "network" as const, icon: "mdi:lan-connect", label: TOOLS_CARD_STRINGS.backup.detailNetwork }] : []),
      { id: "commands", icon: "mdi:format-list-bulleted", label: TOOLS_CARD_STRINGS.backup.detailCommands },
      { id: "bindings", icon: "mdi:gesture-tap-button", label: TOOLS_CARD_STRINGS.backup.detailButtons },
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
      <div class="detail-section-nav" role="tablist" aria-label=${TOOLS_CARD_STRINGS.backup.detailSectionsAria}>
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
        @click=${() => this._binding.openAdd(kind)}
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
    this._binding.close();
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
                <button class="back-btn" aria-label=${TOOLS_CARD_STRINGS.common.backAria} @click=${this._closeBindingsView}>
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
        ${this._binding.render()}
        ${this._renderDeleteConfirmDialog()}
      </div>
    `;
  }

  // ── Role-based button assignment (activity) ──────────────────────────

  private _renderActivityRolesBlock() {
    if (this.entityId == null || !this.bundle) return nothing;
    const bundle = this.bundle;
    const activityId = Number(this.entityId);
    const deviceOptions = this._editableDeviceOptions().map((device) => ({
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
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} @click=${this._closeRoleConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
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
              <div class="quick-access-chip">${TOOLS_CARD_STRINGS.backup.buttonChip}</div>
            </div>
            <div class="quick-access-meta">${item.shortPressLabel}</div>
            ${item.longPress
              ? html`<div class="quick-access-meta">${TOOLS_CARD_STRINGS.backup.bindingLongPressMeta(item.longPress.label)}</div>`
              : nothing}
          </div>
          <div class="quick-access-actions">
            <button
              class="icon-btn"
              @click=${() => this._binding.openEdit(kind, item.buttonId)}
              aria-label=${TOOLS_CARD_STRINGS.backup.editBindingAria}
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
          <div class="quick-access-title">${TOOLS_CARD_STRINGS.backup.detailNetwork}</div>
          <div class="quick-access-sub">
            ${TOOLS_CARD_STRINGS.backup.networkDescription}
          </div>
        </div>
        <div class="quick-access-list">
          <div class="quick-access-sortable-container">
            <div class="quick-access-sortable-item">
              <div class="quick-access-row quick-access-row--no-drag">
                <div class="quick-access-main">
                  <div class="quick-access-label-row">
                    <div class="quick-access-label">${ip ?? TOOLS_CARD_STRINGS.backup.hubNameNotSet}</div>
                    <div class="quick-access-chip">${TOOLS_CARD_STRINGS.backup.ipChip}</div>
                  </div>
                  <div class="quick-access-meta">${TOOLS_CARD_STRINGS.backup.ipv4Description}</div>
                </div>
                <div class="quick-access-actions">
                  <button
                    class="icon-btn"
                    @click=${() => this._openDeviceIpRenameDialog(deviceId)}
                    aria-label=${TOOLS_CARD_STRINGS.backup.editIpAria}
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
            <div class="quick-access-title">${TOOLS_CARD_STRINGS.backup.detailCommands}</div>
            <div class="quick-access-sub">
              ${this.mode === "live"
                ? TOOLS_CARD_STRINGS.backup.commandsLiveHelp
                : TOOLS_CARD_STRINGS.backup.commandsBackupHelp}
            </div>
          </div>
          ${this.mode === "live"
            ? html`
                <div class="quick-access-head-actions">
                  <button
                    class="quick-access-add-btn"
                    ?disabled=${this._payload.addPreparing}
                    @click=${() => void this._payload.openAdd()}
                  >
                    <ha-icon
                      icon=${this._payload.addPreparing ? "mdi:loading" : "mdi:plus"}
                      class=${this._payload.addPreparing ? "sb-spin" : ""}
                    ></ha-icon>
                    <span>${TOOLS_CARD_STRINGS.backup.addCommand}</span>
                  </button>
                </div>
              `
            : nothing}
        </div>
        ${this._payload.fetchError
          ? html`
              <div class="section-status error" role="alert">
                <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                <span>${this._payload.fetchError}</span>
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
          : html`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.noDeviceCommands}</div>`}
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
              <div class="quick-access-chip">${pendingAdd
                ? TOOLS_CARD_STRINGS.backup.newCommandChip
                : TOOLS_CARD_STRINGS.backup.commandChip}</div>
            </div>
            <div class="quick-access-meta">
              ${TOOLS_CARD_STRINGS.backup.commandId} ${item.commandId}
            </div>
          </div>
          <div class="quick-access-actions">
            <button
              class="icon-btn"
              @click=${() => this._openDeviceCommandRenameDialog(item.commandId)}
              aria-label=${TOOLS_CARD_STRINGS.backup.renameCommandAria}
            >
              <ha-icon icon="mdi:pencil"></ha-icon>
            </button>
            ${this.mode !== "live" && this._commandHasEditablePayload(item.commandId)
              ? html`
                  <button
                    class="icon-btn"
                    @click=${() => this._payload.openFromBundle(item.commandId)}
                    aria-label=${TOOLS_CARD_STRINGS.backup.editPayloadAria}
                    title=${TOOLS_CARD_STRINGS.backup.editPayloadAria}
                  >
                    <ha-icon icon="mdi:code-braces"></ha-icon>
                  </button>
                `
              : nothing}
            ${this.mode === "live" && !pendingAdd
              ? html`
                  <button
                    class="icon-btn"
                    @click=${() => void this._payload.liveFetchAndOpen(item.commandId)}
                    ?disabled=${this._payload.fetchingCommandId != null}
                    aria-label=${TOOLS_CARD_STRINGS.backup.editPayloadAria}
                    title=${TOOLS_CARD_STRINGS.backup.fetchEditCommandAria}
                  >
                    <ha-icon
                      icon=${this._payload.fetchingCommandId === item.commandId ? "mdi:loading" : "mdi:code-braces"}
                      class=${this._payload.fetchingCommandId === item.commandId ? "sb-spin" : ""}
                    ></ha-icon>
                  </button>
                `
              : nothing}
            <button
              class="icon-btn icon-btn--danger"
              @click=${() => this._openCommandDeleteConfirm(item.commandId, item.label)}
              aria-label=${TOOLS_CARD_STRINGS.backup.deleteCommandAria}
            >
              <ha-icon icon="mdi:trash-can-outline"></ha-icon>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private _renderActivityQuickAccessSection(items: ReturnType<typeof activityQuickAccessItems>) {
    if (this.entityId == null) return nothing;
    const rows = items.map((item, position) => this._renderActivityQuickAccessRow(item, position, items.length));
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
    return String(device?.device?.name || "").trim()
      || TOOLS_CARD_STRINGS.common.deviceFallback(item.deviceId ?? "?");
  }

  private _renderActivityQuickAccessRow(
    item: ReturnType<typeof activityQuickAccessItems>[number],
    position: number,
    count: number,
  ) {
    return html`
      <div class="quick-access-sortable-item" data-kind=${item.kind} data-button-id=${item.buttonId}>
        <div class="quick-access-row">
          ${this._renderReorderHandle(item.label, position, count, (delta) => this._moveActivityQuickAccessItem(position, delta))}
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
                aria-label=${TOOLS_CARD_STRINGS.backup.moveUpAria}
              >
                <ha-icon icon="mdi:chevron-up"></ha-icon>
              </button>
              <button
                class="icon-btn"
                @click=${() => this._moveQuickAccessByIdentity(item.kind, item.buttonId, 1)}
                aria-label=${TOOLS_CARD_STRINGS.backup.moveDownAria}
              >
                <ha-icon icon="mdi:chevron-down"></ha-icon>
              </button>
            `}
            ${item.kind === "macro"
              ? html`
                  <button
                    class="icon-btn"
                    @click=${() => this._steps.openEditor("activity", Number(this.entityId), item.buttonId, item.label)}
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

  _renderEditRenameDialog() {
    if (!this._editRenameDialogOpen || !this._editRenameDialogTarget) return nothing;
    const label = this._editRenameDialogLabel();
    return html`
      <div class="modal-backdrop" @click=${this._closeEditRenameDialog}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${label}</div>
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} @click=${this._closeEditRenameDialog}><ha-icon icon="mdi:close"></ha-icon></button>
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
              <button class="dialog-btn" @click=${this._closeEditRenameDialog}>${TOOLS_CARD_STRINGS.common.cancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyEditRenameDialog}>${TOOLS_CARD_STRINGS.common.save}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _editRenameDialogLabel() {
    const target = this._editRenameDialogTarget;
    const S = TOOLS_CARD_STRINGS.backup;
    if (!target) return S.rename;
    if (target.kind === "detail") {
      return target.entityKind === "activity" ? S.renameActivity : S.renameDevice;
    }
    if (target.kind === "macro") return S.renameMacro;
    if (target.kind === "favorite") return S.renameFavorite;
    if (target.kind === "device_ip") return S.editIpAria;
    return S.renameCommand;
  }

  /** Per-target label & max length used by the dialog's primary text input. */
  private _editRenameFieldLabel(): string {
    return this._editRenameDialogTarget?.kind === "device_ip"
      ? TOOLS_CARD_STRINGS.backup.ipAddress
      : TOOLS_CARD_STRINGS.backup.name;
  }

  private _editRenameFieldMaxLength(): number {
    // "255.255.255.255" is 15 chars; everything else uses the 30-char
    // wire name slot.
    return this._editRenameDialogTarget?.kind === "device_ip" ? 15 : 30;
  }

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

  // ── Learn mode hooks (IR9): the controller lives in edit-detail/ir-learn-controller ──
  /** Learn is a live-hub, IR-only affordance; the host must supply the facade. */
  _learnAvailable(): boolean {
    return this.mode === "live" && !!this.irLearn && this._payload.liveDeviceIsIr();
  }

  /**
   * Drop a captured Sofabaton blob into the editor: hex mode (leaving a
   * descriptor form if the dialog was in one), pronto view when the bytes
   * parse as raw timings, Test/Save untouched and ready.
   */
  _adoptLearnedPayload(hex: string, note: string) {
    this._learn.exit();
    const normalized = normalizeCommandPayloadHex(hex) ?? hex;
    this._payload.morphToHex(normalized, "sofabaton");
    if (this._payload.prontoAvailable) this._payload.hexTab = "pronto";
    this._payload.error = "";
    this._payload.testStatus = "idle";
    this._payload.testError = "";
    this._learn.sourceNote = note;
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
    // Live command deletes mirror the hub's own cascade (favorites, binding
    // legs, macro steps) but must not rewrite activity membership: the
    // device sync never writes activities and its scope guard tolerates
    // exactly the cascade. Offline edits keep the full reconcile.
    const deleteOptions: BundleDeleteOptions = { reconcileMembership: this.mode !== "live" };
    this._commitEditBundleEdit(applyBundleDelete(this.bundle, target, deleteOptions));
    // Deleting the entity we're inside removes its detail page — fall back
    // to the overview. Row-level deletes (command / favorite / macro) keep
    // the detail open so the user can continue trimming the list.
    if (target.kind === "activity" || target.kind === "device") {
      this._requestClose();
    }
    this._closeDeleteConfirm();
  };

  private _deleteConfirmTitle(target: BackupDeleteTarget, label: string): string {
    const name = label || TOOLS_CARD_STRINGS.backup.thisItem;
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

  _renderDeleteConfirmDialog() {
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
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} @click=${this._closeDeleteConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
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
                    ${impact.members > 0
                      ? html`<li><ha-icon icon="mdi:power"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactMembers(impact.members)}</span></li>`
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
  // a device command, a Wifi Event or a new macro. The kind selector
  // swaps the dialog's fields. Only what is not a shortcut yet is offered
  // (a favorite is unique by content; every existing macro already is one).
  private _openAddShortcutDialog = () => {
    if (this.entityId == null || !this.bundle) return;
    const firstDeviceId = this._shortcutDeviceOptions()[0]?.id ?? null;
    const commands = this._shortcutCommandItems(firstDeviceId);
    this._addShortcutKind = "command";
    this._addFavoriteDeviceId = firstDeviceId;
    this._addFavoriteCommandId = commands[0]?.commandId ?? null;
    this._addFavoriteError = "";
    this._addShortcutActionName = "";
    this._addShortcutMacro = { mode: "new", macroId: null, sourceId: null };
    this._events.load(this._shortcutEventTaken);
    this._addFavoriteOpen = true;
  };

  private _closeAddFavoriteDialog = () => {
    this._addFavoriteOpen = false;
    this._binding.macroPicker = null;
    this._addFavoriteDeviceId = null;
    this._addFavoriteCommandId = null;
    this._addFavoriteError = "";
    this._addShortcutKind = "command";
    this._addShortcutActionName = "";
    this._addShortcutMacro = { mode: "new", macroId: null, sourceId: null };
  };

  private _handleAddFavoriteDeviceChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._addFavoriteDeviceId = Number.isFinite(value) ? value : null;
    const commands = this._shortcutCommandItems(this._addFavoriteDeviceId);
    this._addFavoriteCommandId = commands[0]?.commandId ?? null;
    this._addFavoriteError = "";
  };

  private _handleAddFavoriteCommandChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this._addFavoriteCommandId = Number.isFinite(value) ? value : null;
    this._addFavoriteError = "";
  };

  private _applyAddFavorite = () => {
    if (!this.bundle || this.entityId == null) return;
    if (this._addFavoriteDeviceId == null || this._addFavoriteCommandId == null) {
      this._addFavoriteError = TOOLS_CARD_STRINGS.backup.addFavoriteNoCommands;
      return;
    }
    // A favorite has no name of its own — the remote shows it strictly
    // under the referenced command's name, so the row carries a copy of
    // that label rather than anything user-entered.
    const command = deviceCommandItems(this.bundle, this._addFavoriteDeviceId)
      .find((item) => item.commandId === this._addFavoriteCommandId);
    const name = sanitizeBundleName(this.bundle, command?.label ?? "");
    this._commitEditBundleEdit(addBundleActivityFavorite(
      this.bundle,
      Number(this.entityId),
      this._addFavoriteDeviceId,
      this._addFavoriteCommandId,
      name,
    ));
    this._closeAddFavoriteDialog();
  };

  // ── Activity member devices (power-only membership, issue #263) ─────

  /**
   * Devices offered by the "Add device" picker. In LIVE mode every
   * managed Wifi Commands device (including the reserved Wifi Events
   * device) is excluded: their activity membership is owned by the Wifi
   * Commands deploy, and a manual add here would silently be undone by
   * the next resync. The offline Backup editor keeps showing everything.
   */
  private _addableMemberDevices() {
    if (!this.bundle || this.entityId == null) return [];
    const options = activityAddableDevices(this.bundle, Number(this.entityId));
    if (this.mode !== "live") return options;
    return options.filter(
      (option) => !isManagedWifiBrand(bundleDeviceBrand(this.bundle, option.id)),
    );
  }

  _openAddMemberDialog = () => {
    const options = this._addableMemberDevices();
    this._addMemberDeviceId = options[0]?.id ?? null;
    this._addMemberOpen = true;
  };

  private _closeAddMemberDialog = () => {
    this._addMemberOpen = false;
    this._addMemberDeviceId = null;
  };

  private _applyAddMember = () => {
    if (!this.bundle || this.entityId == null || this._addMemberDeviceId == null) return;
    this._commitEditBundleEdit(addActivityMemberDevice(
      this.bundle,
      Number(this.entityId),
      this._addMemberDeviceId,
    ));
    this._closeAddMemberDialog();
  };

  _openMemberRemoveConfirm(activityId: number, deviceId: number, deviceName: string) {
    this._confirmDeleteTarget = { kind: "activity_member", activityId, deviceId };
    this._confirmDeleteLabel = deviceName;
  }

  _memberDeviceName(activityId: number, deviceId: number): string {
    const member = activityMemberViews(this.bundle, activityId)
      .find((candidate) => candidate.deviceId === deviceId);
    return member?.deviceName || TOOLS_CARD_STRINGS.common.deviceFallback(deviceId);
  }

  _renderAddMemberDialog() {
    if (!this._addMemberOpen || !this.bundle) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    const options = this._addableMemberDevices();
    return html`
      <div class="modal-backdrop" @click=${this._closeAddMemberDialog}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S.addMemberTitle}</div>
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} @click=${this._closeAddMemberDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${options.length === 0
              ? html`<div class="backup-drawer-sub">${S.addMemberNoneLeft}</div>`
              : html`
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-add-member-device">${S.addFavoriteDevice}</label>
                    <select
                      id="sb-add-member-device"
                      class="decoded-field-input"
                      @change=${(event: Event) => {
                        const value = Number((event.target as HTMLSelectElement).value);
                        this._addMemberDeviceId = Number.isFinite(value) ? value : null;
                      }}
                    >
                      ${options.map((device) => html`
                        <option value=${device.id} ?selected=${device.id === this._addMemberDeviceId}>${device.label}</option>
                      `)}
                    </select>
                    <div class="decoded-field-helper">${S.addMemberHelper}</div>
                  </div>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note"></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeAddMemberDialog}>${TOOLS_CARD_STRINGS.backup.deleteCancel}</button>
              <button
                class="dialog-btn dialog-btn-primary"
                ?disabled=${options.length === 0 || this._addMemberDeviceId == null}
                @click=${this._applyAddMember}
              >${S.addMemberConfirm}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _applyAddShortcutWifiEvent = async () => {
    if (!this.bundle || this.entityId == null) return;
    const activityId = Number(this.entityId);
    try {
      const ref = await this._events.resolveRef(this._events.primary);
      this._commitEditBundleEdit(addBundleActivityFavorite(
        ref.bundle,
        activityId,
        ref.deviceId,
        ref.commandId,
        sanitizeBundleName(ref.bundle, ref.name),
      ));
      this._closeAddFavoriteDialog();
    } catch (err) {
      this._addFavoriteError = editorErrorMessage(err, "wifi_event");
    }
  };

  private _applyAddShortcut = () => {
    if (!this.bundle || this.entityId == null) return;
    if (this._addShortcutKind === "command") {
      this._applyAddFavorite();
      return;
    }
    if (this._addShortcutKind === "wifi_event") {
      void this._applyAddShortcutWifiEvent();
      return;
    }
    // "action": a new macro, or another activity's macro copied over verbatim.
    // Every existing macro of the activity is a shortcut already, so there is
    // nothing to reference.
    const activityId = Number(this.entityId);
    if (this._addShortcutMacro.mode === "copy") {
      const copied = copyActivityUserMacro(
        this.bundle,
        activityId,
        Number(this._addShortcutMacro.sourceId),
        Number(this._addShortcutMacro.macroId),
      );
      if (copied === this.bundle) {
        this._addFavoriteError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return;
      }
      this._commitEditBundleEdit(copied);
      this._closeAddFavoriteDialog();
      return;
    }
    const name = sanitizeBundleName(this.bundle, this._addShortcutActionName).trim()
      || TOOLS_CARD_STRINGS.backup.newMacroName;
    const next = addActivityUserMacro(this.bundle, activityId, name);
    this._commitEditBundleEdit(next);
    this._closeAddFavoriteDialog();
    const summaries = activityUserMacroSummaries(next, activityId);
    const created = summaries[summaries.length - 1];
    if (created) this._steps.openEditor("activity", activityId, created.buttonId, created.name);
  };

  private _renderAddFavoriteDialog() {
    if (!this._addFavoriteOpen || !this.bundle) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    const kind = this._addShortcutKind;
    // Only what is not a shortcut yet: a command once per activity; a macro is always a new one.
    const devices = this._shortcutDeviceOptions();
    const commands = this._shortcutCommandItems(this._addFavoriteDeviceId);
    const canAdd = kind === "command"
      ? this._addFavoriteDeviceId != null && this._addFavoriteCommandId != null
      : kind === "wifi_event"
        ? !this._events.busy && (
            this._events.primary.mode === "existing"
              ? this._events.primary.slot != null
              : this._events.primary.name.trim().length > 0
          )
        : true;
    const commandFields = devices.length === 0
      ? html`<div class="backup-drawer-sub">${this._editableDeviceOptions().length === 0 ? S.addFavoriteNoDevices : S.addShortcutNoCommandsLeft}</div>`
      : html`
          <div class="field-pair">
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
          </div>
          <div class="decoded-field-helper">${S.addShortcutCommandHelper}</div>
        `;
    const actionFields = html`
      ${this._copyableMacros().length
        ? this._binding.renderMacroSelect({
            id: "sb-add-macro-target",
            mode: this._addShortcutMacro.mode,
            macroId: this._addShortcutMacro.macroId,
            sourceId: this._addShortcutMacro.sourceId,
            own: [],
            allowNew: true,
            onPick: (value: string) => {
              this._addShortcutMacro = macroTargetFromValue(value);
              this._addFavoriteError = "";
            },
          })
        : nothing}
      ${this._addShortcutMacro.mode === "copy"
        ? nothing
        : html`
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
          `}
    `;
    return html`
      <div class="modal-backdrop" @click=${this._closeAddFavoriteDialog}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S.addShortcutTitle}</div>
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} @click=${this._closeAddFavoriteDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${renderKindSegments<ActivityBindingTargetKind>({
              id: "sb-add-shortcut-kind",
              ariaLabel: S.addShortcutKindLabel,
              value: kind,
              options: [
                { value: "command", label: S.shortcutKindCommand },
                { value: "action", label: S.shortcutKindAction },
                ...(this._events.available() ? [{ value: "wifi_event" as const, label: S.shortcutKindWifiEvent }] : []),
              ],
              onChange: (event: Event) => {
                this._addShortcutKind = (event.target as HTMLSelectElement).value as
                  ActivityBindingTargetKind;
                if (this._addShortcutKind === "wifi_event") {
                  this._events.primary = this._events.defaultSel(this._shortcutEventTaken);
                }
                this._addFavoriteError = "";
              },
            })}
            ${kind === "command"
              ? commandFields
              : kind === "wifi_event"
                ? this._events.renderTargetFields({
                    idPrefix: "sb-add-fav",
                    sel: this._events.primary,
                    hidden: this._shortcutEventTaken,
                    onSelChange: (sel) => {
                      this._events.primary = sel;
                      this._addFavoriteError = "";
                    },
                  })
                : actionFields}
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

  _entityKindCrumbLabel(kind: BackupEditTargetKind): string {
    return kind === "activity"
      ? TOOLS_CARD_STRINGS.backup.crumbActivities
      : TOOLS_CARD_STRINGS.backup.crumbDevices;
  }

  // Compact ancestor trail shown above the detail/editor title. Each crumb
  // is a tappable button that pops back to that level; the trailing "›"
  // leads the eye into the current page's big title beneath it.
  _renderDetailCrumbs(crumbs: Array<{ label: string; onClick: () => void }>) {
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

  private _applyEditRenameDialog = () => {
    const target = this._editRenameDialogTarget;
    if (!target || !this.bundle) return;
    // The IP dialog runs through its own validation / save path; it
    // does not share the name-sanitizer's empty-string guard because
    // an empty IP is the legitimate "no IP set" shape for the wire.
    if (target.kind === "device_ip") {
      const draft = this._editRenameDialogDraft.trim();
      if (draft && !IPV4_PATTERN.test(draft)) {
        this._editRenameDialogError = TOOLS_CARD_STRINGS.backup.ipv4Required;
        return;
      }
      this._commitEditBundleEdit(updateBundleDeviceIp(this.bundle, target.deviceId, draft));
      this._closeEditRenameDialog();
      return;
    }
    const next = sanitizeBundleName(this.bundle, this._editRenameDialogDraft);
    if (!next) {
      this._editRenameDialogError = TOOLS_CARD_STRINGS.backup.enterName;
      return;
    }
    if (target.kind === "detail") {
      if (target.entityKind === "activity") this._applyActivityRename(target.entityId, next);
      else this._applyDeviceRename(target.entityId, next);
      this._closeEditRenameDialog();
      return;
    }
    if (target.kind === "macro") {
      this._commitEditBundleEdit(renameBundleActivityMacro(this.bundle, target.activityId, target.buttonId, next));
      // If the renamed macro is the one open in the step editor, refresh its
      // title so the rename shows immediately without backing out.
      if (
        this._steps.editor &&
        this._steps.editor.scope === "activity" &&
        this._steps.editor.entityId === target.activityId &&
        this._steps.editor.buttonId === target.buttonId
      ) {
        this._steps.editor = { ...this._steps.editor, name: next };
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

  _macroName(buttonId: number | null | undefined): string {
    if (!this.bundle || this.entityId == null) return "";
    const bId = Number(buttonId || 0);
    return activityUserMacroSummaries(this.bundle, Number(this.entityId))
      .find((macro) => macro.buttonId === bId)?.name ?? "";
  }

  /** The other activities' macros, offered as copies in the macro dropdown. */
  _copyableMacros() {
    if (!this.bundle || this.entityId == null) return [];
    return copyableActivityMacroSummaries(this.bundle, Number(this.entityId));
  }

  _macroOptions(): Array<{ value: number; label: string }> {
    if (!this.bundle || this.entityId == null) return [];
    return activityUserMacroSummaries(this.bundle, Number(this.entityId))
      .map((macro) => ({ value: macro.buttonId, label: macro.name }));
  }

  // A shortcut references a command (or Wifi Event) at most once per
  // activity, so the Add shortcut dialog offers only what is not a shortcut
  // yet. Button bindings have no such limit: any number of buttons may play
  // the same command or macro.

  _shortcutDeviceOptions() {
    if (!this.bundle || this.entityId == null) return [];
    return activityShortcutDeviceOptions(this.bundle, Number(this.entityId), this._editableDeviceOptions());
  }

  _shortcutCommandItems(deviceId: number | null) {
    if (!this.bundle || this.entityId == null || deviceId == null) return [];
    return activityShortcutCommandItems(this.bundle, Number(this.entityId), deviceId);
  }

  /** A Wifi Event the activity already shortcuts (its short record is a favorite). */
  _shortcutEventTaken = (event: Pick<WifiEvent, "device_id" | "command_id">): boolean =>
    event.device_id != null
    && this.entityId != null
    && activityHasFavorite(this.bundle, Number(this.entityId), event.device_id, event.command_id);

  /** Seat the binding dialog macro target on the first existing macro (or a new one). */
  _resetMacroTarget(prefix: "binding" | "bindingLp") {
    const firstMacro = this._macroOptions()[0] ?? null;
    const mode: MacroTargetMode = firstMacro ? "existing" : "new";
    if (prefix === "binding") {
      this._binding.macroMode = mode;
      this._binding.macroId = firstMacro?.value ?? null;
      return;
    }
    this._binding.lpMacroMode = mode;
    this._binding.lpMacroId = firstMacro?.value ?? null;
  }

  _captureCurrentScrollPosition() {
    const root = this.renderRoot as ParentNode | undefined;
    const scrollEl = root?.querySelector<HTMLElement>(".detail-scroll");
    if (!scrollEl) return;
    if (this._bindingsView) this._bindingsScrollTop = scrollEl.scrollTop;
    else this._detailScrollTop = scrollEl.scrollTop;
  }

  _restoreMainScroll() {
    void this.updateComplete.then(() => {
      const root = this.renderRoot as ParentNode | undefined;
      const scrollEl = root?.querySelector<HTMLElement>(".detail-scroll");
      if (scrollEl) scrollEl.scrollTop = this._detailScrollTop;
    });
  }

  _restoreBindingsScroll() {
    void this.updateComplete.then(() => {
      const root = this.renderRoot as ParentNode | undefined;
      const scrollEl = root?.querySelector<HTMLElement>(".detail-scroll");
      if (scrollEl) scrollEl.scrollTop = this._bindingsScrollTop;
    });
  }

  _renderBindingSelect(params: {
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

  /** The drag handle doubles as the keyboard way to reorder: focus it and
   *  press the up/down arrows (CR-F2-11). Focus follows the moved row. */
  _renderReorderHandle(label: string, position: number, count: number, move: (delta: -1 | 1) => void) {
    return html`
      <div
        class="quick-access-drag"
        role="button"
        tabindex="0"
        aria-label=${TOOLS_CARD_STRINGS.backup.reorderHandleAria(label)}
        @keydown=${(event: KeyboardEvent) => {
          const delta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
          if (!delta) return;
          event.preventDefault();
          const target = position + delta;
          if (target < 0 || target >= count) return;
          const list = (event.currentTarget as HTMLElement).closest(".quick-access-list");
          move(delta);
          void this.updateComplete.then(() => {
            (list?.querySelectorAll<HTMLElement>(".quick-access-drag")[target])?.focus();
          });
        }}
      >
        <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
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
            if (!disabled) this._steps.openEditor(scope, entityId, buttonId, label);
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
        ${isDevice ? nothing : this._renderActivityMemberBlock(entityId)}
      </div>
    `;
  }

  /**
   * One-line member summary under the Activity power-sequence rows. The
   * sequences themselves are the management surface (Add device beside
   * Add step; deleting a power-ref row removes the device), so the
   * section level keeps only the glanceable roster: device names with
   * their configured input in parentheses.
   */
  private _renderActivityMemberBlock(activityId: number) {
    if (!this.bundle) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    const members = activityMemberViews(this.bundle, activityId);
    const names = members.map((member) =>
      member.inputOrdinal > 0 && member.inputCommandName
        ? `${member.deviceName} (${member.inputCommandName})`
        : member.deviceName,
    ).join(", ");
    return html`
      <div class="quick-access-sub power-members-summary" data-kind="member-summary">
        ${members.length ? S.memberSummary(names) : S.memberSummaryEmpty}
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

  _selectedEditTitle() {
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
