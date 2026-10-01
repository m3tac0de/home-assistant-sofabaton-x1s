"""The Settings tab hub rename: sofabaton_x1s/hub/rename."""

from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

import pytest

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
runtime_module = importlib.import_module("custom_components.sofabaton_x1s.runtime")


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


class _Hub:
    entry_id = "entry-1"

    def __init__(self, *, version="X1S", ok=True, echoed=None):
        self.version = version
        self.name = "Living Room"
        self._ok = ok
        self._echoed = echoed
        self.renamed_to = None

    async def async_set_hub_name(self, name, **_kwargs):
        self.renamed_to = name
        if self._ok:
            self.name = self._echoed or name
        return self._ok


def _patch(monkeypatch, hub):
    async def fake_resolve(_hass, _data):
        return hub

    monkeypatch.setattr(runtime_module, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(runtime_module, "_hub_is_busy", lambda _hass, _hub: False)

    async def no_persist(_hass, _hub):
        return None

    monkeypatch.setattr(runtime_module, "_async_persist_after_write", no_persist)


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_ws_hub_rename_writes_and_answers_the_stored_name(monkeypatch):
    conn = _Conn()
    hub = _Hub()
    _patch(monkeypatch, hub)

    _run(integration._ws_hub_rename(
        SimpleNamespace(data={integration.DOMAIN: {}}), conn,
        {"id": 1, "entry_id": "entry-1", "name": "  Den  "},
    ))

    assert conn.error is None
    assert hub.renamed_to == "Den"
    assert conn.result == (1, {"status": "success", "name": "Den"})


@pytest.mark.parametrize("name", ["", "   ", "x" * 31])
def test_ws_hub_rename_rejects_bad_lengths(monkeypatch, name):
    conn = _Conn()
    hub = _Hub()
    _patch(monkeypatch, hub)

    _run(integration._ws_hub_rename(
        SimpleNamespace(data={integration.DOMAIN: {}}), conn,
        {"id": 2, "entry_id": "entry-1", "name": name},
    ))

    assert conn.error[1] == "invalid_name"
    assert hub.renamed_to is None


@pytest.mark.parametrize(
    ("version", "name", "ok"),
    [
        ("X1", "Kitchen Hub", True),
        ("X1S", "Den (2) - #1 & 'ok' ~", True),  # any printable ASCII...
        ("X1S", "a\\b", False),                  # ...except the backslash
        ("X1S", "Küche", False),                  # the app's field refuses non-ASCII
        ("X1S", "Hub 日本", False),
        ("X1S", "Ｈｕｂ", False),                 # full-width forms included
        ("X2", "TV 💡", False),
        ("X1S", "Tab\there", False),              # control characters
    ],
)
def test_ws_hub_rename_refuses_names_outside_the_app_rule(monkeypatch, version, name, ok):
    conn = _Conn()
    hub = _Hub(version=version)
    _patch(monkeypatch, hub)

    _run(integration._ws_hub_rename(
        SimpleNamespace(data={integration.DOMAIN: {}}), conn,
        {"id": 3, "entry_id": "entry-1", "name": name},
    ))

    if ok:
        assert conn.error is None, conn.error
        assert hub.renamed_to == name
    else:
        assert conn.error[1] == "invalid_name"
        assert hub.renamed_to is None


def test_ws_hub_rename_reports_an_unconfirmed_write(monkeypatch):
    conn = _Conn()
    hub = _Hub(ok=False)
    _patch(monkeypatch, hub)

    _run(integration._ws_hub_rename(
        SimpleNamespace(data={integration.DOMAIN: {}}), conn,
        {"id": 4, "entry_id": "entry-1", "name": "Den"},
    ))

    assert conn.result is None
    assert conn.error == (4, "rename_failed", "The hub did not confirm the new name")


def test_ws_hub_rename_is_refused_while_the_hub_is_busy(monkeypatch):
    conn = _Conn()
    hub = _Hub()
    _patch(monkeypatch, hub)
    monkeypatch.setattr(runtime_module, "_hub_is_busy", lambda _hass, _hub: True)

    _run(integration._ws_hub_rename(
        SimpleNamespace(data={integration.DOMAIN: {}}), conn,
        {"id": 5, "entry_id": "entry-1", "name": "Den"},
    ))

    assert conn.error[1] == "busy"
    assert hub.renamed_to is None
