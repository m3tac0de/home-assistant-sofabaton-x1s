import importlib
import sys
import types
from types import SimpleNamespace


def _install_missing_sensor_stubs() -> None:
    sensor_mod = types.ModuleType("homeassistant.components.sensor")

    class SensorEntity:
        def __init__(self, *args, **kwargs) -> None:
            pass

    sensor_mod.SensorEntity = SensorEntity
    sys.modules.setdefault("homeassistant.components.sensor", sensor_mod)

    entity_mod = types.ModuleType("homeassistant.helpers.entity")

    class DeviceInfo(dict):
        pass

    class EntityCategory:
        DIAGNOSTIC = "diagnostic"

    entity_mod.DeviceInfo = DeviceInfo
    entity_mod.EntityCategory = EntityCategory
    sys.modules.setdefault("homeassistant.helpers.entity", entity_mod)

    event_mod = types.ModuleType("homeassistant.helpers.event")
    event_mod.async_track_time_interval = lambda *args, **kwargs: (lambda: None)
    event_mod.async_call_later = lambda *args, **kwargs: (lambda: None)
    sys.modules.setdefault("homeassistant.helpers.event", event_mod)

    dt_mod = types.ModuleType("homeassistant.util.dt")
    dt_mod.utcnow = lambda: SimpleNamespace(timestamp=lambda: 0)
    sys.modules.setdefault("homeassistant.util.dt", dt_mod)

    util_mod = types.ModuleType("homeassistant.util")
    util_mod.dt = dt_mod
    sys.modules.setdefault("homeassistant.util", util_mod)


def _build_sensor_module():
    _install_missing_sensor_stubs()
    module_name = "custom_components.sofabaton_x1s.sensor"
    if module_name in sys.modules:
        return importlib.reload(sys.modules[module_name])
    return importlib.import_module(module_name)


class _Hub:
    def __init__(self, command):
        self._command = command
        self.roku_server_enabled = True

    def get_last_ip_command(self):
        return self._command


def test_wifi_commands_sensor_defaults_to_waiting_state() -> None:
    sensor_module = _build_sensor_module()
    hub = _Hub(None)
    entry = SimpleNamespace(data={"mac": "aa:bb", "name": "Hub"})

    entity = sensor_module.SofabatonIpCommandsSensor(hub, entry)

    assert entity.state == "Waiting for button press"
    assert entity.extra_state_attributes["from_device"] == "Waiting for button press"
    assert entity.extra_state_attributes["received_command"] == "Waiting for button press"


def test_wifi_commands_sensor_flashes_then_resets(monkeypatch) -> None:
    sensor_module = _build_sensor_module()
    hub = _Hub({"entity_name": "Living Room TV", "command_label": "Home", "timestamp": 123})
    entry = SimpleNamespace(data={"mac": "aa:bb", "name": "Hub"})

    callback_holder = {}

    def _fake_async_call_later(_hass, delay, cb):
        callback_holder["delay"] = delay
        callback_holder["cb"] = cb
        return lambda: None

    monkeypatch.setattr(sensor_module, "async_call_later", _fake_async_call_later)

    entity = sensor_module.SofabatonIpCommandsSensor(hub, entry)
    entity.hass = object()
    entity.async_write_ha_state = lambda: None

    entity._handle_ip_command()

    assert entity.state == "Living Room TV/Home"
    assert entity.extra_state_attributes["from_device"] == "Living Room TV"
    assert entity.extra_state_attributes["received_command"] == "Home"
    assert callback_holder["delay"] == 0.3

    callback_holder["cb"](None)

    assert entity.state == "Waiting for button press"
    assert entity.extra_state_attributes["from_device"] == "Waiting for button press"
    assert entity.extra_state_attributes["received_command"] == "Waiting for button press"


def test_wifi_commands_sensor_force_update_enabled() -> None:
    sensor_module = _build_sensor_module()

    assert sensor_module.SofabatonIpCommandsSensor._attr_force_update is True


def test_wifi_commands_sensor_updates_on_wifi_device_toggle(monkeypatch) -> None:
    sensor_module = _build_sensor_module()
    hub = _Hub(None)
    hub.entry_id = "entry-1"
    entry = SimpleNamespace(data={"mac": "aa:bb", "name": "Hub"})

    connected_signals = []

    def _fake_async_dispatcher_connect(_hass, signal, target):
        connected_signals.append((signal, target))
        return lambda: None

    monkeypatch.setattr(sensor_module, "async_dispatcher_connect", _fake_async_dispatcher_connect)

    entity = sensor_module.SofabatonIpCommandsSensor(hub, entry)
    entity.hass = object()
    removers = []
    entity.async_on_remove = removers.append

    state_writes = {"count": 0}
    entity.async_write_ha_state = lambda: state_writes.__setitem__("count", state_writes["count"] + 1)

    import asyncio

    asyncio.run(entity.async_added_to_hass())

    signal_names = [signal for signal, _target in connected_signals]
    assert sensor_module.signal_ip_commands(hub.entry_id) in signal_names
    assert sensor_module.signal_wifi_device(hub.entry_id) in signal_names

    hub.roku_server_enabled = False
    entity._handle_wifi_device_toggle()

    assert entity.available is False
    assert state_writes["count"] == 1
