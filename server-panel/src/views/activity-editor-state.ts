// The activity editor's own pure helpers (docs/internal/server-panel-activity-editor-plan.md).
// The HA card's bundle helpers are imported by the editor itself; this module
// holds what the panel adds: the callback device's slots as the panel's Wifi
// Events (plan decision 9) and the target kind of a binding or a step.

import type { BackupBundleDevicePayload, BackupBundlePayload } from "../../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { wifiEventsSlotCount } from "./device-editor-state";
import { entityElement } from "./entity-editor-state";

/**
 * The "Wifi Event" type in the editor's dialogs. OFF (Marcel, 2026-09-19): how
 * the server's callback device should be managed (repair when it is out of
 * sync, a changed port, MQTT later) is still open, so the editor offers no
 * Wifi Events and treats the callback device as an ordinary device. The
 * helpers below and the editor's wiring stay for when that is decided.
 */
export const WIFI_EVENTS_ENABLED = false;

/** What a shortcut, a binding leg or a step points at (the card's `ActivityBindingTargetKind`). */
export type ActivityTargetKind = "command" | "action" | "wifi_event";

export interface WifiEventSlot {
  /** Zero-based slot; the short record is command `slot + 1`, the long record `slot + 1 + slotCount`. */
  slot: number;
  label: string;
  shortCommandId: number;
  longCommandId: number;
}

/** The callback device's slots, read from its element in the snapshot; empty when it is not deployed (or stale). */
export function wifiEventSlots(bundle: BackupBundlePayload | null, callbackDeviceId: number | null): WifiEventSlot[] {
  if (callbackDeviceId == null) return [];
  const element = entityElement(bundle, "device", callbackDeviceId) as BackupBundleDevicePayload | null;
  const count = wifiEventsSlotCount(element);
  if (!element || count <= 0) return [];
  return (element.commands ?? [])
    .map((row) => ({ id: Number(row?.command_id ?? 0), name: String(row?.name ?? "").trim() }))
    .filter((row) => row.id >= 1 && row.id <= count)
    .sort((a, b) => a.id - b.id)
    .map((row) => ({ slot: row.id - 1, label: row.name || `Button ${row.id}`, shortCommandId: row.id, longCommandId: row.id + count }));
}

/** The card's `_bindingTargetKindFor`: the activity itself is a macro target, the callback device a Wifi Event. */
export function targetKindFor(activityId: number, callbackDeviceId: number | null, wifiEventsAvailable: boolean, deviceId: number | null | undefined): ActivityTargetKind {
  const id = Number(deviceId || 0);
  if (id === Number(activityId)) return "action";
  if (wifiEventsAvailable && callbackDeviceId != null && id === Number(callbackDeviceId)) return "wifi_event";
  return "command";
}
