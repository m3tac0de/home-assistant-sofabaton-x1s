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
        CONFIG = "config"
        DIAGNOSTIC = "diagnostic"

    entity_mod.DeviceInfo = DeviceInfo
    entity_mod.EntityCategory = EntityCategory
    # Replace helper entity module for this test file so imports are deterministic
    # regardless of what other tests inserted into sys.modules first.
    sys.modules["homeassistant.helpers.entity"] = entity_mod

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
    assert entity.extra_state_attributes["press_type"] == "Unknown"


def test_wifi_commands_sensor_flashes_then_resets(monkeypatch) -> None:
    sensor_module = _build_sensor_module()
    hub = _Hub(
        {
            "entity_name": "Living Room TV",
            "command_label": "Home",
            "press_type": "long",
            "timestamp": 123,
        }
    )
    entry = SimpleNamespace(data={"mac": "aa:bb", "name": "Hub"})

    callback_holder = {}

    def _fake_async_call_later(_hass, delay, cb):
        callback_holder["delay"] = delay
        callback_holder["cb"] = cb
        return lambda: None

    monkeypatch.setattr(sensor_module, "async_call_later", _fake_async_call_later)

    entity = sensor_module.SofabatonIpCommandsSensor(hub, entry)
    entity.hass = object()

    state_log = []
    entity.async_write_ha_state = lambda: state_log.append(entity.state)

    # First press from "Waiting" — no pulse, just one write
    entity._handle_ip_command()

    assert state_log == ["Living Room TV/Home/longpress"]
    assert entity.state == "Living Room TV/Home/longpress"
    assert entity.extra_state_attributes["from_device"] == "Living Room TV"
    assert entity.extra_state_attributes["received_command"] == "Home"
    assert entity.extra_state_attributes["press_type"] == "long"
    assert callback_holder["delay"] == 0.3

    callback_holder["cb"](None)

    assert entity.state == "Waiting for button press"
    assert entity.extra_state_attributes["from_device"] == "Waiting for button press"
    assert entity.extra_state_attributes["received_command"] == "Waiting for button press"


def test_wifi_commands_sensor_pulses_on_repeated_command(monkeypatch) -> None:
    sensor_module = _build_sensor_module()
    hub = _Hub(
        {
            "entity_name": "TV",
            "command_label": "VolumeUp",
            "press_type": "short",
            "timestamp": 1,
        }
    )
    entry = SimpleNamespace(data={"mac": "aa:bb", "name": "Hub"})

    callback_holder = {}
    cancel_calls = {"count": 0}

    def _fake_async_call_later(_hass, delay, cb):
        callback_holder["delay"] = delay
        callback_holder["cb"] = cb

        def _cancel():
            cancel_calls["count"] += 1

        return _cancel

    monkeypatch.setattr(sensor_module, "async_call_later", _fake_async_call_later)

    entity = sensor_module.SofabatonIpCommandsSensor(hub, entry)
    entity.hass = object()

    state_log = []
    entity.async_write_ha_state = lambda: state_log.append(entity.state)

    # First press — from Waiting, no pulse
    entity._handle_ip_command()
    assert state_log == ["TV/VolumeUp"]

    # Second press — should pulse: reset to Waiting, then command
    entity._handle_ip_command()
    assert state_log == ["TV/VolumeUp", "Waiting for button press", "TV/VolumeUp"]
    assert cancel_calls["count"] == 1

    # Third press — pulses again
    entity._handle_ip_command()
    assert state_log == [
        "TV/VolumeUp",
        "Waiting for button press",
        "TV/VolumeUp",
        "Waiting for button press",
        "TV/VolumeUp",
    ]
    assert cancel_calls["count"] == 2

    # Simulate button release: 0.3s timer fires
    callback_holder["cb"](None)
    assert state_log[-1] == "Waiting for button press"


def test_wifi_commands_sensor_pulse_with_different_commands(monkeypatch) -> None:
    sensor_module = _build_sensor_module()
    cmd_a = {
        "entity_name": "TV",
        "command_label": "Home",
        "press_type": "short",
        "timestamp": 1,
    }
    cmd_b = {
        "entity_name": "TV",
        "command_label": "Back",
        "press_type": "short",
        "timestamp": 2,
    }
    hub = _Hub(cmd_a)
    entry = SimpleNamespace(data={"mac": "aa:bb", "name": "Hub"})

    def _fake_async_call_later(_hass, delay, cb):
        return lambda: None

    monkeypatch.setattr(sensor_module, "async_call_later", _fake_async_call_later)

    entity = sensor_module.SofabatonIpCommandsSensor(hub, entry)
    entity.hass = object()

    state_log = []
    entity.async_write_ha_state = lambda: state_log.append(entity.state)

    entity._handle_ip_command()
    assert state_log == ["TV/Home"]

    hub._command = cmd_b
    entity._handle_ip_command()
    assert state_log == ["TV/Home", "Waiting for button press", "TV/Back"]


def test_wifi_commands_sensor_force_update_enabled() -> None:
    sensor_module = _build_sensor_module()

    assert sensor_module.SofabatonIpCommandsSensor._attr_force_update is True


def test_wifi_commands_sensor_is_always_added(monkeypatch) -> None:
    sensor_module = _build_sensor_module()

    added_entities = []

    def _fake_add_entities(entities):
        added_entities.extend(entities)

    hub = _Hub(None)
    hub.roku_server_enabled = False
    hub.entry_id = "entry-1"

    hass = SimpleNamespace(data={sensor_module.DOMAIN: {"entry-1": hub}})
    entry = SimpleNamespace(entry_id="entry-1", data={"mac": "aa:bb", "name": "Hub"})

    import asyncio

    asyncio.run(sensor_module.async_setup_entry(hass, entry, _fake_add_entities))

    assert any(isinstance(entity, sensor_module.SofabatonIpCommandsSensor) for entity in added_entities)


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
