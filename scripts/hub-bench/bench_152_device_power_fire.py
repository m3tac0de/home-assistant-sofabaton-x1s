"""Device-scope 198/199 power-macro fire: plan section 8.4 bench gate #2.

The card's power button needs to trigger a device's POWER_ON/POWER_OFF
macro at device scope through the ordinary send path (REQ_ACTIVATE
0x023F [dev_lo, 0xC6/0xC7]). Validated at activity scope only so far.
This bench fires the opposite of the device's current tracked power
state, then fires back, verifying two things per fire:

  1. the physical device reacts (operator watches it), and
  2. whether the hub's tracked power_state byte (device row body[28])
     follows device-scope fires, or only real activity transitions.

Either answer to (2) is a result: if the byte does not follow, the
card's click flow must not re-read state immediately after its own
fire and expect a flip.

Usage: bench_152_device_power_fire.py <ip> <X1|X1S|X2> <dev_id> <tag>
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

log = logging.getLogger("bench152")
log_path = setup_logging(f"devpower-fire-{TAG}")
print(f"logging to {log_path}")


def read_power_state(proxy, label: str) -> int | None:
    proxy.request_devices()
    deadline = time.time() + 20
    while time.time() < deadline:
        _, ready = proxy.get_devices(force_refresh=False)
        if ready:
            break
        time.sleep(0.5)
    dev = dict((proxy.state.devices or {}).get(DEV_ID) or {})
    body = dev.get("raw_body") or b""
    try:
        cfg = parse_device_record(bytes(body), hub_version=HUB_VERSION)
    except ValueError as exc:
        print(f"[{label}] dev {DEV_ID}: record parse failed: {exc}")
        return None
    print(
        f"[{label}] dev {DEV_ID} {cfg.name!r}: power_state={cfg.power_state}"
    )
    return cfg.power_state


def fire(proxy, key_code: int, label: str) -> bool:
    log.info("=== fire %s (0x%02X) dev=%d ===", label, key_code, DEV_ID)
    ok = proxy.send_command(DEV_ID, key_code)
    print(f"fired {label}: accepted={ok}")
    return ok


proxy = connect(HOST, HUB_VERSION)
results = {"dev_id": DEV_ID, "fires": []}
try:
    initial = read_power_state(proxy, "baseline")
    results["baseline_power_state"] = initial
    if initial is None:
        raise SystemExit("no baseline power_state; aborting before any fire")

    plan = (
        [("POWER_OFF", ButtonName.POWER_OFF), ("POWER_ON", ButtonName.POWER_ON)]
        if initial == 1
        else [("POWER_ON", ButtonName.POWER_ON), ("POWER_OFF", ButtonName.POWER_OFF)]
    )

    for name, code in plan:
        accepted = fire(proxy, code, name)
        # Give the macro time to run and the hub time to settle its
        # bookkeeping before re-reading the row.
        time.sleep(8.0)
        state = read_power_state(proxy, f"after {name}")
        results["fires"].append(
            {"key": name, "accepted": accepted, "power_state_after": state}
        )

    results["final_power_state"] = results["fires"][-1]["power_state_after"]
    path = save_json(f"devpower-fire-{TAG}", results)
    print("saved:", path)
finally:
    proxy.stop()
    print("disconnected")
