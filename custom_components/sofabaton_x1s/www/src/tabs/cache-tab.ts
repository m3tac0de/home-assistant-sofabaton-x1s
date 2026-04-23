import { html } from "lit";
import type { CacheHubState, SectionId } from "../shared/ha-context";
import { activityButtons, activityFavorites, activityMacros, buttonName, deviceCommands, hubActivities, hubDevices } from "../shared/utils/control-panel-selectors";
import { renderAccordionSection } from "../components/accordion-section";

function badge(type: string, value: string | number) {
  return html`<span class="id-badge"><span>${type}:</span><span>${String(value)}</span></span>`;
}

export function renderCacheTab(params: {
  loading: boolean;
  error: string | null;
  hub: CacheHubState | null;
  persistentCacheEnabled: boolean;
  staleData: boolean;
  refreshBusy: boolean;
  hubCommandBusy: boolean;
  activeRefreshLabel: string | null;
  openSection: SectionId | null;
  openEntity: string | null;
  selectedHubProxyConnected: boolean;
  onRefreshStale: () => void;
  onToggleSection: (sectionId: SectionId) => void;
  onToggleEntity: (key: string) => void;
  onRefreshSection: (sectionId: SectionId) => void;
  onRefreshEntry: (kind: "activity" | "device", targetId: number, key: string) => void;
}) {
  if (params.loading) return html`<div class="cache-state">Loading…</div>`;
  if (params.error) return html`<div class="cache-state error">${params.error}</div>`;
  if (!params.persistentCacheEnabled) return html`<div class="cache-state"><div class="cache-state-icon">💾</div><div class="cache-state-title">Persistent cache is off</div><div class="cache-state-sub">Enable it from the Settings tab to browse cached activities and devices.</div></div>`;
  if (!params.hub) return html`<div class="cache-state">No hubs found.</div>`;

  const renderActivity = (activity: { id: number; name?: string; favorite_count?: number; macro_count?: number }) => {
    const id = Number(activity.id);
    const key = `act-${id}`;
    const isOpen = params.openEntity === key;
    const locked = params.hubCommandBusy || params.selectedHubProxyConnected;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const favorites = activityFavorites(params.hub, id);
    const macros = activityMacros(params.hub, id);
    const buttons = activityButtons(params.hub, id);
    return html`
      <div class="entity-block${isOpen ? " open" : ""}" id=${`entity-${key}`}>
        <div class="entity-summary" @click=${() => params.onToggleEntity(key)}>
          <span class="entity-name">${activity.name || `Activity ${id}`}</span>
          <span class="entity-meta">
            ${badge("DevID", id)}
            <span class="entity-count">${favorites.length} favs · ${macros.length} macros · ${buttons.length} btns</span>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${(event: Event) => { event.stopPropagation(); params.onRefreshEntry("activity", id, key); }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            <span class="entity-chevron">▼</span>
          </span>
        </div>
        ${isOpen ? html`<div class="entity-body">
          ${favorites.length ? html`<div class="inner-section-label">Favorites</div>${favorites.map((favorite) => html`<div class="inner-row"><span class="inner-label">${favorite.label || `Favorite ${favorite.command_id}`}</span><span class="inner-badges">${badge("FavID", favorite.button_id)}${badge("DevID", favorite.device_id)}${badge("ComID", favorite.command_id)}</span></div>`)}` : null}
          ${macros.length ? html`<div class="inner-section-label">Macros</div>${macros.map((macro) => html`<div class="inner-row"><span class="inner-label">${macro.label || macro.name || `Macro ${macro.command_id}`}</span><span class="inner-badges">${badge("FavID", macro.command_id)}${badge("ComID", macro.command_id)}</span></div>`)}` : null}
          ${buttons.length ? html`<div class="inner-section-label">Buttons</div><div class="buttons-grid">${[buttons.slice(0, Math.ceil(buttons.length / 2)), buttons.slice(Math.ceil(buttons.length / 2))].map((column) => html`<div class="buttons-col">${column.map((buttonId) => html`<div class="inner-row"><span class="inner-label">${buttonName(buttonId)}</span><span class="inner-badges">${badge("ComID", buttonId)}</span></div>`)}</div>`)}</div>` : null}
          ${!favorites.length && !macros.length && !buttons.length ? html`<div class="inner-empty">No cached data yet.</div>` : null}
        </div>` : null}
      </div>
    `;
  };

  const renderDevice = (device: { id: number; name?: string; command_count?: number }) => {
    const id = Number(device.id);
    const key = `dev-${id}`;
    const isOpen = params.openEntity === key;
    const locked = params.hubCommandBusy || params.selectedHubProxyConnected;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const commands = deviceCommands(params.hub, id);
    return html`
      <div class="entity-block${isOpen ? " open" : ""}" id=${`entity-${key}`}>
        <div class="entity-summary" @click=${() => params.onToggleEntity(key)}>
          <span class="entity-name">${device.name || `Device ${id}`}</span>
          <span class="entity-meta">
            ${badge("DevID", id)}
            <span class="entity-count">${Number(device.command_count || 0)} cmds</span>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${(event: Event) => { event.stopPropagation(); params.onRefreshEntry("device", id, key); }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            <span class="entity-chevron">▼</span>
          </span>
        </div>
        ${isOpen ? html`<div class="entity-body">${commands.length ? commands.map((command) => html`<div class="inner-row"><span class="inner-label">${command.label}</span><span class="inner-badges">${badge("ComID", command.id)}</span></div>`) : html`<div class="inner-empty">No cached commands.</div>`}</div>` : null}
      </div>
    `;
  };

  const activities = hubActivities(params.hub);
  const devices = hubDevices(params.hub);

  return html`
    <div class="tab-panel">
      ${params.staleData ? html`<div class="stale-banner"><span class="stale-banner-text">Cache was updated externally. Refresh to see latest data.</span><button class="stale-banner-btn" @click=${params.onRefreshStale}>Refresh</button></div>` : null}
      <div class="cache-panel">
        ${renderAccordionSection({ sectionId: "activities", title: "Activities", count: activities.length, isOpen: params.openSection === "activities", disabled: params.hubCommandBusy || params.selectedHubProxyConnected, spinning: params.refreshBusy && !params.activeRefreshLabel, onToggle: () => params.onToggleSection("activities"), onRefresh: () => params.onRefreshSection("activities"), body: activities.map(renderActivity) })}
        ${renderAccordionSection({ sectionId: "devices", title: "Devices", count: devices.length, isOpen: params.openSection === "devices", disabled: params.hubCommandBusy || params.selectedHubProxyConnected, spinning: params.refreshBusy && !params.activeRefreshLabel, onToggle: () => params.onToggleSection("devices"), onRefresh: () => params.onRefreshSection("devices"), body: devices.map(renderDevice) })}
      </div>
    </div>
  `;
}
