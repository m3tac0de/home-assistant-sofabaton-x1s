"""Sequencer-validation: backup+restore smoke (device round-trip + delete).

Live-sourced variant of bench_61: backs up a sacrificial device with
blobs, restores it as "Bench Copy", re-reads the copy, compares the
round-trip via bench_compare, deletes the copy, and verifies the device
catalog is back at baseline. Exercises run_create_sequence per-attempt
exchange scopes, blob persist (play/persist writes), key-sort/inputs
fetch exchanges, and the delete_confirm exchange on the new sequencer.

Usage: bench_121_seq_devrt.py <ip> <X1|X1S> <tag> <source_dev_id>
"""

from __future__ import annotations

import copy
import sys
import time

from bench_common import connect, save_json, setup_logging
from bench_compare import compare_device_backup

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SOURCE_DEV = int(sys.argv[4], 0)

COPY_NAME = "Bench Copy"

log_path = setup_logging(f"seq-devrt-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def snapshot_devices(proxy) -> set[int]:
    proxy.request_devices()
    deadline = time.time() + 20
    while time.time() < deadline:
        devs, ready = proxy.get_devices()
        if ready:
            return {int(d) for d in (devs or {})}
        time.sleep(0.5)
    return {int(d) for d in (proxy.get_devices()[0] or {})}


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "source_device": SOURCE_DEV}
new_id = None
try:
    devs0 = snapshot_devices(proxy)
    check("GATE: source device present", SOURCE_DEV in devs0, f"catalog={sorted(devs0)}")
    if SOURCE_DEV not in devs0:
        raise SystemExit("source device missing")

    print(f"backing up 0x{SOURCE_DEV:02X} (include_blobs=True)...")
    source = proxy.backup_device(SOURCE_DEV, include_blobs=True)
    ok = isinstance(source, dict) and source.get("complete")
    check("GATE: source backup complete", ok, f"complete={source.get('complete') if isinstance(source, dict) else source!r}")
    if not ok:
        raise SystemExit("source backup incomplete; refusing to continue")
    artifacts["source_backup"] = source

    payload = copy.deepcopy(source)
    payload["device"]["name"] = COPY_NAME

    print(f"restoring copy as {COPY_NAME!r}...")
    t0 = time.time()
    result = proxy.restore_device(payload)
    elapsed = time.time() - t0
    artifacts["restore_result"] = result
    check(
        "restore_device success",
        bool(result) and result.get("status") == "success",
        f"{elapsed:.1f}s result={ {k: v for k, v in (result or {}).items() if k != 'command_id_map'} }",
    )
    if not result or result.get("status") != "success":
        raise SystemExit("restore failed; stopping before delete")

    new_id = int(result["device_id"])
    check("assigned id is fresh", new_id not in devs0, f"new_id=0x{new_id:02X}")

    print(f"re-reading the copy 0x{new_id:02X}...")
    reread = proxy.backup_device(new_id, include_blobs=True)
    artifacts["reread_backup"] = reread
    check("copy re-read complete", isinstance(reread, dict) and bool(reread.get("complete")))

    cmd_map = {int(k): int(v) for k, v in (result.get("command_id_map") or {}).items()}
    problems, notes = compare_device_backup(
        source,
        reread,
        command_id_map=cmd_map,
        expected_name=COPY_NAME,
        hub_version=HUB_VERSION,
    )
    artifacts["problems"], artifacts["notes"] = problems, notes
    for note in notes:
        print(f"  note: {note}")
    check("round-trip equality (bench_compare)", not problems, "; ".join(problems[:5]))
finally:
    if new_id is not None:
        print(f"cleanup: delete_device(0x{new_id:02X})")
        try:
            deadline = time.time() + 30
            devs_after = None
            while time.time() < deadline:
                proxy.delete_device(new_id)
                time.sleep(2.0)
                devs_after = snapshot_devices(proxy)
                if new_id not in devs_after:
                    break
            check("cleanup: catalog back to baseline", devs_after == devs0,
                  f"before={sorted(devs0)} after={sorted(devs_after or set())}")
        except Exception as exc:  # noqa: BLE001
            check("cleanup delete_device", False, f"{exc}")
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path = save_json(f"seq-devrt-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
