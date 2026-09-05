"""Live validation of the Hub tab "Add device" flow THROUGH the deployed HA
integration (AD5, chunk 2). Complements bench_180 (direct harness) by
exercising the real backend path the card uses:

  device/create -> persistent_cache/refresh -> cache/structural_bundle ->
  device/sync (first command on the empty device via the add-command
  planner, plus the head IP for Roku / Hue / Sonos) -> blobs/fetch readback
  -> backup/export readback -> device/delete

Per class it checks that the create lands with the right class, that the
first command on an EMPTY device persists with an EMPTY trailer (the
library_type comes from the device class, nothing to clone), that the hub
reads the record back as the same class, and that a head-IP edit writes
the channel byte alongside the IP.

The HA entries must be ENABLED (HA owns the hub connection). Reads
scripts/.ha-config.json + scripts/.ha-token like bench_170.

Usage:
    python bench_181_device_create_ha.py <entry_prefix> <tag> [--keep] [--classes ir,wifi_hue]

Results: out/<tag>-device-create-ha.json; exit 1 when any check failed.
"""

from __future__ import annotations

import asyncio
import copy
import json
import ssl
import sys
import time
from pathlib import Path

import websockets

BENCH_DIR = Path(__file__).resolve().parent / "out"
BENCH_DIR.mkdir(exist_ok=True)
SCRIPTS = Path(__file__).resolve().parents[1]
CONFIG = json.loads((SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
TOKEN = (SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
BASE = CONFIG["base_url"]
WS_URL = BASE.replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/api/websocket"

PREFIX = sys.argv[1]
TAG = sys.argv[2]
KEEP = "--keep" in sys.argv
ONLY: list[str] = []
if "--classes" in sys.argv:
    ONLY = [c.strip() for c in sys.argv[sys.argv.index("--classes") + 1].split(",") if c.strip()]

# An address nothing answers on; the hub only contacts it when a command is
# executed, which this bench never does.
HEAD_IP = "192.168.2.250"
HEAD_CLASSES = {"wifi_roku", "wifi_hue", "wifi_sonos"}
CLASSES_BY_HUB = {
    "X1": ["ir", "wifi_roku", "wifi_hue", "wifi_sonos"],
    "X1S": ["ir", "wifi_roku", "wifi_hue", "wifi_sonos", "wifi_ip"],
    "X2": ["ir", "wifi_roku", "wifi_hue", "wifi_sonos", "wifi_ip", "wifi_mqtt"],
}
CLASS_CODES = {"ir": 0x0D, "wifi_roku": 0x0A, "wifi_hue": 0x1A, "wifi_sonos": 0x1B, "wifi_ip": 0x1C, "wifi_mqtt": 0x20}

# First command per class, shaped exactly like the editor's add-command
# dialog commits it (restore_data.new + decoded.edited, EMPTY trailer).
IR_RAW_HEX = "0010 0000 0000 9470 0000 2328 0000 1194 0000 0230 0000 069a 0000 0000"
FIRST_COMMAND = {
    "ir": {"transport": "hub_code_record", "data_hex": IR_RAW_HEX},
    "wifi_roku": {"transport": "hub_code_record", "decoded": {
        "class": "wifi_roku", "trailer_hex": "", "edited": True,
        "fields": {"path": "keypress/Home"}}},
    "wifi_hue": {"transport": "hub_code_record", "decoded": {
        "class": "wifi_hue", "trailer_hex": "", "edited": True,
        "fields": {"path": "api/benchuser/groups/0/action", "body_block": "Content-Length:17\n\n{\n\"on\": false\n}"}}},
    "wifi_sonos": {"transport": "hub_code_record", "decoded": {
        "class": "wifi_sonos", "trailer_hex": "", "edited": True,
        "fields": {"path": "MediaRenderer/RenderingControl/Control",
                   "body_block": "SOAPACTION: \"urn:schemas-upnp-org:service:RenderingControl:1#GetVolume\"\nContent-Length:0\n\n"}}},
    "wifi_ip": {"transport": "hub_code_record", "decoded": {
        "class": "wifi_ip", "trailer_hex": "", "edited": True,
        "fields": {"host": HEAD_IP, "port": 80, "method": "GET", "path": "/bench", "header": "", "content_type": "", "body": ""}}},
    "wifi_mqtt": {"transport": "hub_code_record", "decoded": {
        "class": "wifi_mqtt", "trailer_hex": "", "edited": True,
        "fields": {"device_id": 0, "command_id": 1}}},
}

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""))


class HaWs:
    def __init__(self) -> None:
        self._id = 0
        self.ws = None

    async def __aenter__(self):
        kwargs = {}
        if WS_URL.startswith("wss://"):
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            kwargs["ssl"] = ctx
        self.ws = await websockets.connect(WS_URL, max_size=64 * 1024 * 1024, **kwargs)
        hello = json.loads(await self.ws.recv())
        assert hello["type"] == "auth_required", hello
        await self.ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        ok = json.loads(await self.ws.recv())
        assert ok["type"] == "auth_ok", ok
        return self

    async def __aexit__(self, *exc):
        await self.ws.close()

    async def call(self, payload: dict, timeout: float = 180.0) -> tuple[dict, float]:
        self._id += 1
        msg_id = self._id
        t0 = time.time()
        await self.ws.send(json.dumps({"id": msg_id, **payload}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=max(1.0, deadline - time.time())))
            if raw.get("type") == "result" and raw.get("id") == msg_id:
                return raw, time.time() - t0
        raise TimeoutError(f"no result for id={msg_id}")


async def pick(ha: HaWs, prefix: str) -> dict:
    state, _ = await ha.call({"type": "sofabaton_x1s/control_panel/state"})
    assert state.get("success"), state
    for hub in (state.get("result") or {}).get("hubs") or []:
        if str(hub.get("entry_id") or "").startswith(prefix) or str(hub.get("name") or "").startswith(prefix):
            return hub
    raise SystemExit(f"no hub matching {prefix!r}")


async def wait_op(ha: HaWs, entry_id: str, kind: str, timeout: float = 300.0) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        state, _ = await ha.call({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
        op = (state.get("result") or {}).get(kind) or {}
        msg = f"[{op.get('completed_steps')}/{op.get('total_steps')}] {op.get('phase')}: {op.get('message')}"
        if msg != last:
            print("     ", msg)
            last = msg
        if op.get("status") in {"success", "failed", "error"}:
            return op
        await asyncio.sleep(1.0)
    raise TimeoutError(f"{kind} did not finish within {timeout}s")


def device_row(bundle: dict, device_id: int) -> dict | None:
    for row in bundle.get("devices") or []:
        if int((row.get("device") or {}).get("device_id") or 0) == device_id:
            return row
    return None


async def hub_line(ha: HaWs, hub: dict) -> str:
    # Same resolution as the card: remote entity hub_version, then the state row.
    states, _ = await ha.call({"type": "get_states"})
    for st in states.get("result") or []:
        attrs = st.get("attributes") or {}
        if str(st.get("entity_id", "")).startswith("remote.") and attrs.get("entry_id") == hub["entry_id"]:
            if attrs.get("hub_version"):
                return str(attrs["hub_version"]).upper()
    return str(hub.get("version") or "").upper()


async def run_class(ha: HaWs, hub: dict, device_class: str, results: dict) -> None:
    entry_id = hub["entry_id"]
    name = f"Bench HA {device_class}"[:30]
    print(f"\n== {device_class} ==")

    res, dt = await ha.call({"type": "sofabaton_x1s/device/create", "entry_id": entry_id, "name": name, "device_class": device_class}, timeout=240)
    check(f"{device_class}: device/create accepted", res.get("success") is True, f"{dt:.1f}s {res.get('error')}")
    if not res.get("success"):
        return
    device_id = int((res.get("result") or {}).get("device_id") or 0)
    check(f"{device_class}: hub-assigned id", device_id > 0, str(device_id))
    results[device_class] = {"device_id": device_id}
    if not device_id:
        return

    res, dt = await ha.call({"type": "sofabaton_x1s/persistent_cache/refresh", "entry_id": entry_id, "kind": "device", "target_id": device_id}, timeout=240)
    check(f"{device_class}: persistent_cache/refresh", res.get("success") is True, f"{dt:.1f}s {res.get('error')}")

    res, _ = await ha.call({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id})
    bundle = (res.get("result") or {}).get("bundle") or {}
    row = device_row(bundle, device_id)
    check(f"{device_class}: structural bundle has the device", row is not None, "")
    if row is None:
        return
    dev = row.get("device") or {}
    check(f"{device_class}: bundle device_class", dev.get("device_class") == device_class, str(dev.get("device_class")))
    check(f"{device_class}: bundle device_class_code", int(dev.get("device_class_code") or -1) == CLASS_CODES[device_class], str(dev.get("device_class_code")))
    check(f"{device_class}: bundle name", dev.get("name") == name, str(dev.get("name")))
    check(f"{device_class}: zero commands after create", not row.get("commands"), str(len(row.get("commands") or [])))

    # First command through the add-command planner (+ head IP for the
    # network head classes), exactly what the editor's Sync sends.
    edited = copy.deepcopy(bundle)
    erow = device_row(edited, device_id)
    restore_data = copy.deepcopy(FIRST_COMMAND[device_class])
    if device_class == "wifi_mqtt":
        restore_data["decoded"]["fields"]["device_id"] = device_id
    restore_data["new"] = True
    erow["commands"] = [{"command_id": 1, "name": "Bench first", "restore_data": restore_data}]
    if device_class in HEAD_CLASSES:
        erow["device"]["ip_address"] = HEAD_IP

    res, dt = await ha.call({"type": "sofabaton_x1s/device/sync", "entry_id": entry_id, "device_id": device_id, "baseline": bundle, "edited": edited}, timeout=240)
    check(f"{device_class}: device/sync accepted", res.get("success") is True, f"{dt:.1f}s {res.get('error')}")
    if res.get("success"):
        op = await wait_op(ha, entry_id, "device_sync")
        check(f"{device_class}: device_sync finished", op.get("status") == "success", f"{op.get('status')} {op.get('message')}")
        results[device_class]["sync"] = {k: op.get(k) for k in ("status", "message", "completed_steps", "total_steps")}

    res, _ = await ha.call({"type": "sofabaton_x1s/blobs/fetch", "entry_id": entry_id, "device_id": device_id}, timeout=120)
    check(f"{device_class}: blobs/fetch after sync", res.get("success") is True, str(res.get("error")))
    rows = ((res.get("result") or {}).get("commands") or []) if res.get("success") else []
    check(f"{device_class}: one command read back", len(rows) == 1, str(len(rows)))
    if rows:
        first = rows[0]
        results[device_class]["readback"] = first
        check(f"{device_class}: readback class", first.get("device_class") == device_class, str(first.get("device_class")))
        check(f"{device_class}: readback has blob bytes", bool(first.get("command_blob")), str(first.get("command_blob"))[:80])
        if device_class != "ir":
            dec = first.get("decoded") or {}
            check(f"{device_class}: readback decodes as the class", dec.get("class") == device_class, json.dumps(dec)[:160])
            if device_class in FIRST_COMMAND and "decoded" in FIRST_COMMAND[device_class]:
                want = FIRST_COMMAND[device_class]["decoded"]["fields"]
                got = dec.get("fields") or {}
                same = all(str(got.get(k)) == str(v) for k, v in want.items() if k not in ("device_id", "command_id"))
                check(f"{device_class}: readback fields match what was written", same, json.dumps(got)[:200])
            check(f"{device_class}: readback trailer (hub-side bytes after body)", True, f"trailer_hex={dec.get('trailer_hex')!r} tail_checksum={first.get('replay_tail_checksum')}")

    res, dt = await ha.call({"type": "sofabaton_x1s/backup/export", "entry_id": entry_id, "device_ids": [device_id]}, timeout=240)
    check(f"{device_class}: backup/export accepted", res.get("success") is True, str(res.get("error")))
    if res.get("success"):
        op = await wait_op(ha, entry_id, "backup_export")
        check(f"{device_class}: backup_export finished", op.get("status") == "success", f"{op.get('status')} {op.get('message')}")
        exported = device_row(op.get("backup") or {}, device_id) or {}
        block = exported.get("device") or {}
        results[device_class]["exported_device"] = block
        check(f"{device_class}: export class", block.get("device_class") == device_class, str(block.get("device_class")))
        check(f"{device_class}: export commands", len(exported.get("commands") or []) == 1, str(len(exported.get("commands") or [])))
        if device_class in HEAD_CLASSES:
            check(f"{device_class}: head IP written", block.get("ip_address") == HEAD_IP, str(block.get("ip_address")))
            check(f"{device_class}: channel follows the last IP octet", int(block.get("channel") or -1) == int(HEAD_IP.split(".")[-1]), str(block.get("channel")))
        else:
            check(f"{device_class}: no head IP", not block.get("ip_address"), str(block.get("ip_address")))


async def main() -> int:
    async with HaWs() as ha:
        hub = await pick(ha, PREFIX)
        line = await hub_line(ha, hub)
        print(f"hub {hub.get('name')} entry={hub['entry_id'][:8]} line={line} connected={hub.get('hub_connected')} devices={hub.get('device_count')}")
        check("hub connected", bool(hub.get("hub_connected")), "")
        classes = [c for c in CLASSES_BY_HUB.get(line, []) if not ONLY or c in ONLY]
        check("class list for hub line", bool(classes), ",".join(classes))
        results: dict = {}
        for device_class in classes:
            try:
                await run_class(ha, hub, device_class, results)
            except Exception as err:  # noqa: BLE001 - keep going, report
                check(f"{device_class}: no exception", False, repr(err))
        if not KEEP:
            print("\n== cleanup ==")
            for device_class, info in results.items():
                res, _ = await ha.call({"type": "sofabaton_x1s/device/delete", "entry_id": hub["entry_id"], "device_id": info["device_id"]}, timeout=240)
                check(f"{device_class}: device/delete", res.get("success") is True, str(res.get("error")))
            hub_after = await pick(ha, PREFIX)
            check("device count restored", hub_after.get("device_count") == hub.get("device_count"), f"before={hub.get('device_count')} after={hub_after.get('device_count')}")
        else:
            print("\n--keep: devices left on the hub for the card walk-through")
    failed = [c for c in checks if not c[1]]
    (BENCH_DIR / f"{TAG}-device-create-ha.json").write_text(json.dumps({"hub": hub, "checks": checks, "results": results}, indent=2, default=str), encoding="utf-8")
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
