"""Backup/restore chunk 2: restore the "Bench Test" activity, sanitized.

Restores the permanent sacrificial activity from its chunk-1 baseline
with ``code_type`` forced to 0 (app-created activity rows carry 0; the
engine-created original carried 13, which is the suspected trigger for
the X1's device-delete consistency sweep purging the activity). A later
bench_62 run with a device delete then tests survival.

Usage:
    python bench_63_bench_test_restore.py <ip> <X1|X1S> <tag>
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

log_path = setup_logging(f"br-bt-restore-{TAG}")
print(f"logging to {log_path}")

baseline = json.loads(
    (BENCH_DIR / f"br-baseline-act-{TAG}.json").read_text(encoding="utf-8")
)
payload = copy.deepcopy(baseline)
payload["device"]["code_type"] = 0
# App-born activity rows carry poll_time 0xFC ("unset", parsed as -1);
# the engine-created original wrote 0. Match the app shape.
payload["device"]["poll_time"] = -1

if "--binding" in sys.argv:
    # Experiment: give the activity one real button binding (UP -> the
    # sacrificial device's command 1). Hypothesis: the X1 device-delete
    # sweep purges activities whose keymap table is empty.
    ref = int((payload.get("referenced_source_device_ids") or [9])[0])
    payload["button_bindings"] = [
        {
            "button_id": 174,
            "button_name": "UP",
            "device_id": ref,
            "command_id": 1,
            "long_press_device_id": None,
            "long_press_command_id": None,
        }
    ]
refs = payload.get("referenced_source_device_ids") or []
device_id_map = {int(d): int(d) for d in refs}

proxy = connect(HOST, HUB_VERSION)
try:
    acts, _ = proxy.get_activities(force_refresh=False)
    if any(
        (v.get("name") if isinstance(v, dict) else v) == "Bench Test"
        for v in (acts or {}).values()
    ):
        sys.exit("Bench Test already present — refusing to create a duplicate")

    result = proxy.restore_activity(payload, device_id_map=device_id_map)
    print("restore_activity:", result)
    if not result or result.get("status") != "success":
        sys.exit(1)

    if "--members" in sys.argv:
        # Experiment: register the restored activity's member devices via
        # ACTIVITY_DEVICE_CONFIRM (0x024F) rows — the write the assign
        # flow uses and restore_activity never sends. Hypothesis: the hub
        # purges member-less activities during the device-delete sweep.
        act_lo = int(result["activity_id"]) & 0xFF
        members = sorted(d for d in device_id_map.values() if d < 0x65)
        if not proxy.request_activity_mapping(act_lo):
            sys.exit("activity mapping request failed")
        proxy._wait_for_activity_map_burst(act_lo, timeout=5.0)
        proxy.reset_ack_queues()
        for member in members:
            send_ts = time.monotonic()
            proxy._send_cmd_frame(0x024F, bytes([member & 0xFF, 0x00]))
            ack = proxy.wait_for_ack_any(
                [(0x0103, None)], timeout=5.0, not_before=send_ts
            )
            print(f"member confirm dev=0x{member:02X} ack={ack is not None}")
            if ack is None:
                sys.exit("member confirm not acked")

    if "--confirm" in sys.argv:
        # Experiment: send the X1 activity confirmation row (0x7B38) the
        # official app ends activity creation with — restore_activity
        # currently never sends it, which is the suspected reason the
        # hub purges the activity on the next device-delete sweep.
        act_lo = int(result["activity_id"]) & 0xFF
        confirm_payload = proxy._build_activity_confirm_payload(act_lo)
        if confirm_payload is None:
            sys.exit("could not build confirm payload")
        step = proxy._send_step(
            step_name=f"activity-confirm[act=0x{act_lo:02X}]",
            family=0x38,
            payload=confirm_payload,
            ack_opcode=0x0103,
            timeout=10.0,
        )
        print("confirm step ok:", step.ok)
        if not step.ok:
            sys.exit("activity confirm not acked")

    proxy._refresh_catalog("activities", timeout=15.0)
    deadline = time.time() + 10
    acts = None
    while time.time() < deadline:
        acts, ready = proxy.get_activities(force_refresh=False)
        if ready:
            break
        time.sleep(0.3)
    names = {
        int(k): (v.get("name") if isinstance(v, dict) else v)
        for k, v in (acts or {}).items()
    }
    print("activities:", names)
    save_json(f"br-bt-restore-{TAG}", {"restore_result": result, "activities": names})
    if "Bench Test" not in names.values():
        sys.exit("Bench Test not visible after restore")
    print("Bench Test restored (code_type=0)")
finally:
    proxy.stop()
    print("disconnected")
