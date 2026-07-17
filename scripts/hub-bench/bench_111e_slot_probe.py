"""In-place chunk 1, X1 one-wifi-device-per-transition probe.

bench_111d showed: with dev 0x07 redirected to the bench listener, the
OFF transition delivered dev 0x07's callback (accepted 200) and STILL
skipped dev 0x08 — while the ON delivered nothing (suspected stale
endpoint cache, redirect was only ~13s old). Hypothesis: the X1 fires
wifi callbacks for at most ONE wifi device per activity transition
(the first member with bound power rows), regardless of outcome.

This probe repeats the redirect but lets the endpoint cache settle 60s
before driving. Expected under the hypothesis:
  ON  -> dev 0x07 power-on callback arrives, dev 0x08 skipped
  OFF -> dev 0x07 power-off callback arrives, dev 0x08 skipped

Restores dev 0x07's head IP afterwards (byte-compare gate).

Usage:
    python bench_111e_slot_probe.py <ip> <X1> <tag>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward

from x1slib.devices import parse_device_record
from x1slib.protocol_const import ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

FOREIGN = 0x07
DEV = 0x08
ACT_B = 0x66
LISTENER_PORT = 8060

log_path = setup_logging(f"inplace-c1e-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def head_of(proxy, dev_id: int):
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    info = proxy.state.entities("device").get(dev_id) or {}
    raw = info.get("raw_body")
    if not isinstance(raw, (bytes, bytearray)):
        return None, None
    cfg = parse_device_record(bytes(raw), hub_version=HUB_VERSION, entity_kind="device")
    return bytes(raw).hex(), cfg


bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "bench_ip": bench_ip}
try:
    orig_hex, orig_cfg = head_of(proxy, FOREIGN)
    if not orig_hex:
        raise SystemExit("no head record for dev 0x07")
    orig_ip = orig_cfg.ip_address
    artifacts["foreign_ip_before"] = orig_ip
    print(f"dev 0x{FOREIGN:02X} original ip={orig_ip!r}")

    ok = proxy._sync_step_device_ip({"device_id": FOREIGN, "ip_address": bench_ip})
    check("GATE: dev 0x07 head IP -> bench listener", bool(ok), f"{ok}")
    if not ok:
        raise SystemExit("redirect failed")

    try:
        print("settle OFF + endpoint-cache settle (60s)...")
        proxy.send_command(ACT_B, ButtonName.POWER_OFF)
        time.sleep(60.0)

        listener.clear()
        t0 = time.time()
        print("ACT_B ON — 25s window...")
        proxy.send_command(ACT_B, ButtonName.POWER_ON)
        time.sleep(25.0)
        on_hits = [
            {"path": h["path"], "dt": round(h["at"] - t0, 2) if isinstance(h.get("at"), float) else None}
            for h in listener.snapshot()
        ]
        artifacts["on_hits"] = on_hits
        for h in on_hits:
            print(f"    hit +{h['dt']}s {h['path']}")
        dev7 = [h["path"] for h in on_hits if f"/{FOREIGN}/" in h["path"]]
        dev8 = [h["path"] for h in on_hits if f"/{DEV}/" in h["path"]]
        check("ON: dev 0x07 callback delivered (cache settled)", bool(dev7), f"{dev7}")
        check("ON: dev 0x08 skipped (slot consumed) — hypothesis holds if OK", not dev8, f"{dev8}")

        listener.clear()
        t0 = time.time()
        print("ACT_B OFF — 25s window...")
        proxy.send_command(ACT_B, ButtonName.POWER_OFF)
        time.sleep(25.0)
        off_hits = [
            {"path": h["path"], "dt": round(h["at"] - t0, 2) if isinstance(h.get("at"), float) else None}
            for h in listener.snapshot()
        ]
        artifacts["off_hits"] = off_hits
        for h in off_hits:
            print(f"    hit +{h['dt']}s {h['path']}")
        dev7 = [h["path"] for h in off_hits if f"/{FOREIGN}/" in h["path"]]
        dev8 = [h["path"] for h in off_hits if f"/{DEV}/" in h["path"]]
        check("OFF: dev 0x07 callback delivered", bool(dev7), f"{dev7}")
        check("OFF: dev 0x08 skipped (slot consumed) — hypothesis holds if OK", not dev8, f"{dev8}")
    finally:
        ok = proxy._sync_step_device_ip({"device_id": FOREIGN, "ip_address": orig_ip})
        check("GATE: dev 0x07 head IP restored", bool(ok), f"{ok}")
        after_hex, _cfg = head_of(proxy, FOREIGN)
        check("GATE: restored head byte-identical to original", after_hex == orig_hex,
              "equal" if after_hex == orig_hex else "DIFF — see artifact")
        artifacts["foreign_head_before"] = orig_hex
        artifacts["foreign_head_after"] = after_hex
finally:
    listener.stop()
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path = save_json(f"inplace-c1e-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
