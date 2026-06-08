from __future__ import annotations

import re

from custom_components.sofabaton_x1s.const import HUB_VERSION_X1, HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def _hx(text: str) -> bytes:
    return bytes.fromhex(re.sub(r"\s+", "", text))


CAPTURED_BLOB_BODY = _hx(
    """
    00 00 03 20 00 00 00 00 9d 86 00 00 0d 25 00 00 07 00 00 00 01 65 00 00 02 00 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 05 45 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 45 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 50 00 00 01 70 00 00 02 15 00 00 01 70 00 00 02 0a 00 00 01 70 00 00 05 45 00 00 01 70 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 45 00 00 01 70 00 00 05 45 00 00 01 6a 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 45 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 40 00 00 01 70 00 00 02 0a 00 00 01 70 00 00 02 10 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 05 45 00 00 01 70 00 00 01 fa 00 00 01 6a 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 45 00 00 01 6a 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 45 00 00 01 6a 00 00 05 4b 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 05 60 00 00 01 55 00 00 05 60 00 00 01 55 00 00 02 1b 00 00 01 55 00 01 1f f5 00 00 0d 10 00 00 06 fa 00 00 01 55 00 00 02 15 00 00 01 55 00 00 02 15 00 00 01 55 00 00 05 60 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 05 60 00 00 01 55 00 00 02 15 00 00 01 55 00 00 05 60 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 05 60 00 00 01 50 00 00 02 1a 00 00 01 50 00 00 02 1a 00 00 01 50 00 00 05 65 00 00 01 55 00 00 05 70 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 02 1b 00 00 01 55 00 00 05 60 00 00 01 7a 00 00 01 f0 00 00 01 70 00 00 05 45 00 00 01 6a 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 45 00 00 01 70 00 00 02 00 00 00 01 70 00 00 02 05 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 45 00 00 01 70 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 01 fa 00 00 01 70 00 00 01 fa 00 00 01 6a 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 45 00 00 01 70 00 00 05 45 00 00 01 70 00 00 01 fa 00 00 01 6a 00 00 02 00 00 00 01 70 00 00 02 00 00 00 01 70 00 00 05 45 00 00 01 70 00 00 05 45 00 00 01 70 00 00 01 fa 00 00 01 6a 00 03 0d 40 00 00 00 00
    """
)

CAPTURED_X1S_SAVE_PAGE1_FRAME = _hx(
    """
    01 00 01 01 00 02 0c 00 0d 00 00 00 00 00 00 00 63 00 6d 00 64 00 20 00 74 00 73 00 74 00 20 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01 00 00 00 00 00 9d 2f 00 00 09 1f 00 00 02 a1 00 00 02 1f 00 00 02 7b 00 00 02 2a 00 00 02 7b 00 00 02 2a 00 00 02 7b 00 00 04 6f 00 00 02 91 00 00 04 6a 00 00 02 96 00 00 02 2a 00 00 02 a0 00 00 02 2f 00 00 02 81 00 00 04 6a 00 00 02 96 00 00 04 6f 00 00 02 91 00 00 04 6a 00 00 02 96 00 00 02 2f 00 00 02 7b 00 00 04 6f 00 00 02 91 00 00 02 2a 00 00 02 7b 00 00 02 2a 00 00 02 7b 00 00 04 6a 00 00 4f e6 00 00 09 1a 00 00 02 90 00 00 02 2f 00 00 02 7b 00 00 02 2a 00 00 02 7b 00 00 02 2a 00 00 02 7b 00 00 04 6a 00 00 02 1c
    """
)

CAPTURED_X1S_SAVE_PAGE2_FRAME = _hx(
    """
    01 00 02 96 00 00 04 6f 00 00 02 91 00 00 02 2a 00 00 02 7b 00 00 02 2a 00 00 02 7b 00 00 04 6a 00 00 02 96 00 00 04 6f 00 00 02 91 00 00 04 6a 00 00 02 96 00 00 02 3a 00 00 02 70 00 00 04 6f 00 00 02 91 00 00 02 2a 00 00 02 80 00 00 02 2a 00 00 02 80 00 00 04 65 00 03 0d 40 00 00 00 00 dc 16
    """
)


def test_persist_ir_blob_matches_observed_x1_save_pages(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    device_id = 0x02
    proxy.state.commands[device_id] = {command_id: f"Command {command_id}" for command_id in range(1, 112)}

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "clear_ack_queue", lambda: None)
    monkeypatch.setattr(proxy, "wait_for_ack_any", lambda *args, **kwargs: (0x0103, b"\x00"))

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.persist_ir_blob(
        device_id=device_id,
        command_name="tst cmd 2",
        blob=CAPTURED_BLOB_BODY,
        inter_frame_delay=0.0,
    )

    assert result == {
        "status": "success",
        "device_id": 0x02,
        "command_id": 0x70,
        "command_name": "tst cmd 2",
        "page_count": 4,
    }
    assert [opcode & 0xFF for opcode, _payload in sent[:4]] == [0x0E, 0x0E, 0x0E, 0x0E]
    assert [payload[:3] for _opcode, payload in sent[:4]] == [
        b"\x01\x00\x01",
        b"\x01\x00\x02",
        b"\x01\x00\x03",
        b"\x01\x00\x04",
    ]

    # After the IR blob is uploaded the proxy follows up with a
    # single-page family-0x61 write that re-emits the per-device
    # display order with the new command appended; without this the
    # physical remote's device-browse UI does not surface the
    # newly-saved command.
    sort_frames = [(opcode, payload) for opcode, payload in sent[4:] if (opcode & 0xFF) == 0x61]
    assert len(sort_frames) == 1
    sort_payload = sort_frames[0][1]
    # Page header (0x01, page_no_be16) + body header (0x01, total_pages_be16, dev_lo).
    assert sort_payload[:7] == bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, 0x02])
    # Newly saved command must be the last (command_id, sort_id) pair in the body.
    pair_section = sort_payload[7:-1]
    assert len(pair_section) % 2 == 0
    assert pair_section[-2] == 0x70

    first_payload = sent[0][1]
    assert first_payload[:15] == bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x04, 0x02, 0x70, 0x0D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    assert first_payload[15:24] == b"tst cmd 2"
    assert first_payload[45:49] == bytes.fromhex("00 00 03 20")

    uploaded_blob = first_payload[45:] + sent[1][1][3:] + sent[2][1][3:] + sent[3][1][3:]
    assert uploaded_blob[:-1] == CAPTURED_BLOB_BODY
    assert proxy.state.commands[device_id][0x70] == "tst cmd 2"


def test_persist_ir_blob_returns_none_when_hub_rejects_final_page(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    device_id = 0x02
    proxy.state.commands[device_id] = {command_id: f"Command {command_id}" for command_id in range(1, 112)}

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "clear_ack_queue", lambda: None)

    responses = iter(
        [
            (0x0103, b"\x00"),
            (0x0103, b"\x00"),
            (0x0103, b"\x00"),
            (0x0103, b"\x0c"),
        ]
    )
    monkeypatch.setattr(proxy, "wait_for_ack_any", lambda *args, **kwargs: next(responses))

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.persist_ir_blob(
        device_id=device_id,
        command_name="tst cmd 2",
        blob=CAPTURED_BLOB_BODY,
        inter_frame_delay=0.0,
    )

    assert result is None
    assert [opcode & 0xFF for opcode, _payload in sent] == [0x0E, 0x0E, 0x0E, 0x0E]
    assert 0x70 not in proxy.state.commands[device_id]


def test_persist_ir_blob_matches_observed_x1s_save_pages(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    device_id = 0x0C
    proxy.state.commands[device_id] = {command_id: f"Command {command_id}" for command_id in range(1, 83)}

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "clear_ack_queue", lambda: None)
    monkeypatch.setattr(proxy, "wait_for_ack_any", lambda *args, **kwargs: (0x0103, b"\x00"))

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    expected_page1_fragment = CAPTURED_X1S_SAVE_PAGE1_FRAME[:-1]
    expected_page2_fragment = CAPTURED_X1S_SAVE_PAGE2_FRAME[:-1]
    blob_body = (
        expected_page1_fragment[73:]
        + expected_page2_fragment[3:-1]
        + b"\x00\x00\x00\x00"
    )

    result = proxy.persist_ir_blob(
        device_id=device_id,
        command_name="cmd tst 2",
        blob=blob_body,
        inter_frame_delay=0.0,
    )

    assert result == {
        "status": "success",
        "device_id": 0x0C,
        "command_id": 0x53,
        "command_name": "cmd tst 2",
        "page_count": 2,
    }
    assert [opcode & 0xFF for opcode, _payload in sent[:2]] == [0x0E, 0x0E]
    # See the X1 variant for the rationale behind the follow-up
    # family-0x61 sort write that lands after the two save pages.
    sort_frames = [(opcode, payload) for opcode, payload in sent[2:] if (opcode & 0xFF) == 0x61]
    assert len(sort_frames) == 1
    sort_payload = sort_frames[0][1]
    assert sort_payload[:7] == bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, 0x0C])
    pair_section = sort_payload[7:-1]
    assert len(pair_section) % 2 == 0
    assert pair_section[-2] == 0x53
    assert sent[0][1][:15] == bytes(
        [0x01, 0x00, 0x01, 0x01, 0x00, 0x02, 0x0C, 0x53, 0x0D, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    )
    assert sent[0][1][15:75] == "cmd tst 2".encode("utf-16-be").ljust(60, b"\x00")
    assert sent[1][1][:3] == b"\x01\x00\x02"
    assert len(sent[0][1]) == 250
    assert len(sent[1][1]) == 99
    uploaded_blob = sent[0][1][75:] + sent[1][1][3:]
    assert uploaded_blob[:-1] == blob_body
    assert uploaded_blob[-1] == (
        sum(sent[0][1][:15]) + sum(sent[0][1][15:73]) + sum(blob_body) - 2
    ) & 0xFF
    assert proxy.state.commands[device_id][0x53] == "cmd tst 2"
