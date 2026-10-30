"""bench_341: the IR pill's Home Assistant path on the X2 (IR6).

Plan: docs/internal/ir-emitter-pill-plan.md, IR6. Drives the deployed HA
instance's own APIs only (the X2's HA entry stays ON; no direct hub
connection), on one sandbox IR device, "J IR Pill", created and deleted
here. Every check after a write re-reads the hub (cache/refresh_all) first.

  1. ir_emitters/status: the kept read (no hub traffic), then a refresh
     (the paired list, Remote 1 expected);
  2. device/create "J IR Pill": the record holds the new default 00 00 07,
     and the card's cache rows carry it as `emitters`;
  3. device/sync with device.extras: port 2 only, then remote 1 only and
     straight back to all (a sync right after a remote-routing sync);
  4. device/sync_plan with no emitter left: refused, nothing written;
  5. cleanup: delete J IR Pill.

Needs the IR2 backend deployed to HA (scripts/deploy-ha.ps1) and Marcel's
go-ahead. Usage:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_341_ir_pill_ha.py [run|cleanup]

Report: scripts/hub-bench/out/bench_341_x2_<ts>.json.
"""

from __future__ import annotations

import asyncio
import copy
import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ.get("SOFABATON_BENCH_ROOT") or str(Path(__file__).resolve().parent))
import bench_310_transport_switch_ha as b  # noqa: E402

MODE = sys.argv[1] if len(sys.argv) > 1 else "run"
if MODE not in ("run", "cleanup"):
    raise SystemExit("usage: bench_341_ir_pill_ha.py [run|cleanup]")

b.ENTRY = "01KKSY1K1T6YDQ2MHV29VFSG70"  # the X2
DEVICE_NAME = "J IR Pill"
check = b.check
note = b.note


async def finish(ws: b.HaWs, start: dict, step: str) -> dict:
    """Wait for an operation a WS command started; a plain result passes."""

    op = str(start.get("operation_id") or "")
    if not op:
        return start
    event = await ws.subscribe_until_done({"type": "sofabaton_x1s/backup/progress_subscribe", "operation_id": op})
    try:
        await ws.cmd({"type": "sofabaton_x1s/backup/clear_result", "operation_id": op})
    except RuntimeError:
        pass
    note(step=step, event=event)
    return event


async def reread(ws: b.HaWs) -> dict:
    start = await ws.cmd({"type": "sofabaton_x1s/cache/refresh_all", "entry_id": b.ENTRY})
    event = await finish(ws, start, "refresh_all")
    check("refresh_all succeeded", event.get("status") == "success", str(event.get("message") or ""))
    return await b.bundle(ws)


def device_entry(bundle: dict) -> dict | None:
    for entry in bundle.get("devices") or []:
        if str((entry.get("device") or {}).get("name") or "") == DEVICE_NAME:
            return entry
    return None


def extras(entry: dict | None) -> dict | None:
    value = ((entry or {}).get("device") or {}).get("extras")
    return dict(value) if isinstance(value, dict) else None


def with_extras(bundle: dict, c: int) -> dict:
    edited = copy.deepcopy(bundle)
    device_entry(edited)["device"]["extras"] = {"a": 0, "b": 0, "c": c}
    return edited


async def sync(ws: b.HaWs, dev_id: int, baseline: dict, edited: dict, label: str) -> dict:
    start = await ws.cmd({
        "type": "sofabaton_x1s/device/sync", "entry_id": b.ENTRY, "device_id": dev_id,
        "baseline": baseline, "edited": edited,
    })
    return await finish(ws, start, f"device_sync_{label}")


async def cache_row_emitters(ws: b.HaWs, dev_id: int) -> object:
    contents = await ws.cmd({"type": "sofabaton_x1s/persistent_cache/contents", "entry_id": b.ENTRY})
    if not contents.get("enabled"):
        return "cache disabled"
    for hub in contents.get("hubs") or []:
        for row in hub.get("devices_list") or []:
            if int(row.get("id") or 0) == dev_id:
                return row.get("emitters")
    return None


async def cleanup(ws: b.HaWs) -> None:
    entry = device_entry(await b.bundle(ws))
    if entry:
        dev_id = int(entry["device"]["device_id"])
        start = await ws.cmd({"type": "sofabaton_x1s/device/delete", "entry_id": b.ENTRY, "device_id": dev_id})
        await finish(ws, start, "device_delete")
        print(f"deleted {DEVICE_NAME} id={dev_id}")


async def main() -> None:
    async with b.HaWs() as ws:
        await b.wait_ws_ready(ws)
        await cleanup(ws)
        if MODE == "cleanup":
            return

        # 1. the status read
        kept = await ws.cmd({"type": "sofabaton_x1s/ir_emitters/status", "entry_id": b.ENTRY})
        check("status without refresh answers", kept.get("available") is True, str(kept))
        fresh = await ws.cmd({"type": "sofabaton_x1s/ir_emitters/status", "entry_id": b.ENTRY, "refresh": True})
        remotes = [row for row in fresh.get("paired") or [] if row.get("kind") == "remote"]
        check("refresh lists Remote 1", any(row.get("number") == 1 for row in remotes), str(fresh))
        check("refresh is stamped", bool(fresh.get("read_at")), str(fresh.get("read_at")))

        # 2. create: the new default
        result = await ws.cmd({"type": "sofabaton_x1s/device/create", "entry_id": b.ENTRY,
                               "name": DEVICE_NAME, "device_class": "ir"})
        dev_id = int(result.get("device_id") or 0)
        check("device created", bool(dev_id), str(result))
        try:
            current = await reread(ws)
            check("create default 00 00 07", extras(device_entry(current)) == {"a": 0, "b": 0, "c": 7},
                  str(extras(device_entry(current))))
            emitters = await cache_row_emitters(ws, dev_id)
            check("cache row carries emitters", emitters in ([0, 0, 7], "cache disabled"), str(emitters))

            # 3. routing syncs
            event = await sync(ws, dev_id, current, with_extras(current, 0x04), "port2")
            check("port 2 sync succeeded", event.get("status") == "success", str(event.get("message") or ""))
            current = await reread(ws)
            check("record holds port 2 only", extras(device_entry(current)) == {"a": 0, "b": 0, "c": 4},
                  str(extras(device_entry(current))))

            event = await sync(ws, dev_id, current, with_extras(current, 0x08), "remote1")
            check("remote 1 only sync succeeded", event.get("status") == "success", str(event.get("message") or ""))
            current = await b.bundle(ws)  # no full re-read: the next sync goes straight after
            event = await sync(ws, dev_id, current, with_extras(current, 0x07), "back_to_all")
            check("a sync right after a remote-routing sync succeeds", event.get("status") == "success",
                  f"{event.get('failed_at')}: {event.get('message')}")
            current = await reread(ws)
            check("record back to all", extras(device_entry(current)) == {"a": 0, "b": 0, "c": 7},
                  str(extras(device_entry(current))))

            # 4. a refused routing writes nothing
            try:
                plan = await ws.cmd({"type": "sofabaton_x1s/device/sync_plan", "entry_id": b.ENTRY,
                                     "device_id": dev_id, "baseline": current,
                                     "edited": with_extras(current, 0x00)})
                check("no emitter is refused by the plan", False, str(plan))
            except RuntimeError as err:
                check("no emitter is refused by the plan", "emitter" in str(err), str(err))
        finally:
            await cleanup(ws)
            check("sandbox device gone", device_entry(await b.bundle(ws)) is None)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        sys.exit(b.write_report("bench_341_x2"))
