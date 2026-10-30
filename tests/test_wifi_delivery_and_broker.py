"""The deploy's delivery test and the hub's MQTT broker link, Home Assistant
side, and what is left of the X2 "Direct" mode of the 0.7.2 test releases:
a device deployed that way reads as a pending transport switch, so its next
Sync replaces it (docs/internal/wifi-webhook-transport-plan.md)."""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

import custom_components.sofabaton_x1s.hub_mqtt_link as hub_mqtt_link
import custom_components.sofabaton_x1s.wifi_deploy as wifi_deploy_module
import custom_components.sofabaton_x1s.wifi_ingress as wifi_ingress_module
from custom_components.sofabaton_x1s.command_config import (
    CommandConfigStore,
    normalize_deployed_transport,
    normalize_wifi_transport,
    record_hash_listen_port,
    wifi_device_requires_listener,
    wifi_transport_switch_pending,
)
from custom_components.sofabaton_x1s.hub import SofabatonHub
from tests.hub_fakes import FakeHass

HA_ADDRESS = "192.168.2.50"
HUB_IP = "192.168.2.123"
LEGACY = "webhook"


def _run(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _store() -> CommandConfigStore:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    return store


# ── Transport rules and the legacy Direct value ──────────────────────────


def test_a_legacy_direct_device_reads_as_a_pending_switch() -> None:
    # Anywhere a transport is chosen or requested, only http and mqtt exist.
    assert normalize_wifi_transport(LEGACY) == "http"
    assert normalize_wifi_transport("bogus") == "http"
    # The deployed side keeps the legacy value so the device asks for a Sync.
    assert normalize_deployed_transport(LEGACY) == LEGACY
    assert normalize_deployed_transport("mqtt") == "mqtt"
    assert normalize_deployed_transport(None) == "http"
    legacy = {"deployed_device_id": 9, "deployed_transport": LEGACY, "requested_transport": "http"}
    assert wifi_transport_switch_pending(legacy, mqtt_available=False)
    assert wifi_transport_switch_pending({**legacy, "requested_transport": "mqtt"}, mqtt_available=True)
    # After its Sync it calls the listener, so the listener stays up for it.
    assert wifi_device_requires_listener(legacy)
    # It hashes like a listener device, as it did when deployed.
    assert record_hash_listen_port(legacy, 8060) == 8060
    # A listener device is no switch at all.
    assert not wifi_transport_switch_pending({**legacy, "deployed_transport": "http"}, mqtt_available=True)


def _selector(version: str, *, mqtt: bool):
    fake = SimpleNamespace(version=version, wifi_mqtt_available=lambda: mqtt)
    return lambda payload: SofabatonHub._select_wifi_command_transport(fake, payload)


def test_direct_is_the_listener_and_a_legacy_device_is_replaced() -> None:
    x2 = _selector("X2", mqtt=True)
    x2_no_broker = _selector("X2", mqtt=False)
    fresh = {"deployed_device_id": None, "requested_transport": "http"}
    assert x2(fresh) == "http"
    assert _selector("X1S", mqtt=False)(fresh) == "http"
    assert x2({**fresh, "requested_transport": "mqtt"}) == "mqtt"
    assert x2_no_broker({**fresh, "requested_transport": "mqtt"}) == "http"
    # A legacy Direct device always moves: to what the user asked for, when it can.
    legacy = {"deployed_device_id": 9, "deployed_transport": LEGACY, "requested_transport": "http"}
    assert x2(legacy) == "http"
    assert x2({**legacy, "requested_transport": "mqtt"}) == "mqtt"
    assert x2_no_broker({**legacy, "requested_transport": "mqtt"}) == "http"
    # A listener device stays where it is.
    assert x2({**legacy, "deployed_transport": "http"}) == "http"


# ── Store ────────────────────────────────────────────────────────────────


def test_store_keeps_the_delivery_check_and_the_legacy_transport() -> None:
    store = _store()
    device = _run(store.async_create_hub_device("hub-1", "Lights"))
    key = device["device_key"]
    _run(
        store.async_save_deployed_wifi_commands(
            "hub-1", key, [{"name": "On"}], deployed_device_id=9, commands_hash="h",
            request_port=8060, deployed_transport="http",
        )
    )
    # A failed test lights the warning; a real press clears it, once.
    _run(store.async_set_delivery("hub-1", key, {"status": "not_delivered", "transport": "http"}))
    revision = store.revision
    assert _run(store.async_mark_delivered("hub-1", 9, transport="http", source_ip=HUB_IP))
    assert store.revision == revision + 1
    assert not _run(store.async_mark_delivered("hub-1", 9, transport="http", source_ip=HUB_IP))
    assert store.revision == revision + 1
    payload = _run(store.async_get_hub_config("hub-1", device_key=key))
    assert payload["delivery"]["status"] == "delivered" and payload["delivery"]["via"] == "press"
    assert "deployed_target" not in payload and "deployed_url" not in payload

    # A device a 0.7.2 test release deployed as Direct: the load-time
    # alignment leaves its request alone, so it reads as a pending switch.
    record = store._find_hub_device_record("hub-1", key)
    record["deployed_transport"] = LEGACY
    record["deployed_url"] = "https://192.168.2.50:8123/api/webhook/0123"
    assert not store._normalize_requested_transports()
    payload = _run(store.async_get_hub_config("hub-1", device_key=key))
    assert payload["deployed_transport"] == LEGACY
    assert payload["requested_transport"] == "http"
    assert wifi_transport_switch_pending(payload, mqtt_available=False)
    assert "0123" not in json.dumps(payload)

    # Back to undeployed: transport and delivery go with it.
    _run(store.async_save_deployed_wifi_commands("hub-1", key, [], deployed_device_id=None, commands_hash=""))
    payload = _run(store.async_get_hub_config("hub-1", device_key=key))
    assert payload["deployed_transport"] is None
    assert payload["delivery"] is None


# ── The test press on the ingresses ──────────────────────────────────────


class _IngressStore:
    def __init__(self):
        self.marked: list[tuple] = []

    def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
        return [{"name": "Lights On"}, {"name": "Lights Off"}] if hub_device_id == 9 else []

    def is_wifi_events_hub_device(self, entry_id, hub_device_id):
        return False

    async def async_mark_delivered(self, entry_id, hub_device_id, *, transport, source_ip=""):
        self.marked.append((hub_device_id, transport, source_ip))
        return True


def _ingress_hub(monkeypatch, loop, store):
    hass = FakeHass(loop)
    hub = SofabatonHub(hass, "entry-id", "hub-name", HUB_IP, 1234, {}, 9999, 10000, True, False, version="X2")
    monkeypatch.setattr(wifi_ingress_module, "async_get_command_config_store", lambda _hass: asyncio.sleep(0, result=store))
    actions: list[tuple] = []

    async def _run_action(**kwargs):
        actions.append((kwargs["command_index"], kwargs["press_type"]))

    monkeypatch.setattr(hub, "_async_maybe_run_live_wifi_slot_action", _run_action)
    return hub, actions


def test_a_test_press_is_claimed_and_runs_no_action(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _IngressStore()
    hub, actions = _ingress_hub(monkeypatch, loop, store)

    def post(press: str = "short"):
        loop.run_until_complete(
            hub.async_handle_roku_http_post(
                path=f"/launch/fc012c39d3d0/9/0/{press}", headers={}, body=b"", source_ip=HUB_IP
            )
        )

    future = loop.create_future()
    hub._wifi_probes[9] = future
    post()
    assert future.done() and future.result() == {"transport": "http", "source_ip": HUB_IP}
    hub._wifi_probes.clear()
    # The test press ran no Action, wrote no sensor record, marked nothing.
    assert actions == []
    assert hub.get_last_ip_command() is None
    assert store.marked == []
    # A repeat right after the test ended is still the test's...
    post()
    assert actions == []
    # ...a press after the window is a real one, and proves the path.
    hub._wifi_probe_tails[9] = 0.0
    post()
    assert actions == [(0, "short")]
    assert store.marked == [(9, "http", HUB_IP)]
    actions.clear()
    # Only slot 1 short is the test's: a long press goes through.
    hub._wifi_probes[9] = loop.create_future()
    post("long")
    assert not hub._wifi_probes[9].done()
    assert actions == [(0, "long")]
    loop.close()


# ── The delivery test ────────────────────────────────────────────────────


class _ProbeStore:
    def __init__(self):
        self.delivery: dict | None = None

    async def async_set_delivery(self, entry_id, device_key, delivery):
        self.delivery = delivery


def _probe_hub(monkeypatch, loop, store, *, arrives_from=None, sent=True):
    hass = FakeHass(loop)
    hub = SofabatonHub(hass, "entry-id", "hub-name", HUB_IP, 1234, {}, 9999, 10000, True, False, version="X2")
    monkeypatch.setattr(wifi_deploy_module, "async_get_command_config_store", lambda _hass: asyncio.sleep(0, result=store))
    pressed: list[tuple] = []

    def _send_command(ent_id, key_code):
        pressed.append((ent_id, key_code))
        if sent and arrives_from is not None:
            loop.call_soon(
                lambda: hub._claim_wifi_probe(ent_id, 0, "short", transport="http", source_ip=arrives_from)
            )
        return sent

    monkeypatch.setattr(hub._proxy, "send_command", _send_command)
    return hub, pressed


def test_probe_presses_slot_1_and_reports_delivery(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _ProbeStore()
    hub, pressed = _probe_hub(monkeypatch, loop, store, arrives_from=HUB_IP)
    delivery = loop.run_until_complete(
        hub.async_probe_wifi_delivery(
            device_key="lights", hub_device_id=9, transport="http", target=f"http://{HA_ADDRESS}:8060"
        )
    )
    assert pressed == [(9, 1)]
    assert delivery["status"] == "delivered"
    assert delivery["hub_ip"] == HUB_IP and delivery["source_ip"] == HUB_IP
    assert delivery["target"] == f"http://{HA_ADDRESS}:8060"
    assert isinstance(delivery["latency_s"], float)
    assert store.delivery == delivery
    assert hub._wifi_probes == {}
    loop.close()


def test_probe_that_never_arrives_is_reported_not_raised(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    store = _ProbeStore()
    hub, _pressed = _probe_hub(monkeypatch, loop, store, arrives_from=None)
    delivery = loop.run_until_complete(
        hub.async_probe_wifi_delivery(device_key="lights", hub_device_id=9, transport="http", timeout=0.05)
    )
    assert delivery["status"] == "not_delivered" and delivery["latency_s"] is None
    assert hub._wifi_probes == {}

    hub, _pressed = _probe_hub(monkeypatch, loop, store, sent=False)
    delivery = loop.run_until_complete(
        hub.async_probe_wifi_delivery(device_key="lights", hub_device_id=9, transport="mqtt", timeout=0.05)
    )
    assert delivery["status"] == "not_sent"
    loop.close()


# ── A deploy ─────────────────────────────────────────────────────────────


class _DeployStore:
    def __init__(self, payload=None):
        self.saved: list[dict] = []
        self.delivery: dict | None = None
        self.payload = payload or {}

    def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
        return [{"name": "Command 1"}]

    async def async_list_hub_devices(self, entry_id, **_kwargs):
        return []

    async def async_get_hub_config(self, entry_id, *, device_key=None, **_kwargs):
        return dict(self.payload)

    async def async_set_delivery(self, entry_id, device_key, delivery):
        self.delivery = delivery

    async def async_save_deployed_wifi_commands(self, entry_id, device_key, commands, **kwargs):
        self.saved.append({"device_key": device_key, **kwargs})


class _Listener:
    def get_last_start_error(self):
        return None


def _deploy_hub(monkeypatch, loop, store, calls, *, version="X2"):
    import custom_components.sofabaton_x1s.roku_listener as roku_listener_module

    hass = FakeHass(loop)
    hub = SofabatonHub(hass, "entry-id", "hub-name", HUB_IP, 1234, {}, 9999, 10000, True, False, version=version)
    hub.roku_server_enabled = False
    hub.activities = {}
    monkeypatch.setattr(wifi_deploy_module, "async_get_command_config_store", lambda _hass: asyncio.sleep(0, result=store))
    monkeypatch.setattr(hub, "local_address_in_use", lambda: HA_ADDRESS)
    monkeypatch.setattr(
        roku_listener_module, "async_get_roku_listener", lambda _hass: asyncio.sleep(0, result=_Listener())
    )
    monkeypatch.setattr(
        wifi_deploy_module.WifiDeployMixin, "_async_wifi_listener_needed",
        lambda self: asyncio.sleep(0, result=True), raising=False,
    )

    async def _snapshot(*_a, **_k):
        return {}

    async def _create(**kwargs):
        calls.append("create")
        return {"device_id": 9, "status": "success"}

    def _send_command(ent_id, key_code):
        calls.append("probe")
        loop.call_soon(lambda: hub._claim_wifi_probe(ent_id, 0, "short", transport="http", source_ip=HUB_IP))
        return True

    remote_syncs: list[dict] = []

    async def _sync_after(**kwargs):
        calls.append("sync")
        remote_syncs.append(kwargs)
        return True

    async def _noop(*_a, **_k):
        return None

    async def _enable_listener(enable):
        calls.append(f"listener:{enable}")

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _snapshot)
    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub._proxy, "send_command", _send_command)
    monkeypatch.setattr(hub._proxy, "backup_device", lambda *_a, **_k: None)
    monkeypatch.setattr(hub, "async_sync_remotes_after_write", _sync_after)
    hub._remote_syncs = remote_syncs
    monkeypatch.setattr(hub, "async_fetch_device_commands", _noop)
    monkeypatch.setattr(hub, "_async_persist_cache_if_enabled", _noop)
    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _enable_listener)
    return hub


def _payload(**extra):
    return {
        "commands": [{"name": "Command 1", "add_as_favorite": False, "hard_button": "", "activities": [], "action": {}}],
        "commands_hash": "abc",
        **extra,
    }


@pytest.mark.parametrize("version", ["X2", "X1S"])
def test_a_direct_deploy_uses_the_listener_tests_delivery_then_syncs_the_remote(monkeypatch, version) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    calls: list[str] = []
    store = _DeployStore()
    hub = _deploy_hub(monkeypatch, loop, store, calls, version=version)
    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=_payload(requested_transport="http"), request_port=8060)
    )
    # The test press before the remote sync; the create's sync covers the new device.
    assert calls == ["listener:True", "create", "probe", "sync"]
    assert hub._remote_syncs[0]["created"] == (9,)
    saved = store.saved[-1]
    assert saved["deployed_transport"] == "http" and saved["request_port"] == 8060
    assert "deployed_url" not in saved
    assert result["delivery"]["status"] == "delivered"
    assert result["delivery"]["target"] == f"http://{HA_ADDRESS}:8060"
    assert hub.get_command_sync_progress("default")["delivery"]["status"] == "delivered"
    loop.close()


def test_a_legacy_direct_device_is_replaced_not_synced_in_place(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    calls: list[str] = []
    store = _DeployStore()
    hub = _deploy_hub(monkeypatch, loop, store, calls)

    async def _snapshot(*_a, **_k):
        return {11: {"brand": "m3-default-abc", "name": "Home Assistant"}}

    async def _inplace(**_kwargs):
        calls.append("inplace")
        return {"status": "success", "inplace": True}

    class _Stop(Exception):
        pass

    async def _replace(run):
        calls.append(f"replace:{run.transport_switch_from}->{run.selected_transport}")
        raise _Stop

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _snapshot)
    monkeypatch.setattr(hub, "_async_try_inplace_command_sync", _inplace)
    monkeypatch.setattr(hub, "_deploy_replace_create_and_verify", _replace)
    payload = _payload(
        deployed_commands_hash="abc", deployed_device_id=11, deployed_request_port=None,
        deployed_transport=LEGACY, requested_transport="http",
    )
    with pytest.raises(_Stop):
        loop.run_until_complete(hub.async_sync_command_config(command_payload=payload, request_port=8060))
    assert "inplace" not in calls
    assert calls[-1] == f"replace:{LEGACY}->http"
    assert hub.get_command_sync_progress("default")["transport_switch"] == "http"
    loop.close()


def test_testing_a_legacy_direct_device_asks_for_a_sync(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    calls: list[str] = []
    store = _DeployStore(payload={"device_key": "lights", "deployed_device_id": 11, "deployed_transport": LEGACY})
    hub = _deploy_hub(monkeypatch, loop, store, calls)
    with pytest.raises(wifi_deploy_module.WifiSyncError) as err:
        loop.run_until_complete(hub.async_test_wifi_delivery("lights"))
    assert err.value.code == "redeploy_needed"
    assert calls == []  # nothing was pressed
    loop.close()


# ── MQTT broker link ─────────────────────────────────────────────────────


def _mqtt_hass(loop, *, broker="core-mosquitto", port=1883):
    hass = FakeHass(loop)
    hass.config = SimpleNamespace(components={"mqtt"})
    entry = SimpleNamespace(data={"broker": broker, "port": port, "username": "ha", "password": "secret"})
    hass.config_entries.async_entries = lambda domain: [entry] if domain == "mqtt" else []
    return hass


def test_broker_link_state_maps_the_add_on_to_the_lan_address_and_hides_the_password() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = _mqtt_hass(loop)
    hub = SimpleNamespace(
        version="X2",
        local_address_in_use=lambda: HA_ADDRESS,
        _proxy=SimpleNamespace(query_hub_mqtt_status=lambda: False),
    )
    state = loop.run_until_complete(hub_mqtt_link.async_broker_link_state(hass, hub))
    assert state["suggested_host"] == HA_ADDRESS
    assert state["suggested_port"] == 1883
    assert state["ha_broker"] == {"host": "core-mosquitto", "port": 1883, "tls": False}
    assert state["hub_connected"] is False
    assert state["ha_username"] == "ha" and state["ha_login_available"]
    assert "secret" not in json.dumps(state)

    for host, expected in (("127.0.0.1", HA_ADDRESS), ("192.168.2.7", "192.168.2.7"), ("fe80::1", "")):
        assert loop.run_until_complete(hub_mqtt_link.async_hub_broker_address(hass, hub, host)) == expected
    # Not an X2: the hub is never asked.
    assert loop.run_until_complete(hub_mqtt_link.async_hub_mqtt_status(hass, SimpleNamespace(version="X1S"))) is None
    loop.close()


def test_pointing_the_hub_at_the_broker_sends_ha_login_by_default(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = _mqtt_hass(loop)
    sent: list[dict] = []

    def _set_broker(**kwargs):
        sent.append(kwargs)
        return {"connected": True}

    hub = SimpleNamespace(_proxy=SimpleNamespace(set_hub_mqtt_broker=_set_broker), _hub_mqtt_connected_at=None)
    monkeypatch.setattr(hub_mqtt_link, "HUB_MQTT_SETTLE_S", 0)
    connected = loop.run_until_complete(
        hub_mqtt_link.async_point_hub_at_broker(hass, hub, host=HA_ADDRESS, port=1883)
    )
    assert connected is True
    assert sent == [{"broker_ip": HA_ADDRESS, "broker_port": 1883, "username": "ha", "password": "secret"}]
    assert hub._hub_mqtt_connected_at is not None
    loop.run_until_complete(
        hub_mqtt_link.async_point_hub_at_broker(
            hass, hub, host=HA_ADDRESS, port=1883, use_ha_login=False, username="hub", password="pw"
        )
    )
    assert sent[-1]["username"] == "hub" and sent[-1]["password"] == "pw"
    loop.close()


def test_mqtt_deploy_refuses_when_the_hub_has_no_broker(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    calls: list[str] = []
    store = _DeployStore()
    hub = _deploy_hub(monkeypatch, loop, store, calls)
    hub.wifi_mqtt_available = lambda: True
    monkeypatch.setattr(hub_mqtt_link, "ha_mqtt_connected", lambda _hass: True)
    monkeypatch.setattr(hub._proxy, "query_hub_mqtt_status", lambda: False)
    with pytest.raises(wifi_deploy_module.WifiSyncError) as err:
        loop.run_until_complete(
            hub.async_sync_command_config(command_payload=_payload(requested_transport="mqtt"), request_port=8060)
        )
    assert err.value.code == "hub_mqtt_not_connected"
    # Nothing was written.
    assert calls == []
    assert hub.get_command_sync_progress("default")["error_code"] == "hub_mqtt_not_connected"
    loop.close()


# ── WS commands ──────────────────────────────────────────────────────────


def _ws_setup(monkeypatch, *, hub_version="X2"):
    from tests.test_wifi_events_ws import _setup

    store, hub = _setup(monkeypatch, hub_version=hub_version)
    hub.host = HUB_IP
    hub.roku_server_enabled = False
    hub.local_address_in_use = lambda: HA_ADDRESS
    key = str(_run(store.async_create_hub_device("entry-1", "Lights", roku_listen_port=8060))["device_key"])
    return store, hub, key


def test_ws_delivery_names_the_path_and_nothing_for_a_legacy_direct_device(monkeypatch) -> None:
    from tests.test_wifi_events_ws import _Conn, _msg

    store, _hub, key = _ws_setup(monkeypatch)
    _run(
        store.async_save_deployed_wifi_commands(
            "entry-1", key, [{"name": "On"}], deployed_device_id=9, commands_hash="h",
            request_port=8060, deployed_transport="http",
        )
    )
    _run(store.async_set_delivery("entry-1", key, {"status": "not_delivered", "transport": "http"}))
    hass = SimpleNamespace(async_add_executor_job=lambda fn, *args: asyncio.sleep(0, result=fn(*args)))
    conn = _Conn()
    _run(integration_module()._ws_get_wifi_delivery(hass, conn, _msg(device_key=key)))
    result = conn.result[1]
    assert result["transport"] == "http"
    assert result["target"] == f"http://{HA_ADDRESS}:8060"
    assert result["hub_ip"] == HUB_IP
    assert result["delivery"]["status"] == "not_delivered"
    assert not {"desired_target", "target_stale", "move_available", "webhook_available"} & set(result)

    store._find_hub_device_record("entry-1", key)["deployed_transport"] = LEGACY
    conn = _Conn()
    _run(integration_module()._ws_get_wifi_delivery(hass, conn, _msg(device_key=key)))
    assert conn.result[1]["transport"] is None and conn.result[1]["target"] == ""


@pytest.mark.parametrize("code", [
    "broker_invalid_host", "broker_invalid_port", "broker_username_too_long",
    "broker_password_too_long", "broker_credentials_too_long",
])
def test_ws_broker_validation_preserves_localizable_error_codes(monkeypatch, code) -> None:
    from tests.test_wifi_events_ws import _Conn, _msg
    from custom_components.sofabaton_x1s.lib.proxy_hub_mqtt import HubMqttValidationError

    _ws_setup(monkeypatch)

    async def refuse(*_args, **_kwargs):
        raise HubMqttValidationError(code, "Invalid broker settings")

    monkeypatch.setattr(hub_mqtt_link, "async_point_hub_at_broker", refuse)
    conn = _Conn()
    _run(integration_module()._ws_set_hub_mqtt_broker(None, conn, _msg(host=HA_ADDRESS, port=1883)))
    assert conn.error[1] == code


def test_ws_hub_broker_setup_is_x2_only_and_reports_bad_values(monkeypatch) -> None:
    from tests.test_wifi_events_ws import _Conn, _msg

    _ws_setup(monkeypatch, hub_version="X1S")
    conn = _Conn()
    _run(integration_module()._ws_set_hub_mqtt_broker(None, conn, _msg(host=HA_ADDRESS, port=1883)))
    assert conn.error[1] == "not_supported"

    _ws_setup(monkeypatch, hub_version="X2")

    async def _refuse(*_a, **_k):
        raise ValueError("the broker address must be an IPv4 address")

    monkeypatch.setattr(hub_mqtt_link, "async_point_hub_at_broker", _refuse)
    conn = _Conn()
    _run(integration_module()._ws_set_hub_mqtt_broker(None, conn, _msg(host="mqtt.lan", port=1883)))
    assert conn.error[1] == "invalid_format"


def integration_module():
    import importlib

    return importlib.import_module("custom_components.sofabaton_x1s.__init__")
