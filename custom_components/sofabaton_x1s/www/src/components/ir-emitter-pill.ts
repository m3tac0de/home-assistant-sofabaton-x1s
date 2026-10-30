// The IR pill of an X2 IR device in the Hub editor's device header, and the
// dropdown behind it: which emitters send the device's IR (the hub's built-in
// emitter, its IR ports, the paired repeaters and remotes;
// docs/internal/ir-emitter-pill-plan.md). Built like the delivery pill
// (DeliveryPillController): an anchored dropdown with a backdrop, Escape and
// focus return. The template is the shared one in
// remote-card/src/ir-emitters/, which the server panel uses too.
//
// The routing itself is the device record's (`device.extras`): a pick is a
// pending edit of the editor's bundle, applied by its Sync. What the pill
// reads from the hub is the paired remotes and repeaters, and only when the
// dropdown opens (a few seconds: the hub polls them first). The last read is
// kept per hub, here and by Home Assistant, so the pill and the device list
// can warn at rest without asking the hub.

import type { ReactiveController, ReactiveControllerHost } from "lit";
import type { HassLike, IrEmitterStatusResponse } from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { anchoredListPosition } from "../shared/utils/overlay-menu";
import { TOOLS_CARD_STRINGS } from "../strings";
import { renderIrEmitterPill } from "../../../../../remote-card/src/ir-emitters/emitter-dropdown";
import { irEmitterAttention, normalizePaired, type PairedEmitter } from "../../../../../remote-card/src/ir-emitters/emitter-rules";
import type { EmitterRouting } from "../../../../../remote-card/src/ir-emitters/emitter-routing";

export { irEmitterStyles, renderReadOnlyIrPill } from "../../../../../remote-card/src/ir-emitters/emitter-dropdown";

/** The last read of a hub's paired remotes and repeaters. */
export interface IrEmitterRead {
  /** Null when the hub was never read (since Home Assistant started). */
  paired: PairedEmitter[] | null;
  readAt: number | null;
}

// Per hub entry: the editor's pill writes it, the device list reads it.
const LAST_READS = new Map<string, IrEmitterRead>();
const LOADING = new Map<string, Promise<IrEmitterRead | null>>();

function readOf(status: IrEmitterStatusResponse | null | undefined): IrEmitterRead {
  return { paired: normalizePaired(status?.paired), readAt: typeof status?.read_at === "number" ? status.read_at : null };
}

/** The hub's last read, when this card has it. */
export function irEmitterLastRead(entryId: string): IrEmitterRead | null {
  return LAST_READS.get(entryId) ?? null;
}

/** The last read is known here (or was asked for and refused). */
export function irEmitterLastReadKnown(entryId: string): boolean {
  return LAST_READS.has(entryId) || LOADING.has(entryId);
}

/** Ask Home Assistant once for the hub's last read (no hub exchange). */
export function loadIrEmitterLastRead(hass: HassLike | null | undefined, entryId: string): Promise<IrEmitterRead | null> {
  if (!hass || !entryId) return Promise.resolve(null);
  const known = LAST_READS.get(entryId);
  if (known) return Promise.resolve(known);
  const pending = LOADING.get(entryId);
  if (pending) return pending;
  const load = new ControlPanelApi(hass).getIrEmitterStatus(entryId, false).then(
    (status) => {
      const read = readOf(status);
      // A fresh read that landed meanwhile wins.
      if (!LAST_READS.has(entryId)) LAST_READS.set(entryId, read);
      return LAST_READS.get(entryId) ?? read;
    },
    () => {
      // Not an X2, or Home Assistant could not answer: nothing to warn from.
      if (!LAST_READS.has(entryId)) LAST_READS.set(entryId, { paired: null, readAt: null });
      return null;
    },
  ).finally(() => LOADING.delete(entryId));
  LOADING.set(entryId, load);
  return load;
}

/** Forget every hub's read (tests). */
export function forgetIrEmitterReads(): void {
  LAST_READS.clear();
  LOADING.clear();
}

/** A read refused or failed, worded for the dropdown (never a toast). */
export function irEmitterReadError(code: string): string {
  const S = TOOLS_CARD_STRINGS.irEmitters;
  if (code === "busy" || code === "sync_in_progress") return S.readBusy;
  if (code === "unavailable") return S.readUnavailable;
  if (code === "no_answer") return S.readNoAnswer;
  return S.readFailed;
}

/** What the host knows about the device, handed over on every render. */
export interface IrEmitterPillDevice {
  hass: HassLike | null | undefined;
  hubEntryId: string;
  deviceId: number;
  /** The routing being edited (the working bundle's). */
  routing: EmitterRouting;
  /** The routing on the hub (the captured baseline's). */
  baseline: EmitterRouting;
  /** Another hub operation runs: the dropdown does not read the hub. */
  locked: boolean;
  /** A pick: the host writes it into the edited bundle. */
  onChange: (next: EmitterRouting) => void;
  /** Undo: the host restores the hub's bytes. */
  onUndo: () => void;
  /** Hold the shared hub lock (and the dock line) while the read runs. */
  onBusy?: (busy: boolean, label: string | null) => void;
}

export class IrEmitterPillController implements ReactiveController {
  open = false;
  /** The read runs. */
  checking = false;
  /** The failed read's code ("" when none). */
  error = "";
  private _device: IrEmitterPillDevice | null = null;
  private _key = "";
  private _menuStyle = "";
  private _escapeBound = false;
  private _readSeq = 0;

  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    host.addController(this);
  }

  hostConnected(): void {}

  hostDisconnected(): void {
    this.open = false;
    this._listenForEscape(false);
  }

  /** Escape closes it wherever focus went; the window is only touched
   *  while the dropdown is open. */
  private _listenForEscape(on: boolean) {
    if (on === this._escapeBound) return;
    this._escapeBound = on;
    if (on) window.addEventListener("keydown", this._onKeydown);
    else window.removeEventListener("keydown", this._onKeydown);
  }

  /** The paired remotes and repeaters of the last read of the device's hub. */
  get paired(): PairedEmitter[] | null {
    const entryId = this._device?.hubEntryId ?? "";
    return entryId ? irEmitterLastRead(entryId)?.paired ?? null : null;
  }

  /** The pill warns: a picked repeater is offline, or a picked remote or
   *  repeater is no longer paired (from the last read). */
  attention(device: IrEmitterPillDevice | null = this._device): boolean {
    if (!device) return false;
    return irEmitterAttention(device.routing, irEmitterLastRead(device.hubEntryId)?.paired ?? null);
  }

  /** Follow the device the host shows: another one starts closed. */
  private _follow(device: IrEmitterPillDevice) {
    this._device = device;
    const key = `${device.hubEntryId}|${device.deviceId}`;
    if (key === this._key) return;
    this._key = key;
    this.open = false;
    this._listenForEscape(false);
    this.error = "";
    this.checking = false;
    this._readSeq++;
    if (device.hubEntryId && !irEmitterLastReadKnown(device.hubEntryId)) {
      queueMicrotask(() => {
        void loadIrEmitterLastRead(device.hass, device.hubEntryId).then(() => this.host.requestUpdate());
      });
    }
  }

  private _toggle = (trigger: HTMLElement) => {
    if (this.open) {
      this.close();
      return;
    }
    this._menuStyle = anchoredListPosition(trigger, {
      minWidth: 320,
      maxHeight: 560,
      within: trigger.closest<HTMLElement>(".detail-view"),
      widthOnly: true,
    });
    this.open = true;
    this._listenForEscape(true);
    this.host.requestUpdate();
    void this.refresh();
  };

  close = () => {
    this._listenForEscape(false);
    if (!this.open) return;
    this.open = false;
    this.host.requestUpdate();
    void (this.host as unknown as { updateComplete?: Promise<unknown> }).updateComplete?.then(() => {
      this.host.shadowRoot?.querySelector<HTMLElement>("button.ir-pill")?.focus();
    });
  };

  private _onKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !this.open) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  };

  /** Read the paired remotes and repeaters from the hub (the dropdown
   *  opened, or Check again). The rows show the last read meanwhile. */
  refresh = async () => {
    const device = this._device;
    if (!device || !device.hass || !device.hubEntryId || this.checking) return;
    if (device.locked) {
      this.error = "busy";
      this.host.requestUpdate();
      return;
    }
    const seq = ++this._readSeq;
    const key = this._key;
    this.checking = true;
    this.error = "";
    this.host.requestUpdate();
    device.onBusy?.(true, TOOLS_CARD_STRINGS.irEmitters.checking);
    try {
      const status = await new ControlPanelApi(device.hass).getIrEmitterStatus(device.hubEntryId, true);
      LAST_READS.set(device.hubEntryId, readOf(status));
    } catch (error) {
      if (seq === this._readSeq && key === this._key) this.error = String((error as { code?: unknown } | null)?.code ?? "") || "failed";
    } finally {
      if (seq === this._readSeq) this.checking = false;
      device.onBusy?.(false, null);
      this.host.requestUpdate();
    }
  };

  renderPill(device: IrEmitterPillDevice) {
    this._follow(device);
    return renderIrEmitterPill({
      idPrefix: "editor",
      labels: TOOLS_CARD_STRINGS.irEmitters,
      routing: device.routing,
      baseline: device.baseline,
      paired: irEmitterLastRead(device.hubEntryId)?.paired ?? null,
      open: this.open,
      menuStyle: this._menuStyle,
      checking: this.checking,
      error: this.error ? irEmitterReadError(this.error) : null,
      onToggle: this._toggle,
      onClose: this.close,
      onChange: (next) => device.onChange(next),
      onUndo: () => device.onUndo(),
      onRetry: () => { void this.refresh(); },
    });
  }
}
