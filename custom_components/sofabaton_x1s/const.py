# const.py
# Hub-version classification, mDNS service types, backup schema versions
# and default ports moved into the standalone library; they are
# re-exported here so integration call sites keep importing from const.
from .lib.hub_versions import (  # noqa: F401
    ACTIVITY_BACKUP_SCHEMA_VERSION,
    DEFAULT_HUB_LISTEN_BASE,
    DEFAULT_PROXY_UDP_PORT,
    DEVICE_BACKUP_SCHEMA_VERSION,
    HUB_BUNDLE_SCHEMA_VERSION,
    HUB_VERSION_BY_HVER,
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    HVER_BY_HUB_VERSION,
    HVER_X1,
    HVER_X1S,
    HVER_X2,
    MDNS_SERVICE_TYPE_BY_VERSION,
    MDNS_SERVICE_TYPE_X1,
    MDNS_SERVICE_TYPE_X2,
    MDNS_SERVICE_TYPES,
    classify_hub_version,
    mdns_service_type_for_props,
)

DOMAIN = "sofabaton_x1s"

CONF_MAC = "mac"
CONF_HOST = "host"
CONF_PORT = "port"
CONF_NAME = "name"
CONF_MDNS_TXT = "mdns_txt"
CONF_MDNS_VERSION = "mdns_version"
CONF_PROXY_ENABLED = "proxy_enabled"
CONF_HEX_LOGGING_ENABLED = "hex_logging_enabled"
CONF_ROKU_SERVER_ENABLED = "roku_server_enabled"
CONF_ROKU_LISTEN_PORT = "roku_listen_port"
CONF_ENABLE_X2_DISCOVERY = "enable_x2_discovery"
CONF_PERSISTENT_CACHE_ENABLED = "persistent_cache_enabled"

DEFAULT_ROKU_LISTEN_PORT = 8060
WIFI_DEVICE_ENABLE_DOCS_URL = (
    "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md"
)

PLATFORMS = [
    "select",
    "switch",
    "binary_sensor",
    "button",
    "sensor",
    "remote",
    "text",
]


def signal_activity(entry_id: str) -> str:
    return f"{DOMAIN}_{entry_id}_activity"


def signal_client(entry_id: str) -> str:
    return f"{DOMAIN}_{entry_id}_client"


def signal_hub(entry_id: str) -> str:
    return f"{DOMAIN}_{entry_id}_hub"


def signal_buttons(entry_id: str) -> str:
    return f"{DOMAIN}_{entry_id}_buttons"


def signal_devices(entry_id: str) -> str:
    return f"sofabaton_x1s_devices_{entry_id}"


def signal_commands(entry_id: str) -> str:
    return f"sofabaton_x1s_commands_{entry_id}"


def signal_macros(entry_id: str) -> str:
    return f"sofabaton_x1s_macros_{entry_id}"


def signal_app_activations(entry_id: str) -> str:
    return f"sofabaton_x1s_app_activations_{entry_id}"


def signal_ip_commands(entry_id: str) -> str:
    return f"sofabaton_x1s_ip_commands_{entry_id}"


def signal_wifi_device(entry_id: str) -> str:
    return f"sofabaton_x1s_wifi_device_{entry_id}"


def signal_command_sync(entry_id: str) -> str:
    return f"sofabaton_x1s_command_sync_{entry_id}"


def format_hub_entry_title(version: str | None, host: str | None, mac: str | None) -> str:
    """Return a consistent config-entry title for integration cards."""

    display_version = (version or "unknown").strip() or "unknown"
    display_host = (host or "unknown").strip() or "unknown"
    display_mac = (mac or "unknown").strip() or "unknown"
    return f"Sofabaton {display_version} ({display_host} / {display_mac})"
