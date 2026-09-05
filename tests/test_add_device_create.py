"""Tests for the Hub tab "Add device" backend: the per-class empty-device
profiles, the ``create_device`` proxy wrapper, and the zero-command run
through both device-create pipelines."""
from __future__ import annotations

import types
from typing import Any

import pytest

from custom_components.sofabaton_x1s.const import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
)
from custom_components.sofabaton_x1s.lib.device_class_profiles import (
    DEFAULT_ICON,
    IR_DEVICE_TYPE_TV,
    MAX_DEVICE_NAME_LEN,
    SUPPORTED_CREATE_CLASSES_BY_HUB,
    WIFI_DEVICE_TYPE,
    build_empty_device_block,
    build_empty_device_payload,
    describe_create_classes,
    supported_create_classes,
)
from custom_components.sofabaton_x1s.lib.device_create import DeviceCreateResult
from custom_components.sofabaton_x1s.lib.devices import (
    build_device_create_payload,
    device_config_from_backup,
    parse_device_record,
)
from custom_components.sofabaton_x1s.lib.hub_versions import DEVICE_BACKUP_SCHEMA_VERSION
from custom_components.sofabaton_x1s.lib.protocol_const import (
    DEVICE_CLASS_CODE_IR,
    DEVICE_CLASS_CODE_WIFI_HUE,
    DEVICE_CLASS_CODE_WIFI_IP,
    DEVICE_CLASS_CODE_WIFI_MQTT,
    DEVICE_CLASS_CODE_WIFI_ROKU,
    DEVICE_CLASS_CODE_WIFI_SONOS,
)
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy
import custom_components.sofabaton_x1s.lib.proxy_restore as proxy_restore_module
import custom_components.sofabaton_x1s.lib.x1_proxy as x1_proxy_module


def _make_proxy(hub_version: str = HUB_VERSION_X1S) -> X1Proxy:
    return X1Proxy(
        "127.0.0.1",
        proxy_enabled=False,
        diag_dump=False,
        diag_parse=False,
        hub_version=hub_version,
    )


# ── profiles ────────────────────────────────────────────────────────────


def test_supported_classes_per_hub_line() -> None:
    assert supported_create_classes(HUB_VERSION_X1) == ("ir", "wifi_roku", "wifi_hue", "wifi_sonos")
    assert supported_create_classes(HUB_VERSION_X1S) == (
        "ir", "wifi_roku", "wifi_hue", "wifi_sonos", "wifi_ip",
    )
    assert supported_create_classes(HUB_VERSION_X2) == (
        "ir", "wifi_roku", "wifi_hue", "wifi_sonos", "wifi_ip", "wifi_mqtt",
    )
    assert supported_create_classes(None) == ()
    assert supported_create_classes("Y9") == ()
    # Bluetooth and RF are deliberately absent everywhere.
    for classes in SUPPORTED_CREATE_CLASSES_BY_HUB.values():
        assert "bluetooth" not in classes
        assert not any(cls.startswith("rf_") for cls in classes)


def test_describe_create_classes_lists_codes() -> None:
    rows = describe_create_classes(HUB_VERSION_X2)
    assert [row["device_class"] for row in rows] == list(supported_create_classes(HUB_VERSION_X2))
    codes = {row["device_class"]: row["device_class_code"] for row in rows}
    assert codes["ir"] == DEVICE_CLASS_CODE_IR
    assert codes["wifi_mqtt"] == DEVICE_CLASS_CODE_WIFI_MQTT


@pytest.mark.parametrize(
    ("device_class", "code", "device_type", "input_mode", "power_style", "share_mode"),
    [
        ("ir", DEVICE_CLASS_CODE_IR, IR_DEVICE_TYPE_TV, 0, 1, 2),
        ("wifi_roku", DEVICE_CLASS_CODE_WIFI_ROKU, WIFI_DEVICE_TYPE, 2, 2, 0),
        ("wifi_hue", DEVICE_CLASS_CODE_WIFI_HUE, WIFI_DEVICE_TYPE, 2, 0, 0),
        ("wifi_sonos", DEVICE_CLASS_CODE_WIFI_SONOS, WIFI_DEVICE_TYPE, 2, 0, 0),
        ("wifi_ip", DEVICE_CLASS_CODE_WIFI_IP, WIFI_DEVICE_TYPE, 2, 0, 0),
    ],
)
def test_empty_device_block_renders_expected_head_bytes(
    device_class: str, code: int, device_type: int, input_mode: int, power_style: int, share_mode: int
) -> None:
    block = build_empty_device_block("Living TV", device_class, hub_version=HUB_VERSION_X1S)
    assert block["device_class"] == device_class
    assert block["device_class_code"] == code
    assert block["brand"] == ""
    assert "extras" not in block

    # Render the way the restore-style create does and check the wire body.
    config = device_config_from_backup(block, for_create=False)
    body = build_device_create_payload(config, hub_version=HUB_VERSION_X1S)[3:]
    assert body[5] == DEFAULT_ICON
    assert body[6] == 0  # sort
    assert body[7] == code
    assert body[8] == device_type
    assert body[9:25] == b"\x00" * 16
    assert body[25] == 0  # hide
    assert body[26] == 0  # input_flag
    assert body[27] == 0  # channel
    assert body[28] == 0  # power_state
    parsed = parse_device_record(body, hub_version=HUB_VERSION_X1S, entity_kind="device")
    assert parsed.name == "Living TV"
    assert parsed.brand == ""
    assert parsed.ip_address is None
    assert parsed.poll_time == 0  # marker present, value 0
    assert parsed.input_mode == input_mode
    assert parsed.power_mode == 0
    assert parsed.power_style == power_style
    assert parsed.share_mode == share_mode
    assert parsed.tail_flag == 0
    assert parsed.tail_marker == 1
    assert parsed.extras_present is False


def test_empty_device_block_on_x1_fits_the_short_record() -> None:
    block = build_empty_device_block("Kitchen Roku", "wifi_roku", hub_version=HUB_VERSION_X1)
    config = device_config_from_backup(block, for_create=False)
    body = build_device_create_payload(config, hub_version=HUB_VERSION_X1)[3:]
    assert len(body) == 120
    parsed = parse_device_record(body, hub_version=HUB_VERSION_X1, entity_kind="device")
    assert parsed.name == "Kitchen Roku"
    assert parsed.code_type == DEVICE_CLASS_CODE_WIFI_ROKU
    assert parsed.device_type == WIFI_DEVICE_TYPE
    assert parsed.extras_present is False


def test_empty_device_block_on_x2_carries_the_emitter_block() -> None:
    ir_block = build_empty_device_block("Projector", "ir", hub_version=HUB_VERSION_X2)
    assert ir_block["extras"] == {"a": 0, "b": 0, "c": 1}
    body = build_device_create_payload(
        device_config_from_backup(ir_block, for_create=False), hub_version=HUB_VERSION_X2
    )[3:]
    parsed = parse_device_record(body, hub_version=HUB_VERSION_X2, entity_kind="device")
    assert parsed.extras_present is True
    assert (parsed.extra_a, parsed.extra_b, parsed.extra_c) == (0, 0, 1)

    wifi_block = build_empty_device_block("Bridge", "wifi_hue", hub_version=HUB_VERSION_X2)
    assert wifi_block["extras"] == {"a": 0, "b": 0, "c": 0}


def test_empty_mqtt_block_reuses_the_wifi_mqtt_profile() -> None:
    block = build_empty_device_block("Broker", "wifi_mqtt", hub_version=HUB_VERSION_X2)
    assert block["device_class"] == "wifi_mqtt"
    assert block["code_type"] == DEVICE_CLASS_CODE_WIFI_MQTT
    assert block["device_type"] == WIFI_DEVICE_TYPE
    assert block["icon"] == DEFAULT_ICON
    assert block["brand"] == ""
    assert block["name"] == "Broker"
    assert block["sort"] == 0


@pytest.mark.parametrize(
    ("device_class", "hub_version"),
    [
        ("wifi_mqtt", HUB_VERSION_X1S),
        ("wifi_ip", HUB_VERSION_X1),
        ("bluetooth", HUB_VERSION_X2),
        ("rf_433mhz", HUB_VERSION_X1S),
        ("nonsense", HUB_VERSION_X1S),
        ("", HUB_VERSION_X1S),
    ],
)
def test_empty_device_block_refuses_unsupported_class(device_class: str, hub_version: str) -> None:
    with pytest.raises(ValueError):
        build_empty_device_block("Name", device_class, hub_version=hub_version)


def test_empty_device_block_normalizes_class_aliases_and_trims_name() -> None:
    block = build_empty_device_block("  Roku  ", "roku", hub_version=HUB_VERSION_X1S)
    assert block["device_class"] == "wifi_roku"
    assert block["name"] == "Roku"
    with pytest.raises(ValueError):
        build_empty_device_block("   ", "ir", hub_version=HUB_VERSION_X1S)


def test_empty_device_payload_shape() -> None:
    payload = build_empty_device_payload("TV", "ir", hub_version=HUB_VERSION_X1S)
    assert payload["kind"] == "device_backup"
    assert payload["schema_version"] == DEVICE_BACKUP_SCHEMA_VERSION
    assert payload["commands"] == []
    assert payload["button_bindings"] == []
    assert payload["macros"] == []
    assert payload["device"]["device_class"] == "ir"
    assert MAX_DEVICE_NAME_LEN == 30


# ── create_device wrapper ───────────────────────────────────────────────


def _stub_tail(monkeypatch, proxy: X1Proxy) -> dict[str, int]:
    calls = {"resync": 0, "refresh": 0}

    def _resync(hub_version=None):
        calls["resync"] += 1
        return True

    def _refresh(timeout=15.0):
        calls["refresh"] += 1
        return True

    monkeypatch.setattr(proxy, "resync_remote", _resync)
    monkeypatch.setattr(proxy, "_request_devices_and_wait", _refresh)
    return calls


def test_create_device_builds_empty_payload_and_syncs(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    calls = _stub_tail(monkeypatch, proxy)
    captured: dict[str, Any] = {}

    def _restore_device(payload, **kwargs):
        captured["payload"] = payload
        return {"status": "success", "device_id": 0x2A}

    monkeypatch.setattr(proxy, "restore_device", _restore_device)

    result = proxy.create_device("  Hue Bridge  ", device_class="wifi_hue")

    assert result == {"status": "success", "device_id": 0x2A}
    payload = captured["payload"]
    assert payload["kind"] == "device_backup"
    assert payload["device"]["name"] == "Hue Bridge"
    assert payload["device"]["device_class"] == "wifi_hue"
    assert payload["commands"] == []
    assert calls == {"resync": 1, "refresh": 1}


def test_create_device_payload_passes_restore_validation(monkeypatch) -> None:
    """The synthetic payload must survive restore_device's own validation
    for every creatable class (including the non-IR classes, which used to
    demand at least one command row)."""

    for hub_version, classes in SUPPORTED_CREATE_CLASSES_BY_HUB.items():
        for device_class in classes:
            proxy = _make_proxy(hub_version)
            monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
            _stub_tail(monkeypatch, proxy)
            captured: dict[str, Any] = {}

            def _run_device_create(target_proxy, request, _captured=captured):
                _captured["request"] = request
                return DeviceCreateResult(success=True, device_id=0x31)

            monkeypatch.setattr(proxy_restore_module, "run_device_create", _run_device_create)

            result = proxy.create_device("Empty", device_class=device_class)

            assert result == {"status": "success", "device_id": 0x31}, (hub_version, device_class)
            request = captured["request"]
            assert request.entity_kind == "device"
            assert request.transport == "ir"
            assert request.commands == []
            assert request.button_bindings == []
            assert request.macros == []
            assert request.device_block["device_class"] == device_class


def test_create_device_refuses_empty_name(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    assert proxy.create_device("   ", device_class="ir") is None


def test_create_device_refuses_unsupported_class_for_hub(monkeypatch) -> None:
    proxy = _make_proxy(HUB_VERSION_X1S)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    called = []
    monkeypatch.setattr(proxy, "restore_device", lambda payload, **kw: called.append(payload))
    assert proxy.create_device("Broker", device_class="wifi_mqtt") is None
    assert proxy.create_device("Speaker", device_class="bluetooth") is None
    assert called == []


def test_create_device_refused_while_proxy_client_connected(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: False)
    assert proxy.create_device("TV", device_class="ir") is None


def test_create_device_returns_none_on_restore_failure(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    calls = _stub_tail(monkeypatch, proxy)
    monkeypatch.setattr(proxy, "restore_device", lambda payload, **kw: None)
    assert proxy.create_device("TV", device_class="ir") is None
    assert calls == {"resync": 0, "refresh": 0}


def test_create_device_returns_none_without_assigned_id(monkeypatch) -> None:
    proxy = _make_proxy()
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    calls = _stub_tail(monkeypatch, proxy)
    monkeypatch.setattr(proxy, "restore_device", lambda payload, **kw: {"status": "success", "device_id": 0})
    assert proxy.create_device("TV", device_class="ir") is None
    assert calls == {"resync": 0, "refresh": 0}


# ── zero-command runs through both create pipelines ─────────────────────


def _fake_sequence(sequence_calls: list[list[Any]]):
    def _run_create_sequence(_proxy, steps):
        step_list = list(steps)
        sequence_calls.append(step_list)
        return types.SimpleNamespace(
            success=True,
            assigned_device_id=0x23,
            failed_step=None,
            failed_index=None,
        )

    return _run_create_sequence


@pytest.mark.parametrize("device_class", ["ir", "wifi_roku", "wifi_hue", "wifi_sonos", "wifi_ip"])
def test_restore_style_create_with_zero_commands(monkeypatch, device_class: str) -> None:
    proxy = _make_proxy(HUB_VERSION_X1S)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    monkeypatch.setattr(proxy, "_refresh_destination_catalog", lambda: None)
    sequence_calls: list[list[Any]] = []
    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _fake_sequence(sequence_calls))

    payload = build_empty_device_payload("Empty", device_class, hub_version=HUB_VERSION_X1S)
    result = proxy.restore_device(payload)

    assert result is not None
    assert result["status"] == "success"
    assert result["device_id"] == 0x23
    assert result["restored_commands"] == 0
    assert result["restored_button_bindings"] == 0
    assert result["restored_macros"] == 0
    assert result["restored_inputs"] == 0
    assert result["command_id_map"] == {}
    assert [step.label for step in sequence_calls[0]] == ["device-create"]
    # The restore-style (X1S/X2) create commits in the create record itself
    # (tail_marker 1); with nothing to replay the post phase is empty.
    families = [step.family for step in sequence_calls[1]]
    assert 0x0E not in families  # no command pages
    assert 0x3E not in families  # no bindings
    assert families == []
    # The proxy learned the new device and its class right away.
    assert proxy.state.devices[0x23]["device_class"] == device_class
    assert proxy.state.commands[0x23] == {}


@pytest.mark.parametrize(
    ("device_class", "expect_inputs_page"),
    [("ir", True), ("wifi_hue", True), ("wifi_sonos", True), ("wifi_roku", False)],
)
def test_x1_import_create_with_zero_commands(monkeypatch, device_class: str, expect_inputs_page: bool) -> None:
    proxy = _make_proxy(HUB_VERSION_X1)
    monkeypatch.setattr(proxy, "can_issue_commands", lambda: True)
    sequence_calls: list[list[Any]] = []
    monkeypatch.setattr(x1_proxy_module, "run_create_sequence", _fake_sequence(sequence_calls))

    payload = build_empty_device_payload("Empty", device_class, hub_version=HUB_VERSION_X1)
    result = proxy.restore_device(payload)

    assert result is not None
    assert result["status"] == "success"
    assert result["device_id"] == 0x23
    assert result["restored_commands"] == 0
    assert [step.label for step in sequence_calls[0]] == ["device-create"]
    families = [step.family for step in sequence_calls[1]]
    assert 0x0E not in families
    # The X1 import writes the default (empty) inputs page for every class
    # except an empty wifi_roku record, which the X1 hub refuses with
    # STATUS_ACK 0x04 (bench_180, 2026-09-05).
    assert (0x46 in families) is expect_inputs_page
    assert 0x08 in families
