// The icon (and X2 color) editors around the entity tile, shared by the
// tools card and the server panel, which take their wording from the same
// strings and pass it in:
//   - the Edit activity / Edit device dialog body: the tile beside the name
//     field, the picker on demand so the dialog stays the size of a rename;
//   - the Add dialogs' picker: a tile + "Change icon" toggle under the name;
//   - the tile beside a detail view's title, opening the edit dialog.

import { mdiPencil } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { ifDefined } from "lit/directives/if-defined.js";
import { entityColor, entityColorHex, entityColorsSupported } from "./entity-colors";
import { entityTile, renderEntityTile, type EntityTile, type EntityTileBadge } from "./entity-tile";
import { renderEntityColorPicker, renderEntityIconPicker } from "./entity-picker";

export type AppearanceTab = "icon" | "color";

/** What the dialog shows; null = the record carries none (drawn as icon 1,
 *  color 0). */
export interface AppearanceDraft {
  icon: number | null;
  colorId: number | null;
}

/** The Add dialogs' draft (null = the create's own default) and their
 *  picker's state; the host owns it. */
export interface AppearanceToggleState extends AppearanceDraft {
  open: boolean;
  tab: AppearanceTab;
}

export interface AppearanceLabels {
  changeIcon: string;
  changeIconAndColor: string;
  /** The Icon segment of the X2 picker. */
  icon: string;
  /** The heading over the service logos in the icon grid. */
  services: string;
  iconName: (name: string) => string;
  colorName: (colorId: number) => string;
}

/** The labels from the tools card's `backup` strings (the panel imports
 *  the same strings). Call it per render: the strings follow the language. */
export function appearanceLabelsFrom(strings: {
  changeIcon: string;
  changeIconAndColor: string;
  appearanceIcon: string;
  appearanceServices: string;
  entityIconNames: Readonly<Record<string, string>>;
  entityColorName: (colorId: number) => string;
}): AppearanceLabels {
  return {
    changeIcon: strings.changeIcon,
    changeIconAndColor: strings.changeIconAndColor,
    icon: strings.appearanceIcon,
    services: strings.appearanceServices,
    iconName: (name) => strings.entityIconNames[name] ?? name,
    colorName: (colorId) => strings.entityColorName(colorId),
  };
}

function renderPane(params: {
  hubVersion: string | null | undefined;
  icon: number;
  colorId: number;
  tab: AppearanceTab;
  labels: AppearanceLabels;
  onPick: (picked: Partial<AppearanceDraft>) => void;
}): TemplateResult {
  return params.tab === "icon"
    ? renderEntityIconPicker({
        hubVersion: params.hubVersion,
        icon: params.icon,
        color: entityColor(params.hubVersion, params.colorId),
        servicesLabel: params.labels.services,
        iconName: params.labels.iconName,
        onPick: (picked) => params.onPick({ icon: picked }),
      })
    : renderEntityColorPicker({
        colorId: params.colorId,
        colorName: params.labels.colorName,
        onPick: (picked) => params.onPick({ colorId: picked }),
      });
}

export function renderAppearanceEditor(params: {
  hubVersion: string | null | undefined;
  draft: AppearanceDraft;
  open: boolean;
  tab: AppearanceTab;
  nameField: TemplateResult;
  labels: AppearanceLabels;
  onToggle: () => void;
  onTab: (tab: AppearanceTab) => void;
  onPick: (draft: AppearanceDraft) => void;
}): TemplateResult {
  const { labels } = params;
  const version = params.hubVersion;
  const colors = entityColorsSupported(version);
  const draft = params.draft;
  const icon = draft.icon ?? 1;
  const colorId = draft.colorId ?? 0;
  const tile = entityTile(version, icon, colorId);
  const changeLabel = colors ? labels.changeIconAndColor : labels.changeIcon;
  const tab = colors ? params.tab : "icon";
  return html`
    <div class="appearance-ident">
      <button class="appearance-trigger" type="button" title=${changeLabel} aria-label=${changeLabel} aria-expanded=${params.open ? "true" : "false"} @click=${params.onToggle}>
        ${tile ? renderEntityTile(tile) : nothing}
        <span class="appearance-trigger-edit" aria-hidden="true"><ha-icon icon="mdi:pencil"></ha-icon></span>
      </button>
      <div class="appearance-name">${params.nameField}</div>
    </div>
    ${params.open
      ? html`
          ${colors
            ? html`<div class="appearance-tabs" role="tablist">
                <button role="tab" type="button" class="appearance-tab${tab === "icon" ? " active" : ""}" aria-selected=${tab === "icon" ? "true" : "false"} @click=${() => params.onTab("icon")}>
                  <ha-icon icon="mdi:shape-outline"></ha-icon><span>${labels.icon}</span>
                </button>
                <button role="tab" type="button" class="appearance-tab${tab === "color" ? " active" : ""}" aria-selected=${tab === "color" ? "true" : "false"} @click=${() => params.onTab("color")}>
                  <span class="appearance-dot" style=${`--entity-swatch: ${entityColorHex(colorId)}`}></span><span>${labels.colorName(colorId >= 1 ? colorId : 1)}</span>
                </button>
              </div>`
            : nothing}
          <div class="appearance-pane">
            ${renderPane({ hubVersion: version, icon, colorId, tab, labels, onPick: (picked) => params.onPick({ ...draft, ...picked }) })}
          </div>
        `
      : html`<button class="appearance-reveal" type="button" aria-expanded="false" @click=${params.onToggle}>
          <ha-icon icon=${colors ? "mdi:palette-outline" : "mdi:shape-outline"}></ha-icon><span>${changeLabel}</span><ha-icon icon="mdi:chevron-down"></ha-icon>
        </button>`}
  `;
}

/** The Add dialogs' picker, closed until asked for: a create without a pick
 *  writes the hub's default. Nothing on a hub line without icons. */
export function renderAppearanceToggle(params: {
  hubVersion: string | null | undefined;
  state: AppearanceToggleState;
  labels: AppearanceLabels;
  disabled?: boolean;
  onChange: (state: AppearanceToggleState) => void;
}): TemplateResult | typeof nothing {
  const { labels, state } = params;
  const version = params.hubVersion;
  const colors = entityColorsSupported(version);
  const icon = state.icon ?? 1;
  const colorId = state.colorId ?? 0;
  const tile = entityTile(version, icon, colorId);
  if (!tile) return nothing;
  const tab = colors ? state.tab : "icon";
  const set = (patch: Partial<AppearanceToggleState>) => params.onChange({ ...state, ...patch });
  return html`
    <div class="cache-dialog-appearance">
      <button class="cache-dialog-appearance-toggle" type="button" aria-expanded=${state.open ? "true" : "false"} ?disabled=${params.disabled ?? false} @click=${() => set({ open: !state.open })}>
        ${renderEntityTile(tile)}
        <span>${colors ? labels.changeIconAndColor : labels.changeIcon}</span>
        <ha-icon icon=${state.open ? "mdi:chevron-up" : "mdi:chevron-down"}></ha-icon>
      </button>
      ${state.open
        ? html`
            ${colors
              ? html`<div class="cache-dialog-appearance-tabs" role="tablist">
                  <button role="tab" type="button" class=${tab === "icon" ? "active" : ""} aria-selected=${tab === "icon" ? "true" : "false"} @click=${() => set({ tab: "icon" })}>${labels.icon}</button>
                  <button role="tab" type="button" class=${tab === "color" ? "active" : ""} aria-selected=${tab === "color" ? "true" : "false"} @click=${() => set({ tab: "color" })}>${labels.colorName(colorId >= 1 ? colorId : 1)}</button>
                </div>`
              : nothing}
            <div class="cache-dialog-appearance-pane">
              ${renderPane({ hubVersion: version, icon, colorId, tab, labels, onPick: (picked) => set(picked) })}
            </div>
          `
        : nothing}
    </div>
  `;
}

const BADGE_EDIT: EntityTileBadge = { icon: "mdi:pencil", path: mdiPencil, nudge: [0, 0] };

/** The entity's tile beside a detail view's title (the editors, a Wifi
 *  Device), with a pencil badge: it opens the edit dialog. */
export function renderDetailEntityTile(
  tile: EntityTile,
  params: { id?: string; label: string; disabled?: boolean; onClick: () => void },
): TemplateResult {
  return html`<button class="detail-entity-tile" id=${ifDefined(params.id)} type="button" title=${params.label} aria-label=${params.label} ?disabled=${params.disabled ?? false} @click=${params.onClick}>
    ${renderEntityTile(tile, { badge: BADGE_EDIT })}
  </button>`;
}

/** The edit dialog body and the detail tile. Pair with entityTileStyles and
 *  entityPickerStyles. */
export const appearanceEditorStyles = css`
  .detail-entity-tile {
    flex: 0 0 auto;
    display: inline-flex;
    border: 0;
    padding: 0;
    background: none;
    border-radius: 11px;
    cursor: pointer;
    --entity-tile-size: 36px;
  }
  .detail-entity-tile:disabled { cursor: default; }
  .detail-entity-tile:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .detail-entity-tile:hover:not(:disabled) .entity-tile { box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 35%, transparent); }
  .appearance-ident { display: flex; align-items: center; gap: 14px; }
  .appearance-name { flex: 1; min-width: 0; }
  .appearance-name > ha-input, .appearance-name > ha-textfield { display: block; width: 100%; }
  .appearance-trigger {
    position: relative;
    flex: 0 0 auto;
    display: inline-flex;
    border: 0;
    padding: 0;
    background: none;
    border-radius: 15px;
    cursor: pointer;
    --entity-tile-size: 50px;
  }
  .appearance-trigger:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .appearance-trigger-edit {
    position: absolute;
    inset-inline-end: -6px;
    bottom: -6px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--ha-card-background, var(--card-background-color));
    color: var(--secondary-text-color);
    box-shadow: 0 0 0 1px var(--divider-color);
    --mdc-icon-size: 13px;
  }
  .appearance-reveal {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    background: none;
    padding: 4px 2px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    color: color-mix(in srgb, var(--primary-color) 70%, var(--primary-text-color));
    cursor: pointer;
    --mdc-icon-size: 18px;
  }
  .appearance-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    padding: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-text-color) 7%, transparent);
  }
  .appearance-tab {
    height: 32px;
    border: 0;
    border-radius: 999px;
    background: none;
    font: inherit;
    font-size: 13px;
    color: var(--secondary-text-color);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    --mdc-icon-size: 16px;
  }
  .appearance-tab.active {
    background: var(--ha-card-background, var(--card-background-color));
    color: var(--primary-text-color);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  }
  .appearance-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--entity-swatch); }
  .appearance-pane { max-height: 232px; overflow-y: auto; padding: 5px; margin: -5px; }
`;

/** The Add dialogs' picker. Pair with entityTileStyles and entityPickerStyles. */
export const appearanceToggleStyles = css`
  .cache-dialog-appearance { display: flex; flex-direction: column; gap: 10px; }
  .cache-dialog-appearance-toggle {
    align-self: flex-start; display: inline-flex; align-items: center; gap: 10px;
    border: 0; background: none; padding: 2px 0; font: inherit; font-size: 13px; font-weight: 600;
    color: color-mix(in srgb, var(--primary-color) 70%, var(--primary-text-color)); cursor: pointer;
    --entity-tile-size: 32px; --mdc-icon-size: 18px;
  }
  .cache-dialog-appearance-toggle:disabled { cursor: default; opacity: 0.6; }
  .cache-dialog-appearance-tabs { display: grid; grid-template-columns: 1fr 1fr; padding: 3px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 7%, transparent); }
  .cache-dialog-appearance-tabs button { height: 30px; border: 0; border-radius: 999px; background: none; font: inherit; font-size: 13px; color: var(--secondary-text-color); cursor: pointer; }
  .cache-dialog-appearance-tabs button.active { background: var(--card-background-color, #fff); color: var(--primary-text-color); font-weight: 600; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
  .cache-dialog-appearance-pane { max-height: 200px; overflow-y: auto; padding: 5px; margin: -5px; }
`;
