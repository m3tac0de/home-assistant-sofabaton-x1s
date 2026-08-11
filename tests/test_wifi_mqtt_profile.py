"""M1 library tests for the ``wifi_mqtt`` (X2 virtual MQTT) profile.

Test vectors mirror the captured app-created device's two-byte record
bodies and the documented head profile; the same shape was validated live on an X2 by
bench_90 (docs/protocol/live-hub-testing.md "Measured: MQTT vs HTTP
callback latency").
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

from tests._stub_packages import ensure_stub_package

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

ensure_stub_package("custom_components", ROOT / "custom_components")
ensure_stub_package(
    "custom_components.sofabaton_x1s", ROOT / "custom_components" / "sofabaton_x1s"
)
ensure_stub_package(
    "custom_components.sofabaton_x1s.lib",
    ROOT / "custom_components" / "sofabaton_x1s" / "lib",
)

from custom_components.sofabaton_x1s.lib.blob_decoders import (  # noqa: E402
    encode_decoded_blob,
    is_decodable_class,
    try_decode_blob,
)
from custom_components.sofabaton_x1s.lib.hub_versions import (  # noqa: E402
    DEVICE_BACKUP_SCHEMA_VERSION,
)
from custom_components.sofabaton_x1s.lib.protocol_const import (  # noqa: E402
    DEVICE_CLASS_CODE_WIFI_MQTT,
    DEVICE_CLASS_WIFI_MQTT,
)
from custom_components.sofabaton_x1s.lib.wifi_inplace_plan import (  # noqa: E402
    ManagedWifiSnapshot,
    WifiCommandSlot,
    build_wifi_inplace_plan,
)
from custom_components.sofabaton_x1s.lib.wifi_mqtt_profile import (  # noqa: E402
    build_wifi_mqtt_command_row,
    build_wifi_mqtt_device_block,
    build_wifi_mqtt_device_payload,
)


# ── decoder round trip (F1 vectors) ──────────────────────────────────────


def test_wifi_mqtt_is_decodable_class():
    assert is_decodable_class(DEVICE_CLASS_WIFI_MQTT)


@pytest.mark.parametrize("device_id,command_id", [(2, 1), (2, 6), (0, 0), (255, 255)])
def test_wifi_mqtt_decode_round_trip(device_id: int, command_id: int):
    raw = bytes([device_id, command_id])
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_MQTT, raw)
    assert decoded == {
        "class": DEVICE_CLASS_WIFI_MQTT,
        "trailer_hex": "",
        "fields": {"device_id": device_id, "command_id": command_id},
    }
    assert encode_decoded_blob(decoded) == raw


def test_wifi_mqtt_decode_accepts_hex_string_form():
    decoded = try_decode_blob(DEVICE_CLASS_WIFI_MQTT, "02 01")
    assert decoded is not None
    assert decoded["fields"] == {"device_id": 2, "command_id": 1}


@pytest.mark.parametrize("raw", [b"", b"\x02", b"\x02\x01\x00"])
def test_wifi_mqtt_decode_rejects_wrong_lengths(raw: bytes):
    # Wrong-length bodies degrade to raw hex (None), never a guess.
    assert try_decode_blob(DEVICE_CLASS_WIFI_MQTT, raw) is None


# ── §4 head profile + payload builder ─────────────────────────────────────


def test_device_block_matches_section4_profile():
    block = build_wifi_mqtt_device_block(
        device_name="Bench MQTT", brand_name="m3-benchwifi-x", source_device_id=1
    )
    assert block["device_class"] == DEVICE_CLASS_WIFI_MQTT
    assert block["device_class_code"] == DEVICE_CLASS_CODE_WIFI_MQTT == 0x20
    assert block["code_type"] == 0x20
    assert block["device_type"] == 0x10
    assert block["icon"] == 8
    assert block["idle_behavior"] == 4
    assert block["input_mode"] == 2
    assert block["power_mode"] == 1
    assert block["power_style"] == 0
    assert block["share_mode"] == 0
    assert block["channel"] == 0
    assert block["hide"] == 0
    assert block["input_flag"] == 0
    assert block["poll_time"] == 0
    assert block["tail_marker"] == 1
    assert block["code_id_hex"] == " ".join(["00"] * 16)


def test_command_row_shape_and_placeholder_bytes():
    row = build_wifi_mqtt_command_row(3, "Lights Toggle", device_id=2)
    restore = row["restore_data"]
    assert restore["transport"] == "hub_code_record"
    assert restore["library_type"] == 0x20
    assert restore["command_code"] == "00 00 00 00 00 00"
    assert restore["data_hex"] == "02 03"
    # Unknown device id falls back to 00 <command_id> (plan §4).
    fallback = build_wifi_mqtt_command_row(7, "X")
    assert fallback["restore_data"]["data_hex"] == "00 07"


def test_payload_builder_auto_numbers_and_validates():
    payload = build_wifi_mqtt_device_payload(
        device_name="Wifi Commands",
        brand_name="m3-benchwifi-hash",
        command_names=["A", "B", "C"],
    )
    assert payload["kind"] == "device_backup"
    assert payload["schema_version"] == DEVICE_BACKUP_SCHEMA_VERSION
    assert [row["command_id"] for row in payload["commands"]] == [1, 2, 3]
    assert [row["name"] for row in payload["commands"]] == ["A", "B", "C"]
    assert payload["button_bindings"] == []
    assert payload["macros"] == []
    # Every row satisfies the hub_code_record replay requirements the
    # restore validator enforces for non-IR classes.
    for row in payload["commands"]:
        restore = row["restore_data"]
        assert restore["transport"] == "hub_code_record"
        assert restore["library_type"] is not None
        assert str(restore["data_hex"]).strip()


def test_payload_builder_accepts_explicit_slot_ids():
    # Long-press records live at short + slot_count; the caller owns the
    # layout and passes explicit ids (here N=2: shorts 1..2, longs 3..4).
    payload = build_wifi_mqtt_device_payload(
        device_name="Wifi Events",
        brand_name="m3-benchwifi-ev",
        command_names={1: "Ev1", 2: "Ev2", 3: "Ev1 (long)", 4: "Ev2 (long)"},
    )
    assert [row["command_id"] for row in payload["commands"]] == [1, 2, 3, 4]
    assert payload["commands"][2]["restore_data"]["data_hex"] == "01 03"


def test_payload_builder_rejects_empty_command_list():
    with pytest.raises(ValueError):
        build_wifi_mqtt_device_payload(
            device_name="X", brand_name="Y", command_names=[]
        )


# ── in-place plan: command_payload suppression (plan §5) ─────────────────


def _mqtt_snapshot(labels: dict[int, str]) -> ManagedWifiSnapshot:
    # MQTT slots use the constant default payload_key: record bodies are
    # inert (F2), so no edit can ever require a payload rewrite.
    return ManagedWifiSnapshot(
        device_id=0x0A,
        device_name="Wifi Commands",
        brand="m3-key-hash",
        power_on_command_id=None,
        power_off_command_id=None,
        input_command_ids=(),
        slots={cid: WifiCommandSlot(command_id=cid, label=label) for cid, label in labels.items()},
        activities={},
    )


def test_inplace_plan_never_emits_command_payload_for_mqtt_slots():
    baseline = _mqtt_snapshot({1: "Old A", 2: "B"})
    desired = _mqtt_snapshot({1: "New A", 2: "B"})
    plan = build_wifi_inplace_plan(baseline, desired)
    kinds = [step.kind for step in plan.steps]
    assert kinds == ["command_rename"]
    assert "command_payload" not in kinds


def test_inplace_plan_noop_for_identical_mqtt_snapshots():
    plan = build_wifi_inplace_plan(
        _mqtt_snapshot({1: "A", 2: "B"}), _mqtt_snapshot({1: "A", 2: "B"})
    )
    assert plan.steps == ()
    assert not plan.is_fallback


# ── M3: proxy create adapter + hub transport selection ────────────────────


def test_create_wifi_mqtt_device_maps_defs_to_slot_layout():
    import logging

    from custom_components.sofabaton_x1s.lib.proxy_wifi_device import WifiDeviceMixin

    captured = {}

    class FakeProxy(WifiDeviceMixin):
        _log = logging.getLogger("test")

        def restore_device(self, payload):
            captured["payload"] = payload
            return {"status": "success", "device_id": 0x0B, "command_id_map": {}}

        def _sync_step_wifi_power_config(self, payload):
            captured["power"] = dict(payload)
            return True

        def _sync_step_wifi_input_config(self, payload):
            captured["inputs"] = dict(payload)
            return True

    defs = []
    for idx, name in enumerate(["Lights", "Scenes"]):
        defs.append(
            {"display_name": name, "trigger_name": name, "press_type": "short", "command_index": idx}
        )
    for idx, name in enumerate(["Lights", "Scenes"]):
        defs.append(
            {
                "display_name": f"{name} Long Press",
                "trigger_name": name,
                "press_type": "long",
                "command_index": idx,
            }
        )

    result = FakeProxy().create_wifi_mqtt_device(
        device_name="Wifi Commands",
        commands=defs,
        brand_name="m3-benchwifi-h",
        power_on_command_id=1,
        power_off_command_id=2,
        input_command_ids=[2],
    )
    assert result == {"device_id": 0x0B, "status": "success"}

    payload = captured["payload"]
    assert payload["device"]["device_class"] == "wifi_mqtt"
    # Shorts at 1..N, longs at N+1..2N (N = number of short defs).
    assert [(row["command_id"], row["name"]) for row in payload["commands"]] == [
        (1, "Lights"),
        (2, "Scenes"),
        (3, "Lights Long Press"),
        (4, "Scenes Long Press"),
    ]
    assert captured["power"] == {
        "device_id": 0x0B,
        "power_on_command_id": 1,
        "power_off_command_id": 2,
    }
    assert captured["inputs"] == {"device_id": 0x0B, "input_command_ids": [2]}


REAL_MAC = "FC:01:2C:39:D3:D0"
# generate_static_mac output shape: locally-administered bit forced on.
SYNTHETIC_MAC = "02:ab:cd:12:34:56"


def test_real_hub_mac_accepts_hardware_macs_only():
    from custom_components.sofabaton_x1s.hub import real_hub_mac

    assert real_hub_mac(REAL_MAC) == "FC012C39D3D0"
    assert real_hub_mac("fc012c39d3d0") == "FC012C39D3D0"
    # Synthetic manual-add MAC (locally-administered bit set).
    assert real_hub_mac(SYNTHETIC_MAC) is None
    # Multicast bit set: never a device MAC.
    assert real_hub_mac("01:00:5E:00:00:01") is None
    # Missing / malformed / truncated.
    assert real_hub_mac(None) is None
    assert real_hub_mac("") is None
    assert real_hub_mac("FC012C") is None


def test_select_wifi_command_transport_matrix():
    from types import SimpleNamespace

    from custom_components.sofabaton_x1s.hub import SofabatonHub

    def select(version, components, payload, mac=REAL_MAC, banner_mac=None):
        fake = SimpleNamespace(
            version=version,
            mac=mac,
            banner_mac=banner_mac,
            entry_id="entry-1",
            hass=SimpleNamespace(config=SimpleNamespace(components=components)),
        )
        fake._wifi_mqtt_mac = lambda: SofabatonHub._wifi_mqtt_mac(fake)
        fake.wifi_mqtt_available = lambda: SofabatonHub.wifi_mqtt_available(fake)
        return SofabatonHub._select_wifi_command_transport(fake, payload)

    # Deployed records keep their transport forever, whatever is requested.
    assert (
        select("X2", {"mqtt"}, {"deployed_device_id": 9, "deployed_transport": "http", "requested_transport": "mqtt"})
        == "http"
    )
    assert (
        select("X2", set(), {"deployed_device_id": 9, "deployed_transport": "mqtt"})
        == "mqtt"
    )
    # Legacy deployed record without the field: replace stays HTTP.
    assert select("X2", {"mqtt"}, {"deployed_device_id": 9, "requested_transport": "mqtt"}) == "http"

    # Fresh deploys: X2 + mqtt loaded + real MAC honors the request.
    assert select("X2", {"mqtt"}, {"requested_transport": "mqtt"}) == "mqtt"
    assert select("X2", {"mqtt"}, {"requested_transport": "http"}) == "http"
    assert select("X2", {"mqtt"}, {}) == "http"
    # MQTT integration missing, or not an X2: always HTTP.
    assert select("X2", set(), {"requested_transport": "mqtt"}) == "http"
    assert select("X1S", {"mqtt"}, {"requested_transport": "mqtt"}) == "http"
    # Manually-added hub (synthetic MAC) or no MAC: the press topic is
    # unknowable, so MQTT is never selected for a fresh deploy.
    assert select("X2", {"mqtt"}, {"requested_transport": "mqtt"}, mac=SYNTHETIC_MAC) == "http"
    assert select("X2", {"mqtt"}, {"requested_transport": "mqtt"}, mac=None) == "http"
    # ...but the banner self-report unlocks it: once the hub has
    # connected once, its own MAC (even a local/multicast-bit one, as
    # real X1/X1S hardware carries) overrides the synthetic identity.
    assert (
        select(
            "X2",
            {"mqtt"},
            {"requested_transport": "mqtt"},
            mac=SYNTHETIC_MAC,
            banner_mac="E26A44861B45",
        )
        == "mqtt"
    )


def test_wifi_mqtt_mac_preference_chain():
    from types import SimpleNamespace

    from custom_components.sofabaton_x1s.hub import SofabatonHub

    def mac_for(mac, banner_mac=None, stored=None):
        entry = SimpleNamespace(data={"banner_mac": stored} if stored else {})
        config_entries = SimpleNamespace(async_get_entry=lambda _id: entry)
        fake = SimpleNamespace(
            mac=mac,
            banner_mac=banner_mac,
            entry_id="entry-1",
            hass=SimpleNamespace(config_entries=config_entries),
        )
        return SofabatonHub._wifi_mqtt_mac(fake)

    # Banner self-report wins outright, OUI bits notwithstanding.
    assert mac_for(SYNTHETIC_MAC, banner_mac="CB383539684B") == "CB383539684B"
    # Entry-persisted banner MAC covers restarts before first connect.
    assert mac_for(SYNTHETIC_MAC, stored="e2:6a:44:86:1b:45") == "E26A44861B45"
    # Heuristic fallback: real discovery MAC passes, synthetic does not.
    assert mac_for(REAL_MAC) == "FC012C39D3D0"
    assert mac_for(SYNTHETIC_MAC) is None
    # All-zero stored value is treated as absent.
    assert mac_for(SYNTHETIC_MAC, stored="000000000000") is None
