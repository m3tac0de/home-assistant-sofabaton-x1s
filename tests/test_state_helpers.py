from __future__ import annotations

from custom_components.sofabaton_x1s.lib.protocol_const import ButtonName
from custom_components.sofabaton_x1s.lib.state_helpers import ActivityCache, BurstScheduler
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


def test_burst_scheduler_drains_queue_and_notifies() -> None:
    sent: list[tuple[int, bytes]] = []
    notifications: list[str] = []

    scheduler = BurstScheduler(idle_s=0, response_grace=0)
    scheduler.on_burst_end("foo", lambda key: notifications.append(key))

    scheduler.queue_or_send(
        opcode=1,
        payload=b"a",
        expects_burst=True,
        burst_kind="foo",
        can_issue=lambda: True,
        sender=lambda op, payload: sent.append((op, payload)),
        now=0.0,
    )
    scheduler.queue_or_send(
        opcode=2,
        payload=b"b",
        expects_burst=False,
        burst_kind=None,
        can_issue=lambda: True,
        sender=lambda op, payload: sent.append((op, payload)),
        now=0.0,
    )

    scheduler.tick(1.0, can_issue=lambda: True, sender=lambda op, payload: sent.append((op, payload)))

    assert sent == [(1, b"a"), (2, b"b")]
    assert notifications == ["foo"]


def test_state_listeners_receive_notifications() -> None:
    proxy = X1Proxy("1.1.1.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False)

    hub_states: list[bool] = []
    client_states: list[bool] = []

    proxy.on_hub_state_change(hub_states.append)
    proxy.on_client_state_change(client_states.append)

    proxy._notify_hub_state(True)
    proxy._notify_client_state(True)

    assert hub_states == [False, True]
    assert client_states == [False, True]


def test_accumulate_keymap_tracks_favorites_and_commands() -> None:
    cache = ActivityCache()
    act = 0x66
    favorite_button_id = 0x01
    normal_button_id = ButtonName.OK

    rec_fav = bytes(
        [
            act,
            favorite_button_id,
            0x03,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x38,
            0x03,
            0x00,
            0x00,
        ]
        + [0x00] * 6
    )
    rec_normal = bytes(
        [
            act,
            normal_button_id,
            0x04,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x4C,
            0x07,
            0x00,
            0x00,
        ]
        + [0x00] * 6
    )

    cache.accumulate_keymap(act, rec_fav + rec_normal)

    refs = cache.get_activity_command_refs(act)
    assert (0x03, favorite_button_id) in refs
    assert (0x04, favorite_button_id) not in refs

    favorite_slots = cache.get_activity_favorite_slots(act)
    assert any(
        slot["button_id"] == favorite_button_id
        and slot["device_id"] == 0x03
        and slot["command_id"] == favorite_button_id
        for slot in favorite_slots
    )


def test_accumulate_keymap_stops_at_standard_buttons() -> None:
    cache = ActivityCache()
    act = 0x66

    payload = bytes.fromhex(
        "66 01 03 00 00 00 00 00 38 03 00 00 00 00 00 00 00 00"
        " 66 02 03 00 00 00 00 00 4c 07 00 00 00 00 00 00 00 00"
        " 66 ae 01 00 00 00 00 00 2e 16 00 00 00 00 00 00 00 00"
    )

    cache.accumulate_keymap(act, payload)

    favorites = cache.get_activity_favorite_slots(act)
    assert len(favorites) == 2
    assert {slot["button_id"] for slot in favorites} == {0x01, 0x02}

    assert cache.get_activity_command_refs(act) == {(0x03, 0x01), (0x03, 0x02)}

    assert cache.buttons.get(act, set()) == {0xAE}
