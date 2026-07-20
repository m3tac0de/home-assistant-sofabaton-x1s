// Automation Assist row + MQTT discovery modal for the Lit card (legacy
// assist DOM from _render plus _updateAutomationAssistUI/-ModalUI, now
// rendered from the AutomationAssistController's state).

import { html, type TemplateResult } from "lit";
import type { AutomationAssistController } from "../state/automation-assist-controller";
import { str } from "../remote-card-strings";
import { CARD_VERSION } from "../remote-card-shared";
import { primaryActionRef } from "./wire";

export interface AssistParams {
  visible: boolean;
  controller: AutomationAssistController;
}

export function renderAssistRow(params: AssistParams): TemplateResult {
  return html`
    <div
      class="automationAssist"
      style=${params.visible ? "" : "display: none !important;"}
    >
      <div class="automationAssist__header">
        <div class="automationAssist__label">${str().assist.label}</div>
      </div>
      <div class="automationAssist__status">${params.controller.statusText()}</div>
    </div>
  `;
}

export function renderAssistModal(params: AssistParams): TemplateResult {
  const controller = params.controller;
  const view = controller.modalViewState();

  const onBackdropClick = (ev: Event) => {
    if (ev.target === ev.currentTarget) controller.closeMqttModal();
  };

  return html`
    <div
      class="sb-modal${view.open ? " open" : ""}"
      role="dialog"
      aria-modal="true"
      @click=${onBackdropClick}
    >
      <div class="sb-modal__dialog">
        <div class="sb-modal__header">
          <div class="sb-modal__title">${str().assist.deviceDetectedTitle}</div>
          <button
            type="button"
            class="sb-modal__close"
            aria-label=${str().assist.close}
            @click=${() => controller.closeMqttModal()}
          >
            ✕
          </button>
        </div>
        <div class="sb-modal__body">
          <div class="sb-modal__text">${view.text}</div>
        </div>
        <div class="sb-modal__actions">
          <label
            class="sb-modal__optout"
            style=${view.showActivityRow ? "" : "display: none !important;"}
          >
            <input
              type="checkbox"
              .checked=${controller.modalActivityChecked}
              @change=${(ev: Event) =>
                controller.setModalActivityChecked(
                  Boolean((ev.target as HTMLInputElement).checked),
                )}
            />
            <span>${str().assist.alsoActivityTriggers}</span>
          </label>
          <a
            class="sb-modal__link"
            href=${`https://github.com/m3tac0de/sofabaton-virtual-remote/blob/${CARD_VERSION}/docs/automation_triggers.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            ${str().assist.seeDocs}
          </a>
          <button
            type="button"
            class="automationAssist__startBtn automationAssist__mqttBtn${view.createDisabled ? " disabled" : ""}"
            .disabled=${view.createDisabled}
            style=${view.showCreate ? "" : "display: none !important;"}
            ${primaryActionRef(() => void controller.createTriggers())}
          >
            ${view.createLabel}
          </button>
          <label class="sb-modal__optout">
            <input
              type="checkbox"
              @change=${(ev: Event) => {
                if ((ev.target as HTMLInputElement).checked) {
                  controller.setModalOptOut(true);
                }
              }}
            />
            <span>${str().assist.dontShowAgain}</span>
          </label>
          <button
            type="button"
            class="automationAssist__startBtn"
            style=${view.showStart ? "" : "display: none !important;"}
            ${primaryActionRef(() => controller.setActive(true))}
          >
            ${str().assist.startCapturing}
          </button>
        </div>
      </div>
    </div>
  `;
}
