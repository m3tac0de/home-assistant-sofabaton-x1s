"""BUG #4 probe, phase A: recon of role-page keymap slots (no writes).

Dumps, for every activity: the raw keymap rows (full 18-byte records,
including the (device, command 0) placeholder rows that the bundle export
drops) and the parsed button_details. Also dumps the FireTV device's
(dev 4) device-mode keymap + command labels so materialized command ids
can be interpreted.

Usage: python bench_103_roleslot_recon.py <ip> <X1|X1S|X2> <tag>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

log_path = setup_logging(f"roleslot-recon-{TAG}")
print(f"logging to {log_path}", flush=True)

KEYMAP_RECORD_SIZE = 18

proxy = connect(HOST, HUB_VERSION)

# Capture the raw row stream every time the keymap assembler completes,
# keyed by entity id — placeholder rows survive here even though the
# parsed export drops them.
raw_keymaps: dict[int, str] = {}
_orig_replace = proxy.state.replace_keymap_rows


def _capture(act_lo: int, row_stream: bytes) -> None:
    raw_keymaps[act_lo] = row_stream.hex()
    _orig_replace(act_lo, row_stream)


proxy.state.replace_keymap_rows = _capture

try:
    print("connected; requesting catalogs...", flush=True)
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

    print("devices:", flush=True)
    for did, value in sorted((devs or {}).items()):
        print(f"  0x{int(did):02X} ({int(did)}): {_label(value)!r}")
    print("activities:", flush=True)
    for aid, value in sorted((acts or {}).items()):
        print(f"  0x{int(aid):02X} ({int(aid)}): {_label(value)!r}")

    # Device-mode keymap + command labels for the BT devices (FireTV=4, PS5=5)
    # and Xbox (7, ir) — the role-target devices from BUG #4.
    device_dumps: dict[str, dict] = {}
    for dev in (4, 5, 7):
        labels, _ = proxy.get_commands_for_entity(dev, fetch_if_missing=True)
        t0 = time.time()
        while time.time() - t0 < 10 and dev not in proxy._commands_complete:
            time.sleep(0.3)
        labels, _ = proxy.get_commands_for_entity(dev, fetch_if_missing=False)
        proxy.get_buttons_for_entity(dev, fetch_if_missing=True)
        t0 = time.time()
        while time.time() - t0 < 10 and dev not in proxy.state.buttons:
            time.sleep(0.3)
        details = proxy.state.button_details.get(dev, {})
        device_dumps[str(dev)] = {
            "labels": {str(k): v for k, v in dict(labels).items()},
            "button_details": {str(k): v for k, v in details.items()},
            "raw_keymap": raw_keymaps.get(dev),
        }
        print(f"dev 0x{dev:02X}: {len(dict(labels))} commands, "
              f"{len(details)} device-mode button rows", flush=True)

    # Per-activity: raw keymap rows + parsed details (placeholders included).
    activity_dumps: dict[str, dict] = {}
    for aid in sorted((acts or {}).keys()):
        act_lo = int(aid) & 0xFF
        payload = proxy.backup_activity(act_lo)
        details = proxy.state.button_details.get(act_lo, {})
        placeholders = {
            k: v for k, v in details.items()
            if int(v.get("device_id", 0)) and not int(v.get("command_id", 0))
        }
        activity_dumps[str(act_lo)] = {
            "name": _label((acts or {}).get(aid)),
            "backup": payload,
            "button_details": {str(k): v for k, v in details.items()},
            "raw_keymap": raw_keymaps.get(act_lo),
        }
        print(
            f"act 0x{act_lo:02X} {_label((acts or {}).get(aid))!r}: "
            f"{len(details)} keymap rows, placeholders={ {hex(k): v for k, v in placeholders.items()} }",
            flush=True,
        )

    path = save_json(
        f"roleslot-recon-{TAG}",
        {
            "devices": devs,
            "activities": acts,
            "device_dumps": device_dumps,
            "activity_dumps": activity_dumps,
        },
    )
    print("saved:", path, flush=True)
finally:
    proxy.stop()
    print("disconnected", flush=True)
