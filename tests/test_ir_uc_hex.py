"""Tests for the Unfolded Circle HEX import (``ir_uc_hex`` + its WS command).

The parser and the per-protocol unpack table are ours; the encoders are
``infrared-protocols``. The golden vectors in
``tests/fixtures/uc-hex-vectors.json`` pin the library's rendering of each
supported protocol (regenerate them deliberately when the library changes
a protocol) and double as the harness's canned conversion answers. The
Onkyo NEC row comes from a community codeset dump of a real Remote Two.
"""

from __future__ import annotations

import asyncio
import importlib
import json
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

ir_uc_hex = importlib.import_module("custom_components.sofabaton_x1s.ir_uc_hex")
integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")

VECTORS = json.loads(
    (ROOT / "tests" / "fixtures" / "uc-hex-vectors.json").read_text(encoding="utf-8")
)["vectors"]

try:
    importlib.import_module("infrared_protocols.commands.nec")
    LIBRARY_AVAILABLE = True
except Exception:  # noqa: BLE001 - optional in the unit-test environment
    LIBRARY_AVAILABLE = False

needs_library = pytest.mark.skipif(
    not LIBRARY_AVAILABLE, reason="infrared-protocols is not importable"
)

#: Library submodule behind each vector's protocol. Older library releases
#: (the manifest floor 5.8.1 has no rc6/pioneer) skip those vectors; the
#: converter itself refuses them with ``unsupported_protocol`` there.
ENCODER_MODULES = {
    "NEC": "nec",
    "SONY": "sony",
    "SONY_38K": "sony",
    "SAMSUNG": "samsung",
    "RC5": "rc5",
    "RC5X": "rc5",
    "RC6": "rc6",
    "PANASONIC": "kaseikyo",
    "SHARP": "sharp",
    "PIONEER": "pioneer",
}


def _require_encoder(protocol_name: str):
    return pytest.importorskip(
        f"infrared_protocols.commands.{ENCODER_MODULES[protocol_name]}"
    )


def _nec_has_subfunction() -> bool:
    import inspect

    from infrared_protocols.commands.nec import NECCommand

    return "subfunction" in inspect.signature(NECCommand.__init__).parameters


def _signed(timings: list[int]) -> list[int]:
    return [t if index % 2 == 0 else -t for index, t in enumerate(timings)]


# ---------------------------------------------------------------------------
# Parser (library-free)
# ---------------------------------------------------------------------------


def test_parse_accepts_the_documented_shape_and_tolerates_whitespace() -> None:
    code = ir_uc_hex.parse_uc_hex("3;0x4B36D32C;32;0")
    assert (code.protocol, code.value, code.bits, code.repeat) == (3, 0x4B36D32C, 32, 0)
    assert code.protocol_name == "NEC"
    assert code.protocol_label == "NEC (3)"

    spaced = ir_uc_hex.parse_uc_hex("  4 ; A90 ; 12 ; 2 \n")
    assert (spaced.protocol, spaced.value, spaced.bits, spaced.repeat) == (4, 0xA90, 12, 2)


def test_parse_accepts_enum_names_for_the_protocol() -> None:
    assert ir_uc_hex.parse_uc_hex("nec;0x20DF10EF;32;0").protocol == 3
    assert ir_uc_hex.parse_uc_hex("SONY;0xA90;12;0").protocol == 4
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.parse_uc_hex("BOGUS;0x1;8;0")
    assert info.value.code == "unsupported_protocol"


@pytest.mark.parametrize(
    "text",
    ["", "hello", "3;0x4B36D32C;32", "0000 006D 0001 0000 00AB 06AE", "3;0xZZ;32;0", "3;;32;0"],
)
def test_parse_rejects_non_uc_shapes(text: str) -> None:
    assert ir_uc_hex.looks_like_uc_hex(text) is False
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.parse_uc_hex(text)
    assert info.value.code == "invalid"


def test_parse_rejects_values_wider_than_bits_and_absurd_widths() -> None:
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.parse_uc_hex("3;0x1FFFFFFFF;32;0")
    assert info.value.code == "invalid"
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.parse_uc_hex("16;0x1;200;0")
    assert info.value.code == "unsupported_bits"


def test_unsupported_protocols_are_named_in_the_refusal() -> None:
    code = ir_uc_hex.parse_uc_hex("6;0x1234;16;0")
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.build_command(code)
    assert info.value.code == "unsupported_protocol"
    assert info.value.detail == "JVC (6)"

    unknown = ir_uc_hex.parse_uc_hex("99;0x1;8;0")
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.build_command(unknown)
    assert info.value.detail == "protocol 99"


def test_supported_protocol_table_is_the_documented_set() -> None:
    assert ir_uc_hex.SUPPORTED_PROTOCOLS == (1, 2, 3, 4, 5, 7, 14, 23, 50, 74)


# ---------------------------------------------------------------------------
# Rendering through infrared-protocols
# ---------------------------------------------------------------------------


@needs_library
@pytest.mark.parametrize("vector", VECTORS, ids=[v["name"] for v in VECTORS])
def test_golden_vectors_render_bit_exactly(vector: dict) -> None:
    _require_encoder(vector["protocol_name"])
    result = ir_uc_hex.convert_uc_hex(vector["text"])
    assert result["protocol_name"] == vector["protocol_name"]
    assert result["carrier_hz"] == vector["carrier_hz"]
    assert result["timings_us"] == vector["timings_us"]
    assert result["bits"] == vector["bits"]
    assert result["repeat"] == vector["repeat"]


@needs_library
def test_onkyo_row_decodes_back_to_its_extended_nec_fields() -> None:
    """IRremoteESP8266 stores NEC bytes bit-reversed; the library must see the
    logical fields (0x6CD2 / 0xCB), not the raw 0x4B36 / 0xD3 digits."""

    from infrared_protocols.commands.nec import NECCommand

    command = ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("3;0x4B36D32C;32;0"))
    assert (command.address, command.command) == (0x6CD2, 0xCB)
    result = ir_uc_hex.convert_uc_hex("3;0x4B36D32C;32;0")
    reference = NECCommand(address=0x6CD2, command=0xCB).get_raw_timings()
    assert result["timings_us"] == [abs(t) for t in reference]
    if hasattr(NECCommand, "from_raw_timings"):
        decoded = NECCommand.from_raw_timings(_signed(result["timings_us"]))
        assert decoded is not None
        assert (decoded.address, decoded.command) == (0x6CD2, 0xCB)
        assert decoded.repeat_count == 0


@needs_library
def test_nec1_f16_needs_the_subfunction_capable_library() -> None:
    """Fourth byte that is not the inverted command: only a library with
    ``subfunction`` can reproduce it; older ones refuse instead of guessing."""

    text = "3;0x4B36D300;32;0"
    if _nec_has_subfunction():
        command = ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex(text))
        assert (command.address, command.command, command.subfunction) == (0x6CD2, 0xCB, 0x00)
    else:
        with pytest.raises(ir_uc_hex.UcHexError) as info:
            ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex(text))
        assert info.value.code == "unrepresentable"


@needs_library
def test_standard_nec_uses_the_inverted_address_form() -> None:
    """``20DF10EF`` is the classic LG power code: address 0x04, command 0x08.
    The library must be handed the standard form (it inverts the address
    itself), with the embedded repeat mapped onto its ``repeat_count``."""

    from infrared_protocols.commands.nec import NECCommand

    command = ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("3;0x20DF10EF;32;1"))
    assert (command.address, command.command) == (0x04, 0x08)
    assert getattr(command, "subfunction", None) is None
    assert command.repeat_count == 1
    result = ir_uc_hex.convert_uc_hex("3;0x20DF10EF;32;1")
    reference = NECCommand(address=0x04, command=0x08, repeat_count=1).get_raw_timings()
    assert result["timings_us"] == [abs(t) for t in reference]


@needs_library
def test_sony_unpacks_lsb_first_command_then_address() -> None:
    command = ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("4;0xA90;12;0"))
    # 0xA90 reversed over 12 bits = 0x095: command 0x15 (TV power), address 1.
    assert (command.command, command.address, command.address_bits) == (0x15, 0x01, 5)
    assert command.modulation == 40000
    assert ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("74;0xA90;12;0")).modulation == 38000


@needs_library
def test_sony_repeat_sends_the_frame_again() -> None:
    once = ir_uc_hex.convert_uc_hex("4;0xA90;12;0")["timings_us"]
    thrice = ir_uc_hex.convert_uc_hex("4;0xA90;12;2")["timings_us"]
    assert thrice == once * 3


@needs_library
def test_samsung_requires_the_inverted_command_byte() -> None:
    command = ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("7;0xE0E040BF;32;0"))
    assert (command.address, command.command) == (0x07, 0x02)
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("7;0xE0E04000;32;0"))
    assert info.value.code == "unrepresentable"


@needs_library
def test_rc5_and_rc5x_carry_toggle_and_the_seventh_command_bit() -> None:
    plain = ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("1;0x80C;12;0"))
    assert (plain.address, plain.command, plain.toggle) == (0x00, 0x0C, 1)
    extended = ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("23;0x180C;13;0"))
    assert (extended.address, extended.command, extended.toggle) == (0x00, 0x4C, 1)


@needs_library
def test_rc6_mode_zero_only() -> None:
    _require_encoder("RC6")
    command = ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("2;0x1010C;20;0"))
    assert (command.address, command.command, command.toggle) == (0x01, 0x0C, 1)
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("2;0x2000C;20;0"))
    assert info.value.code == "unrepresentable"


@needs_library
def test_panasonic_unpacks_the_kaseikyo_vendor_and_checks_parity() -> None:
    command = ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("5;0x40040100BCBD;48;0"))
    assert command.address == 0x2002
    assert command.data == bytes([0x80, 0x00, 0x3D, 0xBD])
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("5;0x40041100BCBD;48;0"))
    assert info.value.code == "unrepresentable"


@needs_library
def test_wrong_bit_widths_are_refused_per_protocol() -> None:
    for text in ("3;0x1234;16;0", "4;0x1F;9;0", "7;0x1234;16;0", "14;0x1;16;0"):
        with pytest.raises(ir_uc_hex.UcHexError) as info:
            ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex(text))
        assert info.value.code == "unsupported_bits", text


def test_an_encoder_missing_from_an_old_library_reads_as_unsupported(monkeypatch) -> None:
    """A library without ``rc6`` refuses RC6 by name instead of failing NEC too.

    The converter tells "old library" from "no library" by probing the base
    package after the encoder import fails, so the fake stands in for that
    base package too: the test must not depend on whether the runner has
    ``infrared-protocols`` installed at all.
    """

    real_import = importlib.import_module

    def selective_import(name: str, package=None):
        if name == "infrared_protocols.commands.rc6":
            raise ImportError("No module named 'infrared_protocols.commands.rc6'")
        if name == "infrared_protocols.commands":
            try:
                return real_import(name, package)
            except ImportError:
                return SimpleNamespace()
        return real_import(name, package)

    monkeypatch.setattr("importlib.import_module", selective_import)
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("2;0x1010C;20;0"))
    assert (info.value.code, info.value.detail) == ("unsupported_protocol", "RC6 (2)")
    if LIBRARY_AVAILABLE:
        assert ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("3;0x20DF10EF;32;0")) is not None


def test_library_import_failure_reads_as_unavailable(monkeypatch) -> None:
    def broken_import(name: str):
        raise ImportError("no infrared_protocols here")

    monkeypatch.setattr("importlib.import_module", broken_import)
    with pytest.raises(ir_uc_hex.UcHexError) as info:
        ir_uc_hex.build_command(ir_uc_hex.parse_uc_hex("3;0x20DF10EF;32;0"))
    assert info.value.code == "unavailable"


# ---------------------------------------------------------------------------
# WS command
# ---------------------------------------------------------------------------


class _Conn:
    def __init__(self) -> None:
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


def _run_ws(monkeypatch, text: str) -> _Conn:
    conn = _Conn()

    async def executor(func, *args):
        return func(*args)

    hass = SimpleNamespace(async_add_executor_job=executor, data={})
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_ir_payload_convert(
                hass, conn, {"id": 7, "text": text, "format": "uc_hex"}
            )
        )
    finally:
        loop.close()
    return conn


@needs_library
def test_ws_convert_returns_signal_and_both_hex_projections(monkeypatch) -> None:
    from custom_components.sofabaton_x1s.lib.blob_decoders import (
        parse_pronto_hex,
        parse_raw_ir_blob_body,
    )

    conn = _run_ws(monkeypatch, "3;0x4B36D32C;32;0")
    assert conn.error is None
    msg_id, payload = conn.result
    assert msg_id == 7
    assert payload["format"] == "uc_hex"
    assert payload["protocol_name"] == "NEC"
    assert payload["carrier_hz"] == 38000
    timings, carrier = parse_raw_ir_blob_body(bytes.fromhex(payload["sofabaton_hex"]))
    assert carrier == 38000
    # A frame ending on a mark (odd count) is closed with the default gap.
    expected = list(payload["timings_us"])
    if len(expected) % 2:
        expected.append(40000)
    assert timings == expected
    pronto_timings, pronto_carrier = parse_pronto_hex(payload["pronto_hex"])
    assert abs(pronto_carrier - 38000) <= 38000 * 0.005
    assert len(pronto_timings) == len(expected)


def test_ws_convert_maps_parser_failures_to_stable_codes(monkeypatch) -> None:
    conn = _run_ws(monkeypatch, "hello")
    assert conn.result is None
    assert conn.error == (7, "uc_hex_invalid", "not an Unfolded Circle HEX code")

    conn = _run_ws(monkeypatch, "6;0x1234;16;0")
    assert conn.error == (7, "uc_hex_unsupported_protocol", "JVC (6)")


def test_ws_convert_reports_a_missing_library_as_unavailable(monkeypatch) -> None:
    def broken(_text):
        raise ir_uc_hex.UcHexError("unavailable", "no infrared_protocols")

    monkeypatch.setattr(ir_uc_hex, "convert_uc_hex", broken)
    conn = _run_ws(monkeypatch, "3;0x20DF10EF;32;0")
    assert conn.error == (7, "unavailable", "no infrared_protocols")
