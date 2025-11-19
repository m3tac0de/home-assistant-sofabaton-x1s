from __future__ import annotations

from custom_components.sofabaton_x1s.lib.state_helpers import BurstScheduler
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
