// The button binding picker (add and edit, short press and the long-press
// leg) as a Lit reactive controller (R6, CR-F2-14).
//
// It owns the dialog state, its handlers, the macro and long-press target
// resolution and the apply. Macro options, the macro target reset shared
// with the Add shortcut dialog, and the Wifi Event target stay outside.

import { html, nothing, type ReactiveController, type ReactiveControllerHost } from "lit";
import { TOOLS_CARD_STRINGS } from "../../strings";
import type { BackupBundlePayload } from "../../shared/ha-context";
import {
  activityButtonBindingItems,
  activityUserMacroSummaries,
  addActivityUserMacro,
  type ButtonCatalogEntry,
  bundleDeviceBrand,
  isWifiEventsBrand,
  buttonName,
  deviceButtonBindingItems,
  deviceCommandItems,
  unboundButtonsForActivity,
  unboundButtonsForDevice,
  upsertActivityButtonBinding,
  upsertDeviceButtonBinding,
} from "../backup-state";
import type {
  ActivityBindingTargetKind,
  BackupEditTargetKind,
  MacroTargetMode,
  WifiEventTargetSel,
} from "./host-types";
import { editorErrorMessage, sanitizeBundleName } from "./names";
import type { SofabatonEditDetailView } from "../edit-detail-view";

/** The element members the controller reaches. */
export type BindingDialogHost = ReactiveControllerHost &
  Pick<
    SofabatonEditDetailView,
    "_commitEditBundleEdit"
    | "_editableDeviceOptions"
    | "_events"
    | "_macroName"
    | "_macroOptions"
    | "_openMacroEditor"
    | "_renderBindingSelect"
    | "_resetMacroTarget"
    | "bundle"
    | "entityId"
    | "wifiEvents"
  >;

export class BindingDialogController implements ReactiveController {
  private _open = false;
  get open(): boolean {
    return this._open;
  }
  set open(value: boolean) {
    if (value === this._open) return;
    this._open = value;
    this.host.requestUpdate();
  }
  private _scope: BackupEditTargetKind = "activity";
  get scope(): BackupEditTargetKind {
    return this._scope;
  }
  set scope(value: BackupEditTargetKind) {
    if (value === this._scope) return;
    this._scope = value;
    this.host.requestUpdate();
  }
  private _editButtonId: number | null = null;
  get editButtonId(): number | null {
    return this._editButtonId;
  }
  set editButtonId(value: number | null) {
    if (value === this._editButtonId) return;
    this._editButtonId = value;
    this.host.requestUpdate();
  }
  private _buttonId: number | null = null;
  get buttonId(): number | null {
    return this._buttonId;
  }
  set buttonId(value: number | null) {
    if (value === this._buttonId) return;
    this._buttonId = value;
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
  private _longPressEnabled = false;
  get longPressEnabled(): boolean {
    return this._longPressEnabled;
  }
  set longPressEnabled(value: boolean) {
    if (value === this._longPressEnabled) return;
    this._longPressEnabled = value;
    this.host.requestUpdate();
  }
  private _lpDeviceId: number | null = null;
  get lpDeviceId(): number | null {
    return this._lpDeviceId;
  }
  set lpDeviceId(value: number | null) {
    if (value === this._lpDeviceId) return;
    this._lpDeviceId = value;
    this.host.requestUpdate();
  }
  private _lpCommandId: number | null = null;
  get lpCommandId(): number | null {
    return this._lpCommandId;
  }
  set lpCommandId(value: number | null) {
    if (value === this._lpCommandId) return;
    this._lpCommandId = value;
    this.host.requestUpdate();
  }
  private _targetKind: ActivityBindingTargetKind = "command";
  get targetKind(): ActivityBindingTargetKind {
    return this._targetKind;
  }
  set targetKind(value: ActivityBindingTargetKind) {
    if (value === this._targetKind) return;
    this._targetKind = value;
    this.host.requestUpdate();
  }
  private _actionName = "";
  get actionName(): string {
    return this._actionName;
  }
  set actionName(value: string) {
    if (value === this._actionName) return;
    this._actionName = value;
    this.host.requestUpdate();
  }
  private _macroMode: MacroTargetMode = "new";
  get macroMode(): MacroTargetMode {
    return this._macroMode;
  }
  set macroMode(value: MacroTargetMode) {
    if (value === this._macroMode) return;
    this._macroMode = value;
    this.host.requestUpdate();
  }
  private _macroId: number | null = null;
  get macroId(): number | null {
    return this._macroId;
  }
  set macroId(value: number | null) {
    if (value === this._macroId) return;
    this._macroId = value;
    this.host.requestUpdate();
  }
  private _lpTargetKind: ActivityBindingTargetKind = "command";
  get lpTargetKind(): ActivityBindingTargetKind {
    return this._lpTargetKind;
  }
  set lpTargetKind(value: ActivityBindingTargetKind) {
    if (value === this._lpTargetKind) return;
    this._lpTargetKind = value;
    this.host.requestUpdate();
  }
  private _lpMacroMode: MacroTargetMode = "new";
  get lpMacroMode(): MacroTargetMode {
    return this._lpMacroMode;
  }
  set lpMacroMode(value: MacroTargetMode) {
    if (value === this._lpMacroMode) return;
    this._lpMacroMode = value;
    this.host.requestUpdate();
  }
  private _lpMacroId: number | null = null;
  get lpMacroId(): number | null {
    return this._lpMacroId;
  }
  set lpMacroId(value: number | null) {
    if (value === this._lpMacroId) return;
    this._lpMacroId = value;
    this.host.requestUpdate();
  }
  private _lpActionName = "";
  get lpActionName(): string {
    return this._lpActionName;
  }
  set lpActionName(value: string) {
    if (value === this._lpActionName) return;
    this._lpActionName = value;
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

  constructor(private readonly host: BindingDialogHost) {
    host.addController(this);
  }

  hostConnected(): void {}

  // ── Button bindings (add / edit picker) ─────────────────────────────
  commandDeviceOptions(): Array<{ value: number; label: string }> {
    if (!this.host.bundle) return [];
    return this.host._editableDeviceOptions()
      .map((device) => ({ value: device.id, label: device.label }));
  }

  targetKindFor(
    deviceId: number | null | undefined,
  ): ActivityBindingTargetKind {
    if (!this.host.bundle || this.host.entityId == null) return "command";
    const dId = Number(deviceId || 0);
    if (dId === Number(this.host.entityId)) return "action";
    if (this.host._events.available() && isWifiEventsBrand(bundleDeviceBrand(this.host.bundle, dId))) {
      return "wifi_event";
    }
    return "command";
  }

  // Command options for a chosen target: the activity's own macros when the
  // target is the activity itself, otherwise the target device's commands.
  commandOptions(targetDeviceId: number | null): Array<{ value: number; label: string }> {
    if (targetDeviceId == null || !this.host.bundle) return [];
    if (this.scope === "activity" && this.host.entityId != null && targetDeviceId === Number(this.host.entityId)) {
      return activityUserMacroSummaries(this.host.bundle, Number(this.host.entityId))
        .map((macro) => ({ value: macro.buttonId, label: macro.name }));
    }
    return deviceCommandItems(this.host.bundle, targetDeviceId).map((command) => ({ value: command.commandId, label: command.label }));
  }

  openAdd(kind: BackupEditTargetKind) {
    if (this.host.entityId == null || !this.host.bundle) return;
    const entityId = Number(this.host.entityId);
    const unbound = kind === "activity"
      ? unboundButtonsForActivity(this.host.bundle, entityId)
      : unboundButtonsForDevice(this.host.bundle, entityId);
    if (!unbound.length) return;
    this.scope = kind;
    this.editButtonId = null;
    this.buttonId = unbound[0].code;
    this.targetKind = "command";
    this.actionName = "";
    this.host._resetMacroTarget("binding");
    this.lpTargetKind = "command";
    this.lpActionName = "";
    this.host._resetMacroTarget("bindingLp");
    if (kind === "activity") {
      const devices = this.commandDeviceOptions();
      this.deviceId = devices[0]?.value ?? null;
    } else {
      this.deviceId = entityId;
    }
    const commandDeviceId = kind === "activity" ? this.deviceId : entityId;
    const commands = commandDeviceId != null ? deviceCommandItems(this.host.bundle, commandDeviceId) : [];
    this.commandId = commands[0]?.commandId ?? null;
    this.longPressEnabled = false;
    this.lpDeviceId = this.deviceId;
    this.lpCommandId = this.commandId;
    this.error = "";
    this.host._events.load();
    this.open = true;
  }

  openEdit(kind: BackupEditTargetKind, buttonId: number) {
    if (this.host.entityId == null || !this.host.bundle) return;
    const entityId = Number(this.host.entityId);
    const items = kind === "activity"
      ? activityButtonBindingItems(this.host.bundle, entityId)
      : deviceButtonBindingItems(this.host.bundle, entityId);
    const item = items.find((entry) => entry.buttonId === Number(buttonId));
    if (!item) return;
    this.scope = kind;
    this.editButtonId = item.buttonId;
    this.buttonId = item.buttonId;
    this.deviceId = kind === "activity" ? (item.deviceId ?? null) : entityId;
    this.commandId = item.commandId;
    this.targetKind = kind === "activity"
      ? this.targetKindFor(item.deviceId)
      : "command";
    if (this.targetKind === "wifi_event") {
      // A wifi-event binding is atomic: the primary short record maps to
      // its event slot (short command id = slot + 1); long press (if
      // present) is the same event's long record, gated by the toggle.
      this.host._events.primary = {
        mode: "existing",
        slot: Number(item.commandId) - 1,
        name: "",
      };
      this.longPressEnabled = Boolean(item.longPress);
      this.error = "";
      this.host._events.load();
      this.open = true;
      return;
    }
    this.actionName = this.targetKind === "action"
      ? this.host._macroName(item.commandId)
      : "";
    this.macroMode = this.targetKind === "action" ? "existing" : "new";
    this.macroId = this.targetKind === "action" ? item.commandId : null;
    this.longPressEnabled = Boolean(item.longPress);
    this.lpDeviceId = kind === "activity"
      ? (item.longPress?.deviceId ?? item.deviceId ?? null)
      : entityId;
    this.lpCommandId = item.longPress?.commandId ?? null;
    this.lpTargetKind = kind === "activity"
      ? this.targetKindFor(this.lpDeviceId)
      : "command";
    this.lpActionName = this.lpTargetKind === "action"
      ? this.host._macroName(this.lpCommandId)
      : "";
    this.lpMacroMode = this.lpTargetKind === "action" ? "existing" : "new";
    this.lpMacroId = this.lpTargetKind === "action" ? this.lpCommandId : null;
    this.error = "";
    this.host._events.load();
    this.open = true;
  }

  close = () => {
    this.open = false;
    this.editButtonId = null;
    this.buttonId = null;
    this.deviceId = null;
    this.commandId = null;
    this.longPressEnabled = false;
    this.lpDeviceId = null;
    this.lpCommandId = null;
    this.targetKind = "command";
    this.actionName = "";
    this.macroMode = "new";
    this.macroId = null;
    this.lpTargetKind = "command";
    this.lpMacroMode = "new";
    this.lpMacroId = null;
    this.lpActionName = "";
    this.error = "";
  };

  handleButtonChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this.buttonId = Number.isFinite(value) ? value : null;
  };

  handleDeviceChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this.deviceId = Number.isFinite(value) ? value : null;
    this.commandId = this.commandOptions(this.deviceId)[0]?.value ?? null;
  };

  handleCommandChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this.commandId = Number.isFinite(value) ? value : null;
  };

  handleTargetKindChange = (event: Event) => {
    const kind = (event.target as HTMLSelectElement).value as ActivityBindingTargetKind;
    this.targetKind = kind;
    this.error = "";
    if (kind === "command") {
      const devices = this.commandDeviceOptions();
      if (!devices.some((device) => device.value === this.deviceId)) {
        this.deviceId = devices[0]?.value ?? null;
      }
      this.commandId = this.commandOptions(this.deviceId)[0]?.value ?? null;
      return;
    }
    if (kind === "wifi_event") {
      this.host._events.primary = this.host._events.defaultSel();
      return;
    }
    // "action"
    this.host._resetMacroTarget("binding");
    this.actionName ||= this.host._macroName(this.commandId);
  };

  handleActionNameInput = (event: Event) => {
    this.actionName = (event.target as HTMLInputElement).value;
    this.error = "";
  };

  handleMacroTargetChange = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "__new__") {
      this.macroMode = "new";
      this.macroId = null;
    } else {
      this.macroMode = "existing";
      this.macroId = Number(value);
    }
    this.error = "";
  };

  handleLpTargetKindChange = (event: Event) => {
    const kind = (event.target as HTMLSelectElement).value as ActivityBindingTargetKind;
    this.lpTargetKind = kind;
    this.error = "";
    if (kind === "command") {
      const devices = this.commandDeviceOptions();
      if (!devices.some((device) => device.value === this.lpDeviceId)) {
        this.lpDeviceId = devices[0]?.value ?? null;
      }
      this.lpCommandId = this.commandOptions(this.lpDeviceId)[0]?.value ?? null;
      return;
    }
    // "action" (the long-press leg never targets a wifi event — that is
    // only reachable atomically when the PRIMARY is a wifi event).
    this.host._resetMacroTarget("bindingLp");
    this.lpActionName ||= this.host._macroName(this.lpCommandId);
  };

  handleLpActionNameInput = (event: Event) => {
    this.lpActionName = (event.target as HTMLInputElement).value;
    this.error = "";
  };

  handleLpMacroTargetChange = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    if (value === "__new__") {
      this.lpMacroMode = "new";
      this.lpMacroId = null;
    } else {
      this.lpMacroMode = "existing";
      this.lpMacroId = Number(value);
    }
    this.error = "";
  };

  handleLongPressToggle = (event: Event) => {
    const enabled = Boolean((event.target as { checked?: boolean }).checked);
    this.longPressEnabled = enabled;
    if (!enabled || !this.host.bundle) return;
    this.lpTargetKind = "command";
    if (this.scope === "activity") {
      const devices = this.commandDeviceOptions();
      if (!devices.some((device) => device.value === this.lpDeviceId)) {
        this.lpDeviceId = devices[0]?.value ?? null;
      }
    } else if (this.lpDeviceId == null) {
      this.lpDeviceId = Number(this.host.entityId);
    }
    const commands = this.commandOptions(this.lpDeviceId);
    if (!commands.some((command) => command.value === this.lpCommandId)) {
      this.lpCommandId = commands[0]?.value ?? null;
    }
  };

  handleLpDeviceChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this.lpDeviceId = Number.isFinite(value) ? value : null;
    this.lpCommandId = this.commandOptions(this.lpDeviceId)[0]?.value ?? null;
  };

  handleLpCommandChange = (event: Event) => {
    const value = Number((event.target as HTMLSelectElement).value);
    this.lpCommandId = Number.isFinite(value) ? value : null;
  };

  resolveMacroTarget(
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

  resolveActivityLongPressTarget(
    bundle: BackupBundlePayload,
    activityId: number,
  ): {
    bundle: BackupBundlePayload;
    longPress: { deviceId: number; commandId: number } | null;
    createdMacro: { buttonId: number; name: string } | null;
  } | null {
    if (!this.longPressEnabled) {
      return { bundle, longPress: null, createdMacro: null };
    }
    if (this.lpTargetKind === "command") {
      if (!this.lpDeviceId || !this.lpCommandId) {
        this.error = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return null;
      }
      return {
        bundle,
        longPress: {
          deviceId: Number(this.lpDeviceId),
          commandId: Number(this.lpCommandId),
        },
        createdMacro: null,
      };
    }
    // "action"
    const resolved = this.resolveMacroTarget(
      bundle,
      activityId,
      this.lpMacroMode,
      this.lpMacroId,
      this.lpActionName,
    );
    if (!resolved) {
      this.error = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
      return null;
    }
    return {
      bundle: resolved.bundle,
      longPress: { deviceId: activityId, commandId: resolved.macroId },
      createdMacro: resolved.created ? { buttonId: resolved.macroId, name: resolved.name } : null,
    };
  }

  /**
   * Async binding apply when the button targets a Wifi Event. The event
   * is atomic: the short press fires its short record, and — when the
   * long-press toggle is on — the *same* event's long record is wired to
   * the button's long press (and the event's long-press action is enabled
   * for configuration in the Events tab). There is no independent
   * long-press target here; that would collide with the Wifi Events model
   * where short/long are two actions of one event.
   */
  applyActivityWithWifiEvents = async () => {
    const S = TOOLS_CARD_STRINGS.backup;
    if (!this.host.bundle || this.host.entityId == null) return;
    const activityId = Number(this.host.entityId);
    const buttonId = Number(this.buttonId);
    if (!buttonId) {
      this.error = S.bindingIncomplete;
      return;
    }
    try {
      const ref = await this.host._events.resolveRef(this.host._events.primary);
      let longPress: { deviceId: number; commandId: number } | null = null;
      if (this.longPressEnabled) {
        // Wire the SAME event's long record and turn on its long-press
        // action (a pure store-flag edit — the long record is always
        // deployed; the Events tab exposes the action).
        await this.host.wifiEvents!.enableLongPress(ref.slotIndex);
        this.host._events.list = null;
        longPress = { deviceId: ref.deviceId, commandId: ref.longCommandId };
      }
      this.host._commitEditBundleEdit(upsertActivityButtonBinding(ref.bundle, activityId, {
        buttonId,
        deviceId: ref.deviceId,
        commandId: ref.shortCommandId,
        longPress,
      }));
      this.close();
    } catch (err) {
      this.error = editorErrorMessage(err, "wifi_event");
    }
  };

  apply = () => {
    if (!this.host.bundle || this.host.entityId == null) return;
    const buttonId = Number(this.buttonId);
    const entityId = Number(this.host.entityId);
    if (!buttonId) {
      this.error = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
      return;
    }
    // A Wifi Event binding is atomic (short + long from one event); its
    // long-press leg is never an independent target.
    if (this.scope === "activity" && this.targetKind === "wifi_event") {
      void this.applyActivityWithWifiEvents();
      return;
    }
    if (this.scope === "activity") {
      const activityId = entityId;
      let next = this.host.bundle;
      let macroToOpen: { buttonId: number; name: string } | null = null;
      const longPressTarget = this.resolveActivityLongPressTarget(next, activityId);
      if (!longPressTarget) return;
      next = longPressTarget.bundle;
      macroToOpen = longPressTarget.createdMacro;
      const longPress = longPressTarget.longPress;
      if (this.targetKind === "command") {
        const commandId = Number(this.commandId);
        if (!commandId || !this.deviceId) {
          this.error = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
          return;
        }
        this.host._commitEditBundleEdit(upsertActivityButtonBinding(next, activityId, {
          buttonId,
          deviceId: Number(this.deviceId),
          commandId,
          longPress,
        }));
        this.close();
        if (macroToOpen) this.host._openMacroEditor("activity", activityId, macroToOpen.buttonId, macroToOpen.name);
        return;
      }
      // "action"
      const resolved = this.resolveMacroTarget(
        next,
        activityId,
        this.macroMode,
        this.macroId,
        this.actionName,
      );
      if (!resolved) {
        this.error = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return;
      }
      next = upsertActivityButtonBinding(resolved.bundle, activityId, {
        buttonId,
        deviceId: activityId,
        commandId: resolved.macroId,
        longPress,
      });
      this.host._commitEditBundleEdit(next);
      this.close();
      if (resolved.created) macroToOpen = { buttonId: resolved.macroId, name: resolved.name };
      if (macroToOpen) this.host._openMacroEditor("activity", activityId, macroToOpen.buttonId, macroToOpen.name);
    } else {
      const commandId = Number(this.commandId);
      if (!commandId) {
        this.error = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return;
      }
      const longPressCommandId = this.longPressEnabled && this.lpCommandId
        ? Number(this.lpCommandId)
        : null;
      this.host._commitEditBundleEdit(upsertDeviceButtonBinding(this.host.bundle, entityId, {
        buttonId,
        commandId,
        longPressCommandId,
      }));
      this.close();
    }
  };

  renderMacroTargetFields(params: {
    idPrefix: string;
    mode: MacroTargetMode;
    macroId: number | null;
    name: string;
    onMacroChange: (event: Event) => void;
    onNameInput: (event: Event) => void;
  }) {
    const S = TOOLS_CARD_STRINGS.backup;
    const macros = this.host._macroOptions();
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

  render() {
    if (!this.open || !this.host.bundle || this.host.entityId == null) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    const scope = this.scope;
    const entityId = Number(this.host.entityId);
    const isEdit = this.editButtonId != null;
    const isActivity = scope === "activity";
    const targetKind = isActivity ? this.targetKind : "command";
    const lpTargetKind = isActivity ? this.lpTargetKind : "command";
    const unbound: ButtonCatalogEntry[] = scope === "activity"
      ? unboundButtonsForActivity(this.host.bundle, entityId)
      : unboundButtonsForDevice(this.host.bundle, entityId);
    const commandDeviceOptions = this.commandDeviceOptions();
    const commandDeviceId = scope === "activity" && targetKind === "command" ? this.deviceId : entityId;
    const commandOptions = this.commandOptions(commandDeviceId);
    const lpDeviceId = scope === "activity" && lpTargetKind === "command" ? this.lpDeviceId : entityId;
    const lpCommandOptions = this.commandOptions(lpDeviceId);
    const wifiSelReady = (sel: WifiEventTargetSel) => !this.host._events.busy && (
      sel.mode === "existing" ? sel.slot != null : sel.name.trim().length > 0
    );
    // A wifi-event binding is atomic: the long-press leg is the same
    // event's long record, so it never gates saving independently.
    const primaryIsWifiEvent = scope === "activity" && targetKind === "wifi_event";
    const canSave = this.buttonId != null && (
      scope === "device"
        ? this.commandId != null
        : targetKind === "command"
          ? this.deviceId != null && this.commandId != null
          : targetKind === "wifi_event"
            ? wifiSelReady(this.host._events.primary)
            : true
    );
    const title = isEdit
      ? S.bindingDialogEditTitle(buttonName(Number(this.buttonId)))
      : S.bindingDialogAddTitle;
    const commandFields = html`
      ${scope === "activity"
        ? this.host._renderBindingSelect({
            id: "sb-binding-device",
            label: S.bindingTargetDevice,
            value: this.deviceId,
            options: commandDeviceOptions,
            onChange: this.handleDeviceChange,
            emptyText: S.bindingNoDevices,
          })
        : nothing}
      ${this.host._renderBindingSelect({
        id: "sb-binding-command",
        label: S.bindingCommand,
        value: this.commandId,
        options: commandOptions,
        onChange: this.handleCommandChange,
        emptyText: S.bindingNoCommands,
      })}
    `;
    const actionFields = this.renderMacroTargetFields({
      idPrefix: "sb-binding",
      mode: this.macroMode,
      macroId: this.macroId,
      name: this.actionName,
      onMacroChange: this.handleMacroTargetChange,
      onNameInput: this.handleActionNameInput,
    });
    const lpCommandFields = html`
      ${scope === "activity"
        ? this.host._renderBindingSelect({
            id: "sb-binding-lp-device",
            label: S.bindingLongPressDevice,
            value: this.lpDeviceId,
            options: commandDeviceOptions,
            onChange: this.handleLpDeviceChange,
            emptyText: S.bindingNoDevices,
          })
        : nothing}
      ${this.host._renderBindingSelect({
        id: "sb-binding-lp-command",
        label: S.bindingLongPressCommand,
        value: this.lpCommandId,
        options: lpCommandOptions,
        onChange: this.handleLpCommandChange,
        emptyText: S.bindingNoCommands,
      })}
    `;
    const lpActionFields = this.renderMacroTargetFields({
      idPrefix: "sb-binding-lp",
      mode: this.lpMacroMode,
      macroId: this.lpMacroId,
      name: this.lpActionName,
      onMacroChange: this.handleLpMacroTargetChange,
      onNameInput: this.handleLpActionNameInput,
    });
    return html`
      <div class="modal-backdrop" @click=${this.close}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${title}</div>
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} @click=${this.close}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${isEdit
              ? html`
                  <div class="decoded-field">
                    <span class="decoded-field-label">${S.bindingButton}</span>
                    <div class="binding-static-field">${buttonName(Number(this.buttonId))}</div>
                  </div>
                `
              : this.host._renderBindingSelect({
                  id: "sb-binding-button",
                  label: S.bindingButton,
                  value: this.buttonId,
                  options: unbound.map((entry) => ({ value: entry.code, label: entry.name })),
                  onChange: this.handleButtonChange,
                  emptyText: S.bindingNoButtons,
                })}
            ${isActivity
              ? html`
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-binding-kind">${S.addShortcutKindLabel}</label>
                    <select
                      id="sb-binding-kind"
                      class="decoded-field-input"
                      @change=${this.handleTargetKindChange}
                    >
                      <option value="command" ?selected=${targetKind === "command"}>${S.shortcutKindCommand}</option>
                      <option value="action" ?selected=${targetKind === "action"}>${S.shortcutKindAction}</option>
                      ${this.host._events.available()
                        ? html`<option value="wifi_event" ?selected=${targetKind === "wifi_event"}>${S.shortcutKindWifiEvent}</option>`
                        : nothing}
                    </select>
                  </div>
                `
              : nothing}
            ${targetKind === "command"
              ? commandFields
              : targetKind === "wifi_event"
                ? this.host._events.renderTargetFields({
                    idPrefix: "sb-binding",
                    sel: this.host._events.primary,
                    onSelChange: (sel) => {
                      this.host._events.primary = sel;
                      this.error = "";
                    },
                  })
                : actionFields}
            <div class="binding-toggle-row">
              <span class="decoded-field-label">${S.bindingEnableLongPress}</span>
              <ha-switch
                .checked=${this.longPressEnabled}
                @change=${this.handleLongPressToggle}
              ></ha-switch>
            </div>
            ${this.longPressEnabled
              ? primaryIsWifiEvent
                ? html`
                    <div class="decoded-field-helper">${S.wifiEventBindingLongPressNote}</div>
                  `
                : html`
                    ${isActivity
                      ? html`
                          <div class="decoded-field">
                            <label class="decoded-field-label" for="sb-binding-lp-kind">${S.addShortcutKindLabel}</label>
                            <select
                              id="sb-binding-lp-kind"
                              class="decoded-field-input"
                              @change=${this.handleLpTargetKindChange}
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
            <div class="dialog-footer-note">${this.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this.close}>${S.bindingCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this.apply} ?disabled=${!canSave}>
                ${isEdit ? S.bindingSave : S.bindingAdd}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
