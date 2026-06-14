from __future__ import annotations

import logging
import ipaddress
import socket
import struct
import threading
import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional

from .hub_versions import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2, classify_hub_version
from .hub_logging import get_hub_logger
from .protocol_const import OP_CALL_ME, SYNC0, SYNC1

log = logging.getLogger("x1proxy.notify")

NOTIFY_ME_PAYLOAD = bytes.fromhex("a55a00c1c0")
BROADCAST_LISTEN_PORT = 8100
_NOTIFY_BATCH_BYTES: dict[str, bytes] = {
    HUB_VERSION_X1: bytes.fromhex("20210609"),
    HUB_VERSION_X1S: bytes.fromhex("20221120"),
    HUB_VERSION_X2: bytes.fromhex("20221120"),
}
_NOTIFY_FW_DEFAULTS: dict[str, int] = {
    HUB_VERSION_X1: 17,
    HUB_VERSION_X1S: 5,
    HUB_VERSION_X2: 8,
}
_NOTIFY_MODEL_BYTES: dict[str, int] = {
    HUB_VERSION_X1: 0x01,
    HUB_VERSION_X1S: 0x02,
    HUB_VERSION_X2: 0x03,
}


def _sum8(payload: bytes) -> int:
    return sum(payload) & 0xFF


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


def _classify_or_x1(mdns_txt: Dict[str, str]) -> str:
    """Classify ``mdns_txt`` for transport-layer NOTIFY routing.

    NOTIFY framing only branches on the X1 vs X1S/X2 vs X2 envelope
    shape; an unrecognised advertisement does not justify dropping the
    listener registration, so this helper falls back to the X1 line
    when classification fails. The shape is byte-compatible across the
    rest of the family and the subsequent connect banner re-classifies
    authoritatively.
    """

    try:
        return classify_hub_version(mdns_txt)
    except ValueError:
        return HUB_VERSION_X1


def build_connect_ready_beacon(mdns_txt: Dict[str, str]) -> bytes:
    """Build the UDP post-connect readiness beacon emitted by physical hubs."""

    mac_bytes = NotifyDemuxer._extract_mac_bytes(mdns_txt)
    hub_version = _classify_or_x1(mdns_txt)
    _device_id, call_me_hint = NotifyDemuxer._build_device_identifiers(mac_bytes, hub_version)
    frame = bytes([SYNC0, SYNC1, 0x07, 0xC4]) + call_me_hint + b"\x00"
    return frame + bytes([_sum8(frame)])


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
        hub_version = _classify_or_x1(mdns_txt)
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
            get_hub_logger(log, proxy_id).info(
                "[DEMUX] registered proxy for hub %s (CALL_ME -> %s:%d)",
                real_hub_ip,
                _route_local_ip(real_hub_ip),
                reg.call_me_port,
            )
            self._ensure_running_locked()

    def unregister_proxy(self, proxy_id: str) -> None:
        with self._lock:
            if proxy_id in self._registrations:
                self._registrations.pop(proxy_id, None)
                get_hub_logger(log, proxy_id).info("[DEMUX] unregistered proxy")
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
        # Physical hubs use a variable-length UTF-8 name field. The byte after the
        # sync header is a length covering the 6-byte device-id tail, 9-byte version
        # block, and UTF-8 name bytes; it does not count the fixed leading 0xC2.
        name_bytes = name[:30]
        version_block = self._build_notify_version_block(reg)
        payload_len = (len(reg.device_id) - 1) + len(version_block) + len(name_bytes)
        frame = (
            bytes([SYNC0, SYNC1, payload_len & 0xFF])
            + reg.device_id
            + version_block
            + name_bytes
        )
        frame += bytes([_sum8(frame)])

        get_hub_logger(log, reg.proxy_id).info(
            "[DEMUX][REPLY] mac=%s name=%s",
            reg.mac_bytes.hex(":"),
            name.decode("utf-8", "ignore"),
        )
        return frame

    def _build_notify_version_block(self, reg: NotifyRegistration) -> bytes:
        hub_version = reg.hub_version
        model_byte = _NOTIFY_MODEL_BYTES.get(
            hub_version, _NOTIFY_MODEL_BYTES[HUB_VERSION_X1]
        )
        batch_bytes = _NOTIFY_BATCH_BYTES.get(
            hub_version, _NOTIFY_BATCH_BYTES[HUB_VERSION_X1]
        )
        firmware_version = self._extract_firmware_version(reg.mdns_txt, hub_version)
        tail_flags = (
            b"\x00\x00" if hub_version == HUB_VERSION_X1 else b"\x01\x00"
        )
        return (
            bytes([0x64, model_byte])
            + batch_bytes
            + bytes([firmware_version])
            + tail_flags
        )

    def _extract_firmware_version(self, mdns_txt: Dict[str, str], hub_version: str) -> int:
        raw = mdns_txt.get("AVER")
        try:
            if raw is not None:
                value = int(str(raw).strip(), 10)
                if 0 <= value <= 0xFF:
                    return value
        except (TypeError, ValueError):
            pass
        return _NOTIFY_FW_DEFAULTS.get(hub_version, _NOTIFY_FW_DEFAULTS[HUB_VERSION_X1])

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
            get_hub_logger(log, reg.proxy_id).info(
                "[DEMUX] NOTIFY_ME from %s:%d -> CALL_ME=%d broadcast=%s",
                src_ip,
                src_port,
                reg.call_me_port,
                dest_ip,
            )
            try:
                sock.sendto(reply, (dest_ip, BROADCAST_LISTEN_PORT))
            except OSError:
                get_hub_logger(log, reg.proxy_id).exception("[DEMUX] failed to send NOTIFY_ME reply")

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

        get_hub_logger(log, reg.proxy_id).info(
            "[DEMUX] CALL_ME from %s:%d -> app tcp %s:%d",
            src_ip,
            src_port,
            app_ip,
            app_port,
        )
        try:
            reg.call_me_cb(src_ip, src_port, app_ip, app_port)
        except Exception:
            get_hub_logger(log, reg.proxy_id).exception("[DEMUX] proxy callback failed")

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

    @staticmethod
    def _extract_mac_bytes(mdns_txt: Dict[str, str]) -> bytes:
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

    @staticmethod
    def _build_device_identifiers(mac_bytes: bytes, hub_version: str) -> tuple[bytes, bytes]:
        """Return the device id used in NOTIFY_ME replies and the CALL_ME hint."""

        required_prefix_byte = b"\xc2"
        if hub_version == HUB_VERSION_X2:
            device_id = required_prefix_byte + mac_bytes
            call_me_hint = mac_bytes
            return device_id, call_me_hint

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
