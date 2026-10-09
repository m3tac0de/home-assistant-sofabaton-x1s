// Pure helpers of the sidebar remote (docs/internal/sidebar-remote-plan.md):
// hold arbitration, the busy reducer, the theme facts and the panel's hub
// resolution. The views themselves are exercised by Playwright.

import assert from "node:assert/strict";
import test from "node:test";

import { sidebarHoldKind, SIDEBAR_REPEAT_KEYS } from "../../remote-card/src/sidebar/sidebar-hold";
import { sidebarBusyState } from "../../remote-card/src/sidebar/sidebar-busy";
import { resolveSidebarTheme } from "../../remote-card/src/sidebar/sidebar-remote-theme";
import { entityForHub, pathForView, pickHub, viewForPath } from "../../remote-card/src/sidebar/sidebar-panel-element";
import { REMOTE_CARD_STRINGS_EN } from "../../remote-card/src/remote-card-strings";

const STRINGS = {
  starting: "Starting",
  poweringOff: "Powering off",
  working: "Working",
  appConnected: "App connected",
  operations: { cache_refresh: "Refreshing hub cache" },
  off: "Powered Off",
};

const base = {
  mode: "activity" as const,
  isUnavailable: false,
  activityLoading: false,
  loadPending: false,
  isPoweredOff: false,
  pendingActivity: null,
  deviceId: null,
  runtime: null,
  strings: STRINGS,
};

test("hold: a long-press binding wins, repeat keys repeat, the rest tap", () => {
  assert.equal(sidebarHoldKind("volup", true), "long-press");
  assert.equal(sidebarHoldKind("ok", true), "long-press");
  assert.equal(sidebarHoldKind("volup", false), "repeat");
  assert.equal(sidebarHoldKind("up", false), "repeat");
  assert.equal(sidebarHoldKind("ok", false), "tap");
  assert.equal(sidebarHoldKind("mute", false), "tap");
  assert.deepEqual([...SIDEBAR_REPEAT_KEYS].sort(), ["chdn", "chup", "down", "left", "right", "up", "voldn", "volup"]);
});

test("busy: idle activity mode is live", () => {
  assert.deepEqual(sidebarBusyState(base), { inert: false, busy: false, reason: null, label: null });
});

test("busy: an activity start veils with the Starting label; all off says Powering off", () => {
  assert.deepEqual(sidebarBusyState({ ...base, activityLoading: true, pendingActivity: "Watch TV" }), {
    inert: true, busy: true, reason: "activity", label: "Starting",
  });
  assert.deepEqual(sidebarBusyState({ ...base, activityLoading: true, pendingActivity: "Powered Off" }), {
    inert: true, busy: true, reason: "activity", label: "Powering off",
  });
});

test("busy: powered off is inert without being busy; unavailable likewise", () => {
  assert.deepEqual(sidebarBusyState({ ...base, isPoweredOff: true }), { inert: true, busy: false, reason: "off", label: null });
  assert.deepEqual(sidebarBusyState({ ...base, isUnavailable: true, isPoweredOff: true }), {
    inert: true, busy: false, reason: "unavailable", label: null,
  });
});

test("busy: a long-running operation beats everything and names itself", () => {
  const state = sidebarBusyState({ ...base, runtime: { kind: "operation_running", operation: "cache_refresh", label: "x" } });
  assert.deepEqual(state, { inert: true, busy: true, reason: "operation", label: "Refreshing hub cache" });
  const unknown = sidebarBusyState({ ...base, runtime: { kind: "operation_running", operation: "other", label: "Backend label" } });
  assert.equal(unknown.label, "Working");
  const app = sidebarBusyState({ ...base, runtime: { kind: "app_connected" } });
  assert.deepEqual(app, { inert: true, busy: false, reason: "app", label: "App connected" });
});

test("busy: device mode is inert only without a device", () => {
  assert.equal(sidebarBusyState({ ...base, mode: "device", deviceId: null }).reason, "no-device");
  assert.equal(sidebarBusyState({ ...base, mode: "device", deviceId: 1, isPoweredOff: true }).inert, false);
});

test("theme facts: OK label, halo and glass follow the measured colours", () => {
  const light = resolveSidebarTheme((expr) =>
    expr.includes("--primary-color") ? "rgb(3, 169, 244)" : expr.includes("--primary-text-color") ? "rgb(33, 33, 33)" : "rgb(255, 255, 255)",
  );
  assert.deepEqual(light, { onPrimary: "#fff", halo: "rgba(255,255,255,.75)", glass: false });
  const pale = resolveSidebarTheme((expr) =>
    expr.includes("--primary-color") ? "rgb(203, 166, 247)" : expr.includes("--primary-text-color") ? "rgb(230, 230, 230)" : "rgba(0, 0, 0, 0.3)",
  );
  assert.deepEqual(pale, { onPrimary: "#111", halo: "rgba(0,0,0,.45)", glass: true });
  const transparent = resolveSidebarTheme((expr) => (expr.includes("--ha-card-background") ? "rgba(0, 0, 0, 0)" : "rgb(0,0,0)"));
  assert.equal(transparent.glass, true);
});

test("panel: the hub's remote entity is the one carrying its entry id", () => {
  const hass = {
    states: {
      "remote.a": { attributes: { entry_id: "A" } },
      "light.x": { attributes: { entry_id: "B" } },
      "remote.b": { attributes: { entry_id: "B" } },
    },
    callWS: async () => ({}),
  } as never;
  assert.equal(entityForHub(hass, "B"), "remote.b");
  assert.equal(entityForHub(hass, "C"), null);
  assert.equal(entityForHub(null, "A"), null);
});

test("panel: the remembered hub wins while it exists, else the first", () => {
  const hubs = [{ entry_id: "one" }, { entry_id: "two" }];
  assert.equal(pickHub(hubs, "two"), "two");
  assert.equal(pickHub(hubs, "gone"), "one");
  assert.equal(pickHub([], "one"), null);
});

test("routes: the tab paths map both ways, anything else is the plain panel", () => {
  assert.equal(viewForPath("/virtual-remote"), "remote");
  assert.equal(viewForPath("/control-panel/"), "panel");
  assert.equal(viewForPath(""), null);
  assert.equal(viewForPath("/"), null);
  assert.equal(viewForPath("/nope"), null);
  assert.equal(pathForView("remote"), "/virtual-remote");
  assert.equal(pathForView("panel"), "/control-panel");
});

test("strings: the sidebar section exists in English with every operation label", () => {
  const sidebar = REMOTE_CARD_STRINGS_EN.sidebar;
  for (const op of ["backup_restore", "cache_refresh", "entity_sync", "backup_export", "wifi_deploy"]) {
    assert.ok(sidebar.operations[op], op);
  }
  assert.equal(sidebar.title, "Virtual Remote");
});

test("layout: the landscape split only when the portrait wheel would be too small", async () => {
  const { portraitWheelSize, wantsLandscape, MIN_PORTRAIT_WHEEL } = await import("../../remote-card/src/sidebar/sidebar-layout");
  // iPhone-ish landscape: 334px tall, the rows alone eat most of it.
  const phone = { width: 844, height: 334, fixedRows: [42, 31.5, 42, 42, 19], pull: 58, gap: 8, pad: 20 };
  assert.ok(portraitWheelSize(phone) < MIN_PORTRAIT_WHEEL);
  assert.equal(wantsLandscape(phone), true);
  // A 1180x704 window keeps a ~370px portrait wheel: no split.
  const wide = { width: 1180, height: 704, fixedRows: [46, 34, 46, 46, 21], pull: 58, gap: 11, pad: 23 };
  assert.ok(portraitWheelSize(wide) > MIN_PORTRAIT_WHEEL);
  assert.equal(wantsLandscape(wide), false);
  // Portrait windows never split, however short.
  assert.equal(wantsLandscape({ ...phone, width: 320, height: 300 }), false);
  // Narrower than the split needs: stays portrait too.
  assert.equal(wantsLandscape({ ...phone, width: 600 }), false);
  // The width cap: a wide, tall column is limited by the 560px column, not by height.
  assert.equal(portraitWheelSize({ ...wide, height: 2000 }), 0.76 * (560 - 46));
  // Hysteresis: a wheel just over the floor keeps the split it is in, and
  // only a clearly larger one hands back to portrait.
  const edge = { ...phone, height: 294 + MIN_PORTRAIT_WHEEL + 8 };
  assert.equal(wantsLandscape(edge, false), false);
  assert.equal(wantsLandscape(edge, true), true);
  assert.equal(wantsLandscape({ ...edge, height: edge.height + 30 }, true), false);
});
