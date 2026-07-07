// Shared styles for the backup tab and the extracted edit-detail
// view element. Moved verbatim out of backup-tab.ts in the Phase L1
// extraction (docs/internal/live-activity-editor-plan.md) so both
// shadow roots render identically; selectors unused by one host are
// inert there. Trimming per-host is deferred follow-up work.
import { css } from "lit";

export const backupTabStyles = css`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      --backup-radius-sm: calc(var(--ha-card-border-radius, 12px) * 0.85);
      --backup-radius-md: var(--ha-card-border-radius, 12px);
      --backup-radius-lg: calc(var(--ha-card-border-radius, 12px) * 1.33);
      --backup-radius-xl: calc(var(--ha-card-border-radius, 12px) * 1.8);
      --backup-radius-pill: calc(var(--ha-card-border-radius, 12px) * 999);
    }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow-y: auto; }
    .state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
      text-align: center;
      padding: 24px;
      line-height: 1.6;
    }
    .state.error { color: var(--error-color, #db4437); }
    .blocked-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      line-height: 1.6;
    }
    .blocked-state-title {
      color: var(--primary-text-color);
      font-size: 16px;
      font-weight: 700;
    }
    .blocked-state-sub {
      max-width: 340px;
      font-size: 13px;
    }
    .backup-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .backup-body {
      gap: 12px;
    }
    .restore-body {
      gap: 12px;
    }

    .header-primary-btn {
      flex: 0 0 auto;
      min-width: 114px;
      min-height: 42px;
      padding: 0 18px;
      border-radius: var(--backup-radius-md);
      border: 1px solid color-mix(in srgb, var(--primary-color) 75%, white 10%);
      background: color-mix(in srgb, var(--primary-color) 20%, white 80%);
      color: var(--primary-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .header-primary-btn:hover:not(:disabled) {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 24%, white 76%);
    }
    .header-primary-btn:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .backup-action-row {
      display: flex;
      justify-content: flex-start;
    }
    .backup-drawer-sub { color: var(--secondary-text-color); font-size: 13px; line-height: 1.5; }
    .backup-section-title { color: var(--primary-text-color); font-size: 13px; font-weight: 700; }

    .backup-config-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .restore-config-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .backup-scope-group { display: grid; gap: 8px; }
    ha-radio-group.scope-form--md {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
      --ha-radio-option-active-color: var(--primary-color);
      --ha-radio-option-checked-background-color: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    ha-radio-group.scope-form--md ha-radio-option {
      min-width: 0;
    }
    @media (max-width: 380px) {
      ha-radio-group.scope-form--md { grid-template-columns: 1fr; }
    }
    .compat-radio-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
    }
    .compat-radio-option {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease;
    }
    .compat-radio-option:hover {
      border-color: color-mix(in srgb, var(--primary-color) 45%, var(--divider-color));
    }
    .compat-radio-option.selected {
      border-color: color-mix(in srgb, var(--primary-color) 70%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    .compat-radio-option.disabled {
      opacity: 0.58;
      cursor: default;
    }
    .compat-radio-option-label {
      min-width: 0;
      flex: 1 1 auto;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
    }
    @media (max-width: 380px) {
      .compat-radio-group { grid-template-columns: 1fr; }
    }
    .compat-choice {
      width: 18px;
      height: 18px;
      margin: 0;
      flex: 0 0 auto;
      accent-color: var(--primary-color);
    }

    .backup-devices-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .backup-devices-head-main {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .backup-selected-count {
      color: var(--primary-color);
      font-size: 12px;
      font-weight: 700;
    }
    .backup-link-btn {
      border: none;
      background: transparent;
      color: var(--primary-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      padding: 0;
    }
    .backup-link-btn:disabled { opacity: 0.48; cursor: default; }

    .selection-card {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
      overflow: hidden;
      min-height: 0;
    }
    .backup-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .restore-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .edit-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .selection-list { display: flex; flex-direction: column; max-height: 340px; overflow-y: auto; }
    .backup-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .restore-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .edit-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .selection-empty {
      padding: 16px 14px;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .selection-group-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      min-height: 36px;
      padding: 0 14px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 94%, white 6%);
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
    }
    .selection-group-header:first-child { border-top: none; }
    .edit-config-view .selection-group-header {
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 94%, white 6%);
    }
    .selection-row {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      cursor: pointer;
    }
    .selection-row:first-child { border-top: none; }
    .selection-row ha-checkbox { flex: 0 0 auto; }
    .selection-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1 1 auto;
    }
    .selection-label {
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 600;
    }
    .selection-meta {
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      margin-left: 8px;
    }
    .selection-sub {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.45;
    }

    .edit-body { padding-top: 0; padding-bottom: 8px; display: flex; flex-direction: column; gap: 8px; align-content: normal; }
    .edit-config-view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
    .edit-selection-row {
      width: 100%;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      cursor: pointer;
    }
    .edit-selection-row:first-child { border-top: none; }
    .edit-selection-row:hover {
      background: color-mix(in srgb, var(--primary-color) 6%, transparent);
    }
    .edit-order-sortable { display: block; }
    .edit-order-sortable-container { display: block; }
    /* Inside a sortable wrapper, ":first-child" of the row would not match
       (the row's parent is the wrapper, not the list). Re-strip the border
       on the first row of each wrapped group so groups still read cleanly. */
    .edit-order-sortable-container .edit-selection-row:first-child { border-top: none; }
    .edit-row-drag {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
      padding: 2px;
      margin-left: -4px;
    }
    .edit-row-drag:active { cursor: grabbing; }
    .edit-row-drag ha-icon { --mdc-icon-size: 18px; }
    .selection-chevron {
      color: var(--secondary-text-color);
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .selection-chevron ha-icon { --mdc-icon-size: 18px; }

    /* ── Automatic-power dropdown (device Power section) ─────────────── */
    /* Genuine overlay popup: the menu is absolutely positioned so opening
       it never reflows the sequence rows below. A transparent fixed
       backdrop catches click-away. */
    /* The control is its own field, a sibling of (not inside) the
       sequence list, so the list's overflow:hidden can't clip the popup. */
    .power-control {
      position: relative;
      display: block;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-lg);
      background: var(--ha-card-background, var(--card-background-color));
    }
    .power-control-trigger {
      width: 100%;
      border: none;
      border-radius: inherit;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      cursor: pointer;
    }
    .power-control-trigger:hover {
      background: color-mix(in srgb, var(--primary-color) 6%, transparent);
    }
    .power-control-trigger .selection-chevron ha-icon { transition: transform 120ms ease; }
    .power-control[data-open="true"] .power-control-trigger .selection-chevron ha-icon {
      transform: rotate(180deg);
    }
    .power-control-backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      border: none;
      background: transparent;
      padding: 0;
      cursor: default;
    }
    .power-control-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      z-index: 31;
      display: flex;
      flex-direction: column;
      background: var(--card-background-color, var(--ha-card-background, var(--secondary-background-color, #fff)));
      border: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      border-radius: 10px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
      overflow: hidden;
    }
    .power-control-option {
      width: 100%;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 50%, transparent);
      cursor: pointer;
    }
    .power-control-option:first-child { border-top: none; }
    .power-control-option:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    }
    .power-control-option[aria-checked="true"] .selection-label { color: var(--primary-color); }
    .power-control-option .selection-chevron ha-icon { color: var(--primary-color); }

    /* Power-on/off sequence rows, dimmed + inert when power control is off */
    .power-sequences[data-disabled="true"] { opacity: 0.45; pointer-events: none; }
    .power-sequences-note {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.45;
      padding: 8px 14px 0;
    }
    .tab-panel--detail { padding: 0; }
    .detail-view {
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 0;
      overflow: hidden;
    }
    .sticky-header {
      position: sticky;
      z-index: 2;
      background: var(--ha-card-background, var(--card-background-color));
    }
    .sticky-header { top: 0; }
    .detail-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .detail-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color);
    }
    .detail-title-main {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
    }
    .detail-title-stack {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1 1 auto;
    }
    .detail-crumbs {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
      font-size: 11px;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .detail-crumb {
      flex: 0 1 auto;
      min-width: 0;
      border: none;
      background: transparent;
      padding: 0;
      font: inherit;
      color: var(--secondary-text-color);
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: color 120ms ease;
    }
    .detail-crumb:hover {
      color: var(--primary-color);
      text-decoration: underline;
    }
    .detail-crumb-sep {
      flex: 0 0 auto;
      color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent);
    }
    .detail-title-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    .detail-title {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.15;
      color: var(--primary-text-color);
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .detail-section-nav {
      display: flex;
      align-items: stretch;
      min-height: 34px;
      margin: 10px 16px;
      border: 1px solid color-mix(in srgb, var(--divider-color) 88%, transparent);
      border-radius: var(--backup-radius-md);
      overflow: hidden;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 76%, transparent);
    }
    .detail-section-nav-btn {
      flex: 1 1 0;
      min-width: 0;
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 10px;
      border: none;
      border-right: 1px solid color-mix(in srgb, var(--divider-color) 82%, transparent);
      background: transparent;
      color: color-mix(in srgb, var(--secondary-text-color) 88%, var(--primary-text-color) 12%);
      font: inherit;
      cursor: pointer;
      white-space: nowrap;
    }
    .detail-section-nav-btn:last-child {
      border-right: none;
    }
    .detail-section-nav-btn:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
      color: var(--primary-text-color);
    }
    .detail-section-nav-btn.active {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
      box-shadow: inset 0 -2px 0 var(--primary-color);
    }
    .detail-section-nav-btn ha-icon {
      --mdc-icon-size: 16px;
      flex: 0 0 auto;
    }
    .detail-section-nav-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    /* Match the Wifi Commands tab's detail-view back button so the
       affordance is identical across the card: padded pill with a
       bold label-weight, content-sized (not a fixed square). */
    .back-btn {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    .back-btn:hover {
      border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
    }
    .edit-detail-card {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-lg);
      padding: 14px;
      background: var(--ha-card-background, var(--card-background-color));
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .edit-detail-copy {
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
    }
    .edit-field-group {
      display: grid;
      gap: 8px;
    }
    .edit-field-label {
      color: var(--secondary-text-color);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .edit-field-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .edit-row-input {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
      background: var(--ha-card-background, var(--card-background-color));
      border: 1px solid color-mix(in srgb, var(--primary-color) 65%, var(--divider-color));
      border-radius: var(--backup-radius-sm);
      padding: 4px 10px;
      outline: none;
    }
    .edit-row-input:focus { border-color: var(--primary-color); }
    .edit-support-card {
      border: 1px dashed color-mix(in srgb, var(--divider-color) 88%, transparent);
      border-radius: var(--backup-radius-md);
      padding: 12px 14px;
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 54%, transparent);
    }
    .icon-btn, .dialog-close {
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease, transform 80ms ease, color 120ms ease;
    }
    .icon-btn:hover:not(:disabled),
    .dialog-close:hover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
    }
    .icon-btn:active,
    .dialog-close:active { transform: translateY(1px); }
    .icon-btn:disabled { opacity: 0.45; cursor: default; }
    .icon-btn ha-icon { --mdc-icon-size: 16px; }
    /* Destructive variant of .icon-btn — used for the inline delete
       (trash) action next to the rename pencil on rows and detail
       headers. Resting state stays neutral so the row doesn't read as
       alarming; the danger tone only appears on hover / focus. */
    .icon-btn--danger:hover:not(:disabled) {
      border-color: var(--error-color, #db4437);
      background: color-mix(in srgb, var(--error-color, #db4437) 10%, var(--ha-card-background, var(--card-background-color)));
      color: var(--error-color, #db4437);
    }
    .quick-access-head-main {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .quick-access-add-btn {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: var(--backup-radius-md);
      border: 1px solid color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
      color: var(--primary-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease;
    }
    .quick-access-add-btn:hover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 16%, transparent);
    }
    .quick-access-add-btn ha-icon { --mdc-icon-size: 16px; }
    .quick-access-head-actions {
      display: inline-flex;
      gap: 8px;
      flex: 0 0 auto;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .power-device-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
    }
    .power-device-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .power-device-controls {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .power-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1 1 160px;
    }
    .power-field--delay { flex: 0 1 120px; }
    .power-field-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .power-device-controls .decoded-field-input { font-size: 13px; }
    .quick-access-section {
      display: grid;
      gap: 12px;
      scroll-margin-top: 16px;
    }
    .quick-access-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .quick-access-title {
      color: var(--primary-text-color);
      font-size: 14px;
      font-weight: 700;
    }
    .quick-access-sub {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.45;
    }
    .quick-access-list {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-lg);
      background: var(--ha-card-background, var(--card-background-color));
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* Lists whose rows open absolutely-positioned overlay menus (role
       pickers, idle-behavior pickers). overflow:hidden would clip the
       popups at the list edge, so these opt into visible overflow; the
       footer row carries its own corner radius instead. */
    .quick-access-list--overlays {
      overflow: visible;
    }
    .quick-access-sortable {
      display: block;
    }
    .quick-access-sortable-container {
      display: block;
    }
    .quick-access-sortable-item {
      display: block;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      user-select: none;
      -webkit-user-select: none;
    }
    .quick-access-sortable-item:first-child {
      border-top: none;
    }
    .quick-access-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
    }
    /* Variant for rows that don't carry a drag handle (e.g. Device commands,
       which have no concept of ordering). Drop the leading column so the
       label sits flush with the row padding. */
    .quick-access-row--no-drag {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .quick-access-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .quick-access-label-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .quick-access-label {
      min-width: 0;
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .quick-access-chip {
      flex: 0 0 auto;
      border-radius: var(--backup-radius-pill);
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      border: 1px solid var(--divider-color);
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 74%, transparent);
    }
    .quick-access-meta {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.4;
    }
    .quick-access-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    /* Inline per-row wait control: the delay that trails this command.
       The "Delay" caption stacks above the number inside the same bordered
       pill so the label and field read as one piece. The caption is tiny
       and the pill stays shorter than the row, so it adds no row height. */
    .step-wait {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      flex: 0 0 auto;
      padding: 2px 6px 3px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 60%, transparent);
      cursor: text;
    }
    .step-wait:focus-within {
      border-color: var(--primary-color);
    }
    .step-wait-caption {
      font-size: 9px;
      line-height: 1;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      pointer-events: none;
    }
    .step-wait-field {
      display: inline-flex;
      align-items: baseline;
      gap: 3px;
    }
    .step-wait-input {
      width: 42px;
      min-width: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      text-align: right;
      outline: none;
      -moz-appearance: textfield;
    }
    .step-wait-input::-webkit-outer-spin-button,
    .step-wait-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .step-wait-unit {
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 600;
    }
    .quick-access-drag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      touch-action: none;
    }
    .quick-access-drag:active {
      cursor: grabbing;
    }
    .quick-access-empty {
      border: 1px dashed color-mix(in srgb, var(--divider-color) 88%, transparent);
      border-radius: var(--backup-radius-md);
      padding: 12px 14px;
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 54%, transparent);
    }
    .dialog-btn {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 8px 12px;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .dialog-btn:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
    }
    .dialog-btn-primary {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    }
    .dialog-btn-danger {
      border-color: var(--error-color, #db4437);
      color: var(--error-color, #db4437);
      background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
    }
    .dialog-btn-danger:hover:not(:disabled) {
      background: color-mix(in srgb, var(--error-color, #db4437) 18%, transparent);
    }
    .dialog-btn:disabled { opacity: 0.45; cursor: default; }
    .delete-impact-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .delete-impact-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: var(--primary-text-color);
    }
    .delete-impact-list ha-icon {
      --mdc-icon-size: 18px;
      color: var(--secondary-text-color);
      flex: 0 0 auto;
    }
    .delete-replace-note {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--secondary-text-color);
      line-height: 1.45;
    }
    .delete-replace-note ha-icon { --mdc-icon-size: 16px; flex: 0 0 auto; }
    select.decoded-field-input { cursor: pointer; }
    .binding-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .binding-static-field {
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
      padding: 8px 10px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 54%, transparent);
    }
    .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
    .dialog { width: min(760px, calc(100vw - 36px)); max-height: min(82vh, 900px); display: flex; flex-direction: column; border-radius: var(--backup-radius-lg); border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); overflow: hidden; }
    .dialog.small { width: min(500px, calc(100vw - 36px)); }
    .dialog.medium { width: min(640px, calc(100vw - 36px)); }
    /* "Advanced" foldout that wraps the structured-payload form
       inside the Change Command dialog. Mirrors the Wifi Commands
       command-config popup so the affordance reads the same way
       across the card. */
    .advanced-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 6px;
      padding-top: 10px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
    }
    .advanced-toggle {
      width: fit-content;
      border: 0;
      background: transparent;
      color: var(--secondary-text-color);
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-align: left;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
    }
    .advanced-toggle:hover { color: var(--primary-text-color); }
    .advanced-toggle-copy { display: block; }
    .advanced-toggle ha-icon { --mdc-icon-size: 18px; transition: transform 120ms ease; }
    .advanced-toggle.expanded ha-icon { transform: rotate(180deg); }
    .advanced-panel { display: grid; gap: 14px; padding-top: 2px; }
    .decoded-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .decoded-form-head { display: flex; flex-direction: column; gap: 2px; }
    .decoded-form-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
    }
    .decoded-form-sub {
      font-size: 12px;
      color: var(--secondary-text-color);
      line-height: 1.4;
    }
    .decoded-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .decoded-field-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .decoded-field-input {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      font-size: 13px;
      color: var(--primary-text-color);
      background: var(--ha-color-form-background, var(--secondary-background-color));
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 8px 10px;
    }
    .decoded-field-input:focus {
      outline: none;
      border-color: var(--primary-color);
    }
    .decoded-field-input--multiline {
      font-family: var(--code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
      resize: vertical;
      min-height: 60px;
      white-space: pre;
    }
    /* Escaped wire-string fields are conceptually one long string with
       visible \\n escapes. Wrap on the textarea edge rather than
       overflowing horizontally, and break long URL-like tokens so the
       string never runs off the right side. */
    .decoded-field-input--escaped {
      white-space: pre-wrap;
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .decoded-field-helper {
      font-size: 11px;
      color: var(--secondary-text-color);
      line-height: 1.35;
    }
    .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .dialog-header { border-bottom: 1px solid var(--divider-color); }
    .dialog-title { font-size: 16px; flex: 1; color: var(--primary-text-color); }
    .dialog-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
      --ha-color-form-background: var(
        --input-fill-color,
        var(
          --secondary-background-color,
          color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black)
        )
      );
      --ha-color-form-background-hover: var(--ha-color-form-background);
    }
    .dialog-body ha-input,
    .dialog-body ha-textfield {
      width: 100%;
    }
    .dialog-body ha-input {
      --ha-input-padding-top: 0;
      --ha-input-padding-bottom: 0;
    }
    .dialog-footer { border-top: 1px solid var(--divider-color); justify-content: space-between; }
    .dialog-footer-actions { display: flex; gap: 8px; }
    .dialog-footer-note { min-height: 18px; font-size: 13px; color: var(--error-color, #db4437); }

    .status-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.45;
      color: var(--secondary-text-color);
    }
    .status-box.success {
      color: #2e7d32;
      border-color: color-mix(in srgb, #2e7d32 35%, var(--divider-color));
      background: color-mix(in srgb, #2e7d32 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-box.error {
      color: var(--error-color, #db4437);
      border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--error-color, #db4437) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-box.warning {
      border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-icon { display: inline-flex; color: inherit; flex: 0 0 auto; }
    .status-icon ha-icon { --mdc-icon-size: 18px; }

    .action-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: center; }
    .primary-btn, .secondary-btn {
      border-radius: var(--backup-radius-md);
      padding: 10px 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .primary-btn {
      border: 1px solid color-mix(in srgb, var(--primary-color) 65%, var(--divider-color));
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-color) 16%, var(--ha-card-background, var(--card-background-color)));
    }
    .secondary-btn {
      border: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      background: transparent;
    }
    .primary-btn:hover:not(:disabled), .secondary-btn:hover:not(:disabled) { transform: translateY(-1px); }
    .primary-btn:disabled, .secondary-btn:disabled { opacity: 0.48; cursor: default; transform: none; }

    .file-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--backup-radius-pill);
      border: 1px solid var(--divider-color);
      font-size: 12px;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
    }

    .backup-complete-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 10px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--divider-color));
      border-radius: var(--backup-radius-xl);
      padding: 28px 18px;
      background:
        radial-gradient(circle at top, color-mix(in srgb, var(--primary-color) 14%, transparent), transparent 44%),
        color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, transparent);
    }
    .backup-complete-icon {
      width: 64px;
      height: 64px;
      display: grid;
      place-items: center;
      border-radius: var(--backup-radius-pill);
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    }
    .backup-complete-icon ha-icon { --mdc-icon-size: 30px; }
    .backup-complete-title {
      color: var(--primary-text-color);
      font-size: 20px;
      font-weight: 700;
    }
    .backup-complete-sub {
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
    }

    .backup-downloaded-note,
    .backup-expired-note {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      font-size: 12px;
      font-weight: 600;
    }
    .backup-downloaded-note {
      color: var(--success-color, #43a047);
    }
    .backup-expired-note {
      color: var(--warning-color, #ff9800);
    }
    .backup-downloaded-note ha-icon,
    .backup-expired-note ha-icon {
      --mdc-icon-size: 16px;
    }

    .mode-option-btn {
      width: 100%;
      min-width: 0;
      min-height: 36px;
      border: none;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      padding: 8px 14px;
    }
    .restore-action-row {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 10px;
      flex-wrap: nowrap;
      min-width: 0;
    }
    .restore-action-row .primary-btn { flex: 0 0 auto; }
    .filename-btn {
      flex: 1 1 0;
      min-width: 0;
      max-width: 100%;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    input[type="file"] { display: none; }

    /* Compact hub-name row on the Edit overview. Hub name is only
       applied at restore time when the user chooses to wipe the hub,
       so it earns a single thin row instead of its own card. */
    .edit-hub-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: var(--backup-radius-sm);
      border: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 96%, black);
      font-size: 13px;
      min-width: 0;
    }
    .edit-hub-name-label {
      flex: 0 0 auto;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--secondary-text-color);
    }
    .edit-hub-name-value {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--primary-text-color);
    }
    .edit-hub-name-row .icon-btn {
      flex: 0 0 auto;
      padding: 2px;
    }
    .edit-hub-name-row .icon-btn ha-icon { --mdc-icon-size: 18px; }

    /* Unsaved-changes indicators.
       .edit-unsaved-chip is the compact pill used in the detail
       sticky-header next to the title. .edit-unsaved-banner is the
       wider notice on the overview page above the action row.
       .primary-btn--unsaved decorates the Download button with a
       dot when there are pending edits. */
    .edit-unsaved-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
      padding: 2px 8px 2px 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-radius: 999px;
      color: var(--warning-color, #f59e0b);
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 16%, transparent);
      border: 1px solid color-mix(in srgb, var(--warning-color, #f59e0b) 35%, transparent);
    }
    .edit-unsaved-chip::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--warning-color, #f59e0b);
    }
    .edit-unsaved-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--backup-radius-sm);
      border: 1px solid color-mix(in srgb, var(--warning-color, #f59e0b) 35%, transparent);
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 10%, transparent);
      color: var(--primary-text-color);
      font-size: 13px;
      line-height: 1.4;
    }
    .edit-unsaved-banner ha-icon {
      --mdc-icon-size: 18px;
      color: var(--warning-color, #f59e0b);
      flex: 0 0 auto;
    }
    .primary-btn--unsaved::after {
      content: "";
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-left: 8px;
      border-radius: 50%;
      background: var(--warning-color, #f59e0b);
      vertical-align: middle;
    }

    @media (max-width: 380px) {
      .backup-scope-options { grid-template-columns: 1fr; }
      .backup-scope-option + .backup-scope-option {
        border-left: none;
        border-top: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      }
      .quick-access-row {
        grid-template-columns: auto minmax(0, 1fr) auto;
      }
      .quick-access-actions {
        justify-content: flex-end;
      }
      .edit-field-row,
      .restore-action-row {
        align-items: stretch;
        flex-direction: column;
      }
      .detail-title-actions {
        gap: 6px;
        min-width: max-content;
      }
      .detail-section-nav {
        overflow-x: auto;
        scrollbar-width: none;
      }
      .detail-section-nav::-webkit-scrollbar {
        display: none;
      }
      .detail-section-nav-btn {
        flex-basis: auto;
        min-width: max-content;
        padding-inline: 12px;
      }
      .restore-action-row > .primary-btn,
      .restore-action-row > .secondary-btn {
        width: 100%;
      }
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog.small {
        width: min(100vw, 100%);
        max-height: calc(100vh - max(env(safe-area-inset-top), 8px));
        border-radius: var(--backup-radius-xl) var(--backup-radius-xl) 0 0;
      }
      .dialog-footer {
        flex-direction: column;
        align-items: stretch;
      }
      .dialog-footer-actions {
        width: 100%;
      }
      .dialog-footer-actions .dialog-btn {
        flex: 1 1 0;
      }
      .dialog-footer-note {
        min-height: 0;
      }
    }
`;
