from types import SimpleNamespace

from custom_components.sofabaton_x1s.switch import SofabatonWifiDeviceSwitch


class DummyHub:
    def __init__(self) -> None:
        self.entry_id = "entry-1"
        self.roku_server_enabled = False

    async def async_set_roku_server_enabled(self, enable: bool) -> None:
        self.roku_server_enabled = enable


class DummyEntry:
    data = {"mac": "aa:bb", "name": "Living Room"}


class DummySwitch(SofabatonWifiDeviceSwitch):
    def __init__(self, hub, entry) -> None:
        super().__init__(hub, entry)
        self.remove_callbacks = []
        self.write_count = 0

    def async_on_remove(self, cb):
        self.remove_callbacks.append(cb)

    def async_write_ha_state(self):
        self.write_count += 1


def test_wifi_device_switch_updates_on_dispatch_signal(monkeypatch):
    captured = {}

    def _connect(_hass, _signal, callback):
        captured["callback"] = callback
        return lambda: None

    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.switch.async_dispatcher_connect", _connect
    )

    switch = DummySwitch(DummyHub(), DummyEntry())
    switch.hass = SimpleNamespace()

    import asyncio

    asyncio.run(switch.async_added_to_hass())

    assert switch.is_on is False
    captured["callback"]()
    assert switch.write_count == 1


def test_wifi_device_switch_turn_on_off_updates_hub():
    switch = DummySwitch(DummyHub(), DummyEntry())

    import asyncio

    asyncio.run(switch.async_turn_on())
    assert switch.is_on is True

    asyncio.run(switch.async_turn_off())
    assert switch.is_on is False
