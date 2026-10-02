"""Built-in TLS that survives certificate renewals (updater plan, section 12).

An https dashboard can only embed an https web remote, and a container
without a reverse proxy gets https from ``--tls-cert`` / ``--tls-key``.
The catch with a mounted certificate is renewal: uvicorn reads the files
once, so every renewal used to need a restart. Here the server owns the
``ssl.SSLContext`` uvicorn serves with (its ``ssl_context_factory``) and
polls the two files. When either changes, the pair is proven in a scratch
context and then loaded into the live one, so new connections present
the renewed certificate and nothing restarts. A change that cannot be
loaded (files half written by the renewal tool, a key that does not
match) never touches the live context: the running chain stays and the
poll tries again. The first load must succeed: a server that cannot
read its certificate does not start.

The poll runs on the event loop, like every other periodic task here,
so a reload never races a handshake: asyncio wraps each accepted socket
with the context on that same thread.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import ssl
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Optional

log = logging.getLogger(__name__)

POLL_INTERVAL = 60.0

# (mtime_ns, size) of a file: what a renewal changes.
_Stamp = tuple[int, int]


def _stamp(path: Path) -> _Stamp:
    st = os.stat(path)
    return (st.st_mtime_ns, st.st_size)


def file_digest(path: Path) -> str:
    """SHA-256 of the file as served; what tests and logs compare."""

    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _describe(err: BaseException) -> str:
    text = str(err).strip()
    return f"{type(err).__name__}: {text}" if text else type(err).__name__


class CertificateReloader:
    """Owns the server's TLS context and reloads it when the files change."""

    def __init__(self, cert_path: Path, key_path: Path, *, poll_interval: float = POLL_INTERVAL,
                 now: Optional[Callable[[], datetime]] = None) -> None:
        self.cert_path = Path(cert_path)
        self.key_path = Path(key_path)
        self._poll_interval = poll_interval
        self._now = now or (lambda: datetime.now(timezone.utc))
        self.context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self.context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.fingerprint: str = ""
        self.loaded_at: Optional[datetime] = None
        self.reloads = 0
        self.last_error: Optional[str] = None
        self._stamps: Optional[tuple[_Stamp, _Stamp]] = None
        # The last pair that loaded, as bytes: the fallback for a load
        # that fails after its probe passed (the files moved under it).
        self._good: Optional[tuple[bytes, bytes]] = None
        self._task: Optional[asyncio.Task[None]] = None
        self._last_logged_error: Optional[str] = None
        # The first load raises: the operator asked for TLS and does not have it.
        self._load()
        log.info("tls: serving with certificate %s (key %s); renewed files are picked up within %.0f s",
                 self.cert_path, self.key_path, self._poll_interval)

    # -- loading ---------------------------------------------------------------------

    def _load(self) -> None:
        stamps = (_stamp(self.cert_path), _stamp(self.key_path))
        # A failed load_cert_chain is not atomic: OpenSSL keeps the new
        # certificate when the key then fails to match, and the context
        # stops handshaking. So the pair is proven in a scratch context
        # first; the live context only sees pairs that load.
        probe = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        probe.load_cert_chain(certfile=str(self.cert_path), keyfile=str(self.key_path))
        good = (self.cert_path.read_bytes(), self.key_path.read_bytes())
        try:
            self.context.load_cert_chain(certfile=str(self.cert_path), keyfile=str(self.key_path))
        except (OSError, ssl.SSLError, ValueError):
            # The files changed between the probe and the load: put the
            # last proven pair back so the context keeps handshaking.
            if self._good is not None:
                self._restore(self._good)
            raise
        self._good = good
        self._stamps = stamps
        self.fingerprint = file_digest(self.cert_path)
        self.loaded_at = self._now()
        self.last_error = None
        self._last_logged_error = None

    def _restore(self, pair: tuple[bytes, bytes]) -> None:
        with tempfile.TemporaryDirectory(prefix="sofabaton-tls-") as tmp:
            cert, key = Path(tmp) / "cert.pem", Path(tmp) / "key.pem"
            cert.write_bytes(pair[0])
            key.write_bytes(pair[1])
            self.context.load_cert_chain(certfile=str(cert), keyfile=str(key))

    def check(self) -> bool:
        """One poll: reload when either file changed. True when the chain was
        reloaded; False when nothing changed or the change could not be
        loaded (``last_error`` says why, the running chain stays)."""

        try:
            stamps = (_stamp(self.cert_path), _stamp(self.key_path))
        except OSError as err:
            self._note_error(f"cannot read the certificate files: {_describe(err)}")
            return False
        if stamps == self._stamps:
            return False
        try:
            self._load()
        except (OSError, ssl.SSLError, ValueError) as err:
            # Half-written files or a mismatched pair: keep serving, try again next poll.
            self._note_error(f"renewed certificate not loaded, keeping the running one: {_describe(err)}")
            return False
        self.reloads += 1
        log.info("tls: certificate reloaded from %s (reload %d)", self.cert_path, self.reloads)
        return True

    def _note_error(self, message: str) -> None:
        self.last_error = message
        if message != self._last_logged_error:
            log.warning("tls: %s", message)
            self._last_logged_error = message
        else:
            log.debug("tls: %s (still)", message)

    # -- uvicorn -----------------------------------------------------------------------

    def ssl_context_factory(self, _config: Any, _default_factory: Callable[[], ssl.SSLContext]) -> ssl.SSLContext:
        """What uvicorn calls for its context: ours, so later reloads reach it."""

        return self.context

    # -- lifecycle -----------------------------------------------------------------------

    @property
    def running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if self.running:
            return
        self._task = asyncio.get_running_loop().create_task(self._poll(), name="tls-reload")

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    async def _poll(self) -> None:
        while True:
            await asyncio.sleep(self._poll_interval)
            try:
                self.check()
            except Exception:  # noqa: BLE001 (a poll must never end the loop)
                log.exception("tls: certificate poll failed")

    def status(self) -> dict[str, Any]:
        return {
            "certificate": str(self.cert_path),
            "key": str(self.key_path),
            "fingerprint": self.fingerprint,
            "loaded_at": self.loaded_at.isoformat() if self.loaded_at else None,
            "reloads": self.reloads,
            "last_error": self.last_error,
        }
