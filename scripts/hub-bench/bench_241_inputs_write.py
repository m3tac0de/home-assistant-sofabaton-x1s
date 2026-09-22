"""Inputs program: validate the live ``inputs_write`` sync step.

Runs against a *clone* of a sacrificial IR device (restore_device, the
edits, delete_device), so nothing permanent changes on the hub. The clone
is forced to "inputs not configured" (``input_mode`` 0, no inputs page),
the state in which the hub rejects every inputs request, which is what a
device looks like when the editor's "Set input" picks its first input.

  1. First input: an ``input_record`` entry appended the way the editor
     builds it; sync_device must run one ``inputs_write`` step, the head
     must read back with ``input_mode`` 1, and the hub's page must list the
     entry (isolated read and a full device capture).
  2. Append: a second entry; the page lists both in order, labels intact.
  3. Removal: an edit that drops the first entry is a logged no-op (other
     activities address inputs by position); the page still lists both.
  4. Cleanup: delete the clone and confirm it is gone.

Usage:
    python bench_241_inputs_write.py <ip> <X1|X1S|X2> <tag> <source_device_id>
"""

from __future__ import annotations

import copy
import sys
import time

from bench_common import connect, save_json, setup_logging

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SOURCE_DEV = int(sys.argv[4], 0)

COPY_NAME = "BenchInputs"

log_path = setup_logging(f"inputs-write-{TAG}")
print(f"logging to {log_path}")

checks: list[tuple[str, bool, str]] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    checks.append((label, bool(ok), detail))
    print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f": {detail}" if detail else ""))


def _bundle(proxy, device_id: int) -> dict:
    device = proxy.backup_device(device_id, include_blobs=False)
    return {"kind": "hub_bundle", "schema_version": 5,
            "hub": {"version": HUB_VERSION}, "devices": [device], "activities": []}


def _entry(command: dict, ordinal: int) -> dict:
    cid = int(command["command_id"])
    return {"command_id": cid, "fid": 0x4E20 + cid, "input_index": ordinal, "name": str(command.get("name") or f"Input {cid}")}


def _page(record) -> list[tuple[int, int, str]]:
    return [(int(e.get("command_id")), int(e.get("input_index")), str(e.get("name"))) for e in (record or {}).get("entries") or []]


def _with_entries(baseline: dict, entries: list[dict]) -> dict:
    edited = copy.deepcopy(baseline)
    record = dict(edited["devices"][0].get("input_record") or {})
    record["entries"] = entries
    edited["devices"][0]["input_record"] = record
    return edited


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION, "source_device": SOURCE_DEV}
clone_id: int | None = None
try:
    source = proxy.backup_device(SOURCE_DEV, include_blobs=True)
    if not isinstance(source, dict) or source.get("complete") is False:
        raise SystemExit(f"could not read source device 0x{SOURCE_DEV:02X}")
    commands = sorted((c for c in source.get("commands") or [] if c.get("command_id")), key=lambda c: int(c["command_id"]))
    if len(commands) < 2:
        raise SystemExit("the source device needs at least two commands")
    payload = copy.deepcopy(source)
    payload["device"]["name"] = COPY_NAME
    payload["device"]["input_mode"] = 0
    payload["device"]["inputs_configured"] = False
    payload["input_record"] = None
    payload["button_bindings"] = []          # an unbound device answers the buttons read with a bare 0x07
    payload["commands"] = commands[:3]       # a small clone restores in seconds
    payload["macros"] = []
    payload["key_sort"] = None
    print(f"cloning 0x{SOURCE_DEV:02X} ({len(commands)} commands) as {COPY_NAME!r}, inputs not configured")
    restore = proxy.restore_device(payload)
    artifacts["restore_result"] = restore
    if not restore or restore.get("status") != "success":
        raise SystemExit(f"clone restore failed: {restore}")
    clone_id = int(restore["device_id"])
    print(f"clone is device 0x{clone_id:02X}")
    time.sleep(1.0)

    baseline = _bundle(proxy, clone_id)
    head = baseline["devices"][0]["device"]
    check("clone starts unconfigured", int(head.get("input_mode") or 0) == 0 and not baseline["devices"][0].get("input_record"),
          f"input_mode={head.get('input_mode')} input_record={baseline['devices'][0].get('input_record')}")
    first, second = commands[0], commands[1]

    # ---- 1. the first input on a device that was never configured -------------------
    edited = _with_entries(baseline, [_entry(first, 1)])
    result = proxy.sync_device(baseline=baseline, edited=edited, device_id=clone_id)
    artifacts["first_result"] = result
    check("first input: sync_device success", result.get("status") == "success", f"{result.get('status')}/{result.get('failed_at', '')}")
    check("first input: one inputs_write step", result.get("counters", {}).get("inputs_write") == 1, f"{result.get('counters')}")
    time.sleep(0.8)
    isolated = proxy.fetch_device_input_record(clone_id)
    check("first input: the hub's page lists it (isolated read)", _page(isolated) == [(int(first["command_id"]), 1, str(first.get("name")))], f"{_page(isolated)}")
    captured = _bundle(proxy, clone_id)
    check("first input: a full capture reads the same page", _page(captured["devices"][0].get("input_record")) == _page(isolated),
          f"{_page(captured['devices'][0].get('input_record'))}")
    check("first input: the head reads back configured", int(captured["devices"][0]["device"].get("input_mode") or 0) == 1,
          f"input_mode={captured['devices'][0]['device'].get('input_mode')}")
    check("first input: name and commands untouched",
          captured["devices"][0]["device"].get("name") == COPY_NAME
          and [c.get("command_id") for c in captured["devices"][0].get("commands") or []] == [c.get("command_id") for c in baseline["devices"][0].get("commands") or []])
    artifacts["after_first"] = {"isolated": isolated, "input_mode": captured["devices"][0]["device"].get("input_mode")}

    # ---- 2. an append on the now configured device --------------------------------------
    baseline2 = captured
    edited2 = _with_entries(baseline2, [*(baseline2["devices"][0]["input_record"]["entries"]), _entry(second, 2)])
    result2 = proxy.sync_device(baseline=baseline2, edited=edited2, device_id=clone_id)
    artifacts["append_result"] = result2
    check("append: sync_device success", result2.get("status") == "success", f"{result2.get('status')}/{result2.get('failed_at', '')}")
    time.sleep(0.8)
    isolated2 = proxy.fetch_device_input_record(clone_id)
    want = [(int(first["command_id"]), 1, str(first.get("name"))), (int(second["command_id"]), 2, str(second.get("name")))]
    check("append: the page lists both, in order", _page(isolated2) == want, f"{_page(isolated2)}")
    artifacts["after_append"] = isolated2

    # ---- 3. a removal is left alone ---------------------------------------------------------
    baseline3 = _bundle(proxy, clone_id)
    edited3 = _with_entries(baseline3, [e for e in baseline3["devices"][0]["input_record"]["entries"] if int(e["command_id"]) != int(first["command_id"])])
    result3 = proxy.sync_device(baseline=baseline3, edited=edited3, device_id=clone_id)
    artifacts["removal_result"] = result3
    check("removal: sync_device success (logged no-op)", result3.get("status") == "success", f"{result3.get('status')}/{result3.get('failed_at', '')}")
    time.sleep(0.5)
    check("removal: the hub's page still lists both", _page(proxy.fetch_device_input_record(clone_id)) == want)
finally:
    if clone_id is not None:
        deleted = proxy.delete_device(clone_id)
        check("cleanup: clone deleted", bool(deleted and deleted.get("status") == "success"), str(deleted)[:120])
        time.sleep(0.8)
        proxy._refresh_catalog("devices", timeout=15.0)
        time.sleep(0.6)
        check("cleanup: clone gone from the catalog", clone_id not in {int(k) for k in proxy.state.entities("device")})
    artifacts["checks"] = [{"label": l, "ok": ok, "detail": d} for l, ok, d in checks]
    problems = [l for l, ok, _ in checks if not ok]
    artifacts["problems"] = problems
    save_json(f"inputs-write-{TAG}", artifacts)
    print(f"problems: {problems or 'none'}")
    proxy.stop()
