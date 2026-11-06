"""The X2's own Matter device: the library keeps it hub-owned.

Bench 2026-11-01 (firmware 9, read-only): the hub keeps a device of class
0x1F at id 51 with one command per Matter button, hidden from the device
list until the hub is linked, and answers family 0x81 with the pairing
data. These tests pin what the library does with that device: it never
creates, deletes or restores it, it edits only what the vendor app lets a
user change (button names and device-level button bindings), it keeps any
activity reference the hub already holds but never adds one, and it never
logs the pairing data.
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


def _matter_binding(button_id: int = 0xB1, command_id: int = 2) -> dict[str, Any]:
    return {"button_id": button_id, "command_id": command_id, "long_press_command_id": 0}


@pytest.mark.parametrize(
    ("mutate", "kinds"),
    [
        (lambda d: d["commands"][0].update(name="Doorbell"), ["command_rename"]),
        (lambda d: d["button_bindings"].append(_matter_binding()), ["binding_write"]),
    ],
    ids=["button rename", "new binding"],
)
def test_the_matter_device_takes_button_renames_and_bindings(mutate, kinds) -> None:
    """What the vendor app lets a user change on the hub's own device."""

    baseline = {"devices": [_matter_payload()]}
    edited = {"devices": [_matter_payload()]}
    mutate(edited["devices"][0])

    steps = build_device_sync_plan(baseline, edited, MATTER_DEVICE_ID)

    assert [step.kind for step in steps] == kinds


def test_a_matter_binding_can_be_deleted() -> None:
    baseline = {"devices": [_matter_payload()]}
    baseline["devices"][0]["button_bindings"] = [_matter_binding()]
    edited = {"devices": [_matter_payload()]}

    steps = build_device_sync_plan(baseline, edited, MATTER_DEVICE_ID)

    assert [step.kind for step in steps] == ["binding_delete"]


@pytest.mark.parametrize(
    ("mutate", "match"),
    [
        (lambda d: d["device"].update(name="Doorbell hub"), "belongs to the hub"),
        (lambda d: d["commands"][0].update(name="  "), "needs a name"),
        (lambda d: d["commands"][1].update(name="Button 1"), "must all differ"),
    ],
    ids=["device rename", "empty button name", "duplicate button name"],
)
def test_the_matter_device_refuses_everything_else(mutate, match) -> None:
    baseline = {"devices": [_matter_payload()]}
    edited = {"devices": [_matter_payload()]}
    mutate(edited["devices"][0])

    with pytest.raises(ValueError, match=match):
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


def test_a_read_matter_device_is_complete_and_editable(monkeypatch) -> None:
    """Its names and bindings are all there is to edit: the key sort, idle
    byte and macros the read skips never leave it incomplete."""

    proxy = _proxy(monkeypatch)
    proxy.hub_version = HUB_VERSION_X2
    proxy.state.devices[MATTER_DEVICE_ID] = {
        "name": "Matter", "device_class": DEVICE_CLASS_MATTER, "device_class_code": DEVICE_CLASS_CODE_MATTER,
    }
    proxy.state.commands[MATTER_DEVICE_ID] = {key: f"Button {key}" for key in range(1, 9)}
    proxy._commands_complete.add(MATTER_DEVICE_ID)
    proxy.state.buttons[MATTER_DEVICE_ID] = []

    payload = proxy.assemble_device_backup_from_state(MATTER_DEVICE_ID)

    assert payload is not None
    assert payload["complete"] is True and payload["editable"] is True


def test_an_activity_sync_cannot_change_the_matter_devices_idle_byte() -> None:
    from custom_components.sofabaton_x1s.lib.activity_sync import build_activity_sync_plan

    activity = _bound_activity()
    baseline = {"devices": [_matter_payload(), _device_payload(source_device_id=7)], "activities": [activity]}
    edited = {"devices": [_matter_payload(), _device_payload(source_device_id=7)], "activities": [activity]}
    edited["devices"][0]["device"]["idle_behavior"] = 2

    with pytest.raises(ValueError, match="no idle behaviour"):
        build_activity_sync_plan(baseline, edited, 0x65)


# ── the Matter device in the catalog (live X2, 2026-11-06) ───────────────
#
# A linked X2 answers REQ_MATTER_DEVICE (0x0072) with one device row, but
# REQ_DEVICES never lists the device. The library asks 0x0072 after every
# devices read, merges the row into the catalog by its class, carries it
# across committed snapshots and drops it when the hub says unlinked.

from custom_components.sofabaton_x1s.lib.frame_handlers import FrameContext  # noqa: E402
from custom_components.sofabaton_x1s.lib.opcode_handlers import MatterDeviceRowHandler  # noqa: E402
from custom_components.sofabaton_x1s.lib.protocol_const import OP_MATTER_DEVICE_ROW  # noqa: E402
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy  # noqa: E402
from tests.test_opcode_handlers import _MATTER_DEVICE_ROW_HEX  # noqa: E402


class _Sock:
    pass


def _engine(hub_version: str = HUB_VERSION_X2) -> X1Proxy:
    engine = X1Proxy("127.0.0.1", hub_version=hub_version, proxy_enabled=False)
    with engine.transport._hub_lock:
        engine.transport._hub_sock = _Sock()
    engine._notify_hub_state(True)
    return engine


def _feed_matter_row(engine: X1Proxy) -> None:
    raw = bytes.fromhex(_MATTER_DEVICE_ROW_HEX)
    MatterDeviceRowHandler().handle(
        FrameContext(
            proxy=engine, opcode=OP_MATTER_DEVICE_ROW, direction="H→A",
            payload=raw[4:-1], raw=raw, name="MATTER_DEVICE_ROW",
        )
    )


def _answer_matter_query(engine: X1Proxy, monkeypatch, reply, sent: list) -> None:
    """Make the hub answer 0x0072 with the captured row ("row"), a status
    byte (an int), or nothing (None)."""

    def send(opcode, payload):
        sent.append((opcode, bytes(payload)))
        if reply == "row":
            _feed_matter_row(engine)
        elif reply is not None:
            engine.notify_ack(0x0103, bytes([reply]))

    monkeypatch.setattr(engine, "_send_cmd_frame", send)


def _commit_devices(engine: X1Proxy, *dev_ids: int) -> None:
    """Commit a devices snapshot listing ``dev_ids`` (what REQ_DEVICES returns)."""

    engine._begin_device_request()
    for index, dev_id in enumerate(dev_ids, start=1):
        engine.ingest_device_row(
            row_idx=index, expected_rows=len(dev_ids), dev_id=dev_id,
            device={"name": f"Dev {dev_id}", "brand": "", "device_class": "ir", "device_class_code": 0x0D},
        )
    engine._on_devices_burst_end("devices")


def test_a_linked_x2_puts_its_matter_device_in_the_catalog(monkeypatch) -> None:
    engine = _engine()
    sent: list = []
    _answer_matter_query(engine, monkeypatch, "row", sent)

    assert engine.refresh_matter_device(timeout=0.5) is True

    assert sent == [(0x0072, b"")]
    entry = engine.state.entities("device")[MATTER_DEVICE_ID]
    assert (entry["name"], entry["device_class"], entry["device_class_code"]) == ("Matter", "matter", 0x1F)
    assert is_hub_owned_device(entry)


def test_an_unlinked_answer_takes_the_matter_device_out(monkeypatch) -> None:
    engine = _engine()
    _feed_matter_row(engine)
    engine.state.commands[MATTER_DEVICE_ID] = {1: "Button 1"}
    sent: list = []
    _answer_matter_query(engine, monkeypatch, 0x07, sent)

    assert engine.refresh_matter_device(timeout=0.5) is False

    assert MATTER_DEVICE_ID not in engine.state.entities("device")
    assert engine.matter_device is None
    assert MATTER_DEVICE_ID not in engine.state.commands


def test_no_answer_or_another_model_leaves_the_catalog_alone(monkeypatch) -> None:
    engine = _engine()
    _feed_matter_row(engine)
    sent: list = []
    _answer_matter_query(engine, monkeypatch, None, sent)
    assert engine.refresh_matter_device(timeout=0.2) is None
    assert MATTER_DEVICE_ID in engine.state.entities("device")

    other = _engine("X1S")
    other_sent: list = []
    _answer_matter_query(other, monkeypatch, "row", other_sent)
    assert other.refresh_matter_device(timeout=0.2) is None
    assert other_sent == []


def test_a_devices_snapshot_keeps_the_matter_device_and_its_buttons() -> None:
    engine = _engine()
    _feed_matter_row(engine)
    engine.state.commands[MATTER_DEVICE_ID] = {1: "Button 1"}

    _commit_devices(engine, 3, 5)

    assert set(engine.state.entities("device")) == {3, 5, MATTER_DEVICE_ID}
    assert engine.state.commands[MATTER_DEVICE_ID] == {1: "Button 1"}


def test_a_restart_keeps_a_cached_matter_device_until_the_hub_answers() -> None:
    engine = _engine()
    # A persisted catalog holds the hub-owned entry; no row seen this run.
    engine.state.devices[MATTER_DEVICE_ID] = {
        "name": "Matter", "brand": "Matter", "device_class": "matter", "device_class_code": 0x1F,
    }

    _commit_devices(engine, 3)

    assert set(engine.state.entities("device")) == {3, MATTER_DEVICE_ID}


def test_a_classless_entry_at_id_51_does_not_survive_a_snapshot() -> None:
    engine = _engine()
    engine.state.devices[MATTER_DEVICE_ID] = {"idle_behavior": 0}

    _commit_devices(engine, 3)

    assert set(engine.state.entities("device")) == {3}


def test_an_idle_reply_never_creates_a_device() -> None:
    """The app asks the Matter device's idle mode: that reply made a
    nameless phantom "Device 51" (live X2, 2026-11-06)."""

    engine = _engine()
    _commit_devices(engine, 3)

    engine.record_idle_behavior_value(MATTER_DEVICE_ID, 0)
    engine.record_idle_behavior_value(3, 2)

    assert MATTER_DEVICE_ID not in engine.state.entities("device")
    assert engine.state.entities("device")[3]["idle_behavior"] == 2


def test_the_device_order_write_skips_the_matter_device(monkeypatch) -> None:
    engine = _engine()
    monkeypatch.setattr(engine, "can_issue_commands", lambda: True)
    for dev_lo in (1, 2):
        raw_body = bytearray(120)
        raw_body[4] = dev_lo
        engine.state.devices[dev_lo] = {"name": f"Dev {dev_lo}", "raw_body": bytes(raw_body)}
    engine._devices_catalog_ready = True
    _feed_matter_row(engine)
    sent: list = []
    monkeypatch.setattr(engine, "_send_family_frame", lambda family, payload: sent.append((family, payload)))
    monkeypatch.setattr(
        engine, "wait_for_ack_any", lambda candidates, timeout=5.0, not_before=None: (0x0103, b"\x00")
    )
    monkeypatch.setattr(engine, "_request_devices_and_wait", lambda timeout=15.0: True)
    monkeypatch.setattr(engine, "_send_remote_sync_step", lambda *a, **k: True)

    assert set(engine._device_sort_markers()) == {1, 2}
    # A UI that lists the Matter device may pass it along; it is never written.
    result = engine.reorder_devices([2, MATTER_DEVICE_ID, 1])

    assert result == {"status": "success", "ordered_ids": [2, 1]}
    payload = sent[0][1]
    assert payload[6:12] == bytes([0x00, 0x02, 0x01, 0x00, 0x01, 0x02])


def test_a_matter_binding_carries_the_buttons_real_code() -> None:
    """Ordinary devices keep the bench-proven synthetic 0x4E20+cmd code; the
    Matter device's binding rows carry the command's own code, as the vendor
    app writes them."""

    engine = _engine()
    _feed_matter_row(engine)
    engine.state.command_metadata[MATTER_DEVICE_ID] = {2: {"library_type": 0x1F, "button_code": 2}}
    engine.state.devices[7] = {"name": "TV", "device_class": "ir"}

    assert engine._binding_button_code(MATTER_DEVICE_ID, 2) == 2
    assert engine._binding_button_code(MATTER_DEVICE_ID, 3) == 0x4E20 + 3  # no cached code
    assert engine._binding_button_code(7, 2) == 0x4E20 + 2
    assert engine._binding_button_code(7, 0) == 0


def _add_matter_binding(activity: dict[str, Any]) -> None:
    activity["button_bindings"] = [
        {"button_id": 0xB1, "device_id": MATTER_DEVICE_ID, "command_id": 1,
         "long_press_device_id": 0, "long_press_command_id": 0},
    ]


def _add_matter_long_press(activity: dict[str, Any]) -> None:
    activity["button_bindings"] = [
        {"button_id": 0xB1, "device_id": 7, "command_id": 1,
         "long_press_device_id": MATTER_DEVICE_ID, "long_press_command_id": 1},
    ]


def _add_matter_shortcut(activity: dict[str, Any]) -> None:
    activity["favorite_slots"] = [{"button_id": 1, "device_id": MATTER_DEVICE_ID, "command_id": 1, "name": ""}]


def _add_matter_macro_step(activity: dict[str, Any]) -> None:
    activity["macros"].append({"button_id": 3, "name": "Lights", "steps": [{"device_id": MATTER_DEVICE_ID, "command_id": 2}]})


def _add_matter_power_step(activity: dict[str, Any]) -> None:
    activity["macros"][0]["steps"].append({"device_id": MATTER_DEVICE_ID, "command_id": 198})


@pytest.mark.parametrize(
    "mutate",
    [_add_matter_binding, _add_matter_long_press, _add_matter_shortcut, _add_matter_macro_step, _add_matter_power_step],
)
def test_an_activity_edit_cannot_add_the_matter_device(mutate) -> None:
    """As in the vendor app, the Matter device is not for activities: the
    hub refuses it as a member (0x024F answered 0x06, live X2 2026-11-06)."""

    from custom_components.sofabaton_x1s.lib.activity_sync import build_activity_sync_plan

    base_activity = _activity_payload(source_activity_id=0x65, macro_steps=[{"device_id": 7, "command_id": 1}])
    edit_activity = _activity_payload(source_activity_id=0x65, macro_steps=[{"device_id": 7, "command_id": 1}])
    mutate(edit_activity)
    devices = [_matter_payload(), _device_payload(source_device_id=7)]

    with pytest.raises(ValueError, match="can't be used in an activity"):
        build_activity_sync_plan(
            {"devices": devices, "activities": [base_activity]},
            {"devices": devices, "activities": [edit_activity]},
            0x65,
        )


def test_a_matter_reference_the_hub_already_holds_passes_through() -> None:
    """Hub truth is never refused: an activity that already binds a Matter
    button can still be edited, and the binding adds no member."""

    from custom_components.sofabaton_x1s.lib.activity_sync import build_activity_sync_plan

    base_activity = _bound_activity()
    edit_activity = _bound_activity()
    edit_activity["device"]["name"] = "Renamed"
    devices = [_matter_payload(), _device_payload(source_device_id=7)]

    steps = build_activity_sync_plan(
        {"devices": devices, "activities": [base_activity]},
        {"devices": devices, "activities": [edit_activity]},
        0x65,
    )

    kinds = [step.kind for step in steps]
    assert "member_replay" not in kinds
    assert "binding_write" not in kinds
