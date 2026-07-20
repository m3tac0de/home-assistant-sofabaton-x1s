import { html, type TemplateResult } from "lit";
import { str } from "../remote-card-strings";
import type { HassLike, RemoteCardConfig } from "../remote-card-types";
import { renderEditorExpander } from "./expander";

export const computeEditorFieldLabel = (schema: { name: string }): string =>
  str().editor.fieldLabels[schema.name] || schema.name;

/** Theme / max-width / background-override ha-form inside its expander. */
export function renderStylingOptionsSection(params: {
  hass: HassLike | null;
  config: RemoteCardConfig;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Receives ha-form's partial value set; the shell owns the merge. */
  onValueChanged: (value: Record<string, unknown>) => void;
}): TemplateResult {
  const config = params.config;
  const showColorPicker =
    params.config.use_background_override || !!params.config.background_override;

  const schema = [
    { name: "theme", selector: { theme: {} } },
    {
      name: "max_width",
      selector: {
        number: {
          min: 230,
          max: 1200,
          step: 5,
          unit_of_measurement: "px",
        },
      },
    },
    { name: "use_background_override", selector: { boolean: {} } },
    ...(showColorPicker
      ? [{ name: "background_override", selector: { color_rgb: {} } }]
      : []),
  ];
  const data = {
    theme: config.theme || "",
    max_width: config.max_width ?? 360,
    use_background_override:
      config.use_background_override ?? !!config.background_override,
    background_override: config.background_override ?? [255, 255, 255],
  };

  const onValueChanged = (ev: CustomEvent<{ value: Record<string, unknown> }>) => {
    ev.stopPropagation();
    params.onValueChanged(ev.detail.value);
  };

  const body = html`
    <div class="sb-styling-card">
      <ha-form
        .hass=${params.hass}
        .schema=${schema}
        .data=${data}
        .computeLabel=${computeEditorFieldLabel}
        @value-changed=${onValueChanged}
      ></ha-form>
    </div>
  `;

  return renderEditorExpander({
    expanded: params.expanded,
    icon: "mdi:palette",
    title: str().editor.stylingOptions,
    onToggle: params.onToggleExpanded,
    body,
  });
}
