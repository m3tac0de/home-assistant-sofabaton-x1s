import asyncio
from types import SimpleNamespace
import pytest

from custom_components.sofabaton_x1s.config_flow import _prepare_discovered_hub
from custom_components.sofabaton_x1s.config_flow import ConfigFlow
from custom_components.sofabaton_x1s.const import (
    CONF_ENABLE_X2_DISCOVERY,
    CONF_MDNS_VERSION,
    HUB_VERSION_X1,
    HUB_VERSION_X2,
    DOMAIN,
    MDNS_SERVICE_TYPES,
    format_hub_entry_title,
)
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


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)

def _flow_with_x2_enabled(enabled: bool) -> ConfigFlow:
    flow = ConfigFlow()
    flow.hass = SimpleNamespace(data={DOMAIN: {"config": {CONF_ENABLE_X2_DISCOVERY: enabled}}})
    flow.context = {}
    return flow


def test_manual_flow_prompts_for_hub_version() -> None:
    flow = _flow_with_x2_enabled(False)

    result = _run(flow.async_step_manual())

    assert result["type"] == "form"
    assert CONF_MDNS_VERSION in result["data_schema"].schema


def test_manual_flow_includes_x2_when_discovery_disabled() -> None:
    flow = _flow_with_x2_enabled(False)

    result = _run(flow.async_step_manual())

    version_options = result["data_schema"].schema[CONF_MDNS_VERSION][0]
    assert HUB_VERSION_X2 in version_options


def test_manual_flow_persists_selected_hub_version() -> None:
    flow = _flow_with_x2_enabled(False)

    _run(flow.async_step_manual({
        "name": "Manual Hub",
        "host": "1.2.3.4",
        CONF_MDNS_VERSION: HUB_VERSION_X2,
    }))

    result = _run(flow.async_step_ports({
        "proxy_udp_port": 8000,
        "hub_listen_base": 8200,
    }))

    assert result["type"] == "create_entry"
    assert result["data"][CONF_MDNS_VERSION] == HUB_VERSION_X2
    assert result["options"][CONF_MDNS_VERSION] == HUB_VERSION_X2


def test_zeroconf_x2_aborts_when_disabled() -> None:
    flow = _flow_with_x2_enabled(False)

    result = _run(
        flow.async_step_zeroconf(
            _service_info(
                MDNS_SERVICE_TYPES[1],
                properties={
                    "NAME": b"Sofa Hub",
                    "MAC": b"aa:bb:cc:dd:ee:ff",
                    "HVER": b"3",
                },
            )
        )
    )

    assert result["type"] == "abort"
    assert result["reason"] == "x2_disabled"


def test_zeroconf_x2_prompts_when_enabled() -> None:
    flow = _flow_with_x2_enabled(True)

    result = _run(
        flow.async_step_zeroconf(
            _service_info(
                MDNS_SERVICE_TYPES[1],
                properties={
                    "NAME": b"Sofa Hub",
                    "MAC": b"aa:bb:cc:dd:ee:ff",
                    "HVER": b"3",
                },
            )
        )
    )

    assert result["type"] == "form"
    assert result["step_id"] == "zeroconf_confirm"


def test_manual_flow_formats_entry_title_with_version_host_and_mac() -> None:
    flow = _flow_with_x2_enabled(False)

    _run(flow.async_step_manual({
        "name": "Manual Hub",
        "host": "192.168.2.181",
        CONF_MDNS_VERSION: HUB_VERSION_X2,
    }))

    result = _run(flow.async_step_ports({
        "proxy_udp_port": 8000,
        "hub_listen_base": 8200,
    }))

    assert result["type"] == "create_entry"
    assert result["title"] == format_hub_entry_title(
        HUB_VERSION_X2,
        "192.168.2.181",
        result["data"]["mac"],
    )


def test_format_hub_entry_title_defaults_unknown_values() -> None:
    assert format_hub_entry_title(None, None, None) == "Sofabaton X1 (unknown / unknown)"


def test_options_flow_syncs_shared_ports_to_all_hubs() -> None:
    flow = ConfigFlow.async_get_options_flow(
        SimpleNamespace(
            entry_id="entry-1",
            data={"name": "Hub 1"},
            options={
                "proxy_udp_port": 8102,
                "hub_listen_base": 8200,
                "roku_listen_port": 8060,
            },
        )
    )

    entry_one = SimpleNamespace(
        entry_id="entry-1",
        data={"name": "Hub 1"},
        options={
            "proxy_udp_port": 8102,
            "hub_listen_base": 8200,
            "roku_listen_port": 8060,
            "other": "one",
        },
    )
    entry_two = SimpleNamespace(
        entry_id="entry-2",
        data={"name": "Hub 2"},
        options={
            "proxy_udp_port": 9999,
            "hub_listen_base": 9200,
            "roku_listen_port": 9060,
            "other": "two",
        },
    )

    updates: list[tuple[str, dict[str, int | str]]] = []

    def _update_entry(entry, *, options=None, data=None):
        if options is not None:
            entry.options = options
            updates.append((entry.entry_id, options))
        if data is not None:
            entry.data = data

    flow.hass = SimpleNamespace(
        config_entries=SimpleNamespace(
            async_entries=lambda domain: [entry_one, entry_two],
            async_update_entry=_update_entry,
        )
    )

    result = _run(
        flow.async_step_ports(
            {
                "proxy_udp_port": 8300,
                "hub_listen_base": 8400,
                "roku_listen_port": 8500,
            }
        )
    )

    assert result["type"] == "create_entry"
    assert entry_one.options["proxy_udp_port"] == 8300
    assert entry_one.options["hub_listen_base"] == 8400
    assert entry_one.options["roku_listen_port"] == 8500
    assert entry_two.options["proxy_udp_port"] == 8300
    assert entry_two.options["hub_listen_base"] == 8400
    assert entry_two.options["roku_listen_port"] == 8500
    assert entry_one.options["other"] == "one"
    assert entry_two.options["other"] == "two"
    assert {entry_id for entry_id, _ in updates} == {"entry-1", "entry-2"}
