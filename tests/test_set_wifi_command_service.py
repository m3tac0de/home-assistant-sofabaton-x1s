"""Service-handler tests for ``set_wifi_command`` (issue #299).

The action writes one HTTP command on a ``wifi_ip`` (Generic HTTP) device:
it builds the record as the device editor's HTTP form does
(``www/src/shared/wifi-ip-form.ts``: request text unless the URL needs a
URL record, a stored URL record stays one), puts it in the cached
structural snapshot with ``lib.edits`` and runs the device sync the
``sync_from_snapshot`` service runs. The fake hub records the sync's
bundle pair; the planner is run on it to show the write it becomes.
"""

from __future__ import annotations

import asyncio
import copy
import importlib
from types import SimpleNamespace

import pytest

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
services_module = importlib.import_module("custom_components.sofabaton_x1s.services")
entity_sync_module = importlib.import_module("custom_components.sofabaton_x1s.entity_sync")
runtime_module = importlib.import_module("custom_components.sofabaton_x1s.runtime")

from custom_components.sofabaton_x1s.lib.activity_sync import build_device_sync_plan
from custom_components.sofabaton_x1s.lib.payloads import NetworkCommand

DEVICE_ID = 5


def _bundle(*, brand: str = "", device_class: str = "wifi_ip", version: str = "X1S") -> dict:
    return {
        "kind": "hub_bundle",
        "schema_version": entity_sync_module.HUB_BUNDLE_SCHEMA_VERSION,
        "payload_profile": "structural",
        "hub": {"name": "Living Room", "version": version},
        "devices": [
            {
                "kind": "device_backup",
                "complete": True,
                "payload_profile": "structural",
                "device": {
                    "device_id": DEVICE_ID,
                    "name": "HTTP box",
                    "brand": brand,
                    "device_class": device_class,
                    "idle_behavior": 0,
                },
                "commands": [{"command_id": 1, "name": "Power"}],
                "key_sort": None,
                "input_record": None,
                "button_bindings": [],
                "macros": [],
            }
        ],
        "activities": [],
    }


def _stored(command: NetworkCommand) -> dict:
    """A stored command's decoded block, as fetch_blob returns it."""

    return {"class": command.device_class, "fields": dict(command.fields), "trailer_hex": command.trailer_hex}


class _FakeCall:
    def __init__(self, data: dict, hass=None):
        self.data = data
        self.hass = hass if hass is not None else SimpleNamespace(data={integration.DOMAIN: {}})


class _FakeHub:
    def __init__(self, *, version: str = "X1S") -> None:
        self.entry_id = "entry-1"
        self.version = version
        self.cache_generation = 3
        self.hub_work_active = False
        self.calls: list[tuple[str, dict]] = []
        self.structural_bundle: dict | None = _bundle(version=version)
        self.stored: dict | None = None
        self.sync_result: dict = {"status": "success", "completed_steps": 1, "total_steps": 1}

    async def async_get_structural_bundle(self):
        return copy.deepcopy(self.structural_bundle)

    async def async_fetch_blob(self, *, device_id, command_id=None):
        self.calls.append(("fetch_blob", {"device_id": device_id, "command_id": command_id}))
        return {"device_id": device_id, "commands": [{"command_id": command_id, "decoded": self.stored}]}

    async def async_sync_device(self, *, baseline, edited, device_id, progress_callback=None, allow_command_removal=False):
        self.calls.append(("sync_device", {"baseline": baseline, "edited": edited, "device_id": device_id}))
        return self.sync_result

    async def async_request_catalog(self, kind):
        self.calls.append(("request_catalog", {"kind": kind}))

    async def async_export_cache_state(self):
        return {}


def _wire(monkeypatch, hub: _FakeHub, *, cache_enabled: bool = True) -> _FakeHub:
    async def _resolve(_hass, _call):
        return hub

    async def _set_hub_cache(_entry_id, _payload):
        return None

    async def _store(_hass):
        return SimpleNamespace(enabled=cache_enabled, async_set_hub_cache=_set_hub_cache)

    monkeypatch.setattr(runtime_module, "_async_resolve_hub_from_call", _resolve)
    monkeypatch.setattr(runtime_module, "_async_get_persistent_cache_store", _store)
    return hub


def _run(data: dict, hass=None):
    return asyncio.run(integration._async_handle_set_wifi_command(_FakeCall({"device_id": DEVICE_ID, **data}, hass)))


def _synced(hub: _FakeHub) -> tuple[dict, dict]:
    (sync,) = [payload for name, payload in hub.calls if name == "sync_device"]
    return sync["baseline"], sync["edited"]


def _row(bundle: dict, command_id: int) -> dict:
    (row,) = [r for r in bundle["devices"][0]["commands"] if r["command_id"] == command_id]
    return row


def test_set_wifi_command_is_registered_with_a_response() -> None:
    table = {name: responds for name, _handler, responds in services_module.SERVICES}
    assert table["set_wifi_command"] is True


# ---------------------------------------------------------------------------
# Refusals before any hub I/O
# ---------------------------------------------------------------------------


def test_adding_needs_a_name(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    with pytest.raises(ValueError, match="name is required"):
        _run({"url": "http://192.168.1.20/x"})
    assert hub.calls == []


def test_needs_the_persistent_cache(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub(), cache_enabled=False)

    with pytest.raises(services_module.HomeAssistantError, match="persistent cache"):
        _run({"name": "Toggle", "url": "http://192.168.1.20/x"})
    assert hub.calls == []


def test_refuses_a_device_that_is_not_generic_http(monkeypatch) -> None:
    hub = _FakeHub()
    hub.structural_bundle = _bundle(device_class="wifi_roku")
    _wire(monkeypatch, hub)

    with pytest.raises(ValueError, match="not a wifi_ip device"):
        _run({"name": "Toggle", "url": "http://192.168.1.20/x"})
    assert hub.calls == []


def test_refuses_a_wifi_device_the_integration_deploys(monkeypatch) -> None:
    hub = _FakeHub()
    hub.structural_bundle = _bundle(brand="m3-default-abc123")
    _wire(monkeypatch, hub)

    with pytest.raises(services_module.HomeAssistantError, match="Wifi Commands tab"):
        _run({"name": "Toggle", "url": "http://192.168.1.20/x"})
    assert hub.calls == []


@pytest.mark.parametrize(
    "url",
    ["https://192.168.1.20/x", "http://ha.local:8123/x"],
)
def test_x1s_refuses_what_needs_a_url_record(monkeypatch, url) -> None:
    hub = _wire(monkeypatch, _FakeHub(version="X1S"))

    with pytest.raises(ValueError, match="need an X2"):
        _run({"name": "Toggle", "url": url})
    assert hub.calls == []


@pytest.mark.parametrize(
    ("data", "match"),
    [
        ({"url": "ftp://192.168.1.20/x"}, "http:// or https://"),
        ({"url": "http://192.168.1.20/a b"}, "without spaces"),
        ({"url": "http://192.168.1.20:99999/x"}, "port"),
        ({"url": "http://192.168.1.20/x", "headers": {"Host": "other"}}, "Host header"),
        ({"url": "http://192.168.1.20/x", "headers": ["no colon here"]}, "no colon"),
        ({"url": "http://192.168.1.20/x#top"}, "fragment"),
        ({"url": "http://192.168.1.20/x", "body": "café"}, "cannot store"),
    ],
)
def test_refuses_a_request_text_command_it_cannot_store(monkeypatch, data, match) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    with pytest.raises(ValueError, match=match):
        _run({"name": "Toggle", **data})
    assert hub.calls == []


def test_a_url_record_takes_get_post_or_put_only(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub(version="X2"))

    with pytest.raises(ValueError, match="GET, POST, PUT"):
        _run({"name": "Toggle", "url": "https://ha.local/x", "method": "DELETE"})
    assert hub.calls == []


# ---------------------------------------------------------------------------
# Adding a command
# ---------------------------------------------------------------------------


def test_adds_a_request_text_command_through_the_device_sync(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub(version="X1S"))

    result = _run(
        {
            "name": "Webhook",
            "url": "http://192.168.001.20:8123/api/webhook/x?y=1",
            "method": "post",
            "headers": {"Content-Type": "application/json", "X-Token": "abc", "X-Other": "1"},
            "body": '{"on": true}',
        }
    )

    assert result["command_id"] == 2
    assert result["device_id"] == DEVICE_ID
    assert result["record"] == "request_text"
    assert result["status"] == "success"
    baseline, edited = _synced(hub)
    restore_data = _row(edited, 2)["restore_data"]
    assert restore_data["new"] is True
    assert restore_data["library_type"] == 0x1C
    assert restore_data["decoded"]["fields"] == {
        "host": "192.168.1.20",
        "port": 8123,
        "method": "POST",
        "path": "/api/webhook/x?y=1",
        "header": "X-Token: abc\r\nX-Other: 1",
        "content_type": "application/json",
        "body": '{"on": true}',
    }
    assert [step.kind for step in build_device_sync_plan(baseline, edited, DEVICE_ID)] == ["command_add"]
    # The sync's success tail ran: the hub's device list is read again.
    assert ("request_catalog", {"kind": "devices"}) in hub.calls
    # A new command needs no read of a stored record.
    assert not [name for name, _ in hub.calls if name == "fetch_blob"]


def test_defaults_to_get_on_port_80_at_the_root(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    _run({"name": "Ping", "url": "http://10.0.0.7"})

    _baseline, edited = _synced(hub)
    fields = _row(edited, 2)["restore_data"]["decoded"]["fields"]
    assert (fields["method"], fields["port"], fields["path"]) == ("GET", 80, "/")


def test_x2_adds_a_url_record_for_https(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub(version="X2"))

    result = _run(
        {
            "name": "Scene",
            "url": "https://ha.local:8123/api/services/scene/turn_on",
            "method": "POST",
            "headers": ["Authorization: Bearer abc", "Content-Type: application/json"],
            "body": '{"entity_id": "scene.movie"}',
        }
    )

    assert result["record"] == "url"
    _baseline, edited = _synced(hub)
    restore_data = _row(edited, 2)["restore_data"]
    assert restore_data["library_type"] == 0x21
    assert restore_data["decoded"]["fields"] == {
        "url": "https://ha.local:8123/api/services/scene/turn_on",
        "method": "POST",
        "headers": [["Authorization", "Bearer abc"], ["Content-Type", "application/json"]],
        "body": '{"entity_id": "scene.movie"}',
    }


def test_x2_keeps_a_plain_ipv4_url_as_request_text(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub(version="X2"))

    result = _run({"name": "Toggle", "url": "http://192.168.1.20/toggle"})

    assert result["record"] == "request_text"
    _baseline, edited = _synced(hub)
    assert _row(edited, 2)["restore_data"]["library_type"] == 0x1C


# ---------------------------------------------------------------------------
# Overwriting a command
# ---------------------------------------------------------------------------


def test_overwrite_reads_the_stored_record_and_keeps_its_trailer(monkeypatch) -> None:
    hub = _FakeHub(version="X1S")
    hub.stored = _stored(
        NetworkCommand.from_dict(
            {
                "device_class": "wifi_ip",
                "fields": NetworkCommand.http(host="192.168.1.20", port=80, method="GET", path="/old").fields,
                "trailer_hex": "01 02",
            }
        )
    )
    _wire(monkeypatch, hub)

    result = _run({"command_id": 1, "url": "http://192.168.1.21:8080/new"})

    assert result["command_id"] == 1
    assert ("fetch_blob", {"device_id": DEVICE_ID, "command_id": 1}) in hub.calls
    baseline, edited = _synced(hub)
    row = _row(edited, 1)
    assert row["name"] == "Power"
    assert row["restore_data"]["decoded"]["trailer_hex"] == "01 02"
    assert row["restore_data"]["decoded"]["fields"]["path"] == "/new"
    assert [step.kind for step in build_device_sync_plan(baseline, edited, DEVICE_ID)] == ["command_payload"]


def test_overwrite_keeps_a_url_record_a_url_record(monkeypatch) -> None:
    # Rewriting a URL record as request text was never benched.
    hub = _FakeHub(version="X2")
    hub.stored = _stored(NetworkCommand.url(url="https://ha.local/old", method="POST"))
    _wire(monkeypatch, hub)

    result = _run({"command_id": 1, "url": "http://192.168.1.20/new"})

    assert result["record"] == "url"
    _baseline, edited = _synced(hub)
    assert _row(edited, 1)["restore_data"]["decoded"]["fields"]["url"] == "http://192.168.1.20/new"


def test_overwrite_switching_to_a_url_record_drops_the_trailer(monkeypatch) -> None:
    hub = _FakeHub(version="X2")
    hub.stored = _stored(
        NetworkCommand.from_dict(
            {
                "device_class": "wifi_ip",
                "fields": NetworkCommand.http(host="192.168.1.20", port=80, method="GET", path="/").fields,
                "trailer_hex": "01 02",
            }
        )
    )
    _wire(monkeypatch, hub)

    result = _run({"command_id": 1, "url": "https://ha.local/x"})

    assert result["record"] == "url"
    _baseline, edited = _synced(hub)
    assert _row(edited, 1)["restore_data"]["decoded"]["trailer_hex"] == ""


def test_overwrite_with_a_name_renames_the_command(monkeypatch) -> None:
    hub = _FakeHub()
    hub.stored = _stored(NetworkCommand.http(host="192.168.1.20", port=80, method="GET", path="/"))
    _wire(monkeypatch, hub)

    _run({"command_id": 1, "name": "Power on", "url": "http://192.168.1.20/on"})

    _baseline, edited = _synced(hub)
    assert _row(edited, 1)["name"] == "Power on"


def test_overwrite_refuses_a_command_the_device_does_not_have(monkeypatch) -> None:
    hub = _wire(monkeypatch, _FakeHub())

    with pytest.raises(ValueError, match="has no command 9"):
        _run({"command_id": 9, "url": "http://192.168.1.20/x"})
    assert hub.calls == []


def test_overwrite_refuses_when_the_stored_record_cannot_be_read(monkeypatch) -> None:
    hub = _FakeHub()
    hub.stored = None
    _wire(monkeypatch, hub)

    with pytest.raises(services_module.HomeAssistantError, match="stored record of command 1"):
        _run({"command_id": 1, "url": "http://192.168.1.20/x"})
    assert not [name for name, _ in hub.calls if name == "sync_device"]


def test_overwrite_refuses_while_the_hub_is_busy(monkeypatch) -> None:
    hub = _FakeHub()
    hub.hub_work_active = True
    _wire(monkeypatch, hub)

    with pytest.raises(services_module.HomeAssistantError, match="hub_busy"):
        _run({"command_id": 1, "url": "http://192.168.1.20/x"})
    assert hub.calls == []


# ---------------------------------------------------------------------------
# The sync's own verdicts
# ---------------------------------------------------------------------------


def test_add_refuses_while_the_hub_is_busy(monkeypatch) -> None:
    hub = _FakeHub()
    hub.hub_work_active = True
    _wire(monkeypatch, hub)

    with pytest.raises(services_module.HomeAssistantError, match="already running"):
        _run({"name": "Toggle", "url": "http://192.168.1.20/x"})
    assert hub.calls == []


def test_a_failed_sync_raises_its_message(monkeypatch) -> None:
    hub = _FakeHub()
    hub.sync_result = {
        "status": "failed",
        "failed_at": "stale_check",
        "message": "This device changed on the hub after you loaded it.",
    }
    _wire(monkeypatch, hub)

    with pytest.raises(services_module.HomeAssistantError, match="changed on the hub"):
        _run({"name": "Toggle", "url": "http://192.168.1.20/x"})
