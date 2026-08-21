// Long press (hold-to-repeat) configuration helpers for the remote card.
//
// `hold_repeat` is a card-level block (not per layout): holding one of the
// selected buttons repeats its command, like on the physical remote. The
// feature is off unless `hold_repeat.enabled` is true; once enabled, every
// button group defaults to on and only explicit `false` values opt out.
// Pure functions over the stored config, shared by the card and its editor.

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
