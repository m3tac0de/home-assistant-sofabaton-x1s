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

/** A menu trigger captured at click time: its rect, the box its fixed menu is laid out in, and its writing direction. */
export interface MenuAnchor {
  rect: Box;
  frame: Box;
  rtl?: boolean;
}

/** True when `el` lays out right-to-left (an RTL Home Assistant language, inherited through the shadow roots). */
export function isRtl(el: Element): boolean {
  return getComputedStyle(el).direction === "rtl";
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
 * a TriggerFollower captures it again when the trigger moves (a resize, a
 * layout shift), and the host tab closes any open menu on scroll. Flips above the anchor when the space below is too
 * tight. Coordinates are relative to the anchor's frame (fixedFrameBox).
 * `align` names the trigger edge the menu lines up with, in the anchor's
 * writing direction: "end" is the right edge, or the left one in RTL.
 */
export function overlayMenuPosition(anchor: MenuAnchor | null, align: "start" | "end"): string {
  if (!anchor) return "";
  const { rect, frame } = anchor;
  const gap = 4;
  const spaceBelow = frame.bottom - rect.bottom;
  const openUp = spaceBelow < OVERLAY_MENU_MAX_HEIGHT + gap && rect.top - frame.top > spaceBelow;
  const vertical = openUp
    ? `bottom: ${Math.round(frame.bottom - rect.top + gap)}px; top: auto;`
    : `top: ${Math.round(rect.bottom - frame.top + gap)}px; bottom: auto;`;
  const horizontal = (align === "end") !== Boolean(anchor.rtl)
    ? `right: ${Math.round(frame.right - rect.right)}px; left: auto;`
    : `left: ${Math.round(rect.left - frame.left)}px; right: auto;`;
  return `position: fixed; ${vertical} ${horizontal}`;
}

/** The trigger's rect and frame for overlayMenuPosition, read now. */
export function menuAnchorOf(trigger: HTMLElement): MenuAnchor {
  return { rect: trigger.getBoundingClientRect(), frame: fixedFrameBox(trigger), rtl: isRtl(trigger) };
}

/** The trigger's rect and frame for overlayMenuPosition, read at click time. */
export function menuAnchorRect(event: Event): MenuAnchor | null {
  const target = event.currentTarget;
  return target instanceof HTMLElement ? menuAnchorOf(target) : null;
}

export interface AnchoredMenuOptions {
  /** A menu under a small button: at least this wide, aligned to the
   *  trigger's end edge (right, or left in RTL) where that fits, and kept
   *  inside `within` (the card or view the button sits in), so it never
   *  opens over whatever lies beside it. */
  minWidth: number;
  within?: HTMLElement | null;
  /** The tallest the menu may grow (320 px when absent). */
  maxHeight?: number;
  /** `within` bounds the width only: the menu may run past its bottom (or
   *  top) up to the frame's, so a popover under a short view's header is
   *  not squeezed into that view. */
  widthOnly?: boolean;
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
    menu ? { minWidth: menu.minWidth, rtl: isRtl(trigger), maxHeight: menu.maxHeight, widthOnly: menu.widthOnly } : null,
  );
}

/** A header pill's popover (the delivery and IR pills): at least 320 px
 *  wide, up to 560 px tall, kept to the width of the view it sits in. */
export function pillPopoverOptions(trigger: HTMLElement): AnchoredMenuOptions {
  return { minWidth: 320, maxHeight: 560, within: trigger.closest<HTMLElement>(".detail-view"), widthOnly: true };
}

const boxKey = (box: DOMRect | null | undefined) =>
  box ? `${Math.round(box.left)},${Math.round(box.top)},${Math.round(box.width)},${Math.round(box.height)}` : "-";

export interface TriggerFollowOptions<T> {
  /** Where the popup goes for the trigger where it is now. */
  measure: (trigger: HTMLElement) => T;
  /** A new placement: the host stores it and re-renders. */
  apply: (placement: T) => void;
  /** The trigger again, when a render replaced the element it opened from. */
  find?: () => HTMLElement | null;
  /** The box the popup is kept inside: it moving or resizing counts too. */
  within?: (trigger: HTMLElement) => HTMLElement | null | undefined;
  /** Two placements land in the same spot (no re-render); `===` when absent. */
  same?: (a: T, b: T) => boolean;
}

/**
 * Keeps an open fixed popup on its trigger. The placement is measured when
 * the popup opens, so a window resize or a layout change underneath moves
 * the trigger and leaves the popup where it opened. While following, every
 * animation frame compares the trigger's box, the `within` box and the
 * window size with the last frame and measures again when one changed: two
 * rect reads a frame, and only while a popup is open.
 */
export class TriggerFollower<T> {
  private _trigger: HTMLElement | null = null;
  private _frame: number | null = null;
  private _key = "";
  private _placement: T | undefined;

  constructor(private readonly _opts: TriggerFollowOptions<T>) {}

  get following(): boolean {
    return this._trigger !== null;
  }

  /** Measure the placement for `trigger` and follow it from here on. */
  start(trigger: HTMLElement): T {
    this.stop();
    this._trigger = trigger;
    this._key = this._keyOf(trigger);
    const placement = this._opts.measure(trigger);
    this._placement = placement;
    this._schedule();
    return placement;
  }

  stop(): void {
    this._trigger = null;
    this._placement = undefined;
    if (this._frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this._frame);
    this._frame = null;
  }

  private _keyOf(trigger: HTMLElement): string {
    const within = this._opts.within?.(trigger);
    return `${boxKey(trigger.getBoundingClientRect())}|${boxKey(within?.getBoundingClientRect())}|${window.innerWidth}x${window.innerHeight}`;
  }

  private _schedule(): void {
    if (typeof requestAnimationFrame !== "function") return;
    this._frame = requestAnimationFrame(this._tick);
  }

  private _tick = (): void => {
    this._frame = null;
    if (!this._trigger) return;
    if (!this._trigger.isConnected) this._trigger = this._opts.find?.() ?? this._trigger;
    const trigger = this._trigger;
    // A trigger out of the document, or hidden, keeps the last placement.
    if (trigger.isConnected && trigger.getClientRects().length) {
      const key = this._keyOf(trigger);
      if (key !== this._key) {
        this._key = key;
        const placement = this._opts.measure(trigger);
        const last = this._placement as T;
        if (!(this._opts.same ? this._opts.same(placement, last) : placement === last)) {
          this._placement = placement;
          this._opts.apply(placement);
        }
      }
    }
    if (this._trigger) this._schedule();
  };
}

/** A TriggerFollower for an anchoredListPosition popup: the placement is its inline style. */
export class AnchoredListFollower extends TriggerFollower<string> {
  /**
   * `options` is anchoredListPosition's for the trigger (null: as wide as
   * the trigger); `apply` stores a re-measured style; `find` gives the
   * trigger again when a render replaced it.
   */
  constructor(
    options: (trigger: HTMLElement) => AnchoredMenuOptions | null,
    apply: (style: string) => void,
    find?: () => HTMLElement | null,
  ) {
    super({
      measure: (trigger) => anchoredListPosition(trigger, options(trigger)),
      within: (trigger) => options(trigger)?.within,
      apply,
      find,
    });
  }
}

/** A TriggerFollower for an overlayMenuPosition menu: the placement is the trigger's anchor. */
export function followMenuAnchor(
  align: "start" | "end",
  apply: (anchor: MenuAnchor) => void,
  find?: () => HTMLElement | null,
): TriggerFollower<MenuAnchor> {
  return new TriggerFollower<MenuAnchor>({
    measure: menuAnchorOf,
    apply,
    find,
    same: (a, b) => overlayMenuPosition(a, align) === overlayMenuPosition(b, align),
  });
}

/** The pure math behind anchoredListPosition: `anchor` and `inner` in the same coordinates as `bounds`. */
export function anchoredListStyle(anchor: Box, bounds: Box, inner: Box | null, menu: { minWidth: number; rtl?: boolean; maxHeight?: number; widthOnly?: boolean } | null): string {
  const room = inner ?? bounds;
  const tall = menu?.widthOnly ? bounds : room;
  const gap = 4;
  const margin = 8;
  // The room the list may use: the frame, narrowed to `inner`.
  const top = Math.max(bounds.top, tall.top);
  const bottom = Math.min(bounds.bottom, tall.bottom);
  const minX = Math.max(bounds.left, room.left) + margin;
  const maxX = Math.min(bounds.right, room.right) - margin;
  const below = bottom - anchor.bottom - gap - margin;
  const above = anchor.top - top - gap - margin;
  const openUp = below < 200 && above > below;
  const maxHeight = Math.max(120, Math.min(menu?.maxHeight ?? 320, openUp ? above : below));
  const vertical = openUp
    ? `bottom: ${Math.round(bounds.bottom - anchor.top + gap)}px; top: auto;`
    : `top: ${Math.round(anchor.bottom - bounds.top + gap)}px; bottom: auto;`;
  const width = menu ? Math.min(Math.max(anchor.width, menu.minWidth), maxX - minX) : anchor.width;
  const ideal = menu && !menu.rtl ? anchor.right - width : anchor.left;
  const left = menu ? Math.min(Math.max(ideal, minX), maxX - width) : anchor.left;
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
