"""Tests for the asyncio facade (lib/aio.py).

The facade owns no protocol logic, so these tests verify its jobs:
executor delegation, thread->loop callback marshaling, and the
human-friendly read/control surface — including the burst->Future bridge
that turns the engine's lazy ``(data, ready)`` getters into clean
awaitables.
"""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import sys
import threading
import types
from pathlib import Path

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)


def _load_lib() -> types.ModuleType:
    name = "sofapython_aio_test_pkg"
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
aio = importlib.import_module(f"{_pkg.__name__}.aio")
x1_proxy_mod = importlib.import_module(f"{_pkg.__name__}.x1_proxy")
protocol_const = importlib.import_module(f"{_pkg.__name__}.protocol_const")


class FakeProxy:
    """Duck-typed engine modelling the lazy-fetch + burst pattern.

    A catalog/detail getter returns ``(data, ready)``; while not ready it
    records a fetch and returns empty. ``make_ready`` + ``fire_burst``
    (optionally from a worker thread) emulate the hub reply landing.
    """

    class _Transport:
        is_hub_connected = True
        is_client_connected = False

    def __init__(self) -> None:
        self._listeners: dict[str, list] = {}
        self.hub_state_listeners: list = []
        self.client_state_listeners: list = []
        self.burst_listeners: dict[str, list] = {}
        self.can_issue = True
        self.started = False
        self.stopped = False
        self.sent: list[tuple[int, int]] = []
        self.fetch_calls: list[tuple[str, int | None]] = []
        self.favorites_reply: list[tuple[int, int]] | None = []
        self.transport = FakeProxy._Transport()
        self._ready: dict[str, dict] = {"commands": {}, "macros": {}, "activities": None, "devices": None}

    # -- listener registration ------------------------------------------
    def on_hub_state_change(self, cb) -> None:
        self.hub_state_listeners.append(cb)

    def on_client_state_change(self, cb) -> None:
        self.client_state_listeners.append(cb)

    def set_connected(self, *, hub: bool, client: bool = False) -> None:
        self.transport.is_hub_connected = hub
        self.transport.is_client_connected = client
        self.can_issue = hub and not client
        for cb in list(self.hub_state_listeners):
            cb(hub)
        for cb in list(self.client_state_listeners):
            cb(client)

    def on_burst_end(self, key, cb) -> None:
        self._listeners.setdefault(key, []).append(cb)
        self.burst_listeners.setdefault(key, []).append(cb)

    # emulate state_helpers.BurstScheduler._notify_burst_end
    def fire_burst(self, full_key: str) -> None:
        for cb in self._listeners.get(full_key, []):
            cb(full_key)
        if ":" in full_key:
            prefix = full_key.split(":", 1)[0]
            for cb in self._listeners.get(prefix, []):
                cb(full_key)

    def fire_hub_state(self, value: bool) -> None:
        for cb in self.hub_state_listeners:
            cb(value)

    # -- gating / lifecycle ---------------------------------------------
    def can_issue_commands(self) -> bool:
        return self.can_issue

    def start(self) -> None:
        self.started = True

    def stop(self) -> None:
        self.stopped = True

    # -- lazy getters ----------------------------------------------------
    def get_activities(self, *, fetch_if_missing=True):
        data = self._ready["activities"]
        if data is not None:
            return (data, True)
        if fetch_if_missing:
            self.fetch_calls.append(("activities", None))
        return ({}, False)

    def get_devices(self, *, fetch_if_missing=True):
        data = self._ready["devices"]
        if data is not None:
            return (data, True)
        if fetch_if_missing:
            self.fetch_calls.append(("devices", None))
        return ({}, False)

    def get_commands_for_entity(self, ent_id, *, fetch_if_missing=True):
        lo = ent_id & 0xFF
        if lo in self._ready["commands"]:
            return (dict(self._ready["commands"][lo]), True)
        if fetch_if_missing:
            self.fetch_calls.append(("commands", lo))
        return ({}, False)

    def get_macros_for_activity(self, act_id, *, fetch_if_missing=True):
        lo = act_id & 0xFF
        if lo in self._ready["macros"]:
            return (list(self._ready["macros"][lo]), True)
        if fetch_if_missing:
            self.fetch_calls.append(("macros", lo))
        return ([], False)

    def request_favorites_order(self, act_id):
        return self.favorites_reply

    def send_command(self, ent_id, key_code) -> bool:
        self.sent.append((ent_id, key_code))
        return True

    # -- test helpers ----------------------------------------------------
    def make_commands_ready(self, lo, data) -> None:
        self._ready["commands"][lo] = data

    def make_activities_ready(self, data) -> None:
        self._ready["activities"] = data


def _wrap(fake: FakeProxy) -> "aio.AsyncX1Proxy":
    return aio.AsyncX1Proxy.wrap(fake)


# ---------------------------------------------------------------------------
# delegation / surface guards
# ---------------------------------------------------------------------------


def test_proxy_methods_exist_on_real_engine() -> None:
    missing = [
        name
        for name in aio.AsyncX1Proxy.PROXY_METHODS
        if not callable(getattr(x1_proxy_mod.X1Proxy, name, None))
    ]
    assert not missing, f"PROXY_METHODS drifted from X1Proxy: {sorted(missing)}"


def test_human_surface_delegates_to_real_engine_methods() -> None:
    # Each clean method wraps a real engine method; assert those exist so
    # the human surface can't silently drift from the engine.
    required = [
        "get_activities",
        "get_devices",
        "get_commands_for_entity",
        "get_buttons_for_entity",
        "get_macros_for_activity",
        "request_favorites_order",
        "send_command",
        "can_issue_commands",
    ]
    missing = [n for n in required if not callable(getattr(x1_proxy_mod.X1Proxy, n, None))]
    assert not missing, f"engine methods missing: {missing}"

    for name in (
        "activities",
        "devices",
        "commands",
        "buttons",
        "macros",
        "favorites",
        "press",
        "start_activity",
        "stop_activity",
        "find_remote",
    ):
        assert callable(getattr(aio.AsyncX1Proxy, name, None)), f"missing facade method {name}"


def test_unknown_attribute_raises_with_hint() -> None:
    async def main():
        proxy = _wrap(FakeProxy())
        try:
            proxy.definitely_not_a_method
        except AttributeError as err:
            assert ".sync" in str(err)
        else:
            raise AssertionError("expected AttributeError")

    asyncio.run(main())


# ---------------------------------------------------------------------------
# read surface
# ---------------------------------------------------------------------------


def test_read_returns_cached_without_fetch() -> None:
    async def main():
        fake = FakeProxy()
        fake.make_commands_ready(5, {0xC6: "Power"})
        proxy = _wrap(fake)
        assert await proxy.commands(5) == {0xC6: "Power"}
        assert fake.fetch_calls == []  # already cached: no hub fetch

    asyncio.run(main())


def test_read_fetches_then_awaits_burst() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)

        async def land_later():
            await asyncio.sleep(0.05)
            fake.make_commands_ready(5, {0xC6: "Power"})
            # Fire from a worker thread to exercise call_soon_threadsafe.
            t = threading.Thread(target=fake.fire_burst, args=("commands:5",))
            t.start()
            t.join()

        asyncio.ensure_future(land_later())
        result = await proxy.commands(5)
        assert result == {0xC6: "Power"}
        assert ("commands", 5) in fake.fetch_calls  # fetch was kicked

    asyncio.run(main())


def test_read_raises_when_app_connected_and_uncached() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=True, client=True)  # app holds the hub
        proxy = _wrap(fake)
        try:
            await proxy.commands(5)
        except RuntimeError as err:
            assert "app client" in str(err)
        else:
            raise AssertionError("expected RuntimeError")
        assert fake.fetch_calls == []  # never tried to fetch

    asyncio.run(main())


def test_read_error_distinguishes_hub_not_connected() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)  # not connected yet, no app
        proxy = _wrap(fake)
        try:
            await proxy.commands(5)
        except RuntimeError as err:
            assert "not connected" in str(err)
            assert "app client" not in str(err)
        else:
            raise AssertionError("expected RuntimeError")

    asyncio.run(main())


def test_wait_until_controllable_resolves_on_state_change() -> None:
    async def main():
        fake = FakeProxy()
        fake.set_connected(hub=False)  # start: not controllable
        proxy = _wrap(fake)

        async def connect_later():
            await asyncio.sleep(0.05)
            t = threading.Thread(target=fake.set_connected, kwargs={"hub": True})
            t.start()
            t.join()

        asyncio.ensure_future(connect_later())
        assert await proxy.wait_until_controllable(timeout=5) is True

    asyncio.run(main())


def test_wait_connected_true_in_observe_mode() -> None:
    async def main():
        fake = FakeProxy()
        # Hub up but app attached: connected (observe) yet not controllable.
        fake.set_connected(hub=True, client=True)
        proxy = _wrap(fake)
        assert await proxy.wait_connected(timeout=1) is True
        assert await proxy.wait_until_controllable(timeout=0.2) is False

    asyncio.run(main())


def test_read_returns_cached_even_when_app_connected() -> None:
    async def main():
        fake = FakeProxy()
        fake.can_issue = False
        fake.make_commands_ready(5, {0xC6: "Power"})
        proxy = _wrap(fake)
        assert await proxy.commands(5) == {0xC6: "Power"}

    asyncio.run(main())


def test_read_timeout_cleans_up_waiter() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        try:
            await proxy.commands(7, timeout=0.05)
        except TimeoutError:
            pass
        else:
            raise AssertionError("expected TimeoutError")
        assert proxy._burst_waiters.get("commands:7", []) == []  # no leak

    asyncio.run(main())


def test_favorites_returns_list_or_raises() -> None:
    async def main():
        fake = FakeProxy()
        fake.favorites_reply = [(0xA1, 0), (0xA2, 1)]
        proxy = _wrap(fake)
        assert await proxy.favorites(3) == [(0xA1, 0), (0xA2, 1)]

        fake.favorites_reply = None  # hub timeout
        try:
            await proxy.favorites(3)
        except TimeoutError:
            pass
        else:
            raise AssertionError("expected TimeoutError")

    asyncio.run(main())


# ---------------------------------------------------------------------------
# control surface
# ---------------------------------------------------------------------------


def test_press_and_activity_control() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)

        assert await proxy.press(101, 0xB0) is True
        await proxy.start_activity(5)
        await proxy.stop_activity(5)

        assert fake.sent[0] == (101, 0xB0)
        assert fake.sent[1] == (5, protocol_const.ButtonName.POWER_ON)
        assert fake.sent[2] == (5, protocol_const.ButtonName.POWER_OFF)

    asyncio.run(main())


# ---------------------------------------------------------------------------
# executor delegation / lifecycle / marshaling
# ---------------------------------------------------------------------------


def test_lifecycle_and_context_manager() -> None:
    async def main():
        fake = FakeProxy()
        async with _wrap(fake) as proxy:
            assert fake.started and not fake.stopped
            assert proxy.sync is fake
        assert fake.stopped

    asyncio.run(main())


def test_run_escape_hatch() -> None:
    async def main():
        proxy = _wrap(FakeProxy())
        assert await proxy.run(lambda a, b: a + b, 2, b=3) == 5

    asyncio.run(main())


def test_delegated_method_runs_in_executor() -> None:
    async def main():
        call_thread = {}

        # create_wifi_device is a still-delegated PROXY_METHODS name.
        class WithProvision(FakeProxy):
            def create_wifi_device(self, **kwargs):
                call_thread["t"] = threading.get_ident()
                return {"ok": True}

        proxy = _wrap(WithProvision())
        assert await proxy.create_wifi_device() == {"ok": True}
        assert call_thread["t"] != threading.get_ident()

    asyncio.run(main())


def test_cache_snapshot_serializers_are_not_on_facade() -> None:
    # Cache-snapshot (de)serialization is intentionally off the public
    # async surface; only reachable through .sync.
    async def main():
        proxy = _wrap(FakeProxy())
        for name in ("export_cache_state", "import_cache_state", "clear_cached_entity_detail"):
            assert name not in aio.AsyncX1Proxy.PROXY_METHODS
            try:
                getattr(proxy, name)
            except AttributeError:
                pass
            else:
                raise AssertionError(f"{name} should not be exposed on the facade")

    asyncio.run(main())


def test_sync_callback_delivered_on_loop_thread() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        loop_thread = threading.get_ident()
        seen: list[tuple[bool, int]] = []
        done = asyncio.Event()

        def cb(value: bool) -> None:
            seen.append((value, threading.get_ident()))
            done.set()

        proxy.on_hub_state_change(cb)
        worker = threading.Thread(target=fake.fire_hub_state, args=(True,))
        worker.start()
        worker.join()
        await asyncio.wait_for(done.wait(), 5)
        assert seen == [(True, loop_thread)]

    asyncio.run(main())


def test_coroutine_callback_scheduled_on_loop() -> None:
    async def main():
        fake = FakeProxy()
        proxy = _wrap(fake)
        loop_thread = threading.get_ident()
        seen: list[tuple[str, bool, int]] = []
        done = asyncio.Event()

        async def cb(value: bool) -> None:
            seen.append(("coro", value, threading.get_ident()))
            done.set()

        proxy.on_hub_state_change(cb)
        proxy.on_burst_end("devices", lambda *a: None)  # registration shape check
        assert "devices" in fake.burst_listeners

        worker = threading.Thread(target=fake.fire_hub_state, args=(False,))
        worker.start()
        worker.join()
        await asyncio.wait_for(done.wait(), 5)
        assert seen == [("coro", False, loop_thread)]

    asyncio.run(main())


# ---------------------------------------------------------------------------
# discovery facade
# ---------------------------------------------------------------------------


def test_async_discover_hubs_delegates(monkeypatch) -> None:
    sentinel = ["hub"]
    captured: dict = {}

    def fake_discover(*, timeout, zc, include_proxies):
        captured.update(timeout=timeout, zc=zc, include_proxies=include_proxies)
        captured["thread"] = threading.get_ident()
        return sentinel

    monkeypatch.setattr(aio, "discover_hubs", fake_discover)

    async def main():
        result = await aio.async_discover_hubs(0.5, include_proxies=True)
        assert result is sentinel
        assert captured["timeout"] == 0.5 and captured["include_proxies"] is True
        assert captured["thread"] != threading.get_ident()

    asyncio.run(main())


def test_async_hub_browser_marshals_callbacks() -> None:
    discovery = importlib.import_module(f"{_pkg.__name__}.discovery")
    hub_versions = importlib.import_module(f"{_pkg.__name__}.hub_versions")

    class FakeServiceInfo:
        port = 8102
        properties = {b"HVER": b"2", b"NAME": b"Den"}

        def parsed_addresses(self):
            return ["192.168.1.50"]

    class FakeZeroconf:
        def get_service_info(self, service_type, name, timeout=3000):
            return FakeServiceInfo()

    class FakeStateChange:
        name = "Added"

    async def main():
        loop_thread = threading.get_ident()
        seen: list[tuple[str, int]] = []
        done = asyncio.Event()

        async def on_added(hub) -> None:
            seen.append((hub.name, threading.get_ident()))
            done.set()

        browser = aio.AsyncHubBrowser(zc=FakeZeroconf(), on_added=on_added)
        browser.sync._create_browser = lambda zc: types.SimpleNamespace(
            cancel=lambda: None
        )
        await browser.start()
        try:
            worker = threading.Thread(
                target=browser.sync._on_service_state_change,
                args=(
                    browser.sync._zc,
                    hub_versions.MDNS_SERVICE_TYPE_X1,
                    "DEN._x1hub._udp.local.",
                    FakeStateChange(),
                ),
            )
            worker.start()
            worker.join()
            await asyncio.wait_for(done.wait(), 5)
        finally:
            await browser.stop()

        assert seen == [("Den", loop_thread)]
        # The snapshot survives stop(); it reflects the last browse state.
        assert [hub.name for hub in browser.hubs] == ["Den"]

    asyncio.run(main())
