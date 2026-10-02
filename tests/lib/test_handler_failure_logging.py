"""A frame-handler failure stays isolated but is logged once at WARNING."""

from __future__ import annotations

import logging

from custom_components.sofabaton_x1s.lib.x1_proxy import X1Proxy


class _Boom:
    pass


def test_first_handler_failure_warns_and_repeats_drop_to_debug(caplog) -> None:
    proxy = X1Proxy(
        "127.0.0.1", proxy_udp_port=0, proxy_enabled=False, diag_dump=False, diag_parse=False
    )
    caplog.set_level(logging.DEBUG)

    for _ in range(3):
        proxy._log_handler_failure(_Boom(), 0x0D0B, "H→A", IndexError("short payload"))
    proxy._log_handler_failure(_Boom(), 0x0D0B, "H→A", KeyError("x"))

    failures = [r for r in caplog.records if "_Boom failed" in r.getMessage()]
    assert [r.levelno for r in failures] == [
        logging.WARNING,
        logging.DEBUG,
        logging.DEBUG,
        logging.WARNING,
    ]
    assert failures[0].exc_info[1] is not None
