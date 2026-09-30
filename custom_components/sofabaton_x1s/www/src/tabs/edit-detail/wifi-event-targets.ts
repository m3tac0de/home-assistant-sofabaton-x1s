// The Wifi Event target of the three Add dialogs (shortcut, binding, step)
// as a Lit reactive controller (R6, CR-F2-14).
//
// It holds the event list loaded from the host facade, the one selection
// every open dialog shares, and the busy flag while a new event is
// allocated, plus the target fields and the ref resolution.

import { html, nothing, type ReactiveController, type ReactiveControllerHost } from "lit";
import { sanitizeWifiName } from "../../shared/hub-names";
import { TOOLS_CARD_STRINGS } from "../../strings";
import type { BackupBundlePayload, WifiEvent } from "../../shared/ha-context";
import type { WifiEventTargetSel } from "./host-types";
import type { SofabatonEditDetailView } from "../edit-detail-view";

/** The element members the controller reaches. */
export type WifiEventTargetsHost = ReactiveControllerHost &
  Pick<
    SofabatonEditDetailView,
    "bundle"
    | "mode"
    | "wifiEvents"
  >;

export class WifiEventTargets implements ReactiveController {
  private _list: WifiEvent[] | null = null;
  get list(): WifiEvent[] | null {
    return this._list;
  }
  set list(value: WifiEvent[] | null) {
    if (value === this._list) return;
    this._list = value;
    this.host.requestUpdate();
  }
  private _busy = false;
  get busy(): boolean {
    return this._busy;
  }
  set busy(value: boolean) {
    if (value === this._busy) return;
    this._busy = value;
    this.host.requestUpdate();
  }
  private _primary: WifiEventTargetSel = { mode: "new", slot: null, name: "" };
  get primary(): WifiEventTargetSel {
    return this._primary;
  }
  set primary(value: WifiEventTargetSel) {
    if (value === this._primary) return;
    this._primary = value;
    this.host.requestUpdate();
  }

  constructor(private readonly host: WifiEventTargetsHost) {
    host.addController(this);
  }

  hostConnected(): void {}

  // ── Wifi Event kind (shared by all three Add dialogs, live mode) ────

  /** The Wifi Event kind is offered only in live activity-scope dialogs. */
  available(): boolean {
    return this.host.mode === "live" && this.host.wifiEvents != null;
  }

  deployed(): WifiEvent[] {
    // W7 full deferral: staged (not-yet-deployed) events are selectable —
    // they deploy as phase 1 of the Sync press. The name is historical.
    return this.list ?? [];
  }

  /** Fire-and-forget refresh of the event list when a dialog opens. */
  load() {
    if (!this.available()) return;
    void this.host.wifiEvents!.list()
      .then((events) => {
        this.list = events;
        // Re-seat only untouched selections: the response can land after
        // the user already picked an event or typed a new-event name, and
        // clobbering that mid-flight would lose their input.
        const pristine = (sel: WifiEventTargetSel) =>
          sel.mode === "new" && sel.slot == null && sel.name === "";
        if (pristine(this.primary)) this.primary = this.defaultSel();
      })
      .catch(() => {
        this.list = [];
      });
  }

  defaultSel(): WifiEventTargetSel {
    const first = this.deployed()[0] ?? null;
    return first
      ? { mode: "existing", slot: first.slot_index, name: "" }
      : { mode: "new", slot: null, name: "" };
  }

  renderTargetFields(params: {
    idPrefix: string;
    sel: WifiEventTargetSel;
    onSelChange: (sel: WifiEventTargetSel) => void;
  }) {
    const S = TOOLS_CARD_STRINGS.backup;
    const events = this.deployed();
    const sel = params.sel;
    return html`
      ${events.length
        ? html`
            <div class="decoded-field">
              <label class="decoded-field-label" for=${`${params.idPrefix}-wifi-event`}>${S.wifiEventTargetLabel}</label>
              <select
                id=${`${params.idPrefix}-wifi-event`}
                class="decoded-field-input"
                @change=${(event: Event) => {
                  const value = (event.target as HTMLSelectElement).value;
                  params.onSelChange(
                    value === "__new__"
                      ? { mode: "new", slot: null, name: sel.name }
                      : { mode: "existing", slot: Number(value), name: sel.name },
                  );
                }}
              >
                ${events.map((item) => html`
                  <option value=${item.slot_index} ?selected=${sel.mode === "existing" && item.slot_index === sel.slot}>${item.name}</option>
                `)}
                <option value="__new__" ?selected=${sel.mode === "new"}>${S.wifiEventTargetCreateNew}</option>
              </select>
            </div>
          `
        : html`<div class="quick-access-empty">${S.wifiEventNoneYet}</div>`}
      ${sel.mode === "new"
        ? html`
            <div class="decoded-field">
              <label class="decoded-field-label" for=${`${params.idPrefix}-wifi-event-name`}>${S.wifiEventNameLabel}</label>
              <input
                id=${`${params.idPrefix}-wifi-event-name`}
                class="decoded-field-input"
                maxlength="20"
                .value=${sel.name}
                ?disabled=${this.busy}
                @input=${(event: Event) => {
                  // The backend refuses what the hub cannot store (CR-X4-1).
                  const input = event.target as HTMLInputElement;
                  const name = sanitizeWifiName(this.host.bundle?.hub?.version, input.value);
                  if (name !== input.value) input.value = name;
                  params.onSelChange({ ...sel, name });
                }}
              />
              <div class="decoded-field-helper">${S.wifiEventNameHelper}</div>
            </div>
          `
        : nothing}
      ${this.busy
        ? html`<div class="decoded-field-helper">${S.wifiEventDeploying}</div>`
        : nothing}
    `;
  }

  /**
   * Resolve a Wifi Event target selection to its atomic ref: a single
   * event carries BOTH a short and a long record (short = slot+1, long =
   * short + slot_count). A reference always addresses the event as one
   * unit — the short record — and the long record is derived from the
   * same event when a binding's long-press leg needs it (there is no
   * separate long-press *target*; short vs long is an action-config
   * distinction made in the Events tab, per the Wifi Events model).
   *
   * Returns the (possibly grafted) working bundle to insert into. Creating
   * a new event is an instant store allocation (W7) — no hub deploy here.
   * `deviceId` is the host's positive placeholder id before the first-ever
   * deploy; the Sync flow rewrites it. Throws a user-facing Error on failure.
   */
  async resolveRef(
    sel: WifiEventTargetSel,
  ): Promise<{
    deviceId: number;
    shortCommandId: number;
    longCommandId: number;
    slotIndex: number;
    name: string;
    bundle: BackupBundlePayload;
  }> {
    const S = TOOLS_CARD_STRINGS.backup;
    if (!this.host.wifiEvents || !this.host.bundle) throw new Error(S.bindingIncomplete);
    if (sel.mode === "existing") {
      const event = this.deployed().find((item) => item.slot_index === sel.slot);
      // The host fills device_id (real deployed id, or a computed free
      // placeholder the Sync flow rewrites) — a null id would be an
      // internal error, not a user one.
      if (!event || event.device_id == null) throw new Error(S.bindingIncomplete);
      const grafted = await this.host.wifiEvents.ensureGrafted();
      return {
        deviceId: event.device_id,
        shortCommandId: event.command_id,
        longCommandId: event.long_press_command_id,
        slotIndex: event.slot_index,
        name: event.name,
        bundle: grafted ?? this.host.bundle,
      };
    }
    const name = sel.name.trim();
    if (!name) throw new Error(S.wifiEventNameRequired);
    this.busy = true;
    try {
      const created = await this.host.wifiEvents.create(name);
      const event = created.event;
      this.list = null;
      if (event.device_id == null) throw new Error(S.wifiEventCreateFailed);
      return {
        deviceId: event.device_id,
        shortCommandId: event.command_id,
        longCommandId: event.long_press_command_id,
        slotIndex: event.slot_index,
        name: event.name,
        bundle: created.bundle ?? this.host.bundle,
      };
    } finally {
      this.busy = false;
    }
  }
}
