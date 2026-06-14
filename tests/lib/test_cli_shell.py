"""Coverage for the async CLI shell (lib/cli.py AsyncShell).

Drives command handlers directly against a fake proxy wrapped in the
real AsyncX1Proxy facade — no stdin loop — to verify the UI wires
commands to facade/engine calls and degrades gracefully in observe mode.
"""

from __future__ import annotations

import asyncio
import importlib
import importlib.util
import sys
import types
from pathlib import Path

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)


def _load_lib() -> types.ModuleType:
    name = "sofapython_cli_test_pkg"
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
cli = importlib.import_module(f"{_pkg.__name__}.cli")
aio = importlib.import_module(f"{_pkg.__name__}.aio")
protocol_const = importlib.import_module(f"{_pkg.__name__}.protocol_const")


class _Transport:
    is_hub_connected = True
    is_client_connected = False


class FakeProxy:
    def __init__(self, *, controllable=True):
        self.transport = _Transport()
        self._controllable = controllable
        self.sent: list[tuple[int, int]] = []
        self.found = 0
        self.proxy_enabled = True
        self._acts = {1: {"name": "Watch TV", "active": True}}
        self._cmds = {0xC6: "Power"}

    # listeners
    def on_hub_state_change(self, cb): pass
    def on_client_state_change(self, cb): pass
    def on_activity_change(self, cb): pass

    def can_issue_commands(self): return self._controllable

    # cached getters (ready=True when controllable; observe mode keeps cache)
    def get_activities(self, *, fetch_if_missing=True): return (self._acts, True)
    def get_devices(self, *, fetch_if_missing=True): return ({5: {"name": "TV", "brand": "Sony"}}, True)
    def get_commands_for_entity(self, ent, *, fetch_if_missing=True):
        return (self._cmds, self._controllable)
    def get_buttons_for_entity(self, ent, *, fetch_if_missing=True): return ([0x58], True)
    def get_macros_for_activity(self, act, *, fetch_if_missing=True): return ([], True)

    # actions
    def send_command(self, ent, btn): self.sent.append((ent, btn)); return self._controllable
    def find_remote(self): self.found += 1; return self._controllable
    def enable_proxy(self): self.proxy_enabled = True
    def disable_proxy(self): self.proxy_enabled = False


def _shell(fake):
    proxy = aio.AsyncX1Proxy.wrap(fake)
    return cli.AsyncShell(proxy)


def test_status_reads_cached_state(capsys):
    async def main():
        shell = _shell(FakeProxy())
        await shell.cmd_status("")
    asyncio.run(main())
    out = capsys.readouterr().out
    assert "hub connected   : True" in out
    assert "controllable    : True" in out
    assert "activities      : 1 cached" in out


def test_activities_lists_via_facade(capsys):
    async def main():
        await _shell(FakeProxy()).cmd_activities("")
    asyncio.run(main())
    out = capsys.readouterr().out
    assert "Watch TV" in out


def test_press_resolves_button_name_and_sends():
    fake = FakeProxy()
    async def main():
        await _shell(fake).cmd_press("101 POWER_ON")
    asyncio.run(main())
    assert fake.sent == [(101, protocol_const.ButtonName.POWER_ON)]


def test_start_and_stop_activity_use_power_codes():
    fake = FakeProxy()
    async def main():
        shell = _shell(fake)
        await shell.cmd_start("5")
        await shell.cmd_stop("5")
    asyncio.run(main())
    assert fake.sent == [
        (5, protocol_const.ButtonName.POWER_ON),
        (5, protocol_const.ButtonName.POWER_OFF),
    ]


def test_find_and_proxy_toggle():
    fake = FakeProxy()
    async def main():
        shell = _shell(fake)
        await shell.cmd_find("")
        await shell.cmd_proxy("off")
        await shell.cmd_proxy("on")
    asyncio.run(main())
    assert fake.found == 1
    assert fake.proxy_enabled is True


def test_press_refused_in_observe_mode(capsys):
    fake = FakeProxy(controllable=False)
    async def main():
        await _shell(fake).cmd_press("101 OK")
    asyncio.run(main())
    out = capsys.readouterr().out
    assert "refused" in out


def test_commands_falls_back_to_cache_in_observe_mode(capsys):
    # Not controllable + uncached -> facade raises RuntimeError; shell
    # should catch it and show the cached snapshot instead.
    fake = FakeProxy(controllable=False)
    async def main():
        await _shell(fake).cmd_commands("5")
    asyncio.run(main())
    out = capsys.readouterr().out
    assert "showing cached" in out
    assert "Power" in out


def test_unknown_button_reports(capsys):
    async def main():
        await _shell(FakeProxy()).cmd_press("101 NOPENOTABUTTON")
    asyncio.run(main())
    assert "unknown button" in capsys.readouterr().out
