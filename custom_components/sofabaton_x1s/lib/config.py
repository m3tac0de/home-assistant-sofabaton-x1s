# config.py: the hub configuration record consumers hand to the facade.
#
# One record shape for every way a hub can reach an application: the
# library's own mDNS discovery (``from_discovered``), a foreign mDNS stack
# such as an automation platform's (``from_advertisement``), or a user
# typing an address (``HubConfig(host=...)``). It round-trips through a
# plain dict so it can arrive over a REST body or live in a config file,
# and it knows how to turn itself into ``AsyncXProxy`` keyword arguments.
#
# Only ``host`` is required. The proxy confirms the hub model from the
# connect banner and derives its mDNS identity from it, so a host-only
# record is a complete configuration.
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Mapping, Optional

from .discovery import DiscoveredHub, normalize_advertisement
from .hub_versions import DEFAULT_HUB_LISTEN_BASE, DEFAULT_PROXY_UDP_PORT
from .network import normalize_local_address

__all__ = ["ConfigSource", "HubConfig"]

# Where a record came from; informational, carried through ``to_dict``.
ConfigSource = Literal["server", "client", "manual"]

# The hub's UDP port is protocol-fixed; a record without one means 8102.
DEFAULT_HUB_PORT = 8102


@dataclass(frozen=True)
class HubConfig:
    """Everything needed to proxy one hub, as data.

    Fields beyond ``host`` refine the proxy's mDNS identity (``name``,
    ``txt``, ``hub_version``) or its two network faces (``port`` on the
    hub, ``hub_listen_port`` and ``app_discovery_port`` on this host).
    ``is_proxy`` is True when the record was built from one of *our own*
    proxy advertisements rather than a physical hub; a consumer
    registering hubs from a foreign discovery feed uses it to map such a
    record back to the hub it already fronts instead of proxying a proxy.
    """

    host: str
    port: int = DEFAULT_HUB_PORT
    name: Optional[str] = None
    mac: Optional[str] = None
    txt: dict[str, str] = field(default_factory=dict)
    hub_version: Optional[str] = None
    hub_listen_port: int = DEFAULT_HUB_LISTEN_BASE
    app_discovery_port: int = DEFAULT_PROXY_UDP_PORT
    proxy_enabled: bool = True
    is_proxy: bool = False
    source: Optional[ConfigSource] = None
    # Manual local IPv4 address of this host toward the hub; None selects
    # it automatically (see AsyncXProxy.local_address).
    local_address: Optional[str] = None

    def __post_init__(self) -> None:
        if not isinstance(self.host, str) or not self.host.strip():
            raise ValueError("HubConfig.host is required")
        object.__setattr__(self, "host", self.host.strip())
        for name in ("port", "hub_listen_port", "app_discovery_port"):
            value = getattr(self, name)
            if isinstance(value, bool) or not isinstance(value, int) or not (0 < value < 65536):
                raise ValueError(f"HubConfig.{name} must be a port number, got {value!r}")
        object.__setattr__(self, "txt", {str(k): str(v) for k, v in dict(self.txt or {}).items()})
        try:
            local_address = normalize_local_address(self.local_address)
        except ValueError as err:
            raise ValueError(f"HubConfig.local_address: {err}") from err
        object.__setattr__(self, "local_address", local_address)

    # -- constructors ------------------------------------------------------

    @classmethod
    def from_discovered(
        cls, hub: DiscoveredHub, *, source: Optional[ConfigSource] = "server"
    ) -> "HubConfig":
        """Build a record from the library's own discovery result."""

        return cls(
            host=hub.host,
            port=int(hub.port) or DEFAULT_HUB_PORT,
            name=hub.name or None,
            mac=hub.mac,
            txt=dict(hub.txt),
            hub_version=hub.hub_version,
            is_proxy=bool(hub.is_proxy),
            source=source,
        )

    @classmethod
    def from_advertisement(
        cls,
        service_type: str,
        instance_name: str,
        *,
        host: Optional[str],
        port: Optional[int],
        properties: Any,
        source: Optional[ConfigSource] = "client",
    ) -> "HubConfig":
        """Build a record from a raw mDNS advertisement a foreign stack saw.

        ``properties`` accepts what mDNS libraries hand out (bytes or str
        keys and values, None values). Raises :class:`ValueError` when
        the advertisement is unusable: no address, or a service type that
        is not a Sofabaton hub type. An unrecognised ``HVER`` does not
        reject the record; ``hub_version`` is simply None and the banner
        settles it at connect time.
        """

        hub = normalize_advertisement(
            service_type, instance_name, host=host, port=port, properties=properties
        )
        if hub is None:
            raise ValueError(
                f"not a usable Sofabaton hub advertisement: service_type={service_type!r} host={host!r}"
            )
        return cls.from_discovered(hub, source=source)

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "HubConfig":
        """Rebuild a record from :meth:`to_dict` output (or a config file / REST body).

        Unknown keys are rejected so a typo in a config file surfaces
        instead of silently falling back to a default.
        """

        if not isinstance(data, Mapping):
            raise ValueError("HubConfig.from_dict expects a mapping")
        known = {f for f in cls.__dataclass_fields__}
        unknown = sorted(set(data) - known)
        if unknown:
            raise ValueError(f"HubConfig: unknown field(s) {unknown}")
        kwargs: dict[str, Any] = dict(data)
        for name in ("port", "hub_listen_port", "app_discovery_port"):
            if name in kwargs and kwargs[name] is not None and not isinstance(kwargs[name], bool):
                try:
                    kwargs[name] = int(kwargs[name])
                except (TypeError, ValueError) as err:
                    raise ValueError(f"HubConfig.{name} must be an integer") from err
        for name in ("port", "hub_listen_port", "app_discovery_port", "txt", "proxy_enabled", "is_proxy"):
            if kwargs.get(name) is None:
                kwargs.pop(name, None)
        return cls(**kwargs)

    # -- serialisation -----------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        if data["local_address"] is None:
            # Absent, not null: a record that never set it stays readable
            # by a release that predates the field.
            del data["local_address"]
        return data

    # -- facade bridge -----------------------------------------------------

    def proxy_kwargs(self) -> dict[str, Any]:
        """Keyword arguments for ``AsyncXProxy(**cfg.proxy_kwargs())``."""

        kwargs: dict[str, Any] = {
            "hub_ip": self.host,
            "hub_port": self.port,
            "hub_listen_port": self.hub_listen_port,
            "app_discovery_port": self.app_discovery_port,
            "proxy_enabled": self.proxy_enabled,
        }
        if self.name:
            kwargs["mdns_instance"] = self.name
        if self.txt:
            kwargs["mdns_txt"] = dict(self.txt)
        if self.hub_version:
            kwargs["hub_version"] = self.hub_version
        if self.local_address:
            kwargs["local_address"] = self.local_address
        return kwargs
