"""Callback devices: the hub calls the server, the server tells the client.

Plan: docs/internal/sofabaton-x-server-callbacks-plan.md (C1 to C4).

Four parts, all in this module:

* ``CallbackRecord`` -- what the server persists per hub about the managed
  Wifi Device it deployed (the library's ``WifiDeployment`` plus the
  server's own state: stale flag, pending intent, adoption mark).
* ``PressRing`` -- presses with a per-server-instance sequence, shared by
  the WebSocket stream and the REST catch-up view.
* ``CallbackListener`` -- the plain-HTTP listener the hub calls, modelled
  on the Home Assistant integration's: strict limits, a fast ``200 ok``
  whatever happens downstream, a gate on the hub's identity and source
  address, a backoff retry while the port is taken.
* ``CallbackService`` -- the orchestration: deploy / update / remove /
  redeploy as job bodies, reconciliation of pending intents and orphans,
  stale detection on every snapshot change, and the press pipeline.

Presses reach the server over one of two transports (server panel wifi
commands plan, section 7). ``http``: the hub calls the listener above.
``mqtt`` (X2 only): the device's records are inert and the hub publishes
``{"device_id", "key_id"}`` to ``<MAC>/up`` on the broker set in the
Sofabaton app; the server subscribes there (``mqtt_client``) while a
device uses it, with the broker settings taken from the command line or
the environment only. Both end in the same ``press``.

The service never touches the engine; every hub operation goes through
the library's facade (``deploy_wifi_device``, ``update_wifi_device``,
``remove_device``, ``read_payload``, ``snapshot``).
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import re
import secrets
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any, Awaitable, Callable, Literal, Optional
from urllib.parse import urlsplit

from sofabaton import (
    WIFI_SLOT_COUNT,
    AsyncXProxy,
    HubEvent,
    WifiDeployment,
    WifiDeviceSpec,
    WifiSlotSpec,
    WifiTarget,
)
from sofabaton.wifi_device import DEFAULT_WIFI_BRAND

from .config import Settings
from .manager import HubDisabled, HubManager, HubNotFound
from .mqtt_client import MqttState, MqttSubscriber
from .mqtt_config import MqttConfig, MqttConfigStore, startup_pinned
from .models import mac_key, now_iso

log = logging.getLogger(__name__)

# The listener contract, byte for byte what the Home Assistant listener
# accepts (roku_listener.py): the hub retries a callback whose response
# it dislikes, so these are not tunables.
MAX_REQUEST_LINE_BYTES = 4096
MAX_HEADER_BYTES = 16384
MAX_HEADER_COUNT = 100
MAX_BODY_BYTES = 1024
READ_TIMEOUT_SECONDS = 1.0
MAX_PATH_SEGMENT_LENGTH = 30
LISTEN_BIND = "0.0.0.0"

#: The X1 Roku replay always calls this port.
X1_CALLBACK_PORT = 8060
#: Presses kept per hub for the REST catch-up view.
PRESS_RING_SIZE = 100
#: Bind-failure retry: exponential from the first to the second value.
RETRY_MIN_SECONDS = 5.0
RETRY_MAX_SECONDS = 300.0

Resolution = Literal["deployed", "stale", "unknown_slot", "unknown_device"]
PendingOp = Literal["create", "update", "delete"]

# Wifi Devices (docs/internal/server-panel-wifi-commands-plan.md, section
# 2): a hub holds several managed devices, each under a key. The callback
# device of the 0.2.0 API is the one under the reserved key, stored where
# it always was; the others live in ``HubRecord.wifi_devices``.
DEFAULT_DEVICE_KEY = "default"
#: Records per hub, the default one included (the Home Assistant number).
MAX_WIFI_DEVICES = 5
#: Keyed devices carry the brand ``c0-<key>``. Home Assistant's managed
#: devices are ``m3-<key>-<hash>``, so neither side takes the other's
#: devices for its own, and the key never changes, so a rename still
#: plans no head commit.
SERVER_BRAND_PREFIX = "c0"
#: How a press can reach the server. What a hub is offered depends on the
#: hub and the settings, see ``CallbackService.transports_for``.
TRANSPORT_HTTP = "http"
TRANSPORT_MQTT = "mqtt"
TRANSPORTS: tuple[str, ...] = (TRANSPORT_HTTP, TRANSPORT_MQTT)
#: The only hub that publishes presses to a broker.
MQTT_HUB_VERSION = "X2"
_MAC_SHAPE = re.compile(r"^[0-9A-Fa-f]{2}([:-]?[0-9A-Fa-f]{2}){5}$")


def brand_for_key(key: str) -> str:
    return DEFAULT_WIFI_BRAND if key == DEFAULT_DEVICE_KEY else f"{SERVER_BRAND_PREFIX}-{key}"


# -- the record -------------------------------------------------------------------


@dataclass
class CallbackRecord:
    """The persisted callback device of one hub (plan section 8).

    ``device_id`` is ``None`` only while a create is pending. ``labels``
    is what presses resolve against and what the library's drift gate
    compares to. ``spec`` and ``target`` are what update and redeploy
    use. ``pending`` is the intent written before a hub write and cleared
    after it; reconciliation reads it at boot.
    """

    device_id: Optional[int]
    spec: dict[str, Any]
    target: dict[str, Any]
    labels: dict[int, str] = field(default_factory=dict)
    hub_version: str = ""
    deployed_at: Optional[str] = None
    adopted: bool = False
    stale: bool = False
    pending: Optional[dict[str, Any]] = None
    last_press: Optional[dict[str, Any]] = None
    key: str = DEFAULT_DEVICE_KEY
    transport: str = "http"

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "transport": self.transport,
            "device_id": self.device_id,
            "spec": dict(self.spec),
            "target": dict(self.target),
            "labels": {str(int(cid)): str(label) for cid, label in sorted(self.labels.items())},
            "hub_version": self.hub_version,
            "deployed_at": self.deployed_at,
            "adopted": self.adopted,
            "stale": self.stale,
            "pending": dict(self.pending) if self.pending else None,
            "last_press": dict(self.last_press) if self.last_press else None,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CallbackRecord":
        labels_raw = data.get("labels") or {}
        device_id = data.get("device_id")
        return cls(
            device_id=int(device_id) if device_id is not None else None,
            spec=dict(data.get("spec") or {}),
            target=dict(data.get("target") or {}),
            labels={int(cid): str(label) for cid, label in labels_raw.items()},
            hub_version=str(data.get("hub_version") or ""),
            deployed_at=data.get("deployed_at"),
            adopted=bool(data.get("adopted", False)),
            stale=bool(data.get("stale", False)),
            pending=dict(data["pending"]) if isinstance(data.get("pending"), dict) else None,
            last_press=dict(data["last_press"]) if isinstance(data.get("last_press"), dict) else None,
            key=str(data.get("key") or DEFAULT_DEVICE_KEY),
            transport=str(data.get("transport") or "http"),
        )

    @classmethod
    def from_deployment(cls, deployment: WifiDeployment, *, adopted: bool = False,
                        key: str = DEFAULT_DEVICE_KEY, transport: str = "http") -> "CallbackRecord":
        return cls(
            device_id=int(deployment.device_id),
            spec=deployment.spec.to_dict(),
            target=deployment.target.to_dict() if deployment.target is not None else {},
            labels=dict(deployment.labels),
            hub_version=deployment.hub_version,
            deployed_at=now_iso(),
            adopted=adopted,
            key=key,
            transport=transport,
        )

    def deployment(self) -> WifiDeployment:
        if self.device_id is None:
            raise ValueError("the callback device is not deployed yet")
        return WifiDeployment(
            device_id=int(self.device_id),
            spec=WifiDeviceSpec.from_dict(self.spec).normalized(),
            target=WifiTarget.from_dict(self.target) if self.transport != TRANSPORT_MQTT else None,
            labels=dict(self.labels),
            hub_version=self.hub_version,
            transport=self.transport,
        )

    @property
    def action_id(self) -> str:
        return str(self.target.get("action_id") or "")

    def view(self, *, effective_destination: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        out = self.to_dict()
        if not out["target"]:
            out["target"] = None                     # an mqtt device calls nothing
        out["deployed"] = self.device_id is not None and not self.stale
        if effective_destination is not None:
            out["effective_destination"] = effective_destination
        return out


# -- presses -------------------------------------------------------------------------


@dataclass(frozen=True)
class Press:
    """One callback from the hub, as the stream and the ring show it."""

    seq: int
    hub_id: str
    device_id: int
    command_id: Optional[int]
    slot: Optional[int]
    label: Optional[str]
    press_type: str
    resolution: Resolution
    transport: str
    source: str
    received_at: str
    #: The key of the Wifi Device the press resolved to; None for ``unknown_device``.
    device_key: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class PressRing:
    """Presses with one monotonic sequence per server instance.

    The sequence is assigned once, under the caller's single-threaded
    loop, before either channel sees the press, so the stream and the
    ring can never disagree on order. ``instance_id`` changes on every
    restart and the ring starts empty: a client that sees a new instance
    treats its history as gone.
    """

    def __init__(self, *, size: int = PRESS_RING_SIZE) -> None:
        self.instance_id = secrets.token_hex(8)
        self._seq = 0
        self._size = size
        self._by_hub: dict[str, deque[Press]] = {}
        # Per hub: the seq of the newest press the ring has evicted. The
        # sequence is shared by every hub, so a gap in one hub's numbers is
        # normal; only an eviction means a client can have missed a press.
        self._evicted_upto: dict[str, int] = {}

    @property
    def last_seq(self) -> int:
        return self._seq

    def append(self, hub_id: str, **fields: Any) -> Press:
        self._seq += 1
        press = Press(seq=self._seq, hub_id=hub_id, **fields)
        ring = self._by_hub.setdefault(hub_id, deque(maxlen=self._size))
        if len(ring) == ring.maxlen:
            self._evicted_upto[hub_id] = ring[0].seq
        ring.append(press)
        return press

    def newest(self, hub_id: str, limit: int) -> list[Press]:
        rows = list(self._by_hub.get(hub_id, ()))
        return rows[-limit:] if limit else rows

    def since(self, hub_id: str, after: int, limit: int) -> tuple[list[Press], bool]:
        """Presses with ``seq > after`` (oldest first), and whether presses
        newer than ``after`` were already evicted (the client missed some)."""

        rows = [row for row in self._by_hub.get(hub_id, ()) if row.seq > after]
        expired = after < self._evicted_upto.get(hub_id, 0)
        return (rows[:limit] if limit else rows), expired

    def forget(self, hub_id: str) -> None:
        self._by_hub.pop(hub_id, None)
        self._evicted_upto.pop(hub_id, None)


# -- the listener -------------------------------------------------------------------


@dataclass(frozen=True)
class ListenerState:
    wanted: bool
    bound: bool
    port: int
    bound_port: Optional[int]
    last_error: Optional[str]
    next_retry_at: Optional[str]


Handler = Callable[[str, str, dict[str, str]], Awaitable[tuple[int, bytes]]]


class CallbackListener:
    """The plain-HTTP server the hub calls back on.

    ``handler(path, source_ip, headers)`` returns ``(status, body)``. The
    listener runs while ``wanted``; a bind failure is remembered, announced
    through ``on_state`` and retried with exponential backoff until it
    succeeds or the listener is no longer wanted.
    """

    def __init__(self, port: int, handler: Handler, *,
                 on_state: Optional[Callable[[str], Any]] = None,
                 retry_min: Optional[float] = None, retry_max: Optional[float] = None) -> None:
        self.port = int(port)
        self._handler = handler
        self._on_state = on_state
        # Resolved at construction so a test can shorten the module values.
        self._retry_min = float(RETRY_MIN_SECONDS if retry_min is None else retry_min)
        self._retry_max = float(RETRY_MAX_SECONDS if retry_max is None else retry_max)
        self._server: Optional[asyncio.AbstractServer] = None
        self._bound_port: Optional[int] = None
        self._wanted = False
        self._last_error: Optional[str] = None
        self._retry_task: Optional[asyncio.Task] = None
        self._next_retry_at: Optional[str] = None
        self._lock = asyncio.Lock()

    # -- state --------------------------------------------------------------

    @property
    def bound(self) -> bool:
        return self._server is not None

    @property
    def bound_port(self) -> Optional[int]:
        return self._bound_port

    def state(self) -> ListenerState:
        return ListenerState(wanted=self._wanted, bound=self.bound, port=self.port, bound_port=self._bound_port,
                             last_error=self._last_error, next_retry_at=self._next_retry_at)

    # -- lifecycle ----------------------------------------------------------

    async def set_wanted(self, wanted: bool) -> None:
        self._wanted = bool(wanted)
        await self.ensure()

    async def ensure(self) -> bool:
        """Bring the socket in line with ``wanted``; True when it is bound."""

        async with self._lock:
            if not self._wanted:
                self._cancel_retry()
                if self._server is not None:
                    await self._close()
                    log.info("callback listener stopped")
                self._last_error = None
                return False
            if self._server is not None:
                return True
            if await self._bind():
                self._cancel_retry()
                self._announce("callback_listener_started")
                return True
            log.warning("callback listener could not bind port %s: %s", self.port, self._last_error)
            self._schedule_retry()
            self._announce("callback_listener_failed")
            return False

    async def retry_now(self) -> bool:
        """An operator's explicit retry: resets the backoff and tries at once."""

        self._cancel_retry()
        return await self.ensure()

    async def stop(self) -> None:
        self._wanted = False
        await self.ensure()

    async def _bind(self) -> bool:
        """Try the socket once (under the lock); remembers the error on failure."""

        try:
            self._server = await asyncio.start_server(self._on_client, host=LISTEN_BIND, port=self.port)
        except OSError as err:
            self._last_error = str(err) or repr(err)
            return False
        sockets = self._server.sockets or ()
        self._bound_port = sockets[0].getsockname()[1] if sockets else self.port
        self._last_error = None
        self._next_retry_at = None
        log.info("callback listener started on port %s", self._bound_port)
        return True

    async def _close(self) -> None:
        server, self._server = self._server, None
        self._bound_port = None
        if server is not None:
            server.close()
            try:
                await server.wait_closed()
            except Exception:  # noqa: BLE001
                log.debug("callback listener close raised", exc_info=True)

    # -- retry -------------------------------------------------------------

    def _schedule_retry(self) -> None:
        if self._retry_task is not None and not self._retry_task.done():
            return
        self._retry_task = asyncio.create_task(self._retry_loop(), name="callback-listener-retry")

    def _cancel_retry(self) -> None:
        task, self._retry_task = self._retry_task, None
        self._next_retry_at = None
        if task is not None and not task.done() and task is not asyncio.current_task():
            task.cancel()

    async def _retry_loop(self) -> None:
        """Exponential backoff from ``retry_min`` to ``retry_max`` while wanted
        and unbound; ends on the first successful bind."""

        from datetime import datetime, timedelta, timezone

        delay = self._retry_min
        try:
            while self._wanted and self._server is None:
                self._next_retry_at = (
                    datetime.now(timezone.utc) + timedelta(seconds=delay)
                ).replace(microsecond=0).isoformat()
                await asyncio.sleep(delay)
                async with self._lock:
                    if not self._wanted or self._server is not None:
                        break
                    if await self._bind():
                        self._announce("callback_listener_started")
                        break
                delay = min(delay * 2, self._retry_max)
        finally:
            self._next_retry_at = None
            if self._retry_task is asyncio.current_task():
                self._retry_task = None

    def _announce(self, kind: str) -> None:
        if self._on_state is None:
            return
        try:
            self._on_state(kind)
        except Exception:  # noqa: BLE001
            log.exception("callback listener state listener failed")

    # -- one connection -----------------------------------------------------

    async def _on_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        peer = writer.get_extra_info("peername")
        source_ip = str(peer[0]) if isinstance(peer, tuple) and peer else ""
        try:
            status, body = await self._serve(reader, source_ip)
        except asyncio.TimeoutError:
            status, body = 408, b"request timeout"
        except Exception:  # noqa: BLE001
            log.exception("callback listener failed to process a request from %s", source_ip or "?")
            status, body = 500, b"internal error"
        try:
            writer.write(_response(status, body))
            await writer.drain()
        except Exception:  # noqa: BLE001
            log.debug("callback listener could not answer %s", source_ip or "?", exc_info=True)
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except Exception:  # noqa: BLE001
                pass

    async def _serve(self, reader: asyncio.StreamReader, source_ip: str) -> tuple[int, bytes]:
        request_line = await asyncio.wait_for(reader.readline(), timeout=READ_TIMEOUT_SECONDS)
        if not request_line:
            return 400, b"bad request"
        if len(request_line) > MAX_REQUEST_LINE_BYTES:
            return 431, b"request headers too large"
        parts = request_line.decode("utf-8", errors="ignore").strip().split()
        if len(parts) != 3:
            return 400, b"bad request"
        method, path, version = parts
        if version not in ("HTTP/1.0", "HTTP/1.1"):
            return 400, b"bad request"
        headers: dict[str, str] = {}
        header_bytes = header_count = 0
        while True:
            line = await asyncio.wait_for(reader.readline(), timeout=READ_TIMEOUT_SECONDS)
            if not line or line in (b"\r\n", b"\n"):
                break
            header_count += 1
            header_bytes += len(line)
            if header_count > MAX_HEADER_COUNT or header_bytes > MAX_HEADER_BYTES:
                return 431, b"request headers too large"
            key, _, value = line.decode("utf-8", errors="ignore").partition(":")
            headers[key.strip().lower()] = value.strip()
        try:
            content_length = int(headers.get("content-length", "0"))
        except (TypeError, ValueError):
            return 400, b"bad request"
        if content_length < 0:
            return 400, b"bad request"
        if content_length > MAX_BODY_BYTES:
            return 413, b"payload too large"
        # The path carries the payload; the body is never consumed.
        if method.upper() != "POST":
            return 405, b"method not allowed"
        return await self._handler(_normalize_path(path), source_ip, headers)


def _normalize_path(path: str) -> str:
    candidate = (path or "").strip()
    if not candidate:
        return "/"
    if "://" in candidate:
        parsed = urlsplit(candidate)
        if parsed.path:
            candidate = parsed.path
            if parsed.query:
                candidate = f"{candidate}?{parsed.query}"
    if not candidate.startswith("/"):
        candidate = "/" + candidate
    return candidate


_REASONS = {
    200: "OK", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
    408: "Request Timeout", 413: "Payload Too Large", 431: "Request Header Fields Too Large",
    500: "Internal Server Error",
}


def _response(status: int, body: bytes) -> bytes:
    return (
        f"HTTP/1.1 {status} {_REASONS.get(status, 'OK')}\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Content-Type: text/plain\r\n"
        "Connection: close\r\n\r\n"
    ).encode("utf-8") + body


@dataclass(frozen=True)
class ParsedPath:
    action_id: str
    device_id: int
    slot_index: int
    press_type: str


def parse_callback_path(path: str) -> Optional[ParsedPath]:
    """``/launch/<action_id>/<device_id>/<index>/<short|long>`` or None."""

    parts = [p for p in path.split("?", 1)[0].strip("/").split("/") if p]
    if any(len(p) > MAX_PATH_SEGMENT_LENGTH for p in parts):
        return None
    if len(parts) < 4 or parts[0] != "launch":
        return None
    if not parts[2].isdigit() or not parts[3].isdigit():
        return None
    press_type = parts[4] if len(parts) >= 5 and parts[4] in ("short", "long") else "short"
    return ParsedPath(action_id=parts[1], device_id=int(parts[2]), slot_index=int(parts[3]), press_type=press_type)


# -- the service -----------------------------------------------------------------


class CallbackDeviceExists(RuntimeError):
    pass


class CallbackDeviceMissing(KeyError):
    pass


class CallbackDeviceStale(RuntimeError):
    """The device is flagged stale; only a redeploy applies."""


class CallbackDeviceNotStale(RuntimeError):
    pass


class CallbackDeviceReferenced(RuntimeError):
    def __init__(self, references: list[dict[str, Any]]) -> None:
        super().__init__(f"the callback device is referenced by {len(references)} activity(ies)")
        self.references = references


class CallbackPortRefused(ValueError):
    """An X1 can only call port 8060."""


class WifiDeviceLimit(RuntimeError):
    """The hub already holds ``MAX_WIFI_DEVICES`` records."""


class MqttUnavailable(RuntimeError):
    """The mqtt transport was asked for where it cannot work; the message says why."""


class CallbackService:
    """Everything callback-device related, one instance per server."""

    def __init__(self, manager: HubManager, settings: Settings, *,
                 ring: Optional[PressRing] = None,
                 listener_factory: Callable[..., CallbackListener] = CallbackListener) -> None:
        self._manager = manager
        self._settings = settings
        self.ring = ring or PressRing()
        self._press_listeners: list[Callable[[Press], Any]] = []
        self._verify_tasks: dict[str, asyncio.Task] = {}
        self.listener = listener_factory(settings.callback_port, self.handle_callback, on_state=self._on_listener_state)
        # The broker: the command line / environment when they set any of it,
        # else what the control panel stored in mqtt.json (mqtt_config.py).
        self.mqtt_store = MqttConfigStore(settings.data_dir)
        # (A Settings built in code, as the tests do, has nothing pinned: its host counts as startup too.)
        if startup_pinned(settings) or settings.mqtt_host:
            self.mqtt_source = "startup"
            self.mqtt_config = MqttConfig.from_settings(settings)
        else:
            stored = self.mqtt_store.load()
            self.mqtt_source = "panel" if stored is not None and stored.configured else "none"
            self.mqtt_config = stored if stored is not None and stored.configured else MqttConfig()
        self.mqtt = self._subscriber(self.mqtt_config)
        manager.on_hub_event(self._on_hub_event)
        manager.on_server_event(self._on_server_event)

    def _subscriber(self, config: MqttConfig) -> MqttSubscriber:
        return MqttSubscriber(
            host=config.host, port=config.effective_port, username=config.username, password=config.password,
            tls=config.tls, tls_ca=config.tls_ca, tls_insecure=config.tls_insecure, client_id=config.client_id,
            on_message=self.handle_mqtt_message, on_state=self._on_listener_state,
        )

    @property
    def mqtt_editable(self) -> bool:
        """The panel may change the broker unless the command line / environment set it."""

        return self.mqtt_source != "startup"

    async def apply_mqtt_config(self, config: Optional[MqttConfig]) -> None:
        """Store (or with None, forget) the panel's broker and reconnect with it now."""

        if not self.mqtt_editable:
            raise RuntimeError("the broker is set where the server starts")
        if config is None or not config.configured:
            self.mqtt_store.clear()
            self.mqtt_config, self.mqtt_source = MqttConfig(), "none"
        else:
            self.mqtt_store.save(config)
            self.mqtt_config, self.mqtt_source = config, "panel"
        await self.mqtt.stop()
        self.mqtt = self._subscriber(self.mqtt_config)
        await self.mqtt.set_topics(set(self._mqtt_topics()))

    def mqtt_device_count(self) -> int:
        return sum(1 for hub_id in self._manager.ids() for record in self.records(hub_id)
                   if record.transport == TRANSPORT_MQTT)

    # -- lifecycle -----------------------------------------------------------

    async def start(self) -> None:
        """After the hubs started: reconcile pending intents, then the listener."""

        for hub_id in self._manager.ids():
            for record in self.records(hub_id):
                if record.pending is None:
                    continue
                try:
                    proxy = self._manager.proxy(hub_id)
                except (HubNotFound, HubDisabled):
                    log.info("hub %s: pending callback %s left for later (hub not running)", hub_id, record.pending.get("op"))
                    break
                try:
                    await self.reconcile(hub_id, proxy, key=record.key)
                except Exception:  # noqa: BLE001
                    log.exception("hub %s: callback reconciliation at boot failed; left pending", hub_id)
        await self.ensure_listener()

    async def stop(self) -> None:
        for task in list(self._verify_tasks.values()):
            task.cancel()
        await self.listener.stop()
        await self.mqtt.stop()

    def on_press(self, listener: Callable[[Press], Any]) -> None:
        self._press_listeners.append(listener)

    # -- records -------------------------------------------------------------

    def record(self, hub_id: str, key: str = DEFAULT_DEVICE_KEY) -> Optional[CallbackRecord]:
        try:
            row = self._manager.record(hub_id)
        except HubNotFound:
            return None
        raw = row.callback_device if key == DEFAULT_DEVICE_KEY else row.wifi_devices.get(key)
        if not isinstance(raw, dict):
            return None
        record = CallbackRecord.from_dict(raw)
        record.key = key
        return record

    def records(self, hub_id: str) -> list[CallbackRecord]:
        """Every managed device of the hub: the default one first, then by key order of creation."""

        try:
            row = self._manager.record(hub_id)
        except HubNotFound:
            return []
        keys = ([DEFAULT_DEVICE_KEY] if isinstance(row.callback_device, dict) else []) + list(row.wifi_devices)
        return [record for record in (self.record(hub_id, key) for key in keys) if record is not None]

    def _store(self, hub_id: str, record: Optional[CallbackRecord], key: str) -> None:
        row = self._manager.record(hub_id)
        if key == DEFAULT_DEVICE_KEY:
            row.callback_device = record.to_dict() if record is not None else None
        elif record is None:
            row.wifi_devices.pop(key, None)
        else:
            row.wifi_devices[key] = record.to_dict()

    def save(self, hub_id: str, record: Optional[CallbackRecord], key: Optional[str] = None) -> None:
        """Persist ``record`` under its own key; ``None`` drops the record under ``key``."""

        self._store(hub_id, record, record.key if record is not None else (key or DEFAULT_DEVICE_KEY))
        self._manager.persist()

    def new_key(self, hub_id: str) -> str:
        taken = {record.key for record in self.records(hub_id)}
        while True:
            key = secrets.token_hex(4)
            if key not in taken:
                return key

    def check_limit(self, hub_id: str) -> None:
        if len(self.records(hub_id)) >= MAX_WIFI_DEVICES:
            raise WifiDeviceLimit(f"a hub holds at most {MAX_WIFI_DEVICES} Wifi Devices")

    def wanted(self) -> bool:
        """The listener is needed while a device calls it; an mqtt device never does."""

        return any(record.transport != TRANSPORT_MQTT for hub_id in self._manager.ids() for record in self.records(hub_id))

    async def ensure_listener(self) -> None:
        """Bring both ingresses in line with the records: the listener, and the broker subscriptions."""

        await self.listener.set_wanted(self.wanted())
        await self.mqtt.set_topics(set(self._mqtt_topics()))

    # -- mqtt ---------------------------------------------------------------------

    def mqtt_state(self) -> MqttState:
        return self.mqtt.state()

    def mqtt_topic_for(self, hub_id: str) -> Optional[str]:
        """``<MAC>/up``, the MAC in upper-case hex: the form the hub publishes on (a lower-case
        topic stays silent). None while the hub's MAC is not known."""

        try:
            row = self._manager.record(hub_id)
        except HubNotFound:
            return None
        for candidate in (row.config.mac, hub_id):
            # A hub id is the MAC once known and the host before that; only the MAC shape counts
            # (an address like 192.168.100.250 is twelve hex digits too).
            if _MAC_SHAPE.match(str(candidate or "").strip()):
                return f"{mac_key(str(candidate)).upper()}/up"
        return None

    def _mqtt_topics(self) -> dict[str, str]:
        """topic -> hub id, for every enabled hub with a device on the mqtt transport."""

        topics: dict[str, str] = {}
        for hub_id in self._manager.ids():
            if not self._manager.record(hub_id).enabled:
                continue
            if any(record.transport == TRANSPORT_MQTT for record in self.records(hub_id)):
                topic = self.mqtt_topic_for(hub_id)
                if topic is not None:
                    topics[topic] = hub_id
        return topics

    def mqtt_unavailable_reason(self, hub_id: str, hub_version: Optional[str]) -> Optional[str]:
        if not self.mqtt.configured:
            return ("the server has no MQTT broker (set one in the control panel under Server settings > MQTT broker, "
                    "or start it with --mqtt-host)")
        if str(hub_version or "") != MQTT_HUB_VERSION:
            return f"only an {MQTT_HUB_VERSION} publishes presses to a broker; this hub is {hub_version or 'of an unknown model'}"
        if self.mqtt_topic_for(hub_id) is None:
            return "the hub's MAC is not known yet, so its topic is not either"
        return None

    def transports_for(self, hub_id: str, hub_version: Optional[str]) -> list[str]:
        """What a new device on this hub may use, the preferred one first (mqtt is the faster
        delivery where it exists, as in the Home Assistant card)."""

        if self.mqtt_unavailable_reason(hub_id, hub_version) is None:
            return [TRANSPORT_MQTT, TRANSPORT_HTTP]
        return [TRANSPORT_HTTP]

    def handle_mqtt_message(self, topic: str, payload: bytes, retain: bool) -> None:
        """One publish on a subscribed topic. A retained message is never a press: the hub retains
        nothing, so it is a broker or a bridge replaying an old one. A device that is not ours is
        someone's own MQTT device from the Sofabaton app, and none of our business."""

        if retain:
            log.debug("mqtt: dropped a retained message on %s", topic)
            return
        hub_id = self._mqtt_topics().get(topic)
        if hub_id is None:
            return
        try:
            data = json.loads(payload.decode("utf-8"))
            device_id, key_id = int(data["device_id"]), int(data["key_id"])
        except (ValueError, KeyError, TypeError, UnicodeDecodeError):
            log.info("mqtt: %s: not a press: %r", topic, payload[:80])
            return
        record = next((row for row in self.records(hub_id)
                       if row.transport == TRANSPORT_MQTT and row.device_id == device_id), None)
        if record is None:
            log.debug("mqtt: %s: device %s is not a server-managed mqtt device", topic, device_id)
            return
        # The hub publishes the command id of the record it executed; our layout puts the long
        # records at slot + WIFI_SLOT_COUNT, so the id read back says which press it was.
        if 1 <= key_id <= WIFI_SLOT_COUNT:
            parsed = ParsedPath(action_id="", device_id=device_id, slot_index=key_id - 1, press_type="short")
        elif WIFI_SLOT_COUNT < key_id <= 2 * WIFI_SLOT_COUNT:
            parsed = ParsedPath(action_id="", device_id=device_id, slot_index=key_id - WIFI_SLOT_COUNT - 1, press_type="long")
        else:
            parsed = ParsedPath(action_id="", device_id=device_id, slot_index=key_id - 1, press_type="short")
        self._record_press(hub_id, parsed, "", transport=TRANSPORT_MQTT)

    def listener_state(self) -> ListenerState:
        return self.listener.state()

    # -- addresses -------------------------------------------------------------

    def action_id_for(self, hub_id: str) -> str:
        """The hub's action id as the library builds callback paths: its MAC."""

        for record in self.records(hub_id):
            if record.action_id:
                return record.action_id
        try:
            config = self._manager.record(hub_id).config
        except HubNotFound:
            return hub_id
        return mac_key(config.mac) if config.mac else hub_id

    def target_for(self, proxy: AsyncXProxy) -> tuple[str, int]:
        """The effective callback destination: settings, else the routed local IP."""

        host = self._settings.callback_host or proxy.local_address()
        port = self.listener.bound_port or self._settings.callback_port
        return host, int(port)

    # -- the press pipeline ---------------------------------------------------

    async def handle_callback(self, path: str, source_ip: str, headers: dict[str, str]) -> tuple[int, bytes]:
        parsed = parse_callback_path(path)
        if parsed is None:
            log.warning("callback: unrecognized path %s from %s", path, source_ip or "?")
            return 404, b"not found"
        hub_id = self._hub_for_action(parsed.action_id)
        if hub_id is None:
            log.warning("callback: no hub matches action id %s (from %s)", parsed.action_id, source_ip or "?")
            return 404, b"unknown hub"
        source = self._effective_source(source_ip, headers)
        expected = self._hub_address(hub_id)
        if expected is not None and source and source != expected:
            log.warning("callback: hub %s request from unexpected address %s (expected %s)", hub_id, source, expected)
            return 403, b"forbidden"
        self._record_press(hub_id, parsed, source or source_ip)
        return 200, b"ok"

    def _hub_for_action(self, action_id: str) -> Optional[str]:
        wanted = action_id.lower()
        for hub_id in self._manager.ids():
            record = self._manager.record(hub_id)
            if not record.enabled:
                continue
            if self.action_id_for(hub_id).lower() == wanted or hub_id.lower() == wanted:
                return hub_id
        return None

    def _hub_address(self, hub_id: str) -> Optional[str]:
        """The hub's address as the proxy dials it, when it is an IP literal."""

        try:
            host = str(self._manager.record(hub_id).config.host or "").strip()
        except HubNotFound:
            return None
        try:
            return str(ipaddress.ip_address(host))
        except ValueError:
            return None      # a hostname: nothing to compare the peer against

    def _effective_source(self, source_ip: str, headers: dict[str, str]) -> str:
        """The peer, or the forwarded client when the peer is a trusted proxy."""

        forwarded = headers.get("x-forwarded-for", "")
        if not forwarded or not source_ip:
            return source_ip
        try:
            peer = ipaddress.ip_address(source_ip)
        except ValueError:
            return source_ip
        for trusted in self._settings.trusted_proxies:
            try:
                network = ipaddress.ip_network(trusted, strict=False)
            except ValueError:
                continue
            if peer in network:
                return forwarded.split(",", 1)[0].strip()
        return source_ip

    def _record_press(self, hub_id: str, parsed: ParsedPath, source: str, *, transport: str = TRANSPORT_HTTP) -> Press:
        record = next((row for row in self.records(hub_id) if row.device_id == parsed.device_id), None)
        slot = parsed.slot_index + 1
        command_id: Optional[int] = None
        label: Optional[str] = None
        resolution: Resolution
        if record is None:
            resolution = "unknown_device"
        else:
            if 1 <= slot <= WIFI_SLOT_COUNT:
                command_id = slot + (WIFI_SLOT_COUNT if parsed.press_type == "long" else 0)
                label = record.labels.get(command_id)
            if command_id is None or label is None:
                resolution = "unknown_slot"
                command_id = None
            else:
                resolution = "stale" if record.stale else "deployed"
        press = self.ring.append(
            hub_id,
            device_id=parsed.device_id, command_id=command_id, slot=slot if command_id is not None else None,
            label=label, press_type=parsed.press_type, resolution=resolution, transport=transport,
            source=source, received_at=now_iso(), device_key=record.key if record is not None else None,
        )
        if record is not None:
            record.last_press = {"seq": press.seq, "received_at": press.received_at}
            # In memory only: a press must not cost a hubs.json write.
            self._store(hub_id, record, record.key)
        log.info("%s press: hub %s device %s slot %s %s -> %s", transport, hub_id, parsed.device_id, slot,
                 parsed.press_type, resolution)
        for listener in list(self._press_listeners):
            try:
                listener(press)
            except Exception:  # noqa: BLE001
                log.exception("press listener failed")
        return press

    # -- deploy / update / remove / redeploy (job bodies) ---------------------------

    def spec_from_body(self, body: dict[str, Any], *, key: str = DEFAULT_DEVICE_KEY) -> WifiDeviceSpec:
        slots = tuple(
            WifiSlotSpec.from_dict(row) if isinstance(row, dict) else WifiSlotSpec(label=str(row))
            for row in (body.get("slots") or ())
        )
        return WifiDeviceSpec(
            name=str(body.get("name") or "Server"),
            slots=slots,
            power_on_slot=body.get("power_on_slot"),
            power_off_slot=body.get("power_off_slot"),
            input_slots=tuple(body.get("input_slots") or ()),
            brand=brand_for_key(key),
        ).normalized()

    def check_port(self, hub_version: Optional[str]) -> None:
        port = self.listener.bound_port or self._settings.callback_port
        if str(hub_version or "") == "X1" and int(port) != X1_CALLBACK_PORT:
            raise CallbackPortRefused(
                f"an X1 hub always calls back on port {X1_CALLBACK_PORT}; the listener uses {port}"
            )

    async def deploy(self, hub_id: str, proxy: AsyncXProxy, spec: WifiDeviceSpec, *,
                     key: str = DEFAULT_DEVICE_KEY, transport: str = "http") -> CallbackRecord:
        """Job body: reconcile, adopt an orphan, else create; persist around the write."""

        existing = self.record(hub_id, key)
        if existing is not None and existing.device_id is not None:
            raise CallbackDeviceExists("a callback device is already deployed on this hub")
        if existing is None:
            self.check_limit(hub_id)
        adopted = await self.reconcile(hub_id, proxy, key=key, spec_hint=spec)
        if adopted is not None and adopted.device_id is not None:
            await self.ensure_listener()
            return adopted
        if transport == TRANSPORT_MQTT:
            return await self._deploy_mqtt(hub_id, proxy, spec, key=key)
        # The listener comes up before the target is computed, so the port
        # baked into the records is the one actually bound (a failed bind
        # falls back to the configured port and the retry loop takes over).
        await self.listener.set_wanted(True)
        host, port = self.target_for(proxy)
        self.check_port((await proxy.status()).hub_version)
        pending = CallbackRecord(device_id=None, spec=spec.to_dict(),
                                 target={"host": host, "port": port, "action_id": self.action_id_for(hub_id)},
                                 pending={"op": "create", "started_at": now_iso()}, key=key, transport=transport)
        self.save(hub_id, pending)
        try:
            deployment = await proxy.deploy_wifi_device(spec, host=host, port=port)
        except Exception:
            # The intent stays pending: reconciliation decides at the next
            # deploy or boot whether the hub took the device after all.
            await self.ensure_listener()
            raise
        record = CallbackRecord.from_deployment(deployment, key=key, transport=transport)
        self.save(hub_id, record)
        await self.ensure_listener()
        return record

    async def _deploy_mqtt(self, hub_id: str, proxy: AsyncXProxy, spec: WifiDeviceSpec, *, key: str) -> CallbackRecord:
        """An mqtt device names no address: no listener, no target, no port rule."""

        reason = self.mqtt_unavailable_reason(hub_id, (await proxy.status()).hub_version)
        if reason is not None:
            raise MqttUnavailable(reason)
        pending = CallbackRecord(device_id=None, spec=spec.to_dict(), target={},
                                 pending={"op": "create", "started_at": now_iso()}, key=key, transport=TRANSPORT_MQTT)
        self.save(hub_id, pending)
        deployment = await proxy.deploy_wifi_device(spec, transport=TRANSPORT_MQTT)
        record = CallbackRecord.from_deployment(deployment, key=key, transport=TRANSPORT_MQTT)
        self.save(hub_id, record)
        await self.ensure_listener()
        return record

    async def update(self, hub_id: str, proxy: AsyncXProxy, spec: WifiDeviceSpec, *,
                     key: str = DEFAULT_DEVICE_KEY, progress: Optional[Callable[..., Any]] = None) -> CallbackRecord:
        record = self.record(hub_id, key)
        if record is None or record.device_id is None:
            raise CallbackDeviceMissing(hub_id)
        if record.stale:
            raise CallbackDeviceStale("the callback device is stale; redeploy it")
        record.pending = {"op": "update", "started_at": now_iso(), "spec": spec.to_dict()}
        self.save(hub_id, record)
        try:
            deployment = await proxy.update_wifi_device(record.deployment(), spec, progress=progress)
        finally:
            # Whatever happened, the next update resumes through the
            # library's drift rule; the intent has no other use.
            fresh = self.record(hub_id, key)
            if fresh is not None and fresh.pending is not None and fresh.pending.get("op") == "update":
                fresh.pending = None
                self.save(hub_id, fresh)
        updated = CallbackRecord.from_deployment(deployment, key=key, transport=record.transport)
        updated.deployed_at = record.deployed_at
        updated.adopted = record.adopted
        updated.last_press = record.last_press
        self.save(hub_id, updated)
        return updated

    @staticmethod
    def owned_references(spec: Optional[WifiDeviceSpec]) -> dict[int, dict[str, set[int]]]:
        """What the spec's own slots put into activities, per activity: the
        favorited command ids and the claimed buttons. A delete takes these
        with it by design (wifi commands plan, section 6), so they never ask
        for ``force``; an activity that appears here is one the spec joined."""

        owned: dict[int, dict[str, set[int]]] = {}
        if spec is None:
            return owned
        for index, slot in enumerate(spec.normalized().slots, start=1):
            for activity_id in slot.activities:
                mine = owned.setdefault(int(activity_id), {"favorites": set(), "buttons": set()})
                if slot.favorite:
                    mine["favorites"].add(index)
                if slot.button is not None:
                    mine["buttons"].add(int(slot.button))
            if slot.input_activity_id is not None:
                owned.setdefault(int(slot.input_activity_id), {"favorites": set(), "buttons": set()})
        return owned

    def references(self, snapshot: Any, device_id: int, *, spec: Optional[WifiDeviceSpec] = None) -> list[dict[str, Any]]:
        """Activities in the snapshot that name the device: membership,
        favorites, bindings, macro steps. Unfetched activities cannot be
        scanned and are reported as ``complete: False``.

        The steps a membership itself puts into an activity's power macros
        (power on, input, power off) are the membership, not a macro
        reference. With ``spec``, only what its slots did not put there is
        reported, row by row: a favorite or a button the spec does not
        name is foreign even in an activity the spec joined."""

        owned = self.owned_references(spec)
        power_macros = (0xC6, 0xC7)
        found: list[dict[str, Any]] = []
        for payload in (snapshot.bundle.get("activities") or []):
            if not isinstance(payload, dict):
                continue
            block = payload.get("device") or {}
            activity_id = int(block.get("device_id") or 0)
            mine = owned.get(activity_id)
            kinds: list[str] = []
            if device_id in [int(m) for m in payload.get("referenced_source_device_ids") or []] and mine is None:
                kinds.append("member")
            if any(int(s.get("device_id") or 0) == device_id
                   and (mine is None or int(s.get("command_id") or 0) not in mine["favorites"])
                   for s in payload.get("favorite_slots") or []):
                kinds.append("favorite")
            if any((int(r.get("device_id") or 0) == device_id or int(r.get("long_press_device_id") or 0) == device_id)
                   and (mine is None or int(r.get("button_id") or 0) not in mine["buttons"])
                   for r in payload.get("button_bindings") or []):
                kinds.append("binding")
            if any(int(step.get("device_id") or 0) == device_id
                   for macro in payload.get("macros") or []
                   if int(macro.get("button_id", macro.get("key_id", 0)) or 0) not in power_macros
                   for step in macro.get("steps") or []):
                kinds.append("macro")
            if kinds:
                found.append({"activity_id": activity_id, "name": block.get("name"),
                              "kinds": kinds, "complete": bool(payload.get("complete", False))})
        return found

    async def remove(self, hub_id: str, proxy: AsyncXProxy, *, key: str = DEFAULT_DEVICE_KEY) -> dict[str, Any]:
        record = self.record(hub_id, key)
        if record is None:
            raise CallbackDeviceMissing(hub_id)
        device_id = record.device_id
        removed: dict[str, Any] = {"key": key, "device_id": device_id, "hub_device_removed": False}
        if device_id is not None:
            snap = await proxy.snapshot()
            present = snap.entity("device", device_id) is not None
            if present:
                record.pending = {"op": "delete", "started_at": now_iso()}
                self.save(hub_id, record)
                result = await proxy.remove_device(device_id)
                removed["hub_device_removed"] = True
                removed["impacted_activity_ids"] = list(result.impacted_activity_ids)
        self.save(hub_id, None, key)
        if not self.records(hub_id):
            self.ring.forget(hub_id)
        await self.ensure_listener()
        return removed

    async def redeploy(self, hub_id: str, proxy: AsyncXProxy, *, key: str = DEFAULT_DEVICE_KEY) -> CallbackRecord:
        record = self.record(hub_id, key)
        if record is None or record.device_id is None:
            raise CallbackDeviceMissing(hub_id)
        if not record.stale:
            raise CallbackDeviceNotStale("the callback device is not stale")
        spec = WifiDeviceSpec.from_dict(record.spec).normalized()
        # The device may have come back under a verified identity.
        if await self._verify_identity(proxy, record.device_id, spec, self.action_id_for(hub_id), transport=record.transport):
            record.stale = False
            self.save(hub_id, record)
            return record
        self.save(hub_id, None, key)
        return await self.deploy(hub_id, proxy, spec, key=key, transport=record.transport)

    # -- reconciliation and identity ------------------------------------------------

    async def reconcile(self, hub_id: str, proxy: AsyncXProxy, *, key: str = DEFAULT_DEVICE_KEY,
                        spec_hint: Optional[WifiDeviceSpec] = None) -> Optional[CallbackRecord]:
        """Settle a pending intent, or adopt an orphan the server forgot.

        Returns the record after reconciliation (None when there is none).
        Runs inside a job, before every deploy and at boot.
        """

        record = self.record(hub_id, key)
        action_id = self.action_id_for(hub_id)
        if record is None:
            if key != DEFAULT_DEVICE_KEY:
                # A keyed device is born with a fresh key in its brand, so no
                # device on the hub can be its orphan.
                return None
            # No record at all: any device carrying our callback path is an
            # orphan (a lost data directory, a crash before the first save),
            # whatever it is called; the requested name does not narrow it.
            return await self._adopt(hub_id, proxy, action_id, name=None)
        pending = record.pending
        if pending is None:
            return record
        op = str(pending.get("op") or "")
        if op == "create":
            spec = WifiDeviceSpec.from_dict(pending.get("spec") or record.spec).normalized()
            adopted = await self._adopt(hub_id, proxy, action_id, name=spec.name, spec=spec,
                                        key=key, transport=record.transport)
            if adopted is None:
                log.info("hub %s: the pending callback create never landed; dropping it", hub_id)
                self.save(hub_id, None, key)
                return None
            return adopted
        if op == "update":
            record.pending = None
            self.save(hub_id, record)
            return record
        if op == "delete":
            snap = await proxy.snapshot()
            if record.device_id is not None and snap.entity("device", record.device_id) is None:
                log.info("hub %s: the pending callback delete had landed; dropping the record", hub_id)
                self.save(hub_id, None, key)
                return None
            record.pending = None
            self.save(hub_id, record)
            return record
        record.pending = None
        self.save(hub_id, record)
        return record

    async def _adopt(self, hub_id: str, proxy: AsyncXProxy, action_id: str, *,
                     name: Optional[str], spec: Optional[WifiDeviceSpec] = None,
                     key: str = DEFAULT_DEVICE_KEY, transport: str = "http") -> Optional[CallbackRecord]:
        """Find a device the server created and forgot; take it over by identity."""

        snap = await proxy.snapshot()
        held = {row.device_id for row in self.records(hub_id) if row.key != key and row.device_id is not None}
        candidates = []
        for payload in snap.bundle.get("devices") or []:
            block = (payload or {}).get("device") or {}
            if str(block.get("brand") or "") != (spec.brand if spec else brand_for_key(key)):
                continue
            if int(block.get("device_id") or 0) in held:
                continue
            if name is not None and str(block.get("name") or "") != name:
                continue
            candidates.append((int(block.get("device_id") or 0), payload))
        for device_id, payload in candidates:
            if transport == TRANSPORT_MQTT:
                # Inert records carry no path to recognise; the brand carries the record's own key
                # and the class says what kind of device it is, which is identity enough.
                if str(((payload or {}).get("device") or {}).get("device_class") or "") != "wifi_mqtt":
                    continue
                target: Optional[WifiTarget] = None
            else:
                blob = await self._identity_blob(proxy, device_id, action_id)
                if blob is None:
                    continue
                host, port = self._target_from_blob(blob, payload, proxy)
                target = WifiTarget(host=host, port=port, action_id=action_id)
            adopted_spec = spec or self._spec_from_live(payload)
            labels = self._labels_from_live(payload, adopted_spec)
            deployment = WifiDeployment(
                device_id=device_id, spec=adopted_spec, target=target,
                labels=labels, hub_version=str((await proxy.status()).hub_version or ""), transport=transport,
            )
            record = CallbackRecord.from_deployment(deployment, adopted=True, key=key, transport=transport)
            self.save(hub_id, record)
            log.info("hub %s: adopted callback device %s by identity", hub_id, device_id)
            return record
        return None

    async def _verify_identity(self, proxy: AsyncXProxy, device_id: int, spec: WifiDeviceSpec, action_id: str, *,
                               transport: str = TRANSPORT_HTTP) -> bool:
        snap = await proxy.snapshot()
        entity = snap.entity("device", device_id)
        if entity is None:
            return False
        for payload in snap.bundle.get("devices") or []:
            block = (payload or {}).get("device") or {}
            if int(block.get("device_id") or 0) != device_id:
                continue
            if str(block.get("brand") or "") != spec.brand or str(block.get("name") or "") != spec.name:
                return False
            if transport == TRANSPORT_MQTT:
                return str(block.get("device_class") or "") == "wifi_mqtt"
            return await self._identity_blob(proxy, device_id, action_id) is not None
        return False

    async def _identity_blob(self, proxy: AsyncXProxy, device_id: int, action_id: str) -> Optional[bytes]:
        """The first short record's bytes when they carry our callback path."""

        try:
            payload = await proxy.read_payload(device_id, 1)
        except Exception as err:  # noqa: BLE001
            log.info("identity check of device %s failed to read its first record: %s", device_id, err)
            return None
        if payload is None:
            return None
        blob = bytes(payload.blob)
        marker = f"launch/{action_id}/{device_id}/0/short".encode("ascii")
        return blob if marker in blob else None

    @staticmethod
    def _spec_from_live(payload: dict[str, Any]) -> WifiDeviceSpec:
        block = payload.get("device") or {}
        labels = {int(r.get("command_id") or 0): str(r.get("name") or r.get("command_label") or "")
                  for r in payload.get("commands") or [] if isinstance(r, dict)}
        slots = tuple(
            WifiSlotSpec(label=labels.get(i) or f"Button {i}", long_label=labels.get(i + WIFI_SLOT_COUNT) or None)
            for i in range(1, WIFI_SLOT_COUNT + 1)
        )
        return WifiDeviceSpec(name=str(block.get("name") or "Server"), slots=slots,
                              brand=str(block.get("brand") or DEFAULT_WIFI_BRAND)).normalized()

    @staticmethod
    def _labels_from_live(payload: dict[str, Any], spec: WifiDeviceSpec) -> dict[int, str]:
        from sofabaton.wifi_device import labels_from_spec
        labels = labels_from_spec(spec)
        for row in payload.get("commands") or []:
            if not isinstance(row, dict) or row.get("command_id") is None:
                continue
            cid = int(row.get("command_id"))
            live = str(row.get("name") or row.get("command_label") or "")
            if cid in labels and live:
                labels[cid] = live
        return labels

    def _target_from_blob(self, blob: bytes, payload: dict[str, Any], proxy: AsyncXProxy) -> tuple[str, int]:
        """The address the adopted device calls: the wifi_ip record's Host
        line, else the Roku head's IP on 8060, else what a deploy would use now."""

        text = blob.decode("ascii", errors="ignore")
        for line in text.splitlines():
            if line.lower().startswith("host:"):
                host_port = line.split(":", 1)[1].strip()
                host, _, port = host_port.rpartition(":")
                if host and port.isdigit():
                    try:
                        ipaddress.IPv4Address(host)
                        return host, int(port)
                    except ValueError:
                        break
        block = payload.get("device") or {}
        head_ip = str(block.get("ip_address") or "").strip()
        if head_ip:
            return head_ip, X1_CALLBACK_PORT
        return self.target_for(proxy)

    # -- stale detection ---------------------------------------------------------------

    def _on_hub_event(self, hub_id: str, event: HubEvent) -> None:
        if event.kind != "snapshot_changed":
            return
        if not any(row.device_id is not None and row.pending is None for row in self.records(hub_id)):
            return
        try:
            proxy = self._manager.proxy(hub_id)
        except (HubNotFound, HubDisabled):
            return
        task = self._verify_tasks.get(hub_id)
        if task is not None and not task.done():
            return
        self._verify_tasks[hub_id] = asyncio.create_task(self._check_stale(hub_id, proxy), name=f"callback-stale:{hub_id}")

    async def _check_stale(self, hub_id: str, proxy: AsyncXProxy) -> None:
        for row in self.records(hub_id):
            if row.device_id is not None and row.pending is None:
                await self._check_stale_one(hub_id, proxy, row.key)

    async def _check_stale_one(self, hub_id: str, proxy: AsyncXProxy, key: str) -> None:
        try:
            record = self.record(hub_id, key)
            if record is None or record.device_id is None:
                return
            snap = await proxy.snapshot()
            present = snap.entity("device", record.device_id) is not None
            if not present and not record.stale:
                record.stale = True
                self.save(hub_id, record)
                log.warning("hub %s: callback device %s is gone from the hub; marked stale", hub_id, record.device_id)
                self._manager.emit_server_event("callback_device_stale", hub_id)
            elif present and record.stale:
                # The same numeric id is not proof; verify before clearing.
                spec = WifiDeviceSpec.from_dict(record.spec).normalized()
                if await self._verify_identity(proxy, record.device_id, spec, self.action_id_for(hub_id),
                                               transport=record.transport):
                    fresh = self.record(hub_id, key)
                    if fresh is not None and fresh.stale:
                        fresh.stale = False
                        self.save(hub_id, fresh)
                        log.info("hub %s: callback device %s is back; stale cleared", hub_id, record.device_id)
                        self._manager.emit_server_event("callback_device_restored", hub_id)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("hub %s: stale check failed", hub_id)

    def _on_server_event(self, hub_id: str, kind: str) -> None:
        if kind not in ("hub_removed", "hub_disabled", "hub_enabled", "hub_added"):
            return
        if kind == "hub_removed":
            self.ring.forget(hub_id)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        loop.create_task(self.ensure_listener(), name="callback-listener-ensure")

    def _on_listener_state(self, kind: str) -> None:
        for hub_id in self._manager.ids():
            if self.records(hub_id):
                self._manager.emit_server_event(kind, hub_id)
