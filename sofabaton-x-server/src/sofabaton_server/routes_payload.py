"""IR payloads, backup, restore and erase over REST (plan S11).

A payload is one command's stored IR code as the hub keeps it. It can be
read back (``GET .../commands/{id}/payload``), fired once without saving
(``POST /play``), captured from the original remote (``POST /learn``, a
cancellable job), written over an existing command (``PUT
.../commands/{id}/payload``) or saved as a new command (``POST
.../commands``); the last two are row edits and run as sync jobs.
Payloads are given in any of the formats codes circulate in: hub hex,
Pronto hex, raw mark/space timings with a carrier, or a protocol
descriptor the hub renders itself.

``POST /backup`` reads a full, restorable bundle (a job; minutes),
``POST /restore`` writes one back (a job; not cancellable; ``replace``
erases first) and ``POST /erase`` wipes the hub. Replacing restore and
erase are whole-hub destructive operations; entity deletion and payload
replacement can also remove existing configuration. Additive restore
creates new entities and is not safe to retry blindly after a timeout.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Header, Request, Response
from pydantic import BaseModel, ConfigDict, Field, model_validator

from sofabaton import AsyncXProxy, CommandPayload, IrPayload, NetworkCommand
from sofabaton.blob_decoders import try_decode_blob

from . import API_PREFIX
from .backup_stage import BACKUP_KIND, BackupStage, backup_result
from .jobs import JobNotFound, JobRunner, JobView
from .models import Problem
from .problems import ApiProblem, RestoreFailed, hub_errors
from .routes_edit import IF_MATCH, _proxy, _require_control, _row_edit, _check_if_match
from .routes_hub_data import Accepted
from .routes_snapshot import header_of, start_job

log = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/hubs/{{hub_id}}", tags=["payload"])

_HUB_ERRORS = {404: {"model": Problem}, 409: {"model": Problem}, 422: {"model": Problem},
               503: {"model": Problem}, 504: {"model": Problem}}
_WRITE_ERRORS = {**_HUB_ERRORS, 412: {"model": Problem}, 428: {"model": Problem}}


# -- bodies ----------------------------------------------------------------------


class PayloadSpec(BaseModel):
    """One IR payload in any supported source format (exactly one field).

    ``hex``: the hub's stored body as hex; ``pronto``: a learned-format
    Pronto code; ``timings_us`` + ``carrier_hz``: raw mark/space durations
    in microseconds, mark first; ``descriptor``: a protocol line such as
    ``P:NEC1 D:4 S:5 F:21``.
    """

    model_config = ConfigDict(extra="forbid")

    hex: Optional[str] = None
    pronto: Optional[str] = None
    timings_us: Optional[list[int]] = None
    carrier_hz: Optional[int] = Field(None, ge=1)
    descriptor: Optional[str] = None

    @model_validator(mode="after")
    def _one_format(self) -> "PayloadSpec":
        given = [k for k in ("hex", "pronto", "timings_us", "descriptor") if getattr(self, k) is not None]
        if len(given) != 1:
            raise ValueError("give exactly one of hex, pronto, timings_us (with carrier_hz), descriptor")
        if self.timings_us is not None and self.carrier_hz is None:
            raise ValueError("timings_us needs carrier_hz")
        return self

    def to_payload(self) -> IrPayload:
        if self.hex is not None:
            return IrPayload.from_hex(self.hex)
        if self.pronto is not None:
            return IrPayload.from_pronto(self.pronto)
        if self.timings_us is not None:
            return IrPayload.from_raw_timings(self.timings_us, int(self.carrier_hz or 0))
        return IrPayload.from_descriptor(str(self.descriptor))


class PayloadView(BaseModel):
    """A stored payload: its kind, the hub body as hex, and what could be read from it.

    ``kind`` follows the library's payload types: ``raw`` or
    ``descriptive`` for an IR payload, ``network`` for a decoded network
    command (``wifi_ip`` / ``wifi_roku`` / ``wifi_hue`` / ``wifi_sonos``)
    and ``record`` for any other stored body (a Bluetooth key, a two-byte
    ``wifi_mqtt`` record, an undecodable network body). Only IR payloads
    can be fired with ``POST /play``. ``decoded`` is the library's
    structured block for the payloads that have one (a descriptive IR
    payload, a network command, a ``wifi_mqtt`` record):
    ``{"class", "fields", "trailer_hex"}`` as ``restore_data.decoded``
    carries it; null when the body stays raw.
    """

    kind: str
    hex: str
    descriptor: Optional[str] = None
    carrier_hz: Optional[int] = None
    decoded: Optional[dict[str, Any]] = None


class NewCommandRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    payload: PayloadSpec
    command_id: Optional[int] = Field(None, ge=1, le=255, description="a free slot; omitted = the next free one")


class LearnRequest(BaseModel):
    timeout: float = Field(60.0, ge=1.0, le=120.0, description="seconds to wait for a key press")


class RestoreRequest(BaseModel):
    bundle: dict[str, Any] = Field(description="a full hub_bundle from POST /backup (payload_profile full_backup)")
    replace: bool = Field(False, description="erase the hub first (destructive)")


class BackupRequest(BaseModel):
    include_blobs: bool = Field(True, description="dump every IR payload (restorable; minutes)")
    device_ids: Optional[list[int]] = Field(None, description="only these devices, no activities")


# -- helpers ---------------------------------------------------------------------


def _parse_payload(spec: PayloadSpec, hub_id: str) -> IrPayload:
    try:
        return spec.to_payload()
    except ValueError as err:
        raise ApiProblem(422, "invalid_payload", "The payload could not be parsed", detail=str(err), hub_id=hub_id) from err


def _view(payload: IrPayload, device_class: Optional[str] = None) -> PayloadView:
    decoded = try_decode_blob(device_class, payload.blob) if device_class else None
    return PayloadView(kind=payload.kind, hex=payload.hex, descriptor=payload.descriptor, carrier_hz=payload.carrier_hz,
                       decoded=decoded)


def _stored_view(payload: CommandPayload, device_class: Optional[str]) -> PayloadView:
    """The view of what ``read_payload`` returned, by its type."""

    if isinstance(payload, IrPayload):
        return _view(payload, device_class)
    if isinstance(payload, NetworkCommand):
        decoded = {"class": payload.device_class, "fields": dict(payload.fields), "trailer_hex": payload.trailer_hex}
        return PayloadView(kind="network", hex=payload.hex, decoded=decoded)
    fields = payload.fields
    decoded = {"class": payload.device_class, "fields": fields, "trailer_hex": ""} if fields is not None else None
    return PayloadView(kind="record", hex=payload.hex, decoded=decoded)


# -- payloads ---------------------------------------------------------------------


@router.get("/devices/{device_id}/commands/{command_id}/payload", operation_id="getCommandPayload",
            response_model=PayloadView, summary="Read a command's stored payload from the hub (any device class)",
            responses=_HUB_ERRORS)
async def get_command_payload(request: Request, hub_id: str, device_id: int, command_id: int) -> PayloadView:
    proxy = _proxy(request, hub_id)
    snap = await proxy.snapshot()
    if snap.entity("device", device_id) is None:
        raise ApiProblem(404, "device_not_found", "Unknown device", hub_id=hub_id)
    async with hub_errors(hub_id):
        payload = await proxy.read_payload(device_id, command_id)
    if payload is None:
        raise ApiProblem(404, "payload_not_found", "The command has no stored payload",
                         detail=f"device {device_id} command {command_id}", hub_id=hub_id)
    return _stored_view(payload, _device_class(snap.bundle, device_id))


def _device_class(bundle: dict[str, Any], device_id: int) -> Optional[str]:
    """The device's class from its snapshot element, for the decoder."""
    for element in bundle.get("devices") or []:
        block = element.get("device") if isinstance(element, dict) else None
        if isinstance(block, dict) and int(block.get("device_id") or 0) == int(device_id):
            value = block.get("device_class")
            return str(value) if value else None
    return None


@router.post("/play", operation_id="playPayload", response_model=Accepted,
             summary="Fire an IR payload from the hub's blaster once (nothing is saved)", responses=_HUB_ERRORS)
async def play_payload(request: Request, hub_id: str, body: PayloadSpec) -> Accepted:
    proxy = _proxy(request, hub_id)
    payload = _parse_payload(body, hub_id)
    async with hub_errors(hub_id):
        await proxy.play(payload)
    return Accepted(accepted=True, mode=(await proxy.status()).mode)


@router.post("/learn", operation_id="learnPayload", response_model=JobView, status_code=202,
             summary="Capture an IR code from the original remote as a job (cancellable)",
             responses=_HUB_ERRORS)
async def learn_payload(request: Request, hub_id: str, body: Optional[LearnRequest] = None) -> JobView:
    proxy = _proxy(request, hub_id)
    await _require_control(proxy, hub_id)
    timeout = (body or LearnRequest()).timeout

    async def run(progress) -> dict[str, Any]:
        payload = await proxy.learn_ir(timeout=timeout)
        return _view(payload).model_dump()

    return start_job(request, hub_id, "learn_ir", run, cancellable=True, on_cancel=proxy.cancel_learn)


@router.put("/devices/{device_id}/commands/{command_id}/payload", operation_id="setCommandPayload",
            response_model=JobView, status_code=202,
            summary="Overwrite a command's stored payload in place (a sync job)", responses=_WRITE_ERRORS)
async def set_command_payload(request: Request, hub_id: str, device_id: int, command_id: int, body: PayloadSpec,
                              if_match: Optional[str] = IF_MATCH) -> JobView:
    from sofabaton import edits

    payload = _parse_payload(body, hub_id)
    return await _row_edit(request, hub_id, "device", device_id, if_match,
                           lambda b: edits.set_command_payload(b, device_id, command_id, payload),
                           required_match=False, job_kind="sync_device")


@router.post("/devices/{device_id}/commands", operation_id="addCommand", response_model=JobView, status_code=202,
             summary="Save a payload as a new command on a device (a sync job)", responses=_WRITE_ERRORS)
async def add_command(request: Request, hub_id: str, device_id: int, body: NewCommandRequest,
                      if_match: Optional[str] = IF_MATCH) -> JobView:
    from sofabaton import edits

    payload = _parse_payload(body.payload, hub_id)

    def edit(bundle: dict[str, Any]) -> dict[str, Any]:
        edited, _slot = edits.add_command(bundle, device_id, payload, body.name, command_id=body.command_id)
        return edited

    return await _row_edit(request, hub_id, "device", device_id, if_match, edit,
                           required_match=False, job_kind="sync_device")


# -- backup / restore / erase -----------------------------------------------------------


@router.post("/backup", operation_id="backupHub", response_model=JobView, status_code=202,
             summary="Read a hub_bundle from the hub as a job (full and restorable by default; minutes)",
             responses=_HUB_ERRORS)
async def backup_hub(request: Request, hub_id: str, body: Optional[BackupRequest] = None) -> JobView:
    proxy = _proxy(request, hub_id)
    await _require_control(proxy, hub_id)
    body = body or BackupRequest()

    record = request.app.state.hub_manager.record(hub_id)
    fallback_name = record.config.name or record.hub_name

    async def run(progress) -> dict[str, Any]:
        bundle = await proxy.backup(include_blobs=body.include_blobs, device_ids=body.device_ids, progress=progress)
        return backup_result(bundle, fallback_name=fallback_name)

    return start_job(request, hub_id, BACKUP_KIND, run, cancellable=False)


def _backup_job(request: Request, hub_id: str, job_id: str) -> JobView:
    jobs: JobRunner = request.app.state.job_runner
    try:
        view = jobs.get(hub_id, job_id)
    except JobNotFound:
        raise ApiProblem(404, "job_not_found", "Unknown job", hub_id=hub_id) from None
    if view.kind != BACKUP_KIND or view.status != "done":
        raise ApiProblem(404, "bundle_not_found", "The job holds no backup bundle",
                         detail=f"job {job_id} is a {view.kind} job with status {view.status}", hub_id=hub_id)
    return view


@router.get("/jobs/{job_id}/bundle", operation_id="downloadBackupBundle",
            summary="Download a finished backup's bundle as a file (while the server still holds it)",
            response_class=Response,
            responses={200: {"content": {"application/json": {}}, "description": "The hub_bundle, as an attachment"},
                       404: {"model": Problem}, 410: {"model": Problem}})
async def download_backup_bundle(request: Request, hub_id: str, job_id: str) -> Response:
    view = _backup_job(request, hub_id, job_id)
    stage: BackupStage = request.app.state.backup_stage
    bundle = stage.bundle(view)
    if bundle is None:
        raise ApiProblem(410, "bundle_expired", "The backup bundle is no longer held",
                         detail="the server keeps a bundle for a few minutes; make a new backup", hub_id=hub_id)
    filename = str((view.result or {}).get("filename") or "sofabaton_backup.json")
    body = json.dumps(bundle, indent=2)
    stage.mark_downloaded(view)
    return Response(content=body, media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"', "Cache-Control": "no-store"})


@router.delete("/jobs/{job_id}/bundle", operation_id="dropBackupBundle", status_code=204,
               summary="Drop a finished backup's bundle now (the client is done with it)",
               responses={404: {"model": Problem}})
async def drop_backup_bundle(request: Request, hub_id: str, job_id: str) -> Response:
    view = _backup_job(request, hub_id, job_id)
    request.app.state.backup_stage.drop(view)
    return Response(status_code=204)


@router.post("/restore", operation_id="restoreHub", response_model=JobView, status_code=202,
             summary="Write a hub_bundle onto the hub as a job (destructive with replace; not cancellable)",
             responses=_WRITE_ERRORS)
async def restore_hub(request: Request, hub_id: str, body: RestoreRequest,
                      if_match: Optional[str] = IF_MATCH) -> JobView:
    proxy = _proxy(request, hub_id)
    await _require_control(proxy, hub_id)
    if body.bundle.get("kind") != "hub_bundle":
        raise ApiProblem(422, "invalid_request", "Not a hub_bundle", detail="bundle.kind must be hub_bundle", hub_id=hub_id)
    if body.bundle.get("payload_profile") not in (None, "full_backup"):
        raise ApiProblem(422, "invalid_request", "Not restorable",
                         detail="only a full_backup bundle (POST /backup with include_blobs) can be restored", hub_id=hub_id)
    if if_match:
        _check_if_match(if_match, await proxy.snapshot(), hub_id, required=False)

    async def run(progress) -> dict[str, Any]:
        result = await proxy.restore(body.bundle, replace=body.replace, progress=progress)
        if not result.ok:
            raise RestoreFailed(result)
        return result.to_dict()

    return start_job(request, hub_id, "restore", run, cancellable=False)


@router.post("/erase", operation_id="eraseHub", response_model=JobView, status_code=202,
             summary="Wipe every device and activity on the hub (destructive, final)", responses=_WRITE_ERRORS)
async def erase_hub(request: Request, hub_id: str, if_match: Optional[str] = IF_MATCH) -> JobView:
    proxy = _proxy(request, hub_id)
    await _require_control(proxy, hub_id)
    if if_match:
        _check_if_match(if_match, await proxy.snapshot(), hub_id, required=False)

    async def run(progress) -> dict[str, Any]:
        await proxy.erase()
        return header_of(await proxy.snapshot())

    return start_job(request, hub_id, "erase", run, cancellable=False)
