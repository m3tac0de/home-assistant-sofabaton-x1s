// The editors' shared CSS (device editor plan, section 3.4; activity editor
// plan, decision 3): the HA card's detail-view, quick-access, step, dialog and
// icon-btn rules on the panel's palette. Mirrored from the card's
// backup-tab-styles.ts, never shared with it (state plan decision 12).

import { css } from "lit";

export const EDITOR_CSS = css`
    :host {
      display: block;
      container-type: inline-size;
      --de-radius-sm: 10px;
      --de-radius-md: 12px;
      --de-radius-lg: 16px;
      --de-radius-xl: 22px;
    }
    .mdi { width: 16px; height: 16px; flex: 0 0 auto; }
    button { border: 0; background: transparent; padding: 0; }
    /* The panel's base keeps buttons on one line; the card's two-line rows wrap. */
    .power-control-trigger, .power-control-option, .edit-selection-row { white-space: normal; min-width: 0; }
    .quick-access-section, .detail-scroll, .power-control { min-width: 0; }

    /* -- frame (the card's .tab-panel--detail / .detail-view) ------------------------------- */
    .tab-panel--detail { min-width: 0; padding: 0; }
    .detail-view { min-width: 0; display: flex; flex-direction: column; margin: -12px -16px -16px; }
    /* The card pins its header inside its own scroll box; the panel's page scrolls under the shell's top dock, so pin under it. */
    .sticky-header { position: sticky; top: var(--top-dock-height, 0px); z-index: 3; min-width: 0; background: var(--sbp-panel); }
    .detail-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; padding: 12px 16px; border-bottom: 1px solid var(--sbp-line); }
    .detail-title-main { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; overflow: hidden; }
    .detail-title-stack { display: flex; flex-direction: column; min-width: 0; flex: 1 1 0; overflow: hidden; }
    .detail-crumbs { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; overflow: hidden; white-space: nowrap; font-size: 11px; line-height: 1.1; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; color: var(--sbp-muted); }
    .detail-crumb { flex: 0 1 auto; min-width: 0; font: inherit; color: var(--sbp-muted); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: color 120ms ease; }
    .detail-crumb:hover { color: var(--sbp-text); text-decoration: underline; text-decoration-color: var(--sbp-accent); }
    .detail-crumb-sep { flex: 0 0 auto; color: var(--sbp-muted); }
    .detail-title { display: block; width: 100%; font-size: 18px; font-weight: 700; line-height: 1.15; color: var(--sbp-text); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .detail-title-actions { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .back-btn { border: 1px solid var(--sbp-line); border-radius: var(--de-radius-sm); color: var(--sbp-text); font: inherit; font-weight: 700; padding: 8px 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .back-btn:hover { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
    .back-btn .mdi { width: 18px; height: 18px; }
    .detail-sync-btn { border: 1px solid var(--sbp-line); border-radius: var(--de-radius-sm); color: var(--sbp-text); font: inherit; font-size: 13px; font-weight: 700; padding: 8px 12px; cursor: pointer; white-space: nowrap; transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease; }
    .detail-sync-btn:hover { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
    .detail-sync-btn.sync-btn-primary { border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.18); }
    .detail-sync-btn:disabled { cursor: default; opacity: 0.42; color: var(--sbp-muted); border-color: color-mix(in srgb, var(--sbp-line) 88%, transparent); }
    .detail-sync-btn.detail-sync-btn--state-ok, .detail-sync-btn.detail-sync-btn--state-ok:disabled { border-color: color-mix(in srgb, #48b851 45%, var(--sbp-line)); background: color-mix(in srgb, #48b851 14%, var(--sbp-panel)); color: #2e7d32; opacity: 1; }
    .icon-btn, .dialog-close { flex: 0 0 auto; width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--sbp-line); border-radius: var(--de-radius-sm); background: var(--sbp-panel); color: var(--sbp-muted); cursor: pointer; transition: border-color 120ms ease, background-color 120ms ease, transform 80ms ease, color 120ms ease; }
    .icon-btn:hover:not(:disabled), .dialog-close:hover { border-color: var(--sbp-accent); background: color-mix(in srgb, var(--sbp-accent) 10%, var(--sbp-panel)); color: var(--sbp-text); }
    .icon-btn:active, .dialog-close:active { transform: translateY(1px); }
    .icon-btn:disabled { opacity: 0.45; cursor: default; }
    .icon-btn--danger:hover:not(:disabled) { border-color: var(--sbp-err); background: color-mix(in srgb, var(--sbp-err) 10%, var(--sbp-panel)); color: var(--sbp-err); }

    /* -- section nav ---------------------------------------------------------------------------- */
    .detail-section-nav { display: flex; align-items: stretch; min-height: 34px; margin: 10px 16px; border: 1px solid color-mix(in srgb, var(--sbp-line) 88%, transparent); border-radius: var(--de-radius-md); overflow: hidden; background: color-mix(in srgb, var(--sbp-panel-2) 76%, transparent); }
    .detail-section-nav-btn { flex: 1 1 0; min-width: 0; min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border-right: 1px solid color-mix(in srgb, var(--sbp-line) 82%, transparent); color: color-mix(in srgb, var(--sbp-muted) 88%, var(--sbp-text) 12%); font: inherit; cursor: pointer; white-space: nowrap; border-radius: 0; }
    .detail-section-nav-btn:last-child { border-right: none; }
    .detail-section-nav-btn:hover { background: rgba(var(--sbp-accent-rgb), 0.08); color: var(--sbp-text); }
    .detail-section-nav-btn.active { color: var(--sbp-text); background: rgba(var(--sbp-accent-rgb), 0.1); box-shadow: inset 0 -2px 0 var(--sbp-accent); }
    .detail-section-nav-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }

    /* -- body ------------------------------------------------------------------------------------- */
    .detail-scroll { padding: 16px; display: flex; flex-direction: column; gap: 14px; }
    .notice-banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--de-radius-sm); border: 1px solid color-mix(in srgb, var(--sbp-warn) 45%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-warn) 10%, transparent); font-size: 12.5px; line-height: 1.45; color: var(--sbp-text); }
    .notice-banner .mdi { color: var(--sbp-warn); width: 18px; height: 18px; }
    .notice-banner--info { border-color: color-mix(in srgb, var(--sbp-accent) 40%, var(--sbp-line)); background: rgba(var(--sbp-accent-rgb), 0.08); }
    .notice-banner--info .mdi { color: var(--sbp-accent); }
    @keyframes sb-spin { to { transform: rotate(360deg); } }
    .mdi.sb-spin { animation: sb-spin 720ms linear infinite; }
    .section-status { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--sbp-line); border-radius: 10px; font-size: 13px; line-height: 1.4; color: var(--sbp-muted); }
    .section-status .mdi { width: 18px; height: 18px; }
    .section-status.error { color: var(--sbp-err); border-color: color-mix(in srgb, var(--sbp-err) 30%, var(--sbp-line)); background: color-mix(in srgb, var(--sbp-err) 6%, var(--sbp-panel)); }
    .quick-access-section { display: grid; gap: 12px; scroll-margin-top: 16px; }
    .quick-access-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .quick-access-head-main { min-width: 0; flex: 1 1 200px; display: grid; gap: 4px; }
    .quick-access-head-actions { flex: 0 0 auto; }
    .quick-access-title { color: var(--sbp-text); font-size: 14px; font-weight: 700; }
    .quick-access-sub { color: var(--sbp-muted); font-size: 12px; line-height: 1.45; }
    .quick-access-list { border: 1px solid var(--sbp-line); border-radius: var(--de-radius-lg); background: var(--sbp-panel); overflow: hidden; display: flex; flex-direction: column; }
    .quick-access-sortable-container { display: block; }
    .quick-access-sortable-item { display: block; border-top: 1px solid color-mix(in srgb, var(--sbp-line) 72%, transparent); }
    .quick-access-sortable-item:first-child { border-top: none; }
    .quick-access-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 12px 14px; }
    .quick-access-row--step { grid-template-columns: auto minmax(0, 1fr) auto; }
    .quick-access-drag { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; margin-left: -6px; border-radius: 8px; color: var(--sbp-muted); cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
    .quick-access-drag:hover { color: var(--sbp-text); background: rgba(var(--sbp-accent-rgb), 0.08); }
    .quick-access-drag:active { cursor: grabbing; }
    .quick-access-drag .mdi { width: 18px; height: 18px; }
    .quick-access-sortable-item.is-shifting { transition: transform 150ms ease; }
    .quick-access-sortable-item.is-dragging { position: relative; z-index: 2; background: var(--sbp-panel); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); border-top-color: transparent; }
    .detail-view.is-sorting, .quick-access-row--step { user-select: none; -webkit-user-select: none; }
    /* The band is a <label>; undo the panel's generic form-label rule. */
    .step-wait { display: flex; align-items: center; gap: 6px; margin: 0; padding: 3px 14px 6px; text-transform: none; letter-spacing: 0; background: color-mix(in srgb, var(--sbp-panel-2) 45%, transparent); cursor: text; }
    .step-wait-caption { font-size: 9px; line-height: 1; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; color: var(--sbp-muted); pointer-events: none; }
    .step-wait-field { display: inline-flex; align-items: baseline; gap: 3px; padding: 1px 6px 2px; border: 1px solid var(--sbp-line); border-radius: var(--de-radius-sm); background: var(--sbp-panel); }
    .step-wait-field:focus-within { border-color: var(--sbp-accent); }
    .step-wait-input { width: 42px; min-width: 0; padding: 0; border: none; background: transparent; color: var(--sbp-text); font: inherit; font-size: 13px; font-weight: 600; text-align: right; outline: none; -moz-appearance: textfield; }
    .step-wait-input::-webkit-outer-spin-button, .step-wait-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    .step-wait-unit { color: var(--sbp-muted); font-size: 12px; font-weight: 600; }
    .quick-access-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .quick-access-label-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .quick-access-label { min-width: 0; color: var(--sbp-text); font-size: 13px; font-weight: 700; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .quick-access-chip { flex: 0 0 auto; border-radius: 999px; padding: 3px 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; border: 1px solid var(--sbp-line); color: var(--sbp-muted); background: color-mix(in srgb, var(--sbp-panel-2) 74%, transparent); }
    .quick-access-meta { color: var(--sbp-muted); font-size: 12px; line-height: 1.4; }
    .quick-access-actions { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .quick-access-empty { border: 1px dashed color-mix(in srgb, var(--sbp-line) 88%, transparent); border-radius: var(--de-radius-md); padding: 12px 14px; color: var(--sbp-muted); font-size: 13px; line-height: 1.5; background: color-mix(in srgb, var(--sbp-panel-2) 54%, transparent); }
    .quick-access-add-btn { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: var(--de-radius-md); border: 1px solid color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); background: rgba(var(--sbp-accent-rgb), 0.1); color: var(--sbp-accent); font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
    .quick-access-add-btn:hover:not(:disabled) { border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.16); color: var(--sbp-text); }
    .quick-access-add-btn:disabled { opacity: 0.48; cursor: default; }
    .quick-access-add-btn .mdi { color: var(--sbp-accent); }

    /* -- power control ---------------------------------------------------------------------------- */
    .power-control { position: relative; display: block; border: 1px solid var(--sbp-line); border-radius: var(--de-radius-lg); background: var(--sbp-panel); }
    .power-control-trigger { width: 100%; border-radius: inherit; color: inherit; font: inherit; text-align: left; display: flex; gap: 12px; align-items: center; padding: 10px 14px; cursor: pointer; }
    .power-control-trigger:hover { background: rgba(var(--sbp-accent-rgb), 0.06); }
    .power-control-trigger .selection-chevron .mdi { transition: transform 120ms ease; }
    .power-control[data-open="true"] .power-control-trigger .selection-chevron .mdi { transform: rotate(180deg); }
    .power-control-backdrop { position: fixed; inset: 0; z-index: 30; cursor: default; }
    .power-control-menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 31; display: flex; flex-direction: column; background: var(--sbp-panel); border: 1px solid color-mix(in srgb, var(--sbp-line) 80%, transparent); border-radius: 10px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22); overflow: hidden; }
    .power-control-option { width: 100%; color: inherit; font: inherit; text-align: left; display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-top: 1px solid color-mix(in srgb, var(--sbp-line) 50%, transparent); cursor: pointer; border-radius: 0; }
    .power-control-option:first-child { border-top: none; }
    .power-control-option:hover { background: rgba(var(--sbp-accent-rgb), 0.08); }
    .power-control-option[aria-checked="true"] .selection-label { color: var(--sbp-text); font-weight: 700; }
    .power-control-option .selection-chevron .mdi { color: var(--sbp-accent); }
    .selection-main { min-width: 0; display: flex; flex-direction: column; gap: 3px; flex: 1 1 auto; }
    .selection-label { color: var(--sbp-text); font-size: 13px; font-weight: 600; }
    .selection-sub { color: var(--sbp-muted); font-size: 12px; line-height: 1.45; }
    .selection-chevron { color: var(--sbp-muted); flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; }
    .selection-chevron .mdi { width: 18px; height: 18px; }
    .edit-selection-row { width: 100%; color: inherit; font: inherit; text-align: left; display: flex; gap: 12px; align-items: center; padding: 10px 14px; cursor: pointer; border-radius: 0; }
    .edit-selection-row:hover { background: rgba(var(--sbp-accent-rgb), 0.06); }
    .edit-selection-row[aria-disabled="true"] { cursor: default; }
    .power-sequences[data-disabled="true"] { opacity: 0.45; pointer-events: none; }
    .power-sequences-note { color: var(--sbp-muted); font-size: 12px; line-height: 1.45; padding: 8px 14px 0; }

    /* -- guard screens (the live host's) --------------------------------------------------------- */
    .capture-error { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 24px 16px; text-align: center; color: var(--sbp-muted); line-height: 1.55; }
    .guard-icon { color: var(--sbp-muted); }
    .guard-icon .mdi { width: 40px; height: 40px; }
    .capture-error-title { color: var(--sbp-text); font-size: 16px; font-weight: 700; }
    .guard-sub { max-width: 360px; font-size: 13px; }
    .action-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
    .btn { border: 1px solid var(--sbp-line); border-radius: var(--de-radius-sm); color: var(--sbp-text); font: inherit; font-weight: 700; padding: 8px 14px; cursor: pointer; }
    .btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
    .btn:disabled { opacity: 0.5; cursor: default; }
    .btn-primary { border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.18); }
    .btn-danger { border-color: var(--sbp-err); color: var(--sbp-err); background: color-mix(in srgb, var(--sbp-err) 12%, transparent); }

    /* -- dialogs ---------------------------------------------------------------------------------- */
    .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
    .dialog { width: min(760px, calc(100vw - 36px)); max-height: min(82vh, 900px); display: flex; flex-direction: column; border-radius: var(--de-radius-lg); border: 1px solid var(--sbp-line); background: var(--sbp-panel); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28); overflow: hidden; color: var(--sbp-text); }
    .dialog.small { width: min(500px, calc(100vw - 36px)); }
    .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .dialog-header { border-bottom: 1px solid var(--sbp-line); }
    .dialog-title { font-size: 16px; flex: 1; color: var(--sbp-text); }
    .dialog-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
    .dialog-text { font-size: 14px; line-height: 1.55; color: var(--sbp-text); }
    .dialog-footer { border-top: 1px solid var(--sbp-line); justify-content: space-between; flex-wrap: wrap; }
    .dialog-footer-actions { display: flex; gap: 8px; margin-left: auto; }
    .dialog-footer-note { flex: 1 1 140px; min-height: 18px; min-width: 0; font-size: 13px; color: var(--sbp-err); }
    .dialog-btn { border: 1px solid var(--sbp-line); border-radius: var(--de-radius-sm); padding: 8px 12px; color: var(--sbp-text); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
    .dialog-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
    .dialog-btn-primary { border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.18); }
    .dialog-btn-danger { border-color: var(--sbp-err); color: var(--sbp-err); background: color-mix(in srgb, var(--sbp-err) 12%, transparent); }
    .dialog-btn-danger:hover:not(:disabled) { background: color-mix(in srgb, var(--sbp-err) 18%, transparent); }
    .dialog-btn:disabled { opacity: 0.45; cursor: default; }
    .backup-drawer-sub { color: var(--sbp-muted); font-size: 13px; line-height: 1.5; }
    .delete-impact-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .delete-impact-list li { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--sbp-text); }
    .delete-impact-list .mdi { width: 18px; height: 18px; color: var(--sbp-muted); }
    .delete-replace-note { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--sbp-muted); line-height: 1.45; }
    /* The panel's base styles every <label> as a small uppercase caption; the card's field wrapper is a plain block. */
    label.decoded-field, .decoded-field { display: flex; flex-direction: column; gap: 4px; margin: 0; font-size: inherit; letter-spacing: 0; text-transform: none; color: inherit; }
    .decoded-field-label { font-size: 12px; font-weight: 600; color: var(--sbp-muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .decoded-field-input { width: 100%; font: inherit; font-size: 13px; color: var(--sbp-text); background: var(--sbp-input); border: 1px solid var(--sbp-line); border-radius: var(--de-radius-sm); padding: 8px 10px; }
    .decoded-field-input:focus { outline: none; border-color: var(--sbp-accent); }
    select.decoded-field-input { cursor: pointer; }
    .binding-static-field { font-size: 13px; font-weight: 600; color: var(--sbp-text); padding: 8px 10px; border: 1px solid var(--sbp-line); border-radius: var(--de-radius-sm); background: color-mix(in srgb, var(--sbp-panel-2) 54%, transparent); }
    .binding-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    /* A switch in place of ha-switch. */
    .sb-switch { position: relative; width: 40px; height: 22px; flex: 0 0 auto; appearance: none; margin: 0; border-radius: 999px; background: var(--sbp-line); cursor: pointer; transition: background 120ms ease; }
    .sb-switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--sbp-panel); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3); transition: transform 120ms ease; }
    .sb-switch:checked { background: var(--sbp-accent); }
    .sb-switch:checked::after { transform: translateX(18px); }

    /* -- the activity editor (the card's activityEditorStyles): role rows, fixed menus, the drill-in footer -- */
    .decoded-field-helper { font-size: 11px; color: var(--sbp-muted); line-height: 1.35; }
    .quick-access-list--overlays { overflow: visible; }
    .power-members-summary { padding: 8px 4px 0; }
    .member-add { position: relative; display: inline-flex; }
    .member-add-backdrop { position: fixed; inset: 0; background: transparent; border: none; padding: 0; margin: 0; cursor: default; z-index: 4; }
    .member-add-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 5; min-width: 180px; max-height: 240px; overflow-y: auto; background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: var(--de-radius-md); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); display: flex; flex-direction: column; padding: 4px; }
    .member-add-option { border: none; background: none; text-align: left; padding: 8px 10px; font: inherit; font-size: 0.9rem; color: var(--sbp-text); border-radius: var(--de-radius-sm); cursor: pointer; white-space: normal; }
    .member-add-option:hover:not(:disabled) { background: color-mix(in srgb, var(--sbp-text) 10%, transparent); }
    .member-add-option:disabled { color: var(--sbp-muted); cursor: default; opacity: 0.7; }
    .role-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
    .role-icon { color: var(--sbp-muted); flex: none; }
    .role-icon.mdi { width: 18px; height: 18px; }
    .role-main { flex: 1; min-width: 0; }
    .role-label { font-size: 0.92rem; color: var(--sbp-text); }
    .role-note { font-size: 0.75rem; color: var(--sbp-muted); }
    .role-trigger { display: inline-flex; align-items: center; gap: 4px; border: 1px solid var(--sbp-line); border-radius: var(--de-radius-sm); background: var(--sbp-panel); color: var(--sbp-text); padding: 5px 8px; font: inherit; font-size: 0.85rem; cursor: pointer; max-width: 190px; }
    .role-trigger .mdi { width: 15px; height: 15px; }
    .role-trigger > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .role-trigger[data-state="unused"] > span { color: var(--sbp-muted); }
    .role-trigger[data-state="custom"] > span, .role-trigger[data-state="customized"] > span { font-style: italic; }
    .role-menu { right: 0; left: auto; min-width: 200px; }
    .quick-access-sortable-item.quick-access-footer-item { border-top: 1px solid var(--sbp-line); background: color-mix(in srgb, var(--sbp-panel-2) 55%, transparent); border-radius: 0 0 calc(var(--de-radius-lg) - 1px) calc(var(--de-radius-lg) - 1px); overflow: hidden; }
    .edit-selection-row--footer .selection-label { color: var(--sbp-muted); font-size: 12.5px; font-weight: 600; }
    .footer-row-icon { flex: 0 0 auto; color: var(--sbp-muted); }

    @container (max-width: 480px) {
      .detail-section-nav-btn { gap: 0; }
      .detail-section-nav-btn .mdi { display: none; }
    }
    @container (max-width: 480px) {
      .detail-view { margin: -12px -12px -12px; }
    }
    @container (max-width: 360px) {
      .detail-title-actions { gap: 6px; min-width: max-content; }
      .detail-section-nav { overflow-x: auto; scrollbar-width: none; }
      .detail-section-nav::-webkit-scrollbar { display: none; }
      .detail-section-nav-btn { flex-basis: auto; min-width: max-content; padding-inline: 12px; }
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog.small { width: min(100vw, 100%); max-height: calc(100vh - max(env(safe-area-inset-top), 8px)); border-radius: var(--de-radius-xl) var(--de-radius-xl) 0 0; }
      .dialog-footer { flex-direction: column; align-items: stretch; }
      .dialog-footer-actions { width: 100%; }
      .dialog-footer-actions .dialog-btn { flex: 1 1 0; }
      /* The footer is a column here, so the note's 140px basis would be a height. */
      .dialog-footer-note { flex: 0 0 auto; min-height: 0; }
      .dialog-footer-note:empty { display: none; }
    }
`;
