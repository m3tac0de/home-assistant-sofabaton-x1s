"""Shared helpers for live-hub bench validation sessions.

Method and validated results: docs/protocol/live-hub-testing.md.
Scripts here connect straight to a hub on the LAN via the standalone
library (no Home Assistant install needed) and log every frame.

Run with a project venv python, e.g.:

    .venv-py313\\Scripts\\python.exe scripts\\hub-bench\\bench_01_recon.py <ip> <X1|X1S|X2> <tag>

Artifacts (json baselines + frame logs) land next to the scripts in
``out/`` — gitignored working data, regenerate per session.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BENCH_DIR = Path(__file__).resolve().parent / "out"
LOG_DIR = BENCH_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

# Load the standalone library package under an alias, without importing the
# integration package (which needs Home Assistant) or putting the component
# dir on sys.path (its platform modules would shadow stdlib names like
# ``select``).
import importlib.util  # noqa: E402

_LIB_DIR = REPO / "custom_components" / "sofabaton_x1s" / "lib"
_spec = importlib.util.spec_from_file_location(
    "x1slib", _LIB_DIR / "__init__.py", submodule_search_locations=[str(_LIB_DIR)],
)
_lib = importlib.util.module_from_spec(_spec)
sys.modules["x1slib"] = _lib
_spec.loader.exec_module(_lib)

from x1slib.x1_proxy import X1Proxy  # noqa: E402


def setup_logging(name: str) -> Path:
    log_path = LOG_DIR / f"{name}-{time.strftime('%H%M%S')}.log"
    handler = logging.FileHandler(log_path, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.DEBUG)
    root.addHandler(handler)
    return log_path


def connect(host: str, hub_version: str, *, timeout: float = 60.0) -> X1Proxy:
    proxy = X1Proxy(
        host,
        hub_version=hub_version,
        proxy_enabled=False,
        diag_dump=True,
        diag_parse=True,
    )
    proxy.start()
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proxy.can_issue_commands():
            return proxy
        time.sleep(0.5)
    proxy.stop()
    raise RuntimeError(f"hub {host} not controllable within {timeout}s")


def save_json(name: str, payload) -> Path:
    path = BENCH_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return path
