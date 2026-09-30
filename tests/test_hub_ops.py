"""Hub operations: blobs, backups, IR, favorites, bindings, deletes, keys (hub_ops.py)."""

import asyncio
import pytest

from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.lib.commands import build_descriptive_ir_blob_body
from custom_components.sofabaton_x1s.lib.devices import DeviceConfig, build_device_create_payload
from custom_components.sofabaton_x1s.lib.macros import MacroKeyEntry, MacroRecord
from custom_components.sofabaton_x1s.lib.backup_export import (
    build_hub_code_record_restore_data,
)
from tests.hub_fakes import FakeHass


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
    # data_hex is the stable blob body: the persisted write-context tail
    # ("f1") is split into persist_tail_hex so restore seals a fresh one
    # (live-bench finding: keeping it grew the record every round-trip).
    assert restore_data["data_hex"] == wifi_ip_full_hex.rsplit(" ", 1)[0]
    assert restore_data["persist_tail_hex"] == "f1"
    assert restore_data["transport"] == "hub_code_record"
    assert restore_data["library_type"] == 0x1C

    decoded = restore_data["decoded"]
    assert decoded["class"] == "wifi_ip"
    assert decoded["trailer_hex"] == ""  # tail no longer part of the body
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
    assert restore_data["data_hex"] == "0c 00 30"
    assert restore_data["persist_tail_hex"] == "74"
    assert "decoded" not in restore_data


def test_backup_activity_filters_internal_power_macro_device_255(monkeypatch):
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

    result = hub._proxy.backup_activity(act_id)

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
        # Cached 0x0242 idle byte; a capture without it is incomplete.
        "idle_behavior": 1,
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
        "idle_behavior": 1,
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
        "tail_flag": 0,
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
        "idle_behavior": 1,
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
                "data_hex": "aa bb cc",
                "persist_tail_hex": "dd",
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
        "idle_behavior": 1,
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
                "data_hex": "aa bb cc",
                "persist_tail_hex": "dd",
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
        # Never set up: idle mode 0 as well as the tail byte 0. (Idle 1-3
        # would mean power is set up, whatever the tail byte says.)
        "idle_behavior": 0,
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


def _make_delete_device_hub(monkeypatch, *, proxy_result):
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
        "custom_components.sofabaton_x1s.hub_proxy_events.async_dispatcher_send", lambda *_: None
    )
    monkeypatch.setattr(hub._proxy, "delete_device", lambda _dev_id: proxy_result)

    persisted: list[bool] = []

    async def _record_persist():
        persisted.append(True)
        return True

    monkeypatch.setattr(hub, "_async_persist_cache_if_enabled", _record_persist)

    warmed: list[int] = []

    async def _record_warm(act_id):
        warmed.append(int(act_id))

    monkeypatch.setattr(hub, "_async_fetch_activity_commands", _record_warm)
    return hub, loop, persisted, warmed


def test_delete_device_drops_hub_snapshot_and_bumps_generation(monkeypatch):
    dev_lo = 0x14
    hub, loop, persisted, warmed = _make_delete_device_hub(
        monkeypatch,
        proxy_result={"device_id": dev_lo, "confirmed_activities": [], "status": "success"},
    )
    try:
        hub.devices[dev_lo] = {"name": "Wifi Lights", "brand": "m3tac0de"}
        generation_before = hub.cache_generation
        devices_generation_before = hub._devices_generation

        result = loop.run_until_complete(hub.async_delete_device(dev_lo))

        assert result and result.get("status") == "success"
        # The hub-level snapshot feeds the Hub-tab device list; a successful
        # delete must drop the row immediately instead of waiting for the
        # next devices burst.
        assert dev_lo not in hub.devices
        assert hub._devices_generation == devices_generation_before + 1
        assert hub.cache_generation == generation_before + 1
        assert persisted == [True]
    finally:
        loop.close()


def test_delete_device_failure_keeps_snapshot_and_generation(monkeypatch):
    dev_lo = 0x14
    hub, loop, persisted, warmed = _make_delete_device_hub(monkeypatch, proxy_result=None)
    try:
        hub.devices[dev_lo] = {"name": "Wifi Lights", "brand": "m3tac0de"}
        generation_before = hub.cache_generation

        result = loop.run_until_complete(hub.async_delete_device(dev_lo))

        assert result is None
        assert dev_lo in hub.devices
        assert hub.cache_generation == generation_before
        assert persisted == []
        assert warmed == []
    finally:
        loop.close()


def test_delete_activity_id_bumps_generation_without_touching_devices(monkeypatch):
    act_id = 0x66
    hub, loop, persisted, warmed = _make_delete_device_hub(
        monkeypatch,
        proxy_result={"device_id": act_id, "confirmed_activities": [], "status": "success"},
    )
    try:
        hub.devices[0x14] = {"name": "Wifi Lights", "brand": "m3tac0de"}
        generation_before = hub.cache_generation
        devices_generation_before = hub._devices_generation

        result = loop.run_until_complete(hub.async_delete_device(act_id))

        assert result and result.get("status") == "success"
        assert 0x14 in hub.devices
        assert hub._devices_generation == devices_generation_before
        assert hub.cache_generation == generation_before + 1
        assert persisted == [True]
    finally:
        loop.close()


def test_delete_device_rewarms_confirmed_activities(monkeypatch):
    dev_lo = 0x14
    hub, loop, persisted, warmed = _make_delete_device_hub(
        monkeypatch,
        proxy_result={
            "device_id": dev_lo,
            "confirmed_activities": [0x65, 0x66],
            "status": "success",
        },
    )
    try:
        hub.devices[dev_lo] = {"name": "Wifi Lights", "brand": "m3tac0de"}

        result = loop.run_until_complete(hub.async_delete_device(dev_lo))

        assert result and result.get("status") == "success"
        # The proxy delete gutted these activities' cached keymap/favorites/
        # macros; the hub-level delete must refetch them so the structural
        # cache stays bundle-grade without a manual full refresh.
        assert warmed == [0x65, 0x66]
        assert persisted == [True]
    finally:
        loop.close()


def test_delete_device_rewarms_impacted_activities_when_present(monkeypatch):
    """When the proxy reports impacted_activities (confirm set + cache scan
    of referencing power macros/favorites/bindings), the re-warm must cover
    all of them — not just the hub-flagged confirm subset."""

    dev_lo = 0x14
    hub, loop, persisted, warmed = _make_delete_device_hub(
        monkeypatch,
        proxy_result={
            "device_id": dev_lo,
            "confirmed_activities": [0x66],
            "impacted_activities": [0x65, 0x66],
            "status": "success",
        },
    )
    try:
        hub.devices[dev_lo] = {"name": "Wifi Lights", "brand": "m3tac0de"}

        result = loop.run_until_complete(hub.async_delete_device(dev_lo))

        assert result and result.get("status") == "success"
        assert warmed == [0x65, 0x66]
        assert persisted == [True]
    finally:
        loop.close()


def test_delete_device_skips_rewarm_when_disabled(monkeypatch):
    dev_lo = 0x14
    hub, loop, persisted, warmed = _make_delete_device_hub(
        monkeypatch,
        proxy_result={
            "device_id": dev_lo,
            "confirmed_activities": [0x65],
            "status": "success",
        },
    )
    try:
        hub.devices[dev_lo] = {"name": "Wifi Lights", "brand": "m3tac0de"}

        result = loop.run_until_complete(
            hub.async_delete_device(dev_lo, refresh_impacted_activities=False)
        )

        assert result and result.get("status") == "success"
        assert warmed == []
        # Generation bump + persist still run: the deploy pipeline that opts
        # out does its own re-warm before relying on the persisted cache.
        assert persisted == [True]
    finally:
        loop.close()


def test_async_send_key_resolution(monkeypatch):
    from homeassistant.exceptions import HomeAssistantError

    from custom_components.sofabaton_x1s.lib.protocol_const import ButtonName

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

    sent = []
    monkeypatch.setattr(
        hub._proxy, "send_command", lambda ent_id, code: sent.append((ent_id, code)) or True
    )
    hub.current_activity = 101

    try:
        # Known button name (case-insensitive) -> ButtonName code to the
        # current activity.
        loop.run_until_complete(hub.async_send_key("vol_up"))
        assert sent == [(101, ButtonName.VOL_UP)]

        # Numeric string without device -> raw command id to the current
        # activity (the HA service schema stringifies every command).
        sent.clear()
        loop.run_until_complete(hub.async_send_key("123"))
        assert sent == [(101, 123)]

        # Numeric string with device -> raw command id to that entity.
        sent.clear()
        loop.run_until_complete(hub.async_send_key("12", device=3))
        assert sent == [(3, 12)]

        # Garbage without device -> clean error, nothing sent.
        sent.clear()
        with pytest.raises(HomeAssistantError, match="Unknown command"):
            loop.run_until_complete(hub.async_send_key("NOT_A_BUTTON"))
        assert sent == []

        # Button name with device -> clean error (direct targeting is
        # numeric-only), nothing sent.
        with pytest.raises(HomeAssistantError, match="numeric command ID"):
            loop.run_until_complete(hub.async_send_key("VOL_UP", device=3))
        assert sent == []

        # No active activity -> clean error.
        hub.current_activity = None
        with pytest.raises(HomeAssistantError, match="No activity active"):
            loop.run_until_complete(hub.async_send_key("VOL_UP"))
    finally:
        loop.close()
