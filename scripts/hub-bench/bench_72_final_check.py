"""Backup/restore program chunk 7: final read-only baseline check.

Connects to one hub, snapshots the device/activity catalogs, and
verifies they match the chunk-6 post-restore bundle by id + name.
Read-only; no writes.

Usage:
    python bench_72_final_check.py <ip> <X1|X1S> <tag>
"""

from __future__ import annotations

import json
import sys
import time

from bench_common import BENCH_DIR, connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

log_path = setup_logging(f"br-final-{TAG}")
print(f"logging to {log_path}")

post = json.loads((BENCH_DIR / f"br-c6-post-{TAG}.json").read_text(encoding="utf-8"))
expected_devices = {
    int((d.get("device") or {}).get("device_id") or 0): str((d.get("device") or {}).get("name"))
    for d in post.get("devices") or []
}
expected_activities = {
    int((a.get("device") or {}).get("device_id") or 0): str((a.get("device") or {}).get("name"))
    for a in post.get("activities") or []
}

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


proxy = connect(HOST, HUB_VERSION)
try:
    proxy.request_devices()
    proxy.request_activities()
    deadline = time.time() + 30
    devs = acts = None
    while time.time() < deadline:
        devs, devs_ready = proxy.get_devices()
        acts, acts_ready = proxy.get_activities(force_refresh=False)
        if devs_ready and acts_ready:
            break
        time.sleep(0.5)
    devs = dict(devs or {})
    acts = dict(acts or {})
    got_devices = {k: str((v or {}).get("name")) for k, v in devs.items()}
    got_activities = {k: str((v or {}).get("name")) for k, v in acts.items()}
    check(
        "device catalog matches chunk-6 post bundle",
        got_devices == expected_devices,
        f"{len(got_devices)}/{len(expected_devices)} devices",
    )
    if got_devices != expected_devices:
        print(f"    expected={expected_devices}")
        print(f"    got     ={got_devices}")
    check(
        "activity catalog matches chunk-6 post bundle",
        got_activities == expected_activities,
        f"{len(got_activities)}/{len(expected_activities)} activities: {got_activities}",
    )
    if got_activities != expected_activities:
        print(f"    expected={expected_activities}")
    save_json(
        f"br-final-{TAG}",
        {
            "host": HOST,
            "hub_version": HUB_VERSION,
            "devices": got_devices,
            "activities": got_activities,
            "checks": [
                {"label": label, "ok": ok, "detail": detail}
                for label, ok, detail in checks
            ],
        },
    )
finally:
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
