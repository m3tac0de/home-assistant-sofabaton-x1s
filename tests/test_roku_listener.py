import asyncio

from custom_components.sofabaton_x1s.roku_listener import RokuListenerManager


class _FakeHub:
    def __init__(self, *, entry_id: str, action_id: str, host: str) -> None:
        self.entry_id = entry_id
        self.host = host
        self._action_id = action_id
        self.received: list[dict] = []

    def get_roku_action_id(self) -> str:
        return self._action_id

    async def async_handle_roku_http_post(self, **payload):
        self.received.append(payload)


class _FakeHass:
    def __init__(self) -> None:
        self.data = {"sofabaton_x1s": {}}


def test_listener_routes_post_to_matching_hub() -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        hub = _FakeHub(entry_id="e1", action_id="abc123", host="10.0.0.12")
        await manager.async_register_hub(hub, enabled=True)

        status, body = await manager.async_handle_post(
            method="POST",
            path="/launch/abc123/7/Lights_On",
            headers={"content-length": "2"},
            body=b"{}",
            source_ip="10.0.0.12",
        )

        assert status == 200
        assert body == b"ok"
        assert hub.received and hub.received[0]["path"] == "/launch/abc123/7/Lights_On"

        await manager.async_remove_hub("e1")

    asyncio.run(_run())


def test_listener_routes_absolute_url_target_to_matching_hub() -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        hub = _FakeHub(entry_id="e1", action_id="abc123", host="10.0.0.12")
        await manager.async_register_hub(hub, enabled=True)

        status, body = await manager.async_handle_post(
            method="POST",
            path="http://10.0.0.7:8765/launch/abc123/7/Lights_On",
            headers={"content-length": "2"},
            body=b"{}",
            source_ip="10.0.0.12",
        )

        assert status == 200
        assert body == b"ok"
        assert hub.received and hub.received[0]["path"] == "/launch/abc123/7/Lights_On"

        await manager.async_remove_hub("e1")

    asyncio.run(_run())


def test_listener_rejects_unknown_or_untrusted_source() -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        hub = _FakeHub(entry_id="e1", action_id="abc123", host="10.0.0.12")
        await manager.async_register_hub(hub, enabled=True)

        status_unknown, _ = await manager.async_handle_post(
            method="POST",
            path="/launch/nope/7/Lights_On",
            headers={},
            body=b"",
            source_ip="10.0.0.12",
        )
        status_untrusted, _ = await manager.async_handle_post(
            method="POST",
            path="/launch/abc123/7/Lights_On",
            headers={},
            body=b"",
            source_ip="10.0.0.99",
        )

        assert status_unknown == 404
        assert status_untrusted == 403
        assert not hub.received

        await manager.async_remove_hub("e1")

    asyncio.run(_run())


def test_listener_start_failure_does_not_raise(monkeypatch) -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        hub = _FakeHub(entry_id="e1", action_id="abc123", host="10.0.0.12")

        async def _raise(*args, **kwargs):
            raise OSError("address already in use")

        monkeypatch.setattr(asyncio, "start_server", _raise)

        await manager.async_register_hub(hub, enabled=True)
        assert manager._server is None

    asyncio.run(_run())


def test_listener_concurrent_register_only_binds_once(monkeypatch) -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        calls = 0

        class _Server:
            def close(self):
                return None

            async def wait_closed(self):
                return None

        async def _start_server(*args, **kwargs):
            nonlocal calls
            calls += 1
            await asyncio.sleep(0)
            return _Server()

        monkeypatch.setattr(asyncio, "start_server", _start_server)

        hub1 = _FakeHub(entry_id="e1", action_id="abc123", host="10.0.0.12")
        hub2 = _FakeHub(entry_id="e2", action_id="abc456", host="10.0.0.13")

        await asyncio.gather(
            manager.async_register_hub(hub1, enabled=True),
            manager.async_register_hub(hub2, enabled=True),
        )

        assert calls == 1
        assert manager._server is not None

    asyncio.run(_run())
