"""The shared app-discovery demuxer closes its UDP socket once the last
proxy unregisters, so a server with the app proxy off on every hub holds
no app listener (and opens it again for the next proxy)."""

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
    name = "sofabaton_demux_test_pkg"
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
notify_demuxer = importlib.import_module(f"{_pkg.__name__}.notify_demuxer")

TXT = {"MAC": "E2:6A:44:86:1B:45", "HVER": "3"}


def _register(demux, proxy_id: str) -> None:
    demux.register_proxy(proxy_id, "192.168.1.50", TXT, 8200, lambda *_: None)


def test_socket_closes_with_the_last_registration_and_reopens() -> None:
    demux = notify_demuxer.NotifyDemuxer(listen_port=0)   # ephemeral port
    try:
        _register(demux, "hub-a")
        _register(demux, "hub-b")
        assert demux._sock is not None

        demux.unregister_proxy("hub-a")
        assert demux._sock is not None                     # hub-b still offered

        demux.unregister_proxy("hub-b")
        assert demux._sock is None and demux._thr is None  # nothing listens

        _register(demux, "hub-a")
        assert demux._sock is not None
    finally:
        demux.shutdown()
    assert demux._sock is None
