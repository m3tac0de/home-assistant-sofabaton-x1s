"""Backup/restore chunk 3: discover the activity-delete path.

Plan candidate: family 0x09 (DELETE_DEVICE) with an *activity* id — the
hub's tables split device vs activity purely by id range (>= 0x65). This
sends family 0x09 with the given activity id via the existing
``delete_device`` entry point and verifies the activity is gone while
devices and OTHER activities are untouched.

Usage:
    python bench_67_activity_delete.py <ip> <X1|X1S> <tag> <activity_id>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0)

log_path = setup_logging(f"br-actdel-{TAG}")
print(f"logging to {log_path}")


def wait_ready(getter, timeout=15.0):
    deadline = time.time() + timeout
    val = None
    while time.time() < deadline:
        val, ready = getter()
        if ready:
            return val, True
        time.sleep(0.3)
    return val, False


def snapshot(proxy):
    proxy._refresh_catalog("devices", timeout=15.0)
    proxy._refresh_catalog("activities", timeout=15.0)
    devs, _ = wait_ready(lambda: proxy.get_devices(), timeout=6.0)
    acts, _ = wait_ready(lambda: proxy.get_activities(force_refresh=False), timeout=6.0)
    return (
        {int(k): (v.get("name") if isinstance(v, dict) else v) for k, v in (devs or {}).items()},
        {int(k): (v.get("name") if isinstance(v, dict) else v) for k, v in (acts or {}).items()},
    )


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "activity_id": ACT_ID}
try:
    devs0, acts0 = snapshot(proxy)
    print(f"before: devices={sorted(devs0)} activities={acts0}")
    artifacts["before"] = {"devices": sorted(devs0), "activities": acts0}
    if ACT_ID not in acts0:
        raise SystemExit(f"activity 0x{ACT_ID:02X} not present; nothing to delete")

    print(f"sending family 0x09 (delete) with activity id 0x{ACT_ID:02X}...")
    t0 = time.time()
    result = proxy.delete_device(ACT_ID)
    print(f"  result ({time.time() - t0:.1f}s): {result}")
    artifacts["delete_result"] = result

    devs1, acts1 = snapshot(proxy)
    print(f"after: devices={sorted(devs1)} activities={acts1}")
    artifacts["after"] = {"devices": sorted(devs1), "activities": acts1}

    ok_gone = ACT_ID not in acts1
    ok_others = sorted(acts1) == sorted(a for a in acts0 if a != ACT_ID)
    ok_devs = sorted(devs1) == sorted(devs0)
    print(f"\n{'OK  ' if ok_gone else 'FAIL'} activity 0x{ACT_ID:02X} deleted")
    print(f"{'OK  ' if ok_others else 'FAIL'} other activities intact")
    print(f"{'OK  ' if ok_devs else 'FAIL'} devices intact")
    artifacts["deleted"] = ok_gone
    artifacts["others_intact"] = ok_others
    artifacts["devices_intact"] = ok_devs
finally:
    save_json(f"br-actdel-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
