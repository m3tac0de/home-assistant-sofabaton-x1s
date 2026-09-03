"""Unfolded Circle ``HEX`` IR codes rendered through ``infrared-protocols``.

Unfolded Circle remotes and docks store learned IR codes in two formats:
``PRONTO`` (plain learned-format pronto hex, which the payload editor
already accepts) and ``HEX``, four semicolon-separated fields::

    <protocol>;<value>;<bits>;<repeat>      e.g.  3;0x4B36D32C;32;0

``protocol`` is the numeric ``decode_type_t`` of the IRremoteESP8266
library the dock firmware is built on, ``value`` is the raw bit stream in
that library's send order (MSB first, so every LSB-first protocol shows
up with its bytes bit-reversed), ``bits`` is the stream width and
``repeat`` its embedded repeat count.

This module owns exactly two things:

* the shape parser for that string, and
* a small table that unpacks ``(value, bits)`` per protocol into the
  keyword arguments of the matching ``infrared_protocols`` command class.

Everything about how a protocol is *emitted* (timings, carrier, repeat
frames, toggle bits, parity) stays with the library - the same one Home
Assistant's Infrared platform uses - so a protocol that is missing or
wrong there is fixed upstream, not here. Protocols the library has no
encoder for are refused with a clear error rather than approximated.

The unpack rules were verified against IRremoteESP8266's ``encode*``
helpers and the community codeset dump that ships the Onkyo golden vector
(tests/fixtures/uc-hex-vectors.json).
"""

from __future__ import annotations

import inspect
import re
from dataclasses import dataclass
from typing import Any, Callable

#: IRremoteESP8266 ``decode_type_t`` numbers we can name in errors. Only
#: the entries with a matching library encoder are convertible; the rest
#: exist so "protocol 6" becomes "JVC (6)" in the refusal message.
PROTOCOL_NAMES: dict[int, str] = {
    1: "RC5",
    2: "RC6",
    3: "NEC",
    4: "SONY",
    5: "PANASONIC",
    6: "JVC",
    7: "SAMSUNG",
    10: "LG",
    11: "SANYO",
    12: "MITSUBISHI",
    13: "DISH",
    14: "SHARP",
    16: "DAIKIN",
    17: "DENON",
    19: "SHERWOOD",
    21: "RCMM",
    23: "RC5X",
    25: "PRONTO",
    26: "NEC_LIKE",
    30: "RAW",
    31: "GLOBALCACHE",
    46: "SAMSUNG_AC",
    49: "PANASONIC_AC",
    50: "PIONEER",
    51: "LG2",
    56: "SAMSUNG36",
    74: "SONY_38K",
}

_UC_HEX_RE = re.compile(
    r"^\s*(?P<protocol>[A-Za-z_0-9]+)\s*;\s*(?:0[xX])?(?P<value>[0-9A-Fa-f]+)\s*;"
    r"\s*(?P<bits>\d+)\s*;\s*(?P<repeat>\d+)\s*$"
)


class UcHexError(ValueError):
    """Conversion failure with a stable machine-readable ``code``.

    Codes: ``invalid`` (not a UC HEX string), ``unsupported_protocol``
    (no library encoder), ``unsupported_bits`` (width the encoder does
    not model), ``unrepresentable`` (value violates the protocol's frame
    rules, so the library could not reproduce it bit-exactly) and
    ``unavailable`` (``infrared-protocols`` cannot be imported).
    """

    def __init__(self, code: str, detail: str = "") -> None:
        super().__init__(detail or code)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class UcHexCode:
    protocol: int
    value: int
    bits: int
    repeat: int

    @property
    def protocol_name(self) -> str:
        return PROTOCOL_NAMES.get(self.protocol, f"protocol {self.protocol}")

    @property
    def protocol_label(self) -> str:
        name = PROTOCOL_NAMES.get(self.protocol)
        return f"{name} ({self.protocol})" if name else f"protocol {self.protocol}"


def looks_like_uc_hex(text: str) -> bool:
    """Shape-only check (no value validation); mirrors the card's detector."""

    return bool(_UC_HEX_RE.match(text or ""))


def parse_uc_hex(text: str) -> UcHexCode:
    """Parse ``<protocol>;<value>;<bits>;<repeat>`` into its fields.

    The protocol may be given as its number or as an IRremoteESP8266
    enum name (case-insensitive); ``0x`` on the value is optional.
    """

    match = _UC_HEX_RE.match(text or "")
    if not match:
        raise UcHexError("invalid", "not an Unfolded Circle HEX code")
    protocol_field = match.group("protocol")
    if protocol_field.isdigit():
        protocol = int(protocol_field)
    else:
        by_name = {name: number for number, name in PROTOCOL_NAMES.items()}
        protocol = by_name.get(protocol_field.upper(), -1)
        if protocol < 0:
            raise UcHexError("unsupported_protocol", protocol_field.upper())
    bits = int(match.group("bits"))
    repeat = int(match.group("repeat"))
    if bits <= 0 or bits > 64:
        raise UcHexError("unsupported_bits", f"{bits} bits")
    value = int(match.group("value"), 16)
    if value >= (1 << bits):
        raise UcHexError("invalid", f"value does not fit in {bits} bits")
    return UcHexCode(protocol=protocol, value=value, bits=bits, repeat=repeat)


# ---------------------------------------------------------------------------
# Per-protocol unpack: (value, bits) -> library command kwargs
# ---------------------------------------------------------------------------


def _reverse_bits(value: int, width: int) -> int:
    result = 0
    for _ in range(width):
        result = (result << 1) | (value & 1)
        value >>= 1
    return result


def _on_air_bytes(value: int, bits: int) -> list[int]:
    """Bytes in transmission order, each bit-reversed back to its logical value.

    IRremoteESP8266 sends its ``value`` MSB first; for LSB-first protocols
    (NEC, Samsung, Kaseikyo, Sharp) it stores every byte pre-reversed, so
    reversing each byte again yields the protocol's logical fields.
    """

    if bits % 8:
        raise UcHexError("unsupported_bits", f"{bits} bits")
    count = bits // 8
    return [
        _reverse_bits((value >> (8 * (count - 1 - index))) & 0xFF, 8)
        for index in range(count)
    ]


def _nec_fields(word: int) -> tuple[int, int, int, int]:
    """(address_low, address_high, command, suffix) of one 32-bit NEC word."""

    address_low, address_high, command, suffix = _on_air_bytes(word, 32)
    return address_low, address_high, command, suffix


def _unpack_nec(code: UcHexCode, modules: dict[str, Any]) -> Any:
    if code.bits != 32:
        raise UcHexError("unsupported_bits", f"NEC with {code.bits} bits")
    address_low, address_high, command, suffix = _nec_fields(code.value)
    cls = modules["nec"].NECCommand
    standard_address = address_high == (~address_low & 0xFF)
    standard_suffix = suffix == (~command & 0xFF)
    if standard_address and standard_suffix:
        return cls(address=address_low, command=command, repeat_count=code.repeat)
    if standard_suffix and address_high != 0:
        # Extended address: a 16-bit address takes the library's extended
        # path (no inversion) in every supported library version.
        return cls(
            address=address_low | (address_high << 8),
            command=command,
            repeat_count=code.repeat,
        )
    # NEC1-f16 suffix, or an extended address with a zero high byte: only
    # the explicit ``subfunction`` argument (infrared-protocols 8.2+, the
    # HA 2026.8 pin) reproduces the fourth byte verbatim.
    if "subfunction" not in inspect.signature(cls.__init__).parameters:
        raise UcHexError("unrepresentable", "NEC variant needs a newer infrared-protocols")
    return cls(
        address=address_low | (address_high << 8),
        command=command,
        subfunction=suffix,
        repeat_count=code.repeat,
    )


def _unpack_sony(code: UcHexCode, modules: dict[str, Any], *, modulation: int) -> Any:
    if code.bits not in (12, 15, 20):
        raise UcHexError("unsupported_bits", f"SONY with {code.bits} bits")
    logical = _reverse_bits(code.value, code.bits)
    command = logical & 0x7F
    address = logical >> 7
    return modules["sony"].SonyCommand(
        address=address,
        address_bits=code.bits - 7,
        command=command,
        modulation=modulation,
    )


def _unpack_samsung(code: UcHexCode, modules: dict[str, Any]) -> Any:
    if code.bits != 32:
        raise UcHexError("unsupported_bits", f"SAMSUNG with {code.bits} bits")
    address_low, address_high, command, suffix = _on_air_bytes(code.value, 32)
    if suffix != (~command & 0xFF):
        raise UcHexError("unrepresentable", "SAMSUNG frame without an inverted command byte")
    if address_high == address_low:
        address = address_low
    elif address_high != 0:
        address = address_low | (address_high << 8)
    else:
        raise UcHexError("unrepresentable", "SAMSUNG extended address with a zero high byte")
    return modules["samsung"].Samsung32Command(
        address=address, command=command, repeat_count=code.repeat
    )


def _unpack_rc5(code: UcHexCode, modules: dict[str, Any]) -> Any:
    if code.bits not in (12, 13):
        raise UcHexError("unsupported_bits", f"RC5 with {code.bits} bits")
    value = code.value
    command = value & 0x3F
    address = (value >> 6) & 0x1F
    toggle = (value >> 11) & 1
    if code.bits == 13 and (value >> 12) & 1:
        # RC5X: IRremoteESP8266 keeps the 7th command bit as the data MSB
        # (sent on air as an inverted field bit, which the library derives
        # from command bit 6 itself).
        command |= 0x40
    return modules["rc5"].RC5Command(
        address=address, command=command, toggle=toggle, repeat_count=code.repeat
    )


def _unpack_rc6(code: UcHexCode, modules: dict[str, Any]) -> Any:
    if code.bits != 20:
        raise UcHexError("unsupported_bits", f"RC6 with {code.bits} bits")
    value = code.value
    mode = (value >> 17) & 0x7
    if mode != 0:
        raise UcHexError("unrepresentable", f"RC6 mode {mode}")
    return modules["rc6"].RC6Command(
        address=(value >> 8) & 0xFF,
        command=value & 0xFF,
        toggle=(value >> 16) & 1,
        repeat_count=code.repeat,
    )


def _unpack_panasonic(code: UcHexCode, modules: dict[str, Any]) -> Any:
    if code.bits != 48:
        raise UcHexError("unsupported_bits", f"PANASONIC with {code.bits} bits")
    frame = _on_air_bytes(code.value, 48)
    address = frame[0] | (frame[1] << 8)
    parity = address ^ (address >> 8)
    parity ^= parity >> 4
    parity &= 0x0F
    if (frame[2] & 0x0F) != parity:
        # The library recomputes the parity nibble from the address; a
        # frame that disagrees could not be reproduced bit-exactly.
        raise UcHexError("unrepresentable", "PANASONIC parity nibble mismatch")
    return modules["kaseikyo"].KaseikyoCommand(
        address=address, data=bytes(frame[2:]), repeat_count=code.repeat
    )


def _unpack_sharp(code: UcHexCode, modules: dict[str, Any]) -> Any:
    if code.bits != 15:
        raise UcHexError("unsupported_bits", f"SHARP with {code.bits} bits")
    value = code.value
    if value & 1:
        raise UcHexError("unrepresentable", "SHARP frame with the check bit set")
    return modules["sharp"].SharpCommand(
        address=_reverse_bits((value >> 10) & 0x1F, 5),
        command=_reverse_bits((value >> 2) & 0xFF, 8),
        extension=(value >> 1) & 1,
    )


def _unpack_pioneer(code: UcHexCode, modules: dict[str, Any]) -> Any:
    if code.bits != 64:
        raise UcHexError("unsupported_bits", f"PIONEER with {code.bits} bits")
    frames = []
    for word in ((code.value >> 32) & 0xFFFFFFFF, code.value & 0xFFFFFFFF):
        address_low, address_high, command, suffix = _nec_fields(word)
        if address_high != (~address_low & 0xFF) or suffix != (~command & 0xFF):
            raise UcHexError("unrepresentable", "PIONEER frame is not standard NEC")
        frames.append((address_low, command))
    (preamble_address, preamble_command), (address, command) = frames
    return modules["pioneer"].PioneerCommand(
        address=address,
        command=command,
        preamble_address=preamble_address,
        preamble_command=preamble_command,
        repeat_count=code.repeat,
    )


_Unpacker = Callable[[UcHexCode, dict[str, Any]], Any]

#: protocol number -> (library submodule, unpack function). Only protocols
#: with a bit-exact library encoder are listed; everything else is refused.
_UNPACKERS: dict[int, tuple[str, _Unpacker]] = {
    1: ("rc5", _unpack_rc5),
    23: ("rc5", _unpack_rc5),
    2: ("rc6", _unpack_rc6),
    3: ("nec", _unpack_nec),
    4: ("sony", lambda code, modules: _unpack_sony(code, modules, modulation=40000)),
    74: ("sony", lambda code, modules: _unpack_sony(code, modules, modulation=38000)),
    5: ("kaseikyo", _unpack_panasonic),
    7: ("samsung", _unpack_samsung),
    14: ("sharp", _unpack_sharp),
    50: ("pioneer", _unpack_pioneer),
}

SUPPORTED_PROTOCOLS: tuple[int, ...] = tuple(sorted(_UNPACKERS))

class _LazyModules(dict):
    """``modules["nec"]`` imports ``infrared_protocols.commands.nec`` on first
    use, so a protocol only needs *its* encoder to exist: an older library
    without, say, ``pioneer`` still converts NEC. A missing library reads as
    ``unavailable``; a missing single encoder as ``unsupported_protocol``."""

    def __missing__(self, name: str) -> Any:
        from importlib import import_module

        try:
            module = import_module(f"infrared_protocols.commands.{name}")
        except ImportError as err:
            try:
                import_module("infrared_protocols.commands")
            except ImportError as base_err:
                raise UcHexError("unavailable", str(base_err)) from base_err
            raise UcHexError("unsupported_protocol", f"{name} encoder") from err
        except Exception as err:  # noqa: BLE001 - any other import failure = unavailable
            raise UcHexError("unavailable", str(err)) from err
        self[name] = module
        return module


def _load_modules() -> dict[str, Any]:
    return _LazyModules()


def _accepts_repeat_count(command: Any) -> bool:
    """Whether the command class models repeats itself (a ``repeat_count``
    constructor argument). The base class always *stores* one, so the
    attribute alone says nothing; the constructor signature does."""

    try:
        return "repeat_count" in inspect.signature(type(command).__init__).parameters
    except (TypeError, ValueError):
        return False


def build_command(code: UcHexCode) -> Any:
    """The ``infrared_protocols`` command object for one parsed code."""

    entry = _UNPACKERS.get(code.protocol)
    if entry is None:
        raise UcHexError("unsupported_protocol", code.protocol_label)
    modules = _load_modules()
    submodule, unpack = entry
    try:
        modules[submodule]
    except UcHexError as err:
        if err.code == "unsupported_protocol":
            # The installed library predates this encoder.
            raise UcHexError("unsupported_protocol", code.protocol_label) from err
        raise
    try:
        return unpack(code, modules)
    except UcHexError:
        raise
    except (TypeError, ValueError) as err:
        raise UcHexError("unrepresentable", str(err)) from err


def convert_uc_hex(text: str) -> dict[str, Any]:
    """Render a UC HEX code to the canonical ``(timings, carrier)`` signal.

    Timings are positional mark/space durations in microseconds (mark
    first, the same shape ``build_raw_ir_blob_body`` expects). When the
    embedded repeat count applies to a protocol whose library class has no
    repeat parameter, the frame is simply sent that many extra times, which
    is all IRremoteESP8266's ``repeat`` argument means for such protocols.
    """

    code = parse_uc_hex(text)
    command = build_command(code)
    frame = [abs(int(t)) for t in command.get_raw_timings()]
    if not frame:
        raise UcHexError("unrepresentable", "encoder produced no timings")
    timings = list(frame)
    if code.repeat > 0 and not _accepts_repeat_count(command):
        for _ in range(code.repeat):
            timings.extend(frame)
    return {
        "timings_us": timings,
        "carrier_hz": int(command.modulation),
        "protocol": code.protocol,
        "protocol_name": code.protocol_name,
        "bits": code.bits,
        "repeat": code.repeat,
    }
