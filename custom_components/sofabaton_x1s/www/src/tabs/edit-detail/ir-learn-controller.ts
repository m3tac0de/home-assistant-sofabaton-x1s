// The payload editor's learn mode (IR9) as a Lit reactive controller (R6, CR-F2-14).
//
// It owns the learn state (the source menu, the hub learn window and its
// countdown, the Home Assistant emission inbox) and its rendering. The
// element keeps the two points where learning meets the payload dialog:
// whether learning applies to the open command (_learnAvailable) and
// dropping a learned blob into the editor (_adoptLearnedPayload).

import { html, nothing, type ReactiveController, type ReactiveControllerHost } from "lit";
import type {
  IrEmissionRecord,
  IrEmitterConsumer,
  IrLearnEvent,
  IrLearnState,
} from "../../shared/ha-context";
import { backendErrorCode, localizeBackendError } from "../../shared/utils/backend-state-localization";
import { TOOLS_CARD_STRINGS, toolsCardLanguage } from "../../strings";
import type { IrLearnHost } from "./host-types";

/** Seconds the hub keeps its receiver armed per learn attempt (hub exits at ~60 s anyway). */
const LEARN_TIMEOUT_S = 60;

/** Format a carrier frequency with the decimal separator of the active card locale. */
function formatCarrierKhz(carrierHz: number): string {
  const locale = toolsCardLanguage() || "en";
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(carrierHz / 1000);
  } catch {
    return (carrierHz / 1000).toFixed(1);
  }
}

/** What the controller needs from the element that hosts it. */
export interface IrLearnControllerHost extends ReactiveControllerHost {
  readonly irLearn: IrLearnHost | null;
  _learnAvailable(): boolean;
  _adoptLearnedPayload(hex: string, note: string): void;
}

export class IrLearnController implements ReactiveController {
  // "New" is judged against the ring as first seen when learn mode
  // opened (payload -> timestamp), never against the browser clock.
  private _view: "off" | "menu" | "hub" | "ha" = "off";
  get view(): "off" | "menu" | "hub" | "ha" {
    return this._view;
  }
  set view(value: "off" | "menu" | "hub" | "ha") {
    if (value === this._view) return;
    this._view = value;
    this.host.requestUpdate();
  }
  private _hubState: IrLearnState | "arming" = "arming";
  get hubState(): IrLearnState | "arming" {
    return this._hubState;
  }
  set hubState(value: IrLearnState | "arming") {
    if (value === this._hubState) return;
    this._hubState = value;
    this.host.requestUpdate();
  }
  private _hubEvent: IrLearnEvent | null = null;
  get hubEvent(): IrLearnEvent | null {
    return this._hubEvent;
  }
  set hubEvent(value: IrLearnEvent | null) {
    if (value === this._hubEvent) return;
    this._hubEvent = value;
    this.host.requestUpdate();
  }
  hubDeadline = 0;
  private _secondsLeft: number = 0;
  get secondsLeft(): number {
    return this._secondsLeft;
  }
  set secondsLeft(value: number) {
    if (value === this._secondsLeft) return;
    this._secondsLeft = value;
    this.host.requestUpdate();
  }
  hubCancel: (() => void) | null = null;
  hubAttempt = 0;
  ticker: ReturnType<typeof setInterval> | null = null;
  private _emissions: IrEmissionRecord[] = [];
  get emissions(): IrEmissionRecord[] {
    return this._emissions;
  }
  set emissions(value: IrEmissionRecord[]) {
    if (value === this._emissions) return;
    this._emissions = value;
    this.host.requestUpdate();
  }
  emissionsUnsub: (() => void) | null = null;
  private _emissionsError: { error_code: string } | null = null;
  get emissionsError(): { error_code: string } | null {
    return this._emissionsError;
  }
  set emissionsError(value: { error_code: string } | null) {
    if (value === this._emissionsError) return;
    this._emissionsError = value;
    this.host.requestUpdate();
  }
  baseline: Map<string, string> | null = null;
  private _haAvailable: boolean | null = null;
  get haAvailable(): boolean | null {
    return this._haAvailable;
  }
  set haAvailable(value: boolean | null) {
    if (value === this._haAvailable) return;
    this._haAvailable = value;
    this.host.requestUpdate();
  }
  private _consumers: IrEmitterConsumer[] = [];
  get consumers(): IrEmitterConsumer[] {
    return this._consumers;
  }
  set consumers(value: IrEmitterConsumer[]) {
    if (value === this._consumers) return;
    this._consumers = value;
    this.host.requestUpdate();
  }
  private _sourceNote: string = "";
  get sourceNote(): string {
    return this._sourceNote;
  }
  set sourceNote(value: string) {
    if (value === this._sourceNote) return;
    this._sourceNote = value;
    this.host.requestUpdate();
  }
  private _now: number = Date.now();
  get now(): number {
    return this._now;
  }
  set now(value: number) {
    if (value === this._now) return;
    this._now = value;
    this.host.requestUpdate();
  }

  constructor(private readonly host: IrLearnControllerHost) {
    host.addController(this);
  }

  hostConnected(): void {}

  // ── Rendering ─────────────────────────────────────────────────────

  renderEntryButton() {
    if (!this.host._learnAvailable()) return nothing;
    const S = TOOLS_CARD_STRINGS.backup;
    return html`
      <button
        class="payload-learn-btn"
        type="button"
        title=${S.learnAria}
        aria-label=${S.learnAria}
        @click=${() => void this.enter()}
      >
        <ha-icon icon="mdi:import"></ha-icon>
        <span>${S.learn}</span>
      </button>
    `;
  }

  renderPanel() {
    switch (this.view) {
      case "menu":
        return this.renderMenu();
      case "hub":
        return this.renderHub();
      case "ha":
        return this.renderInbox();
      default:
        return nothing;
    }
  }

  renderMenu() {
    const S = TOOLS_CARD_STRINGS.backup;
    return html`
      <div class="learn-panel" data-learn-view="menu">
        <button class="learn-option" type="button" @click=${() => void this.startHubLearn()}>
          <ha-icon icon="mdi:remote"></ha-icon>
          <span class="learn-option-body">
            <span class="learn-option-title">${S.learnFromHub}</span>
            <span class="learn-option-desc">${S.learnFromHubDescription}</span>
          </span>
          <ha-icon icon="mdi:chevron-right"></ha-icon>
        </button>
        ${this.haOptionVisible()
          ? html`
              <button class="learn-option" type="button" @click=${() => this.openInbox()}>
                <ha-icon icon="mdi:home-assistant"></ha-icon>
                <span class="learn-option-body">
                  <span class="learn-option-title">${S.learnFromHa}</span>
                  <span class="learn-option-desc">${S.learnFromHaDescription}</span>
                </span>
                <ha-icon icon="mdi:chevron-right"></ha-icon>
              </button>
            `
          : this.haAvailable === null
            ? html`<div class="learn-checking">${S.learnHaChecking}</div>`
            : nothing}
      </div>
    `;
  }

  renderHub() {
    const S = TOOLS_CARD_STRINGS.backup;
    const state = this.hubState;
    const event = this.hubEvent;
    let icon = "mdi:remote";
    let title = "";
    let detail = "";
    switch (state) {
      case "arming":
        icon = "mdi:progress-clock";
        title = S.learnHubArming;
        break;
      case "listening":
        title = S.learnHubListening;
        detail = S.learnHubCountdown(this.formatCountdown(this.secondsLeft));
        break;
      case "timed_out":
        icon = "mdi:timer-off-outline";
        title = S.learnHubTimedOut;
        break;
      case "interrupted":
        icon = "mdi:alert-circle-outline";
        title = S.learnHubInterrupted(String(event?.interrupted_by || "?"));
        break;
      case "cancelled":
        icon = "mdi:cancel";
        title = S.learnHubCancelled;
        break;
      case "refused":
        icon = "mdi:alert-circle-outline";
        title = localizeBackendError(event, "ir_learn");
        break;
      case "error":
        icon = "mdi:alert-circle-outline";
        title = localizeBackendError(event, "ir_learn");
        break;
      default:
        title = S.learnHubListening;
    }
    return html`
      <div class="learn-panel" data-learn-view="hub">
        <div class="learn-stage ${state}" role="status" aria-live="polite">
          <ha-icon icon=${icon}></ha-icon>
          <div class="learn-stage-copy">
            <div class="learn-stage-title">${title}</div>
            ${detail ? html`<div class="learn-stage-detail">${detail}</div>` : nothing}
          </div>
        </div>
      </div>
    `;
  }

  renderInbox() {
    const S = TOOLS_CARD_STRINGS.backup;
    // One chip per consumer integration (its config-entry title), with the
    // entity ids as the tooltip: live Samsung Infrared exposes a dozen
    // button entities per TV, so per-entity chips would swamp the panel.
    const chips = this.consumers.map((consumer) => ({
      name: consumer.title || consumer.domain,
      entity_id: consumer.entities.map((entity) => entity.entity_id).join(", ") || consumer.domain,
    }));
    const emissions = [...this.emissions].reverse();
    return html`
      <div class="learn-panel" data-learn-view="ha">
        <div class="learn-inbox-help">${S.learnHaHelper}</div>
        ${chips.length
          ? html`
              <div class="learn-consumers">
                <span class="learn-consumers-label">${S.learnHaConsumers}</span>
                <div class="learn-chips">
                  ${chips.map((chip) => html`<span class="learn-chip" title=${chip.entity_id}>${chip.name}</span>`)}
                </div>
              </div>
            `
          : nothing}
        ${this.emissionsError
          ? html`
              <div class="section-status error" role="alert">
                <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                <span>${localizeBackendError(this.emissionsError, "ir_emissions")}</span>
              </div>
            `
          : nothing}
        <div class="learn-inbox-list" role="list">
          ${emissions.length
            ? emissions.map((rec) => this.renderInboxRow(rec))
            : html`
                <div class="learn-inbox-empty">
                  <ha-icon icon="mdi:tray-arrow-down"></ha-icon>
                  <span>${S.learnHaEmpty}</span>
                </div>
              `}
        </div>
      </div>
    `;
  }

  renderInboxRow(rec: IrEmissionRecord) {
    const S = TOOLS_CARD_STRINGS.backup;
    const isNew = this.emissionIsNew(rec);
    const meta: string[] = [this.timeAgo(rec.when)];
    if (Number(rec.count) > 1) meta.push(S.learnHaSentCount(Number(rec.count)));
    if (Number(rec.carrier_hz) > 0) meta.push(`${formatCarrierKhz(Number(rec.carrier_hz))} kHz`);
    return html`
      <button
        class="learn-inbox-row ${isNew ? "is-new" : ""}"
        type="button"
        role="listitem"
        @click=${() => this.useEmission(rec)}
      >
        <span class="learn-inbox-main">
          <span class="learn-inbox-label">${this.emissionDisplayName(rec)}</span>
          <span class="learn-inbox-meta">${meta.filter(Boolean).join(" · ")}</span>
        </span>
        ${isNew ? html`<span class="learn-badge">${S.learnHaNew}</span>` : nothing}
        <span class="learn-inbox-use">${S.learnHaUse}</span>
      </button>
    `;
  }

  renderFooterActions() {
    const S = TOOLS_CARD_STRINGS.backup;
    if (this.view === "menu") {
      return html`<button class="dialog-btn" @click=${() => this.exit()}>${S.learnBack}</button>`;
    }
    if (this.view === "hub") {
      const terminal = this.hubLearnIsTerminal();
      return html`
        ${terminal
          ? html`<button class="dialog-btn dialog-btn-primary" @click=${() => void this.startHubLearn()}>${S.learnTryAgain}</button>`
          : nothing}
        <button class="dialog-btn" @click=${() => this.backToMenu()}>
          ${terminal ? S.learnBack : TOOLS_CARD_STRINGS.common.cancel}
        </button>
      `;
    }
    return html`<button class="dialog-btn" @click=${() => this.backToMenu()}>${S.learnBack}</button>`;
  }

  // ── Logic ─────────────────────────────────────────────────────────


  /**
   * Open the source menu. The HA option is gated on the emitter existing
   * AND either a consumer config entry or a non-empty intercept ring, so
   * the inbox subscription is opened right away (it also feeds the inbox
   * view later) while the consumer lookup runs alongside it.
   */
  async enter() {
    const host = this.host.irLearn;
    if (!host || !this.host._learnAvailable()) return;
    this.view = "menu";
    this.sourceNote = "";
    this.haAvailable = null;
    this.consumers = [];
    this.startTicker();
    void this.openEmissionInbox(host);
    try {
      const response = await host.consumers();
      if (this.left()) return;
      this.consumers = Array.isArray(response?.consumers) ? response.consumers : [];
      this.haAvailable = !!response?.available;
    } catch {
      if (this.left()) return;
      this.haAvailable = false;
    }
  }

  /** Re-read after an await (TypeScript narrows the field across awaits otherwise). */
  left(): boolean {
    return this.view === "off";
  }

  haOptionVisible(): boolean {
    return this.haAvailable === true
      && (this.consumers.length > 0 || this.emissions.length > 0);
  }

  async openEmissionInbox(host: IrLearnHost) {
    if (this.emissionsUnsub) return;
    this.emissionsError = null;
    try {
      const unsubscribe = await host.subscribeEmissions((emissions) => {
        if (this.view === "off") return;
        const next = Array.isArray(emissions) ? emissions : [];
        if (!this.baseline) {
          this.baseline = new Map(next.map((rec) => [rec.payload_hex, rec.when]));
        }
        this.emissions = next;
      });
      if (this.view === "off") {
        unsubscribe();
        return;
      }
      this.emissionsUnsub = unsubscribe;
    } catch (error) {
      if (this.view === "off") return;
      this.emissionsError = {
        error_code: backendErrorCode(error) ?? "ir_emissions_failed",
      };
    }
  }

  /**
   * Row name: the command's own repr when its class defines one (it
   * carries address/command), otherwise the backend label, which is the
   * class name plus a per-code digest. Repr-less classes (live finding:
   * SonyX700Command) would otherwise make every code read identically.
   */
  emissionDisplayName(rec: IrEmissionRecord): string {
    const repr = String(rec.command_repr ?? "").trim();
    const label = String(rec.label ?? "").trim();
    if (!repr) return label;
    const className = label.replace(/\s*\(.*$/, "");
    return repr === className ? label : repr;
  }

  /** New = not in the ring as first seen, or re-sent since (count bump refreshes `when`). */
  emissionIsNew(rec: IrEmissionRecord): boolean {
    const baseline = this.baseline;
    if (!baseline) return false;
    return baseline.get(rec.payload_hex) !== rec.when;
  }

  openInbox() {
    this.cancelHubLearn();
    this.view = "ha";
    if (this.host.irLearn) void this.openEmissionInbox(this.host.irLearn);
  }

  backToMenu() {
    this.cancelHubLearn();
    this.view = "menu";
  }

  /** Leave learn mode entirely: cancel any hub window, drop the inbox, reset. */
  exit() {
    this.cancelHubLearn();
    const unsubscribe = this.emissionsUnsub;
    this.emissionsUnsub = null;
    if (unsubscribe) {
      try { unsubscribe(); } catch { /* socket already gone */ }
    }
    this.stopTicker();
    this.view = "off";
    this.hubState = "arming";
    this.hubEvent = null;
    this.hubDeadline = 0;
    this.secondsLeft = 0;
    this.emissions = [];
    this.emissionsError = null;
    this.baseline = null;
    this.haAvailable = null;
    this.consumers = [];
  }

  async startHubLearn() {
    const host = this.host.irLearn;
    if (!host) return;
    this.cancelHubLearn();
    const attempt = ++this.hubAttempt;
    this.view = "hub";
    this.hubState = "arming";
    this.hubEvent = null;
    this.hubDeadline = 0;
    this.secondsLeft = 0;
    this.startTicker();
    try {
      const cancel = await host.learnFromHub((event) => {
        if (attempt !== this.hubAttempt) return;
        this.handleHubLearnEvent(event);
      }, LEARN_TIMEOUT_S);
      if (attempt !== this.hubAttempt || this.view !== "hub") {
        // Superseded (Back/Cancel/close) while the subscribe was in flight.
        try { cancel(); } catch { /* ignore */ }
        return;
      }
      if (this.hubLearnIsTerminal()) {
        // Outcome already arrived: just let go of the subscription.
        try { cancel(); } catch { /* ignore */ }
        return;
      }
      this.hubCancel = cancel;
    } catch (error) {
      if (attempt !== this.hubAttempt) return;
      this.hubState = "error";
      this.hubEvent = {
        state: "error",
        error_code: backendErrorCode(error) ?? "ir_learn_failed",
      };
    }
  }

  handleHubLearnEvent(event: IrLearnEvent) {
    const S = TOOLS_CARD_STRINGS.backup;
    this.hubEvent = event;
    this.hubState = event.state;
    if (event.state === "listening") {
      const timeout = Number(event.timeout_s) > 0 ? Number(event.timeout_s) : LEARN_TIMEOUT_S;
      this.hubDeadline = Date.now() + timeout * 1000;
      this.secondsLeft = Math.ceil(timeout);
      return;
    }
    // Terminal: the window is over, release the subscription (the backend
    // treats a post-outcome unsubscribe as a no-op).
    this.releaseHubLearn();
    if (event.state !== "learned") return;
    const hex = String(event.payload_hex ?? "").trim();
    if (!hex) {
      this.hubState = "error";
      this.hubEvent = { state: "error", error_code: "ir_learn_no_payload" };
      return;
    }
    const timings = Number(event.duration_count) || 0;
    const carrier = Number(event.carrier_hz) || 0;
    const note = timings && carrier
      ? S.learnHubLearned(timings, formatCarrierKhz(carrier))
      : S.learnHubLearnedRaw;
    this.host._adoptLearnedPayload(hex, note);
  }

  useEmission(rec: IrEmissionRecord) {
    const hex = String(rec.payload_hex ?? "").trim();
    if (!hex) return;
    this.host._adoptLearnedPayload(
      hex,
      TOOLS_CARD_STRINGS.backup.learnHaCaptured(this.emissionDisplayName(rec)),
    );
  }


  hubLearnIsTerminal(): boolean {
    return this.hubState !== "arming" && this.hubState !== "listening";
  }

  /** Cancel an in-flight hub window (unsubscribe => backend disarms) and orphan its callbacks. */
  cancelHubLearn() {
    this.hubAttempt++;
    this.releaseHubLearn();
  }

  releaseHubLearn() {
    const cancel = this.hubCancel;
    this.hubCancel = null;
    if (cancel) {
      try { cancel(); } catch { /* socket already gone */ }
    }
  }

  startTicker() {
    if (this.ticker) return;
    this.now = Date.now();
    this.ticker = setInterval(() => this.tick(), 1000);
  }

  stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }

  /** One-second tick: drives the hub countdown and the inbox "ago" labels. */
  tick() {
    this.now = Date.now();
    if (this.view === "hub" && this.hubState === "listening" && this.hubDeadline) {
      this.secondsLeft = Math.max(
        0,
        Math.ceil((this.hubDeadline - this.now) / 1000),
      );
    }
  }

  formatCountdown(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${rest < 10 ? "0" : ""}${rest}`;
  }

  timeAgo(when: string): string {
    const S = TOOLS_CARD_STRINGS.backup;
    const ts = Date.parse(String(when ?? ""));
    if (!Number.isFinite(ts)) return "";
    const secs = Math.max(0, Math.round((this.now - ts) / 1000));
    if (secs < 5) return S.learnJustNow;
    if (secs < 60) return S.learnSecondsAgo(secs);
    const mins = Math.round(secs / 60);
    if (mins < 60) return S.learnMinutesAgo(mins);
    return S.learnHoursAgo(Math.round(mins / 60));
  }
}
