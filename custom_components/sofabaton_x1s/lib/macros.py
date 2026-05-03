from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Dict, List, Tuple

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
    """Return parsed family metadata for a macro frame."""

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
        self, payload: bytes
    ) -> tuple[int | None, int | None, int | None, bytes, bool]:
        """Return (activity_id, frame_no, total_frames, body, is_record_start)."""

        if len(payload) < 7:
            return self._last_activity_id, 1, None, payload, False

        p0, _, x, p3, _, y, a = payload[:7]
        body = payload[7:]

        activity_id: int | None
        frame_no: int | None
        total_frames: int | None

        if x == 0x01 and y in (0x01, 0x02) and a != 0x00:
            activity_id = a
            frame_no = p0 or 1
            total_frames = p3 or None
            if total_frames is not None and not (1 <= total_frames <= 16):
                total_frames = None
            is_record_start = True
        else:
            activity_id = self._last_activity_id
            frame_no = None
            total_frames = None
            is_record_start = False

        return activity_id, frame_no, total_frames, body, is_record_start

    def _process_fragment(
        self, *, activity_id: int, frame_no: int, total_frames: int | None, body: bytes, is_record_start: bool
    ) -> List[Tuple[int, bytes, List[int]]]:
        burst = self._get_buffer(activity_id)
        self._last_activity_id = activity_id

        if frame_no is None:
            frame_no = max(burst.frames) + 1 if burst.frames else 1

        while frame_no in burst.frames:
            frame_no += 1

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

        activity_id, frame_no, total_frames, body, is_record_start = self._parse_header_from_payload(payload_bytes)

        if activity_id is None:
            return []

        return self._process_fragment(
            activity_id=activity_id, frame_no=frame_no, total_frames=total_frames, body=body,
            is_record_start=is_record_start,
        )


_UTF16_PATTERN = re.compile(rb"((?:[\x01-\xFF]\x00){2,})\x00\x00", re.DOTALL)
_UTF16_FALLBACK_PATTERN = re.compile(rb"((?:[\x20-\x7E]\x00){2,})", re.DOTALL)
_UTF16BE_PATTERN = re.compile(rb"((?:\x00[\x20-\x7E]){2,})\x00\x00", re.DOTALL)
_UTF16BE_FALLBACK_PATTERN = re.compile(rb"((?:\x00[\x20-\x7E]){2,})", re.DOTALL)
_ASCII_PATTERN = re.compile(rb"([\x20-\x7E]{3,})\x00{2,}")
_ASCII_FALLBACK_PATTERN = re.compile(rb"([\x20-\x7E]{3,})")


def _decode_ascii_region(region: bytes, *, start: int) -> str:
    tail = region[start:]
    if not tail:
        return ""
    end = tail.find(b"\x00")
    raw = tail if end < 0 else tail[:end]
    return raw.decode("ascii", errors="ignore").strip()


def _decode_utf16le_region(region: bytes, *, start: int) -> str:
    tail = region[start:]
    if not tail:
        return ""

    end = len(tail)
    for i in range(0, max(len(tail) - 1, 0), 2):
        if tail[i] == 0x00 and tail[i + 1] == 0x00:
            end = i
            break

    raw = tail[:end]
    if len(raw) % 2:
        raw = raw[:-1]
    if not raw:
        return ""

    return raw.decode("utf-16le", errors="ignore").replace("\x00", "").strip()


def _decode_utf16be_region(region: bytes, *, start: int) -> str:
    tail = region[start:]
    if not tail:
        return ""

    end = len(tail)
    for i in range(0, max(len(tail) - 1, 0), 2):
        if tail[i] == 0x00 and tail[i + 1] == 0x00:
            end = i
            break

    raw = tail[:end]
    if len(raw) % 2:
        raw = raw[:-1]
    if not raw:
        return ""

    return raw.decode("utf-16be", errors="ignore").replace("\x00", "").strip()


def _normalize_macro_label(label: str) -> str:
    """Remove transport/control artifacts from decoded macro labels."""

    normalized = label.strip()
    while normalized and (ord(normalized[0]) < 0x20 or normalized[0] == "\uffff"):
        normalized = normalized[1:].lstrip()
    if "\xff" in normalized:
        normalized = normalized.split("\xff")[-1]
    return normalized.strip()


def _decode_macro_record_label(record: bytes) -> str:
    """Decode a macro label from one record body using stable observed layouts."""

    separator = record.rfind(b"\xff")
    direct_label = ""
    if separator >= 0 and separator + 1 < len(record):
        start = separator + 1
        if start + 1 < len(record) and record[start] == 0x00 and record[start + 1] != 0x00:
            label = _decode_utf16be_region(record, start=start)
            label = _normalize_macro_label(label)
            if label and any(ch.isalnum() for ch in label) and all(ch.isprintable() or ch.isspace() for ch in label):
                direct_label = label
        elif record[start] != 0x00:
            label = _decode_ascii_region(record, start=start)
            label = _normalize_macro_label(label)
            if label and any(ch.isalnum() for ch in label) and all(ch.isprintable() or ch.isspace() for ch in label):
                direct_label = label

    if direct_label:
        # Some X1S/X2 power-macro records end with a trailing field separator and
        # one-byte metadata tail. In that shape, "last 0xFF wins" produces a fake
        # one-character label (for example "4") even though the real visible label
        # earlier in the record is POWER_OFF / POWER_ON. Prefer the structural
        # fallback when the direct tail candidate is unusually short.
        if len(direct_label) <= 2:
            fallback_label = _find_label_in_record(record)
            if fallback_label and fallback_label != direct_label:
                return fallback_label
        return direct_label

    return _find_label_in_record(record)


def _find_label_in_record(record: bytes) -> str:
    """Decode a label from one record body without scanning the whole burst."""

    candidates: list[tuple[int, int, bytes, str, bool]] = []

    match = _UTF16_PATTERN.search(record)
    if match:
        candidates.append((match.start(1), match.end(), match.group(1), "utf-16le", False))

    match_be = _UTF16BE_PATTERN.search(record)
    if match_be:
        candidates.append((match_be.start(1), match_be.end(), match_be.group(1), "utf-16be", False))

    ascii_match = _ASCII_PATTERN.search(record)
    if ascii_match:
        candidates.append((ascii_match.start(1), ascii_match.end(), ascii_match.group(1), "ascii", False))

    utf16_fallback = _UTF16_FALLBACK_PATTERN.search(record)
    if utf16_fallback and len(record) - utf16_fallback.end() <= 4:
        candidates.append((utf16_fallback.start(1), utf16_fallback.end(), utf16_fallback.group(1), "utf-16le", True))

    utf16be_fallback = _UTF16BE_FALLBACK_PATTERN.search(record)
    if utf16be_fallback and len(record) - utf16be_fallback.end() <= 4:
        candidates.append((utf16be_fallback.start(1), utf16be_fallback.end(), utf16be_fallback.group(1), "utf-16be", True))

    ascii_fallback = _ASCII_FALLBACK_PATTERN.search(record)
    if ascii_fallback and len(record) - ascii_fallback.end() <= 4:
        candidates.append((ascii_fallback.start(1), ascii_fallback.end(), ascii_fallback.group(1), "ascii", True))

    if not candidates:
        return ""

    candidates.sort(key=lambda item: (item[0], -item[1]))
    _, end, label_bytes, decoder, allow_trailing = candidates[0]

    if allow_trailing and decoder == "utf-16le" and end < len(record) and 0x20 <= record[end] <= 0x7E and (
        end + 1 >= len(record) or record[end + 1] != 0x00
    ):
        label_bytes += bytes([record[end], 0x00])

    try:
        label = label_bytes.decode(decoder, errors="ignore").replace("\x00", "").strip()
    except Exception:
        return ""

    return _normalize_macro_label(label)


def decode_macro_records(payload: bytes, activity_id: int, record_boundaries: list[int]) -> list[tuple[int, int, str]]:
    """Parse macro records from a complete, reassembled payload."""

    records: list[tuple[int, int, str]] = []
    for idx, boundary in enumerate(record_boundaries):
        if boundary >= len(payload):
            continue
        command_id = payload[boundary]
        region_end = record_boundaries[idx + 1] if idx + 1 < len(record_boundaries) else len(payload)
        label = _decode_macro_record_label(payload[boundary:region_end])
        if label and not label.upper().startswith("POWER_"):
            records.append((activity_id, command_id, label))
    return records


__all__ = [
    "MacroAssembler",
    "MacroBurstFrame",
    "decode_macro_records",
    "parse_macro_burst_frame",
]
