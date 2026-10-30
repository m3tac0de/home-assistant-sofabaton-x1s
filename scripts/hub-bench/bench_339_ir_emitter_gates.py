"""bench_339: IR emitter gates B6 (vendor app capture) and B12 (behaviour) on the X2.

Plan: docs/internal/ir-emitter-pill-plan.md section 4. Run sheet, in order:
docs/internal/ir-emitter-bench-run-sheet.md. The X2 is production: only
`J `-prefixed sandbox devices are created, fired and deleted.

    ha status|off|on            the X2's Home Assistant entry (title contains
                                --ha-entry). The hub takes one client, so every
                                hub command refuses to run while HA holds it.
                                End every session with ``ha on`` (it verifies).
    recon                       read-only: every device record's routing bytes,
                                the port flags (0x0032) and the fresh paired list
                                (0x012E [01]); stores the real catalog for cleanup
    ports [--watch S]           read-only: 0x0032 every --interval s (>= 3) for
                                --watch s; plug and unplug a cable meanwhile
    paired                      read-only: one fresh paired-list read, decoded
    capture --go                B6: the proxy advertises as the X2 and the vendor
                                app attaches through it; every frame both ways is
                                taped, device-record writes are decoded live
                                (routing, changed fields, the frames that follow,
                                our create's record next to a new device's). Ends
                                with ``stop`` (or Ctrl+C) once the app is closed.
    mark LABEL                  stamp the running capture's tape (no hub)
    stop                        end the running capture (no hub)
    fire DEVICE --go            B12: print the device's routing, the ports and the
                                paired list, then send one command over TCP (the
                                frame remote.send_command sends) --times times and
                                play its stored payload through 0x0F (the Infrared
                                entity's path) --times times. --label TEXT or
                                --command-id ID picks the command; --legs send,play.
    play-mask DEVICE --go       B12 probe: the 0x0F play of the command's stored
                                payload with --masks as the three bytes after the
                                page count (000000 = today's play); a descriptor gets
                                its parser-reset blip with the same mask
    cleanup --go                delete the J devices recon did not see, then compare
                                the real catalog with recon's
    selftest                    offline: the decoders on synthetic frames

DEVICE is a device id or a name; fire, play-mask and cleanup touch `J `
devices only. Every hub command except recon, ports and paired needs --go
(Marcel's go-ahead for that run).

Run from the repo root (zeroconf for the capture lives in .venv-py313):
    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_339_ir_emitter_gates.py recon

Reports: scripts/hub-bench/out/bench_339_<command>_<tag>.json (+ the frame log
under out/logs/). Run state (recon's catalog, captures) in out/bench_339_state.json.
"""

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import json
import sys
import threading
import time

from bench_common import BENCH_DIR, save_json, setup_logging

from x1slib import AsyncXProxy, HubConfig, IrPayload, async_discover_hubs  # noqa: E402
from x1slib.commands import looks_like_descriptive_play_blob  # noqa: E402
from x1slib.device_class_profiles import build_empty_device_block  # noqa: E402
from x1slib.devices import device_config_from_backup, parse_device_record, record_emitters  # noqa: E402
from x1slib.emitter_routing import EmitterRouting  # noqa: E402
from x1slib.protocol_const import OP_REQ_HUB_NAME, OPNAMES, opcode_family_name  # noqa: E402
from x1slib.proxy_ir_blob import x2_parser_reset_blob  # noqa: E402

STATE_PATH = BENCH_DIR / "bench_339_state.json"
MARK_PATH = BENCH_DIR / "bench_339_capture.mark"
STOP_PATH = BENCH_DIR / "bench_339_capture.stop"
SANDBOX_PREFIX = "J "
# X2 record: name and brand slots of 60 bytes from 29, then the 60-byte tail;
# 210 bytes with the checksum.
X2_BODY_LEN = 210
X2_TAIL = 29 + 2 * 60
# Families of the remote-sync frames (0x0064 / 0x0364 / 0x0464, 0x0165 / 0x0265).
SYNC_FAMILIES = {0x64, 0x65}
# Families of the reads the pill makes: 0x0032 (ports) and 0x012E (paired list).
EMITTER_READ_FAMILIES = {0x32, 0x2E}
FAMILY_HUB_NAME_REPLY = 0x31
FOLLOW_WINDOW_S = 60.0

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("command", choices=["ha", "recon", "ports", "paired", "capture", "mark", "stop", "fire",
                                    "play-mask", "cleanup", "selftest"])
ap.add_argument("args", nargs="*", help="sub-command and its arguments (see the module doc)")
ap.add_argument("--tag", default=time.strftime("%m%d-%H%M"))
ap.add_argument("--host", default="192.168.2.123", help="the X2's address")
ap.add_argument("--ha-entry", default="Sofabaton X2 (", help="title substring of the X2's HA entry")
ap.add_argument("--no-ha-check", action="store_true", help="skip the HA entry guard (HA unreachable)")
ap.add_argument("--go", action="store_true", help="Marcel's go-ahead for a run that sends, plays or writes")
ap.add_argument("--watch", type=float, default=60.0, help="ports: seconds to keep asking")
ap.add_argument("--interval", type=float, default=3.0, help="ports: seconds between asks (at least 3)")
ap.add_argument("--label", default=None, help="fire/play-mask: command label substring (case-insensitive)")
ap.add_argument("--command-id", type=int, default=None, help="fire/play-mask: the command id")
ap.add_argument("--times", type=int, default=2, help="fire: sends per leg")
ap.add_argument("--plays", type=int, default=3, help="fire: plays per leg (differs from --times so flashes can be counted)")
ap.add_argument("--gap", type=float, default=5.0, help="fire/play-mask: seconds between shots")
ap.add_argument("--legs", default="send,play", help="fire: send, play or both")
ap.add_argument("--masks", default="000000,000001,000002,000004",
                help="play-mask: comma-separated 3-byte hex masks")
ARGS = ap.parse_args()
# The tape prints arrows; a Windows console or pipe defaults to a code page without them.
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

REPORT: dict = {"bench": "bench_339", "command": ARGS.command, "args": ARGS.args, "tag": ARGS.tag,
                "host": ARGS.host, "started": time.strftime("%Y-%m-%d %H:%M:%S"), "steps": [], "problems": []}


def wallclock() -> str:
    return time.strftime("%H:%M:%S")


def step(name: str, /, **fields) -> None:
    REPORT["steps"].append({"step": name, "wall": wallclock(), **fields})
    print(f"[{wallclock()}] {name}: " + ", ".join(f"{k}={v}" for k, v in fields.items()), flush=True)


def problem(text: str) -> None:
    REPORT["problems"].append(text)
    print(f"PROBLEM: {text}", flush=True)


def banner(text: str) -> None:
    print(f"\n=== {wallclock()} {text} ===", flush=True)


def load_state() -> dict:
    return json.loads(STATE_PATH.read_text(encoding="utf-8")) if STATE_PATH.exists() else {}


def store_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, indent=2), encoding="utf-8")


# -- Home Assistant entry (the hub takes one client) ------------------------------------------

def _ha_rows(action: str | None = None) -> list[dict]:
    """The sofabaton_x1s entries; ``action`` off/on flips the X2's first."""

    import ssl  # noqa: PLC0415

    import ha_entry  # noqa: PLC0415  reads the HA token and URL only when needed
    import websockets  # noqa: PLC0415

    async def run() -> list[dict]:
        ctx = ssl.create_default_context() if ha_entry.BASE.startswith("wss://") else None
        async with websockets.connect(ha_entry.BASE, ssl=ctx, max_size=8 * 1024 * 1024) as ws:
            await ws.recv()
            await ws.send(json.dumps({"type": "auth", "access_token": ha_entry.TOKEN}))
            if json.loads(await ws.recv()).get("type") != "auth_ok":
                raise RuntimeError("HA refused the token")
            get = {"type": "config_entries/get", "domain": "sofabaton_x1s"}
            rows = (await ha_entry._call(ws, 1, get)).get("result") or []
            if action in ("off", "on"):
                mine = [r for r in rows if ARGS.ha_entry.lower() in str(r.get("title", "")).lower()]
                if len(mine) != 1:
                    raise RuntimeError(f"need exactly one entry matching {ARGS.ha_entry!r}, "
                                       f"found {[r.get('title') for r in rows]}")
                await ha_entry._call(ws, 2, {"type": "config_entries/disable", "entry_id": mine[0]["entry_id"],
                                             "disabled_by": "user" if action == "off" else None})
                await asyncio.sleep(2.0)
                rows = (await ha_entry._call(ws, 3, get)).get("result") or []
            return rows

    return asyncio.run(run())


def ha_command(action: str) -> int:
    rows = _ha_rows(action if action in ("off", "on") else None)
    for row in rows:
        print(f"  {row.get('title')!r:32} state={row.get('state')} disabled_by={row.get('disabled_by')}")
    if action == "on":
        still_off = [row.get("title") for row in rows if row.get("disabled_by")]
        if still_off:
            print(f"NOT DONE: still disabled: {still_off}")
            return 1
        print("every sofabaton_x1s entry is enabled again")
    return 0


def require_hub_free() -> None:
    if ARGS.no_ha_check:
        return
    try:
        rows = _ha_rows()
    except Exception as err:  # noqa: BLE001 - the guard must explain itself
        sys.exit(f"cannot read the HA entries ({err}); pass --no-ha-check only if HA is really down")
    mine = [r for r in rows if ARGS.ha_entry.lower() in str(r.get("title", "")).lower()]
    if len(mine) != 1 or not mine[0].get("disabled_by"):
        sys.exit("the X2's HA entry must be disabled first: run `ha off`")


def require_go_ahead(what: str) -> None:
    if not ARGS.go:
        sys.exit(f"{what} sends to, plays on or writes the X2: rerun with --go once Marcel agrees")


# -- wire decode ---------------------------------------------------------------------------------

def parse_ir_port_flags(payload: bytes) -> tuple[bool, bool] | None:
    """The two bytes a 0x31 hub-name reply starts with, read as the vendor app
    reads them (port 1 / port 2 cable). They flip on their own (this bench,
    2026-10-28), so the library does not read them; kept here as evidence."""

    data = bytes(payload)
    return (data[0] == 1, data[1] == 1) if len(data) >= 2 else None


def find_record(payload: bytes) -> tuple[bytes, int] | None:
    """A device or activity record body inside a frame payload, found by its
    tail markers (0xFC at tail 9, 14 and 16). Writes carry it after a 3-byte
    page header; other offsets are tried after that."""

    for start in (3, 0, 1, 2, 4, 5, 6):
        body = payload[start:start + X2_BODY_LEN]
        if len(body) < X2_BODY_LEN:
            continue
        tail = body[X2_TAIL:]
        if tail[9] == 0xFC and tail[14] == 0xFC and tail[16] == 0xFC:
            return bytes(body), start
    return None


def routing_view(body: bytes | None) -> dict | None:
    trip = record_emitters(body, hub_version="X2") if body else None
    if trip is None:
        return None
    return EmitterRouting.decode(*trip).to_dict()


def config_fields(body: bytes) -> dict:
    try:
        cfg = parse_device_record(body, hub_version="X2")
    except (ValueError, TypeError) as err:
        return {"parse_error": str(err)}
    out = {}
    for key, value in dataclasses.asdict(cfg).items():
        out[key] = value.hex(" ") if isinstance(value, (bytes, bytearray)) else value
    return out


def field_diff(old: dict, new: dict, *, skip: tuple[str, ...] = ()) -> dict:
    keys = sorted(set(old) | set(new))
    return {k: [old.get(k), new.get(k)] for k in keys if k not in skip and old.get(k) != new.get(k)}


def byte_diff(old: bytes, new: bytes) -> list[str]:
    """Changed offsets (checksum excluded) as ``offset:old->new``."""

    return [f"{i}:{old[i]:02x}->{new[i]:02x}" for i in range(min(len(old), len(new)) - 1) if old[i] != new[i]]


def our_create_fields(name: str) -> dict:
    """What our Add Device writes for an IR device on the X2."""

    block = build_empty_device_block(name or "J", "ir", hub_version="X2")
    cfg = device_config_from_backup(block, for_create=True)
    return {k: (v.hex(" ") if isinstance(v, (bytes, bytearray)) else v) for k, v in dataclasses.asdict(cfg).items()}


def op_label(op: int) -> str:
    return OPNAMES.get(op) or opcode_family_name(op) or f"OP_{op:04X}"


def analyse_capture(rows: list[dict], before: dict[int, bytes]) -> dict:
    """Record writes, what follows each, and the app's reads, from a tape."""

    known = dict(before)
    writes: list[dict] = []
    for i, row in enumerate(rows):
        if row["dir"] != "A→H":
            continue
        found = find_record(bytes.fromhex(row["payload"]))
        if found is None:
            continue
        body, offset = found
        ent_id = body[4]
        # A create carries the placeholder id FF; the hub answers with the real one.
        kind = "create" if ent_id == 0xFF else "activity" if ent_id >= 0x65 else "device"
        fields = config_fields(body)
        entry: dict = {"wall": row["wall"], "op": row["op"], "kind": kind, "id": ent_id,
                       "name": fields.get("name"), "body_offset": offset,
                       "sealed": (sum(body[:-1]) & 0xFF) == body[-1],
                       "routing": routing_view(body)}
        prev = known.get(ent_id)
        if prev is not None:
            entry["routing_before"] = routing_view(prev)
            entry["changed_bytes"] = byte_diff(prev, body)
            entry["changed_fields"] = field_diff(config_fields(prev), fields)
        elif kind in ("device", "create"):
            entry["new"] = True
            entry["vs_our_create"] = field_diff(our_create_fields(str(fields.get("name") or "")), fields,
                                                skip=("name", "device_id"))
        known[ent_id] = body
        followers, first_reply = [], None
        for later in rows[i + 1:]:
            if later["mono"] - row["mono"] > FOLLOW_WINDOW_S:
                break
            if later["dir"] == "H→A":
                if first_reply is None:
                    first_reply = {"op": later["op"], "payload": later["payload"][:48],
                                   "after_s": round(later["mono"] - row["mono"], 3)}
                continue
            if find_record(bytes.fromhex(later["payload"])) is not None:
                break
            op = int(later["op"], 16)
            followers.append({"op": later["op"], "name": later["name"], "payload": later["payload"][:48],
                              "after_s": round(later["mono"] - row["mono"], 3),
                              "sync": (op & 0xFF) in SYNC_FAMILIES})
        entry["first_reply"] = first_reply
        entry["followers"] = followers[:30]
        entry["sync_frames"] = [f for f in followers if f["sync"]]
        writes.append(entry)

    app_ops: dict[str, dict] = {}
    emitter_reads: list[dict] = []
    for row in rows:
        if row["dir"] != "A→H":
            continue
        op = int(row["op"], 16)
        seen = app_ops.setdefault(row["op"], {"name": row["name"], "count": 0, "first": row["wall"],
                                             "sample": row["payload"][:48]})
        seen["count"] += 1
        if (op & 0xFF) in EMITTER_READ_FAMILIES:
            emitter_reads.append({"wall": row["wall"], "op": row["op"], "payload": row["payload"]})
    port_replies = []
    for row in rows:
        if row["dir"] == "H→A" and int(row["op"], 16) & 0xFF == FAMILY_HUB_NAME_REPLY:
            raw = bytes.fromhex(row["payload"])
            port_replies.append({"wall": row["wall"], "ports": parse_ir_port_flags(raw), "raw": row["payload"][:48]})
    return {"writes": writes, "app_ops": app_ops, "emitter_reads": emitter_reads, "port_replies": port_replies}


# -- the frame tape ------------------------------------------------------------------------------

class Tape:
    """Every frame both ways (ours, the app's, the hub's), stamped."""

    def __init__(self) -> None:
        self.rows: list[dict] = []
        self.lock = threading.Lock()
        self.marks: list[dict] = []
        self.print_inbound = True

    def _add(self, direction: str, opcode: int, payload: bytes, source: str) -> None:
        row = {"dir": direction, "src": source, "wall": wallclock(), "mono": time.monotonic(),
               "op": f"0x{opcode:04X}", "name": op_label(opcode), "payload": bytes(payload).hex()}
        with self.lock:
            self.rows.append(row)
        found = find_record(bytes(payload)) if direction == "A→H" else None
        if found is not None:
            body = found[0]
            fields = config_fields(body)
            print(f"  {row['wall']} RECORD WRITE ({source}) {row['op']} id={body[4]} name={fields.get('name')!r} "
                  f"routing={routing_view(body)}", flush=True)
        elif direction == "A→H" or self.print_inbound:
            print(f"  {row['wall']} {direction} ({source}) {row['op']} {row['name']} "
                  f"{bytes(payload).hex(' ')[:72]}", flush=True)

    def install(self, engine) -> None:
        orig_hub, orig_app, orig_out = engine._handle_hub_frames, engine._handle_app_frames, engine._send_cmd_frame

        def tap_hub(frames):
            for op, _raw, payload, _scid, _ecid in frames:
                self._add("H→A", op, payload, "hub")
            return orig_hub(frames)

        def tap_app(frames):
            for op, _raw, payload, _scid, _ecid in frames:
                self._add("A→H", op, payload, "app")
            return orig_app(frames)

        def tap_out(opcode, payload):
            self._add("A→H", opcode, payload, "us")
            return orig_out(opcode, payload)

        engine._handle_hub_frames = tap_hub
        engine._handle_app_frames = tap_app
        engine._send_cmd_frame = tap_out

    def mark(self, label: str) -> dict:
        mark = {"label": label, "wall": wallclock(), "mono": time.monotonic()}
        self.marks.append(mark)
        banner(f"MARK {label}")
        return mark

    def after(self, mono: float, *, direction: str | None = None) -> list[dict]:
        with self.lock:
            return [dict(r) for r in self.rows if r["mono"] >= mono and (direction is None or r["dir"] == direction)]

    def dump(self) -> list[dict]:
        with self.lock:
            return [dict(row) for row in self.rows]


TAPE = Tape()
SESSION = {"started": False}


# -- facade sessions -----------------------------------------------------------------------------

async def _proxy_config(advertise: bool) -> HubConfig:
    if not advertise:
        return HubConfig(host=ARGS.host, hub_version="X2", proxy_enabled=False, source="manual")
    # Mirror the hub's own mDNS name and TXT so the app takes the proxy for its hub.
    for hub in await async_discover_hubs(timeout=6.0):
        if hub.host == ARGS.host and not hub.is_proxy:
            step("mdns_match", name=hub.name, hub_version=hub.hub_version)
            return dataclasses.replace(HubConfig.from_discovered(hub, source="manual"), proxy_enabled=True)
    problem("no mDNS advertisement from the X2 at --host; advertising with defaults (the app may not attach)")
    return HubConfig(host=ARGS.host, hub_version="X2", proxy_enabled=True, source="manual")


async def facade_session(label: str, body, *, advertise: bool = False) -> None:
    log_path = setup_logging(f"bench_339-{label}-{ARGS.tag}")
    print(f"logging to {log_path}", flush=True)
    cfg = await _proxy_config(advertise)
    proxy = AsyncXProxy.from_config(cfg, diag_dump=True, diag_parse=True)
    SESSION["started"] = True
    TAPE.install(proxy.sync)
    async with proxy:
        if not await proxy.wait_connected(timeout=60) or not await proxy.wait_until_ready(timeout=90):
            problem("the hub did not become ready")
            return
        status = await proxy.status()
        if status.mode != "control":
            problem(f"expected control mode, got {status.mode} (is an app or HA holding the X2?)")
            return
        if proxy.sync.hub_version != "X2":
            problem(f"this bench is X2-only; the hub says {proxy.sync.hub_version}")
            return
        await body(proxy)


def run_facade(label: str, body, *, needs_go_ahead: bool, advertise: bool = False) -> None:
    if needs_go_ahead:
        require_go_ahead(label)
    asyncio.run(facade_session(label, body, advertise=advertise))


async def device_records(proxy) -> dict[int, dict]:
    devs = await proxy.devices(refresh=True)
    rows = await proxy.run(lambda: dict(proxy.sync.state.entities("device")))
    out: dict[int, dict] = {}
    for dev in devs:
        raw = (rows.get(dev.device_id) or {}).get("raw_body")
        body = bytes(raw) if isinstance(raw, (bytes, bytearray)) else None
        trip = record_emitters(body, hub_version="X2") if body else None
        out[dev.device_id] = {"name": dev.name, "class": dev.device_class, "body": body,
                              "bytes": bytes(trip).hex(" ") if trip else None, "routing": routing_view(body)}
    return out


def records_view(records: dict[int, dict]) -> dict:
    return {str(k): {key: v for key, v in r.items() if key != "body"} for k, r in sorted(records.items())}


def real_view(records: dict[int, dict], acts) -> dict:
    return {"devices": [[k, r["name"]] for k, r in sorted(records.items()) if not r["name"].startswith(SANDBOX_PREFIX)],
            "activities": [[a.activity_id, a.name] for a in acts if not a.name.startswith(SANDBOX_PREFIX)]}


def emitter_status_view(status) -> dict | None:
    if status is None:
        return None
    return status.to_dict()


async def read_emitter_status(proxy) -> dict | None:
    mark = time.monotonic()
    status = await proxy.ir_emitter_status(refresh=True)
    view = emitter_status_view(status)
    rows = [r for r in TAPE.after(mark, direction="H→A") if int(r["op"], 16) & 0xFF in (0x2F, FAMILY_HUB_NAME_REPLY)]
    step("ir_emitter_status", status=view, raw_rows=[f"{r['op']} {r['payload'][:96]}" for r in rows])
    return view


async def resolve_device(proxy, records: dict[int, dict] | None = None) -> tuple[int, dict] | None:
    if not ARGS.args:
        problem("name the device (id or name)")
        return None
    wanted = " ".join(ARGS.args)
    records = records if records is not None else await device_records(proxy)
    if wanted.isdigit() and int(wanted) in records:
        dev = int(wanted)
    else:
        hits = [k for k, r in records.items() if r["name"].lower() == wanted.lower()]
        if len(hits) != 1:
            problem(f"no single device named {wanted!r}: {[r['name'] for r in records.values()]}")
            return None
        dev = hits[0]
    rec = records[dev]
    if not rec["name"].startswith(SANDBOX_PREFIX):
        problem(f"{rec['name']!r} is not a sandbox device (names start with {SANDBOX_PREFIX!r})")
        return None
    return dev, rec


async def resolve_command(proxy, dev: int) -> int | None:
    cmds = await proxy.commands(dev)
    step("commands", device=dev, commands=[[c.command_id, c.label] for c in cmds])
    if ARGS.command_id is not None:
        if any(c.command_id == ARGS.command_id for c in cmds):
            return ARGS.command_id
        problem(f"device {dev} has no command {ARGS.command_id}")
        return None
    hits = [c for c in cmds if ARGS.label and ARGS.label.lower() in c.label.lower()]
    if not hits:
        problem(f"pick a command with --label or --command-id (label {ARGS.label!r} matched none)")
        return None
    return hits[0].command_id


# -- commands ------------------------------------------------------------------------------------

async def recon(proxy) -> None:
    records = await device_records(proxy)
    acts = await proxy.activities(refresh=True)
    for dev, rec in sorted(records.items()):
        step("device", id=dev, name=rec["name"], cls=rec["class"], bytes=rec["bytes"], routing=rec["routing"])
    survey: dict[str, int] = {}
    for rec in records.values():
        survey[str(rec["bytes"])] = survey.get(str(rec["bytes"]), 0) + 1
    step("routing_survey", counts=survey)
    REPORT["records"] = records_view(records)
    REPORT["emitter_status"] = await read_emitter_status(proxy)
    state = load_state()
    state.update(real_before=real_view(records, acts), recon_tag=ARGS.tag,
                 sandbox_before=[k for k, r in records.items() if r["name"].startswith(SANDBOX_PREFIX)])
    store_state(state)
    if state["sandbox_before"]:
        problem(f"sandbox devices already on the hub (cleanup leaves these): {state['sandbox_before']}")


async def ports(proxy) -> None:
    interval = max(3.0, ARGS.interval)
    deadline = time.monotonic() + ARGS.watch
    last = "unset"
    while time.monotonic() < deadline:
        mark = time.monotonic()
        await proxy.run(proxy.sync.enqueue_cmd, OP_REQ_HUB_NAME)
        await asyncio.sleep(1.0)
        raw = [r["payload"][:48] for r in TAPE.after(mark, direction="H→A")
               if int(r["op"], 16) & 0xFF == FAMILY_HUB_NAME_REPLY]
        flags = parse_ir_port_flags(bytes.fromhex(raw[0])) if raw else None
        changed = flags != last
        step("ports", port1=flags and flags[0], port2=flags and flags[1], raw=raw[:1],
             note="CHANGED" if changed and last != "unset" else "")
        last = flags
        await asyncio.sleep(interval)


async def paired(proxy) -> None:
    mark = time.monotonic()
    rows = await proxy.run(proxy.sync.read_x2_paired_devices, fresh=True)
    if rows is None:
        problem("the paired list was not read")
    for row in rows or []:
        step("paired_row", type=row.row_type, number=row.number, slot=row.slot, target=row.target.hex(" "),
             online=row.online, port_cable=row.port_cable, battery=row.battery, name=row.name)
    REPORT["raw_rows"] = [r["payload"] for r in TAPE.after(mark, direction="H→A") if int(r["op"], 16) & 0xFF == 0x2F]


async def capture(proxy) -> None:
    TAPE.print_inbound = False
    records = await device_records(proxy)
    before = {k: r["body"] for k, r in records.items() if r["body"]}
    REPORT["records_before"] = records_view(records)
    MARK_PATH.unlink(missing_ok=True)
    STOP_PATH.unlink(missing_ok=True)
    if not await proxy.wait_until_discoverable(timeout=30.0):
        problem("the proxy is not advertising; the app cannot find it")
        return
    banner("ADVERTISING as the X2. Open the vendor app now; every frame is taped. "
           "Close the app when done, then `stop`.")
    print("  marks: bench_339_ir_emitter_gates.py mark \"LABEL\"   end: bench_339_ir_emitter_gates.py stop",
          flush=True)
    mode = "control"
    try:
        while True:
            if STOP_PATH.exists():
                STOP_PATH.unlink(missing_ok=True)
                break
            if MARK_PATH.exists():
                label = MARK_PATH.read_text(encoding="utf-8").strip() or "mark"
                MARK_PATH.unlink(missing_ok=True)
                TAPE.mark(label)
            now = (await proxy.status()).mode
            if now != mode:
                TAPE.mark({"observe": "app ATTACHED", "control": "app DETACHED"}.get(now, f"mode {now}"))
                mode = now
            await asyncio.sleep(0.5)
    except (KeyboardInterrupt, asyncio.CancelledError):
        print("stopping", flush=True)
    deadline = time.monotonic() + 30.0
    while (await proxy.status()).mode != "control" and time.monotonic() < deadline:
        print("  waiting for the app to let go of the hub (close it fully)...", flush=True)
        await asyncio.sleep(3.0)
    analysis = analyse_capture(TAPE.dump(), before)
    REPORT["capture"] = analysis
    for write in analysis["writes"]:
        step("record_write", kind=write["kind"], id=write["id"], name=write["name"], routing=write["routing"],
             routing_before=write.get("routing_before"), changed_fields=write.get("changed_fields"),
             vs_our_create=write.get("vs_our_create"), sync_frames=[f"{f['op']} {f['payload']}" for f in
                                                                    write["sync_frames"]],
             first_reply=write["first_reply"])
    step("emitter_reads", reads=[f"{r['wall']} {r['op']} {r['payload'][:24]}" for r in analysis["emitter_reads"]])
    if (await proxy.status()).mode != "control":
        problem("the app still holds the hub: no read-back")
        return
    after = await device_records(proxy)
    REPORT["records_after"] = records_view(after)
    for dev, rec in sorted(after.items()):
        if dev not in records or records[dev]["bytes"] != rec["bytes"]:
            step("read_back", id=dev, name=rec["name"], bytes=rec["bytes"], routing=rec["routing"],
                 before=records.get(dev, {}).get("bytes"))
    state = load_state()
    state.setdefault("captures", []).append({"tag": ARGS.tag, "writes": len(analysis["writes"])})
    store_state(state)


async def fire(proxy) -> None:
    records = await device_records(proxy)
    found = await resolve_device(proxy, records)
    if found is None:
        return
    dev, rec = found
    step("routing", device=dev, name=rec["name"], bytes=rec["bytes"], routing=rec["routing"])
    REPORT["routing"] = {"device": dev, "bytes": rec["bytes"], "routing": rec["routing"]}
    REPORT["emitter_status"] = await read_emitter_status(proxy)
    cmd = await resolve_command(proxy, dev)
    if cmd is None:
        return
    legs = {leg.strip() for leg in ARGS.legs.split(",") if leg.strip()}
    shots: list[dict] = []
    if "send" in legs:
        for n in range(1, ARGS.times + 1):
            banner(f"SEND {n}/{ARGS.times}: device {dev} command {cmd} over TCP -- WATCH the hub, the ports, "
                   "the remote, the TV")
            ok = await proxy.send(dev, cmd)
            shots.append({"leg": "send", "n": n, "wall": wallclock(), "ok": bool(ok)})
            step("send", n=n, ok=bool(ok))
            await asyncio.sleep(ARGS.gap)
    if "play" in legs:
        payload = await proxy.read_payload(dev, cmd)
        if not isinstance(payload, IrPayload):
            problem(f"command {cmd} has no IR payload to play ({type(payload).__name__})")
        else:
            step("payload", length=len(payload.blob), descriptive=looks_like_descriptive_play_blob(payload.blob),
                 head=payload.blob[:16].hex(" "))
            for n in range(1, ARGS.plays + 1):
                banner(f"PLAY {n}/{ARGS.plays}: the stored payload through 0x0F -- WATCH the hub, the ports, "
                       "the remote, the TV")
                try:
                    await proxy.play(payload)
                    ok = True
                except Exception as err:  # noqa: BLE001 - a refused play is a result
                    ok = False
                    problem(f"play {n}: {err}")
                shots.append({"leg": "play", "n": n, "wall": wallclock(), "ok": ok})
                step("play", n=n, ok=ok)
                await asyncio.sleep(ARGS.gap)
    REPORT["shots"] = shots
    print("\nTell Claude, per shot: which emitters lit (hub front, port 1, port 2, remote, repeater) "
          "and whether the TV reacted.", flush=True)


def play_body_with_mask(builder, blob: bytes, mask: bytes) -> bytes:
    """Today's play body with ``mask`` as body[3..5], resealed."""

    body = bytearray(builder(blob))
    body[3:6] = mask
    body[-1] = sum(body[:-1]) & 0xFF
    return bytes(body)


async def play_mask(proxy) -> None:
    found = await resolve_device(proxy)
    if found is None:
        return
    dev, _rec = found
    cmd = await resolve_command(proxy, dev)
    if cmd is None:
        return
    payload = await proxy.read_payload(dev, cmd)
    if not isinstance(payload, IrPayload):
        problem(f"command {cmd} has no IR payload ({type(payload).__name__})")
        return
    # A descriptor play needs the X2 parser reset first (as play_ir_blob does); it
    # gets the same mask, so a blip on the wrong emitter cannot muddy the shot.
    descriptive = looks_like_descriptive_play_blob(payload.blob)
    masks = [bytes.fromhex(m.strip()) for m in ARGS.masks.split(",") if m.strip()]
    if any(len(m) != 3 for m in masks):
        problem("every --masks entry is three bytes (six hex digits)")
        return
    builder = proxy.sync._build_play_blob_body_buffer
    play_kwargs = {"inter_frame_delay": 0.08, "ack_timeout": 1.0, "final_ack_timeout": 0.25}
    shots = []
    for mask in masks:
        banner(f"PLAY mask {mask.hex(' ')} -- WATCH the hub, the ports, the remote, the TV")
        reset_ok = None
        if descriptive:
            reset_body = play_body_with_mask(builder, x2_parser_reset_blob(), mask)
            reset_ok, _ = await proxy.run(proxy.sync._play_ir_blob_body, reset_body, **play_kwargs)
        body = play_body_with_mask(builder, payload.blob, mask)
        ok, rejected = await proxy.run(proxy.sync._play_ir_blob_body, body, **play_kwargs)
        shots.append({"mask": mask.hex(" "), "wall": wallclock(), "ok": bool(ok), "rejected": bool(rejected),
                      "reset_ok": reset_ok})
        step("play_mask", mask=mask.hex(" "), ok=bool(ok), rejected=bool(rejected), reset_ok=reset_ok)
        await asyncio.sleep(ARGS.gap)
    REPORT["shots"] = shots


async def cleanup(proxy) -> None:
    state = load_state()
    if "real_before" not in state:
        problem("no recon recorded: run `recon` first (cleanup compares against it)")
        return
    records = await device_records(proxy)
    keep = set(state.get("sandbox_before") or [])
    doomed = [k for k, r in records.items() if r["name"].startswith(SANDBOX_PREFIX) and k not in keep]
    step("cleanup_plan", delete=[[k, records[k]["name"]] for k in doomed], left_alone=sorted(keep))
    async with proxy.batch_writes():
        for dev in doomed:
            try:
                await proxy.remove_device(dev)
                step("removed_device", device_id=dev)
            except Exception as err:  # noqa: BLE001 - report and keep cleaning
                problem(f"remove_device({dev}): {err}")
        records = await device_records(proxy)
        acts = await proxy.activities(refresh=True)
    after = real_view(records, acts)
    same = after == state["real_before"]
    step("real_configuration_unchanged", ok=same)
    if not same:
        problem(f"real configuration differs: before={state['real_before']} after={after}")
    left = [r["name"] for k, r in records.items() if r["name"].startswith(SANDBOX_PREFIX) and k not in keep]
    if left:
        problem(f"sandbox devices left: {left}")
    elif same:
        STATE_PATH.unlink(missing_ok=True)
        step("state_cleared", path=str(STATE_PATH))


def selftest() -> int:
    """The decoders against synthetic frames; no hub, no HA."""

    failures: list[str] = []

    def check(label: str, ok: bool, detail: object = "") -> None:
        print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail != "" else ""))
        if not ok:
            failures.append(label)

    from x1slib.devices import build_device_create_payload  # noqa: PLC0415
    from x1slib.x1_proxy import X1Proxy  # noqa: PLC0415

    block = build_empty_device_block("J IR Test", "ir", hub_version="X2")
    ours = device_config_from_backup(block, for_create=True)
    check("our IR create carries a routing block", ours.extras_present, (ours.extra_a, ours.extra_b, ours.extra_c))
    old = build_device_create_payload(dataclasses.replace(ours, device_id=0x21, record_kind=1, tail_marker=0),
                                      hub_version="X2")
    new = build_device_create_payload(dataclasses.replace(ours, device_id=0x21, record_kind=1, tail_marker=0,
                                                          extra_c=0x02), hub_version="X2")
    found = find_record(new)
    check("write payload: record found after the page header", found is not None and found[1] == 3, found and found[1])
    check("write payload: routing decodes as port 1",
          routing_view(found[0]) == {"hub": "port1", "remotes": [], "repeaters": {}, "bytes": "000002"},
          routing_view(found[0]) if found else None)
    check("read row (body alone) is found at 0", (find_record(old[3:]) or (b"", -1))[1] == 0)
    check("a command-sized frame without markers is not a record", find_record(bytes(range(256))) is None)

    t0 = 1000.0
    rows = [
        {"dir": "A→H", "src": "app", "wall": "10:00:00", "mono": t0, "op": "0xD508", "name": "x", "payload": new.hex()},
        {"dir": "H→A", "src": "hub", "wall": "10:00:00", "mono": t0 + 0.1, "op": "0x0103", "name": "ack",
         "payload": "00"},
        {"dir": "A→H", "src": "app", "wall": "10:00:01", "mono": t0 + 0.4, "op": "0x0265", "name": "y",
         "payload": "2101"},
        {"dir": "A→H", "src": "app", "wall": "10:00:02", "mono": t0 + 1.0, "op": "0x0032", "name": "z", "payload": ""},
        {"dir": "H→A", "src": "hub", "wall": "10:00:02", "mono": t0 + 1.1, "op": "0x2231", "name": "n",
         "payload": "0100" + "4a".encode().hex()},
    ]
    analysis = analyse_capture(rows, {0x21: old[3:]})
    write = analysis["writes"][0] if analysis["writes"] else {}
    check("capture: one record write", len(analysis["writes"]) == 1)
    check("capture: routing change seen", (write.get("routing_before") or {}).get("hub") == "builtin"
          and (write.get("routing") or {}).get("hub") == "port1", [write.get("routing_before"), write.get("routing")])
    check("capture: only the routing field changed", set(write.get("changed_fields") or {}) == {"extra_c"},
          write.get("changed_fields"))
    check("capture: the per-entity sync follows", [f["op"] for f in write.get("sync_frames") or []] == ["0x0265"])
    check("capture: first reply is the ack", (write.get("first_reply") or {}).get("op") == "0x0103")
    check("capture: the app's port read is listed", [r["op"] for r in analysis["emitter_reads"]] == ["0x0032"])
    check("capture: port reply decodes", [r["ports"] for r in analysis["port_replies"]] == [(True, False)])
    fresh = analyse_capture(rows[:1], {})
    check("capture: a new device is compared with our create",
          (fresh["writes"] or [{}])[0].get("new") is True
          and "extra_c" in (fresh["writes"] or [{}])[0].get("vs_our_create", {}),
          (fresh["writes"] or [{}])[0].get("vs_our_create"))

    blob = bytes(range(10, 60))
    builder = lambda b: X1Proxy._build_play_blob_body_buffer(None, b)  # noqa: E731 - uses no instance state
    plain = builder(blob)
    check("mask 000000 is today's play body", play_body_with_mask(builder, blob, b"\x00\x00\x00") == plain)
    masked = play_body_with_mask(builder, blob, b"\x00\x00\x02")
    check("a mask lands at body[3..5] and reseals", masked[3:6] == b"\x00\x00\x02"
          and masked[-1] == sum(masked[:-1]) & 0xFF and masked[6:-1] == plain[6:-1])

    print(f"\nselftest: {'all OK' if not failures else f'{len(failures)} FAILED: {failures}'}")
    return 1 if failures else 0


def main() -> int:
    command, sub = ARGS.command, (ARGS.args[0] if ARGS.args else "")
    if command == "selftest":
        return selftest()
    if command == "ha":
        return ha_command(sub or "status")
    if command == "mark":
        MARK_PATH.write_text(" ".join(ARGS.args) or "mark", encoding="utf-8")
        print(f"mark queued: {MARK_PATH}")
        return 0
    if command == "stop":
        STOP_PATH.write_text("stop", encoding="utf-8")
        print(f"stop queued: {STOP_PATH}")
        return 0
    require_hub_free()
    try:
        if command == "recon":
            run_facade("recon", recon, needs_go_ahead=False)
        elif command == "ports":
            run_facade("ports", ports, needs_go_ahead=False)
        elif command == "paired":
            run_facade("paired", paired, needs_go_ahead=False)
        elif command == "capture":
            run_facade("capture", capture, needs_go_ahead=True, advertise=True)
        elif command == "fire":
            run_facade("fire", fire, needs_go_ahead=True)
        elif command == "play-mask":
            run_facade("play-mask", play_mask, needs_go_ahead=True)
        elif command == "cleanup":
            run_facade("cleanup", cleanup, needs_go_ahead=True)
    finally:
        if SESSION["started"]:
            REPORT["finished"] = time.strftime("%Y-%m-%d %H:%M:%S")
            REPORT["marks"] = TAPE.marks
            REPORT["tape"] = TAPE.dump()
            print("saved:", save_json(f"bench_339_{command}_{ARGS.tag}", REPORT), flush=True)
            print("\nREMINDER: the X2's HA entry stays disabled until `ha on`.", flush=True)
    return 1 if REPORT["problems"] else 0


if __name__ == "__main__":
    sys.exit(main())
