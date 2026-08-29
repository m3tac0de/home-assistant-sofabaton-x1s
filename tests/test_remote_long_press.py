"""Transparent long-press (docs/internal/long-press-plan.md).

Long-press exists ONLY in the virtual remote card: the remote entity's
sole involvement is the ``long_press_keys`` attribute, which publishes the
resolved long-press pair per bound hard button so the card can fire it
through the ordinary favorites-style ``send_command {command, device}``.
No service parameter and no hub send path knows about long press.
"""

import importlib
from types import SimpleNamespace

integration = importlib.import_module("custom_components.sofabaton_x1s.__init__")


class _AttrHub:
    """Hub double covering everything extra_state_attributes touches."""

    entry_id = "entry-1"
    mac = "AABBCCDDEEFF"
    client_connected = False
    cache_generation = 5
    current_activity = None
    activities = {}

    def __init__(self, button_details=None):
        self._button_details = button_details or {}

    def get_all_cached_buttons(self):
        return {}

    def get_all_cached_macros(self):
        return {}

    def get_activity_favorites(self):
        return {}

    def get_index_state(self):
        return "ready"

    def get_ui_device_list(self):
        return []

    def get_all_cached_button_details(self):
        return self._button_details


def _remote_entity(hub):
    remote_mod = importlib.import_module("custom_components.sofabaton_x1s.remote")
    entry = SimpleNamespace(
        entry_id="entry-1", data={"mac": "AABBCCDDEEFF"}, options={}
    )
    return remote_mod.SofabatonRemote(hub, entry)


def _hass_with_cache(enabled):
    return SimpleNamespace(
        data={
            integration.DOMAIN: {
                "persistent_cache_store": SimpleNamespace(enabled=enabled)
            }
        }
    )


def test_long_press_keys_publishes_pairs_for_bound_buttons_only():
    details = {
        # Activity page: two bound buttons out of three rows.
        101: {
            20: {"device_id": 3, "command_id": 7},
            14: {
                "device_id": 3,
                "command_id": 8,
                "long_press_device_id": 4,
                "long_press_command_id": 9,
            },
            13: {
                "device_id": 3,
                "command_id": 5,
                "long_press_device_id": 3,
                "long_press_command_id": 6,
            },
        },
        # Device page (< 101): shares the namespace and the gate.
        7: {
            30: {
                "device_id": 7,
                "command_id": 2,
                "long_press_device_id": 7,
                "long_press_command_id": 4,
            },
        },
        # Page with details but no bindings: omitted entirely.
        102: {
            13: {"device_id": 5, "command_id": 1},
        },
    }
    entity = _remote_entity(_AttrHub(details))
    entity.hass = _hass_with_cache(True)

    attrs = entity.extra_state_attributes

    assert attrs["long_press_keys"] == {
        "101": {
            "13": {"device_id": 3, "command_id": 6},
            "14": {"device_id": 4, "command_id": 9},
        },
        "7": {
            "30": {"device_id": 7, "command_id": 4},
        },
    }


def test_long_press_keys_published_empty_when_cache_enabled():
    entity = _remote_entity(_AttrHub({}))
    entity.hass = _hass_with_cache(True)

    assert entity.extra_state_attributes["long_press_keys"] == {}


def test_long_press_keys_omitted_when_cache_disabled():
    details = {101: {13: {"long_press_device_id": 3, "long_press_command_id": 6}}}
    entity = _remote_entity(_AttrHub(details))
    entity.hass = _hass_with_cache(False)

    assert "long_press_keys" not in entity.extra_state_attributes


def test_long_press_keys_omitted_without_cache_store():
    details = {101: {13: {"long_press_device_id": 3, "long_press_command_id": 6}}}
    entity = _remote_entity(_AttrHub(details))
    entity.hass = SimpleNamespace(data={integration.DOMAIN: {}})

    assert "long_press_keys" not in entity.extra_state_attributes


def test_zero_long_press_device_means_no_binding():
    # A keymap row with no long press carries long_press_device_id == 0 on
    # the wire; the parser normally drops it, but a zero must never leak
    # into the attribute as a binding either.
    details = {
        101: {
            13: {
                "device_id": 3,
                "command_id": 5,
                "long_press_device_id": 0,
                "long_press_command_id": 6,
            },
        },
    }
    entity = _remote_entity(_AttrHub(details))
    entity.hass = _hass_with_cache(True)

    assert entity.extra_state_attributes["long_press_keys"] == {}
