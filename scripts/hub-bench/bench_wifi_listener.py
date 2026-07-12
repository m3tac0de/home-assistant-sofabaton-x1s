"""Shared HTTP callback listener for the Wifi Commands bench program.

Plan: docs/internal/wifi-commands-bench-plan.md (chunk 1 deliverable).

The backup/restore program's chunk 5 used a bare
``http.server.BaseHTTPRequestHandler`` (HTTP/1.0 status line, zero-length
body) and observed a hub-side callback storm on ``REQ_ACTIVATE`` of a
``wifi_ip`` command. Working hypothesis: the hub retries delivery until it
gets a response it accepts, so the listener's response shape is itself a
test variable. This helper therefore

- answers, in its default ``ok`` mode, with the **integration's exact
  response bytes** (``roku_listener.py _write_response``):
  ``HTTP/1.1 200 OK`` + ``Content-Length`` + ``Content-Type: text/plain``
  + ``Connection: close`` + body ``ok``;
- captures every request (method / path / version / headers / body /
  client / timestamp / mode answered with) for exact-callback assertions;
- supports the chunk-2 response-mode matrix via ``listener.mode``:

  ``ok``           integration shape, 200 + "ok"
  ``http10-empty`` chunk-5 replica: ``HTTP/1.0 200 OK`` with
                   Server/Date headers and ``Content-Length: 0``
  ``404``          integration shape, 404 + "not found"
  ``rst``          accept + record, then hard-reset the connection
                   (SO_LINGER 0) — a response-less failure the hub can
                   still distinguish from a closed port

  For a true **connection refused** probe, call ``stop()`` and let the
  OS reject the SYN — nothing is capturable on this side then; count
  recovery by switching a mode back on afterwards.

Usage (bench scripts):

    from bench_wifi_listener import BenchWifiListener, local_ip_toward, pick_port

    port = pick_port()                      # 8060 unless occupied
    with BenchWifiListener(port) as listener:
        print("listening on", local_ip_toward(hub_ip), port)
        ... fire command ...
        hits = listener.wait_for_hits(1, timeout=10)

Self-test (no hub): ``python bench_wifi_listener.py``
"""

from __future__ import annotations

import email.utils
import socket
import struct
import sys
import threading
import time

DEFAULT_PORT = 8060
RESPONSE_MODES = ("ok", "http10-empty", "404", "rst")

_READ_TIMEOUT = 3.0
_STATUS_REASONS = {200: "OK", 404: "Not Found"}


def local_ip_toward(hub_ip: str) -> str:
    """The bench machine's IP on the interface that routes to the hub."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect((hub_ip, 9))
        return s.getsockname()[0]
    finally:
        s.close()


def pick_port(preferred: int = DEFAULT_PORT) -> int:
    """Preferred port if bindable, else an OS-assigned free one."""
    for candidate in (preferred, 0):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("0.0.0.0", candidate))
            return s.getsockname()[1]
        except OSError:
            continue
        finally:
            s.close()
    raise RuntimeError("no bindable port found")


def _integration_response(status: int, body: bytes) -> bytes:
    """Byte-for-byte port of roku_listener.RokuListenerManager._write_response."""
    reason = _STATUS_REASONS.get(status, "OK")
    return (
        f"HTTP/1.1 {status} {reason}\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Content-Type: text/plain\r\n"
        "Connection: close\r\n\r\n"
    ).encode("utf-8") + body


def _http10_empty_response() -> bytes:
    """Replica of what chunk 5's bare BaseHTTPRequestHandler sent."""
    py = ".".join(str(v) for v in sys.version_info[:3])
    return (
        "HTTP/1.0 200 OK\r\n"
        f"Server: BaseHTTP/0.6 Python/{py}\r\n"
        f"Date: {email.utils.formatdate(usegmt=True)}\r\n"
        "Content-Length: 0\r\n\r\n"
    ).encode("ascii")


class BenchWifiListener:
    """Threaded raw-socket HTTP listener with switchable response modes."""

    def __init__(self, port: int = DEFAULT_PORT, *, mode: str = "ok") -> None:
        if mode not in RESPONSE_MODES:
            raise ValueError(f"mode must be one of {RESPONSE_MODES}")
        self.port = port
        self.mode = mode
        self.hits: list[dict] = []
        self._lock = threading.Lock()
        self._server: socket.socket | None = None
        self._thread: threading.Thread | None = None

    # ------------------------------------------------------------ lifecycle
    def start(self) -> "BenchWifiListener":
        server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind(("0.0.0.0", self.port))
        server.listen(16)
        server.settimeout(0.5)
        self._server = server
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        """Close the port (subsequent connects are OS-refused)."""
        server, self._server = self._server, None
        if server is not None:
            server.close()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None

    def __enter__(self) -> "BenchWifiListener":
        return self.start()

    def __exit__(self, *exc) -> None:
        self.stop()

    # ------------------------------------------------------------ capture
    def clear(self) -> None:
        with self._lock:
            self.hits.clear()

    def snapshot(self) -> list[dict]:
        with self._lock:
            return list(self.hits)

    def wait_for_hits(self, count: int, timeout: float) -> list[dict]:
        """Block until at least ``count`` hits arrive or ``timeout`` lapses."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            hits = self.snapshot()
            if len(hits) >= count:
                return hits
            time.sleep(0.1)
        return self.snapshot()

    # ------------------------------------------------------------ internals
    def _serve(self) -> None:
        while self._server is not None:
            try:
                conn, addr = self._server.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            threading.Thread(
                target=self._handle, args=(conn, addr), daemon=True
            ).start()

    def _handle(self, conn: socket.socket, addr: tuple) -> None:
        mode = self.mode
        try:
            conn.settimeout(_READ_TIMEOUT)
            request = self._read_request(conn)
            if request is not None:
                request["client"] = addr[0]
                request["mode"] = mode
                request["at"] = time.time()
                with self._lock:
                    self.hits.append(request)

            if mode == "rst":
                conn.setsockopt(
                    socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0)
                )
                return  # close() in finally emits RST
            if request is None:
                conn.sendall(_integration_response(404, b"not found"))
            elif mode == "ok":
                conn.sendall(_integration_response(200, b"ok"))
            elif mode == "404":
                conn.sendall(_integration_response(404, b"not found"))
            elif mode == "http10-empty":
                conn.sendall(_http10_empty_response())
        except OSError:
            pass
        finally:
            try:
                conn.close()
            except OSError:
                pass

    @staticmethod
    def _read_request(conn: socket.socket) -> dict | None:
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = conn.recv(4096)
            if not chunk:
                return None if not buf else {"raw": buf.decode("ascii", "replace")}
            buf += chunk
            if len(buf) > 65536:
                break
        head, _, rest = buf.partition(b"\r\n\r\n")
        lines = head.decode("utf-8", "replace").split("\r\n")
        parts = lines[0].split()
        headers: dict[str, str] = {}
        for line in lines[1:]:
            key, _, value = line.partition(":")
            headers[key.strip().lower()] = value.strip()
        try:
            length = int(headers.get("content-length") or 0)
        except ValueError:
            length = 0
        body = rest
        while len(body) < length:
            chunk = conn.recv(4096)
            if not chunk:
                break
            body += chunk
        return {
            "method": parts[0] if parts else "",
            "path": parts[1] if len(parts) > 1 else "",
            "version": parts[2] if len(parts) > 2 else "",
            "headers": headers,
            "body": body[:length].decode("ascii", "replace"),
            "request_line": lines[0],
        }


# ---------------------------------------------------------------- self-test
def _selftest() -> int:
    failures: list[str] = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" — {detail}" if detail else ""))
        if not ok:
            failures.append(label)

    def http_exchange(port: int, payload: bytes) -> bytes | None:
        """Send payload, return full response bytes, or None on RST/refusal."""
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(3.0)
        try:
            s.connect(("127.0.0.1", port))
            s.sendall(payload)
            out = b""
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    return out
                out += chunk
        except ConnectionError:
            return None
        finally:
            s.close()

    request = (
        b"POST /launch/ha/1/Bench%20Action/short HTTP/1.1\r\n"
        b"Host: 127.0.0.1\r\nContent-Length: 0\r\n\r\n"
    )

    port = pick_port(0)
    with BenchWifiListener(port) as listener:
        print(f"self-test listener on 127.0.0.1:{port}")

        resp = http_exchange(port, request)
        check(
            "mode=ok: exact integration bytes",
            resp
            == b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Type: text/plain\r\n"
            b"Connection: close\r\n\r\nok",
            repr(resp),
        )
        hits = listener.wait_for_hits(1, 2.0)
        check(
            "capture: method+path+version recorded",
            len(hits) == 1
            and hits[0]["method"] == "POST"
            and hits[0]["path"] == "/launch/ha/1/Bench%20Action/short"
            and hits[0]["version"] == "HTTP/1.1"
            and hits[0]["mode"] == "ok",
            f"{len(hits)} hit(s)",
        )

        listener.mode = "404"
        resp = http_exchange(port, request)
        check(
            "mode=404: integration-shape 404",
            resp is not None and resp.startswith(b"HTTP/1.1 404 Not Found\r\n")
            and resp.endswith(b"\r\n\r\nnot found"),
            repr(resp),
        )

        listener.mode = "http10-empty"
        resp = http_exchange(port, request)
        check(
            "mode=http10-empty: HTTP/1.0 + Content-Length 0",
            resp is not None
            and resp.startswith(b"HTTP/1.0 200 OK\r\nServer: BaseHTTP/0.6")
            and resp.endswith(b"Content-Length: 0\r\n\r\n"),
            repr(resp),
        )

        listener.mode = "rst"
        resp = http_exchange(port, request)
        check("mode=rst: connection reset, no response bytes", resp is None, repr(resp))

        check("capture: 4 hits total across modes", len(listener.snapshot()) == 4)

    # port closed after stop() → refused
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(3.0)
    try:
        s.connect(("127.0.0.1", port))
        refused = False
    except ConnectionRefusedError:
        refused = True
    except OSError:
        refused = False
    finally:
        s.close()
    check("stop(): subsequent connect refused", refused)

    print(f"{'PASS' if not failures else 'FAIL'}: {len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(_selftest())
