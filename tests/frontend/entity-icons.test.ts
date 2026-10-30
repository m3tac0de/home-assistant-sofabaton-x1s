import test from "node:test";
import assert from "node:assert/strict";

import {
  entityIconGroups,
  entityIconIds,
  entityIconName,
  entityIconPath,
  iconHubLine,
} from "../../remote-card/src/entity-icons/entity-icons";
import {
  ENTITY_COLOR_IDS,
  entityColor,
  entityColorsSupported,
} from "../../remote-card/src/entity-icons/entity-colors";
import { entityTile, entityTileBadge } from "../../remote-card/src/entity-icons/entity-tile";
import { X1S_ICON_PATHS, X1_ICON_PATHS, X2_ICON_PATHS } from "../../remote-card/src/entity-icons/x2-icons";

test("iconHubLine reads the line out of a hub version", () => {
  assert.equal(iconHubLine("X1"), "X1");
  assert.equal(iconHubLine("x1s"), "X1S");
  assert.equal(iconHubLine(" Sofabaton X1S "), "X1S");
  assert.equal(iconHubLine("X2"), "X2");
  assert.equal(iconHubLine(""), null);
  assert.equal(iconHubLine(null), null);
  assert.equal(iconHubLine("U2"), null);
});

test("entityIconIds offers each line's own set", () => {
  assert.deepEqual(entityIconIds("X1"), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.deepEqual(entityIconIds("X1S"), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.deepEqual(entityIconIds("X2"), Array.from({ length: 45 }, (_, i) => i + 1));
  assert.deepEqual(entityIconIds(undefined), []);
});

test("X1S and X2 share ids: the X1S shows X2 paths 1-16 where the object is the same", () => {
  // The X2 redrew 4, 5, 6, 9, 13 and 16 as objects the X1 also draws; the
  // X1S keeps its own (the X1 drawing of that object): 9 stays an AV
  // receiver, not a router. 8, 11, 12 and 15 have X1S drawings of their own.
  const asX1: Record<number, number> = { 4: 6, 5: 8, 6: 10, 9: 22, 13: 13, 16: 16 };
  const own = [8, 11, 12, 15];
  assert.deepEqual(Object.keys(X1S_ICON_PATHS).map(Number), own);
  for (const id of entityIconIds("X1S")) {
    const expected = own.includes(id) ? X1S_ICON_PATHS[id] : asX1[id] ? X1_ICON_PATHS[asX1[id]] : X2_ICON_PATHS[id];
    assert.equal(entityIconPath("X1S", id), expected, `X1S icon ${id}`);
  }
  assert.equal(entityIconName("X1S", 9), "AV receiver");
  assert.equal(entityIconName("X2", 9), "Wifi router");
  assert.equal(entityIconName("X1S", 12), "Bulb");
  assert.equal(entityIconName("X2", 12), "Pendant lamp");
  assert.equal(entityIconName("X1S", 16), "Netflix");
  assert.equal(entityIconPath("X1S", 16), entityIconPath("X1", 16));
  assert.notEqual(entityIconPath("X1S", 16), X2_ICON_PATHS[16]);
  for (const id of entityIconIds("X2")) assert.equal(entityIconPath("X2", id), X2_ICON_PATHS[id]);
});

test("every icon of every line has a name, and the picker groups split off the logos", () => {
  for (const line of ["X1", "X1S", "X2"]) {
    for (const id of entityIconIds(line)) assert.ok(entityIconName(line, id), `${line} icon ${id}`);
    const { pictures, services } = entityIconGroups(line);
    assert.deepEqual([...pictures, ...services].sort((a, b) => a - b), entityIconIds(line));
  }
  assert.deepEqual(entityIconGroups("X2").services, [13, 14, 15, 16, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45]);
  assert.deepEqual(entityIconGroups("X1").services, [13, 14, 15, 16, 25]);
  assert.equal(entityIconName("X1", 2), "HD TV");
  assert.equal(entityIconName("U2", 2), "");
});

test("only the X2 has colors; 0 and unknown ids draw grey", () => {
  assert.equal(entityColorsSupported("X2"), true);
  assert.equal(entityColorsSupported("X1S"), false);
  assert.deepEqual(ENTITY_COLOR_IDS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(entityColor("X2", 7), "#00A8E0");
  assert.equal(entityColor("X2", 0), "#7F7F7F");
  assert.equal(entityColor("X2", 13), "#7F7F7F");
  assert.equal(entityColor("X1S", 7), null);
});

test("a tile needs a known icon; a neutral one on hubs without colors", () => {
  assert.equal(entityTile("X2", undefined, 7), null);
  assert.equal(entityTile("U2", 3, 7), null);
  assert.deepEqual(entityTile("X2", 16, 2), { path: X2_ICON_PATHS[16], color: "#F16161", name: "Netflix" });
  assert.deepEqual(entityTile("X1S", 9, 4), { path: X1_ICON_PATHS[22], color: null, name: "AV receiver" });
  assert.equal(entityTileBadge("ir")?.icon, "mdi:led-outline");
  assert.equal(entityTileBadge(""), null);
  assert.equal(entityTileBadge("bluetooth")?.icon, "mdi:bluetooth");
  assert.equal(entityTileBadge("wifi_mqtt")?.icon, "mdi:wifi");
  assert.equal(entityTileBadge("rf_433mhz")?.icon, "mdi:radio-tower");
});

test("every X1 id resolves: its own drawing, else the mapped X2 one", () => {
  const x2Paths = new Set(Object.values(X2_ICON_PATHS));
  for (const id of entityIconIds("X1")) {
    const path = entityIconPath("X1", id);
    if (X1_ICON_PATHS[id]) assert.equal(path, X1_ICON_PATHS[id], `X1 icon ${id}`);
    else assert.ok(path && x2Paths.has(path), `X1 icon ${id} maps to an X2 path`);
  }
  assert.equal(entityIconPath("X1", 1), X2_ICON_PATHS[1]);
  assert.equal(entityIconPath("X1", 20), X2_ICON_PATHS[9]);
  // the X2 redrew these; the X1 keeps what its remote shows
  for (const id of [13, 16, 19, 21, 23, 24]) assert.equal(entityIconPath("X1", id), X1_ICON_PATHS[id], `X1 icon ${id}`);
});

test("ids outside a line's set show icon 1, as the app does", () => {
  assert.equal(entityIconPath("X1S", 17), X2_ICON_PATHS[1]);
  assert.equal(entityIconPath("X2", 46), X2_ICON_PATHS[1]);
  assert.equal(entityIconPath("X2", 0), X2_ICON_PATHS[1]);
  assert.equal(entityIconPath("X2", 2.5), X2_ICON_PATHS[1]);
  assert.equal(entityIconPath("X1", 26), X2_ICON_PATHS[1]);
  assert.equal(entityIconPath("U2", 3), null);
});
