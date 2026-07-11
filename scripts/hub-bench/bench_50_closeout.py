"""Activity program chunk 5: final baseline-equality check (read-only).

Re-reads the sacrificial activity and compares its structural content
(macros incl. label slots, bindings, favorite content) plus the activity
catalog against the chunk-1 capture in ``out/act-baseline-<tag>.json``.

Usage: bench_50_closeout.py <ip> <X1|X1S|X2> <tag> <act_id>
"""

from __future__ import annotations

import json
import sys

from bench_common import BENCH_DIR, connect, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
ACT_ID = int(sys.argv[4], 0)

log_path = setup_logging(f"closeout-{TAG}")
print(f"logging to {log_path}")

baseline = json.loads((BENCH_DIR / f"act-baseline-{TAG}.json").read_text(encoding="utf-8"))
base_payload = baseline["activity_payloads"][str(ACT_ID)]
base_slots = {int(k): v["raw_label_slot"] for k, v in
              ((rec["key_id"], rec) for rec in baseline["macro_records"][str(ACT_ID)])}


def _macros(payload):
    return {
        int(r["button_id"]): [
            (int(s["device_id"]), int(s["command_id"]), int(s["button_code"]),
             int(s["duration"]), int(s["delay"]))
            for s in r.get("steps") or []
        ]
        for r in payload.get("macros") or []
    }


def _bindings(payload):
    return {
        int(r["button_id"]): (int(r["device_id"]), int(r["command_id"]),
                              r.get("long_press_device_id"), r.get("long_press_command_id"))
        for r in payload.get("button_bindings") or []
    }


def _favs(payload):
    return sorted((int(r["device_id"]), int(r["command_id"]))
                  for r in payload.get("favorite_slots") or [])


ok = True


def check(label, want, got):
    global ok
    same = want == got
    ok = ok and same
    print(f"  check[{label}]: {'OK' if same else 'FAIL'}"
          + ("" if same else f" want={want} got={got}"))


proxy = connect(HOST, HUB_VERSION)
try:
    acts, ready = None, False
    proxy.request_activities()
    import time
    deadline = time.time() + 20
    while time.time() < deadline:
        acts, ready = proxy.get_activities(force_refresh=False)
        if ready:
            break
        time.sleep(0.5)
    base_names = {k: (v.get("name") if isinstance(v, dict) else v)
                  for k, v in baseline["activities"].items()}
    now_names = {str(int(k)): (v.get("name") if isinstance(v, dict) else v)
                 for k, v in (acts or {}).items()}
    check("activity-catalog", base_names, now_names)

    payload = proxy.backup_activity(ACT_ID)
    check("macros", _macros(base_payload), _macros(payload))
    check("bindings", _bindings(base_payload), _bindings(payload))
    check("favorites", _favs(base_payload), _favs(payload))
    now_slots = {rec.key_id & 0xFF: rec.raw_label_slot.hex()
                 for rec in proxy.get_cached_macro_records(ACT_ID)}
    check("label-slots", base_slots, now_slots)
    print(f"RESULT: {'BASELINE MATCH' if ok else 'BASELINE MISMATCH'}")
finally:
    proxy.stop()
    print("disconnected")
