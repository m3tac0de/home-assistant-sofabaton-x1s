// The icon and color grids of the "edit activity / device" dialog: the hub
// line's icons (pictures, then service logos) and, on an X2, the 12 colors.
// The host owns the dialog, its labels and the draft.

import { css, html, nothing, type TemplateResult } from "lit";
import { ENTITY_COLOR_IDS, entityColorHex } from "./entity-colors";
import { entityIconGroups, entityIconName, entityIconPath } from "./entity-icons";

const CHECK_PATH = "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z";

export function renderEntityIconPicker(params: {
  hubVersion: string | null | undefined;
  /** The draft icon id. */
  icon: number;
  /** The draft's tile color, drawn on the selected icon; null on a hub without colors. */
  color: string | null;
  /** Heading of the service logo group. */
  servicesLabel: string;
  /** Localize picture descriptions; service and brand names stay unchanged. */
  iconName: (name: string) => string;
  onPick: (icon: number) => void;
}): TemplateResult {
  const { pictures, services } = entityIconGroups(params.hubVersion);
  const button = (id: number) => {
    const selected = id === params.icon;
    const name = params.iconName(entityIconName(params.hubVersion, id));
    const classes = [
      "entity-picker-icon",
      selected ? "entity-picker-icon--selected" : "",
      selected && !params.color ? "entity-picker-icon--neutral" : "",
    ].filter(Boolean).join(" ");
    return html`<button
      type="button"
      class=${classes}
      style=${selected && params.color ? `--entity-tile-color: ${params.color}` : ""}
      title=${name}
      aria-label=${name}
      aria-pressed=${selected ? "true" : "false"}
      @click=${() => params.onPick(id)}
    ><svg viewBox="0 0 24 24" aria-hidden="true"><path d=${entityIconPath(params.hubVersion, id) ?? ""}></path></svg></button>`;
  };
  return html`
    <div class="entity-picker-grid">${pictures.map(button)}</div>
    ${services.length
      ? html`<div class="entity-picker-sub">${params.servicesLabel}</div><div class="entity-picker-grid">${services.map(button)}</div>`
      : nothing}
  `;
}

export function renderEntityColorPicker(params: {
  /** The draft palette id; 0 (none picked) shows as grey, as the app draws it. */
  colorId: number;
  colorName: (colorId: number) => string;
  onPick: (colorId: number) => void;
}): TemplateResult {
  const current = params.colorId >= 1 ? params.colorId : 1;
  return html`<div class="entity-picker-swatches" role="radiogroup">
    ${ENTITY_COLOR_IDS.map((id) => {
      const selected = id === current;
      return html`<button
        type="button"
        role="radio"
        class=${["entity-picker-swatch", selected ? "entity-picker-swatch--selected" : ""].filter(Boolean).join(" ")}
        style=${`--entity-swatch: ${entityColorHex(id)}`}
        title=${params.colorName(id)}
        aria-label=${params.colorName(id)}
        aria-checked=${selected ? "true" : "false"}
        @click=${() => params.onPick(id)}
      ><svg viewBox="0 0 24 24" aria-hidden="true"><path d=${CHECK_PATH}></path></svg></button>`;
    })}
  </div>`;
}

export const entityPickerStyles = css`
  .entity-picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 6px;
  }
  .entity-picker-icon {
    aspect-ratio: 1;
    min-width: 0;
    border: 0;
    padding: 0;
    border-radius: 11px;
    background: color-mix(in srgb, var(--primary-text-color) 7%, transparent);
    color: color-mix(in srgb, var(--primary-text-color) 82%, transparent);
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background 90ms ease;
  }
  .entity-picker-icon svg {
    width: 24px;
    height: 24px;
    fill: currentColor;
  }
  .entity-picker-icon:hover {
    background: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
  }
  .entity-picker-icon:focus-visible,
  .entity-picker-swatch:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .entity-picker-icon--selected,
  .entity-picker-icon--selected:hover {
    background: var(--entity-tile-color, #7f7f7f);
    color: #fff;
    box-shadow: 0 0 0 2px var(--card-background-color, #fff), 0 0 0 4px var(--entity-tile-color, #7f7f7f);
  }
  .entity-picker-icon--neutral,
  .entity-picker-icon--neutral:hover {
    background: color-mix(in srgb, var(--primary-color) 22%, transparent);
    color: color-mix(in srgb, var(--primary-color) 45%, var(--primary-text-color));
    box-shadow: 0 0 0 2px var(--primary-color);
  }
  .entity-picker-sub {
    margin: 12px 0 6px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--secondary-text-color);
  }
  .entity-picker-swatches {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
    gap: 8px;
  }
  .entity-picker-swatch {
    aspect-ratio: 1;
    max-width: 34px;
    border: 0;
    padding: 0;
    border-radius: 50%;
    background: var(--entity-swatch);
    color: #fff;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .entity-picker-swatch svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
    opacity: 0;
  }
  .entity-picker-swatch--selected {
    box-shadow: 0 0 0 2px var(--card-background-color, #fff), 0 0 0 4px var(--entity-swatch);
  }
  .entity-picker-swatch--selected svg {
    opacity: 1;
  }
`;
