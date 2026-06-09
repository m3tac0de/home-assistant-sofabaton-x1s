import { css, html, type TemplateResult } from "lit";
import { hubIcon } from "../shared/utils/control-panel-selectors";
import { TOOLS_CARD_STRINGS } from "../strings";

export type OperationProgressMode = "backup" | "restore" | "wifi-deploy";

export interface OperationProgressViewModel {
  mode: OperationProgressMode;
  title: string;
  message: string;
}

export const operationProgressStyles = css`
  .progress-shell {
    --op-progress-radius-lg: var(--ha-card-border-radius, 12px);
    border: 1px solid var(--divider-color);
    border-radius: calc(var(--op-progress-radius-lg) + 4px);
    padding: 18px;
    background: transparent;
    color: var(--primary-text-color);
  }
  .progress-shell[data-mode="restore"] .packet,
  .progress-shell[data-mode="wifi-deploy"] .packet {
    animation-name: opProgressForward;
  }
  .progress-stage {
    position: relative;
    display: flex;
    flex-wrap: nowrap;
    justify-content: center;
    gap: 4px;
    align-items: center;
    min-height: 110px;
    min-width: 0;
  }
  .progress-node { display: grid; justify-items: center; gap: 10px; z-index: 2; }
  .progress-disc {
    width: 76px;
    height: 76px;
    display: grid;
    place-items: center;
    border-radius: var(--op-progress-radius-lg);
    background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 88%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
  }
  .progress-node.home .progress-disc,
  .progress-node.hub .progress-disc { color: var(--primary-color); }
  .progress-disc ha-icon { --mdc-icon-size: 50px; }
  .progress-disc .progress-hub-svg { width: 60px; height: 60px; }
  .progress-node-label {
    color: var(--secondary-text-color);
    font-size: 11px;
    letter-spacing: .08em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .progress-route { position: relative; flex: 0 1 68px; min-width: 68px; height: 42px; }
  .progress-route::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    background: color-mix(in srgb, var(--primary-color) 28%, transparent);
    transform: translateY(-50%);
  }
  .packet {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--primary-color);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 14%, transparent);
    animation: opProgressReverse 1.75s cubic-bezier(.55,0,.25,1) infinite;
  }
  .packet:nth-child(2) { animation-delay: .38s; opacity: .78; transform: scale(.82); }
  .packet:nth-child(3) { animation-delay: .76s; opacity: .55; transform: scale(.68); }
  .progress-copy {
    margin-top: 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .progress-title {
    font-size: clamp(20px, 3vw, 28px);
    letter-spacing: -.03em;
    font-weight: 700;
  }
  .progress-message { color: var(--secondary-text-color); font-size: 14px; line-height: 1.5; }

  @keyframes opProgressForward {
    0% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(.55); }
    18% { opacity: 1; }
    82% { opacity: 1; }
    100% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes opProgressReverse {
    0% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(.55); }
    18% { opacity: 1; }
    82% { opacity: 1; }
    100% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); }
  }

  @media (max-width: 760px) {
    .progress-disc { width: 64px; height: 64px; }
    .progress-disc ha-icon { --mdc-icon-size: 42px; }
    .progress-disc .progress-hub-svg { width: 50px; height: 50px; }
    .progress-route { flex-basis: 52px; min-width: 52px; }
  }
`;

export function renderOperationProgress(view: OperationProgressViewModel): TemplateResult {
  return html`
    <div class="progress-shell" data-mode=${view.mode} role="status" aria-live="polite">
      <div class="progress-stage">
        <div class="progress-node home">
          <div class="progress-disc"><ha-icon icon="mdi:home-assistant"></ha-icon></div>
          <div class="progress-node-label">${TOOLS_CARD_STRINGS.progress.homeAssistant}</div>
        </div>
        <div class="progress-route" aria-hidden="true">
          <i class="packet"></i>
          <i class="packet"></i>
          <i class="packet"></i>
        </div>
        <div class="progress-node hub">
          <div class="progress-disc">${hubIcon("hero", "progress-hub-svg")}</div>
          <div class="progress-node-label">${TOOLS_CARD_STRINGS.progress.sofabatonHub}</div>
        </div>
      </div>
      <div class="progress-copy">
        <div class="progress-title">${view.title}</div>
        <div class="progress-message">${view.message}</div>
      </div>
    </div>
  `;
}
