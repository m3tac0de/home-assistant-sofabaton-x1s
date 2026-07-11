"""Activity program prerequisite: create the sacrificial activity via
``restore_activity`` (the plan's alternative to app-side creation, so the
restore/create path gets live validation too).

Builds a minimal ``activity_backup`` payload from the sacrificial device's
real commands (one binding on 0x58, POWER_ON/POWER_OFF macros with one
step each), then restores it. Plan: docs/internal/activity-sync-bench-plan.md.

Usage: bench_11_activity_create.py <ip> <X1|X1S|X2> <tag> <sacrificial_dev_id>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

from x1slib.hub_versions import ACTIVITY_BACKUP_SCHEMA_VERSION

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DEV_ID = int(sys.argv[4], 0)

log_path = setup_logging(f"act-create-{TAG}")
print(f"logging to {log_path}")

proxy = connect(HOST, HUB_VERSION)
try:
    print(f"connected; backing up sacrificial device 0x{DEV_ID:02X} (with blobs)...")
    dev_payload = proxy.backup_device(DEV_ID, include_blobs=True)
    if not dev_payload:
        raise SystemExit(f"device 0x{DEV_ID:02X} not found")

    commands = [
        row
        for row in (dev_payload.get("commands") or [])
        if int(row.get("command_id", 0)) & 0xFF
    ]
    if len(commands) < 2:
        raise SystemExit(
            f"device 0x{DEV_ID:02X} has {len(commands)} usable commands; need 2"
        )

    metadata = proxy.state.command_metadata.get(DEV_ID & 0xFF, {})

    def _button_code(row):
        cmd_id = int(row.get("command_id", 0)) & 0xFF
        meta = metadata.get(cmd_id) or {}
        code = int(meta.get("button_code", 0))
        if not code:
            restore_data = row.get("restore_data") or {}
            raw = restore_data.get("button_code", 0)
            code = int(raw, 16) if isinstance(raw, str) else int(raw or 0)
        return code & 0xFFFFFFFFFFFF

    cmd_on, cmd_off = commands[0], commands[1]
    for label, row in (("on", cmd_on), ("off", cmd_off)):
        print(
            f"  step[{label}]: command_id={int(row['command_id'])} "
            f"name={row.get('name')!r} button_code=0x{_button_code(row):012X}"
        )

    payload = {
        "kind": "activity_backup",
        "schema_version": ACTIVITY_BACKUP_SCHEMA_VERSION,
        "device": {
            "entity_type": "activity",
            "device_id": 0x65,
            "name": "Bench Test",
            "brand": "",
            "icon": 1,
            "sort": 0,
            "code_type": 0x0D,
            "device_type": 0x00,
            "hide": 0,
            "input_flag": 0,
            "channel": 0,
            "power_state": 0,
            "ip_address": None,
            "poll_time": 0,
            "input_mode": 0,
            "power_mode": 0,
            "power_style": 0,
            "share_mode": 0,
        },
        "button_bindings": [
            {
                "button_id": 0x58,
                "device_id": DEV_ID,
                "command_id": int(cmd_on["command_id"]),
            },
        ],
        "macros": [
            {
                "button_id": 0xC6,
                "name": "POWER_ON",
                "steps": [
                    {
                        "device_id": DEV_ID,
                        "command_id": int(cmd_on["command_id"]),
                        "button_code": _button_code(cmd_on),
                    },
                ],
            },
            {
                "button_id": 0xC7,
                "name": "POWER_OFF",
                "steps": [
                    {
                        "device_id": DEV_ID,
                        "command_id": int(cmd_off["command_id"]),
                        "button_code": _button_code(cmd_off),
                    },
                ],
            },
        ],
        "favorite_slots": [],
    }

    print("restoring activity 'Bench Test'...")
    result = proxy.restore_activity(payload, device_id_map={DEV_ID: DEV_ID})
    print("restore result:", result)
    save_json(f"act-create-{TAG}", {"payload": payload, "result": result})

    proxy.request_activities()
    deadline = time.time() + 20
    acts = None
    while time.time() < deadline:
        acts, ready = proxy.get_activities(force_refresh=False)
        if ready:
            break
        time.sleep(0.5)
    print("activities now:")
    for aid, value in sorted((acts or {}).items()):
        name = value.get("name") if isinstance(value, dict) else value
        print(f"  0x{int(aid):02X} ({int(aid)}): {name!r}")
finally:
    proxy.stop()
    print("disconnected")
