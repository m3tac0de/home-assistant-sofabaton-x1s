"""Tests for x1_proxy helpers."""
import threading
import sys
import time
import types
from typing import Any

import pytest

from custom_components.sofabaton_x1s.const import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    MDNS_SERVICE_TYPE_X1,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (
    ButtonName,
    DEVICE_CLASS_RF_315,
    DEVICE_CLASS_RF_433,
    DEVICE_CLASS_WIFI_SONOS,
    FAMILY_HUB_NAME_REPLY,
    OP_FIND_REMOTE,
    OP_FIND_REMOTE_X2,
    OP_REMOTE_SYNC,
    OP_SET_HUB_NAME,
    OP_X2_REMOTE_LIST,
    OP_X2_REMOTE_SYNC,
    OP_REQ_COMMANDS,
    OP_ACTIVITY_ASSIGN_FINALIZE,
    known_public_device_classes,
    normalize_device_class,
)
from custom_components.sofabaton_x1s.lib.frame_handlers import FrameContext
from custom_components.sofabaton_x1s.lib.macros import MacroRecord
from custom_components.sofabaton_x1s.lib.opcode_handlers import (
    ActivityMapHandler,
    DeviceButtonFamilyHandler,
    HubNameReplyHandler,
)
from custom_components.sofabaton_x1s.lib.ack import AckOutcome, InputsBurstResult, SendStepResult
from custom_components.sofabaton_x1s.lib.state_helpers import ActivityCache
from custom_components.sofabaton_x1s.lib.devices import parse_device_record
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy
import custom_components.sofabaton_x1s.lib.x1_proxy as x1_proxy_module


def test_incomplete_activity_snapshot_preserves_committed_state() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.state.activities = {0x65: {"name": "Watch TV", "active": True, "needs_confirm": False}}
    proxy.state.set_hint(0x65)

    proxy._begin_activity_request()
    accepted = proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=5,
        act_id=0x66,
        activity={"id": 0x66, "name": "Play Xbox", "active": False, "needs_confirm": False},
        payload=b"\x01\x00\x01\x05",
    )

    assert accepted is True
    assert proxy.state.current_activity_hint == 0x65

    proxy._on_activities_burst_end("activities")

    assert proxy.state.activities == {0x65: {"name": "Watch TV", "active": True, "needs_confirm": False}}
    assert proxy.state.current_activity_hint == 0x65


def test_complete_activity_snapshot_commits_after_row1_then_out_of_order_rows() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._begin_activity_request()
    assert proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=3,
        act_id=0x65,
        activity={"id": 0x65, "name": "Watch TV", "active": False, "needs_confirm": False},
    )
    assert proxy.ingest_activity_row(
        row_idx=3,
        expected_rows=3,
        act_id=0x67,
        activity={"id": 0x67, "name": "Play Switch 2", "active": False, "needs_confirm": False},
    )
    assert proxy.ingest_activity_row(
        row_idx=2,
        expected_rows=3,
        act_id=0x66,
        activity={"id": 0x66, "name": "Play Xbox", "active": True, "needs_confirm": False},
    )

    proxy._on_activities_burst_end("activities")

    assert proxy.state.activities == {
        0x65: {"name": "Watch TV", "active": False, "needs_confirm": False},
        0x66: {"name": "Play Xbox", "active": True, "needs_confirm": False},
        0x67: {"name": "Play Switch 2", "active": False, "needs_confirm": False},
    }
    assert proxy.state.current_activity_hint == 0x66


def test_try_finish_activities_burst_ends_burst_once_snapshot_is_complete() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._begin_activity_request()
    assert proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=2,
        act_id=0x65,
        activity={"id": 0x65, "name": "Watch TV", "active": False, "needs_confirm": False},
    )
    assert proxy.ingest_activity_row(
        row_idx=2,
        expected_rows=2,
        act_id=0x66,
        activity={"id": 0x66, "name": "Play Xbox", "active": True, "needs_confirm": False},
    )
    proxy._burst.start("activities", now=0.0)

    finished = proxy.try_finish_activities_burst()

    assert finished is True
    assert proxy._burst.active is False
    assert proxy.state.activities == {
        0x65: {"name": "Watch TV", "active": False, "needs_confirm": False},
        0x66: {"name": "Play Xbox", "active": True, "needs_confirm": False},
    }
    assert proxy.state.current_activity_hint == 0x66


def test_silent_activities_burst_discards_snapshot_and_keeps_prior_state() -> None:
    # Mirror of the devices case: silence means the request was dropped,
    # not that the catalog is empty (an empty catalog answers 0x07).
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.state.activities = {0x65: {"name": "Keeper", "active": False, "needs_confirm": False}}

    proxy._begin_activity_request()
    proxy._burst.start("activities", now=0.0)

    proxy._on_activities_burst_end("activities")
    activities, ready = proxy.get_activities(force_refresh=False)

    assert ready is False
    assert proxy.state.activities == {0x65: {"name": "Keeper", "active": False, "needs_confirm": False}}


def test_status_ack_07_finishes_empty_activities_burst_immediately() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._begin_activity_request()
    proxy._burst.start("activities", now=0.0)

    finished = proxy.note_catalog_status_ack(0x07)

    assert finished is True
    assert proxy._burst.active is False
    activities, ready = proxy.get_activities(force_refresh=False)
    assert ready is True
    assert activities == {}
    assert proxy._activity_retry_due_at is None


def test_app_req_activities_arms_snapshot_so_rows_are_not_ghosted() -> None:
    # While the app drives the session the proxy never sends its own
    # REQ_ACTIVITIES, so observing the app's request must arm a pending
    # snapshot; otherwise every row is rejected as a ghost and the running
    # activity (the `active` flag) never reaches current_activity.
    from custom_components.sofabaton_x1s.lib.protocol_const import OP_REQ_ACTIVITIES

    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.state.activities = {0x65: {"name": "Watch TV", "active": True, "needs_confirm": False}}
    proxy.state.set_hint(0x65)

    # No request in flight yet: a row would be ghosted.
    assert proxy._activity_request_inflight is None

    # Simulate the app asking the hub for the activity list.
    proxy._handle_app_frames([(OP_REQ_ACTIVITIES, b"", b"", 0, 0)])
    assert proxy._activity_request_inflight is not None

    # The hub's rows are now adopted instead of discarded.
    assert proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=2,
        act_id=0x65,
        activity={"id": 0x65, "name": "Watch TV", "active": False, "needs_confirm": False},
    )
    assert proxy.ingest_activity_row(
        row_idx=2,
        expected_rows=2,
        act_id=0x66,
        activity={"id": 0x66, "name": "Play Xbox", "active": True, "needs_confirm": False},
    )

    proxy._on_activities_burst_end("activities")

    assert proxy.state.activities == {
        0x65: {"name": "Watch TV", "active": False, "needs_confirm": False},
        0x66: {"name": "Play Xbox", "active": True, "needs_confirm": False},
    }
    # The newly running activity is reflected in the hint the sensor reads.
    assert proxy.state.current_activity_hint == 0x66


def test_try_finish_devices_burst_ends_burst_once_snapshot_is_complete() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._begin_device_request()
    assert proxy.ingest_device_row(
        row_idx=1,
        expected_rows=2,
        dev_id=0x01,
        device={"brand": "Denon", "name": "AVR"},
    )
    assert proxy.ingest_device_row(
        row_idx=2,
        expected_rows=2,
        dev_id=0x02,
        device={"brand": "Sony", "name": "TV"},
    )
    proxy._burst.start("devices", now=0.0)

    finished = proxy.try_finish_devices_burst()

    assert finished is True
    assert proxy._burst.active is False
    assert proxy.state.devices == {
        0x01: {
            "brand": "Denon",
            "name": "AVR",
        },
        0x02: {
            "brand": "Sony",
            "name": "TV",
        },
    }


def test_silent_devices_burst_discards_snapshot_and_keeps_prior_state() -> None:
    # A devices request that ends with no rows AND no STATUS_ACK 0x07 was
    # dropped by the hub (a truly empty catalog answers 0x07). It must be
    # discarded, not committed as an empty catalog — committing wiped
    # state.devices when a queued catalog retry fired mid write-sequence
    # (live-bench finding, backup/restore chunk 2).
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.state.devices = {5: {"name": "Keeper"}}

    proxy._begin_device_request()
    proxy._burst.start("devices", now=0.0)

    proxy._on_devices_burst_end("devices")
    devices, ready = proxy.get_devices(force_refresh=False)

    assert ready is False
    assert proxy.state.devices == {5: {"name": "Keeper"}}


def test_status_ack_07_finishes_empty_devices_burst_immediately() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._begin_device_request()
    proxy._burst.start("devices", now=0.0)

    finished = proxy.note_catalog_status_ack(0x07)

    assert finished is True
    assert proxy._burst.active is False
    devices, ready = proxy.get_devices(force_refresh=False)
    assert ready is True
    assert devices == {}


def test_status_ack_07_finishes_empty_macros_burst_immediately() -> None:
    """A macro-less entity answers REQ_MACRO_LABELS with a bare STATUS_ACK
    0x07; the macros burst must finish then, not after the scheduler's 5s
    response grace (which stalled whole-hub cache refresh per entity)."""

    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._pending_macro_requests.add(7)
    proxy._burst.start("macros:7", now=0.0)

    finished = proxy.note_catalog_status_ack(0x07)

    assert finished is True
    assert proxy._burst.active is False
    assert 7 in proxy._macros_complete
    assert 7 not in proxy._pending_macro_requests


def test_status_ack_07_finishes_empty_buttons_burst_immediately() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._pending_button_requests.add(9)
    proxy._burst.start("buttons:9", now=0.0)

    finished = proxy.note_catalog_status_ack(0x07)

    assert finished is True
    assert proxy._burst.active is False
    assert 9 not in proxy._pending_button_requests
    # The empty keymap is a definitive answer: the entity must be marked
    # fetched, or backup_device waits out its timeout on
    # ``dev_lo in state.buttons`` and stamps complete=False on a good
    # capture (live-bench finding, backup/restore chunk 1).
    assert proxy.state.buttons.get(9) == set()
    assert proxy.get_buttons_for_entity(9, fetch_if_missing=False) == ([], True)


def test_status_ack_07_finishes_empty_commands_burst_immediately() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._pending_command_requests[5] = {0xFF}
    proxy._burst.start("commands:5", now=0.0)

    finished = proxy.note_catalog_status_ack(0x07)

    assert finished is True
    assert proxy._burst.active is False
    assert 5 in proxy._commands_complete
    assert 5 not in proxy._pending_command_requests


def test_status_ack_07_ignores_unrelated_bursts_and_statuses() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    # Non-0x07 statuses never touch the burst.
    proxy._burst.start("macros:7", now=0.0)
    assert proxy.note_catalog_status_ack(0x0C) is False
    assert proxy._burst.active is True

    # 0x07 with a burst kind outside the empty-reply family is left alone
    # (ir_dump completion has its own pending/event bookkeeping).
    proxy._burst.kind = "ir_dump:5:255"
    assert proxy.note_catalog_status_ack(0x07) is False
    assert proxy._burst.active is True


def test_export_cache_state_omits_raw_body_bytes() -> None:
    """``raw_body`` is in-memory only; exports feed JSON-only sinks
    (persistent cache, control-panel WS payload) where bytes break
    serialization. Backup still reads ``raw_body`` directly from
    ``state.devices``, not from the export.
    """

    import json

    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.state.devices[0x07] = {
        "brand": "Sony",
        "name": "TV",
        "device_class": "IR",
        "device_class_code": 0x10,
        "raw_body": b"\x00\x01\x02\x03",
    }

    exported = proxy.export_cache_state()

    assert "raw_body" not in exported["devices"]["7"]
    json.dumps(exported)  # would raise TypeError if any bytes leak through


def test_ghost_device_row_is_ignored_without_request_in_flight() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    accepted = proxy.ingest_device_row(
        row_idx=1,
        expected_rows=2,
        dev_id=0x01,
        device={"brand": "Denon", "name": "AVR"},
    )

    assert accepted is False
    assert proxy.state.devices == {}


def test_import_cache_state_normalizes_legacy_and_current_device_class_metadata() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy.import_cache_state(
        {
            "devices": {
                "7": {
                    "brand": "m3tac0de",
                    "name": "Living Room Roku",
                    "device_type_code": "10",
                    "device_type": "wifi_roku",
                }
            }
        }
    )

    assert proxy.state.devices == {
        0x07: {
            "brand": "m3tac0de",
            "name": "Living Room Roku",
            "device_class": "wifi_roku",
            "device_class_code": 0x0A,
        }
    }
    assert proxy.export_cache_state()["devices"]["7"] == {
        "brand": "m3tac0de",
        "name": "Living Room Roku",
        "device_class": "wifi_roku",
        "device_class_code": 0x0A,
    }


def test_import_cache_state_normalizes_mqtt_device_class_code() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy.import_cache_state(
        {
            "devices": {
                "2": {
                    "name": "Home Assistant",
                    "device_class_code": 0x20,
                }
            }
        }
    )

    assert proxy.state.devices == {
        0x02: {
            "name": "Home Assistant",
            "device_class": "wifi_mqtt",
            "device_class_code": 0x20,
        }
    }


def test_hub_name_reply_handler_queues_variable_length_family() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    payload = b"Living Room"
    opcode = (len(payload) << 8) | FAMILY_HUB_NAME_REPLY

    HubNameReplyHandler().handle(
        FrameContext(
            proxy=proxy,
            opcode=opcode,
            direction="H→A",
            payload=payload,
            raw=b"",
            name="HUB_NAME_REPLY",
        )
    )

    matched = proxy.wait_for_ack_family_low(FAMILY_HUB_NAME_REPLY, timeout=0.01)

    assert matched == (opcode, payload)


def test_set_hub_name_sends_family_30_and_updates_banner_cache() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    sent: list[tuple[int, bytes]] = []

    def _send_family_frame(family: int, payload: bytes) -> None:
        sent.append((family, payload))
        proxy.notify_ack(((len(payload) & 0xFF) << 8) | FAMILY_HUB_NAME_REPLY, payload)

    proxy.can_issue_commands = lambda: True  # type: ignore[method-assign]
    proxy._send_family_frame = _send_family_frame  # type: ignore[method-assign]

    ok = proxy.set_hub_name("Living Room")

    assert ok is True
    assert sent == [(OP_SET_HUB_NAME & 0xFF, b"Living Room")]
    assert proxy.get_banner_info()["name"] == "Living Room"


def test_device_class_registry_normalizes_public_sonos_and_rf_aliases() -> None:
    assert normalize_device_class("sonos") == DEVICE_CLASS_WIFI_SONOS
    assert normalize_device_class("wifi/sonos") == DEVICE_CLASS_WIFI_SONOS
    assert normalize_device_class("315") == DEVICE_CLASS_RF_315
    assert normalize_device_class("rf_433") == DEVICE_CLASS_RF_433
    assert "matter" not in known_public_device_classes()


def test_import_cache_state_preserves_known_public_class_without_code_mapping() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy.import_cache_state(
        {
            "devices": {
                "9": {
                    "name": "Living Room",
                    "device_type": "sonos",
                },
                "10": {
                    "name": "Gate",
                    "device_type": "433",
                },
            }
        }
    )

    assert proxy.state.devices[0x09] == {
        "name": "Living Room",
        "device_class": DEVICE_CLASS_WIFI_SONOS,
    }
    assert proxy.state.devices[0x0A] == {
        "name": "Gate",
        "device_class": DEVICE_CLASS_RF_433,
    }


def test_try_finish_activity_map_burst_ends_matching_burst() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._activity_map_complete.add(0x65)
    proxy._burst.start("activity_map:101", now=0.0)

    finished = proxy.try_finish_activity_map_burst(0x65)

    assert finished is True
    assert proxy._burst.active is False


def test_try_finish_buttons_burst_requires_expected_final_frame() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    proxy._burst.start("buttons:101", now=0.0)
    proxy.note_buttons_frame(0x65, frame_no=1, total_frames=2)

    assert proxy.try_finish_buttons_burst(0x65, frame_no=1) is False
    assert proxy.try_finish_buttons_burst(0x65, frame_no=2) is True
    assert proxy._burst.active is False


def test_ghost_activity_row_is_ignored_without_request_in_flight() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    accepted = proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=2,
        act_id=0x65,
        activity={"id": 0x65, "name": "Watch TV", "active": True, "needs_confirm": False},
    )

    assert accepted is False
    assert proxy.state.activities == {}


def test_incomplete_x2_activity_snapshot_retries_once_after_delay(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    proxy._begin_activity_request()
    proxy.ingest_activity_row(
        row_idx=1,
        expected_rows=5,
        act_id=0x65,
        activity={"id": 0x65, "name": "Watch TV", "active": False, "needs_confirm": False},
    )

    proxy._on_activities_burst_end("activities")

    assert proxy._activity_retry_due_at is not None
    assert proxy._activity_retry_count == 1

    retries: list[bool] = []
    monkeypatch.setattr(proxy, "request_activities", lambda *, is_retry=False: retries.append(is_retry) or True)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    proxy._burst.active = False

    proxy._handle_idle(proxy._activity_retry_due_at)

    assert retries == [True]
    assert proxy._activity_retry_due_at is None


def test_ensure_commands_for_activity_groups_favorites(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    cache = ActivityCache()
    act = 0x10
    cache.activity_favorite_slots[act] = [
        {"button_id": 0xFE, "device_id": 0x01, "command_id": 0x1111},
        {"button_id": 0xFD, "device_id": 0x01, "command_id": 0x2222},
        {"button_id": 0xFC, "device_id": 0x02, "command_id": 0x3333},
    ]
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
    assert proxy.state.activity_favorite_labels[act] == {
        (0x01, 0x1111): "one",
        (0x01, 0x2222): "two",
        (0x02, 0x3333): "three",
    }
    assert proxy._favorite_label_requests == {(0x01, 0x2222): {act}}


def test_ensure_commands_for_activity_only_favorites(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    cache = ActivityCache()
    act = 0x10
    cache.activity_favorite_slots[act] = [
        {"button_id": 0xFE, "device_id": 0x01, "command_id": 0xAAAA},
        {"button_id": 0xFD, "device_id": 0x03, "command_id": 0xCCCC},
    ]
    proxy.state = cache

    calls: list[tuple[int, int, bool]] = []

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        calls.append((ent_id, command_id, fetch_if_missing))
        mappings = {
            (0x01, 0xAAAA): ({0xAAAA: "alpha"}, True),
            (0x03, 0xCCCC): ({0xCCCC: "charlie"}, False),
        }
        return mappings.get((ent_id, command_id), ({}, False))

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is False
    assert set(calls) == {
        (0x01, 0xAAAA, True),
        (0x03, 0xCCCC, True),
    }
    assert commands_by_device == {0x01: {0xAAAA: "alpha"}, 0x03: {0xCCCC: "charlie"}}
    assert proxy.state.activity_favorite_labels[act] == {
        (0x01, 0xAAAA): "alpha",
        (0x03, 0xCCCC): "charlie",
    }




def test_ensure_commands_for_activity_ignores_keybinding_slots(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    cache = ActivityCache()
    act = 0x10
    cache.activity_favorite_slots[act] = [
        {"button_id": 0x01, "device_id": 0x01, "command_id": 0x1111},
    ]
    cache.activity_keybinding_slots[act] = [
        {"button_id": ButtonName.VOL_DOWN, "device_id": 0x01, "command_id": 0x2222},
    ]
    proxy.state = cache

    calls: list[tuple[int, int, bool]] = []

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        calls.append((ent_id, command_id, fetch_if_missing))
        mappings = {
            (0x01, 0x1111): ({0x1111: "Favorite One"}, True),
        }
        return mappings.get((ent_id, command_id), ({}, False))

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is True
    assert calls == [(0x01, 0x1111, True)]
    assert commands_by_device == {0x01: {0x1111: "Favorite One"}}
    assert proxy.state.activity_favorite_labels[act] == {(0x01, 0x1111): "Favorite One"}
    assert proxy.state.activity_keybinding_labels.get(act, {}) == {}
    assert proxy._keybinding_label_requests == {}


def test_ensure_commands_for_activity_leaves_existing_keybinding_requests_untouched(
    monkeypatch,
) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    cache = ActivityCache()
    act = 0x10
    cache.activity_favorite_slots[act] = [
        {"button_id": 0x01, "device_id": 0x01, "command_id": 0x1111},
    ]
    cache.activity_keybinding_slots[act] = [
        {"button_id": ButtonName.VOL_DOWN, "device_id": 0x01, "command_id": 0x2222},
    ]
    proxy.state = cache
    proxy._keybinding_label_requests[(0x01, 0x2222)] = {act}

    calls: list[tuple[int, int, bool]] = []

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        calls.append((ent_id, command_id, fetch_if_missing))
        mappings = {
            (0x01, 0x1111): ({0x1111: "Favorite One"}, True),
        }
        return mappings.get((ent_id, command_id), ({}, False))

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act, fetch_if_missing=False)

    assert ready is True
    assert calls == [(0x01, 0x1111, False)]
    assert commands_by_device == {0x01: {0x1111: "Favorite One"}}
    assert proxy._keybinding_label_requests == {(0x01, 0x2222): {act}}

def test_start_mdns_stops_on_bad_service_type(monkeypatch) -> None:
    registered = []

    class BadTypeInNameException(Exception):
        pass

    class DummyServiceInfo:
        def __init__(self, *, type_, name, addresses, port, properties, server):
            self.type = type_
            self.name = name
            self.addresses = addresses
            self.port = port
            self.properties = properties
            self.server = server

    class DummyZeroconf:
        def __init__(self, *_args, **_kwargs):
            pass

        def register_service(self, info):
            if info.type == "badtype":
                raise BadTypeInNameException("invalid name")
            registered.append(info)

        def close(self):
            pass

    class DummyIPVersion:
        V4Only = object()

    zc_module = types.ModuleType("zeroconf")
    zc_module.BadTypeInNameException = BadTypeInNameException
    zc_module.NonUniqueNameException = Exception
    zc_module.IPVersion = DummyIPVersion
    zc_module.ServiceInfo = DummyServiceInfo
    zc_module.Zeroconf = DummyZeroconf
    monkeypatch.setitem(sys.modules, "zeroconf", zc_module)
    x1_proxy_module = sys.modules["custom_components.sofabaton_x1s.lib.x1_proxy"]
    monkeypatch.setattr(x1_proxy_module, "_route_local_ip", lambda _ip: "127.0.0.1")
    monkeypatch.setattr(x1_proxy_module, "mdns_service_type_for_props", lambda _props: "badtype")

    proxy = X1Proxy("127.0.0.1", proxy_enabled=True, diag_dump=False, diag_parse=False)
    proxy._start_mdns()

    assert registered == []
    assert proxy._adv_started is False


def test_start_mdns_stops_on_non_unique_name(monkeypatch) -> None:
    registered = []

    class NonUniqueNameException(Exception):
        pass

    class DummyServiceInfo:
        def __init__(self, *, type_, name, addresses, port, properties, server):
            self.type = type_
            self.name = name
            self.addresses = addresses
            self.port = port
            self.properties = properties
            self.server = server

    class DummyZeroconf:
        def __init__(self, *_args, **_kwargs):
            pass

        def register_service(self, info):
            raise NonUniqueNameException("duplicate")

        def close(self):
            pass

    class DummyIPVersion:
        V4Only = object()

    zc_module = types.ModuleType("zeroconf")
    zc_module.BadTypeInNameException = Exception
    zc_module.NonUniqueNameException = NonUniqueNameException
    zc_module.IPVersion = DummyIPVersion
    zc_module.ServiceInfo = DummyServiceInfo
    zc_module.Zeroconf = DummyZeroconf
    monkeypatch.setitem(sys.modules, "zeroconf", zc_module)
    x1_proxy_module = sys.modules["custom_components.sofabaton_x1s.lib.x1_proxy"]
    monkeypatch.setattr(x1_proxy_module, "_route_local_ip", lambda _ip: "127.0.0.1")

    proxy = X1Proxy("127.0.0.1", proxy_enabled=True, diag_dump=False, diag_parse=False)
    proxy._start_mdns()

    assert registered == []
    assert proxy._adv_started is False


def test_start_mdns_advertises_x1_service_for_x2_hub(monkeypatch) -> None:
    registered = []

    class DummyServiceInfo:
        def __init__(self, *, type_, name, addresses, port, properties, server):
            self.type = type_
            self.name = name
            self.addresses = addresses
            self.port = port
            self.properties = properties
            self.server = server

    class DummyZeroconf:
        def __init__(self, *_args, **_kwargs):
            pass

        def register_service(self, info):
            registered.append(info)

        def close(self):
            pass

    class DummyIPVersion:
        V4Only = object()

    zc_module = types.ModuleType("zeroconf")
    zc_module.BadTypeInNameException = Exception
    zc_module.NonUniqueNameException = Exception
    zc_module.IPVersion = DummyIPVersion
    zc_module.ServiceInfo = DummyServiceInfo
    zc_module.Zeroconf = DummyZeroconf
    monkeypatch.setitem(sys.modules, "zeroconf", zc_module)
    x1_proxy_module = sys.modules["custom_components.sofabaton_x1s.lib.x1_proxy"]
    monkeypatch.setattr(x1_proxy_module, "_route_local_ip", lambda _ip: "127.0.0.1")

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=True,
        diag_dump=False,
        diag_parse=False,
        mdns_txt={"HVER": "3"},
    )
    proxy._start_mdns()

    assert len(registered) == 1
    assert registered[0].type == MDNS_SERVICE_TYPE_X1
    assert proxy._adv_started is True


def test_update_discovery_identity_uses_model_hub_mac_suffix_instance() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=True, diag_dump=False, diag_parse=False)

    proxy.update_discovery_identity(
        mdns_txt={
            "MAC": "AA:BB:CC:11:22:33",
            "NAME": "Living Room",
            "HVER": "1",
            "AVER": "17",
            "HA_PROXY": "1",
        },
        hub_version="X1",
    )

    assert proxy.mdns_instance == "X1-HUB-112233"
    assert proxy.mdns_host == "X1-HUB-112233.local"


def test_start_discovery_waits_for_banner_identity(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=True, diag_dump=False, diag_parse=False)
    calls: list[str] = []

    monkeypatch.setattr(proxy, "_start_mdns", lambda: calls.append("mdns") or True)
    monkeypatch.setattr(proxy.transport, "start_notify_listener", lambda: calls.append("notify"))

    proxy._start_discovery()

    assert calls == []


def test_notify_hub_state_does_not_start_discovery_directly(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=True, diag_dump=False, diag_parse=False)
    calls: list[str] = []

    monkeypatch.setattr(proxy, "_start_discovery", lambda: calls.append("start"))

    proxy._notify_hub_state(True)

    assert calls == []


def test_find_remote_uses_classic_opcode(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy,
        "enqueue_cmd",
        lambda opcode, payload=b"", **_kwargs: sent.append((opcode, payload)) or True,
    )

    assert proxy.find_remote() is True
    assert sent == [(OP_FIND_REMOTE, b"")]


def test_find_remote_uses_x2_opcode(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy,
        "enqueue_cmd",
        lambda opcode, payload=b"", **_kwargs: sent.append((opcode, payload)) or True,
    )

    assert proxy.find_remote() is True
    assert sent == [(OP_FIND_REMOTE_X2, b"\x00\x00\x08")]



def test_resync_remote_uses_classic_opcode(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy,
        "enqueue_cmd",
        lambda opcode, payload=b"", **_kwargs: sent.append((opcode, payload)) or True,
    )

    assert proxy.resync_remote() is True
    assert sent == [(OP_REMOTE_SYNC, b"")]


def test_resync_remote_x2_fetches_id_then_sync(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    sent: list[tuple[int, bytes]] = []

    def _enqueue(opcode, payload=b"", **_kwargs):
        sent.append((opcode, payload))
        return True

    monkeypatch.setattr(proxy, "enqueue_cmd", _enqueue)
    monkeypatch.setattr(proxy, "wait_for_x2_remote_sync_id", lambda timeout=2.0: b"\x00\x08\x5e")

    assert proxy.resync_remote() is True
    assert sent == [
        (OP_X2_REMOTE_LIST, b"\x00"),
        (OP_X2_REMOTE_SYNC, b"\x00\x08\x5e\x01"),
    ]


def test_resync_remote_x2_returns_false_without_remote_id(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    sent: list[tuple[int, bytes]] = []

    def _enqueue(opcode, payload=b"", **_kwargs):
        sent.append((opcode, payload))
        return True

    monkeypatch.setattr(proxy, "enqueue_cmd", _enqueue)
    monkeypatch.setattr(proxy, "wait_for_x2_remote_sync_id", lambda timeout=2.0: None)

    assert proxy.resync_remote() is False
    assert sent == [(OP_X2_REMOTE_LIST, b"\x00")]


def test_send_family_frame_sets_length_in_opcode(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    payload = bytes.fromhex("01 02 03")
    proxy._send_family_frame(0x0E, payload)

    assert sent == [((len(payload) << 8) | 0x0E, payload)]


def test_create_wifi_device_replays_sequence(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x07)
    ack_waits: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_waits.append(candidates)
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(commands=["Launch One"])

    assert result == {"device_id": 0x07, "status": "success"}
    assert proxy.state.devices[0x07] == {
        "brand": "m3tac0de",
        "name": "Home Assistant",
        "device_class": "wifi_roku",
        "device_class_code": 0x0A,
    }
    assert sent
    # first frame is the create-device head family
    assert (sent[0][0] & 0xFF) == 0x07
    families = {opcode & 0xFF for opcode, _ in sent}
    assert {0x07, 0x0E, 0x41, 0x12, 0x46, 0x08, 0x64}.issubset(families)
    assert ack_waits[0][0] == (0x0107, None)
    assert ack_waits[-1][0] == (0x0103, None)
    assert any((0x0112, 0xC6) in wait for wait in ack_waits)
    assert any((0x0112, 0xC7) in wait for wait in ack_waits)
    power_payloads = {payload[7]: payload for opcode, payload in sent if (opcode & 0xFF) == 0x12}
    assert power_payloads[ButtonName.POWER_ON][8] == 0x00
    assert power_payloads[ButtonName.POWER_OFF][8] == 0x00
    frame_7746 = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x46)
    expected_token = (sum(frame_7746[:-1]) - 2) & 0xFF
    assert frame_7746[-1] == expected_token


def test_restore_device_replays_create_persist_and_finalize(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)

    sequence_calls: list[list[Any]] = []

    def _run_create_sequence(_proxy, steps):
        step_list = list(steps)
        sequence_calls.append(step_list)
        if len(sequence_calls) == 1:
            return types.SimpleNamespace(
                success=True,
                assigned_device_id=0x22,
                failed_step=None,
                failed_index=None,
            )
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=0x22,
            failed_step=None,
            failed_index=None,
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)
    backup = {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
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
            "power_configured": True,
            "share_mode": 0,
            "tail_marker": 1,
            "extras": None,
        },
        "commands": [
            {
                "command_id": 18,
                "name": "Input",
                "restore_data": {
                    "transport": "hub_code_record",
                    "library_type": 0x0D,
                    "button_code": 0,
                    "data_hex": "00 01 02 03 04 05 06 07 08 09",
                },
            },
            {
                "command_id": 19,
                "name": "Power",
                "restore_data": {
                    "transport": "hub_code_record",
                    "library_type": 0x0D,
                    "button_code": 0,
                    "data_hex": "10 11 12 13 14 15 16 17 18 19",
                },
            },
        ],
        "key_sort": {"msg_hex": "58 12"},
        "inputs": [{"command_id": 18, "input_index": 1, "name": "Input"}],
        "input_record": {
            "device_id": 11,
            "source_id_byte": 1,
            "flag_a": 0,
            "flag_b": 0,
            "state_byte": 0x5A,
            "entries": [{"command_id": 18, "input_index": 1, "fid": 0x4E32, "name": "Input"}],
            "control_keys": {
                "input_list": "01 02 03 04 05 06 07 08 09",
                "input_up": "",
                "input_down": "",
                "input_confirm": "",
            },
            "favorites": ["11 12 13 14 15 16 17"],
        },
        "button_bindings": [
            {
                "button_id": 0x58,
                "device_id": 11,
                "command_id": 18,
                "command_name": "Input",
                "long_press_device_id": None,
                "long_press_command_id": None,
            }
        ],
        "macros": [
            {
                "button_id": 0xC6,
                "name": "POWER_ON",
                "steps": [
                    {
                        "device_id": 11,
                        "command_id": 19,
                        "fid": 0,
                        "duration": 0,
                        "delay": 0xFF,
                    }
                ],
            }
        ],
        "favorite_slots": [],
    }

    result = proxy.restore_device(backup)

    assert result == {
        "status": "success",
        "device_id": 0x22,
        "restored_commands": 2,
        "restored_button_bindings": 1,
        "restored_macros": 1,
        "restored_inputs": 1,
        "skipped_favorites": 0,
        "skipped_macro_steps": 0,
        "command_id_map": {"18": 18, "19": 19},
    }
    assert len(sequence_calls) == 2
    assert [step.label for step in sequence_calls[0]] == ["device-create"]
    assert sequence_calls[0][0].payload[7] == 0xFF
    create_config = parse_device_record(
        sequence_calls[0][0].payload[3:],
        hub_version=HUB_VERSION_X1,
    )
    assert create_config.input_flag == 0
    assert create_config.input_mode == 0
    assert create_config.power_mode == 1
    assert create_config.power_style == 3

    post_steps = sequence_calls[1]
    post_families = [step.family for step in post_steps]
    assert post_families[0] == 0x0E
    assert 0x61 not in post_families
    assert 0x08 in post_families
    assert 0x64 not in post_families
    assert post_families.index(0x0E) < post_families.index(0x3E) < post_families.index(0x41) < post_families.index(0x12) < post_families.index(0x46) < post_families.index(0x08)

    command_steps = [step for step in post_steps if step.family == 0x0E]
    assert len(command_steps) == 2
    assert all(step.timeout == 10.0 for step in command_steps)
    assert command_steps[0].payload[0] == 0x01
    assert command_steps[0].payload[3] == 0x02
    assert command_steps[0].payload[6] == 0x22
    assert command_steps[0].payload[7] == 0x12
    assert command_steps[1].payload[0] == 0x02
    assert command_steps[1].payload[3] == 0x02
    assert command_steps[1].payload[6] == 0x22
    assert command_steps[1].payload[7] == 0x13
    inputs_step = next(step for step in post_steps if step.family == 0x46)
    trailing_start = 3 + 8 + 27  # wrapper + body header + one X1 entry
    assert inputs_step.payload[7] == 0x01
    # The captured input_record carries a populated trailing region (an
    # input_list control-key row + one favorite row + a non-zero state
    # byte). Restore replays it verbatim so non-direct switching styles
    # survive the round-trip; a real direct device captures all-zero
    # trailing and is reproduced unchanged by the same path.
    assert inputs_step.payload[trailing_start : trailing_start + 36] == (
        bytes.fromhex("01 02 03 04 05 06 07 08 09") + b"\x00" * 27
    )
    favorite_offset = trailing_start + 36
    assert inputs_step.payload[favorite_offset : favorite_offset + 70] == (
        bytes.fromhex("11 12 13 14 15 16 17") + b"\x00" * 63
    )
    assert inputs_step.payload[-2] == 0x5A


def test_restore_device_x1s_keeps_restore_style_sequence(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)
    monkeypatch.setattr(proxy, "_refresh_destination_catalog", lambda timeout=5.0: None)

    sequence_calls: list[list[Any]] = []

    def _run_create_sequence(_proxy, steps):
        step_list = list(steps)
        sequence_calls.append(step_list)
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=0x22,
            failed_step=None,
            failed_index=None,
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)
    backup = {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
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
            "power_configured": True,
            "share_mode": 0,
            "tail_marker": 1,
            "extras": None,
        },
        "commands": [
            {
                "command_id": 18,
                "name": "Input",
                "restore_data": {
                    "transport": "hub_code_record",
                    "library_type": 0x0D,
                    "button_code": 0,
                    "data_hex": "00 01 02 03 04 05 06 07 08 09",
                },
            },
        ],
        "key_sort": {"msg_hex": "58 12"},
        "input_record": {
            "source_id_byte": 1,
            "flag_a": 0,
            "flag_b": 0,
            "state_byte": 0,
            "entries": [
                {"command_id": 18, "input_index": 1, "fid": 0, "name": "Input"}
            ],
            "control_keys": {
                "input_list": "",
                "input_up": "",
                "input_down": "",
                "input_confirm": "",
            },
            "favorites": [],
        },
        "button_bindings": [],
        "macros": [],
    }

    result = proxy.restore_device(backup)

    assert result is not None
    assert sequence_calls[0][0].payload[7] == 0x0B
    post_families = [step.family for step in sequence_calls[1]]
    assert post_families[0] == 0x41
    assert 0x61 in post_families
    assert 0x08 not in post_families
    assert 0x64 not in post_families
    assert post_families.index(0x61) < post_families.index(0x46)
    assert all(step.timeout == 5.0 for step in sequence_calls[1] if step.family == 0x0E)


def test_restore_device_x1s_preserves_input_record_trailing_region(monkeypatch) -> None:
    """X1S/X2 restore must replay the captured family-0x46 trailing
    region (navigation control keys + favorite/number-key rows) and the
    captured source_id_byte, not collapse every configured device to a
    bare direct-input entry list. ``inputModel`` is ``1`` for all
    list-based switching styles, so the page contents -- not the device
    tail -- are what distinguish menu / up-down / number-key / cycling
    from direct.
    """

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)
    monkeypatch.setattr(proxy, "_refresh_destination_catalog", lambda timeout=5.0: None)

    sequence_calls: list[list[Any]] = []

    def _run_create_sequence(_proxy, steps):
        step_list = list(steps)
        sequence_calls.append(step_list)
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=0x22,
            failed_step=None,
            failed_index=None,
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)
    backup = {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
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
            "power_configured": True,
            "share_mode": 0,
            "tail_marker": 1,
            "extras": None,
        },
        "commands": [
            {
                "command_id": 18,
                "name": "Input",
                "restore_data": {
                    "transport": "hub_code_record",
                    "library_type": 0x0D,
                    "button_code": 0,
                    "data_hex": "00 01 02 03 04 05 06 07 08 09",
                },
            },
        ],
        "key_sort": {"msg_hex": "58 12"},
        "inputs": [{"command_id": 18, "input_index": 1, "name": "Input"}],
        "input_record": {
            "device_id": 11,
            "source_id_byte": 3,
            "flag_a": 0,
            "flag_b": 0,
            "state_byte": 0x5A,
            "entries": [
                {"command_id": 18, "input_index": 1, "fid": 0x4E32, "name": "Input"}
            ],
            "control_keys": {
                "input_list": "",
                "input_up": "12 00 00 00 00 00 00 02 01",
                "input_down": "",
                "input_confirm": "13 00 00 00 00 00 00 01 00",
            },
            "favorites": ["21 00 00 00 00 00 00"],
        },
        "button_bindings": [],
        "macros": [],
        "favorite_slots": [],
    }

    result = proxy.restore_device(backup)

    assert result is not None
    inputs_step = next(step for step in sequence_calls[1] if step.family == 0x46)
    # payload = 3B outer wrapper + body; body[4] (source_id_byte) at
    # offset 7. One X1S entry is 48 bytes, so the trailing region starts
    # at wrapper(3) + body header(8) + 48.
    assert inputs_step.payload[7] == 0x03
    trailing_start = 3 + 8 + 48
    control_region = inputs_step.payload[trailing_start : trailing_start + 36]
    assert control_region == (
        b"\x00" * 9
        + bytes.fromhex("12 00 00 00 00 00 00 02 01")
        + b"\x00" * 9
        + bytes.fromhex("13 00 00 00 00 00 00 01 00")
    )
    favorite_offset = trailing_start + 36
    assert inputs_step.payload[favorite_offset : favorite_offset + 70] == (
        bytes.fromhex("21 00 00 00 00 00 00") + b"\x00" * 63
    )
    assert inputs_step.payload[-2] == 0x5A


def test_restore_device_input_mode_2_writes_source_type_zero(monkeypatch) -> None:
    """For input_mode=2 ("no input switching needed"), the post-create
    inputs/finalize write must use ``body[4] = 0``, matching the app's
    dedicated empty-input builder (``OoooOOO/o00O00O.OooO0o0``). Sending
    the device-record ``input_mode`` value here gets STATUS_ACK=0x09 on
    real hubs -- ``body[4]`` is an input-sequence byte (the ``i2`` arg
    to the entry-carrying app builders), not the device's input_mode.
    """

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)

    sequence_calls: list[list[Any]] = []

    def _run_create_sequence(_proxy, steps):
        step_list = list(steps)
        sequence_calls.append(step_list)
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=0x10,
            failed_step=None,
            failed_index=None,
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)

    def _persist_ir_blob(**_kwargs):
        return {"status": "success", "device_id": 0x10, "command_id": 1, "page_count": 1}

    monkeypatch.setattr(proxy, "persist_ir_blob", _persist_ir_blob)

    backup = {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
            "device_id": 6,
            "name": "Soundbar",
            "brand": "Bose",
            "device_class": "IR",
            "device_class_code": 0x10,
            "icon": 1,
            "code_type": 0x10,
            "device_type": 0x10,
            "input_mode": 2,           # "no input switching needed"
            "inputs_configured": True,
            "power_mode": 1,
            "power_style": 3,
            "tail_marker": 1,
        },
        "commands": [],
        "inputs": [],
        "button_bindings": [],
        "macros": [],
        "favorite_slots": [],
    }

    proxy.restore_device(backup)

    # Find the inputs step among the post-create steps.
    post_steps = sequence_calls[1]
    inputs_steps = [step for step in post_steps if step.family == 0x46]
    assert len(inputs_steps) == 1, "expected exactly one inputs/finalize step"
    inputs_payload = inputs_steps[0].payload
    # Payload = 3B outer wrapper [01,00,01] + body. body[4] is at
    # offset 3 (outer wrapper) + 4 = 7.
    assert inputs_payload[7] == 0x00, (
        f"inputs body[4] must be 0 for the empty-input write; got "
        f"0x{inputs_payload[7]:02X} (full payload={inputs_payload.hex(' ')})"
    )


def test_restore_device_x1_device_type_7_still_emits_input_step(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)

    sequence_calls: list[list[Any]] = []

    def _run_create_sequence(_proxy, steps):
        step_list = list(steps)
        sequence_calls.append(step_list)
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=0x10,
            failed_step=None,
            failed_index=None,
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)

    backup = {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
            "device_id": 1,
            "name": "JBL",
            "brand": "JBL",
            "device_class": "IR",
            "device_class_code": 0x10,
            "icon": 0x13,
            "sort": 0x0A,
            "code_type": 0x0D,
            "device_type": 0x07,
            "code_id_hex": "32 82 b7 89 03 44 48 28 b2 51 cf 6b 3f 8e a8 3b",
            "input_mode": 1,
            "inputs_configured": True,
            "power_mode": 1,
            "power_style": 3,
            "tail_marker": 1,
        },
        "commands": [],
        "inputs": [{"command_id": 0x13, "input_index": 1, "name": "Input"}],
        "button_bindings": [],
        "macros": [],
        "favorite_slots": [],
    }

    proxy.restore_device(backup)

    post_steps = sequence_calls[1]
    assert any(step.family == 0x46 for step in post_steps), (
        "X1 import must emit an inputs write even for device_type=0x07"
    )


def test_restore_device_rejects_bluetooth_until_backup_metadata_exists(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    backup = {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
            "device_id": 11,
            "name": "Speaker",
            "brand": "Denon",
            "device_class": "bluetooth",
            "device_class_code": 0x03,
        },
        "commands": [],
        "button_bindings": [],
        "macros": [],
        "inputs": [],
        "favorite_slots": [],
    }

    with pytest.raises(ValueError, match="command restore metadata"):
        proxy.restore_device(backup)


# Removed in Phase 3 of the protocol refactor: the
# ``_restore_requires_x1_post_steps`` guard is gone now that the
# family-0x46 builder is schema-driven and post-create writers work
# on every variant; the ValueError the old test asserted no longer
# fires.


@pytest.mark.parametrize(
    ("device_class", "expected_message"),
    [
        ("wifi_sonos", "needs command restore metadata"),
        ("wifi_roku", "needs command restore metadata"),
    ],
)
def test_restore_device_reports_class_specific_capability_gaps(
    monkeypatch,
    device_class: str,
    expected_message: str,
) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    backup = {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
            "device_id": 11,
            "name": "Device",
            "brand": "Brand",
            "device_class": device_class,
        },
        "commands": [],
        "button_bindings": [],
        "macros": [],
        "inputs": [],
        "favorite_slots": [],
    }

    with pytest.raises(ValueError, match=expected_message):
        proxy.restore_device(backup)


@pytest.mark.parametrize(
    "device_class",
    ["bluetooth", "rf_433mhz", "wifi_roku", "wifi_ip", "wifi_sonos"],
)
def test_restore_device_replays_hub_code_records(monkeypatch, device_class: str) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sequence_calls: list[list[Any]] = []

    def _run_create_sequence(_proxy, steps):
        step_list = list(steps)
        sequence_calls.append(step_list)
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=0x23,
            failed_step=None,
            failed_index=None,
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)

    backup = {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
            "device_id": 11,
            "name": "Speaker",
            "brand": "Brand",
            "device_class": device_class,
        },
        "commands": [
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
        ],
        "inputs": [],
        "button_bindings": [],
        "macros": [],
        "favorite_slots": [],
    }

    result = proxy.restore_device(backup)

    assert result == {
        "status": "success",
        "device_id": 0x23,
        "restored_commands": 1,
        "restored_button_bindings": 0,
        "restored_macros": 0,
        "restored_inputs": 0,
        "skipped_favorites": 0,
        "skipped_macro_steps": 0,
        "command_id_map": {"5": 5},
    }
    assert [step.label for step in sequence_calls[0]] == ["device-create"]
    command_steps = [step for step in sequence_calls[1] if step.family == 0x0E]
    assert len(command_steps) == 1
    assert command_steps[0].payload[0] == 0x01
    assert command_steps[0].payload[3] == 0x01
    assert command_steps[0].payload[6] == 0x23
    assert command_steps[0].payload[7] == 0x05
    assert 0x08 in [step.family for step in sequence_calls[1]]
    assert 0x64 not in [step.family for step in sequence_calls[1]]


def test_restore_device_allocates_free_destination_device_id(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)

    proxy.state.devices[0x07] = {"name": "Occupied"}
    captured_targets: list[int] = []

    def _run_create_sequence(_proxy, steps):
        step_list = list(steps)
        if len(captured_targets) == 0:
            captured_targets.append(step_list[0].payload[7])
            return types.SimpleNamespace(
                success=True,
                assigned_device_id=step_list[0].payload[7],
                failed_step=None,
                failed_index=None,
            )
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=captured_targets[0],
            failed_step=None,
            failed_index=None,
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)

    backup = {
        "kind": "device_backup",
        "schema_version": 4,
        "device": {
            "device_id": 7,
            "name": "Speaker",
            "brand": "Brand",
            "device_class": "IR",
            "device_class_code": 0x10,
        },
        "commands": [],
        "inputs": [],
        "button_bindings": [],
        "macros": [],
        "favorite_slots": [],
    }

    result = proxy.restore_device(backup)

    assert result is not None
    assert result["device_id"] == 0x01
    assert captured_targets == [0x01]


def test_persist_ir_blob_step_carries_selected_command_id() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    steps = proxy._build_command_write_steps_for_persist(
        device_id=0x12,
        command_id=0x07,
        command_name="Input",
        library_type=0x0D,
        library_data=bytes(range(10)),
    )

    assert steps
    assert steps[0].payload[:9] == bytes.fromhex("01 00 01 01 00 01 12 07 0d")


def test_persist_command_record_step_carries_library_type_and_command_code() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    steps = proxy._build_command_write_steps_for_persist(
        device_id=0x12,
        command_id=0x07,
        command_name="Bluetooth",
        library_type=0x03,
        library_data=bytes.fromhex("aa bb cc dd"),
        button_code=0x4E25,
    )

    assert steps
    assert steps[0].payload[:15] == bytes.fromhex(
        "01 00 01 01 00 01 12 07 03 00 00 00 00 4e 25"
    )


def test_create_wifi_device_can_assign_power_on_and_power_off_commands(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x04)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        commands=[f"Command {idx}" for idx in range(1, 11)],
        power_on_command_id=9,
        power_off_command_id=10,
    )

    assert result == {"device_id": 0x04, "status": "success"}
    power_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x12]
    assert len(power_payloads) == 4

    create_on_payload, create_off_payload, on_payload, off_payload = power_payloads

    assert create_on_payload[:9] == bytes.fromhex("01 00 01 01 00 01 04 c6 00")
    assert create_off_payload[:9] == bytes.fromhex("01 00 01 01 00 01 04 c7 00")
    assert on_payload[:19] == bytes.fromhex("01 00 01 01 00 01 04 c6 01 04 09 00 00 00 00 4e 29 00 ff")
    assert off_payload[:19] == bytes.fromhex("01 00 01 01 00 01 04 c7 01 04 0a 00 00 00 00 4e 2a 00 ff")
    assert on_payload[19:49].rstrip(b"\x00") == b"POWER_ON"
    assert off_payload[19:49].rstrip(b"\x00") == b"POWER_OFF"

    family_41_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x41]
    assert family_41_payloads == [bytes([0x04, 0x04]), bytes([0x04, 0x01])]

    payload_7b08 = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x08]
    assert len(payload_7b08) == 2
    assert bytes.fromhex("fc 02 01 03 00 fc 00 fc 01") in payload_7b08[-1]


def test_create_wifi_device_can_mix_assigned_and_cleared_power_commands(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x04)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        commands=[f"Command {idx}" for idx in range(1, 10)],
        power_on_command_id=9,
        power_off_command_id=None,
    )

    assert result == {"device_id": 0x04, "status": "success"}
    power_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x12]
    assert len(power_payloads) == 4

    _create_on_payload, _create_off_payload, on_payload, off_payload = power_payloads

    assert on_payload[:19] == bytes.fromhex("01 00 01 01 00 01 04 c6 01 04 09 00 00 00 00 4e 29 00 ff")
    assert off_payload[:9] == bytes.fromhex("01 00 01 01 00 01 04 c7 00")
    assert off_payload[9:39].rstrip(b"\x00") == b"POWER_OFF"


def test_create_wifi_device_skips_second_stage_when_power_is_unset(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x08)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(commands=["Launch One"])

    assert result == {"device_id": 0x08, "status": "success"}
    family_41_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x41]
    assert family_41_payloads == [bytes([0x08, 0x04])]
    payload_7b08 = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x08]
    assert len(payload_7b08) == 1


def test_create_wifi_device_uses_custom_name_brand_and_ip(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x07)

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")
    result = proxy.create_wifi_device(device_name="Living Room Roku", commands=["My Cmd"])

    assert result == {"device_id": 0x07, "status": "success"}
    assert proxy.state.devices[0x07] == {
        "brand": "m3tac0de",
        "name": "Living Room Roku",
        "device_class": "wifi_roku",
        "device_class_code": 0x0A,
    }
    create_payload = sent[0][1]
    finalize_payload = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x08)

    assert create_payload[32:62].rstrip(b"\x00") == b"Living Room Roku"
    assert create_payload[62:92].rstrip(b"\x00") == b"m3tac0de"
    assert create_payload[94:98] == bytes([10, 0, 0, 7])

    assert finalize_payload[32:62].rstrip(b"\x00") == b"Living Room Roku"
    assert finalize_payload[62:92].rstrip(b"\x00") == b"m3tac0de"
    assert finalize_payload[94:98] == bytes([10, 0, 0, 7])

    expected_tail_prefix = bytes.fromhex("fc 02")
    expected_tail_middle = bytes.fromhex("02 00 fc 00 fc")
    assert create_payload[101:103] == expected_tail_prefix
    assert create_payload[104:109] == expected_tail_middle
    assert create_payload[109] == 0x01
    assert create_payload[103] == 0x00

    assert finalize_payload[101:103] == expected_tail_prefix
    assert finalize_payload[104:109] == expected_tail_middle
    assert finalize_payload[109] == 0x01
    assert finalize_payload[103] == 0x01




def test_create_wifi_device_x1s_uses_utf16_name_fields(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x09)

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")
    result = proxy.create_wifi_device(device_name="Living Room Roku", commands=["My Cmd"], request_port=8765)

    assert result == {"device_id": 0x09, "status": "success"}
    assert proxy.state.devices[0x09] == {
        "brand": "m3tac0de",
        "name": "Living Room Roku",
        "device_class": "wifi_ip",
        "device_class_code": 0x1C,
    }
    create_payload = sent[0][1]
    define_payload = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x0E)
    finalize_payload = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x08)

    encoded_name = "Living Room Roku".encode("utf-16le")
    assert encoded_name in create_payload
    assert create_payload[7] == 0xFF
    assert create_payload[10] == 0x1C
    assert b"\xfc\x00\x00\xfc\x02\x00\x00\x00\xfc\x00\xfc\x00" in create_payload

    assert define_payload[0] == 0x01
    assert define_payload[1:6] == bytes([0x00, 0x01, 0x03, 0x00, 0x01])
    assert define_payload[16:75].startswith("My Cmd".encode("utf-16le"))
    assert define_payload[75:79] == bytes([10, 0, 0, 7])
    assert define_payload[79:81] == (8765).to_bytes(2, "big")
    request_len = define_payload[82]
    request_start = 83
    request_end = request_start + request_len
    assert request_end == len(define_payload) - 1
    request_blob = define_payload[request_start:request_end]
    assert request_blob.startswith(b"POST /launch/")
    assert b"Host:10.0.0.7:8765\r\n" in request_blob

    families = {opcode & 0xFF for opcode, _ in sent}
    assert 0x12 not in families
    assert 0x3E not in families

    assert finalize_payload[7] == 0x09
    assert finalize_payload[10] == 0x1C
    assert encoded_name in finalize_payload
    assert b"\xfc\x00\x00\xfc\x02\x00\x00\x00\xfc\x00\xfc\x01" in finalize_payload
    frame_7746 = next(payload for opcode, payload in sent if (opcode & 0xFF) == 0x46)
    expected_token = (sum(frame_7746[:-1]) - 2) & 0xFF
    assert frame_7746[-1] == expected_token


def test_create_wifi_device_x1s_accepts_command_definitions_with_press_type(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
        proxy_id="proxy-123",
        mdns_txt={"MAC": "AA:BB:CC:DD:EE:FF"},
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x09)

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        device_name="Living Room Roku",
        commands=[
            {"display_name": "My Cmd", "trigger_name": "My Cmd", "press_type": "short"},
            {"display_name": "My Cmd Long Press", "trigger_name": "My Cmd", "press_type": "long"},
        ],
        request_port=8765,
    )

    assert result == {"device_id": 0x09, "status": "success"}
    define_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x0E]
    assert len(define_payloads) == 2

    short_request_len = define_payloads[0][82]
    short_request = define_payloads[0][83 : 83 + short_request_len]
    long_request_len = define_payloads[1][82]
    long_request = define_payloads[1][83 : 83 + long_request_len]

    assert define_payloads[0][16:75].startswith("My Cmd".encode("utf-16le"))
    assert define_payloads[1][16:75].startswith("My Cmd Long Press".encode("utf-16le"))
    assert short_request.startswith(b"POST /launch/")
    assert long_request.startswith(b"POST /launch/")
    assert b"/0/short" in short_request
    assert b"/1/long" in long_request


def test_create_wifi_device_x1s_can_assign_power_on_and_power_off_commands(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x09)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        device_name="Living Room Roku",
        commands=[f"Command {idx}" for idx in range(1, 11)],
        request_port=8765,
        power_on_command_id=6,
        power_off_command_id=4,
    )

    assert result == {"device_id": 0x09, "status": "success"}
    family_41_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x41]
    assert family_41_payloads == [bytes([0x09, 0x04]), bytes([0x09, 0x01])]

    # X1S/X2 wifi-create now ends with a publish-finalize (0xD508 with
    # the identity-commit body), in addition to the main-flow
    # finalize-device-7b08 and the power-config-d508. The publish step
    # is what flips the hub-side "configured" flag and must run on
    # every variant create regardless of input/power configuration.
    payload_08 = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x08]
    assert len(payload_08) == 3
    publish_finalize = payload_08[-1]
    assert len(publish_finalize) == 213
    assert publish_finalize[7] == 0x09
    assert publish_finalize[9] == 0x09
    assert publish_finalize[10:12] == bytes.fromhex("1c 10")

    power_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x12]
    assert len(power_payloads) == 2
    on_payload, off_payload = power_payloads

    assert on_payload[:19] == bytes.fromhex("01 00 01 01 00 01 09 c6 01 09 06 00 00 00 00 00 00 00 ff")
    assert off_payload[:19] == bytes.fromhex("01 00 01 01 00 01 09 c7 01 09 04 00 00 00 00 00 00 00 ff")
    assert on_payload[19:79].startswith("POWER_ON".encode("utf-16be"))
    assert off_payload[19:79].startswith("POWER_OFF".encode("utf-16be"))


def test_create_wifi_device_x1s_without_power_commands_skips_power_edit_flow(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x09)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(device_name="Living Room Roku", commands=["My Cmd"], request_port=8765)

    assert result == {"device_id": 0x09, "status": "success"}
    families = {opcode & 0xFF for opcode, _ in sent}
    assert 0x12 not in families
    assert [payload for opcode, payload in sent if (opcode & 0xFF) == 0x41] == [bytes([0x09, 0x04])]


def test_create_wifi_device_x1_can_assign_input_commands(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x04)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "192.168.2.77")
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        commands=[f"Command {idx}" for idx in range(1, 11)],
        input_command_ids=[2, 4, 6],
    )

    assert result == {"device_id": 0x04, "status": "success"}

    assert any(opcode == 0x0148 and payload == bytes([0x04]) for opcode, payload in sent)

    input_payload = next(payload for opcode, payload in sent if opcode == 0xC846)
    assert len(input_payload) == 200
    assert input_payload[:11] == bytes.fromhex("01 00 01 01 00 01 04 01 03 00 00")
    assert input_payload[11:38] == bytes.fromhex("02 00 00 00 00 4e 22") + b"Command 2".ljust(20, b"\x00")
    assert input_payload[38:65] == bytes.fromhex("04 00 00 00 00 4e 24") + b"Command 4".ljust(20, b"\x00")
    assert input_payload[65:92] == bytes.fromhex("06 00 00 00 00 4e 26") + b"Command 6".ljust(20, b"\x00")
    assert input_payload[92:199] == b"\x00" * 107
    assert input_payload[-1] == (sum(input_payload[:-1]) - 0x02) & 0xFF

    refresh_requests = [(opcode, payload) for opcode, payload in sent if opcode == 0x020C]
    assert refresh_requests == [
        (0x020C, bytes([0x04, 0x02])),
        (0x020C, bytes([0x04, 0x04])),
        (0x020C, bytes([0x04, 0x06])),
    ]

    payload_08 = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x08]
    assert len(payload_08) == 2


def test_create_wifi_device_x1_six_inputs_uses_fa46_plus_2246_commit(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x0D)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "192.168.2.77")
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(
        commands=[f"TEST {idx}" for idx in range(1, 7)],
        input_command_ids=[1, 2, 3, 4, 5, 6],
    )

    assert result == {"device_id": 0x0D, "status": "success"}

    family_46_frames = [(opcode, payload) for opcode, payload in sent if (opcode & 0xFF) == 0x46]

    # FA46: 250B fixed, sub=02, N_total=6 in header, all 6 entries
    fa46_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xFA46]
    assert len(fa46_frames) == 1
    _, fa46_payload = fa46_frames[0]
    assert len(fa46_payload) == 250
    assert fa46_payload[:11] == bytes.fromhex("01 00 01 01 00 02 0d 01 06 00 00")  # sub=02, N=6
    # Entry 1: cmd_id=1, command_code=0x4E21, label "TEST 1" (20B padded)
    assert fa46_payload[11:38] == bytes.fromhex("01 00 00 00 00 4e 21") + b"TEST 1".ljust(20, b"\x00")
    # Entry 6: cmd_id=6, command_code=0x4E26, label "TEST 6"
    assert fa46_payload[11 + 5 * 27 : 11 + 6 * 27] == bytes.fromhex("06 00 00 00 00 4e 26") + b"TEST 6".ljust(20, b"\x00")

    # 2246 commit: 34B (= 6*27 - 128), last byte = (sum(fa46_payload) - 0x02) & 0xFF
    commit_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0x2246]
    assert len(commit_frames) == 1
    _, commit_payload = commit_frames[0]
    assert len(commit_payload) == 34
    assert commit_payload[:4] == bytes.fromhex("01 00 02 00")
    assert commit_payload[4:-1] == bytes(29)
    expected_checksum = (sum(fa46_payload) - 0x02) & 0xFF
    assert commit_payload[-1] == expected_checksum

    # No old-style single-frame with inline checksum (e.g., 0xC846) for N=6
    old_style_opcodes = {0xFA46, 0x2246, 0x7746}  # FA46, commit, sync are all expected
    assert not any(opcode not in old_style_opcodes and (opcode & 0xFF) == 0x46 for opcode, _ in family_46_frames)


def test_create_wifi_device_x1s_can_assign_input_commands(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x09)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    result = proxy.create_wifi_device(
        device_name="Living Room Roku",
        commands=[f"TEST {idx}" for idx in range(1, 7)],
        request_port=8060,
        input_command_ids=[1, 3, 5],
    )

    assert result == {"device_id": 0x09, "status": "success"}

    req_activity_frames = [(opcode, payload) for opcode, payload in sent if opcode == 0x0148]
    assert req_activity_frames == [(0x0148, bytes([0x09]))]

    # X1S uses FA46 (sub=02, fixed 250B) + 1046 commit for N≥3 inputs.
    family_46_frames = [(opcode, payload) for opcode, payload in sent if (opcode & 0xFF) == 0x46]
    fa46_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xFA46]
    assert len(fa46_frames) == 1, f"expected exactly 1 FA46 frame, got {len(fa46_frames)}"
    _, fa46_payload = fa46_frames[0]
    assert len(fa46_payload) == 250
    # Header: sub=02 (byte[5]), device_id=0x09, num_inputs=3
    assert fa46_payload[:10] == bytes.fromhex("01 00 01 01 00 02 09 01 03 00")
    # First input entry (48B): fixed fields + label
    assert fa46_payload[10:20] == bytes.fromhex("00 01 00 00 00 00 00 00 01 00")
    assert "TEST 1".encode("utf-16le") in fa46_payload
    assert "TEST 3".encode("utf-16le") in fa46_payload
    assert "TEST 5".encode("utf-16le") in fa46_payload
    # No inner checksum byte on FA46

    # 1046 commit frame: 16B, last byte = (sum(fa46_payload) - 0x02) & 0xFF
    commit_frames = [(opcode, payload) for opcode, payload in sent if opcode == 0x1046]
    assert len(commit_frames) == 1, f"expected exactly 1 1046 commit frame, got {len(commit_frames)}"
    _, commit_payload = commit_frames[0]
    assert len(commit_payload) == 16
    assert commit_payload[:15] == bytes.fromhex("01 00 02 00 00 00 00 00 00 00 00 00 00 00 00")
    expected_checksum = (sum(fa46_payload) - 0x02) & 0xFF
    assert commit_payload[15] == expected_checksum

    refresh_requests = [(opcode, payload) for opcode, payload in sent if opcode == 0x020C]
    assert refresh_requests == [
        (0x020C, bytes([0x09, 0x01])),
        (0x020C, bytes([0x09, 0x03])),
        (0x020C, bytes([0x09, 0x05])),
    ]

    # The wifi-create flow now sends two 0xD508 frames on X1S/X2: the
    # canonical family-0x08 device finalize (whose body length collides
    # with the input-finalize opcode), followed by the input-config
    # finalize. The input-config finalize is the last one written.
    d508_payloads = [payload for opcode, payload in sent if opcode == 0xD508]
    finalize_payload = d508_payloads[-1]
    assert len(finalize_payload) == 213
    assert finalize_payload[7] == 0x09
    assert finalize_payload[9] == 0x09
    assert finalize_payload[10:12] == bytes.fromhex("1c 10")


def test_create_wifi_device_x1s_five_inputs_uses_fa46_plus_7046_commit(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x10)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    result = proxy.create_wifi_device(
        device_name="Input test 6cmd 5in",
        commands=[f"TEST {idx}" for idx in range(1, 7)],
        request_port=8060,
        input_command_ids=[1, 2, 3, 4, 5],
    )

    assert result == {"device_id": 0x10, "status": "success"}

    family_46_frames = [(opcode, payload) for opcode, payload in sent if (opcode & 0xFF) == 0x46]
    fa46_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xFA46]
    assert len(fa46_frames) == 1
    _, fa46_payload = fa46_frames[0]
    assert len(fa46_payload) == 250
    assert fa46_payload[:10] == bytes.fromhex("01 00 01 01 00 02 10 01 05 00")  # N_total=5

    # N=5 commit: opcode 0x7046 (112B payload = 5*48-128)
    commit_frames = [(opcode, payload) for opcode, payload in sent if opcode == 0x7046]
    assert len(commit_frames) == 1
    _, commit_payload = commit_frames[0]
    assert len(commit_payload) == 112
    assert commit_payload[:4] == bytes.fromhex("01 00 02 00")
    assert commit_payload[4:-1] == bytes(107)  # 107 zero bytes
    expected_checksum = (sum(fa46_payload) - 0x02) & 0xFF
    assert commit_payload[-1] == expected_checksum

    assert not any(opcode == 0x1046 for opcode, _ in sent)
    assert not any(opcode == 0xA046 for opcode, _ in sent)


def test_create_wifi_device_x1s_six_inputs_uses_fa46_plus_a046(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x09)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], b"\x00"),
    )
    monkeypatch.setattr(proxy, "get_routed_local_ip", lambda: "10.0.0.7")

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(proxy, "_wait_for_wifi_input_refresh", lambda *, device_id, command_id, timeout=5.0: True)

    result = proxy.create_wifi_device(
        device_name="Input test 9x",
        commands=[f"TEST {idx}" for idx in range(1, 7)],
        request_port=8060,
        input_command_ids=[1, 2, 3, 4, 5, 6],
    )

    assert result == {"device_id": 0x09, "status": "success"}

    # FA46 frame: 250B, sub=02, N_total=6 in header, only entries 1-5
    family_46_frames = [(opcode, payload) for opcode, payload in sent if (opcode & 0xFF) == 0x46]
    fa46_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xFA46]
    assert len(fa46_frames) == 1
    _, fa46_payload = fa46_frames[0]
    assert len(fa46_payload) == 250
    assert fa46_payload[:10] == bytes.fromhex("01 00 01 01 00 02 09 01 06 00")  # N_total=6
    assert "TEST 1".encode("utf-16le") in fa46_payload
    assert "TEST 5".encode("utf-16le") in fa46_payload
    assert "TEST 6".encode("utf-16le") not in fa46_payload  # overflow, not in FA46

    # A046 frame: 160B continuation, overflow entry 6, combined checksum
    a046_frames = [(opcode, payload) for opcode, payload in family_46_frames if opcode == 0xA046]
    assert len(a046_frames) == 1
    _, a046_payload = a046_frames[0]
    assert len(a046_payload) == 160
    assert a046_payload[:10] == bytes.fromhex("01 00 02 00 06 00 00 00 00 00")  # N_total=6
    assert a046_payload[10:13] == bytes.fromhex("00 06 00")  # overflow entry cmd_id=6
    assert "TEST 6".encode("utf-16le") in a046_payload
    expected_checksum = (sum(fa46_payload) + sum(a046_payload[:-1]) - 0x05) & 0xFF
    assert a046_payload[-1] == expected_checksum

    # No variable-size commit frame for N>5 (uses A046 instead)
    assert not any(opcode in {0x1046, 0x4046, 0x7046} for opcode, _ in sent)

    refresh_requests = [(opcode, payload) for opcode, payload in sent if opcode == 0x020C]
    assert refresh_requests == [(0x020C, bytes([0x09, i])) for i in range(1, 7)]


# The two ``_build_device_input_config_payload`` body-layout tests
# were deleted in Phase 3 of the protocol refactor. The canonical X1
# and X1S/X2 body shapes are now pinned in ``tests/lib/test_inputs.py``
# via ``build_inputs_write``; the wifi-create caller is just one user
# of that single builder.


def test_x1s_input_refresh_frame_updates_command_cache() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    handler = DeviceButtonFamilyHandler()
    payload = bytes.fromhex(
        "01 00 01 01 00 01 0A 03 1C 00 00 00 00 00 00 00 "
        "54 00 45 00 53 00 54 00 20 00 31 00 "
        + "00 " * 48 +
        "C0 A8 02 4D 1F 7C 00 79 "
        + "50 4F 53 54 20 2F 6C 61 75 6E 63 68 2F 65 32 36 61 34 34 38 36 31 62 34 35 2F 31 30 2F 32 2F 73 68 6F 72 74 20 48 54 54 50 2F 31 2E 31 0D 0A 48 6F 73 74 3A 31 39 32 2E 31 36 38 2E 32 2E 37 37 3A 38 30 36 30 0D 0A 43 6F 6E 74 65 6E 74 2D 54 79 70 65 3A 61 70 70 6C 69 63 61 74 69 6F 6E 2F 78 2D 77 77 77 2D 66 6F 72 6D 2D 75 72 6C 65 6E 63 6F 64 65 64 0D 0A 0D 0A B9"
    )
    raw = bytes.fromhex("a5 5a cd 0d") + payload + bytes.fromhex("4e")

    handler.handle(
        FrameContext(
            proxy=proxy,
            opcode=0xCD0D,
            direction="H→A",
            payload=payload,
            raw=raw,
            name="OP_CD0D",
        )
    )

    assert proxy.state.commands[0x0A][0x03] == "TEST 1"


def test_ir_dump_family_frames_collect_structured_pages() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    handler = DeviceButtonFamilyHandler()

    proxy._burst.start("ir_dump:11:255", now=0.0)
    proxy._ir_dump_pending[(0x0B, 0xFF)] = {
        "event": threading.Event(),
        "device_id": 0x0B,
        "requested_command_id": None,
        "total_commands": None,
        "commands": {},
        "burst_finished": False,
    }

    page_one_payload = bytes.fromhex(
        "01 00 01 3a 00 02 0b 01 0d 00 00 00 00 17 18 00 50 00 6f 00 77 00 65 00 72 00 20 00 6f 00 66 00 66"
    ) + (b"\x00" * 40) + bytes.fromhex("01 20 00 10 01 00 94 70 00 00 23 6a")
    page_two_payload = bytes.fromhex("01 00 02 3a 00 00 02 7f 00 00 02 00")

    page_one_raw = bytes.fromhex("a5 5a fa 0d") + page_one_payload
    page_one_raw += bytes([sum(page_one_raw) & 0xFF])
    page_two_raw = bytes.fromhex("a5 5a 91 0d") + page_two_payload
    page_two_raw += bytes([sum(page_two_raw) & 0xFF])

    for opcode, payload, raw in (
        (0xFA0D, page_one_payload, page_one_raw),
        (0x910D, page_two_payload, page_two_raw),
    ):
        handler.handle(
            FrameContext(
                proxy=proxy,
                opcode=opcode,
                direction="H->A",
                payload=payload,
                raw=raw,
                name=f"OP_{opcode:04X}",
            )
        )

    proxy._on_ir_dump_burst_end("ir_dump:11:255")
    result = proxy._build_ir_dump_result(proxy._ir_dump_pending[(0x0B, 0xFF)])

    assert result["device_id"] == 0x0B
    assert result["requested_command_id"] is None
    assert result["total_commands"] == 0x3A
    assert result["received_command_count"] == 1
    assert result["complete"] is False
    assert result["commands"] == [
        {
            "command_id": 1,
            "device_id": 0x0B,
            "label": "Power off",
            "format_marker": 0x0D,
            "expected_page_count": 2,
            "page_count": 2,
            "complete": True,
            "ir_blob_hex": "01 20 00 10 01 00 94 70 00 00 23 6a 3a 00 00 02 7f 00 00 02 00",
            "ir_blob_byte_count": 21,
            "pages": [
                {
                    "page_no": 1,
                    "opcode": 0xFA0D,
                    "opcode_hex": "0xFA0D",
                    "payload_hex": page_one_payload.hex(" "),
                    "frame_hex": page_one_raw.hex(" "),
                    "ir_blob_hex": "01 20 00 10 01 00 94 70 00 00 23 6a",
                    "ir_blob_byte_count": 12,
                    "label_field_hex": "17 18",
                },
                {
                    "page_no": 2,
                    "opcode": 0x910D,
                    "opcode_hex": "0x910D",
                    "payload_hex": page_two_payload.hex(" "),
                    "frame_hex": page_two_raw.hex(" "),
                    "ir_blob_hex": "3a 00 00 02 7f 00 00 02 00",
                    "ir_blob_byte_count": 9,
                    "label_field_hex": None,
                },
            ],
        }
    ]


def test_ir_dump_single_command_probe_maps_pages_back_to_requested_command() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    handler = DeviceButtonFamilyHandler()

    proxy._burst.start("ir_dump:1:2", now=0.0)
    proxy._ir_dump_pending[(0x01, 0x02)] = {
        "event": threading.Event(),
        "device_id": 0x01,
        "requested_command_id": 0x02,
        "total_commands": None,
        "commands": {},
        "response_index_to_command_id": {},
        "burst_finished": False,
    }

    page_one_payload = bytes.fromhex(
        "01 00 01 01 00 02 01 02 0d 00 00 00 00 00 79 00 45 00 78 00 69 00 74"
    ) + (b"\x00" * 24) + bytes.fromhex("01 30 00 10 01 00 94 70 00 00 23 6a")
    page_two_payload = bytes.fromhex("01 00 02 3c 00 00 02 63 00 00 06 55")

    page_one_raw = bytes.fromhex("a5 5a fa 0d") + page_one_payload
    page_one_raw += bytes([sum(page_one_raw) & 0xFF])
    page_two_raw = bytes.fromhex("a5 5a a1 0d") + page_two_payload
    page_two_raw += bytes([sum(page_two_raw) & 0xFF])

    for opcode, payload, raw in (
        (0xFA0D, page_one_payload, page_one_raw),
        (0xA10D, page_two_payload, page_two_raw),
    ):
        handler.handle(
            FrameContext(
                proxy=proxy,
                opcode=opcode,
                direction="H->A",
                payload=payload,
                raw=raw,
                name=f"OP_{opcode:04X}",
            )
        )

    proxy._on_ir_dump_burst_end("ir_dump:1:2")
    result = proxy._build_ir_dump_result(proxy._ir_dump_pending[(0x01, 0x02)])

    assert result["device_id"] == 0x01
    assert result["requested_command_id"] == 0x02
    assert result["total_commands"] == 1
    assert result["received_command_count"] == 1
    assert result["complete"] is True
    assert result["commands"][0]["command_id"] == 2
    assert result["commands"][0]["label"] == "Exit"
    assert result["commands"][0]["page_count"] == 2


def test_ir_dump_single_command_finishes_burst_immediately_when_complete() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    handler = DeviceButtonFamilyHandler()

    proxy._burst.start("ir_dump:1:2", now=0.0)
    proxy._ir_dump_pending[(0x01, 0x02)] = {
        "event": threading.Event(),
        "device_id": 0x01,
        "requested_command_id": 0x02,
        "total_commands": None,
        "commands": {},
        "response_index_to_command_id": {},
        "burst_finished": False,
    }

    page_one_payload = bytes.fromhex(
        "01 00 01 01 00 02 01 02 0d 00 00 00 00 00 79 00 45 00 78 00 69 00 74"
    ) + (b"\x00" * 24) + bytes.fromhex("01 30 00 10 01 00 94 70 00 00 23 6a")
    page_two_payload = bytes.fromhex("01 00 02 3c 00 00 02 63 00 00 06 55")

    page_one_raw = bytes.fromhex("a5 5a fa 0d") + page_one_payload
    page_one_raw += bytes([sum(page_one_raw) & 0xFF])
    page_two_raw = bytes.fromhex("a5 5a a1 0d") + page_two_payload
    page_two_raw += bytes([sum(page_two_raw) & 0xFF])

    handler.handle(
        FrameContext(
            proxy=proxy,
            opcode=0xFA0D,
            direction="H->A",
            payload=page_one_payload,
            raw=page_one_raw,
            name="OP_FA0D",
        )
    )
    assert proxy._burst.active is True

    handler.handle(
        FrameContext(
            proxy=proxy,
            opcode=0xA10D,
            direction="H->A",
            payload=page_two_payload,
            raw=page_two_raw,
            name="OP_A10D",
        )
    )

    assert proxy._burst.active is False
    assert proxy._ir_dump_pending[(0x01, 0x02)]["burst_finished"] is True
    assert proxy._ir_dump_pending[(0x01, 0x02)]["event"].is_set() is True


def test_request_ir_command_dump_uses_idle_timeout_not_fixed_wall_clock(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    def _enqueue_cmd(_opcode, _payload=b"", **_kwargs):
        def _complete_later() -> None:
            time.sleep(0.05)
            with proxy._ir_dump_lock:
                pending = proxy._ir_dump_pending[(0x02, 0xFF)]
                pending["total_commands"] = 1
                pending["last_progress_ts"] = time.monotonic()
                pending["commands"][1] = {
                    "command_id": 1,
                    "device_id": 0x02,
                    "label": "Power",
                    "format_marker": 0x0D,
                    "expected_page_count": 1,
                    "pages": {
                        1: {
                            "page_no": 1,
                            "opcode": 0xFA0D,
                            "opcode_hex": "0xFA0D",
                            "payload_hex": "",
                            "frame_hex": "",
                            "ir_blob_hex": "01 02 03",
                            "ir_blob_byte_count": 3,
                            "_ir_blob_bytes": b"\x01\x02\x03",
                            "label_field_hex": None,
                        }
                    },
                }
            time.sleep(0.13)
            with proxy._ir_dump_lock:
                pending = proxy._ir_dump_pending[(0x02, 0xFF)]
                pending["burst_finished"] = True
                pending["event"].set()

        threading.Thread(target=_complete_later, daemon=True).start()
        return True

    monkeypatch.setattr(proxy, "enqueue_cmd", _enqueue_cmd)

    started = time.monotonic()
    result = proxy.request_ir_command_dump(0x02, timeout=0.10)
    elapsed = time.monotonic() - started

    assert result is not None
    assert result["device_id"] == 0x02
    assert result["total_commands"] == 1
    assert result["received_command_count"] == 1
    assert result["complete"] is True
    assert elapsed >= 0.15


def test_create_wifi_device_uses_custom_app_commands(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        proxy_id="proxy-123",
        mdns_txt={"MAC": "AA:BB:CC:DD:EE:FF"},
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x07)

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device(commands=["Lights On", "Lights Off"])

    assert result == {"device_id": 0x07, "status": "success"}
    assert proxy.state.devices[0x07] == {
        "brand": "m3tac0de",
        "name": "Home Assistant",
        "device_class": "wifi_roku",
        "device_class_code": 0x0A,
    }
    define_payloads = [payload for opcode, payload in sent if (opcode & 0xFF) == 0x0E]

    assert len(define_payloads) == 2

    custom_payloads = {payload[0]: payload for payload in define_payloads if payload[0] in {0x18, 0x19, 0x1A}}
    assert set(custom_payloads) == {0x18, 0x19}

    action_1 = custom_payloads[0x18][46 : 46 + custom_payloads[0x18][45]].decode("ascii")
    action_2 = custom_payloads[0x19][46 : 46 + custom_payloads[0x19][45]].decode("ascii")

    assert custom_payloads[0x18][15:45].rstrip(b"\x00") == b"Lights On"
    assert custom_payloads[0x19][15:45].rstrip(b"\x00") == b"Lights Off"
    assert action_1 == "launch/aabbccddeeff/7/0/short"
    assert action_2 == "launch/aabbccddeeff/7/1/short"


def test_stable_hub_action_id_falls_back_to_proxy_id() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False, proxy_id="proxy-123")

    assert proxy._stable_hub_action_id() == "proxy-123"


def test_create_wifi_device_without_custom_commands_defines_no_slots(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "wait_for_assigned_device_id", lambda timeout=5.0: 0x07)

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        first_opcode = candidates[0][0]
        return first_opcode, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    result = proxy.create_wifi_device()

    assert result == {"device_id": 0x07, "status": "success"}
    assert proxy.state.devices[0x07] == {
        "brand": "m3tac0de",
        "name": "Home Assistant",
        "device_class": "wifi_roku",
        "device_class_code": 0x0A,
    }
    define_slots = [payload[0] for opcode, payload in sent if (opcode & 0xFF) == 0x0E]
    assert define_slots == []

def test_wait_for_ack_matches_opcode_and_button() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.notify_ack(0x0103, b"\x00")
    proxy.notify_ack(0x013E, b"\xAB")

    assert proxy.wait_for_ack(0x013E, first_byte=0xAB, timeout=0.1) is True
    assert proxy.wait_for_ack(0x0103, timeout=0.1) is True


def test_wait_for_ack_timeout() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    assert proxy.wait_for_ack(0x0112, first_byte=0xC6, timeout=0.01) is False


def test_wait_for_roku_ack_any_ignores_stale_ack_when_not_before_is_set() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    stale_ts = time.monotonic()
    with proxy._ack_queue_lock:
        proxy._ack_queue.append((0x0103, b"\x00", stale_ts))
        proxy._ack_event.set()

    not_before = time.monotonic() + 0.02

    def _fresh_ack() -> None:
        time.sleep(0.03)
        proxy.notify_ack(0x0103, b"\x00")

    threading.Thread(target=_fresh_ack, daemon=True).start()

    matched = proxy.wait_for_ack_any([(0x0103, 0x00)], timeout=0.2, not_before=not_before)

    assert matched == (0x0103, b"\x00")
    with proxy._ack_queue_lock:
        assert any(op == 0x0103 and payload == b"\x00" and ts == stale_ts for op, payload, ts in proxy._ack_queue)


def test_send_step_uses_fallback_ack() -> None:
    from custom_components.sofabaton_x1s.lib.ack import AckOutcome

    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    proxy._send_cmd_frame = lambda opcode, payload: sent.append((opcode, payload))  # type: ignore[method-assign]
    wait_not_before: list[float | None] = []

    def _wait_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        assert candidates == [(0x013E, 0xAB), (0x0103, None)]
        wait_not_before.append(not_before)
        return 0x0103, b"\x00"

    proxy.wait_for_ack_any = _wait_any  # type: ignore[method-assign]

    result = proxy._send_step(
        step_name="map-button[0xAB]",
        family=0x3E,
        payload=b"\x00" * 25,
        ack_opcode=0x013E,
        ack_first_byte=0xAB,
        ack_fallback_opcodes=(0x0103,),
    )

    assert result.outcome is AckOutcome.acked
    assert result.ack_opcode == 0x0103
    assert sent
    assert wait_not_before and wait_not_before[0] is not None


def test_ensure_commands_for_activity_without_favorites_does_nothing(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    cache = ActivityCache()
    act = 0x10
    cache.activity_command_refs[act] = {(0x01, 0xAAAA), (0x02, 0xBBBB)}
    proxy.state = cache

    def fake_get_single(ent_id: int, command_id: int, fetch_if_missing: bool = True):
        raise AssertionError("should not fetch commands when no favorites")

    monkeypatch.setattr(proxy, "get_single_command_for_entity", fake_get_single)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is True
    assert commands_by_device == {}


def test_ensure_commands_for_activity_no_mapping_without_favorites_on_x1(
    monkeypatch,
) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    cache = ActivityCache()
    act = 0x10
    proxy.state = cache

    monkeypatch.setattr(proxy, "request_activity_mapping", lambda _act: False)

    commands_by_device, ready = proxy.ensure_commands_for_activity(act)

    assert ready is True
    assert commands_by_device == {}


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

    command_id = 0x0D
    commands, ready = proxy.get_single_command_for_entity(0x12, command_id)

    assert commands == {}
    assert ready is False
    assert enqueued == [
        (
            OP_REQ_COMMANDS,
            b"\x12\r",
            True,
            "commands:18:13",
        )
    ]


def test_get_single_command_for_entity_falls_back_for_high_byte(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    enqueued: list[tuple[int, bytes, bool, str | None]] = []

    def fake_enqueue(opcode, payload, expects_burst=False, burst_kind=None):
        enqueued.append((opcode, payload, expects_burst, burst_kind))

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    command_id = 0x0103
    commands, ready = proxy.get_single_command_for_entity(0x12, command_id)

    assert commands == {}
    assert ready is False
    assert enqueued == [
        (OP_REQ_COMMANDS, b"\x12\xff", True, "commands:18"),
    ]


def test_get_single_command_allows_multiple_pending_commands(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    enqueued: list[tuple[int, bytes, bool, str | None]] = []

    def fake_enqueue(opcode, payload, expects_burst=False, burst_kind=None):
        enqueued.append((opcode, payload, expects_burst, burst_kind))

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    proxy.get_single_command_for_entity(0x05, 0x01)
    proxy.get_single_command_for_entity(0x05, 0x02)

    assert enqueued == [
        (OP_REQ_COMMANDS, b"\x05\x01", True, "commands:5:1"),
        (OP_REQ_COMMANDS, b"\x05\x02", True, "commands:5:2"),
    ]


def test_x1_input_refresh_frame_updates_command_cache() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    handler = DeviceButtonFamilyHandler()
    payload = bytes.fromhex(
        "01 00 01 01 00 01 08 02 0a 00 00 00 00 4e 22 "
        "54 45 53 54 20 32 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "1d 6c 61 75 6e 63 68 2f 63 62 33 38 33 35 33 39 36 38 34 62 2f 38 2f 31 2f 73 68 6f 72 74 2b"
    )
    raw = bytes.fromhex("a5 5a 4c 0d") + payload + bytes.fromhex("92")

    handler.handle(
        FrameContext(
            proxy=proxy,
            opcode=0x4C0D,
            direction="H→A",
            payload=payload,
            raw=raw,
            name="OP_4C0D",
        )
    )

    assert proxy.state.commands[0x08][0x02] == "TEST 2"


def test_build_frame_for_single_command_payloads() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    single_01 = proxy._build_frame(OP_REQ_COMMANDS, b"\x01\x02")
    single_03 = proxy._build_frame(OP_REQ_COMMANDS, b"\x03\x03")
    single_full = proxy._build_frame(OP_REQ_COMMANDS, b"\x12\xff")

    assert single_01 == bytes.fromhex("a55a025c010260")
    assert single_03 == bytes.fromhex("a55a025c030363")
    assert single_full == bytes.fromhex("a55a025c12ff6e")


def test_clear_entity_cache_resets_all(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    ent_id = 0x42
    ent_lo = ent_id & 0xFF

    proxy.state.commands[ent_lo] = {0x01: "One"}
    proxy.state.buttons[ent_lo] = {ButtonName.VOL_UP}
    proxy.state.activity_command_refs[ent_lo] = {(0x10, 0x99)}
    proxy.state.activity_favorite_slots[ent_lo] = [
        {"button_id": 0xFE, "device_id": 0x10, "command_id": 0x99}
    ]
    proxy._pending_command_requests[ent_lo] = {0xFF}
    proxy._commands_complete.add(ent_lo)
    proxy._pending_button_requests.add(ent_lo)

    proxy.clear_entity_cache(ent_id, True, True)

    assert ent_lo not in proxy.state.commands
    assert ent_lo not in proxy.state.buttons
    assert ent_lo not in proxy.state.activity_command_refs
    assert ent_lo not in proxy.state.activity_favorite_slots
    assert ent_lo not in proxy._pending_command_requests
    assert ent_lo not in proxy._commands_complete
    assert ent_lo not in proxy._pending_button_requests

def test_partial_commands_still_trigger_full_fetch(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    ent_id = 0x07
    ent_lo = ent_id & 0xFF
    proxy.state.commands[ent_lo] = {0x01: "Exit"}

    enqueued: list[tuple] = []

    def fake_enqueue(opcode, payload, expects_burst=False, burst_kind=None):
        enqueued.append((opcode, payload, expects_burst, burst_kind))

    monkeypatch.setattr(proxy, "enqueue_cmd", fake_enqueue)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    cmds, ready = proxy.get_commands_for_entity(ent_id)

    assert cmds == {0x01: "Exit"}
    assert not ready
    assert enqueued == [
        (OP_REQ_COMMANDS, b"\x07\xff", True, "commands:7"),
    ]

    # When the burst for the full list ends, the cache becomes authoritative
    proxy._on_commands_burst_end("commands:7")

    enqueued.clear()
    cmds, ready = proxy.get_commands_for_entity(ent_id)

    assert cmds == {0x01: "Exit"}
    assert ready
    assert enqueued == []


def test_activity_map_handler_detects_last_page_marker() -> None:
    handler = ActivityMapHandler()

    assert handler._is_last_page(bytes.fromhex("01 00 01 05")) is False
    assert handler._is_last_page(bytes.fromhex("05 00 01 05")) is True
    assert handler._is_last_page(bytes.fromhex("06 00 01 05")) is True


def test_single_command_burst_end_clears_pending_without_completion() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    ent_id = 0x09
    ent_lo = ent_id & 0xFF
    proxy._pending_command_requests[ent_lo] = {0x03}

    proxy._on_commands_burst_end("commands:9")

    assert ent_lo not in proxy._pending_command_requests
    assert ent_lo not in proxy._commands_complete


def test_targeted_command_burst_end_only_drops_matching_pending() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    ent_id = 0x0A
    ent_lo = ent_id & 0xFF
    proxy._pending_command_requests[ent_lo] = {0x01, 0x02}

    proxy._on_commands_burst_end("commands:10:1")

    assert proxy._pending_command_requests[ent_lo] == {0x02}
    assert ent_lo not in proxy._commands_complete




@pytest.mark.xfail(strict=False, reason="Tests deleted snapshot-bytes parser (parse_macro_save_payload). See Phase 3.4.")
def test_build_macro_save_payload_from_observed_power_on_payload() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c6 08 "
        "01 c6 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff 01 "
        "02 c6 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff 01 "
        "01 c5 00 00 00 00 00 00 1d ff ff ff ff ff ff ff ff ff ff 01 "
        "02 c5 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff 01 "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 00"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_ON,
    )

    assert payload is not None
    assert payload[8] == 0x06
    assert len(payload) == 100
    assert bytes([0x06, 0xC6]) in payload
    assert bytes([0x06, 0xC5]) in payload


@pytest.mark.xfail(strict=False, reason="Tests deleted snapshot-bytes parser (parse_macro_save_payload). See 3.4.")
def test_build_macro_save_payload_from_observed_power_off_payload() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c7 04 "
        "01 c7 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff 01 "
        "02 c7 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff 01 "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_OFF,
    )

    assert payload is not None
    assert payload[8] == 0x03
    assert len(payload) == 70
    assert bytes([0x06, 0xC7]) in payload



@pytest.mark.xfail(strict=False, reason="Tests deleted snapshot-bytes parser (parse_macro_save_payload). See Phase 3.4.")
def test_build_macro_save_payload_keeps_compact_rows_when_len_divisible_by_20() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    # Compact rows (already 10-byte records), total length divisible by 20.
    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c6 06 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1d ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "04 c6 00 00 00 00 00 00 00 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 2a"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_ON,
    )

    assert payload is not None
    # Keep existing 6 rows and append 2 new ones for device 6.
    assert payload[8] == 0x08
    assert len(payload) == 120
    assert bytes([0x02, 0xC6]) in payload
    assert bytes([0x02, 0xC5]) in payload
    assert bytes([0x04, 0xC6]) in payload
    assert bytes([0x04, 0xC5]) in payload
    assert bytes([0x06, 0xC6]) in payload
    assert bytes([0x06, 0xC5]) in payload



@pytest.mark.xfail(strict=False, reason="Tests deleted snapshot-bytes parser (parse_macro_save_payload). See Phase 3.4.")
def test_build_macro_save_payload_filters_devices_by_activity_members() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c6 06 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1d ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "04 c6 00 00 00 00 00 00 00 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 2a"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 2, 6},
    )

    assert payload is not None
    # Rows for device 4 are removed; device 6 rows are added.
    assert payload[8] == 0x06
    assert len(payload) == 100
    assert bytes([0x04, 0xC6]) not in payload
    assert bytes([0x04, 0xC5]) not in payload
    assert bytes([0x06, 0xC6]) in payload
    assert bytes([0x06, 0xC5]) in payload



@pytest.mark.xfail(strict=False, reason="Tests deleted snapshot-bytes parser (parse_macro_save_payload). See Phase 3.4.")
def test_build_macro_save_payload_recomputes_trailing_token() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 66 c6 06 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1d ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 97"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x06,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 2, 6},
    )

    assert payload is not None
    assert payload[-1] == ((sum(payload[:-1]) - 2) & 0xFF)
    assert payload[-1] != 0x97


@pytest.mark.xfail(strict=False, reason="Tests deleted snapshot-bytes parser (parse_macro_save_payload). See Phase 3.4.")
def test_build_macro_save_payload_preserves_trailing_metadata_chunk() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 02 65 c6 0c "
        "03 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 05 ff "
        "06 c6 00 00 00 00 00 00 01 ff "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 00 ff "
        "04 c6 00 00 00 00 00 00 00 ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "03 c5 00 00 00 00 00 00 00 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "06 c5 00 00 00 00 00 00 00 ff "
        # metadata chunk observed in failing captures before label region
        "6a 71 00 00 00 00 00 00 0b e7 "
        "00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x08,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 2, 3, 4, 6, 8},
    )

    assert payload is not None
    assert bytes.fromhex("6a 71 00 00 00 00 00 00 0b") in payload


@pytest.mark.xfail(strict=False, reason="Tests deleted snapshot-bytes parser (parse_macro_save_payload). See Phase 3.4.")
def test_build_macro_save_payload_drops_placeholder_rows_for_x2_snapshot() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    source_payload = bytes.fromhex(
        "01 00 01 01 00 02 69 c6 15 "
        "03 c6 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff "
        "01 01 c5 00 00 00 00 00 00 0b ff ff ff ff ff ff ff ff ff ff "
        "01 01 c6 00 00 00 00 00 00 01 ff ff ff ff ff ff ff ff ff ff "
        "01 02 c6 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 04 c6 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 07 c6 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 02 c5 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 03 c5 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 04 c5 00 00 00 00 00 00 00 ff ff ff ff ff ff ff ff ff ff "
        "01 07 c5 00 00 00 00 00 00 00 ff "
        "08 c6 00 00 00 00 00 00 00 ff 08 c5 00 00 00 00 00 00 00 ff "
        "00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 fd"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x08,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 2, 3, 4, 7, 8},
    )

    assert payload is not None
    # Mirrors app's compact save count for this capture style (12 rows).
    assert payload[8] == 0x0C
    assert bytes.fromhex("ff ff ff ff ff ff ff ff ff ff") not in payload


@pytest.mark.xfail(strict=False, reason="Tests deleted snapshot-bytes parser (parse_macro_save_payload). See Phase 3.4.")
def test_build_macro_save_payload_accepts_utf16_macro_labels() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    # X1S/X2 observed payload style (UTF-16BE POWER_ON label with leading nulls).
    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 68 c6 08 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "03 c6 00 00 00 00 00 00 01 ff "
        "07 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 00 ff "
        "03 c5 00 00 00 00 00 00 05 ff "
        "07 c5 00 00 00 00 00 00 00 ff "
        "04 c6 00 00 00 00 00 00 01 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "fc 00 fc 04"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x09,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 3, 4, 7, 9},
    )

    assert payload is not None
    assert payload[8] == 0x0A
    assert bytes([0x09, 0xC6]) in payload
    assert bytes([0x09, 0xC5]) in payload
    assert b"\x00P\x00O\x00W" in payload


@pytest.mark.xfail(strict=False, reason="Tests deleted snapshot-bytes parser (parse_macro_save_payload). See Phase 3.4.")
def test_build_macro_save_payload_without_embedded_label_uses_row_count_hint() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    # Observed variant from OP_F013: no embedded POWER_ON label marker,
    # compact 10-byte rows followed by trailing metadata bytes.
    source_payload = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 09 "
        "11 03 c6 00 00 00 00 00 00 00 "
        "01 05 c6 00 00 00 00 00 00 00 "
        "01 01 c5 00 00 00 00 00 00 00 "
        "01 01 c6 00 00 00 00 00 00 00 "
        "01 07 c6 00 00 00 00 00 00 00 "
        "01 03 c5 00 00 00 00 00 00 00 "
        "02 03 1d 00 00 00 00 00 00 00 "
        "01 07 c5 00 00 00 00 00 00 00 "
        "01 05 c5 00 00 00 00 00 00 06 "
        "00 00 00 00 00 00 00 00 00 00 00 00"
    )

    payload = proxy._build_macro_save_payload(
        source_payload,
        device_id=0x09,
        button_id=ButtonName.POWER_ON,
        allowed_device_ids={1, 3, 5, 7, 9},
    )

    assert payload is not None
    assert payload[8] >= 0x08
    assert bytes([0x09, 0xC6]) in payload
    assert bytes([0x09, 0xC5]) in payload


def test_build_paged_macro_save_payloads_matches_multiframe_shape() -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    oversized_payload = bytes.fromhex(
        "01 00 01 01 00 02 65 c6 14 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "03 c5 00 00 00 00 00 00 0a ff "
        "04 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 00 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "03 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 00 ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "08 c6 00 00 00 00 00 00 00 ff "
        "08 c5 00 00 00 00 00 00 00 ff "
        "09 c6 00 00 00 00 00 00 00 ff "
        "09 c5 00 00 00 00 00 00 00 ff "
        "0b c6 00 00 00 00 00 00 01 ff "
        "0c c6 00 00 00 00 00 00 00 ff "
        "0d c6 00 00 00 00 00 00 00 ff "
        "0b c5 00 00 00 00 00 00 00 ff "
        "0c c5 00 00 00 00 00 00 00 ff "
        "0d c5 00 00 00 00 00 00 00 ff "
        "0a c6 00 00 00 00 00 00 00 ff "
        "0a c5 00 00 00 00 00 00 01 ff "
        "00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 35 35 00 00 00 00 30"
    )

    page_payloads = proxy._build_paged_macro_save_payloads(oversized_payload)

    assert len(page_payloads) == 2
    assert page_payloads[0][:9] == bytes.fromhex("01 00 01 01 00 02 65 c6 14")
    assert len(page_payloads[0]) == 250
    assert page_payloads[1][:3] == bytes.fromhex("01 00 02")
    expected_body = bytearray(oversized_payload[3:])
    expected_body[1:3] = bytes.fromhex("00 02")
    rebuilt_body = b"".join(page_payload[3:] for page_payload in page_payloads)
    assert rebuilt_body == bytes(expected_body)


def test_send_paged_macro_save_waits_for_each_chunk_ack(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    oversized_payload = bytes.fromhex(
        "01 00 01 01 00 02 65 c6 14 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "03 c5 00 00 00 00 00 00 0a ff "
        "04 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 00 ff "
        "04 c5 00 00 00 00 00 00 00 ff "
        "03 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 00 ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "08 c6 00 00 00 00 00 00 00 ff "
        "08 c5 00 00 00 00 00 00 00 ff "
        "09 c6 00 00 00 00 00 00 00 ff "
        "09 c5 00 00 00 00 00 00 00 ff "
        "0b c6 00 00 00 00 00 00 01 ff "
        "0c c6 00 00 00 00 00 00 00 ff "
        "0d c6 00 00 00 00 00 00 00 ff "
        "0b c5 00 00 00 00 00 00 00 ff "
        "0c c5 00 00 00 00 00 00 00 ff "
        "0d c5 00 00 00 00 00 00 00 ff "
        "0a c6 00 00 00 00 00 00 00 ff "
        "0a c5 00 00 00 00 00 00 01 ff "
        "00 50 00 4f 00 57 00 45 00 52 00 5f 00 4f 00 4e "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 35 35 00 00 00 00 30"
    )

    sent_pages: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: sent_pages.append((family, payload)))

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    ack = proxy._send_paged_macro_save(payload=oversized_payload, macro_button=ButtonName.POWER_ON)

    # The final-page 0x0112 ack is not pinned to the macro key: the hub may
    # ack with a different payload byte (e.g. after a cascading member
    # removal), so the waiter accepts any 0x0112.
    assert ack == (0x0112, b"\x00")
    assert [family for family, _payload in sent_pages] == [0x12, 0x12]
    assert sent_pages[0][1][:9] == bytes.fromhex("01 00 01 01 00 02 65 c6 14")
    assert sent_pages[1][1][:3] == bytes.fromhex("01 00 02")
    assert ack_calls == [[(0x0103, None)], [(0x0112, None), (0x0103, None)]]


def test_send_paged_macro_save_treats_nonzero_status_byte_as_rejection(
    monkeypatch, caplog
) -> None:
    """Phase 3.5 regression: 0x0103 with payload != 0x00 is a hub rejection.

    The hub ACKs every page with ``STATUS_ACK (0x0103)``; ``payload[0]``
    carries the status code. Before the fix, ``_send_paged_macro_save``
    matched any 0x0103 frame regardless of payload and silently treated a
    ``0x0c`` rejection as success, surfacing ``[ACTIVITY_ASSIGN] completed``
    while the macro was actually corrupt on the hub.
    """

    import logging

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    # Two-page payload built via the real builder so checksum + total_pages
    # are correct; only the ACK response varies in this test.
    from custom_components.sofabaton_x1s.lib.macros import (
        MacroKeyEntry,
        build_macro_save_payload,
    )

    payload = build_macro_save_payload(
        activity_id=0x65,
        key_id=ButtonName.POWER_ON,
        key_sequence=[
            MacroKeyEntry(device_id=d, key_id=0xC6, fid=0, duration=0, delay=0xFF)
            for d in range(1, 21)
        ],
        label="POWER_ON",
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)

    page_seq = {"n": 0}

    def _wait_for_ack_any(
        candidates, *, timeout=5.0, not_before=None
    ):
        page_seq["n"] += 1
        if page_seq["n"] == 1:
            return 0x0103, b"\x00"  # page 1 accepted
        return 0x0103, b"\x0c"  # page 2 rejected

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    with caplog.at_level(logging.WARNING, logger="x1proxy"):
        result = proxy._send_paged_macro_save(
            payload=payload, macro_button=ButtonName.POWER_ON
        )

    assert result is None
    assert page_seq["n"] == 2
    assert any(
        "hub rejected macro save" in rec.message and "status=0x0C" in rec.message
        for rec in caplog.records
    )


def test_build_macro_save_payload_always_emits_c5_row_for_new_device(monkeypatch) -> None:
    """Phase 3.5 regression: POWER_ON saves always include a (new_dev, 0xC5)
    row, even when input_index is 0.

    The official app's macro writer iterates the activity's device list
    and emits a C5 row for every device with a non-null input-key reference
    (always the case for newly-added devices, even when no HDMI input is
    selected). Skipping it produced a row-count mismatch that made the
    macro display corrupted in the app.
    """

    from custom_components.sofabaton_x1s.lib.macros import (
        MacroKeyEntry,
        MacroRecord,
    )

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    label_slot = ("POWER_ON".encode("utf-16-be")).ljust(60, b"\x00")
    source_record = MacroRecord(
        activity_id=0x65,
        key_id=ButtonName.POWER_ON,
        label="POWER_ON",
        key_sequence=(
            MacroKeyEntry(device_id=0x01, key_id=0xC6, fid=0, duration=0, delay=0xFF),
        ),
        raw_label_slot=bytes(label_slot),
    )

    payload = proxy._build_macro_save_payload(
        source_record,
        device_id=0x0E,
        button_id=ButtonName.POWER_ON,
        input_index=0,
    )

    # Walk the rows out of the body and confirm (0x0E, 0xC5) is present
    # with duration = 0.
    inner_body = payload[3:]
    declared_count = inner_body[5]
    rows_start = 6
    rows = [
        inner_body[rows_start + i * 10 : rows_start + (i + 1) * 10]
        for i in range(declared_count)
    ]
    c5_for_new = [row for row in rows if row[0] == 0x0E and row[1] == 0xC5]
    assert len(c5_for_new) == 1
    assert c5_for_new[0][8] == 0x00  # duration


def test_add_device_to_activity_discards_stale_members_before_refresh(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    # Simulate stale cache from an earlier run.
    for dev_id in (1, 2, 3, 4, 5):
        proxy.state.record_activity_member(101, dev_id)

    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        # Fresh burst only reports one member before adding a new one.
        proxy.state.record_activity_member(act_lo, 1)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_record",
        lambda _act, _button, timeout=5.0: MacroRecord(activity_id=_act & 0xFF, key_id=_button & 0xFF, label='', key_sequence=()))
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_record, *, device_id, button_id, allowed_device_ids=None, input_index=0: b"\x00\x00\x00",
    )
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], bytes([candidates[0][1] if candidates[0][1] is not None else 0x00])),
    )

    result = proxy.add_device_to_activity(101, 9)

    assert result is not None
    # Confirm sequence should use fresh map data (dev 1) + new device only.
    assert sent[:2] == [
        (0x024F, bytes([0x01, 0x00])),
        (0x024F, bytes([0x09, 0x00])),
    ]


def test_add_device_to_activity_uses_activity_members_from_map(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy.state.record_activity_member(act_lo, 2)
        proxy.state.record_activity_member(act_lo, 6)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    # Favorites only reveal two members, but activity-map membership includes device 6.
    proxy.state.activity_favorite_slots[101] = [
        {"button_id": 1, "device_id": 1, "command_id": 0x10},
        {"button_id": 2, "device_id": 2, "command_id": 0x11},
    ]
    proxy.state.record_activity_member(101, 1)
    proxy.state.record_activity_member(101, 2)
    proxy.state.record_activity_member(101, 6)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_record",
        lambda _act, _button, timeout=5.0: MacroRecord(activity_id=_act & 0xFF, key_id=_button & 0xFF, label='', key_sequence=()))
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_record, *, device_id, button_id, allowed_device_ids=None, input_index=0: b"\x00\x00\x00",
    )
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], bytes([candidates[0][1] if candidates[0][1] is not None else 0x00])),
    )

    result = proxy.add_device_to_activity(101, 5)

    assert result is not None
    assert result["members_before"] == [1, 2, 6]
    assert result["members_confirmed"] == [1, 2, 6, 5]
    assert sent[:4] == [
        (0x024F, bytes([0x01, 0x00])),
        (0x024F, bytes([0x02, 0x00])),
        (0x024F, bytes([0x06, 0x00])),
        (0x024F, bytes([0x05, 0x00])),
    ]

def test_add_device_to_activity_builds_power_macros_from_scratch_on_empty_reply(monkeypatch) -> None:
    """A brand-new activity answers the macro fetch with STATUS_ACK 0x07.

    The assignment must synthesize an empty source record and proceed
    instead of timing out waiting for a macro burst that never comes.
    """

    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    def _request_activity_mapping(act_id: int) -> bool:
        proxy._activity_map_complete.add(act_id & 0xFF)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(proxy, "wait_for_macro_record", lambda _act, _button, timeout=5.0: None)
    monkeypatch.setattr(
        proxy,
        "_wait_for_ack_any_impl",
        lambda candidates, *, timeout=5.0, not_before=None, log_timeout=True: (0x0103, b"\x07"),
    )

    source_records: list[MacroRecord] = []

    def _build(source_record, *, device_id, button_id, allowed_device_ids=None, input_index=0):
        source_records.append(source_record)
        return b"\x00\x00\x00"

    monkeypatch.setattr(proxy, "_build_macro_save_payload", _build)
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], bytes([candidates[0][1] if candidates[0][1] is not None else 0x00])),
    )

    result = proxy.add_device_to_activity(104, 1)

    assert result is not None
    assert result["members_confirmed"] == [1]
    assert [record.key_id for record in source_records] == [ButtonName.POWER_ON, ButtonName.POWER_OFF]
    assert all(record.key_sequence == () for record in source_records)
    assert all(record.activity_id == 104 for record in source_records)


def test_add_device_to_activity_requires_ack(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    proxy.state.activity_favorite_slots[101] = [
        {"button_id": 1, "device_id": 1, "command_id": 0x10},
    ]

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_record",
        lambda _act, button, timeout=5.0: MacroRecord(activity_id=_act & 0xFF, key_id=button & 0xFF, label='', key_sequence=()))
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_record, *, device_id, button_id, allowed_device_ids=None, input_index=0: b"\x00\x00\x00",
    )

    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)

    attempts = {"count": 0}

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        attempts["count"] += 1
        if attempts["count"] == 1:
            first_opcode, first_byte = candidates[0]
            return first_opcode, bytes([first_byte if first_byte is not None else 0x00])
        return None

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    result = proxy.add_device_to_activity(101, 6)

    assert result is None
    assert sent == [
        (0x024F, bytes([0x01, 0x00])),
        (0x024F, bytes([0x06, 0x00])),
    ]





def test_add_device_to_activity_x2_uses_same_assignment_flow_as_x1s(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X2,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy.state.record_activity_member(act_lo, 2)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    proxy.state.activities[101] = {"name": "Play PlayStation 5", "active": False}
    proxy.state.activity_favorite_slots[101] = [
        {"button_id": 1, "device_id": 1, "command_id": 0x10},
        {"button_id": 2, "device_id": 2, "command_id": 0x11},
    ]

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    family_sends: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: family_sends.append((family, payload)))

    macro_payload = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "02 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1a ff "
        "02 c5 00 00 00 00 00 00 00 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 00"
    )

    monkeypatch.setattr(proxy, "wait_for_macro_record", lambda _act, _button, timeout=5.0: MacroRecord(activity_id=_act & 0xFF, key_id=_button & 0xFF, label='', key_sequence=()))
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_record, *, device_id, button_id, allowed_device_ids=None, input_index=0: b"\x00\x00\x00",
    )

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    result = proxy.add_device_to_activity(101, 6)

    assert result is not None
    assert sent == [
        (0x024F, bytes([0x01, 0x00])),
        (0x024F, bytes([0x02, 0x00])),
        (0x024F, bytes([0x06, 0x00])),
        (0x024D, bytes([0x65, 0xC6])),
        (0x024D, bytes([0x65, 0xC7])),
    ]
    assert len(family_sends) == 2
    assert ack_calls == [
        [(0x0103, None)],
        [(0x0103, None)],
        [(0x0103, None)],
        [(0x0112, None), (0x0103, None)],
        [(0x0112, None), (0x0103, None)],
    ]


@pytest.mark.xfail(strict=False, reason="add_device_to_activity now warns-and-proceeds on input-query failure rather than aborting; assertion encodes obsolete behavior.")
def test_add_device_to_activity_rejects_activity_inputs_error_ack(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)

    macro_payload = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1a ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "01 00 00 00 00 00 2d 76 00"
    )

    monkeypatch.setattr(proxy, "wait_for_macro_record", lambda _act, _button, timeout=5.0: MacroRecord(activity_id=_act & 0xFF, key_id=_button & 0xFF, label='', key_sequence=()))
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.timeout))

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ):
        if candidates == [(0x0103, None)]:
            return 0x0103, b"\xff"
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    assert proxy.add_device_to_activity(101, 6) is None


def test_add_device_to_activity_x1_does_not_send_finalize_stage(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        proxy.state.record_activity_member(act_lo, 1)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    proxy.state.activity_favorite_slots[101] = [{"button_id": 1, "device_id": 1, "command_id": 0x10}]

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    family_sends: list[int] = []
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: family_sends.append(family))

    macro_payload = bytes.fromhex(
        "01 00 01 01 00 01 65 c7 "
        "01 c7 00 00 00 00 00 00 01 ff "
        "01 ff ff ff ff ff ff ff ff ff "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )

    monkeypatch.setattr(proxy, "wait_for_macro_record", lambda _act, _button, timeout=5.0: MacroRecord(activity_id=_act & 0xFF, key_id=_button & 0xFF, label='', key_sequence=()))
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.acked))
    monkeypatch.setattr(
        proxy,
        "_build_macro_save_payload",
        lambda source_record, *, device_id, button_id, allowed_device_ids=None, input_index=0: b"\x00\x00\x00",
    )
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (candidates[0][0], bytes([candidates[0][1] if candidates[0][1] is not None else 0x00])),
    )

    result = proxy.add_device_to_activity(101, 6)

    assert result is not None
    assert family_sends == [0x12, 0x12]

def test_build_favorite_map_payload_matches_observed_sample() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    payload = proxy._build_favorite_map_payload(
        activity_id=0x66,
        device_id=0x06,
        command_id=0x04,
        slot_id=0x00,
    )

    assert payload == bytes.fromhex(
        "01 00 01 01 00 01 66 00 06 00 00 00 00 4e 24 04 00 00 00 00 00 00 00 00 e4"
    )



def test_delete_device_replays_delete_and_confirms_impacted_activities(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    def _request_activities() -> bool:
        proxy._burst.active = True
        proxy._burst.kind = "activities"
        proxy._burst.active = False
        proxy.state.activities[0x66] = {"name": "heyo", "active": False, "needs_confirm": True}
        proxy.state.activities[0x65] = {"name": "test", "active": True, "needs_confirm": False}
        return True

    monkeypatch.setattr(proxy, "request_activities", _request_activities)

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        return 0x0103, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    result = proxy.delete_device(0x04)

    assert result == {
        "device_id": 0x04,
        "confirmed_activities": [0x66],
        "status": "success",
    }
    assert [opcode for opcode, _payload in sent] == [0x0109, 0x7B38]
    assert sent[0][1] == b""
    assert sent[1][1][7] == 0x66
    assert sent[1][1][9] == 0x02
    assert sent[1][1][95] == 0x00
    assert ack_calls == [[(0x0103, None)], [(0x0103, None)]]






def test_delete_device_uses_x1s_finalize_opcode_for_activity_confirmation(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    def _request_activities() -> bool:
        proxy._burst.active = True
        proxy._burst.kind = "activities"
        proxy._burst.active = False
        row_payload = bytearray(214)
        row_payload[0] = 0x04
        row_payload[6:8] = (0x0068).to_bytes(2, "big")
        row_payload[170:174] = bytes([0xFC, 0x00, 0xFC, 0x01])
        proxy.state.activities[0x68] = {
            "name": "Play Xbox",
            "active": False,
            "needs_confirm": True,
        }
        proxy._activity_row_payloads[0x68] = bytes(row_payload)
        return True

    monkeypatch.setattr(proxy, "request_activities", _request_activities)
    monkeypatch.setattr(proxy, "wait_for_ack_any", lambda candidates, timeout=5.0, not_before=None: (0x0103, b"\x00"))

    result = proxy.delete_device(0x04)

    assert result is not None
    assert [opcode for opcode, _payload in sent] == [0x0109, OP_ACTIVITY_ASSIGN_FINALIZE]
    assert len(sent[1][1]) == 214
    assert sent[1][1][173] == 0x00

def test_delete_device_uses_120_second_delete_ack_timeout(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False, hub_version=HUB_VERSION_X1)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    observed: dict[str, float] = {}

    def _wait_for_ack_any(candidates, *, timeout=5.0, not_before=None):
        observed["timeout"] = timeout
        return 0x0103, b"\x00"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)
    monkeypatch.setattr(proxy, "request_activities", lambda: False)

    assert proxy.delete_device(0x04) is None
    assert observed["timeout"] == 120.0
def test_delete_device_requires_delete_ack(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)
    monkeypatch.setattr(proxy, "wait_for_ack_any", lambda candidates, timeout=5.0, not_before=None: None)

    requested = {"count": 0}

    def _request_activities() -> bool:
        requested["count"] += 1
        return True

    monkeypatch.setattr(proxy, "request_activities", _request_activities)

    assert proxy.delete_device(0x04) is None
    assert requested["count"] == 0

def test_command_to_button_short_press_matches_observed_sample() -> None:
    """The 0x193E command-to-button mapping is byte-identical to the
    canonical family-0x3E button-binding step from
    :mod:`lib.device_create`. The previously-separate
    ``_build_command_to_button_payload`` builder was removed in Phase
    4 of the protocol refactor; this test pins that the captured
    bytes still round-trip through the canonical builder.
    """

    from custom_components.sofabaton_x1s.lib.device_create import (
        build_button_binding_step,
        synthesize_command_code,
    )

    step = build_button_binding_step(
        device_id=0x65,
        button_id=0xC1,
        short_press_device_id=0x05,
        short_press_button_code=synthesize_command_code(0x02),
        short_press_button_id=0x02,
    )

    assert step.payload == bytes.fromhex(
        "01 00 01 01 00 01 65 c1 05 00 00 00 00 4e 22 02 00 00 00 00 00 00 00 00 9f"
    )


def test_command_to_button_long_press_matches_observed_sample() -> None:
    """The captured long-press sample (OK button on activity 0x65,
    short=dev05/cmd01, long=dev05/cmd02) also round-trips through the
    canonical builder.
    """

    from custom_components.sofabaton_x1s.lib.device_create import (
        build_button_binding_step,
        synthesize_command_code,
    )

    step = build_button_binding_step(
        device_id=0x65,
        button_id=0xB0,
        short_press_device_id=0x05,
        short_press_button_code=synthesize_command_code(0x01),
        short_press_button_id=0x01,
        long_press_device_id=0x05,
        long_press_button_code=synthesize_command_code(0x02),
        long_press_button_id=0x02,
    )

    assert step.payload == bytes.fromhex(
        "01 00 01 01 00 01 65 b0 05 00 00 00 00 4e 21 01 05 00 00 00 00 4e 22 02 03"
    )


def test_command_to_favorite_replays_sequence(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    cleared: list[tuple[int, bool, bool, bool]] = []
    monkeypatch.setattr(
        proxy,
        "clear_entity_cache",
        lambda ent_id, clear_buttons=False, clear_favorites=False, clear_macros=False: cleared.append(
            (ent_id, clear_buttons, clear_favorites, clear_macros)
        ),
    )

    result = proxy.command_to_favorite(0x66, 0x06, 0x04)

    assert result == {
        "activity_id": 0x66,
        "device_id": 0x06,
        "command_id": 0x04,
        "slot_id": 0x00,
        "fav_id": None,
        "status": "success",
    }
    # X1 sends a 0x62 favorites-order request before the map step so it can
    # include the existing (fav_id, slot) pairs in the stage payload.
    assert [opcode & 0xFF for opcode, _payload in sent] == [0x62, 0x3E, 0x61, 0x65]
    assert sent[0][1] == bytes([0x66])   # fav-order request payload = act_lo
    assert sent[1][1] == bytes.fromhex(
        "01 00 01 01 00 01 66 00 06 00 00 00 00 4e 24 04 00 00 00 00 00 00 00 00 e4"
    )
    # X1 stage uses _build_favorites_reorder_payload([1]) — no pre-existing entries,
    # new_fav_id=None so fallback ordered_ids=[1]:
    # [01 00 01 01 00 01 66 01 01] + checksum 6A
    assert sent[2][1] == bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, 0x66, 0x01, 0x01, 0x6A])
    assert sent[3][1] == b"f"
    assert ack_calls == [
        # fav-order query for act=0x66; STATUS_ACK 0x07 = empty quick-access table
        [(0xFF63, 0x66), (0x0103, 0x07)],
        [(0x013E, None), (0x0103, None)],      # map
        [(0x0103, None)],                      # stage
        [(0x0103, None)],                      # commit
    ]
    assert cleared == [(0x66, False, True, False)]
    assert requested == [0x66]


def test_command_to_favorite_x1s_replays_sequence(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, first_byte = candidates[0]
        if first_opcode == 0x0103:
            # STATUS_ACK: 0x00 = accepted; the _send_step classifier treats
            # any other byte as a hub rejection.
            return first_opcode, b"\x00"
        # 0x013E map ack: stub the hub-assigned fav_id as 0x04 so the
        # follow-on stage payload includes it.
        return first_opcode, bytes([first_byte if first_byte is not None else 0x04])

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    cleared: list[tuple[int, bool, bool, bool]] = []
    monkeypatch.setattr(
        proxy,
        "clear_entity_cache",
        lambda ent_id, clear_buttons=False, clear_favorites=False, clear_macros=False: cleared.append(
            (ent_id, clear_buttons, clear_favorites, clear_macros)
        ),
    )

    result = proxy.command_to_favorite(0x68, 0x01, 0x03)

    assert result == {
        "activity_id": 0x68,
        "device_id": 0x01,
        "command_id": 0x03,
        "slot_id": 0x00,
        "fav_id": 4,
        "status": "success",
    }
    assert [opcode & 0xFF for opcode, _payload in sent] == [0x3E, 0x61, 0x65]
    assert sent[0][1] == bytes.fromhex(
        "01 00 01 01 00 01 68 00 01 00 00 00 00 4e 23 03 00 00 00 00 00 00 00 00 df"
    )
    assert sent[1][1] == bytes.fromhex("01 00 01 01 00 01 68 01 01 02 02 03 03 04 04 7e")
    assert sent[2][1] == b"h"
    assert ack_calls == [
        [(0x013E, None), (0x0103, None)],
        [(0x0103, None)],
        [(0x0103, None)],
    ]
    assert cleared == [(0x68, False, True, False)]
    assert requested == [0x68]


def test_command_to_favorite_can_skip_refresh_after_write(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    result = proxy.command_to_favorite(0x68, 0x01, 0x03, refresh_after_write=False)
    assert result is not None
    assert requested == []


def test_command_to_favorite_x1_can_skip_existing_order_query(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, _first_byte = candidates[0]
        if first_opcode == 0x0103:
            return first_opcode, b"\x00"
        return first_opcode, b"\x04"

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)

    result = proxy.command_to_favorite(0x65, 0x04, 0x02, slot_id=3, query_existing_order=False)

    assert result == {
        "activity_id": 0x65,
        "device_id": 0x04,
        "command_id": 0x02,
        "slot_id": 0x03,
        "fav_id": 4,
        "status": "success",
    }
    assert [opcode & 0xFF for opcode, _payload in sent] == [0x3E, 0x61, 0x65]
    assert ack_calls == [
        [(0x013E, None), (0x0103, None)],
        [(0x0103, None)],
        [(0x0103, None)],
    ]


def test_delete_favorite_requires_explicit_fav_id(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: [(0x02, 0x01), (0x04, 0x02), (0x06, 0x03)])

    steps: list[tuple[str, int, bytes, float]] = []

    def _send_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload, timeout))
        return SendStepResult(outcome=AckOutcome.acked)

    monkeypatch.setattr(proxy, "_send_step", _send_step)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)
    monkeypatch.setattr(proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    result = proxy.delete_favorite(0x66, 0x04)

    assert result == {
        "activity_id": 0x66,
        "deleted_fav_id": 0x04,
        "remaining": 2,
        "status": "success",
    }
    assert steps == [
        ("fav-delete-10[act=0x66 fav=0x04]", 0x10, bytes([0x66, 0x04]), 12.0),
        ("fav-delete-reorder-61[act=0x66]", 0x61, bytes.fromhex("01 00 01 01 00 01 66 02 01 06 02 73"), 5.0),
        ("fav-delete-commit-65[act=0x66]", 0x65, b"\x66", 5.0),
    ]
    assert requested == [0x66]


def test_delete_favorite_rejects_unknown_fav_id(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: [(0x02, 0x01), (0x04, 0x02), (0x06, 0x03)])

    assert proxy.delete_favorite(0x66, 0x09) is None


def test_request_favorites_order_returns_empty_on_status_ack_07(monkeypatch) -> None:
    """No quick-access entries -> the hub sends STATUS_ACK 0x07, not a 0x63 row.

    That empty reply must resolve immediately as an empty order instead of
    stalling to the 5s ack timeout (bench capture 2026-07-16).
    """

    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(
        proxy,
        "_send_family_frame",
        lambda family, payload: sent.append((family, payload)),
    )
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, *, timeout=5.0, not_before=None: (0x0103, b"\x07"),
    )

    # A stale cached order must be replaced by the known-empty result.
    proxy.state.activity_favorites_order[0x66] = [(0x02, 0x01)]

    assert proxy.request_favorites_order(0x66) == []
    assert proxy.state.activity_favorites_order[0x66] == []
    assert sent == [(0x62, b"\x66")]


def test_request_favorites_order_returns_cached_order_on_63_response(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)

    def _ack(candidates, *, timeout=5.0, not_before=None):
        # Simulate FavoritesOrderHandler having parsed the 0x63 response.
        proxy.state.activity_favorites_order[0x66] = [(0x02, 0x01), (0x04, 0x02)]
        return (0xFF63, b"\x66")

    monkeypatch.setattr(proxy, "wait_for_ack_any", _ack)

    assert proxy.request_favorites_order(0x66) == [(0x02, 0x01), (0x04, 0x02)]


def test_reorder_favorites_requires_explicit_fav_ids(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: [(0x02, 0x01), (0x04, 0x02), (0x06, 0x03)])

    steps: list[tuple[str, int, bytes]] = []

    def _send_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload))
        return SendStepResult(outcome=AckOutcome.acked)

    monkeypatch.setattr(proxy, "_send_step", _send_step)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)
    monkeypatch.setattr(proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    result = proxy.reorder_favorites(0x66, [0x06, 0x02, 0x04])

    assert result == {"activity_id": 0x66, "fav_ids": [0x06, 0x02, 0x04], "status": "success"}
    assert steps == [
        ("fav-reorder-61[act=0x66]", 0x61, bytes.fromhex("01 00 01 01 00 01 66 06 01 02 02 04 03 7a")),
        ("fav-reorder-commit-65[act=0x66]", 0x65, b"\x66"),
    ]
    assert requested == [0x66]


def test_reorder_favorites_skips_unknown_fav_ids(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda act_id: [(0x02, 0x01), (0x04, 0x02), (0x06, 0x03)])

    steps: list[tuple[str, int, bytes]] = []

    def _send_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload))
        return SendStepResult(outcome=AckOutcome.acked)

    monkeypatch.setattr(proxy, "_send_step", _send_step)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)
    monkeypatch.setattr(proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)

    result = proxy.reorder_favorites(0x66, [0x06, 0x09, 0x04])

    assert result == {"activity_id": 0x66, "fav_ids": [0x06, 0x04], "status": "success"}
    assert steps == [
        ("fav-reorder-61[act=0x66]", 0x61, bytes.fromhex("01 00 01 01 00 01 66 06 01 04 02 75")),
        ("fav-reorder-commit-65[act=0x66]", 0x65, b"\x66"),
    ]


def test_reorder_favorites_accepts_keymap_backfilled_ids_when_hub_order_is_partial(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    act_lo = 0x65
    proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x1A, "source": "keymap"},
        {"button_id": 0x02, "device_id": 0x04, "command_id": 0x20, "source": "keymap"},
        {"button_id": 0x03, "device_id": 0x08, "command_id": 0x01, "source": "keymap"},
        {"button_id": 0x04, "device_id": 0x08, "command_id": 0x02, "source": "keymap"},
        {"button_id": 0x05, "device_id": 0x08, "command_id": 0x03, "source": "keymap"},
        {"button_id": 0x06, "device_id": 0x08, "command_id": 0x04, "source": "keymap"},
        {"button_id": 0x07, "device_id": 0x08, "command_id": 0x05, "source": "keymap"},
    ]

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "request_favorites_order", lambda activity_id: [(0x01, 0x01), (0x02, 0x02), (0x03, 0x03), (0x04, 0x04)])

    steps: list[tuple[str, int, bytes]] = []

    def _send_step(*, step_name, family, payload, ack_opcode, timeout=5.0):
        steps.append((step_name, family, payload))
        return SendStepResult(outcome=AckOutcome.acked)

    monkeypatch.setattr(proxy, "_send_step", _send_step)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)
    monkeypatch.setattr(proxy, "clear_entity_cache", lambda *args, **kwargs: None)
    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda activity_id: requested.append(activity_id) or True)

    result = proxy.reorder_favorites(act_lo, [0x05, 0x06, 0x01, 0x02, 0x03, 0x07, 0x04])

    assert result == {
        "activity_id": act_lo,
        "fav_ids": [0x05, 0x06, 0x01, 0x02, 0x03, 0x07, 0x04],
        "status": "success",
    }
    assert steps == [
        (
            "fav-reorder-61[act=0x65]",
            0x61,
            bytes.fromhex("01 00 01 01 00 01 65 05 01 06 02 01 03 02 04 03 05 07 06 04 07 9f"),
        ),
        ("fav-reorder-commit-65[act=0x65]", 0x65, b"\x65"),
    ]
    assert requested == [act_lo]


def test_command_to_favorite_x1_does_not_pin_ack_first_byte(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        return 0x013E, b""

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)

    result = proxy.command_to_favorite(0x65, 0x04, 0x02, slot_id=3)

    assert result is not None
    # ack_calls[0] is the favorites-order pre-query (X1-specific); the map
    # step is at index 1 — verify it uses (0x013E, None) not a pinned byte.
    assert ack_calls[1] == [(0x013E, None), (0x0103, None)]


def test_command_to_favorite_x1s_does_not_pin_ack_first_byte(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, _first_byte = candidates[0]
        return first_opcode, b""

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)

    result = proxy.command_to_favorite(0x65, 0x04, 0x02, slot_id=3)

    assert result is not None
    assert ack_calls[0] == [(0x013E, None), (0x0103, None)]


def test_command_to_favorite_requires_all_acks(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    attempts = {"count": 0}

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        attempts["count"] += 1
        if attempts["count"] == 1:
            first_opcode, first_byte = candidates[0]
            return first_opcode, bytes([first_byte if first_byte is not None else 0x00])
        return None

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    requested: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested.append(act_id) or True)

    assert proxy.command_to_favorite(0x66, 0x06, 0x04) is None
    assert requested == []


def test_command_to_button_replays_sequence(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    ack_calls: list[list[tuple[int, int | None]]] = []

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        ack_calls.append(candidates)
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    requested_map: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested_map.append(act_id) or True)

    requested_buttons: list[tuple[int, bool]] = []

    def _get_buttons_for_entity(ent_id: int, fetch_if_missing: bool = True):
        requested_buttons.append((ent_id, fetch_if_missing))
        return [], False

    monkeypatch.setattr(proxy, "get_buttons_for_entity", _get_buttons_for_entity)

    cleared: list[tuple[int, bool, bool, bool]] = []
    monkeypatch.setattr(
        proxy,
        "clear_entity_cache",
        lambda ent_id, clear_buttons=False, clear_favorites=False, clear_macros=False: cleared.append(
            (ent_id, clear_buttons, clear_favorites, clear_macros)
        ),
    )

    result = proxy.command_to_button(0x65, 0xC1, 0x05, 0x02)

    assert result == {
        "activity_id": 0x65,
        "button_id": 0xC1,
        "device_id": 0x05,
        "command_id": 0x02,
        "status": "success",
    }
    assert [opcode & 0xFF for opcode, _payload in sent] == [0x3E, 0x65]
    assert sent[0][1] == bytes.fromhex(
        "01 00 01 01 00 01 65 c1 05 00 00 00 00 4e 22 02 00 00 00 00 00 00 00 00 9f"
    )
    assert sent[1][1] == b"e"
    assert ack_calls == [
        [(0x013E, 0xC1), (0x0103, None)],
        [(0x0103, None)],
    ]
    assert cleared == [(0x65, True, False, False)]
    assert requested_map == [0x65]
    assert requested_buttons == [(0x65, True)]


def test_command_to_button_with_long_press(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent.append((opcode, payload)))

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: True)
    monkeypatch.setattr(proxy, "get_buttons_for_entity", lambda ent_id, fetch_if_missing=True: ([], False))
    monkeypatch.setattr(
        proxy,
        "clear_entity_cache",
        lambda ent_id, clear_buttons=False, clear_favorites=False, clear_macros=False: None,
    )

    result = proxy.command_to_button(
        0x65, 0xB0, 0x05, 0x01,
        long_press_device_id=0x05,
        long_press_command_id=0x02,
    )

    assert result == {
        "activity_id": 0x65,
        "button_id": 0xB0,
        "device_id": 0x05,
        "command_id": 0x01,
        "long_press_device_id": 0x05,
        "long_press_command_id": 0x02,
        "status": "success",
    }
    assert sent[0][1] == bytes.fromhex(
        "01 00 01 01 00 01 65 b0 05 00 00 00 00 4e 21 01 05 00 00 00 00 4e 22 02 03"
    )


def test_command_to_button_can_skip_refresh_after_write(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        first_opcode, first_byte = candidates[0]
        return first_opcode, bytes([first_byte if first_byte is not None else 0x00])

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    requested_map: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested_map.append(act_id) or True)

    requested_buttons: list[tuple[int, bool]] = []

    def _get_buttons_for_entity(ent_id: int, fetch_if_missing: bool = True):
        requested_buttons.append((ent_id, fetch_if_missing))
        return [], False

    monkeypatch.setattr(proxy, "get_buttons_for_entity", _get_buttons_for_entity)

    result = proxy.command_to_button(0x65, 0xC1, 0x05, 0x02, refresh_after_write=False)
    assert result is not None
    assert requested_map == []
    assert requested_buttons == []


def test_command_to_button_requires_all_acks(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: None)

    attempts = {"count": 0}

    def _wait_for_ack_any(
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
        not_before: float | None = None,
    ) -> tuple[int, bytes] | None:
        attempts["count"] += 1
        if attempts["count"] == 1:
            first_opcode, first_byte = candidates[0]
            return first_opcode, bytes([first_byte if first_byte is not None else 0x00])
        return None

    monkeypatch.setattr(proxy, "wait_for_ack_any", _wait_for_ack_any)

    requested_map: list[int] = []
    monkeypatch.setattr(proxy, "request_activity_mapping", lambda act_id: requested_map.append(act_id) or True)

    assert proxy.command_to_button(0x65, 0xC1, 0x05, 0x02) is None
    assert requested_map == []


# ---------------------------------------------------------------------------
# _parse_activity_inputs_payloads
# ---------------------------------------------------------------------------

def _make_activity_inputs_entry(slot_id: int, cmd_id: int, name: str = "") -> bytes:
    """Build a 27-byte ACTIVITY_INPUTS X1 entry for proxy-integration tests."""
    name_bytes = name.encode("ascii", errors="replace")[:20].ljust(20, b"\x00")
    return bytes([slot_id, 0, 0, 0, 0, (cmd_id >> 8) & 0xFF, cmd_id & 0xFF]) + name_bytes


def _make_x1_input_page1_header(*, device_id: int, num_inputs: int) -> bytes:
    """Build a valid 11-byte page-1 preamble for an X1 ACTIVITY_INPUTS frame.

    Layout: ``[0x01, 0x00, 0x01]`` outer wrapper + 8-byte body header
    ``[marker, total_pages_be(2), device_id, source_id, entry_count,
    flag_a, flag_b]``. Tests use this so the unified parser sees a
    real ``entry_count`` and walks the right number of rows; the old
    parser tolerated an all-zero header by walking the trailing region
    until it hit a null slot, which silently masked off-by-one bugs.
    """

    return (
        bytes([0x01, 0x00, 0x01])
        + bytes([0x01, 0x00, 0x01])
        + bytes([device_id & 0xFF, 0x01, num_inputs & 0xFF, 0x00, 0x00])
    )


# Phase 3 removed the proxy-internal parsers
# ``_parse_activity_inputs_payloads`` and ``_parse_activity_inputs_x1s``;
# the canonical builder/parser round-trip lives in
# ``tests/lib/test_inputs.py``. The remaining tests in this file
# exercise the proxy-level public surface (``query_device_input_index``
# and ``fetch_device_input_entries``) that consumes the unified parser.


# ---------------------------------------------------------------------------
# _parse_activity_inputs_x1s
# ---------------------------------------------------------------------------

def _make_x1s_input_entry(slot_id: int, ordinal: int, name: str = "", fid: int = 0) -> bytes:
    """Build a 48-byte X1S/X2 ACTIVITY_INPUTS entry.

    Layout: [slot_id(1)] [fid_be(6)] [ordinal(1)] [label_utf16be(40)].
    """
    fid_bytes = fid.to_bytes(6, "big")
    name_utf16 = name.encode("utf-16-be")[:40]
    label_slot = name_utf16.ljust(40, b"\x00")
    return bytes([slot_id]) + fid_bytes + bytes([ordinal]) + label_slot


def _make_x1s_input_page1_header(
    device_id: int,
    num_inputs: int,
    *,
    total_pages: int = 1,
    source_type: int = 0x01,
) -> bytes:
    """Build the 11-byte page-1 header for an X1S/X2 ACTIVITY_INPUTS frame.

    Layout: 3-byte page preamble (sub-opcode marker + page_no_be) +
    8-byte record header ``[sentinel, total_pages_be(2), deviceid,
    source_type, N, startpos, restartpos]``.
    """
    return (
        bytes([0x01, 0x00, 0x01])           # marker + page_no_be = 1
        + bytes([0x01])                     # sentinel
        + total_pages.to_bytes(2, "big")
        + bytes([
            device_id & 0xFF,
            source_type & 0xFF,
            num_inputs & 0xFF,
            0x00,                           # startposition
            0x00,                           # restartposition
        ])
    )


def _make_x1s_input_cont_header(page_no: int) -> bytes:
    """Build the 3-byte continuation-page preamble for ACTIVITY_INPUTS."""
    return bytes([0x01]) + page_no.to_bytes(2, "big")


# The proxy-internal ``_parse_activity_inputs_x1s`` and
# ``_use_wide_inputs_parser`` were deleted in Phase 3 of the protocol
# refactor; both call sites in the proxy now use ``parse_inputs_burst``
# from :mod:`lib.inputs`, which is exercised end-to-end in
# ``tests/lib/test_inputs.py`` (incl. round-trip and variant dispatch).


def test_fetch_device_input_entries_returns_all_entries_on_x1(monkeypatch) -> None:
    """End-to-end regression for an X1 hub returning a multi-page input
    list. Before the parser-selection fix the backup silently lost most
    rows: the X1S parser was being chosen even on X1 hubs (the shape
    sniffer can't distinguish), then 48-byte striding sliced into the
    middle of 27-byte entries and produced rows with ordinal=0 that
    the backup writer filters out.

    Real-world symptom from a 30-entry capture: backup returned only
    2 of 30 inputs.
    """

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    # Build a synthetic 30-entry X1 response that mirrors the schema
    # of the real capture: 8-byte body header after a 3-byte page
    # wrapper on page 1, continuation pages with 3-byte wrappers only,
    # 27-byte entries split across page boundaries.
    entry_count = 30
    body_header = bytes(
        [
            0x01,  # body marker
            0x00, 0x04,  # total_pages_be (any value -- not used by X1 parser)
            0x01,  # device_id
            0x01,  # source_type
            entry_count,
            0x00,  # start_position
            0x00,  # restart_position
        ]
    )
    entries = b"".join(
        _make_activity_inputs_entry(0x28 + i, 0x4000 + i, f"Input {i:02d}")
        for i in range(entry_count)
    )
    full_body = body_header + entries

    # Split body across pages. Each page carries a 3-byte preamble.
    # Page 1's preamble counts toward the strip, so its useful body
    # starts after 11 stripped bytes (3 preamble + 8 body header).
    # Page-chunk capacity matches the real hub: 247 body bytes per
    # full page (FA47 carries a 250-byte payload, of which 3 are the
    # preamble).
    def _split(body_bytes: bytes, chunk: int = 247) -> list[bytes]:
        # Page 1 takes the first ``chunk`` bytes from the body header
        # *plus entries*; subsequent pages each take ``chunk`` from
        # the remainder. The proxy parser strips 11 bytes from page 1
        # (3-byte preamble + 8-byte body header) and 3 bytes from
        # continuations, so we wrap the body slices in the right
        # preamble shape.
        pages: list[bytes] = []
        # Page 1 = [01 00 01] + (body[0..chunk-3])
        first = body_bytes[: chunk - 0]
        pages.append(bytes([0x01, 0x00, 0x01]) + first)
        rest = body_bytes[chunk - 0 :]
        page_no = 2
        while rest:
            slice_, rest = rest[:chunk], rest[chunk:]
            pages.append(bytes([0x01, 0x00, page_no]) + slice_)
            page_no += 1
        return pages

    payloads = _split(full_body)

    # Stub the network round-trip; feed the synthesised payloads
    # straight into the proxy's accumulator.
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda *a, **kw: None)

    def _wait(timeout: float = 5.0) -> InputsBurstResult:
        return InputsBurstResult(outcome=AckOutcome.acked, payloads=tuple(payloads))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _wait)

    rows = proxy.fetch_device_input_entries(1, timeout=1.0)

    assert rows is not None
    assert len(rows) == entry_count, (
        f"expected {entry_count} input rows, got {len(rows)}: {rows}"
    )
    # Slot ids must be the 0x28..0x28+29 sequence we constructed.
    assert [row["command_id"] for row in rows] == [
        0x28 + i for i in range(entry_count)
    ]
    # 1-based ordinals must form a contiguous 1..30 sequence.
    assert [row["input_index"] for row in rows] == list(range(1, entry_count + 1))


# ---------------------------------------------------------------------------
# query_device_input_index
# ---------------------------------------------------------------------------

def test_query_device_input_index_returns_ordinal(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    header = _make_x1_input_page1_header(device_id=0x05, num_inputs=4)
    # slot_ids 3, 4, 5, 6 — cmd 5 is at ordinal 3
    entries_bytes = (
        _make_activity_inputs_entry(3, 3)
        + _make_activity_inputs_entry(4, 4)
        + _make_activity_inputs_entry(5, 5)
        + _make_activity_inputs_entry(6, 6)
    )
    # Plus the canonical 107-byte trailing region the parser slices off
    # the end of the body before walking entries.
    payload = header + entries_bytes + bytes(107) + bytes(1)

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: sent.append((opcode, data)))

    def _fake_burst(timeout=5.0):
        return InputsBurstResult(outcome=AckOutcome.acked, payloads=(payload,))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    result = proxy.query_device_input_index(0x05, 5)

    assert result == 3
    from custom_components.sofabaton_x1s.lib.protocol_const import OP_REQ_ACTIVITY_INPUTS
    assert sent == [(OP_REQ_ACTIVITY_INPUTS, bytes([0x05]))]


def test_query_device_input_index_returns_none_on_timeout(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)
    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", lambda timeout=5.0: InputsBurstResult(outcome=AckOutcome.timeout))

    assert proxy.query_device_input_index(0x05, 5) is None


def test_query_device_input_index_returns_none_when_not_found(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    header = _make_x1_input_page1_header(device_id=0x05, num_inputs=1)
    payload = header + _make_activity_inputs_entry(3, 3) + bytes(107) + bytes(1)

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)

    def _fake_burst(timeout=5.0):
        return InputsBurstResult(outcome=AckOutcome.acked, payloads=(payload,))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    assert proxy.query_device_input_index(0x05, 99) is None


def test_fetch_device_input_entries_returns_empty_on_status_ack_rejection(monkeypatch) -> None:
    """When the hub answers REQ_ACTIVITY_INPUTS with a non-zero STATUS_ACK
    (e.g. ``0x07`` for an unconfigured device), the fetch exits early with
    an empty list -- not ``None`` (which would mean "no answer at all") --
    so backups can faithfully record "this device has no inputs".
    """

    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    sent: list[tuple[int, bytes]] = []

    def _fake_send(opcode, data):
        sent.append((opcode, bytes(data)))
        # Simulate the hub's STATUS_ACK 0x07 arriving while we're in-flight.
        proxy.notify_ack(0x0103, b"\x07")

    monkeypatch.setattr(proxy, "_send_cmd_frame", _fake_send)

    result = proxy.fetch_device_input_entries(0x02, timeout=2.0)

    assert result == []
    assert sent and sent[0][0] == 0x0148  # OP_REQ_ACTIVITY_INPUTS
    assert proxy._activity_inputs_pending is False


def test_fetch_device_input_entries_returns_x1_rows(monkeypatch) -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)

    header = _make_x1_input_page1_header(device_id=0x05, num_inputs=2)
    payload = (
        header
        + _make_activity_inputs_entry(5, 5)
        + _make_activity_inputs_entry(8, 8)
        + bytes(107)
        + bytes(1)
    )

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)

    def _fake_burst(timeout=5.0):
        return InputsBurstResult(outcome=AckOutcome.acked, payloads=(payload,))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    assert proxy.fetch_device_input_entries(0x05) == [
        {"command_id": 5, "input_index": 1},
        {"command_id": 8, "input_index": 2},
    ]


def test_query_device_input_index_x1s_returns_embedded_ordinal(monkeypatch) -> None:
    """On X1S, the ordinal is read from chunk[7] rather than computed by list position."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    # Device 9 has inputs TEST 3 (cmd=3, ord=1), TEST 4 (cmd=4, ord=2), TEST 5 (cmd=5, ord=3)
    header = _make_x1s_input_page1_header(device_id=0x09, num_inputs=3)
    page1 = (
        header
        + _make_x1s_input_entry(3, 1, "TEST 3")
        + _make_x1s_input_entry(4, 2, "TEST 4")
        + _make_x1s_input_entry(5, 3, "TEST 5")
        + bytes(250 - 11 - 3 * 48)
    )

    sent: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: sent.append((opcode, data)))

    def _fake_burst(timeout=5.0):
        return InputsBurstResult(outcome=AckOutcome.acked, payloads=(page1,))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    # cmd_id=4 (TEST 4) should return ordinal=2
    result = proxy.query_device_input_index(0x09, 4)
    assert result == 2

    from custom_components.sofabaton_x1s.lib.protocol_const import OP_REQ_ACTIVITY_INPUTS
    assert sent == [(OP_REQ_ACTIVITY_INPUTS, bytes([0x09]))]


def test_query_device_input_index_trusts_x1_hub_version_over_shape_sniffer(monkeypatch) -> None:
    """A hub configured as ``HUB_VERSION_X1`` must use the X1 parser
    regardless of payload shape.

    Historically a shape sniffer was given priority over the stored
    hub version on the theory that "X1S payload layout should win even
    if the stored hub_version is stale." But X1 and X1S/X2 responses
    share the same page envelope -- the sniffer says "looks like X1S"
    for BOTH variants -- so this gave the wrong answer on real X1
    hubs: a 30-input list came back as ~2 inputs after the X1S
    48-byte stride sliced into the middle of 27-byte X1 entries.

    Real X1 captures are tested in
    ``test_fetch_device_input_entries_returns_all_entries_on_x1``;
    this test guards the selection logic itself.
    """
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    # Build an X1 page (27-byte entries) with a canonical 8-byte body
    # header so the unified parser walks the right entry stride for
    # the variant the proxy is configured for.
    header = _make_x1_input_page1_header(device_id=0x09, num_inputs=3)
    page1 = (
        header
        + _make_activity_inputs_entry(3, 0x3000, "TEST 3")
        + _make_activity_inputs_entry(4, 0x4000, "TEST 4")
        + _make_activity_inputs_entry(5, 0x5000, "TEST 5")
        + bytes(107)
        + bytes(1)
    )

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)

    def _fake_burst(timeout=5.0):
        return InputsBurstResult(outcome=AckOutcome.acked, payloads=(page1,))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    # X1 ordinal = 1-based position in the entry list.
    assert proxy.query_device_input_index(0x09, 4) == 2


def test_query_device_input_index_x1s_returns_none_when_not_found(monkeypatch) -> None:
    """X1S: return None and log warning when cmd_id is absent from the inputs list."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    header = _make_x1s_input_page1_header(device_id=0x09, num_inputs=1)
    page1 = header + _make_x1s_input_entry(3, 1, "TEST 3") + bytes(200)

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)

    def _fake_burst(timeout=5.0):
        return InputsBurstResult(outcome=AckOutcome.acked, payloads=(page1,))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    assert proxy.query_device_input_index(0x09, 99) is None


def test_fetch_device_input_entries_returns_x1s_rows(monkeypatch) -> None:
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    payload = (
        _make_x1s_input_page1_header(device_id=0x09, num_inputs=2)
        + _make_x1s_input_entry(3, 1, "HDMI 1")
        + _make_x1s_input_entry(4, 2, "HDMI 2")
    )

    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, data: None)

    def _fake_burst(timeout=5.0):
        return InputsBurstResult(outcome=AckOutcome.acked, payloads=(payload,))

    monkeypatch.setattr(proxy, "wait_for_activity_inputs_burst", _fake_burst)

    assert proxy.fetch_device_input_entries(0x09) == [
        {"command_id": 3, "input_index": 1},
        {"command_id": 4, "input_index": 2},
    ]


# ---------------------------------------------------------------------------
# add_device_to_activity with input_cmd_id
# ---------------------------------------------------------------------------

def _make_add_device_to_activity_mocks(proxy, monkeypatch, *, members=(1,)):
    """Set up minimal mocks for add_device_to_activity integration tests."""
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    def _request_activity_mapping(act_id: int) -> bool:
        act_lo = act_id & 0xFF
        for m in members:
            proxy.state.record_activity_member(act_lo, m)
        proxy._activity_map_complete.add(act_lo)
        return True

    monkeypatch.setattr(proxy, "request_activity_mapping", _request_activity_mapping)

    sent_cmd: list[tuple[int, bytes]] = []
    monkeypatch.setattr(proxy, "_send_cmd_frame", lambda opcode, payload: sent_cmd.append((opcode, payload)))
    monkeypatch.setattr(proxy, "_send_family_frame", lambda family, payload: None)
    monkeypatch.setattr(
        proxy,
        "wait_for_ack_any",
        lambda candidates, timeout=5.0, not_before=None: (
            candidates[0][0],
            bytes([candidates[0][1] if candidates[0][1] is not None else 0x00]),
        ),
    )
    return sent_cmd


def test_add_device_to_activity_with_input_cmd_id_sets_c5_byte(monkeypatch) -> None:
    """input_cmd_id resolves to ordinal 3 and that value is written to byte[8] of the 0xC5 record."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    sent_cmd = _make_add_device_to_activity_mocks(proxy, monkeypatch, members=[1])

    # Header must be exactly 9 bytes; byte[8] = row count.
    power_on_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 01 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "01 00 00 00 00 00 2d 76 00"
    )
    power_off_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c7 01 "
        "01 c7 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_record",
        lambda act, button, timeout=5.0: MacroRecord(activity_id=act & 0xFF, key_id=button & 0xFF, label='', key_sequence=()))

    # query_device_input_index mock: cmd_id 5 is ordinal 3
    monkeypatch.setattr(proxy, "query_device_input_index", lambda dev_id, cmd_id, **kw: 3)

    saved_payloads: list[bytes] = []
    monkeypatch.setattr(
        proxy,
        "_send_family_frame",
        lambda family, payload: saved_payloads.append(payload),
    )

    result = proxy.add_device_to_activity(101, 2, input_cmd_id=5)

    assert result is not None

    # POWER_ON macro (first saved payload) must contain a 0xC5 record with byte[8]=3
    on_payload = saved_payloads[0]
    c5_idx = on_payload.find(bytes([0x02, 0xC5]))
    assert c5_idx != -1, "0xC5 record for device 0x02 not found in POWER_ON payload"
    assert on_payload[c5_idx + 8] == 3, f"Expected input_index=3, got {on_payload[c5_idx + 8]}"


def test_add_device_to_activity_x1s_with_input_cmd_id_sets_input_index(monkeypatch) -> None:
    """On X1S hubs, input_cmd_id resolves via query_device_input_index and writes the ordinal to byte[8]."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )

    _make_add_device_to_activity_mocks(proxy, monkeypatch, members=[1])

    power_on_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 01 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "01 00 00 00 00 00 2d 76 00"
    )
    power_off_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c7 01 "
        "01 c7 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_record",
        lambda act, button, timeout=5.0: MacroRecord(activity_id=act & 0xFF, key_id=button & 0xFF, label='', key_sequence=()))

    # cmd_id 5 is at ordinal 2 in the X1S device's input list
    monkeypatch.setattr(proxy, "query_device_input_index", lambda dev_id, cmd_id, **kw: 2)

    saved_payloads: list[bytes] = []
    monkeypatch.setattr(
        proxy,
        "_send_family_frame",
        lambda family, payload: saved_payloads.append(payload),
    )

    result = proxy.add_device_to_activity(101, 2, input_cmd_id=5)

    assert result is not None

    # POWER_ON macro must contain a 0xC5 record for device 0x02 with byte[8]=2
    on_payload = saved_payloads[0]
    c5_idx = on_payload.find(bytes([0x02, 0xC5]))
    assert c5_idx != -1, "0xC5 record for device 0x02 not found in POWER_ON payload"
    assert on_payload[c5_idx + 8] == 2, f"Expected input_index=2, got {on_payload[c5_idx + 8]}"


def test_add_device_to_activity_input_cmd_id_updates_existing_c5_record(monkeypatch) -> None:
    """When a 0xC5 record already exists in the macro, its byte[8] is updated to the new input_index."""
    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )

    _make_add_device_to_activity_mocks(proxy, monkeypatch, members=[1])

    # POWER_ON source already contains a 0xC5 record for device 1 with old input_index=0x1A (26)
    power_on_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c6 02 "
        "01 c6 00 00 00 00 00 00 01 ff "
        "01 c5 00 00 00 00 00 00 1a ff "
        "50 4f 57 45 52 5f 4f 4e 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "02 00 00 00 00 00 2d 76 00"
    )
    power_off_source = bytes.fromhex(
        "01 00 01 01 00 01 65 c7 01 "
        "01 c7 00 00 00 00 00 00 01 ff "
        "50 4f 57 45 52 5f 4f 46 46 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
        "00 00 00 00 00 00 ff ff"
    )
    monkeypatch.setattr(
        proxy,
        "wait_for_macro_record",
        lambda act, button, timeout=5.0: MacroRecord(activity_id=act & 0xFF, key_id=button & 0xFF, label='', key_sequence=()))

    # query returns ordinal 4 (new input)
    monkeypatch.setattr(proxy, "query_device_input_index", lambda dev_id, cmd_id, **kw: 4)

    saved_payloads: list[bytes] = []
    monkeypatch.setattr(
        proxy,
        "_send_family_frame",
        lambda family, payload: saved_payloads.append(payload),
    )

    result = proxy.add_device_to_activity(101, 1, input_cmd_id=5)

    assert result is not None

    on_payload = saved_payloads[0]
    c5_idx = on_payload.find(bytes([0x01, 0xC5]))
    assert c5_idx != -1
    assert on_payload[c5_idx + 8] == 4, f"Expected updated input_index=4, got {on_payload[c5_idx + 8]}"


# ---------------------------------------------------------------------------
# Activity backup / restore tests
# ---------------------------------------------------------------------------


def _make_activity_backup_payload() -> dict:
    """Construct a minimal valid activity_backup payload."""

    return {
        "kind": "activity_backup",
        "schema_version": 4,
        "device": {
            "device_id": 101,
            "entity_type": "activity",
            "name": "Watch TV",
            "brand": "",
            "device_class": "activity",
            "device_class_code": 0,
            "icon": 1,
            "sort": 0,
            "code_type": 0x0A,
            "device_type": 0x10,
            "code_id_hex": "00 " * 15 + "00",
            "hide": 0,
            "input_flag": 0,
            "channel": 0,
            "power_state": 0,
            "ip_address": None,
            "poll_time": -1,
            "input_mode": 0,
            "power_mode": 0,
            "power_style": 1,
            "share_mode": 0,
            "tail_marker": 1,
            "extras": None,
        },
        "button_bindings": [
            {
                "button_id": 0x58,
                "button_name": "Power",
                "device_id": 11,
                "command_id": 1,
                "long_press_device_id": None,
                "long_press_command_id": None,
            },
            {
                "button_id": 0x59,
                "button_name": "VolumeUp",
                "device_id": 12,
                "command_id": 2,
                "long_press_device_id": 12,
                "long_press_command_id": 3,
            },
        ],
        "macros": [
            {
                "button_id": 0xC6,
                "name": "POWER_ON",
                "is_power_macro": True,
                "steps": [
                    {"device_id": 11, "command_id": 1, "button_code": 0x4E21, "duration": 0, "delay": 0xFF},
                    {"device_id": 12, "command_id": 2, "button_code": 0x4E22, "duration": 0, "delay": 0xFF},
                ],
            }
        ],
        "favorite_slots": [],
        "referenced_source_device_ids": [11, 12],
    }


def test_collect_referenced_source_device_ids_walks_buttons_macros_favorites() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    payload = _make_activity_backup_payload()

    assert proxy._collect_referenced_source_device_ids(payload) == {11, 12}


def test_restore_activity_rejects_payload_with_missing_device_in_map(monkeypatch) -> None:
    """If the activity references device 0x0B and the map omits it, we
    must fail before issuing any wire writes."""

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)

    sent: list = []
    monkeypatch.setattr(
        proxy, "_send_family_frame", lambda f, p: sent.append((f, p))
    )

    payload = _make_activity_backup_payload()
    with pytest.raises(ValueError, match="device_id_map is missing"):
        proxy.restore_activity(payload, device_id_map={11: 0x21})  # 12 missing

    assert sent == [], "No wire frames should have been sent on validation failure"


def test_restore_activity_rejects_non_activity_payload() -> None:
    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    proxy.can_issue_commands = lambda: True  # type: ignore[method-assign]

    not_activity = _make_activity_backup_payload()
    not_activity["kind"] = "device_backup"
    with pytest.raises(ValueError, match="kind == 'activity_backup'"):
        proxy.restore_activity(not_activity, device_id_map={11: 1, 12: 2})


def test_restore_activity_replays_create_and_remaps_device_ids(monkeypatch) -> None:
    """End-to-end shape: activity-create gets issued with family 0x37
    via the assigned ack, then button bindings + macro write are sent
    with their device-id references translated through the supplied
    map.
    """

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)

    sequence_calls: list[list] = []

    def _run_create_sequence(_proxy, steps):
        steps_list = list(steps)
        sequence_calls.append(steps_list)
        if len(sequence_calls) == 1:
            # The activity-create step
            return types.SimpleNamespace(
                success=True,
                assigned_device_id=0x55,
                failed_step=None,
                failed_index=None,
            )
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=0x55,
            failed_step=None,
            failed_index=None,
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)

    payload = _make_activity_backup_payload()
    result = proxy.restore_activity(payload, device_id_map={11: 0x21, 12: 0x22})

    assert result is not None
    assert result["status"] == "success"
    assert result["activity_id"] == 0x55
    assert result["restored_button_bindings"] == 2
    assert result["restored_macros"] == 1
    # The map round-trips back in the response as string-keyed for JSON
    # friendliness.
    assert result["device_id_map"] == {"11": 0x21, "12": 0x22}

    # First sequence call: activity-create with family 0x37.
    assert len(sequence_calls) >= 1
    create_steps = sequence_calls[0]
    assert len(create_steps) == 1
    assert create_steps[0].family == x1_proxy_module.FAMILY_ACTIVITY_CREATE

    # Second sequence call: post-create (bindings + macro + sync).
    post_steps = sequence_calls[1]
    binding_steps = [s for s in post_steps if s.family == 0x3E]  # FAMILY_BUTTON_BINDING
    assert len(binding_steps) == 2

    # Payload layout for button binding (per build_button_binding_step):
    #   payload[0..2]  outer wrapper [01,00,01]
    #   payload[3..5]  inner body header [01,00,01]
    #   payload[6]     activity/device id (entity)
    #   payload[7]     button_id
    #   payload[8]     short_press_device_id     <- remap target lives here
    #   payload[9..14] short_press_button_code (6 BE)
    #   payload[15]    short_press_button_id
    #   payload[16]    long_press_device_id      <- remap target for long-press
    power_binding = binding_steps[0]
    assert power_binding.payload[6] == 0x55  # activity-side entity id
    assert power_binding.payload[7] == 0x58  # button_id
    assert power_binding.payload[8] == 0x21  # short_press_device_id (REMAPPED 11 -> 0x21)

    volup_binding = binding_steps[1]
    assert volup_binding.payload[7] == 0x59
    assert volup_binding.payload[8] == 0x22  # short-press dev 12 -> 0x22
    assert volup_binding.payload[16] == 0x22  # long-press dev 12 -> 0x22

    # Activity got registered locally so callers see it immediately.
    assert proxy.state.activities.get(0x55, {}).get("name") == "Watch TV"


def test_collect_referenced_source_device_ids_excludes_activity_own_id() -> None:
    """A macro binding targets the activity's OWN id (device_id == activity,
    command_id == macro button id). That self-reference is not a source
    device and must not be treated as a referenced device."""

    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=False)
    payload = _make_activity_backup_payload()
    payload["button_bindings"].append(
        {
            "button_id": 0x5A,
            "button_name": "Menu",
            "device_id": 101,  # the activity's own id
            "command_id": 3,  # the macro's button_id
            "long_press_device_id": None,
            "long_press_command_id": None,
        }
    )

    referenced = proxy._collect_referenced_source_device_ids(payload)
    assert 101 not in referenced
    assert referenced == {11, 12}


def test_restore_activity_binds_a_macro_to_a_button(monkeypatch) -> None:
    """A macro binding restores as a button binding that targets the
    freshly-allocated activity id (its short-press device id) with the
    macro's button_id in the command slot. The activity's own id is NOT
    required in the device_id_map.
    """

    proxy = X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1,
    )
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "reset_ack_queues", lambda: None)

    sequence_calls: list[list] = []

    def _run_create_sequence(_proxy, steps):
        sequence_calls.append(list(steps))
        return types.SimpleNamespace(
            success=True, assigned_device_id=0x55, failed_step=None, failed_index=None
        )

    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _run_create_sequence)

    payload = _make_activity_backup_payload()
    payload["button_bindings"].append(
        {
            "button_id": 0x5A,
            "button_name": "Menu",
            "device_id": 101,  # the activity's own id → macro binding
            "command_id": 3,  # the macro's button_id
            "long_press_device_id": None,
            "long_press_command_id": None,
        }
    )
    payload["macros"].append(
        {
            "button_id": 3,
            "name": "My Macro",
            "steps": [
                {"device_id": 11, "command_id": 1, "button_code": 0x4E21, "duration": 0, "delay": 0xFF},
            ],
        }
    )

    # device_id_map intentionally omits 101: a macro binding must not need it.
    result = proxy.restore_activity(payload, device_id_map={11: 0x21, 12: 0x22})
    assert result["status"] == "success"

    post_steps = sequence_calls[1]
    binding_steps = [s for s in post_steps if s.family == 0x3E]  # FAMILY_BUTTON_BINDING
    macro_binding = next(s for s in binding_steps if s.payload[7] == 0x5A)
    # Short-press device id == the new activity id; the command slot carries
    # the macro's button_id verbatim (not remapped through command ids).
    assert macro_binding.payload[8] == 0x55
    assert macro_binding.payload[15] == 3


def test_log_frames_dispatches_handlers_at_info_level() -> None:
    # Regression for the bug where users with hex logging disabled (default)
    # had their catalog stay empty: handler dispatch was previously skipped
    # whenever the proxy logger was below DEBUG, but the registered handlers
    # are the path that ingests activities/devices/buttons into the catalog,
    # so they must run regardless of log level.
    import logging
    from custom_components.sofabaton_x1s.lib.protocol_const import OP_CATALOG_ROW_ACTIVITY

    proxy = X1Proxy("127.0.0.1", proxy_enabled=False, diag_dump=False, diag_parse=True)
    # Force the proxy logger to INFO so the DEBUG gate would have fired in
    # the old code path (this is the production default when hex logging is
    # off and the tools-card logs tab is closed).
    underlying = logging.getLogger("test.x1_proxy.info_level")
    underlying.setLevel(logging.INFO)
    proxy._log._logger = underlying
    assert not proxy._log.isEnabledFor(logging.DEBUG)

    proxy._begin_activity_request()

    payload = bytearray(214)
    payload[0] = 1  # row_idx
    payload[3] = 1  # expected_rows
    payload[6:8] = (0x0065).to_bytes(2, "big")  # act_id
    payload[32] = 0x01  # 'W' utf16le low byte (label slot starts at 32)
    raw = (
        bytes([0xA5, 0x5A, (OP_CATALOG_ROW_ACTIVITY >> 8) & 0xFF, OP_CATALOG_ROW_ACTIVITY & 0xFF])
        + bytes(payload)
        + b"\x00"
    )

    proxy._log_frames("H→A", [(OP_CATALOG_ROW_ACTIVITY, raw, bytes(payload), 1, 1)])
    proxy._on_activities_burst_end("activities")

    assert 0x65 in proxy.state.activities, (
        "CatalogActivityHandler did not run; activity catalog stayed empty "
        "despite the hub frame being delivered to _log_frames at INFO level"
    )
