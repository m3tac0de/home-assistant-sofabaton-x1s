"""Empty-hub validation through the deployed HA integration (PR #280 follow-up).

Drives the real backend path (HA WS -> hub.py -> lib) against a hub that
genuinely has no devices and no activities, to re-establish that the
fetch-then-prune catalog refresh and the committed-burst gating treat the
hub's STATUS_ACK 0x07 "empty catalog" reply as a complete read and never
as a timeout or a phantom power-off.

Subcommands (all read scripts/.ha-config.json + scripts/.ha-token):

    state                       list hubs with entry ids / counts / connection
    backup  <entry_prefix> <tag>  backup/export (blobs included) -> out/<tag>.json
    probe   <entry_prefix> <tag>  empty-hub checks: states, catalog/refresh x2,
                                  backup/export on an empty hub, log grep
    restore <entry_prefix> <file> [replace|merge]
                                  backup/restore + progress until terminal
    verify  <entry_prefix> <file> counts/names of the live hub vs the bundle

The erase itself is not exposed by HA outside replace-mode restore, so
it runs through the direct harness (bench_171_erase_direct.py) with the
HA entry disabled; see that script.
"""

from __future__ import annotations

import asyncio
import json
import re
import ssl
import sys
import time
import urllib.request
from pathlib import Path

import websockets

BENCH_DIR = Path(__file__).resolve().parent / "out"
BENCH_DIR.mkdir(exist_ok=True)
SCRIPTS = Path(__file__).resolve().parents[1]
CONFIG = json.loads((SCRIPTS / ".ha-config.json").read_text(encoding="utf-8"))
TOKEN = (SCRIPTS / ".ha-token").read_text(encoding="utf-8").strip()
BASE = CONFIG["base_url"]
WS_URL = BASE.replace("https://", "wss://", 1).replace("http://", "ws://", 1) + "/api/websocket"

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" -- {detail}" if detail else ""))


class HaWs:
    def __init__(self) -> None:
        self._id = 0
        self.ws = None

    async def __aenter__(self):
        kwargs = {}
        if WS_URL.startswith("wss://"):
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            kwargs["ssl"] = ctx
        self.ws = await websockets.connect(WS_URL, max_size=64 * 1024 * 1024, **kwargs)
        hello = json.loads(await self.ws.recv())
        assert hello["type"] == "auth_required", hello
        await self.ws.send(json.dumps({"type": "auth", "access_token": TOKEN}))
        ok = json.loads(await self.ws.recv())
        assert ok["type"] == "auth_ok", ok
        return self

    async def __aexit__(self, *exc):
        await self.ws.close()

    async def call(self, payload: dict, timeout: float = 180.0) -> tuple[dict, float]:
        self._id += 1
        msg_id = self._id
        t0 = time.time()
        await self.ws.send(json.dumps({"id": msg_id, **payload}))
        deadline = time.time() + timeout
        while time.time() < deadline:
            raw = json.loads(await asyncio.wait_for(self.ws.recv(), timeout=max(1.0, deadline - time.time())))
            if raw.get("type") == "result" and raw.get("id") == msg_id:
                return raw, time.time() - t0
        raise TimeoutError(f"no result for id={msg_id}")


def rest_get(path: str):
    req = urllib.request.Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {TOKEN}"})
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
        body = resp.read().decode("utf-8")
    return body


async def hubs(ha: HaWs) -> list[dict]:
    state, _ = await ha.call({"type": "sofabaton_x1s/control_panel/state"})
    assert state.get("success"), state
    return (state.get("result") or {}).get("hubs") or []


async def pick(ha: HaWs, prefix: str) -> dict:
    for hub in await hubs(ha):
        if str(hub.get("entry_id") or "").startswith(prefix):
            return hub
    raise SystemExit(f"no hub entry starting with {prefix!r}")


def hub_summary(hub: dict) -> str:
    return (
        f"{hub.get('name')} entry={str(hub.get('entry_id'))[:8]} version={hub.get('version')} "
        f"connected={hub.get('hub_connected')} devices={hub.get('device_count')} activities={hub.get('activity_count')} "
        f"runtime={hub.get('runtime_state')}"
    )


async def wait_backup(ha: HaWs, entry_id: str, kind: str, timeout: float = 600.0) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        state, _ = await ha.call({"type": "sofabaton_x1s/backup/state", "entry_id": entry_id})
        op = (state.get("result") or {}).get(kind) or {}
        msg = f"[{op.get('completed_steps')}/{op.get('total_steps')}] {op.get('phase')}: {op.get('message')}"
        if msg != last:
            print("   ", msg)
            last = msg
        if op.get("status") in {"success", "failed", "error"}:
            return op
        await asyncio.sleep(1.0)
    raise TimeoutError(f"{kind} did not finish within {timeout}s")


def bundle_counts(bundle: dict) -> tuple[dict, dict]:
    devs = bundle.get("devices") or {}
    acts = bundle.get("activities") or {}
    if isinstance(devs, list):
        devs = {str(i): d for i, d in enumerate(devs)}
    if isinstance(acts, list):
        acts = {str(i): a for i, a in enumerate(acts)}
    return devs, acts


def entity_name(block: dict) -> str:
    for key in ("name", "label"):
        if block.get(key):
            return str(block[key])
    inner = block.get("device") or block.get("activity") or {}
    return str(inner.get("name") or "")


async def cmd_state() -> None:
    async with HaWs() as ha:
        for hub in await hubs(ha):
            print(" ", hub_summary(hub))


async def cmd_backup(prefix: str, tag: str) -> None:
    async with HaWs() as ha:
        hub = await pick(ha, prefix)
        print("  hub:", hub_summary(hub))
        res, dt = await ha.call({"type": "sofabaton_x1s/backup/export", "entry_id": hub["entry_id"]})
        check("backup/export accepted", res.get("success") is True, f"{dt:.1f}s {res.get('error')}")
        op = await wait_backup(ha, hub["entry_id"], "backup_export")
        check("backup_export finished", op.get("status") == "success", f"{op.get('status')} {op.get('message')}")
        bundle = op.get("backup")
        assert isinstance(bundle, dict), "no bundle in result"
        devs, acts = bundle_counts(bundle)
        incomplete = [entity_name(b) for b in list(devs.values()) + list(acts.values()) if b.get("complete") is False]
        check("every entity complete", not incomplete, f"incomplete={incomplete}")
        path = BENCH_DIR / f"{tag}.json"
        path.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
        print(f"  saved {path} devices={len(devs)} activities={len(acts)} kind={bundle.get('kind')} schema={bundle.get('schema_version')}")


async def cmd_probe(prefix: str, tag: str) -> None:
    async with HaWs() as ha:
        hub = await pick(ha, prefix)
        print("  hub:", hub_summary(hub))
        check("hub connected", bool(hub.get("hub_connected")))
        check("catalog empty in control_panel/state", not hub.get("device_count") and not hub.get("activity_count"),
              f"devices={hub.get('device_count')} activities={hub.get('activity_count')}")

        # Entity states via REST.
        states = json.loads(rest_get("/api/states"))
        slug = None
        for st in states:
            eid = st["entity_id"]
            if eid.startswith("binary_sensor.") and eid.endswith("_hub_connected") and st["attributes"].get("entry_id") == hub["entry_id"]:
                slug = eid[len("binary_sensor."):-len("_hub_connected")]
        if slug is None:
            # fall back: match by hub name
            name_slug = re.sub(r"[^a-z0-9]+", "_", str(hub.get("name", "")).lower()).strip("_")
            slug = next((st["entity_id"][len("binary_sensor."):-len("_hub_connected")] for st in states
                         if st["entity_id"].startswith("binary_sensor.") and st["entity_id"].endswith("_hub_connected")
                         and name_slug in st["entity_id"]), None)
        by_id = {st["entity_id"]: st for st in states}
        if slug:
            conn = by_id.get(f"binary_sensor.{slug}_hub_connected", {})
            idx = by_id.get(f"sensor.{slug}_index", {})
            sel = by_id.get(f"select.{slug}_activity", {})
            check("binary_sensor hub_connected on", conn.get("state") == "on", f"{slug}: {conn.get('state')}")
            check("sensor index ready (not loading)", idx.get("state") == "ready", f"{idx.get('state')}")
            opts = (sel.get("attributes") or {}).get("options")
            check("select shows only Powered Off", sel.get("state") in ("Powered Off", "Power Off") and opts and len(opts) == 1,
                  f"state={sel.get('state')} options={opts}")
        else:
            check("found entity slug", False, "could not map hub to entities")

        # Explicit refreshes: must succeed (0x07 = complete empty read), not time out.
        for kind in ("activities", "devices", "activities"):
            res, dt = await ha.call({"type": "sofabaton_x1s/catalog/refresh", "entry_id": hub["entry_id"], "kind": kind})
            check(f"catalog/refresh {kind} ok", res.get("success") is True, f"{dt:.1f}s {res.get('error')}")

        # Backup of an empty hub must succeed and be empty.
        res, dt = await ha.call({"type": "sofabaton_x1s/backup/export", "entry_id": hub["entry_id"]})
        check("backup/export on empty hub accepted", res.get("success") is True, f"{res.get('error')}")
        if res.get("success"):
            op = await wait_backup(ha, hub["entry_id"], "backup_export")
            bundle = op.get("backup") or {}
            devs, acts = bundle_counts(bundle)
            check("empty backup finished", op.get("status") == "success", f"{op.get('status')} devices={len(devs)} activities={len(acts)}")
            (BENCH_DIR / f"{tag}-empty-bundle.json").write_text(json.dumps(bundle, indent=2), encoding="utf-8")

        hub2 = await pick(ha, prefix)
        check("still connected after probes", bool(hub2.get("hub_connected")))
        check("still empty after probes", not hub2.get("device_count") and not hub2.get("activity_count"))

        # Log evidence.
        log = rest_get("/api/error_log")
        eid = hub["entry_id"]
        lines = [ln for ln in log.splitlines() if eid in ln or "sofabaton" in ln]
        tail = lines[-400:]
        empty_acks = [ln for ln in tail if "0x07 indicates an empty" in ln]
        committed_zero = [ln for ln in tail if eid in ln and "committed=True, count=0" in ln]
        timeouts = [ln for ln in tail if eid in ln and ("Timed out waiting for a complete" in ln or "TimeoutError" in ln)]
        phantom = [ln for ln in tail if eid in ln and "Activity changed:" in ln]
        discards = [ln for ln in tail if "discarding incomplete" in ln]
        check("log: STATUS_ACK 0x07 empty-catalog acks seen", bool(empty_acks), f"{len(empty_acks)}")
        check("log: committed empty activities burst seen", bool(committed_zero), f"{len(committed_zero)}")
        check("log: no refresh timeouts", not timeouts, f"{len(timeouts)}")
        check("log: no discarded incomplete snapshots", not discards, f"{len(discards)}")
        print("  activity-change lines for this hub in window:", len(phantom))
        for ln in phantom[-5:]:
            print("    ", ln[:160])
        (BENCH_DIR / f"{tag}-log.txt").write_text("\n".join(tail), encoding="utf-8")


async def cmd_restore(prefix: str, file: str, mode: str = "replace") -> None:
    bundle = json.loads(Path(file).read_text(encoding="utf-8"))
    async with HaWs() as ha:
        hub = await pick(ha, prefix)
        print("  hub:", hub_summary(hub))
        devs, acts = bundle_counts(bundle)
        print(f"  restoring {file}: devices={len(devs)} activities={len(acts)} mode={mode}")
        res, dt = await ha.call({"type": "sofabaton_x1s/backup/restore", "entry_id": hub["entry_id"], "backup": bundle, "mode": mode})
        check("backup/restore accepted", res.get("success") is True, f"{res.get('error')}")
        if not res.get("success"):
            return
        t0 = time.time()
        op = await wait_backup(ha, hub["entry_id"], "backup_restore", timeout=1800.0)
        check("backup_restore finished", op.get("status") == "success", f"{op.get('status')} {op.get('message')} {time.time() - t0:.0f}s")
        result = op.get("result") or {}
        print("  result keys:", sorted(result.keys())[:20])
        (BENCH_DIR / f"restore-result-{prefix}.json").write_text(json.dumps(op, indent=2, default=str), encoding="utf-8")


async def cmd_verify(prefix: str, file: str) -> None:
    bundle = json.loads(Path(file).read_text(encoding="utf-8"))
    b_devs, b_acts = bundle_counts(bundle)
    want_dev = sorted(entity_name(b) for b in b_devs.values())
    want_act = sorted(entity_name(b) for b in b_acts.values())
    async with HaWs() as ha:
        hub = await pick(ha, prefix)
        print("  hub:", hub_summary(hub))
        for kind in ("devices", "activities"):
            res, dt = await ha.call({"type": "sofabaton_x1s/catalog/refresh", "entry_id": hub["entry_id"], "kind": kind})
            check(f"catalog/refresh {kind} ok", res.get("success") is True, f"{dt:.1f}s {res.get('error')}")
        hub = await pick(ha, prefix)
        check("counts match bundle", hub.get("device_count") == len(b_devs) and hub.get("activity_count") == len(b_acts),
              f"devices={hub.get('device_count')}/{len(b_devs)} activities={hub.get('activity_count')}/{len(b_acts)}")
        check("hub connected", bool(hub.get("hub_connected")))
        res, dt = await ha.call({"type": "sofabaton_x1s/backup/export", "entry_id": hub["entry_id"]})
        check("post-restore backup/export accepted", res.get("success") is True, f"{res.get('error')}")
        op = await wait_backup(ha, hub["entry_id"], "backup_export")
        post = op.get("backup") or {}
        (BENCH_DIR / f"{prefix}-post.json").write_text(json.dumps(post, indent=2), encoding="utf-8")
        p_devs, p_acts = bundle_counts(post)
        have_dev = sorted(entity_name(b) for b in p_devs.values())
        have_act = sorted(entity_name(b) for b in p_acts.values())
        check("device names match bundle", have_dev == want_dev, f"have={have_dev} want={want_dev}")
        check("activity names match bundle", have_act == want_act, f"have={have_act} want={want_act}")
        incomplete = [entity_name(b) for b in list(p_devs.values()) + list(p_acts.values()) if b.get("complete") is False]
        check("every restored entity complete", not incomplete, f"{incomplete}")


def main() -> None:
    cmd = sys.argv[1]
    args = sys.argv[2:]
    if cmd == "state":
        asyncio.run(cmd_state())
    elif cmd == "backup":
        asyncio.run(cmd_backup(*args))
    elif cmd == "probe":
        asyncio.run(cmd_probe(*args))
    elif cmd == "restore":
        asyncio.run(cmd_restore(*args))
    elif cmd == "verify":
        asyncio.run(cmd_verify(*args))
    else:
        raise SystemExit(__doc__)
    failed = [c for c in checks if not c[1]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
