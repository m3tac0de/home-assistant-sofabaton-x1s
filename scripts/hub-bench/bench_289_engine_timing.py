"""Code review bench program BP3: engine timing under load (read-only).

- CR-L3b-8: every device's inputs page (family 0x46 read) comes back
  whole: the entries parsed equal the header's entry count.
- CR-L3b-2: exchanges (the same inputs reads) keep working while another
  thread fires catalog reads (REQ_DEVICES / REQ_ACTIVITIES) as fast as the
  scheduler takes them. Before the atomic wire claim, an exchange could
  send into a catalog burst that started between its quiet-wire check and
  its start, and time out.

Writes nothing.

Usage:
    python bench_289_engine_timing.py <ip> <X1|X1S> [rounds]
"""

from __future__ import annotations

import sys
import threading
import time

import bench_common  # noqa: F401  (loads the lib as x1slib)
from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
ROUNDS = int(sys.argv[3]) if len(sys.argv) > 3 else 5

log_path = setup_logging(f"engine-timing-{HUB_VERSION}")
print(f"logging to {log_path}")
proxy = connect(HOST, HUB_VERSION)
results: dict = {"inputs": {}, "load": {}}
try:
    proxy.request_devices()
    time.sleep(4)
    devices, _ = proxy.get_devices(force_refresh=False)
    ids = sorted(devices or {})

    # -- CR-L3b-8: whole pages, quiet wire --------------------------------
    for dev in ids:
        record = proxy.fetch_device_input_record(dev, timeout=8.0, absent_as_empty=True)
        entries = None if record is None else len(record.get("entries") or [])
        results["inputs"][dev] = entries
        print(f"dev 0x{dev:02X} {devices[dev].get('name')!r}: inputs {entries}")

    # -- CR-L3b-2: the same reads under catalog load ----------------------
    stop = threading.Event()
    fired = {"n": 0}

    def hammer() -> None:
        while not stop.is_set():
            proxy.request_devices()
            proxy.request_activities()
            fired["n"] += 2
            time.sleep(0.05)

    worker = threading.Thread(target=hammer, daemon=True)
    worker.start()
    outcomes = {"ok": 0, "timeout": 0, "mismatch": 0}
    t0 = time.monotonic()
    try:
        for _ in range(ROUNDS):
            for dev in ids:
                record = proxy.fetch_device_input_record(dev, timeout=8.0, absent_as_empty=True)
                if record is None:
                    outcomes["timeout"] += 1
                elif len(record.get("entries") or []) != results["inputs"][dev]:
                    outcomes["mismatch"] += 1
                else:
                    outcomes["ok"] += 1
    finally:
        stop.set()
        worker.join()
    results["load"] = {**outcomes, "catalog_requests_fired": fired["n"],
                       "secs": round(time.monotonic() - t0, 1)}
    print(f"under load: {results['load']}")
finally:
    save_json(f"engine-timing-{HUB_VERSION}", results)
    proxy.stop()
