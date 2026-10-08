"""Transport switch bench, through the REAL HA path on the X2 (T2 of
docs/internal/wifi-events-transport-plan.md, gates G1, G2, G3).

Drives the deployed HA instance's own APIs, no direct hub connection, on a
scratch Wifi Device and a scratch activity only. Production devices
("Streamers", "Wifi Events", the app's own MQTT device) are never touched.

  1. create the scratch activity "Bench Switch" and the scratch Wifi Device
     "Bench Switch" (HTTP); slot config wires a hard button + favorite,
     a second favorite and an input into the activity; first deploy
     (replace path, HTTP);
  2. editor-made references the slot config does not know: an activity
     sync adds a binding whose long leg is command 3 and a power-on macro
     step on command 2;
  3. read the activity back and record every reference to the device;
  4. G1: set the desired transport to MQTT, sync; the run must report a
     transport switch, take the replace path, move every reference onto
     the new device id, delete the old one; the store must record MQTT;
  5. G2: activate each command through remote.send_command and expect
     the Wifi Commands sensor to report it with transport "mqtt";
  6. G3: back to HTTP the same way; presses arrive with transport "http";
  7. cleanup: zero-slot sync (deletes the device; the hub purges the
     then-empty scratch activity), delete the store record, delete the
     activity if it survived.

Usage:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_310_transport_switch_ha.py [skipcleanup]

Reads base_url from scripts/.ha-config.json and the token from
scripts/.ha-token. Report: scripts/hub-bench/out/bench_310_<ts>.json.
"""

from __future__ import annotations

import asyncio
import copy
import json
import ssl
import sys
import time
import urllib.request
from pathlib import Path

import websockets

SKIP_CLEANUP = __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "skipcleanup"

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent
OUT = HERE / "out"
OUT.mkdir(exist_ok=True)
BASE_URL = json.loads((SCRIPTS / ".ha-config.json").read_text())["base_url"].rstrip("/")
TOKEN = (SCRIPTS / ".ha-token").read_text().strip()
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"

ENTRY = "01KKSY1K1T6YDQ2MHV29VFSG70"  # the X2
SENSOR = "sensor.x2_hub_wifi_commands"
REMOTE = "remote.x2_hub_remote"
BENCH_NAME = "Bench Switch"
BUTTON_LONG = 0xBF  # GREEN: the binding whose long leg is an editor-made reference
POWER_ON_MACRO = 198
INPUT_REF = 0xC5

checks: list[tuple[str, bool, str]] = []
log: list[dict] = []
DEVICE_KEY = ""
ACTIVITY_ID = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""), flush=True)


def note(**data) -> None:
    log.append({"t": time.time(), **data})


def default_slot(n: int) -> dict:
    return {
        "name": f"Command {n}", "add_as_favorite": True, "hard_button": "",
        "long_press_enabled": False, "input_activity_id": "", "activities": [],
    }


def bench_config() -> list[dict]:
    slots = [default_slot(n) for n in range(1, 11)]
    slots[0].update({"name": "BS One", "hard_button": "ok", "add_as_favorite": True, "activities": [str(ACTIVITY_ID)]})
    slots[1].update({"name": "BS Two", "add_as_favorite": True, "activities": [str(ACTIVITY_ID)]})
    slots[2].update({"name": "BS Three", "add_as_favorite": False, "input_activity_id": str(ACTIVITY_ID)})
    return slots


def rest(path: str, payload: dict | None = None, *, timeout: float = 30) -> object:
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
        return json.loads(resp.read().decode() or "null")


class HaWs:
    def __init__(self):
        self._ws = None
        self._next_id = 1

    async def __aenter__(self):
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        self._ws = await websockets.connect(WS_URL, ssl=ctx, max_size=32 * 1024 * 1024)
        await self._ws.recv()
        await self._ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        ok = json.loads(await self._ws.recv())
        if ok.get("type") != "auth_ok":
            raise SystemExit(f"WS auth failed: {ok}")
        return self

    async def __aexit__(self, *exc):
        await self._ws.close()

    async def cmd(self, payload: dict) -> dict:
        msg_id = self._next_id
        self._next_id += 1
        await self._ws.send(json.dumps({"id": msg_id, **payload}))
        while True:
            reply = json.loads(await self._ws.recv())
            if reply.get("id") == msg_id and reply.get("type") == "result":
                if not reply.get("success"):
                    raise RuntimeError(f"WS {payload.get('type')} failed: {reply.get('error')}")
                return reply.get("result") if reply.get("result") is not None else {}

    async def subscribe_until_done(self, payload: dict, *, timeout: float = 600) -> dict:
        """Subscribe (backup/progress_subscribe) and return the terminal event."""
        msg_id = self._next_id
        self._next_id += 1
        await self._ws.send(json.dumps({"id": msg_id, **payload}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            reply = json.loads(await asyncio.wait_for(self._ws.recv(), timeout=max(1, deadline - time.time())))
            if reply.get("id") != msg_id:
                continue
            if reply.get("type") == "result" and not reply.get("success"):
                raise RuntimeError(f"subscribe failed: {reply.get('error')}")
            if reply.get("type") == "event":
                event = reply.get("event") or {}
                if event.get("status") in ("success", "failed"):
                    return event
        raise SystemExit("operation did not finish in time")


# ── helpers over the integration's WS surface ────────────────────────────


async def wait_ws_ready(ws: HaWs) -> None:
    deadline = time.time() + 300
    while True:
        try:
            await ws.cmd({"type": "sofabaton_x1s/command_devices/list", "entry_id": ENTRY})
            return
        except RuntimeError as err:
            if "unknown_command" not in str(err) or time.time() > deadline:
                raise
            print("  integration WS not ready yet; waiting...")
            await asyncio.sleep(10)


async def bundle(ws: HaWs) -> dict:
    result = await ws.cmd({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": ENTRY})
    return result.get("bundle") or {}


def activity_entry(b: dict, act_id: int) -> dict | None:
    for act in b.get("activities") or []:
        if int((act.get("device") or {}).get("device_id") or 0) == act_id:
            return act
    return None


def device_entry(b: dict, dev_id: int) -> dict | None:
    for dev in b.get("devices") or []:
        if int((dev.get("device_id") if "device_id" in dev else (dev.get("device") or {}).get("device_id")) or 0) == dev_id:
            return dev
    return None


def refs_to(act: dict, dev_id: int) -> dict:
    """Every reference to *dev_id* in one activity entry, by site."""
    favs = sorted(int(f.get("command_id") or 0) for f in act.get("favorite_slots") or [] if int(f.get("device_id") or 0) == dev_id)
    short = sorted((int(r.get("button_id") or 0), int(r.get("command_id") or 0)) for r in act.get("button_bindings") or [] if int(r.get("device_id") or 0) == dev_id)
    long_ = sorted((int(r.get("button_id") or 0), int(r.get("long_press_command_id") or 0)) for r in act.get("button_bindings") or [] if int(r.get("long_press_device_id") or 0) == dev_id)
    steps = []
    inputs = []
    for macro in act.get("macros") or []:
        for step in macro.get("steps") or []:
            if int(step.get("device_id") or 0) != dev_id:
                continue
            cid = int(step.get("command_id") or 0)
            if cid == INPUT_REF:
                inputs.append((int(macro.get("button_id") or 0), int(step.get("duration") or 0)))
            else:
                steps.append((int(macro.get("button_id") or 0), cid))
    members = [int(m) for m in act.get("referenced_source_device_ids") or []]
    # Order-sensitive views with *dev_id* written as "X", so a before/after
    # comparison across a device-id change is literal: the quick-access
    # order (favorites_order resolved to content) and every power sequence.
    def _alias(d: int) -> object:
        return "X" if int(d) == dev_id else int(d)
    by_fav = {int(f.get("button_id") or 0): (_alias(f.get("device_id") or 0), int(f.get("command_id") or 0)) for f in act.get("favorite_slots") or []}
    order = [by_fav.get(int(i)) for i in act.get("favorites_order") or []]
    sequences = {
        int(m.get("button_id") or 0): [
            # The power-ref rows' duration byte is hub-owned (rewritten from
            # the device class: 1 for wifi_ip, 0 for wifi_mqtt); only the
            # input ref's ordinal and command steps carry ours.
            (_alias(st.get("device_id") or 0), int(st.get("command_id") or 0),
             0 if int(st.get("command_id") or 0) in (0xC6, 0xC7) else int(st.get("duration") or 0))
            for st in m.get("steps") or []
        ]
        for m in act.get("macros") or []
    }
    return {
        "favorites": favs, "short_legs": short, "long_legs": long_,
        "macro_steps": sorted(steps), "input_steps": sorted(inputs), "member": dev_id in members,
        "order": order, "sequences": sequences,
    }


async def bench_record(ws: HaWs) -> dict | None:
    result = await ws.cmd({"type": "sofabaton_x1s/command_devices/list", "entry_id": ENTRY})
    for dev in result.get("devices") or []:
        if DEVICE_KEY and dev.get("device_key") == DEVICE_KEY:
            return dev
        if not DEVICE_KEY and str(dev.get("device_name") or "") == BENCH_NAME:
            return dev
    return None


async def ensure_bench_record(ws: HaWs) -> str:
    global DEVICE_KEY
    existing = await bench_record(ws)
    if existing:
        DEVICE_KEY = str(existing.get("device_key") or "")
        print(f"adopting existing bench record device_key={DEVICE_KEY!r}")
        return DEVICE_KEY
    created = await ws.cmd({
        "type": "sofabaton_x1s/command_device/create", "entry_id": ENTRY,
        "device_name": BENCH_NAME, "transport": "http",
    })
    DEVICE_KEY = str(created.get("device_key") or "")
    if not DEVICE_KEY:
        raise SystemExit(f"create returned no device_key: {created}")
    print(f"created bench record device_key={DEVICE_KEY!r}")
    return DEVICE_KEY


async def ensure_bench_activity(ws: HaWs) -> int:
    global ACTIVITY_ID
    b = await bundle(ws)
    for act in b.get("activities") or []:
        if str((act.get("device") or {}).get("name") or "") == BENCH_NAME:
            ACTIVITY_ID = int(act["device"]["device_id"])
            print(f"adopting existing bench activity id={ACTIVITY_ID}")
            return ACTIVITY_ID
    result = await ws.cmd({"type": "sofabaton_x1s/activity/create", "entry_id": ENTRY, "name": BENCH_NAME})
    note(step="activity_create", result=result)
    for key in ("activity_id", "entity_id", "device_id", "id"):
        if isinstance(result.get(key), int):
            ACTIVITY_ID = int(result[key])
            break
    if not ACTIVITY_ID:
        await asyncio.sleep(3)
        b = await bundle(ws)
        for act in b.get("activities") or []:
            if str((act.get("device") or {}).get("name") or "") == BENCH_NAME:
                ACTIVITY_ID = int(act["device"]["device_id"])
    if not ACTIVITY_ID:
        raise SystemExit(f"activity create gave no id: {result}")
    print(f"created bench activity id={ACTIVITY_ID}")
    return ACTIVITY_ID


async def sync_progress(ws: HaWs) -> dict:
    return await ws.cmd({"type": "sofabaton_x1s/command_sync/progress", "entry_id": ENTRY, "device_key": DEVICE_KEY})


async def run_sync(ws: HaWs, *, timeout: float = 1200.0) -> tuple[dict, list[dict]]:
    """Run command_sync/run and poll progress until this run ends. Returns
    the terminal progress and the distinct (phase, message) stages seen."""
    before = await sync_progress(ws)
    stages: list[dict] = []
    run_task = asyncio.ensure_future(ws.cmd({"type": "sofabaton_x1s/command_sync/run", "entry_id": ENTRY, "device_key": DEVICE_KEY}))
    deadline = time.time() + timeout
    terminal: dict | None = None
    poll = HaWs()
    async with poll:
        while time.time() < deadline:
            prog = await poll.cmd({"type": "sofabaton_x1s/command_sync/progress", "entry_id": ENTRY, "device_key": DEVICE_KEY})
            stage = {k: prog.get(k) for k in ("phase", "step_kind", "step_name", "message", "transport_switch", "status")}
            if not stages or stages[-1] != stage:
                stages.append(stage)
            changed = any(prog.get(k) != before.get(k) for k in ("status", "message", "commands_hash", "current_step"))
            if changed and prog.get("status") in ("success", "failed") and run_task.done():
                terminal = prog
                break
            await asyncio.sleep(0.5)
    if terminal is None:
        raise SystemExit(f"sync did not finish within {timeout}s")
    try:
        run_result = await run_task
    except RuntimeError as err:
        run_result = {"error": str(err)}
    note(step="sync", terminal=terminal, run_result=run_result, stages=stages)
    return terminal, stages


async def activity_sync(ws: HaWs, baseline: dict, edited: dict) -> dict:
    start = await ws.cmd({
        "type": "sofabaton_x1s/activity/sync", "entry_id": ENTRY, "activity_id": ACTIVITY_ID,
        "baseline": baseline, "edited": edited,
    })
    op = str(start.get("operation_id") or "")
    event = await ws.subscribe_until_done({"type": "sofabaton_x1s/backup/progress_subscribe", "operation_id": op})
    try:
        await ws.cmd({"type": "sofabaton_x1s/backup/clear_result", "operation_id": op})
    except RuntimeError:
        pass
    note(step="activity_sync", event=event)
    return event


HA_LOG = Path("Z:/homeassistant/config/home-assistant.log")


class PressFeed:
    """The card's press feed (wifi_presses/subscribe) on its own connection:
    every press the integration dispatches, with the device id and the
    command index. The Wifi Commands sensor pulses for 0.3 s and resets, so
    polling it misses presses; the feed never does."""

    def __init__(self) -> None:
        self.events: list[dict] = []
        self._ws: HaWs | None = None
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        self._ws = HaWs()
        await self._ws.__aenter__()
        msg_id = self._ws._next_id
        self._ws._next_id += 1
        await self._ws._ws.send(json.dumps({"id": msg_id, "type": "sofabaton_x1s/wifi_presses/subscribe", "entry_id": ENTRY}))
        reply = json.loads(await self._ws._ws.recv())
        if not reply.get("success"):
            raise SystemExit(f"press subscribe failed: {reply}")

        async def _pump() -> None:
            while True:
                reply = json.loads(await self._ws._ws.recv())
                if reply.get("type") == "event" and reply.get("id") == msg_id:
                    self.events.append(reply.get("event") or {})

        self._task = asyncio.ensure_future(_pump())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
        if self._ws:
            await self._ws.__aexit__(None, None, None)


PRESSES = PressFeed()


def _log_tail_from(offset: int) -> str:
    try:
        with HA_LOG.open("rb") as fh:
            fh.seek(offset)
            return fh.read().decode("utf-8", "replace")
    except OSError:
        return ""


async def press_and_wait(dev_id: int, command_id: int, *, expect_transport: str, timeout: float = 15.0, device_name: str = BENCH_NAME) -> tuple[bool, str]:
    """Activate a device command via remote.send_command, wait for the press
    on the feed, then name the transport from the integration's own log line
    ([WIFI_MQTT] press ... / [WIFI_HTTP] request completed ...)."""
    seen = len(PRESSES.events)
    log_offset = HA_LOG.stat().st_size if HA_LOG.exists() else 0
    rest("/api/services/remote/send_command", {"entity_id": REMOTE, "command": command_id, "device": dev_id})
    deadline = time.time() + timeout
    event: dict | None = None
    while time.time() < deadline:
        for candidate in PRESSES.events[seen:]:
            if int(candidate.get("device_id") or 0) == dev_id and candidate.get("command_index") == command_id - 1:
                event = candidate
                break
        if event is not None:
            break
        await asyncio.sleep(0.2)
    if event is None:
        return False, "no press on the feed within the timeout"
    transport = ""
    scan_deadline = time.time() + 8
    while time.time() < scan_deadline and not transport:
        tail = _log_tail_from(log_offset)
        if f"[WIFI_MQTT] press device_id={dev_id} key_id={command_id} " in tail:
            transport = "mqtt"
        elif f"[WIFI_HTTP] request completed" in tail and f"/{dev_id}/{command_id - 1}/" in tail:
            transport = "http"
        else:
            await asyncio.sleep(0.5)
    ok = transport == expect_transport and str(event.get("device_name") or "") == device_name
    return ok, f"feed: from={event.get('device_name')!r} label={event.get('command_label')!r} press={event.get('press_type')!r}; log transport={transport or 'not found'!r}"


# ── the bench ────────────────────────────────────────────────────────────


async def main() -> None:
    cfg = rest("/api/config")
    print(f"HA {cfg.get('version')} state={cfg.get('state')}")
    if cfg.get("state") != "RUNNING":
        raise SystemExit("HA is not RUNNING")
    async with HaWs() as ws:
        await wait_ws_ready(ws)
        await PRESSES.start()
        listing = await ws.cmd({"type": "sofabaton_x1s/command_devices/list", "entry_id": ENTRY})
        check("GATE: MQTT available for the X2 entry", bool(listing.get("mqtt_available")))
        await ensure_bench_activity(ws)
        await ensure_bench_record(ws)

        # ── 1. first deploy over HTTP ───────────────────────────────────
        print("\n== first deploy (HTTP) ==")
        await ws.cmd({
            "type": "sofabaton_x1s/command_config/set", "entry_id": ENTRY,
            "commands": bench_config(), "device_key": DEVICE_KEY,
            "power_on_command_id": 1, "power_off_command_id": 2,
        })
        rec = await bench_record(ws)
        if rec and rec.get("deployed_device_id"):
            print(f"  already deployed as device {rec.get('deployed_device_id')} over {rec.get('deployed_transport')}; syncing anyway")
        prog, stages = await run_sync(ws)
        check("GATE: first sync succeeded", prog.get("status") == "success", str(prog.get("message")))
        rec = await bench_record(ws)
        dev_http = int(rec.get("deployed_device_id") or 0) if rec else 0
        check("GATE: deployed over HTTP", bool(rec) and rec.get("deployed_transport") == "http" and dev_http > 0,
              f"device_id={dev_http} transport={rec.get('deployed_transport') if rec else None}")

        # ── 2. editor-made references ───────────────────────────────────
        print("\n== editor-made references (activity sync) ==")
        base = await bundle(ws)
        act = activity_entry(base, ACTIVITY_ID)
        check("GATE: scratch activity readable", act is not None)
        edited = copy.deepcopy(base)
        eact = activity_entry(edited, ACTIVITY_ID)
        eact.setdefault("button_bindings", []).append({
            "button_id": BUTTON_LONG, "device_id": dev_http, "command_id": 2,
            "long_press_device_id": dev_http, "long_press_command_id": 3,
        })
        for macro in eact.get("macros") or []:
            if int(macro.get("button_id") or 0) == POWER_ON_MACRO:
                macro.setdefault("steps", []).append({
                    "device_id": dev_http, "command_id": 2, "button_code": 0, "duration": 0, "delay": 0xFF,
                })
                break
        else:
            eact.setdefault("macros", []).append({"button_id": POWER_ON_MACRO, "name": "POWER_ON", "steps": [
                {"device_id": dev_http, "command_id": 2, "button_code": 0, "duration": 0, "delay": 0xFF},
            ]})
        event = await activity_sync(ws, base, edited)
        check("GATE: activity sync succeeded", event.get("status") == "success", str(event.get("error") or event.get("message") or ""))
        await asyncio.sleep(2)
        before_b = await bundle(ws)
        before_refs = refs_to(activity_entry(before_b, ACTIVITY_ID) or {}, dev_http)
        print(f"  refs before: {json.dumps(before_refs)}")
        note(step="refs_before", device_id=dev_http, refs=before_refs)
        check("favorites from the slot config are on the hub", before_refs["favorites"] == [1, 2], str(before_refs["favorites"]))
        check("short legs (ok from config, green from the editor) are on the hub", before_refs["short_legs"] == sorted([(0xB0, 1), (BUTTON_LONG, 2)]), str(before_refs["short_legs"]))
        check("editor-made long leg is on the hub", before_refs["long_legs"] == [(BUTTON_LONG, 3)], str(before_refs["long_legs"]))
        check("editor-made macro step is on the hub", (POWER_ON_MACRO, 2) in before_refs["macro_steps"], str(before_refs["macro_steps"]))
        check("input reference step is on the hub", bool(before_refs["input_steps"]), str(before_refs["input_steps"]))
        check("device is a member", before_refs["member"])

        # ── 3. G1: switch to MQTT ───────────────────────────────────────
        print("\n== G1: switch to MQTT ==")
        row = await ws.cmd({"type": "sofabaton_x1s/command_config/set_transport", "entry_id": ENTRY, "device_key": DEVICE_KEY, "transport": "mqtt"})
        check("set_transport marks the switch pending", bool(row.get("transport_switch_pending")) and bool(row.get("sync_needed")),
              f"pending={row.get('transport_switch_pending')} sync_needed={row.get('sync_needed')}")
        prog, stages = await run_sync(ws)
        check("GATE: switch sync succeeded", prog.get("status") == "success", str(prog.get("message")))
        phases = [s.get("phase") for s in stages if s.get("phase")]
        print(f"  stages: {phases}")
        check("run reported the transport switch", any(s.get("transport_switch") == "mqtt" for s in stages))
        check("replace path with the move stage", "creating_device" in phases and "moving_references" in phases and "deleting_device" in phases, str(phases))
        check("move happened before the delete", "moving_references" in phases and "deleting_device" in phases and phases.index("moving_references") < phases.index("deleting_device"))
        rec = await bench_record(ws)
        dev_mqtt = int(rec.get("deployed_device_id") or 0) if rec else 0
        check("GATE: store records MQTT with a new device id", bool(rec) and rec.get("deployed_transport") == "mqtt" and dev_mqtt and dev_mqtt != dev_http,
              f"{dev_http} -> {dev_mqtt} transport={rec.get('deployed_transport') if rec else None} port={rec.get('deployed_request_port') if rec else None}")
        check("no switch pending after the sync", not rec.get("transport_switch_pending") and not rec.get("sync_needed"), f"pending={rec.get('transport_switch_pending')} sync_needed={rec.get('sync_needed')}")
        after_b = await bundle(ws)
        new_dev = device_entry(after_b, dev_mqtt)
        new_class = str(((new_dev or {}).get("device") or {}).get("device_class") or "")
        check("GATE: new device is wifi_mqtt on the hub", new_class == "wifi_mqtt", f"class={new_class!r}")
        check("old device is gone from the hub", device_entry(after_b, dev_http) is None)
        after_refs = refs_to(activity_entry(after_b, ACTIVITY_ID) or {}, dev_mqtt)
        stale_refs = refs_to(activity_entry(after_b, ACTIVITY_ID) or {}, dev_http)
        print(f"  refs after:  {json.dumps(after_refs)}")
        note(step="refs_after_mqtt", device_id=dev_mqtt, refs=after_refs, stale=stale_refs)
        for site in ("favorites", "short_legs", "long_legs", "macro_steps", "input_steps", "order", "sequences"):
            check(f"G1: {site} moved onto the new device", after_refs[site] == before_refs[site], f"{before_refs[site]} -> {after_refs[site]}")
        check("G1: new device is a member", after_refs["member"])
        check("G1: nothing still points at the old device", not any(stale_refs[s] for s in ("favorites", "short_legs", "long_legs", "macro_steps", "input_steps")), json.dumps(stale_refs))

        # ── 4. G2: presses arrive over MQTT ─────────────────────────────
        print("\n== G2: presses over MQTT ==")
        for cid in (1, 2, 3):
            ok, detail = await press_and_wait(dev_mqtt, cid, expect_transport="mqtt")
            check(f"G2: command {cid} arrives over MQTT", ok, detail)
            await asyncio.sleep(1.5)

        # ── 5. G3: back to HTTP ─────────────────────────────────────────
        print("\n== G3: switch back to HTTP ==")
        row = await ws.cmd({"type": "sofabaton_x1s/command_config/set_transport", "entry_id": ENTRY, "device_key": DEVICE_KEY, "transport": "http"})
        check("set_transport (http) marks the switch pending", bool(row.get("transport_switch_pending")))
        prog, stages = await run_sync(ws)
        check("GATE: switch-back sync succeeded", prog.get("status") == "success", str(prog.get("message")))
        phases = [s.get("phase") for s in stages if s.get("phase")]
        check("switch-back reported", any(s.get("transport_switch") == "http" for s in stages) and "moving_references" in phases, str(phases))
        rec = await bench_record(ws)
        dev_http2 = int(rec.get("deployed_device_id") or 0) if rec else 0
        check("GATE: store records HTTP with a new device id", bool(rec) and rec.get("deployed_transport") == "http" and dev_http2 and dev_http2 != dev_mqtt,
              f"{dev_mqtt} -> {dev_http2} port={rec.get('deployed_request_port') if rec else None}")
        back_b = await bundle(ws)
        back_class = str(((device_entry(back_b, dev_http2) or {}).get("device") or {}).get("device_class") or "")
        check("GATE: device is wifi_ip again on the hub", back_class == "wifi_ip", f"class={back_class!r}")
        back_refs = refs_to(activity_entry(back_b, ACTIVITY_ID) or {}, dev_http2)
        note(step="refs_after_http", device_id=dev_http2, refs=back_refs)
        for site in ("favorites", "short_legs", "long_legs", "macro_steps", "input_steps", "order", "sequences"):
            check(f"G3: {site} moved back", back_refs[site] == before_refs[site], f"{before_refs[site]} -> {back_refs[site]}")
        for cid in (1, 2, 3):
            ok, detail = await press_and_wait(dev_http2, cid, expect_transport="http")
            check(f"G3: command {cid} arrives over HTTP", ok, detail)
            await asyncio.sleep(1.5)

        # ── 6. cleanup ──────────────────────────────────────────────────
        if SKIP_CLEANUP:
            print("\ncleanup SKIPPED")
        else:
            print("\n== cleanup ==")
            await ws.cmd({
                "type": "sofabaton_x1s/command_config/set", "entry_id": ENTRY,
                "commands": [default_slot(n) for n in range(1, 11)], "device_key": DEVICE_KEY,
            })
            prog, _ = await run_sync(ws)
            check("cleanup sync succeeded", prog.get("status") == "success", str(prog.get("message")))
            rec = await bench_record(ws)
            check("managed device deleted", bool(rec) and not rec.get("deployed_device_id"))
            try:
                await ws.cmd({"type": "sofabaton_x1s/command_device/delete", "entry_id": ENTRY, "device_key": DEVICE_KEY})
                print("  store record deleted")
            except RuntimeError as err:
                print(f"  store record delete: {err}")
            await asyncio.sleep(3)
            b = await bundle(ws)
            if activity_entry(b, ACTIVITY_ID) is not None:
                try:
                    await ws.cmd({"type": "sofabaton_x1s/activity/delete", "entry_id": ENTRY, "activity_id": ACTIVITY_ID})
                    print("  scratch activity deleted")
                except RuntimeError as err:
                    print(f"  activity delete: {err}")
            else:
                print("  scratch activity purged by the hub with its last device")
        await PRESSES.stop()


def write_report(name: str) -> int:
    failed = [c for c in checks if not c[1]]
    report = OUT / f"{name}_{time.strftime('%Y%m%d-%H%M%S')}.json"
    report.write_text(json.dumps({"checks": checks, "log": log}, indent=2, default=str), encoding="utf-8")
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed; report {report}")
    return len(failed)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        failed_count = write_report("bench_310")
    if failed_count:
        sys.exit(1)
