/**
 * Shared activity-editor helpers.
 *
 * The current activity detail view uses the full Power editor plus the
 * role-based button assignment block here. The old Devices / Start / End
 * narrative sections were removed when their useful controls moved into
 * the underlying detail editors.
 */
import { css, html, nothing, type TemplateResult } from "lit";
import { TOOLS_CARD_STRINGS } from "../strings";
import type {
  ActivityRoleAssignment,
  ActivityRoleGroupId,
} from "./backup-state";

const S = TOOLS_CARD_STRINGS.backup;

/** Matches .member-add-menu's max-height — used for the flip-up estimate. */
const OVERLAY_MENU_MAX_HEIGHT = 240;

/**
 * Inline position for a popup menu, fixed to the viewport so the detail
 * view's scroll container (overflow-y: auto) can't clip it — absolute
 * positioning always clips at a scroll ancestor, whatever the overflow
 * of the list in between. The anchor rect is captured from the trigger
 * at click time; the host tab closes any open menu on scroll so a fixed
 * menu never drifts away from its trigger. Flips above the anchor when
 * the space below is too tight.
 */
export function overlayMenuPosition(anchor: DOMRect | null, align: "left" | "right"): string {
  if (!anchor) return "";
  const gap = 4;
  const spaceBelow = window.innerHeight - anchor.bottom;
  const openUp = spaceBelow < OVERLAY_MENU_MAX_HEIGHT + gap && anchor.top > spaceBelow;
  const vertical = openUp
    ? `bottom: ${Math.round(window.innerHeight - anchor.top + gap)}px; top: auto;`
    : `top: ${Math.round(anchor.bottom + gap)}px; bottom: auto;`;
  const horizontal = align === "right"
    ? `right: ${Math.round(window.innerWidth - anchor.right)}px; left: auto;`
    : `left: ${Math.round(anchor.left)}px; right: auto;`;
  return `position: fixed; ${vertical} ${horizontal}`;
}

/** The trigger rect for overlayMenuPosition, read at click time. */
export function menuAnchorRect(event: Event): DOMRect | null {
  const target = event.currentTarget;
  return target instanceof HTMLElement ? target.getBoundingClientRect() : null;
}

/**
 * The uniform "drill deeper" affordance: the advanced-mode footer of a
 * list. It renders as the last row of a bordered quick-access list but
 * visually set apart (tinted, solid separator, tune icon) so it reads as
 * "advanced editing for the rows above", not another list item. Every
 * deeper level in the activity editor is a full sub-view reached through
 * one of these — never an inline accordion.
 */
export function renderDrillInRow(params: {
  label: string;
  meta?: string | null;
  onOpen(): void;
}): TemplateResult {
  return html`
    <div class="quick-access-sortable-item quick-access-footer-item">
      <button class="edit-selection-row edit-selection-row--footer" @click=${params.onOpen}>
        <ha-icon class="footer-row-icon" icon="mdi:tune-variant"></ha-icon>
        <span class="selection-main">
          <span class="selection-label">${params.label}</span>
          ${params.meta ? html`<span class="selection-sub">${params.meta}</span>` : nothing}
        </span>
        <span class="selection-chevron"><ha-icon icon="mdi:chevron-right"></ha-icon></span>
      </button>
    </div>
  `;
}

// ── Role-based button assignment block ──────────────────────────────

const ROLE_ICONS: Record<ActivityRoleGroupId, string> = {
  volume: "mdi:volume-high",
  navigation: "mdi:gamepad-round-outline",
  playback: "mdi:play-pause",
  channels: "mdi:pound",
};

function roleLabel(group: ActivityRoleGroupId): string {
  switch (group) {
    case "volume":
      return S.roleVolume;
    case "navigation":
      return S.roleNavigation;
    case "playback":
      return S.rolePlayback;
    case "channels":
      return S.roleChannels;
  }
}

export interface ActivityRoleOption {
  deviceId: number;
  label: string;
  /** Group buttons this device's device-mode map covers (0 = not assignable). */
  mappable: number;
}

export interface ActivityRolesBlockParams {
  roles: ActivityRoleAssignment[];
  /** Candidate devices per group: all editable source devices in the bundle. */
  optionsFor(group: ActivityRoleGroupId): ActivityRoleOption[];
  openGroup: ActivityRoleGroupId | null;
  menuAnchor: DOMRect | null;
  onToggleMenu(group: ActivityRoleGroupId | null, anchor?: DOMRect | null): void;
  onAssign(group: ActivityRoleGroupId, deviceId: number | null): void;
  /** Per-button customization — the advanced mode for the role rows above. */
  customize: {
    label: string;
    meta: string | null;
    onOpen(): void;
  };
}

function roleTriggerLabel(role: ActivityRoleAssignment): string {
  switch (role.state) {
    case "device":
      return role.deviceName ?? "";
    case "customized":
      return S.roleCustomized(role.deviceName ?? "");
    case "custom":
      return S.roleCustom;
    case "unused":
      return S.roleNotUsed;
  }
}

export function renderActivityRolesBlock(params: ActivityRolesBlockParams): TemplateResult {
  return html`
    <div class="quick-access-list quick-access-list--overlays">
      <div class="quick-access-sortable-container">
        ${params.roles.map((role) => renderRoleRow(role, params))}
        ${renderDrillInRow(params.customize)}
      </div>
    </div>
  `;
}

function renderRoleRow(role: ActivityRoleAssignment, params: ActivityRolesBlockParams): TemplateResult {
  const open = params.openGroup === role.group;
  const label = roleLabel(role.group);
  const partialNote = (role.state === "device" || role.state === "customized")
    && role.boundCount < role.totalCount
    ? S.roleMappedNote(role.boundCount, role.totalCount)
    : null;
  return html`
    <div class="quick-access-sortable-item">
      <div class="role-row">
        <ha-icon class="role-icon" icon=${ROLE_ICONS[role.group]}></ha-icon>
      <div class="role-main">
        <div class="role-label">${label}</div>
        ${partialNote ? html`<div class="role-note">${partialNote}</div>` : nothing}
      </div>
      <span class="member-add role-menu-anchor" data-open=${open ? "true" : "false"}>
        <button
          class="role-trigger"
          type="button"
          data-state=${role.state}
          aria-haspopup="listbox"
          aria-expanded=${open ? "true" : "false"}
          aria-label=${S.roleMenuAria(label)}
          @click=${(event: Event) =>
            params.onToggleMenu(open ? null : role.group, menuAnchorRect(event))}
        >
          <span>${roleTriggerLabel(role)}</span>
          <ha-icon icon="mdi:chevron-down"></ha-icon>
        </button>
        ${open
          ? html`
              <button
                class="member-add-backdrop"
                type="button"
                tabindex="-1"
                aria-hidden="true"
                @click=${() => params.onToggleMenu(null)}
              ></button>
              <div
                class="member-add-menu role-menu"
                role="listbox"
                aria-label=${label}
                style=${overlayMenuPosition(params.menuAnchor, "right")}
              >
                <button
                  class="member-add-option"
                  type="button"
                  role="option"
                  aria-selected=${role.state === "unused" ? "true" : "false"}
                  @click=${() => params.onAssign(role.group, null)}
                >${S.roleNotUsed}</button>
                ${params.optionsFor(role.group).map((option) => html`
                  <button
                    class="member-add-option"
                    type="button"
                    role="option"
                    ?disabled=${option.mappable === 0}
                    aria-selected=${role.deviceId === option.deviceId ? "true" : "false"}
                    @click=${() => params.onAssign(role.group, option.deviceId)}
                  >${option.mappable === 0 ? S.roleOptionNoMapping(option.label) : option.label}</button>
                `)}
              </div>
            `
          : nothing}
      </span>
      </div>
    </div>
  `;
}

export const activityEditorStyles = css`
  .member-add {
    position: relative;
    display: inline-flex;
  }
  .member-add-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: default;
    z-index: 4;
  }
  .member-add-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 5;
    min-width: 180px;
    max-height: 240px;
    overflow-y: auto;
    background: var(--card-background-color, #fff);
    border: 1px solid var(--divider-color);
    border-radius: var(--backup-radius-md);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    padding: 4px;
  }
  .member-add-option {
    border: none;
    background: none;
    text-align: left;
    padding: 8px 10px;
    font-size: 0.9rem;
    color: var(--primary-text-color);
    border-radius: var(--backup-radius-sm);
    cursor: pointer;
  }
  .member-add-option:hover {
    background: var(--secondary-background-color);
  }
  .member-add-empty {
    padding: 8px 10px;
    font-size: 0.85rem;
    color: var(--secondary-text-color);
    line-height: 1.4;
  }
  .role-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
  }
  /* Advanced-mode footer: the last row of a quick-access list that drills
     into the deeper editor for the rows above it. Tinted and separated by
     a solid divider so it reads as attached to — but different from — the
     list items. The extra class in the selector outranks the plain
     sortable-item border rule that follows in the host tab's styles. */
  .quick-access-sortable-item.quick-access-footer-item {
    border-top: 1px solid var(--divider-color);
    background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 55%, transparent);
    border-radius: 0 0 calc(var(--backup-radius-lg) - 1px) calc(var(--backup-radius-lg) - 1px);
    overflow: hidden;
  }
  .edit-selection-row--footer .selection-label {
    color: var(--secondary-text-color);
    font-size: 12.5px;
    font-weight: 600;
  }
  .footer-row-icon {
    flex: 0 0 auto;
    color: var(--secondary-text-color);
    --mdc-icon-size: 16px;
  }
  .role-icon {
    color: var(--secondary-text-color);
    --mdc-icon-size: 18px;
    flex: none;
  }
  .role-main {
    flex: 1;
    min-width: 0;
  }
  .role-label {
    font-size: 0.92rem;
  }
  .role-note {
    font-size: 0.75rem;
    color: var(--secondary-text-color);
  }
  .role-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--divider-color);
    border-radius: var(--backup-radius-sm);
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    padding: 5px 8px;
    font-size: 0.85rem;
    cursor: pointer;
    max-width: 190px;
    --mdc-icon-size: 15px;
  }
  .role-trigger > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .role-trigger[data-state="unused"] > span {
    color: var(--secondary-text-color);
  }
  .role-trigger[data-state="custom"] > span,
  .role-trigger[data-state="customized"] > span {
    font-style: italic;
  }
  .role-menu {
    right: 0;
    left: auto;
    min-width: 200px;
  }
  .member-add-option:disabled {
    color: var(--disabled-text-color, var(--secondary-text-color));
    cursor: default;
    opacity: 0.7;
  }
`;
