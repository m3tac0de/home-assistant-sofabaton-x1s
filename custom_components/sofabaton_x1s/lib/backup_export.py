# backup_export.py — pure assembly of restore-oriented backup payloads.
#
# These functions turn already-fetched proxy state into the
# schema-versioned, restorable backup shapes that proxy_restore.py reads
# back. They are deliberately free of any fetch/orchestration logic (that
# lives in proxy_backup_export.BackupExportMixin) and of any Home
# Assistant dependency, so the same payloads can be produced in-tree and
# from the standalone library.
#
# The shapes here are the mirror image of the restore parsers; keep the
# two in lockstep and bump the matching *_SCHEMA_VERSION when either
# changes.
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Callable, Optional

from .blob_decoders import (
    format_decoded_for_display,
    is_decodable_class,
    try_decode_blob,
)
from .commands import split_play_blob_tail
from .devices import DeviceConfig
from .hub_versions import (
    ACTIVITY_BACKUP_SCHEMA_VERSION,
    DEVICE_BACKUP_SCHEMA_VERSION,
    HUB_BUNDLE_SCHEMA_VERSION,
)
from .protocol_const import (
    BUTTONNAME_BY_CODE,
    DEVICE_CLASS_BLUETOOTH,
    DEVICE_CLASS_IR,
    DEVICE_CLASS_RF_315,
    DEVICE_CLASS_RF_433,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_MQTT,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_SONOS,
    normalize_device_class,
)

_NETWORK_CALLBACK_CLASSES = {
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_MQTT,
    DEVICE_CLASS_WIFI_SONOS,
}

# Payload profiles distinguish what a bundle-shaped payload *carries*, not
# how complete the capture was. ``full_backup`` payloads include command
# payload bodies (IR blobs / raw command dumps) and are restorable;
# ``structural`` payloads deliberately omit them (labels, bindings, macros,
# inputs only) and must never be accepted by restore. Payloads with no
# ``payload_profile`` field predate the marker and are treated as
# ``full_backup`` for compatibility with existing backup files.
PAYLOAD_PROFILE_FULL = "full_backup"
PAYLOAD_PROFILE_STRUCTURAL = "structural"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def now_iso() -> str:
    """UTC ISO-8601 timestamp; the stamp format for ``fetched_at`` fields."""

    return _now_iso()


def is_network_callback_device_class(device_class: Any) -> bool:
    return normalize_device_class(device_class) in _NETWORK_CALLBACK_CLASSES


def uses_raw_command_dump(normalized_device_class: str | None) -> bool:
    """True when a device class round-trips via the raw 0x020C dump.

    BT, RF and the wifi network-callback variants share the family-0x0E
    command-record shape whose library_data is opaque to the IR-blob
    normalizer, so the raw dump is the only byte-faithful source.
    """

    return normalized_device_class in (
        DEVICE_CLASS_BLUETOOTH,
        DEVICE_CLASS_RF_315,
        DEVICE_CLASS_RF_433,
    ) or is_network_callback_device_class(normalized_device_class)


def build_device_block(
    device_id: int,
    device_meta: dict[str, Any],
    config: Optional[DeviceConfig],
    *,
    idle_behavior: Optional[int] = None,
) -> dict[str, Any]:
    """Build the ``device`` block of a backup payload.

    ``config`` is the device's parsed schema (from ``parse_device_record``
    on the cached raw record body). When ``None`` the block falls back to
    the minimal four-field shape.

    ``idle_behavior`` is the device's automatic-power / idle-behavior mode
    byte (the 0x0242 reply). It lives in a separate hub query rather than
    the device record, so it is threaded in explicitly. ``None`` (the value
    was not available) omits the field; restore then falls back to the
    legacy ``power_mode`` reading for older backups.
    """

    base: dict[str, Any] = {
        "device_id": device_id,
        "name": device_meta.get("name"),
        "brand": device_meta.get("brand"),
        "device_class": device_meta.get("device_class"),
        "device_class_code": device_meta.get("device_class_code"),
    }

    if idle_behavior is not None:
        base["idle_behavior"] = int(idle_behavior) & 0xFF

    if config is None:
        return base

    base.update(
        {
            "icon": config.icon,
            "sort": config.sort,
            "code_type": config.code_type,
            "device_type": config.device_type,
            "code_id_hex": config.code_id.hex(" "),
            "hide": config.hide,
            "input_flag": config.input_flag,
            "channel": config.channel,
            "power_state": config.power_state,
            "ip_address": config.ip_address,
            "poll_time": config.poll_time,
            "input_mode": config.input_mode,
            "inputs_configured": config.is_input_configured,
            "power_mode": config.power_mode,
            "power_style": config.power_style,
            "share_mode": config.share_mode,
            "tail_marker": config.tail_marker,
            "extras": (
                {"a": config.extra_a, "b": config.extra_b, "c": config.extra_c}
                if config.extras_present
                else None
            ),
        }
    )
    # Schema-decoded name/brand are authoritative when present.
    if config.name:
        base["name"] = config.name
    if config.brand:
        base["brand"] = config.brand
    return base


def build_hub_code_record_restore_data(
    command: dict[str, Any],
    *,
    device_class: str | None = None,
) -> dict[str, Any] | None:
    """Extract opaque command-record metadata from a raw 0x020C dump result.

    For the virtual-device classes that carry user-meaningful structure
    inside the blob, the result also gains a ``decoded`` block. That block
    is purely additive: the wire-faithful ``data_hex`` remains the only
    input the restore path reads.
    """

    pages = command.get("pages")
    if not isinstance(pages, list) or not pages:
        return None
    page_one = pages[0]
    if not isinstance(page_one, dict):
        return None

    payload_hex = str(page_one.get("payload_hex") or "").strip()
    if not payload_hex:
        return None
    try:
        payload = bytes.fromhex(payload_hex)
    except ValueError:
        return None
    if len(payload) < 15:
        return None

    data_hex = str(command.get("ir_blob_hex") or "").strip()
    if not data_hex:
        return None

    restore_data: dict[str, Any] = {
        "transport": "hub_code_record",
        "library_type": payload[8],
        "command_code": payload[9:15].hex(" "),
        "data_hex": data_hex,
    }

    if device_class and is_decodable_class(device_class):
        decoded_block = try_decode_blob(device_class, data_hex)
        if decoded_block is not None:
            restore_data["decoded"] = decoded_block

    return restore_data


def normalize_dump_to_blobs(
    dump_result: dict[str, Any] | None,
    *,
    resolve_device_class: Callable[[int], str | None],
    fallback_device_id: int,
) -> dict[str, Any] | None:
    """Turn a raw IR-dump result into ``play_ir_blob``-shaped command blobs.

    Mirrors the integration's ``async_fetch_blob`` normalization: splits
    the replay tail, runs the uniform decoder for classes that carry
    structure, and exposes ``command_blob`` (body hex) + ``decoded``.
    """

    if dump_result is None:
        return None

    commands_out: list[dict[str, Any]] = []
    for command in dump_result.get("commands", []):
        blob_hex = str(command.get("ir_blob_hex") or "").strip()
        blob_bytes = bytes.fromhex(blob_hex) if blob_hex else b""
        blob_body = b""
        replay_tail_checksum: int | None = None
        blob_kind = "raw"
        parsed_blob: str | None = None
        decoded_block: dict[str, Any] | None = None

        command_device_id = command.get("device_id")
        normalized_device_id = (
            int(command_device_id) if command_device_id is not None else fallback_device_id
        )
        cached_device_class = resolve_device_class(normalized_device_id)

        if blob_bytes:
            blob_body, replay_tail_checksum = split_play_blob_tail(blob_bytes)
            if blob_body and is_decodable_class(cached_device_class):
                candidate = try_decode_blob(cached_device_class, blob_body)
                if candidate is not None:
                    decoded_block = candidate
                    if candidate.get("class") == DEVICE_CLASS_IR:
                        blob_kind = "descriptive"
                    else:
                        blob_kind = "decoded"
                    parsed_blob = format_decoded_for_display(candidate)

        commands_out.append(
            {
                "command_label": command.get("label"),
                "device_id": normalized_device_id,
                "command_id": command.get("command_id"),
                "device_class": cached_device_class,
                "blob_kind": blob_kind,
                "command_blob": blob_body.hex(" ") if blob_body else None,
                "parsed_blob": parsed_blob,
                "decoded": decoded_block,
                "replay_tail_checksum": replay_tail_checksum,
                "command_checksum": replay_tail_checksum,
            }
        )

    return {
        "device_id": dump_result.get("device_id"),
        "requested_command_id": dump_result.get("requested_command_id"),
        "total_commands": dump_result.get("total_commands"),
        "received_command_count": dump_result.get("received_command_count"),
        "complete": dump_result.get("complete"),
        "commands": commands_out,
    }


def build_device_command_rows(
    *,
    label_map: dict[int, str],
    blob_by_command: dict[int, dict[str, Any]],
    normalized_device_class: str | None,
    command_metadata: dict[int, dict[str, int]],
    raw_dump_class: bool,
) -> list[dict[str, Any]]:
    """Build the ``commands`` rows for a device backup."""

    command_rows: list[dict[str, Any]] = []
    for command_id in sorted(set(label_map) | set(blob_by_command)):
        blob_command = blob_by_command.get(command_id, {})
        row: dict[str, Any] = {
            "command_id": command_id,
            "name": label_map.get(command_id)
            or blob_command.get("command_label")
            or blob_command.get("label"),
        }
        if normalized_device_class == DEVICE_CLASS_IR:
            blob_hex = blob_command.get("command_blob")
            if blob_hex:
                meta = command_metadata.get(command_id)
                meta_dict = meta if isinstance(meta, dict) else {}
                restore_data: dict[str, Any] = {
                    "transport": "hub_code_record",
                    "library_type": int(meta_dict.get("library_type", 0x0D)) & 0xFF,
                    "button_code": int(meta_dict.get("button_code", 0)) & 0xFFFFFFFFFFFF,
                    "data_hex": blob_hex,
                }
                decoded_block = try_decode_blob(DEVICE_CLASS_IR, blob_hex)
                if decoded_block is not None:
                    restore_data["decoded"] = decoded_block
                row["restore_data"] = restore_data
        elif raw_dump_class:
            restore_data = build_hub_code_record_restore_data(
                blob_command, device_class=normalized_device_class
            )
            if restore_data is not None:
                row["restore_data"] = restore_data
        # Classes producing neither shape are not restorable: the row
        # keeps only command_id + name as an editable label.
        command_rows.append(row)
    return command_rows


def build_device_button_rows(
    *,
    button_codes: list[int],
    button_details: dict[int, dict[str, Any]],
    label_map: dict[int, str],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for button_id in sorted(set(button_codes) | set(button_details)):
        details = button_details.get(button_id, {})
        command_id = int(details.get("command_id", 0)) & 0xFF
        rows.append(
            {
                "button_id": button_id & 0xFF,
                "button_name": BUTTONNAME_BY_CODE.get(button_id & 0xFF),
                "command_id": command_id,
                "command_name": label_map.get(command_id),
                "long_press_command_id": (
                    int(details["long_press_command_id"]) & 0xFF
                    if details.get("long_press_command_id") is not None
                    else None
                ),
            }
        )
    return rows


def build_device_macro_rows(macro_records: list[Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for record in macro_records:
        rows.append(
            {
                "button_id": record.key_id & 0xFF,
                "name": record.label,
                "steps": [
                    {
                        "command_id": entry.key_id & 0xFF,
                        "duration": entry.duration & 0xFF,
                        "delay": entry.delay & 0xFF,
                    }
                    for entry in record.key_sequence
                ],
            }
        )
    return rows


def build_activity_button_rows(
    *,
    button_codes: list[int],
    button_details: dict[int, dict[str, Any]],
) -> tuple[list[dict[str, Any]], set[int]]:
    """Return (rows, referenced_source_device_ids) for an activity keymap."""

    rows: list[dict[str, Any]] = []
    referenced: set[int] = set()
    for button_id in sorted(set(button_codes) | set(button_details)):
        details = button_details.get(button_id, {})
        target_device_id = int(details.get("device_id", 0)) & 0xFF
        command_id = int(details.get("command_id", 0)) & 0xFF
        if target_device_id == 0:
            # Slot exists but isn't bound to a target device; skip.
            continue
        referenced.add(target_device_id)
        rows.append(
            {
                "button_id": button_id & 0xFF,
                "button_name": BUTTONNAME_BY_CODE.get(button_id & 0xFF),
                "device_id": target_device_id,
                "command_id": command_id,
                "long_press_device_id": (
                    int(details["long_press_device_id"]) & 0xFF
                    if details.get("long_press_device_id") is not None
                    else None
                ),
                "long_press_command_id": (
                    int(details["long_press_command_id"]) & 0xFF
                    if details.get("long_press_command_id") is not None
                    else None
                ),
            }
        )
        if details.get("long_press_device_id") is not None:
            referenced.add(int(details["long_press_device_id"]) & 0xFF)
    return rows, referenced


def build_activity_macro_rows(
    macro_records: list[Any],
) -> tuple[list[dict[str, Any]], set[int]]:
    rows: list[dict[str, Any]] = []
    referenced: set[int] = set()
    for record in macro_records:
        step_entries: list[dict[str, Any]] = []
        for entry in record.key_sequence:
            step_device_id = entry.device_id & 0xFF
            step_command_id = entry.key_id & 0xFF
            is_delay_step = step_device_id == 0xFF or step_command_id == 0xFF
            if not is_delay_step and step_device_id != 0:
                referenced.add(step_device_id)
            step_entries.append(
                {
                    "device_id": step_device_id,
                    "command_id": step_command_id,
                    # The step's "fid" is the canonical 48-bit button_code;
                    # stored verbatim and translated on restore.
                    "button_code": int(entry.fid) & 0xFFFFFFFFFFFF,
                    "duration": entry.duration & 0xFF,
                    "delay": entry.delay & 0xFF,
                }
            )
        rows.append(
            {
                "button_id": record.key_id & 0xFF,
                "name": record.label,
                "steps": step_entries,
            }
        )
    return rows, referenced


def build_activity_favorite_rows(
    favorite_slots: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], set[int]]:
    rows: list[dict[str, Any]] = []
    referenced: set[int] = set()
    for slot in favorite_slots:
        if not isinstance(slot, dict):
            continue
        target_device_id = int(slot.get("device_id", 0)) & 0xFF
        if target_device_id != 0:
            referenced.add(target_device_id)
        rows.append(
            {
                "button_id": int(slot.get("button_id", 0)) & 0xFF,
                "device_id": target_device_id,
                "command_id": int(slot.get("command_id", 0)) & 0xFF,
            }
        )
    return rows, referenced


def assemble_device_backup(
    *,
    device_block: dict[str, Any],
    command_rows: list[dict[str, Any]],
    button_rows: list[dict[str, Any]],
    macro_rows: list[dict[str, Any]],
    key_sort_row: dict[str, Any] | None,
    input_record: dict[str, Any] | None,
    complete: bool,
    payload_profile: str = PAYLOAD_PROFILE_FULL,
    fetched_at: str | None = None,
) -> dict[str, Any]:
    payload = {
        "kind": "device_backup",
        "schema_version": DEVICE_BACKUP_SCHEMA_VERSION,
        "captured_at": _now_iso(),
        "complete": complete,
        "payload_profile": payload_profile,
        "device": device_block,
        "commands": command_rows,
        "key_sort": dict(key_sort_row) if isinstance(key_sort_row, dict) else None,
        "input_record": input_record,
        "button_bindings": button_rows,
        "macros": macro_rows,
    }
    if fetched_at:
        # When the payload is assembled from cached state, ``captured_at``
        # is assembly time; ``fetched_at`` is when the hub was last read.
        payload["fetched_at"] = fetched_at
    return payload


def assemble_activity_backup(
    *,
    activity_block: dict[str, Any],
    button_rows: list[dict[str, Any]],
    favorite_rows: list[dict[str, Any]],
    macro_rows: list[dict[str, Any]],
    referenced_source_device_ids: set[int],
    complete: bool,
    fetched_at: str | None = None,
) -> dict[str, Any]:
    payload = {
        "kind": "activity_backup",
        "schema_version": ACTIVITY_BACKUP_SCHEMA_VERSION,
        "captured_at": _now_iso(),
        "complete": complete,
        # Same "device" key as device_backup so the restore schema parser
        # is reused; entity_type marks it as an activity.
        "device": {**activity_block, "entity_type": "activity"},
        "button_bindings": button_rows,
        "favorite_slots": favorite_rows,
        "macros": macro_rows,
        "referenced_source_device_ids": sorted(referenced_source_device_ids),
    }
    if fetched_at:
        payload["fetched_at"] = fetched_at
    return payload


def assemble_hub_bundle(
    *,
    device_payloads: list[dict[str, Any]],
    activity_payloads: list[dict[str, Any]],
    hub_info: dict[str, Any],
    total_steps: int | None = None,
    payload_profile: str = PAYLOAD_PROFILE_FULL,
) -> dict[str, Any]:
    complete = all(bool(p.get("complete")) for p in device_payloads) and all(
        bool(p.get("complete")) for p in activity_payloads
    )
    bundle: dict[str, Any] = {
        "kind": "hub_bundle",
        "schema_version": HUB_BUNDLE_SCHEMA_VERSION,
        "captured_at": _now_iso(),
        "complete": complete,
        "payload_profile": payload_profile,
        "hub": dict(hub_info),
        "devices": device_payloads,
        "activities": activity_payloads,
    }
    if total_steps is not None:
        bundle["_progress_total_steps"] = total_steps
    return bundle
