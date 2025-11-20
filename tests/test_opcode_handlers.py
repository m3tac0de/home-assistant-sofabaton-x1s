"""Unit tests for opcode handlers."""

from __future__ import annotations

from pathlib import Path
import sys
import types

# Minimal stubs to import the integration without Home Assistant installed
if "homeassistant" not in sys.modules:
    ha = types.ModuleType("homeassistant")
    ha.config_entries = types.ModuleType("homeassistant.config_entries")
    ha.config_entries.ConfigEntry = object
    ha.core = types.ModuleType("homeassistant.core")
    ha.core.HomeAssistant = object
    ha.core.ServiceCall = object
    ha.helpers = types.ModuleType("homeassistant.helpers")
    ha.helpers.device_registry = types.ModuleType("homeassistant.helpers.device_registry")
    ha.helpers.entity_registry = types.ModuleType("homeassistant.helpers.entity_registry")
    ha.helpers.dispatcher = types.ModuleType("homeassistant.helpers.dispatcher")
    ha.helpers.dispatcher.async_dispatcher_send = lambda *args, **kwargs: None
    ha.helpers.dispatcher.async_dispatcher_connect = lambda *args, **kwargs: None
    ha.exceptions = types.ModuleType("homeassistant.exceptions")
    ha.exceptions.HomeAssistantError = Exception

    sys.modules["homeassistant"] = ha
    sys.modules["homeassistant.config_entries"] = ha.config_entries
    sys.modules["homeassistant.core"] = ha.core
    sys.modules["homeassistant.helpers"] = ha.helpers
    sys.modules["homeassistant.helpers.device_registry"] = ha.helpers.device_registry
    sys.modules["homeassistant.helpers.entity_registry"] = ha.helpers.entity_registry
    sys.modules["homeassistant.helpers.dispatcher"] = ha.helpers.dispatcher
    sys.modules["homeassistant.exceptions"] = ha.exceptions

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from custom_components.sofabaton_x1s.lib.frame_handlers import FrameContext
from custom_components.sofabaton_x1s.lib.opcode_handlers import (
    KeymapHandler,
    X1CatalogActivityHandler,
    X1CatalogDeviceHandler,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (
    ButtonName,
    OP_KEYMAP_TBL_D,
    OP_KEYMAP_TBL_E,
    OP_KEYMAP_TBL_F,
    OP_X1_ACTIVITY,
    OP_X1_DEVICE,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def _build_context(proxy: X1Proxy, raw_hex: str, opcode: int, name: str) -> FrameContext:
    raw = bytes.fromhex(raw_hex)
    payload = raw[4:-1]
    return FrameContext(
        proxy=proxy,
        opcode=opcode,
        direction="H→A",
        payload=payload,
        raw=raw,
        name=name,
    )


def _build_payload_context(proxy: X1Proxy, opcode: int, payload: bytes, name: str) -> FrameContext:
    raw = bytes([0xA5, 0x5A, (opcode >> 8) & 0xFF, opcode & 0xFF]) + payload + b"\x00"
    return FrameContext(
        proxy=proxy,
        opcode=opcode,
        direction="H→A",
        payload=payload,
        raw=raw,
        name=name,
    )


def test_keymap_table_d_includes_pause() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    frame = _build_context(
        proxy,
        "a5 5a 1e 3d 01 00 02 14 00 00 00 00 00 00 00 00 65 bc 02 00 00 00 00 00 a6 0e 00 00 00 00 00 00 00 00 48",
        OP_KEYMAP_TBL_D,
        "KEYMAP_TABLE_D",
    )

    handler.handle(frame)

    assert proxy.state.buttons.get(0x65) == {ButtonName.PAUSE}


def test_keymap_table_e_adds_volume_and_transport() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    frame = _build_context(
        proxy,
        "a5 5a bb 3d 01 00 01 01 00 01 0a 68 01 04 00 00 00 00 00 33 13 00 00 00 00 00 00 00 00 68 02 04 00 00 00 00 2e 77 14 00 00 00 00 00 00 00 00 68 03 04 00 00 00 00 00 6a 0f 00 00 00 00 00 00 00 00 68 04 04 00 00 00 00 ea 60 0e 00 00 00 00 00 00 00 00 68 b6 04 00 00 00 00 2e 77 14 00 00 00 00 00 00 00 00 68 b8 04 00 00 00 00 00 6a 0f 00 00 00 00 00 00 00 00 68 b9 04 00 00 00 00 00 33 13 00 00 00 00 00 00 00 00 68 bb 04 00 00 00 00 00 c9 12 00 00 00 00 00 00 00 00 68 bc 04 00 00 00 00 00 92 11 00 00 00 00 00 00 00 00 68 bd 04 00 00 00 00 00 ce 10 00 00 00 00 00 00 00 00 46",
        OP_KEYMAP_TBL_E,
        "KEYMAP_TABLE_E",
    )

    handler.handle(frame)

    assert proxy.state.buttons.get(0x68) == {
        ButtonName.VOL_UP,
        ButtonName.MUTE,
        ButtonName.VOL_DOWN,
        ButtonName.REW,
        ButtonName.PAUSE,
        ButtonName.FWD,
    }


def test_keymap_table_f_adds_color_buttons() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    frame = _build_context(
        proxy,
        "a5 5a 78 3d 01 00 02 3c 00 00 00 00 00 00 00 00 67 bc 01 00 00 00 00 00 a6 1f 00 00 00 00 00 00 00 00 67 bd 01 00 00 00 00 1b 46 31 00 00 00 00 00 00 00 00 67 be 01 00 00 00 00 00 e7 3b 00 00 00 00 00 00 00 00 67 bf 01 00 00 00 00 00 ec 32 00 00 00 00 00 00 00 00 67 c0 01 00 00 00 00 00 f6 3f 00 00 00 00 00 00 00 00 67 c1 01 00 00 00 00 00 f1 2e 00 00 00 00 00 00 00 00 c5",
        OP_KEYMAP_TBL_F,
        "KEYMAP_TABLE_F",
    )

    handler.handle(frame)

    assert proxy.state.buttons.get(0x67) == {
        ButtonName.PAUSE,
        ButtonName.FWD,
        ButtonName.RED,
        ButtonName.GREEN,
        ButtonName.YELLOW,
        ButtonName.BLUE,
    }


def test_x1_device_row_updates_state_and_burst() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = X1CatalogDeviceHandler()

    frame = _build_context(
        proxy,
        "a5 5a 7b 0b 09 00 01 09 00 01 00 01 0f 01 0a 10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 80 00 52 6f 6b 75 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 53 74 72 65 61 6d 69 6e 67 20 53 74 69 63 6b 20 34 4b 00 00 00 00 00 00 00 00 00 00 00 00 fc 55 c0 a8 01 80 fc 00 00 fc 01 01 02 00 fc 01 fc 01 00 00 00 00 00 00 00 00 00 00 00 00 e0 5c",
        OP_X1_DEVICE,
        "X1_DEVICE",
    )

    handler.handle(frame)

    assert proxy.state.devices[0x01] == {
        "brand": "Streaming Stick 4K",
        "name": "Roku",
    }
    assert proxy._burst.kind == "devices"


def test_x1_activity_row_updates_state_and_hint() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = X1CatalogActivityHandler()

    frame = _build_context(
        proxy,
        "a5 5a 7b 3b 01 00 01 0a 00 01 00 65 02 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 4a 65 6c 6c 79 66 69 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 00 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 3c 9c",
        OP_X1_ACTIVITY,
        "X1_ACTIVITY",
    )

    handler.handle(frame)

    assert proxy.state.activities[0x65] == {"name": "Jellyfin", "active": False}
    assert proxy.state.current_activity_hint is None
    assert proxy._burst.kind == "activities"
