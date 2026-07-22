import { html } from "lit";
import type { ControlPanelHubState, HassLike } from "../shared/ha-context";
import { hubConnected, hubIcon, proxyClientConnected } from "../shared/utils/control-panel-selectors";
import { TOOLS_CARD_STRINGS } from "../strings";

export function renderHubTab(params: {
  loading: boolean;
  error: string | null;
  hub: ControlPanelHubState | null;
  hass: HassLike | null;
  integrationVersion: string | null;
}) {
  if (params.loading) return html`<div class="cache-state">${TOOLS_CARD_STRINGS.hub.loading}</div>`;
  if (params.error) return html`<div class="cache-state error">${params.error}</div>`;
  if (!params.hub) return html`<div class="cache-state">${TOOLS_CARD_STRINGS.common.noHubsFound}</div>`;

  const connected = hubConnected(params.hass, params.hub);
  const proxyOn = proxyClientConnected(params.hass, params.hub);
  const haActive = connected || proxyOn;
  const haFullyActive = connected && proxyOn;
  const integrationVersion = String(params.integrationVersion ?? "").trim()
    || TOOLS_CARD_STRINGS.backend.unknownVersion;
  const hubVersion = String(params.hub.version ?? "").trim();
  const firmwareVersion = params.hub.firmware_version != null
    ? TOOLS_CARD_STRINGS.hub.firmwareVersion(params.hub.firmware_version)
    : "";
  const versionValue = [
    hubVersion ? TOOLS_CARD_STRINGS.hub.productVersion(hubVersion) : "",
    firmwareVersion,
  ].filter(Boolean).join(" / ");
  const row = (kind: "version" | "ip" | "activities" | "devices", label: string, value: unknown) => html`
    <div class="hub-row">
      <span class="hub-row-icon">${hubIcon(kind, "hub-row-icon-svg")}</span>
      <span class="hub-row-label">${label}</span>
      <span class="hub-row-value">${String(value)}</span>
    </div>
  `;

  return html`
    <div class="hub-tab-layout">
      <div class="tab-panel scrollable">
        <div class="hub-hero">
          <div class="hub-ident hub-ident--hero">
            <div class="hub-ident-name">${params.hub.name || TOOLS_CARD_STRINGS.hub.unknown}</div>
          </div>
          <div class="hub-connection-strip" role="img" aria-label=${TOOLS_CARD_STRINGS.hub.connectionStatusAria}>
            <div class="hub-connection-node hub-connection-node--hub${connected ? " is-active" : ""}">
              <span class="hub-connection-node-icon hub-connection-node-icon--hub">
                ${hubIcon("hero", "hub-hero-icon")}
              </span>
            </div>
            <div class="hub-connection-link${connected ? " is-active" : ""}"><span class="hub-connection-link-line"></span></div>
            <div class="hub-connection-node hub-connection-node--ha${haActive ? " is-active" : ""}${haFullyActive ? " is-bridged" : ""}">
              <span class="hub-connection-node-icon hub-connection-node-icon--mdi">
                <ha-icon icon="mdi:home-assistant"></ha-icon>
              </span>
            </div>
            <div class="hub-connection-link${proxyOn ? " is-active" : ""}"><span class="hub-connection-link-line"></span></div>
            <div class="hub-connection-node hub-connection-node--app${proxyOn ? " is-active" : ""}">
              <span class="hub-connection-node-icon hub-connection-node-icon--mdi">
                <ha-icon icon="mdi:tablet-cellphone"></ha-icon>
              </span>
            </div>
          </div>
        </div>
        <div class="hub-badges">
          <span class="hub-conn-badge ${connected ? "hub-conn-badge--on" : "hub-conn-badge--off"}">${connected ? TOOLS_CARD_STRINGS.hub.hubConnected : TOOLS_CARD_STRINGS.hub.hubNotConnected}</span>
          <span class="hub-proxy-badge ${proxyOn ? "hub-proxy-badge--on" : "hub-proxy-badge--off"}">${proxyOn ? TOOLS_CARD_STRINGS.hub.appConnected : TOOLS_CARD_STRINGS.hub.appNotConnected}</span>
        </div>
        <div class="hub-info-list">
          ${versionValue ? row("version", TOOLS_CARD_STRINGS.hub.version, versionValue) : null}
          ${params.hub.ip_address ? row("ip", TOOLS_CARD_STRINGS.hub.ipAddress, params.hub.ip_address) : null}
          ${row("activities", TOOLS_CARD_STRINGS.hub.activities, Number(params.hub.activity_count || 0))}
          ${row("devices", TOOLS_CARD_STRINGS.hub.devices, Number(params.hub.device_count || 0))}
        </div>
      </div>
      <div class="panel-sticky-footer">
        <div class="bottom-dock-status">
          <span>${hubIcon("version", "hub-row-icon-svg")}</span>
          <span>
            ${TOOLS_CARD_STRINGS.hub.integrationVersion}
            <span class="dock-status-value">${integrationVersion}</span>
          </span>
        </div>
      </div>
    </div>
  `;
}
