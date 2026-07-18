"""Backup/restore chunk 3: test the near-empty-activity purge hypothesis.

Chunk-3 probe found: a rich restored activity (4 members, 18 bindings)
SURVIVES a device-delete sweep, while the minimal restored "Bench Test"
(1 member, 0 bindings) is PURGED. This restores a single-member activity
enriched with N button bindings (referencing the sacrificial device), then
runs a device restore+delete cycle, reporting whether it survived — to
separate "single member" from "empty keymap" as the purge trigger.

Usage:
    python bench_66_purge_hypothesis.py <ip> <X1|X1S> <tag> <member_dev> <n_bindings>
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
MEMBER_DEVS = [int(x, 0) for x in sys.argv[4].split(",")]  # e.g. "0x09" or "1,9"
N_BINDINGS = int(sys.argv[5]) if len(sys.argv) > 5 else 5

BIND_BUTTON_IDS = [175, 176, 177, 179, 180, 181, 182, 183, 184, 185]

log_path = setup_logging(f"br-purgehyp-{TAG}")
print(f"logging to {log_path}")

baseline = json.loads((BENCH_DIR / f"br-baseline-act-{TAG}.json").read_text(encoding="utf-8"))

# Build a single-member activity (references MEMBER_DEV only) with N real
# bindings pointing at that device's commands.
payload = copy.deepcopy(baseline)
payload["device"]["name"] = "Purge Hyp"
payload["device"]["code_type"] = 0
payload["device"]["poll_time"] = -1
# Distribute the bindings round-robin across the requested member devices,
# so each member is actually referenced (establishes hub membership).
payload["button_bindings"] = [
    {
        "button_id": BIND_BUTTON_IDS[i],
        "button_name": f"K{i}",
        "device_id": MEMBER_DEVS[i % len(MEMBER_DEVS)],
        "command_id": (i // len(MEMBER_DEVS)) + 1,
        "long_press_device_id": None,
        "long_press_command_id": None,
    }
    for i in range(min(N_BINDINGS, len(BIND_BUTTON_IDS)))
]
# Rewrite macros + favorites so membership is EXACTLY MEMBER_DEVS (the
# baseline Bench Test macros/favorite reference device 9).
primary = MEMBER_DEVS[0]
payload["favorite_slots"] = []
payload["macros"] = [
    {"button_id": 198, "name": "POWER_ON",
     "steps": [{"device_id": primary, "command_id": 1, "button_code": 0,
                "duration": 0, "delay": 255}]},
    {"button_id": 199, "name": "POWER_OFF",
     "steps": [{"device_id": primary, "command_id": 2, "button_code": 0,
                "duration": 0, "delay": 255}]},
]
payload["referenced_source_device_ids"] = sorted(MEMBER_DEVS)
device_id_map = {d: d for d in MEMBER_DEVS}


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
artifacts: dict = {"host": HOST, "n_bindings": N_BINDINGS, "member_devs": MEMBER_DEVS}
try:
    print(f"restoring 'Purge Hyp' (members={[hex(d) for d in MEMBER_DEVS]}, {N_BINDINGS} bindings)...")
    result = proxy.restore_activity(payload, device_id_map=device_id_map)
    print(f"  restore: {result}")
    if not result or result.get("status") != "success":
        raise SystemExit("restore failed")
    hyp_id = int(result["activity_id"])
    artifacts["restore_result"] = result

    before = act_snapshot(proxy)
    print(f"activities before delete cycle: {before}")
    artifacts["before"] = before

    # throwaway device restore+delete
    dev_src = next(
        d for d in json.loads((BENCH_DIR / f"br-bundle-{TAG}.json").read_text("utf-8"))["devices"]
        if int(d["device"]["device_id"]) == 1
    )
    dp = copy.deepcopy(dev_src)
    dp["device"]["name"] = "Purge Cyc Dev"
    dres = proxy.restore_device(dp)
    new_dev = int(dres["device_id"])
    print(f"  throwaway device 0x{new_dev:02X} created; deleting...")
    proxy.delete_device(new_dev)

    after = act_snapshot(proxy)
    print(f"activities after delete cycle: {after}")
    artifacts["after"] = after

    survived = hyp_id in after
    artifacts["hyp_id"] = hyp_id
    artifacts["survived"] = survived
    print(
        f"\n=> single-member activity with {N_BINDINGS} bindings "
        f"{'SURVIVED' if survived else 'was PURGED'} the device-delete sweep"
    )
finally:
    path = save_json(f"br-purgehyp-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")
