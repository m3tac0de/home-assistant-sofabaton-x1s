"""Code review CR-L4b-7 (bench program BP1): which command ids can be favorites.

bench_283 showed the X1S refusing a favorite map for command ids 0xDF and
0xE0 (STATUS_ACK 0x09) while ids 0x01/0x02 on the same throwaway device and
activity were accepted. This probes a spread of ids on one throwaway device
and activity: each id is favorited through the normal path and the outcome
recorded; the activity and the device are deleted again.

Usage:
    python bench_285_favorite_id_limit.py <ip> <X1S|X2> <ir-source-device-id> <id> [<id> ...]
"""

from __future__ import annotations

import copy
import sys
import time

import bench_common  # noqa: F401  (loads the lib as x1slib)
from bench_common import connect, save_json, setup_logging
from x1slib.device_create import synthesize_command_code

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
SOURCE_DEVICE = int(sys.argv[3], 0)
IDS = [int(v, 0) for v in sys.argv[4:]]

log_path = setup_logging(f"favorite-id-limit-{HUB_VERSION}")
print(f"logging to {log_path}")
proxy = connect(HOST, HUB_VERSION)
results: dict = {}
dev_id = act_id = None
try:
    source = proxy.backup_device(SOURCE_DEVICE, include_blobs=True) or {}
    template = next(c for c in source.get("commands") or [] if isinstance(c.get("restore_data"), dict))
    payload = copy.deepcopy(source)
    payload["device"] = {**payload["device"], "name": "Bench Fav Ids"}
    commands = []
    for cid in IDS:
        row = {**copy.deepcopy(template), "command_id": cid, "name": f"Cmd {cid:02X}"}
        row["restore_data"] = {**row["restore_data"], "button_code": synthesize_command_code(cid)}
        row["restore_data"].pop("command_code", None)
        commands.append(row)
    payload["commands"] = commands
    for key in ("button_bindings", "macros"):
        payload[key] = []
    payload.pop("input_record", None)
    payload.pop("key_sort", None)
    restored = proxy.restore_device(payload)
    dev_id = int(restored["device_id"])
    act_id = int(proxy.create_activity("Bench Fav Ids")["activity_id"])
    proxy.add_device_to_activity(act_id, dev_id)
    for cid in IDS:
        if cid >= 0xE0:
            print(f"0x{cid:02X}: skipped (the library refuses it; bench_283 covers the carry)")
            continue
        outcome = proxy.command_to_favorite(act_id, dev_id, cid)
        verdict = "accepted" if outcome else "refused"
        print(f"0x{cid:02X} ({cid}): {verdict}")
        results[f"0x{cid:02X}"] = verdict
    time.sleep(1)
    back = proxy.backup_activity(act_id) or {}
    results["read_back"] = back.get("favorite_slots")
    print(f"read back: {[(f.get('command_id')) for f in back.get('favorite_slots') or []]}")
finally:
    if act_id is not None:
        proxy.delete_device(act_id)
    if dev_id is not None:
        proxy.delete_device(dev_id)
    proxy.request_devices()
    proxy.request_activities()
    time.sleep(4)
    devices, _ = proxy.get_devices(force_refresh=False)
    activities, _ = proxy.get_activities(force_refresh=False)
    print(f"devices now {sorted(devices or {})}, activities now {sorted(activities or {})}")
    save_json(f"favorite-id-limit-{HUB_VERSION}", results)
    proxy.stop()
