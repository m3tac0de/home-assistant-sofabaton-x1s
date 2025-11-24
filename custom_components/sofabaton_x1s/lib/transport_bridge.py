from __future__ import annotations

import logging
import random
import select
import socket
import struct
import threading
import time
import ipaddress
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from .protocol_const import OP_CALL_ME, SYNC0, SYNC1

log = logging.getLogger("x1proxy.transport")


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


def _pick_port_near(base: int, tries: int = 64) -> int:
    for i in range(tries):
        cand = base + i
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("0.0.0.0", cand))
            s.close()
            return cand
        except OSError:
            continue
    raise OSError("No free port near %d" % base)


def _enable_keepalive(
    sock: socket.socket, *, idle: int = 30, interval: int = 10, count: int = 3
) -> None:
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


NOTIFY_ME_PAYLOAD = bytes.fromhex("a55a00c1c0")


class TransportBridge:
    """Own TCP/UDP sockets and bridge app↔hub traffic.

    This class is deliberately transport-only: callers provide callbacks for
    diagnostics and higher-level parsing.
    """

    def __init__(
        self,
        real_hub_ip: str,
        real_hub_udp_port: int,
        proxy_udp_port: int,
        hub_listen_base: int,
        *,
        mdns_instance: str,
        mdns_txt: Dict[str, str],
        enable_broadcast_listener: bool = False,
        ka_idle: int = 30,
        ka_interval: int = 10,
        ka_count: int = 3,
    ) -> None:
        self.real_hub_ip = real_hub_ip
        self.real_hub_udp_port = int(real_hub_udp_port)
        self.proxy_udp_port = int(proxy_udp_port)
        self.hub_listen_base = int(hub_listen_base)
        self.ka_idle = int(ka_idle)
        self.ka_interval = int(ka_interval)
        self.ka_count = int(ka_count)
        self._mdns_instance = mdns_instance
        self._mdns_txt = mdns_txt
        self._broadcast_listener_enabled = bool(enable_broadcast_listener)

        self._stop = threading.Event()
        self._notify_stop = threading.Event()
        self._hub_sock: Optional[socket.socket] = None
        self._app_sock: Optional[socket.socket] = None
        self._hub_lock = threading.Lock()
        self._app_lock = threading.Lock()

        self._udp_sock: Optional[socket.socket] = None
        self._udp_thr: Optional[threading.Thread] = None
        self._notify_sock: Optional[socket.socket] = None
        self._notify_thr: Optional[threading.Thread] = None
        self._claim_thr: Optional[threading.Thread] = None
        self._bridge_thr: Optional[threading.Thread] = None
        self._last_notify_reply: Dict[Tuple[str, int], float] = {}

        self._hub_listen_port: Optional[int] = None
        self._local_to_hub = bytearray()

        # callbacks
        self._hub_frame_cbs: list[Callable[[bytes, int], None]] = []
        self._app_frame_cbs: list[Callable[[bytes, int], None]] = []
        self._hub_state_cbs: list[Callable[[bool], None]] = []
        self._client_state_cbs: list[Callable[[bool], None]] = []
        self._idle_cbs: list[Callable[[float], None]] = []

        self._chunk_id = 0
        self._proxy_enabled = True

    # ------------------------------------------------------------------
    # Callback registration
    # ------------------------------------------------------------------
    def on_hub_frame(self, cb: Callable[[bytes, int], None]) -> None:
        self._hub_frame_cbs.append(cb)

    def on_app_frame(self, cb: Callable[[bytes, int], None]) -> None:
        self._app_frame_cbs.append(cb)

    def on_hub_state(self, cb: Callable[[bool], None]) -> None:
        self._hub_state_cbs.append(cb)
        cb(self.is_hub_connected)

    def on_client_state(self, cb: Callable[[bool], None]) -> None:
        self._client_state_cbs.append(cb)
        cb(self.is_client_connected)

    def on_idle(self, cb: Callable[[float], None]) -> None:
        self._idle_cbs.append(cb)

    # ------------------------------------------------------------------
    # External control
    # ------------------------------------------------------------------
    @property
    def is_hub_connected(self) -> bool:
        with self._hub_lock:
            return self._hub_sock is not None

    @property
    def is_client_connected(self) -> bool:
        with self._app_lock:
            return self._app_sock is not None

    def enable_proxy(self) -> None:
        self._proxy_enabled = True
        log.info("[PROXY] enabled")

    def disable_proxy(self) -> None:
        self._proxy_enabled = False
        log.info("[PROXY] disabled (existing TCP sessions stay alive)")

    def can_issue_commands(self) -> bool:
        return not self.is_client_connected

    def send_local(self, payload: bytes) -> None:
        self._local_to_hub.extend(payload)

    # ------------------------------------------------------------------
    # Networking lifecycle
    # ------------------------------------------------------------------
    def start(self, *, udp_port: Optional[int] = None) -> None:
        self._stop.clear()
        self._notify_stop.clear()
        if udp_port is not None:
            self.proxy_udp_port = udp_port
        self._udp_sock = self._open_udp_listener()
        self._udp_thr = threading.Thread(
            target=self._udp_loop, name="x1proxy-udp", daemon=True
        )
        self._udp_thr.start()

        if self._broadcast_listener_enabled and self._proxy_enabled:
            self._notify_sock = self._open_notify_listener()
            if self._notify_sock is not None:
                self._notify_thr = threading.Thread(
                    target=self._notify_loop,
                    name="x1proxy-broadcast",
                    daemon=True,
                )
                self._notify_thr.start()

        self._claim_thr = threading.Thread(
            target=self._hub_guard_loop, name="x1proxy-hub-guard", daemon=True
        )
        self._claim_thr.start()

        self._bridge_thr = threading.Thread(
            target=self._bridge_forever, name="x1proxy-bridge", daemon=True
        )
        self._bridge_thr.start()

    def stop(self) -> None:
        self._stop.set()
        self._stop_notify_listener()

        if self._udp_sock is not None:
            try:
                self._udp_sock.close()
            except Exception:
                pass
            self._udp_sock = None

        with self._hub_lock:
            if self._hub_sock:
                try:
                    self._hub_sock.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    self._hub_sock.close()
                except Exception:
                    pass
                self._hub_sock = None
                self._notify_hub_state(False)

        with self._app_lock:
            if self._app_sock:
                try:
                    self._app_sock.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    self._app_sock.close()
                except Exception:
                    pass
                self._app_sock = None
                self._notify_client_state(False)

        log.info("[STOP] transport stopped")

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _open_udp_listener(self) -> socket.socket:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        base = self.proxy_udp_port
        last_err: Optional[Exception] = None

        if base == 0:
            s.bind(("0.0.0.0", 0))
            self.proxy_udp_port = s.getsockname()[1]
            log.info("[UDP] bound on *:%d (os-picked)", self.proxy_udp_port)
            return s

        for port in range(base, base + 32):
            try:
                s.bind(("0.0.0.0", port))
                self.proxy_udp_port = port
                log.info("[UDP] bound on *:%d", port)
                return s
            except OSError as e:
                last_err = e
                continue

        s.close()
        raise OSError(f"could not bind UDP near {base}: {last_err}")

    def _compute_broadcast_ip(self) -> str:
        local_ip = _route_local_ip(self.real_hub_ip)
        try:
            iface = ipaddress.ip_interface(f"{local_ip}/24")
            return str(iface.network.broadcast_address)
        except ValueError:
            return "255.255.255.255"

    def _open_notify_listener(self) -> Optional[socket.socket]:
        broadcast_ip = self._compute_broadcast_ip()
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        try:
            s.bind((broadcast_ip, self.real_hub_udp_port))
        except OSError as err:
            log.warning(
                "[UDP][BCST] failed to bind %s:%d: %s",
                broadcast_ip,
                self.real_hub_udp_port,
                err,
            )
            s.close()
            return None

        s.settimeout(1.0)
        log.info(
            "[UDP][BCST] bound on %s:%d for NOTIFY_ME",
            broadcast_ip,
            self.real_hub_udp_port,
        )
        return s

    def _udp_loop(self) -> None:
        if self._udp_sock is None:
            return
        sock = self._udp_sock
        log.info("[UDP] listening for APP CALL_ME on *:%d", self.proxy_udp_port)
        while not self._stop.is_set():
            try:
                pkt, (src_ip, src_port) = sock.recvfrom(2048)
            except OSError:
                break
            if len(pkt) < 16 or pkt[0] != SYNC0 or pkt[1] != SYNC1:
                continue
            op = (pkt[2] << 8) | pkt[3]
            if op != OP_CALL_ME:
                continue
            try:
                app_ip = socket.inet_ntoa(pkt[10:14])
                app_port = struct.unpack(">H", pkt[14:16])[0]
            except Exception:
                continue
            if not self._proxy_enabled:
                continue
            log.info(
                "[UDP] APP CALL_ME from %s:%d -> app tcp %s:%d",
                src_ip,
                src_port,
                app_ip,
                app_port,
            )
            threading.Thread(
                target=self._handle_app_session,
                args=((app_ip, app_port),),
                name="x1proxy-app-connect",
                daemon=True,
            ).start()

    def _notify_loop(self) -> None:
        sock = self._notify_sock
        if sock is None:
            return

        log.info(
            "[UDP][BCST] listening for NOTIFY_ME on %s:%d",
            sock.getsockname()[0],
            self.real_hub_udp_port,
        )

        while not self._stop.is_set() and not self._notify_stop.is_set():
            if self.is_client_connected:
                break

            try:
                pkt, (src_ip, src_port) = sock.recvfrom(2048)
            except socket.timeout:
                continue
            except OSError:
                break

            if pkt != NOTIFY_ME_PAYLOAD:
                continue

            if not self._proxy_enabled:
                continue

            now = time.monotonic()
            last = self._last_notify_reply.get((src_ip, src_port), 0.0)
            if now - last < 2.0:
                continue

            self._last_notify_reply[(src_ip, src_port)] = now
            reply = self._build_notify_reply(src_ip)
            if reply is None:
                continue

            log.info(
                "[UDP][BCST] NOTIFY_ME from %s:%d (replying)",
                src_ip,
                src_port,
            )
            try:
                sock.sendto(reply, (src_ip, src_port))
            except OSError:
                log.exception("[UDP][BCST] failed to send NOTIFY_ME reply")

    def _build_notify_reply(self, app_ip: str) -> Optional[bytes]:
        try:
            mac_raw = (
                self._mdns_txt.get("MAC")
                or self._mdns_txt.get("mac")
                or self._mdns_txt.get("macaddress")
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

        try:
            advertised_ip = _route_local_ip(app_ip)
            ip_bytes = socket.inet_aton(advertised_ip)
        except OSError:
            return None

        payload = mac_bytes + ip_bytes + struct.pack(">H", self.proxy_udp_port)
        frame = bytes([SYNC0, SYNC1, 0x00, 0xC2]) + payload
        frame += bytes([_sum8(frame)])
        log.info(
            "[UDP][BCST] reply host=%s:%d mac=%s",
            socket.inet_ntoa(ip_bytes),
            self.proxy_udp_port,
            mac_bytes.hex(":"),
        )
        return frame

    def _hub_guard_loop(self) -> None:
        while not self._stop.is_set():
            if not self.is_hub_connected:
                ok = self._claim_once()
                if not ok:
                    time.sleep(0.2)
                    continue
            else:
                time.sleep(0.3)

    def _claim_once(self) -> bool:
        self._hub_listen_port = _pick_port_near(self.hub_listen_base)
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(("0.0.0.0", self._hub_listen_port))
        srv.listen(1)
        srv.settimeout(1.0)
        log.info("[TCP] waiting <- HUB on *:%d (claim)", self._hub_listen_port)

        udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        my_ip = _route_local_ip(self.real_hub_ip)
        payload = b"\x00" * 6 + socket.inet_aton(my_ip) + struct.pack(">H", self._hub_listen_port)
        frame = bytes([SYNC0, SYNC1, (OP_CALL_ME >> 8) & 0xFF, OP_CALL_ME & 0xFF]) + payload
        frame += bytes([_sum8(frame)])

        last = 0.0
        hub_sock = None
        try:
            while hub_sock is None and not self._stop.is_set():
                now = time.time()
                if now - last >= 2.0 + random.uniform(-0.25, 0.25):
                    udp.sendto(frame, (self.real_hub_ip, self.real_hub_udp_port))
                    last = now
                try:
                    hub_sock, hub_addr = srv.accept()
                except socket.timeout:
                    continue

            if hub_sock is None:
                return False

            hub_sock.settimeout(0.0)
            _enable_keepalive(
                hub_sock, idle=self.ka_idle, interval=self.ka_interval, count=self.ka_count
            )
            with self._hub_lock:
                self._hub_sock = hub_sock
            self._notify_hub_state(True)
            log.info("[TCP] connected <- HUB %s:%d (claimed)", *hub_addr)
            return True
        finally:
            try:
                srv.close()
            except Exception:
                pass
            try:
                udp.close()
            except Exception:
                pass

    def _handle_app_session(self, app_addr: Tuple[str, int]) -> None:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5.0)
        s.connect(app_addr)
        s.settimeout(0.0)
        _enable_keepalive(s, idle=self.ka_idle, interval=self.ka_interval, count=self.ka_count)
        with self._app_lock:
            if self._app_sock is not None:
                try:
                    self._app_sock.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    self._app_sock.close()
                except Exception:
                    pass
            self._app_sock = s
        log.info("[TCP] connected -> APP %s:%d", *app_addr)
        self._notify_client_state(True)

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
                time.sleep(0.05)
                continue

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
                    self._notify_hub_state(False)
                    app_to_hub.clear()
                else:
                    self._chunk_id += 1
                    cid = self._chunk_id
                    for cb in self._hub_frame_cbs:
                        cb(data, cid)
                    if app is not None:
                        try:
                            app.sendall(data)
                        except Exception:
                            pass

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
                    self._notify_client_state(False)
                else:
                    self._chunk_id += 1
                    cid = self._chunk_id
                    for cb in self._app_frame_cbs:
                        cb(data, cid)
                    app_to_hub.extend(data)

            if hub is not None and hub in w:
                if self._local_to_hub:
                    try:
                        sent = hub.send(self._local_to_hub)
                        if sent:
                            log.info("[TCP→HUB][local] sent %dB", sent)
                            del self._local_to_hub[:sent]
                    except (BlockingIOError, InterruptedError, OSError):
                        pass
                if app_to_hub:
                    try:
                        sent = hub.send(app_to_hub)
                        if sent:
                            log.info("[TCP→HUB][client] forwarded %dB", sent)
                            del app_to_hub[:sent]
                    except (BlockingIOError, InterruptedError, OSError):
                        pass

            for cb in self._idle_cbs:
                cb(time.monotonic())

            if self._local_to_hub:
                with self._hub_lock:
                    if self._hub_sock is None:
                        self._local_to_hub.clear()

    # ------------------------------------------------------------------
    # Notifications
    # ------------------------------------------------------------------
    def _notify_hub_state(self, connected: bool) -> None:
        for cb in self._hub_state_cbs:
            try:
                cb(connected)
            except Exception:
                log.exception("hub state listener failed")

    def _notify_client_state(self, connected: bool) -> None:
        if connected:
            self._stop_notify_listener()
        for cb in self._client_state_cbs:
            try:
                cb(connected)
            except Exception:
                log.exception("client state listener failed")

    def _stop_notify_listener(self) -> None:
        self._notify_stop.set()
        if self._notify_sock is not None:
            try:
                self._notify_sock.close()
            except Exception:
                pass
            self._notify_sock = None

