"""``/api/v1/hubs``: records and lifecycle (plan section 7, S1 rows)."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from . import API_PREFIX
from .manager import HubConflict, HubManager, HubNotFound, HubStartFailed
from .models import HubCreate, HubView, Problem
from .problems import ApiProblem, hub_not_found, hub_start_failed

router = APIRouter(prefix=f"{API_PREFIX}/hubs", tags=["hubs"])


def manager_of(request: Request) -> HubManager:
    return request.app.state.hub_manager


def _refuse_while_job_runs(request: Request, hub_id: str) -> None:
    """A disable or remove must not pull the proxy from under a running
    job (a restore keeps writing in its executor thread; review of
    635ecfe, finding 3). Cancel or wait for the job first."""

    runner = getattr(request.app.state, "job_runner", None)
    active = runner.active(hub_id) if runner is not None else None
    if active is not None and active.status in ("queued", "running"):
        raise ApiProblem(
            409, "hub_job_running", "A job holds the hub",
            detail=f"job {active.job_id} ({active.kind}) is {active.status}; "
                   f"{'cancel it or ' if active.cancellable else ''}wait for it to finish",
            hub_id=hub_id,
        )


@router.get("", operation_id="listHubs", response_model=list[HubView], summary="List configured hubs")
async def list_hubs(request: Request) -> list[HubView]:
    return await manager_of(request).views()


@router.post(
    "",
    operation_id="addHub",
    response_model=HubView,
    status_code=status.HTTP_201_CREATED,
    summary="Register a hub",
    responses={409: {"model": Problem}, 422: {"model": Problem}, 503: {"model": Problem}},
)
async def add_hub(request: Request, body: HubCreate) -> HubView:
    manager = manager_of(request)
    try:
        config = body.to_config()
    except ValueError as err:
        raise ApiProblem(422, "invalid_hub_config", "Invalid hub configuration", detail=str(err)) from err
    try:
        record = await manager.add(config, enabled=body.enabled)
    except HubConflict as err:
        raise ApiProblem(409, "hub_conflict", "Hub already registered or not a hub",
                         detail=str(err), hub_id=err.existing_hub_id) from err
    except HubStartFailed as err:
        # The record was persisted; the proxy could not start. Enable retries.
        raise hub_start_failed(err.hub_id, err.cause) from err
    return await manager.view(record.hub_id)


@router.get("/{hub_id}", operation_id="getHub", response_model=HubView, summary="One configured hub",
            responses={404: {"model": Problem}})
async def get_hub(request: Request, hub_id: str) -> HubView:
    try:
        return await manager_of(request).view(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None


@router.delete("/{hub_id}", operation_id="removeHub", status_code=status.HTTP_204_NO_CONTENT,
               summary="Forget a hub (stops and releases it first)", responses={404: {"model": Problem}, 409: {"model": Problem}})
async def remove_hub(request: Request, hub_id: str) -> Response:
    _refuse_while_job_runs(request, hub_id)
    try:
        await manager_of(request).remove(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
    return Response(status_code=204)


@router.post("/{hub_id}/enable", operation_id="enableHub", response_model=HubView,
             summary="Reconnect a disabled hub", responses={404: {"model": Problem}, 503: {"model": Problem}})
async def enable_hub(request: Request, hub_id: str) -> HubView:
    manager = manager_of(request)
    try:
        await manager.enable(hub_id)
        return await manager.view(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
    except HubStartFailed as err:
        raise hub_start_failed(err.hub_id, err.cause) from err


@router.post("/{hub_id}/proxy/enable", operation_id="enableHubProxy", response_model=HubView,
             summary="Let the official app reach the hub through the server",
             responses={404: {"model": Problem}})
async def enable_hub_proxy(request: Request, hub_id: str) -> HubView:
    return await _set_proxy(request, hub_id, True)


@router.post("/{hub_id}/proxy/disable", operation_id="disableHubProxy", response_model=HubView,
             summary="Stop offering the hub to the official app",
             responses={404: {"model": Problem}})
async def disable_hub_proxy(request: Request, hub_id: str) -> HubView:
    return await _set_proxy(request, hub_id, False)


async def _set_proxy(request: Request, hub_id: str, enabled: bool) -> HubView:
    manager = manager_of(request)
    try:
        await manager.set_proxy_enabled(hub_id, enabled)
        return await manager.view(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None


@router.post("/{hub_id}/disable", operation_id="disableHub", response_model=HubView,
             summary="Disconnect a hub but keep its configuration",
             responses={404: {"model": Problem}, 409: {"model": Problem}})
async def disable_hub(request: Request, hub_id: str) -> HubView:
    _refuse_while_job_runs(request, hub_id)
    manager = manager_of(request)
    try:
        await manager.disable(hub_id)
        return await manager.view(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
