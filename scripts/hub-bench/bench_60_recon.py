"""Backup/restore program chunk 1: recon + baseline + bundle capture.

Read-only. Connects to one hub, captures a full
``backup_hub_bundle(include_blobs=True)`` (the disaster-recovery snapshot
for chunk 6), extracts per-entity baselines of the sacrificial device and
the permanent "Bench Test" activity (0x68), and runs offline sanity checks
on the bundle. Plan: docs/internal/backup-restore-bench-plan.md.

Usage:
    python bench_60_recon.py <ip> <X1|X1S> <tag> <sacrificial_device_id>
"""

from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]  # file tag, e.g. "x1"
SACRIFICIAL_DEV = int(sys.argv[4], 0)  # 0x09 on X1, 0x0A on X1S

BENCH_TEST_ACTIVITY = 0x68  # permanent sacrificial activity on both hubs
RECOVERY_DIR = Path.home() / "x1s-bench-recovery"

log_path = setup_logging(f"br-recon-{TAG}")
print(f"logging to {log_path}")


def sanity_check_bundle(bundle: dict) -> list[str]:
    """Offline sanity checks per the chunk-1 plan. Returns problem strings."""
    problems: list[str] = []

    if bundle.get("kind") != "hub_bundle":
        problems.append(f"bundle kind={bundle.get('kind')!r} (expected hub_bundle)")
    if not bundle.get("schema_version"):
        problems.append("bundle missing schema_version")
    if bundle.get("payload_profile") != "full_backup":
        problems.append(
            f"payload_profile={bundle.get('payload_profile')!r} (expected full_backup)"
        )

    device_ids: set[int] = set()
    for dev in bundle.get("devices") or []:
        block = dev.get("device") or {}
        dev_id = int(block.get("device_id") or 0)
        device_ids.add(dev_id)
        label = f"device 0x{dev_id:02X} ({block.get('name')!r})"
        if not dev.get("schema_version"):
            problems.append(f"{label}: missing schema_version")
        if not dev.get("complete"):
            problems.append(f"{label}: complete=False")
        device_class = block.get("device_class")
        if device_class == "ir":
            for cmd in dev.get("commands") or []:
                rd = cmd.get("restore_data")
                if not isinstance(rd, dict) or not str(rd.get("data_hex") or "").strip():
                    problems.append(
                        f"{label}: IR command fid={cmd.get('fid')} "
                        f"key={cmd.get('key_id')} lacks restore_data.data_hex"
                    )

    for act in bundle.get("activities") or []:
        block = act.get("device") or {}
        act_id = int(block.get("device_id") or block.get("activity_id") or 0)
        label = f"activity 0x{act_id:02X} ({block.get('name')!r})"
        if not act.get("schema_version"):
            problems.append(f"{label}: missing schema_version")
        if not act.get("complete"):
            problems.append(f"{label}: complete=False")
        referenced = set(int(x) for x in act.get("referenced_source_device_ids") or [])
        # References to other activities (chain steps) are legal; only
        # ids in the device range (< 0x65) must exist in the bundle.
        missing = {d for d in referenced if d < 0x65} - device_ids
        if missing:
            problems.append(
                f"{label}: references absent devices "
                f"{sorted(f'0x{d:02X}' for d in missing)}"
            )

    return problems


proxy = connect(HOST, HUB_VERSION)
try:
    print("connected; capturing full hub bundle (include_blobs=True)...")
    t0 = time.time()

    def _progress(**payload):
        msg = payload.get("message")
        if msg:
            print(f"  [{payload.get('completed_steps')}/{payload.get('total_steps')}] {msg}")

    bundle = proxy.backup_hub_bundle(include_blobs=True, progress=_progress)
    print(f"bundle captured in {time.time() - t0:.1f}s")

    bundle_path = save_json(f"br-bundle-{TAG}", bundle)
    print("bundle saved:", bundle_path)

    # Disaster-recovery copy outside out/ (chunk 6 depends on this).
    RECOVERY_DIR.mkdir(parents=True, exist_ok=True)
    recovery_path = RECOVERY_DIR / f"br-bundle-{TAG}-{time.strftime('%Y%m%d-%H%M%S')}.json"
    shutil.copy2(bundle_path, recovery_path)
    print("recovery copy:", recovery_path)

    # ------------------------------------------------------------------
    # inventory + per-device class map
    # ------------------------------------------------------------------
    class_map: dict[str, dict] = {}
    print("devices in bundle:")
    for dev in bundle.get("devices") or []:
        block = dev.get("device") or {}
        dev_id = int(block.get("device_id") or 0)
        class_map[str(dev_id)] = {
            "name": block.get("name"),
            "device_class": block.get("device_class"),
            "device_class_code": block.get("device_class_code"),
            "n_commands": len(dev.get("commands") or []),
            "n_bindings": len(dev.get("button_bindings") or []),
            "n_macros": len(dev.get("macros") or []),
            "has_input_record": dev.get("input_record") is not None,
            "complete": dev.get("complete"),
        }
        print(
            f"  0x{dev_id:02X} ({dev_id}): {block.get('name')!r} "
            f"class={block.get('device_class')!r} "
            f"commands={class_map[str(dev_id)]['n_commands']} "
            f"complete={dev.get('complete')}"
        )
    print("activities in bundle:")
    for act in bundle.get("activities") or []:
        block = act.get("device") or {}
        act_id = int(block.get("device_id") or 0)
        print(
            f"  0x{act_id:02X} ({act_id}): {block.get('name')!r} "
            f"buttons={len(act.get('button_bindings') or [])} "
            f"favorites={len(act.get('favorite_slots') or [])} "
            f"macros={len(act.get('macros') or [])} "
            f"refs={act.get('referenced_source_device_ids')} "
            f"complete={act.get('complete')}"
        )

    # ------------------------------------------------------------------
    # per-entity baselines: sacrificial device + Bench Test activity
    # ------------------------------------------------------------------
    dev_payload = next(
        (
            d
            for d in bundle.get("devices") or []
            if int((d.get("device") or {}).get("device_id") or 0) == SACRIFICIAL_DEV
        ),
        None,
    )
    act_payload = next(
        (
            a
            for a in bundle.get("activities") or []
            if int((a.get("device") or {}).get("device_id") or 0) == BENCH_TEST_ACTIVITY
        ),
        None,
    )
    if dev_payload is None:
        print(f"!! sacrificial device 0x{SACRIFICIAL_DEV:02X} NOT FOUND on hub")
    else:
        p = save_json(f"br-baseline-dev-{TAG}", dev_payload)
        print(f"sacrificial device baseline saved: {p}")
    if act_payload is None:
        print(f"!! Bench Test activity 0x{BENCH_TEST_ACTIVITY:02X} NOT FOUND on hub")
    else:
        p = save_json(f"br-baseline-act-{TAG}", act_payload)
        print(f"Bench Test activity baseline saved: {p}")

    # ------------------------------------------------------------------
    # offline sanity
    # ------------------------------------------------------------------
    problems = sanity_check_bundle(bundle)
    save_json(
        f"br-recon-{TAG}",
        {
            "host": HOST,
            "hub_version": HUB_VERSION,
            "captured_at": bundle.get("captured_at"),
            "bundle_complete": bundle.get("complete"),
            "recovery_copy": str(recovery_path),
            "device_classes": class_map,
            "sacrificial_device_present": dev_payload is not None,
            "bench_test_activity_present": act_payload is not None,
            "sanity_problems": problems,
        },
    )
    if problems:
        print(f"SANITY: {len(problems)} problem(s):")
        for item in problems:
            print("  -", item)
    else:
        print("SANITY: all checks passed")
finally:
    proxy.stop()
    print("disconnected")
