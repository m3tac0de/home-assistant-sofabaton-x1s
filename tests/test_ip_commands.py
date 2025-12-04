"""Tests for IP command encoding/decoding helpers."""

from __future__ import annotations

from custom_components.sofabaton_x1s.lib.frame_handlers import FrameContext
from custom_components.sofabaton_x1s.lib.opcode_handlers import IpCommandSyncRowHandler
from custom_components.sofabaton_x1s.lib.protocol_const import (
    OP_DEFINE_IP_CMD_EXISTING,
    OP_IPCMD_ROW,
    OP_IPCMD_ROW_A,
    OP_IPCMD_ROW_B,
    OP_IPCMD_ROW_C,
    OP_IPCMD_ROW_D,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def _build_context(proxy: X1Proxy, raw_hex: str, opcode: int) -> FrameContext:
    raw = bytes.fromhex(raw_hex)
    payload = raw[4:-1]
    return FrameContext(
        proxy=proxy,
        opcode=opcode,
        direction="H→A",
        payload=payload,
        raw=raw,
        name="test",
    )


def test_ip_command_sync_rows_decode_http_metadata() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    handler = IpCommandSyncRowHandler()

    frames = (
        (
            "a5 5a d3 0d 01 00 01 03 00 01 08 01 1c 00 00 00 00 00 00 00 54 00 00 00 6f 00 00 00 67 00 00 00 67 00 00 00 6c 00 00 00 65 00 00 00 20 00 00 00 4f 00 00 00 66 00 00 00 66 00 00 00 69 00 00 00 63 00 00 00 65 00 00 00 20 00 00 00 4c 00 00 c0 a8 02 4d 1f bb 00 7f 50 55 54 20 2f 61 70 69 2f 77 65 62 68 6f 6f 6b 2f 2d 50 31 45 54 48 55 6c 63 47 68 79 62 6c 64 64 71 48 51 6f 6c 41 70 53 54 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 37 37 3a 38 31 32 33 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 92 07",
            OP_IPCMD_ROW_A,
        ),
        (
            "a5 5a ac 0d 02 00 01 03 00 01 08 02 1c 00 00 00 00 00 00 00 74 00 65 00 73 00 74 00 62 00 75 00 74 00 74 00 6f 00 6e 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 c0 a8 02 bc 00 50 00 58 50 55 54 20 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 36 38 2e 32 2e 31 38 38 3a 38 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a 0c d7",
            OP_IPCMD_ROW_B,
        ),
        (
            "a5 5a 9b 0d 03 00 01 03 00 01 08 03 1c 00 00 00 00 00 00 00 74 00 65 00 73 00 74 00 62 00 74 00 6e 00 33 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 bc 21 21 21 00 50 00 47 50 4f 53 54 20 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 38 38 2e 33 33 2e 33 33 2e 33 33 3a 38 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 6a 73 6f 6e 0d 0a 0d 0a 2c 08",
            OP_IPCMD_ROW_C,
        ),
        (
            "a5 5a ae 0d 04 00 01 04 00 01 08 04 1c 00 00 00 00 00 00 00 74 00 73 00 74 00 34 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 6f 6f 6f 6f 00 50 00 5a 47 45 54 20 20 48 54 54 50 2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 31 31 2e 31 31 31 2e 31 31 31 2e 31 31 31 3a 38 30 0d 0a 43 6f 6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a ca 5a",
            OP_IPCMD_ROW_D,
        ),
    )

    for raw_hex, opcode in frames:
        handler.handle(_build_context(proxy, raw_hex, opcode))

    buttons = proxy.state.ip_buttons[8]

    assert buttons[1]["button_name"].startswith("Toggle Office")
    assert buttons[1]["method"] == "PUT"
    assert buttons[1]["url"] == "/api/webhook/-P1ETHUlcGhyblddqHQolApST"
    assert buttons[1]["headers"] == {
        "Host": "192.168.2.77:8123",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    assert buttons[2]["button_name"] == "testbutton2"
    assert buttons[2]["method"] == "PUT"
    assert buttons[2]["url"] == ""
    assert buttons[2]["headers"]["Host"] == "192.168.2.188:80"

    assert buttons[3]["button_name"].startswith("testbtn3")
    assert buttons[3]["method"] == "POST"
    assert buttons[3]["url"] == ""
    assert buttons[3]["headers"]["Content-Type"] == "application/json"

    assert buttons[4]["button_name"].startswith("tst4")
    assert buttons[4]["method"] == "GET"
    assert buttons[4]["url"] == ""
    assert buttons[4]["headers"] == {
        "Host": "111.111.111.111:80",
        "Content-Type": "application/x-www-form-urlencoded",
    }


def test_ip_command_handler_matches_all_ip_row_variants() -> None:
    handler = IpCommandSyncRowHandler()

    assert handler.matches(OP_IPCMD_ROW | 0x00A1, "H→A")
    assert handler.matches(OP_IPCMD_ROW_A, "H→A")
    assert not handler.matches(0x0C02, "H→A")
    assert not handler.matches(OP_IPCMD_ROW_B, "A→H")


def test_build_existing_device_frame_encodes_http_request() -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )

    opcode, payload = proxy._build_existing_device_frame(
        device_id=8,
        button_id=4,
        button_name="tst4",
        method="GET",
        url="http://example.local/api",
        headers={"Content-Type": "application/json"},
    )

    assert opcode == OP_DEFINE_IP_CMD_EXISTING
    assert payload[0] == 4
    assert payload[6] == 8
    assert payload[7] == 4

    name_blob = proxy._utf16le_padded("tst4", length=64)
    assert payload[16 : 16 + 64] == name_blob

    http_blob = proxy._encode_http_request(
        "GET", "http://example.local/api", {"Content-Type": "application/json"}
    )
    assert payload.endswith(http_blob)
