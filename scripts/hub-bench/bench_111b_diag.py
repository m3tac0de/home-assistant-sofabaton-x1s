"""In-place chunk 1 diagnostic: explain the three bench_111 FAILs (read-only).

Re-reads activity 0x65/0x66 and the bench wifi device's head record, then
diffs them against the post-deploy baselines stored in out/inplace-c1-<tag>.json:

  - structural JSON diff of the activity captures (what changed in 0x65?),
  - hex + parsed-field diff of the head record vs post-deploy (which tail
    fields did the brand head rewrite disturb?).

Usage:
    python bench_111b_diag.py <ip> <X1|X1S> <tag> <device_id>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from bench_common import connect, save_json, setup_logging

from x1slib.devices import parse_device_record

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DEV_ID = int(sys.argv[4], 0)

ACTS = [0x65, 0x66]

log_path = setup_logging(f"inplace-c1b-{TAG}")
print(f"logging to {log_path}")

art_path = Path(__file__).parent / "out" / f"inplace-c1-{TAG}.json"
baseline = json.loads(art_path.read_text(encoding="utf-8"))
base_acts = baseline["post_deploy_activities"]
head0_hex = baseline["head_post_deploy"]


def strip_meta(node):
    if isinstance(node, dict):
        return {k: strip_meta(v) for k, v in node.items() if k not in ("captured_at", "fetched_at")}
    if isinstance(node, list):
        return [strip_meta(v) for v in node]
    return node


def json_diff(a, b, path=""):
    """Recursive structural diff, list of (path, before, after)."""
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a:
                out.append((f"{path}.{k}", "<absent>", b[k]))
            elif k not in b:
                out.append((f"{path}.{k}", a[k], "<absent>"))
            else:
                out.extend(json_diff(a[k], b[k], f"{path}.{k}"))
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append((f"{path}.len", len(a), len(b)))
        for i, (x, y) in enumerate(zip(a, b)):
            out.extend(json_diff(x, y, f"{path}[{i}]"))
    elif a != b:
        out.append((path, a, b))
    return out


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "device_id": DEV_ID}
try:
    for act in ACTS:
        print(f"\n=== activity 0x{act:02X} vs post-deploy baseline ===")
        now = proxy.backup_activity(act)
        base = base_acts[f"0x{act:02X}"]
        diffs = json_diff(strip_meta(base), strip_meta(now))
        artifacts[f"act_0x{act:02X}_diffs"] = [
            {"path": p, "before": bv, "after": av} for p, bv, av in diffs
        ]
        if not diffs:
            print("  identical")
        for p, bv, av in diffs[:60]:
            print(f"  {p}: {json.dumps(bv)[:160]}  ->  {json.dumps(av)[:160]}")

    print(f"\n=== device 0x{DEV_ID:02X} head record vs post-deploy baseline ===")
    proxy._refresh_catalog("devices", timeout=15.0)
    import time as _t

    _t.sleep(0.6)
    info = proxy.state.entities("device").get(DEV_ID) or {}
    raw_now = bytes(info.get("raw_body") or b"")
    raw_base = bytes.fromhex(head0_hex)
    artifacts["head_now"] = raw_now.hex()
    artifacts["head_base"] = head0_hex
    diffs = [i for i in range(min(len(raw_base), len(raw_now))) if raw_base[i] != raw_now[i]]
    print(f"lengths: base={len(raw_base)} now={len(raw_now)} diff_indices={diffs}")
    artifacts["head_diff_indices"] = diffs
    if diffs:
        lo, hi = max(0, min(diffs) - 4), min(len(raw_base), max(diffs) + 5)
        print(f"base[{lo}:{hi}] = {raw_base[lo:hi].hex(' ')}")
        print(f"now [{lo}:{hi}] = {raw_now[lo:hi].hex(' ')}")

    for label, raw in (("base", raw_base), ("now", raw_now)):
        try:
            cfg = parse_device_record(raw, hub_version=HUB_VERSION, entity_kind="device")
            fields = {
                k: getattr(cfg, k)
                for k in dir(cfg)
                if not k.startswith("_") and not callable(getattr(cfg, k))
            }
            fields = {k: (v.hex() if isinstance(v, (bytes, bytearray)) else v) for k, v in fields.items()}
            artifacts[f"parsed_{label}"] = fields
            print(f"parsed[{label}]: {json.dumps(fields, default=str)[:600]}")
        except Exception as exc:  # noqa: BLE001
            print(f"parse[{label}] failed: {exc}")
finally:
    path = save_json(f"inplace-c1b-{TAG}", artifacts)
    print("\nartifacts saved:", path)
    proxy.stop()
    print("disconnected")
