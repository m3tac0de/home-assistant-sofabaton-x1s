import { html, type TemplateResult } from "lit";
import { str } from "../remote-card-strings";
import { KEY_CAPTURE_HELP_URL } from "../remote-card-shared";
import { renderEditorExpander } from "./expander";

/**
 * The "Automation Assist" editor section: the key-capture enable switch plus
 * the pointer to the Control Panel for Wifi Commands.
 */
export function renderCommandsEditorSection(params: {
  expanded: boolean;
  automationAssistEnabled: boolean;
  onToggleExpanded: () => void;
  onSetAutomationAssist: (enabled: boolean) => void;
}): TemplateResult {
  const onSwitchChange = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    const target = ev.target as HTMLElement & { checked?: boolean };
    params.onSetAutomationAssist(!!target.checked);
  };
  const onLabelClick = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    params.onSetAutomationAssist(!params.automationAssistEnabled);
  };

  const body = html`
    <div class="sb-commands-meta">
      <label class="sb-yaml-helper-row">
        <div class="sb-yaml-helper-drag">
          <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
        </div>
        <div class="sb-yaml-helper-main">
          <div class="sb-yaml-helper-label-wrap" @click=${onLabelClick}>
            <span class="sb-yaml-helper-label">${str().editor.keyCapture}</span>
            <a
              class="sb-yaml-helper-link"
              href=${KEY_CAPTURE_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              title=${str().editor.keyCaptureLearnMore}
              aria-label=${str().editor.keyCaptureDocsAria}
              @click=${(ev: Event) => ev.stopPropagation()}
            >
              <ha-icon icon="mdi:help-circle-outline"></ha-icon>
            </a>
          </div>
          <div class="sb-yaml-helper-desc">${str().editor.keyCaptureDescription}</div>
        </div>
        <ha-switch
          .checked=${params.automationAssistEnabled}
          @change=${onSwitchChange}
        ></ha-switch>
      </label>
    </div>
  `;

  return renderEditorExpander({
    expanded: params.expanded,
    icon: "mdi:play-box-multiple-outline",
    title: str().editor.automationAssistTitle,
    onToggle: params.onToggleExpanded,
    body,
  });
}
