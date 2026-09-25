"""S1: HubManager records, persistence, lifecycle, enable/disable, re-keying."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from sofabaton import HubConfig

from sofabaton_server.config import Settings
from sofabaton_server.manager import HubConflict, HubDisabled, HubManager, HubNotFound, HubStartFailed
from sofabaton_server.store import HubStore

from fakes import Factory


def _manager(tmp_path: Path, factory: Factory, **settings) -> HubManager:
    return HubManager(Settings(data_dir=tmp_path, **settings), proxy_factory=factory)


def _run(coro):
    return asyncio.run(coro)


def test_add_by_host_starts_proxy_and_persists(tmp_path: Path) -> None:
    factory = Factory()

    async def main():
        m = _manager(tmp_path, factory)
        await m.start()
        rec = await m.add(HubConfig(host="192.168.1.50"))
        assert rec.hub_id == "192.168.1.50" and rec.enabled
        assert factory.latest("192.168.1.50").started
        view = await m.view(rec.hub_id)
        assert view.status is not None and view.status.mode == "control"
        assert m.count() == 1
        await m.stop()
        assert factory.latest("192.168.1.50").stops == [False]   # shutdown: no release

    _run(main())
    saved = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))
    assert saved["schema"] == 1 and saved["hubs"][0]["hub_id"] == "192.168.1.50"
    assert saved["hubs"][0]["config"]["host"] == "192.168.1.50"


def test_ready_event_rekeys_record_to_mac_and_relays_events(tmp_path: Path) -> None:
    factory = Factory()
    seen: list[tuple[str, str]] = []
    server_events: list[tuple[str, str]] = []

    async def main():
        m = _manager(tmp_path, factory)
        m.on_hub_event(lambda hub_id, ev: seen.append((hub_id, ev.kind)))
        m.on_server_event(lambda hub_id, kind: server_events.append((hub_id, kind)))
        await m.start()
        await m.add(HubConfig(host="192.168.1.50"))
        proxy = factory.latest("192.168.1.50")
        proxy.emit("hub_state")
        await asyncio.sleep(0.02)
        proxy.ready("E2:6A:44:86:1B:45")
        await asyncio.sleep(0.05)

        assert m.ids() == ["e26a44861b45"]
        rec = m.record("e26a44861b45")
        assert rec.config.mac == "E2:6A:44:86:1B:45" and rec.config.hub_version == "X1S"
        assert rec.last_seen is not None
        assert m.proxy("e26a44861b45") is proxy
        assert proxy.advertised == 1          # the app can find the proxy
        with pytest.raises(HubNotFound):
            m.record("192.168.1.50")
        await m.stop()

    _run(main())
    assert seen == [("192.168.1.50", "hub_state"), ("e26a44861b45", "catalog_ready")]
    assert ("e26a44861b45", "hub_rekeyed") in server_events
    saved = json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))
    assert saved["hubs"][0]["hub_id"] == "e26a44861b45"


def test_disable_stops_with_release_and_enable_restarts(tmp_path: Path) -> None:
    factory = Factory()
    server_events: list[tuple[str, str]] = []

    async def main():
        m = _manager(tmp_path, factory)
        m.on_server_event(lambda hub_id, kind: server_events.append((hub_id, kind)))
        await m.start()
        rec = await m.add(HubConfig(host="192.168.1.50"))
        first = factory.latest("192.168.1.50")

        await m.disable(rec.hub_id)
        assert first.stops == [True]                     # released for the app
        assert not m.record(rec.hub_id).enabled
        with pytest.raises(HubDisabled):
            m.proxy(rec.hub_id)
        view = await m.view(rec.hub_id)
        assert view.status is None and view.enabled is False

        await m.enable(rec.hub_id)
        second = factory.latest("192.168.1.50")
        assert second is not first and second.started      # a fresh proxy
        assert m.proxy(rec.hub_id) is second
        await m.stop()

    _run(main())
    kinds = [k for _, k in server_events]
    assert kinds == ["hub_added", "hub_disabled", "hub_enabled"]


def test_proxy_toggle_switches_in_place_and_survives_restart(tmp_path: Path) -> None:
    factory = Factory()
    server_events: list[tuple[str, str]] = []

    async def first_run():
        m = _manager(tmp_path, factory)
        m.on_server_event(lambda hub_id, kind: server_events.append((hub_id, kind)))
        await m.start()
        await m.add(HubConfig(host="192.168.1.50"))
        proxy = factory.latest("192.168.1.50")
        await m.set_proxy_enabled("192.168.1.50", False)
        assert proxy.proxy_enabled is False and proxy.stops == []    # same proxy, no restart
        assert m.record("192.168.1.50").config.proxy_enabled is False
        await m.set_proxy_enabled("192.168.1.50", False)              # no-op: no second event
        await m.stop()

    async def second_run():
        m = _manager(tmp_path, factory)
        await m.start()
        proxy = factory.latest("192.168.1.50")
        assert proxy.config.proxy_enabled is False and proxy.proxy_enabled is False
        await m.disable("192.168.1.50")
        await m.set_proxy_enabled("192.168.1.50", True)               # stored while disabled
        await m.enable("192.168.1.50")
        assert factory.latest("192.168.1.50").proxy_enabled is True
        with pytest.raises(HubNotFound):
            await m.set_proxy_enabled("nope", True)
        await m.stop()

    _run(first_run())
    _run(second_run())
    assert [k for _, k in server_events] == ["hub_added", "hub_proxy_disabled"]


def test_records_and_enabled_state_survive_restart(tmp_path: Path) -> None:
    factory = Factory()

    async def first_run():
        m = _manager(tmp_path, factory)
        await m.start()
        await m.add(HubConfig(host="192.168.1.50"))
        await m.add(HubConfig(host="192.168.1.51"), enabled=False)
        await m.disable("192.168.1.50")
        await m.stop()

    async def second_run():
        m = _manager(tmp_path, factory)
        await m.start()
        assert sorted(m.ids()) == ["192.168.1.50", "192.168.1.51"]
        assert not m.record("192.168.1.50").enabled and not m.record("192.168.1.51").enabled
        # Nothing was started for disabled hubs.
        assert len(factory.built.get("192.168.1.51", [])) == 0
        assert not factory.latest("192.168.1.50").started
        await m.enable("192.168.1.51")
        assert factory.latest("192.168.1.51").started
        await m.stop()

    _run(first_run())
    _run(second_run())


def test_initial_hubs_seed_only_an_empty_store(tmp_path: Path) -> None:
    factory = Factory()

    async def main():
        m = _manager(tmp_path, factory, initial_hubs=("10.0.0.1", "10.0.0.2"))
        await m.start()
        assert sorted(m.ids()) == ["10.0.0.1", "10.0.0.2"]
        await m.remove("10.0.0.2")
        await m.stop()
        # Second start: hubs.json exists (one hub), the seed must not re-add.
        m2 = _manager(tmp_path, factory, initial_hubs=("10.0.0.1", "10.0.0.2"))
        await m2.start()
        assert m2.ids() == ["10.0.0.1"]
        await m2.stop()

    _run(main())


def test_add_rejects_duplicates_and_own_proxy_advertisements(tmp_path: Path) -> None:
    factory = Factory()

    async def main():
        m = _manager(tmp_path, factory)
        await m.start()
        await m.add(HubConfig(host="192.168.1.50", mac="AA:BB:CC:DD:EE:FF"))
        with pytest.raises(HubConflict) as dup_host:
            await m.add(HubConfig(host="192.168.1.50"))
        assert dup_host.value.existing_hub_id == "aabbccddeeff"
        with pytest.raises(HubConflict):
            await m.add(HubConfig(host="192.168.1.99", mac="aa-bb-cc-dd-ee-ff"))
        with pytest.raises(HubConflict) as own:
            await m.add(HubConfig(host="192.168.1.5", mac="AA:BB:CC:DD:EE:FF", is_proxy=True))
        assert own.value.existing_hub_id == "aabbccddeeff"
        assert m.count() == 1
        await m.stop()

    _run(main())


def test_remove_stops_releases_and_forgets(tmp_path: Path) -> None:
    factory = Factory()

    async def main():
        m = _manager(tmp_path, factory)
        await m.start()
        await m.add(HubConfig(host="192.168.1.50"))
        await m.remove("192.168.1.50")
        assert factory.latest("192.168.1.50").stops == [True]
        assert m.count() == 0
        with pytest.raises(HubNotFound):
            await m.remove("192.168.1.50")
        await m.stop()

    _run(main())
    assert json.loads((tmp_path / "hubs.json").read_text(encoding="utf-8"))["hubs"] == []


def test_store_rejects_foreign_schema(tmp_path: Path) -> None:
    (tmp_path / "hubs.json").write_text(json.dumps({"schema": 99, "hubs": []}), encoding="utf-8")
    with pytest.raises(ValueError):
        HubStore(tmp_path).load()


def test_concurrent_disable_and_enable_settle_consistently(tmp_path: Path) -> None:
    # Review finding: disable yielded while cancelling its watcher; an
    # enable arriving in that gap saw the proxy still registered, did
    # nothing, and disable then stopped it: record enabled, no proxy.
    factory = Factory()

    async def main():
        m = _manager(tmp_path, factory)
        await m.start()
        await m.add(HubConfig(host="192.168.1.50"))
        first = factory.latest("192.168.1.50")

        disable = asyncio.ensure_future(m.disable("192.168.1.50"))
        await asyncio.sleep(0)                  # disable is inside its transition
        enable = asyncio.ensure_future(m.enable("192.168.1.50"))
        await asyncio.gather(disable, enable)

        rec = m.record("192.168.1.50")
        assert rec.enabled is True
        assert m.proxy("192.168.1.50") is not first          # a fresh proxy runs
        assert first.stops == [True] and m.proxy("192.168.1.50").started
        await m.stop()

    _run(main())


def test_failed_start_registers_nothing_and_enable_retries(tmp_path: Path) -> None:
    factory = Factory()
    factory.start_error = OSError("port in use")

    async def main():
        m = _manager(tmp_path, factory)
        await m.start()
        with pytest.raises(HubStartFailed) as info:
            await m.add(HubConfig(host="192.168.1.50"))
        assert info.value.hub_id == "192.168.1.50"
        assert m.record("192.168.1.50").enabled is True       # kept as asked
        with pytest.raises(HubDisabled):
            m.proxy("192.168.1.50")                            # nothing phantom
        assert (await m.view("192.168.1.50")).status is None
        assert factory.latest("192.168.1.50").stops == [False]

        factory.start_error = None
        await m.enable("192.168.1.50")
        assert m.proxy("192.168.1.50").started
        await m.stop()

    _run(main())


def test_start_failure_at_boot_leaves_other_hubs_running(tmp_path: Path) -> None:
    factory = Factory()

    def picky(config: HubConfig):
        proxy = factory(config)
        proxy.start_error = OSError("port in use") if config.host == "10.0.0.1" else None
        return proxy

    async def main():
        m = _manager(tmp_path, factory)
        await m.start()
        await m.add(HubConfig(host="10.0.0.1"))
        await m.add(HubConfig(host="10.0.0.2"))
        await m.stop()

        m2 = HubManager(Settings(data_dir=tmp_path), proxy_factory=picky)
        await m2.start()                                       # boot survives the failure
        assert not factory.latest("10.0.0.1").started
        assert factory.latest("10.0.0.2").started
        assert m2.record("10.0.0.1").enabled is True
        with pytest.raises(HubDisabled):
            m2.proxy("10.0.0.1")
        await m2.stop()

    _run(main())
