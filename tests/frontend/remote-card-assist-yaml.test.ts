import test from "node:test";
import assert from "node:assert/strict";
import {
  automationAssistButtonYaml,
  automationAssistNotificationBody,
  automationAssistRemoteYaml,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-assist-yaml";

const ENTITY = "remote.living_room";

const buttonCapture = {
  kind: "button",
  label: "Vol Up",
  commandId: 174,
  deviceId: 101,
  commandType: "assigned",
  icon: "mdi:volume-plus",
  activityName: "Watch a movie",
};

test("remote yaml for a plain button on the x1s integration uses command/device data", () => {
  assert.equal(
    automationAssistRemoteYaml(buttonCapture, ENTITY, false),
    [
      "action: remote.send_command",
      "target:",
      `  entity_id: ${ENTITY}`,
      "data:",
      "  command: 174",
      "  device: 101",
    ].join("\n"),
  );
});

test("remote yaml for the hub (X2) integration encodes typed key commands", () => {
  const yaml = automationAssistRemoteYaml(buttonCapture, ENTITY, true);
  assert.match(yaml, /- type:send_assigned_key/);
  assert.match(yaml, /- activity_id:101/);
  assert.match(yaml, /- key_id:174/);

  const favorite = automationAssistRemoteYaml(
    { ...buttonCapture, commandType: "favorite" },
    ENTITY,
    true,
  );
  // Favorites are device-scoped on the hub integration, not activity-scoped.
  assert.match(favorite, /- type:send_favorite_key/);
  assert.match(favorite, /- device_id:101/);

  const macro = automationAssistRemoteYaml(
    { ...buttonCapture, commandType: "macro" },
    ENTITY,
    true,
  );
  assert.match(macro, /- type:send_macro_key/);
  assert.match(macro, /- activity_id:101/);
});

test("remote yaml for activity start/stop differs per integration", () => {
  const activity = { kind: "activity", activityId: 101, activityName: "Watch a movie" };
  assert.match(automationAssistRemoteYaml(activity, ENTITY, false), /^action: remote\.turn_on/);
  assert.match(automationAssistRemoteYaml(activity, ENTITY, false), /activity: Watch a movie/);
  assert.match(automationAssistRemoteYaml(activity, ENTITY, true), /- type:start_activity/);

  const power = { kind: "power", activityId: 101 };
  assert.match(automationAssistRemoteYaml(power, ENTITY, false), /^action: remote\.turn_off/);
  assert.match(automationAssistRemoteYaml(power, ENTITY, true), /- type:stop_activity/);

  // Hub-integration activity yaml requires a numeric activity id.
  assert.equal(automationAssistRemoteYaml({ kind: "activity" }, ENTITY, true), "");
  assert.equal(automationAssistRemoteYaml({ kind: "power" }, ENTITY, true), "");
});

test("remote yaml is empty without a capture or entity", () => {
  assert.equal(automationAssistRemoteYaml(null, ENTITY, false), "");
  assert.equal(automationAssistRemoteYaml(buttonCapture, "", false), "");
});

test("button yaml embeds the service call as a perform-action tap_action", () => {
  const yaml = automationAssistButtonYaml(buttonCapture, ENTITY, false);
  assert.match(yaml, /^type: button/);
  assert.match(yaml, /name: Vol Up/);
  assert.match(yaml, /icon: mdi:volume-plus/);
  // The service yaml's first line "action: ..." becomes "perform_action: ...".
  assert.match(yaml, /  perform_action: remote\.send_command/);
  assert.match(yaml, /hold_action:\n  action: none/);
});

test("button yaml picks fixed icons for activity/power/favorite/macro captures", () => {
  const icon = (capture: Record<string, unknown>) => {
    const yaml = automationAssistButtonYaml({ ...buttonCapture, ...capture }, ENTITY, false);
    const match = yaml.match(/icon: (.*)/);
    return match?.[1];
  };
  assert.equal(icon({ kind: "activity" }), "mdi:television-classic");
  assert.equal(icon({ kind: "power" }), "mdi:power");
  assert.equal(icon({ commandType: "favorite" }), "mdi:star");
  assert.equal(icon({ commandType: "macro" }), "mdi:cogs");
  assert.equal(icon({ icon: null }), "mdi:remote");
});

test("notification body contains both yaml blocks and the capture context", () => {
  const body = automationAssistNotificationBody(buttonCapture, ENTITY, false, "");
  assert.match(body, /Watch a movie/);
  assert.match(body, /Vol Up/);
  // Both fenced yaml blocks present: button card + service call.
  assert.equal(body.match(/```yaml/g)?.length, 2);
  assert.match(body, /type: button/);
  assert.match(body, /action: remote\.send_command/);
});

test("notification body falls back to the provided activity name", () => {
  const body = automationAssistNotificationBody(
    { ...buttonCapture, activityName: "" },
    ENTITY,
    false,
    "Play Xbox",
  );
  assert.match(body, /Play Xbox/);
  assert.equal(automationAssistNotificationBody(null, ENTITY, false, "x"), "");
});
