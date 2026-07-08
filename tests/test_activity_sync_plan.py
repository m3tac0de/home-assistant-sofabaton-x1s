"""Golden tests for the pure activity sync plan builder (Phase L4)."""

from __future__ import annotations

import copy

import pytest

from custom_components.sofabaton_x1s.lib.activity_sync import (
    SyncStep,
    build_activity_sync_plan,
)

ACTIVITY_ID = 101


def base_bundle() -> dict:
    """Mirrors the frontend EDIT_BACKUP_BUNDLE shape: activity 101 has
    members 1 & 2 via power macros / favorites / bindings; device 3 exists
    but is not a member."""
    return {
        "kind": "hub_bundle",
        "schema_version": 5,
        "hub": {"entry_id": "hub-1", "name": "Living Room", "version": "X1S"},
        "devices": [
            {
                "device": {"device_id": 1, "name": "Television", "device_class": "ir", "sort": 1, "idle_behavior": 3},
                "commands": [
                    {"command_id": 10, "name": "Power"},
                    {"command_id": 11, "name": "Volume Up"},
                    {"command_id": 12, "name": "Input HDMI1"},
                ],
                "input_record": {"entries": [{"command_id": 12, "input_index": 1, "name": "Input HDMI1"}]},
            },
            {
                "device": {"device_id": 2, "name": "Soundbar", "device_class": "ir", "sort": 2, "idle_behavior": 3},
                "commands": [
                    {"command_id": 20, "name": "Power"},
                    {"command_id": 21, "name": "Volume Up"},
                ],
            },
            {
                "device": {"device_id": 3, "name": "Streamer", "device_class": "ir", "sort": 3, "idle_behavior": 3},
                "commands": [
                    {"command_id": 30, "name": "Home"},
                    {"command_id": 31, "name": "Play"},
                ],
            },
        ],
        "activities": [
            {
                "device": {"device_id": 101, "name": "Watch TV", "entity_type": "activity", "sort": 1},
                "referenced_source_device_ids": [1, 2],
                "favorite_slots": [
                    {"button_id": 1, "device_id": 1, "command_id": 10, "name": "TV Power"},
                    {"button_id": 2, "device_id": 2, "command_id": 20, "name": "Bar Power"},
                ],
                "macros": [
                    {"button_id": 198, "name": "POWER_ON", "steps": [
                        {"device_id": 1, "command_id": 0xC6, "button_code": 0, "duration": 1, "delay": 255},
                        {"device_id": 2, "command_id": 0xC6, "button_code": 0, "duration": 0, "delay": 255},
                    ]},
                    {"button_id": 199, "name": "POWER_OFF", "steps": [
                        {"device_id": 1, "command_id": 0xC7, "button_code": 0, "duration": 0, "delay": 255},
                    ]},
                ],
                "button_bindings": [
                    {"button_id": 0xB6, "device_id": 2, "command_id": 21},
                    {"button_id": 0xB0, "device_id": 1, "command_id": 10},
                ],
            },
            {
                "device": {"device_id": 102, "name": "Listen", "entity_type": "activity", "sort": 2},
                "referenced_source_device_ids": [2],
                "favorite_slots": [],
                "macros": [],
                "button_bindings": [],
            },
        ],
    }


def _activity(bundle: dict, activity_id: int = ACTIVITY_ID) -> dict:
    return next(a for a in bundle["activities"] if a["device"]["device_id"] == activity_id)


def _device(bundle: dict, device_id: int) -> dict:
    return next(d for d in bundle["devices"] if d["device"]["device_id"] == device_id)


def _kinds(plan: list[SyncStep]) -> list[str]:
    return [step.kind for step in plan]


def test_noop_plan_is_empty() -> None:
    base = base_bundle()
    assert build_activity_sync_plan(base, copy.deepcopy(base), ACTIVITY_ID) == []


def test_missing_activity_raises() -> None:
    base = base_bundle()
    with pytest.raises(ValueError, match="missing"):
        build_activity_sync_plan(base, copy.deepcopy(base), 199)


def test_favorite_add_produces_add_plus_remote_sync() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    # Adding a device-3 favorite makes device 3 a member → member_replay too.
    assert "favorite_add" in kinds
    assert "member_replay" in kinds
    assert kinds[-1] == "remote_sync"
    add = next(s for s in plan if s.kind == "favorite_add")
    assert add.payload["device_id"] == 3
    assert add.payload["command_id"] == 31


def test_favorite_delete() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"] = [_activity(edited)["favorite_slots"][0]]
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    assert "favorite_delete" in _kinds(plan)
    delete = next(s for s in plan if s.kind == "favorite_delete")
    assert delete.payload["button_id"] == 2


def test_macro_change_produces_macro_write_with_ordering() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"][0]["steps"].append(
        {"device_id": 2, "command_id": 0xC5, "button_code": 0, "duration": 1, "delay": 255}
    )
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    assert "macro_write" in kinds
    macro = next(s for s in plan if s.kind == "macro_write")
    assert macro.payload["button_id"] == 198
    # macro_write precedes bindings/favorites which precede remote_sync.
    assert kinds.index("macro_write") < kinds.index("remote_sync")


def test_idle_behavior_change_is_ordered_after_favorites() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited, 1)["device"]["idle_behavior"] = 1
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    assert "idle_behavior" in kinds
    step = next(s for s in plan if s.kind == "idle_behavior")
    assert step.payload == {"device_id": 1, "mode": 1}


def test_command_rename_is_a_prereq_step() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited, 1)["commands"][0]["name"] = "Power Toggle"
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    assert kinds[0] == "command_rename"
    assert kinds[-1] == "remote_sync"


def test_binding_write_and_delete() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    # Change the OK binding's command, drop the volume binding.
    _activity(edited)["button_bindings"] = [
        {"button_id": 0xB0, "device_id": 1, "command_id": 11},
    ]
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    assert "binding_write" in kinds
    assert "binding_delete" in kinds


def test_out_of_scope_other_activity_change_raises() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited, 102)["device"]["name"] = "Tampered"
    with pytest.raises(ValueError, match="different activity"):
        build_activity_sync_plan(base, edited, ACTIVITY_ID)


def test_out_of_scope_unrelated_device_binding_change_raises() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited, 3)["button_bindings"] = [{"button_id": 0xAE, "command_id": 30}]
    with pytest.raises(ValueError, match="outside allowed fields"):
        build_activity_sync_plan(base, edited, ACTIVITY_ID)


def test_activity_rename_step() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["device"]["name"] = "Movie Night"
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    step = next(s for s in plan if s.kind == "activity_rename")
    assert step.payload == {"activity_id": ACTIVITY_ID, "name": "Movie Night"}


def test_cross_activity_chain_step_passthrough() -> None:
    # A power-off step whose device byte is an activity id (>= 0x65) must not
    # trip the scope guard or membership (it is not a source device).
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"][1]["steps"].append(
        {"device_id": 0x66, "command_id": 0xC6, "button_code": 0, "duration": 0, "delay": 255}
    )
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    assert "macro_write" in kinds
    # The activity-range ref (0x66) must NOT be treated as an added member.
    assert "member_replay" not in kinds
