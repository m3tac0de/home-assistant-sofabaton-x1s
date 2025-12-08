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
        if activity_id not in self._buffers:
            self._buffers[activity_id] = _MacroBurst(activity_id=activity_id)
        return self._buffers[activity_id]

    def _extract_headers(self, payload: bytes) -> tuple[int, int | None, bytes]:
        frame_no = payload[2] if len(payload) > 2 else 1
        total_frames = payload[3] if len(payload) > 3 and payload[3] else None
        data_start = 4 if payload[:2] == b"\x01\x00" and len(payload) >= 4 else 0
        body = payload[data_start:]
        return frame_no or 1, total_frames, body

    def _process_fragment(
        self, *, activity_id: int, frame_no: int, total_frames: int | None, body: bytes
    ) -> List[Tuple[int, bytes]]:
        burst = self._get_buffer(activity_id)
        self._last_activity_id = activity_id

        burst.frames[frame_no] = body
        if total_frames is not None:
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

        if raw and len(raw) >= 12:
            frame_no = raw[4] or 1
            total_frames = raw[7] or None
            activity_id = raw[10]
            body = raw[11:-1]
        else:
            frame_no, total_frames, body = self._extract_headers(payload)
            activity_id = body[0] if body else 0

        return self._process_fragment(
            activity_id=activity_id, frame_no=frame_no, total_frames=total_frames, body=body
        )


_UTF16_PATTERN = re.compile(rb"((?:[\x01-\xFF]\x00){2,})\x00\x00", re.DOTALL)


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

        match = _UTF16_PATTERN.search(payload, pos + 1)
        if not match:
            continue

        label_bytes = match.group(1)
        consumed = match.end()

        try:
            label = label_bytes.decode("utf-16le", errors="ignore").replace("\x00", "").strip()
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
