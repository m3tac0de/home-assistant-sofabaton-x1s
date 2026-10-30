// Activity/device icons per hub line. Every line stores the icon as one
// byte in the entity record, but the vendor app offers a different set per
// line: the X2 45 icons, the X1S 16 (the same ids and meanings, older
// artwork), the X1 25 icons numbered on their own. The app shows icon 1 (a
// TV) for an id outside its line's set, and so does entityIconPath.

import { X1S_ICON_PATHS, X1_ICON_PATHS, X2_ICON_NAMES, X2_ICON_PATHS } from "./x2-icons";

export type IconHubLine = "X1" | "X1S" | "X2";

/** How many icons each line's app offers; ids run 1..count. */
export const ENTITY_ICON_COUNT: Readonly<Record<IconHubLine, number>> = { X1: 25, X1S: 16, X2: 45 };

/** X1 icon ids drawn with an X2 icon: the same object, or the X2's nearest
 *  one (2 HD TV, 3 TV on a stand, 11 gamepad). The other X1 ids have their
 *  own drawings in X1_ICON_PATHS. */
const X1_ICON_AS_X2: Readonly<Record<number, number>> = {
  1: 1, 2: 18, 3: 32, 4: 2, 5: 3, 9: 7, 11: 6, 15: 14, 20: 9,
};

/** X1S ids whose X1S artwork shows another object than the X2 drawing at
 *  the same id (the X2 redrew the set): they take the X1 drawing of that
 *  object, so the X1S shows what its own remote shows. 9 is the one that
 *  matters most: an AV receiver on the X1S, a wifi router on the X2. The
 *  redrawn objects no X1 drawing shows have their own in X1S_ICON_PATHS. */
const X1S_ICON_AS_X1: Readonly<Record<number, number>> = { 4: 6, 5: 8, 6: 10, 9: 22, 13: 13, 16: 16 };

/** Names of the X1S icons drawn on their own (X1S_ICON_PATHS). */
const X1S_ICON_NAMES: Readonly<Record<number, string>> = { 8: "Set-top box", 11: "Speakers", 12: "Bulb", 15: "amazon" };

/** The X1 app's own names for its 25 icons. */
const X1_ICON_NAMES: Readonly<Record<number, string>> = {
  1: "TV", 2: "HD TV", 3: "TV on a stand", 4: "Picture", 5: "Music", 6: "3D glasses", 7: "TV with menu",
  8: "Clapperboard", 9: "Gamepad", 10: "Handheld console", 11: "Gamepad", 12: "Retro console", 13: "Apple",
  14: "VUDU", 15: "Roku", 16: "Netflix", 17: "Home", 18: "Computer", 19: "Speaker", 20: "Set-top box",
  21: "Bulb", 22: "AV receiver", 23: "Projector", 24: "Disc player", 25: "amazon",
};

/** Icon ids that are a service's logo rather than a picture, per line; a
 *  picker lists them in a group of their own. */
const SERVICE_ICON_IDS: Readonly<Record<IconHubLine, readonly number[]>> = {
  X1: [13, 14, 15, 16, 25],
  X1S: [13, 14, 15, 16],
  X2: [13, 14, 15, 16, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45],
};

/** The hub line a hub version names ("X1" / "X1S" / "X2", any case, banner
 *  suffixes allowed), or null when it names none of them. */
export function iconHubLine(hubVersion: string | null | undefined): IconHubLine | null {
  const version = String(hubVersion ?? "").trim().toUpperCase();
  if (version.includes("X1S")) return "X1S";
  if (version.includes("X2")) return "X2";
  if (version.includes("X1")) return "X1";
  return null;
}

/** The icon ids an icon picker offers on this hub, in the app's order. */
export function entityIconIds(hubVersion: string | null | undefined): number[] {
  const line = iconHubLine(hubVersion);
  return line ? Array.from({ length: ENTITY_ICON_COUNT[line] }, (_, i) => i + 1) : [];
}

/** The picker's two groups on this hub: pictures, then service logos. */
export function entityIconGroups(hubVersion: string | null | undefined): { pictures: number[]; services: number[] } {
  const line = iconHubLine(hubVersion);
  if (!line) return { pictures: [], services: [] };
  const services = new Set(SERVICE_ICON_IDS[line]);
  const ids = entityIconIds(hubVersion);
  return { pictures: ids.filter((id) => !services.has(id)), services: ids.filter((id) => services.has(id)) };
}

function lineIconId(line: IconHubLine, iconId: number): number {
  return Number.isInteger(iconId) && iconId >= 1 && iconId <= ENTITY_ICON_COUNT[line] ? iconId : 1;
}

/** The 24x24 path for the icon an activity/device record stores, as this
 *  hub's app shows it; null only when the hub version names no line. */
export function entityIconPath(hubVersion: string | null | undefined, iconId: number): string | null {
  const line = iconHubLine(hubVersion);
  if (!line) return null;
  const id = lineIconId(line, iconId);
  if (line === "X1") return X1_ICON_PATHS[id] ?? X2_ICON_PATHS[X1_ICON_AS_X2[id]];
  if (line === "X1S" && X1S_ICON_PATHS[id]) return X1S_ICON_PATHS[id];
  if (line === "X1S" && X1S_ICON_AS_X1[id]) return X1_ICON_PATHS[X1S_ICON_AS_X1[id]];
  return X2_ICON_PATHS[id];
}

/** The icon's English name as this hub's app has it, for labels; "" when
 *  the hub version names no line. */
export function entityIconName(hubVersion: string | null | undefined, iconId: number): string {
  const line = iconHubLine(hubVersion);
  if (!line) return "";
  const id = lineIconId(line, iconId);
  if (line === "X1") return X1_ICON_NAMES[id];
  if (line === "X1S" && X1S_ICON_NAMES[id]) return X1S_ICON_NAMES[id];
  if (line === "X1S" && X1S_ICON_AS_X1[id]) return X1_ICON_NAMES[X1S_ICON_AS_X1[id]];
  return X2_ICON_NAMES[id];
}
