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
_ASCII_PATTERN = re.compile(rb"([\x20-\x7E]{3,})\x00{2,}")


def decode_macro_records(payload: bytes, activity_id: int) -> list[tuple[int, int, str]]:
    """Parse macro records from a complete, reassembled payload."""

    records: list[tuple[int, int, str]] = []
    consumed = 0

    starts = []
    for i in range(len(payload) - 1):
        if not payload[i] or payload[i] > 0x0F:
            continue
        second = payload[i + 1]
        utf16_immediate = second >= 0x20 and i + 2 < len(payload) and payload[i + 2] == 0x00
        if second in (0x00, 0x03) or utf16_immediate:
            starts.append(i)

    for pos in starts:
        if pos < consumed:
            continue

        decoder = "utf-16le"

        match = _UTF16_PATTERN.search(payload, pos + 1)
        if match:
            label_bytes = match.group(1)
            consumed = match.end()
        else:
            ascii_match = _ASCII_PATTERN.search(payload, pos + 1)
            if not ascii_match:
                continue

            label_bytes = ascii_match.group(1)
            consumed = ascii_match.end()
            decoder = "ascii"

        try:
            label = label_bytes.decode(decoder, errors="ignore").replace("\x00", "").strip()
        except Exception:
            label = ""

        if label:
            label = re.sub(r"[^\x20-\x7E]", "", label)
            label = label.lstrip("0123456789")

        if label and not label.upper().startswith("POWER_"):
            records.append((activity_id, payload[pos], label))

    return records


__all__ = [
    "MacroAssembler",
    "decode_macro_records",
]
