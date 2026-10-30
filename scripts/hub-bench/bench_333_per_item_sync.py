"""bench_333: per-item, targeted and order-only remote sync on the X2.

Plan: docs/internal/per-item-remote-sync-bench-plan.md (chunks C0-C5). One
chunk per run; the operator watches the physical remote and reports what it
shows, matched against the wall-clock times printed here.

    ha status|off|on            the X2's Home Assistant entry (title contains
                                --ha-entry). The hub takes one client, so hub
                                chunks refuse to run while HA holds it. End
                                every session with ``ha on`` (it verifies).
    c0 [--fresh]                read-only: the paired-device list, raw + decoded
                                (--fresh: [01], the hub polls its devices first)
    c1 [--slot N]               0x0464 [00 00 slot][01], one remote; the reply
                                is timed over --wait (default 600 s)
    c2                          0x0464 [FF FF FF][01]
    probe OPCODE PAYLOAD        one frame from the plan's list
    sandbox up|down|show|resync "J Sync" + "J Sync 2" activities and the MQTT
                                Wifi device "J Sync W" (favorite + Red in J Sync);
                                resync sends one full sync (recovery)
    c3 swap [--sync none|full|native]
                                swap J Sync and J Sync 2 (real activities keep
                                their places)
    c3 swap-devices [--sync none|full|native]
                                swap the last two devices when both are J
                                devices (J Sync W + `c6 create-device`)
    c3 order-sync               0x0464 [00 00 FF][00]
    c4 edit KIND [--sync none|legacy|native|auto]
                                KIND: favorite | binding | activity-rename |
                                command-rename | multi-rename (slots 4+5);
                                each run toggles the edit
    c4 frame x1|x2 ENTITY[,..]  0x0165 [id] / 0x0265 [id][01]; ENTITY is
                                activity, device, new or an id; several go out
                                back to back, each after the previous ack
    c6 create|delete            a lone "J New" activity, no member, no trigger
                                (c4 edit / c6 with --sync auto: the shipped path,
                                default forms, no batch, so the write's own
                                closing remote sync goes out; sync_frames lists it)
    c6 deploy-wifi2             a second MQTT Wifi device "J Sync W2" with a favorite in
                                J Sync 2, no sync frame at all (create + references)
    c6 create-device|delete-device
                                an empty IR device "J Sync IR", no trigger
    info                        read-only: remote info 0x002E (X1/X1S), raw + decoded
    c7 [--kick OP:PAYLOAD]      busy query 0x0003 every --interval s (>= 10 on
                                the X2, >= 5 elsewhere); --probe info re-reads
                                the 0x002E row instead and prints changed bytes;
                                single-flight, until busy then idle or --wait;
                                times a sync (not benched yet)

Every hub chunk except ``c0`` and ``sandbox show`` writes or wakes the
family's remotes and needs ``--go`` (Marcel's go-ahead for that run).
``--model X1S`` (or X1) dry-runs the sandbox, c3 swap and c4 chunks on an
expendable hub first (its Wifi device uses HTTP; X2-only frames refuse).

Run from the repo root:
    .venv-bench\\Scripts\\python.exe scripts\\hub-bench\\bench_333_per_item_sync.py c0 <tag>

Reports: scripts/hub-bench/out/bench_333_<chunk>_<tag>.json (+ the frame log
under out/logs/). Sandbox ids persist in out/bench_333_state.json.
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import copy
import dataclasses
import json
import sys
import threading
import time

from bench_common import BENCH_DIR, connect, save_json, setup_logging

from x1slib import AsyncXProxy, ButtonName, HubConfig, WifiDeployment, WifiDeviceSpec, WifiSlotSpec  # noqa: E402
from x1slib.protocol_const import OP_X2_REMOTE_LIST, OPNAMES, opcode_family_name  # noqa: E402
from x1slib.remote_sync_frames import (  # noqa: E402
    FAMILY_ENTITY_SYNC,
    X2_TARGET_ALL,
    entity_sync_frame,
    parse_x2_paired_row,
    x2_order_sync_frame,
    x2_remote_sync_frame,
    x2_target,
)
from x1slib.write_batch import ENTITY_SYNC_FORMS, ORDER_SYNC_FORMS  # noqa: E402

STATE_PATH = BENCH_DIR / "bench_333_state.json"
FAMILY_PAIRED_ROW = 0x2F
PROBE_OPCODES = {0x0064, 0x0323, 0x0364, 0x0464, 0x0165, 0x0265}
# Remote info (X1/X1S, read-only, B8): 0x002E, no payload.
OP_REMOTE_INFO = 0x002E
# Busy query (c7): X2 0x0103 [10] idle, [11] syncing a remote (validated
# 2026-10-24); X1/X1S send nothing back.
OP_BUSY_QUERY = 0x0003
SANDBOX_ACTIVITY = "J Sync"
SANDBOX_ACTIVITY_2 = "J Sync 2"
NEW_ACTIVITY = "J New"
NEW_DEVICE = "J Sync IR"
SANDBOX_WIFI_2 = "J Sync W2"
SANDBOX_WIFI = "J Sync W"
# Wifi slot command ids: shorts 1..10 (the slot index).
FAV_SLOT, RED_SLOT, ADD_SLOT, RENAME_SLOT = 1, 2, 3, 4
# Base labels of the renamed slots (slot 5 keeps the default label).
RENAME_LABELS = {4: "J Four", 5: "Button 5"}

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("chunk", choices=["ha", "c0", "c1", "c2", "probe", "sandbox", "c3", "c4", "c6", "c7", "info"])
ap.add_argument("args", nargs="*", help="sub-command and its arguments (see the module doc)")
ap.add_argument("--tag", default=time.strftime("%m%d-%H%M"))
ap.add_argument("--model", choices=["X1", "X1S", "X2"], default="X2")
ap.add_argument("--host", default=None, help="hub address (default: the bench hub of --model)")
ap.add_argument("--ha-entry", default=None, help="title substring of the hub's HA entry (default: \"Sofabaton <model> (\")")
ap.add_argument("--no-ha-check", action="store_true", help="skip the HA entry guard (HA unreachable)")
ap.add_argument("--go", action="store_true", help="Marcel's go-ahead for a run that writes or syncs")
ap.add_argument("--slot", type=int, default=None, help="c1: the remote slot (default: first remote in the list)")
ap.add_argument("--wait", type=float, default=None, help="seconds to watch after a kick")
ap.add_argument("--sync", default=None, help="c3/c4: which sync form the write uses")
ap.add_argument("--interval", type=float, default=10.0, help="c7: seconds between busy queries (at least 10)")
ap.add_argument("--probe", choices=["busy", "info"], default="busy",
                help="c7: poll the busy query 0x0003, or the remote-info row 0x002E (watch it change)")
ap.add_argument("--fresh", action="store_true", help="c0: ask 0x012E [01] (hub polls its devices first)")
ap.add_argument("--kick", default=None, help="c7: one frame first, OPCODE:PAYLOAD from the probe list")
ARGS = ap.parse_args()
ARGS.host = ARGS.host or {"X2": "192.168.2.123", "X1S": "192.168.2.151", "X1": "192.168.2.105"}[ARGS.model]
ARGS.ha_entry = ARGS.ha_entry or f"Sofabaton {ARGS.model} ("

REPORT: dict = {"bench": "bench_333", "chunk": ARGS.chunk, "args": ARGS.args, "tag": ARGS.tag,
                "model": ARGS.model, "host": ARGS.host, "started": time.strftime("%Y-%m-%d %H:%M:%S"), "steps": [], "problems": []}


def wallclock() -> str:
    return time.strftime("%H:%M:%S")


def step(name: str, /, **fields) -> None:
    REPORT["steps"].append({"step": name, "wall": wallclock(), **fields})
    print(f"[{wallclock()}] {name}: " + ", ".join(f"{k}={v}" for k, v in fields.items()), flush=True)


def problem(text: str) -> None:
    REPORT["problems"].append(text)
    print(f"PROBLEM: {text}", flush=True)


def save(name: str) -> None:
    REPORT["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
    print("saved:", save_json(f"bench_333_{name}_{ARGS.tag}", REPORT), flush=True)


def load_state() -> dict:
    return json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.exists() else {}


def store_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


# -- Home Assistant entry (the hub takes one client) ------------------------------------------

def _ha_ws():
    import ha_bench  # noqa: PLC0415  reads the HA token and URL only when needed
    return ha_bench.HaWs()


def ha_x2_entries(ws) -> list[dict]:
    rows = ws.ok({"type": "config_entries/get", "domain": "sofabaton_x1s"}) or []
    return [row for row in rows if ARGS.ha_entry.lower() in str(row.get("title", "")).lower()]


def ha_command(action: str) -> int:
    ws = _ha_ws()
    entries = ha_x2_entries(ws)
    if len(entries) != 1:
        titles = [row.get("title") for row in ws.ok({"type": "config_entries/get", "domain": "sofabaton_x1s"}) or []]
        print(f"need exactly one entry matching {ARGS.ha_entry!r}, found {len(entries)} among {titles}")
        return 2
    entry = entries[0]
    if action in ("off", "on"):
        ws.ok({"type": "config_entries/disable", "entry_id": entry["entry_id"],
               "disabled_by": "user" if action == "off" else None})
        time.sleep(2.0)
        entry = ha_x2_entries(ws)[0]
    all_rows = ws.ok({"type": "config_entries/get", "domain": "sofabaton_x1s"}) or []
    for row in all_rows:
        print(f"  {row.get('title')!r:32} state={row.get('state')} disabled_by={row.get('disabled_by')}")
    if action == "on":
        still_off = [row.get("title") for row in all_rows if row.get("disabled_by")]
        if still_off:
            print(f"NOT DONE: still disabled: {still_off}")
            return 1
        print("every sofabaton_x1s entry is enabled again")
    return 0


def require_hub_free() -> None:
    if ARGS.no_ha_check:
        return
    try:
        entries = ha_x2_entries(_ha_ws())
    except Exception as err:  # noqa: BLE001 - the guard must explain itself
        sys.exit(f"cannot read the HA entries ({err}); pass --no-ha-check only if HA is really down")
    if len(entries) != 1 or not entries[0].get("disabled_by"):
        sys.exit(f"the X2's HA entry must be disabled first: run `{ARGS.chunk} ...` after `ha off`")


def require_go_ahead(what: str) -> None:
    if not ARGS.go:
        sys.exit(f"{what} writes to or syncs the {ARGS.model}'s remotes: rerun with --go once Marcel agrees")


def require_x2(what: str) -> None:
    if ARGS.model != "X2":
        sys.exit(f"{what} is an X2 frame; this run is --model {ARGS.model}")


# -- the frame tape ------------------------------------------------------------------------------

class Tape:
    """Every frame both ways, stamped; inbound frames are printed live."""

    def __init__(self) -> None:
        self.rows: list[dict] = []
        self.lock = threading.Lock()
        self.kicks: list[dict] = []

    def _add(self, direction: str, opcode: int, payload: bytes) -> None:
        name = OPNAMES.get(opcode) or opcode_family_name(opcode) or f"OP_{opcode:04X}"
        row = {"dir": direction, "wall": wallclock(), "mono": time.monotonic(), "op": f"0x{opcode:04X}",
               "name": name, "payload": bytes(payload).hex(" ")}
        with self.lock:
            self.rows.append(row)
        if direction == "H→A":
            print(f"  {row['wall']} H→A {row['op']} {name} {row['payload'][:96]}", flush=True)

    def install(self, engine) -> None:
        orig_in, orig_out = engine._handle_hub_frames, engine._send_cmd_frame

        def tap_in(frames):
            for op, _raw, payload, _scid, _ecid in frames:
                self._add("H→A", op, payload)
            return orig_in(frames)

        def tap_out(opcode, payload):
            self._add("A→H", opcode, payload)
            return orig_out(opcode, payload)

        engine._handle_hub_frames = tap_in
        engine._send_cmd_frame = tap_out

    def kick(self, label: str, opcode: int, payload: bytes) -> dict:
        kick = {"label": label, "wall": wallclock(), "mono": time.monotonic(), "op": f"0x{opcode:04X}",
                "payload": payload.hex(" ")}
        self.kicks.append(kick)
        print(f"\n=== {kick['wall']} KICK {label}: {kick['op']} {kick['payload']} "
              f"-- WATCH THE {ARGS.model} REMOTE ===", flush=True)
        return kick

    def mark(self, label: str) -> dict:
        """Stamp the start of a write (no single frame to name)."""

        mark = {"label": label, "wall": wallclock(), "mono": time.monotonic()}
        self.kicks.append(mark)
        print(f"\n=== {mark['wall']} MARK {label} -- WATCH THE {ARGS.model} REMOTE ===", flush=True)
        return mark

    def triggers_after(self, mono: float) -> list[dict]:
        """Outbound remote-sync triggers (family 0x64) since ``mono``."""

        with self.lock:
            return [row for row in self.rows if row["dir"] == "A→H" and row["mono"] >= mono
                    and int(row["op"], 16) & 0xFF == 0x64]

    def inbound_after(self, mono: float) -> list[dict]:
        with self.lock:
            return [row for row in self.rows if row["dir"] == "H→A" and row["mono"] >= mono]

    def dump(self) -> list[dict]:
        with self.lock:
            return [dict(row) for row in self.rows]


TAPE = Tape()
# Set once a run reaches the hub; only those runs save a report.
SESSION = {"started": False}


def wait_quiet(seconds: float) -> None:
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        time.sleep(0.25)


def watch_reply(engine, label: str, opcode: int, payload: bytes, wait_s: float) -> None:
    """Send one frame, then send nothing else for ``wait_s`` (single-flight:
    a reply the hub holds until completion must meet a quiet link)."""

    kick = TAPE.kick(label, opcode, payload)
    if not engine.enqueue_cmd(opcode, payload):
        problem(f"{label}: the frame was not enqueued")
        return
    wait_quiet(wait_s)
    replies = TAPE.inbound_after(kick["mono"])
    first = replies[0] if replies else None
    step(f"{label}_reply", first=first and f"{first['op']} {first['payload']}",
         delay_s=first and round(first["mono"] - kick["mono"], 3), frames=len(replies))


def raw_session(label: str):
    log_path = setup_logging(f"bench_333-{label}-{ARGS.tag}")
    print(f"logging to {log_path}", flush=True)
    SESSION["started"] = True
    engine = connect(ARGS.host, ARGS.model)
    TAPE.install(engine)
    return engine


def read_paired_list(engine, timeout: float = 10.0, *, fresh: bool = False) -> list:
    """``fresh`` asks with ``[01]`` (the hub polls its paired devices first,
    some seconds) instead of ``[00]`` (the rows it has stored)."""

    mark = time.monotonic()
    engine.enqueue_cmd(OP_X2_REMOTE_LIST, b"\x01" if fresh else b"\x00")
    step("paired_list_request", fresh=fresh)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        rows = [r for r in TAPE.inbound_after(mark) if int(r["op"], 16) & 0xFF == FAMILY_PAIRED_ROW]
        parsed = [parse_x2_paired_row(bytes.fromhex(r["payload"])) for r in rows]
        if parsed and parsed[-1] is not None and parsed[-1].index >= parsed[-1].count:
            break
        time.sleep(0.2)
    wait_quiet(1.0)
    rows = [r for r in TAPE.inbound_after(mark) if int(r["op"], 16) & 0xFF == FAMILY_PAIRED_ROW]
    out = []
    for r in rows:
        raw = bytes.fromhex(r["payload"])
        row = parse_x2_paired_row(raw)
        entry = {"op": r["op"], "len": len(raw), "raw": r["payload"], "old_reading_p1_4": raw[1:4].hex(" ")}
        if row is not None:
            entry.update(index=row.index, count=row.count, type=row.row_type, slot=row.slot,
                         p2_p3_p4=raw[2:5].hex(" "), target=row.target.hex(" "), battery=row.battery,
                         hardware=row.hardware, firmware=row.firmware, online=row.online, mac=row.mac,
                         name=row.name)
        out.append(entry)
        step("paired_row", **{k: v for k, v in entry.items() if k != "raw"})
    return out


# -- raw chunks ------------------------------------------------------------------------------------

def chunk_c0() -> None:
    engine = raw_session("c0")
    try:
        REPORT["rows"] = read_paired_list(engine, timeout=15.0 if ARGS.fresh else 10.0, fresh=ARGS.fresh)
        REPORT["engine_view"] = [
            {"type": r.row_type, "slot": r.slot, "target": r.target.hex(" "), "name": r.name}
            for r in engine.x2_paired_devices()
        ]
        cached = engine.wait_for_x2_remote_sync_id(timeout=0.1)
        step("engine_remote_target", target=cached.hex(" ") if cached else None)
        if not REPORT["rows"]:
            problem("no paired-device rows came back")
    finally:
        engine.stop()


def chunk_c1() -> None:
    require_go_ahead("c1")
    require_x2("c1")
    engine = raw_session("c1")
    try:
        if ARGS.slot is not None:
            target = x2_target(0, ARGS.slot)
        else:
            REPORT["rows"] = read_paired_list(engine)
            remotes = [r for r in engine.x2_paired_devices() if r.is_remote]
            if not remotes:
                problem("no remote in the paired list; pass --slot")
                return
            target = remotes[0].target
            wait_quiet(3.0)
        opcode, payload = x2_remote_sync_frame(target)
        watch_reply(engine, "targeted_sync", opcode, payload, ARGS.wait or 600.0)
    finally:
        engine.stop()


def chunk_c2() -> None:
    require_go_ahead("c2")
    require_x2("c2")
    engine = raw_session("c2")
    try:
        opcode, payload = x2_remote_sync_frame(X2_TARGET_ALL)
        watch_reply(engine, "sync_all_0464", opcode, payload, ARGS.wait or 420.0)
    finally:
        engine.stop()


def chunk_probe() -> None:
    require_go_ahead("probe")
    if len(ARGS.args) != 2:
        sys.exit("probe OPCODE PAYLOAD, e.g. probe 0323 000008")
    opcode, payload = int(ARGS.args[0], 16), bytes.fromhex(ARGS.args[1])
    if opcode not in PROBE_OPCODES:
        sys.exit(f"0x{opcode:04X} is not on the plan's probe list {sorted(hex(o) for o in PROBE_OPCODES)}")
    if (opcode >> 8) != len(payload):
        sys.exit(f"0x{opcode:04X} carries {opcode >> 8} payload bytes, got {len(payload)}")
    engine = raw_session("probe")
    try:
        watch_reply(engine, f"probe_{opcode:04x}", opcode, payload, ARGS.wait or 180.0)
    finally:
        engine.stop()


def sandbox_ids() -> tuple[int, int, int]:
    state = load_state()
    try:
        return int(state["activity"]), int(state["activity_2"]), int(state["wifi"]["device_id"])
    except (KeyError, TypeError):
        sys.exit("no sandbox in out/bench_333_state.json: run `sandbox up` first")


def chunk_c3_order_sync() -> None:
    require_go_ahead("c3 order-sync")
    require_x2("c3 order-sync")
    sandbox_ids()
    engine = raw_session("c3-order-sync")
    try:
        opcode, payload = x2_order_sync_frame()
        watch_reply(engine, "order_sync", opcode, payload, ARGS.wait or 300.0)
    finally:
        engine.stop()


def chunk_c4_frame() -> None:
    require_go_ahead("c4 frame")
    if len(ARGS.args) != 3 or ARGS.args[1] not in ("x1", "x2"):
        sys.exit("c4 frame x1|x2 ENTITY[,ENTITY...]  (activity | device | new | <id>)")
    act, _act2, wifi = sandbox_ids()
    new = load_state().get("new_activity")
    state = load_state()
    aliases = {"activity": act, "device": wifi, "new": new, "activity2": _act2,
               "newdev": state.get("new_device"), "device2": (state.get("wifi2") or {}).get("device_id")}
    entities = []
    for which in ARGS.args[2].split(","):
        entity = aliases[which] if which in aliases else int(which, 0)
        if entity is None:
            sys.exit(f"{which!r}: nothing recorded for it (run `c6 create` first)")
        entities.append(int(entity))
    if ARGS.args[1] == "x2":
        require_x2("c4 frame x2")
    engine = raw_session(f"c4-frame-{ARGS.args[1]}")
    try:
        # Several entities go out back to back, each after the previous ack
        # (single-flight); the watch window follows the last one.
        for n, entity in enumerate(entities, start=1):
            opcode, payload = entity_sync_frame(entity, x2_form=ARGS.args[1] == "x2")
            assert opcode & 0xFF == FAMILY_ENTITY_SYNC
            last = n == len(entities)
            watch_reply(engine, f"entity_sync_{ARGS.args[1]}_{entity}", opcode, payload,
                        (ARGS.wait or 180.0) if last else 2.0)
    finally:
        engine.stop()


def chunk_info() -> None:
    """Read-only B8: ask the hub for its remote's info and decode the family
    0x2F reply (X1/X1S layout: p[0:6] MAC, p[6] battery %, p[7] hardware,
    p[8:12] batch, p[12] firmware, p[15:] name)."""

    engine = raw_session("info")
    try:
        mark = time.monotonic()
        engine.enqueue_cmd(OP_REMOTE_INFO, b"")
        wait_quiet(4.0)
        rows = [r for r in TAPE.inbound_after(mark) if int(r["op"], 16) & 0xFF == FAMILY_PAIRED_ROW]
        REPORT["rows"] = []
        for r in rows:
            raw = bytes.fromhex(r["payload"])
            entry = {"op": r["op"], "len": len(raw), "raw": r["payload"]}
            if len(raw) >= 13:
                entry.update(mac=raw[0:6].hex(":"), battery=raw[6], hardware=raw[7], batch=raw[8:12].hex(),
                             firmware=raw[12], name=raw[15:].split(b"\0", 1)[0].decode("utf-8", "replace"))
            REPORT["rows"].append(entry)
            step("remote_info", **{k: v for k, v in entry.items() if k != "raw"})
        if not rows:
            others = [f"{r['op']} {r['payload'][:40]}" for r in TAPE.inbound_after(mark)]
            problem(f"no family-0x2F reply to 0x002E; other frames: {others or 'none'}")
    finally:
        engine.stop()


def _parse_kick(spec: str) -> tuple[int, bytes]:
    op_s, _, payload_s = spec.partition(":")
    opcode, payload = int(op_s, 16), bytes.fromhex(payload_s)
    if opcode not in PROBE_OPCODES:
        sys.exit(f"--kick 0x{opcode:04X} is not on the probe list {sorted(hex(o) for o in PROBE_OPCODES)}")
    if (opcode >> 8) != len(payload):
        sys.exit(f"--kick 0x{opcode:04X} carries {opcode >> 8} payload bytes, got {len(payload)}")
    return opcode, payload


def _poll_info(engine, start: float, duration: float, interval: float, polls: list) -> None:
    """Re-read the remote-info row every ``interval`` s and print which
    payload bytes changed since the previous read (sync progress hunt)."""

    previous: bytes | None = None
    while time.monotonic() - start < duration:
        asked = time.monotonic()
        engine.enqueue_cmd(OP_REMOTE_INFO, b"")
        reply = None
        while time.monotonic() - asked < 3.0 and reply is None:
            rows = [r for r in TAPE.inbound_after(asked) if int(r["op"], 16) & 0xFF == FAMILY_PAIRED_ROW]
            reply = rows[0] if rows else None
            time.sleep(0.1)
        if reply is None:
            problem("no reply to 0x002E; stopping (single-flight)")
            break
        raw = bytes.fromhex(reply["payload"])
        changed = [i for i in range(max(len(raw), len(previous or b""))) if previous is not None
                   and (raw[i:i + 1] != previous[i:i + 1])]
        row = {"t": round(asked - start, 1), "wall": wallclock(), "op": reply["op"],
               "payload": reply["payload"], "changed": changed}
        polls.append(row)
        step("info_poll", t=row["t"], changed=changed or "-", payload=reply["payload"])
        previous = raw
        wait_quiet(max(0.0, interval - (time.monotonic() - asked)))


def _busy_query(engine) -> int | None:
    """One busy query, single-flight: the status byte of its 0x0103, or None."""

    asked = time.monotonic()
    engine.enqueue_cmd(OP_BUSY_QUERY, b"")
    while time.monotonic() - asked < 3.0:
        acks = [r for r in TAPE.inbound_after(asked) if r["op"] == "0x0103"]
        if acks:
            payload = acks[0]["payload"]
            return int(payload.split()[0], 16) if payload else None
        time.sleep(0.1)
    return None


def chunk_c7() -> None:
    """Time a sync with the busy query, whatever its codes turn out to be:
    one query before the kick sets the baseline, then one every --interval
    seconds (single-flight); every change is logged, and the run stops when
    the answer is back at the baseline after a change (or --wait runs out).
    The X2 answered 0x10 for two minutes after a sync had ended (2026-10-24),
    so the expected 00/11 codes are not assumed."""

    require_go_ahead("c7")
    # The X2 (production, fragile MQTT stack) gets at most one query per 10 s.
    interval = max(10.0 if ARGS.model == "X2" else 5.0, ARGS.interval)
    duration = ARGS.wait or 600.0
    kick = _parse_kick(ARGS.kick) if ARGS.kick else None
    engine = raw_session(f"c7-{ARGS.probe}")
    polls: list[dict] = []
    try:
        start = time.monotonic()
        baseline = None
        if ARGS.probe == "busy":
            baseline = _busy_query(engine)
            step("busy_baseline", status=None if baseline is None else f"0x{baseline:02X}")
            if baseline is None:
                problem("no reply to the busy query; stopping (single-flight)")
                return
            wait_quiet(2.0)
        if kick:
            watch_reply(engine, f"kick_{kick[0]:04x}", kick[0], kick[1], 2.0)
        if ARGS.probe == "info":
            _poll_info(engine, start, duration, interval, polls)
            return
        previous, changed = baseline, False
        while time.monotonic() - start < duration:
            asked = time.monotonic()
            status = _busy_query(engine)
            row = {"t": round(asked - start, 1), "wall": wallclock(),
                   "status": None if status is None else f"0x{status:02X}"}
            polls.append(row)
            step("busy_poll", **row)
            if status is None:
                problem("no reply to the busy query; stopping (single-flight)")
                break
            if status != previous:
                step("busy_change", t=row["t"], frm=f"0x{previous:02X}", to=f"0x{status:02X}")
                changed = changed or status != baseline
                previous = status
                if changed and status == baseline:
                    step("back_to_baseline", t=row["t"], note=f"change ended within the last {interval:.0f} s")
                    break
            wait_quiet(max(0.0, interval - (time.monotonic() - asked)))
        if not changed:
            step("never_changed", note="the answer stayed at the baseline")
    finally:
        REPORT["polls"] = polls
        engine.stop()


# -- facade chunks ---------------------------------------------------------------------------------

async def facade_session(label: str, body) -> None:
    log_path = setup_logging(f"bench_333-{label}-{ARGS.tag}")
    print(f"logging to {log_path}", flush=True)
    cfg = HubConfig(host=ARGS.host, hub_version=ARGS.model, proxy_enabled=False, source="manual")
    proxy = AsyncXProxy.from_config(cfg, diag_dump=True, diag_parse=True)
    SESSION["started"] = True
    TAPE.install(proxy.sync)
    async with proxy:
        if not await proxy.wait_connected(timeout=60) or not await proxy.wait_until_ready(timeout=90):
            problem("the hub did not become ready")
            return
        status = await proxy.status()
        if status.mode != "control":
            problem(f"expected control mode, got {status.mode}")
            return
        await body(proxy)


def _real_view(acts, devs) -> dict:
    return {"activities": [[a.activity_id, a.name] for a in acts if not a.name.startswith("J ")],
            "devices": [[d.device_id, d.name] for d in devs if not d.name.startswith("J ")]}


async def sandbox_up(proxy) -> None:
    if load_state():
        problem("out/bench_333_state.json already holds a sandbox: `sandbox down` first")
        return
    acts = await proxy.activities(refresh=True)
    devs = await proxy.devices(refresh=True)
    leftovers = [a.name for a in acts if a.name.startswith("J ")] + [d.name for d in devs if d.name.startswith("J ")]
    if leftovers:
        problem(f"J entities already on the hub: {leftovers}")
        return
    state: dict = {"real_before": _real_view(acts, devs), "created": time.strftime("%Y-%m-%d %H:%M:%S")}
    start = TAPE.mark("sandbox_up")["mono"]
    # One batch: the creates' own triggers coalesce into one full sync at the end.
    async with proxy.batch_writes():
        state["activity"] = await proxy.add_activity(SANDBOX_ACTIVITY)
        store_state(state)
        state["activity_2"] = await proxy.add_activity(SANDBOX_ACTIVITY_2)
        store_state(state)
        act = state["activity"]
        spec = WifiDeviceSpec(name=SANDBOX_WIFI, slots=(
            WifiSlotSpec(label="J Fav", favorite=True, activities=(act,)),
            WifiSlotSpec(label="J Red", button=int(ButtonName.RED), activities=(act,)),
            WifiSlotSpec(label="J Three"),
            WifiSlotSpec(label="J Four"),
        ))
        if ARGS.model == "X2":
            deployment = await proxy.deploy_wifi_device(spec, transport="mqtt")
        else:  # nothing listens on the callback; the records only have to exist
            deployment = await proxy.deploy_wifi_device(spec, host=proxy.local_address(), port=8060)
        state["wifi"] = deployment.to_dict()
        store_state(state)
        # Read before the batch's closing trigger: a hub starting a remote
        # rebuild may not finish a catalog read (X1S, bench_333 dry run).
        acts = await proxy.activities(refresh=True)
        step("activity_order", order=[[a.activity_id, a.name] for a in acts])
    step("sandbox_up", activity=state["activity"], activity_2=state["activity_2"],
         wifi_device=deployment.device_id, triggers=len(TAPE.triggers_after(start)),
         sync_frames=_sync_frames_after(start))


async def sandbox_down(proxy) -> None:
    state = load_state()
    if not state:
        problem("no sandbox recorded")
        return
    start = TAPE.mark("sandbox_down")["mono"]
    async with proxy.batch_writes():
        for dev in [int((state.get("wifi") or {}).get("device_id") or 0), int(state.get("new_device") or 0),
                    int((state.get("wifi2") or {}).get("device_id") or 0)]:
            if dev:
                try:
                    await proxy.remove_device(dev)
                    step("removed_device", device_id=dev)
                except Exception as err:  # noqa: BLE001 - report and keep cleaning
                    problem(f"remove_device({dev}): {err}")
        current = {a.activity_id for a in await proxy.activities(refresh=True)}
        for key in ("activity", "activity_2", "new_activity"):
            act = int(state.get(key) or 0)
            if act and act in current:
                try:
                    await proxy.remove_activity(act)
                    step("removed_activity", activity_id=act)
                except Exception as err:  # noqa: BLE001
                    problem(f"remove_activity({act}): {err}")
            elif act:
                step("activity_already_gone", activity_id=act, note="the hub swept it at the device delete")
        # The checks read the catalog, so they go before any trigger (see sandbox_up).
        acts = await proxy.activities(refresh=True)
        devs = await proxy.devices(refresh=True)
    after = _real_view(acts, devs)
    same = after == state.get("real_before")
    step("real_configuration_unchanged", ok=same)
    if not same:
        problem(f"real configuration differs: before={state.get('real_before')} after={after}")
    left = [a.name for a in acts if a.name.startswith("J ")] + [d.name for d in devs if d.name.startswith("J ")]
    if left:
        problem(f"J entities left: {left}")
    else:
        STATE_PATH.unlink(missing_ok=True)
    # The batch end sends what the deletes need (the X1/X1S full sync; on
    # the X2 nothing, the remotes drop deleted entities alone).
    step("sandbox_down", triggers=len(TAPE.triggers_after(start)), clean=not left,
         sync_frames=_sync_frames_after(start))


async def resync(proxy) -> None:
    """One full remote sync (the validated trigger for this model)."""

    sent = await proxy.run(proxy.sync.resync_remote)
    step("resync_remote", sent=bool(sent), note="full sync of every remote is running now")
    if not sent:
        problem("the full remote-sync trigger was not sent")


async def sandbox_show(proxy) -> None:
    acts = await proxy.activities(refresh=True)
    devs = await proxy.devices(refresh=True)
    step("activities", order=[[a.activity_id, a.name] for a in acts])
    step("j_devices", devices=[[d.device_id, d.name] for d in devs if d.name.startswith("J ")])
    step("state", state=load_state() or None)


async def c3_swap(proxy) -> None:
    form = ARGS.sync or "none"
    if form not in ("none",) + ORDER_SYNC_FORMS:
        problem(f"--sync must be none, {' or '.join(ORDER_SYNC_FORMS)}")
        return
    sandbox_ids()
    acts = await proxy.activities(refresh=True)
    ids = [a.activity_id for a in acts]
    # Any two J activities (a device delete sweeps every empty activity, so
    # J Sync 2 may be gone and a "J New" from `c6 create` stand in).
    if len(acts) < 2 or not all(a.name.startswith("J ") for a in acts[-2:]):
        problem(f"the last two activities are not both J activities ({ids}); a swap would move real ones")
        return
    new = ids[:-2] + [ids[-1], ids[-2]]
    TAPE.mark(f"c3_swap_{form}")
    if form == "none":
        async with proxy.batch_writes(send_remote_sync=False):
            await proxy.reorder_activities(new)
    else:
        proxy.sync.order_sync_form = form
        await proxy.reorder_activities(new)
    after = [a.activity_id for a in await proxy.activities(refresh=True)]
    step("c3_swap", sync=form, before=ids[-2:], after=after[-2:], ok=after == new)


async def c3_swap_devices(proxy) -> None:
    form = ARGS.sync or "none"
    if form not in ("none",) + ORDER_SYNC_FORMS:
        problem(f"--sync must be none, {' or '.join(ORDER_SYNC_FORMS)}")
        return
    sandbox_ids()
    devs = await proxy.devices(refresh=True)
    ids = [d.device_id for d in devs]
    if len(devs) < 2 or not all(d.name.startswith("J ") for d in devs[-2:]):
        problem(f"the last two devices are not both J devices ({[[d.device_id, d.name] for d in devs]}); "
                "a swap would move real ones")
        return
    new = ids[:-2] + [ids[-1], ids[-2]]
    start = TAPE.mark(f"c3_swap_devices_{form}")["mono"]
    if form == "none":
        async with proxy.batch_writes(send_remote_sync=False):
            await proxy.reorder_devices(new)
    else:
        proxy.sync.order_sync_form = form
        await proxy.reorder_devices(new)
    after = await proxy.devices(refresh=True)
    step("c3_swap_devices", sync=form, before=[[d.device_id, d.name] for d in devs[-2:]],
         after=[[d.device_id, d.name] for d in after[-2:]], ok=[d.device_id for d in after] == new,
         sync_frames=_sync_frames_after(start))


def _toggle_favorite(activity: dict, wifi: int) -> str:
    rows = activity.setdefault("favorite_slots", [])
    present = [r for r in rows if int(r.get("device_id") or 0) == wifi and int(r.get("command_id") or 0) == ADD_SLOT]
    if present:
        activity["favorite_slots"] = [r for r in rows if r not in present]
        return "removed J Three favorite"
    template = next((r for r in rows if int(r.get("device_id") or 0) == wifi), None) or {}
    row = dict(template, device_id=wifi, command_id=ADD_SLOT, name="J Three")
    row["button_id"] = max([int(r.get("button_id") or 0) for r in rows] + [0]) + 1
    rows.append(row)
    return "added J Three favorite"


def _toggle_binding(activity: dict, wifi: int) -> str:
    rows = activity.setdefault("button_bindings", [])
    green = int(ButtonName.GREEN)
    present = [r for r in rows if int(r.get("button_id") or 0) == green]
    if present:
        activity["button_bindings"] = [r for r in rows if r not in present]
        return "removed Green binding"
    template = next((r for r in rows if int(r.get("button_id") or 0) == int(ButtonName.RED)), None)
    if template is None:
        raise RuntimeError("no Red binding to copy the row shape from")
    rows.append(dict(template, button_id=green, device_id=wifi, command_id=ADD_SLOT))
    return "added Green binding (J Three)"


def _edit_scope(proxy):
    """The write's scope: ``--sync auto`` runs it as the card and panel do
    (no batch, so its own closing remote sync goes out), otherwise inside a
    batch that sends nothing."""

    if ARGS.sync == "auto":
        return contextlib.nullcontext()
    return proxy.batch_writes(send_remote_sync=False)


def _sync_frames_after(start: float) -> list[str] | str:
    """The remote-sync frames (families 0x64 / 0x65) sent since ``start``."""

    frames = [f"{r['op']} {r['payload']}" for r in TAPE.dump() if r["dir"] == "A→H" and r["mono"] >= start
              and int(r["op"], 16) & 0xFF in (0x64, 0x65)]
    return frames or "none"


async def c4_edit(proxy) -> None:
    if len(ARGS.args) != 2:
        problem("c4 edit favorite|binding|activity-rename|command-rename|multi-rename|device-rename|member-favorite")
        return
    kind, form = ARGS.args[1], ARGS.sync or "none"
    if form not in (*ENTITY_SYNC_FORMS, "auto"):
        problem(f"--sync must be one of {ENTITY_SYNC_FORMS} or auto")
        return
    act, _act2, wifi = sandbox_ids()
    if form != "auto":
        proxy.sync.entity_sync_form = form
    start = TAPE.mark(f"c4_edit_{kind}_{form}")["mono"]
    if kind in ("command-rename", "multi-rename"):
        state = load_state()
        deployment = WifiDeployment.from_dict(state["wifi"])
        slots = list(deployment.spec.slots)
        changes = []
        # multi-rename: two slots in one update (one entity, several changes).
        for index in (RENAME_SLOT,) if kind == "command-rename" else (RENAME_SLOT, RENAME_SLOT + 1):
            old = slots[index - 1]
            base = RENAME_LABELS.get(index, f"Button {index}")
            label = base if old.label == f"{base} R" else f"{base} R"
            slots[index - 1] = dataclasses.replace(old, label=label, long_label=None)
            changes.append(f"slot {index} -> {label!r}")
        spec = WifiDeviceSpec(name=deployment.spec.name, slots=tuple(slots), brand=deployment.spec.brand)
        async with _edit_scope(proxy):
            deployment = await proxy.update_wifi_device(deployment, spec)
        state["wifi"] = deployment.to_dict()
        store_state(state)
        step("c4_edit", kind=kind, sync=form, change="; ".join(changes), entity=wifi,
             sync_frames=_sync_frames_after(start))
        return
    if kind == "device-rename":
        # The device editor's path (sync_device) on the empty IR device.
        dev = load_state().get("new_device")
        if not dev:
            problem("no J Sync IR recorded: run `c6 create-device` first")
            return
        snap = await proxy.refresh(device_id=int(dev))
        baseline = snap.bundle
        edited = copy.deepcopy(baseline)
        device = next(d for d in edited["devices"] if int(d["device"]["device_id"]) == int(dev))
        name = device["device"].get("name")
        device["device"]["name"] = NEW_DEVICE if name != NEW_DEVICE else f"{NEW_DEVICE} R"
        change = f"{name!r} -> {device['device']['name']!r}"
        async with _edit_scope(proxy):
            result = await proxy.sync_device(baseline=baseline, edited=edited, device_id=int(dev),
                                             snapshot_id=snap.snapshot_id)
        step("c4_edit", kind=kind, sync=form, change=change, entity=int(dev),
             status=getattr(result, "status", None), failed_at=getattr(result, "failed_at", None),
             sync_frames=_sync_frames_after(start))
        REPORT["result"] = repr(result)
        return
    # member-favorite edits J Sync 2, which has no member until it does.
    target = _act2 if kind == "member-favorite" else act
    snap = await proxy.refresh(activity_id=target)
    baseline = snap.bundle
    edited = copy.deepcopy(baseline)
    activity = next(a for a in edited["activities"] if int(a["device"]["device_id"]) == target)
    if kind in ("favorite", "member-favorite"):
        change = _toggle_favorite(activity, wifi)
    elif kind == "binding":
        change = _toggle_binding(activity, wifi)
    elif kind == "activity-rename":
        name = activity["device"].get("name")
        activity["device"]["name"] = SANDBOX_ACTIVITY if name != SANDBOX_ACTIVITY else f"{SANDBOX_ACTIVITY} R"
        change = f"{name!r} -> {activity['device']['name']!r}"
    else:
        problem(f"unknown kind {kind!r}")
        return
    async with _edit_scope(proxy):
        result = await proxy.sync_activity(baseline=baseline, edited=edited, activity_id=target,
                                           snapshot_id=snap.snapshot_id)
    step("c4_edit", kind=kind, sync=form, change=change, entity=target, status=getattr(result, "status", None),
         failed_at=getattr(result, "failed_at", None), sync_frames=_sync_frames_after(start))
    REPORT["result"] = repr(result)


async def c6_create(proxy) -> None:
    """A lone activity with no member and no trigger (E3)."""

    sandbox_ids()
    state = load_state()
    if state.get("new_activity"):
        problem(f"{NEW_ACTIVITY} is already recorded ({state['new_activity']}): `c6 delete` first")
        return
    start = TAPE.mark("c6_create")["mono"]
    async with _edit_scope(proxy):
        new = await proxy.add_activity(NEW_ACTIVITY)
    state["new_activity"] = new
    store_state(state)
    step("c6_create", activity=new, triggers=len(TAPE.triggers_after(start)),
         sync_frames=_sync_frames_after(start))


async def c6_delete(proxy) -> None:
    """Delete the lone activity, no trigger (E4)."""

    state = load_state()
    new = state.get("new_activity")
    if not new:
        problem("no J New recorded")
        return
    start = TAPE.mark("c6_delete")["mono"]
    async with _edit_scope(proxy):
        await proxy.remove_activity(int(new))
    state.pop("new_activity", None)
    store_state(state)
    step("c6_delete", activity=new, triggers=len(TAPE.triggers_after(start)),
         sync_frames=_sync_frames_after(start))


async def c6_create_device(proxy) -> None:
    """An empty IR device, no trigger (does a new device need a sync?)."""

    sandbox_ids()
    state = load_state()
    if state.get("new_device"):
        problem(f"{NEW_DEVICE} is already recorded ({state['new_device']}): `c6 delete-device` first")
        return
    start = TAPE.mark("c6_create_device")["mono"]
    async with _edit_scope(proxy):
        dev = await proxy.add_device(NEW_DEVICE, "ir")
    state["new_device"] = dev
    store_state(state)
    step("c6_create_device", device=dev, triggers=len(TAPE.triggers_after(start)),
         sync_frames=_sync_frames_after(start))


async def c6_delete_device(proxy) -> None:
    """Delete the empty IR device, no trigger."""

    state = load_state()
    dev = state.get("new_device")
    if not dev:
        problem("no J Sync IR recorded")
        return
    start = TAPE.mark("c6_delete_device")["mono"]
    async with _edit_scope(proxy):
        await proxy.remove_device(int(dev))
    state.pop("new_device", None)
    store_state(state)
    step("c6_delete_device", device=dev, triggers=len(TAPE.triggers_after(start)),
         sync_frames=_sync_frames_after(start))


async def c6_deploy_wifi2(proxy) -> None:
    """Deploy a second Wifi device with a favorite in J Sync 2, sending no
    remote-sync frame of any kind (which sync does a deploy really need?)."""

    act, act2, _wifi = sandbox_ids()
    state = load_state()
    if state.get("wifi2"):
        problem(f"{SANDBOX_WIFI_2} is already recorded")
        return
    if ARGS.sync != "auto":
        proxy.sync.entity_sync_form = "none"
    start = TAPE.mark("c6_deploy_wifi2")["mono"]
    spec = WifiDeviceSpec(name=SANDBOX_WIFI_2, slots=(
        WifiSlotSpec(label="J2 Fav", favorite=True, activities=(act2,)),
        WifiSlotSpec(label="J2 Two"),
    ))
    async with _edit_scope(proxy):
        if ARGS.model == "X2":
            deployment = await proxy.deploy_wifi_device(spec, transport="mqtt")
        else:
            deployment = await proxy.deploy_wifi_device(spec, host=proxy.local_address(), port=8060)
    state["wifi2"] = deployment.to_dict()
    store_state(state)
    step("c6_deploy_wifi2", device=deployment.device_id, activity=act2, sync_frames=_sync_frames_after(start))


def run_facade(label: str, body, *, needs_go_ahead: bool = True) -> None:
    if needs_go_ahead:
        require_go_ahead(label)
    asyncio.run(facade_session(label, body))


def main() -> int:
    chunk, sub = ARGS.chunk, (ARGS.args[0] if ARGS.args else "")
    if chunk == "ha":
        return ha_command(sub or "status")
    require_hub_free()
    try:
        if chunk == "c0":
            chunk_c0()
        elif chunk == "c1":
            chunk_c1()
        elif chunk == "c2":
            chunk_c2()
        elif chunk == "probe":
            chunk_probe()
        elif chunk == "sandbox" and sub in ("up", "down", "show", "resync"):
            body = {"up": sandbox_up, "down": sandbox_down, "show": sandbox_show, "resync": resync}[sub]
            run_facade(f"sandbox-{sub}", body, needs_go_ahead=sub != "show")
        elif chunk == "c3" and sub == "swap":
            run_facade("c3-swap", c3_swap)
        elif chunk == "c3" and sub == "swap-devices":
            run_facade("c3-swap-devices", c3_swap_devices)
        elif chunk == "c3" and sub == "order-sync":
            chunk_c3_order_sync()
        elif chunk == "c4" and sub == "edit":
            run_facade("c4-edit", c4_edit)
        elif chunk == "c6" and sub in ("create", "delete", "create-device", "delete-device", "deploy-wifi2"):
            body = {"create": c6_create, "delete": c6_delete, "create-device": c6_create_device,
                    "delete-device": c6_delete_device, "deploy-wifi2": c6_deploy_wifi2}[sub]
            run_facade(f"c6-{sub}", body)
        elif chunk == "info":
            chunk_info()
        elif chunk == "c7":
            chunk_c7()
        elif chunk == "c4" and sub == "frame":
            chunk_c4_frame()
        else:
            sys.exit(f"unknown: {chunk} {' '.join(ARGS.args)} (see the module doc)")
    finally:
        if SESSION["started"]:
            REPORT["tape"] = TAPE.dump()
            REPORT["kicks"] = TAPE.kicks
            save(f"{chunk}{'-' + sub if sub else ''}")
            print(f"\nREMINDER: the {ARGS.model}'s HA entry stays disabled until `ha on`.", flush=True)
    return 1 if REPORT["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
