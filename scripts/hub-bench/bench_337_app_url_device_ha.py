"""A sandbox X2 Wifi device holding Sofabaton-app-style URL commands (PR #317).

bokkoman's X2 holds IP commands made in the Sofabaton app's "IP control"
screen, which the hub stores as URL records (code type 0x21: URL, method,
header pairs, body) on an ordinary wifi_ip device. This puts the same kind
of device on the X2 so the payload editor can be tried against it:

  up      device/create "J Kodi" (wifi_ip), then one device/sync adding two
          Kodi JSON-RPC commands as URL records; reads each back through
          blobs/fetch (the editor's own fetch) and checks the decoded fields
  check   the read-back only
  down    delete "J Kodi"

Drives the deployed HA instance's own APIs only; the X2's entry stays on.
Nothing but the J device is written (the X2 is production: sandbox only).
The commands point at the reporter's Kodi address (192.168.1.161:8080), so
a press goes nowhere on this network.

Usage:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_337_app_url_device_ha.py <up|check|down>

Report: scripts/hub-bench/out/bench_337_<ts>.json.
"""

from __future__ import annotations

import asyncio
import copy
import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ.get("SOFABATON_BENCH_ROOT") or str(Path(__file__).resolve().parent))
import bench_310_transport_switch_ha as b  # noqa: E402  (b.ENTRY is the X2)

MODE = sys.argv[1].lower() if len(sys.argv) > 1 else ""
if MODE not in ("up", "check", "down"):
    raise SystemExit("usage: bench_337_app_url_device_ha.py <up|check|down>")

DEVICE_NAME = "J Kodi"
KODI_URL = "http://192.168.1.161:8080/jsonrpc"
COMMANDS = (
    (1, "Home", "Input.Home"),
    (2, "Back", "Input.Back"),
)
check = b.check
note = b.note


def url_fields(method: str) -> dict:
    return {
        "url": KODI_URL,
        "method": "POST",
        "headers": [["Content-Type", "application/json"]],
        "body": f'{{"jsonrpc":"2.0","method":"{method}","id":1}}',
    }


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


def sandbox(bundle: dict) -> dict | None:
    for entry in bundle.get("devices") or []:
        if str((entry.get("device") or {}).get("name") or "") == DEVICE_NAME:
            return entry
    return None


async def read_back(ws: b.HaWs, device_id: int) -> None:
    for command_id, name, method in COMMANDS:
        fetched = await ws.cmd({"type": "sofabaton_x1s/blobs/fetch", "entry_id": b.ENTRY,
                                "device_id": device_id, "command_id": command_id})
        note(step="fetch", command_id=command_id, fetched=fetched)
        rows = [row for row in fetched.get("commands") or [] if int(row.get("command_id") or 0) == command_id]
        decoded = (rows[0] if rows else {}).get("decoded") or {}
        fields = decoded.get("fields") or {}
        check(f"{name}: decodes as wifi_ip", decoded.get("class") == "wifi_ip", str(decoded.get("class")))
        check(f"{name}: is a URL record", "url" in fields, str(sorted(fields)))
        check(f"{name}: fields as written", fields == url_fields(method), str(fields))


async def main() -> None:
    async with b.HaWs() as ws:
        await b.wait_ws_ready(ws)
        current = await b.bundle(ws)
        existing = sandbox(current)

        if MODE == "down":
            if not existing:
                print(f"no {DEVICE_NAME!r} on the hub")
                return
            device_id = int(existing["device"]["device_id"])
            start = await ws.cmd({"type": "sofabaton_x1s/device/delete", "entry_id": b.ENTRY, "device_id": device_id})
            await finish(ws, start, "device_delete")
            check("sandbox device removed", sandbox(await b.bundle(ws)) is None)
            return

        if MODE == "check":
            check("sandbox device present", existing is not None)
            if existing:
                await read_back(ws, int(existing["device"]["device_id"]))
            return

        if existing:
            raise SystemExit(f"{DEVICE_NAME!r} is already on the hub (id {existing['device']['device_id']}): "
                             "run `check`, or `down` first")
        result = await ws.cmd({"type": "sofabaton_x1s/device/create", "entry_id": b.ENTRY,
                               "name": DEVICE_NAME, "device_class": "wifi_ip"})
        device_id = int(result.get("device_id") or 0)
        check("device created", bool(device_id), str(result))
        if not device_id:
            return
        baseline = await b.bundle(ws)
        check("device in the bundle", sandbox(baseline) is not None)

        edited = copy.deepcopy(baseline)
        block = sandbox(edited)
        block["commands"] = list(block.get("commands") or []) + [
            {
                "command_id": command_id,
                "name": name,
                "restore_data": {
                    "transport": "hub_code_record",
                    "decoded": {"class": "wifi_ip", "trailer_hex": "", "fields": url_fields(method), "edited": True},
                    "new": True,
                },
            }
            for command_id, name, method in COMMANDS
        ]
        start = await ws.cmd({"type": "sofabaton_x1s/device/sync", "entry_id": b.ENTRY, "device_id": device_id,
                              "baseline": baseline, "edited": edited})
        event = await finish(ws, start, "device_sync")
        check("device sync succeeded", event.get("status") == "success", str(event.get("message") or ""))
        await read_back(ws, device_id)
        print(f"\n{DEVICE_NAME!r} is device {device_id} on the X2")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        failed = b.write_report("bench_337")
    sys.exit(1 if failed else 0)
