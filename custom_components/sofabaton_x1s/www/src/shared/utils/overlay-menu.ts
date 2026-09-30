// Fixed-position overlay menus: pure helpers shared by the tools card and
// the server panel (L-A20: the panel imports pure helpers, never templates
// or CSS, so these left tabs/activity-editor.ts).

/** Matches .member-add-menu's max-height — used for the flip-up estimate. */
const OVERLAY_MENU_MAX_HEIGHT = 240;

/**
 * Inline position for a popup menu, fixed to the viewport so the detail
 * view's scroll container (overflow-y: auto) can't clip it — absolute
 * positioning always clips at a scroll ancestor, whatever the overflow
 * of the list in between. The anchor rect is captured from the trigger
 * at click time; the host tab closes any open menu on scroll so a fixed
 * menu never drifts away from its trigger. Flips above the anchor when
 * the space below is too tight.
 */
export function overlayMenuPosition(anchor: DOMRect | null, align: "left" | "right"): string {
  if (!anchor) return "";
  const gap = 4;
  const spaceBelow = window.innerHeight - anchor.bottom;
  const openUp = spaceBelow < OVERLAY_MENU_MAX_HEIGHT + gap && anchor.top > spaceBelow;
  const vertical = openUp
    ? `bottom: ${Math.round(window.innerHeight - anchor.top + gap)}px; top: auto;`
    : `top: ${Math.round(anchor.bottom + gap)}px; bottom: auto;`;
  const horizontal = align === "right"
    ? `right: ${Math.round(window.innerWidth - anchor.right)}px; left: auto;`
    : `left: ${Math.round(anchor.left)}px; right: auto;`;
  return `position: fixed; ${vertical} ${horizontal}`;
}

/** The trigger rect for overlayMenuPosition, read at click time. */
export function menuAnchorRect(event: Event): DOMRect | null {
  const target = event.currentTarget;
  return target instanceof HTMLElement ? target.getBoundingClientRect() : null;
}
