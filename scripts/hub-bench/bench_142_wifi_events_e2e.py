"""W6: Wifi Events end-to-end validation through the LIVE deployed HA.

Plan: docs/internal/wifi-events-plan.md §9-W6. Drives the shipped
feature exactly as the card does — HA WS API only, no direct hub access:

  P1  wifi_event/list empty; command_devices/list hides nothing yet
  P2  create "Bench Ev A" (first create builds the device, ~1 min) and
      "Bench Ev B"; verify law ids + deployed; reserved device hidden
      from command_devices/list
  P3  set actions: A/short + A/long -> persistent notifications,
      long-press toggle on A
  P4  reference all four element types from ACT_A via the real
      activity/sync WS: favorite(A), RED binding short(A)+long(A-long),
      new macro with a step(B)
  P5  MANUAL: press the favorite, short-press RED, hold RED, run the
      macro — polls the wifi sensor + persistent notifications per press
  P6  §6a: rename command record "Bench Ev B" -> "Bench Ev B2" via
      device/sync on the events device; verify the store followed
      (wifi_event/list shows the new name, still in sync)
  P7  delete B -> reference cascade (macro step gone / empty macro
      pruned in the re-read bundle); delete A -> zero-slot teardown
      (device gone, record gone, list empty)
  P8  restore ACT_A to its captured baseline via activity/sync

Usage: python bench_142_wifi_events_e2e.py <hub-name-substring>
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
config = json.loads((SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
token = (SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
ws_url = config["base_url"].replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"

HUB_MATCH = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
ACT_A = 0x65
RED = 0xBE
EV_A = "Bench Ev A"
EV_B = "Bench Ev B"
EV_B2 = "Bench Ev B2"
NOTIFY_SHORT = "benchwifi-ev-short"
NOTIFY_LONG = "benchwifi-ev-long"
PRESS_WINDOW = 90.0

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""), flush=True)


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

    def call(self, payload: dict, timeout: float = 240.0) -> dict:
        return self.wait(self.send(payload), timeout)

    def result(self, payload: dict, timeout: float = 240.0) -> dict:
        res = self.call(payload, timeout)
        if not res.get("success"):
            raise RuntimeError(f"{payload.get('type')} failed: {res.get('error')}")
        return res.get("result") or {}


def notify_action(notification_id: str, message: str) -> dict:
    return {
        "action": "perform-action",
        "perform_action": "persistent_notification.create",
        "data": {"notification_id": notification_id, "title": "Bench Wifi Event", "message": message},
    }


ha = HaWs()
print(f"connected to {ws_url}", flush=True)

# ── resolve hub + entity + sensor ──────────────────────────────────────
state = ha.result({"type": "sofabaton_x1s/control_panel/state"})
hubs = state.get("hubs") or []
hub = next((h for h in hubs if HUB_MATCH in str(h.get("name") or "").lower()
            or HUB_MATCH in str(h.get("version") or "").lower()), None)
assert hub, f"no hub matching {HUB_MATCH!r}; hubs={[h.get('name') for h in hubs]}"
entry_id = hub["entry_id"]
print(f"hub: {hub.get('name')} ({hub.get('version')}) entry={entry_id[:8]}", flush=True)

states = ha.call({"type": "get_states"})["result"]
entity_id = next((s["entity_id"] for s in states
                  if s["entity_id"].startswith("remote.")
                  and s.get("attributes", {}).get("entry_id") == entry_id), None)
assert entity_id, "no remote entity for hub"
sensor_ids = [s["entity_id"] for s in states
              if s["entity_id"].startswith("sensor.") and s["entity_id"].endswith("_wifi_commands")]
print(f"entity: {entity_id}; wifi sensors: {sensor_ids}", flush=True)


def sensor_snapshot() -> dict[str, tuple[str, str]]:
    states_now = ha.call({"type": "get_states"})["result"]
    return {
        s["entity_id"]: (str(s.get("state")), str(s.get("last_updated")))
        for s in states_now if s["entity_id"] in sensor_ids
    }


def wait_for_press(expect_state_contains: str, notification_id: str | None, window: float) -> tuple[bool, bool, str]:
    """Poll sensors (+ optionally notifications) until a match or timeout."""
    before = sensor_snapshot()
    if notification_id:
        ha.call({"type": "call_service", "domain": "persistent_notification",
                 "service": "dismiss", "service_data": {"notification_id": notification_id}})
    deadline = time.time() + window
    sensor_hit = False
    notify_hit = notification_id is None
    detail = ""
    while time.time() < deadline and not (sensor_hit and notify_hit):
        time.sleep(1.5)
        if not sensor_hit:
            now = sensor_snapshot()
            for sensor, (value, updated) in now.items():
                if before.get(sensor) != (value, updated) and expect_state_contains.lower() in value.lower():
                    sensor_hit = True
                    detail = f"{sensor}={value}"
                    break
        if not notify_hit:
            notes = ha.call({"type": "persistent_notification/get"})["result"] or []
            if any(n.get("notification_id") == notification_id for n in notes):
                notify_hit = True
    return sensor_hit, notify_hit, detail


def sync_activity(baseline: dict, edited: dict, label: str) -> bool:
    start = ha.result({
        "type": "sofabaton_x1s/activity/sync",
        "entry_id": entry_id, "activity_id": ACT_A,
        "baseline": baseline, "edited": edited,
    })
    op_id = start.get("operation_id")
    deadline = time.time() + 300
    while time.time() < deadline:
        time.sleep(2.0)
        ops = ha.result({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
        op = next((o for o in (ops.get("operations") or []) if o.get("operation_id") == op_id), None)
        status = str((op or {}).get("status") or "")
        if status in ("success", "failed"):
            check(f"{label}: activity/sync {status}", status == "success",
                  str((op or {}).get("message") or ""))
            return status == "success"
    check(f"{label}: activity/sync timed out", False)
    return False


def structural_bundle() -> dict:
    return ha.result({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id}).get("bundle") or {}


def find_activity(bundle: dict, act_id: int) -> dict | None:
    for act in bundle.get("activities") or []:
        if int((act.get("device") or {}).get("device_id") or 0) == act_id:
            return act
    return None


def next_button_id(activity: dict) -> int:
    top = 0
    for row in list(activity.get("favorite_slots") or []) + list(activity.get("macros") or []):
        bid = int(row.get("button_id") or 0)
        if bid > 0 and bid not in (198, 199) and bid > top:
            top = bid
    return top + 1


artifacts: dict = {"hub": hub.get("name"), "version": hub.get("version"), "entry_id": entry_id}
try:
    # ── P1: clean baseline (rerun-tolerant: sweep leftover bench events) ──
    print("\n=== P1: baseline ===", flush=True)
    events0 = ha.result({"type": "sofabaton_x1s/wifi_event/list", "entity_id": entity_id}).get("events") or []
    leftovers = [e for e in events0 if str(e.get("name") or "").startswith("Bench Ev")]
    if leftovers and len(leftovers) == len(events0):
        print(f"  sweeping {len(leftovers)} leftover bench event(s) from a prior run", flush=True)
        for event in sorted(leftovers, key=lambda e: -int(e.get("slot_index") or 0)):
            ha.result({"type": "sofabaton_x1s/wifi_event/delete", "entity_id": entity_id,
                       "slot_index": int(event["slot_index"])}, timeout=300)
        events0 = ha.result({"type": "sofabaton_x1s/wifi_event/list", "entity_id": entity_id}).get("events") or []
    check("P1: no wifi events yet", events0 == [], f"{events0}")
    act_pre_bundle = structural_bundle()
    assert find_activity(act_pre_bundle, ACT_A), "ACT_A missing"
    devices0 = ha.result({"type": "sofabaton_x1s/command_devices/list", "entity_id": entity_id}).get("devices") or []
    artifacts["user_wifi_devices_before"] = [d.get("device_key") for d in devices0]

    # ── P2: create events ──────────────────────────────────────────────
    print("\n=== P2: create events (first one builds the device, ~1 min) ===", flush=True)
    t0 = time.time()
    created = ha.result({"type": "sofabaton_x1s/wifi_event/create", "entity_id": entity_id, "name": EV_A}, timeout=300)
    dt_a = time.time() - t0
    ev_a = created.get("event") or {}
    check("P2: create A deployed", bool(ev_a.get("device_id")), f"{dt_a:.0f}s event={ev_a}")
    check("P2: A law ids", ev_a.get("command_id") == 1 and ev_a.get("long_press_command_id") == 51, f"{ev_a}")
    t0 = time.time()
    created_b = ha.result({"type": "sofabaton_x1s/wifi_event/create", "entity_id": entity_id, "name": EV_B}, timeout=300)
    dt_b = time.time() - t0
    ev_b = created_b.get("event") or {}
    check("P2: create B fast in-place", bool(ev_b.get("device_id")) and dt_b < dt_a, f"{dt_b:.0f}s vs {dt_a:.0f}s")
    devices1 = ha.result({"type": "sofabaton_x1s/command_devices/list", "entity_id": entity_id}).get("devices") or []
    check("P2: reserved device hidden from Wifi Devices list",
          [d.get("device_key") for d in devices1] == artifacts["user_wifi_devices_before"])
    events_dev_id = int(ev_a["device_id"])

    # ── P3: actions + long-press ───────────────────────────────────────
    print("\n=== P3: actions + long-press toggle ===", flush=True)
    ha.result({"type": "sofabaton_x1s/wifi_event/set_action", "entity_id": entity_id,
               "slot_index": 0, "press_type": "short", "action": notify_action(NOTIFY_SHORT, "short press")})
    ha.result({"type": "sofabaton_x1s/wifi_event/set_longpress", "entity_id": entity_id,
               "slot_index": 0, "enabled": True})
    listed = ha.result({"type": "sofabaton_x1s/wifi_event/set_action", "entity_id": entity_id,
                        "slot_index": 0, "press_type": "long", "action": notify_action(NOTIFY_LONG, "long press")})
    row_a = next((e for e in listed.get("events") or [] if e.get("slot_index") == 0), {})
    check("P3: actions + longpress staged (no deploy needed)",
          row_a.get("long_press_enabled") is True and row_a.get("deployed") is True, f"{row_a}")

    # ── P4: reference all four element types via activity/sync ─────────
    print("\n=== P4: reference favorite + RED short/long + macro step ===", flush=True)
    baseline = structural_bundle()
    edited = copy.deepcopy(baseline)
    act = find_activity(edited, ACT_A)
    assert act
    act.setdefault("favorite_slots", []).append(
        {"button_id": next_button_id(act), "device_id": events_dev_id, "command_id": 1, "name": EV_A})
    bindings = act.setdefault("button_bindings", [])
    bindings[:] = [b for b in bindings if int(b.get("button_id") or 0) != RED]
    bindings.append({"button_id": RED, "device_id": events_dev_id, "command_id": 1,
                     "long_press_device_id": events_dev_id, "long_press_command_id": 51})
    act.setdefault("macros", []).append({
        "button_id": next_button_id(act), "name": "Bench Ev Macro",
        "steps": [{"device_id": events_dev_id, "command_id": 2, "button_code": 0x4E20 + 2,
                   "duration": 0, "delay": 0xFF}]})
    for macro in act.get("macros") or []:
        mbid = int(macro.get("button_id") or 0)
        steps = macro.setdefault("steps", [])
        if mbid == 198:
            steps.append({"device_id": events_dev_id, "command_id": 0xC6, "button_code": 0, "duration": 0, "delay": 0xFF})
            steps.append({"device_id": events_dev_id, "command_id": 0xC5, "button_code": 0, "duration": 0, "delay": 0xFF})
        elif mbid == 199:
            steps.append({"device_id": events_dev_id, "command_id": 0xC7, "button_code": 0, "duration": 0, "delay": 0xFF})
    # The WS validator requires referenced_source_device_ids == the sorted
    # device set in the power macros (the frontend reconcile maintains it).
    members = sorted({
        int(s.get("device_id") or 0)
        for m in act.get("macros") or [] if int(m.get("button_id") or 0) in (198, 199)
        for s in m.get("steps") or []
        if int(s.get("device_id") or 0) > 0 and int(s.get("command_id") or 0) in (0xC5, 0xC6, 0xC7)
    })
    act["referenced_source_device_ids"] = members
    if not sync_activity(baseline, edited, "P4"):
        raise SystemExit("P4 sync failed")

    # ── P5: manual presses ─────────────────────────────────────────────
    print("\n=== P5: MANUAL — grab the remote, open ACT_A ===", flush=True)
    print(f">>> PRESS the favorite '{EV_A}' on the touch screen now ({PRESS_WINDOW:.0f}s window)", flush=True)
    s_hit, n_hit, detail = wait_for_press(EV_A, NOTIFY_SHORT, PRESS_WINDOW)
    check("P5: favorite press -> sensor", s_hit, detail)
    check("P5: favorite press -> action ran (notification)", n_hit)
    print(f">>> SHORT-PRESS the RED button now ({PRESS_WINDOW:.0f}s window)", flush=True)
    s_hit, n_hit, detail = wait_for_press(EV_A, NOTIFY_SHORT, PRESS_WINDOW)
    check("P5: RED short press -> sensor", s_hit, detail)
    check("P5: RED short press -> action ran", n_hit)
    print(f">>> HOLD the RED button (long press) now ({PRESS_WINDOW:.0f}s window)", flush=True)
    s_hit, n_hit, detail = wait_for_press("longpress", NOTIFY_LONG, PRESS_WINDOW)
    check("P5: RED long press -> sensor longpress", s_hit, detail)
    check("P5: RED long press -> long action ran", n_hit)
    print(f">>> RUN the macro 'Bench Ev Macro' from the touch screen now ({PRESS_WINDOW:.0f}s window)", flush=True)
    s_hit, _n, detail = wait_for_press(EV_B, None, PRESS_WINDOW)
    check("P5: macro step -> sensor shows Ev B", s_hit, detail)

    # ── P6: §6a command rename via device/sync ─────────────────────────
    print("\n=== P6: rename command record via device/sync (store follows) ===", flush=True)
    baseline6 = structural_bundle()
    edited6 = copy.deepcopy(baseline6)
    for device in edited6.get("devices") or []:
        if int((device.get("device") or {}).get("device_id") or 0) == events_dev_id:
            for command in device.get("commands") or []:
                if int(command.get("command_id") or 0) == 2:
                    command["name"] = EV_B2
    start = ha.result({"type": "sofabaton_x1s/device/sync", "entry_id": entry_id,
                       "device_id": events_dev_id, "baseline": baseline6, "edited": edited6})
    op_id = start.get("operation_id")
    deadline = time.time() + 300
    status = ""
    while time.time() < deadline:
        time.sleep(2.0)
        ops = ha.result({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
        op = next((o for o in (ops.get("operations") or []) if o.get("operation_id") == op_id), None)
        status = str((op or {}).get("status") or "")
        if status in ("success", "failed"):
            break
    check("P6: device/sync rename", status == "success")
    events6 = ha.result({"type": "sofabaton_x1s/wifi_event/list", "entity_id": entity_id}).get("events") or []
    row_b = next((e for e in events6 if e.get("slot_index") == 1), {})
    check("P6: store followed the rename", row_b.get("name") == EV_B2, f"{row_b}")

    # ── P7: deletes ────────────────────────────────────────────────────
    print("\n=== P7: delete B (cascade) then A (zero-slot teardown) ===", flush=True)
    ha.result({"type": "sofabaton_x1s/wifi_event/delete", "entity_id": entity_id, "slot_index": 1}, timeout=300)
    bundle7 = structural_bundle()
    act7 = find_activity(bundle7, ACT_A) or {}
    bench_macros = [m for m in act7.get("macros") or [] if str(m.get("name") or "") == "Bench Ev Macro"]
    dangling = [s for m in bench_macros for s in m.get("steps") or []
                if int(s.get("device_id") or 0) == events_dev_id and int(s.get("command_id") or 0) == 2]
    check("P7: macro-step cascade on delete", not dangling,
          f"macro_gone={not bench_macros} dangling={len(dangling)}")
    final = ha.result({"type": "sofabaton_x1s/wifi_event/delete", "entity_id": entity_id, "slot_index": 0}, timeout=300)
    check("P7: last delete empties the list", (final.get("events") or []) == [])
    bundle7b = structural_bundle()
    gone = not any(int((d.get("device") or {}).get("device_id") or 0) == events_dev_id
                   for d in bundle7b.get("devices") or [])
    check("P7: events device removed from hub", gone)

    # ── P8: restore ACT_A ──────────────────────────────────────────────
    print("\n=== P8: restore ACT_A to its captured baseline ===", flush=True)
    bundle8 = structural_bundle()
    restored = copy.deepcopy(bundle8)
    acts = restored.get("activities") or []
    pre_act = find_activity(act_pre_bundle, ACT_A)
    for idx, entry in enumerate(acts):
        if int((entry.get("device") or {}).get("device_id") or 0) == ACT_A:
            acts[idx] = copy.deepcopy(pre_act)
    sync_activity(bundle8, restored, "P8 restore")
    final_act = find_activity(structural_bundle(), ACT_A) or {}
    leftover = [s for s in final_act.get("favorite_slots") or []
                if int(s.get("device_id") or 0) == events_dev_id]
    leftover += [b for b in final_act.get("button_bindings") or []
                 if int(b.get("device_id") or 0) == events_dev_id]
    check("P8: no bench refs left on ACT_A", not leftover, f"{leftover}")
finally:
    out = Path(__file__).parent / "out" / f"evE2E-{hub.get('version')}.json"
    out.parent.mkdir(exist_ok=True)
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    out.write_text(json.dumps(artifacts, indent=2, default=str), encoding="utf-8")
    print(f"\nartifacts saved: {out}", flush=True)

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed", flush=True)
sys.exit(1 if failed else 0)
