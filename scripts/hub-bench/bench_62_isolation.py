"""Backup/restore chunk 2 follow-up: isolate the Bench Test activity loss.

The first bench_61 run on the X1 ended with activity 0x68 ("Bench Test")
gone from the hub even though no frame addressed it. This script:

1. restores Bench Test from the chunk-1 baseline (recovery + first rich
   restore_activity datapoint),
2. restores an IR device copy ("Bench Copy") while snapshotting the
   activity list before/after each phase — isolating whether the device
   CREATE or the family-0x09 DELETE is what makes the hub drop an
   activity,
3. round-trip compares the IR copy (byte-equality evidence for the
   blob-tail question), and
4. deletes the copy and checks the activity list again.

Usage:
    python bench_62_isolation.py <ip> <X1|X1S> <tag> <ir_source_dev_id>
"""

from __future__ import annotations

import copy
import json
import sys
import time

from bench_common import BENCH_DIR, connect, save_json, setup_logging
from bench_compare import compare_device_backup

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
IR_SOURCE_DEV = int(sys.argv[4], 0)

COPY_NAME = "Bench Copy"

log_path = setup_logging(f"br-isolate-{TAG}")
print(f"logging to {log_path}")

bundle = json.loads((BENCH_DIR / f"br-bundle-{TAG}.json").read_text(encoding="utf-8"))
act_baseline = json.loads(
    (BENCH_DIR / f"br-baseline-act-{TAG}.json").read_text(encoding="utf-8")
)
ir_source = next(
    (d for d in bundle["devices"] if int(d["device"]["device_id"]) == IR_SOURCE_DEV),
    None,
)
if ir_source is None:
    sys.exit(f"device 0x{IR_SOURCE_DEV:02X} not in bundle")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def wait_ready(getter, timeout: float = 20.0):
    deadline = time.time() + timeout
    value = None
    while time.time() < deadline:
        value, ready = getter()
        if ready:
            return value, True
        time.sleep(0.3)
    return value, False


def snapshot(proxy) -> tuple[dict, dict]:
    """Fresh, sequenced catalog snapshot via the engine's sync refresh."""
    proxy._refresh_catalog("devices", timeout=15.0)
    proxy._refresh_catalog("activities", timeout=15.0)
    devs, devs_ok = wait_ready(lambda: proxy.get_devices(), timeout=5.0)
    acts, acts_ok = wait_ready(
        lambda: proxy.get_activities(force_refresh=False), timeout=5.0
    )
    if not (devs_ok and acts_ok):
        print(f"  !! snapshot incomplete (devices_ok={devs_ok} activities_ok={acts_ok})")
    return dict(devs or {}), dict(acts or {})


def act_names(acts: dict) -> dict[int, str]:
    return {
        int(k): (v.get("name") if isinstance(v, dict) else str(v))
        for k, v in acts.items()
    }


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "phase_activity_lists": {}}
try:
    devs0, acts0 = snapshot(proxy)
    print(f"start: devices={sorted(devs0)} activities={act_names(acts0)}")
    artifacts["phase_activity_lists"]["start"] = act_names(acts0)

    # ---- phase 1: restore Bench Test activity (skip when already present
    # or when isolating with app-created activities only)
    if "--skip-bench-test" in sys.argv:
        print("phase 1: skipped by flag (app-created activities only)")
        devs1, acts1 = devs0, acts0
    elif any(
        (v.get("name") if isinstance(v, dict) else v) == "Bench Test"
        for v in acts0.values()
    ):
        print("phase 1: 'Bench Test' already on hub — skipping restore")
        devs1, acts1 = devs0, acts0
    else:
        print("phase 1: restoring 'Bench Test' activity from chunk-1 baseline...")
        payload = copy.deepcopy(act_baseline)
        t0 = time.time()
        act_result = proxy.restore_activity(payload, device_id_map={9: 9, 10: 10})
        print(f"  restore_activity result ({time.time() - t0:.1f}s): {act_result}")
        artifacts["restore_activity_result"] = act_result
        check(
            "restore_activity succeeded",
            bool(act_result) and act_result.get("status") == "success",
        )
        new_act_id = int(act_result.get("activity_id") or 0) if act_result else 0

        devs1, acts1 = snapshot(proxy)
        artifacts["phase_activity_lists"]["after_activity_restore"] = act_names(acts1)
        print(f"  activities now: {act_names(acts1)}")
        check(
            "Bench Test present after restore",
            any(n == "Bench Test" for n in act_names(acts1).values()),
            f"assigned id={new_act_id}",
        )
        check(
            "activities 101-103 intact",
            all(a in acts1 for a in (0x65, 0x66, 0x67)),
        )

    # ---- phase 2: restore IR device copy, watch the activity list
    print(f"phase 2: restoring IR copy of 0x{IR_SOURCE_DEV:02X} as {COPY_NAME!r}...")
    dev_payload = copy.deepcopy(ir_source)
    dev_payload["device"]["name"] = COPY_NAME
    t0 = time.time()
    result = proxy.restore_device(dev_payload)
    elapsed = time.time() - t0
    artifacts["restore_device_result"] = result
    check(
        "restore_device succeeded",
        bool(result) and result.get("status") == "success",
        f"{elapsed:.1f}s",
    )
    if not result or result.get("status") != "success":
        raise SystemExit("device restore failed; stopping")
    new_dev_id = int(result["device_id"])
    cmd_map = {int(k): int(v) for k, v in (result.get("command_id_map") or {}).items()}

    devs2, acts2 = snapshot(proxy)
    artifacts["phase_activity_lists"]["after_device_create"] = act_names(acts2)
    print(f"  activities after device create: {act_names(acts2)}")
    check(
        "no activity lost by device CREATE",
        sorted(acts2) == sorted(acts1),
        f"before={sorted(acts1)} after={sorted(acts2)}",
    )

    # ---- phase 3: round-trip compare (IR byte-equality evidence)
    print(f"phase 3: re-reading restored device 0x{new_dev_id:02X}...")
    reread = proxy.backup_device(new_dev_id, include_blobs=True)
    artifacts["reread"] = reread
    check("re-read returned payload", isinstance(reread, dict))
    if isinstance(reread, dict):
        problems, notes = compare_device_backup(
            ir_source,
            reread,
            command_id_map=cmd_map,
            expected_name=COPY_NAME,
            hub_version=HUB_VERSION,
        )
        artifacts["compare_problems"] = problems
        artifacts["compare_notes"] = notes
        for note in notes:
            print(f"  note: {note}")
        check("IR round-trip equal", not problems, f"{len(problems)} problem(s)")
        for item in problems[:25]:
            print("    -", item)

    # ---- phase 4: delete the copy, watch the activity list
    print(f"phase 4: deleting copy 0x{new_dev_id:02X}...")
    del_result = proxy.delete_device(new_dev_id)
    artifacts["delete_result"] = del_result
    check(
        "delete_device succeeded",
        bool(del_result) and del_result.get("status") == "success",
        f"result={del_result}",
    )

    devs3, acts3 = snapshot(proxy)
    artifacts["phase_activity_lists"]["after_device_delete"] = act_names(acts3)
    print(f"  activities after delete: {act_names(acts3)}")
    check(
        "no activity lost by device DELETE",
        sorted(acts3) == sorted(acts2),
        f"before={sorted(acts2)} after={sorted(acts3)}",
    )
    check("copy gone from device catalog", new_dev_id not in devs3)
    check(
        "device catalog back at baseline",
        sorted(devs3) == sorted(devs0),
        f"{sorted(devs3)}",
    )
finally:
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"br-isolate-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
