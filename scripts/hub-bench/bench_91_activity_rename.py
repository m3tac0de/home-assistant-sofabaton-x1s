"""Rename program, chunk 2: validate the in-place activity-rename executor.

Renames the sacrificial "Bench Test" activity (id 104 on both bench hubs)
via the same code path live sync uses (``_sync_step_activity_rename``),
re-reads the catalog, asserts the name changed and nothing else did, then
restores the original name.

Usage:
    python bench_91_activity_rename.py <ip> <X1|X1S> <tag> [activity_id]
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0) if len(sys.argv) > 4 else 104

log_path = setup_logging(f"act-rename-{TAG}")
print(f"logging to {log_path}")


def snapshot(proxy):
    proxy._refresh_catalog("activities", timeout=15.0)
    time.sleep(0.5)
    acts = proxy.get_activities(force_refresh=False)[0] or {}
    return {int(k): (v.get("name") if isinstance(v, dict) else v) for k, v in acts.items()}


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "hub_version": HUB_VERSION, "activity_id": ACT_ID}
try:
    before = snapshot(proxy)
    print(f"before: {before}")
    if ACT_ID not in before:
        raise SystemExit(f"activity 0x{ACT_ID:02X} not present")
    original = str(before[ACT_ID])
    artifacts["original_name"] = original

    new_name = "Renamed OK" if original != "Renamed OK" else "Bench Test"
    print(f"renaming 0x{ACT_ID:02X} {original!r} -> {new_name!r}")
    ok = proxy._sync_step_activity_rename({"activity_id": ACT_ID, "name": new_name})
    print(f"  executor returned {ok}")
    artifacts["rename_ok"] = bool(ok)
    time.sleep(0.5)

    after = snapshot(proxy)
    print(f"after: {after}")
    artifacts["after"] = after
    renamed = after.get(ACT_ID) == new_name
    others_intact = {k: v for k, v in after.items() if k != ACT_ID} == {
        k: v for k, v in before.items() if k != ACT_ID
    }
    print(f"{'OK  ' if renamed else 'FAIL'} activity renamed to {new_name!r}")
    print(f"{'OK  ' if others_intact else 'FAIL'} other activities intact")
    artifacts["renamed"] = renamed
    artifacts["others_intact"] = others_intact

    # Restore the original name so the bench hub is left as found.
    print(f"restoring name -> {original!r}")
    proxy._sync_step_activity_rename({"activity_id": ACT_ID, "name": original})
    time.sleep(0.5)
    restored = snapshot(proxy)
    print(f"restored: {restored.get(ACT_ID)!r}")
    artifacts["restored_ok"] = restored.get(ACT_ID) == original
finally:
    save_json(f"act-rename-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
