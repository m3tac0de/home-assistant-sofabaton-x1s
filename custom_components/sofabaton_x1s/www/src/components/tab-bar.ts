import { html } from "lit";
import type { TabId } from "../shared/ha-context";
import { TOOLS_CARD_STRINGS } from "../strings";

export function renderTabBar(params: {
  selectedTab: TabId;
  toolsMenuOpen: boolean;
  onSelect: (tabId: TabId) => void;
  onToggleToolsMenu: () => void;
}) {
  const tabs: Array<{ id: TabId; label: string; shortLabel?: string; disabled: boolean }> = [
    { id: "activities", label: TOOLS_CARD_STRINGS.tabs.activities, disabled: false },
    { id: "cache", label: TOOLS_CARD_STRINGS.tabs.cache, disabled: false },
    { id: "wifi_commands", label: TOOLS_CARD_STRINGS.tabs.wifiCommands, shortLabel: TOOLS_CARD_STRINGS.tabs.wifiShort, disabled: false },
    { id: "backup", label: TOOLS_CARD_STRINGS.tabs.backup, disabled: false },
    { id: "blobs", label: TOOLS_CARD_STRINGS.tabs.blobs, disabled: false },
  ];
  const toolsMenuActive = params.selectedTab === "settings" || params.selectedTab === "logs";

  return html`
    <div class="tabs">
      <div class="tabs-scroll">
        ${tabs.map(
          (tab) => html`
            <button
              class="tab-btn${tab.shortLabel ? " tab-btn--has-short-label" : ""}${params.selectedTab === tab.id ? " active" : ""}${tab.disabled ? " tab-disabled" : ""}"
              type="button"
              ?disabled=${tab.disabled}
              @click=${() => params.onSelect(tab.id)}
            >
              <span class="tab-btn-label">${tab.label}</span>
              ${tab.shortLabel ? html`<span class="tab-btn-label-short">${tab.shortLabel}</span>` : null}
            </button>
          `,
        )}
      </div>
      <div class="tab-menu" id="tools-tab-menu-root">
        <button
          class="tab-btn tab-btn--menu${toolsMenuActive ? " active" : ""}${params.toolsMenuOpen ? " is-open" : ""}"
          id="tools-tab-menu-btn"
          type="button"
          aria-haspopup="menu"
          aria-expanded=${String(params.toolsMenuOpen)}
          @click=${params.onToggleToolsMenu}
        >
          <ha-icon class="tab-btn-menu-icon" icon="mdi:cog-outline"></ha-icon>
          <ha-icon class="tab-btn-menu-caret" icon="mdi:chevron-down"></ha-icon>
        </button>
        ${params.toolsMenuOpen
          ? html`
              <div class="tab-menu-dropdown" id="tools-tab-menu-dropdown" role="menu">
                <button
                  class="tab-menu-item${params.selectedTab === "settings" ? " active" : ""}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${String(params.selectedTab === "settings")}
                  @click=${() => params.onSelect("settings")}
                >
                  ${TOOLS_CARD_STRINGS.tabs.settings}
                </button>
                <button
                  class="tab-menu-item${params.selectedTab === "logs" ? " active" : ""}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${String(params.selectedTab === "logs")}
                  @click=${() => params.onSelect("logs")}
                >
                  ${TOOLS_CARD_STRINGS.tabs.logs}
                </button>
              </div>
            `
          : null}
      </div>
    </div>
  `;
}
