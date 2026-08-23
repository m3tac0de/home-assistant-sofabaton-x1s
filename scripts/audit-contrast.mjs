// Contrast audit for the Sofabaton Control Panel under real Home Assistant
// themes. Renders harness scenarios in the tools-card harness, switches
// through the theme fixture (tests/fixtures/ha-themes.js), measures the WCAG
// contrast of every visible text element inside the card, and writes a
// report grouped by element signature so token decisions can be made per
// style rule rather than per screenshot.
//
//   node scripts/audit-contrast.mjs                       full run, report only
//   node scripts/audit-contrast.mjs --strict              exit 1 when anything fails
//   node scripts/audit-contrast.mjs --themes "dark,Caule Black Purple"
//   node scripts/audit-contrast.mjs --scenarios "automation-events,18"
//   node scripts/audit-contrast.mjs --width 360           card width preset (default 900)
//   node scripts/audit-contrast.mjs --top 40              rows in the stdout table
//   node scripts/audit-contrast.mjs --out artifacts/contrast-audit
//
// Thresholds are WCAG 2.x AA: 4.5:1 for text, 3:1 for large text (>= 24px,
// or >= 18.66px at weight >= 700). Disabled controls are measured and listed
// but never counted as failures. Signatures listed in
// tests/fixtures/contrast-allowlist.json are reported but not counted either.
//
// Measurement notes: the foreground is the computed color composited over
// the effective background, which is the chain of ancestor background-colors
// (crossing shadow roots and slots) composited outermost-in, with the chain's
// cumulative `opacity` applied to the foreground. Gradients are approximated
// by their averaged colour stops (flagged ≈bg); a wallpaper theme's view image
// is sampled under each element's rect (flagged ≈wp).

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 4179;

const DEFAULT_SCENARIOS = [
  "1",                    // Hub tab: connected status, settings tiles
  "4",                    // Settings: all off
  "8",                    // Cache tab populated, devices open
  "10",                   // Cache: stale data banner
  "13",                   // Logs tab
  "17",                   // Version mismatch (stale cache) edge state
  "activities-capture",   // Activity editor open
  "backup-compose",       // Backup composer
  "backup-edit",          // Backup edit view
  "restore-selection",    // Restore selection dialog
  "automation-events",    // Events subtab (the screenshot case)
  "18",                   // Wifi Commands device list
  "19",                   // Wifi Commands sync needed
  "21",                   // Inside a Wifi device: command grid
  "26",                   // Power-flagged + input slots
  "29",                   // Firmware update available nag chip
  "30",                   // Unsupported firmware: backup blocked
];

function parseArgs(argv) {
  const args = {
    strict: false, themes: null, scenarios: DEFAULT_SCENARIOS, width: "900",
    top: 30, out: join("artifacts", "contrast-audit"), baseUrl: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] ?? "");
    if (arg === "--strict") args.strict = true;
    else if (arg === "--themes") args.themes = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--scenarios") args.scenarios = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--width") args.width = next();
    else if (arg === "--top") args.top = Number(next()) || 30;
    else if (arg === "--out") args.out = next();
    else if (arg === "--base-url") args.baseUrl = next();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function startFixtureServer() {
  const child = spawn(process.execPath, [join(ROOT, "scripts", "serve-playwright-fixtures.mjs")], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => rejectReady(new Error("fixture server did not start")), 15_000);
    child.stdout.on("data", (chunk) => {
      if (String(chunk).includes("listening")) {
        clearTimeout(timer);
        resolveReady();
      }
    });
    child.on("exit", (code) => rejectReady(new Error(`fixture server exited (${code})`)));
  });
  return child;
}

async function loadAllowlist() {
  try {
    const raw = JSON.parse(await readFile(join(ROOT, "tests", "fixtures", "contrast-allowlist.json"), "utf8"));
    return new Set(Array.isArray(raw?.ignore) ? raw.ignore : []);
  } catch {
    return new Set();
  }
}

// Runs inside the harness page: measure every visible text-bearing element
// under the card's shadow tree.
async function measureInPage() {
  const harness = window.__toolsCardHarness;
  const card = harness.getCard();
  if (!card) return { error: "no card" };

  // Freeze motion: cancelled CSS animations revert to their base styles and
  // cancelled transitions jump to their end values, so pulse / reveal
  // keyframes cannot skew a sample. Document.getAnimations() covers shadow
  // trees.
  for (const animation of document.getAnimations()) {
    try { animation.cancel(); } catch { /* already idle */ }
  }

  // Computed colors come back as rgb()/rgba(), or as color(srgb r g b / a)
  // when they resulted from color-mix(in srgb, …) (Chromium serialisation).
  const parseColor = (value) => {
    const text = String(value).trim();
    let m = text.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const parts = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
      if (parts.length < 3) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    m = text.match(/^color\(srgb\s+([^)]+)\)$/);
    if (m) {
      const parts = m[1].split(/[\s\/]+/).filter(Boolean).map(Number);
      if (parts.length < 3) return null;
      return { r: parts[0] * 255, g: parts[1] * 255, b: parts[2] * 255, a: parts.length > 3 ? parts[3] : 1 };
    }
    return null;
  };
  const composite = (top, bottom) => {
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (c) => (top[c] * top.a + bottom[c] * bottom.a * (1 - top.a)) / a;
    return { r: mix("r"), g: mix("g"), b: mix("b"), a };
  };
  const luminance = ({ r, g, b }) => {
    const lin = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const contrast = (fg, bg) => {
    const l1 = luminance(fg);
    const l2 = luminance(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const fmt = ({ r, g, b }) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

  // Rendering parent: slot first (visual tree), then DOM parent, then host.
  const visualParent = (el) => el.assignedSlot ?? el.parentElement ?? el.getRootNode()?.host ?? null;

  // Wallpaper themes paint --lovelace-background (an image) on the view area.
  // Load it once per URL into a viewport-sized canvas laid out like
  // `center / cover [fixed]`, so the backdrop under any element rect can be
  // averaged. Needs CORS-enabled image hosts (the theme CDNs are).
  const viewArea = document.querySelector(".card-area");
  let wallpaper = null; // { sample(rect) } | null
  let wallpaperStatus = "none";
  if (viewArea) {
    const vcs = getComputedStyle(viewArea);
    const urlMatch = vcs.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
    if (urlMatch) {
      const url = urlMatch[1];
      window.__auditWallpapers = window.__auditWallpapers ?? {};
      if (!window.__auditWallpapers[url]) {
        window.__auditWallpapers[url] = new Promise((resolveImg) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolveImg(img);
          img.onerror = () => resolveImg(null);
          img.src = url;
        });
      }
      const img = await window.__auditWallpapers[url];
      if (img) {
        const fixed = vcs.backgroundAttachment === "fixed";
        const areaRect = viewArea.getBoundingClientRect();
        const box = fixed
          ? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }
          : { x: areaRect.left, y: areaRect.top, w: areaRect.width, h: areaRect.height };
        const scale = Math.max(box.w / img.naturalWidth, box.h / img.naturalHeight); // cover
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(box.w));
        canvas.height = Math.max(1, Math.round(box.h));
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, (box.w - dw) / 2, (box.h - dh) / 2, dw, dh);
        try {
          ctx.getImageData(0, 0, 1, 1); // throws when the canvas is tainted
          wallpaper = {
            sample(rect) {
              const x0 = Math.max(0, Math.floor(rect.left - box.x));
              const y0 = Math.max(0, Math.floor(rect.top - box.y));
              const x1 = Math.min(canvas.width, Math.ceil(rect.right - box.x));
              const y1 = Math.min(canvas.height, Math.ceil(rect.bottom - box.y));
              if (x1 <= x0 || y1 <= y0) return null;
              const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
              const step = Math.max(1, Math.floor(Math.sqrt(data.length / 4 / 400))); // ~400 samples
              let r = 0, g = 0, b = 0, n = 0;
              for (let i = 0; i < data.length; i += 4 * step) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n += 1; }
              return n ? { r: r / n, g: g / n, b: b / n, a: 1 } : null;
            },
          };
          wallpaperStatus = "sampled";
        } catch {
          wallpaperStatus = "tainted";
        }
      } else {
        wallpaperStatus = "unavailable";
      }
    }
  }

  const hostChain = (el) => {
    const hosts = [];
    let root = el.getRootNode();
    while (root && root.host) {
      hosts.push(root.host.tagName.toLowerCase());
      root = root.host.getRootNode();
    }
    return hosts;
  };

  const elements = [];
  const visit = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.tagName === "STYLE" || el.tagName === "SCRIPT") continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (hasText) elements.push(el);
      if (el.shadowRoot) visit(el.shadowRoot);
    }
  };
  visit(card.shadowRoot);

  const disabledOn = (el) => {
    if (el.hasAttribute?.("disabled") || el.getAttribute?.("aria-disabled") === "true") return true;
    if (el.dataset?.disabled === "true") return true;
    const cls = typeof el.className === "string" ? el.className : "";
    return /(^|\s|-)disabled(\s|$)/.test(cls) || /tab-disabled|is-disabled/.test(cls);
  };

  const results = [];
  for (const el of elements) {
    const hosts = hostChain(el);
    // Stub internals (ha-* elements the harness fakes) style themselves.
    if (hosts.some((tag) => tag.startsWith("ha-"))) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;

    const fgRaw = parseColor(cs.color);
    if (!fgRaw) continue;

    let opacity = 1;
    let bgStack = [];
    let approximate = false;
    let onWallpaper = false;
    let disabled = false;
    let hidden = false;
    let cursor = el;
    while (cursor) {
      const ccs = getComputedStyle(cursor);
      if (ccs.display === "none" || ccs.visibility === "hidden") { hidden = true; break; }
      opacity *= Number(ccs.opacity || 1);
      const bg = parseColor(ccs.backgroundColor);
      if (cursor === viewArea && wallpaper) {
        // The wallpaper image paints over the view's background-color.
        const sampled = wallpaper.sample(rect);
        if (sampled) { bgStack.push(sampled); onWallpaper = true; }
        if (bg && bg.a > 0) bgStack.push(bg);
      } else if (ccs.backgroundImage && ccs.backgroundImage !== "none") {
        // Gradients: approximate with the average of their colour stops so a
        // solid-looking tinted chip is not read as transparent. Flagged.
        const stops = [...ccs.backgroundImage.matchAll(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g)]
          .map((m) => parseColor(m[0]))
          .filter(Boolean);
        if (stops.length) {
          approximate = true;
          const avg = stops.reduce((acc, c) => ({ r: acc.r + c.r / stops.length, g: acc.g + c.g / stops.length, b: acc.b + c.b / stops.length, a: acc.a + c.a / stops.length }), { r: 0, g: 0, b: 0, a: 0 });
          // A gradient paints over the element's own background-color.
          bgStack.push(bg && bg.a > 0 ? composite(avg, bg) : avg);
        } else {
          if (/url\(/.test(ccs.backgroundImage)) approximate = true; // unsampled image
          if (bg && bg.a > 0) bgStack.push(bg);
        }
      } else if (bg && bg.a > 0) {
        bgStack.push(bg);
      }
      if (disabledOn(cursor)) disabled = true;
      if (cursor === document.documentElement) break;
      cursor = visualParent(cursor);
    }
    if (hidden) continue;

    // Composite outermost-in; default page ground is white if nothing opaque.
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = bgStack.length - 1; i >= 0; i -= 1) bg = composite(bgStack[i], bg);
    const fg = composite({ ...fgRaw, a: fgRaw.a * opacity }, bg);
    const ratio = contrast(fg, bg);

    const fontSize = parseFloat(cs.fontSize) || 0;
    const fontWeight = parseInt(cs.fontWeight, 10) || 400;
    const large = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const required = large ? 3 : 4.5;

    const classes = typeof el.className === "string"
      ? el.className.split(/\s+/).filter(Boolean)
      : [];
    const owner = hosts.find((tag) => tag.startsWith("sofabaton-")) ?? "sofabaton-control-panel";
    const signature = `${owner} ${el.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join("")}`;
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(" ")
      .slice(0, 48);

    results.push({
      signature,
      text,
      ratio: Math.round(ratio * 100) / 100,
      required,
      large,
      disabled,
      approximate,
      onWallpaper,
      fontSize: Math.round(fontSize * 10) / 10,
      fontWeight,
      fg: fmt(fg),
      bg: fmt(bg),
      opacity: Math.round(opacity * 100) / 100,
    });
  }
  return { results, wallpaperStatus };
}

function fmtRatio(value) {
  return `${value.toFixed(2)}:1`;
}

function mdEscape(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const allowlist = await loadAllowlist();
  let server = null;
  const baseUrl = args.baseUrl ?? `http://127.0.0.1:${PORT}`;
  if (!args.baseUrl) server = await startFixtureServer();

  const browser = await chromium.launch();
  const failures = [];
  const findings = new Map(); // key: scenario|signature -> { ...meta, samples: [] }
  const themeSummary = new Map();
  let themeValues = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1600 } });
    await page.goto(`${baseUrl}/tests/tools-card-harness.html?width=${encodeURIComponent(args.width)}`);
    await page.waitForFunction(() => window.__toolsCardHarness?.themeFixtureLoaded === true);
    const options = await page.evaluate(() => window.__toolsCardHarness.themeOptions);
    themeValues = args.themes ?? options.map((option) => option.value);
    const unknown = themeValues.filter((value) => !options.some((option) => option.value === value));
    if (unknown.length) throw new Error(`Unknown theme values: ${unknown.join(", ")}`);
    const scenarioIds = await page.evaluate(() => window.__toolsCardHarness.scenarioIds);
    const badScenario = args.scenarios.filter((id) => !scenarioIds.includes(id));
    if (badScenario.length) throw new Error(`Unknown scenarios: ${badScenario.join(", ")}`);

    for (const scenario of args.scenarios) {
      await page.evaluate((id) => window.__toolsCardHarness.loadScenario(id), scenario);
      for (const theme of themeValues) {
        await page.evaluate((value) => window.__toolsCardHarness.setTheme(value), theme);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.waitForTimeout(120);
        const themeLabel = options.find((option) => option.value === theme)?.label ?? theme;
        const { results, error, wallpaperStatus } = await page.evaluate(measureInPage);
        if (error) throw new Error(`${scenario}/${theme}: ${error}`);
        if (!themeSummary.has(theme)) themeSummary.set(theme, { label: themeLabel, measured: 0, failing: 0, worst: Infinity, wallpaper: wallpaperStatus });
        const summary = themeSummary.get(theme);
        if (wallpaperStatus !== "none") summary.wallpaper = wallpaperStatus;
        for (const row of results) {
          const key = `${scenario}\u0000${row.signature}`;
          if (!findings.has(key)) {
            findings.set(key, {
              scenario, signature: row.signature, text: row.text, required: row.required,
              fontSize: row.fontSize, fontWeight: row.fontWeight,
              disabled: row.disabled, allowlisted: allowlist.has(row.signature), samples: [],
            });
          }
          const entry = findings.get(key);
          // One sample per theme per signature: keep the worst ratio.
          const existing = entry.samples.find((sample) => sample.theme === theme);
          if (existing) {
            if (row.ratio < existing.ratio) Object.assign(existing, { ratio: row.ratio, fg: row.fg, bg: row.bg, text: row.text, approximate: row.approximate, onWallpaper: row.onWallpaper, opacity: row.opacity });
            continue;
          }
          entry.samples.push({ theme, themeLabel, ratio: row.ratio, fg: row.fg, bg: row.bg, text: row.text, approximate: row.approximate, onWallpaper: row.onWallpaper, opacity: row.opacity });
          summary.measured += 1;
          const counts = !row.disabled && !entry.allowlisted;
          if (counts && row.ratio < row.required) {
            summary.failing += 1;
            failures.push({ scenario, theme, themeLabel, ...row });
          }
          if (counts) summary.worst = Math.min(summary.worst, row.ratio);
        }
      }
      process.stdout.write(`  audited ${scenario} (${themeValues.length} themes)\n`);
    }
  } finally {
    await browser.close();
    server?.kill();
  }

  // ── Aggregate ──────────────────────────────────────────────────────────────
  const rows = [...findings.values()].map((entry) => {
    const counted = entry.samples.filter(() => !entry.disabled && !entry.allowlisted);
    const failing = counted.filter((sample) => sample.ratio < entry.required);
    const min = entry.samples.reduce((acc, sample) => Math.min(acc, sample.ratio), Infinity);
    const worst = entry.samples.reduce((acc, sample) => (sample.ratio < (acc?.ratio ?? Infinity) ? sample : acc), null);
    return { ...entry, min, worst, failingThemes: failing.map((sample) => sample.themeLabel), failCount: failing.length, themeCount: entry.samples.length };
  });
  // Worst first; failures before everything else.
  rows.sort((a, b) => (b.failCount - a.failCount) || (a.min - b.min));

  const themeRows = [...themeSummary.entries()].map(([value, summary]) => ({ value, ...summary }))
    .sort((a, b) => (b.failing - a.failing) || (a.worst - b.worst));

  const totalFailures = failures.length;
  const failingSignatures = rows.filter((row) => row.failCount > 0).length;

  // ── Report ─────────────────────────────────────────────────────────────────
  const generatedAt = new Date().toISOString();
  const md = [];
  md.push(`# Control panel contrast audit`);
  md.push(``);
  md.push(`Generated ${generatedAt} · width ${args.width} · ${themeValues.length} themes × ${args.scenarios.length} scenarios`);
  md.push(`WCAG AA thresholds: 4.5:1 text, 3:1 large text. Disabled controls and allowlisted signatures are listed but not counted.`);
  md.push(``);
  md.push(`Caveats: wallpaper themes (iOS, Frosted Glass, Liquid Glass, visionos) are measured against the average wallpaper pixels under each element (rows marked ≈wp; a blurred glass card averages its backdrop much the same way), so the exact figure depends on where the card sits on the image; the Themes table says whether the wallpaper was sampled or unavailable (offline). HA's default primary (#009ac7) on white is 3.26:1 by HA's own design, which affects active tabs and links. Rows marked ≈bg sit on a gradient (averaged colour stops).`);
  md.push(``);
  md.push(`**${totalFailures} failing samples across ${failingSignatures} element signatures** (${rows.length} signatures measured).`);
  md.push(``);
  md.push(`## Themes`);
  md.push(``);
  md.push(`| Theme | Failing samples | Measured | Worst ratio | Wallpaper |`);
  md.push(`|---|---:|---:|---:|---|`);
  for (const row of themeRows) {
    md.push(`| ${mdEscape(row.label)} | ${row.failing} | ${row.measured} | ${Number.isFinite(row.worst) ? fmtRatio(row.worst) : "–"} | ${row.wallpaper === "none" ? "" : row.wallpaper} |`);
  }
  md.push(``);
  // Cross-scenario rollup: shared chrome (tabs, dock, footer) repeats per
  // scenario; one row per signature makes the token work list readable.
  const rollup = new Map();
  for (const row of rows) {
    if (!rollup.has(row.signature)) {
      rollup.set(row.signature, { signature: row.signature, required: row.required, fontSize: row.fontSize, fontWeight: row.fontWeight, disabled: row.disabled, allowlisted: row.allowlisted, scenarios: new Set(), min: Infinity, worst: null, failingThemes: new Set() });
    }
    const entry = rollup.get(row.signature);
    entry.scenarios.add(row.scenario);
    if (row.min < entry.min) { entry.min = row.min; entry.worst = row.worst; }
    for (const theme of row.failingThemes) entry.failingThemes.add(theme);
  }
  const rollupRows = [...rollup.values()].sort((a, b) => (b.failingThemes.size - a.failingThemes.size) || (a.min - b.min));
  md.push(`## By signature, all scenarios (worst first)`);
  md.push(``);
  md.push(`| Signature | Sample text | Font | Req. | Min ratio | Worst theme (fg on bg) | Themes failing | Scenarios |`);
  md.push(`|---|---|---|---:|---:|---|---:|---:|`);
  for (const row of rollupRows) {
    const flags = [row.disabled ? "disabled" : null, row.allowlisted ? "allowlisted" : null, row.worst?.approximate ? "≈bg" : null, row.worst?.onWallpaper ? "≈wp" : null].filter(Boolean);
    md.push(`| \`${mdEscape(row.signature)}\`${flags.length ? ` (${flags.join(", ")})` : ""} | ${mdEscape(row.worst?.text ?? "")} | ${row.fontSize}px/${row.fontWeight} | ${row.required} | ${fmtRatio(row.min)} | ${mdEscape(row.worst?.themeLabel ?? "")} (${row.worst?.fg} on ${row.worst?.bg}) | ${row.failingThemes.size}/${themeValues.length} | ${row.scenarios.size} |`);
  }
  md.push(``);
  md.push(`## Element signatures per scenario (worst first)`);
  md.push(``);
  md.push(`| Scenario | Signature | Sample text | Font | Req. | Min ratio | Worst theme (fg on bg) | Fails |`);
  md.push(`|---|---|---|---|---:|---:|---|---:|`);
  for (const row of rows) {
    const flags = [row.disabled ? "disabled" : null, row.allowlisted ? "allowlisted" : null, row.worst?.approximate ? "≈bg" : null, row.worst?.onWallpaper ? "≈wp" : null].filter(Boolean);
    const font = `${row.fontSize}px/${row.fontWeight}`;
    md.push(`| ${row.scenario} | \`${mdEscape(row.signature)}\`${flags.length ? ` (${flags.join(", ")})` : ""} | ${mdEscape(row.worst?.text ?? row.text)} | ${font} | ${row.required} | ${fmtRatio(row.min)} | ${mdEscape(row.worst?.themeLabel ?? "")} (${row.worst?.fg} on ${row.worst?.bg}) | ${row.failCount}/${row.themeCount} |`);
  }
  md.push(``);
  md.push(`## Failing signatures by theme`);
  md.push(``);
  for (const row of rows.filter((r) => r.failCount > 0)) {
    md.push(`- \`${row.signature}\` (${row.scenario}): ${row.failingThemes.join(", ")}`);
  }
  md.push(``);

  const outBase = resolve(ROOT, args.out);
  await mkdir(dirname(outBase), { recursive: true });
  await writeFile(`${outBase}.md`, md.join("\n"), "utf8");
  await writeFile(`${outBase}.json`, JSON.stringify({
    generatedAt, width: args.width, themes: themeValues, scenarios: args.scenarios,
    totals: { failures: totalFailures, failingSignatures, signatures: rows.length },
    themes_summary: themeRows, signatures: rows,
    by_signature: rollupRows.map((row) => ({ ...row, scenarios: [...row.scenarios], failingThemes: [...row.failingThemes] })),
  }, null, 2), "utf8");

  // ── stdout ─────────────────────────────────────────────────────────────────
  process.stdout.write(`\n${totalFailures} failing samples across ${failingSignatures} signatures (${rows.length} measured)\n\n`);
  process.stdout.write(`Themes (failing samples / measured, worst):\n`);
  for (const row of themeRows) {
    process.stdout.write(`  ${row.label.padEnd(32)} ${String(row.failing).padStart(4)} / ${String(row.measured).padStart(4)}   worst ${Number.isFinite(row.worst) ? fmtRatio(row.worst) : "–"}${row.wallpaper && row.wallpaper !== "none" ? `   wallpaper ${row.wallpaper}` : ""}\n`);
  }
  process.stdout.write(`\nTop ${Math.min(args.top, rollupRows.length)} signatures (all scenarios; themes failing / total, min ratio):\n`);
  for (const row of rollupRows.slice(0, args.top)) {
    const flag = row.disabled ? " [disabled]" : row.allowlisted ? " [allowlisted]" : "";
    process.stdout.write(`  ${fmtRatio(row.min).padStart(8)}  req ${row.required}  ${String(row.failingThemes.size).padStart(2)}/${String(themeValues.length).padEnd(2)}  ${row.signature}${flag}  "${row.worst?.text ?? ""}"\n`);
  }
  process.stdout.write(`\nReport: ${outBase}.md (+ .json)\n`);

  if (args.strict && totalFailures > 0) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
