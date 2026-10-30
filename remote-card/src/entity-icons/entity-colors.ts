// Activity/device colors. Only the X2 stores one: a palette id (1-12) in the
// entity record, which the X2 app draws the icon tile in. 0 means none was
// picked; the app draws that, and any id it does not know, as 1 (grey).

import { iconHubLine } from "./entity-icons";

const PALETTE: Readonly<Record<number, string>> = {
  1: "#7F7F7F",
  2: "#F16161",
  3: "#2E385E",
  4: "#8171B4",
  5: "#64BB80",
  6: "#E39E89",
  7: "#00A8E0",
  8: "#717FB4",
  9: "#56CBCB",
  10: "#BCAD90",
  11: "#6EACEB",
  12: "#97A5DB",
};

/** The palette ids a color picker offers, in the app's order. */
export const ENTITY_COLOR_IDS: readonly number[] = Object.keys(PALETTE).map(Number);

/** Whether this hub stores activity and device colors (the X2 only). */
export function entityColorsSupported(hubVersion: string | null | undefined): boolean {
  return iconHubLine(hubVersion) === "X2";
}

/** The palette id's color as the app draws it (0 and unknown ids as grey). */
export function entityColorHex(colorId: number | null | undefined): string {
  return PALETTE[Number(colorId)] ?? PALETTE[1];
}

/** The tile color for a stored palette id, or null on a hub without colors. */
export function entityColor(hubVersion: string | null | undefined, colorId: number | null | undefined): string | null {
  return entityColorsSupported(hubVersion) ? entityColorHex(colorId) : null;
}
