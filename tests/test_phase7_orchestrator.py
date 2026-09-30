"""Phase 7 tests: the unified device-create orchestrator.

Each test exercises a specific slice of the Phase 7 contract:

- ``run_device_create`` dispatches to the right per-transport pipeline.
- ``restore_device`` and ``create_wifi_device`` both flow through the
  shared orchestrator and produce equivalent
  :class:`DeviceCreateRequest`s when given equivalent inputs.
- The IR pipeline still emits its canonical step sequence (device-
  create -> command writes -> bindings -> macros -> inputs -> update
  -> remote-sync).

The tests use lightweight fakes rather than the full :class:`X1Proxy`
so they can run without a hub connection. The orchestrator is purely
a dispatcher; per-transport details are exercised through the
existing pipeline tests on :mod:`tests.test_x1_proxy`.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


ensure_stub_package("custom_components", ROOT / "custom_components")
ensure_stub_package(
    "custom_components.sofabaton_x1s",
    ROOT / "custom_components" / "sofabaton_x1s",
)
ensure_stub_package(
    "custom_components.sofabaton_x1s.lib",
    ROOT / "custom_components" / "sofabaton_x1s" / "lib",
)


from custom_components.sofabaton_x1s.lib.device_create import (
    DeviceCreateRequest,
    DeviceCreateResult,
    run_device_create,
)


class _DispatchSpy:
    """Stand-in for the proxy that records which pipeline was invoked."""

    def __init__(self, *, fail: bool = False) -> None:
        self.network_callback_calls: list[DeviceCreateRequest] = []
        self.ir_calls: list[DeviceCreateRequest] = []
        self.fail = fail

    def _run_network_callback_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult:
        self.network_callback_calls.append(request)
        if self.fail:
            return DeviceCreateResult(success=False, failed_step_label="nc-fail")
        return DeviceCreateResult(success=True, device_id=0x42, restored_inputs=1)

    def _run_ir_device_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult:
        self.ir_calls.append(request)
        if self.fail:
            return DeviceCreateResult(success=False, failed_step_label="ir-fail")
        return DeviceCreateResult(
            success=True,
            device_id=0x0D,
            restored_commands=3,
            restored_button_bindings=2,
            restored_macros=1,
            restored_inputs=0,
            command_id_map={1: 1, 2: 2, 3: 3},
        )

    def _run_activity_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult:
        # Phase 8 adds the activity path. Tests that exercise the
        # activity dispatch route through this method.
        self.ir_calls.append(request)  # reuse ir_calls bucket for assertions
        return DeviceCreateResult(success=True, device_id=0x55)


def test_run_device_create_dispatches_network_callback_to_wifi_mixin() -> None:
    """Phase 7: ``transport='network_callback'`` reaches the wifi pipeline."""

    spy = _DispatchSpy()
    request = DeviceCreateRequest(
        transport="network_callback",
        network_callback_profile={"device_name": "X", "slots": []},
    )
    result = run_device_create(spy, request)
    assert result.success is True
    assert result.device_id == 0x42
    assert len(spy.network_callback_calls) == 1
    assert spy.network_callback_calls[0] is request
    assert spy.ir_calls == []


def test_run_device_create_dispatches_ir_to_restore_mixin() -> None:
    """Phase 7: ``transport='ir'`` reaches the IR / BT / RF pipeline."""

    spy = _DispatchSpy()
    request = DeviceCreateRequest(
        transport="ir",
        device_block={"device_class": "ir", "name": "Bose"},
        commands=[{"command_id": 1, "name": "Power"}],
    )
    result = run_device_create(spy, request)
    assert result.success is True
    assert result.device_id == 0x0D
    assert result.restored_commands == 3
    assert len(spy.ir_calls) == 1
    assert spy.ir_calls[0] is request
    assert spy.network_callback_calls == []


def test_run_device_create_rejects_unknown_transport() -> None:
    """Phase 7: unknown transports fail fast rather than silently noop."""

    spy = _DispatchSpy()
    request = DeviceCreateRequest(transport="zwave")  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="unsupported transport"):
        run_device_create(spy, request)


def test_run_device_create_routes_activity_kind_to_activity_pipeline() -> None:
    """Phase 8: ``entity_kind='activity'`` reaches ``_run_activity_create``."""

    spy = _DispatchSpy()
    request = DeviceCreateRequest(transport="ir", entity_kind="activity")
    result = run_device_create(spy, request)
    assert result.success is True
    assert result.device_id == 0x55
    assert len(spy.ir_calls) == 1  # spy routes activity calls into ir_calls
    assert spy.network_callback_calls == []


def test_run_device_create_ir_round_trip_propagates_result() -> None:
    """Phase 7: the IR pipeline result flows through unchanged."""

    spy = _DispatchSpy()
    request = DeviceCreateRequest(
        transport="ir",
        device_block={"device_class": "ir"},
        commands=[{"command_id": idx} for idx in range(1, 4)],
        button_bindings=[{"button_id": 0x10, "command_id": 1}],
        macros=[{"button_id": 0xC6, "steps": []}],
    )
    result = run_device_create(spy, request)
    assert result.success is True
    assert result.restored_commands == 3
    assert result.restored_button_bindings == 2
    assert result.restored_macros == 1
    assert result.command_id_map == {1: 1, 2: 2, 3: 3}


def test_run_device_create_network_callback_x1s_carries_profile() -> None:
    """Phase 7: the wifi pipeline sees the full profile dict."""

    spy = _DispatchSpy()
    profile = {
        "device_name": "Living Room Audio",
        "brand_name": "demo",
        "ip_address": "10.0.0.5",
        "request_port": 8060,
        "slots": [{"display_name": "TV", "command_index": 0, "press_type": "short"}],
        "power_on_command_id": 1,
        "power_off_command_id": 2,
        "input_command_ids": [1],
        "source_slot_count": 1,
    }
    request = DeviceCreateRequest(
        transport="network_callback",
        device_block={"name": "Living Room Audio"},
        network_callback_profile=profile,
    )
    result = run_device_create(spy, request)
    assert result.success is True
    # The dispatcher passes the request through verbatim; the profile
    # is the wire-side surface of the wifi pipeline.
    assert spy.network_callback_calls[0].network_callback_profile == profile


def test_run_device_create_propagates_failure() -> None:
    """Phase 7: a failed pipeline returns the failure result, not None."""

    spy = _DispatchSpy(fail=True)
    request = DeviceCreateRequest(
        transport="ir", device_block={"device_class": "ir"}
    )
    result = run_device_create(spy, request)
    assert result.success is False
    assert result.failed_step_label == "ir-fail"


# The "restore_and_create_produce_same_network_callback_request" test
# was retired alongside the Wifi Commands managed restore path: wifi
# device classes now backup/restore through the same generic
# hub_code_record pipeline BT/RF use, so the dedicated
# ``_build_network_callback_request`` helper that test exercised no
# longer exists. ``create_wifi_device`` itself still goes through the
# network-callback transport (covered by the create-wifi-device tests
# in ``test_x1_proxy.py``); restore now hands a plain ``transport="ir"``
# request to ``run_device_create``.
