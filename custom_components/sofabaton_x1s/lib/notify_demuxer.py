from __future__ import annotations

import logging
import ipaddress
import socket
import threading
import time
from dataclasses import dataclass
from typing import Dict, Optional

from .protocol_const import SYNC0, SYNC1

log = logging.getLogger("x1proxy.notify")

NOTIFY_ME_PAYLOAD = bytes.fromhex("a55a00c1c0")


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


def _broadcast_ip(peer_ip: str) -> str:
    try:
        addr = ipaddress.ip_address(peer_ip)
        network = ipaddress.ip_network(f"{addr}/24", strict=False)
        return str(network.broadcast_address)
    except ValueError:
        return "255.255.255.255"


@dataclass(frozen=True)
class NotifyRegistration:
    proxy_id: str
    real_hub_ip: str
    mdns_txt: Dict[str, str]
    call_me_port: int


class NotifyDemuxer:
    """Listen for NOTIFY_ME broadcasts and respond for registered proxies."""

    def __init__(self, listen_port: int = 8102) -> None:
        self.listen_port = listen_port
        self._sock: Optional[socket.socket] = None
        self._thr: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        self._registrations: Dict[str, NotifyRegistration] = {}
        self._last_reply: Dict[tuple[str, int, str], float] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def register_proxy(
        self,
        proxy_id: str,
        real_hub_ip: str,
        mdns_txt: Dict[str, str],
        call_me_port: int,
    ) -> None:
        reg = NotifyRegistration(proxy_id, real_hub_ip, dict(mdns_txt), int(call_me_port))
        with self._lock:
            self._registrations[proxy_id] = reg
            log.info(
                "[DEMUX] registered proxy %s for hub %s (CALL_ME -> %s:%d)",
                proxy_id,
                real_hub_ip,
                _route_local_ip(real_hub_ip),
                reg.call_me_port,
            )
            self._ensure_running_locked()

    def unregister_proxy(self, proxy_id: str) -> None:
        with self._lock:
            if proxy_id in self._registrations:
                self._registrations.pop(proxy_id, None)
                log.info("[DEMUX] unregistered proxy %s", proxy_id)
            self._stop_if_idle_locked()

    def shutdown(self) -> None:
        with self._lock:
            self._registrations.clear()
            self._stop_thread_locked()

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _ensure_running_locked(self) -> None:
        if self._thr and self._thr.is_alive():
            return
        self._stop_event = threading.Event()
        self._sock = self._open_socket()
        self._thr = threading.Thread(
            target=self._notify_loop, name="x1proxy-notify-demux", daemon=True
        )
        self._thr.start()

    def _stop_if_idle_locked(self) -> None:
        if self._registrations:
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
        self._last_reply.clear()

    def _open_socket(self) -> socket.socket:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.bind(("0.0.0.0", self.listen_port))
        s.settimeout(1.0)
        log.info("[DEMUX] listening for NOTIFY_ME on *:%d", self.listen_port)
        return s

    def _notify_loop(self) -> None:
        sock = self._sock
        if sock is None:
            return
        while not self._stop_event.is_set():
            try:
                pkt, (src_ip, src_port) = sock.recvfrom(2048)
            except socket.timeout:
                continue
            except OSError:
                break

            if pkt != NOTIFY_ME_PAYLOAD:
                continue

            with self._lock:
                registrations = list(self._registrations.values())

            for reg in registrations:
                key = (src_ip, src_port, reg.proxy_id)
                now = time.monotonic()
                last = self._last_reply.get(key, 0.0)
                if now - last < 2.0:
                    continue

                reply = self._build_notify_reply(reg)
                if reply is None:
                    continue

                self._last_reply[key] = now
                dest_ip = _broadcast_ip(src_ip)
                log.info(
                    "[DEMUX] NOTIFY_ME from %s:%d -> proxy=%s CALL_ME=%d broadcast=%s",
                    src_ip,
                    src_port,
                    reg.proxy_id,
                    reg.call_me_port,
                    dest_ip,
                )
                try:
                    sock.sendto(reply, (dest_ip, src_port))
                except OSError:
                    log.exception("[DEMUX] failed to send NOTIFY_ME reply for %s", reg.proxy_id)

    def _build_notify_reply(self, reg: NotifyRegistration) -> Optional[bytes]:
        try:
            mac_raw = (
                reg.mdns_txt.get("MAC")
                or reg.mdns_txt.get("mac")
                or reg.mdns_txt.get("macaddress")
            )
            mac_bytes = (
                bytes.fromhex(str(mac_raw).replace(":", "").replace("-", ""))
                if mac_raw
                else b""
            )
        except ValueError:
            mac_bytes = b""

        if len(mac_bytes) < 6:
            mac_bytes = mac_bytes.ljust(6, b"\x00")
        else:
            mac_bytes = mac_bytes[:6]

        name = (
            reg.mdns_txt.get("NAME")
            or reg.mdns_txt.get("name")
            or reg.mdns_txt.get("Name")
            or "X1 Hub"
        ).encode("utf-8")

        name_bytes = name[:14].ljust(14, b"\x00")

        version_block = bytes.fromhex("640220221120050100")
        status_byte = b"\x45"

        frame = (
            bytes([SYNC0, SYNC1, 0x1D])
            + mac_bytes
            + status_byte
            + version_block
            + name_bytes
            + b"\xBE"
        )

        log.info(
            "[DEMUX][REPLY] proxy=%s mac=%s name=%s",
            reg.proxy_id,
            mac_bytes.hex(":"),
            name.decode("utf-8", "ignore"),
        )
        return frame


_GLOBAL_DEMUXER: Optional[NotifyDemuxer] = None


def get_notify_demuxer() -> NotifyDemuxer:
    global _GLOBAL_DEMUXER
    if _GLOBAL_DEMUXER is None:
        _GLOBAL_DEMUXER = NotifyDemuxer()
    return _GLOBAL_DEMUXER
