// The control panel's pure helpers (docs/internal/server-panel-plan.md,
// P3): state phrases, routing, theme cycling, persisted preferences and
// the API view's little parsers.

import assert from "node:assert/strict";
import test from "node:test";

import type { HubStatus, HubView, SeenHub } from "../../server-panel/src/panel-api";
import {
  actionOutcome,
  formatWhen,
  hubDisplayName,
  hubState,
  loadHistory,
  loadPrefs,
  nextTheme,
  parseHeaderLines,
  prettyJson,
  saveHistory,
  savePrefs,
  unregisteredHubs,
} from "../../server-panel/src/panel-state";

function hub(overrides: Partial<Omit<HubView, "status">> & { status?: Partial<HubStatus> | null }): HubView {
  const base: HubView = {
    hub_id: "e26a44861b45",
    enabled: true,
    config: { host: "192.168.1.50", name: "Living room" },
    added_at: "2026-09-15T00:00:00Z",
    last_seen: null,
    status: {
      hub_connected: true,
      app_connected: false,
      controllable: true,
      mode: "control",
      hub_version: "X1S",
      proxy_enabled: true,
      running_activity: null,
      activities_cached: 0,
      devices_cached: 0,
      catalog_ready: true,
    },
  };
  const status: HubStatus | null = overrides.status === null ? null : overrides.status ? { ...base.status!, ...overrides.status } : base.status;
  return { ...base, ...overrides, status };
}

test("hubState says in one phrase what the record and its status mean", () => {
  assert.deepEqual(hubState(hub({ enabled: false })), { text: "disabled", tone: "off" });
  assert.deepEqual(hubState(hub({ status: null })), { text: "not running: the proxy did not start", tone: "err" });
  assert.deepEqual(hubState(hub({ status: { mode: "disconnected", hub_connected: false } })), { text: "waiting for the hub to connect", tone: "warn" });
  assert.deepEqual(hubState(hub({ status: { mode: "observe", app_connected: true } })), { text: "observing: the app holds the hub", tone: "warn" });
  assert.deepEqual(hubState(hub({ status: { mode: "observe" } })), { text: "observing", tone: "warn" });
  assert.deepEqual(hubState(hub({ status: { catalog_ready: false } })), { text: "connected, first sync running", tone: "ok" });
  assert.deepEqual(hubState(hub({})), { text: "connected, in control", tone: "ok" });
});

test("names, dates and action outcomes", () => {
  assert.equal(hubDisplayName(hub({})), "Living room");
  assert.equal(hubDisplayName(hub({ config: { host: "h", name: null } })), "e26a44861b45");
  // No configured name: the hub's own banner name, then the id.
  assert.equal(hubDisplayName(hub({ config: { host: "h", name: null }, hub_name: "X1 HUB" })), "X1 HUB");
  assert.equal(hubDisplayName(hub({ config: { host: "h", name: "Living room" }, hub_name: "X1 HUB" })), "Living room");
  assert.equal(formatWhen(null), "never");
  assert.equal(formatWhen(""), "never");
  assert.equal(formatWhen("garbage"), "garbage");
  assert.match(formatWhen("2026-09-15T10:00:00Z"), /2026|15/);
  assert.equal(actionOutcome("enable", hub({ enabled: true })), "started");
  assert.equal(actionOutcome("enable", hub({ enabled: false })), "enabled");
  assert.equal(actionOutcome("enable", null), "enabled");
  assert.equal(actionOutcome("disable", null), "disabled");
  assert.equal(actionOutcome("remove", null), "removed");
});

test("discovery matches registered IDs, addresses and normalized MACs, but ignores stale registrations", () => {
  const seen = (config: SeenHub["config"], registered_hub_id: string | null = null): SeenHub => ({
    key: config.host, config, registered_hub_id, present: true, first_seen: "t", last_seen: "t",
  });
  const registered = hub({ config: { host: "192.168.1.50", mac: "E2:6A:44:86:1B:45" } });
  const fresh = seen({ host: "192.168.1.70" });
  const removed = { ...seen({ host: "192.168.1.80" }, "removed-id"), present: false };
  assert.deepEqual(unregisteredHubs([
    seen({ host: "changed-ip" }, registered.hub_id),
    seen({ host: registered.config.host }),
    seen({ host: "another-ip", mac: "e2-6a-44-86-1b-45" }),
    fresh, removed,
  ], [registered]), [fresh, removed]);
  assert.deepEqual(unregisteredHubs([seen({ host: "changed-ip", mac: "E2:6A:44:86:1B:45" })], [hub({})]), []);
});

test("theme cycling", () => {
  assert.equal(nextTheme("auto"), "light");
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "auto");
});

test("preferences and history survive a round trip and tolerate a broken store", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const fresh = { hub: null, tab: "hub" as const, sub: "activities", theme: "auto" as const };
  assert.deepEqual(loadPrefs(storage), fresh);
  savePrefs(storage, { hub: "h", tab: "backup", sub: "restore", theme: "dark" });
  assert.deepEqual(loadPrefs(storage), { hub: "h", tab: "backup", sub: "restore", theme: "dark" });
  store.set("sofabaton-panel", '{"tab":"bogus","sub":"restore","theme":7,"hub":3}');
  assert.deepEqual(loadPrefs(storage), fresh);
  store.set("sofabaton-panel", '{"tab":"remote","sub":"nope"}');
  assert.deepEqual(loadPrefs(storage), { ...fresh, tab: "remote", sub: "card" });
  // The first panel's preference: its Remote view maps to the Remote tab.
  store.set("sofabaton-panel", '{"view":"remote","hub":"h"}');
  assert.deepEqual(loadPrefs(storage), { hub: "h", tab: "remote", sub: "card", theme: "auto" });
  store.set("sofabaton-panel", "{not json");
  assert.deepEqual(loadPrefs(storage), fresh);
  assert.deepEqual(loadPrefs(null), fresh);

  const entries = Array.from({ length: 40 }, (_, i) => ({ method: "GET", path: `/x${i}`, query: "", body: "", status: 200, at: "t" }));
  saveHistory(storage, entries);
  assert.equal(loadHistory(storage).length, 30);
  assert.deepEqual(loadHistory(null), []);
  const throwing = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(loadPrefs(throwing), fresh);
  savePrefs(throwing, fresh);
});

test("the API view's parsers", () => {
  assert.deepEqual(parseHeaderLines('If-Match: "abc"\nno colon here\n X-A :  1 \n: empty'), { "If-Match": '"abc"', "X-A": "1" });
  assert.equal(prettyJson('{"a":1}'), '{\n  "a": 1\n}');
  assert.equal(prettyJson("plain"), "plain");
});
