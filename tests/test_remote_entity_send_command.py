import asyncio
import importlib
from types import SimpleNamespace

import pytest


def _build_remote_module():
    module_name = "custom_components.sofabaton_x1s.remote"
    return importlib.import_module(module_name)


class _Hub:
    """Minimal hub double that records the order of sends and waits."""

    def __init__(self, trace):
        self._trace = trace
        self.entry_id = "entry-id"
        self.mac = "AABBCCDDEEFF"

    async def async_send_key(self, key, device=None):
        self._trace.append(("send", key, device))


def _build_entity(trace):
    remote_mod = _build_remote_module()
    entry = SimpleNamespace(
        entry_id="entry-id",
        data={"mac": "AABBCCDDEEFF"},
    )
    return remote_mod, remote_mod.SofabatonRemote(_Hub(trace), entry)


@pytest.fixture
def loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        yield loop
    finally:
        loop.close()


@pytest.fixture
def trace(monkeypatch):
    """Record sends and waits in a single ordered list."""
    entries = []

    async def _fake_sleep(delay, *args, **kwargs):
        entries.append(("sleep", delay))

    monkeypatch.setattr(asyncio, "sleep", _fake_sleep)
    return entries


def test_send_command_without_delay_secs_sends_back_to_back(loop, trace):
    _, entity = _build_entity(trace)

    loop.run_until_complete(entity.async_send_command(["HOME", "MENU"]))

    assert trace == [("send", "HOME", None), ("send", "MENU", None)]


def test_send_command_waits_between_commands(loop, trace):
    _, entity = _build_entity(trace)

    loop.run_until_complete(
        entity.async_send_command(["HOME", "MENU", "OK"], delay_secs=0.5)
    )

    # The wait sits between commands only, never before the first or after the
    # last one.
    assert trace == [
        ("send", "HOME", None),
        ("sleep", 0.5),
        ("send", "MENU", None),
        ("sleep", 0.5),
        ("send", "OK", None),
    ]


def test_send_command_delay_secs_applies_to_direct_targets(loop, trace):
    _, entity = _build_entity(trace)

    loop.run_until_complete(
        entity.async_send_command(["12", "15"], device="3", delay_secs=2)
    )

    assert trace == [
        ("send", "12", "3"),
        ("sleep", 2.0),
        ("send", "15", "3"),
    ]


def test_send_command_single_command_never_waits(loop, trace):
    _, entity = _build_entity(trace)

    loop.run_until_complete(entity.async_send_command("VOL_UP", delay_secs=5))

    assert trace == [("send", "VOL_UP", None)]


@pytest.mark.parametrize("delay", [0, 0.0, -1])
def test_send_command_non_positive_delay_does_not_wait(loop, trace, delay):
    _, entity = _build_entity(trace)

    loop.run_until_complete(
        entity.async_send_command(["HOME", "MENU"], delay_secs=delay)
    )

    assert trace == [("send", "HOME", None), ("send", "MENU", None)]
