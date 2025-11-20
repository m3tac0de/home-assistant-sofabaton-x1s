"""Common protocol constants shared by the Sofabaton proxy helpers."""

from __future__ import annotations

from typing import Dict

# Frame markers used by the hub protocol
SYNC0, SYNC1 = 0xA5, 0x5A


class ButtonName:
    """Enumeration of known Sofabaton button codes."""

    UP = 0xAE
    DOWN = 0xB2
    LEFT = 0xAF
    RIGHT = 0xB1
    OK = 0xB0
    HOME = 0xB4
    BACK = 0xB3
    MENU = 0xB5
    VOL_UP = 0xB6
    VOL_DOWN = 0xB9
    MUTE = 0xB8
    CH_UP = 0xB7
    CH_DOWN = 0xBA
    REW = 0xBB
    PAUSE = 0xBC
    FWD = 0xBD
    RED = 0xBE
    GREEN = 0xBF
    YELLOW = 0xC0
    BLUE = 0xC1
    POWER_ON = 0xC6
    POWER_OFF = 0xC7


BUTTONNAME_BY_CODE = {
    v: k for k, v in ButtonName.__dict__.items() if isinstance(v, int)
}


# A→H requests (from app/client to hub)
OP_REQ_DEVICES = 0x000A  # yields CATALOG_ROW_DEVICE rows (0xD50B)
OP_REQ_ACTIVITIES = 0x003A  # yields CATALOG_ROW_ACTIVITY rows (0xD53B)
OP_REQ_BUTTONS = 0x023C  # payload: [act_lo, 0xFF]
OP_REQ_COMMANDS = 0x025C  # payload: [act_lo, 0xFF]
OP_REQ_ACTIVATE = 0x023F  # payload: [id_lo, key_code] (activity or device ID)
OP_FIND_REMOTE = 0x0023  # payload: [0x01] to trigger remote buzzer

# H→A responses (from hub to app/client)
OP_ACK_READY = 0x0160
OP_MARKER = 0x0C3D  # segment marker before continuation

OP_CATALOG_ROW_DEVICE = 0xD50B  # Row from list of devices
OP_CATALOG_ROW_ACTIVITY = 0xD53B  # Row from list of activities
OP_DEVBTN_HEADER = 0xD95D  # H→A: header page
OP_DEVBTN_PAGE = 0xD55D  # H→A: repeated pages with 2-3 entries each
OP_DEVBTN_TAIL = 0x495D  # H→A: tail/terminator
OP_DEVBTN_EXTRA = 0x303D  # H→A: small follow-up page sometimes present
OP_DEVBTN_MORE = 0x8F5D  # H→A: small follow-up page sometimes present

OP_KEYMAP_TBL_A = 0xF13D
OP_KEYMAP_TBL_B = 0xFA3D
OP_KEYMAP_TBL_C = 0x3D3D  # Returned when Hue buttons requested
OP_KEYMAP_TBL_D = 0x1E3D  # Observed keymap table variant
OP_KEYMAP_TBL_F = 0x783D  # Observed keymap table variant
OP_KEYMAP_TBL_E = 0xBB3D  # Observed keymap table variant
OP_KEYMAP_CONT = 0x543D  # Observed continuation page after MARKER

# UDP CALL_ME (same frame used both directions over UDP)
OP_CALL_ME = 0x0CC3

# noise we're not using (kept for reference)
OP_REQ_VERSION = 0x0058  # yields WIFI_FW (0x0359) then INFO_BANNER (0x112F)
OP_PING2 = 0x0140
OP_REQ_KEYLABELS = 0x024D  # payload: [act_lo, 0xFF]
OP_LABELS_A1 = 0x6E13
OP_LABELS_B1 = 0x5A13
OP_LABELS_A2 = 0x8213
OP_LABELS_B2 = 0x6413
OP_BANNER = 0x1D02  # hub ident, name, batch, hub fw (first screen)
OP_WIFI_FW = 0x0359  # WiFi firmware ver (Vx.y.z)
OP_INFO_BANNER = 0x112F  # vendor tag, batch date, remote fw byte, etc.


OPNAMES: Dict[int, str] = {
    OP_CALL_ME: "CALL_ME",
    OP_REQ_ACTIVITIES: "REQ_ACTIVITIES",
    OP_REQ_DEVICES: "REQ_DEVICES",
    OP_REQ_BUTTONS: "REQ_BUTTONS",
    OP_REQ_COMMANDS: "REQ_COMMANDS",
    OP_REQ_ACTIVATE: "REQ_ACTIVATE",
    OP_FIND_REMOTE: "FIND_REMOTE",
    OP_ACK_READY: "ACK_READY",
    OP_MARKER: "MARKER",
    OP_CATALOG_ROW_DEVICE: "CATALOG_ROW_DEVICE",
    OP_CATALOG_ROW_ACTIVITY: "CATALOG_ROW_ACTIVITY",
    OP_KEYMAP_TBL_A: "KEYMAP_TABLE_A",
    OP_KEYMAP_TBL_B: "KEYMAP_TABLE_B",
    OP_KEYMAP_TBL_C: "KEYMAP_TABLE_C",
    OP_KEYMAP_TBL_D: "KEYMAP_TABLE_D",
    OP_KEYMAP_TBL_F: "KEYMAP_TABLE_F",
    OP_KEYMAP_TBL_E: "KEYMAP_TABLE_E",
    OP_KEYMAP_CONT: "KEYMAP_CONT",
    OP_DEVBTN_HEADER: "DEVCTL_HEADER",
    OP_DEVBTN_PAGE: "DEVCTL_PAGE",
    OP_DEVBTN_TAIL: "DEVCTL_LASTPAGE_TYPE1",
    OP_DEVBTN_EXTRA: "DEVCTL_LASTPAGE_TYPE2",
    OP_DEVBTN_MORE: "DEVCTL_LASTPAGE_TYPE3",
    # The rest are unused but kept for completeness
    OP_BANNER: "BANNER",
    OP_WIFI_FW: "WIFI_FW",
    OP_INFO_BANNER: "INFO_BANNER",
    OP_LABELS_A1: "KEY_LABELS_A1",
    OP_LABELS_B1: "KEY_LABELS_B1",
    OP_LABELS_A2: "KEY_LABELS_A2",
    OP_LABELS_B2: "KEY_LABELS_B2",
    OP_REQ_KEYLABELS: "REQ_KEYLABELS",
    OP_REQ_VERSION: "REQ_VERSION",
    OP_PING2: "PING2",
}


__all__ = [
    "SYNC0",
    "SYNC1",
    "ButtonName",
    "BUTTONNAME_BY_CODE",
    "OP_REQ_DEVICES",
    "OP_REQ_ACTIVITIES",
    "OP_REQ_BUTTONS",
    "OP_REQ_COMMANDS",
    "OP_REQ_ACTIVATE",
    "OP_FIND_REMOTE",
    "OP_ACK_READY",
    "OP_MARKER",
    "OP_CATALOG_ROW_DEVICE",
    "OP_CATALOG_ROW_ACTIVITY",
    "OP_DEVBTN_HEADER",
    "OP_DEVBTN_PAGE",
    "OP_DEVBTN_TAIL",
    "OP_DEVBTN_EXTRA",
    "OP_DEVBTN_MORE",
    "OP_KEYMAP_TBL_A",
    "OP_KEYMAP_TBL_B",
    "OP_KEYMAP_TBL_C",
    "OP_KEYMAP_TBL_D",
    "OP_KEYMAP_TBL_F",
    "OP_KEYMAP_TBL_E",
    "OP_KEYMAP_CONT",
    "OP_CALL_ME",
    "OP_REQ_VERSION",
    "OP_PING2",
    "OP_REQ_KEYLABELS",
    "OP_LABELS_A1",
    "OP_LABELS_B1",
    "OP_LABELS_A2",
    "OP_LABELS_B2",
    "OP_BANNER",
    "OP_WIFI_FW",
    "OP_INFO_BANNER",
    "OPNAMES",
]
