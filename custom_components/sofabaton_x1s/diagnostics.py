from __future__ import annotations

"""Support for Home Assistant diagnostics downloads."""

import logging
import re
import socket
from collections import deque
from typing import Any, Callable, Iterable
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from .const import CONF_HOST, CONF_MAC, DOMAIN
from .logging_utils import extract_hub_log_entry_id

_LOGGER = logging.getLogger(__name__)

_MAX_LOG_RECORDS = 5000
_MAX_LOG_CHARACTERS = 512 * 1024  # ~512KB cap to avoid long-term growth
_LOG_FORMAT = "%(asctime)s %(name)s %(levelname)s: %(message)s"
_LOGGER_NAMES = (
    "custom_components.sofabaton_x1s",
    "x1proxy",
)
_IP_ADDRESS_PATTERN = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")
_MAC_ADDRESS_PATTERN = re.compile(r"\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b")
_HOST_KEYS = {CONF_HOST.lower()}
_MAC_KEYS = {CONF_MAC.lower()}
class _InMemoryLogHandler(logging.Handler):
    """Keep a bounded list of log lines for diagnostics export."""

    def __init__(self, hass: HomeAssistant) -> None:
        super().__init__()
        self._hass = hass
        self._records: deque[dict[str, Any]] = deque(maxlen=_MAX_LOG_RECORDS)
        self._current_chars = 0
        self._subscribers: dict[object, tuple[str, Callable[[dict[str, Any]], None]]] = {}
        self.setFormatter(logging.Formatter(_LOG_FORMAT))

    def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover - thin wrapper
        try:
            if len(self._records) == self._records.maxlen:
                removed = self._records.popleft()
                self._current_chars -= len(str(removed.get("line", "")))

            formatted = self.format(record)
            formatted_length = len(formatted)
            payload = {
                "line": formatted,
                "level": str(record.levelname or ""),
                "logger": str(record.name or ""),
                "entry_id": extract_hub_log_entry_id(record.getMessage()),
            }
            self._records.append(payload)
            self._current_chars += formatted_length

            while self._current_chars > _MAX_LOG_CHARACTERS and self._records:
                removed = self._records.popleft()
                self._current_chars -= len(str(removed.get("line", "")))

            entry_id = payload.get("entry_id")
            if entry_id:
                for subscribed_entry_id, callback_fn in list(self._subscribers.values()):
                    if subscribed_entry_id != entry_id:
                        continue
                    self._hass.loop.call_soon_threadsafe(callback_fn, dict(payload))
        except Exception:  # noqa: BLE001 - defensive, diagnostics should never break logging
            _LOGGER.debug("Failed to record diagnostic log", exc_info=True)

    def get_records(self) -> list[dict[str, Any]]:
        return list(self._records)

    def add_subscriber(
        self, token: object, entry_id: str, callback_fn: Callable[[dict[str, Any]], None]
    ) -> None:
        self._subscribers[token] = (entry_id, callback_fn)

    def remove_subscriber(self, token: object) -> None:
        self._subscribers.pop(token, None)

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

    handler = _InMemoryLogHandler(hass)
    domain_data["_diag_handler"] = handler
    domain_data.setdefault("_logger_state", {})
    domain_data.setdefault("_hex_capture_entries", set())
    domain_data.setdefault("_live_log_subscribers", 0)
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


def _redact_value(value: Any) -> Any:
    """Scrub IP and MAC addresses from a value."""

    if isinstance(value, str):
        value = _IP_ADDRESS_PATTERN.sub("[REDACTED_IP]", value)
        value = _MAC_ADDRESS_PATTERN.sub("[REDACTED_MAC]", value)

    return value


def _redact_data_structure(data: Any) -> Any:
    """Remove non-essential diagnostic details and redact sensitive fields."""

    if isinstance(data, dict):
        redacted: dict[Any, Any] = {}
        for key, value in data.items():
            key_lower = str(key).lower()

            if key_lower == "custom_components":
                continue

            if key_lower in _HOST_KEYS:
                redacted[key] = "[REDACTED_IP]"
                continue

            if key_lower in _MAC_KEYS:
                redacted[key] = "[REDACTED_MAC]"
                continue

            redacted[key] = _redact_data_structure(value)

        return redacted

    if isinstance(data, (list, tuple)):
        return type(data)(_redact_data_structure(item) for item in data)

    if isinstance(data, set):
        return [_redact_data_structure(item) for item in data]

    return _redact_value(data)


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

    if active_entries or int(domain_data.get("_live_log_subscribers", 0)) > 0:
        return

    _detach_capture(hass)


def _sanitize_log_record(payload: dict[str, Any], entry: ConfigEntry) -> dict[str, Any]:
    line = _sanitize_log_lines([str(payload.get("line", ""))], entry)[0]
    return {
        "line": line,
        "level": str(payload.get("level", "")),
        "logger": str(payload.get("logger", "")),
        "entry_id": str(payload.get("entry_id", "") or ""),
    }


async def async_get_hub_log_lines(
    hass: HomeAssistant, entry: ConfigEntry, *, limit: int = 250
) -> list[dict[str, Any]]:
    handler = _get_handler(hass)
    entry_id = str(entry.entry_id)
    records = [
        _sanitize_log_record(payload, entry)
        for payload in handler.get_records()
        if str(payload.get("entry_id", "")) == entry_id
    ]
    if limit > 0:
        return records[-limit:]
    return records


@callback
def async_subscribe_hub_log_lines(
    hass: HomeAssistant,
    entry: ConfigEntry,
    callback_fn: Callable[[dict[str, Any]], None],
) -> Callable[[], None]:
    domain_data = hass.data.setdefault(DOMAIN, {})
    handler = _get_handler(hass)
    token = object()
    entry_id = str(entry.entry_id)

    @callback
    def _forward(payload: dict[str, Any]) -> None:
        callback_fn(_sanitize_log_record(payload, entry))

    live_count = int(domain_data.get("_live_log_subscribers", 0)) + 1
    domain_data["_live_log_subscribers"] = live_count
    _attach_capture(hass)
    handler.add_subscriber(token, entry_id, _forward)

    @callback
    def _unsubscribe() -> None:
        handler.remove_subscriber(token)
        next_count = max(0, int(domain_data.get("_live_log_subscribers", 0)) - 1)
        domain_data["_live_log_subscribers"] = next_count
        active_entries: set[str] = domain_data.get("_hex_capture_entries", set())
        if not active_entries and next_count == 0:
            _detach_capture(hass)

    return _unsubscribe


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
        (_IP_ADDRESS_PATTERN, "[REDACTED_IP]"),
        (_MAC_ADDRESS_PATTERN, "[REDACTED_MAC]"),
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
        "data": _redact_data_structure(dict(entry.data)),
        "options": _redact_data_structure(dict(entry.options)),
    }

    # Collect any cached hub information without exposing sensitive fields
    hub = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    hub_state: dict[str, Any] = {}
    if hub is not None:
        hub_state = _redact_data_structure(
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
            }
        )

    logs = [record["line"] for record in await async_get_hub_log_lines(hass, entry, limit=0)]

    return {
        "entry": entry_dict,
        "hub": hub_state,
        "logs": logs,
    }
