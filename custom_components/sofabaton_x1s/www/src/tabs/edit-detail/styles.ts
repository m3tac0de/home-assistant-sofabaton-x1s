// The edit-detail view's own styles (R6, CR-F2-14); the shared tab styles stay in backup-tab-styles.

import { css } from "lit";

export const editDetailViewStyles = css`
    :host {
      flex-direction: column;
    }
    /* Read-only delivery badge of the Wifi Events device; the same pill the
       Wifi Commands tab shows. */
    .transport-pill { display: inline-flex; align-items: center; align-self: center; border-radius: 999px; padding: 3px 9px; font-size: 10px; font-weight: 700; letter-spacing: 0.4px; border: 1px solid var(--divider-color); color: var(--secondary-text-color); background: var(--ha-card-background, var(--card-background-color)); white-space: nowrap; flex: 0 0 auto; }
    .transport-pill.mqtt { border-color: color-mix(in srgb, var(--primary-color) 40%, var(--divider-color)); color: var(--primary-color); }
    .transport-pill.pending { border-style: dashed; }
    /* The same pill as a two-option select (the delivery switch). */
    select.transport-select { appearance: none; -webkit-appearance: none; cursor: pointer; font: inherit; font-size: 10px; font-weight: 700; letter-spacing: 0.4px; line-height: normal; padding-right: 20px; background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%); background-position: calc(100% - 11px) 55%, calc(100% - 7px) 55%; background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; }
    select.transport-select:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    /* Glanceable member roster under the Activity power-sequence rows. */
    .power-members-summary {
      padding: 8px 4px 0;
    }
    /* Live-mode header Sync button — styled identically to the Wifi command
       editor's .detail-sync-btn (primary when there are pending changes, a
       green "up to date" disabled state when clean). */
    .detail-sync-btn {
      border: 1px solid var(--divider-color);
      border-radius: calc(var(--ha-card-border-radius, 12px) * 0.85);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
      white-space: nowrap;
      transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease;
    }
    .detail-sync-btn:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .detail-sync-btn.sync-btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .detail-sync-btn:disabled {
      cursor: default;
      opacity: 0.42;
      color: var(--disabled-text-color, var(--secondary-text-color));
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .detail-sync-btn:disabled:hover { border-color: color-mix(in srgb, var(--divider-color) 88%, transparent); }
    .detail-sync-btn.detail-sync-btn--state-ok,
    .detail-sync-btn.detail-sync-btn--state-ok:disabled {
      border-color: color-mix(in srgb, #48b851 45%, var(--divider-color));
      background: color-mix(in srgb, #48b851 14%, var(--ha-card-background, var(--card-background-color)));
      color: color-mix(in srgb, #2e7d32 40%, var(--primary-text-color));
      opacity: 1;
    }
    /* Spinner used on the live "fetch payload" command-row button. */
    @keyframes sb-spin { to { transform: rotate(360deg); } }
    ha-icon.sb-spin { animation: sb-spin 720ms linear infinite; }
    /* Inline status line (fetch error + in-dialog Test result). */
    .section-status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      padding: 8px 12px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, 10px);
      font-size: 13px;
      line-height: 1.4;
      color: var(--secondary-text-color);
    }
    .section-status ha-icon { --mdc-icon-size: 18px; flex: 0 0 auto; }
    .section-status.error {
      color: var(--error-color, #db4437);
      border-color: color-mix(in srgb, var(--error-color, #db4437) 30%, var(--divider-color));
      background: color-mix(in srgb, var(--error-color, #db4437) 6%, var(--ha-card-background, var(--card-background-color)));
    }
    .payload-test-status.success {
      color: color-mix(in srgb, #2e7d32 40%, var(--primary-text-color));
      border-color: color-mix(in srgb, #2e7d32 30%, var(--divider-color));
      background: color-mix(in srgb, #2e7d32 6%, var(--ha-card-background, var(--card-background-color)));
    }
    .payload-test-btn { display: inline-flex; align-items: center; gap: 6px; margin-right: auto; }
    /* Payload dialog footer: docs link bottom-left on the Cancel/Save row,
       styled like the control panel's bottom-dock documentation links. */
    .payload-doc-link {
      color: var(--sb-accent-text, var(--primary-color));
      text-decoration: underline;
      text-decoration-color: var(--primary-color);
      font-weight: 400;
      font-size: 13px;
      white-space: nowrap;
    }
    .payload-doc-link:hover { color: var(--primary-text-color); text-decoration: underline; }
    .payload-dialog-note { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; }
    .payload-test-btn ha-icon { --mdc-icon-size: 16px; }
    /* Device-class indicator in the payload dialog header. */
    .dialog-title-group { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
    .dialog-title-group .dialog-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .payload-class-badge {
      flex: 0 0 auto;
      font-family: var(--code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      padding: 2px 9px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 40%, var(--divider-color));
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    /* Payload-editor learn mode (IR9): entry button, source menu, hub
       listener stage, and the emitter inbox. */
    .payload-learn-btn {
      margin-left: auto; align-self: center; flex: 0 0 auto;
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 11px; border-radius: 999px; cursor: pointer; font: inherit;
      font-size: 12px; font-weight: 600; letter-spacing: 0.02em;
      color: var(--sb-accent-text, var(--primary-color));
      border: 1px solid color-mix(in srgb, var(--primary-color) 45%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    }
    .payload-learn-btn:hover { background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .payload-learn-btn ha-icon { --mdc-icon-size: 16px; }
    .learn-panel { display: flex; flex-direction: column; gap: 12px; }
    .learn-option, .learn-inbox-row {
      display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
      border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 10px);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color); cursor: pointer; font: inherit;
    }
    .learn-option { padding: 12px 14px; }
    .learn-option:hover, .learn-inbox-row:hover {
      border-color: color-mix(in srgb, var(--primary-color) 45%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 6%, var(--ha-card-background, var(--card-background-color)));
    }
    .learn-option > ha-icon:first-child { --mdc-icon-size: 26px; color: var(--primary-color); flex: 0 0 auto; }
    .learn-option > ha-icon:last-child { --mdc-icon-size: 20px; color: var(--secondary-text-color); flex: 0 0 auto; }
    .learn-option-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .learn-option-title { font-weight: 600; font-size: 14px; }
    .learn-option-desc { font-size: 12.5px; line-height: 1.4; color: var(--secondary-text-color); }
    .learn-checking { font-size: 12.5px; color: var(--secondary-text-color); padding: 2px 4px; }
    .learn-stage {
      display: flex; align-items: center; gap: 14px; padding: 18px 16px;
      border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 10px);
    }
    .learn-stage > ha-icon { --mdc-icon-size: 34px; color: var(--primary-color); flex: 0 0 auto; }
    .learn-stage.listening > ha-icon { animation: sb-learn-pulse 1.4s ease-in-out infinite; }
    .learn-stage.timed_out > ha-icon, .learn-stage.interrupted > ha-icon,
    .learn-stage.refused > ha-icon, .learn-stage.error > ha-icon { color: var(--error-color, #db4437); }
    .learn-stage.cancelled > ha-icon { color: var(--secondary-text-color); }
    @keyframes sb-learn-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.55; transform: scale(0.92); } }
    .learn-stage-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .learn-stage-title { font-size: 14px; font-weight: 600; line-height: 1.4; }
    .learn-stage-detail { font-size: 13px; color: var(--secondary-text-color); line-height: 1.4; font-variant-numeric: tabular-nums; }
    .learn-inbox-help { font-size: 13px; line-height: 1.5; color: var(--secondary-text-color); }
    .learn-consumers { display: flex; flex-direction: column; gap: 6px; }
    .learn-consumers-label { font-size: 11.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--secondary-text-color); }
    .learn-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .learn-chip {
      font-size: 12px; padding: 3px 10px; border-radius: 999px; color: var(--primary-text-color);
      border: 1px solid color-mix(in srgb, var(--primary-color) 40%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    }
    .learn-inbox-list { display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow-y: auto; }
    .learn-inbox-row { padding: 10px 12px; }
    .learn-inbox-row.is-new {
      border-color: color-mix(in srgb, #48b851 55%, var(--divider-color));
      background: color-mix(in srgb, #48b851 8%, var(--ha-card-background, var(--card-background-color)));
    }
    .learn-inbox-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .learn-inbox-label {
      font-family: var(--code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .learn-inbox-meta { font-size: 12px; color: var(--secondary-text-color); }
    .learn-badge {
      flex: 0 0 auto; font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      padding: 2px 7px; border-radius: 999px; color: color-mix(in srgb, #2e7d32 40%, var(--primary-text-color));
      border: 1px solid color-mix(in srgb, #2e7d32 45%, transparent);
    }
    .learn-inbox-use { flex: 0 0 auto; font-size: 12.5px; font-weight: 600; color: var(--sb-accent-text, var(--primary-color)); }
    .learn-inbox-empty {
      display: flex; align-items: center; gap: 10px; padding: 16px 12px;
      border: 1px dashed var(--divider-color); border-radius: var(--ha-card-border-radius, 10px);
      color: var(--secondary-text-color); font-size: 13px;
    }
    .learn-inbox-empty ha-icon { --mdc-icon-size: 22px; }
    .managed-wifi-lock { padding: 20px 16px; display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
    .managed-wifi-lock-chip {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 6px 12px; border-radius: 999px;
      font-size: 13px; font-weight: 600;
      color: var(--sb-accent-text, var(--primary-color));
      border: 1px solid color-mix(in srgb, var(--primary-color) 45%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    .managed-wifi-lock-chip ha-icon { --mdc-icon-size: 18px; }
    .managed-wifi-lock-copy { margin: 0; color: var(--secondary-text-color); font-size: 14px; line-height: 1.5; max-width: 46ch; }
  `;
