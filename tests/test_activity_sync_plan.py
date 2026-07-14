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
    # Content rides along so the executor can re-resolve a stale baseline
    # fav_id against the hub's live favorites (BUG #5 family).
    assert delete.payload["device_id"] == 2
    assert delete.payload["command_id"] == 20


def test_new_macro_is_flagged_for_hub_side_id_allocation() -> None:
    """BUG #5: a macro absent from the baseline carries ``new: True`` so the
    executor allocates its real button_id against the hub's live fav-id
    namespace instead of trusting the editor's renumbered proposal. An edit
    to an existing macro keeps addressing its baseline id (no flag)."""
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["macros"].append(
        {"button_id": 3, "name": "Bench macro", "steps": [
            {"device_id": 1, "command_id": 10, "button_code": 0, "duration": 0, "delay": 255},
        ]}
    )
    _activity(edited)["macros"][0]["steps"].append(
        {"device_id": 1, "command_id": 0xC6, "button_code": 0, "duration": 1, "delay": 255}
    )
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    writes = {s.payload["button_id"]: s.payload for s in plan if s.kind == "macro_write"}
    assert writes[3].get("new") is True
    assert "new" not in writes[198]


def test_favorite_reorder_emits_content_order_despite_positional_button_ids() -> None:
    # Baseline: fav_id 1 = (dev 1, cmd 10), fav_id 2 = (dev 2, cmd 20).
    base = base_bundle()
    edited = copy.deepcopy(base)
    # The editor reorders [A, B] -> [B, A] and reassigns button_ids positionally,
    # so the edited bundle's button_ids are still 1,2 but the content is swapped.
    _activity(edited)["favorite_slots"] = [
        {"button_id": 1, "device_id": 2, "command_id": 20, "name": "Bar Power"},
        {"button_id": 2, "device_id": 1, "command_id": 10, "name": "TV Power"},
    ]
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    assert "favorite_order" in kinds
    assert "favorite_add" not in kinds
    assert "favorite_delete" not in kinds
    # The desired order is carried as content (device, command); the executor
    # resolves it to live fav_ids. New order: Bar Power then TV Power.
    order_content = next(s for s in plan if s.kind == "favorite_order").payload["order_content"]
    assert order_content == [[2, 20], [1, 10]]


def test_favorite_append_does_not_emit_reorder() -> None:
    # Appending a favorite at the end needs no reorder (the hub appends it).
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"].append(
        {"button_id": 9, "device_id": 3, "command_id": 31, "name": "Netflix"}
    )
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    assert "favorite_add" in kinds
    assert "favorite_order" not in kinds


def test_favorite_add_then_reorder_emits_full_content_order() -> None:
    # Insert a new favorite at the *front* → an add plus a reorder covering all
    # three (the new one included, positioned by content).
    base = base_bundle()
    edited = copy.deepcopy(base)
    _activity(edited)["favorite_slots"] = [
        {"button_id": 1, "device_id": 3, "command_id": 31, "name": "Netflix"},
        {"button_id": 2, "device_id": 1, "command_id": 10, "name": "TV Power"},
        {"button_id": 3, "device_id": 2, "command_id": 20, "name": "Bar Power"},
    ]
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    assert "favorite_add" in kinds
    assert "favorite_order" in kinds
    # Add is dispatched before the reorder so the new fav_id exists to reorder.
    assert kinds.index("favorite_add") < kinds.index("favorite_order")
    order_content = next(s for s in plan if s.kind == "favorite_order").payload["order_content"]
    assert order_content == [[3, 31], [1, 10], [2, 20]]


def test_macro_rename_only_still_emits_macro_write() -> None:
    base = base_bundle()
    edited = copy.deepcopy(base)
    # Rename the POWER_ON macro's label without touching its steps.
    _activity(edited)["macros"][0]["name"] = "Turn everything on"
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    macro = next((s for s in plan if s.kind == "macro_write"), None)
    assert macro is not None
    assert macro.payload["name"] == "Turn everything on"


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


# ── BUG #8: "Set input" choice for a NEW member ─────────────────────────


def _add_member_power_steps(activity: dict, device_id: int, input_ordinal: int) -> None:
    """Mirror the editor's member add: append the new device's power-on
    rows (0xC6 power ref + 0xC5 input ref with the chosen ordinal)."""
    macro = next(m for m in activity["macros"] if m["button_id"] == 198)
    macro["steps"].extend(
        [
            {"device_id": device_id, "command_id": 0xC6, "button_code": 0, "duration": 1, "delay": 255},
            {"device_id": device_id, "command_id": 0xC5, "button_code": 0, "duration": input_ordinal, "delay": 255},
        ]
    )


def test_member_add_carries_input_choice() -> None:
    """BUG #8: a new member's "Set input" choice (the 0xC5 power-on step's
    duration = input ordinal) must ride the member_replay payload as the
    input's command id — add_device_to_activity otherwise rebuilds the 0xC5
    row from scratch with duration 0 and the choice is silently lost."""
    base = base_bundle()
    _device(base, 3)["input_record"] = {
        "entries": [
            {"command_id": 53, "input_index": 1, "name": "Input TV"},
            {"command_id": 54, "input_index": 4, "name": "Input blu-ray"},
        ]
    }
    edited = copy.deepcopy(base)
    _add_member_power_steps(_activity(edited), 3, input_ordinal=4)
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    replay = next(s for s in plan if s.kind == "member_replay")
    assert replay.payload == {"activity_id": ACTIVITY_ID, "device_id": 3, "input_cmd_id": 54}


def test_member_add_without_input_choice_omits_input_cmd_id() -> None:
    base = base_bundle()
    _device(base, 3)["input_record"] = {
        "entries": [{"command_id": 53, "input_index": 1, "name": "Input TV"}]
    }
    edited = copy.deepcopy(base)
    _add_member_power_steps(_activity(edited), 3, input_ordinal=0)
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    replay = next(s for s in plan if s.kind == "member_replay")
    assert "input_cmd_id" not in replay.payload


def test_member_add_with_unresolvable_ordinal_omits_input_cmd_id() -> None:
    # Device 3 carries no input_record in the fixture: an ordinal that
    # cannot be mapped to a command id must be dropped, not guessed.
    base = base_bundle()
    edited = copy.deepcopy(base)
    _add_member_power_steps(_activity(edited), 3, input_ordinal=4)
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    replay = next(s for s in plan if s.kind == "member_replay")
    assert "input_cmd_id" not in replay.payload


def test_existing_member_input_change_rides_macro_write() -> None:
    """The adjacent case to BUG #8: changing the input of an EXISTING member
    edits only the power-on macro's 0xC5 duration — the plan must carry it
    as a macro_write (no member_replay) with the new ordinal intact."""
    base = base_bundle()
    _activity(base)["macros"][0]["steps"].append(
        {"device_id": 1, "command_id": 0xC5, "button_code": 0, "duration": 1, "delay": 255}
    )
    edited = copy.deepcopy(base)
    _activity(edited)["macros"][0]["steps"][-1]["duration"] = 2
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    kinds = _kinds(plan)
    assert "member_replay" not in kinds
    write = next(s for s in plan if s.kind == "macro_write")
    assert write.payload["button_id"] == 198
    steps = write.payload["steps"]
    assert steps[-1]["command_id"] == 0xC5
    assert steps[-1]["duration"] == 2


def test_power_macro_absent_from_baseline_is_not_flagged_new() -> None:
    """BUG #8 repro tail: a fresh activity's baseline has no 198/199 rows,
    but power macros live at fixed wire ids outside the fav-id namespace —
    flagging them ``new`` would send the write through the BUG #5 id
    allocator and the power-on overwrite would never land at 198."""
    base = base_bundle()
    _activity(base)["macros"] = []
    edited = copy.deepcopy(base)
    _activity(edited)["macros"] = [
        {"button_id": 198, "name": "POWER_ON", "steps": [
            {"device_id": 1, "command_id": 0xC6, "button_code": 0, "duration": 1, "delay": 255},
        ]},
    ]
    plan = build_activity_sync_plan(base, edited, ACTIVITY_ID)
    write = next(s for s in plan if s.kind == "macro_write")
    assert write.payload["button_id"] == 198
    assert "new" not in write.payload
