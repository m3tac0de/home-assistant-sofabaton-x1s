import asyncio

from custom_components.sofabaton_x1s.hub import SofabatonHub


class FakeHass:
    def __init__(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop

    async def async_add_executor_job(self, func, *args, **kwargs):  # pragma: no cover - passthrough
        return func(*args, **kwargs)

    def async_create_task(self, coro):  # pragma: no cover - passthrough
        return self.loop.create_task(coro)


def test_activity_fetch_clears_inflight_after_favorite_labels(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.hub_connected = True
    hub.activities_ready = True
    hub.devices_ready = True

    act_id = 0x0101
    act_lo = act_id & 0xFF
    dev_id = 0x0202
    cmd_id = 0x002A

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": dev_id, "command_id": cmd_id}
    ]

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    async def _noop_wait(*_):
        return None

    monkeypatch.setattr(hub, "_async_wait_for_buttons_ready", _noop_wait)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_, **__: ([], True))

    loop.run_until_complete(hub.async_fetch_device_commands(act_id))

    assert act_id in hub._commands_in_flight
    hub.hub_connected = True
    assert hub.get_index_state() == "loading"

    hub._proxy.state.commands[dev_id & 0xFF] = {cmd_id: "Fav Label"}
    hub._proxy.state.record_favorite_label(act_lo, dev_id, cmd_id, "Fav Label")
    hub._proxy._favorite_label_requests.clear()

    hub._on_commands_burst(f"commands:{dev_id & 0xFF}")
    loop.run_until_complete(asyncio.sleep(0))

    assert act_id not in hub._commands_in_flight
    assert hub._commands_in_flight == set()
    assert hub._pending_button_fetch == set()
    hub.hub_connected = True
    hub.activities_ready = True
    hub.devices_ready = True
    assert hub.get_index_state() == "ready"

    loop.close()


def test_roku_http_post_records_activation_and_fires_bus_event():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    class _FakeBus:
        def __init__(self) -> None:
            self.events: list[tuple[str, dict]] = []

        def async_fire(self, event_type: str, event_data: dict) -> None:
            self.events.append((event_type, event_data))

    hass = FakeHass(loop)
    hass.bus = _FakeBus()

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/Lights_On",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    activations = hub.get_app_activations()
    assert activations
    assert activations[0]["entity_id"] == 7
    assert activations[0]["command_label"] == "Lights On"

    assert hass.bus.events
    event_type, event_data = hass.bus.events[0]
    assert event_type == "sofabaton_x1s_roku_request"
    assert event_data["entry_id"] == "entry-id"

    loop.close()
