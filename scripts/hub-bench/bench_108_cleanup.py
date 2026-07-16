"""Recover Bench Test after bench_108 left orphan favorites.

A single-entry macro-only 0x61 page empties the favorites-order table;
``delete_favorite`` then aborts at its order-fetch guard. This reseats the
order table directly (0x61 + 0x65 with the current favorite ids), then
deletes each favorite through the normal path, then verifies clean.

Usage: bench_108_cleanup.py <ip> <X1|X1S|X2> <tag> [act_id=0x68]
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0) if len(sys.argv) > 4 else 0x68
POWER_ON, POWER_OFF = 198, 199

setup_logging(f"macro-cleanup-{TAG}")


def fav_rows():
    bk = proxy.backup_activity(ACT_ID)
    return [
        (int(r.get("button_id", 0)), int(r.get("device_id", 0)), int(r.get("command_id", 0)))
        for r in (bk or {}).get("favorite_slots") or []
    ], bk


def user_macros(bk):
    return {int(r.get("button_id", 0)): r.get("name")
            for r in (bk or {}).get("macros") or []
            if int(r.get("button_id", 0)) not in (POWER_ON, POWER_OFF)}


proxy = connect(HOST, HUB_VERSION)
try:
    rows, bk = fav_rows()
    print("current favs:", rows)
    print("current order:", proxy.request_favorites_order(ACT_ID))
    print("user macros:", user_macros(bk))

    if rows:
        fav_ids = [fid for fid, _d, _c in rows]
        # Reseat the order table directly so delete_favorite's guard passes.
        proxy.reset_ack_queues()
        s1 = proxy._send_step(
            step_name=f"reseat-61[act=0x{ACT_ID & 0xFF:02X}]",
            family=0x61,
            payload=proxy._build_favorites_reorder_payload(ACT_ID & 0xFF, fav_ids),
            ack_opcode=0x0103,
        )
        print("reseat 0x61:", s1.ok)
        s2 = proxy._send_step(
            step_name=f"reseat-commit-65[act=0x{ACT_ID & 0xFF:02X}]",
            family=0x65,
            payload=bytes([ACT_ID & 0xFF]),
            ack_opcode=0x0103,
        )
        print("reseat commit 0x65:", s2.ok)
        proxy.clear_entity_cache(ACT_ID, clear_buttons=False, clear_favorites=True, clear_macros=False)
        proxy.state.activity_favorites_order.pop(ACT_ID & 0xFF, None)
        proxy._activity_map_complete.discard(ACT_ID & 0xFF)
        proxy.request_activity_mapping(ACT_ID)
        time.sleep(1.0)
        print("order after reseat:", proxy.request_favorites_order(ACT_ID))

        # Delete each favorite (highest id first).
        rows, _ = fav_rows()
        for fid, d, c in sorted(rows, reverse=True):
            r = proxy.delete_favorite(ACT_ID, fid)
            print(f"delete_favorite fav_id={fid} (dev={d},cmd={c}) -> {r}")
            time.sleep(1.0)
            # re-read order so the next delete's guard sees the shorter list
            proxy.request_favorites_order(ACT_ID)

    rows, bk = fav_rows()
    clean = not rows and not user_macros(bk)
    print(f"FINAL: favs={rows} user_macros={user_macros(bk)} -> {'CLEAN' if clean else 'DIRTY'}")
    save_json(f"macro-cleanup-{TAG}", {"final_favs": rows, "final_user_macros": user_macros(bk), "clean": clean})
finally:
    proxy.stop()
    print("disconnected")
