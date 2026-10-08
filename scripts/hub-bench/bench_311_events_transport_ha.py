"""T5: the REAL Wifi Events device on the X2 switches delivery to MQTT and
back, through the live HA instance (docs/internal/wifi-events-transport-plan.md
gate G4). Reuses bench_310's helpers.

  1. snapshot: the events list, the events device's class, and every
     reference the production activities hold to it (bindings, shortcuts,
     power-sequence rows), saved to out/ as the pre-state;
  2. set the desired transport to MQTT (command_config/set_transport on
     the reserved record), expect the events state to read pending;
  3. wifi_event/sync (the same call the activity editor's Sync runs as
     phase 1) and follow command_sync/progress for the record;
  4. read back: new device id and class wifi_mqtt, every reference moved,
     nothing left on the old id, events list on the new id, the HTTP
     listener switch off when nothing else needs it;
  5. press every configured event via remote.send_command: arrives on the
     press feed, the log names MQTT (the events' Actions are empty);
  6. the same back to HTTP, ending where the hub started.

Usage:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_311_events_transport_ha.py [stay-mqtt]
"""

from __future__ import annotations

import asyncio
import json
import sys
import time

import bench_310_transport_switch_ha as b

STAY_MQTT = len(sys.argv) > 1 and sys.argv[1] == "stay-mqtt"
EVENTS_KEY = "haevents"
LISTENER_SWITCH = "switch.x2_hub_wifi_device"

check = b.check
note = b.note


def events_refs(bundle: dict, dev_id: int) -> dict[int, dict]:
    out = {}
    for act in bundle.get("activities") or []:
        act_id = int((act.get("device") or {}).get("device_id") or 0)
        refs = b.refs_to(act, dev_id)
        if refs["member"] or any(refs[k] for k in ("favorites", "short_legs", "long_legs", "macro_steps", "input_steps")) or any(r is not None and r[0] == "X" for r in refs["order"]):
            out[act_id] = refs
    return out


def configured_events(state: dict) -> list[dict]:
    return [
        e for e in state.get("events") or []
        if str(e.get("name") or "") and not str(e.get("name") or "").startswith("Command ")
    ]


async def events_state(ws: b.HaWs) -> dict:
    return await ws.cmd({"type": "sofabaton_x1s/wifi_event/list", "entry_id": b.ENTRY})


async def events_sync(ws: b.HaWs, *, timeout: float = 1500.0) -> tuple[dict, list[dict], dict]:
    """wifi_event/sync while polling the record's progress on a second
    connection. Returns (terminal progress, stages, the sync's state payload)."""
    poll = b.HaWs()
    stages: list[dict] = []
    terminal: dict | None = None
    result: dict | None = None
    async with poll:
        before = await poll.cmd({"type": "sofabaton_x1s/command_sync/progress", "entry_id": b.ENTRY, "device_key": EVENTS_KEY})
        task = asyncio.ensure_future(ws.cmd({"type": "sofabaton_x1s/wifi_event/sync", "entry_id": b.ENTRY}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            prog = await poll.cmd({"type": "sofabaton_x1s/command_sync/progress", "entry_id": b.ENTRY, "device_key": EVENTS_KEY})
            stage = {k: prog.get(k) for k in ("phase", "step_kind", "step_name", "message", "transport_switch", "status")}
            if not stages or stages[-1] != stage:
                stages.append(stage)
            if task.done():
                terminal = prog
                break
            await asyncio.sleep(0.5)
        if terminal is None:
            raise SystemExit("events sync did not finish in time")
        try:
            result = await task
        except RuntimeError as err:
            result = {"error": str(err)}
        # the progress may still be mid-write on the last poll before task.done()
        terminal = await poll.cmd({"type": "sofabaton_x1s/command_sync/progress", "entry_id": b.ENTRY, "device_key": EVENTS_KEY})
    note(step="events_sync", terminal=terminal, stages=stages, result=result)
    return terminal, stages, result or {}


def listener_state() -> str:
    return str((b.rest(f"/api/states/{LISTENER_SWITCH}") or {}).get("state"))


async def switch_to(ws: b.HaWs, target: str, *, before_refs: dict[int, dict], before_dev: int, pre_events: list[dict]) -> tuple[int, dict[int, dict]]:
    print(f"\n== switch the Wifi Events device to {target.upper()} ==")
    state = await ws.cmd({"type": "sofabaton_x1s/command_config/set_transport", "entry_id": b.ENTRY, "device_key": EVENTS_KEY, "transport": target})
    check(f"set_transport({target}) marks the switch pending", bool(state.get("transport_switch_pending")) and bool(state.get("record_needs_sync")),
          f"requested={state.get('requested_transport')} deployed={state.get('deployed_transport')} pending={state.get('transport_switch_pending')}")
    terminal, stages, result = await events_sync(ws)
    phases = [s.get("phase") for s in stages if s.get("phase")]
    print(f"  stages: {phases}")
    check(f"GATE: events sync to {target} succeeded", terminal.get("status") == "success" and "error" not in result, f"{terminal.get('message')} {result.get('error') or ''}")
    check("run reported the switch", any(s.get("transport_switch") == target for s in stages))
    check("replace path with the move stage before the delete",
          "moving_references" in phases and "deleting_device" in phases and phases.index("moving_references") < phases.index("deleting_device"), str(phases))
    after = await events_state(ws)
    new_dev = int(after.get("device_id") or 0)
    check(f"GATE: events state reads {target} on a new device id", after.get("deployed_transport") == target and new_dev and new_dev != before_dev,
          f"{before_dev} -> {new_dev} deployed={after.get('deployed_transport')} pending={after.get('transport_switch_pending')} needs_sync={after.get('record_needs_sync')}")
    check("no switch pending afterwards", not after.get("transport_switch_pending") and not after.get("record_needs_sync"))
    after_events = configured_events(after)
    check("every configured event is on the new device and deployed",
          [(e["slot_index"], e["name"], e["command_id"]) for e in after_events] == [(e["slot_index"], e["name"], e["command_id"]) for e in pre_events]
          and all(e.get("device_id") == new_dev and e.get("deployed") for e in after_events),
          str([(e["name"], e.get("device_id"), e.get("deployed")) for e in after_events]))
    check("event Actions untouched", [e["action"] for e in after_events] == [e["action"] for e in pre_events])
    await asyncio.sleep(2)
    bundle = await b.bundle(ws)
    dev = b.device_entry(bundle, new_dev)
    dev_class = str(((dev or {}).get("device") or {}).get("device_class") or "")
    expect_class = "wifi_mqtt" if target == "mqtt" else "wifi_ip"
    check(f"GATE: hub device {new_dev} is {expect_class}", dev_class == expect_class, f"class={dev_class!r} brand={((dev or {}).get('device') or {}).get('brand')!r}")
    check("old events device is gone from the hub", b.device_entry(bundle, before_dev) is None)
    check("the new device holds 25 records", len((dev or {}).get("commands") or []) == 25, str(len((dev or {}).get("commands") or [])))
    after_refs = events_refs(bundle, new_dev)
    stale = events_refs(bundle, before_dev)
    note(step=f"refs_after_{target}", device_id=new_dev, refs=after_refs, stale=stale)
    print(f"  refs after:  {json.dumps(after_refs)}")
    check("G4: the same activities reference the events device", sorted(after_refs) == sorted(before_refs), f"{sorted(before_refs)} -> {sorted(after_refs)}")
    for act_id, refs in before_refs.items():
        for site in ("favorites", "short_legs", "long_legs", "macro_steps", "input_steps", "member", "order", "sequences"):
            check(f"G4: activity {act_id} {site} preserved", after_refs.get(act_id, {}).get(site) == refs[site], f"{refs[site]} -> {after_refs.get(act_id, {}).get(site)}")
    check("G4: nothing points at the old device", not stale, json.dumps(stale))
    return new_dev, after_refs


async def press_all(dev_id: int, events: list[dict], *, transport: str) -> None:
    print(f"\n== presses over {transport.upper()} ==")
    for e in events:
        ok, detail = await b.press_and_wait(dev_id, int(e["command_id"]), expect_transport=transport, device_name="Wifi Events")
        check(f"G4: event {e['name']!r} arrives over {transport}", ok, detail)
        await asyncio.sleep(1.5)


async def main() -> None:
    cfg = b.rest("/api/config")
    print(f"HA {cfg.get('version')} state={cfg.get('state')}")
    if cfg.get("state") != "RUNNING":
        raise SystemExit("HA is not RUNNING")
    async with b.HaWs() as ws:
        await b.wait_ws_ready(ws)
        await b.PRESSES.start()
        pre = await events_state(ws)
        check("GATE: MQTT available for the X2 entry", bool(pre.get("mqtt_available")))
        check("GATE: events device deployed over HTTP", pre.get("deployed_transport") == "http" and isinstance(pre.get("device_id"), int),
              f"device_id={pre.get('device_id')} deployed={pre.get('deployed_transport')} requested={pre.get('requested_transport')}")
        check("GATE: nothing pending before the bench", not pre.get("record_needs_sync") and not pre.get("transport_switch_pending"))
        dev0 = int(pre.get("device_id") or 0)
        pre_events = configured_events(pre)
        check("GATE: every configured event has an empty Action (a press runs nothing)",
              all(not (e.get("action") or {}).get("perform_action") for e in pre_events), str([e["action"] for e in pre_events]))
        bundle0 = await b.bundle(ws)
        (b.OUT / f"bench_311_prestate_{time.strftime('%Y%m%d-%H%M%S')}.json").write_text(json.dumps({"events": pre, "bundle": bundle0}, indent=1, default=str), encoding="utf-8")
        refs0 = events_refs(bundle0, dev0)
        print(f"  events: {[(e['slot_index'], e['name'], e['command_id']) for e in pre_events]}")
        print(f"  refs before: {json.dumps(refs0)}")
        note(step="refs_before", device_id=dev0, refs=refs0)
        check("GATE: production activities reference the events device", bool(refs0), str(sorted(refs0)))
        listener0 = listener_state()
        print(f"  listener switch: {listener0}")

        dev1, refs1 = await switch_to(ws, "mqtt", before_refs=refs0, before_dev=dev0, pre_events=pre_events)
        listener1 = listener_state()
        print(f"  listener switch after MQTT: {listener1}")
        note(step="listener", before=listener0, after_mqtt=listener1)
        await press_all(dev1, pre_events, transport="mqtt")

        if STAY_MQTT:
            print("\nleaving the Wifi Events device on MQTT (stay-mqtt)")
        else:
            dev2, _refs2 = await switch_to(ws, "http", before_refs=refs0, before_dev=dev1, pre_events=pre_events)
            listener2 = listener_state()
            print(f"  listener switch after HTTP: {listener2}")
            check("HTTP listener switch is on again", listener2 == "on", listener2)
            await press_all(dev2, pre_events, transport="http")
        await b.PRESSES.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        failed_count = b.write_report("bench_311")
    if failed_count:
        sys.exit(1)
