// Regenerate tests/fixtures/ha-themes.js: Home Assistant's built-in base
// palette (light + dark) plus a curated set of popular community themes, so
// the tools-card harness can render the card under the variable maps real
// users have instead of our hand-picked palette.
//
//   node scripts/fetch-ha-themes.mjs                 refresh with the defaults below
//   node scripts/fetch-ha-themes.mjs --list          print the themes the HA instance has
//   node scripts/fetch-ha-themes.mjs --themes "noctis,Caule Black Purple"
//   node scripts/fetch-ha-themes.mjs --frontend-ref <sha>
//
// Sources
//   * Base palette: the `css\`…\`` globals under src/resources/theme of
//     home-assistant/frontend at FRONTEND_REF (pinned; bump deliberately).
//     Only custom-property declarations are kept, extracted the same way the
//     frontend's own derived-css-vars helper does.
//   * Themes: `frontend/get_themes` over the HA websocket of the dev instance
//     in scripts/.ha-config.json (token in scripts/.ha-token). HA hands back
//     the parsed YAML maps, so no YAML dependency is needed; Playwright's
//     bundled Chromium is used as the websocket client because Node 20 has
//     no global WebSocket.
//
// The fixture stores the raw variable maps (var() chains untouched) so the
// harness can layer them exactly like applyThemesOnElement does and let the
// browser resolve them.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "tests", "fixtures", "ha-themes.js");

// home-assistant/frontend commit the base palette is captured from.
const FRONTEND_REF = "20f70cde7ae0ac05ad6f95e3806e7ebfeec4e47a";
const FRONTEND_RAW = `https://raw.githubusercontent.com/home-assistant/frontend/${FRONTEND_REF}/src/resources/theme`;

// [file, export name, bucket]. Light buckets are concatenated in the same
// order as the frontend's themeStyles; dark buckets in the order
// applyThemesOnElement merges them ({...darkSemanticVariables, ...darkColorVariables}).
const BASE_SOURCES = [
  ["core.globals.ts", "coreStyles", "light"],
  ["main.globals.ts", "mainStyles", "light"],
  ["typography.globals.ts", "typographyStyles", "light"],
  ["semantic.globals.ts", "semanticStyles", "light"],
  ["color/core.globals.ts", "coreColorStyles", "light"],
  ["color/semantic.globals.ts", "semanticColorStyles", "light"],
  ["color/color.globals.ts", "colorStyles", "light"],
  ["color/wa.globals.ts", "waColorStyles", "light"],
  ["wa.globals.ts", "waMainStyles", "light"],
  ["semantic.globals.ts", "darkSemanticStyles", "dark"],
  ["color/color.globals.ts", "darkColorStyles", "dark"],
  ["color/semantic.globals.ts", "darkSemanticColorStyles", "dark"],
];

// Popular community themes (all installed on the dev instance). Material
// You, Liquid Glass and visionos declare both modes; noctis,
// Catppuccin Mocha, Frosted Glass Dark and the iOS dark theme are dark-only,
// Catppuccin Latte, Frosted Glass Light and the iOS light theme light-only
// (HA forces the single mode); the Caule family is flat (no modes, one
// theme per look). "Caule Black *" is the deliberately harsh case
// (secondary-text-color: var(--disabled-color) on a #0c0c0c page).
const DEFAULT_THEMES = [
  "Caule Black Purple",
  "Caule Dark Purple",
  "Caule Light Purple",
  "noctis",
  "ios-dark-mode-blue-red",
  "ios-light-mode-blue-red",
  "Catppuccin Mocha",
  "Catppuccin Latte",
  "Material You",
  "Frosted Glass Dark",
  "Frosted Glass Light",
  "Liquid Glass",
  "visionos",
];

function parseArgs(argv) {
  const args = { themes: null, list: false, frontendRef: FRONTEND_REF };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") args.list = true;
    else if (arg === "--themes") args.themes = String(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--frontend-ref") args.frontendRef = String(argv[++i] ?? "").trim();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

// Same split the frontend's derived-css-vars helper uses, except the value is
// everything after the first ":" (HA's helper would truncate values with a
// colon; none exist today but be safe).
function extractCssVars(cssText) {
  const vars = {};
  for (const rawLine of cssText.split(";")) {
    const line = rawLine.substring(rawLine.indexOf("--")).trim();
    if (!line.startsWith("--")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(2, colon).replaceAll("}", "").trim();
    const value = line.slice(colon + 1).replaceAll("}", "").trim();
    if (name && value) vars[name] = value;
  }
  return vars;
}

function extractCssExport(source, exportName, file) {
  const marker = `export const ${exportName} = css\``;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`${file}: export ${exportName} not found`);
  const bodyStart = start + marker.length;
  const end = source.indexOf("`;", bodyStart);
  if (end === -1) throw new Error(`${file}: unterminated css template for ${exportName}`);
  return source.slice(bodyStart, end);
}

async function fetchBasePalette(frontendRef) {
  const cache = new Map();
  const light = {};
  const dark = {};
  for (const [file, exportName, bucket] of BASE_SOURCES) {
    if (!cache.has(file)) {
      const url = `${FRONTEND_RAW.replace(FRONTEND_REF, frontendRef)}/${file}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
      cache.set(file, await res.text());
    }
    const vars = extractCssVars(extractCssExport(cache.get(file), exportName, file));
    Object.assign(bucket === "light" ? light : dark, vars);
  }
  return { light, dark };
}

async function loadInstanceConfig() {
  const configPath = join(ROOT, "scripts", ".ha-config.json");
  const tokenPath = join(ROOT, "scripts", ".ha-token");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const token = (await readFile(tokenPath, "utf8")).trim();
  if (!config.base_url || !token) {
    throw new Error("scripts/.ha-config.json (base_url) and scripts/.ha-token are required");
  }
  return { baseUrl: String(config.base_url).replace(/\/+$/, ""), token };
}

async function fetchInstanceThemes({ baseUrl, token }) {
  const wsUrl = `${baseUrl.replace(/^http/, "ws")}/api/websocket`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    return await page.evaluate(async ({ url, accessToken }) => {
      const socket = new WebSocket(url);
      const next = () => new Promise((resolveMsg, rejectMsg) => {
        socket.onmessage = (ev) => resolveMsg(JSON.parse(ev.data));
        socket.onerror = () => rejectMsg(new Error("websocket error"));
        socket.onclose = (ev) => rejectMsg(new Error(`websocket closed (${ev.code})`));
      });
      await new Promise((resolveOpen, rejectOpen) => {
        socket.onopen = resolveOpen;
        socket.onerror = () => rejectOpen(new Error(`cannot open ${url}`));
      });
      let msg = await next();
      if (msg.type !== "auth_required") throw new Error(`unexpected ${msg.type}`);
      socket.send(JSON.stringify({ type: "auth", access_token: accessToken }));
      msg = await next();
      if (msg.type !== "auth_ok") throw new Error(`auth failed: ${msg.message ?? msg.type}`);
      socket.send(JSON.stringify({ id: 1, type: "frontend/get_themes" }));
      msg = await next();
      socket.close();
      if (!msg.success) throw new Error(`get_themes failed: ${JSON.stringify(msg.error)}`);
      return msg.result;
    }, { url: wsUrl, accessToken: token });
  } finally {
    await browser.close();
  }
}

function sortObject(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

function renderFixture({ frontendRef, generatedAt, base, themes, instanceHost }) {
  const payload = {
    generatedAt,
    frontendRef,
    themeSource: `frontend/get_themes on ${instanceHost}`,
    base,
    themes,
  };
  return `// GENERATED by scripts/fetch-ha-themes.mjs — do not edit by hand.
// Home Assistant base palette from home-assistant/frontend@${frontendRef.slice(0, 12)}
// (src/resources/theme/*.globals.ts, custom properties only) plus community
// theme variable maps captured via frontend/get_themes on ${generatedAt}.
// Theme maps are the authors' work under their own licenses; vendored here
// as test fixtures only.
window.HA_THEME_FIXTURE = ${JSON.stringify(payload, null, 2)};
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const instance = await loadInstanceConfig();
  const instanceHost = new URL(instance.baseUrl).host;

  process.stdout.write(`Fetching themes from ${instanceHost}…\n`);
  const result = await fetchInstanceThemes(instance);
  const installed = result.themes ?? {};
  if (args.list) {
    for (const name of Object.keys(installed).sort((a, b) => a.localeCompare(b))) {
      const theme = installed[name];
      const kind = theme.modes ? "modes" : "flat";
      process.stdout.write(`  ${name}  (${kind}, ${Object.keys(theme).length} keys)\n`);
    }
    return;
  }

  const wanted = args.themes ?? DEFAULT_THEMES;
  const missing = wanted.filter((name) => !installed[name]);
  if (missing.length) {
    throw new Error(`Themes not installed on ${instanceHost}: ${missing.join(", ")} (use --list)`);
  }

  process.stdout.write(`Fetching base palette from home-assistant/frontend@${args.frontendRef.slice(0, 12)}…\n`);
  const base = await fetchBasePalette(args.frontendRef);

  const themes = {};
  for (const name of wanted) {
    const { modes, ...vars } = installed[name];
    // Keep only the modes the theme really declares: HA forces darkMode to
    // the single declared mode (themes-mixin), so a dark-only theme must
    // never be offered as light.
    const declaredModes = modes
      ? Object.fromEntries(["light", "dark"].filter((mode) => mode in modes).map((mode) => [mode, sortObject(modes[mode] ?? {})]))
      : null;
    themes[name] = {
      vars: sortObject(vars),
      ...(declaredModes && Object.keys(declaredModes).length ? { modes: declaredModes } : {}),
    };
  }

  const generatedAt = new Date().toISOString().slice(0, 10);
  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, renderFixture({
    frontendRef: args.frontendRef,
    generatedAt,
    base,
    themes,
    instanceHost,
  }), "utf8");
  process.stdout.write(
    `Wrote ${OUTPUT}\n  base: ${Object.keys(base.light).length} light vars, ${Object.keys(base.dark).length} dark vars\n  themes: ${wanted.join(", ")}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`${err?.stack || err}\n`);
  process.exit(1);
});
