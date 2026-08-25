// Macro/Favorites tabs, drawer overlays, and inline rows for the Lit card
// (legacy buildMacroFavoritesSection / buildInlineDrawerRow / the drawer
// population half of _update). Drawer item buttons are cheap ha-cards and
// render declaratively; tabs reuse lightweight <sb-key-button> hosts.

import { html, nothing, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { ref, type Ref } from "lit/directives/ref.js";
import {
  customFavoriteButtonModel,
  drawerButtonModel,
} from "../remote-card-render-models";
import { str } from "../remote-card-strings";
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
  renderMacrosContent: boolean;
  renderFavoritesContent: boolean;
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

function itemKey(item: Record<string, unknown>, type: string): string {
  const commandId = item.command_id ?? item.id ?? "";
  const deviceId = item.device_id ?? item.device ?? "";
  const name = item.name ?? "";
  const action = item.action ? JSON.stringify(item.action) : "";
  return `${type}:${String(deviceId)}:${String(commandId)}:${String(name)}:${action}`;
}

function withUniqueKeys<T extends { kind: string; item: Record<string, unknown> }>(
  entries: T[],
): Array<T & { key: string }> {
  const occurrences = new Map<string, number>();
  return entries.map((entry) => {
    const base = itemKey(entry.item, entry.kind);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return { ...entry, key: `${base}#${occurrence}` };
  });
}

export function renderDrawerItems(
  params: MacroFavoritesParams,
  items: Array<Record<string, unknown>>,
  type: string,
): TemplateResult {
  const entries = withUniqueKeys(items.map((item) => ({ kind: type, item })));
  return html`${repeat(
    entries,
    (entry) => entry.key,
    (entry) => renderDrawerButton(params, entry.item, type),
  )}`;
}

function renderFavoritesItems(params: MacroFavoritesParams): TemplateResult {
  const items = withUniqueKeys([
    ...params.customFavorites.map((item) => ({ kind: "custom", item })),
    ...params.favorites.map((item) => ({ kind: "favorite", item })),
  ]);
  return html`${repeat(
    items,
    (entry) => entry.key,
    (entry) =>
      entry.kind === "custom"
        ? renderCustomFavoriteButton(params, entry.item)
        : renderDrawerButton(params, entry.item, "favorites"),
  )}`;
}

function renderTab(
  _params: MacroFavoritesParams | null,
  label: string,
  visible: boolean,
  active: boolean,
  disabled: boolean,
  onClick: () => void,
): TemplateResult | typeof nothing {
  if (!visible) return nothing;
  const classes = [
    "macroFavoritesButton",
    ...(active ? ["active-tab"] : []),
    ...(disabled ? ["disabled"] : []),
  ].join(" ");
  return html`
    <sb-key-button
      class=${classes}
      .label=${label}
      .icon=${null}
      .accessibilityLabel=${label}
      .sizeVar=${"--sb-tab-font-size"}
      .disabled=${disabled}
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
          ${params.renderMacrosContent
            ? renderDrawerItems(params, params.macros, "macros")
            : nothing}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--favorites${isFav ? " open" : ""}"
        ${setRef(params.favoritesOverlayRef)}
      >
        <div class="mf-grid">
          ${params.renderFavoritesContent ? renderFavoritesItems(params) : nothing}
        </div>
      </div>
    </div>
  `;
}

export interface InlineRowParams {
  kind: "macros" | "favorites" | "commands";
  visible: boolean;
  visibleRows: number;
  /** Keyed rendered content; itemCount=0 shows the localized empty text. */
  items: unknown;
  itemCount: number;
  emptyText: string;
  /** Device mode: filter input pinned above the scroller. */
  filter?: CommandsFilterParams | null;
  /** Device mode: power key docked beside the filter strip (plan §8.1). */
  power?: PowerKeyParams | null;
}

export function renderInlineDrawerRow(params: InlineRowParams): TemplateResult {
  const gridClass =
    params.kind === "commands"
      ? "inline-drawer-row__grid mf-grid mf-grid--commands"
      : "inline-drawer-row__grid mf-grid";
  const filterStrip = params.filter
    ? params.power
      ? html`
          <div class="inline-filter-row">
            ${renderCommandsFilter(params.filter)}
            ${renderPowerKey(params.power)}
          </div>
        `
      : renderCommandsFilter(params.filter)
    : nothing;
  return html`
    <div
      class="inline-drawer-row inline-drawer-row--${params.kind}"
      style=${params.visible ? "" : "display: none !important;"}
    >
      ${filterStrip}
      <div
        class="inline-drawer-row__scroller"
        style="--inline-row-visible-rows: ${params.visibleRows};"
      >
        <div class=${gridClass}>
          ${params.itemCount
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

// ---------- device mode: power key (plan §8.1) ----------
//
// A detached key, deliberately NOT merged into the Commands tab bar: a
// tab reads as "opens something", power must read as "a button you
// press". It right-docks at 1/4 of whichever strip tops the commands
// region (the tab bar, or the filter input in commands-as-rows mode),
// and keeps that 1/4 right-docked even when the Commands strip is
// hidden. Rendered only when the device has power configured.

export interface PowerKeyParams {
  busy: boolean;
  disabled: boolean;
  /** Localized accessible name ("Power"). */
  label: string;
  onToggle: () => void;
}

export function renderPowerKey(params: PowerKeyParams): TemplateResult {
  return html`
    <sb-key-button
      class="sb-power-key${params.busy ? " sb-power-key--busy" : ""}"
      .label=${null}
      .icon=${"mdi:power"}
      .accessibilityLabel=${params.label}
      .disabled=${params.disabled || params.busy}
      .onTrigger=${() => params.onToggle()}
    ></sb-key-button>
  `;
}

/** Lone power key row: Commands strip hidden, power stays right-docked. */
export function renderPowerRow(power: PowerKeyParams): TemplateResult {
  return html`
    <div class="commands-row commands-row--power commands-row--power-only">
      <div class="commands-row__spacer"></div>
      ${renderPowerKey(power)}
    </div>
  `;
}

// ---------- device mode: Commands drawer ----------
//
// The macro/favorites construct with a single tab: the device's full command
// list (possibly 150+ entries), one command per row (names can be long),
// with a pinned type-to-filter input. The overlay ignores the activity-mode
// height cap — the card sizes it to the available viewport space.

export interface CommandsFilterParams {
  value: string;
  placeholder: string;
  onInput: (value: string) => void;
}

export interface CommandsItemsParams {
  commands: Array<{ command_id: number; name: string }>;
  onCommand: (command: { command_id: number; name: string }) => void;
}

export interface CommandsDrawerParams extends CommandsItemsParams {
  visible: boolean;
  open: boolean;
  disabled: boolean;
  drawerUp: boolean;
  renderContent: boolean;
  emptyText: string;
  tabLabel: string;
  filter: CommandsFilterParams;
  onToggle: () => void;
  /** Power key sharing the row (3/4 bar + 1/4 key); null = full-width bar. */
  power?: PowerKeyParams | null;
  containerRef?: Ref<HTMLElement>;
  rowRef?: Ref<HTMLElement>;
  overlayRef?: Ref<HTMLElement>;
}

function renderCommandsFilter(filter: CommandsFilterParams): TemplateResult {
  return html`
    <input
      class="sb-commands-filter"
      type="text"
      .value=${filter.value}
      placeholder=${filter.placeholder}
      aria-label=${filter.placeholder}
      @input=${(ev: Event) => {
        const target = ev.target as HTMLInputElement;
        filter.onInput(String(target?.value ?? ""));
      }}
      @keydown=${(ev: Event) => ev.stopPropagation()}
    />
  `;
}

export function renderCommandButton(
  params: CommandsItemsParams,
  command: { command_id: number; name: string },
): TemplateResult {
  return html`
    <ha-card
      class="drawer-btn drawer-btn--command"
      role="button"
      tabindex="0"
      ${primaryActionRef(() => {
        if (!Number.isFinite(command.command_id)) return;
        params.onCommand(command);
      })}
    >
      <div class="drawer-btn__inner drawer-btn__inner--row">
        <div class="name">${command.name}</div>
      </div>
    </ha-card>
  `;
}

export function renderCommandsItems(params: CommandsItemsParams): TemplateResult {
  return html`${repeat(
    params.commands,
    (command) => `${command.command_id}:${command.name}`,
    (command) => renderCommandButton(params, command),
  )}`;
}

export function renderCommandsDrawer(params: CommandsDrawerParams): TemplateResult {
  const setRef = (r?: Ref<HTMLElement>) => (r ? ref(r) : nothing);

  // With a power key the wrapper is the positioned ancestor, so the
  // absolutely-positioned drawer overlay spans the FULL row (both the
  // 3/4 bar and the 1/4 key), not just the bar's column (plan §8.2).
  return html`
    <div
      class="commands-row${params.power ? " commands-row--power" : ""}"
      style=${params.visible ? "" : "display: none !important;"}
    >
    <div
      class="mf-container${params.drawerUp ? " drawer-up" : ""}"
      ${setRef(params.containerRef)}
    >
      <div
        class="macroFavorites"
        style=${rowRadiusStyle(params.open, params.drawerUp)}
        ${setRef(params.rowRef)}
      >
        <div class="macroFavoritesGrid single">
          ${renderTab(
            null,
            params.tabLabel,
            true,
            params.open,
            params.disabled,
            params.onToggle,
          )}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--commands${params.open ? " open" : ""}"
        ${setRef(params.overlayRef)}
      >
        ${params.renderContent
          ? html`
              ${renderCommandsFilter(params.filter)}
              <div class="mf-grid mf-grid--commands">
                ${params.commands.length
                  ? renderCommandsItems(params)
                  : html`
                      <div class="inline-drawer-row__empty" style="grid-column: 1 / -1;">
                        ${params.emptyText}
                      </div>
                    `}
              </div>
            `
          : nothing}
      </div>
    </div>
    ${params.power ? renderPowerKey(params.power) : nothing}
    </div>
  `;
}

export { renderFavoritesItems };
