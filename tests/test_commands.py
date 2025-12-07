import logging
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _ensure_stub_package(name: str, path: Path) -> None:
    if name in sys.modules:
        return
    module = types.ModuleType(name)
    module.__path__ = [str(path)]
    sys.modules[name] = module


_ensure_stub_package("custom_components", ROOT / "custom_components")
_ensure_stub_package("custom_components.sofabaton_x1s", ROOT / "custom_components" / "sofabaton_x1s")
_ensure_stub_package("custom_components.sofabaton_x1s.lib", ROOT / "custom_components" / "sofabaton_x1s" / "lib")

from custom_components.sofabaton_x1s.lib.commands import DeviceCommandAssembler
from custom_components.sofabaton_x1s.lib.frame_handlers import FrameContext
from custom_components.sofabaton_x1s.lib.opcode_handlers import (
    DeviceButtonHeaderHandler,
    DeviceButtonPayloadHandler,
    DeviceButtonSingleHandler,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (
    OP_DEVBTN_HEADER,
    OP_DEVBTN_PAGE,
    OP_DEVBTN_TAIL,
    OP_DEVBTN_SINGLE,
    SYNC0,
    SYNC1,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def _build_frame(opcode: int, frame_no: int, total_frames: int, dev_id: int, data: bytes) -> bytes:
    prefix = bytes([SYNC0, SYNC1, opcode >> 8, opcode & 0xFF])
    payload = b"\x00\x00" + bytes([frame_no, dev_id]) + total_frames.to_bytes(2, "big") + data
    frame_wo_checksum = prefix + payload
    checksum = sum(frame_wo_checksum) & 0xFF
    return frame_wo_checksum + bytes([checksum])


def test_device_command_assembly_tracks_frames() -> None:
    dev_id = 0x2A
    payload = b"legacy_payload_chunk" + b"hue_payload_chunk"
    data_part1 = payload[: len(payload) // 2]
    data_part2 = payload[len(payload) // 2 :]

    assembler = DeviceCommandAssembler()

    header_frame = _build_frame(OP_DEVBTN_HEADER, 1, 2, dev_id, data_part1)
    tail_frame = _build_frame(OP_DEVBTN_TAIL, 2, 2, dev_id, data_part2)

    assert assembler.feed(OP_DEVBTN_HEADER, header_frame) == []

    completed = assembler.feed(OP_DEVBTN_TAIL, tail_frame)
    assert len(completed) == 1

    assembled_dev_id, assembled_payload = completed[0]
    assert assembled_dev_id == dev_id
    assert assembled_payload == payload


def test_device_command_assembly_handles_single_command_page() -> None:
    assembler = DeviceCommandAssembler()
    raw = bytes.fromhex(
        "a5 5a 4d 5d 01 00 01 01 00 01 01 01 02 0d 00 00 00 00 00 79 00 45 00 78 00 69 00 74 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff d0"
    )

    opcode = int.from_bytes(raw[2:4], "big")
    assert opcode == OP_DEVBTN_SINGLE

    completed = assembler.feed(opcode, raw)

    assert len(completed) == 1
    dev_id, payload = completed[0]
    proxy = X1Proxy("127.0.0.1")
    parsed = proxy.parse_device_commands(payload, dev_id)

    assert parsed == {2: "Exit"}


def test_single_command_handler_logs_and_stores_state(caplog) -> None:
    proxy = X1Proxy("127.0.0.1")
    handler = DeviceButtonSingleHandler()

    raw = bytes.fromhex(
        "a5 5a 4d 5d 01 00 01 01 00 01 01 01 02 0d 00 00 00 00 00 79 00 45 00 78 00 69 00 74 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff d0"
    )

    payload = raw[4:-1]
    frame = FrameContext(
        proxy=proxy,
        opcode=OP_DEVBTN_SINGLE,
        direction="H→A",
        payload=payload,
        raw=raw,
        name="DEVBTN_SINGLE",
    )

    with caplog.at_level(logging.INFO):
        handler.handle(frame)

    assert proxy.state.commands[1] == {2: "Exit"}
    assert "2 : Exit" in caplog.text


def test_device_button_header_handler_merges_existing_commands(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1")
    handler = DeviceButtonHeaderHandler()

    dev_id = 0x2A
    proxy.state.commands[dev_id] = {1: "Existing"}

    def fake_parse(payload: bytes, parsed_dev_id: int) -> dict[int, str]:
        return {2: "New"}

    monkeypatch.setattr(proxy, "parse_device_commands", fake_parse)
    monkeypatch.setattr(
        proxy._command_assembler,
        "feed",
        lambda opcode, raw, dev_id_override=None: [(dev_id, b"payload")],
    )

    raw = _build_frame(OP_DEVBTN_HEADER, 1, 1, dev_id, bytes([dev_id]))
    payload = raw[4:-1]
    frame = FrameContext(
        proxy=proxy,
        opcode=OP_DEVBTN_HEADER,
        direction="H→A",
        payload=payload,
        raw=raw,
        name="DEVBTN_HEADER",
    )

    handler.handle(frame)

    assert proxy.state.commands[dev_id] == {1: "Existing", 2: "New"}


def test_device_button_payload_handler_merges_existing_commands(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1")
    handler = DeviceButtonPayloadHandler()

    dev_id = 0x2A
    proxy.state.commands[dev_id] = {1: "Existing"}

    def fake_parse(payload: bytes, parsed_dev_id: int) -> dict[int, str]:
        return {2: "New"}

    monkeypatch.setattr(proxy, "parse_device_commands", fake_parse)
    monkeypatch.setattr(
        proxy._command_assembler,
        "feed",
        lambda opcode, raw, dev_id_override=None: [(dev_id, b"payload")],
    )

    raw = _build_frame(OP_DEVBTN_PAGE, 1, 1, dev_id, b"\x00\x00")
    payload = raw[4:-1]
    frame = FrameContext(
        proxy=proxy,
        opcode=OP_DEVBTN_PAGE,
        direction="H→A",
        payload=payload,
        raw=raw,
        name="DEVBTN_PAGE",
    )

    handler.handle(frame)

    assert proxy.state.commands[dev_id] == {1: "Existing", 2: "New"}


def test_single_command_handler_routes_favorite_labels() -> None:
    proxy = X1Proxy("127.0.0.1")
    handler = DeviceButtonSingleHandler()

    proxy._favorite_label_requests[(1, 2)] = {0x66}

    raw = bytes.fromhex(
        "a5 5a 4d 5d 01 00 01 01 00 01 01 01 02 0d 00 00 00 00 00 79 00 45 00 78 00 69 00 74 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff d0"
    )

    payload = raw[4:-1]
    frame = FrameContext(
        proxy=proxy,
        opcode=OP_DEVBTN_SINGLE,
        direction="H→A",
        payload=payload,
        raw=raw,
        name="DEVBTN_SINGLE",
    )

    handler.handle(frame)

    assert proxy.state.commands == {}
    assert proxy.state.activity_favorite_labels[0x66] == {(1, 2): "Exit"}


def test_single_command_handler_matches_pending_device_when_id_differs(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1")
    handler = DeviceButtonSingleHandler()

    proxy._favorite_label_requests[(1, 2)] = {0x66}

    def fake_parse(payload: bytes, parsed_dev_id: int) -> dict[int, str]:
        return {1: "Exit"}

    monkeypatch.setattr(proxy, "parse_device_commands", fake_parse)
    monkeypatch.setattr(
        proxy._command_assembler,
        "feed",
        lambda opcode, raw, dev_id_override=None: [(1, b"payload")],
    )

    raw = _build_frame(OP_DEVBTN_SINGLE, 1, 1, 1, b"\x00\x00")
    payload = raw[4:-1]
    frame = FrameContext(
        proxy=proxy,
        opcode=OP_DEVBTN_SINGLE,
        direction="H→A",
        payload=payload,
        raw=raw,
        name="DEVBTN_SINGLE",
    )

    handler.handle(frame)

    assert proxy.state.commands[1] == {1: "Exit", 2: "Exit"}
    assert proxy.state.activity_favorite_labels[0x66] == {(1, 2): "Exit"}


@pytest.mark.parametrize(
    ("raw_hex", "expected_dev_id", "expected_cmd_id", "expected_label"),
    [
            (
                "a5 5a 4d 5d 01 00 01 01 00 01 01 06 01 0d 00 00 00 00 00 2a 00 4f 00 6b 00 "
                + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
                + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
                + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff a5",
                6,
                1,
                "Ok",
            ),
        (
            "a5 5a 4d 5d 01 00 01 01 00 01 01 03 03 0d 00 00 00 00 00 38 00 30 00 "
            + "00 " * 57
            + "ff 28",
            3,
            3,
            "0",
        ),
        (
            "a5 5a 4d 5d 01 00 01 01 00 01 01 03 07 0d 00 00 00 00 00 4c 00 34 00 "
            + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 44",
            3,
            7,
            "4",
        ),
    ],
)
def test_device_button_single_handler_uses_device_id_from_payload(
    caplog: pytest.LogCaptureFixture,
    raw_hex: str,
    expected_dev_id: int,
    expected_cmd_id: int,
    expected_label: str,
) -> None:
    proxy = X1Proxy("127.0.0.1")
    handler = DeviceButtonSingleHandler()

    raw = bytes.fromhex(raw_hex)
    payload = raw[4:-1]

    frame = FrameContext(
        proxy=proxy,
        opcode=OP_DEVBTN_SINGLE,
        direction="H→A",
        payload=payload,
        raw=raw,
        name="DEVBTN_SINGLE",
    )

    with caplog.at_level(logging.INFO):
        handler.handle(frame)

    assert proxy.state.commands[expected_dev_id] == {expected_cmd_id: expected_label}
    assert f"{expected_cmd_id} : {expected_label}" in caplog.text


@pytest.mark.parametrize(
    ("raw_hex", "expected_dev_id", "expected_cmd_id", "expected_label"),
    [
        (
            "a5 5a 4d 5d 01 00 01 01 00 01 01 06 01 0d 00 00 00 00 00 2a 00 4f 00 6b 00 "
            + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff a5",
            6,
            1,
            "Ok",
        ),
        (
            "a5 5a 4d 5d 01 00 01 01 00 01 01 03 03 0d 00 00 00 00 00 38 00 30 00 "
            + "00 " * 57
            + "ff 28",
            3,
            3,
            "0",
        ),
        (
            "a5 5a 4d 5d 01 00 01 01 00 01 01 03 07 0d 00 00 00 00 00 4c 00 34 00 "
            + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
            + "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 44",
            3,
            7,
            "4",
        ),
    ],
)
def test_parse_device_commands_realigns_utf16_label(
    raw_hex: str, expected_dev_id: int, expected_cmd_id: int, expected_label: str
) -> None:
    proxy = X1Proxy("127.0.0.1")
    assembler = proxy._command_assembler

    raw = bytes.fromhex(raw_hex)

    opcode = int.from_bytes(raw[2:4], "big")
    completed = assembler.feed(opcode, raw)

    assert completed
    dev_id, payload = completed[0]

    parsed = proxy.parse_device_commands(payload, dev_id)

    assert dev_id == expected_dev_id
    assert parsed == {expected_cmd_id: expected_label}


def test_parse_device_commands_handles_legacy_and_hue_formats() -> None:
    dev_id = 0x42

    legacy_record = (
        bytes([dev_id, 0x01])
        + b"\x03\x00\x00\x00\x00\x00\x01"
        + b"\x00\x00\x00\x00"
        + "Power".encode("utf-16-be")
    )

    hue_record = (
        bytes([dev_id, 0x02])
        + b"\x1a\x00\x00\x00\x00\x17\x02"
        + b"\x00\x00\x00\x00"
        + "Hue On".encode("utf-16-be")
    )

    assembled_payload = b"\xff".join([legacy_record, hue_record])

    proxy = X1Proxy("127.0.0.1")
    parsed = proxy.parse_device_commands(assembled_payload, dev_id)

    assert parsed == {1: "Power", 2: "Hue On"}


def test_parse_device_commands_handles_ascii_labels() -> None:
    proxy = X1Proxy("127.0.0.1")
    dev_id = 0x07

    ascii_payload = bytes.fromhex(
        "a5 5a f7 5d 01 00 01 01 00 02 0a 07 01 0d 00 00 00 00 00 ba 45 6a 65 63 74 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 02 0d 00 00 00 00 1d "
        "c1 47 72 65 61 74 65 72 31 30 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff "
        "07 03 0d 00 00 00 00 14 0c 4e 65 78 74 20 74 72 61 63 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff 07 04 0d 00 00 00 00 00 a6 50 61 75 73 65 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 ff 07 05 0d 00 00 00 00 00 92 50 6c 61 79 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 06 0d 00 00 00 00 33 72 50 72 65 76 69 6f 75 73 20 74 "
        "72 61 63 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 8e"
    )

    payload = ascii_payload[4:-1]
    opcode = int.from_bytes(ascii_payload[2:4], "big")
    data_offset = proxy._command_assembler._data_offset(opcode)  # type: ignore[attr-defined]
    assembled_payload = payload[data_offset:]

    parsed = proxy.parse_device_commands(assembled_payload, dev_id)

    assert parsed == {
        1: "Eject",
        2: "Greater10",
        3: "Next track",
        4: "Pause",
        5: "Play",
        6: "Previous track",
    }


def test_parse_device_commands_handles_early_data_offset() -> None:
    proxy = X1Proxy("127.0.0.1")
    dev_id = 0x07

    early_offset_payload = bytes.fromhex(
        "a5 5a a3 5d 01 00 02 07 07 0d 00 00 00 00 00 a1 53 74 6f 70 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 08 0d 00 00 00 00 34 40 54 69 6d 65 20 6d 6f 64 65 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 ff 07 09 0d 00 00 00 00 00 97 46 61 73 74 5f 66 6f 72 77 61 72 64 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 ff 07 0a 0d 00 00 00 00 01 88 4f 6b 2f 73 65 6c 65 63 74 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 ff ea"
    )

    payload = early_offset_payload[4:-1]
    opcode = int.from_bytes(early_offset_payload[2:4], "big")
    data_offset = proxy._command_assembler._data_offset(opcode)  # type: ignore[attr-defined]
    assembled_payload = payload[data_offset:]

    parsed = proxy.parse_device_commands(assembled_payload, dev_id)

    assert parsed == {
        13: "Stop",
        8: "Time mode",
        9: "Fast_forward",
        10: "Ok/select",
    }


def test_parse_device_commands_handles_alt_command_pages() -> None:
    frames_hex = (
        "a5 5a f7 5d 01 00 01 01 00 06 21 09 01 0a 00 00 00 00 17 13 50 6f 77 65 72 4f 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 02 0a 00 00 00 00 4e 21 45 6d 75 6c 61 74 65 64 20 41 70 70 20 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 03 0a 00 00 00 00 4e 2a 45 6d 75 6c 61 74 65 64 20 41 70 70 20 31 30 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 04 0a 00 00 00 00 4e 22 45 6d 75 6c 61 74 65 64 20 41 70 70 20 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 05 0a 00 00 00 00 4e 23 45 6d 75 6c 61 74 65 64 20 41 70 70 20 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 06 0a 00 00 00 00 4e 24 45 6d 75 6c 61 74 65 64 20 41 70 70 20 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 31",
        "a5 5a f3 5d 01 00 02 09 07 0a 00 00 00 00 4e 25 45 6d 75 6c 61 74 65 64 20 41 70 70 20 35 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 08 0a 00 00 00 00 4e 26 45 6d 75 6c 61 74 65 64 20 41 70 70 20 36 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 09 0a 00 00 00 00 4e 27 45 6d 75 6c 61 74 65 64 20 41 70 70 20 37 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0a 0a 00 00 00 00 4e 28 45 6d 75 6c 61 74 65 64 20 41 70 70 20 38 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0b 0a 00 00 00 00 4e 29 45 6d 75 6c 61 74 65 64 20 41 70 70 20 39 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0c 0a 00 00 00 00 00 d3 49 6e 66 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 8c",
        "a5 5a f3 5d 01 00 03 09 0d 0a 00 00 00 00 32 62 49 6e 70 75 74 41 56 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0e 0a 00 00 00 00 32 02 49 6e 70 75 74 48 44 4d 49 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 0f 0a 00 00 00 00 32 03 49 6e 70 75 74 48 44 4d 49 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 10 0a 00 00 00 00 32 04 49 6e 70 75 74 48 44 4d 49 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 11 0a 00 00 00 00 32 05 49 6e 70 75 74 48 44 4d 49 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 12 0a 00 00 00 00 07 5a 49 6e 70 75 74 54 75 6e 65 72 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 6f",
        "a5 5a f3 5d 01 00 04 09 13 0a 00 00 00 00 02 56 49 6e 73 74 61 6e 74 52 65 70 6c 61 79 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 14 0a 00 00 00 00 17 18 50 6f 77 65 72 4f 66 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 15 0a 00 00 00 00 00 74 42 61 63 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 16 0a 00 00 00 00 00 2f 44 6f 77 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 17 0a 00 00 00 00 00 97 46 77 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 18 0a 00 00 00 00 07 c7 48 6f 6d 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff f9",
        "a5 5a f3 5d 01 00 05 09 19 0a 00 00 00 00 00 30 4c 65 66 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1a 0a 00 00 00 00 00 2a 4f 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1b 0a 00 00 00 00 00 92 50 6c 61 79 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1c 0a 00 00 00 00 00 8d 52 65 76 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1d 0a 00 00 00 00 00 31 52 69 67 68 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 1e 0a 00 00 00 00 00 2e 55 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09",
        "a5 5a 7b 5d 01 00 06 09 1f 0a 00 00 00 00 00 33 56 6f 6c 75 6d 65 44 6f 77 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 20 0a 00 00 00 00 00 6a 56 6f 6c 75 6d 65 4d 75 74 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 09 21 0a 00 00 00 00 2e 77 56 6f 6c 75 6d 65 55 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 16",
    )

    frames = [bytes.fromhex(block) for block in frames_hex]

    assembler = DeviceCommandAssembler()
    completed: list[tuple[int, bytes]] = []
    dev_id = frames[0][11]

    for raw in frames:
        opcode = int.from_bytes(raw[2:4], "big")
        completed.extend(assembler.feed(opcode, raw, dev_id_override=dev_id))

    if not completed:
        completed.extend(assembler.finalize_contiguous(dev_id))

    assert len(completed) == 1
    assembled_dev_id, assembled_payload = completed[0]

    proxy = X1Proxy("127.0.0.1")
    parsed = proxy.parse_device_commands(assembled_payload, assembled_dev_id)

    assert parsed == {
        1: "PowerOn",
        2: "Emulated App 1",
        3: "Emulated App 10",
        4: "Emulated App 2",
        5: "Emulated App 3",
        6: "Emulated App 4",
        7: "Emulated App 5",
        8: "Emulated App 6",
        9: "Emulated App 7",
        10: "Emulated App 8",
        11: "Emulated App 9",
        12: "Info",
        13: "InputAV1",
        14: "InputHDMI1",
        15: "InputHDMI2",
        16: "InputHDMI3",
        17: "InputHDMI4",
        18: "InputTuner",
        19: "InstantReplay",
        20: "PowerOff",
        21: "Back",
        22: "Down",
        23: "Fwd",
        24: "Home",
        25: "Left",
        26: "Ok",
        27: "Play",
        28: "Rev",
        29: "Right",
        30: "Up",
        31: "VolumeDown",
        32: "VolumeMute",
        33: "VolumeUp",
    }


def test_parse_device_commands_handles_dev_id_one_sequence() -> None:
    frames_hex = (
        "a5 5a d9 5d 01 00 01 01 00 09 19 01 01 0d 00 00 00 00 00 39 00 42 00 72 00 69 00 67 00 68 00 74 00 6e 00 65 00 73 00 73 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 02 0d 00 00 00 00 00 79 00 45 00 78 00 69 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 03 0d 00 00 00 00 01 4b 00 47 00 75 00 69 00 64 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 26",
        "a5 5a d5 5d 01 00 02 01 04 0d 00 00 00 00 00 d3 00 49 00 6e 00 66 00 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 05 0d 00 00 00 00 00 a6 00 50 00 61 00 75 00 73 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 06 0d 00 00 00 00 00 92 00 50 00 6c 00 61 00 79 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 95",
        "a5 5a d5 5d 01 00 03 01 07 0d 00 00 00 00 00 01 00 50 00 6f 00 77 00 65 00 72 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 08 0d 00 00 00 00 04 42 00 50 00 6f 00 77 00 65 00 72 00 20 00 74 00 6f 00 67 00 67 00 6c 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 09 0d 00 00 00 00 04 31 00 53 00 65 00 74 00 74 00 69 00 6e 00 67 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 8a",
        "a5 5a d5 5d 01 00 04 01 0a 0d 00 00 00 00 01 e2 00 53 00 6f 00 75 00 6e 00 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 0b 0d 00 00 00 00 19 16 00 53 00 6f 00 75 00 72 00 63 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 0c 0d 00 00 00 00 00 a1 00 53 00 74 00 6f 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 51",
        "a5 5a d5 5d 01 00 05 01 0d 0d 00 00 00 00 00 74 00 42 00 61 00 63 00 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 0e 0d 00 00 00 00 00 2c 00 43 00 68 00 61 00 6e 00 6e 00 65 00 6c 00 5f 00 64 00 6f 00 77 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 0f 0d 00 00 00 00 2e 78 00 43 00 68 00 61 00 6e 00 6e 00 65 00 6c 00 5f 00 75 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 0c",
        "a5 5a d5 5d 01 00 06 01 10 0d 00 00 00 00 07 c7 00 48 00 6f 00 6d 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 11 0d 00 00 00 00 00 2d 00 4d 00 65 00 6e 00 75 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 12 0d 00 00 00 00 00 6a 00 4d 00 75 00 74 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff b0",
        "a5 5a d5 5d 01 00 07 01 13 0d 00 00 00 00 00 2f 00 4e 00 61 00 76 00 69 00 67 00 61 00 74 00 65 00 5f 00 64 00 6f 00 77 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 14 0d 00 00 00 00 00 30 00 4e 00 61 00 76 00 69 00 67 00 61 00 74 00 65 00 5f 00 6c 00 65 00 66 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 15 0d 00 00 00 00 00 31 00 4e 00 61 00 76 00 69 00 67 00 61 00 74 00 65 00 5f 00 72 00 69 00 67 00 68 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 57",
        "a5 5a d5 5d 01 00 08 01 16 0d 00 00 00 00 00 2e 00 4e 00 61 00 76 00 69 00 67 00 61 00 74 00 65 00 5f 00 75 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 17 0d 00 00 00 00 01 88 00 4f 00 6b 00 2f 00 73 00 65 00 6c 00 65 00 63 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 01 18 0d 00 00 00 00 00 33 00 56 00 6f 00 6c 00 75 00 6d 00 65 00 5f 00 64 00 6f 00 77 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff fb",
        "a5 5a 49 5d 01 00 09 01 19 0d 00 00 00 00 2e 77 00 56 00 6f 00 6c 00 75 00 6d 00 65 00 5f 00 75 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 36",
    )

    frames = [bytes.fromhex(block) for block in frames_hex]

    assembler = DeviceCommandAssembler()
    completed: list[tuple[int, bytes]] = []
    dev_id = frames[0][11]

    for raw in frames:
        opcode = int.from_bytes(raw[2:4], "big")
        completed.extend(assembler.feed(opcode, raw, dev_id_override=dev_id))

    if not completed:
        completed.extend(assembler.finalize_contiguous(dev_id))

    assert len(completed) == 1
    assembled_dev_id, assembled_payload = completed[0]

    proxy = X1Proxy("127.0.0.1")
    parsed = proxy.parse_device_commands(assembled_payload, assembled_dev_id)

    assert parsed == {
        1: "Brightness",
        2: "Exit",
        3: "Guide",
        4: "Info",
        5: "Pause",
        6: "Play",
        7: "Power",
        8: "Power toggle",
        9: "Setting",
        10: "Sound",
        11: "Source",
        12: "Stop",
        13: "Back",
        14: "Channel_down",
        15: "Channel_up",
        16: "Home",
        17: "Menu",
        18: "Mute",
        19: "Navigate_down",
        20: "Navigate_left",
        21: "Navigate_right",
        22: "Navigate_up",
        23: "Ok/select",
        24: "Volume_down",
        25: "Volume_up",
    }


def test_parse_device_commands_handles_req_commands_responses() -> None:
    frames_hex = (
        "a5 5a 2f 5d 01 00 01 01 00 01 01 01 1d 0a 00 00 00 00 00 2e 55 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff aa",
        "a5 5a 2f 5d 01 00 01 01 00 01 01 02 9e 0d 00 00 00 00 2e 77 56 6f 6c 75 6d 65 5f 75 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 9d",
        "a5 5a 2f 5d 01 00 01 01 00 01 01 06 0b 0d 00 00 00 00 00 6a 4d 75 74 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff b2",
    )

    frames = [bytes.fromhex(block) for block in frames_hex]
    assembler = DeviceCommandAssembler()
    completed: list[tuple[int, bytes]] = []

    for raw in frames:
        opcode = int.from_bytes(raw[2:4], "big")
        dev_id = raw[11]
        completed.extend(assembler.feed(opcode, raw, dev_id_override=dev_id))

    assert len(completed) == 3

    proxy = X1Proxy("127.0.0.1")
    parsed = {dev_id: proxy.parse_device_commands(payload, dev_id) for dev_id, payload in completed}

    assert parsed == {
        1: {29: "Up"},
        2: {158: "Volume_up"},
        6: {11: "Mute"},
    }


def test_parse_device_commands_handles_extended_req_commands_sequence() -> None:
    frames_hex = (
        "a5 5a d9 5d 01 00 01 01 00 07 14 02 01 1a 00 00 00 00 17 18 00 43 00 6c 00 65 00 6f 00 20 00 6b 00 61 00 6d 00 65 00 72 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 02 1a 00 00 00 00 17 13 00 43 00 6c 00 65 00 6f 00 20 00 6b 00 61 00 6d 00 65 00 72 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 03 1a 00 00 00 00 17 18 00 47 00 61 00 72 00 61 00 67 00 65 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 92",
        "a5 5a d5 5d 01 00 02 02 04 1a 00 00 00 00 17 13 00 47 00 61 00 72 00 61 00 67 00 65 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 05 1a 00 00 00 00 17 18 00 48 00 61 00 6c 00 6c 00 77 00 61 00 79 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 06 1a 00 00 00 00 17 13 00 48 00 61 00 6c 00 6c 00 77 00 61 00 79 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 57",
        "a5 5a d5 5d 01 00 03 02 07 1a 00 00 00 00 17 18 00 48 00 75 00 69 00 73 00 20 00 61 00 72 00 65 00 61 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 08 1a 00 00 00 00 17 13 00 48 00 75 00 69 00 73 00 20 00 61 00 72 00 65 00 61 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 09 1a 00 00 00 00 17 18 00 48 00 75 00 69 00 73 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 16",
        "a5 5a d5 5d 01 00 04 02 0a 1a 00 00 00 00 17 13 00 48 00 75 00 69 00 73 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 0b 1a 00 00 00 00 17 18 00 49 00 6e 00 6e 00 65 00 20 00 4b 00 61 00 6d 00 65 00 72 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 0c 1a 00 00 00 00 17 13 00 49 00 6e 00 6e 00 65 00 20 00 4b 00 61 00 6d 00 65 00 72 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 4d",
        "a5 5a d5 5d 01 00 05 02 0d 1a 00 00 00 00 17 18 00 6b 00 61 00 6e 00 74 00 6f 00 6f 00 72 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 0e 1a 00 00 00 00 17 13 00 6b 00 61 00 6e 00 74 00 6f 00 6f 00 72 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 0f 1a 00 00 00 00 17 18 00 4b 00 65 00 72 00 73 00 74 00 76 00 65 00 72 00 6c 00 69 00 63 00 68 00 74 00 69 00 6e 00 67 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 91",
        "a5 5a d5 5d 01 00 06 02 10 1a 00 00 00 00 17 13 00 4b 00 65 00 72 00 73 00 74 00 76 00 65 00 72 00 6c 00 69 00 63 00 68 00 74 00 69 00 6e 00 67 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 11 1a 00 00 00 00 17 18 00 53 00 6f 00 75 00 73 00 74 00 65 00 72 00 72 00 61 00 69 00 6e 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 02 12 1a 00 00 00 00 17 13 00 53 00 6f 00 75 00 73 00 74 00 65 00 72 00 72 00 61 00 69 00 6e 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 7a",
    )

    frames = [bytes.fromhex(block) for block in frames_hex]
    assembler = DeviceCommandAssembler()
    completed: list[tuple[int, bytes]] = []
    dev_id = frames[0][11]

    for raw in frames:
        opcode = int.from_bytes(raw[2:4], "big")
        completed.extend(assembler.feed(opcode, raw, dev_id_override=dev_id))

    if not completed:
        completed.extend(assembler.finalize_contiguous(dev_id))

    assert len(completed) == 1
    assembled_dev_id, assembled_payload = completed[0]

    proxy = X1Proxy("127.0.0.1")
    parsed = proxy.parse_device_commands(assembled_payload, assembled_dev_id)

    assert parsed == {
        1: "Cleo kamer off",
        2: "Cleo kamer on",
        3: "Garage off",
        4: "Garage on",
        5: "Hallway off",
        6: "Hallway on",
        7: "Huis area off",
        8: "Huis area on",
        9: "Huis off",
        10: "Huis on",
        11: "Inne Kamer off",
        12: "Inne Kamer on",
        13: "kantoor off",
        14: "kantoor on",
        15: "Kerstverlichting off",
        16: "Kerstverlichting on",
        17: "Sousterrain off",
        18: "Sousterrain on",
    }


def test_parse_device_commands_handles_req_commands_toggle_office() -> None:
    frames_hex = (
        "a5 5a d9 5d 01 00 01 01 00 02 05 08 01 1c 00 00 00 00 00 00 00 54 00 00 00 6f 00 00 00 67 00 00 00 67 00 00 00 6c 00 00 00 65 00 00 00 20 00 00 00 4f 00 00 00 66 00 00 00 66 00 00 00 69 00 00 00 63 00 00 00 65 00 00 00 20 00 00 00 4c 00 00 ff 08 02 1c 00 00 00 00 00 00 00 74 00 65 00 73 00 74 00 62 00 75 00 74 00 74 00 6f 00 6e 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 08 03 1c 00 00 00 00 00 00 00 74 00 65 00 73 00 74 00 62 00 74 00 6e 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff ad",
        "a5 5a 8f 5d 01 00 02 08 04 1c 00 00 00 00 00 00 00 74 00 73 00 74 00 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 08 05 1c 00 00 00 00 00 00 00 74 00 73 00 74 00 35 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 5c",
    )

    frames = [bytes.fromhex(block) for block in frames_hex]
    assembler = DeviceCommandAssembler()

    dev_id = 0x08
    completed: list[tuple[int, bytes]] = []

    for raw in frames:
        opcode = int.from_bytes(raw[2:4], "big")
        completed.extend(assembler.feed(opcode, raw, dev_id_override=dev_id))

    assert len(completed) == 1

    proxy = X1Proxy("127.0.0.1")
    assembled_dev_id, assembled_payload = completed[0]
    parsed = proxy.parse_device_commands(assembled_payload, assembled_dev_id)

    assert parsed == {
        1: "Toggle Office L",
        2: "testbutton2",
        3: "testbtn3",
        4: "tst4",
        5: "tst5",
    }


def test_parse_device_commands_handles_dev_id_three_sequence() -> None:
    """Full command table for dev_id == 3 should be parsed correctly."""

    proxy = X1Proxy("127.0.0.1")

    # Each line is one frame, exactly as captured from the device.
    # Paste the full hex stream from the question here, unchanged:
    hex_stream = """
a5 5a d9 5d 01 00 01 01 00 29 79 03 01 0d 00 00 00 00 17 18 00 50 00 6f 00 77 00 65 00 72 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 02 0d 00 00 00 00 17 13 00 50 00 6f 00 77 00 65 00 72 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 03 0d 00 00 00 00 00 38 00 30 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 40
a5 5a d5 5d 01 00 02 03 04 0d 00 00 00 00 00 3d 00 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 05 0d 00 00 00 00 00 42 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 06 0d 00 00 00 00 00 47 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff cc
a5 5a d5 5d 01 00 03 03 07 0d 00 00 00 00 00 4c 00 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 08 0d 00 00 00 00 00 51 00 35 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 09 0d 00 00 00 00 00 56 00 36 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 0c
a5 5a d5 5d 01 00 04 03 0a 0d 00 00 00 00 00 5b 00 37 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 0b 0d 00 00 00 00 00 60 00 38 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 0c 0d 00 00 00 00 00 65 00 39 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 4c
a5 5a d5 5d 01 00 05 03 0d 0d 00 00 00 00 00 12 00 45 00 6e 00 65 00 72 00 67 00 79 00 5f 00 73 00 61 00 76 00 69 00 6e 00 67 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 0e 0d 00 00 00 00 00 16 00 53 00 6c 00 65 00 65 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 0f 0d 00 00 00 00 42 2a 00 41 00 75 00 64 00 69 00 6f 00 20 00 64 00 65 00 6c 00 61 00 79 00 20 00 64 00 6f 00 77 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 65
a5 5a d5 5d 01 00 06 03 10 0d 00 00 00 00 42 2b 00 41 00 75 00 64 00 69 00 6f 00 20 00 64 00 65 00 6c 00 61 00 79 00 20 00 6d 00 6f 00 64 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 11 0d 00 00 00 00 42 2c 00 41 00 75 00 64 00 69 00 6f 00 20 00 64 00 65 00 6c 00 61 00 79 00 20 00 75 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 12 0d 00 00 00 00 42 30 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 61 00 75 00 74 00 6f 00 20 00 65 00 71 00 78 00 74 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 36
a5 5a d5 5d 01 00 07 03 13 0d 00 00 00 00 42 2d 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 73 00 78 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 14 0d 00 00 00 00 42 2e 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 73 00 78 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 15 0d 00 00 00 00 42 31 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 73 00 78 00 20 00 73 00 65 00 6c 00 65 00 63 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 3e
a5 5a d5 5d 01 00 08 03 16 0d 00 00 00 00 42 2f 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 73 00 78 00 20 00 77 00 69 00 64 00 65 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 17 0d 00 00 00 00 42 32 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 79 00 6e 00 20 00 65 00 71 00 20 00 30 00 20 00 64 00 62 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 18 0d 00 00 00 00 42 33 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 79 00 6e 00 20 00 65 00 71 00 20 00 31 00 35 00 64 00 62 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 84
a5 5a d5 5d 01 00 09 03 19 0d 00 00 00 00 42 33 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 79 00 6e 00 20 00 65 00 71 00 20 00 31 00 35 00 64 00 62 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 1a 0d 00 00 00 00 42 34 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 79 00 6e 00 20 00 65 00 71 00 20 00 35 00 20 00 64 00 62 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 1b 0d 00 00 00 00 42 35 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 79 00 6e 00 20 00 76 00 6f 00 6c 00 20 00 64 00 61 00 79 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff a0
a5 5a d5 5d 01 00 0a 03 1c 0d 00 00 00 00 42 36 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 79 00 6e 00 20 00 76 00 6f 00 6c 00 20 00 65 00 76 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 1d 0d 00 00 00 00 42 37 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 64 00 79 00 6e 00 20 00 76 00 6f 00 6c 00 20 00 6d 00 69 00 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 1e 0d 00 00 00 00 42 38 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 67 00 72 00 61 00 70 00 68 00 69 00 63 00 20 00 65 00 71 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 96
a5 5a d5 5d 01 00 0b 03 1f 0d 00 00 00 00 3b 87 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 6c 00 66 00 63 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 20 0d 00 00 00 00 41 c6 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 6c 00 66 00 63 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 21 0d 00 00 00 00 41 c7 00 41 00 75 00 64 00 79 00 73 00 73 00 65 00 79 00 20 00 6c 00 66 00 63 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff f7
a5 5a d5 5d 01 00 0c 03 22 0d 00 00 00 00 42 39 00 45 00 63 00 6f 00 20 00 6d 00 6f 00 64 00 65 00 20 00 61 00 75 00 74 00 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 23 0d 00 00 00 00 42 3a 00 45 00 63 00 6f 00 20 00 6d 00 6f 00 64 00 65 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 24 0d 00 00 00 00 42 3b 00 45 00 63 00 6f 00 20 00 6d 00 6f 00 64 00 65 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 0d
a5 5a d5 5d 01 00 0d 03 25 0d 00 00 00 00 00 79 00 45 00 78 00 69 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 26 0d 00 00 00 00 01 4b 00 47 00 75 00 69 00 64 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 27 0d 00 00 00 00 42 3c 00 48 00 64 00 6d 00 69 00 20 00 61 00 75 00 64 00 69 00 6f 00 20 00 6f 00 75 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff d5
a5 5a d5 5d 01 00 0e 03 28 0d 00 00 00 00 a1 3f 00 48 00 64 00 6d 00 69 00 20 00 41 00 75 00 64 00 69 00 6f 00 20 00 4f 00 75 00 74 00 54 00 76 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 29 0d 00 00 00 00 a1 3e 00 48 00 64 00 6d 00 69 00 20 00 41 00 75 00 64 00 69 00 6f 00 20 00 51 00 75 00 74 00 20 00 41 00 6d 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 2a 0d 00 00 00 00 42 3d 00 48 00 64 00 6d 00 69 00 20 00 61 00 75 00 64 00 69 00 6f 00 20 00 74 00 76 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff c6
a5 5a d5 5d 01 00 0f 03 2b 0d 00 00 00 00 42 3e 00 48 00 64 00 6d 00 69 00 20 00 63 00 65 00 63 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 2c 0d 00 00 00 00 42 3f 00 48 00 64 00 6d 00 69 00 20 00 63 00 65 00 63 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 2d 0d 00 00 00 00 a1 40 00 48 00 44 00 4d 00 49 00 20 00 4d 00 6f 00 6e 00 69 00 74 00 6f 00 72 00 20 00 53 00 65 00 6c 00 65 00 63 00 74 00 20 00 41 00 75 00 74 00 6f 00 00 00 00 00 00 00 00 00 00 00 00 ff 29
a5 5a d5 5d 01 00 10 03 2e 0d 00 00 00 00 8d f5 00 48 00 44 00 4d 00 49 00 20 00 4d 00 6f 00 6e 00 69 00 74 00 6f 00 72 00 20 00 53 00 65 00 6c 00 65 00 63 00 74 00 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 2f 0d 00 00 00 00 8d f6 00 48 00 44 00 4d 00 49 00 20 00 4d 00 6f 00 6e 00 69 00 74 00 6f 00 72 00 20 00 53 00 65 00 6c 00 65 00 63 00 74 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 30 0d 00 00 00 00 00 d3 00 49 00 6e 00 66 00 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 17
a5 5a d5 5d 01 00 11 03 31 0d 00 00 00 00 00 6f 00 49 00 6e 00 70 00 75 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 32 0d 00 00 00 00 32 87 00 49 00 6e 00 70 00 75 00 74 00 20 00 61 00 6d 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 33 0d 00 00 00 00 33 10 00 49 00 6e 00 70 00 75 00 74 00 20 00 61 00 75 00 78 00 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 2e
a5 5a d5 5d 01 00 12 03 34 0d 00 00 00 00 33 11 00 49 00 6e 00 70 00 75 00 74 00 20 00 61 00 75 00 78 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 35 0d 00 00 00 00 36 67 00 49 00 6e 00 70 00 75 00 74 00 20 00 62 00 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 36 0d 00 00 00 00 36 68 00 49 00 6e 00 70 00 75 00 74 00 20 00 62 00 6c 00 75 00 2d 00 72 00 61 00 79 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 28
a5 5a d5 5d 01 00 13 03 37 0d 00 00 00 00 33 36 00 49 00 6e 00 70 00 75 00 74 00 20 00 62 00 6c 00 75 00 65 00 74 00 6f 00 6f 00 74 00 68 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 38 0d 00 00 00 00 36 21 00 49 00 6e 00 70 00 75 00 74 00 20 00 63 00 62 00 6c 00 2f 00 73 00 61 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 39 0d 00 00 00 00 33 12 00 49 00 6e 00 70 00 75 00 74 00 20 00 63 00 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff f4
a5 5a d5 5d 01 00 14 03 3a 0d 00 00 00 00 32 8b 00 49 00 6e 00 70 00 75 00 74 00 20 00 64 00 76 00 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 3b 0d 00 00 00 00 32 8c 00 49 00 6e 00 70 00 75 00 74 00 20 00 66 00 6d 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 3c 0d 00 00 00 00 34 c4 00 49 00 6e 00 70 00 75 00 74 00 20 00 67 00 61 00 6d 00 65 00 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03
a5 5a d5 5d 01 00 15 03 3d 0d 00 00 00 00 34 c5 00 49 00 6e 00 70 00 75 00 74 00 20 00 67 00 61 00 6d 00 65 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 3e 0d 00 00 00 00 32 a4 00 49 00 6e 00 70 00 75 00 74 00 20 00 68 00 65 00 6f 00 73 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 3f 0d 00 00 00 00 4e 14 00 49 00 6e 00 70 00 75 00 74 00 20 00 49 00 6e 00 74 00 65 00 72 00 6e 00 65 00 74 00 20 00 52 00 61 00 64 00 69 00 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff c2
a5 5a d5 5d 01 00 16 03 40 0d 00 00 00 00 32 a5 00 49 00 6e 00 70 00 75 00 74 00 20 00 6d 00 65 00 64 00 69 00 61 00 20 00 70 00 6c 00 61 00 79 00 65 00 72 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 41 0d 00 00 00 00 36 26 00 49 00 6e 00 70 00 75 00 74 00 20 00 70 00 61 00 6e 00 64 00 6f 00 72 00 61 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 42 0d 00 00 00 00 33 14 00 49 00 6e 00 70 00 75 00 74 00 20 00 70 00 68 00 6f 00 6e 00 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff f8
a5 5a d5 5d 01 00 17 03 43 0d 00 00 00 00 36 6b 00 49 00 6e 00 70 00 75 00 74 00 20 00 73 00 69 00 72 00 69 00 75 00 73 00 20 00 78 00 6d 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 44 0d 00 00 00 00 32 a6 00 49 00 6e 00 70 00 75 00 74 00 20 00 73 00 70 00 6f 00 74 00 69 00 66 00 79 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 45 0d 00 00 00 00 32 91 00 49 00 6e 00 70 00 75 00 74 00 20 00 74 00 76 00 20 00 61 00 75 00 64 00 69 00 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff dc
a5 5a d5 5d 01 00 18 03 46 0d 00 00 00 00 28 08 00 49 00 6e 00 70 00 75 00 74 00 61 00 75 00 78 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 47 0d 00 00 00 00 05 23 00 49 00 6e 00 70 00 75 00 74 00 75 00 73 00 62 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 48 0d 00 00 00 00 05 f6 00 4d 00 6f 00 64 00 65 00 20 00 67 00 61 00 6d 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 96
a5 5a d5 5d 01 00 19 03 49 0d 00 00 00 00 32 92 00 4d 00 6f 00 64 00 65 00 20 00 6a 00 61 00 7a 00 7a 00 20 00 63 00 6c 00 75 00 62 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 4a 0d 00 00 00 00 32 93 00 4d 00 6f 00 64 00 65 00 20 00 6d 00 61 00 74 00 72 00 69 00 78 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 4b 0d 00 00 00 00 42 40 00 4d 00 6f 00 64 00 65 00 20 00 6d 00 6f 00 6e 00 6f 00 20 00 6d 00 6f 00 76 00 69 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 63
a5 5a d5 5d 01 00 1a 03 4c 0d 00 00 00 00 2f 55 00 4d 00 6f 00 64 00 65 00 20 00 6d 00 6f 00 76 00 69 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 4d 0d 00 00 00 00 05 f8 00 4d 00 6f 00 64 00 65 00 20 00 6d 00 75 00 73 00 69 00 63 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 4e 0d 00 00 00 00 2f 4c 00 4d 00 6f 00 64 00 65 00 20 00 70 00 75 00 72 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 48
a5 5a d5 5d 01 00 1b 03 4f 0d 00 00 00 00 32 95 00 4d 00 6f 00 64 00 65 00 20 00 70 00 75 00 72 00 65 00 20 00 64 00 69 00 72 00 65 00 63 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 50 0d 00 00 00 00 32 96 00 4d 00 6f 00 64 00 65 00 20 00 72 00 6f 00 63 00 6b 00 20 00 61 00 72 00 65 00 6e 00 61 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 51 0d 00 00 00 00 32 97 00 4d 00 6f 00 64 00 65 00 20 00 73 00 74 00 61 00 6e 00 64 00 61 00 72 00 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 2f
a5 5a d5 5d 01 00 1c 03 52 0d 00 00 00 00 32 98 00 4d 00 6f 00 64 00 65 00 20 00 73 00 74 00 65 00 72 00 65 00 6f 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 53 0d 00 00 00 00 32 99 00 4d 00 6f 00 64 00 65 00 20 00 76 00 69 00 64 00 65 00 6f 00 20 00 67 00 61 00 6d 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 54 0d 00 00 00 00 32 9a 00 4d 00 6f 00 64 00 65 00 20 00 76 00 69 00 72 00 74 00 75 00 61 00 6c 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 2e
a5 5a d5 5d 01 00 1d 03 55 0d 00 00 00 00 42 41 00 4d 00 6f 00 6e 00 69 00 74 00 6f 00 72 00 20 00 73 00 65 00 6c 00 65 00 63 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 56 0d 00 00 00 00 00 a6 00 50 00 61 00 75 00 73 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 57 0d 00 00 00 00 00 92 00 50 00 6c 00 61 00 79 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 55
a5 5a d5 5d 01 00 1e 03 58 0d 00 00 00 00 00 01 00 50 00 6f 00 77 00 65 00 72 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 59 0d 00 00 00 00 04 42 00 50 00 6f 00 77 00 65 00 72 00 20 00 74 00 6f 00 67 00 67 00 6c 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 5a 0d 00 00 00 00 2b ee 00 50 00 72 00 65 00 73 00 65 00 74 00 6e 00 65 00 78 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff d6
a5 5a d5 5d 01 00 1f 03 5b 0d 00 00 00 00 2b ef 00 50 00 72 00 65 00 73 00 65 00 74 00 70 00 72 00 65 00 76 00 69 00 6f 00 75 00 73 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 5c 0d 00 00 00 00 32 9d 00 51 00 75 00 69 00 63 00 6b 00 20 00 73 00 65 00 6c 00 65 00 63 00 74 00 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 5d 0d 00 00 00 00 32 9e 00 51 00 75 00 69 00 63 00 6b 00 20 00 73 00 65 00 6c 00 65 00 63 00 74 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff d8
a5 5a d5 5d 01 00 20 03 5e 0d 00 00 00 00 32 9f 00 51 00 75 00 69 00 63 00 6b 00 20 00 73 00 65 00 6c 00 65 00 63 00 74 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 5f 0d 00 00 00 00 32 a0 00 51 00 75 00 69 00 63 00 6b 00 20 00 73 00 65 00 6c 00 65 00 63 00 74 00 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 60 0d 00 00 00 00 15 3d 00 52 00 65 00 73 00 6f 00 6c 00 75 00 74 00 69 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 66
a5 5a d5 5d 01 00 21 03 61 0d 00 00 00 00 a1 42 00 52 00 65 00 73 00 6f 00 6c 00 75 00 74 00 69 00 6f 00 6e 00 28 00 48 00 64 00 6d 00 69 00 29 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 62 0d 00 00 00 00 36 fc 00 52 00 65 00 73 00 74 00 6f 00 72 00 65 00 72 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 63 0d 00 00 00 00 18 99 00 52 00 65 00 74 00 75 00 72 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 49
a5 5a d5 5d 01 00 22 03 64 0d 00 00 00 00 32 4f 00 53 00 65 00 74 00 75 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 65 0d 00 00 00 00 0d 72 00 53 00 6b 00 69 00 70 00 20 00 66 00 6f 00 72 00 77 00 61 00 72 00 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 66 0d 00 00 00 00 04 8a 00 53 00 74 00 61 00 74 00 75 00 73 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 7f
a5 5a d5 5d 01 00 23 03 67 0d 00 00 00 00 00 a1 00 53 00 74 00 6f 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 68 0d 00 00 00 00 42 43 00 54 00 72 00 69 00 67 00 67 00 65 00 72 00 20 00 31 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 69 0d 00 00 00 00 42 45 00 54 00 72 00 69 00 67 00 67 00 65 00 72 00 20 00 32 00 20 00 6f 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 52
a5 5a d5 5d 01 00 24 03 6a 0d 00 00 00 00 42 42 00 54 00 72 00 69 00 67 00 67 00 65 00 72 00 31 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 6b 0d 00 00 00 00 42 44 00 54 00 72 00 69 00 67 00 67 00 65 00 72 00 32 00 20 00 6f 00 66 00 66 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 6c 0d 00 00 00 00 00 74 00 42 00 61 00 63 00 6b 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 74
a5 5a d5 5d 01 00 25 03 6d 0d 00 00 00 00 00 2c 00 43 00 68 00 61 00 6e 00 6e 00 65 00 6c 00 5f 00 64 00 6f 00 77 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 6e 0d 00 00 00 00 2e 78 00 43 00 68 00 61 00 6e 00 6e 00 65 00 6c 00 5f 00 75 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 6f 0d 00 00 00 00 07 c7 00 48 00 6f 00 6d 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff c4
a5 5a d5 5d 01 00 26 03 70 0d 00 00 00 00 00 2d 00 4d 00 65 00 6e 00 75 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 71 0d 00 00 00 00 00 6a 00 4d 00 75 00 74 00 65 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 72 0d 00 00 00 00 00 2f 00 4e 00 61 00 76 00 69 00 67 00 61 00 74 00 65 00 5f 00 64 00 6f 00 77 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 14
a5 5a d5 5d 01 00 27 03 73 0d 00 00 00 00 00 30 00 4e 00 61 00 76 00 69 00 67 00 61 00 74 00 65 00 5f 00 6c 00 65 00 66 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 74 0d 00 00 00 00 00 31 00 4e 00 61 00 76 00 69 00 67 00 61 00 74 00 65 00 5f 00 72 00 69 00 67 00 68 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 75 0d 00 00 00 00 00 2e 00 4e 00 61 00 76 00 69 00 67 00 61 00 74 00 65 00 5f 00 75 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff c9
a5 5a d5 5d 01 00 28 03 76 0d 00 00 00 00 01 88 00 4f 00 6b 00 2f 00 73 00 65 00 6c 00 65 00 63 00 74 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 77 0d 00 00 00 00 37 8f 00 53 00 6b 00 69 00 70 00 20 00 62 00 61 00 63 00 6b 00 77 00 61 00 72 00 64 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 03 78 0d 00 00 00 00 00 33 00 56 00 6f 00 6c 00 75 00 6d 00 65 00 5f 00 64 00 6f 00 77 00 6e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 5c
a5 5a 49 5d 01 00 29 03 79 0d 00 00 00 00 2e 77 00 56 00 6f 00 6c 00 75 00 6d 00 65 00 5f 00 75 00 70 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff b8
""".strip()

    frames = [bytes.fromhex(line) for line in hex_stream.splitlines()]

    # dev_id is the 12th byte (index 11) of each frame, consistent in this stream
    dev_id = frames[0][11]
    assert dev_id == 0x03

    assembler = DeviceCommandAssembler()
    completed: list[tuple[int, bytes]] = []

    for raw in frames:
        opcode = int.from_bytes(raw[2:4], "big")
        # We know all frames belong to the same device; override to keep them together
        completed.extend(assembler.feed(opcode, raw, dev_id_override=dev_id))

    # Some assemblers emit on finalize; make sure we complete any dangling chain
    if not completed:
        completed.extend(assembler.finalize_contiguous(dev_id))

    assert len(completed) == 1
    assembled_dev_id, assembled_payload = completed[0]
    assert assembled_dev_id == dev_id

    parsed = proxy.parse_device_commands(assembled_payload, assembled_dev_id)

    expected = {
        1: 'Power off',
        2: 'Power on',
        3: '0',
        4: '1',
        5: '2',
        6: '3',
        7: '4',
        8: '5',
        9: '6',
        10: '7',
        11: '8',
        12: '9',
        13: 'Energy_saving',
        14: 'Sleep',
        15: 'Audio delay down',
        16: 'Audio delay mode',
        17: 'Audio delay up',
        18: 'Audyssey auto eqxt3',
        19: 'Audyssey dsx off',
        20: 'Audyssey dsx on',
        21: 'Audyssey dsx select',
        22: 'Audyssey dsx wide on',
        23: 'Audyssey dyn eq 0 db',
        24: 'Audyssey dyn eq 15db',
        25: 'Audyssey dyn eq 15db',
        26: 'Audyssey dyn eq 5 db',
        27: 'Audyssey dyn vol day',
        28: 'Audyssey dyn vol eve',
        29: 'Audyssey dyn vol mid',
        30: 'Audyssey graphic eq',
        31: 'Audyssey lfc',
        32: 'Audyssey lfc off',
        33: 'Audyssey lfc on',
        34: 'Eco mode auto',
        35: 'Eco mode off',
        36: 'Eco mode on',
        37: 'Exit',
        38: 'Guide',
        39: 'Hdmi audio out',
        40: 'Hdmi Audio OutTv',
        41: 'Hdmi Audio Qut Amp',
        42: 'Hdmi audio tv',
        43: 'Hdmi cec off',
        44: 'Hdmi cec on',
        45: 'HDMI Monitor Select Auto',
        46: 'HDMI Monitor Select1',
        47: 'HDMI Monitor Select2',
        48: 'Info',
        49: 'Input',
        50: 'Input am',
        51: 'Input aux1',
        52: 'Input aux2',
        53: 'Input bk',
        54: 'Input blu-ray',
        55: 'Input bluetooth',
        56: 'Input cbl/sat',
        57: 'Input cd',
        58: 'Input dvd',
        59: 'Input fm',
        60: 'Input game1',
        61: 'Input game2',
        62: 'Input heos',
        63: 'Input Internet Radio',
        64: 'Input media player',
        65: 'Input pandora',
        66: 'Input phono',
        67: 'Input sirius xm',
        68: 'Input spotify',
        69: 'Input tv audio',
        70: 'Inputaux',
        71: 'Inputusb',
        72: 'Mode game',
        73: 'Mode jazz club',
        74: 'Mode matrix',
        75: 'Mode mono movie',
        76: 'Mode movie',
        77: 'Mode music',
        78: 'Mode pure',
        79: 'Mode pure direct',
        80: 'Mode rock arena',
        81: 'Mode standard',
        82: 'Mode stereo',
        83: 'Mode video game',
        84: 'Mode virtual',
        85: 'Monitor select',
        86: 'Pause',
        87: 'Play',
        88: 'Power',
        89: 'Power toggle',
        90: 'Presetnext',
        91: 'Presetprevious',
        92: 'Quick select1',
        93: 'Quick select2',
        94: 'Quick select3',
        95: 'Quick select4',
        96: 'Resolution',
        97: 'Resolution(Hdmi)',
        98: 'Restorer',
        99: 'Return',
        100: 'Setup',
        101: 'Skip forward',
        102: 'Status',
        103: 'Stop',
        104: 'Trigger 1 on',
        105: 'Trigger 2 on',
        106: 'Trigger1 off',
        107: 'Trigger2 off',
        108: 'Back',
        109: 'Channel_down',
        110: 'Channel_up',
        111: 'Home',
        112: 'Menu',
        113: 'Mute',
        114: 'Navigate_down',
        115: 'Navigate_left',
        116: 'Navigate_right',
        117: 'Navigate_up',
        118: 'Ok/select',
        119: 'Skip backward',
        120: 'Volume_down',
        121: 'Volume_up',
    }

    assert parsed == expected
