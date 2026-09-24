// The HA card's "blocked by firmware" panel for a whole tab (its
// `availabilityFor` for Wifi Commands and Backup): the hub reports firmware
// below the library's supported floor, where writes are ACKed and dropped,
// so the tab shows this in place of its content until the hub reports a
// newer version. The entity editors render their own guard screen with the
// same verdict (`firmwareFloor`).

import { css, html, type TemplateResult } from "lit";
import { mdiChip } from "@mdi/js";

import type { FirmwareFloor } from "../panel-selectors";

export const FIRMWARE_BLOCK_STRINGS = {
  body: (installed: number | string, required: number | string) =>
    `This hub is running firmware version ${installed}. Version ${required} or newer is required for features that change the hub configuration, because older firmware accepts the writes and silently discards them. Update the hub using the Sofabaton app. This tab becomes available automatically after the hub reports the updated firmware version.`,
};

export const FIRMWARE_BLOCK_CSS = css`
  .firmware-block { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 32px 16px; text-align: center; color: var(--sbp-muted); line-height: 1.55; }
  .firmware-block-icon { color: var(--sbp-muted); }
  .firmware-block-icon .mdi { width: 40px; height: 40px; }
  .firmware-block-title { color: var(--sbp-text); font-size: 16px; font-weight: 700; }
  .firmware-block-body { max-width: 420px; font-size: 13px; }
`;

/** The block for one tab: `title` is the card's "Automation unavailable" / "Backup unavailable". */
export function renderFirmwareBlock(floor: FirmwareFloor, title: string, id: string): TemplateResult {
  return html`
    <div class="firmware-block" id=${id} role="status">
      <div class="firmware-block-icon"><svg class="mdi" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${mdiChip}></path></svg></div>
      <div class="firmware-block-title">${title}</div>
      <div class="firmware-block-body">${FIRMWARE_BLOCK_STRINGS.body(floor.installed, floor.required)}</div>
    </div>
  `;
}
