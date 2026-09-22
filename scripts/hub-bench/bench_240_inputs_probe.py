"""Inputs program, probe: read one device's inputs page in isolation.

Reads the family-0x46 record of a device several times with nothing else
on the wire, then once more right after a buttons request (the order a
structural device capture uses), and prints what each read returned. Used
to tell a hub that really holds no page from a reply that was attributed
to the wrong request.

Usage:
    python bench_240_inputs_probe.py <ip> <X1|X1S> <tag> <device_id>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DEV_ID = int(sys.argv[4], 0)

log_path = setup_logging(f"inputs-probe-{TAG}")
print(f"logging to {log_path}")


def brief(record):
    if not isinstance(record, dict):
        return record
    return {
        "source_id_byte": record.get("source_id_byte"),
        "entries": [(e.get("command_id"), e.get("input_index"), e.get("name")) for e in record.get("entries") or []],
    }


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "hub_version": HUB_VERSION, "device_id": DEV_ID, "reads": []}
try:
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    device = proxy.state.entities("device").get(DEV_ID) or {}
    print(f"device 0x{DEV_ID:02X} name={device.get('name')!r} input_mode={device.get('input_mode')}")
    artifacts["input_mode"] = device.get("input_mode")

    for attempt in range(3):
        record = proxy.fetch_device_input_record(DEV_ID)
        print(f"  isolated read {attempt + 1}: {brief(record)}")
        artifacts["reads"].append({"kind": "isolated", "record": brief(record)})
        time.sleep(1.0)

    # The capture order: commands, buttons, then inputs.
    capture = proxy.backup_device(DEV_ID, include_blobs=False) if hasattr(proxy, "backup_device") else None
    if isinstance(capture, dict):
        print(f"  capture input_record: {brief(capture.get('input_record'))}")
        artifacts["reads"].append({"kind": "capture", "record": brief(capture.get("input_record"))})
    record = proxy.fetch_device_input_record(DEV_ID)
    print(f"  isolated read after the capture: {brief(record)}")
    artifacts["reads"].append({"kind": "isolated_after_capture", "record": brief(record)})
finally:
    save_json(f"inputs-probe-{TAG}", artifacts)
    proxy.stop()
