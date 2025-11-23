from __future__ import annotations

"""Support for Home Assistant diagnostics downloads."""

import logging
import re
import socket
from collections import deque
from typing import Any, Iterable

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import CONF_HOST, CONF_MAC, CONF_NAME, DOMAIN

_LOGGER = logging.getLogger(__name__)

SENSITIVE_FIELDS = {CONF_HOST, CONF_MAC, CONF_NAME}
_MAX_LOG_RECORDS = 5000
_MAX_LOG_CHARACTERS = 512 * 1024  # ~512KB cap to avoid long-term growth
_LOG_FORMAT = "%(asctime)s %(name)s %(levelname)s: %(message)s"
_LOGGER_NAMES = (
    "custom_components.sofabaton_x1s",
    "x1proxy",
)


class _InMemoryLogHandler(logging.Handler):
    """Keep a bounded list of log lines for diagnostics export."""

    def __init__(self) -> None:
        super().__init__()
        self._records: deque[str] = deque(maxlen=_MAX_LOG_RECORDS)
        self._current_chars = 0
        self.setFormatter(logging.Formatter(_LOG_FORMAT))

    def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover - thin wrapper
        try:
            if len(self._records) == self._records.maxlen:
                removed = self._records.popleft()
                self._current_chars -= len(removed)

            formatted = self.format(record)
            formatted_length = len(formatted)
            self._records.append(formatted)
            self._current_chars += formatted_length

            while self._current_chars > _MAX_LOG_CHARACTERS and self._records:
                removed = self._records.popleft()
                self._current_chars -= len(removed)
        except Exception:  # noqa: BLE001 - defensive, diagnostics should never break logging
            _LOGGER.debug("Failed to record diagnostic log", exc_info=True)

    def get_records(self) -> list[str]:
        return list(self._records)

    def detach(self) -> None:
        """Remove this handler from the loggers we attached to."""

        for logger_name in _LOGGER_NAMES:
            logger = logging.getLogger(logger_name)
            logger.removeHandler(self)


def _get_handler(hass: HomeAssistant) -> _InMemoryLogHandler:
    domain_data = hass.data.setdefault(DOMAIN, {})
    handler: _InMemoryLogHandler | None = domain_data.get("_diag_handler")
    if handler:
        return handler

    handler = _InMemoryLogHandler()
    domain_data["_diag_handler"] = handler
    domain_data.setdefault("_logger_state", {})
    domain_data.setdefault("_hex_capture_entries", set())
    return handler


def _should_route_to_home_assistant(logger: logging.Logger) -> bool:
    """Detect whether the user asked for debug logging to the main log."""

    return logger.getEffectiveLevel() <= logging.DEBUG


def _attach_capture(hass: HomeAssistant) -> None:
    """Attach the in-memory handler and adjust logger settings."""

    domain_data = hass.data.setdefault(DOMAIN, {})
    handler = _get_handler(hass)
    logger_state: dict[str, tuple[int, bool]] = domain_data.setdefault("_logger_state", {})
    first_attach = not logger_state

    for logger_name in _LOGGER_NAMES:
        logger = logging.getLogger(logger_name)
        if first_attach:
            logger_state[logger_name] = (logger.level, logger.propagate)

        if handler not in logger.handlers:
            logger.addHandler(handler)

        if _should_route_to_home_assistant(logger):
            # User wants normal/debug logging to flow to HA; honor their choice.
            continue

        logger.setLevel(logging.DEBUG)
        logger.propagate = False


def async_enable_hex_logging_capture(hass: HomeAssistant, entry_id: str) -> None:
    """Start capturing logs while hex logging is enabled."""

    domain_data = hass.data.setdefault(DOMAIN, {})
    active_entries: set[str] = domain_data.setdefault("_hex_capture_entries", set())
    if entry_id in active_entries:
        return

    active_entries.add(entry_id)
    _attach_capture(hass)


def _detach_capture(hass: HomeAssistant) -> None:
    """Remove our handlers and restore logger state."""

    domain_data = hass.data.get(DOMAIN, {})
    handler: _InMemoryLogHandler | None = domain_data.get("_diag_handler")
    logger_state: dict[str, tuple[int, bool]] = domain_data.get("_logger_state", {})
    if handler:
        handler.detach()

    for logger_name, (level, propagate) in logger_state.items():
        logger = logging.getLogger(logger_name)
        logger.setLevel(level)
        logger.propagate = propagate

    logger_state.clear()


def async_disable_hex_logging_capture(hass: HomeAssistant, entry_id: str) -> None:
    """Stop capturing logs if no entries have hex logging enabled."""

    domain_data = hass.data.get(DOMAIN, {})
    active_entries: set[str] = domain_data.get("_hex_capture_entries", set())
    active_entries.discard(entry_id)

    if active_entries:
        return

    _detach_capture(hass)


def async_teardown_diagnostics(hass: HomeAssistant) -> None:
    """Detach diagnostic logging when the integration is fully removed."""

    domain_data = hass.data.get(DOMAIN, {})
    _detach_capture(hass)
    domain_data.pop("_diag_handler", None)
    domain_data.pop("_logger_state", None)
    domain_data.pop("_hex_capture_entries", None)


def async_setup_diagnostics(hass: HomeAssistant) -> None:
    """Ensure our in-memory log handler is registered once."""

    if hass.data.get(DOMAIN, {}).get("_diag_handler"):
        return

    handler = _get_handler(hass)
    _LOGGER.debug("Diagnostics log handler registered: %s", handler)


def _sanitize_log_lines(lines: Iterable[str], entry: ConfigEntry) -> list[str]:
    """Remove IP/hostname details from log lines."""

    host = entry.data.get(CONF_HOST)
    hostname = socket.gethostname()
    patterns: list[tuple[re.Pattern[str], str]] = [
        (re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b"), "[REDACTED_IP]"),
    ]

    if isinstance(host, str) and host:
        patterns.append((re.compile(re.escape(host), re.IGNORECASE), "[REDACTED_HOST]"))
    if hostname:
        patterns.append((re.compile(re.escape(hostname), re.IGNORECASE), "[REDACTED_HOSTNAME]"))

    sanitized: list[str] = []
    for line in lines:
        cleaned = line
        for pattern, replacement in patterns:
            cleaned = pattern.sub(replacement, cleaned)
        sanitized.append(cleaned)

    return sanitized


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: ConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""

    handler = _get_handler(hass)

    entry_dict = {
        "data": async_redact_data(entry.data, SENSITIVE_FIELDS),
        "options": async_redact_data(entry.options, SENSITIVE_FIELDS),
    }

    # Collect any cached hub information without exposing sensitive fields
    hub = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    hub_state: dict[str, Any] = {}
    if hub is not None:
        hub_state = async_redact_data(
            {
                "name": getattr(hub, "name", None),
                "host": getattr(hub, "host", None),
                "port": getattr(hub, "port", None),
                "mac": getattr(hub, "mac", None),
                "proxy_enabled": getattr(hub, "proxy_enabled", None),
                "hex_logging_enabled": getattr(hub, "hex_logging_enabled", None),
                "activities": getattr(hub, "activities", None),
                "devices": getattr(hub, "devices", None),
                "current_activity": getattr(hub, "current_activity", None),
                "client_connected": getattr(hub, "client_connected", None),
                "hub_connected": getattr(hub, "hub_connected", None),
            },
            SENSITIVE_FIELDS,
        )

    logs = _sanitize_log_lines(handler.get_records(), entry)

    return {
        "entry": entry_dict,
        "hub": hub_state,
        "logs": logs,
    }
