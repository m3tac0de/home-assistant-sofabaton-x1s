"""W6 press validation, corrected: event-subscription based (the wifi
sensor is a 0.3s PULSE by design — polling can't see it; bench_142's
sensor FAILs were probe artifacts).

Creates one event + favorite + RED binding (short+long) on ACT_A,
subscribes to `wifi_presses/subscribe` (the exact feed the card's press
flash renders from), prompts three presses, then tears everything down
and restores ACT_A (RED from the recovery bundle).

Usage: python bench_142d_press_check.py <hub-name-substring> <recovery-bundle.json>
"""

from __future__ import annotations

import copy
import json
import ssl
import sys
import time
from pathlib import Path

import websocket

SCRIPTS = Path(__file__).resolve().parents[1]
config = json.loads((SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
token = (SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
ws_url = config["base_url"].replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"

HUB_MATCH = sys.argv[1].lower()
RECOVERY = Path(sys.argv[2])
ACT_A = 0x65
RED = 0xBE
EV_A = "Bench Ev A"
NOTIFY_SHORT = "benchwifi-ev-short"
NOTIFY_LONG = "benchwifi-ev-long"
PRESS_WINDOW = 120.0

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""), flush=True)


class HaWs:
    def __init__(self) -> None:
        self.ws = websocket.create_connection(ws_url, sslopt={"cert_reqs": ssl.CERT_NONE}, timeout=240)
        assert json.loads(self.ws.recv())["type"] == "auth_required"
        self.ws.send(json.dumps({"type": "auth", "access_token": token}))
        assert json.loads(self.ws.recv())["type"] == "auth_ok"
        self._id = 0
        self._pending: dict[int, dict] = {}
        self.events: list[dict] = []

    def send(self, payload: dict) -> int:
        self._id += 1
        self.ws.send(json.dumps({"id": self._id, **payload}))
        return self._id

    def _pump(self, timeout: float) -> dict | None:
        self.ws.settimeout(timeout)
        try:
            raw = json.loads(self.ws.recv())
        except Exception:
            return None
        if raw.get("type") == "event":
            self.events.append(raw)
            return None
        return raw

    def wait(self, msg_id: int, timeout: float = 240.0) -> dict:
        if msg_id in self._pending:
            return self._pending.pop(msg_id)
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = self._pump(min(5.0, deadline - time.time()))
            if raw is None:
                continue
            if raw.get("type") == "result" and raw.get("id") == msg_id:
                return raw
            if raw.get("type") == "result":
                self._pending[raw["id"]] = raw
        raise TimeoutError(f"no result for id={msg_id}")

    def result(self, payload: dict, timeout: float = 240.0) -> dict:
        res = self.wait(self.send(payload), timeout)
        if not res.get("success"):
            raise RuntimeError(f"{payload.get('type')} failed: {res.get('error')}")
        return res.get("result") or {}

    def drain(self, seconds: float) -> None:
        deadline = time.time() + seconds
        while time.time() < deadline:
            self._pump(min(1.0, deadline - time.time()))


ha = HaWs()
print(f"connected to {ws_url}", flush=True)
state = ha.result({"type": "sofabaton_x1s/control_panel/state"})
hub = next(h for h in state["hubs"] if HUB_MATCH in str(h.get("name") or "").lower())
entry_id = hub["entry_id"]
states_all = ha.result({"type": "get_states"}) if False else None
raw_states = ha.wait(ha.send({"type": "get_states"}))["result"]
entity_id = next(s["entity_id"] for s in raw_states
                 if s["entity_id"].startswith("remote.")
                 and s.get("attributes", {}).get("entry_id") == entry_id)
print(f"hub: {hub.get('name')} entity: {entity_id}", flush=True)


def find_activity(bundle: dict, act_id: int) -> dict | None:
    for act in bundle.get("activities") or []:
        if int((act.get("device") or {}).get("device_id") or 0) == act_id:
            return act
    return None


def structural_bundle() -> dict:
    return ha.result({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id}).get("bundle") or {}


def poll_activity_sync(op_id: str | None, label: str) -> bool:
    deadline = time.time() + 300
    while time.time() < deadline:
        ha.drain(2.0)
        ops = ha.result({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
        op = ops.get("activity_sync") or {}
        if op_id and op.get("operation_id") != op_id:
            op = {}
        status = str(op.get("status") or "")
        if status in ("success", "failed"):
            check(f"{label}: sync {status}", status == "success", str(op.get("message") or ""))
            return status == "success"
    check(f"{label}: sync timed out", False)
    return False


def press_events_since(mark: int, *, press_type: str, device_id: int) -> list[dict]:
    hits = []
    for event in ha.events[mark:]:
        data = ((event.get("event") or {}).get("data") or event.get("event") or {})
        if int(data.get("device_id") or data.get("deviceId") or -1) == device_id \
           and str(data.get("press_type") or data.get("pressType") or "") == press_type:
            hits.append(data)
    return hits


def wait_press(label: str, *, press_type: str, device_id: int, notification_id: str | None) -> None:
    if notification_id:
        ha.result({"type": "call_service", "domain": "persistent_notification",
                   "service": "dismiss", "service_data": {"notification_id": notification_id}})
    mark = len(ha.events)
    deadline = time.time() + PRESS_WINDOW
    feed_hit: list[dict] = []
    notify_hit = notification_id is None
    while time.time() < deadline and not (feed_hit and notify_hit):
        ha.drain(1.5)
        if not feed_hit:
            feed_hit = press_events_since(mark, press_type=press_type, device_id=device_id)
        if not notify_hit:
            notes = ha.result({"type": "persistent_notification/get"})
            listed = notes if isinstance(notes, list) else []
            if any(n.get("notification_id") == notification_id for n in listed):
                notify_hit = True
    check(f"{label}: press feed event ({press_type})", bool(feed_hit), f"{feed_hit[:1]}")
    if notification_id:
        check(f"{label}: action ran", notify_hit)


artifacts: dict = {"hub": hub.get("name")}
events_dev_id: int | None = None
try:
    # ── setup: one event + favorite + RED short/long on ACT_A ──────────
    print("\n=== setup: create event + references ===", flush=True)
    created = ha.result({"type": "sofabaton_x1s/wifi_event/create", "entity_id": entity_id, "name": EV_A}, timeout=300)
    ev_a = created.get("event") or {}
    assert ev_a.get("device_id"), created
    events_dev_id = int(ev_a["device_id"])
    ha.result({"type": "sofabaton_x1s/wifi_event/set_action", "entity_id": entity_id, "slot_index": 0,
               "press_type": "short", "action": {"action": "perform-action",
               "perform_action": "persistent_notification.create",
               "data": {"notification_id": NOTIFY_SHORT, "title": "Bench", "message": "short"}}})
    ha.result({"type": "sofabaton_x1s/wifi_event/set_longpress", "entity_id": entity_id, "slot_index": 0, "enabled": True})
    ha.result({"type": "sofabaton_x1s/wifi_event/set_action", "entity_id": entity_id, "slot_index": 0,
               "press_type": "long", "action": {"action": "perform-action",
               "perform_action": "persistent_notification.create",
               "data": {"notification_id": NOTIFY_LONG, "title": "Bench", "message": "long"}}})
    check("setup: event deployed + actions staged", True, f"device={events_dev_id}")

    baseline = structural_bundle()
    edited = copy.deepcopy(baseline)
    act = find_activity(edited, ACT_A)
    assert act
    top = max([0] + [int(r.get("button_id") or 0) for r in
                     list(act.get("favorite_slots") or []) + list(act.get("macros") or [])
                     if int(r.get("button_id") or 0) not in (198, 199)])
    act.setdefault("favorite_slots", []).append(
        {"button_id": top + 1, "device_id": events_dev_id, "command_id": 1, "name": EV_A})
    bindings = act.setdefault("button_bindings", [])
    bindings[:] = [b for b in bindings if int(b.get("button_id") or 0) != RED]
    bindings.append({"button_id": RED, "device_id": events_dev_id, "command_id": 1,
                     "long_press_device_id": events_dev_id, "long_press_command_id": 51})
    for macro in act.get("macros") or []:
        mbid = int(macro.get("button_id") or 0)
        steps = macro.setdefault("steps", [])
        if mbid == 198:
            steps.append({"device_id": events_dev_id, "command_id": 0xC6, "button_code": 0, "duration": 0, "delay": 0xFF})
            steps.append({"device_id": events_dev_id, "command_id": 0xC5, "button_code": 0, "duration": 0, "delay": 0xFF})
        elif mbid == 199:
            steps.append({"device_id": events_dev_id, "command_id": 0xC7, "button_code": 0, "duration": 0, "delay": 0xFF})
    act["referenced_source_device_ids"] = sorted({
        int(s.get("device_id") or 0)
        for m in act.get("macros") or [] if int(m.get("button_id") or 0) in (198, 199)
        for s in m.get("steps") or []
        if int(s.get("device_id") or 0) > 0 and int(s.get("command_id") or 0) in (0xC5, 0xC6, 0xC7)})
    start = ha.result({"type": "sofabaton_x1s/activity/sync", "entry_id": entry_id,
                       "activity_id": ACT_A, "baseline": baseline, "edited": edited})
    if not poll_activity_sync(start.get("operation_id"), "setup"):
        raise SystemExit("setup sync failed")

    # subscribe to the press feed (the card's flash source)
    sub_id = ha.send({"type": "sofabaton_x1s/wifi_presses/subscribe", "entry_id": entry_id})
    sub_res = ha.wait(sub_id)
    check("setup: wifi_presses subscription", sub_res.get("success") is True)

    # ── presses ────────────────────────────────────────────────────────
    print("\n=== presses: open 'Watch a movie' on the remote (wait for its resync) ===", flush=True)
    print(f">>> TAP the favorite '{EV_A}' now ({PRESS_WINDOW:.0f}s window)", flush=True)
    wait_press("favorite", press_type="short", device_id=events_dev_id, notification_id=NOTIFY_SHORT)
    print(f">>> SHORT-PRESS RED now ({PRESS_WINDOW:.0f}s window)", flush=True)
    wait_press("RED short", press_type="short", device_id=events_dev_id, notification_id=NOTIFY_SHORT)
    print(f">>> HOLD RED (long press) now ({PRESS_WINDOW:.0f}s window)", flush=True)
    wait_press("RED long", press_type="long", device_id=events_dev_id, notification_id=NOTIFY_LONG)
finally:
    # ── teardown: delete event, restore ACT_A ──────────────────────────
    print("\n=== teardown ===", flush=True)
    try:
        if events_dev_id is not None:
            ha.result({"type": "sofabaton_x1s/wifi_event/delete", "entity_id": entity_id, "slot_index": 0}, timeout=300)
            recovery = json.loads(RECOVERY.read_text(encoding="utf-8"))
            rec_act = find_activity(recovery, ACT_A) or {}
            rec_red = next((b for b in rec_act.get("button_bindings") or []
                            if int(b.get("button_id") or 0) == RED), None)
            bundle_t = structural_bundle()
            restored = copy.deepcopy(bundle_t)
            act_t = find_activity(restored, ACT_A)
            if act_t:
                act_t["favorite_slots"] = [s for s in act_t.get("favorite_slots") or []
                                           if int(s.get("device_id") or 0) != events_dev_id]
                for macro in act_t.get("macros") or []:
                    macro["steps"] = [s for s in macro.get("steps") or []
                                      if int(s.get("device_id") or 0) != events_dev_id]
                bindings_t = [b for b in act_t.get("button_bindings") or []
                              if int(b.get("button_id") or 0) != RED]
                if rec_red:
                    bindings_t.append(copy.deepcopy(rec_red))
                act_t["button_bindings"] = bindings_t
                act_t["referenced_source_device_ids"] = sorted({
                    int(s.get("device_id") or 0)
                    for m in act_t.get("macros") or [] if int(m.get("button_id") or 0) in (198, 199)
                    for s in m.get("steps") or []
                    if int(s.get("device_id") or 0) > 0 and int(s.get("command_id") or 0) in (0xC5, 0xC6, 0xC7)})
                start = ha.result({"type": "sofabaton_x1s/activity/sync", "entry_id": entry_id,
                                   "activity_id": ACT_A, "baseline": bundle_t, "edited": restored})
                poll_activity_sync(start.get("operation_id"), "teardown")
            final_events = ha.result({"type": "sofabaton_x1s/wifi_event/list", "entity_id": entity_id}).get("events") or []
            check("teardown: events empty", final_events == [])
    except Exception as exc:  # noqa: BLE001
        check("teardown", False, str(exc))
    out = Path(__file__).parent / "out" / "evE2E-press-check.json"
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    artifacts["feed_events"] = ha.events[-20:]
    out.write_text(json.dumps(artifacts, indent=2, default=str), encoding="utf-8")
    print(f"\nartifacts saved: {out}", flush=True)

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed", flush=True)
sys.exit(1 if failed else 0)
