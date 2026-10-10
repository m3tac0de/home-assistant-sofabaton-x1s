// The fixed-position overlay menus (tools card + server panel): the pure
// positioning math, measured against the menu's frame — the viewport, or the
// ancestor that a glass theme's backdrop-filter turned into the containing
// block. The DOM walk itself (fixedFrameBox) is exercised by Playwright under
// the Liquid Glass theme in tests/playwright/tools-card-harness.spec.js.

import assert from "node:assert/strict";
import test from "node:test";

import { anchoredListStyle, overlayMenuPosition, type Box } from "../../custom_components/sofabaton_x1s/www/src/shared/utils/overlay-menu";

const box = (left: number, top: number, width: number, height: number): Box =>
  ({ left, top, width, height, right: left + width, bottom: top + height });

const viewport = box(0, 0, 1200, 900);
const trigger = box(500, 300, 120, 32);

test("overlayMenuPosition: viewport frame = window coordinates", () => {
  assert.equal(overlayMenuPosition({ rect: trigger, frame: viewport }, "right"), "position: fixed; top: 336px; bottom: auto; right: 580px; left: auto;");
  assert.equal(overlayMenuPosition({ rect: trigger, frame: viewport }, "left"), "position: fixed; top: 336px; bottom: auto; left: 500px; right: auto;");
  assert.equal(overlayMenuPosition(null, "left"), "");
});

test("overlayMenuPosition: an offset frame (blurred card) shifts the coordinates to its corner", () => {
  const card = box(300, 200, 700, 600);
  assert.equal(overlayMenuPosition({ rect: trigger, frame: card }, "right"), "position: fixed; top: 136px; bottom: auto; right: 380px; left: auto;");
  // Flips up when the frame's bottom is near: measured against the frame, not the window.
  const low = box(500, 700, 120, 32);
  assert.equal(overlayMenuPosition({ rect: low, frame: card }, "left"), "position: fixed; bottom: 104px; top: auto; left: 200px; right: auto;");
});

test("anchoredListStyle: as wide as the trigger, relative to the frame, capped to the room below", () => {
  assert.equal(anchoredListStyle(trigger, viewport, null, null), "position: fixed; top: 336px; bottom: auto; left: 500px; right: auto; width: 120px; max-height: 320px;");
  const dialogFrame = box(400, 250, 500, 300);
  const inDialog = box(430, 420, 440, 40);
  // Below: 550 - 460 - 12 = 78 < 200 and above (420 - 250 - 12 = 158) is larger: opens up, capped to the room above.
  assert.equal(anchoredListStyle(inDialog, dialogFrame, null, null), "position: fixed; bottom: 134px; top: auto; left: 30px; right: auto; width: 440px; max-height: 158px;");
});

test("anchoredListStyle: a menu keeps its minimum width, right-aligns to the trigger and stays inside `within`", () => {
  const button = box(1100, 100, 36, 36);
  const within = box(200, 0, 960, 900);
  assert.equal(anchoredListStyle(button, viewport, within, { minWidth: 260 }), "position: fixed; top: 140px; bottom: auto; left: 876px; right: auto; width: 260px; max-height: 320px;");
});
