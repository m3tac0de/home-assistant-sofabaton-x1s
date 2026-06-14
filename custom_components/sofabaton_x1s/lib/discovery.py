# discovery.py — LAN discovery of physical Sofabaton hubs via mDNS.
#
# Library-owned counterpart to the Home Assistant integration's zeroconf
# config flow: browses the hub service types, decodes TXT records,
# classifies the hub variant and (by default) filters out advertisements
# published by our own proxies (marked with PROXY_TXT_KEY).
#
# ``zeroconf`` is imported lazily so the package stays importable in
# environments that only use the parsing layers (mirrors x1_proxy's
# advertising path).
from __future__ import annotations

import asyncio
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Optional

from .hub_versions import (
    MDNS_SERVICE_TYPES,
    classify_hub_version,
    is_proxy_advertisement,
)

log = logging.getLogger(__name__)

DEFAULT_DISCOVERY_TIMEOUT = 5.0
# How long to wait for a ServiceInfo resolution per advertisement.
_INFO_REQUEST_TIMEOUT_MS = 3000


@dataclass(frozen=True)
class DiscoveredHub:
    """One mDNS advertisement, normalized.

    ``hub_version`` is ``None`` when the advertisement carries no
    recognisable ``HVER`` TXT record (unknown firmware lineage); the
    raw ``txt`` dict is always preserved so callers can apply their own
    policy, mirroring how the HA config flow re-evaluates later.
    """

    host: str
    port: int
    name: str
    mac: Optional[str]
    txt: dict[str, str] = field(compare=False)
    hub_version: Optional[str]
    is_proxy: bool
    service_type: str
    instance_name: str = field(compare=False, default="")

    @property
    def key(self) -> tuple[str, str]:
        """Stable identity of the advertisement within a browse session."""

        return (self.service_type, self.instance_name)


def decode_txt_properties(properties: Any) -> dict[str, str]:
    """Decode a zeroconf properties mapping into plain str->str.

    zeroconf hands back ``dict[bytes, bytes | None]``; HA hands the
    config flow already-decoded strings. Accept both, drop value-less
    keys' values to empty strings, and ignore undecodable garbage.
    """

    props: dict[str, str] = {}
    if not properties:
        return props
    for key, value in dict(properties).items():
        if isinstance(key, bytes):
            try:
                key = key.decode("utf-8")
            except UnicodeDecodeError:
                continue
        if isinstance(value, bytes):
            try:
                value = value.decode("utf-8")
            except UnicodeDecodeError:
                continue
        props[str(key)] = "" if value is None else str(value)
    return props


def normalize_advertisement(
    service_type: str,
    instance_name: str,
    *,
    host: Optional[str],
    port: Optional[int],
    properties: Any,
) -> Optional[DiscoveredHub]:
    """Build a :class:`DiscoveredHub` from raw advertisement details.

    Returns ``None`` when the advertisement is unusable (no address) or
    the service type is not a known hub type. Classification failures do
    NOT reject the hub — ``hub_version`` is simply ``None``.
    """

    if service_type not in MDNS_SERVICE_TYPES:
        return None
    if not host:
        return None

    txt = decode_txt_properties(properties)
    label = instance_name.split(".")[0]
    name = txt.get("NAME") or label
    mac = txt.get("MAC") or None
    try:
        hub_version: Optional[str] = classify_hub_version(txt)
    except ValueError:
        hub_version = None

    return DiscoveredHub(
        host=host,
        port=int(port) if port else 0,
        name=name,
        mac=mac,
        txt=txt,
        hub_version=hub_version,
        is_proxy=is_proxy_advertisement(txt),
        service_type=service_type,
        instance_name=instance_name,
    )


HubCallback = Callable[[DiscoveredHub], None]


class HubBrowser:
    """Continuous mDNS browse for Sofabaton hubs.

    Callbacks fire on the zeroconf engine thread; keep them quick and
    hand off to your own executor/loop for real work. ``include_proxies``
    keeps proxy advertisements (marked via PROXY_TXT_KEY) out of the
    result set by default so applications discover *physical* hubs.
    """

    def __init__(
        self,
        *,
        zc: Any = None,
        include_proxies: bool = False,
        service_types: Iterable[str] = MDNS_SERVICE_TYPES,
        on_added: Optional[HubCallback] = None,
        on_updated: Optional[HubCallback] = None,
        on_removed: Optional[HubCallback] = None,
    ) -> None:
        self._zc = zc
        self._zc_owned = False
        self._include_proxies = bool(include_proxies)
        self._service_types = list(service_types)
        self._on_added = on_added
        self._on_updated = on_updated
        self._on_removed = on_removed
        self._browser: Any = None
        self._lock = threading.Lock()
        self._hubs: dict[tuple[str, str], DiscoveredHub] = {}

    # -- zeroconf plumbing (overridable for tests) ----------------------

    def _create_zeroconf(self) -> Any:
        from zeroconf import IPVersion, Zeroconf

        return Zeroconf(ip_version=IPVersion.V4Only)

    def _create_browser(self, zc: Any) -> Any:
        from zeroconf import ServiceBrowser

        return ServiceBrowser(
            zc, self._service_types, handlers=[self._on_service_state_change]
        )

    # -- lifecycle -------------------------------------------------------

    def start(self) -> "HubBrowser":
        if self._browser is not None:
            return self
        if self._zc is None:
            self._zc = self._create_zeroconf()
            self._zc_owned = True
        self._browser = self._create_browser(self._zc)
        return self

    def stop(self) -> None:
        browser, self._browser = self._browser, None
        if browser is not None:
            try:
                browser.cancel()
            except Exception:  # pragma: no cover - engine teardown races
                log.debug("HubBrowser: browser cancel failed", exc_info=True)
        if self._zc_owned and self._zc is not None:
            try:
                self._zc.close()
            except Exception:  # pragma: no cover - engine teardown races
                log.debug("HubBrowser: zeroconf close failed", exc_info=True)
            self._zc = None
            self._zc_owned = False

    def __enter__(self) -> "HubBrowser":
        return self.start()

    def __exit__(self, *exc_info: Any) -> None:
        self.stop()

    # -- results ----------------------------------------------------------

    @property
    def hubs(self) -> list[DiscoveredHub]:
        """Snapshot of currently-visible hubs, stable order."""

        with self._lock:
            return sorted(
                self._hubs.values(), key=lambda hub: (hub.host, hub.instance_name)
            )

    # -- engine callbacks --------------------------------------------------

    def _on_service_state_change(
        self, zeroconf: Any, service_type: str, name: str, state_change: Any
    ) -> None:
        # Compare by enum name so fake engines in tests don't need the
        # real zeroconf ServiceStateChange type.
        change = getattr(state_change, "name", str(state_change))
        if change == "Removed":
            self._handle_removed(service_type, name)
            return
        if change not in ("Added", "Updated"):
            return

        info = None
        try:
            info = zeroconf.get_service_info(
                service_type, name, timeout=_INFO_REQUEST_TIMEOUT_MS
            )
        except Exception:  # pragma: no cover - engine-side failures
            log.debug("HubBrowser: get_service_info(%s) failed", name, exc_info=True)
        if info is None:
            return
        self._handle_info(service_type, name, info, is_update=(change == "Updated"))

    def _handle_info(
        self, service_type: str, name: str, info: Any, *, is_update: bool
    ) -> None:
        host = self._first_ipv4(info)
        hub = normalize_advertisement(
            service_type,
            name,
            host=host,
            port=getattr(info, "port", None),
            properties=getattr(info, "properties", None),
        )
        if hub is None:
            return
        if hub.is_proxy and not self._include_proxies:
            return

        with self._lock:
            previous = self._hubs.get(hub.key)
            self._hubs[hub.key] = hub
        if previous is None:
            self._emit(self._on_added, hub)
        elif previous != hub or is_update:
            self._emit(self._on_updated, hub)

    def _handle_removed(self, service_type: str, name: str) -> None:
        with self._lock:
            hub = self._hubs.pop((service_type, name), None)
        if hub is not None:
            self._emit(self._on_removed, hub)

    @staticmethod
    def _first_ipv4(info: Any) -> Optional[str]:
        parsed = getattr(info, "parsed_addresses", None)
        if callable(parsed):
            try:
                addresses = parsed()
            except TypeError:  # pragma: no cover - exotic fakes
                addresses = []
            for address in addresses or []:
                if ":" not in address:
                    return address
        return getattr(info, "host", None)

    @staticmethod
    def _emit(callback: Optional[HubCallback], hub: DiscoveredHub) -> None:
        if callback is None:
            return
        try:
            callback(hub)
        except Exception:
            log.exception("HubBrowser: callback failed for %s", hub.instance_name)


def discover_hubs(
    timeout: float = DEFAULT_DISCOVERY_TIMEOUT,
    *,
    zc: Any = None,
    include_proxies: bool = False,
) -> list[DiscoveredHub]:
    """One-shot blocking scan for Sofabaton hubs on the local network.

    Browses both hub service types for ``timeout`` seconds and returns
    the normalized advertisements seen. Pass an existing ``Zeroconf``
    instance via ``zc`` to share an engine; otherwise one is created and
    torn down for the scan.

    This is the **synchronous** API and blocks the calling thread. It must
    not be called from a thread with a running asyncio event loop (the
    blocking sleep starves zeroconf and the scan silently finds nothing) —
    use :func:`async_discover_hubs` in async code instead.
    """

    if zc is None:
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            pass
        else:
            raise RuntimeError(
                "discover_hubs() is blocking and cannot run inside an asyncio "
                "event loop; use async_discover_hubs() in async code (or pass "
                "your own zc=)."
            )

    browser = HubBrowser(zc=zc, include_proxies=include_proxies)
    browser.start()
    try:
        time.sleep(max(0.0, float(timeout)))
        return browser.hubs
    finally:
        browser.stop()
