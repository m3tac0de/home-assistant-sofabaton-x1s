from __future__ import annotations

import errno
import logging
import random
import select
import socket
import struct
import threading
import time
from typing import Callable, Dict, Iterable, List, Optional, Tuple

from .hub_logging import HubLogger, LogTag, get_hub_logger
from .hub_listener import get_hub_listener
from .protocol_const import OP_CALL_ME, SYNC0, SYNC1
from .notify_demuxer import (
    BROADCAST_LISTEN_PORT,
    build_connect_ready_beacon,
    get_notify_demuxer,
    _broadcast_ip,
)

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


def _disable_nagle(sock: socket.socket) -> None:
    """Disable Nagle's algorithm to avoid coalescing adjacent frames."""

    try:
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
    except Exception:
        pass


def _flush_buffer(
    sock: socket.socket,
    buf: bytearray,
    label: str,
    logger: HubLogger | logging.Logger | None = None,
) -> bool:
    """Try to write the entire buffer to the given socket."""

    logger = logger or log

    while buf:
        try:
            # Send from a snapshot copy, never the shared bytearray
            # itself: socket.send(bytearray) holds a buffer-protocol
            # export for the duration of the syscall, and a concurrent
            # send_local() extend() on another thread then dies with
            # "BufferError: Existing exports of data: object cannot be
            # re-sized" (live-hub bench, 2026-07-12). The copy is a few
            # hundred bytes at most; del buf[:sent] below interleaves
            # GIL-atomically with a concurrent extend.
            sent = sock.send(bytes(buf))
        except (BlockingIOError, InterruptedError):
            break
        except OSError as exc:
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug("%s[%s] send failed", LogTag.TRANSPORT, label, exc_info=exc)
            buf.clear()
            return True

        if not sent:
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug("%s[%s] socket closed during send", LogTag.TRANSPORT, label)
            buf.clear()
            return True

        del buf[:sent]

    return False


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
        proxy_id: str,
        mdns_instance: str,
        mdns_txt: Dict[str, str],
        ka_idle: int = 30,
        ka_interval: int = 10,
        ka_count: int = 3,
    ) -> None:
        self.real_hub_ip = real_hub_ip
        self.real_hub_udp_port = int(real_hub_udp_port)
        self.proxy_udp_port = int(proxy_udp_port)
        self.hub_listen_base = int(hub_listen_base)
        self.proxy_id = proxy_id
        self._log = get_hub_logger(log, self.proxy_id)
        self.ka_idle = int(ka_idle)
        self.ka_interval = int(ka_interval)
        self.ka_count = int(ka_count)
        self._mdns_instance = mdns_instance
        self._mdns_txt = mdns_txt

        self._stop = threading.Event()
        self._hub_sock: Optional[socket.socket] = None
        self._app_sock: Optional[socket.socket] = None
        self._hub_lock = threading.Lock()
        self._app_lock = threading.Lock()
        self._wake_lock = threading.Lock()

        self._call_me_thr: Optional[threading.Thread] = None
        self._bridge_thr: Optional[threading.Thread] = None
        self._notify_registered = False
        self._listener_registered = False
        self._discovery_enabled = False

        self._local_to_hub = bytearray()
        self._wake_reader: Optional[socket.socket] = None
        self._wake_writer: Optional[socket.socket] = None

        # callbacks
        self._hub_frame_cbs: list[Callable[[bytes, int], None]] = []
        self._app_frame_cbs: list[Callable[[bytes, int], None]] = []
        self._hub_state_cbs: list[Callable[[bool], None]] = []
        self._client_state_cbs: list[Callable[[bool], None]] = []
        self._idle_cbs: list[Callable[[float], None]] = []

        self._inter_command_gap = 0.2

        self._chunk_id = 0
        self._proxy_enabled = True
        self._busy_gate: Optional[Callable[[], bool]] = None
        # When set in the future, suppress CALL_ME pings and refuse hub-
        # initiated reconnects until the deadline passes. Used to honour
        # the hub's OTA-update push (opcode 0x0167): stay disconnected
        # for several minutes while the firmware update runs.
        self._ota_pause_until: float = 0.0

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

    def pause_for_ota(self, seconds: float) -> None:
        """Drop the hub session and refuse reconnects for ``seconds`` seconds.

        Invoked when the hub announces a firmware OTA update. The hub may
        still dial us back during this window; we silently drop those
        connections and stop sending CALL_ME pings until the pause
        expires.
        """

        deadline = time.time() + max(0.0, float(seconds))
        if deadline > self._ota_pause_until:
            self._ota_pause_until = deadline
            self._log.warning(
                "%s OTA pause armed for %.0fs (until %.0f)",
                LogTag.TRANSPORT,
                seconds,
                deadline,
            )
        existing: Optional[socket.socket] = None
        with self._hub_lock:
            existing = self._hub_sock
            self._hub_sock = None
        if existing is not None:
            try:
                existing.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                existing.close()
            except Exception:
                pass
            self._notify_hub_state(False)
            self._signal_wake()

    def _ota_pause_active(self) -> bool:
        return self._ota_pause_until > time.time()

    def enable_proxy(self) -> None:
        self._proxy_enabled = True
        self._log.info("%s enabled", LogTag.PROXY)
        if self._discovery_enabled and not self._notify_registered and not self.is_client_connected:
            self._register_demuxer()

    def disable_proxy(self) -> None:
        self._proxy_enabled = False
        self._log.info("%s disabled (existing TCP sessions stay alive)", LogTag.PROXY)
        self._stop_notify_listener()

    def can_issue_commands(self) -> bool:
        # Two preconditions: the hub must be TCP-connected (otherwise
        # frames go into _local_to_hub and are silently discarded by the
        # bridge loop when it notices there's no hub socket), and the
        # real Sofabaton app must NOT be attached to the proxy (when it
        # is, the app owns the session and the proxy must not race it).
        return self.is_hub_connected and not self.is_client_connected

    def send_local(self, payload: bytes) -> None:
        self._local_to_hub.extend(payload)
        self._signal_wake()

    # ------------------------------------------------------------------
    # Networking lifecycle
    # ------------------------------------------------------------------
    def start(self, *, udp_port: Optional[int] = None) -> None:
        self._stop.clear()
        self._init_wake_channel()
        if udp_port is not None:
            self.proxy_udp_port = udp_port
        demuxer = get_notify_demuxer(self.proxy_udp_port)
        self.proxy_udp_port = demuxer.listen_port

        # Hand the inbound TCP socket off to the shared listener; it
        # dispatches by peer IP and calls _install_hub_socket on accept.
        listener = get_hub_listener(self.hub_listen_base)
        self.hub_listen_base = listener.register_hub(
            proxy_id=self.proxy_id,
            real_hub_ip=self.real_hub_ip,
            on_socket=self._install_hub_socket,
        )
        self._listener_registered = True

        self._call_me_thr = threading.Thread(
            target=self._call_me_loop, name="x1proxy-call-me", daemon=True
        )
        self._call_me_thr.start()

        self._bridge_thr = threading.Thread(
            target=self._bridge_forever, name="x1proxy-bridge", daemon=True
        )
        self._bridge_thr.start()

    def stop(self) -> None:
        self._stop.set()
        self._signal_wake()
        self._stop_notify_listener()
        if self._listener_registered:
            try:
                get_hub_listener().unregister_hub(self.proxy_id)
            except Exception:
                self._log.exception("%s hub listener unregister failed", LogTag.TRANSPORT)
            self._listener_registered = False

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

        self._close_wake_channel()
        self._log.info("%s stopped", LogTag.TRANSPORT)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _register_demuxer(self) -> None:
        if self._notify_registered:
            return
        get_notify_demuxer(self.proxy_udp_port).register_proxy(
            proxy_id=self.proxy_id,
            real_hub_ip=self.real_hub_ip,
            mdns_txt=self._mdns_txt,
            call_me_port=self.proxy_udp_port,
            call_me_cb=self._handle_call_me,
        )
        self._notify_registered = True

    def update_discovery_metadata(
        self,
        *,
        mdns_txt: Dict[str, str],
    ) -> None:
        self._mdns_txt = mdns_txt

    def start_notify_listener(self) -> None:
        self._discovery_enabled = True
        if self._proxy_enabled and not self.is_client_connected:
            self._register_demuxer()

    def stop_notify_listener(self) -> None:
        self._discovery_enabled = False
        self._stop_notify_listener()

    def set_busy_gate(self, gate: Optional[Callable[[], bool]]) -> None:
        """Register a callable that suppresses CALL_ME handling when truthy.

        Used to ignore proxy-client CALL_ME pings while the hub is occupied
        with a long-running task (backup, restore, command-config sync) so
        the in-flight TCP session is not interrupted.
        """

        self._busy_gate = gate

    def _handle_call_me(
        self, src_ip: str, src_port: int, app_ip: str, app_port: int
    ) -> None:
        if not self._proxy_enabled or self._stop.is_set():
            return

        gate = self._busy_gate
        if gate is not None:
            try:
                busy = bool(gate())
            except Exception:
                self._log.exception("%s busy gate raised", LogTag.TRANSPORT)
                busy = False
            if busy:
                self._log.info(
                    "%s APP CALL_ME from %s:%d ignored (hub busy with long-running task)",
                    LogTag.TRANSPORT,
                    src_ip,
                    src_port,
                )
                return

        self._log.info(
            "%s APP CALL_ME from %s:%d -> app tcp %s:%d",
            LogTag.TRANSPORT,
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

    def _call_me_loop(self) -> None:
        """Send periodic UDP CALL_ME pings while the hub is not connected.

        The hub responds by dialling back to the shared TCP listener
        (see ``hub_listener.py``), which hands the accepted socket to
        :meth:`_install_hub_socket`. This loop owns only the UDP side;
        TCP accept lives in the shared :class:`HubListener`.
        """

        udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            last = 0.0
            while not self._stop.is_set():
                if self.is_hub_connected:
                    time.sleep(0.3)
                    continue
                if self._ota_pause_active():
                    time.sleep(0.5)
                    continue
                now = time.time()
                if now - last >= 2.0 + random.uniform(-0.25, 0.25):
                    try:
                        my_ip = _route_local_ip(self.real_hub_ip)
                        payload = (
                            b"\x00" * 6
                            + socket.inet_aton(my_ip)
                            + struct.pack(">H", self.hub_listen_base)
                        )
                        frame = (
                            bytes([SYNC0, SYNC1, (OP_CALL_ME >> 8) & 0xFF, OP_CALL_ME & 0xFF])
                            + payload
                        )
                        frame += bytes([_sum8(frame)])
                        udp.sendto(frame, (self.real_hub_ip, self.real_hub_udp_port))
                    except OSError:
                        self._log.debug("%s CALL_ME send failed", LogTag.TRANSPORT, exc_info=True)
                    last = now
                time.sleep(0.2)
        finally:
            try:
                udp.close()
            except Exception:
                pass

    def _install_hub_socket(
        self, hub_sock: socket.socket, hub_addr: Tuple[str, int]
    ) -> None:
        """Callback invoked by :class:`HubListener` when the hub TCP-connects."""

        if self._ota_pause_active():
            self._log.info(
                "%s rejecting hub TCP from %s:%d during OTA pause (%.0fs left)",
                LogTag.TRANSPORT,
                hub_addr[0],
                hub_addr[1],
                self._ota_pause_until - time.time(),
            )
            try:
                hub_sock.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                hub_sock.close()
            except Exception:
                pass
            return

        try:
            hub_sock.settimeout(0.0)
            _disable_nagle(hub_sock)
            _enable_keepalive(
                hub_sock,
                idle=self.ka_idle,
                interval=self.ka_interval,
                count=self.ka_count,
            )
        except Exception:
            self._log.exception("%s failed to configure hub socket", LogTag.TRANSPORT)
            try:
                hub_sock.close()
            except Exception:
                pass
            return

        existing: Optional[socket.socket] = None
        with self._hub_lock:
            existing = self._hub_sock
            self._hub_sock = hub_sock
        if existing is not None:
            self._log.warning(
                "%s replacing existing hub socket on new connection from %s:%d",
                LogTag.TRANSPORT,
                *hub_addr,
            )
            try:
                existing.shutdown(socket.SHUT_RDWR)
            except Exception:
                pass
            try:
                existing.close()
            except Exception:
                pass

        self._notify_hub_state(True)
        self._signal_wake()
        self._log.info("%s connected <- HUB %s:%d (shared listener)", LogTag.TRANSPORT, *hub_addr)

    def _handle_app_session(self, app_addr: Tuple[str, int]) -> None:
        self._stop_notify_listener()
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.settimeout(5.0)
            s.connect(app_addr)
            s.settimeout(0.0)
            _disable_nagle(s)
            _enable_keepalive(
                s, idle=self.ka_idle, interval=self.ka_interval, count=self.ka_count
            )
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
            self._log.info("%s connected -> APP %s:%d", LogTag.TRANSPORT, *app_addr)
            self._notify_client_state(True)
            self._emit_connect_ready_beacon(app_addr[0])
        except Exception:
            try:
                s.close()
            except Exception:
                pass
            if self._proxy_enabled:
                self._register_demuxer()
            self._log.exception("%s failed to connect -> APP %s:%d", LogTag.TRANSPORT, *app_addr)
            return

    def _emit_connect_ready_beacon(self, app_ip: str) -> None:
        return

    def _bridge_forever(self) -> None:
        app_to_hub = bytearray()
        hub_to_app = bytearray()
        app_partial_frame = bytearray()

        while not self._stop.is_set():
            with self._hub_lock:
                hub = self._hub_sock
            with self._app_lock:
                app = self._app_sock
            with self._wake_lock:
                wake_reader = self._wake_reader

            rlist: List[socket.socket] = []
            if hub is not None:
                rlist.append(hub)
            if app is not None:
                rlist.append(app)
            if wake_reader is not None:
                rlist.append(wake_reader)

            wlist: List[socket.socket] = []
            if hub is not None and (app_to_hub or self._local_to_hub):
                wlist.append(hub)
            if app is not None and hub_to_app:
                wlist.append(app)

            if not rlist and not wlist:
                time.sleep(0.05)
                continue

            try:
                r, w, _ = select.select(rlist, wlist, [], 0.5)
            except (OSError, ValueError):
                time.sleep(0.05)
                continue

            if wake_reader is not None and wake_reader in r:
                self._drain_wake_socket(wake_reader)

            if hub is not None and hub in r:
                try:
                    data = hub.recv(65536)
                except BlockingIOError:
                    data = None
                except OSError as exc:
                    if exc.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
                        data = None
                    else:
                        self._log.debug("%s hub recv failed", LogTag.TRANSPORT, exc_info=exc)
                        data = b""
                if data is None:
                    pass
                elif not data:
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
                        hub_to_app.extend(data)

            if app is not None and app in r:
                try:
                    data = app.recv(65536)
                except BlockingIOError:
                    data = None
                except OSError as exc:
                    if exc.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
                        data = None
                    else:
                        self._log.debug("%s app recv failed", LogTag.TRANSPORT, exc_info=exc)
                        data = b""
                if data is None:
                    pass
                elif not data:
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
                    app_partial_frame.clear()
                    hub_to_app.clear()
                    self._notify_client_state(False)
                else:
                    self._chunk_id += 1
                    cid = self._chunk_id
                    for cb in self._app_frame_cbs:
                        cb(data, cid)
                    # Split the app-side stream into whole frames using
                    # the opcode-hi length invariant (frame_len = 5 +
                    # buf[2]). See docs/protocol/frame-format.md.
                    buffer = bytearray(app_partial_frame)
                    buffer.extend(data)
                    app_partial_frame.clear()

                    frames_to_send: list[bytes] = []
                    while True:
                        if len(buffer) < 2:
                            break
                        if buffer[0] != SYNC0 or buffer[1] != SYNC1:
                            idx = buffer.find(bytes([SYNC0, SYNC1]))
                            if idx < 0:
                                # Keep a trailing lone SYNC0 across reads.
                                if buffer and buffer[-1] == SYNC0:
                                    del buffer[:-1]
                                else:
                                    buffer.clear()
                                break
                            if idx and self._log.isEnabledFor(logging.DEBUG):
                                self._log.debug(
                                    "%s drop %dB junk before sync (client→hub)",
                                    LogTag.PARSE,
                                    idx,
                                )
                            del buffer[:idx]
                        if len(buffer) < 5:
                            break
                        frame_len = 5 + buffer[2]
                        if len(buffer) < frame_len:
                            break
                        cand = bytes(buffer[:frame_len])
                        if cand[-1] == (_sum8(cand[:-1]) & 0xFF):
                            frames_to_send.append(cand)
                            del buffer[:frame_len]
                            continue
                        # Bad checksum at this sync — drop one byte and
                        # rescan for the next sync pair.
                        if self._log.isEnabledFor(logging.DEBUG):
                            self._log.debug(
                                "%s drop malformed frame len=%d (client→hub)",
                                LogTag.PARSE,
                                frame_len,
                            )
                        del buffer[0]

                    app_partial_frame.extend(buffer)

                    for idx, frame in enumerate(frames_to_send):
                        app_to_hub.extend(frame)
                        if hub is not None:
                            if _flush_buffer(hub, app_to_hub, "client", self._log):
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
                                break
                            if (
                                self._inter_command_gap > 0
                                and idx + 1 < len(frames_to_send)
                            ):
                                time.sleep(self._inter_command_gap)

            if hub is not None and hub in w:
                if self._local_to_hub:
                    if _flush_buffer(hub, self._local_to_hub, "local", self._log):
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
                        continue
                if app_to_hub:
                    if _flush_buffer(hub, app_to_hub, "client", self._log):
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

            if app is not None and app in w:
                if hub_to_app:
                    if _flush_buffer(app, hub_to_app, "hub", self._log):
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
                        hub_to_app.clear()
                        app_partial_frame.clear()
                        self._notify_client_state(False)

            for cb in self._idle_cbs:
                cb(time.monotonic())

            if self._local_to_hub:
                with self._hub_lock:
                    if self._hub_sock is None:
                        self._local_to_hub.clear()

        self._close_wake_channel()

    def _init_wake_channel(self) -> None:
        self._close_wake_channel()
        wake_reader, wake_writer = socket.socketpair()
        wake_reader.setblocking(False)
        wake_writer.setblocking(False)
        with self._wake_lock:
            self._wake_reader = wake_reader
            self._wake_writer = wake_writer

    def _signal_wake(self) -> None:
        with self._wake_lock:
            wake_writer = self._wake_writer
        if wake_writer is None:
            return
        try:
            wake_writer.send(b"\x00")
        except (BlockingIOError, InterruptedError):
            pass
        except OSError:
            pass

    def _drain_wake_socket(self, wake_reader: socket.socket) -> None:
        while True:
            try:
                chunk = wake_reader.recv(1024)
            except (BlockingIOError, InterruptedError):
                return
            except OSError:
                return
            if not chunk:
                return

    def _close_wake_channel(self) -> None:
        with self._wake_lock:
            wake_reader = self._wake_reader
            wake_writer = self._wake_writer
            self._wake_reader = None
            self._wake_writer = None

        for sock in (wake_reader, wake_writer):
            if sock is None:
                continue
            try:
                sock.close()
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Notifications
    # ------------------------------------------------------------------
    def _notify_hub_state(self, connected: bool) -> None:
        for cb in self._hub_state_cbs:
            try:
                cb(connected)
            except Exception:
                self._log.exception("hub state listener failed")

    def _notify_client_state(self, connected: bool) -> None:
        if connected:
            self._stop_notify_listener()
        elif self._proxy_enabled and self._discovery_enabled:
            self._register_demuxer()
        for cb in self._client_state_cbs:
            try:
                cb(connected)
            except Exception:
                self._log.exception("client state listener failed")

    def _stop_notify_listener(self) -> None:
        if self._notify_registered:
            get_notify_demuxer().unregister_proxy(self.proxy_id)
            self._notify_registered = False


