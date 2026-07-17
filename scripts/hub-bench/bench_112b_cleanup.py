"""Chunk 2 helper: remove leftover bench wifi devices (brand m3-benchwifi-*).

Deletes every device whose brand starts with the reserved bench key
``m3-benchwifi-`` (never touches production m3-<hash> managed devices or
real devices), verifying each removal with a proper settle + fresh
catalog re-read (the delete GC lands late). Read-only wrt everything else.

Usage:
    python bench_112b_cleanup.py <ip> <X1|X1S> <tag>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

from x1slib.devices import parse_device_record

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
BENCH_PREFIX = "m3-benchwifi-"

log_path = setup_logging(f"cmddel-c2b-{TAG}")
print(f"logging to {log_path}")


def catalog(proxy) -> dict[int, str]:
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    out = {}
    for dev_id, info in proxy.state.entities("device").items():
        brand = info.get("brand")
        if brand is None:
            raw = info.get("raw_body")
            if isinstance(raw, (bytes, bytearray)):
                try:
                    brand = parse_device_record(bytes(raw), hub_version=HUB_VERSION, entity_kind="device").brand
                except Exception:  # noqa: BLE001
                    brand = None
        out[int(dev_id)] = brand or ""
    return out


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "hub_version": HUB_VERSION}
try:
    before = catalog(proxy)
    targets = [d for d, brand in before.items() if str(brand).startswith(BENCH_PREFIX)]
    artifacts["catalog_before"] = {f"0x{d:02X}": before[d] for d in before}
    print(f"catalog: {len(before)} devices; bench targets: {[f'0x{d:02X}={before[d]}' for d in targets]}")

    results = {}
    for dev in targets:
        print(f"delete_device(0x{dev:02X}) brand={before[dev]!r}")
        proxy.delete_device(dev)
        # GC lands late — poll a fresh catalog for up to 20s
        gone = False
        deadline = time.time() + 20
        while time.time() < deadline:
            time.sleep(2.0)
            if dev not in catalog(proxy):
                gone = True
                break
        results[f"0x{dev:02X}"] = "removed" if gone else "STILL PRESENT"
        print(f"  {'OK  ' if gone else 'FAIL'} 0x{dev:02X} {'removed' if gone else 'still present'}")

    after = catalog(proxy)
    artifacts["catalog_after"] = {f"0x{d:02X}": after[d] for d in after}
    artifacts["results"] = results
    remaining = [d for d in after if str(after[d]).startswith(BENCH_PREFIX)]
    print(f"\nremaining bench devices: {[f'0x{d:02X}' for d in remaining] or 'none'}")
finally:
    save_json(f"cmddel-c2b-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
