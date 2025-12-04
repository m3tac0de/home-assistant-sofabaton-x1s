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
    DeviceButtonPayloadHandler,
    KeymapHandler,
    X1CatalogActivityHandler,
    X1CatalogDeviceHandler,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (
    ButtonName,
    OP_DEVBTN_EXTRA,
    OP_KEYMAP_CONT,
    OP_KEYMAP_TBL_B,
    OP_KEYMAP_TBL_D,
    OP_KEYMAP_TBL_E,
    OP_KEYMAP_TBL_F,
    OP_KEYMAP_TBL_G,
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


def test_keymap_table_b_parses_buttons_response() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    frames = (
        (
            "a5 5a fa 3d 01 00 01 01 00 02 12 68 ae 07 00 00 00 00 00 2e 34 00 00 00 00 00 00 00 00 68 af 07"
            " 00 00 00 00 00 30 32 00 00 00 00 00 00 00 00 68 b1 07 00 00 00 00 00 31 33 00 00 00 00 00 00 00 00"
            " 68 b2 07 00 00 00 00 00 2f 31 00 00 00 00 00 00 00 00 68 b3 07 00 00 00 00 00 74 29 00 00 00 00 00 00"
            " 00 00 68 b5 07 00 00 00 00 00 2d 2f 00 00 00 00 00 00 00 00 68 b6 03 00 00 00 00 2e 77 79 00 00 00 00"
            " 00 00 00 00 68 b7 07 00 00 00 00 2e 78 2c 00 00 00 00 00 00 00 00 68 b8 03 00 00 00 00 00 6a 71 00 00"
            " 00 00 00 00 00 00 68 b9 03 00 00 00 00 00 33 78 00 00 00 00 00 00 00 00 68 ba 07 00 00 00 00 00 2c 2b"
            " 00 00 00 00 00 00 00 00 68 bb 07 00 00 00 00 00 8d 37 00 00 00 00 00 00 00 00 68 bc 07 00 00 00 00 27"
            " 78 35 00 00 00 00 00 00 00 00 68 bd 07 00 00 00 00 00 97 c4",
            OP_KEYMAP_TBL_B,
            "KEYMAP_TABLE_B",
        ),
        (
            "a5 5a 54 3d 01 00 02 2d 00 00 00 00 00 00 00 00 68 be 07 00 00 00 00 00 e7 36 00 00 00 00 00 00 00 00"
            " 68 bf 07 00 00 00 00 00 ec 2e 00 00 00 00 00 00 00 00 68 c0 07 00 00 00 00 00 f6 3a 00 00 00 00 00 00"
            " 00 00 68 c1 07 00 00 00 00 00 f1 2a 00 00 00 00 00 00 00 00 fc",
            OP_KEYMAP_CONT,
            "KEYMAP_CONT",
        ),
    )

    for raw_hex, opcode, name in frames:
        frame = _build_context(proxy, raw_hex, opcode, name)
        handler.handle(frame)

    assert proxy.state.buttons.get(0x68) == {
        ButtonName.UP,
        ButtonName.LEFT,
        ButtonName.RIGHT,
        ButtonName.DOWN,
        ButtonName.BACK,
        ButtonName.MENU,
        ButtonName.VOL_UP,
        ButtonName.CH_UP,
        ButtonName.MUTE,
        ButtonName.VOL_DOWN,
        ButtonName.CH_DOWN,
        ButtonName.REW,
        ButtonName.PAUSE,
        ButtonName.FWD,
        ButtonName.RED,
        ButtonName.GREEN,
        ButtonName.YELLOW,
        ButtonName.BLUE,
    }


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


def test_keymap_table_g_adds_volume_transport_and_red() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    frame = _build_context(
        proxy,
        "a5 5a cd 3d 01 00 01 01 00 01 0b 68 01 04 00 00 00 00 00 33 13 00 00 00 00 00 00 00 00 68 02 04 00 00 00 00 2e 77 14 00 00 00 00 00 00 00 00 68 03 04 00 00 00 00 00 6a 0f 00 00 00 00 00 00 00 00 68 04 04 00 00 00 00 ea 60 0e 00 00 00 00 00 00 00 00 68 b6 04 00 00 00 00 2e 77 14 04 00 00 00 00 2e 77 14 68 b8 04 00 00 00 00 00 6a 0f 04 00 00 00 00 ea 60 0e 68 b9 04 00 00 00 00 00 33 13 04 00 00 00 00 00 33 13 68 bb 04 00 00 00 00 00 c9 12 00 00 00 00 00 00 00 00 68 bc 04 00 00 00 00 00 92 11 00 00 00 00 00 00 00 00 68 bd 04 00 00 00 00 00 ce 10 00 00 00 00 00 00 00 00 68 be 04 00 00 00 00 ea 60 0e 00 00 00 00 00 00 00 00 4a",
        OP_KEYMAP_TBL_G,
        "KEYMAP_TABLE_G",
    )

    handler.handle(frame)

    assert proxy.state.buttons.get(0x68) == {
        ButtonName.VOL_UP,
        ButtonName.MUTE,
        ButtonName.VOL_DOWN,
        ButtonName.REW,
        ButtonName.PAUSE,
        ButtonName.FWD,
        ButtonName.RED,
    }


def test_devbtn_extra_contains_pause_and_red() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    frame = _build_context(
        proxy,
        "a5 5a 30 3d 01 00 02 14 00 00 00 00 00 00 00 00 65 bc 02 00 00 00 00 00 a6 0e 02 00 00 00 00 00 92 0f 65 be 02 00 00 00 00 00 00 20 00 00 00 00 00 00 00 00 42",
        OP_DEVBTN_EXTRA,
        "DEVBTN_EXTRA",
    )

    handler.handle(frame)

    assert proxy.state.buttons.get(0x65) == {ButtonName.PAUSE, ButtonName.RED}


def test_keymap_family_frame_without_known_buttons_starts_burst() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    act_id = 0x5A
    payload = b"\x01\x00\x01\x01\x00\x02\x10" + bytes([act_id]) + b"\x00" * 12
    frame = _build_payload_context(proxy, 0xAA3D, payload, "UNKNOWN_KEYMAP_FAMILY")

    handler.handle(frame)

    assert proxy._burst.kind == f"buttons:{act_id}"
    assert proxy.state.buttons.get(act_id) == set()


def test_keymap_handler_ignores_command_family_payloads() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    act_id = 0x44
    payload = b"\x01\x00\x01\x01\x00\x02\x10" + bytes([act_id, ButtonName.UP]) + b"\x00" * 10
    frame = _build_payload_context(proxy, 0xAA5D, payload, "UNKNOWN_COMMAND_FAMILY")

    handler.handle(frame)

    assert act_id not in proxy.state.buttons
    assert proxy._burst.kind is None


def test_unknown_5d_payload_starts_command_burst() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = DeviceButtonPayloadHandler()

    dev_id = 0xAA
    payload = b"\x01\x00\x01\x01\x00\x02\x05" + bytes([dev_id, 0x0D, 0x00, 0x00])
    frame = _build_payload_context(proxy, 0x995D, payload, "UNSEEN_DEVBTN_FAMILY")

    handler.handle(frame)

    assert proxy._burst.kind == f"commands:{dev_id}"


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


def test_x1_activity_active_flag_uses_correct_offset() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = X1CatalogActivityHandler()

    frame = _build_context(
        proxy,
        "a5 5a 7b 3b 01 00 01 0a 00 01 00 66 02 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 52 6f 6f 6d 20 43 6f 6e 74 72 6f 6c 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 00 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 3c 9c",
        OP_X1_ACTIVITY,
        "X1_ACTIVITY",
    )

    handler.handle(frame)

    assert proxy.state.activities[0x66] == {"name": "Room Control", "active": True}
    assert proxy.state.current_activity_hint == 0x66
