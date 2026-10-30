import test from "node:test";
import assert from "node:assert/strict";

import { X1S_ICON_PATHS, X1_ICON_PATHS, X2_ICON_PATHS } from "../../remote-card/src/entity-icons/x2-icons";
import * as geometry from "../../scripts/x2-icons/geometry.mjs";
import { ICONS, X1S_ICONS, X1_ICONS } from "../../scripts/x2-icons/icons.mjs";

test("x2 icon set covers ids 1-45", () => {
  assert.deepEqual(
    Object.keys(X2_ICON_PATHS).map(Number),
    Array.from({ length: 45 }, (_, i) => i + 1),
  );
});

test("x1 and x1s icons are the ids the X2 set has no counterpart for, or redrew", () => {
  assert.deepEqual(Object.keys(X1_ICON_PATHS).map(Number), [6, 7, 8, 10, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24, 25]);
  assert.deepEqual(Object.keys(X1S_ICON_PATHS).map(Number), [8, 11, 12, 15]);
});

test("icon paths are single relative-path strings", () => {
  for (const [set, paths] of [["x2", X2_ICON_PATHS], ["x1", X1_ICON_PATHS], ["x1s", X1S_ICON_PATHS]] as const) {
    for (const [id, path] of Object.entries(paths)) {
      assert.match(path, /^M[\d.]/, `${set} icon ${id} starts with an absolute move`);
      assert.match(path, /^[MmLlHhVvCcQqAaZz\d.\s-]+$/, `${set} icon ${id} uses path syntax only`);
      assert.ok(path.endsWith("z"), `${set} icon ${id} closes its last subpath`);
    }
  }
});

test("generated x2-icons.ts matches scripts/x2-icons (run npm run build:x2-icons)", () => {
  for (const [id, [name, draw]] of Object.entries(ICONS)) {
    assert.equal(X2_ICON_PATHS[Number(id)], geometry.build(draw(geometry)), `icon ${id} (${name}) is stale`);
  }
  for (const [id, [name, draw]] of Object.entries(X1_ICONS)) {
    assert.equal(X1_ICON_PATHS[Number(id)], geometry.build(draw(geometry)), `X1 icon ${id} (${name}) is stale`);
  }
  for (const [id, [name, draw]] of Object.entries(X1S_ICONS)) {
    assert.equal(X1S_ICON_PATHS[Number(id)], geometry.build(draw(geometry)), `X1S icon ${id} (${name}) is stale`);
  }
});
