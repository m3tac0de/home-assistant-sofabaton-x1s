"""``/server/settings``: the three host-side ports and the allowed browser
origins, as the control panel edits them.

The same three the Home Assistant integration asks for in its port
step: the hub listener (TCP), the app discovery port (UDP) and the
callback listener (HTTP, the Wifi command port). A change is written to
``server.json`` and takes effect on the next start; the listeners are
process-wide and are not rebound live. A setting that came from the
environment or a CLI flag wins over ``server.json``, so it is reported
as pinned and refused.

``allowed_origins`` (auth plan, section 5) is the exception to "next
start": the Origin guard and the CORS layer read it live, so a change
applies at once as well as being saved.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from . import API_PREFIX
from .access import OriginPolicy
from .config import (
    DEFAULT_APP_DISCOVERY_PORT,
    DEFAULT_CALLBACK_PORT,
    DEFAULT_HUB_LISTEN_PORT,
    EDITABLE_PORTS,
    Settings,
    normalize_origins,
    settings_file_values,
    write_settings_file,
)
from .models import Problem
from .problems import ApiProblem

router = APIRouter(prefix=f"{API_PREFIX}/server", tags=["server"])

_DEFAULTS = {
    "hub_listen_port": DEFAULT_HUB_LISTEN_PORT,
    "app_discovery_port": DEFAULT_APP_DISCOVERY_PORT,
    "callback_port": DEFAULT_CALLBACK_PORT,
}


class PortSetting(BaseModel):
    """One port: what runs now, what the next start will use, and where from."""

    running: int
    configured: int = Field(description="the value the next start uses (pinned, else server.json, else the default)")
    default: int
    pinned: bool = Field(description="set by an environment variable or CLI flag; server.json cannot change it")


class OriginsSetting(BaseModel):
    """The browser origins on another host or port that get CORS and pass the Origin guard."""

    value: list[str] = Field(description="in effect now (a change applies at once, no restart)")
    pinned: bool = Field(description="set by an environment variable or CLI flag; server.json cannot change it")


class ServerSettingsView(BaseModel):
    hub_listen_port: PortSetting
    app_discovery_port: PortSetting
    callback_port: PortSetting
    allowed_origins: OriginsSetting
    restart_required: bool


class ServerSettingsUpdate(BaseModel):
    """Body of ``PUT /server/settings``; omitted ports are left as they are."""

    hub_listen_port: Optional[int] = Field(None, ge=1, le=65535)
    app_discovery_port: Optional[int] = Field(None, ge=1, le=65535)
    callback_port: Optional[int] = Field(None, ge=1, le=65535)
    allowed_origins: Optional[list[str]] = Field(
        None, max_length=64,
        description="exact origins such as http://nas:8123 (no path, no wildcard); an empty list removes them all",
    )


def _view(settings: Settings, policy: Optional[OriginPolicy] = None) -> ServerSettingsView:
    stored = settings_file_values(settings.data_dir)
    ports: dict[str, PortSetting] = {}
    for name in EDITABLE_PORTS:
        running = int(getattr(settings, name))
        pinned = name in settings.pinned
        configured = running if pinned else int(stored.get(name, _DEFAULTS[name]))
        ports[name] = PortSetting(running=running, configured=configured, default=_DEFAULTS[name], pinned=pinned)
    origins = OriginsSetting(
        value=sorted(policy.allowed) if policy is not None else sorted(settings.allowed_origins),
        pinned="allowed_origins" in settings.pinned,
    )
    return ServerSettingsView(**ports, allowed_origins=origins,
                              restart_required=any(p.running != p.configured for p in ports.values()))


@router.get("/settings", operation_id="getServerSettings", response_model=ServerSettingsView,
            summary="The hub listener, app discovery and callback ports")
async def get_server_settings(request: Request) -> ServerSettingsView:
    return _view(request.app.state.settings, request.app.state.origin_policy)


@router.put("/settings", operation_id="updateServerSettings", response_model=ServerSettingsView,
            summary="Save port changes to server.json (applied on the next start)",
            responses={409: {"model": Problem}, 422: {"model": Problem}})
async def update_server_settings(request: Request, body: ServerSettingsUpdate) -> ServerSettingsView:
    settings: Settings = request.app.state.settings
    policy: OriginPolicy = request.app.state.origin_policy
    changes = body.model_dump(exclude_none=True)
    current = _view(settings, policy)
    origins: Optional[tuple[str, ...]] = None
    if "allowed_origins" in changes:
        try:
            origins = normalize_origins(changes.pop("allowed_origins"))
        except ValueError as err:
            raise ApiProblem(422, "invalid_origin", "Not an origin", detail=str(err)) from None
        if sorted(origins) == current.allowed_origins.value:
            origins = None
        elif "allowed_origins" in settings.pinned:
            raise ApiProblem(409, "setting_pinned", "Set by an environment variable or CLI flag",
                             detail="allowed_origins cannot be changed here; change it where the server is started")
    changes = {k: v for k, v in changes.items() if v != getattr(current, k).configured}
    pinned = sorted(k for k in changes if k in settings.pinned)
    if pinned:
        raise ApiProblem(409, "setting_pinned", "Set by an environment variable or CLI flag",
                         detail=f"{', '.join(pinned)} cannot be changed here; change it where the server is started")
    # The two TCP listeners and the API itself cannot share a port.
    tcp = {
        "hub_listen_port": changes.get("hub_listen_port", current.hub_listen_port.configured),
        "callback_port": changes.get("callback_port", current.callback_port.configured),
    }
    if tcp["hub_listen_port"] == tcp["callback_port"]:
        raise ApiProblem(422, "port_conflict", "Two listeners on one port",
                         detail=f"hub_listen_port and callback_port are both {tcp['callback_port']}")
    for name, port in tcp.items():
        if port == settings.port:
            raise ApiProblem(422, "port_conflict", "Two listeners on one port",
                             detail=f"{name} {port} is the API port")
    to_write: dict = dict(changes)
    if origins is not None:
        to_write["allowed_origins"] = list(origins)
    if to_write:
        try:
            write_settings_file(settings.data_dir, to_write)
        except (OSError, ValueError) as err:
            raise ApiProblem(500, "settings_write_failed", "Could not write server.json", detail=str(err)) from None
    if origins is not None:
        policy.set_allowed(origins)
    return _view(settings, policy)
