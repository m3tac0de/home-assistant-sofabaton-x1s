"""Synthetic ``device_backup`` payloads for creating an EMPTY device.

The Control Panel's Hub tab "Add device" button creates a device of a
chosen class with no commands; the user then fills it through the live
device editor. Every class is written through the generic
restore-device pipeline (family ``0x07`` create + update + terminal
remote sync), so this module only has to describe the per-class head
bytes as a backup-shaped ``device`` block.

The per-class values mirror what a device carries right after the
vendor app creates it (before any power / input configuration), cross-
checked against bench captures of app-created devices:

* ``code_type`` is the transport class byte (``DEVICE_CLASS_CODE_*``).
* ``device_type`` is ``2`` (the TV category) for IR and ``0x10`` for the
  whole wifi family; there is no category picker in the dialog.
* ``icon`` is ``1`` (the TV glyph) everywhere.
* ``input_mode`` is ``0`` ("needs configuration") for a TV-category IR
  device and ``2`` (source list) for the wifi classes.
* ``share_mode`` ``2`` marks a code-less IR device (no IR-database code
  id); wifi devices carry ``0``.
* ``power_style`` is ``1`` for IR, ``2`` for Roku, ``0`` otherwise.
* ``poll_time`` ``0`` writes the poll marker with value 0, as the app
  does at create.
* Roku / Hue / Sonos keep their head IP for the editor's Network
  section; ``channel`` follows the last IP octet once an IP is set.

Bluetooth is deliberately absent (parked: the class needs a per-brand
profile id in ``code_id`` that cannot be sourced from captures). RF has
no known class code.
"""

from __future__ import annotations

from typing import Any, Mapping

from .hub_versions import (
    DEVICE_BACKUP_SCHEMA_VERSION,
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
)
from .protocol_const import (
    DEVICE_CLASS_CODE_IR,
    DEVICE_CLASS_CODE_WIFI_HUE,
    DEVICE_CLASS_CODE_WIFI_IP,
    DEVICE_CLASS_CODE_WIFI_ROKU,
    DEVICE_CLASS_CODE_WIFI_SONOS,
    DEVICE_CLASS_IR,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_MQTT,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_SONOS,
    normalize_device_class,
)
from .wifi_mqtt_profile import build_wifi_mqtt_device_block

#: ``device_type`` byte written for IR devices (the TV category).
IR_DEVICE_TYPE_TV = 2
#: ``device_type`` byte the wifi family carries (class marker, not a category).
WIFI_DEVICE_TYPE = 0x10
#: The TV glyph, used for every created device.
DEFAULT_ICON = 1
#: Maximum name length accepted by the create dialog (X1 slot = 30 ASCII
#: bytes, X1S/X2 slot = 60 bytes UTF-16BE = 30 code units).
MAX_DEVICE_NAME_LEN = 30

#: Classes the "Add device" dialog offers per hub line, in display order.
SUPPORTED_CREATE_CLASSES_BY_HUB: dict[str, tuple[str, ...]] = {
    HUB_VERSION_X1: (
        DEVICE_CLASS_IR,
        DEVICE_CLASS_WIFI_ROKU,
        DEVICE_CLASS_WIFI_HUE,
        DEVICE_CLASS_WIFI_SONOS,
    ),
    HUB_VERSION_X1S: (
        DEVICE_CLASS_IR,
        DEVICE_CLASS_WIFI_ROKU,
        DEVICE_CLASS_WIFI_HUE,
        DEVICE_CLASS_WIFI_SONOS,
        DEVICE_CLASS_WIFI_IP,
    ),
    HUB_VERSION_X2: (
        DEVICE_CLASS_IR,
        DEVICE_CLASS_WIFI_ROKU,
        DEVICE_CLASS_WIFI_HUE,
        DEVICE_CLASS_WIFI_SONOS,
        DEVICE_CLASS_WIFI_IP,
        DEVICE_CLASS_WIFI_MQTT,
    ),
}

# Per-class head bytes that differ between classes. Everything not listed
# here is shared (see ``_common_head``).
_CLASS_HEAD: dict[str, dict[str, int]] = {
    DEVICE_CLASS_IR: {
        "device_class_code": DEVICE_CLASS_CODE_IR,
        "device_type": IR_DEVICE_TYPE_TV,
        "input_mode": 0,
        "power_style": 1,
        "share_mode": 2,
    },
    DEVICE_CLASS_WIFI_ROKU: {
        "device_class_code": DEVICE_CLASS_CODE_WIFI_ROKU,
        "device_type": WIFI_DEVICE_TYPE,
        "input_mode": 2,
        "power_style": 2,
        "share_mode": 0,
    },
    DEVICE_CLASS_WIFI_HUE: {
        "device_class_code": DEVICE_CLASS_CODE_WIFI_HUE,
        "device_type": WIFI_DEVICE_TYPE,
        "input_mode": 2,
        "power_style": 0,
        "share_mode": 0,
    },
    DEVICE_CLASS_WIFI_SONOS: {
        "device_class_code": DEVICE_CLASS_CODE_WIFI_SONOS,
        "device_type": WIFI_DEVICE_TYPE,
        "input_mode": 2,
        "power_style": 0,
        "share_mode": 0,
    },
    DEVICE_CLASS_WIFI_IP: {
        "device_class_code": DEVICE_CLASS_CODE_WIFI_IP,
        "device_type": WIFI_DEVICE_TYPE,
        "input_mode": 2,
        "power_style": 0,
        "share_mode": 0,
    },
}

_ZERO_CODE_ID_HEX = " ".join(["00"] * 16)


def supported_create_classes(hub_version: str | None) -> tuple[str, ...]:
    """Return the classes the dialog may create on ``hub_version``."""

    return SUPPORTED_CREATE_CLASSES_BY_HUB.get(str(hub_version or ""), ())


def _x2_extras(device_class: str) -> dict[str, int]:
    # X2 records carry the emitter-routing block (tail bytes 18..21). A
    # new IR device fires from the hub emitter (``c`` bit 0); the wifi
    # classes carry an all-zero block like the app writes for them.
    return {"a": 0, "b": 0, "c": 1 if device_class == DEVICE_CLASS_IR else 0}


def build_empty_device_block(
    name: str,
    device_class: str,
    *,
    hub_version: str,
) -> dict[str, Any]:
    """Return the backup-shaped ``device`` block for an empty device.

    Raises ``ValueError`` for an unknown class or one the hub line does
    not support.
    """

    normalized = normalize_device_class(device_class)
    if normalized is None or normalized not in supported_create_classes(hub_version):
        raise ValueError(
            f"device_class {device_class!r} cannot be created on a {hub_version} hub"
        )

    clean_name = str(name or "").strip()
    if not clean_name:
        raise ValueError("device name is required")

    if normalized == DEVICE_CLASS_WIFI_MQTT:
        block = build_wifi_mqtt_device_block(
            device_name=clean_name,
            brand_name="",
            source_device_id=0,
            sort=0,
        )
        block["icon"] = DEFAULT_ICON
    else:
        head = _CLASS_HEAD[normalized]
        block = {
            "device_id": 0,
            "name": clean_name,
            "brand": "",
            "device_class": normalized,
            "device_class_code": head["device_class_code"],
            "icon": DEFAULT_ICON,
            "sort": 0,
            "code_type": head["device_class_code"],
            "device_type": head["device_type"],
            "code_id_hex": _ZERO_CODE_ID_HEX,
            "hide": 0,
            "input_flag": 0,
            "channel": 0,
            "power_state": 0,
            "poll_time": 0,
            "input_mode": head["input_mode"],
            "power_mode": 0,
            "power_style": head["power_style"],
            "share_mode": head["share_mode"],
            "tail_marker": 1,
        }

    if hub_version == HUB_VERSION_X2:
        block["extras"] = _x2_extras(normalized)
    return block


def build_empty_device_payload(
    name: str,
    device_class: str,
    *,
    hub_version: str,
) -> dict[str, Any]:
    """A full ``device_backup`` payload with no commands / bindings / macros."""

    return {
        "kind": "device_backup",
        "schema_version": DEVICE_BACKUP_SCHEMA_VERSION,
        "device": build_empty_device_block(name, device_class, hub_version=hub_version),
        "commands": [],
        "button_bindings": [],
        "macros": [],
    }


def describe_create_classes(hub_version: str | None) -> list[Mapping[str, Any]]:
    """Frontend-friendly listing of the creatable classes for a hub."""

    return [
        {"device_class": cls, "device_class_code": _class_code(cls)}
        for cls in supported_create_classes(hub_version)
    ]


def _class_code(device_class: str) -> int:
    if device_class == DEVICE_CLASS_WIFI_MQTT:
        return int(build_wifi_mqtt_device_block(device_name="x", brand_name="")["code_type"])
    return _CLASS_HEAD[device_class]["device_class_code"]


__all__ = [
    "DEFAULT_ICON",
    "IR_DEVICE_TYPE_TV",
    "MAX_DEVICE_NAME_LEN",
    "SUPPORTED_CREATE_CLASSES_BY_HUB",
    "WIFI_DEVICE_TYPE",
    "build_empty_device_block",
    "build_empty_device_payload",
    "describe_create_classes",
    "supported_create_classes",
]
