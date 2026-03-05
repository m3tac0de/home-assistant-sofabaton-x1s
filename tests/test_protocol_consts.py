"""Unit tests for shared protocol constants."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONST_PATH = ROOT / "custom_components" / "sofabaton_x1s" / "lib" / "protocol_const.py"

spec = spec_from_file_location("protocol_const", CONST_PATH)
assert spec and spec.loader, "Unable to load protocol_const module"
const = module_from_spec(spec)
spec.loader.exec_module(const)  # type: ignore[assignment]


def test_all_opcodes_have_names() -> None:
    """Ensure every OP_* value is represented in OPNAMES."""

    opcode_values = {
        name: value
        for name, value in const.__dict__.items()
        if name.startswith("OP_") and isinstance(value, int)
    }

    missing = {
        name: value for name, value in opcode_values.items() if value not in const.OPNAMES
    }

    assert not missing, f"Missing opcode names: {sorted(missing)}"


def test_opcode_byte_helpers() -> None:
    """Ensure opcode helpers split into high and low bytes correctly."""

    assert const.opcode_hi(0xD50B) == 0xD5
    assert const.opcode_lo(0xD50B) == 0x0B
    assert const.opcode_family(0xD50B) == const.opcode_lo(0xD50B)


def test_family_constants_align_with_examples() -> None:
    """Known low-byte families should match documented opcode examples."""

    assert const.FAMILY_DEV_ROW == const.opcode_lo(const.OP_CATALOG_ROW_DEVICE)
    assert const.FAMILY_DEV_ROW == const.opcode_lo(const.OP_X1_DEVICE)

    assert const.FAMILY_ACT_ROW == const.opcode_lo(const.OP_CATALOG_ROW_ACTIVITY)
    assert const.FAMILY_ACT_ROW == const.opcode_lo(const.OP_X1_ACTIVITY)

    assert const.FAMILY_MACROS == const.opcode_lo(const.OP_MACROS_A1)
    assert const.FAMILY_MACROS == const.opcode_lo(const.OP_MACROS_B1)
    assert const.FAMILY_MACROS == const.opcode_lo(const.OP_MACROS_A2)
    assert const.FAMILY_MACROS == const.opcode_lo(const.OP_MACROS_B2)

    assert const.FAMILY_KEYMAP == const.opcode_lo(const.OP_KEYMAP_TBL_A)
    assert const.FAMILY_KEYMAP == const.opcode_lo(const.OP_KEYMAP_EXTRA)

    assert const.FAMILY_DEVBTNS == const.opcode_lo(const.OP_DEVBTN_HEADER)
    assert const.FAMILY_DEVBTNS == const.opcode_lo(const.OP_DEVBTN_TAIL)
    assert const.FAMILY_DEVBTNS == const.opcode_lo(const.OP_DEVBTN_SINGLE)
