"""Tests for the infrared-protocols catalog module and its WS commands.

The unit tests drive ``ir_library`` through the ``_iter_code_sets`` seam
with synthetic code sets, so they need neither the real pip library nor
a hub. One integration test runs against the real ``infrared-protocols``
package when it is importable (skipped otherwise) and pins the
photon-validated Samsung payload prefix from the IR0 bench
(docs/internal/ha-infrared-plan.md, findings).
"""

from __future__ import annotations

import asyncio
import enum
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

ir_library = importlib.import_module("custom_components.sofabaton_x1s.ir_library")
integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


# ---------------------------------------------------------------------------
# Synthetic code sets
# ---------------------------------------------------------------------------


class _FakeCommand:
    def __init__(self, value: int, repeat_count: int):
        self.modulation = 38000
        self.repeat_count = repeat_count
        self._value = value

    def get_raw_timings(self):
        # Leader + one bit pair + end mark (odd count, exercises padding).
        return [4500, -4500, 560, -(560 + self._value), 560]


class _FakeSamsungCode(enum.IntEnum):
    POWER = 0x02
    VOLUME_UP = 0x07

    def to_command(self, repeat_count: int = 0):
        return _FakeCommand(self.value, repeat_count)


class _FakeBrokenCode(enum.IntEnum):
    GOOD = 1
    BAD = 2

    def to_command(self, repeat_count: int = 0):
        if self is _FakeBrokenCode.BAD:
            raise ValueError("unrenderable member")
        return _FakeCommand(self.value, repeat_count)


def _fake_sets():
    return [
        ir_library.CodeSet("samsung", "tv", _FakeSamsungCode),
        ir_library.CodeSet("lg", "tv", _FakeBrokenCode),
    ]


@pytest.fixture(autouse=True)
def _fresh_cache():
    ir_library.reset_cache()
    yield
    ir_library.reset_cache()


@pytest.fixture
def fake_library(monkeypatch):
    monkeypatch.setattr(ir_library, "_iter_code_sets", _fake_sets)
    return None


# ---------------------------------------------------------------------------
# Catalog / commands unit tests
# ---------------------------------------------------------------------------


def test_catalog_lists_brands_and_counts(fake_library):
    cat = ir_library.catalog()
    assert cat["available"] is True
    assert [b["key"] for b in cat["brands"]] == ["lg", "samsung"]
    lg, samsung = cat["brands"]
    assert lg["label"] == "LG"
    assert samsung["label"] == "Samsung"
    assert samsung["device_types"] == [
        {"key": "tv", "label": "TV", "command_count": 2}
    ]


def test_catalog_unavailable_when_library_import_fails(monkeypatch):
    def _boom():
        raise ImportError("no infrared_protocols")

    monkeypatch.setattr(ir_library, "_iter_code_sets", _boom)
    assert ir_library.catalog() == {"available": False, "brands": []}
    with pytest.raises(RuntimeError):
        ir_library.commands("samsung", "tv")


def test_commands_render_payloads_with_validated_layout(fake_library):
    commands = ir_library.commands("samsung", "tv")
    assert [c["key"] for c in commands] == ["POWER", "VOLUME_UP"]
    power = commands[0]
    assert power["label"] == "Power"
    assert power["carrier_hz"] == 38000
    blob = bytes.fromhex(power["payload_hex"])
    # 5 timings padded to 6 -> declared length 24, format zeros, BE16
    # carrier, terminator (live-validated layout, IR0 findings).
    assert blob[:8] == bytes.fromhex("0018000000009470")
    assert blob[-4:] == b"\x00\x00\x00\x00"
    assert len(blob) == 8 + 6 * 4 + 4
    # padding gap landed as the final timing word
    assert int.from_bytes(blob[-8:-4], "big") == ir_library.build_raw_ir_blob_body.__globals__[
        "RAW_IR_DEFAULT_TRAILING_GAP_US"
    ]


def test_commands_apply_brand_repeat_policy(fake_library, monkeypatch):
    captured = {}

    def fake_to_command(self, repeat_count: int = 0):
        captured[self.name] = repeat_count
        return _FakeCommand(self.value, repeat_count)

    monkeypatch.setattr(_FakeSamsungCode, "to_command", fake_to_command)
    ir_library.commands("samsung", "tv")
    assert captured == {"POWER": 1, "VOLUME_UP": 1}

    ir_library.reset_cache()
    monkeypatch.setattr(ir_library, "_iter_code_sets", lambda: [
        ir_library.CodeSet("philips", "tv", _FakeSamsungCode)
    ])
    captured.clear()
    ir_library.commands("philips", "tv")
    assert captured == {"POWER": 0, "VOLUME_UP": 0}


def test_commands_skip_unrenderable_members(fake_library):
    commands = ir_library.commands("lg", "tv")
    assert [c["key"] for c in commands] == ["GOOD"]


def test_commands_unknown_set_raises_lookup_error(fake_library):
    with pytest.raises(LookupError):
        ir_library.commands("samsung", "soundbar")


def test_prettify_and_brand_labels():
    assert ir_library._prettify("VOLUME_UP") == "Volume up"
    assert ir_library._prettify("aquos_tv") == "Aquos TV"
    assert ir_library._prettify("HDMI_1") == "HDMI 1"
    assert ir_library.brand_label("lg") == "LG"
    assert ir_library.brand_label("general_electric") == "General Electric"
    assert ir_library.brand_label("tween_light") == "Tween Light"


# ---------------------------------------------------------------------------
# WS command tests
# ---------------------------------------------------------------------------


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


def _fake_hass():
    async def async_add_executor_job(func, *args):
        return func(*args)

    return SimpleNamespace(async_add_executor_job=async_add_executor_job, data={})


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_ws_ir_library_catalog(monkeypatch):
    monkeypatch.setattr(ir_library, "_iter_code_sets", _fake_sets)
    conn = _Conn()
    _run(integration._ws_ir_library_catalog(_fake_hass(), conn, {"id": 5}))
    assert conn.error is None
    msg_id, payload = conn.result
    assert msg_id == 5
    assert payload["available"] is True
    assert [b["key"] for b in payload["brands"]] == ["lg", "samsung"]


def test_ws_ir_library_commands(monkeypatch):
    monkeypatch.setattr(ir_library, "_iter_code_sets", _fake_sets)
    conn = _Conn()
    _run(
        integration._ws_ir_library_commands(
            _fake_hass(), conn, {"id": 6, "brand": "samsung", "device_type": "tv"}
        )
    )
    assert conn.error is None
    msg_id, payload = conn.result
    assert msg_id == 6
    assert [c["key"] for c in payload["commands"]] == ["POWER", "VOLUME_UP"]


def test_ws_ir_library_commands_not_found(monkeypatch):
    monkeypatch.setattr(ir_library, "_iter_code_sets", _fake_sets)
    conn = _Conn()
    _run(
        integration._ws_ir_library_commands(
            _fake_hass(), conn, {"id": 7, "brand": "nope", "device_type": "tv"}
        )
    )
    assert conn.result is None
    assert conn.error[1] == "not_found"


def test_ws_ir_library_commands_unavailable(monkeypatch):
    def _boom():
        raise ImportError("no infrared_protocols")

    monkeypatch.setattr(ir_library, "_iter_code_sets", _boom)
    conn = _Conn()
    _run(
        integration._ws_ir_library_commands(
            _fake_hass(), conn, {"id": 8, "brand": "samsung", "device_type": "tv"}
        )
    )
    assert conn.result is None
    assert conn.error[1] == "unavailable"


# ---------------------------------------------------------------------------
# Real-library integration test (skipped when the pip package is absent)
# ---------------------------------------------------------------------------


def test_real_library_samsung_matches_photon_validated_payload():
    pytest.importorskip("infrared_protocols")
    ir_library.reset_cache()
    cat = ir_library.catalog()
    assert cat["available"] is True
    brands = {b["key"] for b in cat["brands"]}
    assert {"samsung", "lg"} <= brands

    commands = ir_library.commands("samsung", "tv")
    volume_up = next(c for c in commands if c["key"] == "VOLUME_UP")
    # Photon-validated prefix from the 2026-08-31 bench: double frame
    # (repeat_count=1) padded to 136 words = 0x0220 declared bytes,
    # format zeros, carrier 0x9470 = 38000 Hz.
    assert volume_up["payload_hex"].startswith("0220000000009470")
    assert volume_up["carrier_hz"] == 38000
