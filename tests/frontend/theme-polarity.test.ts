import test from "node:test";
import assert from "node:assert/strict";

import {
  compositeOver,
  contrastRatio,
  formatRgb,
  parseCssColor,
  relativeLuminance,
  resolveThemePolarity,
} from "../../custom_components/sofabaton_x1s/www/src/shared/styles/theme-polarity";

// Values are the resolved text colour / card surface of themes in
// tests/fixtures/ha-themes.js; the scheme is what the native <select>
// popup needs, not what HA's dark-mode flag says.
const rgb = (r: number, g: number, b: number, a = 1) => ({ r, g, b, a });

test("parseCssColor reads Chromium's computed-style serialisations", () => {
  assert.deepEqual(parseCssColor("rgb(33, 33, 33)"), rgb(33, 33, 33));
  assert.deepEqual(parseCssColor("rgba(255, 255, 255, 0.96)"), rgb(255, 255, 255, 0.96));
  assert.deepEqual(parseCssColor("color(srgb 1 0.5 0 / 0.25)"), rgb(255, 127.5, 0, 0.25));
  assert.equal(parseCssColor("transparent"), null);
  assert.equal(parseCssColor(""), null);
  assert.equal(parseCssColor(undefined), null);
});

test("luminance, contrast and compositing match the audit's arithmetic", () => {
  assert.equal(relativeLuminance(rgb(255, 255, 255)), 1);
  assert.equal(relativeLuminance(rgb(0, 0, 0)), 0);
  assert.equal(Math.round(contrastRatio(rgb(0, 0, 0), rgb(255, 255, 255))), 21);
  // rgba(150,150,150,0.3) over black = 45 grey.
  assert.deepEqual(formatRgb(compositeOver(rgb(150, 150, 150, 0.3), rgb(0, 0, 0))), "rgb(45, 45, 45)");
  // Fully transparent over anything is the bottom colour.
  assert.deepEqual(formatRgb(compositeOver(rgb(0, 0, 0, 0), rgb(10, 20, 30))), "rgb(10, 20, 30)");
});

test("opaque surfaces decide the scheme by their own luminance", () => {
  // HA default light: #212121 on #fff.
  const light = resolveThemePolarity(rgb(33, 33, 33), rgb(255, 255, 255));
  assert.equal(light.scheme, "light");
  assert.equal(light.ground, "#ffffff");
  assert.equal(light.popupSurface, "rgb(255, 255, 255)"); // the card surface itself
  // HA default dark: #e1e1e1 on #1c1c1c.
  const dark = resolveThemePolarity(rgb(225, 225, 225), rgb(28, 28, 28));
  assert.equal(dark.scheme, "dark");
  assert.equal(dark.ground, "#000000");
  assert.equal(dark.popupSurface, "rgb(28, 28, 28)");
  // Caule Light: mid-grey text (#7f7f7f) on an opaque white card. The text
  // alone would read better on black; the card says light, and it is.
  assert.equal(resolveThemePolarity(rgb(127, 127, 127), rgb(255, 255, 255)).scheme, "light");
});

test("translucent (glass) surfaces follow the text colour", () => {
  // Liquid Glass light mode: white text on rgba(150,150,150,0.3). HA calls
  // it light; the popup must be dark or the options are white on white.
  const liquidLight = resolveThemePolarity(rgb(255, 255, 255, 0.96), rgb(150, 150, 150, 0.3));
  assert.equal(liquidLight.scheme, "dark");
  assert.equal(liquidLight.popupSurface, "rgb(45, 45, 45)");
  assert.ok(contrastRatio(rgb(255, 255, 255), parseCssColor(liquidLight.popupSurface)!) > 9);
  // Liquid Glass dark: rgba(0,0,0,0.3).
  assert.equal(resolveThemePolarity(rgb(255, 255, 255, 0.96), rgb(0, 0, 0, 0.3)).scheme, "dark");
  // Frosted Glass Dark: white on rgba(10,10,10,0.4).
  assert.equal(resolveThemePolarity(rgb(255, 255, 255), rgb(10, 10, 10, 0.4)).scheme, "dark");
  // Frosted Glass Light: #464a47 on rgba(245,245,245,0.4).
  const frostedLight = resolveThemePolarity(rgb(70, 74, 71), rgb(245, 245, 245, 0.4));
  assert.equal(frostedLight.scheme, "light");
  assert.ok(contrastRatio(rgb(70, 74, 71), parseCssColor(frostedLight.popupSurface)!) > 7);
});

test("popup surface is always opaque and reads against the text colour", () => {
  const cases: Array<[ReturnType<typeof rgb>, ReturnType<typeof rgb> | null]> = [
    [rgb(255, 255, 255, 0.96), rgb(150, 150, 150, 0.3)],
    [rgb(127, 127, 127), rgb(255, 255, 255)],
    [rgb(234, 235, 238, 0.98), rgb(30, 30, 30, 0.9)],
    [rgb(19, 21, 54, 0.98), rgb(254, 244, 242, 0.9)],
    [rgb(33, 33, 33), null], // no surface resolved at all
  ];
  for (const [text, surface] of cases) {
    const polarity = resolveThemePolarity(text, surface);
    const popup = parseCssColor(polarity.popupSurface)!;
    assert.equal(popup.a, 1, `${polarity.popupSurface} is opaque`);
    const shown = compositeOver(text, popup);
    // Untinted, so the theme's own ceiling is kept: Caule Light's grey
    // text stays at its 3.95:1 on white, every other fixture theme reads
    // far better.
    assert.ok(contrastRatio(shown, popup) >= 3.9, `${formatRgb(text)} on ${polarity.popupSurface}: ${contrastRatio(shown, popup).toFixed(2)}`);
  }
});
