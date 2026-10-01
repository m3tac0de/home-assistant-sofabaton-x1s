// The macro step editor sub-view and its step dialog as a Lit reactive
// controller (R6, CR-F2-14).
//
// It owns which macro is open, the step dialog state, the step rows with
// reorder and remove, and the apply. The scroll capture and restore, the
// reorder handle and the binding select are shared with other views and
// stay on the element.

import { html, nothing, type ReactiveController, type ReactiveControllerHost } from "lit";
import { byteToSeconds, secondsToByte } from "../../shared/hub-rules";
import { TOOLS_CARD_STRINGS } from "../../strings";
import type { BackupBundlePayload } from "../../shared/ha-context";
import {
  activityMacroStepItems,
  addActivityMacroCommandStep,
  addDeviceMacroCommandStep,
  type BackupMacroStepItem,
  bundleDeviceBrand,
  isWifiEventsBrand,
  clearActivityDeviceInput,
  deviceCommandItems,
  deviceMacroStepItems,
  removeActivityMacroStep,
  removeDeviceMacroStep,
  reorderActivityMacroSteps,
  reorderDeviceMacroSteps,
  setActivityDeviceInput,
  setActivityMacroStepWait,
  setDeviceMacroStepWait,
  updateActivityMacroStep,
  updateDeviceMacroStep,
} from "../backup-state";
import type { BackupEditTargetKind, MacroStepKind } from "./host-types";
import { editorErrorMessage } from "./names";
import type { SofabatonEditDetailView } from "../edit-detail-view";

// POWER_ON / POWER_OFF macro slots. These carry fixed semantic names
// ("Power On"/"Power Off") and a binding refers to them by slot, so they
// are not renameable — unlike user macros bound to activity buttons.
const POWER_MACRO_BUTTON_IDS = new Set([198, 199]);

/** The element members the controller reaches. */
export type MacroStepEditorHost = ReactiveControllerHost &
  Pick<
    SofabatonEditDetailView,
    "_bindingsView"
    | "_captureCurrentScrollPosition"
    | "_commitEditBundleEdit"
    | "_editRenameDialogDraft"
    | "_editRenameDialogError"
    | "_editRenameDialogOpen"
    | "_editRenameDialogTarget"
    | "_editableDeviceOptions"
    | "_entityKindCrumbLabel"
    | "_events"
    | "_haSortableReady"
    | "_memberDeviceName"
    | "_openAddMemberDialog"
    | "_openMemberRemoveConfirm"
    | "_renderAddMemberDialog"
    | "_renderBindingSelect"
    | "_renderDeleteConfirmDialog"
    | "_renderDetailCrumbs"
    | "_renderDirtyChip"
    | "_renderEditRenameDialog"
    | "_renderReorderHandle"
    | "_requestClose"
    | "_restoreBindingsScroll"
    | "_restoreMainScroll"
    | "_selectedEditTitle"
    | "bundle"
  >;

export class MacroStepEditorController implements ReactiveController {
  private _editor: { scope: BackupEditTargetKind; entityId: number; buttonId: number; name: string } | null = null;
  get editor(): { scope: BackupEditTargetKind; entityId: number; buttonId: number; name: string } | null {
    return this._editor;
  }
  set editor(value: { scope: BackupEditTargetKind; entityId: number; buttonId: number; name: string } | null) {
    if (value === this._editor) return;
    this._editor = value;
    this.host.requestUpdate();
  }
  private _dialogOpen = false;
  get dialogOpen(): boolean {
    return this._dialogOpen;
  }
  set dialogOpen(value: boolean) {
    if (value === this._dialogOpen) return;
    this._dialogOpen = value;
    this.host.requestUpdate();
  }
  private _editIndex: number | null = null;
  get editIndex(): number | null {
    return this._editIndex;
  }
  set editIndex(value: number | null) {
    if (value === this._editIndex) return;
    this._editIndex = value;
    this.host.requestUpdate();
  }
  private _kind: MacroStepKind = "command";
  get kind(): MacroStepKind {
    return this._kind;
  }
  set kind(value: MacroStepKind) {
    if (value === this._kind) return;
    this._kind = value;
    this.host.requestUpdate();
  }
  private _deviceId: number | null = null;
  get deviceId(): number | null {
    return this._deviceId;
  }
  set deviceId(value: number | null) {
    if (value === this._deviceId) return;
    this._deviceId = value;
    this.host.requestUpdate();
  }
  private _commandId: number | null = null;
  get commandId(): number | null {
    return this._commandId;
  }
  set commandId(value: number | null) {
    if (value === this._commandId) return;
    this._commandId = value;
    this.host.requestUpdate();
  }
  private _holdSeconds = "0";
  get holdSeconds(): string {
    return this._holdSeconds;
  }
  set holdSeconds(value: string) {
    if (value === this._holdSeconds) return;
    this._holdSeconds = value;
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

  constructor(private readonly host: MacroStepEditorHost) {
    host.addController(this);
  }

  hostConnected(): void {}

  // ── Macro step editor (device macros + activity user macros) ────────
  openEditor(scope: BackupEditTargetKind, entityId: number, buttonId: number, name: string) {
    this.host._captureCurrentScrollPosition();
    this.editor = { scope, entityId: Number(entityId), buttonId: Number(buttonId), name };
  }

  closeEditor = () => {
    this.editor = null;
    this.closeDialog();
    if (this.host._bindingsView) this.host._restoreBindingsScroll();
    else this.host._restoreMainScroll();
  };

  // Rename the macro currently open in the step editor. Reuses the shared
  // rename dialog (kind "macro"); applying it also refreshes the editor's
  // own title via the macro branch in _applyEditRenameDialog.
  openNameRenameDialog = () => {
    const editor = this.editor;
    if (!editor || editor.scope !== "activity" || POWER_MACRO_BUTTON_IDS.has(editor.buttonId)) return;
    this.host._editRenameDialogTarget = { kind: "macro", activityId: editor.entityId, buttonId: editor.buttonId };
    this.host._editRenameDialogDraft = editor.name;
    this.host._editRenameDialogError = "";
    this.host._editRenameDialogOpen = true;
  };

  /** Snap a typed seconds value to the hub's 0.5s grid (returns the string form). */
  snapHalfSeconds(value: string): string {
    return byteToSeconds(secondsToByte(value));
  }

  currentItems(): BackupMacroStepItem[] {
    const editor = this.editor;
    if (!editor || !this.host.bundle) return [];
    return editor.scope === "device"
      ? deviceMacroStepItems(this.host.bundle, editor.entityId, editor.buttonId)
      : activityMacroStepItems(this.host.bundle, editor.entityId, editor.buttonId);
  }

  openAdd = () => {
    const editor = this.editor;
    if (!editor || !this.host.bundle) return;
    this.editIndex = null;
    this.kind = "command";
    this.deviceId = editor.scope === "activity"
      ? (this.host._editableDeviceOptions()[0]?.id ?? null)
      : editor.entityId;
    const commandDeviceId = editor.scope === "activity" ? this.deviceId : editor.entityId;
    const commands = commandDeviceId != null ? deviceCommandItems(this.host.bundle, commandDeviceId) : [];
    this.commandId = commands[0]?.commandId ?? null;
    this.holdSeconds = "0";
    this.error = "";
    this.host._events.load();
    this.dialogOpen = true;
  };

  openEdit(item: BackupMacroStepItem) {
    const editor = this.editor;
    if (!editor) return;
    this.editIndex = item.index;
    this.error = "";
    this.dialogOpen = true;
    // An input ref: pick the device's command that drives the input (or none).
    if (item.kind === "input") {
      this.kind = "input";
      this.deviceId = item.deviceId ?? null;
      this.commandId = item.commandId ?? null;
      return;
    }
    // A step referencing the (picker-hidden) Wifi Events device edits as
    // the wifi_event kind — the filtered device select would otherwise
    // strand it. slot = command_id - 1 (short law).
    if (
      this.host._events.available()
      && editor.scope === "activity"
      && item.deviceId != null
      && isWifiEventsBrand(bundleDeviceBrand(this.host.bundle, Number(item.deviceId)))
    ) {
      this.kind = "wifi_event";
      this.deviceId = item.deviceId;
      this.commandId = item.commandId ?? null;
      this.holdSeconds = byteToSeconds(item.hold);
      this.host._events.primary = {
        mode: "existing",
        slot: item.commandId != null ? Number(item.commandId) - 1 : null,
        name: "",
      };
      this.host._events.load();
      return;
    }
    this.kind = "command";
    this.deviceId = editor.scope === "activity" ? (item.deviceId ?? null) : editor.entityId;
    this.commandId = item.commandId ?? null;
    this.holdSeconds = byteToSeconds(item.hold);
  }

  closeDialog = () => {
    this.dialogOpen = false;
    this.editIndex = null;
    this.kind = "command";
    this.deviceId = null;
    this.commandId = null;
    this.holdSeconds = "0";
    this.error = "";
  };

  handleDeviceChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this.deviceId = Number.isFinite(value) ? value : null;
    const commands = this.deviceId != null && this.host.bundle
      ? deviceCommandItems(this.host.bundle, this.deviceId)
      : [];
    this.commandId = commands[0]?.commandId ?? null;
  };

  handleCommandChange = (event: Event) => {
    const raw = (event.target as HTMLSelectElement).value;
    this.commandId = raw === "" ? null : Number(raw);
  };

  handleHoldInput = (event: Event) => {
    this.holdSeconds = (event.target as HTMLInputElement).value;
  };

  // Snap the dialog's hold field to the 0.5s grid when the user commits it
  // (on blur / Enter), so the field can't keep an off-grid value like 0.3.
  handleHoldChange = (event: Event) => {
    this.holdSeconds = this.snapHalfSeconds((event.target as HTMLInputElement).value);
  };

  // Inline per-row wait edit: the attached delay travels with its command.
  handleWaitChange = (item: BackupMacroStepItem, event: Event) => {
    const editor = this.editor;
    if (!editor || !this.host.bundle) return;
    const input = event.target as HTMLInputElement;
    const waitByte = secondsToByte(input.value);
    // Reflect the snapped 0.5s value in the field immediately. A re-render
    // alone can't fix it when the typed value rounds to the current byte:
    // the bound value is unchanged, so Lit leaves the stray text in place.
    input.value = byteToSeconds(waitByte);
    const next = editor.scope === "device"
      ? setDeviceMacroStepWait(this.host.bundle, editor.entityId, editor.buttonId, item.index, waitByte)
      : setActivityMacroStepWait(this.host.bundle, editor.entityId, editor.buttonId, item.index, waitByte);
    this.host._commitEditBundleEdit(next);
  };

  applyWifiEvent = async () => {
    const editor = this.editor;
    if (!editor || !this.host.bundle) return;
    const timeByte = secondsToByte(this.holdSeconds);
    const editIndex = this.editIndex;
    try {
      const ref = await this.host._events.resolveRef(this.host._events.primary);
      const next = editIndex === null
        ? addActivityMacroCommandStep(ref.bundle, editor.entityId, editor.buttonId, ref.deviceId, ref.commandId, timeByte)
        : updateActivityMacroStep(ref.bundle, editor.entityId, editor.buttonId, editIndex, {
            deviceId: ref.deviceId,
            commandId: ref.commandId,
            hold: timeByte,
          });
      this.host._commitEditBundleEdit(next);
      this.closeDialog();
    } catch (err) {
      this.error = editorErrorMessage(err, "wifi_event");
    }
  };

  apply = () => {
    const editor = this.editor;
    if (!editor || !this.host.bundle) return;
    const timeByte = secondsToByte(this.holdSeconds);
    const editIndex = this.editIndex;
    const isDevice = editor.scope === "device";
    if (this.kind === "wifi_event") {
      void this.applyWifiEvent();
      return;
    }
    // Editing an activity power-macro input ref: set (or clear) the input.
    if (this.kind === "input") {
      const deviceId = Number(this.deviceId);
      if (deviceId > 0) {
        const next = this.commandId == null
          ? clearActivityDeviceInput(this.host.bundle, editor.entityId, deviceId)
          : setActivityDeviceInput(this.host.bundle, editor.entityId, deviceId, Number(this.commandId));
        this.host._commitEditBundleEdit(next);
      }
      this.closeDialog();
      return;
    }
    const commandId = Number(this.commandId);
    if (!commandId || (!isDevice && !this.deviceId)) {
      this.error = TOOLS_CARD_STRINGS.backup.stepNoCommands;
      return;
    }
    const deviceId = Number(this.deviceId);
    let next: BackupBundlePayload;
    if (editIndex === null) {
      next = isDevice
        ? addDeviceMacroCommandStep(this.host.bundle, editor.entityId, editor.buttonId, commandId, timeByte)
        : addActivityMacroCommandStep(this.host.bundle, editor.entityId, editor.buttonId, deviceId, commandId, timeByte);
    } else {
      next = isDevice
        ? updateDeviceMacroStep(this.host.bundle, editor.entityId, editor.buttonId, editIndex, { commandId, hold: timeByte })
        : updateActivityMacroStep(this.host.bundle, editor.entityId, editor.buttonId, editIndex, { deviceId, commandId, hold: timeByte });
    }
    this.host._commitEditBundleEdit(next);
    this.closeDialog();
  };

  remove(index: number) {
    const editor = this.editor;
    if (!editor || !this.host.bundle) return;
    const next = editor.scope === "device"
      ? removeDeviceMacroStep(this.host.bundle, editor.entityId, editor.buttonId, index)
      : removeActivityMacroStep(this.host.bundle, editor.entityId, editor.buttonId, index);
    this.host._commitEditBundleEdit(next);
  }

  handleReorder = (event: Event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
    const editor = this.editor;
    if (!editor || !this.host.bundle) return;
    const sortableEvent = event as CustomEvent<{ oldIndex?: number; newIndex?: number }>;
    this.reorder(Number(sortableEvent.detail?.oldIndex), Number(sortableEvent.detail?.newIndex));
  };

  reorder(oldIndex: number, newIndex: number) {
    const editor = this.editor;
    if (!editor || !this.host.bundle) return;
    const items = this.currentItems();
    if (!Number.isFinite(oldIndex) || !Number.isFinite(newIndex) || oldIndex === newIndex) return;
    if (oldIndex < 0 || newIndex < 0 || oldIndex >= items.length || newIndex >= items.length) return;
    const order = items.map((_, index) => index);
    const [moved] = order.splice(oldIndex, 1);
    order.splice(newIndex, 0, moved);
    const next = editor.scope === "device"
      ? reorderDeviceMacroSteps(this.host.bundle, editor.entityId, editor.buttonId, order)
      : reorderActivityMacroSteps(this.host.bundle, editor.entityId, editor.buttonId, order);
    this.host._commitEditBundleEdit(next);
  }

  render(editor: { scope: BackupEditTargetKind; entityId: number; buttonId: number; name: string }) {
    const items = this.currentItems();
    // User macros (activity-bound) can be renamed right here so a freshly
    // created one can be named without backing out. Power On/Off slots keep
    // their fixed names, so no pencil for those.
    const canRename = editor.scope === "activity" && !POWER_MACRO_BUTTON_IDS.has(editor.buttonId);
    const sortable = this.host._haSortableReady && items.length > 1;
    const renderRows = () =>
      items.map((item, position) => this.renderRow(item, position, items.length));
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" aria-label=${TOOLS_CARD_STRINGS.common.backAria} @click=${this.closeEditor}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title-stack">
                  ${this.host._renderDetailCrumbs([
                    { label: this.host._entityKindCrumbLabel(editor.scope), onClick: this.host._requestClose },
                    { label: this.host._selectedEditTitle(), onClick: this.closeEditor },
                  ])}
                  <div class="detail-title">${editor.name}</div>
                </div>
                ${this.host._renderDirtyChip()}
                ${canRename
                  ? html`
                      <div class="detail-title-actions">
                        <button
                          class="icon-btn"
                          @click=${this.openNameRenameDialog}
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
                  <div class="quick-access-title">${TOOLS_CARD_STRINGS.backup.steps}</div>
                  <div class="quick-access-sub">
                    ${this.host._haSortableReady
                      ? TOOLS_CARD_STRINGS.backup.macroStepsSortableHelp
                      : TOOLS_CARD_STRINGS.backup.macroStepsHelp}
                  </div>
                </div>
                <div class="quick-access-head-actions">
                  ${editor.scope === "activity" && POWER_MACRO_BUTTON_IDS.has(editor.buttonId)
                    ? html`
                        <button class="quick-access-add-btn add-member-btn" @click=${this.host._openAddMemberDialog}>
                          <ha-icon icon="mdi:plus"></ha-icon>
                          <span>${TOOLS_CARD_STRINGS.backup.addMemberButton}</span>
                        </button>
                      `
                    : nothing}
                  <button class="quick-access-add-btn" @click=${this.openAdd}>
                    <ha-icon icon="mdi:plus"></ha-icon>
                    <span>${TOOLS_CARD_STRINGS.backup.addStep}</span>
                  </button>
                </div>
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
                              @item-moved=${this.handleReorder}
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
        ${this.renderDialog()}
        ${this.host._renderEditRenameDialog()}
        ${this.host._renderAddMemberDialog()}
        ${this.host._renderDeleteConfirmDialog()}
      </div>
    `;
  }

  renderRow(item: BackupMacroStepItem, position: number, count: number) {
    const isLast = position === count - 1;
    const isPower = item.kind === "power";
    const isInput = item.kind === "input";
    const meta = item.kind === "command" && item.hold > 0
      ? TOOLS_CARD_STRINGS.backup.holdLabel(byteToSeconds(item.hold))
      : "";
    const chip = isPower || isInput ? TOOLS_CARD_STRINGS.backup.requiredStepChip : TOOLS_CARD_STRINGS.backup.commandChip;
    // An activity power-ref row is the device's membership token, so its
    // delete affordance means "remove the device from this Activity" and
    // routes through the member impact-confirm (both sequences, favorites,
    // bindings, steps). Input refs keep their edit-only treatment.
    const editor = this.editor;
    const memberDeviceId = isPower && editor?.scope === "activity"
      ? Number(item.deviceId ?? 0)
      : 0;
    // Power refs: command/order protected (no rename) but their
    // attached wait is editable. Input refs: editable (change input), no
    // delete. Commands: full edit + delete. Every row owns an attached wait,
    // rendered as a slim sub-row UNDER the step (matching execution order:
    // step first, then the wait before the next step) — except the last
    // step, whose wait is dead time: the sub-row is hidden and mutations
    // normalize the stored value to 0.
    return html`
      <div class="quick-access-sortable-item" data-step-index=${item.index}>
        <div class="quick-access-row">
          ${count > 1
            ? this.host._renderReorderHandle(item.label, position, count, (delta) => this.reorder(position, position + delta))
            : html`<span></span>`}
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">${chip}</div>
            </div>
            ${meta ? html`<div class="quick-access-meta">${meta}</div>` : nothing}
          </div>
          <div class="quick-access-actions">
            ${isPower
              ? (memberDeviceId > 0
                  ? html`
                      <button
                        class="icon-btn icon-btn--danger"
                        @click=${() => this.host._openMemberRemoveConfirm(
                          Number(editor?.entityId ?? 0),
                          memberDeviceId,
                          this.host._memberDeviceName(Number(editor?.entityId ?? 0), memberDeviceId),
                        )}
                        aria-label=${TOOLS_CARD_STRINGS.backup.removeMemberAria}
                      >
                        <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                      </button>
                    `
                  : nothing)
              : html`
                  <button class="icon-btn" @click=${() => this.openEdit(item)} aria-label=${TOOLS_CARD_STRINGS.backup.editStepAria}>
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                  ${isInput
                    ? nothing
                    : html`
                        <button class="icon-btn icon-btn--danger" @click=${() => this.remove(item.index)} aria-label=${TOOLS_CARD_STRINGS.backup.deleteStepAria}>
                          <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                        </button>
                      `}
                `}
          </div>
        </div>
        ${isLast
          ? nothing
          : html`
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
                    .value=${byteToSeconds(item.wait)}
                    @change=${(event: Event) => this.handleWaitChange(item, event)}
                  />
                  <span class="step-wait-unit">${TOOLS_CARD_STRINGS.backup.stepWaitUnit}</span>
                </span>
              </label>
            `}
      </div>
    `;
  }

  renderDialog() {
    if (!this.dialogOpen || !this.host.bundle || !this.editor) return nothing;
    const editor = this.editor;
    const isEdit = this.editIndex !== null;
    const isActivity = editor.scope === "activity";
    const isInput = this.kind === "input";
    const isWifiEvent = this.kind === "wifi_event";
    const devices = this.host._editableDeviceOptions();
    const commandDeviceId = isInput ? this.deviceId : (isActivity ? this.deviceId : editor.entityId);
    const commands = commandDeviceId != null ? deviceCommandItems(this.host.bundle, commandDeviceId) : [];
    const canSave = isInput
      || (isWifiEvent
        ? !this.host._events.busy && (
            this.host._events.primary.mode === "existing"
              ? this.host._events.primary.slot != null
              : this.host._events.primary.name.trim().length > 0
          )
        : this.commandId != null && (!isActivity || this.deviceId != null));
    const title = isInput
      ? TOOLS_CARD_STRINGS.backup.inputStepTitle
      : isEdit
        ? TOOLS_CARD_STRINGS.backup.stepDialogEditTitle
        : TOOLS_CARD_STRINGS.backup.stepDialogAddTitle;
    return html`
      <div class="modal-backdrop" @click=${this.closeDialog}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${title}</div>
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} @click=${this.closeDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${isInput
              ? html`
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-step-input">${TOOLS_CARD_STRINGS.backup.inputStepCommand}</label>
                    <select id="sb-step-input" class="decoded-field-input" @change=${this.handleCommandChange}>
                      <option value="" ?selected=${this.commandId == null}>${TOOLS_CARD_STRINGS.backup.inputStepNone}</option>
                      ${commands.map((command) => html`
                        <option value=${command.commandId} ?selected=${command.commandId === this.commandId}>${command.label}</option>
                      `)}
                    </select>
                  </div>
                `
              : html`
                  ${isActivity && this.host._events.available()
                    ? html`
                        <div class="decoded-field">
                          <label class="decoded-field-label" for="sb-step-kind">${TOOLS_CARD_STRINGS.backup.addShortcutKindLabel}</label>
                          <select
                            id="sb-step-kind"
                            class="decoded-field-input"
                            @change=${(event: Event) => {
                              const value = (event.target as HTMLSelectElement).value as MacroStepKind;
                              this.kind = value;
                              if (value === "wifi_event") this.host._events.primary = this.host._events.defaultSel();
                              this.error = "";
                            }}
                          >
                            <option value="command" ?selected=${this.kind === "command"}>${TOOLS_CARD_STRINGS.backup.shortcutKindCommand}</option>
                            <option value="wifi_event" ?selected=${isWifiEvent}>${TOOLS_CARD_STRINGS.backup.shortcutKindWifiEvent}</option>
                          </select>
                        </div>
                      `
                    : nothing}
                  ${isWifiEvent
                    ? this.host._events.renderTargetFields({
                        idPrefix: "sb-step",
                        sel: this.host._events.primary,
                        onSelChange: (sel) => {
                          this.host._events.primary = sel;
                          this.error = "";
                        },
                      })
                    : html`
                        ${isActivity
                          ? this.host._renderBindingSelect({
                              id: "sb-step-device",
                              label: TOOLS_CARD_STRINGS.backup.stepDevice,
                              value: this.deviceId,
                              options: devices.map((device) => ({ value: device.id, label: device.label })),
                              onChange: this.handleDeviceChange,
                              emptyText: TOOLS_CARD_STRINGS.backup.bindingNoDevices,
                            })
                          : nothing}
                        ${this.host._renderBindingSelect({
                          id: "sb-step-command",
                          label: TOOLS_CARD_STRINGS.backup.stepCommand,
                          value: this.commandId,
                          options: commands.map((command) => ({ value: command.commandId, label: command.label })),
                          onChange: this.handleCommandChange,
                          emptyText: TOOLS_CARD_STRINGS.backup.stepNoCommands,
                        })}
                      `}
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-step-hold">${TOOLS_CARD_STRINGS.backup.stepHoldSeconds}</label>
                    <input
                      id="sb-step-hold"
                      class="decoded-field-input"
                      type="number"
                      min="0"
                      max="120"
                      step="0.5"
                      .value=${this.holdSeconds}
                      @input=${this.handleHoldInput}
                      @change=${this.handleHoldChange}
                    />
                  </div>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this.closeDialog}>${TOOLS_CARD_STRINGS.backup.stepCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this.apply} ?disabled=${!canSave}>
                ${isEdit ? TOOLS_CARD_STRINGS.backup.stepSave : TOOLS_CARD_STRINGS.backup.stepAdd}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
