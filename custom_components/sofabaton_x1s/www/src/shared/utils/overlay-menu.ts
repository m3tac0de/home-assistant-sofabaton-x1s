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

/**
 * Inline position for a dropdown list as wide as its trigger, opened inside
 * a modal dialog. Fixed, so the dialog body's scroll container cannot clip
 * it; the coordinates are taken relative to `frame` (the modal backdrop,
 * itself fixed) so they hold whatever the fixed containing block is. Flips
 * above the trigger when the space below is tight and caps the height to
 * the side it opens into.
 */
export function anchoredListPosition(trigger: HTMLElement, frame: HTMLElement | null): string {
  const anchor = trigger.getBoundingClientRect();
  const bounds = frame?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const gap = 4;
  const margin = 8;
  const below = bounds.bottom - anchor.bottom - gap - margin;
  const above = anchor.top - bounds.top - gap - margin;
  const openUp = below < 200 && above > below;
  const maxHeight = Math.max(120, Math.min(320, openUp ? above : below));
  const vertical = openUp
    ? `bottom: ${Math.round(bounds.bottom - anchor.top + gap)}px; top: auto;`
    : `top: ${Math.round(anchor.bottom - bounds.top + gap)}px; bottom: auto;`;
  return `position: fixed; ${vertical} left: ${Math.round(anchor.left - bounds.left)}px; width: ${Math.round(anchor.width)}px; max-height: ${Math.round(maxHeight)}px;`;
}

/**
 * Arrow / Home / End movement between the option buttons of an open list
 * (the keydown listener sits on the list). True when the key was handled.
 */
export function moveListFocus(event: KeyboardEvent, optionSelector: string): boolean {
  const list = event.currentTarget;
  if (!(list instanceof HTMLElement)) return false;
  const options = [...list.querySelectorAll<HTMLElement>(optionSelector)];
  if (!options.length) return false;
  const current = options.findIndex((option) => option === (list.getRootNode() as Document | ShadowRoot).activeElement);
  const next = event.key === "ArrowDown" ? Math.min(options.length - 1, current + 1)
    : event.key === "ArrowUp" ? Math.max(0, current - 1)
    : event.key === "Home" ? 0
    : event.key === "End" ? options.length - 1
    : -1;
  if (next < 0) return false;
  event.preventDefault();
  options[next].focus();
  return true;
}
