"""The control panel's Wifi Commands Sync over WS (command_sync/run).

A failed sync answers with a code and one concise sentence, so the panel
reports it in its dock; nothing reaches Home Assistant's error toast, and
the backend's English detail stays in the log.
"""

import importlib

from homeassistant.exceptions import HomeAssistantError

from tests.test_wifi_events_ws import _Conn, _msg, _run, _setup

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
runtime_module = importlib.import_module("custom_components.sofabaton_x1s.runtime")
wifi_deploy = importlib.import_module("custom_components.sofabaton_x1s.wifi_deploy")


def _device(store) -> str:
    payload = _run(store.async_create_hub_device("entry-1", "Living room", roku_listen_port=8060))
    return str(payload["device_key"])


def test_a_sync_that_lands_answers_with_the_deploy_result(monkeypatch):
    store, hub = _setup(monkeypatch)
    key = _device(store)
    conn = _Conn()
    _run(integration._ws_run_command_sync(None, conn, _msg(device_key=key)))
    assert conn.error is None
    assert conn.result[1]["status"] == "success"
    assert hub.sync_calls[0]["device_key"] == key
    assert hub.sync_calls[0]["request_port"] == 8060


def test_a_failed_sync_answers_with_its_code_and_a_concise_sentence(monkeypatch):
    store, hub = _setup(monkeypatch)
    key = _device(store)
    hub.sync_error = wifi_deploy.WifiSyncError(
        "activities_changed",
        'Failed Activity validation: Activity 101 was "TV" when this Wifi Device was configured but is now "Movie Night". ...',
    )
    conn = _Conn()
    _run(integration._ws_run_command_sync(None, conn, _msg(device_key=key)))
    assert conn.result is None
    _msg_id, code, message = conn.error
    assert code == "activities_changed"
    assert message == wifi_deploy.WIFI_SYNC_FAILURE_MESSAGES["activities_changed"]
    assert "Movie Night" not in message


def test_an_unexpected_failure_answers_sync_failed(monkeypatch):
    store, hub = _setup(monkeypatch)
    key = _device(store)
    for error in (HomeAssistantError("something odd"), RuntimeError("boom")):
        hub.sync_error = error
        conn = _Conn()
        _run(integration._ws_run_command_sync(None, conn, _msg(device_key=key)))
        assert conn.error[1] == "sync_failed"
        assert conn.error[2] == wifi_deploy.WIFI_SYNC_FAILURE_MESSAGES["sync_failed"]


def test_a_busy_hub_answers_busy_before_the_sync_runs(monkeypatch):
    store, hub = _setup(monkeypatch)
    key = _device(store)
    monkeypatch.setattr(runtime_module, "_hub_is_busy", lambda _hass, _hub: True)
    conn = _Conn()
    _run(integration._ws_run_command_sync(None, conn, _msg(device_key=key)))
    assert conn.error[1] == "busy"
    assert hub.sync_calls == []


def test_an_unknown_device_answers_not_found(monkeypatch):
    _setup(monkeypatch)
    conn = _Conn()
    _run(integration._ws_run_command_sync(None, conn, _msg(device_key="nope")))
    assert conn.error[1] == "not_found"


def test_every_failure_code_has_a_sentence():
    for code in wifi_deploy.WIFI_SYNC_FAILURE_MESSAGES:
        assert wifi_deploy.WifiSyncError(code, "detail").code == code
    assert wifi_deploy.WifiSyncError("not_a_code", "detail").code == "sync_failed"
    assert wifi_deploy.wifi_sync_failure(ValueError("x")) == (
        "sync_failed",
        wifi_deploy.WIFI_SYNC_FAILURE_MESSAGES["sync_failed"],
    )
