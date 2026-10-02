"""Built-in TLS: the certificate reloader (``tls.py``), its wiring into the
CLI's uvicorn arguments and the app's lifespan.

The fixtures under ``fixtures/tls`` are two throwaway self-signed pairs
(``a`` and ``b``, CN "sofabaton-x-server test a/b", valid for a century)
made with openssl for these tests only.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import shutil
import socket
import ssl
import threading
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from sofabaton_server.app import create_app
from sofabaton_server.cli import tls_kwargs
from sofabaton_server.config import Settings
from sofabaton_server.manager import HubManager
from sofabaton_server.tls import CertificateReloader, file_digest

from fakes import Factory, no_network_discovery

FIXTURES = Path(__file__).parent / "fixtures" / "tls"


def _install(tmp_path: Path, pair: str, *, cert_from: str | None = None) -> tuple[Path, Path]:
    """Copy fixture pair ``pair`` to ``tmp_path`` as cert.pem / key.pem, with a
    later mtime than whatever was there (a renewal is a change in time)."""

    cert, key = tmp_path / "cert.pem", tmp_path / "key.pem"
    shutil.copyfile(FIXTURES / f"{cert_from or pair}.crt", cert)
    shutil.copyfile(FIXTURES / f"{pair}.key", key)
    later = time.time() + 5 + _install.bumps
    _install.bumps += 5  # type: ignore[attr-defined]
    for path in (cert, key):
        os.utime(path, (later, later))
    return cert, key


_install.bumps = 0  # type: ignore[attr-defined]


def _der(path: Path) -> bytes:
    return ssl.PEM_cert_to_DER_cert(path.read_text(encoding="utf-8"))


def _served_certificate(context: ssl.SSLContext) -> bytes:
    """One TLS handshake against ``context`` on a loopback socket: the DER
    certificate the server presented."""

    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    port = listener.getsockname()[1]
    failure: list[BaseException] = []

    def serve() -> None:
        try:
            conn, _ = listener.accept()
            tls = context.wrap_socket(conn, server_side=True)   # the handshake is the test
        except BaseException as err:  # noqa: BLE001
            failure.append(err)
            return
        try:
            tls.sendall(b"ok")                                   # tells the client the server-side handshake finished
        except OSError:
            pass
        finally:
            tls.close()

    thread = threading.Thread(target=serve, daemon=True)
    thread.start()
    client = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    client.check_hostname = False
    client.verify_mode = ssl.CERT_NONE
    with socket.create_connection(("127.0.0.1", port), timeout=5) as raw:
        with client.wrap_socket(raw, server_hostname="localhost") as tls:
            presented = tls.getpeercert(binary_form=True)
            # TLS 1.3 lets the client finish first; wait for the server before closing,
            # or Windows aborts the server's half-done handshake.
            assert tls.recv(2) == b"ok"
    thread.join(5)
    listener.close()
    assert not failure, failure
    assert presented is not None
    return presented


def test_first_load_then_a_renewal_is_served(tmp_path: Path) -> None:
    cert, key = _install(tmp_path, "a")
    reloader = CertificateReloader(cert, key, poll_interval=0.01)
    assert reloader.fingerprint == file_digest(FIXTURES / "a.crt")
    assert reloader.reloads == 0 and reloader.last_error is None
    assert reloader.check() is False                   # nothing changed
    assert _served_certificate(reloader.context) == _der(FIXTURES / "a.crt")

    _install(tmp_path, "b")                            # the renewal tool wrote new files
    assert reloader.check() is True
    assert reloader.reloads == 1
    assert reloader.fingerprint == file_digest(FIXTURES / "b.crt")
    # The same context object, now presenting the new certificate.
    assert _served_certificate(reloader.context) == _der(FIXTURES / "b.crt")
    assert reloader.ssl_context_factory(None, lambda: ssl.SSLContext()) is reloader.context
    view = reloader.status()
    assert view["reloads"] == 1 and view["last_error"] is None and view["loaded_at"]


def test_a_pair_that_does_not_load_keeps_the_running_one(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    cert, key = _install(tmp_path, "a")
    reloader = CertificateReloader(cert, key)
    # Certificate b with key a: a renewal caught between its two writes.
    _install(tmp_path, "a", cert_from="b")
    with caplog.at_level(logging.WARNING, logger="sofabaton_server.tls"):
        assert reloader.check() is False
        assert reloader.check() is False               # the same error again is not logged again
    assert reloader.last_error and "keeping the running one" in reloader.last_error
    assert sum("keeping the running one" in rec.message for rec in caplog.records) == 1
    assert reloader.fingerprint == file_digest(FIXTURES / "a.crt")
    assert _served_certificate(reloader.context) == _der(FIXTURES / "a.crt")
    # The matching key arrives: loaded on the next poll, the error clears.
    _install(tmp_path, "b")
    assert reloader.check() is True
    assert reloader.last_error is None
    assert reloader.fingerprint == file_digest(FIXTURES / "b.crt")


def test_missing_files_are_an_error_not_a_crash(tmp_path: Path) -> None:
    cert, key = _install(tmp_path, "a")
    reloader = CertificateReloader(cert, key)
    key.unlink()
    assert reloader.check() is False
    assert reloader.last_error and "cannot read the certificate files" in reloader.last_error
    assert reloader.fingerprint == file_digest(FIXTURES / "a.crt")
    _install(tmp_path, "a")
    assert reloader.check() is True                    # recreated files count as a change


def test_the_first_load_must_succeed(tmp_path: Path) -> None:
    cert, _ = _install(tmp_path, "a")
    with pytest.raises(ssl.SSLError):
        CertificateReloader(cert, FIXTURES / "b.key")
    with pytest.raises(OSError):
        CertificateReloader(tmp_path / "missing.pem", tmp_path / "key.pem")


def test_the_poll_runs_on_the_loop(tmp_path: Path) -> None:
    async def scenario() -> None:
        cert, key = _install(tmp_path, "a")
        reloader = CertificateReloader(cert, key, poll_interval=0.02)
        await reloader.start()
        assert reloader.running
        _install(tmp_path, "b")
        for _ in range(100):
            await asyncio.sleep(0.02)
            if reloader.reloads:
                break
        assert reloader.reloads == 1
        await reloader.stop()
        assert not reloader.running

    asyncio.run(scenario())


def test_uvicorn_gets_the_files_and_the_context_factory(tmp_path: Path) -> None:
    cert, key = _install(tmp_path, "a")
    settings = Settings(data_dir=tmp_path, tls_cert=cert, tls_key=key)
    assert tls_kwargs(settings, None) == {}
    reloader = CertificateReloader(cert, key)
    kwargs = tls_kwargs(settings, reloader)
    assert kwargs["ssl_certfile"] == str(cert) and kwargs["ssl_keyfile"] == str(key)
    import uvicorn

    supported = "ssl_context_factory" in inspect.signature(uvicorn.Config.__init__).parameters
    assert supported, "the package requires uvicorn 0.47+"
    assert kwargs["ssl_context_factory"] == reloader.ssl_context_factory
    # uvicorn builds its config with it and ends up serving our context.
    config = uvicorn.Config("sofabaton_server.app:create_app", factory=True, **kwargs)
    config.load()
    assert config.ssl is reloader.context


def test_the_app_runs_the_poll_with_its_lifespan(tmp_path: Path) -> None:
    cert, key = _install(tmp_path, "a")
    settings = Settings(data_dir=tmp_path, tls_cert=cert, tls_key=key)
    reloader = CertificateReloader(cert, key, poll_interval=60)
    manager = HubManager(settings, proxy_factory=Factory())
    app = create_app(settings, manager=manager, discovery=no_network_discovery(settings, manager),
                     tls_reloader=reloader)
    with TestClient(app) as client:
        assert reloader.running
        assert client.get("/api/v1/server").status_code == 200
    assert not reloader.running
