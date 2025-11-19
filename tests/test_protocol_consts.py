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
