"""Tests for play_ir_blob wire-format generation.

Each fixture is a real wire capture of a hub exchanging family-0x0F frames.
We reconstruct the source library_data from the captured frames, run it
through ``X1Proxy.play_ir_blob``, and assert the generated frames match the
originals byte-for-byte.

Captures:
- Sony POWER ON   — X1 hub, 2 frames (FA0F + 5D0F)
- Denon cmd 1     — X1 hub, 4 frames (FA0F × 3 + 570F)
- X1S 5-frame cmd — X1S hub, 5 frames (FA0F × 4 + F00F)
- X1S 1-frame cmd — X1S hub, 1 frame  (6C0F)  — exercises X=1 single-frame path

Fixtures store full frames as captured on the wire (magic + opcode + payload +
sum8). ``_split_frame`` peels off the 4-byte header and 1-byte trailer to give
back ``(opcode, payload)`` — same form the proxy emits.

Wire payload layout per frame::

    payload[0..2]   = page header [0x01, 0x00, page_no_lo]
    payload[3..14]  = body header (frame 1 only): [0x01, 0x00, total_pages_be(2B),
                       0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
    payload[15..]   = body slice (library_data for frame 1, continuation for the rest)

The final byte of the assembled body buffer is a sum8 over all preceding body
bytes (header + library_data).
"""

from __future__ import annotations

import logging
import re

import pytest

from custom_components.sofabaton_x1s.lib.commands import build_denonk_ir_blob
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


# ---------------------------------------------------------------------------
# Captured frames (full wire bytes, including a5 5a magic and trailing sum8).
# ---------------------------------------------------------------------------

def _hx(s: str) -> bytes:
    return bytes.fromhex(re.sub(r"\s", "", s))


# Sony POWER ON (X1 hub) — 2 frames
SONY_POWER_ON_WIRE: list[bytes] = [
    _hx("""
        a5 5a fa 0f 01 00 01 01 00 02 00 00 00 00 00 00 00 00 00 01 38 00 00 00
        00 9c 40 00 00 09 68 00 00 02 4f 00 00 02 60 00 00 02 4f 00 00 04 b9 00
        00 02 4e 00 00 04 d1 00 00 02 4f 00 00 04 b8 00 00 02 4f 00 00 02 60 00
        00 02 4f 00 00 04 b8 00 00 02 4f 00 00 02 61 00 00 02 4f 00 00 04 b9 00
        00 02 4e 00 00 02 61 00 00 02 4e 00 00 02 61 00 00 02 4e 00 00 02 61 00
        00 02 4e 00 00 02 61 00 00 62 69 00 00 09 6a 00 00 02 4e 00 00 02 62 00
        00 02 4e 00 00 04 ba 00 00 02 4e 00 00 04 ba 00 00 02 4e 00 00 04 ba 00
        00 02 4e 00 00 02 62 00 00 02 4e 00 00 04 ba 00 00 02 4e 00 00 02 62 00
        00 02 4e 00 00 04 ba 00 00 02 4e 00 00 02 62 00 00 02 4d 00 00 02 62 00
        00 02 4d 00 00 02 62 00 00 02 4d 00 00 02 62 00 00 62 68 00 00 09 6b 00
        00 02 4d 00 00 02 62 00 00 02 4d 00 00 04 85
    """),
    _hx("""
        a5 5a 5d 0f 01 00 02 d3 00 00 02 4d 00 00 04 bb 00 00 02 4d 00 00 04 ba
        00 00 02 4d 00 00 02 62 00 00 02 4d 00 00 04 bb 00 00 02 4d 00 00 02 63
        00 00 02 4d 00 00 04 bb 00 00 02 4d 00 00 02 63 00 00 02 4d 00 00 02 63
        00 00 02 4d 00 00 02 63 00 00 02 4d 00 00 02 63 00 00 62 69 00 00 00 00
        87 01
    """),
]


# Denon command (X1 hub) — 4-frame multi-burst capture
DENON_MULTI_WIRE: list[bytes] = [
    _hx("""
        a5 5a fa 0f 01 00 01 01 00 04 00 00 00 00 00 00 00 00 00 03 20 00 00 00
        00 8e 33 00 00 0d 15 00 00 06 a0 00 00 01 a0 00 00 01 ba 00 00 01 a5 00
        00 01 b5 00 00 01 a5 00 00 04 fb 00 00 01 a0 00 00 01 ba 00 00 01 a0 00
        00 05 00 00 00 01 a0 00 00 01 ba 00 00 01 a5 00 00 04 fb 00 00 01 a0 00
        00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 a0 00 00 05 00 00 00 01 a5 00
        00 01 b5 00 00 01 a5 00 00 01 b5 00 00 01 a0 00 00 05 00 00 00 01 a0 00
        00 05 00 00 00 01 a5 00 00 01 b5 00 00 01 a5 00 00 01 b5 00 00 01 a0 00
        00 01 b5 00 00 01 a0 00 00 01 b5 00 00 01 a0 00 00 01 ba 00 00 01 a0 00
        00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 a0 00
        00 05 00 00 00 01 a0 00 00 01 b5 00 00 01 a0 00 00 05 00 00 00 01 a0 00
        00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 af
    """),
    _hx("""
        a5 5a fa 0f 01 00 02 a0 00 00 01 ba 00 00 01 a5 00 00 04 fb 00 00 01 a0
        00 00 05 00 00 00 01 a0 00 00 01 ba 00 00 01 a5 00 00 05 00 00 00 01 a0
        00 00 05 00 00 00 01 a5 00 00 01 b5 00 00 01 a0 00 00 01 b5 00 00 01 a0
        00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 a5
        00 00 01 b5 00 00 01 a0 00 00 01 b5 00 00 01 a0 00 00 01 ba 00 00 01 a0
        00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 a5 00 00 01 b5 00 00 01 a5
        00 00 05 00 00 00 01 a0 00 00 05 00 00 00 01 a5 00 00 05 00 00 00 01 a0
        00 00 04 fa 00 00 01 85 00 01 23 85 00 00 0d 15 00 00 06 a0 00 00 01 a0
        00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 a0 00 00 05 00 00 00 01 a0
        00 00 01 b5 00 00 01 a0 00 00 05 00 00 00 01 a0 00 00 01 ba 00 00 01 a5
        00 00 04 fb 00 00 01 a0 00 00 01 ba 00 00 92
    """),
    _hx("""
        a5 5a fa 0f 01 00 03 01 a0 00 00 01 ba 00 00 01 a0 00 00 05 00 00 00 01
        a0 00 00 01 b5 00 00 01 a0 00 00 01 b5 00 00 01 a0 00 00 05 00 00 00 01
        a0 00 00 05 00 00 00 01 a0 00 00 01 b5 00 00 01 a0 00 00 01 ba 00 00 01
        a0 00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 a5 00 00 01 b5 00 00 01
        a5 00 00 01 b5 00 00 01 a0 00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01
        a0 00 00 05 00 00 00 01 a0 00 00 01 b5 00 00 01 a0 00 00 05 00 00 00 01
        a0 00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00 01
        a0 00 00 05 00 00 00 01 a0 00 00 05 00 00 00 01 a0 00 00 01 ba 00 00 01
        a0 00 00 05 00 00 00 01 a0 00 00 05 00 00 00 01 a0 00 00 01 ba 00 00 01
        a0 00 00 01 ba 00 00 01 a5 00 00 01 b5 00 00 01 a0 00 00 01 b5 00 00 01
        a0 00 00 01 b5 00 00 01 a0 00 00 01 ba 00 ac
    """),
    _hx("""
        a5 5a 57 0f 01 00 04 00 01 a0 00 00 01 ba 00 00 01 a0 00 00 01 ba 00 00
        01 a5 00 00 01 b5 00 00 01 a0 00 00 01 b5 00 00 01 a0 00 00 01 ba 00 00
        01 a0 00 00 05 00 00 00 01 a5 00 00 05 00 00 00 01 a0 00 00 05 00 00 00
        01 a5 00 00 04 f5 00 00 01 85 00 01 23 80 00 00 00 00 53 44
    """),
]


# X1S hub, 5-frame command (NEC-style codeset)
X1S_5FRAME_WIRE: list[bytes] = [
    _hx("""
        a5 5a fa 0f 01 00 01 01 00 05 00 00 00 00 00 00 00 00 00 04 b0 00 00 00
        00 94 70 00 00 0d 7a 00 00 06 52 00 00 01 c4 00 00 01 84 00 00 01 c4 00
        00 01 84 00 00 01 dd 00 00 04 b4 00 00 01 c0 00 00 01 84 00 00 01 c4 00
        00 04 cd 00 00 01 c0 00 00 01 84 00 00 01 c4 00 00 04 cd 00 00 01 c4 00
        00 01 84 00 00 01 dd 00 00 01 6b 00 00 01 d9 00 00 04 b4 00 00 01 c4 00
        00 01 84 00 00 01 dd 00 00 01 6b 00 00 01 c0 00 00 04 cd 00 00 01 c5 00
        00 04 cd 00 00 01 c0 00 00 01 88 00 00 01 d9 00 00 01 6b 00 00 01 c4 00
        00 01 84 00 00 01 dd 00 00 01 6b 00 00 01 c4 00 00 01 84 00 00 01 dd 00
        00 01 67 00 00 01 c4 00 00 01 84 00 00 01 dd 00 00 01 6b 00 00 01 c4 00
        00 04 cd 00 00 01 da 00 00 01 83 00 00 01 ac 00 00 04 cd 00 00 01 dd 00
        00 01 67 00 00 01 c4 00 00 01 84 00 00 01 b8
    """),
    _hx("""
        a5 5a fa 0f 01 00 02 c4 00 00 01 84 00 00 01 c4 00 00 01 84 00 00 01 c4
        00 00 04 c9 00 00 01 e2 00 00 04 b0 00 00 01 c4 00 00 01 84 00 00 01 c4
        00 00 01 98 00 00 01 ac 00 00 01 84 00 00 01 dd 00 00 01 6b 00 00 01 dd
        00 00 01 6b 00 00 01 c4 00 00 01 84 00 00 01 c4 00 00 01 84 00 00 01 c0
        00 00 01 84 00 00 01 e1 00 00 01 67 00 00 01 dd 00 00 04 b4 00 00 01 dd
        00 00 01 6b 00 00 01 c0 00 00 01 84 00 00 01 c4 00 00 01 98 00 00 01 b0
        00 00 01 84 00 00 01 dd 00 00 04 b0 00 00 01 fa 00 00 01 4e 00 00 01 fa
        00 00 01 4e 00 00 01 dd 00 01 1f 50 00 00 0d 5d 00 00 06 6b 00 00 01 c9
        00 00 01 6b 00 00 01 f6 00 00 01 52 00 00 01 dd 00 00 04 b0 00 00 01 dd
        00 00 01 6b 00 00 01 dd 00 00 04 b4 00 00 01 f6 00 00 01 4e 00 00 01 fa
        00 00 04 97 00 00 01 de 00 00 01 6b 00 00 7b
    """),
    _hx("""
        a5 5a fa 0f 01 00 03 01 dd 00 00 01 67 00 00 01 fa 00 00 04 97 00 00 01
        f6 00 00 01 52 00 00 01 dd 00 00 01 6b 00 00 01 f6 00 00 04 97 00 00 01
        de 00 00 04 b3 00 00 01 dd 00 00 01 67 00 00 01 fa 00 00 01 52 00 00 01
        f6 00 00 01 4e 00 00 01 f6 00 00 01 67 00 00 01 e1 00 00 01 52 00 00 01
        dd 00 00 01 67 00 00 01 e1 00 00 01 67 00 00 01 dd 00 00 01 6b 00 00 01
        f6 00 00 04 9b 00 00 01 dd 00 00 01 67 00 00 01 e1 00 00 04 c4 00 00 01
        c9 00 00 01 6b 00 00 01 dd 00 00 01 6b 00 00 01 f6 00 00 01 52 00 00 01
        f6 00 00 01 67 00 00 01 c4 00 00 04 b4 00 00 01 dd 00 00 04 b0 00 00 01
        dd 00 00 01 80 00 00 01 e1 00 00 01 52 00 00 01 dd 00 00 01 6b 00 00 01
        dd 00 00 01 6b 00 00 01 dd 00 00 01 6b 00 00 01 dd 00 00 01 67 00 00 01
        dd 00 00 01 6b 00 00 01 dd 00 00 01 6b 00 f6
    """),
    _hx("""
        a5 5a fa 0f 01 00 04 00 01 dd 00 00 01 7f 00 00 01 c8 00 00 04 cd 00 00
        01 d9 00 00 01 6b 00 00 01 c4 00 00 01 84 00 00 01 dd 00 00 01 6b 00 00
        01 dd 00 00 01 6a 00 00 01 dd 00 00 04 b0 00 00 01 c4 00 00 01 84 00 00
        01 c4 00 00 01 84 00 00 01 dd 00 01 1f 34 00 00 0d 93 00 00 06 52 00 00
        01 c9 00 00 01 67 00 00 01 c4 00 00 01 98 00 00 01 c8 00 00 04 b4 00 00
        01 c0 00 00 01 84 00 00 01 dd 00 00 04 b4 00 00 01 c4 00 00 01 84 00 00
        01 dd 00 00 04 b0 00 00 01 c5 00 00 01 83 00 00 01 dd 00 00 01 6b 00 00
        01 c4 00 00 04 e1 00 00 01 ad 00 00 01 83 00 00 01 dd 00 00 01 6b 00 00
        01 dd 00 00 04 c9 00 00 01 ac 00 00 04 cd 00 00 01 c5 00 00 01 84 00 00
        01 dd 00 00 01 67 00 00 01 dd 00 00 01 84 00 00 01 ac 00 00 01 84 00 00
        01 c4 00 00 01 84 00 00 01 dd 00 00 01 6b de
    """),
    _hx("""
        a5 5a f0 0f 01 00 05 00 00 01 dd 00 00 01 67 00 00 01 dd 00 00 01 6b 00
        00 01 dd 00 00 04 b4 00 00 01 c4 00 00 01 80 00 00 01 e1 00 00 04 b0 00
        00 01 fa 00 00 01 4e 00 00 01 dd 00 00 01 6b 00 00 01 dd 00 00 01 67 00
        00 01 e2 00 00 01 66 00 00 01 dd 00 00 04 b4 00 00 01 dd 00 00 04 b0 00
        00 01 dd 00 00 01 6b 00 00 01 dd 00 00 01 6b 00 00 01 dd 00 00 01 6b 00
        00 01 de 00 00 01 6a 00 00 01 dd 00 00 01 67 00 00 01 f6 00 00 01 52 00
        00 01 dd 00 00 01 6b 00 00 01 dd 00 00 01 6b 00 00 01 dd 00 00 01 6b 00
        00 01 dd 00 00 04 b0 00 00 01 dd 00 00 01 6b 00 00 01 dd 00 00 01 66 00
        00 01 e1 00 00 01 67 00 00 01 e1 00 00 01 67 00 00 01 dd 00 00 04 b4 00
        00 01 f6 00 00 01 4e 00 00 01 e1 00 00 01 67 00 00 01 dd 00 01 6b 48 00
        00 00 00 2a 7f
    """),
]


# X1S hub, single-frame command — codeset-style blob (flags=0x1000).
# Build programmatically because the long trailing-zero run is error-prone to
# type out by hand. opcode_hi=0x6C ⇒ payload length 108, total frame size 113.
def _build_x1s_singleframe() -> bytes:
    head = _hx("a5 5a 6c 0f")
    # 3B page header + 12B body header (pages=1, rest zeros).
    preface_and_body_header = _hx("01 00 01 01 00 01 00 00 00 00 00 00 00 00 00")  # 15B
    library_data_head = _hx(
        "00 50 00 00 10 00 94 70 1c 3a 40 62 21 df 0d 7f 8c 53 19 67 8c"
        "61 32 71 ca 5b 95 0d 1d 69 fc 79 8c 00 e0 27 8c 00 dc c4 21 00 00 66"
        "6f 11 11 64 71 00 6f 54 67 11 77 7f 67 96 6f 61"
    )
    body_chk = _hx("45")  # body's trailing sum8 byte
    frame_chk = _hx("06")  # frame's trailing sum8 byte
    pad_len = 108 - len(preface_and_body_header) - len(library_data_head) - len(body_chk)
    return head + preface_and_body_header + library_data_head + (b"\x00" * pad_len) + body_chk + frame_chk


X1S_SINGLEFRAME_WIRE: list[bytes] = [_build_x1s_singleframe()]


# X1 hub, database-style Denon command blobs with embedded CHECKSUM text.
DENON_DB_POWER_ON_WIRE: list[bytes] = [
    _hx("""
        a5 5a 55 0f 01 00 01 01 00 01 00 00 00 00 00 00 00 00 00 00 39 00 00 11
        00 94 70 50 3a 44 65 6e 6f 6e 4b 20 52 3a 33 37 30 30 30 20 43 30 3a 38
        34 20 43 31 3a 35 30 20 43 32 3a 30 20 44 3a 34 20 53 3a 31 20 46 3a 36
        20 43 48 45 43 4b 53 55 4d 3a 33 33 00 00 00 00 c3 eb
    """),
]

DENON_DB_NAV_UP_WIRE: list[bytes] = [
    _hx("""
        a5 5a 57 0f 01 00 01 01 00 01 00 00 00 00 00 00 00 00 00 00 3b 00 00 11
        00 94 70 50 3a 44 65 6e 6f 6e 4b 20 52 3a 33 37 30 30 30 20 43 30 3a 38
        34 20 43 31 3a 35 30 20 43 32 3a 30 20 44 3a 34 20 53 3a 31 20 46 3a 32
        37 20 43 48 45 43 4b 53 55 4d 3a 32 34 30 00 00 00 00 28 b7
    """),
]


SONY12_DESCRIPTOR_BLOB = _hx("""
    00 1f 00 00 11 00 94 70 50 3a 53 6f 6e 79 31 32 20 52 3a 34 30 30 30
    30 20 44 3a 31 20 46 3a 31 38 20 4d 55 4c 3a 32 00 00 00 00 79
""")

NEC_DESCRIPTOR_BLOB = _hx("""
    00 1c 00 00 11 00 94 70 50 3a 4e 45 43 20 52 3a 33 38 34 30 30 20 44
    3a 30 20 53 3a 32 30 36 20 46 3a 31 31 00 00 00 00 56
""")


# X1 hub, long multi-frame Denon "Mode movie" capture from the app's test flow.
X1_MODE_MOVIE_APP_WIRE: list[bytes] = [
    _hx("""
        a5 5a fa 0f 01 00 01 01 00 04 00 00 00 00 00 00 00 00 00 03 20 00 00 00
        00 94 cf 00 00 0d 05 00 00 06 aa 00 00 01 6c 00 00 01 d8 00 00 01 6c 00
        00 01 d8 00 00 01 6c 00 00 05 20 00 00 01 6c 00 00 01 d8 00 00 01 6c 00
        00 05 20 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 05 20 00 00 01 6c 00
        00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 05 20 00 00 01 86 00
        00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86 00
        00 05 06 00 00 01 86 00 00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00
        00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00
        00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00
        00 05 06 00 00 01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86 00
        00 01 be 00 00 01 86 00 00 01 be 00 00 01 1a
    """),
    _hx("""
        a5 5a fa 0f 01 00 02 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86
        00 00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86
        00 00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86
        00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86 00 00 01 be 00 00 01 86
        00 00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86
        00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86 00 00 01 be 00 00 01 86
        00 00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86
        00 00 05 06 00 00 01 86 00 01 1f 9e 00 00 0d 02 00 00 06 c4 00 00 01 6c
        00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 05 20 00 00 01 6c
        00 00 01 d8 00 00 01 6c 00 00 05 20 00 00 01 6c 00 00 01 d8 00 00 01 6c
        00 00 05 20 00 00 01 6c 00 00 01 d8 00 00 5a
    """),
    _hx("""
        a5 5a fa 0f 01 00 03 01 6c 00 00 01 d8 00 00 01 6c 00 00 05 20 00 00 01
        6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 05 20 00 00 01
        6c 00 00 05 20 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01
        6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01
        6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01
        6c 00 00 05 20 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 05 20 00 00 01
        6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01
        6c 00 00 05 20 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01
        6c 00 00 05 20 00 00 01 6c 00 00 01 d8 00 00 01 6c 00 00 01 d8 00 00 01
        6c 00 00 05 20 00 00 01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00 01
        86 00 00 01 be 00 00 01 86 00 00 01 be 00 32
    """),
    _hx("""
        a5 5a 57 0f 01 00 04 00 01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00
        01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00 01 86 00 00 01 be 00 00
        01 86 00 00 01 be 00 00 01 86 00 00 01 be 00 00 01 86 00 00 05 06 00 00
        01 86 00 00 05 06 00 00 01 86 00 01 1f 9e 00 00 00 00 70 c5
    """),
]

X1_CBLSAT_APP_WIRE: list[bytes] = [
    _hx("""
        a5 5a fa 0f 01 00 01 01 00 04 00 00 00 00 00 00 00 00 00 03 20 00 00 00
        00 94 cf 00 00 0d 03 00 00 06 ac 00 00 01 84 00 00 01 c0 00 00 01 84 00
        00 01 c0 00 00 01 84 00 00 05 08 00 00 01 84 00 00 01 c0 00 00 01 84 00
        00 05 08 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 05 08 00 00 01 84 00
        00 01 c0 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 05 08 00 00 01 84 00
        00 01 c0 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 05 08 00 00 01 84 00
        00 05 22 00 00 01 6a 00 00 01 da 00 00 01 6a 00 00 01 da 00 00 01 6a 00
        00 01 da 00 00 01 6a 00 00 01 da 00 00 01 6a 00 00 01 da 00 00 01 6a 00
        00 01 da 00 00 01 6a 00 00 01 da 00 00 01 6a 00 00 01 da 00 00 01 6a 00
        00 05 22 00 00 01 6a 00 00 01 da 00 00 01 6a 00 00 05 22 00 00 01 6a 00
        00 01 da 00 00 01 6a 00 00 01 da 00 00 01 34
    """),
    _hx("""
        a5 5a fa 0f 01 00 02 6a 00 00 01 da 00 00 01 6a 00 00 05 22 00 00 01 6a
        00 00 05 22 00 00 01 6a 00 00 01 da 00 00 01 6a 00 00 01 da 00 00 01 6a
        00 00 05 22 00 00 01 6a 00 00 01 da 00 00 01 6a 00 00 05 22 00 00 01 6a
        00 00 05 22 00 00 01 6a 00 00 01 da 00 00 01 6a 00 00 05 22 00 00 01 6a
        00 00 01 da 00 00 01 6a 00 00 01 da 00 00 01 6a 00 00 01 da 00 00 01 6a
        00 00 01 da 00 00 01 6a 00 00 05 22 00 00 01 6a 00 00 05 22 00 00 01 6a
        00 00 05 22 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 05 08 00 00 01 84
        00 00 01 c0 00 00 01 84 00 01 1f a1 00 00 0d 01 00 00 06 ac 00 00 01 84
        00 00 01 c0 00 00 01 85 00 00 01 c0 00 00 01 84 00 00 05 08 00 00 01 84
        00 00 01 c0 00 00 01 84 00 00 05 08 00 00 01 84 00 00 01 c0 00 00 01 84
        00 00 05 08 00 00 01 84 00 00 01 c0 00 00 db
    """),
    _hx("""
        a5 5a fa 0f 01 00 03 01 84 00 00 01 c0 00 00 01 84 00 00 05 08 00 00 01
        84 00 00 01 c0 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 05 08 00 00 01
        84 00 00 05 08 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 01 c0 00 00 01
        84 00 00 01 c0 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 01 c0 00 00 01
        84 00 00 01 c0 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 01 c0 00 00 01
        84 00 00 05 08 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 05 08 00 00 01
        84 00 00 01 c0 00 00 01 84 00 00 01 c0 00 00 01 84 00 00 01 c0 00 00 01
        84 00 00 05 08 00 00 01 84 00 00 05 08 00 00 01 84 00 00 01 c0 00 00 01
        84 00 00 01 c0 00 00 01 84 00 00 05 22 00 00 01 6a 00 00 01 da 00 00 01
        6a 00 00 05 22 00 00 01 6a 00 00 05 22 00 00 01 6a 00 00 01 da 00 00 01
        6a 00 00 05 22 00 00 01 6a 00 00 01 da 00 e4
    """),
    _hx("""
        a5 5a 57 0f 01 00 04 00 01 6a 00 00 01 da 00 00 01 6a 00 00 01 da 00 00
        01 6a 00 00 01 da 00 00 01 6a 00 00 05 22 00 00 01 6a 00 00 05 22 00 00
        01 6a 00 00 05 22 00 00 01 6a 00 00 01 da 00 00 01 6a 00 00 05 22 00 00
        01 6a 00 00 01 da 00 00 01 6a 00 01 1f bb 00 00 00 00 be 14
    """),
]

X1_OK_APP_WIRE: list[bytes] = [
    _hx("""
        a5 5a ec 0f 01 00 01 01 00 01 00 00 00 00 00 00 00 00 00 00 d0 00 00 00
        00 9c 40 00 00 09 46 00 00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 04 93 00 00 02 72 00 00 04 93 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 02 3b 00 00 62 92 00 00 09 43 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 04 93 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 62 92 00 00 00 00 4d 96
    """),
]

X1_VOL_UP_APP_WIRE: list[bytes] = [
    _hx("""
        a5 5a ec 0f 01 00 01 01 00 01 00 00 00 00 00 00 00 00 00 00 d0 00 00 00
        00 9c 40 00 00 09 46 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 02 3b 00 00 67 42 00 00 09 43 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 67 42 00 00 00 00 4f 9a
    """),
]

X1_VOL_DOWN_APP_WIRE: list[bytes] = [
    _hx("""
        a5 5a ec 0f 01 00 01 01 00 01 00 00 00 00 00 00 00 00 00 00 d0 00 00 00
        00 9c 40 00 00 09 46 00 00 02 72 00 00 04 93 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 02 3b 00 00 64 ea 00 00 09 43 00 00 02 72 00 00 04 93 00
        00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 04 93 00 00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00
        00 02 72 00 00 02 3b 00 00 02 72 00 00 02 3b 00 00 64 ea 00 00 00 00 4d 96
    """),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _split_frame(wire: bytes) -> tuple[int, bytes]:
    """Return (opcode, payload) from a full captured frame."""
    assert wire[0:2] == b"\xa5\x5a", "frame missing magic"
    opcode = (wire[2] << 8) | wire[3]
    # frame header (4) + payload + sum8 (1) = len(wire); payload omits both.
    payload = wire[4:-1]
    assert (opcode >> 8) & 0xFF == len(payload), (
        f"opcode hi {opcode >> 8:#x} != payload len {len(payload)}"
    )
    return opcode, payload


def _reconstruct_blob(frames: list[bytes]) -> bytes:
    """Strip per-chunk overhead from each frame and re-glue the body content.

    Frame 1 strips the 3-byte page header plus the 12-byte body header
    (15 bytes total). Continuations strip the 3-byte page header only. The
    concatenated result is ``library_data + trailing_sum8``.
    """
    parts: list[bytes] = []
    for idx, wire in enumerate(frames):
        _, payload = _split_frame(wire)
        parts.append(payload[15:] if idx == 0 else payload[3:])
    return b"".join(parts)


def _canonical_blob_body(frames: list[bytes]) -> bytes:
    """Return the canonical library_data expected by ``play_ir_blob``."""

    return _reconstruct_blob(frames)[:-1]


def _expected_frames(frames: list[bytes]) -> list[tuple[int, bytes]]:
    return [_split_frame(w) for w in frames]


def _new_proxy() -> X1Proxy:
    return X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)


def _capture_sends(proxy: X1Proxy, monkeypatch) -> list[tuple[int, bytes]]:
    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    def _wait_for_ack_any(candidates, *, timeout=5.0, not_before=None):
        return 0x0103, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)
    monkeypatch.setattr(
        proxy,
        "_wait_for_ack_any_impl",
        lambda candidates, *, timeout=5.0, not_before=None, log_timeout=True: None,
    )
    return sent


# ---------------------------------------------------------------------------
# Tests — byte-for-byte equivalence against captured frames
# ---------------------------------------------------------------------------

CAPTURES = {
    "sony_power_on_x1": SONY_POWER_ON_WIRE,
    "denon_multi_x1": DENON_MULTI_WIRE,
    "x1s_5frame": X1S_5FRAME_WIRE,
    "x1s_singleframe": X1S_SINGLEFRAME_WIRE,
    "denon_db_power_on_x1": DENON_DB_POWER_ON_WIRE,
    "denon_db_nav_up_x1": DENON_DB_NAV_UP_WIRE,
}


@pytest.mark.parametrize("name", list(CAPTURES.keys()))
def test_play_ir_blob_matches_capture(name: str, monkeypatch) -> None:
    wire_frames = CAPTURES[name]
    expected = _expected_frames(wire_frames)
    blob = _canonical_blob_body(wire_frames)

    proxy = _new_proxy()
    sent = _capture_sends(proxy, monkeypatch)
    ok = proxy.play_ir_blob(blob, inter_frame_delay=0.0)

    assert ok is True
    assert len(sent) == len(expected), f"{name}: expected {len(expected)} frames, sent {len(sent)}"
    for i, ((gen_op, gen_payload), (cap_op, cap_payload)) in enumerate(zip(sent, expected)):
        assert gen_op == cap_op, f"{name} frame {i+1}: opcode 0x{gen_op:04X} != 0x{cap_op:04X}"
        assert gen_payload == cap_payload, f"{name} frame {i+1}: payload mismatch"


# ---------------------------------------------------------------------------
# Tests — sub-header X byte equals total frame count
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "name,expected_x",
    [
        ("sony_power_on_x1", 2),
        ("denon_multi_x1", 4),
        ("x1s_5frame", 5),
        ("x1s_singleframe", 1),
    ],
)
def test_body_header_encodes_total_pages(name: str, expected_x: int, monkeypatch) -> None:
    blob = _canonical_blob_body(CAPTURES[name])
    proxy = _new_proxy()
    sent = _capture_sends(proxy, monkeypatch)

    proxy.play_ir_blob(blob, inter_frame_delay=0.0)

    # Frame 1 layout: [01 00 01] [01 00 <X> 00 00 00 00 00 00 00 00 00] [library_data...]
    first_payload = sent[0][1]
    assert first_payload[:3] == b"\x01\x00\x01"
    assert first_payload[3] == 0x01
    assert first_payload[4] == 0x00
    assert first_payload[5] == expected_x
    assert first_payload[6:15] == b"\x00" * 9


# ---------------------------------------------------------------------------
# Tests — chunk sequence + opcode encoding
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("name", list(CAPTURES.keys()))
def test_chunk_sequence_and_family(name: str, monkeypatch) -> None:
    blob = _canonical_blob_body(CAPTURES[name])
    proxy = _new_proxy()
    sent = _capture_sends(proxy, monkeypatch)

    proxy.play_ir_blob(blob, inter_frame_delay=0.0)

    for idx, (opcode, payload) in enumerate(sent):
        seq = idx + 1
        # Opcode high byte = payload length; low byte = family 0x0F.
        assert (opcode >> 8) & 0xFF == len(payload)
        assert opcode & 0xFF == 0x0F
        # Preface starts every frame: 01 00 <seq>.
        assert payload[:3] == bytes([0x01, 0x00, seq])

    # All non-final frames must use the max-size payload (0xFA = 250 bytes).
    for opcode, payload in sent[:-1]:
        assert len(payload) == 0xFA


# ---------------------------------------------------------------------------
# Tests — input validation / gating
# ---------------------------------------------------------------------------

def test_play_ir_blob_rejected_when_proxy_client_connected(monkeypatch) -> None:
    proxy = _new_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: False)
    sent: list = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    assert proxy.play_ir_blob(b"\x00" * 100) is False
    assert sent == []


@pytest.mark.parametrize("bad_input", [b"", b"\x00" * 5, None, "not bytes"])
def test_play_ir_blob_rejects_invalid_input(bad_input, monkeypatch) -> None:
    proxy = _new_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    sent: list = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    assert proxy.play_ir_blob(bad_input) is False
    assert sent == []


def test_play_ir_blob_waits_for_per_chunk_ack(monkeypatch) -> None:
    blob = _canonical_blob_body(DENON_MULTI_WIRE)
    proxy = _new_proxy()
    sent: list[tuple[int, bytes]] = []
    ack_calls: list[list[tuple[int, int | None]]] = []

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_wait_for_ack_any_impl", lambda candidates, *, timeout=5.0, not_before=None, log_timeout=True: None)

    def _wait_for_ack_any(candidates, *, timeout=5.0, not_before=None):
        ack_calls.append(list(candidates))
        return 0x0103, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    ok = proxy.play_ir_blob(blob, inter_frame_delay=0.0)

    assert ok is True
    assert len(sent) == 4
    assert ack_calls[:3] == [[(0x0103, 0x00)]] * 3
    assert ack_calls[3] == [(0x0103, 0x00), (0x0103, 0x0C)]
    assert len(ack_calls) == 4


def test_play_ir_blob_rejects_failure_ack_on_final_chunk(monkeypatch) -> None:
    blob = _canonical_blob_body(SONY_POWER_ON_WIRE)
    proxy = _new_proxy()
    sent: list[tuple[int, bytes]] = []
    ack_calls: list[list[tuple[int, int | None]]] = []

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    def _wait_for_ack_any(candidates, *, timeout=5.0, not_before=None):
        ack_calls.append(list(candidates))
        if candidates == [(0x0103, 0x00)]:
            return 0x0103, b"\x00"
        if candidates == [(0x0103, 0x00), (0x0103, 0x0C)]:
            return 0x0103, b"\x0c"
        raise AssertionError(f"unexpected candidates: {candidates!r}")

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    ok = proxy.play_ir_blob(blob, inter_frame_delay=0.0)

    assert ok is False
    assert len(sent) == 2
    assert ack_calls == [
        [(0x0103, 0x00)],
        [(0x0103, 0x00), (0x0103, 0x0C)],
    ]


def test_play_ir_blob_rejects_late_failure_ack_after_final_success(monkeypatch) -> None:
    blob = _canonical_blob_body(SONY_POWER_ON_WIRE)
    proxy = _new_proxy()
    sent: list[tuple[int, bytes]] = []
    ack_calls: list[list[tuple[int, int | None]]] = []

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    def _wait_for_ack_any(candidates, *, timeout=5.0, not_before=None):
        ack_calls.append(list(candidates))
        if candidates == [(0x0103, 0x00)]:
            return 0x0103, b"\x00"
        if candidates == [(0x0103, 0x00), (0x0103, 0x0C)]:
            return 0x0103, b"\x00"
        raise AssertionError(f"unexpected candidates: {candidates!r}")

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)
    monkeypatch.setattr(
        proxy,
        "_wait_for_ack_any_impl",
        lambda candidates, *, timeout=5.0, not_before=None, log_timeout=True: (0x0103, b"\x0c")
        if candidates == [(0x0103, 0x0C)]
        else None,
    )

    ok = proxy.play_ir_blob(blob, inter_frame_delay=0.0)

    assert ok is False
    assert len(sent) == 2
    assert ack_calls == [
        [(0x0103, 0x00)],
        [(0x0103, 0x00), (0x0103, 0x0C)],
    ]


def test_play_ir_blob_fails_when_chunk_ack_is_missing(monkeypatch) -> None:
    blob = _canonical_blob_body(SONY_POWER_ON_WIRE)
    proxy = _new_proxy()
    sent: list[tuple[int, bytes]] = []

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    ack_count = 0

    def _wait_for_ack_any(candidates, *, timeout=5.0, not_before=None):
        nonlocal ack_count
        ack_count += 1
        return None if ack_count == 2 else (0x0103, b"\x00")

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    ok = proxy.play_ir_blob(blob, inter_frame_delay=0.0)

    assert ok is False
    assert len(sent) == 2


def test_finalize_play_blob_body_keeps_descriptor_rule() -> None:
    proxy = _new_proxy()

    finalized = proxy._finalize_play_blob_body(_canonical_blob_body(DENON_DB_POWER_ON_WIRE))

    assert finalized == _reconstruct_blob(DENON_DB_POWER_ON_WIRE)


def test_descriptor_shape_detection_is_not_tied_to_checksum_field() -> None:
    proxy = _new_proxy()

    assert proxy._looks_like_descriptive_play_blob(_reconstruct_blob(DENON_DB_POWER_ON_WIRE)) is True
    assert proxy._looks_like_descriptive_play_blob(SONY12_DESCRIPTOR_BLOB) is True
    assert proxy._looks_like_descriptive_play_blob(NEC_DESCRIPTOR_BLOB) is True
    assert proxy._looks_like_descriptive_play_blob(_reconstruct_blob(X1_MODE_MOVIE_APP_WIRE)) is False


def test_finalize_play_blob_body_uses_general_tail_rule_for_descriptors() -> None:
    proxy = _new_proxy()

    sony_body = SONY12_DESCRIPTOR_BLOB[:-1]
    nec_body = NEC_DESCRIPTOR_BLOB[:-1]

    assert proxy._finalize_play_blob_body(sony_body) == sony_body + bytes([(sum(sony_body) + 2) & 0xFF])
    assert proxy._finalize_play_blob_body(nec_body) == nec_body + bytes([(sum(nec_body) + 2) & 0xFF])


def test_descriptive_play_blob_text_extracts_ascii_descriptor() -> None:
    proxy = _new_proxy()

    assert proxy._descriptive_play_blob_text(SONY12_DESCRIPTOR_BLOB) == "P:Sony12 R:40000 D:1 F:18 MUL:2"
    assert proxy._descriptive_play_blob_text(NEC_DESCRIPTOR_BLOB) == "P:NEC R:38400 D:0 S:206 F:11"


def test_extract_single_frame_play_blob_unwraps_first_chunk_payload() -> None:
    proxy = _new_proxy()
    # 15B preface = 3B page header + 12B body header (pages=1).
    payload = bytes.fromhex("01 00 01 01 00 01 00 00 00 00 00 00 00 00 00") + SONY12_DESCRIPTOR_BLOB

    # SONY12_DESCRIPTOR_BLOB already carries its trailing body sum8 byte,
    # so the extractor returns the library_data with that byte stripped.
    assert proxy._extract_single_frame_play_blob(payload) == SONY12_DESCRIPTOR_BLOB[:-1]


def test_log_frames_logs_descriptive_play_blob_from_app(caplog) -> None:
    proxy = _new_proxy()
    payload = bytes.fromhex("01 00 01 01 00 01 00 00 00 00 00 00 00 00 00") + SONY12_DESCRIPTOR_BLOB
    opcode = (len(payload) << 8) | 0x0F
    raw = bytes.fromhex("a5 5a") + opcode.to_bytes(2, "big") + payload + b"\x00"

    with caplog.at_level(logging.INFO):
        proxy._log_frames("A→H", [(opcode, raw, payload, 1, 1)])

    assert "descriptor P:Sony12 R:40000 D:1 F:18 MUL:2" in caplog.text


def test_play_ir_blob_replays_synthesized_denonk_descriptor(monkeypatch) -> None:
    proxy = _new_proxy()
    sent = _capture_sends(proxy, monkeypatch)

    blob = build_denonk_ir_blob(device=4, subdevice=1, function=27)
    ok = proxy.play_ir_blob(blob, inter_frame_delay=0.0)

    assert ok is True
    assert sent == _expected_frames(DENON_DB_NAV_UP_WIRE)


def test_finalize_play_blob_body_x1_long_rule_matches_mode_movie_capture() -> None:
    proxy = _new_proxy()
    dumped = _reconstruct_blob(X1_MODE_MOVIE_APP_WIRE)[:-1]

    finalized = proxy._finalize_play_blob_body(dumped)

    assert finalized == _reconstruct_blob(X1_MODE_MOVIE_APP_WIRE)


def test_finalize_play_blob_body_x1_long_rule_matches_cblsat_capture() -> None:
    proxy = _new_proxy()
    dumped = _reconstruct_blob(X1_CBLSAT_APP_WIRE)[:-1]

    finalized = proxy._finalize_play_blob_body(dumped)

    assert finalized == _reconstruct_blob(X1_CBLSAT_APP_WIRE)


@pytest.mark.parametrize(
    "dumped_blob,wire_frames",
    [
        (_reconstruct_blob(X1_OK_APP_WIRE)[:-1] + b"\x85", X1_OK_APP_WIRE),
        (_reconstruct_blob(X1_VOL_UP_APP_WIRE)[:-1] + b"\x04", X1_VOL_UP_APP_WIRE),
        (_reconstruct_blob(X1_VOL_DOWN_APP_WIRE)[:-1] + b"\x63", X1_VOL_DOWN_APP_WIRE),
    ],
)
def test_normalize_play_blob_x1_singleframe_rule_matches_capture(dumped_blob: bytes, wire_frames: list[bytes]) -> None:
    proxy = _new_proxy()

    normalized = proxy._finalize_play_blob_body(dumped_blob[:-1])

    assert normalized == _reconstruct_blob(wire_frames)


@pytest.mark.parametrize(
    "dumped_blob,wire_frames",
    [
        (_reconstruct_blob(X1_MODE_MOVIE_APP_WIRE)[:-1] + b"\x35", X1_MODE_MOVIE_APP_WIRE),
        (_reconstruct_blob(X1_CBLSAT_APP_WIRE)[:-1] + b"\x69", X1_CBLSAT_APP_WIRE),
    ],
)
def test_play_ir_blob_rewrites_long_x1_dump_to_app_capture(dumped_blob: bytes, wire_frames: list[bytes], monkeypatch) -> None:
    proxy = _new_proxy()
    sent = _capture_sends(proxy, monkeypatch)

    ok = proxy.play_ir_blob(dumped_blob[:-1], inter_frame_delay=0.0)

    assert ok is True
    assert sent == _expected_frames(wire_frames)
