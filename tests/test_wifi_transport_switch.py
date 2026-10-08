"""Transport switch for Wifi Devices and the Wifi Events device
(docs/internal/wifi-events-transport-plan.md).

T0: requested_transport is the desired state, the store aligns stale
fields on load, the events record is seeded at creation, and the pending
switch is derived where MQTT availability is known.
T1: a deployed record whose desired transport differs takes the replace
path, the new device joins the old one's activities, every activity
reference moves onto it before the delete, and the stored hash follows
the target transport. A rejected move reverses and keeps the old device.
"""

from __future__ import annotations

import asyncio
import importlib
from types import SimpleNamespace

import pytest

import custom_components.sofabaton_x1s.wifi_deploy as wifi_deploy_module
from custom_components.sofabaton_x1s.command_config import (
    WIFI_EVENTS_DEVICE_KEY,
    WIFI_EVENTS_SLOT_COUNT,
    CommandConfigStore,
    compute_commands_hash,
    default_commands,
    wifi_transport_switch_pending,
)
from custom_components.sofabaton_x1s.hub import SofabatonHub
from custom_components.sofabaton_x1s.lib.activity_sync import (
    DEVICE_INPUT_REF_COMMAND,
    DEVICE_POWER_OFF_REF_COMMAND,
    DEVICE_POWER_ON_REF_COMMAND,
)
from custom_components.sofabaton_x1s.lib.wifi_inplace_plan import (
    retarget_device_refs,
    wifi_device_retarget_steps,
    wifi_membership_order_steps,
)
from custom_components.sofabaton_x1s.wifi_deploy import WifiSyncError
from tests.hub_fakes import FakeHass

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")
runtime_module = importlib.import_module("custom_components.sofabaton_x1s.runtime")
ws_wifi_module = importlib.import_module("custom_components.sofabaton_x1s.ws_wifi")

N = WIFI_EVENTS_SLOT_COUNT
OLD_ID = 11
NEW_ID = 9
ACT_ID = 0x65
OTHER_ACT = 0x66
OTHER_DEV = 5
PORT = 8060
OLD_HASH = "oldhash"
EVENT_NAMES = ["Movie Night", "Lights Off"]


def _run(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _store() -> CommandConfigStore:
    store = CommandConfigStore(SimpleNamespace())
    _run(store.async_load())
    return store


# ── T0: store ────────────────────────────────────────────────────────────


def test_switch_pending_matrix() -> None:
    deployed_http = {"deployed_device_id": 9, "deployed_transport": "http"}
    assert wifi_transport_switch_pending(
        {**deployed_http, "requested_transport": "mqtt"}, mqtt_available=True
    )
    # A wish for MQTT where MQTT cannot deploy is not pending.
    assert not wifi_transport_switch_pending(
        {**deployed_http, "requested_transport": "mqtt"}, mqtt_available=False
    )
    assert not wifi_transport_switch_pending(
        {**deployed_http, "requested_transport": "http"}, mqtt_available=True
    )
    # Back to HTTP never needs MQTT.
    assert wifi_transport_switch_pending(
        {"deployed_device_id": 9, "deployed_transport": "mqtt", "requested_transport": "http"},
        mqtt_available=False,
    )
    # Undeployed records never switch; the first deploy honours the wish.
    assert not wifi_transport_switch_pending(
        {"deployed_device_id": None, "deployed_commands_hash": "", "requested_transport": "mqtt"},
        mqtt_available=True,
    )
    # Legacy deployed record: absent deployed_transport reads as HTTP.
    assert wifi_transport_switch_pending(
        {"deployed_commands_hash": "abc", "requested_transport": "mqtt"}, mqtt_available=True
    )


def test_load_aligns_requested_with_deployed_once() -> None:
    class _Backing:
        def __init__(self, data):
            self.data = data
            self.saves = 0

        async def async_load(self):
            return self.data

        async def async_save(self, data):
            self.data = data
            self.saves += 1

    data = {
        "hubs": {
            "hub-1": {
                "devices": [
                    # Deployed over MQTT, stale create-flow default: aligned.
                    {"device_key": "a1", "deployed_device_id": 9, "deployed_transport": "mqtt",
                     "requested_transport": "http", "commands": []},
                    # Not deployed: the wish stays.
                    {"device_key": "b2", "deployed_device_id": None, "deployed_transport": None,
                     "requested_transport": "mqtt", "commands": []},
                    # Already aligned: untouched.
                    {"device_key": "c3", "deployed_device_id": 7, "deployed_transport": "http",
                     "requested_transport": "http", "commands": []},
                ]
            }
        }
    }
    store = CommandConfigStore(SimpleNamespace())
    backing = _Backing(data)
    store._store = backing
    _run(store.async_load())
    assert backing.saves == 1
    by_key = {d["device_key"]: d for d in _run(store.async_list_hub_devices("hub-1"))}
    assert by_key["a1"]["requested_transport"] == "mqtt"
    assert by_key["b2"]["requested_transport"] == "mqtt"
    assert by_key["c3"]["requested_transport"] == "http"

    # A second load with nothing to align saves nothing.
    store2 = CommandConfigStore(SimpleNamespace())
    backing2 = _Backing(backing.data)
    store2._store = backing2
    _run(store2.async_load())
    assert backing2.saves == 0


def test_events_record_is_seeded_at_creation_only() -> None:
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night", requested_transport="mqtt"))
    state = store.wifi_events_record_state("hub-1", roku_listen_port=PORT)
    assert state["requested_transport"] == "mqtt"
    assert state["deployed_transport"] is None
    # The second event does not reseed the record.
    _run(store.async_allocate_wifi_event("hub-1", "Lights Off", requested_transport="http"))
    state = store.wifi_events_record_state("hub-1", roku_listen_port=PORT)
    assert state["requested_transport"] == "mqtt"


def test_set_requested_transport_on_the_events_record() -> None:
    store = _store()
    _run(store.async_allocate_wifi_event("hub-1", "Movie Night"))
    payload = _run(store.async_get_hub_config("hub-1", device_key=WIFI_EVENTS_DEVICE_KEY))
    _run(
        store.async_save_deployed_wifi_commands(
            "hub-1", WIFI_EVENTS_DEVICE_KEY, payload["commands"],
            deployed_device_id=OLD_ID, commands_hash=payload["commands_hash"],
            request_port=PORT, deployed_transport="http",
        )
    )
    assert _run(store.async_set_requested_transport("hub-1", WIFI_EVENTS_DEVICE_KEY, "mqtt"))
    state = store.wifi_events_record_state("hub-1", roku_listen_port=PORT)
    # The hashes still agree: the switch is a separate signal.
    assert state["record_needs_sync"] is False
    assert state["requested_transport"] == "mqtt"
    assert state["deployed_transport"] == "http"
    assert wifi_transport_switch_pending(
        {"deployed_device_id": state["device_id"], **state}, mqtt_available=True
    )
    # Setting the deployed value back cancels the switch.
    assert _run(store.async_set_requested_transport("hub-1", WIFI_EVENTS_DEVICE_KEY, "http"))
    state = store.wifi_events_record_state("hub-1", roku_listen_port=PORT)
    assert not wifi_transport_switch_pending(
        {"deployed_device_id": state["device_id"], **state}, mqtt_available=True
    )


# ── T1: planner ──────────────────────────────────────────────────────────


def _activity_entry(
    act_id: int = ACT_ID, *, member: bool = True, long_id: int | None = None, joined: bool = False
) -> dict:
    """One activity_backup entry. ``joined`` mimics the read taken after the
    replacement device was added to the activity (it is then a member, so
    the planner plans no membership from the retarget)."""

    members = [OLD_ID, OTHER_DEV] if member else [OTHER_DEV]
    if joined:
        members.append(NEW_ID)
    return {
        "device": {"device_id": act_id, "name": "Watch TV"},
        "referenced_source_device_ids": members,
        "favorite_slots": [
            {"button_id": 1, "device_id": OLD_ID, "command_id": 2},
            {"button_id": 2, "device_id": OTHER_DEV, "command_id": 4},
        ],
        "button_bindings": [
            {
                "button_id": 0xB6,
                "device_id": OTHER_DEV,
                "command_id": 7,
                "long_press_device_id": OLD_ID,
                "long_press_command_id": long_id if long_id is not None else 1,
            },
            {"button_id": 0xB7, "device_id": OLD_ID, "command_id": 1},
        ],
        "macros": [
            {
                "button_id": 198,
                "steps": [
                    {"device_id": OLD_ID, "command_id": DEVICE_POWER_ON_REF_COMMAND, "duration": 0},
                    {"device_id": OLD_ID, "command_id": DEVICE_INPUT_REF_COMMAND, "duration": 1},
                    {"device_id": OLD_ID, "command_id": 2, "duration": 0},
                    {"device_id": OTHER_DEV, "command_id": 3, "duration": 0},
                    # Appended by add_device_to_activity for the replacement
                    # (the read is taken after the add).
                    *([
                        {"device_id": NEW_ID, "command_id": DEVICE_POWER_ON_REF_COMMAND, "duration": 0},
                        {"device_id": NEW_ID, "command_id": DEVICE_INPUT_REF_COMMAND, "duration": 1},
                    ] if joined else []),
                ],
            },
            {
                "button_id": 199,
                "steps": [
                    {"device_id": OTHER_DEV, "command_id": DEVICE_POWER_OFF_REF_COMMAND, "duration": 0},
                    {"device_id": OLD_ID, "command_id": DEVICE_POWER_OFF_REF_COMMAND, "duration": 0},
                    *([{"device_id": NEW_ID, "command_id": DEVICE_POWER_OFF_REF_COMMAND, "duration": 0}] if joined else []),
                ],
            },
        ],
    }


def test_retarget_moves_every_site_and_keeps_the_sequence_order() -> None:
    edited, changed = retarget_device_refs(
        _activity_entry(joined=True), old_device_id=OLD_ID, new_device_id=NEW_ID
    )
    assert changed
    favs = {(f["device_id"], f["command_id"]) for f in edited["favorite_slots"]}
    assert favs == {(NEW_ID, 2), (OTHER_DEV, 4)}
    long_leg = edited["button_bindings"][0]
    assert (long_leg["device_id"], long_leg["command_id"]) == (OTHER_DEV, 7)
    assert (long_leg["long_press_device_id"], long_leg["long_press_command_id"]) == (NEW_ID, 1)
    assert (edited["button_bindings"][1]["device_id"], edited["button_bindings"][1]["command_id"]) == (NEW_ID, 1)
    # The membership rows (power refs, input ref) move with the old device's
    # POSITION in the sequence; the copies the add appended are dropped
    # (bench_310 run 3: every power ref doubled otherwise).
    on_steps = [(s["device_id"], s["command_id"], s.get("duration")) for s in edited["macros"][0]["steps"]]
    assert on_steps == [
        (NEW_ID, DEVICE_POWER_ON_REF_COMMAND, 0),
        (NEW_ID, DEVICE_INPUT_REF_COMMAND, 1),
        (NEW_ID, 2, 0),
        (OTHER_DEV, 3, 0),
    ]
    off_steps = [(s["device_id"], s["command_id"]) for s in edited["macros"][1]["steps"]]
    assert off_steps == [(OTHER_DEV, DEVICE_POWER_OFF_REF_COMMAND), (NEW_ID, DEVICE_POWER_OFF_REF_COMMAND)]


def test_retarget_without_an_appended_copy_still_moves_membership_rows() -> None:
    # A read taken before the add (or a hub that did not append): the old
    # rows simply move, nothing is dropped.
    edited, changed = retarget_device_refs(
        _activity_entry(joined=False), old_device_id=OLD_ID, new_device_id=NEW_ID
    )
    assert changed
    on_steps = [(s["device_id"], s["command_id"]) for s in edited["macros"][0]["steps"]]
    assert on_steps == [
        (NEW_ID, DEVICE_POWER_ON_REF_COMMAND), (NEW_ID, DEVICE_INPUT_REF_COMMAND), (NEW_ID, 2), (OTHER_DEV, 3),
    ]


def test_retarget_folds_old_long_records_for_the_events_device() -> None:
    edited, changed = retarget_device_refs(
        _activity_entry(long_id=N + 2), old_device_id=OLD_ID, new_device_id=NEW_ID,
        fold_long_ids_at=N,
    )
    assert changed
    long_leg = edited["button_bindings"][0]
    assert (long_leg["long_press_device_id"], long_leg["long_press_command_id"]) == (NEW_ID, 2)


def test_retarget_ignores_activities_without_references() -> None:
    entry = _activity_entry()
    for fav in entry["favorite_slots"]:
        fav["device_id"] = OTHER_DEV
    for binding in entry["button_bindings"]:
        binding["device_id"] = OTHER_DEV
        binding.pop("long_press_device_id", None)
        binding.pop("long_press_command_id", None)
    for macro in entry["macros"]:
        macro["steps"] = [s for s in macro["steps"] if s["device_id"] != OLD_ID]
    _edited, changed = retarget_device_refs(entry, old_device_id=OLD_ID, new_device_id=NEW_ID)
    assert not changed
    assert wifi_device_retarget_steps([entry], old_device_id=OLD_ID, new_device_id=NEW_ID) == ()


def test_retarget_steps_write_only_moved_rows() -> None:
    steps = wifi_device_retarget_steps(
        [_activity_entry(joined=True)], old_device_id=OLD_ID, new_device_id=NEW_ID
    )
    assert steps
    assert all(step.kind != "remote_sync" for step in steps)
    kinds = {step.kind for step in steps}
    assert "binding_write" in kinds
    bindings = [s for s in steps if s.kind == "binding_write"]
    assert all(
        NEW_ID in (s.payload.get("device_id"), s.payload.get("long_press_device_id"))
        for s in bindings
    )
    # Every write is an activity write on the referencing activity, and
    # membership is never planned here (the add before the read did that).
    assert all(step.payload.get("activity_id") == ACT_ID for step in steps)
    assert "member_replay" not in kinds
    # The favorite moves as a delete of the old row plus an add of the new,
    # and the plan closes with the WHOLE quick-access order (the adds' sort
    # pages drop the other devices' entries otherwise).
    assert {s.payload.get("device_id") for s in steps if s.kind == "favorite_delete"} == {OLD_ID}
    assert {s.payload.get("device_id") for s in steps if s.kind == "favorite_add"} == {NEW_ID}
    assert steps[-1].kind == "favorite_order"
    assert [(e["device_id"], e["command_id"]) for e in steps[-1].payload["order"]] == [(NEW_ID, 2), (OTHER_DEV, 4)]


# ── T1: deploy ───────────────────────────────────────────────────────────


def _commands() -> list[dict]:
    commands = default_commands(N)
    for idx, name in enumerate(EVENT_NAMES):
        commands[idx]["name"] = name
    return commands


def _payload(*, requested: str = "mqtt", deployed: str = "http") -> dict:
    return {
        "device_key": WIFI_EVENTS_DEVICE_KEY,
        "device_name": "Wifi Events",
        "slot_count": N,
        "commands": _commands(),
        "commands_hash": OLD_HASH,
        "deployed_commands_hash": OLD_HASH,
        "deployed_device_id": OLD_ID,
        "deployed_request_port": PORT,
        "requested_transport": requested,
        "deployed_transport": deployed,
    }


def _device_entry() -> dict:
    return {
        "device": {"device_id": OLD_ID, "name": "Wifi Events", "brand": f"m3-{WIFI_EVENTS_DEVICE_KEY}-{OLD_HASH}"},
        "commands": [{"command_id": idx + 1, "command_label": slot["name"]} for idx, slot in enumerate(_commands())],
        "input_record": {"entries": [{"input_index": 0, "command_id": 2}]},
        "macros": [{"button_id": 198, "steps": []}, {"button_id": 199, "steps": []}],
        "button_bindings": [],
    }


class _Store:
    def __init__(self):
        self.saved: list[dict] = []

    def get_deployed_wifi_commands(self, entry_id, *, hub_device_id=None, device_key=None):
        return [{"name": slot["name"]} for slot in _commands()]

    async def async_list_hub_devices(self, entry_id, **_kwargs):
        return [
            {
                "device_key": WIFI_EVENTS_DEVICE_KEY,
                "deployed_device_id": OLD_ID,
                "deployed_commands_hash": OLD_HASH,
                "deployed_transport": "http",
                "requested_transport": "mqtt",
            }
        ]

    async def async_save_deployed_wifi_commands(self, entry_id, device_key, commands, **kwargs):
        self.saved.append({"device_key": device_key, "commands": commands, **kwargs})


def _make_hub(monkeypatch, loop, *, activity_entries, mqtt_available=True, plan_results=None):
    hass = FakeHass(loop)
    hub = SofabatonHub(hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False)
    hub.roku_server_enabled = True
    hub.activities = {int(e["device"]["device_id"]): {"name": "Watch TV"} for e in activity_entries}
    hub.wifi_mqtt_available = lambda: mqtt_available
    calls: list[str] = []
    store = _Store()
    by_id = {int(e["device"]["device_id"]): e for e in activity_entries}

    async def _snapshot(*_a, **_k):
        return {OLD_ID: {"brand": f"m3-{WIFI_EVENTS_DEVICE_KEY}-{OLD_HASH}", "name": "Wifi Events"}}

    async def _catalog(*_a, **_k):
        return dict(hub.activities)

    async def _get_store(*_a, **_k):
        return store

    monkeypatch.setattr(hub, "_async_refresh_devices_snapshot", _snapshot)
    monkeypatch.setattr(hub, "async_request_catalog", _catalog)
    monkeypatch.setattr(wifi_deploy_module, "async_get_command_config_store", _get_store)

    def _backup_device(dev_id, *, include_blobs=True, **_k):
        calls.append(f"backup:{dev_id}")
        return _device_entry() if int(dev_id) == OLD_ID else {"kind": "device_backup"}

    def _backup_activity(act_id, **_k):
        calls.append(f"read:{act_id}")
        entry = by_id.get(int(act_id))
        if entry is None:
            return None
        # After the replacement joined this activity the live read shows it
        # as a member with its membership rows appended (what the hub reports
        # after add_device_to_activity); after the old device's delete the
        # hub has cascaded the old device's rows away.
        joined = any(c.startswith(f"add:{int(act_id)}:{NEW_ID}:") for c in calls)
        deleted = f"delete:{OLD_ID}" in calls
        if joined or deleted:
            entry = _activity_entry(int(act_id), member=OLD_ID in entry["referenced_source_device_ids"], joined=joined)
        if any(c.startswith("plan:") for c in calls):
            # Phase 1 landed: favorites, bindings and command steps moved,
            # the old device's membership rows untouched.
            entry = retarget_device_refs(entry, old_device_id=OLD_ID, new_device_id=NEW_ID, membership="keep")[0]
        if deleted:
            entry["referenced_source_device_ids"] = [d for d in entry["referenced_source_device_ids"] if d != OLD_ID]
            entry["favorite_slots"] = [f for f in entry["favorite_slots"] if f["device_id"] != OLD_ID]
            entry["button_bindings"] = [r for r in entry["button_bindings"] if r.get("device_id") != OLD_ID and r.get("long_press_device_id") != OLD_ID]
            for macro in entry["macros"]:
                macro["steps"] = [st for st in macro["steps"] if st["device_id"] != OLD_ID]
        return entry

    monkeypatch.setattr(hub._proxy, "backup_device", _backup_device)
    monkeypatch.setattr(hub._proxy, "backup_activity", _backup_activity)
    monkeypatch.setattr(hub._proxy, "_refresh_catalog", lambda *_a, **_k: None)

    plans: list = []
    results = list(plan_results or [])

    def _run_plan(plan, progress_callback=None):
        plans.append(plan)
        calls.append(f"plan:{len(plan.steps)}")
        if results:
            return results.pop(0)
        return {"status": "success", "completed_steps": len(plan.steps), "total_steps": len(plan.steps)}

    monkeypatch.setattr(hub._proxy, "run_wifi_inplace_plan", _run_plan)

    created: list = []

    def _register_rows(kwargs):
        rows = {idx + 1: str(c["display_name"]) for idx, c in enumerate(kwargs.get("commands") or [])}
        hub._proxy.state.commands[NEW_ID] = rows
        hub._proxy._commands_complete.add(NEW_ID)

    async def _create_mqtt(*_a, **kwargs):
        calls.append("create:mqtt")
        created.append(("mqtt", kwargs))
        _register_rows(kwargs)
        return {"device_id": NEW_ID, "status": "success"}

    async def _create_http(*_a, **kwargs):
        calls.append("create:http")
        created.append(("http", kwargs))
        _register_rows(kwargs)
        return {"device_id": NEW_ID, "status": "success"}

    async def _add(act_id, dev_id, **kwargs):
        calls.append(f"add:{act_id}:{dev_id}:{kwargs.get('input_cmd_id')}")
        return {"status": "success"}

    async def _delete(dev_id, *_a, **_k):
        calls.append(f"delete:{dev_id}")
        return {"status": "success", "impacted_activities": []}

    async def _noop(*_a, **_k):
        return None

    async def _false(*_a, **_k):
        return False

    monkeypatch.setattr(hub, "async_create_wifi_mqtt_device", _create_mqtt)
    monkeypatch.setattr(hub, "async_create_wifi_device", _create_http)
    monkeypatch.setattr(hub, "async_add_device_to_activity", _add)
    monkeypatch.setattr(hub, "async_delete_device", _delete)
    monkeypatch.setattr(hub, "async_fetch_device_commands", _noop)
    monkeypatch.setattr(hub, "_async_fetch_activity_commands", _noop)
    monkeypatch.setattr(hub, "async_request_favorites_order", _noop)
    monkeypatch.setattr(hub, "async_resync_remote", _noop)
    monkeypatch.setattr(hub, "_async_persist_cache_if_enabled", _noop)
    monkeypatch.setattr(hub, "_async_warm_devices_snapshot", _noop)
    monkeypatch.setattr(hub, "async_update_wifi_mqtt_ingress", _noop)
    monkeypatch.setattr(hub, "_async_wifi_listener_needed", _false)

    async def _listener(enable):
        calls.append(f"listener:{'on' if enable else 'off'}")

    monkeypatch.setattr(hub, "async_set_roku_server_enabled", _listener)
    hub._calls = calls
    hub._plans = plans
    hub._created = created
    hub._store = store
    return hub


def _sync(hub, payload):
    return hub.async_sync_command_config(
        command_payload=payload, request_port=PORT,
        device_key=WIFI_EVENTS_DEVICE_KEY, device_name="Wifi Events",
    )


def test_select_transport_matrix(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    hub = _make_hub(monkeypatch, loop, activity_entries=[])
    pick = hub._select_wifi_command_transport
    assert pick(_payload(requested="mqtt", deployed="http")) == "mqtt"
    assert pick(_payload(requested="http", deployed="mqtt")) == "http"
    assert pick(_payload(requested="http", deployed="http")) == "http"
    hub.wifi_mqtt_available = lambda: False
    # The wish survives in the store but this deploy keeps HTTP.
    assert pick(_payload(requested="mqtt", deployed="http")) == "http"
    assert pick(_payload(requested="http", deployed="mqtt")) == "http"
    undeployed = {**_payload(requested="mqtt"), "deployed_device_id": None, "deployed_commands_hash": "", "deployed_transport": None}
    assert pick(undeployed) == "http"
    hub.wifi_mqtt_available = lambda: True
    assert pick(undeployed) == "mqtt"
    loop.close()


def test_switch_to_mqtt_moves_references_before_the_delete(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _make_hub(
        monkeypatch, loop,
        activity_entries=[_activity_entry(ACT_ID), _activity_entry(OTHER_ACT, member=False)],
    )
    result = loop.run_until_complete(_sync(hub, _payload()))
    loop.close()

    assert result["status"] == "success"
    assert result["wifi_device_id"] == NEW_ID
    calls = hub._calls
    # Replace path, MQTT create, membership from the live read (input carried
    # over), references moved, then the delete.
    assert calls.index("create:mqtt") < calls.index(f"add:{ACT_ID}:{NEW_ID}:2")
    assert not any(c.startswith(f"add:{OTHER_ACT}:") for c in calls)
    plan_calls = [c for c in calls if c.startswith("plan:")]
    # Two plans: the reference move while the old device is still a member,
    # then (after the delete) the power-sequence order.
    assert len(plan_calls) == 2
    assert calls.index(plan_calls[0]) > calls.index(f"add:{ACT_ID}:{NEW_ID}:2")
    assert calls.index(plan_calls[0]) < calls.index(f"delete:{OLD_ID}")
    assert calls.index(plan_calls[1]) > calls.index(f"delete:{OLD_ID}")
    assert f"delete:{NEW_ID}" not in calls
    # Plan 1 never touches the old device's membership rows (the hub would
    # cascade its favorites away before the favorite writes).
    for step in hub._plans[0].steps:
        if step.kind == "macro_write":
            keys = [(st["device_id"], st["command_id"]) for st in step.payload["steps"]]
            assert (OLD_ID, DEVICE_POWER_ON_REF_COMMAND) in keys or (OLD_ID, DEVICE_POWER_OFF_REF_COMMAND) in keys
    # Plan 2 is order only: the new device's rows where the old ones stood.
    assert {step.kind for step in hub._plans[1].steps} == {"macro_write"}
    on_macro = next(st for st in hub._plans[1].steps if st.payload["button_id"] == 198)
    assert [(st["device_id"], st["command_id"]) for st in on_macro.payload["steps"]] == [
        (NEW_ID, DEVICE_POWER_ON_REF_COMMAND), (NEW_ID, DEVICE_INPUT_REF_COMMAND), (NEW_ID, 2), (OTHER_DEV, 3),
    ]
    # Every planned write targets the referencing activity and the new id.
    steps = hub._plans[0].steps
    # Both activities reference the old device, so both get their rows
    # moved; only the member activity got the add.
    assert steps and {step.payload.get("activity_id") for step in steps} == {ACT_ID, OTHER_ACT}
    assert "member_replay" not in {step.kind for step in steps}
    for step in steps:
        if step.kind == "binding_write":
            assert NEW_ID in (step.payload.get("device_id"), step.payload.get("long_press_device_id"))
            assert OLD_ID not in (step.payload.get("device_id"), step.payload.get("long_press_device_id"))
    # The store records the switch with the hash of the target transport.
    saved = hub._store.saved[-1]
    assert saved["deployed_transport"] == "mqtt"
    assert saved["request_port"] is None
    assert saved["deployed_device_id"] == NEW_ID
    assert saved["commands_hash"] == compute_commands_hash(
        _commands(), device_name="Wifi Events", roku_listen_port=0,
        slot_count=N, single_record=True,
    )
    assert saved["commands_hash"] != OLD_HASH
    # The created device carries the brand with that hash.
    assert hub._created[0][1]["brand_name"].endswith(saved["commands_hash"])
    progress = hub.get_command_sync_progress(WIFI_EVENTS_DEVICE_KEY)
    assert progress["transport_switch"] == "mqtt"
    assert progress["status"] == "success"
    # Nothing deployed needs the HTTP listener any more: the epilogue turns
    # it off (bench_311: it stayed on after the events device moved to
    # MQTT, the check only ran on the zero-slot teardown).
    assert calls[-1] == "listener:off"


def test_switch_back_to_http_creates_an_http_device(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _make_hub(monkeypatch, loop, activity_entries=[_activity_entry(ACT_ID)])

    async def _needed(*_a, **_k):
        return True

    monkeypatch.setattr(hub, "_async_wifi_listener_needed", _needed)
    result = loop.run_until_complete(_sync(hub, _payload(requested="http", deployed="mqtt")))
    loop.close()

    assert result["status"] == "success"
    assert "create:http" in hub._calls
    # The HTTP device needs the listener: the epilogue leaves it on.
    assert "listener:off" not in hub._calls
    saved = hub._store.saved[-1]
    assert saved["deployed_transport"] == "http"
    assert saved["request_port"] == PORT
    assert saved["commands_hash"] == compute_commands_hash(
        _commands(), device_name="Wifi Events", roku_listen_port=PORT,
        slot_count=N, single_record=True,
    )


def test_rejected_move_reverses_and_keeps_the_old_device(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _make_hub(
        monkeypatch, loop, activity_entries=[_activity_entry(ACT_ID)],
        plan_results=[{"status": "failed", "message": "hub rejected binding"}],
    )
    with pytest.raises(WifiSyncError) as err:
        loop.run_until_complete(_sync(hub, _payload()))
    loop.close()

    assert err.value.code == "retarget_failed"
    calls = hub._calls
    assert f"delete:{OLD_ID}" not in calls
    assert f"delete:{NEW_ID}" in calls
    # Two plans ran: the move and its reversal (planned from a fresh read,
    # which in this harness still shows the old ids, so it is a no-op plan
    # or a plan back onto the old device, never onto the deleted one).
    assert len(hub._plans) >= 1
    assert hub._store.saved == []
    progress = hub.get_command_sync_progress(WIFI_EVENTS_DEVICE_KEY)
    assert progress["status"] == "failed"
    assert progress["error_code"] == "retarget_failed"


def test_switch_aborts_when_the_activities_cannot_be_read(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _make_hub(monkeypatch, loop, activity_entries=[_activity_entry(ACT_ID)])
    monkeypatch.setattr(hub._proxy, "backup_activity", lambda *_a, **_k: None)
    with pytest.raises(WifiSyncError) as err:
        loop.run_until_complete(_sync(hub, _payload()))
    loop.close()

    assert err.value.code == "hub_no_answer"
    assert f"delete:{OLD_ID}" not in hub._calls
    assert f"delete:{NEW_ID}" in hub._calls


def test_no_switch_when_mqtt_is_unavailable(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _make_hub(monkeypatch, loop, activity_entries=[], mqtt_available=False)

    async def _inplace(**_kwargs):
        hub._calls.append("inplace")
        return {"status": "success", "wifi_device_id": OLD_ID, "commands_hash": OLD_HASH, "inplace": True}

    monkeypatch.setattr(hub, "_async_try_inplace_command_sync", _inplace)
    result = loop.run_until_complete(_sync(hub, _payload()))
    loop.close()
    assert result["inplace"] is True
    assert "create:mqtt" not in hub._calls
    assert hub.get_command_sync_progress(WIFI_EVENTS_DEVICE_KEY)["transport_switch"] is None


# ── T0: WebSocket ────────────────────────────────────────────────────────


class _Conn:
    def __init__(self):
        self.result = None
        self.error = None

    def send_result(self, msg_id, payload):
        self.result = (msg_id, payload)

    def send_error(self, msg_id, code, message):
        self.error = (msg_id, code, message)


class _WsHub:
    def __init__(self, *, mqtt_available: bool):
        self.entry_id = "entry-1"
        self.version = "X2"
        self._mqtt = mqtt_available
        self.activities = {}

    def wifi_mqtt_available(self):
        return self._mqtt

    def get_managed_command_hashes(self):
        return []

    def get_command_sync_progress(self, _device_key):
        return {}


def _ws_setup(monkeypatch, *, mqtt_available: bool):
    store = _store()
    hub = _WsHub(mqtt_available=mqtt_available)

    async def fake_resolve(_hass, _data):
        return hub

    async def fake_store(_hass):
        return store

    monkeypatch.setattr(runtime_module, "_async_resolve_hub_from_data", fake_resolve)
    monkeypatch.setattr(runtime_module, "_async_get_command_config_store", fake_store)
    monkeypatch.setattr(runtime_module, "_resolve_roku_listen_port", lambda _hass, _entry: PORT)
    return store, hub


def _msg(**kwargs):
    return {"id": 1, "entity_id": "remote.hub", **kwargs}


def _deploy(store, device_key, *, transport):
    payload = _run(store.async_get_hub_config("entry-1", device_key=device_key, roku_listen_port=PORT))
    _run(
        store.async_save_deployed_wifi_commands(
            "entry-1", device_key, payload["commands"], deployed_device_id=OLD_ID,
            commands_hash=payload["commands_hash"],
            request_port=None if transport == "mqtt" else PORT, deployed_transport=transport,
        )
    )


def test_ws_set_transport_events_record(monkeypatch) -> None:
    store, _hub = _ws_setup(monkeypatch, mqtt_available=True)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    _deploy(store, WIFI_EVENTS_DEVICE_KEY, transport="http")

    conn = _Conn()
    _run(ws_wifi_module._ws_set_command_transport(None, conn, _msg(device_key=WIFI_EVENTS_DEVICE_KEY, transport="mqtt")))
    assert conn.error is None
    state = conn.result[1]
    assert state["requested_transport"] == "mqtt"
    assert state["deployed_transport"] == "http"
    assert state["transport_switch_pending"] is True
    assert state["record_needs_sync"] is True
    assert state["mqtt_available"] is True
    assert [e["name"] for e in state["events"]] == ["Movie Night"]

    conn = _Conn()
    _run(ws_wifi_module._ws_set_command_transport(None, conn, _msg(device_key=WIFI_EVENTS_DEVICE_KEY, transport="http")))
    state = conn.result[1]
    assert state["transport_switch_pending"] is False
    assert state["record_needs_sync"] is False


def test_ws_set_transport_refuses_mqtt_when_unavailable(monkeypatch) -> None:
    store, _hub = _ws_setup(monkeypatch, mqtt_available=False)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    conn = _Conn()
    _run(ws_wifi_module._ws_set_command_transport(None, conn, _msg(device_key=WIFI_EVENTS_DEVICE_KEY, transport="mqtt")))
    assert conn.error is not None
    assert conn.error[1] == "mqtt_unavailable"
    assert store.wifi_events_record_state("entry-1", roku_listen_port=PORT)["requested_transport"] == "http"


def test_ws_set_transport_user_device_row(monkeypatch) -> None:
    store, _hub = _ws_setup(monkeypatch, mqtt_available=True)
    created = _run(store.async_create_hub_device("entry-1", "Lights", roku_listen_port=PORT))
    key = created["device_key"]
    _run(store.async_set_hub_commands("entry-1", [{"name": "On"}], device_key=key, roku_listen_port=PORT))
    _deploy(store, key, transport="http")

    conn = _Conn()
    _run(ws_wifi_module._ws_set_command_transport(None, conn, _msg(device_key=key, transport="mqtt")))
    assert conn.error is None
    row = conn.result[1]
    assert row["device_key"] == key
    assert row["requested_transport"] == "mqtt"
    assert row["deployed_transport"] == "http"
    assert row["transport_switch_pending"] is True
    assert row["sync_needed"] is True

    conn = _Conn()
    _run(ws_wifi_module._ws_set_command_transport(None, conn, _msg(device_key="nope", transport="mqtt")))
    assert conn.error is not None and conn.error[1] == "not_found"


def test_ws_pending_switch_is_not_pending_without_mqtt(monkeypatch) -> None:
    store, hub = _ws_setup(monkeypatch, mqtt_available=True)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    _deploy(store, WIFI_EVENTS_DEVICE_KEY, transport="http")
    _run(store.async_set_requested_transport("entry-1", WIFI_EVENTS_DEVICE_KEY, "mqtt"))
    hub._mqtt = False
    conn = _Conn()
    _run(integration._ws_list_wifi_events(None, conn, _msg()))
    state = conn.result[1]
    assert state["requested_transport"] == "mqtt"
    assert state["transport_switch_pending"] is False
    assert state["record_needs_sync"] is False
    assert state["mqtt_available"] is False


def test_ws_create_default_follows_a_deployed_mqtt_device(monkeypatch) -> None:
    # No MQTT device on the hub: HTTP, even with MQTT available.
    store, _hub = _ws_setup(monkeypatch, mqtt_available=True)
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    assert conn.result[1]["requested_transport"] == "http"

    # A user device deployed over MQTT: the events device follows.
    store, _hub = _ws_setup(monkeypatch, mqtt_available=True)
    created = _run(store.async_create_hub_device("entry-1", "Lights", roku_listen_port=PORT))
    _run(store.async_set_requested_transport("entry-1", created["device_key"], "mqtt"))
    _deploy(store, created["device_key"], transport="mqtt")
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    assert conn.result[1]["requested_transport"] == "mqtt"

    # MQTT unavailable: HTTP regardless of other devices.
    store, _hub = _ws_setup(monkeypatch, mqtt_available=False)
    created = _run(store.async_create_hub_device("entry-1", "Lights", roku_listen_port=PORT))
    _deploy(store, created["device_key"], transport="mqtt")
    conn = _Conn()
    _run(integration._ws_create_wifi_event(None, conn, _msg(name="Movie Night")))
    assert conn.result[1]["requested_transport"] == "http"


# ── membership modes and the post-delete order restore ──────────────────


def test_retarget_keep_leaves_the_old_membership_rows_alone() -> None:
    edited, changed = retarget_device_refs(
        _activity_entry(joined=True), old_device_id=OLD_ID, new_device_id=NEW_ID, membership="keep"
    )
    assert changed
    on_steps = [(s["device_id"], s["command_id"]) for s in edited["macros"][0]["steps"]]
    # The old device keeps its power-on and input rows (still a member), the
    # command step moves, the appended copies stay.
    assert on_steps == [
        (OLD_ID, DEVICE_POWER_ON_REF_COMMAND), (OLD_ID, DEVICE_INPUT_REF_COMMAND), (NEW_ID, 2), (OTHER_DEV, 3),
        (NEW_ID, DEVICE_POWER_ON_REF_COMMAND), (NEW_ID, DEVICE_INPUT_REF_COMMAND),
    ]
    off_steps = [(s["device_id"], s["command_id"]) for s in edited["macros"][1]["steps"]]
    assert off_steps == [(OTHER_DEV, DEVICE_POWER_OFF_REF_COMMAND), (OLD_ID, DEVICE_POWER_OFF_REF_COMMAND), (NEW_ID, DEVICE_POWER_OFF_REF_COMMAND)]
    steps = wifi_device_retarget_steps([_activity_entry(joined=True)], old_device_id=OLD_ID, new_device_id=NEW_ID)
    kinds = {s.kind for s in steps}
    assert "favorite_add" in kinds and "binding_write" in kinds
    for step in steps:
        if step.kind == "macro_write":
            keys = [(st["device_id"], st["command_id"]) for st in step.payload["steps"]]
            assert (OLD_ID, DEVICE_POWER_ON_REF_COMMAND) in keys


def _post_delete_entry() -> dict:
    entry = _activity_entry(joined=True)
    entry["referenced_source_device_ids"] = [OTHER_DEV, NEW_ID]
    entry["favorite_slots"] = [{"button_id": 2, "device_id": OTHER_DEV, "command_id": 4}, {"button_id": 4, "device_id": NEW_ID, "command_id": 2}]
    entry["button_bindings"] = [
        {"button_id": 0xB6, "device_id": OTHER_DEV, "command_id": 7, "long_press_device_id": NEW_ID, "long_press_command_id": 1},
        {"button_id": 0xB7, "device_id": NEW_ID, "command_id": 1},
    ]
    # the command step was moved by phase 1; the old device's rows are gone
    entry["macros"][0]["steps"] = [st if st["command_id"] != 2 else {**st, "device_id": NEW_ID} for st in entry["macros"][0]["steps"]]
    for macro in entry["macros"]:
        macro["steps"] = [st for st in macro["steps"] if st["device_id"] != OLD_ID]
    # the hub listed the new device's power-off row first
    entry["macros"][1]["steps"] = list(reversed(entry["macros"][1]["steps"]))
    return entry


def test_membership_order_steps_put_the_new_device_where_the_old_one_stood() -> None:
    pre = _activity_entry()
    post = _post_delete_entry()
    assert [(s["device_id"], s["command_id"]) for s in post["macros"][0]["steps"]] == [
        (NEW_ID, 2), (OTHER_DEV, 3), (NEW_ID, DEVICE_POWER_ON_REF_COMMAND), (NEW_ID, DEVICE_INPUT_REF_COMMAND),
    ]
    steps = wifi_membership_order_steps([pre], [post], old_device_id=OLD_ID, new_device_id=NEW_ID)
    assert {s.kind for s in steps} == {"macro_write"}
    on_macro = next(s for s in steps if s.payload["button_id"] == 198)
    assert [(st["device_id"], st["command_id"], st.get("duration")) for st in on_macro.payload["steps"]] == [
        (NEW_ID, DEVICE_POWER_ON_REF_COMMAND, 0), (NEW_ID, DEVICE_INPUT_REF_COMMAND, 1), (NEW_ID, 2, 0), (OTHER_DEV, 3, 0),
    ]
    off_macro = next(s for s in steps if s.payload["button_id"] == 199)
    assert [(st["device_id"], st["command_id"]) for st in off_macro.payload["steps"]] == [
        (OTHER_DEV, DEVICE_POWER_OFF_REF_COMMAND), (NEW_ID, DEVICE_POWER_OFF_REF_COMMAND),
    ]


def test_membership_order_steps_skip_a_macro_whose_live_rows_changed() -> None:
    pre = _activity_entry()
    post = _post_delete_entry()
    # The hub holds a row the pre-read never saw: never write a stale copy.
    post["macros"][0]["steps"].append({"device_id": OTHER_DEV, "command_id": 9, "duration": 0})
    steps = wifi_membership_order_steps([pre], [post], old_device_id=OLD_ID, new_device_id=NEW_ID)
    assert [s.payload["button_id"] for s in steps if s.kind == "macro_write"] == [199]
    # Already in order: nothing to write.
    assert wifi_membership_order_steps([pre], [post], old_device_id=OLD_ID, new_device_id=99) == ()


def test_config_favorites_and_bindings_moved_by_the_retarget_are_not_added_again(monkeypatch) -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hub = _make_hub(monkeypatch, loop, activity_entries=[_activity_entry(ACT_ID)])
    fav_calls: list[tuple[int, int]] = []
    btn_calls: list[tuple[int, int]] = []

    async def _fav(act_id, dev_id, command_id, **_k):
        fav_calls.append((act_id, command_id))
        return {"fav_id": 50 + command_id}

    async def _btn(act_id, button_id, *_a, **_k):
        btn_calls.append((act_id, button_id))
        return {"status": "success"}

    async def _order(*_a, **_k):
        return []

    monkeypatch.setattr(hub, "async_command_to_favorite", _fav)
    monkeypatch.setattr(hub, "async_command_to_button", _btn)
    monkeypatch.setattr(hub, "async_request_favorites_order", _order)
    payload = _payload()
    # Slot config: command 2 is a favorite the old device already had in the
    # activity (moved by the retarget); command 3 is a favorite the config
    # adds fresh; the GREEN button binding (0xBF = 191) is moved too.
    payload["commands"][1]["add_as_favorite"] = True
    payload["commands"][1]["activities"] = [str(ACT_ID)]
    payload["commands"][2]["add_as_favorite"] = True
    payload["commands"][2]["activities"] = [str(ACT_ID)]
    # CH_UP (0xB7) is the binding the old device had in the activity.
    payload["commands"][0]["hard_button"] = "chup"
    payload["commands"][0]["activities"] = [str(ACT_ID)]
    payload["commands"][0]["add_as_favorite"] = False
    result = loop.run_until_complete(_sync(hub, payload))
    loop.close()
    assert result["status"] == "success"
    assert fav_calls == [(ACT_ID, 3)]
    assert (ACT_ID, 0xB7) not in btn_calls
