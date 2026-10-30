"""A stand-in for Home Assistant's webhook endpoint, for the Wifi webhook benches.

Shared by bench_w0_webhook.py (X1S, plain HTTP) and bench_w3_https.py (X2,
``0x21`` records over HTTP and TLS). The hub re-sends a Wifi callback until it
gets a reply it accepts (bench 2026-07-12), so every request is answered in the
current *shape* and recorded:

    control   the listener's reply: HTTP/1.1 200, "ok", Connection: close
    A         HA's default (a webhook handler that returns nothing): empty, keep-alive
    B         body, keep-alive
    C         empty, Connection: close
    D         body, Connection: close (what our own webhook handler can send)

With a TLS context the stand-in accepts plain TCP first and upgrades it, so a
hub that refuses the certificate shows up as a connection with ``tls_error``
instead of vanishing inside asyncio. SNI names the hub sends are recorded.
"""

from __future__ import annotations

import asyncio
import contextlib
import dataclasses
import email.utils
import json
import shutil
import ssl
import subprocess
import time
from pathlib import Path


@dataclasses.dataclass(frozen=True)
class Shape:
    label: str
    body: bytes
    close: bool
    listener: bool = False


SHAPES = {
    "control": Shape("listener reply", b"ok", True, listener=True),
    "A": Shape("HA default: empty, keep-alive", b"", False),
    "B": Shape("body, keep-alive", b"ok", False),
    "C": Shape("empty, Connection: close", b"", True),
    "D": Shape("body, Connection: close", b"ok", True),
}

# aiohttp's own lines when no capture is given; HA's middlewares may add more.
APPROX_HA_HEADER_LINES = ("Server: Python/3.13 aiohttp/3.12.15",)
# Lines a shape sets itself; a capture's copies of these are dropped.
_SHAPE_OWNED = ("content-length", "content-type", "connection", "date", "transfer-encoding", "keep-alive")


def wallclock() -> str:
    return time.strftime("%H:%M:%S")


def header_lines(capture_path: str | None) -> tuple[str, ...]:
    """HA's real header lines from a capture-ha file, else the approximation."""

    if not capture_path:
        return APPROX_HA_HEADER_LINES
    captured = json.loads(Path(capture_path).read_text(encoding="utf-8"))
    return tuple(line for line in captured.get("header_lines", [])
                 if line.split(":", 1)[0].strip().lower() not in _SHAPE_OWNED)


def build_response(name: str, lines_from_ha: tuple[str, ...]) -> bytes:
    shape = SHAPES[name]
    if shape.listener:
        # Byte for byte what roku_listener writes for an accepted callback.
        return (f"HTTP/1.1 200 OK\r\nContent-Length: {len(shape.body)}\r\n"
                "Content-Type: text/plain\r\nConnection: close\r\n\r\n").encode("ascii") + shape.body
    content_type = "text/plain; charset=utf-8" if shape.body else "application/octet-stream"
    lines = ["HTTP/1.1 200 OK", f"Content-Type: {content_type}", f"Content-Length: {len(shape.body)}",
             f"Date: {email.utils.formatdate(usegmt=True)}", *lines_from_ha]
    if shape.close:
        lines.append("Connection: close")
    return ("\r\n".join(lines) + "\r\n\r\n").encode("latin-1") + shape.body


def content_length(head: bytes) -> int:
    for line in head.split(b"\r\n")[1:]:
        key, _, value = line.partition(b":")
        if key.strip().lower() == b"content-length":
            try:
                return max(0, int(value.strip()))
            except ValueError:
                return 0
    return 0


# -- TLS ------------------------------------------------------------------------------------------

_OPENSSL_CANDIDATES = ("openssl", r"C:\Program Files\Git\mingw64\bin\openssl.exe",
                       r"C:\Program Files\Git\usr\bin\openssl.exe")


def find_openssl() -> str:
    for candidate in _OPENSSL_CANDIDATES:
        found = shutil.which(candidate) or (candidate if Path(candidate).is_file() else None)
        if found:
            return found
    raise FileNotFoundError("no openssl found (Git for Windows ships one); pass its path")


def make_self_signed(directory: Path, ip: str, *, openssl: str | None = None, days: int = 30) -> tuple[Path, Path]:
    """A throwaway self-signed certificate for ``ip`` (CN and IP SAN)."""

    directory.mkdir(parents=True, exist_ok=True)
    crt, key = directory / "bench_w3_selfsigned.crt", directory / "bench_w3_selfsigned.key"
    subprocess.run(
        [openssl or find_openssl(), "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", str(days),
         "-keyout", str(key), "-out", str(crt), "-subj", f"/CN={ip}", "-addext", f"subjectAltName=IP:{ip}"],
        check=True, capture_output=True,
    )
    return crt, key


def server_tls_context(crt: Path, key: Path) -> ssl.SSLContext:
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(str(crt), str(key))
    return context


# -- the stand-in ---------------------------------------------------------------------------------

class WebhookStandIn:
    """Answers every request with the current shape and records it."""

    def __init__(self, lines_from_ha: tuple[str, ...], *, keepalive: float = 75.0,
                 tls: ssl.SSLContext | None = None) -> None:
        self.shape = "control"
        self.lines_from_ha = lines_from_ha
        self.keepalive = keepalive
        self.tls = tls
        self.deliveries: list[dict] = []
        self.connections: list[dict] = []
        self.sni_seen: list[dict] = []
        self._writers: set = set()
        self._server = None
        if tls is not None:
            tls.sni_callback = self._note_sni

    def _note_sni(self, _sslobj, server_name, _context) -> None:
        self.sni_seen.append({"wall": wallclock(), "mono": time.monotonic(), "server_name": server_name})

    async def start(self, host: str, port: int) -> int:
        self._server = await asyncio.start_server(self._handle, host, port)
        return self._server.sockets[0].getsockname()[1]

    async def stop(self) -> None:
        self.close_all("server_stop")
        if self._server is not None:
            self._server.close()
            await self._server.wait_closed()

    def open_connections(self) -> list[dict]:
        return [conn for conn in self.connections if conn["closed_by"] is None]

    def close_all(self, reason: str) -> None:
        for conn in self.open_connections():
            conn["closed_by"] = reason
        for writer in list(self._writers):
            writer.close()

    async def _upgrade(self, writer: asyncio.StreamWriter, conn: dict) -> bool:
        before = len(self.sni_seen)
        try:
            await writer.start_tls(self.tls, ssl_handshake_timeout=10.0)
        except (ssl.SSLError, ConnectionError, OSError, asyncio.TimeoutError) as err:
            conn["tls_error"] = f"{type(err).__name__}: {err}"
            conn["closed_by"] = "tls_failed"
            print(f"  {wallclock()} conn {conn['index']} TLS handshake failed: {conn['tls_error']}", flush=True)
            return False
        sslobj = writer.get_extra_info("ssl_object")
        conn["tls_version"] = sslobj.version() if sslobj else None
        conn["tls_cipher"] = sslobj.cipher()[0] if sslobj and sslobj.cipher() else None
        conn["sni"] = self.sni_seen[-1]["server_name"] if len(self.sni_seen) > before else None
        return True

    async def _handle(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        conn = {"index": len(self.connections), "peer": f"{peer[0]}:{peer[1]}" if peer else "?",
                "opened": wallclock(), "opened_mono": time.monotonic(), "requests": 0, "closed_by": None}
        self.connections.append(conn)
        self._writers.add(writer)
        try:
            if self.tls is not None and not await self._upgrade(writer, conn):
                return
            while True:
                idle = self.keepalive if conn["requests"] else 15.0
                try:
                    head = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=idle)
                except asyncio.IncompleteReadError as err:
                    conn["closed_by"] = conn["closed_by"] or "client"
                    if err.partial:
                        conn["partial"] = err.partial[:200].decode("latin-1")
                    break
                except asyncio.TimeoutError:
                    conn["closed_by"] = conn["closed_by"] or "server_idle"
                    break
                except asyncio.LimitOverrunError:
                    conn["closed_by"] = conn["closed_by"] or "server_oversize"
                    break
                length = content_length(head)
                body = await asyncio.wait_for(reader.readexactly(length), timeout=5.0) if length else b""
                shape = self.shape
                conn["requests"] += 1
                request_line = head.split(b"\r\n", 1)[0].decode("latin-1")
                self.deliveries.append({"mono": time.monotonic(), "wall": wallclock(), "shape": shape,
                                        "conn": conn["index"], "request_line": request_line,
                                        "head": head.decode("latin-1")[:800], "body": body[:400].decode("latin-1"),
                                        "body_len": len(body)})
                print(f"  {wallclock()} <- conn {conn['index']} {request_line} -> {shape}", flush=True)
                writer.write(build_response(shape, self.lines_from_ha))
                await writer.drain()
                if SHAPES[shape].close:
                    conn["closed_by"] = "server"
                    break
        except (ConnectionError, OSError, ssl.SSLError):
            conn["closed_by"] = conn["closed_by"] or "reset"
        finally:
            conn["closed_mono"] = time.monotonic()
            conn["open_s"] = round(conn["closed_mono"] - conn["opened_mono"], 3)
            self._writers.discard(writer)
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()


async def wait_quiet(stand_in: WebhookStandIn, quiet_s: float, max_s: float) -> float:
    """Wait until the stand-in saw no delivery for ``quiet_s`` (or ``max_s`` passed)."""

    started = time.monotonic()
    while time.monotonic() - started < max_s:
        last = stand_in.deliveries[-1]["mono"] if stand_in.deliveries else 0.0
        if time.monotonic() - last >= quiet_s:
            break
        await asyncio.sleep(0.25)
    return round(time.monotonic() - started, 1)


async def press_through_shapes(stand_in: WebhookStandIn, press, shapes: list[str], *, window: float,
                               storm_limit: int, gap: float, step) -> list[dict]:
    """One press per shape; a storm switches the stand-in to ``control``.

    ``press`` is an async callable that sends one press and returns whether
    the hub took it; ``step`` logs a named step with fields.
    """

    results = []
    for name in shapes:
        stand_in.shape = name
        press_mono = time.monotonic()
        sent = await press()
        step("press", shape=name, label=SHAPES[name].label, sent=sent)
        storm_mono = None
        while time.monotonic() - press_mono < window:
            await asyncio.sleep(0.2)
            hits = [d for d in stand_in.deliveries if d["mono"] >= press_mono]
            if storm_mono is None and len(hits) >= storm_limit:
                storm_mono = time.monotonic()
                stand_in.shape = "control"
                step("storm", shape=name, deliveries=len(hits), note="switched to control")
        hits = [d for d in stand_in.deliveries if d["mono"] >= press_mono]
        after_switch = [d for d in hits if storm_mono is not None and d["mono"] >= storm_mono]
        conn_ids = sorted({d["conn"] for d in hits})
        failed_tls = [c for c in stand_in.connections if c["opened_mono"] >= press_mono and c.get("tls_error")]
        result = {
            "shape": name, "label": SHAPES[name].label, "sent": sent,
            "deliveries": len([d for d in hits if d["shape"] == name]), "deliveries_total": len(hits),
            "first_delivery_s": round(hits[0]["mono"] - press_mono, 3) if hits else None,
            "storm": storm_mono is not None,
            "storm_ended_s": round(after_switch[0]["mono"] - storm_mono, 3) if after_switch else None,
            "connections": len(conn_ids),
            "connection_close": [stand_in.connections[i]["closed_by"] for i in conn_ids],
            "tls_failures": [c["tls_error"] for c in failed_tls],
            "request_line": hits[0]["request_line"] if hits else None,
        }
        results.append(result)
        step("result", **result)
        # Before the next shape: no deliveries for ``gap``, and no connection
        # left open (a keep-alive the hub never closes is forced shut).
        waited = await wait_quiet(stand_in, gap, max_s=60.0)
        lingering = stand_in.open_connections()
        if lingering:
            step("lingering_connections", count=len(lingering), after_s=waited, note="forced shut")
            stand_in.close_all("server_forced")
            await asyncio.sleep(1.0)
        stand_in.shape = "control"
    return results


def print_results(results: list[dict]) -> None:
    print("\nshape    deliveries  storm  first_s  connections closed_by / tls")
    for row in results:
        print(f"{row['shape']:8} {row['deliveries']:>10}  {str(row['storm']):5}  {row['first_delivery_s']!s:7}"
              f"  {row['connections']:>11} {row['connection_close']} {row['tls_failures'] or ''}")
