"""A small MQTT 3.1.1 subscriber on asyncio, for the X2's press topic.

The server only ever listens: it subscribes to ``<MAC>/up`` per hub at
QoS 0 and never publishes (mqtt transport plan, section 6; the receive
only boundary is deliberate). That is a small enough slice of the
protocol to carry without a dependency, as the callback listener carries
its slice of HTTP: CONNECT with optional credentials and TLS, SUBSCRIBE /
UNSUBSCRIBE, PUBLISH in, PINGREQ keepalive, and a reconnect loop with
backoff that re-subscribes what is wanted.

The connection exists while at least one topic is wanted, mirroring the
callback listener, which is bound while a device needs it. Nothing here
knows about hubs; ``on_message(topic, payload, retain)`` is the seam.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import ssl
from dataclasses import dataclass
from typing import Any, Callable, Optional

from .models import now_iso

log = logging.getLogger(__name__)

KEEPALIVE_SECONDS = 60
CONNECT_TIMEOUT_SECONDS = 10.0
RETRY_MIN_SECONDS = 2.0
RETRY_MAX_SECONDS = 60.0
MAX_PACKET_BYTES = 256 * 1024

_CONNECT, _CONNACK, _PUBLISH, _PUBACK = 1, 2, 3, 4
_SUBSCRIBE, _SUBACK, _UNSUBSCRIBE, _UNSUBACK = 8, 9, 10, 11
_PINGREQ, _PINGRESP, _DISCONNECT = 12, 13, 14

_CONNACK_REASONS = {
    1: "the broker refused the protocol version",
    2: "the broker refused the client id",
    3: "the broker is unavailable",
    4: "bad user name or password",
    5: "not authorized",
}


class MqttError(RuntimeError):
    pass


def encode_varint(value: int) -> bytes:
    out = bytearray()
    while True:
        digit, value = value % 128, value // 128
        out.append(digit | (0x80 if value else 0))
        if not value:
            return bytes(out)


def encode_str(text: str | bytes) -> bytes:
    raw = text.encode("utf-8") if isinstance(text, str) else bytes(text)
    return len(raw).to_bytes(2, "big") + raw


def packet(type_and_flags: int, body: bytes = b"") -> bytes:
    return bytes([type_and_flags]) + encode_varint(len(body)) + body


def build_connect(client_id: str, username: Optional[str], password: Optional[str], keepalive: int) -> bytes:
    flags = 0x02                                  # clean session: the broker keeps nothing for us
    payload = encode_str(client_id)
    if username is not None:
        flags |= 0x80
        payload += encode_str(username)
        if password is not None:
            flags |= 0x40
            payload += encode_str(password)
    return packet(_CONNECT << 4, encode_str("MQTT") + bytes([4, flags]) + int(keepalive).to_bytes(2, "big") + payload)


def build_subscribe(packet_id: int, topics: list[str]) -> bytes:
    body = packet_id.to_bytes(2, "big") + b"".join(encode_str(topic) + b"\x00" for topic in topics)
    return packet((_SUBSCRIBE << 4) | 0x02, body)


def build_unsubscribe(packet_id: int, topics: list[str]) -> bytes:
    return packet((_UNSUBSCRIBE << 4) | 0x02, packet_id.to_bytes(2, "big") + b"".join(encode_str(t) for t in topics))


async def read_packet(reader: asyncio.StreamReader) -> tuple[int, bytes]:
    """One packet: ``(first byte, body)``. Raises on a closed or absurd stream."""

    first = (await reader.readexactly(1))[0]
    length = shift = 0
    for _ in range(4):
        digit = (await reader.readexactly(1))[0]
        length |= (digit & 0x7F) << shift
        if not digit & 0x80:
            break
        shift += 7
    else:
        raise MqttError("malformed remaining length")
    if length > MAX_PACKET_BYTES:
        raise MqttError(f"packet of {length} bytes is larger than this client accepts")
    return first, (await reader.readexactly(length) if length else b"")


def parse_publish(first: int, body: bytes) -> tuple[str, bytes, bool, int, Optional[int]]:
    """``(topic, payload, retain, qos, packet id)`` of a PUBLISH."""

    qos = (first >> 1) & 0x03
    size = int.from_bytes(body[0:2], "big")
    topic = body[2:2 + size].decode("utf-8", errors="replace")
    offset = 2 + size
    packet_id: Optional[int] = None
    if qos:
        packet_id = int.from_bytes(body[offset:offset + 2], "big")
        offset += 2
    return topic, bytes(body[offset:]), bool(first & 0x01), qos, packet_id


@dataclass(frozen=True)
class MqttState:
    configured: bool
    wanted: bool
    connected: bool
    host: Optional[str]
    port: Optional[int]
    tls: bool
    username: Optional[str]
    topics: tuple[str, ...]
    last_error: Optional[str]
    connected_at: Optional[str]
    next_retry_at: Optional[str]


MessageHandler = Callable[[str, bytes, bool], Any]


class MqttSubscriber:
    """Keeps a subscription to a moving set of topics, for as long as there is one."""

    def __init__(self, *, host: Optional[str], port: int = 1883, username: Optional[str] = None,
                 password: Optional[str] = None, tls: bool = False, tls_ca: Optional[str] = None,
                 tls_insecure: bool = False, client_id: Optional[str] = None,
                 on_message: MessageHandler, on_state: Optional[Callable[[str], Any]] = None,
                 keepalive: Optional[int] = None, retry_min: Optional[float] = None,
                 retry_max: Optional[float] = None) -> None:
        self.host = host or None
        self.port = int(port)
        self.username = username
        self._password = password
        self.tls = bool(tls)
        self._tls_ca = tls_ca
        self._tls_insecure = bool(tls_insecure)
        self.client_id = client_id or f"sofabaton-x-server-{secrets.token_hex(4)}"
        self._on_message = on_message
        self._on_state = on_state
        # Resolved at construction so a test can shorten the module values.
        self._keepalive = int(KEEPALIVE_SECONDS if keepalive is None else keepalive)
        self._retry_min = float(RETRY_MIN_SECONDS if retry_min is None else retry_min)
        self._retry_max = float(RETRY_MAX_SECONDS if retry_max is None else retry_max)
        self._wanted: set[str] = set()
        self._subscribed: set[str] = set()
        self._task: Optional[asyncio.Task] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._connected = False
        self._connected_at: Optional[str] = None
        self._last_error: Optional[str] = None
        self._next_retry_at: Optional[str] = None
        self._packet_id = 0
        self._changed = asyncio.Event()

    # -- state -----------------------------------------------------------------

    @property
    def configured(self) -> bool:
        return self.host is not None

    @property
    def connected(self) -> bool:
        return self._connected

    def state(self) -> MqttState:
        return MqttState(configured=self.configured, wanted=bool(self._wanted), connected=self._connected,
                         host=self.host, port=self.port if self.configured else None, tls=self.tls,
                         username=self.username, topics=tuple(sorted(self._wanted)), last_error=self._last_error,
                         connected_at=self._connected_at, next_retry_at=self._next_retry_at)

    # -- lifecycle -------------------------------------------------------------

    async def set_topics(self, topics: set[str]) -> None:
        """The topics to be subscribed to from now on; none means no connection."""

        self._wanted = set(topics)
        if not self.configured:
            return
        if self._wanted and (self._task is None or self._task.done()):
            self._task = asyncio.create_task(self._run(), name="mqtt-subscriber")
        elif not self._wanted and self._task is not None:
            await self.stop()
            return
        self._changed.set()

    async def stop(self) -> None:
        task, self._task = self._task, None
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._set_connected(False)
        self._last_error = None
        self._next_retry_at = None

    # -- the loop ----------------------------------------------------------------

    async def _run(self) -> None:
        delay = self._retry_min
        while self._wanted:
            try:
                await self._session()
                delay = self._retry_min
            except asyncio.CancelledError:
                raise
            except Exception as err:  # noqa: BLE001
                self._last_error = str(err) or type(err).__name__
                log.warning("mqtt: %s:%s: %s", self.host, self.port, self._last_error)
                self._announce("mqtt_failed")
            finally:
                await self._close()
            if not self._wanted:
                break
            from datetime import datetime, timedelta, timezone
            self._next_retry_at = (datetime.now(timezone.utc) + timedelta(seconds=delay)).replace(microsecond=0).isoformat()
            await asyncio.sleep(delay)
            self._next_retry_at = None
            delay = min(delay * 2, self._retry_max)

    def _ssl_context(self) -> Optional[ssl.SSLContext]:
        if not self.tls:
            return None
        context = ssl.create_default_context(cafile=self._tls_ca)
        if self._tls_insecure:
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
        return context

    async def _session(self) -> None:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(self.host, self.port, ssl=self._ssl_context()), timeout=CONNECT_TIMEOUT_SECONDS)
        self._writer = writer
        writer.write(build_connect(self.client_id, self.username, self._password, self._keepalive))
        await writer.drain()
        first, body = await asyncio.wait_for(read_packet(reader), timeout=CONNECT_TIMEOUT_SECONDS)
        if first >> 4 != _CONNACK or len(body) < 2:
            raise MqttError("the broker did not answer the connect")
        if body[1]:
            raise MqttError(_CONNACK_REASONS.get(body[1], f"the broker refused the connection (code {body[1]})"))
        self._subscribed = set()
        self._last_error = None
        self._set_connected(True)
        log.info("mqtt: connected to %s:%s as %s", self.host, self.port, self.client_id)
        self._announce("mqtt_connected")
        await self._sync_topics()
        ping = asyncio.create_task(self._ping_loop(), name="mqtt-ping")
        topics = asyncio.create_task(self._topic_loop(), name="mqtt-topics")
        try:
            while True:
                # The broker answers a ping within the keepalive; silence past one and a half is a dead link.
                first, body = await asyncio.wait_for(read_packet(reader), timeout=self._keepalive * 1.5)
                kind = first >> 4
                if kind == _PUBLISH:
                    topic, payload, retain, qos, packet_id = parse_publish(first, body)
                    if qos == 1 and packet_id is not None:
                        writer.write(packet(_PUBACK << 4, packet_id.to_bytes(2, "big")))
                        await writer.drain()
                    try:
                        self._on_message(topic, payload, retain)
                    except Exception:  # noqa: BLE001
                        log.exception("mqtt: the message handler failed for %s", topic)
                elif kind == _SUBACK and body[2:] and any(code == 0x80 for code in body[2:]):
                    raise MqttError("the broker refused a subscription (check the user's topic permissions)")
        except asyncio.TimeoutError as err:
            raise MqttError("the broker stopped answering") from err
        except asyncio.IncompleteReadError as err:
            raise MqttError("the broker closed the connection") from err
        finally:
            for task in (ping, topics):
                task.cancel()

    async def _ping_loop(self) -> None:
        while True:
            await asyncio.sleep(max(1.0, self._keepalive / 2))
            await self._send(packet(_PINGREQ << 4))

    async def _topic_loop(self) -> None:
        while True:
            await self._changed.wait()
            self._changed.clear()
            await self._sync_topics()

    async def _sync_topics(self) -> None:
        add = sorted(self._wanted - self._subscribed)
        drop = sorted(self._subscribed - self._wanted)
        if add:
            await self._send(build_subscribe(self._next_id(), add))
            log.info("mqtt: subscribed to %s", ", ".join(add))
        if drop:
            await self._send(build_unsubscribe(self._next_id(), drop))
        self._subscribed = set(self._wanted)

    def _next_id(self) -> int:
        self._packet_id = self._packet_id % 0xFFFF + 1
        return self._packet_id

    async def _send(self, data: bytes) -> None:
        writer = self._writer
        if writer is None:
            return
        writer.write(data)
        await writer.drain()

    async def _close(self) -> None:
        writer, self._writer = self._writer, None
        was = self._connected
        self._set_connected(False)
        if writer is not None:
            try:
                if was:
                    writer.write(packet(_DISCONNECT << 4))
                writer.close()
                await asyncio.wait_for(writer.wait_closed(), timeout=2.0)
            except Exception:  # noqa: BLE001
                pass

    def _set_connected(self, connected: bool) -> None:
        self._connected = connected
        self._connected_at = now_iso() if connected else None

    def _announce(self, kind: str) -> None:
        if self._on_state is None:
            return
        try:
            self._on_state(kind)
        except Exception:  # noqa: BLE001
            log.exception("mqtt: the state listener failed")
