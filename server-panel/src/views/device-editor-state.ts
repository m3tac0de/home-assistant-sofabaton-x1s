// The device editor's own pure helpers (docs/internal/server-panel-device-editor-plan.md,
// section 6). The HA card's bundle helpers are imported from the card's
// tree by the editor itself; this module holds what the panel adds: the
// snapshot-to-bundle view, the draft scope, the name sanitiser copied from
// the card's edit-detail-view (the card keeps it inside its Lit element),
// the firmware floor and the Wifi Events pairing arithmetic.

import type { BackupBundleDevicePayload, BackupBundlePayload } from "../../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import type { Draft } from "../panel-store";
import type { SnapshotDocument } from "../panel-api";
import { entityDraftData, entityDraftScope, entityElement, withEntityElement } from "./entity-editor-state";

/** The library's `MIN_SUPPORTED_FIRMWARE` (lib/hub_versions.py), mirrored: below it the hub drops writes. */
export const MIN_SUPPORTED_FIRMWARE: Record<string, number> = { X1: 17, X1S: 5, X2: 5 };

/** The installed and required versions when the hub's firmware is below the floor; null when it is fine or unknown. */
export function firmwareUnsupported(hubVersion: string | null | undefined, firmware: number | null | undefined): { installed: number; required: number } | null {
  const required = MIN_SUPPORTED_FIRMWARE[String(hubVersion ?? "").toUpperCase()];
  if (required === undefined || firmware == null) return null;
  return firmware < required ? { installed: firmware, required } : null;
}

/** The snapshot document is the library's `hub_bundle` with the header merged in; the card's helpers read it as one. */
export function snapshotAsBundle(snapshot: SnapshotDocument): BackupBundlePayload {
  const doc = snapshot as unknown as Record<string, unknown>;
  return {
    ...(doc as object),
    kind: typeof doc.kind === "string" ? doc.kind : "hub_bundle",
    schema_version: typeof doc.schema_version === "number" ? doc.schema_version : 1,
    devices: Array.isArray(doc.devices) ? (doc.devices as BackupBundleDevicePayload[]) : [],
    activities: Array.isArray(doc.activities) ? (doc.activities as BackupBundlePayload["activities"]) : [],
  } as BackupBundlePayload;
}

export function deviceElement(bundle: BackupBundlePayload | null, deviceId: number): BackupBundleDevicePayload | null {
  return entityElement(bundle, "device", deviceId) as BackupBundleDevicePayload | null;
}

/** The bundle with one device element replaced (the draft's element spliced into a fresh snapshot). */
export function withDeviceElement(bundle: BackupBundlePayload, deviceId: number, element: BackupBundleDevicePayload): BackupBundlePayload {
  return withEntityElement(bundle, "device", deviceId, element);
}

/** Dirty is JSON inequality of the device element, as on the card (whole-bundle compare there). */
export function elementsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The draft scope (state plan decision 8): the editor's route scope. */
export function deviceDraftScope(deviceId: number): string {
  return entityDraftScope("device", deviceId);
}

export interface DeviceDraftData {
  element: BackupBundleDevicePayload;
}

/** The stored draft's element when it belongs to this device and looks like one; null otherwise. */
export function draftElementFor(draft: Draft | null | undefined, deviceId: number): BackupBundleDevicePayload | null {
  return (entityDraftData(draft, "device", deviceId)?.element ?? null) as BackupBundleDevicePayload | null;
}

// -- names ---------------------------------------------------------------------------------

/** X1S and X2 store UTF-16 names; the X1 only `[A-Za-z0-9 ]` (the card's rule). */
export function supportsUnicodeNames(hubVersion: string | null | undefined): boolean {
  const version = String(hubVersion ?? "").toUpperCase();
  return version.includes("X2") || version.includes("X1S");
}

/** The card's `sanitizeBundleName`: strip what the hub cannot store, cap at the 30-code-unit slot. */
export function sanitizeName(hubVersion: string | null | undefined, value: unknown): string {
  const pattern = supportsUnicodeNames(hubVersion)
    ? /[^\p{L}\p{N}\p{M} !-\/:-@\[-`{-~]+/gu
    : /[^A-Za-z0-9 ]+/g;
  return String(value ?? "").replace(pattern, "").slice(0, 30);
}

/** Device classes whose IP lives in the device head (the card's Network section); wifi_ip keeps it per command. */
export const IP_HEAD_DEVICE_CLASSES = new Set(["wifi_hue", "wifi_roku", "wifi_sonos"]);

export const IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

// -- Wifi Events pairing (the card's rules for the events device) ------------------------------

/** Half the command count: the slot count that defines the long-record offset. */
export function wifiEventsSlotCount(element: BackupBundleDevicePayload | null): number {
  return Math.floor((element?.commands?.length ?? 0) / 2);
}

/** A long-press record (id above the slot count) has no delete of its own; its short twin carries it. */
export function isLongRecord(element: BackupBundleDevicePayload | null, commandId: number): boolean {
  const slots = wifiEventsSlotCount(element);
  return slots > 0 && Number(commandId) > slots;
}
