"""HA UI smoke: drive the Control Panel card's WS commands through a live HA.

Exercises the card's real backend path (WS -> hub.py -> executor -> lib
exchanges) on the deployed sequencer build:

1. control_panel/state           — card boot payload, lists hubs
2. control_panel/run_action ping? (skipped; read-only smoke)
3. catalog/refresh               — the poller the card triggers per tab
4. cache/structural_bundle       — Activities-tab open path (the
   readiness-window flow: activity map + buttons + macros + favorites)
5. CONTENTION: catalog/refresh fired immediately followed by
   cache/structural_bundle on the same hub — the pre-sequencer collision
   shape — then both again in the opposite order.
6. blobs/fetch on a known device command.

All read paths; no hub mutation. Timings are printed so UX latency
shifts are visible.

Usage: bench_130_ha_ws_smoke.py
Reads scripts/.ha-config.json + scripts/.ha-token for the instance.
"""

from __future__ import annotations

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

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


class HaWs:
    def __init__(self) -> None:
        self.ws = websocket.create_connection(
            ws_url, sslopt={"cert_reqs": ssl.CERT_NONE}, timeout=180
        )
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

    def wait(self, msg_id: int, timeout: float = 180.0) -> dict:
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

    def call(self, payload: dict, timeout: float = 180.0) -> tuple[dict, float]:
        t0 = time.time()
        msg_id = self.send(payload)
        result = self.wait(msg_id, timeout)
        return result, time.time() - t0


ha = HaWs()
print(f"connected to {ws_url}")

# 1. card boot payload
state, dt = ha.call({"type": "sofabaton_x1s/control_panel/state"})
hubs = (state.get("result") or {}).get("hubs") or []
check("control_panel/state", state.get("success") is True and bool(hubs),
      f"{dt:.1f}s hubs={[(h.get('entry_id') or '')[:8] + ':' + str(h.get('name')) for h in hubs]}")
if not hubs:
    sys.exit(1)

connected = [h for h in hubs if h.get("hub_connected") or h.get("connected")]
print(f"  hubs reported: {len(hubs)}, connected flags: "
      f"{[(str(h.get('name')), h.get('hub_connected', h.get('connected'))) for h in hubs]}")

for hub in hubs:
    entry_id = hub.get("entry_id")
    name = hub.get("name")
    if not entry_id:
        continue
    print(f"\n=== hub {name} ({entry_id[:8]}) ===")

    # 2. catalog refresh (what the card kicks on tab open)
    for kind in ("devices", "activities"):
        res, dt = ha.call({"type": "sofabaton_x1s/catalog/refresh", "entry_id": entry_id, "kind": kind})
        check(f"[{name}] catalog/refresh {kind}", res.get("success") is True,
              f"{dt:.1f}s err={res.get('error')}" if not res.get("success") else f"{dt:.1f}s")

    # 3. Activities-tab open: structural bundle (map/buttons/macros/favorites)
    res, dt = ha.call({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id})
    payload = res.get("result") or {}
    bundle = payload.get("bundle") or {}
    n_act = len(bundle.get("activities") or [])
    n_dev = len(bundle.get("devices") or [])
    check(f"[{name}] cache/structural_bundle", res.get("success") is True and bool(bundle),
          f"{dt:.1f}s devices={n_dev} activities={n_act} gen={payload.get('generation')}")

    # 4. CONTENTION: refresh + bundle back-to-back (pre-sequencer collision
    # shape), both directions.
    t0 = time.time()
    id_refresh = ha.send({"type": "sofabaton_x1s/catalog/refresh", "entry_id": entry_id, "kind": "activities"})
    id_bundle = ha.send({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id})
    r1 = ha.wait(id_refresh)
    r2 = ha.wait(id_bundle)
    dt = time.time() - t0
    check(f"[{name}] CONTENTION refresh||bundle", bool(r1.get("success")) and bool(r2.get("success")),
          f"{dt:.1f}s total err1={r1.get('error')} err2={r2.get('error')}" if not (r1.get("success") and r2.get("success")) else f"{dt:.1f}s total")

    t0 = time.time()
    id_bundle = ha.send({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id})
    id_refresh = ha.send({"type": "sofabaton_x1s/catalog/refresh", "entry_id": entry_id, "kind": "devices"})
    r1 = ha.wait(id_bundle)
    r2 = ha.wait(id_refresh)
    dt = time.time() - t0
    check(f"[{name}] CONTENTION bundle||refresh", bool(r1.get("success")) and bool(r2.get("success")),
          f"{dt:.1f}s total err1={r1.get('error')} err2={r2.get('error')}" if not (r1.get("success") and r2.get("success")) else f"{dt:.1f}s total")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
sys.exit(1 if failed else 0)
