// An X2's MQTT broker: both ends of the link (Home Assistant's MQTT
// connection, the hub's own) and the dialog that points the hub at a broker
// (docs/internal/wifi-webhook-transport-plan.md §4.4, decisions 8 and 9).
//
// A Lit reactive controller so the Settings tab (the card) and the Wifi
// Commands create flow (the Wifi tab) share it; both hosts carry the dialog
// classes. The form prefills Home Assistant's own broker and login (the
// password never leaves the backend); a separate login can be typed
// instead. Setup always explains that saved broker settings are replaced:
// a disconnected hub may still have settings that we cannot read.

import { css, html, nothing, type ReactiveController, type ReactiveControllerHost } from "lit";
import type { HassLike, HubMqttLinkState } from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { useLegacyTextField } from "../tabs/edit-detail/names";
import { TOOLS_CARD_STRINGS } from "../strings";

type Verdict = "connected" | "failed" | "no_answer" | null;
type BrokerField = "host" | "port" | "username" | "password";

export const hubBrokerFormStyles = css`
  .broker-fields { display: flex; gap: 10px; align-items: flex-start; }
  .broker-fields .broker-host { flex: 1 1 auto; min-width: 0; }
  .broker-fields .broker-port { flex: 0 0 110px; }
  .broker-dialog ha-input, .broker-dialog ha-textfield { width: 100%; }
  .broker-field-error { color: var(--error-color, #db4437); font-size: 12px; margin-top: 4px; }
  .broker-login { display: flex; flex-direction: column; gap: 6px; }
  .broker-login-option { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--primary-text-color); cursor: pointer; }
  .broker-login-option input { accent-color: var(--primary-color); margin: 0; }
  .broker-warning {
    padding: 8px 10px;
    border-radius: calc(var(--ha-card-border-radius, 12px) * 0.85);
    background: color-mix(in srgb, var(--warning-color, #f59e0b) 12%, transparent);
    font-size: 13px;
    line-height: 1.45;
    color: var(--primary-text-color);
  }
  .setting-broker-action {
    padding: 6px 12px;
    border: 1px solid var(--primary-color);
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    color: var(--primary-text-color);
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
  }
  .broker-result { font-size: 13px; line-height: 1.45; }
  .broker-result.ok { color: var(--success-color, #43a047); }
  .broker-result.bad { color: var(--error-color, #db4437); }
`;

export class HubBrokerFormController implements ReactiveController {
  state: HubMqttLinkState | null = null;
  loading = false;
  /** The hub whose link state is held (or is being read). */
  loadedFor: string | null = null;
  open = false;
  private _entryId = "";
  private _host = "";
  private _port = 1883;
  private _useHaLogin = true;
  private _username = "";
  private _password = "";
  private _busy = false;
  private _verdict: Verdict = null;
  private _error = "";
  private _errorField: BrokerField | null = null;
  private _onDone: ((connected: boolean) => void) | null = null;
  private _onUseHttp: (() => void) | null = null;

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly hass: () => HassLike | null | undefined,
  ) {
    host.addController(this);
  }

  hostConnected(): void {}

  private api(): ControlPanelApi | null {
    const hass = this.hass();
    return hass ? new ControlPanelApi(hass) : null;
  }

  /** Read both ends of the link for a hub (one hub exchange). */
  async load(entryId: string): Promise<HubMqttLinkState | null> {
    const api = this.api();
    if (!api || !entryId) return null;
    this.loadedFor = entryId;
    this.loading = true;
    this.host.requestUpdate();
    try {
      const state = await api.getHubMqttStatus(entryId);
      if (this.loadedFor === entryId) this.state = state;
      return state;
    } catch {
      if (this.loadedFor === entryId) this.state = null;
      return null;
    } finally {
      if (this.loadedFor === entryId) {
        this.loading = false;
        this.host.requestUpdate();
      }
    }
  }

  /** Forget the held state (the hub changed). */
  reset() {
    this.state = null;
    this.loadedFor = null;
    this.loading = false;
    this.open = false;
    this.host.requestUpdate();
  }

  /** Open the form, prefilled from the held state. `onUseHttp` adds the
   *  create flow's way out; `onDone` hears the verdict. */
  openFor(
    entryId: string,
    opts: { onDone?: (connected: boolean) => void; onUseHttp?: () => void } = {},
  ) {
    this._entryId = entryId;
    this._host = this.state?.suggested_host ?? "";
    this._port = Number(this.state?.suggested_port || 1883);
    this._useHaLogin = Boolean(this.state?.ha_login_available);
    this._username = "";
    this._password = "";
    this._busy = false;
    this._verdict = null;
    this._error = "";
    this._errorField = null;
    this._onDone = opts.onDone ?? null;
    this._onUseHttp = opts.onUseHttp ?? null;
    this.open = true;
    this.host.requestUpdate();
  }

  close = () => {
    if (this._busy) return;
    this.open = false;
    this._password = "";
    this.host.requestUpdate();
  };

  private _useHttp = () => {
    const handler = this._onUseHttp;
    this.close();
    handler?.();
  };

  submit = async () => {
    if (this._busy) return;
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    const host = this._host.trim();
    this._errorField = null;
    this._verdict = null;
    if (!/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(host) || host.split(".").some((part) => Number(part) > 255)) {
      this._error = S.brokerHostRequired;
      this._errorField = "host";
      this.host.requestUpdate();
      return;
    }
    if (!Number.isInteger(this._port) || this._port < 1 || this._port > 65535) {
      this._error = S.brokerPortInvalid;
      this._errorField = "port";
      this.host.requestUpdate();
      return;
    }
    const api = this.api();
    if (!api) return;
    this._busy = true;
    this._verdict = null;
    this._error = "";
    this.host.requestUpdate();
    try {
      const result = await api.setHubMqttBroker(this._entryId, {
        host,
        port: this._port,
        useHaLogin: this._useHaLogin,
        username: this._username,
        password: this._password,
      });
      this._verdict = result?.connected ? "connected" : "failed";
      if (result && this.loadedFor === this._entryId) {
        const { connected: _connected, ...state } = result;
        this.state = state as HubMqttLinkState;
      }
    } catch (error) {
      const code = String((error as { code?: unknown } | null)?.code ?? "");
      this._verdict = code === "hub_no_answer" ? "no_answer" : null;
      const validation: Record<string, [BrokerField | null, string]> = {
        broker_invalid_host: ["host", S.brokerHostRequired],
        broker_invalid_port: ["port", S.brokerPortInvalid],
        broker_username_too_long: [this._useHaLogin ? null : "username", S.brokerUsernameTooLong],
        broker_password_too_long: [this._useHaLogin ? null : "password", S.brokerPasswordTooLong],
        broker_credentials_too_long: [null, S.brokerCredentialsTooLong],
      };
      const fieldError = validation[code];
      this._errorField = fieldError?.[0] ?? null;
      this._error = code === "hub_no_answer" ? "" : fieldError?.[1] ?? S.brokerFailed;
    } finally {
      this._busy = false;
      this._password = "";
      this.host.requestUpdate();
    }
    if (this._verdict === "connected") this._onDone?.(true);
  };

  private _finish = () => {
    this.open = false;
    this.host.requestUpdate();
  };

  private _textField(params: {
    id: string;
    label: string;
    value: string;
    type?: string;
    className?: string;
    onInput: (value: string) => void;
  }) {
    const handle = (event: Event) => {
      this._error = "";
      this._errorField = null;
      params.onInput(String((event.currentTarget as HTMLElement & { value: string }).value ?? ""));
      this.host.requestUpdate();
    };
    const error = params.id === `sb-broker-${this._errorField}` ? this._error : "";
    const field = useLegacyTextField()
      ? html`<ha-textfield
          id=${params.id}
          aria-invalid=${error ? "true" : "false"}
          aria-describedby=${error ? `${params.id}-error` : nothing}
          .label=${params.label}
          .type=${params.type ?? "text"}
          .value=${params.value}
          ?disabled=${this._busy}
          @input=${handle}
          @change=${handle}
        ></ha-textfield>`
      : html`<ha-input
          id=${params.id}
          aria-invalid=${error ? "true" : "false"}
          aria-describedby=${error ? `${params.id}-error` : nothing}
          type=${params.type ?? "text"}
          .label=${params.label}
          .value=${params.value}
          ?disabled=${this._busy}
          @input=${handle}
          @change=${handle}
        ></ha-input>`;
    return html`<div class=${params.className ?? ""}>${field}${error
      ? html`<div class="broker-field-error" id=${`${params.id}-error`} role="alert">${error}</div>`
      : nothing}</div>`;
  }

  render() {
    if (!this.open) return nothing;
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    const state = this.state;
    const tls = Boolean(state?.ha_broker?.tls) && Number(state?.ha_broker?.port) === this._port;
    const connected = this._verdict === "connected";
    return html`
      <div class="modal-backdrop broker-backdrop" @click=${this.close}>
        <div class="dialog small broker-dialog" role="dialog" aria-modal="true" @click=${(event: Event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S.brokerDialogTitle}</div>
            <button class="dialog-close" aria-label=${TOOLS_CARD_STRINGS.common.closeAria} ?disabled=${this._busy} @click=${this.close}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="broker-warning" role="note">${S.brokerReplaceWarning}</div>
            <div class="dialog-field-helper">${S.brokerIntro}</div>
            <div class="broker-fields">
              ${this._textField({
                id: "sb-broker-host",
                className: "broker-host",
                label: S.brokerHostLabel,
                value: this._host,
                onInput: (value) => { this._host = value; this._error = ""; this.host.requestUpdate(); },
              })}
              ${this._textField({
                id: "sb-broker-port",
                className: "broker-port",
                label: S.brokerPortLabel,
                value: String(this._port),
                type: "number",
                onInput: (value) => {
                  this._port = Number(value);
                  this.host.requestUpdate();
                },
              })}
            </div>
            ${tls ? html`<div class="dialog-field-helper">${S.brokerTlsWarning}</div>` : nothing}
            <div class="broker-login">
              ${state?.ha_login_available
                ? html`
                    <label class="broker-login-option">
                      <input type="radio" name="sb-broker-login" .checked=${this._useHaLogin} ?disabled=${this._busy}
                        @change=${() => { this._useHaLogin = true; this.host.requestUpdate(); }} />
                      <span>${S.brokerUseHaLogin(state.ha_username)}</span>
                    </label>
                    <label class="broker-login-option">
                      <input type="radio" name="sb-broker-login" .checked=${!this._useHaLogin} ?disabled=${this._busy}
                        @change=${() => { this._useHaLogin = false; this.host.requestUpdate(); }} />
                      <span>${S.brokerUseSeparateLogin}</span>
                    </label>
                  `
                : nothing}
              ${this._useHaLogin
                ? nothing
                : html`
                    ${this._textField({
                      id: "sb-broker-username",
                      label: S.brokerUsernameLabel,
                      value: this._username,
                      onInput: (value) => { this._username = value; },
                    })}
                    ${this._textField({
                      id: "sb-broker-password",
                      label: S.brokerPasswordLabel,
                      value: this._password,
                      type: "password",
                      onInput: (value) => { this._password = value; },
                    })}
                  `}
              <div class="dialog-field-helper">${S.brokerLoginNote}</div>
            </div>
            ${this._busy ? html`<div class="broker-result">${S.brokerConnecting}</div>` : nothing}
            ${connected ? html`<div class="broker-result ok" role="status">${S.brokerConnectedResult}</div>` : nothing}
            ${this._verdict === "failed" ? html`<div class="broker-result bad" role="alert">${S.brokerFailed}</div>` : nothing}
            ${this._verdict === "no_answer" ? html`<div class="broker-result bad" role="alert">${S.brokerNoAnswer}</div>` : nothing}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note" role="alert">${this._errorField ? "" : this._error}</div>
            <div class="dialog-footer-actions">
              ${connected
                ? html`<button class="dialog-btn dialog-btn-primary broker-done" @click=${this._finish}>${S.brokerDone}</button>`
                : html`
                    ${this._onUseHttp
                      ? html`<button class="dialog-btn broker-use-http" ?disabled=${this._busy} @click=${this._useHttp}>${S.useHttpInstead}</button>`
                      : html`<button class="dialog-btn" ?disabled=${this._busy} @click=${this.close}>${TOOLS_CARD_STRINGS.common.cancel}</button>`}
                    <button class="dialog-btn dialog-btn-primary broker-connect" ?disabled=${this._busy} @click=${this.submit}>
                      ${this._verdict ? S.brokerTryAgain : S.brokerConnect}
                    </button>
                  `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /** The Settings tab line: the link state and Set up / Change. */
  renderSettingDescription() {
    const S = TOOLS_CARD_STRINGS.wifiDelivery;
    const state = this.state;
    if (this.loading && !state) return S.brokerLoading;
    if (!state) return S.brokerUnknown;
    const hub = state.hub_connected === true
      ? S.brokerConnected
      : state.hub_connected === false ? S.brokerNotConnected : S.brokerUnknown;
    const ha = state.ha_connected === false
      ? S.brokerHaNotConnected
      : state.ha_broker?.host ? S.brokerHa(`${state.ha_broker.host}:${state.ha_broker.port}`) : "";
    return [hub, ha].filter(Boolean).join(" ");
  }
}
