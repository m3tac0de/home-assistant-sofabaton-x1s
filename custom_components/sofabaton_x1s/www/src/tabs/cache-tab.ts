import { html } from "lit";
import { renderSecondaryPanel, renderSecondaryTabShell } from "../components/secondary-tab";
import type { CacheHubState, SectionId } from "../shared/ha-context";
import {
  activityButtons,
  activityFavorites,
  activityMacros,
  buttonName,
  deviceClassIcon,
  deviceCommands,
  hubActivities,
  hubDevices,
} from "../shared/utils/control-panel-selectors";
import { TOOLS_CARD_STRINGS } from "../strings";

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
  selectedSection: SectionId;
  openEntity: string | null;
  selectedHubProxyConnected: boolean;
  enablingPersistentCache: boolean;
  onEnablePersistentCache: () => void;
  onRefreshStale: () => void;
  onSelectSection: (sectionId: SectionId) => void;
  onToggleEntity: (key: string) => void;
  onRefreshSection: (sectionId: SectionId) => void;
  onRefreshEntry: (kind: "activity" | "device", targetId: number, key: string) => void;
  // Whole-hub structural cache refresh ("Refresh all" in the panel header).
  refreshAllSpinning: boolean;
  onRefreshAll: () => void;
  // Opens the live activity editor for one activity (wrench button).
  onEditActivity: (activityId: number) => void;
}) {
  if (params.loading) return html`<div class="cache-state">${TOOLS_CARD_STRINGS.cache.loading}</div>`;
  if (params.error) return html`<div class="cache-state error">${params.error}</div>`;
  if (!params.persistentCacheEnabled) {
    return html`
      <div class="cache-state cache-enable-state">
        <div class="cache-enable-icon"><ha-icon icon="mdi:database-cog-outline"></ha-icon></div>
        <div class="cache-state-title">${TOOLS_CARD_STRINGS.cache.persistentCacheOffTitle}</div>
        <div class="cache-state-sub">${TOOLS_CARD_STRINGS.cache.persistentCacheOffCopy}</div>
        <button
          class="cache-enable-btn"
          ?disabled=${params.enablingPersistentCache || params.hubCommandBusy}
          @click=${params.onEnablePersistentCache}
        >
          <ha-icon icon="mdi:database-check-outline"></ha-icon>
          <span>${params.enablingPersistentCache ? TOOLS_CARD_STRINGS.cache.enablingPersistentCache : TOOLS_CARD_STRINGS.cache.enablePersistentCache}</span>
        </button>
      </div>
    `;
  }
  if (!params.hub) return html`<div class="cache-state">${TOOLS_CARD_STRINGS.cache.noHubsFound}</div>`;

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
          <span class="entity-name">
            <span class="entity-name-label">${activity.name || TOOLS_CARD_STRINGS.cache.activityFallback(id)}</span>
          </span>
          <span class="entity-meta">
            ${badge(TOOLS_CARD_STRINGS.cache.devIdBadge, id)}
            <span class="entity-count entity-count--activity">${TOOLS_CARD_STRINGS.cache.activityCounts(favorites.length, macros.length, buttons.length)}</span>
            <button class="icon-btn" title=${TOOLS_CARD_STRINGS.cache.editActivity} ?disabled=${locked} @click=${(event: Event) => { event.stopPropagation(); params.onEditActivity(id); }}><ha-icon icon="mdi:wrench"></ha-icon></button>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${(event: Event) => { event.stopPropagation(); params.onRefreshEntry("activity", id, key); }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            <span class="entity-chevron">▼</span>
          </span>
        </div>
        ${isOpen ? html`<div class="entity-body">
          ${favorites.length ? html`<div class="inner-section-label">${TOOLS_CARD_STRINGS.cache.favorites}</div>${favorites.map((favorite) => html`<div class="inner-row"><span class="inner-label">${favorite.label || TOOLS_CARD_STRINGS.cache.favoriteFallback(favorite.command_id)}</span><span class="inner-badges">${badge(TOOLS_CARD_STRINGS.cache.favIdBadge, favorite.button_id)}${badge(TOOLS_CARD_STRINGS.cache.devIdBadge, favorite.device_id)}${badge(TOOLS_CARD_STRINGS.cache.comIdBadge, favorite.command_id)}</span></div>`)}` : null}
          ${macros.length ? html`<div class="inner-section-label">${TOOLS_CARD_STRINGS.cache.macros}</div>${macros.map((macro) => html`<div class="inner-row"><span class="inner-label">${macro.label || macro.name || TOOLS_CARD_STRINGS.cache.macroFallback(macro.command_id)}</span><span class="inner-badges">${badge(TOOLS_CARD_STRINGS.cache.favIdBadge, macro.command_id)}${badge(TOOLS_CARD_STRINGS.cache.comIdBadge, macro.command_id)}</span></div>`)}` : null}
          ${buttons.length ? html`<div class="inner-section-label">${TOOLS_CARD_STRINGS.cache.buttons}</div><div class="buttons-grid">${[buttons.slice(0, Math.ceil(buttons.length / 2)), buttons.slice(Math.ceil(buttons.length / 2))].map((column) => html`<div class="buttons-col">${column.map((buttonId) => html`<div class="inner-row"><span class="inner-label">${buttonName(buttonId)}</span><span class="inner-badges">${badge(TOOLS_CARD_STRINGS.cache.comIdBadge, buttonId)}</span></div>`)}</div>`)}</div>` : null}
          ${!favorites.length && !macros.length && !buttons.length ? html`<div class="inner-empty">${TOOLS_CARD_STRINGS.cache.noCachedData}</div>` : null}
        </div>` : null}
      </div>
    `;
  };

  const renderDevice = (device: {
    id: number;
    name?: string;
    command_count?: number;
    device_class?: string;
  }) => {
    const id = Number(device.id);
    const key = `dev-${id}`;
    const isOpen = params.openEntity === key;
    const locked = params.hubCommandBusy || params.selectedHubProxyConnected;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const commands = deviceCommands(params.hub, id);
    const icon = deviceClassIcon(device.device_class);
    return html`
      <div class="entity-block${isOpen ? " open" : ""}" id=${`entity-${key}`}>
        <div class="entity-summary" @click=${() => params.onToggleEntity(key)}>
          <span class="entity-name">
            <span class="entity-name-icon"><ha-icon icon=${icon}></ha-icon></span>
            <span class="entity-name-label">${device.name || TOOLS_CARD_STRINGS.cache.deviceFallback(id)}</span>
          </span>
          <span class="entity-meta">
            ${badge(TOOLS_CARD_STRINGS.cache.devIdBadge, id)}
            <span class="entity-count">${TOOLS_CARD_STRINGS.cache.deviceCommandCount(Number(device.command_count || 0))}</span>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${(event: Event) => { event.stopPropagation(); params.onRefreshEntry("device", id, key); }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            <span class="entity-chevron">▼</span>
          </span>
        </div>
        ${isOpen ? html`<div class="entity-body">${commands.length ? commands.map((command) => html`<div class="inner-row"><span class="inner-label">${command.label}</span><span class="inner-badges">${badge(TOOLS_CARD_STRINGS.cache.comIdBadge, command.id)}</span></div>`) : html`<div class="inner-empty">${TOOLS_CARD_STRINGS.cache.noCachedCommands}</div>`}</div>` : null}
      </div>
    `;
  };

  const activities = hubActivities(params.hub);
  const devices = hubDevices(params.hub);
  const selectedSection: SectionId = params.selectedSection;
  const locked = params.hubCommandBusy || params.selectedHubProxyConnected;
  const activeBody = selectedSection === "activities"
    ? activities.map(renderActivity)
    : devices.map(renderDevice);

  return html`
    <div class="tab-panel">
      ${params.staleData ? html`<div class="stale-banner"><span class="stale-banner-text">${TOOLS_CARD_STRINGS.cache.staleBanner}</span><button class="stale-banner-btn" @click=${params.onRefreshStale}>${TOOLS_CARD_STRINGS.cache.refresh}</button></div>` : null}
      ${renderSecondaryTabShell({
        connected: true,
        shellClassName: "cache-panel secondary-view-shell--edge",
        items: [
          { id: "activities", label: TOOLS_CARD_STRINGS.cache.activities, icon: "mdi:play-circle-outline", count: activities.length },
          { id: "devices", label: TOOLS_CARD_STRINGS.cache.devices, icon: "mdi:audio-video", count: devices.length },
        ],
        selectedId: selectedSection,
        onSelect: params.onSelectSection,
        content: renderSecondaryPanel({
          connected: true,
          header: html`
          <div class="secondary-panel-header secondary-panel-header--plain cache-panel-header">
            <span class="flex-spacer"></span>
            <span class="refresh-action">
              <span class="refresh-list-label">${TOOLS_CARD_STRINGS.cache.refreshAll}</span>
              <button class="icon-btn${params.refreshAllSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${params.onRefreshAll}>
                <ha-icon icon="mdi:refresh"></ha-icon>
              </button>
            </span>
            <span class="refresh-action">
              <span class="refresh-list-label">${TOOLS_CARD_STRINGS.cache.refreshList}</span>
              <button class="icon-btn${params.refreshBusy && !params.activeRefreshLabel ? " spinning" : ""}" ?disabled=${locked} @click=${() => params.onRefreshSection(selectedSection)}>
                <ha-icon icon="mdi:refresh"></ha-icon>
              </button>
            </span>
          </div>
          `,
          bodyClassName: "cache-panel-body",
          body: activeBody,
        }),
      })}
    </div>
  `;
}
