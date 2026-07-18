"""Backup/restore chunk 4: append-mode hub_bundle restore + V7 chains + 0xC5.

Assembles a small hub_bundle from real captured components (X1S):
  - 2 device copies (dev 10 + dev 11, both have configured inputs) with
    distinct names, keeping their source ids so restore must remap them.
  - 2 activities built from real act-103 content filtered to those two
    members (so bindings/macros/favorites + the real 0xC5 "set input"
    rows survive):
      * A "Bench Chain Tgt"  (source id 0x80)
      * B "Bench Chain Src"  (source id 0x81) — plus a synthetic
        cross-activity chain step in POWER_OFF referencing A.
Restores via ``restore_hub_bundle`` (append; no erase) and verifies:
  - device-id remap map (10/11 -> fresh ids),
  - 0xC5 ordinal re-resolution ran (skipped_input_ordinals == 0),
  - the chain step's device byte in B lands remapped to A's NEW id
    (closes the V7 gate — proven non-trivial because A's source id
    0x80 differs from its allocated id).
Cleanup: delete B, A, then both device copies via family 0x09.

Usage:
    python bench_68_bundle_restore.py <ip> <X1|X1S> <tag>
"""

from __future__ import annotations

import copy
import json
import sys
import time

from bench_common import BENCH_DIR, connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

MEMBER_DEVS = [10, 11]          # real X1S devices with configured inputs
A_SRC, B_SRC = 0x80, 0x81       # bundle source activity ids (remapped on restore)
DEV_A_NAME, DEV_B_NAME = "Bench Dev A", "Bench Dev B"
ACT_A_NAME, ACT_B_NAME = "Bench Chain Tgt", "Bench Chain Src"
SCHEMA_DEVICE, SCHEMA_ACTIVITY, SCHEMA_BUNDLE = 4, 4, 5

log_path = setup_logging(f"br-bundle-{TAG}")
print(f"logging to {log_path}")

src_bundle = json.loads((BENCH_DIR / f"br-bundle-{TAG}.json").read_text(encoding="utf-8"))


def _dev(did: int) -> dict:
    return next(d for d in src_bundle["devices"] if int(d["device"]["device_id"]) == did)


def _act(aid: int) -> dict:
    return next(a for a in src_bundle["activities"] if int(a["device"]["device_id"]) == aid)


KEEP = set(MEMBER_DEVS) | {0xFF}  # member devices + delay/wait sentinel


def _filter_activity(template: dict, *, name: str, src_id: int) -> dict:
    """Clone a real activity_backup restricted to MEMBER_DEVS."""
    out = copy.deepcopy(template)
    out["kind"] = "activity_backup"
    out["schema_version"] = SCHEMA_ACTIVITY
    out["device"] = dict(out["device"])
    out["device"]["name"] = name
    out["device"]["device_id"] = src_id
    out["device"]["entity_type"] = "activity"
    out["device"]["code_type"] = 0
    out["device"]["poll_time"] = -1

    out["button_bindings"] = [
        r for r in out.get("button_bindings") or []
        if int(r.get("device_id", 0)) & 0xFF in MEMBER_DEVS
    ]
    out["favorite_slots"] = [
        r for r in out.get("favorite_slots") or []
        if int(r.get("device_id", 0)) & 0xFF in MEMBER_DEVS
    ]
    macros = []
    for m in out.get("macros") or []:
        m = dict(m)
        m["steps"] = [
            s for s in m.get("steps") or []
            if int(s.get("device_id", 0)) & 0xFF in KEEP
        ]
        macros.append(m)
    out["macros"] = macros
    out["referenced_source_device_ids"] = sorted(MEMBER_DEVS)
    return out


# --- devices: copies with distinct names, source ids preserved
dev_a = copy.deepcopy(_dev(MEMBER_DEVS[0]))
dev_a["device"]["name"] = DEV_A_NAME
dev_b = copy.deepcopy(_dev(MEMBER_DEVS[1]))
dev_b["device"]["name"] = DEV_B_NAME

# --- activities from real act 103 (has real 0xC5 rows for devs 10 & 11)
template = _act(103)
act_a = _filter_activity(template, name=ACT_A_NAME, src_id=A_SRC)
act_b = _filter_activity(template, name=ACT_B_NAME, src_id=B_SRC)

# Inject a cross-activity chain step into B's POWER_OFF (0xC7=199)
# referencing activity A (device byte = A's source id, which restore must
# remap to A's freshly-assigned id).
chain_step = {
    "device_id": A_SRC,
    "command_id": 198,
    "button_code": 0,
    "duration": 0,
    "delay": 255,
}
poweroff = next((m for m in act_b["macros"] if int(m["button_id"]) == 199), None)
if poweroff is None:
    poweroff = {"button_id": 199, "name": "POWER_OFF", "steps": []}
    act_b["macros"].append(poweroff)
poweroff["steps"].append(chain_step)

# Count the 0xC5 rows we expect resolution to touch.
c5_rows = [
    (int(s["device_id"]) & 0xFF, int(s.get("duration", 0)))
    for m in act_b["macros"]
    for s in m.get("steps") or []
    if int(s.get("command_id", 0)) & 0xFF == 0xC5 and int(s.get("duration", 0)) != 0
]
print(f"activity B carries {len(c5_rows)} non-zero 0xC5 rows: {c5_rows}")

bundle = {
    "kind": "hub_bundle",
    "schema_version": SCHEMA_BUNDLE,
    "payload_profile": "full_backup",
    "captured_at": "bench",
    "complete": True,
    "hub": {"hub_version": HUB_VERSION},
    "devices": [dev_a, dev_b],
    "activities": [act_a, act_b],
}

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""))


def wait_ready(getter, timeout=15.0):
    deadline = time.time() + timeout
    val = None
    while time.time() < deadline:
        val, ready = getter()
        if ready:
            return val, True
        time.sleep(0.3)
    return val, False


def snapshot(proxy):
    proxy._refresh_catalog("devices", timeout=15.0)
    proxy._refresh_catalog("activities", timeout=15.0)
    devs, _ = wait_ready(lambda: proxy.get_devices(), timeout=6.0)
    acts, _ = wait_ready(lambda: proxy.get_activities(force_refresh=False), timeout=6.0)
    return (
        {int(k) for k in (devs or {})},
        {int(k): (v.get("name") if isinstance(v, dict) else v) for k, v in (acts or {}).items()},
    )


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST}
try:
    devs0, acts0 = snapshot(proxy)
    print(f"baseline: {len(devs0)} devices, activities={acts0}")

    print("restoring hub_bundle (append mode)...")
    t0 = time.time()
    result = proxy.restore_hub_bundle(bundle)
    print(f"  restore_hub_bundle ({time.time()-t0:.1f}s): {json.dumps(result)[:500]}")
    artifacts["restore_result"] = result
    check("bundle restore succeeded", result.get("status") == "success", str(result.get("failed_at")))
    if result.get("status") != "success":
        raise SystemExit("bundle restore failed")

    dmap = {int(k): int(v) for k, v in (result.get("device_id_map") or {}).items()}
    check("device_id_map remaps both members",
          set(dmap) == set(MEMBER_DEVS) and all(dmap[d] not in MEMBER_DEVS for d in MEMBER_DEVS),
          f"{dmap}")

    ra = {int(e["source_activity_id"]): e for e in result.get("restored_activities") or []}
    check("both activities restored", set(ra) == {A_SRC, B_SRC}, f"{sorted(ra)}")
    new_a = int(ra[A_SRC]["activity_id"])
    new_b = int(ra[B_SRC]["activity_id"])
    print(f"  A 0x{A_SRC:02X}->0x{new_a:02X}, B 0x{B_SRC:02X}->0x{new_b:02X}")

    b_skipped = int(ra[B_SRC].get("skipped_input_ordinals", -1))
    check("0xC5 ordinals re-resolved (none skipped)", b_skipped == 0,
          f"skipped_input_ordinals={b_skipped}")

    # ---- V7 gate: re-read B, chain step device byte must be A's NEW id
    reread_b = proxy.backup_activity(new_b)
    artifacts["reread_b"] = reread_b
    chain_devs = [
        int(s.get("device_id", 0)) & 0xFF
        for m in (reread_b or {}).get("macros") or []
        if int(m.get("button_id", 0)) == 199
        for s in m.get("steps") or []
        if (int(s.get("device_id", 0)) & 0xFF) >= 0x65
    ]
    check("chain step device byte remapped to A's new id",
          chain_devs == [new_a],
          f"chain devices in B POWER_OFF={chain_devs}, A new id=0x{new_a:02X} (src was 0x{A_SRC:02X})")

    # ---- 0xC5 rows present in re-read B with resolved (non-zero) ordinals
    c5_reread = [
        (int(s["device_id"]) & 0xFF, int(s.get("duration", 0)))
        for m in (reread_b or {}).get("macros") or []
        for s in m.get("steps") or []
        if int(s.get("command_id", 0)) & 0xFF == 0xC5 and int(s.get("duration", 0)) != 0
    ]
    print(f"  B re-read 0xC5 rows: {c5_reread}")
    check("0xC5 rows survived round-trip with valid ordinals",
          len(c5_reread) == len(c5_rows) and all(o > 0 for _d, o in c5_reread),
          f"{c5_reread}")

finally:
    # ---- cleanup: activities first (family 0x09, id>=0x65), then devices
    print("cleanup...")
    try:
        for src in (B_SRC, A_SRC):
            e = (result.get("restored_activities") or []) if "result" in dir() else []
            match = next((x for x in e if int(x["source_activity_id"]) == src), None)
            if match:
                proxy.delete_device(int(match["activity_id"]))
        for src in MEMBER_DEVS:
            if "dmap" in dir() and src in dmap:
                proxy.delete_device(dmap[src])
    except Exception as exc:  # noqa: BLE001
        print("cleanup error:", exc)

    devs1, acts1 = snapshot(proxy)
    check("devices back at baseline", devs1 == devs0, f"{sorted(devs1)}")
    check("activities back at baseline", set(acts1) == set(acts0), f"{sorted(acts1)}")

    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    save_json(f"br-bundle-restore-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
