/**
 * Theme polarity for the control panel: which way round the theme is
 * (light text on a dark surface, or dark text on a light one), decided from
 * what the theme actually resolves to rather than from HA's dark-mode flag.
 *
 * Why: nothing in a theme's variables says which side it is on. Liquid
 * Glass "light" paints white text on a translucent grey card; Caule Light
 * paints grey text on white; a card-level `theme:` never reaches HA's own
 * dark-mode handling at all. Two things in the card depend on getting this
 * right and cannot be expressed with theme tokens alone:
 *
 * - `color-scheme`: Chromium draws the native <select> popup from the
 *   select's colour scheme when the select's own background is not opaque
 *   (glass themes), so a white-text theme without a dark scheme gets white
 *   option text on a white popup. Scrollbars and native form chrome follow
 *   the same setting.
 * - an OPAQUE popup surface for <option> rows: color-mix() cannot turn a
 *   translucent card surface into an opaque one, so the surface is
 *   composited here (over black or white, whichever the scheme is) and
 *   written to the host as `--sb-popup-surface`.
 *
 * The host element carries the result as inline properties; the CSS token
 * layer in card-styles.ts declares fallbacks for the no-JS case.
 */

export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type ThemeScheme = "light" | "dark";

export interface ThemePolarity {
  scheme: ThemeScheme;
  /** Opaque colour: the page ground behind translucent surfaces (#000 / #fff). */
  ground: string;
  /** Opaque colour: the card surface composited over the ground. */
  popupSurface: string;
}

const BLACK: RgbaColor = { r: 0, g: 0, b: 0, a: 1 };
const WHITE: RgbaColor = { r: 255, g: 255, b: 255, a: 1 };

/** Parses the colour serialisations getComputedStyle produces: rgb()/rgba()
 *  and color(srgb r g b / a) (what a color-mix(in srgb, ...) resolves to). */
export function parseCssColor(value: string | null | undefined): RgbaColor | null {
  const text = String(value ?? "").trim();
  let match = text.match(/^rgba?\(([^)]+)\)$/i);
  if (match) {
    const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  match = text.match(/^color\(srgb\s+([^)]+)\)$/i);
  if (match) {
    const parts = match[1].split(/[\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
    return { r: parts[0] * 255, g: parts[1] * 255, b: parts[2] * 255, a: parts.length > 3 ? parts[3] : 1 };
  }
  return null;
}

export function relativeLuminance({ r, g, b }: RgbaColor): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: RgbaColor, b: RgbaColor): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Source-over compositing of `top` onto `bottom`. */
export function compositeOver(top: RgbaColor, bottom: RgbaColor): RgbaColor {
  const a = top.a + bottom.a * (1 - top.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const mix = (c: "r" | "g" | "b") => (top[c] * top.a + bottom[c] * bottom.a * (1 - top.a)) / a;
  return { r: mix("r"), g: mix("g"), b: mix("b"), a };
}

export function formatRgb({ r, g, b }: RgbaColor): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

/**
 * Decides the scheme from the resolved text colour and card surface.
 *
 * An (almost) opaque surface speaks for itself: dark surface, dark scheme.
 * A translucent surface (glass themes) does not, so the text colour picks
 * the ground it reads best on: white text wants the dark scheme even when
 * HA calls the theme "light". Caule Light's mid-grey text on an opaque white
 * card therefore stays light, as it should.
 */
export function resolveThemePolarity(text: RgbaColor, surface: RgbaColor | null): ThemePolarity {
  const base = surface ?? { r: 255, g: 255, b: 255, a: 0 };
  const overBlack = compositeOver(base, BLACK);
  const overWhite = compositeOver(base, WHITE);
  let scheme: ThemeScheme;
  if (base.a >= 0.9) {
    scheme = relativeLuminance(overWhite) < 0.4 ? "dark" : "light";
  } else {
    scheme = contrastRatio(text, overBlack) > contrastRatio(text, overWhite) ? "dark" : "light";
  }
  // The popup rows get the card surface made opaque, untinted: a menu is
  // not a field, and any tint toward the text colour would cost a
  // weak-ceiling theme (Caule Light, 4:1 on its own card) contrast it
  // cannot spare.
  const popup = scheme === "dark" ? overBlack : overWhite;
  return {
    scheme,
    ground: scheme === "dark" ? "#000000" : "#ffffff",
    popupSurface: formatRgb({ ...popup, a: 1 }),
  };
}

/**
 * Reads the theme through `probe` (an element styled with
 * `color: var(--primary-text-color); background-color: var(--sb-card-surface)`)
 * and writes the polarity onto `host` as inline properties. Returns true
 * when anything changed. Cheap enough to run after every render: one
 * getComputedStyle and three string compares.
 */
export function applyThemePolarity(host: HTMLElement, probe: Element): boolean {
  const view = probe.ownerDocument?.defaultView;
  if (!view?.getComputedStyle) return false;
  const computed = view.getComputedStyle(probe);
  const text = parseCssColor(computed.color);
  if (!text) return false;
  const surface = parseCssColor(computed.backgroundColor);
  const polarity = resolveThemePolarity(text, surface);
  const style = host.style;
  let changed = false;
  const set = (name: string, value: string) => {
    if (style.getPropertyValue(name) === value) return;
    style.setProperty(name, value);
    changed = true;
  };
  set("color-scheme", polarity.scheme);
  set("--sb-scheme-ground", polarity.ground);
  set("--sb-popup-surface", polarity.popupSurface);
  return changed;
}
