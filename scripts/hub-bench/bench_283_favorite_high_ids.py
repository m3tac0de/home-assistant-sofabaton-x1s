"""Code review CR-L4b-7 (bench program BP1): favoriting a command id >= 0xE0.

The X1S/X2 favorite map carries the command's 48-bit code as
``00 00 00 00 4E <0x20 + id>``; for an id of 0xE0 or more the second byte
would pass 0xFF. The library now refuses those ids until this bench shows
what the hub takes. Candidate: the carried code ``0x4E20 + id`` (what the
binding writer sends), i.e. ``4F 00`` for 0xE0.

Steps: a throwaway IR device with commands 0xDF and 0xE0 (codes copied from
the source device), a throwaway activity holding it, a control favorite for
0xDF through the normal path, then 0xE0 with the carried code. Favorites are
read back; the activity and the device are deleted again.

Usage:
    python bench_283_favorite_high_ids.py <ip> <X1S|X2> <ir-source-device-id> [<low-id> <high-id>]
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
LOW, HIGH = (int(sys.argv[4], 0), int(sys.argv[5], 0)) if len(sys.argv) > 5 else (0xDF, 0xE0)


def carried_map_payload(self, *, activity_id, device_id, command_id, slot_id):
    """The map payload with the full carried code, for any id."""
    cmd_lo = command_id & 0xFF
    payload = bytearray([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, activity_id & 0xFF, slot_id & 0xFF,
                         device_id & 0xFF])
    payload += synthesize_command_code(cmd_lo).to_bytes(6, "big")
    payload += bytes([cmd_lo]) + bytes(8)
    payload.append((sum(payload) - 2) & 0xFF)
    return bytes(payload)


log_path = setup_logging(f"favorite-high-ids-{HUB_VERSION}")
print(f"logging to {log_path}")
proxy = connect(HOST, HUB_VERSION)
results: dict = {}
dev_id = act_id = None
try:
    source = proxy.backup_device(SOURCE_DEVICE, include_blobs=True) or {}
    template = next(c for c in source.get("commands") or [] if isinstance(c.get("restore_data"), dict))
    payload = copy.deepcopy(source)
    payload["device"] = {**payload["device"], "name": "Bench High Ids"}
    commands = []
    for cid in (LOW, HIGH):
        row = {**copy.deepcopy(template), "command_id": cid, "name": f"Cmd {cid:02X}"}
        # The map names the command by its code: give each command the
        # synthetic code the map sends, so only the carry is under test.
        row["restore_data"] = {**row["restore_data"], "button_code": synthesize_command_code(cid)}
        row["restore_data"].pop("command_code", None)
        commands.append(row)
    payload["commands"] = commands
    for key in ("button_bindings", "macros"):
        payload[key] = []
    payload.pop("input_record", None)
    payload.pop("key_sort", None)
    restored = proxy.restore_device(payload)
    print(f"device: {restored}")
    dev_id = int(restored["device_id"])

    created = proxy.create_activity("Bench High Ids")
    print(f"activity: {created}")
    act_id = int(created["activity_id"])
    print(f"add member: {proxy.add_device_to_activity(act_id, dev_id)}")

    control = proxy.command_to_favorite(act_id, dev_id, LOW)
    print(f"favorite 0x{LOW:02X} (normal path): {control}")
    results["control"] = control

    # The carried code for the high id (the library refuses it today).
    type(proxy)._build_favorite_map_payload = carried_map_payload
    high = proxy.command_to_favorite(act_id, dev_id, HIGH)
    print(f"favorite 0x{HIGH:02X} (carried code 0x{synthesize_command_code(HIGH):04X}): {high}")
    results["high"] = high

    time.sleep(2)
    back = proxy.backup_activity(act_id) or {}
    favorites = back.get("favorite_slots") or []
    for fav in favorites:
        print(f"  read back: {fav}")
    results["favorites"] = favorites
finally:
    if act_id is not None:
        print(f"cleanup: delete activity 0x{act_id:02X}: {proxy.delete_device(act_id)}")
    if dev_id is not None:
        print(f"cleanup: delete device 0x{dev_id:02X}: {proxy.delete_device(dev_id)}")
    proxy.request_devices()
    proxy.request_activities()
    time.sleep(4)
    devices, _ = proxy.get_devices(force_refresh=False)
    activities, _ = proxy.get_activities(force_refresh=False)
    print(f"devices now {sorted(devices or {})}, activities now {sorted(activities or {})}")
    save_json(f"favorite-high-ids-{HUB_VERSION}", results)
    proxy.stop()
