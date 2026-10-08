// Pointer wiring for the sidebar remote's keys (docs/internal/sidebar-remote-plan.md).
//
// One controller per view, delegated from the remote's root: a pointerdown
// on `[data-key]` starts a hold (hold-repeat or long-press per
// sidebarHoldKind, nothing for a plain key), a pointerup on the same key
// is the tap unless the hold already fired, and a pointercancel / leave /
// lost capture ends the hold without a tap. Keyboard activation (Enter /
// Space) is a tap. Only pointer events are used for touch and mouse, so
// the ghost-click problem the dashboard card dedupes never arises here.
// The timers are the card's (remote-card-gestures.ts).
//
// Elements marked `[data-press]` (the sheets' tiles and rows) get the visual
// press only: down adds the pressed state, any ending removes it, and their
// own click handler stays the action. No capture and no preventDefault, so
// the native click, focus and scroll semantics stay: a release that drifted
// off (mouse) or turned into a scroll (touch) never fires the item.

import { HoldRepeatTimer, LongPressTimer } from "../remote-card-gestures";
import { sidebarHoldKind, type SidebarHoldKind } from "./sidebar-hold";

export interface SidebarPressHandlers {
  /** The key id (number) and spec key of a `[data-key]` element, or null. */
  resolve(el: Element): { key: string; id: number } | null;
  hasLongPress(id: number): boolean;
  isEnabled(id: number): boolean;
  /** `at` is where the finger / pointer went down, in viewport coordinates. */
  onTap(id: number, el: Element, at: { x: number; y: number }): void;
  onRepeat(id: number, index: number, el: Element, at: { x: number; y: number }): void;
  onLongPress(id: number, el: Element, at: { x: number; y: number }): void;
  /** Visual press state: called on down (true) and on every ending (false). */
  onPressed(el: Element, pressed: boolean): void;
  /** One haptic per gesture start (hold engage or tap). */
  haptic(): void;
}

interface ActiveHold {
  el: Element;
  id: number;
  kind: SidebarHoldKind | "visual";
  repeat: HoldRepeatTimer | null;
  long: LongPressTimer | null;
  at: { x: number; y: number };
}

export class SidebarPressController {
  private readonly holds = new Map<number, ActiveHold>();

  constructor(private readonly root: EventTarget, private readonly handlers: SidebarPressHandlers) {
    root.addEventListener("pointerdown", this.onDown as EventListener, { capture: true });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      root.addEventListener(type, this.onEnd as EventListener, { capture: true });
    }
    root.addEventListener("pointerleave", this.onLeave as EventListener, { capture: true });
    root.addEventListener("pointermove", this.onMove as EventListener, { capture: true });
    root.addEventListener("keydown", this.onKey as EventListener);
    root.addEventListener("contextmenu", this.onContextMenu as EventListener);
  }

  dispose(): void {
    for (const hold of this.holds.values()) this.stopTimers(hold);
    this.holds.clear();
  }

  /** The element under a pointer event that is a key or a `[data-press]` item, or null. */
  private keyElement(ev: Event): Element | null {
    const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
    for (const node of path) {
      if (node instanceof Element && (node.hasAttribute("data-key") || node.hasAttribute("data-press"))) return node;
      if (node === this.root) break;
    }
    return null;
  }

  private readonly onDown = (ev: PointerEvent): void => {
    if (ev.isPrimary === false || (typeof ev.button === "number" && ev.button !== 0)) return;
    const el = this.keyElement(ev);
    if (!el) return;
    const at = { x: ev.clientX, y: ev.clientY };
    if (!el.hasAttribute("data-key")) {
      // A sheet item: the press is visual only, its click is the action.
      if ((el as HTMLButtonElement).disabled) return;
      this.holds.set(ev.pointerId, { el, id: -1, kind: "visual", repeat: null, long: null, at });
      this.handlers.onPressed(el, true);
      return;
    }
    const key = this.handlers.resolve(el);
    if (!key || !this.handlers.isEnabled(key.id)) return;
    ev.preventDefault();
    const kind = sidebarHoldKind(key.key, this.handlers.hasLongPress(key.id));
    const hold: ActiveHold = { el, id: key.id, kind, repeat: null, long: null, at };
    if (kind === "repeat") {
      hold.repeat = new HoldRepeatTimer((index) => {
        if (index === 1) this.handlers.haptic();
        this.handlers.onRepeat(key.id, index, el, at);
      });
      hold.repeat.start();
    } else if (kind === "long-press") {
      hold.long = new LongPressTimer(() => {
        this.handlers.haptic();
        this.handlers.onLongPress(key.id, el, at);
      });
      hold.long.start();
    }
    // Touch pointers are implicitly captured by the target; the mouse is
    // captured explicitly so a drag off the key still ends the hold here.
    try {
      (el as HTMLElement).setPointerCapture?.(ev.pointerId);
    } catch {
      /* capture is best-effort */
    }
    this.holds.set(ev.pointerId, hold);
    this.handlers.onPressed(el, true);
  };

  private readonly onEnd = (ev: PointerEvent): void => {
    const hold = this.holds.get(ev.pointerId);
    if (!hold) return;
    if (ev.type === "lostpointercapture" && this.holds.get(ev.pointerId) !== hold) return;
    this.holds.delete(ev.pointerId);
    this.handlers.onPressed(hold.el, false);
    const fired = this.stopTimers(hold);
    if (hold.kind === "visual") return;
    if (ev.type !== "pointerup") return;
    // The release of a hold that repeated or fired its binding is not a tap.
    if (fired) return;
    // A release that drifted off the key is not a tap either.
    if (!this.pointerOver(hold.el, ev)) return;
    this.handlers.haptic();
    this.handlers.onTap(hold.id, hold.el, hold.at);
  };

  private readonly onLeave = (ev: PointerEvent): void => {
    // Mouse only: leaving the key ends a hold (touch stays captured).
    if (ev.pointerType !== "mouse") return;
    const hold = this.holds.get(ev.pointerId);
    if (!hold || ev.target !== hold.el) return;
    this.holds.delete(ev.pointerId);
    this.handlers.onPressed(hold.el, false);
    this.stopTimers(hold);
  };

  private readonly onMove = (ev: PointerEvent): void => {
    // Sheet items only: a pointer that moved off the item ends the visual
    // press there (no capture, so the native click will not fire either).
    // Checked by position: a held mouse button keeps targeting the item,
    // so the boundary events are not relied on.
    const hold = this.holds.get(ev.pointerId);
    if (!hold || hold.kind !== "visual" || this.pointerOver(hold.el, ev)) return;
    this.holds.delete(ev.pointerId);
    this.handlers.onPressed(hold.el, false);
  };

  private readonly onKey = (ev: KeyboardEvent): void => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const el = this.keyElement(ev);
    if (!el) return;
    const key = this.handlers.resolve(el);
    if (!key || !this.handlers.isEnabled(key.id)) return;
    ev.preventDefault();
    const r = el.getBoundingClientRect();
    this.handlers.onTap(key.id, el, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  private readonly onContextMenu = (ev: Event): void => {
    // A long touch would otherwise open the context menu and cancel the hold.
    if (this.keyElement(ev)) ev.preventDefault();
  };

  private stopTimers(hold: ActiveHold): boolean {
    let fired = false;
    if (hold.repeat) fired = hold.repeat.stop() || fired;
    if (hold.long) fired = hold.long.stop() || fired;
    return fired;
  }

  private pointerOver(el: Element, ev: PointerEvent): boolean {
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return true;
    return ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
  }
}
