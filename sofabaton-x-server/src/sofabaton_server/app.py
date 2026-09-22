"""FastAPI application factory.

Wires settings, hub management, discovery, jobs, callbacks, REST routes
and the WebSocket lifecycle. The OpenAPI document uses stable operation
IDs, named components, the advertised server URL and any root path for
generated clients.
"""

from __future__ import annotations

import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional

from fastapi import FastAPI

from . import API_PREFIX, API_VERSION, __version__
from .callbacks import CallbackService, ListenerState
from .mqtt_client import MqttState
from .backup_stage import BackupStage
from .config import Settings
from .discovery import DiscoveryService
from .jobs import JobRunner
from .manager import HubManager
from .problems import install as install_problem_handler, problem_body
from .routes_callbacks import router as callbacks_router, server_router as callback_listener_router
from .routes_apply import router as apply_router
from .routes_discovery import router as discovery_router
from .routes_edit import router as edit_router
from .routes_hub_data import router as hub_data_router
from .routes_hubs import router as hubs_router
from .routes_payload import router as payload_router
from .routes_settings import router as settings_router
from .routes_snapshot import router as snapshot_router
from .store import ApplyStore
from .routes_ui import router as ui_router, ui_pages_router
from .ws import WS_MESSAGE_TYPES, EventRelay, WsPress, router as events_router

# ``sofabaton`` is the library's import name (PyPI: sofabaton-x). Only
# its version is needed at the skeleton stage; the hub manager (S1) is
# where AsyncXProxy comes in.
from sofabaton import __version__ as library_version



@dataclass(frozen=True)
class ServerInfo:
    """What ``GET /api/v1/server`` returns (and what the mDNS TXT says, in full)."""

    name: str
    version: str
    library_version: str
    api_version: str
    api_path: str
    hubs: int
    uptime_seconds: float
    base_url: str | None = None
    features: list[str] = field(default_factory=list)
    # Minted at boot; the press sequence and ring belong to it.
    instance_id: str = ""
    callback_listener: ListenerState | None = None
    # The broker connection for X2 Wifi Devices on the mqtt transport; never the password.
    mqtt: MqttState | None = None


def create_app(settings: Settings | None = None, *, manager: Optional[HubManager] = None,
               discovery: Optional[DiscoveryService] = None,
               ws_queue_size: Optional[int] = None,
               callbacks: Optional[CallbackService] = None,
               backup_keep_seconds: Optional[float] = None) -> FastAPI:
    """Build the application. ``manager`` is injectable for tests; by
    default one is created from the settings and started with the app."""

    settings = settings or Settings()
    started = time.monotonic()
    hub_manager = manager or HubManager(settings)
    discovery_service = discovery or DiscoveryService(settings, hub_manager)
    job_runner = JobRunner(problem_for=problem_body)
    hub_manager.jobs = job_runner
    # Before the event relay: a finished backup is announced with its expiry set.
    backup_stage = BackupStage(job_runner, **({"keep_seconds": backup_keep_seconds} if backup_keep_seconds is not None else {}))
    callback_service = callbacks or CallbackService(hub_manager, settings)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        # Discovery first: it owns the shared Zeroconf the proxies adopt.
        await discovery_service.start()
        await hub_manager.start()
        # Then the callback devices: pending intents reconcile against
        # the running hubs, and the listener comes up when any exist.
        await callback_service.start()
        try:
            yield
        finally:
            await job_runner.shutdown()
            backup_stage.close()
            await callback_service.stop()
            await hub_manager.stop()
            await discovery_service.stop()

    app = FastAPI(
        lifespan=lifespan,
        title="sofabaton-x-server",
        version=__version__,
        description=(
            "REST + WebSocket over the sofabaton-x library for Sofabaton "
            "X1 / X1S / X2 hubs. LAN service; no authentication in v1."
        ),
        root_path=settings.root_path,
        # An advertised URL already carries any public prefix, so it must
        # be the one and only servers entry; without one, FastAPI's own
        # root-path entry is the best hint a client gets.
        servers=[{"url": settings.advertise_url}] if settings.advertise_url else None,
        root_path_in_servers=not bool(settings.advertise_url),
        openapi_url=f"{API_PREFIX}/openapi.json",
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
    )
    app.state.settings = settings
    app.state.hub_manager = hub_manager
    app.state.discovery = discovery_service
    app.state.job_runner = job_runner
    app.state.backup_stage = backup_stage
    app.state.apply_store = ApplyStore(settings.data_dir, keep=settings.apply_keep)
    relay = EventRelay(hub_manager, jobs=job_runner, **({"maxsize": ws_queue_size} if ws_queue_size else {}))
    relay.instance_id = callback_service.ring.instance_id
    callback_service.on_press(lambda press: relay.publish(press.hub_id, WsPress(**press.to_dict())))
    app.state.event_relay = relay
    app.state.callbacks = callback_service
    install_problem_handler(app)
    app.include_router(hubs_router)
    app.include_router(callbacks_router)
    app.include_router(callback_listener_router)
    app.include_router(settings_router)
    app.include_router(hub_data_router)
    app.include_router(snapshot_router)
    app.include_router(edit_router)
    app.include_router(apply_router)
    app.include_router(payload_router)
    app.include_router(events_router)
    app.include_router(discovery_router)
    app.include_router(ui_router)
    app.include_router(ui_pages_router)
    _publish_ws_components(app)


    @app.get(
        f"{API_PREFIX}/server",
        operation_id="getServerInfo",
        response_model=ServerInfo,
        summary="Identify the server",
        tags=["server"],
    )
    async def get_server_info() -> ServerInfo:
        return ServerInfo(
            name="sofabaton-x-server",
            version=__version__,
            library_version=library_version,
            api_version=API_VERSION,
            api_path=API_PREFIX,
            hubs=_hub_count(app),
            uptime_seconds=round(time.monotonic() - started, 1),
            base_url=settings.advertise_url,
            features=(["discovery"] if discovery_service.enabled else []) + ["callbacks"]
                     + (["mqtt"] if callback_service.mqtt.configured else []),
            instance_id=callback_service.ring.instance_id,
            callback_listener=callback_service.listener_state(),
            mqtt=callback_service.mqtt_state(),
        )

    return app


def _hub_count(app: FastAPI) -> int:
    manager: Any = getattr(app.state, "hub_manager", None)
    return int(manager.count()) if manager is not None else 0


def _publish_ws_components(app: FastAPI) -> None:
    """Add the WebSocket message types to the OpenAPI components.

    OpenAPI cannot describe a WebSocket route, but generated clients
    still want the message types. The document's ``info.description``
    points at the endpoint; the schemas ride along as components under
    their dataclass names.
    """

    from pydantic import TypeAdapter

    default_openapi = app.openapi

    def openapi() -> dict:
        if app.openapi_schema:
            return app.openapi_schema
        spec = default_openapi()
        components = spec.setdefault("components", {}).setdefault("schemas", {})
        for message_type in WS_MESSAGE_TYPES:
            schema = TypeAdapter(message_type).json_schema(
                mode="serialization", ref_template="#/components/schemas/{model}"
            )
            for name, definition in schema.pop("$defs", {}).items():
                components.setdefault(name, definition)
            components[message_type.__name__] = schema
        # The document is committed and compared byte for byte, so nothing
        # in it may depend on the framework version: FastAPI's default 422
        # description changed wording between releases, and its
        # HTTPValidationError body is not what this app sends. Every 422
        # the app can produce is a Problem (the validation handler in
        # problems.py makes that true for bad input too), so the contract
        # states its own description and schema.
        problem_ref = {"$ref": "#/components/schemas/Problem"}
        for operations in spec.get("paths", {}).values():
            for operation in operations.values():
                responses = operation.get("responses", {}) if isinstance(operation, dict) else {}
                if "422" in responses:
                    responses["422"] = {
                        "description": "Validation error",
                        "content": {"application/json": {"schema": problem_ref}},
                    }
        for orphan in ("HTTPValidationError", "ValidationError"):
            components.pop(orphan, None)
        blank = chr(10) + chr(10)
        spec["info"]["description"] = (
            spec["info"].get("description", "")
            + blank
            + f"WebSocket: `{API_PREFIX}/events` (optional `?hub_id=` filter, repeatable) streams "
            "WsHello once, then WsHubEvent / WsServerEvent / WsJobEvent / WsPress / WsDropped messages (see components)."
        )
        app.openapi_schema = spec
        return spec

    app.openapi = openapi  # type: ignore[method-assign]
