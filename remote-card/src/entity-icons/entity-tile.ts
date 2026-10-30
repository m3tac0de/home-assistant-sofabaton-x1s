// The hub icon on a tile, the way the editors and the sidebar drawer show an
// activity or a device: on an X2 the tile takes the entity's palette color
// and the glyph stays white; the X1 and X1S have no colors, so their tile is
// neutral with the glyph in the text color.

import { mdiBluetooth, mdiLedOutline, mdiRadioTower, mdiWifi } from "@mdi/js";
import { css, html, nothing, type TemplateResult } from "lit";
import { entityColor } from "./entity-colors";
import { entityIconName, entityIconPath } from "./entity-icons";

export interface EntityTile {
  /** The icon's 24x24 path. */
  path: string;
  /** The tile color; null for a neutral tile (a hub without colors). */
  color: string | null;
  /** The icon's name, for a label. */
  name: string;
}

/** The tile for a record's icon and color, or null when the icon is unknown
 *  (no record cached yet) or the hub line is: the caller keeps its own
 *  glyph then. */
export function entityTile(
  hubVersion: string | null | undefined,
  icon: number | null | undefined,
  colorId: number | null | undefined,
): EntityTile | null {
  if (typeof icon !== "number") return null;
  const path = entityIconPath(hubVersion, icon);
  if (!path) return null;
  return { path, color: entityColor(hubVersion, colorId), name: entityIconName(hubVersion, icon) };
}

export interface EntityTileBadge {
  /** The mdi icon it draws, for tests and labels. */
  icon: string;
  path: string;
  /** Moves the glyph onto the badge's center, in the path's 24x24 units:
   *  not every mdi glyph is centered in its own box. */
  nudge: [number, number];
}

const BADGE_IR: EntityTileBadge = { icon: "mdi:led-outline", path: mdiLedOutline, nudge: [0, -2.5] };
const BADGE_BLUETOOTH: EntityTileBadge = { icon: "mdi:bluetooth", path: mdiBluetooth, nudge: [0.65, 0] };
const BADGE_WIFI: EntityTileBadge = { icon: "mdi:wifi", path: mdiWifi, nudge: [0, 0] };
const BADGE_RF: EntityTileBadge = { icon: "mdi:radio-tower", path: mdiRadioTower, nudge: [0, 0] };

/** The corner badge that keeps a device's link visible once its tile shows
 *  the hub icon instead of a class glyph. */
export function entityTileBadge(deviceClass: unknown): EntityTileBadge | null {
  const cls = String(deviceClass ?? "").toLowerCase();
  if (cls === "ir") return BADGE_IR;
  if (cls.includes("bluetooth")) return BADGE_BLUETOOTH;
  if (cls.includes("wifi")) return BADGE_WIFI;
  if (cls.startsWith("rf")) return BADGE_RF;
  return null;
}

// Drawn here rather than through ha-icon: the glyph needs its own nudge, and
// an even 12px glyph in the 16px badge leaves whole pixels on every side.
function renderBadge(badge: EntityTileBadge): TemplateResult {
  const [dx, dy] = badge.nudge;
  return html`<span class="entity-tile__badge"
    ><svg viewBox="0 0 24 24" focusable="false"><path transform=${`translate(${dx} ${dy})`} d=${badge.path}></path></svg
  ></span>`;
}

/** The tile, decorative (the entity's name sits beside it). */
export function renderEntityTile(tile: EntityTile, options: { badge?: EntityTileBadge | null; className?: string } = {}): TemplateResult {
  const classes = ["entity-tile", tile.color ? "" : "entity-tile--neutral", options.className ?? ""].filter(Boolean).join(" ");
  return html`<span class=${classes} style=${tile.color ? `--entity-tile-color: ${tile.color}` : ""} aria-hidden="true"
    ><svg viewBox="0 0 24 24" focusable="false"><path d=${tile.path}></path></svg
    >${options.badge ? renderBadge(options.badge) : nothing}</span
  >`;
}

/** Host knobs: --entity-tile-size (30px), --entity-tile-ring (the surface
 *  behind the tile, around the badge). */
export const entityTileStyles = css`
  .entity-tile {
    --_entity-tile-size: var(--entity-tile-size, 30px);
    position: relative;
    flex: none;
    display: inline-grid;
    place-items: center;
    width: var(--_entity-tile-size);
    height: var(--_entity-tile-size);
    border-radius: calc(var(--_entity-tile-size) * 0.3);
    background: var(--entity-tile-color, #7f7f7f);
    color: #fff;
  }
  .entity-tile > svg {
    width: calc(var(--_entity-tile-size) * 0.64);
    height: calc(var(--_entity-tile-size) * 0.64);
    fill: currentColor;
  }
  .entity-tile--neutral {
    background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);
    color: var(--primary-text-color);
  }
  .entity-tile__badge {
    position: absolute;
    inset-inline-end: -5px;
    bottom: -5px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--card-background-color, #fff);
    color: var(--secondary-text-color);
    box-shadow: 0 0 0 2px var(--entity-tile-ring, var(--card-background-color, #fff));
  }
  .entity-tile__badge > svg {
    display: block;
    width: 12px;
    height: 12px;
    fill: currentColor;
  }
`;
