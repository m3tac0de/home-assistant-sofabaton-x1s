"""Python/TypeScript couplings that no type system links (review seam X4).

Each test reads a literal from the TypeScript source and compares it with
the Python value it mirrors, so a one-sided change fails here instead of
on a live HA (precedent: test_card_loader_frontend.py). Shapes shared as
vector files live in tests/fixtures (ir-format, uc-hex, wifi-name).
"""

from __future__ import annotations

import re
from pathlib import Path

from custom_components.sofabaton_x1s import hub as hub_module
from custom_components.sofabaton_x1s import ir_uc_hex
from custom_components.sofabaton_x1s.lib.device_class_profiles import SUPPORTED_CREATE_CLASSES_BY_HUB
from custom_components.sofabaton_x1s.lib.hub_versions import HUB_BUNDLE_SCHEMA_VERSION
from custom_components.sofabaton_x1s.lib.protocol_const import ButtonName

ROOT = Path(__file__).resolve().parents[1]
INTEGRATION = ROOT / "custom_components" / "sofabaton_x1s"
TOOLS_SRC = INTEGRATION / "www" / "src"


def _ts(relative: str) -> str:
    return (TOOLS_SRC / relative).read_text(encoding="utf-8")


def _block(text: str, start_pattern: str) -> str:
    """The balanced {...} block that follows the first match of start_pattern."""
    match = re.search(start_pattern, text)
    assert match, f"{start_pattern!r} not found"
    start = text.index("{", match.end() - 1)
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise AssertionError("unbalanced block")


def test_bundle_schema_version_is_one_number_in_both_languages() -> None:
    # CR-X4-3: the frontends refuse any other schema_version (validateBackupBundle).
    match = re.search(r"export const BACKUP_BUNDLE_SCHEMA_VERSION = (\d+);", _ts("shared/ha-context.ts"))
    assert match, "BACKUP_BUNDLE_SCHEMA_VERSION literal not found"
    assert int(match.group(1)) == HUB_BUNDLE_SCHEMA_VERSION


def test_card_picker_translation_keys_match_the_hub_control_entities() -> None:
    # L-A26: the card picker suggests the tools card for these entities by
    # translation_key. Every other entity is listed here on purpose.
    not_hub_controls = {
        "remote", "activity", "index", "recorded_keypress", "ir_intercept", "ir_emitter", "hub_ip_address",
    }
    match = re.search(r"const TOOLS_CONTROL_TRANSLATION_KEYS = new Set\(\[(.*?)\]\)", _ts("tools-card.ts"), re.S)
    assert match, "TOOLS_CONTROL_TRANSLATION_KEYS literal not found"
    ts_keys = set(re.findall(r'"([a-z_]+)"', match.group(1)))
    assert len(ts_keys) == 8, "translation-key scan is stale"
    python_keys: set[str] = set()
    for path in INTEGRATION.glob("*.py"):
        python_keys.update(re.findall(r'_attr_translation_key = "([a-z_]+)"', path.read_text(encoding="utf-8")))
    assert ts_keys <= python_keys, f"card keys no entity carries: {sorted(ts_keys - python_keys)}"
    assert python_keys - ts_keys == not_hub_controls


def test_uc_hex_error_codes_all_have_a_card_message() -> None:
    codes = set(re.findall(r'UcHexError\("([a-z_]+)"', (INTEGRATION / "ir_uc_hex.py").read_text(encoding="utf-8")))
    assert codes, "UcHexError scan is stale"
    assert issubclass(ir_uc_hex.UcHexError, ValueError)
    # __init__.py's _ws_ir_payload_convert: 'unavailable' passes through, the rest gain a prefix.
    wire = {code if code == "unavailable" else f"uc_hex_{code}" for code in codes} | {"uc_hex_unrepresentable", "unavailable"}
    source = _ts("shared/utils/backend-state-localization.ts")
    branch = _block(source, r'if \(surface === "ir_convert"\) \{')
    handled = set(re.findall(r'code === "([a-z_]+)"', branch))
    assert wire <= handled, f"codes the card shows as a generic failure: {sorted(wire - handled)}"


def test_the_create_matrix_is_the_librarys() -> None:
    # L-B13: the Add device dialog offers the library's classes, in its order.
    body = _block(_ts("shared/utils/control-panel-selectors.ts"), r"export function creatableDeviceClasses\(")
    ts_matrix = {
        model: re.findall(r'"([a-z_]+)"', classes)
        for model, classes in re.findall(r'case "([A-Z0-9]+)":\s*return \[([^\]]*)\];', body)
    }
    assert ts_matrix == {model: list(classes) for model, classes in SUPPORTED_CREATE_CLASSES_BY_HUB.items()}


def test_the_wifi_commands_button_table_is_the_protocols() -> None:
    # The card's hard-button ids for Wifi Command slots, against ButtonName and
    # the hub's name -> code map that the store applies.
    block = _block(_ts("tabs/wifi-commands-tab.ts"), r"const ID = \{")
    table = {name: int(code) for name, code in re.findall(r"([A-Z_]+): (\d+),", block)}
    assert len(table) == 27, "ID table scan is stale"
    for name, code in table.items():
        assert getattr(ButtonName, name) == code, name
    assert set(table.values()) == set(hub_module._HARD_BUTTON_TO_CODE.values())
