// Macro/Favorites tabs, drawer overlays, and inline rows for the Lit card
// (legacy buildMacroFavoritesSection / buildInlineDrawerRow / the drawer
// population half of _update). Drawer item buttons are cheap ha-cards and
// render declaratively; the tab buttons reuse <sb-key-button> hosts so their
// hui-button-card instances survive re-renders.

import { html, nothing, type TemplateResult } from "lit";
import { ref, type Ref } from "lit/directives/ref.js";
import {
  actionButtonModel,
  customFavoriteButtonModel,
  drawerButtonModel,
} from "../remote-card-render-models";
import { str } from "../remote-card-strings";
import type { HassLike } from "../remote-card-types";
import { primaryActionRef } from "./wire";
import "../components/sb-key-button";

export interface DrawerItemModel {
  label: string;
  commandId: number;
  deviceId: number;
  icon: string | null;
  commandType: string;
}

export interface CustomFavoriteModel {
  label: string;
  icon: string | null;
  action: Record<string, unknown> | null;
  commandId: number;
  deviceId: number;
}

export interface MacroFavoritesParams {
  hass: HassLike | null;
  visible: boolean;
  showMacrosButton: boolean;
  showFavoritesButton: boolean;
  single: boolean;
  macrosDisabled: boolean;
  favoritesDisabled: boolean;
  activeDrawer: "macros" | "favorites" | null;
  drawerUp: boolean;
  macros: Array<Record<string, unknown>>;
  favorites: Array<Record<string, unknown>>;
  customFavorites: Array<Record<string, unknown>>;
  currentActivityId: number | null;
  onToggleMacros: () => void;
  onToggleFavorites: () => void;
  onDrawerItem: (args: {
    model: DrawerItemModel;
    itemType: string;
    rawItem: Record<string, unknown>;
  }) => void;
  onCustomFavorite: (args: {
    model: CustomFavoriteModel;
    rawFavorite: Record<string, unknown>;
  }) => void;
  /** Element refs the card uses for outside-close checks and drawer math. */
  containerRef?: Ref<HTMLElement>;
  rowRef?: Ref<HTMLElement>;
  macrosOverlayRef?: Ref<HTMLElement>;
  favoritesOverlayRef?: Ref<HTMLElement>;
}

export function renderDrawerButton(
  params: MacroFavoritesParams,
  item: Record<string, unknown>,
  type: string,
): TemplateResult {
  const model = drawerButtonModel(item, type, params.currentActivityId) as DrawerItemModel;
  return html`
    <ha-card
      class="drawer-btn"
      role="button"
      tabindex="0"
      ${primaryActionRef(() => {
        if (!Number.isFinite(model.commandId) || !Number.isFinite(model.deviceId)) return;
        params.onDrawerItem({ model, itemType: type, rawItem: item });
      })}
    >
      <div class="drawer-btn__inner drawer-btn__inner--stack">
        ${model.icon
          ? html`<ha-icon class="drawer-btn__icon" icon=${model.icon}></ha-icon>`
          : nothing}
        <div class="name">${model.label}</div>
      </div>
    </ha-card>
  `;
}

export function renderCustomFavoriteButton(
  params: MacroFavoritesParams,
  favorite: Record<string, unknown>,
): TemplateResult {
  const model = customFavoriteButtonModel(favorite, params.currentActivityId) as CustomFavoriteModel;
  return html`
    <ha-card
      class="drawer-btn drawer-btn--custom"
      role="button"
      tabindex="0"
      style="grid-column: 1 / -1;"
      ${primaryActionRef(() => params.onCustomFavorite({ model, rawFavorite: favorite }))}
    >
      <div class="drawer-btn__inner drawer-btn__inner--row">
        ${model.icon
          ? html`<ha-icon class="drawer-btn__icon" icon=${model.icon}></ha-icon>`
          : nothing}
        <div class="name">${model.label}</div>
      </div>
    </ha-card>
  `;
}

function renderFavoritesItems(params: MacroFavoritesParams): unknown[] {
  return [
    ...params.customFavorites.map((fav) => renderCustomFavoriteButton(params, fav)),
    ...params.favorites.map((fav) => renderDrawerButton(params, fav, "favorites")),
  ];
}

function renderTab(
  params: MacroFavoritesParams,
  label: string,
  visible: boolean,
  active: boolean,
  disabled: boolean,
  onClick: () => void,
): TemplateResult {
  const model = actionButtonModel({ label });
  const classes = [
    "macroFavoritesButton",
    ...(active ? ["active-tab"] : []),
    ...(disabled ? ["disabled"] : []),
  ].join(" ");
  return html`
    <sb-key-button
      class=${classes}
      style=${visible ? "" : "display: none !important;"}
      .buttonConfig=${model.buttonConfig}
      .sizeVar=${"--sb-tab-font-size"}
      .hass=${params.hass}
      .onTrigger=${onClick}
    ></sb-key-button>
  `;
}

/** Direction-aware radius so the drawer "connects" to the button row. */
function rowRadiusStyle(anyOpen: boolean, up: boolean): string {
  const r = "var(--sb-group-radius)";
  return [
    `border-top-left-radius: ${anyOpen && up ? "0" : r}`,
    `border-top-right-radius: ${anyOpen && up ? "0" : r}`,
    `border-bottom-left-radius: ${anyOpen && !up ? "0" : r}`,
    `border-bottom-right-radius: ${anyOpen && !up ? "0" : r}`,
    "transition: border-radius 0.2s ease",
  ].join("; ");
}

export function renderMacroFavorites(params: MacroFavoritesParams): TemplateResult {
  const isMacro = params.activeDrawer === "macros";
  const isFav = params.activeDrawer === "favorites";
  const anyOpen = isMacro || isFav;

  const setRef = (r?: Ref<HTMLElement>) => (r ? ref(r) : nothing);

  return html`
    <div
      class="mf-container${params.drawerUp ? " drawer-up" : ""}"
      style=${params.visible ? "" : "display: none !important;"}
      ${setRef(params.containerRef)}
    >
      <div
        class="macroFavorites"
        style=${rowRadiusStyle(anyOpen, params.drawerUp)}
        ${setRef(params.rowRef)}
      >
        <div class="macroFavoritesGrid${params.single ? " single" : ""}">
          ${renderTab(
            params,
            str().card.macrosTab,
            params.showMacrosButton,
            isMacro,
            params.macrosDisabled,
            params.onToggleMacros,
          )}
          ${renderTab(
            params,
            str().card.favoritesTab,
            params.showFavoritesButton,
            isFav,
            params.favoritesDisabled,
            params.onToggleFavorites,
          )}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--macros${isMacro ? " open" : ""}"
        ${setRef(params.macrosOverlayRef)}
      >
        <div class="mf-grid">
          ${params.macros.map((macro) => renderDrawerButton(params, macro, "macros"))}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--favorites${isFav ? " open" : ""}"
        ${setRef(params.favoritesOverlayRef)}
      >
        <div class="mf-grid">${renderFavoritesItems(params)}</div>
      </div>
    </div>
  `;
}

export interface InlineRowParams {
  kind: "macros" | "favorites";
  visible: boolean;
  visibleRows: number;
  /** Rendered content items; empty shows the localized empty text. */
  items: unknown[];
  emptyText: string;
}

export function renderInlineDrawerRow(params: InlineRowParams): TemplateResult {
  return html`
    <div
      class="inline-drawer-row inline-drawer-row--${params.kind}"
      style=${params.visible ? "" : "display: none !important;"}
    >
      <div
        class="inline-drawer-row__scroller"
        style="--inline-row-visible-rows: ${params.visibleRows};"
      >
        <div class="inline-drawer-row__grid mf-grid">
          ${params.items.length
            ? params.items
            : html`
                <div class="inline-drawer-row__empty" style="grid-column: 1 / -1;">
                  ${params.emptyText}
                </div>
              `}
        </div>
      </div>
    </div>
  `;
}

export { renderFavoritesItems };
