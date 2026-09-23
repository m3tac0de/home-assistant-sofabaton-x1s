"""``/server/updates``: the PyPI update check (see ``updates.py``).

``GET`` reports the last check and the schedule, ``POST .../check``
performs one check now without changing the schedule, ``PUT`` turns the
daily automatic check on or off (written to ``server.json`` as
``update_check``; 409 when the environment pinned it). Notification
only: nothing here downloads or installs anything.
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel

from . import API_PREFIX
from .config import Settings, write_settings_file
from .models import Problem
from .problems import ApiProblem
from .updates import UpdateChecker, UpdateStatus

router = APIRouter(prefix=f"{API_PREFIX}/server", tags=["server"])


class UpdateCheckSettings(BaseModel):
    """Body of ``PUT /server/updates``."""

    automatic: bool


def _checker(request: Request) -> UpdateChecker:
    return request.app.state.update_checker


@router.get("/updates", operation_id="getUpdateStatus", response_model=UpdateStatus,
            summary="The last update check against PyPI and the automatic schedule")
async def get_update_status(request: Request) -> UpdateStatus:
    return _checker(request).status()


@router.post("/updates/check", operation_id="checkForUpdates", response_model=UpdateStatus,
             summary="Check PyPI for a newer release now (one check; nothing is downloaded or installed)")
async def check_for_updates(request: Request) -> UpdateStatus:
    checker = _checker(request)
    await checker.check(source="manual")
    return checker.status()


@router.put("/updates", operation_id="configureUpdateCheck", response_model=UpdateStatus,
            summary="Turn the daily automatic update check on or off (saved to server.json)",
            responses={409: {"model": Problem}, 500: {"model": Problem}})
async def configure_update_check(request: Request, body: UpdateCheckSettings) -> UpdateStatus:
    checker = _checker(request)
    settings: Settings = request.app.state.settings
    if body.automatic != checker.automatic:
        if checker.automatic_pinned:
            raise ApiProblem(409, "setting_pinned", "Set by an environment variable or CLI flag",
                             detail="update_check cannot be changed here; change it where the server is started")
        try:
            write_settings_file(settings.data_dir, {"update_check": body.automatic})
        except (OSError, ValueError) as err:
            raise ApiProblem(500, "settings_write_failed", "Could not write server.json", detail=str(err)) from None
        checker.set_automatic(body.automatic)
    return checker.status()
