"""Keep Home Assistant backend translations aligned with their consumers."""

from __future__ import annotations

import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
INTEGRATION = ROOT / "custom_components" / "sofabaton_x1s"
TRANSLATIONS = INTEGRATION / "translations" / "en.json"


def _english() -> dict:
    return json.loads(TRANSLATIONS.read_text(encoding="utf-8"))


def _service_schema() -> dict[str, set[str]]:
    """Read the service and field keys from this deliberately simple YAML file."""

    services: dict[str, set[str]] = {}
    current_service: str | None = None
    in_fields = False
    for line in (INTEGRATION / "services.yaml").read_text(encoding="utf-8").splitlines():
        if match := re.fullmatch(r"([a-z][a-z0-9_]*):", line):
            current_service = match.group(1)
            services[current_service] = set()
            in_fields = False
            continue
        if line == "  fields:":
            in_fields = True
            continue
        if in_fields and current_service and (
            match := re.fullmatch(r"    ([a-z][a-z0-9_]*):", line)
        ):
            services[current_service].add(match.group(1))
    return services


def test_custom_translation_file_is_flat() -> None:
    """Custom integrations cannot use Core's build-time translation references."""

    source = TRANSLATIONS.read_text(encoding="utf-8")
    assert "[%key:" not in source


def test_config_flow_steps_and_abort_reasons_are_translated() -> None:
    source = (INTEGRATION / "config_flow.py").read_text(encoding="utf-8")
    translations = _english()["config"]

    steps = set(re.findall(r'step_id="([a-z0-9_]+)"', source))
    aborts = set(re.findall(r'async_abort\(reason="([a-z0-9_]+)"', source))

    assert steps <= translations["step"].keys()
    assert aborts <= translations["abort"].keys()


def test_service_schema_and_translations_match() -> None:
    schema = _service_schema()
    translated = _english()["services"]

    assert schema.keys() == translated.keys()
    for service, fields in schema.items():
        assert translated[service]["name"]
        assert translated[service]["description"]
        assert fields == translated[service]["fields"].keys()
        for field in fields:
            assert translated[service]["fields"][field]["name"]
            assert translated[service]["fields"][field]["description"]


def test_service_metadata_is_not_duplicated_in_yaml() -> None:
    source = (INTEGRATION / "services.yaml").read_text(encoding="utf-8")
    assert not re.search(r"^(?: {2}| {6})(?:name|description):", source, re.MULTILINE)


def test_all_entity_names_use_translation_keys() -> None:
    expected = {
        "binary_sensor": {"client", "hub_connected"},
        "button": {
            "find_remote",
            "resync_remote",
            "remote_a",
            "remote_b",
            "remote_back",
            "remote_blue",
            "remote_c",
            "remote_ch_down",
            "remote_ch_up",
            "remote_down",
            "remote_dvr",
            "remote_exit",
            "remote_fwd",
            "remote_green",
            "remote_guide",
            "remote_home",
            "remote_left",
            "remote_menu",
            "remote_mute",
            "remote_ok",
            "remote_pause",
            "remote_play",
            "remote_red",
            "remote_rew",
            "remote_right",
            "remote_up",
            "remote_vol_down",
            "remote_vol_up",
            "remote_yellow",
        },
        "remote": {"remote"},
        "select": {"activity"},
        "sensor": {"activity", "index", "ip_commands", "recorded_keypress"},
        "switch": {"hex_logging", "proxy", "wifi_device"},
        "text": {"hub_ip_address"},
    }
    translated = _english()["entity"]
    entity_class_counts = {
        "binary_sensor": 2,
        "button": 3,
        "remote": 1,
        "select": 1,
        "sensor": 4,
        "switch": 3,
        "text": 1,
    }

    assert expected.keys() == translated.keys()
    for platform, keys in expected.items():
        assert keys == translated[platform].keys()
        assert all(translated[platform][key]["name"] for key in keys)

        source = (INTEGRATION / f"{platform}.py").read_text(encoding="utf-8")
        assert source.count("_attr_has_entity_name = True") == entity_class_counts[platform]
        assert "def name(" not in source
        assert "_attr_name =" not in source

    button_source = (INTEGRATION / "button.py").read_text(encoding="utf-8")
    button_names = {
        f"remote_{name.lower()}"
        for name in re.findall(r"ButtonName\.([A-Z][A-Z0-9_]*)", button_source)
        if name not in {"POWER_OFF", "POWER_ON"}
    }
    assert button_names | {"find_remote", "resync_remote"} == expected["button"]
