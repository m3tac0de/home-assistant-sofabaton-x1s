"""Canonical-cache consolidation tests.

Covers the Phase-2 "cache as the canonical structural store" behavior:

- ``export_cache_state``/``import_cache_state`` round-trip every field the
  structural bundle assembly needs (raw record bytes as hex, button details,
  command metadata, input records, macro step records, freshness stamps)
  through JSON without loss.
- ``assemble_hub_bundle_from_state`` is a pure projection: no hub I/O, no
  blob dumps, stamped ``payload_profile == "structural"``, and refuses to
  fabricate a bundle from a never-refreshed cache.
"""

import json

import pytest

from custom_components.sofabaton_x1s.lib.hub_versions import HUB_VERSION_X1S
from custom_components.sofabaton_x1s.lib.macros import MacroKeyEntry, MacroRecord
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy

FETCHED_DEVICE = "2026-07-10T08:00:00+00:00"
FETCHED_ACTIVITY = "2026-07-10T09:30:00+00:00"


def _proxy() -> X1Proxy:
    return X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=HUB_VERSION_X1S,
    )


def _populate(proxy: X1Proxy) -> None:
    """Seed the state a structural whole-hub refresh would have left behind."""

    proxy.state.devices[7] = {
        "name": "TV",
        "device_class": "ir",
        "raw_body": b"\x01\x02\x03",
        "idle_behavior": 3,
    }
    proxy.state.commands[7] = {1: "Power", 2: "Mute"}
    proxy.state.buttons[7] = {0x10}
    proxy.state.button_details[7] = {0x10: {"command_id": 1}}
    proxy.state.command_metadata[7] = {1: {"library_type": 0x0D, "button_code": 0x123456}}
    proxy.state.device_key_sorts[7] = {"device_id": 7, "msg_hex": "aa bb"}
    proxy.state.device_input_records[7] = {
        "device_id": 7,
        "entries": [{"command_id": 4, "input_index": 1, "fid": 99, "name": "HDMI1"}],
    }
    proxy._commands_complete.add(7)
    proxy.state.detail_fetched_at["device"][7] = FETCHED_DEVICE

    proxy.state.activities[101] = {"name": "Watch TV", "raw_body": b"\xaa\xbb"}
    proxy.state.buttons[101] = {0x20}
    proxy.state.button_details[101] = {0x20: {"device_id": 7, "command_id": 1}}
    proxy.state.activity_favorite_slots[101] = [
        {"button_id": 1, "device_id": 7, "command_id": 2, "source": "cache"}
    ]
    proxy._macros_complete.update({7, 101})
    proxy.cache_macro_record(MacroRecord(
        activity_id=101,
        key_id=0xC6,
        label="POWER_ON",
        key_sequence=(
            MacroKeyEntry(device_id=7, key_id=1, fid=0x123456, duration=1, delay=5),
        ),
        raw_label_slot=b"\x37\x37\x00\x00\x35\x35",
    ))
    proxy.state.detail_fetched_at["activity"][101] = FETCHED_ACTIVITY


def test_export_import_round_trips_structural_fields() -> None:
    """The persisted cache carries everything bundle assembly reads."""

    source = _proxy()
    _populate(source)

    exported = source.export_cache_state()
    # The export feeds an HA Store: it must survive a strict JSON round-trip.
    wire = json.loads(json.dumps(exported))

    target = _proxy()
    target.import_cache_state(wire)

    assert target.state.devices[7]["raw_body"] == b"\x01\x02\x03"
    assert "raw_body_hex" not in target.state.devices[7]
    assert target.state.activities[101]["raw_body"] == b"\xaa\xbb"
    assert target.state.button_details[7] == {0x10: {"command_id": 1}}
    assert target.state.button_details[101] == {0x20: {"device_id": 7, "command_id": 1}}
    assert target.state.command_metadata[7] == {
        1: {"library_type": 0x0D, "button_code": 0x123456}
    }
    assert target.state.device_input_records[7]["entries"][0]["name"] == "HDMI1"
    assert target.state.detail_fetched_at == {
        "device": {7: FETCHED_DEVICE},
        "activity": {101: FETCHED_ACTIVITY},
    }

    records = target.get_cached_macro_records(101)
    assert len(records) == 1
    record = records[0]
    assert record.key_id == 0xC6
    assert record.label == "POWER_ON"
    assert record.raw_label_slot == b"\x37\x37\x00\x00\x35\x35"
    assert record.key_sequence[0].fid == 0x123456
    # Imported macro records mark the entity's macros as complete.
    assert 101 in target._macros_complete


def test_reset_ack_queues_preserves_persistent_macro_cache() -> None:
    """Write-transaction resets must not wipe the bundle-facing macro cache.

    Regression: every write flow calls reset_ack_queues(); when the macro
    cache doubled as the ack-wait map, one create/assign wiped every
    activity's cached power macros and bundles assembled with
    referenced_source_device_ids inconsistent with empty macros.
    """

    proxy = _proxy()
    _populate(proxy)
    assert len(proxy.get_cached_macro_records(101)) == 1

    proxy.reset_ack_queues()
    assert len(proxy.get_cached_macro_records(101)) == 1
    # The transient wait map IS cleared: a live wait must not be satisfied
    # by records cached before the reset.
    assert proxy.wait_for_macro_record(101, 0xC6, timeout=0.05) is None

    proxy.clear_entity_cache(101, clear_macros=True)
    assert proxy.get_cached_macro_records(101) == []


def test_assemble_hub_bundle_from_state_is_pure_projection(monkeypatch) -> None:
    """Bundle assembly reads only state: no catalog fetches, no blob dumps."""

    proxy = _proxy()
    _populate(proxy)

    def _no_dump(*_a, **_k):
        raise AssertionError("structural assembly must never dump blobs")

    def _no_fetch(*_a, **_k):
        raise AssertionError("structural assembly must never hit the hub")

    monkeypatch.setattr(proxy, "request_ir_command_dump", _no_dump)
    monkeypatch.setattr(proxy, "request_devices", _no_fetch)
    monkeypatch.setattr(proxy, "request_activities", _no_fetch)
    monkeypatch.setattr(proxy, "fetch_device_input_record", _no_fetch)
    monkeypatch.setattr(proxy, "fetch_device_key_sort", _no_fetch)
    monkeypatch.setattr(proxy, "fetch_idle_behavior", _no_fetch)

    bundle = proxy.assemble_hub_bundle_from_state(
        hub_info={"entry_id": "entry-1", "name": "Sofabaton", "version": HUB_VERSION_X1S}
    )

    assert bundle is not None
    assert bundle["kind"] == "hub_bundle"
    assert bundle["payload_profile"] == "structural"

    (device,) = bundle["devices"]
    assert device["payload_profile"] == "structural"
    assert device["fetched_at"] == FETCHED_DEVICE
    assert device["device"]["device_id"] == 7
    assert device["device"]["idle_behavior"] == 3
    assert device["key_sort"] == {"device_id": 7, "msg_hex": "aa bb"}
    assert device["input_record"]["entries"][0]["name"] == "HDMI1"
    assert {row["command_id"]: row["name"] for row in device["commands"]} == {
        1: "Power",
        2: "Mute",
    }
    # Structural payloads never carry command payload bodies.
    assert all("restore_data" not in row for row in device["commands"])

    (activity,) = bundle["activities"]
    assert activity["fetched_at"] == FETCHED_ACTIVITY
    assert activity["device"]["device_id"] == 101
    assert activity["device"]["entity_type"] == "activity"
    assert activity["macros"][0]["name"] == "POWER_ON"
    assert activity["macros"][0]["steps"][0]["button_code"] == 0x123456
    assert activity["favorite_slots"] == [
        {"button_id": 1, "device_id": 7, "command_id": 2}
    ]


def test_assemble_hub_bundle_refuses_never_refreshed_state() -> None:
    """Catalog names alone must not masquerade as an editable baseline."""

    proxy = _proxy()
    proxy.state.devices[7] = {"name": "TV", "device_class": "ir"}
    proxy.state.activities[101] = {"name": "Watch TV"}
    # No detail_fetched_at stamps: no structural fetch ever ran.
    assert proxy.assemble_hub_bundle_from_state(hub_info={"entry_id": "e"}) is None


def test_bundle_survives_cache_restart_round_trip() -> None:
    """Import from the persisted cache reproduces the same structural bundle."""

    source = _proxy()
    _populate(source)
    hub_info = {"entry_id": "entry-1", "name": "Sofabaton", "version": HUB_VERSION_X1S}
    before = source.assemble_hub_bundle_from_state(hub_info=hub_info)

    target = _proxy()
    target.import_cache_state(json.loads(json.dumps(source.export_cache_state())))
    after = target.assemble_hub_bundle_from_state(hub_info=hub_info)

    assert after is not None

    def _stable(bundle):
        clone = json.loads(json.dumps(bundle))
        clone.pop("captured_at", None)
        for payload in clone["devices"] + clone["activities"]:
            payload.pop("captured_at", None)
        return clone

    assert _stable(after) == _stable(before)


def test_structural_bundle_from_state_is_rejected_by_restore() -> None:
    """The derived bundle must never replay onto a hub."""

    proxy = _proxy()
    _populate(proxy)
    bundle = proxy.assemble_hub_bundle_from_state(
        hub_info={"entry_id": "entry-1", "name": "Sofabaton", "version": HUB_VERSION_X1S}
    )
    with pytest.raises(ValueError, match="structural cache bundles"):
        proxy.restore_hub_bundle(bundle)
