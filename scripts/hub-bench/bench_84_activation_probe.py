"""Chunk-4 follow-up: does REQ_ACTIVATE run the activity power macros?

The chunk-4 deploy run drove ACT_B on/off over TCP and saw zero wifi
callbacks — but the activity was already ACTIVE when the ON fired
(no-op, no transition). This probe performs clean transitions from a
known state and watches the listener:

  1. confirm current state; if active, deactivate and settle
  2. idle → ACTIVE  (send_command(act, POWER_ON))  — expect the
     power-on macro's wifi rows (power cmd 1 + input cmd 3) IF the hub
     executes macros on TCP activation
  3. ACTIVE → idle  (send_command(act, POWER_OFF)) — expect power-off
     (cmd 2) under the same hypothesis

Zero callbacks on real transitions = the hub does NOT self-execute
power macros on REQ_ACTIVATE (macro execution is remote-side); the
callback-sequence verification then belongs to chunk 6 (physical
remote). Read-only wrt configuration; leaves the chunk-4 deployment
in place and the activity idle.

Usage:
    python bench_84_activation_probe.py <ip> <X1S> <tag> <act_id> <dev_id>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward

from x1slib.protocol_const import ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT = int(sys.argv[4], 0)
DEV = int(sys.argv[5], 0)
LISTENER_PORT = 8060

log_path = setup_logging(f"wifi-c4-probe-{TAG}")
print(f"logging to {log_path}")


def activity_states(proxy) -> dict[int, str]:
    proxy.request_activities()
    deadline = time.time() + 15
    while time.time() < deadline:
        acts, ready = proxy.get_activities(force_refresh=False)
        if ready:
            return {k: str((v or {}).get("state") or "") for k, v in (acts or {}).items()}
        time.sleep(0.5)
    return {}


bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "act": ACT, "dev": DEV, "transitions": []}
try:
    action_id = proxy._stable_hub_action_id()
    states = activity_states(proxy)
    print(f"states at start: { {hex(k): v for k, v in states.items()} }")
    artifacts["states_at_start"] = states

    def transition(label: str, key: int, settle: float = 15.0) -> list[dict]:
        listener.clear()
        print(f"{label}: send_command(0x{ACT:02X}, 0x{key:02X})...")
        proxy.send_command(ACT, key)
        time.sleep(settle)
        hits = listener.snapshot()
        states_after = activity_states(proxy)
        entry = {
            "label": label,
            "key": key,
            "hits": hits,
            "state_after": states_after.get(ACT),
        }
        artifacts["transitions"].append(entry)
        print(f"  -> state={states_after.get(ACT)!r} callbacks={[h['path'] for h in hits]}")
        return hits

    # ensure we start from idle
    if (states.get(ACT) or "").upper() == "ACTIVE":
        transition("pre-settle: deactivate", ButtonName.POWER_OFF)

    on_hits = transition("idle -> ACTIVE", ButtonName.POWER_ON)
    off_hits = transition("ACTIVE -> idle", ButtonName.POWER_OFF)

    want_on = {
        f"/launch/{action_id}/{DEV}/0/short",
        f"/launch/{action_id}/{DEV}/2/short",
    }
    want_off = {f"/launch/{action_id}/{DEV}/1/short"}
    got_on = {h["path"] for h in on_hits}
    got_off = {h["path"] for h in off_hits}
    print()
    print(f"ON  transition: got={sorted(got_on)} (macro-executed would be {sorted(want_on)})")
    print(f"OFF transition: got={sorted(got_off)} (macro-executed would be {sorted(want_off)})")
    verdict = (
        "hub EXECUTES power macros on TCP activation"
        if got_on == want_on and got_off == want_off
        else "hub does NOT self-execute power macros on REQ_ACTIVATE"
        if not got_on and not got_off
        else "PARTIAL/unexpected — inspect artifacts"
    )
    artifacts["verdict"] = verdict
    print("VERDICT:", verdict)
finally:
    listener.stop()
    path = save_json(f"wifi-c4-probe-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")
