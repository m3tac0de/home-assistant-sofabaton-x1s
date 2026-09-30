"""Code review CR-L2-5 (bench program BP2): does the power byte follow power setup?

A device created through Add device is written with the record-tail power
byte (power_mode) 0, and backup_device skips a device's macros while that
byte reads "not power-configured". This creates a device from the same
empty Add-device payload (plus two commands so the power macros have a
step), reads the byte, sets power up the way the editor does (idle
behaviour write, POWER_ON/POWER_OFF macros), and reads the byte again,
plus whether backup_device then exports the macros. The device is deleted.

Usage:
    python bench_287_power_byte.py <ip> <X1|X1S> <ir-source-device-id>
"""

from __future__ import annotations

import copy
import sys
import time

import bench_common  # noqa: F401  (loads the lib as x1slib)
from bench_common import connect, save_json, setup_logging
from x1slib.device_class_profiles import build_empty_device_payload
from x1slib.device_create import (
    build_macro_step,
    build_macro_step_record,
    run_create_sequence,
    synthesize_command_code,
)
from x1slib.devices import parse_device_record

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
SOURCE_DEVICE = int(sys.argv[3], 0)


def power_byte(proxy, dev_id: int) -> dict:
    proxy.request_devices()
    time.sleep(3)
    row = (proxy.state.entities("device") or {}).get(dev_id) or {}
    raw = row.get("raw_body")
    config = parse_device_record(raw, hub_version=HUB_VERSION) if raw else None
    return {
        "power_mode": getattr(config, "power_mode", None),
        "is_power_configured": getattr(config, "is_power_configured", None),
        "idle_behavior": proxy.get_idle_behavior(dev_id, fetch_if_missing=False)[0],
    }


log_path = setup_logging(f"power-byte-{HUB_VERSION}")
print(f"logging to {log_path}")
proxy = connect(HOST, HUB_VERSION)
results: dict = {}
dev_id = None
try:
    source = proxy.backup_device(SOURCE_DEVICE, include_blobs=True) or {}
    template = next(c for c in source.get("commands") or [] if isinstance(c.get("restore_data"), dict))
    payload = build_empty_device_payload("Bench Power", "ir", hub_version=HUB_VERSION)
    payload["commands"] = []
    for cid in (1, 2):
        row = {**copy.deepcopy(template), "command_id": cid, "name": f"Cmd {cid}"}
        row["restore_data"] = {**row["restore_data"], "button_code": synthesize_command_code(cid)}
        row["restore_data"].pop("command_code", None)
        payload["commands"].append(row)
    print(f"payload power_mode: {(payload.get('device') or {}).get('power_mode')}")
    dev_id = int(proxy.restore_device(payload)["device_id"])
    results["after_create"] = power_byte(proxy, dev_id)
    print(f"after create: {results['after_create']}")

    print(f"idle behaviour 1: {proxy.set_idle_behavior(dev_id, 1)}")
    steps = []
    for key_id, label, cid in ((198, "POWER_ON", 1), (199, "POWER_OFF", 2)):
        record = build_macro_step_record(device_id=dev_id, command_id=cid,
                                         fid=synthesize_command_code(cid), duration=0, delay=0xFF)
        steps.append(build_macro_step(hub_version=HUB_VERSION, device_id=dev_id, key_id=key_id,
                                      label=label, step_records=record))
    proxy.reset_ack_queues()
    outcome = run_create_sequence(proxy, steps)
    print(f"power macros: success={outcome.success} rejected={outcome.rejected}")
    time.sleep(2)
    results["after_power_setup"] = power_byte(proxy, dev_id)
    print(f"after power setup: {results['after_power_setup']}")

    back = proxy.backup_device(dev_id, include_blobs=False) or {}
    macros = [m.get("button_id") for m in back.get("macros") or []]
    results["backup_macros"] = macros
    print(f"backup_device macros: {macros}")
finally:
    if dev_id is not None:
        proxy.delete_device(dev_id)
    proxy.request_devices()
    time.sleep(4)
    devices, _ = proxy.get_devices(force_refresh=False)
    print(f"devices now {sorted(devices or {})}")
    save_json(f"power-byte-{HUB_VERSION}", results)
    proxy.stop()
