"""Wifi Events as single records: deploy and long-record retirement.

docs/internal/wifi-events-single-record-plan.md S1 (the events device
deploys one record per event) and S2 (the user's Sync retires the long
records of the old layout, moving every reference to one onto its event's
record before the deletes).
"""

from __future__ import annotations

import asyncio

import custom_components.sofabaton_x1s.wifi_deploy as wifi_deploy_module
from custom_components.sofabaton_x1s.command_config import (
    WIFI_EVENTS_DEVICE_KEY,
    WIFI_EVENTS_SLOT_COUNT,
    default_commands,
)
from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.lib.wifi_inplace_plan import (
    desired_snapshot_from_config,
    retarget_long_record_refs,
    wifi_events_retarget_steps,
)
from tests.hub_fakes import FakeHass

N = WIFI_EVENTS_SLOT_COUNT
OLD_HASH = "oldhash"
NEW_HASH = "newhash"
DEV_ID = 11
ACT_ID = 0x65
OTHER_DEV = 5
PORT = 8060
EVENT_NAMES = ["Movie Night", "Lights Off"]


def _run(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _commands() -> list[dict]:
    commands = default_commands(N)
    for idx, name in enumerate(EVENT_NAMES):
        commands[idx]["name"] = name
    return commands


def _names() -> list[str]:
    return [slot["name"] for slot in _commands()]


def _activity_entry(*, long_id: int = 27, favorite_id: int = 2) -> dict:
    return {
        "device": {"device_id": ACT_ID, "name": "Watch TV"},
        "favorite_slots": [{"button_id": 1, "device_id": DEV_ID, "command_id": favorite_id}],
        "button_bindings": [
            {
                "button_id": 0xB6,
                "device_id": OTHER_DEV,
                "command_id": 7,
                "long_press_device_id": DEV_ID,
                "long_press_command_id": long_id,
            }
        ],
        "macros": [],
    }


# ── pure planner ─────────────────────────────────────────────────────────


def test_desired_snapshot_without_long_records() -> None:
    config = {"commands": _commands()}
    legacy = desired_snapshot_from_config(
        config, device_id=DEV_ID, device_name="Wifi Events", brand="b",
        hard_button_codes={}, slot_count=N, long_press_offset=N,
    )
    single = desired_snapshot_from_config(
        config, device_id=DEV_ID, device_name="Wifi Events", brand="b",
        hard_button_codes={}, slot_count=N, long_press_offset=N, long_records=False,
    )
    assert sorted(legacy.slots) == list(range(1, 2 * N + 1))
    assert sorted(single.slots) == list(range(1, N + 1))
    assert single.slots[1].label == "Movie Night"


def test_retarget_moves_every_long_reference() -> None:
    entry = _activity_entry()
    entry["macros"] = [
        {"button_id": 3, "steps": [{"device_id": DEV_ID, "command_id": 26}, {"device_id": 0xFF}]}
    ]
    entry["button_bindings"].append(
        {"button_id": 0xB7, "device_id": DEV_ID, "command_id": 28}
    )
    edited, changed = retarget_long_record_refs(entry, device_id=DEV_ID, slot_count=N)
    assert changed is True
    assert edited["button_bindings"][0]["long_press_command_id"] == 2
    assert edited["button_bindings"][0]["command_id"] == 7  # another device's leg
    assert edited["button_bindings"][1]["command_id"] == 3
    assert edited["macros"][0]["steps"][0]["command_id"] == 1
    assert edited["favorite_slots"][0]["command_id"] == 2  # short ids stay
    # the input is never mutated
    assert entry["button_bindings"][0]["long_press_command_id"] == 27


def test_retarget_ignores_other_devices_and_short_ids() -> None:
    entry = _activity_entry(long_id=3)
    entry["button_bindings"][0]["long_press_device_id"] = OTHER_DEV
    entry["button_bindings"][0]["long_press_command_id"] = 30
    _edited, changed = retarget_long_record_refs(entry, device_id=DEV_ID, slot_count=N)
    assert changed is False
    assert wifi_events_retarget_steps([entry], device_id=DEV_ID, slot_count=N) == ()


def test_retarget_steps_rewrite_the_long_leg_only() -> None:
    steps = wifi_events_retarget_steps([_activity_entry()], device_id=DEV_ID, slot_count=N)
    assert [step.kind for step in steps] == ["binding_write"]
    payload = steps[0].payload
    assert payload["activity_id"] == ACT_ID
    assert (payload["device_id"], payload["command_id"]) == (OTHER_DEV, 7)
    assert (payload["long_press_device_id"], payload["long_press_command_id"]) == (DEV_ID, 2)


# ── deploy ───────────────────────────────────────────────────────────────


class _Store:
    def __init__(self):
        self.saved: list[dict] = []

    def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
        return [{"name": name} for name in _names()]

    async def async_list_hub_devices(self, entry_id):
        return [
            {
                "device_key": WIFI_EVENTS_DEVICE_KEY,
                "deployed_device_id": DEV_ID,
                "deployed_commands_hash": OLD_HASH,
            }
        ]

    async def async_save_deployed_wifi_commands(self, entry_id, device_key, commands, **kwargs):
        self.saved.append({"device_key": device_key, "commands": commands, **kwargs})


def _device_entry(*, long_records: bool = True) -> dict:
    rows = [{"command_id": idx + 1, "command_label": name} for idx, name in enumerate(_names())]
    if long_records:
        rows += [
            {"command_id": idx + 1 + N, "command_label": f"{name} Long Press"}
            for idx, name in enumerate(_names())
        ]
    return {
        "device": {
            "device_id": DEV_ID,
            "name": "Wifi Events",
            "brand": f"m3-{WIFI_EVENTS_DEVICE_KEY}-{OLD_HASH}",
        },
        "commands": rows,
        "input_record": {"entries": []},
        "macros": [{"button_id": 198, "steps": []}, {"button_id": 199, "steps": []}],
        "button_bindings": [],
    }


def _payload() -> dict:
    return {
        "device_key": WIFI_EVENTS_DEVICE_KEY,
        "slot_count": N,
        "commands": _commands(),
        "commands_hash": NEW_HASH,
        "deployed_commands_hash": OLD_HASH,
        "deployed_device_id": DEV_ID,
        "deployed_request_port": PORT,
    }


def _make_hub(monkeypatch, loop, *, device_entry, activity_entries, managed=True):
    hass = FakeHass(loop)
    hub = SofabatonHub(
        hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False,
    )
    hub.roku_server_enabled = True
    hub.activities = {
        int(entry["device"]["device_id"]): {"name": "Watch TV"} for entry in activity_entries
    }
    snapshot = (
        {DEV_ID: {"brand": f"m3-{WIFI_EVENTS_DEVICE_KEY}-{OLD_HASH}", "name": "Wifi Events"}}
        if managed
        else {}
    )

    async def _snapshot(*_args, **_kwargs):
        return dict(snapshot)

    async def _catalog(*_args, **_kwargs):
        return dict(hub.activities)

    store = _Store()

    async def _get_store(*_args, **_kwargs):
        return store

    by_id = {int(entry["device"]["device_id"]): entry for entry in activity_entries}
    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _snapshot)
    monkeypatch.setattr(hub, "async_request_catalog", _catalog)
    monkeypatch.setattr(wifi_deploy_module, "async_get_command_config_store", _get_store)
    monkeypatch.setattr(hub._proxy, "backup_device", lambda *_a, **_k: device_entry)
    monkeypatch.setattr(hub._proxy, "backup_activity", lambda act_id, **_k: by_id.get(int(act_id)))
    monkeypatch.setattr(hub._proxy, "_refresh_catalog", lambda *_a, **_k: None)

    plans: list = []

    def _run_plan(plan, progress_callback=None):
        plans.append(plan)
        return {"status": "success", "completed_steps": len(plan.steps),
                "total_steps": len(plan.steps), "counters": {}}

    monkeypatch.setattr(hub._proxy, "run_wifi_inplace_plan", _run_plan)

    created: list = []

    async def _create(*_args, **kwargs):
        created.append(kwargs)
        return {"device_id": 9, "status": "success"}

    async def _noop(*_args, **_kwargs):
        return None

    monkeypatch.setattr(hub, "async_create_wifi_device", _create)
    monkeypatch.setattr(hub, "async_fetch_device_commands", _noop)
    monkeypatch.setattr(hub, "_async_fetch_activity_commands", _noop)
    monkeypatch.setattr(hub, "async_request_favorites_order", _noop)
    monkeypatch.setattr(hub, "async_resync_remote", _noop)
    monkeypatch.setattr(hub, "_async_persist_cache_if_enabled", _noop)
    monkeypatch.setattr(hub, "_async_warm_devices_snapshot", _noop)
    hub._plans = plans
    hub._created = created
    return hub


def _sync(hub):
    return hub.async_sync_command_config(
        command_payload=_payload(),
        request_port=PORT,
        device_key=WIFI_EVENTS_DEVICE_KEY,
        device_name="Wifi Events",
    )


def test_sync_retires_long_records_after_retargeting(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _make_hub(
        monkeypatch, loop,
        device_entry=_device_entry(long_records=True),
        activity_entries=[_activity_entry()],
    )
    result = loop.run_until_complete(_sync(hub))
    loop.close()

    assert result["inplace"] is True
    steps = hub._plans[0].steps
    kinds = [step.kind for step in steps]
    # The long leg moves 27 -> 2 before any record goes away.
    assert kinds[0] == "binding_write"
    assert steps[0].payload["long_press_command_id"] == 2
    deletes = [step.payload["command_id"] for step in steps if step.kind == "command_delete"]
    assert deletes == list(range(N + 1, 2 * N + 1))
    assert kinds.index("command_delete") > kinds.index("binding_write")
    assert kinds[-1] == "wifi_head_commit"


def test_sync_without_long_references_only_deletes(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    entry = _activity_entry(long_id=2)  # already on the short record
    hub = _make_hub(
        monkeypatch, loop,
        device_entry=_device_entry(long_records=True),
        activity_entries=[entry],
    )
    loop.run_until_complete(_sync(hub))
    loop.close()

    kinds = {step.kind for step in hub._plans[0].steps}
    assert "binding_write" not in kinds
    assert "command_delete" in kinds


def test_sync_after_retirement_writes_no_records(monkeypatch) -> None:
    # The hub already holds the single-record layout: missing long records
    # are neither drift nor something to re-add.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _make_hub(
        monkeypatch, loop,
        device_entry=_device_entry(long_records=False),
        activity_entries=[_activity_entry(long_id=2)],
    )
    result = loop.run_until_complete(_sync(hub))
    loop.close()

    assert result["inplace"] is True
    assert [step.kind for step in hub._plans[0].steps] == ["wifi_head_commit"]


def test_first_deploy_creates_one_record_per_event(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _make_hub(
        monkeypatch, loop,
        device_entry=_device_entry(),
        activity_entries=[],
        managed=False,
    )
    payload = _payload()
    payload["deployed_device_id"] = None
    payload["deployed_commands_hash"] = ""

    async def _go():
        try:
            await hub.async_sync_command_config(
                command_payload=payload,
                request_port=PORT,
                device_key=WIFI_EVENTS_DEVICE_KEY,
                device_name="Wifi Events",
            )
        except Exception:  # noqa: BLE001 - only the create call matters here
            pass

    loop.run_until_complete(_go())
    loop.close()

    defs = hub._created[0]["commands"]
    assert len(defs) == N
    assert {row["press_type"] for row in defs} == {"short"}
