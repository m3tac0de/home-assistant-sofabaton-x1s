import { str } from "./remote-card-strings";

export function automationAssistLabelForKey(key: any, label: any) {
  const trimmed = String(label ?? "").trim();
  if (trimmed) return trimmed;
  const fallback = str().keys[String(key ?? "").toLowerCase()];
  if (fallback) return fallback;
  if (!key) return str().assist.buttonFallback;
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
