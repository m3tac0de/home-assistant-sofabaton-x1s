/**
 * Narrative activity-editor sections (docs/internal/activity-editor-plan.md).
 *
 * Render helpers for the activity detail view's story-order sections:
 * "Devices in this activity" (membership chips), "When the activity
 * starts" (per-device power-on + input), and "When the activity ends"
 * (per-device power-off). The shared sections (buttons, shortcuts) still
 * render in backup-tab.ts; state and dialogs stay in the host tab.
 *
 * Helpers are pure over a params object — data in, callbacks out — so the
 * live-hub rollout can reuse them against a different write-backend.
 */
import { css, html, nothing, type TemplateResult } from "lit";
import { TOOLS_CARD_STRINGS } from "../strings";
import type {
  ActivityRoleAssignment,
  ActivityRoleGroupId,
  BackupActivityMemberView,
  BackupDeviceCommandItem,
  BackupSelectionOption,
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

export interface ActivityDevicesSectionParams {
  members: BackupActivityMemberView[];
  addable: BackupSelectionOption[];
  menuOpen: boolean;
  menuAnchor: DOMRect | null;
  onToggleMenu(anchor: DOMRect | null): void;
  onAdd(deviceId: number): void;
  onRemove(member: BackupActivityMemberView): void;
}

export function renderActivityDevicesSection(params: ActivityDevicesSectionParams): TemplateResult {
  return html`
    <div class="quick-access-section" data-edit-section="devices">
      <div class="quick-access-head">
        <div class="quick-access-head-main">
          <div class="quick-access-title">${S.activityDevicesTitle}</div>
          <div class="quick-access-sub">${S.activityDevicesSub}</div>
        </div>
      </div>
      <div class="member-chip-list">
        ${params.members.map((member) => html`
          <span class="member-chip">
            <span class="member-chip-label">${member.deviceName}</span>
            <button
              class="member-chip-remove"
              type="button"
              aria-label=${S.activityRemoveDeviceAria(member.deviceName)}
              @click=${() => params.onRemove(member)}
            >
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </span>
        `)}
        <span class="member-add" data-open=${params.menuOpen ? "true" : "false"}>
          <button
            class="member-chip member-chip--add"
            type="button"
            @click=${(event: Event) => params.onToggleMenu(params.menuOpen ? null : menuAnchorRect(event))}
          >
            <ha-icon icon="mdi:plus"></ha-icon>
            <span>${S.activityAddDevice}</span>
          </button>
          ${params.menuOpen
            ? html`
                <button
                  class="member-add-backdrop"
                  type="button"
                  tabindex="-1"
                  aria-hidden="true"
                  @click=${() => params.onToggleMenu(null)}
                ></button>
                <div
                  class="member-add-menu"
                  role="listbox"
                  aria-label=${S.activityAddDevice}
                  style=${overlayMenuPosition(params.menuAnchor, "left")}
                >
                  ${params.addable.length
                    ? params.addable.map((option) => html`
                        <button
                          class="member-add-option"
                          type="button"
                          role="option"
                          @click=${() => params.onAdd(option.id)}
                        >${option.label}</button>
                      `)
                    : html`<div class="member-add-empty">${S.activityAddDeviceNone}</div>`}
                </div>
              `
            : nothing}
        </span>
      </div>
      ${params.members.length === 0
        ? html`<div class="quick-access-empty">${S.activityDevicesEmpty}</div>`
        : nothing}
    </div>
  `;
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

export interface ActivityStartSectionParams {
  members: BackupActivityMemberView[];
  commandsFor(deviceId: number): BackupDeviceCommandItem[];
  onInputChange(deviceId: number, commandId: number | null): void;
  sequenceMeta: string;
  onOpenSequence(): void;
}

export function renderActivityStartSection(params: ActivityStartSectionParams): TemplateResult {
  return html`
    <div class="quick-access-section" data-edit-section="start">
      <div class="quick-access-head">
        <div class="quick-access-head-main">
          <div class="quick-access-title">${S.activityStartTitle}</div>
          <div class="quick-access-sub">${S.activityStartSub}</div>
        </div>
      </div>
      ${params.members.length
        ? html`
            <div class="quick-access-list">
              <div class="quick-access-sortable-container">
                ${params.members.map((member) => renderStartRow(member, params))}
                ${renderDrillInRow({
                  label: S.sequenceRowLabel,
                  meta: params.sequenceMeta,
                  onOpen: params.onOpenSequence,
                })}
              </div>
            </div>
          `
        : html`<div class="quick-access-empty">${S.activityDevicesEmpty}</div>`}
    </div>
  `;
}

function renderStartRow(
  member: BackupActivityMemberView,
  params: ActivityStartSectionParams,
): TemplateResult {
  const commands = params.commandsFor(member.deviceId);
  // The configured input may reference a command that no longer exists on
  // the device — keep it selectable so the user sees the current state.
  const orphanInput = member.inputCommandId != null
    && !commands.some((command) => command.commandId === member.inputCommandId);
  return html`
    <div class="quick-access-sortable-item">
      <div class="quick-access-row quick-access-row--no-drag member-start-row">
        <div class="quick-access-main">
          <div class="quick-access-label-row">
            <div class="quick-access-label">${member.deviceName}</div>
          </div>
        </div>
        <div class="member-start-controls">
          <label class="member-input-label">
            <span>${S.activityStartInputLabel}</span>
            <select
              class="member-input-select"
              aria-label=${S.activityStartInputAria(member.deviceName)}
              @change=${(event: Event) => {
                const raw = (event.target as HTMLSelectElement).value;
                params.onInputChange(member.deviceId, raw === "" ? null : Number(raw));
              }}
            >
              <option value="" ?selected=${member.inputCommandId == null}>${S.activityStartInputNone}</option>
              ${orphanInput
                ? html`<option value=${String(member.inputCommandId)} selected>${member.inputCommandName ?? `Input ${member.inputOrdinal}`}</option>`
                : nothing}
              ${commands.map((command) => html`
                <option
                  value=${String(command.commandId)}
                  ?selected=${member.inputCommandId === command.commandId}
                >${command.label}</option>
              `)}
            </select>
          </label>
        </div>
      </div>
    </div>
  `;
}

export interface ActivityIdleOption {
  mode: number;
  label: string;
  sub: string;
}

export interface ActivityEndSectionParams {
  members: BackupActivityMemberView[];
  /** Device-level automatic-power mode (idle behavior); null = not captured. */
  idleModeFor(deviceId: number): number | null;
  idleOptions: ActivityIdleOption[];
  idleMenuDeviceId: number | null;
  idleMenuAnchor: DOMRect | null;
  onToggleIdleMenu(deviceId: number | null, anchor?: DOMRect | null): void;
  onIdleChange(deviceId: number, mode: number): void;
  sequenceMeta: string;
  onOpenSequence(): void;
}

function idleSummaryLabel(mode: number | null): string {
  switch (mode) {
    case 1:
      return S.activityIdleAutoOff;
    case 2:
      return S.activityIdleAlwaysOn;
    case 3:
      return S.activityIdleStayOn;
    case 4:
      return S.activityIdleDisabled;
    default:
      return S.activityIdleUnset;
  }
}

export function renderActivityEndSection(params: ActivityEndSectionParams): TemplateResult {
  return html`
    <div class="quick-access-section" data-edit-section="end">
      <div class="quick-access-head">
        <div class="quick-access-head-main">
          <div class="quick-access-title">${S.activityEndTitle}</div>
          <div class="quick-access-sub">${S.activityEndSub}</div>
        </div>
      </div>
      ${params.members.length
        ? html`
            <div class="quick-access-list quick-access-list--overlays">
              <div class="quick-access-sortable-container">
                ${params.members.map((member) => renderEndRow(member, params))}
                ${renderDrillInRow({
                  label: S.sequenceRowLabel,
                  meta: params.sequenceMeta,
                  onOpen: params.onOpenSequence,
                })}
              </div>
            </div>
          `
        : html`<div class="quick-access-empty">${S.activityDevicesEmpty}</div>`}
    </div>
  `;
}

function renderEndRow(
  member: BackupActivityMemberView,
  params: ActivityEndSectionParams,
): TemplateResult {
  const idleMode = params.idleModeFor(member.deviceId);
  const menuOpen = params.idleMenuDeviceId === member.deviceId;
  return html`
    <div class="quick-access-sortable-item">
      <div class="quick-access-row quick-access-row--no-drag member-start-row">
        <div class="quick-access-main">
          <div class="quick-access-label-row">
            <div class="quick-access-label">${member.deviceName}</div>
          </div>
          <span class="member-add member-idle-anchor" data-open=${menuOpen ? "true" : "false"}>
            <button
              class="member-idle-trigger"
              type="button"
              aria-haspopup="listbox"
              aria-expanded=${menuOpen ? "true" : "false"}
              aria-label=${S.activityIdleAria(member.deviceName)}
              @click=${(event: Event) =>
                params.onToggleIdleMenu(menuOpen ? null : member.deviceId, menuAnchorRect(event))}
            >
              <span>${idleSummaryLabel(idleMode)}</span>
              <ha-icon icon="mdi:chevron-down"></ha-icon>
            </button>
            ${menuOpen
              ? html`
                  <button
                    class="member-add-backdrop"
                    type="button"
                    tabindex="-1"
                    aria-hidden="true"
                    @click=${() => params.onToggleIdleMenu(null)}
                  ></button>
                  <div
                    class="member-add-menu member-idle-menu"
                    role="listbox"
                    aria-label=${S.activityIdleAria(member.deviceName)}
                    style=${overlayMenuPosition(params.idleMenuAnchor, "left")}
                  >
                    <div class="member-add-empty">${S.activityIdleMenuNote}</div>
                    ${params.idleOptions.map((option) => html`
                      <button
                        class="member-add-option member-idle-option"
                        type="button"
                        role="option"
                        aria-selected=${option.mode === idleMode ? "true" : "false"}
                        @click=${() => params.onIdleChange(member.deviceId, option.mode)}
                      >
                        <span class="member-idle-option-label">${option.label}</span>
                        <span class="member-idle-option-sub">${option.sub}</span>
                      </button>
                    `)}
                  </div>
                `
              : nothing}
          </span>
        </div>
      </div>
    </div>
  `;
}

// ── Role-based button assignment block ──────────────────────────────

const ROLE_LABELS: Record<ActivityRoleGroupId, string> = {
  volume: S.roleVolume,
  navigation: S.roleNavigation,
  playback: S.rolePlayback,
  channels: S.roleChannels,
};

const ROLE_ICONS: Record<ActivityRoleGroupId, string> = {
  volume: "mdi:volume-high",
  navigation: "mdi:gamepad-round-outline",
  playback: "mdi:play-pause",
  channels: "mdi:pound",
};

export interface ActivityRoleOption {
  deviceId: number;
  label: string;
  /** Group buttons this device's device-mode map covers (0 = not assignable). */
  mappable: number;
}

export interface ActivityRolesBlockParams {
  roles: ActivityRoleAssignment[];
  /** Candidate devices per group — the activity's members. */
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
  const partialNote = (role.state === "device" || role.state === "customized")
    && role.boundCount < role.totalCount
    ? S.roleMappedNote(role.boundCount, role.totalCount)
    : null;
  return html`
    <div class="quick-access-sortable-item">
      <div class="role-row">
        <ha-icon class="role-icon" icon=${ROLE_ICONS[role.group]}></ha-icon>
      <div class="role-main">
        <div class="role-label">${ROLE_LABELS[role.group]}</div>
        ${partialNote ? html`<div class="role-note">${partialNote}</div>` : nothing}
      </div>
      <span class="member-add role-menu-anchor" data-open=${open ? "true" : "false"}>
        <button
          class="role-trigger"
          type="button"
          data-state=${role.state}
          aria-haspopup="listbox"
          aria-expanded=${open ? "true" : "false"}
          aria-label=${S.roleMenuAria(ROLE_LABELS[role.group])}
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
                aria-label=${ROLE_LABELS[role.group]}
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
  .member-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .member-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px 5px 12px;
    border: 1px solid var(--divider-color);
    border-radius: var(--backup-radius-pill);
    font-size: 0.85rem;
    color: var(--primary-text-color);
    background: none;
  }
  .member-chip-label {
    line-height: 1.2;
  }
  .member-chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    cursor: pointer;
    color: var(--secondary-text-color);
    --mdc-icon-size: 15px;
  }
  .member-chip-remove:hover {
    color: var(--error-color, #db4437);
  }
  .member-chip--add {
    border-style: dashed;
    color: var(--secondary-text-color);
    cursor: pointer;
    padding: 5px 12px;
    --mdc-icon-size: 15px;
  }
  .member-chip--add:hover {
    color: var(--primary-text-color);
    border-color: var(--primary-text-color);
  }
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
  .member-start-row {
    align-items: center;
  }
  .member-start-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .member-input-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--secondary-text-color);
  }
  .member-input-select {
    max-width: 150px;
    padding: 4px 6px;
    border-radius: var(--backup-radius-sm);
    border: 1px solid var(--divider-color);
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    font-size: 0.85rem;
  }
  .member-idle-anchor {
    display: inline-flex;
    margin-top: 2px;
  }
  .member-idle-trigger {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    font-size: 0.78rem;
    color: var(--secondary-text-color);
    text-align: left;
    --mdc-icon-size: 14px;
  }
  .member-idle-trigger:hover {
    color: var(--primary-text-color);
  }
  .member-idle-menu {
    min-width: 260px;
  }
  .member-idle-option {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .member-idle-option[aria-selected="true"] {
    background: var(--secondary-background-color);
  }
  .member-idle-option-label {
    font-size: 0.88rem;
  }
  .member-idle-option-sub {
    font-size: 0.75rem;
    color: var(--secondary-text-color);
    line-height: 1.35;
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
