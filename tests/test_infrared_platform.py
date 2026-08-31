"""Tests for the infrared emitter platform (IR4).

Runs against the conftest HA stubs (including the stubbed
``homeassistant.components.infrared`` base class). Covers the send path
(command -> corrected raw blob -> play), availability, the opt-in
registry default, the IR5 recorder hook, and the conditional platform
forwarding helper.
"""

from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

ensure_stub_package("custom_components", ROOT / "custom_components")
ensure_stub_package(
    "custom_components.sofabaton_x1s", ROOT / "custom_components" / "sofabaton_x1s"
)

infrared_platform = importlib.import_module(
    "custom_components.sofabaton_x1s.infrared"
)
integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
from custom_components.sofabaton_x1s.const import CONF_MAC, PLATFORMS  # noqa: E402
from homeassistant.exceptions import HomeAssistantError  # noqa: E402


class _FakeCommand:
    def __init__(self, timings=None, modulation=38000):
        self.modulation = modulation
        self._timings = timings if timings is not None else [4500, -4500, 560]

    def get_raw_timings(self):
        return list(self._timings)


class _FakeHub:
    entry_id = "entry-1"

    def __init__(self):
        self.hub_connected = True
        self.client_connected = False
        self.play_calls = []
        self.play_return = True
        self.hub_firmware_version = 7

    async def async_play_ir_blob(self, blob: bytes, *, inter_frame_delay: float = 0.08):
        self.play_calls.append(blob)
        return self.play_return


def _make_entity(hub=None):
    hub = hub or _FakeHub()
    entry = SimpleNamespace(data={CONF_MAC: "aabbccddeeff"}, options={})
    entity = infrared_platform.SofabatonInfraredEmitter(hub, entry)
    return entity, hub


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_send_command_renders_validated_layout_and_plays():
    entity, hub = _make_entity()
    _run(entity.async_send_command(_FakeCommand()))
    assert len(hub.play_calls) == 1
    blob = hub.play_calls[0]
    # 3 timings padded to 4 words = 16 declared bytes, format zeros,
    # BE16 carrier 0x9470 (live-validated layout).
    assert blob[:8] == bytes.fromhex("0010000000009470")
    assert blob[-4:] == b"\x00\x00\x00\x00"


def test_send_command_raises_when_hub_not_ready():
    entity, hub = _make_entity()
    hub.play_return = False
    with pytest.raises(HomeAssistantError):
        _run(entity.async_send_command(_FakeCommand()))


def test_send_command_wraps_render_errors():
    entity, hub = _make_entity()
    with pytest.raises(HomeAssistantError):
        _run(entity.async_send_command(_FakeCommand(timings=[])))
    with pytest.raises(HomeAssistantError):
        _run(entity.async_send_command(_FakeCommand(modulation=0)))
    assert hub.play_calls == []


def test_send_command_feeds_intercept_recorder_when_present():
    entity, hub = _make_entity()
    recorded = []
    hub.record_ir_emission = lambda **kwargs: recorded.append(kwargs)
    command = _FakeCommand()
    _run(entity.async_send_command(command))
    assert len(recorded) == 1
    assert recorded[0]["command"] is command
    assert recorded[0]["carrier_hz"] == 38000
    assert recorded[0]["blob"] == hub.play_calls[0]
    assert recorded[0]["timings"] == [4500, -4500, 560]


def test_availability_mirrors_remote_entity_gates():
    entity, hub = _make_entity()
    assert entity.available is True
    hub.client_connected = True
    assert entity.available is False
    hub.client_connected = False
    hub.hub_connected = False
    assert entity.available is False


def test_entity_is_enabled_by_default_and_uniquely_identified():
    entity, _hub = _make_entity()
    # Enabled by default when the platform exists at all (user decision
    # 2026-08-31 superseding the earlier opt-in choice).
    assert getattr(entity, "_attr_entity_registry_enabled_default", True) is True
    assert entity._attr_unique_id == "aabbccddeeff_ir_emitter"
    assert entity._attr_translation_key == "ir_emitter"


def test_supported_platforms_includes_infrared_with_stub():
    platforms = integration._supported_platforms()
    assert platforms[: len(PLATFORMS)] == list(PLATFORMS)
    assert platforms[-1] == "infrared"


def test_supported_platforms_degrades_without_infrared(monkeypatch):
    monkeypatch.delitem(sys.modules, "homeassistant.components.infrared")
    platforms = integration._supported_platforms()
    assert platforms == list(PLATFORMS)


# ---------------------------------------------------------------------------
# send_pronto entity service (self-parsed, library-version-independent)
# ---------------------------------------------------------------------------


def test_send_pronto_module_does_not_import_infrared_protocols():
    source = (
        Path(__file__).resolve().parents[1]
        / "custom_components"
        / "sofabaton_x1s"
        / "infrared.py"
    ).read_text(encoding="utf-8")
    # The TYPE_CHECKING type alias is the only permitted reference; the
    # runtime path (send_pronto included) must not import the library.
    references = [
        line.strip()
        for line in source.splitlines()
        if "infrared_protocols" in line
    ]
    assert references == [
        "from infrared_protocols.commands import Command as InfraredCommand"
    ]


def test_send_pronto_routes_through_full_emission_path():
    entity, hub = _make_entity()
    recorded = []
    hub.record_ir_emission = lambda **kwargs: recorded.append(kwargs)
    # 0x006D -> 38029 Hz; one pair: 0x00AB=171 cycles, 0x06AE=1710 cycles
    _run(entity.async_send_pronto("  0000 006D 0002 0000 00AB 00AB 0015 06AE  "))
    assert len(hub.play_calls) == 1
    blob = hub.play_calls[0]
    assert blob[6:8] == (38029).to_bytes(2, "big")
    assert len(recorded) == 1
    assert recorded[0]["carrier_hz"] == 38029
    assert repr(recorded[0]["command"]).startswith("ProntoHexCommand(")
    # 171 cycles at 38029 Hz -> 4497 us leader mark
    assert recorded[0]["timings"][0] == 4497


@pytest.mark.parametrize(
    "pronto",
    [
        "garbage",
        "0100 006D 0001 0000 00AB 00AB",  # non-learned format
        "0000 0000 0001 0000 00AB 00AB",  # zero frequency word
        "0000 006D 0002 0000 00AB 00AB",  # count mismatch
        "0000 006D 0000 0000",  # no pairs at all
        "0000 006D 0001 0000 0000 00AB",  # zero timing word
    ],
)
def test_send_pronto_invalid_hex_raises(pronto):
    entity, hub = _make_entity()
    with pytest.raises(HomeAssistantError, match="Invalid pronto hex"):
        _run(entity.async_send_pronto(pronto))
    assert hub.play_calls == []


def test_send_pronto_uses_repeat_section_when_once_is_empty():
    entity, hub = _make_entity()
    _run(entity.async_send_pronto("0000 006D 0000 0001 00AB 06AE"))
    assert len(hub.play_calls) == 1


def test_setup_entry_registers_send_pronto_service():
    import asyncio
    from homeassistant.helpers import entity_platform as ep

    ep._stub_platform.registered_services.clear()
    hub = _FakeHub()
    entry = SimpleNamespace(
        entry_id="entry-1", data={CONF_MAC: "aabbccddeeff"}, options={}
    )
    hass = SimpleNamespace(data={"sofabaton_x1s": {"entry-1": hub}})
    added: list = []

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            infrared_platform.async_setup_entry(hass, entry, added.extend)
        )
    finally:
        loop.close()

    assert [type(e).__name__ for e in added] == ["SofabatonInfraredEmitter"]
    names = [name for name, _schema, _func in ep._stub_platform.registered_services]
    assert names == ["send_pronto"]
    assert ep._stub_platform.registered_services[0][2] == "async_send_pronto"
