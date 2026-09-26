// Theme planning for the embeddable remote (docs/internal/remote-embed-plan.md,
// decision 3 and E2): light / dark pin the HA palette, inherit fills in
// only what the host left undefined, the --rgb-* twins follow the host's
// colour, the host's own polarity picks the fill-in mode, and color-scheme
// is only set when the host has none.

import assert from "node:assert/strict";
import test from "node:test";

import {
  PALETTE_VAR_NAMES,
  RGB_TWINS,
  hostPolarity,
  normalizeEmbedTheme,
  parseCssColor,
  planEmbedTheme,
  relativeLuminance,
  rgbTriplet,
  type EmbedThemeInput,
} from "../../remote-card/src/remote-embed-theme";
import { REMOTE_WEB_PALETTE_VARS } from "../../remote-card/src/shims/palette";

function input(overrides: Partial<EmbedThemeInput> & { host?: Record<string, string> } = {}): EmbedThemeInput {
  const host = overrides.host ?? {};
  return {
    theme: "inherit",
    hostValue: (name) => host[name] ?? "",
    prefersDark: false,
    resolveColor: (css) => parseCssColor(css),
    hostColorScheme: "normal",
    ...overrides,
  };
}

test("parseCssColor reads computed-style and stylesheet spellings", () => {
  assert.deepEqual(parseCssColor("rgb(33, 33, 33)"), { r: 33, g: 33, b: 33, a: 1 });
  assert.deepEqual(parseCssColor("rgba(255, 102, 0, 0.5)"), { r: 255, g: 102, b: 0, a: 0.5 });
  assert.deepEqual(parseCssColor("rgb(255 102 0 / 50%)"), { r: 255, g: 102, b: 0, a: 0.5 });
  assert.deepEqual(parseCssColor("color(srgb 1 0.5 0)"), { r: 255, g: 127.5, b: 0, a: 1 });
  assert.deepEqual(parseCssColor("#f60"), { r: 255, g: 102, b: 0, a: 1 });
  assert.deepEqual(parseCssColor("#FF6600"), { r: 255, g: 102, b: 0, a: 1 });
  assert.deepEqual(parseCssColor("#ff660080")?.a.toFixed(3), "0.502");
  assert.equal(parseCssColor("rgba(0, 0, 0, 0)"), null);
  assert.equal(parseCssColor("transparent"), null);
  assert.equal(parseCssColor("var(--x)"), null);
  assert.equal(parseCssColor(""), null);
  assert.equal(parseCssColor(null), null);
});

test("luminance and the triplet spelling match HA's", () => {
  assert.equal(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 }), 1);
  assert.equal(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 }), 0);
  assert.equal(rgbTriplet({ r: 0, g: 154, b: 199, a: 1 }), "0, 154, 199");
  assert.equal(rgbTriplet({ r: 127.5, g: 0.4, b: 1.6, a: 1 }), "128, 0, 2");
});

test("normalizeEmbedTheme accepts light and dark and falls back to inherit", () => {
  assert.equal(normalizeEmbedTheme("light"), "light");
  assert.equal(normalizeEmbedTheme(" Dark "), "dark");
  assert.equal(normalizeEmbedTheme("inherit"), "inherit");
  assert.equal(normalizeEmbedTheme("auto"), "inherit");
  assert.equal(normalizeEmbedTheme(null), "inherit");
});

test("the palette carries every twin and its base", () => {
  for (const [twin, base] of Object.entries(RGB_TWINS)) {
    assert.ok(PALETTE_VAR_NAMES.includes(twin), twin);
    assert.ok(PALETTE_VAR_NAMES.includes(base), base);
  }
});

test("light and dark pin the whole HA palette and the colour scheme, whatever the host defines", () => {
  const host = { "--primary-color": "#ff6600", "--card-background-color": "#202020" };
  const light = planEmbedTheme(input({ theme: "light", host, hostColorScheme: "dark" }));
  assert.equal(light.mode, "light");
  assert.deepEqual(light.values, REMOTE_WEB_PALETTE_VARS.light);
  assert.equal(light.colorScheme, "light");
  const dark = planEmbedTheme(input({ theme: "dark", host }));
  assert.deepEqual(dark.values, REMOTE_WEB_PALETTE_VARS.dark);
  assert.equal(dark.colorScheme, "dark");
});

test("inherit on a host that defines nothing fills in the whole palette by the OS preference", () => {
  const light = planEmbedTheme(input());
  assert.equal(light.mode, "light");
  assert.deepEqual(light.values, REMOTE_WEB_PALETTE_VARS.light);
  assert.equal(light.colorScheme, "light");
  const dark = planEmbedTheme(input({ prefersDark: true }));
  assert.equal(dark.mode, "dark");
  assert.deepEqual(dark.values, REMOTE_WEB_PALETTE_VARS.dark);
  assert.equal(dark.colorScheme, "dark");
});

test("inherit leaves the host's variables alone and derives the rgb twin from the host's colour", () => {
  const plan = planEmbedTheme(input({ host: { "--primary-color": "#ff6600", "--divider-color": "red" } }));
  assert.equal("--primary-color" in plan.values, false);
  assert.equal("--divider-color" in plan.values, false);
  assert.equal(plan.values["--rgb-primary-color"], "255, 102, 0");
  // HA's own pair stays HA's when the host left the base undefined.
  assert.equal(plan.values["--rgb-primary-text-color"], REMOTE_WEB_PALETTE_VARS.light["--rgb-primary-text-color"]);
  assert.equal(plan.values["--secondary-text-color"], REMOTE_WEB_PALETTE_VARS.light["--secondary-text-color"]);
  assert.equal(Object.keys(plan.values).length, PALETTE_VAR_NAMES.length - 2);
});

test("a host-defined twin is respected and an unresolvable host colour falls back to the palette's twin", () => {
  const respected = planEmbedTheme(input({ host: { "--primary-color": "#ff6600", "--rgb-primary-color": "1, 2, 3" } }));
  assert.equal("--rgb-primary-color" in respected.values, false);
  const fallback = planEmbedTheme(input({
    host: { "--error-color": "var(--brand-red)" },
    resolveColor: () => null,
  }));
  assert.equal(fallback.values["--rgb-error-color"], REMOTE_WEB_PALETTE_VARS.light["--rgb-error-color"]);
});

test("the host's polarity beats the OS preference: light text or a dark surface means the dark fill-ins", () => {
  const byText = planEmbedTheme(input({ host: { "--primary-text-color": "#f0f0f0" }, prefersDark: false }));
  assert.equal(byText.mode, "dark");
  assert.equal(byText.values["--secondary-text-color"], REMOTE_WEB_PALETTE_VARS.dark["--secondary-text-color"]);
  assert.equal(byText.values["--rgb-primary-text-color"], "240, 240, 240");
  const bySurface = planEmbedTheme(input({ host: { "--card-background-color": "#111" }, prefersDark: false }));
  assert.equal(bySurface.mode, "dark");
  const lightOnDarkOs = planEmbedTheme(input({ host: { "--primary-background-color": "#fafafa" }, prefersDark: true }));
  assert.equal(lightOnDarkOs.mode, "light");
  assert.equal(hostPolarity(input({ host: { "--primary-text-color": "#101010", "--card-background-color": "#000" } })), "light");
});

test("color-scheme is left to a host that set one", () => {
  const plan = planEmbedTheme(input({ hostColorScheme: "dark", host: { "--primary-text-color": "#eee" } }));
  assert.equal(plan.colorScheme, null);
  const empty = planEmbedTheme(input({ hostColorScheme: "" }));
  assert.equal(empty.colorScheme, "light");
});
