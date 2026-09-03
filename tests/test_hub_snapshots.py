"""Tests for Phase 2 state-view consistency.

The refresh-snapshot contract: ``raw_body`` lives in the proxy state
dicts (``state.devices`` / ``state.activities``) and is carried through
the hub's ``_async_refresh_*_snapshot`` helpers. The *only* place
``raw_body`` is stripped is :func:`to_export_view`, the JSON-export
boundary used by WS payloads and the persistent cache.
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.lib.x1_proxy import to_export_view


class _FakeHass:
    """Minimal HA stub: just enough for ``async_add_executor_job``."""

    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop
        self.data: dict = {}
        self._entries: dict = {}
        self.config_entries = SimpleNamespace(
            async_get_entry=lambda entry_id: self._entries.get(entry_id),
            async_update_entry=lambda *a, **kw: None,
        )

    async def async_add_executor_job(self, func, *args, **kwargs):
        return func(*args, **kwargs)


def _make_hub() -> SofabatonHub:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    return SofabatonHub(
        FakeHass := _FakeHass(loop),  # noqa: N806
        "entry-id",
        "hub-name",
        "127.0.0.1",
        1234,
        {},
        9999,
        10000,
        True,
        False,
    )


# ---------------------------------------------------------------------------
# Export boundary
# ---------------------------------------------------------------------------


def test_to_export_view_strips_raw_body_and_leaves_rest_alone() -> None:
    entry = {
        "name": "TV",
        "brand": "Sony",
        "device_class": "IR",
        "raw_body": b"\x00\x01\x02",
    }

    view = to_export_view(entry)

    assert "raw_body" not in view
    assert view["name"] == "TV"
    assert view["brand"] == "Sony"
    assert view["device_class"] == "IR"
    # Source dict must not be mutated; the export view is a shallow copy.
    assert "raw_body" in entry


def test_to_export_view_is_a_noop_when_raw_body_absent() -> None:
    entry = {"name": "Stereo"}
    view = to_export_view(entry)
    assert view == {"name": "Stereo"}
    assert view is not entry  # always returns a fresh dict


# ---------------------------------------------------------------------------
# Refresh-snapshot contract
# ---------------------------------------------------------------------------


def _complete_activity_request(hub):
    # Simulate a new commit and its HA delivery after the request begins.
    hub._proxy._activities_snapshot_generation += 1
    hub._activities_generation += 1
    hub._received_activity_snapshot = (
        hub._proxy,
        hub._proxy._activities_snapshot_generation,
        {act_id: dict(row) for act_id, row in hub._proxy.state.activities.items()},
    )


def test_refresh_devices_snapshot_carries_raw_body_from_proxy_state(
    monkeypatch,
) -> None:
    """``_async_refresh_devices_snapshot`` returns ``proxy.state.devices``
    directly, so the on-demand backup flow can decode the full record
    without a second round-trip to the hub.
    """

    hub = _make_hub()
    raw = b"\x01\x00\x01" + b"\x42" * 117  # arbitrary X1-shaped blob

    hub._proxy.state.devices[0x0B] = {
        "name": "TV",
        "brand": "Sony",
        "device_class": "IR",
        "raw_body": raw,
    }

    # Bypass the request-devices round-trip: the helper just polls
    # ``_devices_generation`` until it advances, so a single bump is
    # enough to make it return immediately.
    monkeypatch.setattr(
        hub._proxy, "request_devices", lambda *args, **kwargs: None
    )
    hub._devices_generation += 1

    snapshot = hub.hass.loop.run_until_complete(
        hub._async_refresh_devices_snapshot(timeout_seconds=1.0)
    )

    assert 0x0B in snapshot
    assert snapshot[0x0B]["raw_body"] == raw
    assert snapshot[0x0B]["name"] == "TV"


def test_refresh_activities_snapshot_carries_raw_body_from_proxy_state(
    monkeypatch,
) -> None:
    """Symmetric to the devices case: activities snapshots also keep
    ``raw_body`` so the on-demand restore-activity flow can parse the
    schema without re-fetching.
    """

    hub = _make_hub()
    raw = b"\x01\x00\x01" + b"\x37" * 117

    hub._proxy.state.activities[0x05] = {
        "name": "Watch TV",
        "raw_body": raw,
    }

    monkeypatch.setattr(
        hub._proxy, "request_activities", lambda: _complete_activity_request(hub)
    )

    snapshot = hub.hass.loop.run_until_complete(
        hub._async_refresh_activities_snapshot(timeout_seconds=1.0)
    )

    assert 0x05 in snapshot
    assert snapshot[0x05]["raw_body"] == raw
    assert snapshot[0x05]["name"] == "Watch TV"


def test_refresh_devices_and_activities_have_identical_shape(monkeypatch) -> None:
    """The two refresh helpers must read from the same kind of source --
    direct proxy-state dicts, no stripping in between -- so backup /
    restore code can treat them interchangeably. This test pins the
    DoD invariant from the Phase 2 plan.
    """

    hub = _make_hub()
    raw_dev = b"\x01\x00\x01" + b"\xAA" * 117
    raw_act = b"\x01\x00\x01" + b"\xBB" * 117

    hub._proxy.state.devices[0x01] = {"name": "Dev", "raw_body": raw_dev}
    hub._proxy.state.activities[0x02] = {"name": "Act", "raw_body": raw_act}

    monkeypatch.setattr(hub._proxy, "request_devices", lambda *a, **kw: None)
    monkeypatch.setattr(hub._proxy, "request_activities", lambda: _complete_activity_request(hub))
    hub._devices_generation += 1

    dev_snapshot = hub.hass.loop.run_until_complete(
        hub._async_refresh_devices_snapshot(timeout_seconds=1.0)
    )
    act_snapshot = hub.hass.loop.run_until_complete(
        hub._async_refresh_activities_snapshot(timeout_seconds=1.0)
    )

    assert dev_snapshot[0x01]["raw_body"] is raw_dev
    assert act_snapshot[0x02]["raw_body"] is raw_act
