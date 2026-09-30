"""Code review R5 bench programs: read-only recon of a hub before BP1-BP3.

Prints the hub name (banner), every device with its class and command
count, every activity, and saves the lists to out/. Writes nothing.

Usage:
    python bench_280_recon.py <ip> <X1|X1S>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]

log_path = setup_logging(f"recon-{HUB_VERSION}")
print(f"logging to {log_path}")
proxy = connect(HOST, HUB_VERSION)
try:
    banner = proxy.fetch_banner_info(force_refresh=True)
    print(f"banner: {banner}")
    proxy.request_devices()
    proxy.request_activities()
    deadline = time.time() + 15
    devices, activities = {}, {}
    while time.time() < deadline:
        devices, dev_ready = proxy.get_devices(force_refresh=False)
        activities, act_ready = proxy.get_activities(force_refresh=False)
        if dev_ready and act_ready:
            break
        time.sleep(0.3)
    print(f"devices ({len(devices)}):")
    for dev_id, row in sorted(devices.items()):
        print(f"  0x{dev_id:02X} {row.get('device_class')!s:12} {row.get('name')!r} brand={row.get('brand')!r}")
    print(f"activities ({len(activities)}):")
    for act_id, row in sorted(activities.items()):
        print(f"  0x{act_id:02X} {row.get('name')!r}")
    save_json(f"recon-{HUB_VERSION}", {"banner": banner, "devices": devices, "activities": activities})
finally:
    proxy.stop()
