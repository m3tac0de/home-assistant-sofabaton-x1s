// The web remote's configuration document (docs/internal/web-remote-plan.md,
// section 7): the HA card's config minus what only Home Assistant can act
// on. cardConfigForWebRemote applies it for the hosts that run the card on
// the server (the web remote page and the embed).

import type { RemoteCardConfig } from "./remote-card-types";

/** Keys that mean nothing on the web remote. */
const DROPPED_KEYS = new Set(["type", "entity", "theme", "show_automation_assist", "preview_activity"]);

/** Per-favourite keys that carry Home Assistant actions. */
const DROPPED_FAVORITE_KEYS = new Set(["action", "tap_action", "hold_action", "double_tap_action"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Strip a card config down to the web remote's document. Custom favourites
 * keep only entries that name a hub command (device_id + command_id);
 * Lovelace-action favourites are dropped because the page cannot run them.
 */
export function webRemoteConfigFromCardConfig(
  config: Partial<RemoteCardConfig> | Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isPlainObject(config)) return out;
  for (const [key, value] of Object.entries(config)) {
    if (DROPPED_KEYS.has(key) || value === undefined) continue;
    if (key === "custom_favorites" && Array.isArray(value)) {
      const kept = value
        .filter((item) => isPlainObject(item) && item.command_id != null && item.device_id != null)
        .map((item) => {
          const favorite: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
            if (!DROPPED_FAVORITE_KEYS.has(k)) favorite[k] = v;
          }
          return favorite;
        });
      if (kept.length) out.custom_favorites = kept;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * The server spells a hub id as its MAC in `mac_key` form: lower-case hex,
 * separators stripped. Accept the MAC in any usual spelling; anything
 * else (a host id before the first sync) passes through trimmed.
 */
export function normalizeHubId(value: unknown): string {
  const raw = String(value ?? "").trim();
  const compact = raw.replace(/[:\-\s.]/g, "");
  return /^[0-9a-fA-F]{12}$/.test(compact) ? compact.toLowerCase() : raw;
}

/**
 * The server's base URL (origin + root path, no trailing slash) derived
 * from the page's own location: the page is served at
 * `<base>/ui/remote/` (the control panel at `<base>/ui/`, which passes
 * its own marker), so everything before that is the base. A page served
 * from somewhere else (the Playwright fixtures server) gets the origin
 * alone.
 */
export function serverBaseFromPageUrl(href: string, marker = "/ui/remote/"): string {
  const url = new URL(href);
  const at = url.pathname.indexOf(marker);
  const root = at >= 0 ? url.pathname.slice(0, at) : "";
  return `${url.origin}${root}`.replace(/\/+$/, "");
}

export interface WebRemoteParams {
  hub: string;
  lang: string | undefined;
  device: number | null;
  zoom: number | null;
  theme: "light" | "dark" | null;
}

/** The page's URL parameters: hub (required), lang, device, zoom, theme. */
export function parseWebRemoteParams(search: string, navigatorLanguage?: string): WebRemoteParams {
  const params = new URLSearchParams(search);
  const device = Number(params.get("device"));
  const zoom = Number(params.get("zoom"));
  const theme = params.get("theme");
  return {
    hub: normalizeHubId(params.get("hub")),
    lang: (params.get("lang") ?? navigatorLanguage ?? "").trim() || undefined,
    device: params.has("device") && Number.isFinite(device) ? device : null,
    zoom: params.has("zoom") && Number.isFinite(zoom) && zoom > 0 ? zoom : null,
    theme: theme === "light" || theme === "dark" ? theme : null,
  };
}

/**
 * Build the config the card element takes on the page: the stored
 * document over the defaults, the hub id as the target, and the URL's
 * device request as the opening view.
 */
export function cardConfigForWebRemote(
  hubId: string,
  document: Record<string, unknown> | null | undefined,
  options: { openDevice?: number | null } = {},
): RemoteCardConfig {
  const base = webRemoteConfigFromCardConfig(document);
  const config = { ...base, entity: hubId } as RemoteCardConfig;
  if (options.openDevice != null) {
    const deviceMode = isPlainObject(config.device_mode) ? { ...config.device_mode } : {};
    deviceMode.open_device = options.openDevice;
    config.device_mode = deviceMode;
  }
  return config;
}
