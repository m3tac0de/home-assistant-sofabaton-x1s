"""SofabatonHub lifecycle branches: settings changes, busy gate, proxy events."""

import asyncio
from unittest.mock import AsyncMock

from custom_components.sofabaton_x1s.hub import SofabatonHub

from tests.test_hub_commands import FakeHass


def _hub(loop):
    hass = FakeHass(loop)
    return SofabatonHub(hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False)


def test_a_host_change_keeps_the_engine_cache(monkeypatch):
    """CR-H1-3: the rebuilt engine starts from the old engine's cache, so the
    initial sync that follows cannot persist an empty export over it."""

    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        old_proxy = hub._proxy
        old_proxy.state.commands[0x0A] = {0x2A: "Power"}
        old_proxy.state.buttons[0x0A] = {0x97}
        started_with: list = []

        async def _start():
            started_with.append(dict(hub._proxy.state.commands))

        monkeypatch.setattr(hub, "async_stop", AsyncMock())
        monkeypatch.setattr(hub, "async_start", _start)
        monkeypatch.setattr(hub, "_async_initial_sync", AsyncMock())

        loop.run_until_complete(
            hub.async_apply_new_settings(host="127.0.0.2", port=1234, proxy_udp_port=9999, hub_listen_base=10000)
        )

        assert hub._proxy is not old_proxy
        assert started_with == [{0x0A: {0x2A: "Power"}}]
        assert 0x0A in hub._command_entities
        assert hub.host == "127.0.0.2"
    finally:
        loop.close()


def test_an_uncommitted_devices_burst_never_requests_the_catalog_again(monkeypatch):
    """CR-H1-2: with no complete catalog yet, the burst callback used to
    enqueue REQ_DEVICES after every failed read, polling the hub forever."""

    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        proxy = hub._proxy
        assert not proxy._devices_catalog_ready
        sent: list = []
        monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
        monkeypatch.setattr(proxy, "enqueue_cmd", lambda *args, **kwargs: sent.append(args))
        monkeypatch.setattr(proxy, "_last_devices_burst_committed", False, raising=False)

        hub._on_devices_burst("devices")
        loop.run_until_complete(asyncio.sleep(0))

        assert sent == []
        assert hub.devices_ready is False
    finally:
        loop.close()


def test_the_busy_gate_covers_a_wifi_sync_and_a_running_backup(monkeypatch):
    """CR-H1-7: the CALL_ME gate (is_long_running_task_active)."""

    import custom_components.sofabaton_x1s as integration

    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        running: dict = {"value": False}

        class _Registry:
            def has_running_for_entry(self, entry_id):
                return entry_id == "entry-id" and running["value"]

        monkeypatch.setattr(integration, "_backup_operation_registry", lambda _hass: _Registry())
        assert hub.is_long_running_task_active() is False

        running["value"] = True
        assert hub.is_long_running_task_active() is True
        running["value"] = False

        async def _with_sync_lock():
            async with hub._command_sync_lock:
                return hub.is_long_running_task_active()

        assert loop.run_until_complete(_with_sync_lock()) is True
        assert hub.is_long_running_task_active() is False
    finally:
        loop.close()


def test_a_client_disconnect_reprimes_the_current_activitys_buttons(monkeypatch):
    """CR-H1-7: the vendor app leaving re-primes what it may have changed."""

    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        primed: list = []

        async def _prime(act_id):
            primed.append(act_id)

        monkeypatch.setattr(hub, "_async_prime_buttons_for", _prime)
        loop.run_until_complete(asyncio.sleep(0))  # the listener's initial state report
        hub.current_activity = 0x65

        hub._on_client_state_change(True)
        loop.run_until_complete(asyncio.sleep(0))
        assert hub.client_connected is True and primed == []

        hub._on_client_state_change(False)
        loop.run_until_complete(asyncio.sleep(0.01))
        assert hub.client_connected is False and primed == [0x65]
    finally:
        loop.close()


def test_an_ota_announcement_pauses_reconnects_once_and_notifies(monkeypatch):
    """CR-H1-7: the hub's OTA push arms the transport pause and one notice."""

    import custom_components.sofabaton_x1s.hub as hub_module

    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        pauses: list = []
        notices: list = []
        monkeypatch.setattr(hub._proxy.transport, "pause_for_ota", lambda seconds: pauses.append(seconds))
        monkeypatch.setattr(
            hub_module.persistent_notification,
            "async_create",
            lambda _hass, message, *, title, notification_id: notices.append(notification_id),
        )

        hub._on_ota_update()
        hub._on_ota_update()
        loop.run_until_complete(asyncio.sleep(0))

        assert pauses == [hub._ota_pause_seconds]
        assert notices == ["sofabaton_x1s_ota_entry-id"]
        assert hub._ota_in_progress is True
    finally:
        loop.close()
