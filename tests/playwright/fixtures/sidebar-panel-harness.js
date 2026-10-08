// Playwright harness for the "Sofabaton X" sidebar panel
// (docs/internal/sidebar-remote-plan.md). Mounts the real sidebar-panel.js
// bundle against a fake `hass` with two hubs (an X1S with device mode and
// long-press bindings, an X2 with the keypad bound), the sidebar/state WS
// the panel polls, and the HA theme fixture the card harnesses use.
//
// URL params: ?admin=1|0, ?hub=x1s|x2, ?theme=<fixture value>, ?runtime=
// idle|operation|app (the selected hub's runtime state), ?scenario=
// active|off (X1S activity state).
//
// window.__sidebarHarness: setTheme(value), setRuntime(kind), setAdmin(bool),
// serviceCalls, wsCalls, panel(), remote(), hass.

import * as MDI from "/node_modules/@mdi/js/mdi.js";

const CLONE = (value) => JSON.parse(JSON.stringify(value));

// ---------- element stubs (the panel runs inside HA; here we stand in) ----------

function mdiPath(icon) {
  const name = String(icon || "").replace(/^mdi:/, "");
  const key = "mdi" + name.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
  return MDI[key] || "";
}

class HaIconStub extends HTMLElement {
  static get observedAttributes() { return ["icon"]; }
  constructor() { super(); this._shadow = this.attachShadow({ mode: "open" }); this._icon = ""; }
  set icon(value) { this._icon = String(value || ""); this._render(); }
  get icon() { return this._icon; }
  connectedCallback() { this._render(); }
  attributeChangedCallback() { this._icon = this.getAttribute("icon") || this._icon; this._render(); }
  _render() {
    const size = "var(--mdc-icon-size, 24px)";
    this._shadow.innerHTML = `<style>:host{display:inline-flex;align-items:center;justify-content:center;width:${size};height:${size};color:inherit}svg{width:100%;height:100%;fill:currentColor}</style><svg viewBox="0 0 24 24"><path d="${mdiPath(this._icon)}"/></svg>`;
  }
}
class HaMenuButtonStub extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: "open" }).innerHTML = `<style>:host{display:inline-flex;width:48px;height:48px;align-items:center;justify-content:center}i{display:block;width:18px;height:2px;background:currentColor;box-shadow:0 -6px 0 currentColor,0 6px 0 currentColor}</style><i></i>`;
  }
}
if (!customElements.get("ha-icon")) customElements.define("ha-icon", HaIconStub);
if (!customElements.get("ha-menu-button")) customElements.define("ha-menu-button", HaMenuButtonStub);

// ---------- fixture ----------

const KEYS_ALL = [174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193];
const X2_EXTRA = [151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169];

const HUBS = [
  { entry_id: "x1s-entry", name: "Souterrain", version: "X1S", hub_connected: true, proxy_client_connected: false },
  { entry_id: "x2-entry", name: "Living room", version: "X2", hub_connected: true, proxy_client_connected: false },
  { entry_id: "x1-entry", name: "Bedroom", version: "X1", hub_connected: false, proxy_client_connected: false },
];
const ENTITY = { "x1s-entry": "remote.souterrain", "x2-entry": "remote.living_room", "x1-entry": "remote.bedroom" };

function x1sState(active) {
  return {
    state: active ? "on" : "off",
    attributes: {
      entry_id: "x1s-entry",
      hub_version: "X1S",
      current_activity: active ? "Watch a movie" : "Powered Off",
      current_activity_id: active ? 101 : null,
      load_state: "idle",
      activities: [
        { id: 101, name: "Watch a movie", state: active ? "on" : "off" },
        { id: 102, name: "Watch TV", state: "off" },
        { id: 103, name: "Listen to music", state: "off" },
        { id: 104, name: "Play a game", state: "off" },
      ],
      // 101 leaves menu (181), channel (183/186) and blue (193) unbound.
      assigned_keys: { 101: KEYS_ALL.filter((id) => ![181, 183, 186, 193].includes(id)), 102: KEYS_ALL },
      macro_keys: { 101: [
        { command_id: 501, name: "Movie night", device_id: 101 },
        { command_id: 502, name: "Lights dim", device_id: 101 },
        { command_id: 503, name: "Mute all", device_id: 101 },
      ] },
      favorite_keys: { 101: [
        { command_id: 600, name: "Netflix", device_id: 3 },
        { command_id: 601, name: "YouTube", device_id: 3 },
        { command_id: 602, name: "HDMI 1", device_id: 1 },
        { command_id: 603, name: "Night mode", device_id: 2 },
        { command_id: 604, name: "Disney+", device_id: 3 },
        { command_id: 605, name: "Scene: Movie", device_id: 4 },
      ] },
      devices: [
        { id: 1, name: "Television", device_class: "ir" },
        { id: 2, name: "Soundbar", device_class: "ir" },
        { id: 3, name: "Apple TV", device_class: "bluetooth" },
        { id: 4, name: "Living room lights", device_class: "wifi" },
      ],
      long_press_keys: { 101: { 182: { device_id: 2, command_id: 22 } } },
    },
  };
}
function x2State() {
  return {
    state: "on",
    attributes: {
      entry_id: "x2-entry",
      hub_version: "X2",
      current_activity: "Movie Time",
      current_activity_id: 201,
      load_state: "idle",
      activities: [
        { id: 201, name: "Movie Time", state: "on" },
        { id: 202, name: "Retro Gaming", state: "off" },
      ],
      assigned_keys: { 201: [...KEYS_ALL, ...X2_EXTRA].filter((id) => id !== 160) },
      macro_keys: { 201: [{ command_id: 701, name: "Cinema Mode", device_id: 201 }] },
      favorite_keys: { 201: [{ command_id: 801, name: "Plex", device_id: 8 }] },
      devices: [{ id: 8, name: "Shield", device_class: "ir" }],
    },
  };
}
const KEYMAPS = {
  1: { device: { device_id: 1, name: "Television", device_class: "ir" }, buttons: [174, 175, 176, 177, 178, 179, 180, 181, 182, 184, 185], bindings: [], commands: [
    { command_id: 11, name: "Input" }, { command_id: 12, name: "Aspect ratio" }, { command_id: 13, name: "Sleep" }, { command_id: 14, name: "Picture mode" },
  ], power_configured: true, fetched_at: "2026-10-08T00:00:00Z" },
  2: { device: { device_id: 2, name: "Soundbar", device_class: "ir" }, buttons: [182, 184, 185], bindings: [], commands: [
    { command_id: 21, name: "Bass +" }, { command_id: 22, name: "Bass -" }, { command_id: 23, name: "Surround" },
  ], power_configured: false, fetched_at: "2026-10-08T00:00:00Z" },
};

const params = new URL(window.location.href).searchParams;
// `hubs=1` leaves only the X1S so the single-hub header can be exercised.
const VISIBLE_HUBS = params.get("hubs") === "1" ? HUBS.filter((hub) => hub.entry_id === "x1s-entry") : HUBS;
const state = {
  admin: params.get("admin") !== "0",
  runtime: params.get("runtime") || "idle",
  serviceCalls: [],
  wsCalls: [],
  devicePower: { 1: 0 },
  panel: null,
};

function runtimeState(hub) {
  if (hub.entry_id !== selectedEntryForRuntime()) return { kind: "idle", operation: null, label: null, current_step: null, total_steps: null };
  if (state.runtime === "operation") return { kind: "operation_running", operation: "cache_refresh", label: "Refreshing hub cache", current_step: 2, total_steps: 5 };
  if (state.runtime === "app") return { kind: "app_connected", operation: null, label: "Only Logs is available while the Sofabaton app is connected.", current_step: null, total_steps: null };
  return { kind: "idle", operation: null, label: null, current_step: null, total_steps: null };
}
function selectedEntryForRuntime() {
  return state.panel?.selectedHub ?? "x1s-entry";
}

const hass = {
  states: {
    "remote.souterrain": x1sState(params.get("scenario") !== "off"),
    "remote.living_room": x2State(),
    "remote.bedroom": { state: "unavailable", attributes: { entry_id: "x1-entry", hub_version: "X1" } },
  },
  user: { is_admin: state.admin },
  locale: { language: params.get("lang") || "en" },
  themes: { themes: {}, darkMode: false },
  async callWS(message) {
    state.wsCalls.push(CLONE(message));
    if (message?.type === "sofabaton_x1s/sidebar/state") {
      return { hubs: VISIBLE_HUBS.map((hub) => ({ ...hub, runtime_state: runtimeState(hub) })) };
    }
    if (message?.type === "config/entity_registry/get") return { platform: "sofabaton_x1s" };
    if (message?.type === "sofabaton_x1s/device/keymap") {
      const keymap = KEYMAPS[message.device_id] ?? null;
      return keymap ? { keymap: CLONE(keymap), generation: 1 } : { keymap: null, reason: "cache_miss" };
    }
    if (message?.type === "sofabaton_x1s/device/power_state") {
      const value = state.devicePower[message.device_id];
      return { power_state: value === 0 || value === 1 ? value : null };
    }
    return { ok: true };
  },
  async callService(domain, service, data, target) {
    state.serviceCalls.push({ domain, service, data: CLONE(data ?? {}), target: CLONE(target ?? null) });
    const entityId = String(data?.entity_id || "");
    const remote = hass.states[entityId];
    if (!remote) return;
    if (domain === "remote" && service === "turn_on") {
      // The hub takes a moment: the panel shows its transitional state meanwhile.
      setTimeout(() => {
        const activity = String(data?.activity || "");
        const match = (remote.attributes.activities || []).find((entry) => entry.name === activity);
        remote.state = "on";
        remote.attributes.current_activity = activity;
        remote.attributes.current_activity_id = match ? Number(match.id) : remote.attributes.current_activity_id;
        remote.attributes.activities = remote.attributes.activities.map((a) => ({ ...a, state: a.name === activity ? "on" : "off" }));
        push();
      }, Number(params.get("switch_ms") || 1200));
    } else if (domain === "remote" && service === "turn_off") {
      setTimeout(() => {
        remote.state = "off";
        remote.attributes.current_activity = "Powered Off";
        remote.attributes.current_activity_id = null;
        remote.attributes.activities = remote.attributes.activities.map((a) => ({ ...a, state: "off" }));
        push();
      }, Number(params.get("switch_ms") || 1200));
    } else if (domain === "remote" && service === "send_command" && data?.device != null && [198, 199].includes(Number(data?.command))) {
      state.devicePower[data.device] = Number(data.command) === 198 ? 1 : 0;
    }
  },
};

function push() {
  // HA replaces the hass object on every state change.
  const next = { ...hass, states: CLONE(hass.states) };
  Object.setPrototypeOf(next, Object.getPrototypeOf(hass));
  next.callWS = hass.callWS;
  next.callService = hass.callService;
  if (state.panel) state.panel.hass = next;
}

// ---------- themes (same engine + grammar as the card harnesses) ----------

const FIXTURE = window.HA_THEME_FIXTURE ?? null;
const ENGINE = window.HAThemeEngine ?? null;
let appliedKeys = [];
let baseInstalled = false;
function setTheme(value) {
  if (!FIXTURE || !ENGINE) throw new Error("theme fixture not loaded");
  const parsed = ENGINE.parseValue(FIXTURE, value);
  if (!parsed) throw new Error(`Unknown theme value: ${value}`);
  if (!baseInstalled) {
    const style = document.createElement("style");
    style.textContent = ENGINE.baseLightCss(FIXTURE);
    document.getElementById("harness-fallback-palette").insertAdjacentElement("afterend", style);
    baseInstalled = true;
  }
  const root = document.documentElement;
  for (const key of appliedKeys) root.style.removeProperty(key);
  appliedKeys = [];
  for (const [key, val] of Object.entries(ENGINE.buildRules(FIXTURE, parsed))) {
    root.style.setProperty(key, val);
    appliedKeys.push(key);
  }
  root.style.colorScheme = parsed.dark ? "dark" : "light";
  // A theme change reaches the panel as a new hass.themes reference.
  hass.themes = { themes: {}, darkMode: parsed.dark };
  push();
  return parsed;
}

// ---------- mount ----------

await import("/custom_components/sofabaton_x1s/www/sidebar-panel.js");
if (params.get("hub")) {
  const entry = params.get("hub") === "x2" ? "x2-entry" : params.get("hub") === "x1" ? "x1-entry" : "x1s-entry";
  try { window.localStorage.setItem("sofabaton_x1s:sidebar:hub", entry); } catch { /* ignore */ }
}
const panel = document.createElement("sofabaton-x-panel");
panel.narrow = window.innerWidth < 870;
state.panel = panel;
// `width=<px>` narrows the panel below the viewport, as HA's docked sidebar does.
if (params.get("width")) panel.style.width = `${Number(params.get("width"))}px`;
document.body.appendChild(panel);
panel.hass = hass;
// `path=/control-panel` opens the panel on a tab's own path, as HA routes it.
if (params.get("path")) panel.route = { prefix: "/sofabaton-x", path: params.get("path") };
if (params.get("theme")) setTheme(params.get("theme"));
// `header_blur=1` gives the header a backdrop filter, as glass themes do.
if (params.get("header_blur")) document.documentElement.style.setProperty("--app-header-backdrop-filter", "blur(10px)");

// Audit scenarios (scripts/audit-contrast.mjs `--target sidebar`): "<hub>"
// or "<hub>+<sheet>" with hub = x1s | x2 and sheet = favorites | macros |
// commands | activities | devices.
const SCENARIO_IDS = ["x1s", "x1s+favorites", "x1s+macros", "x1s+activities", "x1s+devices", "x2", "x2+commands"];
async function loadScenario(id) {
  const [hub, sheet] = String(id).split("+");
  const entry = hub === "x2" ? "x2-entry" : "x1s-entry";
  await new Promise((resolve) => {
    const tick = () => (panel.selectedHub ? resolve() : setTimeout(tick, 50));
    tick();
  });
  panel.selectHub(entry);
  await new Promise((resolve) => setTimeout(resolve, 150));
  const remote = panel.shadowRoot?.querySelector("sofabaton-sidebar-remote");
  if (!remote) return;
  if (sheet === "commands") {
    if (remote.store.mode() !== "device") remote.store.setMode("device");
    remote.store.setDevice(hub === "x2" ? 8 : 1);
    await new Promise((resolve) => setTimeout(resolve, 150));
  } else if (remote.store.mode() !== "activity") {
    remote.store.setMode("activity");
  }
  remote.openSheet(sheet || null);
  await new Promise((resolve) => setTimeout(resolve, 350));
}

window.__sidebarHarness = {
  hass,
  themeFixtureLoaded: Boolean(FIXTURE && ENGINE),
  scenarioIds: SCENARIO_IDS,
  loadScenario,
  hubs: HUBS,
  entityFor: (entry) => ENTITY[entry],
  serviceCalls: state.serviceCalls,
  wsCalls: state.wsCalls,
  panel: () => panel,
  remote: () => panel.shadowRoot?.querySelector("sofabaton-sidebar-remote") ?? null,
  setTheme,
  themeOptions: ENGINE && FIXTURE ? ENGINE.optionList(FIXTURE) : [],
  setRuntime(kind) { state.runtime = kind; },
  setAdmin(value) { hass.user = { is_admin: Boolean(value) }; push(); },
  push,
};
