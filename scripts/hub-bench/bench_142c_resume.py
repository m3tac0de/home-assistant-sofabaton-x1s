"""W6 resume: P5-P8 on a hub already carrying the bench_142 P1-P4 state.

P4's sync landed (verified by bench_142b_probe); only the runner's op
polling was wrong. This finishes the program: manual presses, the §6a
rename, the cascade deletes, and the ACT_A restore. The restore is
surgical: bench additions are removed and the RED binding is reset to
its value in the morning's recovery bundle (evrefs-bundle-…, whose
ACT_A block was byte-identical-validated at the end of bench_141).

Usage: python bench_142c_resume.py <hub-name-substring> <recovery-bundle.json>
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
        assert json.loads(self.ws.recv())["type"] == "auth_required"
        self.ws.send(json.dumps({"type": "auth", "access_token": token}))
        assert json.loads(self.ws.recv())["type"] == "auth_ok"
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


ha = HaWs()
print(f"connected to {ws_url}", flush=True)
state = ha.result({"type": "sofabaton_x1s/control_panel/state"})
hub = next(h for h in state["hubs"] if HUB_MATCH in str(h.get("name") or "").lower()
           or HUB_MATCH in str(h.get("version") or "").lower())
entry_id = hub["entry_id"]
states = ha.call({"type": "get_states"})["result"]
entity_id = next(s["entity_id"] for s in states
                 if s["entity_id"].startswith("remote.")
                 and s.get("attributes", {}).get("entry_id") == entry_id)
sensor_ids = [s["entity_id"] for s in states
              if s["entity_id"].startswith("sensor.") and s["entity_id"].endswith("_wifi_commands")]
print(f"hub: {hub.get('name')} entity: {entity_id}", flush=True)

events = ha.result({"type": "sofabaton_x1s/wifi_event/list", "entity_id": entity_id}).get("events") or []
ev_a = next(e for e in events if e["slot_index"] == 0)
ev_b = next(e for e in events if e["slot_index"] == 1)
assert ev_a["name"] == EV_A and ev_b["name"] in (EV_B, EV_B2), events
events_dev_id = int(ev_a["device_id"])
print(f"resumed: A={ev_a['name']} B={ev_b['name']} device={events_dev_id}", flush=True)


def sensor_snapshot() -> dict[str, tuple[str, str]]:
    states_now = ha.call({"type": "get_states"})["result"]
    return {s["entity_id"]: (str(s.get("state")), str(s.get("last_updated")))
            for s in states_now if s["entity_id"] in sensor_ids}


def wait_for_press(expect_state_contains: str, notification_id: str | None, window: float) -> tuple[bool, bool, str]:
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
            for sensor, pair in sensor_snapshot().items():
                if before.get(sensor) != pair and expect_state_contains.lower() in pair[0].lower():
                    sensor_hit = True
                    detail = f"{sensor}={pair[0]}"
                    break
        if not notify_hit:
            notes = ha.call({"type": "persistent_notification/get"})["result"] or []
            if any(n.get("notification_id") == notification_id for n in notes):
                notify_hit = True
    return sensor_hit, notify_hit, detail


def poll_operation(kind: str, op_id: str | None, label: str, timeout: float = 300.0) -> bool:
    """Correct op polling: backup/state keys ops by kind (latest per entry)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        time.sleep(2.0)
        ops = ha.result({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
        op = ops.get(kind) or {}
        if op_id and op.get("operation_id") != op_id:
            op = {}
        status = str(op.get("status") or "")
        if status in ("success", "failed"):
            check(f"{label}: {kind} {status}", status == "success", str(op.get("message") or ""))
            return status == "success"
        if not op and ops.get("active_operation") is None and time.time() - (deadline - timeout) > 10:
            # Registry already dismissed a fast transient op — treat a
            # missing op with an idle registry as completed and verify by
            # effect at the caller.
            check(f"{label}: {kind} finished (op dismissed)", True, "verified by effect")
            return True
    check(f"{label}: {kind} timed out", False)
    return False


def structural_bundle() -> dict:
    return ha.result({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id}).get("bundle") or {}


def find_activity(bundle: dict, act_id: int) -> dict | None:
    for act in bundle.get("activities") or []:
        if int((act.get("device") or {}).get("device_id") or 0) == act_id:
            return act
    return None


artifacts: dict = {"hub": hub.get("name"), "resumed": True}
try:
    # ── P5: manual presses ─────────────────────────────────────────────
    print("\n=== P5: MANUAL — open 'Watch a movie' on the remote ===", flush=True)
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
    s_hit, _n, detail = wait_for_press("Bench Ev", None, PRESS_WINDOW)
    check("P5: macro step -> sensor shows Ev B", s_hit, detail)

    # ── P6: §6a command rename via device/sync ─────────────────────────
    if ev_b["name"] != EV_B2:
        print("\n=== P6: rename command record via device/sync ===", flush=True)
        baseline6 = structural_bundle()
        edited6 = copy.deepcopy(baseline6)
        for device in edited6.get("devices") or []:
            if int((device.get("device") or {}).get("device_id") or 0) == events_dev_id:
                for command in device.get("commands") or []:
                    if int(command.get("command_id") or 0) == 2:
                        command["name"] = EV_B2
        start = ha.result({"type": "sofabaton_x1s/device/sync", "entry_id": entry_id,
                           "device_id": events_dev_id, "baseline": baseline6, "edited": edited6})
        poll_operation("device_sync", start.get("operation_id"), "P6")
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

    # ── P8: surgical restore of ACT_A ──────────────────────────────────
    print("\n=== P8: restore ACT_A (surgical + RED from recovery bundle) ===", flush=True)
    recovery = json.loads(RECOVERY.read_text(encoding="utf-8"))
    rec_act = find_activity(recovery, ACT_A) or {}
    rec_red = next((b for b in rec_act.get("button_bindings") or []
                    if int(b.get("button_id") or 0) == RED), None)
    bundle8 = structural_bundle()
    restored = copy.deepcopy(bundle8)
    act8 = find_activity(restored, ACT_A)
    assert act8
    act8["favorite_slots"] = [s for s in act8.get("favorite_slots") or []
                              if int(s.get("device_id") or 0) != events_dev_id]
    act8["macros"] = [m for m in act8.get("macros") or []
                      if str(m.get("name") or "") != "Bench Ev Macro"]
    for macro in act8.get("macros") or []:
        macro["steps"] = [s for s in macro.get("steps") or []
                          if int(s.get("device_id") or 0) != events_dev_id]
    bindings8 = [b for b in act8.get("button_bindings") or []
                 if int(b.get("button_id") or 0) != RED]
    if rec_red:
        bindings8.append(copy.deepcopy(rec_red))
    act8["button_bindings"] = bindings8
    act8["referenced_source_device_ids"] = sorted({
        int(s.get("device_id") or 0)
        for m in act8.get("macros") or [] if int(m.get("button_id") or 0) in (198, 199)
        for s in m.get("steps") or []
        if int(s.get("device_id") or 0) > 0 and int(s.get("command_id") or 0) in (0xC5, 0xC6, 0xC7)
    })
    start = ha.result({"type": "sofabaton_x1s/activity/sync", "entry_id": entry_id,
                       "activity_id": ACT_A, "baseline": bundle8, "edited": restored})
    poll_operation("activity_sync", start.get("operation_id"), "P8")
    final_act = find_activity(structural_bundle(), ACT_A) or {}
    leftover = [s for s in final_act.get("favorite_slots") or []
                if int(s.get("device_id") or 0) == events_dev_id]
    leftover += [b for b in final_act.get("button_bindings") or []
                 if int(b.get("device_id") or 0) == events_dev_id
                 or int(b.get("long_press_device_id") or 0) == events_dev_id]
    leftover += [m for m in final_act.get("macros") or [] if str(m.get("name") or "") == "Bench Ev Macro"]
    check("P8: no bench refs left on ACT_A", not leftover, f"{leftover}")
    red_now = next((b for b in final_act.get("button_bindings") or []
                    if int(b.get("button_id") or 0) == RED), None)
    check("P8: RED binding restored to pre-bench value",
          (red_now or {}).get("device_id") == (rec_red or {}).get("device_id")
          and (red_now or {}).get("command_id") == (rec_red or {}).get("command_id"),
          f"now={red_now} want={rec_red}")
finally:
    out = Path(__file__).parent / "out" / "evE2E-X1S-resume.json"
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    out.write_text(json.dumps(artifacts, indent=2, default=str), encoding="utf-8")
    print(f"\nartifacts saved: {out}", flush=True)

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed", flush=True)
sys.exit(1 if failed else 0)
