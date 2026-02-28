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


class _FakeStreamWriter:
    def __init__(self) -> None:
        self.buffer = bytearray()
        self.closed = False

    def get_extra_info(self, name: str):
        if name == "peername":
            return ("10.0.0.12", 54321)
        return None

    def write(self, data: bytes) -> None:
        self.buffer.extend(data)

    def close(self) -> None:
        self.closed = True

    async def wait_closed(self) -> None:
        return None


class _FakeStreamReader:
    def __init__(
        self,
        lines: list[bytes],
        body: bytes = b"",
        *,
        fail_on_readexactly: bool = False,
        delay_on_readline: float = 0,
        delay_on_readexactly: float = 0,
    ) -> None:
        self._lines = list(lines)
        self._body = body
        self._fail_on_readexactly = fail_on_readexactly
        self._delay_on_readline = delay_on_readline
        self._delay_on_readexactly = delay_on_readexactly

    async def readline(self) -> bytes:
        if self._delay_on_readline:
            await asyncio.sleep(self._delay_on_readline)
        if self._lines:
            return self._lines.pop(0)
        return b""

    async def readexactly(self, length: int) -> bytes:
        if self._delay_on_readexactly:
            await asyncio.sleep(self._delay_on_readexactly)
        if self._fail_on_readexactly:
            raise asyncio.IncompleteReadError(partial=self._body, expected=length)
        if len(self._body) < length:
            raise asyncio.IncompleteReadError(partial=self._body, expected=length)
        data = self._body[:length]
        self._body = self._body[length:]
        return data


def _response_status(writer: _FakeStreamWriter) -> int:
    first_line = bytes(writer.buffer).split(b"\r\n", 1)[0].decode("utf-8")
    return int(first_line.split()[1])


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




def test_listener_rejects_overlong_path_segment() -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        hub = _FakeHub(entry_id="e1", action_id="abc123", host="10.0.0.12")
        await manager.async_register_hub(hub, enabled=True)

        long_segment = "X" * 31
        status, body = await manager.async_handle_post(
            method="POST",
            path=f"/launch/abc123/7/{long_segment}",
            headers={},
            body=b"",
            source_ip="10.0.0.12",
        )

        assert status == 400
        assert body == b"bad request"
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


def test_listener_restarts_when_port_changes(monkeypatch) -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        starts: list[int] = []

        class _Server:
            def __init__(self) -> None:
                self.closed = False

            def close(self):
                self.closed = True

            async def wait_closed(self):
                return None

        async def _start_server(*args, **kwargs):
            starts.append(kwargs["port"])
            return _Server()

        monkeypatch.setattr(asyncio, "start_server", _start_server)

        hub = _FakeHub(entry_id="e1", action_id="abc123", host="10.0.0.12")
        await manager.async_register_hub(hub, enabled=True)
        await manager.async_set_listen_port(8765)

        assert starts == [8060, 8765]
        assert manager._bound_port == 8765

    asyncio.run(_run())


def test_handle_client_rejects_malformed_request_line(monkeypatch) -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        called = False

        async def _unexpected_handle_post(**kwargs):
            nonlocal called
            called = True
            return (200, b"ok")

        monkeypatch.setattr(manager, "async_handle_post", _unexpected_handle_post)
        reader = _FakeStreamReader([b"POST /launch/abc123\r\n", b"\r\n"])
        writer = _FakeStreamWriter()

        await manager._async_handle_client(reader, writer)

        assert _response_status(writer) == 400
        assert called is False
        assert writer.closed

    asyncio.run(_run())


def test_handle_client_rejects_invalid_http_version(monkeypatch) -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        called = False

        async def _unexpected_handle_post(**kwargs):
            nonlocal called
            called = True
            return (200, b"ok")

        monkeypatch.setattr(manager, "async_handle_post", _unexpected_handle_post)
        reader = _FakeStreamReader([b"POST /launch/abc123/7/Lights_On HTTP/2.0\r\n", b"\r\n"])
        writer = _FakeStreamWriter()

        await manager._async_handle_client(reader, writer)

        assert _response_status(writer) == 400
        assert called is False

    asyncio.run(_run())


def test_handle_client_rejects_large_request_line() -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        manager._max_request_line_bytes = 20

        reader = _FakeStreamReader([b"POST /launch/abc123/7/Lights_On HTTP/1.1\r\n"])
        writer = _FakeStreamWriter()

        await manager._async_handle_client(reader, writer)

        assert _response_status(writer) == 431
        assert writer.closed

    asyncio.run(_run())


def test_handle_client_rejects_large_headers() -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        manager._max_header_bytes = 10

        reader = _FakeStreamReader(
            [
                b"POST /launch/abc123/7/Lights_On HTTP/1.1\r\n",
                b"X-Long: 1234567890\r\n",
                b"\r\n",
            ]
        )
        writer = _FakeStreamWriter()

        await manager._async_handle_client(reader, writer)

        assert _response_status(writer) == 431
        assert writer.closed

    asyncio.run(_run())


def test_handle_client_rejects_large_body() -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        manager._max_body_bytes = 4

        reader = _FakeStreamReader(
            [
                b"POST /launch/abc123/7/Lights_On HTTP/1.1\r\n",
                b"Content-Length: 5\r\n",
                b"\r\n",
            ]
        )
        writer = _FakeStreamWriter()

        await manager._async_handle_client(reader, writer)

        assert _response_status(writer) == 413
        assert writer.closed

    asyncio.run(_run())


def test_handle_client_times_out_while_reading_headers() -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())
        manager._read_timeout_seconds = 0.01

        reader = _FakeStreamReader(
            [
                b"POST /launch/abc123/7/Lights_On HTTP/1.1\r\n",
                b"\r\n",
            ],
            delay_on_readline=0.05,
        )
        writer = _FakeStreamWriter()

        await manager._async_handle_client(reader, writer)

        assert _response_status(writer) == 408
        assert writer.closed

    asyncio.run(_run())


def test_handle_client_ignores_small_body(monkeypatch) -> None:
    async def _run() -> None:
        manager = RokuListenerManager(_FakeHass())

        async def _handle_post(**kwargs):
            assert kwargs["body"] == b""
            return (200, b"ok")

        monkeypatch.setattr(manager, "async_handle_post", _handle_post)
        reader = _FakeStreamReader(
            [
                b"POST /launch/abc123/7/Lights_On HTTP/1.1\r\n",
                b"Content-Length: 2\r\n",
                b"\r\n",
            ],
            body=b"{}",
            delay_on_readexactly=0.05,
        )
        writer = _FakeStreamWriter()

        await manager._async_handle_client(reader, writer)

        assert _response_status(writer) == 200
        assert writer.closed

    asyncio.run(_run())
