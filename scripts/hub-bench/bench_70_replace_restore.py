"""Backup/restore program chunk 6: replace-mode restore (erase + rebuild).

The destructive end-to-end test. Per hub:

1. capture a fresh full ``backup_hub_bundle(include_blobs=True)`` and
   ABORT before erasing unless it is sanity-clean and every entity is
   ``complete`` (there is no rollback after 0x001D);
2. ``erase_configuration`` (first live run of opcode 0x001D through our
   code; generous timeout, reconnect tolerated per docs/protocol/erase.md);
3. verify the hub is empty;
4. ``restore_hub_bundle`` (replace mode = full bundle onto an empty hub);
5. re-capture and content-compare every device and activity against the
   pre-erase bundle (name-keyed; ids may differ; hub-owned bytes
   excluded via bench_compare).

Run on the X1 first; only run the X1S after a clean X1 pass.

Usage:
    python bench_70_replace_restore.py <ip> <X1|X1S> <tag>
"""

from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

from bench_common import connect, save_json, setup_logging
from bench_compare import compare_activity_backup, compare_device_backup

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

RECOVERY_DIR = Path.home() / "x1s-bench-recovery"

log_path = setup_logging(f"br-replace-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def progress_printer(**payload):
    msg = payload.get("message")
    if msg:
        print(f"  [{payload.get('completed_steps')}/{payload.get('total_steps')}] {msg}")


def sanity_bundle(bundle: dict) -> list[str]:
    """Pre-erase gate: refuse to erase unless the snapshot is trustworthy."""
    problems: list[str] = []
    if bundle.get("kind") != "hub_bundle":
        problems.append(f"kind={bundle.get('kind')!r}")
    if bundle.get("payload_profile") != "full_backup":
        problems.append(f"payload_profile={bundle.get('payload_profile')!r}")
    device_ids: set[int] = set()
    for dev in bundle.get("devices") or []:
        block = dev.get("device") or {}
        dev_id = int(block.get("device_id") or 0)
        device_ids.add(dev_id)
        if not dev.get("complete"):
            problems.append(f"device 0x{dev_id:02X} ({block.get('name')!r}): complete=False")
    for act in bundle.get("activities") or []:
        block = act.get("device") or {}
        act_id = int(block.get("device_id") or 0)
        if not act.get("complete"):
            problems.append(f"activity 0x{act_id:02X} ({block.get('name')!r}): complete=False")
        referenced = set(int(x) for x in act.get("referenced_source_device_ids") or [])
        missing = {d for d in referenced if d < 0x65} - device_ids
        if missing:
            problems.append(
                f"activity 0x{act_id:02X}: references absent devices {sorted(missing)}"
            )
    return problems


def snapshot_catalog(proxy) -> tuple[dict, dict]:
    proxy.request_devices()
    proxy.request_activities()
    deadline = time.time() + 30
    devs = acts = None
    while time.time() < deadline:
        devs, devs_ready = proxy.get_devices()
        acts, acts_ready = proxy.get_activities(force_refresh=False)
        if devs_ready and acts_ready:
            break
        time.sleep(0.5)
    return dict(devs or {}), dict(acts or {})


def ensure_connected(proxy):
    """Reconnect if the hub cycled the session (expected after erase)."""
    if proxy.can_issue_commands():
        return proxy
    print("  session dropped; reconnecting...")
    try:
        proxy.stop()
    except Exception:
        pass
    deadline = time.time() + 120
    last_err = None
    while time.time() < deadline:
        try:
            return connect(HOST, HUB_VERSION, timeout=30)
        except Exception as exc:  # hub still rebooting its listener
            last_err = exc
            time.sleep(3)
    raise RuntimeError(f"could not reconnect after erase: {last_err}")


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION}
try:
    # ---- 1. fresh pre-erase capture (the only recovery path besides cloud)
    print("capturing fresh pre-erase bundle (include_blobs=True)...")
    t0 = time.time()
    pre = proxy.backup_hub_bundle(include_blobs=True, progress=progress_printer)
    print(f"pre-erase bundle captured in {time.time() - t0:.1f}s")
    pre_path = save_json(f"br-c6-pre-{TAG}", pre)
    RECOVERY_DIR.mkdir(parents=True, exist_ok=True)
    recovery_path = RECOVERY_DIR / f"br-c6-pre-{TAG}-{time.strftime('%Y%m%d-%H%M%S')}.json"
    shutil.copy2(pre_path, recovery_path)
    print(f"saved: {pre_path}\nrecovery copy: {recovery_path}")

    pre_devices = list(pre.get("devices") or [])
    pre_activities = list(pre.get("activities") or [])
    problems = sanity_bundle(pre)
    check(
        "pre-erase bundle trustworthy (ABORT gate)",
        not problems and bool(pre_devices),
        f"{len(pre_devices)} devices, {len(pre_activities)} activities, "
        f"{len(problems)} problem(s)",
    )
    for item in problems:
        print("    -", item)
    if problems or not pre_devices:
        raise SystemExit("pre-erase capture not trustworthy; NOT erasing")

    dev_names = [str((d.get("device") or {}).get("name")) for d in pre_devices]
    act_names = [str((a.get("device") or {}).get("name")) for a in pre_activities]
    check(
        "entity names unique (needed for name-keyed compare)",
        len(set(dev_names)) == len(dev_names) and len(set(act_names)) == len(act_names),
        f"devices={dev_names} activities={act_names}",
    )

    # ---- 2. erase (first live 0x001D through our code)
    print("sending erase_configuration (0x001D, timeout=180s)...")
    t0 = time.time()
    erased = proxy.erase_configuration(timeout=180.0, settle_seconds=3.0)
    check("erase_configuration acked", bool(erased), f"{time.time() - t0:.1f}s")
    artifacts["erase_seconds"] = round(time.time() - t0, 1)
    if not erased:
        raise SystemExit(
            "erase not acknowledged — hub state unknown; recover via "
            f"{recovery_path} or the official app's cloud sync"
        )

    # ---- 3. hub should now be empty (tolerate a session cycle)
    proxy = ensure_connected(proxy)
    devs_e, acts_e = snapshot_catalog(proxy)
    check(
        "hub empty after erase",
        not devs_e and not acts_e,
        f"devices={sorted(devs_e)} activities={sorted(acts_e)}",
    )

    # ---- 4. replace-mode restore: full bundle onto the empty hub
    print(f"restoring full bundle ({len(pre_devices)} devices, {len(pre_activities)} activities)...")
    t0 = time.time()
    result = proxy.restore_hub_bundle(pre, progress_callback=progress_printer)
    elapsed = time.time() - t0
    artifacts["restore_result"] = result
    check(
        "restore_hub_bundle success",
        bool(result) and result.get("status") == "success",
        f"{elapsed:.1f}s failed_at={result.get('failed_at')}",
    )
    if not result or result.get("status") != "success":
        raise SystemExit(
            "bundle restore FAILED mid-way — hub is partial; recover via "
            f"{recovery_path} or cloud sync"
        )

    device_id_map = {int(k): int(v) for k, v in (result.get("device_id_map") or {}).items()}
    activity_id_map = {
        int(r["source_activity_id"]): int(r["activity_id"])
        for r in result.get("restored_activities") or []
    }
    check(
        "all devices restored",
        len(device_id_map) == len(pre_devices),
        f"{len(device_id_map)}/{len(pre_devices)} map={device_id_map}",
    )
    check(
        "all activities restored",
        len(activity_id_map) == len(pre_activities),
        f"{len(activity_id_map)}/{len(pre_activities)} map={activity_id_map}",
    )
    skipped_ords = sum(
        int(r.get("skipped_input_ordinals") or 0)
        for r in result.get("restored_activities") or []
    )
    check("no skipped 0xC5 input ordinals", skipped_ords == 0, f"skipped={skipped_ords}")

    # ---- 5. full re-capture + content compare
    print("re-capturing post-restore bundle...")
    t0 = time.time()
    post = proxy.backup_hub_bundle(include_blobs=True, progress=progress_printer)
    print(f"post-restore bundle captured in {time.time() - t0:.1f}s")
    save_json(f"br-c6-post-{TAG}", post)

    post_devs_by_id = {
        int((d.get("device") or {}).get("device_id") or 0): d
        for d in post.get("devices") or []
    }
    post_acts_by_id = {
        int((a.get("device") or {}).get("device_id") or 0): a
        for a in post.get("activities") or []
    }
    check(
        "post-restore entity counts match",
        len(post_devs_by_id) == len(pre_devices)
        and len(post_acts_by_id) == len(pre_activities),
        f"{len(post_devs_by_id)} devices, {len(post_acts_by_id)} activities",
    )

    all_problems: dict[str, list[str]] = {}
    all_notes: dict[str, list[str]] = {}
    for src in pre_devices:
        block = src.get("device") or {}
        src_id = int(block.get("device_id") or 0)
        name = str(block.get("name"))
        new_id = device_id_map.get(src_id)
        dst = post_devs_by_id.get(new_id)
        label = f"device {name!r} 0x{src_id:02X}->{new_id if new_id is None else f'0x{new_id:02X}'}"
        if dst is None:
            check(f"{label} round-trip", False, "not found in post-restore capture")
            continue
        identity_cmd_map = {
            int(c.get("command_id") or c.get("key_id") or 0): int(
                c.get("command_id") or c.get("key_id") or 0
            )
            for c in src.get("commands") or []
        }
        problems, notes = compare_device_backup(
            src, dst,
            command_id_map=identity_cmd_map,
            expected_name=name,
            hub_version=HUB_VERSION,
        )
        all_problems[label] = problems
        all_notes[label] = notes
        check(f"{label} round-trip", not problems, f"{len(problems)} problem(s)")
        for item in problems:
            print("    -", item)

    # chain steps inside activities may reference activities by id, so
    # remap through devices ∪ activities (id ranges don't overlap).
    combined_map = dict(device_id_map)
    combined_map.update(activity_id_map)
    for src in pre_activities:
        block = src.get("device") or {}
        src_id = int(block.get("device_id") or 0)
        name = str(block.get("name"))
        new_id = activity_id_map.get(src_id)
        dst = post_acts_by_id.get(new_id)
        label = f"activity {name!r} 0x{src_id:02X}->{new_id if new_id is None else f'0x{new_id:02X}'}"
        if dst is None:
            check(f"{label} round-trip", False, "not found in post-restore capture")
            continue
        problems, notes = compare_activity_backup(
            src, dst,
            device_id_map=combined_map,
            expected_name=name,
            hub_version=HUB_VERSION,
        )
        all_problems[label] = problems
        all_notes[label] = notes
        check(f"{label} round-trip", not problems, f"{len(problems)} problem(s)")
        for item in problems:
            print("    -", item)

    for label, notes in all_notes.items():
        for note in notes:
            print(f"  note [{label}]: {note}")
    artifacts["compare_problems"] = all_problems
    artifacts["compare_notes"] = all_notes
finally:
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"br-replace-{TAG}", artifacts)
    print("artifacts saved:", path)
    try:
        proxy.stop()
    except Exception:
        pass
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
