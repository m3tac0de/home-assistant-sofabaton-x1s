"""MQTT vs TCP command-send latency benchmark (transport plan M0.9 / v2 gate).

bench_90 measured the *delivery* leg (hub -> HA) and MQTT won. This bench
measures the *send* leg: is publishing a control message to the hub's
broker faster than issuing ``REQ_ACTIVATE`` (0x023F) over the TCP
session? Relevant to the deferred outbound-over-MQTT follow-up
(mqtt-transport-plan.md par. 6b) and to sending while the app owns the
hub's TCP session.

Method
------
- Restore one scratch ``wifi_mqtt`` device (same profile as bench_90).
  It joins no activity and binds no button, so deleting it afterwards
  touches nothing else on the hub. Activating its command has no side
  effect beyond a broker publish that only this bench consumes.
- Subscribe to ``<MAC>/up``. Every activation of the scratch command,
  however triggered, ends in exactly one publish there (bench_90 F3),
  so both arms are timed send -> same echo:

    TCP arm:   t0 -> proxy.send_command(dev, key)          -> /up echo
    MQTT arm:  t0 -> publish device/<MAC>/keys_control     -> /up echo
                     {"data": {"device_id": dev, "key_id": key}}

  The echo tail (hub execute -> broker -> this machine) is identical in
  both arms and cancels in the comparison. The difference isolates
  bench->hub request delivery: TCP frame + hub opcode dispatch vs
  broker round trip + hub MQTT dispatch.
- Arms alternate within each round and which arm goes first alternates
  per round (bench_90 pattern), so drift cancels.

The control topic is the one the vendor's own MQTT integration ships
DISABLED (``device/{mac}/keys_control``, "DEVICE_DISABLED" in their
api.py). Whether the hub honors it at all is unknown -- the warmup
probes topic-case and payload-shape variants and aborts the MQTT arm
with a clear finding if none answers. That outcome alone settles M0.9's
device-scope question.

Caveats to report alongside results
-----------------------------------
- The MQTT arm's echo passes the broker twice (control in, /up out);
  timing the echo still only charges the send leg once because the tail
  is shared, but broker load matters twice in that arm.
- The TCP arm rides the bench harness's sequencer exactly as HA would;
  hub-busy queueing is part of what it honestly measures.
- Absolute numbers include the shared echo tail (~hub->broker->bench);
  only the paired difference is transport-attributable.

Prerequisites
-------------
- X2 hub, nothing else holding its TCP session (disable the HA config
  entry while benching, re-enable after).
- Hub's broker reachable from this machine; pass --broker (+ creds if
  needed). Hub MAC auto-derived from ARP; --mac to override.

Usage:
    python bench_150_mqtt_vs_tcp_send_latency.py <ip> X2 <tag> --broker <host>
        [--broker-port 1883] [--broker-user U] [--broker-pass P]
        [--mac AABBCCDDEEFF] [--trials 40] [--settle 1.5]
        [--mqtt-device ID --mqtt-key N] [--keep-devices]

--mqtt-device/--mqtt-key reuse an already-deployed wifi_mqtt device
instead of restoring a scratch one. Only use a command no HA automation
listens to: both arms activate it for real.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import subprocess
import sys
import time

from bench_common import connect, save_json, setup_logging
from bench_mqtt_client import MiniMqttSubscriber

MQTT_LIBRARY_TYPE = 0x20
MQTT_DEVICE_NAME = "Bench Send MQTT"
SOURCE_DEVICE_ID = 1
COMMAND_NAME = "Bench Send"


def mqtt_host_payload() -> dict:
    """``wifi_mqtt`` scratch device, bench_90's documented profile."""
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


def wait_up_echo(sub: MiniMqttSubscriber, device_id: int, timeout: float) -> dict | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        for hit in sub.snapshot():
            if hit.get("retain"):
                continue
            if not hit.get("topic", "").lower().endswith("/up"):
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
    parser.add_argument("--broker", required=True, help="MQTT broker host the hub uses")
    parser.add_argument("--broker-port", type=int, default=1883)
    parser.add_argument("--broker-user")
    parser.add_argument("--broker-pass")
    parser.add_argument("--mac", help="hub MAC (hex, any separators); default: ARP cache")
    parser.add_argument("--trials", type=int, default=40, help="timed rounds per transport")
    parser.add_argument("--settle", type=float, default=1.5, help="seconds between activations")
    parser.add_argument("--timeout", type=float, default=10.0, help="per-activation wait")
    parser.add_argument("--probe-timeout", type=float, default=5.0,
                        help="per-variant wait while probing the control topic")
    parser.add_argument("--mqtt-device", type=int, default=None,
                        help="existing wifi_mqtt hub device id (skips scratch deploy)")
    parser.add_argument("--mqtt-key", type=int, default=1,
                        help="command/key id to activate on --mqtt-device")
    parser.add_argument("--keep-devices", action="store_true",
                        help="leave the scratch device on the hub")
    args = parser.parse_args()

    if args.hub_version != "X2":
        print("WARNING: wifi_mqtt is X2-only per the transport plan; "
              f"running against {args.hub_version} to gather evidence anyway.")

    log_path = setup_logging(f"mqtt-send-{args.tag}")
    print(f"logging to {log_path}")

    proxy = connect(args.host, args.hub_version)
    artifacts: dict = {
        "host": args.host,
        "hub_version": args.hub_version,
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
        up_topics = sorted({f"{mac}/up", f"{mac.lower()}/up"})
        artifacts["mac"] = mac
        artifacts["up_topics"] = up_topics
        print(f"hub MAC {mac}; subscribing to {up_topics}")

        mqtt_sub = MiniMqttSubscriber(
            args.broker,
            args.broker_port,
            username=args.broker_user,
            password=args.broker_pass,
        ).start()
        granted = mqtt_sub.subscribe(up_topics)
        check("broker subscription granted", all(code != 0x80 for code in granted),
              f"granted={granted}")

        baseline = snapshot_catalog(proxy)
        devs0, acts0 = baseline
        print(f"baseline catalog: {len(devs0)} devices, {len(acts0)} activities")

        # ---------------- scratch device ----------------
        if args.mqtt_device is not None:
            mqtt_dev, mqtt_key = args.mqtt_device, args.mqtt_key
            print(f"using existing wifi_mqtt device id {mqtt_dev}, key {mqtt_key}")
        else:
            print(f"restoring {MQTT_DEVICE_NAME!r}...")
            result = proxy.restore_device(mqtt_host_payload())
            check("mqtt scratch restore accepted",
                  bool(result) and result.get("status") == "success", f"result={result}")
            if not result or result.get("status") != "success":
                raise SystemExit("mqtt scratch restore failed; stopping")
            mqtt_dev = int(result["device_id"])
            mqtt_key = int((result.get("command_id_map") or {}).get(1) or 1)
            created_ids.append(mqtt_dev)
        artifacts["mqtt_device"] = {"id": mqtt_dev, "key": mqtt_key}

        # ---------------- warmup: TCP arm ----------------
        print("\nwarmup: TCP REQ_ACTIVATE -> /up echo")
        tcp_ok = False
        for _ in range(2):
            mqtt_sub.clear()
            proxy.send_command(mqtt_dev, mqtt_key)
            hit = wait_up_echo(mqtt_sub, mqtt_dev, args.timeout)
            tcp_ok = tcp_ok or hit is not None
            time.sleep(args.settle)
        check("warmup: tcp activation echoed on /up", tcp_ok,
              "" if tcp_ok else "check broker config on the hub (Sofabaton app) "
              "and that --broker matches it")
        if not tcp_ok:
            raise SystemExit("no /up echo for TCP activation; nothing to measure against")

        # ---------------- warmup: probe the MQTT control topic ----------------
        # The vendor integration ships device-scope control disabled; probe
        # topic-case and payload-shape variants until one makes the hub
        # execute (visible as the /up echo).
        vendor_payload = json.dumps({"data": {"device_id": mqtt_dev, "key_id": mqtt_key}})
        bare_payload = json.dumps({"device_id": mqtt_dev, "key_id": mqtt_key})
        variants = [
            (f"device/{mac}/keys_control", vendor_payload),
            (f"device/{mac.lower()}/keys_control", vendor_payload),
            (f"device/{mac}/keys_control", bare_payload),
            (f"device/{mac.lower()}/keys_control", bare_payload),
        ]
        print("\nwarmup: probing device/<mac>/keys_control variants")
        control: tuple[str, str] | None = None
        probes = []
        for topic, payload in variants:
            mqtt_sub.clear()
            mqtt_sub.publish(topic, payload)
            hit = wait_up_echo(mqtt_sub, mqtt_dev, args.probe_timeout)
            probes.append({"topic": topic, "payload": payload, "echoed": hit is not None})
            print(f"  {'HIT ' if hit else 'no  '} {topic}  {payload}")
            time.sleep(args.settle)
            if hit:
                control = (topic, payload)
                break
        artifacts["control_probes"] = probes
        check("hub honors device-scope keys_control (M0.9 device question)",
              control is not None,
              f"working variant: {control}" if control else
              "no variant executed; device-scope control appears dead hub-side, "
              "matching the vendor's DEVICE_DISABLED state")
        if control is None:
            artifacts["finding"] = (
                "device/<mac>/keys_control did not trigger execution under any "
                "probed variant; MQTT send arm not measurable via device scope"
            )
            raise SystemExit("MQTT control arm unavailable; see artifacts for the finding")
        control_topic, control_payload = control
        artifacts["control_topic"] = control_topic
        artifacts["control_payload"] = control_payload
        # one extra untimed MQTT round so both arms enter trials equally warm
        mqtt_sub.clear()
        mqtt_sub.publish(control_topic, control_payload)
        wait_up_echo(mqtt_sub, mqtt_dev, args.timeout)
        time.sleep(args.settle)

        # ---------------- timed trials ----------------
        print(f"\n{args.trials} rounds, both arms per round, alternating order")
        tcp_lat: list[float] = []
        mqtt_lat: list[float] = []
        paired: list[float] = []
        for round_no in range(args.trials):
            round_result: dict[str, float | None] = {}
            arms = ("tcp", "mqtt") if round_no % 2 == 0 else ("mqtt", "tcp")
            for arm in arms:
                mqtt_sub.clear()
                if arm == "tcp":
                    t0 = time.time()
                    sent = proxy.send_command(mqtt_dev, mqtt_key)
                else:
                    t0 = mqtt_sub.publish(control_topic, control_payload)
                    sent = True
                hit = wait_up_echo(mqtt_sub, mqtt_dev, args.timeout)
                dt = (hit["at"] - t0) * 1000.0 if hit else None
                time.sleep(args.settle)
                echoes = [h for h in mqtt_sub.snapshot()
                          if not h.get("retain") and h.get("topic", "").lower().endswith("/up")]
                extra = len(echoes) - (1 if hit else 0)
                round_result[arm] = dt
                if dt is not None:
                    (tcp_lat if arm == "tcp" else mqtt_lat).append(dt)
                artifacts["samples"].append({
                    "round": round_no, "arm": arm, "sent": sent,
                    "dt_ms": round(dt, 2) if dt is not None else None,
                    "extra_echoes_in_settle": extra,
                })
            if round_result.get("tcp") is not None and round_result.get("mqtt") is not None:
                paired.append(round_result["mqtt"] - round_result["tcp"])
            if (round_no + 1) % 10 == 0:
                print(f"  round {round_no + 1}/{args.trials}: "
                      f"tcp {stats(tcp_lat).get('p50_ms', '-')}ms p50, "
                      f"mqtt {stats(mqtt_lat).get('p50_ms', '-')}ms p50")

        # ---------------- report ----------------
        tcp_stats = stats(tcp_lat)
        mqtt_stats = stats(mqtt_lat)
        artifacts["tcp_stats"] = tcp_stats
        artifacts["mqtt_stats"] = mqtt_stats
        artifacts["tcp_misses"] = args.trials - tcp_stats.get("n", 0)
        artifacts["mqtt_misses"] = args.trials - mqtt_stats.get("n", 0)
        artifacts["paired_diff_ms"] = stats(paired) if paired else {"n": 0}

        print("\n================ results (ms, send -> /up echo) ================")
        print(f"{'':10}{'n':>4}{'miss':>6}{'min':>8}{'p50':>8}{'mean':>8}{'p95':>8}{'max':>8}{'stdev':>8}")
        for name, st, misses in (
            ("TCP", tcp_stats, artifacts["tcp_misses"]),
            ("MQTT", mqtt_stats, artifacts["mqtt_misses"]),
        ):
            if st.get("n"):
                print(f"{name:10}{st['n']:>4}{misses:>6}{st['min_ms']:>8}{st['p50_ms']:>8}"
                      f"{st['mean_ms']:>8}{st['p95_ms']:>8}{st['max_ms']:>8}{st['stdev_ms']:>8}")
            else:
                print(f"{name:10}   0{misses:>6}  (no deliveries)")
        if paired:
            diff = artifacts["paired_diff_ms"]
            faster = "MQTT" if diff["p50_ms"] < 0 else "TCP"
            print(f"paired per-round diff (mqtt - tcp): p50 {diff['p50_ms']}ms, "
                  f"mean {diff['mean_ms']}ms -> {faster} send faster at the median "
                  f"by {abs(diff['p50_ms'])}ms")

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
        if mqtt_sub is not None:
            mqtt_sub.stop()
        artifacts["checks"] = [
            {"label": label, "ok": ok, "detail": detail} for label, ok, detail in checks
        ]
        path = save_json(f"mqtt-send-{args.tag}", artifacts)
        print("artifacts saved:", path)
        proxy.stop()
        print("disconnected")

    failed = [c for c in checks if not c[1]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
