"""Device-mode backend surface (docs/internal/device-mode-plan.md, D0).

Covers the two pieces the remote card's device mode stands on:

- ``SofabatonHub.get_ui_device_list``: the dropdown catalog published as the
  remote entity's ``devices`` attribute — Wifi Events filtered at the
  presentation layer, physical-remote ordering via the record sort byte.
- ``SofabatonHub.get_device_keymap`` + the ``device/keymap`` WS command: a
  pure projection of cached proxy state with a clean cache-miss path and no
  hub I/O.
"""

import asyncio
import importlib
from types import SimpleNamespace

from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.lib.hub_versions import HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")

FETCHED_DEVICE = "2026-08-17T08:00:00+00:00"


def _proxy() -> X1Proxy:
    return X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )


def _hub(proxy: X1Proxy) -> SofabatonHub:
    hub = SofabatonHub.__new__(SofabatonHub)
    hub.entry_id = "entry-1"
    hub.name = "Living Room"
    hub._proxy = proxy
    hub.devices = {}
    return hub


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# get_ui_device_list
# ---------------------------------------------------------------------------


def test_ui_device_list_filters_wifi_events_at_presentation_layer() -> None:
    proxy = _proxy()
    hub = _hub(proxy)
    hub.devices = {
        3: {"name": "TV", "brand": "Samsung", "device_class": "ir"},
        # A user-created Wifi Commands device stays visible.
        9: {"name": "Lights", "brand": "m3-a1b2c3d4-ffee00", "device_class": "wifi"},
        # The reserved Wifi Events record is hidden from the dropdown.
        11: {"name": "Wifi Events", "brand": "m3-haevents-ffee00", "device_class": "wifi"},
    }

    rows = hub.get_ui_device_list()

    assert [row["id"] for row in rows] == [3, 9]
    assert rows[0]["name"] == "TV"
    assert rows[0]["device_class"] == "ir"


def test_ui_device_list_orders_by_sort_byte_then_id() -> None:
    proxy = _proxy()
    hub = _hub(proxy)
    hub.devices = {
        3: {"name": "TV"},
        5: {"name": "Amp"},
        7: {"name": "Player"},
    }
    # Shared record schema: display order lives in body[6]. Device 7 sorts
    # ahead of device 3; device 5 has no cached record and falls back to id
    # order after the sorted rows.
    proxy.state.devices[3] = {"name": "TV", "raw_body": bytes([0, 0, 0, 0, 0, 0, 2])}
    proxy.state.devices[7] = {"name": "Player", "raw_body": bytes([0, 0, 0, 0, 0, 0, 1])}

    rows = hub.get_ui_device_list()

    assert [row["id"] for row in rows] == [7, 3, 5]
    assert [row["sort"] for row in rows] == [1, 2, 0]


def test_ui_device_list_names_fall_back_to_device_id() -> None:
    proxy = _proxy()
    hub = _hub(proxy)
    hub.devices = {4: {"name": ""}}

    rows = hub.get_ui_device_list()

    assert rows == [{"id": 4, "name": "Device 4", "sort": 0}]


# ---------------------------------------------------------------------------
# get_device_keymap
# ---------------------------------------------------------------------------


def _populate_device(proxy: X1Proxy) -> None:
    proxy.state.devices[7] = {"name": "TV", "device_class": "ir"}
    proxy.state.commands[7] = {1: "Power", 2: "Mute", 3: "Input"}
    proxy.state.buttons[7] = {0x10, 0x12}
    proxy.state.button_details[7] = {
        0x10: {"command_id": 1},
        0x12: {"command_id": 2, "long_press_command_id": 3},
    }
    proxy._commands_complete.add(7)
    proxy.state.detail_fetched_at["device"][7] = FETCHED_DEVICE


def test_device_keymap_returns_none_before_structural_fetch() -> None:
    proxy = _proxy()
    hub = _hub(proxy)
    # Commands can be warm from casual browsing without the structural
    # freshness stamp; the projection still refuses until a real fetch ran.
    proxy.state.commands[7] = {1: "Power"}

    assert hub.get_device_keymap(7) is None


def test_device_keymap_projects_cached_state_without_fetching() -> None:
    proxy = _proxy()
    hub = _hub(proxy)
    _populate_device(proxy)
    hub.devices = {7: {"name": "TV", "device_class": "ir"}}

    keymap = hub.get_device_keymap(7)

    assert keymap is not None
    assert keymap["device"] == {"device_id": 7, "name": "TV", "device_class": "ir"}
    assert keymap["buttons"] == [0x10, 0x12]
    assert keymap["fetched_at"] == FETCHED_DEVICE
    assert keymap["commands"] == [
        {"command_id": 1, "name": "Power"},
        {"command_id": 2, "name": "Mute"},
        {"command_id": 3, "name": "Input"},
    ]

    bindings = {row["button_id"]: row for row in keymap["bindings"]}
    assert bindings[0x10]["command_id"] == 1
    assert bindings[0x10]["command_name"] == "Power"
    assert bindings[0x12]["command_id"] == 2
    assert bindings[0x12]["long_press_command_id"] == 3


def test_device_keymap_power_configured_gates_on_idle_behavior() -> None:
    # The card's power button gate: idle modes 1-3 mean power is
    # configured; 4 (no power key), 0 (never set up), and a missing
    # value all fail closed. The record-tail power_mode byte must not
    # leak into this decision (it reads 1 on every real hub device).
    proxy = _proxy()
    hub = _hub(proxy)
    _populate_device(proxy)

    for idle, expected in ((1, True), (2, True), (3, True), (4, False), (0, False)):
        hub.devices = {7: {"name": "TV", "idle_behavior": idle, "power_mode": 1}}
        keymap = hub.get_device_keymap(7)
        assert keymap is not None
        assert keymap["power_configured"] is expected, f"idle={idle}"

    # Missing idle byte fails closed even with the tail byte present.
    hub.devices = {7: {"name": "TV", "power_mode": 1}}
    keymap = hub.get_device_keymap(7)
    assert keymap is not None
    assert keymap["power_configured"] is False


def test_device_keymap_handles_device_with_no_bindings() -> None:
    proxy = _proxy()
    hub = _hub(proxy)
    proxy.state.devices[9] = {"name": "Fan"}
    proxy.state.commands[9] = {1: "Toggle"}
    proxy._commands_complete.add(9)
    proxy.state.detail_fetched_at["device"][9] = FETCHED_DEVICE

    keymap = hub.get_device_keymap(9)

    assert keymap is not None
    assert keymap["buttons"] == []
    assert keymap["bindings"] == []
    assert keymap["commands"] == [{"command_id": 1, "name": "Toggle"}]


# ---------------------------------------------------------------------------
# WS command
# ---------------------------------------------------------------------------


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload=None):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


class _Store:
    def __init__(self, *, enabled=True):
        self.enabled = enabled


class _WsHub:
    entry_id = "entry-1"
    cache_generation = 42

    def __init__(self, *, keymap=None):
        self._keymap = keymap
        self.requested_device_id = None

    def get_device_keymap(self, device_id):
        self.requested_device_id = device_id
        return self._keymap


def _patch(monkeypatch, *, hub, store):
    async def fake_resolve(_hass, _data):
        return hub

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_async_get_persistent_cache_store", fake_store)


def test_ws_device_keymap_requires_persistent_cache(monkeypatch):
    conn = _Conn()
    hub = _WsHub(keymap={"device": {}})
    _patch(monkeypatch, hub=hub, store=_Store(enabled=False))
    hass = SimpleNamespace(data={integration.DOMAIN: {}})

    _run(
        integration._ws_get_device_keymap(
            hass, conn, {"id": 1, "entry_id": "entry-1", "device_id": 7}
        )
    )

    assert conn.error is None
    assert conn.result[1] == {"keymap": None, "reason": "cache_disabled"}
    # The projection is never consulted while the gate is closed.
    assert hub.requested_device_id is None


def test_ws_device_keymap_cache_miss(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch, hub=_WsHub(keymap=None), store=_Store(enabled=True))
    hass = SimpleNamespace(data={integration.DOMAIN: {}})

    _run(
        integration._ws_get_device_keymap(
            hass, conn, {"id": 2, "entry_id": "entry-1", "device_id": 7}
        )
    )

    assert conn.result[1] == {"keymap": None, "reason": "cache_miss"}


def test_ws_device_keymap_returns_projection_and_generation(monkeypatch):
    conn = _Conn()
    keymap = {"device": {"device_id": 7}, "buttons": [], "bindings": [], "commands": []}
    hub = _WsHub(keymap=keymap)
    _patch(monkeypatch, hub=hub, store=_Store(enabled=True))
    hass = SimpleNamespace(data={integration.DOMAIN: {}})

    _run(
        integration._ws_get_device_keymap(
            hass, conn, {"id": 3, "entry_id": "entry-1", "device_id": "7"}
        )
    )

    assert conn.result[1] == {"keymap": keymap, "generation": 42}
    assert hub.requested_device_id == 7


# ---------------------------------------------------------------------------
# WS device/power_state (plan section 8: the power button's click-time read)
# ---------------------------------------------------------------------------


class _PowerHub:
    entry_id = "entry-1"

    def __init__(self, *, power_state):
        self._power_state = power_state
        self.requested_device_id = None

    async def async_get_device_power_state(self, device_id):
        self.requested_device_id = device_id
        return self._power_state


def test_ws_device_power_state_returns_live_byte(monkeypatch):
    conn = _Conn()
    hub = _PowerHub(power_state=1)
    _patch(monkeypatch, hub=hub, store=_Store(enabled=True))
    hass = SimpleNamespace(data={integration.DOMAIN: {}})

    _run(
        integration._ws_get_device_power_state(
            hass, conn, {"id": 4, "entry_id": "entry-1", "device_id": "4"}
        )
    )

    assert conn.error is None
    assert conn.result[1] == {"power_state": 1}
    assert hub.requested_device_id == 4


def test_ws_device_power_state_null_when_unreadable(monkeypatch):
    conn = _Conn()
    _patch(monkeypatch, hub=_PowerHub(power_state=None), store=_Store(enabled=True))
    hass = SimpleNamespace(data={integration.DOMAIN: {}})

    _run(
        integration._ws_get_device_power_state(
            hass, conn, {"id": 5, "entry_id": "entry-1", "device_id": 4}
        )
    )

    assert conn.result[1] == {"power_state": None}


def test_hub_power_state_reads_fresh_row() -> None:
    from custom_components.sofabaton_x1s.lib.devices import (
        DeviceConfig,
        build_device_create_payload,
        parse_device_record,
    )

    proxy = _proxy()
    hub = _hub(proxy)

    # A real 210-byte record body with power_state=1, round-tripped
    # through the schema builder so the offsets stay honest.
    payload = build_device_create_payload(
        DeviceConfig(name="Xbox", brand="Microsoft", device_id=4, power_state=1),
        hub_version="X1S",
    )
    body = payload[3:]
    assert parse_device_record(body, hub_version="X1S").power_state == 1

    async def fake_refresh(timeout_seconds=15.0):
        return {4: {"name": "Xbox", "raw_body": body}}

    hub._async_refresh_devices_snapshot = fake_refresh  # type: ignore[method-assign]
    hub.version = "X1S"

    assert _run(hub.async_get_device_power_state(4)) == 1
    # Missing device or unparsable body reads as unknown.
    assert _run(hub.async_get_device_power_state(9)) is None


# ---------------------------------------------------------------------------
# remote entity `devices` attribute
# ---------------------------------------------------------------------------


class _AttrHub:
    """Hub double covering everything extra_state_attributes touches."""

    entry_id = "entry-1"
    mac = "AABBCCDDEEFF"
    client_connected = False
    cache_generation = 5
    current_activity = None
    activities = {}

    def get_all_cached_buttons(self):
        return {}

    def get_all_cached_macros(self):
        return {}

    def get_activity_favorites(self):
        return {}

    def get_index_state(self):
        return "ready"

    def get_ui_device_list(self):
        return [{"id": 3, "name": "TV", "sort": 0}]

    def get_all_cached_button_details(self):
        return {}


def _remote_entity():
    remote_mod = importlib.import_module("custom_components.sofabaton_x1s.remote")
    entry = SimpleNamespace(
        entry_id="entry-1", data={"mac": "AABBCCDDEEFF"}, options={}
    )
    return remote_mod.SofabatonRemote(_AttrHub(), entry)


def test_remote_attributes_publish_devices_when_cache_enabled():
    entity = _remote_entity()
    entity.hass = SimpleNamespace(
        data={
            integration.DOMAIN: {
                "persistent_cache_store": SimpleNamespace(enabled=True)
            }
        }
    )

    attrs = entity.extra_state_attributes

    assert attrs["devices"] == [{"id": 3, "name": "TV", "sort": 0}]


def test_remote_attributes_omit_devices_when_cache_disabled():
    entity = _remote_entity()
    entity.hass = SimpleNamespace(
        data={
            integration.DOMAIN: {
                "persistent_cache_store": SimpleNamespace(enabled=False)
            }
        }
    )

    assert "devices" not in entity.extra_state_attributes


def test_remote_attributes_omit_devices_without_cache_store():
    entity = _remote_entity()
    entity.hass = SimpleNamespace(data={integration.DOMAIN: {}})

    assert "devices" not in entity.extra_state_attributes


def test_ws_device_keymap_unknown_hub(monkeypatch):
    conn = _Conn()

    async def fake_resolve(_hass, _data):
        return None

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    hass = SimpleNamespace(data={integration.DOMAIN: {}})

    _run(
        integration._ws_get_device_keymap(
            hass, conn, {"id": 4, "entry_id": "missing", "device_id": 7}
        )
    )

    assert conn.error[1] == "not_found"
