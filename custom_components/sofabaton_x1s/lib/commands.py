from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, List, Tuple


@dataclass
class _AssemblyState:
    total_frames: int = 0
    received_frames: int = 0
    buffer: bytearray = field(default_factory=bytearray)


class DeviceCommandAssembler:
    """Accumulates multi-frame command payloads keyed by device ID."""

    def __init__(
        self,
        header_opcodes: Iterable[int],
        valid_opcodes: Iterable[int] | None = None,
    ) -> None:
        self._header_ops = set(header_opcodes)
        self._valid_ops = set(valid_opcodes) if valid_opcodes is not None else set(header_opcodes)
        self._states: Dict[int, _AssemblyState] = {}

    def feed(self, opcode: int, raw_frame: bytes) -> List[Tuple[int, bytes]]:
        """Feed a frame and return completed payloads (device ID, raw bytes)."""

        if opcode not in self._valid_ops or len(raw_frame) < 5:
            return []

        payload = raw_frame[4:-1]
        if len(payload) < 4:
            return []

        frame_index = payload[2]
        dev_id = payload[3]

        if opcode in self._header_ops:
            state = _AssemblyState()
            state.total_frames = int.from_bytes(payload[4:6], "big") if len(payload) >= 6 else frame_index
            state.buffer.extend(raw_frame)
            state.received_frames = frame_index
            self._states[dev_id] = state
            return self._emit_if_complete(dev_id, state)

        state = self._states.get(dev_id)
        if state is None:
            return []

        state.buffer.extend(raw_frame)
        state.received_frames = frame_index
        return self._emit_if_complete(dev_id, state)

    def _emit_if_complete(self, dev_id: int, state: _AssemblyState) -> List[Tuple[int, bytes]]:
        if state.total_frames and state.received_frames >= state.total_frames:
            payload = bytes(state.buffer)
            del self._states[dev_id]
            return [(dev_id, payload)]
        return []


@dataclass
class CommandRecord:
    dev_id: int
    command_id: int
    control: bytes
    raw_label: bytes

    @classmethod
    def from_chunk(
        cls, chunk: bytes, dev_byte: int, *, start: int = 0
    ) -> tuple["CommandRecord" | None, int]:
        """Attempt to parse a record starting at ``start``.

        Returns the record (or ``None`` if the slice is not a valid record)
        along with the next offset the caller should continue from.
        """

        if start >= len(chunk):
            return None, len(chunk)

        if chunk[start] != dev_byte:
            return None, start + 1

        if start + 9 > len(chunk):
            return None, len(chunk)

        command_id = chunk[start + 1]
        control = chunk[start + 2 : start + 9]

        if not _looks_like_control_block(control):
            return None, start + 1

        label_bytes = chunk[start + 9 :]
        if not label_bytes:
            return None, len(chunk)

        return cls(dev_byte, command_id, control, label_bytes), len(chunk)

    def decode_label(self) -> str:
        label_bytes = self.raw_label
        if label_bytes.startswith(b"\x00\x00\x00\x00"):
            label_bytes = label_bytes[4:]
        label_bytes = label_bytes.rstrip(b"\x00")
        if len(label_bytes) % 2 != 0:
            label_bytes = label_bytes[:-1]
        try:
            return label_bytes.decode("utf-16be", errors="ignore").strip("\x00")
        except UnicodeDecodeError:
            return ""


def _iter_chunks(raw_data: bytes) -> Iterator[bytes]:
    for chunk in raw_data.split(b"\xFF"):
        if chunk:
            yield chunk


def _looks_like_control_block(control: bytes) -> bool:
    if len(control) != 7:
        return False
    if control[0] in (0x03, 0x0D):
        return True
    if control.startswith(b"\x1a\x00\x00\x00\x00\x17"):
        return True
    return False


def iter_command_records(raw_data: bytes, dev_id: int) -> Iterator[CommandRecord]:
    dev_byte = dev_id & 0xFF
    for chunk in _iter_chunks(raw_data):
        cursor = 0
        while cursor < len(chunk):
            record, cursor = CommandRecord.from_chunk(chunk, dev_byte, start=cursor)
            if record:
                yield record


def parse_device_commands(raw_bytes: bytes, dev_id: int) -> Dict[int, str]:
    commands: Dict[int, str] = {}
    for record in iter_command_records(raw_bytes, dev_id):
        label = record.decode_label()
        if label and record.command_id not in commands:
            commands[record.command_id] = label
    return commands
