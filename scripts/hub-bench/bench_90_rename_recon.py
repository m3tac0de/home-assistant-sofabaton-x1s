"""Rename program, chunk 1: recon the entity-record name layout.

Goal: pin the byte offset + encoding of the *name* field inside the
activity and device record rows, so the in-place rename executors can do
a safe read-modify-write:

- activity rename → OP_ACTIVITY_CONFIRM (0x7B38) on X1 /
  OP_ACTIVITY_ASSIGN_FINALIZE (0xD538) on X1S/X2, and
- device rename → the device-record write (candidate 0x7B08, to be
  confirmed against a live capture in a later chunk).

X1 names are ASCII; X1S/X2 names are UTF-16BE inside a larger record.
This script dumps the cached raw row payloads next to the parsed names so
the exact name window is visible for each model.

Usage:
    python bench_90_rename_recon.py <ip> <X1|X1S|X2> <tag>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

log_path = setup_logging(f"rename-recon-{TAG}")
print(f"logging to {log_path}")


def _hex(value) -> str:
    return bytes(value).hex(" ") if isinstance(value, (bytes, bytearray)) else ""


def _find_name_window(raw: bytes, name: str) -> dict:
    """Best-effort locate the name inside the raw row, ASCII and UTF-16BE."""
    out: dict = {}
    if not name:
        return out
    ascii_bytes = name.encode("ascii", errors="ignore")
    if ascii_bytes:
        idx = raw.find(ascii_bytes)
        if idx >= 0:
            out["ascii_offset"] = idx
    u16 = name.encode("utf-16-be")
    idx = raw.find(u16)
    if idx >= 0:
        out["utf16be_offset"] = idx
    return out


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION}
try:
    proxy._refresh_catalog("activities", timeout=15.0)
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(1.0)

    activities = proxy.get_activities(force_refresh=False)[0] or {}
    devices = proxy.get_devices()[0] or {}

    act_rows = getattr(proxy, "_activity_row_payloads", {}) or {}
    act_dump = []
    for act_lo, info in sorted(activities.items()):
        name = info.get("name") if isinstance(info, dict) else str(info)
        raw = act_rows.get(int(act_lo))
        entry = {
            "id": int(act_lo),
            "name": name,
            "raw_len": len(raw) if isinstance(raw, (bytes, bytearray)) else None,
            "raw_hex": _hex(raw),
        }
        if isinstance(raw, (bytes, bytearray)) and name:
            entry["name_window"] = _find_name_window(bytes(raw), str(name))
        act_dump.append(entry)

    dev_rows = getattr(proxy, "_device_pending_rows", {}) or {}
    dev_dump = []
    for dev_lo, info in sorted(devices.items()):
        name = info.get("name") if isinstance(info, dict) else str(info)
        row = dev_rows.get(int(dev_lo)) or {}
        raw = row.get("raw") or row.get("payload")
        entry = {
            "id": int(dev_lo),
            "name": name,
            "raw_len": len(raw) if isinstance(raw, (bytes, bytearray)) else None,
            "raw_hex": _hex(raw),
        }
        if isinstance(raw, (bytes, bytearray)) and name:
            entry["name_window"] = _find_name_window(bytes(raw), str(name))
        dev_dump.append(entry)

    artifacts["activities"] = act_dump
    artifacts["devices"] = dev_dump
    print(f"activities: {[(e['id'], e['name'], e.get('name_window')) for e in act_dump]}")
    print(f"devices:    {[(e['id'], e['name'], e.get('name_window')) for e in dev_dump]}")
finally:
    save_json(f"rename-recon-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
