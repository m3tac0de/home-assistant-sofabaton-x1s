"""The "Sofabaton X" sidebar panel follows the global sidebar_panel setting."""

from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

from homeassistant.components import frontend as frontend_module

from custom_components.sofabaton_x1s import runtime as runtime_module
from custom_components.sofabaton_x1s import sidebar_panel
from custom_components.sofabaton_x1s import frontend_resources as frontend_resources_module
from custom_components.sofabaton_x1s.ui_settings_store import UiSettingsStore

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


class _UiSettings:
    def __init__(self, enabled=False):
        self.sidebar_panel_enabled = enabled
        self.hub_click_action = "none"

    async def async_set_sidebar_panel_enabled(self, enabled):
        self.sidebar_panel_enabled = bool(enabled)


def _patch_frontend(monkeypatch):
    registered: list[dict] = []
    removed: list[tuple] = []

    def fake_register(hass, component_name, **kwargs):
        registered.append({"component_name": component_name, **kwargs})

    def fake_remove(hass, url_path, **kwargs):
        removed.append((url_path, kwargs))

    monkeypatch.setattr(frontend_module, "async_register_built_in_panel", fake_register, raising=False)
    monkeypatch.setattr(frontend_module, "async_remove_panel", fake_remove, raising=False)
    monkeypatch.setattr(
        frontend_resources_module,
        "_async_get_integration_version",
        lambda _hass: asyncio.sleep(0, result="0.6.9"),
    )
    return registered, removed


def _patch_ui_settings(monkeypatch, store):
    async def fake_ui_settings(_hass):
        return store

    monkeypatch.setattr(runtime_module, "_async_get_ui_settings_store", fake_ui_settings)


def test_ui_settings_store_persists_sidebar_panel_flag():
    hass = SimpleNamespace(data={})
    store = UiSettingsStore(hass)

    async def scenario():
        await store.async_load()
        assert store.sidebar_panel_enabled is False
        await store.async_set_sidebar_panel_enabled(True)
        assert store.sidebar_panel_enabled is True
        # A fresh store over the same backing data reads the flag back.
        reloaded = UiSettingsStore(hass)
        reloaded._store = store._store
        await reloaded.async_load()
        assert reloaded.sidebar_panel_enabled is True

    asyncio.run(scenario())


def test_ui_settings_store_ignores_non_boolean_sidebar_panel():
    store = UiSettingsStore(SimpleNamespace(data={}))
    store._store._data = {"hub_click_action": "send", "sidebar_panel": "yes"}
    asyncio.run(store.async_load())
    assert store.hub_click_action == "send"
    assert store.sidebar_panel_enabled is False


def test_sync_registers_custom_panel_when_enabled(monkeypatch):
    registered, removed = _patch_frontend(monkeypatch)
    _patch_ui_settings(monkeypatch, _UiSettings(enabled=True))
    hass = SimpleNamespace(data={})

    assert asyncio.run(sidebar_panel.async_sync_sidebar_panel(hass)) is True

    assert removed == []
    assert len(registered) == 1
    panel = registered[0]
    assert panel["component_name"] == "custom"
    assert panel["sidebar_title"] == "Sofabaton X"
    assert panel["frontend_url_path"] == "sofabaton-x"
    assert panel["require_admin"] is False
    assert panel["update"] is True
    # The module is the card bundle at its versioned URL: the browser fetches
    # it once for the card and the panel, and the card's version check passes.
    assert panel["config"] == {
        "_panel_custom": {
            "name": "sofabaton-x-panel",
            "embed_iframe": False,
            "trust_external": False,
            "module_url": "/sofabaton_x1s/www/tools-card.js?v=0.6.9",
        }
    }
    assert sidebar_panel.sidebar_panel_registered(hass) is True


def test_sync_removes_panel_when_disabled_after_registration(monkeypatch):
    registered, removed = _patch_frontend(monkeypatch)
    ui_settings = _UiSettings(enabled=True)
    _patch_ui_settings(monkeypatch, ui_settings)
    hass = SimpleNamespace(data={})

    asyncio.run(sidebar_panel.async_sync_sidebar_panel(hass))
    ui_settings.sidebar_panel_enabled = False
    assert asyncio.run(sidebar_panel.async_sync_sidebar_panel(hass)) is False

    assert removed == [("sofabaton-x", {"warn_if_unknown": False})]
    assert sidebar_panel.sidebar_panel_registered(hass) is False


def test_remove_is_a_no_op_when_never_registered(monkeypatch):
    registered, removed = _patch_frontend(monkeypatch)
    _patch_ui_settings(monkeypatch, _UiSettings(enabled=False))
    hass = SimpleNamespace(data={})

    assert asyncio.run(sidebar_panel.async_sync_sidebar_panel(hass)) is False
    sidebar_panel.async_remove_sidebar_panel(hass)

    assert registered == []
    assert removed == []


def test_ws_set_setting_sidebar_panel_persists_and_syncs(monkeypatch):
    registered, removed = _patch_frontend(monkeypatch)
    ui_settings = _UiSettings(enabled=False)
    _patch_ui_settings(monkeypatch, ui_settings)
    hass = SimpleNamespace(data={})
    conn = _Conn()

    asyncio.run(
        integration._ws_control_panel_set_setting(
            hass,
            conn,
            {"id": 7, "entry_id": "entry-1", "setting": "sidebar_panel", "enabled": True},
        )
    )

    assert conn.error is None
    assert conn.result == (7, {"ok": True, "enabled": True})
    assert ui_settings.sidebar_panel_enabled is True
    assert len(registered) == 1

    conn = _Conn()
    asyncio.run(
        integration._ws_control_panel_set_setting(
            hass,
            conn,
            {"id": 8, "entry_id": "entry-1", "setting": "sidebar_panel", "enabled": False},
        )
    )
    assert conn.result == (8, {"ok": True, "enabled": False})
    assert ui_settings.sidebar_panel_enabled is False
    assert [path for path, _ in removed] == ["sofabaton-x"]


def test_ws_set_setting_sidebar_panel_requires_enabled(monkeypatch):
    _patch_frontend(monkeypatch)
    _patch_ui_settings(monkeypatch, _UiSettings(enabled=False))
    conn = _Conn()

    asyncio.run(
        integration._ws_control_panel_set_setting(
            SimpleNamespace(data={}),
            conn,
            {"id": 9, "entry_id": "entry-1", "setting": "sidebar_panel"},
        )
    )

    assert conn.result is None
    assert conn.error == (9, "invalid_format", "sidebar_panel requires an enabled boolean")
