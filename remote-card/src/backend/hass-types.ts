// The slice of Home Assistant's `hass` object the remote card touches. Kept
// local to the remote-card tree (docs/internal/web-remote-plan.md, R2) so the
// card has no import from the tools-card tree; the shape is structural and
// matches what HA hands a Lovelace card. Only the HA adapter, the config
// editor and the Automation Assist controller (an HA-only feature) read it.

export interface HassEntityState {
  state?: string;
  attributes?: Record<string, unknown>;
}

export interface HassConnectionLike {
  subscribeMessage<T>(
    callback: (message: T) => void,
    message: Record<string, unknown>,
  ): Promise<() => void>;
}

export interface HassThemesLike {
  themes?: Record<string, Record<string, unknown>>;
  darkMode?: boolean;
}

export interface HassLike {
  states: Record<string, HassEntityState>;
  locale?: { language?: string };
  language?: string;
  themes?: HassThemesLike;
  /** The signed-in user; the sidebar panel shows its admin toggle on `is_admin`. */
  user?: { is_admin?: boolean } | null;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
  callService?(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  connection?: HassConnectionLike | null;
}
