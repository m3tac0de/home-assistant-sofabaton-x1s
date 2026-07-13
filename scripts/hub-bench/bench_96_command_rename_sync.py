"""Command-payload program, chunk 4: validate the command-rename Sync chain.

bench_95 proved the relabel *write* with bytes handed in; this drives the
production `_sync_step_command_rename` through `sync_device`, which must
fetch the command's current blob itself (`request_ir_command_dump` +
`split_play_blob_tail`), read button_code/library_type from metadata, and
rewrite the record with the new label.

Builds a blob-free structural baseline + an edited bundle with a changed
command name, runs `sync_device`, and asserts one `command_rename` step
lands: the hub re-exposes the new name, the payload / button_code /
library_type / id-set / other commands are intact. Restores the name.

Usage:
    python bench_96_command_rename_sync.py <ip> <X1|X1S> <tag> <device_id> [command_id]
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

log_path = setup_logging(f"cmd-rename-sync-{TAG}")
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
    device = proxy.backup_device(DEV_ID, include_blobs=False)
    return {"kind": "hub_bundle", "schema_version": 5,
            "hub": {"version": HUB_VERSION}, "devices": [device], "activities": []}


def _renamed(baseline: dict, command_id: int, new_name: str) -> dict:
    edited = copy.deepcopy(baseline)
    command = next(c for c in edited["devices"][0]["commands"] if int(c["command_id"]) == command_id)
    command["name"] = new_name
    return edited


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "hub_version": HUB_VERSION, "device_id": DEV_ID}
try:
    before = _full_commands(proxy)
    ir_cmds = [c for c, v in before.items() if v["data_hex"]]
    if not ir_cmds:
        raise SystemExit("no command with a captured payload")
    target = CMD_ID if CMD_ID is not None else ir_cmds[0]
    original_name = str(before[target]["name"])
    new_name = "Renamed Cmd" if original_name != "Renamed Cmd" else "Power"
    print(f"target cmd=0x{target:02X} name={original_name!r} -> {new_name!r} via sync_device")
    artifacts.update(target=target, original_name=original_name, new_name=new_name)

    baseline = _structural_bundle(proxy)
    edited = _renamed(baseline, target, new_name)
    result = proxy.sync_device(baseline=baseline, edited=edited, device_id=DEV_ID)
    time.sleep(0.6)
    after = _full_commands(proxy)
    tgt = after.get(target, {})
    sync_ok = result.get("status") == "success"
    one_step = result.get("counters", {}).get("command_rename") == 1
    renamed = tgt.get("name") == new_name
    payload_same = tgt.get("data_hex") == before[target]["data_hex"]
    others_same = (
        set(after) == set(before)
        and (tgt.get("library_type"), tgt.get("button_code"))
            == (before[target]["library_type"], before[target]["button_code"])
        and all(after[c] == before[c] for c in before if c != target)
    )
    print(f"  {'OK  ' if sync_ok else 'FAIL'} sync_device success ({result.get('status')}/{result.get('failed_at','')})")
    print(f"  {'OK  ' if one_step else 'FAIL'} exactly one command_rename step ({result.get('counters')})")
    print(f"  {'OK  ' if renamed else 'FAIL'} hub re-exposes the new name ({tgt.get('name')!r})")
    print(f"  {'OK  ' if payload_same else 'FAIL'} payload unchanged")
    print(f"  {'OK  ' if others_same else 'FAIL'} code/type/id-set/other cmds unchanged")
    artifacts["sync"] = {"result": result, "renamed": renamed, "payload_same": payload_same, "others_same": others_same}

    baseline2 = _structural_bundle(proxy)
    restore = _renamed(baseline2, target, original_name)
    proxy.sync_device(baseline=baseline2, edited=restore, device_id=DEV_ID)
    time.sleep(0.6)
    restored = _full_commands(proxy)
    restored_ok = restored.get(target) == before[target] and set(restored) == set(before)
    print(f"{'OK  ' if restored_ok else 'FAIL'} original name/payload restored")
    artifacts["restored_ok"] = restored_ok
finally:
    save_json(f"cmd-rename-sync-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
