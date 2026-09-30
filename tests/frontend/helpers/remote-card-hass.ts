// One fake `hass` for the remote-card unit tests (CR-R1-12): the WS
// contract the card uses (entity registry, device keymap, device power
// state) lives here once, so a contract change cannot stay green in a
// forgotten copy. remote-card-backend.test.ts keeps its own stricter rig,
// which records every call and throws on anything unexpected.

import type { HassLike } from "../../../remote-card/src/remote-card-types";

export const REMOTE_ENTITY = "remote.living_room";

export interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

export interface RemoteCardHassOptions {
  entity?: string;
  platform?: string;
  state?: Record<string, unknown> | null;
  calls?: ServiceCall[];
  keymapResponse?: unknown;
  keymapCalls?: Array<Record<string, unknown>>;
  powerStateResponse?: unknown;
  powerStateCalls?: Array<Record<string, unknown>>;
}

export function createRemoteCardHass(options: RemoteCardHassOptions = {}): HassLike {
  const entity = options.entity ?? REMOTE_ENTITY;
  const platform = options.platform ?? "sofabaton_x1s";
  const calls = options.calls ?? [];
  return {
    states: options.state ? { [entity]: options.state as never } : {},
    async callWS<T>(message: Record<string, unknown>) {
      if (String(message.type) === "config/entity_registry/get") {
        return { platform } as T;
      }
      if (String(message.type) === "sofabaton_x1s/device/keymap") {
        options.keymapCalls?.push(message);
        if (options.keymapResponse instanceof Error) throw options.keymapResponse;
        return (options.keymapResponse ?? { keymap: null, reason: "cache_miss" }) as T;
      }
      if (String(message.type) === "sofabaton_x1s/device/power_state") {
        options.powerStateCalls?.push(message);
        if (options.powerStateResponse instanceof Error) throw options.powerStateResponse;
        return (options.powerStateResponse ?? { power_state: null }) as T;
      }
      return { ok: true } as T;
    },
    async callService(domain: string, service: string, data?: Record<string, unknown>) {
      calls.push({ domain, service, data: data ?? {} });
      return undefined;
    },
  };
}
