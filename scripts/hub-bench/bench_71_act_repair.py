"""Backup/restore chunk 6 follow-up: repair one activity from the pre bundle.

Deletes the given activity on the hub (family 0x09, id >= 0x65) and
re-restores it from the chunk-6 pre-erase bundle through the fixed
engine (favorite slots skip macro-occupied keys), then round-trip
compares. Used to repair X1S "Watch a movie" (101) after the chunk-6
run surfaced the favorite/macro key collision.

Usage:
    python bench_71_act_repair.py <ip> <X1|X1S> <tag> <activity_id>
"""

from __future__ import annotations

import json
import sys
import time

from bench_common import BENCH_DIR, connect, save_json, setup_logging
from bench_compare import compare_activity_backup

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0)

log_path = setup_logging(f"br-actrepair-{TAG}-{ACT_ID:02x}")
print(f"logging to {log_path}")

pre = json.loads((BENCH_DIR / f"br-c6-pre-{TAG}.json").read_text(encoding="utf-8"))
source = next(
    (
        a
        for a in pre.get("activities") or []
        if int((a.get("device") or {}).get("device_id") or 0) == ACT_ID
    ),
    None,
)
if source is None:
    sys.exit(f"activity 0x{ACT_ID:02X} not in br-c6-pre-{TAG}.json")
name = (source.get("device") or {}).get("name")
print(
    f"source: 0x{ACT_ID:02X} {name!r} "
    f"bindings={len(source.get('button_bindings') or [])} "
    f"favorites={len(source.get('favorite_slots') or [])} "
    f"macros={[m.get('button_id') for m in source.get('macros') or []]}"
)

# Chunk-6 replace restore mapped every id to itself on this hub.
device_id_map = {
    int((d.get("device") or {}).get("device_id") or 0): int(
        (d.get("device") or {}).get("device_id") or 0
    )
    for d in pre.get("devices") or []
}
activity_id_map = {
    int((a.get("device") or {}).get("device_id") or 0): int(
        (a.get("device") or {}).get("device_id") or 0
    )
    for a in pre.get("activities") or []
    if int((a.get("device") or {}).get("device_id") or 0) != ACT_ID
}
bundle_devices_by_source_id = {
    int((d.get("device") or {}).get("device_id") or 0): d
    for d in pre.get("devices") or []
}
command_id_maps = {
    src_id: {
        int(c.get("command_id") or c.get("key_id") or 0): int(
            c.get("command_id") or c.get("key_id") or 0
        )
        for c in dev.get("commands") or []
    }
    for src_id, dev in bundle_devices_by_source_id.items()
}

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "activity_id": ACT_ID}
try:
    print(f"deleting damaged activity 0x{ACT_ID:02X}...")
    del_result = proxy.delete_device(ACT_ID)
    check(
        "activity delete acked",
        bool(del_result) and del_result.get("status") == "success",
        f"result={del_result}",
    )
    if not del_result or del_result.get("status") != "success":
        raise SystemExit("delete failed; stopping")

    print("re-restoring from pre-erase bundle (fixed engine)...")
    t0 = time.time()
    result = proxy.restore_activity(
        payload=source,
        device_id_map=device_id_map,
        bundle_devices_by_source_id=bundle_devices_by_source_id,
        command_id_maps_by_source_device_id=command_id_maps,
        activity_id_map=activity_id_map,
    )
    artifacts["restore_result"] = result
    check(
        "restore_activity success",
        bool(result) and result.get("status") == "success",
        f"{time.time() - t0:.1f}s result={result}",
    )
    if not result or result.get("status") != "success":
        raise SystemExit("restore failed")

    new_id = int(result["activity_id"])
    combined = dict(device_id_map)
    combined.update(activity_id_map)
    combined[ACT_ID] = new_id

    print(f"re-reading restored activity 0x{new_id:02X}...")
    reread = proxy.backup_activity(new_id)
    artifacts["reread"] = reread
    problems, notes = compare_activity_backup(
        source, reread,
        device_id_map=combined,
        expected_name=str(name),
        hub_version=HUB_VERSION,
    )
    artifacts["compare_problems"] = problems
    artifacts["compare_notes"] = notes
    for note in notes:
        print(f"  note: {note}")
    for item in problems:
        print("  problem:", item)
    check("round-trip equal", not problems, f"{len(problems)} problem(s)")

    src_macro_keys = sorted(int(m["button_id"]) for m in source.get("macros") or [])
    dst_macro_keys = sorted(int(m["button_id"]) for m in reread.get("macros") or [])
    check(
        "macro keys fully restored",
        src_macro_keys == dst_macro_keys,
        f"source={src_macro_keys} restored={dst_macro_keys}",
    )
    src_slots = sorted(int(f["button_id"]) for f in source.get("favorite_slots") or [])
    dst_slots = sorted(int(f["button_id"]) for f in reread.get("favorite_slots") or [])
    check(
        "favorite slots reproduce source layout",
        src_slots == dst_slots,
        f"source={src_slots} restored={dst_slots}",
    )
finally:
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"br-actrepair-{TAG}-{ACT_ID:02x}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
