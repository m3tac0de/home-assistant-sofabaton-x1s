import asyncio
from types import SimpleNamespace

import importlib

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


class _Hub:
    entry_id = "entry-1"

    def __init__(self):
        self.fetch_result = {
            "device_id": 11,
            "requested_command_id": 18,
            "commands": [
                {
                    "command_label": "Input",
                    "device_id": 11,
                    "command_id": 18,
                    "device_class": "IR",
                    "blob_kind": "descriptive",
                    "command_blob": "00 11",
                    "parsed_blob": "P:Sony12 R:40000 D:1 F:18 MUL:2",
                    "replay_tail_checksum": 55,
                    "command_checksum": 55,
                }
            ],
            "complete": True,
        }
        self.fetch_calls = []
        self.play_calls = []
        self.play_return = True
        self.persist_calls = []
        self.persist_return = {
            "status": "success",
            "device_id": 11,
            "command_id": 112,
            "command_name": "New Command",
            "page_count": 4,
        }

    async def async_fetch_blob(self, *, device_id: int, command_id: int | None = None, wait_timeout: float = 10.0):
        self.fetch_calls.append((device_id, command_id, wait_timeout))
        return self.fetch_result

    async def async_play_ir_blob(self, blob: bytes, *, inter_frame_delay: float = 0.08):
        self.play_calls.append((blob, inter_frame_delay))
        return self.play_return

    async def async_persist_ir_blob(
        self,
        *,
        device_id: int,
        command_name: str,
        blob: bytes,
        inter_frame_delay: float = 0.08,
        wait_timeout: float = 10.0,
    ):
        self.persist_calls.append((device_id, command_name, blob, inter_frame_delay, wait_timeout))
        return self.persist_return


def test_ws_fetch_blob_returns_normalized_payload(monkeypatch):
    conn = _Conn()
    hub = _Hub()

    async def fake_resolve(_hass, data):
        assert data["entry_id"] == "entry-1"
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    loop = asyncio.new_event_loop()
    try:
      loop.run_until_complete(
          integration._ws_fetch_blob(
              SimpleNamespace(),
              conn,
              {"id": 1, "entry_id": "entry-1", "device_id": 11, "command_id": 18},
          )
      )
    finally:
      loop.close()

    assert conn.error is None
    assert conn.result == (1, hub.fetch_result)
    assert hub.fetch_calls == [(11, 18, 10.0)]


def test_ws_play_ir_blob_accepts_hex_blob(monkeypatch):
    conn = _Conn()
    hub = _Hub()

    async def fake_resolve(_hass, _data):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    loop = asyncio.new_event_loop()
    try:
      loop.run_until_complete(
          integration._ws_play_ir_blob(
              SimpleNamespace(),
              conn,
              {
                  "id": 2,
                  "entry_id": "entry-1",
                  "blob": "00 00 00 1f 00 00 11 00 94 70 50 3a 53 6f 6e 79 31 32 20 52 3a 34 30 30 30 30 20 44 3a 31 20 46 3a 31 38 20 4d 55 4c 3a 32 00 00 00 00",
              },
          )
      )
    finally:
      loop.close()

    assert conn.error is None
    assert conn.result == (2, {"ok": True})
    assert hub.play_calls[-1][0] == bytes.fromhex(
        "00 00 00 1f 00 00 11 00 94 70 50 3a 53 6f 6e 79 31 32 20 52 3a 34 30 30 30 30 20 44 3a 31 20 46 3a 31 38 20 4d 55 4c 3a 32 00 00 00 00"
    )


def test_ws_play_ir_blob_accepts_descriptor(monkeypatch):
    conn = _Conn()
    hub = _Hub()

    async def fake_resolve(_hass, _data):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    loop = asyncio.new_event_loop()
    try:
      loop.run_until_complete(
          integration._ws_play_ir_blob(
              SimpleNamespace(),
              conn,
              {
                  "id": 3,
                  "entry_id": "entry-1",
                  "blob": "P:Sony12 R:40000 D:1 F:18 MUL:2",
              },
          )
      )
    finally:
      loop.close()

    assert conn.error is None
    assert conn.result == (3, {"ok": True})
    assert isinstance(hub.play_calls[-1][0], bytes)
    assert hub.play_calls[-1][0].startswith(b"\x00\x00")


def test_ws_play_ir_blob_reports_invalid_blob(monkeypatch):
    conn = _Conn()
    hub = _Hub()

    async def fake_resolve(_hass, _data):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    loop = asyncio.new_event_loop()
    try:
      loop.run_until_complete(
          integration._ws_play_ir_blob(
              SimpleNamespace(),
              conn,
              {"id": 4, "entry_id": "entry-1", "blob": "zzzz"},
          )
      )
    finally:
      loop.close()

    assert conn.result is None
    assert conn.error[0] == 4
    assert conn.error[1] == "invalid_blob"


def test_ws_play_ir_blob_reports_unavailable_when_hub_rejects(monkeypatch):
    conn = _Conn()
    hub = _Hub()
    hub.play_return = False

    async def fake_resolve(_hass, _data):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    loop = asyncio.new_event_loop()
    try:
      loop.run_until_complete(
          integration._ws_play_ir_blob(
              SimpleNamespace(),
              conn,
              {
                  "id": 5,
                  "entry_id": "entry-1",
                  "blob": "P:Sony12 R:40000 D:1 F:18 MUL:2",
              },
          )
      )
    finally:
      loop.close()

    assert conn.result is None
    assert conn.error == (
        5,
        "unavailable",
        "Hub is not ready to play IR blob (proxy client connected?)",
    )


def test_ws_persist_ir_blob_accepts_descriptor(monkeypatch):
    conn = _Conn()
    hub = _Hub()

    async def fake_resolve(_hass, _data):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    loop = asyncio.new_event_loop()
    try:
      loop.run_until_complete(
          integration._ws_persist_ir_blob(
              SimpleNamespace(),
              conn,
              {
                  "id": 6,
                  "entry_id": "entry-1",
                  "device_id": 11,
                  "command_name": "New Command",
                  "blob": "P:Sony12 R:40000 D:1 F:18 MUL:2",
              },
          )
      )
    finally:
      loop.close()

    assert conn.error is None
    assert conn.result == (6, hub.persist_return)
    assert hub.persist_calls[-1][0] == 11
    assert hub.persist_calls[-1][1] == "New Command"
    assert isinstance(hub.persist_calls[-1][2], bytes)
    assert hub.persist_calls[-1][2].startswith(b"\x00\x00")


def test_ws_persist_ir_blob_reports_unavailable_when_hub_rejects(monkeypatch):
    conn = _Conn()
    hub = _Hub()
    hub.persist_return = None

    async def fake_resolve(_hass, _data):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    loop = asyncio.new_event_loop()
    try:
      loop.run_until_complete(
          integration._ws_persist_ir_blob(
              SimpleNamespace(),
              conn,
              {
                  "id": 7,
                  "entry_id": "entry-1",
                  "device_id": 11,
                  "command_name": "New Command",
                  "blob": "P:Sony12 R:40000 D:1 F:18 MUL:2",
              },
          )
      )
    finally:
      loop.close()

    assert conn.result is None
    assert conn.error == (
        7,
        "unavailable",
        "Hub is not ready to persist IR blob (proxy client connected?)",
    )
