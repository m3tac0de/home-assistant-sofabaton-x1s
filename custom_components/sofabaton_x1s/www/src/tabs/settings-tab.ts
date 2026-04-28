import { html } from "lit";
import type { ControlPanelHubState, HassLike, HubAction, SettingKey } from "../shared/ha-context";
import { canRunHubActions } from "../shared/utils/control-panel-selectors";
import { renderSettingTile } from "../components/setting-tile";

export function renderSettingsTab(params: {
  loading: boolean;
  error: string | null;
  hub: ControlPanelHubState | null;
  hass: HassLike | null;
  persistentCacheEnabled: boolean;
  hubCommandBusy: boolean;
  pendingSettingKey: SettingKey | null;
  pendingActionKey: HubAction | null;
  onToggleSetting: (setting: SettingKey, enabled: boolean) => void;
  onRunAction: (action: HubAction) => void;
}) {
  if (params.loading) return html`<div class="cache-state">Loading…</div>`;
  if (params.error) return html`<div class="cache-state error">${params.error}</div>`;
  if (!params.hub) return html`<div class="cache-state">No hubs found.</div>`;

  const busy = !!(params.pendingSettingKey || params.pendingActionKey || params.hubCommandBusy);
  const canAct = canRunHubActions(params.hass, params.hub) && !busy;
  const settingValue = (key: Exclude<SettingKey, "persistent_cache">) => !!params.hub?.settings?.[key];

  return html`
    <div class="tab-panel scrollable">
      <div class="acc-title">Configuration</div>
      <div class="settings-grid">
        ${renderSettingTile({
          title: "Persistent Cache",
          description: "Store activity and device data locally for faster access.",
          classes: `toggle${busy ? " disabled" : ""}`,
          control: html`<ha-switch .checked=${params.persistentCacheEnabled} .disabled=${busy} @change=${(event: Event) => { event.stopPropagation(); params.onToggleSetting("persistent_cache", !!(event.currentTarget as HTMLInputElement).checked); }}></ha-switch>`,
          onClick: busy ? undefined : () => params.onToggleSetting("persistent_cache", !params.persistentCacheEnabled),
        })}
        ${renderSettingTile({
          title: "Hex Logging",
          description: "Log raw hex traffic between hub, integration, and app.",
          classes: `toggle${busy ? " disabled" : ""}`,
          control: html`<ha-switch .checked=${settingValue("hex_logging_enabled")} .disabled=${busy} @change=${(event: Event) => { event.stopPropagation(); params.onToggleSetting("hex_logging_enabled", !!(event.currentTarget as HTMLInputElement).checked); }}></ha-switch>`,
          onClick: busy ? undefined : () => params.onToggleSetting("hex_logging_enabled", !settingValue("hex_logging_enabled")),
        })}
        ${renderSettingTile({
          title: "Proxy",
          description: "Let the official Sofabaton app share the hub connection with HA simultaneously.",
          classes: `toggle${busy ? " disabled" : ""}`,
          control: html`<ha-switch .checked=${settingValue("proxy_enabled")} .disabled=${busy} @change=${(event: Event) => { event.stopPropagation(); params.onToggleSetting("proxy_enabled", !!(event.currentTarget as HTMLInputElement).checked); }}></ha-switch>`,
          onClick: busy ? undefined : () => params.onToggleSetting("proxy_enabled", !settingValue("proxy_enabled")),
        })}
        ${renderSettingTile({
          title: "WiFi Device",
          description: "Enable the HTTP listener that captures remote button presses and routes them to HA actions.",
          classes: `toggle${busy ? " disabled" : ""}`,
          control: html`<ha-switch .checked=${settingValue("wifi_device_enabled")} .disabled=${busy} @change=${(event: Event) => { event.stopPropagation(); params.onToggleSetting("wifi_device_enabled", !!(event.currentTarget as HTMLInputElement).checked); }}></ha-switch>`,
          onClick: busy ? undefined : () => params.onToggleSetting("wifi_device_enabled", !settingValue("wifi_device_enabled")),
        })}
        ${renderSettingTile({
          title: "Find Remote",
          description: "Make the remote beep so you can locate it.",
          classes: `action${canAct ? "" : " disabled"}`,
          control: html`<ha-icon class="setting-icon" icon="mdi:bell-ring-outline"></ha-icon>`,
          onClick: canAct ? () => params.onRunAction("find_remote") : undefined,
        })}
        ${renderSettingTile({
          title: "Sync Remote",
          description: "Push the latest configuration to the physical remote.",
          classes: `action${canAct ? "" : " disabled"}`,
          control: html`<ha-icon class="setting-icon" icon="mdi:sync"></ha-icon>`,
          onClick: canAct ? () => params.onRunAction("sync_remote") : undefined,
        })}
      </div>
    </div>
  `;
}
