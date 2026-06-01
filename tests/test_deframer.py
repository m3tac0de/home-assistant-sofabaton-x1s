"""Wire-layer tests for the length-prefixed Deframer.

Covers the opcode-hi length invariant documented in
``docs/protocol/frame-format.md``: ``frame_length == 5 + buf[2]``.
"""

from __future__ import annotations

from custom_components.sofabaton_x1s.lib.protocol_const import SYNC0, SYNC1
from custom_components.sofabaton_x1s.lib.x1_proxy import Deframer


def _checksum(data: bytes) -> int:
    return sum(data) & 0xFF


def _frame(opcode: int, payload: bytes) -> bytes:
    assert (opcode >> 8) & 0xFF == len(payload), (
        "test bug: opcode hi byte must equal payload length"
    )
    head = bytes([SYNC0, SYNC1, (opcode >> 8) & 0xFF, opcode & 0xFF])
    body = head + payload
    return body + bytes([_checksum(body)])


def test_emits_single_zero_payload_frame():
    d = Deframer()
    frame = _frame(0x0001, b"")
    out = d.feed(frame, cid=1)
    assert len(out) == 1
    opcode, raw, payload, start_cid, end_cid = out[0]
    assert opcode == 0x0001
    assert raw == frame
    assert payload == b""
    assert start_cid == 1 and end_cid == 1


def test_emits_two_back_to_back_frames():
    d = Deframer()
    f1 = _frame(0x023C, b"\x10\xFF")
    f2 = _frame(0x0001, b"")
    out = d.feed(f1 + f2, cid=7)
    assert [x[0] for x in out] == [0x023C, 0x0001]
    assert out[0][1] == f1
    assert out[1][1] == f2


def test_payload_containing_sync_bytes_is_not_misframed():
    """A frame whose payload happens to contain 0xA5 0x5A must still
    be framed using the length byte, not by hunting for the next sync."""

    d = Deframer()
    payload = bytes([SYNC0, SYNC1, 0x00, 0x01])  # 4 bytes including a sync pair
    f1 = _frame(0x0400, payload)  # hi=0x04
    f2 = _frame(0x0001, b"")
    out = d.feed(f1 + f2, cid=1)
    assert len(out) == 2
    assert out[0][1] == f1
    assert out[0][2] == payload
    assert out[1][1] == f2


def test_partial_frame_split_across_reads():
    d = Deframer()
    frame = _frame(0x023C, b"\x10\xFF")
    # Split mid-payload
    out_a = d.feed(frame[:5], cid=11)
    assert out_a == []
    out_b = d.feed(frame[5:], cid=12)
    assert len(out_b) == 1
    opcode, raw, payload, start_cid, end_cid = out_b[0]
    assert raw == frame
    # start_cid is the cid of the read that first carried this frame's sync
    assert start_cid == 11
    assert end_cid == 12


def test_junk_before_sync_is_discarded():
    d = Deframer()
    frame = _frame(0x0001, b"")
    out = d.feed(b"\x00\x01\x02junk" + frame, cid=1)
    assert len(out) == 1
    assert out[0][1] == frame


def test_lone_trailing_sync0_preserved_across_reads():
    """An orphan 0xA5 at end-of-read might be the start of a real sync;
    don't drop it just because SYNC1 hasn't arrived yet."""

    d = Deframer()
    out_a = d.feed(b"\x00\x00" + bytes([SYNC0]), cid=1)
    assert out_a == []
    frame = _frame(0x0001, b"")
    # Provide SYNC1 + rest of frame minus the leading SYNC0 we already buffered
    out_b = d.feed(bytes([SYNC1]) + frame[2:], cid=2)
    assert len(out_b) == 1
    assert out_b[0][1] == frame


def test_bad_checksum_triggers_resync():
    d = Deframer()
    good = _frame(0x0001, b"")
    bad = bytearray(_frame(0x0001, b""))
    bad[-1] ^= 0x01  # corrupt checksum
    out = d.feed(bytes(bad) + good, cid=1)
    # The corrupted frame is dropped; the next real frame still emerges.
    assert len(out) == 1
    assert out[0][1] == good


def test_resync_recovers_after_garbage_with_embedded_sync():
    d = Deframer()
    # A leading 0xA5 0x5A pair that's NOT a real frame (checksum will not match)
    fake_start = bytes([SYNC0, SYNC1, 0x02, 0x00, 0x00, 0x00, 0x00])  # bogus
    good = _frame(0x0001, b"")
    out = d.feed(fake_start + good, cid=1)
    assert any(x[1] == good for x in out)


def test_buffer_cap_does_not_split_aligned_frames():
    """Even with the 1 MB safety cap, aligned frames after the cap still decode."""

    d = Deframer()
    frame = _frame(0x0001, b"")
    # Push enough garbage to trigger the cap-trim, then a real frame
    d.feed(b"\x00" * 1_000_001, cid=1)
    out = d.feed(frame, cid=2)
    assert len(out) == 1
    assert out[0][1] == frame
