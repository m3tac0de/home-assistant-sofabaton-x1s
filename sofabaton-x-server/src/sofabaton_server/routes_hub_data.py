"""``/api/v1/hubs/{hub_id}/...``: reads and control on one hub (plan section 7, S2).

Every handler resolves the hub's running proxy, translates the
library's typed errors through ``hub_errors``, and returns the
library's own dataclasses so the schema has one source. Entity ids are
checked against the cached catalog first: the hub never answers a read
for an id it does not have, so without that check a typo would surface
as a gateway timeout instead of a 404.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from sofabaton import (
    HUB_VERSION_X2,
    Activity,
    AsyncXProxy,
    Button,
    Command,
    Device,
    Favorite,
    HubInfo,
    HubStatus,
    IrEmitterDevice,
    Macro,
    RunningActivity,
)

from . import API_PREFIX
from .manager import HubDisabled, HubManager, HubNotFound
from .models import Problem
from .problems import ApiProblem, entity_not_found, hub_disabled, hub_errors, hub_not_found

log = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/hubs/{{hub_id}}", tags=["hub"])

_HUB_ERRORS: dict[int | str, dict[str, Any]] = {
    404: {"model": Problem}, 409: {"model": Problem}, 503: {"model": Problem}, 504: {"model": Problem},
}


@dataclass(frozen=True)
class HubStatusView:
    """``GET /hubs/{id}/status``: the server's enabled flag beside the library status."""

    hub_id: str
    enabled: bool
    status: Optional[HubStatus]


@dataclass(frozen=True)
class Accepted:
    """Result of a control call: the hub took it (True) or refused it."""

    accepted: bool
    mode: str


@dataclass(frozen=True)
class DevicePowerState:
    """``GET /hubs/{id}/devices/{did}/power-state``: a fresh read of one power byte."""

    device_id: int
    power_state: Optional[int]


@dataclass(frozen=True)
class IrEmitterStatusView:
    """``GET /hubs/{id}/ir-emitters``: the paired remotes and repeaters an X2
    can send a device's IR from.

    ``paired`` lists them (single-button RF devices left out), null when
    the hub did not answer the read or when there was no read yet.
    ``read_at`` is when the list was read (epoch seconds), null when there
    was no read yet. The hub's own emitter and both IR ports are always
    available to route to, so they are not listed."""

    paired: Optional[list[IrEmitterDevice]]
    read_at: Optional[float]


class SendCommand(BaseModel):
    entity_id: int = Field(ge=0, description="activity id (101+) or device id")
    command_id: int = Field(ge=0, description="command id, macro id, or button code")


# -- helpers -------------------------------------------------------------------


def _manager(request: Request) -> HubManager:
    return request.app.state.hub_manager


def _proxy(request: Request, hub_id: str) -> AsyncXProxy:
    try:
        return _manager(request).proxy(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
    except HubDisabled:
        raise hub_disabled(hub_id) from None


async def _require_device(proxy: AsyncXProxy, hub_id: str, device_id: int) -> None:
    async with hub_errors(hub_id):
        ids = {d.device_id for d in await proxy.devices()}
    if device_id not in ids:
        raise entity_not_found(hub_id, "device", device_id)


async def _require_activity(proxy: AsyncXProxy, hub_id: str, activity_id: int) -> None:
    async with hub_errors(hub_id):
        ids = {a.activity_id for a in await proxy.activities()}
    if activity_id not in ids:
        raise entity_not_found(hub_id, "activity", activity_id)


async def _require_entity(proxy: AsyncXProxy, hub_id: str, entity_id: int) -> None:
    async with hub_errors(hub_id):
        ids = {a.activity_id for a in await proxy.activities()} | {d.device_id for d in await proxy.devices()}
    if entity_id not in ids:
        raise entity_not_found(hub_id, "entity", entity_id)


def _log_control(request: Request, hub_id: str, what: str, accepted: bool) -> None:
    client = request.client.host if request.client else "?"
    log.info("control %s hub=%s from=%s accepted=%s", what, hub_id, client, accepted)


async def _accepted(request: Request, proxy: AsyncXProxy, hub_id: str, what: str, ok: bool) -> Accepted:
    _log_control(request, hub_id, what, ok)
    st = await proxy.status()
    if not ok:
        raise ApiProblem(409, "send_refused", "The hub refused the command",
                         detail="the proxy does not own the hub right now", hub_id=hub_id, mode=st.mode)
    return Accepted(accepted=True, mode=st.mode)


# -- status and identity ----------------------------------------------------------


@router.get("/status", operation_id="getHubStatus", response_model=HubStatusView,
            summary="Live connection state (pure state read)", responses={404: {"model": Problem}})
async def get_status(request: Request, hub_id: str) -> HubStatusView:
    manager = _manager(request)
    try:
        view = await manager.view(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
    return HubStatusView(hub_id=view.hub_id, enabled=view.enabled, status=view.status)


@router.get("/info", operation_id="getHubInfo", response_model=HubInfo,
            summary="Hub identity from the connect banner", responses=_HUB_ERRORS)
async def get_info(request: Request, hub_id: str,
                   refresh: bool = Query(False, description="re-read the banner (needs control mode)")) -> HubInfo:
    proxy = _proxy(request, hub_id)
    async with hub_errors(hub_id):
        return await proxy.hub_info(refresh=refresh)


# -- catalogs -------------------------------------------------------------------


@router.get("/activities", operation_id="listActivities", response_model=list[Activity],
            summary="Activities", responses=_HUB_ERRORS)
async def list_activities(request: Request, hub_id: str) -> list[Activity]:
    proxy = _proxy(request, hub_id)
    async with hub_errors(hub_id):
        return await proxy.activities()


@router.get("/devices", operation_id="listDevices", response_model=list[Device],
            summary="Devices (with power state as of the last fetch)", responses=_HUB_ERRORS)
async def list_devices(request: Request, hub_id: str,
                       refresh: bool = Query(False, description="re-fetch the device list from the hub (fresh power state)")) -> list[Device]:
    proxy = _proxy(request, hub_id)
    async with hub_errors(hub_id):
        # Fetch-then-prune in the library: a refused or failed refresh
        # raises and leaves the cached catalog in place.
        return await proxy.devices(refresh=refresh)


@router.get("/devices/{device_id}/commands", operation_id="listDeviceCommands", response_model=list[Command],
            summary="A device's commands", responses=_HUB_ERRORS)
async def list_device_commands(request: Request, hub_id: str, device_id: int) -> list[Command]:
    proxy = _proxy(request, hub_id)
    await _require_device(proxy, hub_id, device_id)
    async with hub_errors(hub_id):
        return await proxy.commands(device_id)


@router.get("/devices/{device_id}/power-state", operation_id="getDevicePowerState", response_model=DevicePowerState,
            summary="Fresh read of one device's power state", responses=_HUB_ERRORS)
async def get_device_power_state(request: Request, hub_id: str, device_id: int) -> DevicePowerState:
    """A hub round-trip on purpose: the device list is re-read (the
    protocol's only read of the power byte), then the one row is
    projected. ``power_state`` is 0 off / 1 on, or null when the row
    carried no parseable record; a power macro commits the byte with a
    short lag, so a caller that just fired must not expect an immediate
    flip. A read the hub never answers is a 504, not a null."""

    proxy = _proxy(request, hub_id)
    await _require_device(proxy, hub_id, device_id)
    async with hub_errors(hub_id):
        devices = await proxy.devices(refresh=True)
    row = next((d for d in devices if d.device_id == device_id), None)
    if row is None:
        raise entity_not_found(hub_id, "device", device_id)
    state = row.power_state
    return DevicePowerState(device_id=device_id, power_state=state if state in (0, 1) else None)


@router.get("/ir-emitters", operation_id="getIrEmitters", response_model=IrEmitterStatusView,
            summary="The remotes and repeaters an X2 can send a device's IR from",
            description="X2 only (409 `not_x2` on another hub). Without `refresh` this returns the last read "
                        "without asking the hub (both fields null before the first one); `refresh=true` reads "
                        "the hub's paired-device list now, which takes a few seconds and needs control mode. "
                        "A device's routing is its `emitters` in the device list and `device.extras` in the "
                        "snapshot; change it with `PUT .../devices/{did}`. The routing applies to commands "
                        "sent to the device; a payload play always fires from the hub's own emitters.",
            responses=_HUB_ERRORS)
async def get_ir_emitters(request: Request, hub_id: str,
                          refresh: bool = Query(False, description="read the paired-device list from the hub now "
                                                                   "(a few seconds; needs control mode)")) -> IrEmitterStatusView:
    proxy = _proxy(request, hub_id)
    st = await proxy.status()
    if not st.hub_version:
        # The model comes with the connect banner: before it, the facade
        # cannot tell an X2 from another hub.
        raise ApiProblem(503, "hub_not_connected", "Hub is not connected",
                         detail="the hub's model is not known until it connects", hub_id=hub_id, mode=st.mode)
    if st.hub_version != HUB_VERSION_X2:
        raise ApiProblem(409, "not_x2", "IR emitter routing exists on the X2 only",
                         detail=f"this hub is an {st.hub_version}", hub_id=hub_id, mode=st.mode)
    async with hub_errors(hub_id):
        status = await proxy.ir_emitter_status(refresh=refresh)
    if status is None:
        return IrEmitterStatusView(paired=None, read_at=None)
    return IrEmitterStatusView(paired=list(status.paired) if status.paired is not None else None,
                               read_at=status.read_at)


@router.get("/entities/{entity_id}/buttons", operation_id="listEntityButtons", response_model=list[Button],
            summary="Buttons bound on an activity or device", responses=_HUB_ERRORS)
async def list_entity_buttons(request: Request, hub_id: str, entity_id: int) -> list[Button]:
    proxy = _proxy(request, hub_id)
    await _require_entity(proxy, hub_id, entity_id)
    async with hub_errors(hub_id):
        return await proxy.buttons(entity_id)


@router.get("/activities/{activity_id}/macros", operation_id="listActivityMacros", response_model=list[Macro],
            summary="An activity's macros", responses=_HUB_ERRORS)
async def list_activity_macros(request: Request, hub_id: str, activity_id: int) -> list[Macro]:
    proxy = _proxy(request, hub_id)
    await _require_activity(proxy, hub_id, activity_id)
    async with hub_errors(hub_id):
        return await proxy.macros(activity_id)


@router.get("/activities/{activity_id}/favorites", operation_id="listActivityFavorites", response_model=list[Favorite],
            summary="An activity's favorites", responses=_HUB_ERRORS)
async def list_activity_favorites(request: Request, hub_id: str, activity_id: int) -> list[Favorite]:
    proxy = _proxy(request, hub_id)
    await _require_activity(proxy, hub_id, activity_id)
    async with hub_errors(hub_id):
        return await proxy.favorites(activity_id)


@router.get("/activity", operation_id="getRunningActivity", response_model=Optional[RunningActivity],
            summary="The running activity, or null when the hub is idle", responses={404: {"model": Problem}, 409: {"model": Problem}})
async def get_running_activity(request: Request, hub_id: str) -> Optional[RunningActivity]:
    proxy = _proxy(request, hub_id)
    st = await proxy.status()
    return st.running_activity


# -- control --------------------------------------------------------------------


@router.post("/activities/{activity_id}/start", operation_id="startActivity", response_model=Accepted,
             summary="Switch to an activity", responses=_HUB_ERRORS)
async def start_activity(request: Request, hub_id: str, activity_id: int) -> Accepted:
    proxy = _proxy(request, hub_id)
    await _require_activity(proxy, hub_id, activity_id)
    ok = await proxy.start_activity(activity_id)
    return await _accepted(request, proxy, hub_id, f"start_activity {activity_id}", ok)


@router.post("/activities/{activity_id}/stop", operation_id="stopActivity", response_model=Accepted,
             summary="Power off an activity", responses=_HUB_ERRORS)
async def stop_activity(request: Request, hub_id: str, activity_id: int) -> Accepted:
    proxy = _proxy(request, hub_id)
    await _require_activity(proxy, hub_id, activity_id)
    ok = await proxy.stop_activity(activity_id)
    return await _accepted(request, proxy, hub_id, f"stop_activity {activity_id}", ok)


@router.post("/send", operation_id="sendCommand", response_model=Accepted,
             summary="Send a command or button to an activity or device", responses=_HUB_ERRORS)
async def send_command(request: Request, hub_id: str, body: SendCommand) -> Accepted:
    proxy = _proxy(request, hub_id)
    await _require_entity(proxy, hub_id, body.entity_id)
    ok = await proxy.send(body.entity_id, body.command_id)
    return await _accepted(request, proxy, hub_id, f"send {body.entity_id}/{body.command_id}", ok)


@router.post("/find-remote", operation_id="findRemote", response_model=Accepted,
             summary="Make the remote beep", responses=_HUB_ERRORS)
async def find_remote(request: Request, hub_id: str) -> Accepted:
    proxy = _proxy(request, hub_id)
    ok = await proxy.find_remote()
    return await _accepted(request, proxy, hub_id, "find_remote", ok)


@router.post("/resync-remote", operation_id="resyncRemote", response_model=Accepted,
             summary="Make the physical remotes run a full sync with the hub",
             description="The hub pushes configuration writes to its remotes on its own; this is the manual "
                         "trigger for a remote that missed them. Refused with 409 while a job holds the hub: "
                         "a trigger in the middle of a write restarts the remote's sync, and the writes that "
                         "need one send it themselves when they finish.",
             responses=_HUB_ERRORS)
async def resync_remote(request: Request, hub_id: str) -> Accepted:
    proxy = _proxy(request, hub_id)
    runner = getattr(request.app.state, "job_runner", None)
    active = runner.active(hub_id) if runner is not None else None
    if active is not None and active.status in ("queued", "running"):
        raise ApiProblem(409, "hub_job_running", "A job holds the hub",
                         detail=f"job {active.job_id} ({active.kind}) is {active.status}; wait for it to finish",
                         hub_id=hub_id)
    ok = bool(await proxy.resync_remote())
    return await _accepted(request, proxy, hub_id, "resync_remote", ok)
