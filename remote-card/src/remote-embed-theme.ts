// Theme planning for the embeddable remote (docs/internal/remote-embed-plan.md,
// decision 3 and E2). The element never touches :root: with
// theme="inherit" it reads what the host page defines for each palette
// variable and sets only the missing ones on itself; "light" / "dark" set
// the whole HA palette on it. Pure over injected readers, so the node
// suite covers the rules; the element supplies getComputedStyle and a
// probe element.
//
// Rules the review added (plan, section 4):
// - the --rgb-* twins are derived from the host's colour when the host set
//   the base colour but not the twin (HA's blue triplet behind a host's own
//   primary would tint every overlay wrong);
// - the host's own polarity decides between the light and dark fill-ins
//   (a dark dashboard on a light OS must not get HA's light greys);
// - color-scheme goes on the element, unless the host set one.
//
// The colour parsing is local on purpose: remote-card/ ships standalone and
// never imports from the tools card's tree.

import { REMOTE_WEB_PALETTE_VARS, type PaletteMode } from "./shims/palette";

export type EmbedTheme = "inherit" | "light" | "dark";

/** The variable names the palette carries (with their dashes). */
export const PALETTE_VAR_NAMES: readonly string[] = Object.keys(REMOTE_WEB_PALETTE_VARS.light);

/** `--rgb-x` companions and the colour they mirror. */
export const RGB_TWINS: Readonly<Record<string, string>> = {
  "--rgb-primary-color": "--primary-color",
  "--rgb-primary-text-color": "--primary-text-color",
  "--rgb-error-color": "--error-color",
};

export interface RgbColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parse what a browser's computed style (Chromium: `rgb()`, `rgba()`,
 * `color(srgb ...)`) or a stylesheet (`#rgb`, `#rrggbb`, `#rrggbbaa`) says.
 * Null for anything else, including a fully transparent colour.
 */
export function parseCssColor(value: string | null | undefined): RgbColor | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  let m = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) return finish(Number(m[1]), Number(m[2]), Number(m[3]), m[4] == null ? 1 : Number(m[4]));
  m = text.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/);
  if (m) return finish(Number(m[1]), Number(m[2]), Number(m[3]), alpha(m[4]));
  m = text.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/);
  if (m) return finish(Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, alpha(m[4]));
  m = text.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = hex.split("").map((c) => c + c).join("");
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    return finish(n(0), n(2), n(4), hex.length === 8 ? n(6) / 255 : 1);
  }
  return null;
}

function alpha(raw: string | undefined): number {
  if (raw == null) return 1;
  return raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}

function finish(r: number, g: number, b: number, a: number): RgbColor | null {
  if (![r, g, b, a].every(Number.isFinite)) return null;
  if (a <= 0) return null;
  return { r, g, b, a };
}

/** WCAG relative luminance of an sRGB colour (alpha ignored). */
export function relativeLuminance({ r, g, b }: RgbColor): number {
  const channel = (v: number) => {
    const s = Math.min(255, Math.max(0, v)) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** "r, g, b" as HA spells its --rgb-* companions. */
export function rgbTriplet({ r, g, b }: RgbColor): string {
  return [r, g, b].map((v) => Math.round(v)).join(", ");
}

export interface EmbedThemeInput {
  theme: EmbedTheme;
  /** The computed value of a custom property on the element (host values only; "" when none). */
  hostValue: (name: string) => string;
  /** `prefers-color-scheme: dark` at the time of planning. */
  prefersDark: boolean;
  /** Resolve any CSS colour through the browser; null when it is not a colour. */
  resolveColor: (css: string) => RgbColor | null;
  /** The element's computed `color-scheme` ("normal" when nobody set one). */
  hostColorScheme: string;
}

export interface EmbedThemePlan {
  mode: PaletteMode;
  /** What to set on the element, name to value. */
  values: Record<string, string>;
  /** A `color-scheme` to set on the element, or null to leave the host's. */
  colorScheme: PaletteMode | null;
}

/** Read `theme` as the element accepts it; anything else is `inherit`. */
export function normalizeEmbedTheme(value: unknown): EmbedTheme {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "light" || text === "dark" ? text : "inherit";
}

/**
 * The host's polarity: light text means a dark page, a dark surface means
 * a dark page; with neither defined, the OS preference decides.
 */
export function hostPolarity(input: Pick<EmbedThemeInput, "hostValue" | "resolveColor" | "prefersDark">): PaletteMode {
  const text = input.hostValue("--primary-text-color");
  const textColor = text ? input.resolveColor(text) : null;
  if (textColor) return relativeLuminance(textColor) > 0.5 ? "dark" : "light";
  const surface = input.hostValue("--card-background-color") || input.hostValue("--primary-background-color");
  const surfaceColor = surface ? input.resolveColor(surface) : null;
  if (surfaceColor) return relativeLuminance(surfaceColor) < 0.5 ? "dark" : "light";
  return input.prefersDark ? "dark" : "light";
}

export function planEmbedTheme(input: EmbedThemeInput): EmbedThemePlan {
  const schemeUnset = !input.hostColorScheme || input.hostColorScheme.trim() === "normal";
  if (input.theme !== "inherit") {
    return {
      mode: input.theme,
      values: { ...REMOTE_WEB_PALETTE_VARS[input.theme] },
      colorScheme: input.theme,
    };
  }
  const mode = hostPolarity(input);
  const palette = REMOTE_WEB_PALETTE_VARS[mode];
  const values: Record<string, string> = {};
  for (const name of PALETTE_VAR_NAMES) {
    if (input.hostValue(name)) continue;
    const twinOf = RGB_TWINS[name];
    if (twinOf) {
      const hostBase = input.hostValue(twinOf);
      if (hostBase) {
        const color = input.resolveColor(hostBase);
        values[name] = color ? rgbTriplet(color) : palette[name];
        continue;
      }
    }
    values[name] = palette[name];
  }
  return { mode, values, colorScheme: schemeUnset ? mode : null };
}
