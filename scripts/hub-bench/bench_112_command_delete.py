"""In-place deploy program chunk 2: single-command delete discovery.

Plan: docs/internal/wifi-inplace-deploy-plan.md (bench chunk 2).

Deploys a FRESH sacrificial bench wifi device (6 short + 6 long slots,
power 1/2, input on 6), attaches it to ACT_A (0x65) with a favorite and
a RED hard-button binding on command 3, then exercises the candidate
single-command delete frame captured off the wire:

    A5 5A 02 10 <dev> <cmd> <cksum>     (family 0x10 = FAMILY_FAV_DELETE,
                                         payload [device_id, command_id],
                                         ACK 0x0103, no commit, no sort
                                         rewrite — the device-scoped twin
                                         of the activity key-delete)

The delete-id form is itself under test on X1 (records are stored at hub
key ids 0x18.. but re-exposed as command ids 1..20): the helper tries the
command_id first, and on X1 falls back to the raw key id 0x17+id if the
first form does not remove the slot. Also probed: whether a 0x65 commit
is needed, key-sort blob after delete, the fate of the favorite + binding
that referenced the deleted command, and whether a direct fire of a freed
id produces any callback.

Deletes: cmd 5 (plain short), cmd 3 (favorite + binding), cmd 13 (the
long-press record of slot 3). Cleans up by deleting the whole bench
device at the end (byte-compares the catalog back to pre-deploy).

Takes a full recovery bundle first (skip with 4th arg ``skipbundle``).

Usage:
    python bench_112_command_delete.py <ip> <X1|X1S> <tag> [skipbundle]
"""

from __future__ import annotations

import copy
import json
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path

from bench_common import connect, save_json, setup_logging
from bench_wifi_listener import BenchWifiListener, local_ip_toward

from x1slib.protocol_const import FAMILY_FAV_DELETE, ButtonName

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SKIP_BUNDLE = len(sys.argv) > 4 and sys.argv[4] == "skipbundle"

LISTENER_PORT = 8060
DEVICE_NAME = "Bench Wifi Del"
BRAND_NAME = "m3-benchwifi-delete00000001"
SLOT_NAMES = ["Del One", "Del Two", "Del Three", "Del Four", "Del Five", "Del Six"]
POWER_ON_ID = 1
POWER_OFF_ID = 2
INPUT_IDS = [6]
# Long-press records take command-table ids immediately after the short
# slots: with N short slots the long of short id S is S + N (confirmed
# 1..12 for 6 slots). NOT a fixed +10 (that only held at 10 slots).
LONG_OFFSET = len(SLOT_NAMES)  # 6

ACT_A = 0x65
UNTOUCHED = 0x67
FAV_CMD = 3          # gets a favorite + RED binding
BIND_LONG = FAV_CMD + LONG_OFFSET  # 9
DELETE_PLAIN = 5     # short, unreferenced
DELETE_REF = FAV_CMD  # short, referenced by favorite + binding
DELETE_LONG = BIND_LONG  # long-press record of slot 3

RECOVERY_DIR = Path.home() / "x1s-bench-recovery"

log_path = setup_logging(f"cmddel-c2-{TAG}")
print(f"logging to {log_path}")


def build_command_defs() -> list[dict]:
    defs: list[dict] = []
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": name, "trigger_name": name, "press_type": "short", "command_index": idx})
    for idx, name in enumerate(SLOT_NAMES):
        defs.append({"display_name": f"{name} Long", "trigger_name": name, "press_type": "long", "command_index": idx})
    return defs


def canon(payload: dict) -> str:
    def strip(node):
        if isinstance(node, dict):
            return {k: strip(v) for k, v in node.items() if k not in ("captured_at", "fetched_at")}
        if isinstance(node, list):
            return [strip(v) for v in node]
        return node

    return json.dumps(strip(copy.deepcopy(payload)), sort_keys=True)


checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def fresh_commands(proxy, dev: int, timeout: float = 8.0, expect_nonempty: bool = True) -> set[int]:
    """Force a fresh command-list read and return the id set.

    The burst can land empty transiently right after a write/resync; retry
    a few times when a non-empty table is expected before giving up.
    """
    for _ in range(4):
        proxy.state.commands.pop(dev, None)
        proxy._commands_complete.discard(dev)
        proxy.get_commands_for_entity(dev, fetch_if_missing=True)
        deadline = time.time() + timeout
        while time.time() < deadline and dev not in proxy._commands_complete:
            time.sleep(0.3)
        cmds, _ready = proxy.get_commands_for_entity(dev, fetch_if_missing=False)
        ids = set(cmds)
        if ids or not expect_nonempty:
            return ids
        time.sleep(1.0)
    return set()


def device_sort(proxy, dev: int) -> object:
    """Structural per-device snapshot (commands + key_sort), no blobs."""
    bundle = proxy.backup_hub_bundle(device_ids=[dev], include_blobs=False)
    devs = bundle.get("devices") or []
    for entry in devs:
        d = entry.get("device") or {}
        if int(d.get("device_id", -1)) == dev:
            return {
                "command_ids": sorted(int(c.get("command_id")) for c in (entry.get("commands") or []) if c.get("command_id") is not None),
                "key_sort": entry.get("key_sort"),
            }
    return None


def delete_command(proxy, dev: int, cmd: int) -> dict:
    """Try the captured single-command delete; report which form worked.

    Returns {removed, method, before, after, tried}.
    """
    before = fresh_commands(proxy, dev)
    tried: list[str] = []

    def send(label: str, key: int, commit: bool) -> bool:
        proxy.reset_ack_queues()
        step = proxy._send_step(
            step_name=f"cmd-delete-10[dev=0x{dev:02X} key=0x{key:02X}]{label}",
            family=FAMILY_FAV_DELETE,
            payload=bytes([dev & 0xFF, key & 0xFF]),
            ack_opcode=0x0103,
            timeout=5.0,
        )
        tried.append(f"{label} key=0x{key:02X} ack={step.outcome}")
        if not step.ok:
            return False
        if commit:
            c = proxy._send_step(
                step_name=f"cmd-delete-commit-65[dev=0x{dev:02X}]{label}",
                family=0x65,
                payload=bytes([dev & 0xFF]),
                ack_opcode=0x0103,
                timeout=5.0,
            )
            tried.append(f"{label} commit ack={c.outcome}")
        time.sleep(0.5)
        return cmd not in fresh_commands(proxy, dev)

    # form 1: command_id, no commit (the app's exact behavior)
    method = None
    if send("[id/bare]", cmd, commit=False):
        method = "id/bare"
    elif send("[id/commit]", cmd, commit=True):
        method = "id/commit"
    elif HUB_VERSION.upper() == "X1":
        raw = 0x17 + cmd  # X1 stored-key form (0x18.. table, id 1 -> 0x18)
        if send("[rawkey/bare]", raw, commit=False):
            method = "rawkey/bare"
        elif send("[rawkey/commit]", raw, commit=True):
            method = "rawkey/commit"

    after = fresh_commands(proxy, dev)
    return {"removed": cmd not in after, "method": method, "before": sorted(before), "after": sorted(after), "tried": tried}


bench_ip = local_ip_toward(HOST)
listener = BenchWifiListener(LISTENER_PORT, mode="ok").start()
print(f"listener on {bench_ip}:{LISTENER_PORT} mode=ok")

proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "bench_ip": bench_ip}
dev = None
try:
    # ---------------- recovery bundle
    if SKIP_BUNDLE:
        print("recovery bundle SKIPPED")
    else:
        print("taking full recovery bundle (include_blobs=True)...")
        bundle = proxy.backup_hub_bundle(include_blobs=True)
        ok = isinstance(bundle, dict) and bundle.get("kind") == "hub_bundle"
        check("GATE: recovery bundle captured", ok, f"kind={bundle.get('kind') if isinstance(bundle, dict) else bundle!r}")
        if not ok:
            raise SystemExit("recovery bundle failed; refusing to mutate")
        bpath = save_json(f"cmddel-c2-bundle-{TAG}", bundle)
        RECOVERY_DIR.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(bpath, RECOVERY_DIR / f"cmddel-c2-bundle-{TAG}-{stamp}.json")
        print(f"bundle saved: {bpath}")

    # ---------------- baseline catalog + gates
    proxy.request_activities()
    time.sleep(1.0)
    acts0, _ready = proxy.get_activities(force_refresh=False)
    acts0 = dict(acts0 or {})
    proxy._refresh_catalog("devices", timeout=15.0)
    time.sleep(0.6)
    devs_before = {int(d) for d in proxy.state.entities("device")}
    print(f"baseline: {len(devs_before)} devices, {len(acts0)} activities")
    check("GATE: ACT_A present", ACT_A in acts0, f"{(acts0.get(ACT_A) or {}).get('name')!r}")
    if ACT_A not in acts0:
        raise SystemExit("ACT_A missing; aborting")
    action_id = proxy._stable_hub_action_id()
    pre_untouched = proxy.backup_activity(UNTOUCHED) if UNTOUCHED in acts0 else None

    # ---------------- deploy a fresh sacrificial device
    print("create_wifi_device (6 short + 6 long, power 1/2, input [6])...")
    result = proxy.create_wifi_device(
        device_name=DEVICE_NAME,
        commands=build_command_defs(),
        request_port=LISTENER_PORT,
        brand_name=BRAND_NAME,
        power_on_command_id=POWER_ON_ID,
        power_off_command_id=POWER_OFF_ID,
        input_command_ids=INPUT_IDS,
    )
    check("GATE: create succeeded", bool(result) and result.get("status") == "success", f"{result}")
    if not result or result.get("status") != "success":
        raise SystemExit("create failed")
    dev = int(result["device_id"])
    print(f"bench device: 0x{dev:02X}")

    r = proxy.add_device_to_activity(ACT_A, dev)
    check("GATE: add_device_to_activity ACT_A", bool(r), f"{r}")
    if not r:
        raise SystemExit("activity add failed")

    proxy.get_commands_for_entity(dev, fetch_if_missing=True)
    deadline = time.time() + 10
    while time.time() < deadline and dev not in getattr(proxy, "_commands_complete", set()):
        time.sleep(0.3)

    r = proxy.command_to_favorite(ACT_A, dev, FAV_CMD, refresh_after_write=False)
    check(f"favorite add cmd {FAV_CMD}", bool(r), f"{r}")
    r = proxy.command_to_button(
        ACT_A, ButtonName.RED, dev, FAV_CMD,
        long_press_device_id=dev, long_press_command_id=BIND_LONG,
        refresh_after_write=False,
    )
    check(f"RED binding cmd {FAV_CMD} short + {BIND_LONG} long", bool(r), f"{r}")
    proxy.resync_remote(HUB_VERSION)

    ids0 = fresh_commands(proxy, dev)
    artifacts["deployed_command_ids"] = sorted(ids0)
    check("GATE: deployed command table 1..12 (6 short + 6 long)", ids0 == set(range(1, 13)), f"{sorted(ids0)}")
    sort0 = device_sort(proxy, dev)
    artifacts["sort_after_deploy"] = sort0
    act_pre = proxy.backup_activity(ACT_A)
    artifacts["act_after_deploy"] = act_pre

    def path_for(cid: int) -> str:
        return f"/launch/{action_id}/{dev}/{cid - 1}/short"

    # ================= D1: delete a plain short command (cmd 5)
    print(f"\n=== D1: delete plain cmd {DELETE_PLAIN} ===")
    d1 = delete_command(proxy, dev, DELETE_PLAIN)
    artifacts["D1"] = d1
    check(f"D1 GATE: cmd {DELETE_PLAIN} removed", d1["removed"], f"method={d1['method']} tried={d1['tried']}")
    check("D1: other commands intact", set(d1["after"]) == ids0 - {DELETE_PLAIN}, f"after={d1['after']}")
    sort1 = device_sort(proxy, dev)
    artifacts["sort_after_D1"] = sort1
    print(f"  key_sort after D1: {json.dumps(sort1.get('key_sort'))[:200] if sort1 else None}")

    # ================= D2: delete a referenced short command (cmd 3)
    print(f"\n=== D2: delete referenced cmd {DELETE_REF} (favorite + RED binding) ===")
    fav_before = [s for s in (act_pre.get("favorite_slots") or []) if int(s.get("device_id", 0)) == dev]
    bind_before = [b for b in (act_pre.get("button_bindings") or []) if int(b.get("device_id", 0)) == dev]
    d2 = delete_command(proxy, dev, DELETE_REF)
    artifacts["D2"] = d2
    check(f"D2 GATE: cmd {DELETE_REF} removed", d2["removed"], f"method={d2['method']} tried={d2['tried']}")
    act_post = proxy.backup_activity(ACT_A)
    artifacts["act_after_D2"] = act_post
    fav_after = [s for s in (act_post.get("favorite_slots") or []) if int(s.get("device_id", 0)) == dev]
    bind_after = [b for b in (act_post.get("button_bindings") or []) if int(b.get("device_id", 0)) == dev]
    dangling_fav = [s for s in fav_after if int(s.get("command_id", 0)) == DELETE_REF]
    dangling_bind = [b for b in bind_after if int(b.get("command_id", 0)) == DELETE_REF]
    artifacts["fav_before"], artifacts["fav_after"] = fav_before, fav_after
    artifacts["bind_before"], artifacts["bind_after"] = bind_before, bind_after
    print(f"  favorite for cmd {DELETE_REF}: before={len(fav_before)} after-dangling={len(dangling_fav)}")
    print(f"  RED binding for cmd {DELETE_REF}: before={len(bind_before)} after-dangling={len(dangling_bind)}")
    # record fate rather than asserting (this is discovery) — a gate only on hub coherence
    check("D2: activity re-read succeeded (hub coherent after ref delete)", isinstance(act_post, dict))

    # ================= D3: delete the long-press record (cmd 13)
    print(f"\n=== D3: delete long-press record cmd {DELETE_LONG} ===")
    d3 = delete_command(proxy, dev, DELETE_LONG)
    artifacts["D3"] = d3
    check(f"D3 GATE: long cmd {DELETE_LONG} removed", d3["removed"], f"method={d3['method']} tried={d3['tried']}")

    # ================= freed-id fire: deleted ids produce no callback
    print("\n=== freed-id fire ===")
    for cid in (DELETE_PLAIN, DELETE_REF):
        listener.clear()
        proxy.send_command(dev, cid)
        time.sleep(6.0)
        paths = [h["path"] for h in listener.snapshot()]
        artifacts[f"fire_deleted_{cid}"] = paths
        check(f"freed id {cid}: direct fire yields no callback", not paths, f"got={paths}")
    # a surviving command still fires (control)
    listener.clear()
    proxy.send_command(dev, 4)
    time.sleep(6.0)
    live = [h["path"] for h in listener.snapshot()]
    check("control: surviving cmd 4 still fires", live == [path_for(4)], f"got={live}")

    proxy.resync_remote(HUB_VERSION)
finally:
    # ---------------- cleanup: delete the bench device, verify baseline
    if dev is not None:
        print(f"\ncleanup: delete_device(0x{dev:02X})")
        try:
            # A delete issued right after the resync churn can no-op; re-send
            # each iteration (idempotent) and poll a fresh catalog up to 30s.
            devs_after = None
            deadline = time.time() + 30
            while time.time() < deadline:
                proxy.delete_device(dev)
                time.sleep(2.0)
                proxy._refresh_catalog("devices", timeout=15.0)
                time.sleep(0.4)
                devs_after = {int(d) for d in proxy.state.entities("device")}
                if dev not in devs_after:
                    break
            check("GATE: cleanup — device catalog back to baseline", devs_after == devs_before, f"before={sorted(devs_before)} after={sorted(devs_after or set())}")
            if UNTOUCHED is not None and pre_untouched is not None:
                post_untouched = proxy.backup_activity(UNTOUCHED)
                check(f"GATE: untouched activity 0x{UNTOUCHED:02X} byte-identical", canon(pre_untouched) == canon(post_untouched))
        except Exception as exc:  # noqa: BLE001
            check("cleanup delete_device", False, f"{exc}")
    listener.stop()
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    path = save_json(f"cmddel-c2-{TAG}", artifacts)
    print("artifacts saved:", path)
    proxy.stop()
    print("disconnected")

failed = [c for c in checks if not c[1]]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
if failed:
    sys.exit(1)
