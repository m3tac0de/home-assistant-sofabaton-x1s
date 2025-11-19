"""Helpers for assembling and parsing device-command bursts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, List, Tuple

from .protocol_const import (
    OP_DEVBTN_EXTRA,
    OP_DEVBTN_HEADER,
    OP_DEVBTN_MORE,
    OP_DEVBTN_TAIL,
)


@dataclass(slots=True)
class CommandRecord:
    """Structured representation of a single device command label."""

    dev_id: int
    command_id: int
    control: bytes
    label: str


@dataclass(slots=True)
class _CommandBurst:
    total_frames: int | None = None
    frames: Dict[int, bytes] = field(default_factory=dict)

    @property
    def received(self) -> int:
        return len(self.frames)


class DeviceCommandAssembler:
    """Reassembles multi-frame device-command bursts by device ID."""

    def __init__(self) -> None:
        self._buffers: Dict[int, _CommandBurst] = {}

    def _get_buffer(self, dev_id: int) -> _CommandBurst:
        if dev_id not in self._buffers:
            self._buffers[dev_id] = _CommandBurst()
        return self._buffers[dev_id]

    def _data_offset(self, opcode: int) -> int:
        return 6

    def feed(self, opcode: int, raw_frame: bytes) -> List[Tuple[int, bytes]]:
        """Feed a raw frame and return completed payloads when available."""

        if len(raw_frame) < 7:
            return []

        payload = raw_frame[4:-1]
        if len(payload) < 4:
            return []

        dev_id = payload[3]
        frame_no = payload[2]
        burst = self._get_buffer(dev_id)

        if opcode == OP_DEVBTN_HEADER:
            burst.total_frames = int.from_bytes(payload[4:6], "big") if len(payload) >= 6 else None
            burst.frames.clear()
        elif burst.total_frames is None and opcode in (OP_DEVBTN_TAIL, OP_DEVBTN_EXTRA, OP_DEVBTN_MORE):
            burst.total_frames = frame_no

        data_start = self._data_offset(opcode)
        frame_payload = payload[data_start:] if len(payload) > data_start else b""
        burst.frames[frame_no] = frame_payload

        completed: List[Tuple[int, bytes]] = []
        if burst.total_frames and burst.received >= burst.total_frames:
            ordered_payload = b"".join(burst.frames[i] for i in sorted(burst.frames))
            completed.append((dev_id, ordered_payload))
            del self._buffers[dev_id]

        return completed


def _decode_label(label_bytes: bytes) -> str:
    trimmed = label_bytes
    if trimmed.startswith(b"\x00\x00\x00\x00"):
        trimmed = trimmed[4:]

    trimmed = trimmed.rstrip(b"\x00")
    if len(trimmed) % 2:
        trimmed += b"\x00"

    try:
        return trimmed.decode("utf-16-be").strip("\x00")
    except UnicodeDecodeError:
        return ""


def _matches_control_block(block: bytes) -> bool:
    if len(block) != 7:
        return False
    if block[0] in (0x03, 0x0D):
        return True
    return block[:6] == b"\x1a\x00\x00\x00\x00\x17"


def iter_command_records(data: bytes, dev_id: int) -> Iterator[CommandRecord]:
    target = dev_id & 0xFF
    chunks: Iterable[bytes] = data.split(b"\xff")

    for chunk in chunks:
        if len(chunk) < 9:
            continue

        for idx in range(len(chunk) - 8):
            if chunk[idx] != target:
                continue

            control_start = idx + 2
            control_block = chunk[control_start : control_start + 7]
            if not _matches_control_block(control_block):
                continue

            label_start = control_start + 7
            label = _decode_label(chunk[label_start:])
            if not label:
                continue

            command_id = chunk[idx + 1]
            yield CommandRecord(target, command_id, control_block, label)
            break


__all__ = [
    "CommandRecord",
    "DeviceCommandAssembler",
    "iter_command_records",
]
