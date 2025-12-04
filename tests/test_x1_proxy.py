"""Tests for x1_proxy helpers."""

from custom_components.sofabaton_x1s.lib.protocol_const import OP_REQ_COMMANDS
from custom_components.sofabaton_x1s.lib.state_helpers import ActivityCache
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def test_ensure_commands_for_activity_groups_by_device(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    cache = ActivityCache()
    act = 0x10
    cache.activity_command_refs[act] = {
        (0x01, 0x1111),
        (0x01, 0x2222),
        (0x02, 0x3333),
    }
    proxy.state = cache

    calls: list[tuple[int, int, bool]] = []

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        calls.append((ent_id, command_id, fetch_if_missing))
        mappings = {
            (0x01, 0x1111): ({0x1111: "one"}, True),
            (0x01, 0x2222): ({0x2222: "two"}, False),
            (0x02, 0x3333): ({0x3333: "three"}, True),
        }
        return mappings.get((ent_id, command_id), ({}, False))

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is False
    assert set(calls) == {
        (0x01, 0x1111, True),
        (0x01, 0x2222, True),
        (0x02, 0x3333, True),
    }
    assert commands_by_device == {
        0x01: {0x1111: "one", 0x2222: "two"},
        0x02: {0x3333: "three"},
    }


def test_get_single_command_for_entity_uses_cache(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.state.commands[0x02] = {0x1234: "Cmd"}

    enqueue_called = False

    def fake_enqueue(*args, **kwargs):
        nonlocal enqueue_called
        enqueue_called = True

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)

    commands, ready = proxy.get_single_command_for_entity(0x02, 0x1234)

    assert ready is True
    assert commands == {0x1234: "Cmd"}
    assert enqueue_called is False


def test_get_single_command_for_entity_enqueues_targeted_request(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    enqueued: list[tuple[int, bytes, bool, str | None]] = []

    def fake_enqueue(opcode, payload, expects_burst=False, burst_kind=None):
        enqueued.append((opcode, payload, expects_burst, burst_kind))

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    command_id = 0x0A0B0C0D
    commands, ready = proxy.get_single_command_for_entity(0x12, command_id)

    assert commands == {}
    assert ready is False
    assert enqueued == [
        (
            OP_REQ_COMMANDS,
            bytes([0x12]) + command_id.to_bytes(4, "little"),
            True,
            "commands:18:168496141",
        )
    ]

