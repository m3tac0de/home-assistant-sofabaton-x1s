"""Erase a hub directly through the harness (opcode 0x001D) for the
empty-hub validation program (bench_170).

HA has no standalone erase endpoint (erase only runs inside a replace-mode
restore), so this script talks to the hub directly. The HA config entry
for the hub MUST be disabled first (single-writer rule):

    python ha_entry.py disable "X1 ("
    python bench_171_erase_direct.py 192.168.2.108 X1 x1
    python ha_entry.py enable "X1 ("

Refuses to run unless a pre-erase bundle exists at out/<tag>-pre.json
(captured through HA by ``bench_170 backup``) and reports full counts.

Usage:
    python bench_171_erase_direct.py <ip> <X1|X1S> <tag>
"""

from __future__ import annotations

import json
import sys
import time

from bench_common import BENCH_DIR, connect, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

setup_logging(f"erase-direct-{TAG}")

pre = BENCH_DIR / f"{TAG}-pre.json"
if not pre.exists():
    raise SystemExit(f"refusing to erase: no pre-erase bundle at {pre}")
bundle = json.loads(pre.read_text(encoding="utf-8"))
n_dev = len(bundle.get("devices") or [])
n_act = len(bundle.get("activities") or [])
if bundle.get("kind") != "hub_bundle" or bundle.get("payload_profile") != "full_backup":
    raise SystemExit(f"refusing to erase: bundle kind={bundle.get('kind')} profile={bundle.get('payload_profile')}")
incomplete = [e for e in (bundle.get("devices") or []) + (bundle.get("activities") or []) if not e.get("complete")]
if incomplete:
    raise SystemExit(f"refusing to erase: {len(incomplete)} incomplete entities in the pre-erase bundle")
print(f"pre-erase bundle ok: devices={n_dev} activities={n_act}")


def snapshot_catalog(proxy, timeout: float = 60.0):
    proxy.request_devices()
    proxy.request_activities()
    deadline = time.time() + timeout
    while time.time() < deadline:
        devs, devs_ready = proxy.get_devices()
        acts, acts_ready = proxy.get_activities(force_refresh=False)
        if devs_ready and acts_ready:
            return devs, acts
        time.sleep(0.5)
    raise RuntimeError("catalog not ready")


def ensure_connected(proxy):
    if proxy.can_issue_commands():
        return proxy
    print("session dropped after erase; reconnecting...")
    try:
        proxy.stop()
    except Exception:
        pass
    for _ in range(10):
        try:
            return connect(HOST, HUB_VERSION, timeout=30)
        except Exception as exc:  # noqa: BLE001
            print("  reconnect failed:", exc)
            time.sleep(3)
    raise RuntimeError("could not reconnect after erase")


proxy = connect(HOST, HUB_VERSION)
devs, acts = snapshot_catalog(proxy)
print(f"live catalog before erase: devices={len(devs)} activities={len(acts)}")
if len(devs) != n_dev or len(acts) != n_act:
    proxy.stop()
    raise SystemExit("live catalog does not match the pre-erase bundle; aborting")

print("sending erase_configuration (0x001D, timeout=180s)...")
t0 = time.time()
erased = proxy.erase_configuration(timeout=180.0, settle_seconds=3.0)
print(f"erase acked={erased} in {time.time() - t0:.1f}s")
if not erased:
    proxy.stop()
    raise SystemExit("erase not acknowledged; hub state unknown")

proxy = ensure_connected(proxy)
# Fresh read from the hub: request both catalogs and wait for the
# committed (0x07 -> expected=0) empty snapshots.
proxy.request_devices()
proxy.request_activities()
deadline = time.time() + 60
while time.time() < deadline:
    devs_e, dr = proxy.get_devices()
    acts_e, ar = proxy.get_activities(force_refresh=False)
    if dr and ar and proxy.devices_commit_serial >= 1 and proxy.activities_commit_serial >= 1:
        break
    time.sleep(0.5)
else:
    proxy.stop()
    raise SystemExit("post-erase catalog read did not commit")
print(
    f"post-erase catalog: devices={len(devs_e)} activities={len(acts_e)} "
    f"commit serials dev={proxy.devices_commit_serial} act={proxy.activities_commit_serial} "
    f"last_committed dev={proxy.last_devices_burst_committed} act={proxy.last_activities_burst_committed}"
)
proxy.stop()
if devs_e or acts_e:
    raise SystemExit("hub not empty after erase")
print("hub is empty")
