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
  assert.equal(overlayMenuPosition({ rect: trigger, frame: viewport }, "end"), "position: fixed; top: 336px; bottom: auto; right: 580px; left: auto;");
  assert.equal(overlayMenuPosition({ rect: trigger, frame: viewport }, "start"), "position: fixed; top: 336px; bottom: auto; left: 500px; right: auto;");
  assert.equal(overlayMenuPosition(null, "start"), "");
});

test("overlayMenuPosition: RTL lines the menu up with the trigger's left edge as its end", () => {
  assert.equal(overlayMenuPosition({ rect: trigger, frame: viewport, rtl: true }, "end"), "position: fixed; top: 336px; bottom: auto; left: 500px; right: auto;");
  assert.equal(overlayMenuPosition({ rect: trigger, frame: viewport, rtl: true }, "start"), "position: fixed; top: 336px; bottom: auto; right: 580px; left: auto;");
});

test("overlayMenuPosition: an offset frame (blurred card) shifts the coordinates to its corner", () => {
  const card = box(300, 200, 700, 600);
  assert.equal(overlayMenuPosition({ rect: trigger, frame: card }, "end"), "position: fixed; top: 136px; bottom: auto; right: 380px; left: auto;");
  // Flips up when the frame's bottom is near: measured against the frame, not the window.
  const low = box(500, 700, 120, 32);
  assert.equal(overlayMenuPosition({ rect: low, frame: card }, "start"), "position: fixed; bottom: 104px; top: auto; left: 200px; right: auto;");
});

test("anchoredListStyle: as wide as the trigger, relative to the frame, capped to the room below", () => {
  assert.equal(anchoredListStyle(trigger, viewport, null, null), "position: fixed; top: 336px; bottom: auto; left: 500px; right: auto; width: 120px; max-height: 320px;");
  const dialogFrame = box(400, 250, 500, 300);
  const inDialog = box(430, 420, 440, 40);
  // Below: 550 - 460 - 12 = 78 < 200 and above (420 - 250 - 12 = 158) is larger: opens up, capped to the room above.
  assert.equal(anchoredListStyle(inDialog, dialogFrame, null, null), "position: fixed; bottom: 134px; top: auto; left: 30px; right: auto; width: 440px; max-height: 158px;");
});

test("anchoredListStyle: a menu keeps its minimum width, aligns to the trigger's end edge and stays inside `within`", () => {
  const button = box(1100, 100, 36, 36);
  const within = box(200, 0, 960, 900);
  assert.equal(anchoredListStyle(button, viewport, within, { minWidth: 260 }), "position: fixed; top: 140px; bottom: auto; left: 876px; right: auto; width: 260px; max-height: 320px;");
});

test("anchoredListStyle: widthOnly lets a menu run past the bottom of a short `within`", () => {
  const pill = box(800, 100, 60, 20);
  const shortView = box(300, 80, 760, 320);
  // Narrowed to the view: 400 - 120 - 12 = 268.
  assert.equal(anchoredListStyle(pill, viewport, shortView, { minWidth: 320, maxHeight: 560 }), "position: fixed; top: 124px; bottom: auto; left: 540px; right: auto; width: 320px; max-height: 268px;");
  // The window's room instead (900 - 120 - 12 = 768, capped to 560); the width stays inside the view.
  assert.equal(anchoredListStyle(pill, viewport, shortView, { minWidth: 320, maxHeight: 560, widthOnly: true }), "position: fixed; top: 124px; bottom: auto; left: 540px; right: auto; width: 320px; max-height: 560px;");
  const narrowView = box(700, 80, 300, 320);
  assert.equal(anchoredListStyle(pill, viewport, narrowView, { minWidth: 320, maxHeight: 560, widthOnly: true }), "position: fixed; top: 124px; bottom: auto; left: 708px; right: auto; width: 284px; max-height: 560px;");
});

test("anchoredListStyle: in RTL a menu hangs from the trigger's left edge, still inside `within`", () => {
  const within = box(200, 0, 960, 900);
  // The trigger sits at the row's end, which is the left in RTL: LTR math would clamp to 208.
  assert.equal(anchoredListStyle(box(220, 100, 36, 36), viewport, within, { minWidth: 260, rtl: true }), "position: fixed; top: 140px; bottom: auto; left: 220px; right: auto; width: 260px; max-height: 320px;");
  assert.equal(anchoredListStyle(box(1100, 100, 36, 36), viewport, within, { minWidth: 260, rtl: true }), "position: fixed; top: 140px; bottom: auto; left: 892px; right: auto; width: 260px; max-height: 320px;");
});
