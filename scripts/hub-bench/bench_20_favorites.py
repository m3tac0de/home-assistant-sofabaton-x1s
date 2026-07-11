"""Activity program chunk 2: favorites through the production sync engine.

Three legs, each via ``proxy.sync_activity`` with a fresh re-read baseline,
verified by re-reading the activity after the write:

1. add    — new favorite (sacrificial device, FAV_CMD); hub assigns fav_id
2. reorder — reverse the two favorites via favorite_order content pairs
3. delete — remove the added favorite; content must match the chunk-1 baseline

Plan: docs/internal/activity-sync-bench-plan.md.

Usage: bench_20_favorites.py <ip> <X1|X1S|X2> <tag> <act_id> <dev_id> [fav_cmd]
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
FAV_CMD = int(sys.argv[6], 0) if len(sys.argv) > 6 else 2

log_path = setup_logging(f"favorites-{TAG}")
print(f"logging to {log_path}")

artifacts: dict[str, object] = {}


def _progress(**payload):
    print(
        f"    [{payload.get('phase')}] {payload.get('message')} "
        f"({payload.get('completed_steps')}/{payload.get('total_steps')})"
    )


def _fav_view(payload):
    return [
        (row.get("button_id"), row.get("device_id"), row.get("command_id"))
        for row in (payload or {}).get("favorite_slots") or []
    ]


def capture(label: str):
    payload = proxy.backup_activity(ACT_ID)
    if not isinstance(payload, dict):
        raise SystemExit(f"[{label}] backup_activity failed")
    hub_order = proxy.request_favorites_order(ACT_ID)
    print(f"  [{label}] favorites (fav_id, dev, cmd) = {_fav_view(payload)}")
    print(f"  [{label}] hub 0x63 order (fav_id, slot) = {hub_order}")
    artifacts[label] = {"favorites": _fav_view(payload), "hub_order": hub_order}
    return payload


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
        save_json(f"favorites-{TAG}", artifacts)
        raise SystemExit(f"leg {name} failed: {result}")
    return capture(f"after-{name}")


proxy = connect(HOST, HUB_VERSION)
try:
    base = capture("baseline")
    base_favs = list(base.get("favorite_slots") or [])
    if not base_favs:
        raise SystemExit("expected the chunk-1 favorite on the sacrificial activity")
    already_added = any(
        int(f.get("command_id", 0)) == FAV_CMD and int(f.get("device_id", 0)) == DEV_ID
        for f in base_favs
    )
    if already_added:
        # Resuming after a mid-chunk failure: the add leg already landed.
        print("  (add leg already applied on hub; resuming from reorder)")
        base_favs = [
            f for f in base_favs
            if not (int(f.get("command_id", 0)) == FAV_CMD
                    and int(f.get("device_id", 0)) == DEV_ID)
        ]
        after_add = base
    else:
        # ── Leg 1: add ──────────────────────────────────────────────
        edited = copy.deepcopy(base)
        edited["favorite_slots"] = list(copy.deepcopy(base_favs)) + [
            {"button_id": 200, "device_id": DEV_ID, "command_id": FAV_CMD}
        ]
        after_add = run_leg("add", base, edited)
    added = [
        row
        for row in after_add.get("favorite_slots") or []
        if int(row.get("device_id", 0)) == DEV_ID
        and int(row.get("command_id", 0)) == FAV_CMD
    ]
    if not added:
        raise SystemExit("added favorite did not appear on re-read")
    print(f"  hub assigned fav_id={added[0].get('button_id')}")

    # ── Leg 2: reorder (reverse current order) ──────────────────────
    entries = sorted(
        (dict(row) for row in after_add.get("favorite_slots") or []),
        key=lambda row: int(row.get("button_id", 0)),
    )
    if len(entries) < 2:
        raise SystemExit("need 2 favorites to reorder")
    edited = copy.deepcopy(after_add)
    reversed_rows = []
    for position, row in enumerate(reversed(entries), start=1):
        row = dict(row)
        row["button_id"] = position  # positional; engine matches by content
        reversed_rows.append(row)
    edited["favorite_slots"] = reversed_rows
    after_reorder = run_leg("reorder", after_add, edited)

    # ── Leg 3: delete the added favorite (back to baseline content) ─
    edited = copy.deepcopy(after_reorder)
    edited["favorite_slots"] = [
        dict(row)
        for row in after_reorder.get("favorite_slots") or []
        if not (
            int(row.get("device_id", 0)) == DEV_ID
            and int(row.get("command_id", 0)) == FAV_CMD
        )
    ]
    after_delete = run_leg("delete", after_reorder, edited)

    want = sorted(
        (int(r.get("device_id", 0)), int(r.get("command_id", 0))) for r in base_favs
    )
    got = sorted(
        (int(r.get("device_id", 0)), int(r.get("command_id", 0)))
        for r in after_delete.get("favorite_slots") or []
    )
    verdict = "MATCH" if want == got else f"MISMATCH want={want} got={got}"
    print(f"baseline-content check: {verdict}")
    artifacts["baseline-check"] = verdict
    path = save_json(f"favorites-{TAG}", artifacts)
    print("artifacts saved:", path)
finally:
    proxy.stop()
    print("disconnected")
