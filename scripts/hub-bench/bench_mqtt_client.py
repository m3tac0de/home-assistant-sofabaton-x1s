"""Minimal MQTT 3.1.1 subscriber for hub-bench scripts.

The bench harness deliberately has no third-party dependencies (it loads
the standalone library straight off the repo, see bench_common.py), so
this is a small hand-rolled client instead of paho-mqtt. It supports
exactly what the latency bench needs:

- CONNECT with optional username/password, clean session
- SUBSCRIBE (QoS 0) to one or more topic filters
- inbound PUBLISH capture with per-message flags (qos/retain/dup) and a
  ``time.time()`` arrival stamp taken in the reader thread, before any
  polling caller notices the hit
- PUBACK for any QoS 1 delivery a broker sends despite the QoS 0
  subscription (defensive; must not stall the session)
- keepalive PINGREQ

Self-test (no broker needed, spins an in-process fake):

    python bench_mqtt_client.py
"""

from __future__ import annotations

import socket
import threading
import time

_PROTOCOL_NAME = b"\x00\x04MQTT"
_PROTOCOL_LEVEL = 4  # 3.1.1


class MqttError(RuntimeError):
    pass


# ---------------------------------------------------------------- encoding
def _encode_varint(value: int) -> bytes:
    out = bytearray()
    while True:
        byte = value % 128
        value //= 128
        if value:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def _encode_str(value: str | bytes) -> bytes:
    raw = value.encode("utf-8") if isinstance(value, str) else value
    return len(raw).to_bytes(2, "big") + raw


def _packet(packet_type_flags: int, body: bytes) -> bytes:
    return bytes([packet_type_flags]) + _encode_varint(len(body)) + body


def build_connect(client_id: str, username: str | None, password: str | None,
                  keepalive: int) -> bytes:
    flags = 0x02  # clean session
    payload = _encode_str(client_id)
    if username is not None:
        flags |= 0x80
        payload += _encode_str(username)
        if password is not None:
            flags |= 0x40
            payload += _encode_str(password)
    body = _PROTOCOL_NAME + bytes([_PROTOCOL_LEVEL, flags]) + keepalive.to_bytes(2, "big") + payload
    return _packet(0x10, body)


def build_subscribe(packet_id: int, topics: list[str]) -> bytes:
    body = packet_id.to_bytes(2, "big")
    for topic in topics:
        body += _encode_str(topic) + b"\x00"  # requested QoS 0
    return _packet(0x82, body)


def build_puback(packet_id: int) -> bytes:
    return _packet(0x40, packet_id.to_bytes(2, "big"))


def build_pingreq() -> bytes:
    return _packet(0xC0, b"")


def build_disconnect() -> bytes:
    return _packet(0xE0, b"")


# ---------------------------------------------------------------- decoding
class _NeedMore(Exception):
    pass


def _parse_packet(buf: bytes) -> tuple[int, bytes, int]:
    """Return (first_byte, body, total_consumed) or raise _NeedMore."""
    if len(buf) < 2:
        raise _NeedMore
    first = buf[0]
    length = 0
    multiplier = 1
    i = 1
    while True:
        if i >= len(buf):
            raise _NeedMore
        byte = buf[i]
        length += (byte & 0x7F) * multiplier
        multiplier *= 128
        i += 1
        if not byte & 0x80:
            break
        if multiplier > 128**3:
            raise MqttError("malformed remaining-length varint")
    if len(buf) < i + length:
        raise _NeedMore
    return first, buf[i:i + length], i + length


# ---------------------------------------------------------------- client
class MiniMqttSubscriber:
    """Threaded subscriber capturing every inbound PUBLISH with timestamps."""

    def __init__(
        self,
        host: str,
        port: int = 1883,
        *,
        username: str | None = None,
        password: str | None = None,
        client_id: str | None = None,
        keepalive: int = 30,
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.client_id = client_id or f"m3bench-{int(time.time()) & 0xFFFFFF:06x}"
        self.keepalive = keepalive
        self.hits: list[dict] = []
        self.granted: list[int] | None = None
        self._lock = threading.Lock()
        self._suback = threading.Event()
        self._sock: socket.socket | None = None
        self._reader: threading.Thread | None = None
        self._pinger: threading.Thread | None = None
        self._stop = threading.Event()
        self._buf = b""
        self._next_packet_id = 1

    # ------------------------------------------------------------ lifecycle
    def start(self, timeout: float = 10.0) -> "MiniMqttSubscriber":
        sock = socket.create_connection((self.host, self.port), timeout=timeout)
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self._sock = sock
        sock.sendall(build_connect(self.client_id, self.username, self.password, self.keepalive))
        first, body = self._read_packet_blocking(timeout)
        if first & 0xF0 != 0x20 or len(body) < 2:
            raise MqttError(f"expected CONNACK, got 0x{first:02X}")
        if body[1] != 0:
            raise MqttError(f"broker refused connection, CONNACK return code {body[1]}")
        sock.settimeout(0.5)
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        self._pinger = threading.Thread(target=self._ping_loop, daemon=True)
        self._pinger.start()
        return self

    def stop(self) -> None:
        self._stop.set()
        sock, self._sock = self._sock, None
        if sock is not None:
            try:
                sock.sendall(build_disconnect())
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass
        for thread in (self._reader, self._pinger):
            if thread is not None:
                thread.join(timeout=2.0)
        self._reader = self._pinger = None

    def __enter__(self) -> "MiniMqttSubscriber":
        return self.start()

    def __exit__(self, *exc) -> None:
        self.stop()

    # ------------------------------------------------------------ subscribe
    def subscribe(self, topics: list[str], timeout: float = 10.0) -> list[int]:
        if self._sock is None:
            raise MqttError("not connected")
        self._suback.clear()
        packet_id = self._next_packet_id
        self._next_packet_id += 1
        self._sock.sendall(build_subscribe(packet_id, topics))
        if not self._suback.wait(timeout):
            raise MqttError("SUBACK timeout")
        granted = self.granted or []
        if any(code == 0x80 for code in granted):
            raise MqttError(f"broker rejected subscription(s): granted={granted}")
        return granted

    # ------------------------------------------------------------ capture
    def clear(self) -> None:
        with self._lock:
            self.hits.clear()

    def snapshot(self) -> list[dict]:
        with self._lock:
            return list(self.hits)

    def wait_for_hits(self, count: int, timeout: float) -> list[dict]:
        deadline = time.time() + timeout
        while time.time() < deadline:
            hits = self.snapshot()
            if len(hits) >= count:
                return hits
            time.sleep(0.002)
        return self.snapshot()

    # ------------------------------------------------------------ internals
    def _read_packet_blocking(self, timeout: float) -> tuple[int, bytes]:
        assert self._sock is not None
        self._sock.settimeout(timeout)
        deadline = time.time() + timeout
        while True:
            try:
                first, body, used = _parse_packet(self._buf)
            except _NeedMore:
                if time.time() > deadline:
                    raise MqttError("timeout waiting for packet") from None
                chunk = self._sock.recv(4096)
                if not chunk:
                    raise MqttError("connection closed during handshake") from None
                self._buf += chunk
                continue
            self._buf = self._buf[used:]
            return first, body

    def _read_loop(self) -> None:
        while not self._stop.is_set():
            sock = self._sock
            if sock is None:
                return
            try:
                chunk = sock.recv(65536)
            except socket.timeout:
                continue
            except OSError:
                return
            if not chunk:
                return
            at = time.time()
            self._buf += chunk
            while True:
                try:
                    first, body, used = _parse_packet(self._buf)
                except _NeedMore:
                    break
                self._buf = self._buf[used:]
                self._dispatch(first, body, at)

    def _dispatch(self, first: int, body: bytes, at: float) -> None:
        packet_type = first & 0xF0
        if packet_type == 0x30:  # PUBLISH
            qos = (first >> 1) & 0x03
            retain = bool(first & 0x01)
            dup = bool(first & 0x08)
            if len(body) < 2:
                return
            topic_len = int.from_bytes(body[:2], "big")
            if len(body) < 2 + topic_len:
                return
            topic = body[2:2 + topic_len].decode("utf-8", "replace")
            rest = body[2 + topic_len:]
            packet_id = None
            if qos > 0 and len(rest) >= 2:
                packet_id = int.from_bytes(rest[:2], "big")
                rest = rest[2:]
            with self._lock:
                self.hits.append({
                    "topic": topic,
                    "payload": rest.decode("utf-8", "replace"),
                    "qos": qos,
                    "retain": retain,
                    "dup": dup,
                    "at": at,
                })
            if packet_id is not None and self._sock is not None:
                try:
                    self._sock.sendall(build_puback(packet_id))
                except OSError:
                    pass
        elif packet_type == 0x90:  # SUBACK
            self.granted = list(body[2:])
            self._suback.set()
        # PINGRESP (0xD0) and anything else: nothing to do

    def _ping_loop(self) -> None:
        interval = max(self.keepalive / 2.0, 5.0)
        while not self._stop.wait(interval):
            sock = self._sock
            if sock is None:
                return
            try:
                sock.sendall(build_pingreq())
            except OSError:
                return


# ---------------------------------------------------------------- self-test
def _fake_broker(server: socket.socket, log: dict) -> None:
    conn, _ = server.accept()
    conn.settimeout(5.0)
    buf = b""

    def read_packet() -> tuple[int, bytes]:
        nonlocal buf
        while True:
            try:
                first, body, used = _parse_packet(buf)
            except _NeedMore:
                chunk = conn.recv(4096)
                if not chunk:
                    raise MqttError("client closed")
                buf += chunk
                continue
            buf = buf[used:]
            return first, body

    first, _body = read_packet()
    assert first & 0xF0 == 0x10, "expected CONNECT"
    conn.sendall(_packet(0x20, b"\x00\x00"))  # CONNACK accepted

    first, body = read_packet()
    assert first == 0x82, "expected SUBSCRIBE"
    packet_id = int.from_bytes(body[:2], "big")
    topic_count = 0
    i = 2
    while i < len(body):
        tlen = int.from_bytes(body[i:i + 2], "big")
        i += 2 + tlen + 1
        topic_count += 1
    conn.sendall(_packet(0x90, packet_id.to_bytes(2, "big") + b"\x00" * topic_count))

    def publish(topic: str, payload: bytes, *, qos: int = 0, retain: bool = False,
                packet_id: int | None = None) -> None:
        first_byte = 0x30 | (qos << 1) | (1 if retain else 0)
        body = _encode_str(topic)
        if qos > 0:
            body += (packet_id or 1).to_bytes(2, "big")
        conn.sendall(_packet(first_byte, body + payload))

    publish("AABBCC/up", b'{"device_id": 2, "key_id": 1}', retain=True)
    publish("AABBCC/up", b'{"device_id": 2, "key_id": 3}', qos=1, packet_id=5)
    first, body = read_packet()
    log["puback"] = first & 0xF0 == 0x40 and int.from_bytes(body[:2], "big") == 5
    publish("aabbcc/up", b'{"device_id": 2, "key_id": 7}')
    time.sleep(0.3)
    conn.close()


def _selftest() -> int:
    failures: list[str] = []

    def check(label: str, ok: bool, detail: str = "") -> None:
        print(f"  {'OK  ' if ok else 'FAIL'} {label}" + (f" - {detail}" if detail else ""))
        if not ok:
            failures.append(label)

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]
    log: dict = {}
    broker = threading.Thread(target=_fake_broker, args=(server, log), daemon=True)
    broker.start()

    client = MiniMqttSubscriber("127.0.0.1", port, username="bench", password="pw")
    client.start()
    granted = client.subscribe(["AABBCC/up", "aabbcc/up"])
    check("subscribe granted qos0 x2", granted == [0, 0], f"granted={granted}")
    hits = client.wait_for_hits(3, 5.0)
    check("three publishes captured", len(hits) == 3, f"{len(hits)} hit(s)")
    if len(hits) == 3:
        check("retain flag surfaced", hits[0]["retain"] and not hits[1]["retain"])
        check("qos surfaced", hits[1]["qos"] == 1 and hits[2]["qos"] == 0)
        check("payload intact", '"key_id": 7' in hits[2]["payload"])
        check("topic case preserved", hits[2]["topic"] == "aabbcc/up")
        check("timestamps monotonic", hits[0]["at"] <= hits[1]["at"] <= hits[2]["at"])
    broker.join(timeout=5.0)
    check("qos1 delivery PUBACKed", bool(log.get("puback")))
    client.stop()
    server.close()

    print(f"{'PASS' if not failures else 'FAIL'}: {len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    import sys

    sys.exit(_selftest())
