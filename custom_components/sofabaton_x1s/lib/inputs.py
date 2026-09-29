"""Structured builder + parser for the family-0x46 inputs page.

The inputs page is what the hub stores when the user has configured a
device's "input" buttons (HDMI 1, HDMI 2, Roku, etc.) on the remote.
It carries one entry per configured input plus a fixed trailing region
that captures four control-key bindings (input list, up, down,
confirm) and ten favorite-slot rows.

This module is the *single* place that serialises and parses the page.
Earlier revisions of the integration carried three independent
builders -- one for device-create finalize, one for the wifi-device
input-config step, and one for activity-create finalize -- each with a
slightly different layout. They all happened to wire-pass on
all-zero entry sets, then corrupted favorites / confirm slots on any
populated payload. The canonical layout below is what real captures
agree on across the X1 / X1S / X2 product lines.

Layout (described in our own field names)::

    outer wrapper (3 bytes)
      [0]         page-marker (0x01)
      [1..2]      outer page-seq big-endian (single-page = 1)

    body header (8 bytes)
      [0]         body marker (0x01)
      [1..2]      total_pages big-endian
      [3]         device_id
      [4]         source_id_byte    (0x00 for "no inputs configured",
                                     0x01 for direct-inputs, 0x02 for
                                     "no input switching", etc.)
      [5]         entry_count       (== len(entries))
      [6]         flag_a            (start position; usually 0)
      [7]         flag_b            (restart position; usually 0)

    entry region (entry_count * stride)
      X1 stride 27:
        [0]       key_id            (1-byte command id)
        [1..6]    fid               (6-byte big-endian opaque id)
        [7..26]   label             (20 bytes, ASCII, null-padded)
      X1S/X2 stride 48:
        [0]       key_id
        [1..6]    fid
        [7]       ordinal           (1-based position, redundant with
                                     entry index but emitted on the wire)
        [8..47]   label             (40 bytes, UTF-16BE, null-padded)

    trailing region (107 bytes total)
      4 control-key rows (9 bytes each = 36)
        input_list, input_up, input_down, input_confirm
      10 favorite rows (7 bytes each = 70)
        opaque per-row payload; structured fields are not yet
        decoded (Phase 4 confirms the layout against a capture)
      1 state byte

    body checksum (1 byte, == sum(body[:-1]) & 0xFF)

The total page is therefore ``3 + 8 + entry_count*stride + 107 + 1``
bytes. Bodies that exceed the per-page chunk limit are split by the
existing paging helper at the call site, which re-uses the
``total_pages`` written into the body header here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Final, Sequence

from .wire_schema import InputEntryLayout, paged_write_total_pages, schema_for


#: Width of the trailing region in bytes: four control-key rows + ten
#: favorite rows + one state byte. Identical across hub variants.
_TRAILING_CONTROL_KEY_ROW_LEN: Final[int] = 9
_TRAILING_CONTROL_KEY_ROWS: Final[int] = 4
_TRAILING_FAVORITE_ROW_LEN: Final[int] = 7
_TRAILING_FAVORITE_ROWS: Final[int] = 10
_TRAILING_REGION_LEN: Final[int] = (
    _TRAILING_CONTROL_KEY_ROWS * _TRAILING_CONTROL_KEY_ROW_LEN
    + _TRAILING_FAVORITE_ROWS * _TRAILING_FAVORITE_ROW_LEN
    + 1  # state byte
)

assert _TRAILING_REGION_LEN == 107

#: Length of the body header (marker through flag_b). Caller-visible so
#: the parser can re-use it without re-counting fields.
INPUTS_BODY_HEADER_LEN: Final[int] = 8

#: Length of the per-page outer wrapper that prefixes every family-0x46
#: page on the wire (page marker + 2-byte sequence number).
INPUTS_OUTER_WRAPPER_LEN: Final[int] = 3



# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass(slots=True, frozen=True)
class InputEntry:
    """One row in the inputs entry region.

    ``ordinal`` is the 1-based position of this entry within the list.
    It is redundant with the entry's index on X1 (where it is omitted
    from the wire layout), but the X1S/X2 stride dedicates a byte to
    it. The dataclass carries it on both lines so a round-trip stays
    lossless.
    """

    key_id: int
    fid: int  # 48-bit big-endian on the wire
    ordinal: int = 0
    label: str = ""

    def __post_init__(self) -> None:
        if not 0 <= self.key_id <= 0xFF:
            raise ValueError(f"InputEntry.key_id out of byte range: {self.key_id}")
        if not 0 <= self.fid < (1 << 48):
            raise ValueError(f"InputEntry.fid out of 48-bit range: {self.fid}")
        if not 0 <= self.ordinal <= 0xFF:
            raise ValueError(f"InputEntry.ordinal out of byte range: {self.ordinal}")


@dataclass(slots=True, frozen=True)
class ControlKeyBlock:
    """Four 9-byte control-key rows that follow the entry region.

    Each row is an opaque key-binding descriptor; this module does not
    decode the internal structure. Pass ``b""`` for an unbound slot
    (it gets zero-padded to 9 bytes on serialisation).
    """

    input_list: bytes = b""
    input_up: bytes = b""
    input_down: bytes = b""
    input_confirm: bytes = b""

    def __post_init__(self) -> None:
        for name, value in (
            ("input_list", self.input_list),
            ("input_up", self.input_up),
            ("input_down", self.input_down),
            ("input_confirm", self.input_confirm),
        ):
            if len(value) > _TRAILING_CONTROL_KEY_ROW_LEN:
                raise ValueError(
                    f"ControlKeyBlock.{name} exceeds "
                    f"{_TRAILING_CONTROL_KEY_ROW_LEN} bytes: {len(value)}"
                )


@dataclass(slots=True, frozen=True)
class FavoriteSlot:
    """One 7-byte favorite-slot row in the trailing region.

    The structured field layout inside the 7 bytes has not been
    confirmed yet against a real capture; that is a Phase 4 audit
    target. Until then this dataclass exposes the raw bytes so callers
    that already hold a captured slot can round-trip it unchanged, and
    callers that just want to seed an empty page can omit favorites
    entirely.
    """

    payload: bytes = b""

    def __post_init__(self) -> None:
        if len(self.payload) > _TRAILING_FAVORITE_ROW_LEN:
            raise ValueError(
                f"FavoriteSlot.payload exceeds "
                f"{_TRAILING_FAVORITE_ROW_LEN} bytes: {len(self.payload)}"
            )


@dataclass(slots=True, frozen=True)
class InputsRecord:
    """Parsed view of one family-0x46 inputs page (or paged burst).

    Mirrors the builder's input set so ``build_inputs_write(**fields(record))``
    reconstructs an equivalent payload.
    """

    device_id: int
    source_id_byte: int
    flag_a: int
    flag_b: int
    state_byte: int
    entries: tuple[InputEntry, ...] = ()
    control_keys: ControlKeyBlock = field(default_factory=ControlKeyBlock)
    favorites: tuple[FavoriteSlot, ...] = ()


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def _encode_label(label: str, *, slot_len: int, encoding: str) -> bytes:
    raw = label.encode(encoding, errors="ignore")
    if len(raw) > slot_len:
        raw = raw[:slot_len]
    return raw + b"\x00" * (slot_len - len(raw))


def _encode_entry(entry: InputEntry, *, layout: InputEntryLayout, stride: int) -> bytes:
    head = bytes([entry.key_id & 0xFF]) + entry.fid.to_bytes(6, "big")
    if layout is InputEntryLayout.NARROW_ASCII:
        # X1: 27-byte stride; no ordinal byte; 20-byte ASCII label.
        label_slot = _encode_label(entry.label, slot_len=20, encoding="ascii")
        row = head + label_slot
    else:
        # X1S/X2: 48-byte stride; explicit 1-byte ordinal; 40-byte
        # UTF-16BE label slot.
        label_slot = _encode_label(entry.label, slot_len=40, encoding="utf-16-be")
        row = head + bytes([entry.ordinal & 0xFF]) + label_slot
    if len(row) != stride:
        raise AssertionError(
            f"inputs entry encoding produced {len(row)} bytes; expected {stride}"
        )
    return row


def _encode_control_keys(block: ControlKeyBlock) -> bytes:
    def pad(value: bytes) -> bytes:
        return value + b"\x00" * (_TRAILING_CONTROL_KEY_ROW_LEN - len(value))

    return (
        pad(block.input_list)
        + pad(block.input_up)
        + pad(block.input_down)
        + pad(block.input_confirm)
    )


def _encode_favorites(favorites: Sequence[FavoriteSlot]) -> bytes:
    if len(favorites) > _TRAILING_FAVORITE_ROWS:
        raise ValueError(
            f"favorites exceeds the {_TRAILING_FAVORITE_ROWS}-slot capacity: "
            f"{len(favorites)}"
        )
    region = bytearray(_TRAILING_FAVORITE_ROWS * _TRAILING_FAVORITE_ROW_LEN)
    for idx, slot in enumerate(favorites):
        start = idx * _TRAILING_FAVORITE_ROW_LEN
        region[start : start + len(slot.payload)] = slot.payload
    return bytes(region)


def build_inputs_write(
    *,
    hub_version: str,
    device_id: int,
    entries: Sequence[InputEntry] = (),
    source_id_byte: int = 0x01,
    flag_a: int = 0x00,
    flag_b: int = 0x00,
    control_keys: ControlKeyBlock | None = None,
    favorites: Sequence[FavoriteSlot] | None = None,
    state_byte: int = 0x00,
) -> bytes:
    """Serialise one family-0x46 inputs page.

    Returns the canonical outer-wrapped form ``[0x01][outer_seq_be] +
    body``; bodies that exceed the per-page chunk limit will still be
    re-split by the paging helper at the call site, which honours the
    ``total_pages`` value written into the body header below.

    ``hub_version`` must be a known variant (``HUB_VERSION_X1`` /
    ``HUB_VERSION_X1S`` / ``HUB_VERSION_X2``); unknown values raise
    ``ValueError`` via :func:`schema_for`.

    ``source_id_byte`` defaults to ``0x01`` (direct-inputs) -- pass
    ``0x00`` to emit a "no inputs configured" page (``entries`` must
    be empty in that case).
    """

    if not 0 <= device_id <= 0xFF:
        raise ValueError(f"device_id out of byte range: {device_id}")
    if not 0 <= source_id_byte <= 0xFF:
        raise ValueError(f"source_id_byte out of byte range: {source_id_byte}")
    if not 0 <= flag_a <= 0xFF:
        raise ValueError(f"flag_a out of byte range: {flag_a}")
    if not 0 <= flag_b <= 0xFF:
        raise ValueError(f"flag_b out of byte range: {flag_b}")
    if not 0 <= state_byte <= 0xFF:
        raise ValueError(f"state_byte out of byte range: {state_byte}")
    if len(entries) > 0xFF:
        raise ValueError(
            f"entries exceeds 1-byte entry_count capacity: {len(entries)}"
        )

    schema = schema_for(hub_version)
    stride = schema.input_entry_stride
    layout = schema.input_entry_layout

    entry_region = bytearray()
    for entry in entries:
        entry_region.extend(_encode_entry(entry, layout=layout, stride=stride))

    trailing = _encode_control_keys(control_keys or ControlKeyBlock())
    trailing += _encode_favorites(favorites or ())
    trailing += bytes([state_byte & 0xFF])
    if len(trailing) != _TRAILING_REGION_LEN:
        raise AssertionError(
            f"inputs trailing region produced {len(trailing)} bytes; "
            f"expected {_TRAILING_REGION_LEN}"
        )

    # Assemble the inner body with a zero in the checksum slot, fix up
    # total_pages, then compute the checksum over everything-but-itself.
    body = bytearray()
    body.append(0x01)                          # body marker
    body.extend(b"\x00\x00")                   # total_pages placeholder
    body.append(device_id & 0xFF)
    body.append(source_id_byte & 0xFF)
    body.append(len(entries) & 0xFF)
    body.append(flag_a & 0xFF)
    body.append(flag_b & 0xFF)
    body.extend(entry_region)
    body.extend(trailing)
    body.append(0x00)                          # checksum slot

    total_pages = paged_write_total_pages(len(body))
    body[1:3] = (total_pages & 0xFFFF).to_bytes(2, "big")
    body[-1] = sum(body[:-1]) & 0xFF

    # Outer wrapper is single-page from this builder's perspective; the
    # paging helper re-numbers the outer sequence when it chunks the
    # body. We emit seq=1 here so the unpaged path is byte-correct.
    return bytes([0x01, 0x00, 0x01]) + bytes(body)


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


def _decode_label(slot: bytes, *, encoding: str) -> str:
    raw = slot
    if encoding == "utf-16-be" and len(raw) % 2:
        raw = raw[:-1]
    try:
        decoded = raw.decode(encoding, errors="ignore")
    except Exception:
        decoded = ""
    return decoded.rstrip("\x00").strip()


def _decode_entry(row: bytes, *, layout: InputEntryLayout) -> InputEntry:
    key_id = row[0]
    fid = int.from_bytes(row[1:7], "big")
    if layout is InputEntryLayout.NARROW_ASCII:
        label = _decode_label(row[7:27], encoding="ascii")
        return InputEntry(key_id=key_id, fid=fid, ordinal=0, label=label)
    ordinal = row[7]
    label = _decode_label(row[8:48], encoding="utf-16-be")
    return InputEntry(key_id=key_id, fid=fid, ordinal=ordinal, label=label)


def _decode_control_keys(region: bytes) -> ControlKeyBlock:
    rl = _TRAILING_CONTROL_KEY_ROW_LEN
    return ControlKeyBlock(
        input_list=bytes(region[0 * rl : 1 * rl]),
        input_up=bytes(region[1 * rl : 2 * rl]),
        input_down=bytes(region[2 * rl : 3 * rl]),
        input_confirm=bytes(region[3 * rl : 4 * rl]),
    )


def _decode_favorites(region: bytes) -> tuple[FavoriteSlot, ...]:
    rl = _TRAILING_FAVORITE_ROW_LEN
    return tuple(
        FavoriteSlot(payload=bytes(region[i * rl : (i + 1) * rl]))
        for i in range(_TRAILING_FAVORITE_ROWS)
    )


def inputs_burst_complete(payloads: Sequence[bytes], *, hub_version: str) -> bool:
    """False while the burst lacks entry bytes its header declares.

    Frames arrive whole, so a burst can only be short by whole pages: one
    still in flight when the reader's idle window closed (a retransmitted
    segment on Wi-Fi). Without a header there is nothing to wait for.
    """

    if not payloads:
        return True
    page1 = payloads[0]
    header_offset = INPUTS_OUTER_WRAPPER_LEN
    if len(page1) < header_offset + INPUTS_BODY_HEADER_LEN:
        return True
    entry_count = page1[header_offset + 5]
    body_len = len(page1) - header_offset - INPUTS_BODY_HEADER_LEN + sum(
        max(0, len(page) - INPUTS_OUTER_WRAPPER_LEN) for page in payloads[1:]
    )
    return body_len >= entry_count * schema_for(hub_version).input_entry_stride


def parse_inputs_burst(payloads: Sequence[bytes], *, hub_version: str) -> InputsRecord:
    """Decode an accumulated family-0x46 burst into an :class:`InputsRecord`.

    ``payloads`` is the list of per-page payloads returned by the
    burst assembler (page 1 first). The function stitches the body
    bytes back together, then walks the entry region and trailing
    region using the per-variant stride from :func:`schema_for`.

    Returns an empty record (``entries == ()``) when the input list is
    too short to carry even the body header. The function never
    raises on truncated content -- the burst-completion check sits at
    a higher layer and decides whether to retry or accept partial
    data.
    """

    if not payloads:
        return InputsRecord(
            device_id=0,
            source_id_byte=0,
            flag_a=0,
            flag_b=0,
            state_byte=0,
        )

    page1 = payloads[0]
    header_offset = INPUTS_OUTER_WRAPPER_LEN
    if len(page1) < header_offset + INPUTS_BODY_HEADER_LEN:
        return InputsRecord(
            device_id=0,
            source_id_byte=0,
            flag_a=0,
            flag_b=0,
            state_byte=0,
        )

    header = page1[header_offset : header_offset + INPUTS_BODY_HEADER_LEN]
    device_id = header[3]
    source_id_byte = header[4]
    entry_count = header[5]
    flag_a = header[6]
    flag_b = header[7]

    # Stitch the body bytes that follow the header on page 1 with the
    # continuation bytes that follow each subsequent page's 3-byte
    # outer wrapper.
    body_after_header = bytearray()
    body_after_header.extend(page1[header_offset + INPUTS_BODY_HEADER_LEN :])
    for page in payloads[1:]:
        if len(page) <= INPUTS_OUTER_WRAPPER_LEN:
            continue
        body_after_header.extend(page[INPUTS_OUTER_WRAPPER_LEN:])

    schema = schema_for(hub_version)
    stride = schema.input_entry_stride
    layout = schema.input_entry_layout

    entries: list[InputEntry] = []
    cursor = 0
    for _ in range(entry_count):
        chunk = body_after_header[cursor : cursor + stride]
        if len(chunk) < stride:
            break
        if chunk[0] == 0x00:
            # Defensive guard: real captures never emit a zero key_id in
            # the middle of the entry region; treat as end-of-list.
            break
        entries.append(_decode_entry(bytes(chunk), layout=layout))
        cursor += stride

    # The trailing region starts immediately after the entry region.
    # The last body byte before checksum is the state byte; the 107th
    # byte from the end (i.e. the start of the trailing region) is the
    # first control-key row. We slice from the end so trailing slack
    # bytes (page padding, hub-emitted zeros) don't shift the offsets.
    trailing_end = len(body_after_header) - 1  # excludes checksum
    trailing_start = trailing_end - _TRAILING_REGION_LEN
    if trailing_start < cursor:
        # Burst was truncated below the trailing region; surface what
        # we have without inventing zero defaults.
        return InputsRecord(
            device_id=device_id,
            source_id_byte=source_id_byte,
            flag_a=flag_a,
            flag_b=flag_b,
            state_byte=0,
            entries=tuple(entries),
        )

    trailing = bytes(body_after_header[trailing_start:trailing_end])
    control_keys = _decode_control_keys(trailing[: 4 * _TRAILING_CONTROL_KEY_ROW_LEN])
    favorites_region = trailing[
        4 * _TRAILING_CONTROL_KEY_ROW_LEN : 4 * _TRAILING_CONTROL_KEY_ROW_LEN
        + _TRAILING_FAVORITE_ROWS * _TRAILING_FAVORITE_ROW_LEN
    ]
    favorites = _decode_favorites(favorites_region)
    state_byte = trailing[-1]

    return InputsRecord(
        device_id=device_id,
        source_id_byte=source_id_byte,
        flag_a=flag_a,
        flag_b=flag_b,
        state_byte=state_byte,
        entries=tuple(entries),
        control_keys=control_keys,
        favorites=favorites,
    )


__all__ = [
    "ControlKeyBlock",
    "FavoriteSlot",
    "INPUTS_BODY_HEADER_LEN",
    "INPUTS_OUTER_WRAPPER_LEN",
    "InputEntry",
    "InputsRecord",
    "build_inputs_write",
    "inputs_burst_complete",
    "parse_inputs_burst",
]
