"""Whole-document writes (phase 4 plan, S13): ``PUT /hubs/{id}/snapshot``,
``POST /hubs/{id}/snapshot/plan`` and the apply records under
``/hubs/{id}/applies``.

A client reads ``GET /snapshot``, edits the whole document (any number
of entities; new ones carry negative placeholder ids) and puts it back
with ``If-Match``. The server validates it without hub traffic (stage
A), creates an **apply record** (the library's ``ApplyState``: both
documents, the placeholder map, every item and its outcome), and runs
the library's ``sync_hub`` as a cancellable job that re-reads the
affected entities first (stage B) and writes the items in order inside
one batch: at most one explicit remote-sync trigger when requested,
with coalesced snapshot notifications. No-op work need not emit an event.

The record is saved after each item and when a created ID becomes known.
Resume accepts stopped/cancelled records, but uncertain creates can repeat
and an abrupt interruption can leave an outdated checkpoint. Startup does
not reconcile records left queued/running. See README recovery limitations.
Idempotency lookup happens only after control and revision checks; replaying
the original PUT can fail 412 after its first write changes the snapshot.
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Header, Request, Response
from pydantic import BaseModel, ConfigDict, Field

from sofabaton import (
    ApplyState,
    AsyncXProxy,
    DocumentError,
    HubSyncResult,
    build_hub_sync_plan,
)

from . import API_PREFIX
from .jobs import JobView
from .models import Problem, now_iso
from .problems import ApiProblem, ApplyStopped, document_problem
from .routes_edit import IF_MATCH, _check_if_match, _proxy, _require_control
from .routes_snapshot import start_job
from .store import ApplyRecord, ApplyStore

log = logging.getLogger(__name__)

router = APIRouter(prefix=f"{API_PREFIX}/hubs/{{hub_id}}", tags=["apply"])

_PLAN_ERRORS = {404: {"model": Problem}, 409: {"model": Problem}, 422: {"model": Problem}, 503: {"model": Problem}}
_APPLY_ERRORS = {**_PLAN_ERRORS, 412: {"model": Problem}, 428: {"model": Problem}}

IDEMPOTENCY_KEY = Header(None, alias="Idempotency-Key", max_length=200,
                         description="Client token for a retained apply record. After control and If-Match checks pass, "
                                     "the same token/document returns the existing job view (200). The original retry "
                                     "can fail 412 after a write changes the revision; inspect applies/jobs before resubmitting.")


# -- bodies and views ---------------------------------------------------------------


class SnapshotEditDocument(BaseModel):
    """The edited snapshot document: what ``GET /snapshot`` returned, changed.

    Header fields are ignored (``snapshot_id`` goes in ``If-Match``). A new
    device or activity carries a negative ``device.device_id`` of the
    client's choosing, and every reference to it elsewhere in the document
    (bindings, favorites, macro steps, membership) uses that same negative
    id; the hub assigns the real id and the server maps it. The array
    order of ``devices`` / ``activities`` is the display order. A removed
    entity must be removed from every activity in the same document.
    """

    model_config = ConfigDict(extra="allow")

    hub: dict[str, Any] = Field(default_factory=dict)
    devices: list[dict[str, Any]] = Field(default_factory=list)
    activities: list[dict[str, Any]] = Field(default_factory=list)


class SyncPlanStepView(BaseModel):
    kind: str
    label: str
    target_device_id: Optional[int] = None


class HubSyncItemView(BaseModel):
    """One unit of a document write, in run order."""

    index: int
    kind: str
    label: str
    entity_kind: Optional[str] = None
    entity_id: Optional[int] = None
    placeholder_id: Optional[int] = None
    step_count: int = 0
    steps: list[SyncPlanStepView] = Field(default_factory=list)
    provisional: bool = False


class EntityRefView(BaseModel):
    kind: str
    entity_id: int


class HubSyncPlanView(BaseModel):
    """What ``PUT /snapshot`` would do, in order. Nothing is written.

    ``live_check`` lists the entities re-read before the first write;
    ``provisional_ids`` maps each placeholder to the id the preview
    assumed (the hub assigns the real one). ``notes`` are the things a
    UI may want to confirm first: deletions, payload overwrites,
    membership changes.
    """

    item_count: int
    step_count: int
    items: list[HubSyncItemView]
    notes: list[str]
    live_check: list[EntityRefView]
    live_check_count: int
    provisional_ids: dict[str, int]


class ApplyItemView(BaseModel):
    index: int
    kind: str
    label: str
    entity_kind: Optional[str] = None
    entity_id: Optional[int] = None
    placeholder_id: Optional[int] = None
    status: str
    completed_steps: int = 0
    total_steps: int = 0
    failed_at: Optional[str] = None
    preflight: Optional[str] = None
    message: Optional[str] = None


class ApplySummary(BaseModel):
    """One apply record as ``GET /applies`` lists it (documents omitted)."""

    apply_id: str
    hub_id: str
    status: str
    resumable: bool
    job_id: Optional[str] = None
    idempotency_key: Optional[str] = None
    created_at: str
    updated_at: str
    runs: int = 0
    cursor: int = 0
    item_count: int = 0
    writes: int = 0
    remote_sync: Optional[str] = None
    snapshot_id: Optional[str] = None
    failed_at: Optional[str] = None
    message: Optional[str] = None
    needs_refresh: list[EntityRefView] = Field(default_factory=list)
    id_map: dict[str, int] = Field(default_factory=dict)


class ApplyView(ApplySummary):
    """The full record: the summary plus every item and the two documents."""

    items: list[ApplyItemView] = Field(default_factory=list)
    baseline: dict[str, Any] = Field(default_factory=dict)
    desired: dict[str, Any] = Field(default_factory=dict)
    placeholders: dict[str, Optional[int]] = Field(default_factory=dict)


# -- helpers ----------------------------------------------------------------------


def _store(request: Request) -> ApplyStore:
    return request.app.state.apply_store


def _jobs(request: Request):
    return request.app.state.job_runner


def _digest(document: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(document, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")).hexdigest()


def _plan_view(plan) -> HubSyncPlanView:
    data = plan.to_dict()
    return HubSyncPlanView(
        item_count=data["item_count"], step_count=data["step_count"],
        items=[HubSyncItemView(**{k: v for k, v in item.items() if k != "payload"}) for item in data["items"]],
        notes=data["notes"],
        live_check=[EntityRefView(**ref) for ref in data["live_check"]],
        live_check_count=data["live_check_count"],
        provisional_ids=data["provisional_ids"],
    )


def _summary(record: ApplyRecord) -> dict[str, Any]:
    state = record.state
    return {
        "apply_id": record.apply_id, "hub_id": record.hub_id,
        "status": str(state.get("status") or "queued"),
        "resumable": str(state.get("status")) in ("stopped", "cancelled"),
        "job_id": record.job_id, "idempotency_key": record.idempotency_key,
        "created_at": record.created_at, "updated_at": record.updated_at,
        "runs": int(state.get("runs") or 0), "cursor": int(state.get("cursor") or 0),
        "item_count": len(state.get("items") or []), "writes": int(state.get("writes") or 0),
        "remote_sync": state.get("remote_sync"), "snapshot_id": state.get("snapshot_id"),
        "failed_at": state.get("failed_at"), "message": state.get("message"),
        "needs_refresh": [EntityRefView(**ref) for ref in state.get("needs_refresh") or []],
        "id_map": {str(k): int(v) for k, v in (state.get("placeholders") or {}).items() if v is not None},
    }


def summary_view(record: ApplyRecord) -> ApplySummary:
    return ApplySummary(**_summary(record))


def full_view(record: ApplyRecord) -> ApplyView:
    state = record.state
    return ApplyView(
        **_summary(record),
        items=[ApplyItemView(**{k: v for k, v in item.items() if k != "payload"}) for item in state.get("items") or []],
        baseline=dict(state.get("baseline") or {}), desired=dict(state.get("desired") or {}),
        placeholders=dict(state.get("placeholders") or {}),
    )


def _record_or_404(request: Request, hub_id: str, apply_id: str) -> ApplyRecord:
    record = _store(request).load(hub_id, apply_id)
    if record is None:
        raise ApiProblem(404, "apply_not_found", "Unknown apply", detail=f"no apply {apply_id} on this hub", hub_id=hub_id)
    return record


def _stage_a(proxy_bundle: dict[str, Any], body: SnapshotEditDocument, hub_id: str, hub_version: Optional[str]):
    try:
        return build_hub_sync_plan(proxy_bundle, body.model_dump(), hub_version=hub_version)
    except DocumentError as err:
        raise document_problem(err, hub_id) from err
    except ValueError as err:
        raise ApiProblem(422, "invalid_request", "Invalid document", detail=str(err), hub_id=hub_id) from err


def _job_view_from_record(record: ApplyRecord, hub_id: str) -> JobView:
    """A finished apply whose job the runner has forgotten: the record stands in."""

    state = record.state
    raw = str(state.get("status"))
    error: Optional[Problem] = None
    if raw == "success":
        status = "done"
    elif raw == "cancelled":
        status = "cancelled"
    elif raw == "stopped":
        status = "failed"
        error = Problem(type="apply_stopped", title="The apply stopped before it finished", status=409,
                        detail=f"inspect apply {record.apply_id} and resume it with POST /applies/{record.apply_id}/resume",
                        hub_id=hub_id)
    else:
        # Queued or running on disk, and no job knows it: the server went
        # down during the run. Never 'done' (CR-S2-6): the edit may not
        # have been written at all.
        status = "failed"
        error = Problem(type="apply_interrupted", title="The server stopped while this apply ran", status=409,
                        detail=f"inspect apply {record.apply_id} and resume it with POST /applies/{record.apply_id}/resume",
                        hub_id=hub_id)
    return JobView(
        job_id=record.job_id or record.apply_id, hub_id=hub_id, kind="sync_hub", status=status,  # type: ignore[arg-type]
        cancellable=True, created_at=record.created_at, started_at=record.created_at, finished_at=record.updated_at,
        result=_result_dict(record), error=error,
    )


def _result_dict(record: ApplyRecord) -> dict[str, Any]:
    try:
        return HubSyncResult.from_state(ApplyState.from_dict(record.state)).to_dict()
    except (ValueError, KeyError):
        return {"apply_id": record.apply_id, "status": record.state.get("status")}


def _run_apply(request: Request, hub_id: str, proxy: AsyncXProxy, record: ApplyRecord, *, kind: str,
               snapshot_id: Optional[str] = None) -> JobView:
    """Run (or resume) the record's state as a job; the record is rewritten
    after every item. The runner takes the state the server built, so the
    apply id on disk is the one the result reports."""

    store = _store(request)

    def persist(state: ApplyState) -> None:
        record.state = state.to_dict()
        record.updated_at = now_iso()
        try:
            store.save(record)
        except OSError:
            log.exception("apply %s on hub %s: could not write the record", record.apply_id, hub_id)

    async def run(progress) -> dict[str, Any]:
        state = ApplyState.from_dict(record.state)
        try:
            result: HubSyncResult = await proxy.sync_hub(
                state=state, snapshot_id=snapshot_id, progress=progress, on_state=persist,
            )
        finally:
            store.prune(hub_id)
        if result.status != "success":
            raise ApplyStopped(result)
        return result.to_dict()

    view = start_job(request, hub_id, kind, run, cancellable=True)
    record.job_id = view.job_id
    record.updated_at = now_iso()
    store.save(record)
    return view


# -- routes -------------------------------------------------------------------------


@router.post("/snapshot/plan", operation_id="planSnapshotEdit", response_model=HubSyncPlanView,
             summary="Preview what writing an edited snapshot document would do (nothing is written)",
             responses=_PLAN_ERRORS)
async def plan_snapshot_edit(request: Request, hub_id: str, body: SnapshotEditDocument) -> HubSyncPlanView:
    """Validate document structure and supported diffs without hub traffic.

    Preview does not validate every stored command's wire encoding or
    guarantee hardware acceptance. Command rows require stored-record
    ``restore_data``, not the REST command-create ``payload`` object.
    """
    proxy = _proxy(request, hub_id)
    snap = await proxy.snapshot()
    status = await proxy.status()
    return _plan_view(_stage_a(snap.bundle, body, hub_id, status.hub_version))


@router.put("/snapshot", operation_id="applySnapshot", response_model=JobView, status_code=202,
            summary="Write an edited snapshot document to the hub as one cancellable job; If-Match required",
            responses=_APPLY_ERRORS)
async def apply_snapshot(
    request: Request, hub_id: str, body: SnapshotEditDocument, response: Response,
    if_match: Optional[str] = IF_MATCH, idempotency_key: Optional[str] = IDEMPOTENCY_KEY,
) -> JobView:
    proxy = _proxy(request, hub_id)
    await _require_control(proxy, hub_id)
    snap = await proxy.snapshot()
    _check_if_match(if_match, snap, hub_id, required=True)
    document = body.model_dump()
    digest = _digest(document)
    store = _store(request)

    key = (idempotency_key or "").strip() or None
    if key:
        existing = store.find_by_key(hub_id, key)
        if existing is not None:
            if existing.desired_digest != digest:
                raise ApiProblem(409, "apply_key_reused", "Idempotency-Key already used for another document",
                                 detail=f"apply {existing.apply_id} was submitted with this key and a different document",
                                 hub_id=hub_id)
            jobs = _jobs(request)
            try:
                view = jobs.get(hub_id, existing.job_id or "")
            except KeyError:
                view = _job_view_from_record(existing, hub_id)
            response.status_code = 200
            return view

    status = await proxy.status()
    plan = _stage_a(snap.bundle, body, hub_id, status.hub_version)
    state = ApplyState.new(snap.bundle, document, plan, hub_version=status.hub_version)
    record = ApplyRecord(apply_id=state.apply_id, hub_id=hub_id, idempotency_key=key, desired_digest=digest,
                         state=state.to_dict())
    return _run_apply(request, hub_id, proxy, record, kind="sync_hub", snapshot_id=snap.snapshot_id)


@router.get("/applies", operation_id="listApplies", response_model=list[ApplySummary],
            summary="The hub's apply records, newest first (documents omitted)", responses={404: {"model": Problem}})
async def list_applies(request: Request, hub_id: str) -> list[ApplySummary]:
    _proxy_or_record(request, hub_id)
    return [summary_view(r) for r in _store(request).list(hub_id)]


@router.get("/applies/{apply_id}", operation_id="getApply", response_model=ApplyView,
            summary="One apply record in full: items, outcomes, both documents, the id map",
            responses={404: {"model": Problem}})
async def get_apply(request: Request, hub_id: str, apply_id: str) -> ApplyView:
    _proxy_or_record(request, hub_id)
    return full_view(_record_or_404(request, hub_id, apply_id))


@router.post("/applies/{apply_id}/resume", operation_id="resumeApply", response_model=JobView, status_code=202,
             summary="Continue a stopped or cancelled apply from the hub's actual state",
             responses=_PLAN_ERRORS)
async def resume_apply(request: Request, hub_id: str, apply_id: str) -> JobView:
    """Inspect the record and hub before requesting resume.

    Uncertain creates can duplicate, and the last persisted checkpoint can
    omit an in-flight write. Do not automatically resume these cases.
    Records left queued/running by an abrupt restart are not reconciled
    on startup and are rejected here with ``apply_not_resumable``.
    """
    proxy = _proxy(request, hub_id)
    record = _record_or_404(request, hub_id, apply_id)
    if str(record.state.get("status")) not in ("stopped", "cancelled"):
        raise ApiProblem(409, "apply_not_resumable", "The apply is not resumable",
                         detail=f"its status is {record.state.get('status')!r}; only a stopped or cancelled apply resumes",
                         hub_id=hub_id)
    await _require_control(proxy, hub_id)
    return _run_apply(request, hub_id, proxy, record, kind="resume_apply")


@router.delete("/applies/{apply_id}", operation_id="deleteApply", status_code=204,
               summary="Forget an apply record (not while its job runs)",
               responses={404: {"model": Problem}, 409: {"model": Problem}})
async def delete_apply(request: Request, hub_id: str, apply_id: str) -> Response:
    _proxy_or_record(request, hub_id)
    record = _record_or_404(request, hub_id, apply_id)
    if record.job_id:
        try:
            job = _jobs(request).get(hub_id, record.job_id)
        except KeyError:
            job = None
        if job is not None and job.status in ("queued", "running"):
            raise ApiProblem(409, "apply_running", "The apply's job is still running",
                             detail="cancel the job first", hub_id=hub_id)
    _store(request).delete(hub_id, apply_id)
    return Response(status_code=204)


def _proxy_or_record(request: Request, hub_id: str) -> None:
    """A hub that exists (enabled or not) may list its records."""

    from .manager import HubNotFound
    from .problems import hub_not_found

    try:
        request.app.state.hub_manager.record(hub_id)
    except HubNotFound:
        raise hub_not_found(hub_id) from None
