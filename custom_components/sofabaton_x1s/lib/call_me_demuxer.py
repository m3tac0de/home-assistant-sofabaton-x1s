from __future__ import annotations

import logging
import socket
import struct
import threading
import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Tuple

from .protocol_const import OP_CALL_ME, SYNC0, SYNC1

log = logging.getLogger("x1proxy.call_me")


def _sum8(b: bytes) -> int:
    return sum(b) & 0xFF


def _route_local_ip(peer_ip: str) -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect((peer_ip, 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        try:
            s.close()
        except Exception:
            pass


def _parse_mac_bytes(mac: Optional[str]) -> bytes:
    if not mac or not isinstance(mac, str):
        return b"\x00\x00\x00\x00\x00\x00"

    cleaned = mac.replace(":", "").replace("-", "").strip()
    if len(cleaned) != 12:
        return b"\x00\x00\x00\x00\x00\x00"

    try:
        return bytes.fromhex(cleaned)
    except ValueError:
        return b"\x00\x00\x00\x00\x00\x00"


@dataclass
class CallMeRegistration:
    key: str
    name: str
    mac: bytes
    get_udp_port: Callable[[], int]
    connect_handler: Callable[[Tuple[str, int]], None]
    is_enabled: Callable[[], bool]


class CallMeDemuxer:
    def __init__(self, listen_port: int = 8102, *, throttle: float = 1.5, stop_delay: float = 30.0) -> None:
        self.listen_port = listen_port
        self.throttle = throttle
        self.stop_delay = stop_delay

        self._registrations: Dict[str, CallMeRegistration] = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._sock: Optional[socket.socket] = None
        self._last_sent: Dict[Tuple[str, int, str], float] = {}
        self._stop_after: Optional[float] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def register(self, registration: CallMeRegistration) -> Callable[[], None]:
        with self._lock:
            self._registrations[registration.key] = registration
            log.info(
                "[UDP] registered CALL_ME responder %s (mac=%s)",
                registration.name,
                registration.mac.hex(":"),
            )
            if self._thread is None or not self._thread.is_alive():
                self._start()

        def _unregister() -> None:
            self.unregister(registration.key)

        return _unregister

    def unregister(self, key: str) -> None:
        with self._lock:
            self._registrations.pop(key, None)
            if not self._registrations:
                self._stop.set()
                self._close_sock()
                log.info("[UDP] no CALL_ME registrations remain; listener stopping")

    def _start(self) -> None:
        self._stop.clear()
        self._stop_after = None
        try:
            self._sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            self._sock.bind(("", self.listen_port))
        except OSError:
            log.warning("[UDP] failed to bind broadcast listener on *:%d", self.listen_port, exc_info=True)
            self._sock = None
            return

        self._thread = threading.Thread(target=self._loop, name="x1proxy-callme", daemon=True)
        self._thread.start()
        log.info("[UDP] broadcast CALL_ME demuxer listening on *:%d", self.listen_port)

    def stop(self) -> None:
        self._stop.set()
        self._close_sock()

    def _close_sock(self) -> None:
        if self._sock:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None

    # ------------------------------------------------------------------
    # External notifications
    # ------------------------------------------------------------------
    def mark_client_connected(self) -> None:
        # give the app a window to retry without keeping the port forever
        self._stop_after = time.monotonic() + self.stop_delay

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _loop(self) -> None:
        sock = self._sock
        if sock is None:
            return

        while not self._stop.is_set():
            if self._stop_after is not None and time.monotonic() >= self._stop_after:
                log.info("[UDP] broadcast listener idle after client connect; stopping")
                break

            try:
                pkt, (src_ip, src_port) = sock.recvfrom(2048)
            except OSError:
                log.info("[UDP] broadcast listener socket closed")
                break

            pkt_len = len(pkt)
            if pkt_len < 16 or pkt[0] != SYNC0 or pkt[1] != SYNC1:
                log.debug(
                    "[UDP] ignored packet len=%d from %s:%d (sync/size)",
                    pkt_len,
                    src_ip,
                    src_port,
                )
                continue
            op = (pkt[2] << 8) | pkt[3]
            if op != OP_CALL_ME:
                log.debug(
                    "[UDP] ignored opcode 0x%04X from %s:%d", op, src_ip, src_port
                )
                continue

            try:
                app_ip = socket.inet_ntoa(pkt[10:14])
                app_port = struct.unpack(">H", pkt[14:16])[0]
            except Exception:
                log.debug(
                    "[UDP] failed to parse CALL_ME from %s:%d (len=%d)",
                    src_ip,
                    src_port,
                    pkt_len,
                    exc_info=True,
                )
                continue

            log.info(
                "[UDP] CALL_ME broadcast from %s:%d advertising app %s:%d",
                src_ip,
                src_port,
                app_ip,
                app_port,
            )
            self._handle_call_me(app_ip, app_port, src_ip, src_port)

        self._close_sock()

    def _handle_call_me(self, app_ip: str, app_port: int, src_ip: str, src_port: int) -> None:
        now = time.time()
        with self._lock:
            regs = list(self._registrations.values())

        for reg in regs:
            if not reg.is_enabled():
                log.debug("[UDP] skipping %s (disabled)", reg.name)
                continue

            key = (app_ip, app_port, reg.key)
            if now - self._last_sent.get(key, 0) < self.throttle:
                log.debug("[UDP] throttling CALL_ME reply for %s", reg.name)
                continue

            try:
                reg.connect_handler((app_ip, app_port))
            except Exception:
                log.exception("[UDP] connect handler failed for %s", reg.name)

            try:
                udp_port = reg.get_udp_port()
            except Exception:
                log.exception("[UDP] failed to read udp port for %s", reg.name)
                continue

            if udp_port <= 0:
                log.info("[UDP] skipping CALL_ME reply for %s (invalid port %d)", reg.name, udp_port)
                continue

            my_ip = _route_local_ip(src_ip)
            payload = reg.mac[:6].ljust(6, b"\x00") + socket.inet_aton(my_ip) + struct.pack(">H", udp_port)
            frame = bytes([SYNC0, SYNC1, (OP_CALL_ME >> 8) & 0xFF, OP_CALL_ME & 0xFF]) + payload
            frame += bytes([_sum8(frame)])

            try:
                if self._sock:
                    self._sock.sendto(frame, (app_ip, app_port))
                self._last_sent[key] = now
                log.info(
                    "[UDP] replied CALL_ME for %s -> app %s:%d (src %s:%d) advertising %s:%d",
                    reg.name,
                    app_ip,
                    app_port,
                    src_ip,
                    src_port,
                    my_ip,
                    udp_port,
                )
            except Exception:
                log.exception("[UDP] failed to send CALL_ME reply for %s", reg.name)


_DEMUXER = CallMeDemuxer()


def register_call_me_proxy(
    *,
    key: str,
    name: str,
    mac: Optional[str],
    get_udp_port: Callable[[], int],
    connect_handler: Callable[[Tuple[str, int]], None],
    is_enabled: Callable[[], bool],
) -> Callable[[], None]:
    reg = CallMeRegistration(
        key=key,
        name=name,
        mac=_parse_mac_bytes(mac),
        get_udp_port=get_udp_port,
        connect_handler=connect_handler,
        is_enabled=is_enabled,
    )
    return _DEMUXER.register(reg)


def notify_call_me_client_state(connected: bool) -> None:
    if connected:
        _DEMUXER.mark_client_connected()


def stop_call_me_demuxer() -> None:
    _DEMUXER.stop()
