// The listener ports every hub shares (hub TCP, app UDP, Wifi Commands
// TCP): the Settings tab's All Hubs "Network Ports" line opens this dialog.
//
// One Save for all three, because a change reconnects every hub whose
// listeners move. The card owns the save (the store refreshes the state
// and announces it in the dock); the dialog only validates, shows a port
// another program holds on its own field, and closes on success.

import { css, html, nothing, type ReactiveController, type ReactiveControllerHost } from "lit";
import type { ListenerPortKey, ListenerPorts } from "../shared/ha-context";
import type { ListenerPortsOutcome } from "../state/control-panel-store";
import { DEFAULT_LISTENER_PORTS } from "../shared/utils/control-panel-selectors";
import { useLegacyTextField } from "../tabs/edit-detail/names";
import { DOC_URLS } from "../shared/doc-links";
import { TOOLS_CARD_STRINGS } from "../strings";

const FIELDS: ListenerPortKey[] = ["hub_listen_base", "proxy_udp_port", "roku_listen_port"];

export const listenerPortsFormStyles = css`
  .ports-fields { display: flex; flex-direction: column; gap: 14px; }
  .ports-field ha-input, .ports-field ha-textfield { width: 100%; }
  .ports-field .dialog-field-helper { margin-top: 4px; }
  .ports-field-error { color: var(--error-color, #db4437); font-size: 12px; margin-top: 4px; }
  .ports-docs-link { color: var(--primary-color); font-size: 13px; }
  .ports-saving { font-size: 13px; line-height: 1.45; color: var(--secondary-text-color); }
`;

function fieldText(key: ListenerPortKey, defaults: ListenerPorts) {
  const S = TOOLS_CARD_STRINGS.settings;
  switch (key) {
    case "hub_listen_base":
      return { label: S.portsHubLabel, helper: S.portsHubHelper(defaults.hub_listen_base) };
    case "proxy_udp_port":
      return { label: S.portsAppLabel, helper: S.portsAppHelper(defaults.proxy_udp_port) };
    default:
      return { label: S.portsWifiLabel, helper: S.portsWifiHelper(defaults.roku_listen_port) };
  }
}

export class ListenerPortsFormController implements ReactiveController {
  open = false;
  private _values: Record<ListenerPortKey, string> = { hub_listen_base: "", proxy_udp_port: "", roku_listen_port: "" };
  private _current: ListenerPorts = DEFAULT_LISTENER_PORTS;
  private _defaults: ListenerPorts = DEFAULT_LISTENER_PORTS;
  private _busy = false;
  private _error = "";
  private _fieldErrors: Partial<Record<ListenerPortKey, string>> = {};

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly save: (ports: ListenerPorts) => Promise<ListenerPortsOutcome>,
  ) {
    host.addController(this);
  }

  hostConnected(): void {}

  get busy() {
    return this._busy;
  }

  openWith(current: ListenerPorts, defaults: ListenerPorts) {
    this._current = current;
    this._defaults = defaults;
    this._values = {
      hub_listen_base: String(current.hub_listen_base),
      proxy_udp_port: String(current.proxy_udp_port),
      roku_listen_port: String(current.roku_listen_port),
    };
    this._busy = false;
    this._error = "";
    this._fieldErrors = {};
    this.open = true;
    this.host.requestUpdate();
  }

  close = () => {
    if (this._busy) return;
    this.open = false;
    this.host.requestUpdate();
  };

  private _sameTcpPortField(ports: ListenerPorts): ListenerPortKey {
    return ports.hub_listen_base !== this._current.hub_listen_base ? "hub_listen_base" : "roku_listen_port";
  }

  /** The typed ports, or null with every bad field marked. */
  private _parse(): ListenerPorts | null {
    const S = TOOLS_CARD_STRINGS.settings;
    const errors: Partial<Record<ListenerPortKey, string>> = {};
    const ports = { ...this._current };
    for (const key of FIELDS) {
      const text = this._values[key].trim();
      const port = Number(text);
      if (!/^\d+$/.test(text) || port < 1 || port > 65535) errors[key] = S.portsInvalid;
      else ports[key] = port;
    }
    // Both TCP listeners on one port: the second could never open it.
    // Marked on the field that was changed.
    if (!errors.hub_listen_base && !errors.roku_listen_port && ports.hub_listen_base === ports.roku_listen_port) {
      errors[this._sameTcpPortField(ports)] = S.portsSamePort;
    }
    this._fieldErrors = errors;
    return Object.keys(errors).length ? null : ports;
  }

  submit = async () => {
    if (this._busy) return;
    this._error = "";
    const ports = this._parse();
    if (!ports) {
      this.host.requestUpdate();
      return;
    }
    if (FIELDS.every((key) => ports[key] === this._current[key])) {
      this.open = false;
      this.host.requestUpdate();
      return;
    }
    this._busy = true;
    this.host.requestUpdate();
    let outcome: ListenerPortsOutcome;
    try {
      outcome = await this.save(ports);
    } catch (error) {
      outcome = { kind: "error", code: null, message: String((error as Error)?.message ?? "") };
    } finally {
      this._busy = false;
    }
    const S = TOOLS_CARD_STRINGS.settings;
    if (outcome.kind === "saved") {
      this.open = false;
    } else if (outcome.kind === "in_use") {
      const errors: Partial<Record<ListenerPortKey, string>> = {};
      for (const key of FIELDS) {
        if (key in outcome.inUse) errors[key] = S.portsInUse(ports[key], outcome.inUse[key] ?? null);
      }
      this._fieldErrors = errors;
      if (!Object.keys(errors).length) this._error = S.portsFailed;
    } else if (outcome.code === "same_port") {
      this._fieldErrors = { [this._sameTcpPortField(ports)]: S.portsSamePort };
    } else {
      this._error = outcome.message || S.portsFailed;
    }
    this.host.requestUpdate();
  };

  private _field(key: ListenerPortKey) {
    const { label, helper } = fieldText(key, this._defaults);
    const id = `sb-ports-${key}`;
    const error = this._fieldErrors[key] ?? "";
    const handle = (event: Event) => {
      this._values = { ...this._values, [key]: String((event.currentTarget as HTMLElement & { value: string }).value ?? "") };
      if (this._fieldErrors[key]) {
        const { [key]: _cleared, ...rest } = this._fieldErrors;
        this._fieldErrors = rest;
      }
      this._error = "";
      this.host.requestUpdate();
    };
    const input = useLegacyTextField()
      ? html`<ha-textfield
          id=${id}
          aria-invalid=${error ? "true" : "false"}
          aria-describedby=${error ? `${id}-error` : nothing}
          .label=${label}
          type="number"
          min="1"
          max="65535"
          .value=${this._values[key]}
          ?disabled=${this._busy}
          @input=${handle}
          @change=${handle}
        ></ha-textfield>`
      : html`<ha-input
          id=${id}
          aria-invalid=${error ? "true" : "false"}
          aria-describedby=${error ? `${id}-error` : nothing}
          type="number"
          .label=${label}
          .value=${this._values[key]}
          ?disabled=${this._busy}
          @input=${handle}
          @change=${handle}
        ></ha-input>`;
    return html`<div class="ports-field" data-port=${key}>
      ${input}
      ${error
        ? html`<div class="ports-field-error" id=${`${id}-error`} role="alert">${error}</div>`
        : html`<div class="dialog-field-helper">${helper}</div>`}
    </div>`;
  }

  render() {
    if (!this.open) return nothing;
    const S = TOOLS_CARD_STRINGS.settings;
    return html`
      <div class="modal-backdrop ports-backdrop" @click=${this.close}>
        <div class="dialog small ports-dialog" role="dialog" aria-modal="true" aria-labelledby="sb-ports-title" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title" id="sb-ports-title">${S.portsDialogTitle}</div>
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} ?disabled=${this._busy} @click=${this.close}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-field-helper">
              ${S.portsIntro}
              <a class="ports-docs-link" href=${DOC_URLS.networkingPorts} target="_blank" rel="noreferrer noopener">${S.portsDocsLink}</a>
            </div>
            <div class="ports-fields">${FIELDS.map((key) => this._field(key))}</div>
            ${this._busy ? html`<div class="ports-saving" role="status">${S.portsSavingNote}</div>` : nothing}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note" role="alert">${this._error}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" ?disabled=${this._busy} @click=${this.close}>${TOOLS_CARD_STRINGS.common.cancel}</button>
              <button class="dialog-btn dialog-btn-primary ports-save" ?disabled=${this._busy} @click=${this.submit}>
                ${this._busy ? S.portsSaving : S.portsSave}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
