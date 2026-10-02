// The remote card's backend port (docs/internal/web-remote-plan.md, section
// 4.1). The store talks to a hub only through this interface; the HA adapter
// (ha-backend.ts) wraps the Lovelace `hass` object, and the server adapter
// (server-backend.ts) wraps sofabaton-x-server's REST + WebSocket API.
//
// The snapshot deliberately keeps the remote entity's attribute contract
// (`RemoteEntityAttributes`): every pure derivation in remote-card-state.ts
// and its tests already speak that shape, so an adapter's job is to produce
// it, not to teach the store a second vocabulary.

import type { DeviceKeymapResponse, RemoteEntityAttributes } from "../remote-card-types";

/**
 * Which kind of integration answers for the target. `x1s` is this
 * integration's remote entity (device mode, keymaps, long press); `hub` is
 * the official sofabaton_hub MQTT integration (command lists, no keymap
 * detail); `unknown` is anything else.
 */
export type RemoteIntegration = "x1s" | "hub" | "unknown";

/** The remote entity as the store reads it: state plus the attribute contract. */
export interface RemoteSnapshot {
  state?: string;
  attributes?: RemoteEntityAttributes & Record<string, unknown>;
}

export interface RemoteActivityRef {
  id: number | null;
  name: string;
}

export interface RemoteBackend {
  readonly kind: "ha" | "server";

  /** The configured target: an entity id on HA, a hub id on the server. */
  setTarget(target: string): void;

  /** Current remote state, or undefined while the target is unknown. */
  snapshot(): RemoteSnapshot | undefined;

  /**
   * Push notification that snapshot() changed. HA replaces the `hass`
   * object instead, so the HA adapter does not implement it.
   */
  subscribe?(listener: () => void): () => void;

  /** Identify the integration behind the target. Rejects when it cannot ask. */
  probeIntegration(): Promise<RemoteIntegration>;

  /** Strict 0/1 from the hub's tracked byte; null when unreadable. */
  devicePowerState(deviceId: number): Promise<0 | 1 | null>;

  /**
   * One device's keymap projection. `null` means the backend cannot fetch
   * yet (try again on the next change); a response with `keymap: null` is a
   * real cache miss; a rejection is an error.
   */
  deviceKeymap(deviceId: number): Promise<DeviceKeymapResponse | null>;

  /** Send one command in the scope of an activity or a device. */
  sendCommand(commandId: unknown, scopeId: unknown): Promise<void>;

  /** Raw command list for the sofabaton_hub path (HA only). */
  sendRawCommandList?(list: unknown[]): Promise<void>;

  startActivity(activity: RemoteActivityRef): Promise<void>;
  stopActivity(): Promise<void>;

  /** Arbitrary platform service calls (Lovelace actions, Automation Assist). HA only. */
  callService?(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
}
