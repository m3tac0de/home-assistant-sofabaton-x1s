"""Contract tests for authoritative live-sync bundle validation."""

from __future__ import annotations

import copy

import pytest

from custom_components.sofabaton_x1s.lib.bundle_validation import (
    validate_hub_bundle_for_model,
)


def valid_bundle(model: str = "X1S") -> dict:
    return {
        "kind": "hub_bundle",
        "schema_version": 5,
        "hub": {"name": "Living Room", "version": model},
        "devices": [
            {
                "device": {
                    "device_id": 1,
                    "name": "Television",
                    "device_class": "ir",
                    "idle_behavior": 3,
                },
                "commands": [
                    {"command_id": 10, "name": "Power"},
                    {"command_id": 11, "name": "Home"},
                ],
                "macros": [],
                "button_bindings": [],
                "input_record": {
                    "entries": [{"command_id": 11, "input_index": 1, "name": "Home"}],
                },
            },
        ],
        "activities": [
            {
                "device": {
                    "device_id": 101,
                    "name": "Watch TV",
                    "entity_type": "activity",
                },
                "referenced_source_device_ids": [1],
                "favorite_slots": [
                    {"button_id": 1, "device_id": 1, "command_id": 10, "name": "Power"},
                ],
                "macros": [
                    {
                        "button_id": 2,
                        "name": "Home action",
                        "steps": [
                            {
                                "device_id": 1,
                                "command_id": 11,
                                "button_code": 0x4E0B,
                                "duration": 0,
                                "delay": 0xFF,
                            },
                        ],
                    },
                    {
                        "button_id": 198,
                        "name": "POWER_ON",
                        "steps": [
                            {
                                "device_id": 1,
                                "command_id": 0xC6,
                                "button_code": 0,
                                "duration": 0,
                                "delay": 0xFF,
                            },
                            {
                                "device_id": 1,
                                "command_id": 0xC5,
                                "button_code": 0,
                                "duration": 0,
                                "delay": 0xFF,
                            },
                        ],
                    },
                    {
                        "button_id": 199,
                        "name": "POWER_OFF",
                        "steps": [
                            {
                                "device_id": 1,
                                "command_id": 0xC7,
                                "button_code": 0,
                                "duration": 0,
                                "delay": 0xFF,
                            },
                        ],
                    },
                ],
                "button_bindings": [
                    {"button_id": 0xB0, "device_id": 1, "command_id": 10},
                ],
            },
        ],
    }


@pytest.mark.parametrize("model", ["X1", "X1S", "X2"])
def test_valid_bundle_is_accepted_for_each_model(model):
    bundle = valid_bundle(model)
    assert validate_hub_bundle_for_model(bundle, hub_version=model) == model


def test_x1_rejects_unicode_and_punctuation_while_wide_models_accept_supported_names():
    x1 = valid_bundle("X1")
    x1["activities"][0]["device"]["name"] = "Cinéma +"
    with pytest.raises(ValueError, match="unsupported by X1"):
        validate_hub_bundle_for_model(x1, hub_version="X1")

    x1s = valid_bundle("X1S")
    x1s["activities"][0]["device"]["name"] = "Cinéma +"
    validate_hub_bundle_for_model(x1s, hub_version="X1S")

    x2 = valid_bundle("X2")
    x2["activities"][0]["device"]["name"] = "Cinéma +"
    validate_hub_bundle_for_model(x2, hub_version="X2")


def test_model_mismatch_is_rejected():
    with pytest.raises(ValueError, match="selected hub is X1S"):
        validate_hub_bundle_for_model(valid_bundle("X2"), hub_version="X1S")


def test_x2_only_button_is_model_aware():
    bundle = valid_bundle("X1S")
    bundle["activities"][0]["button_bindings"][0]["button_id"] = 0x99
    with pytest.raises(ValueError, match="unsupported on X1S"):
        validate_hub_bundle_for_model(bundle, hub_version="X1S")

    bundle["hub"]["version"] = "X2"
    validate_hub_bundle_for_model(bundle, hub_version="X2")


def test_duplicate_ids_slots_and_buttons_are_rejected():
    duplicate_device = valid_bundle()
    duplicate_device["devices"].append(copy.deepcopy(duplicate_device["devices"][0]))
    with pytest.raises(ValueError, match="duplicates device"):
        validate_hub_bundle_for_model(duplicate_device, hub_version="X1S")

    slot_collision = valid_bundle()
    slot_collision["activities"][0]["favorite_slots"][0]["button_id"] = 2
    with pytest.raises(ValueError, match="collides with macro slot"):
        validate_hub_bundle_for_model(slot_collision, hub_version="X1S")

    duplicate_button = valid_bundle()
    duplicate_button["activities"][0]["button_bindings"].append(
        copy.deepcopy(duplicate_button["activities"][0]["button_bindings"][0])
    )
    with pytest.raises(ValueError, match="duplicates button"):
        validate_hub_bundle_for_model(duplicate_button, hub_version="X1S")


def test_dangling_device_command_and_input_references_are_rejected():
    missing_device = valid_bundle()
    missing_device["activities"][0]["favorite_slots"][0]["device_id"] = 2
    with pytest.raises(ValueError, match="unknown device 2"):
        validate_hub_bundle_for_model(missing_device, hub_version="X1S")

    missing_command = valid_bundle()
    missing_command["activities"][0]["favorite_slots"][0]["command_id"] = 99
    with pytest.raises(ValueError, match="missing command 99"):
        validate_hub_bundle_for_model(missing_command, hub_version="X1S")

    missing_input = valid_bundle()
    missing_input["devices"][0]["input_record"]["entries"][0]["command_id"] = 99
    with pytest.raises(ValueError, match="missing command 99"):
        validate_hub_bundle_for_model(missing_input, hub_version="X1S")


def test_delay_rows_must_be_attached_but_zero_wait_may_be_absent_or_retained():
    absent = valid_bundle()
    validate_hub_bundle_for_model(absent, hub_version="X1S")

    retained_zero = valid_bundle()
    retained_zero["activities"][0]["macros"][0]["steps"].append(
        {"device_id": 0xFF, "command_id": 0xFF, "duration": 0xFF, "delay": 0},
    )
    validate_hub_bundle_for_model(retained_zero, hub_version="X1S")

    orphan = valid_bundle()
    orphan["activities"][0]["macros"][0]["steps"].insert(
        0, {"device_id": 0xFF, "command_id": 0xFF, "duration": 0xFF, "delay": 4},
    )
    with pytest.raises(ValueError, match="immediately follow"):
        validate_hub_bundle_for_model(orphan, hub_version="X1S")

    consecutive = valid_bundle()
    consecutive["activities"][0]["macros"][0]["steps"].extend(
        [
            {"device_id": 0xFF, "command_id": 0xFF, "duration": 0xFF, "delay": 2},
            {"device_id": 0xFF, "command_id": 0xFF, "duration": 0xFF, "delay": 3},
        ]
    )
    with pytest.raises(ValueError, match="immediately follow"):
        validate_hub_bundle_for_model(consecutive, hub_version="X1S")


def test_link_mirror_and_all_three_required_power_rows_are_enforced():
    stale_mirror = valid_bundle()
    stale_mirror["activities"][0]["referenced_source_device_ids"] = []
    with pytest.raises(ValueError, match="represented in the power macros"):
        validate_hub_bundle_for_model(stale_mirror, hub_version="X1S")

    missing_input = valid_bundle()
    missing_input["activities"][0]["macros"][1]["steps"] = [
        missing_input["activities"][0]["macros"][1]["steps"][0],
    ]
    with pytest.raises(ValueError, match="exactly one power-on, input, and power-off"):
        validate_hub_bundle_for_model(missing_input, hub_version="X1S")

    duplicate_shutdown = valid_bundle()
    duplicate_shutdown["activities"][0]["macros"][2]["steps"].append(
        copy.deepcopy(duplicate_shutdown["activities"][0]["macros"][2]["steps"][0])
    )
    with pytest.raises(ValueError, match="exactly one power-on, input, and power-off"):
        validate_hub_bundle_for_model(duplicate_shutdown, hub_version="X1S")


def test_baseline_mode_allows_power_repair_but_not_dangling_references():
    baseline = valid_bundle()
    baseline["activities"][0]["macros"] = [baseline["activities"][0]["macros"][0]]
    validate_hub_bundle_for_model(
        baseline,
        hub_version="X1S",
        payload_name="baseline",
        enforce_editor_invariants=False,
    )
    with pytest.raises(ValueError, match="represented in the power macros"):
        validate_hub_bundle_for_model(baseline, hub_version="X1S")

    baseline["activities"][0]["favorite_slots"][0]["device_id"] = 9
    with pytest.raises(ValueError, match="unknown device 9"):
        validate_hub_bundle_for_model(
            baseline,
            hub_version="X1S",
            payload_name="baseline",
            enforce_editor_invariants=False,
        )


def test_invalid_hex_and_byte_overflow_are_rejected():
    bad_hex = valid_bundle()
    bad_hex["devices"][0]["commands"][0]["restore_data"] = {"data_hex": "abc"}
    with pytest.raises(ValueError, match="even number"):
        validate_hub_bundle_for_model(bad_hex, hub_version="X1S")

    overflow = valid_bundle()
    overflow["activities"][0]["macros"][0]["steps"][0]["duration"] = 256
    with pytest.raises(ValueError, match="between 0 and 255"):
        validate_hub_bundle_for_model(overflow, hub_version="X1S")

