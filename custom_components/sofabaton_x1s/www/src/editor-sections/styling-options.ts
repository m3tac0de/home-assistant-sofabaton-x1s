import { html, nothing, type TemplateResult } from "lit";
import { str } from "../remote-card-strings";
import {
  keyStyleFromConfig,
  tintedPanelsFromConfig,
} from "../remote-card-layout";
import type { HassLike, RemoteCardConfig } from "../remote-card-types";
import { renderEditorExpander } from "./expander";
import { renderFormRow, renderOptionRow } from "./option-row";

export const computeEditorFieldLabel = (schema: { name: string }): string =>
  str().editor.fieldLabels[schema.name] || schema.name;

const DEFAULT_BACKGROUND_OVERRIDE: [number, number, number] = [255, 255, 255];

/**
 * Styling Options drawer: theme, max width and the background override, as
 * divider-separated rows like the General Options drawer. Theme and max
 * width are single-field ha-forms; the background override is a switch row
 * whose color picker appears as a sub-control while it is on.
 */
export function renderStylingOptionsSection(params: {
  hass: HassLike | null;
  config: RemoteCardConfig;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Receives a partial value set; the shell owns the merge. */
  onValueChanged: (value: Record<string, unknown>) => void;
}): TemplateResult {
  const config = params.config;
  const overrideOn =
    !!params.config.use_background_override || !!params.config.background_override;

  const onFormValueChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>) => {
    ev.stopPropagation();
    params.onValueChanged(ev.detail.value);
  };

  const fieldForm = (schema: Record<string, unknown>, data: Record<string, unknown>) => html`
    <ha-form
      .hass=${params.hass}
      .schema=${[schema]}
      .data=${data}
      .computeLabel=${computeEditorFieldLabel}
      @value-changed=${onFormValueChanged}
    ></ha-form>
  `;

  const themeRow = renderFormRow(
    fieldForm({ name: "theme", selector: { theme: {} } }, { theme: config.theme || "" }),
    "sb-opt-theme",
  );

  const maxWidthRow = renderFormRow(
    fieldForm(
      {
        name: "max_width",
        selector: {
          number: { min: 230, max: 1200, step: 5, unit_of_measurement: "px" },
        },
      },
      { max_width: config.max_width ?? 360 },
    ),
    "sb-opt-max-width",
  );

  // Panels moved out of the key-style dropdown into their own switch:
  // resolve legacy `key_style: "panel"` configs through the
  // shared readers, and normalize them away on the first styling write
  // so the two settings stay independent from then on.
  const resolvedKeyStyle = keyStyleFromConfig(config);
  const panelsOn = tintedPanelsFromConfig(config);
  const legacyPanel = config.key_style === "panel";

  const onKeyStyleChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>) => {
    ev.stopPropagation();
    const value = { ...ev.detail.value };
    if (legacyPanel) value.tinted_panels = true;
    params.onValueChanged(value);
  };

  const keyStyleRow = renderFormRow(
    html`
      <ha-form
        .hass=${params.hass}
        .schema=${[
          {
            name: "key_style",
            required: true,
            selector: {
              select: {
                mode: "dropdown",
                options: [
                  { value: "flat", label: str().editor.keyStyleFlat },
                  { value: "tinted", label: str().editor.keyStyleTinted },
                  { value: "elevated", label: str().editor.keyStyleElevated },
                  { value: "glossy", label: str().editor.keyStyleGlossy },
                ],
              },
            },
          },
        ]}
        .data=${{ key_style: resolvedKeyStyle }}
        .computeLabel=${computeEditorFieldLabel}
        @value-changed=${onKeyStyleChanged}
      ></ha-form>
    `,
    "sb-opt-key-style",
  );

  const panelsRow = renderOptionRow({
    className: "sb-opt-tinted-panels",
    label: str().editor.tintedPanels,
    description: str().editor.tintedPanelsDescription,
    checked: panelsOn,
    onSet: (enabled) => {
      params.onValueChanged(
        legacyPanel
          ? { key_style: resolvedKeyStyle, tinted_panels: enabled }
          : { tinted_panels: enabled },
      );
    },
  });

  const backgroundRow = renderOptionRow({
    className: "sb-opt-background",
    label: str().editor.fieldLabels.use_background_override,
    checked: overrideOn,
    onSet: (enabled) => {
      // Turning the override on materializes a color right away (as the
      // combined form used to), so the preview changes immediately; the
      // shell's merge wipes the color again when the switch goes off.
      params.onValueChanged(
        enabled
          ? {
              use_background_override: true,
              background_override: config.background_override ?? DEFAULT_BACKGROUND_OVERRIDE,
            }
          : { use_background_override: false },
      );
    },
    sub: overrideOn
      ? html`
          <div class="sb-opt-sub">
            ${fieldForm(
              { name: "background_override", selector: { color_rgb: {} } },
              { background_override: config.background_override ?? DEFAULT_BACKGROUND_OVERRIDE },
            )}
          </div>
        `
      : nothing,
  });

  const body = html`<div class="sb-opt-list">${themeRow}${maxWidthRow}${keyStyleRow}${panelsRow}${backgroundRow}</div>`;

  return renderEditorExpander({
    expanded: params.expanded,
    icon: "mdi:palette",
    title: str().editor.stylingOptions,
    onToggle: params.onToggleExpanded,
    body,
  });
}
