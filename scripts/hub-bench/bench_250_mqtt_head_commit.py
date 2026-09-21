"""What does a callback-class head do to a wifi_mqtt device? (X2, live)

Until 2026-09-21 the in-place head commit rebuilt every managed Wifi
Device's head with ``_build_wifi_device_payload`` (code type 0x1C on an
X1S/X2). A ``wifi_mqtt`` device carries code type 0x20. This bench answers,
on a real X2 and a sacrificial device the caller names, whether that
rewrite stops the hub publishing the device's presses:

1. baseline: perform a command, expect ``{"device_id", "key_id"}`` on
   ``<MAC>/up``;
2. write the head exactly as the OLD commit did, read it back, perform the
   command again;
3. write the ORIGINAL head back, read it back, perform the command again.

Run (nothing else may hold the hub):

    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_250_mqtt_head_commit.py ^
        192.168.2.123 X2 mq250 --device 1 --broker 192.168.2.77 --broker-user test --broker-pass-file <file>

The device is left with its original head; deleting it is the caller's.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import replace
from pathlib import Path

import bench_common  # noqa: F401  (loads the lib under the x1slib alias)
from x1slib import AsyncXProxy, HubConfig  # noqa: E402
from x1slib import devices as devices_mod  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "sofabaton-x-server" / "src"))
from sofabaton_server.mqtt_client import MqttSubscriber  # noqa: E402

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("host")
ap.add_argument("hub_version", choices=["X2"])
ap.add_argument("tag")
ap.add_argument("--device", type=int, required=True, help="the sacrificial wifi_mqtt device id")
ap.add_argument("--command", type=int, default=1)
ap.add_argument("--broker", required=True)
ap.add_argument("--broker-port", type=int, default=1883)
ap.add_argument("--broker-user")
ap.add_argument("--broker-pass-file", type=Path)
ARGS = ap.parse_args()

REPORT: dict = {"bench": "bench_250_mqtt_head_commit", "tag": ARGS.tag, "host": ARGS.host, "device": ARGS.device,
                "steps": [], "problems": []}


def step(name: str, **fields) -> None:
    REPORT["steps"].append({"step": name, **fields})
    print(f"[{name}] " + ", ".join(f"{k}={v}" for k, v in fields.items()))


async def main() -> None:
    password = ARGS.broker_pass_file.read_text(encoding="utf-8").splitlines()[0] if ARGS.broker_pass_file else None
    proxy = AsyncXProxy.from_config(HubConfig(host=ARGS.host, hub_version=ARGS.hub_version, proxy_enabled=False, source="manual"))
    engine = proxy._proxy  # noqa: SLF001  bench-only: the old head write is an engine-internal step
    dev = ARGS.device & 0xFF
    publishes: list[dict] = []

    async with proxy:
        if not await proxy.wait_connected(timeout=60) or not await proxy.wait_until_ready(timeout=60):
            REPORT["problems"].append("hub never became ready")
            return
        info = await proxy.hub_info()
        topic = f"{''.join(ch for ch in str(info.mac).upper() if ch.isalnum())}/up"
        step("hub", mac=info.mac, topic=topic, mode=(await proxy.status()).mode)

        def on_message(t: str, payload: bytes, retain: bool) -> None:
            try:
                data = json.loads(payload.decode("utf-8"))
            except ValueError:
                return
            publishes.append({"at": time.monotonic(), "retain": retain, **data})

        mqtt = MqttSubscriber(host=ARGS.broker, port=ARGS.broker_port, username=ARGS.broker_user, password=password,
                              on_message=on_message)
        await mqtt.set_topics({topic})
        for _ in range(100):
            if mqtt.connected:
                break
            await asyncio.sleep(0.1)
        step("broker", connected=mqtt.connected, error=mqtt.state().last_error)
        if not mqtt.connected:
            REPORT["problems"].append("broker not reachable")
            return
        await asyncio.sleep(1.0)

        async def head() -> devices_mod.DeviceConfig:
            await proxy.refresh(device_id=dev)
            raw = engine.state.entities("device").get(dev, {}).get("raw_body")
            return devices_mod.parse_device_record(bytes(raw), hub_version=ARGS.hub_version, entity_kind="device")

        async def press(label: str) -> bool:
            before = len(publishes)
            ok = await proxy.send(dev, ARGS.command)
            deadline = time.monotonic() + 8.0
            while time.monotonic() < deadline:
                hits = [p for p in publishes[before:] if int(p.get("device_id", -1)) == dev]
                if hits:
                    step(label, sent=ok, published=True, key_id=hits[0].get("key_id"))
                    return True
                await asyncio.sleep(0.1)
            step(label, sent=ok, published=False)
            return False

        def write_head(payload: bytes, name: str) -> bool:
            engine.reset_ack_queues()
            result = engine._send_step(step_name=name, family=0x08, payload=payload,  # noqa: SLF001
                                       ack_opcode=bench_common_ack(), timeout=5.0)
            return bool(result.ok)

        original = await head()
        step("original_head", device_name=original.name, brand=original.brand, code_type=hex(original.code_type), icon=original.icon,
             input_mode=original.input_mode, power=(original.power_mode, original.power_style, original.tail_marker))
        if original.code_type != 0x20:
            REPORT["problems"].append(f"device {dev} is not a wifi_mqtt device (code type {original.code_type:#x}); refusing")
            return
        REPORT["baseline_publishes"] = await press("press_baseline")

        # -- exactly what the old commit wrote ------------------------------------------------------
        old_body = engine._build_wifi_device_payload(  # noqa: SLF001
            device_name=original.name, ip_address=engine.get_routed_local_ip(), state_byte=0x01, device_id=dev,
            ip_device=True, brand_name=original.brand,
            wifi_power_state=(original.power_mode, original.power_style, original.tail_marker))
        ok = await proxy.run(write_head, old_body, "bench250-old-head")
        rewritten = await head()
        step("old_head_written", acked=ok, code_type=hex(rewritten.code_type), icon=rewritten.icon, input_mode=rewritten.input_mode)
        REPORT["publishes_with_callback_head"] = await press("press_with_callback_head")
        await asyncio.sleep(1.0)
        REPORT["publishes_with_callback_head_again"] = await press("press_with_callback_head_again")

        # -- and back -------------------------------------------------------------------------------------
        restore_body = devices_mod.build_device_create_payload(replace(original, device_id=dev), hub_version=ARGS.hub_version)
        ok = await proxy.run(write_head, restore_body, "bench250-restore-head")
        restored = await head()
        step("original_head_restored", acked=ok, code_type=hex(restored.code_type), icon=restored.icon)
        if restored.code_type != 0x20:
            REPORT["problems"].append("the original head did not come back")
        REPORT["publishes_after_restore"] = await press("press_after_restore")
        await mqtt.stop()


def bench_common_ack() -> int:
    from x1slib.device_create import ACK_OPCODE_STATUS  # noqa: E402
    return ACK_OPCODE_STATUS


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        out = bench_common.BENCH_DIR / f"bench_250_{ARGS.tag}.json"
        out.write_text(json.dumps(REPORT, indent=2, default=str), encoding="utf-8")
        print("problems:", REPORT["problems"] or "none")
        print("report:", out)
