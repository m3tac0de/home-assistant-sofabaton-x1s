"""One-shot: rewrite ACT_A's family-0x61 order table to the pre-bench ids
and verify byte-identity against the recovery bundle (X1 keeps stale ids
in the sort table after key-row deletes — bench_141 X1 run residue).

Usage: python bench_141c_order_fix.py <ip> <X1|X1S> <bundle-json-path>
"""

from __future__ import annotations

import copy
import json
import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
BUNDLE_PATH = sys.argv[3]
ACT_A = 0x65

setup_logging("orderfix")


def strip(node):
    if isinstance(node, dict):
        return {k: strip(v) for k, v in node.items() if k not in ("captured_at", "fetched_at")}
    if isinstance(node, list):
        return [strip(v) for v in node]
    return node


def canon(x) -> str:
    return json.dumps(strip(copy.deepcopy(x)), sort_keys=True, default=str)


bundle = json.load(open(BUNDLE_PATH, encoding="utf-8"))
pre = None
for act in bundle.get("activities") or []:
    if int((act.get("device") or {}).get("device_id", 0)) == ACT_A:
        pre = act
        break
if pre is None:
    raise SystemExit("ACT_A not in bundle")
want_order = [int(v) for v in pre.get("favorites_order") or []]
print(f"target order: {want_order}")

proxy = connect(HOST, HUB_VERSION)
try:
    proxy.reset_ack_queues()
    s1 = proxy._send_step(step_name="orderfix-61", family=0x61,
                          payload=proxy._build_favorites_reorder_payload(ACT_A & 0xFF, want_order),
                          ack_opcode=0x0103)
    s2 = proxy._send_step(step_name="orderfix-65", family=0x65,
                          payload=bytes([ACT_A & 0xFF]), ack_opcode=0x0103)
    print(f"0x61 ack={s1.outcome} 0x65 ack={s2.outcome}")
    proxy.clear_entity_cache(ACT_A, clear_buttons=False, clear_favorites=True, clear_macros=False)
    proxy.state.activity_favorites_order.pop(ACT_A & 0xFF, None)
    proxy._activity_map_complete.discard(ACT_A & 0xFF)
    proxy.request_activity_mapping(ACT_A)
    time.sleep(2.0)
    now = proxy.backup_activity(ACT_A)
    ok = canon(now) == canon(pre)
    print("BYTE-IDENTICAL" if ok else "STILL DIFFERS")
    if not ok:
        for key in sorted(set(strip(pre)) | set(strip(now))):
            a, b = strip(pre).get(key), strip(now).get(key)
            if json.dumps(a, sort_keys=True, default=str) != json.dumps(b, sort_keys=True, default=str):
                print(f"--- DIFF in {key!r} ---")
                print("  pre:", json.dumps(a, default=str)[:400])
                print("  now:", json.dumps(b, default=str)[:400])
    save_json("orderfix-final", now)
    sys.exit(0 if ok else 1)
finally:
    proxy.stop()
