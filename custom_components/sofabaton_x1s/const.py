# const.py
DOMAIN = "sofabaton_x1s"

MDNS_TYPE = "_x1hub._udp.local."
CONF_MAC = "mac"
CONF_HOST = "host"
CONF_PORT = "port"
CONF_NAME = "name"
CONF_MDNS_TXT = "mdns_txt"

DEFAULT_PROXY_UDP_PORT = 9102
DEFAULT_HUB_LISTEN_BASE = 8200

PLATFORMS = ["select", "switch", "binary_sensor", "button", "sensor"]


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