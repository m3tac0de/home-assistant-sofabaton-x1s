"""The staged backup: how long a finished backup's bundle is held.

The server keeps no backup archive, like the Home Assistant integration
it mirrors here (server panel backup plan, decision 1). A finished
``backup`` job holds its bundle in memory for ``BACKUP_KEEP_SECONDS``
so the client can fetch or download it (more than once); after that the
bundle is dropped and the job's result says ``bundle_expired``. Starting
another backup on the same hub drops the previous one at once, so a hub
never holds more than one bundle. A client that is done with it drops it
early with ``DELETE .../jobs/{job_id}/bundle``.

The job's result, next to ``bundle``::

    filename            the download's file name
    activities, devices how many of each the bundle holds
    captured_at         the bundle's own timestamp
    payload_profile     full_backup (restorable) or structural
    bundle_available    the bundle can still be fetched
    bundle_expires_at   when it is dropped (null once it is gone)
    bundle_downloaded   the download route served it at least once
    bundle_expired      it was dropped by the timer or by a newer backup
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, Optional

from .jobs import ACTIVE, JobRunner
from .models import JobView

log = logging.getLogger(__name__)

BACKUP_KIND = "backup"
BACKUP_KEEP_SECONDS = 300.0


def backup_filename(bundle: Mapping[str, Any], fallback_name: Optional[str] = None) -> str:
    """``2026-09-20_14-03-11_Living_Room.json``: the bundle's ``captured_at``
    and the hub's name, in the integration's own format so files from both
    sort together."""

    hub_block = bundle.get("hub")
    hub_name = str(hub_block.get("name") or "").strip() if isinstance(hub_block, Mapping) else ""
    hub_name = hub_name or str(fallback_name or "").strip() or "hub"
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", hub_name).strip("._-") or "hub"
    captured_at = str(bundle.get("captured_at") or "").strip()
    match = re.match(r"^(\d{4}-\d{2}-\d{2})[T_ ](\d{2}):(\d{2}):(\d{2})", captured_at)
    if match:
        stamp = f"{match.group(1)}_{match.group(2)}-{match.group(3)}-{match.group(4)}"
    else:
        stamp = re.sub(r"[^0-9A-Za-z_-]+", "", captured_at) or "backup"
    return f"{stamp}_{safe_name}.json"


def backup_result(bundle: dict[str, Any], *, fallback_name: Optional[str] = None) -> dict[str, Any]:
    """The ``backup`` job's result around a fresh bundle (the stage fills in the expiry)."""

    def count(key: str) -> int:
        rows = bundle.get(key)
        return len(rows) if isinstance(rows, list) else 0

    return {
        "bundle": bundle,
        "filename": backup_filename(bundle, fallback_name),
        "activities": count("activities"),
        "devices": count("devices"),
        "captured_at": bundle.get("captured_at"),
        "payload_profile": bundle.get("payload_profile"),
        "bundle_available": True,
        "bundle_expires_at": None,
        "bundle_downloaded": False,
        "bundle_expired": False,
    }


class BackupStage:
    """Expires, drops and marks the bundles of finished backup jobs."""

    def __init__(self, jobs: JobRunner, *, keep_seconds: float = BACKUP_KEEP_SECONDS) -> None:
        self._jobs = jobs
        self._keep = float(keep_seconds)
        self._staged: dict[str, JobView] = {}
        self._timers: dict[str, asyncio.TimerHandle] = {}
        jobs.on_job_event(self._on_job_event)

    @property
    def keep_seconds(self) -> float:
        return self._keep

    # -- the runner's events -----------------------------------------------------

    def _on_job_event(self, hub_id: str, view: JobView) -> None:
        if view.kind != BACKUP_KIND:
            return
        if view.status in ACTIVE:
            # A new backup starts: the hub's previous bundle goes now.
            for job_id, staged in list(self._staged.items()):
                if staged.hub_id == hub_id and job_id != view.job_id:
                    self._release(job_id, expired=True)
            return
        if view.status != "done" or view.job_id in self._staged:
            return
        result = view.result
        if not isinstance(result, dict) or "bundle" not in result:
            return
        self._staged[view.job_id] = view
        expires = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(seconds=self._keep)
        # A new dict: responses already being serialised keep the one they hold.
        view.result = {**result, "bundle_expires_at": expires.isoformat()}
        self._timers[view.job_id] = asyncio.get_running_loop().call_later(
            self._keep, self._release, view.job_id, True)

    # -- what the routes do ---------------------------------------------------------

    def bundle(self, view: JobView) -> Optional[dict[str, Any]]:
        result = view.result
        bundle = result.get("bundle") if isinstance(result, dict) else None
        return bundle if isinstance(bundle, dict) else None

    def mark_downloaded(self, view: JobView) -> None:
        """The download route served the bundle. The timer is left alone:
        the response is still being read, and downloading again is allowed
        until the bundle expires."""

        result = view.result
        if not isinstance(result, dict) or result.get("bundle_downloaded"):
            return
        view.result = {**result, "bundle_downloaded": True}
        self._jobs.announce(view)

    def drop(self, view: JobView) -> bool:
        """The client is done with the bundle; True when there was one."""

        if self.bundle(view) is None:
            return False
        self._staged.setdefault(view.job_id, view)
        self._release(view.job_id, expired=False)
        return True

    def close(self) -> None:
        for timer in self._timers.values():
            timer.cancel()
        self._timers.clear()
        self._staged.clear()

    # -- internals ------------------------------------------------------------------------

    def _release(self, job_id: str, expired: bool) -> None:
        timer = self._timers.pop(job_id, None)
        if timer is not None:
            timer.cancel()
        view = self._staged.pop(job_id, None)
        if view is None or not isinstance(view.result, dict) or "bundle" not in view.result:
            return
        result = {key: value for key, value in view.result.items() if key != "bundle"}
        result.update(bundle_available=False, bundle_expires_at=None, bundle_expired=bool(expired))
        view.result = result
        log.info("backup %s on hub %s: bundle %s", job_id, view.hub_id, "expired" if expired else "dropped")
        self._jobs.announce(view)
