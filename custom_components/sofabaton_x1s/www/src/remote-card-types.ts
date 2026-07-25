import type { HassLike } from "./shared/ha-context";

export type { HassLike };

/**
 * Per-layout display options. The base layout lives at the top level of the
 * card config; per-activity overrides live under `layouts` keyed by activity
 * id (string or number), with `layouts.default` overriding the base for
 * activities without their own entry. Keep in sync with LAYOUT_KEYS in
 * remote-card-layout.ts.
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
  /** Render macros/favorites as inline rows instead of drawer tabs. */
  mf_as_rows?: boolean;
  mf_row_visible_rows?: number;
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
export interface RemoteCardConfig extends RemoteCardLayoutConfig {
  type?: string;
  entity: string;
  /** HA theme name applied card-locally ("" = dashboard theme). */
  theme?: string;
  /** RGB triple for the card background when use_background_override is on. */
  background_override?: [number, number, number] | null;
  /**
   * Editor-only helper toggle backing background_override; stripped from the
   * stored config by the editor's _fireChanged().
   */
  use_background_override?: boolean;
  show_automation_assist?: boolean;
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

/** Shape of the remote entity's attributes the card consumes. */
export interface RemoteEntityAttributes {
  hub_version?: string;
  current_activity?: string;
  current_activity_id?: number | string | null;
  load_state?: string;
  activities?: RemoteActivityAttribute[];
  assigned_keys?: Record<string, number[]>;
  macro_keys?: Record<string, Array<Record<string, unknown>>>;
  favorite_keys?: Record<string, Array<Record<string, unknown>>>;
  [key: string]: unknown;
}
