"""Discovery (plan section 8): hubs seen on the LAN, on-demand scans, and
the server's own mDNS advertisement.

* The library's ``AsyncHubBrowser`` runs for the life of the process and
  feeds a "seen hubs" table: one ``SeenHub`` per physical hub, keyed
  like hub records (MAC when the advertisement carries one, host
  otherwise), linked to the configured record it matches, and marked
  present/absent as advertisements come and go. Our own proxy
  advertisements (``is_proxy``) are counted and dropped: they describe
  hubs this server already fronts.
* ``scan()`` runs the library's one-shot scan for platforms that want a
  synchronous answer and merges the result into the table.
* ``Advertiser`` publishes ``_sofabaton-x._tcp.local.`` with TXT
  ``version``, ``api``, ``hubs``, ``path`` and, when the operator set an
  advertised URL, ``base_url``. The SRV target is always this host and
  the API port.

One ``Zeroconf`` instance is shared by the browser, the advertisement
and (through the manager) every hub proxy.
"""

from __future__ import annotations

import asyncio
import logging
import socket
from dataclasses import dataclass
from typing import Any, Callable, Optional

from sofabaton import AsyncHubBrowser, DiscoveredHub, HubConfig, async_discover_hubs

from . import API_PREFIX, API_VERSION, __version__
from .config import Settings
from .manager import HubManager
from .models import mac_key, now_iso

log = logging.getLogger(__name__)

SERVICE_TYPE = "_sofabaton-x._tcp.local."


@dataclass
class SeenHub:
    """A physical hub advertised on the LAN (not yet necessarily configured)."""

    key: str
    config: HubConfig
    first_seen: str
    last_seen: str
    present: bool
    registered_hub_id: Optional[str]


# -- advertisement ---------------------------------------------------------------


def local_addresses() -> list[bytes]:
    """Best-effort IPv4 addresses for the SRV/A records."""

    candidates: list[str] = []
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect(("192.0.2.1", 9))            # no packet is sent
            candidates.append(probe.getsockname()[0])
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            candidates.append(info[4][0])
    except OSError:
        pass
    seen: list[bytes] = []
    for addr in candidates:
        if addr.startswith("127.") or addr in ("0.0.0.0", ""):
            continue
        packed = socket.inet_aton(addr)
        if packed not in seen:
            seen.append(packed)
    return seen or [socket.inet_aton("127.0.0.1")]


def advertisement_txt(settings: Settings, hub_count: int, *, auth_claimed: bool = False) -> dict[str, str]:
    txt = {
        "version": __version__,
        "api": API_VERSION,
        "path": API_PREFIX,
        "hubs": str(hub_count),
    }
    if settings.advertise_url:
        txt["base_url"] = settings.advertise_url
    if auth_claimed:
        # Writes need a token: a platform's setup UI knows to ask for one.
        txt["auth"] = "1"
    return txt


class Advertiser:
    """Registers and updates the server's ServiceInfo on a Zeroconf instance."""

    def __init__(self) -> None:
        self._zc: Any = None
        self._info: Any = None

    @staticmethod
    def _service_info(settings: Settings, hub_count: int, auth_claimed: bool = False) -> Any:
        from zeroconf import ServiceInfo

        host = socket.gethostname().split(".")[0] or "server"
        return ServiceInfo(
            SERVICE_TYPE,
            f"sofabaton-x-server on {host}.{SERVICE_TYPE}",
            addresses=local_addresses(),
            port=settings.port,
            properties=advertisement_txt(settings, hub_count, auth_claimed=auth_claimed),
            server=f"{host}.local.",
        )

    def start(self, zc: Any, settings: Settings, hub_count: int, *, auth_claimed: bool = False) -> None:
        self._zc = zc
        self._info = self._service_info(settings, hub_count, auth_claimed)
        zc.register_service(self._info)
        log.info("advertising %s on port %d", SERVICE_TYPE, settings.port)

    def update(self, settings: Settings, hub_count: int, *, auth_claimed: bool = False) -> None:
        """Re-publish the record with a new TXT (``ServiceInfo`` is immutable)."""

        if self._zc is None or self._info is None:
            return
        try:
            info = self._service_info(settings, hub_count, auth_claimed)
            self._zc.update_service(info)
            self._info = info
        except Exception:  # noqa: BLE001
            log.warning("advertisement update failed", exc_info=True)

    def stop(self) -> None:
        if self._zc is not None and self._info is not None:
            try:
                self._zc.unregister_service(self._info)
            except Exception:  # noqa: BLE001
                log.debug("advertisement unregister failed", exc_info=True)
        self._zc = None
        self._info = None


# -- service -------------------------------------------------------------------------


class DiscoveryService:
    def __init__(
        self,
        settings: Settings,
        manager: HubManager,
        *,
        browser_factory: Callable[..., Any] = AsyncHubBrowser,
        scanner: Callable[..., Any] = async_discover_hubs,
        advertiser: Optional[Advertiser] = None,
        zeroconf: Any = None,
    ) -> None:
        self._settings = settings
        self._manager = manager
        self._browser_factory = browser_factory
        self._scanner = scanner
        self._advertiser = advertiser if advertiser is not None else Advertiser()
        self._zc = zeroconf
        self._owns_zc = zeroconf is None
        self._browser: Any = None
        self._table: dict[str, SeenHub] = {}
        self.proxy_advertisements = 0
        self.enabled = False
        # Set by the app: whether the admin account exists (TXT auth=1).
        self.auth_claimed: Callable[[], bool] = lambda: False
        manager.on_server_event(self._on_manager_event)

    # -- lifecycle -----------------------------------------------------------

    async def start(self) -> None:
        if self._zc is None:
            try:
                from zeroconf import IPVersion, Zeroconf

                self._zc = await asyncio.get_running_loop().run_in_executor(
                    None, lambda: Zeroconf(ip_version=IPVersion.V4Only)
                )
            except Exception:  # noqa: BLE001
                log.exception("zeroconf unavailable; discovery and advertisement disabled")
                return
        self._manager.zeroconf = self._zc
        self._browser = self._browser_factory(
            zc=self._zc,
            include_proxies=True,          # we count our own advertisements
            on_added=self._on_seen,
            on_updated=self._on_seen,
            on_removed=self._on_removed,
        )
        await self._browser.start()
        try:
            await asyncio.get_running_loop().run_in_executor(
                None, lambda: self._advertiser.start(self._zc, self._settings, self._manager.count(),
                                                     auth_claimed=self.auth_claimed())
            )
        except Exception:  # noqa: BLE001
            log.exception("could not advertise %s", SERVICE_TYPE)
        self.enabled = True

    async def stop(self) -> None:
        self.enabled = False
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._advertiser.stop)
        if self._browser is not None:
            await self._browser.stop()
            self._browser = None
        if self._owns_zc and self._zc is not None:
            zc = self._zc
            self._zc = None
            await loop.run_in_executor(None, zc.close)

    # -- queries -------------------------------------------------------------

    def seen(self) -> list[SeenHub]:
        # Registration is resolved at read time: a hub registered from this
        # table stops advertising once the proxy fronts it, so no later
        # advertisement would refresh a value cached at observation time,
        # and records loaded at start predate the first advertisement.
        for entry in self._table.values():
            entry.registered_hub_id = self._registered_id(entry.config)
        return sorted(self._table.values(), key=lambda s: (not s.present, s.key))

    async def scan(self, timeout: float) -> list[SeenHub]:
        hubs = await self._scanner(timeout=timeout, zc=self._zc, include_proxies=True)
        for hub in hubs:
            self._observe(hub)
        return self.seen()

    # -- table ---------------------------------------------------------------

    def _key_for(self, config: HubConfig) -> str:
        return mac_key(config.mac) if config.mac else config.host

    def _registered_id(self, config: HubConfig) -> Optional[str]:
        wanted = mac_key(config.mac) if config.mac else None
        for hub_id in self._manager.ids():
            record = self._manager.record(hub_id)
            if record.config.host == config.host:
                return hub_id
            if wanted and (hub_id == wanted or (record.config.mac and mac_key(record.config.mac) == wanted)):
                return hub_id
        return None

    def _observe(self, hub: DiscoveredHub) -> None:
        if hub.is_proxy:
            self.proxy_advertisements += 1
            return
        config = HubConfig.from_discovered(hub, source="server")
        key = self._key_for(config)
        stamp = now_iso()
        existing = self._table.get(key)
        newly = existing is None or not existing.present
        self._table[key] = SeenHub(
            key=key,
            config=config,
            first_seen=existing.first_seen if existing else stamp,
            last_seen=stamp,
            present=True,
            registered_hub_id=self._registered_id(config),
        )
        if newly:
            log.info("discovered hub %s at %s (%s)", key, config.host, config.hub_version or "unknown model")
            self._manager.emit_server_event("hub_discovered", key)

    def _on_seen(self, hub: DiscoveredHub) -> None:
        self._observe(hub)

    def _on_removed(self, hub: DiscoveredHub) -> None:
        if hub.is_proxy:
            return
        key = self._key_for(HubConfig.from_discovered(hub))
        entry = self._table.get(key)
        if entry is None or not entry.present:
            return
        entry.present = False
        entry.last_seen = now_iso()
        log.info("hub %s no longer advertised", key)
        self._manager.emit_server_event("hub_lost", key)

    def _on_manager_event(self, hub_id: str, kind: str) -> None:
        if kind in ("hub_added", "hub_removed", "hub_rekeyed"):
            for entry in self._table.values():
                entry.registered_hub_id = self._registered_id(entry.config)
            self.refresh_advertisement()

    def refresh_advertisement(self) -> None:
        """Re-publish the TXT (hub count, auth) with the current values."""

        self._advertiser.update(self._settings, self._manager.count(), auth_claimed=self.auth_claimed())
