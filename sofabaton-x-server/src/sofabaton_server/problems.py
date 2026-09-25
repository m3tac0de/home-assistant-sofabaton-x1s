"""One failure shape for the whole API: raise ``ApiProblem``, get a ``Problem`` body.

The mapping from the library's typed errors to HTTP status (plan
section 7) lives here so every route uses the same table:

| condition                                  | status |
| unknown hub id or entity                   | 404    |
| hub configured but disabled                | 409    |
| ``HubBusyError`` (an app holds the hub)    | 409    |
| ``HubNotConnectedError``                   | 503    |
| ``FetchTimeoutError``                      | 504    |
| send refused (``False`` from the facade)   | 409    |
| ``HubRejectedError`` (write refused)       | 502    |
| ``SnapshotOutdatedError`` (stale If-Match) | 412    |
| ``SnapshotIncompleteError``                | 409    |
| ``IrLearnError``                           | 409    |
| ``ValueError`` (bad input to the library)  | 422    |
| another job holds the hub                  | 409    |
| a sync the hub refused (``SyncFailed``)    | 409 before the first write, 502 after |
| ``If-Match`` missing on a row edit         | 428    |
| ``DocumentError`` (a whole-document edit)  | 422 (``dangling_reference``, ``out_of_scope``, ``invalid_request``) or 409 (``entity_not_editable``, ``snapshot_incomplete``) |
| an apply that stopped (``ApplyStopped``)   | 409 before the first write, 502 after |
| a backup bundle no longer held             | 410 (``bundle_expired``); 404 ``bundle_not_found`` when the job never had one |
| a write without a credential (auth.py)     | 401 (``auth_required``, ``invalid_credentials``); 403 ``admin_required`` / ``cross_origin_refused`` / ``setup_local_only`` / ``wrong_password``; 429 ``login_throttled`` |
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import asdict
from typing import AsyncIterator, Optional

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from sofabaton import (
    DocumentError,
    DocumentIncompleteError,
    EntityNotEditableError,
    FetchTimeoutError,
    HubBusyError,
    HubNotConnectedError,
    HubRejectedError,
    IrLearnError,
    SnapshotIncompleteError,
    SnapshotOutdatedError,
    WifiUpdateDeclined,
    WifiUpdateFailed,
)

from .models import Problem


class SyncFailed(RuntimeError):
    """A sync ran and the hub reported a failure (``SyncResult.status == "failed"``).

    ``wrote_nothing`` failures (plan, stale preflight) are 409: the hub is
    as it was; anything else is 502: the steps before ``completed_steps``
    landed and the rebased snapshot shows the partial edit. The
    ``SyncResult`` rides on the job as its ``result``.
    """

    def __init__(self, result) -> None:
        super().__init__(f"sync failed at {result.failed_at}: {result.message or 'no detail'}")
        self.result = result
        self.job_result = result.to_dict()


class RestoreFailed(RuntimeError):
    """A restore ran and the engine reported a failure (``RestoreResult.status == "failed"``).

    502 when the hub was changed before the failure: entities were
    restored (a partial restore; the rebased snapshot shows it) or a
    replacing restore had already erased it. 409 when nothing was written. The ``RestoreResult`` rides on the job as its ``result``.
    """

    def __init__(self, result) -> None:
        where = result.failed_at
        super().__init__(f"restore failed at {where[0] if where else 'unknown'} {where[1] if where else ''}".rstrip())
        self.result = result
        self.job_result = result.to_dict()


class ApplyStopped(RuntimeError):
    """A document write ran and stopped short (``HubSyncResult.status != "success"``).

    409 when nothing was written (stage B refused, or the first item
    failed before its first write), 502 after a partial run; the
    ``HubSyncResult`` rides on the job as its ``result`` and the apply
    record says how to resume.
    """

    def __init__(self, result) -> None:
        super().__init__(f"apply {result.status} at {result.failed_at or 'unknown'}: {result.message or 'no detail'}")
        self.result = result
        self.job_result = result.to_dict()


def document_problem(err: DocumentError, hub_id: str) -> "ApiProblem":
    """The ``ApiProblem`` for a stage A refusal of a whole-document edit."""

    entity = getattr(err, "entity", None)
    detail = str(err)
    if isinstance(err, DocumentIncompleteError):
        return ApiProblem(409, "snapshot_incomplete", "Some activities were never read in full", detail=detail, hub_id=hub_id)
    if isinstance(err, EntityNotEditableError):
        return ApiProblem(409, "entity_not_editable", "The entity was never read in full", detail=detail, hub_id=hub_id)
    code = getattr(err, "code", "invalid_request")
    titles = {
        "dangling_reference": "The document references an entity it removes or never had",
        "out_of_scope": "An entity's change is not one the live editor supports",
    }
    title = titles.get(code, "Invalid document")
    if entity is not None:
        detail = f"{entity[0]} {entity[1]}: {detail}" if not detail.startswith(f"{entity[0]} {entity[1]}") else detail
    return ApiProblem(422, code, title, detail=detail, hub_id=hub_id)


class ApiProblem(Exception):
    def __init__(
        self,
        status: int,
        type_: str,
        title: str,
        *,
        detail: Optional[str] = None,
        hub_id: Optional[str] = None,
        mode: Optional[str] = None,
        headers: Optional[dict[str, str]] = None,
    ) -> None:
        super().__init__(f"{status} {type_}: {detail or title}")
        self.problem = Problem(type=type_, title=title, status=status, detail=detail, hub_id=hub_id, mode=mode)
        # WWW-Authenticate on a 401, Retry-After on a 429.
        self.headers = dict(headers or {})


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiProblem)
    async def _handle(_request: Request, err: ApiProblem) -> JSONResponse:
        return JSONResponse(status_code=err.problem.status, content=asdict(err.problem), headers=err.headers or None)

    @app.exception_handler(RequestValidationError)
    async def _handle_validation(_request: Request, err: RequestValidationError) -> JSONResponse:
        # One failure shape for the whole API: a bad body or query is a
        # Problem too, not the framework's list-of-errors document.
        problem = Problem(type="validation_error", title="Invalid request", status=422,
                          detail=summarize_validation(err))
        return JSONResponse(status_code=422, content=asdict(problem))


def summarize_validation(err: RequestValidationError) -> str:
    parts = []
    for item in err.errors():
        loc = ".".join(str(p) for p in item.get("loc", ()) if p != "body") or "body"
        parts.append(f"{loc}: {item.get('msg', 'invalid')}")
    return "; ".join(parts) or "invalid request"


def hub_not_found(hub_id: str) -> ApiProblem:
    return ApiProblem(404, "hub_not_found", "Unknown hub", hub_id=hub_id)


def entity_not_found(hub_id: str, kind: str, entity_id: int) -> ApiProblem:
    return ApiProblem(404, f"{kind}_not_found", f"Unknown {kind}", detail=f"{kind} {entity_id} is not in the hub's catalog", hub_id=hub_id)


def hub_start_failed(hub_id: str, cause: BaseException) -> ApiProblem:
    return ApiProblem(503, "hub_start_failed", "The hub's proxy could not start",
                      detail=str(cause), hub_id=hub_id, mode="disconnected")


def hub_disabled(hub_id: str) -> ApiProblem:
    return ApiProblem(409, "hub_disabled", "Hub is disabled", detail="enable it first", hub_id=hub_id, mode="disconnected")


def problem_for(err: BaseException, hub_id: str) -> Optional[ApiProblem]:
    """The ``ApiProblem`` for one of the library's typed errors, else None."""

    if isinstance(err, HubBusyError):
        return ApiProblem(409, "hub_busy", "An app client holds the hub", detail=str(err), hub_id=hub_id, mode="observe")
    if isinstance(err, HubNotConnectedError):
        return ApiProblem(503, "hub_not_connected", "Hub is not connected", detail=str(err), hub_id=hub_id, mode="disconnected")
    if isinstance(err, FetchTimeoutError):
        return ApiProblem(504, "hub_timeout", "The hub did not reply in time", detail=str(err), hub_id=hub_id)
    if isinstance(err, WifiUpdateDeclined):
        detail = str(err)
        if err.command_ids:
            detail = f"{err.reason}: command ids {list(err.command_ids)}"
        elif err.detail:
            detail = f"{err.reason}: {err.detail}"
        return ApiProblem(409, "callback_update_declined", "The callback device could not be updated in place",
                          detail=detail, hub_id=hub_id)
    if isinstance(err, WifiUpdateFailed):
        return ApiProblem(502, "callback_update_failed", "The hub rejected an in-place update step",
                          detail=f"failed at {err.failed_at} after {err.completed_steps} step(s)", hub_id=hub_id)
    if isinstance(err, HubRejectedError):
        return ApiProblem(502, "hub_rejected", "The hub refused the write", detail=str(err), hub_id=hub_id)
    if isinstance(err, SnapshotOutdatedError):
        return ApiProblem(412, "snapshot_outdated", "The snapshot moved", detail=str(err), hub_id=hub_id)
    if isinstance(err, DocumentError):
        return document_problem(err, hub_id)
    if isinstance(err, ApplyStopped):
        status = 409 if int(err.result.writes or 0) == 0 else 502
        return ApiProblem(status, "apply_stopped", "The document write did not complete",
                          detail=f"{err.result.status} at {err.result.failed_at or 'unknown'}: "
                                 f"{err.result.message or 'no detail'}; resume with POST /applies/{err.result.apply_id}/resume",
                          hub_id=hub_id)
    if isinstance(err, SnapshotIncompleteError):
        return ApiProblem(409, "entity_not_editable", "The entity was never read in full", detail=str(err), hub_id=hub_id)
    if isinstance(err, IrLearnError):
        return ApiProblem(409, "ir_learn_failed", "No IR code was captured", detail=str(err), hub_id=hub_id)
    if isinstance(err, RestoreFailed):
        status = 409 if err.result.wrote_nothing else 502
        where = err.result.failed_at
        detail = (f"failed at {where[0]} {where[1]}" if where and where[1] is not None
                  else f"failed at {where[0]}" if where else "failed")
        return ApiProblem(status, "restore_failed", "The restore did not complete",
                          detail=f"{detail}; {err.result.restored_devices} device(s) and "
                                 f"{err.result.restored_activities} activity(ies) were restored first"
                                 + ("; the hub had been erased for the replace" if err.result.erased else ""),
                          hub_id=hub_id)
    if isinstance(err, SyncFailed):
        status = 409 if err.result.wrote_nothing else 502
        return ApiProblem(status, "sync_failed", "The hub did not take the edit",
                          detail=f"failed at {err.result.failed_at}: {err.result.message or 'no detail'}", hub_id=hub_id)
    if isinstance(err, ValueError):
        return ApiProblem(422, "invalid_request", "Invalid request", detail=str(err), hub_id=hub_id)
    return None


def problem_body(err: BaseException, hub_id: str) -> Problem:
    """A ``Problem`` for a failed job: the typed mapping, else a 500."""

    mapped = problem_for(err, hub_id)
    if mapped is not None:
        return mapped.problem
    return Problem(type="internal_error", title="The operation failed", status=500, detail=str(err) or err.__class__.__name__, hub_id=hub_id)


@asynccontextmanager
async def hub_errors(hub_id: str) -> AsyncIterator[None]:
    """Translate the library's typed errors raised inside the block."""

    try:
        yield
    except Exception as err:  # noqa: BLE001
        mapped = problem_for(err, hub_id)
        if mapped is None:
            raise
        raise mapped from err
