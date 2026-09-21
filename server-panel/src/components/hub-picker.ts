// Hub selection and registration share one popover. The shell owns API calls
// and guarded selection; this renderer keeps controls out of selectable rows.
import { css, html, nothing, type TemplateResult } from "lit";
import { mdiChevronDown, mdiChevronUp, mdiDotsHorizontal, mdiPlus, mdiRefresh } from "@mdi/js";
import type { HubView, SeenHub } from "../panel-api";
import { formatWhen, hubDisplayName, hubState, unregisteredHubs } from "../panel-state";
import type { HubRuntime } from "../panel-store";

export type HubAction = "enable" | "disable" | "remove";
const icon = (path: string) => html`<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${path}></path></svg>`;

export const HUB_PICKER_CSS = css`
  .hub-picker-menu { width: 350px; }
  .picker-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 10px 4px 14px; min-height: 38px; color: var(--sbp-muted); font-size: 11px; font-weight: 600; }
  .picker-heading-label { text-transform: uppercase; letter-spacing: 0.06em; }
  .picker-row { display: flex; align-items: center; gap: 2px; padding-right: 6px; }
  .picker-row .hub-option { flex: 1; min-width: 0; }
  .picker-row.selected { background: rgba(var(--sbp-accent-rgb), 0.12); }
  .picker-row .menu-item.selected { background: transparent; }
  .picker-icon { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 36px; min-height: 36px; padding: 8px; border: 0; background: transparent; color: var(--sbp-muted); }
  .picker-icon:hover, .picker-icon[aria-expanded="true"] { background: var(--sbp-panel-2); color: var(--sbp-text); }
  .picker-icon svg, .picker-manual-button svg { width: 18px; height: 18px; flex: 0 0 auto; }
  .picker-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 12px 12px; }
  .picker-actions button { min-height: 36px; font-size: 12px; }
  .picker-seen { padding: 7px 10px 7px 14px; gap: 10px; min-height: 54px; }
  .picker-seen .menu-title { font-weight: 500; }
  .picker-seen .small { min-height: 36px; flex: 0 0 auto; color: var(--sbp-accent); }
  .picker-unseen { color: var(--sbp-muted); }
  .picker-empty, .picker-error { margin: 0; padding: 6px 14px 12px; font-size: 12px; line-height: 1.5; }
  .picker-empty { color: var(--sbp-muted); }
  .picker-error { color: var(--sbp-err); overflow-wrap: anywhere; }
  .picker-form { padding: 0 14px 12px; }
  .picker-form label { text-transform: none; letter-spacing: 0; font-size: 12px; }
  .picker-form input:not([type="checkbox"]) { min-height: 40px; }
  .picker-form .inline { margin: 12px 0; }
  .picker-form .hint { margin: 0 0 12px; }
  .picker-form .actions { justify-content: flex-end; }
  @container (max-width: 600px) {
    .hub-picker { position: static; }
    .hub-picker-menu { right: var(--page-gutter); width: min(350px, calc(100cqw - 2 * var(--page-gutter))); max-width: calc(100cqw - 2 * var(--page-gutter)); }
  }
`;

export function renderHubPicker(params: {
  hubs: HubRuntime[];
  seen: SeenHub[];
  selectedHubId: string | null;
  open: boolean;
  manual: boolean;
  actionsHubId: string | null;
  busy: Set<string>;
  adding: boolean;
  scanning: boolean;
  error: string | null;
  onToggle: () => void;
  onSelect: (hubId: string) => void;
  onActions: (hubId: string) => void;
  onAction: (hub: HubView, action: HubAction) => void;
  onAdd: (seen: SeenHub) => void;
  onManual: (show: boolean) => void;
  onSubmit: (event: Event) => void;
  onScan: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}): TemplateResult {
  const selected = params.hubs.find((r) => r.hub.hub_id === params.selectedHubId) ?? null;
  const label = selected ? hubDisplayName(selected.hub) : params.hubs.length ? "pick a hub" : "no hub";
  const tone = selected ? hubState(selected.hub).tone : "off";
  const discovered = unregisteredHubs(params.seen, params.hubs.map((r) => r.hub));
  return html`
    <div class="hub-picker" id="hub-picker" @keydown=${params.onKeyDown}>
      <button class="hub-picker-btn ${params.open ? "is-open" : ""}" id="hub-picker-btn" type="button" title=${label} aria-haspopup="dialog" aria-controls="hub-picker-menu" aria-expanded=${String(params.open)} @click=${params.onToggle}>
        <span class="chip-prefix">Hub</span><span class="dot ${tone}"></span><span class="chip-name">${label}</span><svg class="chip-arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${params.open ? mdiChevronUp : mdiChevronDown}></path></svg>
      </button>
      ${params.open ? html`
        <div class="menu hub-picker-menu" id="hub-picker-menu" role="dialog" aria-label=${params.manual ? "Add hub by address" : "Hubs"}>
          ${params.manual ? html`
            <div class="picker-heading"><span>Add hub by address</span></div>
            <form class="picker-form" id="hub-add" @submit=${params.onSubmit}>
              <label for="add-host">IP address or hostname</label>
              <input id="add-host" name="host" placeholder="192.168.1.50" autocomplete="off" required ?disabled=${params.adding}>
              <label for="add-name">Name (optional)</label>
              <input id="add-name" name="name" autocomplete="off" ?disabled=${params.adding}>
              <label class="inline"><input type="checkbox" id="add-disabled" name="disabled" ?disabled=${params.adding}> Start disabled — connect later</label>
              <p class="hint">If another server or Home Assistant manages this hub, disable it there before connecting here.</p>
              ${params.error ? html`<p class="picker-error" role="alert">${params.error}</p>` : nothing}
              <div class="actions"><button type="button" ?disabled=${params.adding} @click=${() => params.onManual(false)}>Back</button><button class="primary" id="add-send" type="submit" ?disabled=${params.adding}>${params.adding ? "Adding…" : "Add hub"}</button></div>
            </form>
          ` : html`
            <div role="group" aria-label="Registered hubs">
              <div class="picker-heading"><span class="picker-heading-label">Registered hubs</span></div>
              ${params.hubs.length ? params.hubs.map(({ hub }) => {
                const { text, tone: t } = hubState(hub);
                const name = hubDisplayName(hub);
                const active = hub.hub_id === params.selectedHubId;
                const expanded = params.actionsHubId === hub.hub_id;
                const busy = params.busy.has(hub.hub_id);
                return html`
                  <div class="picker-row ${active ? "selected" : ""}">
                    <button class="menu-item hub-option ${active ? "selected" : ""}" type="button" data-hub=${hub.hub_id} aria-pressed=${String(active)} @click=${() => params.onSelect(hub.hub_id)}>
                      <span class="dot ${t}"></span><span class="menu-main"><span class="menu-title">${name}</span><span class="menu-sub" title=${`${hub.config.host} · ${text}`}>${hub.config.host} · ${text}</span></span>
                    </button>
                    <button class="picker-icon" type="button" aria-label=${`Manage ${name}`} aria-expanded=${String(expanded)} @click=${() => params.onActions(hub.hub_id)}>${icon(mdiDotsHorizontal)}</button>
                  </div>
                  ${expanded ? html`<div class="picker-actions" role="group" aria-label=${`Actions for ${name}`}>
                    ${!hub.enabled || !hub.status ? html`<button ?disabled=${busy} @click=${() => params.onAction(hub, "enable")}>${hub.enabled ? "Retry start" : "Enable"}</button>` : nothing}
                    ${hub.enabled ? html`<button ?disabled=${busy} @click=${() => params.onAction(hub, "disable")}>Disable</button>` : nothing}
                    <button class="danger" ?disabled=${busy} @click=${() => params.onAction(hub, "remove")}>Remove…</button>
                  </div>` : nothing}
                `;
              }) : html`<p class="picker-empty">No hubs registered yet.</p>`}
            </div>
            <div class="menu-sep"></div>
            <div role="group" aria-label="Discovered hubs">
              <div class="picker-heading"><span class="picker-heading-label">Discovered hubs</span><span aria-live="polite">${params.scanning ? "Scanning…" : ""}</span><button class="picker-icon" id="seen-scan" type="button" aria-label="Scan for hubs" title="Scan for hubs" ?disabled=${params.scanning} @click=${params.onScan}>${icon(mdiRefresh)}</button></div>
              ${discovered.length ? discovered.map((s) => html`
                <div class="picker-row picker-seen ${s.present ? "" : "picker-unseen"}" data-seen=${s.key}>
                  <span class="menu-main"><span class="menu-title">${s.config.name || s.config.host}</span><span class="menu-sub" title=${`Last seen ${formatWhen(s.last_seen)} · ${s.config.mac || "MAC unknown"}`}>${s.config.host}${s.config.hub_version ? ` · ${s.config.hub_version}` : ""}${s.present ? "" : " · Not currently seen"}</span></span>
                  <button class="small" type="button" aria-label=${`Add ${s.config.name || s.config.host}`} ?disabled=${params.adding} @click=${() => params.onAdd(s)}>Add</button>
                </div>
              `) : html`<p class="picker-empty" id="seen-empty">${params.scanning ? "Looking for hubs on your network…" : "No unregistered hubs found. Close the Sofabaton app if a hub is missing, then scan again."}</p>`}
            </div>
            ${params.error ? html`<p class="picker-error" role="alert">${params.error}</p>` : nothing}
            <div class="menu-sep"></div>
            <button class="menu-item picker-manual-button" type="button" id="hub-picker-manual" ?disabled=${params.adding} @click=${() => params.onManual(true)}>${icon(mdiPlus)}<span class="menu-title">Add by address…</span></button>
          `}
        </div>` : nothing}
    </div>
  `;
}
