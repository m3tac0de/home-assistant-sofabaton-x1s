"""``/api/v1/events``: one WebSocket stream for every hub (plan section 7, S3).

Message shapes (JSON objects, ``type`` discriminates):

* ``hello``        sent once on connect: server identity and the hub list
* ``hub_event``    a relayed library ``HubEvent`` with its ``hub_id``
* ``server_event`` the server's own lifecycle: hub added / removed /
                   enabled / disabled / rekeyed (``kind``) for ``hub_id``
* ``job_event``    a job on ``hub_id`` started, reported progress, or
                   finished (the full ``JobView``)
* ``dropped``      this client fell behind and ``count`` older messages
                   were discarded (sent before the next message that
                   does get through)

Each client owns a bounded queue; a slow consumer loses the oldest
messages rather than stalling the relay or the hub proxies. The
library's per-hub ``seq`` is passed through untouched; the server adds
no counter of its own. ``?hub_id=`` (repeatable) narrows the stream to
those hubs. Inbound text is read and ignored; closing the socket ends
the subscription. The protocol-level ping is uvicorn's.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Optional

from fastapi import APIRouter, Query, Request, WebSocket, WebSocketDisconnect

from sofabaton import HubEvent

from . import API_PREFIX, API_VERSION, __version__
from .jobs import JobRunner, JobView
from .models import light_job
from .manager import HubManager

log = logging.getLogger(__name__)

DEFAULT_QUEUE_SIZE = 256


# -- message types (also published as OpenAPI components) -----------------------


@dataclass(frozen=True)
class WsHubSummary:
    hub_id: str
    enabled: bool


@dataclass(frozen=True)
class WsHello:
    server_version: str
    api_version: str
    hubs: list[WsHubSummary]
    # Minted at boot; a client that sees a new one treats press history
    # (the ``press`` sequence and the REST ring) as gone.
    instance_id: str = ""
    type: Literal["hello"] = "hello"


@dataclass(frozen=True)
class WsHubEvent:
    hub_id: str
    event: HubEvent
    type: Literal["hub_event"] = "hub_event"


@dataclass(frozen=True)
class WsServerEvent:
    hub_id: str
    kind: str
    type: Literal["server_event"] = "server_event"


@dataclass(frozen=True)
class WsDropped:
    count: int
    type: Literal["dropped"] = "dropped"


@dataclass(frozen=True)
class WsJobEvent:
    hub_id: str
    job: JobView
    type: Literal["job_event"] = "job_event"


@dataclass(frozen=True)
class WsPress:
    """A button press the hub delivered to the callback listener.

    ``seq`` is the server-instance press sequence shared with
    ``GET /hubs/{id}/presses`` (de-duplicate across the two channels by
    it; resume with ``?after=``). ``resolution`` says how the press was
    matched to the callback device: ``deployed`` (label from the record),
    ``stale`` (the record is flagged stale), ``unknown_slot`` (outside the
    record), ``unknown_device`` (no record for that device id).
    """

    seq: int
    hub_id: str
    device_id: int
    command_id: Optional[int]
    slot: Optional[int]
    label: Optional[str]
    press_type: str
    resolution: str
    transport: str
    source: str
    received_at: str
    type: Literal["press"] = "press"


WS_MESSAGE_TYPES = (WsHello, WsHubEvent, WsServerEvent, WsJobEvent, WsPress, WsDropped)


def _to_json(message: Any) -> dict[str, Any]:
    if isinstance(message, WsHubEvent):
        return {"type": message.type, "hub_id": message.hub_id, "event": message.event.to_dict()}
    if isinstance(message, WsJobEvent):
        return {"type": message.type, "hub_id": message.hub_id, "job": message.job.to_dict()}
    return asdict(message)


# -- relay ------------------------------------------------------------------------


class Subscription:
    def __init__(self, maxsize: int, hub_ids: Optional[set[str]]) -> None:
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=maxsize)
        self.hub_ids = hub_ids
        self.dropped = 0

    def wants(self, hub_id: str) -> bool:
        return self.hub_ids is None or hub_id in self.hub_ids

    def offer(self, message: Any) -> None:
        if self.queue.full():
            try:
                self.queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self.dropped += 1
        self.queue.put_nowait(message)


class EventRelay:
    """Fans the manager's hub and server events out to WebSocket clients."""

    def __init__(self, manager: HubManager, *, jobs: Optional[JobRunner] = None,
                 maxsize: int = DEFAULT_QUEUE_SIZE) -> None:
        self._manager = manager
        self.maxsize = maxsize
        self.instance_id = ""
        self._subs: set[Subscription] = set()
        manager.on_hub_event(self._on_hub_event)
        manager.on_server_event(self._on_server_event)
        manager.on_rekey(self._on_rekey)
        if jobs is not None:
            jobs.on_job_event(self._on_job_event)

    @property
    def subscribers(self) -> int:
        return len(self._subs)

    def subscribe(self, hub_ids: Optional[set[str]] = None) -> Subscription:
        sub = Subscription(self.maxsize, hub_ids)
        self._subs.add(sub)
        return sub

    def unsubscribe(self, sub: Subscription) -> None:
        self._subs.discard(sub)

    def _on_hub_event(self, hub_id: str, event: HubEvent) -> None:
        self._broadcast(hub_id, WsHubEvent(hub_id=hub_id, event=event))

    def _on_server_event(self, hub_id: str, kind: str) -> None:
        self._broadcast(hub_id, WsServerEvent(hub_id=hub_id, kind=kind))

    def _on_job_event(self, hub_id: str, job: JobView) -> None:
        # A copy: the runner keeps mutating its view as the job proceeds.
        # Without a backup's bundle: megabytes do not belong on the stream.
        self._broadcast(hub_id, WsJobEvent(hub_id=hub_id, job=light_job(job)))

    def _on_rekey(self, old_id: str, new_id: str) -> None:
        # A filter on the temporary host id follows the hub to its MAC,
        # so such a client sees the hub_rekeyed that comes next and
        # everything after it.
        for sub in list(self._subs):
            if sub.hub_ids is not None and old_id in sub.hub_ids:
                sub.hub_ids = (sub.hub_ids - {old_id}) | {new_id}

    def _broadcast(self, hub_id: str, message: Any) -> None:
        for sub in list(self._subs):
            if sub.wants(hub_id):
                sub.offer(message)

    def publish(self, hub_id: str, message: Any) -> None:
        """Send a prepared message (a ``WsPress``) to the hub's subscribers."""

        self._broadcast(hub_id, message)

    def hello(self) -> WsHello:
        return WsHello(
            server_version=__version__,
            api_version=API_VERSION,
            hubs=[WsHubSummary(hub_id=r.hub_id, enabled=r.enabled)
                  for r in (self._manager.record(h) for h in self._manager.ids())],
            instance_id=self.instance_id,
        )


# -- route ----------------------------------------------------------------------------

router = APIRouter(tags=["events"])


@router.websocket(f"{API_PREFIX}/events")
async def events_socket(
    websocket: WebSocket,
    hub_id: Optional[list[str]] = Query(None, description="only these hubs (repeatable)"),
) -> None:
    relay: EventRelay = websocket.app.state.event_relay
    await websocket.accept()
    sub = relay.subscribe(set(hub_id) if hub_id else None)
    client = websocket.client.host if websocket.client else "?"
    log.info("events: client %s subscribed (filter=%s)", client, sorted(sub.hub_ids) if sub.hub_ids else "all")

    async def pump() -> None:
        while True:
            message = await sub.queue.get()
            if sub.dropped:
                count, sub.dropped = sub.dropped, 0
                await websocket.send_json(_to_json(WsDropped(count=count)))
            await websocket.send_json(_to_json(message))

    await websocket.send_json(_to_json(relay.hello()))
    sender = asyncio.create_task(pump())
    try:
        while True:
            await websocket.receive_text()          # inbound is ignored in v1
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        log.debug("events: client %s connection error", client, exc_info=True)
    finally:
        sender.cancel()
        try:
            await sender
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            pass
        relay.unsubscribe(sub)
        log.info("events: client %s gone", client)
