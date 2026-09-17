// The Backup tab (docs/internal/server-panel-state-plan.md, decision 10):
// a placeholder per subtab until the editor plan builds make, edit and
// restore on the snapshot document. It takes the hub context like every
// hub view, so the blocked scrim and the gates already apply to it.

import { LitElement, html, css, type PropertyValues, type TemplateResult } from "lit";

import type { HubView } from "../panel-api";
import type { HubContext } from "../panel-context";
import { PANEL_BASE_CSS } from "../panel-styles";

export const BACKUP_VIEW_TAG = "sb-panel-backup";

const COPY: Record<string, { title: string; body: string }> = {
  make: { title: "Make a backup", body: "Reads the whole hub into a bundle you can download and restore later. Coming with the editor plan; today `POST /hubs/{hub_id}/backup` in the API console does the same." },
  edit: { title: "Edit a backup", body: "Open a bundle, change devices and activities, and restore or apply the result. Coming with the editor plan." },
  restore: { title: "Restore", body: "Erase the hub and write a bundle back, or apply it in place. Coming with the editor plan; today `POST /hubs/{hub_id}/restore` in the API console does the same." },
};

export class SbPanelBackup extends LitElement {
  static properties = {
    ctx: { attribute: false },
    hub: { attribute: false },
    section: { attribute: false },
  };

  static styles = [PANEL_BASE_CSS, css`:host { display: block; }`];

  ctx: HubContext | null = null;
  hub: HubView | null = null;
  section = "make";

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }

  render(): TemplateResult {
    const copy = COPY[this.section] ?? COPY.make;
    return html`
      <div class="panel" id="backup-placeholder">
        <h2>${copy.title}</h2>
        <div class="hint">${this.hub ? copy.body : "Pick a hub above."}</div>
      </div>
    `;
  }
}

export function defineBackupView(): void {
  if (!customElements.get(BACKUP_VIEW_TAG)) customElements.define(BACKUP_VIEW_TAG, SbPanelBackup);
}
