"""The Wifi Commands Edit device pencil through the REAL HA path
(docs/internal/icon-color-editing-plan.md, E1-E4 status).

Drives the deployed HA instance's own APIs only, on a scratch HTTP Wifi
Device ("Bench Pencil") that it creates, deploys and deletes. Each pencil
step sends what the card sends: a fresh cache/structural_bundle as the
baseline, an edited copy with only the changed name/icon, through
device/sync. Every check re-reads the hub (cache/refresh_all) first.

  1. create + deploy the scratch device: deployed and in sync;
  2. pencil: rename + icon change -> the hub record carries both, the
     store follows the name, the device stays in sync (store hash ==
     deployed hash == the hub brand's hash);
  3. pencil: icon only -> the name stays everywhere, still in sync;
  4. a Wifi Commands Sync after a command edit keeps the name and the
     icon (the head commit carries the cached icon);
  5. cleanup: delete the scratch device (store record + hub record).

Usage:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_321_wifi_pencil_ha.py <x1|x1s> [skipcleanup|cleanup]

Run from a worktree, set SOFABATON_BENCH_ROOT to the main checkout's
scripts/hub-bench (bench_310's HA helpers read its .ha-config/.ha-token).
X1 / X1S only: the X2 is production (Wifi Devices there are real).

Report: <bench root>/out/bench_321_<hub>_<ts>.json.
"""

from __future__ import annotations

import asyncio
import copy
import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ.get("SOFABATON_BENCH_ROOT") or str(Path(__file__).resolve().parent))
import bench_310_transport_switch_ha as b  # noqa: E402

HUB = sys.argv[1].lower() if len(sys.argv) > 1 else ""
ENTRIES = {
    "x1s": "01KBXGR6FW407KG891NYR5RYNC",
    "x1": "01KVQY37V5MMXW5FR9X6FRM7PM",
}
# (renamed icon, icon-only icon) per hub; X1 ids are its own numbering.
ICONS = {"x1s": (11, 6), "x1": (23, 8)}
if HUB not in ENTRIES:
    raise SystemExit("usage: bench_321_wifi_pencil_ha.py <x1|x1s> [skipcleanup|cleanup]")
MODE = sys.argv[2] if len(sys.argv) > 2 else ""
if MODE not in ("", "skipcleanup", "cleanup"):
    raise SystemExit(f"unknown mode {MODE!r}")

b.ENTRY = ENTRIES[HUB]
b.BENCH_NAME = NAME = "Bench Pencil"
RENAMED = "Bench Pencil 2"
check = b.check
note = b.note


def slots(second: str = "BP Two") -> list[dict]:
    rows = []
    for n in range(1, 11):
        rows.append({
            "name": f"Command {n}", "add_as_favorite": False, "hard_button": "",
            "long_press_enabled": False, "input_activity_id": "", "activities": [],
        })
    rows[0]["name"] = "BP One"
    rows[1]["name"] = second
    return rows


async def finish(ws: b.HaWs, start: dict, step: str) -> dict:
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


def hub_block(bundle: dict, device_id: int) -> dict | None:
    for entry in bundle.get("devices") or []:
        dev = entry.get("device") or {}
        if int(dev.get("device_id") or 0) == device_id:
            return dev
    return None


async def record(ws: b.HaWs) -> dict | None:
    result = await ws.cmd({"type": "sofabaton_x1s/command_devices/list", "entry_id": b.ENTRY})
    for dev in result.get("devices") or []:
        if b.DEVICE_KEY and dev.get("device_key") == b.DEVICE_KEY:
            return dev
    return None


def expect_in_sync(label: str, rec: dict | None, block: dict | None) -> None:
    rec = rec or {}
    brand = str((block or {}).get("brand") or "")
    store_hash = str(rec.get("commands_hash") or "")
    deployed_hash = str(rec.get("deployed_commands_hash") or "")
    check(f"{label}: Wifi Commands says no Sync needed", rec.get("sync_needed") is False, f"sync_needed={rec.get('sync_needed')}")
    check(f"{label}: store hash == deployed hash", bool(store_hash) and store_hash == deployed_hash, f"{store_hash} vs {deployed_hash}")
    check(f"{label}: hub brand carries the deployed hash", brand.endswith(f"-{deployed_hash}") and f"-{b.DEVICE_KEY}-" in brand, brand)


async def pencil(ws: b.HaWs, device_id: int, *, name: str | None, icon: int | None) -> dict:
    """What the card's Edit device Save sends."""
    baseline = await b.bundle(ws)
    edited = copy.deepcopy(baseline)
    dev = hub_block(edited, device_id)
    if dev is None:
        raise SystemExit(f"device {device_id} not in the structural bundle")
    if name is not None:
        dev["name"] = name
    if icon is not None:
        dev["icon"] = icon
    start = await ws.cmd({
        "type": "sofabaton_x1s/device/sync", "entry_id": b.ENTRY, "device_id": device_id,
        "baseline": baseline, "edited": edited,
    })
    event = await finish(ws, start, "pencil_device_sync")
    check("pencil device sync succeeded", event.get("status") == "success", str(event.get("error") or event.get("message") or ""))
    return event


async def cleanup(ws: b.HaWs) -> None:
    result = await ws.cmd({"type": "sofabaton_x1s/command_devices/list", "entry_id": b.ENTRY})
    for dev in result.get("devices") or []:
        if str(dev.get("device_name") or "") in (NAME, RENAMED):
            await ws.cmd({"type": "sofabaton_x1s/command_device/delete", "entry_id": b.ENTRY, "device_key": dev["device_key"]})
            print(f"deleted bench Wifi device {dev['device_key']!r} (hub id {dev.get('deployed_device_id')})")


async def main() -> None:
    renamed_icon, icon_only = ICONS[HUB]
    async with b.HaWs() as ws:
        await b.wait_ws_ready(ws)
        await cleanup(ws)
        if MODE == "cleanup":
            return

        # 1. create + deploy
        created = await ws.cmd({"type": "sofabaton_x1s/command_device/create", "entry_id": b.ENTRY, "device_name": NAME, "transport": "http"})
        b.DEVICE_KEY = str(created.get("device_key") or "")
        check("scratch Wifi device created", bool(b.DEVICE_KEY), str(created))
        await ws.cmd({"type": "sofabaton_x1s/command_config/set", "entry_id": b.ENTRY, "device_key": b.DEVICE_KEY, "commands": slots()})
        terminal, _stages = await b.run_sync(ws)
        check("first deploy succeeded", terminal.get("status") == "success", str(terminal.get("message") or ""))
        rec = await record(ws)
        device_id = int((rec or {}).get("deployed_device_id") or 0)
        check("deployed with a hub id", 1 <= device_id <= 255, str(rec))
        current = await reread(ws)
        block = hub_block(current, device_id)
        start_icon = (block or {}).get("icon")
        note(step="deployed", record=rec, block=block)
        print(f"deployed: hub id {device_id}, icon {start_icon}, brand {(block or {}).get('brand')}")
        expect_in_sync("after the first deploy", rec, block)

        # 2. pencil: rename + icon
        await pencil(ws, device_id, name=RENAMED, icon=renamed_icon)
        current = await reread(ws)
        block = hub_block(current, device_id)
        rec = await record(ws)
        check("hub record renamed", (block or {}).get("name") == RENAMED, str((block or {}).get("name")))
        check(f"hub record icon {renamed_icon}", (block or {}).get("icon") == renamed_icon, str((block or {}).get("icon")))
        check("store follows the name", (rec or {}).get("device_name") == RENAMED, str((rec or {}).get("device_name")))
        check("same hub id", int((rec or {}).get("deployed_device_id") or 0) == device_id, str((rec or {}).get("deployed_device_id")))
        expect_in_sync("after rename + icon", rec, block)

        # 3. pencil: icon only
        await pencil(ws, device_id, name=None, icon=icon_only)
        current = await reread(ws)
        block = hub_block(current, device_id)
        rec = await record(ws)
        check(f"icon-only: hub icon {icon_only}", (block or {}).get("icon") == icon_only, str((block or {}).get("icon")))
        check("icon-only: hub name kept", (block or {}).get("name") == RENAMED, str((block or {}).get("name")))
        check("icon-only: store name kept", (rec or {}).get("device_name") == RENAMED, str((rec or {}).get("device_name")))
        expect_in_sync("after icon only", rec, block)

        # 4. a command edit + Wifi Commands Sync keeps name and icon
        await ws.cmd({"type": "sofabaton_x1s/command_config/set", "entry_id": b.ENTRY, "device_key": b.DEVICE_KEY, "commands": slots("BP Two B")})
        rec = await record(ws)
        check("command edit asks for a Sync", (rec or {}).get("sync_needed") is True, f"sync_needed={(rec or {}).get('sync_needed')}")
        terminal, stages = await b.run_sync(ws)
        check("redeploy succeeded", terminal.get("status") == "success", str(terminal.get("message") or ""))
        note(step="redeploy_stages", stages=stages)
        rec = await record(ws)
        new_id = int((rec or {}).get("deployed_device_id") or 0)
        check("redeploy kept the hub id (in place)", new_id == device_id, f"{device_id} -> {new_id}")
        current = await reread(ws)
        block = hub_block(current, new_id)
        check("redeploy: hub name kept", (block or {}).get("name") == RENAMED, str((block or {}).get("name")))
        check(f"redeploy: hub icon {icon_only} kept", (block or {}).get("icon") == icon_only, str((block or {}).get("icon")))
        expect_in_sync("after the redeploy", rec, block)

        # 5. cleanup
        if MODE != "skipcleanup":
            await cleanup(ws)
            current = await b.bundle(ws)
            check("scratch hub record gone", hub_block(current, new_id) is None or (hub_block(current, new_id) or {}).get("name") not in (NAME, RENAMED))
            check("scratch store record gone", await record(ws) is None)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        sys.exit(b.write_report(f"bench_321_{HUB}"))
