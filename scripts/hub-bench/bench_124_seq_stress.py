"""Sequencer-validation: concurrent catalog polling vs blocking exchanges.

Recreates the production HA shape the consolidation exists for: one
thread fires fire-and-forget catalog refreshes (request_devices /
request_activities — the BurstScheduler path, real read bursts on the
wire) while the main thread continuously runs blocking exchange helpers
(key-sort, inputs, favorites-order, activity backups). Pre-consolidation
this collided constantly (a read sent mid-burst is silently dropped and
times out 5 s later — the 2026-07-18 FAV_ORDER failure); with the
exchange guard, every helper must return a real answer and the run must
finish with ZERO ack timeouts and ZERO quiesce-cap warnings in the log.

Usage: bench_124_seq_stress.py <ip> <X1|X1S|X2> <tag> <seconds>
"""

from __future__ import annotations

import sys
import threading
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DURATION = float(sys.argv[4]) if len(sys.argv) > 4 else 60.0

log_path = setup_logging(f"seq-stress-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "duration": DURATION}
stop = threading.Event()
poll_count = [0]


def _poller() -> None:
    # HA's periodic refresh shape: alternating catalog reads, ~1 Hz.
    while not stop.is_set():
        proxy.request_devices()
        if stop.wait(1.0):
            break
        proxy.request_activities()
        if stop.wait(1.0):
            break
        poll_count[0] += 2


try:
    proxy.request_devices()
    proxy.request_activities()
    deadline = time.time() + 20
    devs = acts = None
    while time.time() < deadline:
        devs, devs_ready = proxy.get_devices()
        acts, acts_ready = proxy.get_activities(force_refresh=False)
        if devs_ready and acts_ready:
            break
        time.sleep(0.3)
    dev_ids = sorted(int(d) for d in (devs or {}))
    act_ids = sorted(int(a) for a in (acts or {}))
    check("GATE: catalog readable", bool(dev_ids) and bool(act_ids), f"devs={dev_ids} acts={act_ids}")
    if not dev_ids or not act_ids:
        raise SystemExit("catalog gate failed")

    thread = threading.Thread(target=_poller, daemon=True)
    thread.start()

    outcomes = {"key_sort": [0, 0], "inputs": [0, 0], "fav_order": [0, 0], "activity_backup": [0, 0]}
    t_end = time.time() + DURATION
    cycle = 0
    while time.time() < t_end:
        dev = dev_ids[cycle % len(dev_ids)]
        act = act_ids[cycle % len(act_ids)]
        cycle += 1

        ks = proxy.fetch_device_key_sort(dev)
        outcomes["key_sort"][0 if ks is not None else 1] += 1

        inp = proxy.fetch_device_input_entries(dev)
        outcomes["inputs"][0 if inp is not None else 1] += 1

        fav = proxy.request_favorites_order(act)
        outcomes["fav_order"][0 if fav is not None else 1] += 1

        if cycle % 4 == 0:
            ab = proxy.backup_activity(act)
            outcomes["activity_backup"][0 if isinstance(ab, dict) else 1] += 1

    stop.set()
    thread.join(5.0)

    artifacts["outcomes"] = outcomes
    artifacts["cycles"] = cycle
    artifacts["polls"] = poll_count[0]
    print(f"ran {cycle} exchange cycles against {poll_count[0]} catalog polls")
    for name, (ok_n, bad_n) in outcomes.items():
        check(f"no {name} timeouts under polling", bad_n == 0, f"ok={ok_n} timeout={bad_n}")

    log_text = log_path.read_text(encoding="utf-8", errors="ignore")
    ack_timeouts = log_text.count("[ACK] timeout")
    quiesce_caps = log_text.count("still active after")
    check("zero ack timeouts in wire log", ack_timeouts == 0, f"count={ack_timeouts}")
    check("zero quiesce-cap warnings in wire log", quiesce_caps == 0, f"count={quiesce_caps}")
    artifacts["ack_timeouts"] = ack_timeouts
    artifacts["quiesce_caps"] = quiesce_caps
finally:
    stop.set()
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    save_json(f"seq-stress-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
