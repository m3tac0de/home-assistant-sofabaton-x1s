"""Writes over REST (plan S8 row edits, S10 intents).

Every write is a **job** (see ``jobs.py``): the route validates, takes
the current snapshot, builds the edited bundle, and answers 202 with the
job record; the write itself runs in the background and its outcome
reaches the client as ``job_event`` messages or through ``GET
/hubs/{id}/jobs/{job_id}``.

Two shapes of write:

* **Row edits**: ``PUT /activities/{id}`` and ``PUT /devices/{id}`` take
  the edited entity payload (the snapshot's ``activities[]`` /
  ``devices[]`` element) and require ``If-Match`` with the snapshot's
  quoted snapshot_id (ETag accepted for compatibility), so an edit made
  on an old cached revision is refused (412) before any
  hub traffic. ``POST .../plan`` previews the steps without writing.
* **Intents**: rename, bind and clear a button, favorites, command
  rename, idle behaviour (row edits the server derives from the current
  snapshot through the library's ``edits`` helpers), plus the
  whole-entity operations: add and remove a device, add an activity,
  reorder, rename the hub. ``If-Match`` is optional here and checked
  when present.

The library's stale preflight still runs inside every sync as the
authoritative check against the hub; ``If-Match`` only catches "you
edited an old document".
"""

from __future__ import annotations

import logging
from copy import deepcopy
from typing import Any, Callable, Optional

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, ConfigDict, Field

from sofabaton import (
    AsyncXProxy,
    ButtonName,
    HubSnapshot,
    SyncResult,
    build_activity_sync_plan,
    build_device_sync_plan,
    edits,
)

from . import API_PREFIX
from .jobs import JobView
from .manager import HubDisabled, HubManager, HubNotFound
from .models import Problem
from .problems import ApiProblem, SyncFailed, hub_disabled, hub_errors, hub_not_found
from .routes_snapshot import _matches, header_of, start_job

log = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/hubs/{{hub_id}}", tags=["edit"])

_WRITE_ERRORS = {
    404: {"model": Problem}, 409: {"model": Problem}, 412: {"model": Problem},
    422: {"model": Problem}, 428: {"model": Problem}, 503: {"model": Problem},
}
_SNAPSHOT_PROVENANCE = ("complete", "editable", "fetched_at", "captured_at", "payload_profile", "kind")


# -- bodies ----------------------------------------------------------------------


class EntityPayload(BaseModel):
    """An edited ``activities[]`` / ``devices[]`` element of the snapshot document.

    Only ``device.device_id`` is checked here (it must match the path);
    the tables are the library's ``hub_bundle`` rows and are validated by
    the planner, which refuses anything outside the entity being edited.
    """

    model_config = ConfigDict(extra="allow")

    device: dict[str, Any]


class ActivityPayload(EntityPayload):
    """An edited activity element, plus the device elements the edit touched.

    An activity edit can reach into a device: picking an input for a
    device in the power-on sequence appends to that device's
    ``input_record``. ``devices`` carries those ``devices[]`` elements;
    they are spliced into the edited bundle next to the activity and the
    planner's scope guard decides what is allowed (input records, the
    idle byte, command names).
    """

    devices: Optional[list[dict[str, Any]]] = Field(
        None, description="devices[] elements this activity edit touched (e.g. a new input entry); optional")


class SyncPlanStep(BaseModel):
    kind: str
    label: str
    target_device_id: Optional[int] = None


class SyncPlan(BaseModel):
    """What a sync of this edit would write, in order. Nothing is written."""

    entity_kind: str
    entity_id: int
    step_count: int
    steps: list[SyncPlanStep]


class RenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class DeviceRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    brand: Optional[str] = Field(None, max_length=64)


class CommandRef(BaseModel):
    device_id: int = Field(ge=1, le=100)
    command_id: int = Field(ge=1, le=255)


class BindRequest(BaseModel):
    """Bind a button: the command, and optionally a different one for the held press."""

    device_id: int = Field(ge=1, le=100)
    command_id: int = Field(ge=1, le=255)
    long_press: Optional[CommandRef] = None


class FavoriteRequest(CommandRef):
    name: Optional[str] = Field(None, max_length=64)


class FavoritesOrderRequest(BaseModel):
    order: list[CommandRef] = Field(min_length=1)


class IdleBehaviorRequest(BaseModel):
    mode: int = Field(ge=0, le=255)


class DeviceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    device_class: str = Field(
        min_length=1,
        description="Protocol class: X1 supports ir, wifi_roku, wifi_hue, wifi_sonos; "
                    "X1S also supports wifi_ip; X2 also supports wifi_mqtt. "
                    "This is not an appliance category such as TV or receiver.",
    )


class ActivityCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=30)


class OrderRequest(BaseModel):
    order: list[int] = Field(min_length=1, description="every entity of the kind, once, in display order")


# -- helpers -----------------------------------------------------------------------


def _manager(request: Request) -> HubManager:
    return request.app.state.hub_manager


def _proxy(request: Request, hub_id: str) -> AsyncXProxy:
    try:
        return _manager(request).proxy(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
    except HubDisabled:
        raise hub_disabled(hub_id) from None


async def _require_control(proxy: AsyncXProxy, hub_id: str) -> None:
    """Refuse a write up front with the read table's mapping (409 / 503)."""

    st = await proxy.status()
    if st.controllable:
        return
    if not st.hub_connected:
        raise ApiProblem(503, "hub_not_connected", "Hub is not connected", hub_id=hub_id, mode=st.mode)
    raise ApiProblem(409, "hub_busy", "An app client holds the hub", detail="writes need control mode", hub_id=hub_id, mode=st.mode)


def _check_if_match(if_match: Optional[str], snap: HubSnapshot, hub_id: str, *, required: bool) -> None:
    if not if_match:
        if required:
            raise ApiProblem(428, "if_match_required", "If-Match is required",
                             detail="send the quoted snapshot_id the edit was made on", hub_id=hub_id)
        return
    if not _matches(if_match, snap.snapshot_id):
        raise ApiProblem(412, "snapshot_outdated", "The snapshot moved",
                         detail=f"the edit was made on another snapshot; the current one is \"{snap.snapshot_id}\"",
                         hub_id=hub_id)


def _require_editable(snap: HubSnapshot, hub_id: str, kind: str, entity_id: int) -> None:
    entity = snap.entity(kind, entity_id)
    if entity is None:
        raise ApiProblem(404, f"{kind}_not_found", f"Unknown {kind}",
                         detail=f"{kind} {entity_id} is not in the snapshot", hub_id=hub_id)
    if not entity.editable:
        raise ApiProblem(409, "entity_not_editable", "The entity was never read in full",
                         detail=f"refresh {kind} {entity_id} first (POST /snapshot/refresh)", hub_id=hub_id)


def _splice(bundle: dict[str, Any], kind: str, entity_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """The bundle with one entity payload replaced by the client's edit.

    Provenance keys are taken from the baseline entity so the client's
    copy (or its absence) cannot move the planner's scope guard.
    """

    edited = deepcopy(bundle)
    key = "devices" if kind == "device" else "activities"
    rows = edited.get(key) or []
    for index, row in enumerate(rows):
        if int((row.get("device") or {}).get("device_id", -1)) & 0xFF == entity_id:
            merged = deepcopy(payload)
            for field in _SNAPSHOT_PROVENANCE:
                if field in row:
                    merged[field] = row[field]
                else:
                    merged.pop(field, None)
            rows[index] = merged
            return edited
    raise KeyError(f"{kind} {entity_id} is not in the snapshot")


def _splice_activity(bundle: dict[str, Any], activity_id: int, body: "ActivityPayload", hub_id: str) -> dict[str, Any]:
    """The activity element spliced in, then each touched device element by its own id."""

    edited = _splice(bundle, "activity", activity_id, body.model_dump(exclude={"devices"}))
    for element in body.devices or []:
        try:
            device_id = int((element.get("device") or {}).get("device_id")) & 0xFF
        except (TypeError, ValueError):
            raise ApiProblem(422, "invalid_request", "A touched device has no id",
                             detail="every devices[] entry needs device.device_id", hub_id=hub_id) from None
        try:
            edited = _splice(edited, "device", device_id, element)
        except KeyError as err:
            raise ApiProblem(422, "invalid_request", "Unknown touched device",
                             detail=str(err.args[0] if err.args else err), hub_id=hub_id) from err
    return edited


def _button_code(token: str, hub_id: str) -> int:
    text = str(token).strip()
    try:
        return int(text, 0) & 0xFF
    except ValueError:
        pass
    code = getattr(ButtonName, text.upper(), None)
    if isinstance(code, int):
        return code & 0xFF
    raise ApiProblem(422, "invalid_request", "Unknown button",
                     detail=f"{token!r} is neither a button code nor a ButtonName alias", hub_id=hub_id)


def _plan(kind: str, baseline: dict[str, Any], edited: dict[str, Any], entity_id: int, hub_id: str) -> SyncPlan:
    try:
        # A device edit may drop commands (the HA card's live editor does; the
        # hub cascades the references and the sort table is rewritten once).
        steps = (build_device_sync_plan(baseline, edited, entity_id, allow_command_removal=True)
                 if kind == "device" else build_activity_sync_plan(baseline, edited, entity_id))
    except ValueError as err:
        raise ApiProblem(422, "out_of_scope", "The edit touches more than the entity",
                         detail=str(err), hub_id=hub_id) from err
    return SyncPlan(
        entity_kind=kind, entity_id=entity_id, step_count=len(steps),
        steps=[SyncPlanStep(kind=s.kind, label=s.label, target_device_id=s.target_device_id) for s in steps],
    )


async def _sync_job(
    request: Request, hub_id: str, proxy: AsyncXProxy, snap: HubSnapshot,
    kind: str, entity_id: int, edited: dict[str, Any], *, job_kind: str,
) -> JobView:
    # The plan is built now so an out-of-scope edit is a 422, not a failed job.
    _plan(kind, snap.bundle, edited, entity_id, hub_id)
    sync = proxy.sync_device if kind == "device" else proxy.sync_activity
    id_kw = "device_id" if kind == "device" else "activity_id"

    extra: dict[str, Any] = {"allow_command_removal": True} if kind == "device" else {}

    async def run(progress) -> dict[str, Any]:
        result: SyncResult = await sync(
            baseline=snap.bundle, edited=edited, snapshot_id=snap.snapshot_id,
            progress=progress, **{id_kw: entity_id}, **extra,
        )
        if not result.ok:
            raise SyncFailed(result)
        return result.to_dict()

    return start_job(request, hub_id, job_kind, run, cancellable=False)


async def _row_edit(
    request: Request, hub_id: str, kind: str, entity_id: int, if_match: Optional[str],
    edit: Callable[[dict[str, Any]], dict[str, Any]], *, required_match: bool, job_kind: str,
) -> JobView:
    proxy = _proxy(request, hub_id)
    await _require_control(proxy, hub_id)
    snap = await proxy.snapshot()
    _check_if_match(if_match, snap, hub_id, required=required_match)
    _require_editable(snap, hub_id, kind, entity_id)
    try:
        edited = edit(snap.bundle)
    except KeyError as err:
        raise ApiProblem(404, "not_found", "Unknown target", detail=str(err.args[0] if err.args else err), hub_id=hub_id) from err
    except ValueError as err:
        raise ApiProblem(422, "invalid_request", "Invalid edit", detail=str(err), hub_id=hub_id) from err
    return await _sync_job(request, hub_id, proxy, snap, kind, entity_id, edited, job_kind=job_kind)


async def _intent_job(request: Request, hub_id: str, if_match: Optional[str], job_kind: str, body) -> JobView:
    proxy = _proxy(request, hub_id)
    await _require_control(proxy, hub_id)
    if if_match:
        _check_if_match(if_match, await proxy.snapshot(), hub_id, required=False)

    async def run(progress) -> dict[str, Any]:
        extra = await body(proxy)
        out = header_of(await proxy.snapshot())
        out.update(extra or {})
        return out

    return start_job(request, hub_id, job_kind, run, cancellable=False)


IF_MATCH = Header(None, alias="If-Match",
                  description="the quoted snapshot_id the edit was made on (the snapshot ETag is accepted too)")


# -- S10: whole-entity intents (display order) ----------------------------------------
#
# ``/devices/order`` and ``/activities/order`` are declared BEFORE the
# ``PUT /devices/{id}`` and ``PUT /activities/{id}`` row edits below, which
# would otherwise match them first.


@router.put("/devices/order", operation_id="reorderDevices", response_model=JobView, status_code=202,
            summary="Store the device display order (every device, once)", responses=_WRITE_ERRORS)
async def reorder_devices(request: Request, hub_id: str, body: OrderRequest,
                          if_match: Optional[str] = IF_MATCH) -> JobView:
    async def body_fn(proxy: AsyncXProxy):
        await proxy.reorder_devices(body.order)

    return await _intent_job(request, hub_id, if_match, "reorder_devices", body_fn)


@router.put("/activities/order", operation_id="reorderActivities", response_model=JobView, status_code=202,
            summary="Store the activity display order (every activity, once)", responses=_WRITE_ERRORS)
async def reorder_activities(request: Request, hub_id: str, body: OrderRequest,
                             if_match: Optional[str] = IF_MATCH) -> JobView:
    async def body_fn(proxy: AsyncXProxy):
        await proxy.reorder_activities(body.order)

    return await _intent_job(request, hub_id, if_match, "reorder_activities", body_fn)



# -- S8: row edits ----------------------------------------------------------------


@router.put("/activities/{activity_id}", operation_id="editActivity", response_model=JobView, status_code=202,
            summary="Write an edited activity (the snapshot element) as a job; If-Match required",
            responses=_WRITE_ERRORS)
async def edit_activity(request: Request, hub_id: str, activity_id: int, body: ActivityPayload,
                        if_match: Optional[str] = IF_MATCH) -> JobView:
    if int(body.device.get("device_id", -1)) != activity_id:
        raise ApiProblem(422, "invalid_request", "Entity id mismatch", detail="device.device_id must equal the path id", hub_id=hub_id)
    return await _row_edit(request, hub_id, "activity", activity_id, if_match,
                           lambda b: _splice_activity(b, activity_id, body, hub_id),
                           required_match=True, job_kind="sync_activity")


@router.put("/devices/{device_id}", operation_id="editDevice", response_model=JobView, status_code=202,
            summary="Write an edited device (the snapshot element) as a job; If-Match required",
            responses=_WRITE_ERRORS)
async def edit_device(request: Request, hub_id: str, device_id: int, body: EntityPayload,
                      if_match: Optional[str] = IF_MATCH) -> JobView:
    if int(body.device.get("device_id", -1)) != device_id:
        raise ApiProblem(422, "invalid_request", "Entity id mismatch", detail="device.device_id must equal the path id", hub_id=hub_id)
    return await _row_edit(request, hub_id, "device", device_id, if_match,
                           lambda b: _splice(b, "device", device_id, body.model_dump()),
                           required_match=True, job_kind="sync_device")


@router.post("/activities/{activity_id}/plan", operation_id="planActivityEdit", response_model=SyncPlan,
             summary="Preview what writing this activity edit would do (nothing is written)",
             responses={404: {"model": Problem}, 409: {"model": Problem}, 422: {"model": Problem}})
async def plan_activity(request: Request, hub_id: str, activity_id: int, body: ActivityPayload) -> SyncPlan:
    proxy = _proxy(request, hub_id)
    snap = await proxy.snapshot()
    _require_editable(snap, hub_id, "activity", activity_id)
    return _plan("activity", snap.bundle, _splice_activity(snap.bundle, activity_id, body, hub_id), activity_id, hub_id)


@router.post("/devices/{device_id}/plan", operation_id="planDeviceEdit", response_model=SyncPlan,
             summary="Preview what writing this device edit would do (nothing is written)",
             responses={404: {"model": Problem}, 409: {"model": Problem}, 422: {"model": Problem}})
async def plan_device(request: Request, hub_id: str, device_id: int, body: EntityPayload) -> SyncPlan:
    proxy = _proxy(request, hub_id)
    snap = await proxy.snapshot()
    _require_editable(snap, hub_id, "device", device_id)
    return _plan("device", snap.bundle, _splice(snap.bundle, "device", device_id, body.model_dump()), device_id, hub_id)


# -- S10: row intents ---------------------------------------------------------------


@router.post("/activities/{activity_id}/rename", operation_id="renameActivity", response_model=JobView, status_code=202,
             summary="Rename an activity", responses=_WRITE_ERRORS)
async def rename_activity(request: Request, hub_id: str, activity_id: int, body: RenameRequest,
                          if_match: Optional[str] = IF_MATCH) -> JobView:
    return await _row_edit(request, hub_id, "activity", activity_id, if_match,
                           lambda b: edits.rename_activity(b, activity_id, body.name),
                           required_match=False, job_kind="sync_activity")


@router.post("/devices/{device_id}/rename", operation_id="renameDevice", response_model=JobView, status_code=202,
             summary="Rename a device (and optionally its brand)", responses=_WRITE_ERRORS)
async def rename_device(request: Request, hub_id: str, device_id: int, body: DeviceRenameRequest,
                        if_match: Optional[str] = IF_MATCH) -> JobView:
    return await _row_edit(request, hub_id, "device", device_id, if_match,
                           lambda b: edits.rename_device(b, device_id, body.name, brand=body.brand),
                           required_match=False, job_kind="sync_device")


@router.put("/activities/{activity_id}/buttons/{button}", operation_id="bindButton", response_model=JobView, status_code=202,
            summary="Bind a remote button (code or ButtonName alias) on an activity", responses=_WRITE_ERRORS)
async def bind_button(request: Request, hub_id: str, activity_id: int, button: str, body: BindRequest,
                      if_match: Optional[str] = IF_MATCH) -> JobView:
    code = _button_code(button, hub_id)
    long_press = (body.long_press.device_id, body.long_press.command_id) if body.long_press else None
    return await _row_edit(request, hub_id, "activity", activity_id, if_match,
                           lambda b: edits.bind_button(b, activity_id, code, body.device_id, body.command_id, long_press=long_press),
                           required_match=False, job_kind="sync_activity")


@router.delete("/activities/{activity_id}/buttons/{button}", operation_id="clearButton", response_model=JobView, status_code=202,
               summary="Clear a remote button on an activity", responses=_WRITE_ERRORS)
async def clear_button(request: Request, hub_id: str, activity_id: int, button: str,
                       if_match: Optional[str] = IF_MATCH) -> JobView:
    code = _button_code(button, hub_id)
    return await _row_edit(request, hub_id, "activity", activity_id, if_match,
                           lambda b: edits.clear_button(b, activity_id, code),
                           required_match=False, job_kind="sync_activity")


@router.post("/activities/{activity_id}/favorites", operation_id="addFavorite", response_model=JobView, status_code=202,
             summary="Add a device command to an activity's favorites", responses=_WRITE_ERRORS)
async def add_favorite(request: Request, hub_id: str, activity_id: int, body: FavoriteRequest,
                       if_match: Optional[str] = IF_MATCH) -> JobView:
    return await _row_edit(request, hub_id, "activity", activity_id, if_match,
                           lambda b: edits.add_favorite(b, activity_id, body.device_id, body.command_id, name=body.name or ""),
                           required_match=False, job_kind="sync_activity")


@router.delete("/activities/{activity_id}/favorites/{device_id}/{command_id}", operation_id="removeFavorite",
               response_model=JobView, status_code=202, summary="Remove a favorite", responses=_WRITE_ERRORS)
async def remove_favorite(request: Request, hub_id: str, activity_id: int, device_id: int, command_id: int,
                          if_match: Optional[str] = IF_MATCH) -> JobView:
    return await _row_edit(request, hub_id, "activity", activity_id, if_match,
                           lambda b: edits.remove_favorite(b, activity_id, device_id, command_id),
                           required_match=False, job_kind="sync_activity")


@router.put("/activities/{activity_id}/favorites/order", operation_id="reorderFavorites", response_model=JobView, status_code=202,
            summary="Put an activity's favorites in this order (every favorite, once)", responses=_WRITE_ERRORS)
async def reorder_favorites(request: Request, hub_id: str, activity_id: int, body: FavoritesOrderRequest,
                            if_match: Optional[str] = IF_MATCH) -> JobView:
    order = [(ref.device_id, ref.command_id) for ref in body.order]
    return await _row_edit(request, hub_id, "activity", activity_id, if_match,
                           lambda b: edits.reorder_favorites(b, activity_id, order),
                           required_match=False, job_kind="sync_activity")


@router.post("/devices/{device_id}/commands/{command_id}/rename", operation_id="renameCommand", response_model=JobView, status_code=202,
             summary="Rename one of a device's commands", responses=_WRITE_ERRORS)
async def rename_command(request: Request, hub_id: str, device_id: int, command_id: int, body: RenameRequest,
                         if_match: Optional[str] = IF_MATCH) -> JobView:
    return await _row_edit(request, hub_id, "device", device_id, if_match,
                           lambda b: edits.rename_command(b, device_id, command_id, body.name),
                           required_match=False, job_kind="sync_device")


@router.put("/devices/{device_id}/idle-behavior", operation_id="setIdleBehavior", response_model=JobView, status_code=202,
            summary="Set a device's automatic-power (idle) behaviour", responses=_WRITE_ERRORS)
async def set_idle_behavior(request: Request, hub_id: str, device_id: int, body: IdleBehaviorRequest,
                            if_match: Optional[str] = IF_MATCH) -> JobView:
    return await _row_edit(request, hub_id, "device", device_id, if_match,
                           lambda b: edits.set_idle_behavior(b, device_id, body.mode),
                           required_match=False, job_kind="sync_device")


# -- S10: whole-entity intents ------------------------------------------------------


@router.post("/devices", operation_id="addDevice", response_model=JobView, status_code=202,
             summary="Create an empty device; the job result carries the hub-assigned device_id",
             responses=_WRITE_ERRORS)
async def add_device(request: Request, hub_id: str, body: DeviceCreateRequest,
                     if_match: Optional[str] = IF_MATCH) -> JobView:
    async def body_fn(proxy: AsyncXProxy):
        return {"device_id": await proxy.add_device(body.name, body.device_class)}

    return await _intent_job(request, hub_id, if_match, "add_device", body_fn)


@router.delete("/devices/{device_id}", operation_id="removeDevice", response_model=JobView, status_code=202,
               summary="Delete a device; the hub cascades the removal into its activities",
               responses=_WRITE_ERRORS)
async def remove_device(request: Request, hub_id: str, device_id: int,
                        if_match: Optional[str] = IF_MATCH) -> JobView:
    proxy = _proxy(request, hub_id)
    if (await proxy.snapshot()).entity("device", device_id) is None:
        raise ApiProblem(404, "device_not_found", "Unknown device", hub_id=hub_id)

    async def body_fn(proxy: AsyncXProxy):
        return (await proxy.remove_device(device_id)).to_dict()

    return await _intent_job(request, hub_id, if_match, "remove_device", body_fn)


@router.delete("/activities/{activity_id}", operation_id="removeActivity", response_model=JobView, status_code=202,
               summary="Delete an activity", responses=_WRITE_ERRORS)
async def remove_activity(request: Request, hub_id: str, activity_id: int,
                          if_match: Optional[str] = IF_MATCH) -> JobView:
    proxy = _proxy(request, hub_id)
    if (await proxy.snapshot()).entity("activity", activity_id) is None:
        raise ApiProblem(404, "activity_not_found", "Unknown activity", hub_id=hub_id)

    async def body_fn(proxy: AsyncXProxy):
        await proxy.remove_activity(activity_id)

    return await _intent_job(request, hub_id, if_match, "remove_activity", body_fn)


@router.post("/activities", operation_id="addActivity", response_model=JobView, status_code=202,
             summary="Create an empty activity; the job result carries the hub-assigned activity_id",
             responses=_WRITE_ERRORS)
async def add_activity(request: Request, hub_id: str, body: ActivityCreateRequest,
                       if_match: Optional[str] = IF_MATCH) -> JobView:
    async def body_fn(proxy: AsyncXProxy):
        return {"activity_id": await proxy.add_activity(body.name)}

    return await _intent_job(request, hub_id, if_match, "add_activity", body_fn)


@router.put("/name", operation_id="renameHub", response_model=JobView, status_code=202,
            summary="Rename the hub", responses=_WRITE_ERRORS)
async def rename_hub(request: Request, hub_id: str, body: RenameRequest,
                     if_match: Optional[str] = IF_MATCH) -> JobView:
    async def body_fn(proxy: AsyncXProxy):
        await proxy.set_hub_name(body.name)
        return {"name": (await proxy.hub_info()).name or body.name}

    return await _intent_job(request, hub_id, if_match, "rename_hub", body_fn)
