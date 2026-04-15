import { html, svg } from "lit";
import type {
  CacheHubState,
  ControlPanelHubState,
  ControlPanelLogLine,
  ControlPanelSnapshot,
  HassLike,
} from "../ha-context";

const BUTTON_NAMES: Record<number, string> = {
  0x97: "C",
  0x98: "B",
  0x99: "A",
  0x9a: "Exit",
  0x9b: "Dvr",
  0x9c: "Play",
  0x9d: "Guide",
  0xae: "Up",
  0xaf: "Left",
  0xb0: "Ok",
  0xb1: "Right",
  0xb2: "Down",
  0xb3: "Back",
  0xb4: "Home",
  0xb5: "Menu",
  0xb6: "Vol Up",
  0xb7: "Ch Up",
  0xb8: "Mute",
  0xb9: "Vol Down",
  0xba: "Ch Down",
  0xbb: "Rew",
  0xbc: "Pause",
  0xbd: "Fwd",
  0xbe: "Red",
  0xbf: "Green",
  0xc0: "Yellow",
  0xc1: "Blue",
  0xc6: "Power On",
  0xc7: "Power Off",
};

export function selectedHub(snapshot: ControlPanelSnapshot): ControlPanelHubState | null {
  const hubs = snapshot.state?.hubs ?? [];
  return hubs.find((hub) => hub.entry_id === snapshot.selectedHubEntryId) ?? hubs[0] ?? null;
}

export function selectedHubCache(snapshot: ControlPanelSnapshot): CacheHubState | null {
  const hubs = snapshot.contents?.hubs ?? [];
  return hubs.find((hub) => hub.entry_id === snapshot.selectedHubEntryId) ?? hubs[0] ?? null;
}

export function persistentCacheEnabled(snapshot: ControlPanelSnapshot): boolean {
  return !!snapshot.state?.persistent_cache_enabled;
}

export function sortByName<T extends { name?: string; label?: string }>(items: T[] = []): T[] {
  return [...items].sort((left, right) =>
    String(left?.name ?? left?.label ?? "").localeCompare(String(right?.name ?? right?.label ?? "")),
  );
}

export function sortById<T extends { id?: number; button_id?: number }>(items: T[] = []): T[] {
  return [...items].sort(
    (left, right) => Number(left?.id ?? left?.button_id ?? 0) - Number(right?.id ?? right?.button_id ?? 0),
  );
}

export function hubActivities(hub: CacheHubState | null) {
  return sortById(hub?.activities ?? []);
}

export function hubDevices(hub: CacheHubState | null) {
  return sortByName(hub?.devices_list ?? []);
}

export function activityFavorites(hub: CacheHubState | null, activityId: number) {
  const rows = hub?.activity_favorites?.[String(activityId)] ?? [];
  return sortById(rows);
}

export function activityMacros(hub: CacheHubState | null, activityId: number) {
  return hub?.activity_macros?.[String(activityId)] ?? [];
}

export function activityButtons(hub: CacheHubState | null, activityId: number) {
  return (hub?.buttons?.[String(activityId)] ?? []).map(Number);
}

export function deviceCommands(hub: CacheHubState | null, deviceId: number) {
  const commands = hub?.commands?.[String(deviceId)] ?? {};
  return Object.entries(commands)
    .map(([id, label]) => ({ id: Number(id), label: String(label || `Command ${id}`) }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buttonName(buttonId: number) {
  return BUTTON_NAMES[buttonId] ?? `Button ${buttonId}`;
}

export function formatError(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  const candidateError = error as Record<string, unknown>;
  const candidates = [
    candidateError.message,
    (candidateError.error as Record<string, unknown> | undefined)?.message,
    (candidateError.body as Record<string, unknown> | undefined)?.message,
    candidateError.error,
    candidateError.code,
    candidateError.statusText,
    candidateError.type,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "Unknown error (check Home Assistant logs)";
}

export function formatLogEntry(entry: ControlPanelLogLine) {
  const rawLine = String(entry.line ?? entry.message ?? entry.msg ?? "");
  const level = String(entry.level ?? "log").toLowerCase();
  const levelToken = level.toUpperCase();

  const formattedMatch = rawLine.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d+|\.\d+)?)\s+(\S+)\s+([A-Z]+):\s*([\s\S]*)$/,
  );

  const rawTime = String(formattedMatch?.[1] ?? entry.timestamp ?? entry.time ?? entry.ts ?? "").trim();
  let message = formattedMatch?.[4] ?? String(entry.message ?? entry.msg ?? rawLine);

  const entryId = String(entry.entry_id ?? "").trim();
  if (entryId) {
    message = message.replace(new RegExp(`\\[${escapeRegExp(entryId)}\\]`, "g"), "");
  }

  message = message
    .replace(new RegExp(`^${escapeRegExp(levelToken)}:?\\s*`, "i"), "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    time: rawTime,
    level,
    message,
    prefix: levelToken,
    lineText: `${rawTime ? `${rawTime} ` : ""}${message}`.trim(),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function remoteEntities(hass: HassLike | null): string[] {
  return Object.keys(hass?.states ?? {}).filter((id) => id.startsWith("remote."));
}

export function entityForHub(hass: HassLike | null, hub: { entry_id: string } | null): string | null {
  if (!hub) return null;
  return (
    remoteEntities(hass).find((id) => hass?.states?.[id]?.attributes?.entry_id === hub.entry_id) ?? null
  );
}

export function remoteAttrsForHub(hass: HassLike | null, hub: { entry_id: string } | null) {
  const entityId = entityForHub(hass, hub);
  return (entityId ? hass?.states?.[entityId]?.attributes : undefined) ?? {};
}

export function remoteAvailableForHub(hass: HassLike | null, hub: { entry_id: string } | null) {
  const entityId = entityForHub(hass, hub);
  const stateObject = entityId ? hass?.states?.[entityId] : null;
  const state = String(stateObject?.state ?? "").toLowerCase();
  return !!state && state !== "unavailable" && state !== "unknown";
}

export function proxyClientConnected(hass: HassLike | null, hub: ControlPanelHubState | null) {
  const attrs = remoteAttrsForHub(hass, hub);
  if (typeof attrs.proxy_client_connected === "boolean") return attrs.proxy_client_connected;
  return !!hub?.proxy_client_connected;
}

export function hubConnected(hass: HassLike | null, hub: ControlPanelHubState | null) {
  return remoteAvailableForHub(hass, hub) || proxyClientConnected(hass, hub);
}

export function canRunHubActions(hass: HassLike | null, hub: ControlPanelHubState | null) {
  return remoteAvailableForHub(hass, hub);
}

export function cacheGenerationSnapshot(hass: HassLike | null) {
  const snapshot: Record<string, number> = {};
  for (const id of remoteEntities(hass)) {
    const attrs = hass?.states?.[id]?.attributes ?? {};
    const entryId = String(attrs.entry_id ?? "").trim();
    if (!entryId) continue;
    snapshot[entryId] = Number(attrs.cache_generation ?? 0);
  }
  return snapshot;
}

export function didHubGenerationChange(
  previous: Record<string, number> | null | undefined,
  next: Record<string, number> | null | undefined,
) {
  const prev = previous ?? {};
  const curr = next ?? {};
  return Object.keys(curr).some(
    (entryId) =>
      Object.prototype.hasOwnProperty.call(prev, entryId) && Number(curr[entryId] ?? 0) !== Number(prev[entryId] ?? 0),
  );
}

export function hassFingerprint(hass: HassLike | null) {
  return remoteEntities(hass)
    .sort()
    .map((id) => {
      const state = String(hass?.states?.[id]?.state ?? "");
      const attrs = hass?.states?.[id]?.attributes ?? {};
      return `${id};${attrs.entry_id ?? ""};${state};${attrs.proxy_client_connected ? "1" : "0"};${Number(attrs.cache_generation ?? 0)}`;
    })
    .join("||");
}

export function connectionFingerprint(hass: HassLike | null) {
  return remoteEntities(hass)
    .sort()
    .map((id) => {
      const state = String(hass?.states?.[id]?.state ?? "");
      const attrs = hass?.states?.[id]?.attributes ?? {};
      return `${id};${attrs.entry_id ?? ""};${state};${attrs.proxy_client_connected ? "1" : "0"}`;
    })
    .join("||");
}

export function hubIcon(kind: "hero" | "activities" | "devices" | "ip" | "version", classes = "") {
  const className = classes ? ` ${classes}` : "";
  if (kind === "hero") {
    return svg`<svg class=${className.trim()} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 421.04 173.01" aria-hidden="true" fill="currentColor">
      <path d="M87.39,45.33c0,21.03,50.51,44.46,123,44.46s123-23.43,123-44.46S282.87.87,210.39.87s-123,23.43-123,44.46Z"></path>
      <path d="M25.79,116h367c11.44,0,18.11-2.01,23.05-6.95,6.19-6.19,6.93-17.18,1.79-26.73l-28.97-54.94C375.65,4.75,344.58,0,320.79,0h-22.52c2.26.78,4.48,1.59,6.62,2.43,27.41,10.85,42.5,26.08,42.5,42.9s-15.09,32.05-42.5,42.9c-25.35,10.04-58.92,15.56-94.5,15.56s-69.15-5.53-94.5-15.56c-27.41-10.85-42.5-26.08-42.5-42.9S88.48,13.28,115.89,2.43c2.14-.85,4.36-1.65,6.62-2.43h-19.72c-23.82,0-54.95,4.77-67.92,27.47L1.18,85.93c-2.61,7.76-.85,15.91,4.88,22.46,5.4,6.3,13.71,7.61,19.73,7.61Z"></path>
      <path d="M25.79,130c-7.42,0-14.04-1.44-19.67-4.22,5.85,12.19,14.63,22.79,26.26,31.66,9.25,7.11,24.67,15.57,45.76,15.57h264c14.9,0,28.65-4.5,42.02-13.76,12.95-9.01,22.84-19.89,29.61-32.48-6.92,2.72-14.25,3.23-20.98,3.23H25.79Z"></path>
    </svg>`;
  }
  const icon = {
    activities: "mdi:play-circle-outline",
    devices: "mdi:remote",
    ip: "mdi:router-wireless",
    version: "mdi:cog-outline",
  }[kind];
  return html`<ha-icon class=${className.trim()} icon=${icon}></ha-icon>`;
}
