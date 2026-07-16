"""Chunk-1 recon for the macro-reorder probe: read Bench Test's current
quick-access state on a hub so we know what fixture setup the probe needs.

Usage: bench_108_recon.py <ip> <X1|X1S|X2> <tag> [act_id=0x68]
"""

from __future__ import annotations

import sys

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0) if len(sys.argv) > 4 else 0x68

setup_logging(f"macro-recon-{TAG}")


def _mrec(proxy):
    out = []
    for r in proxy.get_cached_macro_records(ACT_ID):
        out.append({
            "key_id": r.key_id & 0xFF,
            "label": r.label,
            "n_steps": len(r.key_sequence),
            "label_slot": r.raw_label_slot.hex(),
        })
    return out


proxy = connect(HOST, HUB_VERSION)
try:
    # Make sure detail caches are populated for the activity.
    bk = proxy.backup_activity(ACT_ID)
    art = {}
    if not isinstance(bk, dict):
        print("backup_activity failed — activity missing?")
        art["backup"] = None
    else:
        art["activity_name"] = bk.get("activity", {}).get("name") if isinstance(bk.get("activity"), dict) else None
        art["favorites"] = bk.get("favorites")
        art["macros"] = [
            {"button_id": m.get("button_id"), "name": m.get("name"),
             "n_steps": len(m.get("steps") or [])}
            for m in (bk.get("macros") or [])
        ]
        art["buttons"] = [
            {"button_id": b.get("button_id"), "name": b.get("name"),
             "target": b.get("target")}
            for b in (bk.get("buttons") or [])
        ]

    order = proxy.request_favorites_order(ACT_ID)
    art["favorites_order"] = order
    art["macro_records"] = _mrec(proxy)
    art["fav_slots"] = proxy.state.get_activity_favorite_slots(ACT_ID)
    art["state_macros"] = proxy.state.get_activity_macros(ACT_ID)
    art["members"] = proxy.state.get_activity_members(ACT_ID)

    # Device catalog (for choosing a real command to favorite, if needed).
    devs, _ = proxy.get_activities()  # trigger; harmless
    known = sorted(proxy.get_known_device_ids())
    art["known_device_ids"] = known

    print("=== Bench Test recon ===")
    print("name:", art.get("activity_name"))
    print("members:", art["members"])
    print("favorites_order (fav_id,slot):", order)
    print("macro_records:")
    for m in art["macro_records"]:
        print("   key=0x%02X n=%d label=%r" % (m["key_id"], m["n_steps"], m["label"]))
    print("backup favorites:")
    for f in (art.get("favorites") or []):
        print("  ", f)
    print("backup macros:")
    for m in art.get("macros") or []:
        print("  ", m)
    print("fav_slots:")
    for s in art["fav_slots"]:
        print("  ", s)
    print("known_device_ids:", known)

    path = save_json(f"macro-recon-{TAG}", art)
    print("saved:", path)
finally:
    proxy.stop()
    print("disconnected")
