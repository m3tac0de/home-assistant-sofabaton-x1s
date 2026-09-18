// The Hub tab's Activities and Devices lists, navigated as the HA control
// panel card's Hub tab is (docs/internal/server-panel-state-plan.md,
// decision 12: mirror the card, do not share its code): one entity per
// row, the row opens as a drawer with its cached rows (a device's
// commands; an activity's favorites, macros and bound buttons), one
// drawer open at a time, a refresh button per row and Refresh all in the
// header. The id badges name what `POST /send` takes: DevID is the
// `entity_id`, ComID the `command_id`. Reads come from the server's cache
// (the first look at an entity fetches it); nothing here writes to the hub.

import { LitElement, html, css, nothing, type PropertyValues, type TemplateResult } from "lit";
import { mdiBluetooth, mdiPlayCircleOutline, mdiRadioTower, mdiRefresh, mdiRemote, mdiWifi, mdiWrench } from "@mdi/js";

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

/** What the row's second line counts: the card's "N cmds" and "N favs / N macros / N buttons". */
export interface EntityCounts {
  commands?: number;
  favorites?: number;
  macros?: number;
  buttons?: number;
}

/** One row of the entity list: the typed row plus the snapshot's provenance. */
export interface CatalogEntry {
  kind: CatalogKind;
  id: number;
  name: string;
  device: Device | null;
  activity: Activity | null;
  fetched_at: string | null;
  complete: boolean;
  /** Counts from the snapshot's tables when it carries them; null until a drawer loads them. */
  counts: EntityCounts | null;
}

interface DeviceDetail {
  kind: "device";
  commands: Command[];
}

interface ActivityDetail {
  kind: "activity";
  buttons: Button[];
  macros: Macro[];
  favorites: Favorite[];
}

type Detail = DeviceDetail | ActivityDetail;

interface RefreshState {
  /** The entity key, or "all" for the whole hub. */
  key: string;
  text: string;
}

const REFRESH_ALL_KEY = "all";

export function entryKey(kind: CatalogKind, id: number): string {
  return `${kind}:${id}`;
}

function tableLength(entity: SnapshotEntity | undefined, key: string): number | undefined {
  const rows = entity?.[key];
  return Array.isArray(rows) ? rows.length : undefined;
}

/** The counts the snapshot's tables give, or null when it carries none (a structural profile). */
export function countsFromSnapshot(kind: CatalogKind, entity: SnapshotEntity | undefined): EntityCounts | null {
  if (!entity) return null;
  if (kind === "device") {
    const commands = tableLength(entity, "commands");
    return commands === undefined ? null : { commands };
  }
  const favorites = tableLength(entity, "favorite_slots");
  // Snapshot macros include the built-in power sequences; the drawer's
  // /activities/{id}/macros endpoint lists only user macro shortcuts.
  const macros = Array.isArray(entity.macros) ? entity.macros.filter((row) => {
    const id = Number(row?.button_id);
    return id !== 0xc6 && id !== 0xc7;
  }).length : undefined;
  const buttons = tableLength(entity, "button_bindings");
  if (favorites === undefined && macros === undefined && buttons === undefined) return null;
  return { favorites: favorites ?? 0, macros: macros ?? 0, buttons: buttons ?? 0 };
}

/** Merge the typed rows with the snapshot's per-entity provenance and counts. */
export function buildCatalog(devices: Device[], activities: Activity[], snapshot: SnapshotDocument | null): CatalogEntry[] {
  const provenance = new Map<string, SnapshotEntity>();
  for (const e of snapshot?.devices ?? []) provenance.set(entryKey("device", e.device.device_id), e);
  for (const e of snapshot?.activities ?? []) provenance.set(entryKey("activity", e.device.device_id), e);
  const entries: CatalogEntry[] = [];
  for (const d of devices) {
    const p = provenance.get(entryKey("device", d.device_id));
    entries.push({ kind: "device", id: d.device_id, name: d.name, device: d, activity: null, fetched_at: p?.fetched_at ?? null, complete: p?.complete ?? false, counts: countsFromSnapshot("device", p) });
  }
  for (const a of activities) {
    const p = provenance.get(entryKey("activity", a.activity_id));
    entries.push({ kind: "activity", id: a.activity_id, name: a.name, device: null, activity: a, fetched_at: p?.fetched_at ?? null, complete: p?.complete ?? false, counts: countsFromSnapshot("activity", p) });
  }
  return entries;
}

/** The card's count line under a name; null when nothing is known yet. */
export function countLine(kind: CatalogKind, counts: EntityCounts | null): string | null {
  if (!counts) return null;
  if (kind === "device") {
    const n = counts.commands ?? 0;
    return `${n} ${n === 1 ? "cmd" : "cmds"}`;
  }
  const f = counts.favorites ?? 0;
  const m = counts.macros ?? 0;
  const b = counts.buttons ?? 0;
  return `${f} ${f === 1 ? "fav" : "favs"} / ${m} ${m === 1 ? "macro" : "macros"} / ${b} ${b === 1 ? "button" : "buttons"}`;
}

/** The bound buttons of an activity: the ones the hub maps to a device command. */
export function boundButtons(buttons: Button[]): Button[] {
  return buttons.filter((b) => b.device_id != null || b.command_id != null);
}

/** The progress phrase for a running refresh job. */
export function jobPhrase(job: JobView): string {
  const p = job.progress;
  const steps = p && p.total_steps != null ? ` ${p.completed_steps ?? 0}/${p.total_steps}` : "";
  return `${job.status}${steps}`;
}

/** The card's icon per device class. */
export function deviceClassIconPath(deviceClass: string | null | undefined): string {
  switch (String(deviceClass ?? "").trim().toLowerCase()) {
    case "ir":
      return mdiRemote;
    case "bluetooth":
      return mdiBluetooth;
    case "wifi_roku":
    case "wifi_hue":
    case "wifi_mqtt":
    case "wifi_ip":
    case "wifi_sonos":
      return mdiWifi;
    default:
      return mdiRadioTower;
  }
}

function icon(path: string, cls = ""): TemplateResult {
  return html`<svg class="mdi ${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${path}></path></svg>`;
}

// The id badges name the POST /send parameters these values plug into, so
// they are protocol identifiers, as on the card.
const DEV_ID_BADGE = "DevID";
const FAV_ID_BADGE = "FavID";
const COM_ID_BADGE = "ComID";

function badge(type: string, value: string | number): TemplateResult {
  return html`<span class="id-badge"><span>${type}:</span><span>${String(value)}</span></span>`;
}

export class SbPanelCatalog extends LitElement {
  static properties = {
    api: { attribute: false },
    ctx: { attribute: false },
    hub: { attribute: false },
    kind: { attribute: false },
    _entries: { state: true },
    _snapshot: { state: true },
    _open: { state: true },
    _details: { state: true },
    _detailLoading: { state: true },
    _detailNotice: { state: true },
    _notice: { state: true },
    _refresh: { state: true },
    _loading: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; container-type: inline-size; }
      /* The shell's connected panel is the frame (the card's secondary panel); the list sits flat in it. */
      #catalog-list.panel { border: 0; border-radius: 0; padding: 0; background: transparent; }
      .mdi { width: 16px; height: 16px; flex: 0 0 auto; }
      .cache-panel-header { display: flex; align-items: center; gap: 18px; min-height: 34px; margin: 0 0 8px; }
      .cache-panel-header .status { font-size: 12px; color: var(--sbp-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .refresh-action { display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      .refresh-list-label { color: var(--sbp-muted); font-size: 13px; cursor: pointer; user-select: none; }
      .refresh-list-label:hover { color: var(--sbp-text); }
      .refresh-list-label[aria-disabled="true"] { cursor: default; }
      .refresh-list-label[aria-disabled="true"]:hover { color: var(--sbp-muted); }
      .icon-btn { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--sbp-line); border-radius: 10px; background: transparent; color: var(--sbp-muted); cursor: pointer; padding: 0; line-height: 1; transition: color 120ms, border-color 120ms, background 120ms; }
      .icon-btn:hover { color: var(--sbp-accent); border-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.05); }
      .icon-btn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }
      .icon-btn.spinning { color: var(--sbp-accent); border-color: var(--sbp-accent); opacity: 1 !important; pointer-events: none; }
      .icon-btn.spinning .mdi { animation: spin 0.7s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .notice { padding: 8px 12px; border-radius: 8px; background: rgba(var(--rgb-error-color, 219, 68, 55), 0.12); color: var(--sbp-err); font-size: 13px; margin-bottom: 10px; }
      .cache-panel-body { display: grid; gap: 6px; align-content: start; min-width: 0; }
      .cache-state { padding: 24px 16px; text-align: center; font-size: 13px; color: var(--sbp-muted); }
      .entity-block { width: 100%; min-width: 0; max-width: 100%; border: 1px solid var(--sbp-line); border-radius: 12px; background: var(--sbp-panel-2); overflow-x: clip; transition: border-color 120ms ease; }
      .entity-block:hover { border-color: color-mix(in srgb, var(--sbp-accent) 55%, var(--sbp-line)); }
      .entity-summary { width: 100%; min-width: 0; display: flex; align-items: center; gap: 8px; overflow: hidden; padding: 9px 10px 9px 12px; cursor: pointer; user-select: none; border-radius: 12px; transition: background-color 120ms ease; }
      .entity-summary:hover { background: color-mix(in srgb, var(--sbp-accent) 5%, var(--sbp-panel-2)); }
      /* The card pins the open drawer's header at the top of its scroll body;
         here the page scrolls under the shell's sticky top dock, so the
         header pins just under it (the shell measures the dock's height). */
      .entity-block.open > .entity-summary { position: sticky; top: var(--top-dock-height, 0px); z-index: 2; background: var(--sbp-panel-2); border-bottom: 1px solid var(--sbp-line); border-radius: 12px 12px 0 0; }
      .entity-name { font-size: 13px; font-weight: 700; flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center; gap: 8px; overflow: hidden; color: var(--sbp-text); }
      .entity-name-icon { display: inline-flex; align-items: center; justify-content: center; color: var(--sbp-muted); flex-shrink: 0; }
      .entity-name-copy { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
      .entity-name-label { display: block; min-width: 0; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .entity-count { display: block; min-width: 0; font-size: 10px; font-weight: 400; line-height: 1.05; color: var(--sbp-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .entity-meta { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }
      .entity-chevron { font-size: 8px; color: var(--sbp-muted); transition: transform 150ms; flex-shrink: 0; }
      .entity-block.open .entity-chevron { transform: rotate(180deg); }
      .entity-body { display: none; }
      .entity-block.open .entity-body { display: block; }
      .id-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 600; font-family: var(--sbp-mono); background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: 5px; padding: 2px 5px; flex-shrink: 0; white-space: nowrap; min-width: 68px; justify-content: space-between; }
      .id-badge span:first-child { color: var(--sbp-muted); }
      .id-badge span:last-child { color: var(--sbp-text); text-align: right; }
      .inner-section-label { padding: 5px 12px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--sbp-muted); background: var(--sbp-bg); border-top: 1px solid var(--sbp-line); margin-top: 2px; }
      .inner-section-label:first-child { border-top: none; margin-top: 0; }
      .inner-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; }
      .inner-row:hover { background: rgba(var(--sbp-accent-rgb), 0.05); }
      .inner-label { font-size: 12px; font-weight: 500; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .inner-badges { display: flex; gap: 4px; flex-shrink: 0; }
      .buttons-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 6px; }
      .buttons-col { display: flex; flex-direction: column; min-width: 0; }
      .inner-empty { padding: 8px 12px; font-size: 11px; color: var(--sbp-muted); font-style: italic; }
      .inner-notice { padding: 8px 12px; font-size: 12px; color: var(--sbp-err); }
      .ids-hint { margin-top: 12px; }
      @container (max-width: 480px) {
        /* The rows are tight enough on a phone that the "DevID:" prefix costs more than it explains; keep the number. */
        .entity-meta .id-badge { min-width: 0; justify-content: center; }
        .entity-meta .id-badge span:first-child { display: none; }
        .entity-chevron { display: none; }
        .cache-panel-header { gap: 12px; }
      }
    `,
  ];

  api!: PanelApi;
  /** The hub context the shell hands over (state plan, decision 3); `hub` follows it. */
  ctx: HubContext | null = null;
  hub: HubView | null = null;
  /** Which list to show: the Hub tab's Activities or Devices subtab; null lists both. */
  kind: CatalogKind | null = null;
  private _entries: CatalogEntry[] = [];
  private _snapshot: SnapshotDocument | null = null;
  /** The open drawer's key ("activity:101"); one at a time, as on the card. */
  private _open: string | null = null;
  private _details: Record<string, Detail> = {};
  private _detailLoading: string | null = null;
  private _detailNotice: string | null = null;
  private _notice: string | null = null;
  private _refresh: RefreshState | null = null;
  private _loading = false;
  private _loadedFor: string | null = null;
  private _lastJobId: string | null = null;
  private _pendingScroll: string | null = null;
  private _devices: Device[] = [];
  private _activities: Activity[] = [];

  protected willUpdate(changed: PropertyValues): void {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }

  protected updated(changed: PropertyValues): void {
    if (changed.has("kind") && this.kind && this.openEntry && this.openEntry.kind !== this.kind) {
      // Switching lists closes the drawer, as the card's section switch does.
      this._open = null;
      this._detailNotice = null;
    }
    if (changed.has("hub")) {
      const id = this.hub?.hub_id ?? null;
      if (id !== this._loadedFor) {
        this._loadedFor = id;
        this._lastJobId = this.hub?.last_job?.job_id ?? null;
        this._entries = [];
        this._snapshot = null;
        this._open = null;
        this._details = {};
        this._detailNotice = null;
        this._notice = null;
        if (id) void this._load();
      } else {
        // A job that ended elsewhere (another tab, the API console) may have
        // changed the cache: re-read it once per finished job.
        const jobId = this.hub?.last_job?.job_id ?? null;
        if (jobId && jobId !== this._lastJobId) {
          this._lastJobId = jobId;
          if (!this._refresh) void this._reloadAll();
        }
      }
    }
    if (this._pendingScroll) {
      const key = this._pendingScroll;
      this._pendingScroll = null;
      requestAnimationFrame(() => this._scrollEntityToTop(key));
    }
  }

  /** As the card does on opening a drawer: the row lands at the top of the view, under the top dock. */
  private _scrollEntityToTop(key: string): void {
    const block = this.renderRoot.querySelector<HTMLElement>(`[data-entity="${CSS.escape(key)}"]`);
    if (!block) return;
    const dock = parseFloat(getComputedStyle(this).getPropertyValue("--top-dock-height")) || 0;
    const top = window.scrollY + block.getBoundingClientRect().top - dock - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  get openEntry(): CatalogEntry | null {
    if (!this._open) return null;
    return this._entries.find((e) => entryKey(e.kind, e.id) === this._open) ?? null;
  }

  /** The card's lock: a running refresh, or a hub the view may not act on. */
  private get _locked(): boolean {
    return Boolean(this._refresh) || (this.ctx ? !this.ctx.free : false);
  }

  // -- loading ---------------------------------------------------------------------------

  /** The lists and the snapshot header; keeps the open drawer when its entity still exists. */
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
      if (this._open && !this.openEntry) this._open = null;
    } catch (err) {
      this._notice = String(err);
    } finally {
      this._loading = false;
    }
  }

  /** The lists and every loaded drawer again (after a refresh, or a job that ended elsewhere). */
  private async _reloadAll(): Promise<void> {
    await this._load();
    const open = this.openEntry;
    this._details = {};
    if (open) await this._loadDetail(open);
  }

  private _toggle(entry: CatalogEntry): void {
    const key = entryKey(entry.kind, entry.id);
    const opening = this._open !== key;
    this._open = opening ? key : null;
    this._detailNotice = null;
    if (!opening) return;
    this._pendingScroll = key;
    if (!this._details[key]) void this._loadDetail(entry);
  }

  private async _loadDetail(entry: CatalogEntry): Promise<void> {
    const hubId = this.hub?.hub_id;
    if (!hubId) return;
    const key = entryKey(entry.kind, entry.id);
    this._detailLoading = key;
    this._detailNotice = null;
    let detail: Detail | null = null;
    try {
      if (entry.kind === "device") {
        const commands = await this.api.deviceCommands(hubId, entry.id);
        if (this._loadedFor !== hubId) return;
        if (!commands.ok) this._detailNotice = problemText(commands);
        else detail = { kind: "device", commands: commands.body ?? [] };
      } else {
        const [buttons, macros, favorites] = await Promise.all([
          this.api.entityButtons(hubId, entry.id),
          this.api.activityMacros(hubId, entry.id),
          this.api.activityFavorites(hubId, entry.id),
        ]);
        if (this._loadedFor !== hubId) return;
        const failed = [buttons, macros, favorites].find((r) => !r.ok);
        if (failed) this._detailNotice = problemText(failed);
        detail = { kind: "activity", buttons: buttons.body ?? [], macros: macros.body ?? [], favorites: favorites.body ?? [] };
      }
    } catch (err) {
      this._detailNotice = String(err);
    } finally {
      if (this._detailLoading === key) this._detailLoading = null;
    }
    if (detail) {
      this._details = { ...this._details, [key]: detail };
      // The rows make the page tall enough to scroll: bring the drawer to the top now.
      if (this._open === key) this._pendingScroll = key;
      // The drawer's rows are the truth for the count line.
      this._entries = this._entries.map((e) => (entryKey(e.kind, e.id) === key ? { ...e, counts: countsOf(detail) } : e));
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
      const previous = new Map(this._entries.map((e) => [entryKey(e.kind, e.id), e]));
      this._entries = buildCatalog(this._devices, this._activities, this._snapshot).map((e) => {
        const key = entryKey(e.kind, e.id);
        const detail = this._details[key];
        return detail ? { ...e, counts: countsOf(detail) } : { ...e, counts: e.counts ?? previous.get(key)?.counts ?? null };
      });
    } catch {
      // the list keeps what it has
    }
  }

  // -- refresh (the explicit hub read) ------------------------------------------------------

  private async _refreshScope(scope: RefreshScope, key: string, label: string): Promise<void> {
    const hubId = this.hub?.hub_id;
    if (!hubId || this._refresh) return;
    this._refresh = { key, text: "starting…" };
    try {
      const started = await this.api.refreshSnapshot(hubId, scope);
      if (started.status !== 202 || !started.body) {
        this._notice = `refresh ${label}: ${problemText(started)}`;
        return;
      }
      const job = await this.api.followJob(hubId, started.body.job_id, {
        onUpdate: (j) => {
          this._refresh = { key, text: jobPhrase(j) };
        },
      });
      if (!job) this._notice = `refresh ${label}: the job could not be followed`;
      else if (job.status !== "done") this._notice = `refresh ${label}: ${job.status}${job.error ? ` (${job.error.type}${job.error.detail ? `: ${job.error.detail}` : ""})` : ""}`;
      else this._notice = null;
      if (job) this._lastJobId = job.job_id;
    } catch (err) {
      this._notice = `refresh ${label}: ${String(err)}`;
    } finally {
      this._refresh = null;
    }
    await this._reloadAll();
  }

  private _refreshAll(): void {
    if (this._locked) return;
    void this._refreshScope({}, REFRESH_ALL_KEY, "whole hub");
  }

  /** The card's wrench: open the entity's editor (device editor plan, decision 2). */
  private _edit(entry: CatalogEntry): void {
    if (this._locked) return;
    this.dispatchEvent(new CustomEvent("sb-navigate", { bubbles: true, composed: true, detail: { tab: "hub", sub: entry.kind === "device" ? "devices" : "activities", entity: entry.id } }));
  }

  private _refreshEntry(entry: CatalogEntry): void {
    if (this._locked) return;
    const scope: RefreshScope = entry.kind === "device" ? { device_id: entry.id } : { activity_id: entry.id };
    void this._refreshScope(scope, entryKey(entry.kind, entry.id), `${entry.kind} ${entry.id}`);
  }

  // -- render -------------------------------------------------------------------------------

  render(): TemplateResult {
    const hub = this.hub;
    if (!hub) return html`<div class="panel"><div class="cache-state">Pick a hub above.</div></div>`;
    const kind: CatalogKind = this.kind ?? "activity";
    const rows = this._entries.filter((e) => e.kind === kind);
    const snap = this._snapshot;
    const locked = this._locked;
    const allSpinning = this._refresh?.key === REFRESH_ALL_KEY;
    return html`
      <div class="panel" id="catalog-list">
        <div class="cache-panel-header">
          <span class="status" id="catalog-status" title=${snap ? `snapshot ${snap.snapshot_id}` : ""}>
            ${snap ? html`captured ${formatWhen(snap.captured_at)} · ${snap.complete ? "complete" : "partial"}` : this._loading ? "loading…" : "no snapshot"}
          </span>
          <span class="spacer"></span>
          <span class="refresh-action">
            <span
              class="refresh-list-label"
              id="catalog-refresh-all-label"
              role="button"
              tabindex=${locked ? -1 : 0}
              aria-disabled=${String(locked)}
              @click=${locked ? null : this._refreshAll}
              @keydown=${locked ? null : (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this._refreshAll(); } }}
            >${allSpinning ? this._refresh?.text : "Refresh all"}</span>
            <button class="icon-btn ${allSpinning ? "spinning" : ""}" id="catalog-refresh-all" type="button" ?disabled=${locked} title="POST /snapshot/refresh: read the whole hub" aria-label="Refresh all" @click=${this._refreshAll}>${icon(mdiRefresh)}</button>
          </span>
        </div>
        ${this._notice ? html`<div class="notice" id="catalog-notice">${this._notice}</div>` : nothing}
        <div class="cache-panel-body" id="catalog-rows">
          ${rows.length
            ? rows.map((e) => this._renderEntry(e))
            : html`<div class="cache-state">${this._loading ? "Loading…" : kind === "device" ? "No devices." : "No activities."}</div>`}
        </div>
        <div class="hint ids-hint">DevID is what <code>POST /send</code> takes as <code>entity_id</code>, ComID as <code>command_id</code>. Rows come from the server's cache, read from the hub on first sight; the refresh button on a row re-reads that entity from the hub.</div>
      </div>
    `;
  }

  private _renderEntry(e: CatalogEntry): TemplateResult {
    const key = entryKey(e.kind, e.id);
    const isOpen = this._open === key;
    const locked = this._locked;
    const spinning = this._refresh?.key === key;
    const count = countLine(e.kind, e.counts) ?? (e.kind === "device" ? e.device?.device_class ?? "device" : "activity");
    const fetched = e.fetched_at ? `read from the hub ${formatWhen(e.fetched_at)}${e.complete ? "" : ", incomplete"}` : "not read from the hub in full yet";
    return html`<div class="entity-block ${isOpen ? "open" : ""}" data-entity=${key} data-entity-id=${e.id}>
      <div class="entity-summary" @click=${() => this._toggle(e)}>
        <span class="entity-name">
          <span class="entity-name-icon">${icon(e.kind === "device" ? deviceClassIconPath(e.device?.device_class) : mdiPlayCircleOutline)}</span>
          <span class="entity-name-copy">
            <span class="entity-name-label">${e.name}</span>
            <span class="entity-count">${count}</span>
          </span>
        </span>
        <span class="entity-meta">
          ${badge(DEV_ID_BADGE, e.id)}
          ${e.kind === "device"
            ? html`<button class="icon-btn entity-edit" type="button" ?disabled=${locked} title="Edit device" aria-label="Edit device" @click=${(event: Event) => { event.stopPropagation(); this._edit(e); }}>${icon(mdiWrench)}</button>`
            : nothing}
          <button class="icon-btn entity-refresh ${spinning ? "spinning" : ""}" type="button" ?disabled=${locked} title=${`${e.kind === "device" ? "Refresh device" : "Refresh activity"} (${fetched})`} aria-label=${e.kind === "device" ? "Refresh device" : "Refresh activity"} @click=${(event: Event) => { event.stopPropagation(); this._refreshEntry(e); }}>${icon(mdiRefresh)}</button>
          <span class="entity-chevron">▼</span>
        </span>
      </div>
      ${isOpen ? html`<div class="entity-body">${this._renderBody(e, key)}</div>` : nothing}
    </div>`;
  }

  private _renderBody(e: CatalogEntry, key: string): TemplateResult {
    const detail = this._details[key];
    if (!detail) {
      if (this._detailNotice) return html`<div class="inner-notice" id="catalog-detail-notice">${this._detailNotice}</div>`;
      return html`<div class="inner-empty">Loading…</div>`;
    }
    const notice = this._detailNotice ? html`<div class="inner-notice" id="catalog-detail-notice">${this._detailNotice}</div>` : nothing;
    if (detail.kind === "device") {
      return html`${notice}${detail.commands.length
        ? detail.commands.map((c) => html`<div class="inner-row"><span class="inner-label">${c.label}</span><span class="inner-badges">${badge(COM_ID_BADGE, c.command_id)}</span></div>`)
        : html`<div class="inner-empty">No cached commands.</div>`}`;
    }
    const bound = boundButtons(detail.buttons);
    const half = Math.ceil(bound.length / 2);
    const columns = [bound.slice(0, half), bound.slice(half)];
    return html`${notice}
      ${detail.favorites.length ? html`<div class="inner-section-label">Favorites</div>${detail.favorites.map((f) => html`<div class="inner-row"><span class="inner-label">${f.label || `Favorite ${f.command_id}`}</span><span class="inner-badges">${badge(DEV_ID_BADGE, f.device_id)}${badge(COM_ID_BADGE, f.command_id)}</span></div>`)}` : nothing}
      ${detail.macros.length ? html`<div class="inner-section-label">Macros</div>${detail.macros.map((m) => html`<div class="inner-row"><span class="inner-label">${m.label || `Macro ${m.command_id}`}</span><span class="inner-badges">${badge(FAV_ID_BADGE, m.command_id)}${badge(COM_ID_BADGE, m.command_id)}</span></div>`)}` : nothing}
      ${bound.length ? html`<div class="inner-section-label">Buttons</div><div class="buttons-grid">${columns.map((column) => html`<div class="buttons-col">${column.map((b) => html`<div class="inner-row"><span class="inner-label">${b.name || `Button ${b.button_code}`}</span><span class="inner-badges">${badge(COM_ID_BADGE, b.button_code)}</span></div>`)}</div>`)}</div>` : nothing}
      ${!detail.favorites.length && !detail.macros.length && !bound.length ? html`<div class="inner-empty">No cached data yet.</div>` : nothing}
    `;
  }
}

function countsOf(detail: Detail): EntityCounts {
  if (detail.kind === "device") return { commands: detail.commands.length };
  return { favorites: detail.favorites.length, macros: detail.macros.length, buttons: boundButtons(detail.buttons).length };
}

export function defineCatalogView(): void {
  if (!customElements.get(CATALOG_VIEW_TAG)) customElements.define(CATALOG_VIEW_TAG, SbPanelCatalog);
}
