// Pure helpers for the control panel: what a hub record means in one
// phrase, names, dates, the theme choice, and the little persisted
// preferences (the routes live in panel-route.ts). No DOM, so the node
// tests cover them directly.

import type { HubView, SeenHub } from "./panel-api";
import { isHubTab, normalizeSub, SUBTABS, type HubTab } from "./panel-route";

export type Tone = "ok" | "warn" | "err" | "off";

/** One phrase for a hub record plus its status snapshot. */
export function hubState(hub: HubView): { text: string; tone: Tone } {
  if (!hub.enabled) return { text: "disabled", tone: "off" };
  const s = hub.status;
  if (!s) return { text: "not running: the proxy did not start", tone: "err" };
  if (s.mode === "disconnected" || !s.hub_connected) return { text: "waiting for the hub to connect", tone: "warn" };
  if (s.mode === "observe") return { text: s.app_connected ? "observing: the app holds the hub" : "observing", tone: "warn" };
  return { text: s.catalog_ready ? "connected, in control" : "connected, first sync running", tone: "ok" };
}

/** The configured name, else the hub's own banner name, else its id. */
export function hubDisplayName(hub: Pick<HubView, "hub_id" | "config" | "hub_name">): string {
  return hub.config?.name || hub.hub_name || hub.hub_id;
}

/** Match advertisements against current registrations, including address-to-MAC rekeys.
 * A stale discovery reference must not hide a hub after it is unregistered. */
export function unregisteredHubs(seen: SeenHub[], hubs: HubView[]): SeenHub[] {
  const macKey = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
  return seen.filter((s) => !hubs.some((h) => {
    const mac = macKey(s.config.mac);
    return h.hub_id === s.registered_hub_id || h.config.host === s.config.host ||
      Boolean(mac && (mac === macKey(h.config.mac) || mac === h.hub_id));
  }));
}

/** A local date-time, or "never". */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "never";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleString();
}

/** What to say after a lifecycle action succeeded. */
export function actionOutcome(action: "enable" | "disable" | "remove", record: HubView | null): string {
  if (action === "enable") return record?.enabled ? "started" : "enabled";
  return action === "disable" ? "disabled" : "removed";
}

export const THEMES = ["auto", "light", "dark"] as const;
export type ThemeChoice = (typeof THEMES)[number];

export function isTheme(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

export function nextTheme(current: ThemeChoice): ThemeChoice {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
}

/** What a bare URL is filled in from (state plan, decision 9): the last
 *  hub, tab and subtab, and the theme. */
export interface PanelPrefs {
  hub: string | null;
  tab: HubTab;
  sub: string;
  theme: ThemeChoice;
}

const PREFS_KEY = "sofabaton-panel";

export function loadPrefs(storage: Pick<Storage, "getItem"> | null): PanelPrefs {
  const prefs: PanelPrefs = { hub: null, tab: "hub", sub: SUBTABS.hub[0], theme: "auto" };
  if (!storage) return prefs;
  try {
    const raw = storage.getItem(PREFS_KEY);
    if (!raw) return prefs;
    const data = JSON.parse(raw) as Partial<PanelPrefs> & { view?: string };
    if (typeof data.hub === "string") prefs.hub = data.hub;
    if (isHubTab(data.tab)) prefs.tab = data.tab;
    else if (data.view === "remote") prefs.tab = "remote";   // the first panel's preference
    prefs.sub = normalizeSub(prefs.tab, typeof data.sub === "string" ? data.sub : null);
    if (isTheme(data.theme)) prefs.theme = data.theme;
  } catch {
    // A broken or blocked storage is the same as none.
  }
  return prefs;
}

export function savePrefs(storage: Pick<Storage, "setItem"> | null, prefs: PanelPrefs): void {
  if (!storage) return;
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or a full store: the panel still works.
  }
}

/** Requests the API view remembers (method, path, query, body, status, time). */
export interface HistoryEntry {
  method: string;
  path: string;
  query: string;
  body: string;
  status: number;
  at: string;
}

const HISTORY_KEY = "sofabaton-panel-history";
export const HISTORY_LIMIT = 30;

export function loadHistory(storage: Pick<Storage, "getItem"> | null): HistoryEntry[] {
  if (!storage) return [];
  try {
    const data = JSON.parse(storage.getItem(HISTORY_KEY) || "[]") as unknown;
    return Array.isArray(data) ? (data as HistoryEntry[]).slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

export function saveHistory(storage: Pick<Storage, "setItem"> | null, history: HistoryEntry[]): void {
  if (!storage) return;
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  } catch {
    // ignored
  }
}

/** Pretty-print JSON text when it parses; return it untouched otherwise. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** `Name: value` lines to a header map; lines without a colon are skipped. */
export function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    const name = line.slice(0, i).trim();
    if (name) out[name] = line.slice(i + 1).trim();
  }
  return out;
}
