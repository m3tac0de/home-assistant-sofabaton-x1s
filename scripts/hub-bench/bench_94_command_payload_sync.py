"""Command-payload program, chunk 2: validate the full device-Sync chain.

Where bench_93 exercises the write primitive, this drives the whole
production path the live editor uses: build a blob-free structural
baseline + an edited bundle carrying a payload `edited` marker, then call
``sync_device`` (build_device_sync_plan → stale pre-flight →
_sync_step_command_payload → overwrite_command_payload) exactly as the
Activities-tab host does.

Asserts, on a sacrificial IR device:
  - sync_device reports success and writes exactly one command_payload,
  - the target command's payload becomes the edited bytes while its
    button_code / library_type / name and every other command are intact,
  - a no-marker (fetched-but-unedited) bundle is a no-op plan,
and restores the original payload through the same path.

Usage:
    python bench_94_command_payload_sync.py <ip> <X1|X1S> <tag> <device_id> [command_id] [src_command_id]
"""

from __future__ import annotations

import copy
import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DEV_ID = int(sys.argv[4], 0)
CMD_ID = int(sys.argv[5], 0) if len(sys.argv) > 5 else None
SRC_ID = int(sys.argv[6], 0) if len(sys.argv) > 6 else None

log_path = setup_logging(f"cmd-payload-sync-{TAG}")
print(f"logging to {log_path}")


def _norm(hex_str) -> str:
    if not hex_str:
        return ""
    return bytes.fromhex(str(hex_str).replace("0x", "").strip()).hex()


def _full_commands(proxy) -> dict:
    backup = proxy.backup_device(DEV_ID, include_blobs=True)
    out = {}
    for row in (backup or {}).get("commands") or []:
        rd = row.get("restore_data") or {}
        out[int(row.get("command_id"))] = {
            "name": row.get("name"),
            "library_type": rd.get("library_type"),
            "button_code": rd.get("button_code"),
            "data_hex": _norm(rd.get("data_hex")),
        }
    return out


def _structural_bundle(proxy) -> dict:
    """A single-device blob-free hub_bundle, like the structural cache."""
    device = proxy.backup_device(DEV_ID, include_blobs=False)
    return {"kind": "hub_bundle", "schema_version": 5,
            "hub": {"version": HUB_VERSION}, "devices": [device], "activities": []}


def _edited_with_payload(baseline: dict, command_id: int, data_hex: str) -> dict:
    edited = copy.deepcopy(baseline)
    command = next(
        c for c in edited["devices"][0]["commands"] if int(c["command_id"]) == command_id
    )
    command["restore_data"] = {
        "transport": "hub_code_record", "data_hex": data_hex, "edited": True,
    }
    return edited


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "hub_version": HUB_VERSION, "device_id": DEV_ID}
try:
    before = _full_commands(proxy)
    ir_cmds = [c for c, v in before.items() if v["data_hex"]]
    print(f"device 0x{DEV_ID:02X} IR commands: {ir_cmds}")
    if not ir_cmds:
        raise SystemExit("no IR command with a captured payload")
    target = CMD_ID if CMD_ID is not None else ir_cmds[0]
    src = SRC_ID if SRC_ID is not None else next((c for c in ir_cmds if c != target), None)
    if src is None:
        raise SystemExit("need a second IR command to source a distinct payload")
    orig_hex = before[target]["data_hex"]
    src_hex = before[src]["data_hex"]
    print(f"target cmd=0x{target:02X}; overwrite with cmd=0x{src:02X} payload via sync_device")
    artifacts.update(target=target, src=src)

    # ---- no-op: fetched-but-unedited payload plans nothing ----------------
    baseline = _structural_bundle(proxy)
    noop = copy.deepcopy(baseline)
    noop_cmd = next(c for c in noop["devices"][0]["commands"] if int(c["command_id"]) == target)
    noop_cmd["restore_data"] = {"transport": "hub_code_record", "data_hex": orig_hex}  # no marker
    noop_result = proxy.sync_device(baseline=baseline, edited=noop, device_id=DEV_ID)
    noop_ok = noop_result.get("status") == "success" and noop_result.get("total_steps", 0) == 0
    print(f"  {'OK  ' if noop_ok else 'FAIL'} unedited fetched payload = empty plan ({noop_result.get('status')})")
    artifacts["noop"] = noop_result

    # ---- content overwrite through sync_device ----------------------------
    edited = _edited_with_payload(baseline, target, src_hex)
    result = proxy.sync_device(baseline=baseline, edited=edited, device_id=DEV_ID)
    time.sleep(0.6)
    after = _full_commands(proxy)
    sync_ok = result.get("status") == "success"
    one_step = result.get("counters", {}).get("command_payload") == 1
    changed = after.get(target, {}).get("data_hex") == src_hex
    preserved = (
        set(after) == set(before)
        and (after[target]["name"], after[target]["library_type"], after[target]["button_code"])
            == (before[target]["name"], before[target]["library_type"], before[target]["button_code"])
        and all(after[c] == before[c] for c in before if c != target)
    )
    print(f"  {'OK  ' if sync_ok else 'FAIL'} sync_device success ({result.get('status')}/{result.get('failed_at','')})")
    print(f"  {'OK  ' if one_step else 'FAIL'} exactly one command_payload step ({result.get('counters')})")
    print(f"  {'OK  ' if changed else 'FAIL'} target payload updated to source blob")
    print(f"  {'OK  ' if preserved else 'FAIL'} code/type/name + id-set + other cmds preserved")
    artifacts["sync"] = {"result": result, "changed": changed, "preserved": preserved}

    # ---- restore original payload through the same path -------------------
    baseline2 = _structural_bundle(proxy)
    restore = _edited_with_payload(baseline2, target, orig_hex)
    proxy.sync_device(baseline=baseline2, edited=restore, device_id=DEV_ID)
    time.sleep(0.6)
    restored = _full_commands(proxy)
    restored_ok = restored.get(target) == before[target] and set(restored) == set(before)
    print(f"{'OK  ' if restored_ok else 'FAIL'} original payload restored")
    artifacts["restored_ok"] = restored_ok
finally:
    save_json(f"cmd-payload-sync-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
