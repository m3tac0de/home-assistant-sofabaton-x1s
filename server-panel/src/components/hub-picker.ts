// The hub picker chip (docs/internal/server-panel-state-plan.md, decision
// 10): "Hub · name" in the top dock, a menu of the registered hubs below
// it with their state, and a way to the setup page. Mirrors the HA
// control panel card's picker in structure and class names; static with
// one hub, as there.

import { html, nothing, type TemplateResult } from "lit";
import { mdiChevronDown, mdiChevronUp } from "@mdi/js";

import { hubDisplayName, hubState } from "../panel-state";
import type { HubRuntime } from "../panel-store";

export function renderHubPicker(params: {
  hubs: HubRuntime[];
  selectedHubId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (hubId: string) => void;
  onSetup: () => void;
}): TemplateResult {
  const selected = params.hubs.find((r) => r.hub.hub_id === params.selectedHubId) ?? null;
  const label = selected ? hubDisplayName(selected.hub) : params.hubs.length ? "pick a hub" : "no hub";
  const tone = selected ? hubState(selected.hub).tone : "off";
  const interactive = params.hubs.length > 1 || (!selected && params.hubs.length > 0);
  if (!interactive) {
    return html`
      <div class="hub-picker hub-picker--static" id="hub-picker">
        <div class="hub-picker-btn hub-picker-btn--static" id="hub-picker-btn" title=${selected ? `${label} · ${selected.hub.hub_id}` : "register a hub under the cog menu"}>
          <span class="chip-prefix">Hub</span><span class="dot ${tone}"></span><span class="chip-name">${label}</span>
        </div>
      </div>
    `;
  }
  return html`
    <div class="hub-picker" id="hub-picker">
      <button class="hub-picker-btn ${params.open ? "is-open" : ""}" id="hub-picker-btn" type="button" title=${label} aria-haspopup="menu" aria-expanded=${String(params.open)} @click=${params.onToggle}>
        <span class="chip-prefix">Hub</span><span class="dot ${tone}"></span><span class="chip-name">${label}</span><svg class="chip-arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${params.open ? mdiChevronUp : mdiChevronDown}></path></svg>
      </button>
      ${params.open
        ? html`<div class="menu hub-picker-menu" id="hub-picker-menu" role="menu">
            ${params.hubs.map(({ hub }) => {
              const { text, tone: t } = hubState(hub);
              return html`<button class="menu-item hub-option ${hub.hub_id === params.selectedHubId ? "selected" : ""}" type="button" role="menuitemradio" data-hub=${hub.hub_id} aria-checked=${String(hub.hub_id === params.selectedHubId)} @click=${() => params.onSelect(hub.hub_id)}>
                <span class="dot ${t}"></span><span class="menu-main"><span class="menu-title">${hubDisplayName(hub)}</span><span class="menu-sub">${hub.config.host} · ${text}</span></span>
              </button>`;
            })}
            <div class="menu-sep"></div>
            <button class="menu-item" type="button" role="menuitem" id="hub-picker-setup" @click=${params.onSetup}><span class="menu-main"><span class="menu-title">Hub setup…</span></span></button>
          </div>`
        : nothing}
    </div>
  `;
}
