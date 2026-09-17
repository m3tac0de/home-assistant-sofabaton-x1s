// The Hubs view (docs/internal/server-panel-plan.md, decision 6): the
// selected hub's detail with its lifecycle actions, registration by
// address, and the hubs discovered on the LAN. Talks to the server
// through the PanelApi it is given and reports back through events the
// shell listens to: sb-message, sb-hubs-changed, sb-select-hub, sb-navigate.
// Since the state plan's SP3 it is the Hub setup page under the cog menu.

import { LitElement, html, nothing, css, type PropertyValues, type TemplateResult } from "lit";

import { problemText, type HubCreate, type HubView, type PanelApi, type SeenHub } from "../panel-api";
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
    seen: { attribute: false },
    _busy: { state: true },
    _scanning: { state: true },
    _adding: { state: true },
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
      form .row { max-width: 720px; flex-wrap: wrap; }
      form .row > div:first-child { flex: 1 1 200px; min-width: 160px; }
      form .row > .name { flex: 1 1 140px; }
    `,
  ];

  api!: PanelApi;
  ctx: HubContext | null = null;
  hubs: HubView[] = [];
  hub: HubView | null = null;
  seen: SeenHub[] = [];
  private _busy = new Set<string>();
  private _scanning = false;
  private _adding = false;

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }

  /** Focus the address field (the picker's "Add a hub" lands here). */
  focusAddress(): void {
    const input = this.renderRoot.querySelector<HTMLInputElement>("#add-host");
    input?.focus();
    input?.scrollIntoView({ block: "center" });
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

  private async _add(body: HubCreate): Promise<void> {
    if (this._adding) return;
    this._adding = true;
    try {
      const response = await this.api.addHub(body);
      if (response.status === 201 && response.body) {
        this._message(`added ${response.body.hub_id}${response.body.enabled ? "" : " (disabled)"}`);
        this._emit("sb-select-hub", { hubId: response.body.hub_id });
        const host = this.renderRoot.querySelector<HTMLInputElement>("#add-host");
        const name = this.renderRoot.querySelector<HTMLInputElement>("#add-name");
        if (host) host.value = "";
        if (name) name.value = "";
      } else if (response.status === 503) {
        // The record was kept; select it so "Retry start" is in view.
        const problem = response.body as { hub_id?: string | null; detail?: string | null } | null;
        const hubId = problem?.hub_id || body.host;
        this._message(`${hubId} is registered but its proxy did not start: ${problem?.detail ?? ""}. Fix the cause and press Retry start.`, false);
        this._emit("sb-select-hub", { hubId });
      } else {
        this._message(problemText(response), false);
      }
    } catch (err) {
      this._message(String(err), false);
    } finally {
      this._adding = false;
    }
    this._emit("sb-hubs-changed");
  }

  private _submitAdd(event: Event): void {
    event.preventDefault();
    const host = this.renderRoot.querySelector<HTMLInputElement>("#add-host")?.value.trim() ?? "";
    if (!host) return;
    const name = this.renderRoot.querySelector<HTMLInputElement>("#add-name")?.value.trim() ?? "";
    const disabled = this.renderRoot.querySelector<HTMLInputElement>("#add-disabled")?.checked ?? false;
    void this._add({ host, ...(name ? { name } : {}), enabled: !disabled });
  }

  private async _scan(): Promise<void> {
    if (this._scanning) return;
    this._scanning = true;
    try {
      const response = await this.api.scan(5);
      if (response.ok && Array.isArray(response.body)) this.seen = response.body;
      else this._message(problemText(response), false);
    } catch (err) {
      this._message(String(err), false);
    } finally {
      this._scanning = false;
    }
    this._emit("sb-hubs-changed");
  }

  // -- render ---------------------------------------------------------------------

  render(): TemplateResult {
    return html`
      <div class="panel" id="hub-detail">${this._renderDetail()}</div>
      <div class="panel">
        <h2>Register a hub by address <span class="spacer"></span><span class="hint">one owner per hub: disable it in Home Assistant or another proxy first</span></h2>
        <form id="hub-add" @submit=${this._submitAdd}>
          <div class="row">
            <div><input id="add-host" placeholder="192.168.1.50" autocomplete="off" required></div>
            <div class="name"><input id="add-name" placeholder="name (optional)"></div>
            <button class="primary fixed" id="add-send" type="submit" ?disabled=${this._adding}>Add hub</button>
          </div>
          <div style="margin-top: 8px"><label class="inline"><input type="checkbox" id="add-disabled"> start disabled (register only, connect later)</label></div>
          <div class="hint" style="margin-top: 8px">A hub added by address is re-keyed to its MAC after its first sync. Disable stops the proxy and hands the hub back to the app; Remove also forgets its cached state and remote layout. The hub itself is never changed.</div>
        </form>
      </div>
      <div class="panel">
        <h2>Discovered on the LAN <span class="hint" id="seen-note">${this._seenNote()}</span><span class="spacer"></span>
          <button class="small" id="seen-scan" title="POST /discovery/scan: listen for hub advertisements for 5 seconds" ?disabled=${this._scanning} @click=${this._scan}>${this._scanning ? "scanning…" : "scan 5 s"}</button></h2>
        ${this.seen.length
          ? html`<div class="scroll-x">
              <table class="list" id="seen-table">
                <thead><tr><th>host</th><th>model</th><th>name</th><th>mac</th><th>seen</th><th></th></tr></thead>
                <tbody>${this.seen.map((s) => this._renderSeen(s))}</tbody>
              </table>
            </div>`
          : html`<div class="hint" id="seen-empty">Nothing advertised yet. Hubs announce themselves over mDNS; a scan asks again.</div>`}
      </div>
    `;
  }

  private _seenNote(): string {
    if (!this.seen.length) return "";
    return `(${this.seen.filter((s) => s.present).length} present)`;
  }

  /** The registered hub an advertisement belongs to: the server's answer, or a host / MAC match. */
  private _registeredFor(s: SeenHub): string | null {
    if (s.registered_hub_id) return s.registered_hub_id;
    const c = s.config ?? ({} as SeenHub["config"]);
    const mac = String(c.mac ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
    const hit = this.hubs.find((h) => h.config.host === c.host || (mac && (h.hub_id === mac || String(h.config.mac ?? "").toLowerCase().replace(/[^0-9a-f]/g, "") === mac)));
    return hit?.hub_id ?? null;
  }

  private _renderSeen(s: SeenHub): TemplateResult {
    const c = s.config ?? ({} as SeenHub["config"]);
    const registered = this._registeredFor(s);
    return html`<tr>
      <td class="mono">${c.host || "?"}</td>
      <td>${c.hub_version || "?"}</td>
      <td>${c.name || ""}</td>
      <td class="mono sub">${c.mac || ""}</td>
      <td class=${s.present ? "tone-ok" : "sub"} title="first seen ${formatWhen(s.first_seen)}, last seen ${formatWhen(s.last_seen)}">${s.present ? "present" : "gone"}</td>
      <td class="act">
        ${registered
          ? html`<span class="sub">registered as ${registered}</span>`
          : html`<button class="small primary" ?disabled=${this._adding} @click=${() => this._add({ ...c, enabled: true })}>Add</button>`}
      </td>
    </tr>`;
  }

  private _renderDetail(): TemplateResult {
    const h = this.hub;
    if (!h) return html`<div class="hint">${this.hubs.length ? "No hub selected." : "No hubs registered yet."} Register one below by address, or add one from the discovered list, then manage it here.</div>`;
    const { text, tone } = hubState(h);
    const s = h.status;
    const busy = this._busy.has(h.hub_id);
    const model = h.config.hub_version || s?.hub_version || "unknown";
    const facts: [string, TemplateResult | string][] = [
      ["state", html`<span class="tone-${tone}">${text}</span>`],
      ["host", html`<span class="mono">${h.config.host}</span>`],
      ["model", model],
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
