"""S5: Wifi Events as single records, live through the deployed HA.

Plan: docs/internal/wifi-events-single-record-plan.md §6. Drives HA over
its WS API only (no direct hub access), one subcommand per bench step so
each step can be run, read and judged on its own:

  state                 read-only: events list, events device records,
                        activities referencing the events device
  capture <tag>         save the structural bundle to out/<tag>.json
  fixture               legacy references on ACTIVITY: VOL_UP long leg on
                        event 2's long record, a favorite on event 1, a
                        macro step on event 3 (written with activity/sync
                        directly, so no events deploy runs)
  sync-events           the user's Sync: wifi_event/sync, then report
  presses <seconds>     subscribe to wifi_presses and print every press
                        for the window (Marcel presses / holds buttons)
  restore <tag>         activity/sync ACTIVITY back to out/<tag>.json

Usage: python bench_150_events_single_record.py <hub-substring> <cmd> [args]
Reads scripts/.ha-config.json + scripts/.ha-token.
"""

from __future__ import annotations

import copy
import json
import ssl
import sys
import time
from pathlib import Path

import websocket  # websocket-client

SCRIPTS = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent / "out"
config = json.loads((SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
token = (SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
ws_url = config["base_url"].replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"

HUB_MATCH = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
CMD = sys.argv[2] if len(sys.argv) > 2 else "state"
ARGS = sys.argv[3:]
EVENTS_BRAND = "m3-haevents-"


class HaWs:
    def __init__(self) -> None:
        self.ws = websocket.create_connection(ws_url, sslopt={"cert_reqs": ssl.CERT_NONE}, timeout=240)
        hello = json.loads(self.ws.recv())
        assert hello["type"] == "auth_required", hello
        self.ws.send(json.dumps({"type": "auth", "access_token": token}))
        ok = json.loads(self.ws.recv())
        assert ok["type"] == "auth_ok", ok
        self._id = 0
        self._pending: dict[int, dict] = {}

    def send(self, payload: dict) -> int:
        self._id += 1
        self.ws.send(json.dumps({"id": self._id, **payload}))
        return self._id

    def wait(self, msg_id: int, timeout: float = 240.0) -> dict:
        if msg_id in self._pending:
            return self._pending.pop(msg_id)
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = json.loads(self.ws.recv())
            if raw.get("type") != "result":
                continue
            if raw.get("id") == msg_id:
                return raw
            self._pending[raw["id"]] = raw
        raise TimeoutError(f"no result for id={msg_id}")

    def result(self, payload: dict, timeout: float = 240.0) -> dict:
        res = self.wait(self.send(payload), timeout)
        if not res.get("success"):
            raise RuntimeError(f"{payload.get('type')} failed: {res.get('error')}")
        return res.get("result") or {}


ha = HaWs()
state = ha.result({"type": "sofabaton_x1s/control_panel/state"})
hub = next((h for h in state.get("hubs") or []
            if HUB_MATCH in str(h.get("name") or "").lower()
            or HUB_MATCH in str(h.get("version") or "").lower()), None)
assert hub, f"no hub matching {HUB_MATCH!r}"
entry_id = hub["entry_id"]
print(f"hub: {hub.get('name')} ({hub.get('version')}) entry={entry_id[:8]}", flush=True)
# The X2 is production: read-only commands only.
if CMD not in ("state", "capture", "presses") and str(hub.get("version")) == "X2":
    raise SystemExit("refusing a write on the production X2")


def structural_bundle() -> dict:
    return ha.result({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id}).get("bundle") or {}


def events_state() -> dict:
    return ha.result({"type": "sofabaton_x1s/wifi_event/list", "entry_id": entry_id})


def events_device(bundle: dict) -> dict | None:
    return next((d for d in bundle.get("devices") or []
                 if str((d.get("device") or {}).get("brand") or "").startswith(EVENTS_BRAND)), None)


def find_activity(bundle: dict, act_id: int) -> dict | None:
    return next((a for a in bundle.get("activities") or []
                 if int((a.get("device") or {}).get("device_id") or 0) == act_id), None)


def refs_to(activity: dict, dev: int) -> list[str]:
    out: list[str] = []
    for fav in activity.get("favorite_slots") or []:
        if int(fav.get("device_id") or 0) == dev:
            out.append(f"favorite btn={fav.get('button_id')} cmd={fav.get('command_id')}")
    for b in activity.get("button_bindings") or []:
        if int(b.get("device_id") or 0) == dev:
            out.append(f"binding 0x{int(b['button_id']):02X} short cmd={b.get('command_id')}")
        if int(b.get("long_press_device_id") or 0) == dev:
            out.append(f"binding 0x{int(b['button_id']):02X} long cmd={b.get('long_press_command_id')}")
    for m in activity.get("macros") or []:
        for i, step in enumerate(m.get("steps") or []):
            if int(step.get("device_id") or 0) == dev:
                out.append(f"macro btn={m.get('button_id')} step{i} cmd={step.get('command_id')}")
    return out


def report() -> None:
    ev = events_state()
    print(f"events: device_id={ev.get('device_id')} needs_sync={ev.get('record_needs_sync')} "
          f"slot_count={ev.get('slot_count')}")
    for e in ev.get("events") or []:
        print(f"  slot {e['slot_index']} id={e['command_id']} {e['name']!r} deployed={e['deployed']} "
              f"action={e.get('action', {}).get('perform_action', '-')}")
    bundle = structural_bundle()
    dev = events_device(bundle)
    if dev is None:
        print("events device: not in the cached bundle")
        return
    dev_id = int(dev["device"]["device_id"])
    ids = sorted(int(c.get("command_id") or 0) for c in dev.get("commands") or [])
    longs = [i for i in ids if i > 25]
    print(f"events device {dev_id} brand={dev['device'].get('brand')} records={len(ids)} "
          f"(ids {ids[:1]}..{ids[-1:]}, long ids {len(longs)})")
    for act in bundle.get("activities") or []:
        refs = refs_to(act, dev_id)
        if refs:
            print(f"  activity {act['device']['device_id']} {act['device'].get('name')!r}: " + "; ".join(refs))


if CMD == "state":
    report()

elif CMD == "capture":
    tag = ARGS[0]
    OUT.mkdir(exist_ok=True)
    path = OUT / f"{tag}.json"
    path.write_text(json.dumps(structural_bundle(), indent=1), encoding="utf-8")
    print(f"saved {path}")

elif CMD == "sync-events":
    t0 = time.time()
    st = ha.result({"type": "sofabaton_x1s/wifi_event/sync", "entry_id": entry_id}, timeout=600)
    print(f"wifi_event/sync in {time.time() - t0:.0f} s: device_id={st.get('device_id')} "
          f"needs_sync={st.get('record_needs_sync')}")
    report()

elif CMD == "delete-cycle":
    # Step 6 without touching the user's events: create a throwaway event,
    # deploy it, delete it the way the device editor does (device/sync on
    # baseline vs edited bundle), then redeploy so the hub is back at 25.
    name = "S5 bench"
    created = ha.result({"type": "sofabaton_x1s/wifi_event/create", "entry_id": entry_id, "name": name})
    ev = created["event"]
    cmd_id = int(ev["command_id"])
    print(f"created {name!r} slot={ev['slot_index']} id={cmd_id}")
    t0 = time.time()
    st = ha.result({"type": "sofabaton_x1s/wifi_event/sync", "entry_id": entry_id}, timeout=600)
    dev_id = int(st["device_id"])
    print(f"deployed in {time.time() - t0:.0f} s: needs_sync={st.get('record_needs_sync')}")

    def device_records() -> dict[int, str]:
        dev = events_device(structural_bundle())
        return {int(c["command_id"]): str(c.get("name") or c.get("label") or "") for c in (dev or {}).get("commands") or []}

    before = device_records()
    print(f"records before delete: {len(before)}; id {cmd_id} = {before.get(cmd_id)!r}")
    baseline = structural_bundle()
    edited = copy.deepcopy(baseline)
    for dev in edited.get("devices") or []:
        if int(dev["device"]["device_id"]) == dev_id:
            dev["commands"] = [c for c in dev["commands"] if int(c["command_id"]) != cmd_id]
    start = ha.result({"type": "sofabaton_x1s/device/sync", "entry_id": entry_id, "device_id": dev_id,
                       "baseline": baseline, "edited": edited})
    op_id = start.get("operation_id")
    status, message = "", ""
    deadline = time.time() + 300
    while time.time() < deadline and status not in ("success", "failed"):
        time.sleep(2.0)
        ops = ha.result({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
        op = ops.get("device_sync") or {}
        if str(op.get("operation_id") or op.get("id") or "") not in ("", str(op_id)):
            continue
        op_state = op.get("state") if isinstance(op.get("state"), dict) else op
        status = str(op_state.get("status") or "")
        message = str(op_state.get("message") or op_state.get("error") or "")
    print(f"device/sync: {status} {message}")
    after = device_records()
    gone = sorted(set(before) - set(after))
    print(f"records after delete: {len(after)}; removed ids {gone}")
    st = events_state()
    print(f"events after: {[e['name'] for e in st.get('events') or []]} needs_sync={st.get('record_needs_sync')}")
    # Teardown: the full-table deploy re-adds the freed id as its placeholder.
    ha.result({"type": "sofabaton_x1s/wifi_event/sync", "entry_id": entry_id}, timeout=600)
    final = device_records()
    print(f"after redeploy: {len(final)} records; id {cmd_id} = {final.get(cmd_id)!r}")

elif CMD == "presses":
    window = float(ARGS[0]) if ARGS else 120.0
    sub_id = ha.send({"type": "sofabaton_x1s/wifi_presses/subscribe", "entry_id": entry_id})
    ha.ws.settimeout(2.0)
    print(f"listening {window:.0f} s for presses on {hub.get('name')}…", flush=True)
    deadline = time.time() + window
    while time.time() < deadline:
        try:
            raw = json.loads(ha.ws.recv())
        except websocket.WebSocketTimeoutException:
            continue
        if raw.get("id") == sub_id and raw.get("type") == "event":
            ev = raw.get("event") or {}
            print(f"  {time.strftime('%H:%M:%S')} device={ev.get('device_id')} index={ev.get('command_index')} "
                  f"label={ev.get('command_label')!r} press_type={ev.get('press_type')}", flush=True)

else:
    raise SystemExit(f"unknown command {CMD!r}")
