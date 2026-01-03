import pytest

from custom_components.sofabaton_x1s.config_flow import _prepare_discovered_hub
from custom_components.sofabaton_x1s.const import MDNS_SERVICE_TYPES
from homeassistant.helpers.service_info.zeroconf import ZeroconfServiceInfo


def _service_info(service_type: str, **kwargs) -> ZeroconfServiceInfo:
    return ZeroconfServiceInfo(
        host=kwargs.get("host", "1.2.3.4"),
        port=kwargs.get("port", 8102),
        name=kwargs.get("name", "X1-HUB._x1hub._udp.local."),
        properties=kwargs.get("properties", {}),
        type=service_type,
    )


@pytest.mark.parametrize(
    ("service_type", "hver", "expected_version"),
    [
        (MDNS_SERVICE_TYPES[0], "1", "X1"),
        (MDNS_SERVICE_TYPES[1], "3", "X2"),
    ],
)
def test_prepare_discovered_hub_accepts_supported_service_types(
    service_type: str, hver: str, expected_version: str
) -> None:
    info = _service_info(
        service_type,
        properties={
            "NAME": b"Sofa Hub",
            "MAC": b"aa:bb:cc:dd:ee:ff",
            "HVER": hver.encode(),
        },
    )

    result = _prepare_discovered_hub(info)

    assert result is not None
    assert result["name"] == "Sofa Hub"
    assert result["mac"] == "aa:bb:cc:dd:ee:ff"
    assert result["host"] == "1.2.3.4"
    assert result["port"] == 8102
    assert result["props"]["NAME"] == "Sofa Hub"
    assert result["service_type"] == service_type
    assert result["version"] == expected_version


def test_prepare_discovered_hub_rejects_unsupported_service_type() -> None:
    result = _prepare_discovered_hub(
        _service_info(
            "_unsupported._udp.local.",
            properties={"NAME": "Hub"},
        )
    )

    assert result is None


def test_prepare_discovered_hub_rejects_proxy_advertisement() -> None:
    result = _prepare_discovered_hub(
        _service_info(
            MDNS_SERVICE_TYPES[0],
            properties={"HA_PROXY": "1"},
        )
    )

    assert result is None
