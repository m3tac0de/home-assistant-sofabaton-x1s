"""Device-IP program, chunk 1: validate the live head-IP editor end-to-end.

Drives the exact production path the live device editor uses for the new
Network-section IP edit: structural baseline + edited bundle differing only
in the device head ``ip_address``, through ``sync_device``
(build_device_sync_plan → stale pre-flight → _sync_step_device_ip →
FAMILY_DEVICE_UPDATE record rewrite).

Asserts, on the chosen device:
  - an identical bundle pair plans nothing (no-op),
  - sync_device succeeds with exactly one device_ip step,
  - the re-read head carries the new IP; the record body differs from the
    original only in the tail IP window + checksum,
  - every other device (name/class/brand/body) is untouched,
  - a combined rename+IP edit lands BOTH writes (raw_body write-back
    compose check),
and restores the original head through the same path.

Usage:
    python bench_100_device_ip_sync.py <ip> <X1|X1S> <tag>              # recon: list devices + head IPs
    python bench_100_device_ip_sync.py <ip> <X1|X1S> <tag> <device_id> <test_ip>
"""

from __future__ import annotations

import copy
import sys
import time

from bench_common import connect, save_json, setup_logging

from x1slib.devices import parse_device_record

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DEV_ID = int(sys.argv[4], 0) if len(sys.argv) > 4 else None
TEST_IP = sys.argv[5] if len(sys.argv) > 5 else None

SLOT = 60 if HUB_VERSION.upper() in ("X1S", "X2") else 30
TAIL_START = 29 + 2 * SLOT
IP_WINDOW = range(TAIL_START, TAIL_START + 6)  # FC 55 + 4 IP bytes

log_path = setup_logging(f"dev-ip-{TAG}")
print(f"logging to {log_path}")


def snapshot(proxy) -> dict:
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    out = {}
    for dev_id, info in proxy.state.entities("device").items():
        raw = info.get("raw_body")
        ip = None
        if isinstance(raw, (bytes, bytearray)):
            try:
                ip = parse_device_record(bytes(raw), hub_version=HUB_VERSION).ip_address
            except (ValueError, TypeError):
                ip = "<unparseable>"
        out[int(dev_id)] = {
            "name": info.get("name"),
            "device_class": info.get("device_class"),
            "brand": info.get("brand"),
            "ip": ip,
            "raw_body": bytes(raw).hex() if isinstance(raw, (bytes, bytearray)) else None,
        }
    return out


def _structural_bundle(proxy, device_id: int) -> dict:
    device = proxy.backup_device(device_id, include_blobs=False)
    return {"kind": "hub_bundle", "schema_version": 5,
            "hub": {"version": HUB_VERSION}, "devices": [device], "activities": []}


def _with_head(bundle: dict, *, ip=..., name=...) -> dict:
    edited = copy.deepcopy(bundle)
    head = edited["devices"][0]["device"]
    if ip is not ...:
        head["ip_address"] = ip
    if name is not ...:
        head["name"] = name
    return edited


def _identity(entry) -> tuple:
    return (entry["name"], entry["device_class"], entry["brand"], entry["raw_body"])


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "hub_version": HUB_VERSION, "device_id": DEV_ID, "test_ip": TEST_IP}
try:
    before = snapshot(proxy)
    print(f"{len(before)} devices:")
    for dev_id in sorted(before):
        entry = before[dev_id]
        print(f"  0x{dev_id:02X} {entry['name']!r:24} class={entry['device_class']!s:12} ip={entry['ip']}")
    artifacts["devices"] = {
        k: {kk: vv for kk, vv in v.items() if kk != "raw_body"} for k, v in before.items()
    }

    if DEV_ID is None or TEST_IP is None:
        print("recon only — rerun with <device_id> <test_ip> to validate")
        raise SystemExit(0)

    if DEV_ID not in before:
        raise SystemExit(f"device 0x{DEV_ID:02X} not present")
    orig_ip = before[DEV_ID]["ip"]
    orig_name = str(before[DEV_ID]["name"])
    orig_raw = before[DEV_ID]["raw_body"]
    print(f"target 0x{DEV_ID:02X} {orig_name!r} original ip={orig_ip}")
    artifacts.update(original_ip=orig_ip, original_name=orig_name)

    # ---- no-op: identical bundles plan nothing ----------------------------
    baseline = _structural_bundle(proxy, DEV_ID)
    bundle_ip = baseline["devices"][0]["device"].get("ip_address")
    print(f"bundle head ip_address={bundle_ip!r}")
    noop = proxy.sync_device(baseline=baseline, edited=copy.deepcopy(baseline), device_id=DEV_ID)
    noop_ok = noop.get("status") == "success" and noop.get("total_steps", 0) == 0
    print(f"  {'OK  ' if noop_ok else 'FAIL'} identical bundles = empty plan ({noop.get('status')})")
    artifacts["noop"] = noop

    # ---- IP change through sync_device -------------------------------------
    edited = _with_head(baseline, ip=TEST_IP)
    result = proxy.sync_device(baseline=baseline, edited=edited, device_id=DEV_ID)
    time.sleep(0.6)
    after = snapshot(proxy)
    tgt = after.get(DEV_ID, {})
    sync_ok = result.get("status") == "success"
    one_step = result.get("counters", {}).get("device_ip") == 1
    changed = tgt.get("ip") == TEST_IP
    others_intact = all(
        _identity(after[d]) == _identity(before[d]) for d in before if d != DEV_ID and d in after
    ) and set(after) == set(before)

    body_ok = None
    if orig_raw and tgt.get("raw_body"):
        a = bytes.fromhex(orig_raw)
        b = bytes.fromhex(tgt["raw_body"])
        if len(a) == len(b):
            diffs = [i for i in range(len(a)) if a[i] != b[i]]
            outside = [i for i in diffs if i not in IP_WINDOW and i != len(a) - 1]
            body_ok = not outside
            artifacts["diff_indices"] = diffs
            artifacts["diff_outside_ip"] = outside

    print(f"  {'OK  ' if sync_ok else 'FAIL'} sync_device success ({result.get('status')}/{result.get('failed_at','')})")
    print(f"  {'OK  ' if one_step else 'FAIL'} exactly one device_ip step ({result.get('counters')})")
    print(f"  {'OK  ' if changed else 'FAIL'} head IP now {TEST_IP} (got {tgt.get('ip')})")
    print(f"  {'OK  ' if others_intact else 'FAIL'} other devices intact")
    print(f"  {'OK  ' if body_ok else 'FAIL' if body_ok is not None else '??  '} body changed only in IP window + checksum")
    artifacts["sync"] = {"result": result, "changed": changed,
                        "others_intact": others_intact, "body_ok": body_ok}

    # ---- compose: rename + IP restore in ONE plan --------------------------
    # Restores the original IP while also renaming, exercising the raw_body
    # write-back (second head write must not undo the first).
    baseline2 = _structural_bundle(proxy, DEV_ID)
    combo_name = orig_name[:-1] + ("x" if not orig_name.endswith("x") else "y")
    combo = _with_head(baseline2, ip=orig_ip or "", name=combo_name)
    combo_result = proxy.sync_device(baseline=baseline2, edited=combo, device_id=DEV_ID)
    time.sleep(0.6)
    mid = snapshot(proxy)
    combo_ok = (
        combo_result.get("status") == "success"
        and combo_result.get("counters", {}).get("device_rename") == 1
        and combo_result.get("counters", {}).get("device_ip") == 1
        and mid.get(DEV_ID, {}).get("ip") == orig_ip
        and mid.get(DEV_ID, {}).get("name") == combo_name
    )
    print(f"  {'OK  ' if combo_ok else 'FAIL'} rename+IP in one plan both landed "
          f"({combo_result.get('counters')}, name={mid.get(DEV_ID, {}).get('name')!r}, ip={mid.get(DEV_ID, {}).get('ip')})")
    artifacts["combo"] = {"result": combo_result, "ok": combo_ok}

    # ---- restore original name --------------------------------------------
    baseline3 = _structural_bundle(proxy, DEV_ID)
    restore = _with_head(baseline3, name=orig_name)
    proxy.sync_device(baseline=baseline3, edited=restore, device_id=DEV_ID)
    time.sleep(0.6)
    final = snapshot(proxy)
    ftgt = final.get(DEV_ID, {})
    restored_ok = ftgt.get("name") == orig_name and ftgt.get("ip") == orig_ip
    body_restored = ftgt.get("raw_body") == orig_raw
    print(f"{'OK  ' if restored_ok else 'FAIL'} original name+ip restored (name={ftgt.get('name')!r}, ip={ftgt.get('ip')})")
    print(f"{'OK  ' if body_restored else 'FAIL'} record body byte-identical to original")
    artifacts.update(restored_ok=restored_ok, body_restored=body_restored)
finally:
    save_json(f"dev-ip-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
