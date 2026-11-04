"""The X2's own Matter device: the library keeps it hub-owned.

Bench 2026-11-01 (firmware 9, read-only): the hub keeps a device of class
0x1F at id 51 with one command per Matter button, hidden from the device
list until the hub is linked, and answers family 0x81 with the pairing
data. These tests pin what the library does with that device before any
linked hub has been seen: it never creates, deletes, edits or restores it,
it keeps the activities' references to it, and it never logs the pairing
data.
"""

from __future__ import annotations

from typing import Any

import pytest

from tests.test_hub_bundle import (
    _activity_payload,
    _bundle_with_activity,
    _device_payload,
    _proxy,
    _stub_device_restore,
)
from custom_components.sofabaton_x1s.const import HUB_VERSION_X2
from custom_components.sofabaton_x1s.lib.activity_sync import build_device_sync_plan
from custom_components.sofabaton_x1s.lib.protocol_const import (
    DEVICE_CLASS_CODE_MATTER,
    DEVICE_CLASS_MATTER,
    MATTER_DEVICE_ID,
    classify_device_class_code,
    is_hub_owned_device,
    known_public_device_classes,
)
from custom_components.sofabaton_x1s.lib.proxy_hub_mqtt import redact_wire_hex


def _matter_payload() -> dict[str, Any]:
    payload = _device_payload(source_device_id=MATTER_DEVICE_ID, name="matter")
    payload["device"]["device_class"] = DEVICE_CLASS_MATTER
    payload["device"]["device_class_code"] = DEVICE_CLASS_CODE_MATTER
    payload["commands"] = [{"command_id": key, "name": f"Button {key}"} for key in range(1, 9)]
    return payload


def _bound_activity(*, device_id: int = MATTER_DEVICE_ID) -> dict[str, Any]:
    activity = _activity_payload(source_activity_id=0x65, macro_steps=[{"device_id": 7, "command_id": 1}])
    activity["button_bindings"] = [
        {"button_id": 0xB1, "device_id": device_id, "command_id": 1,
         "long_press_device_id": 0, "long_press_command_id": 0},
    ]
    return activity


def test_class_code_0x1f_is_the_hub_owned_matter_class() -> None:
    assert classify_device_class_code(0x1F) == DEVICE_CLASS_MATTER
    assert DEVICE_CLASS_MATTER in known_public_device_classes()
    # A catalog row carries the code, a backup block the name, a backup the block.
    assert is_hub_owned_device({"device_class": None, "device_class_code": 0x1F})
    assert is_hub_owned_device({"device_class": "matter"})
    assert is_hub_owned_device(_matter_payload())
    assert not is_hub_owned_device(_device_payload(source_device_id=7))
    assert not is_hub_owned_device(None)


def test_wire_dumps_mask_the_pairing_reply() -> None:
    reply = bytes([0xA5, 0x5A, 0x04, 0x81, 0x16, 0x4D, 0x54, 0x3A, 0x99])
    request = bytes([0xA5, 0x5A, 0x00, 0x81, 0x20])
    other = bytes([0xA5, 0x5A, 0x01, 0x03, 0x07, 0xAA])

    assert redact_wire_hex(reply) == "a5 5a 04 81 ** ** ** ** **"
    assert redact_wire_hex(request) == "a5 5a 00 81 **"
    # A socket chunk with the reply between two other frames.
    assert redact_wire_hex(other + reply + other) == (
        "a5 5a 01 03 07 aa a5 5a 04 81 ** ** ** ** ** a5 5a 01 03 07 aa"
    )


def test_restore_device_refuses_the_matter_device(monkeypatch) -> None:
    proxy = _proxy(monkeypatch)
    with pytest.raises(ValueError, match="belongs to the hub"):
        proxy.restore_device(_matter_payload())


def test_bundle_preflight_skips_the_matter_device_and_accepts_references(monkeypatch) -> None:
    proxy = _proxy(monkeypatch)
    activity = _bound_activity()
    activity["macros"][0]["steps"].append({"device_id": MATTER_DEVICE_ID, "command_id": 2})

    with_device = _bundle_with_activity(activity, devices=[_device_payload(source_device_id=7), _matter_payload()])
    without_device = _bundle_with_activity(_bound_activity())

    assert proxy.preflight_restore_bundle(with_device) == {"devices": 1, "activities": 1}
    assert proxy.preflight_restore_bundle(without_device) == {"devices": 1, "activities": 1}


@pytest.mark.parametrize(("present", "expected"), [(True, "kept"), (False, "skipped")])
def test_bundle_restore_maps_the_matter_device_to_the_hubs_own(monkeypatch, present, expected) -> None:
    proxy = _proxy(monkeypatch)
    restored_devices: list[int] = []
    activity_maps: list[dict[int, int]] = []

    def _restore_device(*, payload, **_kw):
        restored_devices.append(payload["device"]["device_id"])
        return {"status": "success", "device_id": payload["device"]["device_id"] + 0x10, "command_id_map": {}}

    def _restore_activity(*, payload, device_id_map, **kwargs):
        assert kwargs["probe_hub_owned_devices"] is False
        activity_maps.append(dict(device_id_map))
        return {"status": "success", "activity_id": 0x70}

    _stub_device_restore(monkeypatch, proxy, _restore_device)
    monkeypatch.setattr(proxy, "restore_activity", _restore_activity)
    monkeypatch.setattr(proxy, "resync_remote", lambda *a, **kw: True)
    monkeypatch.setattr(proxy, "_restore_display_order", lambda kind, order, id_map: "kept")
    monkeypatch.setattr(proxy, "_hub_owned_device_present", lambda device_id, timeout=5.0: present)

    bundle = _bundle_with_activity(
        _bound_activity(), devices=[_device_payload(source_device_id=7), _matter_payload()]
    )
    result = proxy.restore_hub_bundle(bundle)

    assert result["status"] == "success"
    assert restored_devices == [7]  # never the Matter device
    assert result["hub_owned_devices"] == {str(MATTER_DEVICE_ID): expected}
    assert (MATTER_DEVICE_ID in activity_maps[0]) is present
    if present:
        assert activity_maps[0][MATTER_DEVICE_ID] == MATTER_DEVICE_ID


def test_only_an_x2_is_asked_for_its_matter_device(monkeypatch) -> None:
    proxy = _proxy(monkeypatch)  # an X1S
    asked: list[str] = []
    monkeypatch.setattr(proxy, "_fetch_and_wait", lambda name, *a, **kw: asked.append(name))

    assert proxy._hub_owned_device_present(MATTER_DEVICE_ID) is False
    assert asked == []

    proxy.hub_version = HUB_VERSION_X2
    proxy.state.commands[MATTER_DEVICE_ID] = {1: "Button 1"}
    monkeypatch.setattr(
        proxy, "get_commands_for_entity",
        lambda ent_id, fetch_if_missing=True: (dict(proxy.state.commands.get(ent_id, {})), True),
    )
    assert proxy._hub_owned_device_present(MATTER_DEVICE_ID) is True
    assert asked == [f"commands:{MATTER_DEVICE_ID}"]


def test_device_sync_refuses_the_matter_device() -> None:
    baseline = {"devices": [_matter_payload()]}
    edited = {"devices": [_matter_payload()]}
    edited["devices"][0]["commands"][0]["name"] = "Doorbell"

    with pytest.raises(ValueError, match="belongs to the hub"):
        build_device_sync_plan(baseline, edited, MATTER_DEVICE_ID)


def test_delete_device_never_sends_for_the_matter_device(monkeypatch) -> None:
    proxy = _proxy(monkeypatch)
    proxy.state.devices[MATTER_DEVICE_ID] = {"name": "matter", "device_class": DEVICE_CLASS_MATTER,
                                             "device_class_code": DEVICE_CLASS_CODE_MATTER}
    monkeypatch.setattr(proxy, "_send_step", lambda **kw: pytest.fail("no delete frame for the hub's device"))

    assert proxy.delete_device(MATTER_DEVICE_ID) is None


def test_backup_reads_the_matter_device_without_its_codes(monkeypatch) -> None:
    proxy = _proxy(monkeypatch)
    proxy.hub_version = HUB_VERSION_X2
    meta = {"name": "matter", "device_class": DEVICE_CLASS_MATTER, "device_class_code": DEVICE_CLASS_CODE_MATTER}
    proxy.state.devices[MATTER_DEVICE_ID] = dict(meta)
    fetched: list[str] = []

    monkeypatch.setattr(proxy, "_refresh_devices_snapshot", lambda *, timeout: {MATTER_DEVICE_ID: dict(meta)})
    monkeypatch.setattr(proxy, "_fetch_and_wait", lambda name, *a, **kw: fetched.append(name))
    for name in ("request_ir_command_dump", "fetch_idle_behavior", "fetch_device_input_record", "fetch_device_key_sort"):
        monkeypatch.setattr(proxy, name, lambda *a, _name=name, **kw: pytest.fail(f"{_name} must not run"))

    backup = proxy.backup_device(MATTER_DEVICE_ID)

    assert backup is not None
    assert backup["payload_profile"] == "structural"
    assert fetched == [f"commands:{MATTER_DEVICE_ID}", f"buttons:{MATTER_DEVICE_ID}"]
