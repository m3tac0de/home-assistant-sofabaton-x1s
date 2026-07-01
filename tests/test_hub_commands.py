import asyncio
import logging
import pytest
from types import SimpleNamespace

import custom_components.sofabaton_x1s.hub as hub_module
from custom_components.sofabaton_x1s.hub import SofabatonHub, get_hub_model
from custom_components.sofabaton_x1s.const import HUB_VERSION_X1S, HUB_VERSION_X2
from custom_components.sofabaton_x1s.lib.commands import build_descriptive_ir_blob_body
from custom_components.sofabaton_x1s.lib.devices import DeviceConfig, build_device_create_payload
from custom_components.sofabaton_x1s.lib.macros import MacroKeyEntry, MacroRecord
from custom_components.sofabaton_x1s.lib.backup_export import (
    build_hub_code_record_restore_data,
)


class FakeHass:
    def __init__(self, loop: asyncio.AbstractEventLoop):
        self.loop = loop
        self.data = {}
        self._entries = {}
        self.config_entries = SimpleNamespace(
            async_get_entry=self._async_get_entry,
            async_update_entry=self._async_update_entry,
        )

    async def async_add_executor_job(self, func, *args, **kwargs):  # pragma: no cover - passthrough
        return func(*args, **kwargs)

    def async_create_task(self, coro):  # pragma: no cover - passthrough
        return self.loop.create_task(coro)

    def _async_get_entry(self, entry_id):
        return self._entries.get(entry_id)

    def _async_update_entry(self, entry, *, data=None, options=None, title=None):
        if data is not None:
            entry.data = data
        if options is not None:
            entry.options = options
        if title is not None:
            entry.title = title


class FakeDeviceRegistry:
    def __init__(self, device=None):
        self.device = device
        self.updated = []

    def async_get_device(self, *, identifiers=None, connections=None):
        expected = {(hub_module.DOMAIN, "aa:bb:cc:dd:ee:ff")}
        if identifiers == expected:
            return self.device
        return None

    def async_update_device(self, device_id, **kwargs):
        self.updated.append((device_id, kwargs))


def test_activity_fetch_clears_inflight_after_favorite_labels(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    hub.hub_connected = True
    hub.activities_ready = True
    hub.devices_ready = True

    act_id = 0x0101
    act_lo = act_id & 0xFF
    dev_id = 0x0202
    cmd_id = 0x002A

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": dev_id, "command_id": cmd_id}
    ]

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    async def _noop_wait(*_):
        return None

    monkeypatch.setattr(hub, "_async_wait_for_buttons_ready", _noop_wait)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_, **__: ([], True))

    loop.run_until_complete(hub.async_fetch_device_commands(act_id))

    assert act_id in hub._commands_in_flight
    hub.hub_connected = True
    assert hub.get_index_state() == "loading"

    hub._proxy.state.commands[dev_id & 0xFF] = {cmd_id: "Fav Label"}
    hub._proxy.state.record_favorite_label(act_lo, dev_id, cmd_id, "Fav Label")
    hub._proxy._favorite_label_requests.clear()

    hub._on_commands_burst(f"commands:{dev_id & 0xFF}")
    loop.run_until_complete(asyncio.sleep(0))

    # Activity fetch should stay in-flight until macro burst completion is observed.
    assert act_id in hub._commands_in_flight

    hub._proxy._macros_complete.add(act_lo)
    hub._on_macros_burst(f"macros:{act_lo}")
    loop.run_until_complete(asyncio.sleep(0))

    assert act_id not in hub._commands_in_flight
    assert hub._commands_in_flight == set()
    assert hub._pending_button_fetch == set()
    hub.hub_connected = True
    hub.activities_ready = True
    hub.devices_ready = True
    assert hub.get_index_state() == "ready"

    loop.close()


def test_async_fetch_blob_normalizes_tail_and_descriptor(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub._proxy.state.devices[11] = {"device_class": "IR"}
    blob_body = build_descriptive_ir_blob_body("P:Sony12 R:40000 D:1 F:18 MUL:2")
    replay_tail = (sum(blob_body) + 2) & 0xFF

    async def _dump_ir_commands(*, device_id: int, command_id: int | None = None, wait_timeout: float = 10.0):
        return {
            "device_id": device_id,
            "requested_command_id": command_id,
            "total_commands": 1,
            "received_command_count": 1,
            "complete": True,
            "commands": [
                {
                    "command_id": 18,
                    "device_id": device_id,
                    "label": "Input",
                    "ir_blob_hex": (blob_body + bytes([replay_tail])).hex(" "),
                }
            ],
        }

    monkeypatch.setattr(hub, "async_dump_ir_commands", _dump_ir_commands)

    result = loop.run_until_complete(hub.async_fetch_blob(device_id=11))

    assert result == {
        "device_id": 11,
        "requested_command_id": None,
        "total_commands": 1,
        "received_command_count": 1,
        "complete": True,
        "commands": [
            {
                "command_label": "Input",
                "device_id": 11,
                "command_id": 18,
                "device_class": "IR",
                "blob_kind": "descriptive",
                "command_blob": blob_body.hex(" "),
                "parsed_blob": "P:Sony12 R:40000 D:1 F:18 MUL:2",
                # IR descriptive payloads now ride the same `decoded`
                # block shape as the wifi virtual device classes — the
                # decoder is content-sniffed via the magic prefix and
                # returns None for non-descriptive IR blobs, so this
                # field is populated here and empty for raw IR rows.
                "decoded": {
                    "class": "ir",
                    "trailer_hex": "00 00 00 00",
                    "fields": {"descriptor": "P:Sony12 R:40000 D:1 F:18 MUL:2"},
                },
                "replay_tail_checksum": replay_tail,
                "command_checksum": replay_tail,
            }
        ],
    }

    loop.close()


def test_async_fetch_blob_decoded_block_for_wifi_ip(monkeypatch):
    """Fetch Blob attaches a `decoded` block for virtual-device classes.

    Locks in the wifi_ip end-to-end path: the hub readback flow surfaces
    both the raw `command_blob` hex (for the Hex view) and a decoded
    structural block (for the Descriptor view). Both must come out of
    the same dump so the descriptive/hex toggle stays in sync.
    """

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub._proxy.state.devices[12] = {"device_class": "wifi_ip"}

    # Real-hub wifi_ip sample, transcribed from
    # docs/protocol/command-blob-decoders.md. The Fetch Blob path
    # always splits off the trailing replay-tail byte before
    # decoding, so the bytes the decoder sees end at `0d 0a` (with the
    # `f1` trailer consumed as the replay-tail checksum).
    wifi_ip_full_hex = (
        "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 "
        "75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 "
        "30 2f 31 2f 30 2f 73 68 6f 72 74 20 48 54 54 50 "
        "2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 "
        "36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f "
        "6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 "
        "63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 "
        "6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a "
        "f1"
    )

    async def _dump_ir_commands(*, device_id: int, command_id: int | None = None, wait_timeout: float = 10.0):
        return {
            "device_id": device_id,
            "requested_command_id": command_id,
            "total_commands": 1,
            "received_command_count": 1,
            "complete": True,
            "commands": [
                {
                    "command_id": 1,
                    "device_id": device_id,
                    "label": "Launch app",
                    "ir_blob_hex": wifi_ip_full_hex,
                }
            ],
        }

    monkeypatch.setattr(hub, "async_dump_ir_commands", _dump_ir_commands)

    result = loop.run_until_complete(hub.async_fetch_blob(device_id=12))

    command_row = result["commands"][0]
    assert command_row["blob_kind"] == "decoded"

    decoded = command_row["decoded"]
    assert isinstance(decoded, dict)
    assert decoded["class"] == "wifi_ip"
    fields = decoded["fields"]
    assert fields["host"] == "192.168.2.77"
    assert fields["port"] == 8060
    assert fields["method"] == "POST"
    assert fields["path"] == "/launch/fc012c39d390/1/0/short"
    assert fields["content_type"] == "application/x-www-form-urlencoded"
    assert fields["body"] == ""
    # Replay-tail byte was consumed by the splitter, so the decoder's
    # trailer is empty for this sample. (The backup path, which uses
    # the unstripped blob, will carry the `f1` trailer instead.)
    assert decoded["trailer_hex"] == ""

    # `parsed_blob` carries the formatted descriptor text used by the
    # tool's Descriptor view. Hex view continues to read
    # `command_blob`, which is the stripped wire blob exactly like it
    # is for IR commands today.
    assert "host: 192.168.2.77" in command_row["parsed_blob"]
    assert command_row["command_blob"] is not None
    assert "f1" not in command_row["command_blob"]  # trailing byte was stripped

    loop.close()


def test_build_hub_code_record_restore_data_attaches_decoded_for_wifi_ip():
    """`restore_data` for virtual classes carries the decoded block.

    The block is purely additive — `data_hex` stays byte-identical to
    what backups produce today, so older restore paths (which only
    read `data_hex`) keep working. This test pins the additive shape
    explicitly so a future refactor cannot quietly start mutating
    `data_hex` based on the decoded view.
    """

    wifi_ip_full_hex = (
        "c0 a8 02 4d 1f 7c 00 78 50 4f 53 54 20 2f 6c 61 "
        "75 6e 63 68 2f 66 63 30 31 32 63 33 39 64 33 39 "
        "30 2f 31 2f 30 2f 73 68 6f 72 74 20 48 54 54 50 "
        "2f 31 2e 31 0d 0a 48 6f 73 74 3a 31 39 32 2e 31 "
        "36 38 2e 32 2e 37 37 3a 38 30 36 30 0d 0a 43 6f "
        "6e 74 65 6e 74 2d 54 79 70 65 3a 61 70 70 6c 69 "
        "63 61 74 69 6f 6e 2f 78 2d 77 77 77 2d 66 6f 72 "
        "6d 2d 75 72 6c 65 6e 63 6f 64 65 64 0d 0a 0d 0a "
        "f1"
    )
    # The page-1 metadata only needs to be long enough for the method
    # to extract library_type + command_code; the actual restore-side
    # value of `data_hex` is what the test focuses on.
    page_one_payload = bytes(
        [0x00] * 8 + [0x1C] + [0x00, 0x00, 0x00, 0x00, 0x00, 0x00] + [0x00] * 16
    )
    command = {
        "ir_blob_hex": wifi_ip_full_hex,
        "pages": [{"payload_hex": page_one_payload.hex(" ")}],
    }

    restore_data = build_hub_code_record_restore_data(
        command, device_class="wifi_ip"
    )

    assert restore_data is not None
    # data_hex preserved verbatim — restore path keeps working.
    assert restore_data["data_hex"] == wifi_ip_full_hex
    assert restore_data["transport"] == "hub_code_record"
    assert restore_data["library_type"] == 0x1C

    decoded = restore_data["decoded"]
    assert decoded["class"] == "wifi_ip"
    assert decoded["trailer_hex"] == "f1"  # unstripped path keeps the byte
    assert decoded["fields"]["host"] == "192.168.2.77"
    assert decoded["fields"]["port"] == 8060
    assert decoded["fields"]["path"] == "/launch/fc012c39d390/1/0/short"


def test_ir_decoder_attaches_block_for_descriptive_payload():
    """IR descriptive payloads round-trip through the same registry path.

    The IR backup branch in :meth:`async_backup_device` attaches a
    ``decoded`` block on the row by calling
    ``try_decode_command_blob("ir", blob_hex)``. That single call —
    the actual integration point — is exercised here. End-to-end
    backup-pipeline integration is covered by the bundle tests.
    """

    from custom_components.sofabaton_x1s.lib.blob_decoders import try_decode_blob

    descriptor = "P:Sony12 R:40000 D:1 F:18 MUL:2"
    blob_hex = build_descriptive_ir_blob_body(descriptor).hex(" ")

    decoded = try_decode_blob("ir", blob_hex)
    assert decoded == {
        "class": "ir",
        "trailer_hex": "00 00 00 00",
        "fields": {"descriptor": descriptor},
    }

    # Non-descriptive IR blobs (raw learned / database captures) keep
    # raw-only restore_data exactly like before, because the decoder
    # content-sniff fails and the branch leaves `decoded` off the row.
    raw_ir = "00 00 00 00 00 00 9c 40 " + "00 " * 16
    assert try_decode_blob("ir", raw_ir) is None


def test_build_hub_code_record_restore_data_no_decoded_for_unsupported_class():
    """Bluetooth / RF / MQTT command rows keep raw-only restore_data."""

    command = {
        "ir_blob_hex": "0c 00 30 74",
        "pages": [{"payload_hex": bytes(30).hex(" ")}],
    }
    restore_data = build_hub_code_record_restore_data(
        command, device_class="bluetooth"
    )
    assert restore_data is not None
    assert restore_data["data_hex"] == "0c 00 30 74"
    assert "decoded" not in restore_data


def test_async_backup_activity_filters_internal_power_macro_device_255(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_id = 0x65
    act_lo = act_id & 0xFF

    hub._proxy.state.activities[act_lo] = {
        "name": "Watch TV",
        "device_class": "activity",
        "device_class_code": 0x00,
        "raw_body": None,
    }
    hub._proxy.state.button_details[act_lo] = {}
    hub._proxy.state.buttons[act_lo] = set()
    hub._proxy.state.activity_favorite_slots[act_lo] = []
    hub._proxy._macros_complete.add(act_lo)

    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        hub._proxy,
        "get_buttons_for_entity",
        lambda ent_id, fetch_if_missing=True: ([], True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_macros_for_activity",
        lambda ent_id, fetch_if_missing=True: ([{"command_id": 0xC6, "label": "POWER_ON"}], True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_cached_macro_records",
        lambda ent_id: [
            MacroRecord(
                activity_id=ent_id,
                key_id=0xC6,
                label="POWER_ON",
                raw_label_slot=b"\x00\xc6",
                key_sequence=(
                    MacroKeyEntry(device_id=11, key_id=1, fid=0x4E21, duration=0, delay=0xFF),
                    MacroKeyEntry(device_id=0xFF, key_id=2, fid=0x4E22, duration=0, delay=0xFF),
                    MacroKeyEntry(device_id=12, key_id=3, fid=0x4E23, duration=1, delay=5),
                ),
            ),
        ],
    )

    result = loop.run_until_complete(hub.async_backup_activity(activity_id=act_id))

    assert result is not None
    assert result["complete"] is True
    # Device-255 macro entries are firmware "delay/wait" sentinel rows
    # (head byte 0xFF, delay byte carries the pause). Commit 0700430
    # ("Evolved backup edit … Fixed issue in backup/restore where macro
    # delays weren't being backed up and restored") deliberately stopped
    # filtering them — they're preserved verbatim through backup→restore
    # so the firmware can replay inter-step pauses. They're still excluded
    # from referenced_source_device_ids because they don't point at a real
    # source device.
    assert result["macros"] == [
        {
            "button_id": 0xC6,
            "name": "POWER_ON",
            "steps": [
                {
                    "device_id": 11,
                    "command_id": 1,
                    "button_code": 0x4E21,
                    "duration": 0,
                    "delay": 0xFF,
                },
                {
                    "device_id": 0xFF,
                    "command_id": 2,
                    "button_code": 0x4E22,
                    "duration": 0,
                    "delay": 0xFF,
                },
                {
                    "device_id": 12,
                    "command_id": 3,
                    "button_code": 0x4E23,
                    "duration": 1,
                    "delay": 5,
                },
            ],
        }
    ]
    assert result["referenced_source_device_ids"] == [11, 12]

    loop.close()


def test_async_backup_device_returns_restore_oriented_payload(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    # Fully configured device: input_mode=1 (direct inputs), power_mode=1
    # (power configured), power_style=3 (companion to power_mode). The
    # backup flow uses these to decide whether to actually call
    # REQ_ACTIVITY_INPUTS and REQ_MACROS -- on an unconfigured device it
    # short-circuits those.
    device_config = DeviceConfig(
        name="TV",
        brand="Sony",
        device_id=11,
        icon=1,
        sort=0,
        code_type=0x10,
        device_type=0x10,
        hide=0,
        input_flag=0,
        channel=0,
        power_state=0,
        ip_address=None,
        poll_time=-1,
        input_mode=1,
        power_mode=1,
        power_style=3,
        share_mode=0,
        tail_marker=0,
    )
    device_payload = build_device_create_payload(device_config, hub_version="X1")
    device_raw_body = device_payload[3:]

    blob_body = build_descriptive_ir_blob_body("P:Sony12 R:40000 D:1 F:18 MUL:2")
    replay_tail = (sum(blob_body) + 2) & 0xFF

    def _ir_dump(device_id, command_id=None, *, timeout=10.0):
        # Raw 0x020C dump shape; the library normalizes it (splits the
        # replay tail) into the command_blob the backup rows carry.
        return {
            "device_id": device_id,
            "requested_command_id": command_id,
            "total_commands": 1,
            "received_command_count": 1,
            "complete": True,
            "commands": [
                {
                    "label": "Input",
                    "device_id": device_id,
                    "command_id": 18,
                    "ir_blob_hex": (blob_body + bytes([replay_tail])).hex(),
                }
            ],
        }

    monkeypatch.setattr(hub._proxy, "request_ir_command_dump", _ir_dump)

    hub._proxy.state.devices[11] = {
        "name": "TV",
        "brand": "Sony",
        "device_class": "IR",
        "device_class_code": 0x10,
        "raw_body": device_raw_body,
    }
    hub._proxy.state.commands[11] = {18: "Input"}
    hub._proxy.state.buttons[11] = {0x58}
    hub._proxy.state.button_details[11] = {0x58: {"device_id": 11, "command_id": 18}}
    hub._proxy.state.activity_macros[11] = [{"command_id": 33, "label": "Power On"}]
    hub._proxy.state.activity_favorite_slots[11] = [
        {"button_id": 18, "device_id": 11, "command_id": 18, "source": "keymap"}
    ]
    hub._proxy._macros_complete.add(11)
    hub._proxy._commands_complete.add(11)

    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        hub._proxy,
        "get_commands_for_entity",
        lambda ent_id, fetch_if_missing=True: ({18: "Input"}, True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_buttons_for_entity",
        lambda ent_id, fetch_if_missing=True: ([0x58], True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_macros_for_activity",
        lambda ent_id, fetch_if_missing=True: ([{"command_id": 33, "label": "Power On"}], True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_cached_macro_records",
        lambda ent_id: [
            MacroRecord(
                activity_id=ent_id,
                key_id=0x21,
                label="Power On",
                raw_label_slot=b"\x00\x21",
                key_sequence=(
                    MacroKeyEntry(
                        device_id=11,
                        key_id=18,
                        fid=0,
                        duration=1,
                        delay=2,
                    ),
                ),
            ),
            MacroRecord(
                activity_id=ent_id,
                key_id=0xC6,
                label="POWER_ON",
                raw_label_slot=b"\x00\xc6",
                key_sequence=(
                    MacroKeyEntry(
                        device_id=11,
                        key_id=1,
                        fid=0,
                        duration=0,
                        delay=0xFF,
                    ),
                ),
            ),
        ],
    )
    monkeypatch.setattr(
        hub._proxy,
        "fetch_device_input_record",
        lambda *args, **kwargs: {
            "device_id": 11,
            "source_id_byte": 1,
            "flag_a": 0,
            "flag_b": 0,
            "state_byte": 0,
            "entries": [{"command_id": 18, "input_index": 1, "fid": 0x1234, "name": "Input"}],
            "control_keys": {
                "input_list": "",
                "input_up": "",
                "input_down": "",
                "input_confirm": "",
            },
            "favorites": [],
        },
    )
    monkeypatch.setattr(
        hub._proxy,
        "fetch_device_key_sort",
        lambda *args, **kwargs: {"device_id": 11, "msg_hex": "58 12"},
    )

    result = loop.run_until_complete(hub.async_backup_device(device_id=11))

    assert result is not None
    assert result["kind"] == "device_backup"
    assert result["schema_version"] == 4
    assert isinstance(result.get("captured_at"), str) and result["captured_at"]
    assert result["complete"] is True
    assert "raw" not in result
    # Slim format: the redundant top-level "inputs" list, device-level
    # "favorite_slots", and the "completeness" diagnostic are dropped.
    assert "inputs" not in result
    assert "favorite_slots" not in result
    assert "completeness" not in result
    assert "hub" not in result
    assert result["input_record"] == {
        "device_id": 11,
        "source_id_byte": 1,
        "flag_a": 0,
        "flag_b": 0,
        "state_byte": 0,
        "entries": [{"command_id": 18, "input_index": 1, "fid": 0x1234, "name": "Input"}],
        "control_keys": {
            "input_list": "",
            "input_up": "",
            "input_down": "",
            "input_confirm": "",
        },
        "favorites": [],
    }
    assert result["device"] == {
        "device_id": 11,
        "name": "TV",
        "brand": "Sony",
        "device_class": "IR",
        "device_class_code": 0x10,
        "icon": 1,
        "sort": 0,
        "code_type": 0x10,
        "device_type": 0x10,
        "code_id_hex": "00 " * 15 + "00",
        "hide": 0,
        "input_flag": 0,
        "channel": 0,
        "power_state": 0,
        "ip_address": None,
        "poll_time": -1,
        "input_mode": 1,
        "inputs_configured": True,
        "power_mode": 1,
        "power_style": 3,
        "share_mode": 0,
        "tail_marker": 0,
        "extras": None,
    }
    # restore_data now carries a `decoded` block alongside the raw bytes —
    # the same IR descriptor decoder that the fetch-blob path uses. This is
    # the canonical view for descriptive IR blobs and is what restore reads
    # when rewriting the body for the destination hub.
    assert result["commands"] == [
        {
            "command_id": 18,
            "name": "Input",
            "restore_data": {
                "transport": "hub_code_record",
                "library_type": 0x0D,
                "button_code": 0,
                "data_hex": blob_body.hex(" "),
                "decoded": {
                    "class": "ir",
                    "trailer_hex": "00 00 00 00",
                    "fields": {"descriptor": "P:Sony12 R:40000 D:1 F:18 MUL:2"},
                },
            },
        }
    ]
    # Device-level bindings drop the device_id/long_press_device_id
    # echoes (restore re-derives them); labels are kept for editability.
    assert result["button_bindings"] == [
        {
            "button_id": 0x58,
            "button_name": None,
            "command_id": 18,
            "command_name": "Input",
            "long_press_command_id": None,
        }
    ]
    # Device-level macro steps drop the device_id/fid echoes.
    assert result["macros"] == [
        {
            "button_id": 0x21,
            "name": "Power On",
            "steps": [
                {
                    "command_id": 18,
                    "duration": 1,
                    "delay": 2,
                }
            ],
        },
        {
            "button_id": 0xC6,
            "name": "POWER_ON",
            "steps": [
                {
                    "command_id": 1,
                    "duration": 0,
                    "delay": 0xFF,
                }
            ],
        },
    ]
    assert result["key_sort"] == {"device_id": 11, "msg_hex": "58 12"}

    loop.close()


def test_async_backup_device_returns_rich_schema_from_snapshot_raw_body(monkeypatch):
    """``_async_refresh_devices_snapshot`` now returns the raw proxy-state
    view (``raw_body`` included), so the on-demand backup parses the
    full device schema without a separate rehydration step.

    Regression for the live restore that produced ``code_type=0x0A``
    on a Bluetooth keyboard: when ``raw_body`` was missing from the
    snapshot the backup degraded to a four-field shape and the restore
    fell back to default ``code_type`` / ``device_type``, recreating
    the device under the wrong class on the hub.
    """

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    # BT keyboard-style device: code_type=0x03 (the byte that ended up
    # as 0x0A in the live restore log because the snapshot view stripped
    # raw_body and the backup fell back to defaults).
    device_config = DeviceConfig(
        name="Troeloeloe",
        brand="Bluetooth Keyboard",
        device_id=6,
        icon=1,
        code_type=0x03,
        device_type=0x10,
        input_mode=2,
        power_mode=1,
        power_style=3,
    )
    device_payload = build_device_create_payload(device_config, hub_version="X1")
    device_raw_body = device_payload[3:]

    # Snapshot view: carries raw_body straight from proxy state, per
    # the Phase 2 contract on _async_refresh_devices_snapshot.
    async def _refresh_devices_snapshot(timeout_seconds: float = 15.0):
        return {
            6: {
                "name": "Troeloeloe",
                "brand": "Bluetooth Keyboard",
                "device_class": "bluetooth",
                "device_class_code": 3,
                "raw_body": device_raw_body,
            }
        }

    async def _wait_ready(*args, **kwargs):
        return None

    async def _dump_ir_commands(*, device_id: int, wait_timeout: float = 15.0):
        return {"complete": True, "commands": []}

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _refresh_devices_snapshot)
    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(hub, "_async_wait_for_command_fetch_complete", _wait_ready)
    monkeypatch.setattr(hub, "_async_wait_for_buttons_ready", _wait_ready)
    monkeypatch.setattr(hub, "_async_wait_for_macros_ready", _wait_ready)
    monkeypatch.setattr(hub, "async_dump_ir_commands", _dump_ir_commands)

    # Authoritative state still carries raw_body. The fix should pull it
    # from here when the snapshot view doesn't have it.
    hub._proxy.state.devices[6] = {
        "name": "Troeloeloe",
        "brand": "Bluetooth Keyboard",
        "device_class": "bluetooth",
        "device_class_code": 3,
        "raw_body": device_raw_body,
    }
    hub._proxy.state.commands[6] = {}
    hub._proxy.state.buttons[6] = set()
    hub._proxy.state.button_details[6] = {}
    hub._proxy._macros_complete.add(6)

    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        hub._proxy,
        "get_commands_for_entity",
        lambda ent_id, fetch_if_missing=True: ({}, True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_buttons_for_entity",
        lambda ent_id, fetch_if_missing=True: ([], True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_macros_for_activity",
        lambda ent_id, fetch_if_missing=True: ([], True),
    )
    monkeypatch.setattr(hub._proxy, "get_cached_macro_records", lambda ent_id: [])
    monkeypatch.setattr(
        hub._proxy,
        "fetch_device_input_entries",
        lambda *args, **kwargs: [],
    )
    monkeypatch.setattr(
        hub._proxy,
        "fetch_device_key_sort",
        lambda *args, **kwargs: {"device_id": 6, "msg_hex": ""},
    )

    result = loop.run_until_complete(hub.async_backup_device(device_id=6))

    assert result is not None
    device_block = result["device"]
    # Rich schema fields must be present -- this is what guards against
    # the restore-time fallback to default code_type/device_type that
    # creates the wrong device class on the hub.
    assert device_block["code_type"] == 0x03
    assert device_block["device_type"] == 0x10
    assert device_block["input_mode"] == 2
    assert device_block["power_mode"] == 1
    assert device_block["power_style"] == 3
    assert "code_id_hex" in device_block
    assert "tail_marker" in device_block

    loop.close()


def test_async_backup_device_emits_hub_code_record_for_network_callback_device(monkeypatch):
    """Wifi (network-callback) devices round-trip through the same raw
    family-0x020C dump path BT/RF use; each command row carries the
    captured library_type / command_code / data_hex so restore can
    replay the record byte-for-byte without any Wifi-Commands-specific
    profile."""

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    def _ir_dump(device_id, command_id=None, *, timeout=10.0):
        return {
            "device_id": device_id,
            "requested_command_id": command_id,
            "total_commands": 1,
            "received_command_count": 1,
            "complete": True,
            "commands": [
                {
                    "command_id": 3,
                    "device_id": device_id,
                    "label": "TV",
                    "ir_blob_hex": "aa bb cc dd",
                    "pages": [
                        {
                            "payload_hex": "01 00 01 01 00 01 09 03 1c 00 00 00 00 4e 21 54 56",
                        }
                    ],
                }
            ],
        }

    monkeypatch.setattr(hub._proxy, "request_ir_command_dump", _ir_dump)

    hub._proxy.state.devices[9] = {
        "name": "Living Room Audio",
        "brand": "Brand",
        "device_class": "wifi_sonos",
        "device_class_code": 0x1C,
    }
    hub._proxy.state.buttons[9] = set()
    hub._proxy._commands_complete.add(9)
    hub._proxy._macros_complete.add(9)

    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        hub._proxy,
        "get_commands_for_entity",
        lambda ent_id, fetch_if_missing=True: ({3: "TV"}, True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_buttons_for_entity",
        lambda ent_id, fetch_if_missing=True: ([], True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_macros_for_activity",
        lambda ent_id, fetch_if_missing=True: ([], True),
    )
    monkeypatch.setattr(hub._proxy, "get_cached_macro_records", lambda ent_id: [])
    monkeypatch.setattr(hub._proxy, "fetch_device_input_record", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        hub._proxy,
        "fetch_device_key_sort",
        lambda *args, **kwargs: {"device_id": 9, "msg_hex": ""},
    )

    result = loop.run_until_complete(hub.async_backup_device(device_id=9))

    assert result is not None
    assert result["complete"] is True
    assert "restore_profile" not in result
    assert result["commands"] == [
        {
            "command_id": 3,
            "name": "TV",
            "restore_data": {
                "transport": "hub_code_record",
                "library_type": 0x1C,
                "command_code": "00 00 00 00 4e 21",
                "data_hex": "aa bb cc dd",
            },
        }
    ]

    loop.close()


@pytest.mark.parametrize(
    ("device_class", "device_class_code"),
    [
        ("bluetooth", 0x03),
        ("rf_433mhz", None),
    ],
)
def test_async_backup_device_emits_hub_code_record_restore_data_for_bt_and_rf(
    monkeypatch,
    device_class: str,
    device_class_code: int | None,
):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    def _ir_dump(device_id, command_id=None, *, timeout=10.0):
        return {
            "device_id": device_id,
            "requested_command_id": command_id,
            "total_commands": 1,
            "received_command_count": 1,
            "complete": True,
            "commands": [
                {
                    "command_id": 5,
                    "device_id": device_id,
                    "label": "Bluetooth",
                    "ir_blob_hex": "aa bb cc dd",
                    "pages": [
                        {
                            "payload_hex": "01 00 01 01 00 01 07 05 03 00 00 00 00 4e 25 42 6c 75 65 74 6f 6f 74 68",
                        }
                    ],
                }
            ],
        }

    monkeypatch.setattr(hub._proxy, "request_ir_command_dump", _ir_dump)

    hub._proxy.state.devices[7] = {
        "name": "Speaker",
        "brand": "Brand",
        "device_class": device_class,
        "device_class_code": device_class_code,
    }
    hub._proxy.state.buttons[7] = set()
    hub._proxy._commands_complete.add(7)
    hub._proxy._macros_complete.add(7)

    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        hub._proxy,
        "get_commands_for_entity",
        lambda ent_id, fetch_if_missing=True: ({5: "Bluetooth"}, True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_buttons_for_entity",
        lambda ent_id, fetch_if_missing=True: ([], True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_macros_for_activity",
        lambda ent_id, fetch_if_missing=True: ([], True),
    )
    monkeypatch.setattr(hub._proxy, "get_cached_macro_records", lambda ent_id: [])
    monkeypatch.setattr(hub._proxy, "fetch_device_input_record", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        hub._proxy,
        "fetch_device_key_sort",
        lambda *args, **kwargs: {"device_id": 7, "msg_hex": ""},
    )

    result = loop.run_until_complete(hub.async_backup_device(device_id=7))

    assert result is not None
    assert result["complete"] is True
    assert result["commands"] == [
        {
            "command_id": 5,
            "name": "Bluetooth",
            "restore_data": {
                "transport": "hub_code_record",
                "library_type": 0x03,
                "command_code": "00 00 00 00 4e 25",
                "data_hex": "aa bb cc dd",
            },
        }
    ]

    loop.close()


def test_async_backup_device_skips_macros_and_inputs_when_unconfigured(monkeypatch):
    """When the device row reports power/inputs are not configured, the
    backup flow must not call REQ_MACROS (the hub fabricates a synthetic
    startup/shutdown placeholder for unconfigured-power devices that we
    must not try to restore) and must not call REQ_ACTIVITY_INPUTS
    (the hub rejects it with a non-success STATUS_ACK). Both lists
    appear empty in the backup, and ``completeness`` is still ``True``.
    """

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    # Unconfigured device: input_mode=0, power_mode=0 (defaults match the
    # "none" capture documented in Phase 7).
    device_config = DeviceConfig(
        name="Denon avr tst",
        brand="Denon",
        device_id=2,
        icon=0x13,
        sort=7,
        code_type=0x0D,
        device_type=0x07,
        hide=0,
        input_flag=0,
        channel=0,
        power_state=0,
        ip_address=None,
        poll_time=0,
        input_mode=0,
        power_mode=0,
        power_style=2,
        share_mode=0,
        tail_marker=1,
    )
    device_payload = build_device_create_payload(device_config, hub_version="X1")
    device_raw_body = device_payload[3:]

    def _ir_dump(device_id, command_id=None, *, timeout=10.0):
        return {
            "device_id": device_id,
            "complete": True,
            "commands": [],
        }

    monkeypatch.setattr(hub._proxy, "request_ir_command_dump", _ir_dump)

    hub._proxy.state.devices[2] = {
        "name": "Denon avr tst",
        "brand": "Denon",
        "device_class": "IR",
        "device_class_code": 0x07,
        "raw_body": device_raw_body,
    }
    hub._proxy.state.commands[2] = {}
    hub._proxy.state.buttons[2] = set()
    hub._proxy._commands_complete.add(2)

    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        hub._proxy,
        "get_commands_for_entity",
        lambda ent_id, fetch_if_missing=True: ({}, True),
    )
    monkeypatch.setattr(
        hub._proxy,
        "get_buttons_for_entity",
        lambda ent_id, fetch_if_missing=True: ([], True),
    )

    # If the flow forgets to skip, these will be hit -- make that loud.
    def _must_not_call_macros(*args, **kwargs):
        raise AssertionError(
            "get_macros_for_activity must not be called for an unconfigured-power device"
        )

    def _must_not_call_inputs(*args, **kwargs):
        raise AssertionError(
            "fetch_device_input_entries must not be called for an unconfigured-inputs device"
        )

    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _must_not_call_macros)
    monkeypatch.setattr(hub._proxy, "fetch_device_input_entries", _must_not_call_inputs)
    monkeypatch.setattr(
        hub._proxy,
        "fetch_device_key_sort",
        lambda *args, **kwargs: {"device_id": 2, "msg_hex": ""},
    )
    monkeypatch.setattr(hub._proxy, "get_cached_macro_records", lambda ent_id: [])

    result = loop.run_until_complete(hub.async_backup_device(device_id=2))

    assert result is not None
    assert result["device"]["inputs_configured"] is False
    assert result["macros"] == []
    # Slim format: no top-level "inputs" list and no "completeness" block.
    assert "inputs" not in result
    assert "completeness" not in result
    # "empty by design" is still a faithful, complete capture.
    assert result["complete"] is True

    loop.close()


def test_async_persist_ir_blob_refreshes_commands_and_returns_result(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub._proxy.state.devices[11] = {"device_class": "ir"}
    full_refresh_calls: list[tuple[int, float]] = []
    single_refresh_calls: list[tuple[int, int, float, bool]] = []

    async def _refresh_commands(device_id: int, *, wait_timeout: float = 10.0):
        full_refresh_calls.append((device_id, wait_timeout))

    async def _refresh_single_command(
        device_id: int,
        command_id: int,
        *,
        wait_timeout: float = 10.0,
        force_refresh: bool = False,
    ):
        single_refresh_calls.append(
            (device_id, command_id, wait_timeout, force_refresh)
        )
        return {command_id: "New Command"}

    async def _persist_cache():
        return True

    monkeypatch.setattr(hub, "async_fetch_device_commands", _refresh_commands)
    monkeypatch.setattr(hub, "async_fetch_single_device_command", _refresh_single_command)
    monkeypatch.setattr(hub, "_async_persist_cache_if_enabled", _persist_cache)
    monkeypatch.setattr(
        hub._proxy,
        "persist_ir_blob",
        lambda **kwargs: {
            "status": "success",
            "device_id": kwargs["device_id"],
            "command_id": 112,
            "command_name": kwargs["command_name"],
            "page_count": 4,
        },
    )

    result = loop.run_until_complete(
        hub.async_persist_ir_blob(
            device_id=11,
            command_name="New Command",
            blob=b"\x00" * 10,
        )
    )

    assert result == {
        "status": "success",
        "device_id": 11,
        "command_id": 112,
        "command_name": "New Command",
        "page_count": 4,
    }
    assert full_refresh_calls == [(11, 10.0)]
    # Post-persist single-command refresh now runs as background housekeeping
    # with a capped budget (refresh_budget = min(2.0, wait_timeout)) and
    # force_refresh=False — the persist itself has already settled on the
    # hub, so this pass just re-pulls the metadata on a best-effort basis.
    assert single_refresh_calls == [(11, 112, 2.0, False)]

    loop.close()


def test_async_fetch_single_device_command_force_refresh_bypasses_cached_label(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub._proxy.state.commands[11] = {112: "Optimistic Label"}
    call_log: list[tuple[bool, bool]] = []

    def _get_single_command_for_entity(
        ent_id: int,
        command_id: int,
        *,
        fetch_if_missing: bool = True,
    ):
        cached = command_id in hub._proxy.state.commands.get(ent_id & 0xFF, {})
        call_log.append((fetch_if_missing, cached))
        if fetch_if_missing:
            assert cached is False
            return ({}, False)
        hub._proxy.state.commands.setdefault(ent_id & 0xFF, {})[command_id] = "Hub Label"
        return ({command_id: "Hub Label"}, True)

    monkeypatch.setattr(
        hub._proxy,
        "get_single_command_for_entity",
        _get_single_command_for_entity,
    )

    result = loop.run_until_complete(
        hub.async_fetch_single_device_command(
            11,
            112,
            wait_timeout=0.2,
            force_refresh=True,
        )
    )

    assert result == {112: "Hub Label"}
    assert hub._proxy.state.commands[11][112] == "Hub Label"
    assert call_log == [(True, False), (False, False)]

    loop.close()


def test_describe_favorites_order_includes_favorites_and_macros() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_lo = 0x65
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x06, "source": "activity_map"},
    ]
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x06, "Command 6")
    hub._proxy.state.replace_activity_macros(
        act_lo,
        [{"command_id": 0x09, "label": "Test Macro"}],
    )

    described = hub.describe_favorites_order(act_lo, [(0x09, 0x01), (0x01, 0x02)])

    assert described == [
        {
            "fav_id": 0x09,
            "button_id": 0x09,
            "slot": 0x01,
            "type": "macro",
            "name": "Test Macro",
            "command_id": 0x09,
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

    loop.close()


def test_describe_favorites_order_appends_cached_entries_missing_from_hub_order() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_lo = 0x65
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x1A, "source": "keymap"},
        {"button_id": 0x02, "device_id": 0x04, "command_id": 0x20, "source": "keymap"},
        {"button_id": 0x03, "device_id": 0x08, "command_id": 0x01, "source": "keymap"},
    ]
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x1A, "Ok")
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x20, "Yellow")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x01, "Dim the lights")

    described = hub.describe_favorites_order(act_lo, [(0x01, 0x01), (0x02, 0x02)])

    assert described == [
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

    loop.close()


def test_describe_favorites_order_matches_x1s_macro_and_favorite_ui_order() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_lo = 0x65
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x1A, "source": "keymap"},
        {"button_id": 0x02, "device_id": 0x04, "command_id": 0x20, "source": "keymap"},
        {"button_id": 0x03, "device_id": 0x08, "command_id": 0x01, "source": "keymap"},
        {"button_id": 0x04, "device_id": 0x08, "command_id": 0x02, "source": "keymap"},
        {"button_id": 0x05, "device_id": 0x08, "command_id": 0x03, "source": "keymap"},
        {"button_id": 0x06, "device_id": 0x08, "command_id": 0x04, "source": "keymap"},
        {"button_id": 0x07, "device_id": 0x08, "command_id": 0x05, "source": "keymap"},
    ]
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x1A, "Ok")
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x20, "Yellow")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x01, "Dim the lights")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x02, "Close the curtains")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x03, "Switch off the alarm")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x04, "Eat bananas")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x05, "Spend money")

    described = hub.describe_favorites_order(
        act_lo,
        [(0x05, 0x01), (0x06, 0x02), (0x07, 0x03), (0x01, 0x04), (0x02, 0x05), (0x03, 0x06), (0x04, 0x07)],
    )

    assert [(entry["fav_id"], entry["name"], entry["slot"]) for entry in described] == [
        (0x05, "Switch off the alarm", 0x01),
        (0x06, "Eat bananas", 0x02),
        (0x07, "Spend money", 0x03),
        (0x01, "Ok", 0x04),
        (0x02, "Yellow", 0x05),
        (0x03, "Dim the lights", 0x06),
        (0x04, "Close the curtains", 0x07),
    ]

    loop.close()


def test_async_get_cache_contents_includes_activity_workspace_payload() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_id = 0x65
    dev_id = 0x04
    keybinding_button_id = 0xB7

    hub.activities[act_id] = {"name": "Movies", "active": True}
    hub.devices[dev_id] = {"name": "Denon", "device_class": "ir", "device_class_code": 0x0D}
    hub._proxy.state.devices[dev_id] = {"name": "Denon", "device_class": "ir", "device_class_code": 0x0D}
    hub._proxy.state.commands[dev_id] = {0x06: "Power", 0x07: "Volume Up"}
    hub._proxy.state.activity_favorite_slots[act_id] = [
        {"button_id": 0x01, "device_id": dev_id, "command_id": 0x06, "source": "activity_map"}
    ]
    hub._proxy.state.record_favorite_label(act_id, dev_id, 0x06, "Power")
    hub._proxy.state.activity_keybinding_slots[act_id] = [
        {"button_id": keybinding_button_id, "device_id": dev_id, "command_id": 0x07, "source": "keymap"}
    ]
    hub._proxy.state.record_keybinding_label(act_id, dev_id, 0x07, "Volume Up")
    hub._proxy.state.replace_activity_macros(act_id, [{"command_id": 0x09, "label": "Night Mode"}])

    payload = loop.run_until_complete(hub.async_get_cache_contents())

    assert payload["entry_id"] == "entry-id"
    assert payload["name"] == "hub-name"
    assert payload["cache_generation"] == 0
    assert payload["activities"] == [
        {
            "id": act_id,
            "name": "Movies",
            "is_active": True,
            "favorite_count": 1,
            "keybinding_count": 0,
            "macro_count": 1,
        }
    ]
    assert payload["activity_favorites"] == {
        "101": [
            {
                "button_id": 0x01,
                "device_id": dev_id,
                "device_name": "Denon",
                "command_id": 0x06,
                "label": "Power",
                "source": "activity_map",
            }
        ]
    }
    assert payload["activity_keybindings"] == {}
    assert payload["devices_list"] == [
        {
            "id": dev_id,
            "name": "Denon",
            "device_class": "ir",
            "device_class_code": 0x0D,
            "command_count": 2,
            "has_commands": True,
        }
    ]

    loop.close()


def test_cache_generation_increments_for_cache_visible_updates(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    assert hub.cache_generation == 0

    monkeypatch.setattr(hub._proxy, "get_devices", lambda: ({0x01: {"name": "TV"}}, True))
    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))
    assert hub.cache_generation == 1

    hub._on_commands_burst("commands:1")
    loop.run_until_complete(asyncio.sleep(0))
    assert hub.cache_generation == 2

    hub._on_macros_burst("macros:1")
    loop.run_until_complete(asyncio.sleep(0))
    assert hub.cache_generation == 3

    loop.close()


def test_identical_activity_refresh_does_not_bump_cache_generation(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.activities = {101: {"name": "Watch TV", "active": False, "needs_confirm": False}}

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch TV", "active": False, "needs_confirm": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.cache_generation == 0
    assert hub.activities[101]["name"] == "Watch TV"

    loop.close()


def test_activity_active_flag_changes_without_bumping_cache_generation(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.activities = {101: {"name": "Watch TV", "active": False, "needs_confirm": False}}
    hub.current_activity = None

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch TV", "active": True, "needs_confirm": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.cache_generation == 0
    assert hub.current_activity == 101
    assert hub.activities[101]["active"] is True

    loop.close()


def test_activity_catalog_name_change_bumps_cache_generation(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.activities = {101: {"name": "Old Name", "active": False, "needs_confirm": False}}

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "New Name", "active": False, "needs_confirm": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.cache_generation == 1
    assert hub.activities[101]["name"] == "New Name"

    loop.close()


def test_async_restore_persistent_cache_bumps_cache_generation():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    loop.run_until_complete(hub.async_restore_persistent_cache({}))

    assert hub.cache_generation == 1

    loop.close()


def test_async_poll_remote_battery_updates_cached_state(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version=HUB_VERSION_X2,
    )
    calls: list[float] = []

    def _poll(*, timeout: float = 2.0):
        calls.append(timeout)
        return {
            "ok": True,
            "decoded": {
                "battery": 84,
                "name": "Remote 1",
                "remote_id": 8,
                "remote_id_hex": "00 00 08",
                "accessory_id": 8,
                "online": True,
                "hardware_version": 4,
                "firmware_version": 7,
                "production_batch_hex": "20 25 06 10",
            },
        }

    monkeypatch.setattr(hub._proxy, "poll_x2_remote_battery", _poll)

    result = loop.run_until_complete(
        hub.async_poll_remote_battery(wait_timeout=1.25)
    )

    assert calls == [1.25]
    assert result["ok"] is True
    assert hub.remote_battery_level == 84
    assert hub.get_remote_battery_state()["level"] == 84
    attrs = hub.get_remote_battery_attributes()
    assert attrs["last_poll_status"] == "success"
    assert attrs["remote_name"] == "Remote 1"
    assert attrs["remote_id"] == 8
    assert attrs["remote_id_hex"] == "00 00 08"
    assert attrs["accessory_id"] == 8

    loop.close()


def test_async_initial_sync_fetches_banner_first_and_persists_cache(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        enabled = True

        def __init__(self):
            self.saved = []

        async def async_set_hub_cache(self, entry_id, payload):
            self.saved.append((entry_id, payload))

    store = _Store()

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    entry = SimpleNamespace(
        entry_id="entry-id",
        data={
            "name": "hub-name",
            "host": "127.0.0.1",
            "port": 1234,
            "mac": "aa:bb:cc:dd:ee:ff",
            "mdns_txt": {"MAC": "aa:bb:cc:dd:ee:ff"},
            "mdns_version": "X1",
        },
        options={"mdns_version": "X1"},
        title="old title",
    )
    hass._entries["entry-id"] = entry

    calls: list[str] = []
    discovery_updates: list[tuple[dict[str, str], str | None]] = []
    device_registry = FakeDeviceRegistry(
        SimpleNamespace(id="device-1", name="hub-name", name_by_user=None)
    )

    def _fetch_banner_info(*, force_refresh=True, timeout=2.0):
        calls.append("banner")
        info = {
            "model": "X2",
            "production_batch": "20221120",
            "firmware_version": 8,
            "name": "X2 HUB",
        }
        hub._proxy._banner_info = dict(info)
        return (info, True)

    def _get_activities(*, force_refresh=True):
        calls.append(f"activities:{force_refresh}")
        return ({}, False)

    def _get_devices(*, force_refresh=False):
        calls.append(f"devices:{force_refresh}")
        return ({}, False)

    async def _get_store():
        return store

    monkeypatch.setattr(hub._proxy, "fetch_banner_info", _fetch_banner_info)
    monkeypatch.setattr(hub._proxy, "get_activities", _get_activities)
    monkeypatch.setattr(hub._proxy, "get_devices", _get_devices)
    monkeypatch.setattr(hub, "_async_get_persistent_cache_store", _get_store)
    monkeypatch.setattr(hub_module.dr, "async_get", lambda hass: device_registry)
    monkeypatch.setattr(
        hub._proxy,
        "update_discovery_identity",
        lambda *, mdns_txt, hub_version: discovery_updates.append((dict(mdns_txt), hub_version)) or True,
    )

    loop.run_until_complete(hub._async_initial_sync())

    assert calls == ["banner", "devices:True", "activities:True"]
    assert hub.banner_model == "X2"
    assert hub.production_batch == "20221120"
    assert hub.hub_firmware_version == 8
    assert hub.name == "X2 HUB"
    assert hub.version == "X2"
    assert hub.mdns_txt["NAME"] == "X2 HUB"
    assert hub.mdns_txt["HVER"] == "3"
    assert hub.mdns_txt["AVER"] == "8"
    assert entry.data["name"] == "X2 HUB"
    assert entry.data["mdns_version"] == "X2"
    assert entry.data["mdns_txt"]["NAME"] == "X2 HUB"
    assert entry.options["mdns_version"] == "X2"
    assert discovery_updates[-1][0]["NAME"] == "X2 HUB"
    assert discovery_updates[-1][1] == "X2"
    assert device_registry.updated == [("device-1", {"name": "X2 HUB"})]
    assert store.saved
    assert store.saved[-1][1]["banner_info"]["firmware_version"] == 8

    loop.close()


def test_async_sync_authoritative_identity_skips_device_registry_rename_when_name_matches(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "X2 HUB",
        "127.0.0.1",
        1234,
        {"MAC": "aa:bb:cc:dd:ee:ff"},
        9999,
        10000,
        True,
        False,
    )
    entry = SimpleNamespace(
        entry_id="entry-id",
        data={
            "name": "X2 HUB",
            "host": "127.0.0.1",
            "port": 1234,
            "mac": "aa:bb:cc:dd:ee:ff",
            "mdns_txt": {"MAC": "aa:bb:cc:dd:ee:ff"},
            "mdns_version": "X1",
        },
        options={"mdns_version": "X1"},
        title="old title",
    )
    hass._entries["entry-id"] = entry

    rename_calls = []
    monkeypatch.setattr(
        hub,
        "_async_update_device_registry_name",
        lambda next_name: rename_calls.append(next_name) or asyncio.sleep(0),
    )
    monkeypatch.setattr(hub._proxy, "update_discovery_identity", lambda **kwargs: True)

    loop.run_until_complete(
        hub._async_sync_authoritative_identity(
            {
                "model": "X2",
                "production_batch": "20221120",
                "firmware_version": 8,
                "name": "X2 HUB",
            }
        )
    )

    assert rename_calls == []

    loop.close()


def test_device_fetch_waits_until_command_burst_completes(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    ent_id = 0x0202
    ready = {"value": False}

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)

    def _get_commands(_ent_id: int, *, fetch_if_missing: bool = True):
        if ready["value"]:
            return ({0x01: "Power"}, True)
        return ({}, False)

    monkeypatch.setattr(hub._proxy, "get_commands_for_entity", _get_commands)

    loop.call_later(0.1, lambda: ready.__setitem__("value", True))

    loop.run_until_complete(hub.async_fetch_device_commands(ent_id))

    assert ready["value"] is True
    assert ent_id not in hub._commands_in_flight

    loop.close()


def test_roku_http_post_updates_last_ip_command_state():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/Lights_On/Living_Room_TV",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["entity_id"] == 7
    assert ip_command["command_label"] == "Lights On"
    assert ip_command["entity_name"] == "Living Room TV"
    assert ip_command["press_type"] == "short"

    assert hub.get_app_activations() == []

    loop.close()


def test_roku_http_post_parses_long_press_suffix():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/Lights_On/Living_Room_TV/long",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["command_label"] == "Lights On"
    assert ip_command["entity_name"] == "Living Room TV"
    assert ip_command["press_type"] == "long"

    loop.close()


def test_roku_http_post_runs_configured_short_press_action():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)
    service_calls: list[tuple[str, str, dict, dict | None, bool]] = []
    async def _async_call(domain, service, data, target=None, blocking=False):
        service_calls.append((domain, service, data, target, blocking))
    async def _async_get_hub_config(_entry_id, **_kwargs):
        return {
            "commands": [
                {
                    "name": "Lights On",
                    "action": {
                        "action": "perform-action",
                        "perform_action": "light.turn_on",
                        "target": {"entity_id": "light.living_room"},
                    },
                }
            ]
        }
    hass.services = SimpleNamespace(
        async_call=_async_call
    )
    hass.data = {
        "sofabaton_x1s": {
            "command_config_store": SimpleNamespace(
                async_get_hub_config=_async_get_hub_config
            )
        }
    }

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/Lights_On/Living_Room_TV",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    assert service_calls == [
        (
            "light",
            "turn_on",
            {},
            {"entity_id": "light.living_room"},
            True,
        )
    ]

    loop.close()


def test_roku_http_post_runs_configured_long_press_action():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)
    service_calls: list[tuple[str, str, dict, dict | None, bool]] = []
    async def _async_call(domain, service, data, target=None, blocking=False):
        service_calls.append((domain, service, data, target, blocking))
    async def _async_get_hub_config(_entry_id, **_kwargs):
        return {
            "commands": [
                {
                    "name": "Lights On",
                    "long_press_enabled": True,
                    "action": {
                        "action": "perform-action",
                        "perform_action": "light.turn_off",
                        "target": {"entity_id": "light.short_press_only"},
                    },
                    "long_press_action": {
                        "action": "perform-action",
                        "perform_action": "light.turn_on",
                        "target": {"entity_id": "light.long_press_target"},
                    },
                }
            ]
        }
    hass.services = SimpleNamespace(
        async_call=_async_call
    )
    hass.data = {
        "sofabaton_x1s": {
            "command_config_store": SimpleNamespace(
                async_get_hub_config=_async_get_hub_config
            )
        }
    }

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/Lights_On/Living_Room_TV/long",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    assert service_calls == [
        (
            "light",
            "turn_on",
            {},
            {"entity_id": "light.long_press_target"},
            True,
        )
    ]

    loop.close()


def test_roku_http_post_resolves_slot_callback_from_migrated_single_device_store():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)
    service_calls: list[tuple[str, str, dict, dict | None, bool]] = []

    async def _async_call(domain, service, data, target=None, blocking=False):
        service_calls.append((domain, service, data, target, blocking))

    class _Store:
        def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
            if entry_id != "entry-id":
                return []
            if hub_device_id == 7:
                return [
                    {
                        "name": "Legacy Slot",
                        "action": {
                            "action": "perform-action",
                            "perform_action": "light.turn_on",
                            "target": {"entity_id": "light.deployed_target"},
                        },
                    }
                ]
            return []

        def get_live_wifi_command_slot(self, entry_id, *, command_index, hub_device_id=None, device_key=None):
            if entry_id != "entry-id" or hub_device_id != 7 or command_index != 0:
                return None
            return {
                "name": "Edited Slot",
                "action": {
                    "action": "perform-action",
                    "perform_action": "light.turn_on",
                    "target": {"entity_id": "light.live_target"},
                },
            }

        async def async_get_hub_config(self, _entry_id, **_kwargs):
            return {"commands": []}

    hass.services = SimpleNamespace(async_call=_async_call)
    hass.data = {
        "sofabaton_x1s": {
            "command_config_store": _Store()
        }
    }

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/0/short",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["command_label"] == "Legacy Slot"
    assert service_calls == [
        (
            "light",
            "turn_on",
            {},
            {"entity_id": "light.live_target"},
            True,
        )
    ]

    loop.close()


def test_roku_http_post_new_format_uses_cached_device_name_when_local_catalog_is_stale():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    class _Store:
        def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
            if entry_id == "entry-id" and hub_device_id == 7:
                return [{"name": "Edited Slot"}]
            return []

        def get_live_wifi_command_slot(self, entry_id, *, command_index, hub_device_id=None, device_key=None):
            return None

        async def async_get_hub_config(self, _entry_id, **_kwargs):
            return {"commands": []}

    hass.data = {
        "sofabaton_x1s": {
            "command_config_store": _Store()
        }
    }

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True
    hub.devices = {}
    hub._proxy.state.devices[7] = {
        "brand": "m3tac0de-default-hash",
        "name": "Fresh Wifi Device",
    }

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/7/0/short",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["command_label"] == "Edited Slot"
    assert ip_command["entity_name"] == "Fresh Wifi Device"

    loop.close()


def test_command_to_favorite_executor_job_uses_partial_not_kwargs():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    class StrictHass(FakeHass):
        async def async_add_executor_job(self, func, *args):  # no kwargs on purpose
            return func(*args)

    hass = StrictHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    calls: list[tuple[int, int, int, int]] = []

    def _command_to_favorite(activity_id, device_id, command_id, *, slot_id=0):
        calls.append((activity_id, device_id, command_id, slot_id))
        return {"status": "success"}

    hub._proxy.command_to_favorite = _command_to_favorite  # type: ignore[method-assign]

    result = loop.run_until_complete(
        hub.async_command_to_favorite(
            activity_id=101,
            device_id=6,
            command_id=4,
            slot_id=3,
        )
    )

    assert result == {"status": "success"}
    assert calls == [(101, 6, 4, 3)]

    loop.close()


def test_command_to_button_executor_job_uses_partial_not_kwargs():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    class StrictHass(FakeHass):
        async def async_add_executor_job(self, func, *args):  # no kwargs on purpose
            return func(*args)

    hass = StrictHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    calls: list[tuple] = []

    def _command_to_button(activity_id, button_id, device_id, command_id, **kwargs):
        calls.append((activity_id, button_id, device_id, command_id, kwargs))
        return {"status": "success"}

    hub._proxy.command_to_button = _command_to_button  # type: ignore[method-assign]

    result = loop.run_until_complete(
        hub.async_command_to_button(
            activity_id=101,
            button_id=0xC1,
            device_id=5,
            command_id=2,
        )
    )

    assert result == {"status": "success"}
    assert calls[0][:4] == (101, 0xC1, 5, 2)

    loop.close()




def test_clear_cache_for_executor_job_uses_partial_not_kwargs(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    class StrictHass(FakeHass):
        async def async_add_executor_job(self, func, *args):  # no kwargs on purpose
            return func(*args)

    hass = StrictHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    cleared: list[tuple[int, str]] = []

    def _clear_cached_entity_detail(ent_id, *, kind):
        cleared.append((ent_id, kind))

    hub._proxy.clear_cached_entity_detail = _clear_cached_entity_detail  # type: ignore[method-assign]
    hub._proxy.get_devices = lambda: ({}, True)  # type: ignore[method-assign]

    sent_signals: list[tuple[str, str]] = []

    def _fake_dispatcher_send(_hass, signal):
        sent_signals.append(("signal", signal))

    monkeypatch.setattr("custom_components.sofabaton_x1s.hub.async_dispatcher_send", _fake_dispatcher_send)

    loop.run_until_complete(hub.async_clear_cache_for(kind="activity", ent_id=42))

    assert cleared == [(42, "activity")]
    assert sent_signals

    loop.close()

def test_on_activities_burst_syncs_current_activity_from_active_flag(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch a movie", "active": True, "needs_confirm": False}}, True),
    )

    hub.current_activity = None
    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 101

    loop.close()


def test_on_activity_list_update_syncs_current_activity_from_active_flag(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({102: {"name": "Play Steamdeck", "active": True, "needs_confirm": False}}, False),
    )

    hub.current_activity = None
    hub._on_activity_list_update()
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 102

    loop.close()


def test_activity_list_update_does_not_clear_current_until_burst_complete(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.current_activity = 101

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch a movie", "active": False}}, False),
    )

    hub._on_activity_list_update()
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 101

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({102: {"name": "Play Steamdeck", "active": True}}, False),
    )

    hub._on_activity_list_update()
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity == 102

    loop.close()


def test_activities_burst_can_clear_current_when_no_activity_active(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.current_activity = 101

    monkeypatch.setattr(
        hub._proxy,
        "get_activities",
        lambda: ({101: {"name": "Watch a movie", "active": False}}, True),
    )

    hub._on_activities_burst("activities")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.current_activity is None

    loop.close()



def test_sync_command_config_omits_favorite_slot_to_avoid_overwrite(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    requested_maps: list[int] = []
    requested_buttons: list[tuple[int, bool]] = []

    monkeypatch.setattr(
        hub._proxy,
        "request_activity_mapping",
        lambda _act: requested_maps.append(_act) or True,
    )

    def _get_buttons_for_entity(ent_id: int, *, fetch_if_missing: bool = True):
        requested_buttons.append((ent_id, fetch_if_missing))
        return ([], True)

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", _get_buttons_for_entity)

    cache_refresh_calls: list[tuple[int, bool, bool, bool]] = []
    macro_refresh_calls: list[tuple[str, int]] = []

    def _clear_entity_cache(ent_id: int, clear_buttons: bool = False, clear_favorites: bool = False, clear_macros: bool = False):
        cache_refresh_calls.append((ent_id, clear_buttons, clear_favorites, clear_macros))
        if clear_macros:
            macro_refresh_calls.append(("clear", ent_id))

    def _get_macros_for_activity(act_id: int, *, fetch_if_missing: bool = True):
        macro_refresh_calls.append(("fetch", act_id))
        return ([], False)

    monkeypatch.setattr(hub._proxy, "clear_entity_cache", _clear_entity_cache)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _get_macros_for_activity)

    create_calls: list[dict[str, object]] = []

    async def _create(*_args, **_kwargs):
        create_calls.append(dict(_kwargs))
        return {"device_id": 9, "status": "success"}

    async def _add_activity(*_args, **_kwargs):
        return {"status": "success"}

    favorite_calls: list[tuple[int, int, int, dict]] = []

    async def _favorite(activity_id, device_id, command_id, **kwargs):
        favorite_calls.append((activity_id, device_id, command_id, dict(kwargs)))
        return {"status": "success"}

    async def _button(*_args, **_kwargs):
        return {"status": "success"}

    async def _delete(*_args, **_kwargs):
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_command_to_favorite", _favorite)
    monkeypatch.setattr(hub, "async_command_to_button", _button)
    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )

    resync_calls: list[bool] = []

    async def _resync_remote():
        resync_calls.append(True)

    monkeypatch.setattr(hub, "async_resync_remote", _resync_remote)

    payload = {
        "commands": [
            {
                "name": "Command 1",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["101"],
                "action": {"action": "perform-action"},
            }
        ],
        "power_on_command_id": 1,
        "commands_hash": "abc",
    }

    loop.run_until_complete(hub.async_sync_command_config(command_payload=payload, request_port=8060))

    assert create_calls == [
        {
            "device_name": "Home Assistant",
            "commands": [
                {
                    "display_name": "Command 1",
                    "trigger_name": "Command 1",
                    "press_type": "short",
                    "command_index": 0,
                },
                {
                    "display_name": "Command 1 Long Press",
                    "trigger_name": "Command 1",
                    "press_type": "long",
                    "command_index": 0,
                },
            ],
            "request_port": 8060,
            "brand_name": "m3-default-abc",
            "power_on_command_id": 1,
            "power_off_command_id": None,
            "input_command_ids": None,
        }
    ]
    assert favorite_calls == [(101, 9, 1, {"refresh_after_write": False})]
    assert requested_maps == [101]
    assert requested_buttons == [(101, True)]
    assert cache_refresh_calls == [(101, True, False, True)]
    assert macro_refresh_calls == [("clear", 101), ("fetch", 101)]
    assert resync_calls == [True]

    loop.close()


def test_sync_command_config_primes_wifi_device_commands_before_refreshing_favorites(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    async def _refresh_devices(_timeout=15.0):
        return {}

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _refresh_devices)
    monkeypatch.setattr(
        hub,
        "async_create_wifi_device",
        lambda *_a, **_k: asyncio.sleep(0, result={"device_id": 9, "status": "success"}),
    )
    monkeypatch.setattr(
        hub,
        "async_add_device_to_activity",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}),
    )
    monkeypatch.setattr(
        hub,
        "async_command_to_favorite",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success", "fav_id": 1}),
    )
    monkeypatch.setattr(
        hub,
        "async_request_favorites_order",
        lambda *_a, **_k: asyncio.sleep(0, result=[(1, 1)]),
    )
    monkeypatch.setattr(
        hub,
        "async_reorder_favorites",
        lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}),
    )
    monkeypatch.setattr(hub, "async_resync_remote", lambda: asyncio.sleep(0))

    call_order: list[str] = []

    async def _fetch_device_commands(ent_id: int, *, wait_timeout: float = 10.0):
        assert ent_id == 9
        call_order.append("req_commands")
        hub._proxy.state.commands[ent_id & 0xFF] = {1: "Scene Lights"}
        hub._proxy._commands_complete.add(ent_id & 0xFF)

    def _request_map(act_id: int) -> bool:
        call_order.append("request_activity_mapping")
        hub._proxy._activity_map_complete.add(act_id & 0xFF)
        return True

    def _get_buttons_for_entity(act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("get_buttons_for_entity")
        hub._proxy.state.activity_favorite_slots[act_id & 0xFF] = [
            {"button_id": 1, "device_id": 9, "command_id": 1, "source": "cache"}
        ]
        return ([], True)

    original_ensure_commands = hub._proxy.ensure_commands_for_activity

    def _ensure_commands_for_activity(act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("ensure_commands_for_activity")
        return original_ensure_commands(act_id, fetch_if_missing=fetch_if_missing)

    monkeypatch.setattr(hub, "async_fetch_device_commands", _fetch_device_commands)
    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", _get_buttons_for_entity)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_a, **_k: None)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_a, **_k: ([], True))
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", _ensure_commands_for_activity)
    monkeypatch.setattr(
        hub._proxy,
        "get_single_command_for_entity",
        lambda *_a, **_k: pytest.fail(
            "favorite label resolution should reuse cached REQ_COMMANDS data"
        ),
    )

    payload = {
        "commands": [
            {
                "name": "Scene Lights",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["101"],
                "action": {"action": "perform-action"},
            }
        ],
        "commands_hash": "abc",
    }

    loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert call_order.index("req_commands") < call_order.index("request_activity_mapping")
    assert call_order.index("request_activity_mapping") < call_order.index(
        "ensure_commands_for_activity"
    )
    assert hub.get_activity_favorites_for(101) == [
        {"name": "Scene Lights", "device_id": 9, "command_id": 1}
    ]

    loop.close()


def test_commands_burst_with_targeted_suffix_updates_activity_fetch_state(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_id = 0x0101
    act_lo = act_id & 0xFF
    dev_id = 0x0202
    cmd_id = 0x002A

    hub._commands_in_flight.add(act_id)
    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": dev_id, "command_id": cmd_id}
    ]
    hub._proxy.state.record_favorite_label(act_lo, dev_id, cmd_id, "Fav Label")

    hub._on_commands_burst(f"commands:{dev_id & 0xFF}:{cmd_id & 0xFF}")
    loop.run_until_complete(asyncio.sleep(0))

    assert act_id not in hub._commands_in_flight

    loop.close()


def test_activity_fetch_requests_activity_map_before_favorite_command_resolution(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_id = 0x0101
    act_lo = act_id & 0xFF
    call_order: list[str] = []

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}

    monkeypatch.setattr(hub, "_reset_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))
    async def _noop_wait(*_):
        return None

    monkeypatch.setattr(hub, "_async_wait_for_buttons_ready", _noop_wait)

    def _request_map(_act_id: int) -> bool:
        call_order.append("request_activity_mapping")
        hub._proxy._activity_map_complete.add(_act_id & 0xFF)
        return True

    def _ensure_commands(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("ensure_commands_for_activity")
        return ({}, True)

    def _get_macros(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("get_macros_for_activity")
        return ([], True)

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", _ensure_commands)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _get_macros)

    loop.run_until_complete(hub.async_fetch_device_commands(act_id))

    assert call_order.index("request_activity_mapping") < call_order.index("ensure_commands_for_activity")

    loop.close()


def test_prime_buttons_requests_activity_map_before_favorite_command_resolution(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_id = 0x0101
    act_lo = act_id & 0xFF
    call_order: list[str] = []

    hub._proxy.state.activities[act_lo] = {"name": "Test Activity"}

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))

    def _request_map(_act_id: int) -> bool:
        call_order.append("request_activity_mapping")
        hub._proxy._activity_map_complete.add(_act_id & 0xFF)
        return True

    def _ensure_commands(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("ensure_commands_for_activity")
        return ({}, True)

    def _get_macros(_act_id: int, *, fetch_if_missing: bool = True):
        call_order.append("get_macros_for_activity")
        return ([], True)

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", _ensure_commands)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", _get_macros)

    loop.run_until_complete(hub._async_prime_buttons_for(act_id))

    assert call_order.index("request_activity_mapping") < call_order.index("ensure_commands_for_activity")

    loop.close()


def test_sync_command_config_with_zero_configured_slots_deletes_managed_only(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    hub.devices = {
        11: {"brand": "m3tac0de-oldhash", "name": "Managed Device"},
        12: {"brand": "Other", "name": "Other Device"},
    }

    deleted: list[int] = []
    enabled_calls: list[bool] = []

    async def _delete(dev_id, *_args, **_kwargs):
        deleted.append(dev_id)
        return {"status": "success"}

    async def _create(*_args, **_kwargs):
        raise AssertionError("create should not be called when no slots are configured")

    async def _set_enabled(enable: bool):
        enabled_calls.append(enable)
        hub.roku_server_enabled = enable

    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _set_enabled)

    payload = {
        "commands": [],
        "commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert deleted == [11]
    assert result["status"] == "success"
    assert result["wifi_device_id"] is None
    assert result["deleted_managed_devices"] == 1
    assert enabled_calls == [False]

    progress = hub.get_command_sync_progress()
    assert progress["status"] == "success"
    assert progress["commands_hash"] == "abc"
    assert progress["current_step"] == 7


def test_sync_command_config_with_zero_slots_does_not_enable_wifi_device(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = False

    calls: list[bool] = []

    async def _set_enabled(enable: bool):
        calls.append(enable)
        hub.roku_server_enabled = enable

    async def _delete(*_args, **_kwargs):
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _set_enabled)
    monkeypatch.setattr(hub, "async_delete_device", _delete)

    resync_calls: list[bool] = []

    async def _resync_remote():
        resync_calls.append(True)

    monkeypatch.setattr(hub, "async_resync_remote", _resync_remote)

    payload = {
        "commands": [],
        "commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert result["status"] == "success"
    assert calls == []
    assert resync_calls == []

    loop.close()


def test_sync_command_config_refreshes_devices_before_managed_delete(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = False

    # Local cache is stale and does not include the managed device.
    hub.devices = {12: {"brand": "Other", "name": "Other Device"}}

    # Fresh device burst includes a managed m3tac0de-* device that should be deleted.
    snapshot = {
        11: {"brand": "m3tac0de-newhash", "name": "Managed Device"},
        12: {"brand": "Other", "name": "Other Device"},
    }
    ready = {"value": False}

    monkeypatch.setattr(hub._proxy, "get_devices", lambda: (snapshot, ready["value"]))

    request_calls = {"count": 0}

    def _request_devices():
        request_calls["count"] += 1
        loop.call_later(
            0.05,
            lambda: (
                ready.__setitem__("value", True),
                hub._on_devices_burst("devices"),
            ),
        )
        return True

    monkeypatch.setattr(hub._proxy, "request_devices", _request_devices)

    deleted: list[int] = []

    async def _delete(dev_id, *_args, **_kwargs):
        deleted.append(dev_id)
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_delete_device", _delete)

    payload = {
        "commands": [],
        "commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert request_calls["count"] == 1
    assert deleted == [11]
    assert result["deleted_managed_devices"] == 1

    loop.close()



def test_refresh_devices_snapshot_default_timeout_is_15_seconds():
    assert (
        SofabatonHub._async_refresh_devices_snapshot.__defaults__ == (15.0,)
    )

def test_sync_command_config_enables_wifi_device_before_sync(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.roku_server_enabled = False

    enable_calls: list[bool] = []

    async def _enable(enabled: bool):
        enable_calls.append(enabled)
        hub.roku_server_enabled = enabled

    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _enable)
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.roku_listener.async_get_roku_listener",
        lambda _hass: asyncio.sleep(0, result=SimpleNamespace(get_last_start_error=lambda: None)),
    )
    monkeypatch.setattr(hub._proxy, "request_activity_mapping", lambda _act: True)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([], True))
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_, **__: None)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], True))

    async def _create(*_args, **_kwargs):
        return {"device_id": 9, "status": "success"}

    async def _add_activity(*_args, **_kwargs):
        return {"status": "success"}

    async def _favorite(*_args, **_kwargs):
        return {"status": "success"}

    async def _button(*_args, **_kwargs):
        return {"status": "success"}

    async def _delete(*_args, **_kwargs):
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_command_to_favorite", _favorite)
    monkeypatch.setattr(hub, "async_command_to_button", _button)
    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )

    resync_calls: list[bool] = []

    async def _resync_remote():
        resync_calls.append(True)

    monkeypatch.setattr(hub, "async_resync_remote", _resync_remote)

    payload = {
        "commands": [
            {
                "name": "Command 1",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["101"],
                "action": {"action": "perform-action"},
            }
        ],
        "commands_hash": "abc",
    }

    loop.run_until_complete(hub.async_sync_command_config(command_payload=payload, request_port=8060))

    assert enable_calls == [True]
    progress = hub.get_command_sync_progress()
    assert progress["status"] == "success"
    assert progress["current_step"] == 8
    assert resync_calls == [True]

    loop.close()


def test_sync_command_config_reports_wifi_listener_enable_failure(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.roku_server_enabled = False

    async def _enable(enabled: bool):
        hub.roku_server_enabled = enabled

    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _enable)
    monkeypatch.setattr(
        "custom_components.sofabaton_x1s.roku_listener.async_get_roku_listener",
        lambda _hass: asyncio.sleep(0, result=SimpleNamespace(get_last_start_error=lambda: "address already in use")),
    )

    payload = {
        "commands": [{"name": "Command 1", "activities": ["101"]}],
        "commands_hash": "abc",
    }

    with pytest.raises(Exception) as err:
        loop.run_until_complete(
            hub.async_sync_command_config(command_payload=payload, request_port=8060)
        )

    assert "Unable to enable Wifi Device" in str(err.value)
    progress = hub.get_command_sync_progress()
    assert progress["status"] == "failed"
    assert progress["message"] == "Wifi Device could not be enabled on port 8060."

    loop.close()


def test_sync_command_config_reports_failed_progress_for_unexpected_errors(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    async def _boom():
        raise RuntimeError("unexpected boom")

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _boom)

    payload = {
        "commands": [{"name": "Command 1", "activities": ["101"]}],
        "commands_hash": "abc",
    }

    with pytest.raises(RuntimeError, match="unexpected boom"):
        loop.run_until_complete(
            hub.async_sync_command_config(command_payload=payload, request_port=8060)
        )

    progress = hub.get_command_sync_progress()
    assert progress["status"] == "failed"
    assert progress["message"] == "Sync failed"

    loop.close()


def test_sync_command_config_post_hoc_reorder_uses_tracked_fav_ids(monkeypatch):
    """Post-hoc reorder uses fav_ids returned by command_to_favorite calls.

    Validates the fix for the X1 fav_id-recycling bug: when the hub reuses
    freed ids for newly-added favorites, a pre-existing-snapshot approach
    mis-classifies recycled ids as "existing to preserve" and perpetuates a
    scrambled order.  Tracking the actual fav_id from each add's return value
    lets the reorder correctly place macros first and new WiFi commands after.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    # Short-circuit the device-snapshot refresh so the test doesn't wait 15 s.
    async def _refresh_devices(_timeout=15.0):
        return {}  # no managed wifi devices
    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _refresh_devices)

    async def _create(*_args, **_kwargs):
        return {"device_id": 9, "status": "success"}

    async def _add_activity(*_args, **_kwargs):
        return {"status": "success"}

    # Simulate X1 hub recycling: after the prior managed device was deleted,
    # fav_ids 1-5 were freed and will be reused for the new adds in add order.
    # fav_id 6 is a pre-existing macro that must stay at the top.
    recycled_ids = iter([1, 2, 3, 4, 5])

    async def _favorite(activity_id, device_id, command_id, **kwargs):
        return {"status": "success", "fav_id": next(recycled_ids)}

    # Hub state after all five adds: macro at slot 6, new favs at slots 1-5
    # but in a scrambled order inherited from the old WiFi-command ordering.
    scrambled_order: list[tuple[int, int]] = [
        (5, 1), (1, 2), (3, 3), (2, 4), (4, 5), (6, 6),
    ]

    async def _request_favorites_order(_act_id):
        return list(scrambled_order)

    reorder_calls: list[tuple[int, list[int]]] = []

    async def _reorder(activity_id, fav_id_list, *, refresh_after_write=True):
        reorder_calls.append((activity_id, list(fav_id_list)))
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_command_to_favorite", _favorite)
    monkeypatch.setattr(hub, "async_request_favorites_order", _request_favorites_order)
    monkeypatch.setattr(hub, "async_reorder_favorites", _reorder)
    monkeypatch.setattr(hub, "async_resync_remote", lambda: asyncio.sleep(0))
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )
    monkeypatch.setattr(hub._proxy, "request_activity_mapping", lambda _act: True)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_a, **_k: ([], True))
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_a, **_k: None)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_a, **_k: ([], True))

    payload = {
        "commands": [
            {
                "name": f"Command {i + 1}",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["101"],
                "action": {},
            }
            for i in range(5)
        ],
        "commands_hash": "abc",
    }

    loop.run_until_complete(hub.async_sync_command_config(command_payload=payload, request_port=8060))

    # new_fav_id_list = [1, 2, 3, 4, 5]  (tracked in add order)
    # new_fav_id_set  = {1, 2, 3, 4, 5}
    # pre_existing    = fav_ids from scrambled_order NOT in new_fav_id_set,
    #                   sorted by their slot: [(5,1),(1,2),(3,3),(2,4),(4,5),(6,6)]
    #                   → only fav_id 6 (slot 6) survives the filter
    # final_order     = [6] + [1, 2, 3, 4, 5]
    assert reorder_calls == [(101, [6, 1, 2, 3, 4, 5])]

    loop.close()


def test_sync_command_config_with_zero_slots_keeps_listener_when_another_device_is_deployed(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    class _Store:
        def __init__(self) -> None:
            self.devices = {
                "default": {
                    "device_key": "default",
                    "deployed_device_id": 11,
                    "deployed_commands_hash": "abc",
                },
                "other": {
                    "device_key": "other",
                    "deployed_device_id": 22,
                    "deployed_commands_hash": "otherhash",
                },
            }

        async def async_save_deployed_wifi_commands(
            self,
            entry_id,
            device_key,
            commands,
            *,
            deployed_device_id=None,
            commands_hash="",
        ):
            self.devices[device_key] = {
                "device_key": device_key,
                "deployed_device_id": deployed_device_id,
                "deployed_commands_hash": commands_hash,
            }

        async def async_list_hub_devices(self, entry_id):
            return list(self.devices.values())

    hass.data = {"sofabaton_x1s": {"command_config_store": _Store()}}

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    hub.devices = {
        11: {"brand": "m3tac0de-abc", "name": "Managed Device"},
        22: {"brand": "m3tac0de-otherhash", "name": "Other Managed Device"},
    }

    deleted: list[int] = []
    enabled_calls: list[bool] = []

    async def _delete(dev_id, *_args, **_kwargs):
        deleted.append(dev_id)
        return {"status": "success"}

    async def _set_enabled(enable: bool):
        enabled_calls.append(enable)
        hub.roku_server_enabled = enable

    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _set_enabled)

    payload = {
        "commands": [],
        "commands_hash": "abc",
        "deployed_device_id": 11,
        "deployed_commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert deleted == [11]
    assert result["status"] == "success"
    assert enabled_calls == []
    assert hub.roku_server_enabled is True

    loop.close()


def test_roku_http_post_new_format_lazy_loads_command_store(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)
    hass.data = {"sofabaton_x1s": {}}

    class _Store:
        def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
            if entry_id == "entry-id" and hub_device_id == 8:
                return [{"name": "Scene Lights"}]
            return []

        def get_live_wifi_command_slot(self, entry_id, *, command_index, hub_device_id=None, device_key=None):
            if entry_id == "entry-id" and hub_device_id == 8 and command_index == 0:
                return {
                    "name": "Scene Lights",
                    "action": {"action": "perform-action", "perform_action": "script.scene_lights"},
                }
            return None

        async def async_get_hub_config(self, _entry_id, **_kwargs):
            return {"commands": []}

    async def _fake_get_store(_hass):
        return _Store()

    monkeypatch.setattr(hub_module, "async_get_command_config_store", _fake_get_store)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    loop.run_until_complete(
        hub.async_handle_roku_http_post(
            path="/launch/actionid/8/0/short",
            headers={"content-type": "text/plain"},
            body=b"payload",
            source_ip="127.0.0.1",
        )
    )

    ip_command = hub.get_last_ip_command()
    assert ip_command
    assert ip_command["command_label"] == "Scene Lights"

    loop.close()


def test_roku_http_post_logs_mapped_command(caplog):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    with caplog.at_level(logging.INFO, logger="custom_components.sofabaton_x1s.hub"):
        loop.run_until_complete(
            hub.async_handle_roku_http_post(
                path="/launch/actionid/7/Lights_On/Living_Room_TV/long",
                headers={"content-type": "text/plain"},
                body=b"payload",
                source_ip="127.0.0.1",
            )
        )

    messages = [record.getMessage() for record in caplog.records]
    assert any(
        "[entry-id] [WIFI_HTTP] mapped listener request source_ip=127.0.0.1 device_id=7 device_name=Living Room TV command=Lights On press_type=long path=/launch/actionid/7/Lights_On/Living_Room_TV/long"
        in message
        for message in messages
    )

    loop.close()


def test_sync_command_config_with_missing_metadata_matches_unique_hash_only_brand(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hass = FakeHass(loop)

    class _Store:
        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return [
                {
                    "device_key": "default",
                    "commands_hash": "abc",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                },
                {
                    "device_key": "other",
                    "commands_hash": "otherhash",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                },
            ]

        async def async_save_deployed_wifi_commands(
            self,
            entry_id,
            device_key,
            commands,
            *,
            deployed_device_id=None,
            commands_hash="",
        ):
            return None

    hass.data = {"sofabaton_x1s": {"command_config_store": _Store()}}
    monkeypatch.setattr(
        hub_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=hass.data["sofabaton_x1s"]["command_config_store"]),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    hub.devices = {
        11: {"brand": "m3tac0de-abc", "name": "Managed Device"},
        22: {"brand": "m3tac0de-otherhash", "name": "Other Managed Device"},
    }

    deleted: list[int] = []
    enabled_calls: list[bool] = []

    async def _delete(dev_id, *_args, **_kwargs):
        deleted.append(dev_id)
        return {"status": "success"}

    async def _set_enabled(enable: bool):
        enabled_calls.append(enable)
        hub.roku_server_enabled = enable

    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _set_enabled)

    payload = {
        "commands": [],
        "commands_hash": "abc",
    }

    result = loop.run_until_complete(
        hub.async_sync_command_config(command_payload=payload, request_port=8060)
    )

    assert deleted == [11]
    assert result["status"] == "success"
    assert enabled_calls == [False]
    assert hub.roku_server_enabled is False

    loop.close()


def test_sync_command_config_assigns_wifi_inputs_to_device_and_activity(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return []

        async def async_save_deployed_wifi_commands(
            self,
            entry_id,
            device_key,
            commands,
            *,
            deployed_device_id=None,
            commands_hash="",
        ):
            return None

    monkeypatch.setattr(
        hub_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=_Store()),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )
    hub.roku_server_enabled = True

    async def _refresh_devices(_timeout=15.0):
        return {}

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _refresh_devices)

    create_calls: list[dict[str, object]] = []
    add_calls: list[tuple[int, int, int | None]] = []

    async def _create(*_args, **kwargs):
        create_calls.append(dict(kwargs))
        return {"device_id": 9, "status": "success"}

    async def _add_activity(activity_id, device_id, input_cmd_id=None, **_kwargs):
        add_calls.append((activity_id, device_id, input_cmd_id))
        return {"status": "success"}

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add_activity)
    monkeypatch.setattr(hub, "async_command_to_favorite", lambda *_a, **_k: asyncio.sleep(0, result={"status": "success"}))
    monkeypatch.setattr(
        hub,
        "async_fetch_device_commands",
        lambda *_args, **_kwargs: asyncio.sleep(0),
    )
    monkeypatch.setattr(hub, "async_resync_remote", lambda: asyncio.sleep(0))
    monkeypatch.setattr(hub._proxy, "request_activity_mapping", lambda _act: True)
    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_a, **_k: ([], True))
    monkeypatch.setattr(hub._proxy, "clear_entity_cache", lambda *_a, **_k: None)
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_a, **_k: ([], True))
    monkeypatch.setattr(hub._proxy, "get_commands_for_entity", lambda *_a, **_k: ([], True))

    payload = {
        "commands": [
            {
                "name": "HDMI 1",
                "add_as_favorite": False,
                "hard_button": "",
                "input_activity_id": "101",
                "activities": [],
                "action": {"action": "perform-action"},
            },
            {
                "name": "Favorite Command",
                "add_as_favorite": True,
                "hard_button": "",
                "activities": ["102"],
                "action": {"action": "perform-action"},
            },
        ],
        "commands_hash": "abc",
    }

    loop.run_until_complete(hub.async_sync_command_config(command_payload=payload, request_port=8060))

    assert create_calls == [
        {
            "device_name": "Home Assistant",
            "commands": [
                {"display_name": "HDMI 1", "trigger_name": "HDMI 1", "press_type": "short", "command_index": 0},
                {"display_name": "Favorite Command", "trigger_name": "Favorite Command", "press_type": "short", "command_index": 1},
                {"display_name": "HDMI 1 Long Press", "trigger_name": "HDMI 1", "press_type": "long", "command_index": 0},
                {"display_name": "Favorite Command Long Press", "trigger_name": "Favorite Command", "press_type": "long", "command_index": 1},
            ],
            "request_port": 8060,
            "brand_name": "m3-default-abc",
            "power_on_command_id": None,
            "power_off_command_id": None,
            "input_command_ids": [1],
        }
    ]
    assert add_calls == [
        (101, 9, 1),
        (102, 9, None),
    ]

    loop.close()


def test_hub_create_proxy_uses_explicit_hub_version() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version=HUB_VERSION_X1S,
    )

    assert hub._proxy.hub_version == HUB_VERSION_X1S

    loop.close()


def test_get_hub_model_prefers_mdns_hver_over_stale_version() -> None:
    entry = SimpleNamespace(
        data={"mdns_txt": {"HVER": "2"}, "mdns_version": "X1"},
        options={"mdns_version": "X1"},
    )

    assert get_hub_model(entry) == "X1S"


def test_on_devices_burst_does_not_override_mdns_hub_version() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    hub = SofabatonHub(
        FakeHass(loop),
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version="X1",
    )

    hub._proxy.hub_version = "X1S"
    hub._proxy.get_devices = lambda: ({1: {"name": "TV", "brand": "Sony"}}, True)

    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))

    assert hub.version == "X1"

    loop.close()


def test_on_devices_burst_reconciles_legacy_managed_wifi_device_id(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        def __init__(self) -> None:
            self.devices = [
                {
                    "device_key": "default",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                }
            ]
            self.set_calls: list[list[tuple[str, int | None, str]]] = []

        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return list(self.devices)

        async def async_reconcile_deployed_wifi_devices(self, entry_id, assignments):
            assert entry_id == "entry-id"
            self.set_calls.append(list(assignments))
            for device in self.devices:
                if device["device_key"] == "default":
                    device["deployed_device_id"] = assignments[0][1] if assignments else None
                    device["deployed_commands_hash"] = assignments[0][2] if assignments else ""
            return True

    store = _Store()
    hass.data = {"sofabaton_x1s": {"command_config_store": store}}
    monkeypatch.setattr(
        hub_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=store),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version="X1",
    )

    hub._proxy.get_devices = lambda: ({11: {"name": "Managed Device", "brand": "m3tac0de-abc"}}, True)

    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))

    assert store.set_calls == [[("default", 11, "abc")]]
    assert store.devices[0]["deployed_device_id"] == 11

    loop.close()


def test_on_devices_burst_reconciles_hash_only_wifi_devices_by_unique_hash(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        def __init__(self) -> None:
            self.devices = [
                {
                    "device_key": "default",
                    "commands_hash": "abc",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                },
                {
                    "device_key": "other",
                    "commands_hash": "def",
                    "deployed_device_id": None,
                    "deployed_commands_hash": "",
                },
            ]
            self.set_calls: list[list[tuple[str, int | None, str]]] = []

        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return list(self.devices)

        async def async_reconcile_deployed_wifi_devices(self, entry_id, assignments):
            assert entry_id == "entry-id"
            self.set_calls.append(list(assignments))
            assignment_map = {device_key: (deployed_device_id, commands_hash) for device_key, deployed_device_id, commands_hash in assignments}
            for device in self.devices:
                assignment = assignment_map.get(device["device_key"])
                device["deployed_device_id"] = assignment[0] if assignment else None
                device["deployed_commands_hash"] = assignment[1] if assignment else ""
            return True

    store = _Store()
    hass.data = {"sofabaton_x1s": {"command_config_store": store}}
    monkeypatch.setattr(
        hub_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=store),
    )
    monkeypatch.setattr(
        hub_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=store),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version="X1",
    )

    hub._proxy.get_devices = lambda: (
        {
            11: {"name": "Managed Device", "brand": "m3tac0de-abc"},
            22: {"name": "Other Managed Device", "brand": "m3tac0de-def"},
        },
        True,
    )

    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))

    assert store.set_calls == [[
        ("default", 11, "abc"),
        ("other", 22, "def"),
    ]]
    assert store.devices[0]["deployed_device_id"] == 11
    assert store.devices[1]["deployed_device_id"] == 22

    loop.close()


def test_on_devices_burst_repairs_duplicate_deployed_device_claims_by_unique_hash(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    class _Store:
        def __init__(self) -> None:
            self.devices = [
                {
                    "device_key": "default",
                    "commands_hash": "homehash",
                    "deployed_device_id": 3,
                    "deployed_commands_hash": "homehash",
                },
                {
                    "device_key": "other",
                    "commands_hash": "lghash",
                    "deployed_device_id": 3,
                    "deployed_commands_hash": "lghash",
                },
            ]
            self.reconcile_calls: list[list[tuple[str, int | None, str]]] = []

        async def async_list_hub_devices(self, entry_id):
            assert entry_id == "entry-id"
            return list(self.devices)

        async def async_reconcile_deployed_wifi_devices(self, entry_id, assignments):
            assert entry_id == "entry-id"
            self.reconcile_calls.append(list(assignments))
            assignment_map = {device_key: (deployed_device_id, commands_hash) for device_key, deployed_device_id, commands_hash in assignments}
            for device in self.devices:
                assignment = assignment_map.get(device["device_key"])
                if assignment is None:
                    device["deployed_device_id"] = None
                    device["deployed_commands_hash"] = ""
                else:
                    device["deployed_device_id"] = assignment[0]
                    device["deployed_commands_hash"] = assignment[1]
            return True

    store = _Store()
    hass.data = {"sofabaton_x1s": {"command_config_store": store}}
    monkeypatch.setattr(
        hub_module,
        "async_get_command_config_store",
        lambda _hass: asyncio.sleep(0, result=store),
    )

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
        version="X1",
    )

    hub._proxy.get_devices = lambda: (
        {
            3: {"name": "Managed Device", "brand": "m3tac0de-lghash"},
        },
        True,
    )

    hub._on_devices_burst("devices")
    loop.run_until_complete(asyncio.sleep(0))

    assert store.reconcile_calls == [[("other", 3, "lghash")]]
    assert store.devices[0]["deployed_device_id"] is None
    assert store.devices[1]["deployed_device_id"] == 3

    loop.close()


def test_prime_buttons_skips_activity_map_when_cached(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_id = 0x0105
    act_lo = act_id & 0xFF

    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 1, "device_id": 2, "command_id": 3, "source": "cache"}
    ]

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([1, 2], True))
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", lambda *_args, **_kwargs: ({}, True))
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], True))

    called = {"request_map": 0}

    def _request_map(_act_id: int) -> bool:
        called["request_map"] += 1
        return True

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)

    loop.run_until_complete(hub._async_prime_buttons_for(act_id))

    assert called["request_map"] == 0

    loop.close()


def test_prime_buttons_fetches_activity_map_when_not_cached(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_id = 0x0106

    monkeypatch.setattr(hub._proxy, "get_buttons_for_entity", lambda *_args, **_kwargs: ([1, 2], True))
    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", lambda *_args, **_kwargs: ({}, True))
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], True))

    called = {"request_map": 0}

    def _request_map(_act_id: int) -> bool:
        called["request_map"] += 1
        hub._proxy._activity_map_complete.add(_act_id & 0xFF)
        return True

    monkeypatch.setattr(hub._proxy, "request_activity_mapping", _request_map)

    loop.run_until_complete(hub._async_prime_buttons_for(act_id))

    assert called["request_map"] == 1

    loop.close()


def test_restore_persistent_cache_primes_hub_trackers():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    payload = {
        "devices": {"104": {"name": "Xbox", "brand": "Xbox"}},
        "buttons": {"104": [174, 176]},
        "commands": {"104": {"1": "Power"}},
        "activity_favorite_slots": {"104": [{"button_id": 1, "device_id": 2, "command_id": 3, "source": "cache"}]},
    }

    loop.run_until_complete(hub.async_restore_persistent_cache(payload))

    assert 104 in hub._buttons_ready_for
    assert 104 in hub._command_entities
    assert 104 in hub._proxy._activity_map_complete
    assert hub.devices.get(104, {}).get("name") == "Xbox"

    loop.close()


def test_clear_cache_for_device_requests_fresh_devices(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    refreshed = {"called": False}

    async def _fake_refresh_devices_snapshot(timeout_seconds: float = 15.0):
        refreshed["called"] = True
        return {}

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _fake_refresh_devices_snapshot)

    hub._proxy.clear_cached_entity_detail = lambda ent_id, *, kind: None  # type: ignore[method-assign]
    hub._proxy.get_devices = lambda: ({}, True)  # type: ignore[method-assign]

    monkeypatch.setattr("custom_components.sofabaton_x1s.hub.async_dispatcher_send", lambda *_: None)

    loop.run_until_complete(hub.async_clear_cache_for(kind="device", ent_id=9))

    assert refreshed["called"] is True

    loop.close()


def test_commands_ready_for_activity_waits_for_macro_completion(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    act_id = 0x22
    hub._proxy.state.activities[act_id] = {"name": "Watch TV"}

    monkeypatch.setattr(hub._proxy, "ensure_commands_for_activity", lambda *_args, **_kwargs: ({1: "Power"}, True))
    monkeypatch.setattr(hub._proxy, "get_macros_for_activity", lambda *_args, **_kwargs: ([], False))

    assert hub._commands_ready_for(act_id) is False

    loop.close()


def test_cache_activity_ids_hide_auxiliary_only_phantom_ids_when_catalog_exists():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.activities = {
        101: {"name": "test"},
        102: {"name": "heyo"},
    }
    hub._proxy.state.activity_members[5].add(1)
    hub._proxy.state.activity_members[6].add(2)

    ids = hub._cache_activity_ids({"activity_members": {"5": [1], "6": [2]}})

    assert ids == [101, 102]

    loop.close()


def test_cache_activity_ids_can_fall_back_to_auxiliary_ids_without_catalog():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    ids = hub._cache_activity_ids({"activity_members": {"5": [1], "6": [2]}})

    assert ids == [5, 6]

    loop.close()


def test_cache_device_ids_can_fall_back_to_command_only_ids_without_catalog():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    ids = hub._cache_device_ids({"commands": {"5": {"1": "Power"}, "6": {"2": "Mute"}}})

    assert ids == [5, 6]

    loop.close()


def test_cache_device_ids_hide_stale_command_only_ids_when_catalog_exists():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub.devices = {1: {"name": "TV"}}

    ids = hub._cache_device_ids(
        {
            "devices": {"1": {"name": "TV"}},
            "commands": {"1": {"1": "Power"}, "9": {"2": "Ghost command"}},
        }
    )

    assert ids == [1]

    loop.close()


def test_async_request_catalog_prunes_auxiliary_only_removed_activity_ids(monkeypatch):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )

    hub._activities_generation = 2
    hub._proxy.get_known_activity_ids = lambda: {101, 102}  # type: ignore[method-assign]
    hub._proxy.get_cached_activity_detail_ids = lambda: {5, 6, 101, 102}  # type: ignore[method-assign]
    hub._proxy.clear_activities_catalog = lambda: None  # type: ignore[method-assign]
    hub._proxy.request_activities = lambda: None  # type: ignore[method-assign]

    cleared: list[tuple[int, str]] = []

    def _clear_cached_entity_detail(ent_id, *, kind):
        cleared.append((ent_id, kind))

    hub._proxy.clear_cached_entity_detail = _clear_cached_entity_detail  # type: ignore[method-assign]

    def _fake_get_known_activity_ids():
        if hub._activities_generation == 2:
            return {101, 102}
        return {101, 102}

    hub._proxy.get_known_activity_ids = _fake_get_known_activity_ids  # type: ignore[method-assign]

    async def _fake_sleep(_delay):
        hub._activities_generation = 3

    monkeypatch.setattr("custom_components.sofabaton_x1s.hub.asyncio.sleep", _fake_sleep)
    monkeypatch.setattr("custom_components.sofabaton_x1s.hub.async_dispatcher_send", lambda *_: None)

    loop.run_until_complete(hub.async_request_catalog("activities", timeout_seconds=0.2))

    assert set(cleared) == {(5, "activity"), (6, "activity")}

    loop.close()
