"""Jobs: long-running hub operations run in the background (plan S9).

A write or a structural refresh holds the hub session for seconds to
minutes, so a route starts a **job** and answers 202 with its record;
progress and completion reach clients as ``job_event`` messages on the
WebSocket stream and through ``GET /hubs/{id}/jobs/{job_id}``. One job
per hub at a time (reads are unaffected: they are engine cache reads).
Cancellation is per operation: a refresh stops between entities, a
restore cannot be interrupted. Finished jobs are kept in memory (the
most recent ones per hub) and never persisted.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from collections import deque
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from sofabaton import WriteProgress

from .models import JobStatus, JobView, Problem, now_iso

log = logging.getLogger(__name__)

ACTIVE: frozenset[str] = frozenset({"queued", "running"})
KEEP_FINISHED = 20

ProgressFn = Callable[[WriteProgress], None]
JobBody = Callable[[ProgressFn], Awaitable[Any]]
JobListener = Callable[[str, "JobView"], Any]


class JobConflict(RuntimeError):
    """Another job already holds this hub."""

    def __init__(self, active: "JobView") -> None:
        super().__init__(f"job {active.job_id} ({active.kind}) is {active.status} on hub {active.hub_id}")
        self.active = active


class JobNotFound(KeyError):
    """No job with that id on that hub."""


class JobNotCancellable(RuntimeError):
    """The job exists but cannot be interrupted (or already finished)."""


@dataclass
class _Job:
    view: JobView
    task: Optional[asyncio.Task] = None
    on_cancel: Optional[Callable[[], Awaitable[Any]]] = None
    cancel_requested: bool = False


class JobRunner:
    """Starts, tracks, cancels and announces jobs."""

    def __init__(self, *, problem_for: Callable[[BaseException, str], Problem], keep: int = KEEP_FINISHED) -> None:
        self._problem_for = problem_for
        self._keep = keep
        self._jobs: dict[str, _Job] = {}
        self._by_hub: dict[str, deque[str]] = {}
        self._active: dict[str, str] = {}
        self._listeners: list[JobListener] = []

    # -- listeners -----------------------------------------------------------

    def on_job_event(self, listener: JobListener) -> None:
        self._listeners.append(listener)

    def _emit(self, view: JobView) -> None:
        for listener in list(self._listeners):
            try:
                listener(view.hub_id, view)
            except Exception:  # noqa: BLE001
                log.exception("job listener failed")

    # -- queries -------------------------------------------------------------

    def get(self, hub_id: str, job_id: str) -> JobView:
        job = self._jobs.get(job_id)
        if job is None or job.view.hub_id != hub_id:
            raise JobNotFound(job_id)
        return job.view

    def list(self, hub_id: str) -> list[JobView]:
        return [self._jobs[j].view for j in self._by_hub.get(hub_id, ()) if j in self._jobs]

    def active(self, hub_id: str) -> Optional[JobView]:
        job_id = self._active.get(hub_id)
        return self._jobs[job_id].view if job_id in self._jobs else None

    def last_finished(self, hub_id: str) -> Optional[JobView]:
        """The newest job on the hub that reached a terminal status, or None."""

        for view in self.list(hub_id):
            if view.status not in ACTIVE:
                return view
        return None

    # -- lifecycle -----------------------------------------------------------

    def start(self, hub_id: str, kind: str, body: JobBody, *, cancellable: bool,
              on_cancel: Optional[Callable[[], Awaitable[Any]]] = None) -> JobView:
        """Start ``body(progress)`` as the hub's job; raises ``JobConflict`` when one runs.

        ``on_cancel`` is awaited before the task is cancelled, for an
        operation whose engine side must be told to stop (an IR learn).
        """

        current = self.active(hub_id)
        if current is not None and current.status in ACTIVE:
            raise JobConflict(current)
        view = JobView(
            job_id=uuid.uuid4().hex[:12], hub_id=hub_id, kind=kind, status="queued",
            cancellable=cancellable, created_at=now_iso(),
        )
        job = _Job(view=view, on_cancel=on_cancel)
        self._jobs[view.job_id] = job
        self._by_hub.setdefault(hub_id, deque(maxlen=self._keep + 1)).appendleft(view.job_id)
        self._active[hub_id] = view.job_id
        self._forget_old(hub_id)
        job.task = asyncio.create_task(self._run(job, body), name=f"job:{kind}:{view.job_id}")
        self._emit(view)
        return view

    async def _run(self, job: _Job, body: JobBody) -> None:
        view = job.view
        view.status = "running"
        view.started_at = now_iso()
        self._emit(view)

        def on_progress(progress: WriteProgress) -> None:
            view.progress = progress
            self._emit(view)

        try:
            result = await body(on_progress)
            view.result = result if isinstance(result, dict) else (None if result is None else {"value": result})
            view.status = "done"
        except asyncio.CancelledError:
            view.status = "cancelled"
        except Exception as err:  # noqa: BLE001
            view.status = "failed"
            view.error = self._problem_for(err, view.hub_id)
            job_result = getattr(err, "job_result", None)
            if isinstance(job_result, dict):
                view.result = job_result
            log.warning("job %s (%s) on hub %s failed: %s", view.job_id, view.kind, view.hub_id, err)
        finally:
            view.finished_at = now_iso()
            if self._active.get(view.hub_id) == view.job_id:
                self._active.pop(view.hub_id, None)
            self._emit(view)

    async def cancel(self, hub_id: str, job_id: str) -> JobView:
        job = self._jobs.get(job_id)
        if job is None or job.view.hub_id != hub_id:
            raise JobNotFound(job_id)
        if job.view.status not in ACTIVE or not job.view.cancellable or job.task is None:
            raise JobNotCancellable(job_id)
        if job.cancel_requested:
            # Already cancelling: the job is draining its in-flight work
            # (a refresh finishes the entity being read before it releases
            # the hub). Cancelling the task again would cut into that
            # drain (review of ce9f205, P2); the request is honoured
            # already, so report the state and change nothing.
            return job.view
        job.cancel_requested = True
        if job.on_cancel is not None:
            try:
                await job.on_cancel()
            except Exception:  # noqa: BLE001
                log.exception("job %s: on_cancel hook failed", job_id)
        job.task.cancel()
        return job.view

    async def shutdown(self, *, drain_timeout: float = 900.0) -> None:
        """Server stop: cancel cancellable jobs, DRAIN the others.

        A restore or a sync marked not cancellable keeps writing in its
        executor thread whatever happens to the task, so cancelling it
        would only let the lifespan stop the proxy underneath it (review
        of 635ecfe, finding 3). Such jobs are awaited, up to
        ``drain_timeout`` seconds each, before the hubs go down.
        """

        for job in list(self._jobs.values()):
            if job.task is None or job.task.done():
                continue
            if job.view.cancellable:
                job.task.cancel()
            else:
                log.info("shutdown: waiting for job %s (%s) on hub %s to finish",
                         job.view.job_id, job.view.kind, job.view.hub_id)
            try:
                await asyncio.wait_for(asyncio.shield(job.task), drain_timeout)
            except asyncio.TimeoutError:
                log.warning("shutdown: job %s (%s) did not finish within %.0fs; giving up on it",
                            job.view.job_id, job.view.kind, drain_timeout)
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    def _forget_old(self, hub_id: str) -> None:
        ids = self._by_hub.get(hub_id)
        if not ids:
            return
        finished = [j for j in list(ids)[self._keep:] if self._jobs.get(j) and self._jobs[j].view.status not in ACTIVE]
        for job_id in finished:
            self._jobs.pop(job_id, None)
            try:
                ids.remove(job_id)
            except ValueError:
                pass
