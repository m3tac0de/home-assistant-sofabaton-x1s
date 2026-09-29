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
matching bridge.
"""

from __future__ import annotations

import logging
import socket
import threading
import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Tuple

from .hub_logging import get_hub_logger

log = logging.getLogger("x1proxy.listener")

# Default TCP port for the shared hub-side listener. Matches the
# original ``hub_listen_base`` default; user-configured values still
# work — the first registration's port wins (subsequent differing
# values log a warning, mirroring NotifyDemuxer).
DEFAULT_HUB_LISTEN_PORT = 8200

# How long the shared listener stays down during a bounce. A disabled hub
# only stops retrying once its reconnects are refused at the SYN level
# (i.e. the port is closed), and it tries a handful of times over ~1s — so
# the window must comfortably outlast that. Established hub sessions are
# untouched (only the bound listening socket closes), so a longer window is
# cheap: at worst it delays a hub that happens to drop during it, and that
# hub self-heals via its own CALL_ME loop afterwards.
DEFAULT_BOUNCE_DOWNTIME_S = 2.5

# Release feedback (see HubListener.release_hub): a hub that reconnects
# after being released is refused again, up to this many extra bounces,
# for this long after the release.
DEFAULT_RELEASE_GRACE_S = 60.0
DEFAULT_RELEASE_MAX_BOUNCES = 8
# A released hub dials back on a fixed timer: live on 2026-09-09 an X1
# and an X1S both retried every 3.0 s (first attempt ~2.7 s after the
# drop), so a 2.5 s window closed and reopened between two attempts every
# time. The release window must outlast one full retry period.
DEFAULT_RELEASE_DOWNTIME_S = 4.0


OnSocketCallback = Callable[[socket.socket, Tuple[str, int]], None]


@dataclass
class _Release:
    """A hub we let go of and must keep refusing until it gives up."""

    deadline: float
    bounces_left: int
    downtime: float


@dataclass(frozen=True)
class HubRegistration:
    proxy_id: str
    real_hub_ip: str
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
        # Bounce state: while bouncing the listening socket is intentionally
        # closed and must not be reopened by a stray registration.
        self._bouncing = False
        self._bounce_cancel: Optional[threading.Event] = None
        self._bounce_thr: Optional[threading.Thread] = None
        # Hubs released via release_hub(), keyed by real IP.
        self._released: Dict[str, _Release] = {}
        self._unrecognised_logged: Dict[str, float] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def register_hub(
        self,
        *,
        proxy_id: str,
        real_hub_ip: str,
        on_socket: OnSocketCallback,
    ) -> int:
        """Register one bridge; return the listen port to advertise."""

        reg = HubRegistration(
            proxy_id=proxy_id,
            real_hub_ip=real_hub_ip,
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
            # Registering a hub again ends its release.
            self._released.pop(real_hub_ip, None)
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
            if self._bounce_cancel is not None:
                self._bounce_cancel.set()
            self._bouncing = False
            self._by_ip.clear()
            self._by_proxy.clear()
            self._stop_thread_locked()

    def release_hub(
        self,
        real_hub_ip: str,
        *,
        downtime: float = DEFAULT_RELEASE_DOWNTIME_S,
        grace: float = DEFAULT_RELEASE_GRACE_S,
        max_bounces: int = DEFAULT_RELEASE_MAX_BOUNCES,
    ) -> None:
        """Let a (just unregistered) hub go so the official app can have it.

        A timed bounce alone is a bet on the hub's retry cadence: live on
        2026-09-09 both an X1 and an X1S dialled back on a fixed 3.0 s
        timer (first attempt ~2.7 s after the drop), so a 2.5 s window
        closed and reopened between two attempts every time, the hub got
        accepted-and-dropped as unrecognised, and it never met a closed
        port. Two things fix that: the release window outlasts one retry
        period (``downtime``, 4 s by default), and the release is a
        feedback loop: the hub is remembered for ``grace`` seconds and
        every time it still shows up unrecognised the listener bounces
        again (at most ``max_bounces`` times). A closed port is the only
        signal the hub gives up on. Established sessions of other hubs are
        never touched.
        """

        with self._lock:
            self._released[real_hub_ip] = _Release(
                deadline=time.monotonic() + grace,
                bounces_left=max(0, int(max_bounces)),
                downtime=downtime,
            )
        self.bounce(downtime)

    def _note_unrecognised_locked(self, peer_ip: str) -> Optional[float]:
        """If ``peer_ip`` was released and may bounce again, consume a bounce."""

        rel = self._released.get(peer_ip)
        if rel is None:
            return None
        if time.monotonic() > rel.deadline or rel.bounces_left <= 0:
            self._released.pop(peer_ip, None)
            return None
        if self._bouncing:
            # A bounce is already in progress; this connection is a
            # backlog leftover, not evidence that the hub survived it.
            return None
        rel.bounces_left -= 1
        return rel.downtime

    def bounce(self, downtime: float = DEFAULT_BOUNCE_DOWNTIME_S) -> None:
        """Close the listening socket for ``downtime`` seconds, then reopen.

        Used when a hub is disabled in a multi-hub setup: the shared port
        stays open for the other hubs, so the disabled hub (already dropped
        and now reconnecting) never sees a refusal and loops forever. By
        briefly closing the bound socket, its reconnect attempts are refused
        at the SYN level — the only signal it gives up on — after which it
        goes idle and becomes reachable by the Sofabaton app again.

        Already-connected hubs are unaffected: only the listening socket is
        closed, not the accepted sessions, so the still-enabled hubs stay
        connected straight through the window.
        """

        with self._lock:
            if self._bouncing:
                return
            if not self._by_proxy:
                # No hubs left to come back for — the listener is already
                # (or about to be) stopped, and the closed port refuses the
                # disabled hub on its own. Nothing to bounce.
                return
            self._bouncing = True
            cancel = threading.Event()
            self._bounce_cancel = cancel
            # Stop accepting: close the socket and wind down the accept loop.
            self._stop_thread_locked()
            thr = threading.Thread(
                target=self._bounce_run,
                args=(downtime, cancel),
                name="x1proxy-hub-listen-bounce",
                daemon=True,
            )
            self._bounce_thr = thr
        thr.start()

    def _bounce_run(self, downtime: float, cancel: threading.Event) -> None:
        log.info("[LISTEN] bounce: refusing new connections for %.1fs", downtime)
        cancelled = cancel.wait(max(0.0, downtime))
        with self._lock:
            if self._bounce_cancel is cancel:
                self._bouncing = False
                self._bounce_cancel = None
                self._bounce_thr = None
            if cancelled or not self._by_proxy:
                log.info(
                    "[LISTEN] bounce: staying down (cancelled=%s, hubs=%d)",
                    cancelled,
                    len(self._by_proxy),
                )
                return
            self._ensure_running_locked()
            log.info("[LISTEN] bounce: listener back up on *:%d", self.listen_port)

    # ------------------------------------------------------------------
    # Internals
    # ------------------------------------------------------------------
    def _ensure_running_locked(self) -> None:
        if self._bouncing:
            return
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
            # A listening socket closed while another thread sits in
            # accept() stays open at the kernel level until that call
            # returns (up to its 1 s timeout), and keeps completing
            # handshakes into its backlog meanwhile: the port looks open to
            # a dialling hub although nobody will serve it. Wake the accept
            # call right now with a loopback connection so the close takes
            # effect immediately; the loop discards that connection.
            self._wake_accept()
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None
        if self._thr is not None:
            self._thr.join(timeout=1.0)
            self._thr = None

    def _wake_accept(self) -> None:
        try:
            with socket.create_connection(("127.0.0.1", self.listen_port), timeout=0.2):
                pass
        except OSError:
            pass

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
        last_error_log = 0.0
        while not self._stop_event.is_set():
            try:
                client, addr = sock.accept()
            except socket.timeout:
                continue
            except OSError as exc:
                # Only a closed socket ends the loop. A transient accept
                # error (a peer reset before accept, EMFILE) must not
                # leave the port listening with nobody serving it.
                if self._stop_event.is_set() or sock.fileno() == -1:
                    break
                now = time.monotonic()
                if now - last_error_log >= 5.0:
                    last_error_log = now
                    log.warning("[LISTEN] accept failed, still listening: %s", exc)
                time.sleep(0.1)
                continue
            peer_ip, peer_port = addr[0], addr[1]
            if self._stop_event.is_set():
                # The stop's own wake-up connection, or a handshake the
                # backlog completed after the close: nobody is served.
                try:
                    client.close()
                except Exception:
                    pass
                break

            with self._lock:
                reg = self._by_ip.get(peer_ip)

            if reg is None:
                with self._lock:
                    again = self._note_unrecognised_locked(peer_ip)
                if again is None:
                    # A hub that never gives up dials back every ~12 ms;
                    # one line per source every few seconds is plenty.
                    now = time.monotonic()
                    last = self._unrecognised_logged.get(peer_ip, 0.0)
                    if now - last >= 5.0:
                        self._unrecognised_logged[peer_ip] = now
                        log.warning(
                            "[LISTEN] dropping unrecognised hub connection from %s:%d",
                            peer_ip,
                            peer_port,
                        )
                else:
                    log.info(
                        "[LISTEN] released hub %s dialled back; refusing it again for %.1fs",
                        peer_ip,
                        again,
                    )
                try:
                    client.shutdown(socket.SHUT_RDWR)
                except Exception:
                    pass
                try:
                    client.close()
                except Exception:
                    pass
                if again is not None:
                    # Not from this thread: bounce() joins the accept loop.
                    threading.Thread(
                        target=self.bounce, args=(again,),
                        name="x1proxy-hub-listen-release", daemon=True,
                    ).start()
                    break
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


def bounce_hub_listener(downtime: float = DEFAULT_BOUNCE_DOWNTIME_S) -> None:
    """Bounce the process-wide listener if one exists (no-op otherwise).

    Called when a hub is disabled, to release it from the shared listener's
    reconnect loop. Does not create a listener: if none is running there is
    nothing to release. Blocks briefly (the accept-thread wind-down); run it
    off the event loop.
    """

    with _GLOBAL_LOCK:
        listener = _GLOBAL_LISTENER
    if listener is not None:
        listener.bounce(downtime)


def release_hub_from_listener(
    real_hub_ip: str, downtime: float = DEFAULT_RELEASE_DOWNTIME_S
) -> None:
    """Release ``real_hub_ip`` from the process-wide listener (no-op without one).

    Bounces once now and again whenever the hub dials back within the
    grace period (see :meth:`HubListener.release_hub`). Blocks briefly;
    run it off the event loop.
    """

    with _GLOBAL_LOCK:
        listener = _GLOBAL_LISTENER
    if listener is not None:
        listener.release_hub(real_hub_ip, downtime=downtime)


def reset_hub_listener_for_tests() -> None:
    """Test helper: drop the global singleton."""

    global _GLOBAL_LISTENER
    with _GLOBAL_LOCK:
        if _GLOBAL_LISTENER is not None:
            _GLOBAL_LISTENER.shutdown()
            _GLOBAL_LISTENER = None
