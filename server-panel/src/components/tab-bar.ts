// The tab bar (docs/internal/server-panel-state-plan.md, decision 10):
// the hub tabs, the cog menu on the right with the tool pages and the
// theme, and the subtab row under every tab and every tool page (the
// subtabs double as the headers of what they hold, even when there is
// one). On a tool page the cog itself is the active tab. Both rows scroll
// sideways when they do not fit, the cog stays pinned right, as in the
// HA control panel card's tab bar.

import { html, nothing, type TemplateResult } from "lit";
import { mdiAudioVideo, mdiCogOutline, mdiChevronDown, mdiChevronUp, mdiPlayCircleOutline } from "@mdi/js";

import { HUB_TABS, SUBTAB_LABELS, SUBTABS, TAB_LABELS, TOOL_LABELS, TOOL_PAGES, TOOL_SUBTABS, type HubTab, type Route, type ToolPage } from "../panel-route";
import type { ThemeChoice } from "../panel-state";

/** The subtabs that carry an icon, as the HA card's Activities / Devices row does. */
const SUBTAB_ICONS: Record<string, string> = { activities: mdiPlayCircleOutline, devices: mdiAudioVideo };

export function renderTabBar(params: {
  route: Route;
  cogOpen: boolean;
  theme: ThemeChoice;
  eventCount: number;
  /** A count pill per subtab (the card's cached activity and device counts); absent subtabs show none. */
  subCounts?: Record<string, number>;
  onTab: (tab: HubTab) => void;
  onSub: (sub: string) => void;
  onToggleCog: () => void;
  onPage: (page: ToolPage) => void;
  onTheme: () => void;
}): TemplateResult {
  const route = params.route;
  const onTool = route.kind === "tool";
  return html`
    <div class="tabs" id="tabs">
      <div class="tabs-scroll" role="tablist" aria-label="Hub sections">
        ${HUB_TABS.map(
          (tab) => html`<button class="tab-btn ${!onTool && route.tab === tab ? "active" : ""}" type="button" role="tab" data-tab=${tab} aria-selected=${String(!onTool && route.tab === tab)} @click=${() => params.onTab(tab)}>
            <span class="tab-btn-label">${TAB_LABELS[tab]}</span>
          </button>`,
        )}
      </div>
      <div class="tab-menu" id="cog">
        <button class="tab-btn tab-btn--menu ${onTool ? "active" : ""} ${params.cogOpen ? "is-open" : ""}" id="cog-btn" type="button" aria-label=${onTool ? `Setup and tools: ${TOOL_LABELS[route.page]}` : "Setup and tools"} aria-haspopup="menu" aria-expanded=${String(params.cogOpen)} title="setup and tools" @click=${params.onToggleCog}>
          <svg class="cog-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${mdiCogOutline}></path></svg><svg class="chip-arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${params.cogOpen ? mdiChevronUp : mdiChevronDown}></path></svg>
        </button>
        ${params.cogOpen
          ? html`<div class="menu cog-menu" id="cog-menu" role="menu">
              ${TOOL_PAGES.map(
                (page) => html`<button class="menu-item ${onTool && route.page === page ? "selected" : ""}" type="button" role="menuitemradio" data-page=${page} aria-checked=${String(onTool && route.page === page)} @click=${() => params.onPage(page)}>
                  <span class="menu-main"><span class="menu-title">${TOOL_LABELS[page]}${page === "debug" ? html` <span class="badge" id="ws-badge" title="events received">${params.eventCount}</span>` : nothing}</span></span>
                </button>`,
              )}
              <div class="menu-sep"></div>
              <button class="menu-item" type="button" role="menuitem" id="theme-toggle" title="theme: ${params.theme}" @click=${params.onTheme}>
                <span class="menu-main"><span class="menu-title">Theme: ${params.theme}</span><span class="menu-sub">tap to cycle auto, light, dark</span></span>
              </button>
            </div>`
          : nothing}
      </div>
    </div>
    <div class="subtabs" id="subtabs" role="tablist" aria-label=${onTool ? TOOL_LABELS[route.page] : TAB_LABELS[route.tab]} data-page=${onTool ? route.page : route.tab}>
      ${(onTool ? TOOL_SUBTABS[route.page] : SUBTABS[route.tab]).map(
        (sub) => {
          const count = params.subCounts?.[sub];
          const iconPath = SUBTAB_ICONS[sub];
          return html`<button class="subtab-btn ${route.sub === sub ? "active" : ""}" type="button" role="tab" data-sub=${sub} aria-selected=${String(route.sub === sub)} @click=${() => params.onSub(sub)}>
            ${iconPath ? html`<svg class="subtab-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${iconPath}></path></svg>` : nothing}
            <span class="subtab-label">${SUBTAB_LABELS[sub] ?? sub}</span>
            ${typeof count === "number" ? html`<span class="subtab-count">${count}</span>` : nothing}
          </button>`;
        },
      )}
    </div>
  `;
}

/** The cog button's own click, so the shell can tell it from an outside click. */
export function isCogToggle(target: EventTarget | null, root: ParentNode): boolean {
  const button = root.querySelector("#cog-btn");
  return Boolean(button && target instanceof Node && button.contains(target));
}
