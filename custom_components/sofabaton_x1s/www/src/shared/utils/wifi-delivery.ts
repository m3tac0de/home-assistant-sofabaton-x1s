// How Wifi Command presses reach Home Assistant, as the control panel words
// it (docs/internal/wifi-webhook-transport-plan.md §4.4): one line built from
// what was actually deployed, and the TCP flow to allow when the deploy's
// test press did not arrive. Pure functions; the panel renders them.

import type { WifiDelivery, WifiDeliveryInfo } from "../ha-context";
import { DOC_URLS } from "../doc-links";
import { TOOLS_CARD_STRINGS, toolsCardLanguage } from "../../strings";

export type WifiTransport = "http" | "mqtt";

/** The deployed transport: `http` (the listener) or `mqtt`; null for
 *  anything else (not deployed, or a device that needs a Sync first). */
export function deployedTransport(value: unknown): WifiTransport | null {
  const text = String(value ?? "").trim().toLowerCase();
  return text === "http" || text === "mqtt" ? text : null;
}

/** `host:port` of an origin such as `https://192.168.2.50:8123` (a bare
 *  `host:port` passes through). */
export function targetHostPort(target: string): string {
  const text = String(target ?? "").trim();
  const match = /^[a-z]+:\/\/([^/?#]+)/i.exec(text);
  return match ? match[1] : text;
}

/** The port of a target, "" when it names none. */
export function targetPort(target: string): string {
  const hostPort = targetHostPort(target);
  const index = hostPort.lastIndexOf(":");
  return index >= 0 ? hostPort.slice(index + 1) : "";
}

/** The test press (or a real press) did not arrive: the device needs the
 *  user's attention. */
export function deliveryFailed(delivery: WifiDelivery | null | undefined): boolean {
  const status = String(delivery?.status ?? "");
  return status === "not_delivered" || status === "not_sent";
}

/** The "How presses reach Home Assistant" line. */
export function deliveryPathText(info: Pick<WifiDeliveryInfo, "transport" | "target">): string {
  const S = TOOLS_CARD_STRINGS.wifiDelivery;
  const transport = deployedTransport(info.transport);
  if (transport === "mqtt") return S.pathMqtt(info.target);
  if (transport === "http") return S.pathListener(info.target);
  return "";
}

/** The TCP flow to allow, naming the actual addresses. */
export function deliveryAllowText(info: Pick<WifiDeliveryInfo, "transport" | "target" | "hub_ip">): string {
  const S = TOOLS_CARD_STRINGS.wifiDelivery;
  const transport = deployedTransport(info.transport);
  const hubIp = String(info.hub_ip ?? "").trim() || "?";
  if (transport === "mqtt") return S.allowMqtt(info.target);
  if (transport === "http") return S.allowListener(hubIp, targetPort(info.target) || "8060");
  return "";
}

/** The networking guide section that matches the transport. */
export function deliveryDocUrl(transport: unknown): string {
  return deployedTransport(transport) === "mqtt" ? DOC_URLS.networkingMqtt : DOC_URLS.networkingWifi;
}

/** When a delivery check ran, as "5 minutes ago" in the selected locale;
 *  "" when the time is missing or unreadable. */
export function formatCheckedAgo(
  checkedAt: string | null | undefined,
  now = Date.now(),
  locale = toolsCardLanguage(),
): string {
  const time = Date.parse(String(checkedAt ?? ""));
  if (!Number.isFinite(time)) return "";
  const seconds = Math.round((time - now) / 1000);
  const size = Math.abs(seconds);
  const [value, unit]: [number, Intl.RelativeTimeFormatUnit] = size < 60
    ? [seconds, "second"]
    : size < 3600
      ? [Math.round(seconds / 60), "minute"]
      : size < 86400
        ? [Math.round(seconds / 3600), "hour"]
        : [Math.round(seconds / 86400), "day"];
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
  } catch {
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(value, unit);
  }
}

/** Seconds as the panel shows them: one decimal. */
export function formatLatency(seconds: number | null | undefined, locale = toolsCardLanguage()): string {
  if (seconds == null) return "?";
  const value = Number(seconds);
  if (!Number.isFinite(value)) return "?";
  try {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  } catch {
    return new Intl.NumberFormat("en", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  }
}
