"""Helpers for assembling and parsing device-command bursts."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, List, Tuple

from .protocol_const import (
    FAMILY_DEVBTNS,
    opcode_family,
    OP_DEVBTN_HEADER,
    OP_DEVBTN_MORE,
    OP_DEVBTN_PAGE,
    OP_DEVBTN_PAGE_ALT1,
    OP_DEVBTN_PAGE_ALT2,
    OP_DEVBTN_PAGE_ALT3,
    OP_DEVBTN_PAGE_ALT4,
    OP_DEVBTN_PAGE_ALT5,
    OP_DEVBTN_PAGE_ALT6,
    OP_DEVBTN_SINGLE,
    OP_DEVBTN_TAIL,
    OP_KEYMAP_EXTRA,
)


def _is_devbtn_family(opcode: int) -> bool:
    """Return True if the opcode belongs to the dev-button page family."""

    return opcode_family(opcode) == FAMILY_DEVBTNS


_KNOWN_DEVBTN_OPCODES: set[int] = {
    OP_DEVBTN_HEADER,
    OP_DEVBTN_MORE,
    OP_DEVBTN_PAGE,
    OP_DEVBTN_PAGE_ALT1,
    OP_DEVBTN_PAGE_ALT2,
    OP_DEVBTN_PAGE_ALT3,
    OP_DEVBTN_PAGE_ALT4,
    OP_DEVBTN_PAGE_ALT5,
    OP_DEVBTN_PAGE_ALT6,
    OP_DEVBTN_SINGLE,
    OP_DEVBTN_TAIL,
    OP_KEYMAP_EXTRA,
}


_LOGGER = logging.getLogger(__name__)


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
        """Return the start offset for command data within a frame payload."""

        # Some hubs send command pages using slightly different layouts. In
        # particular, opcodes 0xF75D and 0xA35D place the device ID and command
        # records two bytes earlier than the typical DEVBTN_* frames. Account
        # for this to avoid trimming off the first record (e.g. the "Stop"
        # command in the newly observed response).
        if opcode in (
            OP_DEVBTN_PAGE_ALT1,
            OP_DEVBTN_PAGE_ALT2,
            OP_DEVBTN_PAGE_ALT3,
            OP_DEVBTN_PAGE_ALT4,
            OP_DEVBTN_PAGE_ALT5,
            OP_DEVBTN_PAGE_ALT6,
        ):
            return 4

        if opcode == OP_DEVBTN_SINGLE:
            return 7
        
        return 6

    def feed(
        self,
        opcode: int,
        raw_frame: bytes,
        *,
        dev_id_override: int | None = None,
    ) -> List[Tuple[int, bytes]]:
        """Feed a raw frame and return completed payloads when available."""

        if len(raw_frame) < 7:
            return []

        payload = raw_frame[4:-1]
        if len(payload) < 4:
            return []

        dev_id = dev_id_override if dev_id_override is not None else payload[3]
        if (
            opcode == OP_DEVBTN_SINGLE
            and dev_id_override is None
            and payload[:6] == b"\x01\x00\x01\x01\x00\x01"
            and len(payload) > 7
        ):
            dev_id = payload[7]
        frame_no = payload[2]
        burst = self._get_buffer(dev_id)

        if _is_devbtn_family(opcode) and opcode not in _KNOWN_DEVBTN_OPCODES:
            _LOGGER.debug(
                "Unknown dev-button family opcode 0x%04X seen in DeviceCommandAssembler.feed",
                opcode,
            )

        is_single_cmd = False
        if opcode == OP_DEVBTN_SINGLE:
            burst.frames.clear()
            burst.total_frames = 1
            is_single_cmd = True

        if opcode in (
            OP_DEVBTN_HEADER,
            OP_DEVBTN_PAGE_ALT1,
            OP_DEVBTN_PAGE_ALT2,
            OP_DEVBTN_PAGE_ALT3,
            OP_DEVBTN_PAGE_ALT4,
            OP_DEVBTN_PAGE_ALT5,
        ):
            if frame_no == 1 or burst.total_frames is None:
                burst.total_frames = int.from_bytes(payload[4:6], "big") if len(payload) >= 6 else None
                burst.frames.clear()
        elif burst.total_frames is None and opcode in (OP_DEVBTN_TAIL, OP_KEYMAP_EXTRA, OP_DEVBTN_MORE):
            burst.total_frames = frame_no

        data_start = self._data_offset(opcode)
        if opcode in (
            OP_DEVBTN_PAGE_ALT3,
            OP_DEVBTN_PAGE_ALT4,
            OP_DEVBTN_PAGE_ALT5,
        ) and payload[:6] == b"\x01\x00\x01\x01\x00\x01":
            data_start = 7
        if opcode in (
            OP_DEVBTN_HEADER,
            OP_DEVBTN_PAGE,
            OP_DEVBTN_TAIL,
            OP_KEYMAP_EXTRA,
            OP_DEVBTN_MORE,
        ) and payload[:2] == b"\x01\x00":
            data_start = 7 if opcode == OP_DEVBTN_HEADER else 3

        if (
            opcode == OP_DEVBTN_HEADER
            and len(payload) > data_start
            and payload[data_start] != dev_id
            and len(payload) > data_start + 1
            and payload[data_start + 1] == dev_id
        ):
            data_start += 1

        frame_payload = payload[data_start:] if len(payload) > data_start else b""
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
        elif (
            burst.total_frames
            and frames_are_contiguous
            and burst.total_frames > max_frame_no
            and burst.total_frames - max_frame_no <= 1
            and opcode in (OP_DEVBTN_TAIL, OP_KEYMAP_EXTRA, OP_DEVBTN_MORE)
        ):
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


def _decode_label(label_bytes: bytes) -> str:
    trimmed = label_bytes
    if trimmed.startswith(b"\x00\x00\x00\x00"):
        trimmed = trimmed[4:]

    trimmed = trimmed.rstrip(b"\x00")
    if not trimmed:
        return ""

    if len(trimmed) >= 4 and all(trimmed[i] == 0 for i in range(1, len(trimmed), 4)):
        try:
            utf32_label = trimmed.decode("utf-32-le").strip("\x00")
            if utf32_label:
                return utf32_label
        except UnicodeDecodeError:
            pass

    without_nulls = bytes(b for b in trimmed if b)
    try:
        ascii_label = without_nulls.decode("ascii").strip()
        if ascii_label:
            return ascii_label
    except UnicodeDecodeError:
        pass

    # Modern hubs sometimes send labels as plain ASCII instead of UTF-16.
    if b"\x00" not in trimmed:
        try:
            ascii_label = trimmed.decode("ascii").strip()
            if ascii_label:
                return ascii_label
        except UnicodeDecodeError:
            pass

    if len(trimmed) % 2:
        trimmed += b"\x00"

    try:
        utf_label = trimmed.decode("utf-16-be").strip("\x00")
        if utf_label:
            return utf_label
    except UnicodeDecodeError:
        pass

    try:
        return trimmed.decode("latin-1", errors="ignore").strip("\x00")
    except UnicodeDecodeError:
        return ""


def _matches_control_block(block: bytes) -> bool:
    if len(block) != 7:
        return False
    if block[0] in (0x03, 0x0D):
        return True
    if block[:5] == b"\x00\x00\x00\x00\x00":
        return True
    return block[:6] == b"\x1a\x00\x00\x00\x00\x17"


def iter_command_records(data: bytes, dev_id: int) -> Iterator[CommandRecord]:
    target = dev_id & 0xFF
    chunks: Iterable[bytes] = data.split(b"\xff")

    for chunk in chunks:
        if len(chunk) < 9:
            continue

        candidates = [i for i in range(len(chunk) - 1) if chunk[i] == target]
        if not candidates:
            candidates = [0]

        best_record: CommandRecord | None = None

        for idx in candidates:
            has_target = chunk[idx] == target
            command_index = idx + 1 if has_target else idx
            if command_index >= len(chunk):
                continue

            command_id = chunk[command_index]
            control_start = command_index + 1
            control_block = chunk[control_start : control_start + 7]

            label_start = None
            matched_control = len(control_block) == 7 and _matches_control_block(control_block)
            if matched_control:
                label_start = control_start + 7
                if control_block[:5] == b"\x00\x00\x00\x00\x00":
                    label_start -= 1
            else:
                label_start = command_index + 8

            if label_start >= len(chunk):
                continue

            # Some hubs send labels that are misaligned by one byte, leaving the
            # text prefixed with the last byte of the control block. Detect the
            # offset and realign before decoding.
            if (
                label_start % 2
                and label_start + 1 < len(chunk)
                and chunk[label_start + 1] == 0x00
            ):
                label_start += 1

            label = _decode_label(chunk[label_start:])
            if not label:
                continue

            if len(control_block) < 7:
                control_block = chunk[control_start:label_start]

            record = CommandRecord(target, command_id, control_block, label)
            if matched_control:
                yield record
                break

            if best_record is None:
                best_record = record
        else:
            # Exhausted candidates without yielding
            if best_record:
                yield best_record


__all__ = [
    "CommandRecord",
    "DeviceCommandAssembler",
    "iter_command_records",
]
