// The HA card's full-panel progress view (`components/operation-progress.ts`)
// on the panel's palette: the server and the hub with packets flying between
// them, a title and the running step. It stands in place of a view's content
// while that view's own job runs (a backup, a restore, an editor's sync or
// delete); it is never an overlay. Mirrored, not shared (state plan decision 12).

import { css, html, type TemplateResult } from "lit";
import { mdiServerNetwork } from "@mdi/js";

import { hubIcon } from "../../../custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors";
import { TOOLS_CARD_STRINGS } from "../../../custom_components/sofabaton_x1s/www/src/strings";
import type { JobView } from "../panel-api";
import { jobProgress } from "../panel-selectors";

/** "backup" flies hub to server; "restore" (every write) flies server to hub. */
export type OperationProgressMode = "backup" | "restore";

export interface OperationProgressViewModel {
  mode: OperationProgressMode;
  title: string;
  message: string;
  id?: string;
}

export const OPERATION_PROGRESS_CSS = css`
  .progress-shell { border: 1px solid var(--sbp-line); border-radius: 16px; padding: 18px; background: transparent; color: var(--sbp-text); }
  .progress-shell[data-mode="restore"] .packet { animation-name: opProgressForward; }
  .progress-stage { position: relative; display: flex; flex-wrap: nowrap; justify-content: center; gap: 4px; align-items: center; min-height: 110px; min-width: 0; }
  .progress-node { display: grid; justify-items: center; gap: 10px; z-index: 2; }
  .progress-disc { width: 76px; height: 76px; display: grid; place-items: center; border-radius: 12px; color: var(--sbp-accent); background: color-mix(in srgb, var(--sbp-panel) 88%, transparent); border: 1px solid color-mix(in srgb, var(--sbp-line) 80%, transparent); }
  .progress-disc .mdi { width: 50px; height: 50px; }
  .progress-disc .progress-hub-svg { width: 60px; height: 60px; }
  .progress-node-label { color: var(--sbp-muted); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
  .progress-route { position: relative; flex: 0 1 68px; min-width: 52px; height: 42px; }
  .progress-route::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: color-mix(in srgb, var(--sbp-accent) 28%, transparent); transform: translateY(-50%); }
  .packet { position: absolute; width: 12px; height: 12px; border-radius: 50%; background: var(--sbp-accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--sbp-accent) 14%, transparent); animation: opProgressReverse 1.75s cubic-bezier(0.55, 0, 0.25, 1) infinite; }
  .packet:nth-child(2) { animation-delay: 0.38s; opacity: 0.78; }
  .packet:nth-child(3) { animation-delay: 0.76s; opacity: 0.55; }
  .progress-copy { margin-top: 8px; text-align: center; display: flex; flex-direction: column; gap: 6px; }
  .progress-title { font-size: clamp(20px, 3vw, 28px); letter-spacing: -0.03em; font-weight: 700; }
  .progress-message { color: var(--sbp-muted); font-size: 14px; line-height: 1.5; min-height: 21px; }
  @keyframes opProgressForward { 0% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(0.55); } 18% { opacity: 1; } 82% { opacity: 1; } 100% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); } }
  @keyframes opProgressReverse { 0% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(0.55); } 18% { opacity: 1; } 82% { opacity: 1; } 100% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); } }
  @media (prefers-reduced-motion: reduce) { .packet { animation: none; left: 50%; top: 50%; transform: translate(-50%, -50%); } }
  @container (max-width: 520px) { .progress-disc { width: 64px; height: 64px; } .progress-disc .mdi { width: 42px; height: 42px; } .progress-disc .progress-hub-svg { width: 50px; height: 50px; } }
`;

export function renderOperationProgress(view: OperationProgressViewModel): TemplateResult {
  return html`
    <div class="progress-shell" id=${view.id ?? "operation-progress"} data-mode=${view.mode} role="status" aria-live="polite">
      <div class="progress-stage">
        <div class="progress-node home"><div class="progress-disc"><svg class="mdi" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${mdiServerNetwork}></path></svg></div><div class="progress-node-label">Server</div></div>
        <div class="progress-route" aria-hidden="true"><i class="packet"></i><i class="packet"></i><i class="packet"></i></div>
        <div class="progress-node hub"><div class="progress-disc">${hubIcon("hero", "progress-hub-svg")}</div><div class="progress-node-label">${TOOLS_CARD_STRINGS.progress.sofabatonHub}</div></div>
      </div>
      <div class="progress-copy">
        <div class="progress-title">${view.title}</div>
        <div class="progress-message">${view.message}</div>
      </div>
    </div>
  `;
}

/** The running step as the card words it: the library's message with a "(n/total)" counter, the dock's own count; "" while there is none. */
export function jobStepMessage(job: JobView | null): string {
  const raw = (job?.progress as { message?: unknown } | null)?.message;
  const message = typeof raw === "string" ? raw.trim() : "";
  if (!message) return "";
  const progress = jobProgress(job);
  if (progress.indeterminate || /\d+\s*\/\s*\d+/u.test(message)) return message;
  return `${message.replace(/(…|\.+)$/u, "")} (${progress.current ?? 0}/${progress.total})`;
}
