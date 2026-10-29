// The delivery pill of a managed Wifi device (a Wifi Device, or the Wifi
// Events device in its Hub editor): the HTTP / MQTT pill in the header and
// the dropdown behind it. The dropdown says how button presses reach Home
// Assistant, tests it, explains what is wrong when presses don't arrive (the
// failed test's TCP flow, either end of an X2's broker link) and, on an X2,
// picks the delivery method. Hosts: the Hub editor (edit-detail-view) and the
// Wifi Commands device view.
//
// The test result is stored with the device, so the pill can warn at rest
// without asking the hub. The broker link (one hub exchange) is read only
// when the dropdown opens on an MQTT device, after a failed MQTT test, and
// when MQTT is picked: Settings stays the only view that asks on its own.

import { css, html, nothing, type ReactiveController, type ReactiveControllerHost } from "lit";
import type { HassLike, HubMqttLinkState, WifiDelivery, WifiDeliveryInfo } from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { anchoredListPosition } from "../shared/utils/overlay-menu";
import { localizeWifiSyncFailure } from "../shared/utils/backend-state-localization";
import {
  deliveryAllowText,
  deliveryDocUrl,
  deliveryFailed,
  deliveryPathText,
  deployedTransport,
  formatCheckedAgo,
  formatLatency,
  type WifiTransport,
} from "../shared/utils/wifi-delivery";
import { HubBrokerFormController } from "./hub-broker-form";
import { TOOLS_CARD_STRINGS } from "../strings";

/** What the host knows about the device, handed over on every render. */
export interface DeliveryPillDevice {
  hass: HassLike | null | undefined;
  hubEntryId: string;
  /** The Wifi Device's store key (`haevents` for the Wifi Events device). */
  deviceKey: string;
  /** The record is on the hub. */
  onHub: boolean;
  /** The method on the hub; before the first Sync, the one picked. */
  transport: WifiTransport;
  /** The method picked for the next Sync, when it differs from the hub's. */
  pending: WifiTransport | null;
  /** An X2: the dropdown offers the method choice. */
  canSwitch: boolean;
  /** MQTT can be picked (X2 and Home Assistant's MQTT integration). */
  mqttAvailable: boolean;
  /** Another hub operation runs: nothing here may start. */
  locked: boolean;
  /** Store a pick: a pending switch, or the first Sync's method. Picking
   *  the hub's method cancels a pending switch. */
  onPick: (transport: WifiTransport) => void | Promise<void>;
  /** Hold the shared hub lock (and the dock line) while a test runs. */
  onBusy?: (busy: boolean, label: string | null) => void;
  /** A test ended: the host may reload what shows its result. */
  onTested?: () => void;
}

type BrokerProblem = "hub" | "ha";

const transportName = (transport: WifiTransport) => (transport === "mqtt" ? "MQTT" : "HTTP");

export const deliveryPillStyles = css`
  .transport-pill { display: inline-flex; align-items: center; align-self: center; gap: 3px; border-radius: 999px; padding: 3px 9px; font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.4px; line-height: 1.25; border: 1px solid var(--divider-color); color: var(--secondary-text-color); background: var(--ha-card-background, var(--card-background-color)); white-space: nowrap; flex: 0 0 auto; }
  .transport-pill.mqtt { border-color: color-mix(in srgb, var(--primary-color) 40%, var(--divider-color)); color: var(--primary-color); }
  .transport-pill.pending { border-style: dashed; }
  .transport-pill.attention { border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 60%, var(--divider-color)); background: color-mix(in srgb, var(--warning-color, #f59e0b) 14%, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); }
  .transport-pill ha-icon { --mdc-icon-size: 13px; display: inline-flex; }
  .transport-pill .delivery-pill-alert { color: var(--warning-color, #f59e0b); margin-inline-start: -3px; }
  button.delivery-pill { padding-inline-end: 5px; cursor: pointer; }
  button.delivery-pill:hover { border-color: color-mix(in srgb, var(--primary-color) 60%, var(--divider-color)); }
  button.delivery-pill:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  button.delivery-pill[aria-expanded="true"] { box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 24%, transparent); }
  .delivery-pill-wrap { display: inline-flex; align-self: center; flex: 0 0 auto; }
  .delivery-backdrop { position: fixed; inset: 0; z-index: 8; border: 0; padding: 0; margin: 0; background: transparent; cursor: default; }
  .delivery-pop {
    z-index: 9;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--divider-color);
    border-radius: var(--tools-radius-sm, 12px);
    background: var(--ha-card-background, var(--card-background-color));
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.1);
    color: var(--primary-text-color);
    font-size: 12.5px;
    line-height: 1.45;
    text-align: start;
    white-space: normal;
  }
  .delivery-main { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; }
  .delivery-method { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid var(--divider-color); }
  .delivery-head { display: flex; align-items: center; gap: 10px; }
  .delivery-title { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; }
  .delivery-path { margin: 0; color: var(--secondary-text-color); overflow-wrap: anywhere; }
  .delivery-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
  .delivery-hint { margin: 0; font-size: 12px; color: var(--secondary-text-color); }
  .delivery-status { display: flex; gap: 8px; padding: 8px 10px; border-radius: 9px; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .delivery-status > ha-icon { --mdc-icon-size: 17px; flex: 0 0 auto; color: var(--secondary-text-color); }
  .delivery-status.ok { background: color-mix(in srgb, var(--success-color, #43a047) 13%, transparent); }
  .delivery-status.ok > ha-icon { color: var(--success-color, #43a047); }
  .delivery-status.warn { background: color-mix(in srgb, var(--warning-color, #f59e0b) 14%, transparent); }
  .delivery-status.warn > ha-icon { color: var(--warning-color, #f59e0b); }
  .delivery-status.brief { padding: 0 2px; background: transparent; }
  .delivery-status-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
  .delivery-status-title { font-weight: 500; }
  .delivery-status.warn:not(.brief) .delivery-status-title { font-weight: 700; }
  .delivery-status-meta { font-size: 12px; color: var(--secondary-text-color); }
  .delivery-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 3px; }
  .delivery-actions.end { justify-content: flex-end; margin-top: 0; }
  .delivery-pop a { color: var(--primary-color); font-weight: 500; }
  .delivery-btn { border: 1px solid var(--divider-color); border-radius: 9px; padding: 5px 10px; background: transparent; color: var(--primary-text-color); font: inherit; font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer; }
  .delivery-btn.primary { border-color: var(--primary-color); background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .delivery-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
  .delivery-btn:disabled { opacity: 0.45; cursor: default; }
  .delivery-link-btn { border: 0; padding: 0; background: none; color: var(--primary-color); font: inherit; font-size: 12px; font-weight: 500; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
  .delivery-error { font-size: 12px; color: var(--error-color, #db4437); }
  .delivery-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; padding: 3px; border-radius: 9px; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .delivery-choice button { display: inline-flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 0 6px; min-width: 0; padding: 6px 8px; text-align: center; border: 0; border-radius: 7px; background: transparent; color: var(--secondary-text-color); font: inherit; font-size: 12px; font-weight: 700; letter-spacing: 0.4px; cursor: pointer; }
  .delivery-choice button[aria-checked="true"] { background: var(--ha-card-background, var(--card-background-color)); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16); }
  .delivery-choice button:disabled { opacity: 0.4; cursor: default; }
  .delivery-choice button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 1px; }
  .delivery-tag { font-size: 10px; font-weight: 500; letter-spacing: 0; color: var(--secondary-text-color); }
  .delivery-check { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; border-radius: 9px; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); font-size: 12px; }
  .delivery-check.problem { background: color-mix(in srgb, var(--warning-color, #f59e0b) 14%, transparent); }
  .delivery-check-line { display: flex; gap: 7px; align-items: flex-start; }
  .delivery-check-line ha-icon { --mdc-icon-size: 15px; flex: 0 0 auto; color: var(--secondary-text-color); }
  .delivery-check.problem .delivery-check-line ha-icon { color: var(--warning-color, #f59e0b); }
  .delivery-pending { display: flex; align-items: flex-start; gap: 7px; padding: 8px 10px; border: 1px dashed color-mix(in srgb, var(--primary-color) 50%, var(--divider-color)); border-radius: 9px; background: color-mix(in srgb, var(--primary-color) 10%, transparent); font-size: 12px; }
  .delivery-pending ha-icon { --mdc-icon-size: 16px; flex: 0 0 auto; color: var(--primary-color); }
  .delivery-pending .delivery-link-btn { margin-inline-start: auto; align-self: center; }
  .delivery-spin { animation: delivery-spin 0.9s linear infinite; }
  @keyframes delivery-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .delivery-spin { animation: none; } }
`;

/** The read-only pill of a device row: no dropdown (the row opens the
 *  device), but it still warns. */
export function renderReadOnlyDeliveryPill(params: { transport: WifiTransport; pending: boolean; attention: boolean }) {
  const W = TOOLS_CARD_STRINGS.wifiCommands;
  const D = TOOLS_CARD_STRINGS.wifiDelivery;
  const classes = `transport-pill ${params.transport}${params.pending ? " pending" : ""}${params.attention ? " attention" : ""}`;
  return html`<span
    class=${classes}
    title=${params.attention ? D.pillAttention : params.pending ? W.transportPillPreviewTitle : W.transportPillDeployedTitle}
  >${params.attention ? html`<ha-icon class="delivery-pill-alert" icon="mdi:alert-outline"></ha-icon>` : nothing}${transportName(params.transport)}</span>`;
}

export class DeliveryPillController implements ReactiveController {
  open = false;
  /** The delivery record read for the current device (a store read). */
  info: WifiDeliveryInfo | null = null;
  busy = false;
  /** The verdict of a Test pressed here. */
  lastTest: WifiDelivery | null = null;
  error = "";
  /** Picking MQTT reads the broker link first; "blocked" names a broken end. */
  picking: "checking" | "blocked" | null = null;
  readonly broker: HubBrokerFormController;
  private _device: DeliveryPillDevice | null = null;
  private _key = "";
  private _menuStyle = "";
  /** The broker link was read for this device's dropdown (not at rest). */
  private _linkRead = false;
  private _escapeBound = false;

  constructor(private readonly host: ReactiveControllerHost & HTMLElement) {
    host.addController(this);
    this.broker = new HubBrokerFormController(host, () => this._device?.hass ?? null);
  }

  hostConnected(): void {}

  hostDisconnected(): void {
    this.open = false;
    this._listenForEscape(false);
  }

  /** Escape closes it wherever focus went (Test disables itself while it
   *  runs); the window is only touched while the dropdown is open. */
  private _listenForEscape(on: boolean) {
    if (on === this._escapeBound) return;
    this._escapeBound = on;
    if (on) window.addEventListener("keydown", this._onKeydown);
    else window.removeEventListener("keydown", this._onKeydown);
  }

  private api(): ControlPanelApi | null {
    const hass = this._device?.hass;
    return hass ? new ControlPanelApi(hass) : null;
  }

  /** Forget everything read for the device (another device, another hub). */
  reset() {
    this.open = false;
    this._listenForEscape(false);
    this.info = null;
    this.busy = false;
    this.lastTest = null;
    this.error = "";
    this.picking = null;
    this._linkRead = false;
    this._key = "";
    this.broker.reset();
    this.host.requestUpdate();
  }

  /** Read the stored delivery record again (after a Sync replaced it). */
  async reload() {
    this.lastTest = null;
    this.error = "";
    await this._loadInfo();
  }

  /** Follow the device the host shows: a new one starts clean and reads
   *  its stored delivery record. */
  private _follow(device: DeliveryPillDevice) {
    this._device = device;
    const key = [device.hubEntryId, device.deviceKey, device.onHub, device.transport].join("|");
    if (key === this._key) return;
    const hubChanged = this._key.split("|")[0] !== device.hubEntryId;
    this._key = key;
    this.open = false;
    this._listenForEscape(false);
    this.info = null;
    this.lastTest = null;
    this.error = "";
    this.picking = null;
    this._linkRead = false;
    if (hubChanged) this.broker.reset();
    if (device.onHub) queueMicrotask(() => { void this._loadInfo(); });
  }

  private async _loadInfo() {
    const device = this._device;
    const api = this.api();
    if (!device || !api || !device.onHub || !device.deviceKey) return;
    const key = this._key;
    try {
      const info = await api.getWifiDelivery(device.hubEntryId, device.deviceKey);
      if (key === this._key) this.info = info;
    } catch {
      if (key === this._key) this.info = null;
    }
    this.host.requestUpdate();
  }

  /** The method presses use now: the delivery record's, else the host's. */
  private _hubTransport(device: DeliveryPillDevice): WifiTransport {
    return deployedTransport(this.info?.transport) ?? device.transport;
  }

  private _delivery(): WifiDelivery | null {
    return this.lastTest ?? this.info?.delivery ?? null;
  }

  /** A broken end of the broker link behind an MQTT device on the hub. */
  private _brokerProblem(device: DeliveryPillDevice): BrokerProblem | null {
    if (!device.onHub || !this._linkRead || this._hubTransport(device) !== "mqtt") return null;
    const link = this.broker.state;
    if (!link || this.broker.loadedFor !== device.hubEntryId) return null;
    if (link.ha_connected === false) return "ha";
    if (link.hub_connected === false) return "hub";
    return null;
  }

  /** The pill warns: the last test did not arrive or could not be sent, or
   *  the broker link is known to be broken. */
  attention(device: DeliveryPillDevice | null = this._device): boolean {
    if (!device?.onHub) return false;
    return deliveryFailed(this._delivery()) || this._brokerProblem(device) !== null;
  }

  private _readLink(device: DeliveryPillDevice): Promise<HubMqttLinkState | null> {
    this._linkRead = true;
    return this.broker.load(device.hubEntryId);
  }

  private _toggle = (event: Event) => {
    if (this.open) {
      this.close();
      return;
    }
    const device = this._device;
    const trigger = event.currentTarget as HTMLElement | null;
    if (!device || !trigger) return;
    this._menuStyle = anchoredListPosition(trigger, {
      minWidth: 320,
      maxHeight: 560,
      within: trigger.closest<HTMLElement>(".detail-view"),
      widthOnly: true,
    });
    this.open = true;
    this._listenForEscape(true);
    this.host.requestUpdate();
    if (device.onHub && !this.info) void this._loadInfo();
    if (device.onHub && device.canSwitch && this._hubTransport(device) === "mqtt") void this._readLink(device);
  };

  close = () => {
    this._listenForEscape(false);
    if (!this.open) return;
    this.open = false;
    if (this.picking === "checking") this.picking = null;
    this.host.requestUpdate();
    void (this.host as unknown as { updateComplete?: Promise<unknown> }).updateComplete?.then(() => {
      this.host.shadowRoot?.querySelector<HTMLElement>("button.delivery-pill")?.focus();
    });
  };

  private _onKeydown = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !this.open) return;
    event.preventDefault();
    event.stopPropagation();
    this.close();
  };

  /** Test: the deploy's test press on its own (no Action runs). */
  test = async () => {
    const device = this._device;
    const api = this.api();
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    if (!device || !api || !device.onHub || this.busy || device.locked) return;
    this.busy = true;
    this.error = "";
    this.lastTest = null;
    this.host.requestUpdate();
    device.onBusy?.(true, S.testing);
    try {
      this.lastTest = await api.testWifiDelivery(device.hubEntryId, device.deviceKey);
    } catch (error) {
      const code = String((error as { code?: unknown } | null)?.code ?? "");
      this.error = code === "busy" || code === "sync_in_progress" || code === "not_found"
        ? localizeWifiSyncFailure(error)
        : S.testFailed;
    } finally {
      this.busy = false;
      device.onBusy?.(false, null);
      this.host.requestUpdate();
    }
    await this._loadInfo();
    // A press that did not arrive over MQTT: read the link to say why.
    if (device.canSwitch && this._hubTransport(device) === "mqtt" && deliveryFailed(this.lastTest)) {
      await this._readLink(device);
    }
    device.onTested?.();
  };

  /** A method picked in the dropdown. MQTT runs the create dialog's check
   *  first: a broken end of the broker link keeps the pick from counting. */
  async pick(transport: WifiTransport) {
    const device = this._device;
    if (!device || device.locked) return;
    const shown = device.pending ?? device.transport;
    if (transport === shown && this.picking === null) return;
    if (transport !== "mqtt" || transport === device.transport) {
      this.picking = null;
      this.host.requestUpdate();
      await device.onPick(transport);
      return;
    }
    // Every render hands over a fresh device object: follow it by key.
    const key = this._key;
    this.picking = "checking";
    this.host.requestUpdate();
    const link = await this._readLink(device);
    if (this._key !== key || this.picking !== "checking") return;
    if (link?.ha_connected === false || link?.hub_connected === false) {
      this.picking = "blocked";
      this.host.requestUpdate();
      return;
    }
    this.picking = null;
    this.host.requestUpdate();
    await (this._device ?? device).onPick("mqtt");
  }

  /** The broker dialog, for a pick waiting on it or for an MQTT device
   *  whose hub has no broker. */
  private _setUpBroker(forPick: boolean) {
    const device = this._device;
    if (!device) return;
    const key = this._key;
    this.close();
    this.broker.openFor(device.hubEntryId, {
      onDone: (connected) => {
        if (!connected) return;
        if (forPick && this._key === key) {
          this.picking = null;
          void (this._device ?? device).onPick("mqtt");
        }
        this.host.requestUpdate();
      },
      onUseHttp: forPick ? () => { this.picking = null; this.host.requestUpdate(); } : undefined,
    });
  }

  /** The broker dialog: the host renders it with its other dialogs. */
  renderDialogs() {
    return this.broker.render();
  }

  renderPill(device: DeliveryPillDevice) {
    this._follow(device);
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    const W = TOOLS_CARD_STRINGS.wifiCommands;
    const shown = device.pending ?? device.transport;
    const warn = this.attention(device);
    const name = transportName(shown);
    return html`
      <span class="delivery-pill-wrap" @keydown=${this._onKeydown}>
        <button
          class="transport-pill delivery-pill ${shown}${device.pending ? " pending" : ""}${warn ? " attention" : ""}"
          type="button"
          aria-haspopup="dialog"
          aria-expanded=${this.open ? "true" : "false"}
          aria-label=${warn ? `${S.pillLabel(name)}. ${S.pillAttention}` : S.pillLabel(name)}
          title=${device.pending ? W.transportPillPreviewTitle : W.transportPillDeployedTitle}
          @click=${this._toggle}
        >
          ${warn ? html`<ha-icon class="delivery-pill-alert" icon="mdi:alert-outline"></ha-icon>` : nothing}
          <span>${name}</span>
          <ha-icon icon="mdi:chevron-down"></ha-icon>
        </button>
        ${this.open
          ? html`
              <button
                class="delivery-backdrop"
                type="button"
                tabindex="-1"
                aria-hidden="true"
                @click=${this.close}
                @wheel=${(event: Event) => event.preventDefault()}
              ></button>
              <div class="delivery-pop" role="dialog" aria-label=${S.title} style=${this._menuStyle}>
                ${this._renderMain(device)}
                ${device.canSwitch ? this._renderMethod(device) : nothing}
              </div>
            `
          : nothing}
      </span>
    `;
  }

  private _renderMain(device: DeliveryPillDevice) {
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    const problem = this._brokerProblem(device);
    const pathless = device.onHub && this.info !== null && deployedTransport(this.info.transport) === null;
    const canTest = device.onHub && !pathless;
    const untested = !this._delivery();
    const path = this.info && !pathless ? deliveryPathText(this.info) : "";
    return html`
      <div class="delivery-main">
        <div class="delivery-head">
          <span class="delivery-title">${S.title}</span>
          <button
            class="delivery-btn delivery-test-btn"
            type="button"
            ?disabled=${!canTest || device.locked || this.busy}
            @click=${this.test}
          >${this.busy ? S.testing : untested ? S.test : S.testAgain}</button>
        </div>
        ${path ? html`<p class="delivery-path">${path}</p>` : nothing}
        ${problem ? this._renderBrokerProblem(problem) : nothing}
        ${this._renderStatus(device, pathless, problem !== null)}
        ${this.error ? html`<div class="delivery-error" role="alert">${this.error}</div>` : nothing}
      </div>
    `;
  }

  private _status(icon: string, tone: "ok" | "warn" | "idle", title: string, meta = "", extra: unknown = nothing, brief = false) {
    return html`
      <div class="delivery-status ${tone}${brief ? " brief" : ""}" role=${tone === "warn" && !brief ? "alert" : nothing}>
        <ha-icon class=${icon === "mdi:loading" ? "delivery-spin" : ""} icon=${icon}></ha-icon>
        <div class="delivery-status-copy">
          <span class="delivery-status-title">${title}</span>
          ${meta && !brief ? html`<span class="delivery-status-meta">${meta}</span>` : nothing}
          ${brief ? nothing : extra}
        </div>
      </div>
    `;
  }

  /** The test result; brief under a broker problem, which already says why. */
  private _renderStatus(device: DeliveryPillDevice, pathless: boolean, brief: boolean) {
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    if (this.busy) return this._status("mdi:loading", "idle", S.testing);
    if (!device.onHub) return this._status("mdi:information-outline", "idle", S.notOnHub, S.notOnHubHint);
    if (pathless) return this._status("mdi:information-outline", "idle", S.needsSync);
    if (device.onHub && !this.info && !this.lastTest) return nothing;
    const delivery = this._delivery();
    const status = String(delivery?.status ?? "");
    if (status === "not_delivered") {
      const info = this.info ?? { transport: device.transport, target: "", hub_ip: "" };
      return this._status(
        "mdi:alert-outline",
        "warn",
        S.notDelivered,
        deliveryAllowText(info),
        html`<span class="delivery-actions"><a href=${deliveryDocUrl(info.transport)} target="_blank" rel="noreferrer">${S.networkingGuide}</a></span>`,
        brief,
      );
    }
    if (status === "not_sent") return this._status("mdi:alert-outline", "warn", S.notSent, "", nothing, brief);
    if (status === "delivered") {
      const seconds = formatLatency(delivery?.latency_s);
      return this._status(
        "mdi:check-circle",
        "ok",
        delivery?.via === "press" ? S.pressReceived : S.delivered(seconds),
        formatCheckedAgo(delivery?.checked_at),
      );
    }
    return this._status("mdi:help-circle-outline", "idle", S.notTested, S.notTestedHint);
  }

  private _renderBrokerProblem(problem: BrokerProblem) {
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    const broker = this.broker.state?.ha_broker;
    const guide = html`<a href=${deliveryDocUrl("mqtt")} target="_blank" rel="noreferrer">${S.networkingGuide}</a>`;
    if (problem === "ha") {
      return this._status("mdi:alert-outline", "warn", S.brokerHaNotConnected, S.brokerHaFix, html`<span class="delivery-actions">${guide}</span>`);
    }
    return this._status(
      "mdi:alert-outline",
      "warn",
      S.brokerNotConnected,
      broker?.host ? S.brokerHa(`${broker.host}:${broker.port}`) : "",
      html`<span class="delivery-actions">
        <button class="delivery-btn primary delivery-broker-setup" type="button" @click=${() => this._setUpBroker(false)}>${S.brokerSetUp}</button>
        ${guide}
      </span>`,
    );
  }

  private _renderMethod(device: DeliveryPillDevice) {
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    const W = TOOLS_CARD_STRINGS.wifiCommands;
    const shown = device.pending ?? device.transport;
    const mqttOffered = device.mqttAvailable || device.transport === "mqtt";
    const option = (transport: WifiTransport) => {
      const tag = !device.onHub
        ? ""
        : transport === device.transport ? S.onHubTag : device.pending === transport ? S.afterSyncTag : "";
      return html`
        <button
          type="button"
          role="radio"
          class="delivery-option"
          data-transport=${transport}
          aria-checked=${shown === transport ? "true" : "false"}
          ?disabled=${device.locked || this.picking === "checking" || (transport === "mqtt" && !mqttOffered)}
          @click=${() => { void this.pick(transport); }}
        >${transportName(transport)}${tag ? html`<span class="delivery-tag">${tag}</span>` : nothing}</button>
      `;
    };
    return html`
      <div class="delivery-method">
        <span class="delivery-label" id="delivery-method-label">${W.transportLabel}</span>
        <div class="delivery-choice" role="radiogroup" aria-labelledby="delivery-method-label">
          ${option("http")}${option("mqtt")}
        </div>
        <p class="delivery-hint">${shown === "mqtt" ? W.transportMqttHint : W.transportHttpHint}</p>
        ${mqttOffered ? nothing : html`<p class="delivery-hint">${S.mqttNeedsIntegration}</p>`}
        ${this._renderPickCheck()}
        ${device.pending && device.onHub
          ? html`
              <div class="delivery-pending">
                <ha-icon icon="mdi:swap-horizontal"></ha-icon>
                <span>${S.switchPending(transportName(device.pending), transportName(device.transport))}</span>
                <button class="delivery-link-btn delivery-undo" type="button" ?disabled=${device.locked} @click=${() => { void this.pick(device.transport); }}>${S.undo}</button>
              </div>
            `
          : nothing}
        ${device.onHub ? nothing : html`<p class="delivery-hint">${S.firstSyncMethod}</p>`}
      </div>
    `;
  }

  /** Picking MQTT: the broker check, and what to do when an end is down. */
  private _renderPickCheck() {
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    if (this.picking === "checking") {
      return html`<div class="delivery-check"><span class="delivery-check-line"><ha-icon class="delivery-spin" icon="mdi:loading"></ha-icon><span>${S.mqttChecking}</span></span></div>`;
    }
    if (this.picking !== "blocked") return nothing;
    const keepHttp = html`<button class="delivery-btn delivery-use-http" type="button" @click=${() => { this.picking = null; this.host.requestUpdate(); }}>${S.useHttpInstead}</button>`;
    if (this.broker.state?.ha_connected === false) {
      return html`
        <div class="delivery-check problem" role="alert">
          <span class="delivery-check-line"><ha-icon icon="mdi:alert-outline"></ha-icon><span>${S.mqttHaNotConnected}</span></span>
          <span class="delivery-actions end">${keepHttp}</span>
        </div>
      `;
    }
    return html`
      <div class="delivery-check problem" role="alert">
        <span class="delivery-check-line"><ha-icon icon="mdi:alert-outline"></ha-icon><span>${S.mqttHubNotConnected}</span></span>
        <span class="delivery-actions end">
          ${keepHttp}
          <button class="delivery-btn primary delivery-pick-setup" type="button" @click=${() => this._setUpBroker(true)}>${S.setUpNow}</button>
        </span>
      </div>
    `;
  }
}
