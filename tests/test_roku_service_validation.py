import asyncio
from types import SimpleNamespace

import pytest

import importlib
from custom_components.sofabaton_x1s.lib.commands import build_descriptive_ir_blob_body

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


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
        self.version = "X1"
        self.calls: list[dict] = []
        self.favorite_order_result: list[tuple[int, int]] | None = None
        self.favorite_descriptions: list[dict] | None = None

    async def async_create_wifi_device(
        self,
        *,
        device_name: str,
        commands: list[str],
        request_port: int,
        power_on_command_id: int | None = None,
        power_off_command_id: int | None = None,
        input_command_ids: list[int] | None = None,
    ):
        payload = {
            "device_name": device_name,
            "commands": commands,
            "request_port": request_port,
        }
        if power_on_command_id is not None:
            payload["power_on_command_id"] = power_on_command_id
        if power_off_command_id is not None:
            payload["power_off_command_id"] = power_off_command_id
        if input_command_ids is not None:
            payload["input_command_ids"] = input_command_ids
        self.calls.append(payload)
        return payload

    async def async_add_device_to_activity(self, *, activity_id: int, device_id: int, input_cmd_id: int | None = None):
        payload = {
            "activity_id": activity_id,
            "device_id": device_id,
        }
        if input_cmd_id is not None:
            payload["input_cmd_id"] = input_cmd_id
        self.calls.append(payload)
        return payload

    async def async_command_to_favorite(
        self,
        *,
        activity_id: int,
        device_id: int,
        command_id: int,
        slot_id: int | None = None,
    ):
        payload = {
            "activity_id": activity_id,
            "device_id": device_id,
            "command_id": command_id,
        }
        if slot_id is not None:
            payload["slot_id"] = slot_id
        self.calls.append(payload)
        return payload

    async def async_command_to_button(
        self,
        *,
        activity_id: int,
        button_id: int,
        device_id: int,
        command_id: int,
        long_press_device_id: int | None = None,
        long_press_command_id: int | None = None,
    ):
        payload: dict[str, int | None] = {
            "activity_id": activity_id,
            "button_id": button_id,
            "device_id": device_id,
            "command_id": command_id,
        }
        if long_press_device_id is not None:
            payload["long_press_device_id"] = long_press_device_id
        if long_press_command_id is not None:
            payload["long_press_command_id"] = long_press_command_id
        self.calls.append(payload)
        return payload

    async def async_delete_device(self, *, device_id: int):
        payload = {"device_id": device_id}
        self.calls.append(payload)
        return payload

    async def async_dump_ir_commands(
        self,
        *,
        device_id: int,
        command_id: int | None = None,
        wait_timeout: float = 10.0,
    ):
        payload = {
            "device_id": device_id,
            "requested_command_id": command_id,
            "wait_timeout": wait_timeout,
            "commands": [],
            "complete": False,
        }
        self.calls.append(payload)
        return payload

    async def async_fetch_blob(
        self,
        *,
        device_id: int,
        command_id: int | None = None,
        wait_timeout: float = 10.0,
    ):
        payload = {
            "device_id": device_id,
            "requested_command_id": command_id,
            "wait_timeout": wait_timeout,
            "commands": [],
            "complete": False,
        }
        self.calls.append(payload)
        return payload

    async def async_backup_device(
        self,
        *,
        device_id: int,
        wait_timeout: float = 10.0,
    ):
        payload = {
            "device_id": device_id,
            "wait_timeout": wait_timeout,
            "kind": "device_backup",
            "complete": False,
        }
        self.calls.append(payload)
        return payload

    async def async_restore_device(
        self,
        payload: dict,
    ):
        result = {
            "status": "success",
            "device_id": 44,
            "backup_kind": payload.get("kind"),
        }
        self.calls.append({"kind": "restore_device", "payload": payload})
        return result

    async def async_play_ir_blob(
        self,
        blob: bytes,
        *,
        inter_frame_delay: float = 0.08,
    ):
        payload = {
            "blob": blob,
            "inter_frame_delay": inter_frame_delay,
        }
        self.calls.append(payload)
        return True

    async def async_request_favorites_order(self, activity_id: int):
        self.calls.append({"activity_id": activity_id, "kind": "request_favorites_order"})
        return self.favorite_order_result

    async def async_reorder_favorites(self, *, activity_id: int, ordered_fav_ids: list[int]):
        payload = {
            "activity_id": activity_id,
            "ordered_fav_ids": ordered_fav_ids,
        }
        self.calls.append(payload)
        return payload

    async def async_delete_favorite(self, *, activity_id: int, fav_id: int):
        payload = {
            "activity_id": activity_id,
            "fav_id": fav_id,
        }
        self.calls.append(payload)
        return payload

    def describe_favorites_order(self, activity_id: int, order: list[tuple[int, int]]):
        self.calls.append({"activity_id": activity_id, "kind": "describe_favorites_order", "order": list(order)})
        if self.favorite_descriptions is not None:
            return self.favorite_descriptions
        return [
            {"fav_id": fav_id, "button_id": fav_id, "slot": slot, "type": "unknown", "name": None}
            for fav_id, slot in order
        ]


def test_create_wifi_device_requires_commands(monkeypatch) -> None:
    hub = _FakeHub()
    entry = SimpleNamespace(entry_id="entry-1", options={"roku_listen_port": 8060})
    hass = _FakeHass(entry)
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="commands requires between 1 and 10 entries"):
        asyncio.run(
            integration._async_handle_create_wifi_device(
                _FakeCall({"device_name": "Home Assistant", "commands": []}, hass)
            )
        )


def test_create_wifi_device_validates_device_name(monkeypatch) -> None:
    hub = _FakeHub()
    entry = SimpleNamespace(entry_id="entry-1", options={"roku_listen_port": 8060})
    hass = _FakeHass(entry)
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="device_name must contain only letters"):
        asyncio.run(
            integration._async_handle_create_wifi_device(
                _FakeCall({"device_name": "+++", "commands": ["Launch"]}, hass)
            )
        )


def test_create_wifi_device_validates_command_names(monkeypatch) -> None:
    hub = _FakeHub()
    entry = SimpleNamespace(entry_id="entry-1", options={"roku_listen_port": 8060})
    hass = _FakeHass(entry)
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="commands entries must contain only letters"):
        asyncio.run(
            integration._async_handle_create_wifi_device(
                _FakeCall({"device_name": "Living Room", "commands": ["Do_Thing"]}, hass)
            )
        )


def test_create_wifi_device_accepts_valid_input(monkeypatch) -> None:
    hub = _FakeHub()
    entry = SimpleNamespace(entry_id="entry-1", options={"roku_listen_port": 8060})
    hass = _FakeHass(entry)
    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_create_wifi_device(
            _FakeCall({"device_name": "Living Room", "commands": ["Lights On", "Lights Off"]}, hass)
        )
    )

    assert result == {
        "device_name": "Living Room",
        "commands": ["Lights On", "Lights Off"],
        "request_port": 8060,
    }


def test_create_wifi_device_accepts_plus_on_x1s(monkeypatch) -> None:
    hub = _FakeHub()
    hub.version = "X1S"
    entry = SimpleNamespace(entry_id="entry-1", options={"roku_listen_port": 8060})
    hass = _FakeHass(entry)

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_create_wifi_device(
            _FakeCall({"device_name": "TV+", "commands": ["Vol +", "Input+1"]}, hass)
        )
    )

    assert result == {
        "device_name": "TV+",
        "commands": ["Vol +", "Input+1"],
        "request_port": 8060,
    }
    assert hub.calls == [result]


def test_create_wifi_device_uses_configured_roku_listener_port(monkeypatch) -> None:
    hub = _FakeHub()
    entry = SimpleNamespace(entry_id="entry-1", options={"roku_listen_port": 8765})
    hass = _FakeHass(entry)

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_create_wifi_device(
            _FakeCall({"device_name": "Living Room", "commands": ["Lights On"]}, hass)
        )
    )

    assert result["request_port"] == 8765


def test_create_wifi_device_accepts_input_command_ids(monkeypatch) -> None:
    hub = _FakeHub()
    entry = SimpleNamespace(entry_id="entry-1", options={"roku_listen_port": 8060})
    hass = _FakeHass(entry)

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_create_wifi_device(
            _FakeCall(
                {
                    "device_name": "Living Room",
                    "commands": ["Lights On", "Lights Off", "Input HDMI 1"],
                    "input_command_ids": [3, 1],
                },
                hass,
            )
        )
    )

    assert result["input_command_ids"] == [3, 1]


def test_create_wifi_device_rejects_out_of_range_input_command_ids(monkeypatch) -> None:
    hub = _FakeHub()
    entry = SimpleNamespace(entry_id="entry-1", options={"roku_listen_port": 8060})
    hass = _FakeHass(entry)

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="input_command_ids entries must each be between 1 and 2"):
        asyncio.run(
            integration._async_handle_create_wifi_device(
                _FakeCall(
                    {
                        "device_name": "Living Room",
                        "commands": ["Lights On", "Lights Off"],
                        "input_command_ids": [3],
                    },
                    hass,
                )
            )
        )


def test_device_to_activity_validates_activity_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="activity_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_device_to_activity(
                _FakeCall({"activity_id": 0, "device_id": 6})
            )
        )


def test_device_to_activity_accepts_valid_input(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_device_to_activity(
            _FakeCall({"activity_id": 101, "device_id": 6})
        )
    )

    assert result == {"activity_id": 101, "device_id": 6}
    assert hub.calls[-1] == result



def test_command_to_favorite_validates_command_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="command_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_command_to_favorite(
                _FakeCall({"activity_id": 101, "device_id": 6, "command_id": 0})
            )
        )


def test_command_to_favorite_accepts_valid_input(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_command_to_favorite(
            _FakeCall({"activity_id": 101, "device_id": 6, "command_id": 4, "slot_id": 0})
        )
    )

    assert result == {"activity_id": 101, "device_id": 6, "command_id": 4, "slot_id": 0}
    assert hub.calls[-1] == result




def test_command_to_favorite_omits_slot_when_not_provided(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_command_to_favorite(
            _FakeCall({"activity_id": 101, "device_id": 6, "command_id": 4})
        )
    )

    assert result == {"activity_id": 101, "device_id": 6, "command_id": 4}
    assert hub.calls[-1] == result

def test_command_to_button_validates_button_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="button_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_command_to_button(
                _FakeCall({"activity_id": 101, "button_id": 0, "device_id": 5, "command_id": 2})
            )
        )


def test_command_to_button_accepts_valid_input(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_command_to_button(
            _FakeCall({"activity_id": 101, "button_id": 193, "device_id": 5, "command_id": 2})
        )
    )

    assert result == {"activity_id": 101, "button_id": 193, "device_id": 5, "command_id": 2}
    assert hub.calls[-1] == result


def test_delete_device_validates_device_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="device_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_delete_device(
                _FakeCall({"device_id": 0})
            )
        )


def test_delete_device_accepts_valid_input(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_delete_device(
            _FakeCall({"device_id": 4})
        )
    )

    assert result == {"device_id": 4}
    assert hub.calls[-1] == result


def test_dump_ir_commands_validates_device_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="device_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_dump_ir_commands(
                _FakeCall({"device_id": 0})
            )
        )


def test_dump_ir_commands_validates_command_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="command_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_dump_ir_commands(
                _FakeCall({"device_id": 11, "command_id": 0})
            )
        )


def test_dump_ir_commands_returns_action_payload(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_dump_ir_commands(
            _FakeCall({"device_id": 11})
        )
    )

    assert result == {
        "device_id": 11,
        "requested_command_id": None,
        "wait_timeout": 10.0,
        "commands": [],
        "complete": False,
    }
    assert hub.calls[-1] == result


def test_dump_ir_commands_accepts_single_command_probe(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_dump_ir_commands(
            _FakeCall({"device_id": 11, "command_id": 9})
        )
    )

    assert result == {
        "device_id": 11,
        "requested_command_id": 9,
        "wait_timeout": 10.0,
        "commands": [],
        "complete": False,
    }
    assert hub.calls[-1] == result


def test_fetch_blob_validates_device_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="device_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_fetch_blob(
                _FakeCall({"device_id": 0})
            )
        )


def test_fetch_blob_validates_command_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="command_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_fetch_blob(
                _FakeCall({"device_id": 11, "command_id": 0})
            )
        )


def test_fetch_blob_returns_action_payload(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_fetch_blob(
            _FakeCall({"device_id": 11})
        )
    )

    assert result == {
        "device_id": 11,
        "requested_command_id": None,
        "wait_timeout": 10.0,
        "commands": [],
        "complete": False,
    }
    assert hub.calls[-1] == result


def test_backup_device_validates_device_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="device_id must be between 1 and 255"):
        asyncio.run(
            integration._async_handle_backup_device(
                _FakeCall({"device_id": 0})
            )
        )


def test_backup_device_returns_action_payload(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_backup_device(
            _FakeCall({"device_id": 11})
        )
    )

    assert result == {
        "device_id": 11,
        "wait_timeout": 10.0,
        "kind": "device_backup",
        "complete": False,
    }
    assert hub.calls[-1] == result


def test_restore_device_requires_backup_object(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    with pytest.raises(ValueError, match="backup must be an object payload returned by backup_device"):
        asyncio.run(
            integration._async_handle_restore_device(
                _FakeCall({"backup": "not-a-dict"})
            )
        )


def test_restore_device_returns_action_payload(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    backup = {"kind": "device_backup", "device": {"name": "TV"}}
    result = asyncio.run(
        integration._async_handle_restore_device(
            _FakeCall({"backup": backup})
        )
    )

    assert result == {
        "status": "success",
        "device_id": 44,
        "backup_kind": "device_backup",
    }
    assert hub.calls[-1] == {"kind": "restore_device", "payload": backup}


def test_play_ir_blob_accepts_hex_blob_body(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    result = asyncio.run(
        integration._async_handle_play_ir_blob(
            _FakeCall({"blob": "00 00 00 1f 00 00 11 00 94 70 50 3a 53 6f 6e 79 31 32 20 52 3a 34 30 30 30 30 20 44 3a 31 20 46 3a 31 38 20 4d 55 4c 3a 32 00 00 00 00"})
        )
    )

    assert result is None
    assert hub.calls[-1]["blob"] == bytes.fromhex(
        "00 00 00 1f 00 00 11 00 94 70 50 3a 53 6f 6e 79 31 32 20 52 3a 34 30 30 30 30 20 44 3a 31 20 46 3a 31 38 20 4d 55 4c 3a 32 00 00 00 00"
    )


def test_play_ir_blob_accepts_descriptor_string(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    descriptor = "P:Sony12 R:40000 D:1 F:18 MUL:2"
    result = asyncio.run(
        integration._async_handle_play_ir_blob(
            _FakeCall({"blob": descriptor})
        )
    )

    assert result is None
    assert hub.calls[-1]["blob"] == build_descriptive_ir_blob_body(descriptor)


def test_get_favorites_returns_explicit_fav_ids(monkeypatch) -> None:
    hub = _FakeHub()
    hub.favorite_order_result = [(0x09, 0x01), (0x01, 0x02)]
    hub.favorite_descriptions = [
        {
            "fav_id": 0x09,
            "button_id": 0x09,
            "slot": 0x01,
            "type": "macro",
            "name": "Test Macro",
        },
        {
            "fav_id": 0x01,
            "button_id": 0x01,
            "favorite_button_id": 0x01,
            "activity_map_button_id": 0x01,
            "slot": 0x02,
            "type": "favorite",
            "name": "Command 6",
            "device_id": 0x04,
            "command_id": 0x06,
        },
    ]

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_get_favorites(
            _FakeCall({"activity_id": 101})
        )
    )

    assert result == {
        "favorites": [
            {"fav_id": 0x09, "button_id": 0x09, "slot": 0x01, "type": "macro", "name": "Test Macro"},
            {
                "fav_id": 0x01,
                "button_id": 0x01,
                "favorite_button_id": 0x01,
                "activity_map_button_id": 0x01,
                "slot": 0x02,
                "type": "favorite",
                "name": "Command 6",
                "device_id": 0x04,
                "command_id": 0x06,
            },
        ]
    }


def test_get_favorites_can_include_cached_entries_missing_from_hub_order(monkeypatch) -> None:
    hub = _FakeHub()
    hub.favorite_order_result = [(0x01, 0x01), (0x02, 0x02)]
    hub.favorite_descriptions = [
        {
            "fav_id": 0x01,
            "button_id": 0x01,
            "favorite_button_id": 0x01,
            "activity_map_button_id": 0x01,
            "slot": 0x01,
            "type": "favorite",
            "name": "Ok",
            "device_id": 0x04,
            "command_id": 0x1A,
        },
        {
            "fav_id": 0x02,
            "button_id": 0x02,
            "favorite_button_id": 0x02,
            "activity_map_button_id": 0x02,
            "slot": 0x02,
            "type": "favorite",
            "name": "Yellow",
            "device_id": 0x04,
            "command_id": 0x20,
        },
        {
            "fav_id": 0x03,
            "button_id": 0x03,
            "favorite_button_id": 0x03,
            "activity_map_button_id": 0x03,
            "slot": 0x03,
            "type": "favorite",
            "name": "Dim the lights",
            "device_id": 0x08,
            "command_id": 0x01,
        },
    ]

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)

    result = asyncio.run(
        integration._async_handle_get_favorites(
            _FakeCall({"activity_id": 101})
        )
    )

    assert result["favorites"][-1] == {
        "fav_id": 0x03,
        "button_id": 0x03,
        "favorite_button_id": 0x03,
        "activity_map_button_id": 0x03,
        "slot": 0x03,
        "type": "favorite",
        "name": "Dim the lights",
        "device_id": 0x08,
        "command_id": 0x01,
    }


def test_reorder_favorites_requires_explicit_fav_ids(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    result = asyncio.run(
        integration._async_handle_reorder_favorites(
            _FakeCall({"activity_id": 101, "ordered_fav_ids": [9, 1, 2]})
        )
    )

    assert result == {"activity_id": 101, "ordered_fav_ids": [9, 1, 2]}
    assert hub.calls[-1] == result


def test_reorder_favorites_accepts_legacy_order_alias(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    result = asyncio.run(
        integration._async_handle_reorder_favorites(
            _FakeCall({"activity_id": 101, "order": [9, 1, 2]})
        )
    )

    assert result == {"activity_id": 101, "ordered_fav_ids": [9, 1, 2]}
    assert hub.calls[-1] == result


def test_delete_favorite_requires_explicit_fav_id(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    result = asyncio.run(
        integration._async_handle_delete_favorite(
            _FakeCall({"activity_id": 101, "fav_id": 9})
        )
    )

    assert result == {"activity_id": 101, "fav_id": 9}
    assert hub.calls[-1] == result


def test_delete_favorite_accepts_legacy_button_id_alias(monkeypatch) -> None:
    hub = _FakeHub()

    async def _resolve(hass, call):
        return hub

    monkeypatch.setattr(integration, "_async_resolve_hub_from_call", _resolve)
    monkeypatch.setattr(integration, "_raise_if_sync_in_progress", lambda *args, **kwargs: None)

    result = asyncio.run(
        integration._async_handle_delete_favorite(
            _FakeCall({"activity_id": 101, "button_id": 9})
        )
    )

    assert result == {"activity_id": 101, "fav_id": 9}
    assert hub.calls[-1] == result
