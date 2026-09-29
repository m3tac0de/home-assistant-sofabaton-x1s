"""The Logs-tab capture must not cut the integration off from HA's log."""

from __future__ import annotations

import logging
from types import SimpleNamespace

from custom_components.sofabaton_x1s import diagnostics
from custom_components.sofabaton_x1s.const import DOMAIN


class _Collect(logging.Handler):
    def __init__(self) -> None:
        super().__init__(logging.NOTSET)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def _with_root_handler(level: int):
    root = logging.getLogger()
    handler = _Collect()
    old_level = root.level
    root.addHandler(handler)
    root.setLevel(level)
    return root, handler, old_level


def test_capture_keeps_warnings_flowing_to_home_assistant_without_debug_flood():
    """CR-H3-1: after setup, WARNING/ERROR from the integration and the
    in-tree library still reach HA's root handlers (home-assistant.log,
    system log); DEBUG goes to the Logs-tab buffer only."""
    root, root_handler, old_level = _with_root_handler(logging.INFO)
    hass = SimpleNamespace(data={}, loop=None)
    try:
        diagnostics.async_setup_diagnostics(hass)
        integration = logging.getLogger("custom_components.sofabaton_x1s.roku_listener")
        library = logging.getLogger("x1proxy.transport")

        integration.error("listener failed on port 8060")
        library.warning("dropping unrecognised hub connection")
        integration.debug("frame bytes 01 02 03")

        seen = [r.getMessage() for r in root_handler.records]
        assert "listener failed on port 8060" in seen
        assert "dropping unrecognised hub connection" in seen
        assert "frame bytes 01 02 03" not in seen, "DEBUG must not flood HA's log"

        buffered = [r["line"] for r in hass.data[DOMAIN]["_diag_handler"].get_records()]
        assert any("frame bytes 01 02 03" in line for line in buffered)
        assert any("listener failed on port 8060" in line for line in buffered)
        # Exactly once each at the root: no double delivery.
        assert seen.count("listener failed on port 8060") == 1
    finally:
        diagnostics.async_teardown_diagnostics(hass)
        root.removeHandler(root_handler)
        root.setLevel(old_level)


def test_teardown_restores_logger_state_and_removes_the_forwarder():
    root, root_handler, old_level = _with_root_handler(logging.INFO)
    hass = SimpleNamespace(data={}, loop=None)
    logger = logging.getLogger("custom_components.sofabaton_x1s")
    before = (logger.level, logger.propagate, list(logger.handlers))
    try:
        diagnostics.async_setup_diagnostics(hass)
        diagnostics.async_teardown_diagnostics(hass)
        assert (logger.level, logger.propagate, list(logger.handlers)) == before
    finally:
        root.removeHandler(root_handler)
        root.setLevel(old_level)
