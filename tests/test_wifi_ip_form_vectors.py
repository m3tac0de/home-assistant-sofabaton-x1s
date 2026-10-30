"""The wifi_ip payload form's records against the library codec.

tests/fixtures/wifi-ip-form-vectors.json is consumed by BOTH this suite and
tests/frontend/wifi-ip-form.test.ts: the frontend builds each expected record
from the form's drafts, and here every expected record (and every stored
original) must survive the round-trip the sync and restore paths demand
before a re-encoded payload goes near the hub (``_edited_command_data_hex``).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

ensure_stub_package("custom_components", ROOT / "custom_components")
ensure_stub_package(
    "custom_components.sofabaton_x1s", ROOT / "custom_components" / "sofabaton_x1s"
)
ensure_stub_package(
    "custom_components.sofabaton_x1s.lib",
    ROOT / "custom_components" / "sofabaton_x1s" / "lib",
)

from custom_components.sofabaton_x1s.lib.blob_decoders import (  # noqa: E402
    encode_decoded_blob,
    try_decode_blob,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (  # noqa: E402
    DEVICE_CLASS_CODE_WIFI_IP,
    WIFI_URL_RECORD_CODE,
)
from custom_components.sofabaton_x1s.lib.proxy_activity_sync import (  # noqa: E402
    _wifi_ip_record_type,
)

_VECTORS = json.loads(
    (Path(__file__).resolve().parent / "fixtures" / "wifi-ip-form-vectors.json").read_text(
        encoding="utf-8"
    )
)["vectors"]


def _round_trips(record: dict) -> None:
    decoded = {"class": "wifi_ip", "fields": record["fields"], "trailer_hex": record["trailer_hex"]}
    verify = try_decode_blob("wifi_ip", encode_decoded_blob(decoded))
    assert verify is not None
    assert verify["fields"] == record["fields"]
    assert verify["trailer_hex"] == record["trailer_hex"]


@pytest.mark.parametrize(
    "vector", [v for v in _VECTORS if "expected" in v], ids=lambda v: v["name"]
)
def test_form_record_round_trips(vector):
    _round_trips(vector["expected"])


@pytest.mark.parametrize(
    "vector", [v for v in _VECTORS if v.get("original_stored", True)], ids=lambda v: v["name"]
)
def test_stored_original_is_what_the_decoder_emits(vector):
    _round_trips(vector["original"])


@pytest.mark.parametrize(
    "vector", [v for v in _VECTORS if "expected" in v], ids=lambda v: v["name"]
)
def test_form_record_names_its_code_type(vector):
    fields = vector["expected"]["fields"]
    expected = WIFI_URL_RECORD_CODE if "url" in fields else DEVICE_CLASS_CODE_WIFI_IP
    assert _wifi_ip_record_type({"decoded": {"class": "wifi_ip", "fields": fields}}) == expected
