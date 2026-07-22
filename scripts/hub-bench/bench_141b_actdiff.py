"""One-shot: diff live ACT_A against the pre-bench recovery-bundle block.

Usage: python bench_141b_actdiff.py <ip> <X1|X1S> <bundle-json-path>
"""

from __future__ import annotations

import copy
import json
import sys

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
BUNDLE_PATH = sys.argv[3]
ACT_A = 0x65

setup_logging("actdiff")


def strip(node):
    if isinstance(node, dict):
        return {k: strip(v) for k, v in node.items() if k not in ("captured_at", "fetched_at")}
    if isinstance(node, list):
        return [strip(v) for v in node]
    return node


bundle = json.load(open(BUNDLE_PATH, encoding="utf-8"))
pre = None
for act in bundle.get("activities") or []:
    if int((act.get("device") or {}).get("device_id", 0)) == ACT_A:
        pre = act
        break
if pre is None:
    raise SystemExit("ACT_A not in bundle")

proxy = connect(HOST, HUB_VERSION)
try:
    now = proxy.backup_activity(ACT_A)
finally:
    proxy.stop()

pre_s, now_s = strip(copy.deepcopy(pre)), strip(copy.deepcopy(now))
for key in sorted(set(pre_s) | set(now_s)):
    a, b = pre_s.get(key), now_s.get(key)
    if json.dumps(a, sort_keys=True, default=str) != json.dumps(b, sort_keys=True, default=str):
        print(f"--- DIFF in {key!r} ---")
        print("  pre:", json.dumps(a, default=str)[:800])
        print("  now:", json.dumps(b, default=str)[:800])
if json.dumps(pre_s, sort_keys=True, default=str) == json.dumps(now_s, sort_keys=True, default=str):
    print("NO DIFF — ACT_A matches the pre-bench block")
save_json("actdiff-now", now)
