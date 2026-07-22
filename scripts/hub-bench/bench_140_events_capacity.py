"""Wifi Events W0 gate: hub-side capacity + id-law probe (W0.4 + W0.3@50).

Plan: docs/internal/wifi-events-plan.md (§4 gate W0, §11 findings).

Deploys a sacrificial events-profile wifi device — N short + N long
records (default N=50 → 100 records), NO power ids, NO inputs, no
activity references — and probes the four W0.4 questions:

1. Does the hub ACK all 2N family-0x0E record writes? (On X1 this
   extends the key-id space past the vendor's 20-record scheme:
   keys 0x18..0x18+2N-1, codes 0x4E21..+. The lib's 20-entry
   ``_ROKU_APP_SLOTS`` table is monkey-patched to a generated 2N-entry
   table — a probe-only extension, promoted to the lib iff this passes.)
2. Does the command table re-expose exactly ids 1..2N in write order
   (the X1 1..N re-exposure law past 20; X1S writes ids directly)?
3. Do callbacks deliver for high ids? Fires the boundary ids
   1, 20, 21 (past the old scheme), N (last short), N+1 (first long,
   path ``…/0/long``), 2N (last long) and asserts exact paths.
4. Remote rendering of a 2N-command device: resync_remote at the end —
   EYEBALL THE REMOTE's device command list manually and record the
   verdict in the plan doc (script can't see the remote's screen).

If the create fails partway, the failing define-command step index in
the log IS the ceiling datum; the orphan device is found by catalog
diff and deleted. Re-run with a smaller N to bisect:

Usage:
    python bench_140_events_capacity.py <ip> <X1|X1S> <tag> [slots] [skipbundle]
"""

from __future__ import annotations

import json
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward

import x1slib.proxy_wifi_device as pwd

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SLOTS = int(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4].isdigit() else 50
SKIP_BUNDLE = "skipbundle" in sys.argv[4:]
# "pause<N>": sleep N seconds after resync_remote (before cleanup) so a
# human can eyeball the remote's rendering of the 2N-command device.
PAUSE_SECS = next((int(a[5:]) for a in sys.argv[4:] if a.startswith("pause") and a[5:].isdigit()), 0)

LISTENER_PORT = 8060
DEVICE_NAME = "Bench Events Cap"
BRAND_NAME = "m3-benchwifi-capacity0000001"
TOTAL_RECORDS = SLOTS * 2

RECOVERY_DIR = Path.home() / "x1s-bench-recovery"

log_path = setup_logging(f"evcap-{TAG}")
print(f"logging to {log_path}")
print(f"probing {SLOTS} short + {SLOTS} long = {TOTAL_RECORDS} records")

# ── probe-only extension of the 20-entry slot table (see module doc) ──
pwd._ROKU_APP_SLOTS = [(0x18 + i, 0x4E21 + i) for i in range(max(TOTAL_RECORDS, 20))]

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def build_command_defs() -> list[dict]:
    defs: list[dict] = []
    for idx in range(SLOTS):
        name = f"Ev {idx + 1:02d}"
        defs.append({"display_name": name, "trigger_name": name, "press_type": "short", "command_index": idx})
    for idx in range(SLOTS):
        name = f"Ev {idx + 1:02d}"
        defs.append({"display_name": f"{name} Long", "trigger_name": name, "press_type": "long", "command_index": idx})
    return defs


def fresh_commands(proxy, dev: int, timeout: float = 20.0, expect_nonempty: bool = True) -> dict[int, dict]:
    """Force a fresh command-list read; returns {command_id: entry}."""
    for _ in range(4):
        proxy.state.commands.pop(dev, None)
        proxy._commands_complete.discard(dev)
        proxy.get_commands_for_entity(dev, fetch_if_missing=True)
        deadline = time.time() + timeout
        while time.time() < deadline and dev not in proxy._commands_complete:
            time.sleep(0.3)
        cmds, _ready = proxy.get_commands_for_entity(dev, fetch_if_missing=False)
        cmds = dict(cmds or {})
        if cmds or not expect_nonempty:
            return cmds
        time.sleep(1.0)
    return {}


bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {
    "host": HOST,
    "hub_version": HUB_VERSION,
    "bench_ip": bench_ip,
    "slots": SLOTS,
    "total_records": TOTAL_RECORDS,
}
dev = None
devs_before: set[int] = set()
try:
    # ---------------- recovery bundle
    if SKIP_BUNDLE:
        print("recovery bundle SKIPPED")
    else:
        print("taking full recovery bundle (include_blobs=True)...")
        bundle = proxy.backup_hub_bundle(include_blobs=True)
        ok = isinstance(bundle, dict) and bundle.get("kind") == "hub_bundle"
        check("GATE: recovery bundle captured", ok)
        if not ok:
            raise SystemExit("recovery bundle failed; refusing to mutate")
        bpath = save_json(f"evcap-bundle-{TAG}", bundle)
        RECOVERY_DIR.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(bpath, RECOVERY_DIR / f"evcap-bundle-{TAG}-{stamp}.json")
        print(f"bundle saved: {bpath}")

    # ---------------- baseline catalog
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    devs_before = {int(d) for d in proxy.state.entities("device")}
    print(f"baseline: {len(devs_before)} devices")
    action_id = proxy._stable_hub_action_id()

    # ---------------- create: N short + N long, no power, no inputs
    print(f"create_wifi_device ({SLOTS} short + {SLOTS} long, no power, no inputs)...")
    t0 = time.time()
    result = proxy.create_wifi_device(
        device_name=DEVICE_NAME,
        commands=build_command_defs(),
        request_port=LISTENER_PORT,
        brand_name=BRAND_NAME,
        power_on_command_id=None,
        power_off_command_id=None,
        input_command_ids=None,
    )
    create_secs = round(time.time() - t0, 1)
    artifacts["create_secs"] = create_secs
    created_ok = bool(result) and result.get("status") == "success"
    check(f"GATE: create ACKed all {TOTAL_RECORDS} records", created_ok, f"{result} in {create_secs}s")
    if not created_ok:
        # find the orphan by catalog diff so cleanup can still run
        proxy._refresh_catalog("devices", timeout=15.0)
        time.sleep(0.6)
        orphans = {int(d) for d in proxy.state.entities("device")} - devs_before
        artifacts["create_failed_orphans"] = sorted(orphans)
        if orphans:
            dev = orphans.pop()
            print(f"create failed; orphan device 0x{dev:02X} will be cleaned up")
        raise SystemExit("create failed — the failing define-command index in the log is the ceiling datum")
    dev = int(result["device_id"])
    print(f"bench device: 0x{dev:02X}")

    # ---------------- id-law: table re-exposes exactly 1..2N
    cmds = fresh_commands(proxy, dev)
    ids = set(cmds)
    artifacts["deployed_command_ids"] = sorted(ids)
    check(f"GATE: command table is exactly 1..{TOTAL_RECORDS}", ids == set(range(1, TOTAL_RECORDS + 1)),
          f"count={len(ids)} min={min(ids) if ids else None} max={max(ids) if ids else None}")

    # label spot checks (short law + long law at the boundaries)
    def label_of(cid: int) -> str:
        entry = cmds.get(cid)
        if isinstance(entry, dict):
            return str(entry.get("name") or entry.get("label") or "")
        return str(entry or "")

    expect = {
        1: "Ev 01",
        20: f"Ev 20" if SLOTS >= 20 else None,
        21: ("Ev 21" if SLOTS >= 21 else (f"Ev {21 - SLOTS:02d} Long" if SLOTS < 21 else None)),
        SLOTS: f"Ev {SLOTS:02d}",
        SLOTS + 1: "Ev 01 Long",
        TOTAL_RECORDS: f"Ev {SLOTS:02d} Long",
    }
    artifacts["label_spot_checks"] = {}
    for cid, want in expect.items():
        if want is None or cid < 1 or cid > TOTAL_RECORDS:
            continue
        got = label_of(cid)
        artifacts["label_spot_checks"][cid] = got
        check(f"label law id {cid} == {want!r}", got == want, f"got={got!r}")

    # ---------------- callback delivery at the boundaries
    def expected_path(cid: int) -> str:
        if cid <= SLOTS:
            return f"/launch/{action_id}/{dev}/{cid - 1}/short"
        return f"/launch/{action_id}/{dev}/{cid - SLOTS - 1}/long"

    fire_ids = sorted({1, min(20, TOTAL_RECORDS), min(21, TOTAL_RECORDS), SLOTS, SLOTS + 1, TOTAL_RECORDS})
    artifacts["fires"] = {}
    for cid in fire_ids:
        listener.clear()
        print(f"fire cmd {cid} (expect {expected_path(cid)}) — 10s window")
        proxy.send_command(dev, cid)
        time.sleep(10.0)
        paths = [h["path"] for h in listener.snapshot()]
        artifacts["fires"][cid] = paths
        check(f"callback id {cid}", paths == [expected_path(cid)], f"got={paths}")

    # ---------------- structural snapshot + remote render
    bundle_dev = proxy.backup_hub_bundle(device_ids=[dev], include_blobs=False)
    artifacts["device_structural"] = bundle_dev
    print("\nresync_remote — EYEBALL the remote's device command list now")
    proxy.resync_remote(HUB_VERSION)
    print(f"MANUAL CHECK: does the remote render '{DEVICE_NAME}' with {TOTAL_RECORDS} commands sanely?")
    if PAUSE_SECS:
        print(f"pausing {PAUSE_SECS}s for the manual remote check before cleanup...")
        for remaining in range(PAUSE_SECS, 0, -15):
            print(f"  cleanup in {remaining}s...", flush=True)
            time.sleep(min(15, remaining))
finally:
    # ---------------- cleanup: delete the bench device, verify baseline
    if dev is not None:
        print(f"\ncleanup: delete_device(0x{dev:02X})")
        try:
            devs_after = None
            deadline = time.time() + 30
            while time.time() < deadline:
                proxy.delete_device(dev)
                time.sleep(2.0)
                proxy._refresh_catalog("devices", timeout=15.0)
                time.sleep(0.4)
                devs_after = {int(d) for d in proxy.state.entities("device")}
                if dev not in devs_after:
                    break
            check("GATE: cleanup — device catalog back to baseline", devs_after == devs_before,
                  f"before={sorted(devs_before)} after={sorted(devs_after or set())}")
        except Exception as exc:  # noqa: BLE001
            check("cleanup delete_device", False, f"{exc}")
    listener.stop()
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path = save_json(f"evcap-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
