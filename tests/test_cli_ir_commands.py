"""Tests for the CLI's IR-payload commands (``testir`` / ``addir``)."""

from importlib import import_module
from pathlib import Path
import asyncio
import sys

import pytest

from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _cli():
    ensure_stub_package("custom_components", ROOT / "custom_components")
    ensure_stub_package(
        "custom_components.sofabaton_x1s",
        ROOT / "custom_components" / "sofabaton_x1s",
    )
    ensure_stub_package(
        "custom_components.sofabaton_x1s.lib",
        ROOT / "custom_components" / "sofabaton_x1s" / "lib",
    )
    return import_module("custom_components.sofabaton_x1s.lib.cli")


# 12 bytes: enough to clear the shell's 10-byte minimum.
PAYLOAD_HEX = "01 20 00 10 01 00 94 ac 00 00 23 0a"
PAYLOAD = bytes.fromhex(PAYLOAD_HEX)


class _StubProxy:
    """Bare-minimum AsyncXProxy stand-in for driving AsyncShell commands."""

    def __init__(self, *, devices=None, persist_result=None, play_ok=True):
        self.calls: list[tuple[str, dict]] = []
        self._devices = devices if devices is not None else {}
        self._persist_result = persist_result
        self._play_ok = play_ok

    # listener registrations done by AsyncShell.__init__
    def on_hub_state_change(self, cb) -> None: ...
    def on_client_state_change(self, cb) -> None: ...
    def on_activity_change(self, cb) -> None: ...

    async def play_ir_blob(self, blob):
        self.calls.append(("play_ir_blob", {"blob": blob}))
        return self._play_ok

    async def devices(self):
        self.calls.append(("devices", {}))
        return self._devices

    async def commands(self, device_id):
        self.calls.append(("commands", {"device_id": device_id}))
        return []

    async def persist_ir_blob(self, **kwargs):
        self.calls.append(("persist_ir_blob", kwargs))
        return self._persist_result


def _run(coro):
    asyncio.run(coro)


def _called(proxy, name):
    return [kwargs for called, kwargs in proxy.calls if called == name]


# ----- parse_payload_hex ---------------------------------------------------


def test_parse_payload_hex_accepts_common_paste_formats() -> None:
    cli = _cli()
    expected = bytes.fromhex("01200010")
    assert cli.parse_payload_hex("01 20 00 10") == expected
    assert cli.parse_payload_hex("01200010") == expected
    assert cli.parse_payload_hex("01,20,00,10") == expected
    assert cli.parse_payload_hex("0x01 0x20 0x00 0x10") == expected
    assert cli.parse_payload_hex("01 20\n00 10\n") == expected


@pytest.mark.parametrize("text", ["zz", "01 2", "0xgg"])
def test_parse_payload_hex_rejects_bad_input(text: str) -> None:
    cli = _cli()
    with pytest.raises(ValueError):
        cli.parse_payload_hex(text)


# ----- testir --------------------------------------------------------------


def test_testir_plays_parsed_payload() -> None:
    cli = _cli()
    proxy = _StubProxy(play_ok=True)
    shell = cli.AsyncShell(proxy)

    _run(shell.cmd_testir(PAYLOAD_HEX))

    assert _called(proxy, "play_ir_blob") == [{"blob": PAYLOAD}]


def test_testir_refuses_short_or_invalid_payload() -> None:
    cli = _cli()
    proxy = _StubProxy()
    shell = cli.AsyncShell(proxy)

    _run(shell.cmd_testir("01 20"))          # too short
    _run(shell.cmd_testir("not hex"))        # not hex
    _run(shell.cmd_testir(""))               # usage

    assert proxy.calls == []


# ----- addir ---------------------------------------------------------------


def test_addir_persists_with_quoted_name_and_fresh_occupancy() -> None:
    cli = _cli()
    proxy = _StubProxy(
        devices={3: {"name": "TV", "device_class": "ir"}},
        persist_result={"command_id": 7, "command_name": "Power Toggle", "page_count": 2},
    )
    shell = cli.AsyncShell(proxy)

    _run(shell.cmd_addir(f'3 "Power Toggle" {PAYLOAD_HEX}'))

    # occupancy is refreshed before the write
    assert _called(proxy, "commands") == [{"device_id": 3}]
    assert _called(proxy, "persist_ir_blob") == [
        {"device_id": 3, "command_name": "Power Toggle", "blob": PAYLOAD}
    ]


def test_addir_refuses_non_ir_device() -> None:
    cli = _cli()
    proxy = _StubProxy(devices={3: {"name": "Plug", "device_class": "wifi_ip"}})
    shell = cli.AsyncShell(proxy)

    _run(shell.cmd_addir(f"3 Toggle {PAYLOAD_HEX}"))

    assert _called(proxy, "persist_ir_blob") == []


def test_addir_refuses_unknown_device() -> None:
    cli = _cli()
    proxy = _StubProxy(devices={1: {"name": "TV", "device_class": "ir"}})
    shell = cli.AsyncShell(proxy)

    _run(shell.cmd_addir(f"9 Toggle {PAYLOAD_HEX}"))

    assert _called(proxy, "persist_ir_blob") == []


def test_addir_usage_and_parse_errors_touch_nothing() -> None:
    cli = _cli()
    proxy = _StubProxy()
    shell = cli.AsyncShell(proxy)

    _run(shell.cmd_addir(""))                       # usage
    _run(shell.cmd_addir("3 Toggle"))               # missing payload
    _run(shell.cmd_addir("x Toggle 01 20"))         # bad device id
    _run(shell.cmd_addir("3 Toggle zz"))            # bad hex
    _run(shell.cmd_addir('3 "Unterminated 01 20'))  # bad quoting

    assert proxy.calls == []
