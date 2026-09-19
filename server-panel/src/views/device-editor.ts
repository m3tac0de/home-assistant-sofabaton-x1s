// The device editor (docs/internal/server-panel-device-editor-plan.md): the
// HA control panel card's live "Edit device" screen recreated on the
// snapshot document, with the card's containers, class names, section
// order, dialogs and wording (state plan decision 12: mirror, do not share
// the templates). The card's pure bundle helpers are imported from the
// card's tree (plan Q3). The working document is the snapshot with this
// device's element edited; dirty is JSON inequality of that element; the
// element lives in the store's draft slot so a reload keeps it; Sync is
// one `PUT /devices/{id}` with `If-Match`, followed as a job while the
// shell's scrim and dock narrate it (plan decision 4).
//
// Phase status: DE1 + DE2 built (frame, guards, rename, power control, IP,
// command rename and delete, button assignments, delete device, Sync with
// the rebase and the stale / failed states); DE3 built (the power-sequence
// step editor sub-view: steps with their attached wait, add / edit / delete,
// and drag-and-drop reordering on pointer events in place of the card's
// ha-sortable, with the arrow keys on the handle); DE4 built (the payload
// dialog in views/payload-dialog.ts: the braces fetch a command's payload
// from the hub and edit it, Add command with the card's per-class seeding,
// Test through POST /play). No learn mode (Marcel, 2026-09-18).

import { html, nothing, type PropertyDeclarations, type TemplateResult } from "lit";
import {
  mdiArrowLeft,
  mdiCheck,
  mdiChevronDown,
  mdiChevronRight,
  mdiClose,
  mdiCodeBraces,
  mdiDragVerticalVariant,
  mdiFormatListBulleted,
  mdiFormatListNumbered,
  mdiGestureTapButton,
  mdiInformationOutline,
  mdiLanConnect,
  mdiLinkVariant,
  mdiLoading,
  mdiPencil,
  mdiPlus,
  mdiPower,
  mdiPowerPlugOutline,
  mdiStarOutline,
  mdiTrashCanOutline,
  mdiWifiCog,
} from "@mdi/js";

import type { BackupBundleDevicePayload, BackupBundlePayload } from "../../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import {
  IDLE_BEHAVIOR_ALWAYS_ON,
  IDLE_BEHAVIOR_AUTO_OFF,
  IDLE_BEHAVIOR_DISABLED,
  IDLE_BEHAVIOR_STAY_ON,
  applyBundleDelete,
  backupDeleteHasCascade,
  bundleDeleteImpact,
  bundleDeviceBrand,
  bundleDeviceClass,
  buttonName,
  deviceButtonBindingItems,
  deviceCommandItems,
  deviceIdleBehavior,
  deviceIpAddress,
  deviceMacroStepItems,
  addDeviceMacroCommandStep,
  removeDeviceMacroStep,
  reorderDeviceMacroSteps,
  setDeviceMacroStepWait,
  updateDeviceMacroStep,
  addBundleDeviceCommand,
  defaultDecodedSnapshotForClass,
  nextFreeDeviceCommandId,
  normalizeCommandPayloadHex,
  setCommandRestoreData,
  DECODED_CLASS_FORM_SPECS,
  type BackupCommandDecodedBlock,
  type BackupMacroStepItem,
  isManagedWifiBrand,
  isWifiEventsBrand,
  renameBundleDevice,
  renameBundleDeviceCommand,
  unboundButtonsForDevice,
  updateBundleDeviceIdleBehavior,
  updateBundleDeviceIp,
  upsertDeviceButtonBinding,
  type BackupDeleteTarget,
} from "../../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";
import { problemText, type ApiResponse, type JobView, type PayloadView, type SnapshotEntity } from "../panel-api";
import { PANEL_BASE_CSS } from "../panel-styles";
import { EDITOR_CSS } from "./editor-styles";
import { SbPanelEntityEditor, icon, type EntityFrameStrings } from "./entity-editor-base";
import type { EntityElement } from "./entity-editor-state";
import { PointerReorder } from "../pointer-reorder";
import type { PayloadSaveDetail } from "./payload-dialog";
import {
  IP_HEAD_DEVICE_CLASSES,
  IPV4_PATTERN,
  isLongRecord,
  sanitizeName,
  wifiEventsSlotCount,
} from "./device-editor-state";

export const DEVICE_EDITOR_TAG = "sb-panel-device-editor";

// -- the card's strings, verbatim ------------------------------------------------------------

const S = {
  crumbDevices: "Devices",
  renameDevice: "Rename device",
  deleteDeviceAria: "Delete device",
  syncToHub: "Sync to Hub",
  syncUpToDate: "Up to date",
  detailPower: "On/Off",
  detailNetwork: "Network",
  detailCommands: "Commands",
  detailButtons: "Buttons",
  detailSectionsAria: "Detail sections",
  powerSetupTitle: "Power control",
  powerSetupDeviceSub: "How the hub switches this device on and off during activities, and the commands it sends to do it.",
  powerOnLabel: "Power-on sequence",
  powerOffLabel: "Power-off sequence",
  macroStepsCount: (count: number) => `${count} step${count === 1 ? "" : "s"}`,
  powerControlTitle: "Automatic power control",
  powerControlUnset: "Not captured",
  powerControlUnsetSub: "This backup predates power-control capture. Pick an option to set it, or restore as-is to keep the legacy value.",
  powerControlDisabled: "Don't control power",
  powerControlDisabledSub: "The hub never switches this device on or off. The sequences below are ignored.",
  powerControlAutoOff: "Turn off when idle",
  powerControlAutoOffSub: "Recommended. Powers the device off when no activity needs it.",
  powerControlStayOn: "Stay on between activities",
  powerControlStayOnSub: "Skips the wait to power back on; still turns off with the remote's Off button.",
  powerControlAlwaysOn: "Always stay on",
  powerControlAlwaysOnSub: "The hub powers it on but never switches it off automatically.",
  powerSequencesDisabledNote: "Power control is off, so these sequences aren't used. Switch it on above to edit them.",
  networkDescription: "The device's IP address lives in the device record. The hub uses it to address the device at replay time (Host header for Hue / Sonos, base URL for Roku).",
  hubNameNotSet: "(not set)",
  ipChip: "ip",
  ipv4Description: "IPv4 dotted-decimal address",
  editIpAria: "Edit IP address",
  ipAddress: "IP address",
  commandsLiveHelp: "Use the pencil to rename a command and the braces to fetch its payload from the hub and edit it. Deleting commands stays in Backup → Edit.",
  addCommand: "Add command",
  noDeviceCommands: "This device does not currently have any commands.",
  commandChip: "command",
  newCommandChip: "new command",
  commandId: "Command ID",
  renameCommandAria: "Rename command",
  renameCommand: "Rename command",
  editPayloadAria: "Edit payload",
  fetchEditCommandAria: "Fetch and edit this command's payload",
  deleteCommandAria: "Delete command",
  buttonBindingsTitle: "Button assignments",
  buttonBindingsDeviceSub: "Assign remote buttons to this device's own commands.",
  buttonBindingsEmpty: "No button assignments configured.",
  addBinding: "Add assignment",
  buttonChip: "button",
  bindingLongPressMeta: (label: string) => `Long press · ${label}`,
  editBindingAria: "Edit assignment",
  deleteBindingAria: "Delete assignment",
  bindingButton: "Button",
  bindingCommand: "Command",
  bindingEnableLongPress: "Enable long-press assignment",
  bindingLongPressCommand: "Long-press command",
  bindingIncomplete: "Choose a button and target first.",
  bindingNoButtons: "Every button on this hub model is already assigned.",
  bindingNoCommands: "This device has no commands to assign.",
  bindingAdd: "Add",
  bindingSave: "Save",
  bindingCancel: "Cancel",
  bindingDialogAddTitle: "Add button assignment",
  bindingDialogEditTitle: (name: string) => `Edit ${name} assignment`,
  deleteBindingTitle: (name: string) => `Delete ${name} assignment?`,
  deleteDeviceTitle: (name: string) => `Delete device "${name}"?`,
  deleteCommandTitle: (name: string) => `Delete command "${name}"?`,
  deleteCascadeIntroLive: "Deleting this also removes its references on the hub:",
  deleteSimpleBodyLive: "This removes it.",
  deleteImmediateNote: "This is applied to the hub immediately.",
  deleteSyncNote: "This change is written to the hub on the next Sync.",
  deleteImpactActivities: (count: number) => `${count} ${count === 1 ? "activity references" : "activities reference"} it`,
  deleteImpactFavorites: (count: number) => `${count} shortcut${count === 1 ? "" : "s"} will be removed`,
  deleteImpactMacroSteps: (count: number) => `${count} sequence step${count === 1 ? "" : "s"} will be removed`,
  deleteImpactPowerSteps: (count: number) => `${count} power sequence step${count === 1 ? "" : "s"} will be cleared`,
  deleteImpactBindings: (count: number) => `${count} button assignment${count === 1 ? "" : "s"} will be cleared`,
  deleteCancel: "Cancel",
  deleteConfirm: "Delete",
  thisItem: "this item",
  name: "Name",
  enterName: "Enter a name to continue.",
  ipv4Required: "Enter a dotted-decimal IPv4 address (e.g. 192.168.1.42), or clear the field to remove the IP.",
  cancel: "Cancel",
  save: "Save",
  // The live host's screens.
  loading: "Loading device from the hub cache…",
  refreshEntity: "Refresh device",
  missingTitle: "Device not found",
  missingBody: "This device is not in the hub's snapshot.",
  firmwareUnsupportedTitle: "Hub firmware update required",
  firmwareUnsupportedBody: (installed: string | number, required: string | number) =>
    `This hub is running firmware version ${installed}. Version ${required} or newer is required to edit the hub configuration safely. Editing is disabled to protect your configuration. Update the hub using the Sofabaton app. Editing becomes available automatically after the hub reports the updated firmware version.`,
  needsRefreshTitle: "Refresh the hub cache to edit",
  needsRefreshBody: "This device isn't in the local hub cache yet. Refresh the hub cache to load it into the editor. This may take a few minutes, depending on the size of your hub configuration.",
  refreshDevice: "Refresh device",
  back: "Back",
  syncFailedTitle: "Sync didn't finish",
  syncStaleTitle: "This device changed on the hub",
  syncStaleBody: "The device was edited on the hub since you loaded it, so your changes can't be safely applied. Reload the hub's current version to continue — your unsaved edits will be discarded.",
  syncRetry: "Retry sync",
  syncReload: "Reload from hub",
  syncKeepEditing: "Keep editing",
  exitUnsyncedTitle: "Unsynced changes",
  exitUnsyncedBody: "This device has changes that have not been synced to the hub. Sync them now, or leave without syncing and discard the local edit.",
  exitSyncNow: "Sync now",
  exitWithoutSync: "Leave without syncing",
  // The step editor (the card's macro step editor, device scope).
  steps: "Steps",
  macroStepsSortableHelp: "Drag to reorder. Each step plays a command; set the following wait below the step.",
  noMacroSteps: "No steps yet.",
  addStep: "Add step",
  stepDialogAddTitle: "Add step",
  stepDialogEditTitle: "Edit step",
  stepCommand: "Command",
  stepHoldSeconds: "Hold (seconds, 0 = short press)",
  holdLabel: (seconds: string) => `Hold ${seconds}s`,
  stepAdd: "Add",
  stepSave: "Save",
  stepCancel: "Cancel",
  stepNoCommands: "This device has no commands.",
  stepWaitAria: "Wait after this step (seconds)",
  stepWaitLabel: "Delay",
  stepWaitUnit: "s",
  deleteStepAria: "Delete step",
  editStepAria: "Edit step",
  dragStepAria: "Drag to reorder (arrow keys move the step)",
  stepChipCommand: "command",
  // The panel's own lines (plan decisions 11 and 12).
  managedWifiWarning: "This device is managed by Home Assistant's Wifi Commands. Changes made here are written to the hub, and that configuration will disagree with the hub after a sync.",
  callbackDeviceNote: "This is the server's callback device (its Wifi Events). Button assignments can be edited here; renaming it or its events lands with the next phase.",
  deviceMissing: "This device is not in the hub's snapshot.",
  noPayloadReturned: "The hub returned no payload for this command.",
  noFreeCommandSlot: "This device has no free command slot left.",
};

type SectionId = "power" | "network" | "commands" | "bindings";

type RenameTarget =
  | { kind: "device" }
  | { kind: "command"; commandId: number }
  | { kind: "device_ip" };

interface BindingDialogState {
  editButtonId: number | null;
  buttonId: number | null;
  commandId: number | null;
  longPress: boolean;
  longPressCommandId: number | null;
  error: string;
}

export class SbPanelDeviceEditor extends SbPanelEntityEditor {
  static properties: PropertyDeclarations = {
    deviceId: { attribute: false },
    _activeSection: { state: true },
    _powerMenuOpen: { state: true },
    _rename: { state: true },
    _deleteConfirm: { state: true },
    _binding: { state: true },
    _stepEditor: { state: true },
    _stepDialog: { state: true },
    _payloadDialog: { state: true },
    _payloadFetching: { state: true },
    _addCommandPreparing: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    EDITOR_CSS,
  ];

  deviceId: number | null = null;

  protected readonly entityKind = "device" as const;
  protected get entityId(): number | null {
    return this.deviceId;
  }

  private _activeSection: SectionId = "power";
  private _powerMenuOpen = false;
  private _rename: { target: RenameTarget; draft: string; error: string } | null = null;
  private _deleteConfirm: { target: BackupDeleteTarget; label: string } | null = null;
  private _binding: BindingDialogState | null = null;
  /** The open power sequence (the card's macro editor sub-view, device scope). */
  private _stepEditor: { buttonId: number; name: string } | null = null;
  private _stepDialog: { editIndex: number | null; commandId: number | null; hold: string; error: string } | null = null;
  /** A step drag in flight: the row picked up, the slot it hovers, the pointer's travel and the row's height. */
  private _sorter = new PointerReorder(
    () => Array.from(this.renderRoot.querySelectorAll<HTMLElement>("[data-step-index]")),
    () => this.requestUpdate(),
    (from, to) => this._moveStep(from, to - from),
    () => this._stickyOffset(),
  );
  private get _drag() { return this._sorter.state; }
  /** The payload dialog's inputs (the card's add / edit modes), or null when closed. */
  private _payloadDialog: { mode: "add" | "edit"; commandId: number; snapshot: BackupCommandDecodedBlock | null; rawHex: string; fetchedHex: string } | null = null;
  private _payloadFetching: number | null = null;
  private _addCommandPreparing = false;
  private _sectionScrollPending = false;
  private _sectionScrollTimer: number | null = null;
  private readonly _onWindowScroll = () => {
    if (this._sectionScrollPending) this._settleSectionScroll();
    else this._trackSection();
  };
  private readonly _onManualScroll = () => {
    if (!this._sectionScrollPending) return;
    this._clearSectionScroll();
    window.scrollTo({ top: window.scrollY, behavior: "instant" });
    this._trackSection();
  };
  private readonly _onScrollKey = (event: KeyboardEvent) => {
    const target = event.composedPath()[0];
    if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable ||
      (event.key === " " && target.matches("button, a[href]")))) return;
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) this._onManualScroll();
  };

  // -- lifecycle ---------------------------------------------------------------------------------

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("scroll", this._onWindowScroll, { passive: true });
    window.addEventListener("wheel", this._onManualScroll, { passive: true });
    window.addEventListener("touchstart", this._onManualScroll, { passive: true });
    window.addEventListener("keydown", this._onScrollKey);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._sorter.cancel();
    window.removeEventListener("scroll", this._onWindowScroll);
    window.removeEventListener("wheel", this._onManualScroll);
    window.removeEventListener("touchstart", this._onManualScroll);
    window.removeEventListener("keydown", this._onScrollKey);
    this._clearSectionScroll();
  }

  protected _resetView(): void {
    this._clearSectionScroll();
    this._powerMenuOpen = false;
    this._rename = null;
    this._deleteConfirm = null;
    this._binding = null;
    this._stepEditor = null;
    this._stepDialog = null;
    this._sorter.cancel();
    this._payloadDialog = null;
    this._payloadFetching = null;
    this._addCommandPreparing = false;
    this._activeSection = "power";
  }

  // -- the working copy --------------------------------------------------------------------------

  private get _workingElement(): BackupBundleDevicePayload | null {
    return this._workingEntity as BackupBundleDevicePayload | null;
  }

  protected get frameStrings(): EntityFrameStrings {
    return S;
  }

  protected _startSync(hubId: string, deviceId: number, element: EntityElement): Promise<ApiResponse<JobView>> {
    return this.api.editDevice(hubId, deviceId, element as unknown as SnapshotEntity, this._snapshot!.snapshot_id);
  }

  protected _startDelete(hubId: string, deviceId: number): Promise<ApiResponse<JobView>> {
    return this.api.removeDevice(hubId, deviceId);
  }

  protected _renderEditing(): TemplateResult {
    return this._stepEditor ? this._renderStepEditor(this._stepEditor) : this._renderEditor();
  }

  // -- the payload dialog (the card's add / edit payload, live mode) ------------------------------

  private get _deviceClass(): string {
    return this.deviceId != null ? bundleDeviceClass(this._working, this.deviceId) ?? "" : "";
  }

  /** The card's `_decodedSnapshotFromFetch`: the server's decoded block becomes the form's pristine block. */
  private _snapshotFromPayload(payload: PayloadView): BackupCommandDecodedBlock | null {
    const decoded = payload.decoded;
    if (!decoded) return null;
    const className = String(decoded.class ?? "").trim().toLowerCase();
    if (!(className in DECODED_CLASS_FORM_SPECS)) return null;
    return { className: className as BackupCommandDecodedBlock["className"], fields: { ...decoded.fields }, trailerHex: String(decoded.trailer_hex ?? ""), edited: false };
  }

  /** The braces: fetch the command's payload from the hub, then open the dialog on it. */
  private async _fetchAndEditPayload(commandId: number): Promise<void> {
    const hubId = this._hub?.hub_id;
    const deviceId = this.deviceId;
    if (!hubId || deviceId == null || this._payloadFetching != null) return;
    this._payloadFetching = commandId;
    try {
      const response = await this.api.commandPayload(hubId, deviceId, commandId);
      if (!response.ok || !response.body) {
        this._dockError(response.status === 404 && (response.body as { type?: string } | null)?.type === "payload_not_found" ? S.noPayloadReturned : problemText(response));
        return;
      }
      const payload = response.body;
      const hex = String(payload.hex ?? "").trim();
      if (!hex) {
        this._dockError(S.noPayloadReturned);
        return;
      }
      const snapshot = this._snapshotFromPayload(payload);
      this._payloadDialog = { mode: "edit", commandId, snapshot, rawHex: snapshot ? "" : normalizeCommandPayloadHex(hex) ?? hex, fetchedHex: hex };
    } catch (err) {
      this._dockError(err instanceof Error ? err.message : String(err));
    } finally {
      this._payloadFetching = null;
    }
  }

  /** Add command: the card's per-class seeding (an empty hex form or descriptor on IR, the first command as a template on a wifi class, neutral defaults on an empty one, raw hex otherwise). */
  private async _openAddCommand(): Promise<void> {
    const hubId = this._hub?.hub_id;
    const deviceId = this.deviceId;
    if (!hubId || deviceId == null || !this._working || this._addCommandPreparing) return;
    const deviceClass = this._deviceClass.toLowerCase();
    const open = (snapshot: BackupCommandDecodedBlock | null) => {
      this._payloadDialog = { mode: "add", commandId: 0, snapshot, rawHex: "", fetchedHex: "" };
    };
    if (deviceClass === "ir") {
      const x2 = String(this._hubVersion ?? "").toUpperCase().includes("X2");
      open(x2 ? { className: "ir", fields: { descriptor: "" }, trailerHex: "", edited: false } : null);
      return;
    }
    const existing = deviceCommandItems(this._working, deviceId);
    if (!existing.length) {
      open(defaultDecodedSnapshotForClass(deviceClass, { deviceId, commandId: nextFreeDeviceCommandId(this._working, deviceId) }));
      return;
    }
    if (deviceClass in DECODED_CLASS_FORM_SPECS) {
      this._addCommandPreparing = true;
      try {
        const response = await this.api.commandPayload(hubId, deviceId, existing[0].commandId);
        if (!response.ok || !response.body) {
          this._dockError(problemText(response));
          return;
        }
        open(this._snapshotFromPayload(response.body));
      } catch (err) {
        this._dockError(err instanceof Error ? err.message : String(err));
      } finally {
        this._addCommandPreparing = false;
      }
      return;
    }
    open(null);
  }

  private _closePayloadDialog = (): void => {
    this._payloadDialog = null;
  };

  /** Save from the dialog: an edit marks the row (`edited`), an add appends a row at the next free id (`new`). */
  private _applyPayloadSave(event: CustomEvent<PayloadSaveDetail>): void {
    const dialog = this._payloadDialog;
    const deviceId = this.deviceId;
    if (!dialog || deviceId == null || !this._working) return;
    const { name, restoreData } = event.detail;
    if (dialog.mode === "edit") {
      this._commit(setCommandRestoreData(this._working, deviceId, dialog.commandId, restoreData));
      this._payloadDialog = null;
      return;
    }
    let data = restoreData;
    const newId = nextFreeDeviceCommandId(this._working, deviceId);
    if (newId == null) {
      this._dockError(S.noFreeCommandSlot);
      this._payloadDialog = null;
      return;
    }
    const decoded = data.decoded as { class?: string; fields?: Record<string, unknown> } | undefined;
    if (decoded?.class === "wifi_mqtt" && decoded.fields) {
      data = { ...data, decoded: { ...decoded, fields: { ...decoded.fields, device_id: deviceId & 0xff, command_id: newId & 0xff } } };
    }
    this._commit(addBundleDeviceCommand(this._working, deviceId, newId, name, data));
    this._payloadDialog = null;
  }

  // -- the step editor sub-view (the card's macro editor, device scope) -------------------------

  private _openStepEditor(buttonId: number, name: string): void {
    this._clearSectionScroll();
    this._stepEditor = { buttonId, name };
    this._stepDialog = null;
    window.scrollTo({ top: 0 });
  }

  private _closeStepEditor = (): void => {
    this._stepEditor = null;
    this._stepDialog = null;
  };

  /** Macro time bytes are in 0.5 s units (a byte of 4 = 2.0 s); 0 = a click / no wait. */
  private _byteToSeconds(byteValue: number): string {
    return (Number(byteValue) * 0.5).toFixed(1).replace(/\.0$/, "");
  }

  private _secondsToByte(value: string): number {
    const seconds = parseFloat(String(value));
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.min(255, Math.max(0, Math.round(seconds * 2)));
  }

  private _stepItems(): BackupMacroStepItem[] {
    const editor = this._stepEditor;
    if (!editor || !this._working || this.deviceId == null) return [];
    return deviceMacroStepItems(this._working, this.deviceId, editor.buttonId);
  }

  private _openAddStep = (): void => {
    if (!this._working || this.deviceId == null) return;
    const commands = deviceCommandItems(this._working, this.deviceId);
    this._stepDialog = { editIndex: null, commandId: commands[0]?.commandId ?? null, hold: "0", error: "" };
  };

  private _openEditStep(item: BackupMacroStepItem): void {
    this._stepDialog = { editIndex: item.index, commandId: item.commandId, hold: this._byteToSeconds(item.hold), error: "" };
  }

  private _closeStepDialog = (): void => {
    this._stepDialog = null;
  };

  private _applyStep = (): void => {
    const dialog = this._stepDialog;
    const editor = this._stepEditor;
    const deviceId = this.deviceId;
    if (!dialog || !editor || deviceId == null || !this._working) return;
    const commandId = Number(dialog.commandId);
    if (!commandId) {
      this._stepDialog = { ...dialog, error: S.stepNoCommands };
      return;
    }
    const hold = this._secondsToByte(dialog.hold);
    const next = dialog.editIndex === null
      ? addDeviceMacroCommandStep(this._working, deviceId, editor.buttonId, commandId, hold)
      : updateDeviceMacroStep(this._working, deviceId, editor.buttonId, dialog.editIndex, { commandId, hold });
    this._commit(next);
    this._stepDialog = null;
  };

  private _removeStep(index: number): void {
    const editor = this._stepEditor;
    if (!editor || this.deviceId == null || !this._working) return;
    this._commit(removeDeviceMacroStep(this._working, this.deviceId, editor.buttonId, index));
  }

  /** The arrow keys on the drag handle move a step one place (the pointer drags it). */
  private _moveStep(index: number, delta: number): void {
    const editor = this._stepEditor;
    if (!editor || this.deviceId == null || !this._working) return;
    const items = this._stepItems();
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const order = items.map((_, i) => i);
    const [moved] = order.splice(index, 1);
    order.splice(target, 0, moved);
    this._commit(reorderDeviceMacroSteps(this._working, this.deviceId, editor.buttonId, order));
  }

  // -- drag and drop on pointer events (the card uses ha-sortable) ------------------------------

  private _dragStart(event: PointerEvent, index: number): void { this._sorter.start(event, index); }
  private _dragMove(event: PointerEvent): void { this._sorter.move(event); }
  private _dragEnd(event: PointerEvent): void { this._sorter.end(event); }
  private _dragCancel(event: PointerEvent): void { this._sorter.cancel(event); }
  private _dragTransform(index: number): string { return this._sorter.transform(index); }

  private _setStepWait(item: BackupMacroStepItem, event: Event): void {
    const editor = this._stepEditor;
    if (!editor || this.deviceId == null || !this._working) return;
    const input = event.target as HTMLInputElement;
    const wait = this._secondsToByte(input.value);
    // Reflect the snapped 0.5 s value at once: a re-render alone cannot fix a value that rounds to the current byte.
    input.value = this._byteToSeconds(wait);
    this._commit(setDeviceMacroStepWait(this._working, this.deviceId, editor.buttonId, item.index, wait));
  }

  // -- section nav -------------------------------------------------------------------------------------

  private _sectionItems(): Array<{ id: SectionId; icon: string; label: string }> {
    const deviceClass = this.deviceId != null ? bundleDeviceClass(this._working, this.deviceId) ?? "" : "";
    const hasNetwork = IP_HEAD_DEVICE_CLASSES.has(deviceClass);
    return [
      { id: "power", icon: mdiPowerPlugOutline, label: S.detailPower },
      ...(hasNetwork ? [{ id: "network" as const, icon: mdiLanConnect, label: S.detailNetwork }] : []),
      { id: "commands", icon: mdiFormatListBulleted, label: S.detailCommands },
      { id: "bindings", icon: mdiGestureTapButton, label: S.detailButtons },
    ];
  }

  private _scrollToSection(id: SectionId): void {
    const section = this.renderRoot.querySelector<HTMLElement>(`[data-edit-section="${id}"]`);
    if (!section) return;
    const top = window.scrollY + section.getBoundingClientRect().top - this._stickyOffset() - 8;
    this._activeSection = id;
    this._sectionScrollPending = true;
    this._settleSectionScroll();
    window.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  /** Hold the clicked section through intermediate scroll positions. Release
   * after scrolling settles, also when the target was already in view. */
  private _settleSectionScroll(): void {
    if (this._sectionScrollTimer !== null) window.clearTimeout(this._sectionScrollTimer);
    this._sectionScrollTimer = window.setTimeout(() => this._clearSectionScroll(), 160);
  }

  private _clearSectionScroll(): void {
    if (this._sectionScrollTimer !== null) window.clearTimeout(this._sectionScrollTimer);
    this._sectionScrollTimer = null;
    this._sectionScrollPending = false;
  }

  private _trackSection(): void {
    if (this._stage !== "editing") return;
    const sections = Array.from(this.renderRoot.querySelectorAll<HTMLElement>("[data-edit-section]"));
    if (!sections.length) return;
    const atBottom = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
    if (atBottom) {
      const last = sections[sections.length - 1].dataset.editSection as SectionId;
      if (last !== this._activeSection) this._activeSection = last;
      return;
    }
    const marker = this._stickyOffset() + 24;
    let active = sections[0].dataset.editSection as SectionId;
    for (const section of sections) {
      if (section.getBoundingClientRect().top <= marker) active = section.dataset.editSection as SectionId;
    }
    if (active !== this._activeSection) this._activeSection = active;
  }

  // -- classification -----------------------------------------------------------------------------------

  private get _brand(): string {
    return this.deviceId != null ? bundleDeviceBrand(this._working, this.deviceId) : "";
  }

  /** A Wifi Commands device deployed by Home Assistant: editable with a warning (plan decision 11). */
  private get _managedByHa(): boolean {
    return isManagedWifiBrand(this._brand) && !isWifiEventsBrand(this._brand);
  }

  /** The server's callback device: its spec-owned parts wait for DE6 (plan decision 12). */
  private get _isCallbackDevice(): boolean {
    return this._callbackDeviceId != null && this.deviceId === this._callbackDeviceId;
  }

  /** The card's Wifi Events pairing applies to both the HA events device and the server's callback device. */
  private get _pairedRecords(): boolean {
    return isWifiEventsBrand(this._brand) || this._isCallbackDevice;
  }

  private get _title(): string {
    return String(this._workingElement?.device?.name ?? "").trim();
  }

  // -- rename dialog --------------------------------------------------------------------------------------

  private _openRename(target: RenameTarget): void {
    const deviceId = this.deviceId;
    if (deviceId == null || !this._working) return;
    let draft = "";
    if (target.kind === "device") draft = this._title;
    else if (target.kind === "device_ip") draft = deviceIpAddress(this._working, deviceId) || "";
    else draft = deviceCommandItems(this._working, deviceId).find((c) => c.commandId === target.commandId)?.label ?? "";
    this._rename = { target, draft, error: "" };
  }

  private _closeRename = (): void => {
    this._rename = null;
  };

  private _renameInput = (event: Event): void => {
    if (!this._rename) return;
    const input = event.currentTarget as HTMLInputElement;
    if (this._rename.target.kind === "device_ip") {
      this._rename = { ...this._rename, draft: input.value, error: "" };
    } else {
      const value = sanitizeName(this._hubVersion, input.value);
      input.value = value;
      this._rename = { ...this._rename, draft: value, error: "" };
    }
  };

  private _applyRename = (): void => {
    const dialog = this._rename;
    const deviceId = this.deviceId;
    if (!dialog || deviceId == null || !this._working) return;
    if (dialog.target.kind === "device_ip") {
      const draft = dialog.draft.trim();
      if (draft && !IPV4_PATTERN.test(draft)) {
        this._rename = { ...dialog, error: S.ipv4Required };
        return;
      }
      this._commit(updateBundleDeviceIp(this._working, deviceId, draft));
      this._rename = null;
      return;
    }
    const next = sanitizeName(this._hubVersion, dialog.draft);
    if (!next) {
      this._rename = { ...dialog, error: S.enterName };
      return;
    }
    if (dialog.target.kind === "device") this._commit(renameBundleDevice(this._working, deviceId, next));
    else this._commit(renameBundleDeviceCommand(this._working, deviceId, dialog.target.commandId, next));
    this._rename = null;
  };

  // -- delete confirm ---------------------------------------------------------------------------------------

  private _openDeleteConfirm(target: BackupDeleteTarget, label: string): void {
    this._deleteConfirm = { target, label };
  }

  private _closeDeleteConfirm = (): void => {
    this._deleteConfirm = null;
  };

  private _confirmDelete = (): void => {
    const dialog = this._deleteConfirm;
    const deviceId = this.deviceId;
    if (!dialog || deviceId == null || !this._working) return;
    const target = dialog.target;
    if (target.kind === "device") {
      this._deleteConfirm = null;
      void this._deleteEntity();
      return;
    }
    // Live row deletes mirror the hub's cascade but never rewrite activity membership (the card's rule).
    let next = applyBundleDelete(this._working, target, { reconcileMembership: false });
    if (target.kind === "command" && this._pairedRecords) {
      const slots = wifiEventsSlotCount(this._workingElement);
      if (slots > 0 && Number(target.commandId) <= slots) {
        next = applyBundleDelete(next, { kind: "command", deviceId, commandId: Number(target.commandId) + slots }, { reconcileMembership: false });
      }
    }
    this._commit(next);
    this._deleteConfirm = null;
  };

  private _deleteTitle(target: BackupDeleteTarget, label: string): string {
    const name = label || S.thisItem;
    switch (target.kind) {
      case "device":
        return S.deleteDeviceTitle(name);
      case "command":
        return S.deleteCommandTitle(name);
      case "device_binding":
        return S.deleteBindingTitle(name);
      default:
        return name;
    }
  }

  // -- power control ------------------------------------------------------------------------------------------

  private _powerOptions(): Array<{ mode: number; label: string; sub: string }> {
    return [
      { mode: IDLE_BEHAVIOR_DISABLED, label: S.powerControlDisabled, sub: S.powerControlDisabledSub },
      { mode: IDLE_BEHAVIOR_AUTO_OFF, label: S.powerControlAutoOff, sub: S.powerControlAutoOffSub },
      { mode: IDLE_BEHAVIOR_STAY_ON, label: S.powerControlStayOn, sub: S.powerControlStayOnSub },
      { mode: IDLE_BEHAVIOR_ALWAYS_ON, label: S.powerControlAlwaysOn, sub: S.powerControlAlwaysOnSub },
    ];
  }

  private _selectPower(mode: number): void {
    this._powerMenuOpen = false;
    const deviceId = this.deviceId;
    if (deviceId == null || !this._working) return;
    if (deviceIdleBehavior(this._working, deviceId) === mode) return;
    this._commit(updateBundleDeviceIdleBehavior(this._working, deviceId, mode));
  }

  // -- binding dialog -----------------------------------------------------------------------------------------

  private _openAddBinding(): void {
    const deviceId = this.deviceId;
    if (deviceId == null || !this._working) return;
    const unbound = unboundButtonsForDevice(this._working, deviceId);
    if (!unbound.length) return;
    const commands = deviceCommandItems(this._working, deviceId);
    this._binding = { editButtonId: null, buttonId: unbound[0].code, commandId: commands[0]?.commandId ?? null, longPress: false, longPressCommandId: commands[0]?.commandId ?? null, error: "" };
  }

  private _openEditBinding(buttonId: number): void {
    const deviceId = this.deviceId;
    if (deviceId == null || !this._working) return;
    const item = deviceButtonBindingItems(this._working, deviceId).find((entry) => entry.buttonId === Number(buttonId));
    if (!item) return;
    this._binding = { editButtonId: item.buttonId, buttonId: item.buttonId, commandId: item.commandId, longPress: Boolean(item.longPress), longPressCommandId: item.longPress?.commandId ?? null, error: "" };
  }

  private _closeBinding = (): void => {
    this._binding = null;
  };

  private _applyBinding = (): void => {
    const dialog = this._binding;
    const deviceId = this.deviceId;
    if (!dialog || deviceId == null || !this._working) return;
    const buttonId = Number(dialog.buttonId);
    const commandId = Number(dialog.commandId);
    if (!buttonId || !commandId) {
      this._binding = { ...dialog, error: S.bindingIncomplete };
      return;
    }
    const longPressCommandId = dialog.longPress && dialog.longPressCommandId ? Number(dialog.longPressCommandId) : null;
    this._commit(upsertDeviceButtonBinding(this._working, deviceId, { buttonId, commandId, longPressCommandId }));
    this._binding = null;
  };

  // -- render --------------------------------------------------------------------------------------------------

  private _renderStepEditor(editor: { buttonId: number; name: string }): TemplateResult {
    const items = this._stepItems();
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view ${this._drag ? "is-sorting" : ""}" id="step-editor">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" id="step-back" type="button" aria-label=${S.back} @click=${this._closeStepEditor}>${icon(mdiArrowLeft)}</button>
                <div class="detail-title-stack">
                  <div class="detail-crumbs">
                    <button class="detail-crumb" type="button" @click=${this._requestClose}>${S.crumbDevices}</button>
                    <span class="detail-crumb-sep" aria-hidden="true">›</span>
                    <button class="detail-crumb" type="button" @click=${this._closeStepEditor}>${this._title}</button>
                    <span class="detail-crumb-sep" aria-hidden="true">›</span>
                  </div>
                  <div class="detail-title" id="step-title">${editor.name}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="detail-scroll">
            <div class="quick-access-section">
              <div class="quick-access-head">
                <div class="quick-access-head-main"><div class="quick-access-title">${S.steps}</div><div class="quick-access-sub">${S.macroStepsSortableHelp}</div></div>
                <div class="quick-access-head-actions"><button class="quick-access-add-btn" id="step-add" type="button" @click=${this._openAddStep}>${icon(mdiPlus)}<span>${S.addStep}</span></button></div>
              </div>
              ${items.length
                ? html`<div class="quick-access-list"><div class="quick-access-sortable-container">${items.map((item, position) => this._renderStepRow(item, position, items.length))}</div></div>`
                : html`<div class="quick-access-empty">${S.noMacroSteps}</div>`}
            </div>
          </div>
        </div>
        ${this._renderStepDialog()}
        ${this._renderExitConfirmDialog()}
      </div>
    `;
  }

  private _renderStepRow(item: BackupMacroStepItem, position: number, count: number): TemplateResult {
    const meta = item.kind === "command" && item.hold > 0 ? S.holdLabel(this._byteToSeconds(item.hold)) : "";
    const isLast = position === count - 1;
    const drag = this._drag;
    const dragging = drag?.from === position;
    const transform = this._dragTransform(position);
    return html`
      <div class="quick-access-sortable-item ${dragging ? "is-dragging" : drag ? "is-shifting" : ""}" data-step-index=${item.index} style=${transform ? `transform: ${transform}` : ""}>
        <div class="quick-access-row quick-access-row--step">
          <button class="quick-access-drag step-handle" type="button" aria-label=${S.dragStepAria} title=${S.dragStepAria}
            @mousedown=${(event: MouseEvent) => event.preventDefault()}
            @pointerdown=${(event: PointerEvent) => this._dragStart(event, position)}
            @pointermove=${(event: PointerEvent) => this._dragMove(event)}
            @pointerup=${(event: PointerEvent) => this._dragEnd(event)}
            @pointercancel=${(event: PointerEvent) => this._dragCancel(event)}
            @keydown=${(event: KeyboardEvent) => { if (event.key === "ArrowUp") { event.preventDefault(); this._moveStep(item.index, -1); } else if (event.key === "ArrowDown") { event.preventDefault(); this._moveStep(item.index, 1); } }}
          >${icon(mdiDragVerticalVariant)}</button>
          <div class="quick-access-main">
            <div class="quick-access-label-row"><div class="quick-access-label">${item.label}</div><div class="quick-access-chip">${S.stepChipCommand}</div></div>
            ${meta ? html`<div class="quick-access-meta">${meta}</div>` : nothing}
          </div>
          <div class="quick-access-actions">
            <button class="icon-btn step-edit" type="button" aria-label=${S.editStepAria} title=${S.editStepAria} @click=${() => this._openEditStep(item)}>${icon(mdiPencil)}</button>
            <button class="icon-btn icon-btn--danger step-delete" type="button" aria-label=${S.deleteStepAria} title=${S.deleteStepAria} @click=${() => this._removeStep(item.index)}>${icon(mdiTrashCanOutline)}</button>
          </div>
        </div>
        ${isLast
          ? nothing
          : html`<label class="step-wait" title=${S.stepWaitAria}>
              <span class="step-wait-caption">${S.stepWaitLabel}</span>
              <span class="step-wait-field">
                <input class="step-wait-input" type="number" min="0" max="120" step="0.5" aria-label=${S.stepWaitAria} .value=${this._byteToSeconds(item.wait)} @change=${(event: Event) => this._setStepWait(item, event)} />
                <span class="step-wait-unit">${S.stepWaitUnit}</span>
              </span>
            </label>`}
      </div>
    `;
  }

  private _renderStepDialog(): TemplateResult | typeof nothing {
    const dialog = this._stepDialog;
    const deviceId = this.deviceId;
    if (!dialog || deviceId == null || !this._working) return nothing;
    const commands = deviceCommandItems(this._working, deviceId);
    const isEdit = dialog.editIndex !== null;
    const canSave = dialog.commandId != null;
    return html`
      <div class="modal-backdrop" @click=${this._closeStepDialog}>
        <div class="dialog small" id="step-dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${isEdit ? S.stepDialogEditTitle : S.stepDialogAddTitle}</div><button class="dialog-close" type="button" aria-label=${S.stepCancel} @click=${this._closeStepDialog}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">
            <div class="decoded-field">
              <label class="decoded-field-label" for="sb-step-command">${S.stepCommand}</label>
              ${commands.length === 0
                ? html`<div class="quick-access-empty">${S.stepNoCommands}</div>`
                : html`<select id="sb-step-command" class="decoded-field-input" @change=${(event: Event) => { const raw = (event.currentTarget as HTMLSelectElement).value; this._stepDialog = { ...dialog, commandId: raw === "" ? null : Number(raw), error: "" }; }}>
                    ${commands.map((command) => html`<option value=${command.commandId} ?selected=${command.commandId === dialog.commandId}>${command.label}</option>`)}
                  </select>`}
            </div>
            <div class="decoded-field">
              <label class="decoded-field-label" for="sb-step-hold">${S.stepHoldSeconds}</label>
              <input id="sb-step-hold" class="decoded-field-input" type="number" min="0" max="120" step="0.5" .value=${dialog.hold}
                @input=${(event: Event) => { this._stepDialog = { ...dialog, hold: (event.currentTarget as HTMLInputElement).value }; }}
                @change=${(event: Event) => { this._stepDialog = { ...dialog, hold: this._byteToSeconds(this._secondsToByte((event.currentTarget as HTMLInputElement).value)) }; }} />
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${dialog.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" @click=${this._closeStepDialog}>${S.stepCancel}</button>
              <button class="dialog-btn dialog-btn-primary" id="step-save" type="button" ?disabled=${!canSave} @click=${this._applyStep}>${isEdit ? S.stepSave : S.stepAdd}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderEditor(): TemplateResult {
    const deviceId = this.deviceId!;
    const sections = this._sectionItems();
    const dirty = this._dirty;
    const callback = this._isCallbackDevice;
    return html`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view" id="device-editor">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" id="editor-back" type="button" aria-label=${S.back} @click=${this._requestClose}>${icon(mdiArrowLeft)}</button>
                <div class="detail-title-stack">
                  <div class="detail-crumbs">
                    <button class="detail-crumb" type="button" @click=${this._requestClose}>${S.crumbDevices}</button>
                    <span class="detail-crumb-sep" aria-hidden="true">›</span>
                  </div>
                  <div class="detail-title" id="editor-title">${this._title}</div>
                </div>
                <div class="detail-title-actions">
                  ${callback
                    ? nothing
                    : html`<button class="icon-btn" id="editor-rename" type="button" aria-label=${S.renameDevice} title=${S.renameDevice} @click=${() => this._openRename({ kind: "device" })}>${icon(mdiPencil)}</button>`}
                  ${callback
                    ? nothing
                    : html`<button class="icon-btn icon-btn--danger" id="editor-delete" type="button" aria-label=${S.deleteDeviceAria} title=${S.deleteDeviceAria} ?disabled=${this._deleting} @click=${() => this._openDeleteConfirm({ kind: "device", deviceId }, this._title)}>${icon(mdiTrashCanOutline)}</button>`}
                  <button class="detail-sync-btn ${dirty ? "sync-btn-primary" : "detail-sync-btn--state-ok"}" id="editor-sync" type="button" ?disabled=${!dirty || this._syncing} @click=${() => void this._sync()}>${this._syncing ? "Syncing…" : dirty ? S.syncToHub : S.syncUpToDate}</button>
                </div>
              </div>
            </div>
            ${sections.length > 1
              ? html`<div class="detail-section-nav" role="tablist" aria-label=${S.detailSectionsAria}>
                  ${sections.map((item) => html`<button class="detail-section-nav-btn ${item.id === this._activeSection ? "active" : ""}" type="button" role="tab" data-section=${item.id} aria-selected=${String(item.id === this._activeSection)} @click=${() => this._scrollToSection(item.id)}>${icon(item.icon)}<span class="detail-section-nav-label">${item.label}</span></button>`)}
                </div>`
              : nothing}
          </div>
          <div class="detail-scroll">
            ${this._managedByHa ? html`<div class="notice-banner" id="editor-managed-warning">${icon(mdiWifiCog)}<span>${S.managedWifiWarning}</span></div>` : nothing}
            ${callback ? html`<div class="notice-banner notice-banner--info" id="editor-callback-note">${icon(mdiInformationOutline)}<span>${S.callbackDeviceNote}</span></div>` : nothing}
            ${this._renderPowerSection(deviceId)}
            ${this._renderNetworkSection(deviceId)}
            ${this._renderCommandsSection(deviceId)}
            ${this._renderBindingsSection(deviceId)}
          </div>
        </div>
        ${this._renderRenameDialog()}
        ${this._renderDeleteConfirmDialog()}
        ${this._renderBindingDialog()}
        ${this._renderExitConfirmDialog()}
        ${this._payloadDialog
          ? html`<sb-payload-dialog .api=${this.api} .hubId=${this._hub?.hub_id ?? ""} .hubVersion=${this._hubVersion} .deviceClass=${this._deviceClass} .mode=${this._payloadDialog.mode} .snapshot=${this._payloadDialog.snapshot} .rawHex=${this._payloadDialog.rawHex} .fetchedHex=${this._payloadDialog.fetchedHex} @sb-payload-close=${this._closePayloadDialog} @sb-payload-save=${(event: CustomEvent<PayloadSaveDetail>) => this._applyPayloadSave(event)}></sb-payload-dialog>`
          : nothing}
      </div>
    `;
  }

  private _renderPowerSection(deviceId: number): TemplateResult {
    const mode = deviceIdleBehavior(this._working, deviceId);
    const disabled = mode === IDLE_BEHAVIOR_DISABLED;
    const options = this._powerOptions();
    const selected = options.find((opt) => opt.mode === mode) ?? null;
    const open = this._powerMenuOpen;
    const row = (buttonId: number, label: string) => {
      const count = deviceMacroStepItems(this._working!, deviceId, buttonId).length;
      return html`<div class="quick-access-sortable-item">
        <button class="edit-selection-row" type="button" data-sequence=${buttonId} aria-disabled=${disabled ? "true" : "false"} tabindex=${disabled ? "-1" : "0"} @click=${() => { if (!disabled) this._openStepEditor(buttonId, label); }}>
          <span class="selection-main"><span class="selection-label">${label}</span><span class="selection-sub">${S.macroStepsCount(count)}</span></span>
          <span class="selection-chevron">${icon(mdiChevronRight)}</span>
        </button>
      </div>`;
    };
    return html`
      <div class="quick-access-section" data-edit-section="power">
        <div class="quick-access-head"><div class="quick-access-head-main"><div class="quick-access-title">${S.powerSetupTitle}</div><div class="quick-access-sub">${S.powerSetupDeviceSub}</div></div></div>
        ${this._isCallbackDevice
          ? nothing
          : html`<div class="power-control" id="power-control" data-open=${open ? "true" : "false"}>
              <button class="power-control-trigger" type="button" aria-haspopup="listbox" aria-expanded=${String(open)} @click=${() => { this._powerMenuOpen = !open; }}>
                <span class="selection-main"><span class="selection-label">${selected ? selected.label : S.powerControlUnset}</span><span class="selection-sub">${selected ? selected.sub : S.powerControlUnsetSub}</span></span>
                <span class="selection-chevron">${icon(mdiChevronDown)}</span>
              </button>
              ${open
                ? html`<button class="power-control-backdrop" type="button" tabindex="-1" aria-hidden="true" @click=${() => { this._powerMenuOpen = false; }}></button>
                    <div class="power-control-menu" role="listbox" aria-label=${S.powerControlTitle}>
                      ${options.map((opt) => html`<button class="power-control-option" type="button" role="option" data-mode=${opt.mode} aria-selected=${String(opt.mode === mode)} aria-checked=${String(opt.mode === mode)} @click=${() => this._selectPower(opt.mode)}>
                        <span class="selection-main"><span class="selection-label">${opt.label}</span><span class="selection-sub">${opt.sub}</span></span>
                        <span class="selection-chevron">${opt.mode === mode ? icon(mdiCheck) : nothing}</span>
                      </button>`)}
                    </div>`
                : nothing}
            </div>`}
        <div class="quick-access-list">
          ${disabled ? html`<div class="power-sequences-note">${S.powerSequencesDisabledNote}</div>` : nothing}
          <div class="quick-access-sortable-container power-sequences" data-disabled=${disabled ? "true" : "false"}>
            ${row(198, S.powerOnLabel)}
            ${row(199, S.powerOffLabel)}
          </div>
        </div>
      </div>
    `;
  }

  private _renderNetworkSection(deviceId: number): TemplateResult | typeof nothing {
    const deviceClass = bundleDeviceClass(this._working, deviceId) ?? "";
    if (!IP_HEAD_DEVICE_CLASSES.has(deviceClass)) return nothing;
    const ip = deviceIpAddress(this._working, deviceId);
    return html`
      <div class="quick-access-section" data-edit-section="network">
        <div class="quick-access-head"><div class="quick-access-head-main"><div class="quick-access-title">${S.detailNetwork}</div><div class="quick-access-sub">${S.networkDescription}</div></div></div>
        <div class="quick-access-list"><div class="quick-access-sortable-container"><div class="quick-access-sortable-item">
          <div class="quick-access-row">
            <div class="quick-access-main">
              <div class="quick-access-label-row"><div class="quick-access-label" id="editor-ip">${ip || S.hubNameNotSet}</div><div class="quick-access-chip">${S.ipChip}</div></div>
              <div class="quick-access-meta">${S.ipv4Description}</div>
            </div>
            <div class="quick-access-actions">
              <button class="icon-btn" id="editor-edit-ip" type="button" aria-label=${S.editIpAria} title=${S.editIpAria} @click=${() => this._openRename({ kind: "device_ip" })}>${icon(mdiPencil)}</button>
            </div>
          </div>
        </div></div></div>
      </div>
    `;
  }

  private _renderCommandsSection(deviceId: number): TemplateResult {
    const items = deviceCommandItems(this._working, deviceId);
    const element = this._workingElement;
    const callback = this._isCallbackDevice;
    const pendingAdd = (commandId: number) => Boolean((element?.commands ?? []).find((row) => Number(row?.command_id) === commandId)?.restore_data?.new);
    return html`
      <div class="quick-access-section" data-edit-section="commands">
        <div class="quick-access-head">
          <div class="quick-access-head-main"><div class="quick-access-title">${S.detailCommands}</div><div class="quick-access-sub">${S.commandsLiveHelp}</div></div>
          ${callback
            ? nothing
            : html`<div class="quick-access-head-actions"><button class="quick-access-add-btn" id="editor-add-command" type="button" ?disabled=${this._addCommandPreparing} @click=${() => void this._openAddCommand()}>${icon(this._addCommandPreparing ? mdiLoading : mdiPlus, this._addCommandPreparing ? "sb-spin" : "")}<span>${S.addCommand}</span></button></div>`}
        </div>
        ${items.length
          ? html`<div class="quick-access-list"><div class="quick-access-sortable-container">
              ${items.map((item) => html`<div class="quick-access-sortable-item" data-kind="command" data-command-id=${item.commandId}>
                <div class="quick-access-row">
                  <div class="quick-access-main">
                    <div class="quick-access-label-row"><div class="quick-access-label">${item.label}</div><div class="quick-access-chip">${pendingAdd(item.commandId) ? S.newCommandChip : S.commandChip}</div></div>
                    <div class="quick-access-meta">${S.commandId} ${item.commandId}</div>
                  </div>
                  <div class="quick-access-actions">
                    ${callback
                      ? nothing
                      : html`<button class="icon-btn command-rename" type="button" aria-label=${S.renameCommandAria} title=${S.renameCommandAria} @click=${() => this._openRename({ kind: "command", commandId: item.commandId })}>${icon(mdiPencil)}</button>
                          ${pendingAdd(item.commandId)
                            ? nothing
                            : html`<button class="icon-btn command-payload ${this._payloadFetching === item.commandId ? "is-fetching" : ""}" type="button" aria-label=${S.editPayloadAria} title=${S.fetchEditCommandAria} ?disabled=${this._payloadFetching != null} @click=${() => void this._fetchAndEditPayload(item.commandId)}>${icon(this._payloadFetching === item.commandId ? mdiLoading : mdiCodeBraces, this._payloadFetching === item.commandId ? "sb-spin" : "")}</button>`}
                          ${isLongRecord(this._pairedRecords ? element : null, item.commandId)
                            ? nothing
                            : html`<button class="icon-btn icon-btn--danger command-delete" type="button" aria-label=${S.deleteCommandAria} title=${S.deleteCommandAria} @click=${() => this._openDeleteConfirm({ kind: "command", deviceId, commandId: item.commandId }, item.label)}>${icon(mdiTrashCanOutline)}</button>`}`}
                  </div>
                </div>
              </div>`)}
            </div></div>`
          : html`<div class="quick-access-empty">${S.noDeviceCommands}</div>`}
      </div>
    `;
  }

  private _renderBindingsSection(deviceId: number): TemplateResult {
    const items = deviceButtonBindingItems(this._working, deviceId);
    const unbound = unboundButtonsForDevice(this._working, deviceId);
    return html`
      <div class="quick-access-section" data-edit-section="bindings">
        <div class="quick-access-head">
          <div class="quick-access-head-main"><div class="quick-access-title">${S.buttonBindingsTitle}</div><div class="quick-access-sub">${S.buttonBindingsDeviceSub}</div></div>
          <button class="quick-access-add-btn" id="editor-add-binding" type="button" ?disabled=${unbound.length === 0} @click=${() => this._openAddBinding()}>${icon(mdiPlus)}<span>${S.addBinding}</span></button>
        </div>
        ${items.length
          ? html`<div class="quick-access-list"><div class="quick-access-sortable-container">
              ${items.map((item) => html`<div class="quick-access-sortable-item" data-kind="binding" data-button-id=${item.buttonId}>
                <div class="quick-access-row">
                  <div class="quick-access-main">
                    <div class="quick-access-label-row"><div class="quick-access-label">${item.buttonName}</div><div class="quick-access-chip">${S.buttonChip}</div></div>
                    <div class="quick-access-meta">${item.shortPressLabel}</div>
                    ${item.longPress ? html`<div class="quick-access-meta">${S.bindingLongPressMeta(item.longPress.label)}</div>` : nothing}
                  </div>
                  <div class="quick-access-actions">
                    <button class="icon-btn binding-edit" type="button" aria-label=${S.editBindingAria} title=${S.editBindingAria} @click=${() => this._openEditBinding(item.buttonId)}>${icon(mdiPencil)}</button>
                    <button class="icon-btn icon-btn--danger binding-delete" type="button" aria-label=${S.deleteBindingAria} title=${S.deleteBindingAria} @click=${() => this._openDeleteConfirm({ kind: "device_binding", deviceId, buttonId: item.buttonId }, item.buttonName)}>${icon(mdiTrashCanOutline)}</button>
                  </div>
                </div>
              </div>`)}
            </div></div>`
          : html`<div class="quick-access-empty">${S.buttonBindingsEmpty}</div>`}
      </div>
    `;
  }

  // -- dialogs --------------------------------------------------------------------------------------------------

  private _renderRenameDialog(): TemplateResult | typeof nothing {
    const dialog = this._rename;
    if (!dialog) return nothing;
    const isIp = dialog.target.kind === "device_ip";
    const title = dialog.target.kind === "device" ? S.renameDevice : isIp ? S.editIpAria : S.renameCommand;
    return html`
      <div class="modal-backdrop" @click=${this._closeRename}>
        <div class="dialog small" id="rename-dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${title}</div><button class="dialog-close" type="button" aria-label=${S.cancel} @click=${this._closeRename}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">
            <label class="decoded-field">
              <span class="decoded-field-label">${isIp ? S.ipAddress : S.name}</span>
              <input class="decoded-field-input" id="rename-input" type="text" maxlength=${isIp ? 15 : 30} .value=${dialog.draft} @input=${this._renameInput} @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") { event.preventDefault(); this._applyRename(); } }} />
            </label>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note" id="rename-error">${dialog.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" @click=${this._closeRename}>${S.cancel}</button>
              <button class="dialog-btn dialog-btn-primary" id="rename-save" type="button" @click=${this._applyRename}>${S.save}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderDeleteConfirmDialog(): TemplateResult | typeof nothing {
    const dialog = this._deleteConfirm;
    if (!dialog || !this._working) return nothing;
    const impact = bundleDeleteImpact(this._working, dialog.target);
    const hasCascade = backupDeleteHasCascade(impact);
    const immediate = dialog.target.kind === "device";
    return html`
      <div class="modal-backdrop" @click=${this._closeDeleteConfirm}>
        <div class="dialog small" id="delete-dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${this._deleteTitle(dialog.target, dialog.label)}</div><button class="dialog-close" type="button" aria-label=${S.deleteCancel} @click=${this._closeDeleteConfirm}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">
            <div class="backup-drawer-sub">${hasCascade ? S.deleteCascadeIntroLive : S.deleteSimpleBodyLive}</div>
            ${hasCascade
              ? html`<ul class="delete-impact-list" id="delete-impact">
                  ${impact.activities > 0 ? html`<li>${icon(mdiLinkVariant)}<span>${S.deleteImpactActivities(impact.activities)}</span></li>` : nothing}
                  ${impact.favorites > 0 ? html`<li>${icon(mdiStarOutline)}<span>${S.deleteImpactFavorites(impact.favorites)}</span></li>` : nothing}
                  ${impact.macroSteps > 0 ? html`<li>${icon(mdiFormatListNumbered)}<span>${S.deleteImpactMacroSteps(impact.macroSteps)}</span></li>` : nothing}
                  ${impact.powerSteps > 0 ? html`<li>${icon(mdiPower)}<span>${S.deleteImpactPowerSteps(impact.powerSteps)}</span></li>` : nothing}
                  ${impact.bindings > 0 ? html`<li>${icon(mdiGestureTapButton)}<span>${S.deleteImpactBindings(impact.bindings)}</span></li>` : nothing}
                </ul>`
              : nothing}
            <div class="delete-replace-note">${icon(mdiInformationOutline)}<span>${immediate ? S.deleteImmediateNote : S.deleteSyncNote}</span></div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note"></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" @click=${this._closeDeleteConfirm}>${S.deleteCancel}</button>
              <button class="dialog-btn dialog-btn-danger" id="delete-confirm" type="button" @click=${this._confirmDelete}>${S.deleteConfirm}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private _renderBindingDialog(): TemplateResult | typeof nothing {
    const dialog = this._binding;
    const deviceId = this.deviceId;
    if (!dialog || deviceId == null || !this._working) return nothing;
    const isEdit = dialog.editButtonId != null;
    const unbound = unboundButtonsForDevice(this._working, deviceId);
    const commands = deviceCommandItems(this._working, deviceId);
    const canSave = dialog.buttonId != null && dialog.commandId != null;
    const title = isEdit ? S.bindingDialogEditTitle(buttonName(Number(dialog.buttonId))) : S.bindingDialogAddTitle;
    const select = (id: string, label: string, value: number | null, options: Array<{ value: number; label: string }>, empty: string, onChange: (value: number) => void) => html`
      <div class="decoded-field">
        <label class="decoded-field-label" for=${id}>${label}</label>
        ${options.length === 0
          ? html`<div class="quick-access-empty">${empty}</div>`
          : html`<select id=${id} class="decoded-field-input" @change=${(event: Event) => onChange(Number((event.currentTarget as HTMLSelectElement).value))}>
              ${options.map((option) => html`<option value=${option.value} ?selected=${option.value === value}>${option.label}</option>`)}
            </select>`}
      </div>`;
    return html`
      <div class="modal-backdrop" @click=${this._closeBinding}>
        <div class="dialog small" id="binding-dialog" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header"><div class="dialog-title">${title}</div><button class="dialog-close" type="button" aria-label=${S.bindingCancel} @click=${this._closeBinding}>${icon(mdiClose)}</button></div>
          <div class="dialog-body">
            ${isEdit
              ? html`<div class="decoded-field"><span class="decoded-field-label">${S.bindingButton}</span><div class="binding-static-field">${buttonName(Number(dialog.buttonId))}</div></div>`
              : select("sb-binding-button", S.bindingButton, dialog.buttonId, unbound.map((entry) => ({ value: entry.code, label: entry.name })), S.bindingNoButtons, (value) => { this._binding = { ...dialog, buttonId: value, error: "" }; })}
            ${select("sb-binding-command", S.bindingCommand, dialog.commandId, commands.map((c) => ({ value: c.commandId, label: c.label })), S.bindingNoCommands, (value) => { this._binding = { ...dialog, commandId: value, error: "" }; })}
            <div class="binding-toggle-row">
              <span class="decoded-field-label">${S.bindingEnableLongPress}</span>
              <input class="sb-switch" id="sb-binding-long-press" type="checkbox" .checked=${dialog.longPress} @change=${(event: Event) => { this._binding = { ...dialog, longPress: (event.currentTarget as HTMLInputElement).checked }; }} />
            </div>
            ${dialog.longPress
              ? select("sb-binding-lp-command", S.bindingLongPressCommand, dialog.longPressCommandId, commands.map((c) => ({ value: c.commandId, label: c.label })), S.bindingNoCommands, (value) => { this._binding = { ...dialog, longPressCommandId: value }; })
              : nothing}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${dialog.error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" type="button" @click=${this._closeBinding}>${S.bindingCancel}</button>
              <button class="dialog-btn dialog-btn-primary" id="binding-save" type="button" ?disabled=${!canSave} @click=${this._applyBinding}>${isEdit ? S.bindingSave : S.bindingAdd}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

export function defineDeviceEditor(): void {
  if (!customElements.get(DEVICE_EDITOR_TAG)) customElements.define(DEVICE_EDITOR_TAG, SbPanelDeviceEditor);
}
