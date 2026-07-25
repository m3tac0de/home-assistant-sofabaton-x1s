import { html, nothing, type TemplateResult } from "lit";
import { html as staticHtml, unsafeStatic } from "lit/static-html.js";
import { ref } from "lit/directives/ref.js";
import {
  MAX_ROW_VISIBLE_ROWS,
  MIN_ROW_VISIBLE_ROWS,
} from "../remote-card-layout";
import {
  selectCloseEvents,
  selectItemTagName,
  selectValueCompat,
} from "../remote-card-compat";
import { str } from "../remote-card-strings";
import type { HassLike } from "../remote-card-types";
import { renderEditorExpander } from "./expander";

export interface GroupOrderSectionParams {
  hass: HassLike | null;
  expanded: boolean;
  /** Current layout selection key ("default" or an activity id). */
  selection: string;
  selectionOptions: Array<{ value: string; label: string }>;
  selectionNote: string;
  /** Visible rows of the group-order list, in order. */
  visibleOrder: string[];
  isEditorX2: boolean;
  asRows: boolean;
  visibleRows: number;
  /** ha-sortable is lazily defined by HA; false renders up/down buttons. */
  sortableReady: boolean;
  macroEnabled: boolean;
  favoritesEnabled: boolean;
  volumeEnabled: boolean;
  channelEnabled: boolean;
  mediaEnabled: boolean;
  dvrEnabled: boolean;
  isGroupEnabled: (key: string) => boolean;
  groupLabel: (key: string) => string;
  onToggleExpanded: () => void;
  onSelectLayout: (value: string) => void;
  onSetMacro: (enabled: boolean) => void;
  onSetFavorites: (enabled: boolean) => void;
  onSetVolume: (enabled: boolean) => void;
  onSetChannel: (enabled: boolean) => void;
  onSetMedia: (enabled: boolean) => void;
  onSetDvr: (enabled: boolean) => void;
  onSetGroupEnabled: (key: string, enabled: boolean) => void;
  onSetMfAsRows: (enabled: boolean) => void;
  onSetMfRowVisibleRows: (value: number) => void;
  onMoveGroupByKey: (key: string, delta: number) => void;
  onMoveGroupByVisibleIndex: (from: number, to: number) => void;
  onResetGroupOrder: () => void;
}

const stopEvent = (ev: Event) => {
  ev.preventDefault();
  ev.stopPropagation();
};

// ha-sortable events bubble composed; swallow them so the dashboard's own
// sortable grids never interpret our drags as card moves (same containment
// the Control Panel card needs).
const containSortableEvent = (ev: Event) => {
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === "function") {
    ev.stopImmediatePropagation();
  }
};

/** Wire ha-select close events (name varies by HA version) to stop bubbling. */
const containSelectCloseEvents = (el: Element | undefined) => {
  if (!el) return;
  const flagged = el as Element & { __sbCloseContained?: boolean };
  if (flagged.__sbCloseContained) return;
  flagged.__sbCloseContained = true;
  selectCloseEvents().forEach((eventName) => {
    el.addEventListener(eventName, (ev) => ev.stopPropagation());
  });
};

function renderSwitchItem(
  text: string,
  checked: boolean,
  onSet: (value: boolean) => void,
): TemplateResult {
  const onChange = (ev: Event) => {
    stopEvent(ev);
    const target = ev.target as HTMLElement & { checked?: boolean };
    onSet(!!target.checked);
  };
  return html`
    <div class="sb-layout-switch-item">
      <ha-switch .checked=${checked} @change=${onChange}></ha-switch>
      <div class="sb-layout-switch-label">${text}</div>
    </div>
  `;
}

const emptySlot = html`
  <div class="sb-layout-switch-item sb-layout-switch-item-empty" aria-hidden="true"></div>
`;

function renderIconButton(
  icon: string,
  aria: string,
  disabled: boolean,
  onClick: () => void,
): TemplateResult {
  return html`
    <button
      type="button"
      class="sb-icon-btn"
      .disabled=${disabled}
      aria-label=${aria}
      @click=${(ev: Event) => {
        stopEvent(ev);
        if (disabled) return;
        onClick();
      }}
    >
      <ha-icon icon=${icon}></ha-icon>
    </button>
  `;
}

/** Layout Options: per-activity layout select, group toggles + reorder, rows mode. */
export function renderGroupOrderSection(params: GroupOrderSectionParams): TemplateResult {
  const selectionValues = new Set(params.selectionOptions.map((o) => o.value));

  const handleLayoutSelect = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation?.();
    const detailValue = (ev as CustomEvent<{ value?: string }>).detail?.value;
    const targetValue = (ev.target as HTMLElement & { value?: string })?.value;
    const selected = detailValue ?? targetValue ?? "";
    params.onSelectLayout(selectionValues.has(selected) ? selected : "default");
  };

  const itemTag = unsafeStatic(selectItemTagName());
  const layoutSelect = html`
    <ha-select
      .fixedMenuPosition=${true}
      .label=${str().editor.layoutSelectLabel}
      .hass=${params.hass}
      .value=${selectValueCompat(params.selection, params.selectionOptions)}
      @selected=${handleLayoutSelect}
      @change=${handleLayoutSelect}
      ${ref(containSelectCloseEvents)}
    >
      ${params.selectionOptions.map(
        (option) => staticHtml`
          <${itemTag} .value=${option.value}>${option.label}</${itemTag}>
        `,
      )}
    </ha-select>
  `;

  const stepButton = (icon: string, delta: number) => {
    const disabled =
      !params.asRows ||
      (delta < 0 && params.visibleRows <= MIN_ROW_VISIBLE_ROWS) ||
      (delta > 0 && params.visibleRows >= MAX_ROW_VISIBLE_ROWS);
    return html`
      <button
        type="button"
        class="sb-icon-btn"
        .disabled=${disabled}
        @click=${(ev: Event) => {
          stopEvent(ev);
          if (disabled) return;
          const next = Math.max(
            MIN_ROW_VISIBLE_ROWS,
            Math.min(MAX_ROW_VISIBLE_ROWS, params.visibleRows + delta),
          );
          if (next === params.visibleRows) return;
          params.onSetMfRowVisibleRows(next);
        }}
      >
        <ha-icon icon=${icon}></ha-icon>
      </button>
    `;
  };

  const mfRow = html`
    <div class="sb-layout-row sb-mf-rows-row">
      <div class="sb-layout-switch-item">
        <ha-switch
          .checked=${params.asRows}
          @change=${(ev: Event) => {
            stopEvent(ev);
            const target = ev.target as HTMLElement & { checked?: boolean };
            params.onSetMfAsRows(!!target.checked);
          }}
        ></ha-switch>
        <div class="sb-layout-switch-label">${str().editor.macrosFavoritesAsRows}</div>
      </div>
      <div
        class="sb-layout-switch-item sb-mf-rows-stepper-item${params.asRows ? "" : " is-disabled"}"
      >
        <div class="sb-layout-switch-label">${str().editor.visibleRows}</div>
        <div class="sb-rows-stepper">
          ${stepButton("mdi:minus", -1)}
          <div class="sb-rows-value">${String(params.visibleRows)}</div>
          ${stepButton("mdi:plus", +1)}
        </div>
      </div>
    </div>
  `;

  const moveControl = (key: string, index: number): TemplateResult => {
    if (params.sortableReady) {
      return html`
        <div class="sb-drag-handle" aria-hidden="true">
          <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
        </div>
      `;
    }
    return html`
      <div class="sb-move-wrap">
        ${renderIconButton(
          "mdi:chevron-up",
          str().editor.moveGroupUp(params.groupLabel(key)),
          index === 0,
          () => params.onMoveGroupByKey(key, -1),
        )}
        ${renderIconButton(
          "mdi:chevron-down",
          str().editor.moveGroupDown(params.groupLabel(key)),
          index === params.visibleOrder.length - 1,
          () => params.onMoveGroupByKey(key, +1),
        )}
      </div>
    `;
  };

  const orderRow = (key: string, index: number): TemplateResult => {
    let cells: TemplateResult | typeof nothing = nothing;
    if (key === "macro_favorites") {
      // Keep independent toggles, but one shared move control.
      cells = html`
        ${renderSwitchItem(str().editor.macros, params.macroEnabled, params.onSetMacro)}
        ${renderSwitchItem(str().editor.favorites, params.favoritesEnabled, params.onSetFavorites)}
      `;
    } else if (key === "macros_row") {
      cells = html`
        ${renderSwitchItem(str().editor.macros, params.macroEnabled, params.onSetMacro)}
        ${emptySlot}
      `;
    } else if (key === "favorites_row") {
      cells = html`
        ${renderSwitchItem(str().editor.favorites, params.favoritesEnabled, params.onSetFavorites)}
        ${emptySlot}
      `;
    } else if (key === "mid") {
      cells = html`
        ${renderSwitchItem(str().editor.volume, params.volumeEnabled, params.onSetVolume)}
        ${renderSwitchItem(str().editor.channel, params.channelEnabled, params.onSetChannel)}
      `;
    } else if (key === "media") {
      cells = html`
        ${renderSwitchItem(str().editor.mediaControls, params.mediaEnabled, params.onSetMedia)}
        ${params.isEditorX2
          ? renderSwitchItem(str().editor.dvr, params.dvrEnabled, params.onSetDvr)
          : emptySlot}
      `;
    } else {
      cells = html`
        ${renderSwitchItem(params.groupLabel(key), params.isGroupEnabled(key), (val) =>
          params.onSetGroupEnabled(key, val),
        )}
        ${emptySlot}
      `;
    }
    return html`
      <div class="sb-layout-row sb-layout-row-order">${cells}${moveControl(key, index)}</div>
    `;
  };

  const rowsHost = html`
    <div class="sb-layout-rows">${params.visibleOrder.map(orderRow)}</div>
  `;

  const rows = params.sortableReady
    ? html`
        <ha-sortable
          draggable-selector=".sb-layout-row-order"
          handle-selector=".sb-drag-handle"
          animation="180"
          @item-added=${containSortableEvent}
          @item-removed=${containSortableEvent}
          @drag-start=${containSortableEvent}
          @drag-end=${containSortableEvent}
          @item-moved=${(ev: CustomEvent<{ oldIndex?: number; newIndex?: number }>) => {
            containSortableEvent(ev);
            const oldIndex = Number(ev.detail?.oldIndex);
            const newIndex = Number(ev.detail?.newIndex);
            if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex)) return;
            params.onMoveGroupByVisibleIndex(oldIndex, newIndex);
          }}
        >
          ${rowsHost}
        </ha-sortable>
      `
    : rowsHost;

  const body = html`
    <div class="sb-layout-card">
      <div class="sb-layout-row">
        <div class="sb-layout-actions sb-layout-actions-full">${layoutSelect}</div>
      </div>
      <div class="sb-layout-note">${params.selectionNote}</div>
      ${rows}
      ${mfRow}
      <div class="sb-layout-footer">
        <button
          type="button"
          class="sb-reset-btn"
          @click=${(ev: Event) => {
            stopEvent(ev);
            params.onResetGroupOrder();
          }}
        >
          ${params.selection === "default"
            ? str().editor.resetCardDefault
            : str().editor.resetDefaultLayout}
        </button>
      </div>
    </div>
  `;

  return renderEditorExpander({
    expanded: params.expanded,
    icon: "mdi:sort",
    title: str().editor.layoutOptions,
    onToggle: params.onToggleExpanded,
    body,
  });
}
