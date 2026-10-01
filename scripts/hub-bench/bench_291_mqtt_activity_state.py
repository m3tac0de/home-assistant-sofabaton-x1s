"""bench_291: the X2 MQTT activity-state fast path, via HA and via the server.

The X2 publishes every activity transition to ``activity/<MAC>/
activity_control_up`` early in its power sequence, before the hub session
confirms it with ACK_READY. Both consumers feed that push to the engine's
``apply_external_activity_state`` (design: docs/internal/mqtt-activity-
state.md). This bench watches the same topic with its own subscriber, so
the hub's publish is timestamped independently, and reads what the
consumer did about it:

``ha``     the live Home Assistant instance keeps the hub. The trigger
           goes through HA (``remote.turn_on`` / ``remote.turn_off``) or
           the physical remote; the HA log on the NAS share shows the
           ``[EXT] applying`` / ``[MQTT_ACT] applied`` / ``[HINT]
           ACK_READY`` lines.
``server`` the X2's HA entry is disabled, a bench server (port 8481,
           scratch data dir, the test broker) registers the X2 by address,
           and the trigger goes through the server's activity routes or
           the remote. The WebSocket stream and the server log tell when
           the push was applied and when ACK_READY followed. The HA entry
           is re-enabled at close-out (also on failure).

Usage:
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_291_mqtt_activity_state.py ha|server <tag>
        [--activity 105] [--trigger auto|remote] [--wait 120] [--broker 192.168.2.77]
        [--broker-user test] [--broker-pass test] [--host 192.168.2.123]

Reports: scripts/hub-bench/out/bench_291_<leg>_<tag>.json (+ the server log
under out/logs/). The server leg imports the INSTALLED sofabaton wheel and
server package: reinstall both before running.
"""

from __future__ import annotations

import argparse
import asyncio
import calendar
import json
import os
import re
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

import bench_common  # noqa: F401  (out/ dirs, logging setup)
from bench_mqtt_client import MiniMqttSubscriber  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SCRIPTS = REPO / "scripts"
HUB_BENCH = Path(__file__).resolve().parent

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("leg", choices=["ha", "server"])
ap.add_argument("tag")
ap.add_argument("--activity", type=int, default=105, help="the activity to start and stop (auto trigger)")
ap.add_argument("--sequence", default=None, help="comma list of activity ids and off, in order (default: <activity>,off)")
ap.add_argument("--pause", type=float, default=4.0, help="seconds between transitions")
ap.add_argument("--trigger", choices=["auto", "remote"], default="auto")
ap.add_argument("--wait", type=float, default=120.0, help="seconds to wait for each push")
ap.add_argument("--host", default="192.168.2.123")
ap.add_argument("--mac", default="FC012C39D390")
ap.add_argument("--broker", default="192.168.2.77")
ap.add_argument("--broker-port", type=int, default=1883)
ap.add_argument("--broker-user", default="test")
ap.add_argument("--broker-pass", default="test")
ap.add_argument("--port", type=int, default=8481)
ap.add_argument("--ha-entry", default="X2", help="title substring of the X2's HA config entry")
ARGS = ap.parse_args()
if ARGS.sequence is None:
    ARGS.sequence = f"{ARGS.activity},off"

TOPIC = f"activity/{ARGS.mac}/activity_control_up"
REPORT: dict = {"bench": "bench_291_mqtt_activity_state", "leg": ARGS.leg, "tag": ARGS.tag, "activity": ARGS.activity, "sequence": ARGS.sequence,
                "trigger": ARGS.trigger, "topic": TOPIC, "steps": [], "checks": [], "problems": []}
T0 = time.time()


def step(name: str, **fields) -> None:
    row = {"step": name, "t": round(time.time() - T0, 2), **fields}
    REPORT["steps"].append(row)
    print(f"[{row['t']:7.2f}s] [{name}] " + ", ".join(f"{k}={v}" for k, v in fields.items()), flush=True)


def check(label: str, ok: bool, detail: str = "") -> None:
    REPORT["checks"].append({"label": label, "ok": bool(ok), "detail": detail})
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""), flush=True)


def problem(text: str) -> None:
    REPORT["problems"].append(text)
    print("PROBLEM:", text, flush=True)


def save() -> None:
    out = bench_common.BENCH_DIR / f"bench_291_{ARGS.leg}_{ARGS.tag}.json"
    out.write_text(json.dumps(REPORT, indent=2, default=str), encoding="utf-8")
    print(f"report: {out}", flush=True)


def stamp(value: float | None) -> str:
    return "-" if value is None else datetime.fromtimestamp(value).strftime("%H:%M:%S.%f")[:-3]


def parse_log_time(line: str, *, utc: bool = False) -> float | None:
    """``2026-10-01 15:04:12.828`` (HA, stamped in UTC on the NAS) or
    ``2026-10-01 15:04:12,828`` (the server, local time) -> epoch."""

    m = re.match(r"(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)[.,](\d{3})", line)
    if not m:
        return None
    parsed = time.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")
    base = calendar.timegm(parsed) if utc else time.mktime(parsed)
    return base + int(m.group(2)) / 1000.0


# -- the independent observer ----------------------------------------------------------------


class Observer:
    """Our own subscription to the activity topic: the hub's publish, timestamped here."""

    def __init__(self) -> None:
        self.sub = MiniMqttSubscriber(ARGS.broker, ARGS.broker_port, username=ARGS.broker_user,
                                      password=ARGS.broker_pass, client_id=f"bench291-{int(T0) & 0xFFFFFF:06x}")

    def start(self) -> None:
        self.sub.start()
        self.sub.subscribe([TOPIC])
        step("observer", broker=f"{ARGS.broker}:{ARGS.broker_port}", topic=TOPIC)

    def wait_push(self, since: int, timeout: float) -> dict | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            hits = self.sub.snapshot()
            if len(hits) > since:
                hit = hits[since]
                try:
                    hit["data"] = json.loads(hit["payload"])
                except ValueError:
                    hit["data"] = None
                return hit
            time.sleep(0.01)
        return None

    def count(self) -> int:
        return len(self.sub.snapshot())

    def stop(self) -> None:
        try:
            self.sub.stop()
        except Exception:  # noqa: BLE001
            pass


# -- the HA leg ---------------------------------------------------------------------------------


HA_CONFIG = json.loads((SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
HA_TOKEN = (SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
HA_BASE = HA_CONFIG["base_url"].rstrip("/")
HA_LOG = Path("Z:/homeassistant/config/home-assistant.log")
HA_REMOTE = "remote.x2_hub_remote"
HA_ACTIVITY_SENSOR = "sensor.x2_hub_activity"
HA_HUB_CONNECTED = "binary_sensor.x2_hub_hub_connected"


def ha_rest(path: str, payload: dict | None = None, *, timeout: float = 60.0) -> tuple[int, object]:
    req = urllib.request.Request(
        f"{HA_BASE}{path}",
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )
    try:
        with urllib.request.urlopen(req, context=ssl.create_default_context(), timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode(errors="replace")


def ha_state(entity: str) -> dict:
    status, body = ha_rest(f"/api/states/{entity}")
    return body if status == 200 and isinstance(body, dict) else {}


def ha_log_mark() -> int:
    return HA_LOG.stat().st_size


def ha_log_since(mark: int) -> list[str]:
    with HA_LOG.open("rb") as handle:
        handle.seek(mark)
        return handle.read().decode("utf-8", errors="replace").splitlines()


def ha_entry(action: str, needle: str) -> list[dict]:
    out = subprocess.run([sys.executable, str(HUB_BENCH / "ha_entry.py"), action, needle], capture_output=True,
                         text=True, cwd=str(REPO), timeout=120)
    if out.returncode != 0:
        problem(f"ha_entry.py {action} {needle}: {out.stderr.strip() or out.stdout.strip()}")
    rows = []
    for line in out.stdout.splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    return rows


def ha_entries() -> list[dict]:
    return ha_entry("list", "")


class LogWatch:
    """Lines matching a marker, with the time the writer stamped them."""

    def __init__(self, read_since, mark: int, *, utc: bool = False) -> None:
        self._read = read_since
        self._mark = mark
        self._utc = utc

    def find(self, *needles: str) -> list[tuple[float | None, str]]:
        return [(parse_log_time(line, utc=self._utc), line) for line in self._read(self._mark) if all(n in line for n in needles)]

    def wait(self, timeout: float, *needles: str) -> tuple[float | None, str] | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            found = self.find(*needles)
            if found:
                return found[-1]
            time.sleep(0.25)
        return None


def parse_sequence(spec: str) -> list[int | None]:
    out: list[int | None] = []
    for item in spec.split(","):
        item = item.strip().lower()
        if not item:
            continue
        out.append(None if item == "off" else int(item))
    return out


def transition(name: str, observer: Observer, watch: LogWatch, *, expect_id: int | None, trigger, consumer_marks: dict) -> dict:
    """One transition: trigger (or wait for the remote), every publish until the expected
    one, then what the consumer logged: the apply of that state, the ACK_READY nearest to
    it, and whether the gate was armed and released."""

    since = observer.count()
    t_trigger = None
    if ARGS.trigger == "auto":
        t_trigger = time.time()
        trigger()
    else:
        print(f"\n>>> {name}: make the change on the physical remote now (waiting up to {ARGS.wait:.0f}s)\n", flush=True)
    expected_id = 255 if expect_id is None else expect_id
    row: dict = {"name": name, "expect": expect_id, "t_trigger": t_trigger, "pushes": [], "push": None}
    deadline = time.time() + ARGS.wait
    hit = None
    while time.time() < deadline:
        got = observer.wait_push(since, max(0.05, deadline - time.time()))
        if got is None:
            break
        since += 1
        data = got.get("data") or {}
        row["pushes"].append({"at": got["at"], "payload": got["payload"], "retain": got["retain"]})
        step(f"{name}_push", at=stamp(got["at"]), payload=got["payload"],
             after_trigger=None if t_trigger is None else f"{got['at'] - t_trigger:.3f}s")
        if data.get("activity_id") == expected_id:
            hit = got
            break
    if hit is None:
        problem(f"{name}: no publish naming activity {expected_id} on {TOPIC} within {ARGS.wait:.0f}s")
        check(f"{name}: the hub published the transition", False, f"pushes seen: {[p['payload'] for p in row['pushes']]}")
        return row
    row["push"] = {"at": hit["at"], "payload": hit["payload"], "retain": hit["retain"]}
    check(f"{name}: the hub published the transition", True,
          f"{hit['payload']}" + (f" (after {len(row['pushes']) - 1} other publish(es))" if len(row["pushes"]) > 1 else ""))
    want = "None" if expect_id is None else str(expect_id)
    applied = watch.wait(min(ARGS.wait, 30.0), consumer_marks["apply"], f"activity state: {want}")
    row["applied_at"] = applied[0] if applied else None
    if applied:
        step(f"{name}_applied", at=stamp(applied[0]),
             after_push=None if applied[0] is None else f"{applied[0] - hit['at']:+.3f}s", line=applied[1][-110:])
    check(f"{name}: the consumer applied the push", bool(applied), "" if applied else "no [EXT] applying line")
    if not applied or applied[0] is None:
        return row
    # ACK_READY: wait for one, then take the one nearest the apply (a switch between two
    # activities can produce more than one).
    watch.wait(ARGS.wait, consumer_marks["ready"])
    time.sleep(0.5)
    readies = [t for t, _ in watch.find(consumer_marks["ready"]) if t is not None]
    ready_at = min(readies, key=lambda t: abs(t - applied[0])) if readies else None
    row["ready_at"] = ready_at
    row["ack_ready_count"] = len(readies)
    if ready_at is None:
        check(f"{name}: ACK_READY followed", False)
        return row
    gain = ready_at - applied[0]
    row["gain_s"] = gain
    row["t_ready_after_trigger"] = None if t_trigger is None else ready_at - t_trigger
    step(f"{name}_ack_ready", at=stamp(ready_at), vs_apply=f"{gain:+.3f}s",
         after_trigger=None if t_trigger is None else f"{ready_at - t_trigger:.3f}s", ack_readies=len(readies))
    released = [t for t, _ in watch.find(consumer_marks["released"]) if t is not None and t >= applied[0] - 0.01]
    already_ready = "(hub already ready)" in applied[1]
    row["hub_already_ready"] = already_ready
    row["gate_released"] = bool(released)
    if already_ready:
        check(f"{name}: ACK_READY first; applied without arming the gate", gain <= 0.5, f"ACK_READY {-gain:.3f}s before the apply")
    else:
        check(f"{name}: push first; gate armed and released by ACK_READY", bool(released) and gain > 0,
              f"ACK_READY {gain:.3f}s after the apply" + ("" if released else "; no release line"))
    return row


def leg_ha() -> None:
    marks = {"apply": "[EXT] applying external activity state", "ready": "[HINT] ACK_READY from hub",
             "released": "[EXT] settling gate released"}
    def activity_map() -> dict[int, str]:
        remote = ha_state(HA_REMOTE)
        return {int(a["id"]): a["name"] for a in remote.get("attributes", {}).get("activities", [])}

    # Right after HA re-takes the hub the entity has no activity list yet (the catalog read follows the connect).
    activities = wait_for("HA's activity list", activity_map, 180, every=2.0) or {}
    remote = ha_state(HA_REMOTE)
    step("ha", remote_state=remote.get("state"), hub_connected=ha_state(HA_HUB_CONNECTED).get("state"),
         activity=ha_state(HA_ACTIVITY_SENSOR).get("state"), activities=activities)
    if ha_state(HA_HUB_CONNECTED).get("state") != "on":
        problem("HA does not hold the hub (binary_sensor off)")
        return
    sequence = parse_sequence(ARGS.sequence)
    for act in sequence:
        if act is not None and act not in activities:
            problem(f"activity {act} is not on the X2 ({activities})")
            return
    subscribed = [line for line in ha_log_since(0) if "[MQTT_ACT] subscribed to" in line and ARGS.mac in line]
    check("HA subscribed to the activity topic (log)", bool(subscribed), subscribed[-1][:23] if subscribed else "")
    observer = Observer()
    observer.start()
    transitions = []
    try:
        for n, act in enumerate(sequence, 1):
            name = f"{n}_{'off' if act is None else act}"
            watch = LogWatch(ha_log_since, ha_log_mark(), utc=True)
            if act is None:
                trigger = lambda: ha_rest("/api/services/remote/turn_off", {"entity_id": HA_REMOTE})
            else:
                trigger = lambda act=act: ha_rest("/api/services/remote/turn_on", {"entity_id": HA_REMOTE, "activity": activities[act]})
            row = transition(name, observer, watch, expect_id=act, trigger=trigger, consumer_marks=marks)
            time.sleep(1.5)
            sensor = ha_state(HA_ACTIVITY_SENSOR)
            wanted = "Powered Off" if act is None else activities[act]
            check(f"{name}: HA's activity sensor shows {wanted}", sensor.get("state") == wanted, str(sensor.get("state")))
            if act is not None:
                mqtt_act = watch.find("[MQTT_ACT] applied", f"activity={act}")
                check(f"{name}: HA logged the MQTT_ACT apply", bool(mqtt_act), mqtt_act[-1][1][-80:] if mqtt_act else "")
            transitions.append(row)
            time.sleep(ARGS.pause)
        REPORT["transitions"] = transitions
    finally:
        observer.stop()


# -- the server leg ------------------------------------------------------------------------------


class Server:
    def __init__(self, data_dir: Path, log_path: Path) -> None:
        self.data_dir, self.log_path = data_dir, log_path
        self.proc = None
        self.log = None

    def start(self) -> None:
        self.log = open(self.log_path, "a", encoding="utf-8")
        env = dict(os.environ, PYTHONUNBUFFERED="1")
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "sofabaton_server.cli", "--port", str(ARGS.port), "--data-dir", str(self.data_dir),
             "--hub", ARGS.host, "--mqtt-host", ARGS.broker, "--mqtt-port", str(ARGS.broker_port),
             "--mqtt-username", ARGS.broker_user, "--mqtt-password", ARGS.broker_pass, "--log-level", "debug"],
            env=env, stdout=self.log, stderr=subprocess.STDOUT, cwd=str(REPO),
        )

    def log_mark(self) -> int:
        return self.log_path.stat().st_size if self.log_path.exists() else 0

    def log_since(self, mark: int) -> list[str]:
        with self.log_path.open("rb") as handle:
            handle.seek(mark)
            return handle.read().decode("utf-8", errors="replace").splitlines()

    def stop(self) -> None:
        if self.proc is not None:
            self.proc.terminate()
            try:
                self.proc.wait(30)
            except subprocess.TimeoutExpired:
                self.proc.kill()
            self.proc = None
        if self.log is not None:
            self.log.close()
            self.log = None


class WsCollector(threading.Thread):
    """Every frame of /api/v1/events with the local time it arrived."""

    def __init__(self) -> None:
        super().__init__(daemon=True)
        self.frames: list[dict] = []
        self._stop = threading.Event()
        self._lock = threading.Lock()

    def run(self) -> None:
        asyncio.run(self._collect())

    async def _collect(self) -> None:
        import websockets

        while not self._stop.is_set():
            try:
                async with websockets.connect(f"ws://127.0.0.1:{ARGS.port}/api/v1/events") as ws:
                    while not self._stop.is_set():
                        try:
                            raw = await asyncio.wait_for(ws.recv(), timeout=0.5)
                        except asyncio.TimeoutError:
                            continue
                        frame = json.loads(raw)
                        frame["at"] = time.time()
                        with self._lock:
                            self.frames.append(frame)
            except Exception:  # noqa: BLE001
                await asyncio.sleep(0.5)

    def snapshot(self) -> list[dict]:
        with self._lock:
            return list(self.frames)

    def stop(self) -> None:
        self._stop.set()


def api(method: str, path: str, payload: dict | None = None, timeout: float = 30.0):
    req = urllib.request.Request(f"http://127.0.0.1:{ARGS.port}/api/v1{path}", method=method,
                                 data=json.dumps(payload).encode() if payload is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode()
            return resp.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode(errors="replace")
    except (urllib.error.URLError, OSError, TimeoutError):
        return 0, None


def wait_for(desc: str, pred, timeout: float, every: float = 0.5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = pred()
        if value:
            return value
        time.sleep(every)
    problem(f"timed out waiting for {desc} ({timeout:.0f}s)")
    return None


def leg_server() -> None:
    marks = {"apply": "[EXT] applying external activity state", "ready": "[HINT] ACK_READY from hub",
             "released": "[EXT] settling gate released"}
    data_dir = bench_common.BENCH_DIR / f"bench_291_{ARGS.tag}_data"
    if data_dir.exists():
        for f in data_dir.iterdir():
            f.unlink()
    data_dir.mkdir(parents=True, exist_ok=True)
    server = Server(data_dir, bench_common.LOG_DIR / f"bench_291_{ARGS.tag}-server.log")

    # -- HA lets go of the X2 (single-writer rule); nothing else may change.
    before = {row["title"]: row["disabled_by"] for row in ha_entries()}
    ha_entry("disable", ARGS.ha_entry)
    after = ha_entries()
    step("ha_entry_disabled", entries={row["title"][:22]: row["disabled_by"] for row in after})
    for row in after:
        if ARGS.ha_entry.lower() not in row["title"].lower() and row["disabled_by"] and not before.get(row["title"]):
            problem(f"disabling the X2 also disabled {row['title']}; re-enabling it")
            ha_entry("enable", row["title"].rsplit("/", 1)[-1].strip(") "))   # by MAC: a name prefix would match twice
    ws = WsCollector()
    observer: Observer | None = None
    try:
        wait_for("HA to drop the hub", lambda: ha_state(HA_HUB_CONNECTED).get("state") != "on", 60)
        server.start()
        info = wait_for("server up", lambda: (lambda r: r[1] if r[0] == 200 else None)(api("GET", "/server")), 30)
        step("server", version=(info or {}).get("version"), mqtt=(info or {}).get("mqtt", {}).get("configured"))
        if not info:
            return
        ws.start()

        def ready():
            status, hubs = api("GET", "/hubs")
            if status != 200 or not hubs:
                return None
            hub = hubs[0]
            s = hub.get("status") or {}
            return hub if s.get("hub_connected") and s.get("catalog_ready") else None

        hub = wait_for("the X2 to connect and sync", ready, 180, every=1.0)
        if not hub:
            return
        hub_id = hub["hub_id"]
        step("hub_ready", hub_id=hub_id, host=hub["config"]["host"], hub_version=hub["config"]["hub_version"],
             mode=hub["status"]["mode"], activity=hub["status"].get("running_activity"))
        check("the record re-keyed to the banner MAC with model X2", hub_id == ARGS.mac.lower() and hub["config"]["hub_version"] == "X2",
              f"{hub_id} {hub['config']['hub_version']}")
        mqtt = wait_for("the broker subscription", lambda: (lambda r: r[1] if r[0] == 200 and r[1].get("connected") and TOPIC in r[1].get("topics", []) else None)(api("GET", "/server/mqtt")), 60)
        step("mqtt", connected=(mqtt or {}).get("connected"), topics=(mqtt or {}).get("topics"), error=(mqtt or {}).get("last_error"))
        check("the server subscribed to the activity topic with no device deployed", bool(mqtt), str((mqtt or {}).get("topics")))
        if not mqtt:
            return
        status, acts = api("GET", f"/hubs/{hub_id}/activities")
        names = {a["activity_id"]: a["name"] for a in (acts or [])} if status == 200 else {}
        step("activities", names=names)
        if ARGS.activity not in names:
            problem(f"activity {ARGS.activity} is not on the X2 ({names})")
            return
        observer = Observer()
        observer.start()

        def activity_changed(since: int, activity_id: int | None) -> dict | None:
            for frame in ws.snapshot()[since:]:
                if frame.get("type") == "hub_event" and (frame.get("event") or {}).get("kind") == "activity_changed":
                    payload = (frame["event"].get("payload") or {})
                    if payload.get("activity_id") == activity_id:
                        return frame
            return None

        transitions = []
        current: int | None = None
        for n, act in enumerate(parse_sequence(ARGS.sequence), 1):
            name = f"{n}_{'off' if act is None else act}"
            if act is not None and act not in names:
                problem(f"activity {act} is not on the X2 ({names})")
                return
            ws_since = len(ws.snapshot())
            watch = LogWatch(server.log_since, server.log_mark())
            if act is None:
                stop_id = current if current is not None else ARGS.activity
                trigger = lambda stop_id=stop_id: api("POST", f"/hubs/{hub_id}/activities/{stop_id}/stop", {})
            else:
                trigger = lambda act=act: api("POST", f"/hubs/{hub_id}/activities/{act}/start", {})
            row = transition(name, observer, watch, expect_id=act, trigger=trigger, consumer_marks=marks)
            frame = wait_for("activity_changed on the stream", lambda: activity_changed(ws_since, act), 30)
            if frame and row.get("push"):
                step(f"{name}_stream", at=stamp(frame["at"]), after_push=f"{frame['at'] - row['push']['at']:+.3f}s", seq=frame["event"].get("seq"))
                row["stream_at"] = frame["at"]
            check(f"{name}: activity_changed({act}) reached the WebSocket stream", bool(frame))
            served = watch.find("applied from the mqtt activity topic", f"activity {'off' if act is None else act} applied")
            check(f"{name}: the server logged the apply from the topic", bool(served), served[-1][1][-90:] if served else "")
            time.sleep(1.5)
            status, running = api("GET", f"/hubs/{hub_id}/activity")
            got = (running or {}).get("activity_id") if isinstance(running, dict) else None
            check(f"{name}: GET /activity shows {act}", status == 200 and got == act, str(running))
            transitions.append(row)
            current = act
            time.sleep(ARGS.pause)
        REPORT["transitions"] = transitions
        step("server_log", path=str(server.log_path))
    finally:
        if observer is not None:
            observer.stop()
        ws.stop()
        server.stop()
        step("server_stopped")
        # -- give the X2 back to HA, whatever happened above.
        ha_entry("enable", ARGS.ha_entry)
        rows = ha_entries()
        step("ha_entries", entries={row["title"][:22]: row["disabled_by"] for row in rows})
        check("close-out: every HA entry is enabled again", all(row["disabled_by"] is None for row in rows))
        back = wait_for("HA to hold the hub again", lambda: ha_state(HA_HUB_CONNECTED).get("state") == "on", 180, every=2.0)
        check("close-out: HA holds the X2 again", bool(back))


def main() -> None:
    try:
        (leg_ha if ARGS.leg == "ha" else leg_server)()
    finally:
        failed = [c for c in REPORT["checks"] if not c["ok"]]
        print(f"\n{len(REPORT['checks']) - len(failed)}/{len(REPORT['checks'])} checks passed; problems: {REPORT['problems'] or 'none'}", flush=True)
        save()


if __name__ == "__main__":
    main()
