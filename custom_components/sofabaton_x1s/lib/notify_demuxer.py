from __future__ import annotations

import logging
import ipaddress
import socket
import struct
import threading
import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional

from ..const import HUB_VERSION_X1, classify_hub_version
from .protocol_const import OP_CALL_ME, SYNC0, SYNC1

log = logging.getLogger("x1proxy.notify")

NOTIFY_ME_PAYLOAD = bytes.fromhex("a55a00c1c0")
BROADCAST_LISTEN_PORT = 8100


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
    hub_version: str
    call_me_port: int
    call_me_cb: Callable[[str, int, str, int], None]
    mac_bytes: bytes
    device_id: bytes
    call_me_hint: bytes


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
        call_me_cb: Callable[[str, int, str, int], None],
    ) -> None:
        mac_bytes = self._extract_mac_bytes(mdns_txt)
        hub_version = classify_hub_version(mdns_txt)
        device_id, call_me_hint = self._build_device_identifiers(
            mac_bytes, hub_version
        )
        reg = NotifyRegistration(
            proxy_id,
            real_hub_ip,
            dict(mdns_txt),
            hub_version,
            int(call_me_port),
            call_me_cb,
            mac_bytes,
            device_id,
            call_me_hint,
        )
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
        reuseport_enabled = False
        reuseport_opt = getattr(socket, "SO_REUSEPORT", None)
        if reuseport_opt is not None:
            try:
                s.setsockopt(socket.SOL_SOCKET, reuseport_opt, 1)
                reuseport_enabled = True
            except OSError:
                log.warning("[DEMUX] SO_REUSEPORT not available")
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        s.bind(("0.0.0.0", self.listen_port))
        s.settimeout(1.0)
        log.info(
            "[DEMUX] listening for NOTIFY_ME/CALL_ME on *:%d (SO_REUSEPORT=%s)",
            self.listen_port,
            reuseport_enabled,
        )
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

            if pkt == NOTIFY_ME_PAYLOAD:
                self._handle_notify_me(sock, pkt, src_ip, src_port)
                continue

            if len(pkt) >= 16 and pkt[0] == SYNC0 and pkt[1] == SYNC1:
                op = (pkt[2] << 8) | pkt[3]
                if op == OP_CALL_ME:
                    self._handle_call_me(pkt, src_ip, src_port)

    def _build_notify_reply(self, reg: NotifyRegistration) -> Optional[bytes]:
        name = (
            reg.mdns_txt.get("NAME")
            or reg.mdns_txt.get("name")
            or reg.mdns_txt.get("Name")
            or "X1 Hub"
        ).encode("utf-8")
        if reg.hub_version == HUB_VERSION_X1:
            name_bytes = name[:12]
            version_block = bytes.fromhex("640120210609110000")
            frame = (
                bytes([SYNC0, SYNC1, 0x1A])
                + reg.device_id
                + version_block
                + name_bytes
            )
        else:
            name_bytes = name[:14].ljust(14, b"\x00")
            version_block = bytes.fromhex("640220221120050100")
            frame = (
                bytes([SYNC0, SYNC1, 0x1D])
                + reg.device_id
                + version_block
                + name_bytes
                + b"\xBE"
            )

        log.info(
            "[DEMUX][REPLY] proxy=%s mac=%s name=%s",
            reg.proxy_id,
            reg.mac_bytes.hex(":"),
            name.decode("utf-8", "ignore"),
        )
        return frame

    def _handle_notify_me(
        self, sock: socket.socket, pkt: bytes, src_ip: str, src_port: int
    ) -> None:
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
                sock.sendto(reply, (dest_ip, BROADCAST_LISTEN_PORT))
            except OSError:
                log.exception("[DEMUX] failed to send NOTIFY_ME reply for %s", reg.proxy_id)

    def _handle_call_me(self, pkt: bytes, src_ip: str, src_port: int) -> None:
        try:
            app_ip = socket.inet_ntoa(pkt[10:14])
            app_port = struct.unpack(">H", pkt[14:16])[0]
        except Exception:
            return

        mac_hint = pkt[4:10]
        with self._lock:
            registrations = list(self._registrations.values())

        reg = self._select_registration(mac_hint, registrations)
        if reg is None:
            log.warning(
                "[DEMUX] CALL_ME from %s:%d ignored (no proxy match, mac=%s)",
                src_ip,
                src_port,
                mac_hint.hex(":"),
            )
            return

        log.info(
            "[DEMUX] CALL_ME from %s:%d -> proxy=%s app tcp %s:%d",
            src_ip,
            src_port,
            reg.proxy_id,
            app_ip,
            app_port,
        )
        try:
            reg.call_me_cb(src_ip, src_port, app_ip, app_port)
        except Exception:
            log.exception("[DEMUX] proxy callback failed for %s", reg.proxy_id)

    def _select_registration(
        self, mac_hint: bytes, registrations: list[NotifyRegistration]
    ) -> Optional[NotifyRegistration]:
        if not registrations:
            return None

        has_hint = mac_hint and any(mac_hint)
        if has_hint:
            for reg in registrations:
                if reg.call_me_hint == mac_hint:
                    return reg
            for reg in registrations:
                if reg.mac_bytes == mac_hint:
                    return reg

        if len(registrations) == 1:
            return registrations[0]

        return None

    def _extract_mac_bytes(self, mdns_txt: Dict[str, str]) -> bytes:
        try:
            mac_raw = (
                mdns_txt.get("MAC")
                or mdns_txt.get("mac")
                or mdns_txt.get("macaddress")
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

        return mac_bytes

    def _build_device_identifiers(
        self, mac_bytes: bytes, hub_version: str
    ) -> tuple[bytes, bytes]:
        """Return the device id used in NOTIFY_ME replies and the CALL_ME hint."""

        required_prefix_byte = b"\xc2"
        static_id_suffix_byte = b"\x4b" if hub_version == HUB_VERSION_X1 else b"\x45"
        unique_tail_mac = mac_bytes[0:5]

        device_id = required_prefix_byte + unique_tail_mac + static_id_suffix_byte
        call_me_hint = unique_tail_mac + static_id_suffix_byte

        return device_id, call_me_hint


_GLOBAL_DEMUXER: Optional[NotifyDemuxer] = None


def get_notify_demuxer(listen_port: Optional[int] = None) -> NotifyDemuxer:
    global _GLOBAL_DEMUXER
    if _GLOBAL_DEMUXER is None:
        _GLOBAL_DEMUXER = NotifyDemuxer(listen_port or 8102)
    elif listen_port is not None and listen_port != _GLOBAL_DEMUXER.listen_port:
        log.warning(
            "[DEMUX] existing listener on %d (ignoring requested %d)",
            _GLOBAL_DEMUXER.listen_port,
            listen_port,
        )
    return _GLOBAL_DEMUXER
