// Shared styles for the control panel's elements, on the Home Assistant
// default palette the web remote ships (remote-card/src/shims/palette.ts):
// the panel and the remote card inside it read the same variables, so
// light and dark agree. Every element adopts PANEL_BASE_CSS and adds its own.

import { css } from "lit";

export const PANEL_BASE_CSS = css`
  :host {
    --sbp-bg: var(--primary-background-color, #fafafa);
    --sbp-panel: var(--card-background-color, #ffffff);
    --sbp-panel-2: var(--secondary-background-color, #e5e5e5);
    --sbp-line: var(--divider-color, rgba(0, 0, 0, 0.12));
    --sbp-text: var(--primary-text-color, #141414);
    --sbp-muted: var(--secondary-text-color, #5e5e5e);
    --sbp-accent: var(--primary-color, #009ac7);
    --sbp-accent-rgb: var(--rgb-primary-color, 0, 154, 199);
    --sbp-ok: var(--success-color, #43a047);
    --sbp-warn: var(--warning-color, #ffa600);
    --sbp-err: var(--error-color, #db4437);
    --sbp-input: var(--input-fill-color, rgb(245, 245, 245));
    --sbp-press: #9c27b0;
    --sbp-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --sbp-radius: 10px;
    font-family: Roboto, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 14px;
    color: var(--sbp-text);
    box-sizing: border-box;
    /* An app, not a page: labels, buttons and rows do not select. Fields and literal payloads (pre, code) do, so they copy. */
    -webkit-user-select: none;
    user-select: none;
  }
  input, textarea, pre, code, [contenteditable] { -webkit-user-select: text; user-select: text; }
  *, *::before, *::after { box-sizing: inherit; }
  a { color: var(--sbp-accent); }
  button, input, select, textarea {
    font: inherit;
    color: var(--sbp-text);
    background: var(--sbp-input);
    border: 1px solid var(--sbp-line);
    border-radius: 6px;
    padding: 6px 10px;
  }
  input, select, textarea { width: 100%; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--sbp-accent); }
  textarea { font-family: var(--sbp-mono); font-size: 12px; min-height: 64px; resize: vertical; }
  button { cursor: pointer; white-space: nowrap; background: var(--sbp-panel); }
  button:hover { border-color: var(--sbp-accent); }
  button.primary { background: var(--sbp-accent); color: #fff; border-color: var(--sbp-accent); font-weight: 600; }
  button.danger { color: var(--sbp-err); }
  button.danger:hover { border-color: var(--sbp-err); }
  button.small { font-size: 12px; padding: 4px 9px; }
  button:disabled { opacity: 0.5; cursor: default; }
  label { display: block; color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 10px 0 4px; }
  label.inline { display: inline-flex; align-items: center; gap: 6px; text-transform: none; letter-spacing: 0; font-size: 12px; margin: 0; }
  label.inline input { width: auto; }
  pre {
    margin: 0;
    font-family: var(--sbp-mono);
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--sbp-bg);
    border: 1px solid var(--sbp-line);
    border-radius: 6px;
    padding: 10px;
  }
  code { font-family: var(--sbp-mono); font-size: 12px; }
  .hint { color: var(--sbp-muted); font-size: 12px; line-height: 1.5; }
  .mono { font-family: var(--sbp-mono); }
  .row { display: flex; gap: 8px; align-items: end; }
  .row > * { flex: 1; }
  .row > .fixed { flex: 0 0 auto; }
  .spacer { flex: 1; }
  .tone-ok { color: var(--sbp-ok); }
  .tone-warn { color: var(--sbp-warn); }
  .tone-err { color: var(--sbp-err); }
  .tone-off { color: var(--sbp-muted); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--sbp-muted); flex: 0 0 auto; }
  .dot.ok { background: var(--sbp-ok); }
  .dot.warn { background: var(--sbp-warn); }
  .dot.err { background: var(--sbp-err); }
  .dot.off { background: var(--sbp-line); }
  .panel {
    background: var(--sbp-panel);
    border: 1px solid var(--sbp-line);
    border-radius: var(--sbp-radius);
    padding: 14px 16px;
    min-width: 0;
  }
  .panel + .panel { margin-top: 16px; }
  .panel h2 { margin: 0 0 10px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
  .panel h2 .hint { font-weight: 400; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .actions .msg { font-size: 12px; margin-left: auto; }
  .msg-ok { color: var(--sbp-ok); }
  .msg-err { color: var(--sbp-err); }
  table.list { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
  table.list th, table.list td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--sbp-line); vertical-align: middle; white-space: nowrap; }
  table.list th { color: var(--sbp-muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  table.list td.act { text-align: right; }
  table.list .sub { color: var(--sbp-muted); }
  .scroll-x { overflow-x: auto; }
`;
