"""Helpers for assembling, parsing, and synthesizing command payloads."""

from __future__ import annotations
from dataclasses import dataclass, field
import re
from typing import Any, Dict, Iterable, Iterator, List, Tuple

from .hub_versions import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2
from .wire_schema import schema_for
from .protocol_const import (
    FAMILY_KEYMAP,
    FAMILY_DEVBTNS,
    opcode_family,
    OP_MARKER,
    OP_DEVBTN_SINGLE,
    OP_KEYMAP_CONT,
    OP_KEYMAP_FINAL_X1S,
    OP_KEYMAP_PAGE_X2_C03D,
    OP_KEYMAP_EXTRA,
    OP_KEYMAP_OVERLAY_X1,
    OP_KEYMAP_PAGE_X1_663D,
    OP_KEYMAP_PAGE_X1_AE3D,
    OP_KEYMAP_PAGE_X1_E43D,
    OP_KEYMAP_TBL_A,
    OP_KEYMAP_TBL_B,
    OP_KEYMAP_TBL_C,
    OP_KEYMAP_TBL_D,
    OP_KEYMAP_TBL_E,
    OP_KEYMAP_TBL_F,
    OP_KEYMAP_TBL_G,
)


def _is_devbtn_family(opcode: int) -> bool:
    """Return True if the opcode belongs to the dev-button page family."""

    return opcode_family(opcode) == FAMILY_DEVBTNS


def _is_keymap_family(opcode: int) -> bool:
    """Return True if the opcode belongs to the keymap/button family."""

    return opcode_family(opcode) == FAMILY_KEYMAP


_KEYMAP_HEADER_OPCODES: set[int] = {
    OP_KEYMAP_TBL_A,
    OP_KEYMAP_TBL_B,
    OP_KEYMAP_TBL_C,
    OP_KEYMAP_TBL_D,
    OP_KEYMAP_TBL_E,
    OP_KEYMAP_TBL_F,
    OP_KEYMAP_TBL_G,
    OP_KEYMAP_EXTRA,
}

_KEYMAP_X1_PAGE_OPCODES: set[int] = {
    OP_KEYMAP_PAGE_X1_663D,
    OP_KEYMAP_PAGE_X1_AE3D,
    OP_KEYMAP_PAGE_X1_E43D,
}

_KEYMAP_X1S_PAGE_OPCODES: set[int] = {
    OP_KEYMAP_CONT,
    OP_KEYMAP_PAGE_X2_C03D,
}

@dataclass(slots=True)
class CommandRecord:
    """Structured representation of a single device command label."""

    dev_id: int
    command_id: int
    control: bytes
    label: str
    sort_id: int = 0


@dataclass(slots=True)
class _CommandBurst:
    variant: str | None = None
    total_frames: int | None = None
    total_commands: int | None = None
    frames: Dict[int, bytes] = field(default_factory=dict)

    @property
    def received(self) -> int:
        return len(self.frames)


@dataclass(slots=True, frozen=True)
class CommandBurstFrame:
    """Structured metadata extracted from a family-0x5D command frame."""

    opcode: int
    hub_line: str
    layout_kind: str
    role: str
    frame_no: int
    device_id: int
    data_start: int
    total_frames: int | None = None
    total_commands: int | None = None
    first_command_id: int | None = None
    format_marker: int | None = None

    @property
    def is_header(self) -> bool:
        return self.role == "header"

    @property
    def is_single(self) -> bool:
        return self.role == "single"

    @property
    def is_final(self) -> bool:
        return self.role == "final"


@dataclass(slots=True, frozen=True)
class IrCommandDumpFrame:
    """Structured metadata extracted from raw IR command blob pages."""

    opcode: int
    family: int
    response_index: int
    command_id: int
    page_no: int
    device_id: int | None
    total_commands: int | None
    total_pages: int | None
    format_marker: int | None
    label: str | None

    @property
    def is_page_one(self) -> bool:
        return self.page_no == 1


@dataclass(slots=True)
class _ButtonBurst:
    variant: str | None = None
    total_frames: int | None = None
    total_rows: int | None = None
    frames: Dict[int, bytes] = field(default_factory=dict)

    @property
    def received(self) -> int:
        return len(self.frames)


# ---------------------------------------------------------------------------
# Fixed-width REQ_BUTTONS / keymap record iterator.
#
# Each assembled keymap record is 18 bytes; bursts are walked at fixed stride
# after page assembly.
# ---------------------------------------------------------------------------

#: Size in bytes of one REQ_BUTTONS / keymap record.
KEYMAP_RECORD_SIZE = 18


@dataclass(slots=True, frozen=True)
class KeymapRecord:
    """One 18-byte keymap record from an assembled REQ_BUTTONS concat buffer.

    Field layout (offsets within ``raw``):

    =====  =====================================================================
    Off.   Meaning
    =====  =====================================================================
    0      Activity id (matches the burst's activity).
    1      Button or favorite id. If this value is a known hardware button code
           (``BUTTONNAME_BY_CODE``), the record describes a button-to-command
           binding; otherwise it is interpreted as an activity-favorite slot.
    2      Device id that the bound command targets.
    9      Command id within that device.
    10-17  Optional long-press extension. Present iff::

               raw[10] != 0 and raw[11:15] == b"\\x00\\x00\\x00\\x00"
                              and raw[15] == 0x4E

           When present, ``raw[10]`` is the long-press device id and
           ``raw[17]`` is the long-press command id.
    =====  =====================================================================

    Bytes 3-8, 16 and the slot occupied by the long-press marker when not in
    long-press shape, are not used by the integration. This dataclass exposes
    the raw 18 bytes so callers that need to inspect them retain full access.
    """

    raw: bytes

    @property
    def activity_id(self) -> int:
        return self.raw[0]

    @property
    def button_id(self) -> int:
        return self.raw[1]

    @property
    def device_id(self) -> int:
        return self.raw[2]

    @property
    def command_id(self) -> int:
        return self.raw[9]

    @property
    def has_long_press(self) -> bool:
        return (
            len(self.raw) >= 18
            and self.raw[10] != 0
            and self.raw[11:15] == b"\x00\x00\x00\x00"
            and self.raw[15] == 0x4E
        )

    @property
    def long_press_device_id(self) -> int | None:
        return self.raw[10] if self.has_long_press else None

    @property
    def long_press_command_id(self) -> int | None:
        return self.raw[17] if self.has_long_press else None


def iter_keymap_records(
    concat: bytes,
    *,
    expected_activity_id: int | None = None,
) -> Iterator[KeymapRecord]:
    """Yield :class:`KeymapRecord` objects from an assembled keymap buffer.

    ``concat`` is the post-assembly buffer produced by
    :class:`DeviceButtonAssembler` i.e., the concatenated row stream with
    per-frame transport headers already stripped. The iterator walks the
    buffer in 18-byte strides; trailing bytes shorter than one record are
    ignored.

    When ``expected_activity_id`` is provided, records whose
    :attr:`KeymapRecord.activity_id` does not match are silently skipped.
    The assembler keys bursts by activity id, so mismatches normally only
    occur on malformed firmware data; this guard mirrors the existing
    behavior of ``StateHelpers._parse_keymap_record`` which returns early on
    activity-id mismatch.

    Note this iterator deliberately does **not** emit a padded short-tail
    record for trailing fragments shorter than 18 bytes. The integration has
    historically tolerated such fragments when they look like a valid record
    start; that fallback behavior remains in ``state_helpers`` for now.
    """

    usable = len(concat) - (len(concat) % KEYMAP_RECORD_SIZE)
    for start in range(0, usable, KEYMAP_RECORD_SIZE):
        record = KeymapRecord(raw=bytes(concat[start : start + KEYMAP_RECORD_SIZE]))
        if expected_activity_id is not None and record.activity_id != expected_activity_id:
            continue
        yield record


@dataclass(slots=True, frozen=True)
class ButtonBurstFrame:
    """Structured metadata extracted from a family-0x3D button frame."""

    opcode: int
    hub_line: str
    layout_kind: str
    role: str
    frame_no: int
    activity_id: int | None
    data_start: int
    total_frames: int | None = None
    total_rows: int | None = None
    has_row_data: bool = True

    @property
    def is_header(self) -> bool:
        return self.role == "header"

    @property
    def is_final(self) -> bool:
        return self.role == "final"

    @property
    def is_marker(self) -> bool:
        return self.role == "marker"


# ---------------------------------------------------------------------------
# Fixed-width REQ_COMMANDS record iterator.
#
# Reference layout for an assembled REQ_COMMANDS burst:
#
#     concat = page1_body || page2_body || ... || pageN_body
#       where pageK_body = raw_frame[7 : 7 + (raw_frame[2] - 3)]
#     concat[3] = N (record count)
#     concat[4 + i*stride : 4 + (i+1)*stride] = record i
#
# stride is 40 on X1 (ASCII), 70 on X1S/X2 (UTF-16BE). The label slot lives at
# record-offset 9 with length 30 (X1) or 60 (X1S/X2). Encoding is selected
# from the hub model, not from byte-pattern heuristics.
#
# The integration's existing assembler (`DeviceCommandAssembler`) strips
# `parsed.data_start` bytes per frame before concatenating. For page-1
# headers that's 7, for page-2+ pages it's 3. The 4-byte difference equals
# the page-1 preamble + count byte kept in `concat[0..3]`.
#
# Therefore, when the integration calls the new iterator on its post-assembly
# body, the body already starts at what the app sees as `concat[4]`. The
# record count must be supplied separately (by the caller, who has it as
# `parsed.total_commands`).
# ---------------------------------------------------------------------------


#: Per-record stride in the assembled body. 40 bytes on X1 (ASCII labels),
#: 70 bytes on X1S/X2 (UTF-16BE labels). Mirrored from
#: :mod:`wire_schema` for backwards-compatible external imports.
COMMAND_RECORD_STRIDE_X1 = schema_for(HUB_VERSION_X1).command_stride
COMMAND_RECORD_STRIDE_X1S_X2 = schema_for(HUB_VERSION_X1S).command_stride

#: Per-record byte offsets common to both X1 and X1S/X2 layouts.
COMMAND_RECORD_LABEL_OFFSET = 9
COMMAND_RECORD_LABEL_LEN_X1 = schema_for(HUB_VERSION_X1).command_label_slot_len
COMMAND_RECORD_LABEL_LEN_X1S_X2 = schema_for(HUB_VERSION_X1S).command_label_slot_len

assert COMMAND_RECORD_STRIDE_X1 == 40 and COMMAND_RECORD_STRIDE_X1S_X2 == 70
assert COMMAND_RECORD_LABEL_LEN_X1 == 30 and COMMAND_RECORD_LABEL_LEN_X1S_X2 == 60


def _stride_and_label_len(hub_version: str) -> tuple[int, int, str]:
    """Return (stride, label_len, encoding) for the hub model.

    Thin wrapper over :func:`schema_for`; encoding is the literal
    codec name accepted by ``bytes.decode``. Unknown hub versions
    raise ``ValueError`` via the shared schema.
    """

    schema = schema_for(hub_version)
    return schema.command_stride, schema.command_label_slot_len, schema.command_label_encoding


def _decode_schema_label(label_bytes: bytes, encoding: str) -> str:
    """Decode a fixed-width command label slot.

    The full slot is decoded under the selected encoding, then null padding
    and surrounding whitespace are removed. There is no embedded length
    prefix or terminator scan.
    """

    if encoding == "ascii":
        # ASCII path: decode strict bytes, strip nulls and whitespace.
        try:
            decoded = label_bytes.decode("ascii", errors="ignore")
        except Exception:
            decoded = ""
        return decoded.rstrip("\x00").strip()

    # UTF-16BE path: pad to even length defensively (real slots are always
    # even on X1S/X2, but a malformed fixture could pass an odd length).
    raw = label_bytes
    if len(raw) % 2:
        raw = raw[:-1]
    try:
        decoded = raw.decode("utf-16-be", errors="ignore")
    except Exception:
        decoded = ""
    return decoded.rstrip("\x00").strip()


def iter_command_records_from_assembled(
    body: bytes,
    *,
    count: int,
    dev_id: int,
    hub_version: str,
) -> Iterator[CommandRecord]:
    """Yield :class:`CommandRecord` objects from an assembled REQ_COMMANDS body.

    ``body`` is the post-assembly buffer produced by
    :class:`DeviceCommandAssembler` the per-frame transport headers and the
    page-1 preamble (page metadata + count byte) are already stripped, so
    ``body[0]`` is the first byte of the first record.

    ``count`` is required; it should be the value the parser captured in
    :attr:`CommandBurstFrame.total_commands` (the count byte from the
    assembled header). Inference from ``len(body) // stride`` is deliberately
    not done: a body that contains trailing padding or has been truncated
    mid-record would silently miscount.

    ``hub_version`` selects stride (40 X1 / 70 X1S/X2) and label encoding
    (ASCII X1 / UTF-16BE X1S/X2). Unknown hub versions raise ``ValueError``.

    Records beyond what ``body`` can supply are silently skipped this is
    a tolerant choice for truncated-burst scenarios; the caller can detect
    by comparing returned record count to the requested ``count``.

    Per-record layout (offsets within the 40 or 70 byte stride):

    - ``[0]``         device id
    - ``[1]``         command id
    - ``[2]``         code type / format marker
    - ``[3..8]``      fid (6 bytes; treated as opaque control bytes here)
    - ``[9..label_end]``  label slot (30 or 60 bytes)
    - ``[stride-1]``  sort id (== command id on observed fixtures)

    The yielded :class:`CommandRecord` retains the existing field set:
    ``dev_id`` is taken from record byte 0, ``command_id`` from byte 1, and
    ``control`` is the 7 bytes at record[2..9] for consistency with existing
    CommandRecord callers.
    """

    stride, label_len, encoding = _stride_and_label_len(hub_version)
    label_end = COMMAND_RECORD_LABEL_OFFSET + label_len

    for i in range(count):
        start = i * stride
        end = start + stride
        if end > len(body):
            return  # truncated body; caller can detect via returned-count diff
        record = body[start:end]

        label_bytes = record[COMMAND_RECORD_LABEL_OFFSET:label_end]
        label = _decode_schema_label(label_bytes, encoding)

        yield CommandRecord(
            dev_id=record[0],
            command_id=record[1],
            control=bytes(record[2 : COMMAND_RECORD_LABEL_OFFSET]),
            label=label,
            sort_id=record[stride - 1] & 0xFF,
        )


def _button_hub_line(hub_version: str) -> str:
    """Return the burst-frame ``hub_line`` tag for the hub variant.

    Validates ``hub_version`` against the shared schema so unknown
    values fail at the call site rather than silently falling back to
    a shape-sniffing heuristic.
    """

    schema_for(hub_version)
    return "x1" if hub_version == HUB_VERSION_X1 else "x1s_x2"


def _command_hub_line(hub_version: str) -> str:
    """Return the burst-frame ``hub_line`` tag for the hub variant."""

    schema_for(hub_version)
    return "x1" if hub_version == HUB_VERSION_X1 else "x1s_x2"


def parse_button_burst_frame(
    opcode: int,
    raw_frame: bytes,
    *,
    hub_version: str,
) -> ButtonBurstFrame | None:
    """Return parsed family metadata for a button-burst frame.

    REQ_BUTTONS pages assemble into a counted fixed-width row stream. Marker
    variants are treated as ordinary pages for assembly purposes, so the low
    byte identifies the family while the high byte remains payload-length
    metadata only.
    """

    if len(raw_frame) < 7:
        return None

    payload = raw_frame[4:-1]
    if len(payload) < 3 or not _is_keymap_family(opcode):
        return None

    frame_no = payload[2]
    hinted_line = _button_hub_line(hub_version)
    total_frames = int.from_bytes(payload[4:6], "big") if len(payload) >= 6 else None
    if total_frames == 0:
        total_frames = None
    total_rows = payload[6] if frame_no == 1 and len(payload) > 6 and payload[6] > 0 else None

    if frame_no == 1 and total_frames is not None and total_frames > 0 and len(payload) > 7:
        layout_kind = "header"
        if opcode == OP_KEYMAP_OVERLAY_X1 or (hinted_line == "x1" and total_frames == 1):
            layout_kind = "x1_overlay"
        return ButtonBurstFrame(
            opcode=opcode,
            hub_line=hinted_line,
            layout_kind=layout_kind,
            role="header",
            frame_no=frame_no,
            activity_id=payload[7],
            data_start=7,
            total_frames=total_frames,
            total_rows=total_rows,
            has_row_data=len(payload) > 7,
        )

    if opcode == OP_MARKER:
        return ButtonBurstFrame(
            opcode=opcode,
            hub_line="x1s_x2" if hinted_line != "x1" else "x1",
            layout_kind="x1s_marker",
            role="marker",
            frame_no=frame_no,
            activity_id=None,
            data_start=len(payload),
            total_frames=total_frames if total_frames and total_frames > 0 else None,
            total_rows=total_rows,
            has_row_data=False,
        )

    stream = payload[3:] if len(payload) > 3 else b""
    if stream and len(stream) < 18:
        inferred_line = hinted_line

        role = "final" if total_frames is not None and frame_no >= total_frames else "page"
        layout_kind = "page"
        if inferred_line == "x1":
            layout_kind = "x1_page"
        elif inferred_line == "x1s_x2":
            layout_kind = "x1s_final" if role == "final" else "x1s_page"

        return ButtonBurstFrame(
            opcode=opcode,
            hub_line=inferred_line,
            layout_kind=layout_kind,
            role=role,
            frame_no=frame_no,
            activity_id=None,
            data_start=3,
            total_frames=total_frames,
            total_rows=None,
            has_row_data=True,
        )

    # Continuation pages carry only row bytes; the activity id was established
    # by the page-1 header and is held by the burst assembler. Do not infer it
    # from page-2+ row bytes -- inner record bytes can accidentally match a
    # row-start shape and route the page to the wrong burst.
    inferred_line = hinted_line
    if inferred_line == "shared":
        inferred_line = "x1s_x2" if frame_no > 1 else "shared"

    role = "final" if total_frames is not None and frame_no >= total_frames else "page"
    layout_kind = "page"
    if inferred_line == "x1":
        layout_kind = "x1_page"
    elif inferred_line == "x1s_x2":
        layout_kind = "x1s_final" if role == "final" else "x1s_page"

    return ButtonBurstFrame(
        opcode=opcode,
        hub_line=inferred_line,
        layout_kind=layout_kind,
        role=role,
        frame_no=frame_no,
        activity_id=None,
        data_start=3,
        total_frames=total_frames if total_frames and total_frames > 0 else None,
        total_rows=total_rows,
        has_row_data=bool(stream),
    )


def parse_command_burst_frame(
    opcode: int,
    raw_frame: bytes,
    *,
    hub_version: str,
) -> CommandBurstFrame | None:
    """Return parsed family metadata for a command-burst frame.

    REQ_COMMANDS pages assemble into counted fixed-width records: 40-byte
    rows on X1 and 70-byte rows on X1S/X2, with the label slot beginning at
    offset 9. Labels are decoded from the hub model's expected encoding and
    ``0xFF`` bytes inside the slot are treated as data, not delimiters.

    The existing magic-byte sniffing below detects per-frame layout variants.
    A future fully post-assembly path can replace that heuristic with the
    fixed-width record walk used elsewhere in the module.
    """

    if len(raw_frame) < 7:
        return None

    payload = raw_frame[4:-1]
    if len(payload) < 4:
        return None

    hinted_line = _command_hub_line(hub_version)
    frame_no = payload[2]

    is_input_refresh_layout = (
        opcode_family(opcode) == 0x0D
        and len(payload) > 8
        and payload[:6] == b"\x01\x00\x01\x01\x00\x01"
    )
    is_prefixed_single_layout = (
        opcode_family(opcode) == FAMILY_DEVBTNS
        and len(payload) > 9
        and payload[:6] == b"\x01\x00\x01\x01\x00\x01"
        and payload[6] == 0x01
    )
    is_single_layout = (
        opcode == OP_DEVBTN_SINGLE
        or (
            opcode_family(opcode) == 0x0D
            and len(payload) > 7
            and payload[:6] == b"\x01\x00\x01\x01\x00\x01"
        )
        or is_prefixed_single_layout
    )
    if is_single_layout:
        device_id = payload[3]
        layout_kind = "single"
        data_start = 7
        first_command_id = payload[8] if len(payload) > 8 else None
        format_marker = payload[9] if len(payload) > 9 else None
        if payload[:6] == b"\x01\x00\x01\x01\x00\x01" and len(payload) > 7:
            device_id = payload[7]
        if is_input_refresh_layout:
            # 0x020C WiFi/input-config refresh replies reuse the single-frame
            # envelope, but the payload fields differ from normal REQ_COMMANDS:
            #   <dev_id> <slot_id> <fmt> ...
            device_id = payload[6]
            layout_kind = "input_config_refresh"
            data_start = 8
            first_command_id = payload[7] if len(payload) > 7 else None
            format_marker = payload[8] if len(payload) > 8 else None
        return CommandBurstFrame(
            opcode=opcode,
            hub_line=hinted_line,
            layout_kind=layout_kind,
            role="single",
            frame_no=frame_no,
            device_id=device_id,
            total_frames=1,
            data_start=data_start,
            first_command_id=first_command_id,
            format_marker=format_marker,
        )

    if not _is_devbtn_family(opcode):
        return None

    if payload[:2] != b"\x01\x00":
        return None

    if frame_no == 1 and len(payload) > 7 and payload[4] == 0x00:
        layout_kind = "shared_classic"
        if hinted_line == "x1":
            layout_kind = "x1_classic"
        elif hinted_line == "x1s_x2":
            layout_kind = "x1s_x2"
        return CommandBurstFrame(
            opcode=opcode,
            hub_line=hinted_line,
            layout_kind=layout_kind,
            role="header",
            frame_no=frame_no,
            device_id=payload[7],
            total_frames=int.from_bytes(payload[4:6], "big"),
            total_commands=payload[6],
            data_start=7,
            first_command_id=payload[8] if len(payload) > 8 else None,
            format_marker=payload[9] if len(payload) > 9 else None,
        )

    if frame_no == 1 and len(payload) > 8:
        return CommandBurstFrame(
            opcode=opcode,
            hub_line="x1" if hinted_line == "shared" else hinted_line,
            layout_kind="x1_wifi",
            role="header",
            frame_no=frame_no,
            device_id=payload[6],
            total_frames=payload[4],
            total_commands=payload[5],
            data_start=6,
            first_command_id=payload[7] if len(payload) > 7 else None,
            format_marker=payload[8] if len(payload) > 8 else None,
        )

    role = "page"
    return CommandBurstFrame(
        opcode=opcode,
        hub_line=hinted_line,
        layout_kind="x1s_x2" if hinted_line == "x1s_x2" else ("x1_page" if hinted_line == "x1" else "page"),
        role=role,
        frame_no=frame_no,
        device_id=payload[3],
        data_start=3,
        first_command_id=payload[4] if len(payload) > 4 else None,
        format_marker=payload[5] if len(payload) > 5 else None,
    )


def _looks_like_ir_dump_opcode(opcode: int) -> bool:
    return opcode_family(opcode) in (0x0D, 0x0E)


def _looks_reasonable_ir_dump_label(text: str) -> bool:
    stripped = str(text or "").strip()
    if not stripped or len(stripped) > 40:
        return False
    if sum(ch.isalnum() for ch in stripped) == 0:
        return False
    return all(ch.isprintable() and ch not in "\r\n\t" for ch in stripped)


_IR_DUMP_LABEL_START = 15
_IR_DUMP_PAGE_ONE_BLOB_START_X1 = 45
_IR_DUMP_PAGE_ONE_BLOB_START_X1S = 75
_IR_DUMP_PAGE_ONE_BLOB_PREFIXES = (
    b"\x01\x20\x00\x10",
    b"\x01\x30\x00\x10",
    b"\x03\x20\x00\x00",
    b"\x01\x00\x00\x00",
)


def _sum8(data: bytes) -> int:
    return sum(data) & 0xFF


def looks_like_descriptive_play_blob(blob: bytes) -> bool:
    """Return True for human-readable protocol-descriptor replay blobs.

    Descriptor library_data layout::

        blob[0..1] = declared length BE (>= 1, == len of the ASCII descriptor)
        blob[2..5] = 0x00 0x00 0x11 0x00
        blob[6..7] = 0x94 0x70
        blob[8..]  = ASCII descriptor starting with "P:" + four trailing nulls
    """

    return (
        len(blob) >= 14
        and blob[2:6] == b"\x00\x00\x11\x00"
        and blob[6:8] == b"\x94\x70"
        and blob[8:10] == b"P:"
    )


def descriptive_play_blob_text(blob: bytes) -> str | None:
    """Return the human-readable descriptor text from a descriptive blob body."""

    if not looks_like_descriptive_play_blob(blob):
        return None
    declared_len = int.from_bytes(blob[0:2], "big")
    if declared_len <= 0:
        return None
    text_end = 8 + declared_len
    if text_end > len(blob):
        return None
    try:
        return blob[8:text_end].decode("ascii").rstrip("\x00")
    except UnicodeDecodeError:
        return None


def split_play_blob_tail(blob: bytes) -> tuple[bytes, int]:
    """Return ``(blob_body, replay_tail_checksum)`` for a stored replay blob."""

    if not isinstance(blob, (bytes, bytearray)) or len(blob) < 2:
        raise ValueError("blob is too short to contain a replay-tail checksum")
    data = bytes(blob)
    return data[:-1], data[-1]


def _parse_descriptor_fields(descriptor: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for token in descriptor.split():
        if ":" not in token:
            continue
        key, value = token.split(":", 1)
        if key:
            fields[key] = value
    return fields


def _canonicalize_denonk_descriptor(descriptor: str) -> str:
    fields = _parse_descriptor_fields(descriptor)
    if fields.get("P") != "DenonK":
        return descriptor
    if "CHECKSUM" in fields:
        return descriptor

    missing = [key for key in ("R", "C0", "C1", "C2", "D", "S", "F") if key not in fields]
    if missing:
        raise ValueError(f"DenonK descriptor is missing required field(s): {', '.join(missing)}")

    try:
        carrier_hz = int(fields["R"], 10)
        c0 = int(fields["C0"], 10)
        c1 = int(fields["C1"], 10)
        c2 = int(fields["C2"], 10)
        device = int(fields["D"], 10)
        subdevice = int(fields["S"], 10)
        function = int(fields["F"], 10)
    except ValueError as err:
        raise ValueError(f"DenonK descriptor fields must be decimal integers: {err}") from err

    checksum = denonk_checksum(c0, c1, c2, device, subdevice, function)
    return (
        f"P:DenonK "
        f"R:{carrier_hz} "
        f"C0:{c0} C1:{c1} C2:{c2} "
        f"D:{device} S:{subdevice} F:{function} "
        f"CHECKSUM:{checksum}"
    )


def build_descriptive_ir_blob_body(descriptor: str) -> bytes:
    """Build a descriptive replay-blob body without the final replay-tail byte.

    Synthesis path for the Test / Save Blob flows: normalizes
    whitespace, validates the ``P:`` prefix, canonicalizes DenonK
    descriptors (which adds a ``CHECKSUM:`` field when missing), then
    emits the canonical byte layout via
    :func:`blob_decoders.render_ir_descriptive_blob_body` followed by
    the writer's four trailing ``0x00`` bytes.

    Round-trip callers MUST NOT go through this entry point because
    the DenonK canonicalization mutates the descriptor and would
    break byte-for-byte round-trip equality with a captured blob;
    the backup-decoder round-trip path
    (:func:`blob_decoders._encode_descriptive_ir`) uses
    ``render_ir_descriptive_blob_body`` directly and re-emits whatever
    trailer was captured.
    """

    text = re.sub(r"\s+", " ", str(descriptor or "").strip())
    if not text:
        raise ValueError("descriptor text is required")
    if not text.startswith("P:"):
        raise ValueError("descriptor text must start with 'P:'")

    text = _canonicalize_denonk_descriptor(text)
    # Import locally to avoid a circular import at module load time:
    # blob_decoders only imports from protocol_const, but commands is
    # a heavy dependency that some early-loaded modules pull in.
    from .blob_decoders import render_ir_descriptive_blob_body

    return render_ir_descriptive_blob_body(text) + b"\x00\x00\x00\x00"


def denonk_checksum(c0: int, c1: int, c2: int, d: int, s: int, f: int) -> int:
    """Return the observed Sofabaton ``CHECKSUM:`` value for ``P:DenonK`` blobs.

    The checksum is not the transport/frame checksum and is distinct from the
    trailing replay-tail byte. It is derived from the protocol parameter nibbles
    in the same order Sofabaton serializes them into its text descriptor.
    """

    values = (c0, c1, c2, d, s, f)
    if any(v < 0 for v in values):
        raise ValueError("DenonK fields must be non-negative")
    if any(v > 0xFF for v in (c0, c1, c2, d, s)):
        raise ValueError("DenonK C0/C1/C2/D/S fields must fit in one byte")
    if f > 0xFFF:
        raise ValueError("DenonK function must fit in 12 bits")

    nibbles = [
        c0 & 0x0F,
        (c0 >> 4) & 0x0F,
        c1 & 0x0F,
        (c1 >> 4) & 0x0F,
        c2 & 0x0F,
        d & 0x0F,
        s & 0x0F,
        f & 0x0F,
        (f >> 4) & 0x0F,
        (f >> 8) & 0x0F,
    ]
    parity_even = nibbles[0] ^ nibbles[2] ^ nibbles[4] ^ nibbles[6] ^ nibbles[8]
    parity_odd = nibbles[1] ^ nibbles[3] ^ nibbles[5] ^ nibbles[7] ^ nibbles[9]
    return (((parity_odd << 4) | parity_even) ^ 0x66) & 0xFF


def build_denonk_ir_blob(
    *,
    carrier_hz: int = 37000,
    c0: int = 84,
    c1: int = 50,
    c2: int = 0,
    device: int,
    subdevice: int,
    function: int,
) -> bytes:
    """Build a canonical ``P:DenonK`` Sofabaton descriptor blob body.

    This synthesizes the human-readable one-frame descriptor family observed in
    ``dump_ir_blob`` responses. The returned bytes are the canonical replay
    body expected by ``play_ir_blob``: no outer ``a5 5a`` frame header and no
    final replay-tail checksum byte.
    """

    if carrier_hz <= 0:
        raise ValueError("carrier_hz must be positive")

    embedded_checksum = denonk_checksum(c0, c1, c2, device, subdevice, function)
    descriptor = (
        f"P:DenonK "
        f"R:{carrier_hz} "
        f"C0:{c0} C1:{c1} C2:{c2} "
        f"D:{device} S:{subdevice} F:{function} "
        f"CHECKSUM:{embedded_checksum}"
    )
    return build_descriptive_ir_blob_body(descriptor)


def _page_one_uses_ascii_label_layout(payload: bytes) -> bool:
    """Return True when page 1 uses the compact X1 ASCII label slot."""

    if len(payload) <= _IR_DUMP_LABEL_START:
        return False
    return payload[_IR_DUMP_LABEL_START] != 0


def _ir_dump_page_one_blob_start(payload: bytes) -> int:
    """Return the fixed page-1 blob start for the observed hub layout."""

    if _page_one_uses_ascii_label_layout(payload):
        return _IR_DUMP_PAGE_ONE_BLOB_START_X1

    for prefix in _IR_DUMP_PAGE_ONE_BLOB_PREFIXES:
        idx = payload.find(prefix, _IR_DUMP_LABEL_START)
        if idx != -1:
            return idx

    return _IR_DUMP_PAGE_ONE_BLOB_START_X1S


def extract_ir_dump_blob(payload: bytes, page_no: int) -> bytes | None:
    """Return the IR-specific blob portion of an 0x020C dump page payload."""

    if page_no == 1:
        blob_start = _ir_dump_page_one_blob_start(payload)
        if len(payload) <= blob_start:
            return None
        return payload[blob_start:]

    if page_no >= 2:
        return payload[3:] if len(payload) > 3 else b""

    return None


def extract_ir_dump_label_field(payload: bytes) -> bytes | None:
    """Return the 2-byte metadata field immediately before the page-1 label."""

    return payload[13:15] if len(payload) >= 15 else None


def _extract_ir_dump_label(payload: bytes) -> str | None:
    if len(payload) <= _IR_DUMP_LABEL_START:
        return None

    # Page-1 dump records are structured, not heuristic:
    # - bytes 13..14 are a 2-byte metadata field
    # - byte 15 onward is a fixed-width label slot
    # - X1 uses an ASCII slot ending at byte 43
    # - X1S/X2 use a UTF-16BE slot ending at byte 73
    blob_start = _ir_dump_page_one_blob_start(payload)
    if len(payload) <= blob_start:
        return None

    label_bytes = payload[_IR_DUMP_LABEL_START:blob_start]

    if _page_one_uses_ascii_label_layout(payload):
        label_bytes = label_bytes.split(b"\x00", 1)[0].rstrip(b"\x00")
        if not label_bytes:
            return None
        try:
            candidate = label_bytes.decode("latin-1").strip()
        except UnicodeDecodeError:
            return None
        return candidate if _looks_reasonable_ir_dump_label(candidate) else None

    label_bytes = label_bytes.rstrip(b"\x00")
    if not label_bytes or len(label_bytes) % 2:
        return None

    try:
        candidate = label_bytes.decode("utf-16-be").strip()
    except UnicodeDecodeError:
        return None

    return candidate if _looks_reasonable_ir_dump_label(candidate) else None


def parse_ir_command_dump_frame(opcode: int, raw_frame: bytes) -> IrCommandDumpFrame | None:
    """Parse a raw IR blob page from the 0x020C backup/restore family."""

    if len(raw_frame) < 7 or not _looks_like_ir_dump_opcode(opcode):
        return None

    payload = raw_frame[4:-1]
    if len(payload) < 4:
        return None

    response_index = payload[0]
    page_no = payload[2]
    if response_index == 0 or page_no == 0:
        return None

    command_id = response_index
    device_id: int | None = None
    total_commands: int | None = None
    total_pages: int | None = None
    format_marker: int | None = None
    label: str | None = None

    if page_no == 1 and len(payload) >= 9:
        command_id = payload[7]
        if command_id == 0:
            return None
        device_id = payload[6]
        total_commands = payload[3] if payload[3] else None
        total_pages = payload[5] if payload[5] else None
        format_marker = payload[8]
        label = _extract_ir_dump_label(payload)

    return IrCommandDumpFrame(
        opcode=opcode,
        family=opcode_family(opcode),
        response_index=response_index,
        command_id=command_id,
        page_no=page_no,
        device_id=device_id,
        total_commands=total_commands,
        total_pages=total_pages,
        format_marker=format_marker,
        label=label,
    )


class DeviceCommandAssembler:
    """Reassembles multi-frame device-command bursts by device ID."""

    def __init__(self) -> None:
        self._buffers: Dict[int, _CommandBurst] = {}

    def _get_buffer(self, dev_id: int) -> _CommandBurst:
        if dev_id not in self._buffers:
            self._buffers[dev_id] = _CommandBurst()
        return self._buffers[dev_id]

    def feed(
        self,
        opcode: int,
        raw_frame: bytes,
        *,
        dev_id_override: int | None = None,
        hub_version: str,
    ) -> List[Tuple[int, bytes]]:
        """Feed a raw frame and return completed payloads when available."""

        if len(raw_frame) < 7:
            return []

        payload = raw_frame[4:-1]
        if len(payload) < 4:
            return []

        parsed = parse_command_burst_frame(opcode, raw_frame, hub_version=hub_version)
        if parsed is None:
            return []

        dev_id = dev_id_override if dev_id_override is not None else parsed.device_id
        frame_no = parsed.frame_no
        burst = self._get_buffer(dev_id)

        is_single_cmd = parsed.is_single
        if parsed.is_header:
            burst.variant = parsed.layout_kind
            burst.total_frames = parsed.total_frames
            burst.total_commands = parsed.total_commands
            burst.frames.clear()
        elif parsed.total_frames is not None and burst.total_frames is None:
            burst.total_frames = parsed.total_frames
            burst.total_commands = parsed.total_commands

        if parsed.is_single:
            burst.frames.clear()
            burst.variant = parsed.layout_kind
            burst.total_frames = 1

        frame_payload = payload[parsed.data_start :] if len(payload) > parsed.data_start else b""
        burst.frames[frame_no] = frame_payload

        completed: List[Tuple[int, bytes]] = []
        if burst.frames:
            max_frame_no = max(burst.frames)
            frames_are_contiguous = len(burst.frames) == max_frame_no and 1 in burst.frames
        else:
            max_frame_no = 0
            frames_are_contiguous = False

        if is_single_cmd:
            ordered_payload = b"".join(burst.frames[i] for i in sorted(burst.frames))
            completed.append((dev_id, ordered_payload))
            del self._buffers[dev_id]
        elif burst.total_frames and burst.received >= burst.total_frames:
            ordered_payload = b"".join(burst.frames[i] for i in sorted(burst.frames))
            completed.append((dev_id, ordered_payload))
            del self._buffers[dev_id]

        return completed

    def finalize_contiguous(self, dev_id: int | None = None) -> List[Tuple[int, bytes]]:
        """Flush buffered bursts whose frames are contiguous starting at 1.

        Some hubs over-report the total frame count and never send a tail. In
        those cases, complete bursts manually once all contiguous frames have
        arrived.
        """

        targets = [dev_id] if dev_id is not None else list(self._buffers)
        completed: List[Tuple[int, bytes]] = []

        for target in targets:
            burst = self._buffers.get(target)
            if not burst or not burst.frames:
                continue

            max_frame = max(burst.frames)
            if len(burst.frames) != max_frame or 1 not in burst.frames:
                continue

            ordered_payload = b"".join(burst.frames[i] for i in sorted(burst.frames))
            completed.append((target, ordered_payload))
            del self._buffers[target]

        return completed


class DeviceButtonAssembler:
    """Reassembles multi-frame button/keymap bursts by activity ID."""

    def __init__(self) -> None:
        self._buffers: Dict[int, _ButtonBurst] = {}

    def _get_buffer(self, activity_id: int) -> _ButtonBurst:
        if activity_id not in self._buffers:
            self._buffers[activity_id] = _ButtonBurst()
        return self._buffers[activity_id]

    def feed(
        self,
        opcode: int,
        raw_frame: bytes,
        *,
        activity_id_override: int | None = None,
        hub_version: str,
    ) -> List[Tuple[int, bytes, int | None]]:
        """Feed a raw keymap frame and return completed row streams when available."""

        if len(raw_frame) < 7:
            return []

        payload = raw_frame[4:-1]
        parsed = parse_button_burst_frame(opcode, raw_frame, hub_version=hub_version)
        if parsed is None:
            return []

        activity_id = (
            activity_id_override
            if activity_id_override is not None
            else parsed.activity_id
        )
        if activity_id is None:
            return []

        burst = self._get_buffer(activity_id)

        if parsed.is_header:
            burst.variant = parsed.layout_kind
            burst.total_frames = parsed.total_frames
            burst.total_rows = parsed.total_rows
            burst.frames.clear()
        else:
            if parsed.total_frames is not None and burst.total_frames is None:
                burst.total_frames = parsed.total_frames
            if parsed.total_rows is not None and burst.total_rows is None:
                burst.total_rows = parsed.total_rows
            if burst.total_frames is None and parsed.is_final:
                burst.total_frames = parsed.frame_no

        frame_payload = (
            payload[parsed.data_start:] if parsed.has_row_data and len(payload) > parsed.data_start else b""
        )
        burst.frames[parsed.frame_no] = frame_payload

        completed: List[Tuple[int, bytes, int | None]] = []
        if burst.total_frames and burst.received >= burst.total_frames:
            ordered_payload = b"".join(burst.frames[i] for i in sorted(burst.frames))
            completed.append((activity_id, ordered_payload, burst.total_rows))
            del self._buffers[activity_id]

        return completed


# ---------------------------------------------------------------------------
# Phase 9 -- per-family parse dispatcher
#
# Replaces the previous "import every burst parser at the call site" pattern
# in :mod:`lib.opcode_handlers` with a single entry point that picks the
# right metadata parser from the opcode's family code. Adding a new family
# means adding one branch here; opcode_handlers stays family-agnostic.
# ---------------------------------------------------------------------------


def decode_burst_frame(
    opcode: int,
    raw_frame: bytes,
    *,
    hub_version: str,
) -> ButtonBurstFrame | CommandBurstFrame | None:
    """Dispatch to the per-family burst-frame metadata parser.

    The integration receives multi-page bursts for keymaps (family
    ``0x3D``), per-device command records (family ``0x5D``) and a
    handful of marker / single-frame variants in adjacent families.
    This dispatcher routes each incoming frame to the parser that owns
    its family, returning the parser's structured frame record (or
    ``None`` when the opcode does not belong to a known burst family).

    Callers should pass the proxy's ``hub_version`` -- the parsers use
    it to decide stride and label encoding, and reject unknown values
    via :func:`schema_for`.
    """

    if _is_keymap_family(opcode):
        return parse_button_burst_frame(opcode, raw_frame, hub_version=hub_version)
    if (
        _is_devbtn_family(opcode)
        or opcode_family(opcode) == 0x0D
        or opcode == OP_DEVBTN_SINGLE
    ):
        return parse_command_burst_frame(opcode, raw_frame, hub_version=hub_version)
    return None


__all__ = [
    "ButtonBurstFrame",
    "CommandRecord",
    "CommandBurstFrame",
    "DeviceButtonAssembler",
    "DeviceCommandAssembler",
    "IrCommandDumpFrame",
    "KEYMAP_RECORD_SIZE",
    "KeymapRecord",
    "build_descriptive_ir_blob_body",
    "build_denonk_ir_blob",
    "descriptive_play_blob_text",
    "denonk_checksum",
    "decode_burst_frame",
    "COMMAND_RECORD_LABEL_LEN_X1",
    "COMMAND_RECORD_LABEL_LEN_X1S_X2",
    "COMMAND_RECORD_LABEL_OFFSET",
    "COMMAND_RECORD_STRIDE_X1",
    "COMMAND_RECORD_STRIDE_X1S_X2",
    "iter_command_records_from_assembled",
    "iter_keymap_records",
    "looks_like_descriptive_play_blob",
    "parse_ir_command_dump_frame",
    "parse_button_burst_frame",
    "parse_command_burst_frame",
    "split_play_blob_tail",
]
