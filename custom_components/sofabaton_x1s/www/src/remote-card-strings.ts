// Localizable user-facing strings for the Sofabaton Virtual Remote card.
//
// English is the complete reference table. Translations are deep-partial
// overlays: any key a language does not provide falls back to English, so
// partial translations are safe to ship.
//
// To contribute a language, add an entry to TRANSLATIONS keyed by the
// two-letter Home Assistant language code (e.g. "de", "nl", "fr") that
// mirrors the shape of REMOTE_CARD_STRINGS_EN.
//
// Deliberately NOT translated (do not add keys for these):
// - hub-supplied names (activities, devices, commands, favorites, macros)
// - generated YAML keys and MQTT discovery payloads/identifiers
// - documentation URLs
// - stored config values (e.g. default wifi command names)

export const REMOTE_CARD_STRINGS_EN = {
  card: {
    selectEntityError: "Select a Sofabaton remote entity",
    remoteUnavailable:
      "Remote is unavailable (possibly because the Sofabaton app is connected).",
    noActivitiesWarning: "No activities found in remote attributes.",
    noMacros: "No macros available",
    noFavorites: "No favorites available",
    macrosTab: "Macros >",
    favoritesTab: "Favorites >",
    activitySelectLabel: "Activity",
    poweredOff: "Powered Off",
    defaultLayout: "Default Layout",
    activityFallback: (id: number | string) => `Activity ${id}`,
  },
  assist: {
    label: "Key capture",
    start: "Start",
    waiting: "Waiting for keypress",
    exitEditMode: "Exit Edit mode to begin",
    captured: (label: string) => `Captured: ${label}`,
    notCaptured: "Not captured.",
    working: "Working...",
    triggersReady: "Triggers ready for use",
    createTriggers: "Create MQTT Discovery triggers",
    startCapturing: "Start capturing commands",
    deviceDetectedTitle: "Sofabaton MQTT device detected.",
    close: "Close",
    alsoActivityTriggers: "Also create triggers for Activity changes.",
    seeDocs: "See documentation for this feature.",
    dontShowAgain: "Don't show this again for this device during this session.",
    detectedDevice: (name: string) => `Detected MQTT device: ${name}.`,
    lastCommand: (name: string) => `Last command: ${name}.`,
    existingTriggers: "Existing MQTT automation triggers were found.",
    noMqttCommands: "No MQTT commands discovered yet",
    deviceFallback: (id: number | string) => `Device ${id}`,
    unknownDevice: "Unknown device",
    commandFallback: (id: number | string) => `Command ${id}`,
    createdTriggers: (count: number, deviceLabel: string) =>
      `Created ${count} MQTT discovery triggers for ${deviceLabel}`,
    createdActivityTriggers: (count: number) =>
      `Created ${count} activity triggers for X2 → Activities`,
    plusActivityTriggers: (count: number) =>
      ` plus ${count} activity triggers`,
    allTriggersExist: (deviceLabel: string) =>
      `All MQTT discovery triggers already exist for ${deviceLabel}`,
    buttonFallback: "Button",
    activityFallbackLabel: "Activity",
    unknown: "Unknown",
    automationAssistName: "Automation Assist",
    notification: {
      title: "🛠️ Automation Assist",
      eventButton: (label: string) => `Button: ${label}`,
      eventActivity: (label: string) => `Activity Change: ${label}`,
      eventOther: (label: string) => `Event: ${label}`,
      header: (activityName: string, eventLabel: string) =>
        `**Activity: ${activityName} | ${eventLabel}**`,
      lovelaceHeading: "📋 **Lovelace Button Code**",
      lovelaceCopy: "*Copy this to your Dashboard YAML:*",
      serviceHeading: "⚙️ **Service Call (Automation)**",
      serviceCopy: "*Use this in your Scripts or Automations:*",
    },
  },
  editor: {
    fieldLabels: {
      entity: "Select a Sofabaton Remote Entity",
      theme: "Apply a theme to the card",
      use_background_override: "Customize background color",
      background_override: "Select Background Color",
      show_activity: "Activity Selector",
      show_dpad: "Direction Pad",
      show_nav: "Back/Home/Menu Keys",
      show_mid: "Volume/Channel Rockers",
      show_media: "Media Playback Controls",
      show_colors: "Red/Green/Yellow/Blue",
      show_abc: "A/B/C Buttons",
      show_macros_button: "Macros Button",
      show_favorites_button: "Favorites Button",
      max_width: "Maximum Card Width (px)",
      group_order: "Group Order",
    } as Record<string, string>,
    automationAssistTitle: "Automation Assist",
    keyCapture: "Key capture",
    keyCaptureDescription:
      "Send button presses to the hub: Capture button presses to generate ready-to-use YAML for dashboard buttons and automations.",
    keyCaptureLearnMore: "Learn more about Key capture",
    keyCaptureDocsAria: "Key capture documentation",
    stylingOptions: "Styling Options",
    layoutOptions: "Layout Options",
    layoutSelectLabel: "Layout",
    defaultLayoutOption: "Default layout",
    macrosFavoritesAsRows: "Macros/Favorites as rows",
    visibleRows: "Visible rows",
    moveGroupUp: (groupLabel: string) => `Move ${groupLabel} up`,
    moveGroupDown: (groupLabel: string) => `Move ${groupLabel} down`,
    macros: "Macros",
    favorites: "Favorites",
    volume: "Volume",
    channel: "Channel",
    mediaControls: "Media Controls",
    dvr: "DVR",
    resetCardDefault: "Reset to card default",
    resetDefaultLayout: "Reset to default layout",
    noteDefaultLayout: "Used for Activities without their own layout",
    noteCustomLayout: "Using custom layout",
    noteUsingDefault: "Using default layout",
  },
  groups: {
    activity: "Activity Selector",
    macro_favorites: "Macros/Favorites",
    macros_row: "Macros Row",
    favorites_row: "Favorites Row",
    dpad: "Direction Pad",
    nav: "Back/Home/Menu",
    mid: "Volume/Channel",
    media: "Media Controls",
    colors: "Color Buttons",
    abc: "A/B/C",
  } as Record<string, string>,
  keys: {
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
    ok: "OK",
    back: "Back",
    home: "Home",
    menu: "Menu",
    volup: "Vol +",
    voldn: "Vol -",
    mute: "Mute",
    chup: "Ch +",
    chdn: "Ch -",
    guide: "Guide",
    dvr: "DVR",
    play: "Play",
    exit: "Exit",
    rew: "Rewind",
    pause: "Pause",
    fwd: "Fast Forward",
    red: "Red",
    green: "Green",
    yellow: "Yellow",
    blue: "Blue",
    a: "A",
    b: "B",
    c: "C",
  } as Record<string, string>,
};

export type RemoteCardStrings = typeof REMOTE_CARD_STRINGS_EN;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type RemoteCardTranslation = DeepPartial<RemoteCardStrings>;

// Community translations register here, keyed by HA language code.
// Regional variants fall back to the base language ("de-CH" -> "de").
const TRANSLATIONS: Record<string, RemoteCardTranslation> = {};

/**
 * Register (or replace) a translation table for a language code. Translation
 * modules call this at import time; if the language is currently active the
 * merged table is refreshed immediately.
 */
export function registerRemoteCardTranslation(
  language: string,
  translation: RemoteCardTranslation,
) {
  const lang = String(language || "").toLowerCase();
  if (!lang) return;
  TRANSLATIONS[lang] = translation;
  if (currentLanguage === lang || currentLanguage.split(/[-_]/)[0] === lang) {
    const active = resolveTranslation(currentLanguage);
    currentStrings = active
      ? deepMerge(REMOTE_CARD_STRINGS_EN, active)
      : REMOTE_CARD_STRINGS_EN;
  }
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

function deepMerge<T>(base: T, overlay: DeepPartial<T> | undefined): T {
  if (!isPlainObject(overlay)) return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) continue;
    if (isPlainObject(value) && isPlainObject((base as any)?.[key])) {
      out[key] = deepMerge((base as any)[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function resolveTranslation(language: string): RemoteCardTranslation | null {
  const lang = String(language || "").toLowerCase();
  if (!lang) return null;
  if (TRANSLATIONS[lang]) return TRANSLATIONS[lang];
  const base = lang.split(/[-_]/)[0];
  if (base && TRANSLATIONS[base]) return TRANSLATIONS[base];
  return null;
}

let currentLanguage = "en";
let currentStrings: RemoteCardStrings = REMOTE_CARD_STRINGS_EN;

/**
 * Switch the active language. Called from the card's `set hass()` with
 * `hass.locale.language`. Unknown languages fall back to English.
 */
export function setRemoteCardLanguage(language: unknown) {
  const lang = String(language || "en").toLowerCase();
  if (lang === currentLanguage) return false;
  currentLanguage = lang;
  const translation = resolveTranslation(lang);
  currentStrings = translation
    ? deepMerge(REMOTE_CARD_STRINGS_EN, translation)
    : REMOTE_CARD_STRINGS_EN;
  return true;
}

/** Normalized Home Assistant language currently used by the card. */
export function remoteCardLanguage(): string {
  return currentLanguage;
}

/** Writing direction for the active language, including future RTL overlays. */
export function remoteCardDirection(): "ltr" | "rtl" {
  const base = currentLanguage.split(/[-_]/)[0];
  return ["ar", "fa", "he", "ps", "ur"].includes(base) ? "rtl" : "ltr";
}

/** The active string table (English merged with the active translation). */
export function str(): RemoteCardStrings {
  return currentStrings;
}

/**
 * True when `label` is the localized (or English) powered-off label.
 * State values coming from the hub/HA stay English, so callers must also
 * keep checking their protocol-level constants.
 */
export function isLocalizedPoweredOffLabel(label: unknown) {
  const s = String(label || "").trim().toLowerCase();
  if (!s) return false;
  if (s === REMOTE_CARD_STRINGS_EN.card.poweredOff.toLowerCase()) return true;
  return s === currentStrings.card.poweredOff.toLowerCase();
}

// Translation modules live in ./remote-card-translations/ and register
// themselves on import. They are imported via remote-card-translations/index.ts
// from the bundle entry (remote-card.ts) — NOT from this file, which would be
// a circular import. See docs/translations.md.
