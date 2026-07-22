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


def _setup(monkeypatch, *, hub_version: str = "X1S"):
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    hub = SimpleNamespace(entry_id="entry-1", version=hub_version)

    async def fake_resolve(_hass, _data):
        return hub

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_command_config_store", fake_store)
    return store, hub


def _msg(**kwargs):
    return {"id": 1, "entity_id": "remote.hub", **kwargs}


def test_ws_wifi_event_list_empty(monkeypatch):
    _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_list_wifi_events(None, conn, _msg()))
    assert conn.error is None
    assert conn.result[1] == {"events": []}


def test_ws_wifi_event_create_and_list(monkeypatch):
    store, _hub = _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    assert conn.error is None
    payload = conn.result[1]
    assert payload["event"]["slot_index"] == 0
    assert payload["event"]["command_id"] == 1
    assert [e["name"] for e in payload["events"]] == ["Movie Night"]
    assert payload["events"][0]["deployed"] is False

    # the reserved record now exists in the store list (listener guard path)
    keys = [d["device_key"] for d in _run(store.async_list_hub_devices("entry-1"))]
    assert WIFI_EVENTS_DEVICE_KEY in keys


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
    _setup(monkeypatch)
    for name in ("One", "Two", "Three"):
        conn = _Conn()
        _run(integration._ws_create_wifi_event(None, conn, _msg(name=name)))
    conn = _Conn()
    _run(integration._ws_delete_wifi_event(None, conn, _msg(slot_index=1)))
    assert conn.error is None
    assert [(e["slot_index"], e["name"]) for e in conn.result[1]["events"]] == [
        (0, "One"),
        (2, "Three"),
    ]
    # deleting the hole again -> not_found
    conn = _Conn()
    _run(integration._ws_delete_wifi_event(None, conn, _msg(slot_index=1)))
    assert conn.error is not None and conn.error[1] == "not_found"


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
