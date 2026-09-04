// Contrast + interaction-state audit for the Sofabaton cards under real Home
// Assistant themes. Renders harness scenarios (tools-card harness or
// remote-card harness), switches through the theme fixture
// (tests/fixtures/ha-themes.js), measures the WCAG contrast of every visible
// text element inside the card plus how visible hover / pressed surfaces are,
// and writes a report grouped by element signature so token decisions can be
// made per style rule rather than per screenshot.
//
//   node scripts/audit-contrast.mjs                       control panel, full run, report only
//   node scripts/audit-contrast.mjs --target remote       virtual remote (theme modes global + card)
//   node scripts/audit-contrast.mjs --target remote --modes card
//                                                         only card-level `theme:` application
//   node scripts/audit-contrast.mjs --strict              exit 1 when anything fails
//   node scripts/audit-contrast.mjs --themes "dark,Caule Black Purple"
//   node scripts/audit-contrast.mjs --scenarios "automation-events,18"
//   node scripts/audit-contrast.mjs --width 360           card width preset (default 900)
//   node scripts/audit-contrast.mjs --top 40              rows in the stdout table
//   node scripts/audit-contrast.mjs --out artifacts/contrast-audit
//   node scripts/audit-contrast.mjs --no-hover            skip the hover pass (rows marked @hover)
//   node scripts/audit-contrast.mjs --inject-css experiments/tokens.css
//                                                         A/B a token strategy: the stylesheet is appended
//                                                         to the card's (and its sofabaton-* children's)
//                                                         shadow roots before measuring; no source change
//
// Hover states are measured too (rows marked @hover): every :hover rule is
// cloned as a toggleable class in-page and its subjects measured hovered.
// Interaction states: every element with a :hover / :active rule (and every
// button/link) is measured at rest, hovered and pressed; the metric is the
// luminance contrast between the resting surface and the state surface,
// overlays (::before/::after) included. A state counts as visible at >= 1.1:1,
// or when the border colour changes by >= 1.5:1, an outline appears, the text
// colour changes by >= 1.3:1 or an underline appears.
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
const STATE_VISIBLE_RATIO = 1.1;
const BORDER_VISIBLE_RATIO = 1.5;

// Harness profiles. Page-side snippets are strings evaluated in the page.
const TARGETS = {
  "control-panel": {
    url: (args) => `/tests/tools-card-harness.html?width=${encodeURIComponent(args.width)}`,
    ready: "() => window.__toolsCardHarness?.themeFixtureLoaded === true",
    options: "() => window.__toolsCardHarness.themeOptions",
    scenarioIds: "() => window.__toolsCardHarness.scenarioIds",
    load: "(id) => window.__toolsCardHarness.loadScenario(id)",
    setTheme: "(value, mode) => window.__toolsCardHarness.setTheme(value)",
    cardSelector: "sofabaton-control-panel",
    viewAreaSelector: ".card-area",
    modes: ["global"],
    includeHosts: [],
    defaultScenarios: null, // DEFAULT_SCENARIOS below
    viewport: { width: 1100, height: 1600 },
    outName: "contrast-audit",
  },
  remote: {
    url: () => "/tests/playwright/fixtures/remote-card-harness.html",
    ready: "() => window.__remoteCardHarness?.themeFixtureLoaded === true",
    options: "() => window.__remoteCardHarness.themeOptions",
    scenarioIds: "() => window.__remoteCardHarness.scenarioNames",
    load: "(id) => window.__remoteCardHarness.loadView(id)",
    setTheme: "(value, mode) => window.__remoteCardHarness.setTheme(value, mode)",
    cardSelector: "sofabaton-virtual-remote",
    viewAreaSelector: "body",
    // global = theme on <html> (HA themes-mixin); card = the card's own
    // `theme:` config on an HA-default-light page (the card's _applyTheme).
    modes: ["global", "card"],
    defaultScenarios: [
      "active", "active+macros", "active+favorites", "active+menu", "device_mode", "powered_off",
      "unavailable", "no_activities", "device_keymap_missing", // status notice row
    ],
    // HA-component stubs whose internals mirror HA's tokens and are part of
    // the card's look (the activity select: label, value, menu).
    includeHosts: ["ha-select"],
    viewport: { width: 700, height: 1700 },
    outName: "contrast-audit-remote",
  },
};

const DEFAULT_SCENARIOS = [
  "1",                    // Hub tab: connected status, settings tiles
  "4",                    // Settings: all off
  "8",                    // Cache tab populated, devices open
  "10",                   // Cache: stale data banner
  "13",                   // Logs tab
  "17",                   // Version mismatch (stale cache) edge state
  "activities-capture",   // Activity editor open
  "payload-editor-ir",    // IR payload editor dialog: Pronto / Sofabaton tabs, hex textarea
  "macro-add-step",       // Macro editor's Add step dialog: native selects + hold input
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
    strict: false, themes: null, scenarios: null, width: "900", target: "control-panel", modes: null,
    top: 30, out: null, baseUrl: null, injectCss: null, noHover: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] ?? "");
    if (arg === "--strict") args.strict = true;
    else if (arg === "--target") args.target = next();
    else if (arg === "--modes") args.modes = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--themes") args.themes = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--scenarios") args.scenarios = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--width") args.width = next();
    else if (arg === "--top") args.top = Number(next()) || 30;
    else if (arg === "--out") args.out = next();
    else if (arg === "--base-url") args.baseUrl = next();
    else if (arg === "--inject-css") args.injectCss = next();
    else if (arg === "--no-hover") args.noHover = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  const target = TARGETS[args.target];
  if (!target) throw new Error(`Unknown target: ${args.target} (${Object.keys(TARGETS).join(", ")})`);
  args.scenarios = args.scenarios ?? target.defaultScenarios ?? DEFAULT_SCENARIOS;
  args.modes = args.modes ?? target.modes;
  const badMode = args.modes.filter((mode) => !target.modes.includes(mode));
  if (badMode.length) throw new Error(`Target ${args.target} does not support modes: ${badMode.join(", ")}`);
  args.out = args.out ?? join("artifacts", target.outName);
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
async function measureInPage({ injectCss, withHover, cardSelector, viewAreaSelector, includeHosts = [] }) {
  const card = document.querySelector(cardSelector);
  if (!card?.shadowRoot) return { error: `no card for ${cardSelector}` };
  // Our own components: anything with a shadow root that is not an ha-*
  // stub (the harnesses fake HA elements, which style themselves).
  const isOwnHost = (el) => Boolean(el.shadowRoot) && (!el.tagName.toLowerCase().startsWith("ha-") || includeHosts.includes(el.tagName.toLowerCase()));
  const isStubHost = (tag) => tag.startsWith("ha-") && !includeHosts.includes(tag);

  // Experimental stylesheet: append to every sofabaton-* shadow root that
  // does not carry it yet (sub-components render lazily, so repeat per call).
  if (injectCss) {
    // Appended as an adopted stylesheet so it cascades after the component's
    // own (adopted) styles and wins ties, like an edit to the source would.
    window.__auditInjected = window.__auditInjected ?? new WeakSet();
    const inject = (root) => {
      if (!window.__auditInjected.has(root)) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(injectCss);
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
        window.__auditInjected.add(root);
      }
      for (const el of root.querySelectorAll("*")) {
        if (isOwnHost(el)) inject(el.shadowRoot);
      }
    };
    inject(card.shadowRoot);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  // Freeze motion. Theme switches and hover toggles would otherwise be
  // measured mid-transition (a tile fading from the previous theme's dark
  // surface to this theme's light one read as grey): an audit-only sheet
  // disables transitions/animations in every shadow root, and running
  // animations are cancelled per root (Document.getAnimations() does not
  // reach shadow trees).
  window.__auditFrozen = window.__auditFrozen ?? new WeakSet();
  const freeze = (root) => {
    if (!window.__auditFrozen.has(root)) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync("*, *::before, *::after { transition: none !important; animation: none !important; }");
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      window.__auditFrozen.add(root);
    }
    for (const animation of root.getAnimations?.() ?? []) {
      try { animation.cancel(); } catch { /* already idle */ }
    }
    for (const el of root.querySelectorAll("*")) if (el.shadowRoot) freeze(el.shadowRoot);
  };
  freeze(card.shadowRoot);
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
  const viewArea = document.querySelector(viewAreaSelector);
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

  // Form fields carry their text as a value or placeholder, not as a text
  // node; they are measured like text elements (their own background is the
  // innermost layer of the chain).
  const FIELD_SELECTOR = "input:not([type='file']):not([type='checkbox']):not([type='radio']):not([type='hidden']):not([type='range']), textarea, select";
  const elements = [];
  const visit = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.tagName === "STYLE" || el.tagName === "SCRIPT") continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (hasText || el.matches(FIELD_SELECTOR)) elements.push(el);
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

  // Theme ceiling: how well the theme's own primary text reads on its own
  // card surface. Elements cannot be expected to beat that.
  let ceiling = null;
  {
    const haCard = card.shadowRoot.querySelector("ha-card");
    if (haCard) {
      const probe = document.createElement("span");
      probe.style.cssText = "position:absolute;visibility:hidden;color:var(--primary-text-color)";
      haCard.appendChild(probe);
      const fg = parseColor(getComputedStyle(probe).color);
      probe.remove();
      const stack = [];
      let cursor = haCard;
      const cardRect = haCard.getBoundingClientRect();
      while (cursor) {
        const ccs = getComputedStyle(cursor);
        const bg = parseColor(ccs.backgroundColor);
        if (cursor === viewArea && wallpaper) { const w = wallpaper.sample(cardRect); if (w) stack.push(w); }
        if (bg && bg.a > 0) stack.push(bg);
        if (cursor === document.documentElement) break;
        cursor = visualParent(cursor);
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i -= 1) bg = composite(stack[i], bg);
      if (fg) ceiling = Math.round(contrast(composite(fg, bg), bg) * 100) / 100;
    }
  }

  // Ancestor walk shared by the text and state probes: background layers
  // (inner -> outer, crossing shadow roots and slots, wallpaper sampled at
  // the view area), cumulative opacity, disabled / hidden flags.
  const collectChain = (el, rect) => {
    let opacity = 1;
    const bgStack = [];
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
    return { opacity, bgStack, approximate, onWallpaper, disabled, hidden };
  };

  const results = [];
  const measureElement = (el, state) => {
    const hosts = hostChain(el);
    // Stub internals (ha-* elements the harness fakes) style themselves.
    if (hosts.some(isStubHost)) return;
    // Decorative glyphs (aria-hidden) are not text content for WCAG 1.4.3.
    if (el.closest("[aria-hidden='true']")) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    let fgRaw = parseColor(cs.color);
    let text = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(" ")
      .slice(0, 48);
    let placeholder = false;
    if (el.matches(FIELD_SELECTOR)) {
      const value = el.tagName === "SELECT"
        ? String(el.selectedOptions?.[0]?.label ?? "")
        : String(el.value ?? "");
      if (value.trim()) {
        text = value.trim().slice(0, 48);
      } else if (el.placeholder) {
        // An empty field shows its placeholder: that is the text a reader sees.
        placeholder = true;
        text = String(el.placeholder).slice(0, 48);
        const pcs = getComputedStyle(el, "::placeholder");
        const pfg = parseColor(pcs.color);
        if (pfg) fgRaw = { ...pfg, a: pfg.a * (Number(pcs.opacity) || 1) };
      }
    }
    if (!fgRaw) return;

    const chain = collectChain(el, rect);
    if (chain.hidden) return;
    const { opacity, bgStack, approximate, onWallpaper, disabled } = chain;

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
    const owner = hosts.find((tag) => !isStubHost(tag)) ?? cardSelector;
    const signature = `${owner} ${el.tagName.toLowerCase()}${classes.filter((c) => c !== "audit-hover").map((c) => `.${c}`).join("")}${placeholder ? " ::placeholder" : ""}${state === "hover" ? " @hover" : ""}`;

    results.push({
      signature,
      state,
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
  };

  for (const el of elements) measureElement(el, "rest");

  // Native <select> popups (rows marked @popup). Chromium paints the popup's
  // option rows from each <option>'s computed color / background-color and
  // grounds the popup in the select's color-scheme (white, or Chromium's
  // dark menu grey) wherever the row colour is not opaque. Options have no
  // layout, so their computed styles are probed directly and a translucent
  // row is composited over that ground (flagged ≈bg: the exact ground is
  // Chromium's, not ours). One row per distinct option styling.
  const POPUP_GROUND = { light: { r: 255, g: 255, b: 255, a: 1 }, dark: { r: 59, g: 59, b: 59, a: 1 } };
  for (const select of elements.filter((el) => el.tagName === "SELECT")) {
    const hosts = hostChain(select);
    if (hosts.some(isStubHost)) continue;
    const scs = getComputedStyle(select);
    if (scs.display === "none" || scs.visibility === "hidden") continue;
    const rect = select.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const chain = collectChain(select, rect);
    if (chain.hidden) continue;
    const scheme = /dark/.test(scs.colorScheme) ? "dark" : "light";
    const classes = typeof select.className === "string" ? select.className.split(/\s+/).filter(Boolean) : [];
    const owner = hosts.find((tag) => !isStubHost(tag)) ?? cardSelector;
    const signature = `${owner} select${classes.map((c) => `.${c}`).join("")} option @popup`;
    const seen = new Set();
    for (const option of select.options) {
      const ocs = getComputedStyle(option);
      const fgRaw = parseColor(ocs.color);
      if (!fgRaw) continue;
      const bgRaw = parseColor(ocs.backgroundColor) ?? { r: 0, g: 0, b: 0, a: 0 };
      const key = `${ocs.color}|${ocs.backgroundColor}|${option.disabled}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const approximate = bgRaw.a < 0.999;
      const bg = composite(bgRaw, POPUP_GROUND[scheme]);
      const fg = composite(fgRaw, bg);
      const fontSize = parseFloat(ocs.fontSize) || 13.3;
      const fontWeight = parseInt(ocs.fontWeight, 10) || 400;
      results.push({
        signature,
        state: "rest",
        text: `${String(option.label || option.textContent || "").trim().slice(0, 32)} · ${scheme} scheme`,
        ratio: Math.round(contrast(fg, bg) * 100) / 100,
        required: 4.5,
        large: false,
        disabled: option.disabled || chain.disabled || disabledOn(select),
        approximate,
        onWallpaper: false,
        fontSize: Math.round(fontSize * 10) / 10,
        fontWeight,
        fg: fmt(fg),
        bg: fmt(bg),
        opacity: 1,
      });
    }
  }

  // Hover pass. Every `:hover` rule in the sofabaton-* shadow roots is
  // cloned once as `.audit-hover`; each rule's hovered subject is then given
  // that class in turn and the text inside it re-measured. Deterministic and
  // needs no pointer; covers hover rules on the element itself, on ancestors
  // (row highlights) and descendant selectors (`.btn:hover .label`).
  if (withHover) {
    window.__auditHoverSheets = window.__auditHoverSheets ?? new WeakMap();
    const subjectSelectors = new Map(); // root -> Set(selector)
    const roots = [];
    const collectRoots = (root) => {
      roots.push(root);
      for (const el of root.querySelectorAll("*")) {
        if (isOwnHost(el)) collectRoots(el.shadowRoot);
      }
    };
    collectRoots(card.shadowRoot);
    const splitSelectors = (text) => text.split(/,(?![^()]*\))/).map((part) => part.trim()).filter(Boolean);
    const pseudoSubject = (selector, pseudo) => {
      const idx = selector.indexOf(pseudo);
      if (idx === -1) return null;
      const prefix = selector.slice(0, idx);
      const tail = (selector.slice(idx + pseudo.length).match(/^[^\s>+~]*/) ?? [""])[0];
      // The subject is the element the user interacts with; strip any
      // ::before/::after the rule itself targets.
      const subject = (prefix + tail).replace(/::?(before|after)$/, "").trim();
      return subject || null;
    };
    const hoverSubject = (selector) => pseudoSubject(selector, ":hover");
    const activeSubjects = new Map(); // root -> Set(selector)
    for (const root of roots) {
      const sheets = [...root.adoptedStyleSheets, ...[...root.querySelectorAll("style")].map((el) => el.sheet).filter(Boolean)];
      const subjects = new Set();
      const actives = new Set();
      const cloned = [];
      for (const sheet of sheets) {
        let rules;
        try { rules = [...sheet.cssRules]; } catch { continue; }
        const walk = (list) => {
          for (const rule of list) {
            if (rule.cssRules && rule.cssRules.length && !rule.selectorText) { walk([...rule.cssRules]); continue; }
            if (!rule.selectorText) continue;
            if (rule.selectorText.includes(":hover")) {
              const selectors = splitSelectors(rule.selectorText).filter((sel) => sel.includes(":hover"));
              for (const sel of selectors) { const subject = hoverSubject(sel); if (subject) subjects.add(subject); }
              cloned.push(`${selectors.map((sel) => sel.replaceAll(":hover", ".audit-hover")).join(", ")} { ${rule.style.cssText} }`);
            }
            if (rule.selectorText.includes(":active")) {
              const selectors = splitSelectors(rule.selectorText).filter((sel) => sel.includes(":active"));
              for (const sel of selectors) { const subject = pseudoSubject(sel, ":active"); if (subject) actives.add(subject); }
              cloned.push(`${selectors.map((sel) => sel.replaceAll(":active", ".audit-active")).join(", ")} { ${rule.style.cssText} }`);
            }
          }
        };
        walk(rules);
      }
      subjectSelectors.set(root, subjects);
      activeSubjects.set(root, actives);
      if (cloned.length && !window.__auditHoverSheets.has(root)) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(cloned.join("\n"));
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
        window.__auditHoverSheets.set(root, sheet);
      }
    }
    const hovered = new Set();
    for (const root of roots) {
      for (const selector of subjectSelectors.get(root) ?? []) {
        let targets;
        try { targets = root.querySelectorAll(selector); } catch { continue; }
        for (const target of targets) {
          if (hovered.has(target)) continue;
          hovered.add(target);
          const cs = getComputedStyle(target);
          if (cs.display === "none" || cs.visibility === "hidden") continue;
          target.classList.add("audit-hover");
          const inside = [target, ...target.querySelectorAll("*")].filter((el) =>
            [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
          for (const el of inside) measureElement(el, "hover");
          target.classList.remove("audit-hover");
        }
      }
    }

    // ── Interaction-state probe ────────────────────────────────────────────
    // Surface colour of an element = its own background + ::before/::after
    // overlays, composited over its ancestor chain; compared at rest vs
    // hovered vs pressed.
    const surfaceOf = (el) => {
      const rect = el.getBoundingClientRect();
      const chain = collectChain(el, rect);
      if (chain.hidden) return null;
      const layers = [];
      for (const pseudo of ["::after", "::before"]) {
        const pcs = getComputedStyle(el, pseudo);
        if (pcs.content === "none" || pcs.display === "none") continue;
        const color = parseColor(pcs.backgroundColor);
        const alpha = (color?.a ?? 0) * (Number(pcs.opacity) || 0);
        if (color && alpha > 0) layers.push({ ...color, a: alpha });
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = chain.bgStack.length - 1; i >= 0; i -= 1) bg = composite(chain.bgStack[i], bg);
      for (let i = layers.length - 1; i >= 0; i -= 1) bg = composite(layers[i], bg);
      const cs = getComputedStyle(el);
      const borderWidth = parseFloat(cs.borderTopWidth) || 0;
      const border = borderWidth > 0 ? parseColor(cs.borderTopColor) : null;
      const outline = cs.outlineStyle !== "none" && (parseFloat(cs.outlineWidth) || 0) > 0 ? cs.outlineColor : null;
      const text = parseColor(cs.color);
      return {
        color: bg,
        text: text ? composite({ ...text, a: text.a * chain.opacity }, bg) : null,
        decoration: cs.textDecorationLine,
        border: border && border.a > 0 ? composite(border, bg) : null,
        outline,
        shadow: cs.boxShadow,
        transform: cs.transform,
        disabled: chain.disabled || el.matches(":disabled, [aria-disabled='true']"),
      };
    };
    const stateCandidates = new Set();
    for (const root of roots) {
      for (const selector of [...(subjectSelectors.get(root) ?? []), ...(activeSubjects.get(root) ?? [])]) {
        let targets;
        try { targets = root.querySelectorAll(selector); } catch { continue; }
        for (const target of targets) stateCandidates.add(target);
      }
      for (const target of root.querySelectorAll("button, a[href], [role='button']")) stateCandidates.add(target);
    }
    for (const target of stateCandidates) {
      if (hostChain(target).some(isStubHost)) continue;
      const cs = getComputedStyle(target);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const rest = surfaceOf(target);
      if (!rest) continue;
      const classes = typeof target.className === "string" ? target.className.split(/\s+/).filter(Boolean) : [];
      const owner = hostChain(target).find((tag) => !isStubHost(tag)) ?? cardSelector;
      const base = `${owner} ${target.tagName.toLowerCase()}${classes.map((c) => `.${c}`).join("")}`;
      const text = (target.textContent || target.getAttribute("aria-label") || target.getAttribute("title") || "").trim().slice(0, 40);
      // Included HA stubs (ha-select) model HA's hover layer; a pressed state
      // is not part of HA's dropdown (it closes on click), so skip @active.
      const inIncludedHost = hostChain(target).some((tag) => includeHosts.includes(tag));
      for (const state of ["hover", "active"]) {
        if (state === "active" && inIncludedHost) continue;
        target.classList.add(`audit-${state}`);
        const now = surfaceOf(target);
        target.classList.remove(`audit-${state}`);
        if (!now) continue;
        const delta = Math.round(contrast(now.color, rest.color) * 100) / 100;
        const borderDelta = rest.border && now.border ? Math.round(contrast(now.border, rest.border) * 100) / 100 : (Boolean(rest.border) !== Boolean(now.border) ? 9 : 1);
        const outlineAppeared = !rest.outline && Boolean(now.outline);
        const shadowChanged = rest.shadow !== now.shadow;
        const transformChanged = rest.transform !== now.transform;
        // Text-only cues: links and tabs signal hover through the text.
        const textDelta = rest.text && now.text ? Math.round(contrast(now.text, rest.text) * 100) / 100 : 1;
        const decorationChanged = rest.decoration !== now.decoration;
        results.push({
          kind: "state",
          signature: `${base} @${state}`,
          state,
          text,
          ratio: delta,
          borderDelta,
          outlineAppeared,
          shadowChanged,
          transformChanged,
          textDelta,
          decorationChanged,
          visible: delta >= 1.1 || borderDelta >= 1.5 || outlineAppeared || textDelta >= 1.3 || decorationChanged,
          required: 1.1,
          disabled: rest.disabled,
          rest: fmt(rest.color),
          now: fmt(now.color),
          onWallpaper: false,
          approximate: false,
        });
      }
    }
  }

  return { results, wallpaperStatus, ceiling };
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
  const injectCss = args.injectCss ? await readFile(resolve(ROOT, args.injectCss), "utf8") : null;
  let server = null;
  const baseUrl = args.baseUrl ?? `http://127.0.0.1:${PORT}`;
  if (!args.baseUrl) server = await startFixtureServer();

  const target = TARGETS[args.target];
  const browser = await chromium.launch();
  const failures = [];
  const findings = new Map(); // key: scenario|signature -> { ...meta, samples: [] }
  const stateFindings = new Map(); // key: scenario|signature -> { ...meta, samples: [] }
  const stateFailures = [];
  const themeSummary = new Map();
  let themeValues = [];
  // One matrix entry per theme x mode; the key carries the mode so the
  // tables can show "Caule Black Purple (card)" next to the global entry.
  const entryKey = (theme, mode) => (mode === "global" ? theme : `${theme} (${mode})`);
  try {
    const page = await browser.newPage({ viewport: target.viewport });
    await page.goto(`${baseUrl}${target.url(args)}`);
    await page.waitForFunction(`(${target.ready})()`);
    const options = await page.evaluate(`(${target.options})()`);
    themeValues = args.themes ?? options.map((option) => option.value);
    const unknown = themeValues.filter((value) => !options.some((option) => option.value === value));
    if (unknown.length) throw new Error(`Unknown theme values: ${unknown.join(", ")}`);
    const scenarioIds = await page.evaluate(`(${target.scenarioIds})()`);
    const badScenario = args.scenarios.filter((id) => !scenarioIds.includes(id));
    if (badScenario.length) throw new Error(`Unknown scenarios: ${badScenario.join(", ")}`);
    const entries = [];
    for (const mode of args.modes) {
      for (const theme of themeValues) {
        // Card-level application only makes sense for named themes.
        if (mode === "card" && (theme === "light" || theme === "dark")) continue;
        entries.push({ theme, mode });
      }
    }

    for (const scenario of args.scenarios) {
      await page.evaluate(`(${target.load})(${JSON.stringify(scenario)})`);
      for (const { theme, mode } of entries) {
        await page.evaluate(`(${target.setTheme})(${JSON.stringify(theme)}, ${JSON.stringify(mode)})`);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        await page.waitForTimeout(120);
        const baseLabel = options.find((option) => option.value === theme)?.label ?? theme;
        const themeLabel = mode === "global" ? baseLabel : `${baseLabel} (${mode})`;
        const key = entryKey(theme, mode);
        const { results, error, wallpaperStatus, ceiling } = await page.evaluate(measureInPage, {
          injectCss, withHover: !args.noHover, cardSelector: target.cardSelector, viewAreaSelector: target.viewAreaSelector, includeHosts: target.includeHosts ?? [],
        });
        if (error) throw new Error(`${scenario}/${key}: ${error}`);
        if (!themeSummary.has(key)) themeSummary.set(key, { label: themeLabel, mode, measured: 0, failing: 0, adjustedFailing: 0, worst: Infinity, wallpaper: wallpaperStatus, ceiling, states: 0, statesHidden: 0 });
        const summary = themeSummary.get(key);
        if (wallpaperStatus !== "none") summary.wallpaper = wallpaperStatus;
        if (ceiling != null) summary.ceiling = Math.min(summary.ceiling ?? Infinity, ceiling);
        const theme_ = key; // sample key below
        for (const row of results.filter((r) => r.kind === "state")) {
          const skey = `${scenario}\u0000${row.signature}`;
          if (!stateFindings.has(skey)) {
            stateFindings.set(skey, { scenario, signature: row.signature, state: row.state, text: row.text, disabled: row.disabled, samples: [] });
          }
          const entry = stateFindings.get(skey);
          if (entry.samples.some((sample) => sample.theme === theme_)) continue;
          entry.samples.push({ theme: theme_, themeLabel, ratio: row.ratio, borderDelta: row.borderDelta, outlineAppeared: row.outlineAppeared, shadowChanged: row.shadowChanged, transformChanged: row.transformChanged, textDelta: row.textDelta, decorationChanged: row.decorationChanged, visible: row.visible, rest: row.rest, now: row.now });
          if (!row.disabled) {
            summary.states += 1;
            if (!row.visible) { summary.statesHidden += 1; stateFailures.push({ scenario, theme: theme_, themeLabel, ...row }); }
          }
        }
        for (const row of results.filter((r) => r.kind !== "state")) {
          const theme = theme_;
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
            // Theme-adjusted: only count it when the element also reads worse
            // than the theme's own primary text on the card (its ceiling).
            if (ceiling == null || row.ratio < Math.min(row.required, ceiling * 0.98)) summary.adjustedFailing += 1;
          }
          if (counts) summary.worst = Math.min(summary.worst, row.ratio);
        }
      }
      process.stdout.write(`  audited ${scenario} (${entries.length} theme entries)\n`);
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
  const hoverFailures = failures.filter((f) => f.state === "hover").length;
  const failingSignatures = rows.filter((row) => row.failCount > 0).length;

  const stateRows = [...stateFindings.values()].map((entry) => {
    const counted = entry.disabled ? [] : entry.samples;
    const hidden = counted.filter((sample) => !sample.visible);
    const min = entry.samples.reduce((acc, sample) => Math.min(acc, sample.ratio), Infinity);
    const worst = entry.samples.reduce((acc, sample) => (sample.ratio < (acc?.ratio ?? Infinity) ? sample : acc), null);
    return { ...entry, min, worst, hiddenThemes: hidden.map((sample) => sample.themeLabel), hiddenCount: hidden.length, themeCount: entry.samples.length };
  }).sort((a, b) => (b.hiddenCount - a.hiddenCount) || (a.min - b.min));
  const stateRollup = new Map();
  for (const row of stateRows) {
    if (!stateRollup.has(row.signature)) stateRollup.set(row.signature, { signature: row.signature, state: row.state, text: row.text, disabled: row.disabled, scenarios: new Set(), min: Infinity, worst: null, hiddenThemes: new Set() });
    const entry = stateRollup.get(row.signature);
    entry.scenarios.add(row.scenario);
    if (row.min < entry.min) { entry.min = row.min; entry.worst = row.worst; }
    for (const theme of row.hiddenThemes) entry.hiddenThemes.add(theme);
  }
  const stateRollupRows = [...stateRollup.values()].sort((a, b) => (b.hiddenThemes.size - a.hiddenThemes.size) || (a.min - b.min));
  const totalStateFailures = stateFailures.length;

  // ── Report ─────────────────────────────────────────────────────────────────
  const generatedAt = new Date().toISOString();
  const md = [];
  md.push(`# Control panel contrast audit`);
  md.push(``);
  md.push(`Generated ${generatedAt} · target ${args.target} · width ${args.width} · ${themeSummary.size} theme entries (${themeValues.length} themes × modes ${args.modes.join("+")}) × ${args.scenarios.length} scenarios${args.injectCss ? ` · experiment: ${args.injectCss}` : ""}`);
  md.push(`WCAG AA thresholds: 4.5:1 text, 3:1 large text. Disabled controls and allowlisted signatures are listed but not counted.`);
  md.push(``);
  md.push(`Caveats: wallpaper themes (iOS, Frosted Glass, Liquid Glass, visionos) are measured against the average wallpaper pixels under each element (rows marked ≈wp; a blurred glass card averages its backdrop much the same way), so the exact figure depends on where the card sits on the image; the Themes table says whether the wallpaper was sampled or unavailable (offline). HA's default primary (#009ac7) on white is 3.26:1 by HA's own design, which affects active tabs and links. Rows marked ≈bg sit on a gradient (averaged colour stops).`);
  md.push(``);
  md.push(`**${totalFailures} failing samples across ${failingSignatures} element signatures** (${rows.length} signatures measured; ${hoverFailures} of the failures are hover states, marked @hover).`);
  md.push(``);
  md.push(`**Interaction states: ${totalStateFailures} hidden hover/pressed states** (surface change below ${STATE_VISIBLE_RATIO}:1 with no border/outline change) across ${stateRollupRows.filter((r) => r.hiddenThemes.size).length} signatures.`);
  md.push(``);
  md.push(`## Themes`);
  md.push(``);
  md.push(`| Theme | Failing samples | Theme-adjusted | Measured | Worst ratio | Theme ceiling | Hidden states | States | Wallpaper |`);
  md.push(`|---|---:|---:|---:|---:|---:|---:|---:|---|`);
  for (const row of themeRows) {
    md.push(`| ${mdEscape(row.label)} | ${row.failing} | ${row.adjustedFailing} | ${row.measured} | ${Number.isFinite(row.worst) ? fmtRatio(row.worst) : "–"} | ${row.ceiling != null ? fmtRatio(row.ceiling) : "–"} | ${row.statesHidden} | ${row.states} | ${row.wallpaper === "none" ? "" : row.wallpaper} |`);
  }
  md.push(``);
  md.push(`"Theme ceiling" is the contrast of the theme's own primary text on its own card surface; "theme-adjusted" counts only samples that read worse than that ceiling (required = min(4.5, ceiling)), i.e. failures we can fix without overriding the theme.`);
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
    md.push(`| \`${mdEscape(row.signature)}\`${flags.length ? ` (${flags.join(", ")})` : ""} | ${mdEscape(row.worst?.text ?? "")} | ${row.fontSize}px/${row.fontWeight} | ${row.required} | ${fmtRatio(row.min)} | ${mdEscape(row.worst?.themeLabel ?? "")} (${row.worst?.fg} on ${row.worst?.bg}) | ${row.failingThemes.size}/${themeSummary.size} | ${row.scenarios.size} |`);
  }
  md.push(``);
  md.push(`## Interaction states by signature (least visible first)`);
  md.push(``);
  md.push(`Surface ratio = luminance contrast between the resting surface and the hovered / pressed surface (overlays included); visible at >= ${STATE_VISIBLE_RATIO}:1, or when the border changes >= ${BORDER_VISIBLE_RATIO}:1, an outline appears, the text colour changes >= 1.3:1 or an underline appears. Flags name the cue that changes in the state.`);
  md.push(``);
  md.push(`| Signature | Sample | Min surface ratio | Worst theme (rest -> state) | Flags | Themes hidden | Scenarios |`);
  md.push(`|---|---|---:|---|---|---:|---:|`);
  for (const row of stateRollupRows) {
    const w = row.worst ?? {};
    const flags = [w.borderDelta >= BORDER_VISIBLE_RATIO ? "border" : null, w.outlineAppeared ? "outline" : null, w.textDelta >= 1.3 ? "text" : null, w.decorationChanged ? "underline" : null, w.shadowChanged ? "shadow" : null, w.transformChanged ? "transform" : null, row.disabled ? "disabled" : null].filter(Boolean).join(", ");
    md.push(`| \`${mdEscape(row.signature)}\` | ${mdEscape(row.text)} | ${Number.isFinite(row.min) ? fmtRatio(row.min) : "–"} | ${mdEscape(w.themeLabel ?? "")} (${w.rest} -> ${w.now}) | ${flags} | ${row.hiddenThemes.size}/${themeSummary.size} | ${row.scenarios.size} |`);
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
    target: args.target, modes: args.modes,
    totals: { failures: totalFailures, adjustedFailures: themeRows.reduce((acc, row) => acc + row.adjustedFailing, 0), failingSignatures, signatures: rows.length, hiddenStates: totalStateFailures },
    states: stateRows, states_by_signature: stateRollupRows.map((row) => ({ ...row, scenarios: [...row.scenarios], hiddenThemes: [...row.hiddenThemes] })),
    themes_summary: themeRows, signatures: rows,
    by_signature: rollupRows.map((row) => ({ ...row, scenarios: [...row.scenarios], failingThemes: [...row.failingThemes] })),
  }, null, 2), "utf8");

  // ── stdout ─────────────────────────────────────────────────────────────────
  process.stdout.write(`\n${totalFailures} failing samples across ${failingSignatures} signatures (${rows.length} measured; ${hoverFailures} hover-state text failures)\n`);
  process.stdout.write(`${totalStateFailures} hidden hover/pressed states across ${stateRollupRows.filter((r) => r.hiddenThemes.size).length} signatures\n\n`);
  const totalAdjusted = themeRows.reduce((acc, row) => acc + row.adjustedFailing, 0);
  process.stdout.write(`Themes (failing / theme-adjusted / measured, worst, theme ceiling):\n`);
  for (const row of themeRows) {
    process.stdout.write(`  ${row.label.padEnd(38)} ${String(row.failing).padStart(4)} ${String(row.adjustedFailing).padStart(4)} / ${String(row.measured).padStart(4)}   worst ${Number.isFinite(row.worst) ? fmtRatio(row.worst) : "–"}   ceiling ${row.ceiling != null ? fmtRatio(row.ceiling) : "–"}   hidden states ${String(row.statesHidden).padStart(3)}/${row.states}${row.wallpaper && row.wallpaper !== "none" ? `   wallpaper ${row.wallpaper}` : ""}\n`);
  }
  process.stdout.write(`  theme-adjusted total: ${totalAdjusted}\n`);
  process.stdout.write(`\nTop ${Math.min(args.top, rollupRows.length)} signatures (all scenarios; themes failing / total, min ratio):\n`);
  for (const row of rollupRows.slice(0, args.top)) {
    const flag = row.disabled ? " [disabled]" : row.allowlisted ? " [allowlisted]" : "";
    process.stdout.write(`  ${fmtRatio(row.min).padStart(8)}  req ${row.required}  ${String(row.failingThemes.size).padStart(2)}/${String(themeSummary.size).padEnd(2)}  ${row.signature}${flag}  "${row.worst?.text ?? ""}"\n`);
  }
  process.stdout.write(`\nLeast visible interaction states (themes hidden / total, min surface ratio):\n`);
  for (const row of stateRollupRows.slice(0, Math.min(args.top, stateRollupRows.length))) {
    const w = row.worst ?? {};
    const flags = [w.borderDelta >= BORDER_VISIBLE_RATIO ? "border" : null, w.outlineAppeared ? "outline" : null, w.textDelta >= 1.3 ? "text" : null, w.decorationChanged ? "underline" : null, w.shadowChanged ? "shadow" : null, w.transformChanged ? "transform" : null].filter(Boolean).join(",");
    process.stdout.write(`  ${(Number.isFinite(row.min) ? fmtRatio(row.min) : "–").padStart(8)}  ${String(row.hiddenThemes.size).padStart(2)}/${String(themeSummary.size).padEnd(2)}  ${row.signature}${row.disabled ? " [disabled]" : ""}  "${row.text}"${flags ? `  [${flags}]` : ""}\n`);
  }
  process.stdout.write(`\nReport: ${outBase}.md (+ .json)\n`);

  if (args.strict && (totalFailures > 0 || totalStateFailures > 0)) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
