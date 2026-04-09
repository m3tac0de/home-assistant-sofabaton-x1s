import logging
from types import SimpleNamespace

from custom_components.sofabaton_x1s.diagnostics import _InMemoryLogHandler
from custom_components.sofabaton_x1s.logging_utils import (
    extract_hub_log_entry_id,
    get_hub_logger,
)
from custom_components.sofabaton_x1s.lib.notify_demuxer import NotifyDemuxer
from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


class _CaptureHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


def test_hub_logger_prefixes_once_and_supports_legacy_placeholder():
    logger = logging.getLogger("tests.hub_logger")
    handler = _CaptureHandler()
    logger.handlers = [handler]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    hub_log = get_hub_logger(logger, "entry-1")
    hub_log.info("[CMD] hello")
    hub_log.info("[%s] [TCP] connected", "entry-1")
    hub_log.info("[entry-1] [ACT] already prefixed")

    assert handler.messages == [
        "[entry-1] [CMD] hello",
        "[entry-1] [TCP] connected",
        "[entry-1] [ACT] already prefixed",
    ]


def test_extract_hub_log_entry_id_only_accepts_canonical_leading_prefix():
    assert extract_hub_log_entry_id("[entry-1] [TCP] connected") == "entry-1"
    assert extract_hub_log_entry_id("[TCP] connected [entry-1]") is None
    assert extract_hub_log_entry_id("plain line") is None


def test_diagnostics_handler_uses_canonical_prefix_for_entry_filtering():
    hass = SimpleNamespace(data={}, loop=SimpleNamespace(call_soon_threadsafe=lambda cb, payload: cb(payload)))
    handler = _InMemoryLogHandler(hass)
    logger = logging.getLogger("tests.diagnostics")

    handler.emit(logger.makeRecord(logger.name, logging.INFO, __file__, 10, "[entry-1] [TCP] connected", (), None))
    handler.emit(logger.makeRecord(logger.name, logging.INFO, __file__, 11, "[TCP] connected [entry-1]", (), None))

    records = handler.get_records()

    assert records[0]["entry_id"] == "entry-1"
    assert records[1]["entry_id"] is None


def test_x1_proxy_logs_with_hub_prefix():
    logger = logging.getLogger("x1proxy")
    previous_handlers = list(logger.handlers)
    previous_level = logger.level
    previous_propagate = logger.propagate
    handler = _CaptureHandler()
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False

    try:
        proxy = X1Proxy(
            "127.0.0.1",
            proxy_enabled=False,
            diag_dump=False,
            diag_parse=False,
            proxy_id="entry-1",
        )
        proxy.set_diag_dump(True)
    finally:
        logger.handlers = previous_handlers
        logger.setLevel(previous_level)
        logger.propagate = previous_propagate

    assert "[entry-1] [PROXY] hex logging enabled" in handler.messages


def test_notify_demuxer_register_logs_with_hub_prefix(monkeypatch):
    logger = logging.getLogger("x1proxy.notify")
    previous_handlers = list(logger.handlers)
    previous_level = logger.level
    previous_propagate = logger.propagate
    handler = _CaptureHandler()
    logger.handlers = [handler]
    logger.setLevel(logging.INFO)
    logger.propagate = False

    demuxer = NotifyDemuxer()
    monkeypatch.setattr(demuxer, "_ensure_running_locked", lambda: None)

    try:
        demuxer.register_proxy(
            proxy_id="entry-1",
            real_hub_ip="192.168.2.100",
            mdns_txt={"MAC": "AA:BB:CC:DD:EE:FF"},
            call_me_port=8102,
            call_me_cb=lambda *_args: None,
        )
    finally:
        logger.handlers = previous_handlers
        logger.setLevel(previous_level)
        logger.propagate = previous_propagate

    assert any(message.startswith("[entry-1] [DEMUX] registered proxy") for message in handler.messages)
