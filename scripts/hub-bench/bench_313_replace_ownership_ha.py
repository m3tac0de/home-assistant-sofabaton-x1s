"""Replace-path reference ownership, through the REAL HA path on the X1 or
X1S (fix for review finding "replace path ignores the config's own binding
and favorite changes", 2026-10-10).

A replace moves every reference to the old device onto the new one before
the delete, except what the LAST DEPLOY made and the slot config no longer
wants (or wants differently): those stay behind for the delete, and the
config writes its own. References made in the activity editor always move.

Drives the deployed HA instance's own APIs only, on a scratch activity and
a scratch Wifi Device ("Bench Ownership"). Nothing else is written.

  1. scratch activity + scratch Wifi Device; config v1 deploys:
       RED -> 1 (short only), GREEN -> 4 (short + long), YELLOW -> 9,
       favorites 2 and 3;
  2. editor-made references (activity sync): BLUE -> 5, a long leg on
     RED -> 6, a favorite on 5, a power-on macro step on 7;
  3. config v2: YELLOW moves to 10, GREEN's long press off, favorite 3
     off; RED, favorite 2 unchanged;
  4. drift: rename command 8 on the hub through the device editor's sync,
     so the next Wifi sync must decline in place and REPLACE;
  5. sync; expect a replace onto a new device id, and on it:
       RED 1 + editor long leg 6 (carried), GREEN 4 without a long leg,
       YELLOW 10, BLUE 5 (moved), favorites 2 and 5 (3 gone), macro step 7,
       nothing left on the old id, which is gone;
  6. every other activity reads the same as before the bench;
  7. cleanup: zero-slot sync, store record delete, scratch activity delete.

Usage:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_313_replace_ownership_ha.py <x1|x1s> [skipcleanup]

Report: scripts/hub-bench/out/bench_313_<hub>_<ts>.json.
"""

from __future__ import annotations

import asyncio
import copy
import json
import sys

import bench_310_transport_switch_ha as b

HUB = sys.argv[1].lower() if len(sys.argv) > 1 else ""
ENTRIES = {
    "x1s": "01KBXGR6FW407KG891NYR5RYNC",
    "x1": "01KVQY37V5MMXW5FR9X6FRM7PM",
}
if HUB not in ENTRIES:
    raise SystemExit("usage: bench_313_replace_ownership_ha.py <x1|x1s> [skipcleanup]")
SKIP_CLEANUP = len(sys.argv) > 2 and sys.argv[2] == "skipcleanup"
# Only remove a bench device and activity a run left behind.
CLEANUP_ONLY = len(sys.argv) > 2 and sys.argv[2] == "cleanup"
if len(sys.argv) > 2 and not (SKIP_CLEANUP or CLEANUP_ONLY):
    raise SystemExit(f"unknown mode {sys.argv[2]!r}")

b.ENTRY = ENTRIES[HUB]
b.BENCH_NAME = "Bench Ownership"
check = b.check
note = b.note

RED, GREEN, YELLOW, BLUE = 0xBE, 0xBF, 0xC0, 0xC1
POWER_ON = 198
DRIFT_COMMAND = 8


def slots(version: int) -> list[dict]:
    act = str(b.ACTIVITY_ID)
    s = [b.default_slot(n) for n in range(1, 11)]
    s[0].update({"name": "BO Red", "hard_button": "red", "add_as_favorite": False, "activities": [act]})
    s[1].update({"name": "BO Fav Two", "add_as_favorite": True, "activities": [act]})
    s[3].update({"name": "BO Green", "hard_button": "green", "long_press_enabled": True, "add_as_favorite": False, "activities": [act]})
    s[4].update({"name": "BO Blue"})
    s[5].update({"name": "BO Long"})
    s[6].update({"name": "BO Step"})
    if version == 1:
        s[2].update({"name": "BO Fav Three", "add_as_favorite": True, "activities": [act]})
        s[8].update({"name": "BO Yellow", "hard_button": "yellow", "add_as_favorite": False, "activities": [act]})
    else:
        s[2].update({"name": "BO Fav Three"})
        s[3].update({"long_press_enabled": False})
        s[9].update({"name": "BO Yellow New", "hard_button": "yellow", "add_as_favorite": False, "activities": [act]})
    for slot in s:
        # Slots without an activity are not configured, whatever the
        # favorite flag says (the store default keeps it True).
        if not slot["activities"]:
            slot["add_as_favorite"] = True
    return s


def bindings(act: dict) -> dict[int, tuple]:
    out: dict[int, tuple] = {}
    for row in act.get("button_bindings") or []:
        out[int(row.get("button_id") or 0)] = (
            int(row.get("device_id") or 0), int(row.get("command_id") or 0),
            int(row.get("long_press_device_id") or 0), int(row.get("long_press_command_id") or 0),
        )
    return out


def favorites(act: dict, dev: int) -> list[int]:
    return sorted(int(f.get("command_id") or 0) for f in act.get("favorite_slots") or [] if int(f.get("device_id") or 0) == dev)


def macro_steps(act: dict, dev: int) -> list[tuple[int, int]]:
    return sorted(
        (int(m.get("button_id") or 0), int(st.get("command_id") or 0))
        for m in act.get("macros") or []
        for st in m.get("steps") or []
        if int(st.get("device_id") or 0) == dev and int(st.get("command_id") or 0) < 0xC5
    )


def comparable(entry: dict) -> str:
    """An activity entry minus the runtime fields that change on their own."""
    data = copy.deepcopy(entry)
    device = data.get("device") or {}
    for key in ("state", "power_state", "active"):
        device.pop(key, None)
        data.pop(key, None)
    # Read stamps: every bundle refresh rewrites them.
    data.pop("captured_at", None)
    data.pop("fetched_at", None)
    return json.dumps(data, sort_keys=True)


def changed_fields(before: str, after: str | None) -> list[str]:
    if after is None:
        return ["<missing>"]
    old, new = json.loads(before), json.loads(after)
    return sorted(k for k in set(old) | set(new) if old.get(k) != new.get(k))


async def run_sync(ws: b.HaWs, *, timeout: float = 1200.0) -> tuple[dict, list[dict]]:
    """bench_310's run_sync waits for a progress field to change, which a
    replace onto the same config hash never does (the store already holds
    the v2 hash and the last run also ended "Sync complete"). Here a run is
    over once the run command has answered and progress is terminal."""
    stages: list[dict] = []
    run_task = asyncio.ensure_future(ws.cmd({"type": "sofabaton_x1s/command_sync/run", "entry_id": b.ENTRY, "device_key": b.DEVICE_KEY}))
    loop = asyncio.get_running_loop()
    deadline = loop.time() + timeout
    async with b.HaWs() as poll:
        while loop.time() < deadline:
            prog = await poll.cmd({"type": "sofabaton_x1s/command_sync/progress", "entry_id": b.ENTRY, "device_key": b.DEVICE_KEY})
            stage = {k: prog.get(k) for k in ("phase", "step_kind", "step_name", "message", "transport_switch", "status")}
            if not stages or stages[-1] != stage:
                stages.append(stage)
            if run_task.done() and prog.get("status") in ("success", "failed"):
                try:
                    run_result = run_task.result()
                except RuntimeError as err:
                    run_result = {"error": str(err)}
                note(step="sync", terminal=prog, run_result=run_result, stages=stages)
                return prog, stages
            await asyncio.sleep(0.5)
    raise SystemExit(f"sync did not finish within {timeout}s")


async def cleanup(ws: b.HaWs, act_id: int, dev_id: int) -> None:
    print("\n== cleanup ==")
    await ws.cmd({
        "type": "sofabaton_x1s/command_config/set", "entry_id": b.ENTRY,
        "commands": [b.default_slot(n) for n in range(1, 11)], "device_key": b.DEVICE_KEY,
    })
    prog, _ = await run_sync(ws)
    check("cleanup sync succeeded", prog.get("status") == "success", str(prog.get("message")))
    try:
        await ws.cmd({"type": "sofabaton_x1s/command_device/delete", "entry_id": b.ENTRY, "device_key": b.DEVICE_KEY})
        print("  store record deleted")
    except RuntimeError as err:
        print(f"  store record delete: {err}")
    await asyncio.sleep(3)
    final = await b.bundle(ws)
    if b.activity_entry(final, act_id) is not None:
        try:
            await ws.cmd({"type": "sofabaton_x1s/activity/delete", "entry_id": b.ENTRY, "activity_id": act_id})
            print("  scratch activity deleted")
        except RuntimeError as err:
            print(f"  activity delete: {err}")
    else:
        print("  scratch activity purged by the hub with its last device")
    await asyncio.sleep(2)
    final = await b.bundle(ws)
    check("cleanup: no bench device left", not dev_id or b.device_entry(final, dev_id) is None)
    check("cleanup: no scratch activity left", b.activity_entry(final, act_id) is None)


async def set_config(ws: b.HaWs, version: int) -> None:
    await ws.cmd({
        "type": "sofabaton_x1s/command_config/set", "entry_id": b.ENTRY,
        "commands": slots(version), "device_key": b.DEVICE_KEY,
    })


async def main() -> None:
    cfg = b.rest("/api/config")
    print(f"HA {cfg.get('version')} state={cfg.get('state')} hub={HUB}")
    if cfg.get("state") != "RUNNING":
        raise SystemExit("HA is not RUNNING")
    async with b.HaWs() as ws:
        await b.wait_ws_ready(ws)
        if CLEANUP_ONLY:
            rec = await b.bench_record(ws)
            if rec is None:
                print("no bench record in the store")
                return
            b.DEVICE_KEY = str(rec.get("device_key") or "")
            await b.ensure_bench_activity(ws)
            await cleanup(ws, b.ACTIVITY_ID, int(rec.get("deployed_device_id") or 0))
            return
        start_bundle = await b.bundle(ws)
        others_before = {
            int(a["device"]["device_id"]): comparable(a)
            for a in start_bundle.get("activities") or []
            if str((a.get("device") or {}).get("name") or "") != b.BENCH_NAME
        }
        await b.ensure_bench_activity(ws)
        await b.ensure_bench_record(ws)
        act_id = b.ACTIVITY_ID

        # ── 1. config v1, first deploy ──────────────────────────────────
        print("\n== config v1, first deploy ==")
        await set_config(ws, 1)
        prog, _stages = await run_sync(ws)
        check("GATE: first sync succeeded", prog.get("status") == "success", str(prog.get("message")))
        rec = await b.bench_record(ws)
        dev1 = int((rec or {}).get("deployed_device_id") or 0)
        check("GATE: deployed", dev1 > 0, f"device_id={dev1}")
        if not dev1:
            return

        # ── 2. editor-made references ───────────────────────────────────
        print("\n== editor-made references (activity sync) ==")
        base = await b.bundle(ws)
        edited = copy.deepcopy(base)
        eact = b.activity_entry(edited, act_id)
        check("GATE: scratch activity readable", eact is not None)
        rows = eact.setdefault("button_bindings", [])
        rows.append({"button_id": BLUE, "device_id": dev1, "command_id": 5})
        for row in rows:
            if int(row.get("button_id") or 0) == RED:
                row["long_press_device_id"] = dev1
                row["long_press_command_id"] = 6
        favs = eact.setdefault("favorite_slots", [])
        used = [int(f.get("button_id") or 0) for f in favs] + [int(m.get("button_id") or 0) for m in eact.get("macros") or [] if int(m.get("button_id") or 0) < POWER_ON]
        favs.append({"button_id": max(used + [0]) + 1, "device_id": dev1, "command_id": 5, "name": ""})
        for macro in eact.get("macros") or []:
            if int(macro.get("button_id") or 0) == POWER_ON:
                macro.setdefault("steps", []).append({"device_id": dev1, "command_id": 7, "button_code": 0, "duration": 0, "delay": 0xFF})
                break
        else:
            eact.setdefault("macros", []).append({"button_id": POWER_ON, "name": "POWER_ON", "steps": [
                {"device_id": dev1, "command_id": 7, "button_code": 0, "duration": 0, "delay": 0xFF},
            ]})
        event = await b.activity_sync(ws, base, edited)
        check("GATE: activity sync succeeded", event.get("status") == "success", str(event.get("error") or event.get("message") or ""))
        await asyncio.sleep(2)
        before = b.activity_entry(await b.bundle(ws), act_id) or {}
        bind_before = bindings(before)
        note(step="before", device_id=dev1, bindings=bind_before, favorites=favorites(before, dev1), steps=macro_steps(before, dev1))
        print(f"  bindings: {bind_before}")
        print(f"  favorites: {favorites(before, dev1)}  steps: {macro_steps(before, dev1)}")
        check("v1: RED 1 + editor long leg 6", bind_before.get(RED) == (dev1, 1, dev1, 6), str(bind_before.get(RED)))
        check("v1: GREEN 4 + long 4+N", bool(bind_before.get(GREEN)) and bind_before[GREEN][:2] == (dev1, 4) and bind_before[GREEN][2] == dev1, str(bind_before.get(GREEN)))
        check("v1: YELLOW 9", bool(bind_before.get(YELLOW)) and bind_before[YELLOW][:2] == (dev1, 9), str(bind_before.get(YELLOW)))
        check("v1: editor BLUE 5", bool(bind_before.get(BLUE)) and bind_before[BLUE][:2] == (dev1, 5), str(bind_before.get(BLUE)))
        check("v1: favorites 2, 3 (config) and 5 (editor)", favorites(before, dev1) == [2, 3, 5], str(favorites(before, dev1)))
        check("v1: editor macro step 7", (POWER_ON, 7) in macro_steps(before, dev1), str(macro_steps(before, dev1)))

        # ── 3. config v2 ────────────────────────────────────────────────
        print("\n== config v2 ==")
        await set_config(ws, 2)

        # ── 4. drift: a command renamed on the hub ──────────────────────
        print(f"\n== drift: rename command {DRIFT_COMMAND} on the hub ==")
        base = await b.bundle(ws)
        edited = copy.deepcopy(base)
        dev_entry = b.device_entry(edited, dev1) or {}
        renamed = False
        for command in dev_entry.get("commands") or []:
            if int(command.get("command_id") or 0) == DRIFT_COMMAND:
                command["name"] = "BO Drift"
                renamed = True
        check("GATE: drift command present in the bundle", renamed)
        start = await ws.cmd({"type": "sofabaton_x1s/device/sync", "entry_id": b.ENTRY, "device_id": dev1, "baseline": base, "edited": edited})
        op = str(start.get("operation_id") or "")
        event = await ws.subscribe_until_done({"type": "sofabaton_x1s/backup/progress_subscribe", "operation_id": op})
        try:
            await ws.cmd({"type": "sofabaton_x1s/backup/clear_result", "operation_id": op})
        except RuntimeError:
            pass
        note(step="drift_sync", event=event)
        check("GATE: drift rename landed", event.get("status") == "success", str(event.get("error") or event.get("message") or ""))

        # ── 5. the replace ──────────────────────────────────────────────
        print("\n== sync v2 (must replace) ==")
        prog, stages = await run_sync(ws)
        phases = [s.get("phase") for s in stages if s.get("phase")]
        messages = [str(s.get("message") or "") for s in stages]
        print(f"  stages: {phases}")
        check("GATE: v2 sync succeeded", prog.get("status") == "success", str(prog.get("message")))
        check("GATE: took the replace path", "creating_device" in phases and "deleting_device" in phases and not any("in place" in m for m in messages), str(phases))
        rec = await b.bench_record(ws)
        dev2 = int((rec or {}).get("deployed_device_id") or 0)
        check("GATE: new device id", dev2 > 0 and dev2 != dev1, f"{dev1} -> {dev2}")
        await asyncio.sleep(2)
        after_bundle = await b.bundle(ws)
        after = b.activity_entry(after_bundle, act_id) or {}
        bind_after = bindings(after)
        note(step="after", device_id=dev2, bindings=bind_after, favorites=favorites(after, dev2), steps=macro_steps(after, dev2))
        print(f"  bindings: {bind_after}")
        print(f"  favorites: {favorites(after, dev2)}  steps: {macro_steps(after, dev2)}")
        check("unchanged config binding RED 1 kept the editor long leg 6", bind_after.get(RED) == (dev2, 1, dev2, 6), str(bind_after.get(RED)))
        green = bind_after.get(GREEN)
        check("GREEN 4 lost the long press the config switched off", bool(green) and green[:2] == (dev2, 4) and not green[3], str(green))
        check("YELLOW moved to 10 as the config says", bool(bind_after.get(YELLOW)) and bind_after[YELLOW][:2] == (dev2, 10), str(bind_after.get(YELLOW)))
        check("editor BLUE 5 moved", bool(bind_after.get(BLUE)) and bind_after[BLUE][:2] == (dev2, 5), str(bind_after.get(BLUE)))
        check("favorites: 2 kept, 3 dropped, editor 5 moved", favorites(after, dev2) == [2, 5], str(favorites(after, dev2)))
        check("editor macro step 7 moved", (POWER_ON, 7) in macro_steps(after, dev2), str(macro_steps(after, dev2)))
        check("nothing points at the old device", not favorites(after, dev1) and not macro_steps(after, dev1)
              and not any(dev1 in (v[0], v[2]) for v in bind_after.values()), "")
        check("old device gone from the hub", b.device_entry(after_bundle, dev1) is None)
        check("no sync pending afterwards", not (rec or {}).get("sync_needed"), str((rec or {}).get("sync_needed")))

        # ── 6. bystanders ───────────────────────────────────────────────
        others_after = {
            int(a["device"]["device_id"]): comparable(a)
            for a in after_bundle.get("activities") or []
            if int((a.get("device") or {}).get("device_id") or 0) != act_id
        }
        changed = {k: changed_fields(v, others_after.get(k)) for k, v in others_before.items() if others_after.get(k) != v}
        note(step="bystanders", changed=changed, before={k: others_before[k] for k in changed}, after={k: others_after.get(k) for k in changed})
        check("every other activity reads the same", not changed and sorted(others_after) == sorted(others_before), f"changed={changed}")

        # ── 7. cleanup ──────────────────────────────────────────────────
        if SKIP_CLEANUP:
            print("\ncleanup SKIPPED")
            return
        await cleanup(ws, act_id, dev2)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        failed = b.write_report(f"bench_313_{HUB}")
    if failed:
        sys.exit(1)
