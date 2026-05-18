"""Verify the macro parser against a real X1S/X2 multi-frame capture.

A user captured this 5-frame REQ_MACRO_LABELS response (activity 0x65) on a
real hub. Of the 5 frames, 4 are record-start fragments (one macro each)
and frame 113 is a continuation that appends to fragment 3 (the POWER_ON
macro, which spans 2 frames because it carries 20 key entries
plus a 60-byte UTF-16BE label slot).

Two test macros should surface; POWER_ON / POWER_OFF should be filtered
out by the production handler. This test exercises the assembler +
schema parser end-to-end through the production opcode handler path.


"""

from __future__ import annotations

from custom_components.sofabaton_x1s.lib.frame_handlers import FrameContext
from custom_components.sofabaton_x1s.lib.opcode_handlers import MacroHandler
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


RAW_FRAMES_HEX = (
    # Fragment 1/4 — macro test_macro_1 (key_id=0x0D), single-frame, ASCII... wait no, UTF-16BE
    "a5 5a 50 13 01 00 01 04 00 01 65 0d 01 04 05 00 00 00 00 00 4c 00 ff 00 74 00 65 00 73 00 74 00 20 00 6d 00 61 00 63 00 72 00 6f 00 20 00 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 09 7c",
    # Fragment 2/4 — macro test_macro_2 (key_id=0x0E), single-frame
    "a5 5a 50 13 02 00 01 04 00 01 65 0e 01 04 10 00 00 00 00 03 28 00 ff 00 74 00 65 00 73 00 74 00 20 00 6d 00 61 00 63 00 72 00 6f 00 20 00 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03 63",
    # Fragment 3/4 — macro POWER_ON (key_id=0xC6), 20 beans + UTF-16BE label, page 1 of 2
    "a5 5a fa 13 03 00 01 04 00 02 65 c6 14 01 c6 00 00 00 00 00 00 01 ff 03 c5 00 00 00 00 00 00 0a ff 04 c6 00 00 00 00 00 00 01 ff 01 c5 00 00 00 00 00 00 00 ff 04 c5 00 00 00 00 00 00 00 ff 03 c6 00 00 00 00 00 00 01 ff 02 c6 00 00 00 00 00 00 00 ff 02 c5 00 00 00 00 00 00 00 ff 08 c6 00 00 00 00 00 00 00 ff 08 c5 00 00 00 00 00 00 00 ff 09 c6 00 00 00 00 00 00 00 ff 09 c5 00 00 00 00 00 00 00 ff 0a c6 00 00 00 00 00 00 00 ff 0a c5 00 00 00 00 00 00 01 ff 0b c6 00 00 00 00 00 00 01 ff 0c c6 00 00 00 00 00 00 00 ff 0d c6 00 00 00 00 00 00 00 ff 0b c5 00 00 00 00 00 00 00 ff 0c c5 00 00 00 00 00 00 00 ff 0d c5 00 00 00 00 00 00 00 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 d9",
    # Continuation of fragment 3 — page 2 of the POWER_ON macro
    "a5 5a 17 13 03 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 35 35 00 00 00 00 00 98",
    # Fragment 4/4 — macro POWER_OFF (key_id=0xC7), 10 beans + UTF-16BE label
    "a5 5a aa 13 04 00 01 04 00 01 65 c7 0a 01 c7 00 00 00 00 00 00 01 ff 03 c7 00 00 00 00 00 00 01 ff 04 c7 00 00 00 00 00 00 01 ff 02 c7 00 00 00 00 00 00 00 ff 08 c7 00 00 00 00 00 00 00 ff 09 c7 00 00 00 00 00 00 00 ff 0a c7 00 00 00 00 00 00 00 ff 0b c7 00 00 00 00 00 00 01 ff 0c c7 00 00 00 00 00 00 00 ff 0d c7 00 00 00 00 00 00 00 ff 00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 46 00 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff 0d d8",
)


def _build_context(proxy: X1Proxy, raw_hex: str, name: str) -> FrameContext:
    raw = bytes.fromhex(raw_hex.replace(" ", ""))
    opcode = int.from_bytes(raw[2:4], "big")
    return FrameContext(
        proxy=proxy,
        opcode=opcode,
        direction="H→A",
        payload=raw[4:-1],
        raw=raw,
        name=name,
    )


def test_real_x1s_macro_burst_for_activity_0x65() -> None:
    """The real-capture burst should yield exactly two macros after the
    production POWER_* filter: test macro 1 (cmd=0x0D) and test macro 2
    (cmd=0x0E). The POWER_ON macro (cmd=0xC6, spans frames 112-113) and
    POWER_OFF macro (cmd=0xC7) must be filtered out.
    """

    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    # Fixture is UTF-16BE — flag the proxy as X1S so the schema parser
    # selects the 60-byte / utf-16-be label slot.
    proxy.hub_version = "X1S"
    handler = MacroHandler()

    for raw_hex in RAW_FRAMES_HEX:
        handler.handle(_build_context(proxy, raw_hex, "MACROS_REAL_CAPTURE"))

    macros = proxy.state.get_activity_macros(0x65)
    by_cmd = {entry["command_id"]: entry["label"] for entry in macros}

    assert set(by_cmd) == {0x0D, 0x0E}, f"unexpected macros surfaced: {by_cmd}"
    assert by_cmd[0x0D] == "test macro 1"
    assert by_cmd[0x0E] == "test macro 2"
