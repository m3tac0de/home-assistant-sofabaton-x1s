"""Stream-to-frame splitter using the opcode-hi length invariant.

Every wire frame is ``SYNC0 SYNC1 hi lo payload(hi bytes) checksum``,
so the total length is ``5 + buf[2]`` once the sync bytes are aligned
(see ``docs/protocol/frame-format.md``). This module exposes that as
a small reusable :class:`Deframer`; it lives here rather than inside
``x1_proxy.py`` because the transport bridge also frames bytes and
the proxy stays a thin orchestrator.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from .protocol_const import SYNC0, SYNC1


def _sum8(b: bytes) -> int:
    return sum(b) & 0xFF


class Deframer:
    def __init__(self) -> None:
        self.buf = bytearray()
        self._cur_start_cid: Optional[int] = None

    def feed(self, data: bytes, cid: int) -> List[Tuple[int, bytes, bytes, int, int]]:
        out: List[Tuple[int, bytes, bytes, int, int]] = []
        if not data:
            return out
        self.buf.extend(data)
        if len(self.buf) > 1_000_000:
            del self.buf[:500_000]
            self._cur_start_cid = None

        while True:
            if len(self.buf) < 2:
                break
            if self.buf[0] != SYNC0 or self.buf[1] != SYNC1:
                idx = self.buf.find(bytes([SYNC0, SYNC1]))
                if idx < 0:
                    # Preserve a lone trailing SYNC0 across reads.
                    if self.buf and self.buf[-1] == SYNC0:
                        del self.buf[:-1]
                    else:
                        self.buf.clear()
                    self._cur_start_cid = None
                    break
                del self.buf[:idx]
                self._cur_start_cid = None

            if len(self.buf) < 5:
                break
            if self._cur_start_cid is None:
                self._cur_start_cid = cid

            frame_len = 5 + self.buf[2]
            if len(self.buf) < frame_len:
                break

            cand = bytes(self.buf[:frame_len])
            if cand[-1] == (_sum8(cand[:-1]) & 0xFF):
                opcode = (cand[2] << 8) | cand[3]
                out.append((opcode, cand, cand[4:-1], self._cur_start_cid, cid))
                del self.buf[:frame_len]
                self._cur_start_cid = None
                continue

            # Bad checksum at this sync: drop one byte and rescan.
            del self.buf[0]
            self._cur_start_cid = None

        return out
