"""Profile builders for ``wifi_mqtt`` (X2 virtual MQTT) Wifi Devices.

Plan: docs/internal/mqtt-transport-plan.md (§4 record/device profile,
§5 deploy reuse). A ``wifi_mqtt`` device carries plain family-0x0E
``hub_code_record`` rows whose two-byte bodies the hub ignores
(findings F1/F2): at press time the hub publishes its OWN device and
key ids to ``<MAC>/up``. That makes the whole deploy expressible as a
``device_backup``-shaped payload replayed through the generic restore
pipeline — the exact path validated live on an X2 (bench_90,
2026-08-10, docs/protocol/live-hub-testing.md "Measured: MQTT vs HTTP
callback latency").

The head profile below mirrors the captured vendor-app device
byte-for-byte where it matters (class/code/type bytes) and keeps the
same tail conventions the generic writer already handles.

This module is pure data shaping — no I/O, no proxy dependency — so it
is fully unit-testable and safe to import from both the deploy layer
and tests.
"""

from __future__ import annotations

from typing import Any, Iterable, Mapping

from .hub_versions import DEVICE_BACKUP_SCHEMA_VERSION
from .protocol_const import (
    DEVICE_CLASS_CODE_WIFI_MQTT,
    DEVICE_CLASS_WIFI_MQTT,
)

# §4 head profile, from the captured app-created device. ``code_type``
# tracks the class code; ``device_type`` 0x10 marks the wifi family.
WIFI_MQTT_DEVICE_TYPE = 0x10
WIFI_MQTT_ICON = 8
WIFI_MQTT_IDLE_BEHAVIOR = 4
WIFI_MQTT_INPUT_MODE = 2
WIFI_MQTT_POWER_MODE = 1

#: ``command_code`` bytes for a wifi_mqtt record (§4: six zero bytes).
WIFI_MQTT_COMMAND_CODE_HEX = "00 00 00 00 00 00"


def build_wifi_mqtt_command_row(
    command_id: int,
    name: str,
    *,
    device_id: int = 0,
) -> dict[str, Any]:
    """One backup-shaped command row for a ``wifi_mqtt`` device.

    ``data_hex`` is the natural ``(device_id, command_id)`` pair when the
    device id is known and ``00 <command_id>`` otherwise — matching what
    the vendor app writes so a hub read looks unsurprising. The hub
    ignores the bytes either way (F2); never build routing on them.
    """

    cid = int(command_id)
    return {
        "command_id": cid,
        "name": str(name),
        "restore_data": {
            "transport": "hub_code_record",
            "library_type": DEVICE_CLASS_CODE_WIFI_MQTT,
            "command_code": WIFI_MQTT_COMMAND_CODE_HEX,
            "data_hex": f"{int(device_id) & 0xFF:02x} {cid & 0xFF:02x}",
        },
    }


def build_wifi_mqtt_device_block(
    *,
    device_name: str,
    brand_name: str,
    source_device_id: int = 1,
    sort: int = 99,
) -> dict[str, Any]:
    """The §4 device head as a backup-shaped ``device`` block.

    ``source_device_id`` is only the backup-side placeholder id; the hub
    assigns the real id at create time and the restore pipeline maps it.
    """

    return {
        "device_id": int(source_device_id) & 0xFF,
        "name": str(device_name),
        "brand": str(brand_name),
        "device_class": DEVICE_CLASS_WIFI_MQTT,
        "device_class_code": DEVICE_CLASS_CODE_WIFI_MQTT,
        "icon": WIFI_MQTT_ICON,
        "sort": int(sort),
        "code_type": DEVICE_CLASS_CODE_WIFI_MQTT,
        "device_type": WIFI_MQTT_DEVICE_TYPE,
        "code_id_hex": " ".join(["00"] * 16),
        "hide": 0,
        "input_flag": 0,
        "channel": 0,
        "power_state": 0,
        "poll_time": 0,
        "input_mode": WIFI_MQTT_INPUT_MODE,
        "power_mode": WIFI_MQTT_POWER_MODE,
        "power_style": 0,
        "share_mode": 0,
        "idle_behavior": WIFI_MQTT_IDLE_BEHAVIOR,
        "tail_marker": 1,
    }


def build_wifi_mqtt_device_payload(
    *,
    device_name: str,
    brand_name: str,
    command_names: Mapping[int, str] | Iterable[str],
    source_device_id: int = 1,
    sort: int = 99,
) -> dict[str, Any]:
    """A full ``device_backup`` payload for a fresh ``wifi_mqtt`` deploy.

    ``command_names`` is either ``{command_id: name}`` (ids must be the
    1-based slot ids, long-press records at ``short + slot_count`` per
    the caller's layout) or a plain iterable of names auto-numbered from
    1. Records are written blind in one pass — F2 removes the
    learn-the-id-first ordering constraint the ``wifi_ip`` create flow
    has, so no patch-up step exists.

    Power and input configuration are deliberately NOT expressed here:
    the deploy layer applies them post-create through the same
    ``wifi_power_config`` / ``wifi_input_config`` step executors the
    in-place sync uses, keeping one code path for both first deploy and
    later edits.
    """

    if isinstance(command_names, Mapping):
        rows_source: list[tuple[int, str]] = [
            (int(cid), str(name)) for cid, name in sorted(command_names.items())
        ]
    else:
        rows_source = [(index, str(name)) for index, name in enumerate(command_names, start=1)]
    if not rows_source:
        raise ValueError("a wifi_mqtt deploy needs at least one command")

    return {
        "kind": "device_backup",
        "schema_version": DEVICE_BACKUP_SCHEMA_VERSION,
        "device": build_wifi_mqtt_device_block(
            device_name=device_name,
            brand_name=brand_name,
            source_device_id=source_device_id,
            sort=sort,
        ),
        "commands": [
            build_wifi_mqtt_command_row(cid, name, device_id=source_device_id)
            for cid, name in rows_source
        ],
        "button_bindings": [],
        "macros": [],
    }
