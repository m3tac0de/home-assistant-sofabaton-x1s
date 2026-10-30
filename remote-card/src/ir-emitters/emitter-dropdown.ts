// The IR pill and its dropdown: which emitters send an X2 device's IR
// (docs/internal/ir-emitter-pill-plan.md, section 1; the mockup in
// artifacts/ir-emitter-pill-mockups/). Host-free and shared by the HA card
// (components/ir-emitter-pill.ts) and the server panel
// (server-panel/src/components/ir-emitter-pill.ts): the host owns the state
// (open, the read, the working and the hub's routing), measures the
// dropdown's position and passes the wording in, as appearance-editor.ts does.
//
// Icons are inline SVG paths, so the same markup renders in Home Assistant
// and in the panel. Colors come from Home Assistant's theme variables (the
// panel's palette shim defines the same ones).

import { css, html, nothing, type TemplateResult } from "lit";
import {
  mdiAccessPoint,
  mdiAccessPointNetwork,
  mdiAlertOutline,
  mdiCheck,
  mdiChevronDown,
  mdiInformationOutline,
  mdiLoading,
  mdiRemote,
  mdiSwapHorizontal,
} from "@mdi/js";
import {
  HUB_CHOICES,
  REPEATER_CHOICES,
  sameRouting,
  type EmitterRouting,
  type HubChoice,
  type RepeaterEmitters,
} from "./emitter-routing";
import {
  customHubMix,
  irEmitterNote,
  irEmitterProblems,
  irEmitterRows,
  pickedRowCount,
  pickHubEmitters,
  pickRepeaterEmitters,
  toggleEmitterRow,
  type IrEmitterProblem,
  type IrEmitterRow,
  type PairedEmitter,
} from "./emitter-rules";

/** The wording, from the tools card's `irEmitters` strings (the panel
 *  imports the same table). Pass the live table on every render. */
export interface IrEmitterLabels {
  pill: string;
  pillLabel: string;
  pillAttention: string;
  pillPending: string;
  rowAttention: string;
  title: string;
  intro: string;
  scope: string;
  checking: string;
  readKept: string;
  checkAgain: string;
  sendFrom: string;
  hub: string;
  hubSub: string;
  hubChoices: string;
  all: string;
  builtin: string;
  port1: string;
  port2: string;
  port: string;
  hubCustom: (mix: "builtin_port1" | "builtin_port2" | "ports") => string;
  hubCustomNote: string;
  repeaterNumber: (number: number) => string;
  remoteNumber: (number: number) => string;
  repeaterChoices: (name: string) => string;
  online: string;
  offline: string;
  notPaired: string;
  remoteOnNote: string;
  repeaterOffline: (name: string) => string;
  repeaterOfflineHint: string;
  notPairedTitle: (name: string) => string;
  notPairedHint: string;
  remoteOnly: (count: number) => string;
  repeaterOnly: (count: number) => string;
  noHub: string;
  noHubHint: string;
  duplicateHint: string;
  lastOneHint: string;
  undo: string;
}

export interface IrEmitterPillParams {
  /** Prefixes the element ids (`<prefix>-ir-pill`, `<prefix>-ir-pop`). */
  idPrefix: string;
  labels: IrEmitterLabels;
  /** The routing being edited (the hub's, until a pick). */
  routing: EmitterRouting;
  /** The routing on the hub: a different `routing` is a pending edit. */
  baseline: EmitterRouting;
  /** The paired remotes and repeaters from the last read; null before any. */
  paired: readonly PairedEmitter[] | null;
  open: boolean;
  /** The dropdown's inline position, measured when it opened. */
  menuStyle: string;
  /** A read runs: the rows show the last one meanwhile. */
  checking: boolean;
  /** Why the read failed, already worded; null when it did not. */
  error: string | null;
  /** Picks are off (the host is not editable). */
  disabled?: boolean;
  onToggle: (trigger: HTMLElement) => void;
  onClose: () => void;
  /** A pick: the new working routing. */
  onChange: (next: EmitterRouting) => void;
  /** Back to the hub's routing. */
  onUndo: () => void;
  /** Read again after a failed read. */
  onRetry?: () => void;
}

function svg(path: string, cls = ""): TemplateResult {
  return html`<svg class="ir-mdi ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d=${path}></path></svg>`;
}

/** The pill's own markup, a button or the read-only span of a list row. */
function pillInner(labels: IrEmitterLabels, attention: boolean, chevron: boolean): TemplateResult {
  return html`${attention ? svg(mdiAlertOutline, "ir-pill-alert") : nothing}<span class="ir-pill-text">${labels.pill}</span>${chevron ? svg(mdiChevronDown) : nothing}`;
}

/** A device row's read-only pill: no dropdown (the row opens the device);
 *  the host shows it only when the routing needs attention. */
export function renderReadOnlyIrPill(params: { labels: IrEmitterLabels; attention: boolean }): TemplateResult {
  const { labels, attention } = params;
  return html`<span
    class="ir-pill ir-pill--ro${attention ? " attention" : ""}"
    title=${attention ? labels.rowAttention : labels.pillLabel}
    aria-label=${attention ? `${labels.pillLabel}. ${labels.rowAttention}` : labels.pillLabel}
    role="img"
  >${pillInner(labels, attention, false)}</span>`;
}

/** The arrow keys walk a choice group and pick, as radio buttons do. */
function onChoiceKeydown(event: KeyboardEvent): void {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (!keys.includes(event.key)) return;
  const group = event.currentTarget as HTMLElement | null;
  if (!group) return;
  const options = [...group.querySelectorAll<HTMLButtonElement>("button[role='radio']:not(:disabled)")];
  if (!options.length) return;
  const root = group.getRootNode() as Document | ShadowRoot;
  const current = options.findIndex((option) => option === root.activeElement);
  const rtl = getComputedStyle(group).direction === "rtl";
  const forward = event.key === "ArrowDown" || event.key === (rtl ? "ArrowLeft" : "ArrowRight");
  const back = event.key === "ArrowUp" || event.key === (rtl ? "ArrowRight" : "ArrowLeft");
  const next = event.key === "Home" ? 0
    : event.key === "End" ? options.length - 1
    : forward ? (current + 1) % options.length
    : back ? (current - 1 + options.length) % options.length
    : -1;
  if (next < 0) return;
  event.preventDefault();
  options[next].focus();
  options[next].click();
}

function rowName(labels: IrEmitterLabels, row: IrEmitterRow): string {
  if (row.kind === "hub") return labels.hub;
  return row.name || (row.kind === "repeater" ? labels.repeaterNumber(row.number) : labels.remoteNumber(row.number));
}

function rowSub(labels: IrEmitterLabels, row: IrEmitterRow, routing: EmitterRouting): string {
  if (row.kind === "hub") {
    const mix = customHubMix(routing);
    return mix ? labels.hubCustom(mix) : labels.hubSub;
  }
  const number = row.kind === "repeater" ? labels.repeaterNumber(row.number) : labels.remoteNumber(row.number);
  if (row.paired === false) return `${number} · ${labels.notPaired}`;
  if (row.online === null) return number;
  return `${number} · ${row.online ? labels.online : labels.offline}`;
}

function problemLine(labels: IrEmitterLabels, problem: IrEmitterProblem): TemplateResult {
  const name = problem.kind === "offline"
    ? problem.name || labels.repeaterNumber(problem.number)
    : problem.target === "repeater" ? labels.repeaterNumber(problem.number) : labels.remoteNumber(problem.number);
  const title = problem.kind === "offline" ? labels.repeaterOffline(name) : labels.notPairedTitle(name);
  const meta = problem.kind === "offline" ? labels.repeaterOfflineHint : labels.notPairedHint;
  return html`
    <div class="ir-status warn" role="alert" data-problem=${`${problem.kind}:${problem.target}:${problem.number}`}>
      ${svg(mdiAlertOutline)}
      <div class="ir-status-copy"><span class="ir-status-title">${title}</span><span class="ir-status-meta">${meta}</span></div>
    </div>`;
}

function noteLine(labels: IrEmitterLabels, routing: EmitterRouting): TemplateResult | typeof nothing {
  const note = irEmitterNote(routing);
  if (!note) return nothing;
  const title = note === "remote_only" ? labels.remoteOnly(routing.remotes.length)
    : note === "repeater_only" ? labels.repeaterOnly(routing.repeaters.length)
    : labels.noHub;
  return html`
    <div class="ir-status idle" data-note=${note}>
      ${svg(mdiInformationOutline)}
      <div class="ir-status-copy"><span class="ir-status-title">${title}</span><span class="ir-status-meta">${labels.noHubHint}</span></div>
    </div>`;
}

function choiceGroup<T extends string>(params: {
  label: string;
  choices: readonly T[];
  current: string | null;
  names: Record<T, string>;
  disabled: boolean;
  onPick: (choice: T) => void;
  key: string;
}): TemplateResult {
  return html`
    <div class="ir-choice" role="radiogroup" aria-label=${params.label} data-choices=${params.key} @keydown=${onChoiceKeydown}>
      ${params.choices.map((choice) => html`<button
        type="button"
        role="radio"
        class="ir-option"
        data-choice=${choice}
        aria-checked=${params.current === choice ? "true" : "false"}
        ?disabled=${params.disabled}
        @click=${() => { if (params.current !== choice) params.onPick(choice); }}
      >${params.names[choice]}</button>`)}
    </div>`;
}

function renderRow(params: IrEmitterPillParams, row: IrEmitterRow, lastOne: boolean): TemplateResult {
  const { labels, routing } = params;
  const disabled = Boolean(params.disabled);
  const locked = row.picked && lastOne;
  const name = rowName(labels, row);
  const glyph = row.kind === "hub" ? mdiAccessPointNetwork : row.kind === "repeater" ? mdiAccessPoint : mdiRemote;
  const toggle = () => {
    if (disabled || locked) return;
    const next = toggleEmitterRow(routing, row);
    if (next) params.onChange(next);
  };
  const dot = row.kind !== "hub" && row.online !== null
    ? html`<i class="ir-dot${row.online && row.paired !== false ? "" : " off"}" aria-hidden="true"></i>`
    : nothing;
  let choices: TemplateResult | typeof nothing = nothing;
  if (row.picked && row.kind === "hub") {
    choices = choiceGroup<HubChoice>({
      label: labels.hubChoices,
      choices: HUB_CHOICES,
      current: routing.hub,
      names: { all: labels.all, builtin: labels.builtin, port1: labels.port1, port2: labels.port2 },
      disabled,
      key: "hub",
      onPick: (choice) => params.onChange(pickHubEmitters(routing, choice)),
    });
  } else if (row.picked && row.kind === "repeater") {
    choices = choiceGroup<RepeaterEmitters>({
      label: labels.repeaterChoices(name),
      choices: REPEATER_CHOICES,
      current: row.choice,
      names: { all: labels.all, builtin: labels.builtin, port: labels.port },
      disabled,
      key: row.key,
      onPick: (choice) => params.onChange(pickRepeaterEmitters(routing, row.number, choice)),
    });
  }
  const note = row.picked && row.kind === "hub" && routing.hub === "custom"
    ? labels.hubCustomNote
    : row.picked && row.kind === "remote" ? labels.remoteOnNote : "";
  return html`
    <div class="ir-row${row.picked ? " on" : ""}${locked ? " locked" : ""}" data-row=${row.key}>
      <button
        type="button"
        class="ir-row-head"
        role="checkbox"
        aria-checked=${row.picked ? "true" : "false"}
        aria-disabled=${disabled || locked ? "true" : "false"}
        @click=${toggle}
      >
        <span class="ir-box">${svg(mdiCheck)}</span>
        <span class="ir-glyph">${svg(glyph)}</span>
        <span class="ir-name"><span class="ir-name-title">${name}</span><span class="ir-name-sub">${dot}<span>${rowSub(labels, row, routing)}</span></span></span>
      </button>
      ${choices}
      ${note ? html`<p class="ir-row-note">${note}</p>` : nothing}
    </div>`;
}

/** The dropdown's content, without the pill and the popup frame. */
export function renderIrEmitterBody(params: IrEmitterPillParams): TemplateResult {
  const { labels, routing, paired } = params;
  const prefix = params.idPrefix;
  const problems = irEmitterProblems(routing, paired);
  const rows = irEmitterRows(routing, paired);
  const picked = pickedRowCount(routing);
  const lastOne = picked <= 1;
  const pending = !sameRouting(routing, params.baseline);
  const labelId = `${prefix}-ir-send-from`;
  return html`
    <div class="ir-main">
      <span class="ir-title">${labels.title}</span>
      <p class="ir-intro">${labels.intro}</p>
      ${params.checking
        ? html`<div class="ir-status idle brief" data-status="checking">${svg(mdiLoading, "ir-spin")}<div class="ir-status-copy"><span class="ir-status-title">${labels.checking}</span></div></div>`
        : nothing}
      ${!params.checking && params.error
        ? html`<div class="ir-status idle" data-status="error">
            ${svg(mdiInformationOutline)}
            <div class="ir-status-copy">
              <span class="ir-status-title">${params.error}</span>
              ${paired ? html`<span class="ir-status-meta">${labels.readKept}</span>` : nothing}
              ${params.onRetry ? html`<span class="ir-actions"><button class="ir-link-btn ir-retry" type="button" @click=${params.onRetry}>${labels.checkAgain}</button></span>` : nothing}
            </div>
          </div>`
        : nothing}
      ${problems.map((problem) => problemLine(labels, problem))}
      ${noteLine(labels, routing)}
    </div>
    <div class="ir-section">
      <span class="ir-label" id=${labelId}>${labels.sendFrom}</span>
      <div class="ir-rows" role="group" aria-labelledby=${labelId}>
        ${rows.map((row) => renderRow(params, row, lastOne))}
      </div>
      ${picked > 1 ? html`<p class="ir-hint" data-hint="duplicate">${labels.duplicateHint}</p>` : nothing}
      ${lastOne ? html`<p class="ir-hint" data-hint="last-one">${labels.lastOneHint}</p>` : nothing}
      <p class="ir-hint" data-hint="scope">${labels.scope}</p>
      ${pending
        ? html`<div class="ir-pending">
            ${svg(mdiSwapHorizontal)}
            <span>${labels.pillPending}</span>
            <button class="ir-link-btn ir-undo" type="button" ?disabled=${Boolean(params.disabled)} @click=${params.onUndo}>${labels.undo}</button>
          </div>`
        : nothing}
    </div>`;
}

/** The header's pill and, while open, its dropdown. */
export function renderIrEmitterPill(params: IrEmitterPillParams): TemplateResult {
  const { labels } = params;
  const prefix = params.idPrefix;
  const attention = irEmitterProblems(params.routing, params.paired).length > 0;
  const pending = !sameRouting(params.routing, params.baseline);
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !params.open) return;
    event.preventDefault();
    event.stopPropagation();
    params.onClose();
  };
  return html`
    <span class="ir-pill-wrap" @keydown=${onKeydown}>
      <button
        class="ir-pill${pending ? " pending" : ""}${attention ? " attention" : ""}"
        id="${prefix}-ir-pill"
        type="button"
        aria-haspopup="dialog"
        aria-expanded=${params.open ? "true" : "false"}
        aria-label=${attention ? `${labels.pillLabel}. ${labels.pillAttention}` : labels.pillLabel}
        title=${pending ? labels.pillPending : labels.pillLabel}
        @click=${(event: Event) => params.onToggle(event.currentTarget as HTMLElement)}
      >${pillInner(labels, attention, true)}</button>
      ${params.open
        ? html`
            <button class="ir-backdrop" type="button" tabindex="-1" aria-hidden="true" @click=${params.onClose} @wheel=${(event: Event) => event.preventDefault()}></button>
            <div class="ir-pop" id="${prefix}-ir-pop" role="dialog" aria-label=${labels.title} style=${params.menuStyle}>
              ${renderIrEmitterBody(params)}
            </div>`
        : nothing}
    </span>`;
}

/** The pill, the read-only pill and the dropdown. Theme variables only, with
 *  fallbacks; every control sets its own border, padding and background so
 *  a host's base button rules (the panel's) do not leak in. */
export const irEmitterStyles = css`
  .ir-pill, .ir-pop {
    --ir-line: var(--divider-color, rgba(0, 0, 0, 0.12));
    --ir-text: var(--primary-text-color, #212121);
    --ir-muted: var(--secondary-text-color, #727272);
    --ir-surface: var(--ha-card-background, var(--card-background-color, #fff));
    --ir-accent: var(--primary-color, #03a9f4);
    --ir-accent-text: var(--sb-accent-text, color-mix(in srgb, var(--primary-color, #03a9f4) 60%, var(--primary-text-color, #212121)));
    --ir-warn: var(--warning-color, #f59e0b);
    --ir-ok: var(--success-color, #43a047);
    --ir-on-accent: var(--text-primary-color, #fff);
  }
  /* The card measures an opaque popup surface for glass themes
     (--sb-popup-surface, theme-polarity.ts); elsewhere the card's surface. */
  .ir-pop { --ir-pop-surface: var(--sb-popup-surface, var(--ir-surface)); }
  .ir-mdi { width: 13px; height: 13px; flex: 0 0 auto; display: block; }
  .ir-pill-wrap { display: inline-flex; align-self: center; flex: 0 0 auto; }
  .ir-pill {
    display: inline-flex; align-items: center; align-self: center; gap: 3px; flex: 0 0 auto;
    margin: 0; border-radius: 999px; padding: 3px 5px 3px 9px; padding-inline: 9px 5px;
    font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.4px; line-height: 1.25;
    border: 1px solid var(--ir-line); color: var(--ir-muted); background: var(--ir-surface);
    white-space: nowrap; cursor: pointer; opacity: 1;
  }
  .ir-pill--ro { padding-inline: 9px; cursor: default; }
  .ir-pill.pending { border-style: dashed; }
  .ir-pill.attention {
    border-color: color-mix(in srgb, var(--ir-warn) 60%, var(--ir-line));
    background: color-mix(in srgb, var(--ir-warn) 14%, var(--ir-surface));
    color: var(--ir-text);
  }
  .ir-pill .ir-pill-alert { color: var(--ir-warn); margin-inline-start: -3px; }
  button.ir-pill:hover { border-color: color-mix(in srgb, var(--ir-accent) 60%, var(--ir-line)); }
  button.ir-pill.attention:hover { border-color: color-mix(in srgb, var(--ir-warn) 85%, var(--ir-text)); }
  button.ir-pill:focus-visible { outline: 2px solid var(--ir-accent); outline-offset: 2px; }
  button.ir-pill[aria-expanded="true"] { box-shadow: 0 0 0 3px color-mix(in srgb, var(--ir-accent) 24%, transparent); }
  .ir-backdrop { position: fixed; inset: 0; z-index: 8; border: 0; border-radius: 0; padding: 0; margin: 0; background: transparent; cursor: default; }
  .ir-backdrop:hover { border: 0; }
  .ir-pop {
    z-index: 9; box-sizing: border-box; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior: contain;
    border: 1px solid var(--ir-line); border-radius: var(--tools-radius-sm, 12px); background: var(--ir-pop-surface);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22), 0 2px 6px rgba(0, 0, 0, 0.1);
    color: var(--ir-text); font-size: 12.5px; font-weight: 400; letter-spacing: normal; line-height: 1.45;
    text-align: start; text-transform: none; white-space: normal;
  }
  .ir-pop button { font: inherit; letter-spacing: normal; text-transform: none; }
  .ir-main { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; }
  .ir-title { font-size: 13px; font-weight: 700; }
  .ir-intro { margin: 0; color: var(--ir-muted); overflow-wrap: anywhere; }
  .ir-section { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid var(--ir-line); }
  .ir-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ir-muted); }
  .ir-hint { margin: 0; font-size: 12px; color: var(--ir-muted); }
  .ir-status { display: flex; gap: 8px; padding: 8px 10px; border-radius: 9px; background: color-mix(in srgb, var(--ir-text) 6%, transparent); }
  .ir-status > .ir-mdi { width: 17px; height: 17px; margin-top: 1px; color: var(--ir-muted); }
  .ir-status.warn { background: color-mix(in srgb, var(--ir-warn) 14%, transparent); }
  .ir-status.warn > .ir-mdi { color: var(--ir-warn); }
  .ir-status.brief { padding: 0 2px; background: transparent; }
  .ir-status-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow-wrap: anywhere; }
  .ir-status-title { font-weight: 500; }
  .ir-status.warn .ir-status-title { font-weight: 700; }
  .ir-status-meta { font-size: 12px; color: var(--ir-muted); }
  .ir-actions { display: flex; flex-wrap: wrap; gap: 8px 12px; margin-top: 2px; }
  .ir-link-btn {
    border: 0; border-radius: 0; margin: 0; padding: 0; background: none; color: var(--ir-accent-text);
    font-size: 12px; font-weight: 500; text-decoration: underline; text-underline-offset: 2px; cursor: pointer;
  }
  .ir-link-btn:hover { border: 0; color: var(--ir-text); }
  .ir-link-btn:disabled { opacity: 0.45; cursor: default; }
  .ir-link-btn:focus-visible { outline: 2px solid var(--ir-accent); outline-offset: 2px; }
  .ir-rows { display: flex; flex-direction: column; border: 1px solid var(--ir-line); border-radius: 10px; overflow: hidden; }
  .ir-row { display: flex; flex-direction: column; gap: 8px; padding: 9px 10px; }
  .ir-row + .ir-row { border-top: 1px solid var(--ir-line); }
  .ir-row.on { background: color-mix(in srgb, var(--ir-accent) 6%, transparent); }
  .ir-row-head {
    display: flex; align-items: center; gap: 9px; width: 100%; min-width: 0; margin: 0;
    border: 0; border-radius: 7px; padding: 0; background: none; color: var(--ir-text); text-align: start; cursor: pointer; opacity: 1;
  }
  .ir-row-head:hover { border: 0; }
  .ir-row-head:hover:not([aria-disabled="true"]) .ir-box { border-color: var(--ir-accent); }
  .ir-row-head:hover:not([aria-disabled="true"]) .ir-glyph { background: color-mix(in srgb, var(--ir-accent) 18%, transparent); }
  .ir-row-head[aria-disabled="true"] { cursor: default; }
  .ir-row-head:focus-visible { outline: 2px solid var(--ir-accent); outline-offset: 2px; }
  .ir-box {
    width: 18px; height: 18px; border-radius: 5px; border: 2px solid var(--ir-muted); box-sizing: border-box;
    display: grid; place-items: center; flex: 0 0 auto; color: var(--ir-on-accent);
  }
  .ir-box .ir-mdi { width: 14px; height: 14px; opacity: 0; }
  .ir-row.on .ir-box { background: var(--ir-accent); border-color: var(--ir-accent); }
  .ir-row.on .ir-box .ir-mdi { opacity: 1; }
  .ir-row.locked .ir-box { opacity: 0.55; }
  .ir-glyph { width: 26px; height: 26px; border-radius: 8px; background: color-mix(in srgb, var(--ir-text) 11%, transparent); display: grid; place-items: center; flex: 0 0 auto; color: var(--ir-text); }
  .ir-glyph .ir-mdi { width: 16px; height: 16px; }
  .ir-name { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
  .ir-name-title { font-size: 12.5px; font-weight: 700; overflow-wrap: anywhere; }
  .ir-name-sub { font-size: 11.5px; color: var(--ir-muted); display: inline-flex; align-items: center; gap: 5px; min-width: 0; overflow-wrap: anywhere; }
  .ir-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ir-ok); flex: 0 0 auto; }
  .ir-dot.off { background: var(--ir-muted); opacity: 0.6; }
  .ir-choice {
    display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; padding: 3px; border-radius: 9px;
    background: color-mix(in srgb, var(--ir-text) 6%, transparent); margin-inline-start: 27px;
  }
  .ir-option {
    display: flex; align-items: center; justify-content: center; min-width: 0; margin: 0; padding: 5px 4px;
    border: 0; border-radius: 7px; background: transparent; color: var(--ir-muted);
    font-size: 11.5px; font-weight: 700; line-height: 1.25; text-align: center; white-space: normal; cursor: pointer; opacity: 1;
  }
  .ir-option:hover:not(:disabled) { border: 0; color: var(--ir-text); background: color-mix(in srgb, var(--ir-text) 6%, transparent); }
  .ir-option[aria-checked="true"], .ir-option[aria-checked="true"]:hover:not(:disabled) { background: var(--ir-pop-surface); color: var(--ir-text); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16); }
  .ir-option:disabled { opacity: 0.45; cursor: default; }
  .ir-option:focus-visible { outline: 2px solid var(--ir-accent); outline-offset: 1px; }
  .ir-row-note { margin: 0; margin-inline-start: 27px; font-size: 11.5px; color: var(--ir-muted); }
  .ir-pending {
    display: flex; align-items: flex-start; gap: 7px; padding: 8px 10px; border-radius: 9px; font-size: 12px;
    border: 1px dashed color-mix(in srgb, var(--ir-accent) 50%, var(--ir-line));
    background: color-mix(in srgb, var(--ir-accent) 10%, transparent);
  }
  .ir-pending > .ir-mdi { width: 16px; height: 16px; margin-top: 1px; color: var(--ir-accent-text); }
  .ir-pending .ir-link-btn { margin-inline-start: auto; align-self: center; }
  .ir-spin { animation: ir-spin 0.9s linear infinite; }
  @keyframes ir-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .ir-spin { animation: none; } }
`;
