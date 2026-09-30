"""Export the OpenAPI document: ``python -m sofabaton_server.openapi [path]``.

The committed ``sofabaton-x-server/openapi.json`` is what client
generators consume and what the drift test compares against, so a spec
change is always a reviewed diff. Generated with default settings (no
advertised URL, no root path), so it carries no ``servers`` entry;
a running server adds one when configured.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .app import create_app
from .config import Settings

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "openapi.json"


def build_spec() -> dict:
    app = create_app(Settings(data_dir=Path("data")))
    return app.openapi()


def render(spec: dict) -> str:
    return json.dumps(spec, indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if not args and not (DEFAULT_PATH.parent / "pyproject.toml").is_file():
        # A non-editable install: the default would write into the venv
        # and leave the committed document stale (CR-S1-9).
        print(
            "sofabaton_server is not running from a checkout; pass the path, e.g. "
            "python -m sofabaton_server.openapi sofabaton-x-server/openapi.json "
            "(with PYTHONPATH=sofabaton-x-server/src to build from the checkout)",
            file=sys.stderr,
        )
        return 2
    path = Path(args[0]) if args else DEFAULT_PATH
    path.write_text(render(build_spec()), encoding="utf-8")
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
