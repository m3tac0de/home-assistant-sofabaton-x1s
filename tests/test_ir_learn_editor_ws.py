"""Tests for the payload editor's learn mode backend (IR9).

Covers the cancellable learn exchange (``X1Proxy.cancel_ir_learn``), the
``ir_learn/subscribe`` WebSocket command (listener: one window per
subscription, unsubscribe cancels), the ``ir_emissions/subscribe``
command (inbox: replay on connect + fan-out on every emitter send), and
``build_ir_emitter_consumers`` (config-entry inspection that gates the
"from Home Assistant" option and names the consumer entities).
"""

from __future__ import annotations

import asyncio
import importlib
import threading
from types import SimpleNamespace

from homeassistant.exceptions import HomeAssistantError

from custom_components.sofabaton_x1s.lib.protocol_const import (
    OP_IR_LEARN_ENTER,
    OP_IR_LEARN_EXIT,
    OP_STATUS_ACK,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")

_ACK_OK = (OP_STATUS_ACK, b"\x00")


def _new_proxy() -> X1Proxy:
    return X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)


def _arm_proxy(proxy: X1Proxy, monkeypatch, *, acks) -> list[tuple[int, bytes]]:
    sent: list[tuple[int, bytes]] = []
    remaining = list(acks)
    monkeypatch.setattr(
        proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload))
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, *, timeout=5.0, not_before=None: (
            remaining.pop(0) if remaining else None
        ),
    )
    return sent


# ---------------------------------------------------------------------------
# Proxy: cancel
# ---------------------------------------------------------------------------


def test_cancel_ends_the_learn_window_and_disarms(monkeypatch) -> None:
    proxy = _new_proxy()
    sent = _arm_proxy(proxy, monkeypatch, acks=[_ACK_OK, _ACK_OK, _ACK_OK])
    outcome: list[bool] = []
    timer = threading.Timer(0.05, lambda: outcome.append(proxy.cancel_ir_learn()))
    timer.start()
    try:
        result = proxy.ir_learn_command(timeout=5.0)
    finally:
        timer.cancel()

    assert result == {"state": "cancelled"}
    assert outcome == [True]
    # Cancel leaves the hub armed, so an explicit EXIT follows.
    assert sent == [
        (OP_IR_LEARN_EXIT, b""),
        (OP_IR_LEARN_ENTER, b""),
        (OP_IR_LEARN_EXIT, b""),
    ]
    assert proxy._ir_learn_pending is None


def test_cancel_without_a_window_is_a_noop() -> None:
    proxy = _new_proxy()
    assert proxy.cancel_ir_learn() is False


# ---------------------------------------------------------------------------
# WebSocket plumbing
# ---------------------------------------------------------------------------


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None
        self.messages = []
        self.subscriptions = {}

    def send_result(self, msg_id, payload=None):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)

    def send_message(self, payload):
        self.messages.append(payload)


class _Hub:
    entry_id = "entry-1"

    def __init__(self, learn_result=None):
        self.learn_result = learn_result
        self.learn_calls: list[float] = []
        self.cancel_calls = 0
        self.release: asyncio.Event | None = None
        self.emissions = [
            {"label": "Samsung32Command (0123abcd)", "payload_hex": "aabb", "when": "t1", "count": 1}
        ]

    async def async_ir_learn_command(self, *, timeout: float = 60.0):
        self.learn_calls.append(timeout)
        if self.release is not None:
            await self.release.wait()
        return self.learn_result

    def cancel_ir_learn(self) -> bool:
        self.cancel_calls += 1
        if self.release is not None:
            self.release.set()
        return True

    def get_ir_emissions(self):
        return [dict(rec) for rec in self.emissions]


def _wire(monkeypatch, hub):
    async def fake_resolve(_hass, data):
        assert data["entry_id"] == "entry-1"
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(
        integration, "_raise_if_hub_operation_locked", lambda *args, **kwargs: None
    )
    monkeypatch.setattr(
        integration.websocket_api,
        "event_message",
        lambda msg_id, payload: {"id": msg_id, "event": payload},
        raising=False,
    )


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def test_learn_subscribe_pushes_listening_then_the_outcome(monkeypatch) -> None:
    hub = _Hub(learn_result={"state": "learned", "payload_hex": "02 20 00 00"})
    conn = _Conn()
    _wire(monkeypatch, hub)

    _run(
        integration._ws_ir_learn_subscribe(
            SimpleNamespace(data={}), conn, {"id": 7, "entry_id": "entry-1", "timeout": 30}
        )
    )

    assert conn.error is None
    assert conn.result == (7, None)
    assert hub.learn_calls == [30.0]
    assert conn.messages == [
        {"id": 7, "event": {"state": "listening", "timeout_s": 30.0}},
        {"id": 7, "event": {"state": "learned", "payload_hex": "02 20 00 00"}},
    ]
    # A late unsubscribe (card closes after the outcome) must not cancel
    # a window that already ended.
    conn.subscriptions[7]()
    assert hub.cancel_calls == 0


def test_learn_subscribe_clamps_the_timeout(monkeypatch) -> None:
    hub = _Hub(learn_result={"state": "timed_out", "timeout_s": 120.0})
    conn = _Conn()
    _wire(monkeypatch, hub)

    _run(
        integration._ws_ir_learn_subscribe(
            SimpleNamespace(data={}), conn, {"id": 1, "entry_id": "entry-1", "timeout": 900}
        )
    )
    assert hub.learn_calls == [120.0]

    _run(
        integration._ws_ir_learn_subscribe(
            SimpleNamespace(data={}), conn, {"id": 2, "entry_id": "entry-1"}
        )
    )
    assert hub.learn_calls == [120.0, 60.0]


def test_learn_subscribe_reports_a_refused_arm(monkeypatch) -> None:
    hub = _Hub(learn_result=None)
    conn = _Conn()
    _wire(monkeypatch, hub)

    _run(
        integration._ws_ir_learn_subscribe(
            SimpleNamespace(data={}), conn, {"id": 1, "entry_id": "entry-1"}
        )
    )

    assert conn.messages[-1]["event"]["state"] == "refused"
    assert "arm" in conn.messages[-1]["event"]["message"]


def test_learn_subscribe_unsubscribe_cancels_a_pending_window(monkeypatch) -> None:
    hub = _Hub(learn_result={"state": "cancelled"})
    conn = _Conn()
    _wire(monkeypatch, hub)

    async def scenario():
        hub.release = asyncio.Event()
        task = asyncio.ensure_future(
            integration._ws_ir_learn_subscribe(
                SimpleNamespace(data={}), conn, {"id": 3, "entry_id": "entry-1"}
            )
        )
        # Let the handler arm and publish "listening".
        for _ in range(10):
            await asyncio.sleep(0)
        assert conn.messages == [{"id": 3, "event": {"state": "listening", "timeout_s": 60.0}}]
        assert 3 in conn.subscriptions
        # Socket closed / card cancelled: HA invokes the subscription's unsub.
        conn.subscriptions[3]()
        await task

    _run(scenario())

    assert hub.cancel_calls == 1
    assert conn.messages[-1] == {"id": 3, "event": {"state": "cancelled"}}


def test_learn_subscribe_refuses_while_the_hub_is_busy(monkeypatch) -> None:
    hub = _Hub(learn_result={"state": "learned"})
    conn = _Conn()
    _wire(monkeypatch, hub)

    def locked(*_args, **_kwargs):
        raise HomeAssistantError("device sync in progress")

    monkeypatch.setattr(integration, "_raise_if_hub_operation_locked", locked)

    _run(
        integration._ws_ir_learn_subscribe(
            SimpleNamespace(data={}), conn, {"id": 1, "entry_id": "entry-1"}
        )
    )

    assert conn.error == (1, "unavailable", "device sync in progress")
    assert hub.learn_calls == []
    assert conn.messages == []


def test_learn_subscribe_surfaces_exceptions_as_error_state(monkeypatch) -> None:
    hub = _Hub()
    conn = _Conn()
    _wire(monkeypatch, hub)

    async def boom(*, timeout=60.0):
        raise RuntimeError("transport gone")

    hub.async_ir_learn_command = boom  # type: ignore[assignment]

    _run(
        integration._ws_ir_learn_subscribe(
            SimpleNamespace(data={}), conn, {"id": 1, "entry_id": "entry-1"}
        )
    )

    assert conn.messages[-1] == {
        "id": 1,
        "event": {"state": "error", "message": "transport gone"},
    }


def test_emissions_subscribe_replays_now_and_on_every_send(monkeypatch) -> None:
    hub = _Hub()
    conn = _Conn()
    _wire(monkeypatch, hub)
    connected = {}

    def fake_connect(_hass, signal, target):
        connected["signal"] = signal
        connected["target"] = target
        return lambda: connected.setdefault("unsubscribed", True)

    monkeypatch.setattr(integration, "async_dispatcher_connect", fake_connect)

    _run(
        integration._ws_ir_emissions_subscribe(
            SimpleNamespace(data={}), conn, {"id": 5, "entry_id": "entry-1"}
        )
    )

    assert conn.error is None
    assert conn.result == (5, None)
    assert connected["signal"] == "sofabaton_x1s_ir_intercept_entry-1"
    assert conn.messages == [{"id": 5, "event": {"emissions": hub.emissions}}]

    hub.emissions.append(
        {"label": "ProntoHexCommand (deadbeef)", "payload_hex": "ccdd", "when": "t2", "count": 3}
    )
    connected["target"]()
    assert len(conn.messages) == 2
    assert conn.messages[1]["event"]["emissions"][-1]["payload_hex"] == "ccdd"

    conn.subscriptions[5]()
    assert connected["unsubscribed"] is True


# ---------------------------------------------------------------------------
# Consumer discovery
# ---------------------------------------------------------------------------


class _RegEntry:
    def __init__(self, entity_id, domain, *, name=None, original_name=None, disabled_by=None):
        self.entity_id = entity_id
        self.domain = domain
        self.name = name
        self.original_name = original_name
        self.disabled_by = disabled_by


class _States:
    def __init__(self, friendly: dict[str, str]):
        self._friendly = friendly

    def get(self, entity_id):
        if entity_id not in self._friendly:
            return None
        return SimpleNamespace(attributes={"friendly_name": self._friendly[entity_id]})


def _hass_with_entries(entries, friendly=None):
    return SimpleNamespace(
        config_entries=SimpleNamespace(async_entries=lambda: list(entries)),
        states=_States(friendly or {}),
    )


def _registry(monkeypatch, per_entry: dict[str, list]):
    monkeypatch.setattr(integration.er, "async_get", lambda hass=None: object(), raising=False)
    monkeypatch.setattr(
        integration.er,
        "async_entries_for_config_entry",
        lambda _registry, entry_id: list(per_entry.get(entry_id, [])),
        raising=False,
    )


def test_consumers_unavailable_without_the_infrared_platform(monkeypatch) -> None:
    monkeypatch.setattr(integration, "infrared_platform_available", lambda: False)
    hub = _Hub()
    result = integration.build_ir_emitter_consumers(_hass_with_entries([]), hub)
    assert result == {"available": False, "emitter_entity_id": None, "consumers": []}


def test_consumers_unavailable_without_an_emitter_entity(monkeypatch) -> None:
    monkeypatch.setattr(integration, "infrared_platform_available", lambda: True)
    _registry(monkeypatch, {"entry-1": [_RegEntry("sensor.x1_hub_ir_intercept", "sensor")]})
    hub = _Hub()
    result = integration.build_ir_emitter_consumers(_hass_with_entries([]), hub)
    assert result["available"] is False


def test_consumers_are_found_by_config_entry_inspection(monkeypatch) -> None:
    monkeypatch.setattr(integration, "infrared_platform_available", lambda: True)
    emitter = "infrared.x1_hub_ir_emitter"
    ours = SimpleNamespace(entry_id="entry-1", domain=integration.DOMAIN, title="X1 Hub", data={}, options={})
    samsung = SimpleNamespace(
        entry_id="samsung-1",
        domain="samsung_infrared",
        title="Samsung TV",
        data={"infrared_emitter_entity_id": emitter, "device_type": "tv"},
        options={},
    )
    climate = SimpleNamespace(
        entry_id="ac-1",
        domain="ir_climate",
        title="Bedroom AC",
        data={},
        options={"emitter": {"entity_id": emitter}},
    )
    other = SimpleNamespace(
        entry_id="other-1",
        domain="samsung_infrared",
        title="Other TV",
        data={"infrared_emitter_entity_id": "infrared.some_other_emitter"},
        options={},
    )
    _registry(
        monkeypatch,
        {
            "entry-1": [
                _RegEntry("sensor.x1_hub_ir_intercept", "sensor"),
                _RegEntry(emitter, "infrared"),
            ],
            "samsung-1": [
                _RegEntry("remote.samsung_tv", "remote", original_name="Remote"),
                _RegEntry("switch.samsung_tv_hidden", "switch", disabled_by="user"),
            ],
            "ac-1": [_RegEntry("climate.bedroom_ac", "climate", name="Bedroom AC")],
        },
    )
    hass = _hass_with_entries(
        [ours, samsung, climate, other], friendly={"remote.samsung_tv": "Samsung TV Remote"}
    )

    result = integration.build_ir_emitter_consumers(hass, _Hub())

    assert result["available"] is True
    assert result["emitter_entity_id"] == emitter
    assert result["consumers"] == [
        {
            "entry_id": "samsung-1",
            "domain": "samsung_infrared",
            "title": "Samsung TV",
            "entities": [{"entity_id": "remote.samsung_tv", "name": "Samsung TV Remote"}],
        },
        {
            "entry_id": "ac-1",
            "domain": "ir_climate",
            "title": "Bedroom AC",
            "entities": [{"entity_id": "climate.bedroom_ac", "name": "Bedroom AC"}],
        },
    ]


def test_consumers_match_read_only_config_entry_mappings(monkeypatch) -> None:
    """Real ConfigEntry.data/options are MappingProxyType, not dict (live finding)."""

    from types import MappingProxyType

    monkeypatch.setattr(integration, "infrared_platform_available", lambda: True)
    emitter = "infrared.x1_hub_ir_emitter"
    samsung = SimpleNamespace(
        entry_id="samsung-1",
        domain="samsung_infrared",
        title="Samsung TV via IR emitter",
        data=MappingProxyType({"device_type": "tv", "infrared_emitter_entity_id": emitter}),
        options=MappingProxyType({}),
    )
    _registry(
        monkeypatch,
        {
            "entry-1": [_RegEntry(emitter, "infrared")],
            "samsung-1": [_RegEntry("remote.samsung_tv", "remote", original_name="Remote")],
        },
    )

    result = integration.build_ir_emitter_consumers(_hass_with_entries([samsung]), _Hub())

    assert [c["entry_id"] for c in result["consumers"]] == ["samsung-1"]
    assert result["consumers"][0]["entities"] == [{"entity_id": "remote.samsung_tv", "name": "Remote"}]


def test_ws_consumers_command_returns_the_discovery(monkeypatch) -> None:
    hub = _Hub()
    conn = _Conn()
    _wire(monkeypatch, hub)
    monkeypatch.setattr(
        integration,
        "build_ir_emitter_consumers",
        lambda _hass, _hub: {"available": True, "emitter_entity_id": "infrared.e", "consumers": []},
    )

    _run(
        integration._ws_ir_emitter_consumers(
            SimpleNamespace(data={}), conn, {"id": 9, "entry_id": "entry-1"}
        )
    )

    assert conn.error is None
    assert conn.result == (
        9,
        {"available": True, "emitter_entity_id": "infrared.e", "consumers": []},
    )
