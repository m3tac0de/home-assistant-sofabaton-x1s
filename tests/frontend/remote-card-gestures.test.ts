import test from "node:test";
import assert from "node:assert/strict";
import {
  HOLD_REPEAT_EVENT_TYPE,
  commandsOverlayMaxHeight,
  createPrimaryActionGate,
  drawerDesiredHeight,
  drawerDirection,
  holdRepeatIndexOf,
  layeringZIndexes,
  primaryActionGateAllows,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-gestures";

test("holdRepeatIndexOf reads the repeat index only from hold-repeat events", () => {
  // Node has no CustomEvent constructor with detail in every version; the
  // helper only looks at type + detail, so a plain object-shaped event works.
  const repeat = (detail: unknown) =>
    ({ type: HOLD_REPEAT_EVENT_TYPE, detail }) as unknown as Event;
  assert.equal(holdRepeatIndexOf(repeat(1)), 1);
  assert.equal(holdRepeatIndexOf(repeat(4)), 4);
  assert.equal(holdRepeatIndexOf(repeat("3")), 3);
  assert.equal(holdRepeatIndexOf(repeat(0)), 0);
  assert.equal(holdRepeatIndexOf(repeat(undefined)), 0);
  // Taps, keyboard activations and ha-click are never repeats.
  assert.equal(holdRepeatIndexOf({ type: "pointerup" } as Event), 0);
  assert.equal(holdRepeatIndexOf({ type: "click", detail: 2 } as unknown as Event), 0);
  assert.equal(holdRepeatIndexOf(null), 0);
  assert.equal(holdRepeatIndexOf(undefined), 0);
});

test("commands overlay height clamps to the card, never beyond it", () => {
  // Opening down: space is card bottom minus the row bottom.
  assert.equal(
    commandsOverlayMaxHeight({
      up: false,
      rowTop: 100,
      rowBottom: 150,
      cardTop: 80,
      cardBottom: 700,
      viewportHeight: 2000,
    }),
    538, // (700 - 150) - 12 — viewport space is irrelevant
  );
  // Opening up: space is row top minus the card top.
  assert.equal(
    commandsOverlayMaxHeight({
      up: true,
      rowTop: 600,
      rowBottom: 650,
      cardTop: 100,
      cardBottom: 700,
      viewportHeight: 2000,
    }),
    488, // (600 - 100) - 12
  );
  // The usability floor never exceeds the in-card space itself.
  assert.equal(
    commandsOverlayMaxHeight({
      up: false,
      rowTop: 100,
      rowBottom: 150,
      cardTop: 80,
      cardBottom: 210,
      viewportHeight: 2000,
    }),
    60, // only 60px of card left below the row: use it all, no 120px floor
  );
  // No card bounds: fall back to viewport space.
  assert.equal(
    commandsOverlayMaxHeight({
      up: false,
      rowTop: 100,
      rowBottom: 150,
      cardTop: null,
      cardBottom: null,
      viewportHeight: 800,
    }),
    638, // (800 - 150) - 12
  );
});

test("gate allows the first event and blocks anything within 450ms", () => {
  const gate = createPrimaryActionGate();
  assert.equal(primaryActionGateAllows(gate, { type: "pointerup", pointerId: 1 }, 1000), true);
  // Same pointer, same gesture: blocked.
  assert.equal(primaryActionGateAllows(gate, { type: "click", pointerId: 1 }, 1100), false);
  // Different pointer but still within the 450ms window: also blocked.
  assert.equal(primaryActionGateAllows(gate, { type: "pointerup", pointerId: 2 }, 1400), false);
  // Past the window: allowed again.
  assert.equal(primaryActionGateAllows(gate, { type: "pointerup", pointerId: 2 }, 1500), true);
});

test("gate drops ghost clicks up to 1200ms after a pointer/touch event", () => {
  for (const first of ["pointerup", "touchend"]) {
    for (const ghost of ["click", "ha-click", "tap"]) {
      const gate = createPrimaryActionGate();
      assert.equal(primaryActionGateAllows(gate, { type: first }, 1000), true);
      assert.equal(
        primaryActionGateAllows(gate, { type: ghost }, 1000 + 800),
        false,
        `${ghost} after ${first} should be dropped`,
      );
      // After 1200ms the ghost window closes.
      assert.equal(primaryActionGateAllows(gate, { type: ghost }, 1000 + 1300), true);
    }
  }
});

test("gate does not treat click-after-click as a ghost", () => {
  const gate = createPrimaryActionGate();
  assert.equal(primaryActionGateAllows(gate, { type: "click" }, 1000), true);
  // Between 450 and 1200ms after a CLICK (not pointer/touch), a click is fine.
  assert.equal(primaryActionGateAllows(gate, { type: "click" }, 1600), true);
});

test("gate treats a non-pointer event followed by pointerup as distinct", () => {
  const gate = createPrimaryActionGate();
  assert.equal(primaryActionGateAllows(gate, { type: "ha-click" }, 1000), true);
  assert.equal(primaryActionGateAllows(gate, { type: "pointerup" }, 1500), true);
});

test("drawer desired height clamps to the CSS max plus fudge", () => {
  assert.equal(drawerDesiredHeight(120), 128);
  assert.equal(drawerDesiredHeight(1000), 358);
  assert.equal(drawerDesiredHeight(0), 8);
});

test("drawer direction prefers the side that keeps more of the drawer in the card", () => {
  // Plenty of space below inside the card: open down.
  assert.equal(
    drawerDirection({ desired: 200, rowTop: 500, rowBottom: 550, cardTop: 0, cardBottom: 900, viewportHeight: 1000 }),
    "down",
  );
  // Row near the card bottom, space above: open up.
  assert.equal(
    drawerDirection({ desired: 200, rowTop: 800, rowBottom: 850, cardTop: 0, cardBottom: 900, viewportHeight: 1000 }),
    "up",
  );
  // Tie (equal overlap both ways): prefer down.
  assert.equal(
    drawerDirection({ desired: 200, rowTop: 450, rowBottom: 450, cardTop: 0, cardBottom: 900, viewportHeight: 1000 }),
    "down",
  );
});

test("drawer direction falls back to viewport space without card bounds", () => {
  // Not enough space below the row in the viewport, more above: open up.
  assert.equal(
    drawerDirection({ desired: 300, rowTop: 700, rowBottom: 900, viewportHeight: 1000 }),
    "up",
  );
  // Enough space below: open down.
  assert.equal(
    drawerDirection({ desired: 300, rowTop: 100, rowBottom: 200, viewportHeight: 1000 }),
    "down",
  );
});

test("layering keeps the open activity menu on top, then the open drawer", () => {
  // Matches the Playwright expectation: menu open + drawer open -> 10 / 9.
  assert.deepEqual(layeringZIndexes(true, true), { activity: "10", drawer: "9" });
  assert.deepEqual(layeringZIndexes(true, false), { activity: "10", drawer: "2" });
  assert.deepEqual(layeringZIndexes(false, true), { activity: "2", drawer: "10" });
  assert.deepEqual(layeringZIndexes(false, false), { activity: "3", drawer: "2" });
});
