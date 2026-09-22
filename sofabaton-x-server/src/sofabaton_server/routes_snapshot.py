"""``/api/v1/hubs/{hub_id}/snapshot`` and ``/jobs``: the configuration document
and the long-running operations on it (plan S7 and S9).

The snapshot is the library's projection of the hub's structural
configuration, served from the warm cache with no hub traffic and
identified by ``snapshot_id``, its configuration content hash. A client
sends that id quoted as ``If-Match`` with a write. The distinct response
``ETag`` also covers provenance and is used for conditional reads. Refreshing
the snapshot reads from the hub and is a **job**: one entity is a few
bursts, the whole hub takes minutes and is meant as a user action.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Header, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from sofabaton import AsyncXProxy, HubSnapshot

from . import API_PREFIX
from .jobs import JobConflict, JobNotCancellable, JobNotFound, JobRunner, JobView
from .manager import HubDisabled, HubManager, HubNotFound
from .models import Problem, light_job
from .problems import ApiProblem, hub_disabled, hub_errors, hub_not_found

log = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/hubs/{{hub_id}}", tags=["snapshot"])

_HUB_ERRORS = {404: {"model": Problem}, 409: {"model": Problem}, 503: {"model": Problem}, 504: {"model": Problem}}


# -- document types (typed header and identity; entity contents stay open) ----


class EntityIdentity(BaseModel):
    """The ``device`` block of an entity payload: id and name are typed, the rest rides along."""

    model_config = ConfigDict(extra="allow")

    device_id: int
    name: Optional[str] = None


class SnapshotEntityPayload(BaseModel):
    """One device or activity in the snapshot: provenance typed, tables open.

    ``complete`` / ``editable`` / ``fetched_at`` are the library's
    per-entity provenance (facts about the server's copy, never about
    the hub); ``commands``, ``button_bindings``,
    ``macros``, ``favorite_slots`` and the other tables follow the
    library's ``hub_bundle`` shape and are passed through as they are.
    """

    model_config = ConfigDict(extra="allow")

    kind: str
    device: EntityIdentity
    complete: bool = False
    editable: bool = False
    fetched_at: Optional[str] = None


class SnapshotDocument(BaseModel):
    """``GET /hubs/{id}/snapshot``: the structural configuration plus its header.

    The body is the library's ``hub_bundle`` with the snapshot header
    merged in. Send the quoted ``snapshot_id`` as ``If-Match`` for edits.
    The response ``ETag`` is a distinct, opaque conditional-read validator
    that also covers provenance; send it unchanged as ``If-None-Match``.
    """

    model_config = ConfigDict(extra="allow")

    snapshot_id: str
    captured_at: str
    engine_generation: int
    complete: bool
    payload_profile: str
    hub: dict[str, Any] = Field(default_factory=dict)
    devices: list[SnapshotEntityPayload] = Field(default_factory=list)
    activities: list[SnapshotEntityPayload] = Field(default_factory=list)


class SnapshotHeader(BaseModel):
    """What a finished refresh job reports."""

    snapshot_id: str
    engine_generation: int
    complete: bool


class RefreshRequest(BaseModel):
    """Body of ``POST /hubs/{id}/snapshot/refresh``: one entity, or neither for the whole hub."""

    device_id: Optional[int] = Field(None, ge=1, le=100)
    activity_id: Optional[int] = Field(None, ge=101, le=255)


# -- helpers -------------------------------------------------------------------


def _manager(request: Request) -> HubManager:
    return request.app.state.hub_manager


def _jobs(request: Request) -> JobRunner:
    return request.app.state.job_runner


def _proxy(request: Request, hub_id: str) -> AsyncXProxy:
    try:
        return _manager(request).proxy(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
    except HubDisabled:
        raise hub_disabled(hub_id) from None


def _etag(snap: HubSnapshot) -> str:
    """The snapshot document's response validator.

    ``snapshot_id`` hashes configuration content only, so it is the edit
    revision (``If-Match``) and stays put when provenance moves. The
    representation also carries provenance (``fetched_at``, ``complete``,
    ``editable`` per entity), which a refresh changes without touching
    content; a validator equal to the revision returned 304 to a client
    whose copy had the old provenance (review of ce9f205, P3). The ETag
    is therefore the revision plus a digest of the provenance vector.
    """

    provenance = json.dumps(
        [snap.complete]
        + [[e.kind, e.entity_id, e.complete, e.editable, e.fetched_at]
           for e in (*snap.devices, *snap.activities)],
        separators=(",", ":"),
    )
    digest = hashlib.sha256(provenance.encode("utf-8")).hexdigest()[:12]
    return f'"{snap.snapshot_id}.{digest}"'


def _tokens(header: Optional[str]) -> list[str]:
    tokens = []
    for token in (header or "").split(","):
        token = token.strip()
        if token.startswith("W/"):
            token = token[2:]
        if token:
            tokens.append(token)
    return tokens


def _matches(header: Optional[str], snapshot_id: str) -> bool:
    """``If-Match`` against the content revision.

    The documented form is the quoted ``snapshot_id``; the snapshot ETag
    (revision plus provenance digest) is accepted too, since its revision
    part is what an edit is made on.
    """

    for token in _tokens(header):
        if token == "*" or token.strip('"').split(".", 1)[0] == snapshot_id:
            return True
    return False


def _etag_matches(header: Optional[str], etag: str) -> bool:
    """``If-None-Match`` against the full validator, provenance included."""

    return any(token == "*" or token == etag for token in _tokens(header))


def header_of(snap: HubSnapshot) -> dict[str, Any]:
    return SnapshotHeader(
        snapshot_id=snap.snapshot_id, engine_generation=snap.engine_generation,
        complete=snap.complete,
    ).model_dump()


def start_job(request: Request, hub_id: str, kind: str, body, *, cancellable: bool, on_cancel=None) -> JobView:
    try:
        return _jobs(request).start(hub_id, kind, body, cancellable=cancellable, on_cancel=on_cancel)
    except JobConflict as err:
        raise ApiProblem(
            409, "hub_job_running", "Another job holds the hub",
            detail=f"job {err.active.job_id} ({err.active.kind}) is {err.active.status}; wait for it or cancel it",
            hub_id=hub_id,
        ) from err


# -- snapshot ---------------------------------------------------------------------


@router.get("/snapshot", operation_id="getSnapshot", response_model=SnapshotDocument,
            summary="The hub's structural configuration from the cache (no hub traffic)",
            responses={**_HUB_ERRORS, 304: {"description": "Not modified (If-None-Match matched the ETag)"}})
async def get_snapshot(
    request: Request, hub_id: str, response: Response,
    if_none_match: Optional[str] = Header(None, alias="If-None-Match", description="an ETag from an earlier read"),
) -> Any:
    proxy = _proxy(request, hub_id)
    snap = await proxy.snapshot()
    etag = _etag(snap)
    if _etag_matches(if_none_match, etag):
        return Response(status_code=304, headers={"ETag": etag})
    response.headers["ETag"] = etag
    return JSONResponse(content=snap.to_dict(), headers={"ETag": etag})


@router.post("/snapshot/refresh", operation_id="refreshSnapshot", response_model=JobView, status_code=202,
             summary="Read structural detail from the hub as a job (one entity, or the whole hub)",
             responses=_HUB_ERRORS)
async def refresh_snapshot(request: Request, hub_id: str, body: Optional[RefreshRequest] = None) -> JobView:
    proxy = _proxy(request, hub_id)
    body = body or RefreshRequest()
    if body.device_id is not None and body.activity_id is not None:
        raise ApiProblem(422, "invalid_request", "One entity at a time",
                         detail="give device_id or activity_id, not both", hub_id=hub_id)
    st = await proxy.status()
    if not st.controllable:
        # Refuse up front with the read table's mapping instead of failing the job.
        async with hub_errors(hub_id):
            await proxy.refresh(device_id=body.device_id, activity_id=body.activity_id)
    kwargs: dict[str, Any] = {}
    if body.device_id is not None:
        kwargs["device_id"] = body.device_id
    if body.activity_id is not None:
        kwargs["activity_id"] = body.activity_id
    kind = "refresh" if not kwargs else "refresh_entity"

    async def run(progress):
        snap = await proxy.refresh(progress=progress, **kwargs)
        return header_of(snap)

    return start_job(request, hub_id, kind, run, cancellable=not kwargs)


# -- jobs ---------------------------------------------------------------------------


@router.get("/jobs", operation_id="listJobs", response_model=list[JobView],
            summary="Recent jobs on this hub, newest first", responses={404: {"model": Problem}})
async def list_jobs(request: Request, hub_id: str) -> list[JobView]:
    try:
        _manager(request).record(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
    return [light_job(view) for view in _jobs(request).list(hub_id)]


@router.get("/jobs/{job_id}", operation_id="getJob", response_model=JobView,
            summary="One job: status, progress, result or error", responses={404: {"model": Problem}})
async def get_job(request: Request, hub_id: str, job_id: str) -> JobView:
    try:
        return _jobs(request).get(hub_id, job_id)
    except JobNotFound:
        raise ApiProblem(404, "job_not_found", "Unknown job", hub_id=hub_id) from None


@router.delete("/jobs/{job_id}", operation_id="cancelJob", response_model=JobView,
               summary="Cancel a running job (where the operation allows it)",
               responses={404: {"model": Problem}, 409: {"model": Problem}})
async def cancel_job(request: Request, hub_id: str, job_id: str) -> JobView:
    try:
        return await _jobs(request).cancel(hub_id, job_id)
    except JobNotFound:
        raise ApiProblem(404, "job_not_found", "Unknown job", hub_id=hub_id) from None
    except JobNotCancellable:
        raise ApiProblem(409, "job_not_cancellable", "The job cannot be cancelled",
                         detail="it has finished, or the operation cannot be interrupted", hub_id=hub_id) from None
