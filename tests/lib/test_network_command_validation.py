"""NetworkCommand refuses what would only fail mid-sync (CR-L2-4)."""

from __future__ import annotations

import pytest

from custom_components.sofabaton_x1s.lib.payloads import NetworkCommand


def test_a_plain_request_still_builds_and_round_trips():
    command = NetworkCommand.http(host="10.0.0.2", port=80, method="POST", path="a",
                                  header="X-Token: abc", content_type="application/json", body="{}")
    assert command.fields["path"] == "/a"
    assert command.fields["header"] == "X-Token: abc"
    assert command.blob  # encodes


@pytest.mark.parametrize("header", ["Content-Type: application/json", "content-length: 3", "Host: 10.0.0.2"])
def test_headers_the_writer_owns_are_refused(header):
    with pytest.raises(ValueError, match="written by the hub's request format"):
        NetworkCommand.http(host="10.0.0.2", port=80, method="POST", path="/a", header=header, body="{}")


def test_a_multi_line_header_is_refused():
    with pytest.raises(ValueError, match="single line"):
        NetworkCommand.http(host="10.0.0.2", port=80, method="GET", path="/a", header="X-A: 1\r\n\r\nX-B: 2")


def test_an_out_of_range_octet_is_refused_at_construction():
    with pytest.raises(ValueError):
        NetworkCommand("wifi_ip", {"host": "10.0.0.256", "port": 80, "method": "GET", "path": "/a",
                                   "header": "", "content_type": "", "body": ""})
