"""Server-side types: hub records, response views, request bodies, errors.

Responses are stdlib dataclasses (the library's own types are reused
unchanged); request bodies are pydantic models so a bad payload is a
422 with field detail rather than a 500.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, replace
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from sofabaton import HubConfig, HubStatus, WriteProgress


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def mac_key(mac: str) -> str:
    """Normalise a MAC to the hub-id form: lower-case hex, no separators."""

    return "".join(ch for ch in mac.lower() if ch in "0123456789abcdef")


# -- persistence record ----------------------------------------------------


@dataclass
class HubRecord:
    """One configured hub as stored in ``hubs.json``.

    ``hub_id`` is the banner MAC (``mac_key`` form) once known, the host
    string before that (plan decision 9).
    """

    hub_id: str
    config: HubConfig
    enabled: bool = True
    added_at: str = field(default_factory=now_iso)
    last_seen: Optional[str] = None
    # The hub's own name from its connect banner, learned on the first
    # ready sync and kept so a disabled hub still has a name to show.
    hub_name: Optional[str] = None
    # The callback device record (callbacks plan, section 8), owned by
    # the callback service; stored verbatim as ``callback_device``.
    callback_device: Optional[dict[str, Any]] = None
    # The keyed Wifi Devices (server panel wifi commands plan, section 2):
    # ``{key: record}``, the same record shape; ``callback_device`` is the
    # one that answers to the reserved key ``default``.
    wifi_devices: dict[str, dict[str, Any]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        data = {
            "hub_id": self.hub_id,
            "config": self.config.to_dict(),
            "enabled": self.enabled,
            "added_at": self.added_at,
            "last_seen": self.last_seen,
        }
        if self.hub_name is not None:
            data["hub_name"] = self.hub_name
        if self.callback_device is not None:
            data["callback_device"] = dict(self.callback_device)
        if self.wifi_devices:
            data["wifi_devices"] = {str(key): dict(row) for key, row in self.wifi_devices.items()}
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "HubRecord":
        callback = data.get("callback_device")
        wifi = data.get("wifi_devices")
        return cls(
            hub_id=str(data["hub_id"]),
            config=HubConfig.from_dict(data["config"]),
            enabled=bool(data.get("enabled", True)),
            added_at=str(data.get("added_at") or now_iso()),
            last_seen=data.get("last_seen"),
            hub_name=str(data["hub_name"]) if data.get("hub_name") else None,
            callback_device=dict(callback) if isinstance(callback, dict) else None,
            wifi_devices={str(key): dict(row) for key, row in wifi.items() if isinstance(row, dict)}
            if isinstance(wifi, dict) else {},
        )


# -- response views ----------------------------------------------------------


JobStatus = Literal["queued", "running", "done", "failed", "cancelled"]


# Defined here rather than in jobs.py because HubView embeds it: the runner
# mutates the same object as the job progresses, and a response serialises
# it at the moment it is built.
@dataclass
class JobView:
    """One job as the API shows it."""

    job_id: str
    hub_id: str
    kind: str
    status: JobStatus
    cancellable: bool
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    progress: Optional[WriteProgress] = None
    result: Optional[dict[str, Any]] = None
    error: Optional["Problem"] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# Result entries too large to repeat: a backup's bundle runs to megabytes
# with its IR payloads. ``GET /hubs/{id}/jobs/{job_id}`` and the download
# route carry it; the event stream, the job list and the hub views do not.
HEAVY_RESULT_KEYS: tuple[str, ...] = ("bundle",)


def light_job(view: Optional[JobView]) -> Optional[JobView]:
    """A copy of ``view`` without the heavy result entries (the view itself
    when it has none). Always a copy where the runner still mutates it."""

    if view is None:
        return None
    result = view.result
    if isinstance(result, dict) and any(key in result for key in HEAVY_RESULT_KEYS):
        result = {key: value for key, value in result.items() if key not in HEAVY_RESULT_KEYS}
    return replace(view, result=result)


@dataclass(frozen=True)
class HubView:
    """What ``/hubs`` returns per hub: the record, a status snapshot and
    the hub's jobs (``active_job``: the one queued or running now;
    ``last_job``: the newest finished one, whatever its outcome), so a
    client rebuilds "what is this hub doing" from the one list call
    (server panel state plan, decision 1). ``hub_name`` is the hub's own
    name from its banner, for display when ``config.name`` is not set."""

    hub_id: str
    enabled: bool
    config: HubConfig
    added_at: str
    last_seen: Optional[str]
    status: Optional[HubStatus]
    active_job: Optional[JobView] = None
    last_job: Optional[JobView] = None
    hub_name: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Problem:
    """Error body (RFC 9457 shape, minus the URI scheme)."""

    type: str
    title: str
    status: int
    detail: Optional[str] = None
    hub_id: Optional[str] = None
    mode: Optional[str] = None


# -- request bodies ------------------------------------------------------------


class HubCreate(BaseModel):
    """Body of ``POST /hubs``: the ``HubConfig`` fields, host required."""

    host: str = Field(min_length=1)
    port: int = 8102
    name: Optional[str] = None
    mac: Optional[str] = None
    txt: dict[str, str] = Field(default_factory=dict)
    hub_version: Optional[str] = None
    hub_listen_port: int = 8200
    app_discovery_port: int = 8102
    proxy_enabled: bool = True
    is_proxy: bool = False
    source: Optional[str] = None
    enabled: bool = True

    def to_config(self) -> HubConfig:
        data = self.model_dump()
        data.pop("enabled")
        return HubConfig.from_dict(data)
