// The Catalog view (docs/internal/server-panel-plan.md, decision 8): the
// hub's devices and activities with their entity ids, one entity's rows
// (commands; buttons, macros, favourites) with the ids an integration
// sends, and the explicit hub reads: refresh one entity or the whole hub
// as a job, followed to its end. Reads come from the server's cache (the
// first look at an entity fetches it); nothing here writes to the hub.

import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";

import {
  problemText,
  type Activity,
  type Button,
  type Command,
  type Device,
  type Favorite,
  type HubView,
  type JobView,
  type Macro,
  type PanelApi,
  type RefreshScope,
  type SnapshotDocument,
  type SnapshotEntity,
} from "../panel-api";
import type { HubContext } from "../panel-context";
import { formatWhen } from "../panel-state";
import { PANEL_BASE_CSS } from "../panel-styles";

export const CATALOG_VIEW_TAG = "sb-panel-catalog";

export type CatalogKind = "device" | "activity";

/** One row of the entity list: the typed row plus the snapshot's provenance. */
export interface CatalogEntry {
  kind: CatalogKind;
  id: number;
  name: string;
  device: Device | null;
  activity: Activity | null;
  fetched_at: string | null;
  complete: boolean;
}

interface DeviceDetail {
  commands: Command[];
}

interface ActivityDetail {
  buttons: Button[];
  macros: Macro[];
  favorites: Favorite[];
}

interface RefreshState {
  scope: string;
  text: string;
}

/** Merge the typed rows with the snapshot's per-entity provenance. */
export function buildCatalog(devices: Device[], activities: Activity[], snapshot: SnapshotDocument | null): CatalogEntry[] {
  const provenance = new Map<string, SnapshotEntity>();
  for (const e of snapshot?.devices ?? []) provenance.set(`device:${e.device.device_id}`, e);
  for (const e of snapshot?.activities ?? []) provenance.set(`activity:${e.device.device_id}`, e);
  const entries: CatalogEntry[] = [];
  for (const d of devices) {
    const p = provenance.get(`device:${d.device_id}`);
    entries.push({ kind: "device", id: d.device_id, name: d.name, device: d, activity: null, fetched_at: p?.fetched_at ?? null, complete: p?.complete ?? false });
  }
  for (const a of activities) {
    const p = provenance.get(`activity:${a.activity_id}`);
    entries.push({ kind: "activity", id: a.activity_id, name: a.name, device: null, activity: a, fetched_at: p?.fetched_at ?? null, complete: p?.complete ?? false });
  }
  return entries;
}

/** The progress phrase for a running refresh job. */
export function jobPhrase(job: JobView): string {
  const p = job.progress;
  const steps = p && p.total_steps != null ? ` ${p.completed_steps ?? 0}/${p.total_steps}` : "";
  return `${job.status}${steps}`;
}

const POWER: Record<number, string> = { 0: "off", 1: "on" };

export class SbPanelCatalog extends LitElement {
  static properties = {
    api: { attribute: false },
    ctx: { attribute: false },
    hub: { attribute: false },
    kind: { attribute: false },
    _entries: { state: true },
    _snapshot: { state: true },
    _selected: { state: true },
    _deviceDetail: { state: true },
    _activityDetail: { state: true },
    _notice: { state: true },
    _detailNotice: { state: true },
    _refresh: { state: true },
    _loading: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; }
      .wrap { display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap: 16px; align-items: start; }
      .group { margin-top: 10px; }
      .group h3 { margin: 6px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--sbp-muted); display: flex; gap: 8px; align-items: center; }
      .ent { display: grid; grid-template-columns: 44px 1fr auto; gap: 2px 10px; align-items: center; padding: 6px 8px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; }
      .ent:hover { background: var(--sbp-panel-2); }
      .ent.sel { background: rgba(var(--sbp-accent-rgb), 0.12); border-color: rgba(var(--sbp-accent-rgb), 0.35); }
      .ent .id { grid-column: 1; grid-row: 1 / span 2; font-family: var(--sbp-mono); font-size: 12px; color: var(--sbp-muted); }
      .ent .name { grid-column: 2; grid-row: 1; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ent .sub { grid-column: 2; grid-row: 2; color: var(--sbp-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ent .dot { grid-column: 3; grid-row: 1 / span 2; }
      .headline { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
      .headline .title { font-size: 17px; font-weight: 650; }
      .headline .kind { color: var(--sbp-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
      .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px 18px; margin: 6px 0 12px; padding: 0; }
      .facts dt { color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .facts dd { margin: 0; font-size: 13px; }
      table.list td.num { font-family: var(--sbp-mono); }
      .section { margin-top: 14px; }
      .section h3 { margin: 0 0 4px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .section h3 .hint { font-weight: 400; }
      .notice { padding: 8px 12px; border-radius: 8px; background: rgba(var(--rgb-error-color, 219, 68, 55), 0.12); color: var(--sbp-err); font-size: 13px; margin-bottom: 10px; }
      .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .toolbar .status { font-size: 12px; color: var(--sbp-muted); }
      @media (max-width: 960px) { .wrap { grid-template-columns: 1fr; } }
    `,
  ];

  api!: PanelApi;
  /** The hub context the shell hands over (state plan, decision 3); `hub` follows it. */
  ctx: HubContext | null = null;
  hub: HubView | null = null;
  /** Which group to list: the Hub tab's Devices or Activities subtab; null lists both. */
  kind: CatalogKind | null = null;
  private _entries: CatalogEntry[] = [];
  private _snapshot: SnapshotDocument | null = null;
  private _selected: string | null = null;              // "device:12" / "activity:101"
  private _deviceDetail: DeviceDetail | null = null;
  private _activityDetail: ActivityDetail | null = null;
  private _notice: string | null = null;
  private _detailNotice: string | null = null;
  private _refresh: RefreshState | null = null;
  private _loading = false;
  private _loadedFor: string | null = null;
  private _detailFor: string | null = null;
  private _devices: Device[] = [];
  private _activities: Activity[] = [];

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("kind") && this.kind && this.selectedEntry && this.selectedEntry.kind !== this.kind) {
      this._selected = null;
      this._clearDetail();
    }
    if (changed.has("hub")) {
      const id = this.hub?.hub_id ?? null;
      if (id !== this._loadedFor) {
        this._loadedFor = id;
        this._entries = [];
        this._snapshot = null;
        this._selected = null;
        this._clearDetail();
        this._notice = null;
        if (id) void this._load();
      }
    }
  }

  private _clearDetail(): void {
    this._deviceDetail = null;
    this._activityDetail = null;
    this._detailNotice = null;
    this._detailFor = null;
  }

  get selectedEntry(): CatalogEntry | null {
    if (!this._selected) return null;
    const [kind, id] = this._selected.split(":");
    return this._entries.find((e) => e.kind === kind && String(e.id) === id) ?? null;
  }

  // -- loading ---------------------------------------------------------------------------

  /** The lists and the snapshot header; keeps the selection when it still exists. */
  async _load(): Promise<void> {
    const hubId = this.hub?.hub_id;
    if (!hubId) return;
    this._loading = true;
    try {
      const [devices, activities, snapshot] = await Promise.all([this.api.devices(hubId), this.api.activities(hubId), this.api.snapshot(hubId)]);
      if (this._loadedFor !== hubId) return;
      const failed = [devices, activities].find((r) => !r.ok);
      if (failed) {
        this._notice = problemText(failed);
        this._entries = [];
        return;
      }
      this._notice = null;
      this._devices = devices.body ?? [];
      this._activities = activities.body ?? [];
      this._snapshot = snapshot.ok ? snapshot.body : null;
      this._entries = buildCatalog(this._devices, this._activities, this._snapshot);
      if (this._selected && !this.selectedEntry) {
        this._selected = null;
        this._clearDetail();
      }
    } catch (err) {
      this._notice = String(err);
    } finally {
      this._loading = false;
    }
  }

  private async _select(entry: CatalogEntry): Promise<void> {
    const key = `${entry.kind}:${entry.id}`;
    if (this._selected === key) return;
    this._selected = key;
    await this._loadDetail(entry);
  }

  private async _loadDetail(entry: CatalogEntry): Promise<void> {
    const hubId = this.hub?.hub_id;
    if (!hubId) return;
    const key = `${entry.kind}:${entry.id}`;
    this._detailFor = key;
    this._deviceDetail = null;
    this._activityDetail = null;
    this._detailNotice = null;
    try {
      if (entry.kind === "device") {
        const commands = await this.api.deviceCommands(hubId, entry.id);
        if (this._detailFor !== key) return;
        if (!commands.ok) this._detailNotice = problemText(commands);
        else this._deviceDetail = { commands: commands.body ?? [] };
      } else {
        const [buttons, macros, favorites] = await Promise.all([
          this.api.entityButtons(hubId, entry.id),
          this.api.activityMacros(hubId, entry.id),
          this.api.activityFavorites(hubId, entry.id),
        ]);
        if (this._detailFor !== key) return;
        const failed = [buttons, macros, favorites].find((r) => !r.ok);
        if (failed) this._detailNotice = problemText(failed);
        this._activityDetail = { buttons: buttons.body ?? [], macros: macros.body ?? [], favorites: favorites.body ?? [] };
      }
    } catch (err) {
      if (this._detailFor === key) this._detailNotice = String(err);
    }
    // A first look at an entity fetches it; the provenance (fetched,
    // complete) moves with it, so re-read the snapshot header (cache only).
    await this._reloadProvenance(hubId);
  }

  private async _reloadProvenance(hubId: string): Promise<void> {
    try {
      const snapshot = await this.api.snapshot(hubId);
      if (this._loadedFor !== hubId || !snapshot.ok) return;
      this._snapshot = snapshot.body;
      this._entries = buildCatalog(this._devices, this._activities, this._snapshot);
    } catch {
      // the list keeps what it has
    }
  }

  // -- refresh (the explicit hub read) ------------------------------------------------------

  private async _refreshScope(scope: RefreshScope, label: string): Promise<void> {
    const hubId = this.hub?.hub_id;
    if (!hubId || this._refresh) return;
    this._refresh = { scope: label, text: "starting…" };
    try {
      const started = await this.api.refreshSnapshot(hubId, scope);
      if (started.status !== 202 || !started.body) {
        this._notice = `refresh ${label}: ${problemText(started)}`;
        return;
      }
      const job = await this.api.followJob(hubId, started.body.job_id, {
        onUpdate: (j) => {
          this._refresh = { scope: label, text: jobPhrase(j) };
        },
      });
      if (!job) this._notice = `refresh ${label}: the job could not be followed`;
      else if (job.status !== "done") this._notice = `refresh ${label}: ${job.status}${job.error ? ` (${job.error.type}${job.error.detail ? `: ${job.error.detail}` : ""})` : ""}`;
      else this._notice = null;
    } catch (err) {
      this._notice = `refresh ${label}: ${String(err)}`;
    } finally {
      this._refresh = null;
    }
    await this._load();
    const entry = this.selectedEntry;
    if (entry) await this._loadDetail(entry);
  }

  private _refreshAll(): void {
    void this._refreshScope({}, "whole hub");
  }

  private _refreshSelected(): void {
    const entry = this.selectedEntry;
    if (!entry) return;
    const scope: RefreshScope = entry.kind === "device" ? { device_id: entry.id } : { activity_id: entry.id };
    void this._refreshScope(scope, `${entry.kind} ${entry.id}`);
  }

  // -- render -------------------------------------------------------------------------------

  render(): TemplateResult {
    const hub = this.hub;
    if (!hub) return html`<div class="panel"><div class="hint">Pick a hub above.</div></div>`;
    const devices = this.kind === "activity" ? [] : this._entries.filter((e) => e.kind === "device");
    const activities = this.kind === "device" ? [] : this._entries.filter((e) => e.kind === "activity");
    const snap = this._snapshot;
    return html`
      <div class="wrap">
        <div class="panel" id="catalog-list">
          <div class="toolbar">
            <span class="status" id="catalog-status" title=${snap ? `snapshot ${snap.snapshot_id}` : ""}>
              ${snap ? html`captured ${formatWhen(snap.captured_at)} · ${snap.complete ? "complete" : "partial"}` : this._loading ? "loading…" : "no snapshot"}
            </span>
            <span class="spacer"></span>
            <button class="small" id="catalog-reload" ?disabled=${this._loading} @click=${() => void this._load()} title="re-read the server's cache">reload</button>
            <button class="small primary" id="catalog-refresh-all" ?disabled=${Boolean(this._refresh)} @click=${this._refreshAll} title="POST /snapshot/refresh: read the whole hub">
              ${this._refresh?.scope === "whole hub" ? this._refresh.text : "Refresh all"}
            </button>
          </div>
          ${this._notice ? html`<div class="notice" id="catalog-notice" style="margin-top: 10px">${this._notice}</div>` : nothing}
          ${this.kind === "activity" ? nothing : html`<div class="group">
            <h3>Devices <span class="hint">${devices.length}</span></h3>
            ${devices.length ? devices.map((e) => this._renderEntry(e)) : html`<div class="hint">none</div>`}
          </div>`}
          ${this.kind === "device" ? nothing : html`<div class="group">
            <h3>Activities <span class="hint">${activities.length}</span></h3>
            ${activities.length ? activities.map((e) => this._renderEntry(e)) : html`<div class="hint">none</div>`}
          </div>`}
          <div class="hint" style="margin-top: 12px">Ids are what an integration sends: <code>entity_id</code> is a device's or an activity's id, <code>command_id</code> one of its commands. Rows come from the server's cache, read from the hub on first sight; a dot marks an entity read from the hub in full, which is what Refresh does.</div>
        </div>
        <div class="panel" id="catalog-detail">${this._renderDetail()}</div>
      </div>
    `;
  }

  private _renderEntry(e: CatalogEntry): TemplateResult {
    const key = `${e.kind}:${e.id}`;
    const sub = e.kind === "device"
      ? [e.device?.device_class, e.device?.power_state != null ? `power ${POWER[e.device.power_state] ?? e.device.power_state}` : null].filter(Boolean).join(" · ")
      : [e.activity?.active ? "running" : null, e.activity?.needs_confirm ? "needs confirm" : null].filter(Boolean).join(" · ");
    return html`<div class="ent ${this._selected === key ? "sel" : ""}" data-entity=${key} @click=${() => void this._select(e)}>
      <span class="id">${e.id}</span>
      <span class="name">${e.name}</span>
      <span class="dot ${e.complete ? "ok" : e.fetched_at ? "warn" : "off"}" title=${e.fetched_at ? `refreshed from the hub ${formatWhen(e.fetched_at)}${e.complete ? "" : ", incomplete"}` : "not refreshed from the hub yet; rows come from the server's cache"}></span>
      <span class="sub">${sub || (e.kind === "device" ? "device" : "activity")}</span>
    </div>`;
  }

  private _renderDetail(): TemplateResult {
    const e = this.selectedEntry;
    if (!e) return html`<div class="hint">Select a device or an activity to see its ids and rows.</div>`;
    const busy = Boolean(this._refresh);
    const label = `${e.kind} ${e.id}`;
    const refreshText = this._refresh?.scope === label ? this._refresh.text : e.kind === "device" ? "Refresh device" : "Refresh activity";
    const facts: [string, string][] = [
      ["entity id", String(e.id)],
      // The library stamps an entity only on a full read (Refresh); rows
      // read on demand fill the cache without a stamp.
      ["refreshed", e.fetched_at ? `${formatWhen(e.fetched_at)}${e.complete ? "" : " (incomplete)"}` : "never (rows come from the server's cache)"],
    ];
    if (e.device) {
      facts.push(["class", `${e.device.device_class ?? "?"}${e.device.device_class_code != null ? ` (${e.device.device_class_code})` : ""}`]);
      facts.push(["power", e.device.power_state != null ? POWER[e.device.power_state] ?? String(e.device.power_state) : "unknown"]);
      facts.push(["idle behaviour", e.device.idle_behavior != null ? String(e.device.idle_behavior) : "none"]);
    }
    if (e.activity) {
      facts.push(["state", e.activity.active ? "running" : "not running"], ["needs confirm", e.activity.needs_confirm ? "yes" : "no"]);
    }
    return html`
      <div class="headline"><span class="kind">${e.kind}</span><span class="title">${e.name}</span><span class="spacer"></span>
        <button class="small" id="catalog-refresh-entity" ?disabled=${busy} @click=${this._refreshSelected} title="POST /snapshot/refresh for this entity">${refreshText}</button></div>
      <dl class="facts">${facts.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      ${this._detailNotice ? html`<div class="notice" id="catalog-detail-notice">${this._detailNotice}</div>` : nothing}
      ${e.kind === "device" ? this._renderDevice(e) : this._renderActivity(e)}
    `;
  }

  private _renderDevice(e: CatalogEntry): TemplateResult {
    const detail = this._deviceDetail;
    return html`<div class="section">
      <h3>Commands <span class="hint">${detail ? detail.commands.length : "…"}</span><span class="spacer"></span><span class="hint mono">POST /send {"entity_id": ${e.id}, "command_id": …}</span></h3>
      ${detail
        ? detail.commands.length
          ? html`<div class="scroll-x"><table class="list" id="catalog-commands">
              <thead><tr><th>command id</th><th>label</th></tr></thead>
              <tbody>${detail.commands.map((c) => html`<tr><td class="num">${c.command_id}</td><td>${c.label}</td></tr>`)}</tbody>
            </table></div>`
          : html`<div class="hint">no commands</div>`
        : this._detailNotice ? nothing : html`<div class="hint">loading…</div>`}
    </div>`;
  }

  private _renderActivity(e: CatalogEntry): TemplateResult {
    const d = this._activityDetail;
    if (!d) return this._detailNotice ? html`` : html`<div class="hint">loading…</div>`;
    const bound = d.buttons.filter((b) => b.device_id != null || b.command_id != null);
    return html`
      <div class="section">
        <h3>Buttons <span class="hint">${bound.length} bound of ${d.buttons.length}</span><span class="spacer"></span><span class="hint mono">POST /send {"entity_id": ${e.id}, "command_id": button code}</span></h3>
        ${d.buttons.length
          ? html`<div class="scroll-x"><table class="list" id="catalog-buttons">
              <thead><tr><th>button code</th><th>name</th><th>device</th><th>command</th><th>long press</th></tr></thead>
              <tbody>${d.buttons.map((b) => html`<tr>
                <td class="num">${b.button_code}</td><td>${b.name ?? ""}</td>
                <td class="num">${b.device_id ?? html`<span class="sub">–</span>`}</td><td class="num">${b.command_id ?? html`<span class="sub">–</span>`}</td>
                <td class="num">${b.long_press_device_id != null && b.long_press_command_id != null ? `${b.long_press_device_id} / ${b.long_press_command_id}` : html`<span class="sub">–</span>`}</td>
              </tr>`)}</tbody>
            </table></div>`
          : html`<div class="hint">no buttons</div>`}
      </div>
      <div class="section">
        <h3>Macros <span class="hint">${d.macros.length}</span><span class="spacer"></span><span class="hint mono">POST /send {"entity_id": ${e.id}, "command_id": …}</span></h3>
        ${d.macros.length
          ? html`<table class="list" id="catalog-macros"><thead><tr><th>command id</th><th>label</th></tr></thead>
              <tbody>${d.macros.map((m) => html`<tr><td class="num">${m.command_id}</td><td>${m.label ?? ""}</td></tr>`)}</tbody></table>`
          : html`<div class="hint">no macros</div>`}
      </div>
      <div class="section">
        <h3>Favourites <span class="hint">${d.favorites.length}</span><span class="spacer"></span><span class="hint mono">POST /send {"entity_id": device, "command_id": …}</span></h3>
        ${d.favorites.length
          ? html`<table class="list" id="catalog-favorites"><thead><tr><th>device</th><th>command id</th><th>label</th></tr></thead>
              <tbody>${d.favorites.map((f) => html`<tr><td class="num">${f.device_id}</td><td class="num">${f.command_id}</td><td>${f.label ?? ""}</td></tr>`)}</tbody></table>`
          : html`<div class="hint">no favourites</div>`}
      </div>
    `;
  }
}

export function defineCatalogView(): void {
  if (!customElements.get(CATALOG_VIEW_TAG)) customElements.define(CATALOG_VIEW_TAG, SbPanelCatalog);
}
