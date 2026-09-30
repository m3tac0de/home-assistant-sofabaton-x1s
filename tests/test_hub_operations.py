"""One operation per hub on the HA path (R5 batch 2.2).

The busy rule (registry operations, hub work, the Wifi Command lock), the
write decorators, the unload drain and the smaller fixes that ride on them.
"""

import asyncio
import importlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest
from homeassistant.exceptions import HomeAssistantError

from tests.hub_fakes import FakeHass

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
from custom_components.sofabaton_x1s.hub import SofabatonHub  # noqa: E402


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload=None):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


def _real_hub(loop):
    hass = FakeHass(loop)
    hass.data = {integration.DOMAIN: {}}
    hub = SofabatonHub(hass, "entry-1", "hub", "127.0.0.1", 1234, {}, 9999, 10000, True, False)
    hass.data[integration.DOMAIN]["entry-1"] = hub
    return hass, hub


def _no_persist(monkeypatch):
    persisted: list = []

    async def _persist(_hass, hub):
        persisted.append(hub.entry_id)
        return True

    monkeypatch.setattr(integration, "_async_persist_hub_cache", _persist)
    return persisted


# -- CR-H2-1: the resolver never lands on another hub --------------------


def test_the_single_hub_fallback_needs_a_call_that_named_no_hub():
    loop = asyncio.new_event_loop()
    try:
        hass, hub = _real_hub(loop)
        resolve = integration._async_resolve_hub_from_data
        assert loop.run_until_complete(resolve(hass, {"entry_id": "entry-1"})) is hub
        assert loop.run_until_complete(resolve(hass, {})) is hub
        # A disabled or reloading hub named by the caller: never another hub.
        assert loop.run_until_complete(resolve(hass, {"entry_id": "entry-2"})) is None
        assert loop.run_until_complete(resolve(hass, {"hub": "aa:bb:cc:dd:ee:ff"})) is None
    finally:
        loop.close()


# -- CR-X1-6 / CR-H2-2: immediate writes and services are hub work ------------


def test_an_immediate_ws_write_holds_the_hub_until_it_ends(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass, hub = _real_hub(loop)
        persisted = _no_persist(monkeypatch)
        release = asyncio.Event()
        seen: dict = {}

        async def _slow_delete(*, device_id):
            seen["gate_during_write"] = hub.is_long_running_task_active()
            await release.wait()
            return {"status": "success"}

        monkeypatch.setattr(hub, "async_delete_device", _slow_delete)

        async def main():
            first, second = _Conn(), _Conn()
            running = asyncio.ensure_future(
                integration._ws_device_delete(hass, first, {"id": 1, "entry_id": "entry-1", "device_id": 3})
            )
            await asyncio.sleep(0)
            await integration._ws_device_reorder(
                hass, second, {"id": 2, "entry_id": "entry-1", "ordered_ids": [1, 2]}
            )
            release.set()
            await running
            return first, second

        first, second = loop.run_until_complete(main())
        assert second.error[1] == "busy"
        assert first.result == (1, {"status": "success"})
        assert seen["gate_during_write"] is True  # the CALL_ME gate saw it
        assert hub.is_long_running_task_active() is False
        assert persisted == ["entry-1"]  # CR-R1-8: the write persisted
    finally:
        loop.close()


def test_a_write_service_is_refused_while_the_hub_is_busy(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass, hub = _real_hub(loop)
        _no_persist(monkeypatch)
        calls: list = []

        async def _delete(device_id, **_kwargs):
            calls.append(hub.hub_work_active)
            return {"status": "success"}

        monkeypatch.setattr(hub, "async_delete_device", _delete)
        call = SimpleNamespace(hass=hass, data={"entry_id": "entry-1", "device_id": 3})

        async def main():
            async with hub.async_hub_work():
                with pytest.raises(HomeAssistantError, match="hub_busy"):
                    await integration._async_handle_delete_device(call)
            await integration._async_handle_delete_device(call)

        loop.run_until_complete(main())
        assert calls == [True]  # ran once, as hub work
    finally:
        loop.close()


def test_a_registry_operation_counts_as_hub_work(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass, hub = _real_hub(loop)
        seen: list = []

        async def _refresh(**_kwargs):
            seen.append(hub.hub_work_active)
            return {}

        monkeypatch.setattr(hub, "async_refresh_hub_cache", _refresh)
        monkeypatch.setattr(integration, "async_call_later", lambda *_a, **_k: (lambda: None))
        registry = integration._backup_operation_registry(hass)
        op = registry.create(kind="cache_refresh", entry_id="entry-1", initial_state={"status": "pending"})
        loop.run_until_complete(integration._run_cache_refresh_operation(hass, op, hub=hub))
        assert seen == [True]
        assert hub.hub_work_active is False
    finally:
        loop.close()


# -- CR-X1-3: on-demand reads never reach a busy hub -----------------------


def test_the_power_state_read_answers_unknown_while_busy(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass, hub = _real_hub(loop)
        reads: list = []

        async def _power_state(device_id):
            reads.append(device_id)
            return 1

        monkeypatch.setattr(hub, "async_get_device_power_state", _power_state)

        async def main():
            conn = _Conn()
            async with hub.async_hub_work():
                await integration._ws_get_device_power_state(
                    hass, conn, {"id": 1, "entry_id": "entry-1", "device_id": 3}
                )
            return conn

        conn = loop.run_until_complete(main())
        assert conn.result == (1, {"power_state": None})
        assert reads == []
    finally:
        loop.close()


def test_the_activity_prime_skips_a_busy_hub(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        _hass, hub = _real_hub(loop)
        requests: list = []
        monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *a, **k: requests.append(a) or ([], False))

        async def main():
            async with hub.async_hub_work():
                await hub._async_prime_buttons_for(0x65)

        loop.run_until_complete(main())
        assert requests == []
    finally:
        loop.close()


# -- CR-X1-2: unload waits for running work -------------------------------


def test_unload_waits_for_running_hub_work(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass, hub = _real_hub(loop)
        order: list = []

        async def main():
            async def _work():
                async with hub.async_hub_work():
                    await asyncio.sleep(0.05)
                    order.append("work done")

            task = asyncio.ensure_future(_work())
            await asyncio.sleep(0)
            await integration._async_drain_hub_work(hass, hub)
            order.append("drained")
            await task

        loop.run_until_complete(main())
        assert order == ["work done", "drained"]
    finally:
        loop.close()


def test_unload_marks_work_that_outlives_the_bound_failed(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass, hub = _real_hub(loop)
        monkeypatch.setattr(integration, "_UNLOAD_DRAIN_TIMEOUT_S", 0.05)
        monkeypatch.setattr(integration, "async_call_later", lambda *_a, **_k: (lambda: None))
        registry = integration._backup_operation_registry(hass)
        op = registry.create(kind="backup_restore", entry_id="entry-1", initial_state={"status": "running"})

        loop.run_until_complete(integration._async_drain_hub_work(hass, hub))

        state = registry.get(op)["state"]
        assert state["status"] == "failed"
        assert "unloaded" in state["message"]
        assert not registry.has_running_for_entry("entry-1")
    finally:
        loop.close()


# -- CR-H2-5: a Wifi Device still on the hub keeps its record ---------------


def test_a_wifi_device_delete_the_hub_refused_keeps_the_record(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass, hub = _real_hub(loop)
        _no_persist(monkeypatch)
        deleted_records: list = []

        class _Store:
            async def async_get_hub_config(self, entry_id, **_kwargs):
                return {"deployed_device_id": 9, "deployed_commands_hash": "abc", "commands_hash": "abc"}

            async def async_list_hub_devices(self, *_args, **_kwargs):
                return [{"device_key": "k1", "deployed_device_id": 9}]

            async def async_delete_hub_device(self, entry_id, device_key):
                deleted_records.append(device_key)
                return True

        async def _store(_hass):
            return _Store()

        async def _refused_delete(*_args, **_kwargs):
            return None

        async def _snapshot():
            return {9: {"brand": "m3-k1-abc", "name": "Lights"}}

        monkeypatch.setattr(integration, "_async_get_command_config_store", _store)
        monkeypatch.setattr(integration, "_async_resolve_hub_from_data", lambda *_a, **_k: asyncio.sleep(0, result=hub))
        monkeypatch.setattr(hub, "async_delete_device", _refused_delete)
        monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _snapshot)
        monkeypatch.setattr(hub, "_match_managed_wifi_devices", lambda **_k: ([(9, "k1", "abc", "m3-k1-abc")], False))

        conn = _Conn()
        loop.run_until_complete(
            integration._ws_delete_command_device(
                hass, conn, {"id": 1, "entity_id": "remote.hub", "device_key": "k1"}
            )
        )
        assert conn.error[1] == "delete_failed"
        assert deleted_records == []
    finally:
        loop.close()


# -- CR-X2-5: backup/state sends counts, not the bundle ----------------------


def test_backup_state_sends_counts_instead_of_the_bundle(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass, _hub = _real_hub(loop)
        monkeypatch.setattr(integration, "async_call_later", lambda *_a, **_k: (lambda: None))
        registry = integration._backup_operation_registry(hass)
        op = registry.create(kind="backup_export", entry_id="entry-1", initial_state={"status": "running"})
        bundle = {"devices": [{}, {}, {}], "activities": [{}]}
        registry.update(op, status="success", backup=bundle)

        conn = _Conn()
        loop.run_until_complete(integration._ws_backup_state(hass, conn, {"id": 1, "entry_id": "entry-1"}))
        export = conn.result[1]["backup_export"]
        assert "backup" not in export
        assert export["has_backup"] is True
        assert export["backup_summary"] == {"devices": 3, "activities": 1}
        # The download view still has the bundle.
        assert registry.get(op)["state"]["backup"] is bundle
    finally:
        loop.close()


# -- CR-X1-1: a failed sync after writes reads the entity back ---------------


def test_a_failed_sync_after_writes_reads_the_entity_back(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass, hub = _real_hub(loop)
        persisted = _no_persist(monkeypatch)
        monkeypatch.setattr(integration, "async_call_later", lambda *_a, **_k: (lambda: None))
        reads: list = []

        async def _sync_activity(**_kwargs):
            return {"status": "failed", "failed_at": "binding_write", "completed_steps": 1}

        async def _refresh(*, kind, ent_id):
            reads.append((kind, ent_id))

        monkeypatch.setattr(hub, "async_sync_activity", _sync_activity)
        monkeypatch.setattr(hub, "async_refresh_entity_structure", _refresh)
        registry = integration._backup_operation_registry(hass)
        op = registry.create(kind="activity_sync", entry_id="entry-1", initial_state={"status": "running"})

        result = loop.run_until_complete(
            integration._run_entity_sync_operation(
                hass, op, hub=hub, baseline={}, edited={}, entity_kind="activity", entity_id=101
            )
        )
        assert result["failed_at"] == "binding_write"
        assert reads == [("activity", 101)]
        assert persisted == ["entry-1"]
        assert registry.get(op)["state"]["status"] == "failed"
    finally:
        loop.close()


# -- CR-X4-1: one Wifi name rule ---------------------------------------------


# tests/fixtures/wifi-name-vectors.json is shared with the card's sanitizer
# test (tests/frontend/wifi-names.test.ts), so the two rules cannot drift.
_WIFI_NAME_VECTORS = json.loads(
    (Path(__file__).resolve().parent / "fixtures" / "wifi-name-vectors.json").read_text(encoding="utf-8")
)["vectors"]


@pytest.mark.parametrize(
    ("version", "name", "ok"),
    [(v["version"], v["name"], v["ok"]) for v in _WIFI_NAME_VECTORS],
    ids=[v["why"] for v in _WIFI_NAME_VECTORS],
)
def test_wifi_names_follow_the_card_rule(version, name, ok):
    hub = SimpleNamespace(version=version)
    if ok:
        assert integration._validate_wifi_name_for_hub(hub, name) == name
    else:
        with pytest.raises(ValueError):
            integration._validate_wifi_name_for_hub(hub, name)


# -- CR-X2-6: sync_command_config picks a Wifi Device by name ----------------


def test_sync_command_config_needs_a_name_when_several_wifi_devices_exist():
    class _Store:
        async def async_list_hub_devices(self, *_args, **_kwargs):
            return [
                {"device_key": "a1", "device_name": "Lights"},
                {"device_key": "b2", "device_name": "Blinds"},
                {"device_key": "haevents", "device_name": "Wifi Events"},
            ]

    pick = integration._async_pick_wifi_device_key
    store = _Store()
    assert asyncio.run(pick(store, "entry-1", "blinds", roku_listen_port=8060)) == "b2"
    with pytest.raises(HomeAssistantError, match="several Wifi Devices"):
        asyncio.run(pick(store, "entry-1", "", roku_listen_port=8060))
    with pytest.raises(HomeAssistantError, match="No single Wifi Device"):
        asyncio.run(pick(store, "entry-1", "Kitchen", roku_listen_port=8060))
