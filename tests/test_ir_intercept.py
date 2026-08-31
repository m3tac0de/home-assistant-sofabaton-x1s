"""Tests for the IR intercept path (IR5): recorder, labeling, sensor.

Covers ``ir_intercept`` (factual class-name + digest labeling, record
shape), the hub-side ring buffer with consecutive-send dedupe (driven
through ``SofabatonHub.record_ir_emission`` on a minimal fake self),
and the intercept sensor entity.

Design rule under test: the intercept path claims nothing beyond what
the command object carries - no code-set lookups, no ``ir_library``
dependency (the emitter must stay universal for parameterized,
third-party, and Pronto commands).
"""

from __future__ import annotations

import importlib
import sys
import types
from collections import deque
from pathlib import Path
from types import SimpleNamespace

from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

ensure_stub_package("custom_components", ROOT / "custom_components")
ensure_stub_package(
    "custom_components.sofabaton_x1s", ROOT / "custom_components" / "sofabaton_x1s"
)

ir_intercept = importlib.import_module(
    "custom_components.sofabaton_x1s.ir_intercept"
)


class Samsung32Command:
    def __init__(self, address: int, command: int, repeat_count: int = 0):
        self.address = address
        self.command = command
        self.modulation = 38000
        self.repeat_count = repeat_count

    def __repr__(self) -> str:
        return f"Samsung32Command(address={self.address}, command={self.command})"


class _ReprlessCommand:
    modulation = 38000


# ---------------------------------------------------------------------------
# Labeling and record shape
# ---------------------------------------------------------------------------


def test_intercept_module_has_no_ir_library_dependency():
    source = (
        ROOT / "custom_components" / "sofabaton_x1s" / "ir_intercept.py"
    ).read_text(encoding="utf-8")
    assert "ir_library" not in source
    assert "infrared_protocols" not in source


def test_describe_command_is_class_name_plus_stable_digest():
    command = Samsung32Command(0x07, 0x07)
    label_one = ir_intercept.describe_command(command, b"\x01\x02")
    label_two = ir_intercept.describe_command(command, b"\x01\x02")
    other_code = ir_intercept.describe_command(command, b"\x03\x04")
    assert label_one == label_two
    assert label_one.startswith("Samsung32Command (")
    assert other_code != label_one


def test_build_emission_record_shape():
    command = Samsung32Command(0x07, 0x02)
    record = ir_intercept.build_emission_record(
        command=command, timings=[1, -2, 3], carrier_hz=38000, blob=b"\xab\xcd"
    )
    assert record["label"].startswith("Samsung32Command (")
    assert record["command_repr"] == "Samsung32Command(address=7, command=2)"
    assert record["carrier_hz"] == 38000
    assert record["timing_count"] == 3
    assert record["payload_hex"] == "abcd"
    assert record["count"] == 1
    assert "T" in record["when"]  # ISO timestamp


def test_build_emission_record_reprless_command_uses_class_name():
    record = ir_intercept.build_emission_record(
        command=_ReprlessCommand(), timings=[1, -2], carrier_hz=38000, blob=b"\x01"
    )
    assert record["command_repr"] == "_ReprlessCommand"


# ---------------------------------------------------------------------------
# Hub ring buffer + dedupe (via the real method on a fake self)
# ---------------------------------------------------------------------------


def _fake_hub_self():
    return SimpleNamespace(
        _ir_emissions=deque(maxlen=20),
        hass=None,
        entry_id="entry-1",
    )


def _hub_record():
    hub_mod = importlib.import_module("custom_components.sofabaton_x1s.hub")
    return hub_mod.SofabatonHub.record_ir_emission, hub_mod.SofabatonHub.get_ir_emissions


def test_record_ir_emission_dedupes_consecutive_identical_sends():
    record_ir_emission, get_ir_emissions = _hub_record()
    fake = _fake_hub_self()
    command = Samsung32Command(0x07, 0x07)
    for _ in range(3):
        record_ir_emission(
            fake, command=command, timings=[1, -2], carrier_hz=38000, blob=b"\x01\x02"
        )
    record_ir_emission(
        fake, command=command, timings=[1, -2], carrier_hz=38000, blob=b"\x03\x04"
    )
    emissions = get_ir_emissions(fake)
    assert len(emissions) == 2
    assert emissions[0]["count"] == 3
    assert emissions[1]["count"] == 1
    assert emissions[1]["payload_hex"] == "0304"


def test_record_ir_emission_ring_is_bounded():
    record_ir_emission, get_ir_emissions = _hub_record()
    fake = _fake_hub_self()
    command = Samsung32Command(0x07, 0x02)
    for i in range(30):
        record_ir_emission(
            fake,
            command=command,
            timings=[1, -2],
            carrier_hz=38000,
            blob=bytes([i]),
        )
    emissions = get_ir_emissions(fake)
    assert len(emissions) == 20
    assert emissions[-1]["payload_hex"] == "1d"


# ---------------------------------------------------------------------------
# Sensor entity
# ---------------------------------------------------------------------------


def _install_missing_sensor_stubs() -> None:
    dt_mod = types.ModuleType("homeassistant.util.dt")
    dt_mod.utcnow = lambda: SimpleNamespace(timestamp=lambda: 0)
    sys.modules.setdefault("homeassistant.util.dt", dt_mod)
    util_mod = types.ModuleType("homeassistant.util")
    util_mod.dt = dt_mod
    sys.modules.setdefault("homeassistant.util", util_mod)

    event_mod = sys.modules.get("homeassistant.helpers.event")
    if event_mod is None or not hasattr(event_mod, "async_call_later"):
        event_mod = types.ModuleType("homeassistant.helpers.event")
        sys.modules["homeassistant.helpers.event"] = event_mod
    event_mod.async_call_later = getattr(
        event_mod, "async_call_later", lambda *a, **k: (lambda: None)
    )
    event_mod.async_track_time_interval = getattr(
        event_mod, "async_track_time_interval", lambda *a, **k: (lambda: None)
    )


def _sensor_module():
    _install_missing_sensor_stubs()
    name = "custom_components.sofabaton_x1s.sensor"
    if name in sys.modules:
        return sys.modules[name]
    return importlib.import_module(name)


class _SensorHub:
    entry_id = "entry-1"

    def __init__(self, emissions):
        self._emissions = emissions

    def get_ir_emissions(self):
        return list(self._emissions)


def _make_sensor(emissions):
    sensor = _sensor_module()
    entry = SimpleNamespace(data={"mac": "aabbccddeeff"}, options={})
    return sensor.SofabatonIrInterceptSensor(_SensorHub(emissions), entry)


def test_intercept_sensor_default_state():
    entity = _make_sensor([])
    assert entity.native_value == "Waiting for infrared send"
    assert entity.extra_state_attributes == {"recent": []}


def test_intercept_sensor_exposes_last_emission_and_recent():
    emissions = [
        {
            "label": f"Samsung32Command ({i:08x})",
            "command_repr": "Samsung32Command(address=7, command=7)",
            "carrier_hz": 38000,
            "timing_count": 67,
            "payload_hex": f"{i:02x}",
            "when": "2026-08-31T00:00:00+00:00",
            "count": 1 + i,
        }
        for i in range(7)
    ]
    entity = _make_sensor(emissions)
    assert entity.native_value == "Samsung32Command (00000006)"
    attrs = entity.extra_state_attributes
    assert attrs["payload_hex"] == "06"
    assert attrs["count"] == 7
    assert len(attrs["recent"]) == 5
    assert attrs["recent"][0]["label"] == "Samsung32Command (00000002)"
    assert getattr(entity, "_attr_entity_registry_enabled_default", True) is True
    assert entity._attr_unique_id == "aabbccddeeff_ir_intercept"


def test_intercept_sensor_only_created_when_infrared_domain_exists(monkeypatch):
    sensor = _sensor_module()

    class _Entry:
        entry_id = "entry-1"
        data = {"mac": "aabbccddeeff"}
        options: dict = {}

    added: list = []

    async def _run_setup():
        hass = SimpleNamespace(
            data={"sofabaton_x1s": {"entry-1": _SensorHub([])}}
        )
        await sensor.async_setup_entry(hass, _Entry(), added.extend)

    import asyncio

    monkeypatch.setattr(sensor, "infrared_platform_available", lambda: True)
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(_run_setup())
        with_infrared = [type(e).__name__ for e in added]
        added.clear()
        monkeypatch.setattr(sensor, "infrared_platform_available", lambda: False)
        loop.run_until_complete(_run_setup())
        without_infrared = [type(e).__name__ for e in added]
    finally:
        loop.close()

    assert "SofabatonIrInterceptSensor" in with_infrared
    assert "SofabatonIrInterceptSensor" not in without_infrared
    assert len(with_infrared) == len(without_infrared) + 1
