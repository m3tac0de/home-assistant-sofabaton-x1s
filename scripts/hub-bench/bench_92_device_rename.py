"""Rename program, chunk 3: validate the in-place device-rename executor.

Renames the sacrificial "test" device via the same code path live sync
uses (``_sync_step_device_rename``), then re-reads the device catalog and
asserts:
  - the target's name changed,
  - every OTHER device (name + class + brand) is untouched,
  - the target's record body is byte-identical to the original except in
    the name field (so no other device state was disturbed),
and finally restores the original name.

Usage:
    python bench_92_device_rename.py <ip> <X1|X1S> <tag> <device_id>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DEV_ID = int(sys.argv[4], 0)

NAME_OFF = 29
NAME_END = 90 if HUB_VERSION.upper() in ("X1S", "X2") else 59

log_path = setup_logging(f"dev-rename-{TAG}")
print(f"logging to {log_path}")


def snapshot(proxy):
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    devs = proxy.state.entities("device")
    out = {}
    for dev_id, info in devs.items():
        out[int(dev_id)] = {
            "name": info.get("name"),
            "device_class": info.get("device_class"),
            "brand": info.get("brand"),
            "raw_body": bytes(info["raw_body"]).hex() if isinstance(info.get("raw_body"), (bytes, bytearray)) else None,
        }
    return out


def _identity(entry):
    return (entry["name"], entry["device_class"], entry["brand"])


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "hub_version": HUB_VERSION, "device_id": DEV_ID}
try:
    before = snapshot(proxy)
    if DEV_ID not in before:
        raise SystemExit(f"device 0x{DEV_ID:02X} not present")
    original = str(before[DEV_ID]["name"])
    orig_raw = before[DEV_ID]["raw_body"]
    print(f"target 0x{DEV_ID:02X} original name={original!r}")
    artifacts["original_name"] = original

    new_name = "Renamed Dev" if original != "Renamed Dev" else "test"
    print(f"renaming -> {new_name!r}")
    ok = proxy._sync_step_device_rename({"device_id": DEV_ID, "name": new_name})
    print(f"  executor returned {ok}")
    artifacts["rename_ok"] = bool(ok)
    time.sleep(0.6)

    after = snapshot(proxy)
    tgt = after.get(DEV_ID, {})
    renamed = tgt.get("name") == new_name
    others_intact = all(
        _identity(after[d]) == _identity(before[d]) for d in before if d != DEV_ID and d in after
    ) and set(after) == set(before)

    # Body diff: only the name window [NAME_OFF:NAME_END] and the trailing
    # checksum byte may differ from the original.
    body_ok = None
    if orig_raw and tgt.get("raw_body"):
        a = bytes.fromhex(orig_raw)
        b = bytes.fromhex(tgt["raw_body"])
        if len(a) == len(b):
            diffs = [i for i in range(len(a)) if a[i] != b[i]]
            outside = [i for i in diffs if not (NAME_OFF <= i < NAME_END) and i != len(a) - 1]
            body_ok = not outside
            artifacts["diff_indices"] = diffs
            artifacts["diff_outside_name"] = outside

    print(f"{'OK  ' if renamed else 'FAIL'} device renamed to {new_name!r}")
    print(f"{'OK  ' if others_intact else 'FAIL'} other devices intact")
    print(f"{'OK  ' if body_ok else 'FAIL' if body_ok is not None else '??  '} record body changed only in name+checksum")
    artifacts.update(renamed=renamed, others_intact=others_intact, body_ok=body_ok, after_name=tgt.get("name"))

    print(f"restoring name -> {original!r}")
    proxy._sync_step_device_rename({"device_id": DEV_ID, "name": original})
    time.sleep(0.6)
    restored = snapshot(proxy)
    artifacts["restored_ok"] = restored.get(DEV_ID, {}).get("name") == original
    print(f"restored name={restored.get(DEV_ID, {}).get('name')!r}")
finally:
    save_json(f"dev-rename-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
