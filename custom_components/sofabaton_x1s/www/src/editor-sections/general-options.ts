import { html, nothing, type TemplateResult } from "lit";
import { str } from "../remote-card-strings";
import { KEY_CAPTURE_HELP_URL } from "../remote-card-shared";
import { LONG_PRESS_GROUPS } from "../remote-card-long-press";
import type { HassLike } from "../remote-card-types";
import { renderEditorExpander } from "./expander";
import { renderOptionRow } from "./option-row";

/**
 * The "General Options" editor section (first drawer): card-level settings
 * that are neither styling nor layout. Three rows, each a switch with a
 * description, in a fixed order:
 *   1. Key capture (Automation Assist)
 *   2. Device mode + Initial view (sofabaton_x1s only; omitted otherwise)
 *   3. Long press + the button groups it applies to
 * Sub-controls (Initial view select, long-press button list) render through
 * ha-form and only while their switch is on.
 */
export interface GeneralOptionsDeviceModeParams {
  enabled: boolean;
  /** Current select value: the "current activity" sentinel or a device id. */
  openDevice: string;
  options: Array<{ value: string; label: string }>;
  onSetEnabled: (enabled: boolean) => void;
  /** Receives the raw select value (sentinel included); the shell maps it. */
  onSetOpenDevice: (value: string) => void;
}

export interface GeneralOptionsLongPressParams {
  enabled: boolean;
  /** Selected group names, subset of LONG_PRESS_GROUPS. */
  selected: string[];
  onSetEnabled: (enabled: boolean) => void;
  onSetSelected: (selected: string[]) => void;
}

export interface GeneralOptionsSectionParams {
  hass: HassLike | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  automationAssistEnabled: boolean;
  onSetAutomationAssist: (enabled: boolean) => void;
  /** null hides the device-mode row entirely (not an x1s hub / no devices). */
  deviceMode: GeneralOptionsDeviceModeParams | null;
  longPress: GeneralOptionsLongPressParams;
}

const INITIAL_VIEW_FIELD = "open_device";
const LONG_PRESS_BUTTONS_FIELD = "long_press_buttons";

const computeSubFormLabel = (schema: { name: string }): string => {
  if (schema.name === INITIAL_VIEW_FIELD) return str().editor.initialView;
  // The long-press button list renders its own label above the (indented)
  // checkbox list; the ha-form field itself carries none.
  if (schema.name === LONG_PRESS_BUTTONS_FIELD) return "";
  return schema.name;
};

const computeSubFormHelper = (schema: { name: string }): string | undefined =>
  schema.name === INITIAL_VIEW_FIELD ? str().editor.initialViewHelper : undefined;

/** Localized label for one long-press group (reuses the layout wording). */
export function longPressGroupLabel(group: string): string {
  if (group === "volume") return str().editor.volume;
  if (group === "channel") return str().editor.channel;
  if (group === "dpad") return str().groups.dpad || group;
  return group;
}

export function renderGeneralOptionsSection(params: GeneralOptionsSectionParams): TemplateResult {
  const keyCaptureRow = renderOptionRow({
    className: "sb-opt-key-capture",
    label: str().editor.keyCapture,
    description: str().editor.keyCaptureDescription,
    checked: params.automationAssistEnabled,
    onSet: params.onSetAutomationAssist,
    link: {
      href: KEY_CAPTURE_HELP_URL,
      title: str().editor.keyCaptureLearnMore,
      ariaLabel: str().editor.keyCaptureDocsAria,
    },
  });

  const deviceMode = params.deviceMode;
  const deviceModeRow = deviceMode
    ? renderOptionRow({
        className: "sb-opt-device-mode",
        label: str().editor.enableDeviceMode,
        description: str().editor.deviceModeDescription,
        checked: deviceMode.enabled,
        onSet: deviceMode.onSetEnabled,
        sub: deviceMode.enabled
          ? html`
              <div class="sb-opt-sub">
                <ha-form
                  .hass=${params.hass}
                  .schema=${[
                    {
                      name: INITIAL_VIEW_FIELD,
                      required: true,
                      selector: {
                        select: { mode: "dropdown", options: deviceMode.options },
                      },
                    },
                  ]}
                  .data=${{ [INITIAL_VIEW_FIELD]: deviceMode.openDevice }}
                  .computeLabel=${computeSubFormLabel}
                  .computeHelper=${computeSubFormHelper}
                  @value-changed=${(ev: CustomEvent<{ value: Record<string, unknown> }>) => {
                    ev.stopPropagation();
                    deviceMode.onSetOpenDevice(
                      String(ev.detail?.value?.[INITIAL_VIEW_FIELD] ?? ""),
                    );
                  }}
                ></ha-form>
              </div>
            `
          : nothing,
      })
    : nothing;

  const longPress = params.longPress;
  const longPressRow = renderOptionRow({
    className: "sb-opt-long-press",
    label: str().editor.longPress,
    description: str().editor.longPressDescription,
    checked: longPress.enabled,
    onSet: longPress.onSetEnabled,
    sub: longPress.enabled
      ? html`
          <div class="sb-opt-sub sb-opt-sub--list">
            <div class="sb-opt-sub-label">${str().editor.longPressButtons}</div>
            <ha-form
              .hass=${params.hass}
              .schema=${[
                {
                  name: LONG_PRESS_BUTTONS_FIELD,
                  selector: {
                    select: {
                      multiple: true,
                      mode: "list",
                      options: LONG_PRESS_GROUPS.map((group) => ({
                        value: group,
                        label: longPressGroupLabel(group),
                      })),
                    },
                  },
                },
              ]}
              .data=${{ [LONG_PRESS_BUTTONS_FIELD]: longPress.selected }}
              .computeLabel=${computeSubFormLabel}
              @value-changed=${(ev: CustomEvent<{ value: Record<string, unknown> }>) => {
                ev.stopPropagation();
                const raw = ev.detail?.value?.[LONG_PRESS_BUTTONS_FIELD];
                longPress.onSetSelected(
                  Array.isArray(raw) ? raw.map((value) => String(value)) : [],
                );
              }}
            ></ha-form>
          </div>
        `
      : nothing,
  });

  const body = html`
    <div class="sb-opt-list">${keyCaptureRow}${deviceModeRow}${longPressRow}</div>
  `;

  return renderEditorExpander({
    expanded: params.expanded,
    icon: "mdi:tune",
    title: str().editor.generalOptionsTitle,
    onToggle: params.onToggleExpanded,
    body,
  });
}
