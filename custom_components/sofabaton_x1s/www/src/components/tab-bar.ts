import { html } from "lit";
import type { TabId } from "../shared/ha-context";

export function renderTabBar(params: {
  selectedTab: TabId;
  persistentCacheEnabled: boolean;
  onSelect: (tabId: TabId) => void;
}) {
  const tabs: Array<{ id: TabId; label: string; shortLabel?: string; disabled: boolean; pushRight?: boolean }> = [
    { id: "settings", label: "Hub", disabled: false },
    { id: "wifi_commands", label: "Wifi Commands", shortLabel: "Wifi", disabled: false },
    { id: "blobs", label: "Blobs", disabled: false },
    { id: "backup", label: "Backup", disabled: false },
    { id: "cache", label: "Cache", disabled: !params.persistentCacheEnabled },
    { id: "logs", label: "Logs", disabled: false, pushRight: true },
  ];
  return html`
    <div class="tabs">
      ${tabs.map(
        (tab) => html`
          <button
            class="tab-btn${tab.pushRight ? " tab-btn--push-right" : ""}${tab.shortLabel ? " tab-btn--has-short-label" : ""}${params.selectedTab === tab.id ? " active" : ""}${tab.disabled ? " tab-disabled" : ""}"
            ?disabled=${tab.disabled}
            @click=${() => params.onSelect(tab.id)}
          >
            <span class="tab-btn-label">${tab.label}</span>
            ${tab.shortLabel ? html`<span class="tab-btn-label-short">${tab.shortLabel}</span>` : null}
          </button>
        `,
      )}
    </div>
  `;
}
