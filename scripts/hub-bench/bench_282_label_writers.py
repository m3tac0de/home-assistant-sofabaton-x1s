"""Code review CR-L2-1 / CR-L2-14 (bench program BP1): the one label slot encoder.

Wave 1 moved every label writer onto ``wire_schema.encode_label_slot``
(UTF-16BE cut at whole code units on the X1S/X2). This bench writes the
same names through two writers and reads them back:

- a throwaway Wifi device (``create_wifi_device``: device + command labels);
- a throwaway IR device (``restore_device``: command labels), its codes
  copied from the test device.

Names include non-Latin text and slot-boundary cases: 29 letters plus an
emoji (31 code units, so the emoji's first half would straddle the slot
end) and 28 letters plus an emoji (exactly 30 units). Every read-back is
compared with what the encoder predicts. Both devices are deleted again.

Usage:
    python bench_282_label_writers.py <ip> <X1S|X2> <ir-source-device-id>
"""

from __future__ import annotations

import copy
import sys
import time

import bench_common  # noqa: F401  (loads the lib as x1slib)
from bench_common import connect, save_json, setup_logging
from x1slib.wire_schema import encode_label_slot

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
SOURCE_DEVICE = int(sys.argv[3], 0)

NAMES = ["Küche", "灯光控制", "A" * 29 + "😀", "B" * 28 + "😀"]


def predicted(name: str) -> str:
    return encode_label_slot(name, 60, "utf-16-be").decode("utf-16-be").rstrip("\x00").strip()


def check(label: str, want: str, got: str) -> dict:
    expect = predicted(want)
    verdict = "ok" if got == expect else "MISMATCH"
    print(f"  {label:18} want={want!r} expect={expect!r} got={got!r} -> {verdict}")
    return {"label": label, "want": want, "expect": expect, "got": got, "verdict": verdict}


log_path = setup_logging(f"label-writers-{HUB_VERSION}")
print(f"logging to {log_path}")
proxy = connect(HOST, HUB_VERSION)
created: list[int] = []
rows: list[dict] = []
try:
    # -- Wifi writer ------------------------------------------------------
    wifi = proxy.create_wifi_device(
        device_name="Bench 灯光 Labels",
        commands=[
            {"display_name": n, "press_type": "short", "command_index": i}
            for i, n in enumerate(NAMES)
        ],
        request_port=8060,
        brand_name="m3-benchlabels-00000000000",
    )
    print(f"wifi create: {wifi}")
    if wifi and wifi.get("status") == "success":
        wifi_id = int(wifi["device_id"])
        created.append(wifi_id)
        back = proxy.backup_device(wifi_id, include_blobs=True) or {}
        rows.append(check("wifi device", "Bench 灯光 Labels", str((back.get("device") or {}).get("name") or "")))
        by_id = {int(c["command_id"]): c for c in back.get("commands") or []}
        for i, name in enumerate(NAMES):
            rows.append(check(f"wifi command {i + 1}", name, str((by_id.get(i + 1) or {}).get("name") or "")))

    # -- restore (command record) writer ---------------------------------
    source = proxy.backup_device(SOURCE_DEVICE, include_blobs=True) or {}
    template = next(
        (c for c in source.get("commands") or [] if isinstance(c.get("restore_data"), dict)),
        None,
    )
    if template is None:
        raise SystemExit(f"device 0x{SOURCE_DEVICE:02X} has no restorable command to copy")
    payload = copy.deepcopy(source)
    payload["device"] = {**payload["device"], "name": "Bench IR Labels"}
    payload["commands"] = [
        {**copy.deepcopy(template), "command_id": i + 1, "name": name}
        for i, name in enumerate(NAMES)
    ]
    for key in ("button_bindings", "macros"):
        payload[key] = []
    payload.pop("input_record", None)
    payload.pop("key_sort", None)
    restored = proxy.restore_device(payload)
    print(f"ir restore: {restored}")
    if restored and restored.get("status") == "success":
        ir_id = int(restored["device_id"])
        created.append(ir_id)
        back = proxy.backup_device(ir_id, include_blobs=False) or {}
        by_id = {int(c["command_id"]): c for c in back.get("commands") or []}
        for i, name in enumerate(NAMES):
            rows.append(check(f"ir command {i + 1}", name, str((by_id.get(i + 1) or {}).get("name") or "")))
finally:
    for dev_id in created:
        print(f"cleanup: delete 0x{dev_id:02X}: {proxy.delete_device(dev_id)}")
    proxy.request_devices()
    time.sleep(4)
    devices, _ = proxy.get_devices(force_refresh=False)
    print(f"left over: {[d for d in created if d in (devices or {})]}; devices now {sorted(devices or {})}")
    save_json(f"label-writers-{HUB_VERSION}", {"rows": rows, "created": created})
    proxy.stop()
