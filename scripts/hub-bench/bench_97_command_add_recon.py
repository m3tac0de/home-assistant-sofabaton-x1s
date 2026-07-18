"""Command-add program, chunk 1: recon devices for sacrificial targets.

The new ``command_add`` device-sync step (live editor "Add command" dialog)
composes three bench-validated primitives — descriptive-IR synthesis +
``persist_ir_blob``, ``persist_command_record`` with a cloned
``library_type``, and the family-0x61 sort registration — but the
composition (fresh record write from ``sync_device``) is unvalidated.

This chunk enumerates every device with its class, command occupancy, and
cached record metadata (library_type / button_code / sort_id) so later
chunks can pick:

- an IR device to clone into a sacrificial bench device (adds run against
  the clone; cleanup = delete the clone), and
- whether a non-production wifi-class device exists for the cloned-trailer
  decoded-add path.

Usage:
    python bench_97_command_add_recon.py <ip> <X1|X1S|X2> <tag>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

log_path = setup_logging(f"cmd-add-recon-{TAG}")
print(f"logging to {log_path}")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION}
try:
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(1.0)
    devices = proxy.get_devices()[0] or {}

    dump = []
    for dev_lo, info in sorted(devices.items()):
        dev_lo = int(dev_lo)
        name = info.get("name") if isinstance(info, dict) else str(info)
        device_class = (info or {}).get("device_class") if isinstance(info, dict) else None
        # The command fetch is async (burst); poll until the list is complete.
        labels, complete = proxy.get_commands_for_entity(dev_lo, fetch_if_missing=True)
        deadline = time.time() + 15.0
        while not complete and time.time() < deadline:
            time.sleep(0.5)
            labels, complete = proxy.get_commands_for_entity(dev_lo, fetch_if_missing=True)
        metadata = (proxy.state.command_metadata.get(dev_lo) or {})
        commands = []
        for cmd_lo in sorted(dict(labels)):
            meta = metadata.get(int(cmd_lo)) or {}
            commands.append({
                "command_id": int(cmd_lo),
                "name": dict(labels).get(cmd_lo),
                "library_type": meta.get("library_type"),
                "button_code": meta.get("button_code"),
                "sort_id": meta.get("sort_id"),
            })
        dump.append({
            "id": dev_lo,
            "name": name,
            "device_class": device_class,
            "commands_complete": bool(complete),
            "command_count": len(commands),
            "commands": commands,
        })
        print(f"dev 0x{dev_lo:02X} {str(name)!r:24} class={device_class} "
              f"cmds={len(commands)} lib_types={sorted({c['library_type'] for c in commands})}")

    artifacts["devices"] = dump
finally:
    save_json(f"cmd-add-recon-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
