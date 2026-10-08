// Theme measurement for the sidebar remote (docs/internal/sidebar-remote-plan.md).
//
// Every colour the view paints is a CSS color-mix over Home Assistant's
// theme variables (sidebar-remote-styles.ts); three facts cannot be
// expressed in CSS and are measured here on a probe inside the view's
// shadow root:
//   - the primary colour's luminance -> the OK label (white or near-black);
//   - the text colour's luminance   -> the halo colour behind marks on a
//                                      wallpaper;
//   - the card colour's alpha       -> "glass" (the wallpaper themes paint
//                                      translucent cards: one blurred
//                                      backplate, plain translucent pills).
// Re-run whenever `hass.themes` changes; the resolver is pure so it can be
// unit-tested with a fake `readStyle`.

import { parseCssColor, relativeLuminance } from "../remote-embed-theme";

export interface SidebarThemeFacts {
  onPrimary: string;
  halo: string;
  glass: boolean;
}

export const SIDEBAR_THEME_PROBE_CLASS = "sb-sidebar-theme-probe";

/**
 * Resolve the facts from computed colours. `readStyle` returns the computed
 * `color` of a probe styled with the given CSS colour expression.
 */
export function resolveSidebarTheme(readStyle: (cssColor: string) => string | null): SidebarThemeFacts {
  const primary = parseCssColor(readStyle("var(--primary-color)"));
  const text = parseCssColor(readStyle("var(--primary-text-color)"));
  const card = parseCssColorKeepAlpha(
    readStyle("var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))"),
  );
  return {
    onPrimary: primary && relativeLuminance(primary) > 0.4 ? "#111" : "#fff",
    halo: text && relativeLuminance(text) > 0.5 ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.75)",
    glass: card != null && card.a < 1,
  };
}

/** Like parseCssColor but a fully transparent colour still reports its alpha. */
function parseCssColorKeepAlpha(value: string | null): { a: number } | null {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "transparent" || text === "rgba(0, 0, 0, 0)") return { a: 0 };
  const parsed = parseCssColor(text);
  return parsed ? { a: parsed.a } : null;
}

/** Measure through a probe span in `root` and write the facts onto `host`. */
export function applySidebarTheme(host: HTMLElement, root: ShadowRoot | HTMLElement): SidebarThemeFacts {
  const probe = document.createElement("span");
  probe.className = SIDEBAR_THEME_PROBE_CLASS;
  probe.setAttribute("aria-hidden", "true");
  root.appendChild(probe);
  const readStyle = (cssColor: string): string | null => {
    probe.style.color = cssColor;
    return getComputedStyle(probe).color || null;
  };
  let facts: SidebarThemeFacts;
  try {
    facts = resolveSidebarTheme(readStyle);
  } finally {
    probe.remove();
  }
  host.style.setProperty("--sb-on-primary", facts.onPrimary);
  host.style.setProperty("--sb-halo", facts.halo);
  host.toggleAttribute("data-glass", facts.glass);
  return facts;
}
