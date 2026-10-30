"""bench_336: is a Wifi Device create refused because of the remote sync, or
because the hub is still busy with the previous create? (2026-10-27)

bench_335 saw a second Wifi Device create refused (STATUS_ACK 0x04 on a
command record) ~2 s after the first create's full remote sync was sent.
Three tests, on the facade directly (so the remote sync can be withheld),
scratch Wifi Devices only ("Bench AB ..."), each from an idle hub:

  A. two creates back to back, NO remote sync before or between them;
  B. a remote-sync trigger alone, then one create at once (no other write first);
  C. a create with its normal remote sync, 90 s pause, a second create.

Usage (expendable hubs only; the hub's HA entry must be disabled first):
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_336_sync_ab.py <x1s|x1>

Writes out/bench_336_<hub>.json and the engine's debug log under out/logs/.
"""

from __future__ import annotations

import asyncio
import json
import logging
import socket
import sys
import time

import bench_common  # noqa: F401  (out/ dirs, logging setup)

from sofabaton import AsyncXProxy, HubConfig, WifiDeviceSpec, WifiSlotSpec

HOSTS = {"x1s": "192.168.2.151", "x1": "192.168.2.105"}
HUB = sys.argv[1].lower() if len(sys.argv) > 1 else ""
if HUB not in HOSTS:
    raise SystemExit("usage: bench_336_sync_ab.py <x1s|x1>")
HOST = HOSTS[HUB]
PREFIX = "Bench AB "
PAUSE_S = 90
IDLE_S = 20

LOG_FILE = bench_common.LOG_DIR / f"bench_336_{HUB}-engine.log"
handler = logging.FileHandler(LOG_FILE, mode="w", encoding="utf-8")
handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
root = logging.getLogger()
root.handlers = [handler]
root.setLevel(logging.DEBUG)

REPORT: dict = {"hub": HUB, "rows": []}
T0 = time.monotonic()
LAST_SYNC: list[float] = []


def note(**row) -> None:
    row = {"t": round(time.monotonic() - T0, 1), **row}
    REPORT["rows"].append(row)
    print(json.dumps(row), flush=True)
    logging.getLogger("bench").info("NOTE %s", json.dumps(row))


def local_ip() -> str:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        s.connect((HOST, 8102))
        return s.getsockname()[0]


async def create(proxy: AsyncXProxy, label: str, ip: str) -> int | None:
    since = round(time.monotonic() - LAST_SYNC[-1], 1) if LAST_SYNC else None
    started = time.monotonic()
    try:
        dep = await proxy.deploy_wifi_device(WifiDeviceSpec(name=f"{PREFIX}{label}", slots=(WifiSlotSpec("AB"),)),
                                             host=ip, port=8060)
        note(test=label, create="ok", device_id=dep.device_id, s_since_sync_trigger=since,
             took_s=round(time.monotonic() - started, 1))
        return dep.device_id
    except Exception as err:  # noqa: BLE001
        note(test=label, create="REFUSED", error=f"{type(err).__name__}: {err}", s_since_sync_trigger=since,
             took_s=round(time.monotonic() - started, 1))
        return None


async def trigger_sync(proxy: AsyncXProxy, why: str) -> None:
    ok = await proxy.run(proxy._proxy.resync_remote)
    LAST_SYNC.append(time.monotonic())
    note(event="remote sync trigger", why=why, sent=bool(ok))


async def scratch_ids(proxy: AsyncXProxy) -> list[int]:
    return [d.device_id for d in await proxy.devices(refresh=True) if str(d.name or "").startswith(PREFIX)]


async def remove_all(proxy: AsyncXProxy, *, sync: bool) -> None:
    ids = await scratch_ids(proxy)
    async with proxy.batch_writes(send_remote_sync=sync):
        for dev_id in ids:
            try:
                await proxy.remove_device(dev_id)
                note(event="removed", device_id=dev_id)
            except Exception as err:  # noqa: BLE001
                note(event="remove failed", device_id=dev_id, error=str(err))
    if sync:
        LAST_SYNC.append(time.monotonic())


async def main() -> int:
    ip = local_ip()
    proxy = AsyncXProxy.from_config(HubConfig(host=HOST, proxy_enabled=False))
    await proxy.start()
    try:
        if not await proxy.wait_until_controllable(timeout=120):
            note(event="hub never controllable")
            return 1
        await proxy.devices()
        await proxy.activities()
        note(event="ready", version=(await proxy.status()).hub_version, callback_host=ip,
             wifi=[(d.device_id, d.name) for d in await proxy.devices() if str(d.device_class or "").startswith("wifi")])
        if await scratch_ids(proxy):
            await remove_all(proxy, sync=False)
        await asyncio.sleep(IDLE_S)

        # A. two creates back to back, no remote sync anywhere
        note(event="TEST A: two creates, no remote sync")
        async with proxy.batch_writes(send_remote_sync=False):
            await create(proxy, "A1", ip)
            await create(proxy, "A2", ip)
        await asyncio.sleep(IDLE_S)
        await remove_all(proxy, sync=False)
        await asyncio.sleep(IDLE_S)

        # B. a remote-sync trigger alone, then one create at once
        note(event="TEST B: sync trigger, then one create")
        await trigger_sync(proxy, "test B")
        async with proxy.batch_writes(send_remote_sync=False):
            await create(proxy, "B1", ip)
        await asyncio.sleep(PAUSE_S)
        await remove_all(proxy, sync=False)
        await asyncio.sleep(IDLE_S)

        # C. a create with its normal sync, 90 s pause, a second create
        note(event="TEST C: create with its sync, 90 s, create")
        await create(proxy, "C1", ip)
        LAST_SYNC.append(time.monotonic())
        await asyncio.sleep(PAUSE_S)
        await create(proxy, "C2", ip)
        LAST_SYNC.append(time.monotonic())
        await asyncio.sleep(PAUSE_S)
    finally:
        try:
            # One batch, one full sync at the end: the remote ends up with the hub's own list.
            await remove_all(proxy, sync=True)
            note(event="left", scratch=await scratch_ids(proxy))
        finally:
            await proxy.stop(release_hub=True)
            (bench_common.BENCH_DIR / f"bench_336_{HUB}.json").write_text(json.dumps(REPORT, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
