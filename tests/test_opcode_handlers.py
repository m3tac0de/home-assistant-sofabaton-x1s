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
from custom_components.sofabaton_x1s.lib.opcode_handlers import KeymapHandler
from custom_components.sofabaton_x1s.lib.protocol_const import (
    ButtonName,
    OP_KEYMAP_TBL_D,
    OP_KEYMAP_TBL_E,
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
