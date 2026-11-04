// The fixed-position overlay menus (tools card + server panel): the pure
// positioning math, measured against the menu's frame — the viewport, or the
// ancestor that a glass theme's backdrop-filter turned into the containing
// block. The DOM walk itself (fixedFrameBox) is exercised by Playwright under
// the Liquid Glass theme in tests/playwright/tools-card-harness.spec.js.

import assert from "node:assert/strict";
import test from "node:test";

import { AnchoredListFollower, anchoredListStyle, followMenuAnchor, overlayMenuPosition, pillPopoverOptions, type Box, type MenuAnchor } from "../../custom_components/sofabaton_x1s/www/src/shared/utils/overlay-menu";

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

// -- AnchoredListFollower: an open popup follows its trigger ------------------------------------
// A fake trigger and frame queue stand in for the DOM: the follower only reads
// rects, `closest`, the window size and the direction.

interface FakeTrigger {
  rect: Box;
  isConnected: boolean;
  hidden: boolean;
}

function fakeDom() {
  const frames: Array<() => void> = [];
  const g = globalThis as Record<string, unknown>;
  const saved = ["window", "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle", "ShadowRoot", "document"].map((key) => [key, g[key]] as const);
  const win = { innerWidth: 1200, innerHeight: 900 };
  g.window = win;
  g.requestAnimationFrame = (fn: () => void) => frames.push(fn);
  g.cancelAnimationFrame = (id: number) => { frames[id - 1] = () => {}; };
  g.getComputedStyle = () => ({ direction: "ltr" });
  g.ShadowRoot ??= class {};
  g.document ??= { documentElement: {} };
  const view = { rect: box(0, 0, 1200, 900) };
  const make = (rect: Box): FakeTrigger & HTMLElement => {
    const trigger = {
      rect,
      isConnected: true,
      hidden: false,
      parentElement: null,
      getRootNode: () => ({}),
      getBoundingClientRect() { return this.rect; },
      getClientRects() { return this.hidden ? [] : [this.rect]; },
      closest: () => ({ getBoundingClientRect: () => view.rect }),
    };
    return trigger as unknown as FakeTrigger & HTMLElement;
  };
  return {
    win,
    view,
    make,
    /** Run the frames queued so far (each queues the next while following). */
    frame() {
      const pending = frames.splice(0);
      pending.forEach((fn) => fn());
      return frames.length;
    },
    restore() {
      for (const [key, value] of saved) g[key] = value;
    },
  };
}

test("AnchoredListFollower: the open popup moves with its trigger and stops when told", () => {
  const dom = fakeDom();
  try {
    const applied: string[] = [];
    const trigger = dom.make(box(800, 100, 60, 22));
    const follower = new AnchoredListFollower(pillPopoverOptions, (style) => applied.push(style));
    const first = follower.start(trigger);
    assert.match(first, /top: 126px;/);
    assert.equal(follower.following, true);
    // Nothing moved: no re-render.
    assert.equal(dom.frame(), 1);
    assert.deepEqual(applied, []);
    // The page moved underneath (a resize reflowed the header).
    trigger.rect = box(500, 180, 60, 22);
    dom.win.innerWidth = 900;
    dom.frame();
    assert.equal(applied.length, 1);
    assert.match(applied[0], /top: 206px;/);
    assert.notEqual(applied[0], first);
    // A narrower view (a sidebar opened) clamps the popup again.
    dom.view.rect = box(400, 0, 400, 900);
    dom.frame();
    assert.equal(applied.length, 2);
    assert.match(applied[1], /left: 408px;/);
    follower.stop();
    assert.equal(follower.following, false);
    assert.equal(dom.frame(), 0, "no frame is left queued once stopped");
  } finally {
    dom.restore();
  }
});

test("AnchoredListFollower: a hidden trigger keeps the last spot; a replaced one is found again", () => {
  const dom = fakeDom();
  try {
    const applied: string[] = [];
    const first = dom.make(box(800, 100, 60, 22));
    const second = dom.make(box(800, 300, 60, 22));
    const follower = new AnchoredListFollower(pillPopoverOptions, (style) => applied.push(style), () => second);
    follower.start(first);
    first.hidden = true;
    first.rect = box(0, 0, 0, 0);
    dom.frame();
    assert.deepEqual(applied, []);
    // A render replaced the pill: the follower picks the new element up.
    first.isConnected = false;
    dom.frame();
    assert.equal(applied.length, 1);
    assert.match(applied[0], /top: 326px;/);
    follower.stop();
  } finally {
    dom.restore();
  }
});

test("followMenuAnchor: a role menu's anchor follows the trigger; a move that lands it in the same spot does not re-render", () => {
  const dom = fakeDom();
  try {
    const applied: MenuAnchor[] = [];
    const trigger = dom.make(box(800, 400, 100, 30));
    const follower = followMenuAnchor("end", (anchor) => applied.push(anchor));
    const first = follower.start(trigger);
    assert.equal(overlayMenuPosition(first, "end"), "position: fixed; top: 434px; bottom: auto; right: 300px; left: auto;");
    // Wider to the left, same right edge and bottom: the menu stays where it is.
    trigger.rect = box(760, 400, 140, 30);
    dom.frame();
    assert.deepEqual(applied, []);
    // The header moved down: the menu goes with it.
    trigger.rect = box(760, 520, 140, 30);
    dom.frame();
    assert.equal(applied.length, 1);
    assert.equal(overlayMenuPosition(applied[0], "end"), "position: fixed; top: 554px; bottom: auto; right: 300px; left: auto;");
    follower.stop();
  } finally {
    dom.restore();
  }
});
