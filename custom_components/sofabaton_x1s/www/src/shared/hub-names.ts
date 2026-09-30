// What a hub can store in a name. X1S and X2 store UTF-16 names: letters,
// digits and combining marks in any script, spaces and ASCII punctuation.
// The X1 stores [A-Za-z0-9 ] only. The backend applies the same rule to
// Wifi names (__init__.py _wifi_name_char_allowed); the two are checked
// against tests/fixtures/wifi-name-vectors.json (CR-X4-1).

/** Wifi Device, Wifi command and Wifi Event names. */
export const WIFI_NAME_MAX = 20;
/** Activity, device, macro and hub names: the 30-byte (X1) / 60-byte UTF-16BE slot. */
export const ENTITY_NAME_MAX = 30;

export function hubSupportsUnicodeNames(hubVersion: string | null | undefined): boolean {
  const version = String(hubVersion ?? "").toUpperCase();
  return version.includes("X2") || version.includes("X1S");
}

/** Drop the characters the hub cannot store (no length cap). */
export function stripUnstorableNameChars(hubVersion: string | null | undefined, value: unknown): string {
  const pattern = hubSupportsUnicodeNames(hubVersion)
    ? /[^\p{L}\p{N}\p{M} !-\/:-@\[-`{-~]+/gu
    : /[^A-Za-z0-9 ]+/g;
  return String(value ?? "").replace(pattern, "");
}

export function sanitizeWifiName(hubVersion: string | null | undefined, value: unknown): string {
  return stripUnstorableNameChars(hubVersion, value).slice(0, WIFI_NAME_MAX);
}

export function sanitizeEntityName(hubVersion: string | null | undefined, value: unknown): string {
  return stripUnstorableNameChars(hubVersion, value).slice(0, ENTITY_NAME_MAX);
}
