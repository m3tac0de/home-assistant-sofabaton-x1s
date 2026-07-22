"""One-shot: current W6 state — last activity_sync op + ACT_A bench refs."""
from __future__ import annotations

import json
import ssl
import time
from pathlib import Path

import websocket

SCRIPTS = Path(__file__).resolve().parents[1]
config = json.loads((SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
token = (SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
ws_url = config["base_url"].replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"

ws = websocket.create_connection(ws_url, sslopt={"cert_reqs": ssl.CERT_NONE}, timeout=120)
assert json.loads(ws.recv())["type"] == "auth_required"
ws.send(json.dumps({"type": "auth", "access_token": token}))
assert json.loads(ws.recv())["type"] == "auth_ok"
_id = 0


def call(payload):
    global _id
    _id += 1
    ws.send(json.dumps({"id": _id, **payload}))
    deadline = time.time() + 120
    while time.time() < deadline:
        raw = json.loads(ws.recv())
        if raw.get("type") == "result" and raw.get("id") == _id:
            assert raw.get("success"), raw
            return raw.get("result") or {}
    raise TimeoutError


state = call({"type": "sofabaton_x1s/control_panel/state"})
hub = next(h for h in state["hubs"] if "x1s" in str(h.get("name", "")).lower())
entry_id = hub["entry_id"]

ops = call({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
act_sync = ops.get("activity_sync") or {}
print("last activity_sync op:", json.dumps({k: act_sync.get(k) for k in ("operation_id", "status", "phase", "message", "failed_at")}, indent=1))
print("active_operation:", ops.get("active_operation"))

bundle = call({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id}).get("bundle") or {}
act = next((a for a in bundle.get("activities") or [] if int((a.get("device") or {}).get("device_id") or 0) == 0x65), {})
favs = [s for s in act.get("favorite_slots") or [] if int(s.get("device_id") or 0) == 10]
binds = [b for b in act.get("button_bindings") or [] if int(b.get("button_id") or 0) == 0xBE]
macros = [m for m in act.get("macros") or [] if str(m.get("name") or "") == "Bench Ev Macro"]
print("ACT_A bench favorites:", favs)
print("ACT_A RED binding:", binds)
print("ACT_A bench macro:", json.dumps(macros))
ws.close()
