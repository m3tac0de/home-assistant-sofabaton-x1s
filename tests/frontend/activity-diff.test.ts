import test from "node:test";
import assert from "node:assert/strict";
import type { BackupBundlePayload } from "../../custom_components/sofabaton_x1s/www/src/shared/ha-context";
import { diffActivityForReview } from "../../custom_components/sofabaton_x1s/www/src/tabs/activity-diff";
import {
  IDLE_BEHAVIOR_AUTO_OFF,
  addActivityMemberDevice,
  addBundleActivityFavorite,
  renameBundleActivityFavorite,
  renameBundleDeviceCommand,
  setActivityRoleDevice,
  updateBundleDeviceIdleBehavior,
} from "../../custom_components/sofabaton_x1s/www/src/tabs/backup-state";

const ACTIVITY_ID = 101;

// Mirrors the harness EDIT_BACKUP_BUNDLE shape (known to parse cleanly through
// the activity selectors): activity 101 has members 1 & 2 via power macros,
// favorites, and bindings; device 3 exists but is not a member.
function baseBundle(): BackupBundlePayload {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { entry_id: "hub-1", name: "Living Room", version: "X1S" },
    devices: [
      { device: { device_id: 1, name: "Television", device_class: "ir", sort: 1 },
        commands: [
          { command_id: 10, name: "Power" },
          { command_id: 11, name: "Volume Up" },
          { command_id: 12, name: "Input HDMI1" },
        ],
        button_bindings: [{ button_id: 0xB0, command_id: 10, long_press_command_id: 11 }],
        input_record: { entries: [{ command_id: 12, input_index: 1, name: "Input HDMI1" }] } },
      { device: { device_id: 2, name: "Soundbar", device_class: "ir", sort: 2 },
        commands: [
          { command_id: 20, name: "Power" },
          { command_id: 21, name: "Volume Up" },
          { command_id: 22, name: "Volume Down" },
          { command_id: 23, name: "Mute" },
        ],
        button_bindings: [
          { button_id: 0xB6, command_id: 21 },
          { button_id: 0xB9, command_id: 22 },
          { button_id: 0xB8, command_id: 23 },
        ] },
      { device: { device_id: 3, name: "Streamer", device_class: "ir", sort: 3 },
        commands: [
          { command_id: 30, name: "Home" },
          { command_id: 31, name: "Play" },
        ],
        button_bindings: [] },
    ],
    activities: [
      { device: { device_id: 101, name: "Watch TV", entity_type: "activity", sort: 1 },
        referenced_source_device_ids: [1, 2],
        favorite_slots: [
          { button_id: 1, device_id: 1, command_id: 10, name: "TV Power" },
          { button_id: 2, device_id: 2, command_id: 20, name: "Bar Power" },
        ],
        macros: [
          { button_id: 198, name: "POWER_ON", steps: [
            { device_id: 1, command_id: 0xC6, button_code: 0, duration: 1, delay: 255 },
            { device_id: 1, command_id: 0xC5, button_code: 0, duration: 1, delay: 255 },
            { device_id: 2, command_id: 0xC6, button_code: 0, duration: 0, delay: 255 },
          ] },
          { button_id: 199, name: "POWER_OFF", steps: [
            { device_id: 1, command_id: 0xC7, button_code: 0, duration: 0, delay: 255 },
          ] },
        ],
        button_bindings: [
          { button_id: 0xB6, button_name: "Volume Up", device_id: 2, command_id: 21 },
          { button_id: 0xB0, button_name: "OK", device_id: 1, command_id: 10 },
        ] },
    ],
  } as unknown as BackupBundlePayload;
}

function sections(groups: ReturnType<typeof diffActivityForReview>) {
  return groups.map((group) => group.section);
}

function allText(groups: ReturnType<typeof diffActivityForReview>) {
  return groups.flatMap((group) => group.entries.map((entry) => entry.text)).join(" | ");
}

test("diffActivityForReview returns an empty list for an unchanged bundle", () => {
  const base = baseBundle();
  assert.deepEqual(diffActivityForReview(base, structuredClone(base), ACTIVITY_ID), []);
});

test("diffActivityForReview reports an added device under the Devices section", () => {
  const base = baseBundle();
  const edited = addActivityMemberDevice(base, ACTIVITY_ID, 3);
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.equal(sections(groups).includes("devices"), true);
  assert.match(allText(groups), /Added "Streamer"/);
});

test("diffActivityForReview reports an added shortcut under the Shortcuts section", () => {
  const base = baseBundle();
  const edited = addBundleActivityFavorite(base, ACTIVITY_ID, 3, 31, "Play");
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.equal(sections(groups).includes("shortcuts"), true);
  assert.match(allText(groups), /Added "Play"/);
});

test("diffActivityForReview reports a shortcut rename", () => {
  const base = baseBundle();
  const edited = renameBundleActivityFavorite(base, ACTIVITY_ID, 2, "Soundbar Power");
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  // The shortcut's display name is the referenced command's name ("Power"
  // in the base command list), not the row's stale resolved copy — a
  // favorite rename IS a command rename, and both diff lines say so.
  assert.match(allText(groups), /Renamed "Power" → "Soundbar Power"/);
  assert.match(allText(groups), /Renamed command "Power" → "Soundbar Power"/);
});

test("diffActivityForReview reports a shortcut reorder despite positional button_ids", () => {
  const base = baseBundle();
  const edited = structuredClone(base);
  const activity = edited.activities.find(
    (a) => Number(a.device?.device_id) === ACTIVITY_ID,
  )!;
  // Editor swaps the two favorites and reassigns button_ids positionally, so
  // button_id is unchanged {1,2} but the content order flips.
  activity.favorite_slots = [
    { button_id: 1, device_id: 2, command_id: 20, name: "Bar Power" },
    { button_id: 2, device_id: 1, command_id: 10, name: "TV Power" },
  ];
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.match(allText(groups), /Reordered/);
  assert.doesNotMatch(allText(groups), /Added|Removed/);
});

test("diffActivityForReview does not report a reorder when the net order matches the hub slot table", () => {
  // The hub's family-0x61 slot table (favorites_order) shows Bar Power first
  // even though its button_id (2) sorts last. The user makes a net-zero change:
  // the editor renumbers positionally and writes favorites_order=[1,2]. Because
  // the diff orders BOTH sides by favorites_order, the net order is unchanged —
  // no phantom "Reordered". (Button_id order alone would falsely flag it.)
  const base = baseBundle();
  (base.activities[0] as any).favorites_order = [2, 1];
  const edited = structuredClone(base);
  const activity = edited.activities.find(
    (a) => Number(a.device?.device_id) === ACTIVITY_ID,
  )!;
  activity.favorite_slots = [
    { button_id: 1, device_id: 2, command_id: 20, name: "Bar Power" },
    { button_id: 2, device_id: 1, command_id: 10, name: "TV Power" },
  ] as any;
  (activity as any).favorites_order = [1, 2];
  assert.doesNotMatch(allText(diffActivityForReview(base, edited, ACTIVITY_ID)), /Reordered/);
});

test("diffActivityForReview reports a macro move as a reorder, not add+remove", () => {
  const base = baseBundle();
  const baseActivity = base.activities.find(
    (a) => Number(a.device?.device_id) === ACTIVITY_ID,
  )!;
  baseActivity.macros!.push({
    button_id: 3, name: "Combo", steps: [
      { device_id: 1, command_id: 10, button_code: 0, duration: 0, delay: 255 },
    ],
  } as any);
  const edited = structuredClone(base);
  const activity = edited.activities.find(
    (a) => Number(a.device?.device_id) === ACTIVITY_ID,
  )!;
  // Editor moves the macro to the front; positional renumbering makes it
  // macro 1 and shifts both favorites down.
  activity.macros = [
    { button_id: 1, name: "Combo", steps: [
      { device_id: 1, command_id: 10, button_code: 0, duration: 0, delay: 255 },
    ] } as any,
    ...activity.macros!.filter((m) => Number(m.button_id) >= 198),
  ];
  activity.favorite_slots = [
    { button_id: 2, device_id: 1, command_id: 10, name: "TV Power" },
    { button_id: 3, device_id: 2, command_id: 20, name: "Bar Power" },
  ];
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.match(allText(groups), /Reordered/);
  assert.doesNotMatch(allText(groups), /Added|Removed/);
});

test("diffActivityForReview flags idle-behavior changes as device-wide/global", () => {
  const base = baseBundle();
  const edited = updateBundleDeviceIdleBehavior(base, 1, IDLE_BEHAVIOR_AUTO_OFF);
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  const deviceWide = groups.find((group) => group.section === "device_wide");
  assert.ok(deviceWide, "expected a device_wide group");
  assert.equal(deviceWide!.entries.every((entry) => entry.global === true), true);
  assert.match(allText(groups), /"Television" idle behavior/);
});

test("diffActivityForReview flags command renames as device-wide/global", () => {
  const base = baseBundle();
  const edited = renameBundleDeviceCommand(base, 1, 10, "Power Toggle");
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  const deviceWide = groups.find((group) => group.section === "device_wide");
  assert.ok(deviceWide, "expected a device_wide group");
  assert.match(allText(groups), /Renamed command "Power" → "Power Toggle" on "Television"/);
});

test("diffActivityForReview reports a role reassignment under the Buttons section", () => {
  const base = baseBundle();
  const edited = setActivityRoleDevice(base, ACTIVITY_ID, "volume", 2);
  const groups = diffActivityForReview(base, edited, ACTIVITY_ID);
  assert.equal(sections(groups).includes("buttons"), true);
});

// ── Device review (live device editor) ────────────────────────────────

import { diffDeviceForReview } from "../../custom_components/sofabaton_x1s/www/src/tabs/activity-diff";

function deviceAllText(groups: ReturnType<typeof diffDeviceForReview>) {
  return groups.flatMap((group) => group.entries.map((entry) => entry.text)).join(" | ");
}

test("diffDeviceForReview returns an empty list for an unchanged bundle", () => {
  const base = baseBundle();
  assert.deepEqual(diffDeviceForReview(base, structuredClone(base), 1), []);
});

test("diffDeviceForReview reports idle-behavior changes under Power", () => {
  const base = baseBundle();
  const edited = updateBundleDeviceIdleBehavior(base, 1, IDLE_BEHAVIOR_AUTO_OFF);
  const groups = diffDeviceForReview(base, edited, 1);
  assert.deepEqual(groups.map((group) => group.section), ["power"]);
  assert.match(deviceAllText(groups), /Automatic power control/);
});

test("diffDeviceForReview reports binding changes under Buttons", () => {
  const base = baseBundle();
  const edited = structuredClone(base) as any;
  // Rebind OK (0xB0) on Television to Volume Up, and drop the long press.
  edited.devices[0].button_bindings = [{ button_id: 0xB0, command_id: 11 }];
  const groups = diffDeviceForReview(base, edited, 1);
  assert.deepEqual(groups.map((group) => group.section), ["buttons"]);
  assert.match(deviceAllText(groups), /"OK" now sends "Volume Up"/);
});

test("diffDeviceForReview reports cleared bindings under Buttons", () => {
  const base = baseBundle();
  const edited = structuredClone(base) as any;
  edited.devices[0].button_bindings = [];
  const groups = diffDeviceForReview(base, edited, 1);
  assert.match(deviceAllText(groups), /"OK" no longer bound/);
});

test("diffDeviceForReview reports an IP address change under Network", () => {
  const base = structuredClone(baseBundle()) as any;
  base.devices[0].device.device_class = "wifi_roku";
  base.devices[0].device.ip_address = "192.168.1.40";
  const edited = structuredClone(base) as any;
  edited.devices[0].device.ip_address = "192.168.1.42";
  const groups = diffDeviceForReview(base, edited, 1);
  assert.deepEqual(groups.map((group) => group.section), ["network"]);
  assert.match(deviceAllText(groups), /IP address → 192\.168\.1\.42/);

  const cleared = structuredClone(base) as any;
  cleared.devices[0].device.ip_address = null;
  assert.match(deviceAllText(diffDeviceForReview(base, cleared, 1)), /IP address cleared/);
});

test("diffDeviceForReview reports power sequence and macro edits", () => {
  const base = structuredClone(baseBundle()) as any;
  base.devices[0].macros = [
    { button_id: 198, name: "PWRON", steps: [] },
    { button_id: 30, name: "Movie Mode", steps: [] },
  ];
  const edited = structuredClone(base) as any;
  edited.devices[0].macros[0].steps = [{ device_id: 1, command_id: 10, button_code: 0, duration: 0, delay: 255 }];
  edited.devices[0].macros[1].name = "Cinema Mode";
  const groups = diffDeviceForReview(base, edited, 1);
  assert.deepEqual(groups.map((group) => group.section), ["power", "macros"]);
  assert.match(deviceAllText(groups), /Power-on sequence updated/);
  assert.match(deviceAllText(groups), /Renamed macro "Movie Mode" → "Cinema Mode"/);
});
