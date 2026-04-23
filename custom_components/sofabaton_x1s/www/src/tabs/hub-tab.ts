import { html } from "lit";
import type { ControlPanelHubState, HassLike } from "../shared/ha-context";
import { hubConnected, hubIcon, proxyClientConnected } from "../shared/utils/control-panel-selectors";

export function renderHubTab(params: {
  loading: boolean;
  error: string | null;
  hub: ControlPanelHubState | null;
  hass: HassLike | null;
}) {
  if (params.loading) return html`<div class="cache-state">Loading…</div>`;
  if (params.error) return html`<div class="cache-state error">${params.error}</div>`;
  if (!params.hub) return html`<div class="cache-state">No hubs found.</div>`;

  const connected = hubConnected(params.hass, params.hub);
  const proxyOn = proxyClientConnected(params.hass, params.hub);
  const haActive = connected || proxyOn;
  const haFullyActive = connected && proxyOn;
  const row = (kind: "version" | "ip" | "activities" | "devices", label: string, value: unknown) => html`
    <div class="hub-row">
      <span class="hub-row-icon">${hubIcon(kind, "hub-row-icon-svg")}</span>
      <span class="hub-row-label">${label}</span>
      <span class="hub-row-value">${String(value)}</span>
    </div>
  `;

  return html`
    <div class="tab-panel scrollable">
      <div class="hub-hero">
        <div class="hub-ident hub-ident--hero">
          <div class="hub-ident-name">${params.hub.name || "Unknown"}</div>
        </div>
        <div class="hub-connection-strip" role="img" aria-label="Hub connection status">
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
        <span class="hub-conn-badge ${connected ? "hub-conn-badge--on" : "hub-conn-badge--off"}">${connected ? "Hub connected" : "Hub not connected"}</span>
        <span class="hub-proxy-badge ${proxyOn ? "hub-proxy-badge--on" : "hub-proxy-badge--off"}">${proxyOn ? "App connected" : "App not connected"}</span>
      </div>
      <div class="hub-info-list">
        ${params.hub.version ? row("version", "Version", `Sofabaton ${params.hub.version}`) : null}
        ${params.hub.ip_address ? row("ip", "IP Address", params.hub.ip_address) : null}
        ${row("activities", "Activities", Number(params.hub.activity_count || 0))}
        ${row("devices", "Devices", Number(params.hub.device_count || 0))}
      </div>
    </div>
  `;
}
