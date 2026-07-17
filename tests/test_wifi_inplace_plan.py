"""Golden tests for the pure in-place Wifi Command re-sync planner + adapters.

The baseline-adapter fixtures reproduce the field shapes captured from a live
managed wifi device (scripts/hub-bench shape dump, X1S "Lights", 2026-07-17).
"""

from __future__ import annotations

import pytest

from custom_components.sofabaton_x1s.lib.wifi_inplace_plan import (
    ManagedWifiSnapshot,
    WifiActivityRefs,
    WifiCommandSlot,
    baseline_snapshot_from_bundle,
    build_wifi_inplace_plan,
    desired_snapshot_from_config,
)

DEV = 8
ACT_A = 0x65
ACT_B = 0x66


def slot(cid: int, label: str, payload: str | None = None) -> WifiCommandSlot:
    return WifiCommandSlot(command_id=cid, label=label, payload_key=payload or "wifi")


def snapshot(**over) -> ManagedWifiSnapshot:
    base = dict(
        device_id=DEV,
        device_name="Wifi",
        brand="m3-key-aaaa",
        power_on_command_id=1,
        power_off_command_id=2,
        input_command_ids=(),
        slots={c: slot(c, f"Cmd {c}") for c in (1, 2, 3)},
        activities={ACT_A: WifiActivityRefs(activity_id=ACT_A, member_count=3)},
    )
    base.update(over)
    return ManagedWifiSnapshot(**base)


def kinds(plan) -> list[str]:
    return [s.kind for s in plan.steps]


# ── no-op ────────────────────────────────────────────────────────────────


def test_identical_snapshots_is_noop():
    plan = build_wifi_inplace_plan(snapshot(), snapshot())
    assert plan.steps == ()
    assert not plan.is_fallback


# ── command record diffs ──────────────────────────────────────────────────


def test_command_add():
    desired = snapshot(slots={**snapshot().slots, 4: slot(4, "New")})
    plan = build_wifi_inplace_plan(snapshot(), desired)
    assert kinds(plan) == ["command_add"]
    assert plan.steps[0].payload == {"device_id": DEV, "command_id": 4, "command_name": "New"}


def test_command_delete():
    baseline = snapshot(slots={**snapshot().slots, 4: slot(4, "Old")})
    plan = build_wifi_inplace_plan(baseline, snapshot())
    assert kinds(plan) == ["command_delete"]
    assert plan.steps[0].payload == {"device_id": DEV, "command_id": 4}


def test_command_rename_label_only():
    desired = snapshot(slots={1: slot(1, "Renamed"), 2: slot(2, "Cmd 2"), 3: slot(3, "Cmd 3")})
    plan = build_wifi_inplace_plan(snapshot(), desired)
    assert kinds(plan) == ["command_rename"]
    assert plan.steps[0].payload == {"device_id": DEV, "command_id": 1, "name": "Renamed"}


def test_payload_key_change_emits_command_payload():
    desired = snapshot(slots={1: slot(1, "Cmd 1", "other"), 2: slot(2, "Cmd 2"), 3: slot(3, "Cmd 3")})
    plan = build_wifi_inplace_plan(snapshot(), desired)
    assert kinds(plan) == ["command_payload"]


# ── power ─────────────────────────────────────────────────────────────────


def test_power_id_change():
    plan = build_wifi_inplace_plan(snapshot(), snapshot(power_on_command_id=4))
    assert kinds(plan) == ["wifi_power_config"]
    assert plan.steps[0].payload == {
        "device_id": DEV,
        "power_on_command_id": 4,
        "power_off_command_id": 2,
    }


# ── input record (device list) vs per-activity ordinal ───────────────────


def test_input_list_change_rewrites_record_only():
    # ordinals unchanged → device record write, ZERO activity writes
    baseline = snapshot(
        input_command_ids=(3,),
        activities={ACT_A: WifiActivityRefs(ACT_A, input_ordinal=1, member_count=3)},
    )
    desired = snapshot(
        input_command_ids=(5,),
        activities={ACT_A: WifiActivityRefs(ACT_A, input_ordinal=1, member_count=3)},
    )
    plan = build_wifi_inplace_plan(baseline, desired)
    assert kinds(plan) == ["wifi_input_config"]
    assert plan.steps[0].payload["input_command_ids"] == [5]
    assert plan.steps[0].payload["labels"][3] == "Cmd 3"


def test_activity_ordinal_change_replays_member():
    baseline = snapshot(
        input_command_ids=(3, 4),
        activities={ACT_A: WifiActivityRefs(ACT_A, input_ordinal=1, member_count=3)},
    )
    desired = snapshot(
        input_command_ids=(3, 4),
        activities={ACT_A: WifiActivityRefs(ACT_A, input_ordinal=2, member_count=3)},
    )
    plan = build_wifi_inplace_plan(baseline, desired)
    assert kinds(plan) == ["member_replay"]
    assert plan.steps[0].payload == {"activity_id": ACT_A, "device_id": DEV, "input_cmd_id": 4}


# ── membership ────────────────────────────────────────────────────────────


def test_membership_add_joins_with_input():
    desired = snapshot(
        input_command_ids=(3,),
        activities={
            ACT_A: WifiActivityRefs(ACT_A, member_count=3),
            ACT_B: WifiActivityRefs(ACT_B, input_ordinal=1, favorites={1: 0}),
        },
    )
    plan = build_wifi_inplace_plan(snapshot(input_command_ids=(3,)), desired)
    assert kinds(plan) == ["member_replay", "favorite_add"]
    assert plan.steps[0].payload == {"activity_id": ACT_B, "device_id": DEV, "input_cmd_id": 3}


def test_membership_remove_multi_member():
    baseline = snapshot(
        activities={
            ACT_A: WifiActivityRefs(ACT_A, member_count=3),
            ACT_B: WifiActivityRefs(ACT_B, member_count=4),
        }
    )
    plan = build_wifi_inplace_plan(baseline, snapshot())
    assert kinds(plan) == ["membership_remove"]
    assert plan.steps[0].payload == {"device_id": DEV, "activity_id": ACT_B}


def test_membership_remove_last_member_falls_back():
    baseline = snapshot(
        activities={
            ACT_A: WifiActivityRefs(ACT_A, member_count=3),
            ACT_B: WifiActivityRefs(ACT_B, member_count=1),
        }
    )
    plan = build_wifi_inplace_plan(baseline, snapshot())
    assert plan.is_fallback
    assert "last member" in plan.fallback_reason
    assert plan.steps == ()


# ── favorites & bindings ──────────────────────────────────────────────────


def test_favorites_add_and_delete_carry_fav_id():
    baseline = snapshot(activities={ACT_A: WifiActivityRefs(ACT_A, favorites={1: 11, 2: 12}, member_count=3)})
    desired = snapshot(activities={ACT_A: WifiActivityRefs(ACT_A, favorites={2: 0, 3: 0}, member_count=3)})
    plan = build_wifi_inplace_plan(baseline, desired)
    assert kinds(plan) == ["favorite_delete", "favorite_add"]
    assert plan.steps[0].payload == {"activity_id": ACT_A, "device_id": DEV, "command_id": 1, "button_id": 11}
    assert plan.steps[1].payload == {"activity_id": ACT_A, "device_id": DEV, "command_id": 3}


def test_binding_write_change_and_delete():
    baseline = snapshot(activities={ACT_A: WifiActivityRefs(ACT_A, bindings=((0xBE, 1, None), (0xBF, 2, None)), member_count=3)})
    desired = snapshot(activities={ACT_A: WifiActivityRefs(ACT_A, bindings=((0xBE, 3, 13),), member_count=3)})
    plan = build_wifi_inplace_plan(baseline, desired)
    assert kinds(plan) == ["binding_delete", "binding_write"]
    assert plan.steps[0].payload == {"activity_id": ACT_A, "button_id": 0xBF}
    assert plan.steps[1].payload == {
        "activity_id": ACT_A, "device_id": DEV, "button_id": 0xBE,
        "command_id": 3, "long_press_device_id": DEV, "long_press_command_id": 13,
    }


def test_unchanged_binding_emits_no_step():
    refs = WifiActivityRefs(ACT_A, bindings=((0xBE, 1, None),), member_count=3)
    plan = build_wifi_inplace_plan(snapshot(activities={ACT_A: refs}), snapshot(activities={ACT_A: refs}))
    assert plan.steps == ()


# ── head commit ───────────────────────────────────────────────────────────


def test_head_commit_carries_name_and_brand():
    plan = build_wifi_inplace_plan(snapshot(), snapshot(device_name="New Name", brand="m3-key-bbbb"))
    assert kinds(plan) == ["wifi_head_commit"]
    assert plan.steps[0].payload == {"device_id": DEV, "name": "New Name", "brand": "m3-key-bbbb"}


def test_head_commit_is_last():
    desired = snapshot(
        brand="m3-key-zzzz",
        power_on_command_id=4,
        slots={**snapshot().slots, 4: slot(4, "Add")},
    )
    plan = build_wifi_inplace_plan(snapshot(), desired)
    assert kinds(plan) == ["command_add", "wifi_power_config", "wifi_head_commit"]
    assert plan.steps[-1].kind == "wifi_head_commit"


# ── full-order composition ────────────────────────────────────────────────


def test_full_executor_order():
    baseline = snapshot(
        input_command_ids=(3,),
        slots={1: slot(1, "Cmd 1"), 2: slot(2, "Cmd 2"), 6: slot(6, "Del")},
        activities={
            ACT_A: WifiActivityRefs(ACT_A, input_ordinal=1, favorites={1: 11}, member_count=3),
            ACT_B: WifiActivityRefs(ACT_B, member_count=4),
        },
    )
    desired = snapshot(
        device_name="Renamed",
        brand="m3-key-new",
        power_on_command_id=7,
        input_command_ids=(8,),
        slots={1: slot(1, "One v2"), 2: slot(2, "Cmd 2"), 5: slot(5, "Add")},
        activities={
            ACT_A: WifiActivityRefs(ACT_A, input_ordinal=1, favorites={1: 0, 4: 0}, member_count=3),
        },
    )
    plan = build_wifi_inplace_plan(baseline, desired)
    assert kinds(plan) == [
        "command_add",        # cmd 5
        "command_rename",     # cmd 1 label
        "command_delete",     # cmd 6
        "wifi_power_config",  # power 1->7
        "wifi_input_config",  # input list 3->8 (ordinal 1 unchanged: no replay)
        "favorite_add",       # ACT_A fav 4 (fav 1 unchanged)
        "membership_remove",  # ACT_B dropped
        "wifi_head_commit",   # head commit last
    ]


def test_device_id_mismatch_falls_back():
    plan = build_wifi_inplace_plan(snapshot(), snapshot(device_id=99))
    assert plan.is_fallback
    assert "device id changed" in plan.fallback_reason


# ══ adapters ══════════════════════════════════════════════════════════════

HARD_BUTTONS = {"red": 0xBE, "green": 0xBF, "mute": 0xB8}


def store_config() -> dict:
    """A store command_payload: 3 configured slots out of 10 (defaults for
    the rest — the deploy writes every slot)."""
    slots = []
    slots.append({  # slot 1 → cmd 1: favorite on ACT_A, RED with long press
        "name": "Dim", "add_as_favorite": True, "hard_button": "red",
        "long_press_enabled": True, "input_activity_id": "", "activities": [str(ACT_A)],
    })
    slots.append({  # slot 2 → cmd 2: input for ACT_B
        "name": "Bright", "add_as_favorite": False, "hard_button": "",
        "long_press_enabled": False, "input_activity_id": str(ACT_B), "activities": [],
    })
    slots.append({  # slot 3 → cmd 3: input for ACT_A + favorite on ACT_B
        "name": "Xbox", "add_as_favorite": True, "hard_button": "",
        "long_press_enabled": False, "input_activity_id": str(ACT_A), "activities": [str(ACT_B)],
    })
    for n in range(4, 11):
        slots.append({
            "name": f"Command {n}", "add_as_favorite": False, "hard_button": "",
            "long_press_enabled": False, "input_activity_id": "", "activities": [],
        })
    return {"commands": slots, "power_on_command_id": 1, "power_off_command_id": 2}


def test_desired_adapter_slots_and_expansion():
    snap = desired_snapshot_from_config(
        store_config(), device_id=DEV, device_name="HA", brand="m3-k-h",
        hard_button_codes=HARD_BUTTONS,
    )
    assert set(snap.slots) == set(range(1, 21))
    assert snap.slots[1].label == "Dim"
    assert snap.slots[11].label == "Dim Long Press"
    assert snap.slots[4].label == "Command 4"
    assert snap.power_on_command_id == 1 and snap.power_off_command_id == 2


def test_desired_adapter_inputs_first_slot_wins():
    snap = desired_snapshot_from_config(
        store_config(), device_id=DEV, device_name="HA", brand="m3-k-h",
        hard_button_codes=HARD_BUTTONS,
    )
    # input list in slot order: cmd 2 (ACT_B), cmd 3 (ACT_A)
    assert snap.input_command_ids == (2, 3)
    assert snap.activities[ACT_B].input_ordinal == 1
    assert snap.activities[ACT_A].input_ordinal == 2


def test_desired_adapter_favorites_bindings_membership():
    snap = desired_snapshot_from_config(
        store_config(), device_id=DEV, device_name="HA", brand="m3-k-h",
        hard_button_codes=HARD_BUTTONS,
    )
    assert set(snap.activities) == {ACT_A, ACT_B}
    a = snap.activities[ACT_A]
    assert a.favorites == {1: 0}
    assert a.bindings == ((0xBE, 1, 11),)  # RED, cmd 1, long = 1+10
    b = snap.activities[ACT_B]
    assert b.favorites == {3: 0}
    assert b.bindings == ()


def test_desired_adapter_issue_258_inactive_slot_activities_ignored():
    config = store_config()
    # a slot with an orphaned activities list but neither favorite nor button
    config["commands"][3]["activities"] = [str(0x67)]
    snap = desired_snapshot_from_config(
        config, device_id=DEV, device_name="HA", brand="m3-k-h",
        hard_button_codes=HARD_BUTTONS,
    )
    assert 0x67 not in snap.activities


# baseline adapter — fixtures mirror the live shape dump (X1S "Lights")

def device_entry() -> dict:
    return {
        "device": {"device_id": 10, "name": "Lights", "brand": "m3-ade605c4-cf392e0b67d2098"},
        "commands": [
            {"command_id": 1, "command_label": "Dim the lights"},
            {"command_id": 2, "command_label": "Brighten the lights"},
            {"command_id": 3, "command_label": "Xbox lights"},
            {"command_id": 11, "command_label": "Dim the lights Long Press"},
        ],
        "input_record": {
            "device_id": 10,
            "entries": [
                {"command_id": 3, "input_index": 1, "fid": 0, "name": "Xbox lights"},
                {"command_id": 4, "input_index": 2, "fid": 0, "name": "Playstation lights"},
            ],
        },
        "macros": [
            {"button_id": 198, "steps": [{"command_id": 1, "duration": 0, "delay": 255}]},
            {"button_id": 199, "steps": [{"command_id": 2, "duration": 0, "delay": 255}]},
        ],
        "button_bindings": [],
    }


def activity_entry(act_id: int, *, ordinal: int, members: list[int]) -> dict:
    return {
        "device": {"device_id": act_id, "entity_type": "activity"},
        "referenced_source_device_ids": members,
        "favorite_slots": [
            {"button_id": 5, "device_id": 10, "command_id": 1},
            {"button_id": 6, "device_id": 10, "command_id": 2},
            {"button_id": 7, "device_id": 99, "command_id": 4},  # other device
        ],
        "button_bindings": [
            {"button_id": 184, "button_name": "MUTE", "device_id": 10, "command_id": 2,
             "long_press_device_id": None, "long_press_command_id": None},
            {"button_id": 190, "button_name": "RED", "device_id": 10, "command_id": 1,
             "long_press_device_id": 10, "long_press_command_id": 11},
            {"button_id": 191, "button_name": "GREEN", "device_id": 99, "command_id": 9,
             "long_press_device_id": None, "long_press_command_id": None},
        ],
        "macros": [
            {"button_id": 198, "steps": [
                {"device_id": 10, "command_id": 198, "button_code": 0, "duration": 0, "delay": 255},
                {"device_id": 10, "command_id": 197, "button_code": 0, "duration": ordinal, "delay": 255},
                {"device_id": 99, "command_id": 198, "button_code": 0, "duration": 1, "delay": 255},
            ]},
            {"button_id": 199, "steps": [
                {"device_id": 10, "command_id": 199, "button_code": 0, "duration": 0, "delay": 255},
            ]},
        ],
    }


def test_baseline_adapter_device_side():
    snap = baseline_snapshot_from_bundle(device_entry(), [])
    assert snap.device_id == 10
    assert snap.device_name == "Lights"
    assert snap.brand == "m3-ade605c4-cf392e0b67d2098"
    assert snap.power_on_command_id == 1
    assert snap.power_off_command_id == 2
    assert snap.input_command_ids == (3, 4)
    assert snap.slots[1].label == "Dim the lights"
    assert snap.slots[11].label == "Dim the lights Long Press"


def test_baseline_adapter_activity_refs():
    acts = [
        activity_entry(ACT_A, ordinal=2, members=[1, 2, 10, 99]),
        activity_entry(ACT_B, ordinal=0, members=[10, 99]),
        # an activity that does NOT reference the device
        {"device": {"device_id": 0x67}, "referenced_source_device_ids": [1, 2]},
    ]
    snap = baseline_snapshot_from_bundle(device_entry(), acts)
    assert set(snap.activities) == {ACT_A, ACT_B}
    a = snap.activities[ACT_A]
    assert a.input_ordinal == 2
    assert a.member_count == 4
    assert a.favorites == {1: 5, 2: 6}  # only this device's rows
    assert a.bindings == ((184, 2, None), (190, 1, 11))
    b = snap.activities[ACT_B]
    assert b.input_ordinal == 0
    assert b.member_count == 2


def test_baseline_adapter_normalizes_no_input_255():
    acts = [activity_entry(ACT_A, ordinal=255, members=[10, 99])]
    snap = baseline_snapshot_from_bundle(device_entry(), acts)
    assert snap.activities[ACT_A].input_ordinal == 0


def test_adapters_round_trip_to_noop():
    """A desired snapshot diffed against a baseline built from the state that
    desired config would deploy must be a no-op (modulo fav ids)."""
    desired = desired_snapshot_from_config(
        store_config(), device_id=10, device_name="Lights",
        brand="m3-ade605c4-cf392e0b67d2098", hard_button_codes=HARD_BUTTONS,
    )
    # build the equivalent baseline: same labels/ids, matching refs
    dev_entry = {
        "device": {"device_id": 10, "name": "Lights", "brand": "m3-ade605c4-cf392e0b67d2098"},
        "commands": (
            [{"command_id": i, "command_label": desired.slots[i].label} for i in range(1, 11)]
            + [{"command_id": i + 10, "command_label": desired.slots[i + 10].label} for i in range(1, 11)]
        ),
        "input_record": {"entries": [
            {"command_id": cid, "input_index": n + 1} for n, cid in enumerate(desired.input_command_ids)
        ]},
        "macros": [
            {"button_id": 198, "steps": [{"command_id": 1}]},
            {"button_id": 199, "steps": [{"command_id": 2}]},
        ],
    }
    def refs_to_activity(act_id: int, refs) -> dict:
        return {
            "device": {"device_id": act_id},
            "referenced_source_device_ids": [10, 99],
            "favorite_slots": [
                {"button_id": 40 + cid, "device_id": 10, "command_id": cid} for cid in refs.favorites
            ],
            "button_bindings": [
                {"button_id": b, "device_id": 10, "command_id": c,
                 "long_press_device_id": 10 if l else None, "long_press_command_id": l}
                for b, c, l in refs.bindings
            ],
            "macros": [{"button_id": 198, "steps": [
                {"device_id": 10, "command_id": 197, "duration": refs.input_ordinal},
            ]}],
        }
    acts = [refs_to_activity(a, r) for a, r in desired.activities.items()]
    baseline = baseline_snapshot_from_bundle(dev_entry, acts)
    plan = build_wifi_inplace_plan(baseline, desired)
    assert not plan.is_fallback
    assert plan.steps == ()
