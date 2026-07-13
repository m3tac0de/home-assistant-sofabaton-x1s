"""Command-add program, chunk 3: decoded wifi-class add (cloned trailer).

The add dialog seeds a decoded wifi form from a template command fetched
off the same device — including the record's opaque trailer, which the
executor re-emits verbatim through encode_decoded_blob after a round-trip
self-check. This chunk drives that branch end-to-end on a *clone* of a
sacrificial wifi device:

  1. read a template command's decoded block (class/fields/trailer),
  2. sync a new-flagged row whose decoded block carries an edited field
     (wifi_roku: a different ECP path) and the template trailer,
  3. assert one command_add step, the stored record decodes back to the
     new field values with the template trailer byte-for-byte, existing
     commands untouched, library_type cloned, and the key-sort table
     lists the new id,
  4. delete the clone.

Usage:
    python bench_99_command_add_wifi.py <ip> <X1|X1S> <tag> <source_device_id> [new_path]
"""

from __future__ import annotations

import copy
import sys
import time

from bench_common import connect, save_json, setup_logging

from x1slib.blob_decoders import try_decode_blob

HOST = sys.argv[1]
HUB_VERSION = sys.argv[2]
TAG = sys.argv[3]
SOURCE_DEV = int(sys.argv[4], 0)
NEW_PATH = sys.argv[5] if len(sys.argv) > 5 else "keypress/Home"

COPY_NAME = "BenchWadd"

log_path = setup_logging(f"cmd-add-wifi-{TAG}")
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
            "data_hex": _norm(rd.get("data_hex")),
        }
    return out


def _structural_bundle(proxy, device_id: int) -> dict:
    device = proxy.backup_device(device_id, include_blobs=False)
    return {"kind": "hub_bundle", "schema_version": 5,
            "hub": {"version": HUB_VERSION}, "devices": [device], "activities": []}


def _hub_sort_pairs(proxy, device_id: int) -> list[tuple[int, int]]:
    row = proxy.fetch_device_key_sort(device_id, timeout=8.0) or {}
    msg_hex = str(row.get("msg_hex") or "").replace(" ", "")
    body = bytes.fromhex(msg_hex) if msg_hex else b""
    return [(body[i], body[i + 1]) for i in range(0, len(body) - 1, 2)]


proxy = connect(HOST, HUB_VERSION)
artifacts: dict = {"host": HOST, "hub_version": HUB_VERSION,
                   "source_device": SOURCE_DEV, "new_path": NEW_PATH}
clone_id: int | None = None
try:
    source = proxy.backup_device(SOURCE_DEV, include_blobs=True)
    if not isinstance(source, dict) or source.get("complete") is False:
        raise SystemExit(f"could not read source device 0x{SOURCE_DEV:02X}")
    device_class = str((source.get("device") or {}).get("device_class") or "").lower()
    print(f"source 0x{SOURCE_DEV:02X} class={device_class}")
    artifacts["device_class"] = device_class

    # Template: first command whose blob decodes for this class — exactly
    # what the add dialog fetches to seed the form and the trailer.
    template = None
    for row in source.get("commands") or []:
        rd = row.get("restore_data") or {}
        decoded = try_decode_blob(device_class, _norm(rd.get("data_hex"))) if rd.get("data_hex") else None
        if decoded:
            template = (int(row["command_id"]), decoded)
            break
    if template is None:
        raise SystemExit("no decodable template command on the source device")
    template_id, template_decoded = template
    trailer_hex = str(template_decoded.get("trailer_hex") or "")
    fields = dict(template_decoded.get("fields") or {})
    print(f"template cmd=0x{template_id:02X} fields={fields} trailer={trailer_hex!r}")
    artifacts["template"] = {"command_id": template_id, "decoded": template_decoded}

    # Edited field set: wifi_roku gets a fresh ECP path; other classes just
    # reuse the template fields verbatim (still exercises the encode path).
    new_fields = dict(fields)
    if device_class == "wifi_roku":
        new_fields["path"] = NEW_PATH

    # ---- clone -------------------------------------------------------------
    payload = copy.deepcopy(source)
    payload["device"]["name"] = COPY_NAME
    print(f"cloning as {COPY_NAME!r}…")
    restore = proxy.restore_device(payload)
    artifacts["restore_result"] = restore
    if not restore or restore.get("status") != "success":
        raise SystemExit(f"clone restore failed: {restore}")
    clone_id = int(restore["device_id"])
    print(f"clone is device 0x{clone_id:02X}")
    time.sleep(1.0)
    before = _full_commands(proxy, clone_id)

    # ---- decoded wifi add via sync_device -----------------------------------
    baseline = _structural_bundle(proxy, clone_id)
    used = {int(c["command_id"]) for c in baseline["devices"][0].get("commands") or []}
    add_id = next(i for i in range(1, 0x100) if i not in used)
    edited = copy.deepcopy(baseline)
    edited["devices"][0]["commands"] = list(edited["devices"][0]["commands"]) + [{
        "command_id": add_id,
        "name": "BENCHWADD",
        "restore_data": {
            "transport": "hub_code_record",
            "decoded": {"class": device_class, "trailer_hex": trailer_hex,
                        "fields": new_fields, "edited": True},
            "new": True,
        },
    }]
    result = proxy.sync_device(baseline=baseline, edited=edited, device_id=clone_id)
    artifacts["add_result"] = result
    time.sleep(0.8)

    after = _full_commands(proxy, clone_id)
    row = after.get(add_id) or {}
    check("wifi add: sync_device success", result.get("status") == "success",
          f"{result.get('status')}/{result.get('failed_at', '')}")
    check("wifi add: exactly one command_add step",
          result.get("counters", {}).get("command_add") == 1, f"{result.get('counters')}")
    check("wifi add: new command present with the right name",
          row.get("name") == "BENCHWADD", f"row={row}")
    readback = try_decode_blob(device_class, row.get("data_hex") or "") or {}
    check("wifi add: stored record decodes to the edited fields",
          dict(readback.get("fields") or {}) == new_fields,
          f"got={readback.get('fields')} want={new_fields}")
    check("wifi add: template trailer preserved byte-for-byte",
          str(readback.get("trailer_hex") or "") == trailer_hex,
          f"got={readback.get('trailer_hex')!r}")
    check("wifi add: library_type cloned from existing metadata",
          row.get("library_type") == before[template_id]["library_type"],
          f"got={row.get('library_type')} want={before[template_id]['library_type']}")
    check("wifi add: pre-existing commands untouched",
          all(after.get(c) == before[c] for c in before),
          f"ids before={sorted(before)} after={sorted(after)}")
    sort_pairs = _hub_sort_pairs(proxy, clone_id)
    check("wifi add: hub key-sort table lists the new command",
          any(cmd == add_id for cmd, _pos in sort_pairs), f"pairs={sort_pairs}")
    artifacts["after"] = after
    artifacts["readback"] = readback
finally:
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
    save_json(f"cmd-add-wifi-{TAG}", artifacts)
    proxy.stop()
    failed = [l for l, ok, _ in checks if not ok]
    print(f"disconnected — {len(checks) - len(failed)}/{len(checks)} checks OK"
          + (f"; FAILED: {failed}" if failed else ""))
