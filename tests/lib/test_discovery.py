"""Tests for the library-side mDNS hub discovery (lib/discovery.py).

The real ``zeroconf`` engine is not exercised; tests drive the browser's
state-change handler with fake engine/info objects, which is also the
seam the lazy zeroconf import leaves open in environments without the
dependency installed.
"""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)


def _load_lib() -> types.ModuleType:
    name = "sofapython_discovery_test_pkg"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, LIB_DIR / "__init__.py", submodule_search_locations=[str(LIB_DIR)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_pkg = _load_lib()
discovery = importlib.import_module(f"{_pkg.__name__}.discovery")
hub_versions = importlib.import_module(f"{_pkg.__name__}.hub_versions")


class FakeStateChange:
    def __init__(self, name: str) -> None:
        self.name = name


ADDED = FakeStateChange("Added")
UPDATED = FakeStateChange("Updated")
REMOVED = FakeStateChange("Removed")

X1HUB_TYPE = hub_versions.MDNS_SERVICE_TYPE_X1


class FakeServiceInfo:
    def __init__(self, *, addresses=("192.168.1.50",), port=8102, properties=None):
        self._addresses = list(addresses)
        self.port = port
        self.properties = properties or {}

    def parsed_addresses(self):
        return list(self._addresses)


class FakeZeroconf:
    def __init__(self, infos: dict[str, FakeServiceInfo]):
        self.infos = infos
        self.closed = False

    def get_service_info(self, service_type, name, timeout=3000):
        return self.infos.get(name)

    def close(self):
        self.closed = True


def _make_browser(infos: dict[str, FakeServiceInfo], **kwargs) -> tuple:
    events: list[tuple[str, object]] = []
    browser = discovery.HubBrowser(
        zc=FakeZeroconf(infos),
        on_added=lambda hub: events.append(("added", hub)),
        on_updated=lambda hub: events.append(("updated", hub)),
        on_removed=lambda hub: events.append(("removed", hub)),
        **kwargs,
    )
    return browser, events


# ---------------------------------------------------------------------------
# TXT decoding / normalization
# ---------------------------------------------------------------------------


def test_decode_txt_properties_handles_bytes_str_and_none() -> None:
    raw = {b"HVER": b"2", "NAME": "Living Room", b"FLAG": None, b"\xff\xfe": b"x"}
    assert discovery.decode_txt_properties(raw) == {
        "HVER": "2",
        "NAME": "Living Room",
        "FLAG": "",
    }


def test_normalize_classifies_known_hub() -> None:
    hub = discovery.normalize_advertisement(
        X1HUB_TYPE,
        f"SOFABATON._x1hub._udp.local.",
        host="192.168.1.50",
        port=8102,
        properties={b"HVER": b"2", b"MAC": b"AA:BB", b"NAME": b"Den"},
    )
    assert hub is not None
    assert hub.host == "192.168.1.50"
    assert hub.port == 8102
    assert hub.name == "Den"
    assert hub.mac == "AA:BB"
    assert hub.hub_version == hub_versions.HUB_VERSION_X1S
    assert hub.is_proxy is False
    assert hub.key == (X1HUB_TYPE, "SOFABATON._x1hub._udp.local.")


def test_normalize_unknown_hver_keeps_hub_with_none_version() -> None:
    hub = discovery.normalize_advertisement(
        X1HUB_TYPE,
        "MYSTERY._x1hub._udp.local.",
        host="10.0.0.9",
        port=8102,
        properties={b"HVER": b"99"},
    )
    assert hub is not None
    assert hub.hub_version is None
    assert hub.name == "MYSTERY"
    assert hub.mac is None


def test_normalize_rejects_foreign_service_type_and_missing_host() -> None:
    assert (
        discovery.normalize_advertisement(
            "_other._udp.local.", "X._other._udp.local.", host="1.2.3.4", port=1, properties={}
        )
        is None
    )
    assert (
        discovery.normalize_advertisement(
            X1HUB_TYPE, "X._x1hub._udp.local.", host=None, port=8102, properties={}
        )
        is None
    )


def test_normalize_marks_proxy_advertisements() -> None:
    hub = discovery.normalize_advertisement(
        X1HUB_TYPE,
        "PROXY._x1hub._udp.local.",
        host="10.0.0.2",
        port=8102,
        properties={b"HVER": b"1", hub_versions.PROXY_TXT_KEY.encode(): b"1"},
    )
    assert hub is not None and hub.is_proxy is True


# ---------------------------------------------------------------------------
# HubBrowser behavior
# ---------------------------------------------------------------------------


def test_browser_add_update_remove_cycle() -> None:
    name = "DEN._x1hub._udp.local."
    infos = {name: FakeServiceInfo(properties={b"HVER": b"2", b"NAME": b"Den"})}
    browser, events = _make_browser(infos)

    browser._on_service_state_change(browser._zc, X1HUB_TYPE, name, ADDED)
    assert [kind for kind, _ in events] == ["added"]
    assert browser.hubs[0].name == "Den"

    # Same payload re-announced as Updated -> updated event fires.
    browser._on_service_state_change(browser._zc, X1HUB_TYPE, name, UPDATED)
    assert [kind for kind, _ in events] == ["added", "updated"]

    browser._on_service_state_change(browser._zc, X1HUB_TYPE, name, REMOVED)
    assert [kind for kind, _ in events] == ["added", "updated", "removed"]
    assert browser.hubs == []


def test_browser_filters_proxies_by_default() -> None:
    name = "PROXY._x1hub._udp.local."
    infos = {
        name: FakeServiceInfo(
            properties={b"HVER": b"2", hub_versions.PROXY_TXT_KEY.encode(): b"1"}
        )
    }
    browser, events = _make_browser(infos)
    browser._on_service_state_change(browser._zc, X1HUB_TYPE, name, ADDED)
    assert events == [] and browser.hubs == []

    browser_inc, events_inc = _make_browser(infos, include_proxies=True)
    browser_inc._on_service_state_change(browser_inc._zc, X1HUB_TYPE, name, ADDED)
    assert [kind for kind, _ in events_inc] == ["added"]
    assert browser_inc.hubs[0].is_proxy is True


def test_browser_ignores_unresolvable_and_removed_unknown() -> None:
    browser, events = _make_browser({})
    browser._on_service_state_change(
        browser._zc, X1HUB_TYPE, "GHOST._x1hub._udp.local.", ADDED
    )
    browser._on_service_state_change(
        browser._zc, X1HUB_TYPE, "GHOST._x1hub._udp.local.", REMOVED
    )
    assert events == [] and browser.hubs == []


def test_browser_callback_exception_does_not_break_browse() -> None:
    name = "DEN._x1hub._udp.local."
    infos = {name: FakeServiceInfo(properties={b"HVER": b"2"})}
    browser = discovery.HubBrowser(
        zc=FakeZeroconf(infos),
        on_added=lambda hub: (_ for _ in ()).throw(RuntimeError("boom")),
    )
    browser._on_service_state_change(browser._zc, X1HUB_TYPE, name, ADDED)
    assert len(browser.hubs) == 1


def test_browser_stop_closes_owned_engine_only() -> None:
    injected = FakeZeroconf({})
    browser = discovery.HubBrowser(zc=injected)

    class FakeBrowserHandle:
        cancelled = False

        def cancel(self):
            FakeBrowserHandle.cancelled = True

    browser._create_browser = lambda zc: FakeBrowserHandle()
    browser.start()
    browser.stop()
    assert FakeBrowserHandle.cancelled is True
    assert injected.closed is False  # injected engines are caller-owned


def test_discover_hubs_one_shot(monkeypatch) -> None:
    name = "DEN._x1hub._udp.local."
    infos = {name: FakeServiceInfo(properties={b"HVER": b"2", b"NAME": b"Den"})}

    started: dict[str, object] = {}
    original_start = discovery.HubBrowser.start

    def fake_start(self):
        # Engine injected, browser stubbed: simulate one advertisement
        # arriving during the scan window.
        self._browser = object()
        self._on_service_state_change(self._zc, X1HUB_TYPE, name, ADDED)
        started["browser"] = self
        return self

    monkeypatch.setattr(discovery.HubBrowser, "start", fake_start)
    monkeypatch.setattr(discovery.time, "sleep", lambda s: None)

    hubs = discovery.discover_hubs(timeout=0.01, zc=FakeZeroconf(infos))
    assert len(hubs) == 1 and hubs[0].name == "Den"
    assert started["browser"]._browser is None  # stopped on exit


# ---------------------------------------------------------------------------
# CLI dispatch
# ---------------------------------------------------------------------------


def test_cli_discover_subcommand(monkeypatch, capsys) -> None:
    cli = importlib.import_module(f"{_pkg.__name__}.cli")
    hub = discovery.normalize_advertisement(
        X1HUB_TYPE,
        "DEN._x1hub._udp.local.",
        host="192.168.1.50",
        port=8102,
        properties={b"HVER": b"2", b"NAME": b"Den", b"MAC": b"AA:BB"},
    )
    monkeypatch.setattr(
        discovery, "discover_hubs", lambda timeout, include_proxies: [hub]
    )
    cli.main(["discover", "--timeout", "0.1"])
    out = capsys.readouterr().out
    assert "192.168.1.50" in out and "Den" in out and "X1S" in out

    cli.main(["discover", "--timeout", "0.1", "--json"])
    out = capsys.readouterr().out
    assert '"host": "192.168.1.50"' in out and '"hub_version": "X1S"' in out


def test_cli_top_level_help_lists_subcommands(capsys) -> None:
    cli = importlib.import_module(f"{_pkg.__name__}.cli")
    cli.main(["--help"])
    out = capsys.readouterr().out
    assert "discover" in out and "run" in out
