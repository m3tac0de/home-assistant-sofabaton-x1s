"""Tests for the pure backup-export assemblers (lib/backup_export.py).

These cover the assembly layer in isolation — turning already-fetched
state into the schema-versioned backup shapes — independent of the
fetch orchestration (which is exercised via the integration's hub
backup tests).
"""

from __future__ import annotations

import importlib
import importlib.util
import sys
import types
from pathlib import Path

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)


def _load_lib() -> types.ModuleType:
    name = "sofapython_backup_export_test_pkg"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, LIB_DIR / "__init__.py", submodule_search_locations=[str(LIB_DIR)]
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


_pkg = _load_lib()
bx = importlib.import_module(f"{_pkg.__name__}.backup_export")
hub_versions = importlib.import_module(f"{_pkg.__name__}.hub_versions")
macros_mod = importlib.import_module(f"{_pkg.__name__}.macros")


class _Macro:
    def __init__(self, key_id, label, key_sequence):
        self.key_id = key_id
        self.label = label
        self.key_sequence = key_sequence


class _Step:
    def __init__(self, *, device_id=0, key_id=0, fid=0, duration=0, delay=0):
        self.device_id = device_id
        self.key_id = key_id
        self.fid = fid
        self.duration = duration
        self.delay = delay


# ---------------------------------------------------------------------------
# device-class routing
# ---------------------------------------------------------------------------


def test_uses_raw_command_dump_for_bt_rf_wifi_not_ir() -> None:
    assert bx.uses_raw_command_dump("bluetooth") is True
    assert bx.uses_raw_command_dump("rf_433mhz") is True
    assert bx.uses_raw_command_dump("wifi_sonos") is True
    assert bx.uses_raw_command_dump("IR") is False
    assert bx.uses_raw_command_dump(None) is False


def test_is_network_callback_device_class() -> None:
    assert bx.is_network_callback_device_class("wifi_ip") is True
    assert bx.is_network_callback_device_class("bluetooth") is False


# ---------------------------------------------------------------------------
# hub_code_record extraction
# ---------------------------------------------------------------------------


def test_build_hub_code_record_restore_data_extracts_fields() -> None:
    command = {
        "ir_blob_hex": "aa bb cc dd",
        "pages": [
            {"payload_hex": "01 00 01 01 00 01 07 05 03 00 00 00 00 4e 25 42"},
        ],
    }
    restore = bx.build_hub_code_record_restore_data(command, device_class="bluetooth")
    assert restore == {
        "transport": "hub_code_record",
        "library_type": 0x03,
        "command_code": "00 00 00 00 4e 25",
        "data_hex": "aa bb cc dd",
    }


def test_build_hub_code_record_restore_data_returns_none_without_pages() -> None:
    assert bx.build_hub_code_record_restore_data({"ir_blob_hex": "aa"}, device_class="bluetooth") is None
    assert bx.build_hub_code_record_restore_data({"pages": []}, device_class="bluetooth") is None


# ---------------------------------------------------------------------------
# dump normalization
# ---------------------------------------------------------------------------


def test_normalize_dump_splits_replay_tail() -> None:
    body = bytes([0x10, 0x20, 0x30])
    tail = (sum(body) + 2) & 0xFF
    dump = {
        "device_id": 5,
        "complete": True,
        "commands": [
            {"label": "X", "device_id": 5, "command_id": 9, "ir_blob_hex": (body + bytes([tail])).hex()}
        ],
    }
    out = bx.normalize_dump_to_blobs(dump, resolve_device_class=lambda d: "IR", fallback_device_id=5)
    assert out["complete"] is True
    cmd = out["commands"][0]
    assert cmd["command_blob"] == body.hex(" ")
    assert cmd["replay_tail_checksum"] == tail
    assert cmd["command_id"] == 9


def test_normalize_dump_none_passthrough() -> None:
    assert bx.normalize_dump_to_blobs(None, resolve_device_class=lambda d: None, fallback_device_id=1) is None


# ---------------------------------------------------------------------------
# device block
# ---------------------------------------------------------------------------


def test_build_device_block_minimal_without_config() -> None:
    meta = {"name": "TV", "brand": "Sony", "device_class": "IR", "device_class_code": 0x10}
    assert bx.build_device_block(11, meta, None) == {
        "device_id": 11,
        "name": "TV",
        "brand": "Sony",
        "device_class": "IR",
        "device_class_code": 0x10,
    }


# ---------------------------------------------------------------------------
# activity row builders + referenced ids
# ---------------------------------------------------------------------------


def test_activity_button_rows_collect_referenced_devices() -> None:
    button_details = {
        0x58: {"device_id": 11, "command_id": 3, "long_press_device_id": 12, "long_press_command_id": 4},
        0x59: {"device_id": 0, "command_id": 0},  # unbound -> skipped
    }
    rows, referenced = bx.build_activity_button_rows(
        button_codes=[0x58, 0x59], button_details=button_details
    )
    assert len(rows) == 1
    assert rows[0]["device_id"] == 11
    assert referenced == {11, 12}


def test_activity_macro_rows_preserve_delay_sentinels_and_refs() -> None:
    macro = _Macro(
        key_id=0xC6,
        label="POWER_ON",
        key_sequence=[
            _Step(device_id=11, key_id=1, fid=0x4E21, duration=0, delay=0),
            _Step(device_id=0xFF, key_id=0xFF, fid=0xFFFFFFFFFFFF, duration=0xFF, delay=0x05),  # delay sentinel
            _Step(device_id=12, key_id=3, fid=0x4E23, duration=1, delay=5),
        ],
    )
    rows, referenced = bx.build_activity_macro_rows([macro])
    assert referenced == {11, 12}  # sentinel device 0xFF not referenced
    assert len(rows[0]["steps"]) == 3
    assert rows[0]["steps"][1]["device_id"] == 0xFF


# ---------------------------------------------------------------------------
# envelope assemblers
# ---------------------------------------------------------------------------


def test_assemble_device_backup_schema_and_keys() -> None:
    payload = bx.assemble_device_backup(
        device_block={"device_id": 1},
        command_rows=[],
        button_rows=[],
        macro_rows=[],
        key_sort_row={"device_id": 1},
        input_record=None,
        complete=True,
    )
    assert payload["kind"] == "device_backup"
    assert payload["schema_version"] == hub_versions.DEVICE_BACKUP_SCHEMA_VERSION
    assert payload["complete"] is True
    assert set(payload) >= {"device", "commands", "button_bindings", "macros", "key_sort", "input_record"}


def test_assemble_hub_bundle_complete_aggregates_children() -> None:
    complete_dev = {"complete": True}
    incomplete_dev = {"complete": False}
    bundle_ok = bx.assemble_hub_bundle(
        device_payloads=[complete_dev], activity_payloads=[], hub_info={"name": "H"}, total_steps=2
    )
    assert bundle_ok["kind"] == "hub_bundle"
    assert bundle_ok["schema_version"] == hub_versions.HUB_BUNDLE_SCHEMA_VERSION
    assert bundle_ok["complete"] is True
    assert bundle_ok["_progress_total_steps"] == 2

    bundle_bad = bx.assemble_hub_bundle(
        device_payloads=[complete_dev, incomplete_dev], activity_payloads=[], hub_info={"name": "H"}
    )
    assert bundle_bad["complete"] is False
    assert "_progress_total_steps" not in bundle_bad
