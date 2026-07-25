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
