"""The live ``inputs_write`` sync step.

"Set input" in an activity's power-on sequence can pick a command the
device does not list as an input yet; the editor appends an entry to the
device's ``input_record`` and the plan carries an ``inputs_write`` step.
The step must make the hub agree: set the head's ``input_mode`` on a
device that was never configured, append to the hub's own record, write
the family-0x46 page, and read it back. Only an append is written.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

import pytest

import custom_components.sofabaton_x1s.lib.proxy_activity_sync as pas
from custom_components.sofabaton_x1s.lib.device_create import FAMILY_DEVICE_UPDATE, FAMILY_INPUTS
from custom_components.sofabaton_x1s.lib.devices import DeviceConfig, build_device_create_payload, parse_device_record
from custom_components.sofabaton_x1s.lib.inputs import parse_inputs_burst
from custom_components.sofabaton_x1s.lib.proxy_activity_sync import ActivitySyncMixin
from custom_components.sofabaton_x1s.lib.proxy_restore import RestoreMixin

DEVICE_ID = 7


def _entry(command_id: int, ordinal: int, name: str) -> dict:
    return {"command_id": command_id, "input_index": ordinal, "fid": 20000 + command_id, "name": name}


def _record(entries: list[dict], *, control: str = "") -> dict:
    return {
        "device_id": DEVICE_ID, "source_id_byte": 1 if entries else 0, "flag_a": 0, "flag_b": 0, "state_byte": 0,
        "entries": entries,
        "control_keys": {"input_list": control, "input_up": "", "input_down": "", "input_confirm": ""},
        "favorites": [""] * 10,
    }


class InputsProxy(ActivitySyncMixin, RestoreMixin):
    """The step's environment: a cached device head, a scripted hub inputs page, captured writes."""

    def __init__(self, *, hub_version: str, input_mode: int, live: dict | None) -> None:
        self._log = logging.getLogger("test.inputs_write")
        self.hub_version = hub_version
        config = DeviceConfig(name="TV", brand="Sony", device_id=DEVICE_ID, input_mode=input_mode)
        self.cached = {"raw_body": build_device_create_payload(config, hub_version=hub_version)[3:], "name": "TV"}
        self.state = SimpleNamespace(entities=lambda kind: {DEVICE_ID: self.cached}, device_input_records={})
        self.live = live
        self.reads = 0
        self.written: list = []
        #: What the hub answers after the page write; None = echo the written page.
        self.read_back: dict | None = None

    def reset_ack_queues(self) -> None:
        pass

    def fetch_device_input_record(self, device_id, *, timeout: float = 5.0):
        self.reads += 1
        return self.live


def _install(monkeypatch, proxy: InputsProxy, *, reject_family: int | None = None) -> None:
    def fake_run_create_sequence(target, steps):
        for step in steps:
            proxy.written.append(step)
            if step.family == reject_family:
                return SimpleNamespace(success=False)
            if step.family == FAMILY_INPUTS:
                # The hub now holds what was written (or what the test scripted).
                parsed = parse_inputs_burst([step.payload], hub_version=proxy.hub_version)
                proxy.live = proxy.read_back or _record(
                    [_entry(e.key_id, e.ordinal or i, e.label) for i, e in enumerate(parsed.entries, start=1)],
                    control=parsed.control_keys.input_list.hex(" "),
                )
        return SimpleNamespace(success=True)

    monkeypatch.setattr(pas, "run_create_sequence", fake_run_create_sequence)


@pytest.mark.parametrize("hub_version", ["X1", "X1S"])
def test_unconfigured_device_gets_its_input_mode_then_the_page(monkeypatch, hub_version):
    proxy = InputsProxy(hub_version=hub_version, input_mode=0, live=None)
    _install(monkeypatch, proxy)

    ok = proxy._sync_step_inputs_write({"device_id": DEVICE_ID, "entries": [_entry(56, 1, "Input hdmi1")]})

    assert ok is True
    # The head first (the hub rejects every inputs request while input_mode is 0), then the page.
    assert [step.family for step in proxy.written] == [FAMILY_DEVICE_UPDATE, FAMILY_INPUTS]
    head = parse_device_record(bytes(proxy.written[0].payload[3:]), hub_version=hub_version, entity_kind="device")
    assert head.input_mode == 1 and head.name == "TV" and head.brand == "Sony" and head.device_id == DEVICE_ID
    page = parse_inputs_burst([proxy.written[1].payload], hub_version=hub_version)
    assert page.device_id == DEVICE_ID and page.source_id_byte == 1
    assert [(e.key_id, e.fid, e.label) for e in page.entries] == [(56, 20056, "Input hdmi1")]
    # The cached head and the cached record follow, so the next capture agrees without a hub read.
    cached = parse_device_record(bytes(proxy.cached["raw_body"]), hub_version=hub_version, entity_kind="device")
    assert cached.input_mode == 1
    assert [row["command_id"] for row in proxy.state.device_input_records[DEVICE_ID]["entries"]] == [56]
    # An unconfigured device is never asked for its page before the write (the hub would reject it).
    assert proxy.reads == 1


def test_append_keeps_the_hubs_entries_and_trailing_rows(monkeypatch):
    live = _record([_entry(3, 1, "HDMI 1"), _entry(4, 2, "HDMI 2")], control="01 02 03")
    proxy = InputsProxy(hub_version="X1S", input_mode=1, live=live)
    _install(monkeypatch, proxy)

    # The editor's copy is older than the hub's labels; the hub's own rows are written back.
    desired = [_entry(3, 1, "stale label"), _entry(4, 2, "HDMI 2"), _entry(9, 3, "Input tv")]
    ok = proxy._sync_step_inputs_write({"device_id": DEVICE_ID, "entries": desired})

    assert ok is True
    assert [step.family for step in proxy.written] == [FAMILY_INPUTS]      # already configured: no head write
    page = parse_inputs_burst([proxy.written[0].payload], hub_version="X1S")
    assert [(e.key_id, e.ordinal, e.label) for e in page.entries] == [(3, 1, "HDMI 1"), (4, 2, "HDMI 2"), (9, 3, "Input tv")]
    assert page.control_keys.input_list == bytes.fromhex("010203").ljust(9, bytes(1))


def test_a_removal_or_reorder_is_left_alone(monkeypatch):
    """Activities address an input by position: only an append is safe to write live."""

    live = _record([_entry(3, 1, "HDMI 1"), _entry(4, 2, "HDMI 2")])
    for desired in ([_entry(4, 2, "HDMI 2")], [_entry(4, 1, "HDMI 2"), _entry(3, 2, "HDMI 1")], list(live["entries"])):
        proxy = InputsProxy(hub_version="X1S", input_mode=1, live=live)
        _install(monkeypatch, proxy)
        assert proxy._sync_step_inputs_write({"device_id": DEVICE_ID, "entries": desired}) is True
        assert proxy.written == []


def test_failures_stop_the_sync(monkeypatch):
    added = {"device_id": DEVICE_ID, "entries": [_entry(3, 1, "HDMI 1"), _entry(9, 2, "Input tv")]}

    # A configured device whose page cannot be read: an append could drop what the hub holds.
    proxy = InputsProxy(hub_version="X1S", input_mode=1, live=None)
    _install(monkeypatch, proxy)
    assert proxy._sync_step_inputs_write(added) is False and proxy.written == []

    # The hub rejects the head write: no page is attempted.
    proxy = InputsProxy(hub_version="X1S", input_mode=0, live=None)
    _install(monkeypatch, proxy, reject_family=FAMILY_DEVICE_UPDATE)
    assert proxy._sync_step_inputs_write({"device_id": DEVICE_ID, "entries": [_entry(9, 1, "Input tv")]}) is False
    assert [step.family for step in proxy.written] == [FAMILY_DEVICE_UPDATE]

    # The hub rejects the page.
    proxy = InputsProxy(hub_version="X1S", input_mode=1, live=_record([_entry(3, 1, "HDMI 1")]))
    _install(monkeypatch, proxy, reject_family=FAMILY_INPUTS)
    assert proxy._sync_step_inputs_write(added) is False

    # The hub acks the page but reads back without the new entry: an ack is not proof.
    proxy = InputsProxy(hub_version="X1S", input_mode=1, live=_record([_entry(3, 1, "HDMI 1")]))
    proxy.read_back = _record([_entry(3, 1, "HDMI 1")])
    _install(monkeypatch, proxy)
    assert proxy._sync_step_inputs_write(added) is False
    assert DEVICE_ID not in proxy.state.device_input_records

    # No cached head to rebuild from.
    proxy = InputsProxy(hub_version="X1S", input_mode=1, live=None)
    proxy.cached.pop("raw_body")
    _install(monkeypatch, proxy)
    assert proxy._sync_step_inputs_write(added) is False
