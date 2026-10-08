// Portrait or landscape for the sidebar remote (docs/internal/sidebar-remote-plan.md).
//
// The remote is a portrait column by default. It only switches to the
// landscape split (wheel left, key rows right) when the portrait column
// would leave the navigation wheel too small to use: the wheel takes
// whatever height is left after the fixed rows, so that size follows from
// the measurements of the rows that are the same in both layouts.

/** The wheel diameter below which the portrait column is not usable. */
export const MIN_PORTRAIT_WHEEL = 240;
/** Once split, portrait only returns when its wheel would be this much larger
 *  than the floor: a resize straddling the floor must not flip back and forth. */
export const LANDSCAPE_HYSTERESIS = 24;
/** Narrower than this and the two-column split has no room either. */
export const MIN_LANDSCAPE_WIDTH = 640;
/** The portrait wheel is at most this share of the column's inner width (see .wheel-wrap). */
const PORTRAIT_WHEEL_SHARE = 0.76;
/** The portrait column's width cap (see .remote). */
const PORTRAIT_MAX_WIDTH = 560;
/** Gaps between the activity line, the wheel and the four key rows in portrait. */
const PORTRAIT_GAPS = 5;

export interface LayoutMeasure {
  /** The remote's own box (the host element). */
  width: number;
  height: number;
  /** Heights of the rows that do not change with the layout, in px. */
  fixedRows: number[];
  /** The pull handle's height, in px. */
  pull: number;
  gap: number;
  pad: number;
}

/** The wheel diameter the portrait column would give. */
export function portraitWheelSize(m: LayoutMeasure): number {
  const fixed = m.fixedRows.reduce((sum, h) => sum + h, 0) + PORTRAIT_GAPS * m.gap + m.pad + m.pull;
  const byHeight = m.height - fixed;
  const byWidth = PORTRAIT_WHEEL_SHARE * (Math.min(m.width, PORTRAIT_MAX_WIDTH) - 2 * m.pad);
  return Math.min(byHeight, byWidth);
}

/** `current` is the layout in use: leaving the split needs the extra margin. */
export function wantsLandscape(m: LayoutMeasure, current = false): boolean {
  if (m.width < MIN_LANDSCAPE_WIDTH || m.width <= m.height) return false;
  const floor = current ? MIN_PORTRAIT_WHEEL + LANDSCAPE_HYSTERESIS : MIN_PORTRAIT_WHEEL;
  return portraitWheelSize(m) < floor;
}
