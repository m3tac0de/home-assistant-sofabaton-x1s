"""Command-add program, chunk 2: validate command_add through sync_device.

Runs against a *clone* of a sacrificial IR device (restore_device → adds →
delete_device) so nothing permanent changes on the hub:

  1. IR descriptor add — a new-flagged row whose restore_data carries a
     decoded ``ir`` block; the executor synthesizes the record via
     build_descriptive_ir_blob_body + persist_ir_blob. Asserts one
     ``command_add`` step, the new record's stored bytes equal the
     synthesized body, library_type 0x0D, a display-sort slot, and every
     pre-existing command byte-identical.
  2. Raw-hex add — a new-flagged row with only data_hex; the executor
     clones library_type from existing record metadata and persists via
     persist_command_record + explicit sort registration. Same asserts.
  3. Scope guard — an unflagged extra command row must fail the plan.
  4. Cleanup — delete the clone and confirm it is gone.

Usage:
    python bench_98_command_add_sync.py <ip> <X1|X1S> <tag> <source_device_id>
"""

from __future__ import annotations

import copy
import sys
import time

from bench_common import connect, save_json, setup_logging

from x1slib.blob_decoders import try_decode_blob
from x1slib.commands import build_descriptive_ir_blob_body

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SOURCE_DEV = int(sys.argv[4], 0)

COPY_NAME = "BenchAdd"
FALLBACK_DESCRIPTOR = "P:Sony12 R:40000 D:1 F:18 MUL:2"

log_path = setup_logging(f"cmd-add-sync-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))


def _norm(hex_str) -> str:
    if not hex_str:
        return ""
    return bytes.fromhex(str(hex_str).replace("0x", "").replace(" ", "").strip()).hex()


def _full_commands(proxy, device_id: int) -> dict:
    backup = proxy.backup_device(device_id, include_blobs=True)
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


def _structural_bundle(proxy, device_id: int) -> dict:
    device = proxy.backup_device(device_id, include_blobs=False)
    return {"kind": "hub_bundle", "schema_version": 5,
            "hub": {"version": HUB_VERSION}, "devices": [device], "activities": []}


def _next_free_id(bundle: dict) -> int:
    used = {int(c["command_id"]) for c in bundle["devices"][0].get("commands") or []}
    return next(i for i in range(1, 0x100) if i not in used)


def _hub_sort_pairs(proxy, device_id: int) -> list[tuple[int, int]]:
    """Read the device's family-0x61 key-sort blob straight from the hub.

    Returns the decoded ``(command_id, sort_position)`` pairs; empty when
    the hub reports no key-sort blob configured (STATUS_ACK 0x07 — the
    remote then browses commands in id order).
    """
    row = proxy.fetch_device_key_sort(device_id, timeout=8.0) or {}
    msg_hex = str(row.get("msg_hex") or "").replace(" ", "")
    body = bytes.fromhex(msg_hex) if msg_hex else b""
    return [(body[i], body[i + 1]) for i in range(0, len(body) - 1, 2)]


def _with_new_command(baseline: dict, command_id: int, name: str, restore_data: dict) -> dict:
    edited = copy.deepcopy(baseline)
    edited["devices"][0]["commands"] = list(edited["devices"][0].get("commands") or []) + [{
        "command_id": command_id,
        "name": name,
        "restore_data": {**restore_data, "new": True},
    }]
    return edited


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "source_device": SOURCE_DEV}
clone_id: int | None = None
try:
    # ---- clone the sacrificial source device ------------------------------
    source = proxy.backup_device(SOURCE_DEV, include_blobs=True)
    if not isinstance(source, dict) or source.get("complete") is False:
        raise SystemExit(f"could not read source device 0x{SOURCE_DEV:02X}")
    payload = copy.deepcopy(source)
    payload["device"]["name"] = COPY_NAME
    print(f"cloning 0x{SOURCE_DEV:02X} ({len(source.get('commands') or [])} commands) as {COPY_NAME!r}…")
    restore = proxy.restore_device(payload)
    artifacts["restore_result"] = restore
    if not restore or restore.get("status") != "success":
        raise SystemExit(f"clone restore failed: {restore}")
    clone_id = int(restore["device_id"])
    print(f"clone is device 0x{clone_id:02X}")
    time.sleep(1.0)

    before = _full_commands(proxy, clone_id)

    # Pick the descriptor: reuse a descriptive command from the clone when
    # one exists (bytes the hub demonstrably accepts), else the doc example.
    descriptor = FALLBACK_DESCRIPTOR
    for info in before.values():
        decoded = try_decode_blob("ir", info["data_hex"]) if info["data_hex"] else None
        if decoded and decoded.get("fields", {}).get("descriptor"):
            descriptor = str(decoded["fields"]["descriptor"])
            break
    artifacts["descriptor"] = descriptor
    print(f"IR descriptor for the add: {descriptor!r}")

    # ---- 1. IR descriptor add via sync_device -----------------------------
    baseline = _structural_bundle(proxy, clone_id)
    add1_id = _next_free_id(baseline)
    edited = _with_new_command(baseline, add1_id, "BENCHADD1", {
        "transport": "hub_code_record",
        "decoded": {"class": "ir", "trailer_hex": "",
                    "fields": {"descriptor": descriptor}, "edited": True},
    })
    result1 = proxy.sync_device(baseline=baseline, edited=edited, device_id=clone_id)
    artifacts["ir_add_result"] = result1
    time.sleep(0.8)
    after1 = _full_commands(proxy, clone_id)
    expected_body = build_descriptive_ir_blob_body(descriptor).hex()
    row1 = after1.get(add1_id) or {}
    check("ir add: sync_device success", result1.get("status") == "success",
          f"{result1.get('status')}/{result1.get('failed_at', '')}")
    check("ir add: exactly one command_add step",
          result1.get("counters", {}).get("command_add") == 1, f"{result1.get('counters')}")
    check("ir add: new command present with the right name",
          row1.get("name") == "BENCHADD1", f"row={row1}")
    check("ir add: stored bytes equal the synthesized body",
          row1.get("data_hex") == expected_body,
          f"got={row1.get('data_hex')} want={expected_body}")
    check("ir add: library_type is IR-DB 0x0D", row1.get("library_type") == 0x0D)
    check("ir add: pre-existing commands untouched",
          all(after1.get(c) == before[c] for c in before),
          f"ids before={sorted(before)} after={sorted(after1)}")
    sort1 = _hub_sort_pairs(proxy, clone_id)
    check("ir add: hub key-sort table lists the new command",
          any(cmd == add1_id for cmd, _pos in sort1),
          f"pairs={sort1}")

    # ---- 2. raw-hex add via sync_device ------------------------------------
    baseline2 = _structural_bundle(proxy, clone_id)
    add2_id = _next_free_id(baseline2)
    raw_src_id, raw_src = next((c, v) for c, v in sorted(before.items()) if v["data_hex"])
    edited2 = _with_new_command(baseline2, add2_id, "BENCHADD2", {
        "transport": "hub_code_record",
        "data_hex": raw_src["data_hex"],
    })
    result2 = proxy.sync_device(baseline=baseline2, edited=edited2, device_id=clone_id)
    artifacts["raw_add_result"] = result2
    time.sleep(0.8)
    after2 = _full_commands(proxy, clone_id)
    row2 = after2.get(add2_id) or {}
    check("raw add: sync_device success", result2.get("status") == "success",
          f"{result2.get('status')}/{result2.get('failed_at', '')}")
    check("raw add: exactly one command_add step",
          result2.get("counters", {}).get("command_add") == 1, f"{result2.get('counters')}")
    check("raw add: stored bytes equal the pasted hex",
          row2.get("data_hex") == raw_src["data_hex"],
          f"src=0x{raw_src_id:02X}")
    check("raw add: library_type cloned from existing metadata",
          row2.get("library_type") == raw_src["library_type"],
          f"got={row2.get('library_type')} want={raw_src['library_type']}")
    sort2 = _hub_sort_pairs(proxy, clone_id)
    check("raw add: hub key-sort table lists the new command",
          any(cmd == add2_id for cmd, _pos in sort2),
          f"pairs={sort2}")

    # ---- 3. scope guard: unflagged addition must fail the plan ------------
    baseline3 = _structural_bundle(proxy, clone_id)
    ghost = copy.deepcopy(baseline3)
    ghost["devices"][0]["commands"] = list(ghost["devices"][0]["commands"]) + [{
        "command_id": _next_free_id(baseline3), "name": "Ghost",
        "restore_data": {"transport": "hub_code_record", "data_hex": "0a", "edited": True},
    }]
    result3 = proxy.sync_device(baseline=baseline3, edited=ghost, device_id=clone_id)
    artifacts["guard_result"] = result3
    check("guard: unflagged addition fails at plan",
          result3.get("status") == "failed" and result3.get("failed_at") == "plan",
          f"{result3}")

    artifacts["after"] = _full_commands(proxy, clone_id)
finally:
    # ---- 4. cleanup: delete the clone --------------------------------------
    if clone_id is not None:
        print(f"deleting clone 0x{clone_id:02X}…")
        del_result = proxy.delete_device(clone_id)
        artifacts["delete_result"] = del_result
        check("cleanup: clone deleted",
              bool(del_result) and del_result.get("status") == "success", f"{del_result}")
        devs, _ = proxy.get_devices()
        check("cleanup: clone id gone from catalog", clone_id not in (devs or {}),
              f"devices={sorted((devs or {}).keys())}")
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    save_json(f"cmd-add-sync-{TAG}", artifacts)
    proxy.stop()
    failed = [l for l, ok, _ in checks if not ok]
    print(f"disconnected — {len(checks) - len(failed)}/{len(checks)} checks OK"
          + (f"; FAILED: {failed}" if failed else ""))
