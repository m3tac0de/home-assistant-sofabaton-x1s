"""RF editor bench R1-R4: seed the J RF433 test device, read it back, loop.

Plan: docs/internal/rf-editor-bench-plan.md.

Subcommands:

  dryrun                         offline: preflight_restore_bundle + the
                                 head and command builders for X1S and X2
                                 on the J RF433 bundle; nothing connects
  seed <entry_id> <tag>          merge-restore J RF433 through HA, then
                                 read it back (fetch) and compare
  fetch <entry_id> <device_id> <tag>
                                 blobs/fetch read-back and compare only
  clean <entry_id> <device_id>   delete the device through HA (refuses any
                                 device not named J RF433)
  loop <x1s_ip> <x2_entry_id> <tag> [--legs A0,A1,...] [--times N]
       [--lead S] [--window S] [--band 433|315]
                                 R2/R3 legs: the X1S runs direct (its HA
                                 entry must be off), the X2 only through
                                 HA. Legs: A0 A1 A2 B1 B2 C1 C2 A2s2 A2s3
                                 B2s2 B2s3 L1 (see the plan's R2 tables)
  halearn <entry_id> <band> <window_s> <tag>
                                 R4: learn through HA and decode (the other
                                 side of an editor Test)
  haplay <entry_id> <band> <1|2|3>
                                 R4: one-shot S1/S2/S3 through HA (the other
                                 side of an editor Learn)

Source: S1 Off, S2 On, S3 Down from
docs/internal/rf-test/rf-synth-test-315.json (433 MHz, proven on air).
Artifacts: out/rf-<sub>-<tag>.json.
"""

from __future__ import annotations

import asyncio
import copy
import json
import os
import ssl
import sys
import time
from dataclasses import replace
from typing import Any

from bench_common import REPO, save_json
from rf_bench_codec import bits_hex, decode_bits, parse_rf_blob

# RF_BENCH_VARIANT=315 (environment) seeds/cleans "J RF315" instead: the
# same S1/S2 signals stored as 315 MHz records (R3b).
VARIANT = os.environ.get("RF_BENCH_VARIANT", "433")
DEVICE_NAME = "J RF315" if VARIANT == "315" else "J RF433"
KEEP_COMMANDS = (1, 2) if VARIANT == "315" else (1, 2, 3)
CODE_TYPE = 30 if VARIANT == "315" else 29
BENCH_NAMES = ("J RF433", "J RF315")
SOURCE_FILE = REPO / "docs" / "internal" / "rf-test" / "rf-synth-test-315.json"


def build_bundle() -> dict[str, Any]:
    src = json.loads(SOURCE_FILE.read_text(encoding="utf-8"))
    block = copy.deepcopy(src["devices"][0])
    block["device"]["name"] = DEVICE_NAME
    block["commands"] = [c for c in block["commands"] if c["command_id"] in KEEP_COMMANDS]
    if VARIANT == "315":
        block["device"].update(device_class="rf_315mhz", device_class_code=CODE_TYPE, code_type=CODE_TYPE)
        for c in block["commands"]:
            c["restore_data"]["library_type"] = CODE_TYPE
    # No source hub name: a merge restore must never touch the hub identity.
    return {
        "kind": "hub_bundle",
        "schema_version": src["schema_version"],
        "captured_at": src["captured_at"],
        "complete": True,
        "payload_profile": src["payload_profile"],
        "hub": {"version": src["hub"]["version"]},
        "devices": [block],
        "activities": [],
    }


def source_blobs() -> dict[int, bytes]:
    bundle = build_bundle()
    return {
        int(c["command_id"]): bytes.fromhex(c["restore_data"]["data_hex"])
        for c in bundle["devices"][0]["commands"]
    }


def describe(blob: bytes) -> str:
    p = parse_rf_blob(blob)
    if not p.get("ok"):
        return p.get("error", "unparseable")
    d = decode_bits(p["durations"])
    return (f"{p['length']}B be16={'ok' if p['be16_matches_length'] else 'BAD'} "
            f"count={p['count_byte']}({'ok' if p['count_matches'] else 'BAD'}) gap={p['gap_us']}us "
            f"unit~{d.get('unit_us')}us bits={len(d.get('best', ''))} {bits_hex(d.get('best', ''))}"
            + (" (has ?)" if "?" in d.get("best", "") else ""))


# --------------------------------------------------------------------------
# dryrun
# --------------------------------------------------------------------------

def cmd_dryrun() -> None:
    from x1slib.device_create import build_device_create_step
    from x1slib.devices import device_config_from_backup
    from x1slib.x1_proxy import X1Proxy

    bundle = build_bundle()
    block = bundle["devices"][0]
    out: dict[str, Any] = {}
    for blob_id, blob in source_blobs().items():
        print(f"  source cmd {blob_id}: {describe(blob)}")
    for ver in ("X1S", "X2"):
        res: dict[str, Any] = {}
        proxy = X1Proxy("127.0.0.1", hub_version=ver, proxy_enabled=False)
        try:
            res["preflight"] = proxy.preflight_restore_bundle(copy.deepcopy(bundle))
            proxy._validate_restore_capabilities(
                hub_version=ver, device_class=block["device"]["device_class"], payload=block,
            )
            res["capabilities"] = "ok"
            cfg = replace(device_config_from_backup(block["device"], for_create=False), device_id=0x30)
            step = build_device_create_step(cfg, hub_version=ver)
            res["head_step"] = {"label": getattr(step, "label", None), "repr": repr(step)[:200]}
            steps, id_map, code_map, names = proxy._build_restore_command_batch(
                payload={"commands": block["commands"]}, device_id=0x30, strict=True,
            )
            res["command_steps"] = len(steps)
            res["command_id_map"] = {str(k): v for k, v in id_map.items()}
            res["command_names"] = names if isinstance(names, dict) else str(names)
            res["ok"] = True
        except Exception as exc:  # noqa: BLE001 - the dry run reports everything
            res["ok"] = False
            res["error"] = repr(exc)
        out[ver] = res
        print(f"  {ver}: {'OK' if res.get('ok') else 'FAIL'} "
              + json.dumps({k: v for k, v in res.items() if k not in ('head_step',)}, default=str)[:400])
    print(f"saved {save_json('rf-dryrun', out)}")


# --------------------------------------------------------------------------
# HA helpers
# --------------------------------------------------------------------------

_SCRIPTS = REPO / "scripts"
_CFG = json.loads((_SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
_TOKEN = (_SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
_WS_URL = _CFG["base_url"].replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/api/websocket"


class HaWs:
    def __init__(self) -> None:
        self._id = 0
        self.ws = None

    async def __aenter__(self):
        import websockets

        kwargs: dict[str, Any] = {}
        if _WS_URL.startswith("wss://"):
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            kwargs["ssl"] = ctx
        self.ws = await websockets.connect(_WS_URL, max_size=64 * 1024 * 1024, **kwargs)
        await self.ws.recv()
        await self.ws.send(json.dumps({"type": "auth", "access_token": _TOKEN}))
        ok = json.loads(await self.ws.recv())
        if ok.get("type") != "auth_ok":
            raise RuntimeError(f"auth failed: {ok}")
        return self

    async def __aexit__(self, *exc):
        await self.ws.close()

    async def call(self, payload: dict, timeout: float = 120.0) -> dict:
        self._id += 1
        msg_id = self._id
        await self.ws.send(json.dumps({"id": msg_id, **payload}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=max(1.0, deadline - time.time())))
            if raw.get("type") == "result" and raw.get("id") == msg_id:
                return raw
        raise TimeoutError(payload.get("type"))


async def wait_op(ha: HaWs, entry_id: str, kind: str, timeout: float = 900.0) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        state = await ha.call({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
        op = (state.get("result") or {}).get(kind) or {}
        msg = f"[{op.get('completed_steps')}/{op.get('total_steps')}] {op.get('phase')}: {op.get('message')}"
        if msg != last:
            print("   ", msg)
            last = msg
        if op.get("status") in {"success", "failed", "error"}:
            return op
        await asyncio.sleep(1.0)
    raise TimeoutError(f"{kind} did not finish within {timeout}s")


async def hub_devices(ha: HaWs, entry_id: str) -> dict[int, str]:
    """Device names from HA's persistent cache (no hub traffic)."""

    state = await ha.call({"type": "sofabaton_x1s/persistent_cache/contents", "entry_id": entry_id})
    hubs = (state.get("result") or {}).get("hubs") or []
    devices = (hubs[0].get("devices") if hubs else None) or {}
    return {int(k): str((v or {}).get("name") or "") for k, v in devices.items()}


async def fetch_and_compare(ha: HaWs, entry_id: str, device_id: int) -> dict[str, Any]:
    res = await ha.call({"type": "sofabaton_x1s/blobs/fetch", "entry_id": entry_id, "device_id": device_id},
                        timeout=90)
    if not res.get("success"):
        print(f"  fetch FAILED: {res.get('error')}")
        return {"ok": False, "error": res.get("error")}
    rows = (res.get("result") or {}).get("commands") or []
    want = source_blobs()
    names = {1: "S1 Off", 2: "S2 On", 3: "S3 Down"}
    report: dict[str, Any] = {"rows": [], "ok": True}
    by_label = {str(r.get("command_label")): r for r in rows}
    for src_id, blob in want.items():
        row = by_label.get(names[src_id])
        if row is None and len(rows) == 1 and len(want) == 1:
            row = rows[0]
        if row is None:
            report["ok"] = False
            report["rows"].append({"source": src_id, "missing": True})
            print(f"  {names[src_id]}: MISSING on the hub")
            continue
        got = bytes.fromhex(str(row.get("command_blob") or ""))
        entry = {
            "source": src_id, "command_id": row.get("command_id"), "label": row.get("command_label"),
            "library_type": row.get("library_type"), "device_class": row.get("device_class"),
            "blob_kind": row.get("blob_kind"), "bytes_equal": got == blob, "length": len(got),
        }
        if got != blob:
            entry["diff_at"] = next((i for i in range(min(len(got), len(blob))) if got[i] != blob[i]), None)
            entry["got_hex"] = got.hex(" ")
        report["rows"].append(entry)
        lt_ok = entry["library_type"] in (CODE_TYPE, None)
        report["ok"] = report["ok"] and entry["bytes_equal"] and lt_ok
        print(f"  {names[src_id]} -> cmd {entry['command_id']}: bytes_equal={entry['bytes_equal']} "
              f"library_type={entry['library_type']} class={entry['device_class']} kind={entry['blob_kind']}")
        print(f"     {describe(got)}")
    return report


# --------------------------------------------------------------------------
# seed / fetch / clean
# --------------------------------------------------------------------------

async def cmd_seed(entry_id: str, tag: str) -> None:
    bundle = build_bundle()
    out: dict[str, Any] = {"entry_id": entry_id}
    async with HaWs() as ha:
        before = await hub_devices(ha, entry_id)
        out["devices_before"] = before
        if DEVICE_NAME in before.values():
            raise SystemExit(f"{DEVICE_NAME} already on this hub: {before}")
        print(f"  devices before: {before}")
        res = await ha.call({"type": "sofabaton_x1s/backup/restore", "entry_id": entry_id,
                             "backup": bundle, "mode": "merge"})
        if not res.get("success"):
            raise SystemExit(f"restore refused: {res.get('error')}")
        t0 = time.time()
        op = await wait_op(ha, entry_id, "backup_restore")
        out["restore"] = op
        print(f"  restore {op.get('status')} in {time.time() - t0:.0f}s: {op.get('message')}")
        result = op.get("result") or {}
        id_map = result.get("device_id_map") or {}
        print(f"  device_id_map: {id_map}")
        new_id = int(next(iter(id_map.values()))) if id_map else None
        if new_id is None:
            after = await hub_devices(ha, entry_id)
            new_id = next((k for k, v in after.items() if v == DEVICE_NAME), None)
        out["device_id"] = new_id
        if new_id is not None:
            await asyncio.sleep(2.0)
            out["readback"] = await fetch_and_compare(ha, entry_id, new_id)
    path = save_json(f"rf-seed-{tag}", out)
    print(f"  device_id={out.get('device_id')} readback ok={(out.get('readback') or {}).get('ok')}")
    print(f"saved {path}")


async def cmd_fetch(entry_id: str, device_id: int, tag: str) -> None:
    async with HaWs() as ha:
        report = await fetch_and_compare(ha, entry_id, device_id)
    print(f"saved {save_json(f'rf-fetch-{tag}', report)}")


async def cmd_clean(entry_id: str, device_id: int) -> None:
    async with HaWs() as ha:
        devices = await hub_devices(ha, entry_id)
        if devices.get(device_id) not in BENCH_NAMES:
            raise SystemExit(f"device {device_id} is {devices.get(device_id)!r}, not a bench device: refusing")
        res = await ha.call({"type": "sofabaton_x1s/device/delete", "entry_id": entry_id,
                             "device_id": device_id}, timeout=180)
        print(f"  device/delete: success={res.get('success')} {res.get('error') or ''}")
        await asyncio.sleep(3.0)
        print(f"  devices after: {await hub_devices(ha, entry_id)}")


# --------------------------------------------------------------------------
# loop (R2 / R3)
# --------------------------------------------------------------------------

X1S_DEV, X2_DEV, X2_FAN_DEV, X2_FAN_POWER_OFF = 3, 10, 4, 2


async def x2_remote_entity(ha: HaWs, entry_id: str) -> str:
    reg = await ha.call({"type": "config/entity_registry/list"})
    for e in reg.get("result") or []:
        if e.get("config_entry_id") == entry_id and str(e.get("entity_id", "")).startswith("remote."):
            return e["entity_id"]
    raise SystemExit("no remote entity for the X2 entry")


async def ha_learn(ha: HaWs, entry_id: str, band: int, window: int, on_listening) -> dict[str, Any]:
    """ir_learn/subscribe with band; runs ``on_listening`` once listening."""

    ha._id += 1
    sub_id = ha._id
    t0 = time.monotonic()
    await ha.ws.send(json.dumps({"id": sub_id, "type": "sofabaton_x1s/ir_learn/subscribe",
                                 "entry_id": entry_id, "timeout": window, "band": band}))
    task = None
    events: list[dict[str, Any]] = []
    terminal: dict[str, Any] | None = None
    deadline = time.monotonic() + window + 25
    while time.monotonic() < deadline:
        try:
            msg = json.loads(await asyncio.wait_for(ha.ws.recv(), timeout=deadline - time.monotonic()))
        except asyncio.TimeoutError:
            break
        if msg.get("id") != sub_id:
            continue
        if msg.get("type") == "result":
            if not msg.get("success"):
                terminal = {"state": "subscribe_error", "error": msg.get("error")}
                break
            continue
        ev = dict(msg.get("event") or {})
        ev["_at"] = round(time.monotonic() - t0, 2)
        events.append({k: v for k, v in ev.items() if k != "payload_hex"})
        if ev.get("state") == "listening":
            if task is None:
                task = asyncio.create_task(on_listening())
            continue
        terminal = ev
        break
    emit = await task if task is not None else None
    await ha.call({"type": "unsubscribe_events", "subscription": sub_id})
    return {"learner": terminal, "events": events, "emit": emit}


def run_loop(x1s_ip: str, x2_entry: str, tag: str, opts: dict[str, str]) -> None:
    from bench_common import connect, setup_logging
    from rf_bench_codec import compare_blobs

    legs = opts.get("--legs", "A0,A1,A2,B1,B2,C1,C2,A2s2,A2s3,B2s2,B2s3,L1").split(",")
    times = int(opts.get("--times", "3"))
    lead = float(opts.get("--lead", "2"))
    window = int(float(opts.get("--window", "20")))
    band = int(opts.get("--band", "433"))
    # Crossed-band legs: send on one band while the learner listens on the other.
    emit_band = int(opts.get("--emit-band", band))
    learn_band = int(opts.get("--learn-band", band))
    expect_none = opts.get("--expect") == "none"
    print(f"logging to {setup_logging(f'rf-loop-{tag}')}")
    src = source_blobs()
    fan = {int(r["command_id"]): bytes.fromhex(r["blob_hex"])
           for r in json.loads((REPO / "scripts" / "hub-bench" / "out" / "rf-fan-x2.json").read_text("utf-8"))}
    learned_store: dict[str, bytes] = {}
    x1s_dev = int(opts.get("--x1s-dev", X1S_DEV))
    results: dict[str, Any] = {"emit_band": emit_band, "learn_band": learn_band,
                               "expect_none": expect_none, "legs": {}}

    x1s = connect(x1s_ip, "X1S")
    time.sleep(3.0)

    async def main() -> None:
        async with HaWs() as ha:
            remote = await x2_remote_entity(ha, x2_entry)
            print(f"X2 remote entity: {remote}")

            async def x2_stored(dev: int, cmd: int) -> dict[str, Any]:
                r = await ha.call({"type": "call_service", "domain": "remote", "service": "send_command",
                                   "target": {"entity_id": remote},
                                   "service_data": {"command": str(cmd), "device": dev}})
                return {"via": f"x2 stored {dev}/{cmd}", "success": r.get("success"), "error": r.get("error")}

            async def x2_blob(blob: bytes) -> dict[str, Any]:
                r = await ha.call({"type": "sofabaton_x1s/blobs/play", "entry_id": x2_entry,
                                   "blob": blob.hex(" "), "band": emit_band})
                return {"via": "x2 one-shot", "success": r.get("success"), "error": r.get("error"),
                        "result": r.get("result")}

            def x1s_stored(dev: int, cmd: int) -> dict[str, Any]:
                return {"via": f"x1s stored {dev}/{cmd}", "success": bool(x1s.send_command(dev, cmd))}

            def x1s_blob(blob: bytes) -> dict[str, Any]:
                return {"via": "x1s one-shot", "success": bool(x1s.play_rf_blob(blob, band=emit_band))}

            async def x1s_learns(emit, *, win: int = window, delay: float = lead) -> dict[str, Any]:
                box: dict[str, Any] = {}
                loop = asyncio.get_running_loop()
                fut = loop.run_in_executor(None, lambda: x1s.rf_learn_command(band=learn_band, timeout=win))
                await asyncio.sleep(delay)
                box["emit"] = await emit()
                box["learner"] = await fut
                return box

            async def x2_learns(emit_sync) -> dict[str, Any]:
                async def later():
                    await asyncio.sleep(lead)
                    return await asyncio.to_thread(emit_sync)
                return await ha_learn(ha, x2_entry, learn_band, window, later)

            def plan_for(leg: str):
                s1, s2, s3 = src[1], src[2], src[3]
                if leg == "A0":
                    return fan[X2_FAN_POWER_OFF], lambda: x1s_learns(lambda: x2_stored(X2_FAN_DEV, X2_FAN_POWER_OFF))
                if leg == "A1":
                    return s1, lambda: x1s_learns(lambda: x2_stored(X2_DEV, 1))
                if leg == "A2":
                    return s1, lambda: x1s_learns(lambda: x2_blob(s1))
                if leg == "A2s2":
                    return s2, lambda: x1s_learns(lambda: x2_blob(s2))
                if leg == "A2s3":
                    return s3, lambda: x1s_learns(lambda: x2_blob(s3))
                if leg == "B1":
                    return s1, lambda: x2_learns(lambda: x1s_stored(x1s_dev, 1))
                if leg == "B2":
                    return s1, lambda: x2_learns(lambda: x1s_blob(s1))
                if leg == "B2s2":
                    return s2, lambda: x2_learns(lambda: x1s_blob(s2))
                if leg == "B2s3":
                    return s3, lambda: x2_learns(lambda: x1s_blob(s3))
                if leg == "C1":
                    blob = learned_store.get("A1")
                    return s1, (None if blob is None else lambda: x1s_learns(lambda: x2_blob(blob)))
                if leg == "C2":
                    blob = learned_store.get("B1")
                    return s1, (None if blob is None else lambda: x2_learns(lambda: x1s_blob(blob)))
                if leg == "L1":
                    return s1, lambda: x1s_learns(lambda: x2_blob(s1), win=75, delay=65.0)
                raise SystemExit(f"unknown leg {leg}")

            for leg in legs:
                ref, runner = plan_for(leg)
                n = 1 if leg in ("L1", "A2s2", "A2s3", "B2s2", "B2s3") else times
                print(f"== {leg} ({n} run(s))")
                runs = []
                if runner is None:
                    print("   skipped: the leg it replays has no learned blob")
                    results["legs"][leg] = {"skipped": True}
                    continue
                for i in range(n):
                    t0 = time.monotonic()
                    out = await runner()
                    learner = out.get("learner") or {}
                    state = learner.get("state")
                    hex_ = learner.get("payload_hex")
                    run: dict[str, Any] = {"run": i + 1, "seconds": round(time.monotonic() - t0, 1),
                                           "emit": out.get("emit"), "state": state,
                                           "events": out.get("events")}
                    if learner.get("error_code") or learner.get("interrupted_by"):
                        run["detail"] = learner.get("error_code") or learner.get("interrupted_by")
                    if hex_:
                        got = bytes.fromhex(hex_)
                        cmp = compare_blobs(ref, got)
                        run["learned_hex"] = got.hex(" ")
                        run["compare"] = cmp
                        run["pass"] = (not expect_none) and bool(cmp.get("match")) and cmp["learned"].get("be16_matches_length", False)
                        learned_store.setdefault(leg, got)
                        if leg == "A0":
                            run["vs_fan_record"] = {k: cmp["learned"].get(k) for k in
                                                    ("length", "count_byte", "count_matches", "gap_us")}
                        print(f"   run {i + 1}: {state} {'PASS' if run['pass'] else 'FAIL'} "
                              f"learned={cmp.get('learned_hex')} want={cmp.get('sent_hex')} "
                              f"{cmp['learned'].get('length')}B count={cmp['learned'].get('count_byte')} "
                              f"gap={cmp['learned'].get('gap_us')}us unit~{(cmp.get('learned_bits') or {}).get('unit_us')}us "
                              f"maxdelta={cmp.get('max_abs_delta_us')}us emit={(out.get('emit') or {}).get('success')}")
                    else:
                        run["pass"] = expect_none and state == "timed_out"
                        print(f"   run {i + 1}: {state} {'PASS' if run['pass'] else 'FAIL'} {run.get('detail') or ''} "
                              f"emit={out.get('emit')}")
                    runs.append(run)
                    await asyncio.sleep(2.0)
                results["legs"][leg] = {"runs": runs, "passed": sum(1 for r in runs if r["pass"]), "of": n}
                save_json(f"rf-loop-{tag}", results)

    try:
        asyncio.run(main())
    finally:
        x1s.stop()
        print(f"saved {save_json(f'rf-loop-{tag}', results)}")
        print("summary: " + ", ".join(
            f"{k} {v.get('passed', 0)}/{v.get('of', 0)}" if not v.get("skipped") else f"{k} skipped"
            for k, v in results["legs"].items()))


# --------------------------------------------------------------------------
# R4 helpers: the other side of an editor action, through HA only
# --------------------------------------------------------------------------

async def cmd_ha_learn(entry_id: str, band: int, window: int, tag: str) -> None:
    """Learn on one hub through HA and decode whatever arrives."""

    async def nothing() -> None:
        print("  listening", flush=True)
        return None

    async with HaWs() as ha:
        out = await ha_learn(ha, entry_id, band, window, nothing)
    learner = out.get("learner") or {}
    hex_ = learner.get("payload_hex")
    print(f"  state={learner.get('state')} {learner.get('error_code') or ''}")
    if hex_:
        blob = bytes.fromhex(hex_)
        print(f"  learned {describe(blob)}")
        matches = [n for n, b in source_blobs().items()
                   if decode_bits(parse_rf_blob(b)["durations"])["best"]
                   == decode_bits(parse_rf_blob(blob)["durations"])["best"]]
        print(f"  decodes as source S{matches}" if matches else "  decodes as no source code")
    save_json(f"rf-halearn-{tag}", out)


async def cmd_ha_play(entry_id: str, band: int, source: int) -> None:
    blob = source_blobs()[source]
    async with HaWs() as ha:
        r = await ha.call({"type": "sofabaton_x1s/blobs/play", "entry_id": entry_id,
                           "blob": blob.hex(" "), "band": band})
    print(f"  play S{source} at {band}: success={r.get('success')} {r.get('error') or ''}")


if len(sys.argv) < 2:
    raise SystemExit(__doc__)
SUB, ARGS = sys.argv[1], sys.argv[2:]
if SUB == "halearn":
    asyncio.run(cmd_ha_learn(ARGS[0], int(ARGS[1]), int(ARGS[2]), ARGS[3]))
    raise SystemExit(0)
if SUB == "haplay":
    asyncio.run(cmd_ha_play(ARGS[0], int(ARGS[1]), int(ARGS[2])))
    raise SystemExit(0)
if SUB == "loop":
    _pos = [a for a in ARGS if not a.startswith("--")]
    _opts = {ARGS[i]: ARGS[i + 1] for i in range(len(ARGS) - 1) if ARGS[i].startswith("--")}
    _pos = [a for a in _pos if a not in _opts.values()]
    run_loop(_pos[0], _pos[1], _pos[2], _opts)
    raise SystemExit(0)
if SUB == "dryrun":
    cmd_dryrun()
elif SUB == "seed":
    asyncio.run(cmd_seed(ARGS[0], ARGS[1]))
elif SUB == "fetch":
    asyncio.run(cmd_fetch(ARGS[0], int(ARGS[1]), ARGS[2]))
elif SUB == "clean":
    asyncio.run(cmd_clean(ARGS[0], int(ARGS[1])))
else:
    raise SystemExit(__doc__)
