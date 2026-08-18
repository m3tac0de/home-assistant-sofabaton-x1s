export const DEFAULT_GROUP_ORDER = [
  "activity",
  "macro_favorites",
  "macros_row",
  "favorites_row",
  "dpad",
  "nav",
  "mid",
  "media",
  "colors",
  "abc",
] as const;

export const DEFAULT_GROUP_ORDER_SET = new Set(DEFAULT_GROUP_ORDER);

export const DEFAULT_ROW_VISIBLE_ROWS = 2;
export const MIN_ROW_VISIBLE_ROWS = 1;
export const MAX_ROW_VISIBLE_ROWS = 6;

export const LAYOUT_KEYS = [
  "group_order",
  "show_activity",
  "show_dpad",
  "show_nav",
  "show_mid",
  "show_volume",
  "show_channel",
  "show_media",
  "show_dvr",
  "show_colors",
  "show_abc",
  "show_macros_button",
  "show_favorites_button",
  "show_commands_button",
  "show_device_toggle",
  "mf_as_rows",
  "mf_row_visible_rows",
] as const;

// ---------- device-mode layout keys ----------
//
// Device layouts live in the same `layouts` map as activity layouts but under
// a "device:" namespace: hub device ids and activity ids collide in the 1-255
// space the card keys by, so `layouts["8"]` must stay activity-only.
// Resolution chain for device mode: built-in defaults ⊕
// layouts["device:default"] ⊕ layouts["device:<id>"]. The activity side
// (top-level keys and layouts.default — the "Default Activity layout") is
// deliberately NOT inherited: "Default Device layout" plays the same role for
// devices that "Default Activity layout" plays for activities
// (docs/internal/device-mode-plan.md §5.1).

export const DEVICE_LAYOUT_PREFIX = "device:";
export const DEVICE_DEFAULT_LAYOUT_KEY = "device:default";

export function deviceLayoutKey(deviceId: unknown): string {
  return `${DEVICE_LAYOUT_PREFIX}${deviceId == null ? "default" : String(deviceId)}`;
}

export function isDeviceLayoutKey(selection: unknown): boolean {
  return typeof selection === "string" && selection.startsWith(DEVICE_LAYOUT_PREFIX);
}

/** "device:8" -> 8; "device:default" and anything malformed -> null. */
export function parseDeviceLayoutKey(selection: unknown): number | null {
  if (!isDeviceLayoutKey(selection)) return null;
  const rest = String(selection).slice(DEVICE_LAYOUT_PREFIX.length);
  const id = Number(rest);
  return Number.isFinite(id) ? id : null;
}

// Explicit seed for the device chain: the card reads several flags raw
// (e.g. Boolean(layoutConfig.show_activity)), so decoupling from the
// activity-side base requires spelling the defaults out here.
const DEVICE_LAYOUT_DEFAULTS: Record<string, unknown> = Object.freeze({
  show_activity: true,
  show_dpad: true,
  show_nav: true,
  show_mid: true,
  show_volume: true,
  show_channel: true,
  show_media: true,
  show_dvr: true,
  show_colors: true,
  show_abc: true,
  show_commands_button: true,
  mf_as_rows: false,
  mf_row_visible_rows: DEFAULT_ROW_VISIBLE_ROWS,
  group_order: Object.freeze(DEFAULT_GROUP_ORDER.slice()),
});

export function layoutConfigForDevice(
  config: Record<string, any> | null | undefined,
  deviceId: unknown,
) {
  const layouts = config?.layouts;
  const deviceDefault =
    layouts && typeof layouts === "object" ? layouts[DEVICE_DEFAULT_LAYOUT_KEY] : null;
  let merged: Record<string, unknown> =
    deviceDefault && typeof deviceDefault === "object"
      ? { ...DEVICE_LAYOUT_DEFAULTS, ...deviceDefault }
      : { ...DEVICE_LAYOUT_DEFAULTS };
  if (deviceId != null && layouts && typeof layouts === "object") {
    const override = layouts[deviceLayoutKey(deviceId)];
    if (override && typeof override === "object") {
      merged = { ...merged, ...override };
    }
  }
  return merged;
}

export function commandsButtonEnabled(layout: Record<string, any> | null | undefined) {
  if (typeof layout?.show_commands_button === "boolean") {
    return layout.show_commands_button;
  }
  return true;
}

export function deviceToggleEnabled(layout: Record<string, any> | null | undefined) {
  if (typeof layout?.show_device_toggle === "boolean") {
    return layout.show_device_toggle;
  }
  return true;
}

export function layoutBaseConfig(config: Record<string, unknown> | null | undefined) {
  const base: Record<string, unknown> = {};
  if (!config || typeof config !== "object") return base;
  for (const key of LAYOUT_KEYS) {
    if (config[key] !== undefined) {
      base[key] = config[key];
    }
  }
  return base;
}

export function layoutDefaultConfig(config: Record<string, any> | null | undefined) {
  const base = layoutBaseConfig(config);
  const defaultLayout = config?.layouts?.default;
  if (defaultLayout && typeof defaultLayout === "object") {
    return { ...base, ...defaultLayout };
  }
  return base;
}

export function layoutConfigForActivity(
  config: Record<string, any> | null | undefined,
  activityId: unknown,
) {
  const base = layoutDefaultConfig(config);
  const layouts = config?.layouts;
  if (!layouts || typeof layouts !== "object" || activityId == null) {
    return base;
  }
  const key = String(activityId);
  const override =
    layouts[key] ??
    (Number.isFinite(Number(activityId)) ? layouts[Number(activityId)] : null);
  if (override && typeof override === "object") {
    return { ...base, ...override };
  }
  return base;
}

export function macrosButtonEnabled(layout: Record<string, any> | null | undefined) {
  if (typeof layout?.show_macros_button === "boolean") {
    return layout.show_macros_button;
  }
  return true;
}

export function favoritesButtonEnabled(layout: Record<string, any> | null | undefined) {
  if (typeof layout?.show_favorites_button === "boolean") {
    return layout.show_favorites_button;
  }
  return true;
}

export function mfAsRows(layout: Record<string, any> | null | undefined) {
  return layout?.mf_as_rows === true;
}

export function macrosRowEnabled(layout: Record<string, any> | null | undefined) {
  return mfAsRows(layout) && macrosButtonEnabled(layout);
}

export function favoritesRowEnabled(layout: Record<string, any> | null | undefined) {
  return mfAsRows(layout) && favoritesButtonEnabled(layout);
}

function clampVisibleRows(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_ROW_VISIBLE_ROWS;
  const rounded = Math.round(num);
  if (rounded < MIN_ROW_VISIBLE_ROWS) return MIN_ROW_VISIBLE_ROWS;
  if (rounded > MAX_ROW_VISIBLE_ROWS) return MAX_ROW_VISIBLE_ROWS;
  return rounded;
}

export function mfRowVisibleRows(
  layout: Record<string, any> | null | undefined,
): number {
  return clampVisibleRows(layout?.mf_row_visible_rows);
}

export function volumeGroupEnabled(layout: Record<string, any> | null | undefined) {
  if (typeof layout?.show_volume === "boolean") return layout.show_volume;
  if (typeof layout?.show_mid === "boolean") return layout.show_mid;
  return true;
}

export function channelGroupEnabled(layout: Record<string, any> | null | undefined) {
  if (typeof layout?.show_channel === "boolean") return layout.show_channel;
  if (typeof layout?.show_mid === "boolean") return layout.show_mid;
  return true;
}

export function mediaGroupEnabled(layout: Record<string, any> | null | undefined) {
  if (typeof layout?.show_media === "boolean") return layout.show_media;
  return true;
}

export function dvrGroupEnabled(layout: Record<string, any> | null | undefined) {
  if (typeof layout?.show_dvr === "boolean") return layout.show_dvr;
  return true;
}

export function normalizedGroupOrder(configured: unknown) {
  const source = Array.isArray(configured) ? configured : DEFAULT_GROUP_ORDER;
  const order: string[] = [];
  const seen = new Set<string>();
  for (const entry of source) {
    const key = String(entry ?? "").trim();
    if (!DEFAULT_GROUP_ORDER_SET.has(key as (typeof DEFAULT_GROUP_ORDER)[number]) || seen.has(key)) continue;
    order.push(key);
    seen.add(key);
  }
  for (const key of DEFAULT_GROUP_ORDER) {
    if (!seen.has(key)) order.push(key);
  }
  return order;
}

// Group display labels live in remote-card-strings.ts (str().groups) so they
// can be localized.

export const GROUP_VISIBILITY_KEYS: Record<string, string> = {
  activity: "show_activity",
  dpad: "show_dpad",
  nav: "show_nav",
  mid: "show_mid",
  media: "show_media",
  colors: "show_colors",
  abc: "show_abc",
};

export const ID = {
  UP: 174,
  DOWN: 178,
  LEFT: 175,
  RIGHT: 177,
  OK: 176,
  BACK: 179,
  HOME: 180,
  MENU: 181,
  VOL_UP: 182,
  VOL_DOWN: 185,
  MUTE: 184,
  CH_UP: 183,
  CH_DOWN: 186,
  GUIDE: 157,
  DVR: 155,
  PLAY: 156,
  EXIT: 154,
  A: 153,
  B: 152,
  C: 151,
  REW: 187,
  PAUSE: 188,
  FWD: 189,
  RED: 190,
  GREEN: 191,
  YELLOW: 192,
  BLUE: 193,
} as const;

export const HARD_BUTTON_ICONS: Record<string, string> = {
  up: "mdi:arrow-up-bold",
  down: "mdi:arrow-down-bold",
  left: "mdi:arrow-left-bold",
  right: "mdi:arrow-right-bold",
  ok: "mdi:check-circle-outline",
  back: "mdi:arrow-u-left-top",
  home: "mdi:home-outline",
  menu: "mdi:menu",
  volup: "mdi:volume-plus",
  voldn: "mdi:volume-minus",
  mute: "mdi:volume-mute",
  chup: "mdi:chevron-up-circle-outline",
  chdn: "mdi:chevron-down-circle-outline",
  guide: "mdi:television-guide",
  dvr: "mdi:record-rec",
  play: "mdi:play-circle-outline",
  exit: "mdi:close-circle-outline",
  rew: "mdi:rewind",
  pause: "mdi:pause-circle-outline",
  fwd: "mdi:fast-forward",
  red: "mdi:circle",
  green: "mdi:circle",
  yellow: "mdi:circle",
  blue: "mdi:circle",
  a: "mdi:alpha-a-circle-outline",
  b: "mdi:alpha-b-circle-outline",
  c: "mdi:alpha-c-circle-outline",
};

// Protocol/state values (NOT display labels) — these match HA state strings
// coming from the integration and must stay English. The localized display
// label is str().card.poweredOff.
export const POWERED_OFF_LABELS = new Set(["powered off", "powered_off", "off"]);

// Default key display labels live in remote-card-strings.ts (str().keys) so
// they can be localized.

export const HARD_BUTTON_ID_MAP: Record<string, number> = {
  up: ID.UP,
  down: ID.DOWN,
  left: ID.LEFT,
  right: ID.RIGHT,
  ok: ID.OK,
  back: ID.BACK,
  home: ID.HOME,
  menu: ID.MENU,
  volup: ID.VOL_UP,
  voldn: ID.VOL_DOWN,
  mute: ID.MUTE,
  chup: ID.CH_UP,
  chdn: ID.CH_DOWN,
  guide: ID.GUIDE,
  dvr: ID.DVR,
  play: ID.PLAY,
  exit: ID.EXIT,
  rew: ID.REW,
  pause: ID.PAUSE,
  fwd: ID.FWD,
  red: ID.RED,
  green: ID.GREEN,
  yellow: ID.YELLOW,
  blue: ID.BLUE,
  a: ID.A,
  b: ID.B,
  c: ID.C,
};

export const X2_ONLY_HARD_BUTTON_IDS = new Set<number>([
  ID.C,
  ID.B,
  ID.A,
  ID.EXIT,
  ID.DVR,
  ID.PLAY,
  ID.GUIDE,
]);
