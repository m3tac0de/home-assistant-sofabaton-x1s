"""The hub listener's accept loop and the demuxer's receive loop survive a
transient socket error; only a closed socket (or stop) ends them."""

from __future__ import annotations

import errno
import socket

from custom_components.sofabaton_x1s.lib.hub_listener import HubListener
from custom_components.sofabaton_x1s.lib.notify_demuxer import NotifyDemuxer


class _ScriptedSocket:
    """Raises the scripted errors in turn, then asks its owner to stop."""

    def __init__(self, owner, errors, *, closed_after: int | None = None) -> None:
        self._owner = owner
        self._errors = list(errors)
        self._closed_after = closed_after
        self.calls = 0

    def fileno(self) -> int:
        if self._closed_after is not None and self.calls >= self._closed_after:
            return -1
        return 3

    def _next(self):
        self.calls += 1
        if self._errors:
            raise self._errors.pop(0)
        self._owner._stop_event.set()
        raise socket.timeout()

    accept = _next

    def recvfrom(self, _size):
        return self._next()


def _transient():
    return [
        ConnectionAbortedError(errno.ECONNABORTED, "aborted"),
        OSError(errno.EMFILE, "too many open files"),
    ]


def test_accept_loop_keeps_serving_after_a_transient_error() -> None:
    listener = HubListener(listen_port=0)
    listener._sock = _ScriptedSocket(listener, _transient())

    listener._accept_loop()

    assert listener._sock.calls == 3  # both errors survived, then stop


def test_accept_loop_ends_when_its_socket_is_closed() -> None:
    listener = HubListener(listen_port=0)
    listener._sock = _ScriptedSocket(
        listener, [OSError(errno.EBADF, "bad fd")] * 3, closed_after=1
    )

    listener._accept_loop()

    assert listener._sock.calls == 1


def test_demuxer_loop_keeps_listening_after_a_transient_error() -> None:
    demux = NotifyDemuxer(listen_port=0)
    demux._sock = _ScriptedSocket(demux, _transient())

    demux._notify_loop()

    assert demux._sock.calls == 3
