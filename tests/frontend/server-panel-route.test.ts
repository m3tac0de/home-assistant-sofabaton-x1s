// The panel's routes (docs/internal/server-panel-state-plan.md, decision
// 9): parsing and building `#/<hubId>/<tab>/<sub>` and `#/<page>`, the
// subtab defaults, the legacy hashes, and re-pointing at a hub.

import assert from "node:assert/strict";
import test from "node:test";

import { hashFor, hubRoute, normalizeSub, parseRoute, sameRoute, toolRoute, withHub } from "../../server-panel/src/panel-route";

test("hub routes: hub, tab and subtab, with the subtab defaulting per tab", () => {
  assert.deepEqual(parseRoute("#/aabb/hub/activities"), { kind: "hub", hubId: "aabb", tab: "hub", sub: "activities" });
  assert.deepEqual(parseRoute("#/aabb/backup"), { kind: "hub", hubId: "aabb", tab: "backup", sub: "make" });
  assert.deepEqual(parseRoute("#/aabb/remote/nope"), { kind: "hub", hubId: "aabb", tab: "remote", sub: "card" });
  assert.deepEqual(parseRoute("#/aabb"), { kind: "hub", hubId: "aabb", tab: "hub", sub: "activities" });
  assert.deepEqual(parseRoute("#/aabb/nonsense/x"), { kind: "hub", hubId: "aabb", tab: "hub", sub: "activities" });
  assert.deepEqual(parseRoute("#/192.168.1.60/hub"), { kind: "hub", hubId: "192.168.1.60", tab: "hub", sub: "activities" });
  assert.deepEqual(parseRoute("#/-/remote/layout"), { kind: "hub", hubId: null, tab: "remote", sub: "layout" });
  assert.equal(normalizeSub("backup", "edit"), "edit");
  assert.equal(normalizeSub("backup", "card"), "make");
});

test("tool pages with their subtabs, bare and legacy hashes", () => {
  assert.deepEqual(parseRoute("#/setup"), { kind: "tool", page: "setup", sub: "hubs" });
  assert.deepEqual(parseRoute("#/setup/hubs"), { kind: "tool", page: "setup", sub: "hubs" });
  assert.deepEqual(parseRoute("#/server/nope"), { kind: "tool", page: "server", sub: "status" });
  assert.deepEqual(parseRoute("#/debug/events"), { kind: "tool", page: "debug", sub: "events" });
  assert.deepEqual(parseRoute("#/debug"), { kind: "tool", page: "debug", sub: "api" });
  assert.equal(parseRoute(""), null);
  assert.equal(parseRoute("#"), null);
  assert.equal(parseRoute("#nope"), null);
  assert.deepEqual(parseRoute("#hubs"), { kind: "tool", page: "setup", sub: "hubs" });
  assert.deepEqual(parseRoute("#catalog"), { kind: "hub", hubId: null, tab: "hub", sub: "activities" });
  assert.deepEqual(parseRoute("#remote"), { kind: "hub", hubId: null, tab: "remote", sub: "card" });
  // The first panel's and the first shell's pages land in Debug.
  assert.deepEqual(parseRoute("#api"), { kind: "tool", page: "debug", sub: "api" });
  assert.deepEqual(parseRoute("#/events"), { kind: "tool", page: "debug", sub: "events" });
  // A hub id that happens to be "api" is still a hub route when a tab follows it.
  assert.deepEqual(parseRoute("#/api/hub"), { kind: "hub", hubId: "api", tab: "hub", sub: "activities" });
});

test("hashes round-trip, encode the hub id, and compare by value", () => {
  assert.equal(hashFor(hubRoute("aabb", "backup", "restore")), "#/aabb/backup/restore");
  assert.equal(hashFor(hubRoute(null, "remote")), "#/-/remote/card");
  assert.equal(hashFor(toolRoute("server")), "#/server/status");
  assert.equal(hashFor(toolRoute("debug", "events")), "#/debug/events");
  assert.equal(hashFor(hubRoute("a b/c", "hub")), "#/a%20b%2Fc/hub/activities");
  assert.deepEqual(parseRoute(hashFor(hubRoute("a b/c", "hub"))), hubRoute("a b/c", "hub"));
  assert.equal(sameRoute(hubRoute("x", "hub", "activities"), parseRoute("#/x/hub")!), true);
  assert.equal(sameRoute(hubRoute("x", "hub"), hubRoute("y", "hub")), false);
  assert.deepEqual(withHub(hubRoute(null, "backup", "edit"), "z"), hubRoute("z", "backup", "edit"));
  assert.deepEqual(withHub(toolRoute("debug"), "z"), toolRoute("debug"));
});

test("the Server settings page has MQTT broker and Access subtabs", async () => {
  const { parseRoute, TOOL_SUBTABS, subtabLabel } = await import("../../server-panel/src/panel-route");
  assert.deepEqual([...TOOL_SUBTABS.server], ["status", "mqtt", "access"]);
  assert.equal(subtabLabel("server", "access"), "Access");
  assert.equal(subtabLabel("server", "mqtt"), "MQTT broker");
  assert.deepEqual(parseRoute("#/server/mqtt"), { kind: "tool", page: "server", sub: "mqtt" });
  assert.deepEqual(parseRoute("#/server/access"), { kind: "tool", page: "server", sub: "access" });
});
