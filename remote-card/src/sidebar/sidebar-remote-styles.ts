// Styles for the sidebar remote (docs/internal/sidebar-remote-plan.md).
//
// Every colour is a color-mix over Home Assistant's theme variables; the
// three measured facts (--sb-on-primary, --sb-halo, data-glass) come from
// sidebar-remote-theme.ts. Corner radii are the remote's own, never the
// theme's. The layout is the prototype's: fixed compact rows, the wheel
// is the only flexible element, three equal breathing spaces.

import { css } from "lit";

export const sidebarRemoteStyles = css`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    color: var(--primary-text-color);
    font-family: var(--ha-font-family-body, Roboto, "Segoe UI", system-ui, sans-serif);
    -webkit-font-smoothing: antialiased;
    /* derived tokens */
    --sb-card: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
    --sb-ground: var(--primary-background-color);
    --sb-pill: color-mix(in srgb, var(--primary-text-color) 9%, var(--sb-ground));
    --sb-sheet: color-mix(in srgb, var(--primary-text-color) 3%, var(--primary-background-color));
    --sb-disc-a: color-mix(in srgb, var(--primary-text-color) 5%, var(--sb-ground));
    --sb-disc-b: color-mix(in srgb, var(--primary-text-color) 15%, var(--sb-ground));
    --sb-muted: color-mix(in srgb, var(--secondary-text-color) 30%, var(--primary-text-color));
    --sb-accent-text: color-mix(in srgb, var(--primary-color) 45%, var(--primary-text-color));
    /* hover / press surfaces, the card's recipe: a text-colour tint over the resting surface */
    --sb-hover: color-mix(in srgb, var(--primary-text-color) 10%, transparent);
    --sb-press: color-mix(in srgb, var(--primary-text-color) 18%, transparent);
    --sb-on-primary: #fff;
    --sb-halo: rgba(255, 255, 255, 0.75);
    --sb-ok-dot: #7f9a72;
    --sb-err: #c0504d;
    --sb-gap: clamp(8px, 1.5vh, 26px);
    --sb-pad: clamp(20px, 3vmin, 24px);
    --sb-row-h: clamp(42px, 6vh, 72px);
    --sb-ico: clamp(18px, 3.4vmin, 30px);
  }
  :host([data-glass]) {
    --sb-ground: var(--sb-card);
  }
  *, *::before, *::after { box-sizing: border-box; }
  button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    cursor: pointer;
  }
  .sheet button, .segs button, .filter { touch-action: manipulation; }
  button:focus-visible { outline: 2px solid color-mix(in srgb, var(--primary-color) 55%, transparent); outline-offset: 2px; }
  ha-icon { display: inline-flex; --mdc-icon-size: var(--sb-ico); }
  .app {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* No background of its own: the panel host paints the dashboard ground
       (wallpaper themes carry a fixed-attachment image, and painting that
       twice doubles the repaint cost of every resize frame). */
  }

  /* ---------- the remote column ---------- */
  .remote {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sb-gap);
    padding: var(--sb-pad) var(--sb-pad) 0;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    position: relative;
    isolation: isolate;
  }
  .remote > * { min-width: 0; min-height: 0; flex: 0 0 auto; }
  .remote > .wheel-area { flex: 1000 1 0; max-height: calc((min(100vw, 560px) - 2 * var(--sb-pad)) * 0.76); }
  .remote > .sp { flex: 1 1 0; margin-top: calc(-1 * var(--sb-gap)); }
  .remote > .sp:last-child { margin-top: 0; }

  /* ---------- activity line ---------- */
  .activity { display: flex; align-items: center; gap: 12px; height: var(--sb-row-h); position: relative; }
  .activity .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: start; }
  .activity .eyebrow { font-size: 11px; letter-spacing: 0.12em; color: var(--sb-accent-text); text-transform: uppercase; }
  .activity .name { display: flex; align-items: center; gap: 4px; font-size: clamp(18px, 2.8vmin, 26px); }
  .activity .name span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .activity .name ha-icon { --mdc-icon-size: 22px; opacity: 0.7; flex: 0 0 auto; }
  .round {
    width: calc(var(--sb-row-h) * 0.85);
    height: calc(var(--sb-row-h) * 0.85);
    border-radius: 50%;
    background: var(--sb-pill);
    display: grid;
    place-items: center;
    color: var(--primary-color);
    flex: 0 0 auto;
    transition: transform 90ms ease, filter 90ms ease;
  }
  .round.power { color: var(--primary-text-color); position: relative; }
  .round.power ha-icon { opacity: 0.8; }
  .round.pressed { transform: scale(0.92); }
  .power::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    opacity: 0;
    border: 2px solid color-mix(in srgb, var(--primary-color) 22%, transparent);
    border-top-color: var(--primary-color);
    transition: opacity 0.15s;
  }
  .power.busy { pointer-events: none; }
  .power.busy::after { opacity: 1; animation: spin 0.9s linear infinite; }
  .power.busy ha-icon { opacity: 0.4; }
  .activity .spin {
    display: none;
    width: 18px; height: 18px; border-radius: 50%; flex: 0 0 auto;
    border: 2px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
    border-top-color: var(--primary-color);
    animation: spin 0.8s linear infinite;
  }
  .app.busy .activity .spin { display: block; }
  .app.busy .activity .name ha-icon { display: none; }
  .activity .bar {
    position: absolute; left: 0; right: 0; bottom: -6px; height: 2px; border-radius: 1px; overflow: hidden; opacity: 0;
    background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    transition: opacity 0.2s;
  }
  .activity .bar::after {
    content: ""; position: absolute; top: 0; bottom: 0; width: 35%; border-radius: 1px; background: var(--primary-color);
    animation: slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .app.busy .activity .bar { opacity: 1; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slide { from { left: -35%; } to { left: 100%; } }

  /* inert: everything below the activity line veils and stops responding */
  .remote > *, .pull { transition: opacity 0.25s ease; }
  .app.inert .remote > :not(.activity) { opacity: 0.4; pointer-events: none; }
  .app.inert .activity .power { pointer-events: none; }
  /* "pick" = nothing to send to yet (device mode without a device, or
     powered off): the keys are inert but the selector stays live; in device
     mode the pull handle too (it opens the device list) */
  .app.inert:not(.pick) .pull, .app.inert.powered-off .pull { opacity: 0.4; pointer-events: none; }

  /* ---------- the wheel ---------- */
  .wheel-area { container-type: size; display: grid; place-items: center; perspective: 700px; }
  .wheel-wrap { position: relative; width: min(76cqw, 100cqh); aspect-ratio: 1; }
  .wheel { position: absolute; inset: 0; transition: transform 110ms ease; transform-style: preserve-3d; }
  .face { position: absolute; inset: 0; transition: opacity 240ms ease, transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1), visibility 0s linear 240ms; }
  .disc {
    position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(circle at 50% 42%, var(--sb-disc-a) 0%, var(--sb-disc-b) 100%);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.35);
    transition: box-shadow 110ms ease;
  }
  .disc::before {
    content: ""; position: absolute; inset: 0; border-radius: 50%; opacity: 0; transition: opacity 110ms ease;
    background: linear-gradient(var(--tilt-angle, 0deg), rgba(0, 0, 0, 0.07), transparent 45%, transparent 60%, rgba(255, 255, 255, 0.18));
  }
  .wheel[data-tilt] .disc { box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.35); }
  .wheel[data-tilt] .disc::before { opacity: 1; }
  .wheel[data-tilt="up"] { transform: rotateX(13deg); }
  .wheel[data-tilt="down"] { transform: rotateX(-13deg); }
  .wheel[data-tilt="left"] { transform: rotateY(-13deg); }
  .wheel[data-tilt="right"] { transform: rotateY(13deg); }
  .wheel[data-tilt="up"] .disc::before { --tilt-angle: 180deg; }
  .wheel[data-tilt="down"] .disc::before { --tilt-angle: 0deg; }
  .wheel[data-tilt="left"] .disc::before { --tilt-angle: 90deg; }
  .wheel[data-tilt="right"] .disc::before { --tilt-angle: 270deg; }
  .dirs { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; }
  .dir { position: absolute; inset: 0; display: block; color: var(--primary-text-color); border-radius: 0; }
  .dir.up { clip-path: polygon(0 0, 100% 0, 50% 50%); }
  .dir.down { clip-path: polygon(0 100%, 100% 100%, 50% 50%); }
  .dir.left { clip-path: polygon(0 0, 0 100%, 50% 50%); }
  .dir.right { clip-path: polygon(100% 0, 100% 100%, 50% 50%); }
  .dir ha-icon { position: absolute; --mdc-icon-size: clamp(22px, 11cqmin, 40px); opacity: 0.8; }
  .dir.up ha-icon { left: 50%; top: 9%; translate: -50% 0; }
  .dir.down ha-icon { left: 50%; bottom: 9%; translate: -50% 0; }
  .dir.left ha-icon { top: 50%; left: 9%; translate: 0 -50%; }
  .dir.right ha-icon { top: 50%; right: 9%; translate: 0 -50%; }
  .ok { z-index: 1; }
  .ok {
    position: absolute; left: 32%; top: 32%; width: 36%; height: 36%; border-radius: 50%;
    background: var(--primary-color); color: var(--sb-on-primary); display: grid; place-items: center;
    font-size: clamp(14px, 7.5cqmin, 36px); letter-spacing: 0.06em; font-weight: 500;
    box-shadow: 0 4px 14px color-mix(in srgb, var(--primary-color) 35%, transparent);
    transition: transform 90ms ease, filter 90ms ease;
  }
  .numpad { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(4, 1fr); gap: 4%; padding: 2%; }
  .numpad button {
    border-radius: 24%; background: var(--sb-pill); display: grid; place-items: center;
    font-size: clamp(16px, 7cqmin, 26px); font-weight: 500; transition: transform 90ms ease, filter 90ms ease;
  }
  .face-wheel { opacity: 1; transform: scale(1); visibility: visible; transition-delay: 0s; }
  .wheel.flipped .face-wheel { opacity: 0; transform: scale(0.88); pointer-events: none; visibility: hidden; transition-delay: 0s, 0s, 240ms; }
  .face-pad { opacity: 0; transform: scale(1.06); pointer-events: none; visibility: hidden; }
  .wheel.flipped .face-pad { opacity: 1; transform: none; pointer-events: auto; visibility: visible; transition-delay: 0s; }
  .face-pad button { opacity: 0; transform: translateY(8px); transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1); }
  .wheel.flipped .face-pad button { opacity: 1; transform: none; transition-delay: calc(var(--i) * 16ms + 60ms); }
  .wheel.flipped .face-pad button.off { opacity: 0.28; }
  .wheel.flipped .face-pad button.pressed { transform: scale(0.94); transition-delay: 0s; }
  .numtoggle {
    position: absolute; right: -2px; bottom: -2px; width: 36px; height: 36px; border-radius: 50%;
    background: var(--sb-pill); color: var(--primary-color); display: grid; place-items: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    transition: transform 90ms ease, filter 90ms ease, box-shadow 90ms ease, opacity 220ms ease 140ms, visibility 0s linear 0s;
  }
  .numtoggle ha-icon { --mdc-icon-size: 20px; }
  .numtoggle.pressed { transform: scale(0.9); box-shadow: none; }
  /* The six satellites (toggle, DVR, EXIT, A, B, C) fade with the wheel face as the
     number pad opens and fade back in once it closes. Hidden, not displayed away,
     so the fade can run both ways; visibility keeps them out of the tab order. */
  .wheel-wrap.flipped .numtoggle, .wheel-wrap.flipped .orbit {
    opacity: 0; pointer-events: none; visibility: hidden;
    transition: transform 90ms ease, opacity 160ms ease, visibility 0s linear 160ms;
  }
  /* DVR, EXIT and A/B/C (X2): small round keys on the same circle as the pad toggle (its centre is
     (50% - 16px) * sqrt2 from the wheel's centre, at 45 deg). DVR and EXIT step counter-clockwise
     from the toggle on the right (45, 20, -5 deg); A, B, C mirror EXIT, DVR and the toggle
     across the vertical axis (185, 160, 135 deg), so the two sides are exact reflections */
  .orbit {
    position: absolute; width: 36px; height: 36px; border-radius: 50%; background: var(--sb-pill);
    color: var(--primary-text-color); display: grid; place-items: center; font-size: 9px; font-weight: 600; letter-spacing: 0.04em;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    transition: transform 90ms ease, background 90ms ease, opacity 220ms ease 140ms, visibility 0s linear 0s;
    --sb-orbit-r: calc((50% - 16px) * 1.4142);
  }
  .orbit.dvr { left: calc(50% + var(--sb-orbit-r) * 0.94 - 18px); top: calc(50% + var(--sb-orbit-r) * 0.342 - 18px); }
  .orbit.exit { left: calc(50% + var(--sb-orbit-r) * 0.996 - 18px); top: calc(50% - var(--sb-orbit-r) * 0.087 - 18px); }
  .orbit.a { left: calc(50% - var(--sb-orbit-r) * 0.996 - 18px); top: calc(50% - var(--sb-orbit-r) * 0.087 - 18px); }
  .orbit.b { left: calc(50% - var(--sb-orbit-r) * 0.94 - 18px); top: calc(50% + var(--sb-orbit-r) * 0.342 - 18px); }
  .orbit.c { left: calc(50% - var(--sb-orbit-r) * 0.7071 - 18px); top: calc(50% + var(--sb-orbit-r) * 0.7071 - 18px); }
  .orbit.abc { font-size: 12px; }
  .orbit.pressed { transform: scale(0.9); background: color-mix(in srgb, var(--primary-text-color) 18%, var(--sb-pill)); }
  .orbit.off { opacity: 0.35; }

  /* ---------- rows ---------- */
  .bare { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: var(--sb-gap); height: calc(var(--sb-row-h) * 0.75); }
  .seg { display: flex; align-items: center; justify-content: center; color: var(--primary-text-color); font-size: var(--sb-ico); font-weight: 500; position: relative; z-index: 0; height: 100%; transition: transform 90ms ease, filter 90ms ease; }
  .seg ha-icon { opacity: 0.85; }
  .seg.lbl { flex-direction: column; gap: 1px; }
  .seg.lbl ha-icon { --mdc-icon-size: calc(var(--sb-ico) * 0.8); }
  .seg.lbl small { font-size: clamp(10px, 1.5vmin, 13px); letter-spacing: 0.08em; color: var(--sb-muted); }
  .seg.text { font-size: clamp(14px, 2.1vmin, 19px); letter-spacing: 0.06em; }
  /* the CH rocker's centre on an X1/X1S has no guide key: the icon is a label, not a key */
  .seg.deco { cursor: default; }
  .bare > .seg::before {
    content: ""; position: absolute; left: 50%; top: 50%; translate: -50% -50%; z-index: -1; opacity: 0;
    width: min(100%, 92px); height: 100%; border-radius: 999px; background: var(--sb-pill); transition: opacity 90ms ease;
  }
  .bare > .seg.pressed::before { opacity: 1; }
  .media { height: var(--sb-row-h); grid-template-columns: 1fr 1.5fr 1fr; align-items: center; }
  .media > .seg { height: calc(var(--sb-row-h) * 0.75); }
  .media .pill { height: 100%; grid-template-columns: 1fr 1fr; }
  .media .pill.single { grid-template-columns: 1fr; }
  .pill {
    background: var(--sb-pill); border-radius: 999px; height: var(--sb-row-h); display: grid; align-items: stretch;
    position: relative; overflow: hidden; transition: transform 110ms ease; transform-style: preserve-3d;
  }
  .pill::before {
    content: ""; position: absolute; inset: 0; opacity: 0; transition: opacity 110ms ease; pointer-events: none;
    background: linear-gradient(var(--tilt-angle, 90deg), rgba(0, 0, 0, 0.07), transparent 45%);
  }
  .pill[data-tilt="left"] { transform: rotateY(-14deg); }
  .pill[data-tilt="right"] { transform: rotateY(14deg); }
  .pill[data-tilt="left"]::before { opacity: 1; --tilt-angle: 90deg; }
  .pill[data-tilt="right"]::before { opacity: 1; --tilt-angle: 270deg; }
  .pill[data-tilt="center"] { transform: scale(0.96); }
  .pill .seg.pressed, .dir.pressed { transform: none; filter: none; }
  .pill .seg.pressed { background: none; }
  .rockers { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sb-gap); perspective: 700px; }
  .rockers .pill { grid-template-columns: 1fr 1fr 1fr; }
  .colors { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sb-gap); }
  .colors button { height: calc(var(--sb-row-h) * 0.45); border-radius: 999px; transition: transform 90ms ease, filter 90ms ease; }
  .colors .red { background: color-mix(in srgb, #c0504d 85%, var(--sb-pill)); }
  .colors .green { background: color-mix(in srgb, #5f8f64 85%, var(--sb-pill)); }
  .colors .yellow { background: color-mix(in srgb, #c9a23f 85%, var(--sb-pill)); }
  .colors .blue { background: color-mix(in srgb, #5a86b1 85%, var(--sb-pill)); }
  .pressed { transform: scale(0.94); }
  .pill .seg.pressed, .numpad button.pressed { background: var(--sb-press); }
  .round.pressed, .numtoggle.pressed, .tile.pressed, .lrow.pressed, .row.pressed { background: color-mix(in srgb, var(--primary-text-color) 18%, var(--sb-pill)); }
  .pull .knob.pressed { background: color-mix(in srgb, var(--primary-text-color) 18%, var(--sb-pill)); }
  .ok.pressed { background: color-mix(in srgb, #000 14%, var(--primary-color)); }
  .colors button.pressed { outline: 2px solid color-mix(in srgb, var(--primary-text-color) 45%, transparent); outline-offset: 2px; }

  /* long-press marker: a key that holds (fires its binding) instead of repeating carries a small dot under its mark */
  /* ---------- bound / unbound ---------- */
  .off { cursor: default !important; pointer-events: none; }
  .seg.off, .dir.off, .numpad button.off { opacity: 0.28; }
  .bare > .seg.off::before { display: none; }
  .pill.off { opacity: 0.45; }
  .pill.off .seg.off { opacity: 1; }
  .ok.off { background: var(--sb-pill); color: var(--primary-text-color); box-shadow: none; opacity: 0.4; }
  .colors button.off { filter: grayscale(0.7); opacity: 0.3; }

  /* ---------- hover (mouse only) ---------- */
  @media (hover: hover) {
    .numpad button:not(.off):not(.pressed):hover { background: var(--sb-hover); }
    .orbit:not(.off):not(.pressed):hover, .round:not(.pressed):hover, .numtoggle:not(.pressed):hover, .tile:not(.pressed):hover, .lrow:not(.pressed):hover, .row:not(.pressed):hover, .segs .close:hover, .pull .knob:not(.pressed):hover { background: color-mix(in srgb, var(--primary-text-color) 10%, var(--sb-pill)); }
    .row.current:not(.pressed):hover { background: color-mix(in srgb, var(--primary-text-color) 10%, color-mix(in srgb, var(--primary-color) 12%, var(--sb-pill))); }
    .colors button:not(.off):hover { outline: 2px solid color-mix(in srgb, var(--primary-text-color) 30%, transparent); outline-offset: 2px; }
    /* darken, never lighten: the label is white on most primaries and lightening would cost it contrast */
    .ok:not(.off):not(.pressed):hover { background: color-mix(in srgb, #000 8%, var(--primary-color)); }
    .bare > .seg:not(.off):not(.pressed):hover::before { opacity: 0.55; }
    .segs .s:not(.active):hover { color: var(--primary-text-color); background: var(--sb-hover); }
  }

  /* ---------- feedback ---------- */
  .ring {
    position: absolute; border-radius: 50%; border: 2px solid var(--primary-color); pointer-events: none; z-index: 5;
    opacity: 0.55; animation: ring 520ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards; will-change: transform, opacity; isolation: isolate;
  }
  .ring.err { border-color: var(--sb-err); animation-name: ring-err; }
  @keyframes ring { from { transform: scale(0.55); opacity: 0.55; } to { transform: scale(1.9); opacity: 0; } }
  @keyframes ring-err { 0% { transform: scale(0.55); opacity: 0.7; } 30% { transform: scale(1.1); opacity: 0.7; } 100% { transform: scale(1.3); opacity: 0; } }

  /* ---------- pull handle ---------- */
  .pull {
    flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%;
    padding: 6px 0 calc(8px + env(safe-area-inset-bottom)); color: var(--sb-muted);
  }
  .pull .grip { width: 44px; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--primary-text-color) 22%, transparent); }
  .pull .knob { width: 34px; height: 34px; border-radius: 50%; background: var(--sb-pill); display: grid; place-items: center; transition: transform 90ms ease, filter 90ms ease; }
  .pull .knob ha-icon { --mdc-icon-size: 22px; opacity: 0.75; }
  .pull .knob.pressed { transform: scale(0.9); }

  /* ---------- the sheet ---------- */
  .scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.35); opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 6; }
  .sheet {
    position: absolute; left: 0; right: 0; bottom: 0; height: 68%; max-width: 560px; margin: 0 auto; z-index: 7;
    background: var(--sb-sheet); border-radius: 22px 22px 0 0; box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
    transform: translateY(105%); transition: transform 0.25s; display: flex; flex-direction: column;
    color: var(--primary-text-color);
  }
  :host([data-glass]) .sheet {
    background: linear-gradient(var(--sb-card), var(--sb-card)), linear-gradient(var(--sb-card), var(--sb-card));
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px);
  }
  .app.open .scrim { opacity: 1; pointer-events: auto; }
  .app.open .sheet { transform: none; }
  .sheet .grip { width: 36px; height: 4px; border-radius: 2px; background: var(--divider-color); margin: 10px auto 0; flex: 0 0 auto; }
  .segs { display: flex; align-items: center; gap: 10px; padding: 10px 16px 8px; flex: 0 0 auto; }
  .segs .ctl { flex: 1; display: grid; grid-template-columns: repeat(2, 1fr); background: var(--sb-pill); border-radius: 999px; padding: 3px; }
  .segs .s { height: 34px; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; color: var(--sb-muted); }
  .segs .s ha-icon { --mdc-icon-size: 16px; }
  .segs .s.active { background: var(--sb-sheet); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
  .segs .s.active ha-icon { color: var(--sb-accent-text); }
  .segs .close, .phead .close { width: 34px; height: 34px; border-radius: 50%; background: var(--sb-pill); display: grid; place-items: center; flex: 0 0 auto; }
  .segs .close ha-icon, .phead .close ha-icon { --mdc-icon-size: 18px; opacity: 0.7; }
  .phead { display: flex; align-items: center; gap: 10px; padding: 12px 16px 8px; font-size: 17px; flex: 0 0 auto; }
  .phead .eyebrow { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sb-accent-text); display: block; }
  .phead .titles { flex: 1; min-width: 0; }
  .phead .close { margin-left: auto; }
  .filter { margin: 2px 16px 8px; height: 40px; border-radius: 12px; background: var(--sb-pill); display: flex; align-items: center; gap: 8px; padding: 0 12px; flex: 0 0 auto; }
  .filter ha-icon { --mdc-icon-size: 18px; color: var(--sb-muted); }
  .filter input { flex: 1; min-width: 0; background: none; border: 0; font: inherit; font-size: 14px; color: var(--primary-text-color); outline: none; }
  .filter input::placeholder { color: var(--sb-muted); }
  .body { flex: 1; overflow-y: auto; padding: 4px 16px calc(16px + env(safe-area-inset-bottom)); -webkit-overflow-scrolling: touch; }
  .empty { padding: 24px 8px; text-align: center; color: var(--sb-muted); font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .tile {
    display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 12px; height: 64px; padding: 0 12px; text-align: start;
    border-radius: 14px; background: var(--sb-pill); color: var(--primary-text-color); min-width: 0; transition: transform 90ms ease, filter 90ms ease;
  }
  .tile .ic { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .tile .ic ha-icon, .lrow .li { --mdc-icon-size: 20px; opacity: 0.8; }
  .t { display: grid; gap: 2px; min-width: 0; }
  .t b { font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t small { font-size: 12px; color: var(--sb-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list { display: grid; gap: 8px; }
  .lrow {
    display: grid; grid-template-columns: 24px 1fr 24px; align-items: center; gap: 12px; height: 52px; padding: 0 12px 0 14px; text-align: start;
    border-radius: 14px; background: var(--sb-pill); color: var(--primary-text-color); transition: transform 90ms ease, filter 90ms ease;
  }
  .lrow .li { justify-self: center; }
  .lrow .chev { --mdc-icon-size: 22px; opacity: 0.6; }
  .rows { display: grid; gap: 6px; }
  .row {
    display: grid; grid-template-columns: 36px 1fr auto; align-items: center; gap: 12px; height: 52px; padding: 0 12px 0 10px; text-align: start;
    border-radius: 14px; background: var(--sb-pill); color: var(--primary-text-color); font-size: 15px; transition: transform 90ms ease, filter 90ms ease;
  }
  .row .ic { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .row .ic ha-icon { --mdc-icon-size: 20px; opacity: 0.8; }
  .row .st { width: 8px; height: 8px; border-radius: 50%; background: var(--divider-color); }
  /* the current row: tinted surface, accent on the icon and dot, the name stays text-coloured (readable on every theme) */
  .row.current { color: var(--primary-text-color); background: color-mix(in srgb, var(--primary-color) 12%, var(--sb-pill)); }
  .row.current .ic { color: var(--sb-accent-text); }
  .row.current .ic { background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
  .row.current .ic ha-icon { opacity: 1; }
  .row.current .st { background: var(--primary-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 25%, transparent); }
  .row span.name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ---------- notices ---------- */
  .notice { margin: 0 var(--sb-pad); padding: 10px 14px; border-radius: 12px; background: var(--sb-pill); color: var(--sb-muted); font-size: 13px; text-align: center; }

  /* ---------- landscape: the wheel (with its satellites) left, the key rows right ----------
     Only when the portrait column would leave the wheel too small (the element
     measures that, sidebar-layout.ts, and sets .landscape). The activity line
     spans both columns; the four key rows sit in equal-height tracks on the
     right (so they space out like the portrait spacers do) and the wheel area
     stretches over all of them. The portrait spacers and the square cap on the
     wheel area are dropped. */
  .app.landscape .remote {
    display: grid;
    /* Both columns have a definite width (the wheel column follows the
       height, the key column is capped) so the free space splits evenly:
       edge to wheel = wheel to keys = keys to edge. */
    /* percentages, not cq units: in the container's own declarations cq
       units have no ancestor container and fall back to the viewport, which
       is wider than the panel whenever HA's sidebar is docked */
    grid-template-columns: auto clamp(260px, 40%, 460px);
    grid-template-rows: auto repeat(4, minmax(0, 1fr));
    justify-content: space-evenly;
    /* the side padding is the edge zone; the same amount between the columns
       keeps edge-to-wheel, wheel-to-keys and keys-to-edge equal */
    column-gap: var(--sb-pad);
    row-gap: var(--sb-gap);
    align-items: center;
    max-width: 1040px;
    container-type: size;
    /* The split only happens on hosts too short for the portrait column, so
       the block always fills the height: the four tracks share it like the
       portrait spacers do, the wheel grows with them, the pull stays at the
       bottom. */
  }
  .app.landscape .remote > .sp { display: none; }
  .app.landscape .remote > .activity, .app.landscape .remote > .notice { grid-column: 1 / -1; }
  /* as wide as the wheel plus its satellites (they reach ~0.2 diameters past the
     wrap on either side); the height is the four tracks under the activity line */
  .app.landscape .remote > .wheel-area {
    grid-column: 1; grid-row: 2 / -1; align-self: stretch; justify-self: center; max-height: none;
    /* the wheel's box: the wrap, plus the satellites when the hub has them (X2):
       A and EXIT sit at 5 deg off the horizontal on the orbit radius
       (D/2 - 16px) * sqrt2, in 36px discs, so the box is 1.408 D - 9px */
    --sb-wheel-box: 1;
    --sb-wheel-box-off: 0px;
    /* by height, but never wider than what the key column (its width above)
       and the column gap leave of the remote's content box */
    width: min(
      calc((100cqh - var(--sb-row-h) - var(--sb-gap)) * var(--sb-wheel-box) + var(--sb-wheel-box-off)),
      calc(100cqw - min(max(260px, 40cqw), 460px) - var(--sb-pad))
    );
  }
  .app.landscape .remote > .wheel-area.has-orbit { --sb-wheel-box: 1.408; --sb-wheel-box-off: -9px; }
  .app.landscape .remote:has(> .notice) > .wheel-area { grid-row: 3 / -1; }
  .app.landscape .remote > .nav, .app.landscape .remote > .media, .app.landscape .remote > .rockers, .app.landscape .remote > .colors { grid-column: 2; width: 100%; }
  .app.landscape .wheel-wrap { width: min(100cqh, calc((100cqw - var(--sb-wheel-box-off)) / var(--sb-wheel-box))); }
  /* with the keys beside the wheel there is no half-height to speak of: the sheet takes the full view */
  .app.landscape .sheet { height: 100%; border-radius: 0; }

  @media (prefers-reduced-motion: reduce) {
    .wheel, .pill, .face, .face-pad button, .sheet, .scrim, .remote > *, .pull, .orbit, .numtoggle { transition: none; }
    .ring { animation-duration: 1ms; }
    .wheel[data-tilt], .pill[data-tilt] { transform: none; }
  }
`;
