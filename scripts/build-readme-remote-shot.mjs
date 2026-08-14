// Renders the Virtual Remote card for the README banner to
// docs/images/banner-remote-card.png.
//
// Usage: node ./scripts/build-readme-remote-shot.mjs
//
// The banner needs a remote card that is worth looking at: the Playwright
// baselines are deliberately plain, so this mounts the real card bundle in the
// existing Playwright harness under a vivid theme and a layout that brings the
// colour keys up near the top, where the banner crop can actually see them.
//
// Requires the built card at custom_components/sofabaton_x1s/www/remote-card.js
// (npm run build:remote-card).

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/images/banner-remote-card.png');

const PORT = 4173;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const HARNESS = `${ORIGIN}/tests/playwright/fixtures/remote-card-harness.html`;

// A dark, saturated theme. The control panel screenshots in the banner are all
// light, so this makes the remote the focal point instead of one more white
// rectangle, and it shows off that the card follows the Home Assistant theme.
// Keys are unprefixed, the way Home Assistant theme YAML declares them. The card
// resolves its own background from the unprefixed names, so a theme written with
// "--" prefixes applies its colours but keeps the default card background.
const THEME_NAME = 'Banner Vivid';
const THEME = {
  'primary-color': '#2fd0ab',
  'rgb-primary-color': '47, 208, 171',
  'primary-text-color': '#eaf3f7',
  'rgb-primary-text-color': '234, 243, 247',
  'secondary-text-color': '#93aebd',
  'disabled-text-color': '#5c7385',
  'divider-color': '#2b4152',
  'ha-card-background': '#131e29',
  'card-background-color': '#131e29',
  'primary-background-color': '#0d1720',
  'secondary-background-color': '#1a2836',
  'input-fill-color': '#1a2836',
  'ha-card-border-radius': '20px',
  'success-color': '#7ed957',
  'error-color': '#ff6b6b',
  'warning-color': '#ffc247',
  'info-color': '#4cc2ff',
};

const CARD_BG = THEME['ha-card-background'];

// Default order buries the colour keys below the media group, far past anything
// the banner crop shows. This is a supported layout, just a more photogenic one.
const CONFIG = {
  theme: THEME_NAME,
  max_width: 460,
  group_order: ['activity', 'macro_favorites', 'dpad', 'colors', 'nav', 'mid', 'media', 'abc'],
};

async function serverIsUp() {
  try {
    const res = await fetch(HARNESS, { method: 'HEAD' });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await serverIsUp()) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

let child = null;
if (!(await serverIsUp())) {
  child = spawn(process.execPath, [resolve(ROOT, 'scripts/serve-playwright-fixtures.mjs')], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  if (!(await waitForServer())) {
    child.kill();
    throw new Error(`fixture server did not come up on ${ORIGIN}`);
  }
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 520, height: 1700 },
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });

  await page.goto(HARNESS);
  await page.evaluate(
    async ({ config }) => {
      await window.__remoteCardHarness.mountCard({ scenario: 'active', config });
    },
    { config: CONFIG },
  );

  // The harness builds its own hass, so the theme has to be injected after the
  // mount and the card nudged to re-apply it.
  await page.evaluate(
    ({ name, theme, bg }) => {
      const card = document.querySelector('sofabaton-virtual-remote');
      card.hass.themes.themes[name] = theme;
      card.hass = { ...card.hass };

      // The harness page declares light-mode values on :root, and the stubbed
      // ha-select and hui-button-card inherit from there. Home Assistant applies
      // an active theme document-wide, so do the same or those parts of the card
      // stay light while everything else goes dark.
      for (const [key, value] of Object.entries(theme)) {
        document.documentElement.style.setProperty(`--${key}`, value);
      }
      document.documentElement.style.colorScheme = 'dark';
      // Matches the card so its rounded corners blend instead of cutting
      // against the harness page.
      document.body.style.background = bg;

      // The stubbed ha-select hardcodes light-mode greys for its trigger, where
      // the real Home Assistant ha-select follows the theme. Override the stub so
      // the Activity picker matches the rest of the themed card.
      const cardRoot = card.shadowRoot || card;
      const select = cardRoot.querySelector('ha-select');
      if (select?.shadowRoot) {
        const style = document.createElement('style');
        style.textContent = `
          .trigger { background: var(--input-fill-color) !important; box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.35) !important; }
          .value { color: var(--primary-text-color) !important; }
          .label { color: var(--secondary-text-color) !important; }
          .caret { color: var(--secondary-text-color) !important; }
        `;
        select.shadowRoot.appendChild(style);
      }
    },
    { name: THEME_NAME, theme: THEME, bg: CARD_BG },
  );

  const card = page.locator('sofabaton-virtual-remote');
  await card.waitFor();
  await page.waitForTimeout(300);
  await card.screenshot({ path: OUT });

  const box = await card.boundingBox();
  console.log(`wrote ${OUT} (card ${Math.round(box.width)}x${Math.round(box.height)} css px @2x)`);
} finally {
  await browser.close();
  child?.kill();
}
