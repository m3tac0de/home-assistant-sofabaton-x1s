import { html } from "lit";
import type { TabId } from "../shared/ha-context";
import { TOOLS_CARD_STRINGS } from "../strings";

export function renderTabBar(params: {
  selectedTab: TabId;
  toolsMenuOpen: boolean;
  onSelect: (tabId: TabId) => void;
  onToggleToolsMenu: () => void;
  onCloseToolsMenu: () => void;
}) {
  const tabs: Array<{ id: TabId; label: string; disabled: boolean }> = [
    { id: "cache", label: TOOLS_CARD_STRINGS.tabs.cache, disabled: false },
    { id: "wifi_commands", label: TOOLS_CARD_STRINGS.tabs.wifiCommands, disabled: false },
    { id: "backup", label: TOOLS_CARD_STRINGS.tabs.backup, disabled: false },
  ];
  const toolsMenuActive = params.selectedTab === "settings" || params.selectedTab === "logs";

  return html`
    <div class="tabs">
      <div class="tabs-scroll" role="tablist">
        ${tabs.map(
          (tab) => html`
            <button
              class="tab-btn${params.selectedTab === tab.id ? " active" : ""}${tab.disabled ? " tab-disabled" : ""}"
              type="button"
              role="tab"
              aria-selected=${String(params.selectedTab === tab.id)}
              ?disabled=${tab.disabled}
              @click=${() => params.onSelect(tab.id)}
            >
              <span class="tab-btn-label">${tab.label}</span>
            </button>
          `,
        )}
      </div>
      <div
        class="tab-menu"
        id="tools-tab-menu-root"
        @keydown=${(event: KeyboardEvent) => {
          if (event.key !== "Escape" || !params.toolsMenuOpen) return;
          event.stopPropagation();
          params.onCloseToolsMenu();
          ((event.currentTarget as HTMLElement).querySelector("#tools-tab-menu-btn") as HTMLElement | null)?.focus();
        }}
        @focusout=${(event: FocusEvent) => {
          const root = event.currentTarget as HTMLElement;
          if (params.toolsMenuOpen && !root.contains(event.relatedTarget as Node | null)) params.onCloseToolsMenu();
        }}
      >
        <button
          class="tab-btn tab-btn--menu${toolsMenuActive ? " active" : ""}${params.toolsMenuOpen ? " is-open" : ""}"
          id="tools-tab-menu-btn"
          type="button"
          aria-haspopup="menu"
          aria-label=${TOOLS_CARD_STRINGS.card.toolsMenuAria}
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
