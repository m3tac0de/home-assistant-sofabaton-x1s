"""Device-scope power fire, with tracked-state commit timing.

Follow-up to bench_152: both device-scope fires were accepted but the
row's power_state byte lagged the fires. This variant fires and then
polls the device row every ~2.5s for up to 40s, logging exactly when
(and whether) the byte flips, then fires back and times that too. The
result sizes the card's stale-read window (a second press inside the
commit lag would read the old state and fire the wrong macro).

Usage: bench_153_device_power_timing.py <ip> <X1|X1S|X2> <dev_id> <tag>
"""

from __future__ import annotations

import logging
import sys
import time

from bench_common import connect, save_json, setup_logging

from x1slib.devices import parse_device_record
from x1slib.protocol_const import ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
DEV_ID = int(sys.argv[3], 0)
TAG = sys.argv[4]

log = logging.getLogger("bench153")
log_path = setup_logging(f"devpower-timing-{TAG}")
print(f"logging to {log_path}")


def read_power_state(proxy) -> int | None:
    proxy.request_devices()
    deadline = time.time() + 15
    while time.time() < deadline:
        _, ready = proxy.get_devices(force_refresh=False)
        if ready:
            break
        time.sleep(0.25)
    dev = dict((proxy.state.devices or {}).get(DEV_ID) or {})
    body = dev.get("raw_body") or b""
    try:
        return parse_device_record(bytes(body), hub_version=HUB_VERSION).power_state
    except ValueError:
        return None


def fire_and_time(proxy, key_code: int, name: str, expect: int) -> dict:
    log.info("=== fire %s (0x%02X) dev=%d, expect state -> %d ===", name, key_code, DEV_ID, expect)
    t0 = time.monotonic()
    accepted = proxy.send_command(DEV_ID, key_code)
    print(f"fired {name}: accepted={accepted}")
    samples = []
    flipped_at = None
    while time.monotonic() - t0 < 40.0:
        state = read_power_state(proxy)
        elapsed = round(time.monotonic() - t0, 1)
        samples.append({"t": elapsed, "power_state": state})
        print(f"  t=+{elapsed:5.1f}s power_state={state}")
        if state == expect and flipped_at is None:
            flipped_at = elapsed
            # Two confirming samples after the flip, then stop early.
            if len([s for s in samples if s["power_state"] == expect]) >= 2:
                break
        time.sleep(2.5)
    print(f"{name}: flip to {expect} observed at +{flipped_at}s" if flipped_at is not None
          else f"{name}: NO flip to {expect} within 40s")
    return {"key": name, "accepted": accepted, "expect": expect,
            "flipped_at_s": flipped_at, "samples": samples}


proxy = connect(HOST, HUB_VERSION)
results = {"dev_id": DEV_ID, "fires": []}
try:
    initial = read_power_state(proxy)
    print(f"baseline power_state={initial}")
    results["baseline_power_state"] = initial
    if initial not in (0, 1):
        raise SystemExit("no baseline power_state; aborting before any fire")

    first = ("POWER_OFF", ButtonName.POWER_OFF, 0) if initial == 1 else ("POWER_ON", ButtonName.POWER_ON, 1)
    second = ("POWER_ON", ButtonName.POWER_ON, 1) if initial == 1 else ("POWER_OFF", ButtonName.POWER_OFF, 0)

    results["fires"].append(fire_and_time(proxy, first[1], first[0], first[2]))
    time.sleep(5.0)
    results["fires"].append(fire_and_time(proxy, second[1], second[0], second[2]))

    results["final_power_state"] = read_power_state(proxy)
    print(f"final power_state={results['final_power_state']}")
    path = save_json(f"devpower-timing-{TAG}", results)
    print("saved:", path)
finally:
    proxy.stop()
    print("disconnected")
