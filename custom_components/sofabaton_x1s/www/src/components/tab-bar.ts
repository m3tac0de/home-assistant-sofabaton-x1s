import { html } from "lit";
import type { TabId } from "../shared/ha-context";

export function renderTabBar(params: {
  selectedTab: TabId;
  persistentCacheEnabled: boolean;
  onSelect: (tabId: TabId) => void;
}) {
  const tabs: Array<{ id: TabId; label: string; disabled: boolean; pushRight?: boolean }> = [
    { id: "hub", label: "Hub", disabled: false },
    { id: "settings", label: "Settings", disabled: false },
    { id: "wifi_commands", label: "Wifi Commands", disabled: false },
    { id: "cache", label: "Cache", disabled: !params.persistentCacheEnabled },
    { id: "logs", label: "Logs", disabled: false, pushRight: true },
  ];
  return html`
    <div class="tabs">
      ${tabs.map(
        (tab) => html`
          <button
            class="tab-btn${tab.pushRight ? " tab-btn--push-right" : ""}${params.selectedTab === tab.id ? " active" : ""}${tab.disabled ? " tab-disabled" : ""}"
            ?disabled=${tab.disabled}
            @click=${() => params.onSelect(tab.id)}
          >
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}
