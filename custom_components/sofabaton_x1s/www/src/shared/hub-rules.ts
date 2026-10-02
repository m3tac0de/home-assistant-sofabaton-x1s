// Pure hub rules shared by the tools card and the server panel. They lived
// inside the card's Lit element modules, which the panel cannot import
// (importing them runs customElements.define), so the panel kept copies
// that drifted (CR-X6-3). The name rules live in hub-names.ts and the Wifi
// Events pairing in tabs/backup-state.ts.

/** Device classes whose `ip_address` lives in the device head and is the
 *  source of truth for the device's network address. wifi_ip is
 *  deliberately excluded: it ships its IP inside each command blob,
 *  editable via the per-command structured-payload form. */
export const IP_HEAD_DEVICE_CLASSES: ReadonlySet<string> = new Set(["wifi_hue", "wifi_roku", "wifi_sonos"]);

export const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

// Macro time bytes are in 0.5-second units (a hold byte of 4 = 2.0 s),
// matching the Sofabaton app. 0 = a single click / no wait.

export function byteToSeconds(byteValue: number): string {
  return (Number(byteValue) * 0.5).toFixed(1).replace(/\.0$/, "");
}

export function secondsToByte(value: string): number {
  const seconds = parseFloat(String(value));
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(255, Math.max(0, Math.round(seconds * 2)));
}

/** Whether a Wifi command's power lines and input switch are offered. The
 *  X1 hub collapses activity-transition wifi callbacks to a single power-on
 *  + input callback regardless of how many callback devices the activity
 *  holds (live-hub-testing.md, 2026-07-17), so the configuration is hidden
 *  for X1 hubs. Unknown versions keep the full UI: hiding it there would
 *  silently keep an old input on save. */
export function hubSupportsPowerInput(hubVersion: string | null | undefined): boolean {
  const version = String(hubVersion ?? "").toUpperCase();
  return !(version.includes("X1") && !version.includes("X1S"));
}
