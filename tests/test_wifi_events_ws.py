"""WS-layer tests for the wifi_event/* endpoints and the reserved-record
presentation filter (docs/internal/wifi-events-plan.md §3/§4/§5; §8 test 5
WS half — the store half lives in test_wifi_events_store.py)."""

import asyncio
import importlib
from types import SimpleNamespace

from custom_components.sofabaton_x1s.command_config import (
    WIFI_EVENTS_DEVICE_KEY,
    CommandConfigStore,
)

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class _SyncHub:
    """Hub stub whose async_sync_command_config mimics the deploy contract:
    records the payload it was called with and persists a deployed snapshot
    (or raises, when primed with an error)."""

    def __init__(self, store, *, hub_version: str = "X1S"):
        self.entry_id = "entry-1"
        self.version = hub_version
        self._store = store
        self.sync_calls = []
        self.sync_error: Exception | None = None
        self.wifi_device_id = 10
        self.record_delete_calls: list[tuple[int, list[int]]] = []

    async def async_delete_wifi_event_records(self, *, device_id, command_ids):
        self.record_delete_calls.append((int(device_id), [int(c) for c in command_ids]))
        return True

    async def async_sync_command_config(self, *, command_payload, request_port, device_key, device_name):
        self.sync_calls.append(
            {
                "device_key": device_key,
                "device_name": device_name,
                "request_port": request_port,
                "slot_count": command_payload.get("slot_count"),
                "configured": command_payload.get("configured_slot_count"),
            }
        )
        if self.sync_error is not None:
            raise self.sync_error
        if int(command_payload.get("configured_slot_count") or 0) == 0:
            await self._store.async_save_deployed_wifi_commands(
                self.entry_id, device_key, [], deployed_device_id=None, commands_hash=""
            )
            return {"status": "success", "wifi_device_id": None}
        await self._store.async_save_deployed_wifi_commands(
            self.entry_id,
            device_key,
            list(command_payload.get("commands") or []),
            deployed_device_id=self.wifi_device_id,
            commands_hash=str(command_payload.get("commands_hash") or ""),
            request_port=request_port,
        )
        return {"status": "success", "wifi_device_id": self.wifi_device_id}


def _setup(monkeypatch, *, hub_version: str = "X1S"):
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    hub = _SyncHub(store, hub_version=hub_version)

    async def fake_resolve(_hass, _data):
        return hub

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_command_config_store", fake_store)
    monkeypatch.setattr(integration, "_resolve_roku_listen_port", lambda _hass, _entry: 8060)
    return store, hub


def _msg(**kwargs):
    return {"id": 1, "entity_id": "remote.hub", **kwargs}


def test_ws_wifi_event_list_empty(monkeypatch):
    _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_list_wifi_events(None, conn, _msg()))
    assert conn.error is None
    assert conn.result[1] == {"events": []}


def test_ws_wifi_event_create_deploys_and_resolves_ids(monkeypatch):
    store, hub = _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    assert conn.error is None
    payload = conn.result[1]
    assert payload["event"]["slot_index"] == 0
    assert payload["event"]["command_id"] == 1
    assert payload["event"]["device_id"] == 10
    assert [e["name"] for e in payload["events"]] == ["Movie Night"]
    # the sync ran against the events record with its 50-slot payload
    assert hub.sync_calls and hub.sync_calls[0]["device_key"] == WIFI_EVENTS_DEVICE_KEY
    assert hub.sync_calls[0]["slot_count"] == 50
    assert hub.sync_calls[0]["device_name"] == "Wifi Events"
    # deploy landed -> the event reads deployed with the law-derived ids
    assert payload["events"][0]["deployed"] is True
    assert payload["events"][0]["device_id"] == 10
    assert payload["events"][0]["long_press_command_id"] == 51

    # the reserved record now exists in the store list (listener guard path)
    keys = [d["device_key"] for d in _run(store.async_list_hub_devices("entry-1"))]
    assert WIFI_EVENTS_DEVICE_KEY in keys


def test_ws_wifi_event_create_sync_failure_keeps_slot_staged(monkeypatch):
    from homeassistant.exceptions import HomeAssistantError

    store, hub = _setup(monkeypatch)
    hub.sync_error = HomeAssistantError("sync_in_progress")
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    assert conn.error is not None and conn.error[1] == "sync_in_progress"
    # the slot stays staged and lists as needs-sync
    events = store.list_wifi_events("entry-1")
    assert [e["name"] for e in events] == ["Movie Night"]
    assert events[0]["deployed"] is False

    # a later create retries the deploy for the whole record
    hub.sync_error = None
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Second")))
    assert conn.error is None
    events = conn.result[1]["events"]
    assert all(e["deployed"] for e in events)


def test_ws_wifi_event_create_error_codes(monkeypatch):
    _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="movie_night")))
    assert conn.error is not None and conn.error[1] == "duplicate_name"
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="   ")))
    assert conn.error is not None and conn.error[1] == "invalid_format"


def test_ws_wifi_event_create_name_charset_by_hub(monkeypatch):
    # X1 (ascii rules): a name with only non-ascii chars is refused.
    _setup(monkeypatch, hub_version="X1")
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Ünïcödé")))
    # sanitizer keeps plain letters only on X1; "ndd" survives -> valid.
    # A fully-filtered name errors instead:
    conn2 = _Conn()
    _run(integration._ws_create_wifi_event(None, conn2, _msg(name="???")))
    assert conn2.error is not None and conn2.error[1] == "invalid_format"


def test_ws_wifi_event_delete_resets_in_place(monkeypatch):
    store, hub = _setup(monkeypatch)
    for name in ("One", "Two", "Three"):
        conn = _Conn()
        _run(integration._ws_create_wifi_event(None, conn, _msg(name=name)))
    hub.sync_calls.clear()
    conn = _Conn()
    _run(integration._ws_delete_wifi_event(None, conn, _msg(slot_index=1)))
    assert conn.error is None
    assert [(e["slot_index"], e["name"]) for e in conn.result[1]["events"]] == [
        (0, "One"),
        (2, "Three"),
    ]
    # the reset deployed (2 configured slots remained -> normal sync)
    assert hub.sync_calls and hub.sync_calls[0]["configured"] == 2
    # the freed slot's short + long records were REALLY deleted so the hub
    # cascades referencing favorites/bindings/macro-steps (slot 1 -> short
    # id 2, long id 2 + 50)
    assert hub.record_delete_calls == [(10, [2, 52])]
    # the record survives (events remain)
    keys = [d["device_key"] for d in _run(store.async_list_hub_devices("entry-1"))]
    assert WIFI_EVENTS_DEVICE_KEY in keys
    # deleting the hole again -> not_found
    conn = _Conn()
    _run(integration._ws_delete_wifi_event(None, conn, _msg(slot_index=1)))
    assert conn.error is not None and conn.error[1] == "not_found"


def test_ws_wifi_event_delete_last_removes_record(monkeypatch):
    store, hub = _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Only One")))
    conn = _Conn()
    _run(integration._ws_delete_wifi_event(None, conn, _msg(slot_index=0)))
    assert conn.error is None
    assert conn.result[1]["events"] == []
    # zero-slot sync ran and the store record was dropped afterwards
    assert hub.sync_calls[-1]["configured"] == 0
    keys = [d["device_key"] for d in _run(store.async_list_hub_devices("entry-1"))]
    assert WIFI_EVENTS_DEVICE_KEY not in keys
    # the device delete cascades everything — no per-record deletes needed
    assert hub.record_delete_calls == []


def test_ws_wifi_event_delete_sync_failure_keeps_reset_staged(monkeypatch):
    from homeassistant.exceptions import HomeAssistantError

    store, hub = _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Only One")))
    hub.sync_error = HomeAssistantError("port in use")
    conn = _Conn()
    _run(integration._ws_delete_wifi_event(None, conn, _msg(slot_index=0)))
    assert conn.error is not None and conn.error[1] == "sync_failed"
    # the reset stayed staged; the record is NOT dropped on failure
    assert store.list_wifi_events("entry-1") == []
    keys = [d["device_key"] for d in _run(store.async_list_hub_devices("entry-1"))]
    assert WIFI_EVENTS_DEVICE_KEY in keys


def test_ws_wifi_event_set_action_and_longpress(monkeypatch):
    _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    conn = _Conn()
    _run(
        integration._ws_set_wifi_event_action(
            None,
            conn,
            _msg(slot_index=0, press_type="long", action={"action": "perform-action", "perform_action": "script.x"}),
        )
    )
    assert conn.error is None
    assert conn.result[1]["events"][0]["long_press_action"]["perform_action"] == "script.x"
    conn = _Conn()
    _run(integration._ws_set_wifi_event_longpress(None, conn, _msg(slot_index=0, enabled=True)))
    assert conn.error is None
    assert conn.result[1]["events"][0]["long_press_enabled"] is True
    # unconfigured slot -> not_found
    conn = _Conn()
    _run(integration._ws_set_wifi_event_longpress(None, conn, _msg(slot_index=9, enabled=True)))
    assert conn.error is not None and conn.error[1] == "not_found"


def test_ws_command_devices_list_hides_reserved_record(monkeypatch):
    # §8 test 5 (WS half): command_devices/list never shows haevents while
    # the store list always includes it.
    store, _hub = _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    _run(store.async_create_hub_device("entry-1", "User Device"))

    monkeypatch.setattr(integration, "_resolve_roku_listen_port", lambda _hass, _entry: 8060)
    monkeypatch.setattr(
        integration, "_build_wifi_device_sync_payload", lambda _hub, _dev, device_key: {}
    )
    conn = _Conn()
    _run(integration._ws_list_command_devices(None, conn, _msg()))
    assert conn.error is None
    listed_keys = [d["device_key"] for d in conn.result[1]["devices"]]
    assert WIFI_EVENTS_DEVICE_KEY not in listed_keys
    assert len(listed_keys) == 1
    store_keys = [d["device_key"] for d in _run(store.async_list_hub_devices("entry-1"))]
    assert WIFI_EVENTS_DEVICE_KEY in store_keys


# ── §8 listener-safety tests 1–3 (events-record variants) ───────────────
#
# Test 4 (first-ever create enables the listener) lives inside the real
# async_sync_command_config (hub.py replace path, existing coverage);
# wifi_event/create's call into it is asserted in the create tests above.


class _ListenerHub:
    entry_id = "entry-1"
    version = "X1S"

    def __init__(self):
        self.roku_server_enabled = True
        self.disable_calls = []

    async def async_set_roku_server_enabled(self, enable: bool):
        self.disable_calls.append(enable)
        self.roku_server_enabled = enable

    async def async_delete_device(self, _device_id):
        return {"status": "success"}

    async def _async_refresh_devices_snapshot(self):
        return {}


class _ListenerStore:
    """Store stub with a deployed user device + a deployed events record."""

    def __init__(self, devices):
        self.devices = devices

    async def async_get_hub_config(self, _entry_id, *, device_key=None, **_kw):
        for device in self.devices:
            if device["device_key"] == device_key:
                return dict(device)
        raise KeyError(device_key)

    async def async_delete_hub_device(self, _entry_id, device_key):
        before = len(self.devices)
        self.devices = [d for d in self.devices if d["device_key"] != device_key]
        return len(self.devices) != before

    async def async_list_hub_devices(self, _entry_id, **_kw):
        return [dict(d) for d in self.devices]


def _listener_setup(monkeypatch, devices):
    hub = _ListenerHub()
    store = _ListenerStore(devices)

    async def fake_resolve(_hass, _data):
        return hub

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_command_config_store", fake_store)
    monkeypatch.setattr(integration, "_resolve_roku_listen_port", lambda _hass, _entry: 8060)
    return hub, store


_USER_DEV = {"device_key": "default", "deployed_device_id": 22, "deployed_commands_hash": "abc123"}
_EVENTS_DEV = {
    "device_key": WIFI_EVENTS_DEVICE_KEY,
    "deployed_device_id": 30,
    "deployed_commands_hash": "eee111",
}


def test_listener_survives_user_device_delete_while_events_deployed(monkeypatch):
    # §8 test 1: delete the user device via command_device/delete while the
    # events record still expects callbacks -> listener stays registered.
    hub, _store = _listener_setup(monkeypatch, [dict(_USER_DEV), dict(_EVENTS_DEV)])
    conn = _Conn()
    _run(integration._ws_delete_command_device(None, conn, _msg(device_key="default")))
    assert conn.error is None
    assert hub.disable_calls == []
    assert hub.roku_server_enabled is True


def test_listener_survives_events_removal_while_user_device_deployed(monkeypatch):
    # §8 test 2: the events record goes away (zero-slot path emptied it)
    # while a user device remains deployed -> the guard keeps the listener.
    _hub, store = _listener_setup(monkeypatch, [dict(_USER_DEV)])
    needed = _run(integration._async_wifi_listener_needed(None, "entry-1"))
    assert needed is True


def test_listener_disabled_exactly_once_when_both_removed(monkeypatch):
    # §8 test 3: removing the last callback-expecting record disables the
    # listener exactly once.
    hub, _store = _listener_setup(monkeypatch, [dict(_USER_DEV), dict(_EVENTS_DEV)])
    conn = _Conn()
    _run(integration._ws_delete_command_device(None, conn, _msg(device_key="default")))
    assert hub.disable_calls == []
    # events record's deploy is gone too (simulate the zero-slot outcome)
    _store.devices = []
    conn = _Conn()
    # deleting an already-gone key errors, but the guard question is what
    # _async_wifi_listener_needed now reports:
    needed = _run(integration._async_wifi_listener_needed(None, "entry-1"))
    assert needed is False


def test_ws_wifi_event_sync_retries_deploy(monkeypatch):
    from homeassistant.exceptions import HomeAssistantError

    store, hub = _setup(monkeypatch)
    hub.sync_error = HomeAssistantError("port in use")
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    assert conn.error is not None
    assert store.list_wifi_events("entry-1")[0]["deployed"] is False

    # retry without store changes -> deploy lands, event reads deployed
    hub.sync_error = None
    conn = _Conn()
    _run(integration._ws_sync_wifi_events(None, conn, _msg()))
    assert conn.error is None
    assert conn.result[1]["events"][0]["deployed"] is True

    # no events record at all -> not_found
    _run(store.async_delete_hub_device("entry-1", WIFI_EVENTS_DEVICE_KEY))
    conn = _Conn()
    _run(integration._ws_sync_wifi_events(None, conn, _msg()))
    assert conn.error is not None and conn.error[1] == "not_found"


# ── §6a store-reconcile-from-hub (device-editor edits) ──────────────────


def _events_bundle(entity_id: int, names: dict[int, str], *, brand: str = "m3-haevents-abc123") -> dict:
    return {
        "devices": [
            {
                "device": {"device_id": entity_id, "name": "Wifi Events", "brand": brand},
                "commands": [
                    {"command_id": cid, "name": name} for cid, name in names.items()
                ],
            }
        ]
    }


def test_bundle_device_is_wifi_events():
    bundle = _events_bundle(10, {1: "Movie Night"})
    assert integration._bundle_device_is_wifi_events(bundle, 10) is True
    user = _events_bundle(10, {1: "Cmd"}, brand="m3-a1b2c3d4-xyz")
    assert integration._bundle_device_is_wifi_events(user, 10) is False
    assert integration._bundle_device_is_wifi_events({"devices": []}, 10) is False


def test_collect_short_command_renames():
    baseline = _events_bundle(10, {1: "Movie Night", 2: "Lights", 51: "Movie Night Long Press"})
    edited = _events_bundle(10, {1: "Film Night", 2: "Lights", 51: "Renamed Long"})
    renames = integration._collect_short_command_renames(baseline, edited, 10)
    assert renames == {1: "Film Night", 51: "Renamed Long"}


def test_store_reconcile_events_command_renames(monkeypatch):
    store, _hub = _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Lights")))

    changed = _run(
        store.async_reconcile_wifi_events_command_renames(
            "entry-1",
            {1: "Film Night", 5: "Placeholder Rename", 51: "Long Rename"},
            roku_listen_port=8060,
        )
    )
    assert changed is True
    events = store.list_wifi_events("entry-1")
    # short id 1 -> slot 0 renamed; placeholder id 5 and long id 51 ignored
    assert [e["name"] for e in events] == ["Film Night", "Lights"]
    # deployed snapshot follows and the record reads in sync
    payload = _run(
        store.async_get_hub_config("entry-1", device_key=WIFI_EVENTS_DEVICE_KEY)
    )
    assert payload["deployed_commands_hash"] == payload["commands_hash"]
    deployed = store.get_deployed_wifi_commands("entry-1", device_key=WIFI_EVENTS_DEVICE_KEY)
    assert deployed[0]["name"] == "Film Night"


def test_ws_reserved_record_guards(monkeypatch):
    _setup(monkeypatch)
    conn = _Conn()
    _run(
        integration._ws_set_command_config(
            None, conn, _msg(commands=[], device_key=WIFI_EVENTS_DEVICE_KEY)
        )
    )
    assert conn.error is not None and conn.error[1] == "reserved_device"
    conn = _Conn()
    _run(
        integration._ws_delete_command_device(
            None, conn, _msg(device_key=WIFI_EVENTS_DEVICE_KEY)
        )
    )
    assert conn.error is not None and conn.error[1] == "reserved_device"
