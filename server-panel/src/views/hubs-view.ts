// Hub settings retains the selected hub details and lifecycle actions.
// Discovery and registration live in the top-dock hub picker.
import { LitElement, html, nothing, css, type PropertyValues, type TemplateResult } from "lit";

import { problemText, type HubView, type PanelApi } from "../panel-api";
import type { HubContext } from "../panel-context";
import { actionOutcome, formatWhen, hubDisplayName, hubState } from "../panel-state";
import { PANEL_BASE_CSS } from "../panel-styles";

export const HUBS_VIEW_TAG = "sb-panel-hubs";

type LifecycleAction = "enable" | "disable" | "remove";

export class SbPanelHubs extends LitElement {
  static properties = {
    api: { attribute: false },
    ctx: { attribute: false },
    hubs: { attribute: false },
    hub: { attribute: false },
    _busy: { state: true },
    _firmware: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; }
      .headline { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
      .headline .title { font-size: 17px; font-weight: 650; }
      .headline .id { color: var(--sbp-muted); font-size: 12px; }
      .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 18px; margin: 6px 0 14px; padding: 0; }
      .facts div { min-width: 0; }
      .facts dt { color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .facts dd { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `,
  ];

  api!: PanelApi;
  ctx: HubContext | null = null;
  hubs: HubView[] = [];
  hub: HubView | null = null;
  private _busy = new Set<string>();
  private _firmware = "Not yet known";
  private _infoKey = "";
  private _infoSeq = 0;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
    const h = this.hub;
    const key = h ? `${h.hub_id}:${h.enabled}:${Boolean(h.status)}:${Boolean(h.status?.hub_connected)}` : "";
    if (key !== this._infoKey || changed.has("api")) {
      this._infoKey = key;
      const seq = ++this._infoSeq;
      this._firmware = h?.enabled && h.status ? "Loading…" : "Not available";
      if (h?.enabled && h.status && this.api) void this._loadFirmware(h.hub_id, seq);
    }
  }

  private async _loadFirmware(hubId: string, seq: number): Promise<void> {
    try {
      const response = await this.api.hubInfo(hubId);
      if (seq !== this._infoSeq) return;
      const info = response.ok ? response.body : null;
      this._firmware = info?.known && info.firmware_version != null
        ? `v${info.firmware_version}` : response.ok ? "Not yet known" : "Not available";
    } catch {
      if (seq === this._infoSeq) this._firmware = "Not available";
    }
  }

  private _emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _message(text: string, ok = true): void {
    this._emit("sb-message", { text, ok });
  }

  // -- lifecycle actions ------------------------------------------------------

  private async _act(hubId: string, action: LifecycleAction): Promise<void> {
    if (this._busy.has(hubId)) return;
    if (
      action === "remove" &&
      !confirm(`Remove hub ${hubId}?\n\nThe server stops its proxy, hands the hub back, and forgets its record, cached state and web remote layout. The hub itself is not changed.`)
    ) {
      return;
    }
    const record = this.hubs.find((h) => h.hub_id === hubId) ?? null;
    this._busy = new Set(this._busy).add(hubId);
    try {
      const response =
        action === "remove" ? await this.api.removeHub(hubId) : action === "enable" ? await this.api.enableHub(hubId) : await this.api.disableHub(hubId);
      if (response.ok) this._message(`${hubId}: ${actionOutcome(action, record)}`);
      else this._message(`${hubId}: ${problemText(response)}`, false);
    } catch (err) {
      this._message(String(err), false);
    } finally {
      const busy = new Set(this._busy);
      busy.delete(hubId);
      this._busy = busy;
    }
    this._emit("sb-hubs-changed");
  }

  // The hub pushes writes to its remotes on its own; this is the manual
  // trigger for a remote that missed them (the HA card's "Sync Remote").
  private async _resyncRemote(hubId: string): Promise<void> {
    if (this._busy.has(hubId)) return;
    this._busy = new Set(this._busy).add(hubId);
    try {
      const response = await this.api.resyncRemote(hubId);
      if (response.ok) this._message(`${hubId}: the remote is syncing with the hub`);
      else this._message(`${hubId}: ${problemText(response)}`, false);
    } catch (err) {
      this._message(String(err), false);
    } finally {
      const busy = new Set(this._busy);
      busy.delete(hubId);
      this._busy = busy;
    }
  }

  render(): TemplateResult {
    return html`<div class="panel" id="hub-detail">${this._renderDetail()}</div>`;
  }

  private _renderDetail(): TemplateResult {
    const h = this.hub;
    if (!h) return html`<div class="hint">${this.hubs.length ? "No hub selected." : "No hubs registered yet."} Use the hub picker to find or add a hub. <button class="small" @click=${(event: Event) => { event.stopPropagation(); this._emit("sb-open-picker"); }}>Find or add a hub</button></div>`;
    const { text, tone } = hubState(h);
    const s = h.status;
    const busy = this._busy.has(h.hub_id);
    const model = h.config.hub_version || s?.hub_version || "unknown";
    const facts: [string, TemplateResult | string][] = [
      ["state", html`<span class="tone-${tone}">${text}</span>`],
      ["host", html`<span class="mono">${h.config.host}</span>`],
      ["model", model],
      ["firmware version", this._firmware],
      ["hub id", html`<span class="mono">${h.hub_id}</span>`],
      ["mac", html`<span class="mono">${h.config.mac || "not yet known"}</span>`],
      ["last seen", formatWhen(h.last_seen)],
      ["added", formatWhen(h.added_at)],
      ["cache", s ? `${s.devices_cached} devices · ${s.activities_cached} activities` : "no proxy running"],
      ["running activity", s?.running_activity ? String(s.running_activity.name || s.running_activity.activity_id) : "none"],
    ];
    return html`
      <div class="headline"><span class="dot ${tone}"></span><span class="title">${hubDisplayName(h)}</span><span class="id mono">${h.config.name ? h.hub_id : ""}</span></div>
      <dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      <div class="actions" id="hub-actions">
        ${!h.enabled ? html`<button class="primary" ?disabled=${busy} @click=${() => this._act(h.hub_id, "enable")}>Enable</button>` : nothing}
        ${h.enabled && !s ? html`<button class="primary" ?disabled=${busy} @click=${() => this._act(h.hub_id, "enable")}>Retry start</button>` : nothing}
        ${h.enabled ? html`<button ?disabled=${busy} @click=${() => this._act(h.hub_id, "disable")}>Disable</button>` : nothing}
        ${h.enabled && s ? html`<button id="resync-remote" ?disabled=${busy || !s.controllable || this.ctx?.free === false}
          title="Make the physical remotes run a full sync with the hub"
          @click=${() => this._resyncRemote(h.hub_id)}>Sync remote</button>` : nothing}
        <button class="danger" ?disabled=${busy} @click=${() => this._act(h.hub_id, "remove")}>Remove</button>
        <button @click=${() => this._emit("sb-navigate", { tab: "hub" })}>Open hub</button>
        <button @click=${() => this._emit("sb-navigate", { tab: "remote" })}>Open remote</button>
      </div>
    `;
  }
}

export function defineHubsView(): void {
  if (!customElements.get(HUBS_VIEW_TAG)) customElements.define(HUBS_VIEW_TAG, SbPanelHubs);
}
