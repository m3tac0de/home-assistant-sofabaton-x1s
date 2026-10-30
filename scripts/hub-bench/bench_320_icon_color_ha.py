"""Activity and device icons (and X2 colors) through the REAL HA path
(docs/internal/icon-color-editing-plan.md, E6).

Drives the deployed HA instance's own APIs only, on a scratch activity
("Bench Icon") and a scratch IR device ("Bench Icon Dev"). Nothing else is
written. Every check re-reads the hub (cache/refresh_all) first, so it
reads what the hub stored, not what the integration's cache patched.

  1. activity/create with an icon (and color on the X2): the hub stores it;
  2. activity/sync changing only the icon (and color): the hub stores it;
  3. activity/sync renaming only: the icon (and color) stay (the X1 row
     rebuild used to write the TV icon);
  4. the remote entity's `activities` attribute carries the icon;
  5. device/create with an icon (and color), then device/sync changing
     them: the hub stores both;
  6. cleanup: delete the scratch device and activity.

Usage:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_320_icon_color_ha.py <x1|x1s|x2> [skipcleanup|cleanup]

Run from a worktree, set SOFABATON_BENCH_ROOT to the main checkout's
scripts/hub-bench: the HA helpers there read scripts/.ha-config.json and
scripts/.ha-token, which only the main checkout has.

Report: <bench root>/out/bench_320_<hub>_<ts>.json.
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
    "x2": "01KKSY1K1T6YDQ2MHV29VFSG70",
}
# Per hub: (create icon, create color) then (edited icon, edited color) for
# the activity and the device. X1 ids are its own numbering; colors X2 only.
PLAN = {
    "x1": {"activity": ((22, None), (8, None)), "device": ((23, None), (24, None))},
    "x1s": {"activity": ((9, None), (4, None)), "device": ((11, None), (6, None))},
    "x2": {"activity": ((34, 3), (16, 2)), "device": ((25, 9), (41, 11))},
}
if HUB not in ENTRIES:
    raise SystemExit("usage: bench_320_icon_color_ha.py <x1|x1s|x2> [skipcleanup|cleanup]")
MODE = sys.argv[2] if len(sys.argv) > 2 else ""
if MODE not in ("", "skipcleanup", "cleanup"):
    raise SystemExit(f"unknown mode {MODE!r}")

b.ENTRY = ENTRIES[HUB]
ACTIVITY_NAME = "Bench Icon"
DEVICE_NAME = "Bench Icon Dev"
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
    """The hub's own records: a full structural refresh, then the bundle."""

    start = await ws.cmd({"type": "sofabaton_x1s/cache/refresh_all", "entry_id": b.ENTRY})
    event = await finish(ws, start, "refresh_all")
    check("refresh_all succeeded", event.get("status") == "success", str(event.get("message") or ""))
    return await b.bundle(ws)


def block(bundle: dict, kind: str, name: str) -> dict | None:
    for entry in bundle.get("activities" if kind == "activity" else "devices") or []:
        dev = entry.get("device") or {}
        if str(dev.get("name") or "") == name:
            return entry
    return None


def appearance(entry: dict | None) -> tuple:
    dev = (entry or {}).get("device") or {}
    return dev.get("icon"), dev.get("color_id")


def expect(label: str, entry: dict | None, icon: int, color: int | None) -> None:
    got_icon, got_color = appearance(entry)
    check(f"{label}: icon {icon}", got_icon == icon, f"got {got_icon}")
    if color is not None:
        check(f"{label}: color {color}", got_color == color, f"got {got_color}")


async def remove(ws: b.HaWs, kind: str, entity_id: int) -> None:
    start = await ws.cmd({"type": f"sofabaton_x1s/{kind}/delete", "entry_id": b.ENTRY, f"{kind}_id": entity_id})
    await finish(ws, start, f"{kind}_delete")
    print(f"deleted bench {kind} id={entity_id}")


async def cleanup(ws: b.HaWs) -> None:
    current = await b.bundle(ws)
    for kind, name in (("device", DEVICE_NAME), ("activity", ACTIVITY_NAME), ("activity", f"{ACTIVITY_NAME} 2")):
        entry = block(current, kind, name)
        if entry:
            await remove(ws, kind, int(entry["device"]["device_id"]))


async def sync(ws: b.HaWs, kind: str, entity_id: int, baseline: dict, edited: dict) -> dict:
    start = await ws.cmd({
        "type": f"sofabaton_x1s/{kind}/sync", "entry_id": b.ENTRY, f"{kind}_id": entity_id,
        "baseline": baseline, "edited": edited,
    })
    event = await finish(ws, start, f"{kind}_sync")
    check(f"{kind} sync succeeded", event.get("status") == "success", str(event.get("message") or ""))
    return event


def remote_activity_attr(act_id: int) -> dict | None:
    for state in b.rest("/api/states") or []:
        attrs = state.get("attributes") or {}
        if str(state.get("entity_id", "")).startswith("remote.") and attrs.get("entry_id") == b.ENTRY:
            return next((a for a in attrs.get("activities") or [] if a.get("id") == act_id), None)
    return None


async def main() -> None:
    plan = PLAN[HUB]
    async with b.HaWs() as ws:
        await b.wait_ws_ready(ws)
        await cleanup(ws)
        if MODE == "cleanup":
            return

        # 1. create with an icon
        (a_icon, a_color), (a_icon2, a_color2) = plan["activity"]
        create = {"type": "sofabaton_x1s/activity/create", "entry_id": b.ENTRY, "name": ACTIVITY_NAME, "icon": a_icon}
        if a_color is not None:
            create["color_id"] = a_color
        result = await ws.cmd(create)
        act_id = int(result.get("activity_id") or 0)
        check("activity created", bool(act_id), str(result))
        current = await reread(ws)
        expect("created activity", block(current, "activity", ACTIVITY_NAME), a_icon, a_color)

        # 2. change only the icon (and color)
        edited = copy.deepcopy(current)
        dev = block(edited, "activity", ACTIVITY_NAME)["device"]
        dev["icon"] = a_icon2
        if a_color2 is not None:
            dev["color_id"] = a_color2
        await sync(ws, "activity", act_id, current, edited)
        current = await reread(ws)
        expect("activity after icon sync", block(current, "activity", ACTIVITY_NAME), a_icon2, a_color2)

        # 3. rename only: the icon stays
        edited = copy.deepcopy(current)
        block(edited, "activity", ACTIVITY_NAME)["device"]["name"] = f"{ACTIVITY_NAME} 2"
        await sync(ws, "activity", act_id, current, edited)
        current = await reread(ws)
        renamed = block(current, "activity", f"{ACTIVITY_NAME} 2")
        check("activity renamed", renamed is not None)
        expect("activity after rename only", renamed, a_icon2, a_color2)

        # 4. the remote entity publishes it
        attr = remote_activity_attr(act_id)
        check("remote entity carries the activity icon", (attr or {}).get("icon") == a_icon2, str(attr))
        if a_color2 is not None:
            check("remote entity carries the activity color", (attr or {}).get("color_id") == a_color2, str(attr))

        # 5. device: create with an icon, then change it
        (d_icon, d_color), (d_icon2, d_color2) = plan["device"]
        create = {"type": "sofabaton_x1s/device/create", "entry_id": b.ENTRY, "name": DEVICE_NAME,
                  "device_class": "ir", "icon": d_icon}
        if d_color is not None:
            create["color_id"] = d_color
        result = await ws.cmd(create)
        dev_id = int(result.get("device_id") or 0)
        check("device created", bool(dev_id), str(result))
        current = await reread(ws)
        expect("created device", block(current, "device", DEVICE_NAME), d_icon, d_color)
        edited = copy.deepcopy(current)
        dev = block(edited, "device", DEVICE_NAME)["device"]
        dev["icon"] = d_icon2
        if d_color2 is not None:
            dev["color_id"] = d_color2
        await sync(ws, "device", dev_id, current, edited)
        current = await reread(ws)
        expect("device after icon sync", block(current, "device", DEVICE_NAME), d_icon2, d_color2)

        # 6. cleanup
        if MODE != "skipcleanup":
            await cleanup(ws)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        sys.exit(b.write_report(f"bench_320_{HUB}"))
