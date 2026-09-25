// The panel's routes (docs/internal/server-panel-state-plan.md, decision
// 9): `#/<hubId>/<tab>/<sub>` for the hub tabs and `#/<page>/<sub>` for
// the pages under the cog menu (Hub settings, Server settings, Debug); the Hub tab's
// subtabs take an optional fourth segment, an entity id, which opens that
// entity's editor (`#/<hubId>/hub/devices/12`; device editor plan,
// decision 2); the Wifi Commands tab's fourth segment is a Wifi Device's
// key (`#/<hubId>/wifi/devices/a1b2c3d4`; wifi commands plan, section 3).
// Every tab and
// every page has subtabs, which double as the headers of what they hold,
// even when there is only one. The URL is the source of truth; the
// persisted preferences only fill in a bare one. The first panel's
// `#hubs`, `#catalog`, `#remote`, `#api` and `#events`, and the first
// shell's `#/api` and `#/events`, still resolve so old bookmarks land.

export const HUB_TABS = ["hub", "wifi", "backup", "remote"] as const;
export type HubTab = (typeof HUB_TABS)[number];

// The Hub tab's subtabs follow the HA control panel card: Activities first.
export const SUBTABS: Record<HubTab, readonly string[]> = {
  hub: ["activities", "devices"],
  wifi: ["devices"],
  backup: ["make", "edit", "restore"],
  remote: ["card", "layout"],
};

export const TAB_LABELS: Record<HubTab, string> = { hub: "Hub", wifi: "Wifi Commands", backup: "Backup", remote: "Remote" };

export const TOOL_PAGES = ["setup", "server", "debug"] as const;
export type ToolPage = (typeof TOOL_PAGES)[number];
export const TOOL_LABELS: Record<ToolPage, string> = { setup: "Hub settings", server: "Server settings", debug: "Debug" };

export const TOOL_SUBTABS: Record<ToolPage, readonly string[]> = {
  setup: ["hubs"],
  server: ["status", "mqtt", "access"],
  debug: ["api", "events"],
};

export const SUBTAB_LABELS: Record<string, string> = {
  activities: "Activities",
  devices: "Devices",
  make: "Make",
  edit: "Edit",
  restore: "Restore",
  card: "Card",
  layout: "Layout",
  hubs: "Hubs",
  status: "Status",
  access: "Access",
  mqtt: "MQTT broker",
  api: "API console",
  events: "Event stream",
  // A subtab id can repeat across tabs; `<tab>/<sub>` wins over the bare id.
  "wifi/devices": "Wifi Devices",
};

/** The subtab's label under its tab or tool page. */
export function subtabLabel(scope: string, sub: string): string {
  return SUBTAB_LABELS[`${scope}/${sub}`] ?? SUBTAB_LABELS[sub] ?? sub;
}

export type Route =
  | { kind: "hub"; hubId: string | null; tab: HubTab; sub: string; entity?: number; item?: string }
  | { kind: "tool"; page: ToolPage; sub: string };

export function isHubTab(value: unknown): value is HubTab {
  return typeof value === "string" && (HUB_TABS as readonly string[]).includes(value);
}

export function isToolPage(value: unknown): value is ToolPage {
  return typeof value === "string" && (TOOL_PAGES as readonly string[]).includes(value);
}

/** The tab's first subtab, or the one given when it belongs to the tab. */
export function normalizeSub(tab: HubTab, sub: string | null | undefined): string {
  const subs = SUBTABS[tab];
  return sub && subs.includes(sub) ? sub : subs[0];
}

/** An entity id belongs on the Hub tab only; anything else drops it. */
export function normalizeEntity(tab: HubTab, entity: unknown): number | undefined {
  if (tab !== "hub") return undefined;
  const id = typeof entity === "number" ? entity : typeof entity === "string" && /^\d+$/.test(entity) ? Number(entity) : NaN;
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

/** A Wifi Device's key belongs on the Wifi Commands tab only; anything else drops it. */
export function normalizeItem(tab: HubTab, item: unknown): string | undefined {
  if (tab !== "wifi" || typeof item !== "string") return undefined;
  return /^[A-Za-z0-9_-]{1,32}$/.test(item) ? item : undefined;
}

export function hubRoute(hubId: string | null, tab: HubTab = "hub", sub?: string | null, entity?: number | null, item?: string | null): Route {
  const id = normalizeEntity(tab, entity);
  const key = normalizeItem(tab, item);
  const route: Route = { kind: "hub", hubId, tab, sub: normalizeSub(tab, sub) };
  if (id !== undefined) route.entity = id;
  if (key !== undefined) route.item = key;
  return route;
}

/** The page's first subtab, or the one given when it belongs to the page. */
export function normalizeToolSub(page: ToolPage, sub: string | null | undefined): string {
  const subs = TOOL_SUBTABS[page];
  return sub && subs.includes(sub) ? sub : subs[0];
}

export function toolRoute(page: ToolPage, sub?: string | null): Route {
  return { kind: "tool", page, sub: normalizeToolSub(page, sub) };
}

const LEGACY: Record<string, Route> = {
  hubs: toolRoute("setup"),
  catalog: hubRoute(null, "hub"),
  remote: hubRoute(null, "remote"),
  api: toolRoute("debug", "api"),
  events: toolRoute("debug", "events"),
};

/** `#/<hubId>/<tab>/<sub>` or `#/<page>` to a route; null for a bare or unknown hash. */
export function parseRoute(hash: string): Route | null {
  const raw = hash.replace(/^#/, "");
  if (!raw) return null;
  if (!raw.startsWith("/")) return LEGACY[raw] ?? null;
  const parts = raw.split("/").filter(Boolean).map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  if (!parts.length) return null;
  if (isToolPage(parts[0])) return toolRoute(parts[0], parts[1]);
  // The first shell's single-segment pages.
  if (parts.length === 1 && (parts[0] === "api" || parts[0] === "events")) return toolRoute("debug", parts[0]);
  const [first, tab, sub, entity] = parts;
  const hubId = first === "-" ? null : first;
  if (tab !== undefined && !isHubTab(tab)) return hubRoute(hubId, "hub");
  return hubRoute(hubId, tab ?? "hub", sub, normalizeEntity(tab ?? "hub", entity), normalizeItem(tab ?? "hub", entity));
}

export function hashFor(route: Route): string {
  if (route.kind === "tool") return `#/${route.page}/${route.sub}`;
  const hub = route.hubId ? encodeURIComponent(route.hubId) : "-";
  const tail = route.entity !== undefined ? `/${route.entity}` : route.item !== undefined ? `/${encodeURIComponent(route.item)}` : "";
  return `#/${hub}/${route.tab}/${route.sub}${tail}`;
}

/** The draft scope of a hub route: `hub/devices` for a list, `hub/devices/12` for an editor. */
export function routeScope(route: Route): string {
  if (route.kind === "tool") return `${route.page}/${route.sub}`;
  return `${route.tab}/${route.sub}${route.entity !== undefined ? `/${route.entity}` : route.item !== undefined ? `/${route.item}` : ""}`;
}

export function sameRoute(a: Route, b: Route): boolean {
  return hashFor(a) === hashFor(b);
}

/** A hub route re-pointed at a hub (the selection moved); tool routes are left alone. */
export function withHub(route: Route, hubId: string | null): Route {
  return route.kind === "hub" ? { ...route, hubId } : route;
}
