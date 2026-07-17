"""In-place chunk 1, X1 power-row live proof via device-scope fire.

The X1's activity engine currently never reaches the bench device's
wifi rows (foreign wifi member 0x07 shadows it — see inplace-c1c/d/e).
To live-validate the in-place 0xC6 power-row rewrite anyway, fire the
device-scope POWER keys directly: the hub resolves the device's
family-0x12 row exactly like the activity engine's (dev,198)/(dev,199)
steps do.

Expected: key 0xC6 -> cmd 4 callback (/3/short, the step-A rewrite),
key 0xC7 -> cmd 2 callback (/1/short), and a direct fire of cmd 5
(/4/short) proving the re-pointed input slot's record delivers.

Usage:
    python bench_111f_x1_power_fire.py <ip> <X1> <tag>
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]

DEV = 0x08
LISTENER_PORT = 8060

log_path = setup_logging(f"inplace-c1f-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "bench_ip": bench_ip}
try:
    action_id = proxy._stable_hub_action_id()

    def fire(label: str, key: int, expect_paths: set[str] | None) -> None:
        listener.clear()
        print(f"fire {label}: send_command(0x{DEV:02X}, 0x{key:02X}) — 12s window")
        proxy.send_command(DEV, key)
        time.sleep(12.0)
        paths = [h["path"] for h in listener.snapshot()]
        artifacts[f"hits_{label}"] = paths
        if expect_paths is None:
            print(f"  got={paths}")
        else:
            check(f"{label}: fires exactly {sorted(expect_paths)}", set(paths) == expect_paths, f"got={paths}")

    p = lambda cid: f"/launch/{action_id}/{DEV}/{cid - 1}/short"

    fire("POWER_ON-key(0xC6)->cmd4", 0xC6, {p(4)})
    fire("POWER_OFF-key(0xC7)->cmd2", 0xC7, {p(2)})
    fire("direct-cmd5(input-slot)", 5, {p(5)})
finally:
    listener.stop()
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path = save_json(f"inplace-c1f-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
