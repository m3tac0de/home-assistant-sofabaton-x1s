"""Tests for play_ir_blob wire-format generation.

Each fixture is a real capture of the official Sofabaton app's "Test" feature
exchanging family-0x0F frames with a hub. We reconstruct the source blob from
the captured frames, run it through ``X1Proxy.play_ir_blob``, and assert the
generated frames match the originals byte-for-byte.

Captures:
- Sony POWER ON   — X1 hub, 2 frames (FA0F + 5D0F)
- Denon cmd 1     — X1 hub, 4 frames (FA0F × 3 + 570F)
- X1S 5-frame cmd — X1S hub, 5 frames (FA0F × 4 + F00F)
- X1S 1-frame cmd — X1S hub, 1 frame  (6C0F)  — exercises X=1 single-frame path

Fixtures store full frames as captured on the wire (magic + opcode + payload +
sum8). ``_split_frame`` peels off the 4-byte header and 1-byte trailer to give
back ``(opcode, payload)`` — same form the proxy emits.
"""

from __future__ import annotations

import re

import pytest

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
    preface_and_subheader = _hx("01 00 01 01 00 01 00 00 00 00 00 00 00")  # 13B
    blob_head = _hx(
        "00 00 00 50 00 00 10 00 94 70 1c 3a 40 62 21 df 0d 7f 8c 53 19 67 8c"
        "61 32 71 ca 5b 95 0d 1d 69 fc 79 8c 00 e0 27 8c 00 dc c4 21 00 00 66"
        "6f 11 11 64 71 00 6f 54 67 11 77 7f 67 96 6f 61"
    )
    blob_chk = _hx("45")  # blob's own trailing sum8 byte
    frame_chk = _hx("06")  # frame's trailing sum8 byte
    pad_len = 108 - len(preface_and_subheader) - len(blob_head) - len(blob_chk)
    return head + preface_and_subheader + blob_head + (b"\x00" * pad_len) + blob_chk + frame_chk


X1S_SINGLEFRAME_WIRE: list[bytes] = [_build_x1s_singleframe()]


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
    """Strip per-chunk overhead from each frame and re-glue the blob.

    Frame 1 strips the 13-byte preface+sub-header. Continuations strip the 3-byte
    preface only. A dummy trailing byte (0x00) is appended to stand in for the
    blob's own sum8 — ``play_ir_blob`` will strip it back off before chunking,
    so its actual value is irrelevant for round-trip testing.
    """
    parts: list[bytes] = []
    for idx, wire in enumerate(frames):
        _, payload = _split_frame(wire)
        parts.append(payload[13:] if idx == 0 else payload[3:])
    return b"".join(parts) + b"\x00"


def _expected_frames(frames: list[bytes]) -> list[tuple[int, bytes]]:
    return [_split_frame(w) for w in frames]


def _new_proxy() -> X1Proxy:
    return X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)


def _capture_sends(proxy: X1Proxy, monkeypatch) -> list[tuple[int, bytes]]:
    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    return sent


# ---------------------------------------------------------------------------
# Tests — byte-for-byte equivalence against captured frames
# ---------------------------------------------------------------------------

CAPTURES = {
    "sony_power_on_x1": SONY_POWER_ON_WIRE,
    "denon_multi_x1": DENON_MULTI_WIRE,
    "x1s_5frame": X1S_5FRAME_WIRE,
    "x1s_singleframe": X1S_SINGLEFRAME_WIRE,
}


@pytest.mark.parametrize("name", list(CAPTURES.keys()))
def test_play_ir_blob_matches_capture(name: str, monkeypatch) -> None:
    wire_frames = CAPTURES[name]
    expected = _expected_frames(wire_frames)
    blob = _reconstruct_blob(wire_frames)

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
def test_subheader_x_equals_frame_count(name: str, expected_x: int, monkeypatch) -> None:
    blob = _reconstruct_blob(CAPTURES[name])
    proxy = _new_proxy()
    sent = _capture_sends(proxy, monkeypatch)

    proxy.play_ir_blob(blob, inter_frame_delay=0.0)

    # Frame 1 layout: [01 00 01] [01 00 <X> 00 00 00 00 00 00 00] [blob...]
    first_payload = sent[0][1]
    assert first_payload[:3] == b"\x01\x00\x01"
    assert first_payload[3:5] == b"\x01\x00"
    assert first_payload[5] == expected_x
    assert first_payload[6:13] == b"\x00\x00\x00\x00\x00\x00\x00"


# ---------------------------------------------------------------------------
# Tests — chunk sequence + opcode encoding
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("name", list(CAPTURES.keys()))
def test_chunk_sequence_and_family(name: str, monkeypatch) -> None:
    blob = _reconstruct_blob(CAPTURES[name])
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
