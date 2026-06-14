"""Process-wide TCP listener that dispatches accepted hub sockets to
the right :class:`TransportBridge` by peer IP.

Before this module, each ``TransportBridge`` opened its own listening
socket on a unique port (8200, 8201, 8202, ...) and the hub dialled
back to that per-instance port. With multiple hubs on one host that
fanned the firewall surface and the bookkeeping out unnecessarily —
every hub on the LAN has a unique IP, so peer IP is already a clean
dispatch key.

This singleton mirrors the existing :mod:`notify_demuxer` pattern:
each ``TransportBridge`` registers ``(real_hub_ip, on_socket_cb)``;
the listener accepts on one port and routes the socket to the
matching bridge. Registrations also carry the hub's expected MAC
(from the mDNS advertisement) for a sanity-check log if the peer IP
maps to a different MAC than we expected.
"""

from __future__ import annotations

import logging
import socket
import threading
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Tuple

from .hub_logging import get_hub_logger

log = logging.getLogger("x1proxy.listener")

# Default TCP port for the shared hub-side listener. Matches the
# original ``hub_listen_base`` default; user-configured values still
# work — the first registration's port wins (subsequent differing
# values log a warning, mirroring NotifyDemuxer).
DEFAULT_HUB_LISTEN_PORT = 8200


OnSocketCallback = Callable[[socket.socket, Tuple[str, int]], None]


@dataclass(frozen=True)
class HubRegistration:
    proxy_id: str
    real_hub_ip: str
    expected_mac_bytes: bytes  # 6 bytes; all-zero if unknown
    on_socket: OnSocketCallback


class HubListener:
    """Accept TCP connections on one port; dispatch by peer IP."""

    def __init__(self, listen_port: int = DEFAULT_HUB_LISTEN_PORT) -> None:
        self.listen_port = int(listen_port)
        self._sock: Optional[socket.socket] = None
        self._thr: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        # Keyed by real_hub_ip so dispatch is O(1) on accept.
        self._by_ip: Dict[str, HubRegistration] = {}
        self._by_proxy: Dict[str, HubRegistration] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def register_hub(
        self,
        *,
        proxy_id: str,
        real_hub_ip: str,
        on_socket: OnSocketCallback,
        expected_mac_bytes: bytes = b"\x00" * 6,
    ) -> int:
        """Register one bridge; return the listen port to advertise."""

        reg = HubRegistration(
            proxy_id=proxy_id,
            real_hub_ip=real_hub_ip,
            expected_mac_bytes=bytes(expected_mac_bytes[:6]).ljust(6, b"\x00"),
            on_socket=on_socket,
        )
        with self._lock:
            existing = self._by_ip.get(real_hub_ip)
            if existing is not None and existing.proxy_id != proxy_id:
                get_hub_logger(log, proxy_id).warning(
                    "[LISTEN] replacing existing registration for %s "
                    "(was proxy=%s)",
                    real_hub_ip,
                    existing.proxy_id,
                )
                self._by_proxy.pop(existing.proxy_id, None)
            self._by_ip[real_hub_ip] = reg
            self._by_proxy[proxy_id] = reg
            self._ensure_running_locked()
            get_hub_logger(log, proxy_id).info(
                "[LISTEN] registered hub %s on shared port %d",
                real_hub_ip,
                self.listen_port,
            )
            return self.listen_port

    def unregister_hub(self, proxy_id: str) -> None:
        with self._lock:
            reg = self._by_proxy.pop(proxy_id, None)
            if reg is not None:
                if self._by_ip.get(reg.real_hub_ip) is reg:
                    self._by_ip.pop(reg.real_hub_ip, None)
                get_hub_logger(log, proxy_id).info(
                    "[LISTEN] unregistered hub %s", reg.real_hub_ip
                )
            self._stop_if_idle_locked()

    def shutdown(self) -> None:
        with self._lock:
            self._by_ip.clear()
            self._by_proxy.clear()
            self._stop_thread_locked()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _ensure_running_locked(self) -> None:
        if self._thr is not None and self._thr.is_alive():
            return
        self._stop_event = threading.Event()
        self._sock = self._open_socket()
        self._thr = threading.Thread(
            target=self._accept_loop,
            name="x1proxy-hub-listen",
            daemon=True,
        )
        self._thr.start()

    def _stop_if_idle_locked(self) -> None:
        if self._by_proxy:
            return
        self._stop_thread_locked()

    def _stop_thread_locked(self) -> None:
        self._stop_event.set()
        if self._sock is not None:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None
        if self._thr is not None:
            self._thr.join(timeout=1.0)
            self._thr = None

    def _open_socket(self) -> socket.socket:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.bind(("0.0.0.0", self.listen_port))
        s.listen(8)
        s.settimeout(1.0)
        log.info("[LISTEN] accepting hubs on *:%d", self.listen_port)
        return s

    def _accept_loop(self) -> None:
        sock = self._sock
        if sock is None:
            return
        while not self._stop_event.is_set():
            try:
                client, addr = sock.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            peer_ip, peer_port = addr[0], addr[1]

            with self._lock:
                reg = self._by_ip.get(peer_ip)

            if reg is None:
                log.warning(
                    "[LISTEN] dropping unrecognised hub connection from %s:%d",
                    peer_ip,
                    peer_port,
                )
                try:
                    client.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    client.close()
                except Exception:
                    pass
                continue

            get_hub_logger(log, reg.proxy_id).info(
                "[LISTEN] accepted hub %s:%d", peer_ip, peer_port
            )
            try:
                reg.on_socket(client, (peer_ip, peer_port))
            except Exception:
                get_hub_logger(log, reg.proxy_id).exception(
                    "[LISTEN] on_socket callback raised; closing"
                )
                try:
                    client.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    client.close()
                except Exception:
                    pass


_GLOBAL_LISTENER: Optional[HubListener] = None
_GLOBAL_LOCK = threading.Lock()


def get_hub_listener(listen_port: Optional[int] = None) -> HubListener:
    """Return the process-wide :class:`HubListener` singleton.

    The first caller fixes the listen port. Later callers requesting a
    different port get a warning and the existing instance — matching
    the lifecycle behaviour of :func:`get_notify_demuxer`.
    """

    global _GLOBAL_LISTENER
    with _GLOBAL_LOCK:
        if _GLOBAL_LISTENER is None:
            _GLOBAL_LISTENER = HubListener(listen_port or DEFAULT_HUB_LISTEN_PORT)
        elif listen_port is not None and listen_port != _GLOBAL_LISTENER.listen_port:
            log.warning(
                "[LISTEN] existing listener on %d (ignoring requested %d)",
                _GLOBAL_LISTENER.listen_port,
                listen_port,
            )
        return _GLOBAL_LISTENER


def reset_hub_listener_for_tests() -> None:
    """Test helper: drop the global singleton."""

    global _GLOBAL_LISTENER
    with _GLOBAL_LOCK:
        if _GLOBAL_LISTENER is not None:
            _GLOBAL_LISTENER.shutdown()
            _GLOBAL_LISTENER = None
