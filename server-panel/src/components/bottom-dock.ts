// The bottom dock (docs/internal/server-panel-state-plan.md, decision
// 11): fixed at the viewport's bottom, narrating the selected hub by the
// card's precedence: a running job with its progress line, a view's
// one-line message, a notice a finished job left, a stopped apply with
// Resume and Discard, a gate, and idle with the doc link. One row, always:
// the text is cut with an ellipsis and carries the whole of it in its
// title. No Cancel and no Dismiss button (2026-09-26, as on the HA card):
// a sticky notice, the one that does not expire, goes on a click on its
// text. The connectivity pill on the right says whether the hub and the
// app are connected; a press on the physical remote sweeps a band across
// the dock, keyed on the press so every fresh one restarts it.

import { html, nothing, type TemplateResult } from "lit";
import { keyed } from "lit/directives/keyed.js";

import type { Connectivity, DockModel } from "../panel-selectors";
import type { PressEvent } from "../panel-store";

export interface DockLink {
  href: string;
  label: string;
}

export function renderBottomDock(params: {
  model: DockModel;
  message: { text: string; ok: boolean } | null;
  connectivity: Connectivity;
  hasHub: boolean;
  press: PressEvent | null;
  docLink: DockLink | null;
  onDismiss: () => void;
  onResume: (applyId: string) => void;
  onDiscard: (applyId: string) => void;
  onKeepDraft: () => void;
  onDiscardDraft: () => void;
}): TemplateResult {
  const { model, message } = params;
  let tone = "";
  let center: TemplateResult;
  let actions: TemplateResult | typeof nothing = nothing;
  // The one-line status, with the whole text in its title for when the row cuts it.
  const status = (text: string, id = "dock-status") => html`<span class="dock-status" id=${id} title=${text}>${text}</span>`;
  if (model.kind === "running") {
    tone = "dock--running";
    center = status(model.text);
  } else if (message) {
    tone = message.ok ? "dock--message" : "dock--error";
    center = status(message.text, "hubs-msg");
  } else if (model.kind === "notice") {
    const notice = model.notice;
    tone = `dock--${notice.tone}`;
    const full = notice.detail ? `${notice.label} · ${notice.detail}` : notice.label;
    const body = html`${notice.label}${notice.detail ? html`<span class="dock-detail"> · ${notice.detail}</span>` : nothing}`;
    center = notice.sticky
      ? html`<span class="dock-status is-dismissable" id="dock-status" role="button" tabindex="0" title=${`${full} (click to dismiss)`}
          @click=${params.onDismiss}
          @keydown=${(event: KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              params.onDismiss();
            }
          }}>${body}</span>`
      : html`<span class="dock-status" id="dock-status" title=${full}>${body}</span>`;
  } else if (model.kind === "apply_stopped") {
    tone = "dock--warn";
    center = status(model.text);
    actions = html`
      ${model.resumable ? html`<button class="small primary dock-action" id="dock-resume" type="button" @click=${() => params.onResume(model.applyId)}>Resume</button>` : nothing}
      <button class="small dock-action" id="dock-discard" type="button" @click=${() => params.onDiscard(model.applyId)}>Discard</button>`;
  } else if (model.kind === "draft_stale") {
    tone = "dock--warn";
    center = status(model.text);
    actions = html`
      <button class="small primary dock-action" id="dock-keep-draft" type="button" @click=${params.onKeepDraft}>Keep editing</button>
      <button class="small dock-action" id="dock-discard-draft" type="button" @click=${params.onDiscardDraft}>Discard</button>`;
  } else if (model.kind === "dirty") {
    tone = "dock--dirty";
    center = status(model.text);
    actions = html`<button class="small dock-action" id="dock-discard-draft" type="button" @click=${params.onDiscardDraft}>Discard</button>`;
  } else if (model.kind === "unsaved_backup" || model.kind === "unsynced_view") {
    tone = "dock--dirty";
    center = status(model.text);
  } else if (model.kind === "gate") {
    tone = "dock--gate";
    center = status(model.text);
  } else if (params.docLink) {
    center = html`<a class="dock-link" id="dock-link" href=${params.docLink.href} target="_blank" rel="noreferrer noopener">${params.docLink.label}</a>`;
  } else {
    center = html``;
  }
  const progress = model.kind === "running" ? model.progress : null;
  const press = params.press;
  return html`
    <footer class="dock ${tone}" id="bottom-dock">
      <div class="dock-inner">
        ${progress
          ? html`<div class="dock-progress" id="dock-progress" data-indeterminate=${progress.indeterminate ? "true" : "false"} style=${progress.indeterminate || progress.percent == null ? "width: 35%" : `width: ${progress.percent}%`}></div>`
          : nothing}
        ${press
          ? keyed(press.at, html`<div class="dock-flash" id="dock-flash" data-seq=${press.seq} title=${`${press.pressType} press${press.label ? `: ${press.label}` : ""}`} aria-hidden="true"></div>`)
          : nothing}
        <div class="dock-center" role="status" aria-live="polite">${center}</div>
        <div class="dock-right">
          ${actions !== nothing ? html`<div class="dock-actions">${actions}</div>` : nothing}
          ${params.hasHub
            ? html`<div class="dock-pill-pair" id="dock-pill" role="group" aria-label="connectivity">
                <span class="dock-pill-half ${params.connectivity.hub ? "on" : "off"}" title=${params.connectivity.hub ? "hub connected" : "hub not connected"}>Hub</span>
                <span class="dock-pill-half ${params.connectivity.app ? "on" : "off"}" title=${params.connectivity.app ? "the Sofabaton app is connected" : "the app is not connected"}>App</span>
              </div>`
            : nothing}
        </div>
      </div>
    </footer>
  `;
}
