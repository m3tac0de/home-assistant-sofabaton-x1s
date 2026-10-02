"""Code review CR-L2-1: Wifi command/device label encoding on X1S/X2.

The Wifi writers put labels on the wire as ``b"\\x00" + name.encode("utf-16le")``
(a one-byte shift), while every reader decodes the slot as UTF-16BE. The two
agree only for Latin-1 names. This bench creates a throwaway Wifi device with
Latin and non-Latin names, reads it back, and classifies each label:

- ``intended``: the read-back equals the name we meant (hub transcodes, or the
  slot really is shifted LE and our reader is the one that is wrong);
- ``verbatim-shifted``: the read-back equals the BE decode of the shifted-LE
  bytes we sent (hub stores the bytes as sent: CR-L2-1 is real);
- ``other``: neither.

``create_wifi_device`` ends with a remote sync, so the physical remote can be
checked by hand afterwards. Leave the device in place until then, then run the
cleanup mode.

Usage:
    python bench_270_label_encoding.py <ip> <X1S|X2> create
    python bench_270_label_encoding.py <ip> <X1S|X2> cleanup <device_id>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
MODE = sys.argv[3]

DEVICE_NAME = "Bench Энк"
BRAND_NAME = "m3-benchwifi-enc0000000000"
NAMES = ["Bench One", "Küche", "Лампа", "灯光"]


def shifted_le_readback(name: str, slot: int = 60) -> str:
    """What a UTF-16BE reader sees when the hub stores our shifted-LE bytes."""
    raw = (b"\x00" + name.encode("utf-16le"))[:slot].ljust(slot, b"\x00")
    return raw.decode("utf-16-be", errors="ignore").rstrip("\x00").strip()


def classify(got: str, want: str) -> str:
    if got == want:
        return "intended"
    if got == shifted_le_readback(want):
        return "verbatim-shifted"
    return "other"


log_path = setup_logging(f"label-encoding-{MODE}")
print(f"logging to {log_path}")
proxy = connect(HOST, HUB_VERSION)
try:
    if MODE == "create":
        proxy.request_devices()
        time.sleep(3)
        devs0, _ = proxy.get_devices()
        commands = [
            {"display_name": n, "trigger_name": n, "press_type": "short", "command_index": i}
            for i, n in enumerate(NAMES)
        ]
        result = proxy.create_wifi_device(
            device_name=DEVICE_NAME,
            commands=commands,
            request_port=8060,
            brand_name=BRAND_NAME,
        )
        print(f"create result: {result}")
        if not result or result.get("status") != "success":
            raise SystemExit("create failed")
        new_id = int(result["device_id"])
        print(f"new device id: 0x{new_id:02X} (was free: {new_id not in (devs0 or {})})")

        reread = proxy.backup_device(new_id, include_blobs=True) or {}
        block = reread.get("device") or {}
        rows = []
        got_dev = str(block.get("name") or "")
        rows.append(("device name", DEVICE_NAME, got_dev, classify(got_dev, DEVICE_NAME)))
        by_id = {int(c["command_id"]): c for c in reread.get("commands") or []}
        for i, name in enumerate(NAMES):
            got = str((by_id.get(i + 1) or {}).get("name") or "")
            rows.append((f"command {i + 1}", name, got, classify(got, name)))
        print("\nlabel read-back:")
        for label, want, got, verdict in rows:
            print(f"  {label:12} want={want!r:14} got={got!r:18} -> {verdict}"
                  f"  (shifted prediction {shifted_le_readback(want)!r})")
        save_json(f"label-encoding-{HUB_VERSION}", {
            "device_id": new_id,
            "create_result": result,
            "rows": [dict(zip(("label", "want", "got", "verdict"), r)) for r in rows],
            "reread": reread,
        })
        print(f"\nleave device 0x{new_id:02X} for the remote check; cleanup: "
              f"python bench_270_label_encoding.py {HOST} {HUB_VERSION} cleanup {new_id}")
    elif MODE == "cleanup":
        dev_id = int(sys.argv[4], 0)
        result = proxy.delete_device(dev_id)
        print(f"delete 0x{dev_id:02X}: {result}")
        proxy.request_devices()
        time.sleep(4)
        devs, _ = proxy.get_devices()
        print(f"device still present: {dev_id in (devs or {})}")
    else:
        raise SystemExit(f"unknown mode {MODE}")
finally:
    proxy.stop()
