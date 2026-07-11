"""Activity program chunk 4: bindings + membership + combined plan.

Legs, each via ``proxy.sync_activity`` with a fresh re-read baseline:

1. bind      — new VOL_UP (182) binding → sacrificial device cmd 1
2. overwrite — same button → cmd 2 with a long-press (cmd 1)
3. unbind    — delete the binding
4. combined  — one multi-category plan: binding to a NEW device
               (member_replay), favorite add, POWER_ON/OFF grown with
               the new device's power rows (as the editor would)
5. restore   — sync everything back to the chunk-4 baseline

Plan: docs/internal/activity-sync-bench-plan.md.

Usage: bench_40_bindings.py <ip> <X1|X1S|X2> <tag> <act_id> <dev_id> <other_dev_id>
"""

from __future__ import annotations

import copy
import sys

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0)
DEV_ID = int(sys.argv[5], 0)
OTHER_DEV = int(sys.argv[6], 0)

BTN = 182  # VOL_UP
POWER_ON = 198
POWER_OFF = 199

log_path = setup_logging(f"bindings-{TAG}")
print(f"logging to {log_path}")

artifacts: dict[str, object] = {}


def _progress(**payload):
    print(
        f"    [{payload.get('phase')}] {payload.get('message')} "
        f"({payload.get('completed_steps')}/{payload.get('total_steps')})"
    )


def _bindings_view(payload):
    return {
        int(row.get("button_id", 0)): (
            int(row.get("device_id", 0)),
            int(row.get("command_id", 0)),
            row.get("long_press_device_id"),
            row.get("long_press_command_id"),
        )
        for row in (payload or {}).get("button_bindings") or []
    }


def _macros_view(payload):
    return {
        int(row.get("button_id", 0)): [
            (
                int(s.get("device_id", 0)),
                int(s.get("command_id", 0)),
                int(s.get("button_code", 0)),
                int(s.get("duration", 0)),
                int(s.get("delay", 0)),
            )
            for s in row.get("steps") or []
        ]
        for row in (payload or {}).get("macros") or []
    }


def _favs_view(payload):
    return sorted(
        (int(r.get("device_id", 0)), int(r.get("command_id", 0)))
        for r in (payload or {}).get("favorite_slots") or []
    )


def _members():
    try:
        proxy.state.activity_members.pop(ACT_ID & 0xFF, None)
        proxy._activity_map_complete.discard(ACT_ID & 0xFF)
        if proxy.request_activity_mapping(ACT_ID):
            proxy._wait_for_activity_map_burst(ACT_ID & 0xFF, timeout=5.0)
        return proxy.state.get_activity_members(ACT_ID & 0xFF)
    except Exception as err:  # observation only, never fail the leg
        return f"<error {err}>"


def capture(label: str):
    payload = proxy.backup_activity(ACT_ID)
    if not isinstance(payload, dict):
        raise SystemExit(f"[{label}] backup_activity failed")
    view = {
        "bindings": _bindings_view(payload),
        "macros": _macros_view(payload),
        "favorites": _favs_view(payload),
        "members": _members(),
    }
    print(f"  [{label}] bindings={view['bindings']}")
    print(f"  [{label}] favorites={view['favorites']} members={view['members']}")
    for key in sorted(view["macros"]):
        print(f"  [{label}] macro {key}: {view['macros'][key]}")
    artifacts[label] = {k: (v if k != "bindings" else {str(b): r for b, r in v.items()}) for k, v in view.items()}
    return payload, view


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
        save_json(f"bindings-{TAG}", artifacts)
        raise SystemExit(f"leg {name} failed: {result}")
    return capture(f"after-{name}")


def check(label: str, ok: bool, detail: str):
    print(f"  check[{label}]: {'OK' if ok else 'FAIL'} — {detail}")
    artifacts[f"check-{label}"] = {"ok": ok, "detail": detail}


proxy = connect(HOST, HUB_VERSION)
try:
    base, base_view = capture("baseline")
    if BTN in base_view["bindings"]:
        print(f"  (note: button {BTN} already bound — resuming mid-chunk)")

    # ── Leg 1: binding write ────────────────────────────────────────
    edited = copy.deepcopy(base)
    edited["button_bindings"] = [
        row for row in edited.get("button_bindings") or []
        if int(row.get("button_id", 0)) != BTN
    ] + [{"button_id": BTN, "device_id": DEV_ID, "command_id": 1,
          "long_press_device_id": None, "long_press_command_id": None}]
    after_bind, view = run_leg("bind", base, edited)
    check("bind", view["bindings"].get(BTN) == (DEV_ID, 1, None, None),
          f"got={view['bindings'].get(BTN)}")

    # ── Leg 2: overwrite with long-press ────────────────────────────
    edited = copy.deepcopy(after_bind)
    for row in edited.get("button_bindings") or []:
        if int(row.get("button_id", 0)) == BTN:
            row["command_id"] = 2
            row["long_press_device_id"] = DEV_ID
            row["long_press_command_id"] = 1
    after_over, view = run_leg("overwrite", after_bind, edited)
    check("overwrite", view["bindings"].get(BTN) == (DEV_ID, 2, DEV_ID, 1),
          f"got={view['bindings'].get(BTN)}")

    # ── Leg 3: binding delete ───────────────────────────────────────
    edited = copy.deepcopy(after_over)
    edited["button_bindings"] = [
        row for row in edited.get("button_bindings") or []
        if int(row.get("button_id", 0)) != BTN
    ]
    after_unbind, view = run_leg("unbind", after_over, edited)
    check("unbind", BTN not in view["bindings"], f"bindings={view['bindings']}")

    # ── Leg 4: combined multi-category (member_replay + macros +
    #           binding + favorite) ─────────────────────────────────
    edited = copy.deepcopy(after_unbind)
    edited["button_bindings"] = list(edited.get("button_bindings") or []) + [
        {"button_id": BTN, "device_id": OTHER_DEV, "command_id": 1,
         "long_press_device_id": None, "long_press_command_id": None}
    ]
    edited["favorite_slots"] = list(edited.get("favorite_slots") or []) + [
        {"button_id": 200, "device_id": DEV_ID, "command_id": 2}
    ]
    for row in edited.get("macros") or []:
        bid = int(row.get("button_id", 0))
        if bid == POWER_ON:
            row["steps"] = list(row.get("steps") or []) + [
                {"device_id": OTHER_DEV, "command_id": 0xC6,
                 "button_code": 0, "duration": 0, "delay": 255}
            ]
        elif bid == POWER_OFF:
            row["steps"] = list(row.get("steps") or []) + [
                {"device_id": OTHER_DEV, "command_id": 0xC7,
                 "button_code": 0, "duration": 0, "delay": 255}
            ]
    after_comb, view = run_leg("combined", after_unbind, edited)
    check("combined-binding", view["bindings"].get(BTN) == (OTHER_DEV, 1, None, None),
          f"got={view['bindings'].get(BTN)}")
    check("combined-favorite", (DEV_ID, 2) in view["favorites"],
          f"favorites={view['favorites']}")
    check(
        "combined-macros",
        view["macros"].get(POWER_ON) == _macros_view(edited).get(POWER_ON)
        and view["macros"].get(POWER_OFF) == _macros_view(edited).get(POWER_OFF),
        f"on={view['macros'].get(POWER_ON)} off={view['macros'].get(POWER_OFF)}",
    )
    check("combined-member", OTHER_DEV in (view["members"] or []),
          f"members={view['members']}")

    # ── Leg 5: restore chunk-4 baseline ─────────────────────────────
    _, view = run_leg("restore", after_comb, base)
    same = (
        view["bindings"] == base_view["bindings"]
        and view["macros"] == base_view["macros"]
        and view["favorites"] == base_view["favorites"]
    )
    check("baseline-equality", same,
          "bindings+macros+favorites match" if same else
          f"got={view} want={base_view}")
    print(f"  (post-restore members: {view['members']} — membership residue observation)")
    path = save_json(f"bindings-{TAG}", artifacts)
    print("artifacts saved:", path)
finally:
    proxy.stop()
    print("disconnected")
