// The server REST routes the web remote and the embed specs mock (CR-R1-12):
// one hub, two activities, two devices, in openapi.json shapes. Each spec
// keeps its own transport (same-origin routing, or the embed's CORS rules)
// and passes the few bodies it needs to differ as overrides.

export const HUB = "E2:6A:44:86:1B:45";
export const API = "/api/v1";

export const STATUS = {
  hub_id: HUB,
  enabled: true,
  config: { host: "192.168.1.50", name: "Living room" },
  status: {
    hub_connected: true,
    app_connected: false,
    controllable: true,
    mode: "control",
    hub_version: "x1s",
    proxy_enabled: true,
    running_activity: { activity_id: 101, name: "Watch TV" },
    activities_cached: 2,
    devices_cached: 2,
    catalog_ready: true,
  },
  added_at: "2026-09-15T00:00:00Z",
  last_seen: null,
};

/** `state.document` is the stored layout, `state.running` the running activity. */
export function hubRoutes(state, overrides = {}) {
  return {
    "GET /hubs": () => [STATUS],
    [`GET /hubs/${HUB}/ui/remote-card`]: () => ({ hub_id: HUB, document: state.document, updated_at: null }),
    [`GET /hubs/${HUB}/status`]: () => STATUS,
    [`GET /hubs/${HUB}/activities`]: () => [
      { activity_id: 101, name: "Watch TV", active: true, needs_confirm: false },
      { activity_id: 102, name: "Listen", active: false, needs_confirm: false },
    ],
    [`GET /hubs/${HUB}/devices`]: () => [
      { device_id: 1, name: "TV", brand: "Sony", device_class: "ir", device_class_code: 1, power_state: 0, idle_behavior: 2 },
      { device_id: 2, name: "Amp", brand: "Denon", device_class: "ir", device_class_code: 1, power_state: 1, idle_behavior: null },
    ],
    [`GET /hubs/${HUB}/activity`]: () => state.running,
    [`GET /hubs/${HUB}/entities/101/buttons`]: () => [
      { button_code: 151, name: "OK", device_id: 1, command_id: 9, long_press_device_id: null, long_press_command_id: null },
      { button_code: 174, name: "UP", device_id: 1, command_id: 17, long_press_device_id: null, long_press_command_id: null },
      { button_code: 175, name: "DOWN", device_id: 1, command_id: 18, long_press_device_id: 2, long_press_command_id: 5 },
    ],
    [`GET /hubs/${HUB}/activities/101/macros`]: () => [{ command_id: 200, label: "All On" }],
    [`GET /hubs/${HUB}/activities/101/favorites`]: () => [{ device_id: 1, command_id: 1, label: "Power" }],
    [`GET /hubs/${HUB}/entities/102/buttons`]: () => [{ button_code: 151, name: "OK", device_id: 2, command_id: 3 }],
    [`GET /hubs/${HUB}/activities/102/macros`]: () => [],
    [`GET /hubs/${HUB}/activities/102/favorites`]: () => [],
    [`POST /hubs/${HUB}/send`]: () => ({ accepted: true, mode: "control" }),
    [`POST /hubs/${HUB}/activities/102/start`]: () => ({ accepted: true, mode: "control" }),
    [`POST /hubs/${HUB}/activities/101/stop`]: () => ({ accepted: true, mode: "control" }),
    ...overrides,
  };
}
