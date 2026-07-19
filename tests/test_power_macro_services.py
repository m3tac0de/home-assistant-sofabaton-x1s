from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

import pytest

from custom_components.sofabaton_x1s.const import HUB_VERSION_X1, HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.ack import AckOutcome, SendStepResult
from custom_components.sofabaton_x1s.lib.macros import MacroKeyEntry, build_macro_save_payload
from custom_components.sofabaton_x1s.lib.protocol_const import ButtonName
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


def _proxy_with_capture(monkeypatch, hub_version: str) -> tuple[X1Proxy, list[dict]]:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=hub_version,
    )
    exchanges: list[dict] = []

    def _capture(**kwargs):
        exchanges.append(kwargs)
        return SendStepResult(outcome=AckOutcome.acked)

    monkeypatch.setattr(proxy, "execute_exchange", _capture)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)
    return proxy, exchanges


# ---------------------------------------------------------------------------
# proxy: set_device_power_binding
# ---------------------------------------------------------------------------


def test_set_device_power_binding_writes_both_rows(monkeypatch) -> None:
    proxy, exchanges = _proxy_with_capture(monkeypatch, HUB_VERSION_X1S)

    ok = proxy.set_device_power_binding(
        5, power_on_command_id=25, power_off_command_id=26
    )

    assert ok is True
    assert [e["family"] for e in exchanges] == [0x12, 0x12]
    assert [e["ack_opcode"] for e in exchanges] == [0x0112, 0x0112]
    assert [e["ack_first_byte"] for e in exchanges] == [
        ButtonName.POWER_ON,
        ButtonName.POWER_OFF,
    ]

    for exchange, button_id, command_id, label in (
        (exchanges[0], ButtonName.POWER_ON, 25, "POWER_ON"),
        (exchanges[1], ButtonName.POWER_OFF, 26, "POWER_OFF"),
    ):
        expected = build_macro_save_payload(
            activity_id=5,
            key_id=button_id,
            key_sequence=[
                MacroKeyEntry(
                    device_id=5, key_id=command_id, fid=0, duration=0, delay=0
                )
            ],
            label=label,
            hub_version=HUB_VERSION_X1S,
        )
        assert exchange["payload"] == expected
        # Body layout sanity: [0x01][outer_seq_be16][0x01][pages_be16][ent][key][count].
        assert exchange["payload"][6] == 5
        assert exchange["payload"][7] == button_id
        assert exchange["payload"][8] == 1


def test_set_device_power_binding_skips_omitted_row(monkeypatch) -> None:
    proxy, exchanges = _proxy_with_capture(monkeypatch, HUB_VERSION_X1S)

    ok = proxy.set_device_power_binding(3, power_on_command_id=7)

    assert ok is True
    assert len(exchanges) == 1
    assert exchanges[0]["ack_first_byte"] == ButtonName.POWER_ON


def test_set_device_power_binding_rejects_x1(monkeypatch) -> None:
    proxy, _exchanges = _proxy_with_capture(monkeypatch, HUB_VERSION_X1)

    with pytest.raises(ValueError, match="not implemented for X1 hubs"):
        proxy.set_device_power_binding(3, power_on_command_id=7)


def test_set_device_power_binding_noop_when_client_connected(monkeypatch) -> None:
    proxy, exchanges = _proxy_with_capture(monkeypatch, HUB_VERSION_X1S)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: False)

    ok = proxy.set_device_power_binding(3, power_on_command_id=7)

    assert ok is False
    assert exchanges == []


# ---------------------------------------------------------------------------
# proxy: set_power_macro
# ---------------------------------------------------------------------------


def test_set_power_macro_writes_activity_scope_rows(monkeypatch) -> None:
    proxy, exchanges = _proxy_with_capture(monkeypatch, HUB_VERSION_X1S)

    steps = [
        {"device_id": 1, "command_id": 198, "duration": 0, "delay": 0},
        {"device_id": 2, "command_id": 198, "duration": 0, "delay": 0},
        {"device_id": 1, "command_id": 197, "duration": 2, "delay": 0},
        {"device_id": 2, "command_id": 197, "duration": 0, "delay": 0},
    ]
    ok = proxy.set_power_macro(101, ButtonName.POWER_ON, steps)

    assert ok is True
    assert len(exchanges) == 1
    exchange = exchanges[0]
    assert exchange["family"] == 0x12
    assert exchange["ack_opcode"] == 0x0112
    assert exchange["ack_first_byte"] == ButtonName.POWER_ON

    expected = build_macro_save_payload(
        activity_id=101,
        key_id=ButtonName.POWER_ON,
        key_sequence=[
            MacroKeyEntry(
                device_id=step["device_id"],
                key_id=step["command_id"],
                fid=0,
                duration=step["duration"],
                delay=step["delay"],
            )
            for step in steps
        ],
        label="",
        hub_version=HUB_VERSION_X1S,
    )
    assert exchange["payload"] == expected
    assert exchange["payload"][6] == 101
    assert exchange["payload"][7] == ButtonName.POWER_ON
    assert exchange["payload"][8] == len(steps)


def test_set_power_macro_validates_inputs(monkeypatch) -> None:
    proxy, _exchanges = _proxy_with_capture(monkeypatch, HUB_VERSION_X1S)

    with pytest.raises(ValueError, match="POWER_ON .0xC6. or POWER_OFF .0xC7."):
        proxy.set_power_macro(101, 0x05, [{"device_id": 1, "command_id": 1}])
    with pytest.raises(ValueError, match="non-empty list"):
        proxy.set_power_macro(101, ButtonName.POWER_ON, [])

    x1_proxy, _ = _proxy_with_capture(monkeypatch, HUB_VERSION_X1)
    with pytest.raises(ValueError, match="not implemented for X1 hubs"):
        x1_proxy.set_power_macro(101, ButtonName.POWER_ON, [{"device_id": 1, "command_id": 1}])


# ---------------------------------------------------------------------------
# service handlers
# ---------------------------------------------------------------------------


class _FakeConfigEntries:
    def __init__(self, entry):
        self._entry = entry

    def async_get_entry(self, entry_id):
        if self._entry and self._entry.entry_id == entry_id:
            return self._entry
        return None


class _FakeHass:
    def __init__(self, entry):
        self.config_entries = _FakeConfigEntries(entry)


class _FakeCall:
    def __init__(self, data: dict, hass=None):
        self.data = data
        self.hass = hass if hass is not None else _FakeHass(None)


class _FakeHub:
    def __init__(self) -> None:
        self.entry_id = "entry-1"
        self.calls: list[dict] = []
        self.result = True

    async def async_set_device_power_binding(
        self,
        device_id: int,
        power_on_command_id: int | None = None,
        power_off_command_id: int | None = None,
    ) -> bool:
        self.calls.append(
            {
                "device_id": device_id,
                "power_on_command_id": power_on_command_id,
                "power_off_command_id": power_off_command_id,
            }
        )
        return self.result

    async def async_set_power_macro(
        self, entity_id: int, button_id: int, steps: list[dict[str, int]]
    ) -> bool:
        self.calls.append(
            {"entity_id": entity_id, "button_id": button_id, "steps": steps}
        )
        return self.result


def _wire_hub(monkeypatch) -> tuple[_FakeHub, _FakeHass]:
    hub = _FakeHub()
    entry = SimpleNamespace(entry_id="entry-1", options={})
    hass = _FakeHass(entry)

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)
    return hub, hass


def test_power_binding_service_requires_a_command_id(monkeypatch) -> None:
    _hub, hass = _wire_hub(monkeypatch)

    with pytest.raises(ValueError, match="power_on_command_id and/or power_off_command_id"):
        asyncio.run(
            integration._async_handle_set_device_power_binding(
                _FakeCall({"device_id": 3}, hass)
            )
        )


def test_power_binding_service_validates_ranges(monkeypatch) -> None:
    _hub, hass = _wire_hub(monkeypatch)

    with pytest.raises(ValueError, match="device_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_set_device_power_binding(
                _FakeCall({"device_id": 0, "power_on_command_id": 7}, hass)
            )
        )
    with pytest.raises(ValueError, match="power_on_command_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_set_device_power_binding(
                _FakeCall({"device_id": 3, "power_on_command_id": 300}, hass)
            )
        )


def test_power_binding_service_accepts_valid_input(monkeypatch) -> None:
    hub, hass = _wire_hub(monkeypatch)

    asyncio.run(
        integration._async_handle_set_device_power_binding(
            _FakeCall(
                {"device_id": "3", "power_on_command_id": "25", "power_off_command_id": 26},
                hass,
            )
        )
    )

    assert hub.calls == [
        {"device_id": 3, "power_on_command_id": 25, "power_off_command_id": 26}
    ]


def test_power_macro_service_validates_inputs(monkeypatch) -> None:
    _hub, hass = _wire_hub(monkeypatch)

    with pytest.raises(ValueError, match="button must be power_on or power_off"):
        asyncio.run(
            integration._async_handle_set_power_macro(
                _FakeCall(
                    {"entity_id": 101, "button": "toggle", "steps": [{"device_id": 1, "command_id": 1}]},
                    hass,
                )
            )
        )
    with pytest.raises(ValueError, match="steps must be a non-empty list"):
        asyncio.run(
            integration._async_handle_set_power_macro(
                _FakeCall({"entity_id": 101, "button": "power_on", "steps": []}, hass)
            )
        )
    with pytest.raises(ValueError, match=r"steps\[0\] is missing command_id"):
        asyncio.run(
            integration._async_handle_set_power_macro(
                _FakeCall(
                    {"entity_id": 101, "button": "power_on", "steps": [{"device_id": 1}]},
                    hass,
                )
            )
        )


def test_power_macro_service_accepts_valid_input(monkeypatch) -> None:
    hub, hass = _wire_hub(monkeypatch)

    asyncio.run(
        integration._async_handle_set_power_macro(
            _FakeCall(
                {
                    "entity_id": "101",
                    "button": "power_off",
                    "steps": [
                        {"device_id": "2", "command_id": "199"},
                        {"device_id": 1, "command_id": 199, "duration": 3, "delay": 0},
                    ],
                },
                hass,
            )
        )
    )

    assert hub.calls == [
        {
            "entity_id": 101,
            "button_id": 0xC7,
            "steps": [
                {"device_id": 2, "command_id": 199, "duration": 0, "delay": 0},
                {"device_id": 1, "command_id": 199, "duration": 3, "delay": 0},
            ],
        }
    ]
