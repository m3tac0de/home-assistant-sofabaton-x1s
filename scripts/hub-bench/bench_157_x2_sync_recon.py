"""X2 remote-sync recon: status rows, sync reply timing, busy indicators.

Bench-capture groundwork for the resync manager's X2 path. The X2 (unlike
X1/X1S) pairs its remotes explicitly and exposes a status/emitter list:

  request `0x012E [type]` (type 0 = remotes, 1 = RF emitters)
  reply   family 0x2F rows; observed layout (payload offsets, payload =
          frame bytes after the opcode, checksum stripped):
            p[0] row index, p[1] total rows,
            p[2]/p[3] id (slot depends on type byte),
            p[5] battery %, p[6] hardware code, p[7:11] production batch,
            p[11] firmware code, p[12] type, p[13] online flag,
            p[14] emitter-line flag, p[21:] name

The X2 sync request itself may answer with a DELAYED terminal reply
(the sync flow blocks indefinitely on the next frame), which would give
us a completion signal the X1/X1S lack. Modes:

  bench_157_x2_sync_recon.py <ip> <tag> list
      -- read-only: request both emitter-list types, decode rows, exit.
  bench_157_x2_sync_recon.py <ip> <tag> sync [wait_s] [poll_s]
      -- run the shipping resync flow once (remote list + per-remote
         sync), then wait up to wait_s (default 600) for ANY further
         frame, live-printing everything. poll_s > 0 additionally
         re-requests the remote list every poll_s seconds during the
         wait to expose a busy/online flip (skip on the first run).
  bench_157_x2_sync_recon.py <ip> <tag> vsync [wait_s] [poll_s]
      -- send the vendor-exact sync frame (opcode 0x0364, payload
         `00 00 00` = remote id 0 in slot 0) instead of the shipping
         flow; same wait/poll behavior. Baseline row is fetched before
         the kick so poll diffs have a reference.
  bench_157_x2_sync_recon.py <ip> <tag> probe <opcode_hex> <payload_hex> [wait_s]
      -- candidate-frame hunt: send exactly one frame (e.g. `probe
         0364 080000`) and time the reply. Discriminator (operator
         observation 2026-08-27): a WRONG id acks 0x00 instantly and
         nothing happens; the REAL sync trigger is answered only at
         sync completion (~5 min on the bench X2 config) while the
         remote wakes into a visible sync UI.
"""

from __future__ import annotations

import logging
import sys
import threading
import time

from bench_common import connect, save_json, setup_logging

from x1slib.protocol_const import OPNAMES, opcode_family_name

HOST = sys.argv[1]
TAG = sys.argv[2]
MODE = sys.argv[3]
if MODE == "probe":
    WAIT_S, POLL_S = 0.0, 0.0  # probe parses its own args
else:
    WAIT_S = float(sys.argv[4]) if len(sys.argv) > 4 else 600.0
    POLL_S = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0

OP_EMITTER_LIST = 0x012E

log = logging.getLogger("bench157")
log_path = setup_logging(f"x2-sync-recon-{TAG}")
print(f"logging to {log_path}", flush=True)


def wallclock() -> str:
    return time.strftime("%H:%M:%S")


TAPE: list[dict] = []
TAPE_LOCK = threading.Lock()


def decode_status_row(payload: bytes) -> dict:
    row: dict = {"raw": payload.hex(" ")}
    if len(payload) < 15:
        return row
    row.update(
        index=payload[0],
        total=payload[1],
        id_slot0=payload[2],
        id_slot1=payload[3],
        battery=payload[5],
        hardware=payload[6],
        batch=payload[7:11].hex(),
        firmware=payload[11],
        type=payload[12],
        online=payload[13],
        emitter_line=payload[14],
    )
    if len(payload) > 21:
        row["name"] = payload[21:].split(b"\x00")[0].decode("utf-8", errors="replace")
    return row


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
                    "payload": payload.hex(" ")[:120],
                }
                if (op & 0xFF) == 0x2F:
                    entry["decoded"] = decode_status_row(payload)
                TAPE.append(entry)
                print(
                    f"  [{wc}] H->A {entry['opcode']} {name} payload={entry['payload'] or '(empty)'}",
                    flush=True,
                )
                if "decoded" in entry:
                    print(f"           decoded: {entry['decoded']}", flush=True)
        return orig(frames)

    proxy._handle_hub_frames = tap


proxy = connect(HOST, "X2")
install_tap(proxy)
results: dict = {"host": HOST, "mode": MODE, "started_wall": wallclock()}
try:
    if MODE == "list":
        for list_type in (0, 1):
            print(f"\n=== emitter list type={list_type} at {wallclock()} ===", flush=True)
            proxy.enqueue_cmd(OP_EMITTER_LIST, bytes([list_type]))
            time.sleep(4.0)
    elif MODE in ("sync", "vsync"):
        if MODE == "vsync":
            print(f"\n=== baseline status row at {wallclock()} ===", flush=True)
            proxy.enqueue_cmd(OP_EMITTER_LIST, bytes([0]))
            time.sleep(3.0)
            print(f"\n=== KICK: vendor-exact 0x0364 [00 00 00] at {wallclock()} ===", flush=True)
            results["kick_wall"] = wallclock()
            sent = proxy.enqueue_cmd(0x0364, b"\x00\x00\x00")
        else:
            print(f"\n=== KICK: shipping resync flow at {wallclock()} -- WATCH THE X2 REMOTE ===", flush=True)
            results["kick_wall"] = wallclock()
            sent = proxy.resync_remote("X2")
        results["resync_sent"] = bool(sent)
        print(f"== sync trigger returned {sent}; waiting up to {WAIT_S:.0f}s for further frames ==", flush=True)
        t0 = time.monotonic()
        next_poll = t0 + POLL_S if POLL_S > 0 else None
        while time.monotonic() - t0 < WAIT_S:
            if next_poll is not None and time.monotonic() >= next_poll:
                print(f"\n=== status poll at {wallclock()} ===", flush=True)
                proxy.enqueue_cmd(OP_EMITTER_LIST, bytes([0]))
                next_poll += POLL_S
            time.sleep(0.25)
    elif MODE == "probe":
        opcode = int(sys.argv[4], 16)
        payload = bytes.fromhex(sys.argv[5])
        wait_s = float(sys.argv[6]) if len(sys.argv) > 6 else 420.0
        print(f"\n=== baseline status row at {wallclock()} ===", flush=True)
        proxy.enqueue_cmd(OP_EMITTER_LIST, bytes([0]))
        time.sleep(3.0)
        print(
            f"\n=== PROBE: opcode 0x{opcode:04X} payload {payload.hex(' ')} at {wallclock()}"
            " -- WATCH THE X2 REMOTE ===",
            flush=True,
        )
        results["probe_opcode"] = f"0x{opcode:04X}"
        results["probe_payload"] = payload.hex(" ")
        results["kick_wall"] = wallclock()
        t_send = time.monotonic()
        proxy.enqueue_cmd(opcode, payload)
        t0 = time.monotonic()
        while time.monotonic() - t0 < wait_s:
            time.sleep(0.25)
        # Reply timing is read off the tape (first frame after kick_wall).
    else:
        raise SystemExit(f"unknown mode {MODE!r}")

    print(f"\n=== done at {wallclock()} ===", flush=True)
    with TAPE_LOCK:
        results["tape"] = list(TAPE)
    path = save_json(f"x2-sync-recon-{TAG}", results)
    print("saved:", path, flush=True)
finally:
    proxy.stop()
    print("disconnected", flush=True)
