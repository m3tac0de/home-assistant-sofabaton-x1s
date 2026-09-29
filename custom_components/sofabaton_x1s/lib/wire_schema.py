"""Per-variant wire-format schema for the three hub firmware lines.

The hub speaks the same opcode set across the X1, X1S and X2 product
lines, but a handful of record-level shape choices differ between
"narrow" hubs (X1: ASCII labels, 30-byte name slots) and "wide" hubs
(X1S/X2: UTF-16BE labels, 60-byte name slots, larger input-entry
stride). This module is the *single* place where those per-variant
numeric choices are declared.

Every builder and parser in the integration that needs a variant
decision reads it from :func:`schema_for`. Callers never sniff payload
bytes to *decide* which variant they are talking to; the hub version
is established once during connect (mDNS classification, re-confirmed
by the connect banner) and stored on the proxy. Shape sniffing is
allowed only to *validate* an incoming payload against the expected
variant -- mismatches log a warning and proceed.

If a previously-unknown firmware lineage appears, :func:`schema_for`
raises a ``ValueError`` rather than silently picking a default. The
intent is to fail loudly at the boundary so a future variant cannot
quietly inherit the X1 layout and corrupt writes for the user.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Final, Mapping

from .hub_versions import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2


class InputEntryLayout(Enum):
    """Per-entry layout used inside a family-0x46 inputs page.

    ``NARROW_ASCII`` is the 27-byte stride seen on X1 hubs: a 1-byte
    key id followed by a 6-byte fid and a 20-byte ASCII label slot.

    ``WIDE_UTF16BE`` is the 48-byte stride seen on X1S/X2 hubs: a
    1-byte key id, a 6-byte fid, a 1-byte ordinal and a 40-byte
    UTF-16BE label slot.
    """

    NARROW_ASCII = "narrow_ascii"
    WIDE_UTF16BE = "wide_utf16be"


@dataclass(slots=True, frozen=True)
class WireSchema:
    """All per-variant wire choices for one hub firmware line."""

    #: Width in bytes of the name / brand / tail slots inside a family-0x07
    #: device record body. 30 on X1, 60 on X1S/X2.
    device_slot_width: int

    #: Total length of a device-record body, including the trailing checksum.
    device_body_len: int

    #: Codec used for the name and brand slots. ``"ascii"`` on X1,
    #: ``"utf-16-be"`` on X1S/X2.
    device_label_encoding: str

    #: Per-record stride in an assembled family-0x0E command-record body.
    command_stride: int

    #: Length of the trailing label slot inside one command record.
    command_label_slot_len: int

    #: Codec used for command labels.
    command_label_encoding: str

    #: Length of the trailing label slot inside a family-0x12 macro
    #: region (X1 ASCII / X1S/X2 UTF-16BE).
    macro_label_slot_len: int

    #: Codec used for macro labels.
    macro_label_encoding: str

    #: Per-entry stride inside the family-0x46 inputs entry region.
    input_entry_stride: int

    #: Tag describing per-entry field layout. See :class:`InputEntryLayout`.
    input_entry_layout: InputEntryLayout


def encode_label_slot(text: str, slot_len: int, encoding: str) -> bytes:
    """Encode ``text`` into a fixed-width label slot, zero-padded.

    ``ascii`` drops characters it cannot encode (never a ``?`` stand-in),
    which is what every other label writer and ``hub_command_label`` do.
    ``utf-16-be`` cuts at whole code units and never keeps half of a
    surrogate pair. The one encoder for command and macro labels (CR-L2-14).
    """

    value = str(text or "")
    if encoding.replace("_", "-").lower() in ("utf-16-be", "utf-16be"):
        data = value.encode("utf-16-be")[: slot_len - (slot_len % 2)]
        if len(data) >= 2 and 0xD8 <= data[-2] <= 0xDB:
            data = data[:-2]
    else:
        data = value.encode(encoding, errors="ignore")[:slot_len]
    return data.ljust(slot_len, b"\x00")


_X1_SCHEMA: Final[WireSchema] = WireSchema(
    device_slot_width=30,
    device_body_len=120,
    device_label_encoding="ascii",
    command_stride=40,
    command_label_slot_len=30,
    command_label_encoding="ascii",
    macro_label_slot_len=30,
    macro_label_encoding="ascii",
    input_entry_stride=27,
    input_entry_layout=InputEntryLayout.NARROW_ASCII,
)


_X1S_X2_SCHEMA: Final[WireSchema] = WireSchema(
    device_slot_width=60,
    device_body_len=210,
    device_label_encoding="utf-16-be",
    command_stride=70,
    command_label_slot_len=60,
    command_label_encoding="utf-16-be",
    macro_label_slot_len=60,
    macro_label_encoding="utf-16-be",
    input_entry_stride=48,
    input_entry_layout=InputEntryLayout.WIDE_UTF16BE,
)


SCHEMAS: Final[Mapping[str, WireSchema]] = {
    HUB_VERSION_X1: _X1_SCHEMA,
    HUB_VERSION_X1S: _X1S_X2_SCHEMA,
    HUB_VERSION_X2: _X1S_X2_SCHEMA,
}


def schema_for(hub_version: str) -> WireSchema:
    """Return the :class:`WireSchema` for ``hub_version``.

    Raises :class:`ValueError` if ``hub_version`` is anything other
    than one of the known ``HUB_VERSION_*`` constants. Callers must
    never paper over an unknown variant with a default -- if the
    classification surface produces an unfamiliar value, that is a
    signal that a new firmware lineage exists and the wire layouts
    must be re-derived before writes can be trusted.
    """

    try:
        return SCHEMAS[hub_version]
    except KeyError as exc:
        known = ", ".join(sorted(SCHEMAS))
        raise ValueError(
            f"schema_for: unknown hub_version={hub_version!r}; "
            f"expected one of {known}."
        ) from exc


__all__ = [
    "encode_label_slot",
    "InputEntryLayout",
    "SCHEMAS",
    "WireSchema",
    "schema_for",
]
