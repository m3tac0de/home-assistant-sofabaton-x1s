"""The "Sofabaton X" sidebar panel follows the global sidebar_panel mode."""

from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

import voluptuous as vol

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
    def __init__(self, mode="off"):
        self.sidebar_panel_mode = mode
        self.hub_click_action = "none"

    async def async_set_sidebar_panel_mode(self, mode):
        self.sidebar_panel_mode = mode


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


def test_ui_settings_store_persists_sidebar_panel_mode():
    hass = SimpleNamespace(data={})
    store = UiSettingsStore(hass)

    async def scenario():
        await store.async_load()
        assert store.sidebar_panel_mode == "off"
        await store.async_set_sidebar_panel_mode("admin")
        assert store.sidebar_panel_mode == "admin"
        # A fresh store over the same backing data reads the mode back.
        reloaded = UiSettingsStore(hass)
        reloaded._store = store._store
        await reloaded.async_load()
        assert reloaded.sidebar_panel_mode == "admin"

    asyncio.run(scenario())


def test_ui_settings_store_ignores_unknown_sidebar_panel_mode():
    store = UiSettingsStore(SimpleNamespace(data={}))
    # The pre-release boolean shape and junk both fall back to "off".
    store._store._data = {"hub_click_action": "send", "sidebar_panel": True}
    asyncio.run(store.async_load())
    assert store.hub_click_action == "send"
    assert store.sidebar_panel_mode == "off"

    try:
        asyncio.run(store.async_set_sidebar_panel_mode("everyone"))
    except ValueError:
        pass
    else:
        raise AssertionError("an unknown mode must be refused")


def test_sync_registers_custom_panel_for_all_users(monkeypatch):
    registered, removed = _patch_frontend(monkeypatch)
    _patch_ui_settings(monkeypatch, _UiSettings(mode="all"))
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


def test_sync_registers_admin_only_panel_and_reregisters_on_mode_change(monkeypatch):
    registered, removed = _patch_frontend(monkeypatch)
    ui_settings = _UiSettings(mode="admin")
    _patch_ui_settings(monkeypatch, ui_settings)
    hass = SimpleNamespace(data={})

    asyncio.run(sidebar_panel.async_sync_sidebar_panel(hass))
    assert registered[-1]["require_admin"] is True

    # Admins only -> all users is a live re-registration, not a remove.
    ui_settings.sidebar_panel_mode = "all"
    assert asyncio.run(sidebar_panel.async_sync_sidebar_panel(hass)) is True
    assert len(registered) == 2
    assert registered[-1]["require_admin"] is False
    assert removed == []


def test_sync_removes_panel_when_switched_off(monkeypatch):
    registered, removed = _patch_frontend(monkeypatch)
    ui_settings = _UiSettings(mode="all")
    _patch_ui_settings(monkeypatch, ui_settings)
    hass = SimpleNamespace(data={})

    asyncio.run(sidebar_panel.async_sync_sidebar_panel(hass))
    ui_settings.sidebar_panel_mode = "off"
    assert asyncio.run(sidebar_panel.async_sync_sidebar_panel(hass)) is False

    assert removed == [("sofabaton-x", {"warn_if_unknown": False})]
    assert sidebar_panel.sidebar_panel_registered(hass) is False


def test_remove_is_a_no_op_when_never_registered(monkeypatch):
    registered, removed = _patch_frontend(monkeypatch)
    _patch_ui_settings(monkeypatch, _UiSettings(mode="off"))
    hass = SimpleNamespace(data={})

    assert asyncio.run(sidebar_panel.async_sync_sidebar_panel(hass)) is False
    sidebar_panel.async_remove_sidebar_panel(hass)

    assert registered == []
    assert removed == []


def test_ws_set_setting_sidebar_panel_persists_and_syncs(monkeypatch):
    registered, removed = _patch_frontend(monkeypatch)
    ui_settings = _UiSettings(mode="off")
    _patch_ui_settings(monkeypatch, ui_settings)
    hass = SimpleNamespace(data={})
    conn = _Conn()

    asyncio.run(
        integration._ws_control_panel_set_setting(
            hass,
            conn,
            {"id": 7, "entry_id": "entry-1", "setting": "sidebar_panel", "value": "admin"},
        )
    )

    assert conn.error is None
    assert conn.result == (7, {"ok": True, "value": "admin"})
    assert ui_settings.sidebar_panel_mode == "admin"
    assert len(registered) == 1
    assert registered[0]["require_admin"] is True

    conn = _Conn()
    asyncio.run(
        integration._ws_control_panel_set_setting(
            hass,
            conn,
            {"id": 8, "entry_id": "entry-1", "setting": "sidebar_panel", "value": "off"},
        )
    )
    assert conn.result == (8, {"ok": True, "value": "off"})
    assert ui_settings.sidebar_panel_mode == "off"
    assert [path for path, _ in removed] == ["sofabaton-x"]


def test_ws_set_setting_sidebar_panel_requires_value(monkeypatch):
    _patch_frontend(monkeypatch)
    _patch_ui_settings(monkeypatch, _UiSettings(mode="off"))
    conn = _Conn()

    asyncio.run(
        integration._ws_control_panel_set_setting(
            SimpleNamespace(data={}),
            conn,
            {"id": 9, "entry_id": "entry-1", "setting": "sidebar_panel", "enabled": True},
        )
    )

    assert conn.result is None
    assert conn.error == (9, "invalid_format", "sidebar_panel requires a value")


def test_ws_set_setting_schema_accepts_both_dropdown_value_sets():
    schema = vol.Schema(integration._ws_control_panel_set_setting._ws_schema)
    for value in ("none", "send", "copy", "off", "all", "admin"):
        schema({"type": "sofabaton_x1s/control_panel/set_setting", "entry_id": "e", "setting": "sidebar_panel", "value": value})
