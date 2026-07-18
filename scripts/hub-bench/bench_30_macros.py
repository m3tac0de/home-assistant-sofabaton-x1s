"""Activity program chunk 3: activity macros through the sync engine
(the §10 gate for the paged macro save).

Legs, each via ``proxy.sync_activity`` with a fresh re-read baseline:

1. grow    — POWER_ON [cmd1] → [cmd1, delay(2s), cmd2] (paged macro save;
             raw_label_slot passthrough for key 198 must byte-match)
2. shrink  — POWER_ON back to [cmd1]
3. create  — user macro "Bench Macro" at key 0x01 (watch item: engine
             writes the editor's button_id as-is; app traces suggest
             create may need the key-0x00 assign-one path)
4. delete  — remove the user macro (0x0210 + 0x65 commit)

Plan: docs/internal/activity-sync-bench-plan.md.

Usage: bench_30_macros.py <ip> <X1|X1S|X2> <tag> <act_id>
"""

from __future__ import annotations

import copy
import sys

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0)

POWER_ON = 198
POWER_OFF = 199
USER_KEY = 1
USER_NAME = "Bench Macro"

log_path = setup_logging(f"macros-{TAG}")
print(f"logging to {log_path}")

artifacts: dict[str, object] = {}


def _progress(**payload):
    print(
        f"    [{payload.get('phase')}] {payload.get('message')} "
        f"({payload.get('completed_steps')}/{payload.get('total_steps')})"
    )


def _steps_view(row):
    return [
        (
            int(s.get("device_id", 0)),
            int(s.get("command_id", 0)),
            int(s.get("button_code", 0)),
            int(s.get("duration", 0)),
            int(s.get("delay", 0)),
        )
        for s in (row or {}).get("steps") or []
    ]


def _macros_view(payload):
    return {
        int(row.get("button_id", 0)): {
            "name": row.get("name"),
            "steps": _steps_view(row),
        }
        for row in (payload or {}).get("macros") or []
    }


def _label_slots():
    return {
        record.key_id & 0xFF: record.raw_label_slot.hex()
        for record in proxy.get_cached_macro_records(ACT_ID)
    }


def capture(label: str):
    payload = proxy.backup_activity(ACT_ID)
    if not isinstance(payload, dict):
        raise SystemExit(f"[{label}] backup_activity failed")
    macros = _macros_view(payload)
    slots = _label_slots()
    for key in sorted(macros):
        print(f"  [{label}] macro key={key} name={macros[key]['name']!r} steps={macros[key]['steps']}")
    print(f"  [{label}] label slots: { {k: v[:24] + '...' for k, v in sorted(slots.items())} }")
    artifacts[label] = {"macros": macros, "label_slots": slots}
    return payload, macros, slots


def bundle(payload):
    return {"devices": [], "activities": [copy.deepcopy(payload)]}


def run_leg(name: str, baseline_payload, edited_payload):
    print(f"leg: {name}")
    result = proxy.sync_activity(
        baseline=bundle(baseline_payload),
        edited=bundle(edited_payload),
        activity_id=ACT_ID,
        progress_callback=_progress,
    )
    print(f"  result: {result}")
    artifacts[f"{name}-result"] = result
    if result.get("status") != "success":
        save_json(f"macros-{TAG}", artifacts)
        raise SystemExit(f"leg {name} failed: {result}")
    return capture(f"after-{name}")


def _macro_row(payload, button_id):
    for row in payload.get("macros") or []:
        if int(row.get("button_id", 0)) == button_id:
            return row
    return None


def check(label: str, expect: bool, detail: str):
    verdict = "OK" if expect else "FAIL"
    print(f"  check[{label}]: {verdict} — {detail}")
    artifacts[f"check-{label}"] = {"ok": expect, "detail": detail}


proxy = connect(HOST, HUB_VERSION)
try:
    base, base_macros, base_slots = capture("baseline")
    on_row = _macro_row(base, POWER_ON)
    off_row = _macro_row(base, POWER_OFF)
    if not on_row or not off_row:
        raise SystemExit("expected POWER_ON/POWER_OFF macros on the sacrificial activity")
    cmd1_step = copy.deepcopy((on_row.get("steps") or [])[0])
    cmd2_step = copy.deepcopy((off_row.get("steps") or [])[0])
    delay_step = {
        "device_id": 0xFF, "command_id": 0xFF,
        "button_code": 0xFFFFFFFFFFFF, "duration": 0xFF, "delay": 2,
    }

    # ── Leg 1: grow POWER_ON ────────────────────────────────────────
    if len(base_macros.get(POWER_ON, {}).get("steps") or []) == 3:
        print("  (grow leg already applied; skipping)")
        after_grow, grow_macros, grow_slots = base, base_macros, base_slots
    else:
        edited = copy.deepcopy(base)
        _macro_row(edited, POWER_ON)["steps"] = [
            copy.deepcopy(cmd1_step), dict(delay_step), copy.deepcopy(cmd2_step),
        ]
        after_grow, grow_macros, grow_slots = run_leg("grow", base, edited)
        want = [
            tuple(cmd1_step[k] for k in ("device_id", "command_id", "button_code", "duration", "delay")),
            (0xFF, 0xFF, 0xFFFFFFFFFFFF, 0xFF, 2),
            tuple(cmd2_step[k] for k in ("device_id", "command_id", "button_code", "duration", "delay")),
        ]
        got = grow_macros.get(POWER_ON, {}).get("steps")
        check("grow-steps", got == want, f"want={want} got={got}")
        check(
            "grow-label-slot",
            grow_slots.get(POWER_ON) == base_slots.get(POWER_ON),
            f"base={base_slots.get(POWER_ON)} now={grow_slots.get(POWER_ON)}",
        )

    # ── Leg 2: shrink POWER_ON back ─────────────────────────────────
    edited = copy.deepcopy(after_grow)
    _macro_row(edited, POWER_ON)["steps"] = [copy.deepcopy(cmd1_step)]
    after_shrink, shrink_macros, shrink_slots = run_leg("shrink", after_grow, edited)
    check(
        "shrink-steps",
        shrink_macros.get(POWER_ON, {}).get("steps") == base_macros.get(POWER_ON, {}).get("steps"),
        f"want={base_macros.get(POWER_ON, {}).get('steps')} got={shrink_macros.get(POWER_ON, {}).get('steps')}",
    )
    check(
        "shrink-label-slot",
        shrink_slots.get(POWER_ON) == base_slots.get(POWER_ON),
        f"base={base_slots.get(POWER_ON)} now={shrink_slots.get(POWER_ON)}",
    )

    # ── Leg 3: user-macro create at a fresh key ─────────────────────
    if USER_KEY in shrink_macros:
        print("  (user macro already present; skipping create)")
        after_create, create_macros, _ = after_shrink, shrink_macros, shrink_slots
    else:
        edited = copy.deepcopy(after_shrink)
        edited["macros"] = list(edited.get("macros") or []) + [{
            "button_id": USER_KEY,
            "name": USER_NAME,
            "steps": [copy.deepcopy(cmd1_step), copy.deepcopy(cmd2_step)],
        }]
        after_create, create_macros, _ = run_leg("create", after_shrink, edited)
        landed = create_macros.get(USER_KEY)
        other_keys = sorted(set(create_macros) - set(base_macros))
        check(
            "user-create",
            landed is not None,
            f"key={USER_KEY} row={landed} new_keys={other_keys}",
        )

    # ── Leg 4: user-macro delete ────────────────────────────────────
    if USER_KEY in create_macros:
        edited = copy.deepcopy(after_create)
        edited["macros"] = [
            row for row in edited.get("macros") or []
            if int(row.get("button_id", 0)) != USER_KEY
        ]
        _, final_macros, final_slots = run_leg("delete", after_create, edited)
    else:
        print("  (no user macro to delete; skipping)")
        final_macros, final_slots = create_macros, shrink_slots

    same = final_macros == base_macros and final_slots == base_slots
    check("baseline-equality", same, f"macros+slots {'match' if same else 'differ'} vs chunk-3 baseline")
    path = save_json(f"macros-{TAG}", artifacts)
    print("artifacts saved:", path)
finally:
    proxy.stop()
    print("disconnected")
