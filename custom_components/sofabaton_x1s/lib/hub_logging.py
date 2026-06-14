# hub_logging.py — per-hub log prefixing and canonical subsystem tags.
# Library-side source of truth; the Home Assistant integration's
# logging_utils.py re-exports these names. Nothing here may import
# outside the library package.
from __future__ import annotations

import logging
import re
from typing import Any

_HUB_LOG_PREFIX_PATTERN = re.compile(r"^\[(?P<entry_id>[^\[\]]+)\]\s+")


class LogTag:
    """Canonical subsystem tags for log-message prefixes.

    Single source of truth for the ``[TAG]`` token that follows the per-hub
    ``[entry_id]`` prefix added by :class:`HubLogger`. Every value is an
    UPPERCASE, bracket-wrapped string so call sites can write the prefix
    directly, e.g. ``log.debug("%s connected", LogTag.TRANSPORT)`` or
    ``log.debug(f"{LogTag.FRAME} ...")``.

    Tags are deliberately UPPERCASE: :func:`extract_hub_log_entry_id` rejects
    an all-caps leading bracket, so a tag is never mistaken for a hub entry id
    when a line carries no ``[entry_id]`` prefix (such lines are treated as
    globally relevant and shown in every hub's view).
    """

    # Transport / wire
    TRANSPORT = "[TRANSPORT]"   # socket bridge connect/disconnect/io (TCP/UDP)
    SEND = "[SEND]"             # outbound frame dispatch to the hub
    WIRE = "[WIRE]"             # full hex frame dumps (gated by the hex-logging switch)
    FRAME = "[FRAME]"           # decoded inbound/outbound frame summaries (family/role/paging)
    PARSE = "[PARSE]"           # frame-decode errors

    # Lifecycle / identity
    PROXY = "[PROXY]"           # proxy lifecycle: enable/disable/stop/hex toggle
    MDNS = "[MDNS]"             # mDNS discovery / advertisement
    HUB = "[HUB]"               # hub identity / name
    BANNER = "[BANNER]"         # connect banner parsing
    STATE = "[STATE]"           # current-activity / connection state changes

    # Command dispatch & acks
    CMD = "[CMD]"               # command queue / dispatch
    ACK = "[ACK]"               # ack waiters / STATUS_ACK classification

    # Catalog read paths
    CATALOG = "[CATALOG]"       # device/activity/button/command catalog requests & parsing
    MACRO = "[MACRO]"           # macro page decode
    REMOTE = "[REMOTE]"         # remote sync/find, idle/device-control queries

    # Write / mutation flows
    CREATE = "[CREATE]"         # device/activity create flow
    RESTORE = "[RESTORE]"       # restore flow
    BACKUP = "[BACKUP]"         # backup serialization / erase
    WIFI = "[WIFI]"             # wifi / virtual-ip device flow & per-step acks
    IR = "[IR]"                 # IR blob play / persist
    ACTIVITY = "[ACTIVITY]"     # activity-assign, favorites, keymap-write ops

    # Subsystems
    DEMUX = "[DEMUX]"           # CALL_ME notify demuxer
    ROKU = "[ROKU]"             # Roku ECP listener
    HINT = "[HINT]"             # diagnostic hints

    @classmethod
    def all(cls) -> tuple[str, ...]:
        """Return every registered tag value."""

        return tuple(
            value
            for name, value in vars(cls).items()
            if not name.startswith("_") and isinstance(value, str)
        )


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
