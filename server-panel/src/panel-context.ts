// What a view of a hub receives (docs/internal/server-panel-state-plan.md,
// decision 3): the hub with its gate, its busy state and the interaction
// verdict, plus the API client. Views read `ctx.hub` instead of a bare hub.
// The shell scrims an unavailable hub; a busy one it leaves to the views,
// which lock their write controls on `ctx.free` (the HA card's way).

import type { HubView, PanelApi } from "./panel-api";
import { busyFor, gateFor, interactionFor, selectedRuntime, type Busy, type Gate, type Interaction } from "./panel-selectors";
import type { HubRuntime, PanelSnapshot } from "./panel-store";

export interface HubContext {
  hub: HubView | null;
  runtime: HubRuntime | null;
  gate: Gate;
  busy: Busy;
  interaction: Interaction;
  /** True when the view may act on the hub. */
  free: boolean;
  api: PanelApi;
}

export function hubContextFor(snapshot: PanelSnapshot, api: PanelApi): HubContext {
  const runtime = selectedRuntime(snapshot);
  const interaction = interactionFor(snapshot, runtime);
  return {
    hub: runtime?.hub ?? null,
    runtime,
    gate: gateFor(snapshot, runtime),
    busy: busyFor(runtime),
    interaction,
    free: interaction.kind === "free",
    api,
  };
}
