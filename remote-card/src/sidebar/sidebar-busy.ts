// The sidebar remote's inert / busy state (docs/internal/sidebar-remote-plan.md).
//
// Two layers: `inert` means every key and the pull handle are unavailable
// (veiled); `busy` means something is in progress and the activity line
// shows a spinner with `label`. Powered off is inert without being busy:
// there is nothing to send to, but nothing is happening either. The
// reasons mirror the dashboard card's disable expression plus the panel's
// long-running-operation gate. Pure function over flags the store and the
// panel already know.

export type SidebarRuntimeState = {
  kind?: string | null;
  operation?: string | null;
  label?: string | null;
} | null;

export interface SidebarBusyInput {
  mode: "activity" | "device";
  isUnavailable: boolean;
  activityLoading: boolean;
  loadPending: boolean;
  isPoweredOff: boolean;
  /** The activity being started, when known (label while loading). */
  pendingActivity: string | null;
  deviceId: number | null;
  runtime: SidebarRuntimeState;
  strings: {
    starting: string;
    poweringOff: string;
    working: string;
    appConnected: string;
    operations: Record<string, string>;
    off: string;
  };
}

export type SidebarBusyReason =
  | "operation"
  | "app"
  | "unavailable"
  | "activity"
  | "loading"
  | "off"
  | "no-device"
  | null;

export interface SidebarBusyState {
  inert: boolean;
  busy: boolean;
  reason: SidebarBusyReason;
  /** The eyebrow while busy / inert, or null to show the mode label. */
  label: string | null;
}

export function sidebarBusyState(input: SidebarBusyInput): SidebarBusyState {
  const { runtime, strings } = input;
  if (runtime?.kind === "operation_running") {
    const operation = String(runtime.operation ?? "");
    return {
      inert: true,
      busy: true,
      reason: "operation",
      label: strings.operations[operation] ?? runtime.label ?? strings.working,
    };
  }
  if (runtime?.kind === "app_connected") {
    return { inert: true, busy: false, reason: "app", label: strings.appConnected };
  }
  if (input.isUnavailable) {
    return { inert: true, busy: false, reason: "unavailable", label: null };
  }
  if (input.mode === "device") {
    if (input.deviceId == null) return { inert: true, busy: false, reason: "no-device", label: null };
    return { inert: false, busy: false, reason: null, label: null };
  }
  if (input.activityLoading) {
    const target = input.pendingActivity;
    const poweringOff = target != null && isOffLabel(target, strings.off);
    return {
      inert: true,
      busy: true,
      reason: "activity",
      label: poweringOff ? strings.poweringOff : strings.starting,
    };
  }
  if (input.loadPending) {
    return { inert: true, busy: true, reason: "loading", label: strings.working };
  }
  if (input.isPoweredOff) {
    return { inert: true, busy: false, reason: "off", label: null };
  }
  return { inert: false, busy: false, reason: null, label: null };
}

function isOffLabel(label: string, offLabel: string): boolean {
  const s = label.trim().toLowerCase();
  return s === offLabel.trim().toLowerCase() || s === "powered off" || s === "off";
}
