"""Code review CR-L3a-8 (bench program BP1): hub name encoding on the wire.

set_hub_name writes the name as GB2312 and trusts the GB2312-decoded echo,
while the banner reader decodes its copy of the name as UTF-8. This bench
sets non-ASCII names, reconnects, and records the raw banner name bytes and
both decodes, then puts the original name back and checks it stuck.

Usage:
    python bench_281_hub_name_encoding.py <ip> <X1|X1S>
"""

from __future__ import annotations

import sys
import time

import bench_common
from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
NAMES = ["Küche Hub", "客厅 Hub"]

captured: list[bytes] = []
_original_record = bench_common.X1Proxy.record_banner_payload


def _capture(self, opcode, payload):
    captured.append(bytes(payload))
    return _original_record(self, opcode, payload)


bench_common.X1Proxy.record_banner_payload = _capture


def decodes(raw: bytes) -> dict:
    name = raw[15:]
    out = {"raw_hex": name.hex(" ")}
    for codec in ("utf-8", "gb2312"):
        try:
            out[codec] = name.decode(codec).strip("\x00").strip()
        except UnicodeDecodeError as err:
            out[codec] = f"<{err.reason}>"
    return out


def banner_after_reconnect() -> tuple[dict, dict]:
    captured.clear()
    proxy = connect(HOST, HUB_VERSION)
    try:
        info, _ = proxy.fetch_banner_info(force_refresh=True)
        time.sleep(1.0)
        raw = captured[-1] if captured else b""
        return info, decodes(raw)
    finally:
        proxy.stop()
        time.sleep(4.0)  # let the hub drop the session before the next connect


log_path = setup_logging(f"hub-name-{HUB_VERSION}")
print(f"logging to {log_path}")
results: dict = {}
original_info, original_raw = banner_after_reconnect()
original = str(original_info.get("name") or "")
print(f"original name {original!r} raw {original_raw}")
results["original"] = {"info": original_info, "raw": original_raw}
try:
    for name in NAMES:
        proxy = connect(HOST, HUB_VERSION)
        try:
            ok = proxy.set_hub_name(name)
            echoed = (proxy.get_banner_info() or {}).get("name")
        finally:
            proxy.stop()
            time.sleep(4.0)
        info, raw = banner_after_reconnect()
        row = {
            "requested": name,
            "set_ok": ok,
            "echo_cached": echoed,
            "banner_name_as_read": info.get("name"),
            "raw": raw,
            "gb2312_of_request": name.encode("gb2312", errors="ignore").hex(" "),
            "utf8_of_request": name.encode("utf-8").hex(" "),
        }
        print(row)
        results[name] = row
finally:
    proxy = connect(HOST, HUB_VERSION)
    try:
        restored = proxy.set_hub_name(original)
    finally:
        proxy.stop()
        time.sleep(4.0)
    info, raw = banner_after_reconnect()
    results["restored"] = {"set_ok": restored, "name": info.get("name"), "raw": raw}
    print(f"restored name: {info.get('name')!r} (set_ok={restored})")
    print(f"saved {save_json(f'hub-name-{HUB_VERSION}', results)}")
