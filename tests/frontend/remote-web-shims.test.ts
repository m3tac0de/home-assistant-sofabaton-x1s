// The web remote's platform shims (docs/internal/web-remote-plan.md, R4):
// the generated icon table covers every icon the card references, the
// palette carries the variables the card reads, and the icon resolver
// falls back rather than throwing. Element behaviour is covered by the
// Playwright web-remote spec (R5), which needs a DOM.

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  CARD_ICON_NAMES,
  MDI_ICON_PATHS,
  REMOTE_WEB_PALETTE_CSS,
  mdiPathFor,
} from "../../remote-card/src/shims/index";

const SRC = path.resolve("remote-card/src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

test("every mdi: icon the card references is in the generated table", () => {
  const referenced = new Set<string>();
  for (const file of walk(SRC)) {
    if (file.includes(`${path.sep}shims${path.sep}`)) continue;
    for (const match of readFileSync(file, "utf8").matchAll(/mdi:([a-z0-9-]+)/g)) {
      referenced.add(match[1]);
    }
  }
  const missingFromTable = [...referenced].filter((name) => !MDI_ICON_PATHS[name]);
  assert.deepEqual(
    missingFromTable,
    [],
    "rerun: node scripts/build-remote-web-assets.mjs",
  );
  assert.deepEqual([...referenced].sort(), [...CARD_ICON_NAMES].sort());
  for (const name of referenced) {
    assert.match(MDI_ICON_PATHS[name], /^M[\d.\s,a-zA-Z-]+$/, name);
  }
});

test("mdiPathFor resolves with or without the prefix and returns null for unknown names", () => {
  assert.equal(mdiPathFor("mdi:power"), MDI_ICON_PATHS.power);
  assert.equal(mdiPathFor("power"), MDI_ICON_PATHS.power);
  assert.equal(mdiPathFor(" mdi:volume-plus "), MDI_ICON_PATHS["volume-plus"]);
  assert.equal(mdiPathFor("mdi:no-such-icon-xyz"), null);
  assert.equal(mdiPathFor(""), null);
  assert.equal(mdiPathFor(null), null);
});

test("the palette defines the variables the card's styles read, in light and dark", () => {
  const styleSources = [
    "remote-card-styles.ts",
    "components/sb-key-button.ts",
    "sections/activity-row.ts",
    "sections/macro-favorites.ts",
    "sections/key-groups.ts",
  ].map((rel) => readFileSync(path.join(SRC, rel), "utf8"));
  const used = new Set<string>();
  for (const source of styleSources) {
    for (const match of source.matchAll(/var\(--([a-z0-9-]+)/g)) used.add(match[1]);
  }
  // HA never defines these; the ha-card shim carries their fallbacks. The
  // dialog-surface pair is theme-only too (ha-dialog falls back to
  // --mdc-theme-surface / none), spelled in the --sb-dialog-* tokens.
  const shimFallbacks = new Set([
    "ha-card-background",
    "ha-card-border-color",
    "ha-card-border-radius",
    "ha-card-border-width",
    "ha-card-box-shadow",
    "ha-dialog-surface-background",
    "ha-dialog-surface-backdrop-filter",
  ]);
  const haVars = [...used].filter(
    (name) => !/^(sb|remote|inline|mf|c|op|backup|tools|secondary-connected)-/.test(name) && !shimFallbacks.has(name),
  );
  const light = REMOTE_WEB_PALETTE_CSS.split("@media")[0];
  const missing = haVars.filter((name) => !light.includes(`--${name}:`));
  assert.deepEqual(missing, [], "card variables absent from the light palette");
  const dark = REMOTE_WEB_PALETTE_CSS.split("@media")[1] ?? "";
  for (const name of ["primary-text-color", "card-background-color", "primary-background-color", "divider-color"]) {
    assert.ok(dark.includes(`--${name}:`), `${name} in dark`);
  }
  assert.match(light, /--primary-color: #009ac7;/);
  assert.match(REMOTE_WEB_PALETTE_CSS, /\[data-theme="dark"\]/);
});
