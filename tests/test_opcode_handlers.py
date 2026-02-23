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
    CatalogActivityHandler,
    KeymapHandler,
    MacroHandler,
    X1CatalogActivityHandler,
    X1CatalogDeviceHandler,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (
    ButtonName,
    OP_KEYMAP_EXTRA,
    OP_KEYMAP_CONT,
    OP_KEYMAP_TBL_B,
    OP_KEYMAP_TBL_D,
    OP_KEYMAP_TBL_E,
    OP_KEYMAP_TBL_F,
    OP_KEYMAP_TBL_G,
    OP_CATALOG_ROW_ACTIVITY,
    OP_MACROS_A1,
    OP_MACROS_B1,
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


def _build_macro_raw(op_hi: int, frag_index: int, total_frags: int, act: int, payload: bytes) -> str:
    header = bytes(
        [0xA5, 0x5A, op_hi, 0x13, frag_index, 0x00, 0x01, total_frags, 0x00, 0x01, act]
    )
    raw = header + payload + b"\x00"
    return raw.hex(" ")


def _opcode_from_raw(raw_hex: str) -> int:
    raw = bytes.fromhex(raw_hex)
    return (raw[2] << 8) | raw[3]


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


def test_keymap_table_b_parses_x2_buttons_response() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    first_raw = (
        "a5 5a fa 3d 01 00 01 01 00 02 19 66 01 03 00 00 00 00 00 01 01 00 00 00 00"
        " 00 00 00 00 66 97 02 00 00 00 00 00 00 03 02 00 00 00 00 00 00 05 66 98 02"
        " 00 00 00 00 00 00 04 02 00 00 00 00 00 00 06 66 99 02 00 00 00 00 00 00 01"
        " 02 00 00 00 00 00 00 02 66 9c 05 00 00 00 00 00 92 0d 00 00 00 00 00 00 00"
        " 00 66 ae 05 00 00 00 00 01 13 12 00 00 00 00 00 00 00 00 66 af 05 00 00 00"
        " 00 03 28 10 00 00 00 00 00 00 00 00 66 b0 05 00 00 00 00 00 2a 1a 00 00 00"
        " 00 00 00 00 00 66 b1 05 00 00 00 00 03 29 11 00 00 00 00 00 00 00 00 66 b2"
        " 05 00 00 00 00 01 15 0f 00 00 00 00 00 00 00 00 66 b3 05 00 00 00 00 00 74"
        " 13 00 00 00 00 00 00 00 00 66 b4 05 00 00 00 00 00 88 17 00 00 00 00 00 00"
        " 00 00 66 b5 05 00 00 00 00 00 2d 18 00 00 00 00 00 00 00 00 66 b6 01 00 00"
        " 00 00 2e 77 99"
    )
    second_raw = (
        "a5 5a d2 3d 01 00 02 7a 00 00 00 00 00 00 00 00 66 b7 02 00 00 00 00 00 00"
        " 03 00 00 00 00 00 00 00 00 66 b8 01 00 00 00 00 00 6a 71 00 00 00 00 00 00"
        " 00 00 66 b9 01 00 00 00 00 00 33 79 00 00 00 00 00 00 00 00 66 ba 02 00 00"
        " 00 00 00 00 04 00 00 00 00 00 00 00 00 66 bb 05 00 00 00 00 01 d2 1d 00 00"
        " 00 00 00 00 00 00 66 bc 05 00 00 00 00 00 a6 1b 00 00 00 00 00 00 00 00 66"
        " bd 05 00 00 00 00 1b 46 15 00 00 00 00 00 00 00 00 66 be 05 00 00 00 00 00"
        " e7 1c 00 00 00 00 00 00 00 00 66 bf 05 00 00 00 00 00 ec 16 00 00 00 00 00"
        " 00 00 00 66 c0 05 00 00 00 00 00 f6 20 00 00 00 00 00 00 00 00 66 c1 05 00"
        " 00 00 00 00 f1 14 00 00 00 00 00 00 00 00 ff"
    )
    frames = (
        (first_raw, OP_KEYMAP_TBL_B, "KEYMAP_TABLE_B"),
        (second_raw, _opcode_from_raw(second_raw), "KEYMAP_TABLE_X2"),
    )

    for raw_hex, opcode, name in frames:
        frame = _build_context(proxy, raw_hex, opcode, name)
        handler.handle(frame)

    assert proxy.state.buttons.get(0x66) == {
        ButtonName.C,
        ButtonName.B,
        ButtonName.A,
        ButtonName.PLAY,
        ButtonName.UP,
        ButtonName.LEFT,
        ButtonName.OK,
        ButtonName.RIGHT,
        ButtonName.DOWN,
        ButtonName.BACK,
        ButtonName.HOME,
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


def test_req_buttons_parses_partial_final_record_example_one() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    first_raw = (
        "a5 5a fa 3d 01 00 01 01 00 02 0e 68 97 02 00 00 00 00 00 00 03 02 00 00 00 00"
        " 00 00 05 68 98 02 00 00 00 00 00 00 04 02 00 00 00 00 00 00 06 68 99 02 00"
        " 00 00 00 00 00 01 02 00 00 00 00 00 00 02 68 ae 04 00 00 00 00 01 13 11 00"
        " 00 00 00 00 00 00 00 68 af 04 00 00 00 00 03 28 0f 00 00 00 00 00 00 00 00"
        " 68 b0 04 00 00 00 00 00 2a 16 00 00 00 00 00 00 00 00 68 b1 04 00 00 00 00"
        " 03 29 10 00 00 00 00 00 00 00 00 68 b2 04 00 00 00 00 01 15 0e 00 00 00 00"
        " 00 00 00 00 68 b3 04 00 00 00 00 00 74 12 00 00 00 00 00 00 00 00 68 b4 04"
        " 00 00 00 00 07 c7 13 00 00 00 00 00 00 00 00 68 b5 04 00 00 00 00 00 2d 14"
        " 00 00 00 00 00 00 00 00 68 b6 01 00 00 00 00 2e 77 7a 00 00 00 00 00 00 00"
        " 00 68 b8 01 00 00 00 00 00 6a 71 00 00 00 00 00 00 00 00 68 b9 01 00 00 00"
        " 00 00 33 8c"
    )
    second_raw = "a5 5a 0c 3d 01 00 02 79 00 00 00 00 00 00 00 00 c4"
    frames = (
        (first_raw, OP_KEYMAP_TBL_B, "KEYMAP_TABLE_B"),
        (second_raw, _opcode_from_raw(second_raw), "KEYMAP_MARKER"),
    )

    for raw_hex, opcode, name in frames:
        frame = _build_context(proxy, raw_hex, opcode, name)
        handler.handle(frame)

    assert proxy.state.buttons.get(0x68) == {
        ButtonName.C,
        ButtonName.B,
        ButtonName.A,
        ButtonName.UP,
        ButtonName.LEFT,
        ButtonName.OK,
        ButtonName.RIGHT,
        ButtonName.DOWN,
        ButtonName.BACK,
        ButtonName.HOME,
        ButtonName.MENU,
        ButtonName.VOL_UP,
        ButtonName.MUTE,
        ButtonName.VOL_DOWN,
    }


def test_req_buttons_parses_partial_final_record_example_two() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    first_raw = (
        "a5 5a fa 3d 01 00 01 01 00 02 0e 67 97 02 00 00 00 00 00 00 03 02 00 00 00 00"
        " 00 00 05 67 98 02 00 00 00 00 00 00 04 02 00 00 00 00 00 00 06 67 99 02 00"
        " 00 00 00 00 00 01 02 00 00 00 00 00 00 02 67 ae 04 00 00 00 00 01 13 11 00"
        " 00 00 00 00 00 00 00 67 af 04 00 00 00 00 03 28 0f 00 00 00 00 00 00 00 00"
        " 67 b0 04 00 00 00 00 00 2a 16 00 00 00 00 00 00 00 00 67 b1 04 00 00 00 00"
        " 03 29 10 00 00 00 00 00 00 00 00 67 b2 04 00 00 00 00 01 15 0e 00 00 00 00"
        " 00 00 00 00 67 b3 04 00 00 00 00 00 74 12 00 00 00 00 00 00 00 00 67 b4 04"
        " 00 00 00 00 07 c7 13 00 00 00 00 00 00 00 00 67 b5 04 00 00 00 00 00 2d 14"
        " 00 00 00 00 00 00 00 00 67 b6 01 00 00 00 00 2e 77 7a 00 00 00 00 00 00 00"
        " 00 67 b8 01 00 00 00 00 00 6a 71 00 00 00 00 00 00 00 00 67 b9 01 00 00 00"
        " 00 00 33 7e"
    )
    second_raw = "a5 5a 0c 3d 01 00 02 79 00 00 00 00 00 00 00 00 c4"
    frames = (
        (first_raw, OP_KEYMAP_TBL_B, "KEYMAP_TABLE_B"),
        (second_raw, _opcode_from_raw(second_raw), "KEYMAP_MARKER"),
    )

    for raw_hex, opcode, name in frames:
        frame = _build_context(proxy, raw_hex, opcode, name)
        handler.handle(frame)

    assert proxy.state.buttons.get(0x67) == {
        ButtonName.C,
        ButtonName.B,
        ButtonName.A,
        ButtonName.UP,
        ButtonName.LEFT,
        ButtonName.OK,
        ButtonName.RIGHT,
        ButtonName.DOWN,
        ButtonName.BACK,
        ButtonName.HOME,
        ButtonName.MENU,
        ButtonName.VOL_UP,
        ButtonName.MUTE,
        ButtonName.VOL_DOWN,
    }


def test_keymap_handler_accepts_favorite_only_payload() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    favorite_records = bytes.fromhex(
        "66 01 03 00 00 00 00 00 38 03 00 00 00 00 00 00 00 00"
        " 66 02 03 00 00 00 00 00 4c 07 00 00 00 00 00 00 00 00"
    )
    payload = b"\x00" * 7 + favorite_records

    frame = _build_payload_context(proxy, OP_KEYMAP_TBL_B, payload, "KEYMAP_TABLE_B")

    handler.handle(frame)

    favorites = proxy.state.get_activity_favorite_slots(0x66)
    assert any(
        slot["button_id"] == 0x01
        and slot["device_id"] == 0x03
        and slot["command_id"] == 0x03
        for slot in favorites
    )
    assert any(
        slot["button_id"] == 0x02
        and slot["device_id"] == 0x03
        and slot["command_id"] == 0x07
        for slot in favorites
    )

    refs = proxy.state.get_activity_command_refs(0x66)
    assert (0x03, 0x03) in refs
    assert (0x03, 0x07) in refs
    assert 0x01 not in proxy.state.buttons.get(0x66, set())


def test_keymap_handler_parses_favorites_from_complete_response() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    frames = (
        (
            "a5 5a fa 3d 01 00 01 01 00 02 0f 66 01 03 00 00 00 00 00 38 03 00 00 00 00"
            " 00 00 00 00 66 02 03 00 00 00 00 00 4c 07 00 00 00 00 00 00 00 00 66 ae 01"
            " 00 00 00 00 00 2e 16 00 00 00 00 00 00 00 00 66 af 01 00 00 00 00 00 30 14"
            " 00 00 00 00 00 00 00 00 66 b0 01 00 00 00 00 01 88 17 00 00 00 00 00 00 00"
            " 00 66 b1 01 00 00 00 00 00 31 15 00 00 00 00 00 00 00 00 66 b2 01 00 00 00"
            " 00 00 2f 13 00 00 00 00 00 00 00 00 66 b3 01 00 00 00 00 00 74 0d 00 00 00"
            " 00 00 00 00 00 66 b4 01 00 00 00 00 07 c7 10 00 00 00 00 00 00 00 00 66 b5"
            " 01 00 00 00 00 00 2d 11 00 00 00 00 00 00 00 00 66 b6 03 00 00 00 00 2e 77"
            " 79 00 00 00 00 00 00 00 00 66 b7 01 00 00 00 00 2e 78 0f 00 00 00 00 00 00"
            " 00 00 66 b8 03 00 00 00 00 00 6a 71 00 00 00 00 00 00 00 00 66 b9 03 00 00"
            " 00 00 00 33 1f",
            OP_KEYMAP_TBL_B,
            "KEYMAP_TABLE_B",
        ),
        (
            "a5 5a 1e 3d 01 00 02 78 00 00 00 00 00 00 00 00 66 ba 01 00 00 00 00 00 2c"
            " 0e 00 00 00 00 00 00 00 00 30",
            OP_KEYMAP_CONT,
            "KEYMAP_CONT",
        ),
    )

    for raw_hex, opcode, name in frames:
        frame = _build_context(proxy, raw_hex, opcode, name)
        handler.handle(frame)

    favorites = proxy.state.get_activity_favorite_slots(0x66)
    assert any(
        slot["button_id"] == 0x01
        and slot["device_id"] == 0x03
        and slot["command_id"] == 0x03
        for slot in favorites
    )
    assert any(
        slot["button_id"] == 0x02
        and slot["device_id"] == 0x03
        and slot["command_id"] == 0x07
        for slot in favorites
    )


def test_keymap_handler_parses_additional_favorites_from_response() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = KeymapHandler()

    frames = (
        (
            "a5 5a fa 3d 01 00 01 01 00 02 0f 67 02 01 00 00 00 00 00 79 02 00 00 00 00"
            " 00 00 00 00 67 03 03 00 00 00 00 00 38 03 00 00 00 00 00 00 00 00 67 ae 01"
            " 00 00 00 00 00 2e 16 00 00 00 00 00 00 00 00 67 af 01 00 00 00 00 00 30 14"
            " 00 00 00 00 00 00 00 00 67 b0 01 00 00 00 00 01 88 17 00 00 00 00 00 00 00"
            " 00 67 b1 01 00 00 00 00 00 31 15 00 00 00 00 00 00 00 00 67 b2 01 00 00 00"
            " 00 00 2f 13 00 00 00 00 00 00 00 00 67 b3 01 00 00 00 00 00 74 0d 00 00 00"
            " 00 00 00 00 00 67 b4 01 00 00 00 00 07 c7 10 00 00 00 00 00 00 00 00 67 b5"
            " 01 00 00 00 00 00 2d 11 00 00 00 00 00 00 00 00 67 b6 03 00 00 00 00 2e 77"
            " 79 00 00 00 00 00 00 00 00 67 b7 01 00 00 00 00 2e 78 0f 00 00 00 00 00 00"
            " 00 00 67 b8 03 00 00 00 00 00 6a 71 00 00 00 00 00 00 00 00 67 b9 03 00 00"
            " 00 00 00 33 55",
            OP_KEYMAP_TBL_B,
            "KEYMAP_TABLE_B",
        ),
        (
            "a5 5a 1e 3d 01 00 02 78 00 00 00 00 00 00 00 00 67 ba 01 00 00 00 00 00 2c"
            " 0e 00 00 00 00 00 00 00 00 31",
            OP_KEYMAP_CONT,
            "KEYMAP_CONT",
        ),
    )

    for raw_hex, opcode, name in frames:
        frame = _build_context(proxy, raw_hex, opcode, name)
        handler.handle(frame)

    favorites = proxy.state.get_activity_favorite_slots(0x67)
    assert any(
        slot["button_id"] == 0x02
        and slot["device_id"] == 0x01
        and slot["command_id"] == 0x02
        for slot in favorites
    )
    assert any(
        slot["button_id"] == 0x03
        and slot["device_id"] == 0x03
        and slot["command_id"] == 0x03
        for slot in favorites
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
        OP_KEYMAP_EXTRA,
        "KEYMAP_EXTRA",
    )

    handler.handle(frame)

    assert proxy.state.buttons.get(0x65) == {ButtonName.PAUSE, ButtonName.RED}


def test_macro_handler_reassembles_and_records_macros() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = MacroHandler()

    act = 0x34
    record_one = bytes([0x01]) + "Power On".encode("utf-16le") + b"\x00\x00"
    record_two = bytes([0x02]) + "Watch TV".encode("utf-16le") + b"\x00\x00"
    combined = record_one + record_two

    payload_one = combined[: len(combined) // 2]
    payload_two = combined[len(combined) // 2 :]

    raw_one = _build_macro_raw((OP_MACROS_A1 >> 8) & 0xFF, 1, 2, act, payload_one)
    raw_two = _build_macro_raw((OP_MACROS_B1 >> 8) & 0xFF, 2, 2, act, payload_two)

    opcode_one = (OP_MACROS_A1 >> 8) << 8 | (OP_MACROS_A1 & 0xFF)
    opcode_two = (OP_MACROS_B1 >> 8) << 8 | (OP_MACROS_B1 & 0xFF)

    handler.handle(_build_context(proxy, raw_one, opcode_one, "MACROS_A1"))
    assert proxy.state.get_activity_macros(act) == []

    handler.handle(_build_context(proxy, raw_two, opcode_two, "MACROS_B1"))
    macros = proxy.state.get_activity_macros(act)

    assert any(entry["command_id"] == 0x01 and entry["label"] == "Power On" for entry in macros)
    assert any(entry["command_id"] == 0x02 and entry["label"] == "Watch TV" for entry in macros)


def test_macro_handler_parses_sample_activity_67() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = MacroHandler()

    fragments = [
        "a5 5a 64 13 01 00 01 03 00 01 67 01 03 03 01 00 00 00 00 17 18 00 00 00 ff ff ff ff ff 00 00 00 01 01 02 00 00 00 00 00 79 00 00 00 54 00 65 00 73 00 74 00 31 00 32 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 4d 15",
        "a5 5a 6e 13 02 00 01 03 00 01 67 04 03 03 01 00 00 00 00 00 00 01 ff 03 00 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff 01 01 02 00 00 00 00 00 c8 00 ff 00 74 00 65 00 73 00 74 00 32 00 33 00 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00",
        "a5 5a 5a 13 03 00 01 03 00 01 67 c7 02 01 c7 00 00 00 00 00 00 01 ff 03 c7 00 00 00 00 00 00 01 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 46 00 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fd",
    ]

    for raw_hex in fragments:
        handler.handle(_build_context(proxy, raw_hex, _opcode_from_raw(raw_hex), "MACROS_SAMPLE"))

    macros = proxy.state.get_activity_macros(0x67)
    assert {entry["command_id"] for entry in macros} == {0x01, 0x04}
    assert any(entry["command_id"] == 0x01 and entry["label"] == "Test123" for entry in macros)
    assert any(entry["command_id"] == 0x04 and entry["label"] == "test234" for entry in macros)


def test_macro_handler_parses_sample_activity_67_long_label() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = MacroHandler()

    fragments = [
        "a5 5a 64 13 01 00 01 05 00 01 67 01 03 03 01 00 00 00 00 17 18 00 00 00 ff ff ff ff ff 00 00 00 01 01 02 00 00 00 00 00 79 00 00 00 54 00 65 00 73 00 74 00 31 00 32 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 4d 17",
        "a5 5a 78 13 02 00 01 05 00 01 67 04 05 03 05 00 00 00 00 00 42 00 ff ff ff ff ff ff ff ff ff ff 01 01 09 00 00 00 00 04 31 00 ff ff ff ff ff ff ff ff ff ff 01 01 17 00 00 00 00 01 88 00 ff 00 74 00 65 00 73 00 74 00 32 00 33 00 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 de 51",
        "a5 5a 50 13 03 00 01 05 00 01 67 06 01 03 30 00 00 00 00 00 d3 00 ff 00 6d 00 61 00 63 00 72 00 6f 00 20 00 77 00 69 00 74 00 68 00 20 00 61 00 6e 00 20 00 61 00 63 00 74 00 75 00 61 00 6c 00 20 00 6c 00 6f 00 6e 00 67 00 20 00 6e 00 61 00 6d 00 65 77 5e",
        "a5 5a 6e 13 04 00 01 05 00 01 67 c6 04 01 c6 00 00 00 00 00 00 01 ff 03 c6 00 00 00 00 00 00 01 ff 01 c5 00 00 00 00 00 00 00 ff 03 c5 00 00 00 00 00 00 04 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 67 cc",
        "a5 5a 5a 13 05 00 01 05 00 01 67 c7 02 01 c7 00 00 00 00 00 00 01 ff 03 c7 00 00 00 00 00 00 01 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 46 00 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01",
    ]

    for raw_hex in fragments:
        handler.handle(_build_context(proxy, raw_hex, _opcode_from_raw(raw_hex), "MACROS_SAMPLE"))

    macros = proxy.state.get_activity_macros(0x67)
    assert {entry["command_id"] for entry in macros} == {0x01, 0x04, 0x06}
    assert any(entry["command_id"] == 0x01 and entry["label"] == "Test123" for entry in macros)
    assert any(entry["command_id"] == 0x04 and entry["label"] == "test234" for entry in macros)
    assert any(
        entry["command_id"] == 0x06 and entry["label"] == "macro with an actual long name"
        for entry in macros
    )


def test_macro_handler_parses_sample_activity_67_additional_long_label() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = MacroHandler()

    fragments = [
        "a5 5a 64 13 01 00 01 06 00 01 67 01 03 03 01 00 00 00 00 17 18 00 00 00 ff ff ff ff ff 00 00 00 01 01 02 00 00 00 00 00 79 00 00 00 54 00 65 00 73 00 74 00 31 00 32 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 4d 18",
        "a5 5a 78 13 02 00 01 06 00 01 67 04 05 03 05 00 00 00 00 00 42 00 ff ff ff ff ff ff ff ff ff ff 01 01 09 00 00 00 00 04 31 00 ff ff ff ff ff ff ff ff ff ff 01 01 17 00 00 00 00 01 88 00 ff 00 74 00 65 00 73 00 74 00 32 00 33 00 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 de 52",
        "a5 5a 50 13 03 00 01 06 00 01 67 06 01 03 30 00 00 00 00 00 d3 00 ff 00 6d 00 61 00 63 00 72 00 6f 00 20 00 77 00 69 00 74 00 68 00 20 00 61 00 6e 00 20 00 61 00 63 00 74 00 75 00 61 00 6c 00 20 00 6c 00 6f 00 6e 00 67 00 20 00 6e 00 61 00 6d 00 65 77 5f",
        "a5 5a b4 13 04 00 01 06 00 01 67 07 0b 01 01 00 00 00 00 00 39 00 ff ff ff ff ff ff ff ff ff ff 01 01 03 00 00 00 00 01 4b 00 ff ff ff ff ff ff ff ff ff ff 01 01 06 00 00 00 00 00 92 00 ff ff ff ff ff ff ff ff ff ff 01 01 17 00 00 00 00 01 88 00 ff ff ff ff ff ff ff ff ff ff 01 01 18 00 00 00 00 00 33 00 ff ff ff ff ff ff ff ff ff ff 01 01 18 00 00 00 00 00 33 00 ff 00 61 00 6e 00 6f 00 74 00 68 00 65 00 72 00 20 00 6c 00 6f 00 6e 00 67 00 20 00 6e 00 61 00 6d 00 65 00 20 00 6e 00 6f 00 77 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 99 09",
        "a5 5a 6e 13 05 00 01 06 00 01 67 c6 04 01 c6 00 00 00 00 00 00 01 ff 03 c6 00 00 00 00 00 00 01 ff 01 c5 00 00 00 00 00 00 00 ff 03 c5 00 00 00 00 00 00 04 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 67 ce",
        "a5 5a 5a 13 06 00 01 06 00 01 67 c7 02 01 c7 00 00 00 00 00 00 01 ff 03 c7 00 00 00 00 00 00 01 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 46 00 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03",
    ]

    for raw_hex in fragments:
        handler.handle(_build_context(proxy, raw_hex, _opcode_from_raw(raw_hex), "MACROS_SAMPLE"))

    macros = proxy.state.get_activity_macros(0x67)
    assert {entry["command_id"] for entry in macros} == {0x01, 0x04, 0x06, 0x07}
    assert any(entry["command_id"] == 0x01 and entry["label"] == "Test123" for entry in macros)
    assert any(entry["command_id"] == 0x04 and entry["label"] == "test234" for entry in macros)
    assert any(
        entry["command_id"] == 0x06 and entry["label"] == "macro with an actual long name"
        for entry in macros
    )
    assert any(
        entry["command_id"] == 0x07 and entry["label"] == "another long name now" for entry in macros
    )


def test_macro_handler_parses_sample_activity_69() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = MacroHandler()

    fragments = [
        "a5 5a 64 13 01 00 01 05 00 01 69 03 03 05 07 00 00 00 00 00 56 00 ff ff ff ff ff ff ff ff ff ff 01 01 09 00 00 00 00 04 31 00 ff 00 68 00 6f 00 69 00 31 00 32 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 db 35",
        "a5 5a 64 13 02 00 01 05 00 01 69 04 03 05 36 00 00 00 00 3e bb 00 ff ff ff ff ff ff ff ff ff ff 01 05 41 00 00 00 00 ae 91 00 ff 00 68 00 65 00 79 00 31 00 32 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 f9 73",
        "a5 5a 64 13 03 00 01 05 00 01 69 05 03 01 06 00 00 00 00 00 92 00 ff ff ff ff ff ff ff ff ff ff 01 01 04 00 00 00 00 00 d3 00 ff 00 62 00 6c 00 61 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 04 8b",
        "a5 5a 82 13 04 00 01 05 00 01 69 c6 06 01 c6 00 00 00 00 00 00 01 ff 03 c6 00 00 00 00 00 00 01 ff 05 c6 00 00 00 00 00 00 00 ff 01 c5 00 00 00 00 00 00 00 ff 03 c5 00 00 00 00 00 00 0a ff 05 c5 00 00 00 00 00 00 00 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 69 b5 05 39",
        "a5 5a 64 13 05 00 01 05 00 01 69 c7 03 01 c7 00 00 00 00 00 00 01 ff 03 c7 00 00 00 00 00 00 01 ff 05 c7 00 00 00 00 00 00 00 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 46 00 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 d9",
    ]

    for raw_hex in fragments:
        handler.handle(_build_context(proxy, raw_hex, _opcode_from_raw(raw_hex), "MACROS_SAMPLE"))

    macros = proxy.state.get_activity_macros(0x69)
    assert {entry["command_id"] for entry in macros} == {0x03, 0x04, 0x05}
    assert any(entry["command_id"] == 0x03 and entry["label"] == "hoi123" for entry in macros)
    assert any(entry["command_id"] == 0x04 and entry["label"] == "hey123" for entry in macros)
    assert any(entry["command_id"] == 0x05 and entry["label"] == "bla" for entry in macros)


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

    assert proxy.state.activities[0x65] == {"name": "Jellyfin", "active": False, "needs_confirm": False}
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

    assert proxy.state.activities[0x66] == {"name": "Room Control", "active": True, "needs_confirm": False}
    assert proxy.state.current_activity_hint == 0x66


def test_x1_activity_row_sets_needs_confirm_flag() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = X1CatalogActivityHandler()

    frame = _build_context(
        proxy,
        "a5 5a 7b 3b 02 00 01 02 00 01 00 66 01 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 68 65 79 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 00 fc 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 9a 6c",
        OP_X1_ACTIVITY,
        "X1_ACTIVITY",
    )

    handler.handle(frame)

    assert proxy.state.activities[0x66] == {"name": "heyo", "active": False, "needs_confirm": True}




def test_catalog_activity_handler_sets_needs_confirm_from_tail_marker() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = CatalogActivityHandler()

    payload = bytearray(214)
    payload[0] = 1
    payload[6:8] = (0x0065).to_bytes(2, "big")
    payload[32] = 0x01
    payload[33] = 0x00
    payload[170:174] = bytes([0xFC, 0x01, 0xFC, 0x01])

    frame = _build_payload_context(proxy, OP_CATALOG_ROW_ACTIVITY, bytes(payload), "CATALOG_ROW_ACTIVITY")
    handler.handle(frame)

    assert proxy.state.activities[0x65]["needs_confirm"] is True
    assert len(proxy._activity_row_payloads[0x65]) == 214


def test_catalog_activity_handler_clears_needs_confirm_when_tail_marker_unset() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = CatalogActivityHandler()

    payload = bytearray(214)
    payload[0] = 2
    payload[6:8] = (0x0066).to_bytes(2, "big")
    payload[170:174] = bytes([0xFC, 0x00, 0xFC, 0x00])

    frame = _build_payload_context(proxy, OP_CATALOG_ROW_ACTIVITY, bytes(payload), "CATALOG_ROW_ACTIVITY")
    handler.handle(frame)

    assert proxy.state.activities[0x66]["needs_confirm"] is False
    assert len(proxy._activity_row_payloads[0x66]) == 214

def test_catalog_activity_handler_decodes_utf16_labels() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = CatalogActivityHandler()

    samples = [
        (
            "a5 5a d5 3b 01 00 01 03 00 01 00 65 01 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 57 00 61 00 74 00 63 00 68 00 20 00 53 00 68 00 69 00 65 00 6c 00 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 57 00 61 00 74 00 63 00 68 00 20 00 53 00 68 00 69 00 65 00 6c 00 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 58",
            0x65,
            "Watch Shield",
        ),
        (
            "a5 5a d5 3b 02 00 01 03 00 01 00 66 0d 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 57 00 61 00 74 00 63 00 68 00 20 00 41 00 70 00 70 00 6c 00 65 00 20 00 54 00 56 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 57 00 61 00 74 00 63 00 68 00 20 00 41 00 70 00 70 00 6c 00 65 00 20 00 54 00 56 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 2e",
            0x66,
            "Watch Apple TV",
        ),
        (
            "a5 5a d5 3b 03 00 01 03 00 01 00 67 07 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 50 00 43 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 50 00 43 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 aa",
            0x67,
            "PC",
        ),
        (
            "a5 5a d5 3b 01 00 01 05 00 01 00 65 0a 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 57 00 61 00 74 00 63 00 68 00 20 00 61 00 20 00 6d 00 6f 00 76 00 69 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 01 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 a0 d8",
            0x65,
            "Watch a movie",
        ),
        (
            "a5 5a d5 3b 02 00 01 05 00 01 00 66 06 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 50 00 6c 00 61 00 79 00 20 00 53 00 74 00 65 00 61 00 6d 00 64 00 65 00 63 00 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 00 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 a0 65",
            0x66,
            "Play Steamdeck",
        ),
        (
            "a5 5a d5 3b 03 00 01 05 00 01 00 67 06 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 50 00 6c 00 61 00 79 00 20 00 53 00 77 00 69 00 74 00 63 00 68 00 20 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 01 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 a0 9c",
            0x67,
            "Play Switch 2",
        ),
        (
            "a5 5a d5 3b 04 00 01 05 00 01 00 68 07 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 50 00 6c 00 61 00 79 00 20 00 58 00 62 00 6f 00 78 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 00 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 a0 7d",
            0x68,
            "Play Xbox",
        ),
        (
            "a5 5a d5 3b 05 00 01 05 00 01 00 69 07 04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 50 00 6c 00 61 00 79 00 20 00 50 00 6c 00 61 00 79 00 73 00 74 00 61 00 74 00 69 00 6f 00 6e 00 20 00 35 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fc 01 fc 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 a0 cb",
            0x69,
            "Play Playstation 5",
        ),
    ]

    for raw_hex, act_id, expected_label in samples:
        handler.handle(
            _build_context(proxy, raw_hex, _opcode_from_raw(raw_hex), "CATALOG_ROW_ACTIVITY")
        )
        assert proxy.state.activities[act_id & 0xFF]["name"] == expected_label
