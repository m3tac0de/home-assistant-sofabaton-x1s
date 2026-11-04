"""The setup flow searches the network first; the IP form is the fallback.

A fresh install (the HA 2026.11 Marketplace opens the flow without a
restart) has no Discovered card yet, so "Add integration" scans for hubs
itself through HA's shared zeroconf instance.
"""

import asyncio
import json
import pathlib
from types import SimpleNamespace

import pytest

from custom_components.sofabaton_x1s import config_flow as cf
from custom_components.sofabaton_x1s.config_flow import ConfigFlow
from custom_components.sofabaton_x1s.const import (
    CONF_ENABLE_X2_DISCOVERY,
    DOMAIN,
    MDNS_SERVICE_TYPES,
)
from custom_components.sofabaton_x1s.lib.discovery import normalize_advertisement

X1_TYPE, X2_TYPE = MDNS_SERVICE_TYPES
_SHARED_ZC = object()


@pytest.fixture(autouse=True)
def _default_ports_free(monkeypatch):
    """Every default port is free unless a test says otherwise (the real
    check would bind ports on the test machine)."""

    async def _none_in_use(self, ports):
        return {}

    monkeypatch.setattr(ConfigFlow, "_async_ports_in_use", _none_in_use)


def _ad(name, host, *, hver="2", mac=None, service_type=X1_TYPE, proxy=False):
    props = {"NAME": name, "HVER": hver}
    if mac:
        props["MAC"] = mac
    if proxy:
        props["HA_PROXY"] = "1"
    return normalize_advertisement(
        service_type,
        f"{name.upper()}.{service_type}",
        host=host,
        port=8102,
        properties=props,
    )


def _flow(monkeypatch, scanned, *, x2=True, entries=(), zc=_SHARED_ZC):
    calls = []

    async def _zc(_hass):
        return zc

    def _discover(timeout, *, zc=None):
        calls.append((timeout, zc))
        if isinstance(scanned, Exception):
            raise scanned
        return list(scanned)

    async def _executor(func, *args):
        return func(*args)

    monkeypatch.setattr(cf, "async_get_zeroconf_instance", _zc)
    monkeypatch.setattr(cf, "discover_hubs", _discover)

    flow = ConfigFlow()
    flow.hass = SimpleNamespace(
        data={DOMAIN: {"config": {CONF_ENABLE_X2_DISCOVERY: x2}}},
        async_create_task=lambda coro: asyncio.get_running_loop().create_task(coro),
        async_add_executor_job=_executor,
    )
    flow.context = {}
    flow._async_current_entries = lambda **_: list(entries)  # type: ignore[assignment]
    return flow, calls


async def _scan(flow):
    first = await flow.async_step_user()
    assert first["type"] == "progress"
    assert first["step_id"] == "user"
    assert first["progress_action"] == "scan"
    await first["progress_task"]
    return await flow.async_step_user()


def test_no_hub_offers_search_again_and_the_ip_form(monkeypatch) -> None:
    flow, calls = _flow(monkeypatch, [])

    async def _drive():
        done = await _scan(flow)
        assert done == {"type": "progress_done", "next_step_id": "no_hubs"}
        return await flow.async_step_no_hubs()

    menu = asyncio.run(_drive())
    assert menu["type"] == "menu"
    assert menu["menu_options"] == ["rescan", "manual"]
    assert len(calls) == 1 and calls[0][1] is not None


def test_search_again_runs_a_fresh_scan(monkeypatch) -> None:
    flow, calls = _flow(monkeypatch, [])

    async def _drive():
        await _scan(flow)
        again = await flow.async_step_rescan()
        assert again["type"] == "progress"
        await again["progress_task"]
        return await flow.async_step_user()

    assert asyncio.run(_drive())["next_step_id"] == "no_hubs"
    assert len(calls) == 2


def _choices(form):
    (key, selector), = form["data_schema"].schema.items()
    assert key == "hub"
    assert "multiple" not in selector.config
    assert selector.config["mode"] == "list"
    assert selector.config["translation_key"] == "hub_choice"
    return key.default, selector.config["options"]


_NOT_LISTED = {"value": "manual", "label": "A hub that is not listed (enter its IP address)"}


def test_one_hub_is_preselected_and_set_up_with_its_real_identity(monkeypatch) -> None:
    flow, _ = _flow(monkeypatch, [_ad("Living Room", "192.168.2.20", mac="aa:bb:cc:dd:ee:01")])

    async def _drive():
        done = await _scan(flow)
        assert done["next_step_id"] == "pick_hub"
        form = await flow.async_step_pick_hub()
        entry = await flow.async_step_pick_hub({"hub": "192.168.2.20"})
        return form, entry

    form, entry = asyncio.run(_drive())
    assert form["type"] == "form" and form["step_id"] == "pick_hub"
    default, options = _choices(form)
    assert options == [
        {"value": "192.168.2.20", "label": "Living Room (X1S, 192.168.2.20)"},
        _NOT_LISTED,
    ]
    # The first hub starts chosen; the IP row never does.
    assert default == "192.168.2.20"
    # Choosing a hub finishes setup: no ports step, no other hub to name.
    assert entry["type"] == "create_entry"
    assert "description" not in entry
    assert entry["data"]["mac"] == "aa:bb:cc:dd:ee:01"
    assert entry["data"]["host"] == "192.168.2.20"
    assert entry["data"]["mdns_version"] == "X1S"
    assert entry["data"]["mdns_txt"]["NAME"] == "Living Room"


def test_one_hub_per_run_and_the_success_dialog_names_the_others(monkeypatch) -> None:
    flow, _ = _flow(
        monkeypatch,
        [
            _ad("Study", "192.168.2.31", hver="1"),
            _ad("Bedroom", "192.168.2.30", hver="3", service_type=X2_TYPE),
            _ad("Attic", "192.168.2.32"),
        ],
    )

    async def _drive():
        await _scan(flow)
        form = await flow.async_step_pick_hub()
        entry = await flow.async_step_pick_hub({"hub": "192.168.2.30"})
        return form, entry

    form, entry = asyncio.run(_drive())
    default, options = _choices(form)
    assert options == [
        {"value": "192.168.2.32", "label": "Attic (X1S, 192.168.2.32)"},
        {"value": "192.168.2.30", "label": "Bedroom (X2, 192.168.2.30)"},
        {"value": "192.168.2.31", "label": "Study (X1, 192.168.2.31)"},
        _NOT_LISTED,
    ]
    assert default == "192.168.2.32"
    # Only the chosen hub is added (so HA's area step covers it); the
    # success dialog says which hubs are left and how to add them.
    assert entry["type"] == "create_entry"
    assert entry["data"]["host"] == "192.168.2.30"
    assert entry["data"]["mdns_version"] == "X2"
    assert entry["description"] == "more_hubs_found"
    assert entry["description_placeholders"] == {"others": "Attic, Study"}


def test_the_ip_row_opens_the_ip_form_and_still_names_the_found_hubs(monkeypatch) -> None:
    flow, _ = _flow(monkeypatch, [_ad("Den", "10.0.0.6")])

    async def _drive():
        await _scan(flow)
        form = await flow.async_step_pick_hub({"hub": "manual"})
        entry = await flow.async_step_manual({"host": "10.20.0.9"})
        return form, entry

    form, entry = asyncio.run(_drive())
    assert form["type"] == "form" and form["step_id"] == "manual"
    assert entry["type"] == "create_entry"
    assert entry["data"]["host"] == "10.20.0.9"
    assert entry["description_placeholders"] == {"others": "Den"}


def test_a_found_hub_entered_by_ip_is_not_named_as_left_over(monkeypatch) -> None:
    flow, _ = _flow(monkeypatch, [_ad("Den", "10.0.0.6")])

    async def _drive():
        await _scan(flow)
        await flow.async_step_pick_hub({"hub": "manual"})
        return await flow.async_step_manual({"host": "10.0.0.6"})

    entry = asyncio.run(_drive())
    assert entry["type"] == "create_entry"
    assert "description" not in entry


def test_a_choice_that_is_no_longer_listed_asks_again(monkeypatch) -> None:
    flow, _ = _flow(monkeypatch, [_ad("Den", "10.0.0.6")])

    async def _drive():
        await _scan(flow)
        return await flow.async_step_pick_hub({"hub": "10.0.0.99"})

    form = asyncio.run(_drive())
    assert form["type"] == "form" and form["step_id"] == "pick_hub"


def test_the_scan_offers_only_new_physical_hubs(monkeypatch) -> None:
    configured_by_id = SimpleNamespace(unique_id="aa:bb:cc:dd:ee:02", data={"host": "10.0.0.2"}, options={})
    configured_by_host = SimpleNamespace(unique_id="02:00:00:00:00:03", data={"host": "10.0.0.3"}, options={})
    flow, _ = _flow(
        monkeypatch,
        [
            _ad("Proxy", "10.0.0.1", proxy=True),
            _ad("Known by MAC", "10.0.0.22", mac="aa:bb:cc:dd:ee:02"),
            _ad("Known by IP", "10.0.0.3"),
            _ad("Mystery", "10.0.0.4", hver="9"),
            _ad("X2 off", "10.0.0.5", hver="3"),
            _ad("Den", "10.0.0.6"),
            _ad("Den", "10.0.0.6", service_type=X2_TYPE),
        ],
        x2=False,
        entries=[configured_by_id, configured_by_host],
    )

    asyncio.run(_scan(flow))
    assert [hub["name"] for hub in flow._found_hubs] == ["Den"]


def test_a_failed_scan_falls_back_to_the_ip_form(monkeypatch) -> None:
    flow, _ = _flow(monkeypatch, OSError("no multicast"))

    assert asyncio.run(_scan(flow))["next_step_id"] == "no_hubs"


def test_the_scan_never_opens_its_own_zeroconf(monkeypatch) -> None:
    flow, calls = _flow(monkeypatch, [_ad("Den", "10.0.0.6")], zc=None)

    assert asyncio.run(_scan(flow))["next_step_id"] == "no_hubs"
    assert calls == []


def test_a_hub_also_in_discovered_does_not_abort_the_scan_flow(monkeypatch) -> None:
    flow, _ = _flow(monkeypatch, [_ad("Den", "10.0.0.6", mac="aa:bb:cc:dd:ee:06")])
    seen = []

    async def _set_unique_id(unique_id, **kwargs):
        seen.append((unique_id, kwargs))

    flow.async_set_unique_id = _set_unique_id  # type: ignore[assignment]

    async def _drive():
        await _scan(flow)
        return await flow.async_step_pick_hub({"hub": "10.0.0.6"})

    assert asyncio.run(_drive())["type"] == "create_entry"
    assert seen == [("aa:bb:cc:dd:ee:06", {"raise_on_progress": False})]


# ----------------------------------------------------------------------
# first hub: a default port already taken asks for ports before setup
# ----------------------------------------------------------------------
_EN = json.loads(
    pathlib.Path(cf.__file__).with_name("translations").joinpath("en.json").read_text(encoding="utf-8")
)
_DEFAULT_PORTS = {"hub_listen_base": 8200, "proxy_udp_port": 8102, "roku_listen_port": 8060}


def _checks(monkeypatch, *answers):
    """Answer each port check in turn; record what was checked."""

    asked = []
    queue = list(answers)

    async def _in_use(self, ports):
        asked.append(dict(ports))
        return queue.pop(0) if queue else {}

    monkeypatch.setattr(ConfigFlow, "_async_ports_in_use", _in_use)
    return asked


def _ports_form_defaults(form):
    return {str(key): key.default for key in form["data_schema"].schema}


def _pick_den(monkeypatch):
    flow, _ = _flow(monkeypatch, [_ad("Den", "10.0.0.6", mac="aa:bb:cc:dd:ee:06")])

    async def _drive():
        await _scan(flow)
        return await flow.async_step_pick_hub({"hub": "10.0.0.6"})

    return flow, _drive


def test_a_taken_port_marks_its_field_with_a_free_stand_in(monkeypatch) -> None:
    asked = _checks(monkeypatch, {"hub_listen_base": 8201})
    flow, drive = _pick_den(monkeypatch)

    async def _drive():
        form = await drive()
        entry = await flow.async_step_ports({**_DEFAULT_PORTS, "hub_listen_base": 8201})
        return form, entry

    form, entry = asyncio.run(_drive())
    assert form["type"] == "form" and form["step_id"] == "ports"
    assert form["errors"] == {"hub_listen_base": "hub_port_in_use"}
    assert _ports_form_defaults(form) == {**_DEFAULT_PORTS, "hub_listen_base": 8201}
    placeholders = form["description_placeholders"]
    assert (placeholders["hub_busy"], placeholders["hub_free"]) == ("8200", "8201")
    assert placeholders["app_busy"] == placeholders["wifi_busy"] == ""
    assert placeholders["docs_url"].endswith("networking.md#-complete-port-reference")
    # The defaults were checked first, the submitted ports again on Submit.
    assert asked == [_DEFAULT_PORTS, {**_DEFAULT_PORTS, "hub_listen_base": 8201}]
    assert entry["type"] == "create_entry"
    assert entry["data"]["mac"] == "aa:bb:cc:dd:ee:06"
    assert entry["options"]["hub_listen_base"] == 8201
    assert entry["options"]["proxy_udp_port"] == 8102


def test_a_port_still_taken_on_submit_is_marked_again(monkeypatch) -> None:
    _checks(monkeypatch, {"proxy_udp_port": 8103}, {"proxy_udp_port": 8104})
    flow, drive = _pick_den(monkeypatch)

    async def _drive():
        await drive()
        # The user puts 8102 back; it is still taken.
        return await flow.async_step_ports(dict(_DEFAULT_PORTS))

    form = asyncio.run(_drive())
    assert form["step_id"] == "ports"
    assert form["errors"] == {"proxy_udp_port": "app_port_in_use"}
    assert form["description_placeholders"]["app_busy"] == "8102"
    assert _ports_form_defaults(form)["proxy_udp_port"] == 8104


def test_no_free_stand_in_keeps_the_port_and_asks_for_another(monkeypatch) -> None:
    _checks(monkeypatch, {"roku_listen_port": None})
    _, drive = _pick_den(monkeypatch)

    form = asyncio.run(drive())
    assert form["errors"] == {"roku_listen_port": "port_in_use_no_free"}
    assert _ports_form_defaults(form)["roku_listen_port"] == 8060


def test_the_two_tcp_listeners_need_different_ports(monkeypatch) -> None:
    _checks(monkeypatch, {"hub_listen_base": 8201})
    flow, drive = _pick_den(monkeypatch)

    async def _drive():
        await drive()
        return await flow.async_step_ports({**_DEFAULT_PORTS, "hub_listen_base": 8060})

    form = asyncio.run(_drive())
    assert form["step_id"] == "ports"
    assert form["errors"] == {"roku_listen_port": "same_port"}


def test_a_hub_added_meanwhile_lends_its_ports(monkeypatch) -> None:
    _checks(monkeypatch, {"hub_listen_base": 8201})
    flow, drive = _pick_den(monkeypatch)
    other = SimpleNamespace(
        unique_id="aa:bb:cc:dd:ee:07",
        data={"host": "10.0.0.7"},
        options={"hub_listen_base": 8300, "proxy_udp_port": 8102, "roku_listen_port": 8060},
    )

    async def _drive():
        await drive()
        flow._async_current_entries = lambda **_: [other]  # type: ignore[assignment]
        return await flow.async_step_ports({**_DEFAULT_PORTS, "hub_listen_base": 8201})

    entry = asyncio.run(_drive())
    assert entry["type"] == "create_entry"
    assert entry["options"]["hub_listen_base"] == 8300


def test_ports_are_only_checked_for_the_first_hub(monkeypatch) -> None:
    asked = _checks(monkeypatch, {"hub_listen_base": 8201})
    existing = SimpleNamespace(
        unique_id="aa:bb:cc:dd:ee:07", data={"host": "10.0.0.7"}, options={"hub_listen_base": 8300}
    )
    flow, _ = _flow(
        monkeypatch, [_ad("Den", "10.0.0.6", mac="aa:bb:cc:dd:ee:06")], entries=[existing]
    )

    async def _drive():
        await _scan(flow)
        return await flow.async_step_pick_hub({"hub": "10.0.0.6"})

    entry = asyncio.run(_drive())
    # Our own listener holds the shared ports already: nothing to check.
    assert asked == []
    assert entry["type"] == "create_entry"
    assert entry["options"]["hub_listen_base"] == 8300


def test_every_ports_step_error_is_translated() -> None:
    errors = _EN["config"]["error"]
    for _key, _udp, _stand_ins, error, prefix in cf._PORT_FIELDS:
        assert f"{{{prefix}_busy}}" in errors[error]
        assert f"{{{prefix}_free}}" in errors[error]
    assert "port_in_use_no_free" in errors and "same_port" in errors
    assert "{docs_url}" in _EN["config"]["step"]["ports"]["description"]
    assert _EN["config"]["step"]["ports"]["data"].keys() == {key for key, *_ in cf._PORT_FIELDS}


def test_ports_in_use_finds_a_stand_in_per_protocol(monkeypatch) -> None:
    taken = {("tcp", 8200), ("tcp", 8201), ("udp", 8102), ("tcp", 8060)}
    monkeypatch.setattr(
        cf, "_port_is_free", lambda port, *, udp: ("udp" if udp else "tcp", port) not in taken
    )

    assert cf._ports_in_use(dict(_DEFAULT_PORTS)) == {
        "hub_listen_base": 8202,
        "proxy_udp_port": 8103,
        "roku_listen_port": 8061,
    }
    # Two TCP listeners never get the same stand-in.
    clash = {"hub_listen_base": 8200, "proxy_udp_port": 8102, "roku_listen_port": 8202}
    assert cf._ports_in_use(clash)["hub_listen_base"] == 8203


def test_port_is_free_sees_a_real_listener() -> None:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as tcp:
        tcp.bind(("0.0.0.0", 0))
        tcp.listen(1)
        assert cf._port_is_free(tcp.getsockname()[1], udp=False) is False
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as udp:
        udp.bind(("0.0.0.0", 0))
        port = udp.getsockname()[1]
        assert cf._port_is_free(port, udp=True) is False
    assert cf._port_is_free(port, udp=True) is True
