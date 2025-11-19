"""Regression tests for the CLI helper module."""

from importlib import import_module
from pathlib import Path
import sys
import types

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def test_cli_importable_via_package_path() -> None:
    """The CLI should be importable as part of the HA custom component package."""

    _ensure_stub_package("custom_components", ROOT / "custom_components")
    _ensure_stub_package(
        "custom_components.sofabaton_x1s",
        ROOT / "custom_components" / "sofabaton_x1s",
    )
    _ensure_stub_package(
        "custom_components.sofabaton_x1s.lib",
        ROOT / "custom_components" / "sofabaton_x1s" / "lib",
    )

    cli = import_module("custom_components.sofabaton_x1s.lib.cli")

    assert cli.resolve_button("OK") == cli.ButtonName.OK
    assert cli.resolve_button(f"0x{cli.ButtonName.OK:02X}") == cli.ButtonName.OK


def _ensure_stub_package(name: str, path: Path) -> None:
    if name in sys.modules:
        return
    module = types.ModuleType(name)
    module.__path__ = [str(path)]
    sys.modules[name] = module
