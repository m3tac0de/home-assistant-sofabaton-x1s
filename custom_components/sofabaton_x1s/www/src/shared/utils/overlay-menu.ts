// Fixed-position overlay menus: pure helpers shared by the tools card and
// the server panel (L-A20: the panel imports pure helpers, never templates
// or CSS, so these left tabs/activity-editor.ts).

/** Matches .member-add-menu's max-height — used for the flip-up estimate. */
const OVERLAY_MENU_MAX_HEIGHT = 240;

/** A DOMRect-shaped box (plain object so the math is testable without a DOM). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

/** A menu trigger captured at click time: its rect and the box its fixed menu is laid out in. */
export interface MenuAnchor {
  rect: Box;
  frame: Box;
}

const viewportBox = (): Box => ({
  left: 0,
  top: 0,
  right: window.innerWidth,
  bottom: window.innerHeight,
  width: window.innerWidth,
  height: window.innerHeight,
});

function parentOf(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** True when `position: fixed` descendants of `el` are laid out against `el` rather than the viewport. */
function isFixedContainingBlock(el: Element): boolean {
  const style = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
  const set = (value: string | undefined) => Boolean(value) && value !== "none";
  if (set(style.transform) || set(style.perspective) || set(style.filter)) return true;
  if (set(style.backdropFilter) || set(style.webkitBackdropFilter)) return true;
  if (set(style.translate) || set(style.rotate) || set(style.scale)) return true;
  if (/\b(paint|layout|strict|content)\b/.test(style.contain)) return true;
  if (/\b(transform|filter|backdrop-filter|perspective|contain)\b/.test(style.willChange)) return true;
  return false;
}

/**
 * The box a `position: fixed` menu rendered next to `el` is laid out
 * against. Normally the viewport, but an ancestor with a transform, filter,
 * backdrop-filter, perspective or paint/layout containment is the containing
 * block instead: glass themes blur ha-card (and dialog surfaces) with
 * backdrop-filter, and every fixed menu inside then measures from that
 * element's corner, not the window's. Walks up through shadow boundaries.
 */
export function fixedFrameBox(el: Element | null): Box {
  let node = el ? parentOf(el) : null;
  while (node && node !== document.documentElement) {
    if (isFixedContainingBlock(node)) return node.getBoundingClientRect();
    node = parentOf(node);
  }
  return viewportBox();
}

/**
 * Inline position for a popup menu, fixed so the detail view's scroll
 * container (overflow-y: auto) can't clip it — absolute positioning always
 * clips at a scroll ancestor, whatever the overflow of the list in between.
 * The anchor is captured from the trigger at click time (menuAnchorRect);
 * the host tab closes any open menu on scroll so a fixed menu never drifts
 * away from its trigger. Flips above the anchor when the space below is too
 * tight. Coordinates are relative to the anchor's frame (fixedFrameBox).
 */
export function overlayMenuPosition(anchor: MenuAnchor | null, align: "left" | "right"): string {
  if (!anchor) return "";
  const { rect, frame } = anchor;
  const gap = 4;
  const spaceBelow = frame.bottom - rect.bottom;
  const openUp = spaceBelow < OVERLAY_MENU_MAX_HEIGHT + gap && rect.top - frame.top > spaceBelow;
  const vertical = openUp
    ? `bottom: ${Math.round(frame.bottom - rect.top + gap)}px; top: auto;`
    : `top: ${Math.round(rect.bottom - frame.top + gap)}px; bottom: auto;`;
  const horizontal = align === "right"
    ? `right: ${Math.round(frame.right - rect.right)}px; left: auto;`
    : `left: ${Math.round(rect.left - frame.left)}px; right: auto;`;
  return `position: fixed; ${vertical} ${horizontal}`;
}

/** The trigger's rect and frame for overlayMenuPosition, read at click time. */
export function menuAnchorRect(event: Event): MenuAnchor | null {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return null;
  return { rect: target.getBoundingClientRect(), frame: fixedFrameBox(target) };
}

export interface AnchoredMenuOptions {
  /** A menu under a small button: at least this wide, right-aligned to the
   *  trigger where that fits, and kept inside `within` (the card or view the
   *  button sits in), so it never opens over whatever lies beside it. */
  minWidth: number;
  within?: HTMLElement | null;
}

/**
 * Inline position for a dropdown list as wide as its trigger (or a menu, see
 * AnchoredMenuOptions), opened inside a modal dialog or a view. Fixed, so a
 * scroll container cannot clip it; measured against the trigger's frame
 * (fixedFrameBox) so it lands on the trigger whatever the fixed containing
 * block is. Flips above the trigger when the space below is tight and caps
 * the height to the side it opens into.
 */
export function anchoredListPosition(trigger: HTMLElement, menu: AnchoredMenuOptions | null = null): string {
  return anchoredListStyle(
    trigger.getBoundingClientRect(),
    fixedFrameBox(trigger),
    menu?.within?.getBoundingClientRect() ?? null,
    menu ? { minWidth: menu.minWidth } : null,
  );
}

/** The pure math behind anchoredListPosition: `anchor` and `inner` in the same coordinates as `bounds`. */
export function anchoredListStyle(anchor: Box, bounds: Box, inner: Box | null, menu: { minWidth: number } | null): string {
  const room = inner ?? bounds;
  const gap = 4;
  const margin = 8;
  // The room the list may use: the frame, narrowed to `inner`.
  const top = Math.max(bounds.top, room.top);
  const bottom = Math.min(bounds.bottom, room.bottom);
  const minX = Math.max(bounds.left, room.left) + margin;
  const maxX = Math.min(bounds.right, room.right) - margin;
  const below = bottom - anchor.bottom - gap - margin;
  const above = anchor.top - top - gap - margin;
  const openUp = below < 200 && above > below;
  const maxHeight = Math.max(120, Math.min(320, openUp ? above : below));
  const vertical = openUp
    ? `bottom: ${Math.round(bounds.bottom - anchor.top + gap)}px; top: auto;`
    : `top: ${Math.round(anchor.bottom - bounds.top + gap)}px; bottom: auto;`;
  const width = menu ? Math.min(Math.max(anchor.width, menu.minWidth), maxX - minX) : anchor.width;
  const left = menu ? Math.min(Math.max(anchor.right - width, minX), maxX - width) : anchor.left;
  return `position: fixed; ${vertical} left: ${Math.round(left - bounds.left)}px; right: auto; width: ${Math.round(width)}px; max-height: ${Math.round(maxHeight)}px;`;
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
