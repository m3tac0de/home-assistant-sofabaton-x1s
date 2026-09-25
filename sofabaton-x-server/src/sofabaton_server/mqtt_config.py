"""The MQTT broker settings the control panel manages (``mqtt.json``).

Until the auth work the broker settings came from the command line and
the environment only, so no secret was ever kept on disk. With access
control in place the panel may store them too, in their own file:

* ``data_dir/mqtt.json``, mode 0600, written atomically. ``server.json``
  still refuses every ``mqtt_*`` key, so it stays safe to share.
* The password is stored **in the clear**. The server has to present it
  to the broker, so it cannot be hashed, and a key kept on the same disk
  would add nothing. Operators who want it off the disk keep using
  ``--mqtt-password-file`` or the environment.
* Settings from the command line or the environment win: when any
  ``mqtt_*`` setting is pinned there, the file is ignored and the panel
  shows the broker read-only.
* The password is write-only: nothing the server serves or prints
  carries it.
* Changing where the password would be sent (host, port, user name,
  TLS, CA file, verification) drops the stored password unless a new one
  comes with the change, so nobody who may edit the settings can point
  the server at their own broker to collect it.
"""

from __future__ import annotations

import json
import os
import tempfile
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path
from typing import Any, Optional

from .config import DEFAULT_MQTT_PORT, DEFAULT_MQTT_TLS_PORT, MQTT_FIELDS, Settings

MQTT_FILE = "mqtt.json"
SCHEMA = 1

# Where the password goes: changing any of these without a new password drops the stored one.
DESTINATION_FIELDS = ("host", "port", "username", "tls", "tls_ca", "tls_insecure")


class MqttConfigError(ValueError):
    pass


@dataclass(frozen=True)
class MqttConfig:
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = field(default=None, repr=False)
    tls: bool = False
    tls_ca: Optional[str] = None
    tls_insecure: bool = False
    client_id: Optional[str] = None

    @property
    def configured(self) -> bool:
        return bool(self.host)

    @property
    def effective_port(self) -> int:
        return int(self.port or (DEFAULT_MQTT_TLS_PORT if self.tls else DEFAULT_MQTT_PORT))

    @classmethod
    def from_settings(cls, settings: Settings) -> "MqttConfig":
        return cls(host=settings.mqtt_host, port=settings.mqtt_port, username=settings.mqtt_username,
                   password=settings.mqtt_password, tls=settings.mqtt_tls,
                   tls_ca=str(settings.mqtt_tls_ca) if settings.mqtt_tls_ca else None,
                   tls_insecure=settings.mqtt_tls_insecure, client_id=settings.mqtt_client_id)

    def same_destination(self, other: "MqttConfig") -> bool:
        return all(getattr(self, name) == getattr(other, name) for name in DESTINATION_FIELDS)

    def with_password(self, password: Optional[str]) -> "MqttConfig":
        return replace(self, password=password)


def validate(config: MqttConfig) -> MqttConfig:
    """Normalise and check a config from the panel; raises ``MqttConfigError``."""

    host = str(config.host or "").strip()
    if not host:
        raise MqttConfigError("the broker's address is required")
    if "://" in host or "/" in host or any(ch.isspace() for ch in host) or len(host) > 253:
        raise MqttConfigError("enter the broker's host name or IP address only (no mqtt://, no path)")
    port = config.port
    if port is not None and (isinstance(port, bool) or not isinstance(port, int) or not 0 < port < 65536):
        raise MqttConfigError("the port must be between 1 and 65535")
    username = str(config.username or "").strip() or None
    if username and len(username) > 256:
        raise MqttConfigError("the user name is longer than 256 characters")
    password = config.password if config.password else None
    if password is not None and len(password) > 1024:
        raise MqttConfigError("the password is longer than 1024 characters")
    if password is not None and username is None:
        raise MqttConfigError("a password needs a user name")
    tls_ca = str(config.tls_ca or "").strip() or None
    if (tls_ca or config.tls_insecure) and not config.tls:
        raise MqttConfigError("a CA file and skipping verification need TLS")
    if tls_ca and not Path(tls_ca).is_file():
        raise MqttConfigError(f"the CA file {tls_ca!r} does not exist on the server")
    client_id = str(config.client_id or "").strip() or None
    if client_id and (len(client_id) > 64 or any(ord(ch) < 33 for ch in client_id)):
        raise MqttConfigError("the client id must be up to 64 visible characters, no spaces")
    return MqttConfig(host=host, port=port, username=username, password=password, tls=bool(config.tls),
                      tls_ca=tls_ca, tls_insecure=bool(config.tls_insecure), client_id=client_id)


def startup_pinned(settings: Settings) -> bool:
    """Any broker setting from the command line or the environment: those own the broker."""

    return any(name in settings.pinned for name in MQTT_FIELDS)


class MqttConfigStore:
    def __init__(self, data_dir: Path) -> None:
        self.path = Path(data_dir) / MQTT_FILE

    def load(self) -> Optional[MqttConfig]:
        if not self.path.exists():
            return None
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, dict) or int(data.get("schema") or 0) != SCHEMA:
                return None
            fields_ = {k: data.get(k) for k in ("host", "port", "username", "password", "tls", "tls_ca",
                                                  "tls_insecure", "client_id")}
            fields_["tls"] = bool(fields_["tls"])
            fields_["tls_insecure"] = bool(fields_["tls_insecure"])
            return MqttConfig(**fields_)
        except (OSError, ValueError, TypeError):
            return None

    def save(self, config: MqttConfig) -> None:
        payload: dict[str, Any] = {"schema": SCHEMA, **asdict(config)}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=".mqtt-", suffix=".json", dir=str(self.path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(json.dumps(payload, indent=2, sort_keys=True))
            try:
                os.chmod(tmp, 0o600)
            except OSError:
                pass                                   # some bind-mounted shares ignore chmod
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

    def clear(self) -> None:
        if self.path.exists():
            self.path.unlink()
