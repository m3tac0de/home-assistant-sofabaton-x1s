"""Wifi Commands program chunk 2: REQ_ACTIVATE repeat re-examination.

Plan: docs/internal/wifi-commands-bench-plan.md (chunk 2). Settles the
backup/restore chunk-5 disputed finding: one ``REQ_ACTIVATE`` (0x023F)
on a ``wifi_ip`` command produced ~8-10 HTTP callbacks/s indefinitely —
against a listener that answered ``HTTP/1.0 200`` with an empty body.
Hypothesis: the hub retries delivery until it gets a response it
accepts, so the storm was a delivery-retry loop, not key-repeat.

Method: restore a bench_69-shaped HA-action host with FOUR commands
(one per listener response mode), then fire exactly one
``proxy.send_command`` per mode and count callbacks per window:

  A ``ok``           integration response shape — expect a small finite
                     count (1, or a short/long pair), then silence;
  B ``http10-empty`` chunk-5 replica — if the retry hypothesis holds,
                     the storm reproduces; then FLIP the listener back
                     to ``ok`` mid-storm and confirm the storm stops
                     (the direct test of "retry until accepted");
  C ``404``          integration shape, error status — does the hub
                     treat a well-formed 404 as delivered?
  D refused          listener stopped (closed port) — fire, wait,
                     restart in ``ok`` mode, and observe whether/how
                     long the hub retries.

Cleanup: delete the host device. Per the single-member-GC rule the
sweep purges "Bench Test" (0x68) — re-run
``bench_63_bench_test_restore.py <ip> X1S x1s`` afterwards.

Usage:
    python bench_81_wifi_activate_matrix.py <ip> <X1S> <tag> [port]
"""

from __future__ import annotations

import sys
import time
import urllib.parse

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward, pick_port

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
LISTENER_PORT = int(sys.argv[4]) if len(sys.argv) > 4 else pick_port()

DEVICE_NAME = "Bench Matrix Host"
PROTECTED_ACTIVITIES = [0x65, 0x66, 0x67]
BENCH_TEST_ACTIVITY = 0x68
SOURCE_DEVICE_ID = 1
HA_ACTION_LIBRARY_TYPE = 0x1C
COMMAND_NAMES = {1: "Bench A", 2: "Bench B", 3: "Bench C", 4: "Bench D"}

log_path = setup_logging(f"wifi-c2-matrix-{TAG}")
print(f"logging to {log_path}")


# ---------------------------------------------------- bench_69 payload port
def render_ha_action_data_hex(host: str, port: int, path: str) -> str:
    text = (
        f"POST {path} HTTP/1.1\r\n"
        f"Host:{host}:{port}\r\n"
        "Content-Type:application/x-www-form-urlencoded\r\n"
        "\r\n"
    )
    text_bytes = text.encode("ascii")
    ip_bytes = bytes(int(part) & 0xFF for part in host.split("."))
    blob = ip_bytes + port.to_bytes(2, "big") + len(text_bytes).to_bytes(2, "big") + text_bytes
    return blob.hex(" ")


def ha_action_command_row(device_id: int, command_id: int, name: str, host: str, port: int) -> dict:
    path = f"/launch/ha/{device_id}/{urllib.parse.quote(name)}/short"
    code = (0x4E20 + (command_id & 0xFF)) & 0xFFFFFFFFFFFF
    return {
        "command_id": command_id,
        "name": name,
        "restore_data": {
            "transport": "hub_code_record",
            "library_type": HA_ACTION_LIBRARY_TYPE,
            "command_code": code.to_bytes(6, "big").hex(" "),
            "data_hex": render_ha_action_data_hex(host, port, path),
            "decoded": {
                "class": "wifi_ip",
                "fields": {
                    "host": host,
                    "port": port,
                    "method": "POST",
                    "path": path,
                    "header": "",
                    "content_type": "application/x-www-form-urlencoded",
                    "body": "",
                },
                "trailer_hex": "",
                "edited": False,
            },
        },
    }


def ha_host_payload(host: str, port: int) -> dict:
    return {
        "kind": "device_backup",
        "schema_version": 4,
        "ha_action_host": True,
        "device": {
            "device_id": SOURCE_DEVICE_ID,
            "name": DEVICE_NAME,
            "brand": "m3-benchwifi-matrix",
            "device_class": "wifi_ip",
            "device_class_code": 0x1C,
            "icon": 1,
            "sort": 99,
            "code_type": 0x1C,
            "device_type": 0x10,
            "code_id_hex": " ".join(["00"] * 16),
            "hide": 0,
            "input_flag": 0,
            "channel": 0,
            "power_state": 0,
            "poll_time": 0,
            "input_mode": 2,
            "power_mode": 0,
            "power_style": 0,
            "share_mode": 0,
            "tail_marker": 1,
        },
        "commands": [
            ha_action_command_row(SOURCE_DEVICE_ID, cid, name, host, port)
            for cid, name in COMMAND_NAMES.items()
        ],
        "button_bindings": [],
        "macros": [],
    }


# ---------------------------------------------------------------- helpers
checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def snapshot_catalog(proxy) -> tuple[dict, dict]:
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
    return dict(devs or {}), dict(acts or {})


def drain(listener: BenchWifiListener, quiet_s: float, timeout_s: float) -> tuple[int, float]:
    """Wait until no new hits for quiet_s. Returns (extra_hits, elapsed)."""
    start = time.time()
    baseline = len(listener.snapshot())
    last_change = start
    while time.time() - start < timeout_s:
        n = len(listener.snapshot())
        if n != baseline:
            baseline = n
            last_change = time.time()
        if time.time() - last_change >= quiet_s:
            break
        time.sleep(0.25)
    return len(listener.snapshot()), time.time() - start


def summarize(hits: list[dict]) -> str:
    if not hits:
        return "0 hits"
    paths = sorted({h.get("path", "?") for h in hits})
    span = hits[-1]["at"] - hits[0]["at"] if len(hits) > 1 else 0.0
    rate = (len(hits) - 1) / span if span > 0 else 0.0
    return f"{len(hits)} hits over {span:.1f}s ({rate:.1f}/s) paths={paths}"


# ---------------------------------------------------------------- run
bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

payload = ha_host_payload(bench_ip, LISTENER_PORT)
expected_paths = {
    cid: f"/launch/ha/{SOURCE_DEVICE_ID}/{urllib.parse.quote(name)}/short"
    for cid, name in COMMAND_NAMES.items()
}

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {
    "host": HOST,
    "hub_version": HUB_VERSION,
    "bench_ip": bench_ip,
    "listener_port": LISTENER_PORT,
    "phases": {},
}
new_id = None
try:
    devs0, acts0 = snapshot_catalog(proxy)
    print(f"baseline catalog: {len(devs0)} devices, {len(acts0)} activities")
    artifacts["bench_test_present_at_start"] = BENCH_TEST_ACTIVITY in acts0

    print(f"restoring {DEVICE_NAME!r} (4 commands)...")
    result = proxy.restore_device(payload)
    artifacts["restore_result"] = result
    check(
        "restore accepted",
        bool(result) and result.get("status") == "success",
        f"result={result}",
    )
    if not result or result.get("status") != "success":
        raise SystemExit("restore failed; stopping")
    new_id = int(result["device_id"])
    cmd_map = {int(k): int(v) for k, v in (result.get("command_id_map") or {}).items()}
    check("4 commands mapped", len(cmd_map) == 4, f"map={cmd_map}")

    # ---------------- Phase A: integration response shape ----------------
    print("\nPhase A: mode=ok — one send_command, 12s window")
    listener.mode = "ok"
    listener.clear()
    proxy.send_command(new_id, cmd_map[1])
    time.sleep(12.0)
    hits_a = listener.snapshot()
    artifacts["phases"]["A_ok"] = {"hits": hits_a}
    print(f"  {summarize(hits_a)}")
    check("A: callback received", bool(hits_a), summarize(hits_a))
    check(
        "A GATE: finite count with integration shape (no storm)",
        0 < len(hits_a) <= 2,
        summarize(hits_a),
    )
    if hits_a:
        got = {(h["method"], h["path"]) for h in hits_a}
        check(
            "A: method+path exact",
            got == {("POST", expected_paths[1])},
            f"got={sorted(got)}",
        )
    total, _ = drain(listener, quiet_s=5.0, timeout_s=30.0)
    check("A: silence after window", total == len(hits_a), f"total={total}")

    # ---------------- Phase B: chunk-5 replica + mid-storm flip ----------
    print("\nPhase B: mode=http10-empty — one send_command, 10s window")
    listener.mode = "http10-empty"
    listener.clear()
    proxy.send_command(new_id, cmd_map[2])
    time.sleep(10.0)
    hits_b = listener.snapshot()
    artifacts["phases"]["B_http10"] = {"hits_in_window": len(hits_b), "summary": summarize(hits_b)}
    print(f"  {summarize(hits_b)}")
    storm_b = len(hits_b) >= 10
    check(
        "B: chunk-5 storm reproduces against HTTP/1.0-empty",
        storm_b,
        summarize(hits_b),
    )
    print("  flipping listener to mode=ok mid-storm...")
    flip_at = time.time()
    listener.mode = "ok"
    total_b, elapsed = drain(listener, quiet_s=5.0, timeout_s=60.0)
    post_flip = total_b - len(hits_b)
    stopped = elapsed < 60.0
    artifacts["phases"]["B_http10"]["post_flip_hits"] = post_flip
    artifacts["phases"]["B_http10"]["stop_elapsed_s"] = elapsed
    artifacts["phases"]["B_http10"]["storm_stopped_after_flip"] = stopped
    check(
        "B GATE: storm stops once responses are accepted",
        (not storm_b) or stopped,
        f"{post_flip} hits after flip, quiet after {elapsed:.1f}s",
    )
    if storm_b and hits_b:
        wrong_path = [h for h in hits_b if h.get("path") != expected_paths[2]]
        check(
            "B: storm hits are all command B's path (retries, not key-repeat of others)",
            not wrong_path,
            f"{len(wrong_path)} foreign hits",
        )

    # ---------------- Phase C: well-formed 404 ---------------------------
    print("\nPhase C: mode=404 — one send_command, 10s window")
    listener.mode = "404"
    listener.clear()
    proxy.send_command(new_id, cmd_map[3])
    time.sleep(10.0)
    hits_c = listener.snapshot()
    artifacts["phases"]["C_404"] = {"hits_in_window": len(hits_c), "summary": summarize(hits_c)}
    print(f"  {summarize(hits_c)}")
    storm_c = len(hits_c) >= 10
    print(f"  404 treated as {'NOT delivered (storm)' if storm_c else 'delivered (finite)'}")
    listener.mode = "ok"
    total_c, elapsed_c = drain(listener, quiet_s=5.0, timeout_s=60.0)
    artifacts["phases"]["C_404"]["post_flip_hits"] = total_c - len(hits_c)
    artifacts["phases"]["C_404"]["storm"] = storm_c
    check("C: quiescent after flip to ok", elapsed_c < 60.0, f"quiet after {elapsed_c:.1f}s")

    # ---------------- Phase D: connection refused ------------------------
    print("\nPhase D: listener stopped (port closed) — one send_command, 15s dark")
    listener.stop()
    dark_at = time.time()
    proxy.send_command(new_id, cmd_map[4])
    time.sleep(15.0)
    print("  restarting listener in mode=ok...")
    listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
    reopened_at = time.time()
    time.sleep(20.0)
    hits_d = listener.snapshot()
    artifacts["phases"]["D_refused"] = {
        "dark_seconds": reopened_at - dark_at,
        "hits_after_reopen": len(hits_d),
        "summary": summarize(hits_d),
        "hit_delays_s": [round(h["at"] - reopened_at, 2) for h in hits_d[:20]],
    }
    print(f"  after reopen: {summarize(hits_d)}")
    print(
        "  hub "
        + (
            f"still retrying after {reopened_at - dark_at:.0f}s dark "
            f"(first retry {hits_d[0]['at'] - reopened_at:.2f}s after reopen)"
            if hits_d
            else f"gave up within {reopened_at - dark_at:.0f}s of refusal"
        )
    )
    if hits_d:
        wrong = [h for h in hits_d if h.get("path") != expected_paths[4]]
        check("D: retried hits are command D's path", not wrong, f"{len(wrong)} foreign")
    total_d, elapsed_d = drain(listener, quiet_s=5.0, timeout_s=60.0)
    check("D: quiescent with ok responses", elapsed_d < 60.0, f"quiet after {elapsed_d:.1f}s")
    artifacts["phases"]["D_refused"]["total_after_drain"] = total_d

    # ---------------- cleanup -------------------------------------------
    print(f"\ndeleting device 0x{new_id:02X}...")
    del_result = proxy.delete_device(new_id)
    artifacts["delete_result"] = del_result
    check(
        "delete_device success",
        bool(del_result) and del_result.get("status") == "success",
        f"result={del_result}",
    )
    new_id = None
    devs1, acts1 = snapshot_catalog(proxy)
    check(
        "device catalog back at baseline",
        sorted(devs1) == sorted(devs0),
        f"before={sorted(devs0)} after={sorted(devs1)}",
    )
    for act in PROTECTED_ACTIVITIES:
        check(
            f"activity 0x{act:02X} untouched",
            act in acts1 and (acts0.get(act) or {}).get("name") == (acts1.get(act) or {}).get("name"),
            f"{(acts1.get(act) or {}).get('name')!r}",
        )
    artifacts["bench_test_present_after_delete"] = BENCH_TEST_ACTIVITY in acts1
    print(
        f"Bench Test (0x68) after delete: "
        f"{'present' if BENCH_TEST_ACTIVITY in acts1 else 'purged (expected; run bench_63)'}"
    )
finally:
    listener.stop()
    artifacts["checks"] = [
        {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
    ]
    path = save_json(f"wifi-c2-matrix-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
