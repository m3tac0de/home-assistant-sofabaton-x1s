"""Code review CR-R1-10 / CR-L5-7 (bench program BP2): long-press-only rows.

A binding row whose short press is empty (command 0) but whose long press
targets a real command: restore skips such rows (counted as
skipped_button_bindings since wave 1) and the activity export drops them.
This asks the hub whether it takes such a row back, on a device page and on
an activity page, and records what reads back through the engine's own
readers (backup rows and the raw button details).

A throwaway IR device (two commands, codes copied from the source device)
and a throwaway activity holding it; both deleted again.

Usage:
    python bench_286_long_press_only_rows.py <ip> <X1|X1S> <ir-source-device-id>
"""

from __future__ import annotations

import copy
import sys
import time

import bench_common  # noqa: F401  (loads the lib as x1slib)
from bench_common import connect, save_json, setup_logging
from x1slib.device_create import build_button_binding_step, run_create_sequence, synthesize_command_code
from x1slib.protocol_const import ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
SOURCE_DEVICE = int(sys.argv[3], 0)
DEVICE_BUTTON = int(ButtonName.VOL_UP)
ACTIVITY_BUTTON = int(ButtonName.CH_UP)


def long_press_only(owner: int, button: int, target: int) -> object:
    return build_button_binding_step(
        device_id=owner,
        button_id=button,
        short_press_device_id=target,
        short_press_button_code=0,
        short_press_button_id=0,
        long_press_device_id=target,
        long_press_button_code=synthesize_command_code(2),
        long_press_button_id=2,
    )


def rows_for(backup: dict, button: int) -> list:
    return [r for r in backup.get("button_bindings") or [] if int(r.get("button_id") or 0) == button]


log_path = setup_logging(f"long-press-only-{HUB_VERSION}")
print(f"logging to {log_path}")
proxy = connect(HOST, HUB_VERSION)
results: dict = {}
dev_id = act_id = None
try:
    source = proxy.backup_device(SOURCE_DEVICE, include_blobs=True) or {}
    template = next(c for c in source.get("commands") or [] if isinstance(c.get("restore_data"), dict))
    payload = copy.deepcopy(source)
    payload["device"] = {**payload["device"], "name": "Bench LP Only"}
    commands = []
    for cid in (1, 2):
        row = {**copy.deepcopy(template), "command_id": cid, "name": f"Cmd {cid}"}
        row["restore_data"] = {**row["restore_data"], "button_code": synthesize_command_code(cid)}
        row["restore_data"].pop("command_code", None)
        commands.append(row)
    payload["commands"] = commands
    for key in ("button_bindings", "macros"):
        payload[key] = []
    payload.pop("input_record", None)
    payload.pop("key_sort", None)
    dev_id = int(proxy.restore_device(payload)["device_id"])
    act_id = int(proxy.create_activity("Bench LP Only")["activity_id"])
    proxy.add_device_to_activity(act_id, dev_id)
    print(f"device 0x{dev_id:02X}, activity 0x{act_id:02X}")

    for label, owner, button in (("device", dev_id, DEVICE_BUTTON), ("activity", act_id, ACTIVITY_BUTTON)):
        proxy.reset_ack_queues()
        outcome = run_create_sequence(proxy, [long_press_only(owner, button, dev_id)])
        print(f"{label} row write: success={outcome.success} rejected={outcome.rejected}")
        proxy.clear_entity_cache(owner, clear_buttons=True, clear_favorites=True)
        time.sleep(1)
        back = (proxy.backup_device(owner, include_blobs=False) if label == "device"
                else proxy.backup_activity(owner)) or {}
        exported = rows_for(back, button)
        raw = (proxy.state.button_details.get(owner) or {}).get(button)
        print(f"  exported rows: {exported}")
        print(f"  raw details:   {raw}")
        results[label] = {"success": outcome.success, "rejected": outcome.rejected,
                          "exported": exported, "raw": raw}
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
    save_json(f"long-press-only-{HUB_VERSION}", results)
    proxy.stop()
