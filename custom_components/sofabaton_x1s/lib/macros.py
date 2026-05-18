from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from ..const import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2
from .protocol_const import FAMILY_MACROS, opcode_family, opcode_hi


@dataclass(slots=True)
class _MacroBurst:
    total_frames: int | None = None
    frames: Dict[int, bytes] = field(default_factory=dict)
    activity_id: int | None = None
    record_start_frames: set = field(default_factory=set)


@dataclass(slots=True)
class MacroBurstFrame:
    opcode: int
    role: str
    fragment_index: int | None
    total_fragments: int | None
    activity_id: int | None
    start_command_id: int | None
    data_start: int
    payload_length_matches_hi: bool

    @property
    def is_record_start(self) -> bool:
        return self.role == "record_start"

    @property
    def display_name(self) -> str:
        return "REQ_MACRO_LABELS_PAGE" if self.is_record_start else "REQ_MACRO_LABELS_CONT"


def parse_macro_burst_frame(opcode: int, raw_frame: bytes) -> MacroBurstFrame | None:
    """Return parsed family metadata for a macro frame.

    Macro pages are intended to assemble into one deterministic buffer rather
    than being interpreted record-by-record at the frame level:

        concat[3]     = deviceID
        concat[4]     = keyID
        concat[5]     = N (count of 10-byte key entries)
        concat[6 .. 6 + N*10]      = N x 10-byte key entries
                                     [deviceID, keyID, fid_byte*6,
                                      duration (signed; -1 means delay-only),
                                      delay]
                                     If entry[1] == 0xFF, this is a
                                     no-op / delay-only entry (type=0).
        concat[length-31 .. length-1]  = label, ASCII (X1)
        concat[length-61 .. length-1]  = label, UTF-16BE (X1S/X2)

    Encoding selection is hub-model based, not byte-pattern heuristic.
    UTF-16BE labels have no 0x0000 terminator and no length prefix; the full
    fixed-width label slot is decoded and trimmed. ``0xFF`` mid-label is
    legitimate data, never a delimiter.

    """

    if len(raw_frame) < 7 or opcode_family(opcode) != FAMILY_MACROS:
        return None

    payload = raw_frame[4:-1]
    if not payload:
        return None

    payload_len_matches_hi = opcode_hi(opcode) == len(payload)
    if len(payload) < 7:
        return MacroBurstFrame(
            opcode=opcode,
            role="continuation",
            fragment_index=None,
            total_fragments=None,
            activity_id=None,
            start_command_id=None,
            data_start=len(payload),
            payload_length_matches_hi=payload_len_matches_hi,
        )

    p0, _, x, p3, _, y, a = payload[:7]
    if x == 0x01 and y in (0x01, 0x02) and a != 0x00:
        total_fragments = p3 or None
        if total_fragments is not None and not (1 <= total_fragments <= 64):
            total_fragments = None
        return MacroBurstFrame(
            opcode=opcode,
            role="record_start",
            fragment_index=p0 or 1,
            total_fragments=total_fragments,
            activity_id=a,
            start_command_id=payload[7] if len(payload) > 7 else None,
            data_start=7,
            payload_length_matches_hi=payload_len_matches_hi,
        )

    return MacroBurstFrame(
        opcode=opcode,
        role="continuation",
        fragment_index=None,
        total_fragments=None,
        activity_id=None,
        start_command_id=None,
        data_start=7 if len(payload) > 7 else len(payload),
        payload_length_matches_hi=payload_len_matches_hi,
    )


class MacroAssembler:
    """Reassemble multi-frame macro payloads returned by the hub."""

    def __init__(self) -> None:
        self._buffers: Dict[int, _MacroBurst] = {}
        self._last_activity_id: int | None = None

    def _get_buffer(self, activity_id: int) -> _MacroBurst:
        buf = self._buffers.get(activity_id)
        if buf is None:
            buf = _MacroBurst(activity_id=activity_id)
            self._buffers[activity_id] = buf
        return buf

    def _parse_header_from_payload(
        self, payload: bytes, *, opcode_hi: int | None = None
    ) -> tuple[int | None, int | None, int | None, bytes, bool]:
        """Return (activity_id, frame_no, total_frames, body, is_record_start).

        Record-start frames strip 7 bytes (``payload[7:]``). Continuation
        frames strip only 3 bytes (``payload[3:]``). The additional 4 bytes on
        continuation pages belong to the assembled macro data and are commonly
        absorbed into trailing padding; dropping them shifts later offsets and
        misaligns the label slot on multi-page macros.
        """

        if len(payload) < 7:
            return self._last_activity_id, 1, None, payload, False

        p0, _, x, p3, _, y, a = payload[:7]

        activity_id: int | None
        frame_no: int | None
        total_frames: int | None

        # End the body at opcode_hi (the invariant-declared payload length)
        # when known, so 1-byte transcription drift in synthetic fixtures
        # doesn't shift the schema parser's offsets. Falls back to the full
        # payload when opcode_hi isn't supplied.
        body_end = opcode_hi if opcode_hi is not None else len(payload)

        if x == 0x01 and y in (0x01, 0x02) and a != 0x00:
            activity_id = a
            frame_no = p0 or 1
            total_frames = p3 or None
            if total_frames is not None and not (1 <= total_frames <= 16):
                total_frames = None
            body = payload[7:body_end]
            is_record_start = True
        else:
            activity_id = self._last_activity_id
            frame_no = None
            total_frames = None
            body = payload[3:body_end]
            is_record_start = False

        return activity_id, frame_no, total_frames, body, is_record_start

    def _process_fragment(
        self, *, activity_id: int, frame_no: int, total_frames: int | None, body: bytes, is_record_start: bool
    ) -> List[Tuple[int, bytes, List[int]]]:
        burst = self._get_buffer(activity_id)
        self._last_activity_id = activity_id

        if frame_no is None:
            if not burst.frames:
                frame_no = 1
            else:
                frame_no = max(burst.frames)
                burst.frames[frame_no] += body
                body = b""

        while frame_no in burst.frames and body:
            frame_no += 1

        if body:
            burst.frames[frame_no] = body
        if is_record_start:
            burst.record_start_frames.add(frame_no)
        if total_frames is not None and burst.total_frames is None:
            burst.total_frames = total_frames

        max_frame_no = max(burst.frames)
        contiguous = len(burst.frames) == max_frame_no and 1 in burst.frames

        finished = False
        if burst.total_frames and len(burst.frames) >= burst.total_frames:
            finished = True
        elif contiguous and (burst.total_frames is None or burst.total_frames <= max_frame_no):
            finished = True

        if not finished:
            return []

        sorted_frames = sorted(burst.frames)
        ordered = b"".join(burst.frames[i] for i in sorted_frames)

        record_boundaries: List[int] = []
        offset = 0
        for frame_no_sorted in sorted_frames:
            if frame_no_sorted in burst.record_start_frames:
                record_boundaries.append(offset)
            offset += len(burst.frames[frame_no_sorted])

        del self._buffers[activity_id]
        return [(activity_id, ordered, record_boundaries)]

    def feed(self, opcode: int, payload: bytes, raw: bytes | None = None) -> List[Tuple[int, bytes, List[int]]]:
        """Feed a macro-family payload and return completed assemblies."""

        if not payload and not raw:
            return []

        payload_bytes = payload
        if raw and len(raw) >= 6 and raw[0] == 0xA5 and raw[1] == 0x5A:
            payload_bytes = raw[4:-1]

        opcode_hi = (opcode >> 8) & 0xFF
        activity_id, frame_no, total_frames, body, is_record_start = self._parse_header_from_payload(
            payload_bytes, opcode_hi=opcode_hi
        )

        if activity_id is None:
            return []

        return self._process_fragment(
            activity_id=activity_id, frame_no=frame_no, total_frames=total_frames, body=body,
            is_record_start=is_record_start,
        )


# ---------------------------------------------------------------------------
# Pure-function REQ_MACROS record parser.
#
# Each completed page-cycle yields one macro region. The integration's
# MacroAssembler delivers a post-assembly byte sequence that begins after the
# page-1 preamble plus the device/activity byte. Concretely:
#
#     region[0]              = key_id  (which activity button this macro
#                                       is bound to; called command_id in
#                                       the integration's legacy decoder)
#     region[1]              = N (count of inner key entries)
#     region[2 + i*10 : 2 + (i+1)*10]  = i-th key entry (10 bytes)
#     region[-30:]           = label slot, X1 ASCII
#     region[-60:]           = label slot, X1S/X2 UTF-16BE
#
# Key entry (10 bytes):
#     [0]   deviceID
#     [1]   keyID  (0xFF means delay-only / no-op entry)
#     [2..7] fid  (6-byte BE int)
#     [8]   duration / inputSign
#     [9]   delay (ms before next entry)
# ---------------------------------------------------------------------------


#: Size in bytes of one key entry inside a macro region.
MACRO_KEY_BEAN_SIZE = 10

#: Byte offset within a region where MacroKeyBean entries begin.
MACRO_KEY_BEAN_START = 2

#: Length of the trailing label slot for X1 hubs (ASCII).
MACRO_LABEL_LEN_X1 = 30

#: Length of the trailing label slot for X1S/X2 hubs (UTF-16BE).
MACRO_LABEL_LEN_X1S_X2 = 60


@dataclass(slots=True, frozen=True)
class MacroKeyEntry:
    """One 10-byte key entry from a macro's inner key sequence."""

    device_id: int
    key_id: int
    fid: int
    duration: int
    delay: int

    @property
    def is_delay_only(self) -> bool:
        """A key_id of 0xFF indicates a delay-only / no-op entry."""

        return self.key_id == 0xFF

    @property
    def entry_type(self) -> int:
        """Return 0 for delay-only entries, else 1."""

        return 0 if self.is_delay_only else 1


@dataclass(slots=True, frozen=True)
class MacroRecord:
    """One macro definition parsed from an assembled REQ_MACROS region.

    ``activity_id`` is supplied by the caller (the assembler keys bursts
    by activity_id; the byte that holds it in the wire format lives in the
    page-1 preamble the assembler strips before producing the region).
    """

    activity_id: int
    key_id: int           # which activity button this macro is bound to
    label: str
    key_sequence: tuple[MacroKeyEntry, ...]


def _stride_label_len_for_macros(hub_version: str | None) -> tuple[int, str]:
    """Return ``(label_len, encoding)`` for the given hub model."""

    if hub_version == HUB_VERSION_X1:
        return (MACRO_LABEL_LEN_X1, "ascii")
    if hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
        return (MACRO_LABEL_LEN_X1S_X2, "utf-16-be")
    raise ValueError(
        f"parse_macro_record_from_region: unknown hub_version={hub_version!r}; "
        "expected one of HUB_VERSION_X1 / HUB_VERSION_X1S / HUB_VERSION_X2."
    )


def _decode_macro_schema_label(label_bytes: bytes, encoding: str) -> str:
    """Decode a fixed-width macro label slot.

    The entire slot is decoded under the chosen encoding, then null padding
    and surrounding whitespace are removed.
    """

    if encoding == "ascii":
        try:
            decoded = label_bytes.decode("ascii", errors="ignore")
        except Exception:
            decoded = ""
        return decoded.rstrip("\x00").strip()

    raw = label_bytes
    if len(raw) % 2:
        raw = raw[:-1]
    try:
        decoded = raw.decode("utf-16-be", errors="ignore")
    except Exception:
        decoded = ""
    return decoded.rstrip("\x00").strip()


def parse_macro_record_from_region(
    region: bytes,
    *,
    activity_id: int,
    hub_version: str,
) -> MacroRecord | None:
    """Parse one :class:`MacroRecord` from a post-assembly macro region.

    ``region`` is the slice of the assembler's ordered payload corresponding
    to one completed page-cycle (one macro). The caller supplies
    ``activity_id`` (captured by the assembler from the page-1 header) and
    ``hub_version`` (which selects stride and label encoding).

    Returns ``None`` if the region is too short to contain a valid macro
    header (less than 2 bytes plus the label slot).

    The parser does not scan for ``0xFF`` separators, does not use
    byte-pattern heuristics to detect label encoding, and decodes the
    label from the **end** of the region at the fixed
    hub-version-determined slot length. It also exposes the inner
    ``MacroKeyEntry`` sequence so callers that want to introspect the
    macro's button presses can do so without re-parsing the bytes.

    """

    label_len, encoding = _stride_label_len_for_macros(hub_version)

    # The label slot is read from the end of the region, skipping the final
    # 1-byte terminator. The slot we want is ``region[-(label_len+1):-1]``.
    if len(region) < MACRO_KEY_BEAN_START + label_len + 1:
        return None

    key_id = region[0]
    count = region[1]

    sequence_end = MACRO_KEY_BEAN_START + count * MACRO_KEY_BEAN_SIZE
    label_start = len(region) - (label_len + 1)
    label_end = len(region) - 1  # skip the trailing terminator byte

    # Defensive bounds check: if the declared count would overlap or pass
    # the trailing label slot, clamp to what fits between the header and
    # the label.
    if sequence_end > label_start:
        usable_bytes = max(0, label_start - MACRO_KEY_BEAN_START)
        count = usable_bytes // MACRO_KEY_BEAN_SIZE

    entries: list[MacroKeyEntry] = []
    for i in range(count):
        bean_start = MACRO_KEY_BEAN_START + i * MACRO_KEY_BEAN_SIZE
        bean = region[bean_start : bean_start + MACRO_KEY_BEAN_SIZE]
        if len(bean) < MACRO_KEY_BEAN_SIZE:
            break
        entries.append(
            MacroKeyEntry(
                device_id=bean[0],
                key_id=bean[1],
                fid=int.from_bytes(bean[2:8], "big"),
                duration=bean[8],
                delay=bean[9],
            )
        )

    label = _decode_macro_schema_label(region[label_start:label_end], encoding)

    return MacroRecord(
        activity_id=activity_id,
        key_id=key_id,
        label=label,
        key_sequence=tuple(entries),
    )


def parse_macro_records_from_burst(
    payload: bytes,
    *,
    activity_id: int,
    record_boundaries: list[int],
    hub_version: str,
) -> list[MacroRecord]:
    """Parse all macros in a completed burst's assembled payload.

    Walks the ``record_boundaries`` produced by :class:`MacroAssembler` and
    runs :func:`parse_macro_record_from_region` on each resulting region.

    The parser produces ``(activity_id, key_id)``-keyed records, exposes
    the inner key sequence, and walks records at fixed offsets within
    each boundary-delimited region.
    """

    records: list[MacroRecord] = []
    for idx, boundary in enumerate(record_boundaries):
        if boundary >= len(payload):
            continue
        region_end = (
            record_boundaries[idx + 1]
            if idx + 1 < len(record_boundaries)
            else len(payload)
        )
        region = payload[boundary:region_end]
        record = parse_macro_record_from_region(
            region, activity_id=activity_id, hub_version=hub_version
        )
        if record is not None:
            records.append(record)
    return records


__all__ = [
    "MACRO_KEY_BEAN_SIZE",
    "MACRO_KEY_BEAN_START",
    "MACRO_LABEL_LEN_X1",
    "MACRO_LABEL_LEN_X1S_X2",
    "MacroAssembler",
    "MacroBurstFrame",
    "MacroKeyEntry",
    "MacroRecord",
    "parse_macro_burst_frame",
    "parse_macro_record_from_region",
    "parse_macro_records_from_burst",
]
