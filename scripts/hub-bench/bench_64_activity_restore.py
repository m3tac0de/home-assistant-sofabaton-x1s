"""Backup/restore chunk 3: rich activity restore round-trip + membership probe.

Restores a copy of a rich, app-created activity from the chunk-1 bundle
(``--source <act_id>``), round-trip compares content via
``bench_compare.compare_activity_backup``, then probes the restored
activity's hub-side membership (``request_activity_mapping``) against the
source app-created activity — to understand why restored activities are
purged by the device-delete sweep (chunk-2 open finding).

Does NOT delete anything (no activity-delete path proven yet). Leaves the
restored copy on the hub; a follow-up script handles cleanup once the
delete path is known.

Usage:
    python bench_64_activity_restore.py <ip> <X1|X1S> <tag> <source_act_id>
"""

from __future__ import annotations

import copy
import dataclasses
import json
import sys
import time

from bench_common import BENCH_DIR, connect, save_json, setup_logging
from bench_compare import compare_activity_backup

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SOURCE_ACT = int(sys.argv[4], 0)

log_path = setup_logging(f"br-actrt-{TAG}-{SOURCE_ACT:02x}")
print(f"logging to {log_path}")

bundle = json.loads((BENCH_DIR / f"br-bundle-{TAG}.json").read_text(encoding="utf-8"))
source = next(
    (a for a in bundle["activities"] if int(a["device"]["device_id"]) == SOURCE_ACT),
    None,
)
if source is None:
    sys.exit(f"activity 0x{SOURCE_ACT:02X} not in bundle for {TAG}")

refs = [int(d) for d in (source.get("referenced_source_device_ids") or [])]
device_id_map = {d: d for d in refs if d < 0x65}  # identity: devices already exist
new_name = (str(source["device"].get("name") or "act")[:20]).strip() + " Copy"
new_name = new_name[:30]

print(
    f"source: 0x{SOURCE_ACT:02X} {source['device'].get('name')!r} "
    f"refs={refs} binds={len(source.get('button_bindings') or [])} "
    f"favs={len(source.get('favorite_slots') or [])} "
    f"macros={len(source.get('macros') or [])}"
)

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def _jsonable(value):
    if dataclasses.is_dataclass(value):
        return {f.name: _jsonable(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, (list, tuple)):
        return [_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    return value


def probe_membership(proxy, act_lo: int) -> dict:
    """Return the hub-side mapping/members/slots for an activity."""
    proxy.state.activity_members.pop(act_lo, None)
    proxy.state.activity_favorite_slots.pop(act_lo, None)
    proxy._activity_map_complete.discard(act_lo)
    proxy.request_activity_mapping(act_lo)
    proxy._wait_for_activity_map_burst(act_lo, timeout=6.0)
    return {
        "members": sorted(proxy.state.get_activity_members(act_lo)),
        "favorite_slots": _jsonable(proxy.state.get_activity_favorite_slots(act_lo)),
    }


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "source_activity": SOURCE_ACT}
try:
    # baseline membership of the source (app-created) activity, for contrast
    src_members = probe_membership(proxy, SOURCE_ACT)
    artifacts["source_membership"] = src_members
    print(f"source membership: {src_members['members']}")

    payload = copy.deepcopy(source)
    payload["device"]["name"] = new_name

    print(f"restoring copy of 0x{SOURCE_ACT:02X} as {new_name!r} (device_id_map={device_id_map})...")
    t0 = time.time()
    result = proxy.restore_activity(payload, device_id_map=device_id_map)
    elapsed = time.time() - t0
    artifacts["restore_result"] = result
    check(
        "restore_activity succeeded",
        bool(result) and result.get("status") == "success",
        f"{elapsed:.1f}s result={result}",
    )
    if not result or result.get("status") != "success":
        raise SystemExit("restore failed")

    new_id = int(result["activity_id"]) & 0xFF
    check("assigned fresh activity id", new_id != SOURCE_ACT, f"new_id=0x{new_id:02X}")

    # ---- round-trip content compare
    print(f"re-reading restored activity 0x{new_id:02X}...")
    reread = proxy.backup_activity(new_id)
    artifacts["reread"] = reread
    check("re-read returned payload", isinstance(reread, dict))
    if isinstance(reread, dict):
        problems, notes = compare_activity_backup(
            source,
            reread,
            device_id_map=device_id_map,
            expected_name=new_name,
            hub_version=HUB_VERSION,
        )
        artifacts["compare_problems"] = problems
        artifacts["compare_notes"] = notes
        for note in notes:
            print(f"  note: {note}")
        check("round-trip equal", not problems, f"{len(problems)} problem(s)")
        for item in problems[:30]:
            print("    -", item)

    # ---- membership probe: restored vs source
    dst_members = probe_membership(proxy, new_id)
    artifacts["restored_membership"] = dst_members
    print(f"restored membership: {dst_members['members']}")
    expected_members = sorted(device_id_map.get(d, d) for d in refs if d < 0x65)
    check(
        "restored activity has member table",
        bool(dst_members["members"]),
        f"members={dst_members['members']} expected~={expected_members}",
    )
    check(
        "member set matches source refs",
        set(dst_members["members"]) == set(expected_members),
        f"got={dst_members['members']} expected={expected_members}",
    )
finally:
    artifacts["checks"] = [
        {"label": l, "ok": ok, "detail": d} for l, ok, d in checks
    ]
    path = save_json(f"br-actrt-{TAG}-{SOURCE_ACT:02x}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
