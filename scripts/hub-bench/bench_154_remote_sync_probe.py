"""Remote-sync (REMOTE_SYNC 0x64) collision + boundary-signal probe.

Question under test (resync-manager groundwork): what happens on the wire
around a hub->remote sync?

  a) What does the hub answer to the 0x64 trigger (STATUS_ACK status byte,
     latency)?
  b) What does it answer to a SECOND 0x64 sent while the multi-minute BLE
     sync is still running -- clean 0x00, non-zero NACK, or silence?
  c) Does the hub emit anything spontaneous (0x0160 ACK_READY, 0x2F rows,
     anything else) at sync start / sync end?

The script is deliberately non-interactive: it prints EVERY H->A frame
live with a wall-clock timestamp; the operator watches the physical
remote and reports observed sync start/end times, which are correlated
against this log afterwards. Read-only apart from the 0x64 triggers
themselves (which start remote syncs -- that is the point).

Usage:
  bench_154_remote_sync_probe.py <ip> <X1|X1S|X2> <tag> [watch_s] [probe_offsets]

  watch_s        total capture window after the kick, seconds (default 480)
  probe_offsets  comma-separated seconds-after-kick for extra 0x64 sends
                 (default none, e.g. "20,75,150")
"""

from __future__ import annotations

import logging
import sys
import threading
import time

from bench_common import connect, save_json, setup_logging

from x1slib.protocol_const import (
    OP_REMOTE_SYNC,
    OP_STATUS_ACK,
    OPNAMES,
    opcode_family_name,
)

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
WATCH_S = float(sys.argv[4]) if len(sys.argv) > 4 else 480.0
PROBE_OFFSETS = (
    [float(x) for x in sys.argv[5].split(",") if x.strip()] if len(sys.argv) > 5 else []
)

log = logging.getLogger("bench154")
log_path = setup_logging(f"remote-sync-probe-{TAG}")
print(f"logging to {log_path}", flush=True)


def wallclock() -> str:
    return time.strftime("%H:%M:%S")


TAPE: list[dict] = []
TAPE_LOCK = threading.Lock()


def install_tap(proxy) -> None:
    """Record + live-print every deframed H->A frame."""

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


def send_sync_trigger(proxy, label: str, results: list) -> None:
    """Send one remote-sync trigger and record the STATUS_ACK verdict."""

    proxy.clear_ack_queue()
    t_send = time.monotonic()
    wc = wallclock()
    if HUB_VERSION == "X2":
        sent = proxy.resync_remote(HUB_VERSION)
    else:
        sent = proxy.enqueue_cmd(OP_REMOTE_SYNC)
    ack = proxy.wait_for_ack_any(
        [(OP_STATUS_ACK, None)], timeout=10.0, not_before=t_send
    )
    latency = time.monotonic() - t_send
    if ack is None:
        verdict = {"label": label, "wall": wc, "sent": sent, "ack": "TIMEOUT(10s)"}
    else:
        _op, payload = ack
        status = payload[0] if payload else None
        verdict = {
            "label": label,
            "wall": wc,
            "sent": sent,
            "ack": "0x%02X" % status if status is not None else "(empty)",
            "latency_s": round(latency, 3),
        }
    results.append(verdict)
    print(f"== {label}: {verdict}", flush=True)


proxy = connect(HOST, HUB_VERSION)
install_tap(proxy)
results: dict = {
    "host": HOST,
    "hub_version": HUB_VERSION,
    "watch_s": WATCH_S,
    "probe_offsets": PROBE_OFFSETS,
    "started_wall": wallclock(),
    "triggers": [],
}
try:
    print(f"\n=== idle watch 15 s (baseline: expect silence) [{wallclock()}] ===", flush=True)
    time.sleep(15.0)

    print(f"\n=== KICK: remote-sync trigger at {wallclock()} -- WATCH THE REMOTE ===", flush=True)
    t_kick = time.monotonic()
    results["kick_wall"] = wallclock()
    send_sync_trigger(proxy, "kick", results["triggers"])

    pending = sorted(PROBE_OFFSETS)
    while time.monotonic() - t_kick < WATCH_S:
        if pending and (time.monotonic() - t_kick) >= pending[0]:
            offset = pending.pop(0)
            print(
                f"\n=== collision probe at +{offset:.0f}s [{wallclock()}] ===",
                flush=True,
            )
            send_sync_trigger(proxy, f"probe+{offset:.0f}s", results["triggers"])
        time.sleep(0.25)

    print(f"\n=== capture window over at {wallclock()} ===", flush=True)
    with TAPE_LOCK:
        results["tape"] = list(TAPE)
    path = save_json(f"remote-sync-probe-{TAG}", results)
    print("saved:", path, flush=True)
    print("wire log:", log_path, flush=True)
finally:
    proxy.stop()
    print("disconnected", flush=True)
