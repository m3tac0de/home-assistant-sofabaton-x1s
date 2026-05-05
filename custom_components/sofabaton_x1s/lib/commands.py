"""Helpers for assembling and parsing device-command bursts."""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Dict, Iterable, Iterator, List, Tuple

from ..const import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2
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


@dataclass(slots=True)
class _ButtonBurst:
    variant: str | None = None
    total_frames: int | None = None
    total_rows: int | None = None
    frames: Dict[int, bytes] = field(default_factory=dict)

    @property
    def received(self) -> int:
        return len(self.frames)


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


def _button_hub_line(hub_version: str | None) -> str:
    if hub_version == HUB_VERSION_X1:
        return "x1"
    if hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
        return "x1s_x2"
    return "shared"


def _command_hub_line(hub_version: str | None) -> str:
    if hub_version == HUB_VERSION_X1:
        return "x1"
    if hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
        return "x1s_x2"
    return "shared"


def _extract_button_activity_id(data: bytes) -> int | None:
    """Best-effort activity id discovery from an 18-byte row stream fragment."""

    if len(data) < 2:
        return None

    def _matches_row_shape(offset: int) -> bool:
        return (
            offset + 10 <= len(data)
            and data[offset + 3 : offset + 7] == b"\x00" * 4
        )

    for i in range(len(data) - 1):
        row_id = data[i + 1]
        if row_id in range(0xAE, 0xC2) and _matches_row_shape(i):
            return data[i]

    for i in range(len(data) - 1):
        row_id = data[i + 1]
        if row_id in range(0x01, 0x21) and _matches_row_shape(i):
            return data[i]
    return None


def parse_button_burst_frame(
    opcode: int,
    raw_frame: bytes,
    *,
    hub_version: str | None = None,
) -> ButtonBurstFrame | None:
    """Return parsed family metadata for a button-burst frame."""

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
            hub_line="x1s_x2" if hinted_line != "x1" else hinted_line,
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
            total_frames=total_frames,
            total_rows=None,
            has_row_data=True,
        )

    activity_id = _extract_button_activity_id(stream)
    if activity_id is None:
        return ButtonBurstFrame(
            opcode=opcode,
            hub_line="x1s_x2" if hinted_line != "x1" else hinted_line,
            layout_kind="marker_like",
            role="marker",
            frame_no=frame_no,
            activity_id=None,
            data_start=len(payload),
            total_frames=total_frames if total_frames and total_frames > 0 else None,
            total_rows=total_rows,
            has_row_data=False,
        )

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
        activity_id=activity_id,
        data_start=3,
        total_frames=total_frames if total_frames and total_frames > 0 else None,
        total_rows=total_rows,
        has_row_data=bool(stream),
    )


def parse_command_burst_frame(
    opcode: int,
    raw_frame: bytes,
    *,
    hub_version: str | None = None,
) -> CommandBurstFrame | None:
    """Return parsed family metadata for a command-burst frame."""

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
    is_single_layout = (
        opcode == OP_DEVBTN_SINGLE
        or (
            opcode_family(opcode) in (FAMILY_DEVBTNS, 0x0D)
            and len(payload) > 7
            and payload[:6] == b"\x01\x00\x01\x01\x00\x01"
        )
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
        hub_version: str | None = None,
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
        hub_version: str | None = None,
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


def _decode_label(label_bytes: bytes) -> str:
    raw = label_bytes
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
        pass

    # Final safety net: if decoding still failed but there are printable ASCII
    # bytes present (common with short, zero-padded labels), build a label from
    # those bytes to avoid dropping an otherwise valid record.
    visible = bytes(b for b in raw if 32 <= b <= 126)
    if visible:
        try:
            return visible.decode("ascii", errors="ignore").strip()
        except Exception:
            pass

    return ""


def _matches_control_block(block: bytes) -> bool:
    if len(block) != 7:
        return False
    if block[0] in (0x03, 0x0D):
        return True
    if block[:5] == b"\x00\x00\x00\x00\x00":
        return True
    return block[:6] == b"\x1a\x00\x00\x00\x00\x17"


def _iter_fixed_width_utf16_records(data: bytes, dev_id: int) -> Iterator[CommandRecord]:
    """Yield records for the X2 wifi fixed-width UTF-16 command layout.

    Some X2 wifi devices return command pages as tightly packed 70-byte records:

        [dev_id] [command_id] [0x1C] [7x 0x00] [UTF-16-BE label padded] [command_id]

    There are no ``0xFF`` separators between records, so the generic chunk-based
    parser treats the whole payload as one label. Detect that shape explicitly
    and only accept it when every record in the payload matches the pattern.
    """

    target = dev_id & 0xFF
    record_size = 70
    header_size = 10

    if len(data) < record_size * 2 or len(data) % record_size:
        return

    records: list[CommandRecord] = []
    for start in range(0, len(data), record_size):
        block = data[start : start + record_size]
        if (
            len(block) != record_size
            or block[0] != target
            or block[2] != 0x1C
            or block[3:10] != b"\x00" * 7
            or block[-1] != block[1]
        ):
            return

        label = _decode_label(block[header_size:-1])
        if not label:
            return

        records.append(
            CommandRecord(
                dev_id=target,
                command_id=block[1],
                control=block[2:10],
                label=label,
            )
        )

    yield from records


def _split_command_chunks(data: bytes, dev_id: int) -> Iterator[bytes]:
    """Split assembled command payloads on real record separators only.

    Modern hubs prefix follow-on records with ``0xFF`` before the next
    ``<dev_id> <command_id> <fmt>`` tuple. Some Unicode labels can legitimately
    contain ``0xFF`` bytes (for example U+00FF in UTF-16BE), so a plain
    ``data.split(b"\\xFF")`` corrupts those labels and invents fake records.
    """

    target = dev_id & 0xFF
    separators: list[int] = []

    for idx in range(0, len(data) - 7):
        if data[idx] != 0xFF or data[idx + 1] != target:
            continue
        if data[idx + 3] not in (0x03, 0x0A, 0x0D, 0x1A, 0x1C):
            continue
        if data[idx + 4 : idx + 8] != b"\x00" * 4:
            continue
        separators.append(idx)

    # Older command streams commonly terminate the final record with a bare
    # 0xFF byte. Preserve the old split semantics for that trailing delimiter
    # without treating 0x00 0xFF inside UTF-16BE labels as a separator.
    if data.endswith(b"\xFF"):
        separators.append(len(data) - 1)

    start = 0
    for sep in separators:
        if sep > start:
            yield data[start:sep]
        start = sep + 1

    if start < len(data):
        yield data[start:]


def iter_command_records(data: bytes, dev_id: int) -> Iterator[CommandRecord]:
    target = dev_id & 0xFF
    if b"\xff" not in data:
        fixed_width_records = tuple(_iter_fixed_width_utf16_records(data, dev_id))
        if fixed_width_records:
            yield from fixed_width_records
            return

    chunks: Iterable[bytes] = _split_command_chunks(data, dev_id)

    for chunk in chunks:
        if len(chunk) < 9:
            continue

        if chunk[0] == 0x04 and chunk[3:7] == b"\x00\x00\x00\x00":
            control_block = chunk[3:10] if len(chunk) >= 10 else chunk[3:]
            label_bytes = chunk[9:] if len(chunk) > 9 else b""
            label = _decode_label(label_bytes)
            if not label:
                if any(32 <= b <= 126 for b in label_bytes):
                    try:
                        label = bytes(b for b in label_bytes if 32 <= b <= 126).decode(
                            "ascii", errors="ignore"
                        ).strip()
                    except Exception:
                        label = ""
            if label:
                yield CommandRecord(chunk[2], chunk[1], control_block, label)
                continue

        candidates = [i for i in range(len(chunk) - 1) if chunk[i] == target]
        if not candidates:
            candidates = [0]

        best_record: CommandRecord | None = None

        for idx in candidates:
            has_target = chunk[idx] == target
            if has_target and idx > 0 and chunk[idx - 1] == 0x04:
                command_index = idx - 1
            else:
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
                and not (32 <= chunk[label_start] <= 126)
            ):
                label_start += 1

            label = _decode_label(chunk[label_start:])
            if not label:
                # Preserve records that clearly contain ASCII text even if the
                # primary decoding heuristics could not resolve the label (e.g.
                # short, zero-padded labels).
                label_bytes = chunk[label_start:]
                if any(32 <= b <= 126 for b in label_bytes):
                    try:
                        label = bytes(b for b in label_bytes if 32 <= b <= 126).decode(
                            "ascii", errors="ignore"
                        ).strip()
                    except Exception:
                        continue
                else:
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
    "ButtonBurstFrame",
    "CommandRecord",
    "CommandBurstFrame",
    "DeviceButtonAssembler",
    "DeviceCommandAssembler",
    "iter_command_records",
    "parse_button_burst_frame",
    "parse_command_burst_frame",
]
