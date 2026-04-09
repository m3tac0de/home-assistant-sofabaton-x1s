from __future__ import annotations

import logging
import re
from typing import Any

_HUB_LOG_PREFIX_PATTERN = re.compile(r"^\[(?P<entry_id>[^\[\]]+)\]\s+")


def extract_hub_log_entry_id(message: str) -> str | None:
    """Return the canonical hub entry id from the start of a log message."""

    match = _HUB_LOG_PREFIX_PATTERN.match(str(message or ""))
    if not match:
        return None
    candidate = str(match.group("entry_id") or "").strip()
    if re.fullmatch(r"[A-Z_]+", candidate):
        return None
    return candidate or None


def format_hub_log_message(entry_id: str, message: str) -> str:
    """Prepend the canonical hub prefix unless it is already present."""

    text = str(message or "")
    normalized_entry_id = str(entry_id or "").strip()
    if not normalized_entry_id:
        return text

    existing_entry_id = extract_hub_log_entry_id(text)
    if existing_entry_id == normalized_entry_id:
        return text

    return f"[{normalized_entry_id}] {text}"


class HubLogger:
    """Prefix log lines with the canonical hub entry id."""

    def __init__(self, logger: logging.Logger, entry_id: str) -> None:
        self._logger = logger
        self._entry_id = str(entry_id or "").strip()

    def isEnabledFor(self, level: int) -> bool:
        return self._logger.isEnabledFor(level)

    def log(self, level: int, message: str, *args: Any, **kwargs: Any) -> None:
        normalized_message = str(message or "")
        normalized_args = args

        # Preserve existing call sites that still use "[%s] ..." with the
        # entry id as the first formatting argument.
        if (
            normalized_message.startswith("[%s] ")
            and normalized_args
            and str(normalized_args[0] or "").strip() == self._entry_id
        ):
            normalized_message = normalized_message[5:]
            normalized_args = normalized_args[1:]

        self._logger.log(
            level,
            format_hub_log_message(self._entry_id, normalized_message),
            *normalized_args,
            **kwargs,
        )

    def debug(self, message: str, *args: Any, **kwargs: Any) -> None:
        self.log(logging.DEBUG, message, *args, **kwargs)

    def info(self, message: str, *args: Any, **kwargs: Any) -> None:
        self.log(logging.INFO, message, *args, **kwargs)

    def warning(self, message: str, *args: Any, **kwargs: Any) -> None:
        self.log(logging.WARNING, message, *args, **kwargs)

    def error(self, message: str, *args: Any, **kwargs: Any) -> None:
        self.log(logging.ERROR, message, *args, **kwargs)

    def exception(self, message: str, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("exc_info", True)
        self.log(logging.ERROR, message, *args, **kwargs)


def get_hub_logger(logger: logging.Logger, entry_id: str) -> HubLogger:
    return HubLogger(logger, entry_id)
