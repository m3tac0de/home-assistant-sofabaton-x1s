import type { CacheHubState } from "../shared/ha-context";

export interface BlobDeviceOption {
  value: string;
  label: string;
  deviceClass: string;
  commandCount: number;
}

export interface BlobCommandOption {
  value: string;
  label: string;
}

export function blobDeviceOptions(hub: CacheHubState | null): BlobDeviceOption[] {
  return [...(hub?.devices_list ?? [])]
    .map((device) => ({
      value: String(Number(device.id)),
      label: String(device.name || `Device ${Number(device.id)}`),
      deviceClass: String(device.device_class || ""),
      commandCount: Number(device.command_count || 0),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function blobCommandOptions(hub: CacheHubState | null, deviceId: number | null): BlobCommandOption[] {
  if (!hub || !Number.isInteger(deviceId)) return [];
  const commands = hub.commands?.[String(deviceId)] ?? {};
  return Object.entries(commands)
    .map(([id, label]) => ({
      value: String(Number(id)),
      label: String(label || `Command ${id}`),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function blobFetchBlockedReason(params: {
  persistentCacheEnabled: boolean;
  selectedDeviceId: number | null;
  commandCount: number;
}) {
  if (!params.persistentCacheEnabled) return "cache_disabled";
  if (Number.isInteger(params.selectedDeviceId) && params.commandCount <= 0) return "no_commands";
  return null;
}
