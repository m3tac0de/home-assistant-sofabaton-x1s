"""In-place deploy P2 live validation: end-to-end through the REAL HA path.

Drives the deployed dev HA instance's own APIs — no direct hub connection:

  1. save a fresh Wifi Commands config under the reserved bench key
     ``benchwifi`` (WS ``command_config/set``),
  2. ``sync_command_config`` service → REPLACE path (first deploy for the
     key; backfills ``deployed_request_port``),
  3. drive an activity transition via the activity ``select`` entity and
     watch the wifi-commands sensor for the managed device's callbacks,
  4. edit the config across several diff dimensions (rename, power id,
     input activity move, favorite changes, hard button, device name),
  5. sync again → must go IN-PLACE: progress message "updated in place",
     the hub device id UNCHANGED, hash + port persisted,
  6. transition again (callbacks still fire),
  7. cleanup: zero-slot sync (deletes the managed device) + delete the
     benchwifi store record.

Only the ``benchwifi`` record is ever touched — production Wifi Command
records (other device_keys) are never modified.

Usage:
    python bench_116_ha_inplace_e2e.py <x1s|x1> [skipcleanup]

Reads base_url from scripts/.ha-config.json and the token from
scripts/.ha-token.
"""

from __future__ import annotations

import asyncio
import json
import ssl
import sys
import time
from pathlib import Path

import urllib.request

import websockets

HUB = sys.argv[1].lower() if len(sys.argv) > 1 else "x1s"
SKIP_CLEANUP = len(sys.argv) > 2 and sys.argv[2] == "skipcleanup"

SCRIPTS = Path(__file__).resolve().parent.parent
BASE_URL = json.loads((SCRIPTS / ".ha-config.json").read_text())["base_url"].rstrip("/")
TOKEN = (SCRIPTS / ".ha-token").read_text().strip()
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"

# Assigned by command_device/create at runtime (the store owns key
# allocation); identified across runs by the record's device name.
DEVICE_KEY = ""
BENCH_DEVICE_NAME = "Bench E2E"

PROFILES = {
    "x1s": {
        "sensor": "sensor.souterrain_hub_wifi_commands",
        "select": "select.souterrain_hub_activity",
        "ha_device_name": "X1S HUB",
        "act_a_name": "Play a game", "act_a_id": "102",
        "act_b_name": "Watch a movie", "act_b_id": "101",
        "off_name": "Powered Off",
    },
    "x1": {
        "sensor": "sensor.x1_hub_wifi_commands",
        "select": "select.x1_hub_activity",
        "ha_device_name": "X1 HUB",
        "act_a_name": "Watch Shield", "act_a_id": "102",
        "act_b_name": "Watch Apple TV", "act_b_id": "101",
        "off_name": "Powered Off",
    },
}
P = PROFILES[HUB]

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def default_slot(n: int) -> dict:
    # Mirrors the store's _default_slot exactly (add_as_favorite defaults to
    # True!) so an all-default config counts as ZERO configured slots and the
    # cleanup sync takes the delete path.
    return {
        "name": f"Command {n}", "add_as_favorite": True, "hard_button": "",
        "long_press_enabled": False, "input_activity_id": "", "activities": [],
    }


def config_v1() -> list[dict]:
    slots = [default_slot(n) for n in range(1, 11)]
    slots[0].update({"name": "E2E Power"})
    slots[1].update({"name": "E2E Off"})
    slots[2].update({"name": "E2E Input", "input_activity_id": P["act_a_id"]})
    slots[3].update({"name": "E2E Fav", "add_as_favorite": True, "activities": [P["act_a_id"]]})
    return slots


def config_v2() -> list[dict]:
    slots = [default_slot(n) for n in range(1, 11)]
    slots[0].update({"name": "E2E Power v2", "hard_button": "green", "activities": [P["act_a_id"]]})
    slots[1].update({"name": "E2E Off", "add_as_favorite": True, "activities": [P["act_a_id"]]})
    slots[2].update({"name": "E2E Input", "input_activity_id": P["act_b_id"]})
    slots[3].update({"name": "E2E Fav"})
    return slots


def rest(path: str, payload: dict | None = None, *, fire_and_forget: bool = False) -> object:
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    ctx = ssl.create_default_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return json.loads(resp.read().decode() or "null")
    except TimeoutError:
        # Long-running service calls (the replace deploy takes minutes) hold
        # the HTTP connection; the caller polls progress over WS instead.
        if fire_and_forget:
            return None
        raise


class HaWs:
    def __init__(self):
        self._ws = None
        self._next_id = 1

    async def __aenter__(self):
        ctx = ssl.create_default_context()
        self._ws = await websockets.connect(WS_URL, ssl=ctx, max_size=32 * 1024 * 1024)
        await self._ws.recv()  # auth_required
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
                return reply.get("result") or {}


async def ha_device_id(ws: HaWs) -> str:
    devices = await ws.cmd({"type": "config/device_registry/list"})
    for dev in devices:
        if dev.get("name_by_user") == P["ha_device_name"] or dev.get("name") == P["ha_device_name"]:
            if any(ident[0] == "sofabaton_x1s" for ident in dev.get("identifiers", [])):
                return dev["id"]
    raise SystemExit(f"HA device {P['ha_device_name']!r} not found in registry")


async def bench_record(ws: HaWs) -> dict | None:
    result = await ws.cmd({"type": "sofabaton_x1s/command_devices/list", "entity_id": P["sensor"]})
    for dev in result.get("devices") or []:
        if DEVICE_KEY and dev.get("device_key") == DEVICE_KEY:
            return dev
        if not DEVICE_KEY and str(dev.get("device_name") or "").startswith(BENCH_DEVICE_NAME):
            return dev
    return None


async def ensure_bench_record(ws: HaWs) -> str:
    """Create (or adopt from a prior partial run) the bench store record."""
    global DEVICE_KEY
    existing = await bench_record(ws)
    if existing:
        DEVICE_KEY = str(existing.get("device_key") or "")
        print(f"adopting existing bench record device_key={DEVICE_KEY!r}")
        return DEVICE_KEY
    created = await ws.cmd({
        "type": "sofabaton_x1s/command_device/create", "entity_id": P["sensor"],
        "device_name": BENCH_DEVICE_NAME,
    })
    DEVICE_KEY = str(created.get("device_key") or "")
    if not DEVICE_KEY:
        raise SystemExit(f"create returned no device_key: {created}")
    print(f"created bench record device_key={DEVICE_KEY!r}")
    return DEVICE_KEY


async def sync_progress(ws: HaWs) -> dict:
    return await ws.cmd({
        "type": "sofabaton_x1s/command_sync/progress",
        "entity_id": P["sensor"],
        "device_key": DEVICE_KEY,
    })


async def run_sync(ws: HaWs, dev_reg_id: str, *, device_name: str | None = None, timeout: float = 900.0) -> dict:
    """Fire the sync service and poll progress until THIS run finishes.

    The pre-fire progress snapshot guards against reading the previous
    sync's terminal state (a fast in-place run can finish between polls).
    """
    before = await sync_progress(ws)
    payload: dict = {"device": dev_reg_id, "device_key": DEVICE_KEY}
    if device_name is not None:
        payload["device_name"] = device_name
    rest("/api/services/sofabaton_x1s/sync_command_config", payload, fire_and_forget=True)
    deadline = time.time() + timeout
    while time.time() < deadline:
        prog = await sync_progress(ws)
        changed = any(prog.get(k) != before.get(k) for k in ("status", "message", "commands_hash", "current_step"))
        if changed and prog.get("status") in ("success", "failed"):
            return prog
        await asyncio.sleep(2.0)
    raise SystemExit(f"sync did not finish within {timeout}s")


def select_activity(option: str) -> None:
    rest("/api/services/select/select_option", {"entity_id": P["select"], "option": option})


def sensor_state() -> tuple[str, dict]:
    state = rest(f"/api/states/{P['sensor']}")
    return str(state.get("state")), dict(state.get("attributes") or {})


async def main() -> None:
    async with HaWs() as ws:
        dev_reg_id = await ha_device_id(ws)
        print(f"HA device id for {P['ha_device_name']}: {dev_reg_id}")

        # After an HA restart the integration's WS commands register late;
        # poll until the surface is live.
        deadline = time.time() + 180
        while True:
            try:
                await ws.cmd({"type": "sofabaton_x1s/command_devices/list", "entity_id": P["sensor"]})
                break
            except RuntimeError as err:
                if "unknown_command" not in str(err) or time.time() > deadline:
                    raise
                print("  integration WS not ready yet; waiting...")
                await asyncio.sleep(10)

        await ensure_bench_record(ws)

        # ── phase 1: save v1 + replace deploy ────────────────────────────
        print("\n== v1 config save + sync (replace path expected) ==")
        await ws.cmd({
            "type": "sofabaton_x1s/command_config/set", "entity_id": P["sensor"],
            "commands": config_v1(), "device_key": DEVICE_KEY,
            "power_on_command_id": 1, "power_off_command_id": 2,
        })
        prog = await run_sync(ws, dev_reg_id, device_name="Bench E2E")
        check("GATE: v1 sync succeeded", prog.get("status") == "success", f"{prog.get('message')}")
        check(
            "v1 went through the REPLACE path (fresh deploy)",
            "in place" not in str(prog.get("message") or "").lower(),
            f"message={prog.get('message')!r}",
        )
        rec = await bench_record(ws)
        check("GATE: benchwifi record deployed", bool(rec and rec.get("deployed_device_id")), f"{rec and {k: rec.get(k) for k in ('deployed_device_id', 'deployed_commands_hash', 'deployed_request_port')}}")
        dev_id_v1 = rec.get("deployed_device_id") if rec else None
        check(
            "deployed_request_port backfilled by the replace path",
            isinstance(rec.get("deployed_request_port"), int) if rec else False,
            f"port={rec.get('deployed_request_port') if rec else None}",
        )
        hash_v1 = rec.get("deployed_commands_hash") if rec else ""

        # ── phase 2: transition callbacks (informational on shared hubs) ──
        print("\n== activity transition (v1 callbacks) ==")
        select_activity(P["off_name"])
        await asyncio.sleep(8)
        pre_state, _ = sensor_state()
        select_activity(P["act_a_name"])
        await asyncio.sleep(12)
        on_state, on_attrs = sensor_state()
        print(f"  wifi sensor: {pre_state!r} -> {on_state!r} attrs={ {k: on_attrs.get(k) for k in ('device_name', 'command', 'command_name', 'press_type') if k in on_attrs} }")
        select_activity(P["off_name"])
        await asyncio.sleep(8)
        off_state, _ = sensor_state()
        print(f"  after off: {off_state!r}")

        # ── phase 3: v2 edit + in-place re-sync ──────────────────────────
        print("\n== v2 config save + sync (IN-PLACE expected) ==")
        await ws.cmd({
            "type": "sofabaton_x1s/command_config/set", "entity_id": P["sensor"],
            "commands": config_v2(), "device_key": DEVICE_KEY,
            "power_on_command_id": 1, "power_off_command_id": 2,
        })
        prog2 = await run_sync(ws, dev_reg_id, device_name="Bench E2E v2")
        check("GATE: v2 sync succeeded", prog2.get("status") == "success", f"{prog2.get('message')}")
        check(
            "GATE: v2 went IN-PLACE",
            "in place" in str(prog2.get("message") or "").lower(),
            f"message={prog2.get('message')!r}",
        )
        rec2 = await bench_record(ws)
        check(
            "GATE: hub device id UNCHANGED (the in-place point)",
            bool(rec2) and rec2.get("deployed_device_id") == dev_id_v1,
            f"v1={dev_id_v1} v2={rec2.get('deployed_device_id') if rec2 else None}",
        )
        check(
            "deployed hash advanced",
            bool(rec2) and rec2.get("deployed_commands_hash") not in ("", hash_v1),
            f"{hash_v1} -> {rec2.get('deployed_commands_hash') if rec2 else None}",
        )
        check(
            "deployed_request_port persisted across in-place sync",
            bool(rec2) and isinstance(rec2.get("deployed_request_port"), int),
            f"{rec2.get('deployed_request_port') if rec2 else None}",
        )

        # ── phase 4: transition callbacks after in-place ─────────────────
        print("\n== activity transition (v2 callbacks) ==")
        select_activity(P["act_b_name"])  # v2 moved the input here
        await asyncio.sleep(12)
        b_state, b_attrs = sensor_state()
        print(f"  wifi sensor after {P['act_b_name']!r}: {b_state!r} attrs={ {k: b_attrs.get(k) for k in ('device_name', 'command', 'command_name', 'press_type') if k in b_attrs} }")
        select_activity(P["off_name"])
        await asyncio.sleep(8)

        # ── phase 5: cleanup ─────────────────────────────────────────────
        if SKIP_CLEANUP:
            print("\ncleanup SKIPPED (deployment left for inspection)")
        else:
            print("\n== cleanup: zero-slot sync + delete record ==")
            await ws.cmd({
                "type": "sofabaton_x1s/command_config/set", "entity_id": P["sensor"],
                "commands": [default_slot(n) for n in range(1, 11)], "device_key": DEVICE_KEY,
            })
            prog3 = await run_sync(ws, dev_reg_id)
            check("GATE: cleanup sync succeeded", prog3.get("status") == "success", f"{prog3.get('message')}")
            rec3 = await bench_record(ws)
            check(
                "GATE: managed device deleted",
                bool(rec3) and not rec3.get("deployed_device_id"),
                f"{rec3 and rec3.get('deployed_device_id')}",
            )
            try:
                await ws.cmd({
                    "type": "sofabaton_x1s/command_device/delete", "entity_id": P["sensor"],
                    "device_key": DEVICE_KEY,
                })
                print("  benchwifi store record deleted")
            except RuntimeError as err:
                print(f"  store record delete: {err}")


asyncio.run(main())

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
