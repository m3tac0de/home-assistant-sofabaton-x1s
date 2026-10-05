// The button binding picker (add and edit, short press and the long-press
// leg) as a Lit reactive controller (R6, CR-F2-14).
//
// It owns the dialog state, its handlers, the macro and long-press target
// resolution and the apply. Macro options, the macro target reset shared
// with the Add shortcut dialog, and the Wifi Event target stay outside.
// Either leg may be a device command, a macro or a Wifi Event, in any
// combination (docs/internal/wifi-events-single-record-plan.md), but one
// assignment creates at most one new item: while one leg creates a new
// macro or Wifi Event, the other leg only offers existing ones.

import { html, nothing, type ReactiveController, type ReactiveControllerHost } from "lit";
import { TOOLS_CARD_STRINGS } from "../../strings";
import { anchoredListPosition, moveListFocus } from "../../shared/utils/overlay-menu";
import type { BackupBundlePayload } from "../../shared/ha-context";
import {
  activityButtonBindingItems,
  activityUserMacroSummaries,
  addActivityUserMacro,
  copyActivityUserMacro,
  macroCopyValue,
  macroTargetFromValue,
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
import { renderKindSegments } from "./kind-segments";
import { editorErrorMessage, sanitizeBundleName } from "./names";
import type { SofabatonEditDetailView } from "../edit-detail-view";

/** The element members the controller reaches. */
export type BindingDialogHost = ReactiveControllerHost &
  Pick<
    SofabatonEditDetailView,
    "_commitEditBundleEdit"
    | "_editableDeviceOptions"
    | "_events"
    | "_copyableMacros"
    | "_macroName"
    | "_macroOptions"
    | "_renderBindingSelect"
    | "_resetMacroTarget"
    | "_steps"
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
  /** The source activity while a leg copies a macro (macroMode "copy"; macroId is then the source macro). */
  macroSourceId: number | null = null;
  lpMacroSourceId: number | null = null;
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
      // An event's record is slot + 1.
      this.host._events.primary = { mode: "existing", slot: Number(item.commandId) - 1, name: "" };
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
    if (this.lpTargetKind === "wifi_event") {
      this.host._events.longPress = { mode: "existing", slot: Number(this.lpCommandId) - 1, name: "" };
    }
    this.error = "";
    this.host._events.load();
    this.open = true;
  }

  close = () => {
    this.open = false;
    this.macroPicker = null;
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
    if (kind === this.targetKind) return;
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

  handleMacroTargetChange = (value: string) => {
    const target = macroTargetFromValue(value);
    this.macroMode = target.mode;
    this.macroId = target.macroId;
    this.macroSourceId = target.sourceId;
    this.error = "";
    this.host.requestUpdate();
  };

  handleLpTargetKindChange = (event: Event) => {
    const kind = (event.target as HTMLSelectElement).value as ActivityBindingTargetKind;
    if (kind === this.lpTargetKind) return;
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
    if (kind === "wifi_event") {
      this.host._events.longPress = this.host._events.defaultSel();
      return;
    }
    // "action"
    this.host._resetMacroTarget("bindingLp");
    this.lpActionName ||= this.host._macroName(this.lpCommandId);
  };

  handleLpActionNameInput = (event: Event) => {
    this.lpActionName = (event.target as HTMLInputElement).value;
    this.error = "";
  };

  handleLpMacroTargetChange = (value: string) => {
    const target = macroTargetFromValue(value);
    this.lpMacroMode = target.mode;
    this.lpMacroId = target.macroId;
    this.lpMacroSourceId = target.sourceId;
    this.error = "";
    this.host.requestUpdate();
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

  /** The short-press leg creates a new macro or Wifi Event. */
  primaryCreatesNew(): boolean {
    if (this.scope !== "activity") return false;
    if (this.targetKind === "action") return this.macroMode === "new";
    if (this.targetKind === "wifi_event") return this.host._events.primary.mode === "new";
    return false;
  }

  /** The long-press leg creates a new macro or Wifi Event. */
  longPressCreatesNew(): boolean {
    if (this.scope !== "activity" || !this.longPressEnabled) return false;
    if (this.lpTargetKind === "action") return this.lpMacroMode === "new";
    if (this.lpTargetKind === "wifi_event") return this.host._events.longPress.mode === "new";
    return false;
  }

  /** The target kinds one leg may offer: a kind whose only choice would be
   *  "Create new" is left out while the other leg already creates one. */
  legKinds(otherCreatesNew: boolean): ActivityBindingTargetKind[] {
    const kinds: ActivityBindingTargetKind[] = ["command"];
    if (!otherCreatesNew || this.host._macroOptions().length > 0) kinds.push("action");
    if (this.host._events.available() && (!otherCreatesNew || this.host._events.deployed().length > 0)) {
      kinds.push("wifi_event");
    }
    return kinds;
  }

  resolveMacroTarget(
    bundle: BackupBundlePayload,
    activityId: number,
    mode: MacroTargetMode,
    macroId: number | null,
    rawName: string,
    sourceId: number | null = null,
  ): { bundle: BackupBundlePayload; macroId: number; name: string; created: boolean } | null {
    if (mode === "copy") {
      // Verbatim, so nothing to open afterwards: not "created" in the editor sense.
      const copiedBundle = copyActivityUserMacro(bundle, activityId, Number(sourceId), Number(macroId));
      if (copiedBundle === bundle) return null;
      const copies = activityUserMacroSummaries(copiedBundle, activityId);
      const copy = copies[copies.length - 1];
      return copy ? { bundle: copiedBundle, macroId: copy.buttonId, name: copy.name, created: false } : null;
    }
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
      this.lpMacroSourceId,
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

  apply = () => {
    if (!this.host.bundle || this.host.entityId == null) return;
    if (!Number(this.buttonId)) {
      this.error = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
      return;
    }
    const isActivity = this.scope === "activity";
    const primaryEvent = isActivity && this.targetKind === "wifi_event";
    const longPressEvent = isActivity && this.longPressEnabled && this.lpTargetKind === "wifi_event";
    if (primaryEvent || longPressEvent) {
      void this.applyWithWifiEvents(primaryEvent, longPressEvent);
      return;
    }
    this.applyResolved(this.host.bundle, null, null);
  };

  /**
   * Resolve the Wifi Event leg(s) first (selecting one grafts the events
   * device into the host's bundles; a new one is allocated in the store),
   * then write the binding like any other. An existing event resolves
   * before a new one: creating an event reloads the list the existing
   * selection is looked up in.
   */
  applyWithWifiEvents = async (primaryEvent: boolean, longPressEvent: boolean) => {
    const events = this.host._events;
    const legs: Array<"primary" | "longPress"> = [];
    if (primaryEvent) legs.push("primary");
    if (longPressEvent) legs.push("longPress");
    legs.sort((left, right) => Number(events[left].mode === "new") - Number(events[right].mode === "new"));
    const resolved: Partial<Record<"primary" | "longPress", { deviceId: number; commandId: number }>> = {};
    let bundle = this.host.bundle;
    try {
      for (const leg of legs) {
        const ref = await events.resolveRef(events[leg]);
        resolved[leg] = { deviceId: ref.deviceId, commandId: ref.commandId };
        bundle = ref.bundle;
      }
    } catch (err) {
      this.error = editorErrorMessage(err, "wifi_event");
      return;
    }
    if (bundle) this.applyResolved(bundle, resolved.primary ?? null, resolved.longPress ?? null);
  };

  /** Write the binding into `bundle`; `primaryEvent` / `longPressEvent` are
   *  the already resolved Wifi Event legs. */
  applyResolved(
    bundle: BackupBundlePayload,
    primaryEvent: { deviceId: number; commandId: number } | null,
    longPressEvent: { deviceId: number; commandId: number } | null,
  ) {
    const buttonId = Number(this.buttonId);
    const entityId = Number(this.host.entityId);
    if (this.scope === "activity") {
      const activityId = entityId;
      let next = bundle;
      let macroToOpen: { buttonId: number; name: string } | null = null;
      const longPressTarget = longPressEvent
        ? { bundle: next, longPress: longPressEvent, createdMacro: null }
        : this.resolveActivityLongPressTarget(next, activityId);
      if (!longPressTarget) return;
      next = longPressTarget.bundle;
      macroToOpen = longPressTarget.createdMacro;
      const longPress = longPressTarget.longPress;
      if (this.targetKind === "command" || primaryEvent) {
        const deviceId = primaryEvent ? primaryEvent.deviceId : Number(this.deviceId);
        const commandId = primaryEvent ? primaryEvent.commandId : Number(this.commandId);
        if (!commandId || !deviceId) {
          this.error = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
          return;
        }
        this.host._commitEditBundleEdit(upsertActivityButtonBinding(next, activityId, {
          buttonId,
          deviceId,
          commandId,
          longPress,
        }));
        this.close();
        if (macroToOpen) this.host._steps.openEditor("activity", activityId, macroToOpen.buttonId, macroToOpen.name);
        return;
      }
      // "action"
      const resolved = this.resolveMacroTarget(
        next,
        activityId,
        this.macroMode,
        this.macroId,
        this.actionName,
        this.macroSourceId,
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
      if (macroToOpen) this.host._steps.openEditor("activity", activityId, macroToOpen.buttonId, macroToOpen.name);
    } else {
      const commandId = Number(this.commandId);
      if (!commandId) {
        this.error = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return;
      }
      const longPressCommandId = this.longPressEnabled && this.lpCommandId
        ? Number(this.lpCommandId)
        : null;
      this.host._commitEditBundleEdit(upsertDeviceButtonBinding(bundle, entityId, {
        buttonId,
        commandId,
        longPressCommandId,
      }));
      this.close();
    }
  }

  /** The open picker (one at a time, macro or Wifi Event): its trigger id and the list's fixed position. */
  macroPicker: { id: string; style: string; root: ParentNode } | null = null;

  private toggleMacroPicker(id: string, event: Event) {
    const trigger = event.currentTarget as HTMLElement;
    const root = trigger.getRootNode() as ParentNode;
    if (this.macroPicker?.id === id) {
      this.macroPicker = null;
    } else {
      this.macroPicker = { id, style: anchoredListPosition(trigger, trigger.closest<HTMLElement>(".modal-backdrop")), root };
      requestAnimationFrame(() => (
        root.querySelector<HTMLElement>('.macro-picker-option[aria-selected="true"]')
        ?? root.querySelector<HTMLElement>(".macro-picker-option")
      )?.focus());
    }
    this.host.requestUpdate();
  }

  closeMacroPicker = () => {
    const picker = this.macroPicker;
    if (!picker) return;
    this.macroPicker = null;
    this.host.requestUpdate();
    picker.root.querySelector<HTMLElement>(`#${picker.id}`)?.focus();
  };

  /**
   * A select-like picker with its own list, for the targets that can also be
   * created on the spot (a macro, a Wifi Event): the "create new" row on top,
   * then the choices in groups, a row optionally with an icon and a chip. A
   * custom list, since a native select cannot show those. One is open at a
   * time (`macroPicker`).
   */
  renderPicker(params: {
    id: string;
    label: string;
    value: string;
    current: { label: string; icon?: string; chip?: string };
    /** The "create new" row; null when the dialog may not create here. */
    newLabel: string | null;
    groups: Array<{ heading?: string; options: Array<{ value: string; label: string; icon?: string; chip?: string }> }>;
    helper?: string;
    onPick: (value: string) => void;
  }) {
    const open = this.macroPicker?.id === params.id;
    const groups = params.groups.filter((group) => group.options.length > 0);
    const option = (optionValue: string, extraClass: string, body: unknown) => html`
      <button
        class="macro-picker-option ${extraClass}"
        type="button"
        role="option"
        data-value=${optionValue}
        aria-selected=${optionValue === params.value ? "true" : "false"}
        @click=${() => { this.closeMacroPicker(); params.onPick(optionValue); }}
      >${body}</button>
    `;
    // Keys are handled on the field, so they work from the trigger and from the list.
    const onKeydown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        this.closeMacroPicker();
        return;
      }
      moveListFocus(event, ".macro-picker-option");
    };
    return html`
      <div class="decoded-field" @keydown=${onKeydown}>
        <span class="decoded-field-label" id=${`${params.id}-label`}>${params.label}</span>
        <button
          id=${params.id}
          class="decoded-field-input macro-picker-trigger"
          type="button"
          data-value=${params.value}
          aria-haspopup="listbox"
          aria-expanded=${open ? "true" : "false"}
          aria-labelledby=${`${params.id}-label ${params.id}`}
          @click=${(event: Event) => this.toggleMacroPicker(params.id, event)}
        >
          ${params.current.icon ? html`<ha-icon class="macro-picker-icon" icon=${params.current.icon}></ha-icon>` : nothing}
          <span class="macro-picker-name">${params.current.label}</span>
          ${params.current.chip ? html`<span class="macro-picker-chip">${params.current.chip}</span>` : nothing}
          <ha-icon class="macro-picker-icon" icon="mdi:chevron-down"></ha-icon>
        </button>
        ${open
          ? html`
              <button
                class="macro-picker-backdrop"
                type="button"
                tabindex="-1"
                aria-hidden="true"
                @click=${this.closeMacroPicker}
                @wheel=${(event: Event) => event.preventDefault()}
              ></button>
              <div
                class="macro-picker-menu"
                role="listbox"
                aria-labelledby=${`${params.id}-label`}
                style=${this.macroPicker?.style ?? ""}
              >
                ${params.newLabel
                  ? html`
                      ${option("__new__", "macro-picker-option--new", html`
                        <ha-icon class="macro-picker-icon" icon="mdi:plus"></ha-icon>
                        <span class="macro-picker-name">${params.newLabel}</span>
                      `)}
                      ${groups.length ? html`<div class="macro-picker-sep"></div>` : nothing}
                    `
                  : nothing}
                ${groups.map((group) => html`
                  ${group.heading ? html`<div class="macro-picker-group">${group.heading}</div>` : nothing}
                  ${group.options.map((item) => option(item.value, "", html`
                    ${item.icon ? html`<ha-icon class="macro-picker-icon" icon=${item.icon}></ha-icon>` : nothing}
                    <span class="macro-picker-name">${item.label}</span>
                    ${item.chip ? html`<span class="macro-picker-chip">${item.chip}</span>` : nothing}
                  `))}
                `)}
              </div>
            `
          : nothing}
        ${params.helper ? html`<div class="decoded-field-helper">${params.helper}</div>` : nothing}
      </div>
    `;
  }

  /** The macro picker: "Create new macro" on top, the activity's own macros,
   *  then the other activities' macros to copy, each row with a chip naming
   *  its activity. */
  renderMacroSelect(params: {
    id: string;
    mode: MacroTargetMode;
    macroId: number | null;
    sourceId: number | null;
    own: Array<{ value: number; label: string }>;
    allowNew: boolean;
    onPick: (value: string) => void;
  }) {
    const S = TOOLS_CARD_STRINGS.backup;
    const copyable = this.host._copyableMacros();
    const copied = params.mode === "copy"
      ? copyable.find((macro) => macro.activityId === params.sourceId && macro.buttonId === params.macroId)
      : undefined;
    const copyIcon = "mdi:content-copy";
    return this.renderPicker({
      id: params.id,
      label: S.macroTargetLabel,
      value: copied
        ? macroCopyValue(copied.activityId, copied.buttonId)
        : params.mode === "new" ? "__new__" : String(params.macroId ?? ""),
      current: copied
        ? { label: copied.name, icon: copyIcon, chip: copied.activityName }
        : {
            label: params.mode === "new"
              ? S.macroTargetCreateNew
              : params.own.find((macro) => macro.value === params.macroId)?.label ?? "",
          },
      newLabel: params.allowNew ? S.macroTargetCreateNew : null,
      groups: [
        {
          heading: copyable.length ? S.macroTargetOwnGroup : undefined,
          options: params.own.map((macro) => ({ value: String(macro.value), label: macro.label })),
        },
        {
          heading: S.macroTargetCopyGroup,
          options: copyable.map((macro) => ({
            value: macroCopyValue(macro.activityId, macro.buttonId),
            label: macro.name,
            icon: copyIcon,
            chip: macro.activityName,
          })),
        },
      ],
      helper: copied ? S.macroTargetCopyNote(copied.commandStepCount, copied.activityName) : undefined,
      onPick: params.onPick,
    });
  }

  renderMacroTargetFields(params: {
    idPrefix: string;
    mode: MacroTargetMode;
    macroId: number | null;
    sourceId: number | null;
    name: string;
    onMacroChange: (value: string) => void;
    onNameInput: (event: Event) => void;
    /** False when the other leg already creates something new. */
    allowNew: boolean;
  }) {
    const S = TOOLS_CARD_STRINGS.backup;
    const macros = this.host._macroOptions();
    return html`
      ${macros.length || this.host._copyableMacros().length
        ? html`
            ${this.renderMacroSelect({
              id: `${params.idPrefix}-macro-target`,
              mode: params.mode,
              macroId: params.macroId,
              sourceId: params.sourceId,
              own: macros,
              allowNew: params.allowNew,
              onPick: params.onMacroChange,
            })}
            ${params.allowNew ? nothing : html`<div class="decoded-field-helper">${S.bindingOneNewNote}</div>`}
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
    const primaryNew = this.primaryCreatesNew();
    const longPressNew = this.longPressCreatesNew();
    const canSave = this.buttonId != null && (
      scope === "device"
        ? this.commandId != null
        : targetKind === "command"
          ? this.deviceId != null && this.commandId != null
          : targetKind === "wifi_event"
            ? wifiSelReady(this.host._events.primary)
            : true
    ) && !(
      isActivity && this.longPressEnabled && lpTargetKind === "wifi_event"
      && !wifiSelReady(this.host._events.longPress)
    ) && !(primaryNew && longPressNew);
    const title = isEdit
      ? S.bindingDialogEditTitle(buttonName(Number(this.buttonId)))
      : S.bindingDialogAddTitle;
    const kindLabel = (kind: ActivityBindingTargetKind) =>
      kind === "action" ? S.shortcutKindAction : kind === "wifi_event" ? S.shortcutKindWifiEvent : S.shortcutKindCommand;
    // Device and command are one thought: side by side (an activity leg only; a device leg has the command alone).
    const commandFields = html`
      <div class=${scope === "activity" ? "field-pair" : ""}>
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
      </div>
    `;
    const actionFields = this.renderMacroTargetFields({
      idPrefix: "sb-binding",
      mode: this.macroMode,
      macroId: this.macroId,
      sourceId: this.macroSourceId,
      name: this.actionName,
      onMacroChange: this.handleMacroTargetChange,
      onNameInput: this.handleActionNameInput,
      allowNew: !longPressNew,
    });
    const lpCommandFields = html`
      <div class=${scope === "activity" ? "field-pair" : ""}>
        ${scope === "activity"
          ? this.host._renderBindingSelect({
              id: "sb-binding-lp-device",
              label: S.bindingTargetDevice,
              value: this.lpDeviceId,
              options: commandDeviceOptions,
              onChange: this.handleLpDeviceChange,
              emptyText: S.bindingNoDevices,
            })
          : nothing}
        ${this.host._renderBindingSelect({
          id: "sb-binding-lp-command",
          label: S.bindingCommand,
          value: this.lpCommandId,
          options: lpCommandOptions,
          onChange: this.handleLpCommandChange,
          emptyText: S.bindingNoCommands,
        })}
      </div>
    `;
    const lpActionFields = this.renderMacroTargetFields({
      idPrefix: "sb-binding-lp",
      mode: this.lpMacroMode,
      macroId: this.lpMacroId,
      sourceId: this.lpMacroSourceId,
      name: this.lpActionName,
      onMacroChange: this.handleLpMacroTargetChange,
      onNameInput: this.handleLpActionNameInput,
      allowNew: !primaryNew,
    });
    const kindSegments = (id: string, value: ActivityBindingTargetKind, kinds: ActivityBindingTargetKind[], onChange: (event: Event) => void) =>
      isActivity
        ? renderKindSegments({ id, ariaLabel: S.addShortcutKindLabel, value, options: kinds.map((kind) => ({ value: kind, label: kindLabel(kind) })), onChange })
        : nothing;
    return html`
      <div class="modal-backdrop" @click=${this.close}>
        <div class="dialog small" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header ${isEdit ? "" : "dialog-header--extra"}">
            <div class="dialog-title">${title}</div>
            ${isEdit
              ? nothing
              : html`
                  <div class="dialog-header-extra">
                    <select id="sb-binding-button" class="decoded-field-input dialog-header-select" aria-label=${S.bindingButton} @change=${this.handleButtonChange}>
                      ${unbound.map((entry) => html`
                        <option value=${entry.code} ?selected=${entry.code === this.buttonId}>${entry.name}</option>
                      `)}
                    </select>
                  </div>
                `}
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} @click=${this.close}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <section class="press-card" data-press="short">
              <div class="press-card-head"><ha-icon icon="mdi:gesture-tap"></ha-icon><span class="press-card-title">${S.bindingShortPress}</span></div>
              ${kindSegments("sb-binding-kind", targetKind, this.legKinds(longPressNew), this.handleTargetKindChange)}
              ${targetKind === "command"
                ? commandFields
                : targetKind === "wifi_event"
                  ? this.host._events.renderTargetFields({
                      idPrefix: "sb-binding",
                      allowNew: !longPressNew,
                      sel: this.host._events.primary,
                      onSelChange: (sel) => {
                        this.host._events.primary = sel;
                        this.error = "";
                      },
                    })
                  : actionFields}
            </section>
            <section class="press-card" data-press="long">
              <div class="press-card-head">
                <ha-icon icon="mdi:gesture-tap-hold"></ha-icon><span class="press-card-title">${S.bindingLongPress}</span>
                <ha-switch
                  aria-label=${S.bindingEnableLongPress}
                  .checked=${this.longPressEnabled}
                  @change=${this.handleLongPressToggle}
                ></ha-switch>
              </div>
              ${this.longPressEnabled
                ? html`
                    ${kindSegments("sb-binding-lp-kind", lpTargetKind, this.legKinds(primaryNew), this.handleLpTargetKindChange)}
                    ${lpTargetKind === "command"
                      ? lpCommandFields
                      : lpTargetKind === "wifi_event"
                        ? this.host._events.renderTargetFields({
                            idPrefix: "sb-binding-lp",
                            allowNew: !primaryNew,
                            sel: this.host._events.longPress,
                            onSelChange: (sel) => {
                              this.host._events.longPress = sel;
                              this.error = "";
                            },
                          })
                        : lpActionFields}
                  `
                : nothing}
            </section>
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
