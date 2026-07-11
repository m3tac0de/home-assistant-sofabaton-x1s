"""Backup/restore program chunk 2: device restore round-trip + delete.

Restores a copy (renamed "Bench Copy") of a source device taken from the
chunk-1 bundle, re-reads it with ``backup_device(include_blobs=True)``,
compares round-trip equality via ``bench_compare``, then runs the first
live ``delete_device`` (family 0x09 + activity-confirm sweep — must be a
no-op sweep since the copy is in no activity) and verifies the catalog is
back at baseline. Plan: docs/internal/backup-restore-bench-plan.md.

Usage:
    python bench_61_device_restore.py <ip> <X1|X1S> <tag> <source_dev_id>
"""

from __future__ import annotations

import copy
import json
import sys
import time
from pathlib import Path

from bench_common import BENCH_DIR, connect, save_json, setup_logging
from bench_compare import compare_device_backup

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SOURCE_DEV = int(sys.argv[4], 0)

COPY_NAME = "Bench Copy"
PROTECTED_ACTIVITIES = [0x65, 0x66, 0x67, 0x68]

log_path = setup_logging(f"br-devrt-{TAG}-{SOURCE_DEV:02x}")
print(f"logging to {log_path}")

bundle = json.loads((BENCH_DIR / f"br-bundle-{TAG}.json").read_text(encoding="utf-8"))
source = next(
    (
        d
        for d in bundle["devices"]
        if int(d["device"]["device_id"]) == SOURCE_DEV
    ),
    None,
)
if source is None:
    sys.exit(f"device 0x{SOURCE_DEV:02X} not in chunk-1 bundle for {TAG}")
print(
    f"source: 0x{SOURCE_DEV:02X} {source['device'].get('name')!r} "
    f"class={source['device'].get('device_class')!r} "
    f"commands={len(source.get('commands') or [])} "
    f"bindings={len(source.get('button_bindings') or [])} "
    f"macros={len(source.get('macros') or [])}"
)

payload = copy.deepcopy(source)
payload["device"]["name"] = COPY_NAME

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def snapshot_catalog(proxy) -> tuple[dict, dict]:
    proxy.request_devices()
    proxy.request_activities()
    deadline = time.time() + 20
    devs = acts = None
    while time.time() < deadline:
        devs, devs_ready = proxy.get_devices()
        acts, acts_ready = proxy.get_activities(force_refresh=False)
        if devs_ready and acts_ready:
            break
        time.sleep(0.5)
    return dict(devs or {}), dict(acts or {})


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "source_device": SOURCE_DEV}
try:
    devs0, acts0 = snapshot_catalog(proxy)
    print(f"baseline catalog: {len(devs0)} devices, {len(acts0)} activities")

    # ---- restore
    print(f"restoring copy of 0x{SOURCE_DEV:02X} as {COPY_NAME!r}...")
    t0 = time.time()
    result = proxy.restore_device(payload)
    elapsed = time.time() - t0
    artifacts["restore_result"] = result
    check("restore_device returned success", bool(result) and result.get("status") == "success",
          f"{elapsed:.1f}s result={result}")
    if not result or result.get("status") != "success":
        raise SystemExit("restore failed; stopping before delete")

    new_id = int(result["device_id"])
    cmd_map = {int(k): int(v) for k, v in (result.get("command_id_map") or {}).items()}
    check(
        "assigned id is fresh",
        new_id not in devs0,
        f"new_id=0x{new_id:02X}",
    )
    check(
        "all commands mapped",
        len(cmd_map) == len(source.get("commands") or []),
        f"{len(cmd_map)}/{len(source.get('commands') or [])}",
    )

    # ---- re-read + compare
    print(f"re-reading restored device 0x{new_id:02X}...")
    reread = proxy.backup_device(new_id, include_blobs=True)
    artifacts["reread"] = reread
    check("re-read returned payload", isinstance(reread, dict))
    if isinstance(reread, dict):
        problems, notes = compare_device_backup(
            source,
            reread,
            command_id_map=cmd_map,
            expected_name=COPY_NAME,
            hub_version=HUB_VERSION,
        )
        artifacts["compare_problems"] = problems
        artifacts["compare_notes"] = notes
        for note in notes:
            print(f"  note: {note}")
        check("round-trip equal", not problems, f"{len(problems)} problem(s)")
        for item in problems:
            print("    -", item)

    # ---- delete (first live family-0x09 validation)
    print(f"deleting restored copy 0x{new_id:02X}...")
    t0 = time.time()
    del_result = proxy.delete_device(new_id)
    elapsed = time.time() - t0
    artifacts["delete_result"] = del_result
    check(
        "delete_device returned success",
        bool(del_result) and del_result.get("status") == "success",
        f"{elapsed:.1f}s result={del_result}",
    )
    if del_result:
        check(
            "confirm sweep was a no-op",
            not del_result.get("confirmed_activities"),
            f"confirmed={del_result.get('confirmed_activities')}",
        )

    # ---- baseline verification
    devs1, acts1 = snapshot_catalog(proxy)
    check("copy gone from device catalog", new_id not in devs1)
    check(
        "device catalog back at baseline",
        sorted(devs1) == sorted(devs0),
        f"before={sorted(devs0)} after={sorted(devs1)}",
    )
    for act in PROTECTED_ACTIVITIES:
        before = acts0.get(act) or {}
        after = acts1.get(act) or {}
        check(
            f"activity 0x{act:02X} untouched",
            bool(after) and before.get("name") == after.get("name"),
            f"{after.get('name')!r}",
        )
finally:
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"br-devrt-{TAG}-{SOURCE_DEV:02x}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
