// Shortcuts slot editing lives ON the group-order row itself
// (shortcuts-row-plan.md §4.2): the three mini slot buttons sit in the row
// beside the switch, and clicking one drops a full-width panel out of that
// row, with a caret pointing at the open slot. Deliberately NOT a floating
// menu: the panel hosts an icon picker and a command select that open popup
// menus of their own, and popups nested inside a popup fight outside-click
// detection. Rendered only for concrete "device:<id>" selections — slot
// config is strictly per-device.

import { html, nothing, type TemplateResult } from "lit";
import { str } from "../remote-card-strings";
import type { HassLike } from "../remote-card-types";
import type { ShortcutSlot } from "../remote-card-layout";

export interface ShortcutsSlotStripParams {
  /** Always the three slots in left/middle/right order; icon null = unconfigured. */
  slots: Array<{ slot: ShortcutSlot; icon: string | null }>;
  openSlot: ShortcutSlot | null;
  onToggleSlot: (slot: ShortcutSlot) => void;
}

export interface ShortcutsRowPanelParams {
  hass: HassLike | null;
  openSlot: ShortcutSlot;
  /** Draft state of the open slot (written to config once both are valid). */
  draftIcon: string;
  draftCommandId: number | null;
  commandsStatus: "loading" | "ready" | "cache_miss" | "error";
  /** Device commands, alphabetically sorted. */
  commands: Array<{ command_id: number; name: string }>;
  onDraftChanged: (icon: string, commandId: number | null) => void;
  onReset: (slot: ShortcutSlot) => void;
}

const SHORTCUT_ICON_FIELD = "icon";
const SHORTCUT_COMMAND_FIELD = "command";

function slotLabel(slot: ShortcutSlot): string {
  if (slot === "left") return str().editor.shortcutSlotLeft;
  if (slot === "middle") return str().editor.shortcutSlotMiddle;
  return str().editor.shortcutSlotRight;
}

const computeShortcutFieldLabel = (schema: { name: string }): string => {
  if (schema.name === SHORTCUT_ICON_FIELD) return str().editor.shortcutIcon;
  if (schema.name === SHORTCUT_COMMAND_FIELD) return str().editor.shortcutCommand;
  return schema.name;
};

/** The three mini slot buttons, filling the Shortcuts row's second cell. */
export function renderShortcutsSlotStrip(
  params: ShortcutsSlotStripParams,
): TemplateResult {
  return html`
    <div class="sb-shortcut-strip">
      ${params.slots.map((view) => {
        const isOpen = params.openSlot === view.slot;
        const configured = view.icon != null;
        const className = [
          "sb-shortcut-slot",
          ...(configured ? ["is-configured"] : []),
          ...(isOpen ? ["is-open"] : []),
        ].join(" ");
        return html`
          <button
            type="button"
            class=${className}
            aria-label=${slotLabel(view.slot)}
            aria-expanded=${isOpen ? "true" : "false"}
            @click=${(ev: Event) => {
              ev.preventDefault();
              ev.stopPropagation();
              params.onToggleSlot(view.slot);
            }}
          >
            ${configured ? html`<ha-icon icon=${view.icon}></ha-icon>` : nothing}
          </button>
        `;
      })}
    </div>
  `;
}

/**
 * The drop-out slot editor. Rendered INSIDE the Shortcuts group-order row
 * (spanning its grid), so ha-sortable keeps treating the row as one
 * draggable unit and nothing floats over the dialog.
 */
export function renderShortcutsRowPanel(
  params: ShortcutsRowPanelParams,
): TemplateResult {
  if (params.commandsStatus === "loading") {
    return html`
      <div class="sb-shortcut-panel">
        <div class="sb-shortcut-note">${str().editor.shortcutsCommandsLoading}</div>
      </div>
    `;
  }
  if (params.commandsStatus !== "ready") {
    return html`
      <div class="sb-shortcut-panel">
        <div class="sb-shortcut-note">${str().editor.shortcutsCommandsUnavailable}</div>
      </div>
    `;
  }

  // A stored command id the keymap no longer knows still shows up in the
  // select (marked "(missing)") so the user can see and fix it instead of
  // the field silently blanking.
  const options = params.commands.map((command) => ({
    value: String(command.command_id),
    label: command.name,
  }));
  const draftCommand =
    params.draftCommandId != null ? String(params.draftCommandId) : "";
  if (draftCommand && !options.some((option) => option.value === draftCommand)) {
    options.push({
      value: draftCommand,
      label: str().editor.shortcutCommandMissing(draftCommand),
    });
  }

  return html`
    <div class="sb-shortcut-panel">
      <ha-form
        .hass=${params.hass}
        .schema=${[
          {
            name: SHORTCUT_ICON_FIELD,
            required: true,
            selector: { icon: {} },
          },
          {
            name: SHORTCUT_COMMAND_FIELD,
            required: true,
            selector: { select: { mode: "dropdown", options } },
          },
        ]}
        .data=${{
          [SHORTCUT_ICON_FIELD]: params.draftIcon,
          [SHORTCUT_COMMAND_FIELD]: draftCommand,
        }}
        .computeLabel=${computeShortcutFieldLabel}
        @value-changed=${(ev: CustomEvent<{ value: Record<string, unknown> }>) => {
          ev.stopPropagation();
          const value = ev.detail?.value || {};
          const icon = String(value[SHORTCUT_ICON_FIELD] ?? "");
          const rawCommand = String(value[SHORTCUT_COMMAND_FIELD] ?? "");
          const commandId =
            rawCommand !== "" && Number.isFinite(Number(rawCommand))
              ? Number(rawCommand)
              : null;
          params.onDraftChanged(icon, commandId);
        }}
      ></ha-form>
      <div class="sb-shortcut-panel-footer">
        <button
          type="button"
          class="sb-reset-btn"
          @click=${(ev: Event) => {
            ev.preventDefault();
            ev.stopPropagation();
            params.onReset(params.openSlot);
          }}
        >
          ${str().editor.shortcutReset}
        </button>
      </div>
    </div>
  `;
}
