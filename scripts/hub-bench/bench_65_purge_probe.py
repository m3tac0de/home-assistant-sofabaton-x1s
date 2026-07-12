"""Backup/restore chunk 3: isolate the restored-activity purge mechanism.

Snapshots the activity list, restores a throwaway device copy, deletes it
(family 0x09), and re-snapshots — reporting exactly which activities
survived the device-delete sweep. With a mix of app-created and restored
activities on the hub, this pins whether the purge is restored-activity-
specific and how many it takes.

Usage:
    python bench_65_purge_probe.py <ip> <X1|X1S> <tag> <ir_source_dev_id>
"""

from __future__ import annotations

import copy
import json
import sys
import time

from bench_common import BENCH_DIR, connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
IR_SOURCE_DEV = int(sys.argv[4], 0)

log_path = setup_logging(f"br-purge-{TAG}")
print(f"logging to {log_path}")

bundle = json.loads((BENCH_DIR / f"br-bundle-{TAG}.json").read_text(encoding="utf-8"))
src = next(
    (d for d in bundle["devices"] if int(d["device"]["device_id"]) == IR_SOURCE_DEV),
    None,
)
if src is None:
    sys.exit(f"device 0x{IR_SOURCE_DEV:02X} not in bundle")


def wait_ready(getter, timeout=15.0):
    deadline = time.time() + timeout
    val = None
    while time.time() < deadline:
        val, ready = getter()
        if ready:
            return val, True
        time.sleep(0.3)
    return val, False


def act_snapshot(proxy) -> dict[int, str]:
    proxy._refresh_catalog("activities", timeout=15.0)
    acts, _ = wait_ready(lambda: proxy.get_activities(force_refresh=False), timeout=6.0)
    return {
        int(k): (v.get("name") if isinstance(v, dict) else v)
        for k, v in (acts or {}).items()
    }


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST}
try:
    before = act_snapshot(proxy)
    print(f"activities before: {before}")
    artifacts["before"] = before

    payload = copy.deepcopy(src)
    payload["device"]["name"] = "Purge Probe Dev"
    print(f"restoring throwaway device copy of 0x{IR_SOURCE_DEV:02X}...")
    result = proxy.restore_device(payload)
    if not result or result.get("status") != "success":
        raise SystemExit(f"device restore failed: {result}")
    new_dev = int(result["device_id"])
    print(f"  created device 0x{new_dev:02X}")

    mid = act_snapshot(proxy)
    print(f"activities after device CREATE: {mid}")
    artifacts["after_create"] = mid

    print(f"deleting device 0x{new_dev:02X}...")
    del_result = proxy.delete_device(new_dev)
    print(f"  delete result: {del_result}")
    artifacts["delete_result"] = del_result

    after = act_snapshot(proxy)
    print(f"activities after device DELETE: {after}")
    artifacts["after_delete"] = after

    purged = sorted(set(before) - set(after))
    survived = sorted(set(before) & set(after))
    artifacts["purged"] = purged
    artifacts["survived"] = survived
    print(f"\nPURGED by device-delete: {[(a, before[a]) for a in purged]}")
    print(f"SURVIVED: {[(a, before[a]) for a in survived]}")
finally:
    path = save_json(f"br-purge-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")
