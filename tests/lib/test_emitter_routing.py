"""X2 IR emitter routing (IR emitter pill plan, IR0): the routing bytes, the
paired-row fields the picker needs, and the engine and facade reads of the
port cables and the paired list. Nothing here is bench-validated yet; the
frames are the candidate forms the plan's gates B6/B12 will check."""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import sys
import types
from pathlib import Path

import pytest

LIB_DIR = Path(__file__).resolve().parents[2] / "custom_components" / "sofabaton_x1s" / "lib"


def _load_lib() -> types.ModuleType:
    name = "sofabaton_emitter_routing_test_pkg"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, LIB_DIR / "__init__.py", submodule_search_locations=[str(LIB_DIR)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_pkg = _load_lib()
routing = importlib.import_module(f"{_pkg.__name__}.emitter_routing")
frames = importlib.import_module(f"{_pkg.__name__}.remote_sync_frames")
devices = importlib.import_module(f"{_pkg.__name__}.devices")
x1_proxy_mod = importlib.import_module(f"{_pkg.__name__}.x1_proxy")
aio = importlib.import_module(f"{_pkg.__name__}.aio")
EmitterRouting = routing.EmitterRouting


# -- routing bytes -------------------------------------------------------------


@pytest.mark.parametrize(
    "c, hub",
    [(0x00, "none"), (0x01, "builtin"), (0x02, "port1"), (0x04, "port2"), (0x07, "all"), (0x03, "custom"),
     (0x06, "custom"), (0x05, "custom")],
)
def test_hub_choice_from_the_low_bits(c, hub) -> None:
    decoded = EmitterRouting.decode(0, 0, c)
    assert decoded.hub == hub
    assert decoded.hub_bits == c


def test_remotes_and_repeaters_decode_by_number() -> None:
    # Remotes 1 and 5; repeater 1 all, repeater 2 built-in, repeater 4 port.
    decoded = EmitterRouting.decode(0x00, 0b10_00_01_11, 0b1000_1000 | 0x07)
    assert decoded.hub == "all"
    assert decoded.remotes == (1, 5)
    assert decoded.repeaters == ((1, "all"), (2, "builtin"), (4, "port"))
    assert decoded.repeater(3) is None and decoded.repeater(4) == "port"


def test_every_mask_round_trips_and_keeps_the_rf_byte() -> None:
    for b in range(256):
        for c in range(256):
            assert EmitterRouting.decode(0xA5, b, c).encode() == (0xA5, b, c)


def test_choices_rewrite_only_their_own_bits() -> None:
    start = EmitterRouting.decode(0x3C, 0x00, 0x03)  # custom hub mix, an RF byte
    assert start.hub == "custom"
    assert start.with_hub("all").encode() == (0x3C, 0x00, 0x07)
    assert start.with_hub("none").with_remote(2, True).encode() == (0x3C, 0x00, 0x10)
    assert start.with_repeater(3, "port").encode() == (0x3C, 0b10_0000, 0x03)
    assert start.with_repeater(3, "all").with_repeater(3, None).encode() == (0x3C, 0x00, 0x03)
    assert start.with_remote(1, True).with_remote(1, False).encode() == start.encode()


def test_choices_refuse_what_the_mask_cannot_hold() -> None:
    plain = EmitterRouting.decode(0, 0, 1)
    with pytest.raises(ValueError):
        plain.with_hub("custom")
    with pytest.raises(ValueError):
        plain.with_remote(6, True)
    with pytest.raises(ValueError):
        plain.with_repeater(0, "all")
    with pytest.raises(ValueError):
        plain.with_repeater(1, "both")


def test_empty_and_remote_only() -> None:
    assert EmitterRouting.decode(0xFF, 0, 0).is_empty  # the RF byte is no emitter
    assert not EmitterRouting.decode(0, 0, 0x01).is_empty
    assert EmitterRouting.decode(0, 0, 0x08).is_remote_only
    assert not EmitterRouting.decode(0, 0x01, 0x08).is_remote_only
    assert not EmitterRouting.decode(0, 0, 0x09).is_remote_only


def test_to_dict() -> None:
    assert EmitterRouting.decode(0, 0x03, 0x0F).to_dict() == {
        "hub": "all", "remotes": [1], "repeaters": {"1": "all"}, "bytes": "00030f",
    }


def test_paired_bits_map_to_numbers() -> None:
    assert [routing.remote_number(1 << bit) for bit in range(3, 8)] == [1, 2, 3, 4, 5]
    assert [routing.repeater_number(slot) for slot in (0x01, 0x04, 0x10, 0x40)] == [1, 2, 3, 4]
    assert routing.remote_number(0x04) is None and routing.repeater_number(0x02) is None


def test_record_emitters_reads_the_x2_tail() -> None:
    config = devices.DeviceConfig(
        name="TV", extras_present=True, extra_a=0x00, extra_b=0x0C, extra_c=0x0A
    )
    body = devices.build_device_create_payload(config, hub_version="X2")[3:]
    assert devices.record_emitters(body, hub_version="X2") == (0x00, 0x0C, 0x0A)
    parsed = devices.parse_device_record(body, hub_version="X2", entity_kind="device")
    assert (parsed.extra_a, parsed.extra_b, parsed.extra_c) == (0x00, 0x0C, 0x0A)
    assert devices.record_emitters(body, hub_version="X1S") is None
    no_marker = devices.build_device_create_payload(devices.DeviceConfig(name="TV"), hub_version="X2")[3:]
    assert devices.record_emitters(no_marker, hub_version="X2") is None
    assert devices.record_emitters(body[:100], hub_version="X2") is None


# -- paired rows ---------------------------------------------------------------


def _row(index: int, count: int, row_type: int, slot: int, *, online: bool = True, custom: bytes = bytes(7),
         name: bytes = b"") -> bytes:
    bits = [0, 0, 0]
    bits[{2: 0, 1: 1}.get(row_type, 2)] = slot
    return (bytes([index, count, *bits, 90, 3]) + bytes(4) + bytes([9, row_type, 1 if online else 0])
            + custom + name.ljust(30, b"\x00"))


def test_repeater_row_carries_its_cable_and_number() -> None:
    row = frames.parse_x2_paired_row(_row(1, 2, 1, 0x04, custom=b"\x01" + bytes(6), name=b"Cabinet"))
    assert row.is_repeater and not row.is_remote
    assert (row.number, row.port_cable, row.name) == (2, True, "Cabinet")
    unplugged = frames.parse_x2_paired_row(_row(1, 1, 1, 0x01))
    assert (unplugged.number, unplugged.port_cable) == (1, False)


def test_remote_and_rf_rows() -> None:
    remote = frames.parse_x2_paired_row(_row(1, 1, 0, 0x10, custom=b"\x01" + bytes.fromhex("aabbccddeeff")))
    assert (remote.number, remote.port_cable, remote.mac) == (2, None, "aabbccddeeff")
    button = frames.parse_x2_paired_row(_row(1, 1, 2, 0x02))
    assert (button.number, button.port_cable) == (None, None)


# -- engine reads --------------------------------------------------------------


class _Sock:
    pass


def _engine(hub_version: str = "X2"):
    engine = x1_proxy_mod.X1Proxy("127.0.0.1", hub_version=hub_version, proxy_enabled=False)
    with engine.transport._hub_lock:
        engine.transport._hub_sock = _Sock()
    engine._notify_hub_state(True)
    return engine


def _answer(engine, monkeypatch, replies: dict[int, list[tuple[int, bytes]]], sent: list) -> None:
    """Answer each sent family with its queued ``(opcode, payload)`` frames."""

    def send(family, payload):
        sent.append((family, bytes(payload)))
        for opcode, reply in replies.get(family, []):
            engine.notify_ack(opcode, reply)

    monkeypatch.setattr(engine, "_send_family_frame", send)


def _row_frame(*args, **kwargs) -> tuple[int, bytes]:
    payload = _row(*args, **kwargs)
    return (len(payload) << 8) | 0x2F, payload


def test_read_paired_devices_collects_rows_until_the_last(monkeypatch) -> None:
    engine = _engine()
    sent: list = []
    replies = {0x2E: [
        (0x0103, b"\x00"),            # an accepting status first is not the answer
        (0x112F, bytes(17)),          # a short remote-info frame is not a row
        _row_frame(1, 2, 0, 0x08, name=b"X2 Remote"),
        _row_frame(2, 2, 1, 0x01, custom=b"\x01" + bytes(6), name=b"Cabinet"),
    ]}
    _answer(engine, monkeypatch, replies, sent)
    rows = engine.read_x2_paired_devices(timeout=1.0)
    assert sent == [(0x2E, b"\x01")]
    assert [(row.name, row.number) for row in rows] == [("X2 Remote", 1), ("Cabinet", 1)]
    assert engine.read_x2_paired_devices(fresh=False, timeout=1.0) is not None
    assert sent[-1] == (0x2E, b"\x00")


def test_read_paired_devices_empty_busy_and_incomplete(monkeypatch) -> None:
    engine = _engine()
    sent: list = []
    _answer(engine, monkeypatch, {0x2E: [(0x0103, b"\x07")]}, sent)
    assert engine.read_x2_paired_devices(timeout=0.5) == []
    _answer(engine, monkeypatch, {0x2E: [(0x0103, b"\x11")]}, sent)
    assert engine.read_x2_paired_devices(timeout=0.5) is None
    _answer(engine, monkeypatch, {0x2E: [_row_frame(1, 2, 0, 0x08)]}, sent)
    assert engine.read_x2_paired_devices(timeout=0.3) is None
    assert _engine("X1S").read_x2_paired_devices(timeout=0.1) is None


def test_emitter_status_read_is_kept(monkeypatch) -> None:
    engine = _engine()
    sent: list = []
    assert engine.last_ir_emitter_status() is None
    _answer(engine, monkeypatch, {
        0x2E: [_row_frame(1, 1, 1, 0x04, name=b"Cabinet")],
    }, sent)
    status = engine.read_ir_emitter_status()
    assert [family for family, _payload in sent] == [0x2E]
    assert set(status) == {"paired", "read_at"}
    assert [row.name for row in status["paired"]] == ["Cabinet"]
    kept = engine.last_ir_emitter_status()
    assert kept["read_at"] == status["read_at"]
    assert _engine("X1S").read_ir_emitter_status() is None


# -- facade --------------------------------------------------------------------


class _Engine:
    """Just enough engine for AsyncXProxy.ir_emitter_status."""

    class _Transport:
        is_hub_connected = True

    def __init__(self, hub_version: str = "X2") -> None:
        self.hub_version = hub_version
        self.transport = _Engine._Transport()
        self.kept = None
        self.reads = 0

    def can_issue_commands(self) -> bool:
        return True

    def read_ir_emitter_status(self):
        self.reads += 1
        self.kept = {
            "paired": [
                frames.parse_x2_paired_row(_row(1, 3, 0, 0x08, name=b"X2 Remote")),
                frames.parse_x2_paired_row(_row(2, 3, 1, 0x10, online=False, name=b"Bedroom")),
                frames.parse_x2_paired_row(_row(3, 3, 2, 0x01, name=b"Button")),
            ],
            "read_at": 1700000000.0,
        }
        return self.kept

    def last_ir_emitter_status(self):
        return self.kept


def _facade(engine) -> object:
    facade = object.__new__(aio.AsyncXProxy)
    facade._proxy = engine
    facade._loop = asyncio.get_running_loop()
    facade._hub_holds = 0
    facade._hub_held_by = None
    return facade


def test_facade_status_reads_then_serves_the_kept_read() -> None:
    async def run() -> None:
        engine = _Engine()
        facade = _facade(engine)
        assert await facade.ir_emitter_status(refresh=False) is None
        status = await facade.ir_emitter_status()
        assert engine.reads == 1
        assert set(status.to_dict()) == {"paired", "read_at"}
        assert [(d.kind, d.number, d.name, d.online, d.port_cable) for d in status.paired] == [
            ("remote", 1, "X2 Remote", True, None),
            ("repeater", 3, "Bedroom", False, False),
        ]
        assert status.to_dict()["paired"][1] == {
            "kind": "repeater", "number": 3, "name": "Bedroom", "online": False, "port_cable": False,
        }
        kept = await facade.ir_emitter_status(refresh=False)
        assert engine.reads == 1 and kept == status
        assert await _facade(_Engine("X1S")).ir_emitter_status() is None

    asyncio.run(run())


def test_device_model_carries_the_x2_routing() -> None:
    body = devices.build_device_create_payload(
        devices.DeviceConfig(name="Projector", device_id=3, extra_c=0x04, extras_present=True), hub_version="X2"
    )[3:]
    row = {"name": "Projector", "device_class": "ir", "raw_body": body}
    assert aio._device_from_row(3, row, "X2").emitters == (0, 0, 0x04)
    assert aio._device_from_row(3, row, "X2").to_dict()["emitters"] == (0, 0, 0x04)
    assert aio._device_from_row(3, row, "X1S").emitters is None
    assert aio._device_from_row(3, {"name": "Projector"}, "X2").emitters is None
