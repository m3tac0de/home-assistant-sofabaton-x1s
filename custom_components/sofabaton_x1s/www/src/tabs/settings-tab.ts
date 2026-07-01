import { html, nothing } from "lit";
import type { ControlPanelHubState, HassLike, HubAction, SettingKey } from "../shared/ha-context";
import { canRunHubActions, hubConnected, hubIcon, proxyClientConnected } from "../shared/utils/control-panel-selectors";
import { renderSettingTile } from "../components/setting-tile";
import { TOOLS_CARD_STRINGS } from "../strings";

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
  if (params.loading) return html`<div class="cache-state">${TOOLS_CARD_STRINGS.settings.loading}</div>`;
  if (params.error) return html`<div class="cache-state error">${params.error}</div>`;
  if (!params.hub) return html`<div class="cache-state">${TOOLS_CARD_STRINGS.settings.noHubsFound}</div>`;

  const hub = params.hub;
  const connected = hubConnected(params.hass, hub);
  const proxyOn = proxyClientConnected(params.hass, hub);
  const hubVersion = String(hub.version ?? "").trim();
  const firmwareVersion = hub.firmware_version != null ? `FW: v${hub.firmware_version}` : "";
  const versionLine = [hubVersion ? `Sofabaton ${hubVersion}` : "", firmwareVersion].filter(Boolean).join(" / ");
  const remoteBattery = hub.remote_battery;
  const batteryLevel =
    remoteBattery?.supported && typeof remoteBattery.level === "number"
      ? Math.max(0, Math.min(100, Math.round(remoteBattery.level)))
      : null;
  const batteryUpdated = String(remoteBattery?.last_updated ?? "").trim();
  const batteryStatus =
    batteryLevel == null
      ? String(remoteBattery?.attributes?.last_poll_status ?? "Waiting")
      : batteryUpdated
        ? "Updated"
        : "Current";

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
              <div class="hub-compact-name">${hub.name || TOOLS_CARD_STRINGS.settings.unknownHubName}</div>
              ${versionLine ? html`<div class="hub-compact-meta">${versionLine}</div>` : nothing}
              ${hub.ip_address ? html`<div class="hub-compact-meta">${hub.ip_address}</div>` : nothing}
            </div>
          </div>
          <div class="hub-compact-stats">
            <div class="hub-compact-stat">
              <span class="hub-compact-stat-icon">${hubIcon("activities", "hub-compact-stat-svg")}</span>
              <div class="hub-compact-stat-text">
                <div class="hub-compact-stat-value">${Number(hub.activity_count || 0)}</div>
                <div class="hub-compact-stat-label">${TOOLS_CARD_STRINGS.settings.activities}</div>
              </div>
            </div>
            <div class="hub-compact-divider"></div>
            <div class="hub-compact-stat">
              <span class="hub-compact-stat-icon">${hubIcon("devices", "hub-compact-stat-svg")}</span>
              <div class="hub-compact-stat-text">
                <div class="hub-compact-stat-value">${Number(hub.device_count || 0)}</div>
                <div class="hub-compact-stat-label">${TOOLS_CARD_STRINGS.settings.devices}</div>
              </div>
            </div>
          </div>
        </div>
        ${remoteBattery?.supported
          ? html`
              <div class="remote-battery-panel">
                <div class="remote-battery-icon"><ha-icon icon="mdi:battery"></ha-icon></div>
                <div class="remote-battery-copy">
                  <span class="remote-battery-label">Remote battery</span>
                  <span class="remote-battery-status">${batteryStatus}</span>
                </div>
                <div class="remote-battery-meter" aria-label="Remote battery ${batteryLevel ?? 0} percent">
                  <span style=${`width: ${batteryLevel ?? 0}%`}></span>
                </div>
                <span class="remote-battery-value">${batteryLevel == null ? "--" : `${batteryLevel}%`}</span>
              </div>
            `
          : nothing}
      </div>
      <div class="tab-panel scrollable">
        <div class="settings-content">
          <div class="settings-list">
            ${renderSettingTile({
              title: TOOLS_CARD_STRINGS.settings.persistentCacheTitle,
              description: TOOLS_CARD_STRINGS.settings.persistentCacheDescription,
              classes: `toggle${busy ? " disabled" : ""}`,
              footerLabel: TOOLS_CARD_STRINGS.settings.persistentCacheFooter,
              control: html`<ha-switch .checked=${params.persistentCacheEnabled} .disabled=${busy} @change=${(event: Event) => { event.stopPropagation(); params.onToggleSetting("persistent_cache", !!(event.currentTarget as HTMLInputElement).checked); }}></ha-switch>`,
              onClick: busy ? undefined : () => params.onToggleSetting("persistent_cache", !params.persistentCacheEnabled),
            })}
            ${renderSettingTile({
              title: TOOLS_CARD_STRINGS.settings.hexLoggingTitle,
              description: TOOLS_CARD_STRINGS.settings.hexLoggingDescription,
              classes: `toggle${busy ? " disabled" : ""}`,
              control: html`<ha-switch .checked=${settingValue("hex_logging_enabled")} .disabled=${busy} @change=${(event: Event) => { event.stopPropagation(); params.onToggleSetting("hex_logging_enabled", !!(event.currentTarget as HTMLInputElement).checked); }}></ha-switch>`,
              onClick: busy ? undefined : () => params.onToggleSetting("hex_logging_enabled", !settingValue("hex_logging_enabled")),
            })}
            ${renderSettingTile({
              title: TOOLS_CARD_STRINGS.settings.proxyTitle,
              description: TOOLS_CARD_STRINGS.settings.proxyDescription,
              classes: `toggle${busy ? " disabled" : ""}`,
              control: html`<ha-switch .checked=${settingValue("proxy_enabled")} .disabled=${busy} @change=${(event: Event) => { event.stopPropagation(); params.onToggleSetting("proxy_enabled", !!(event.currentTarget as HTMLInputElement).checked); }}></ha-switch>`,
              onClick: busy ? undefined : () => params.onToggleSetting("proxy_enabled", !settingValue("proxy_enabled")),
            })}
            ${renderSettingTile({
              title: TOOLS_CARD_STRINGS.settings.wifiDeviceTitle,
              description: TOOLS_CARD_STRINGS.settings.wifiDeviceDescription,
              classes: `toggle${busy ? " disabled" : ""}`,
              control: html`<ha-switch .checked=${settingValue("wifi_device_enabled")} .disabled=${busy} @change=${(event: Event) => { event.stopPropagation(); params.onToggleSetting("wifi_device_enabled", !!(event.currentTarget as HTMLInputElement).checked); }}></ha-switch>`,
              onClick: busy ? undefined : () => params.onToggleSetting("wifi_device_enabled", !settingValue("wifi_device_enabled")),
            })}
            ${renderSettingTile({
              title: TOOLS_CARD_STRINGS.settings.findRemoteTitle,
              description: TOOLS_CARD_STRINGS.settings.findRemoteDescription,
              classes: `action${canAct ? "" : " disabled"}`,
              control: html`<ha-icon class="setting-icon" icon="mdi:bell-ring-outline"></ha-icon>`,
              onClick: canAct ? () => params.onRunAction("find_remote") : undefined,
            })}
            ${renderSettingTile({
              title: TOOLS_CARD_STRINGS.settings.syncRemoteTitle,
              description: TOOLS_CARD_STRINGS.settings.syncRemoteDescription,
              classes: `action${canAct ? "" : " disabled"}`,
              control: html`<ha-icon class="setting-icon" icon="mdi:sync"></ha-icon>`,
              onClick: canAct ? () => params.onRunAction("sync_remote") : undefined,
            })}
          </div>
        </div>
      </div>
    </div>
  `;
}
