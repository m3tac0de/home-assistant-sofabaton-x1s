import { html, nothing } from "lit";
import type { ControlPanelHubState, HassLike, HubAction, SettingKey } from "../shared/ha-context";
import { canRunHubActions, hubConnected, hubIcon, proxyClientConnected } from "../shared/utils/control-panel-selectors";
import { renderSettingTile } from "../components/setting-tile";

export function renderSettingsTab(params: {
  loading: boolean;
  error: string | null;
  hub: ControlPanelHubState | null;
  hass: HassLike | null;
  integrationVersion: string | null;
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

  const hub = params.hub;
  const connected = hubConnected(params.hass, hub);
  const proxyOn = proxyClientConnected(params.hass, hub);
  const integrationVersion = String(params.integrationVersion ?? "").trim() || "unknown";
  const hubVersion = String(hub.version ?? "").trim();
  const firmwareVersion = hub.firmware_version != null ? `FW: v${hub.firmware_version}` : "";
  const versionLine = [hubVersion ? `Sofabaton ${hubVersion}` : "", firmwareVersion].filter(Boolean).join(" / ");

  const busy = !!(params.pendingSettingKey || params.pendingActionKey || params.hubCommandBusy);
  const canAct = canRunHubActions(params.hass, params.hub) && !busy;
  const settingValue = (key: Exclude<SettingKey, "persistent_cache">) => !!params.hub?.settings?.[key];

  return html`
    <div class="hub-tab-layout">
      <div class="settings-hub-header">
        <div class="hub-compact-card">
          <div class="hub-compact-left">
            <div class="hub-compact-icon-wrap ${connected ? "hub-compact-icon-wrap--on" : "hub-compact-icon-wrap--off"}">
              ${hubIcon("hero", "hub-compact-icon")}
              <div class="hub-compact-badge ${proxyOn ? "hub-compact-badge--on" : "hub-compact-badge--off"}">
                <ha-icon icon="mdi:cellphone"></ha-icon>
              </div>
            </div>
            <div class="hub-compact-text">
              <div class="hub-compact-name">${hub.name || "Unknown"}</div>
              ${versionLine ? html`<div class="hub-compact-meta">${versionLine}</div>` : nothing}
              ${hub.ip_address ? html`<div class="hub-compact-meta">${hub.ip_address}</div>` : nothing}
            </div>
          </div>
          <div class="hub-compact-stats">
            <div class="hub-compact-stat">
              <span class="hub-compact-stat-icon">${hubIcon("activities", "hub-compact-stat-svg")}</span>
              <div class="hub-compact-stat-text">
                <div class="hub-compact-stat-value">${Number(hub.activity_count || 0)}</div>
                <div class="hub-compact-stat-label">Activities</div>
              </div>
            </div>
            <div class="hub-compact-divider"></div>
            <div class="hub-compact-stat">
              <span class="hub-compact-stat-icon">${hubIcon("devices", "hub-compact-stat-svg")}</span>
              <div class="hub-compact-stat-text">
                <div class="hub-compact-stat-value">${Number(hub.device_count || 0)}</div>
                <div class="hub-compact-stat-label">Devices</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="tab-panel scrollable">
        <div class="settings-content">
          <div class="settings-list">
            ${renderSettingTile({
              title: "Persistent Cache",
              description: "Store activity and device data locally for faster access.",
              classes: `toggle${busy ? " disabled" : ""}`,
              footerLabel: "GLOBAL",
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
      </div>
      <div class="panel-sticky-footer">
        <div class="bottom-dock-status">
          <div class="dock-seg ${connected ? "dock-seg--hub-on" : "dock-seg--off"}">
            <span class="dock-seg-dot"></span>
            <span>Hub ${connected ? "connected" : "not connected"}</span>
          </div>
          <div class="dock-sep"></div>
          <div class="dock-seg ${proxyOn ? "dock-seg--app-on" : "dock-seg--off"}">
            <span class="dock-seg-dot"></span>
            <span>App ${proxyOn ? "connected" : "not connected"}</span>
          </div>
          <div class="dock-sep"></div>
          <div class="dock-seg dock-seg--version">
            <ha-icon class="dock-version-icon" icon="mdi:cog-outline"></ha-icon>
            <span>v<span class="dock-status-value">${integrationVersion}</span></span>
          </div>
        </div>
      </div>
    </div>
  `;
}
