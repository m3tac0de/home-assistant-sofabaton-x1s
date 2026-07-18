"""Chunk 1: connect to a hub, inventory devices/activities, capture a
blob-free structural baseline of every device (small payloads)."""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]  # file tag, e.g. "x1"

log_path = setup_logging(f"recon-{TAG}")
print(f"logging to {log_path}")

proxy = connect(HOST, HUB_VERSION)
try:
    print("connected; requesting catalogs...")
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
    def _label(value):
        return value.get("name") if isinstance(value, dict) else value

    print("devices:")
    for did, value in sorted((devs or {}).items()):
        print(f"  0x{int(did):02X} ({int(did)}): {_label(value)!r}")
    print("activities:")
    for aid, value in sorted((acts or {}).items()):
        print(f"  0x{int(aid):02X} ({int(aid)}): {_label(value)!r}")

    banner = proxy.get_banner_info()
    print("banner:", banner)

    baselines = {}
    for did in sorted((devs or {}).keys()):
        payload = proxy.backup_device(int(did), include_blobs=False)
        complete = payload.get("complete") if isinstance(payload, dict) else None
        baselines[str(int(did))] = payload
        n_cmds = len((payload or {}).get("commands") or [])
        n_bind = len((payload or {}).get("button_bindings") or [])
        n_mac = len((payload or {}).get("macros") or [])
        idle = ((payload or {}).get("device") or {}).get("idle_behavior")
        pm = ((payload or {}).get("device") or {}).get("power_mode")
        print(f"  dev 0x{int(did):02X}: complete={complete} cmds={n_cmds} bindings={n_bind} macros={n_mac} idle={idle} power_mode={pm}")

    path = save_json(f"baseline-{TAG}", {"banner": banner, "devices": devs, "activities": acts, "device_payloads": baselines})
    print("baseline saved:", path)
finally:
    proxy.stop()
    print("disconnected")
