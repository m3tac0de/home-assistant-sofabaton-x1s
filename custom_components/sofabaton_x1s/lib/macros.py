from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Dict, List, Tuple


@dataclass(slots=True)
class _MacroBurst:
    total_frames: int | None = None
    frames: Dict[int, bytes] = field(default_factory=dict)
    activity_id: int | None = None


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
    ) -> tuple[int | None, int | None, int | None, bytes]:
        """Return (activity_id, frame_no, total_frames, body)."""

        if len(payload) < 7:
            return self._last_activity_id, 1, None, payload

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
        else:
            activity_id = self._last_activity_id
            frame_no = None
            total_frames = None

        return activity_id, frame_no, total_frames, body

    def _process_fragment(
        self, *, activity_id: int, frame_no: int, total_frames: int | None, body: bytes
    ) -> List[Tuple[int, bytes]]:
        burst = self._get_buffer(activity_id)
        self._last_activity_id = activity_id

        if frame_no is None:
            frame_no = max(burst.frames) + 1 if burst.frames else 1

        while frame_no in burst.frames:
            frame_no += 1

        burst.frames[frame_no] = body
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

        ordered = b"".join(burst.frames[i] for i in sorted(burst.frames))
        del self._buffers[activity_id]
        return [(activity_id, ordered)]

    def feed(self, opcode: int, payload: bytes, raw: bytes | None = None) -> List[Tuple[int, bytes]]:
        """Feed a macro-family payload and return completed assemblies."""

        if not payload and not raw:
            return []

        payload_bytes = payload
        if raw and len(raw) >= 6 and raw[0] == 0xA5 and raw[1] == 0x5A:
            payload_bytes = raw[4:-1]

        activity_id, frame_no, total_frames, body = self._parse_header_from_payload(payload_bytes)

        if activity_id is None:
            return []

        return self._process_fragment(
            activity_id=activity_id, frame_no=frame_no, total_frames=total_frames, body=body
        )


_UTF16_PATTERN = re.compile(rb"((?:[\x01-\xFF]\x00){2,})\x00\x00", re.DOTALL)
_UTF16_FALLBACK_PATTERN = re.compile(rb"((?:[\x20-\x7E]\x00){2,})", re.DOTALL)
_ASCII_PATTERN = re.compile(rb"([\x20-\x7E]{3,})\x00{2,}")
_ASCII_FALLBACK_PATTERN = re.compile(rb"([\x20-\x7E]{3,})")


def decode_macro_records(payload: bytes, activity_id: int) -> list[tuple[int, int, str]]:
    """Parse macro records from a complete, reassembled payload."""

    records: list[tuple[int, int, str]] = []
    consumed = 0

    starts: list[int] = []
    secondary_starts: list[int] = []
    for i in range(len(payload) - 1):
        if not payload[i] or payload[i] > 0x0F:
            continue
        second = payload[i + 1]
        utf16_immediate = second >= 0x20 and i + 2 < len(payload) and payload[i + 2] == 0x00
        if second in (0x00, 0x03) or utf16_immediate:
            if (
                second == 0x03
                and i > 0
                and payload[i - 1] <= 0x0F
                and i + 2 < len(payload)
                and payload[i + 2] <= 0x0F
            ):
                continue
            starts.append(i)
        elif 0x01 <= second <= 0x05 and i + 2 < len(payload) and payload[i + 2] == 0x03:
            if payload[i] == 0x03 and i + 3 < len(payload) and payload[i + 3] > 0x0F:
                continue
            if i == 0 or payload[i - 1] == 0x00 or payload[i - 1] > 0x0F:
                secondary_starts.append(i)
        elif i + 3 < len(payload) and second <= 0x0F and payload[i + 2] == 0x01 and payload[i + 3] == 0x01:
            if i == 0 or payload[i - 1] == 0x00 or payload[i - 1] > 0x0F:
                secondary_starts.append(i)

    def _decode_from_starts(
        starts: list[int], label_index: dict[str, int], *, allow_early_fallback: bool
    ) -> None:
        nonlocal consumed

        for pos in starts:
            if pos < consumed:
                continue

            decoder = "utf-16le"

            candidates: list[tuple[int, int, bytes, str, bool]] = []
            match = _UTF16_PATTERN.search(payload, pos + 1)
            if match:
                candidates.append((match.start(1), match.end(), match.group(1), "utf-16le", False))

            ascii_match = _ASCII_PATTERN.search(payload, pos + 1)
            if ascii_match:
                candidates.append((ascii_match.start(1), ascii_match.end(), ascii_match.group(1), "ascii", False))

            earliest_terminated = None
            if match:
                earliest_terminated = match.start(1)
            if ascii_match:
                earliest_terminated = (
                    ascii_match.start(1)
                    if earliest_terminated is None
                    else min(earliest_terminated, ascii_match.start(1))
                )

            utf16_fallback = _UTF16_FALLBACK_PATTERN.search(payload, pos + 1)
            if utf16_fallback and (
                len(payload) - utf16_fallback.end() <= 4
                or (
                    allow_early_fallback
                    and earliest_terminated is not None
                    and utf16_fallback.start(1) < earliest_terminated
                )
            ):
                candidates.append(
                    (
                        utf16_fallback.start(1),
                        utf16_fallback.end(),
                        utf16_fallback.group(1),
                        "utf-16le",
                        True,
                    )
                )

            ascii_fallback = _ASCII_FALLBACK_PATTERN.search(payload, pos + 1)
            if ascii_fallback and len(payload) - ascii_fallback.end() <= 4:
                candidates.append(
                    (ascii_fallback.start(1), ascii_fallback.end(), ascii_fallback.group(1), "ascii", True)
                )

            if not candidates:
                continue

            candidates.sort(key=lambda item: (item[0], -item[1]))
            label_start, end, label_bytes, decoder, allow_trailing = candidates[0]

            if (
                allow_trailing
                and decoder == "utf-16le"
                and end < len(payload)
                and 0x20 <= payload[end] <= 0x7E
                and (end + 1 >= len(payload) or payload[end + 1] != 0x00)
            ):
                label_bytes += bytes([payload[end], 0x00])
                end += 1

            consumed = end

            try:
                label = label_bytes.decode(decoder, errors="ignore").replace("\x00", "").strip()
            except Exception:
                label = ""

            if label:
                label = re.sub(r"[^\x20-\x7E]", "", label)
                label = label.lstrip("0123456789")

            if label and not label.upper().startswith("POWER_"):
                score = 0
                if pos + 3 < len(payload) and payload[pos + 2] == 0x01 and payload[pos + 3] == 0x01:
                    score += 2
                if pos + 2 < len(payload) and payload[pos + 1] == 0x00 and payload[pos + 2] == 0x00:
                    score -= 2

                if label in label_index:
                    idx, best_score, best_pos = label_index[label]
                    if score > best_score or (score == best_score and pos > best_pos):
                        records[idx] = (activity_id, payload[pos], label)
                        label_index[label] = (idx, score, pos)
                else:
                    label_index[label] = (len(records), score, pos)
                    records.append((activity_id, payload[pos], label))

    label_index: dict[str, tuple[int, int, int]] = {}
    _decode_from_starts(starts, label_index, allow_early_fallback=False)
    consumed = 0
    _decode_from_starts(secondary_starts, label_index, allow_early_fallback=True)

    return records


__all__ = [
    "MacroAssembler",
    "decode_macro_records",
]
