"""Transport coordination between hub and app sockets."""
from __future__ import annotations

import logging
import select
import socket
import threading
import time
from typing import Callable, List, Optional, Tuple

from .protocol_const import SYNC0, SYNC1

log = logging.getLogger("x1proxy.transport")


def _sum8(b: bytes) -> int:
    return sum(b) & 0xFF


def _hexdump(data: bytes) -> str:
    return data.hex(" ")


def _enable_keepalive(sock: socket.socket, *, idle: int = 30, interval: int = 10, count: int = 3) -> None:
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    except Exception:
        pass
    try:  # Linux
        TCP_KEEPIDLE = getattr(socket, "TCP_KEEPIDLE", None)
        TCP_KEEPINTVL = getattr(socket, "TCP_KEEPINTVL", None)
        TCP_KEEPCNT = getattr(socket, "TCP_KEEPCNT", None)
        if TCP_KEEPIDLE is not None:
            sock.setsockopt(socket.IPPROTO_TCP, TCP_KEEPIDLE, idle)
        if TCP_KEEPINTVL is not None:
            sock.setsockopt(socket.IPPROTO_TCP, TCP_KEEPINTVL, interval)
        if TCP_KEEPCNT is not None:
            sock.setsockopt(socket.IPPROTO_TCP, TCP_KEEPCNT, count)
    except Exception:
        pass
    try:  # macOS/Windows approx
        TCP_KEEPALIVE = getattr(socket, "TCP_KEEPALIVE", None)
        if TCP_KEEPALIVE is not None:
            sock.setsockopt(socket.IPPROTO_TCP, TCP_KEEPALIVE, idle)
    except Exception:
        pass


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

        while True:
            start = self.buf.find(bytes([SYNC0, SYNC1]))
            if start < 0:
                self.buf.clear()
                self._cur_start_cid = None
                break
            if start:
                del self.buf[:start]
                self._cur_start_cid = self._cur_start_cid or cid
            if len(self.buf) < 5:
                break
            if self._cur_start_cid is None:
                self._cur_start_cid = cid

            nxt = self.buf.find(bytes([SYNC0, SYNC1]), 2)
            if nxt != -1:
                cand = bytes(self.buf[:nxt])
                if cand and cand[-1] == (_sum8(cand[:-1]) & 0xFF):
                    opcode = (cand[2] << 8) | cand[3]
                    out.append((opcode, cand, cand[4:-1], self._cur_start_cid or cid, cid))
                    del self.buf[:nxt]
                    self._cur_start_cid = None
                    continue
                del self.buf[0]
                if not (len(self.buf) >= 2 and self.buf[0] == SYNC0 and self.buf[1] == SYNC1):
                    self._cur_start_cid = None
                continue

            cand = bytes(self.buf)
            if len(cand) >= 5 and cand[0] == SYNC0 and cand[1] == SYNC1 and cand[-1] == (_sum8(cand[:-1]) & 0xFF):
                opcode = (cand[2] << 8) | cand[3]
                out.append((opcode, cand, cand[4:-1], self._cur_start_cid or cid, cid))
                self.buf.clear()
                self._cur_start_cid = None
            break
        return out


class TransportBridge:
    """Bridge data between hub and app sockets with frame callbacks."""

    def __init__(
        self,
        *,
        diag_dump: bool,
        diag_parse: bool,
        ka_idle: int,
        ka_interval: int,
        ka_count: int,
        on_hub_frames: Callable[[List[Tuple[int, bytes, bytes, int, int]]], None],
        on_app_frames: Callable[[List[Tuple[int, bytes, bytes, int, int]]], None],
        on_hub_state: Callable[[bool], None],
        on_app_state: Callable[[bool], None],
        tick: Callable[[], None],
    ) -> None:
        self._diag_dump = diag_dump
        self._diag_parse = diag_parse
        self._ka_idle = ka_idle
        self._ka_interval = ka_interval
        self._ka_count = ka_count
        self._on_hub_frames = on_hub_frames
        self._on_app_frames = on_app_frames
        self._on_hub_state = on_hub_state
        self._on_app_state = on_app_state
        self._tick = tick

        self._stop = threading.Event()
        self._hub_sock: Optional[socket.socket] = None
        self._app_sock: Optional[socket.socket] = None
        self._hub_lock = threading.Lock()
        self._app_lock = threading.Lock()
        self._cmd_lock = threading.Lock()
        self._local_to_hub = bytearray()
        self._chunk_id = 0

        self._df_h2a = Deframer()
        self._df_a2h = Deframer()

        self._thread: Optional[threading.Thread] = None

    # Socket management -----------------------------------------------------
    def set_hub_socket(self, sock: Optional[socket.socket]) -> None:
        with self._hub_lock:
            if self._hub_sock is not None and self._hub_sock is not sock:
                try:
                    self._hub_sock.close()
                except Exception:
                    pass
            self._hub_sock = sock
            if sock is not None:
                _enable_keepalive(sock, idle=self._ka_idle, interval=self._ka_interval, count=self._ka_count)
        self._on_hub_state(sock is not None)

    def set_app_socket(self, sock: Optional[socket.socket]) -> None:
        with self._app_lock:
            if self._app_sock is not None and self._app_sock is not sock:
                try:
                    self._app_sock.close()
                except Exception:
                    pass
            self._app_sock = sock
        self._on_app_state(sock is not None)

    def queue_local_frame(self, frame: bytes) -> None:
        with self._cmd_lock:
            self._local_to_hub.extend(frame)

    def can_issue_commands(self) -> bool:
        with self._app_lock:
            return self._app_sock is None

    # Lifecycle -------------------------------------------------------------
    def start(self) -> None:
        self._stop.clear()
        t = threading.Thread(target=self._bridge_forever, name="x1proxy-bridge", daemon=True)
        t.start()
        self._thread = t

    def stop(self) -> None:
        self._stop.set()
        with self._hub_lock:
            if self._hub_sock is not None:
                try:
                    self._hub_sock.close()
                except Exception:
                    pass
                self._hub_sock = None
        with self._app_lock:
            if self._app_sock is not None:
                try:
                    self._app_sock.close()
                except Exception:
                    pass
                self._app_sock = None
        if self._thread:
            self._thread.join(timeout=1.0)

    # Bridge loop -----------------------------------------------------------
    def _bridge_forever(self) -> None:
        app_to_hub = bytearray()

        while not self._stop.is_set():
            with self._hub_lock:
                hub = self._hub_sock
            with self._app_lock:
                app = self._app_sock

            rlist: List[socket.socket] = []
            if hub is not None:
                rlist.append(hub)
            if app is not None:
                rlist.append(app)

            wlist: List[socket.socket] = []
            if hub is not None and (app_to_hub or self._local_to_hub):
                wlist.append(hub)

            if not rlist and not wlist:
                time.sleep(0.05)
                continue

            try:
                r, w, _ = select.select(rlist, wlist, [], 0.5)
            except (OSError, ValueError):
                continue

            # HUB reads
            if hub is not None and hub in r:
                try:
                    data = hub.recv(65536)
                except (BlockingIOError, OSError):
                    data = b""
                if not data:
                    with self._hub_lock:
                        try:
                            hub.shutdown(socket.SHUT_RDWR)
                        except Exception:
                            pass
                        try:
                            hub.close()
                        except Exception:
                            pass
                        self._hub_sock = None
                    log.info("[TCP] Hub disconnected")
                    self._on_hub_state(False)
                else:
                    self._chunk_id += 1
                    hcid = self._chunk_id
                    if self._diag_dump:
                        log.info("[DUMP #%d] H→A %s", hcid, _hexdump(data))
                    if self._diag_parse:
                        frames = self._df_h2a.feed(data, hcid)
                        if frames:
                            self._on_hub_frames(frames)
                    if app is not None:
                        try:
                            app.sendall(data)
                        except Exception:
                            pass

            # APP reads
            if app is not None and app in r:
                try:
                    data = app.recv(65536)
                except (BlockingIOError, OSError):
                    data = b""
                if not data:
                    with self._app_lock:
                        try:
                            app.shutdown(socket.SHUT_RDWR)
                        except Exception:
                            pass
                        try:
                            app.close()
                        except Exception:
                            pass
                        self._app_sock = None
                    app_to_hub.clear()
                    log.info("[TCP] App disconnected")
                    self._on_app_state(False)
                else:
                    self._chunk_id += 1
                    acid = self._chunk_id
                    if self._diag_dump:
                        log.info("[DUMP #%d] A→H %s", acid, _hexdump(data))
                    if self._diag_parse:
                        frames = self._df_a2h.feed(data, acid)
                        if frames:
                            self._on_app_frames(frames)
                    app_to_hub.extend(data)

            # HUB writes (local commands first, then proxied data)
            if hub is not None and hub in w:
                if self._local_to_hub:
                    try:
                        with self._cmd_lock:
                            sent = hub.send(self._local_to_hub)
                            if sent:
                                del self._local_to_hub[:sent]
                    except (BlockingIOError, InterruptedError, OSError):
                        pass
                if app_to_hub:
                    try:
                        sent = hub.send(app_to_hub)
                        if sent:
                            del app_to_hub[:sent]
                    except (BlockingIOError, InterruptedError, OSError):
                        pass

            self._tick()
