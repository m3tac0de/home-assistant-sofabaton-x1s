"""Command-payload program, chunk 1: validate in-place 0x0E overwrite.

Proves the write that live command-payload editing (Hub tab -> Devices ->
Edit -> Commands -> edit payload) folds into device Sync: re-issuing a
family-0x0E command record to an ALREADY-OCCUPIED (device_id, command_id)
overwrites the payload in place, on the exact production primitive the
live executor will call (``overwrite_command_payload``).

Asserts, on a sacrificial IR device:
  - idempotent overwrite (write the same bytes back) leaves the whole
    device byte-identical and does NOT create a new slot,
  - a content overwrite (write a DIFFERENT real IR blob into the slot)
    changes only that command's ``data_hex`` -- ``button_code``,
    ``library_type``, name, the command-id set, and every other command
    stay identical (so bindings/macros that reference the 48-bit code
    keep resolving),
and finally restores the original payload and re-verifies.

The "different real IR blob" is sourced from another command on the same
device (SRC_CMD arg, else auto-picked) so the write is always a valid IR
record -- never fabricated bytes.

Usage:
    python bench_93_command_payload_overwrite.py <ip> <X1|X1S> <tag> <device_id> [command_id] [src_command_id]
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
SRC_ID = int(sys.argv[6], 0) if len(sys.argv) > 6 else None

log_path = setup_logging(f"cmd-payload-{TAG}")
print(f"logging to {log_path}")


def _norm(hex_str) -> str:
    """Canonical spaced-lowercase hex for comparison."""
    if not hex_str:
        return ""
    return bytes.fromhex(str(hex_str).replace("0x", "").strip()).hex()


def snapshot(proxy) -> dict:
    """Full-backup device snapshot keyed by command_id -> restore fields."""
    backup = proxy.backup_device(DEV_ID, include_blobs=True)
    if not isinstance(backup, dict):
        raise SystemExit(f"device 0x{DEV_ID:02X} not present / not readable")
    out = {}
    for row in backup.get("commands") or []:
        cmd_id = int(row.get("command_id"))
        rd = row.get("restore_data") or {}
        out[cmd_id] = {
            "name": row.get("name"),
            "library_type": rd.get("library_type"),
            "button_code": rd.get("button_code"),
            "data_hex": _norm(rd.get("data_hex")),
            "has_restore": bool(rd),
        }
    return out


def _ir_commands(snap: dict) -> list[int]:
    return [c for c, v in snap.items() if v["has_restore"] and v["data_hex"]]


def _overwrite(proxy, cmd_id: int, src: dict, data_hex: str) -> bool:
    """Drive the production overwrite primitive, preserving code/type/name."""
    result = proxy.overwrite_command_payload(
        device_id=DEV_ID,
        command_id=cmd_id,
        command_name=str(src["name"] or ""),
        library_type=int(src["library_type"]),
        library_data=bytes.fromhex(data_hex),
        button_code=int(src["button_code"]),
    )
    return isinstance(result, dict) and result.get("status") == "success"


def _preserved(before: dict, after: dict, cmd_id: int) -> bool:
    """Everything except data_hex on the target must be identical, and every
    OTHER command must be byte-identical, and the id-set must be unchanged."""
    if set(before) != set(after):
        return False
    b, a = before[cmd_id], after[cmd_id]
    if (b["name"], b["library_type"], b["button_code"]) != (a["name"], a["library_type"], a["button_code"]):
        return False
    return all(before[c] == after[c] for c in before if c != cmd_id)


proxy = connect(HOST, HUB_VERSION)
artifacts = {"host": HOST, "hub_version": HUB_VERSION, "device_id": DEV_ID}
try:
    before = snapshot(proxy)
    ir_cmds = _ir_commands(before)
    print(f"device 0x{DEV_ID:02X} IR commands with payloads: {ir_cmds}")
    artifacts["ir_commands"] = ir_cmds
    if not ir_cmds:
        raise SystemExit("no IR command with a captured payload to overwrite")

    target = CMD_ID if CMD_ID is not None else ir_cmds[0]
    if target not in before or not before[target]["has_restore"]:
        raise SystemExit(f"command 0x{target:02X} has no captured payload")
    orig = before[target]
    orig_hex = orig["data_hex"]
    print(f"target cmd=0x{target:02X} name={orig['name']!r} "
          f"lib=0x{int(orig['library_type']):02X} code=0x{int(orig['button_code']):012X} "
          f"len={len(orig_hex)//2}B")
    artifacts["target"] = {**orig, "command_id": target}

    # ---- Test A: idempotent overwrite (write the same bytes back) ----------
    print("Test A: idempotent overwrite (same bytes)")
    a_ok = _overwrite(proxy, target, orig, orig_hex)
    time.sleep(0.6)
    after_a = snapshot(proxy)
    a_slot_ok = set(after_a) == set(before)
    a_identical = after_a.get(target) == orig
    a_others_ok = all(after_a.get(c) == before[c] for c in before if c != target)
    print(f"  {'OK  ' if a_ok else 'FAIL'} write accepted")
    print(f"  {'OK  ' if a_slot_ok else 'FAIL'} no new slot created")
    print(f"  {'OK  ' if a_identical else 'FAIL'} target byte-identical")
    print(f"  {'OK  ' if a_others_ok else 'FAIL'} other commands untouched")
    artifacts["test_a"] = {"write_ok": a_ok, "slot_ok": a_slot_ok,
                           "identical": a_identical, "others_ok": a_others_ok}

    # ---- Test B: content overwrite (write a DIFFERENT real IR blob) --------
    src_id = SRC_ID if SRC_ID is not None else next((c for c in ir_cmds if c != target), None)
    if src_id is None:
        print("Test B: SKIPPED (device has only one IR payload to source from)")
        artifacts["test_b"] = {"skipped": True}
    else:
        src_hex = before[src_id]["data_hex"]
        print(f"Test B: overwrite target with cmd=0x{src_id:02X} payload ({len(src_hex)//2}B)")
        b_ok = _overwrite(proxy, target, orig, src_hex)
        time.sleep(0.6)
        after_b = snapshot(proxy)
        b_changed = after_b.get(target, {}).get("data_hex") == src_hex
        b_preserved = _preserved(before, after_b, target)
        print(f"  {'OK  ' if b_ok else 'FAIL'} write accepted")
        print(f"  {'OK  ' if b_changed else 'FAIL'} target data_hex updated to source blob")
        print(f"  {'OK  ' if b_preserved else 'FAIL'} code/type/name + id-set + other cmds preserved")
        artifacts["test_b"] = {"write_ok": b_ok, "data_changed": b_changed,
                               "preserved": b_preserved, "src_command_id": src_id}

    # ---- Restore original payload ------------------------------------------
    print(f"restoring original payload on cmd=0x{target:02X}")
    _overwrite(proxy, target, orig, orig_hex)
    time.sleep(0.6)
    restored = snapshot(proxy)
    restored_ok = restored.get(target) == orig and set(restored) == set(before)
    print(f"{'OK  ' if restored_ok else 'FAIL'} original payload restored")
    artifacts["restored_ok"] = restored_ok
finally:
    save_json(f"cmd-payload-{TAG}", artifacts)
    proxy.stop()
    print("disconnected")
