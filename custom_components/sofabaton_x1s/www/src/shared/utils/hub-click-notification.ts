import type { HubClickItem } from "../ha-context";
import { TOOLS_CARD_STRINGS } from "../../strings";

// Persistent-notification payload for the Hub tab's "copy the command"
// click action. The body mirrors the remote card's Key capture
// (Automation Assist) notification: a context line, a ready-to-paste
// Lovelace button snippet, and the bare remote.send_command action YAML.

const KIND_ICONS: Record<HubClickItem["kind"], string> = {
  favorite: "mdi:star",
  macro: "mdi:cogs",
  button: "mdi:remote",
  command: "mdi:remote",
};

function serviceYaml(entityId: string, item: HubClickItem) {
  return [
    "action: remote.send_command",
    "target:",
    `  entity_id: ${entityId}`,
    "data:",
    `  command: ${item.commandId}`,
    `  device: ${item.targetId}`,
  ].join("\n");
}

function buttonYaml(entityId: string, item: HubClickItem) {
  return [
    "type: button",
    `name: ${item.label}`,
    `icon: ${KIND_ICONS[item.kind]}`,
    "tap_action:",
    "  action: perform-action",
    "  perform_action: remote.send_command",
    "  target:",
    `    entity_id: ${entityId}`,
    "  data:",
    `    command: ${item.commandId}`,
    `    device: ${item.targetId}`,
    "hold_action:",
    "  action: none",
  ].join("\n");
}

export function buildHubClickNotification(entityId: string, item: HubClickItem) {
  const S = TOOLS_CARD_STRINGS.hubClick;
  const contextKind = item.kind === "command" ? S.contextDevice : S.contextActivity;
  const message = [
    "---",
    "",
    `**${contextKind}: ${item.contextLabel} | ${S.kindLabels[item.kind]}: ${item.label}**`,
    "",
    "---",
    `📋 **${S.lovelaceHeading}**`,
    "",
    `*${S.lovelaceHint}*`,
    "```yaml",
    buttonYaml(entityId, item),
    "```",
    `⚙️ **${S.actionHeading}**`,
    "",
    `*${S.actionHint}*`,
    "```yaml",
    serviceYaml(entityId, item),
    "```",
  ].join("\n");

  return { title: S.notificationTitle, message };
}
