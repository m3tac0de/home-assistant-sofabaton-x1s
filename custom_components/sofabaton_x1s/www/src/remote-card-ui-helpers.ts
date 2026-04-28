import { DEFAULT_KEY_LABELS, HARD_BUTTON_ICONS } from "./remote-card-layout";

export function automationAssistLabelForKey(key: any, label: any) {
  const trimmed = String(label ?? "").trim();
  if (trimmed) return trimmed;
  const fallback = DEFAULT_KEY_LABELS[String(key ?? "").toLowerCase()];
  if (fallback) return fallback;
  if (!key) return "Button";
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function rgbToCss(rgb: any) {
  if (Array.isArray(rgb) && rgb.length >= 3) {
    const r = Number(rgb[0]);
    const g = Number(rgb[1]);
    const b = Number(rgb[2]);
    if ([r, g, b].some((n) => Number.isNaN(n))) return "";
    return `rgb(${r}, ${g}, ${b})`;
  }
  if (
    rgb &&
    typeof rgb === "object" &&
    rgb.r != null &&
    rgb.g != null &&
    rgb.b != null
  ) {
    const r = Number(rgb.r);
    const g = Number(rgb.g);
    const b = Number(rgb.b);
    if ([r, g, b].some((n) => Number.isNaN(n))) return "";
    return `rgb(${r}, ${g}, ${b})`;
  }
  return "";
}

export function syncStatusTone(status: string) {
  if (status === "failed") return "error";
  if (status === "success") return "ok";
  if (status === "running") return "running";
  return "idle";
}

export function commandSlotIcon(hardButton: any) {
  if (!hardButton) return "mdi:gesture-tap-button";
  return HARD_BUTTON_ICONS[String(hardButton)] || "mdi:gesture-tap-button";
}

export function commandSlotIconColor(hardButton: any) {
  const key = String(hardButton || "");
  if (key === "red") return "#ef4444";
  if (key === "green") return "#22c55e";
  if (key === "yellow") return "#facc15";
  if (key === "blue") return "#3b82f6";
  return null;
}

export function isCommandConfigured(
  command: any,
  defaults: any,
  hasCustomAction: (action: any) => boolean,
) {
  const hasCustomName =
    String(command?.name || "").trim() !== String(defaults.name);
  const hasFavorite =
    Boolean(command?.add_as_favorite) !== Boolean(defaults.add_as_favorite);
  const hasHardButton = Boolean(command?.hard_button);
  const hasActivities =
    Array.isArray(command?.activities) && command.activities.length > 0;
  const hasCustomTriggeredAction = hasCustomAction(command?.action);
  const hasCustomLongPressAction =
    Boolean(command?.long_press_enabled) &&
    hasCustomAction(command?.long_press_action);
  return (
    hasCustomName ||
    hasFavorite ||
    hasHardButton ||
    Boolean(command?.long_press_enabled) ||
    hasActivities ||
    hasCustomTriggeredAction ||
    hasCustomLongPressAction
  );
}
