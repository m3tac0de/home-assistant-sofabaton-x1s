"""The listener ports every hub shares: the Settings tab's Global ports
(sofabaton_x1s/control_panel/set_listener_ports) and the helper the
cogwheel uses too (listener_ports.async_apply_listener_ports)."""

from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

import pytest

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
runtime_module = importlib.import_module("custom_components.sofabaton_x1s.runtime")
listener_ports = importlib.import_module("custom_components.sofabaton_x1s.listener_ports")
ws_panel = importlib.import_module("custom_components.sofabaton_x1s.ws_panel")
notify_demuxer = importlib.import_module("custom_components.sofabaton_x1s.lib.notify_demuxer")

DOMAIN = integration.DOMAIN
DEFAULTS = {"hub_listen_base": 8200, "proxy_udp_port": 8102, "roku_listen_port": 8060}


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


class _Hub:
    """Records stops and restarts in one shared log, in call order."""

    def __init__(self, entry_id, log, udp=8102, tcp=8200):
        self.entry_id = entry_id
        self.host = "10.0.0.2"
        self.port = 8102
        self._udp = udp
        self._tcp = tcp
        self._log = log

    @property
    def listener_ports(self):
        return (str(self._udp), str(self._tcp))

    async def async_stop(self):
        self._log.append(("stop", self.entry_id))

    async def async_apply_new_settings(self, *, host, port, proxy_udp_port, hub_listen_base):
        self._log.append(("start", self.entry_id, proxy_udp_port, hub_listen_base))
        self._udp = proxy_udp_port
        self._tcp = hub_listen_base


class _Roku:
    def __init__(self):
        self.port = 8060

    async def async_set_listen_port(self, port):
        self.port = port


def _hass(entries, *, roku=None):
    def _update_entry(entry, *, options=None, data=None):
        if options is not None:
            entry.options = options

    data = {DOMAIN: {"roku_listener": roku} if roku is not None else {}}
    return SimpleNamespace(
        data=data,
        config_entries=SimpleNamespace(
            async_entries=lambda domain: list(entries),
            async_update_entry=_update_entry,
        ),
        async_add_executor_job=_executor,
    )


async def _executor(fn, *args):
    return fn(*args)


def _entry(entry_id, **options):
    return SimpleNamespace(entry_id=entry_id, options={**DEFAULTS, **options, "other": entry_id})


def _patch_hubs(monkeypatch, hubs, busy=()):
    monkeypatch.setattr(runtime_module, "_get_hubs", lambda _data: list(hubs))
    monkeypatch.setattr(runtime_module, "_hub_is_busy", lambda _hass, hub: hub.entry_id in busy)


def test_apply_stops_every_hub_before_any_starts_again(monkeypatch):
    """The hub and app listeners are shared and only an idle one takes a new
    port: a hub restarted while another still holds the old port would keep
    the old one until Home Assistant restarts."""
    log: list = []
    hubs = [_Hub("a", log), _Hub("b", log)]
    _patch_hubs(monkeypatch, hubs)
    entries = [_entry("a"), _entry("b")]
    roku = _Roku()
    ports = {"hub_listen_base": 8300, "proxy_udp_port": 8103, "roku_listen_port": 8061}

    _run(listener_ports.async_apply_listener_ports(_hass(entries, roku=roku), ports))

    assert log == [
        ("stop", "a"),
        ("stop", "b"),
        ("start", "a", 8103, 8300),
        ("start", "b", 8103, 8300),
    ]
    for entry in entries:
        assert {key: entry.options[key] for key in DEFAULTS} == ports
        assert entry.options["other"] == entry.entry_id
    assert roku.port == 8061


def test_apply_leaves_hubs_on_the_wanted_ports_running(monkeypatch):
    """Only the Wifi port moves: no hub connection restarts."""
    log: list = []
    _patch_hubs(monkeypatch, [_Hub("a", log)])
    entries = [_entry("a")]
    roku = _Roku()

    _run(listener_ports.async_apply_listener_ports(
        _hass(entries, roku=roku), {**DEFAULTS, "roku_listen_port": 8070},
    ))

    assert log == []
    assert entries[0].options["roku_listen_port"] == 8070
    assert roku.port == 8070


def test_configured_ports_fall_back_to_the_defaults():
    assert listener_ports.configured_listener_ports(_hass([])) == DEFAULTS
    entry = SimpleNamespace(entry_id="a", options={"hub_listen_base": 8300})
    assert listener_ports.configured_listener_ports(_hass([entry])) == {**DEFAULTS, "hub_listen_base": 8300}


def _ws(hass, conn, **ports):
    return ws_panel._ws_control_panel_set_listener_ports(
        hass, conn, {"id": 7, **DEFAULTS, **ports},
    )


def test_ws_set_listener_ports_applies_and_answers_the_stored_ports(monkeypatch):
    log: list = []
    _patch_hubs(monkeypatch, [_Hub("a", log)])
    monkeypatch.setattr(listener_ports, "port_is_free", lambda port, *, udp: True)
    entries = [_entry("a")]
    conn = _Conn()

    _run(_ws(_hass(entries), conn, hub_listen_base=8300))

    assert conn.error is None
    assert conn.result == (7, {"ok": True, "listener_ports": {**DEFAULTS, "hub_listen_base": 8300}})
    assert log == [("stop", "a"), ("start", "a", 8102, 8300)]


def test_ws_set_listener_ports_checks_only_the_moved_ports(monkeypatch):
    """Our own listeners hold the current ports: those are not "in use"."""
    checked: list = []

    def free(port, *, udp):
        checked.append((port, udp))
        return port != 8300

    _patch_hubs(monkeypatch, [_Hub("a", [])])
    monkeypatch.setattr(listener_ports, "port_is_free", free)
    entries = [_entry("a")]
    conn = _Conn()

    _run(_ws(_hass(entries), conn, hub_listen_base=8300))

    assert conn.error is None
    msg_id, payload = conn.result
    assert payload["ok"] is False
    assert payload["in_use"] == {"hub_listen_base": 8201}
    assert payload["listener_ports"] == DEFAULTS
    # Nothing was written; the unchanged ports were never probed.
    assert entries[0].options["hub_listen_base"] == 8200
    assert (8102, True) not in checked and (8060, False) not in checked


def test_ws_set_listener_ports_refuses_one_port_for_two_tcp_listeners(monkeypatch):
    _patch_hubs(monkeypatch, [_Hub("a", [])])
    conn = _Conn()

    _run(_ws(_hass([_entry("a")]), conn, hub_listen_base=8060))

    assert conn.result is None
    assert conn.error[1] == "same_port"


def test_ws_set_listener_ports_waits_for_idle_hubs(monkeypatch):
    log: list = []
    _patch_hubs(monkeypatch, [_Hub("a", log), _Hub("b", log)], busy={"b"})
    entries = [_entry("a"), _entry("b")]
    conn = _Conn()

    _run(_ws(_hass(entries), conn, hub_listen_base=8300))

    assert conn.error[1] == "busy"
    assert log == []
    assert entries[0].options["hub_listen_base"] == 8200


@pytest.fixture
def _fresh_demuxer():
    previous = notify_demuxer._GLOBAL_DEMUXER
    notify_demuxer._GLOBAL_DEMUXER = None
    yield
    demuxer = notify_demuxer._GLOBAL_DEMUXER
    if demuxer is not None:
        demuxer.shutdown()
    notify_demuxer._GLOBAL_DEMUXER = previous


def test_idle_notify_demuxer_takes_the_requested_port(_fresh_demuxer, caplog):
    first = notify_demuxer.get_notify_demuxer(18102)
    with caplog.at_level("WARNING", logger="x1proxy.notify"):
        second = notify_demuxer.get_notify_demuxer(18103)
    assert first is second
    assert second.listen_port == 18103
    assert not any("existing listener" in rec.getMessage() for rec in caplog.records)


def test_busy_notify_demuxer_keeps_its_port(_fresh_demuxer, caplog):
    demuxer = notify_demuxer.get_notify_demuxer(18102)
    # A registration without opening the socket: the port is what matters.
    demuxer._registrations["p1"] = object()
    with caplog.at_level("WARNING", logger="x1proxy.notify"):
        assert notify_demuxer.get_notify_demuxer(18103).listen_port == 18102
    assert any("existing listener" in rec.getMessage() for rec in caplog.records)
    demuxer._registrations.clear()
