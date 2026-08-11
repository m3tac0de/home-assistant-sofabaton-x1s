"""MQTT vs HTTP callback latency benchmark.

Users claim an X2 MQTT "callback" reaches its automation faster than an
HTTP callback. This bench measures activation-to-delivery latency for
both transports on the same hub, in the same session, interleaved, so
network conditions are shared.

Method
------
- Restore two scratch devices: a ``wifi_ip`` HA-action host whose
  callback URL points at this machine's BenchWifiListener, and a
  ``wifi_mqtt`` device built from the profile documented in
  docs/protocol/wifi-commands.md. Neither joins any activity and
  neither binds any button, so deleting them afterwards touches nothing
  else on the hub.
- Subscribe to ``<MAC>/up`` (upper and lower case variants) on the
  broker the hub is configured for, with the dependency-free client in
  bench_mqtt_client.py.
- Fire ``REQ_ACTIVATE`` (proxy.send_command) per trial and stamp
  ``time.time()`` at the call; the listener / subscriber stamp arrival
  in their receive threads. Latency = arrival - send.
- The trigger leg (bench PC -> hub TCP -> sequencer -> 0x023F handling)
  is identical for both arms, so it cancels in the comparison; absolute
  numbers include it and therefore overstate the pure hub->HA leg.
- Arms alternate within each round, and which arm goes first alternates
  per round, to cancel drift and ordering bias.

Caveats to report alongside results
-----------------------------------
- The MQTT path measured here is hub -> broker -> THIS machine. In a
  production install the broker usually lives on the HA box, so the
  broker -> subscriber hop is loopback there; measured MQTT latency is
  an upper bound in that respect.
- HTTP arrival is stamped once the full request has been read (the
  moment HA could dispatch); MQTT arrival when the PUBLISH frame is
  parsed. Comparable dispatch points.
- This measures transport delivery, not HA automation scheduling. The
  HA-side dispatch difference (aiohttp handler vs MQTT integration
  fan-out) is not covered; it can be benched later on a live HA if the
  transport numbers are close.

Prerequisites
-------------
- X2 hub on the bench, nothing else holding its TCP session (disable
  the HA config entry for it while benching, and re-enable after).
- The hub's broker configured in the Sofabaton app and reachable from
  this machine; pass --broker (and credentials if the broker needs
  them).
- Hub MAC: auto-derived from the ARP cache after connecting (same
  subnet only); pass --mac to override.

Usage:
    python bench_90_mqtt_vs_http_latency.py <ip> X2 <tag> --broker <host>
        [--broker-port 1883] [--broker-user U] [--broker-pass P]
        [--mac AABBCCDDEEFF] [--trials 40] [--settle 1.5]
        [--listener-port N] [--mqtt-device ID --mqtt-key N]
        [--keep-devices]

--mqtt-device/--mqtt-key reuse an already-deployed wifi_mqtt device
(e.g. the app-created one) instead of restoring a scratch one. Only use
a command that no HA automation is triggered by: activating it
publishes for real.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import subprocess
import sys
import time
import urllib.parse

from bench_common import connect, save_json, setup_logging
from bench_mqtt_client import MiniMqttSubscriber
from bench_wifi_listener import BenchWifiListener, local_ip_toward, pick_port

HA_ACTION_LIBRARY_TYPE = 0x1C
MQTT_LIBRARY_TYPE = 0x20
HTTP_DEVICE_NAME = "Bench Lat HTTP"
MQTT_DEVICE_NAME = "Bench Lat MQTT"
SOURCE_DEVICE_ID = 1
COMMAND_NAME = "Bench Lat"


# ---------------------------------------------------------------- payloads
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


def http_host_payload(host: str, port: int) -> tuple[dict, str]:
    """bench_69/81-shaped wifi_ip HA-action host with a single command."""
    path = f"/launch/ha/{SOURCE_DEVICE_ID}/{urllib.parse.quote(COMMAND_NAME)}/short"
    code = (0x4E20 + 1) & 0xFFFFFFFFFFFF
    payload = {
        "kind": "device_backup",
        "schema_version": 4,
        "ha_action_host": True,
        "device": {
            "device_id": SOURCE_DEVICE_ID,
            "name": HTTP_DEVICE_NAME,
            "brand": "m3-benchwifi-latency",
            "device_class": "wifi_ip",
            "device_class_code": 0x1C,
            "icon": 1,
            "sort": 98,
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
            {
                "command_id": 1,
                "name": COMMAND_NAME,
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
        ],
        "button_bindings": [],
        "macros": [],
    }
    return payload, path


def mqtt_host_payload() -> dict:
    """Build a ``wifi_mqtt`` scratch device from the documented profile.

    data_hex content is ignored by the hub (finding F2); the natural
    (device_id, command_id) pair is written anyway to match what the
    vendor app produces.
    """
    return {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
            "device_id": SOURCE_DEVICE_ID,
            "name": MQTT_DEVICE_NAME,
            "brand": "m3-benchwifi-latency",
            "device_class": "wifi_mqtt",
            "device_class_code": 0x20,
            "icon": 8,
            "sort": 99,
            "code_type": 0x20,
            "device_type": 0x10,
            "code_id_hex": " ".join(["00"] * 16),
            "hide": 0,
            "input_flag": 0,
            "channel": 0,
            "power_state": 0,
            "poll_time": 0,
            "input_mode": 2,
            "power_mode": 1,
            "power_style": 0,
            "share_mode": 0,
            "idle_behavior": 4,
            "tail_marker": 1,
        },
        "commands": [
            {
                "command_id": 1,
                "name": COMMAND_NAME,
                "restore_data": {
                    "transport": "hub_code_record",
                    "library_type": MQTT_LIBRARY_TYPE,
                    "command_code": "00 00 00 00 00 00",
                    "data_hex": f"{SOURCE_DEVICE_ID:02x} 01",
                },
            }
        ],
        "button_bindings": [],
        "macros": [],
    }


# ---------------------------------------------------------------- helpers
checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" - {detail}" if detail else ""))


def arp_mac(ip: str) -> str | None:
    """Hub MAC from the OS ARP cache (works after the TCP connect)."""
    try:
        out = subprocess.run(
            ["arp", "-a", ip], capture_output=True, text=True, timeout=10
        ).stdout
    except (OSError, subprocess.TimeoutExpired):
        return None
    match = re.search(r"([0-9a-fA-F]{2}[-:]){5}[0-9a-fA-F]{2}", out)
    if not match:
        return None
    return re.sub(r"[^0-9a-fA-F]", "", match.group(0)).upper()


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


def wait_http_hit(listener: BenchWifiListener, path: str, timeout: float) -> dict | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        for hit in listener.snapshot():
            if hit.get("path") == path:
                return hit
        time.sleep(0.002)
    return None


def wait_mqtt_hit(sub: MiniMqttSubscriber, device_id: int, timeout: float) -> dict | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        for hit in sub.snapshot():
            if hit.get("retain"):
                continue
            try:
                payload = json.loads(hit.get("payload") or "")
            except ValueError:
                continue
            if isinstance(payload, dict) and int(payload.get("device_id", -1)) == device_id:
                hit = dict(hit)
                hit["parsed"] = payload
                return hit
        time.sleep(0.002)
    return None


def stats(samples: list[float]) -> dict:
    if not samples:
        return {"n": 0}
    ordered = sorted(samples)

    def pct(p: float) -> float:
        if len(ordered) == 1:
            return ordered[0]
        k = (len(ordered) - 1) * p
        lo, hi = int(k), min(int(k) + 1, len(ordered) - 1)
        return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)

    return {
        "n": len(ordered),
        "min_ms": round(ordered[0], 1),
        "p50_ms": round(pct(0.50), 1),
        "mean_ms": round(statistics.fmean(ordered), 1),
        "p95_ms": round(pct(0.95), 1),
        "max_ms": round(ordered[-1], 1),
        "stdev_ms": round(statistics.stdev(ordered), 1) if len(ordered) > 1 else 0.0,
    }


# ---------------------------------------------------------------- main
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("host")
    parser.add_argument("hub_version", choices=["X1", "X1S", "X2"])
    parser.add_argument("tag")
    parser.add_argument("--broker", required=True, help="MQTT broker host the hub publishes to")
    parser.add_argument("--broker-port", type=int, default=1883)
    parser.add_argument("--broker-user")
    parser.add_argument("--broker-pass")
    parser.add_argument("--mac", help="hub MAC (hex, any separators); default: ARP cache")
    parser.add_argument("--trials", type=int, default=40, help="timed rounds per transport")
    parser.add_argument("--settle", type=float, default=1.5, help="seconds between activations")
    parser.add_argument("--timeout", type=float, default=10.0, help="per-activation wait")
    parser.add_argument("--listener-port", type=int, default=None)
    parser.add_argument("--mqtt-device", type=int, default=None,
                        help="existing wifi_mqtt hub device id (skips scratch deploy)")
    parser.add_argument("--mqtt-key", type=int, default=1,
                        help="command/key id to activate on --mqtt-device")
    parser.add_argument("--keep-devices", action="store_true",
                        help="leave scratch devices on the hub")
    args = parser.parse_args()

    if args.hub_version != "X2":
        print("WARNING: wifi_mqtt is X2-only per the transport plan; "
              f"running against {args.hub_version} to gather evidence anyway.")

    log_path = setup_logging(f"mqtt-lat-{args.tag}")
    print(f"logging to {log_path}")

    listener_port = args.listener_port or pick_port()
    bench_ip = local_ip_toward(args.host)
    listener = BenchWifiListener(listener_port, mode="ok").start()
    print(f"HTTP listener on {bench_ip}:{listener_port} mode=ok")

    proxy = connect(args.host, args.hub_version)
    artifacts: dict = {
        "host": args.host,
        "hub_version": args.hub_version,
        "bench_ip": bench_ip,
        "listener_port": listener_port,
        "broker": f"{args.broker}:{args.broker_port}",
        "trials": args.trials,
        "settle_s": args.settle,
        "samples": [],
    }
    mqtt_sub: MiniMqttSubscriber | None = None
    created_ids: list[int] = []
    baseline = None
    try:
        mac = re.sub(r"[^0-9a-fA-F]", "", args.mac).upper() if args.mac else arp_mac(args.host)
        if not mac or len(mac) < 6:
            raise SystemExit("could not derive hub MAC from ARP; pass --mac")
        topics = sorted({f"{mac}/up", f"{mac.lower()}/up"})
        artifacts["mac"] = mac
        artifacts["topics"] = topics
        print(f"hub MAC {mac}; subscribing to {topics}")

        mqtt_sub = MiniMqttSubscriber(
            args.broker,
            args.broker_port,
            username=args.broker_user,
            password=args.broker_pass,
        ).start()
        granted = mqtt_sub.subscribe(topics)
        check("broker subscription granted", all(code != 0x80 for code in granted),
              f"granted={granted}")

        baseline = snapshot_catalog(proxy)
        devs0, acts0 = baseline
        print(f"baseline catalog: {len(devs0)} devices, {len(acts0)} activities")

        # ---------------- deploy scratch devices ----------------
        payload_http, http_path = http_host_payload(bench_ip, listener_port)
        print(f"restoring {HTTP_DEVICE_NAME!r}...")
        result = proxy.restore_device(payload_http)
        check("http scratch restore accepted",
              bool(result) and result.get("status") == "success", f"result={result}")
        if not result or result.get("status") != "success":
            raise SystemExit("http scratch restore failed; stopping")
        http_dev = int(result["device_id"])
        http_key = int((result.get("command_id_map") or {}).get(1) or 1)
        created_ids.append(http_dev)

        if args.mqtt_device is not None:
            mqtt_dev, mqtt_key = args.mqtt_device, args.mqtt_key
            print(f"using existing wifi_mqtt device id {mqtt_dev}, key {mqtt_key}")
        else:
            print(f"restoring {MQTT_DEVICE_NAME!r}...")
            result = proxy.restore_device(mqtt_host_payload())
            check("mqtt scratch restore accepted (partial gate M0.2 evidence)",
                  bool(result) and result.get("status") == "success", f"result={result}")
            if not result or result.get("status") != "success":
                raise SystemExit("mqtt scratch restore failed; stopping")
            mqtt_dev = int(result["device_id"])
            mqtt_key = int((result.get("command_id_map") or {}).get(1) or 1)
            created_ids.append(mqtt_dev)
        artifacts["http_device"] = {"id": http_dev, "key": http_key, "path": http_path}
        artifacts["mqtt_device"] = {"id": mqtt_dev, "key": mqtt_key}

        # ---------------- warmup ----------------
        print("\nwarmup: 2 untimed activations per arm")
        for _ in range(2):
            listener.clear()
            proxy.send_command(http_dev, http_key)
            hit = wait_http_hit(listener, http_path, args.timeout)
            check("warmup: http callback arrived", hit is not None)
            time.sleep(args.settle)
            mqtt_sub.clear()
            proxy.send_command(mqtt_dev, mqtt_key)
            hit = wait_mqtt_hit(mqtt_sub, mqtt_dev, args.timeout)
            check("warmup: mqtt publish arrived", hit is not None,
                  "" if hit else "check broker config on the hub (Sofabaton app) "
                  "and that --broker matches it")
            if hit:
                artifacts.setdefault("mqtt_first_hit", {
                    "topic": hit["topic"], "qos": hit["qos"], "retain": hit["retain"],
                    "payload": hit["payload"],
                })
            time.sleep(args.settle)
        if not any(label.startswith("warmup: mqtt") and ok for label, ok, _ in checks):
            raise SystemExit("mqtt arm never delivered during warmup; aborting trials")

        # ---------------- timed trials ----------------
        print(f"\n{args.trials} rounds, both arms per round, alternating order")
        http_lat: list[float] = []
        mqtt_lat: list[float] = []
        paired: list[float] = []
        mqtt_flags: set[tuple] = set()
        mqtt_key_ids: set[int] = set()
        for round_no in range(args.trials):
            round_result: dict[str, float | None] = {}
            arms = ("http", "mqtt") if round_no % 2 == 0 else ("mqtt", "http")
            for arm in arms:
                if arm == "http":
                    listener.clear()
                    t0 = time.time()
                    sent = proxy.send_command(http_dev, http_key)
                    hit = wait_http_hit(listener, http_path, args.timeout)
                    dt = (hit["at"] - t0) * 1000.0 if hit else None
                    time.sleep(args.settle)
                    extra = len(listener.snapshot()) - (1 if hit else 0)
                else:
                    mqtt_sub.clear()
                    t0 = time.time()
                    sent = proxy.send_command(mqtt_dev, mqtt_key)
                    hit = wait_mqtt_hit(mqtt_sub, mqtt_dev, args.timeout)
                    dt = (hit["at"] - t0) * 1000.0 if hit else None
                    if hit:
                        mqtt_flags.add((hit["qos"], hit["retain"], hit["dup"], hit["topic"]))
                        mqtt_key_ids.add(int(hit["parsed"].get("key_id", -1)))
                    time.sleep(args.settle)
                    extra = len([h for h in mqtt_sub.snapshot() if not h.get("retain")]) \
                        - (1 if hit else 0)
                round_result[arm] = dt
                if dt is not None:
                    (http_lat if arm == "http" else mqtt_lat).append(dt)
                artifacts["samples"].append({
                    "round": round_no, "arm": arm, "sent": sent,
                    "dt_ms": round(dt, 2) if dt is not None else None,
                    "extra_hits_in_settle": extra,
                })
            if round_result.get("http") is not None and round_result.get("mqtt") is not None:
                paired.append(round_result["mqtt"] - round_result["http"])
            if (round_no + 1) % 10 == 0:
                print(f"  round {round_no + 1}/{args.trials}: "
                      f"http {stats(http_lat).get('p50_ms', '-')}ms p50, "
                      f"mqtt {stats(mqtt_lat).get('p50_ms', '-')}ms p50")

        # ---------------- report ----------------
        http_stats = stats(http_lat)
        mqtt_stats = stats(mqtt_lat)
        artifacts["http_stats"] = http_stats
        artifacts["mqtt_stats"] = mqtt_stats
        artifacts["http_misses"] = args.trials - http_stats.get("n", 0)
        artifacts["mqtt_misses"] = args.trials - mqtt_stats.get("n", 0)
        artifacts["paired_diff_ms"] = stats(paired) if paired else {"n": 0}
        artifacts["mqtt_publish_flags"] = [
            {"qos": q, "retain": r, "dup": d, "topic": t} for q, r, d, t in sorted(mqtt_flags)
        ]
        artifacts["mqtt_observed_key_ids"] = sorted(mqtt_key_ids)

        print("\n================ results (ms, activation -> delivery) ================")
        print(f"{'':8}{'n':>4}{'miss':>6}{'min':>8}{'p50':>8}{'mean':>8}{'p95':>8}{'max':>8}{'stdev':>8}")
        for name, st, misses in (
            ("HTTP", http_stats, artifacts["http_misses"]),
            ("MQTT", mqtt_stats, artifacts["mqtt_misses"]),
        ):
            if st.get("n"):
                print(f"{name:8}{st['n']:>4}{misses:>6}{st['min_ms']:>8}{st['p50_ms']:>8}"
                      f"{st['mean_ms']:>8}{st['p95_ms']:>8}{st['max_ms']:>8}{st['stdev_ms']:>8}")
            else:
                print(f"{name:8}   0{misses:>6}  (no deliveries)")
        if paired:
            diff = artifacts["paired_diff_ms"]
            faster = "MQTT" if diff["p50_ms"] < 0 else "HTTP"
            print(f"paired per-round diff (mqtt - http): p50 {diff['p50_ms']}ms, "
                  f"mean {diff['mean_ms']}ms -> {faster} faster at the median "
                  f"by {abs(diff['p50_ms'])}ms")
        if mqtt_flags:
            print(f"mqtt publish flags observed: "
                  + "; ".join(f"qos={q} retain={r} dup={d} topic={t}"
                              for q, r, d, t in sorted(mqtt_flags)))

        # ---------------- cleanup ----------------
        if args.keep_devices:
            print(f"\n--keep-devices: leaving hub device ids {created_ids} in place")
        else:
            for dev_id in created_ids:
                print(f"\ndeleting scratch device 0x{dev_id:02X}...")
                del_result = proxy.delete_device(dev_id)
                check(f"delete_device 0x{dev_id:02X} success",
                      bool(del_result) and del_result.get("status") == "success",
                      f"result={del_result}")
            devs1, acts1 = snapshot_catalog(proxy)
            check("device catalog back at baseline",
                  sorted(devs1) == sorted(devs0),
                  f"before={sorted(devs0)} after={sorted(devs1)}")
            check("activity catalog untouched",
                  sorted(acts1) == sorted(acts0),
                  f"before={sorted(acts0)} after={sorted(acts1)}")
    finally:
        listener.stop()
        if mqtt_sub is not None:
            mqtt_sub.stop()
        artifacts["checks"] = [
            {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
        ]
        path = save_json(f"mqtt-lat-{args.tag}", artifacts)
        print("artifacts saved:", path)
        proxy.stop()
        print("disconnected")

    failed = [c for c in checks if not c[1]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
