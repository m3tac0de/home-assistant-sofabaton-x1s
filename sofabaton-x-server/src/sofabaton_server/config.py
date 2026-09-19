"""Server settings: defaults < config file < environment < CLI flags.

One place for every operator-facing knob (plan sections 8 and 9). Hub
records are NOT here: they live in ``hubs.json`` and are managed by the
hub manager (S1). This module only knows where the data directory is.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field, fields, replace
from pathlib import Path
from typing import Any, Mapping, Optional

DEFAULT_PORT = 8480
# The hub-side network ports, shared by every hub this server proxies
# (the library's hub listener and app demuxer are process-wide). Same
# defaults as the Home Assistant integration's port step.
DEFAULT_HUB_LISTEN_PORT = 8200
DEFAULT_APP_DISCOVERY_PORT = 8102
DEFAULT_CALLBACK_PORT = 8060
# The settings the control panel may write to server.json.
EDITABLE_PORTS = ("hub_listen_port", "app_discovery_port", "callback_port")
DEFAULT_BIND = "0.0.0.0"
SETTINGS_FILE = "server.json"
ENV_PREFIX = "SOFABATON_"


@dataclass(frozen=True)
class Settings:
    """Everything the operator can set. Frozen; build a new one with ``with_``."""

    bind: str = DEFAULT_BIND
    port: int = DEFAULT_PORT
    data_dir: Path = field(default_factory=lambda: Path.cwd() / "data")
    # Reverse proxy (plan section 8): published as TXT ``base_url`` and
    # as the OpenAPI document's servers[0].url when set.
    advertise_url: Optional[str] = None
    root_path: str = ""
    # Addresses / CIDRs whose X-Forwarded-* headers are trusted.
    trusted_proxies: tuple[str, ...] = ()
    # Escape hatch for operators who bring their own certificate.
    tls_cert: Optional[Path] = None
    tls_key: Optional[Path] = None
    # Hosts to register only when hubs.json does not exist.
    initial_hubs: tuple[str, ...] = ()
    log_level: str = "info"
    # Callback devices (callbacks plan, section 5): what gets baked into
    # the hub records as the address the hub calls back on. Distinct from
    # advertise_url, which is what clients use. None = the routed local
    # IP toward each hub (right on host networking, a container address
    # on bridge networking); the port is the listener's, 8060 by default
    # (the X1 can call no other).
    callback_host: Optional[str] = None
    callback_port: int = DEFAULT_CALLBACK_PORT
    # TCP port on this host the hubs connect back to, and the UDP port the
    # official app discovers and calls the proxies on (keep 8102 for iOS).
    # They override the per-hub HubConfig values: one listener serves all.
    hub_listen_port: int = DEFAULT_HUB_LISTEN_PORT
    app_discovery_port: int = DEFAULT_APP_DISCOVERY_PORT
    # Terminal apply records kept per hub: success, stopped and cancelled
    # all count, including resumable records. Queued/running are not pruned.
    apply_keep: int = 20
    # Settings that came from the environment or a CLI flag; server.json
    # cannot change them. Filled by load_settings, never read from a layer.
    pinned: frozenset[str] = field(default=frozenset(), compare=False)

    def __post_init__(self) -> None:
        if isinstance(self.port, bool) or not isinstance(self.port, int) or not (0 < self.port < 65536):
            raise ValueError(f"port must be a port number, got {self.port!r}")
        if (isinstance(self.callback_port, bool) or not isinstance(self.callback_port, int)
                or not (0 <= self.callback_port < 65536)):
            raise ValueError(f"callback_port must be a port number, got {self.callback_port!r}")
        for name in ("hub_listen_port", "app_discovery_port"):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or not (0 < value < 65536):
                raise ValueError(f"{name} must be a port number, got {value!r}")
        object.__setattr__(self, "pinned", frozenset(self.pinned))
        if self.callback_host is not None:
            host = str(self.callback_host).strip()
            if host:
                import ipaddress
                try:
                    ipaddress.IPv4Address(host)
                except (ipaddress.AddressValueError, ValueError) as err:
                    raise ValueError(f"callback_host must be a dotted-decimal IPv4 address, got {self.callback_host!r}") from err
            object.__setattr__(self, "callback_host", host or None)
        if isinstance(self.apply_keep, bool) or not isinstance(self.apply_keep, int) or self.apply_keep < 0:
            raise ValueError(f"apply_keep must be a non-negative integer, got {self.apply_keep!r}")
        if not isinstance(self.bind, str) or not self.bind.strip():
            raise ValueError("bind must be a non-empty address")
        if (self.tls_cert is None) != (self.tls_key is None):
            raise ValueError("tls_cert and tls_key must be set together")
        if self.advertise_url is not None:
            url = self.advertise_url.strip().rstrip("/")
            if not url.startswith(("http://", "https://")):
                raise ValueError("advertise_url must start with http:// or https://")
            object.__setattr__(self, "advertise_url", url)
        root = (self.root_path or "").strip()
        if root and not root.startswith("/"):
            root = "/" + root
        object.__setattr__(self, "root_path", root.rstrip("/"))
        object.__setattr__(self, "data_dir", Path(self.data_dir))
        object.__setattr__(self, "trusted_proxies", tuple(str(p).strip() for p in self.trusted_proxies if str(p).strip()))
        object.__setattr__(self, "initial_hubs", tuple(str(h).strip() for h in self.initial_hubs if str(h).strip()))
        if self.tls_cert is not None:
            object.__setattr__(self, "tls_cert", Path(self.tls_cert))
            object.__setattr__(self, "tls_key", Path(self.tls_key))  # type: ignore[arg-type]

    # -- serialisation -----------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        for key in ("data_dir", "tls_cert", "tls_key"):
            if data[key] is not None:
                data[key] = str(data[key])
        data["trusted_proxies"] = list(self.trusted_proxies)
        data["initial_hubs"] = list(self.initial_hubs)
        data.pop("pinned")
        return data

    def with_(self, **changes: Any) -> "Settings":
        return replace(self, **changes)


_FIELD_NAMES = {f.name for f in fields(Settings)} - {"pinned"}
_LIST_FIELDS = {"trusted_proxies", "initial_hubs"}


def _coerce(name: str, value: Any) -> Any:
    if value is None:
        return None
    if name in ("port", "callback_port", "hub_listen_port", "app_discovery_port", "apply_keep"):
        return int(value)
    if name in _LIST_FIELDS:
        if isinstance(value, str):
            return tuple(v.strip() for v in value.split(",") if v.strip())
        return tuple(value)
    return value


def _filtered(overrides: Mapping[str, Any]) -> dict[str, Any]:
    """Keep known, non-None keys; reject unknown ones loudly."""

    unknown = sorted(set(overrides) - _FIELD_NAMES)
    if unknown:
        raise ValueError(f"unknown setting(s): {unknown}")
    return {k: _coerce(k, v) for k, v in overrides.items() if v is not None}


def settings_from_file(path: Path) -> dict[str, Any]:
    """Read ``server.json``; a missing file is an empty layer."""

    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return _filtered(data)


def settings_from_env(environ: Mapping[str, str] = os.environ) -> dict[str, Any]:
    """``SOFABATON_<FIELD>`` variables; ``SOFABATON_HUBS`` feeds ``initial_hubs``."""

    aliases = {"HUBS": "initial_hubs"}
    found: dict[str, Any] = {}
    for key, value in environ.items():
        if not key.startswith(ENV_PREFIX):
            continue
        name = key[len(ENV_PREFIX):]
        name = aliases.get(name, name.lower())
        if name in _FIELD_NAMES:
            found[name] = value
    return _filtered(found)


def load_settings(
    *,
    cli: Optional[Mapping[str, Any]] = None,
    environ: Mapping[str, str] = os.environ,
    data_dir: Optional[Path] = None,
) -> Settings:
    """Compose the layers. ``data_dir`` decides where ``server.json`` is read from.

    Precedence, highest first: CLI flags, environment, ``server.json`` in
    the data directory, defaults. The data directory itself may come from
    any layer, so it is resolved first from CLI, then environment, then
    the default.
    """

    cli_layer = _filtered(cli or {})
    env_layer = settings_from_env(environ)
    resolved_dir = Path(
        data_dir
        or cli_layer.get("data_dir")
        or env_layer.get("data_dir")
        or Settings().data_dir
    )
    file_layer = settings_from_file(resolved_dir / SETTINGS_FILE)
    merged: dict[str, Any] = {}
    for layer in (file_layer, env_layer, cli_layer):
        merged.update(layer)
    merged["data_dir"] = resolved_dir
    return Settings(**merged, pinned=frozenset(env_layer) | frozenset(cli_layer))


def settings_file_values(data_dir: Path) -> dict[str, Any]:
    """The ``server.json`` layer alone (what a restart would read from it)."""

    return settings_from_file(Path(data_dir) / SETTINGS_FILE)


def write_settings_file(data_dir: Path, changes: Mapping[str, Any]) -> None:
    """Merge ``changes`` into ``server.json``, keeping every other key.

    A value equal to the default is still written: the file then says
    what the operator chose. Written atomically (temp file + replace).
    """

    path = Path(data_dir) / SETTINGS_FILE
    data: dict[str, Any] = {}
    if path.exists():
        loaded = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(loaded, dict):
            raise ValueError(f"{path}: expected a JSON object")
        data = loaded
    data.update(changes)
    _filtered(data)  # refuse to write a file the next start would reject
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)
