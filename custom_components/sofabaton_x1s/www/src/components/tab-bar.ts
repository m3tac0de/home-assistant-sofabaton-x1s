import { html } from "lit";
import type { TabId } from "../shared/ha-context";

export function renderTabBar(params: {
  selectedTab: TabId;
  toolsMenuOpen: boolean;
  persistentCacheEnabled: boolean;
  onSelect: (tabId: TabId) => void;
  onToggleToolsMenu: () => void;
}) {
  const tabs: Array<{ id: TabId; label: string; shortLabel?: string; disabled: boolean }> = [
    { id: "settings", label: "Hub", disabled: false },
    { id: "wifi_commands", label: "Wifi Commands", shortLabel: "Wifi", disabled: false },
    { id: "backup", label: "Backup", disabled: false },
    { id: "cache", label: "Cache", disabled: !params.persistentCacheEnabled },
  ];
  const toolsMenuActive = params.selectedTab === "blobs" || params.selectedTab === "logs";

  return html`
    <div class="tabs">
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
      <div class="tab-menu tab-menu--push-right" id="tools-tab-menu-root">
        <button
          class="tab-btn tab-btn--menu${toolsMenuActive ? " active" : ""}${params.toolsMenuOpen ? " is-open" : ""}"
          id="tools-tab-menu-btn"
          type="button"
          aria-haspopup="menu"
          aria-expanded=${String(params.toolsMenuOpen)}
          @click=${params.onToggleToolsMenu}
        >
          <ha-icon class="tab-btn-menu-icon" icon="mdi:dots-horizontal"></ha-icon>
          <ha-icon class="tab-btn-menu-caret" icon="mdi:chevron-down"></ha-icon>
        </button>
        ${params.toolsMenuOpen
          ? html`
              <div class="tab-menu-dropdown" id="tools-tab-menu-dropdown" role="menu">
                <button
                  class="tab-menu-item${params.selectedTab === "blobs" ? " active" : ""}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${String(params.selectedTab === "blobs")}
                  @click=${() => params.onSelect("blobs")}
                >
                  Blobs
                </button>
                <button
                  class="tab-menu-item${params.selectedTab === "logs" ? " active" : ""}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${String(params.selectedTab === "logs")}
                  @click=${() => params.onSelect("logs")}
                >
                  Logs
                </button>
              </div>
            `
          : null}
      </div>
    </div>
  `;
}
