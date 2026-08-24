import { html, nothing, type TemplateResult } from "lit";
import { str } from "../remote-card-strings";
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

  const keyStyleRow = renderFormRow(
    fieldForm(
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
      { key_style: config.key_style ?? "flat" },
    ),
    "sb-opt-key-style",
  );

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

  const body = html`<div class="sb-opt-list">${themeRow}${maxWidthRow}${keyStyleRow}${backgroundRow}</div>`;

  return renderEditorExpander({
    expanded: params.expanded,
    icon: "mdi:palette",
    title: str().editor.stylingOptions,
    onToggle: params.onToggleExpanded,
    body,
  });
}
