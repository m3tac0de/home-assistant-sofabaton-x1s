import asyncio
from types import SimpleNamespace
import pytest

from custom_components.sofabaton_x1s.config_flow import _prepare_discovered_hub
from custom_components.sofabaton_x1s.config_flow import ConfigFlow
from custom_components.sofabaton_x1s.const import (
    CONF_ENABLE_X2_DISCOVERY,
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
    # asyncio.run (not the legacy get_event_loop) so these tests don't
    # depend on no other test having created/closed an event loop first.
    return asyncio.run(coro)

def _flow_with_x2_enabled(enabled: bool) -> ConfigFlow:
    flow = ConfigFlow()
    flow.hass = SimpleNamespace(data={DOMAIN: {"config": {CONF_ENABLE_X2_DISCOVERY: enabled}}})
    flow.context = {}
    return flow


def test_manual_flow_prompts_for_host_only() -> None:
    flow = _flow_with_x2_enabled(False)

    result = _run(flow.async_step_manual())

    assert result["type"] == "form"
    assert list(result["data_schema"].schema.keys()) == ["host"]


def test_manual_flow_bootstraps_default_identity_from_host() -> None:
    flow = _flow_with_x2_enabled(False)

    _run(flow.async_step_manual({"host": "1.2.3.4"}))

    result = _run(flow.async_step_ports({
        "proxy_udp_port": 8000,
        "hub_listen_base": 8200,
    }))

    assert result["type"] == "create_entry"
    assert result["data"]["name"] == "1.2.3.4"
    # Manual entry has no mDNS advertisement; the variant is resolved
    # by the post-connect banner, not by config-flow defaults.
    assert result["data"]["mdns_version"] is None
    assert result["options"]["mdns_version"] is None
    assert result["data"]["mdns_txt"] == {"MAC": result["data"]["mac"]}


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
        "host": "192.168.2.181",
    }))

    result = _run(flow.async_step_ports({
        "proxy_udp_port": 8000,
        "hub_listen_base": 8200,
    }))

    assert result["type"] == "create_entry"
    # Manual entry has no variant yet; the title falls back to the
    # ``unknown`` placeholder until the banner repairs it.
    assert result["title"] == format_hub_entry_title(
        None,
        "192.168.2.181",
        result["data"]["mac"],
    )


def test_zeroconf_existing_entry_updates_host_only() -> None:
    flow = _flow_with_x2_enabled(True)
    existing_entry = SimpleNamespace(
        unique_id="aa:bb:cc:dd:ee:ff",
        data={
            "host": "1.2.3.4",
            "port": 8102,
            "name": "Configured Hub",
            "mdns_txt": {"NAME": "Configured Hub", "HVER": "1", "AVER": "17"},
            "mdns_version": "X1",
        },
        options={},
    )
    updated: dict[str, dict] = {}

    flow._async_current_entries = lambda: [existing_entry]  # type: ignore[assignment]
    flow.async_set_unique_id = lambda *_args, **_kwargs: asyncio.sleep(0)  # type: ignore[assignment]
    flow.hass.config_entries = SimpleNamespace(
        async_update_entry=lambda entry, *, data=None, options=None: updated.update(
            {"data": data or entry.data, "options": options or entry.options}
        )
    )

    result = _run(
        flow.async_step_zeroconf(
            _service_info(
                MDNS_SERVICE_TYPES[0],
                host="5.6.7.8",
                properties={
                    "NAME": b"Discovered Hub",
                    "MAC": b"aa:bb:cc:dd:ee:ff",
                    "HVER": b"3",
                    "AVER": b"8",
                },
            )
        )
    )

    assert result["type"] == "abort"
    assert result["reason"] == "already_configured"
    assert updated["data"]["host"] == "5.6.7.8"
    assert updated["data"]["name"] == "Configured Hub"
    assert updated["data"]["mdns_txt"] == {"NAME": "Configured Hub", "HVER": "1", "AVER": "17"}
    assert updated["data"]["mdns_version"] == "X1"


def test_format_hub_entry_title_defaults_unknown_values() -> None:
    # No DEFAULT_HUB_VERSION fallback: ``None`` surfaces as ``unknown``.
    assert format_hub_entry_title(None, None, None) == "Sofabaton unknown (unknown / unknown)"


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
