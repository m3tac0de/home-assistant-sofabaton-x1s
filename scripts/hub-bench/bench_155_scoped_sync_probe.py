"""Scoped remote-sync probe: family 0x65 with a single device id.

Follow-up to bench_154. The vendor app ends single-device edit screens
with ``A5 5A 01 65 <deviceID>`` (the frame our code has only ever used
as the favorites "commit"), and ends activity-level edits with the
global ``0x64``. Question: does ``0x65 <dev>`` trigger a short
device-scoped remote sync (cheap tail for device flows) or a full pass
(or nothing)?

Modes:
  bench_155_scoped_sync_probe.py <ip> <X1|X1S|X2> <tag> list
      -- read-only: print the device catalog (id, name) and exit.
  bench_155_scoped_sync_probe.py <ip> <X1|X1S|X2> <tag> <dev_id> [watch_s]
      -- send 0x65 [dev_id], record the STATUS_ACK, then live-print all
         H->A frames for watch_s seconds (default 180) while the
         operator watches the physical remote.
"""

from __future__ import annotations

import logging
import sys
import threading
import time

from bench_common import connect, save_json, setup_logging

from x1slib.protocol_const import OP_STATUS_ACK, OPNAMES, opcode_family_name

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
MODE = sys.argv[4]
WATCH_S = float(sys.argv[5]) if len(sys.argv) > 5 else 180.0

log = logging.getLogger("bench155")
log_path = setup_logging(f"scoped-sync-probe-{TAG}")
print(f"logging to {log_path}", flush=True)


def wallclock() -> str:
    return time.strftime("%H:%M:%S")


TAPE: list[dict] = []
TAPE_LOCK = threading.Lock()


def install_tap(proxy) -> None:
    orig = proxy._handle_hub_frames

    def tap(frames):
        now = time.monotonic()
        wc = wallclock()
        with TAPE_LOCK:
            for op, _raw, payload, _scid, _ecid in frames:
                name = OPNAMES.get(op) or opcode_family_name(op) or f"OP_{op:04X}"
                entry = {
                    "wall": wc,
                    "mono": now,
                    "opcode": f"0x{op:04X}",
                    "name": name,
                    "payload": payload.hex(" ")[:96],
                }
                TAPE.append(entry)
                print(
                    f"  [{wc}] H->A {entry['opcode']} {name} payload={entry['payload'] or '(empty)'}",
                    flush=True,
                )
        return orig(frames)

    proxy._handle_hub_frames = tap


proxy = connect(HOST, HUB_VERSION)
try:
    if MODE == "list":
        proxy.request_devices()
        deadline = time.time() + 20
        devices, ready = {}, False
        while time.time() < deadline:
            devices, ready = proxy.get_devices(force_refresh=False)
            if ready:
                break
            time.sleep(0.5)
        print(f"devices (ready={ready}):", flush=True)
        for dev_id, dev in sorted((devices or {}).items()):
            print(f"  0x{int(dev_id):02X} ({int(dev_id):3d})  {dev.get('name')}", flush=True)
    else:
        dev_id = int(MODE, 0) & 0xFF
        install_tap(proxy)
        results: dict = {
            "host": HOST,
            "hub_version": HUB_VERSION,
            "dev_id": dev_id,
            "watch_s": WATCH_S,
        }
        print(f"\n=== idle watch 10 s [{wallclock()}] ===", flush=True)
        time.sleep(10.0)

        print(
            f"\n=== KICK: scoped sync 0x65 dev=0x{dev_id:02X} at {wallclock()} -- WATCH THE REMOTE ===",
            flush=True,
        )
        proxy.clear_ack_queue()
        t_send = time.monotonic()
        results["kick_wall"] = wallclock()
        proxy._send_family_frame(0x65, bytes([dev_id]))
        ack = proxy.wait_for_ack_any(
            [(OP_STATUS_ACK, None)], timeout=10.0, not_before=t_send
        )
        if ack is None:
            results["ack"] = "TIMEOUT(10s)"
        else:
            _op, payload = ack
            status = payload[0] if payload else None
            results["ack"] = "0x%02X" % status if status is not None else "(empty)"
            results["latency_s"] = round(time.monotonic() - t_send, 3)
        print(f"== scoped kick: {results}", flush=True)

        t0 = time.monotonic()
        while time.monotonic() - t0 < WATCH_S:
            time.sleep(0.25)

        print(f"\n=== capture window over at {wallclock()} ===", flush=True)
        with TAPE_LOCK:
            results["tape"] = list(TAPE)
        path = save_json(f"scoped-sync-probe-{TAG}", results)
        print("saved:", path, flush=True)
finally:
    proxy.stop()
    print("disconnected", flush=True)
