"""Unit tests for shared protocol constants."""

import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONST_PATH = ROOT / "custom_components" / "sofabaton_x1s" / "lib" / "protocol_const.py"

spec = spec_from_file_location("protocol_const", CONST_PATH)
assert spec and spec.loader, "Unable to load protocol_const module"
const = module_from_spec(spec)
sys.modules[spec.name] = const
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


def test_opcode_families_provide_names() -> None:
    """Verify opcode_name recognizes masked opcode families."""

    assert const.opcode_name(const.OP_IPCMD_ROW_A) == const.OPNAMES[const.OP_IPCMD_ROW_A]
    assert const.opcode_name(0x0DFF) == "IPCMD_ROW_FF"
    assert const.opcode_name(0xAA3D).startswith("OP_3D_")
    assert const.opcode_name(0xBB5D).startswith("OP_5D_")
