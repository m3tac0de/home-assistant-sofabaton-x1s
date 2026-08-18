import test from "node:test";
import assert from "node:assert/strict";
import {
  layoutSelectionNote,
  moveVisibleGroup,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-editor-layout";

test("selection note names the scope of the applicable layout", () => {
  const config = {
    layouts: {
      "101": { show_dpad: false },
      "device:3": { show_nav: false },
    },
  };
  assert.equal(
    layoutSelectionNote(config, "default"),
    "Used for activities without their own layout",
  );
  assert.equal(
    layoutSelectionNote(config, "device:default"),
    "Used for devices without their own layout",
  );
  assert.equal(
    layoutSelectionNote(config, "101"),
    "Using custom activity layout",
  );
  assert.equal(
    layoutSelectionNote(config, "device:3"),
    "Using custom device layout",
  );
  assert.equal(
    layoutSelectionNote(config, "102"),
    "Using default activity layout",
  );
  assert.equal(
    layoutSelectionNote(config, "device:4"),
    "Using default device layout",
  );
});

const ORDER = ["activity", "macro_favorites", "dpad", "nav", "mid", "media", "colors", "abc"];

test("moves a visible group forward across multiple positions", () => {
  const next = moveVisibleGroup(ORDER, () => true, 0, 3);
  assert.deepEqual(next, ["macro_favorites", "dpad", "nav", "activity", "mid", "media", "colors", "abc"]);
});

test("moves a visible group backward", () => {
  const next = moveVisibleGroup(ORDER, () => true, 4, 1);
  assert.deepEqual(next, ["activity", "mid", "macro_favorites", "dpad", "nav", "media", "colors", "abc"]);
});

test("hidden groups keep their slots when visible rows move past them", () => {
  // "abc" (X1) and "nav" hidden: visible = activity, macro_favorites, dpad, mid, media, colors
  const hidden = new Set(["nav", "abc"]);
  const isVisible = (key: string) => !hidden.has(key);
  // Move visible index 0 (activity) to visible index 4 (media's slot).
  const next = moveVisibleGroup(ORDER, isVisible, 0, 4);
  assert.deepEqual(next, [
    "macro_favorites",
    "dpad",
    "mid",
    "nav", // hidden: keeps its original index (3)
    "media",
    "activity",
    "colors",
    "abc", // hidden: keeps its original index (7)
  ]);
  // Hidden keys occupy the exact same indices as before.
  assert.equal(next?.[3], "nav");
  assert.equal(next?.[7], "abc");
});

test("returns null for out-of-bounds or no-op moves", () => {
  assert.equal(moveVisibleGroup(ORDER, () => true, 2, 2), null);
  assert.equal(moveVisibleGroup(ORDER, () => true, -1, 2), null);
  assert.equal(moveVisibleGroup(ORDER, () => true, 0, ORDER.length), null);
  assert.equal(moveVisibleGroup(ORDER, () => true, 0.5 as number, 1), null);
});

test("adjacent move matches what the chevron swap used to produce", () => {
  const next = moveVisibleGroup(ORDER, () => true, 2, 3);
  assert.deepEqual(next, ["activity", "macro_favorites", "nav", "dpad", "mid", "media", "colors", "abc"]);
});
