"""Targeted cleanup: delete favorites on Bench Test whose (dev,cmd) is NOT in
the keep-set. Recovers an orphan a prior aborted chunk-2 run left behind.

Usage: bench_109_fixup.py <ip> <X1|X1S|X2> <tag> <act_id> <keep_dev:keep_cmd,...>
"""
from __future__ import annotations

import sys
import time

from bench_common import connect, setup_logging

HOST, HUB_VERSION, TAG = sys.argv[1], sys.argv[2], sys.argv[3]
ACT_ID = int(sys.argv[4], 0)
keep = set()
for part in (sys.argv[5] if len(sys.argv) > 5 else "").split(","):
    if ":" in part:
        d, c = part.split(":")
        keep.add((int(d, 0), int(c, 0)))
setup_logging(f"fixup-{TAG}")


def favs():
    bk = proxy.backup_activity(ACT_ID)
    return [(int(r["button_id"]), int(r["device_id"]), int(r["command_id"]))
            for r in (bk or {}).get("favorite_slots") or []]


proxy = connect(HOST, HUB_VERSION)
try:
    print("keep:", sorted(keep))
    print("before:", favs())
    for _ in range(8):
        extra = [(b, d, c) for b, d, c in favs() if (d, c) not in keep]
        if not extra:
            break
        if proxy.request_favorites_order(ACT_ID) is None:
            ids = [b for b, _d, _c in favs()]
            proxy.reset_ack_queues()
            proxy._send_step(step_name="fx-61", family=0x61,
                             payload=proxy._build_favorites_reorder_payload(ACT_ID & 0xFF, ids),
                             ack_opcode=0x0103)
            proxy._send_step(step_name="fx-65", family=0x65,
                             payload=bytes([ACT_ID & 0xFF]), ack_opcode=0x0103)
            proxy.clear_entity_cache(ACT_ID, clear_buttons=False, clear_favorites=True, clear_macros=False)
            proxy.state.activity_favorites_order.pop(ACT_ID & 0xFF, None)
            proxy._activity_map_complete.discard(ACT_ID & 0xFF)
            proxy.request_activity_mapping(ACT_ID)
            time.sleep(1.0)
            continue
        fid, d, c = extra[0]
        r = proxy.delete_favorite(ACT_ID, fid)
        print(f"delete ({d},{c}) id={fid} -> {r}")
        time.sleep(1.0)
        proxy.request_favorites_order(ACT_ID)
    print("after:", favs())
finally:
    proxy.stop()
    print("disconnected")
