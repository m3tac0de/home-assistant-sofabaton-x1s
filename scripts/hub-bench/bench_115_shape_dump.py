"""P2 adapter grounding: dump the exact bundle shapes for a managed wifi
device (READ-ONLY — no writes).

Captures a structural (blob-free) bundle for the given managed wifi device
plus the given activities, and prints the substructures the in-place
baseline adapter must parse:

  - device block (name/brand/ip/idle keys)
  - command rows (command_id, name)
  - input_record entries (ordinal -> key_id)
  - device-scope power macros 198/199 (the power on/off command ids)
  - per-activity: referenced_source_device_ids, this device's
    favorite_slots / button_bindings rows, and the (dev,0xC5) input step
    inside the POWER_ON macro

Usage:
    python bench_115_shape_dump.py <ip> <X1|X1S> <tag> <device_id> [act_id ...]
"""

from __future__ import annotations

import json
import sys

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DEV = int(sys.argv[4], 0)
ACTS = [int(a, 0) for a in sys.argv[5:]] or [0x65, 0x66]

log_path = setup_logging(f"shape-dump-{TAG}")
print(f"logging to {log_path}")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "device_id": DEV}
try:
    bundle = proxy.backup_hub_bundle(device_ids=[DEV], include_blobs=False)
    entry = None
    for e in bundle.get("devices") or []:
        if int((e.get("device") or {}).get("device_id", -1)) == DEV:
            entry = e
    if entry is None:
        raise SystemExit(f"device 0x{DEV:02X} not in bundle")
    artifacts["device_entry"] = entry

    dev_block = entry.get("device") or {}
    print("\n== device block ==")
    print(json.dumps(dev_block, indent=1, default=str)[:900])
    print("\n== command rows (id, name) ==")
    for row in entry.get("commands") or []:
        print("  ", row.get("command_id"), repr(row.get("command_label") or row.get("name")))
    print("\n== input_record ==")
    print(json.dumps(entry.get("input_record"), indent=1, default=str)[:900])
    print("\n== device-scope macros ==")
    for m in entry.get("macros") or []:
        print("  macro", m.get("button_id", m.get("key_id")), "steps:", json.dumps(m.get("steps")))
    print("\n== device button_bindings ==")
    print(json.dumps(entry.get("button_bindings"), default=str)[:400])

    artifacts["activities"] = {}
    for act in ACTS:
        a = proxy.backup_activity(act)
        if not isinstance(a, dict):
            print(f"\nactivity 0x{act:02X}: unreadable")
            continue
        artifacts["activities"][f"0x{act:02X}"] = a
        print(f"\n== activity 0x{act:02X} ==")
        print("  members:", a.get("referenced_source_device_ids"))
        favs = [s for s in (a.get("favorite_slots") or []) if int(s.get("device_id", 0)) == DEV]
        binds = [b for b in (a.get("button_bindings") or []) if int(b.get("device_id", 0)) == DEV]
        print("  dev favorites:", json.dumps(favs))
        print("  dev bindings:", json.dumps(binds))
        for m in a.get("macros") or []:
            bid = m.get("button_id", m.get("key_id"))
            if bid in (198, 199):
                steps = [s for s in m.get("steps") or [] if int(s.get("device_id", -1)) == DEV]
                print(f"  macro {bid} dev-steps:", json.dumps(steps))
finally:
    path = save_json(f"shape-dump-{TAG}", artifacts)
    print("\nartifacts saved:", path)
    proxy.stop()
    print("disconnected")
