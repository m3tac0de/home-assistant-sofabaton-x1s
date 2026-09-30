"""Code review bench program BP4: the HA path after R5 wave 2 (X1 via HA).

Drives the deployed HA instance's own APIs (no direct hub connection):

1. Rapid presses on an idle hub: remote.send_command, ten presses with no
   delay, all reach the wire in order (the one-operation rule never
   covers presses).
2. A whole-hub backup runs (a registry operation). Meanwhile:
   - CR-X1-3: device/power_state answers unknown at once;
   - CR-X1-6 / CR-H2-2: a guarded read (blobs/fetch) answers ``busy``,
     a hub service (get_favorites) is refused;
   - CR-X1-5: the Resync remote button is refused;
   - presses are still accepted and reach the wire.
   After it: power_state and the Resync button work again.
3. Wifi deploy on the X1 (replace path, a bench-only record):
   - CR-H1-4: slot 1 binds the X2-only button ``a``; if the X1 refuses
     that write, the deploy must fail naming the row, keep the device and
     read "sync needed". If the X1 accepts it, CR-H1-4 cannot be forced
     live and stays suite-proven;
   - CR-H3-9: slot 1's action is homeassistant.check_config (seconds
     long); a press through the hub must be answered before the action
     finishes (listener "accepted" -> "completed" gap) and arrive once.
   Cleanup: zero-slot sync (deletes the device) and the record deleted.

Usage: python bench_290_ha_path.py
"""

from __future__ import annotations

import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import websocket

SCRIPTS = Path(__file__).resolve().parents[1]
config = json.loads((SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
TOKEN = (SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
BASE_URL = config["base_url"].rstrip("/")
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/websocket"
HA_LOG = Path("Z:/homeassistant/config/home-assistant.log")

ENTRY_PREFIX = "01KVQY37"          # X1
HA_DEVICE_NAME = "X1 HUB"
SENSOR = "sensor.x1_hub_wifi_commands"
TEST_DEVICE = 12                    # X1 "test device 1"
ACTIVITY = 102                      # an X1 activity
BENCH_NAME = "Bench BP4"

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""), flush=True)


class HaWs:
    def __init__(self) -> None:
        self.ws = websocket.create_connection(WS_URL, sslopt={"cert_reqs": ssl.CERT_NONE}, timeout=900)
        assert json.loads(self.ws.recv())["type"] == "auth_required"
        self.ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        assert json.loads(self.ws.recv())["type"] == "auth_ok"
        self._id = 0
        self._pending: dict[int, dict] = {}

    def call(self, payload: dict, timeout: float = 900.0) -> tuple[dict, float]:
        self._id += 1
        msg_id = self._id
        t0 = time.time()
        self.ws.send(json.dumps({"id": msg_id, **payload}))
        if msg_id in self._pending:
            return self._pending.pop(msg_id), time.time() - t0
        deadline = t0 + timeout
        while time.time() < deadline:
            raw = json.loads(self.ws.recv())
            if raw.get("type") != "result":
                continue
            if raw.get("id") == msg_id:
                return raw, time.time() - t0
            self._pending[raw["id"]] = raw
        raise TimeoutError(f"no result for {payload.get('type')}")

    def ok(self, payload: dict, timeout: float = 900.0) -> dict:
        res, _ = self.call(payload, timeout)
        if not res.get("success"):
            raise RuntimeError(f"{payload.get('type')} failed: {res.get('error')}")
        return res.get("result") or {}


def rest(path: str, payload: dict | None = None, *, timeout: float = 60.0) -> tuple[int, object, float]:
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "null"), time.time() - t0
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode(errors="replace"), time.time() - t0
    except TimeoutError:
        # A long service call (a deploy) holds the connection; callers that
        # fire and forget poll progress instead.
        return 0, None, time.time() - t0


def log_mark() -> int:
    return HA_LOG.stat().st_size


def log_since(mark: int) -> list[str]:
    with HA_LOG.open("rb") as handle:
        handle.seek(mark)
        return handle.read().decode("utf-8", errors="replace").splitlines()


def activate_sends(lines: list[str], dev: int) -> int:
    """REQ_ACTIVATE frames written to the X1 (the bench is the only sender)."""
    return sum(1 for line in lines if ENTRY_PREFIX in line and "[SEND] hub REQ_ACTIVATE" in line)


def wait_for_ha(ws_factory) -> HaWs:
    deadline = time.time() + 900
    while True:
        try:
            ws = ws_factory()
            ws.ok({"type": "sofabaton_x1s/control_panel/state"})
            return ws
        except Exception as err:  # noqa: BLE001
            if time.time() > deadline:
                raise
            print(f"  HA not ready yet ({err}); waiting...", flush=True)
            time.sleep(15)


# -- setup ---------------------------------------------------------------------------------------

ha = wait_for_ha(HaWs)
state = ha.ok({"type": "sofabaton_x1s/control_panel/state"})
hub = next((h for h in state.get("hubs") or [] if str(h.get("entry_id", "")).startswith(ENTRY_PREFIX)), None)
if hub is None:
    sys.exit("X1 entry not loaded")
entry_id = hub["entry_id"]
entities = ha.ok({"type": "config/entity_registry/list"})
mine = [e for e in entities if e.get("config_entry_id") == entry_id]
remote_entity = next(e["entity_id"] for e in mine if e["entity_id"].startswith("remote."))
resync_button = next(e["entity_id"] for e in mine if str(e.get("unique_id", "")).endswith("_resync_remote"))
devices = ha.ok({"type": "config/device_registry/list"})
dev_reg_id = next(d["id"] for d in devices if entry_id in (d.get("config_entries") or []))
print(f"X1 entry {entry_id[:8]}: {remote_entity}, {resync_button}, device {dev_reg_id[:8]}", flush=True)
# wait for the hub to be connected (after a restart)
deadline = time.time() + 300
while time.time() < deadline:
    status, st, _ = rest(f"/api/states/{remote_entity}")
    if status == 200 and st.get("state") not in ("unavailable", "unknown"):
        break
    time.sleep(5)
print(f"remote state: {st.get('state')}", flush=True)


def press(command: list[str], device: int) -> tuple[int, float]:
    status, _, dt = rest("/api/services/remote/send_command",
                         {"entity_id": remote_entity, "command": command, "device": device, "delay_secs": 0})
    return status, dt


# -- 1: rapid presses, idle hub ------------------------------------------------------------------

print("\n== 1: ten presses, no delay, idle hub ==", flush=True)
mark = log_mark()
status, dt = press(["1"] * 10, TEST_DEVICE)
time.sleep(4)
sent = activate_sends(log_since(mark), TEST_DEVICE)
check("idle: the press call is accepted", status == 200, f"{dt:.2f}s")
check("idle: all ten presses reach the wire", sent == 10, f"sent={sent}")

# -- 2: during a registry operation --------------------------------------------------------------

print("\n== 2: a whole-hub backup runs ==", flush=True)
op_id = ha.ok({"type": "sofabaton_x1s/backup/export", "entry_id": entry_id}).get("operation_id")
check("backup started", bool(op_id), str(op_id))
time.sleep(2)

res, dt = ha.call({"type": "sofabaton_x1s/device/power_state", "entry_id": entry_id, "device_id": TEST_DEVICE})
check("CR-X1-3: power_state answers unknown while busy",
      res.get("success") and (res.get("result") or {}).get("power_state") is None and dt < 2.0, f"{dt:.2f}s {res.get('result')}")

res, _ = ha.call({"type": "sofabaton_x1s/blobs/fetch", "entry_id": entry_id, "device_id": TEST_DEVICE, "command_id": 1})
check("CR-X1-6: a guarded hub read answers busy", (res.get("error") or {}).get("code") == "busy", str(res.get("error")))

refusals = log_mark()
status, body, _ = rest("/api/services/sofabaton_x1s/get_favorites?return_response",
                       {"device": dev_reg_id, "activity_id": ACTIVITY})
status_btn, _, _ = rest("/api/services/button/press", {"entity_id": resync_button})
time.sleep(3)
refused = "\n".join(log_since(refusals))
# HA's REST API answers a service's HomeAssistantError with a bare 500; the reason is in the log.
check("CR-H2-2: a hub service is refused", status >= 400 and "hub_busy: _async_handle_get_favorites" in refused, str(status))
check("CR-X1-5: the Resync remote button is refused",
      status_btn >= 400 and "The hub is busy with a backup, restore or sync" in refused, str(status_btn))

mark = log_mark()
status, dt = press(["1"] * 5, TEST_DEVICE)
check("presses during the backup are accepted", status == 200, f"{dt:.2f}s")

deadline = time.time() + 600
final = None
while time.time() < deadline:
    result = ha.ok({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
    op = result.get("backup_export") or {}
    if result.get("active_operation") is None and op.get("status") in ("success", "failed"):
        final = op
        break
    time.sleep(2)
check("backup completed", (final or {}).get("status") == "success", str((final or {}).get("status")))
check("CR-X2-5: backup/state carries counts, not the bundle",
      final is not None and "backup" not in final and final.get("has_backup") is True, str((final or {}).get("backup_summary")))
time.sleep(3)
sent = activate_sends(log_since(mark), TEST_DEVICE)
check("presses sent during the backup reached the wire", sent == 5, f"sent={sent}")

res, dt = ha.call({"type": "sofabaton_x1s/device/power_state", "entry_id": entry_id, "device_id": TEST_DEVICE}, timeout=60)
check("power_state reads the hub again when idle", res.get("success") and (res.get("result") or {}).get("power_state") is not None,
      f"{dt:.2f}s {res.get('result')}")
status, body, _ = rest("/api/services/button/press", {"entity_id": resync_button})
check("the Resync remote button works when idle", status == 200, str(status))
time.sleep(5)

# -- 3: Wifi deploy on the X1 --------------------------------------------------------------------

print("\n== 3: Wifi deploy (replace path) ==", flush=True)


def default_slot(n: int) -> dict:
    return {"name": f"Command {n}", "add_as_favorite": True, "hard_button": "",
            "long_press_enabled": False, "input_activity_id": "", "activities": []}


def bench_record() -> dict | None:
    for dev in ha.ok({"type": "sofabaton_x1s/command_devices/list", "entity_id": SENSOR}).get("devices") or []:
        if str(dev.get("device_name") or "") == BENCH_NAME:
            return dev
    return None


def progress(key: str) -> dict:
    return ha.ok({"type": "sofabaton_x1s/command_sync/progress", "entity_id": SENSOR, "device_key": key})


def run_sync(key: str, timeout: float = 900.0) -> dict:
    before = progress(key)
    rest("/api/services/sofabaton_x1s/sync_command_config", {"device": dev_reg_id, "device_key": key}, timeout=5)
    deadline = time.time() + timeout
    while time.time() < deadline:
        prog = progress(key)
        if any(prog.get(k) != before.get(k) for k in ("status", "message", "commands_hash", "current_step")) \
                and prog.get("status") in ("success", "failed"):
            return prog
        time.sleep(2)
    raise TimeoutError("sync did not finish")


record = bench_record()
key = str((record or {}).get("device_key") or "")
if not key:
    key = str(ha.ok({"type": "sofabaton_x1s/command_device/create", "entity_id": SENSOR,
                     "device_name": BENCH_NAME}).get("device_key") or "")
print(f"bench record {key!r}", flush=True)
slots = [default_slot(n) for n in range(1, 11)]
slots[0].update({"name": "BP4 Slow", "add_as_favorite": False, "hard_button": "a", "activities": [str(ACTIVITY)],
                 "action": {"action": "perform-action", "perform_action": "homeassistant.check_config"}})
ha.ok({"type": "sofabaton_x1s/command_config/set", "entity_id": SENSOR, "commands": slots, "device_key": key})
try:
    prog = run_sync(key)
except TimeoutError:
    prog = {"status": "timeout"}
print(f"  sync: {prog.get('status')} {prog.get('message')}", flush=True)
record = bench_record() or {}
wifi_dev = record.get("deployed_device_id")
if prog.get("status") == "failed" and "Failed applying" in str(prog.get("message")):
    check("CR-H1-4: a refused binding fails the deploy and names the row", "button a" in str(prog.get("message")),
          str(prog.get("message")))
    check("CR-H1-4: the device is recorded but reads sync needed",
          isinstance(wifi_dev, int) and not record.get("deployed_commands_hash"), f"dev={wifi_dev} hash={record.get('deployed_commands_hash')!r}")
elif prog.get("status") == "success":
    print("  the X1 accepted the 'a' binding: CR-H1-4 cannot be forced live (suite-proven)", flush=True)
    check("deploy succeeded", True)
else:
    check("deploy finished", False, str(prog))

if isinstance(wifi_dev, int):
    print(f"\n== 3b: press the slow slot on Wifi Device {wifi_dev} ==", flush=True)
    mark = log_mark()
    status, _ = press(["1"], wifi_dev)
    time.sleep(25)
    lines = [line for line in log_since(mark) if "WIFI_HTTP" in line and f"/{wifi_dev}/0/short" in line]
    accepted = [line for line in lines if "accepted listener request" in line]
    completed = [line for line in lines if "request completed" in line]

    def ts(line: str) -> float:
        stamp = re.match(r"(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+)", line)
        return time.mktime(time.strptime(stamp.group(1)[:19], "%Y-%m-%d %H:%M:%S")) + float("0." + stamp.group(1)[20:]) if stamp else 0.0

    check("CR-H3-9: the callback arrived once", len(accepted) == 1, f"accepted={len(accepted)}")
    if accepted and completed:
        gap = ts(completed[0]) - ts(accepted[0])
        check("CR-H3-9: the hub is answered before the slow action ends", gap < 1.0, f"gap={gap:.3f}s")
    else:
        check("CR-H3-9: callback lines found", False, f"lines={len(lines)}")

    print("\n== cleanup: zero-slot sync + delete the bench record ==", flush=True)
    ha.ok({"type": "sofabaton_x1s/command_config/set", "entity_id": SENSOR,
           "commands": [default_slot(n) for n in range(1, 11)], "device_key": key})
    prog = run_sync(key)
    check("cleanup sync removed the device", prog.get("status") == "success", str(prog.get("message")))
try:
    ha.ok({"type": "sofabaton_x1s/command_device/delete", "entity_id": SENSOR, "device_key": key})
    print("  bench record deleted", flush=True)
except RuntimeError as err:
    print(f"  bench record delete: {err}", flush=True)

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed", flush=True)
sys.exit(1 if failed else 0)
