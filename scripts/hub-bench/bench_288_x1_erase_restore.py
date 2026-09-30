"""Code review bench program BP2 (X1, erase-class): backup, replacing restore, compare.

Destructive: the hub is erased and rebuilt from its own backup. The backup
is saved to out/ before anything is written.

Checks, all through the AsyncXProxy facade (the server's path):
- CR-L4a-10: a whole-hub backup reads each catalog once (counted
  REQ_DEVICES / REQ_ACTIVITIES frames), not once per entity;
- CR-L4a-7: the erase's first reply (opcode, status byte) is recorded;
- CR-L4a-9: the restore refreshes the destination catalog once per bundle
  and leaves no new burst listeners behind;
- CR-X1-4: a replacing restore applies the bundle's hub name;
- the rebuilt hub is compared with the original backup (names, classes,
  command/binding/macro/favorite counts per entity).

Usage:
    python bench_288_x1_erase_restore.py <ip> <X1>
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from pathlib import Path

import bench_common  # noqa: F401  (loads the lib under the x1slib alias)
from bench_common import BENCH_DIR, save_json, setup_logging
from x1slib import AsyncXProxy, HubConfig  # noqa: E402
from x1slib.protocol_const import OP_REQ_ACTIVITIES, OP_REQ_DEVICES  # noqa: E402

HOST = sys.argv[1]
HVER = sys.argv[2]


def summary(bundle: dict) -> dict:
    devices = {}
    for row in bundle.get("devices") or []:
        block = row.get("device") or {}
        devices[str(block.get("name"))] = {
            "class": block.get("device_class"),
            "commands": len(row.get("commands") or []),
            "bindings": len(row.get("button_bindings") or []),
            "macros": len(row.get("macros") or []),
            "inputs": len((row.get("input_record") or {}).get("entries") or []),
        }
    activities = {}
    for row in bundle.get("activities") or []:
        block = row.get("device") or {}
        activities[str(block.get("name"))] = {
            "members": len(row.get("referenced_source_device_ids") or []),
            "bindings": len(row.get("button_bindings") or []),
            "favorites": len(row.get("favorite_slots") or []),
            "macros": len(row.get("macros") or []),
        }
    return {"hub": (bundle.get("hub") or {}).get("name"), "devices": devices, "activities": activities}


async def main() -> dict:
    report: dict = {"steps": [], "problems": []}
    cfg = HubConfig(host=HOST, hub_version=HVER, proxy_enabled=False, source="manual")
    proxy = AsyncXProxy.from_config(cfg, diag_dump=True, diag_parse=True)
    engine = proxy._proxy  # noqa: SLF001  bench-only instrumentation

    reads = {"devices": 0, "activities": 0}
    original_send = engine._send_cmd_frame

    def counting_send(opcode, payload=b"", *args, **kwargs):
        if opcode == OP_REQ_DEVICES:
            reads["devices"] += 1
        elif opcode == OP_REQ_ACTIVITIES:
            reads["activities"] += 1
        return original_send(opcode, payload, *args, **kwargs)

    engine._send_cmd_frame = counting_send
    erase_replies: list = []
    original_wait_any = engine.wait_for_any_response

    def recording_wait_any(*args, **kwargs):
        result = original_wait_any(*args, **kwargs)
        erase_replies.append(None if result is None else (hex(result[0]), bytes(result[1]).hex(" ")))
        return result

    engine.wait_for_any_response = recording_wait_any

    def listeners() -> int:
        return sum(len(v) for v in engine._burst.listeners.values())

    def step(name: str, **fields) -> None:
        report["steps"].append({"step": name, **fields})
        print(f"[{name}] " + ", ".join(f"{k}={v}" for k, v in fields.items()))

    async with proxy:
        if not await proxy.wait_connected(timeout=60) or not await proxy.wait_until_ready(timeout=90):
            report["problems"].append("hub never ready")
            return report

        reads.update(devices=0, activities=0)
        t0 = time.monotonic()
        original = await proxy.backup(include_blobs=True)
        step("backup", secs=round(time.monotonic() - t0, 1), catalog_reads=dict(reads),
             devices=len(original.get("devices") or []), activities=len(original.get("activities") or []))
        path = BENCH_DIR / f"x1-backup-before-erase-{time.strftime('%Y%m%d-%H%M%S')}.json"
        path.write_text(json.dumps(original, indent=2, default=str), encoding="utf-8")
        step("saved", path=str(path))
        if not original.get("complete"):
            report["problems"].append("the backup is incomplete; not erasing")
            return report

        reads.update(devices=0, activities=0)
        listeners_before = listeners()
        t0 = time.monotonic()
        result = await proxy.restore(original, replace=True)
        step("restore", secs=round(time.monotonic() - t0, 1), ok=result.ok, failed_at=result.failed_at,
             restored_devices=result.restored_devices, restored_activities=result.restored_activities,
             hub_name=result.hub_name, hub_name_restored=result.hub_name_restored,
             catalog_reads=dict(reads), new_listeners=listeners() - listeners_before)
        step("erase_first_reply", reply=erase_replies[0] if erase_replies else None)
        if not result.ok:
            report["problems"].append(f"restore failed at {result.failed_at}; recover from {path}")
            return report

        after = await proxy.backup(include_blobs=True)
        want, got = summary(original), summary(after)
        report["before"], report["after"] = want, got
        for kind in ("devices", "activities"):
            for name in sorted(set(want[kind]) | set(got[kind])):
                if want[kind].get(name) != got[kind].get(name):
                    report["problems"].append(f"{kind} {name!r}: {want[kind].get(name)} -> {got[kind].get(name)}")
        if want["hub"] != got["hub"]:
            report["problems"].append(f"hub name {want['hub']!r} -> {got['hub']!r}")
        step("compare", problems=len(report["problems"]))
    return report


if __name__ == "__main__":
    log_path = setup_logging(f"x1-erase-restore-{HVER}")
    print(f"logging to {log_path}")
    report = asyncio.run(main())
    for problem in report["problems"]:
        print("PROBLEM:", problem)
    print(f"saved {save_json(f'x1-erase-restore-{HVER}', report)}")
