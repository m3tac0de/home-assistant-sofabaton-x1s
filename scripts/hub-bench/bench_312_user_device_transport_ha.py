"""A PRODUCTION user Wifi Device switches delivery and back, through the live
HA instance, with the strict before/after comparison of bench_310/311
(quick-access order and power sequences literal). Default: "Streamers" on
the X2 (five favorites among other devices' favorites in "Watch a movie",
the case bench_310's lone scratch device could not cover).

No command is pressed: the device's commands carry real Actions.

Usage:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_312_user_device_transport_ha.py [device_key]
"""

from __future__ import annotations

import asyncio
import json
import sys
import time

import bench_310_transport_switch_ha as b
import bench_311_events_transport_ha as e

DEVICE_KEY = sys.argv[1] if len(sys.argv) > 1 else "9de0b654"
check = b.check
note = b.note


async def device_row(ws: b.HaWs) -> dict:
    result = await ws.cmd({"type": "sofabaton_x1s/command_devices/list", "entry_id": b.ENTRY})
    for dev in result.get("devices") or []:
        if dev.get("device_key") == DEVICE_KEY:
            return dev
    raise SystemExit(f"device {DEVICE_KEY} not in the store")


async def switch_to(ws: b.HaWs, target: str, *, before_refs: dict[int, dict], before_dev: int, name: str) -> int:
    print(f"\n== switch {name!r} to {target.upper()} ==")
    row = await ws.cmd({"type": "sofabaton_x1s/command_config/set_transport", "entry_id": b.ENTRY, "device_key": DEVICE_KEY, "transport": target})
    check(f"set_transport({target}) marks the switch pending", bool(row.get("transport_switch_pending")) and bool(row.get("sync_needed")),
          f"requested={row.get('requested_transport')} deployed={row.get('deployed_transport')}")
    prog, stages = await b.run_sync(ws)
    phases = [s.get("phase") for s in stages if s.get("phase")]
    print(f"  stages: {phases}")
    check(f"GATE: sync to {target} succeeded", prog.get("status") == "success", str(prog.get("message")))
    check("run reported the switch", any(s.get("transport_switch") == target for s in stages))
    check("move before the delete, order restore after it",
          "moving_references" in phases and "deleting_device" in phases
          and phases.index("moving_references") < phases.index("deleting_device"), str(phases))
    row = await device_row(ws)
    new_dev = int(row.get("deployed_device_id") or 0)
    check(f"GATE: store reads {target} on a new device id", row.get("deployed_transport") == target and new_dev and new_dev != before_dev,
          f"{before_dev} -> {new_dev} pending={row.get('transport_switch_pending')} sync_needed={row.get('sync_needed')}")
    check("nothing pending afterwards", not row.get("transport_switch_pending") and not row.get("sync_needed"))
    await asyncio.sleep(2)
    bundle = await b.bundle(ws)
    dev = b.device_entry(bundle, new_dev)
    dev_class = str(((dev or {}).get("device") or {}).get("device_class") or "")
    check(f"GATE: hub device {new_dev} is {'wifi_mqtt' if target == 'mqtt' else 'wifi_ip'}", dev_class == ("wifi_mqtt" if target == "mqtt" else "wifi_ip"), f"class={dev_class!r}")
    check("old device is gone from the hub", b.device_entry(bundle, before_dev) is None)
    after_refs = e.events_refs(bundle, new_dev)
    stale = e.events_refs(bundle, before_dev)
    note(step=f"refs_after_{target}", device_id=new_dev, refs=after_refs, stale=stale)
    for act_id, refs in before_refs.items():
        print(f"  activity {act_id} after: order={after_refs.get(act_id, {}).get('order')}")
        for site in ("favorites", "short_legs", "long_legs", "macro_steps", "input_steps", "member", "order", "sequences"):
            check(f"activity {act_id} {site} preserved", after_refs.get(act_id, {}).get(site) == refs[site], f"{refs[site]} -> {after_refs.get(act_id, {}).get(site)}")
    check("the same activities reference the device", sorted(after_refs) == sorted(before_refs), f"{sorted(before_refs)} -> {sorted(after_refs)}")
    check("nothing points at the old device", not stale, json.dumps(stale))
    return new_dev


async def main() -> None:
    cfg = b.rest("/api/config")
    print(f"HA {cfg.get('version')} state={cfg.get('state')}")
    if cfg.get("state") != "RUNNING":
        raise SystemExit("HA is not RUNNING")
    b.DEVICE_KEY = DEVICE_KEY
    async with b.HaWs() as ws:
        await b.wait_ws_ready(ws)
        row = await device_row(ws)
        name = str(row.get("device_name") or DEVICE_KEY)
        dev0 = int(row.get("deployed_device_id") or 0)
        start = str(row.get("deployed_transport") or "http")
        other = "http" if start == "mqtt" else "mqtt"
        check("GATE: device deployed and nothing pending", dev0 > 0 and not row.get("sync_needed") and not row.get("transport_switch_pending"),
              f"{name!r} device_id={dev0} deployed={start}")
        listing = await ws.cmd({"type": "sofabaton_x1s/command_devices/list", "entry_id": b.ENTRY})
        check("GATE: MQTT available", bool(listing.get("mqtt_available")))
        bundle0 = await b.bundle(ws)
        (b.OUT / f"bench_312_prestate_{time.strftime('%Y%m%d-%H%M%S')}.json").write_text(json.dumps({"row": row, "bundle": bundle0}, indent=1, default=str), encoding="utf-8")
        refs0 = e.events_refs(bundle0, dev0)
        for act_id, refs in refs0.items():
            print(f"  activity {act_id} before: order={refs['order']} favorites={refs['favorites']} short={refs['short_legs']} long={refs['long_legs']}")
        note(step="refs_before", device_id=dev0, refs=refs0)
        check("GATE: activities reference the device", bool(refs0), str(sorted(refs0)))
        print(f"  listener switch: {e.listener_state()}")

        dev1 = await switch_to(ws, other, before_refs=refs0, before_dev=dev0, name=name)
        print(f"  listener switch after {other}: {e.listener_state()}")
        dev2 = await switch_to(ws, start, before_refs=refs0, before_dev=dev1, name=name)
        print(f"  listener switch after {start}: {e.listener_state()}")
        print(f"\n{name!r} is back on {start.upper()} as hub device {dev2}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        failed_count = b.write_report("bench_312")
    if failed_count:
        sys.exit(1)
