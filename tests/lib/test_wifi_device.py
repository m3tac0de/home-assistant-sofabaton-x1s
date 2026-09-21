"""Managed wifi device value types, the spec adapter, network command
payloads and their edit helpers (callbacks plan, C0a / C0d).

Pure: nothing here touches an engine. The facade operations over these
are covered in test_aio_real_engine.py.
"""

from __future__ import annotations

import copy
import importlib
import importlib.util
import sys
import types
from pathlib import Path

import pytest

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)


def _load_lib() -> types.ModuleType:
    name = "sofabaton_wifi_device_test_pkg"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, LIB_DIR / "__init__.py", submodule_search_locations=[str(LIB_DIR)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_pkg = _load_lib()
wifi_device = importlib.import_module(f"{_pkg.__name__}.wifi_device")
wifi_inplace_plan = importlib.import_module(f"{_pkg.__name__}.wifi_inplace_plan")
blob_decoders = importlib.import_module(f"{_pkg.__name__}.blob_decoders")
activity_sync = importlib.import_module(f"{_pkg.__name__}.activity_sync")
edits = importlib.import_module(f"{_pkg.__name__}.edits")

WifiDeviceSpec = wifi_device.WifiDeviceSpec
WifiSlotSpec = wifi_device.WifiSlotSpec
WifiTarget = wifi_device.WifiTarget
WifiDeployment = wifi_device.WifiDeployment
NetworkCommand = _pkg.NetworkCommand
N = wifi_device.WIFI_SLOT_COUNT


# ---------------------------------------------------------------------------
# the spec
# ---------------------------------------------------------------------------


def test_spec_normalization_fills_defaults_and_is_idempotent() -> None:
    spec = WifiDeviceSpec(name="  Server  ", slots=(WifiSlotSpec(" Play "), WifiSlotSpec("Pause", "Hold pause")))
    norm = spec.normalized()
    assert norm.name == "Server" and norm.brand == "m3tac0de"
    assert len(norm.slots) == N
    assert norm.slots[0] == WifiSlotSpec("Play", "Play Long")
    assert norm.slots[1] == WifiSlotSpec("Pause", "Hold pause")
    assert norm.slots[2] == WifiSlotSpec("Button 3", "Button 3 Long")
    assert norm.normalized() == norm                       # idempotent
    assert WifiDeviceSpec.from_dict(norm.to_dict()).normalized() == norm


@pytest.mark.parametrize(
    "bad",
    [
        dict(name=""),
        dict(name="x", slots=tuple(WifiSlotSpec(f"b{i}") for i in range(N + 1))),
        dict(name="x", power_on_slot=0),
        dict(name="x", power_off_slot=N + 1),
        dict(name="x", input_slots=(2, 2)),
        dict(name="x", power_on_slot=3, input_slots=(3,)),
        dict(name="x" * 31),
        dict(name="x", slots=(WifiSlotSpec("y" * 31),)),
    ],
)
def test_spec_normalization_refuses_what_a_hub_or_an_update_cannot_take(bad) -> None:
    with pytest.raises(ValueError):
        WifiDeviceSpec(**bad).normalized()


def test_target_validates_host_and_port() -> None:
    assert WifiTarget(host=" 192.168.1.10 ", port=8060).host == "192.168.1.10"
    for host, port in (("sofabaton.local", 8060), ("192.168.1.10", 0), ("192.168.1.10", 70000)):
        with pytest.raises(ValueError):
            WifiTarget(host=host, port=port)


def test_deployment_round_trips_through_dict() -> None:
    spec = WifiDeviceSpec(name="Server", slots=(WifiSlotSpec("Play"),), power_on_slot=1).normalized()
    dep = WifiDeployment(
        device_id=12, spec=spec, target=WifiTarget("192.168.1.10", 8060, "aabbccddeeff"),
        labels=wifi_device.labels_from_spec(spec), hub_version="X1S",
    )
    again = WifiDeployment.from_dict(dep.to_dict())
    assert again == dep
    assert again.labels[1] == "Play" and again.labels[1 + N] == "Play Long"


# ---------------------------------------------------------------------------
# the adapter
# ---------------------------------------------------------------------------


def test_snapshot_from_spec_expands_every_slot_and_carries_the_hooks() -> None:
    spec = WifiDeviceSpec(name="Server", slots=(WifiSlotSpec("Play"),), power_on_slot=1,
                          power_off_slot=2, input_slots=(3, 4))
    snap = wifi_device.snapshot_from_spec(spec, device_id=12, hub_version="X1S", target_host="10.0.0.2")
    assert snap.device_id == 12 and snap.device_name == "Server" and snap.target_host == "10.0.0.2"
    assert len(snap.slots) == 2 * N
    assert snap.slots[1].label == "Play" and snap.slots[1].press_type == "short"
    assert snap.slots[1 + N].label == "Play Long" and snap.slots[1 + N].press_type == "long"
    assert (snap.power_on_command_id, snap.power_off_command_id) == (1, 2)
    assert snap.input_command_ids == (3, 4)
    assert snap.activities == {} and snap.device_bindings == ()
    assert wifi_device.labels_from_spec(spec) == {cid: s.label for cid, s in snap.slots.items()}


def test_snapshot_from_spec_drops_the_hooks_on_an_x1() -> None:
    spec = WifiDeviceSpec(name="Server", power_on_slot=1, input_slots=(2,))
    snap = wifi_device.snapshot_from_spec(spec, device_id=12, hub_version="X1")
    assert snap.power_on_command_id is None and snap.input_command_ids == ()


def test_unchanged_spec_plans_nothing() -> None:
    spec = WifiDeviceSpec(name="Server", slots=(WifiSlotSpec("Play"),), power_on_slot=1)
    a = wifi_device.snapshot_from_spec(spec, device_id=12, hub_version="X1S", target_host="10.0.0.2")
    b = wifi_device.snapshot_from_spec(WifiDeviceSpec.from_dict(spec.to_dict()), device_id=12,
                                       hub_version="X1S", target_host="10.0.0.2")
    plan = wifi_inplace_plan.build_wifi_inplace_plan(a, b, deployed=a)
    assert plan.steps == () and not plan.is_fallback


def test_command_defs_match_the_ha_deploy_shape() -> None:
    defs = wifi_device.command_defs_from_spec(WifiDeviceSpec(name="S", slots=(WifiSlotSpec("Play"),)))
    assert len(defs) == 2 * N
    assert defs[0] == {"display_name": "Play", "trigger_name": "Play", "press_type": "short", "command_index": 0}
    assert defs[N] == {"display_name": "Play Long", "trigger_name": "Play", "press_type": "long", "command_index": 0}
    assert defs[N - 1]["display_name"] == f"Button {N}" and defs[N - 1]["command_index"] == N - 1


# ---------------------------------------------------------------------------
# where a slot's command goes (server panel wifi commands plan, section 6)
# ---------------------------------------------------------------------------

VOL_UP, VOL_DOWN, MUTE = 0xB6, 0xB9, 0xB8


def _routed_spec() -> "WifiDeviceSpec":
    return WifiDeviceSpec(name="Lights", power_on_slot=4, slots=(
        WifiSlotSpec("On", favorite=True, button=VOL_UP, long_press=True, activities=(102, 101, 101)),
        WifiSlotSpec("Off", button=VOL_DOWN, activities=(101,)),
        WifiSlotSpec("Scene", input_activity_id=101),
        WifiSlotSpec("Power"),
    ))


def test_slot_references_normalize_and_round_trip() -> None:
    norm = _routed_spec().normalized()
    on, off, scene = norm.slots[0], norm.slots[1], norm.slots[2]
    assert (on.favorite, on.button, on.long_press, on.activities) == (True, VOL_UP, True, (101, 102))
    assert (off.favorite, off.button, off.long_press, off.activities) == (False, VOL_DOWN, False, (101,))
    assert scene.input_activity_id == 101 and scene.activities == ()
    assert norm.normalized() == norm and WifiDeviceSpec.from_dict(norm.to_dict()).normalized() == norm
    assert norm.has_references and not WifiDeviceSpec(name="Plain").normalized().has_references
    # A record written before slots had references reads back as a plain slot.
    assert WifiSlotSpec.from_dict({"label": "Old", "long_label": None}).normalized(1) == WifiSlotSpec("Old", "Old Long")
    # Long press means nothing without a button; an activity list only while a favorite or a button holds it (#258).
    loose = WifiSlotSpec("X", long_press=True, activities=(101,)).normalized(1)
    assert loose.long_press is False and loose.activities == ()
    # The input list: what the spec lists, then the input-activity slots, in slot order.
    assert wifi_device.input_slots_from_spec(norm) == (3,)
    listed = WifiDeviceSpec(name="L", input_slots=(5, 3), slots=(WifiSlotSpec("a"), WifiSlotSpec("b", input_activity_id=9),
                                                                  WifiSlotSpec("c", input_activity_id=8))).normalized()
    assert wifi_device.input_slots_from_spec(listed) == (5, 3, 2)
    bare = norm.without_references()
    assert not bare.has_references and bare.input_slots == (3,) and bare.power_on_slot == 4
    assert [s.label for s in bare.slots[:3]] == ["On", "Off", "Scene"]


@pytest.mark.parametrize(
    "slots",
    [
        (WifiSlotSpec("a", button=VOL_UP), WifiSlotSpec("b", button=VOL_UP)),              # one slot per button
        (WifiSlotSpec("a", input_activity_id=101), WifiSlotSpec("b", input_activity_id=101)),   # one input per activity
        (WifiSlotSpec("a", button=0xC6),),                                                  # the power macros are not buttons
        (WifiSlotSpec("a", button=7),),
        (WifiSlotSpec("a", favorite=True, activities=(0,)),),
        (WifiSlotSpec("a", input_activity_id="nope"),),
    ],
)
def test_slot_references_refuse_what_the_card_refuses(slots) -> None:
    with pytest.raises(ValueError):
        WifiDeviceSpec(name="x", slots=slots).normalized()
    with pytest.raises(ValueError):                                                         # a power hook is never an input
        WifiDeviceSpec(name="x", power_off_slot=1, slots=(WifiSlotSpec("a", input_activity_id=101),)).normalized()


def test_snapshot_from_spec_derives_the_references_as_the_ha_adapter_does() -> None:
    snap = wifi_device.snapshot_from_spec(_routed_spec(), device_id=12, hub_version="X1S")
    assert snap.input_command_ids == (3,) and snap.power_on_command_id == 4
    assert sorted(snap.activities) == [101, 102]
    a101, a102 = snap.activities[101], snap.activities[102]
    assert a101.input_ordinal == 1 and a102.input_ordinal == 0
    assert dict(a101.favorites) == {1: 0} and dict(a102.favorites) == {1: 0}
    assert a101.bindings == ((VOL_UP, 1, 1 + N), (VOL_DOWN, 2, None)) and a102.bindings == ((VOL_UP, 1, 1 + N),)
    assert snap.device_bindings == ((VOL_UP, 1, 1 + N), (VOL_DOWN, 2, None))

    # The same device written as a Home Assistant command config expands to the same references.
    ha = wifi_inplace_plan.desired_snapshot_from_config(
        {"commands": [
            {"name": "On", "add_as_favorite": True, "hard_button": "volup", "long_press_enabled": True, "activities": ["101", "102"]},
            {"name": "Off", "hard_button": "voldn", "activities": ["101"]},
            {"name": "Scene", "input_activity_id": "101"},
            {"name": "Power"},
        ], "power_on_command_id": 4},
        device_id=12, device_name="Lights", brand="m3tac0de", hard_button_codes={"volup": VOL_UP, "voldn": VOL_DOWN},
    )
    assert {k: (v.input_ordinal, dict(v.favorites), v.bindings) for k, v in ha.activities.items()} == \
           {k: (v.input_ordinal, dict(v.favorites), v.bindings) for k, v in snap.activities.items()}
    assert ha.device_bindings == snap.device_bindings and ha.input_command_ids == snap.input_command_ids

    # An X1 keeps the favorites and buttons and drops the input, as it drops every hook.
    x1 = wifi_device.snapshot_from_spec(_routed_spec(), device_id=12, hub_version="X1")
    assert x1.input_command_ids == () and x1.activities[101].input_ordinal == 0
    assert x1.activities[101].bindings == a101.bindings


def test_the_planner_writes_what_a_slot_names_and_removes_only_what_a_spec_put_there() -> None:
    plain = WifiDeviceSpec(name="Lights", slots=(WifiSlotSpec("On"), WifiSlotSpec("Off")))
    routed = WifiDeviceSpec(name="Lights", slots=(
        WifiSlotSpec("On", favorite=True, button=VOL_UP, long_press=True, activities=(101,)), WifiSlotSpec("Off")))
    snap = lambda spec: wifi_device.snapshot_from_spec(spec, device_id=12, hub_version="X1S")  # noqa: E731
    base = snap(plain)

    plan = wifi_inplace_plan.build_wifi_inplace_plan(base, snap(routed), deployed=snap(plain))
    kinds = [(s.kind, s.payload.get("activity_id"), s.payload.get("button_id"), s.payload.get("command_id")) for s in plan.steps]
    assert kinds == [
        ("binding_write", 12, VOL_UP, 1),                     # the device's own page
        ("member_replay", 101, None, None),                   # joins the activity
        ("favorite_add", 101, None, 1),
        ("binding_write", 101, VOL_UP, 1),
    ]
    assert plan.steps[-1].payload["long_press_command_id"] == 1 + N

    # The live device as that spec left it, plus a MUTE binding made in the activity editor.
    refs = snap(routed).activities[101]
    live = wifi_inplace_plan.ManagedWifiSnapshot(
        device_id=12, device_name="Lights", brand="m3tac0de", slots=base.slots, device_bindings=snap(routed).device_bindings,
        activities={101: wifi_inplace_plan.WifiActivityRefs(activity_id=101, favorites={1: 7}, member_count=2,
                                                            bindings=refs.bindings + ((MUTE, 2, None),))})
    # Dropping the button while the favorite stays: our binding goes, the foreign one is never planned away.
    favorite_only = WifiDeviceSpec(name="Lights", slots=(WifiSlotSpec("On", favorite=True, activities=(101,)), WifiSlotSpec("Off")))
    trimmed = wifi_inplace_plan.build_wifi_inplace_plan(live, snap(favorite_only), deployed=snap(routed))
    removed = [(s.kind, s.payload.get("activity_id"), s.payload.get("button_id")) for s in trimmed.steps]
    assert removed == [("binding_delete", 12, VOL_UP), ("binding_delete", 101, VOL_UP)]
    # A spec that no longer names the activity at all leaves it, as the Home Assistant path does: the
    # membership we made is removed (the hub cascades the device's rows there), never an activity we did not join.
    back = wifi_inplace_plan.build_wifi_inplace_plan(live, snap(plain), deployed=snap(routed))
    assert [(s.kind, s.payload.get("activity_id")) for s in back.steps] == [("binding_delete", 12), ("membership_remove", 101)]
    foreign = wifi_inplace_plan.build_wifi_inplace_plan(live, snap(plain), deployed=snap(plain))
    assert foreign.steps == ()
    # The same spec again plans nothing.
    assert wifi_inplace_plan.build_wifi_inplace_plan(live, snap(routed), deployed=snap(routed)).steps == ()


# ---------------------------------------------------------------------------
# the planner carries the callback address into the head commit
# ---------------------------------------------------------------------------


def _live(name: str = "Server", ip: str | None = "192.168.1.10") -> dict:
    block = {"device_id": 12, "name": name, "brand": "m3tac0de", "device_class": "wifi_roku"}
    if ip:
        block["ip_address"] = ip
    return {
        "device": block,
        "commands": [{"command_id": cid, "command_label": f"L{cid}"} for cid in range(1, 2 * N + 1)],
        "input_record": None, "macros": [], "button_bindings": [],
    }


def test_baseline_adapter_reads_the_head_address() -> None:
    assert wifi_inplace_plan.baseline_snapshot_from_bundle(_live(), []).target_host == "192.168.1.10"
    assert wifi_inplace_plan.baseline_snapshot_from_bundle(_live(ip=None), []).target_host is None


def test_head_commit_pins_the_desired_address_and_only_then() -> None:
    baseline = wifi_inplace_plan.baseline_snapshot_from_bundle(_live(), [])
    pinned = wifi_inplace_plan.ManagedWifiSnapshot(
        device_id=12, device_name="Renamed", brand="m3tac0de", slots=baseline.slots, target_host="192.168.1.10")
    plan = wifi_inplace_plan.build_wifi_inplace_plan(baseline, pinned)
    head = [s for s in plan.steps if s.kind == "wifi_head_commit"]
    assert len(head) == 1 and head[0].payload["ip_address"] == "192.168.1.10"
    # The Home Assistant path names no target: the payload stays as it was.
    unpinned = wifi_inplace_plan.ManagedWifiSnapshot(
        device_id=12, device_name="Renamed", brand="m3tac0de", slots=baseline.slots)
    plan = wifi_inplace_plan.build_wifi_inplace_plan(baseline, unpinned)
    head = [s for s in plan.steps if s.kind == "wifi_head_commit"]
    assert len(head) == 1 and "ip_address" not in head[0].payload


# ---------------------------------------------------------------------------
# network command payloads
# ---------------------------------------------------------------------------


def test_http_command_renders_through_the_canonical_writer() -> None:
    cmd = NetworkCommand.http(host="192.168.1.20", port=8123, method="post", path="api/webhook/x",
                              content_type="application/json", body='{"a":1}')
    assert cmd.device_class == "wifi_ip" and cmd.fields["method"] == "POST" and cmd.fields["path"] == "/api/webhook/x"
    expected = blob_decoders.render_wifi_ip_blob_body(
        host="192.168.1.20", port=8123, method="POST", path="/api/webhook/x",
        header="", content_type="application/json", body='{"a":1}')
    assert cmd.blob == expected
    decoded = blob_decoders.try_decode_blob("wifi_ip", cmd.blob)
    assert decoded["fields"] == cmd.fields
    assert cmd.library_type == 0x1C
    row = cmd.to_command_row(3, " Lights ")
    rd = row["restore_data"]
    assert row == {"command_id": 3, "name": "Lights", "restore_data": rd}
    assert rd["new"] is True and rd["decoded"]["edited"] is True and rd["decoded"]["class"] == "wifi_ip"
    assert rd["data_hex"] == cmd.blob.hex() and rd["library_type"] == 0x1C
    assert NetworkCommand.from_dict(cmd.to_dict()) == cmd


def test_roku_hue_sonos_commands() -> None:
    roku = NetworkCommand.roku("/keypress/Home")
    assert roku.fields == {"path": "keypress/Home"} and roku.library_type == 0x0A
    assert roku.blob == blob_decoders.render_wifi_roku_blob_body(path="keypress/Home")
    hue = NetworkCommand.hue("api/u/groups/0/action", "Content-Length:17\n\n{\n\"on\": false\n}")
    assert blob_decoders.try_decode_blob("wifi_hue", hue.blob)["fields"] == hue.fields
    sonos = NetworkCommand.sonos("MediaRenderer/RenderingControl/Control")
    assert sonos.device_class == "wifi_sonos" and sonos.fields["body_block"] == ""


@pytest.mark.parametrize(
    "build",
    [
        lambda: NetworkCommand.http(host="sofabaton.local", port=80, method="GET", path="/"),
        lambda: NetworkCommand.http(host="192.168.1.2", port=0, method="GET", path="/"),
        lambda: NetworkCommand.http(host="192.168.1.2", port=80, method="FETCH", path="/"),
        lambda: NetworkCommand.http(host="192.168.1.2", port=80, method="GET", path="/café"),
        lambda: NetworkCommand.roku("   "),
        lambda: NetworkCommand("ir", {"descriptor": "P:NEC1"}),
        lambda: NetworkCommand("wifi_ip", {"host": "192.168.1.2"}),
    ],
)
def test_malformed_network_commands_fail_at_construction(build) -> None:
    with pytest.raises((ValueError, KeyError)):
        build()


# ---------------------------------------------------------------------------
# the edit helpers land network commands and refuse class mismatches
# ---------------------------------------------------------------------------


def _wifi_device_entry(dev_id: int, device_class: str, commands: dict[int, str]) -> dict:
    return {
        "kind": "device_backup", "complete": True, "payload_profile": "structural",
        "device": {"device_id": dev_id, "name": "Net", "brand": "", "device_class": device_class, "idle_behavior": 0},
        "commands": [{"command_id": cid, "name": label} for cid, label in commands.items()],
        "key_sort": None, "input_record": None, "button_bindings": [], "macros": [],
    }


def _bundle() -> dict:
    return {
        "kind": "hub_bundle", "schema_version": 1, "payload_profile": "structural",
        "devices": [
            _wifi_device_entry(5, "wifi_ip", {1: "One"}),
            _wifi_device_entry(6, "wifi_roku", {}),
            {**_wifi_device_entry(7, "ir", {1: "Power"}), "device": {"device_id": 7, "name": "TV", "brand": "Sony",
                                                                     "device_class": "tv", "idle_behavior": 0}},
        ],
        "activities": [],
    }


def _device_plan(base: dict, edited: dict, dev: int) -> list[tuple[str, dict]]:
    return [(s.kind, dict(s.payload)) for s in activity_sync.build_device_sync_plan(base, edited, dev)]


def test_add_and_set_network_commands_plan_the_record_writes() -> None:
    base = _bundle()
    snapshot = copy.deepcopy(base)
    http = NetworkCommand.http(host="192.168.1.20", port=8123, method="POST", path="/api/webhook/x")
    added, slot = edits.add_command(base, 5, http, "Webhook")
    assert slot == 2 and base == snapshot                       # input untouched
    plan = _device_plan(base, added, 5)
    assert [k for k, _ in plan] == ["command_add"]
    rd = plan[0][1]["restore_data"]
    assert rd["decoded"]["class"] == "wifi_ip" and rd["decoded"]["edited"] and rd["new"]

    roku = NetworkCommand.roku("keypress/Home")
    added, slot = edits.add_command(base, 6, roku, "Home")
    assert slot == 1 and _device_plan(base, added, 6)[0][0] == "command_add"

    replaced = edits.set_command_payload(base, 5, 1, NetworkCommand.http(
        host="192.168.1.21", port=80, method="GET", path="/toggle"))
    plan = _device_plan(base, replaced, 5)
    assert [k for k, _ in plan] == ["command_payload"]
    assert plan[0][1]["restore_data"]["decoded"]["fields"]["path"] == "/toggle"


def test_edit_helpers_refuse_a_class_mismatch_before_planning() -> None:
    base = _bundle()
    http = NetworkCommand.http(host="192.168.1.20", port=8123, method="POST", path="/x")
    with pytest.raises(ValueError):
        edits.add_command(base, 6, http, "Wrong")               # http on a roku device
    with pytest.raises(ValueError):
        edits.add_command(base, 7, http, "Wrong")               # http on an IR device
    with pytest.raises(ValueError):
        edits.set_command_payload(base, 5, 1, NetworkCommand.roku("keypress/Home"))
    ir = _pkg.IrPayload.from_descriptor("P:NEC1 D:4 S:5 F:21")
    with pytest.raises(ValueError):
        edits.add_command(base, 5, ir, "Wrong")                 # IR on a wifi_ip device
    added, _ = edits.add_command(base, 7, ir, "Fine")           # IR on the TV still works
    assert _device_plan(base, added, 7)[0][0] == "command_add"


def test_command_records_save_back_on_a_device_of_their_class() -> None:
    base = _bundle()
    base["devices"].append(_wifi_device_entry(8, "bluetooth", {1: "Home"}))
    base["devices"].append(_wifi_device_entry(9, "wifi_mqtt", {1: "Up"}))
    key = _pkg.CommandRecord("bluetooth", bytes([0x07, 0x00, 0x27]))
    added, slot = edits.add_command(base, 8, key, "Back")
    plan = _device_plan(base, added, 8)
    assert slot == 2 and [k for k, _ in plan] == ["command_add"]
    rd = plan[0][1]["restore_data"]
    assert rd["data_hex"] == "070027" and rd["library_type"] == 0x03 and rd["new"]

    replaced = edits.set_command_payload(base, 9, 1, _pkg.CommandRecord("wifi_mqtt", bytes([0x09, 0x01])))
    plan = _device_plan(base, replaced, 9)
    assert [k for k, _ in plan] == ["command_payload"]
    assert plan[0][1]["restore_data"]["data_hex"] == "0901" and plan[0][1]["restore_data"]["library_type"] == 0x20

    with pytest.raises(ValueError):
        edits.add_command(base, 9, key, "Wrong")                # a Bluetooth key on a wifi_mqtt device
    with pytest.raises(ValueError):
        edits.add_command(base, 8, _pkg.IrPayload.from_descriptor("P:NEC1 D:4 S:5 F:21"), "Wrong")   # IR on Bluetooth


def test_network_command_trailer_round_trips() -> None:
    cmd = NetworkCommand("wifi_roku", {"path": "keypress/Home"}, "F1")
    assert cmd.trailer_hex == "f1" and cmd.blob.endswith(b"\xf1") and cmd.hex == cmd.blob.hex(" ")
    assert NetworkCommand.from_dict(cmd.to_dict()) == cmd
    assert cmd.decoded["trailer_hex"] == "f1"
    assert _pkg.payloads.payload_from_body("wifi_roku", cmd.blob) == cmd
