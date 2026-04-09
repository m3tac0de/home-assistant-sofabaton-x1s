import asyncio
from types import SimpleNamespace

import importlib

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None
        self.messages = []
        self.subscriptions = {}

    def send_result(self, msg_id, payload=None):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)

    def send_message(self, payload):
        self.messages.append(payload)


class _Hub:
    entry_id = "entry-1"


def test_ws_get_hub_logs_returns_lines(monkeypatch):
    conn = _Conn()
    hub = _Hub()
    entry = SimpleNamespace(entry_id="entry-1")

    async def fake_resolve(_hass, _data):
        return hub

    async def fake_get_logs(_hass, _entry, limit=250):
        assert _entry is entry
        assert limit == 25
        return [{"line": "2026-01-01 test", "level": "INFO", "logger": "x", "entry_id": "entry-1"}]

    hass = SimpleNamespace(
        config_entries=SimpleNamespace(async_get_entry=lambda entry_id: entry if entry_id == "entry-1" else None)
    )

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "async_get_hub_log_lines", fake_get_logs)

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_get_hub_logs(
                hass, conn, {"id": 11, "entry_id": "entry-1", "limit": 25}
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (
        11,
        {"lines": [{"line": "2026-01-01 test", "level": "INFO", "logger": "x", "entry_id": "entry-1"}]},
    )


def test_ws_subscribe_hub_logs_registers_subscription_and_forwards_events(monkeypatch):
    conn = _Conn()
    hub = _Hub()
    entry = SimpleNamespace(entry_id="entry-1")
    forwarded = {}

    async def fake_resolve(_hass, _data):
        return hub

    def fake_subscribe(_hass, _entry, callback_fn):
        assert _entry is entry
        forwarded["callback"] = callback_fn

        def _unsubscribe():
            forwarded["unsubscribed"] = True

        return _unsubscribe

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "async_subscribe_hub_log_lines", fake_subscribe)
    monkeypatch.setattr(
        integration.websocket_api,
        "event_message",
        lambda msg_id, payload: {"id": msg_id, "event": payload},
        raising=False,
    )

    hass = SimpleNamespace(
        config_entries=SimpleNamespace(async_get_entry=lambda entry_id: entry if entry_id == "entry-1" else None)
    )

    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_subscribe_hub_logs(
                hass, conn, {"id": 12, "entry_id": "entry-1"}
            )
        )
    finally:
        loop.close()

    assert conn.error is None
    assert conn.result == (12, None)
    assert 12 in conn.subscriptions

    forwarded["callback"](
        {"line": "2026-01-01 live", "level": "DEBUG", "logger": "x", "entry_id": "entry-1"}
    )

    assert conn.messages == [
        {
            "id": 12,
            "event": {
                "line": "2026-01-01 live",
                "level": "DEBUG",
                "logger": "x",
                "entry_id": "entry-1",
            },
        }
    ]
