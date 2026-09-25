"""``/api/v1/hubs/{hub_id}/callback-device``, ``/wifi-devices``, ``/presses``
and the listener routes (callbacks plan, C2 to C4; server panel wifi
commands plan, section 2: the callback device is the Wifi Device under
the key ``default``, and both route families share one implementation).

The rule the routes follow: an immediate 409 is something the record
alone decides (a device already deployed, a stale one, an X1 with the
wrong port, references the client must clear); anything that needs the
hub happens inside the accepted job and shows up as a failed job with a
coded error (``callback_update_declined``, ``callback_update_failed``,
the usual hub problems).
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from typing import Any, Literal, Optional

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel, Field

from sofabaton import WIFI_SLOT_COUNT, AsyncXProxy

from . import API_PREFIX
from .callbacks import (
    DEFAULT_DEVICE_KEY,
    MAX_WIFI_DEVICES,
    TRANSPORT_HTTP,
    TRANSPORT_MQTT,
    CallbackDeviceExists,
    CallbackDeviceMissing,
    CallbackDeviceNotStale,
    CallbackDeviceStale,
    CallbackPortRefused,
    CallbackService,
    ListenerState,
    MqttUnavailable,
    WifiDeviceLimit,
)
from .mqtt_client import MqttState
from .jobs import JobView
from .manager import HubDisabled, HubNotFound
from .models import Problem
from .problems import ApiProblem, hub_disabled, hub_not_found
from .routes_edit import _require_control
from .routes_snapshot import start_job

log = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/hubs/{{hub_id}}", tags=["callbacks"])
server_router = APIRouter(prefix=f"{API_PREFIX}/server", tags=["server"])

_ERRORS = {404: {"model": Problem}, 409: {"model": Problem}, 422: {"model": Problem}, 503: {"model": Problem}}


# -- bodies and views -------------------------------------------------------------


class CallbackSlot(BaseModel):
    """One command slot: its labels and, optionally, where its command goes.

    ``favorite`` and ``button`` apply in every activity of ``activities``;
    an update writes them in place and later removes only what an earlier
    spec put there. One slot per button and one slot per input activity.
    """

    label: str = Field(min_length=1, max_length=30)
    long_label: Optional[str] = Field(None, max_length=30, description="default: '<label> Long'")
    favorite: bool = Field(False, description="a favorite in each of `activities`")
    button: Optional[int] = Field(None, description="hub button code bound to this command in each of `activities`")
    long_press: bool = Field(False, description="also bind the slot's long record to that button's long press")
    activities: list[int] = Field(default_factory=list, description="activity ids; kept only while `favorite` or `button` is set")
    input_activity_id: Optional[int] = Field(None, description="the activity whose start performs this command (X1S/X2)")


class CallbackDeviceRequest(BaseModel):
    """Complete desired spec for POST and PUT, not a partial update.

    Every slot is written; omitted slots become ``Button n`` and omitted
    power/input hooks are cleared. For a rename, copy all fields from the
    current record's spec and change only the intended labels. Preserving
    device/command IDs and generic bindings does not preserve omitted fields.
    Hook slots are one-based (1..10); callback URL indexes are zero-based (0..9).
    """

    name: str = Field("Server", min_length=1, max_length=30)
    slots: list[CallbackSlot] = Field(default_factory=list, max_length=WIFI_SLOT_COUNT)
    power_on_slot: Optional[int] = Field(None, ge=1, le=WIFI_SLOT_COUNT,
                                         description="slot the hub fires when an activity powers on (X1S/X2)")
    power_off_slot: Optional[int] = Field(None, ge=1, le=WIFI_SLOT_COUNT)
    input_slots: list[int] = Field(default_factory=list, description="slots offered as activity-start inputs (X1S/X2)")


class CallbackTargetView(BaseModel):
    host: str
    port: int
    action_id: str


class EffectiveDestination(BaseModel):
    """What a deploy would bake into the records right now (settings, else the routed local IP)."""

    host: str
    port: int


class CallbackPendingView(BaseModel):
    op: str
    started_at: str
    spec: Optional[dict[str, Any]] = None


class CallbackLastPress(BaseModel):
    seq: int
    received_at: str


class CallbackDeviceView(BaseModel):
    """The deployed record plus the destination a new deploy would use now.

    ``target`` is the address already written to the device;
    ``effective_destination`` follows current settings and can differ.
    ``stale`` flags a missing device; ``callback_device_stale`` is an event/error name.
    """

    device_id: Optional[int]
    spec: dict[str, Any]
    target: Optional[CallbackTargetView] = Field(None, description="null for an mqtt device: it calls no address")
    labels: dict[str, str]
    hub_version: str
    deployed_at: Optional[str]
    adopted: bool
    stale: bool
    deployed: bool
    pending: Optional[CallbackPendingView] = None
    last_press: Optional[CallbackLastPress] = None
    effective_destination: Optional[EffectiveDestination] = None
    key: str = Field(DEFAULT_DEVICE_KEY, description="the record's key under /wifi-devices; the callback device is 'default'")
    transport: str = Field("http", description="how its presses reach the server: http or mqtt")
    mqtt_topic: Optional[str] = Field(None, description="an mqtt device's press topic on the broker, `<MAC>/up`")


class WifiDeviceRequest(CallbackDeviceRequest):
    """Body of ``POST /wifi-devices``: the callback device's spec plus the transport.

    ``PUT /wifi-devices/{key}`` takes the same body; the transport of a
    deployed device is fixed and the field is ignored there. ``mqtt``
    needs an X2 and a server with a broker (set in the control panel, or ``--mqtt-host``): the
    hub then publishes the presses to the broker set in the Sofabaton
    app, no listener and no callback address involved.
    """

    transport: Literal["http", "mqtt"] = Field("http", description="one of the list's `transports`")


class WifiDeviceList(BaseModel):
    """``GET /hubs/{id}/wifi-devices``: every managed Wifi Device of the hub,
    the callback device (key ``default``) first."""

    devices: list[CallbackDeviceView]
    max_devices: int
    transports: list[str]
    effective_destination: Optional[EffectiveDestination] = None


class CallbackReference(BaseModel):
    activity_id: int
    name: Optional[str]
    kinds: list[str]
    complete: bool


class PressView(BaseModel):
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
    device_key: Optional[str] = Field(None, description="the Wifi Device's key; null for an unknown device")


class PressPage(BaseModel):
    """``GET /hubs/{id}/presses``: the ring, oldest first when ``after`` is given.

    ``expired`` means presses newer than ``after`` were already evicted
    from the ring; the client missed some and must accept the gap.
    ``instance_id`` changes on every server restart, and so does the
    sequence; on a new instance start from the current ``hello``.
    """

    instance_id: str
    last_seq: int
    expired: bool
    presses: list[PressView]


class MqttView(BaseModel):
    """The server's broker connection. The settings come from the command line or the
    environment only, and the password is not part of any answer. ``wanted`` is true
    while a device uses the transport; the connection exists only then."""

    configured: bool
    wanted: bool
    connected: bool
    host: Optional[str]
    port: Optional[int]
    tls: bool
    username: Optional[str]
    topics: list[str]
    last_error: Optional[str]
    connected_at: Optional[str]
    next_retry_at: Optional[str]


class CallbackListenerView(BaseModel):
    wanted: bool
    bound: bool
    port: int
    bound_port: Optional[int]
    last_error: Optional[str]
    next_retry_at: Optional[str]


# -- helpers -------------------------------------------------------------------------


def _service(request: Request) -> CallbackService:
    return request.app.state.callbacks


def _proxy(request: Request, hub_id: str) -> AsyncXProxy:
    try:
        return request.app.state.hub_manager.proxy(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
    except HubDisabled:
        raise hub_disabled(hub_id) from None


def _known_hub(request: Request, hub_id: str) -> None:
    try:
        request.app.state.hub_manager.record(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None


def _destination(service: CallbackService, hub_id: str, request: Request) -> Optional[dict[str, Any]]:
    try:
        proxy = request.app.state.hub_manager.proxy(hub_id)
    except (HubNotFound, HubDisabled):
        return None
    host, port = service.target_for(proxy)
    return {"host": host, "port": port}


def _not_found(hub_id: str, key: str) -> ApiProblem:
    if key == DEFAULT_DEVICE_KEY:
        return ApiProblem(404, "callback_device_not_found", "No callback device on this hub",
                          detail="deploy one with POST /callback-device", hub_id=hub_id)
    return ApiProblem(404, "callback_device_not_found", "No such Wifi Device on this hub",
                      detail=f"no Wifi Device has the key {key!r}", hub_id=hub_id)


def _record_view(service: CallbackService, hub_id: str, record: Any, destination: Optional[dict[str, Any]]) -> CallbackDeviceView:
    mqtt = record.transport == TRANSPORT_MQTT
    # The callback address means nothing to a device that calls nothing.
    view = CallbackDeviceView(**record.view(effective_destination=None if mqtt else destination))
    if mqtt:
        view.mqtt_topic = service.mqtt_topic_for(hub_id)
    return view


def _view(service: CallbackService, hub_id: str, request: Request, key: str = DEFAULT_DEVICE_KEY) -> CallbackDeviceView:
    record = service.record(hub_id, key)
    if record is None:
        raise _not_found(hub_id, key)
    return _record_view(service, hub_id, record, _destination(service, hub_id, request))


def _job_view(service: CallbackService, hub_id: str, record: Any, proxy: AsyncXProxy) -> dict[str, Any]:
    host, port = service.target_for(proxy)
    return _record_view(service, hub_id, record, {"host": host, "port": port}).model_dump()


def _mqtt_view(state: MqttState) -> MqttView:
    data = asdict(state)
    data["topics"] = list(state.topics)
    return MqttView(**data)


def _listener_view(state: ListenerState) -> CallbackListenerView:
    return CallbackListenerView(**asdict(state))


# -- the four operations, shared by /callback-device and /wifi-devices ---------------------


async def _deploy(request: Request, hub_id: str, body: CallbackDeviceRequest, *, key: str, transport: str,
                  kind: str) -> JobView:
    service = _service(request)
    proxy = _proxy(request, hub_id)
    existing = service.record(hub_id, key)
    if existing is not None and existing.device_id is not None and existing.pending is None:
        raise ApiProblem(409, "callback_device_exists", "A callback device is already deployed",
                         detail=f"device {existing.device_id}; update it, or remove it first", hub_id=hub_id)
    try:
        if existing is None:
            service.check_limit(hub_id)
        spec = service.spec_from_body(body.model_dump(), key=key)
        hub_version = (await proxy.status()).hub_version
        if transport == TRANSPORT_MQTT:
            reason = service.mqtt_unavailable_reason(hub_id, hub_version)
            if reason is not None:
                raise ApiProblem(409, "mqtt_unavailable", "The mqtt transport is not available for this hub",
                                 detail=reason, hub_id=hub_id)
        else:
            service.check_port(hub_version)
    except WifiDeviceLimit as err:
        raise ApiProblem(409, "wifi_device_limit", "The hub holds the maximum number of Wifi Devices",
                         detail=str(err), hub_id=hub_id) from err
    except CallbackPortRefused as err:
        raise ApiProblem(409, "callback_port_x1", "An X1 hub can only call back on port 8060",
                         detail=str(err), hub_id=hub_id) from err
    except ValueError as err:
        raise ApiProblem(422, "invalid_request", "Invalid callback device", detail=str(err), hub_id=hub_id) from err
    await _require_control(proxy, hub_id)

    async def run(progress) -> dict[str, Any]:
        try:
            record = await service.deploy(hub_id, proxy, spec, key=key, transport=transport)
        except CallbackDeviceExists as err:
            raise ApiProblem(409, "callback_device_exists", "A callback device is already deployed",
                             detail=str(err), hub_id=hub_id) from err
        except WifiDeviceLimit as err:
            raise ApiProblem(409, "wifi_device_limit", "The hub holds the maximum number of Wifi Devices",
                             detail=str(err), hub_id=hub_id) from err
        except MqttUnavailable as err:
            raise ApiProblem(409, "mqtt_unavailable", "The mqtt transport is not available for this hub",
                             detail=str(err), hub_id=hub_id) from err
        return _job_view(service, hub_id, record, proxy)

    return start_job(request, hub_id, kind, run, cancellable=False)


async def _update(request: Request, hub_id: str, body: CallbackDeviceRequest, *, key: str, kind: str) -> JobView:
    service = _service(request)
    proxy = _proxy(request, hub_id)
    record = service.record(hub_id, key)
    if record is None or record.device_id is None:
        raise _not_found(hub_id, key)
    if record.stale:
        raise ApiProblem(409, "callback_device_stale", "The callback device is stale",
                         detail="the hub no longer has it; redeploy it", hub_id=hub_id)
    try:
        spec = service.spec_from_body(body.model_dump(), key=key)
    except ValueError as err:
        raise ApiProblem(422, "invalid_request", "Invalid callback device", detail=str(err), hub_id=hub_id) from err
    await _require_control(proxy, hub_id)

    async def run(progress) -> dict[str, Any]:
        updated = await service.update(hub_id, proxy, spec, key=key, progress=progress)
        return _job_view(service, hub_id, updated, proxy)

    return start_job(request, hub_id, kind, run, cancellable=False)


async def _remove(request: Request, hub_id: str, *, key: str, force: bool, kind: str) -> JobView:
    service = _service(request)
    proxy = _proxy(request, hub_id)
    record = service.record(hub_id, key)
    if record is None:
        raise _not_found(hub_id, key)
    if record.device_id is not None and not force:
        try:
            own_spec = record.deployment().spec
        except ValueError:
            own_spec = None
        references = service.references(await proxy.snapshot(), record.device_id, spec=own_spec)
        if references:
            names = ", ".join(f"{r['activity_id']} ({', '.join(r['kinds'])})" for r in references)
            raise ApiProblem(409, "callback_device_referenced", "Activities still reference the callback device",
                             detail=f"referenced by activity {names}; clear them or pass ?force=true", hub_id=hub_id)
    await _require_control(proxy, hub_id)

    async def run(progress) -> dict[str, Any]:
        return await service.remove(hub_id, proxy, key=key)

    return start_job(request, hub_id, kind, run, cancellable=False)


async def _redeploy(request: Request, hub_id: str, *, key: str, kind: str) -> JobView:
    service = _service(request)
    proxy = _proxy(request, hub_id)
    record = service.record(hub_id, key)
    if record is None or record.device_id is None:
        raise _not_found(hub_id, key)
    if not record.stale:
        raise ApiProblem(409, "callback_device_not_stale", "The callback device is not stale",
                         detail="it is still on the hub; update it instead", hub_id=hub_id)
    try:
        if record.transport != TRANSPORT_MQTT:
            service.check_port((await proxy.status()).hub_version)
    except CallbackPortRefused as err:
        raise ApiProblem(409, "callback_port_x1", "An X1 hub can only call back on port 8060",
                         detail=str(err), hub_id=hub_id) from err
    await _require_control(proxy, hub_id)

    async def run(progress) -> dict[str, Any]:
        try:
            fresh = await service.redeploy(hub_id, proxy, key=key)
        except MqttUnavailable as err:
            raise ApiProblem(409, "mqtt_unavailable", "The mqtt transport is not available for this hub",
                             detail=str(err), hub_id=hub_id) from err
        except CallbackDeviceNotStale as err:
            raise ApiProblem(409, "callback_device_not_stale", "The callback device is not stale",
                             detail=str(err), hub_id=hub_id) from err
        except CallbackDeviceMissing as err:
            raise _not_found(hub_id, key) from err
        return _job_view(service, hub_id, fresh, proxy)

    return start_job(request, hub_id, kind, run, cancellable=False)


# -- the callback device ---------------------------------------------------------------


@router.get("/callback-device", operation_id="getCallbackDevice", response_model=CallbackDeviceView,
            summary="The hub's callback device record", responses={404: {"model": Problem}})
async def get_callback_device(request: Request, hub_id: str) -> CallbackDeviceView:
    _known_hub(request, hub_id)
    return _view(_service(request), hub_id, request)


@router.post("/callback-device", operation_id="deployCallbackDevice", response_model=JobView, status_code=202,
             summary="Deploy the callback device (a job); the result is the record", responses=_ERRORS)
async def deploy_callback_device(request: Request, hub_id: str, body: CallbackDeviceRequest) -> JobView:
    return await _deploy(request, hub_id, body, key=DEFAULT_DEVICE_KEY, transport="http", kind="deploy_callback_device")


@router.put("/callback-device", operation_id="updateCallbackDevice", response_model=JobView, status_code=202,
            summary="Edit the callback device in place (a job); declined drift fails the job", responses=_ERRORS)
async def update_callback_device(request: Request, hub_id: str, body: CallbackDeviceRequest) -> JobView:
    return await _update(request, hub_id, body, key=DEFAULT_DEVICE_KEY, kind="update_callback_device")


@router.delete("/callback-device", operation_id="removeCallbackDevice", response_model=JobView, status_code=202,
               summary="Remove the callback device from the hub and forget it (a job)", responses=_ERRORS)
async def remove_callback_device(
    request: Request, hub_id: str,
    force: bool = Query(False, description="remove even when activities still reference the device"),
) -> JobView:
    return await _remove(request, hub_id, key=DEFAULT_DEVICE_KEY, force=force, kind="remove_callback_device")


@router.post("/callback-device/redeploy", operation_id="redeployCallbackDevice", response_model=JobView,
             status_code=202, summary="Deploy a stale callback device again from its stored spec (a job)",
             responses=_ERRORS)
async def redeploy_callback_device(request: Request, hub_id: str) -> JobView:
    return await _redeploy(request, hub_id, key=DEFAULT_DEVICE_KEY, kind="redeploy_callback_device")


# -- wifi devices: the keyed collection the callback device is one of -----------------------


@router.get("/wifi-devices", operation_id="listWifiDevices", response_model=WifiDeviceList,
            summary="The hub's managed Wifi Devices", responses={404: {"model": Problem}})
async def list_wifi_devices(request: Request, hub_id: str) -> WifiDeviceList:
    _known_hub(request, hub_id)
    service = _service(request)
    destination = _destination(service, hub_id, request)
    manager = request.app.state.hub_manager
    hub_version = manager.record(hub_id).config.hub_version
    try:
        hub_version = (await manager.proxy(hub_id).status()).hub_version or hub_version
    except (HubNotFound, HubDisabled):
        pass
    return WifiDeviceList(
        devices=[_record_view(service, hub_id, record, destination) for record in service.records(hub_id)],
        max_devices=MAX_WIFI_DEVICES,
        transports=service.transports_for(hub_id, hub_version),
        effective_destination=destination,
    )


@router.post("/wifi-devices", operation_id="deployWifiDevice", response_model=JobView, status_code=202,
             summary="Deploy a new Wifi Device (a job); the result is its record, with the key", responses=_ERRORS)
async def deploy_wifi_device(request: Request, hub_id: str, body: WifiDeviceRequest) -> JobView:
    _known_hub(request, hub_id)
    key = _service(request).new_key(hub_id)
    return await _deploy(request, hub_id, body, key=key, transport=body.transport, kind="deploy_wifi_device")


@router.get("/wifi-devices/{key}", operation_id="getWifiDevice", response_model=CallbackDeviceView,
            summary="One Wifi Device record", responses={404: {"model": Problem}})
async def get_wifi_device(request: Request, hub_id: str, key: str) -> CallbackDeviceView:
    _known_hub(request, hub_id)
    return _view(_service(request), hub_id, request, key)


@router.put("/wifi-devices/{key}", operation_id="updateWifiDevice", response_model=JobView, status_code=202,
            summary="Edit a Wifi Device in place (a job); declined drift fails the job", responses=_ERRORS)
async def update_wifi_device(request: Request, hub_id: str, key: str, body: WifiDeviceRequest) -> JobView:
    return await _update(request, hub_id, body, key=key, kind="update_wifi_device")


@router.delete("/wifi-devices/{key}", operation_id="removeWifiDevice", response_model=JobView, status_code=202,
               summary="Remove a Wifi Device from the hub and forget it (a job)", responses=_ERRORS)
async def remove_wifi_device(
    request: Request, hub_id: str, key: str,
    force: bool = Query(False, description="remove even when activities still reference the device"),
) -> JobView:
    return await _remove(request, hub_id, key=key, force=force, kind="remove_wifi_device")


@router.post("/wifi-devices/{key}/redeploy", operation_id="redeployWifiDevice", response_model=JobView,
             status_code=202, summary="Deploy a stale Wifi Device again from its stored spec (a job)",
             responses=_ERRORS)
async def redeploy_wifi_device(request: Request, hub_id: str, key: str) -> JobView:
    return await _redeploy(request, hub_id, key=key, kind="redeploy_wifi_device")


# -- presses -----------------------------------------------------------------------------


@router.get("/presses", operation_id="listPresses", response_model=PressPage,
            summary="Recent button presses (the catch-up view of the press stream)",
            responses={404: {"model": Problem}})
async def list_presses(
    request: Request, hub_id: str,
    after: Optional[int] = Query(None, ge=0, description="return presses with seq greater than this, oldest first"),
    limit: int = Query(100, ge=1, le=1000),
) -> PressPage:
    _known_hub(request, hub_id)
    ring = _service(request).ring
    if after is None:
        rows, expired = ring.newest(hub_id, limit), False
    else:
        rows, expired = ring.since(hub_id, after, limit)
    return PressPage(instance_id=ring.instance_id, last_seq=ring.last_seq, expired=expired,
                     presses=[PressView(**row.to_dict()) for row in rows])


# -- the listener (server level) ------------------------------------------------------------


@server_router.get("/callback-listener", operation_id="getCallbackListener", response_model=CallbackListenerView,
                   summary="State of the callback listener")
async def get_callback_listener(request: Request) -> CallbackListenerView:
    return _listener_view(_service(request).listener_state())


@server_router.get("/mqtt", operation_id="getMqtt", response_model=MqttView,
                   summary="State of the MQTT broker connection (never the password)")
async def get_mqtt(request: Request) -> MqttView:
    return _mqtt_view(_service(request).mqtt_state())


@server_router.post("/callback-listener/retry", operation_id="retryCallbackListener",
                    response_model=CallbackListenerView, summary="Try to bind the callback listener now")
async def retry_callback_listener(request: Request) -> CallbackListenerView:
    service = _service(request)
    await service.listener.retry_now()
    return _listener_view(service.listener_state())
