"""In-place chunk 1, X1 callback-chain probe.

bench_111c showed: direct-fire delivers, activity-driven delivers
NOTHING — and activity 0x66's other wifi member (dev 0x07 'test',
managed by the dev HA install) targets 192.168.2.77:8060, which is dead
while the HA integration is disabled. Hypothesis (c4 finding "one
callback per accepted response"): the hub chains power-macro wifi
callbacks and stops when a member's delivery is not accepted, so dev
0x07's dead row starves dev 0x08's rows.

Probe: temporarily point dev 0x07's head IP at the bench listener
(bench_100-validated ``device_ip`` head RMW), drive ACT_B ON/OFF, then
restore the original IP and byte-compare the restored head record.
Expected if the hypothesis holds: dev 0x07 AND dev 0x08 callbacks all
arrive in order.

Usage:
    python bench_111d_chain_probe.py <ip> <X1> <tag>
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

FOREIGN = 0x07  # dev-HA managed 'test' device sharing the bench activities
DEV = 0x08      # our bench wifi device
ACT_B = 0x66
LISTENER_PORT = 8060

log_path = setup_logging(f"inplace-c1d-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def head_of(proxy, dev_id: int) -> tuple[str | None, object]:
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    info = proxy.state.entities("device").get(dev_id) or {}
    raw = info.get("raw_body")
    if not isinstance(raw, (bytes, bytearray)):
        return None, None
    cfg = parse_device_record(bytes(raw), hub_version=HUB_VERSION, entity_kind="device")
    return bytes(raw).hex(), cfg


bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok")
accepts: list[dict] = []
_orig_handle = listener._handle


def _logging_handle(conn, addr):
    accepts.append({"at": time.time(), "client": addr[0]})
    _orig_handle(conn, addr)


listener._handle = _logging_handle
listener.start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "bench_ip": bench_ip}
try:
    orig_hex, orig_cfg = head_of(proxy, FOREIGN)
    if not orig_hex:
        raise SystemExit("no head record for dev 0x07")
    orig_ip = orig_cfg.ip_address
    print(f"dev 0x{FOREIGN:02X} original ip={orig_ip!r}")
    artifacts["foreign_head_before"] = orig_hex
    artifacts["foreign_ip_before"] = orig_ip
    check("GATE: original head captured", bool(orig_hex) and bool(orig_ip), f"ip={orig_ip!r}")

    # ---- redirect dev 7 to the bench listener
    ok = proxy._sync_step_device_ip({"device_id": FOREIGN, "ip_address": bench_ip})
    check("GATE: dev 0x07 head IP -> bench listener", bool(ok), f"{ok}")
    if not ok:
        raise SystemExit("redirect failed; nothing mutated further")

    try:
        print("settle OFF (12s)...")
        proxy.send_command(ACT_B, ButtonName.POWER_OFF)
        time.sleep(12.0)

        listener.clear()
        accepts.clear()
        t0 = time.time()
        print("ACT_B ON — 30s window...")
        proxy.send_command(ACT_B, ButtonName.POWER_ON)
        time.sleep(30.0)
        on_hits = [
            {"path": h["path"], "client": h.get("client"), "dt": round(h["at"] - t0, 2) if isinstance(h.get("at"), float) else None}
            for h in listener.snapshot()
        ]
        artifacts["activity_on_hits"] = on_hits
        for h in on_hits:
            print(f"    hit +{h['dt']}s {h['path']}")
        dev8_on = [h for h in on_hits if f"/{DEV}/" in h["path"]]
        dev7_on = [h for h in on_hits if f"/{FOREIGN}/" in h["path"]]
        check(
            "GATE: dev 0x08 callbacks arrive once dev 0x07's target is live",
            bool(dev8_on),
            f"dev7={[h['path'] for h in dev7_on]} dev8={[h['path'] for h in dev8_on]}",
        )
        check("chain evidence: dev 0x07 callback(s) also delivered here", bool(dev7_on), f"{[h['path'] for h in dev7_on]}")

        listener.clear()
        t0 = time.time()
        print("ACT_B OFF — 30s window...")
        proxy.send_command(ACT_B, ButtonName.POWER_OFF)
        time.sleep(30.0)
        off_hits = [
            {"path": h["path"], "client": h.get("client"), "dt": round(h["at"] - t0, 2) if isinstance(h.get("at"), float) else None}
            for h in listener.snapshot()
        ]
        artifacts["activity_off_hits"] = off_hits
        for h in off_hits:
            print(f"    hit +{h['dt']}s {h['path']}")
        check("OFF delivers dev 0x08 power-off", any(f"/{DEV}/" in h["path"] for h in off_hits), f"{[h['path'] for h in off_hits]}")
    finally:
        # ---- restore dev 7's original IP no matter what
        ok = proxy._sync_step_device_ip({"device_id": FOREIGN, "ip_address": orig_ip})
        check("GATE: dev 0x07 head IP restored", bool(ok), f"{ok}")
        after_hex, after_cfg = head_of(proxy, FOREIGN)
        artifacts["foreign_head_after"] = after_hex
        check(
            "GATE: restored head byte-identical to original",
            after_hex == orig_hex,
            "equal" if after_hex == orig_hex else f"diff at {[i for i in range(min(len(orig_hex), len(after_hex or '')) // 2) if orig_hex[i*2:i*2+2] != (after_hex or '')[i*2:i*2+2]][:12]}",
        )
finally:
    listener.stop()
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path = save_json(f"inplace-c1d-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
