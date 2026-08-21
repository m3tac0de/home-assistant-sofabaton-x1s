// Gesture plumbing for the remote card, extracted from the legacy class so the
// Lit port reuses the exact same dedupe behavior. The gate logic is pure and
// unit-tested; attachPrimaryAction is the thin DOM wiring around it.

/** Shared dedupe gate for one action group (wrapper + hui-button-card). */
export interface PrimaryActionGate {
  ts: number;
  pointerId: number | null;
  type: string | null;
}

export interface GateEventLike {
  type?: string | null;
  pointerId?: number | null;
}

export function createPrimaryActionGate(): PrimaryActionGate {
  return { ts: 0, pointerId: null, type: null };
}

/**
 * Decide whether an event may fire the action; arms the gate when it may.
 * Mobile browsers / HA can dispatch several event types for one gesture
 * (pointerup + touchend + click/ha-click), possibly across two elements:
 * - anything within 450ms of the last handled event is dropped;
 * - click-ish events within 1200ms of a handled pointer/touch are dropped
 *   ("ghost clicks" on some mobile setups).
 */
export function primaryActionGateAllows(
  gate: PrimaryActionGate,
  ev: GateEventLike | null | undefined,
  now: number,
): boolean {
  const pid = ev && typeof ev.pointerId === "number" ? ev.pointerId : null;
  const etype = ev?.type || null;

  const delta = now - gate.ts;

  if (delta < 450) {
    return false;
  }

  if (
    delta < 1200 &&
    (gate.type === "pointerup" || gate.type === "touchend") &&
    (etype === "click" || etype === "ha-click" || etype === "tap")
  ) {
    return false;
  }

  gate.ts = now;
  gate.pointerId = pid;
  gate.type = etype;
  return true;
}

/**
 * Wire the primary action of one or more elements through a shared gate.
 * Capture phase so the action still triggers when inner elements stop
 * bubbling; the smallest viable event set, because extra listeners are a
 * major source of duplicate sends.
 */
export function attachPrimaryAction(
  els: Element | Element[] | null | undefined,
  fn: (ev: Event) => void,
  options: { fireHaptic?: () => void } = {},
): void {
  const targets = (Array.isArray(els) ? els : [els]).filter(
    (el): el is Element => Boolean(el),
  );

  const gate = createPrimaryActionGate();

  const wrapped = (ev: Event) => {
    if (!primaryActionGateAllows(gate, ev as GateEventLike, Date.now())) return;

    // Prevent Home Assistant / inner elements from swallowing the action.
    if (typeof ev.preventDefault === "function") ev.preventDefault();
    if (typeof ev.stopPropagation === "function") ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function")
      ev.stopImmediatePropagation();

    try {
      options.fireHaptic?.();
      fn(ev);
    } catch (e) {
      /* no-op */
    }
  };

  const hasPointer = typeof window !== "undefined" && "PointerEvent" in window;
  for (const el of targets) {
    if (hasPointer) {
      el.addEventListener("pointerup", wrapped, {
        capture: true,
        passive: false,
      });
    } else {
      el.addEventListener("touchend", wrapped, {
        capture: true,
        passive: false,
      });
      el.addEventListener("click", wrapped, { capture: true });
    }
    // Home Assistant sometimes dispatches custom click events (keep as fallback)
    el.addEventListener("ha-click", wrapped, { capture: true });
  }
}

// ---------- drawer geometry ----------

/** Keep in sync with CSS `.mf-overlay { max-height: ... }`. */
export const DRAWER_MAX_HEIGHT = 350;

/** CSS close transition is 0.25s; direction resets just after. */
export const DRAWER_DIRECTION_RESET_MS = 260;

/** Estimate how much vertical room the drawer wants (small fudge for borders). */
export function drawerDesiredHeight(
  scrollHeight: number,
  maxHeight = DRAWER_MAX_HEIGHT,
): number {
  return Math.min(scrollHeight || 0, maxHeight) + 8;
}

export interface DrawerDirectionInput {
  desired: number;
  rowTop: number;
  rowBottom: number;
  /** ha-card bounds; when absent, falls back to viewport space. */
  cardTop?: number | null;
  cardBottom?: number | null;
  viewportHeight: number;
}

/**
 * Choose the drawer opening direction. Prefers staying within the CARD
 * rather than the viewport: pick the direction that keeps MORE of the
 * drawer inside the card (tie-breaker: down).
 */
export function drawerDirection(input: DrawerDirectionInput): "up" | "down" {
  const { desired, rowTop, rowBottom, cardTop, cardBottom, viewportHeight } =
    input;

  if (cardTop == null || cardBottom == null) {
    // Fallback to the old viewport behavior if we can't measure the card.
    const spaceBelow = viewportHeight - rowBottom;
    const spaceAbove = rowTop;
    const shouldOpenUp = spaceBelow < desired && spaceAbove > spaceBelow;
    return shouldOpenUp ? "up" : "down";
  }

  const spaceBelowInCard = cardBottom - rowBottom;
  const spaceAboveInCard = rowTop - cardTop;

  const overlapDown = Math.max(0, Math.min(desired, spaceBelowInCard));
  const overlapUp = Math.max(0, Math.min(desired, spaceAboveInCard));

  return overlapUp > overlapDown ? "up" : "down";
}

/**
 * Device-mode Commands drawer: a device almost always has more commands than
 * an activity has macros + favorites, so the overlay ignores the 350px cap
 * and takes the space available in its opening direction — WITHIN the card:
 * the drawer never extends beyond the card's own boundaries. Card bounds
 * absent (unmeasurable) falls back to the viewport.
 */
export function commandsOverlayMaxHeight({
  up,
  rowTop,
  rowBottom,
  cardTop,
  cardBottom,
  viewportHeight,
}: {
  up: boolean;
  rowTop: number;
  rowBottom: number;
  cardTop?: number | null;
  cardBottom?: number | null;
  viewportHeight: number;
}): number {
  const available = up
    ? rowTop - (cardTop ?? 0)
    : (cardBottom ?? viewportHeight) - rowBottom;
  // Small floor so a cramped layout still shows a usable sliver, but never
  // more than the in-card space itself.
  return Math.max(Math.min(120, Math.floor(available)), Math.floor(available - 12));
}

// ---------- layering ----------

/**
 * z-index pair for the activity row vs the macro/favorites container.
 * Priority: an open activity dropdown stays on top; otherwise an open
 * drawer is raised above the activity row.
 */
export function layeringZIndexes(
  menuOpen: boolean,
  drawerOpen: boolean,
): { activity: string; drawer: string } {
  if (menuOpen) {
    return { activity: "10", drawer: drawerOpen ? "9" : "2" };
  }
  if (drawerOpen) {
    return { activity: "2", drawer: "10" };
  }
  return { activity: "3", drawer: "2" };
}

// ---------- long press (hold-to-repeat) ----------

/** Hold this long before the first repeat fires. */
export const HOLD_REPEAT_DELAY_MS = 400;
/** Spacing between repeats while the button stays held. */
export const HOLD_REPEAT_INTERVAL_MS = 250;

export interface HoldRepeatTimerOptions {
  delayMs?: number;
  intervalMs?: number;
  /** Injected timer functions (tests); default to the globals. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

/**
 * Hold-to-repeat state for one button. start() on pointerdown arms the delay;
 * once it elapses `fire` runs and keeps running every interval until stop().
 * Whether a repeat fired is remembered until consumeFired() reads it, so the
 * release tap (pointerup) of a hold that already repeated can be suppressed
 * instead of sending one more command. start() always clears that memory.
 */
/** Event type an sb-key-button hands to onTrigger for every hold repeat. */
export const HOLD_REPEAT_EVENT_TYPE = "sb-hold-repeat";

/**
 * 1-based repeat index carried by a hold-repeat trigger event, or 0 for any
 * other trigger (tap, keyboard activation, ha-click).
 */
export function holdRepeatIndexOf(ev: Event | null | undefined): number {
  if (!ev || ev.type !== HOLD_REPEAT_EVENT_TYPE) return 0;
  const detail = (ev as CustomEvent<unknown>).detail;
  const index = typeof detail === "number" ? detail : Number(detail);
  return Number.isFinite(index) && index > 0 ? index : 0;
}

export class HoldRepeatTimer {
  private readonly fire: (repeatIndex: number) => void;
  private readonly delayMs: number;
  private readonly intervalMs: number;
  private readonly timers: Required<
    Pick<HoldRepeatTimerOptions, "setTimeout" | "clearTimeout" | "setInterval" | "clearInterval">
  >;
  private delayHandle: unknown = null;
  private intervalHandle: unknown = null;
  private repeats = 0;
  private fired = false;

  constructor(fire: (repeatIndex: number) => void, options: HoldRepeatTimerOptions = {}) {
    this.fire = fire;
    this.delayMs = options.delayMs ?? HOLD_REPEAT_DELAY_MS;
    this.intervalMs = options.intervalMs ?? HOLD_REPEAT_INTERVAL_MS;
    this.timers = {
      setTimeout: options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeout: options.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>)),
      setInterval: options.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
      clearInterval:
        options.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>)),
    };
  }

  /** True while a hold is armed or repeating. */
  get active(): boolean {
    return this.delayHandle != null || this.intervalHandle != null;
  }

  /** Repeats fired during the current/last hold. */
  get repeatCount(): number {
    return this.repeats;
  }

  start(): void {
    this.clearTimers();
    this.fired = false;
    this.repeats = 0;
    this.delayHandle = this.timers.setTimeout(() => {
      this.delayHandle = null;
      this.tick();
      this.intervalHandle = this.timers.setInterval(() => this.tick(), this.intervalMs);
    }, this.delayMs);
  }

  /** Stop repeating. Returns whether this hold fired at least once. */
  stop(): boolean {
    this.clearTimers();
    return this.fired;
  }

  /**
   * Read-and-clear the "a repeat fired" memory. The release tap that follows
   * a hold calls this and skips its own send when it returns true.
   */
  consumeFired(): boolean {
    const fired = this.fired;
    this.fired = false;
    return fired;
  }

  private tick(): void {
    this.fired = true;
    this.repeats += 1;
    try {
      this.fire(this.repeats);
    } catch (e) {
      /* no-op: a failing send must not stop the repeat loop */
    }
  }

  private clearTimers(): void {
    if (this.delayHandle != null) {
      this.timers.clearTimeout(this.delayHandle);
      this.delayHandle = null;
    }
    if (this.intervalHandle != null) {
      this.timers.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}
