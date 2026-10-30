"""The IR pill's WebSocket read: ``sofabaton_x1s/ir_emitters/status`` (IR2)."""

from __future__ import annotations

import asyncio
import importlib

from custom_components.sofabaton_x1s.lib.remote_sync_frames import parse_x2_paired_row

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
runtime_module = importlib.import_module("custom_components.sofabaton_x1s.runtime")


def _row(index: int, count: int, row_type: int, slot: int, *, online: bool = True,
         custom: bytes = bytes(7), name: bytes = b"") -> bytes:
    """A paired-list row as the X2 sends it (layout: remote_sync_frames)."""
    bits = [0, 0, 0]
    bits[{2: 0, 1: 1}.get(row_type, 2)] = slot
    return (bytes([index, count, *bits, 90, 3]) + bytes(4) + bytes([9, row_type, 1 if online else 0])
            + custom + name.ljust(30, b"\x00"))


class _Proxy:
    def __init__(self, *, can_issue: bool = True, answer: bool = True) -> None:
        self.can_issue = can_issue
        self.answer = answer
        self.kept = None
        self.reads = 0

    def can_issue_commands(self) -> bool:
        return self.can_issue

    def read_ir_emitter_status(self):
        self.reads += 1
        if not self.answer:
            return {"paired": None, "read_at": 1.0}
        self.kept = {
            "paired": [
                parse_x2_paired_row(_row(1, 3, 0, 0x08, name=b"Remote 1")),
                parse_x2_paired_row(_row(2, 3, 1, 0x04, online=False, custom=b"\x01" + bytes(6), name=b"Bedroom")),
                parse_x2_paired_row(_row(3, 3, 2, 0x01, name=b"Button")),
            ],
            "read_at": 1793000000.0,
        }
        return self.kept

    def last_ir_emitter_status(self):
        return self.kept


class _Hub:
    entry_id = "entry-1"

    def __init__(self, version: str = "X2", **proxy_kwargs) -> None:
        self.version = version
        self._proxy = _Proxy(**proxy_kwargs)
        self.hub_work_active = False


class _Conn:
    def __init__(self) -> None:
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload=None):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


class _Hass:
    data: dict = {}

    async def async_add_executor_job(self, fn, *args):
        return fn(*args)


def _call(monkeypatch, hub, **msg) -> _Conn:
    async def resolve(_hass, _data):
        return hub

    monkeypatch.setattr(runtime_module, "_async_resolve_hub_from_data", resolve)
    monkeypatch.setattr(runtime_module, "_hub_is_busy", lambda _hass, h: bool(h and h.hub_work_active))
    conn = _Conn()
    loop = asyncio.new_event_loop()
    try:
        loop.run_until_complete(
            integration._ws_ir_emitters_status(_Hass(), conn, {"id": 5, "entry_id": "entry-1", **msg})
        )
    finally:
        loop.close()
    return conn


def test_refresh_reads_the_paired_list_and_keeps_it(monkeypatch) -> None:
    hub = _Hub()
    conn = _call(monkeypatch, hub, refresh=True)
    assert conn.error is None
    assert conn.result == (5, {
        "available": True,
        "paired": [
            {"kind": "remote", "number": 1, "name": "Remote 1", "online": True, "port_cable": None},
            {"kind": "repeater", "number": 2, "name": "Bedroom", "online": False, "port_cable": True},
        ],
        "read_at": 1793000000.0,
    })
    # Without refresh: the kept read, no hub traffic.
    again = _call(monkeypatch, hub)
    assert again.result[1]["paired"] == conn.result[1]["paired"] and hub._proxy.reads == 1


def test_no_read_yet_answers_null(monkeypatch) -> None:
    conn = _call(monkeypatch, _Hub())
    assert conn.result == (5, {"available": True, "paired": None, "read_at": None})


def test_refusals(monkeypatch) -> None:
    assert _call(monkeypatch, _Hub("X1S"), refresh=True).error[1] == "not_supported"
    busy = _Hub()
    busy.hub_work_active = True
    assert _call(monkeypatch, busy, refresh=True).error[1] == "busy"
    assert _call(monkeypatch, _Hub(can_issue=False), refresh=True).error[1] == "unavailable"
    assert _call(monkeypatch, _Hub(answer=False), refresh=True).error[1] == "no_answer"
