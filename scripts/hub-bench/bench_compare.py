"""Shared round-trip comparison helpers for the backup/restore bench.

Comparison rule (docs/internal/backup-restore-bench-plan.md): re-read the
restored entity with ``backup_device(id, include_blobs=True)`` /
``backup_activity`` and compare against the source payload with ids
remapped and hub-owned bytes excluded. Command blobs must match
byte-for-byte for IR; other classes compare the ``restore_data`` records.

Hub-owned bytes excluded from equality (chunk-1 bootstrap notes):
- X1S power-ref-row duration (rewritten from device config) — reported
  as a note, not a problem, on X1S.
- capture metadata: ``captured_at`` / ``fetched_at`` / ``complete`` /
  ``payload_profile`` / ``key_sort`` ordering.
- ``restore_data.decoded`` (derived from data_hex, not wire data).
"""

from __future__ import annotations

from typing import Any

SYNTH_FID_BASE = 0x4E20


def _remap_cmd(cmd_map: dict[int, int], value: Any) -> Any:
    """Map a source command id through the restore's command_id_map."""
    if value in (None, 0):
        return value
    try:
        return cmd_map.get(int(value), f"UNMAPPED({value})")
    except (TypeError, ValueError):
        return value


def compare_device_backup(
    source: dict[str, Any],
    restored: dict[str, Any],
    *,
    command_id_map: dict[int, int],
    expected_name: str,
    hub_version: str,
) -> tuple[list[str], list[str]]:
    """Compare a source ``device_backup`` against the re-read of its
    restored copy. Returns ``(problems, notes)``."""

    problems: list[str] = []
    notes: list[str] = []

    # ---- payload-level flags
    if not restored.get("complete"):
        problems.append("restored re-read reports complete=False")

    # ---- device block (expected diffs: device_id, name, sort)
    src_block = source.get("device") or {}
    dst_block = restored.get("device") or {}
    if dst_block.get("name") != expected_name:
        problems.append(
            f"device name: expected {expected_name!r}, got {dst_block.get('name')!r}"
        )
    expected_diff = {"device_id", "name", "sort"}
    for key in sorted(set(src_block) | set(dst_block)):
        if key in expected_diff:
            continue
        if src_block.get(key) != dst_block.get(key):
            problems.append(
                f"device.{key}: source={src_block.get(key)!r} restored={dst_block.get(key)!r}"
            )

    # ---- commands (keyed by remapped command id; blobs byte-for-byte)
    src_cmds = {int(c["command_id"]): c for c in source.get("commands") or []}
    dst_cmds = {int(c["command_id"]): c for c in restored.get("commands") or []}
    for old_id, src_cmd in sorted(src_cmds.items()):
        new_id = command_id_map.get(old_id)
        if new_id is None:
            problems.append(f"command {old_id}: missing from command_id_map")
            continue
        dst_cmd = dst_cmds.get(new_id)
        if dst_cmd is None:
            problems.append(f"command {old_id}->{new_id}: not present on restored device")
            continue
        if src_cmd.get("name") != dst_cmd.get("name"):
            problems.append(
                f"command {old_id}->{new_id} name: "
                f"{src_cmd.get('name')!r} != {dst_cmd.get('name')!r}"
            )
        src_rd = dict(src_cmd.get("restore_data") or {})
        dst_rd = dict(dst_cmd.get("restore_data") or {})
        src_rd.pop("decoded", None)
        dst_rd.pop("decoded", None)
        # The persisted trailing checksum covers write-context bytes
        # (device id, burst size, ...) — it legitimately differs between
        # the app's original write and our replay. data_hex is the
        # stable body; the tail is hub/write-owned.
        src_rd.pop("persist_tail_hex", None)
        dst_rd.pop("persist_tail_hex", None)
        for key in sorted(set(src_rd) | set(dst_rd)):
            if src_rd.get(key) != dst_rd.get(key):
                problems.append(
                    f"command {old_id}->{new_id} restore_data.{key}: "
                    f"{src_rd.get(key)!r} != {dst_rd.get(key)!r}"
                )
    extra = set(dst_cmds) - {command_id_map.get(o) for o in src_cmds}
    if extra:
        problems.append(f"restored device has unexpected extra commands: {sorted(extra)}")

    # ---- button bindings (compare as remapped tuples)
    def _bind_key(row: dict[str, Any], remap: bool) -> tuple:
        cmd = row.get("command_id")
        lp = row.get("long_press_command_id")
        if remap:
            cmd = _remap_cmd(command_id_map, cmd)
            lp = _remap_cmd(command_id_map, lp)
        return (row.get("button_id"), cmd, lp, row.get("button_name"), row.get("command_name"))

    src_binds = sorted(_bind_key(r, True) for r in source.get("button_bindings") or [])
    dst_binds = sorted(_bind_key(r, False) for r in restored.get("button_bindings") or [])
    if src_binds != dst_binds:
        missing = [b for b in src_binds if b not in dst_binds]
        surplus = [b for b in dst_binds if b not in src_binds]
        problems.append(
            f"button bindings differ: missing={missing} surplus={surplus}"
        )

    # ---- macros / power sequences
    src_macros = {int(m["button_id"]): m for m in source.get("macros") or []}
    dst_macros = {int(m["button_id"]): m for m in restored.get("macros") or []}
    if sorted(src_macros) != sorted(dst_macros):
        problems.append(
            f"macro keys differ: source={sorted(src_macros)} restored={sorted(dst_macros)}"
        )
    for btn, src_m in sorted(src_macros.items()):
        dst_m = dst_macros.get(btn)
        if dst_m is None:
            continue
        if src_m.get("name") != dst_m.get("name"):
            problems.append(
                f"macro 0x{btn:02X} name: {src_m.get('name')!r} != {dst_m.get('name')!r}"
            )
        src_steps = src_m.get("steps") or []
        dst_steps = dst_m.get("steps") or []
        if len(src_steps) != len(dst_steps):
            problems.append(
                f"macro 0x{btn:02X}: {len(src_steps)} steps != {len(dst_steps)} restored"
            )
            continue
        for idx, (s, d) in enumerate(zip(src_steps, dst_steps)):
            want_cmd = _remap_cmd(command_id_map, s.get("command_id"))
            if want_cmd != d.get("command_id"):
                problems.append(
                    f"macro 0x{btn:02X} step {idx} command: "
                    f"{s.get('command_id')}->{want_cmd} != {d.get('command_id')}"
                )
            if s.get("delay") != d.get("delay"):
                problems.append(
                    f"macro 0x{btn:02X} step {idx} delay: {s.get('delay')} != {d.get('delay')}"
                )
            if s.get("duration") != d.get("duration"):
                msg = (
                    f"macro 0x{btn:02X} step {idx} duration: "
                    f"{s.get('duration')} != {d.get('duration')}"
                )
                if hub_version == "X1S":
                    notes.append(msg + " (hub-owned on X1S: rewritten from device config)")
                else:
                    problems.append(msg)

    # ---- input record
    src_inp = source.get("input_record")
    dst_inp = restored.get("input_record")
    if (src_inp is None) != (dst_inp is None):
        problems.append(
            f"input_record presence: source={src_inp is not None} restored={dst_inp is not None}"
        )
    elif isinstance(src_inp, dict) and isinstance(dst_inp, dict):
        for key in sorted(set(src_inp) | set(dst_inp)):
            if key in ("device_id", "entries"):
                continue
            if src_inp.get(key) != dst_inp.get(key):
                problems.append(
                    f"input_record.{key}: {src_inp.get(key)!r} != {dst_inp.get(key)!r}"
                )
        src_entries = src_inp.get("entries") or []
        dst_entries = dst_inp.get("entries") or []
        if len(src_entries) != len(dst_entries):
            problems.append(
                f"input_record entries: {len(src_entries)} != {len(dst_entries)}"
            )
        else:
            for idx, (s, d) in enumerate(zip(src_entries, dst_entries)):
                want_cmd = _remap_cmd(command_id_map, s.get("command_id"))
                want_fid = s.get("fid")
                try:
                    if int(s.get("fid")) == SYNTH_FID_BASE + int(s.get("command_id")):
                        want_fid = SYNTH_FID_BASE + int(want_cmd)
                except (TypeError, ValueError):
                    pass
                if want_cmd != d.get("command_id"):
                    problems.append(
                        f"input entry {idx} command: {want_cmd} != {d.get('command_id')}"
                    )
                if s.get("input_index") != d.get("input_index"):
                    problems.append(
                        f"input entry {idx} index: {s.get('input_index')} != {d.get('input_index')}"
                    )
                if want_fid != d.get("fid"):
                    notes.append(
                        f"input entry {idx} fid: expected {want_fid}, got {d.get('fid')}"
                    )
                if s.get("name") != d.get("name"):
                    problems.append(
                        f"input entry {idx} name: {s.get('name')!r} != {d.get('name')!r}"
                    )

    # ---- key sort (device-id byte excluded via msg_hex-only compare)
    src_ks = (source.get("key_sort") or {}).get("msg_hex", "")
    dst_ks = (restored.get("key_sort") or {}).get("msg_hex", "")
    if src_ks != dst_ks:
        problems.append(f"key_sort.msg_hex: {src_ks!r} != {dst_ks!r}")

    return problems, notes
