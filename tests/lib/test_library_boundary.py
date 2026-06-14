"""Boundary lint for the standalone library package.

custom_components/sofabaton_x1s/lib is published to PyPI as the
standalone ``sofapython`` package (see docs/sofapython_library_plan.md).
For the same files to work both in-tree and as an installed wheel, the
package must stay self-contained:

* no relative imports that reach above the package (``from ..`` etc.),
* no Home Assistant imports,
* no third-party imports beyond the declared dependency (``zeroconf``).

This test walks every module's AST so a violation fails CI with the
exact file/line instead of surfacing as an ImportError in a consumer.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

LIB_DIR = (
    Path(__file__).resolve().parents[2]
    / "custom_components"
    / "sofabaton_x1s"
    / "lib"
)

# Third-party modules the published package declares as dependencies.
ALLOWED_THIRD_PARTY = {"zeroconf"}

STDLIB = set(sys.stdlib_module_names)


def _violations_for(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    problems: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".")[0]
                if root not in STDLIB and root not in ALLOWED_THIRD_PARTY:
                    problems.append(
                        f"{path.name}:{node.lineno} imports non-allowlisted module {alias.name!r}"
                    )
        elif isinstance(node, ast.ImportFrom):
            if node.level >= 2:
                problems.append(
                    f"{path.name}:{node.lineno} reaches above the package "
                    f"(from {'.' * node.level}{node.module or ''} import ...)"
                )
            elif node.level == 0 and node.module:
                root = node.module.split(".")[0]
                if root not in STDLIB and root not in ALLOWED_THIRD_PARTY:
                    problems.append(
                        f"{path.name}:{node.lineno} imports non-allowlisted module {node.module!r}"
                    )
    return problems


def test_lib_package_is_self_contained() -> None:
    assert LIB_DIR.is_dir(), f"library package not found at {LIB_DIR}"
    problems: list[str] = []
    for path in sorted(LIB_DIR.glob("*.py")):
        problems.extend(_violations_for(path))
    assert not problems, (
        "library boundary violations (lib/ must stay publishable as the "
        "standalone sofapython package):\n" + "\n".join(problems)
    )


def test_lib_package_imports_without_home_assistant() -> None:
    """The package must be importable standalone (as the wheel would be)."""

    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "sofapython_boundary_check",
        LIB_DIR / "__init__.py",
        submodule_search_locations=[str(LIB_DIR)],
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
        # Touch the heavyweight modules to prove their import chains
        # resolve inside the package only.
        import importlib

        for name in ("x1_proxy", "cli", "hub_listener", "proxy_restore", "discovery"):
            importlib.import_module(f"{spec.name}.{name}")
    finally:
        for key in [k for k in sys.modules if k.startswith(spec.name)]:
            del sys.modules[key]
