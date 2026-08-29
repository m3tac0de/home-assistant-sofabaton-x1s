// Long press helpers for the remote card: the `hold_repeat` config block
// (hold-to-repeat) and the transparent hub long-press bindings.
//
// `hold_repeat` is a card-level block (not per layout): holding one of the
// selected buttons repeats its command, like on the physical remote. The
// feature is off unless `hold_repeat.enabled` is true; once enabled, every
// button group defaults to on and only explicit `false` values opt out.
// Pure functions over the stored config, shared by the card and its editor.
//
// Hub long-press bindings (docs/internal/long-press-plan.md) arrive through
// the remote entity's `long_press_keys` attribute: per entity page (activity
// or device id), the resolved (device_id, command_id) pair of every bound
// hard button. Pure functions over the attributes; the store composes them
// with the integration gate.

import type { HoldRepeatConfig, RemoteCardConfig } from "./remote-card-types";

export const LONG_PRESS_GROUPS = ["volume", "channel", "dpad"] as const;
export type LongPressGroup = (typeof LONG_PRESS_GROUPS)[number];

export interface LongPressSettings {
  enabled: boolean;
  volume: boolean;
  channel: boolean;
  dpad: boolean;
}

/** Which long-press group a key spec belongs to (null = never repeats). */
const LONG_PRESS_GROUP_FOR_KEY: Record<string, LongPressGroup> = {
  volup: "volume",
  voldn: "volume",
  chup: "channel",
  chdn: "channel",
  up: "dpad",
  down: "dpad",
  left: "dpad",
  right: "dpad",
};

export function longPressBlock(
  config: Pick<RemoteCardConfig, "hold_repeat"> | null | undefined,
): HoldRepeatConfig {
  const block = config?.hold_repeat;
  return block && typeof block === "object" ? block : {};
}

/** Resolved long-press settings (absent block = disabled). */
export function longPressSettings(
  config: Pick<RemoteCardConfig, "hold_repeat"> | null | undefined,
): LongPressSettings {
  const block = longPressBlock(config);
  const enabled = block.enabled === true;
  return {
    enabled,
    volume: enabled && block.volume !== false,
    channel: enabled && block.channel !== false,
    dpad: enabled && block.dpad !== false,
  };
}

export function longPressGroupForKey(key: unknown): LongPressGroup | null {
  return LONG_PRESS_GROUP_FOR_KEY[String(key ?? "")] ?? null;
}

/** True when holding the key with this spec key should repeat its command. */
export function longPressEnabledForKey(
  config: Pick<RemoteCardConfig, "hold_repeat"> | null | undefined,
  key: unknown,
): boolean {
  const group = longPressGroupForKey(key);
  if (!group) return false;
  return longPressSettings(config)[group];
}

/** Groups currently selected, in LONG_PRESS_GROUPS order (editor checkbox list). */
export function longPressSelectedGroups(
  config: Pick<RemoteCardConfig, "hold_repeat"> | null | undefined,
): LongPressGroup[] {
  const settings = longPressSettings(config);
  return LONG_PRESS_GROUPS.filter((group) => settings[group]);
}

/**
 * Next `hold_repeat` block for an enable flip. Enabling stores only
 * `{ enabled: true }` (every group on by default); disabling drops the
 * block entirely so saved configs stay clean. Returns undefined for "no block".
 */
export function longPressEnabledPatch(enabled: boolean): HoldRepeatConfig | undefined {
  return enabled ? { enabled: true } : undefined;
}

/**
 * Next `hold_repeat` block for a group selection. Selected groups are stored
 * as the ABSENCE of their key (on is the default); deselected groups as
 * explicit false. Unknown names are ignored.
 */
export function longPressGroupsPatch(
  current: HoldRepeatConfig,
  selected: unknown,
): HoldRepeatConfig {
  const wanted = new Set(
    (Array.isArray(selected) ? selected : [])
      .map((value) => String(value))
      .filter((value): value is LongPressGroup =>
        (LONG_PRESS_GROUPS as readonly string[]).includes(value),
      ),
  );
  const next: HoldRepeatConfig = { ...current, enabled: true };
  for (const group of LONG_PRESS_GROUPS) {
    if (wanted.has(group)) {
      delete next[group];
    } else {
      next[group] = false;
    }
  }
  return next;
}

// ---------- hub long-press bindings ----------

/** The resolved long-press target of one bound hard button. */
export interface HubLongPressBinding {
  device_id: number;
  command_id: number;
}

/**
 * The long-press binding of one hard button on one entity page (activity
 * and device ids share the attribute's namespace), or null. Absent
 * attribute (persistent cache off, official sofabaton_hub integration,
 * older backend), unknown scope, or a malformed entry all mean null,
 * which keeps the feature transparently dark. The card fires the pair
 * itself through the ordinary `send_command {command, device}` payload:
 * long-press exists only here, never in the entity or its services.
 */
export function hubLongPressBinding(
  attributes: { long_press_keys?: unknown } | null | undefined,
  scopeId: unknown,
  buttonId: unknown,
): HubLongPressBinding | null {
  if (scopeId == null || buttonId == null) return null;
  const scope = Number(scopeId);
  const button = Number(buttonId);
  if (!Number.isFinite(scope) || !Number.isFinite(button)) return null;
  const map = attributes?.long_press_keys;
  if (!map || typeof map !== "object") return null;
  const page = (map as Record<string, unknown>)[String(scope)];
  if (!page || typeof page !== "object" || Array.isArray(page)) return null;
  const raw = (page as Record<string, unknown>)[String(button)];
  if (!raw || typeof raw !== "object") return null;
  const device = Number((raw as Record<string, unknown>).device_id);
  const command = Number((raw as Record<string, unknown>).command_id);
  // Entity ids are 1-255; 0 is the wire's "no long press" sentinel and
  // Number(null) is 0, so both must fail this check.
  if (!Number.isFinite(device) || device < 1) return null;
  if (!Number.isFinite(command) || command < 1) return null;
  return { device_id: device, command_id: command };
}

/** True when this hard button carries a hub long-press binding on the scope. */
export function hubLongPressAvailable(
  attributes: { long_press_keys?: unknown } | null | undefined,
  scopeId: unknown,
  buttonId: unknown,
): boolean {
  return hubLongPressBinding(attributes, scopeId, buttonId) !== null;
}
