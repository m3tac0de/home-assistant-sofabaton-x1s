"""RF editor bench R0: RF learn arm/exit probe, no emission, no config writes.

Plan: docs/internal/rf-editor-bench-plan.md (R0).

Three modes:

  lib <ip> <X1S|X2> <tag>     direct to the hub (its HA entry must be off).
                               Legs: 433 short window, 315 short window,
                               433 long window (the hub's own expiry and
                               our re-arm), cancel after 3 s then re-arm,
                               then a device catalog read (the hub left
                               learn mode). Every hub frame is logged.
  ha <entry_id> <tag> [--band 433|315] [--window S]
                               the editor's Learn path through Home
                               Assistant: ir_learn/subscribe with band,
                               no emission; expect listening + timed_out.
  ha-refuse <entry_id> <tag>   the X1 gate: blobs/play and
                               ir_learn/subscribe with band must both
                               answer rf_unsupported (no hub traffic).

Options (lib): --short S (default 10), --long S (default 75),
--legs short433,short315,long433,cancel,read (default all).
Artifacts: out/rf-probe-<tag>.json and a frame log in out/logs/.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import ssl
import sys
import threading
import time
from typing import Any

from bench_common import REPO, connect, save_json, setup_logging

if len(sys.argv) < 4:
    raise SystemExit(__doc__)

MODE = sys.argv[1]
rest = sys.argv[2:]


def opt(name: str, default: str) -> str:
    return rest[rest.index(name) + 1] if name in rest else default


# --------------------------------------------------------------------------
# lib mode
# --------------------------------------------------------------------------

class _Collector(logging.Handler):
    """Keeps every log record with its monotonic time, for per-leg slicing."""

    def __init__(self) -> None:
        super().__init__(logging.DEBUG)
        self.lines: list[tuple[float, str]] = []
        self._lock = threading.Lock()

    def emit(self, record: logging.LogRecord) -> None:
        with self._lock:
            self.lines.append((time.monotonic(), record.getMessage()))

    def since(self, idx: int) -> list[tuple[float, str]]:
        with self._lock:
            return list(self.lines[idx:])

    def mark(self) -> int:
        with self._lock:
            return len(self.lines)


_WIRE = re.compile(r"\[WIRE\] #\d+ (H→A|A→H) ([0-9a-f ]+)$")
_FRAME = re.compile(r"\[FRAME\] (H→A|A→H) (.+)$")


def _leg_trace(lines: list[tuple[float, str]], t0: float) -> dict[str, Any]:
    wire: list[dict[str, Any]] = []
    frames: list[str] = []
    notes: list[str] = []
    for ts, msg in lines:
        m = _WIRE.search(msg)
        if m:
            raw = bytes.fromhex(m.group(2))
            entry = {"at": round(ts - t0, 3), "dir": m.group(1), "hex": raw.hex(" ")}
            if len(raw) >= 4 and raw[:2] == b"\xa5\x5a":
                entry["opcode"] = f"0x{raw[2]:02X}{raw[3]:02X}"
            wire.append(entry)
            continue
        m = _FRAME.search(msg)
        if m:
            frames.append(f"+{ts - t0:.2f}s {m.group(1)} {m.group(2)}")
            continue
        if "[RF_LEARN]" in msg or "[IR_LEARN]" in msg:
            notes.append(f"+{ts - t0:.2f}s {msg[msg.index('['):] if '[' in msg else msg}")
    return {"wire": wire, "frames": frames, "notes": notes}


def run_lib() -> None:
    host, ver, tag = rest[0], rest[1], rest[2]
    short = float(opt("--short", "10"))
    long_ = float(opt("--long", "75"))
    legs = opt("--legs", "short433,short315,long433,cancel,read").split(",")
    log_path = setup_logging(f"rf-probe-{tag}")
    collector = _Collector()
    logging.getLogger().addHandler(collector)
    print(f"logging to {log_path}")

    proxy = connect(host, ver)
    out: dict[str, Any] = {"host": host, "version": ver, "legs": {}}
    try:
        time.sleep(3.0)  # let the connect-time catalog reads settle
        print(f"rf_codes_supported: {proxy.rf_codes_supported()}")

        def leg(name: str, fn) -> None:
            mark = collector.mark()
            t0 = time.monotonic()
            print(f"-- {name}")
            try:
                result = fn()
            except Exception as exc:  # noqa: BLE001 - bench reports everything
                result = {"exception": repr(exc)}
            elapsed = round(time.monotonic() - t0, 2)
            time.sleep(1.0)  # trailing pushes after the exit
            trace = _leg_trace(collector.since(mark), t0)
            out["legs"][name] = {"result": result, "elapsed_s": elapsed, **trace}
            h2a = [w for w in trace["wire"] if w["dir"] == "H→A"]
            print(f"   result {result} in {elapsed}s; {len(h2a)} hub frame(s)")
            for w in h2a:
                print(f"   +{w['at']:.2f}s H→A {w.get('opcode', '?')} {w['hex'][:72]}")
            for n in trace["notes"]:
                print(f"   {n}")
            time.sleep(1.0)

        if "short433" in legs:
            leg("short433", lambda: proxy.rf_learn_command(band=433, timeout=short))
        if "short315" in legs:
            leg("short315", lambda: proxy.rf_learn_command(band=315, timeout=short))
        if "long433" in legs:
            leg("long433", lambda: proxy.rf_learn_command(band=433, timeout=long_))
        if "cancel" in legs:
            def cancel_then_rearm() -> dict[str, Any]:
                box: dict[str, Any] = {}
                th = threading.Thread(
                    target=lambda: box.update(r=proxy.rf_learn_command(band=433, timeout=30)),
                    daemon=True,
                )
                th.start()
                time.sleep(3.0)
                box["cancel_returned"] = proxy.cancel_ir_learn()
                th.join(10)
                box["rearm"] = proxy.rf_learn_command(band=433, timeout=5)
                return box
            leg("cancel", cancel_then_rearm)
        if "read" in legs:
            def read_devices() -> dict[str, Any]:
                proxy.get_devices(force_refresh=True)
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    devices, ready = proxy.get_devices(fetch_if_missing=False)
                    if ready and devices:
                        return {"ready": True, "devices": {k: v.get("name") for k, v in devices.items()}}
                    time.sleep(0.5)
                return {"ready": False}
            leg("read", read_devices)
    finally:
        path = save_json(f"rf-probe-{tag}", out)
        proxy.stop()
        print(f"saved {path}")


# --------------------------------------------------------------------------
# ha modes
# --------------------------------------------------------------------------

_SCRIPTS = REPO / "scripts"
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE

# S1 Off from docs/internal/rf-test/rf-synth-test-315.json, only used as a
# well-formed blob for the X1 refusal check (never reaches a hub).
_S1_FILE = REPO / "docs" / "internal" / "rf-test" / "rf-synth-test-315.json"


async def _ha_ws():
    import websockets

    cfg = json.loads((_SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
    token = (_SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
    url = cfg["base_url"].replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/api/websocket"
    ws = await websockets.connect(url, ssl=_SSL if url.startswith("wss") else None, max_size=None)
    await ws.recv()
    await ws.send(json.dumps({"type": "auth", "access_token": token}))
    auth = json.loads(await ws.recv())
    if auth.get("type") != "auth_ok":
        raise RuntimeError(f"auth failed: {auth}")
    return ws


async def _one(ws, msg_id: int, payload: dict[str, Any], wait: float = 20.0) -> dict[str, Any]:
    await ws.send(json.dumps({"id": msg_id, **payload}))
    deadline = time.monotonic() + wait
    while time.monotonic() < deadline:
        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=deadline - time.monotonic()))
        if msg.get("id") == msg_id and msg.get("type") == "result":
            return msg
    raise TimeoutError(payload["type"])


async def run_ha_refuse() -> None:
    entry_id, tag = rest[0], rest[1]
    bundle = json.loads(_S1_FILE.read_text(encoding="utf-8"))
    s1_hex = bundle["devices"][0]["commands"][0]["restore_data"]["data_hex"]
    ws = await _ha_ws()
    out: dict[str, Any] = {"entry_id": entry_id}
    try:
        play = await _one(ws, 1, {"type": "sofabaton_x1s/blobs/play", "entry_id": entry_id,
                                  "blob": s1_hex, "band": 433})
        learn = await _one(ws, 2, {"type": "sofabaton_x1s/ir_learn/subscribe", "entry_id": entry_id,
                                   "timeout": 10, "band": 433})
        out["play"] = {"success": play.get("success"), "error": play.get("error")}
        out["learn"] = {"success": learn.get("success"), "error": learn.get("error")}
    finally:
        await ws.close()
    for k in ("play", "learn"):
        code = (out[k].get("error") or {}).get("code")
        print(f"{k}: success={out[k]['success']} code={code} -> {'PASS' if code == 'rf_unsupported' else 'FAIL'}")
    print(f"saved {save_json(f'rf-probe-{tag}', out)}")


async def run_ha_learn() -> None:
    entry_id, tag = rest[0], rest[1]
    band = int(opt("--band", "433"))
    window = int(float(opt("--window", "15")))
    ws = await _ha_ws()
    out: dict[str, Any] = {"entry_id": entry_id, "band": band, "window": window, "events": []}
    t0 = time.monotonic()
    try:
        await ws.send(json.dumps({"id": 1, "type": "sofabaton_x1s/ir_learn/subscribe",
                                  "entry_id": entry_id, "timeout": window, "band": band}))
        deadline = time.monotonic() + window + 20
        while time.monotonic() < deadline:
            try:
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=deadline - time.monotonic()))
            except asyncio.TimeoutError:
                break
            if msg.get("id") != 1:
                continue
            at = round(time.monotonic() - t0, 2)
            if msg.get("type") == "result":
                out["subscribe"] = {"success": msg.get("success"), "error": msg.get("error"), "at": at}
                print(f"subscribe: {'ok' if msg.get('success') else msg.get('error')} at +{at}s")
                if not msg.get("success"):
                    break
                continue
            ev = dict(msg.get("event") or {})
            ev["_at"] = at
            out["events"].append(ev)
            print(f"event: {ev.get('state')} at +{at}s {ev.get('error_code') or ''}")
            if ev.get("state") != "listening":
                break
    finally:
        await ws.close()
    print(f"saved {save_json(f'rf-probe-{tag}', out)}")


if MODE == "lib":
    run_lib()
elif MODE == "ha":
    asyncio.run(run_ha_learn())
elif MODE == "ha-refuse":
    asyncio.run(run_ha_refuse())
else:
    raise SystemExit(__doc__)
