"""Golden tests for the pure device sync plan builder (live device editor)."""

from __future__ import annotations

import copy

import pytest

from custom_components.sofabaton_x1s.lib.activity_sync import (
    SyncStep,
    build_device_sync_plan,
)

DEVICE_ID = 1


def base_bundle() -> dict:
    """Device 1 carries the full editable surface: power macros, a user
    macro, button bindings, an input record, and the idle byte."""
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
                ],
                "macros": [
                    {"button_id": 198, "name": "PWRON", "steps": [
                        {"device_id": 1, "command_id": 0xC6, "button_code": 0, "duration": 1, "delay": 255},
                    ]},
                    {"button_id": 199, "name": "PWROFF", "steps": [
                        {"device_id": 1, "command_id": 0xC7, "button_code": 0, "duration": 0, "delay": 255},
                    ]},
                    {"button_id": 30, "name": "Movie Mode", "steps": [
                        {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
                    ]},
                ],
                "button_bindings": [
                    {"button_id": 0xB0, "device_id": 1, "command_id": 10},
                ],
                "input_record": {"entries": [{"command_id": 12, "input_index": 1, "name": "Input HDMI1"}]},
            },
            {
                "device": {"device_id": 2, "name": "Soundbar", "device_class": "ir", "sort": 2, "idle_behavior": 3},
                "commands": [{"command_id": 20, "name": "Power"}],
                "button_bindings": [{"button_id": 0xB6, "device_id": 2, "command_id": 21}],
            },
        ],
        "activities": [
            {
                "device": {"device_id": 101, "name": "Watch TV", "entity_type": "activity", "sort": 1},
                "favorite_slots": [],
                "macros": [],
                "button_bindings": [],
            },
        ],
    }


def _device(bundle: dict, device_id: int = DEVICE_ID) -> dict:
    return next(d for d in bundle["devices"] if d["device"]["device_id"] == device_id)


def _kinds(plan: list[SyncStep]) -> list[str]:
    return [step.kind for step in plan]


def test_noop_plan_is_empty() -> None:
    base = base_bundle()
    assert build_device_sync_plan(base, copy.deepcopy(base), DEVICE_ID) == []


def test_missing_device_raises() -> None:
    base = base_bundle()
    with pytest.raises(ValueError, match="missing"):
        build_device_sync_plan(base, copy.deepcopy(base), 99)


def test_idle_change_plans_idle_behavior() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited)["device"]["idle_behavior"] = 1
    plan = build_device_sync_plan(base, edited, DEVICE_ID)
    assert _kinds(plan) == ["idle_behavior"]
    assert plan[0].payload == {"device_id": DEVICE_ID, "mode": 1}


def test_power_macro_edit_plans_macro_write_with_device_entity_id() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited)["macros"][0]["steps"].append(
        {"device_id": 1, "command_id": 0xC5, "button_code": 0, "duration": 0, "delay": 255},
    )
    plan = build_device_sync_plan(base, edited, DEVICE_ID)
    assert _kinds(plan) == ["macro_write"]
    # The keymap entity id rides in the shared "activity_id" payload key.
    assert plan[0].payload["activity_id"] == DEVICE_ID
    assert plan[0].payload["button_id"] == 198


def test_user_macro_delete_plans_macro_delete_but_power_macros_never() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited)["macros"] = [m for m in _device(edited)["macros"] if m["button_id"] != 30]
    plan = build_device_sync_plan(base, edited, DEVICE_ID)
    assert _kinds(plan) == ["macro_delete"]
    assert plan[0].payload == {"activity_id": DEVICE_ID, "button_id": 30}

    # Dropping a power macro row from the edited bundle plans nothing.
    edited2 = copy.deepcopy(base)
    _device(edited2)["macros"] = [m for m in _device(edited2)["macros"] if m["button_id"] != 199]
    assert build_device_sync_plan(base, edited2, DEVICE_ID) == []


def test_binding_rows_without_device_id_default_to_the_device_itself() -> None:
    # Device-scope binding rows (as exported) carry no device_id — the
    # source device is implicitly the device itself.
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited)["button_bindings"] = [
        {"button_id": 0xB0, "command_id": 11, "long_press_command_id": 10},
    ]
    plan = build_device_sync_plan(base, edited, DEVICE_ID)
    assert _kinds(plan) == ["binding_write"]
    assert plan[0].payload["device_id"] == DEVICE_ID
    assert plan[0].payload["long_press_device_id"] == DEVICE_ID
    assert plan[0].target_device_id == DEVICE_ID


def test_binding_write_and_delete() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited)["button_bindings"] = [
        {"button_id": 0xB0, "device_id": 1, "command_id": 11},
        {"button_id": 0xB6, "device_id": 1, "command_id": 11},
    ]
    plan = build_device_sync_plan(base, edited, DEVICE_ID)
    assert _kinds(plan) == ["binding_write", "binding_write"]
    assert all(step.payload["activity_id"] == DEVICE_ID for step in plan)

    edited2 = copy.deepcopy(base)
    _device(edited2)["button_bindings"] = []
    plan2 = build_device_sync_plan(base, edited2, DEVICE_ID)
    assert _kinds(plan2) == ["binding_delete"]
    assert plan2[0].payload == {"activity_id": DEVICE_ID, "button_id": 0xB0}


def test_inputs_change_plans_inputs_write_first() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited)["input_record"]["entries"].append({"command_id": 13, "input_index": 2, "name": "Input HDMI2"})
    _device(edited)["device"]["idle_behavior"] = 1
    plan = build_device_sync_plan(base, edited, DEVICE_ID)
    assert _kinds(plan) == ["inputs_write", "idle_behavior"]


def test_out_of_scope_activity_change_raises() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    edited["activities"][0]["favorite_slots"] = [{"button_id": 1, "device_id": 1, "command_id": 10}]
    with pytest.raises(ValueError, match="activity"):
        build_device_sync_plan(base, edited, DEVICE_ID)


def test_out_of_scope_other_device_change_raises() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited, 2)["button_bindings"] = []
    with pytest.raises(ValueError, match="different device"):
        build_device_sync_plan(base, edited, DEVICE_ID)


def test_command_rename_is_out_of_scope() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited)["commands"][0]["name"] = "Power Toggle"
    with pytest.raises(ValueError, match="live-editable"):
        build_device_sync_plan(base, edited, DEVICE_ID)


def test_device_rename_is_out_of_scope() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    _device(edited)["device"]["name"] = "TV"
    with pytest.raises(ValueError, match="live-editable"):
        build_device_sync_plan(base, edited, DEVICE_ID)


def test_device_add_or_remove_is_out_of_scope() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    edited["devices"].pop()
    with pytest.raises(ValueError, match="adds or removes a device"):
        build_device_sync_plan(base, edited, DEVICE_ID)
