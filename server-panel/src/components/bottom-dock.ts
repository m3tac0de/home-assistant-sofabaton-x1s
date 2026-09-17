// The bottom dock (docs/internal/server-panel-state-plan.md, decision
// 11): fixed at the viewport's bottom, narrating the selected hub by the
// card's precedence: a running job with its progress line and Cancel, a
// view's one-line message, a notice a finished job left with Dismiss, a
// stopped apply with Resume and Discard, a gate, and idle with the doc
// link. The connectivity pill on the right says whether the hub and the
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
  onCancel: () => void;
  onResume: (applyId: string) => void;
  onDiscard: (applyId: string) => void;
  onKeepDraft: () => void;
  onDiscardDraft: () => void;
}): TemplateResult {
  const { model, message } = params;
  let tone = "";
  let center: TemplateResult;
  let actions: TemplateResult | typeof nothing = nothing;
  if (model.kind === "running") {
    tone = "dock--running";
    center = html`<span class="dock-status" id="dock-status">${model.text}</span>`;
    actions = model.cancellable
      ? html`<button class="small dock-action" id="dock-cancel" type="button" ?disabled=${model.cancelling} @click=${params.onCancel}>${model.cancelling ? "Cancelling…" : "Cancel"}</button>`
      : nothing;
  } else if (message) {
    tone = message.ok ? "dock--message" : "dock--error";
    center = html`<span class="dock-status" id="hubs-msg">${message.text}</span>`;
  } else if (model.kind === "notice") {
    tone = `dock--${model.notice.tone}`;
    center = html`<span class="dock-status" id="dock-status">${model.notice.label}${model.notice.detail ? html`<span class="dock-detail"> · ${model.notice.detail}</span>` : nothing}</span>`;
    actions = html`<button class="small dock-action" id="dock-dismiss" type="button" @click=${params.onDismiss}>Dismiss</button>`;
  } else if (model.kind === "apply_stopped") {
    tone = "dock--warn";
    center = html`<span class="dock-status" id="dock-status">${model.text}</span>`;
    actions = html`
      ${model.resumable ? html`<button class="small primary dock-action" id="dock-resume" type="button" @click=${() => params.onResume(model.applyId)}>Resume</button>` : nothing}
      <button class="small dock-action" id="dock-discard" type="button" @click=${() => params.onDiscard(model.applyId)}>Discard</button>`;
  } else if (model.kind === "draft_stale") {
    tone = "dock--warn";
    center = html`<span class="dock-status" id="dock-status">${model.text}</span>`;
    actions = html`
      <button class="small primary dock-action" id="dock-keep-draft" type="button" @click=${params.onKeepDraft}>Keep editing</button>
      <button class="small dock-action" id="dock-discard-draft" type="button" @click=${params.onDiscardDraft}>Discard</button>`;
  } else if (model.kind === "dirty") {
    tone = "dock--dirty";
    center = html`<span class="dock-status" id="dock-status">${model.text}</span>`;
    actions = html`<button class="small dock-action" id="dock-discard-draft" type="button" @click=${params.onDiscardDraft}>Discard</button>`;
  } else if (model.kind === "gate") {
    tone = "dock--gate";
    center = html`<span class="dock-status" id="dock-status">${model.text}</span>`;
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
