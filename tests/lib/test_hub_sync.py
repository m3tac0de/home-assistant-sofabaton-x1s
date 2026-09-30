"""Golden tests for the whole-document planner (lib/hub_sync.py, phase 4 H0).

Each test builds a baseline document and a desired copy, and asserts the
exact item list (kinds, ids, order) or the exact stage A failure class.
Nothing here touches a hub or the facade.
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
    name = "sofabaton_hub_sync_test_pkg"
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
hub_sync = importlib.import_module(f"{_pkg.__name__}.hub_sync")
build = hub_sync.build_hub_sync_plan

POWER_ON = int(_pkg.ButtonName.POWER_ON)
VOL_UP = int(_pkg.ButtonName.VOL_UP)


# -- fixtures ------------------------------------------------------------------------


def _device(dev_id: int, name: str, commands: dict[int, str], *, complete: bool = True,
            inputs: dict[int, int] | None = None) -> dict:
    return {
        "kind": "device_backup",
        "complete": complete,
        "editable": complete,
        "fetched_at": "2026-09-12T00:00:00Z",
        "payload_profile": "structural",
        "device": {"device_id": dev_id, "name": name, "brand": "Acme", "device_class": "ir",
                   "sort": dev_id, "idle_behavior": 0},
        "commands": [{"command_id": cid, "name": label} for cid, label in commands.items()],
        "key_sort": None,
        "input_record": (
            {"entries": [{"input_index": idx, "command_id": cid, "name": f"In{idx}"}
                         for idx, cid in inputs.items()]}
            if inputs else None
        ),
        "button_bindings": [],
        "macros": [],
    }


def _activity(act_id: int, name: str, *, bindings=(), favorites=(), macros=(), members=(),
              complete: bool = True) -> dict:
    return {
        "kind": "activity_backup",
        "complete": complete,
        "editable": complete,
        "fetched_at": "2026-09-12T00:00:00Z",
        "device": {"device_id": act_id, "name": name, "entity_type": "activity", "sort": act_id - 100},
        "button_bindings": [dict(b) for b in bindings],
        "favorite_slots": [dict(f) for f in favorites],
        "favorites_order": [f["button_id"] for f in favorites],
        "macros": [copy.deepcopy(m) for m in macros],
        "referenced_source_device_ids": sorted(members),
    }


def _binding(button: int, dev: int, cmd: int, long_press=None) -> dict:
    row = {"button_id": button, "device_id": dev, "command_id": cmd,
           "long_press_device_id": None, "long_press_command_id": None}
    if long_press:
        row["long_press_device_id"], row["long_press_command_id"] = long_press
    return row


def _power_macros(*member_ids: int) -> list[dict]:
    return [
        {"button_id": 198, "name": "POWER_ON", "steps": [
            {"device_id": d, "command_id": 0xC6, "button_code": 0, "duration": 0, "delay": 255}
            for d in member_ids
        ]},
        {"button_id": 199, "name": "POWER_OFF", "steps": [
            {"device_id": d, "command_id": 0xC7, "button_code": 0, "duration": 0, "delay": 255}
            for d in member_ids
        ]},
    ]


def _bundle() -> dict:
    return {
        "kind": "hub_bundle",
        "schema_version": 5,
        "complete": True,
        "captured_at": "2026-09-12T00:00:00Z",
        "payload_profile": "structural",
        "hub": {"name": "Den", "version": "X1S"},
        "devices": [
            _device(5, "TV", {1: "Power", 2: "Mute", 3: "HDMI1"}, inputs={1: 3}),
            _device(7, "Amp", {3: "Vol+"}),
            _device(9, "Streamer", {30: "Home"}),
        ],
        "activities": [
            _activity(101, "Watch TV",
                      bindings=[_binding(POWER_ON, 5, 1)],
                      favorites=[{"button_id": 1, "device_id": 5, "command_id": 2, "name": "Mute"},
                                 {"button_id": 2, "device_id": 7, "command_id": 3, "name": "Vol+"}],
                      macros=_power_macros(5, 7), members=(5, 7)),
            _activity(102, "Listen", macros=_power_macros(7), members=(7,)),
        ],
    }


def _find(doc: dict, kind: str, entity_id: int) -> dict:
    key = "devices" if kind == "device" else "activities"
    return next(r for r in doc[key] if r["device"]["device_id"] == entity_id)


def _kinds(plan) -> list[tuple]:
    return [(i.kind, i.placeholder_id if i.placeholder_id is not None else i.entity_id) for i in plan.items]


def _steps(plan, index: int) -> list[str]:
    return [s.kind for s in plan.items[index].steps]


# -- unchanged / provenance --------------------------------------------------------------


def test_identical_documents_plan_nothing() -> None:
    base = _bundle()
    plan = build(base, copy.deepcopy(base))
    assert plan.is_empty
    assert plan.step_count == 0
    assert plan.live_check == ()
    assert plan.provisional_ids == {}


def test_provenance_and_sort_changes_alone_plan_nothing() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired["snapshot_id"] = "abc"
    desired["captured_at"] = "later"
    for row in desired["devices"] + desired["activities"]:
        row["fetched_at"] = "later"
        row["complete"] = False
        row["editable"] = False
        row["device"]["sort"] = 99
    assert build(base, desired).is_empty


def test_baseline_is_never_mutated() -> None:
    base = _bundle()
    before = copy.deepcopy(base)
    desired = copy.deepcopy(base)
    desired["devices"].append(_device(-1, "New", {1: "On"}))
    _find(desired, "activity", 101)["device"]["name"] = "Movie"
    build(base, desired)
    assert base == before


# -- one item per row of the contract table ----------------------------------------------


def test_hub_rename_is_first() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired["hub"]["name"] = " Living Room "
    plan = build(base, desired)
    assert _kinds(plan) == [("hub_rename", None)]
    assert plan.items[0].payload == {"name": "Living Room"}


def test_edited_activity_plans_one_sync_with_the_entity_planner_steps() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired = _pkg.edits.bind_button(desired, 101, VOL_UP, 7, 3)
    plan = build(base, desired)
    assert _kinds(plan) == [("sync_activity", 101)]
    # The trailing remote_sync step is the favorites-mapping read the
    # engine runs after an activity write; it stays in the item.
    assert _steps(plan, 0) == ["binding_write", "remote_sync"]
    assert plan.items[0].provisional is False
    assert plan.live_check == (hub_sync.EntityRef("activity", 101),)


def test_edited_device_plans_one_sync() -> None:
    base = _bundle()
    desired = _pkg.edits.rename_command(copy.deepcopy(base), 5, 1, "Standby")
    plan = build(base, desired)
    assert _kinds(plan) == [("sync_device", 5)]
    assert _steps(plan, 0) == ["command_rename"]


def test_created_device_is_create_then_sync_with_every_command_flagged_new() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired["devices"].append(_device(-1, "Projector", {}))
    _find(desired, "device", -1)["commands"] = [
        {"command_id": 1, "name": "Power", "restore_data": {"transport": "hub_code_record", "data_hex": "0a 4f"}},
        {"command_id": 2, "name": "Mute", "restore_data": {"transport": "hub_code_record", "data_hex": "0b 4f"}},
    ]
    plan = build(base, desired)
    assert _kinds(plan) == [("add_device", -1), ("sync_device", -1), ("reorder_devices", None)]
    assert plan.items[0].payload == {"name": "Projector", "device_class": "ir"}
    assert plan.items[0].entity_id is None
    assert _steps(plan, 1) == ["command_add", "command_add", "idle_behavior", "device_rename"]
    assert plan.items[1].provisional is True
    assert plan.provisional_ids == {-1: 1}  # lowest free device id
    # No live check for a create: nothing on the hub to compare against.
    assert plan.live_check == ()


def test_created_activity_referencing_a_created_device_resolves_its_input() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired["devices"].append(_device(-1, "Projector", {}, inputs={1: 4}))
    _find(desired, "device", -1)["commands"] = [
        {"command_id": 4, "name": "HDMI", "restore_data": {"transport": "hub_code_record", "data_hex": "0c"}},
    ]
    macros = _power_macros(-1, 7)
    macros[0]["steps"].append({"device_id": -1, "command_id": 0xC5, "button_code": 0, "duration": 1, "delay": 255})
    desired["activities"].append(_activity(-2, "Movie", bindings=[_binding(POWER_ON, -1, 4)],
                                           macros=macros, members=(-1, 7)))
    plan = build(base, desired)
    assert _kinds(plan) == [("add_device", -1), ("sync_device", -1), ("add_activity", -2), ("sync_activity", -2),
                            ("reorder_devices", None), ("reorder_activities", None)]
    assert plan.provisional_ids == {-1: 1, -2: 103}
    sync = plan.items[3]
    member = next(s for s in sync.steps if s.kind == "member_replay" and s.target_device_id == 1)
    # The new device's input record was in the working document when the
    # activity was planned, so the chosen input resolved to its command id.
    assert member.payload["input_cmd_id"] == 4
    binding = next(s for s in sync.steps if s.kind == "binding_write")
    assert binding.payload["device_id"] == 1  # provisional physical id, not the placeholder


def test_removed_activity_and_device_after_edits_before_orders() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    # Move the only binding off device 9 (none exist) and delete it, plus delete activity 102.
    desired["devices"] = [r for r in desired["devices"] if r["device"]["device_id"] != 9]
    desired["activities"] = [r for r in desired["activities"] if r["device"]["device_id"] != 102]
    desired = _pkg.edits.rename_activity(desired, 101, "Cinema")
    plan = build(base, desired)
    assert _kinds(plan) == [("sync_activity", 101), ("remove_activity", 102), ("remove_device", 9)]
    assert "device 9 ('Streamer') will be deleted" in plan.notes
    assert "activity 102 ('Listen') will be deleted" in plan.notes
    # A device deletion re-reads every activity before the first write.
    assert plan.live_check == (hub_sync.EntityRef("activity", 101),)


def test_reorder_only_when_the_surviving_order_differs() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired["devices"].reverse()
    plan = build(base, desired)
    assert _kinds(plan) == [("reorder_devices", None)]
    assert plan.items[0].payload == {"order": [9, 7, 5]}

    # Deleting a device does not by itself change the order of the rest.
    desired = copy.deepcopy(base)
    desired["devices"] = desired["devices"][1:]
    desired["activities"] = []  # no references left
    plan = build(base, desired)
    assert _kinds(plan) == [("remove_activity", 101), ("remove_activity", 102), ("remove_device", 5)]

    # A create always brings the order item (where the hub places a new
    # entity is the hub's business; the runner writes only when the live
    # order differs), and an activity with nothing but a name needs no
    # sync after it.
    desired = copy.deepcopy(base)
    desired["activities"].append(_activity(-1, "Game"))
    plan = build(base, desired)
    assert _kinds(plan) == [("add_activity", -1), ("reorder_activities", None)]
    assert plan.items[-1].payload == {"order": [101, 102, -1]} and plan.items[-1].provisional is True
    # A create inserted first: the placeholder leads the order.
    desired = copy.deepcopy(base)
    desired["activities"].insert(0, _activity(-1, "Game"))
    plan = build(base, desired)
    assert _kinds(plan)[-1] == ("reorder_activities", None)
    assert plan.items[-1].payload == {"order": [-1, 101, 102]}
    assert plan.items[-1].provisional is True


def test_full_document_edit_keeps_the_fixed_item_order() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired["hub"]["name"] = "Loft"
    desired = _pkg.edits.rename_command(desired, 5, 2, "Silence")
    desired["devices"].append(_device(-1, "Projector", {}))
    desired["activities"].append(_activity(-2, "Movie", macros=_power_macros(-1), members=(-1,)))
    desired = _pkg.edits.rename_activity(desired, 101, "Cinema")
    desired["activities"] = [r for r in desired["activities"] if r["device"]["device_id"] != 102]
    desired["devices"] = [r for r in desired["devices"] if r["device"]["device_id"] != 9]
    desired["devices"].reverse()
    plan = build(base, desired)
    assert [i.kind for i in plan.items] == [
        "hub_rename",
        "add_device", "sync_device", "sync_device",
        "add_activity", "sync_activity", "sync_activity",
        "remove_activity", "remove_device",
        "reorder_devices", "reorder_activities",
    ]
    assert [i.index for i in plan.items] == list(range(len(plan.items)))
    d = plan.to_dict()
    assert d["item_count"] == len(plan.items) and d["step_count"] == plan.step_count
    assert d["live_check_count"] == len(plan.live_check)


# -- stage A failures --------------------------------------------------------------------


def test_dangling_reference_to_a_removed_device_names_both_ends() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired["devices"] = [r for r in desired["devices"] if r["device"]["device_id"] != 7]
    with pytest.raises(hub_sync.DanglingReferenceError) as info:
        build(base, desired)
    assert info.value.code == "dangling_reference"
    assert info.value.entity == ("activity", 101)
    assert info.value.target == ("device", 7)
    assert "removes" in str(info.value)


def test_dangling_reference_to_an_unknown_placeholder() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    # Not through edits.bind_button: the helpers mask ids to a byte and
    # cannot carry a placeholder (physical ids only, by design).
    _find(desired, "activity", 101)["button_bindings"].append(_binding(VOL_UP, -5, 1))
    with pytest.raises(hub_sync.DanglingReferenceError) as info:
        build(base, desired)
    assert info.value.target == ("device", -5)



@pytest.mark.parametrize("site", ["binding", "favorite", "macro_step"])
def test_an_activity_the_document_writes_cannot_reference_another_activity(site: str) -> None:
    """One activity never starts or binds another (L-B25, CR-F3-19)."""

    base = _bundle()
    desired = copy.deepcopy(base)
    activity = _find(desired, "activity", 101)
    if site == "binding":
        activity["button_bindings"].append(_binding(VOL_UP, 102, 1))
    elif site == "favorite":
        activity["favorite_slots"].append({"button_id": 3, "device_id": 102, "command_id": 1, "name": "Listen"})
    else:
        activity["macros"][0]["steps"].append({"device_id": 102, "command_id": 0xC6})
    with pytest.raises(hub_sync.InvalidDocumentError, match="cannot reference another activity") as info:
        build(base, desired)
    assert info.value.entity == ("activity", 101)


def test_an_activity_the_document_leaves_alone_is_not_refused_for_its_references() -> None:
    """Only written rows are checked: an unchanged activity is never sent."""

    base = _bundle()
    _find(base, "activity", 101)["button_bindings"].append(_binding(VOL_UP, 102, 1))
    desired = copy.deepcopy(base)
    _find(desired, "device", 9)["device"]["name"] = "Media"
    build(base, desired)

def test_out_of_scope_entity_diff_names_the_entity() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    _find(desired, "device", 5)["device"]["device_class"] = "wifi_roku"  # not live-editable
    with pytest.raises(hub_sync.OutOfScopeError) as info:
        build(base, desired)
    assert info.value.code == "out_of_scope"
    assert info.value.entity == ("device", 5)


def test_unflagged_command_add_on_an_existing_device_is_out_of_scope() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    _find(desired, "device", 7)["commands"].append({"command_id": 4, "name": "Vol-"})
    with pytest.raises(hub_sync.OutOfScopeError):
        build(base, desired)
    # The add_command helper's row shape (restore_data.new) is the accepted one.
    desired = copy.deepcopy(base)
    _find(desired, "device", 7)["commands"].append({
        "command_id": 4, "name": "Vol-",
        "restore_data": {"transport": "hub_code_record", "data_hex": "0a 4f 23", "new": True},
    })
    plan = build(base, desired)
    assert _kinds(plan) == [("sync_device", 7)]
    assert _steps(plan, 0) == ["command_add"]


def test_not_editable_entity_is_refused_but_untouched_ones_are_not_checked() -> None:
    base = _bundle()
    _find(base, "activity", 102)["complete"] = False
    _find(base, "activity", 102)["editable"] = False
    desired = _pkg.edits.rename_activity(copy.deepcopy(base), 101, "Cinema")
    assert _kinds(build(base, desired)) == [("sync_activity", 101)]
    desired = _pkg.edits.rename_activity(copy.deepcopy(base), 102, "Radio")
    with pytest.raises(hub_sync.EntityNotEditableError) as info:
        build(base, desired)
    assert info.value.code == "entity_not_editable"
    assert info.value.entity == ("activity", 102)
    assert isinstance(info.value, _pkg.SnapshotIncompleteError)


def test_deleting_a_device_needs_every_activity_complete() -> None:
    base = _bundle()
    _find(base, "activity", 102)["complete"] = False
    desired = copy.deepcopy(base)
    desired["devices"] = [r for r in desired["devices"] if r["device"]["device_id"] != 9]
    with pytest.raises(hub_sync.DocumentIncompleteError) as info:
        build(base, desired)
    assert info.value.code == "snapshot_incomplete"
    assert info.value.entities == (("activity", 102),)
    # Deleting an activity has no such rule.
    desired = copy.deepcopy(base)
    desired["activities"] = [r for r in desired["activities"] if r["device"]["device_id"] != 101]
    assert _kinds(build(base, desired)) == [("remove_activity", 101)]


@pytest.mark.parametrize(
    "mutate, message",
    [
        (lambda d: d["devices"].append(_device(42, "Ghost", {})), "not in the baseline"),
        (lambda d: d["devices"].append(_device(150, "Ghost", {})), "outside the device range"),
        (lambda d: d["devices"].append(_device(-1, "A", {})) or d["activities"].append(_activity(-1, "B")),
         "used by more than one"),
        (lambda d: d["devices"].append(_device(-1, "  ", {})), "needs a name"),
        (lambda d: d["devices"].append({**_device(-1, "New", {}), "device": {"device_id": -1, "name": "New"}}),
         "device_class"),
        (lambda d: d["devices"].append(_device(-1, "New", {})) or d["devices"][-1]["device"].update(device_class="bluetooth"),
         "cannot be created on a X1S"),
        (lambda d: d["devices"].append(_device(5, "Dup", {})), "appears twice"),
        (lambda d: d["hub"].update(name=""), "needs a name"),
        (lambda d: d["activities"].append({"device": {"name": "no id"}}), "no integer device.device_id"),
    ],
)
def test_invalid_documents(mutate, message) -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    mutate(desired)
    with pytest.raises(hub_sync.InvalidDocumentError, match=message):
        build(base, desired)


def test_create_class_check_is_skipped_without_a_hub_version() -> None:
    base = _bundle()
    base["hub"].pop("version")
    desired = copy.deepcopy(base)
    desired["devices"].append(_device(-1, "New", {}))
    desired["devices"][-1]["device"]["device_class"] = "anything"
    assert _kinds(build(base, desired)) == [("add_device", -1), ("sync_device", -1), ("reorder_devices", None)]
    with pytest.raises(hub_sync.InvalidDocumentError):
        build(base, desired, hub_version="X1S")


def test_stage_a_runs_before_any_planning() -> None:
    """A dangling reference is reported even when another entity's diff is
    out of scope: validation precedes planning."""
    base = _bundle()
    desired = copy.deepcopy(base)
    _find(desired, "device", 5)["device"]["device_class"] = "wifi_roku"
    desired["devices"] = [r for r in desired["devices"] if r["device"]["device_id"] != 7]
    with pytest.raises(hub_sync.DanglingReferenceError):
        build(base, desired)


# -- the reference walker and the id rewrite ------------------------------------------------


def test_reference_walker_covers_every_site() -> None:
    doc = {
        "devices": [{"device": {"device_id": 5}, "button_bindings": [_binding(1, 6, 1, long_press=(7, 2))],
                     "macros": [{"button_id": 10, "steps": [{"device_id": 8, "command_id": 1},
                                                             {"device_id": 0xFF, "command_id": 0xFF}]}]}],
        "activities": [{"device": {"device_id": 101},
                        "favorite_slots": [{"button_id": 1, "device_id": 9, "command_id": 1}],
                        "button_bindings": [_binding(2, 10, 1)],
                        "macros": [{"button_id": 198, "steps": [{"device_id": 102, "command_id": 0xC6},
                                                                 {"device_id": 101, "command_id": 5}]}],
                        "referenced_source_device_ids": [9, 10]}],
    }
    refs = sorted((r, s, t) for r, s, t in hub_sync.iter_entity_references(doc))
    assert refs == sorted([
        (("device", 5), "binding", 6), (("device", 5), "binding_long_press", 7), (("device", 5), "macro_step", 8),
        (("activity", 101), "favorite", 9), (("activity", 101), "binding", 10),
        (("activity", 101), "macro_step", 102), (("activity", 101), "macro_step", 101),
        (("activity", 101), "referenced_source", 9), (("activity", 101), "referenced_source", 10),
    ])


def test_replace_entity_ids_rewrites_rows_and_every_site_and_keeps_order() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired["devices"].insert(0, _device(-1, "Projector", {}))
    macros = _power_macros(-1)
    macros[0]["steps"].append({"device_id": -1, "command_id": 0xC5, "duration": 1})
    desired["activities"].append(_activity(-2, "Movie", bindings=[_binding(POWER_ON, -1, 1, long_press=(-1, 2))],
                                           favorites=[{"button_id": 1, "device_id": -1, "command_id": 1}],
                                           macros=macros, members=(-1,)))
    out = hub_sync.replace_entity_ids(desired, {-1: 3, -2: 103})
    assert [r["device"]["device_id"] for r in out["devices"]] == [3, 5, 7, 9]
    movie = _find(out, "activity", 103)
    assert movie["button_bindings"][0]["device_id"] == 3
    assert movie["button_bindings"][0]["long_press_device_id"] == 3
    assert movie["favorite_slots"][0]["device_id"] == 3
    assert {s["device_id"] for m in movie["macros"] for s in m["steps"]} == {3}
    assert movie["referenced_source_device_ids"] == [3]
    assert list(hub_sync.iter_entity_references({"activities": [movie]}))  # still walkable
    assert desired["devices"][0]["device"]["device_id"] == -1  # input untouched
    assert hub_sync.replace_entity_ids(base, {}) == base


def test_provisional_ids_are_the_lowest_free_in_each_range() -> None:
    base = _bundle()
    base["devices"].insert(0, _device(1, "First", {}))
    desired = copy.deepcopy(base)
    desired["devices"] += [_device(-10, "A", {}), _device(-20, "B", {})]
    desired["activities"] += [_activity(-30, "C")]
    plan = build(base, desired)
    assert plan.provisional_ids == {-10: 2, -20: 3, -30: 103}


def test_synthetic_created_entity_drops_the_fields_a_create_cannot_set() -> None:
    row = _device(-1, "New", {1: "On"})
    row["device"].update(brand="Acme", ip_address="10.0.0.9", idle_behavior=2)
    synthetic = hub_sync.synthetic_created_entity("device", row)
    assert synthetic["device"] == {"device_id": -1, "name": "New", "device_class": "ir", "sort": -1}
    assert synthetic["commands"] == [] and synthetic["input_record"] is None
    activity = hub_sync.synthetic_created_entity("activity", _activity(-2, "Movie"))
    assert activity["favorite_slots"] == [] and activity["macros"] == []


def test_replace_entity_ids_never_adds_a_reference_key() -> None:
    """A device-level binding or macro step has no device_id; rewriting a
    document with a non-empty map must leave such rows byte-identical
    (bench_230 X1S 2026-09-12: an added ``device_id: None`` made every
    untouched device look edited)."""

    doc = {
        "devices": [{"device": {"device_id": 5, "name": "TV"},
                     "button_bindings": [{"button_id": 174, "command_id": 22, "long_press_command_id": None}],
                     "macros": [{"button_id": 198, "steps": [{"command_id": 11, "duration": 0}]}]}],
        "activities": [{"device": {"device_id": 101, "name": "Watch"},
                        "button_bindings": [{"button_id": 1, "device_id": 5, "command_id": 1}],
                        "favorite_slots": [{"button_id": 1, "command_id": 1}]}],
    }
    out = hub_sync.replace_entity_ids(doc, {-1: 9})
    assert out == doc
    out = hub_sync.replace_entity_ids(doc, {5: 7})
    assert out["devices"][0]["device"]["device_id"] == 7
    assert out["devices"][0]["button_bindings"] == doc["devices"][0]["button_bindings"]
    assert out["devices"][0]["macros"] == doc["devices"][0]["macros"]
    assert out["activities"][0]["button_bindings"][0]["device_id"] == 7
    assert out["activities"][0]["favorite_slots"] == doc["activities"][0]["favorite_slots"]


# -- PlaceholderMap (H1) and the restore parity guard ------------------------------------


def test_placeholder_map_assigns_once_and_resolves_only_when_complete() -> None:
    base = _bundle()
    desired = copy.deepcopy(base)
    desired["devices"].append(_device(-1, "Projector", {}))
    desired["activities"].append(_activity(-2, "Movie", bindings=[_binding(POWER_ON, -1, 1)],
                                           macros=_power_macros(-1, 7), members=(-1, 7)))
    pm = hub_sync.PlaceholderMap.from_document(desired)
    assert pm.placeholders == (-1, -2) and pm.unassigned == (-1, -2) and pm.assigned == {}
    assert pm.needed_by(desired) == (-2, -1)
    assert pm.needed_by({"activities": [_find(desired, "activity", -2)]}) == (-2, -1)

    with pytest.raises(hub_sync.UnresolvedPlaceholderError) as info:
        pm.resolve(desired)
    assert info.value.placeholders == (-2, -1)
    # partial=True leaves the unassigned ones in place: the mid-run working copy.
    assert pm.resolve(desired, partial=True) == desired

    pm.assign(-1, 3)
    with pytest.raises(ValueError):
        pm.assign(-1, 4)  # once
    with pytest.raises(KeyError):
        pm.assign(-9, 4)  # unknown
    with pytest.raises(ValueError):
        pm.assign(-2, 0)  # not physical
    half = pm.resolve(desired, partial=True)
    assert _find(half, "device", 3)["device"]["name"] == "Projector"
    movie = _find(half, "activity", -2)
    assert movie["button_bindings"][0]["device_id"] == 3
    with pytest.raises(hub_sync.UnresolvedPlaceholderError) as info:
        pm.resolve(desired)
    assert info.value.placeholders == (-2,)

    pm.assign(-2, 103)
    full = pm.resolve(desired)
    assert pm.needed_by(full) == ()
    assert [r["device"]["device_id"] for r in full["activities"]] == [101, 102, 103]
    assert pm.to_dict() == {"-1": 3, "-2": 103}
    again = hub_sync.PlaceholderMap.from_dict({"-1": 3, "-2": None})
    assert again.assigned == {-1: 3} and again.unassigned == (-2,)
    with pytest.raises(ValueError):
        hub_sync.PlaceholderMap([5])


def test_restore_reference_coverage_is_the_shared_walker() -> None:
    """Restore's pre-write coverage check walks the same sites as the planner
    (plan H1): a reference at every site is seen by both, with restore's own
    exclusions (0x00, the delay sentinel, the activity's own id, the derived
    list) intact."""

    x1_proxy = importlib.import_module(f"{_pkg.__name__}.x1_proxy")
    payload = {
        "kind": "activity_backup",
        "device": {"device_id": 0x66, "name": "Movie", "entity_type": "activity"},
        "button_bindings": [_binding(1, 11, 1, long_press=(12, 2)), _binding(2, 0, 0)],
        "favorite_slots": [{"button_id": 1, "device_id": 13, "command_id": 1}],
        "macros": [{"button_id": 198, "steps": [
            {"device_id": 14, "command_id": 0xC6}, {"device_id": 0xFF, "command_id": 0xFF},
            {"device_id": 0x66, "command_id": 5}, {"device_id": 0x67, "command_id": 0xC6},
        ]}],
        "referenced_source_device_ids": [99],  # derived; not a wire site
    }
    seen = x1_proxy.X1Proxy._collect_referenced_entity_ids(payload)
    assert seen == {11, 12, 13, 14, 0x67}
    assert x1_proxy.X1Proxy._collect_referenced_source_device_ids(payload) == {11, 12, 13, 14}
    assert x1_proxy.X1Proxy._collect_referenced_activity_ids(payload) == {0x67}
    walker = {t for _r, s, t in hub_sync.iter_entity_references({"activities": [payload]}) if s != "referenced_source"}
    assert walker - {0xFF, 0x66} == seen



def test_derived_binding_labels_are_not_a_change() -> None:
    """The hub's binding rows carry button_name / command_name derived from
    the ids; a client row built from ids alone must plan nothing
    (bench_230 X1S 2026-09-12: a rebinding the hub already held was
    planned again because the client row lacked the labels)."""

    base = _bundle()
    act = _find(base, "activity", 101)
    act["button_bindings"] = [{"button_id": POWER_ON, "button_name": "POWER_ON", "device_id": 5, "command_id": 1,
                               "command_name": "Power", "long_press_device_id": None, "long_press_command_id": None}]
    desired = copy.deepcopy(base)
    _find(desired, "activity", 101)["button_bindings"] = [_binding(POWER_ON, 5, 1)]  # no labels
    assert build(base, desired).is_empty
    # A real change (another command) still plans the write.
    _find(desired, "activity", 101)["button_bindings"] = [_binding(POWER_ON, 5, 2)]
    plan = build(base, desired)
    assert [s.kind for s in plan.items[0].steps][0] == "binding_write"


def test_an_entity_name_must_fit_the_hub_slot() -> None:
    base = _bundle()
    too_long = copy.deepcopy(base)
    _find(too_long, "activity", 101)["device"]["name"] = "A" * 31
    with pytest.raises(hub_sync.InvalidDocumentError, match="at most 30"):
        build(base, too_long)

    x1 = copy.deepcopy(base)
    x1["hub"]["version"] = "X1"
    cafe = copy.deepcopy(x1)
    _find(cafe, "activity", 101)["device"]["name"] = "Café"
    with pytest.raises(hub_sync.InvalidDocumentError, match="unsupported by X1"):
        build(x1, cafe)


def test_a_name_the_hub_already_holds_passes_the_slot_rule() -> None:
    # A vendor-app name outside the editor's charset is hub truth.
    base = _bundle()
    _find(base, "activity", 101)["device"]["name"] = "Movie™ Night"
    desired = copy.deepcopy(base)
    desired = _pkg.edits.bind_button(desired, 101, VOL_UP, 7, 3)
    assert _kinds(build(base, desired)) == [("sync_activity", 101)]


def test_a_mirror_only_change_is_not_a_member_change() -> None:
    # The planners agree on membership: the derived referenced_source list
    # alone changes no member (the entity planner emits no member step).
    base = _bundle()
    desired = copy.deepcopy(base)
    activity = _find(desired, "activity", 101)
    activity["referenced_source_device_ids"] = sorted(set(activity.get("referenced_source_device_ids") or []) | {9})
    desired = _pkg.edits.bind_button(desired, 101, VOL_UP, 7, 3)  # a real edit so the activity is planned
    plan = build(base, desired)
    assert not any("member devices change" in note for note in plan.notes)
