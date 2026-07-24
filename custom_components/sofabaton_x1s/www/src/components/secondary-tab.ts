import { css, html, nothing } from "lit";

export type SecondaryTabId = string;

export interface SecondaryTabItem<T extends SecondaryTabId = SecondaryTabId> {
  id: T;
  label: string;
  icon: string;
  count?: number;
  disabled?: boolean;
  passive?: boolean;
}

export const secondaryTabStyles = css`
  .secondary-view-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
  }
  .secondary-view-shell--edge {
    margin: -16px;
  }
  .secondary-view-shell--connected {
    --secondary-connected-inline: 16px;
    --secondary-connected-bottom: 16px;
    --secondary-connected-radius: calc(var(--ha-card-border-radius, 12px) * 1.8);
  }
  .secondary-view-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .secondary-view-body--scroll {
    overflow-y: auto;
  }
  .secondary-view-body--padded {
    padding: 12px 16px 16px;
  }
  .secondary-tab-row {
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    min-height: 36px;
    margin: 8px 0 0;
    border: 1px solid color-mix(in srgb, var(--divider-color) 88%, transparent);
    border-radius: calc(var(--ha-card-border-radius, 12px) + 2px);
    overflow: hidden;
    background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 82%, transparent);
  }
  .secondary-tab-row--flush {
    margin-inline: 16px;
  }
  .secondary-view-shell--connected .secondary-tab-row {
    margin-top: 10px;
    margin-inline: var(--secondary-connected-inline);
    border-color: color-mix(in srgb, var(--divider-color) 84%, transparent);
    border-radius: var(--secondary-connected-radius) var(--secondary-connected-radius) 0 0;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 96%, transparent),
        color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 68%, transparent)
      );
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
  }
  .secondary-tab-btn {
    flex: 1 1 0;
    min-width: 0;
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 16px;
    border: none;
    border-right: 1px solid color-mix(in srgb, var(--divider-color) 86%, transparent);
    background: transparent;
    color: color-mix(in srgb, var(--secondary-text-color) 88%, var(--primary-text-color) 12%);
    font: inherit;
    cursor: pointer;
  }
  .secondary-tab-btn:last-child {
    border-right: none;
  }
  .secondary-tab-btn.active {
    color: var(--primary-color);
    background: transparent;
    box-shadow: inset 0 -2px 0 var(--primary-color);
  }
  .secondary-view-shell--connected .secondary-tab-btn.active {
    box-shadow: inset 0 -3px 0 var(--primary-color);
  }
  .secondary-tab-btn--static {
    cursor: default;
  }
  .secondary-tab-btn-icon,
  .secondary-panel-title-icon {
    display: inline-flex;
    color: inherit;
  }
  .secondary-tab-btn-icon ha-icon,
  .secondary-panel-title-icon ha-icon {
    --mdc-icon-size: 18px;
  }
  .secondary-tab-btn-label {
    min-width: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .secondary-tab-btn-count {
    flex: 0 0 auto;
    padding: 0 5px;
    border: 1px solid var(--divider-color);
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    line-height: 1.2;
    color: inherit;
    background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, transparent);
  }
  .secondary-tab-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .secondary-tab-panel--connected,
  .secondary-view-body--connected {
    margin: 0 var(--secondary-connected-inline) var(--secondary-connected-bottom);
    border-left: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
    border-radius: 0 0 var(--secondary-connected-radius) var(--secondary-connected-radius);
    background:
      radial-gradient(circle at top center, color-mix(in srgb, var(--primary-color) 5%, transparent), transparent 48%),
      color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 98%, transparent);
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.03);
  }
  .secondary-tab-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .secondary-tab-panel--connected .secondary-tab-content {
    padding-top: 18px;
  }
  .secondary-panel-header {
    flex-shrink: 0;
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
    background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, transparent);
  }
  .secondary-panel-header--plain {
    min-height: 34px;
    justify-content: flex-end;
    border-bottom: none;
    background: transparent;
  }
  .secondary-panel-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--secondary-text-color);
  }
  .secondary-panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
    display: grid;
    gap: 6px;
    align-content: start;
  }
  .secondary-tab-panel--connected .secondary-panel-body {
    padding-top: 16px;
  }
  @media (max-width: 640px) {
    .secondary-tab-row {
      min-height: 34px;
      margin-top: 7px;
    }
    .secondary-tab-row--flush {
      margin-inline: 12px;
    }
    .secondary-view-shell--connected {
      --secondary-connected-inline: 12px;
      --secondary-connected-bottom: 12px;
    }
    .secondary-tab-btn {
      min-height: 34px;
      gap: 4px;
      padding: 0 8px;
    }
    .secondary-tab-btn-label {
      font-size: 12px;
      letter-spacing: 0.04em;
    }
    .secondary-tab-btn-count {
      padding: 1px 5px;
      font-size: 9px;
    }
    .secondary-panel-header {
      gap: 8px;
      padding: 0 12px;
    }
  }
`;

function normalizeClassName(className?: string) {
  return String(className || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function renderSecondaryTabRow<T extends SecondaryTabId>(params: {
  items: SecondaryTabItem<T>[];
  selectedId: T;
  onSelect?: (id: T) => void;
  flush?: boolean;
  className?: string;
}) {
  const rowClassName = normalizeClassName(
    `secondary-tab-row${params.flush === false ? "" : " secondary-tab-row--flush"} ${params.className || ""}`,
  );

  return html`
    <div class=${rowClassName}>
      ${params.items.map((item) => {
        const isActive = item.id === params.selectedId;
        const isPassive = item.passive || !params.onSelect;
        const buttonClassName = normalizeClassName(
          `secondary-tab-btn${isActive ? " active" : ""}${isPassive ? " secondary-tab-btn--static" : ""}`,
        );

        if (isPassive) {
          return html`
            <div class=${buttonClassName}>
              <span class="secondary-tab-btn-icon"><ha-icon icon=${item.icon}></ha-icon></span>
              <span class="secondary-tab-btn-label">${item.label}</span>
              ${typeof item.count === "number" ? html`<span class="secondary-tab-btn-count">${item.count}</span>` : nothing}
            </div>
          `;
        }

        return html`
          <button
            class=${buttonClassName}
            type="button"
            ?disabled=${item.disabled}
            @click=${() => {
              if (!item.disabled && item.id !== params.selectedId) params.onSelect?.(item.id);
            }}
          >
            <span class="secondary-tab-btn-icon"><ha-icon icon=${item.icon}></ha-icon></span>
            <span class="secondary-tab-btn-label">${item.label}</span>
            ${typeof item.count === "number" ? html`<span class="secondary-tab-btn-count">${item.count}</span>` : nothing}
          </button>
        `;
      })}
    </div>
  `;
}

export function renderSecondaryTabShell<T extends SecondaryTabId>(params: {
  items: SecondaryTabItem<T>[];
  selectedId: T;
  content: unknown;
  onSelect?: (id: T) => void;
  connected?: boolean;
  flush?: boolean;
  shellClassName?: string;
  rowClassName?: string;
}) {
  const shellClassName = normalizeClassName(
    `secondary-view-shell${params.connected ? " secondary-view-shell--connected" : ""} ${params.shellClassName || ""}`,
  );
  return html`
    <div class=${shellClassName}>
      ${renderSecondaryTabRow({
        items: params.items,
        selectedId: params.selectedId,
        onSelect: params.onSelect,
        flush: params.flush,
        className: params.rowClassName,
      })}
      ${params.content}
    </div>
  `;
}

export function renderSecondaryTabContent(params: {
  content: unknown;
  connected?: boolean;
  panelClassName?: string;
  contentClassName?: string;
}) {
  const panelClassName = normalizeClassName(
    `secondary-tab-panel${params.connected ? " secondary-tab-panel--connected" : ""} ${params.panelClassName || ""}`,
  );
  const contentClassName = normalizeClassName(`secondary-tab-content ${params.contentClassName || ""}`);
  return html`
    <div class=${panelClassName}>
      <div class=${contentClassName}>
        ${params.content}
      </div>
    </div>
  `;
}

export function renderSecondaryPanel(params: {
  header?: unknown;
  body: unknown;
  connected?: boolean;
  panelClassName?: string;
  bodyClassName?: string;
}) {
  const panelClassName = normalizeClassName(
    `secondary-tab-panel${params.connected ? " secondary-tab-panel--connected" : ""} ${params.panelClassName || ""}`,
  );
  const bodyClassName = normalizeClassName(`secondary-panel-body ${params.bodyClassName || ""}`);
  return html`
    <div class=${panelClassName}>
      ${params.header}
      <div class=${bodyClassName}>
        ${params.body}
      </div>
    </div>
  `;
}

export function renderSecondaryViewBody(params: {
  content: unknown;
  connected?: boolean;
  className?: string;
  padded?: boolean;
  scroll?: boolean;
}) {
  const viewClassName = normalizeClassName(
    `secondary-view-body${params.connected ? " secondary-view-body--connected" : ""}${params.scroll === false ? "" : " secondary-view-body--scroll"}${params.padded === false ? "" : " secondary-view-body--padded"} ${params.className || ""}`,
  );
  return html`
    <div class=${viewClassName}>
      ${params.content}
    </div>
  `;
}
