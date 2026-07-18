"""Wifi Commands program chunk 1: recon + baseline + listener port.

Read-only. Plan: docs/internal/wifi-commands-bench-plan.md.

Per hub: captures a fresh ``backup_hub_bundle(include_blobs=True)``
(disaster-recovery snapshot, copied outside ``out/``), inventories
wifi-class devices, and checks every device carrying the managed Wifi
Commands brand tag (``m3-<device_key>-<hash>`` / legacy ``m3tac0de-...``)
against the known-device allowlist — the bench hubs legitimately host
the user's production deploys and the previous program's sacrificial
devices, so only an UNKNOWN managed key fails. Also verifies
the protected activities 0x65–0x67 and "Bench Test" 0x68 are present,
and records the bench listener port for the program.

Usage:
    python bench_80_wifi_recon.py <ip> <X1|X1S> <tag>
"""

from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward, pick_port

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

PROTECTED_ACTIVITIES = [0x65, 0x66, 0x67]
BENCH_TEST_ACTIVITY = 0x68
RECOVERY_DIR = Path.home() / "x1s-bench-recovery"
MANAGED_BRAND_PREFIXES = ("m3-", "m3tac0de-")  # COMMAND_BRAND_PREFIX + legacy
# Managed-brand devices that legitimately live on the bench hubs (chunk-1
# finding): the user's production deploys (Lights/Apps/Curtains) plus the
# previous program's sacrificial devices. Benches must NEVER touch these;
# cleanup matches on the exact bench device key, not the brand prefix.
KNOWN_MANAGED_DEVICE_KEYS = {
    "5ce6ffd1",  # X1 0x09 "test"
    "cc51bd69",  # X1S 0x0A "test device"
    "ade605c4",  # X1S 0x0B "Lights"
    "1afc1d7c",  # X1S 0x0C "Apps"
    "cf673221",  # X1S 0x0D "Curtains"
}

log_path = setup_logging(f"wifi-c1-recon-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION}
try:
    print("connected; capturing full hub bundle (include_blobs=True)...")
    t0 = time.time()

    def _progress(**payload):
        msg = payload.get("message")
        if msg:
            print(f"  [{payload.get('completed_steps')}/{payload.get('total_steps')}] {msg}")

    bundle = proxy.backup_hub_bundle(include_blobs=True, progress=_progress)
    print(f"bundle captured in {time.time() - t0:.1f}s")
    check("bundle complete", bool(bundle.get("complete")), f"kind={bundle.get('kind')}")

    bundle_path = save_json(f"wifi-c1-bundle-{TAG}", bundle)
    print("bundle saved:", bundle_path)
    RECOVERY_DIR.mkdir(parents=True, exist_ok=True)
    recovery_path = RECOVERY_DIR / f"wifi-c1-bundle-{TAG}-{time.strftime('%Y%m%d-%H%M%S')}.json"
    shutil.copy2(bundle_path, recovery_path)
    print("recovery copy:", recovery_path)
    artifacts["recovery_copy"] = str(recovery_path)

    # ------------------------------------------------------------------
    # inventory: all devices, flag wifi-class, hunt managed brand tags
    # ------------------------------------------------------------------
    inventory: list[dict] = []
    wifi_devices: list[dict] = []
    managed_leftovers: list[dict] = []
    print("devices in bundle:")
    for dev in bundle.get("devices") or []:
        block = dev.get("device") or {}
        dev_id = int(block.get("device_id") or 0)
        brand = str(block.get("brand") or "")
        device_class = str(block.get("device_class") or "")
        row = {
            "device_id": dev_id,
            "name": block.get("name"),
            "brand": brand,
            "device_class": device_class,
            "device_class_code": block.get("device_class_code"),
            "n_commands": len(dev.get("commands") or []),
            "complete": dev.get("complete"),
        }
        inventory.append(row)
        is_wifi = device_class.startswith("wifi")
        is_managed = brand.lower().startswith(MANAGED_BRAND_PREFIXES)
        if is_wifi:
            wifi_devices.append(row)
        if is_managed:
            managed_leftovers.append(row)
        print(
            f"  0x{dev_id:02X} ({dev_id}): {block.get('name')!r} "
            f"brand={brand!r} class={device_class!r}"
            + (" [WIFI]" if is_wifi else "")
            + (" [MANAGED]" if is_managed else "")
        )
    artifacts["inventory"] = inventory
    artifacts["wifi_devices"] = wifi_devices
    artifacts["managed_devices"] = managed_leftovers
    print(f"wifi-class devices: {len(wifi_devices)}")
    def _brand_key(brand: str) -> str:
        parts = brand.split("-", 2)
        return parts[1] if len(parts) > 1 else ""

    unknown_managed = [
        r for r in managed_leftovers
        if _brand_key(r["brand"]) not in KNOWN_MANAGED_DEVICE_KEYS
    ]
    artifacts["unknown_managed"] = unknown_managed
    for row in managed_leftovers:
        known = row not in unknown_managed
        print(
            f"  managed: 0x{row['device_id']:02X} {row['name']!r} {row['brand']!r}"
            + (" (known, protected)" if known else " (UNKNOWN)")
        )
    check(
        "no unknown managed Wifi Commands artifacts on hub",
        not unknown_managed,
        ", ".join(f"0x{r['device_id']:02X} {r['brand']!r}" for r in unknown_managed)
        or f"{len(managed_leftovers)} known managed device(s), all protected",
    )

    activities = {
        int((a.get("device") or {}).get("device_id") or 0): (a.get("device") or {}).get("name")
        for a in bundle.get("activities") or []
    }
    artifacts["activities"] = {f"0x{k:02X}": v for k, v in activities.items()}
    print("activities in bundle:", artifacts["activities"])
    for act in PROTECTED_ACTIVITIES:
        check(f"protected activity 0x{act:02X} present", act in activities,
              repr(activities.get(act)))
    check(
        "Bench Test (0x68) present",
        BENCH_TEST_ACTIVITY in activities,
        repr(activities.get(BENCH_TEST_ACTIVITY)),
    )

    # ------------------------------------------------------------------
    # bench listener port: confirm bindable on the interface toward the hub
    # ------------------------------------------------------------------
    bench_ip = local_ip_toward(HOST)
    port = pick_port()
    with BenchWifiListener(port):
        pass  # bind/serve/teardown smoke on the recorded port
    artifacts["bench_ip"] = bench_ip
    artifacts["listener_port"] = port
    check("bench listener port", port == 8060, f"{bench_ip}:{port}")
finally:
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"wifi-c1-recon-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
