"""In-place chunk 1, X1 delivery probe (read-only).

bench_111 on the X1 validated every in-place write but saw ZERO wifi
callbacks in every drive window — including the baseline right after a
fresh deploy — while the hub visibly transitioned the activity
(idle -> ACTIVE in the activities list). This probe isolates the
delivery layer:

  1. parse the head IPs of BOTH managed wifi devices (bench dev 0x08
     and the dev-HA-managed 'test' dev 0x07 that shares the bench
     activities) — is a dead callback target in the macro path?
  2. direct-fire one command on dev 0x08 (no activity involved) and
     watch for raw TCP accepts + parsed hits on the listener,
  3. re-drive ACT_B ON/OFF with LONG windows (60s/45s), timestamping
     every accept/hit to catch late deliveries (sequential retry
     starvation by dev 0x07's dead callback would show as latency).

Usage:
    python bench_111c_x1_probe.py <ip> <X1> <tag>
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

DEV = 0x08
OTHER_WIFI = [0x04, 0x05, 0x07]  # Sonos, Marantz, dev-HA 'test'
ACT_B = 0x66
LISTENER_PORT = 8060

log_path = setup_logging(f"inplace-c1c-{TAG}")
print(f"logging to {log_path}")

bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok")

# wrap _handle to log raw TCP accepts (a connect that never sends a valid
# request would otherwise be invisible)
accepts: list[dict] = []
_orig_handle = listener._handle


def _logging_handle(conn, addr):
    accepts.append({"at": time.time(), "client": addr[0], "port": addr[1]})
    print(f"    [accept] {addr[0]}:{addr[1]}")
    _orig_handle(conn, addr)


listener._handle = _logging_handle
listener.start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok (accept-logging)")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "bench_ip": bench_ip}
try:
    # ---------------- 1. head IPs of every wifi device
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    heads = {}
    for dev_id in sorted({DEV, *OTHER_WIFI}):
        info = proxy.state.entities("device").get(dev_id) or {}
        raw = info.get("raw_body")
        if isinstance(raw, (bytes, bytearray)):
            cfg = parse_device_record(bytes(raw), hub_version=HUB_VERSION, entity_kind="device")
            heads[dev_id] = {"name": cfg.name, "brand": cfg.brand, "ip": cfg.ip_address, "type": cfg.device_type}
            print(f"dev 0x{dev_id:02X}: name={cfg.name!r} ip={cfg.ip_address!r} brand={cfg.brand!r}")
        else:
            heads[dev_id] = None
            print(f"dev 0x{dev_id:02X}: no record body")
    artifacts["heads"] = {f"0x{k:02X}": v for k, v in heads.items()}

    action_id = proxy._stable_hub_action_id()

    # ---------------- 2. direct fire (no activity)
    proxy.get_commands_for_entity(DEV, fetch_if_missing=True)
    deadline = time.time() + 10
    while time.time() < deadline and DEV not in getattr(proxy, "_commands_complete", set()):
        time.sleep(0.3)
    cmds = dict(proxy.state.commands.get(DEV) or {})
    print(f"dev 0x{DEV:02X} command cache ids: {sorted(cmds)[:24]}")
    artifacts["command_ids"] = sorted(cmds)
    fire_key = sorted(cmds)[0] if cmds else 1

    listener.clear()
    accepts.clear()
    t0 = time.time()
    print(f"direct-fire: send_command(0x{DEV:02X}, {fire_key}) — 20s window")
    proxy.send_command(DEV, fire_key)
    time.sleep(20.0)
    hits = listener.snapshot()
    artifacts["direct_fire"] = {
        "key": fire_key,
        "accepts": [{**a, "dt": round(a["at"] - t0, 2)} for a in accepts],
        "hits": [{"path": h["path"], "client": h.get("client"), "dt": round(h["at"] - t0, 2) if isinstance(h.get("at"), float) else h.get("at")} for h in hits],
    }
    print(f"  accepts={len(accepts)} hits={[h['path'] for h in hits]}")

    # ---------------- 3. activity drive with long windows
    print("settle OFF (15s)...")
    proxy.send_command(ACT_B, ButtonName.POWER_OFF)
    time.sleep(15.0)

    listener.clear()
    accepts.clear()
    t0 = time.time()
    print("ACT_B ON — 60s window...")
    proxy.send_command(ACT_B, ButtonName.POWER_ON)
    time.sleep(60.0)
    hits = listener.snapshot()
    artifacts["activity_on"] = {
        "accepts": [{**a, "dt": round(a["at"] - t0, 2)} for a in accepts],
        "hits": [{"path": h["path"], "client": h.get("client"), "dt": round(h["at"] - t0, 2) if isinstance(h.get("at"), float) else h.get("at")} for h in hits],
    }
    print(f"  accepts={len(accepts)}")
    for h in artifacts["activity_on"]["hits"]:
        print(f"    hit +{h['dt']}s {h['client']} {h['path']}")

    listener.clear()
    accepts.clear()
    t0 = time.time()
    print("ACT_B OFF — 45s window...")
    proxy.send_command(ACT_B, ButtonName.POWER_OFF)
    time.sleep(45.0)
    hits = listener.snapshot()
    artifacts["activity_off"] = {
        "accepts": [{**a, "dt": round(a["at"] - t0, 2)} for a in accepts],
        "hits": [{"path": h["path"], "client": h.get("client"), "dt": round(h["at"] - t0, 2) if isinstance(h.get("at"), float) else h.get("at")} for h in hits],
    }
    print(f"  accepts={len(accepts)}")
    for h in artifacts["activity_off"]["hits"]:
        print(f"    hit +{h['dt']}s {h['client']} {h['path']}")
finally:
    listener.stop()
    path = save_json(f"inplace-c1c-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")
