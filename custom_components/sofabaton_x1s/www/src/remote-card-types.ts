import type { HassLike } from "./shared/ha-context";

export type { HassLike };

/**
 * Per-layout display options for the ACTIVITY side. The editor writes the
 * "Default Activity layout" to `layouts.default` (mirroring
 * `device_mode.layouts.default`) and per-activity overrides to
 * `layouts["<activity id>"]`; top-level layout keys remain supported as a
 * read-side base layer beneath `layouts.default` (the released stored shape)
 * and are relocated into the layer on the first default-layout edit. Keep in
 * sync with LAYOUT_KEYS in remote-card-layout.ts. Device layouts have their
 * own key set (DeviceLayoutConfig) under `device_mode.layouts`.
 */
export interface RemoteCardLayoutConfig {
  group_order?: string[];
  show_activity?: boolean;
  show_dpad?: boolean;
  show_nav?: boolean;
  show_mid?: boolean;
  show_volume?: boolean;
  show_channel?: boolean;
  show_media?: boolean;
  show_dvr?: boolean;
  show_colors?: boolean;
  show_abc?: boolean;
  /** null = default (shown); explicit boolean toggles the macros drawer tab. */
  show_macros_button?: boolean | null;
  /** null = default (shown); explicit boolean toggles the favorites drawer tab. */
  show_favorites_button?: boolean | null;
  /** Toggles the activity/device mode toggle button (default shown). */
  show_device_toggle?: boolean;
  /** Render macros/favorites as inline rows instead of drawer tabs. */
  mf_as_rows?: boolean;
  mf_row_visible_rows?: number;
}

/**
 * Stored device layout entry (`device_mode.layouts`). Same display options as
 * the activity side where they apply, but the inline-rows pair is spelled
 * `c_as_rows` / `c_row_visible_rows` ("commands as rows" — in device mode the
 * rows hold Commands, not Macros & Favorites) and the drawer switch is
 * `show_commands_button`. Keep in sync with DEVICE_LAYOUT_KEYS in
 * remote-card-layout.ts.
 */
export interface DeviceLayoutConfig {
  group_order?: string[];
  show_activity?: boolean;
  show_dpad?: boolean;
  show_nav?: boolean;
  show_volume?: boolean;
  show_channel?: boolean;
  show_media?: boolean;
  show_dvr?: boolean;
  show_colors?: boolean;
  show_abc?: boolean;
  /** Toggles the Commands drawer (default shown). */
  show_commands_button?: boolean;
  /** Toggles the activity/device mode toggle button (default shown). */
  show_device_toggle?: boolean;
  /** Render commands as inline rows instead of the drawer tab. */
  c_as_rows?: boolean;
  c_row_visible_rows?: number;
}

/**
 * The `device_mode` block: every stored device-mode setting in one place
 * (sofabaton_x1s only). Absent block = device mode enabled with defaults.
 * Device layouts deliberately do NOT inherit the activity side; their chain
 * is built-in defaults -> layouts.default -> layouts["<device id>"]
 * (docs/internal/device-mode-plan.md §5.1).
 */
export interface DeviceModeConfig {
  /** Absent/true = enabled; explicit false removes every device-mode affordance. */
  enabled?: boolean;
  /**
   * Device id the card opens on. Absent = open on the current activity.
   * Ignored while device mode is unavailable.
   */
  open_device?: number | null;
  /** "default" plus per-device-id entries. */
  layouts?: Record<string, Partial<DeviceLayoutConfig>>;
}

/**
 * The `hold_repeat` block (card-level, all integrations): holding a selected
 * button repeats its command like the physical remote. Absent block or
 * `enabled` not true = off; once enabled, each group defaults to on and only
 * an explicit `false` opts it out. See remote-card-long-press.ts.
 */
export interface HoldRepeatConfig {
  enabled?: boolean;
  /** Vol +/- (mute never repeats). */
  volume?: boolean;
  /** Ch +/-. */
  channel?: boolean;
  /** Up/Down/Left/Right (OK never repeats). */
  dpad?: boolean;
}

/**
 * A user-defined favorite. normalizeCustomFavorite() accepts several aliases
 * for the id fields (key_id/command/key/id, activity_id/device/activity) and
 * `tap_action` for `action`; these are the canonical names.
 */
export interface CustomFavoriteConfig {
  name?: string;
  label?: string;
  icon?: string | null;
  /** Lovelace action object (action/service/perform_action/navigation_path/url_path). */
  action?: Record<string, unknown> | null;
  tap_action?: Record<string, unknown> | null;
  command_id?: number | string | null;
  device_id?: number | string | null;
  [key: string]: unknown;
}

/**
 * Stored card configuration, as accepted by setConfig(). Base layout keys are
 * inherited from RemoteCardLayoutConfig. setConfig() spreads user config over
 * defaults, so unknown keys survive round-trips — hence the index signature.
 */
export type KeyStyle = "flat" | "tinted" | "elevated" | "glossy";

export interface RemoteCardConfig extends RemoteCardLayoutConfig {
  type?: string;
  entity: string;
  /** HA theme name applied card-locally ("" = dashboard theme). */
  theme?: string;
  /** RGB triple for the card background when use_background_override is on. */
  background_override?: [number, number, number] | null;
  /**
   * Key surface treatment. "flat" (default) keeps keys on the card
   * background; "tinted" raises them with a text-colour tint and a floored
   * border; "elevated" adds a soft shadow on top of the tint.
   */
  key_style?: KeyStyle;
  /**
   * Editor-only helper toggle backing background_override; stripped from the
   * stored config by the editor's _fireChanged().
   */
  use_background_override?: boolean;
  show_automation_assist?: boolean;
  /** Device-mode settings block; see DeviceModeConfig. */
  device_mode?: DeviceModeConfig;
  /** Hold-to-repeat settings block; see HoldRepeatConfig. */
  hold_repeat?: HoldRepeatConfig;
  /** px number or CSS length; null/""/0 = unconstrained. */
  max_width?: number | string | null;
  /** Percentage 0-100 mapped to CSS zoom 1..0 (0 = no shrink). */
  shrink?: number | string;
  custom_favorites?: CustomFavoriteConfig[];
  /** Per-activity layout overrides; see RemoteCardLayoutConfig. */
  layouts?: Record<string, Partial<RemoteCardLayoutConfig>>;
  /**
   * Editor-transient preview selection; stripped before storage and never
   * present in saved configs.
   */
  preview_activity?: string;
  [key: string]: unknown;
}

export interface RemoteActivityAttribute {
  id: number | string;
  name: string;
  state?: string;
}

/**
 * One hub device from the remote entity's `devices` attribute (published only
 * while the persistent cache is enabled — device mode is gated on it).
 */
export interface RemoteDeviceAttribute {
  id: number | string;
  name: string;
  sort?: number;
  device_class?: string;
}

/** Shape of the remote entity's attributes the card consumes. */
export interface RemoteEntityAttributes {
  hub_version?: string;
  current_activity?: string;
  current_activity_id?: number | string | null;
  load_state?: string;
  entry_id?: string;
  activities?: RemoteActivityAttribute[];
  devices?: RemoteDeviceAttribute[];
  assigned_keys?: Record<string, number[]>;
  macro_keys?: Record<string, Array<Record<string, unknown>>>;
  favorite_keys?: Record<string, Array<Record<string, unknown>>>;
  [key: string]: unknown;
}

/** `sofabaton_x1s/device/keymap` WS payload (docs/internal/device-mode-plan.md). */
export interface DeviceKeymapPayload {
  device: { device_id: number; name?: string; device_class?: string };
  buttons: number[];
  bindings: Array<{
    button_id: number;
    button_name?: string | null;
    command_id: number;
    command_name?: string | null;
    long_press_command_id?: number | null;
  }>;
  commands: Array<{ command_id: number; name: string }>;
  fetched_at?: string;
}

export interface DeviceKeymapResponse {
  keymap: DeviceKeymapPayload | null;
  reason?: "cache_disabled" | "cache_miss";
  generation?: number;
}
