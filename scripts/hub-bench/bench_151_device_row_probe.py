"""Targeted CATALOG_ROW_DEVICE probe: can the hub serve a single device row?

Power-button groundwork (device-mode plan, section 8). The hub live-updates
the device row's power_state byte (record body[28]); today we only capture
the full REQ_DEVICES burst (opcode 0x000A, empty payload). The opcode
grammar (high byte = payload length) and the sibling request families
(REQ_IDLE_BEHAVIOR 0x0140 [dev_lo], REQ_COMMANDS 0x025C [dev_lo, 0xFF])
suggest targeted variants may exist; the vendor app never sends one, so
this asks the hub directly:

  probe A: 0x010A payload [dev_lo]        (REQ_IDLE_BEHAVIOR shape)
  probe B: 0x020A payload [dev_lo, 0xFF]  (REQ_COMMANDS targeted shape)

Read-only: request frames only, no writes. A probe reply (if any) arrives
as a normal 0xD50B row and lands in the device cache via the standard
handler; the wire log tells the full story either way. Note the single
row may leave the "devices" burst bookkeeping waiting for the rest of the
list; the timeout is harmless and expected here.

Usage: bench_151_device_row_probe.py <ip> <X1|X1S|X2> <dev_id> <tag>
"""

from __future__ import annotations

import logging
import sys
import time

from bench_common import connect, save_json, setup_logging

from x1slib.devices import parse_device_record

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
DEV_ID = int(sys.argv[3], 0)
TAG = sys.argv[4]

log = logging.getLogger("bench151")
log_path = setup_logging(f"devrow-probe-{TAG}")
print(f"logging to {log_path}")


def power_states(proxy) -> dict:
    # get_devices() serves the JSON-safe export view (raw_body stripped);
    # read the raw store directly for the record bytes.
    _, ready = proxy.get_devices(force_refresh=False)
    devs = dict(proxy.state.devices or {})
    out = {}
    for did, dev in sorted(devs.items()):
        body = dev.get("raw_body") or b""
        try:
            cfg = parse_device_record(bytes(body), hub_version=HUB_VERSION)
            out[int(did)] = {
                "name": dev.get("name"),
                "power_state": cfg.power_state,
                "power_mode": cfg.power_mode,
            }
        except ValueError as exc:
            out[int(did)] = {"name": dev.get("name"), "parse_error": str(exc)}
    return {"ready": ready, "devices": out}


def full_refresh(proxy, label: str) -> dict:
    log.info("=== %s: full REQ_DEVICES ===", label)
    proxy.request_devices()
    deadline = time.time() + 20
    while time.time() < deadline:
        _, ready = proxy.get_devices(force_refresh=False)
        if ready:
            break
        time.sleep(0.5)
    snap = power_states(proxy)
    for did, row in snap["devices"].items():
        print(f"  dev {did}: {row}")
    return snap


proxy = connect(HOST, HUB_VERSION)
results = {"dev_id": DEV_ID}
try:
    results["baseline"] = full_refresh(proxy, "baseline")

    log.info("=== probe A: 0x010A [dev_lo=%d] ===", DEV_ID)
    proxy.enqueue_cmd(0x010A, bytes([DEV_ID & 0xFF]))
    time.sleep(5.0)
    results["after_probe_a"] = power_states(proxy)

    log.info("=== probe B: 0x020A [dev_lo=%d, 0xFF] ===", DEV_ID)
    proxy.enqueue_cmd(0x020A, bytes([DEV_ID & 0xFF, 0xFF]))
    time.sleep(5.0)
    results["after_probe_b"] = power_states(proxy)

    results["final"] = full_refresh(proxy, "close-out sanity")

    path = save_json(f"devrow-probe-{TAG}", results)
    print("saved:", path)
    print("Now read the wire log for 0xD50B replies to the probes:", log_path)
finally:
    proxy.stop()
    print("disconnected")
