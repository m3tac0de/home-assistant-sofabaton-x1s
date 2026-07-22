import { html, nothing } from "lit";
import { renderSecondaryPanel, renderSecondaryTabShell } from "../components/secondary-tab";
import type { CacheHubState, HubClickAction, HubClickItem, SectionId } from "../shared/ha-context";
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

// The id badges name the remote.send_command parameters these values plug
// into (device/command), so they are protocol identifiers and stay
// untranslated — deliberately not in TOOLS_CARD_STRINGS.
const DEV_ID_BADGE = "DevID";
const FAV_ID_BADGE = "FavID";
const COM_ID_BADGE = "ComID";

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
  // Global "Hub Tab Clicks" setting: what clicking an inner drawer row does
  // ("none" keeps the rows inert; "send"/"copy" route through onItemClick).
  clickAction: HubClickAction;
  onItemClick: (item: HubClickItem) => void;
  onRefreshSection: (sectionId: SectionId) => void;
  onRefreshEntry: (kind: "activity" | "device", targetId: number, key: string) => void;
  // Whole-hub structural cache refresh ("Refresh all" in the panel header).
  refreshAllSpinning: boolean;
  onRefreshAll: () => void;
  // Opens the live editor for one activity or device (wrench buttons).
  onEditActivity: (activityId: number) => void;
  onEditDevice: (deviceId: number) => void;
  // Re-order mode ("Change order" under the Activities / Devices list).
  // While active, rows of the reorderKind list render in reorderIds order,
  // become draggable via ha-sortable, and the drawers / per-row actions are
  // locked out.
  reorderMode: boolean;
  reorderKind: "activity" | "device";
  reorderIds: number[];
  reorderSyncing: boolean;
  reorderError: string | null;
  onStartReorder: (kind: "activity" | "device") => void;
  onCancelReorder: () => void;
  onReorderMove: (oldIndex: number, newIndex: number) => void;
  onSyncReorder: () => void;
  // "Add Activity" dialog (name prompt → live editor).
  addActivityOpen: boolean;
  addActivityBusy: boolean;
  addActivityError: string | null;
  onOpenAddActivity: () => void;
  onCloseAddActivity: () => void;
  onConfirmAddActivity: (name: string) => void;
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

  // Inner drawer rows become clickable when the global Hub Tab Clicks
  // setting is "send" or "copy"; with "none" they render exactly as before.
  const rowsClickable = params.clickAction !== "none";
  const rowTooltip = params.clickAction === "send"
    ? TOOLS_CARD_STRINGS.hubClick.sendTooltip
    : TOOLS_CARD_STRINGS.hubClick.copyTooltip;
  const innerRow = (label: unknown, badges: unknown, item: HubClickItem) => html`<div
    class="inner-row${rowsClickable ? " inner-row--clickable" : ""}"
    title=${rowsClickable ? rowTooltip : nothing}
    @click=${rowsClickable ? () => params.onItemClick(item) : null}
  ><span class="inner-label">${label}</span><span class="inner-badges">${badges}</span></div>`;

  const renderActivity = (activity: { id: number; name?: string; sort?: number; favorite_count?: number; macro_count?: number }) => {
    const id = Number(activity.id);
    const key = `act-${id}`;
    const reorder = params.reorderMode && params.reorderKind === "activity";
    const isOpen = !reorder && params.openEntity === key;
    const locked = params.hubCommandBusy || params.selectedHubProxyConnected || reorder;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const favorites = activityFavorites(params.hub, id);
    const macros = activityMacros(params.hub, id);
    const buttons = activityButtons(params.hub, id);
    const activityName = String(activity.name || TOOLS_CARD_STRINGS.cache.activityFallback(id));
    return html`
      <div class="entity-block${isOpen ? " open" : ""}${reorder ? " entity-block--reorder" : ""}" id=${`entity-${key}`} data-activity-id=${id}>
        <div class="entity-summary" @click=${reorder ? null : () => params.onToggleEntity(key)}>
          <span class="entity-name">
            <span class="entity-name-icon">
              <ha-icon icon=${reorder ? "mdi:drag-vertical-variant" : "mdi:play-circle-outline"}></ha-icon>
            </span>
            <span class="entity-name-copy">
              <span class="entity-name-label">${activityName}</span>
              <span class="entity-count entity-count--activity">${TOOLS_CARD_STRINGS.cache.activityCounts(favorites.length, macros.length, buttons.length)}</span>
            </span>
          </span>
          <span class="entity-meta">
            ${badge(DEV_ID_BADGE, id)}
            <button class="icon-btn" title=${TOOLS_CARD_STRINGS.cache.editActivity} ?disabled=${locked} @click=${(event: Event) => { event.stopPropagation(); params.onEditActivity(id); }}><ha-icon icon="mdi:wrench"></ha-icon></button>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${(event: Event) => { event.stopPropagation(); params.onRefreshEntry("activity", id, key); }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            ${reorder ? null : html`<span class="entity-chevron">▼</span>`}
          </span>
        </div>
        ${isOpen ? html`<div class="entity-body">
          ${favorites.length ? html`<div class="inner-section-label">${TOOLS_CARD_STRINGS.cache.favorites}</div>${favorites.map((favorite) => {
            const label = favorite.label || TOOLS_CARD_STRINGS.cache.favoriteFallback(favorite.command_id);
            return innerRow(
              label,
              html`${badge(FAV_ID_BADGE, favorite.button_id)}${badge(DEV_ID_BADGE, favorite.device_id)}${badge(COM_ID_BADGE, favorite.command_id)}`,
              { kind: "favorite", label: String(label), contextLabel: activityName, targetId: Number(favorite.device_id), commandId: Number(favorite.command_id) },
            );
          })}` : null}
          ${macros.length ? html`<div class="inner-section-label">${TOOLS_CARD_STRINGS.cache.macros}</div>${macros.map((macro) => {
            const label = macro.label || macro.name || TOOLS_CARD_STRINGS.cache.macroFallback(macro.command_id);
            return innerRow(
              label,
              html`${badge(FAV_ID_BADGE, macro.command_id)}${badge(COM_ID_BADGE, macro.command_id)}`,
              { kind: "macro", label: String(label), contextLabel: activityName, targetId: id, commandId: Number(macro.command_id) },
            );
          })}` : null}
          ${buttons.length ? html`<div class="inner-section-label">${TOOLS_CARD_STRINGS.cache.buttons}</div><div class="buttons-grid">${[buttons.slice(0, Math.ceil(buttons.length / 2)), buttons.slice(Math.ceil(buttons.length / 2))].map((column) => html`<div class="buttons-col">${column.map((buttonId) => innerRow(
            buttonName(buttonId),
            badge(COM_ID_BADGE, buttonId),
            { kind: "button", label: buttonName(buttonId), contextLabel: activityName, targetId: id, commandId: Number(buttonId) },
          ))}</div>`)}</div>` : null}
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
    const reorder = params.reorderMode && params.reorderKind === "device";
    const isOpen = !reorder && params.openEntity === key;
    const locked = params.hubCommandBusy || params.selectedHubProxyConnected || reorder;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const commands = deviceCommands(params.hub, id);
    const icon = deviceClassIcon(device.device_class);
    const deviceName = String(device.name || TOOLS_CARD_STRINGS.cache.deviceFallback(id));
    return html`
      <div class="entity-block${isOpen ? " open" : ""}${reorder ? " entity-block--reorder" : ""}" id=${`entity-${key}`} data-device-id=${id}>
        <div class="entity-summary" @click=${reorder ? null : () => params.onToggleEntity(key)}>
          <span class="entity-name">
            <span class="entity-name-icon"><ha-icon icon=${reorder ? "mdi:drag-vertical-variant" : icon}></ha-icon></span>
            <span class="entity-name-copy">
              <span class="entity-name-label">${deviceName}</span>
              <span class="entity-count">${TOOLS_CARD_STRINGS.cache.deviceCommandCount(Number(device.command_count || 0))}</span>
            </span>
          </span>
          <span class="entity-meta">
            ${badge(DEV_ID_BADGE, id)}
            <button class="icon-btn" title=${TOOLS_CARD_STRINGS.cache.editDevice} ?disabled=${locked} @click=${(event: Event) => { event.stopPropagation(); params.onEditDevice(id); }}><ha-icon icon="mdi:wrench"></ha-icon></button>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${(event: Event) => { event.stopPropagation(); params.onRefreshEntry("device", id, key); }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            ${reorder ? null : html`<span class="entity-chevron">▼</span>`}
          </span>
        </div>
        ${isOpen ? html`<div class="entity-body">${commands.length ? commands.map((command) => innerRow(
          command.label,
          badge(COM_ID_BADGE, command.id),
          { kind: "command", label: command.label, contextLabel: deviceName, targetId: id, commandId: command.id },
        )) : html`<div class="inner-empty">${TOOLS_CARD_STRINGS.cache.noCachedCommands}</div>`}</div>` : null}
      </div>
    `;
  };

  const activities = hubActivities(params.hub);
  const devices = hubDevices(params.hub);
  const selectedSection: SectionId = params.selectedSection;
  // Reorder mode also locks the header refresh actions.
  const locked = params.hubCommandBusy || params.selectedHubProxyConnected || params.reorderMode;
  const S = TOOLS_CARD_STRINGS.cache;

  const activityReorder = params.reorderMode && params.reorderKind === "activity";
  const deviceReorder = params.reorderMode && params.reorderKind === "device";

  // In reorder mode the rows follow the working order; ids that vanished
  // from the list (external refresh) are dropped, new ones appended.
  const workingOrder = <T extends { id: number }>(rows: T[]): T[] => [
    ...params.reorderIds
      .map((id) => rows.find((row) => Number(row.id) === Number(id)))
      .filter((row): row is T => !!row),
    ...rows.filter((row) => !params.reorderIds.includes(Number(row.id))),
  ];
  const orderedActivities = activityReorder ? workingOrder(activities) : activities;
  const orderedDevices = deviceReorder ? workingOrder(devices) : devices;

  // ha-sortable fires its events bubbling AND composed, and this card sits
  // inside the dashboard section's own <ha-sortable> grid. Anything we let
  // escape the card is interpreted by the section as a card re-order /
  // insert (observed live: dragging an activity made HA add a null card to
  // the section grid), so every sortable event must be swallowed here.
  const containSortableEvent = (event: Event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  const handleSortableMove = (event: Event) => {
    containSortableEvent(event);
    const detail = (event as CustomEvent<{ oldIndex?: number; newIndex?: number }>).detail;
    const oldIndex = Number(detail?.oldIndex);
    const newIndex = Number(detail?.newIndex);
    if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex) || oldIndex === newIndex) return;
    params.onReorderMove(oldIndex, newIndex);
  };

  const sortableList = (rows: unknown[]) => html`
    <ha-sortable
      class="cache-reorder-sortable"
      draggable-selector=".entity-block"
      animation="180"
      @item-moved=${handleSortableMove}
      @item-added=${containSortableEvent}
      @item-removed=${containSortableEvent}
      @drag-start=${containSortableEvent}
      @drag-end=${containSortableEvent}
    >
      <div class="cache-reorder-list">${rows}</div>
    </ha-sortable>
  `;

  const activityRows = orderedActivities.map(renderActivity);
  const activitiesList = activityReorder ? sortableList(activityRows) : activityRows;
  const deviceRows = orderedDevices.map(renderDevice);
  const devicesList = deviceReorder ? sortableList(deviceRows) : deviceRows;

  // Sync to hub / Cancel actions shown while re-order mode is active.
  const reorderActions = (hint: string) => html`
    <div class="cache-reorder-hint">${hint}</div>
    ${params.reorderError
      ? html`<div class="cache-footer-error">${params.reorderError}</div>`
      : null}
    <div class="cache-footer-actions">
      <button
        class="cache-footer-btn cache-footer-btn--primary"
        ?disabled=${params.reorderSyncing}
        @click=${params.onSyncReorder}
      >
        <ha-icon icon="mdi:upload-outline"></ha-icon>
        <span>${params.reorderSyncing ? S.reorderSyncing : S.reorderSync}</span>
      </button>
      <button
        class="cache-footer-btn"
        ?disabled=${params.reorderSyncing}
        @click=${params.onCancelReorder}
      >${S.reorderCancel}</button>
    </div>
  `;

  const changeOrderButton = (kind: "activity" | "device", rowCount: number) => html`
    <button
      class="cache-footer-btn"
      ?disabled=${locked || rowCount < 2}
      @click=${() => params.onStartReorder(kind)}
    >
      <ha-icon icon="mdi:swap-vertical"></ha-icon>
      <span>${S.changeOrder}</span>
    </button>
  `;

  // Footer under the Activities list: Change order / Add Activity, replaced
  // by Sync to hub / Cancel while re-order mode is active.
  const activitiesFooter = html`
    <div class="cache-list-footer">
      ${activityReorder
        ? reorderActions(S.reorderHint)
        : html`
            <div class="cache-footer-actions">
              ${changeOrderButton("activity", activities.length)}
              <button
                class="cache-footer-btn"
                ?disabled=${locked}
                @click=${params.onOpenAddActivity}
              >
                <ha-icon icon="mdi:plus"></ha-icon>
                <span>${S.addActivity}</span>
              </button>
            </div>
          `}
    </div>
  `;

  // Footer under the Devices list: Change order, replaced by Sync to hub /
  // Cancel while re-order mode is active.
  const devicesFooter = html`
    <div class="cache-list-footer">
      ${deviceReorder
        ? reorderActions(S.reorderDevicesHint)
        : html`<div class="cache-footer-actions">${changeOrderButton("device", devices.length)}</div>`}
    </div>
  `;

  const activeBody = selectedSection === "activities"
    ? html`${activitiesList}${activitiesFooter}`
    : html`${devicesList}${devicesFooter}`;

  const confirmAddActivity = (event: Event) => {
    const dialog = (event.currentTarget as HTMLElement).closest(".cache-dialog");
    const input = dialog?.querySelector<HTMLInputElement>(".cache-dialog-input");
    const name = String(input?.value || "").trim();
    if (name) params.onConfirmAddActivity(name);
  };

  const addActivityDialog = params.addActivityOpen
    ? html`
        <div class="cache-modal-backdrop" @click=${params.addActivityBusy ? null : params.onCloseAddActivity}>
          <div class="cache-dialog" @click=${(event: Event) => event.stopPropagation()}>
            <div class="cache-dialog-title">${S.addActivityTitle}</div>
            <div class="cache-dialog-text">${S.addActivityBody}</div>
            ${params.addActivityError
              ? html`<div class="cache-footer-error">${params.addActivityError}</div>`
              : null}
            <input
              class="cache-dialog-input"
              type="text"
              maxlength="30"
              placeholder=${S.addActivityPlaceholder}
              ?disabled=${params.addActivityBusy}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                confirmAddActivity(event);
              }}
            />
            <div class="cache-dialog-actions">
              <button
                class="cache-footer-btn"
                ?disabled=${params.addActivityBusy}
                @click=${params.onCloseAddActivity}
              >${S.addActivityCancel}</button>
              <button
                class="cache-footer-btn cache-footer-btn--primary"
                ?disabled=${params.addActivityBusy}
                @click=${confirmAddActivity}
              >${params.addActivityBusy ? S.addActivityCreating : S.addActivityConfirm}</button>
            </div>
          </div>
        </div>
      `
    : null;

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
              <span
                class="refresh-list-label refresh-list-label--clickable"
                role="button"
                tabindex=${locked ? -1 : 0}
                aria-disabled=${String(locked)}
                @click=${locked ? null : params.onRefreshAll}
                @keydown=${locked ? null : (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); params.onRefreshAll(); } }}
              >${TOOLS_CARD_STRINGS.cache.refreshAll}</span>
              <button class="icon-btn${params.refreshAllSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${params.onRefreshAll}>
                <ha-icon icon="mdi:refresh"></ha-icon>
              </button>
            </span>
            <span class="refresh-action">
              <span
                class="refresh-list-label refresh-list-label--clickable"
                role="button"
                tabindex=${locked ? -1 : 0}
                aria-disabled=${String(locked)}
                @click=${locked ? null : () => params.onRefreshSection(selectedSection)}
                @keydown=${locked ? null : (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); params.onRefreshSection(selectedSection); } }}
              >${TOOLS_CARD_STRINGS.cache.refreshList}</span>
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
      ${addActivityDialog}
    </div>
  `;
}
