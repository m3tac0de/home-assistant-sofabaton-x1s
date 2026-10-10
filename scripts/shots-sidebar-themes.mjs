// Render the sidebar remote under every HA theme in the fixture and build
// a contact sheet (artifacts/sidebar-themes/). Needs the fixtures server:
//   node ./scripts/serve-playwright-fixtures.mjs   (port 4173)
//   node ./scripts/shots-sidebar-themes.mjs [hub=x1s|x2] [query...]
// Not part of the test suite: a visual check for theme work.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DIR = "artifacts/sidebar-themes";
mkdirSync(DIR, { recursive: true });
const extra = process.argv.slice(2).join("&");
const src = readFileSync("tests/fixtures/ha-themes.js", "utf8");
const fixture = new Function("return " + src.match(/=\s*(\{[\s\S]*\});?\s*$/)[1])();
const cases = [["HA default · light", "light"], ["HA default · dark", "dark"]];
for (const [name, theme] of Object.entries(fixture.themes)) {
  const modes = theme.modes ? ["light", "dark"].filter((k) => k in theme.modes) : [];
  if (modes.length === 2) cases.push([`${name} · light`, `${name}|light`], [`${name} · dark`, `${name}|dark`]);
  else cases.push([name, name]);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const rows = [];
for (const [label, value] of cases) {
  await page.goto(`http://127.0.0.1:4173/tests/playwright/fixtures/sidebar-panel-harness.html?theme=${encodeURIComponent(value)}${extra ? `&${extra}` : ""}`);
  await page.waitForFunction(() => Boolean(window.__sidebarHarness?.remote()?.shadowRoot?.querySelector("[data-key]")));
  await page.waitForTimeout(600);
  const glass = await page.evaluate(() => window.__sidebarHarness.remote().hasAttribute("data-glass"));
  const file = `sidebar-${value.replace(/[|]/g, "-").replace(/[^a-z0-9-]/gi, "").toLowerCase()}.png`;
  await page.screenshot({ path: `${DIR}/${file}` });
  rows.push({ label, file, glass });
  console.log(label.padEnd(32), glass ? "glass" : "");
}
const html = `<!doctype html><body style="margin:0;background:#2a2a2a;font:12px/1.4 Segoe UI,sans-serif;color:#ddd">
<div style="display:flex;flex-wrap:wrap;gap:20px;padding:20px;align-items:flex-start">${rows.map((r) =>
  `<figure style="margin:0;text-align:center"><img src="${r.file}" style="height:640px;width:auto;border-radius:12px;display:block;border:1px solid #444">
   <figcaption style="margin-top:6px">${r.label}${r.glass ? " · glass" : ""}</figcaption></figure>`).join("")}</div></body>`;
writeFileSync(`${DIR}/sheet.html`, html);
await page.setViewportSize({ width: 1700, height: 800 });
await page.goto(pathToFileURL(`${process.cwd()}/${DIR}/sheet.html`).href);
await page.screenshot({ path: `${DIR}/sheet.png`, fullPage: true });
await browser.close();
