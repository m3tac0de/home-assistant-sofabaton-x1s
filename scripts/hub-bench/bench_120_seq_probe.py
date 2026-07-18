"""Sequencer-validation probe: dump activity membership + favorites.

Usage: bench_120_seq_probe.py <ip> <X1|X1S|X2> <tag>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

log_path = setup_logging(f"seqprobe-{TAG}")
print(f"logging to {log_path}")

proxy = connect(HOST, HUB_VERSION)
try:
    proxy.request_devices()
    proxy.request_activities()
    deadline = time.time() + 20
    while time.time() < deadline:
        devs, devs_ready = proxy.get_devices()
        acts, acts_ready = proxy.get_activities(force_refresh=False)
        if devs_ready and acts_ready:
            break
        time.sleep(0.5)

    out = {}
    for aid in sorted((acts or {}).keys()):
        payload = proxy.backup_activity(int(aid))
        name = (acts or {}).get(aid, {}).get("name")
        members = (payload or {}).get("members")
        favs = [
            (row.get("button_id"), row.get("device_id"), row.get("command_id"))
            for row in (payload or {}).get("favorite_slots") or []
        ]
        order = proxy.request_favorites_order(int(aid))
        print(f"act 0x{int(aid):02X} {name!r}: members={members} favs={favs} hub_order={order}")
        out[str(int(aid))] = {"name": name, "members": members, "favorites": favs, "hub_order": order}
    path = save_json(f"seqprobe-{TAG}", out)
    print("saved:", path)
finally:
    proxy.stop()
    print("disconnected")
