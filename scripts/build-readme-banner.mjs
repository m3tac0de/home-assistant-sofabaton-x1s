// Renders the README header banner to docs/images/readme-banner.png.
//
// Usage: node ./scripts/build-readme-banner.mjs [--out=NAME] [--emit-html]
//
// The banner carries no copy of its own - the README heading and text below it
// tell the story. All it does is show the logo and a fanned gallery of the real
// integration UI. It is laid out as HTML/CSS and screenshotted with Playwright's
// Chromium above 1x, so it stays crisp on high-DPI displays while keeping the
// file small enough for a README hero. Panel artwork is embedded from the UI
// screenshots already stored in the repo, plus the themed remote card written by
// build-readme-remote-shot.mjs (npm run build:readme-banner runs both).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WIDTH = 1280;
const HEIGHT = 420;
const SCALE = 1.5;

const TEAL = '#21b394';
const GREEN = '#79c143';

const argv = process.argv.slice(2);
const arg = (name, fallback) =>
  argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;

const outName = arg('out', 'readme-banner');
const OUT = resolve(ROOT, `docs/images/${outName}.png`);

function dataUri(relPath) {
  const bytes = readFileSync(resolve(ROOT, relPath));
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

const logo = dataUri('custom_components/sofabaton_x1s/logo.png');

// The gallery, back to front: backups, the Activity list, hub and Activity
// Events, the Wifi Commands grid, and the remote card with its favorites open.
// The fan opens to the right, so each panel overlaps the one before it and the
// last one bleeds off the edge. Every panel is a different screen - two views of
// the same one read as a duplicate at this size.
//
// `dim` only pushes the back panels back a little - the screenshots are the
// point, so they stay bright and sharp.
const panels = [
  { src: 'docs/images/control-panel-backup-tab.png', left: 300, top: 76, w: 216, h: 259, rot: -11, dim: 0.86 },
  { src: 'docs/images/control-panel-hub-tab.png', left: 468, top: 46, w: 230, h: 276, rot: -6, dim: 0.92 },
  { src: 'docs/images/automation-events.png', left: 652, top: 60, w: 226, h: 317, rot: -1, dim: 0.96 },
  { src: 'docs/images/wifi-commands-command-grid.png', left: 848, top: 76, w: 228, h: 320, rot: 4, dim: 1 },
  // The remote card is far taller than the banner, so it is laid in at its full
  // height and runs off the bottom and right edges. Sizing it to fit would put a
  // hard edge mid-card and read as though the remote simply stops there.
  // Rendered by build-readme-remote-shot.mjs, not a Playwright baseline.
  { src: 'docs/images/banner-remote-card.png', left: 1064, top: 22, w: 208, h: 605, rot: 7, dim: 1 },
].map((p) => ({ ...p, img: dataUri(p.src), bleeds: p.top + p.h > HEIGHT }));

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${WIDTH}px; height: ${HEIGHT}px; }
  body {
    font-family: 'Segoe UI', Inter, system-ui, -apple-system, sans-serif;
    background: #050f14;
    overflow: hidden;
  }

  .banner {
    position: relative;
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    overflow: hidden;
    background:
      radial-gradient(1200px 640px at 50% 8%, rgba(33, 179, 148, 0.30), transparent 64%),
      radial-gradient(700px 480px at 6% 96%, rgba(121, 193, 67, 0.10), transparent 68%),
      linear-gradient(150deg, #07191f 0%, #06121a 48%, #050d12 100%);
  }

  /* faint grid, keeps the flat gradient from looking empty */
  .grid {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: radial-gradient(760px 420px at 50% 24%, #000 0%, transparent 80%);
  }

  /* soft light behind the fan so the panels lift off the background */
  .fan-glow {
    position: absolute;
    left: 400px;
    top: -150px;
    width: 1080px;
    height: 700px;
    background: radial-gradient(closest-side, rgba(33, 179, 148, 0.30), transparent 100%);
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
  /* Only panels that end inside the frame get a bottom fade. A panel that runs
     off the edge must stay clean, or the fade reads as the card ending. */
  .panel.seated::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, transparent 78%, rgba(5, 15, 20, 0.55) 100%);
  }

  /* corners only - enough to seat the bleed without fogging the screenshots */
  .edges {
    position: absolute;
    inset: 0;
    z-index: 20;
    background: radial-gradient(150% 120% at 50% 40%, transparent 62%, rgba(0, 0, 0, 0.55) 100%);
  }

  .mark {
    position: absolute;
    z-index: 30;
    left: 84px;
    top: 50%;
    width: 148px;
    height: 148px;
    margin-top: -78px;
  }
  .mark::before {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    width: 420px;
    height: 420px;
    margin: -210px 0 0 -210px;
    background: radial-gradient(closest-side, rgba(33, 179, 148, 0.22), transparent 100%);
  }
  .mark img {
    position: relative;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 12px 30px rgba(0, 0, 0, 0.55));
  }

  .accent {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 4px;
    z-index: 40;
    background: linear-gradient(90deg, ${TEAL} 0%, ${GREEN} 52%, rgba(121, 193, 67, 0) 100%);
  }
</style>
<div class="banner">
  <div class="grid"></div>
  <div class="fan-glow"></div>
${panels
  .map(
    (p) => `  <div class="panel${p.bleeds ? '' : ' seated'}" style="
    left: ${p.left}px; top: ${p.top}px; width: ${p.w}px; height: ${p.h}px;
    transform: rotate(${p.rot}deg);
    background-image: url('${p.img}');
    filter: brightness(${p.dim}) contrast(${(2 - p.dim).toFixed(3)});
  "></div>`,
  )
  .join('\n')}
  <div class="edges"></div>
  <div class="mark"><img src="${logo}" alt=""></div>
  <div class="accent"></div>
</div>
`;

if (argv.includes('--emit-html')) {
  writeFileSync(resolve(ROOT, `docs/images/${outName}.debug.html`), html);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
});
await page.setContent(html, { waitUntil: 'load' });
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();

console.log(`wrote ${OUT} (${WIDTH * SCALE}x${HEIGHT * SCALE}, scale=${SCALE}x)`);
