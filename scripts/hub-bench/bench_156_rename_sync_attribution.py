"""Attribute remote-sync triggering: bare rename write vs 0x65 commit.

Follow-up to bench_154/155. A scoped ``0x65 <dev>`` was acked 0x00 but
showed nothing on the remote's UI. To distinguish "silent background
push" from "not a sync trigger at all", make a VISIBLE change (rename
the sacrificial device) and watch what actually moves it to the remote:

  phase renameA : warm catalog, rename dev to a marker name via the
                  validated device-record rewrite, then live-capture.
                  Operator watches: does the remote sync on its own?
  phase commit65: send 0x65 [dev], live-capture. Operator watches the
                  remote, then checks its device list for the marker
                  name (without triggering a manual sync!).
  phase cleanup : rename the device back, then send one global 0x64 so
                  the remote converges on true state.

Usage:
  bench_156_rename_sync_attribution.py <ip> <ver> <tag> <phase> <dev_id> [name] [watch_s]
"""

from __future__ import annotations

import logging
import sys
import threading
import time

from bench_common import connect, save_json, setup_logging

from x1slib.protocol_const import OP_REMOTE_SYNC, OP_STATUS_ACK, OPNAMES, opcode_family_name

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
PHASE = sys.argv[4]
DEV_ID = int(sys.argv[5], 0) & 0xFF
NAME = sys.argv[6] if len(sys.argv) > 6 else None
WATCH_S = float(sys.argv[7]) if len(sys.argv) > 7 else 150.0

log = logging.getLogger("bench156")
log_path = setup_logging(f"rename-attribution-{TAG}")
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


def warm_devices(proxy) -> dict:
    proxy.request_devices()
    deadline = time.time() + 20
    devices, ready = {}, False
    while time.time() < deadline:
        devices, ready = proxy.get_devices(force_refresh=False)
        if ready:
            break
        time.sleep(0.5)
    if not ready:
        raise RuntimeError("device catalog did not warm")
    return devices or {}


proxy = connect(HOST, HUB_VERSION)
results: dict = {"phase": PHASE, "dev_id": DEV_ID, "host": HOST}
try:
    devices = warm_devices(proxy)
    current = (devices.get(DEV_ID) or {}).get("name")
    results["name_before"] = current
    print(f"dev 0x{DEV_ID:02X} current name: {current!r}", flush=True)

    install_tap(proxy)

    if PHASE in ("renameA", "cleanup"):
        if not NAME:
            raise SystemExit("phase needs a target name argument")

        # Safety gate (added for the X2 run, harmless everywhere): the
        # rename path is parse -> replace(name) -> rebuild -> write. Prove
        # the parser/builder pair round-trips THIS record byte-identically
        # before any write leaves the machine; abort otherwise. The stored
        # form is compared after write-normalization: the hub restamps
        # body[0] in storage and leaves the trailer at its write-time value
        # when it later flips state bytes, so the write form differs from
        # storage exactly there (bench 2026-08-27; regression-locked in
        # tests/test_devices.py test_real_x2_capture_round_trips_to_write_form).
        from dataclasses import replace as _dc_replace

        from x1slib.devices import build_device_create_payload, parse_device_record

        raw = (proxy.state.entities("device").get(DEV_ID) or {}).get("raw_body")
        if not isinstance(raw, (bytes, bytearray)):
            raise SystemExit(f"no raw record body cached for dev 0x{DEV_ID:02X}")
        cfg = parse_device_record(bytes(raw), hub_version=HUB_VERSION, entity_kind="device")
        rebuilt = build_device_create_payload(
            _dc_replace(cfg, device_id=DEV_ID), hub_version=HUB_VERSION
        )
        normalized = bytearray(raw)
        normalized[0] = 0x01
        normalized[-1] = sum(normalized[:-1]) & 0xFF
        if rebuilt[3:] != bytes(normalized):
            print("ROUND-TRIP MISMATCH -- aborting before any write", flush=True)
            print(f"  stored (write-normalized): {bytes(normalized).hex(' ')}", flush=True)
            print(f"  rebuilt                  : {rebuilt[3:].hex(' ')}", flush=True)
            raise SystemExit(2)
        print(f"round-trip check OK ({len(raw)} bytes, write-normalized)", flush=True)

        print(f"\n=== RENAME dev 0x{DEV_ID:02X} -> {NAME!r} at {wallclock()} ===", flush=True)
        ok = proxy._sync_step_device_rename({"device_id": DEV_ID, "name": NAME})
        results["rename_ok"] = bool(ok)
        print(f"== rename accepted: {ok}", flush=True)
        if not ok:
            raise SystemExit("rename write failed; aborting phase")

    if PHASE == "commit65":
        print(f"\n=== KICK: 0x65 dev=0x{DEV_ID:02X} at {wallclock()} -- WATCH THE REMOTE ===", flush=True)
        proxy.clear_ack_queue()
        t_send = time.monotonic()
        proxy._send_family_frame(0x65, bytes([DEV_ID]))
        ack = proxy.wait_for_ack_any([(OP_STATUS_ACK, None)], timeout=10.0, not_before=t_send)
        results["ack_65"] = (
            "TIMEOUT(10s)" if ack is None else ("0x%02X" % ack[1][0] if ack[1] else "(empty)")
        )
        print(f"== 0x65 ack: {results['ack_65']}", flush=True)

    if PHASE == "cleanup":
        print(f"\n=== final global 0x64 at {wallclock()} (remote will full-sync) ===", flush=True)
        proxy.clear_ack_queue()
        t_send = time.monotonic()
        proxy.enqueue_cmd(OP_REMOTE_SYNC)
        ack = proxy.wait_for_ack_any([(OP_STATUS_ACK, None)], timeout=10.0, not_before=t_send)
        results["ack_64"] = (
            "TIMEOUT(10s)" if ack is None else ("0x%02X" % ack[1][0] if ack[1] else "(empty)")
        )
        print(f"== 0x64 ack: {results['ack_64']}", flush=True)
        results["watch_s"] = 10.0
        time.sleep(10.0)
    else:
        results["watch_s"] = WATCH_S
        print(f"=== watching {WATCH_S:.0f}s [{wallclock()}] -- eyes on the remote ===", flush=True)
        t0 = time.monotonic()
        while time.monotonic() - t0 < WATCH_S:
            time.sleep(0.25)

    print(f"\n=== phase over at {wallclock()} ===", flush=True)
    with TAPE_LOCK:
        results["tape"] = list(TAPE)
    path = save_json(f"rename-attribution-{TAG}", results)
    print("saved:", path, flush=True)
finally:
    proxy.stop()
    print("disconnected", flush=True)
