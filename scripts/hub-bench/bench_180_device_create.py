"""Live-hub validation of the Hub tab "Add device" create path (AD5).

Drives ``X1Proxy.create_device`` directly through the harness for every
class the hub line supports, then checks what the hub actually stored:

  * the catalog row exists with the requested name and class bytes
    (code_type / device_type / icon / input_mode / power_style /
    share_mode / channel as documented in docs/internal/add-device-plan.md
    section 2a);
  * the record round-trips through ``backup_device`` with zero commands;
  * family-0x11 device reorder accepts the new id (catalog refresh after
    create landed);
  * ``delete_device`` removes it again (unless ``--keep``).

The HA config entry for the hub MUST be disabled first (single-writer
rule), and re-enabled afterwards:

    python ha_entry.py disable "X1S ("
    python bench_180_device_create.py 192.168.2.109 X1S x1s
    python ha_entry.py enable "X1S ("

Usage:
    python bench_180_device_create.py <ip> <X1|X1S|X2> <tag> [--keep] [--classes ir,wifi_hue]

Results land in out/<tag>-device-create.json; every check prints OK/FAIL
and the exit code is 1 when anything failed.
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

from x1slib.device_class_profiles import (  # noqa: E402
    DEFAULT_ICON,
    IR_DEVICE_TYPE_TV,
    WIFI_DEVICE_TYPE,
    supported_create_classes,
)
from x1slib.protocol_const import DEVICE_CLASS_BY_CODE  # noqa: E402

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
KEEP = "--keep" in sys.argv
ONLY: list[str] = []
if "--classes" in sys.argv:
    ONLY = [c.strip() for c in sys.argv[sys.argv.index("--classes") + 1].split(",") if c.strip()]

setup_logging(f"device-create-{TAG}")

EXPECTED = {
    "ir": dict(code_type=0x0D, device_type=IR_DEVICE_TYPE_TV, input_mode=0, power_style=1, share_mode=2),
    "wifi_roku": dict(code_type=0x0A, device_type=WIFI_DEVICE_TYPE, input_mode=2, power_style=2, share_mode=0),
    "wifi_hue": dict(code_type=0x1A, device_type=WIFI_DEVICE_TYPE, input_mode=2, power_style=0, share_mode=0),
    "wifi_sonos": dict(code_type=0x1B, device_type=WIFI_DEVICE_TYPE, input_mode=2, power_style=0, share_mode=0),
    "wifi_ip": dict(code_type=0x1C, device_type=WIFI_DEVICE_TYPE, input_mode=2, power_style=0, share_mode=0),
    "wifi_mqtt": dict(code_type=0x20, device_type=WIFI_DEVICE_TYPE, input_mode=2, power_style=0, share_mode=0),
}

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""))


def wait_devices(proxy, timeout: float = 30.0) -> dict:
    proxy.request_devices()
    deadline = time.time() + timeout
    while time.time() < deadline:
        devices, ready = proxy.get_devices()
        if ready:
            return devices
        time.sleep(0.3)
    raise RuntimeError("device catalog not ready")


def main() -> int:
    proxy = connect(HOST, HUB_VERSION)
    results: dict[str, dict] = {}
    try:
        before = wait_devices(proxy)
        print(f"hub {HOST} ({HUB_VERSION}): {len(before)} devices before")
        classes = [c for c in supported_create_classes(HUB_VERSION) if not ONLY or c in ONLY]
        check("class table non-empty for hub line", bool(classes), ",".join(classes))

        for device_class in classes:
            name = f"Bench {device_class}"[:30]
            print(f"\n== {device_class} ==")
            created = proxy.create_device(name, device_class=device_class)
            check(f"{device_class}: create_device returned success", bool(created and created.get("status") == "success"), str(created))
            if not created or created.get("status") != "success":
                continue
            dev_id = int(created["device_id"])
            results[device_class] = {"device_id": dev_id}

            devices = wait_devices(proxy)
            row = devices.get(dev_id) or devices.get(dev_id & 0xFF)
            check(f"{device_class}: catalog row present for dev=0x{dev_id:02X}", row is not None, str(row)[:160])
            if row is not None:
                check(f"{device_class}: catalog name", str(row.get("name") or "") == name, str(row.get("name")))
                cls = row.get("device_class") or DEVICE_CLASS_BY_CODE.get(int(row.get("device_class_code") or -1))
                check(f"{device_class}: catalog class", cls == device_class, str(cls))

            backup = proxy.backup_device(dev_id)
            block = (backup or {}).get("device") or {}
            results[device_class]["device_block"] = block
            check(f"{device_class}: backup_device returned a block", bool(block), str(backup)[:120])
            if block:
                exp = EXPECTED[device_class]
                for key, want in exp.items():
                    got = block.get(key)
                    check(f"{device_class}: {key}", got == want, f"got={got} want={want}")
                check(f"{device_class}: icon", block.get("icon") == DEFAULT_ICON, str(block.get("icon")))
                check(f"{device_class}: channel 0 at create", int(block.get("channel") or 0) == 0, str(block.get("channel")))
                check(f"{device_class}: no head IP at create", not block.get("ip_address"), str(block.get("ip_address")))
                check(f"{device_class}: zero commands", not (backup or {}).get("commands"), str(len((backup or {}).get("commands") or [])))

            # The catalog refresh in create_device must have landed for the
            # family-0x11 reorder to accept the id.
            ordered = sorted(int(k) & 0xFF for k in devices.keys())
            reorder = proxy.reorder_devices(ordered)
            check(f"{device_class}: family-0x11 reorder accepts the new id", bool(reorder and reorder.get("status") == "success"), str(reorder)[:120])

        if not KEEP:
            print("\n== cleanup ==")
            for device_class, info in results.items():
                deleted = proxy.delete_device(info["device_id"])
                check(f"{device_class}: delete_device", bool(deleted and deleted.get("status") == "success"), str(deleted)[:120])
            after = wait_devices(proxy)
            check("device count restored", len(after) == len(before), f"before={len(before)} after={len(after)}")
        else:
            print("\n--keep: created devices left on the hub for the card-side checks")
    finally:
        proxy.stop()

    failed = [c for c in checks if not c[1]]
    save_json(f"{TAG}-device-create", {"host": HOST, "hub_version": HUB_VERSION, "checks": checks, "results": results})
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
