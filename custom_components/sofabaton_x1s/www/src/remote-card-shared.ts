// Constants and window-cache helpers shared by the remote card, its editor,
// and the registration entry.
//
// CARD_VERSION stays embedded (and logPillsOnce keeps printing it): the
// remote card also ships STANDALONE via HACS (separate repo, README +
// compiled js only) for users of the official X2 integration, and the
// console banner is how those installs report their version. Do not replace
// this with the tools-card import.meta.url versioning.

export const CARD_NAME = "Sofabaton Virtual Remote";
export const CARD_VERSION = "0.1.8";
export const KEY_CAPTURE_HELP_URL =
  "https://github.com/m3tac0de/sofabaton-virtual-remote/blob/main/docs/keycapture.md";
export const LOG_ONCE_KEY = `__${CARD_NAME}_logged__`;
export const AUTOMATION_ASSIST_SESSION_KEY = "__sofabatonAutomationAssistSession__";
export const PREVIEW_ACTIVITY_CACHE_KEY = "__sofabatonPreviewActivityCache__";
export const TYPE = "sofabaton-virtual-remote";
export const EDITOR = "sofabaton-virtual-remote-editor";

type PreviewCache = Record<string, string>;

const previewCache = (): PreviewCache | null => {
  if (typeof window === "undefined") return null;
  const cache = (window as unknown as Record<string, unknown>)[
    PREVIEW_ACTIVITY_CACHE_KEY
  ];
  return cache && typeof cache === "object" ? (cache as PreviewCache) : null;
};

export const readPreviewActivity = (entityId: unknown): string | null => {
  if (!entityId) return null;
  const cache = previewCache();
  if (!cache) return null;
  return cache[String(entityId)] ?? null;
};

export const writePreviewActivity = (entityId: unknown, value: unknown): void => {
  if (!entityId || typeof window === "undefined") return;
  const cache = previewCache() ?? {};
  cache[String(entityId)] = value == null ? "" : String(value);
  (window as unknown as Record<string, unknown>)[PREVIEW_ACTIVITY_CACHE_KEY] =
    cache;
};

export function logPillsOnce(): void {
  const win = window as unknown as Record<string, unknown>;
  if (win[LOG_ONCE_KEY]) return;
  win[LOG_ONCE_KEY] = true;

  // Base pill styling (console supports these reliably)
  const base =
    "padding:2px 10px;" +
    "border-radius:999px;" +
    "font-weight:700;" +
    "font-size:12px;" +
    "line-height:18px;";

  const red = base + "background:#ef4444;color:#fff;";
  const green = base + "background:#22c55e;color:#062b12;";
  const yellow = base + "background:#facc15;color:#111827;";
  const blue = base + "background:#3b82f6;color:#fff;";

  // A tiny spacer between pills (just normal text)
  const gap = "color:transparent;"; // keeps spacing without visible characters

  console.log(
    `%cSofabaton%c %c Virtual %c %c  Remote  %c %c   ${CARD_VERSION}   `,
    red,
    gap,
    green,
    gap,
    yellow,
    gap,
    blue,
  );
}

export function stableJsonSignature(value: unknown): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return String(value);
  }
}
