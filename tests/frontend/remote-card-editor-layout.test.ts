import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLayoutConfigPatch,
  layoutSelectionNote,
  moveVisibleGroup,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-editor-layout";
import { DEFAULT_GROUP_ORDER } from "../../custom_components/sofabaton_x1s/www/src/remote-card-layout";

test("selection note names the scope of the applicable layout", () => {
  const config = {
    layouts: {
      "101": { show_dpad: false },
    },
    device_mode: {
      layouts: {
        "3": { show_nav: false },
      },
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

// ---------- write pruning ----------
//
// Saved YAML only ever contains intentional deviations: values equal to what
// a layer would inherit anyway are dropped on write, and emptied layers/maps
// disappear.

test("patches equal to the built-in defaults leave no stored keys", () => {
  const { nextConfig } = applyLayoutConfigPatch({ entity: "remote.x" }, "default", {
    show_dpad: true,
  });
  assert.deepEqual(nextConfig, { entity: "remote.x" });
});

test("default-layout writes land in layouts.default, mirroring device_mode", () => {
  const start = { entity: "remote.x" };
  const { nextConfig: off } = applyLayoutConfigPatch(start, "default", {
    show_dvr: false,
  });
  assert.deepEqual(off, {
    entity: "remote.x",
    layouts: { default: { show_dvr: false } },
  });
  // Toggling back restores the original config exactly.
  const { nextConfig: on } = applyLayoutConfigPatch(off, "default", {
    show_dvr: true,
  });
  assert.deepEqual(on, start);
});

test("top-level layout keys migrate into layouts.default on first write", () => {
  // The released stored shape (base keys at the top level) is folded into
  // layouts.default the first time the default layout is edited — resolution
  // is identical (top level is the layer beneath layouts.default), and the
  // top level is left to card settings only.
  const config = {
    entity: "remote.x",
    show_colors: false,
    max_width: 500,
    layouts: { "101": { show_nav: false } },
  };
  const { nextConfig } = applyLayoutConfigPatch(config, "default", {
    show_media: false,
  });
  assert.deepEqual(nextConfig, {
    entity: "remote.x",
    max_width: 500, // card setting: not a layout key, stays put
    layouts: {
      "101": { show_nav: false },
      default: { show_colors: false, show_media: false },
    },
  });
});

test("activity overrides prune against the resolved default layout", () => {
  const config = { entity: "remote.x", show_media: false };
  // Matching the inherited value stores nothing…
  const { nextConfig: same } = applyLayoutConfigPatch(config, "101", {
    show_media: false,
  });
  assert.equal("layouts" in same, false);
  // …deviating does, and reverting cleans the map back up.
  const { nextConfig: overridden } = applyLayoutConfigPatch(config, "101", {
    show_media: true,
  });
  assert.deepEqual(overridden.layouts, { "101": { show_media: true } });
  const { nextConfig: reverted } = applyLayoutConfigPatch(overridden, "101", {
    show_media: false,
  });
  assert.equal("layouts" in reverted, false);
});

test("group_order equal to the effective order is pruned", () => {
  const { nextConfig } = applyLayoutConfigPatch({}, "default", {
    group_order: DEFAULT_GROUP_ORDER.slice(),
  });
  assert.equal("group_order" in nextConfig, false);
  const reordered = ["dpad", ...DEFAULT_GROUP_ORDER.filter((key) => key !== "dpad")];
  const { nextConfig: moved } = applyLayoutConfigPatch({}, "default", {
    group_order: reordered,
  });
  assert.deepEqual(moved.layouts?.default?.group_order, reordered);
});

test("show_volume survives pruning over a legacy show_mid base", () => {
  // volume/channel resolve through the legacy show_mid fallback; pruning must
  // compare against that effective value, not the naive key default.
  const config = { show_mid: false };
  const { nextConfig } = applyLayoutConfigPatch(config, "default", {
    show_volume: true,
  });
  // Both keys migrate into layouts.default; the legacy key is preserved
  // (read-side compat) and keeps gating show_channel.
  assert.deepEqual(nextConfig, {
    layouts: { default: { show_mid: false, show_volume: true } },
  });
});

test("null tri-state keys prune as their 'shown' meaning", () => {
  const { nextConfig } = applyLayoutConfigPatch(
    { show_macros_button: null },
    "default",
    { show_favorites_button: true },
  );
  assert.equal("show_macros_button" in nextConfig, false);
  assert.equal("show_favorites_button" in nextConfig, false);
});
