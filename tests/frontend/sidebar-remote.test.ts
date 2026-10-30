// Pure helpers of the sidebar remote (docs/internal/sidebar-remote-plan.md):
// hold arbitration, the busy reducer, the theme facts and the panel's hub
// resolution. The views themselves are exercised by Playwright.

import assert from "node:assert/strict";
import test from "node:test";

import { sidebarHoldKind, SIDEBAR_REPEAT_KEYS } from "../../remote-card/src/sidebar/sidebar-hold";
import { sidebarBusyState } from "../../remote-card/src/sidebar/sidebar-busy";
import { resolveSidebarTheme } from "../../remote-card/src/sidebar/sidebar-remote-theme";
import { backStepsBack, entityForHub, pathForView, pickHub, viewForPath } from "../../remote-card/src/sidebar/sidebar-panel-element";
import { REMOTE_CARD_STRINGS_EN, setRemoteCardLanguage, str } from "../../remote-card/src/remote-card-strings";
import "../../remote-card/src/remote-card-translations/ar";
import "../../remote-card/src/remote-card-translations/de";
import "../../remote-card/src/remote-card-translations/es";
import "../../remote-card/src/remote-card-translations/fr";
import "../../remote-card/src/remote-card-translations/nl";
import "../../remote-card/src/remote-card-translations/zh-hans";

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

test("dock: pins fill left then right, a third finds both sides taken", async () => {
  const { pinToFreeSlot, dockSlotOf, dockIsFull } = await import("../../remote-card/src/sidebar/sidebar-dock");
  const a = { kind: "favorites" as const, commandId: 600, deviceId: 3 };
  const b = { kind: "macros" as const, commandId: 501, deviceId: 101 };
  const c = { kind: "favorites" as const, commandId: 601, deviceId: 3 };
  const first = pinToFreeSlot({}, a)!;
  assert.equal(first.slot, "left");
  assert.deepEqual(first.slots.left, { ...a, icon: null });
  const second = pinToFreeSlot(first.slots, b)!;
  assert.equal(second.slot, "right");
  assert.equal(dockIsFull(first.slots), false);
  assert.equal(dockIsFull(second.slots), true);
  assert.equal(pinToFreeSlot(second.slots, c), null);
  assert.equal(dockSlotOf(second.slots, { ...b }), "right");
  // Same command, other device: a different item.
  assert.equal(dockSlotOf(second.slots, { ...a, deviceId: 4 }), null);
  // A freed left side is the next one filled.
  const { unpinDockSlot } = await import("../../remote-card/src/sidebar/sidebar-dock");
  assert.equal(pinToFreeSlot(unpinDockSlot(second.slots, "left"), c)!.slot, "left");
});

test("dock: moving a shortcut to the other side swaps with what is there; icons stay with their pin", async () => {
  const { moveDockSlot, setDockIcon } = await import("../../remote-card/src/sidebar/sidebar-dock");
  const a = { kind: "favorites" as const, commandId: 1, deviceId: 1, icon: "mdi:netflix" };
  const b = { kind: "commands" as const, commandId: 2, deviceId: 1, icon: null };
  assert.deepEqual(moveDockSlot({ left: a }, "left", "right"), { right: a });
  assert.deepEqual(moveDockSlot({ left: a, right: b }, "left", "right"), { left: b, right: a });
  assert.deepEqual(moveDockSlot({ left: a }, "left", "left"), { left: a });
  assert.deepEqual(setDockIcon({ left: a }, "left", "monogram").left?.icon, "monogram");
  assert.deepEqual(setDockIcon({ left: a }, "right", "mdi:x"), { left: a });
  // A cleared icon goes back to the automatic one.
  assert.equal(setDockIcon({ left: a }, "left", null).left?.icon, null);
});

test("dock: one set per activity and per device; nothing without an activity or device", async () => {
  const { dockScope } = await import("../../remote-card/src/sidebar/sidebar-dock");
  assert.equal(dockScope("activity", 101, 1), "activity:101");
  assert.equal(dockScope("device", 101, 1), "device:1");
  assert.equal(dockScope("activity", null, 1), null);
  assert.equal(dockScope("device", 101, null), null);
});

test("dock: the stored table keeps only well-formed pins and drops empty scopes", async () => {
  const { parseDockTable, withDockSlots } = await import("../../remote-card/src/sidebar/sidebar-dock");
  assert.deepEqual(parseDockTable(null), {});
  assert.deepEqual(parseDockTable("not json"), {});
  assert.deepEqual(parseDockTable("[1,2]"), {});
  const table = parseDockTable(JSON.stringify({
    "activity:101": {
      left: { kind: "favorites", commandId: 600, deviceId: 3, icon: "mdi:netflix" },
      right: { kind: "bogus", commandId: 1, deviceId: 1 },
      middle: { kind: "macros", commandId: 1, deviceId: 1 },
    },
    "device:1": { left: { kind: "commands", commandId: "x", deviceId: 1 } },
  }));
  assert.deepEqual(table, { "activity:101": { left: { kind: "favorites", commandId: 600, deviceId: 3, icon: "mdi:netflix" } } });
  assert.deepEqual(withDockSlots(table, "activity:101", {}), {});
  assert.deepEqual(Object.keys(withDockSlots(table, "device:2", { right: { kind: "commands", commandId: 5, deviceId: 2, icon: null } })), ["activity:101", "device:2"]);
});

test("dock: the automatic icon is the item's own, else a guess from the name, else the initials", async () => {
  const { dockIconFor, dockMonogram, guessDockIcon, DOCK_MONOGRAM } = await import("../../remote-card/src/sidebar/sidebar-dock");
  const pin = { kind: "favorites" as const, commandId: 1, deviceId: 1, icon: null };
  assert.equal(dockIconFor(pin, "Netflix", "mdi:star"), "mdi:star");
  assert.equal(dockIconFor(pin, "Netflix", null), "mdi:netflix");
  assert.equal(dockIconFor(pin, "Aspect ratio", null), "mdi:aspect-ratio");
  assert.equal(dockIconFor(pin, "Grandma's corner", null), DOCK_MONOGRAM);
  assert.equal(dockIconFor({ ...pin, icon: "mdi:fan" }, "Netflix", "mdi:star"), "mdi:fan");
  // Specific before general: a movie night is a movie, a night mode is the night.
  assert.equal(guessDockIcon("Movie night"), "mdi:movie-open-outline");
  assert.equal(guessDockIcon("Night mode"), "mdi:weather-night");
  assert.equal(guessDockIcon("Input HDMI 2"), "mdi:video-input-hdmi");
  assert.equal(guessDockIcon("Mute all"), "mdi:volume-mute");
  assert.equal(guessDockIcon("Vol +"), "mdi:volume-plus");
  assert.equal(guessDockIcon("Sleep"), "mdi:sleep");
  assert.equal(guessDockIcon("Disney+"), null);
  assert.equal(dockMonogram("Disney+"), "D");
  assert.equal(dockMonogram("Scene: Movie"), "SM");
  assert.equal(dockMonogram("HDMI 1"), "H1");
  assert.equal(dockMonogram("电视 开"), "电开");
  assert.equal(dockMonogram(""), "");
});

test("strings: the dock pin names its item in every built-in language", () => {
  for (const lang of ["en", "ar", "de", "es", "fr", "nl", "zh-Hans"]) {
    setRemoteCardLanguage(lang);
    assert.ok(str().sidebar.pinToDock("Netflix").includes("Netflix"), lang);
    assert.ok(str().sidebar.pinnedToDock("Netflix").includes("Netflix"), lang);
    assert.notEqual(str().sidebar.pinnedToDock("Netflix"), str().sidebar.pinToDock("Netflix"), lang);
  }
  setRemoteCardLanguage("en");
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

// Back arrow (#320). HA only adds `from` since 2026.9.

test("back: steps back when the entry has from", () => {
  assert.equal(backStepsBack({ from: "/lovelace/rec-room" }, 5, "2026.10.1"), true);
  assert.equal(backStepsBack({ from: "/lovelace/rec-room" }, 5, "2026.8.3"), true);
});

test("back: 2026.9+ without from goes home", () => {
  assert.equal(backStepsBack(null, 5, "2026.9.0"), false);
  assert.equal(backStepsBack({ root: true }, 1, "2026.10.1"), false);
  assert.equal(backStepsBack(null, 5, "2026.9.0.dev20260820"), false);
});

test("back: older HA steps back when there is history", () => {
  assert.equal(backStepsBack(null, 5, "2026.8.3"), true);
  assert.equal(backStepsBack(null, 3, "2025.12.4"), true);
  // first entry, nothing to go back to
  assert.equal(backStepsBack({ root: true }, 1, "2026.8.3"), false);
  // deep link, then a dashboard and browser back: still the first entry
  assert.equal(backStepsBack({ root: true }, 2, "2026.8.3"), false);
});

test("back: unknown version without from goes home", () => {
  assert.equal(backStepsBack(null, 5, undefined), false);
  assert.equal(backStepsBack(null, 5, "unknown"), false);
});
