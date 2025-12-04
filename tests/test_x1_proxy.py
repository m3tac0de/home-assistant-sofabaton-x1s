"""Tests for x1_proxy helpers."""

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

    calls: list[tuple[int, bool]] = []

    def fake_get_commands(ent_id: int, fetch_if_missing: bool = True):
        calls.append((ent_id, fetch_if_missing))
        mappings = {
            0x01: {0x1111: "one", 0x2222: "two"},
            0x02: {0x3333: "three"},
        }
        return (dict(mappings.get(ent_id & 0xFF, {})), True)

    monkeypatch.setattr(proxy, "get_commands_for_entity", fake_get_commands)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is True
    assert calls == [(0x01, True), (0x02, True)]
    assert commands_by_device == {
        0x01: {0x1111: "one", 0x2222: "two"},
        0x02: {0x3333: "three"},
    }

