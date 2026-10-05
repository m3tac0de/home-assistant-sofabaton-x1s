// The activity editor (docs/internal/server-panel-activity-editor-plan.md): the
// HA control panel card's live "Edit activity" screen recreated on the
// snapshot document, with the card's containers, class names, section order,
// sub-views, dialogs and wording. The frame (load, guards, draft slot, exit
// dialog, Sync, stale and failed states, delete) is the shared base; the
// card's pure bundle helpers and its English string table are imported from
// the card's tree, the templates are mirrored (state plan decision 12).
//
// The screen: Power control (the two sequences and the member line), Buttons
// on the remote (the four role rows and the drill-in to Individual buttons),
// Shortcuts on the remote screen (favorites and macros in one draggable
// list). Sub-views: the macro step editor (power sequences with Add device,
// member removal and Set input; user macros with rename) and Individual
// buttons. Sync is one `PUT /activities/{id}` with `If-Match`, carrying the
// device elements the edit touched (plan decision 4).
//
// Wifi Events are switched off (`WIFI_EVENTS_ENABLED`, plan decision 9): the
// callback device is an ordinary device in every picker. With the flag on,
// its slots are reached through the "Wifi Event" type and the device leaves
// the pickers, as the card does with its Wifi Events device.

import { html, nothing, type PropertyDeclarations, type TemplateResult } from "lit";
import {
  mdiArrowLeft,
  mdiChevronDown,
  mdiChevronRight,
  mdiClose,
  mdiContentCopy,
  mdiDialpad,
  mdiDragVerticalVariant,
  mdiFormatListNumbered,
  mdiGamepadRoundOutline,
  mdiGestureTap,
  mdiGestureTapButton,
  mdiGestureTapHold,
  mdiInformationOutline,
  mdiLinkVariant,
  mdiPencil,
  mdiPlayPause,
  mdiPlaylistEdit,
  mdiPlus,
  mdiPound,
  mdiPower,
  mdiStarOutline,
  mdiTrashCanOutline,
  mdiTuneVariant,
  mdiVolumeHigh,
} from "@mdi/js";

import type { BackupBundleActivityPayload, BackupBundleDevicePayload, BackupBundlePayload } from "../../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { TOOLS_CARD_STRINGS } from "../../../custom_components/sofabaton_x1s/www/src/strings";
import { anchoredListPosition, moveListFocus, overlayMenuPosition, menuAnchorRect } from "../../../custom_components/sofabaton_x1s/www/src/shared/utils/overlay-menu";
import {
  activityAddableDevices,
  activityButtonBindingItems,
  activityHasFavorite,
  activityMacroStepItems,
  activityMemberViews,
  activityQuickAccessItems,
  activityRoleAssignments,
  activityShortcutCommandItems,
  activityShortcutDeviceOptions,
  activityUserMacroSummaries,
  addActivityMacroCommandStep,
  copyActivityShortcuts,
  copyActivityUserMacro,
  shortcutCopySources,
  copyableActivityMacroSummaries,
  macroCopyValue,
  macroTargetFromValue,
  addActivityMemberDevice,
  addActivityUserMacro,
  addBundleActivityFavorite,
  applyBundleDelete,
  backupDeleteHasCascade,
  bundleDeleteImpact,
  bundleDeviceOptions,
  buttonName,
  clearActivityDeviceInput,
  deviceCommandItems,
  removeActivityMacroStep,
  renameBundleActivity,
  renameBundleActivityFavorite,
  renameBundleActivityMacro,
  reorderActivityMacroSteps,
  reorderBundleActivityQuickAccess,
  roleMappableButtonCount,
  setActivityDeviceInput,
  setActivityMacroStepWait,
  setActivityRoleDevice,
  unboundButtonsForActivity,
  updateActivityMacroStep,
  upsertActivityButtonBinding,
  type ActivityRoleAssignment,
  type ActivityRoleGroupId,
  type BackupActivityQuickAccessItem,
  type BackupButtonBindingItem,
  type BackupDeleteTarget,
  type BackupMacroStepItem,
} from "../../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";
import type { ApiResponse, JobView, SnapshotEntity } from "../panel-api";
import { OPERATION_PROGRESS_CSS } from "../components/operation-progress";
import { PANEL_BASE_CSS } from "../panel-styles";
import { PointerReorder } from "../pointer-reorder";
import { WIFI_EVENTS_ENABLED, targetKindFor, wifiEventSlots, type ActivityTargetKind, type WifiEventSlot } from "./activity-editor-state";
import { sanitizeName } from "./device-editor-state";
import { EDITOR_CSS } from "./editor-styles";
import { SbPanelEntityEditor, icon, type EntityFrameStrings } from "./entity-editor-base";
import { byteToSeconds, secondsToByte, type EntityElement } from "./entity-editor-state";

export const ACTIVITY_EDITOR_TAG = "sb-panel-activity-editor";

// The card's strings, imported so they stay verbatim.
const B = TOOLS_CARD_STRINGS.backup;
const A = TOOLS_CARD_STRINGS.activities;
const C = TOOLS_CARD_STRINGS.common;

const FRAME: EntityFrameStrings = {
  loading: A.capturingFromCache("activity"),
  back: A.back,
  firmwareUnsupportedTitle: A.firmwareUnsupportedTitle,
  firmwareUnsupportedBody: A.firmwareUnsupportedBody,
  needsRefreshTitle: A.needsRefreshTitle,
  needsRefreshBody: A.needsRefreshBody("activity"),
  refreshEntity: "Refresh activity",
  missingTitle: "Activity not found",
  missingBody: "This activity is not in the hub's snapshot.",
  syncFailedTitle: A.syncFailedTitle,
  syncStaleTitle: A.syncStaleTitle("activity"),
  syncStaleBody: A.syncStaleBody("activity"),
  syncRetry: A.syncRetry,
  syncReload: A.syncReload,
  syncKeepEditing: A.syncKeepEditing,
  exitUnsyncedTitle: A.exitUnsyncedTitle,
  exitUnsyncedBody: A.exitUnsyncedBody("activity"),
  exitSyncNow: A.exitSyncNow,
  exitWithoutSync: A.exitWithoutSync,
};

// The panel's own lines.
const P = {
  dragShortcutAria: "Drag to reorder (arrow keys move the shortcut)",
  dragStepAria: "Drag to reorder (arrow keys move the step)",
  stepChipRequired: "required",
  stepChipCommand: "command",
  wifiEventLongPressNote: "Long press fires this event's long-press record. The server reports it on the event stream as a long press.",
  wifiEventNoSlots: "The callback device has no slots.",
};

const POWER_ON = 198;
const POWER_OFF = 199;

const ROLE_ICONS: Record<ActivityRoleGroupId, string> = {
  volume: mdiVolumeHigh,
  navigation: mdiGamepadRoundOutline,
  playback: mdiPlayPause,
  channels: mdiPound,
  numpad: mdiDialpad,
};

function roleLabel(group: ActivityRoleGroupId): string {
  switch (group) {
    case "volume":
      return B.roleVolume;
    case "navigation":
      return B.roleNavigation;
    case "playback":
      return B.rolePlayback;
    case "channels":
      return B.roleChannels;
    case "numpad":
      return B.roleNumpad;
  }
}

function roleTriggerLabel(role: ActivityRoleAssignment): string {
  switch (role.state) {
    case "device":
      return role.deviceName ?? "";
    case "customized":
      return B.roleCustomized(role.deviceName ?? "");
    case "custom":
      return B.roleCustom;
    case "unused":
      return B.roleNotUsed;
  }
}

// "copy" brings another activity's macro over verbatim; it is not a "new" item.
type MacroTargetMode = "existing" | "new" | "copy";

type RenameTarget = { kind: "activity" } | { kind: "macro"; buttonId: number } | { kind: "favorite"; buttonId: number; label: string };

interface MacroTargetState {
  mode: MacroTargetMode;
  macroId: number | null;
  /** The source activity while copying (mode "copy"; macroId is then the source macro). */
  sourceId?: number | null;
  name: string;
}

interface AddShortcutState extends MacroTargetState {
  kind: ActivityTargetKind;
  deviceId: number | null;
  commandId: number | null;
  slot: number | null;
  error: string;
}

interface BindingDialogState {
  editButtonId: number | null;
  buttonId: number | null;
  kind: ActivityTargetKind;
  deviceId: number | null;
  commandId: number | null;
  macro: MacroTargetState;
  slot: number | null;
  longPress: boolean;
  lpKind: "command" | "action";
  lpDeviceId: number | null;
  lpCommandId: number | null;
  lpMacro: MacroTargetState;
  error: string;
}

interface StepDialogState {
  editIndex: number | null;
  kind: "command" | "input" | "wifi_event";
  deviceId: number | null;
  commandId: number | null;
  slot: number | null;
  hold: string;
  error: string;
}

export class SbPanelActivityEditor extends SbPanelEntityEditor {
  static properties: PropertyDeclarations = {
    activityId: { attribute: false },
    _rename: { state: true },
    _deleteConfirm: { state: true },
    _macroEditor: { state: true },
    _bindingsView: { state: true },
    _roleMenu: { state: true },
    _macroPicker: { state: true },
    _shortcutCopyMenu: { state: true },
    _roleConfirm: { state: true },
    _addShortcut: { state: true },
    _addMember: { state: true },
    _binding: { state: true },
    _stepDialog: { state: true },
  };

  static styles = [PANEL_BASE_CSS, EDITOR_CSS, OPERATION_PROGRESS_CSS];

  activityId: number | null = null;

  protected readonly entityKind = "activity" as const;
  protected get entityId(): number | null {
    return this.activityId;
  }

  private _rename: { target: RenameTarget; draft: string; error: string } | null = null;
  private _deleteConfirm: { target: BackupDeleteTarget; label: string } | null = null;
  /** The open sequence or macro (the card's macro step editor sub-view). */
  private _macroEditor: { buttonId: number; name: string } | null = null;
  /** The "Individual buttons" sub-view. */
  private _bindingsView = false;
  private _roleMenu: { group: ActivityRoleGroupId; anchor: DOMRect | null } | null = null;
  /** The open macro picker (one at a time): its trigger id and the list's fixed position. */
  private _macroPicker: { id: string; style: string } | null = null;
  /** The open "Copy shortcuts from" menu: its fixed position, null when closed. */
  private _shortcutCopyMenu: string | null = null;
  private _roleConfirm: { group: ActivityRoleGroupId; deviceId: number | null } | null = null;
  private _addShortcut: AddShortcutState | null = null;
  private _addMember: { deviceId: number | null } | null = null;
  private _binding: BindingDialogState | null = null;
  private _stepDialog: StepDialogState | null = null;
  private _mainScrollY = 0;
  private _bindingsScrollY = 0;
  /** One sorter for both lists: the macro editor shows steps, the main view shortcuts. */
  private _sorter = new PointerReorder(
    () => Array.from(this.renderRoot.querySelectorAll<HTMLElement>("[data-sort-index]")),
    () => this.requestUpdate(),
    (from, to) => (this._macroEditor ? this._moveStep(from, to - from) : this._moveShortcut(from, to - from)),
    () => this._stickyOffset(),
  );
  /** The role menus are fixed to the viewport, so a scroll closes them (the card's rule). */
  private readonly _onWindowScroll = () => {
    if (this._roleMenu) this._roleMenu = null;
    if (this._shortcutCopyMenu !== null) this._shortcutCopyMenu = null;
  };

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("scroll", this._onWindowScroll, { passive: true });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._sorter.cancel();
    window.removeEventListener("scroll", this._onWindowScroll);
  }

  protected _resetView(): void {
    this._rename = null;
    this._deleteConfirm = null;
    this._macroEditor = null;
    this._bindingsView = false;
    this._roleMenu = null;
    this._roleConfirm = null;
    this._addShortcut = null;
    this._addMember = null;
    this._binding = null;
    this._stepDialog = null;
    this._sorter.cancel();
  }

  protected get frameStrings(): EntityFrameStrings {
    return FRAME;
  }

  protected _startSync(hubId: string, activityId: number, element: EntityElement, devices: BackupBundleDevicePayload[], snapshotId: string): Promise<ApiResponse<JobView>> {
    return this.api.editActivity(hubId, activityId, element as unknown as SnapshotEntity, devices as unknown as SnapshotEntity[], snapshotId);
  }

  protected _startDelete(hubId: string, activityId: number): Promise<ApiResponse<JobView>> {
    return this.api.removeActivity(hubId, activityId);
  }

  protected _renderEditing(): TemplateResult {
    if (this._macroEditor) return this._renderMacroEditor(this._macroEditor);
    if (this._bindingsView) return this._renderBindingsView();
    return this._renderEditor();
  }

  // -- reads ------------------------------------------------------------------------------------------

  private get _title(): string {
    return String((this._workingEntity as BackupBundleActivityPayload | null)?.device?.name ?? "").trim();
  }

  private get _wifiSlots(): WifiEventSlot[] {
    return WIFI_EVENTS_ENABLED ? wifiEventSlots(this._working, this._callbackDeviceId) : [];
  }

  private get _wifiEventsAvailable(): boolean {
    return this._wifiSlots.length > 0;
  }

  /** With Wifi Events on, the callback device leaves the pickers: its slots are the "Wifi Event" type (plan decision 8). */
  private _pickable(option: { id: number }): boolean {
    return !WIFI_EVENTS_ENABLED || option.id !== this._callbackDeviceId;
  }

  private _deviceOptions(): Array<{ id: number; label: string }> {
    return bundleDeviceOptions(this._working).filter((option) => this._pickable(option));
  }

  private _addableMembers(): Array<{ id: number; label: string }> {
    if (!this._working || this.activityId == null) return [];
    return activityAddableDevices(this._working, this.activityId).filter((option) => this._pickable(option));
  }

  private _macroOptions(): Array<{ value: number; label: string }> {
    if (!this._working || this.activityId == null) return [];
    return activityUserMacroSummaries(this._working, this.activityId).map((macro) => ({ value: macro.buttonId, label: macro.name }));
  }

  /** The other activities' macros, offered as copies in the macro dropdown. */
  private _copyableMacros(): ReturnType<typeof copyableActivityMacroSummaries> {
    if (!this._working || this.activityId == null) return [];
    return copyableActivityMacroSummaries(this._working, this.activityId);
  }

  private _macroName(buttonId: number | null | undefined): string {
    return this._macroOptions().find((macro) => macro.value === Number(buttonId || 0))?.label ?? "";
  }

  private _firstCommandId(deviceId: number | null): number | null {
    return deviceId != null && this._working ? deviceCommandItems(this._working, deviceId)[0]?.commandId ?? null : null;
  }

  // A shortcut references a command (or Wifi Event) at most once per activity, so the Add
  // shortcut dialog offers only what is not a shortcut yet. Button bindings have no such
  // limit: any number of buttons may play the same command or macro.

  private _shortcutDeviceOptions(): Array<{ id: number; label: string }> {
    if (!this._working || this.activityId == null) return [];
    return activityShortcutDeviceOptions(this._working, this.activityId, this._deviceOptions());
  }

  private _shortcutCommandOptions(deviceId: number | null): Array<{ value: number; label: string }> {
    if (deviceId == null || !this._working || this.activityId == null) return [];
    return activityShortcutCommandItems(this._working, this.activityId, deviceId).map((command) => ({ value: command.commandId, label: command.label }));
  }

  /** The Wifi Events not shortcutted on the activity yet (the short record is the favorite). */
  private _shortcutWifiSlots(): WifiEventSlot[] {
    const callbackDeviceId = this._callbackDeviceId;
    const activityId = this.activityId;
    if (callbackDeviceId == null || activityId == null) return [];
    return this._wifiSlots.filter((slot) => !activityHasFavorite(this._working, activityId, callbackDeviceId, slot.shortCommandId));
  }

  private _defaultMacroTarget(): MacroTargetState {
    const first = this._macroOptions()[0] ?? null;
    return { mode: first ? "existing" : "new", macroId: first?.value ?? null, name: "" };
  }

  private _kindFor(deviceId: number | null | undefined): ActivityTargetKind {
    return targetKindFor(Number(this.activityId), this._callbackDeviceId, this._wifiEventsAvailable, deviceId);
  }

  // -- sub-view navigation (the page scrolls, so its position is kept per level) -------------------------

  private _openMacroEditor(buttonId: number, name: string): void {
    if (this._bindingsView) this._bindingsScrollY = window.scrollY;
    else this._mainScrollY = window.scrollY;
    this._macroEditor = { buttonId: Number(buttonId), name };
    this._stepDialog = null;
    window.scrollTo({ top: 0 });
  }

  private _closeMacroEditor = (): void => {
    this._macroEditor = null;
    this._stepDialog = null;
    this._sorter.cancel();
    this._restoreScroll(this._bindingsView ? this._bindingsScrollY : this._mainScrollY);
  };

  private _openBindingsView = (): void => {
    this._mainScrollY = window.scrollY;
    this._roleMenu = null;
    this._bindingsView = true;
    window.scrollTo({ top: 0 });
  };

  private _closeBindingsView = (): void => {
    this._bindingsView = false;
    this._binding = null;
    this._deleteConfirm = null;
    this._restoreScroll(this._mainScrollY);
  };

  private _restoreScroll(top: number): void {
    void this.updateComplete.then(() => window.scrollTo({ top }));
  }

  // -- rename (activity, macro) ----------------------------------------------------------------------------

  private _openRename(target: RenameTarget): void {
    const draft = target.kind === "activity" ? this._title : target.kind === "favorite" ? target.label : this._macroName(target.buttonId) || this._macroEditor?.name || "";
    this._rename = { target, draft, error: "" };
  }

  private _closeRename = (): void => {
    this._rename = null;
  };

  private _renameInput = (event: Event): void => {
    if (!this._rename) return;
    const input = event.currentTarget as HTMLInputElement;
    const value = sanitizeName(this._hubVersion, input.value);
    input.value = value;
    this._rename = { ...this._rename, draft: value, error: "" };
  };

  private _applyRename = (): void => {
    const dialog = this._rename;
    const activityId = this.activityId;
    if (!dialog || activityId == null || !this._working) return;
    const next = sanitizeName(this._hubVersion, dialog.draft);
    if (!next) {
      this._rename = { ...dialog, error: B.enterName };
      return;
    }
    if (dialog.target.kind === "activity") {
      this._commit(renameBundleActivity(this._working, activityId, next));
    } else if (dialog.target.kind === "favorite") {
      // Offline only (the card's rule): a live favorite carries its command's name.
      this._commit(renameBundleActivityFavorite(this._working, activityId, dialog.target.buttonId, next));
    } else {
      this._commit(renameBundleActivityMacro(this._working, activityId, dialog.target.buttonId, next));
      if (this._macroEditor?.buttonId === dialog.target.buttonId) this._macroEditor = { ...this._macroEditor, name: next };
    }
    this._rename = null;
  };

  // -- delete confirm ----------------------------------------------------------------------------------------

  private _openDeleteConfirm(target: BackupDeleteTarget, label: string): void {
    this._deleteConfirm = { target, label };
  }

  private _closeDeleteConfirm = (): void => {
    this._deleteConfirm = null;
  };

  private _confirmDelete = (): void => {
    const dialog = this._deleteConfirm;
    if (!dialog || !this._working) return;
    this._deleteConfirm = null;
    if (dialog.target.kind === "activity") {
      void this._deleteEntity();
      return;
    }
    // Live row deletes never rewrite membership (the sync's scope guard); an offline edit keeps the full reconcile.
    this._commit(applyBundleDelete(this._working, dialog.target, { reconcileMembership: this._offline }));
  };

  private _deleteTitle(target: BackupDeleteTarget, label: string): string {
    const name = label || B.thisItem;
    switch (target.kind) {
      case "activity":
        return B.deleteActivityTitle(name);
      case "favorite":
        return B.deleteFavoriteTitle(name);
      case "macro":
        return B.deleteMacroTitle(name);
      case "activity_binding":
        return B.deleteBindingTitle(name);
      case "activity_member":
        return B.activityRemoveDeviceTitle(name);
      default:
        return name;
    }
  }

  // -- roles ---------------------------------------------------------------------------------------------------

  private _assignRole(group: ActivityRoleGroupId, deviceId: number | null): void {
    this._roleMenu = null;
    const activityId = this.activityId;
    if (!this._working || activityId == null) return;
    const current = activityRoleAssignments(this._working, activityId).find((role) => role.group === group);
    if (current && current.deviceId === deviceId && current.state !== "customized" && deviceId != null) return;
    // Overwriting hand-tuned bindings (customized / custom) needs a confirm.
    if (current && (current.state === "customized" || current.state === "custom")) {
      this._roleConfirm = { group, deviceId };
      return;
    }
    this._commit(setActivityRoleDevice(this._working, activityId, group, deviceId));
  }

  private _confirmRole = (): void => {
    const pending = this._roleConfirm;
    this._roleConfirm = null;
    if (!pending || !this._working || this.activityId == null) return;
    this._commit(setActivityRoleDevice(this._working, this.activityId, pending.group, pending.deviceId));
  };

  // -- shortcuts ------------------------------------------------------------------------------------------------

  private _shortcutItems(): BackupActivityQuickAccessItem[] {
    return this._working && this.activityId != null ? activityQuickAccessItems(this._working, this.activityId) : [];
  }

  private _moveShortcut(position: number, delta: number): void {
    const activityId = this.activityId;
    if (!this._working || activityId == null) return;
    const items = this._shortcutItems();
    const target = position + delta;
    if (target < 0 || target >= items.length || target === position) return;
    const next = [...items];
    const [moved] = next.splice(position, 1);
    next.splice(target, 0, moved);
    this._commit(reorderBundleActivityQuickAccess(this._working, activityId, next.map((item) => ({ kind: item.kind, buttonId: item.buttonId }))));
  }

  private _openAddShortcut = (): void => {
    this._macroPicker = null;
    if (!this._working || this.activityId == null) return;
    const deviceId = this._shortcutDeviceOptions()[0]?.id ?? null;
    // The macro kind only creates: every existing macro of the activity is a shortcut already.
    this._addShortcut = { kind: "command", deviceId, commandId: this._shortcutCommandOptions(deviceId)[0]?.value ?? null, slot: this._shortcutWifiSlots()[0]?.slot ?? null, error: "", mode: "new", macroId: null, sourceId: null, name: "" };
  };

  private _closeAddShortcut = (): void => {
    this._addShortcut = null;
  };

  /** A macro target resolved to an id, creating the macro when the dialog asked for a new one (the card's `_resolveMacroTarget`). */
  private _resolveMacro(bundle: BackupBundlePayload, target: MacroTargetState): { bundle: BackupBundlePayload; macroId: number; name: string; created: boolean } | null {
    const activityId = Number(this.activityId);
    if (target.mode === "copy") {
      // Verbatim, so nothing to open afterwards: not "created" in the editor sense.
      const copiedBundle = copyActivityUserMacro(bundle, activityId, Number(target.sourceId), Number(target.macroId));
      if (copiedBundle === bundle) return null;
      const copies = activityUserMacroSummaries(copiedBundle, activityId);
      const copy = copies[copies.length - 1];
      return copy ? { bundle: copiedBundle, macroId: copy.buttonId, name: copy.name, created: false } : null;
    }
    if (target.mode === "existing") {
      const existing = activityUserMacroSummaries(bundle, activityId).find((macro) => macro.buttonId === Number(target.macroId));
      return existing ? { bundle, macroId: existing.buttonId, name: existing.name, created: false } : null;
    }
    const name = sanitizeName(this._hubVersion, target.name).trim() || B.newMacroName;
    const next = addActivityUserMacro(bundle, activityId, name);
    const summaries = activityUserMacroSummaries(next, activityId);
    const created = summaries[summaries.length - 1];
    return created ? { bundle: next, macroId: created.buttonId, name: created.name, created: true } : null;
  }

  private _applyAddShortcut = (): void => {
    const dialog = this._addShortcut;
    const activityId = this.activityId;
    if (!dialog || !this._working || activityId == null) return;
    if (dialog.kind === "command") {
      if (dialog.deviceId == null || dialog.commandId == null) {
        this._addShortcut = { ...dialog, error: B.addFavoriteNoCommands };
        return;
      }
      // A favorite has no name of its own: the row carries a copy of the command's label.
      const command = deviceCommandItems(this._working, dialog.deviceId).find((item) => item.commandId === dialog.commandId);
      this._commit(addBundleActivityFavorite(this._working, activityId, dialog.deviceId, dialog.commandId, sanitizeName(this._hubVersion, command?.label ?? "")));
      this._addShortcut = null;
      return;
    }
    if (dialog.kind === "wifi_event") {
      const slot = this._wifiSlots.find((entry) => entry.slot === dialog.slot);
      if (!slot || this._callbackDeviceId == null) {
        this._addShortcut = { ...dialog, error: B.bindingIncomplete };
        return;
      }
      this._commit(addBundleActivityFavorite(this._working, activityId, this._callbackDeviceId, slot.shortCommandId, sanitizeName(this._hubVersion, slot.label)));
      this._addShortcut = null;
      return;
    }
    // "action": a new macro is created, then opens; a copied macro is complete as it is.
    const resolved = this._resolveMacro(this._working, dialog);
    if (!resolved) {
      this._addShortcut = { ...dialog, error: B.bindingIncomplete };
      return;
    }
    this._commit(resolved.bundle);
    this._addShortcut = null;
    if (resolved.created) this._openMacroEditor(resolved.macroId, resolved.name);
  };

  // -- members ----------------------------------------------------------------------------------------------------

  private _openAddMember = (): void => {
    this._addMember = { deviceId: this._addableMembers()[0]?.id ?? null };
  };

  private _closeAddMember = (): void => {
    this._addMember = null;
  };

  private _applyAddMember = (): void => {
    const dialog = this._addMember;
    if (!dialog || dialog.deviceId == null || !this._working || this.activityId == null) return;
    this._commit(addActivityMemberDevice(this._working, this.activityId, dialog.deviceId));
    this._addMember = null;
  };

  private _memberName(deviceId: number): string {
    const member = activityMemberViews(this._working, Number(this.activityId)).find((candidate) => candidate.deviceId === deviceId);
    return member?.deviceName || C.deviceFallback(deviceId);
  }

  // -- the binding dialog ---------------------------------------------------------------------------------------------

  private _commandOptions(deviceId: number | null): Array<{ value: number; label: string }> {
    if (deviceId == null || !this._working) return [];
    return deviceCommandItems(this._working, deviceId).map((command) => ({ value: command.commandId, label: command.label }));
  }

  private _openAddBinding = (): void => {
    this._macroPicker = null;
    const activityId = this.activityId;
    if (!this._working || activityId == null) return;
    const unbound = unboundButtonsForActivity(this._working, activityId);
    if (!unbound.length) return;
    const deviceId = this._deviceOptions()[0]?.id ?? null;
    const commandId = this._firstCommandId(deviceId);
    this._binding = {
      editButtonId: null, buttonId: unbound[0].code, kind: "command", deviceId, commandId, macro: this._defaultMacroTarget(), slot: this._wifiSlots[0]?.slot ?? null,
      longPress: false, lpKind: "command", lpDeviceId: deviceId, lpCommandId: commandId, lpMacro: this._defaultMacroTarget(), error: "",
    };
  };

  private _openEditBinding(buttonId: number): void {
    this._macroPicker = null;
    const activityId = this.activityId;
    if (!this._working || activityId == null) return;
    const item = activityButtonBindingItems(this._working, activityId).find((entry) => entry.buttonId === Number(buttonId));
    if (!item) return;
    const kind = this._kindFor(item.deviceId);
    const lpDeviceId = item.longPress?.deviceId ?? item.deviceId ?? null;
    const lpKind = this._kindFor(lpDeviceId) === "action" ? "action" : "command";
    this._binding = {
      editButtonId: item.buttonId, buttonId: item.buttonId, kind,
      deviceId: item.deviceId ?? null, commandId: item.commandId,
      macro: kind === "action" ? { mode: "existing", macroId: item.commandId, name: this._macroName(item.commandId) } : { mode: "new", macroId: null, name: "" },
      // A Wifi Event binding is atomic: the short record maps to its slot (command id = slot + 1).
      slot: kind === "wifi_event" ? Number(item.commandId) - 1 : this._wifiSlots[0]?.slot ?? null,
      longPress: Boolean(item.longPress), lpKind, lpDeviceId, lpCommandId: item.longPress?.commandId ?? null,
      lpMacro: lpKind === "action" ? { mode: "existing", macroId: item.longPress?.commandId ?? null, name: this._macroName(item.longPress?.commandId) } : { mode: "new", macroId: null, name: "" },
      error: "",
    };
  }

  private _closeBinding = (): void => {
    this._binding = null;
  };

  private _setBindingKind(kind: ActivityTargetKind): void {
    const dialog = this._binding;
    if (!dialog) return;
    if (kind === "command") {
      const devices = this._deviceOptions();
      const deviceId = devices.some((device) => device.id === dialog.deviceId) ? dialog.deviceId : devices[0]?.id ?? null;
      this._binding = { ...dialog, kind, deviceId, commandId: this._firstCommandId(deviceId), error: "" };
    } else if (kind === "wifi_event") {
      this._binding = { ...dialog, kind, slot: this._wifiSlots[0]?.slot ?? null, error: "" };
    } else {
      this._binding = { ...dialog, kind, macro: { ...this._defaultMacroTarget(), name: dialog.macro.name || this._macroName(dialog.commandId) }, error: "" };
    }
  }

  private _setBindingLpKind(kind: "command" | "action"): void {
    const dialog = this._binding;
    if (!dialog) return;
    if (kind === "command") {
      const devices = this._deviceOptions();
      const lpDeviceId = devices.some((device) => device.id === dialog.lpDeviceId) ? dialog.lpDeviceId : devices[0]?.id ?? null;
      this._binding = { ...dialog, lpKind: kind, lpDeviceId, lpCommandId: this._firstCommandId(lpDeviceId), error: "" };
    } else {
      this._binding = { ...dialog, lpKind: kind, lpMacro: { ...this._defaultMacroTarget(), name: dialog.lpMacro.name || this._macroName(dialog.lpCommandId) }, error: "" };
    }
  }

  private _toggleBindingLongPress(enabled: boolean): void {
    const dialog = this._binding;
    if (!dialog) return;
    if (!enabled) {
      this._binding = { ...dialog, longPress: false };
      return;
    }
    const devices = this._deviceOptions();
    const lpDeviceId = devices.some((device) => device.id === dialog.lpDeviceId) ? dialog.lpDeviceId : devices[0]?.id ?? null;
    const commands = this._commandOptions(lpDeviceId);
    const lpCommandId = commands.some((command) => command.value === dialog.lpCommandId) ? dialog.lpCommandId : commands[0]?.value ?? null;
    this._binding = { ...dialog, longPress: true, lpKind: "command", lpDeviceId, lpCommandId };
  }

  private _applyBinding = (): void => {
    const dialog = this._binding;
    const activityId = this.activityId;
    if (!dialog || !this._working || activityId == null) return;
    const fail = () => { this._binding = { ...dialog, error: B.bindingIncomplete }; };
    const buttonId = Number(dialog.buttonId);
    if (!buttonId) return fail();
    // A Wifi Event binding is atomic: short and long come from one slot, never an independent long-press target.
    if (dialog.kind === "wifi_event") {
      const slot = this._wifiSlots.find((entry) => entry.slot === dialog.slot);
      if (!slot || this._callbackDeviceId == null) return fail();
      const deviceId = this._callbackDeviceId;
      this._commit(upsertActivityButtonBinding(this._working, activityId, {
        buttonId, deviceId, commandId: slot.shortCommandId,
        longPress: dialog.longPress ? { deviceId, commandId: slot.longCommandId } : null,
      }));
      this._binding = null;
      return;
    }
    let next = this._working;
    let macroToOpen: { buttonId: number; name: string } | null = null;
    let longPress: { deviceId: number; commandId: number } | null = null;
    if (dialog.longPress) {
      if (dialog.lpKind === "command") {
        if (!dialog.lpDeviceId || !dialog.lpCommandId) return fail();
        longPress = { deviceId: Number(dialog.lpDeviceId), commandId: Number(dialog.lpCommandId) };
      } else {
        const resolved = this._resolveMacro(next, dialog.lpMacro);
        if (!resolved) return fail();
        next = resolved.bundle;
        longPress = { deviceId: activityId, commandId: resolved.macroId };
        if (resolved.created) macroToOpen = { buttonId: resolved.macroId, name: resolved.name };
      }
    }
    if (dialog.kind === "command") {
      if (!dialog.deviceId || !dialog.commandId) return fail();
      next = upsertActivityButtonBinding(next, activityId, { buttonId, deviceId: Number(dialog.deviceId), commandId: Number(dialog.commandId), longPress });
    } else {
      const resolved = this._resolveMacro(next, dialog.macro);
      if (!resolved) return fail();
      next = upsertActivityButtonBinding(resolved.bundle, activityId, { buttonId, deviceId: activityId, commandId: resolved.macroId, longPress });
      if (resolved.created) macroToOpen = { buttonId: resolved.macroId, name: resolved.name };
    }
    this._commit(next);
    this._binding = null;
    if (macroToOpen) this._openMacroEditor(macroToOpen.buttonId, macroToOpen.name);
  };

  // -- the macro step editor ---------------------------------------------------------------------------------------------

  private _stepItems(): BackupMacroStepItem[] {
    const editor = this._macroEditor;
    if (!editor || !this._working || this.activityId == null) return [];
    return activityMacroStepItems(this._working, this.activityId, editor.buttonId);
  }

  private _openAddStep = (): void => {
    this._macroPicker = null;
    const deviceId = this._deviceOptions()[0]?.id ?? null;
    this._stepDialog = { editIndex: null, kind: "command", deviceId, commandId: this._firstCommandId(deviceId), slot: this._wifiSlots[0]?.slot ?? null, hold: "0", error: "" };
  };

  private _openEditStep(item: BackupMacroStepItem): void {
    this._macroPicker = null;
    const base = { editIndex: item.index, deviceId: item.deviceId ?? null, commandId: item.commandId ?? null, slot: this._wifiSlots[0]?.slot ?? null, hold: byteToSeconds(item.hold), error: "" };
    // An input ref: pick the device's command that drives the input (or none).
    if (item.kind === "input") {
      this._stepDialog = { ...base, kind: "input" };
      return;
    }
    // A step on the (picker-hidden) callback device edits as a Wifi Event; slot = command id - 1.
    if (this._kindFor(item.deviceId) === "wifi_event") {
      this._stepDialog = { ...base, kind: "wifi_event", slot: item.commandId != null ? Number(item.commandId) - 1 : null };
      return;
    }
    this._stepDialog = { ...base, kind: "command" };
  }

  private _closeStepDialog = (): void => {
    this._stepDialog = null;
  };

  private _applyStep = (): void => {
    const dialog = this._stepDialog;
    const editor = this._macroEditor;
    const activityId = this.activityId;
    if (!dialog || !editor || !this._working || activityId == null) return;
    // A Wifi Event is a press the hub reports, not a key it holds down: no hold.
    const hold = dialog.kind === "wifi_event" ? 0 : secondsToByte(dialog.hold);
    if (dialog.kind === "input") {
      const deviceId = Number(dialog.deviceId);
      if (deviceId > 0) {
        this._commit(dialog.commandId == null
          ? clearActivityDeviceInput(this._working, activityId, deviceId)
          : setActivityDeviceInput(this._working, activityId, deviceId, Number(dialog.commandId)));
      }
      this._stepDialog = null;
      return;
    }
    let deviceId = Number(dialog.deviceId);
    let commandId = Number(dialog.commandId);
    if (dialog.kind === "wifi_event") {
      const slot = this._wifiSlots.find((entry) => entry.slot === dialog.slot);
      if (!slot || this._callbackDeviceId == null) {
        this._stepDialog = { ...dialog, error: B.bindingIncomplete };
        return;
      }
      deviceId = this._callbackDeviceId;
      commandId = slot.shortCommandId;
    }
    if (!commandId || !deviceId) {
      this._stepDialog = { ...dialog, error: B.stepNoCommands };
      return;
    }
    this._commit(dialog.editIndex === null
      ? addActivityMacroCommandStep(this._working, activityId, editor.buttonId, deviceId, commandId, hold)
      : updateActivityMacroStep(this._working, activityId, editor.buttonId, dialog.editIndex, { deviceId, commandId, hold }));
    this._stepDialog = null;
  };

  private _removeStep(index: number): void {
    const editor = this._macroEditor;
    if (!editor || !this._working || this.activityId == null) return;
    this._commit(removeActivityMacroStep(this._working, this.activityId, editor.buttonId, index));
  }

  private _moveStep(position: number, delta: number): void {
    const editor = this._macroEditor;
    if (!editor || !this._working || this.activityId == null) return;
    const items = this._stepItems();
    const target = position + delta;
    if (target < 0 || target >= items.length || target === position) return;
    const order = items.map((item) => item.index);
    const [moved] = order.splice(position, 1);
    order.splice(target, 0, moved);
    this._commit(reorderActivityMacroSteps(this._working, this.activityId, editor.buttonId, order));
  }

  private _setStepWait(item: BackupMacroStepItem, event: Event): void {
    const editor = this._macroEditor;
    if (!editor || !this._working || this.activityId == null) return;
    const input = event.target as HTMLInputElement;
    const wait = secondsToByte(input.value);
    // Reflect the snapped 0.5 s value at once: a re-render alone cannot fix a value that rounds to the current byte.
    input.value = byteToSeconds(wait);
    this._commit(setActivityMacroStepWait(this._working, this.activityId, editor.buttonId, item.index, wait));
  }

  // -- render: shared pieces ------------------------------------------------------------------------------------------------

  private _renderHeader(options: { id: string; title: string; titleId: string; onBack: () => void; crumbs: Array<{ label: string; onClick: () => void }>; actions?: TemplateResult | typeof nothing }): TemplateResult {
    return html`
      <div class="sticky-header">
        <div class="detail-title-row">
          <div class="detail-title-main">
            <button class="back-btn" id=${options.id} type="button" aria-label=${FRAME.back} @click=${options.onBack}>${icon(mdiArrowLeft)}</button>
            <div class="detail-title-stack">
              <div class="detail-crumbs">
                ${options.crumbs.map((crumb) => html`<button class="detail-crumb" type="button" @click=${crumb.onClick}>${crumb.label}</button><span class="detail-crumb-sep" aria-hidden="true">›</span>`)}
              </div>
              <div class="detail-title" id=${options.titleId}>${options.title}</div>
            </div>
            ${this._offline && this._dirty ? html`<span class="edit-unsaved-chip" id="editor-unsaved" title=${B.unsavedTooltip}>${B.unsaved}</span>` : nothing}
            ${options.actions ?? nothing}
          </div>
        </div>
      </div>
    `;
  }

  private _select(id: string, label: string, value: number | null, options: Array<{ value: number; label: string }>, empty: string, onChange: (value: number) => void): TemplateResult {
    return html`
      <div class="decoded-field">
        <label class="decoded-field-label" for=${id}>${label}</label>
        ${options.length === 0
          ? html`<div class="quick-access-empty">${empty}</div>`
          : html`<select id=${id} class="decoded-field-input" @change=${(event: Event) => onChange(Number((event.currentTarget as HTMLSelectElement).value))}>
              ${options.map((option) => html`<option value=${option.value} ?selected=${option.value === value}>${option.label}</option>`)}
            </select>`}
      </div>`;
  }

  /** The type choice as segments, the card's renderKindSegments rebuilt here (the panel takes no card template). */
  private _kindSegments(id: string, value: ActivityTargetKind, kinds: ActivityTargetKind[], onChange: (kind: ActivityTargetKind) => void): TemplateResult | typeof nothing {
    if (kinds.length < 2) return nothing;
    const label = (kind: ActivityTargetKind) => (kind === "command" ? B.shortcutKindCommand : kind === "action" ? B.shortcutKindAction : B.shortcutKindWifiEvent);
    return html`
      <div class="kind-seg" id=${id} role="group" aria-label=${B.addShortcutKindLabel}>
        ${kinds.map((kind) => html`<button class="kind-seg-btn" type="button" value=${kind} aria-pressed=${kind === value ? "true" : "false"} @click=${() => { if (kind !== value) onChange(kind); }}>${label(kind)}</button>`)}
      </div>`;
  }

  private _targetKinds(): ActivityTargetKind[] {
    return this._wifiEventsAvailable ? ["command", "action", "wifi_event"] : ["command", "action"];
  }

  /** The Add shortcut dialog offers the Wifi Event kind only while an event is left to shortcut. */
  private _shortcutTargetKinds(): ActivityTargetKind[] {
    return this._shortcutWifiSlots().length > 0 ? ["command", "action", "wifi_event"] : ["command", "action"];
  }

  /** A button assignment creates at most one new item: while one leg creates
   *  a new macro, the other leg offers existing macros only. */
  private _bindingCreatesNew(dialog: BindingDialogState): { primary: boolean; longPress: boolean } {
    return {
      primary: dialog.kind === "action" && dialog.macro.mode === "new",
      longPress: dialog.longPress && dialog.lpKind === "action" && dialog.lpMacro.mode === "new",
    };
  }

  /** A leg's kinds: Macro is left out when its only choice would be a new
   *  macro while the other leg already creates one. */
  private _bindingLegKinds<K extends ActivityTargetKind>(kinds: K[], otherCreatesNew: boolean): K[] {
    return otherCreatesNew && this._macroOptions().length === 0 ? kinds.filter((kind) => kind !== "action") : kinds;
  }

  private _closeShortcutCopyMenu = (): void => {
    if (this._shortcutCopyMenu === null) return;
    this._shortcutCopyMenu = null;
    this.renderRoot.querySelector<HTMLElement>("#copy-shortcuts")?.focus();
  };

  /** "Copy" beside "Add" (the card's _renderCopyShortcuts rebuilt here): pick another activity and take over
   *  every shortcut of it this activity does not have yet. */
  private _renderCopyShortcuts(): TemplateResult | typeof nothing {
    const activityId = this.activityId;
    if (!this._working || activityId == null) return nothing;
    const working = this._working;
    const sources = shortcutCopySources(working, activityId);
    if (sources.length === 0) return nothing;
    const open = this._shortcutCopyMenu !== null;
    const onKeydown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        this._closeShortcutCopyMenu();
        return;
      }
      moveListFocus(event, ".macro-picker-option:not(:disabled)");
    };
    return html`
      <span class="shortcut-copy" @keydown=${onKeydown}>
        <button class="quick-access-add-btn" id="copy-shortcuts" type="button" title=${B.copyShortcutsHeading} aria-label=${B.copyShortcutsButton} aria-haspopup="listbox" aria-expanded=${open ? "true" : "false"}
          @click=${(event: Event) => {
            if (open) {
              this._shortcutCopyMenu = null;
              return;
            }
            const root = this.renderRoot;
            this._shortcutCopyMenu = anchoredListPosition(event.currentTarget as HTMLElement, null, { minWidth: 260, within: this });
            requestAnimationFrame(() => root.querySelector<HTMLElement>(".shortcut-copy .macro-picker-option:not(:disabled)")?.focus());
          }}>${icon(mdiContentCopy)}<span>${B.copyShortcutsButton}</span></button>
        ${open
          ? html`<button class="macro-picker-backdrop" type="button" tabindex="-1" aria-hidden="true" @click=${this._closeShortcutCopyMenu} @wheel=${(event: Event) => event.preventDefault()}></button>
              <div class="macro-picker-menu" id="copy-shortcuts-menu" role="listbox" aria-label=${B.copyShortcutsHeading} style=${this._shortcutCopyMenu ?? ""}>
                <div class="macro-picker-group">${B.copyShortcutsHeading}</div>
                ${sources.map((source) => html`
                  <button class="macro-picker-option" type="button" role="option" aria-selected="false" data-activity=${source.activityId} ?disabled=${source.newCount === 0}
                    @click=${() => { this._closeShortcutCopyMenu(); this._commit(copyActivityShortcuts(working, activityId, source.activityId)); }}>
                    <span class="macro-picker-name">${source.activityName}</span>
                    <span class="macro-picker-chip">${source.newCount === 0 ? B.copyShortcutsNone : B.copyShortcutsCount(source.newCount)}</span>
                  </button>`)}
              </div>`
          : nothing}
      </span>`;
  }

  private _toggleMacroPicker(id: string, event: Event): void {
    const trigger = event.currentTarget as HTMLElement;
    if (this._macroPicker?.id === id) {
      this._macroPicker = null;
      return;
    }
    this._macroPicker = { id, style: anchoredListPosition(trigger, trigger.closest<HTMLElement>(".modal-backdrop")) };
    const root = this.renderRoot;
    requestAnimationFrame(() => (root.querySelector<HTMLElement>('.macro-picker-option[aria-selected="true"]') ?? root.querySelector<HTMLElement>(".macro-picker-option"))?.focus());
  }

  private _closeMacroPicker = (): void => {
    const picker = this._macroPicker;
    if (!picker) return;
    this._macroPicker = null;
    this.renderRoot.querySelector<HTMLElement>(`#${picker.id}`)?.focus();
  };

  /** The card's renderPicker rebuilt here: a select-like picker with its own list for the targets that can also be
   *  created on the spot (a macro, a Wifi Event). "Create new" on top, then the choices in groups, a row optionally
   *  with an icon and a chip. One is open at a time (`_macroPicker`). */
  private _picker(params: {
    id: string;
    label: string;
    value: string;
    current: { label: string; icon?: string; chip?: string };
    newLabel: string | null;
    groups: Array<{ heading?: string; options: Array<{ value: string; label: string; icon?: string; chip?: string }> }>;
    helper?: string;
    onPick: (value: string) => void;
  }): TemplateResult {
    const { id } = params;
    const open = this._macroPicker?.id === id;
    const groups = params.groups.filter((group) => group.options.length > 0);
    const option = (optionValue: string, extraClass: string, body: TemplateResult) => html`
      <button class="macro-picker-option ${extraClass}" type="button" role="option" data-value=${optionValue} aria-selected=${optionValue === params.value ? "true" : "false"}
        @click=${() => { this._closeMacroPicker(); params.onPick(optionValue); }}>${body}</button>`;
    // Keys are handled on the field, so they work from the trigger and from the list.
    const onKeydown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        this._closeMacroPicker();
        return;
      }
      moveListFocus(event, ".macro-picker-option");
    };
    return html`<div class="decoded-field" @keydown=${onKeydown}>
      <span class="decoded-field-label" id=${`${id}-label`}>${params.label}</span>
      <button id=${id} class="decoded-field-input macro-picker-trigger" type="button" data-value=${params.value} aria-haspopup="listbox" aria-expanded=${open ? "true" : "false"} aria-labelledby=${`${id}-label ${id}`}
        @click=${(event: Event) => this._toggleMacroPicker(id, event)}>
        ${params.current.icon ? icon(params.current.icon, "macro-picker-icon") : nothing}
        <span class="macro-picker-name">${params.current.label}</span>
        ${params.current.chip ? html`<span class="macro-picker-chip">${params.current.chip}</span>` : nothing}
        ${icon(mdiChevronDown, "macro-picker-icon")}
      </button>
      ${open
        ? html`<button class="macro-picker-backdrop" type="button" tabindex="-1" aria-hidden="true" @click=${this._closeMacroPicker} @wheel=${(event: Event) => event.preventDefault()}></button>
            <div class="macro-picker-menu" role="listbox" aria-labelledby=${`${id}-label`} style=${this._macroPicker?.style ?? ""}>
              ${params.newLabel
                ? html`${option("__new__", "macro-picker-option--new", html`${icon(mdiPlus, "macro-picker-icon")}<span class="macro-picker-name">${params.newLabel}</span>`)}
                    ${groups.length ? html`<div class="macro-picker-sep"></div>` : nothing}`
                : nothing}
              ${groups.map((group) => html`
                ${group.heading ? html`<div class="macro-picker-group">${group.heading}</div>` : nothing}
                ${group.options.map((item) => option(item.value, "", html`${item.icon ? icon(item.icon, "macro-picker-icon") : nothing}<span class="macro-picker-name">${item.label}</span>${item.chip ? html`<span class="macro-picker-chip">${item.chip}</span>` : nothing}`))}`)}
            </div>`
        : nothing}
      ${params.helper ? html`<div class="decoded-field-helper">${params.helper}</div>` : nothing}
    </div>`;
  }

  /** The macro picker: "Create new macro" on top, own macros, then the other activities' macros to copy, each with a
   *  chip naming its activity; under it the new macro's name. */
  private _macroTargetFields(
    idPrefix: string,
    target: MacroTargetState,
    onChange: (target: MacroTargetState) => void,
    allowNew = true,
    offerOwn = true,
  ): TemplateResult {
    const macros = offerOwn ? this._macroOptions() : [];
    const copyable = this._copyableMacros();
    const copied = target.mode === "copy" ? copyable.find((macro) => macro.activityId === target.sourceId && macro.buttonId === target.macroId) : undefined;
    return html`
      ${macros.length || copyable.length
        ? html`${this._picker({
            id: `${idPrefix}-macro-target`,
            label: B.macroTargetLabel,
            value: copied ? macroCopyValue(copied.activityId, copied.buttonId) : target.mode === "new" ? "__new__" : String(target.macroId ?? ""),
            current: copied
              ? { label: copied.name, icon: mdiContentCopy, chip: copied.activityName }
              : { label: target.mode === "new" ? B.macroTargetCreateNew : macros.find((macro) => macro.value === target.macroId)?.label ?? "" },
            newLabel: allowNew ? B.macroTargetCreateNew : null,
            groups: [
              { heading: copyable.length ? B.macroTargetOwnGroup : undefined, options: macros.map((macro) => ({ value: String(macro.value), label: macro.label })) },
              { heading: B.macroTargetCopyGroup, options: copyable.map((macro) => ({ value: macroCopyValue(macro.activityId, macro.buttonId), label: macro.name, icon: mdiContentCopy, chip: macro.activityName })) },
            ],
            helper: copied ? B.macroTargetCopyNote(copied.commandStepCount, copied.activityName) : undefined,
            onPick: (value) => onChange({ ...target, ...macroTargetFromValue(value) }),
          })}
          ${allowNew ? nothing : html`<div class="decoded-field-helper">${B.bindingOneNewNote}</div>`}`
        : offerOwn ? html`<div class="quick-access-empty">${B.macroTargetNoExisting}</div>` : nothing}
      ${target.mode === "new" ? this._macroNameField(idPrefix, target.name, (name) => onChange({ ...target, name })) : nothing}
    `;
  }

  private _macroNameField(idPrefix: string, name: string, onChange: (name: string) => void): TemplateResult {
    return html`<div class="decoded-field">
      <label class="decoded-field-label" for=${`${idPrefix}-macro-name`}>${B.addShortcutActionName}</label>
      <input id=${`${idPrefix}-macro-name`} class="decoded-field-input" maxlength="20" .value=${name} @input=${(event: Event) => onChange((event.currentTarget as HTMLInputElement).value)} />
      <div class="decoded-field-helper">${B.addShortcutActionHelper}</div>
    </div>`;
  }

  /** A Wifi Event target in the macro target's picker (the panel only picks deployed slots: no "create new"). */
  private _wifiEventFields(idPrefix: string, slot: number | null, onChange: (slot: number) => void, slots: WifiEventSlot[] = this._wifiSlots): TemplateResult {
    if (slots.length === 0) {
      return html`<div class="decoded-field"><span class="decoded-field-label">${B.wifiEventTargetLabel}</span><div class="quick-access-empty">${P.wifiEventNoSlots}</div></div>`;
    }
    return this._picker({
      id: `${idPrefix}-wifi-event`,
      label: B.wifiEventTargetLabel,
      value: String(slot ?? ""),
      current: { label: slots.find((entry) => entry.slot === slot)?.label ?? "" },
      newLabel: null,
      groups: [{ options: slots.map((entry) => ({ value: String(entry.slot), label: entry.label })) }],
      onPick: (value) => onChange(Number(value)),
    });
  }

  private _dialog(id: string, title: string, close: () => void, body: TemplateResult, footer: TemplateResult, error = "", headerExtra: TemplateResult | typeof nothing = nothing): TemplateResult {
    return html`
      <div class="modal-backdrop" @click=${close}>
        <div class="dialog small" id=${id} @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header ${headerExtra === nothing ? "" : "dialog-header--extra"}"><div class="dialog-title">${title}</div>${headerExtra === nothing ? nothing : html`<div class="dialog-header-extra">${headerExtra}</div>`}<button class="dialog-close" type="button" aria-label=${B.deleteCancel} @click=${close}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">${body}</div>
          <div class="dialog-footer">
            <div class="dialog-footer-note" id=${`${id}-error`}>${error}</div>
            <div class="dialog-footer-actions">${footer}</div>
          </div>
        </div>
      </div>
    `;
  }

  // -- render: the main screen --------------------------------------------------------------------------------------------------

  private _renderEditor(): TemplateResult {
    const activityId = this.activityId!;
    const dirty = this._dirty;
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view ${this._sorter.state ? "is-sorting" : ""}" id="activity-editor">
          ${this._renderHeader({
            id: "editor-back", title: this._title, titleId: "editor-title", onBack: this._requestClose,
            crumbs: [{ label: B.crumbActivities, onClick: this._requestClose }],
            actions: html`<div class="detail-title-actions">
              <button class="icon-btn" id="editor-rename" type="button" aria-label=${B.renameKind("activity")} title=${B.renameKind("activity")} @click=${() => this._openRename({ kind: "activity" })}>${icon(mdiPencil)}</button>
              <button class="icon-btn icon-btn--danger" id="editor-delete" type="button" aria-label=${B.deleteActivityAria} title=${B.deleteActivityAria} ?disabled=${this._deleting || this._hubBusy} @click=${() => this._openDeleteConfirm({ kind: "activity", activityId }, this._title)}>${icon(mdiTrashCanOutline)}</button>
              ${this._offline
                ? nothing
                : html`<button class="detail-sync-btn ${dirty ? "sync-btn-primary" : "detail-sync-btn--state-ok"}" id="editor-sync" type="button" ?disabled=${!dirty || this._hubBusy} @click=${() => void this._sync()}>${dirty ? A.syncToHub : A.syncUpToDate}</button>`}
            </div>`,
          })}
          <div class="detail-scroll">
            ${this._renderDeleteErrorBanner()}
            ${this._renderPowerSection(activityId)}
            ${this._renderRolesSection(activityId)}
            ${this._renderShortcutsSection()}
          </div>
        </div>
        ${this._renderRenameDialog()}
        ${this._renderDeleteConfirmDialog()}
        ${this._renderAddShortcutDialog()}
        ${this._renderRoleConfirmDialog()}
        ${this._renderExitConfirmDialog()}
      </div>
    `;
  }

  private _renderPowerSection(activityId: number): TemplateResult {
    const row = (buttonId: number, label: string) => {
      const count = activityMacroStepItems(this._working!, activityId, buttonId).length;
      return html`<div class="quick-access-sortable-item">
        <button class="edit-selection-row" type="button" data-sequence=${buttonId} @click=${() => this._openMacroEditor(buttonId, label)}>
          <span class="selection-main"><span class="selection-label">${label}</span><span class="selection-sub">${B.macroStepsCount(count)}</span></span>
          <span class="selection-chevron">${icon(mdiChevronRight)}</span>
        </button>
      </div>`;
    };
    const members = activityMemberViews(this._working, activityId);
    const names = members.map((member) => (member.inputOrdinal > 0 && member.inputCommandName ? `${member.deviceName} (${member.inputCommandName})` : member.deviceName)).join(", ");
    return html`
      <div class="quick-access-section" data-edit-section="power">
        <div class="quick-access-head"><div class="quick-access-head-main"><div class="quick-access-title">${B.powerSetupTitle}</div><div class="quick-access-sub">${B.powerSetupActivitySub}</div></div></div>
        <div class="quick-access-list">
          <div class="quick-access-sortable-container power-sequences" data-disabled="false">
            ${row(POWER_ON, B.powerOnLabel)}
            ${row(POWER_OFF, B.powerOffLabel)}
          </div>
        </div>
        <div class="quick-access-sub power-members-summary" data-kind="member-summary" id="member-summary">${members.length ? B.memberSummary(names) : B.memberSummaryEmpty}</div>
      </div>
    `;
  }

  private _renderRolesSection(activityId: number): TemplateResult {
    const bundle = this._working!;
    const roles = activityRoleAssignments(bundle, activityId);
    const devices = this._deviceOptions();
    const bindingCount = activityButtonBindingItems(bundle, activityId).length;
    return html`
      <div class="quick-access-section" data-edit-section="bindings">
        <div class="quick-access-head"><div class="quick-access-head-main"><div class="quick-access-title">${B.activityRunningTitle}</div><div class="quick-access-sub">${B.activityRunningSub}</div></div></div>
        <div class="quick-access-list quick-access-list--overlays">
          <div class="quick-access-sortable-container">
            ${roles.map((role) => this._renderRoleRow(role, devices))}
            <div class="quick-access-sortable-item quick-access-footer-item">
              <button class="edit-selection-row edit-selection-row--footer" id="open-bindings" type="button" @click=${this._openBindingsView}>
                ${icon(mdiTuneVariant, "footer-row-icon")}
                <span class="selection-main"><span class="selection-label">${B.customizeButtonsToggle}</span><span class="selection-sub">${bindingCount > 0 ? B.bindingsConfiguredCount(bindingCount) : B.bindingsNoneConfigured}</span></span>
                <span class="selection-chevron">${icon(mdiChevronRight)}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderRoleRow(role: ActivityRoleAssignment, devices: Array<{ id: number; label: string }>): TemplateResult {
    const open = this._roleMenu?.group === role.group;
    const label = roleLabel(role.group);
    const note = (role.state === "device" || role.state === "customized") && role.boundCount < role.totalCount ? B.roleMappedNote(role.boundCount, role.totalCount) : null;
    return html`
      <div class="quick-access-sortable-item" data-role=${role.group}>
        <div class="role-row">
          ${icon(ROLE_ICONS[role.group], "role-icon")}
          <div class="role-main">
            <div class="role-label">${label}</div>
            ${note ? html`<div class="role-note">${note}</div>` : nothing}
          </div>
          <span class="member-add role-menu-anchor" data-open=${open ? "true" : "false"}>
            <button class="role-trigger" type="button" data-state=${role.state} aria-haspopup="listbox" aria-expanded=${open ? "true" : "false"} aria-label=${B.roleMenuAria(label)}
              @click=${(event: Event) => { this._roleMenu = open ? null : { group: role.group, anchor: menuAnchorRect(event) }; }}>
              <span>${roleTriggerLabel(role)}</span>${icon(mdiChevronDown)}
            </button>
            ${open
              ? html`<button class="member-add-backdrop" type="button" tabindex="-1" aria-hidden="true" @click=${() => { this._roleMenu = null; }}></button>
                  <div class="member-add-menu role-menu" role="listbox" aria-label=${label} style=${overlayMenuPosition(this._roleMenu?.anchor ?? null, "right")}>
                    <button class="member-add-option" type="button" role="option" data-device="" aria-selected=${role.state === "unused" ? "true" : "false"} @click=${() => this._assignRole(role.group, null)}>${B.roleNotUsed}</button>
                    ${devices.map((device) => {
                      const mappable = roleMappableButtonCount(this._working!, device.id, role.group);
                      return html`<button class="member-add-option" type="button" role="option" data-device=${device.id} ?disabled=${mappable === 0} aria-selected=${role.deviceId === device.id ? "true" : "false"} @click=${() => this._assignRole(role.group, device.id)}>${mappable === 0 ? B.roleOptionNoMapping(device.label) : device.label}</button>`;
                    })}
                  </div>`
              : nothing}
          </span>
        </div>
      </div>
    `;
  }

  private _renderShortcutsSection(): TemplateResult {
    const items = this._shortcutItems();
    return html`
      <div class="quick-access-section" data-edit-section="quick_access">
        <div class="quick-access-head quick-access-head--inline">
          <div class="quick-access-head-main"><div class="quick-access-title">${B.activityShortcutsTitle}</div><div class="quick-access-sub">${B.activityShortcutsSubSortable}</div></div>
          <div class="quick-access-head-actions" style="display: inline-flex; gap: 8px;">
            ${this._renderCopyShortcuts()}
            <button class="quick-access-add-btn" id="add-shortcut" type="button" @click=${this._openAddShortcut}>${icon(mdiPlus)}<span>${B.addShortcutButton}</span></button>
          </div>
        </div>
        ${items.length
          ? html`<div class="quick-access-list"><div class="quick-access-sortable-container">${items.map((item, position) => this._renderShortcutRow(item, position))}</div></div>`
          : html`<div class="quick-access-empty">${B.activityShortcutsEmpty}</div>`}
      </div>
    `;
  }

  private _shortcutMeta(item: BackupActivityQuickAccessItem): string {
    if (item.kind === "macro") {
      const summary = activityUserMacroSummaries(this._working, Number(this.activityId)).find((macro) => macro.buttonId === item.buttonId);
      return B.macroStepsCount(summary?.commandStepCount ?? 0);
    }
    const device = (this._working?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(item.deviceId || 0));
    return String(device?.device?.name || "").trim() || C.deviceFallback(item.deviceId ?? "?");
  }

  private _dragHandle(position: number, aria: string, move: (delta: number) => void): TemplateResult {
    return html`<button class="quick-access-drag" type="button" aria-label=${aria} title=${aria}
      @mousedown=${(event: MouseEvent) => event.preventDefault()}
      @pointerdown=${(event: PointerEvent) => this._sorter.start(event, position)}
      @pointermove=${(event: PointerEvent) => this._sorter.move(event)}
      @pointerup=${(event: PointerEvent) => this._sorter.end(event)}
      @pointercancel=${(event: PointerEvent) => this._sorter.cancel(event)}
      @keydown=${(event: KeyboardEvent) => { if (event.key === "ArrowUp") { event.preventDefault(); move(-1); } else if (event.key === "ArrowDown") { event.preventDefault(); move(1); } }}
    >${icon(mdiDragVerticalVariant)}</button>`;
  }

  private _sortClass(position: number): string {
    const drag = this._sorter.state;
    return drag?.from === position ? "is-dragging" : drag ? "is-shifting" : "";
  }

  private _renderShortcutRow(item: BackupActivityQuickAccessItem, position: number): TemplateResult {
    const transform = this._sorter.transform(position);
    const activityId = Number(this.activityId);
    return html`
      <div class="quick-access-sortable-item ${this._sortClass(position)}" data-sort-index=${position} data-kind=${item.kind} data-button-id=${item.buttonId} style=${transform ? `transform: ${transform}` : ""}>
        <div class="quick-access-row quick-access-row--step">
          ${this._dragHandle(position, P.dragShortcutAria, (delta) => this._moveShortcut(position, delta))}
          <div class="quick-access-main">
            <div class="quick-access-label-row"><div class="quick-access-label">${item.label}</div><div class="quick-access-chip">${item.kind === "macro" ? B.shortcutChipAction : B.shortcutChipCommand}</div></div>
            <div class="quick-access-meta">${this._shortcutMeta(item)}</div>
          </div>
          <div class="quick-access-actions">
            ${item.kind === "macro"
              ? html`<button class="icon-btn shortcut-steps" type="button" aria-label=${B.editStepsAria} title=${B.editStepsAria} @click=${() => this._openMacroEditor(item.buttonId, item.label)}>${icon(mdiPlaylistEdit)}</button>
                  <button class="icon-btn shortcut-rename" type="button" aria-label=${B.shortcutRenameAria("macro")} title=${B.shortcutRenameAria("macro")} @click=${() => this._openRename({ kind: "macro", buttonId: item.buttonId })}>${icon(mdiPencil)}</button>`
              : this._offline
                ? html`<button class="icon-btn shortcut-rename" type="button" aria-label=${B.shortcutRenameAria("favorite")} title=${B.shortcutRenameAria("favorite")} @click=${() => this._openRename({ kind: "favorite", buttonId: item.buttonId, label: item.label })}>${icon(mdiPencil)}</button>`
                : nothing}
            <button class="icon-btn icon-btn--danger shortcut-delete" type="button" aria-label=${B.shortcutDeleteAria(item.kind)} title=${B.shortcutDeleteAria(item.kind)}
              @click=${() => this._openDeleteConfirm(item.kind === "macro" ? { kind: "macro", activityId, buttonId: item.buttonId } : { kind: "favorite", activityId, buttonId: item.buttonId }, item.label)}>${icon(mdiTrashCanOutline)}</button>
          </div>
        </div>
      </div>
    `;
  }

  // -- render: Individual buttons -----------------------------------------------------------------------------------------------------

  private _renderBindingsView(): TemplateResult {
    const activityId = this.activityId!;
    const items = activityButtonBindingItems(this._working!, activityId);
    const unbound = unboundButtonsForActivity(this._working!, activityId);
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view" id="bindings-view">
          ${this._renderHeader({
            id: "bindings-back", title: B.bindingsViewTitle, titleId: "bindings-title", onBack: this._closeBindingsView,
            crumbs: [{ label: B.crumbActivities, onClick: this._requestClose }, { label: this._title, onClick: this._closeBindingsView }],
          })}
          <div class="detail-scroll">
            <div class="quick-access-section">
              <div class="quick-access-head">
                <div class="quick-access-head-main"><div class="quick-access-title">${B.buttonBindingsTitle}</div><div class="quick-access-sub">${B.buttonBindingsActivitySub}</div></div>
                <button class="quick-access-add-btn" id="add-binding" type="button" ?disabled=${unbound.length === 0} @click=${this._openAddBinding}>${icon(mdiPlus)}<span>${B.addBinding}</span></button>
              </div>
              ${items.length
                ? html`<div class="quick-access-list"><div class="quick-access-sortable-container">${items.map((item) => this._renderBindingRow(item))}</div></div>`
                : html`<div class="quick-access-empty">${B.buttonBindingsEmpty}</div>`}
            </div>
          </div>
        </div>
        ${this._renderBindingDialog()}
        ${this._renderDeleteConfirmDialog()}
        ${this._renderExitConfirmDialog()}
      </div>
    `;
  }

  private _renderBindingRow(item: BackupButtonBindingItem): TemplateResult {
    const activityId = Number(this.activityId);
    return html`
      <div class="quick-access-sortable-item" data-kind="binding" data-button-id=${item.buttonId}>
        <div class="quick-access-row">
          <div class="quick-access-main">
            <div class="quick-access-label-row"><div class="quick-access-label">${item.buttonName}</div><div class="quick-access-chip">${B.buttonChip}</div></div>
            <div class="quick-access-meta">${item.shortPressLabel}</div>
            ${item.longPress ? html`<div class="quick-access-meta">${B.bindingLongPressMeta(item.longPress.label)}</div>` : nothing}
          </div>
          <div class="quick-access-actions">
            <button class="icon-btn binding-edit" type="button" aria-label=${B.editBindingAria} title=${B.editBindingAria} @click=${() => this._openEditBinding(item.buttonId)}>${icon(mdiPencil)}</button>
            <button class="icon-btn icon-btn--danger binding-delete" type="button" aria-label=${B.deleteBindingAria} title=${B.deleteBindingAria} @click=${() => this._openDeleteConfirm({ kind: "activity_binding", activityId, buttonId: item.buttonId }, item.buttonName)}>${icon(mdiTrashCanOutline)}</button>
          </div>
        </div>
      </div>
    `;
  }

  // -- render: the macro step editor ---------------------------------------------------------------------------------------------------

  private _renderMacroEditor(editor: { buttonId: number; name: string }): TemplateResult {
    const items = this._stepItems();
    const isPower = editor.buttonId === POWER_ON || editor.buttonId === POWER_OFF;
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view ${this._sorter.state ? "is-sorting" : ""}" id="step-editor">
          ${this._renderHeader({
            id: "step-back", title: editor.name, titleId: "step-title", onBack: this._closeMacroEditor,
            crumbs: [{ label: B.crumbActivities, onClick: this._requestClose }, { label: this._title, onClick: this._closeMacroEditor }],
            actions: isPower ? nothing : html`<div class="detail-title-actions"><button class="icon-btn" id="macro-rename" type="button" aria-label=${B.renameMacroAria} title=${B.renameMacroAria} @click=${() => this._openRename({ kind: "macro", buttonId: editor.buttonId })}>${icon(mdiPencil)}</button></div>`,
          })}
          <div class="detail-scroll">
            <div class="quick-access-section">
              <div class="quick-access-head">
                <div class="quick-access-head-main"><div class="quick-access-title">${B.steps}</div><div class="quick-access-sub">${B.macroStepsSortableHelp}</div></div>
                <div class="quick-access-head-actions" style="display: inline-flex; gap: 8px;">
                  ${isPower ? html`<button class="quick-access-add-btn add-member-btn" id="add-member" type="button" @click=${this._openAddMember}>${icon(mdiPlus)}<span>${B.addMemberButton}</span></button>` : nothing}
                  <button class="quick-access-add-btn" id="step-add" type="button" @click=${this._openAddStep}>${icon(mdiPlus)}<span>${B.addStep}</span></button>
                </div>
              </div>
              ${items.length
                ? html`<div class="quick-access-list"><div class="quick-access-sortable-container">${items.map((item, position) => this._renderStepRow(item, position, items.length))}</div></div>`
                : html`<div class="quick-access-empty">${B.noMacroSteps}</div>`}
            </div>
          </div>
        </div>
        ${this._renderStepDialog()}
        ${this._renderRenameDialog()}
        ${this._renderAddMemberDialog()}
        ${this._renderDeleteConfirmDialog()}
        ${this._renderExitConfirmDialog()}
      </div>
    `;
  }

  private _renderStepRow(item: BackupMacroStepItem, position: number, count: number): TemplateResult {
    const isPower = item.kind === "power";
    const isInput = item.kind === "input";
    const meta = item.kind === "command" && item.hold > 0 ? B.holdLabel(byteToSeconds(item.hold)) : "";
    // A power ref is the device's membership token: its trash removes the device from the activity.
    const memberDeviceId = isPower ? Number(item.deviceId ?? 0) : 0;
    const activityId = Number(this.activityId);
    const transform = this._sorter.transform(position);
    return html`
      <div class="quick-access-sortable-item ${this._sortClass(position)}" data-sort-index=${position} data-step-index=${item.index} data-step-kind=${item.kind} style=${transform ? `transform: ${transform}` : ""}>
        <div class="quick-access-row quick-access-row--step">
          ${count > 1 ? this._dragHandle(position, P.dragStepAria, (delta) => this._moveStep(position, delta)) : html`<span></span>`}
          <div class="quick-access-main">
            <div class="quick-access-label-row"><div class="quick-access-label">${item.label}</div><div class="quick-access-chip">${isPower || isInput ? P.stepChipRequired : P.stepChipCommand}</div></div>
            ${meta ? html`<div class="quick-access-meta">${meta}</div>` : nothing}
          </div>
          <div class="quick-access-actions">
            ${isPower
              ? memberDeviceId > 0
                ? html`<button class="icon-btn icon-btn--danger member-remove" type="button" aria-label=${B.removeMemberAria} title=${B.removeMemberAria} @click=${() => this._openDeleteConfirm({ kind: "activity_member", activityId, deviceId: memberDeviceId }, this._memberName(memberDeviceId))}>${icon(mdiTrashCanOutline)}</button>`
                : nothing
              : html`<button class="icon-btn step-edit" type="button" aria-label=${B.editStepAria} title=${B.editStepAria} @click=${() => this._openEditStep(item)}>${icon(mdiPencil)}</button>
                  ${isInput ? nothing : html`<button class="icon-btn icon-btn--danger step-delete" type="button" aria-label=${B.deleteStepAria} title=${B.deleteStepAria} @click=${() => this._removeStep(item.index)}>${icon(mdiTrashCanOutline)}</button>`}`}
          </div>
        </div>
        ${position === count - 1
          ? nothing
          : html`<label class="step-wait" title=${B.stepWaitAria}>
              <span class="step-wait-caption">${B.stepWaitLabel}</span>
              <span class="step-wait-field">
                <input class="step-wait-input" type="number" min="0" max="120" step="0.5" aria-label=${B.stepWaitAria} .value=${byteToSeconds(item.wait)} @change=${(event: Event) => this._setStepWait(item, event)} />
                <span class="step-wait-unit">${B.stepWaitUnit}</span>
              </span>
            </label>`}
      </div>
    `;
  }

  // -- render: dialogs ------------------------------------------------------------------------------------------------------------------

  private _renderRenameDialog(): TemplateResult | typeof nothing {
    const dialog = this._rename;
    if (!dialog) return nothing;
    const title = dialog.target.kind === "activity" ? B.renameActivity : dialog.target.kind === "favorite" ? B.renameFavorite : B.renameMacro;
    return this._dialog("rename-dialog", title, this._closeRename, html`
      <label class="decoded-field">
        <span class="decoded-field-label">${B.name}</span>
        <input class="decoded-field-input" id="rename-input" type="text" maxlength="30" .value=${dialog.draft} @input=${this._renameInput} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); this._applyRename(); } }} />
      </label>`, html`
      <button class="dialog-btn" type="button" @click=${this._closeRename}>${B.deleteCancel}</button>
      <button class="dialog-btn dialog-btn-primary" id="rename-save" type="button" @click=${this._applyRename}>${B.bindingSave}</button>`, dialog.error);
  }

  private _renderDeleteConfirmDialog(): TemplateResult | typeof nothing {
    const dialog = this._deleteConfirm;
    if (!dialog || !this._working) return nothing;
    const impact = bundleDeleteImpact(this._working, dialog.target);
    const hasCascade = backupDeleteHasCascade(impact);
    const immediate = dialog.target.kind === "activity";
    return this._dialog("delete-dialog", this._deleteTitle(dialog.target, dialog.label), this._closeDeleteConfirm, html`
      <div class="backup-drawer-sub">${this._offline ? (hasCascade ? B.deleteCascadeIntro : B.deleteSimpleBody) : hasCascade ? B.deleteCascadeIntroLive : B.deleteSimpleBodyLive}</div>
      ${hasCascade
        ? html`<ul class="delete-impact-list" id="delete-impact">
            ${impact.activities > 0 ? html`<li>${icon(mdiLinkVariant)}<span>${B.deleteImpactActivities(impact.activities)}</span></li>` : nothing}
            ${impact.favorites > 0 ? html`<li>${icon(mdiStarOutline)}<span>${B.deleteImpactFavorites(impact.favorites)}</span></li>` : nothing}
            ${impact.macroSteps > 0 ? html`<li>${icon(mdiFormatListNumbered)}<span>${B.deleteImpactMacroSteps(impact.macroSteps)}</span></li>` : nothing}
            ${impact.powerSteps > 0 ? html`<li>${icon(mdiPower)}<span>${B.deleteImpactPowerSteps(impact.powerSteps)}</span></li>` : nothing}
            ${impact.bindings > 0 ? html`<li>${icon(mdiGestureTapButton)}<span>${B.deleteImpactBindings(impact.bindings)}</span></li>` : nothing}
            ${impact.members > 0 ? html`<li>${icon(mdiPower)}<span>${B.deleteImpactMembers(impact.members)}</span></li>` : nothing}
          </ul>`
        : nothing}
      <div class="delete-replace-note">${icon(mdiInformationOutline)}<span>${this._offline ? B.deleteReplaceNote : immediate ? B.deleteImmediateNote : B.deleteSyncNote}</span></div>`, html`
      <button class="dialog-btn" type="button" @click=${this._closeDeleteConfirm}>${B.deleteCancel}</button>
      <button class="dialog-btn dialog-btn-danger" id="delete-confirm" type="button" @click=${this._confirmDelete}>${B.deleteConfirm}</button>`);
  }

  private _renderRoleConfirmDialog(): TemplateResult | typeof nothing {
    if (!this._roleConfirm) return nothing;
    const close = () => { this._roleConfirm = null; };
    return this._dialog("role-confirm-dialog", B.roleConfirmTitle, close, html`<div class="backup-drawer-sub">${B.roleConfirmBody}</div>`, html`
      <button class="dialog-btn" type="button" @click=${close}>${B.roleConfirmCancel}</button>
      <button class="dialog-btn dialog-btn-danger" id="role-confirm" type="button" @click=${this._confirmRole}>${B.roleConfirmReplace}</button>`);
  }

  private _renderAddShortcutDialog(): TemplateResult | typeof nothing {
    const dialog = this._addShortcut;
    if (!dialog || !this._working) return nothing;
    const set = (patch: Partial<AddShortcutState>) => { this._addShortcut = { ...dialog, ...patch, error: "" }; };
    // Only what is not a shortcut yet: a command once per activity; a macro is always a new one.
    const devices = this._shortcutDeviceOptions();
    const commands = this._shortcutCommandOptions(dialog.deviceId);
    const canAdd = dialog.kind === "command" ? dialog.deviceId != null && dialog.commandId != null : dialog.kind === "wifi_event" ? dialog.slot != null : true;
    const commandFields = devices.length === 0
      ? html`<div class="backup-drawer-sub">${this._deviceOptions().length === 0 ? B.addFavoriteNoDevices : B.addShortcutNoCommandsLeft}</div>`
      : html`
          <div class="field-pair">
            ${this._select("sb-add-fav-device", B.addFavoriteDevice, dialog.deviceId, devices.map((device) => ({ value: device.id, label: device.label })), B.addFavoriteNoDevices, (value) => set({ deviceId: value, commandId: this._shortcutCommandOptions(value)[0]?.value ?? null }))}
            ${this._select("sb-add-fav-command", B.addFavoriteCommand, dialog.commandId, commands, B.addFavoriteNoCommands, (value) => set({ commandId: value }))}
          </div>
          <div class="decoded-field-helper">${B.addShortcutCommandHelper}</div>`;
    return this._dialog("add-shortcut-dialog", B.addShortcutTitle, this._closeAddShortcut, html`
      ${this._kindSegments("sb-add-shortcut-kind", dialog.kind, this._shortcutTargetKinds(), (kind) => set(kind === "action" ? { kind, mode: "new", macroId: null, sourceId: null, name: "" } : kind === "wifi_event" ? { kind, slot: this._shortcutWifiSlots()[0]?.slot ?? null } : { kind }))}
      ${dialog.kind === "command"
        ? commandFields
        : dialog.kind === "wifi_event"
          ? this._wifiEventFields("sb-add-fav", dialog.slot, (slot) => set({ slot }), this._shortcutWifiSlots())
          : this._macroTargetFields("sb-add", dialog, (macro) => set(macro), true, false)}`, html`
      <button class="dialog-btn" type="button" @click=${this._closeAddShortcut}>${B.addFavoriteCancel}</button>
      <button class="dialog-btn dialog-btn-primary" id="add-shortcut-save" type="button" ?disabled=${!canAdd} @click=${this._applyAddShortcut}>${B.addFavoriteAdd}</button>`, dialog.error);
  }

  private _renderAddMemberDialog(): TemplateResult | typeof nothing {
    const dialog = this._addMember;
    if (!dialog) return nothing;
    const options = this._addableMembers();
    return this._dialog("add-member-dialog", B.addMemberTitle, this._closeAddMember, options.length === 0
      ? html`<div class="backup-drawer-sub">${B.addMemberNoneLeft}</div>`
      : html`<div class="decoded-field">
          <label class="decoded-field-label" for="sb-add-member-device">${B.addFavoriteDevice}</label>
          <select id="sb-add-member-device" class="decoded-field-input" @change=${(event: Event) => { this._addMember = { deviceId: Number((event.currentTarget as HTMLSelectElement).value) }; }}>
            ${options.map((device) => html`<option value=${device.id} ?selected=${device.id === dialog.deviceId}>${device.label}</option>`)}
          </select>
          <div class="decoded-field-helper">${B.addMemberHelper}</div>
        </div>`, html`
      <button class="dialog-btn" type="button" @click=${this._closeAddMember}>${B.deleteCancel}</button>
      <button class="dialog-btn dialog-btn-primary" id="add-member-save" type="button" ?disabled=${options.length === 0 || dialog.deviceId == null} @click=${this._applyAddMember}>${B.addMemberConfirm}</button>`);
  }

  private _renderBindingDialog(): TemplateResult | typeof nothing {
    const dialog = this._binding;
    const activityId = this.activityId;
    if (!dialog || !this._working || activityId == null) return nothing;
    const set = (patch: Partial<BindingDialogState>) => { this._binding = { ...dialog, ...patch, error: "" }; };
    const isEdit = dialog.editButtonId != null;
    const unbound = unboundButtonsForActivity(this._working, activityId);
    const devices = this._deviceOptions().map((device) => ({ value: device.id, label: device.label }));
    const primaryIsWifiEvent = dialog.kind === "wifi_event";
    const createsNew = this._bindingCreatesNew(dialog);
    const canSave = dialog.buttonId != null
      && (dialog.kind === "command" ? dialog.deviceId != null && dialog.commandId != null : primaryIsWifiEvent ? dialog.slot != null : true)
      && !(createsNew.primary && createsNew.longPress);
    const title = isEdit ? B.bindingDialogEditTitle(buttonName(Number(dialog.buttonId))) : B.bindingDialogAddTitle;
    // The button is the dialog's subject, not one of its fields: it sits in the header (the edit title names it).
    const buttonPicker = isEdit
      ? nothing
      : html`<select id="sb-binding-button" class="decoded-field-input dialog-header-select" aria-label=${B.bindingButton} @change=${(event: Event) => set({ buttonId: Number((event.currentTarget as HTMLSelectElement).value) })}>
          ${unbound.map((entry) => html`<option value=${entry.code} ?selected=${entry.code === dialog.buttonId}>${entry.name}</option>`)}
        </select>`;
    const commandPair = (idPrefix: string, deviceId: number | null, commandId: number | null, onDevice: (value: number) => void, onCommand: (value: number) => void) => html`
      <div class="field-pair">
        ${this._select(`${idPrefix}-device`, B.bindingTargetDevice, deviceId, devices, B.bindingNoDevices, onDevice)}
        ${this._select(`${idPrefix}-command`, B.bindingCommand, commandId, this._commandOptions(deviceId), B.bindingNoCommands, onCommand)}
      </div>`;
    return this._dialog("binding-dialog", title, this._closeBinding, html`
      <section class="press-card" data-press="short">
        <div class="press-card-head">${icon(mdiGestureTap)}<span class="press-card-title">${B.bindingShortPress}</span></div>
        ${this._kindSegments("sb-binding-kind", dialog.kind, this._bindingLegKinds(this._targetKinds(), createsNew.longPress), (kind) => this._setBindingKind(kind))}
        ${dialog.kind === "command"
          ? commandPair("sb-binding", dialog.deviceId, dialog.commandId, (value) => set({ deviceId: value, commandId: this._firstCommandId(value) }), (value) => set({ commandId: value }))
          : primaryIsWifiEvent
            ? this._wifiEventFields("sb-binding", dialog.slot, (slot) => set({ slot }))
            : this._macroTargetFields("sb-binding", dialog.macro, (macro) => set({ macro }), !createsNew.longPress)}
      </section>
      <section class="press-card" data-press="long">
        <label class="press-card-head">
          ${icon(mdiGestureTapHold)}<span class="press-card-title">${B.bindingLongPress}</span>
          <input class="sb-switch" id="sb-binding-long-press" type="checkbox" aria-label=${B.bindingEnableLongPress} .checked=${dialog.longPress} @change=${(event: Event) => this._toggleBindingLongPress((event.currentTarget as HTMLInputElement).checked)} />
        </label>
        ${dialog.longPress
          ? primaryIsWifiEvent
            ? html`<div class="decoded-field-helper">${P.wifiEventLongPressNote}</div>`
            : html`${this._kindSegments("sb-binding-lp-kind", dialog.lpKind, this._bindingLegKinds<ActivityTargetKind>(["command", "action"], createsNew.primary), (kind) => this._setBindingLpKind(kind === "action" ? "action" : "command"))}
                ${dialog.lpKind === "command"
                  ? commandPair("sb-binding-lp", dialog.lpDeviceId, dialog.lpCommandId, (value) => set({ lpDeviceId: value, lpCommandId: this._firstCommandId(value) }), (value) => set({ lpCommandId: value }))
                  : this._macroTargetFields("sb-binding-lp", dialog.lpMacro, (lpMacro) => set({ lpMacro }), !createsNew.primary)}`
          : nothing}
      </section>`, html`
      <button class="dialog-btn" type="button" @click=${this._closeBinding}>${B.bindingCancel}</button>
      <button class="dialog-btn dialog-btn-primary" id="binding-save" type="button" ?disabled=${!canSave} @click=${this._applyBinding}>${isEdit ? B.bindingSave : B.bindingAdd}</button>`, dialog.error, buttonPicker);
  }

  private _renderStepDialog(): TemplateResult | typeof nothing {
    const dialog = this._stepDialog;
    if (!dialog || !this._working) return nothing;
    const set = (patch: Partial<StepDialogState>) => { this._stepDialog = { ...dialog, ...patch, error: "" }; };
    const isEdit = dialog.editIndex !== null;
    const isInput = dialog.kind === "input";
    const isWifiEvent = dialog.kind === "wifi_event";
    const commands = this._commandOptions(dialog.deviceId);
    const canSave = isInput || (isWifiEvent ? dialog.slot != null : dialog.commandId != null && dialog.deviceId != null);
    const title = isInput ? B.inputStepTitle : isEdit ? B.stepDialogEditTitle : B.stepDialogAddTitle;
    const body = isInput
      ? html`<div class="decoded-field">
          <label class="decoded-field-label" for="sb-step-input">${B.inputStepCommand}</label>
          <select id="sb-step-input" class="decoded-field-input" @change=${(event: Event) => { const raw = (event.currentTarget as HTMLSelectElement).value; set({ commandId: raw === "" ? null : Number(raw) }); }}>
            <option value="" ?selected=${dialog.commandId == null}>${B.inputStepNone}</option>
            ${commands.map((command) => html`<option value=${command.value} ?selected=${command.value === dialog.commandId}>${command.label}</option>`)}
          </select>
        </div>`
      : html`
          ${this._wifiEventsAvailable
            ? this._kindSegments("sb-step-kind", isWifiEvent ? "wifi_event" : "command", ["command", "wifi_event"], (kind) => set(kind === "wifi_event" ? { kind, slot: this._wifiSlots[0]?.slot ?? null } : { kind: "command" }))
            : nothing}
          ${isWifiEvent
            ? this._wifiEventFields("sb-step", dialog.slot, (slot) => set({ slot }))
            : html`<div class="field-pair">
                ${this._select("sb-step-device", B.stepDevice, dialog.deviceId, this._deviceOptions().map((device) => ({ value: device.id, label: device.label })), B.bindingNoDevices, (value) => set({ deviceId: value, commandId: this._firstCommandId(value) }))}
                ${this._select("sb-step-command", B.stepCommand, dialog.commandId, commands, B.stepNoCommands, (value) => set({ commandId: value }))}
              </div>`}
          ${isWifiEvent ? nothing : html`<div class="decoded-field">
            <label class="decoded-field-label" for="sb-step-hold">${B.stepHoldSeconds}</label>
            <input id="sb-step-hold" class="decoded-field-input" type="number" min="0" max="120" step="0.5" .value=${dialog.hold}
              @input=${(event: Event) => { this._stepDialog = { ...dialog, hold: (event.currentTarget as HTMLInputElement).value }; }}
              @change=${(event: Event) => { this._stepDialog = { ...dialog, hold: byteToSeconds(secondsToByte((event.currentTarget as HTMLInputElement).value)) }; }} />
          </div>`}`;
    return this._dialog("step-dialog", title, this._closeStepDialog, body, html`
      <button class="dialog-btn" type="button" @click=${this._closeStepDialog}>${B.stepCancel}</button>
      <button class="dialog-btn dialog-btn-primary" id="step-save" type="button" ?disabled=${!canSave} @click=${this._applyStep}>${isEdit ? B.stepSave : B.stepAdd}</button>`, dialog.error);
  }
}

export function defineActivityEditor(): void {
  if (!customElements.get(ACTIVITY_EDITOR_TAG)) customElements.define(ACTIVITY_EDITOR_TAG, SbPanelActivityEditor);
}
