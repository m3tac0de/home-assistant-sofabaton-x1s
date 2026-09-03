"""IR7 loopback, HA side: drive the payload editor's learn backend live.

The card's Learn > From a remote flow subscribes to
``sofabaton_x1s/ir_learn/subscribe`` on the Home Assistant websocket
and waits for ``listening`` then one terminal event (``learned`` with
``payload_hex``, ``timed_out``, ``interrupted``, ``cancelled``). This
bench does exactly that against the HA-managed LEARNER hub while the
EMITTER hub (on the bench, disabled in HA) plays a known source, then
compares the event payload with what was sent - the same check
bench_160 does, but through HA instead of the standalone library.

Usage:
  bench_161_ha_learn_subscribe.py <emit_ip> <emit_ver> <learner_entry_id> <tag> [--timeout S] [--lead S] [--times N] [--cancel-after S]

  --cancel-after S   unsubscribe S seconds after arming instead of playing
                     (exercises the cancel-on-unsubscribe path; expect the
                     hub to be re-armable right after)

Source: library Samsung POWER (NECx-f16 D=7 S=7 F=2), rendered via
build_raw_ir_blob_body like the emitter entity does.
"""

from __future__ import annotations

import asyncio
import json
import ssl
import sys
import threading
import time
from pathlib import Path
from typing import Any

import websockets

from bench_common import REPO, connect, save_json, setup_logging
from x1slib.blob_decoders import build_raw_ir_blob_body, parse_raw_ir_blob_body

if len(sys.argv) < 5:
    raise SystemExit(__doc__)

EMIT_HOST, EMIT_VER, ENTRY_ID, TAG = sys.argv[1:5]
rest = sys.argv[5:]


def opt(name: str, default: str) -> str:
    return rest[rest.index(name) + 1] if name in rest else default


TIMEOUT = float(opt("--timeout", "20"))
LEAD = float(opt("--lead", "2"))
TIMES = int(opt("--times", "1"))
CANCEL_AFTER = float(opt("--cancel-after", "0"))

log_path = setup_logging(f"ha-learn-{TAG}")
print(f"logging to {log_path}")

_SCRIPTS = REPO / "scripts"
_CFG = json.loads((_SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
_TOKEN = (_SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
WS_URL = _CFG["base_url"].replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/api/websocket"
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE

from infrared_protocols.codes.samsung.tv import SamsungTVCode  # noqa: E402

_cmd = SamsungTVCode["POWER"].to_command()
SENT = [abs(int(t)) for t in _cmd.get_raw_timings()]
CARRIER = int(_cmd.modulation)
BLOB = build_raw_ir_blob_body(SENT, CARRIER)
SENT_WORDS = parse_raw_ir_blob_body(BLOB)[0]


async def one_loop(emitter: Any, idx: int) -> dict[str, Any]:
    result: dict[str, Any] = {"loop": idx, "events": []}
    async with websockets.connect(WS_URL, ssl=_SSL, max_size=None) as ws:
        await ws.recv()
        await ws.send(json.dumps({"type": "auth", "access_token": _TOKEN}))
        auth = json.loads(await ws.recv())
        if auth.get("type") != "auth_ok":
            raise RuntimeError(f"auth failed: {auth}")
        sub_id = 10 + idx
        t0 = time.monotonic()
        await ws.send(json.dumps({
            "id": sub_id,
            "type": "sofabaton_x1s/ir_learn/subscribe",
            "entry_id": ENTRY_ID,
            "timeout": int(round(TIMEOUT)),  # schema: int, the card rounds too
        }))
        played = False
        cancelled = False
        deadline = time.monotonic() + TIMEOUT + 15

        async def play_later() -> None:
            nonlocal played
            await asyncio.sleep(LEAD)
            if CANCEL_AFTER:
                return
            t1 = time.monotonic()
            ok = await asyncio.to_thread(emitter.play_ir_blob, BLOB)
            played = True
            result["play"] = {"ok": bool(ok), "seconds": round(time.monotonic() - t1, 3),
                              "at": round(time.monotonic() - t0, 3)}
            print(f"  play: {'ACKED' if ok else 'REJECTED'} at +{result['play']['at']:.2f}s")

        async def cancel_later() -> None:
            nonlocal cancelled
            if not CANCEL_AFTER:
                return
            await asyncio.sleep(CANCEL_AFTER)
            await ws.send(json.dumps({"id": sub_id + 100, "type": "unsubscribe_events",
                                      "subscription": sub_id}))
            cancelled = True
            print(f"  unsubscribed at +{time.monotonic() - t0:.2f}s")

        tasks = [asyncio.create_task(play_later()), asyncio.create_task(cancel_later())]
        terminal = None
        while time.monotonic() < deadline:
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, deadline - time.monotonic()))
            except asyncio.TimeoutError:
                break
            msg = json.loads(raw)
            if msg.get("id") == sub_id and msg.get("type") == "result":
                result["subscribe_result"] = {"success": msg.get("success"), "error": msg.get("error")}
                print(f"  subscribe: {'ok' if msg.get('success') else msg.get('error')} at +{time.monotonic() - t0:.2f}s")
                if not msg.get("success"):
                    break
                continue
            if msg.get("id") == sub_id and msg.get("type") == "event":
                ev = msg.get("event") or {}
                ev["_at"] = round(time.monotonic() - t0, 3)
                result["events"].append(ev)
                state = ev.get("state")
                print(f"  event: {state} at +{ev['_at']:.2f}s"
                      + (f" ({ev.get('interrupted_by')})" if ev.get("interrupted_by") else ""))
                if state != "listening":
                    terminal = ev
                    break
            if cancelled and msg.get("id") == sub_id + 100:
                result["unsubscribe_result"] = {"success": msg.get("success")}
                # give the backend a moment to emit anything else, then stop
                await asyncio.sleep(1.0)
                break
        for t in tasks:
            t.cancel()
    result["played"] = played
    if terminal and terminal.get("state") == "learned" and terminal.get("payload_hex"):
        blob = bytes.fromhex(terminal["payload_hex"])
        try:
            words, carrier = parse_raw_ir_blob_body(blob)
        except ValueError as exc:
            result["parse_error"] = str(exc)
            print(f"  learned payload unparseable: {exc}")
            return result
        n = min(len(words), len(SENT_WORDS)) - 1
        deltas = [words[k] - SENT_WORDS[k] for k in range(n)]
        result["compare"] = {
            "sent_count": len(SENT_WORDS), "learned_count": len(words),
            "carrier_hz": carrier, "max_abs_delta": max(map(abs, deltas)) if deltas else None,
            "count_match": len(words) == len(SENT_WORDS),
        }
        print(f"  learned: {len(words)} words (sent {len(SENT_WORDS)}), carrier {carrier} Hz, "
              f"max |delta| {result['compare']['max_abs_delta']} us")
    return result


async def main() -> None:
    artifacts: dict[str, Any] = {
        "emitter": {"host": EMIT_HOST, "version": EMIT_VER},
        "learner_entry": ENTRY_ID,
        "timeout": TIMEOUT, "lead": LEAD, "cancel_after": CANCEL_AFTER,
        "sent_words": SENT_WORDS, "carrier_hz": CARRIER, "loops": [],
    }
    emitter = None if CANCEL_AFTER else connect(EMIT_HOST, EMIT_VER)
    try:
        for i in range(TIMES):
            if i:
                await asyncio.sleep(1.0)
            print(f" loop {i + 1}/{TIMES}")
            artifacts["loops"].append(await one_loop(emitter, i + 1))
    finally:
        out = save_json(f"ha-learn-{TAG}", artifacts)
        if emitter is not None:
            emitter.stop()
        print(f"saved {out}")
    learned = sum(1 for lp in artifacts["loops"] if lp.get("compare", {}).get("count_match"))
    print(f"summary: {learned}/{TIMES} learned with matching word count")
    if not CANCEL_AFTER and learned < TIMES:
        sys.exit(1)


asyncio.run(main())
