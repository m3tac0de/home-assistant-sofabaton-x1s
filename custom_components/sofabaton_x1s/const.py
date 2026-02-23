# const.py
DOMAIN = "sofabaton_x1s"

MDNS_SERVICE_TYPES: tuple[str, ...] = (
    "_x1hub._udp.local.",
    "_sofabaton_hub._udp.local.",
)
MDNS_SERVICE_TYPE_X1 = MDNS_SERVICE_TYPES[0]
MDNS_SERVICE_TYPE_X2 = MDNS_SERVICE_TYPES[1]
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

# Hub version classification
HVER_X1 = "1"
HVER_X1S = "2"
HVER_X2 = "3"

HUB_VERSION_X1 = "X1"
HUB_VERSION_X1S = "X1S"
HUB_VERSION_X2 = "X2"
DEFAULT_HUB_VERSION = HUB_VERSION_X1

HUB_VERSION_BY_HVER = {
    HVER_X1: HUB_VERSION_X1,
    HVER_X1S: HUB_VERSION_X1S,
    HVER_X2: HUB_VERSION_X2,
}

MDNS_SERVICE_TYPE_BY_VERSION = {
    HUB_VERSION_X1: MDNS_SERVICE_TYPE_X1,
    HUB_VERSION_X1S: MDNS_SERVICE_TYPE_X1,
    # X2 hubs continue to use the legacy _x1hub._udp.local. advertisement for compatibility
    HUB_VERSION_X2: MDNS_SERVICE_TYPE_X1,
}

DEFAULT_PROXY_UDP_PORT = 8102
DEFAULT_HUB_LISTEN_BASE = 8200
DEFAULT_ROKU_LISTEN_PORT = 8060

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


def classify_hub_version(props: dict[str, str]) -> str:
    """Determine hub version based on advertised properties."""

    hver = props.get("HVER")
    if hver is not None:
        version = HUB_VERSION_BY_HVER.get(str(hver).strip())
        if version:
            return version

    return DEFAULT_HUB_VERSION


def mdns_service_type_for_props(props: dict[str, str]) -> str:
    """Map hub properties to the correct mDNS service type."""

    version = classify_hub_version(props)
    return MDNS_SERVICE_TYPE_BY_VERSION.get(version, MDNS_SERVICE_TYPE_X1)


def format_hub_entry_title(version: str | None, host: str | None, mac: str | None) -> str:
    """Return a consistent config-entry title for integration cards."""

    display_version = (version or DEFAULT_HUB_VERSION).strip() or DEFAULT_HUB_VERSION
    display_host = (host or "unknown").strip() or "unknown"
    display_mac = (mac or "unknown").strip() or "unknown"
    return f"Sofabaton {display_version} ({display_host} / {display_mac})"
