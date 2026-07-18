"""HA UI smoke, part 2: long-exchange contention through the card's path.

The deliberate worst case from the UI risk assessment: start a full
backup export (a long chain of blocking exchanges on the executor) on
the X1, then, while it runs, repeatedly hit the paths a user's card
would fire — catalog refreshes and Activities-editor structural
bundles — and finally collect the backup result. Everything must
succeed; the per-call latencies show what a user would experience.

Usage: bench_131_ha_ws_contention.py <entry_prefix>
"""

from __future__ import annotations

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

ENTRY_PREFIX = sys.argv[1] if len(sys.argv) > 1 else "01KVQY37"  # X1

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


class HaWs:
    def __init__(self) -> None:
        self.ws = websocket.create_connection(
            ws_url, sslopt={"cert_reqs": ssl.CERT_NONE}, timeout=600
        )
        assert json.loads(self.ws.recv())["type"] == "auth_required"
        self.ws.send(json.dumps({"type": "auth", "access_token": token}))
        assert json.loads(self.ws.recv())["type"] == "auth_ok"
        self._id = 0
        self._pending: dict[int, dict] = {}

    def send(self, payload: dict) -> int:
        self._id += 1
        self.ws.send(json.dumps({"id": self._id, **payload}))
        return self._id

    def wait(self, msg_id: int, timeout: float = 600.0) -> dict:
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

    def call(self, payload: dict, timeout: float = 600.0) -> tuple[dict, float]:
        t0 = time.time()
        return self.wait(self.send(payload), timeout), time.time() - t0


ha = HaWs()
state, _ = ha.call({"type": "sofabaton_x1s/control_panel/state"})
hubs = (state.get("result") or {}).get("hubs") or []
hub = next((h for h in hubs if str(h.get("entry_id", "")).startswith(ENTRY_PREFIX)), None)
if hub is None:
    sys.exit(f"no hub with entry prefix {ENTRY_PREFIX}")
entry_id = hub["entry_id"]
print(f"target hub: {hub.get('name')} ({entry_id[:8]})")

# Start the backup operation (returns an operation_id; the hub-reading
# bundle runs as a background task tracked by the operation registry).
res, _ = ha.call({"type": "sofabaton_x1s/backup/export", "entry_id": entry_id})
op_id = (res.get("result") or {}).get("operation_id")
check("backup/export accepted", bool(res.get("success")) and bool(op_id), f"op={op_id}")
if not op_id:
    sys.exit(1)

t_backup = time.time()
gated_ok = 0
gated_wrong = 0
bundle_calls: list[float] = []
state_calls: list[float] = []
final_op: dict | None = None

while time.time() - t_backup < 420.0:
    # What an impatient user's card would fire mid-backup:
    # 1. catalog refresh — EXPECTED to be refused by the operation gate.
    res, dt = ha.call({"type": "sofabaton_x1s/catalog/refresh", "entry_id": entry_id, "kind": "activities"}, timeout=120.0)
    if res.get("success"):
        gated_wrong += 1  # gate did not hold (only wrong while op is running)
    else:
        msg = ((res.get("error") or {}).get("message") or "")
        gated_ok += 1 if "backup_operation_in_progress" in msg else 0

    # 2. structural bundle — cache-served read, must keep working.
    res, dt = ha.call({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id}, timeout=120.0)
    bundle_calls.append(dt)
    if not res.get("success"):
        check("structural_bundle during backup", False, f"err={res.get('error')}")

    # 3. progress poll — the Backup tab's own view.
    res, dt = ha.call({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id}, timeout=120.0)
    state_calls.append(dt)
    result = res.get("result") or {}
    op = result.get("backup_export") or {}
    # Registry record shape: status/phase/message flat on the op;
    # status is "running" then "success"/"failed". active_operation is
    # None once the gate has lifted.
    status = op.get("status")
    if result.get("active_operation") is None and status in ("success", "failed", "error"):
        final_op = op
        break
    time.sleep(1.0)

backup_dt = time.time() - t_backup
status = (final_op or {}).get("status")
check("backup operation completed", status == "success", f"{backup_dt:.0f}s status={status}")
check("operation gate refused catalog refresh while running", gated_ok > 0 and gated_wrong <= 1,
      f"gated={gated_ok} passed-through={gated_wrong}")
if bundle_calls:
    check("cache reads stayed responsive during backup", max(bundle_calls) < 10.0,
          f"n={len(bundle_calls)} max={max(bundle_calls):.1f}s")

# After completion the gate must lift and the wire paths work again.
res, dt = ha.call({"type": "sofabaton_x1s/catalog/refresh", "entry_id": entry_id, "kind": "activities"}, timeout=120.0)
check("catalog/refresh works after backup", bool(res.get("success")), f"{dt:.1f}s err={res.get('error')}")
res, dt = ha.call({"type": "sofabaton_x1s/cache/structural_bundle", "entry_id": entry_id}, timeout=120.0)
check("structural_bundle works after backup", bool(res.get("success")), f"{dt:.1f}s")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
sys.exit(1 if failed else 0)
