// Pure generators for the Automation Assist output: the remote service-call
// YAML, the Lovelace button-card YAML, and the persistent-notification body.
// Extracted from the legacy card class; no DOM or card state — everything
// comes in through the capture object.

import { str } from "./remote-card-strings";

export interface AutomationAssistCapture {
  /** "button" (default), "activity" (started), or "power" (powered off). */
  kind?: string;
  label?: string;
  icon?: string | null;
  commandId?: number;
  deviceId?: number;
  /** "assigned" | "macro" | "favorite" — selects the X2 payload type. */
  commandType?: string;
  activityId?: number | string | null;
  activityName?: string;
}

export function automationAssistRemoteYaml(
  capture: AutomationAssistCapture | null | undefined,
  entityId: unknown,
  hubIntegration: boolean,
): string {
  if (!capture || !entityId) return "";

  const kind = capture.kind || "button";

  if (kind === "activity") {
    if (hubIntegration) {
      if (!Number.isFinite(Number(capture.activityId))) return "";
      return [
        "action: remote.send_command",
        "target:",
        `  entity_id: ${entityId}`,
        "data:",
        "  command:",
        "    - type:start_activity",
        `    - activity_id:${capture.activityId}`,
      ].join("\n");
    }

    return [
      "action: remote.turn_on",
      "target:",
      `  entity_id: ${entityId}`,
      "data:",
      `  activity: ${capture.activityName}`,
    ].join("\n");
  }

  if (kind === "power") {
    if (hubIntegration) {
      if (!Number.isFinite(Number(capture.activityId))) return "";
      return [
        "action: remote.send_command",
        "target:",
        `  entity_id: ${entityId}`,
        "data:",
        "  command:",
        "    - type:stop_activity",
        `    - activity_id:${capture.activityId}`,
      ].join("\n");
    }

    return [
      "action: remote.turn_off",
      "target:",
      `  entity_id: ${entityId}`,
    ].join("\n");
  }

  if (hubIntegration) {
    const payloadType =
      capture.commandType === "macro"
        ? "send_macro_key"
        : capture.commandType === "favorite"
          ? "send_favorite_key"
          : "send_assigned_key";

    const deviceKey =
      capture.commandType === "favorite" ? "device_id" : "activity_id";

    return [
      "action: remote.send_command",
      "target:",
      `  entity_id: ${entityId}`,
      "data:",
      "  command:",
      `    - type:${payloadType}`,
      `    - ${deviceKey}:${capture.deviceId}`,
      `    - key_id:${capture.commandId}`,
    ].join("\n");
  }

  return [
    "action: remote.send_command",
    "target:",
    `  entity_id: ${entityId}`,
    "data:",
    `  command: ${capture.commandId}`,
    `  device: ${capture.deviceId}`,
  ].join("\n");
}

export function automationAssistButtonYaml(
  capture: AutomationAssistCapture | null | undefined,
  entityId: unknown,
  hubIntegration: boolean,
): string {
  if (!capture || !entityId) return "";

  const kind = capture.kind || "button";
  const label = capture.label || str().assist.automationAssistName;
  const icon =
    kind === "activity"
      ? "mdi:television-classic"
      : kind === "power"
        ? "mdi:power"
        : capture.commandType === "favorite"
          ? "mdi:star"
          : capture.commandType === "macro"
            ? "mdi:cogs"
            : capture.icon || "mdi:remote";

  const serviceYaml = automationAssistRemoteYaml(capture, entityId, hubIntegration)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

  return [
    "type: button",
    `name: ${label}`,
    `icon: ${icon}`,
    "tap_action:",
    "  action: perform-action",
    "  perform_" + serviceYaml.substring(2),
    "hold_action:",
    "  action: none",
  ].join("\n");
}

export function automationAssistNotificationBody(
  capture: AutomationAssistCapture | null | undefined,
  entityId: unknown,
  hubIntegration: boolean,
  fallbackActivityName: string,
): string {
  if (!capture) return "";

  const kind = capture.kind || "button";
  const notify = str().assist.notification;
  const activityName =
    capture.activityName || fallbackActivityName || str().assist.unknown;
  const label = capture.label ?? "";
  const eventLabel =
    kind === "button"
      ? notify.eventButton(label)
      : kind === "activity"
        ? notify.eventActivity(label)
        : notify.eventOther(label);
  const buttonYaml = automationAssistButtonYaml(capture, entityId, hubIntegration);
  const remoteYaml = automationAssistRemoteYaml(capture, entityId, hubIntegration);

  return [
    "---",
    "",
    notify.header(activityName, eventLabel),
    "",
    "---",
    notify.lovelaceHeading,
    "",
    notify.lovelaceCopy,
    "```yaml",
    buttonYaml,
    "```",
    notify.serviceHeading,
    "",
    notify.serviceCopy,
    "```yaml",
    remoteYaml,
    "```",
  ].join("\n");
}
