"""Command-payload program, chunk 3: does a label change stick?

The overwrite benches (93/94) always rewrote the command's ORIGINAL name,
proving the hub accepts a full 0x0E record rewrite and preserves the
label. This closes the last unknown behind live command *rename*: rewrite
the record with a CHANGED label and the SAME payload, then confirm the hub
re-exposes the new name while everything else (payload, button_code,
library_type, the command-id set, every other command) stays intact.

Renaming is reference-safe — bindings/macros key on the 48-bit button_code,
not the label — so only the display name should move.

Restores the original name at the end.

Usage:
    python bench_95_command_rename_probe.py <ip> <X1|X1S> <tag> <device_id> [command_id]
"""

from __future__ import annotations

import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
DEV_ID = int(sys.argv[4], 0)
CMD_ID = int(sys.argv[5], 0) if len(sys.argv) > 5 else None

log_path = setup_logging(f"cmd-rename-{TAG}")
print(f"logging to {log_path}")


def _norm(hex_str) -> str:
    if not hex_str:
        return ""
    return bytes.fromhex(str(hex_str).replace("0x", "").strip()).hex()


def snapshot(proxy) -> dict:
    backup = proxy.backup_device(DEV_ID, include_blobs=True)
    if not isinstance(backup, dict):
        raise SystemExit(f"device 0x{DEV_ID:02X} not readable")
    out = {}
    for row in backup.get("commands") or []:
        rd = row.get("restore_data") or {}
        out[int(row.get("command_id"))] = {
            "name": row.get("name"),
            "library_type": rd.get("library_type"),
            "button_code": rd.get("button_code"),
            "data_hex": _norm(rd.get("data_hex")),
        }
    return out


def _relabel(proxy, cmd_id: int, src: dict, new_name: str) -> bool:
    """Rewrite the record with a NEW name and the SAME payload/code/type."""
    result = proxy.overwrite_command_payload(
        device_id=DEV_ID,
        command_id=cmd_id,
        command_name=new_name,
        library_type=int(src["library_type"]),
        library_data=bytes.fromhex(src["data_hex"]),
        button_code=int(src["button_code"]),
    )
    return isinstance(result, dict) and result.get("status") == "success"


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "hub_version": HUB_VERSION, "device_id": DEV_ID}
try:
    before = snapshot(proxy)
    ir_cmds = [c for c, v in before.items() if v["data_hex"]]
    if not ir_cmds:
        raise SystemExit("no IR command with a captured payload")
    target = CMD_ID if CMD_ID is not None else ir_cmds[0]
    if target not in before:
        raise SystemExit(f"command 0x{target:02X} not present")
    orig = before[target]
    original_name = str(orig["name"])
    new_name = "Renamed Cmd" if original_name != "Renamed Cmd" else "Power"
    print(f"target cmd=0x{target:02X} name={original_name!r} -> {new_name!r} "
          f"(payload {len(orig['data_hex'])//2}B unchanged)")
    artifacts.update(target=target, original_name=original_name, new_name=new_name)

    ok = _relabel(proxy, target, orig, new_name)
    time.sleep(0.6)
    after = snapshot(proxy)
    tgt = after.get(target, {})
    renamed = tgt.get("name") == new_name
    payload_same = tgt.get("data_hex") == orig["data_hex"]
    meta_same = (tgt.get("library_type"), tgt.get("button_code")) == (orig["library_type"], orig["button_code"])
    others_same = set(after) == set(before) and all(after[c] == before[c] for c in before if c != target)

    print(f"  {'OK  ' if ok else 'FAIL'} relabel write accepted")
    print(f"  {'OK  ' if renamed else 'FAIL'} hub re-exposes the new name ({tgt.get('name')!r})")
    print(f"  {'OK  ' if payload_same else 'FAIL'} payload unchanged")
    print(f"  {'OK  ' if meta_same else 'FAIL'} button_code / library_type unchanged")
    print(f"  {'OK  ' if others_same else 'FAIL'} id-set + other commands unchanged")
    artifacts.update(relabel_ok=ok, renamed=renamed, payload_same=payload_same,
                     meta_same=meta_same, others_same=others_same, after_name=tgt.get("name"))

    print(f"restoring name -> {original_name!r}")
    _relabel(proxy, target, orig, original_name)
    time.sleep(0.6)
    restored = snapshot(proxy)
    restored_ok = restored.get(target) == orig and set(restored) == set(before)
    print(f"{'OK  ' if restored_ok else 'FAIL'} original name/payload restored")
    artifacts["restored_ok"] = restored_ok
finally:
    save_json(f"cmd-rename-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
