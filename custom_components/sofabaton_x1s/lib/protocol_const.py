"""Common protocol constants shared by the Sofabaton proxy helpers."""

from __future__ import annotations

from typing import Dict

# Frame markers used by the hub protocol
SYNC0, SYNC1 = 0xA5, 0x5A


class ButtonName:
    """Enumeration of known Sofabaton button codes."""

    # X2-only / extended keys (below 0xAE)
    C = 0x97
    B = 0x98
    A = 0x99
    EXIT = 0x9A
    DVR = 0x9B
    PLAY = 0x9C
    GUIDE = 0x9D

    # Shared X1/X1S/X2 keys (existing)
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
OP_REQ_COMMANDS = 0x025C  # payload: [dev_lo, cmd] (1-byte) or [dev_lo, 0xFF] for full list
OP_REQ_ACTIVATE = 0x023F  # payload: [id_lo, key_code] (activity or device ID)
OP_REQ_ACTIVITY_MAP = 0x016C  # payload: [act_lo] request activity favorites mapping (X1)
OP_FIND_REMOTE = 0x0023  # payload: [0x01] to trigger remote buzzer
OP_FIND_REMOTE_X2 = 0x0323  # payload: [0x00, 0x00, 0x08] observed on X2 hubs
OP_CREATE_DEVICE_HEAD = 0x07D5  # payload includes UTF-16LE device name
OP_DEFINE_IP_CMD = 0x0ED3  # payload includes HTTP method/URL/headers
OP_DEFINE_IP_CMD_EXISTING = 0x0EAE  # payload defines IP command for an existing device
OP_PREPARE_SAVE = 0x4102  # payload triggers save transaction start
OP_FINALIZE_DEVICE = 0x4677
OP_DEVICE_SAVE_HEAD = 0x8D5D  # hub assigns device id
OP_SAVE_COMMIT = 0x6501
ACK_SUCCESS = 0x0301

# IP command synchronization (existing devices)
OP_REQ_IPCMD_SYNC = 0x0C02
OP_IPCMD_ROW_A = 0x0DD3
OP_IPCMD_ROW_B = 0x0DAC
OP_IPCMD_ROW_C = 0x0D9B
OP_IPCMD_ROW_D = 0x0DAE

# H→A responses (from hub to app/client)
OP_ACK_READY = 0x0160
OP_MARKER = 0x0C3D  # segment marker before continuation

OP_CATALOG_ROW_DEVICE = 0xD50B  # Row from list of devices
OP_CATALOG_ROW_ACTIVITY = 0xD53B  # Row from list of activities
OP_DEVBTN_HEADER = 0xD95D  # H→A: header page
OP_DEVBTN_PAGE = 0xD55D  # H→A: repeated pages with 2-3 entries each
OP_DEVBTN_SINGLE = 0x4D5D  # H→A: single-command metadata page (response to targeted REQ_COMMANDS)
OP_DEVBTN_TAIL = 0x495D  # H→A: tail/terminator
OP_KEYMAP_EXTRA = 0x303D  # H→A: small follow-up page sometimes present (keymap family)
OP_DEVBTN_MORE = 0x8F5D  # H→A: small follow-up page sometimes present
OP_DEVBTN_PAGE_ALT1 = 0xF75D  # H→A: variant page layout with earlier payload offset
OP_DEVBTN_PAGE_ALT2 = 0xA35D  # H→A: variant page layout with earlier payload offset
OP_DEVBTN_PAGE_ALT3 = 0x2F5D  # H→A: variant page layout with earlier payload offset
OP_DEVBTN_PAGE_ALT4 = 0xF35D  # H→A: variant page layout with earlier payload offset
OP_DEVBTN_PAGE_ALT5 = 0x7B5D  # H→A: variant page layout with earlier payload offset
OP_DEVBTN_PAGE_ALT6 = 0xCB5D  # H→A: variant page layout with earlier payload offset

# X1 hub responses
OP_X1_DEVICE = 0x7B0B  # Row from list of devices (X1 firmware)
OP_X1_ACTIVITY = 0x7B3B  # Row from list of activities (X1 firmware)

OP_KEYMAP_TBL_A = 0xF13D
OP_KEYMAP_TBL_B = 0xFA3D
OP_KEYMAP_TBL_C = 0x3D3D  # Returned when Hue buttons requested
OP_KEYMAP_TBL_D = 0x1E3D  # Observed keymap table variant
OP_KEYMAP_TBL_F = 0x783D  # Observed keymap table variant
OP_KEYMAP_TBL_E = 0xBB3D  # Observed keymap table variant
OP_KEYMAP_TBL_G = 0xCD3D  # Observed keymap table variant
OP_KEYMAP_CONT = 0x543D  # Observed continuation page after MARKER

# UDP CALL_ME (same frame used both directions over UDP)
OP_CALL_ME = 0x0CC3

# X1 activity mapping pages (favorites)
OP_ACTIVITY_MAP_PAGE = 0x7B6D

# noise we're not using (kept for reference)
OP_REQ_VERSION = 0x0058  # yields WIFI_FW (0x0359) then INFO_BANNER (0x112F)
OP_PING2 = 0x0140
OP_ACTIVITY_DEVICE_CONFIRM = 0x024F  # payload: [dev_lo, include_flag]
OP_REQ_MACRO_LABELS = 0x024D  # payload: [act_lo, 0xFF]
OP_REQ_MACROS = OP_REQ_MACRO_LABELS  # backward-compat alias
OP_MACROS_A1 = 0x6E13
OP_MACROS_B1 = 0x5A13
OP_MACROS_A2 = 0x8213
OP_MACROS_B2 = 0x6413
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
    OP_REQ_ACTIVITY_MAP: "REQ_ACTIVITY_MAP",
    OP_FIND_REMOTE: "FIND_REMOTE",
    OP_FIND_REMOTE_X2: "FIND_REMOTE_X2",
    OP_CREATE_DEVICE_HEAD: "CREATE_DEVICE_HEAD",
    OP_DEFINE_IP_CMD: "DEFINE_IP_CMD",
    OP_DEFINE_IP_CMD_EXISTING: "DEFINE_IP_CMD_EXISTING",
    OP_PREPARE_SAVE: "PREPARE_SAVE",
    OP_FINALIZE_DEVICE: "FINALIZE_DEVICE",
    OP_DEVICE_SAVE_HEAD: "DEVICE_SAVE_HEAD",
    OP_SAVE_COMMIT: "SAVE_COMMIT",
    OP_REQ_IPCMD_SYNC: "REQ_IPCMD_SYNC",
    OP_IPCMD_ROW_A: "IPCMD_ROW_A",
    OP_IPCMD_ROW_B: "IPCMD_ROW_B",
    OP_IPCMD_ROW_C: "IPCMD_ROW_C",
    OP_IPCMD_ROW_D: "IPCMD_ROW_D",
    ACK_SUCCESS: "ACK_SUCCESS",
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
    OP_KEYMAP_TBL_G: "KEYMAP_TABLE_G",
    OP_KEYMAP_CONT: "KEYMAP_CONT",
    OP_ACTIVITY_MAP_PAGE: "ACTIVITY_MAP_PAGE",
    OP_DEVBTN_HEADER: "DEVCTL_HEADER",
    OP_DEVBTN_PAGE: "DEVCTL_PAGE",
    OP_DEVBTN_SINGLE: "DEVCTL_SINGLE_CMD",
    OP_DEVBTN_TAIL: "DEVCTL_LASTPAGE_TYPE1",
    OP_KEYMAP_EXTRA: "DEVCTL_LASTPAGE_TYPE2",
    OP_DEVBTN_MORE: "DEVCTL_LASTPAGE_TYPE3",
    OP_DEVBTN_PAGE_ALT1: "DEVCTL_PAGE_ALT1",
    OP_DEVBTN_PAGE_ALT2: "DEVCTL_PAGE_ALT2",
    OP_DEVBTN_PAGE_ALT3: "DEVCTL_PAGE_ALT3",
    OP_DEVBTN_PAGE_ALT4: "DEVCTL_PAGE_ALT4",
    OP_DEVBTN_PAGE_ALT5: "DEVCTL_PAGE_ALT5",
    OP_DEVBTN_PAGE_ALT6: "DEVCTL_PAGE_ALT6",
    OP_X1_DEVICE: "X1_DEVICE",
    OP_X1_ACTIVITY: "X1_ACTIVITY",
    # The rest are unused but kept for completeness
    OP_BANNER: "BANNER",
    OP_WIFI_FW: "WIFI_FW",
    OP_INFO_BANNER: "INFO_BANNER",
    OP_MACROS_A1: "MACROS_A1",
    OP_MACROS_B1: "MACROS_B1",
    OP_MACROS_A2: "MACROS_A2",
    OP_MACROS_B2: "MACROS_B2",
    OP_ACTIVITY_DEVICE_CONFIRM: "ACTIVITY_DEVICE_CONFIRM",
    OP_REQ_MACRO_LABELS: "REQ_MACRO_LABELS",
    OP_REQ_VERSION: "REQ_VERSION",
    OP_PING2: "PING2",
}


def opcode_hi(opcode: int) -> int:
    """Return the high byte of an opcode."""

    return (opcode >> 8) & 0xFF


def opcode_lo(opcode: int) -> int:
    """Return the low byte of an opcode."""

    return opcode & 0xFF


def opcode_family(opcode: int) -> int:
    """Return the low-byte "family" for list/table opcodes."""

    return opcode_lo(opcode)


# Known opcode families (low byte) grouped by semantic row/page type
FAMILY_DEV_ROW = 0x0B  # device catalog rows (OP_CATALOG_ROW_DEVICE, OP_X1_DEVICE)
FAMILY_ACT_ROW = 0x3B  # activity catalog rows (OP_CATALOG_ROW_ACTIVITY, OP_X1_ACTIVITY)
FAMILY_MACROS = 0x13  # macro pages (OP_MACROS_A1/B1/A2/B2)
FAMILY_KEYMAP = 0x3D  # keymap / continuation / devbtn-extra pages
FAMILY_DEVBTNS = 0x5D  # device button pages (header, body, tail, variants)


def group_known_opcodes_by_family() -> dict[int, list[str]]:
    """Return a mapping of low-byte opcode families to names defined here."""

    family_map: dict[int, list[str]] = {}
    for name, value in globals().items():
        if not name.startswith("OP_"):
            continue
        if not isinstance(value, int):
            continue
        low = opcode_lo(value)
        family_map.setdefault(low, []).append(name)
    return family_map


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
    "OP_REQ_ACTIVITY_MAP",
    "OP_FIND_REMOTE",
    "OP_FIND_REMOTE_X2",
    "OP_CREATE_DEVICE_HEAD",
    "OP_DEFINE_IP_CMD",
    "OP_DEFINE_IP_CMD_EXISTING",
    "OP_PREPARE_SAVE",
    "OP_FINALIZE_DEVICE",
    "OP_DEVICE_SAVE_HEAD",
    "OP_SAVE_COMMIT",
    "ACK_SUCCESS",
    "OP_REQ_IPCMD_SYNC",
    "OP_IPCMD_ROW_A",
    "OP_IPCMD_ROW_B",
    "OP_IPCMD_ROW_C",
    "OP_IPCMD_ROW_D",
    "OP_ACK_READY",
    "OP_MARKER",
    "OP_CATALOG_ROW_DEVICE",
    "OP_CATALOG_ROW_ACTIVITY",
    "OP_DEVBTN_HEADER",
    "OP_DEVBTN_PAGE",
    "OP_DEVBTN_SINGLE",
    "OP_DEVBTN_TAIL",
    "OP_KEYMAP_EXTRA",
    "OP_DEVBTN_MORE",
    "OP_DEVBTN_PAGE_ALT1",
    "OP_DEVBTN_PAGE_ALT2",
    "OP_DEVBTN_PAGE_ALT3",
    "OP_DEVBTN_PAGE_ALT4",
    "OP_DEVBTN_PAGE_ALT5",
    "OP_DEVBTN_PAGE_ALT6",
    "OP_X1_DEVICE",
    "OP_X1_ACTIVITY",
    "OP_KEYMAP_TBL_A",
    "OP_KEYMAP_TBL_B",
    "OP_KEYMAP_TBL_C",
    "OP_KEYMAP_TBL_D",
    "OP_KEYMAP_TBL_F",
    "OP_KEYMAP_TBL_E",
    "OP_KEYMAP_TBL_G",
    "OP_KEYMAP_CONT",
    "OP_CALL_ME",
    "OP_ACTIVITY_MAP_PAGE",
    "OP_REQ_VERSION",
    "OP_PING2",
    "OP_ACTIVITY_DEVICE_CONFIRM",
    "OP_REQ_MACRO_LABELS",
    "OP_MACROS_A1",
    "OP_MACROS_B1",
    "OP_MACROS_A2",
    "OP_MACROS_B2",
    "OP_BANNER",
    "OP_WIFI_FW",
    "OP_INFO_BANNER",
    "OPNAMES",
    "opcode_hi",
    "opcode_lo",
    "opcode_family",
    "FAMILY_DEV_ROW",
    "FAMILY_ACT_ROW",
    "FAMILY_MACROS",
    "FAMILY_KEYMAP",
    "FAMILY_DEVBTNS",
]
