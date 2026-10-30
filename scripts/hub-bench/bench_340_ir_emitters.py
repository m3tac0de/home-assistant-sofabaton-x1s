"""bench_340: IR emitter routing writes through the library (IR1) on the X2.

Plan: docs/internal/ir-emitter-pill-plan.md, IR1 bench. The X2 is production:
one sandbox IR device, "J IR Route", is created, routed, and deleted; nothing
else is written. The HA entry is off for the run (the hub takes one client).

    ha status|off|on    the X2's Home Assistant entry; end with `ha on`
    run --go            create J IR Route (expect the new default 00 00 07),
                        then route it through sync_device: built-in, port 1,
                        port 2, remote 1 only, and straight back to all (a
                        write right after a remote-routing write, while the
                        hub updates the remote by itself); each read back from
                        the record and from Device.emitters. Then one refused
                        routing (no emitter), which must write nothing. The
                        device is deleted and the real catalog compared.
    cleanup --go        delete a J IR Route left by an interrupted run

Run from the repo root:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_340_ir_emitters.py run --go

Report: scripts/hub-bench/out/bench_340_<command>_<tag>.json (+ frame log).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time

from bench_common import save_json, setup_logging

from x1slib import AsyncXProxy, EmitterRouting, HubConfig, edits  # noqa: E402

DEVICE_NAME = "J IR Route"
SANDBOX_PREFIX = "J "

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("command", choices=["ha", "run", "cleanup"])
ap.add_argument("args", nargs="*")
ap.add_argument("--tag", default=time.strftime("%m%d-%H%M"))
ap.add_argument("--host", default="192.168.2.123", help="the X2's address")
ap.add_argument("--ha-entry", default="Sofabaton X2 (", help="title substring of the X2's HA entry")
ap.add_argument("--no-ha-check", action="store_true")
ap.add_argument("--go", action="store_true", help="Marcel's go-ahead for a run that writes")
ARGS = ap.parse_args()
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

REPORT: dict = {"bench": "bench_340", "command": ARGS.command, "tag": ARGS.tag, "host": ARGS.host,
                "started": time.strftime("%Y-%m-%d %H:%M:%S"), "checks": [], "steps": [], "problems": []}


def wallclock() -> str:
    return time.strftime("%H:%M:%S")


def step(name: str, /, **fields) -> None:
    REPORT["steps"].append({"step": name, "wall": wallclock(), **fields})
    print(f"[{wallclock()}] {name}: " + ", ".join(f"{k}={v}" for k, v in fields.items()), flush=True)


def check(label: str, ok: bool, detail: object = "") -> bool:
    REPORT["checks"].append({"label": label, "ok": bool(ok), "detail": str(detail)})
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail != "" else ""), flush=True)
    return bool(ok)


def problem(text: str) -> None:
    REPORT["problems"].append(text)
    print(f"PROBLEM: {text}", flush=True)


# -- Home Assistant entry (same guard as bench_339) ------------------------------------------

def _ha_rows(action: str | None = None) -> list[dict]:
    import ssl  # noqa: PLC0415

    import ha_entry  # noqa: PLC0415
    import websockets  # noqa: PLC0415

    async def run() -> list[dict]:
        ctx = ssl.create_default_context() if ha_entry.BASE.startswith("wss://") else None
        async with websockets.connect(ha_entry.BASE, ssl=ctx, max_size=8 * 1024 * 1024) as ws:
            await ws.recv()
            await ws.send(json.dumps({"type": "auth", "access_token": ha_entry.TOKEN}))
            if json.loads(await ws.recv()).get("type") != "auth_ok":
                raise RuntimeError("HA refused the token")
            get = {"type": "config_entries/get", "domain": "sofabaton_x1s"}
            rows = (await ha_entry._call(ws, 1, get)).get("result") or []
            if action in ("off", "on"):
                mine = [r for r in rows if ARGS.ha_entry.lower() in str(r.get("title", "")).lower()]
                if len(mine) != 1:
                    raise RuntimeError(f"need exactly one entry matching {ARGS.ha_entry!r}")
                await ha_entry._call(ws, 2, {"type": "config_entries/disable", "entry_id": mine[0]["entry_id"],
                                             "disabled_by": "user" if action == "off" else None})
                await asyncio.sleep(2.0)
                rows = (await ha_entry._call(ws, 3, get)).get("result") or []
            return rows

    return asyncio.run(run())


def ha_command(action: str) -> int:
    rows = _ha_rows(action if action in ("off", "on") else None)
    for row in rows:
        print(f"  {row.get('title')!r:32} state={row.get('state')} disabled_by={row.get('disabled_by')}")
    if action == "on":
        still_off = [row.get("title") for row in rows if row.get("disabled_by")]
        if still_off:
            print(f"NOT DONE: still disabled: {still_off}")
            return 1
        print("every sofabaton_x1s entry is enabled again")
    return 0


def require_hub_free() -> None:
    if ARGS.no_ha_check:
        return
    rows = _ha_rows()
    mine = [r for r in rows if ARGS.ha_entry.lower() in str(r.get("title", "")).lower()]
    if len(mine) != 1 or not mine[0].get("disabled_by"):
        sys.exit("the X2's HA entry must be disabled first: run `ha off`")


# -- helpers ---------------------------------------------------------------------------------------

def device_block(bundle: dict, device_id: int) -> dict | None:
    for entry in bundle.get("devices") or []:
        if int((entry.get("device") or {}).get("device_id") or 0) == device_id:
            return entry
    return None


def extras_of(bundle: dict, device_id: int) -> tuple[int, int, int] | None:
    entry = device_block(bundle, device_id) or {}
    extras = (entry.get("device") or {}).get("extras")
    if not isinstance(extras, dict):
        return None
    return int(extras.get("a", 0)), int(extras.get("b", 0)), int(extras.get("c", 0))


def real_view(devices, activities) -> dict:
    return {"devices": [[d.device_id, d.name] for d in devices if not d.name.startswith(SANDBOX_PREFIX)],
            "activities": [[a.activity_id, a.name] for a in activities if not a.name.startswith(SANDBOX_PREFIX)]}


async def read_back(proxy, dev: int, label: str, expected: tuple[int, int, int]) -> None:
    snap = await proxy.refresh(device_id=dev)
    check(f"{label}: record holds {bytes(expected).hex(' ')}", extras_of(snap.bundle, dev) == expected,
          extras_of(snap.bundle, dev))
    row = next((d for d in await proxy.devices(refresh=True) if d.device_id == dev), None)
    check(f"{label}: Device.emitters", row is not None and row.emitters == expected, row and row.emitters)
    check(f"{label}: name kept", row is not None and row.name == DEVICE_NAME, row and row.name)


async def route(proxy, dev: int, label: str, change) -> object:
    snap = await proxy.refresh(device_id=dev)
    current = EmitterRouting.from_bytes(bytes(extras_of(snap.bundle, dev) or (0, 0, 0)))
    wanted = change(current)
    edited = edits.set_device_emitters(snap.bundle, dev, wanted)
    started = time.monotonic()
    result = await proxy.sync_device(baseline=snap.bundle, edited=edited, device_id=dev,
                                     snapshot_id=snap.snapshot_id)
    step(f"sync_{label}", status=result.status, failed_at=result.failed_at, message=result.message,
         steps=f"{result.completed_steps}/{result.total_steps}", seconds=round(time.monotonic() - started, 1),
         routing=wanted.to_dict())
    return result, wanted


async def find_sandbox(proxy) -> list[int]:
    return [d.device_id for d in await proxy.devices(refresh=True) if d.name == DEVICE_NAME]


# -- commands ------------------------------------------------------------------------------------

async def run(proxy) -> None:
    if await find_sandbox(proxy):
        problem(f"{DEVICE_NAME} already exists: run `cleanup --go` first")
        return
    before = real_view(await proxy.devices(refresh=True), await proxy.activities(refresh=True))
    dev = await proxy.add_device(DEVICE_NAME, "ir")
    step("created", device_id=dev)
    try:
        await read_back(proxy, dev, "create default", (0, 0, 0x07))
        for label, change, expected in (
            ("builtin", lambda r: r.with_hub("builtin"), (0, 0, 0x01)),
            ("port1", lambda r: r.with_hub("port1"), (0, 0, 0x02)),
            ("port2", lambda r: r.with_hub("port2"), (0, 0, 0x04)),
            ("remote1_only", lambda r: r.with_hub("none").with_remote(1, True), (0, 0, 0x08)),
        ):
            result, _wanted = await route(proxy, dev, label, change)
            if check(f"{label}: sync succeeded", result.status == "success", result.message):
                await read_back(proxy, dev, label, expected)
        # Straight back to all, without waiting for the hub's own remote update.
        result, _wanted = await route(proxy, dev, "back_to_all",
                                      lambda r: r.with_remote(1, False).with_hub("all"))
        check("a write right after a remote-routing write is accepted", result.status == "success",
              f"{result.failed_at}: {result.message}")
        if result.status != "success":
            await asyncio.sleep(30.0)
            result, _wanted = await route(proxy, dev, "back_to_all_retry",
                                          lambda r: r.with_remote(1, False).with_hub("all"))
            check("back to all after a 30 s wait", result.status == "success", result.message)
        await read_back(proxy, dev, "back to all", (0, 0, 0x07))
        # A refused routing writes nothing.
        refused = None
        try:
            refused, _wanted = await route(proxy, dev, "no_emitter", lambda r: r.with_hub("none"))
        except Exception as err:  # noqa: BLE001 - a raise is a refusal too
            step("no_emitter_raised", error=type(err).__name__, message=str(err))
        check("no emitter is refused", refused is None or refused.status != "success",
              refused and refused.message)
        await read_back(proxy, dev, "after the refusal", (0, 0, 0x07))
    finally:
        async with proxy.batch_writes():
            await proxy.remove_device(dev)
        step("deleted", device_id=dev)
        after = real_view(await proxy.devices(refresh=True), await proxy.activities(refresh=True))
        check("real catalog unchanged", after == before, f"before={before} after={after}" if after != before else "")
        check("sandbox device gone", not await find_sandbox(proxy))


async def cleanup(proxy) -> None:
    for dev in await find_sandbox(proxy):
        async with proxy.batch_writes():
            await proxy.remove_device(dev)
        step("deleted", device_id=dev)
    check("sandbox device gone", not await find_sandbox(proxy))


async def facade_session(label: str, body) -> None:
    log_path = setup_logging(f"bench_340-{label}-{ARGS.tag}")
    print(f"logging to {log_path}", flush=True)
    proxy = AsyncXProxy.from_config(
        HubConfig(host=ARGS.host, hub_version="X2", proxy_enabled=False, source="manual"),
        diag_dump=True, diag_parse=True,
    )
    async with proxy:
        if not await proxy.wait_connected(timeout=60) or not await proxy.wait_until_ready(timeout=90):
            problem("the hub did not become ready")
            return
        if (await proxy.status()).mode != "control" or proxy.sync.hub_version != "X2":
            problem("expected an X2 in control mode")
            return
        await body(proxy)


def main() -> int:
    command = ARGS.command
    if command == "ha":
        return ha_command(ARGS.args[0] if ARGS.args else "status")
    if not ARGS.go:
        sys.exit(f"{command} writes to the X2: rerun with --go once Marcel agrees")
    require_hub_free()
    try:
        asyncio.run(facade_session(command, run if command == "run" else cleanup))
    finally:
        REPORT["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
        print("saved:", save_json(f"bench_340_{command}_{ARGS.tag}", REPORT), flush=True)
        failed = [c["label"] for c in REPORT["checks"] if not c["ok"]]
        print(f"\n{len(REPORT['checks']) - len(failed)}/{len(REPORT['checks'])} checks OK"
              + (f"; FAILED: {failed}" if failed else ""), flush=True)
        print("REMINDER: the X2's HA entry stays disabled until `ha on`.", flush=True)
    return 1 if (REPORT["problems"] or any(not c["ok"] for c in REPORT["checks"])) else 0


if __name__ == "__main__":
    sys.exit(main())
