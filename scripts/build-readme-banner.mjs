// Renders the README header banner to docs/images/readme-banner.png.
//
// Usage: node ./scripts/build-readme-banner.mjs
//
// The banner is laid out as HTML/CSS and screenshotted with Playwright's
// Chromium above 1x, so it stays crisp on high-DPI displays while keeping the
// file small enough for a README hero. Panel artwork is embedded from the real
// UI screenshots already stored in the repo.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/images/readme-banner.png');

const WIDTH = 1280;
const HEIGHT = 440;
const SCALE = 1.5;

const TEAL = '#21b394';
const GREEN = '#79c143';

function dataUri(relPath) {
  const bytes = readFileSync(resolve(ROOT, relPath));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

const art = {
  logo: dataUri('custom_components/sofabaton_x1s/logo.png'),
  events: dataUri('docs/images/automation-events.png'),
  hub: dataUri('docs/images/control-panel-hub-tab.png'),
  wifi: dataUri('docs/images/wifi-commands-command-grid.png'),
  remote: dataUri(
    'tests/playwright/remote-card.spec.js-snapshots/remote-card-active-win32.png',
  ),
};

// Fan of UI panels, back to front. Artwork is always laid in at full panel
// width so nothing is zoom-cropped; a tall screenshot simply shows its top.
// `dim` pushes the back panels into the background.
const panels = [
  { img: art.events, left: 618, top: 96, w: 228, h: 316, rot: -9, dim: 0.86 },
  { img: art.hub, left: 748, top: 54, w: 244, h: 293, rot: -4, dim: 0.93 },
  { img: art.wifi, left: 894, top: 98, w: 234, h: 324, rot: 4, dim: 0.98 },
  { img: art.remote, left: 1058, top: 58, w: 190, h: 296, rot: 9, dim: 1 },
];

const chips = [
  'Local hub control',
  'Live hub editing',
  'Backup &amp; restore',
  'Wifi Commands',
  'Events &amp; Actions',
  'Official-app proxy',
];

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    font-family: 'Segoe UI', Inter, system-ui, -apple-system, 'Helvetica Neue', sans-serif;
    background: #050f14;
    overflow: hidden;
  }

  .banner {
    position: relative;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background:
      radial-gradient(1100px 620px at 74% 18%, rgba(33, 179, 148, 0.30), transparent 62%),
      radial-gradient(700px 520px at 4% 92%, rgba(121, 193, 67, 0.16), transparent 66%),
      linear-gradient(140deg, #071820 0%, #06121a 46%, #050d12 100%);
  }

  /* faint grid, keeps the flat gradient from looking empty */
  .grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(900px 460px at 22% 40%, #000 0%, transparent 78%);
  }

  .vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(120% 100% at 50% 45%, transparent 40%, rgba(0, 0, 0, 0.55) 100%);
  }

  .content {
    position: absolute;
    left: 62px;
    top: 0;
    height: 100%;
    width: 560px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 20px;
    z-index: 5;
  }

  .brand { display: flex; align-items: center; gap: 20px; }
  .brand img {
    width: 78px;
    height: 78px;
    filter: drop-shadow(0 8px 22px rgba(33, 179, 148, 0.45));
  }
  .name {
    font-size: 44px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: #ffffff;
    line-height: 1.05;
  }
  .for {
    margin-top: 4px;
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.2px;
    background: linear-gradient(90deg, ${TEAL}, ${GREEN});
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .tagline {
    font-size: 17px;
    line-height: 1.55;
    color: #9db4bd;
    max-width: 470px;
  }
  .tagline b { color: #dceaef; font-weight: 600; }

  .chips { display: flex; flex-wrap: wrap; gap: 8px; max-width: 500px; }
  .chip {
    font-size: 12.5px;
    font-weight: 500;
    letter-spacing: 0.2px;
    color: #cfeae3;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(33, 179, 148, 0.36);
    background: rgba(33, 179, 148, 0.10);
    white-space: nowrap;
  }

  /* soft light behind the fan so the panels lift off the background */
  .fan-glow {
    position: absolute;
    left: 560px;
    top: -80px;
    width: 820px;
    height: 600px;
    background: radial-gradient(closest-side, rgba(33, 179, 148, 0.34), transparent 100%);
  }

  .panel {
    position: absolute;
    border-radius: 13px;
    overflow: hidden;
    background: #ffffff center top / 100% auto no-repeat;
    box-shadow:
      0 26px 54px rgba(0, 0, 0, 0.55),
      0 4px 12px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.10);
  }
  .panel::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 52%, rgba(5, 15, 20, 0.62) 100%);
  }

  .accent {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
    background: linear-gradient(90deg, ${TEAL} 0%, ${GREEN} 52%, rgba(121, 193, 67, 0) 100%);
  }
</style>
<div class="banner">
  <div class="grid"></div>
  <div class="fan-glow"></div>
${panels
  .map(
    (p) => `  <div class="panel" style="
    left: ${p.left}px; top: ${p.top}px; width: ${p.w}px; height: ${p.h}px;
    transform: rotate(${p.rot}deg);
    background-image: url('${p.img}');
    filter: brightness(${p.dim}) contrast(${2 - p.dim});
  "></div>`,
  )
  .join('\n')}
  <div class="vignette"></div>
  <div class="content">
    <div class="brand">
      <img src="${art.logo}" alt="">
      <div>
        <div class="name">Sofabaton X</div>
        <div class="for">for Home Assistant</div>
      </div>
    </div>
    <div class="tagline">
      Local, bidirectional control of Sofabaton <b>X1</b>, <b>X1S</b> and <b>X2</b> hubs.
      Drive the hub, edit its configuration live, and keep the official app working.
    </div>
    <div class="chips">
${chips.map((c) => `      <div class="chip">${c}</div>`).join('\n')}
    </div>
  </div>
  <div class="accent"></div>
</div>
`;

const debugHtml = process.argv.includes('--emit-html');
if (debugHtml) {
  writeFileSync(resolve(ROOT, 'docs/images/readme-banner.debug.html'), html);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
});
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();

console.log(`wrote ${OUT} (${WIDTH * SCALE}x${HEIGHT * SCALE})`);
