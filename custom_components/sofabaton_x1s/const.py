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

# X1S devices report a higher NO field in their mDNS TXT records
X1S_NO_THRESHOLD = 20221120

DEFAULT_PROXY_UDP_PORT = 8102
DEFAULT_HUB_LISTEN_BASE = 8200

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


def classify_hub_version(props: dict[str, str]) -> str:
    """Determine hub version based on advertised properties."""

    hver = props.get("HVER")
    if hver is not None:
        version = HUB_VERSION_BY_HVER.get(str(hver).strip())
        if version:
            return version

    no_field = props.get("NO")
    if no_field is not None:
        try:
            no_value = int(str(no_field))
        except ValueError:
            pass
        else:
            if no_value >= X1S_NO_THRESHOLD:
                return HUB_VERSION_X1S
            return HUB_VERSION_X1

    return DEFAULT_HUB_VERSION


def mdns_service_type_for_props(props: dict[str, str]) -> str:
    """Map hub properties to the correct mDNS service type."""

    version = classify_hub_version(props)
    return MDNS_SERVICE_TYPE_BY_VERSION.get(version, MDNS_SERVICE_TYPE_X1)
