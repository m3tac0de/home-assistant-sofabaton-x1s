"""Entity platforms: availability, signal subscriptions, shared DeviceInfo
(R5 batch 2.3, CR-H3-14)."""

import asyncio
from types import SimpleNamespace

import pytest
from homeassistant.exceptions import HomeAssistantError

import custom_components.sofabaton_x1s.button as button_platform
import custom_components.sofabaton_x1s.hub as hub_module
import custom_components.sofabaton_x1s.select as select_platform
import custom_components.sofabaton_x1s.sensor as sensor_platform
import custom_components.sofabaton_x1s.switch as switch_platform
import custom_components.sofabaton_x1s.text as text_platform
from custom_components.sofabaton_x1s.const import (
    CONF_MAC,
    DOMAIN,
    signal_client,
    signal_hub,
    signal_settings,
)
from custom_components.sofabaton_x1s.hub import SofabatonHub, hub_device_info
from custom_components.sofabaton_x1s.lib.protocol_const import ButtonName

from tests.hub_fakes import FakeHass

ENTRY = SimpleNamespace(entry_id="entry-id", data={CONF_MAC: "aa:bb:cc:dd:ee:ff", "mdns_txt": {"HVER": "2"}}, title="Hub")


def _hub(loop):
    hass = FakeHass(loop)
    hub = SofabatonHub(hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False)
    hass.data = {DOMAIN: {"entry-id": hub}}
    return hub


def _subscriptions(monkeypatch, module, entity, hass):
    signals: list[str] = []
    monkeypatch.setattr(
        module, "async_dispatcher_connect", lambda _hass, sig, _target: signals.append(sig) or (lambda: None)
    )
    entity.hass = hass
    asyncio.run(entity.async_added_to_hass())
    return signals


def test_control_entities_follow_the_hub_connection(monkeypatch):
    """CR-H3-7: an offline hub (or one the app holds) takes the controls
    down, and each control listens for the change."""
    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        select = select_platform.SofabatonActivitySelect(hub, ENTRY)
        hard = button_platform.SofabatonDynamicButton(hub, ENTRY, int(ButtonName.OK), "OK", "mdi:circle")
        hub.current_activity = 101
        monkeypatch.setattr(hub, "get_buttons_for_current", lambda: ([int(ButtonName.OK)], True))

        hub.hub_connected, hub.client_connected = True, False
        assert select.available and hard.available
        hub.hub_connected = False
        assert not select.available and not hard.available
        hub.hub_connected, hub.client_connected = True, True
        assert not select.available and not hard.available

        for entity, module in ((select, select_platform), (hard, button_platform)):
            signals = _subscriptions(monkeypatch, module, entity, hub.hass)
            assert signal_hub("entry-id") in signals and signal_client("entry-id") in signals

        activity = sensor_platform.SofabatonActivitySensor(hub, ENTRY)
        assert signal_hub("entry-id") in _subscriptions(monkeypatch, sensor_platform, activity, hub.hass)
    finally:
        loop.close()


def test_setting_switches_follow_toggles_made_elsewhere(monkeypatch):
    """CR-H3-6: the tools card flips proxy and hex logging through the hub;
    both switches listen for it and the hub announces it."""
    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        for cls in (switch_platform.SofabatonProxySwitch, switch_platform.SofabatonHexLoggingSwitch):
            signals = _subscriptions(monkeypatch, switch_platform, cls(hub, ENTRY), hub.hass)
            assert signals == [signal_settings("entry-id")]

        sent: list[str] = []
        monkeypatch.setattr(hub_module, "async_dispatcher_send", lambda _hass, sig, *a: sent.append(sig))
        monkeypatch.setattr(hub._proxy, "enable_proxy", lambda: None)
        monkeypatch.setattr(hub._proxy, "set_diag_dump", lambda _enable: None)
        monkeypatch.setattr(hub_module, "async_enable_hex_logging_capture", lambda *_a: None)
        loop.run_until_complete(hub.async_set_proxy_enabled(True))
        loop.run_until_complete(hub.async_set_hex_logging_enabled(True))
        assert sent.count(signal_settings("entry-id")) == 2
    finally:
        loop.close()


def test_the_resync_button_refuses_a_busy_hub(monkeypatch):
    """CR-X1-5: a remote-sync trigger mid-restore restarts the remote's
    rebuild; the entity path refuses like the card and the server."""
    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        hub.hub_connected, hub.client_connected = True, False
        resyncs: list = []

        async def _resync():
            resyncs.append(True)

        monkeypatch.setattr(hub, "async_resync_remote", _resync)
        entity = button_platform.SofabatonResyncRemoteButton(hub, ENTRY)

        async def main():
            await asyncio.sleep(0)  # the listeners' initial state reports
            hub.hub_connected, hub.client_connected = True, False
            async with hub.async_hub_work():
                with pytest.raises(HomeAssistantError):
                    await entity.async_press()
            await entity.async_press()

        loop.run_until_complete(main())
        assert resyncs == [True]
    finally:
        loop.close()


def test_every_platform_publishes_the_same_device_info(monkeypatch):
    """CR-H3-12: one DeviceInfo, so the registry model no longer flips with
    platform setup order."""
    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        expected = hub_device_info(hub, ENTRY)
        entities = [
            select_platform.SofabatonActivitySelect(hub, ENTRY),
            button_platform.SofabatonResyncRemoteButton(hub, ENTRY),
            sensor_platform.SofabatonActivitySensor(hub, ENTRY),
            switch_platform.SofabatonProxySwitch(hub, ENTRY),
            text_platform.SofabatonHubIpText(hub, ENTRY),
            text_platform.SofabatonLocalAddressText(hub, ENTRY),
        ]
        for entity in entities:
            assert entity.device_info == expected
        assert "via proxy" not in str(expected)
    finally:
        loop.close()


def test_the_ip_text_entity_leaves_the_host_change_to_the_update_listener(monkeypatch):
    """CR-H3-5: the entry update alone applies the host; a reload on top
    restarted the hub twice at once."""
    loop = asyncio.new_event_loop()
    try:
        hub = _hub(loop)
        updates: list = []
        reloads: list = []
        entry = SimpleNamespace(entry_id="entry-id", data={CONF_MAC: "aa:bb:cc:dd:ee:ff", "host": "127.0.0.1"})
        hub.hass.config_entries = SimpleNamespace(
            async_get_entry=lambda _id: entry,
            async_update_entry=lambda e, data: updates.append(data["host"]),
            async_reload=lambda _id: reloads.append(_id),
        )
        entity = text_platform.SofabatonHubIpText(hub, entry)
        entity.hass = hub.hass

        loop.run_until_complete(entity.async_set_value(" 192.168.2.99 "))
        assert updates == ["192.168.2.99"]
        assert reloads == []
        with pytest.raises(HomeAssistantError):
            loop.run_until_complete(entity.async_set_value("sofabaton.lan"))
    finally:
        loop.close()


def test_the_index_sensor_keeps_its_catalog_out_of_the_recorder():
    """CR-H3-13."""
    assert {"activities", "devices"} <= set(sensor_platform.SofabatonIndexSensor._unrecorded_attributes)


def _local_address_entity(monkeypatch, loop, *, os_ip="192.0.2.10", options=None):
    import ipaddress

    from custom_components.sofabaton_x1s.lib import network

    monkeypatch.setattr(network, "_os_route_ip", lambda _peer: os_ip)
    # The host's addresses: its routed one and a second one on another subnet.
    monkeypatch.setattr(
        network,
        "_local_ipv4_interfaces",
        lambda: [ipaddress.IPv4Interface(f"{os_ip}/32"), ipaddress.IPv4Interface("192.0.2.99/32")],
    )
    signals: list[str] = []
    monkeypatch.setattr(hub_module, "async_dispatcher_send", lambda _hass, sig: signals.append(sig))
    hub = _hub(loop)
    entry = SimpleNamespace(
        entry_id="entry-id", data={CONF_MAC: "aa:bb:cc:dd:ee:ff"}, options=dict(options or {})
    )
    hub.hass._entries["entry-id"] = entry
    entity = text_platform.SofabatonLocalAddressText(hub, entry)
    entity.hass = hub.hass
    entity.async_write_ha_state = lambda: None
    return hub, entry, entity, signals


def test_the_local_address_entity_shows_the_address_in_use(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hub, _entry, entity, _signals = _local_address_entity(monkeypatch, loop)
        assert entity._attr_entity_registry_enabled_default is False
        assert entity._attr_unique_id == "aa:bb:cc:dd:ee:ff_local_ip_address"

        loop.run_until_complete(entity._async_refresh())

        assert entity.native_value == "192.0.2.10"
        assert entity.extra_state_attributes == {"mode": "automatic"}
    finally:
        loop.close()


def test_the_local_address_entity_sets_and_clears_the_manual_address(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hub, entry, entity, signals = _local_address_entity(monkeypatch, loop)

        loop.run_until_complete(entity.async_set_value(" 192.0.2.99 "))
        assert entry.options == {"local_address": "192.0.2.99"}
        assert hub.local_address == "192.0.2.99"
        assert hub._proxy.transport.local_address == "192.0.2.99"
        assert entity.native_value == "192.0.2.99"
        assert entity.extra_state_attributes == {"mode": "manual"}
        assert signals == ["sofabaton_x1s_entry-id_hub"]

        # Clearing the field returns to automatic and drops the option.
        loop.run_until_complete(entity.async_set_value(""))
        assert entry.options == {}
        assert hub.local_address is None
        assert entity.native_value == "192.0.2.10"
        assert entity.extra_state_attributes == {"mode": "automatic"}
    finally:
        loop.close()


def test_the_local_address_entity_rejects_anything_but_ipv4(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hub, entry, entity, _signals = _local_address_entity(monkeypatch, loop)

        for bad in ("homeassistant.local", "2001:db8::1", "192.0.2"):
            with pytest.raises(HomeAssistantError):
                loop.run_until_complete(entity.async_set_value(bad))
        assert entry.options == {}
        assert hub.local_address is None
    finally:
        loop.close()


def test_a_stored_manual_address_reaches_the_engine(monkeypatch):
    loop = asyncio.new_event_loop()
    try:
        hass = FakeHass(loop)
        hub = SofabatonHub(
            hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False,
            local_address="192.0.2.99",
        )
        assert hub._proxy.local_address == "192.0.2.99"
        # A host change builds a new engine; the manual address carries over.
        assert hub._create_proxy().local_address == "192.0.2.99"
    finally:
        loop.close()


def test_the_local_address_entity_refuses_an_address_that_is_not_this_hosts(monkeypatch):
    """A typo would take the hub offline: it would be told to call nobody."""
    loop = asyncio.new_event_loop()
    try:
        hub, entry, entity, signals = _local_address_entity(monkeypatch, loop)

        with pytest.raises(HomeAssistantError, match="192.0.2.50 is not an address of this"):
            loop.run_until_complete(entity.async_set_value("192.0.2.50"))
        assert entry.options == {}
        assert hub.local_address is None
        assert hub._proxy.transport.local_address is None
        assert signals == []
    finally:
        loop.close()
