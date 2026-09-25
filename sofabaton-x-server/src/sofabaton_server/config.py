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
DEFAULT_MQTT_PORT = 1883
DEFAULT_MQTT_TLS_PORT = 8883
# The broker settings hold a secret, so they are read from the command
# line and the environment only: server.json never carries them (a file
# that does is refused), the control panel cannot write them, and the
# password is left out of everything the server prints or serves.
MQTT_FIELDS = ("mqtt_host", "mqtt_port", "mqtt_username", "mqtt_password", "mqtt_password_file",
               "mqtt_tls", "mqtt_tls_ca", "mqtt_tls_insecure", "mqtt_client_id")
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
    # Browser origins on another host or port that may read the API and
    # call its free routes (auth plan, section 5): they get CORS headers
    # (never credentials) and pass the Origin guard. Exact origins only
    # (`http://nas:8123`), no wildcard. server.json, environment, flags;
    # the control panel writes it to server.json and it applies live.
    allowed_origins: tuple[str, ...] = ()
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
    # Check PyPI for a newer sofabaton-x-server release once a day. Off by
    # default: with it off the server makes no update-related request on
    # its own; the control panel's button (POST /server/updates/check)
    # performs one check without enabling this. server.json and the
    # environment set it; the panel writes it to server.json.
    update_check: bool = False
    # The MQTT broker an X2 publishes its Wifi Device presses to (the one
    # set in the Sofabaton app). With a host set, the mqtt transport is
    # offered for X2 hubs and the server subscribes to `<MAC>/up` while a
    # device uses it. CLI flags and environment only, see MQTT_FIELDS.
    # `mqtt_password_file` is for container secrets; the file's first line
    # is the password.
    mqtt_host: Optional[str] = None
    mqtt_port: Optional[int] = None
    mqtt_username: Optional[str] = None
    mqtt_password: Optional[str] = field(default=None, repr=False)
    mqtt_password_file: Optional[Path] = None
    mqtt_tls: bool = False
    mqtt_tls_ca: Optional[Path] = None
    mqtt_tls_insecure: bool = False
    mqtt_client_id: Optional[str] = None
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
        if not isinstance(self.update_check, bool):
            raise ValueError(f"update_check must be true or false, got {self.update_check!r}")
        host = str(self.mqtt_host or "").strip()
        object.__setattr__(self, "mqtt_host", host or None)
        for name in ("mqtt_username", "mqtt_client_id"):
            object.__setattr__(self, name, str(getattr(self, name) or "").strip() or None)
        if self.mqtt_port is not None and (isinstance(self.mqtt_port, bool) or not isinstance(self.mqtt_port, int)
                                           or not (0 < self.mqtt_port < 65536)):
            raise ValueError(f"mqtt_port must be a port number, got {self.mqtt_port!r}")
        for name in ("mqtt_password_file", "mqtt_tls_ca"):
            if getattr(self, name) is not None:
                object.__setattr__(self, name, Path(getattr(self, name)))
        if self.mqtt_password is not None and self.mqtt_password_file is not None:
            raise ValueError("set mqtt_password or mqtt_password_file, not both")
        if self.mqtt_password_file is not None:
            try:
                lines = self.mqtt_password_file.read_text(encoding="utf-8").splitlines()
            except OSError as err:
                raise ValueError(f"mqtt_password_file {str(self.mqtt_password_file)!r} cannot be read: {err}") from err
            object.__setattr__(self, "mqtt_password", lines[0] if lines else "")
        if not self.mqtt_host and any(getattr(self, name) not in (None, False) for name in MQTT_FIELDS if name != "mqtt_host"):
            raise ValueError("mqtt settings need mqtt_host (the broker's address)")
        if (self.mqtt_tls_ca is not None or self.mqtt_tls_insecure) and not self.mqtt_tls:
            raise ValueError("mqtt_tls_ca and mqtt_tls_insecure need mqtt_tls")
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
        object.__setattr__(self, "allowed_origins", normalize_origins(self.allowed_origins))
        object.__setattr__(self, "initial_hubs", tuple(str(h).strip() for h in self.initial_hubs if str(h).strip()))
        if self.tls_cert is not None:
            object.__setattr__(self, "tls_cert", Path(self.tls_cert))
            object.__setattr__(self, "tls_key", Path(self.tls_key))  # type: ignore[arg-type]

    @property
    def mqtt_effective_port(self) -> int:
        return int(self.mqtt_port or (DEFAULT_MQTT_TLS_PORT if self.mqtt_tls else DEFAULT_MQTT_PORT))

    # -- serialisation -----------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        """For `--print-settings` and logs: the password is never in it."""

        data = asdict(self)
        data["mqtt_password_set"] = data.pop("mqtt_password") is not None
        for key in ("data_dir", "tls_cert", "tls_key", "mqtt_password_file", "mqtt_tls_ca"):
            if data[key] is not None:
                data[key] = str(data[key])
        data["trusted_proxies"] = list(self.trusted_proxies)
        data["allowed_origins"] = list(self.allowed_origins)
        data["initial_hubs"] = list(self.initial_hubs)
        data.pop("pinned")
        return data

    def with_(self, **changes: Any) -> "Settings":
        return replace(self, **changes)


_FIELD_NAMES = {f.name for f in fields(Settings)} - {"pinned"}


_DEFAULT_PORTS = {"http": 80, "https": 443}


def normalize_origin(value: Any) -> str:
    """``scheme://host[:port]`` in lower case, the default port dropped.

    Raises ``ValueError`` for anything that is not a bare http(s) origin
    (a path, a query, credentials, ``*`` or ``null``).
    """

    from urllib.parse import urlsplit

    text = str(value or "").strip().rstrip("/")
    try:
        parts = urlsplit(text)
        port = parts.port
    except ValueError as err:
        raise ValueError(f"{value!r} is not an origin: {err}") from None
    scheme = parts.scheme.lower()
    if scheme not in _DEFAULT_PORTS or not parts.hostname or parts.path or parts.query or parts.fragment             or parts.username is not None or parts.password is not None:
        raise ValueError(f"{value!r} is not an origin; use scheme://host[:port], e.g. http://nas:8123")
    host = parts.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    if port is None or port == _DEFAULT_PORTS[scheme]:
        return f"{scheme}://{host}"
    return f"{scheme}://{host}:{port}"


def normalize_origins(values: Any) -> tuple[str, ...]:
    if isinstance(values, str):
        values = values.split(",")
    out: list[str] = []
    for value in values or ():
        if not str(value).strip():
            continue
        origin = normalize_origin(value)
        if origin not in out:
            out.append(origin)
    return tuple(out)
_LIST_FIELDS = {"trusted_proxies", "initial_hubs", "allowed_origins"}


def _coerce(name: str, value: Any) -> Any:
    if value is None:
        return None
    if name in ("port", "callback_port", "hub_listen_port", "app_discovery_port", "apply_keep", "mqtt_port"):
        return int(value)
    if name in ("mqtt_tls", "mqtt_tls_insecure", "update_check"):
        if isinstance(value, str):
            word = value.strip().lower()
            if word in ("1", "true", "yes", "on"):
                return True
            if word in ("", "0", "false", "no", "off"):
                return False
            raise ValueError(f"{name} must be true or false, got {value!r}")
        return bool(value)
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
    _refuse_mqtt_in_file(data, path)
    return _filtered(data)


def _refuse_mqtt_in_file(data: Mapping[str, Any], path: Path) -> None:
    found = sorted(key for key in data if str(key).startswith("mqtt_"))
    if found:
        raise ValueError(
            f"{path}: {found} do not belong in a file; give the MQTT broker settings as command line flags "
            "(--mqtt-host ...) or SOFABATON_MQTT_* environment variables, or set the broker in the control panel "
            "(Server settings > MQTT broker), which keeps it in mqtt.json"
        )


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
    _refuse_mqtt_in_file(data, path)
    _filtered(data)  # refuse to write a file the next start would reject
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)
