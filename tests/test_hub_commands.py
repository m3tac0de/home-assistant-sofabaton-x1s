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


def test_roku_http_post_updates_last_ip_command_state():
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

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/Lights_On/Living_Room_TV",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["entity_id"] == 7
    assert ip_command["command_label"] == "Lights On"
    assert ip_command["entity_name"] == "Living Room TV"

    assert hub.get_app_activations() == []

    loop.close()


def test_command_to_favorite_executor_job_uses_partial_not_kwargs():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    class StrictHass(FakeHass):
        async def async_add_executor_job(self, func, *args):  # no kwargs on purpose
            return func(*args)

    hass = StrictHass(loop)

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

    calls: list[tuple[int, int, int, int]] = []

    def _command_to_favorite(activity_id, device_id, command_id, *, slot_id=0):
        calls.append((activity_id, device_id, command_id, slot_id))
        return {"status": "success"}

    hub._proxy.command_to_favorite = _command_to_favorite  # type: ignore[method-assign]

    result = loop.run_until_complete(
        hub.async_command_to_favorite(
            activity_id=101,
            device_id=6,
            command_id=4,
            slot_id=3,
        )
    )

    assert result == {"status": "success"}
    assert calls == [(101, 6, 4, 3)]

    loop.close()
