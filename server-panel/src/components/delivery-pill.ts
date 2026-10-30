// The delivery pill of a server Wifi Device: the HA card's
// components/delivery-pill.ts ("layout A"), mirrored in panel style (L-A20:
// the panel takes the card's pure helpers and strings, never its templates
// or CSS). In the detail header the HTTP / MQTT pill is a button whose
// dropdown says how button presses reach the server, tests it, and says what
// is wrong when presses don't arrive; a roster row shows a read-only pill
// (the row opens the device) that still warns. The host view owns the state
// (open, the test job) and the wording; this renders what it is handed.
// There is no method switch: the server cannot change a deployed device's
// transport.

import { css, html, nothing, type TemplateResult } from "lit";
import { mdiAlertOutline, mdiCheckCircle, mdiChevronDown, mdiHelpCircleOutline, mdiInformationOutline, mdiLoading } from "@mdi/js";

import { TOOLS_CARD_STRINGS } from "../../../custom_components/sofabaton_x1s/www/src/strings";

const D = TOOLS_CARD_STRINGS.wifiDelivery;
const W = TOOLS_CARD_STRINGS.wifiCommands;

export type PillTransport = "http" | "mqtt";

/** What the dropdown's result block shows. `kind` lands in `data-status`. */
export interface DeliveryStatusView {
  kind: "testing" | "delivered" | "not_delivered" | "not_sent" | "untested" | "not_on_hub" | "stale";
  tone: "ok" | "warn" | "idle";
  title: string;
  meta?: string;
  /** One line only: a broker problem above it already says why. */
  brief?: boolean;
}

export interface DeliveryPillParams {
  /** Prefixes the element ids (`<prefix>-delivery-pill`, ...). */
  idPrefix: string;
  transport: PillTransport;
  attention: boolean;
  open: boolean;
  /** The dropdown's inline position, measured when it opened. */
  menuStyle: string;
  heading: string;
  /** What the hub calls (the listener or the broker); "" leaves the line out. */
  path: string;
  test: { label: string; disabled: boolean; onClick: () => void };
  /** The server's broker connection is down under an mqtt device. */
  problem: { text: string; action?: { label: string; onClick: () => void } } | null;
  status: DeliveryStatusView | null;
  /** A test that could not run: the reason under the card's line. */
  error: string | null;
  onToggle: (trigger: HTMLElement) => void;
  onClose: () => void;
}

const transportName = (transport: PillTransport): string => (transport === "mqtt" ? "MQTT" : "HTTP");

function icon(path: string, cls = ""): TemplateResult {
  return html`<svg class="mdi ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${path}></path></svg>`;
}

export const DELIVERY_PILL_CSS = css`
  .transport-pill { display: inline-flex; align-items: center; align-self: center; gap: 3px; border-radius: 999px; padding: 3px 9px; font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.4px; line-height: 1.25; border: 1px solid var(--sbp-line); color: var(--sbp-muted); background: var(--sbp-panel); white-space: nowrap; flex: 0 0 auto; }
  .transport-pill.mqtt { border-color: color-mix(in srgb, var(--sbp-accent) 40%, var(--sbp-line)); color: var(--sbp-accent); }
  .transport-pill.attention { border-color: color-mix(in srgb, var(--sbp-warn) 60%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-warn) 14%, var(--sbp-panel)); color: var(--sbp-text); }
  .transport-pill .mdi { width: 13px; height: 13px; flex: 0 0 auto; }
  .transport-pill .delivery-pill-alert { color: var(--sbp-warn); margin-inline-start: -3px; }
  button.delivery-pill { padding-inline-end: 5px; cursor: pointer; }
  button.delivery-pill:hover { border-color: color-mix(in srgb, var(--sbp-accent) 60%, var(--sbp-line)); }
  button.delivery-pill:focus-visible { outline: 2px solid var(--sbp-accent); outline-offset: 2px; }
  button.delivery-pill[aria-expanded="true"] { box-shadow: 0 0 0 3px rgba(var(--sbp-accent-rgb), 0.24); }
  .delivery-pill-wrap { display: inline-flex; align-self: center; flex: 0 0 auto; }
  .delivery-backdrop { position: fixed; inset: 0; z-index: 8; border: 0; border-radius: 0; padding: 0; margin: 0; background: transparent; cursor: default; }
  .delivery-backdrop:hover { border: 0; }
  .delivery-pop { z-index: 9; box-sizing: border-box; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--sbp-line); border-radius: 12px; background: var(--sbp-panel); box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.1); color: var(--sbp-text); font-size: 12.5px; line-height: 1.45; text-align: start; white-space: normal; -webkit-user-select: text; user-select: text; }
  .delivery-main { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; }
  .delivery-head { display: flex; align-items: center; gap: 10px; }
  .delivery-title { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; }
  .delivery-path { margin: 0; color: var(--sbp-muted); overflow-wrap: anywhere; }
  .delivery-status { display: flex; gap: 8px; padding: 8px 10px; border-radius: 9px; background: color-mix(in srgb, var(--sbp-text) 6%, transparent); }
  .delivery-status > .mdi { width: 17px; height: 17px; flex: 0 0 auto; color: var(--sbp-muted); }
  .delivery-status.ok { background: color-mix(in srgb, var(--sbp-ok) 13%, transparent); }
  .delivery-status.ok > .mdi { color: var(--sbp-ok); }
  .delivery-status.warn { background: color-mix(in srgb, var(--sbp-warn) 14%, transparent); }
  .delivery-status.warn > .mdi { color: var(--sbp-warn); }
  .delivery-status.brief { padding: 0 2px; background: transparent; }
  .delivery-status-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
  .delivery-status-title { font-weight: 500; }
  .delivery-status.warn:not(.brief) .delivery-status-title { font-weight: 700; }
  /* The broker problem is the server's whole sentence, not a short title. */
  .delivery-status.problem .delivery-status-title { font-weight: 500; }
  .delivery-status-meta { font-size: 12px; color: var(--sbp-muted); }
  .delivery-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 3px; }
  .delivery-btn { border: 1px solid var(--sbp-line); border-radius: 9px; padding: 5px 10px; background: transparent; color: var(--sbp-text); font: inherit; font-size: 12px; font-weight: 700; white-space: nowrap; cursor: pointer; }
  .delivery-btn.primary { border-color: var(--sbp-accent); background: var(--sbp-accent); color: #fff; }
  .delivery-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
  .delivery-btn:disabled { opacity: 0.45; cursor: default; }
  .delivery-error { display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--sbp-err); }
  .delivery-error-detail { color: var(--sbp-muted); }
  .delivery-spin { animation: delivery-spin 0.9s linear infinite; }
  @keyframes delivery-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .delivery-spin { animation: none; } }
`;

/** The read-only pill of a roster row: no dropdown (the row opens the device), but it still warns. */
export function renderReadOnlyDeliveryPill(params: { transport: PillTransport; attention: boolean }): TemplateResult {
  return html`<span class="transport-pill ${params.transport}${params.attention ? " attention" : ""}"
    title=${params.attention ? D.pillAttention : W.transportPillDeployedTitle}
  >${params.attention ? icon(mdiAlertOutline, "delivery-pill-alert") : nothing}${transportName(params.transport)}</span>`;
}

const STATUS_ICONS: Record<DeliveryStatusView["kind"], string> = {
  testing: mdiLoading,
  delivered: mdiCheckCircle,
  not_delivered: mdiAlertOutline,
  not_sent: mdiAlertOutline,
  untested: mdiHelpCircleOutline,
  not_on_hub: mdiInformationOutline,
  stale: mdiInformationOutline,
};

function renderStatus(prefix: string, status: DeliveryStatusView): TemplateResult {
  const brief = Boolean(status.brief);
  return html`
    <div class="delivery-status ${status.tone}${brief ? " brief" : ""}" id="${prefix}-delivery-status" data-status=${status.kind}
      role=${status.tone === "warn" && !brief ? "alert" : nothing}>
      ${icon(STATUS_ICONS[status.kind], status.kind === "testing" ? "delivery-spin" : "")}
      <div class="delivery-status-copy">
        <span class="delivery-status-title">${status.title}</span>
        ${status.meta && !brief ? html`<span class="delivery-status-meta">${status.meta}</span>` : nothing}
      </div>
    </div>`;
}

function renderProblem(prefix: string, problem: NonNullable<DeliveryPillParams["problem"]>): TemplateResult {
  return html`
    <div class="delivery-status warn problem" id="${prefix}-delivery-broker" role="alert">
      ${icon(mdiAlertOutline)}
      <div class="delivery-status-copy">
        <span class="delivery-status-title">${problem.text}</span>
        ${problem.action
          ? html`<span class="delivery-actions"><button class="delivery-btn primary" id="${prefix}-delivery-broker-settings" type="button" @click=${problem.action.onClick}>${problem.action.label}</button></span>`
          : nothing}
      </div>
    </div>`;
}

/** The detail header's pill and, while open, its dropdown. */
export function renderDeliveryPill(params: DeliveryPillParams): TemplateResult {
  const prefix = params.idPrefix;
  const name = transportName(params.transport);
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !params.open) return;
    event.preventDefault();
    event.stopPropagation();
    params.onClose();
  };
  return html`
    <span class="delivery-pill-wrap" @keydown=${onKeydown}>
      <button
        class="transport-pill delivery-pill ${params.transport}${params.attention ? " attention" : ""}"
        id="${prefix}-delivery-pill"
        type="button"
        aria-haspopup="dialog"
        aria-expanded=${params.open ? "true" : "false"}
        aria-label=${params.attention ? `${D.pillLabel(name)}. ${D.pillAttention}` : D.pillLabel(name)}
        title=${W.transportPillDeployedTitle}
        @click=${(event: Event) => params.onToggle(event.currentTarget as HTMLElement)}
      >${params.attention ? icon(mdiAlertOutline, "delivery-pill-alert") : nothing}<span>${name}</span>${icon(mdiChevronDown)}</button>
      ${params.open
        ? html`
            <button class="delivery-backdrop" type="button" tabindex="-1" aria-hidden="true" @click=${params.onClose} @wheel=${(event: Event) => event.preventDefault()}></button>
            <div class="delivery-pop" id="${prefix}-delivery" role="dialog" aria-label=${params.heading} style=${params.menuStyle}>
              <div class="delivery-main">
                <div class="delivery-head">
                  <span class="delivery-title">${params.heading}</span>
                  <button class="delivery-btn" id="${prefix}-test-delivery" type="button" ?disabled=${params.test.disabled} @click=${params.test.onClick}>${params.test.label}</button>
                </div>
                ${params.path ? html`<p class="delivery-path" id="${prefix}-delivery-path">${params.path}</p>` : nothing}
                ${params.problem ? renderProblem(prefix, params.problem) : nothing}
                ${params.status ? renderStatus(prefix, params.status) : nothing}
                ${params.error
                  ? html`<div class="delivery-error" id="${prefix}-delivery-error" role="alert"><span>${D.testFailed}</span>${params.error !== D.testFailed ? html`<span class="delivery-error-detail">${params.error}</span>` : nothing}</div>`
                  : nothing}
              </div>
            </div>`
        : nothing}
    </span>`;
}
