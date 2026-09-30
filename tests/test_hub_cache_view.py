"""Read-only cache projections (hub_cache_view.py)."""

import asyncio

from custom_components.sofabaton_x1s.hub import SofabatonHub
from tests.hub_fakes import FakeHass


def test_describe_favorites_order_includes_favorites_and_macros() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
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

    act_lo = 0x65
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x06, "source": "activity_map"},
    ]
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x06, "Command 6")
    hub._proxy.state.replace_activity_macros(
        act_lo,
        [{"command_id": 0x09, "label": "Test Macro"}],
    )

    described = hub.describe_favorites_order(act_lo, [(0x09, 0x01), (0x01, 0x02)])

    assert described == [
        {
            "fav_id": 0x09,
            "button_id": 0x09,
            "slot": 0x01,
            "type": "macro",
            "name": "Test Macro",
            "command_id": 0x09,
        },
        {
            "fav_id": 0x01,
            "button_id": 0x01,
            "favorite_button_id": 0x01,
            "activity_map_button_id": 0x01,
            "slot": 0x02,
            "type": "favorite",
            "name": "Command 6",
            "device_id": 0x04,
            "command_id": 0x06,
        },
    ]

    loop.close()


def test_describe_favorites_order_appends_cached_entries_missing_from_hub_order() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
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

    act_lo = 0x65
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x1A, "source": "keymap"},
        {"button_id": 0x02, "device_id": 0x04, "command_id": 0x20, "source": "keymap"},
        {"button_id": 0x03, "device_id": 0x08, "command_id": 0x01, "source": "keymap"},
    ]
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x1A, "Ok")
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x20, "Yellow")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x01, "Dim the lights")

    described = hub.describe_favorites_order(act_lo, [(0x01, 0x01), (0x02, 0x02)])

    assert described == [
        {
            "fav_id": 0x01,
            "button_id": 0x01,
            "favorite_button_id": 0x01,
            "activity_map_button_id": 0x01,
            "slot": 0x01,
            "type": "favorite",
            "name": "Ok",
            "device_id": 0x04,
            "command_id": 0x1A,
        },
        {
            "fav_id": 0x02,
            "button_id": 0x02,
            "favorite_button_id": 0x02,
            "activity_map_button_id": 0x02,
            "slot": 0x02,
            "type": "favorite",
            "name": "Yellow",
            "device_id": 0x04,
            "command_id": 0x20,
        },
        {
            "fav_id": 0x03,
            "button_id": 0x03,
            "favorite_button_id": 0x03,
            "activity_map_button_id": 0x03,
            "slot": 0x03,
            "type": "favorite",
            "name": "Dim the lights",
            "device_id": 0x08,
            "command_id": 0x01,
        },
    ]

    loop.close()


def test_describe_favorites_order_matches_x1s_macro_and_favorite_ui_order() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
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

    act_lo = 0x65
    hub._proxy.state.activity_favorite_slots[act_lo] = [
        {"button_id": 0x01, "device_id": 0x04, "command_id": 0x1A, "source": "keymap"},
        {"button_id": 0x02, "device_id": 0x04, "command_id": 0x20, "source": "keymap"},
        {"button_id": 0x03, "device_id": 0x08, "command_id": 0x01, "source": "keymap"},
        {"button_id": 0x04, "device_id": 0x08, "command_id": 0x02, "source": "keymap"},
        {"button_id": 0x05, "device_id": 0x08, "command_id": 0x03, "source": "keymap"},
        {"button_id": 0x06, "device_id": 0x08, "command_id": 0x04, "source": "keymap"},
        {"button_id": 0x07, "device_id": 0x08, "command_id": 0x05, "source": "keymap"},
    ]
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x1A, "Ok")
    hub._proxy.state.record_favorite_label(act_lo, 0x04, 0x20, "Yellow")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x01, "Dim the lights")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x02, "Close the curtains")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x03, "Switch off the alarm")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x04, "Eat bananas")
    hub._proxy.state.record_favorite_label(act_lo, 0x08, 0x05, "Spend money")

    described = hub.describe_favorites_order(
        act_lo,
        [(0x05, 0x01), (0x06, 0x02), (0x07, 0x03), (0x01, 0x04), (0x02, 0x05), (0x03, 0x06), (0x04, 0x07)],
    )

    assert [(entry["fav_id"], entry["name"], entry["slot"]) for entry in described] == [
        (0x05, "Switch off the alarm", 0x01),
        (0x06, "Eat bananas", 0x02),
        (0x07, "Spend money", 0x03),
        (0x01, "Ok", 0x04),
        (0x02, "Yellow", 0x05),
        (0x03, "Dim the lights", 0x06),
        (0x04, "Close the curtains", 0x07),
    ]

    loop.close()


def test_async_get_cache_contents_includes_activity_workspace_payload() -> None:
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
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

    act_id = 0x65
    dev_id = 0x04

    hub.activities[act_id] = {"name": "Movies", "active": True}
    hub.devices[dev_id] = {"name": "Denon", "device_class": "ir", "device_class_code": 0x0D}
    hub._proxy.state.devices[dev_id] = {"name": "Denon", "device_class": "ir", "device_class_code": 0x0D}
    hub._proxy.state.commands[dev_id] = {0x06: "Power", 0x07: "Volume Up"}
    hub._proxy.state.activity_favorite_slots[act_id] = [
        {"button_id": 0x01, "device_id": dev_id, "command_id": 0x06, "source": "activity_map"}
    ]
    hub._proxy.state.record_favorite_label(act_id, dev_id, 0x06, "Power")
    hub._proxy.state.replace_activity_macros(act_id, [{"command_id": 0x09, "label": "Night Mode"}])

    payload = loop.run_until_complete(hub.async_get_cache_contents())

    assert payload["entry_id"] == "entry-id"
    assert payload["name"] == "hub-name"
    assert payload["cache_generation"] == 0
    assert payload["activities"] == [
        {
            "id": act_id,
            "name": "Movies",
            "is_active": True,
            "sort": 0,
            "favorite_count": 1,
            "keybinding_count": 0,
            "macro_count": 1,
        }
    ]
    assert payload["activity_favorites"] == {
        "101": [
            {
                "button_id": 0x01,
                "device_id": dev_id,
                "device_name": "Denon",
                "command_id": 0x06,
                "label": "Power",
                "source": "activity_map",
            }
        ]
    }
    assert "activity_keybindings" not in payload
    assert payload["devices_list"] == [
        {
            "id": dev_id,
            "name": "Denon",
            "sort": 0,
            "device_class": "ir",
            "device_class_code": 0x0D,
            "command_count": 2,
            "has_commands": True,
        }
    ]

    loop.close()


def test_cache_devices_list_reads_sort_byte_from_state_raw_body() -> None:
    """Device rows expose the record's sort byte (body[6]) like activities do."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
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

    dev_id = 0x04
    raw_body = bytearray(32)
    raw_body[6] = 0x05
    hub.devices[dev_id] = {"name": "Denon"}
    hub._proxy.state.devices[dev_id] = {"name": "Denon", "raw_body": bytes(raw_body)}

    payload = loop.run_until_complete(hub.async_get_cache_contents())

    assert [(row["id"], row["sort"]) for row in payload["devices_list"]] == [(dev_id, 0x05)]

    loop.close()


def test_cache_activity_ids_hide_auxiliary_only_phantom_ids_when_catalog_exists():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
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

    hub.activities = {
        101: {"name": "test"},
        102: {"name": "heyo"},
    }
    hub._proxy.state.activity_members[5].add(1)
    hub._proxy.state.activity_members[6].add(2)

    ids = hub._cache_activity_ids({"activity_members": {"5": [1], "6": [2]}})

    assert ids == [101, 102]

    loop.close()


def test_cache_activity_ids_can_fall_back_to_auxiliary_ids_without_catalog():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
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

    ids = hub._cache_activity_ids({"activity_members": {"5": [1], "6": [2]}})

    assert ids == [5, 6]

    loop.close()


def test_cache_device_ids_can_fall_back_to_command_only_ids_without_catalog():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
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

    ids = hub._cache_device_ids({"commands": {"5": {"1": "Power"}, "6": {"2": "Mute"}}})

    assert ids == [5, 6]

    loop.close()


def test_cache_device_ids_hide_stale_command_only_ids_when_catalog_exists():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)

    hub = SofabatonHub(
        hass,
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

    hub.devices = {1: {"name": "TV"}}

    ids = hub._cache_device_ids(
        {
            "devices": {"1": {"name": "TV"}},
            "commands": {"1": {"1": "Power"}, "9": {"2": "Ghost command"}},
        }
    )

    assert ids == [1]

    loop.close()


def test_cache_activity_favorites_prefers_fresh_device_catalog(monkeypatch):
    """The per-activity favorite label map is a resolved copy that lags
    behind command renames until the activity is re-read; the device
    command catalog must win whenever it has the command."""

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)
    hub = SofabatonHub(
        hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False,
    )
    try:
        act_lo = 0x65
        dev_lo = 0x0B
        hub._proxy.state.activity_favorite_slots[act_lo] = [
            {"device_id": dev_lo, "command_id": 1, "button_id": 3, "source": "cache"}
        ]
        hub._proxy.state.activity_favorite_labels[act_lo][(dev_lo, 1)] = "Old Name"
        hub._proxy.state.commands[dev_lo] = {1: "New Name"}

        rows = hub._build_cache_activity_favorites()
        assert rows[str(act_lo)][0]["label"] == "New Name"

        # Catalog entry missing → fall back to the activity-scoped label.
        hub._proxy.state.commands.pop(dev_lo)
        rows = hub._build_cache_activity_favorites()
        assert rows[str(act_lo)][0]["label"] == "Old Name"
    finally:
        loop.close()


def test_remote_quick_access_uses_shared_physical_display_order():
    """Macro/favorite drawers preserve their relative positions from the
    hub's one interleaved family-0x61 quick-access order."""

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)
    hub = SofabatonHub(
        hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False,
    )
    try:
        act_lo = 0x65
        hub.activities[act_lo] = {"name": "Watch TV"}
        hub._proxy.state.replace_activity_macros(
            act_lo,
            [
                {"command_id": 2, "label": "Second macro"},
                {"command_id": 4, "label": "First macro"},
            ],
        )
        hub._proxy._macros_complete.add(act_lo)
        hub._proxy.state.activity_favorite_slots[act_lo] = [
            {"device_id": 0x0B, "command_id": 1, "button_id": 1, "source": "keymap"},
            {"device_id": 0x0B, "command_id": 3, "button_id": 3, "source": "keymap"},
        ]
        hub._proxy.state.commands[0x0B] = {1: "Second favorite", 3: "First favorite"}
        # Physical screen: favorite 3, macro 4, favorite 1, macro 2.
        hub._proxy.state.activity_favorites_order[act_lo] = [
            (3, 1),
            (4, 2),
            (1, 3),
            (2, 4),
        ]

        macros = hub.get_all_cached_macros()[act_lo]
        favorites = hub.get_activity_favorites()[act_lo]

        assert [row["command_id"] for row in macros] == [4, 2]
        assert [row["button_id"] for row in favorites] == [3, 1]
        assert [row["name"] for row in favorites] == [
            "First favorite",
            "Second favorite",
        ]
    finally:
        loop.close()


def test_remote_favorite_slot_survives_temporarily_missing_label():
    """A live favorite slot must not become an empty drawer merely because
    its targeted command-label refresh has not completed yet."""

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    hass = FakeHass(loop)
    hub = SofabatonHub(
        hass, "entry-id", "hub-name", "127.0.0.1", 1234, {}, 9999, 10000, True, False,
    )
    try:
        act_lo = 0x65
        hub.activities[act_lo] = {"name": "Watch TV"}
        hub._proxy.state.activity_favorite_slots[act_lo] = [
            {"device_id": 0x0B, "command_id": 9, "button_id": 7, "source": "keymap"}
        ]

        favorites = hub.get_activity_favorites()[act_lo]

        assert favorites == [
            {
                "button_id": 7,
                "name": "Command 9",
                "device_id": 0x0B,
                "command_id": 9,
            }
        ]
    finally:
        loop.close()
