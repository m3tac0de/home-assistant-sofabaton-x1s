"""Activity program chunk 1: recon + baseline (no writes).

Connect, list devices/activities, capture ``backup_activity`` of every
activity on the hub, and dump the raw macro records and favorite slots
behind each baseline. Plan: docs/internal/activity-sync-bench-plan.md.
"""

from __future__ import annotations

import dataclasses
import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]  # file tag, e.g. "x1"

log_path = setup_logging(f"act-recon-{TAG}")
print(f"logging to {log_path}")


def _jsonable(value):
    if dataclasses.is_dataclass(value):
        return {f.name: _jsonable(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    return value


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
    macro_dumps = {}
    favorite_dumps = {}
    for aid in sorted((acts or {}).keys()):
        act_lo = int(aid) & 0xFF
        payload = proxy.backup_activity(act_lo)
        baselines[str(act_lo)] = payload
        complete = payload.get("complete") if isinstance(payload, dict) else None
        n_btn = len((payload or {}).get("button_bindings") or [])
        n_mac = len((payload or {}).get("macros") or [])
        n_fav = len((payload or {}).get("favorite_slots") or [])
        print(
            f"  act 0x{act_lo:02X}: complete={complete} "
            f"buttons={n_btn} macros={n_mac} favorites={n_fav} "
            f"keys={sorted((payload or {}).keys())}"
        )

        records = proxy.get_cached_macro_records(act_lo)
        macro_dumps[str(act_lo)] = [_jsonable(record) for record in records]
        for record in records:
            print(
                f"    macro key_id=0x{record.key_id & 0xFF:02X} label={record.label!r} "
                f"steps={len(record.key_sequence)} raw_label_slot={record.raw_label_slot.hex()}"
            )
            for entry in record.key_sequence:
                print(
                    f"      dev=0x{entry.device_id:02X} key=0x{entry.key_id:02X} "
                    f"fid={entry.fid} dur={entry.duration} delay={entry.delay}"
                )

        slots = proxy.state.get_activity_favorite_slots(act_lo)
        favorite_dumps[str(act_lo)] = _jsonable(slots)
        for slot in slots:
            print(f"    favorite slot: {slot}")

    path = save_json(
        f"act-baseline-{TAG}",
        {
            "banner": banner,
            "devices": devs,
            "activities": acts,
            "activity_payloads": baselines,
            "macro_records": macro_dumps,
            "favorite_slots": favorite_dumps,
        },
    )
    print("baseline saved:", path)
finally:
    proxy.stop()
    print("disconnected")
