import { css } from "lit";

/**
 * The "add a thing" button — a primary-tinted pill with a leading plus icon.
 * Shared so every Add affordance reads the same wherever it appears: the
 * backup / live entity editor (add command, shortcut, macro step, binding)
 * and the Wifi Commands device list (add Wifi Device).
 *
 * The radius matches the `--backup-radius-md` / `--tools-radius-md` locals
 * both hosts define, spelled out here so the rule stands on its own.
 */
export const addButtonStyles = css`
  .quick-access-add-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: var(--ha-card-border-radius, 12px);
    border: 1px solid color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    color: var(--primary-color);
    font: inherit;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: border-color 120ms ease, background 120ms ease;
  }
  .quick-access-add-btn:hover:not(:disabled) {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 16%, transparent);
  }
  .quick-access-add-btn:disabled { opacity: 0.48; cursor: default; }
  .quick-access-add-btn ha-icon { --mdc-icon-size: 16px; }
`;
