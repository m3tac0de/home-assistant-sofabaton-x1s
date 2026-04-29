import { css } from "lit";

export const cardStyles = css`
  :host { display: block; }
  *, *::before, *::after { box-sizing: border-box; }
  .card-inner { height: var(--tools-card-height, 600px); display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); }
  .card-header { flex-shrink: 0; min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px 8px; }
  .card-title { font-size: 16px; font-weight: 700; }
  .card-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; }
  .tab-panel.scrollable, .acc-body, .logs-console { overflow-y: auto; }
  .hub-picker-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--divider-color); border-radius: 999px; padding: 4px 10px; background: var(--secondary-background-color, var(--ha-card-background)); cursor: pointer; font-family: inherit; color: var(--primary-text-color); flex-shrink: 0; }
  .chip-label { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--secondary-text-color); }
  .chip-name { font-size: 13px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip-arrow { font-size: 10px; color: var(--secondary-text-color); }
  .hub-picker-dialog { position: fixed; margin: 0; padding: 0; border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); background: var(--card-background-color, var(--ha-card-background, white)); color: var(--primary-text-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); min-width: 160px; overflow: hidden; }
  .hub-picker-dialog::backdrop { background: transparent; }
  .hub-option { padding: 9px 14px; font-size: 13px; cursor: pointer; }
  .hub-option.selected { font-weight: 600; color: var(--primary-color); }
  .tabs { flex-shrink: 0; display: flex; gap: 2px; padding: 0 16px; border-bottom: 1px solid var(--divider-color); }
  .tab-btn { position: relative; border: none; border-bottom: 3px solid transparent; background: transparent; color: var(--secondary-text-color); font: inherit; font-size: 14px; font-weight: 700; padding: 12px 16px 11px; cursor: pointer; }
  .tab-btn--push-right { margin-left: auto; }
  .tab-btn.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
  .tab-btn.tab-disabled { color: var(--disabled-text-color, var(--secondary-text-color)); opacity: 0.45; cursor: default; }
  .tab-btn-label-short { display: none; }
  .logs-panel { gap: 10px; }
  .logs-header, .hub-hero { display: grid; }
  .logs-header { gap: 4px; }
  .logs-subtitle, .logs-empty, .cache-state, .entity-count, .refresh-list-label, .stale-banner { color: var(--secondary-text-color); }
  .logs-console { flex: 1; min-height: 0; border: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 2px); background: radial-gradient(circle at top, color-mix(in srgb, var(--primary-color) 6%, transparent), transparent 45%), color-mix(in srgb, #05070b 92%, var(--card-background-color, #fff)); font-family: "SF Mono", "Fira Code", Consolas, monospace; padding: 10px 0; user-select: text; -webkit-user-select: text; }
  .logs-empty { padding: 12px 14px; font-size: 12px; }
  .logs-empty.error, .cache-state.error { color: var(--error-color, #db4437); }
  .log-line { padding: 1px 14px; font-size: 11px; line-height: 1.45; color: color-mix(in srgb, var(--primary-text-color) 94%, white); white-space: normal; overflow-wrap: anywhere; user-select: text; -webkit-user-select: text; }
  .log-line-level { font-weight: 700; white-space: nowrap; }
  .log-line-level--debug { color: #8ebcff; }
  .log-line-level--info { color: #72d7a1; }
  .log-line-level--warning { color: #ffcf70; }
  .log-line-level--error, .log-line-level--critical { color: #ff8d8d; }
  .log-line-msg { color: #e7edf6; }
  .hub-hero { gap: 10px; padding: 2px 0 0; }
  .hub-ident-name { font-size: 18px; line-height: 1.1; font-weight: 800; letter-spacing: -0.02em; color: var(--primary-text-color); }
  .hub-connection-strip { display: grid; grid-template-columns: auto minmax(26px, 1fr) auto minmax(26px, 1fr) auto; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 4px); background: radial-gradient(circle at top center, color-mix(in srgb, var(--primary-color) 8%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--card-background-color, #fff) 92%, transparent), color-mix(in srgb, var(--card-background-color, #fff) 86%, transparent)); overflow: hidden; }
  .hub-connection-node { position: relative; width: 54px; height: 54px; display: inline-flex; align-items: center; justify-content: center; border-radius: 18px; border: 1px solid color-mix(in srgb, var(--primary-text-color) 12%, var(--divider-color)); background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent); color: color-mix(in srgb, var(--primary-text-color) 34%, var(--secondary-text-color)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04); transition: color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease, background 180ms ease; }
  .hub-connection-node.is-active { color: color-mix(in srgb, var(--primary-color) 72%, white 10%); border-color: color-mix(in srgb, var(--primary-color) 45%, var(--divider-color)); background: color-mix(in srgb, var(--primary-color) 10%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 12%, transparent), 0 0 18px color-mix(in srgb, var(--primary-color) 14%, transparent); }
  .hub-connection-node.is-bridged { color: color-mix(in srgb, #67b7ff 75%, white 10%); border-color: color-mix(in srgb, #67b7ff 45%, var(--divider-color)); background: color-mix(in srgb, #67b7ff 11%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, #67b7ff 12%, transparent), 0 0 18px color-mix(in srgb, #67b7ff 16%, transparent); }
  .hub-connection-node.is-active .hub-connection-node-icon { animation: hubNodePulse 2.8s ease-in-out infinite; }
  .hub-connection-node-icon { display: inline-flex; align-items: center; justify-content: center; }
  .hub-connection-node-icon--hub { width: 33px; height: 33px; }
  .hub-connection-node-icon--mdi ha-icon { --mdc-icon-size: 24px; }
  .hub-connection-link { position: relative; height: 12px; display: flex; align-items: center; }
  .hub-connection-link-line { position: relative; width: 100%; height: 2px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color)); overflow: hidden; }
  .hub-connection-link-line::after { content: ""; position: absolute; inset: 0 auto 0 -35%; width: 35%; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary-color) 45%, white 10%), transparent); opacity: 0; }
  .hub-connection-link.is-active .hub-connection-link-line { background: color-mix(in srgb, var(--primary-color) 28%, var(--divider-color)); box-shadow: 0 0 8px color-mix(in srgb, var(--primary-color) 14%, transparent); }
  .hub-connection-link.is-active .hub-connection-link-line::after { opacity: 0.9; animation: hubSignalTravel 2.4s ease-in-out infinite alternate; }
  @keyframes hubSignalTravel { from { transform: translateX(0); } to { transform: translateX(380%); } }
  @keyframes hubNodePulse { 0%, 100% { transform: scale(1); opacity: 0.96; } 50% { transform: scale(1.03); opacity: 1; } }
  .hub-hero-icon { width: 33px; height: 33px; display: block; }
  .hub-badges { display: flex; gap: 10px; flex-wrap: wrap; padding: 8px 0 12px; }
  .hub-conn-badge, .hub-proxy-badge { display: inline-flex; align-items: center; gap: 9px; min-height: 38px; padding: 0 14px 0 12px; border-radius: 999px; border: 1px solid var(--divider-color); font-size: 13px; font-weight: 700; }
  .hub-conn-badge::before, .hub-proxy-badge::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
  .hub-conn-badge--on { color: #48b851; border-color: color-mix(in srgb, #48b851 45%, var(--divider-color)); }
  .hub-proxy-badge--on { color: #67b7ff; border-color: color-mix(in srgb, #67b7ff 42%, var(--divider-color)); }
  .hub-info-list { border: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 4px); overflow: hidden; }
  .hub-row { min-height: 58px; display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 0 16px; border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color)); }
  .hub-row:first-child { border-top: none; }
  .hub-row-icon-svg { width: 22px; height: 22px; }
  .hub-row-value, .setting-title, .entity-name, .cache-state-title { color: var(--primary-text-color); }
  .hub-row-label { font-size: 13px; font-weight: 700; color: color-mix(in srgb, var(--primary-text-color) 88%, var(--secondary-text-color)); }
  .hub-row-value { font-size: 13px; font-weight: 700; text-align: right; word-break: break-word; }
  .setting-title { font-size: 14px; font-weight: 700; }
  .settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .setting-tile { min-height: 132px; display: flex; flex-direction: column; border: 1px solid var(--divider-color); border-radius: calc(var(--ha-card-border-radius, 12px) + 2px); background: linear-gradient(180deg, color-mix(in srgb, var(--card-background-color, #fff) 92%, white), var(--card-background-color, #fff)); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02); overflow: hidden; }
  .setting-tile.toggle, .setting-tile.action { cursor: pointer; transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease; }
  .setting-tile.toggle:hover, .setting-tile.action:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06); transform: translateY(-1px); }
  .setting-tile.toggle:active, .setting-tile.action:active, .setting-tile.pressed { border-color: color-mix(in srgb, var(--primary-color) 70%, var(--divider-color)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 25%, transparent); transform: translateY(0); background: linear-gradient(180deg, color-mix(in srgb, var(--card-background-color, #fff) 84%, var(--primary-color)), color-mix(in srgb, var(--card-background-color, #fff) 92%, var(--primary-color))); }
  .setting-tile.disabled { opacity: 0.55; cursor: default; box-shadow: none; transform: none; }
  .setting-tile-content { flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 16px; }
  .setting-tile-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .setting-description { font-size: 13px; line-height: 1.45; color: var(--secondary-text-color); }
  .setting-tile-footer { margin-top: auto; min-height: 24px; display: flex; align-items: center; justify-content: center; padding: 0 10px; border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 12%, var(--divider-color)); font-size: 10px; font-weight: 800; letter-spacing: 0.24em; text-transform: uppercase; }
  .setting-tile-footer--global { background: linear-gradient(90deg, color-mix(in srgb, var(--primary-color) 82%, #08131c), color-mix(in srgb, var(--primary-color) 58%, #14324b)); color: white; border-top-color: color-mix(in srgb, var(--primary-color) 55%, transparent); text-shadow: 0 1px 0 rgba(0, 0, 0, 0.18); }
  .setting-icon { font-size: 22px; line-height: 1; }
  .cache-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; margin: -16px; }
  .accordion-section { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--divider-color); }
  .accordion-section:first-child { border-top: none; }
  .accordion-section.open { flex: 1; }
  .acc-header { flex-shrink: 0; height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 16px; cursor: pointer; user-select: none; transition: background-color 120ms ease; }
  .acc-header:hover { background: color-mix(in srgb, var(--primary-color) 6%, var(--ha-card-background, var(--card-background-color))); }
  .acc-title { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
  .badge, .id-badge { border: 1px solid var(--divider-color); border-radius: 999px; }
  .badge { font-size: 11px; padding: 1px 7px; }
  .flex-spacer { flex: 1; }
  .icon-btn { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--divider-color); border-radius: 10px; background: transparent; color: var(--secondary-text-color); cursor: pointer; padding: 0; line-height: 1; transition: color 120ms, border-color 120ms, background 120ms; }
  .icon-btn:hover { color: var(--primary-color); border-color: var(--primary-color); background: rgba(3, 169, 244, 0.05); }
  .icon-btn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }
  .icon-btn.spinning { color: var(--primary-color); border-color: var(--primary-color); opacity: 1 !important; pointer-events: none; }
  .icon-btn.spinning ha-icon { animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .chevron, .entity-chevron { font-size: 9px; color: var(--secondary-text-color); transition: transform 150ms; }
  .accordion-section.open .chevron, .entity-block.open .entity-chevron { transform: rotate(180deg); }
  .acc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 12px; display: grid; gap: 6px; align-content: start; }
  .entity-block { border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); background: var(--secondary-background-color, var(--ha-card-background)); overflow-x: clip; transition: border-color 120ms ease; }
  .entity-block:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
  .entity-summary { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; cursor: pointer; user-select: none; border-radius: var(--ha-card-border-radius, 12px); transition: background-color 120ms ease; }
  .entity-summary:hover { background: color-mix(in srgb, var(--primary-color) 5%, var(--secondary-background-color, var(--ha-card-background))); }
  .entity-meta { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
  .entity-name { font-size: 13px; font-weight: 700; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entity-body { display: none; }
  .entity-block.open .entity-body { display: block; }
  .entity-block.open > .entity-summary { position: sticky; top: 0; z-index: 2; background: var(--secondary-background-color, var(--ha-card-background)); border-bottom: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0; }
  .id-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 600; font-family: "SF Mono", "Fira Code", Consolas, monospace; background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); border-radius: calc(var(--ha-card-border-radius, 12px) * 0.4); padding: 2px 5px; flex-shrink: 0; white-space: nowrap; min-width: 68px; justify-content: space-between; }
  .id-badge span:first-child { color: var(--secondary-text-color); opacity: 0.75; }
  .id-badge span:last-child { color: var(--primary-text-color); text-align: right; }
  .entity-count { font-size: 10px; color: var(--secondary-text-color); flex-shrink: 0; white-space: nowrap; }
  .entity-chevron { font-size: 8px; color: var(--secondary-text-color); transition: transform 150ms; flex-shrink: 0; }
  .inner-section-label { padding: 5px 12px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--secondary-text-color); background: var(--primary-background-color, rgba(0,0,0,0.04)); border-top: 1px solid var(--divider-color); margin-top: 2px; }
  .inner-section-label:first-child { border-top: none; margin-top: 0; }
  .inner-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; }
  .inner-row:hover { background: rgba(0, 0, 0, 0.03); }
  .inner-label { font-size: 12px; font-weight: 500; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .inner-badges { display: flex; gap: 4px; flex-shrink: 0; }
  .buttons-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 6px; }
  .buttons-col { display: flex; flex-direction: column; }
  .inner-empty { padding: 8px 12px; font-size: 11px; color: var(--secondary-text-color); font-style: italic; }
  .cache-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px 16px; text-align: center; font-size: 13px; line-height: 1.6; }
  .cache-state-icon { font-size: 32px; line-height: 1; margin-bottom: 4px; }
  .cache-state-sub { font-size: 12px; line-height: 1.5; max-width: 260px; }
  .stale-banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--warning-color, #ff9800) 30%, transparent); }
  .stale-banner-text { flex: 1; }
  .stale-banner-btn { background: none; border: 1px solid var(--divider-color); border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; color: var(--primary-text-color); }
  @media (max-width: 640px) {
    .tab-btn-label-short { display: inline; }
    .tab-btn--has-short-label .tab-btn-label { display: none; }
    .settings-grid { grid-template-columns: 1fr; }
    .hub-connection-strip { grid-template-columns: auto minmax(14px, 1fr) auto minmax(14px, 1fr) auto; gap: 6px; padding: 8px 10px; }
    .hub-connection-node { width: 42px; height: 42px; border-radius: 14px; }
    .hub-hero-icon { width: 25px; height: 25px; }
    .hub-ident-name { font-size: 15px; }
  }
`;
