"""Update check: is a newer ``sofabaton-x-server`` release on PyPI?

Notification only. A check fetches the project's public release metadata
from PyPI's JSON API (https://docs.pypi.org/api/json/) and compares the
newest final, non-yanked release with the installed version locally.
Nothing about this installation goes out: no hub information, no
configuration, not the installed version, no identifier; the request is
the same one a browser makes for the project page. Nothing is ever
downloaded or installed.

Off by default. With ``update_check`` false (server.json, environment)
the server makes no update-related request on its own: not at startup,
not when the control panel opens. ``POST /server/updates/check`` performs
one check on request without enabling anything. With the setting true a
check runs once a day (an hour after a failed one), the first shortly
after startup unless the last one is recent enough: the outcome is kept
in ``update-check.json`` in the data directory so a restart keeps the
cadence and the "last checked" line.

A failed request never reads as up to date: the status is one of
``not_checked``, ``up_to_date``, ``update_available`` and ``failed``, and
the panel words them as such.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal, Optional

from . import __version__
from .config import Settings

log = logging.getLogger(__name__)

PROJECT = "sofabaton-x-server"
PYPI_JSON_URL = f"https://pypi.org/pypi/{PROJECT}/json"
PYPI_PROJECT_URL = f"https://pypi.org/project/{PROJECT}/"
RELEASE_NOTES_URL = "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/CHANGELOG.md"
UPGRADE_URL = "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/docs/running-server.md#storage-and-upgrades"
STATE_FILE = "update-check.json"
CHECK_INTERVAL = timedelta(days=1)
RETRY_AFTER_FAILURE = timedelta(hours=1)
# The first automatic check after a start, when none is on record.
STARTUP_DELAY = timedelta(seconds=30)
FETCH_TIMEOUT = 15.0
# No version in it: the request must say nothing about this installation.
USER_AGENT = f"{PROJECT} update check (+https://github.com/m3tac0de/home-assistant-sofabaton-x1s)"

UpdateStatusKind = Literal["not_checked", "up_to_date", "update_available", "failed"]
CheckSource = Literal["manual", "automatic"]

Fetch = Callable[[], Awaitable[Any]]


# -- versions (PEP 440, the parts this project uses) ------------------------------

_VERSION = re.compile(
    r"^v?(?P<release>\d+(?:\.\d+)*)"
    r"(?:[-._]?(?P<pre_l>a|b|rc|alpha|beta|c|pre|preview)[-._]?(?P<pre_n>\d*))?"
    r"(?:[-._]?post[-._]?(?P<post>\d*))?"
    r"(?:[-._]?dev[-._]?(?P<dev>\d*))?$",
    re.IGNORECASE,
)
_PRE_RANK = {"a": 0, "alpha": 0, "b": 1, "beta": 1, "rc": 2, "c": 2, "pre": 2, "preview": 2}


@dataclass(frozen=True)
class ParsedVersion:
    release: tuple[int, ...]
    pre: Optional[tuple[int, int]]
    post: Optional[int]
    dev: Optional[int]

    @property
    def is_prerelease(self) -> bool:
        return self.pre is not None or self.dev is not None

    @property
    def key(self) -> tuple:
        # dev-only < pre-releases < final < post; a dev suffix sorts below its base.
        if self.pre is not None:
            stage: tuple = (0, self.pre[0], self.pre[1])
        elif self.dev is not None and self.post is None:
            stage = (-1,)
        else:
            stage = (1,)
        return (self.release, stage, -1 if self.post is None else self.post, (1,) if self.dev is None else (0, self.dev))


def parse_version(text: Any) -> Optional[ParsedVersion]:
    """A PEP 440 version's ordering parts; ``None`` for anything else (a local
    label or an epoch is more than this needs)."""

    if not isinstance(text, str):
        return None
    match = _VERSION.match(text.strip())
    if not match:
        return None
    release = tuple(int(part) for part in match.group("release").split("."))
    while len(release) > 1 and release[-1] == 0:
        release = release[:-1]
    pre = None
    if match.group("pre_l"):
        pre = (_PRE_RANK[match.group("pre_l").lower()], int(match.group("pre_n") or 0))
    post = int(match.group("post") or 0) if match.group("post") is not None else None
    dev = int(match.group("dev") or 0) if match.group("dev") is not None else None
    return ParsedVersion(release, pre, post, dev)


def is_newer(candidate: str, installed: str) -> bool:
    """Whether ``candidate`` orders after ``installed``; false when either does not parse."""

    a, b = parse_version(candidate), parse_version(installed)
    return a is not None and b is not None and a.key > b.key


def newest_release(payload: Any) -> Optional[str]:
    """The newest final release with an un-yanked file in a PyPI project
    document. Pre-releases never count: a stable install is not told to
    move to a beta. Without a ``releases`` map, ``info.version`` decides."""

    if not isinstance(payload, dict):
        return None
    releases = payload.get("releases")
    best: Optional[tuple[tuple, str]] = None
    if isinstance(releases, dict):
        for version, files in releases.items():
            parsed = parse_version(version)
            if parsed is None or parsed.is_prerelease:
                continue
            if not isinstance(files, list) or not files:
                continue
            if all(isinstance(f, dict) and f.get("yanked") for f in files):
                continue
            if best is None or parsed.key > best[0]:
                best = (parsed.key, str(version))
        return best[1] if best else None
    info = payload.get("info")
    version = info.get("version") if isinstance(info, dict) else None
    parsed = parse_version(version)
    return str(version) if parsed is not None and not parsed.is_prerelease else None


# -- the check --------------------------------------------------------------------


@dataclass(frozen=True)
class UpdateCheckResult:
    checked_at: datetime
    ok: bool
    source: CheckSource
    latest_version: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {"checked_at": self.checked_at.isoformat(), "ok": self.ok, "source": self.source,
                "latest_version": self.latest_version, "error": self.error}

    @classmethod
    def from_dict(cls, data: Any) -> Optional["UpdateCheckResult"]:
        try:
            checked_at = datetime.fromisoformat(str(data["checked_at"]))
            if checked_at.tzinfo is None:
                checked_at = checked_at.replace(tzinfo=timezone.utc)
            source = data.get("source", "manual")
            return cls(checked_at=checked_at, ok=bool(data["ok"]),
                       source="automatic" if source == "automatic" else "manual",
                       latest_version=(str(data["latest_version"]) if data.get("latest_version") else None),
                       error=(str(data["error"]) if data.get("error") else None))
        except (KeyError, TypeError, ValueError, AttributeError):
            return None


@dataclass(frozen=True)
class UpdateStatus:
    """What ``GET /server/updates`` (and the ``update`` block of ``GET /server``) says.

    ``status`` is the verdict of the last check against the version running
    now: ``not_checked`` (none on record), ``up_to_date`` (the last check
    found nothing newer), ``update_available`` (``latest_version`` is
    newer), ``failed`` (the last check did not get an answer; ``error``
    says why, and nothing is known about newer releases).
    """

    installed_version: str
    status: UpdateStatusKind
    latest_version: Optional[str]
    checked_at: Optional[str]
    checked_by: Optional[CheckSource]
    error: Optional[str]
    # The daily automatic check (server.json ``update_check``); pinned when
    # the environment set it, so the panel cannot change it.
    automatic: bool
    automatic_pinned: bool
    next_check_at: Optional[str]
    # A check is running now (a second POST .../check waits for it).
    checking: bool
    release_notes_url: str
    upgrade_url: str
    # The newest release's page on PyPI, the project page until a check finds one.
    pypi_url: str


async def fetch_pypi_json(url: str = PYPI_JSON_URL, timeout: float = FETCH_TIMEOUT) -> Any:
    """The project document from PyPI, in a thread (urllib blocks)."""

    def _get() -> Any:
        request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (https, fixed host)
            return json.loads(response.read().decode("utf-8"))

    return await asyncio.to_thread(_get)


class UpdateChecker:
    """Runs and remembers update checks; owns the daily schedule."""

    def __init__(self, settings: Settings, *, installed_version: str = __version__,
                 fetch: Optional[Fetch] = None, now: Optional[Callable[[], datetime]] = None,
                 interval: timedelta = CHECK_INTERVAL, retry_after_failure: timedelta = RETRY_AFTER_FAILURE,
                 startup_delay: timedelta = STARTUP_DELAY) -> None:
        self._data_dir = Path(settings.data_dir)
        self.installed_version = installed_version
        self.automatic = bool(settings.update_check)
        self.automatic_pinned = "update_check" in settings.pinned
        self._fetch: Fetch = fetch or fetch_pypi_json
        self._now = now or (lambda: datetime.now(timezone.utc))
        self._interval = interval
        self._retry = retry_after_failure
        self._startup_delay = startup_delay
        self.last: Optional[UpdateCheckResult] = self._load()
        self._inflight: Optional[asyncio.Task[UpdateCheckResult]] = None
        self._loop_task: Optional[asyncio.Task[None]] = None
        self._listeners: list[Callable[[UpdateCheckResult], None]] = []

    # -- persistence ----------------------------------------------------------------

    @property
    def state_path(self) -> Path:
        return self._data_dir / STATE_FILE

    def _load(self) -> Optional[UpdateCheckResult]:
        try:
            if not self.state_path.exists():
                return None
            return UpdateCheckResult.from_dict(json.loads(self.state_path.read_text(encoding="utf-8")))
        except (OSError, ValueError):
            log.warning("updates: %s unreadable; starting with no check on record", self.state_path)
            return None

    def _save(self, result: UpdateCheckResult) -> None:
        try:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.state_path.with_suffix(self.state_path.suffix + ".tmp")
            tmp.write_text(json.dumps(result.to_dict(), indent=2) + "\n", encoding="utf-8")
            os.replace(tmp, self.state_path)
        except OSError as err:
            log.warning("updates: could not write %s: %s", self.state_path, err)

    # -- lifecycle -------------------------------------------------------------------

    def on_result(self, listener: Callable[[UpdateCheckResult], None]) -> None:
        self._listeners.append(listener)

    async def start(self) -> None:
        self._reschedule()

    async def stop(self) -> None:
        task, self._loop_task = self._loop_task, None
        if task is not None:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        inflight = self._inflight
        if inflight is not None and not inflight.done():
            inflight.cancel()
            try:
                await inflight
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass

    def set_automatic(self, enabled: bool) -> None:
        """Turn the daily check on or off, live. The caller persists the setting."""

        self.automatic = bool(enabled)
        self._reschedule()

    def _reschedule(self) -> None:
        task, self._loop_task = self._loop_task, None
        if task is not None:
            task.cancel()
        if self.automatic:
            self._loop_task = asyncio.get_running_loop().create_task(self._run_schedule(), name="update-check")

    def next_check_at(self) -> Optional[datetime]:
        """When the schedule fires next; ``None`` with automatic checks off."""

        if not self.automatic:
            return None
        if self.last is None:
            return self._now() + self._startup_delay
        wait = self._interval if self.last.ok else self._retry
        due = self.last.checked_at + wait
        # Overdue at start (the server was down): soon, not at once.
        return max(due, self._now() + self._startup_delay)

    async def _run_schedule(self) -> None:
        while self.automatic:
            due = self.next_check_at()
            if due is None:
                return
            await asyncio.sleep(max(0.0, (due - self._now()).total_seconds()))
            if not self.automatic:
                return
            await self.check(source="automatic")

    # -- the check -------------------------------------------------------------------

    @property
    def checking(self) -> bool:
        return self._inflight is not None and not self._inflight.done()

    async def check(self, source: CheckSource = "manual") -> UpdateCheckResult:
        """One check now. A check already running answers this call too."""

        if self.checking:
            assert self._inflight is not None
            return await asyncio.shield(self._inflight)
        self._inflight = asyncio.get_running_loop().create_task(self._check(source), name="update-check-once")
        try:
            return await asyncio.shield(self._inflight)
        finally:
            if self._inflight is not None and self._inflight.done():
                self._inflight = None

    async def _check(self, source: CheckSource) -> UpdateCheckResult:
        try:
            payload = await self._fetch()
            latest = newest_release(payload)
            if latest is None:
                raise ValueError("no release found in PyPI's answer")
            result = UpdateCheckResult(checked_at=self._now(), ok=True, source=source, latest_version=latest)
        except asyncio.CancelledError:
            raise
        except Exception as err:  # noqa: BLE001 (any failure is one outcome: not checked)
            result = UpdateCheckResult(checked_at=self._now(), ok=False, source=source, error=_describe(err))
        self.last = result
        self._save(result)
        if result.ok:
            newer = result.latest_version is not None and is_newer(result.latest_version, self.installed_version)
            log.info("updates: %s check found %s (installed %s)%s", source, result.latest_version,
                     self.installed_version, "; newer" if newer else "; up to date")
        else:
            log.warning("updates: %s check failed: %s", source, result.error)
        for listener in list(self._listeners):
            try:
                listener(result)
            except Exception:  # noqa: BLE001
                log.exception("updates: result listener failed")
        return result

    # -- the view ---------------------------------------------------------------------

    def status(self) -> UpdateStatus:
        last = self.last
        if last is None:
            kind: UpdateStatusKind = "not_checked"
        elif not last.ok:
            kind = "failed"
        elif last.latest_version is not None and is_newer(last.latest_version, self.installed_version):
            kind = "update_available"
        else:
            kind = "up_to_date"
        latest = last.latest_version if last is not None and last.ok else None
        next_at = self.next_check_at()
        return UpdateStatus(
            installed_version=self.installed_version,
            status=kind,
            latest_version=latest,
            checked_at=last.checked_at.isoformat() if last is not None else None,
            checked_by=last.source if last is not None else None,
            error=last.error if last is not None and not last.ok else None,
            automatic=self.automatic,
            automatic_pinned=self.automatic_pinned,
            next_check_at=next_at.isoformat() if next_at is not None else None,
            checking=self.checking,
            release_notes_url=RELEASE_NOTES_URL,
            upgrade_url=UPGRADE_URL,
            pypi_url=f"{PYPI_PROJECT_URL}{latest}/" if latest else PYPI_PROJECT_URL,
        )


def _describe(err: Exception) -> str:
    if isinstance(err, urllib.error.HTTPError):
        return f"PyPI answered {err.code}"
    if isinstance(err, urllib.error.URLError):
        return f"could not reach PyPI: {err.reason}"
    if isinstance(err, (TimeoutError, asyncio.TimeoutError)):
        return "PyPI did not answer in time"
    if isinstance(err, json.JSONDecodeError):
        return "PyPI's answer was not JSON"
    text = str(err).strip()
    return f"{type(err).__name__}: {text}" if text else type(err).__name__
