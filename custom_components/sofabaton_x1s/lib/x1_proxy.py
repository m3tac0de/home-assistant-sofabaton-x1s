# proxy.py — X1 Hub proxy (legible, opcode-forward)
# -------------------------------------------------
from __future__ import annotations

import logging
import ipaddress
import re
import socket
import struct
import threading
import time
from collections import defaultdict, deque
from typing import Any, Callable, Dict, List, Optional, Tuple

from ..const import HUB_VERSION_X1, HUB_VERSION_X1S, HUB_VERSION_X2, classify_hub_version, mdns_service_type_for_props
from .frame_handlers import FrameContext, frame_handler_registry
from .commands import DeviceCommandAssembler
from .macros import MacroAssembler

from .protocol_const import (
    BUTTONNAME_BY_CODE,
    ButtonName,
    OPNAMES,
    opcode_family,
    opcode_hi,
    opcode_lo,
    OP_ACK_READY,
    OP_BANNER,
    OP_CALL_ME,
    OP_CATALOG_ROW_ACTIVITY,
    OP_CATALOG_ROW_DEVICE,
    OP_DEVBTN_HEADER,
    OP_DEVBTN_MORE,
    OP_DEVBTN_PAGE,
    OP_DEVBTN_TAIL,
    OP_FIND_REMOTE,
    OP_FIND_REMOTE_X2,
    OP_REMOTE_SYNC,
    OP_X2_REMOTE_LIST,
    OP_X2_REMOTE_SYNC,
    OP_INFO_BANNER,
    OP_CREATE_DEVICE_HEAD,
    OP_DEFINE_IP_CMD,
    OP_DEFINE_IP_CMD_EXISTING,
    OP_PREPARE_SAVE,
    OP_FINALIZE_DEVICE,
    OP_DEVICE_SAVE_HEAD,
    OP_SAVE_COMMIT,
    OP_KEYMAP_CONT,
    OP_KEYMAP_TBL_A,
    OP_KEYMAP_TBL_B,
    OP_KEYMAP_TBL_C,
    OP_KEYMAP_TBL_D,
    OP_KEYMAP_TBL_E,
    OP_KEYMAP_EXTRA,
    OP_MACROS_A1,
    OP_MACROS_A2,
    OP_MACROS_B1,
    OP_MACROS_B2,
    OP_MARKER,
    OP_PING2,
    OP_REQ_ACTIVITIES,
    OP_REQ_ACTIVATE,
    OP_REQ_ACTIVITY_MAP,
    OP_DELETE_DEVICE,
    OP_ACTIVITY_ASSIGN_FINALIZE,
    OP_ACTIVITY_ASSIGN_COMMIT,
    OP_ACTIVITY_CONFIRM,
    OP_REQ_BUTTONS,
    OP_REQ_COMMANDS,
    OP_REQ_IPCMD_SYNC,
    OP_REQ_DEVICES,
    OP_REQ_MACRO_LABELS,
    OP_ACTIVITY_DEVICE_CONFIRM,
    OP_REQ_ACTIVITY_INPUTS,
    OP_REQ_VERSION,
    OP_WIFI_FW,
    SYNC0,
    SYNC1,
)
from .state_helpers import ActivityCache, BurstScheduler
from .transport_bridge import TransportBridge

# ============================================================================
# Utilities
# ============================================================================
log = logging.getLogger("x1proxy")

def _sum8(b: bytes) -> int: return sum(b) & 0xFF
def _hexdump(data: bytes) -> str: return data.hex(" ")


def _hex_to_bytes(raw_hex: str) -> bytes:
    return bytes.fromhex(raw_hex)


def _ascii_padded(value: str, *, length: int) -> bytes:
    return value.encode("ascii", errors="ignore")[:length].ljust(length, b"\x00")


_ROKU_APP_SLOTS: list[tuple[int, int]] = [
    (0x18, 0x4E21),
    (0x19, 0x4E22),
    (0x1A, 0x4E23),
    (0x1B, 0x4E24),
    (0x1C, 0x4E25),
    (0x1D, 0x4E26),
    (0x1E, 0x4E27),
    (0x1F, 0x4E28),
    (0x20, 0x4E29),
    (0x21, 0x4E2A),
]


_ROKU_X1S_CREATE_BASE = _hex_to_bytes(
    "01 00 01 01 00 01 00 ff 01 00 0a 10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "4d 00 00 48 00 6f 00 6d 00 65 00 20 00 41 00 73 00 73 00 69 00 73 00 74 00 61 00 6e 00 74 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 00 48 00 6f 00 6d 00 65 00 20 00 41 00 73 00 73 00 69 00 73 00 74 00 61 00 6e 00 74 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 fc 55 c0 a8 02 4d fc 00 00 fc 02 00 02 00 fc 00 fc 00 00 00 00 00 01 ff 00 00 00 00 "
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
    "00 00 00 00 00 00"
)

def _normalize_mdns_instance(name: str) -> str:
    """Return an mDNS-friendly instance name without whitespace."""

    normalized = re.sub(r"\s+", "-", name.strip())
    return normalized or "X1-HUB-PROXY"

def _route_local_ip(peer_ip: str) -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect((peer_ip, 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        try: s.close()
        except Exception: pass

def _pick_port_near(base: int, tries: int = 64) -> int:
    for i in range(tries):
        cand = base + i
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            s.bind(("0.0.0.0", cand))
            s.close()
            return cand
        except OSError:
            continue
    raise OSError("No free port near %d" % base)

def _enable_keepalive(sock: socket.socket, *, idle: int = 30, interval: int = 10, count: int = 3) -> None:
    try: sock.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
    except Exception: pass
    try:  # Linux
        TCP_KEEPIDLE = getattr(socket, "TCP_KEEPIDLE", None)
        TCP_KEEPINTVL = getattr(socket, "TCP_KEEPINTVL", None)
        TCP_KEEPCNT = getattr(socket, "TCP_KEEPCNT", None)
        if TCP_KEEPIDLE is not None:  sock.setsockopt(socket.IPPROTO_TCP, TCP_KEEPIDLE, idle)
        if TCP_KEEPINTVL is not None: sock.setsockopt(socket.IPPROTO_TCP, TCP_KEEPINTVL, interval)
        if TCP_KEEPCNT is not None:   sock.setsockopt(socket.IPPROTO_TCP, TCP_KEEPCNT, count)
    except Exception: pass
    try:  # macOS/Windows approx
        TCP_KEEPALIVE = getattr(socket, "TCP_KEEPALIVE", None)
        if TCP_KEEPALIVE is not None: sock.setsockopt(socket.IPPROTO_TCP, TCP_KEEPALIVE, idle)
    except Exception: pass



# ============================================================================
# Deframer
# ============================================================================
class Deframer:
    def __init__(self) -> None:
        self.buf = bytearray()
        self._cur_start_cid: Optional[int] = None

    def feed(self, data: bytes, cid: int) -> List[Tuple[int, bytes, bytes, int, int]]:
        out: List[Tuple[int, bytes, bytes, int, int]] = []
        if not data: return out
        self.buf.extend(data)
        if len(self.buf) > 1_000_000: del self.buf[:500_000]

        while True:
            start = self.buf.find(bytes([SYNC0, SYNC1]))
            if start < 0:
                self.buf.clear(); self._cur_start_cid = None
                break
            if start:
                del self.buf[:start]
                self._cur_start_cid = self._cur_start_cid or cid
            if len(self.buf) < 5: break
            if self._cur_start_cid is None: self._cur_start_cid = cid

            nxt = self.buf.find(bytes([SYNC0, SYNC1]), 2)
            if nxt != -1:
                cand = bytes(self.buf[:nxt])
                if cand and cand[-1] == (_sum8(cand[:-1]) & 0xFF):
                    opcode = (cand[2] << 8) | cand[3]
                    out.append((opcode, cand, cand[4:-1], self._cur_start_cid or cid, cid))
                    del self.buf[:nxt]; self._cur_start_cid = None
                    continue
                del self.buf[0]
                if not (len(self.buf) >= 2 and self.buf[0] == SYNC0 and self.buf[1] == SYNC1):
                    self._cur_start_cid = None
                continue

            cand = bytes(self.buf)
            if len(cand) >= 5 and cand[0] == SYNC0 and cand[1] == SYNC1 and cand[-1] == (_sum8(cand[:-1]) & 0xFF):
                opcode = (cand[2] << 8) | cand[3]
                out.append((opcode, cand, cand[4:-1], self._cur_start_cid or cid, cid))
                self.buf.clear(); self._cur_start_cid = None
            break
        return out

# ============================================================================
# Proxy
# ============================================================================
class X1Proxy:
    def __init__(
        self,
        real_hub_ip: str,
        real_hub_udp_port: int = 8102,
        proxy_udp_port: int = 8102,
        hub_listen_base: int = 8200,
        mdns_instance: str = "X1-HUB-PROXY",
        mdns_host: Optional[str] = None,
        mdns_txt: Optional[Dict[str, str]] = None,
        proxy_id: Optional[str] = None,
        proxy_enabled: bool = True,
        diag_dump: bool = True,
        diag_parse: bool = True,
        ka_idle: int = 30,
        ka_interval: int = 10,
        ka_count: int = 3,
        zeroconf=None,
        hub_version: str | None = None,
    ) -> None:
        self.real_hub_ip = real_hub_ip
        self.real_hub_udp_port = int(real_hub_udp_port)
        self.proxy_udp_port = int(proxy_udp_port)
        self.hub_listen_base = int(hub_listen_base)
        self.mdns_instance = _normalize_mdns_instance(mdns_instance)
        self.mdns_host = mdns_host or (self.mdns_instance + ".local")
        self.mdns_txt = mdns_txt or {}
        self.proxy_id = proxy_id or self.mdns_instance
        self.diag_dump = bool(diag_dump)
        self.diag_parse = bool(diag_parse)
        self.hub_version = hub_version or classify_hub_version(self.mdns_txt)
        # deframers
        self._df_h2a = Deframer()
        self._df_a2h = Deframer()
        self._adv_started = False

        self.state = ActivityCache()
        self._command_assembler = DeviceCommandAssembler()
        self._macro_assembler = MacroAssembler()
        self._burst = BurstScheduler()
        self._pending_button_requests: set[int] = set()
        # Track pending command fetches per device, so multiple targeted
        # lookups for the same device (different commands) can be queued.
        self._pending_command_requests: dict[int, set[int]] = {}
        self._commands_complete: set[int] = set()
        self._pending_macro_requests: set[int] = set()
        self._macros_complete: set[int] = set()
        self._pending_activity_map_requests: set[int] = set()
        self._activity_map_complete: set[int] = set()
        self._activity_row_payloads: dict[int, bytes] = {}
        self._favorite_label_requests: dict[tuple[int, int], set[int]] = defaultdict(set)
        self._activity_listeners: list[callable] = []
        self._activity_list_update_listeners: list[Callable[[], None]] = []
        self._hub_state_listeners: list[callable] = []
        self._client_state_listeners: list[callable] = []
        self._activation_listeners: list[callable] = []
        self._app_devices_deadline: float | None = None
        self._app_devices_retry_sent = False
        self._pending_virtual: dict[str, Any] | None = None
        self._pending_virtual_event = threading.Event()
        self._pending_virtual_lock = threading.Lock()
        self._pending_roku_device_id: int | None = None
        self._pending_roku_event = threading.Event()
        self._pending_roku_lock = threading.Lock()
        self._roku_ack_lock = threading.Lock()
        self._roku_ack_events: deque[tuple[int, bytes]] = deque()
        self._roku_ack_event = threading.Event()
        self._x2_remote_sync_id_lock = threading.Lock()
        self._x2_remote_sync_id: bytes | None = None
        self._x2_remote_sync_id_event = threading.Event()
        self._macro_payload_lock = threading.Lock()
        self._macro_payload_events: dict[tuple[int, int], bytes] = {}
        self._macro_payload_event = threading.Event()
        self._activity_inputs_lock = threading.Lock()
        self._activity_inputs_seen = 0
        self._activity_inputs_last_ts = 0.0
        self._activity_inputs_event = threading.Event()

        self.transport = TransportBridge(
            real_hub_ip,
            real_hub_udp_port,
            proxy_udp_port,
            hub_listen_base,
            mdns_instance=self.mdns_instance,
            mdns_txt=self.mdns_txt,
            proxy_id=self.proxy_id,
            ka_idle=ka_idle,
            ka_interval=ka_interval,
            ka_count=ka_count,
        )
        self._proxy_enabled = bool(proxy_enabled)
        self.transport.on_hub_frame(self._handle_hub_frame)
        self.transport.on_app_frame(self._handle_app_frame)
        self.transport.on_hub_state(self._notify_hub_state)
        self.transport.on_client_state(self._notify_client_state)
        self.transport.on_idle(self._handle_idle)

        self._burst.on_burst_end("buttons", self._on_buttons_burst_end)
        self._burst.on_burst_end("commands", self._on_commands_burst_end)
        self._burst.on_burst_end("macros", self._on_macros_burst_end)
        self._burst.on_burst_end("activity_map", self._on_activity_map_burst_end)
        self.on_burst_end("activities", self.handle_active_state)

        self._hub_connected: bool = False
        self._client_connected: bool = False

        self._zc = zeroconf  # type: ignore[assignment]
        self._zc_owned = False
        self._mdns_infos: list[Any] = []

    # ---------------------------------------------------------------------
    # Helpers
    # ---------------------------------------------------------------------
    def set_zeroconf(self, zc) -> None:
        """Use an existing Zeroconf instance (e.g., Home Assistant shared)."""

        self._zc = zc
        self._zc_owned = False

    # ---------------------------------------------------------------------
    # Local command API
    # ---------------------------------------------------------------------
    def on_activity_list_update(self, cb: Callable[[], None]) -> None:
        self._activity_list_update_listeners.append(cb)

    def _notify_activity_list_update(self) -> None:
        for cb in self._activity_list_update_listeners:
            cb()

    def handle_active_state(self, trigger: str) -> None:
        new_id, old_id = self.state.update_activity_state()
        if new_id != old_id:
            if new_id is not None:
                self._notify_activity_change(new_id & 0xFF, old_id & 0xFF if old_id is not None else None)
            else:
                self._notify_activity_change(None, old_id & 0xFF if old_id is not None else None)
    
    def enable_proxy(self) -> None:
        self._proxy_enabled = True
        self.transport.enable_proxy()
        if self.transport.is_hub_connected and not self._adv_started:
            self._start_discovery()

    def disable_proxy(self) -> None:
        self._proxy_enabled = False
        self.transport.disable_proxy()
        self._stop_discovery()
    
    def set_diag_dump(self, enable: bool) -> None:
        self.diag_dump = bool(enable)
        log.info("[PROXY] hex logging %s", "enabled" if enable else "disabled")

    def can_issue_commands(self) -> bool:
        return self.transport.can_issue_commands()

    def _build_frame(self, opcode: int, payload: bytes = b"") -> bytes:
        head = bytes([SYNC0, SYNC1, (opcode >> 8) & 0xFF, opcode & 0xFF])
        frame = head + payload
        return frame + bytes([_sum8(frame)])

    def _send_family_frame(self, family: int, payload: bytes) -> None:
        opcode = ((len(payload) & 0xFF) << 8) | (family & 0xFF)
        log.info(
            "[WIFI] send family=0x%02X opcode=0x%04X payload=%dB",
            family,
            opcode,
            len(payload),
        )
        self._send_cmd_frame(opcode, payload)

    def _send_roku_step(
        self,
        *,
        step_name: str,
        family: int,
        payload: bytes,
        ack_opcode: int,
        ack_first_byte: int | None = None,
        ack_fallback_opcodes: tuple[int, ...] = (),
        timeout: float = 5.0,
        retries: int = 0,
        retry_delay: float = 0.0,
    ) -> bool:
        candidates: list[tuple[int, int | None]] = [(ack_opcode, ack_first_byte)]
        candidates.extend((fallback_opcode, None) for fallback_opcode in ack_fallback_opcodes)

        total_attempts = max(1, int(retries) + 1)
        for attempt in range(1, total_attempts + 1):
            log.info(
                "[WIFI][STEP] %s tx family=0x%02X expect_ack=0x%04X first_byte=%s attempt=%d/%d",
                step_name,
                family,
                ack_opcode,
                f"0x{ack_first_byte:02X}" if ack_first_byte is not None else "*",
                attempt,
                total_attempts,
            )
            self._send_family_frame(family, payload)

            matched = self.wait_for_roku_ack_any(candidates, timeout=timeout)
            if matched is not None:
                matched_opcode, _matched_payload = matched
                if matched_opcode != ack_opcode:
                    log.warning(
                        "[WIFI][STEP] %s matched fallback ack=0x%04X (expected=0x%04X)",
                        step_name,
                        matched_opcode,
                        ack_opcode,
                    )
                log.info("[WIFI][STEP] %s acked via 0x%04X", step_name, matched_opcode)
                return True

            if attempt < total_attempts:
                log.warning(
                    "[WIFI][STEP] %s retrying after ack timeout (attempt %d/%d)",
                    step_name,
                    attempt,
                    total_attempts,
                )
                if retry_delay > 0:
                    time.sleep(retry_delay)

        log.warning(
            "[WIFI][STEP] %s failed waiting ack=0x%04X first_byte=%s",
            step_name,
            ack_opcode,
            f"0x{ack_first_byte:02X}" if ack_first_byte is not None else "*",
        )
        return False

    def _utf16le_padded(self, text: str, *, length: int) -> bytes:
        data = text.encode("utf-16le")
        truncated = data[:length]
        return truncated + b"\x00" * max(0, length - len(truncated))

    def _encode_len_prefixed(self, blob: bytes, *, max_len: int = 255) -> bytes:
        limited = blob[:max_len]
        return bytes([len(limited)]) + limited

    def _encode_headers(self, headers: dict[str, str]) -> bytes:
        return "\r\n".join(f"{k}: {v}" for k, v in headers.items()).encode("utf-8")

    def enqueue_cmd(
        self,
        opcode: int,
        payload: bytes = b"",
        *,
        expects_burst: bool = False,
        burst_kind: str | None = None,
    ) -> bool:
        frame = self._build_frame(opcode, payload) if self.diag_dump else None
        sent = self._burst.queue_or_send(
            opcode=opcode,
            payload=payload,
            expects_burst=expects_burst,
            burst_kind=burst_kind,
            can_issue=self.can_issue_commands,
            sender=self._send_cmd_frame,
        )
        if sent:
            log.info("[CMD] queued %s (0x%04X) %dB", OPNAMES.get(opcode, f"OP_{opcode:04X}"), opcode, len(payload))
            if frame is not None:
                log.info("[DUMP] queued %s", _hexdump(frame))
        else:
            log.info(
                "[CMD] ignoring %s: proxy client is connected",
                OPNAMES.get(opcode, f"OP_{opcode:04X}"),
            )
        return sent

    def on_hub_state_change(self, cb) -> None:
        """cb(connected: bool)"""
        self._hub_state_listeners.append(cb)
        cb(self._hub_connected)

    def on_client_state_change(self, cb) -> None:
        """cb(connected: bool)"""
        self._client_state_listeners.append(cb)
        cb(self._client_connected)

    def on_activity_change(self, cb) -> None:
        """cb(new_id: int | None, old_id: int | None, name: str | None)"""
        self._activity_listeners.append(cb)

    def on_app_activation(self, cb) -> None:
        """cb(record: dict[str, Any])"""
        self._activation_listeners.append(cb)

    def on_burst_end(self, key: str, cb):
        # key can be:
        #  "buttons"         -> all buttons updates
        #  "buttons:101"     -> just entity 101
        #  "commands"       -> all commands updates
        #  "commands:101"   -> just entity 101
        self._burst.on_burst_end(key, cb)

    # High-level helpers
    def request_devices(self) -> bool:    return self.enqueue_cmd(OP_REQ_DEVICES, expects_burst=True, burst_kind="devices")
    def request_activities(self) -> bool: return self.enqueue_cmd(OP_REQ_ACTIVITIES, expects_burst=True, burst_kind="activities")

    def request_buttons_for_entity(self, ent_id: int) -> bool:
        if not self.can_issue_commands():
            log.info("[CMD] request_buttons_for_entity ignored: proxy client is connected"); return False

        ent_lo = ent_id & 0xFF
        if ent_lo in self._pending_button_requests:
            log.debug(
                "[CMD] request_buttons_for_entity ignored: burst already pending for 0x%02X",
                ent_lo,
            )
            return False

        self._pending_button_requests.add(ent_lo)
        return self.enqueue_cmd(
            OP_REQ_BUTTONS,
            bytes([ent_lo, 0xFF]),
            expects_burst=True,
            burst_kind=f"buttons:{ent_lo}",
        )

    def request_commands_for_entity(self, ent_id: int) -> bool:
        if not self.can_issue_commands():
            log.info("[CMD] request_commands_for_entity ignored: proxy client is connected"); return False
        ent_lo = ent_id & 0xFF
        if 0xFF in self._pending_command_requests.get(ent_lo, set()):
            log.debug(
                "[CMD] request_commands_for_entity ignored: burst already pending for 0x%02X",
                ent_lo,
            )
            return False

        self._pending_command_requests.setdefault(ent_lo, set()).add(0xFF)
        self.enqueue_cmd(OP_REQ_COMMANDS, bytes([ent_lo, 0xFF]), expects_burst=True, burst_kind=f"commands:{ent_lo}")
        return True

    def request_activity_mapping(self, act_id: int) -> bool:
        if not self.can_issue_commands():
            log.info("[CMD] request_activity_mapping ignored: proxy client is connected"); return False

        act_lo = act_id & 0xFF
        if act_lo in self._pending_activity_map_requests:
            log.debug(
                "[CMD] request_activity_mapping ignored: burst already pending for 0x%02X",
                act_lo,
            )
            return False

        self._pending_activity_map_requests.add(act_lo)
        log.info("[ACTMAP] local request act=0x%02X (%d)", act_lo, act_lo)
        return self.enqueue_cmd(
            OP_REQ_ACTIVITY_MAP,
            bytes([act_lo]),
            expects_burst=True,
            burst_kind=f"activity_map:{act_lo}",
        )

    def request_macros_for_activity(self, act_id: int) -> bool:
        if not self.can_issue_commands():
            log.info("[CMD] request_macros_for_activity ignored: proxy client is connected"); return False

        act_lo = act_id & 0xFF
        if act_lo in self._pending_macro_requests:
            log.debug(
                "[CMD] request_macros_for_activity ignored: burst already pending for 0x%02X",
                act_lo,
            )
            return False

        self._pending_macro_requests.add(act_lo)
        return self.enqueue_cmd(
            OP_REQ_MACRO_LABELS,
            bytes([act_lo, 0xFF]),
            expects_burst=True,
            burst_kind=f"macros:{act_lo}",
        )

    def request_ip_commands_for_device(self, dev_id: int, *, wait: bool = False, timeout: float = 1.0) -> bool:
        """Fetch IP command definitions for an existing device."""

        if not self.can_issue_commands():
            log.info("[CMD] request_ip_commands_for_device ignored: proxy client is connected"); return False

        dev_lo = dev_id & 0xFF
        event = threading.Event() if wait else None

        if event:
            def _done(_: str) -> None:
                event.set()

            self._burst.on_burst_end(f"commands:{dev_lo}", _done)

        ok = self.enqueue_cmd(
            OP_REQ_IPCMD_SYNC,
            bytes([dev_lo, 0xFF, 0x14]),
            expects_burst=True,
            burst_kind=f"commands:{dev_lo}",
        )

        if event:
            event.wait(timeout)

        return ok
        
    def get_activities(self) -> tuple[dict[int, dict], bool]:
        if self.state.activities:
            return ({k: v.copy() for k, v in self.state.activities.items()}, True)
            
        if self.can_issue_commands():
            self.enqueue_cmd(OP_REQ_ACTIVITIES, expects_burst=True, burst_kind="activities")
        return ({}, False)

    def get_devices(self) -> tuple[dict[int, dict], bool]:
        if self.state.devices:
            return ({k: v.copy() for k, v in self.state.devices.items()}, True)

        if self.can_issue_commands():
            self.enqueue_cmd(OP_REQ_DEVICES, expects_burst=True, burst_kind="devices")
        return ({}, False)

    def get_buttons_for_entity(self, ent_id: int, *, fetch_if_missing: bool = True) -> tuple[list[int], bool]:
        ent_lo = ent_id & 0xFF
        if ent_lo in self.state.buttons:
            self._pending_button_requests.discard(ent_lo)
            return (sorted(self.state.buttons[ent_lo]), True)

        if fetch_if_missing and self.can_issue_commands():
            if ent_lo not in self._pending_button_requests:
                self._pending_button_requests.add(ent_lo)
                self.enqueue_cmd(
                    OP_REQ_BUTTONS,
                    bytes([ent_lo, 0xFF]),
                    expects_burst=True,
                    burst_kind=f"buttons:{ent_lo}",
                )

        return ([], False)

    def get_commands_for_entity(self, ent_id: int, *, fetch_if_missing: bool = True) -> tuple[dict[int, str], bool]:
        ent_lo = ent_id & 0xFF
        commands = self.state.commands.get(ent_lo)
        complete = ent_lo in self._commands_complete

        if commands is not None and complete:
            return (dict(commands), True)

        if fetch_if_missing and self.can_issue_commands():
            pending = self._pending_command_requests.setdefault(ent_lo, set())
            if 0xFF not in pending:
                pending.add(0xFF)
                self.enqueue_cmd(
                    OP_REQ_COMMANDS,
                    bytes([ent_lo, 0xFF]),
                    expects_burst=True,
                    burst_kind=f"commands:{ent_lo}",
                )

        if commands is not None:
            return (dict(commands), complete)

        return ({}, False)

    def get_macros_for_activity(self, act_id: int, *, fetch_if_missing: bool = True) -> tuple[list[dict[str, int | str]], bool]:
        act_lo = act_id & 0xFF
        macros = self.state.get_activity_macros(act_lo)
        ready = act_lo in self._macros_complete

        if macros and ready:
            return (macros, True)

        if fetch_if_missing and self.can_issue_commands():
            if act_lo not in self._pending_macro_requests:
                self._pending_macro_requests.add(act_lo)
                self.enqueue_cmd(
                    OP_REQ_MACRO_LABELS,
                    bytes([act_lo, 0xFF]),
                    expects_burst=True,
                    burst_kind=f"macros:{act_lo}",
                )

        return (macros, ready)

    def get_single_command_for_entity(
        self,
        ent_id: int,
        command_id: int,
        *,
        fetch_if_missing: bool = True,
    ) -> tuple[dict[int, str], bool]:
        """Fetch metadata for a single command on a device.

        Returns:
            (commands, ready)

            commands: mapping {command_id: label} if known; may be empty.
            ready:    True if we have the answer (either from cache or after a completed burst),
                      False if we have just enqueued a targeted request and are still waiting.
        """

        ent_lo = ent_id & 0xFF

        device_cmds = self.state.commands.get(ent_lo)
        if device_cmds is not None and command_id in device_cmds:
            return ({command_id: device_cmds[command_id]}, True)

        if not fetch_if_missing or not self.can_issue_commands():
            return ({}, False)

        pending = self._pending_command_requests.setdefault(ent_lo, set())

        if command_id <= 0xFF:
            if command_id in pending or 0xFF in pending:
                return ({}, False)
            payload = bytes([ent_lo, command_id & 0xFF])
            burst_kind = f"commands:{ent_lo}:{command_id}"
            pending.add(command_id)
        else:
            if 0xFF in pending:
                return ({}, False)
            payload = bytes([ent_lo, 0xFF])
            burst_kind = f"commands:{ent_lo}"
            pending.add(0xFF)

        self.enqueue_cmd(
            OP_REQ_COMMANDS,
            payload,
            expects_burst=True,
            burst_kind=burst_kind,
        )

        return ({}, False)

    def ensure_commands_for_activity(
        self,
        act_id: int,
        *,
        fetch_if_missing: bool = True,
    ) -> tuple[dict[int, dict[int, str]], bool]:
        """Fetch command labels for an activity's favorite slots.

        The REQ_BUTTONS response already describes physical button mappings, so
        the only follow-up requests we need are for favorite commands that
        require labels. If no favorites exist, nothing is fetched.
        """

        act_lo = act_id & 0xFF
        favorites = self.state.get_activity_favorite_slots(act_lo)

        if not favorites:
            # If there are no favorite slots, there is nothing to resolve.
            return ({}, True)

        refs: set[tuple[int, int]] = {
            (slot["device_id"], slot["command_id"]) for slot in favorites
        }

        commands_by_device: dict[int, dict[int, str]] = {}
        all_ready = True

        seen_pairs: set[tuple[int, int]] = set()

        for dev_id, command_id in refs:
            pair = (dev_id, command_id)
            if pair in seen_pairs:
                continue

            seen_pairs.add(pair)

            existing_label = self.state.get_favorite_label(act_lo, dev_id, command_id)
            if existing_label:
                self.state.record_favorite_label(act_lo, dev_id, command_id, existing_label)
                continue

            device_cmds = self.state.commands.get(dev_id & 0xFF)
            if device_cmds and command_id in device_cmds:
                self.state.record_favorite_label(
                    act_lo, dev_id, command_id, device_cmds[command_id]
                )
                continue

            self._favorite_label_requests[pair].add(act_id)

            single_cmds, ready = self.get_single_command_for_entity(
                dev_id, command_id, fetch_if_missing=fetch_if_missing
            )
            if not ready:
                all_ready = False

            if single_cmds:
                dev_lo = dev_id & 0xFF
                if dev_lo not in commands_by_device:
                    commands_by_device[dev_lo] = {}
                commands_by_device[dev_lo].update(single_cmds)

                label = single_cmds.get(command_id)
                if label:
                    self.state.record_favorite_label(act_lo, dev_id, command_id, label)

            if ready:
                self._favorite_label_requests.pop(pair, None)

        return (commands_by_device, all_ready)

    def clear_entity_cache(
        self,
        ent_id: int,
        clear_buttons: bool = False,
        clear_favorites: bool = False,
        clear_macros: bool = False,
    ) -> None:
        """Remove cached data for a given entity."""

        ent_lo = ent_id & 0xFF

        self.state.commands.pop(ent_lo, None)
        self._commands_complete.discard(ent_lo)
        self._pending_command_requests.pop(ent_lo, None)

        if clear_buttons:
            self.state.buttons.pop(ent_lo, None)
            self._pending_button_requests.discard(ent_lo)

        if clear_favorites:
            self.state.activity_command_refs.pop(ent_lo, None)
            self.state.activity_favorite_slots.pop(ent_lo, None)
            self.state.activity_members.pop(ent_lo, None)
            self.state.activity_favorite_labels.pop(ent_lo, None)
            self._clear_favorite_label_requests_for_activity(ent_lo)
            self._pending_activity_map_requests.discard(ent_lo)
            self._activity_map_complete.discard(ent_lo)

        if clear_macros:
            self.state.activity_macros.pop(ent_lo, None)
            self._macros_complete.discard(ent_lo)
            self._pending_macro_requests.discard(ent_lo)

    def _clear_favorite_label_requests_for_activity(self, act_lo: int) -> None:
        to_delete: list[tuple[int, int]] = []

        for pair, act_ids in self._favorite_label_requests.items():
            act_ids.discard(act_lo)
            if not act_ids:
                to_delete.append(pair)

        for pair in to_delete:
            self._favorite_label_requests.pop(pair, None)

    def get_app_activations(self) -> list[dict[str, Any]]:
        return self.state.get_app_activations()
    
    def get_proxy_status(self) -> bool:
        return self._proxy_enabled
    
    def send_command(self, ent_id: int, key_code: int) -> bool:
        if not self.can_issue_commands():
            log.info("[CMD] send_command ignored: proxy client is connected"); return False

        if key_code == ButtonName.POWER_ON:
            self.state.set_hint(ent_id)

        id_lo = ent_id & 0xFF
        return self.enqueue_cmd(OP_REQ_ACTIVATE, bytes([id_lo, key_code]))

    def record_app_activation(
        self,
        *,
        ent_id: int,
        ent_kind: str,
        ent_name: str,
        command_id: int,
        command_label: str | None,
        button_label: str | None,
        direction: str,
    ) -> dict[str, Any]:
        record = self.state.record_app_activation(
            ent_id=ent_id,
            ent_kind=ent_kind,
            ent_name=ent_name,
            command_id=command_id,
            command_label=command_label,
            button_label=button_label,
            direction=direction,
        )
        self._notify_app_activation(record)
        return record

    def find_remote(self, hub_version: str | None = None) -> bool:
        """Trigger the hub's "find my remote" feature."""
        version = hub_version or self.hub_version or classify_hub_version(self.mdns_txt)
        self.hub_version = version

        if version == HUB_VERSION_X2:
            return self.enqueue_cmd(OP_FIND_REMOTE_X2, b"\x00\x00\x08")

        return self.enqueue_cmd(OP_FIND_REMOTE)

    def update_x2_remote_sync_id(self, remote_id: bytes) -> None:
        with self._x2_remote_sync_id_lock:
            self._x2_remote_sync_id = bytes(remote_id[:3])
            self._x2_remote_sync_id_event.set()

    def wait_for_x2_remote_sync_id(self, timeout: float = 2.0) -> bytes | None:
        self._x2_remote_sync_id_event.wait(timeout)
        with self._x2_remote_sync_id_lock:
            return self._x2_remote_sync_id

    def resync_remote(self, hub_version: str | None = None) -> bool:
        """Force a physical remote sync with the hub."""
        version = hub_version or self.hub_version or classify_hub_version(self.mdns_txt)
        self.hub_version = version

        if version == HUB_VERSION_X2:
            with self._x2_remote_sync_id_lock:
                self._x2_remote_sync_id = None
                self._x2_remote_sync_id_event.clear()

            if not self.enqueue_cmd(OP_X2_REMOTE_LIST, b"\x00"):
                return False

            remote_id = self.wait_for_x2_remote_sync_id(timeout=2.0)
            if remote_id is None:
                log.warning("[REMOTE_SYNC] timed out waiting for X2 remote list response")
                return False

            return self.enqueue_cmd(OP_X2_REMOTE_SYNC, remote_id + b"\x01")

        return self.enqueue_cmd(OP_REMOTE_SYNC)

    # ------------------------------------------------------------------
    # Virtual IP device/button creation
    # ------------------------------------------------------------------
    def start_virtual_device(
        self,
        *,
        device_name: str | None = None,
        button_name: str | None = None,
        method: str | None = None,
        url: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        with self._pending_virtual_lock:
            self._pending_virtual_event.clear()
            self._pending_virtual = {
                "device_name": device_name or "",
                "button_name": button_name,
                "method": method,
                "url": url,
                "headers": headers or {},
                "device_id": None,
                "button_id": None,
                "status": "pending",
            }

    def update_virtual_device(self, **kwargs) -> dict[str, Any]:
        with self._pending_virtual_lock:
            if self._pending_virtual is None:
                self._pending_virtual = {"headers": {}, "status": "pending"}
            if "headers" in kwargs and kwargs["headers"] is not None:
                merged = dict(self._pending_virtual.get("headers", {}))
                merged.update(kwargs["headers"])
                kwargs["headers"] = merged
            self._pending_virtual.update({k: v for k, v in kwargs.items() if v is not None or k == "status"})
            snapshot = dict(self._pending_virtual)

        if snapshot.get("device_id") is not None and snapshot.get("device_name"):
            self.state.record_virtual_device(
                snapshot["device_id"],
                name=snapshot.get("device_name", ""),
                button_id=snapshot.get("button_id"),
                method=snapshot.get("method"),
                url=snapshot.get("url"),
                headers=snapshot.get("headers"),
                button_name=snapshot.get("button_name"),
            )

        if kwargs.get("status") == "success" or kwargs.get("device_id") is not None:
            self._pending_virtual_event.set()

        return snapshot

    def wait_for_virtual_device(self, timeout: float = 5.0) -> dict[str, Any] | None:
        self._pending_virtual_event.wait(timeout)
        with self._pending_virtual_lock:
            if self._pending_virtual is None:
                return None
            snapshot = dict(self._pending_virtual)
            if snapshot.get("status") == "success":
                self._pending_virtual = None
        return snapshot

    def start_roku_create(self) -> None:
        with self._pending_roku_lock:
            self._pending_roku_event.clear()
            self._pending_roku_device_id = None
        with self._roku_ack_lock:
            self._roku_ack_events.clear()
            self._roku_ack_event.clear()
        with self._macro_payload_lock:
            self._macro_payload_events.clear()
            self._macro_payload_event.clear()
        with self._activity_inputs_lock:
            self._activity_inputs_seen = 0
            self._activity_inputs_last_ts = 0.0
            self._activity_inputs_event.clear()

    def update_roku_device_id(self, device_id: int) -> None:
        with self._pending_roku_lock:
            self._pending_roku_device_id = device_id & 0xFF
            self._pending_roku_event.set()

    def wait_for_roku_device_id(self, timeout: float = 5.0) -> int | None:
        self._pending_roku_event.wait(timeout)
        with self._pending_roku_lock:
            return self._pending_roku_device_id

    def notify_roku_ack(self, opcode: int, payload: bytes) -> None:
        with self._roku_ack_lock:
            self._roku_ack_events.append((opcode, payload))
            self._roku_ack_event.set()

    def wait_for_roku_ack(
        self,
        opcode: int,
        *,
        first_byte: int | None = None,
        timeout: float = 5.0,
    ) -> bool:
        deadline = time.monotonic() + timeout
        while True:
            with self._roku_ack_lock:
                for ack_opcode, ack_payload in self._roku_ack_events:
                    if ack_opcode != opcode:
                        continue
                    if first_byte is not None and (not ack_payload or ack_payload[0] != (first_byte & 0xFF)):
                        continue
                    self._roku_ack_events.remove((ack_opcode, ack_payload))
                    if not self._roku_ack_events:
                        self._roku_ack_event.clear()
                    log.info(
                        "[ACK] opcode=0x%04X payload=%s",
                        ack_opcode,
                        ack_payload.hex(" "),
                    )
                    return True
                self._roku_ack_event.clear()

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                log.warning(
                    "[ACK] timeout waiting opcode=0x%04X first_byte=%s",
                    opcode,
                    f"0x{first_byte:02X}" if first_byte is not None else "*",
                )
                return False
            self._roku_ack_event.wait(min(remaining, 0.2))

    def wait_for_roku_ack_any(
        self,
        candidates: list[tuple[int, int | None]],
        *,
        timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        deadline = time.monotonic() + timeout
        while True:
            with self._roku_ack_lock:
                for ack_opcode, ack_payload in self._roku_ack_events:
                    for want_opcode, want_first_byte in candidates:
                        if ack_opcode != want_opcode:
                            continue
                        if want_first_byte is not None and (not ack_payload or ack_payload[0] != (want_first_byte & 0xFF)):
                            continue
                        self._roku_ack_events.remove((ack_opcode, ack_payload))
                        if not self._roku_ack_events:
                            self._roku_ack_event.clear()
                        log.info(
                            "[ACK] opcode=0x%04X payload=%s",
                            ack_opcode,
                            ack_payload.hex(" "),
                        )
                        return ack_opcode, ack_payload
                self._roku_ack_event.clear()

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                wanted = ", ".join(
                    f"0x{op:04X}/{('*' if first is None else f'0x{first:02X}') }" for op, first in candidates
                )
                log.warning("[ACK] timeout waiting any in [%s]", wanted)
                return None
            self._roku_ack_event.wait(min(remaining, 0.2))

    def cache_macro_payload(self, activity_id: int, button_id: int, payload: bytes) -> None:
        key = (activity_id & 0xFF, button_id & 0xFF)
        with self._macro_payload_lock:
            self._macro_payload_events[key] = bytes(payload)
            self._macro_payload_event.set()

    def wait_for_macro_payload(self, activity_id: int, button_id: int, *, timeout: float = 5.0) -> bytes | None:
        key = (activity_id & 0xFF, button_id & 0xFF)
        deadline = time.monotonic() + timeout
        while True:
            with self._macro_payload_lock:
                cached = self._macro_payload_events.pop(key, None)
                if cached is not None:
                    if not self._macro_payload_events:
                        self._macro_payload_event.clear()
                    return cached
                self._macro_payload_event.clear()

            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return None
            self._macro_payload_event.wait(min(remaining, 0.2))

    def notify_activity_inputs_frame(self) -> None:
        with self._activity_inputs_lock:
            self._activity_inputs_seen += 1
            self._activity_inputs_last_ts = time.monotonic()
            self._activity_inputs_event.set()

    def wait_for_activity_inputs_burst(
        self,
        *,
        timeout: float = 5.0,
        idle_window: float = 0.35,
        min_frames: int = 1,
    ) -> bool:
        """Wait until at least one 0x47 frame arrives and the burst goes idle."""

        deadline = time.monotonic() + timeout
        while True:
            now = time.monotonic()
            with self._activity_inputs_lock:
                seen = self._activity_inputs_seen
                last_ts = self._activity_inputs_last_ts
                if seen >= min_frames and last_ts > 0 and (now - last_ts) >= idle_window:
                    self._activity_inputs_seen = 0
                    self._activity_inputs_last_ts = 0.0
                    self._activity_inputs_event.clear()
                    return True
                self._activity_inputs_event.clear()

            remaining = deadline - now
            if remaining <= 0:
                return False
            self._activity_inputs_event.wait(min(remaining, 0.2))

    def _build_macro_record_chunk(self, *, device_id: int, command_id: int) -> bytes:
        return bytes([device_id & 0xFF, command_id & 0xFF]) + (b"\x00" * 7) + b"\xff"

    def _build_macro_save_payload(
        self,
        source_payload: bytes,
        *,
        device_id: int,
        button_id: int,
        allowed_device_ids: set[int] | None = None,
    ) -> bytes | None:
        """Convert fetched macro payload into the compact save format used by family ``0x12``."""

        if len(source_payload) < 20:
            return None

        label_ascii = b"POWER_ON" if button_id == ButtonName.POWER_ON else b"POWER_OFF"
        label_utf16be = label_ascii.decode("ascii").encode("utf-16be")
        label_utf16le = label_ascii.decode("ascii").encode("utf-16le")

        marker_idx = -1
        for marker in (label_ascii, label_utf16be, label_utf16le):
            marker_idx = source_payload.find(marker)
            if marker_idx > 9:
                break

        if marker_idx <= 9:
            return None

        head = bytearray(source_payload[:9])
        records_blob = source_payload[9:marker_idx]
        tail = source_payload[marker_idx:]

        compact_records: list[bytes] = []

        expanded_rows = False
        if len(records_blob) % 20 == 0 and len(records_blob) >= 20:
            # Distinguish true expanded rows (10-byte record + 10-byte filler)
            # from compact rows whose total length also happens to be divisible by 20.
            expanded_rows = True
            for i in range(0, len(records_blob), 20):
                back10 = records_blob[i + 10 : i + 20]
                if len(back10) != 10:
                    expanded_rows = False
                    break
                if back10[0] not in (0xFF, 0x00):
                    expanded_rows = False
                    break
                if any(b not in (0xFF, 0x00, 0x01) for b in back10):
                    expanded_rows = False
                    break

        if expanded_rows:
            for i in range(0, len(records_blob), 20):
                row20 = records_blob[i : i + 20]
                row10 = row20[:10]
                if len(row10) != 10:
                    return None
                compact_records.append(row10)
        elif len(records_blob) % 10 == 0 and len(records_blob) >= 10:
            for i in range(0, len(records_blob), 10):
                row10 = records_blob[i : i + 10]
                if len(row10) != 10:
                    return None
                compact_records.append(row10)
        else:
            return None

        # Drop placeholder/empty rows emitted by some hubs in macro snapshots.
        # App-issued save payloads do not include these rows.
        compact_records = [
            row
            for row in compact_records
            if row[0] not in (0x00, 0xFF) and row[1] not in (0x00, 0xFF)
        ]

        allowed: set[int] | None = None
        if allowed_device_ids is not None:
            allowed = {d & 0xFF for d in allowed_device_ids}

        trailer_prefix = bytearray()
        while compact_records:
            row = compact_records[-1]

            dev = row[0]
            cmd = row[1]
            if dev in (0x00, 0xFF) or cmd in (0x00, 0xFF):
                break

            looks_like_metadata_tail = False
            if dev > 0x20 and cmd > 0x20:
                looks_like_metadata_tail = True
            elif row[2:] == (b"\x00" * 8) and dev > 0x20:
                looks_like_metadata_tail = True

            if not looks_like_metadata_tail:
                break

            trailer_prefix[:0] = row
            compact_records.pop()

        if allowed is not None:
            compact_records = [
                row
                for row in compact_records
                if row[0] in allowed
            ]

        existing_pairs: set[tuple[int, int]] = set()
        for row in compact_records:
            dev = row[0]
            cmd = row[1]
            if dev in (0x00, 0xFF) or cmd == 0xFF:
                continue
            existing_pairs.add((dev, cmd))

        required_pairs: list[tuple[int, int]]
        if button_id == ButtonName.POWER_ON:
            required_pairs = [
                (device_id & 0xFF, ButtonName.POWER_ON),
                (device_id & 0xFF, 0xC5),
            ]
        else:
            required_pairs = [(device_id & 0xFF, ButtonName.POWER_OFF)]

        for pair in required_pairs:
            if pair in existing_pairs:
                continue
            compact_records.append(self._build_macro_record_chunk(device_id=pair[0], command_id=pair[1]))
            existing_pairs.add(pair)

        head[8] = len(compact_records) & 0xFF
        payload = bytearray(bytes(head) + b"".join(compact_records) + bytes(trailer_prefix) + tail)
        if payload:
            # Last byte in macro payload is an internal token (distinct from
            # outer frame checksum); observed app traffic recomputes it as sum-2.
            payload[-1] = (sum(payload[:-1]) - 2) & 0xFF
        return bytes(payload)

    def _build_roku_device_payload(
        self,
        *,
        device_name: str,
        ip_address: str,
        state_byte: int,
        device_id: int = 0xFF,
        device_class_byte: int = 0x01,
        ip_device: bool = False,
        brand_name: str = "m3tac0de",
    ) -> bytes:
        if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
            payload = bytearray(_ROKU_X1S_CREATE_BASE)
            payload[3] = device_class_byte & 0xFF
            payload[7] = device_id & 0xFF

            def _write_utf16_slot(start: int, span: int, value: str) -> None:
                writable = span
                while writable > 0 and payload[start + writable - 1] != 0x00:
                    writable -= 1
                if writable <= 0:
                    return
                encoded = self._utf16le_padded(value, length=writable)
                payload[start:start + writable] = encoded

            home_name_utf16 = "Home Assistant".encode("utf-16le")
            name_positions: list[int] = []
            search_from = 0
            while True:
                idx = payload.find(home_name_utf16, search_from)
                if idx < 0:
                    break
                name_positions.append(idx)
                search_from = idx + len(home_name_utf16)

            default_ip = bytes([192, 168, 2, 77])
            ip_idx = payload.find(default_ip)
            if len(name_positions) >= 2:
                first_name_idx, second_name_idx = name_positions[:2]
                _write_utf16_slot(first_name_idx, second_name_idx - first_name_idx, device_name)
                tail_bound = ip_idx if ip_idx > second_name_idx else len(payload)
                _write_utf16_slot(second_name_idx, tail_bound - second_name_idx, brand_name)

            custom_ip = ipaddress.IPv4Address(ip_address).packed
            if ip_device:
                payload[10] = 0x1C
                if ip_idx >= 0:
                    payload[ip_idx:ip_idx + 4] = b"\x00\x00\x00\x00"
                    marker_start = max(ip_idx - 2, 0)
                    ip_tail = bytes([0xFC, 0x00, 0x00, 0xFC, 0x02, 0x00, 0x00, 0x00, 0xFC, 0x00, 0xFC, state_byte & 0xFF])
                    payload[marker_start:marker_start + len(ip_tail)] = ip_tail
            else:
                if ip_idx >= 0:
                    payload[ip_idx:ip_idx + 4] = custom_ip

                state_marker = b"\xfc\x02\x00\x02\x00\xfc\x00\xfc\x00"
                state_idx = payload.find(state_marker)
                if state_idx >= 0:
                    payload[state_idx + 2] = state_byte & 0xFF
                    payload[state_idx + 8] = state_byte & 0xFF
            return bytes(payload)

        payload = bytearray(
            _hex_to_bytes(
                "01 00 01 01 00 01 00 ff 01 00 0a 10 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
                "4d 00 "
                "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
                "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 "
                "fc 55 00 00 00 00 fc 00 00 fc 02 00 02 00 fc 00 fc 01 00 00 00 00 00 00 00 00 00 00 00 00 00"
            )
        )
        payload[7] = device_id & 0xFF
        payload[32:62] = _ascii_padded(device_name, length=30)
        payload[62:92] = _ascii_padded(brand_name, length=30)
        payload[94:98] = ipaddress.IPv4Address(ip_address).packed
        payload[103] = state_byte & 0xFF
        return bytes(payload)

    def get_routed_local_ip(self) -> str:
        """Return the local IPv4 address selected by OS routing toward the real hub."""

        return _route_local_ip(self.real_hub_ip)


    def _wait_for_activity_map_burst(self, act_id: int, *, timeout: float = 5.0) -> bool:
        deadline = time.monotonic() + timeout
        act_lo = act_id & 0xFF
        while time.monotonic() < deadline:
            if act_lo in self._activity_map_complete:
                return True
            time.sleep(0.05)
        log.warning("[ACTMAP] timeout waiting for activity map burst act=0x%02X", act_lo)
        return False

    def _activities_requiring_confirmation(self) -> list[int]:
        targets: list[int] = []
        for act_lo, details in sorted(self.state.activities.items()):
            if not isinstance(details, dict):
                continue
            if bool(details.get("needs_confirm", False)):
                targets.append(act_lo & 0xFF)
        return targets

    def _clear_x1s_confirm_flag(self, payload: bytes) -> bytes:
        mutable = bytearray(payload)
        marker_indexes = [
            idx
            for idx in range(max(0, len(mutable) - 80), len(mutable) - 3)
            if mutable[idx] == 0xFC and mutable[idx + 2] == 0xFC
        ]
        if marker_indexes:
            mutable[marker_indexes[-1] + 3] = 0x00
        return bytes(mutable)

    def _build_activity_confirm_payload(self, activity_id: int) -> bytes | None:
        act_lo = activity_id & 0xFF
        activity = self.state.activities.get(act_lo)
        if not isinstance(activity, dict):
            return None

        if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
            row_payload = self._activity_row_payloads.get(act_lo)
            if isinstance(row_payload, (bytes, bytearray)) and len(row_payload) >= 120:
                return self._clear_x1s_confirm_flag(bytes(row_payload))

        name = str(activity.get("name", ""))
        encoded_name = name.encode("ascii", errors="ignore")[:60].ljust(60, b"\x00")
        active_flag = 0x01 if bool(activity.get("active", False)) else 0x02

        return (
            bytes([
                0x01,
                0x00,
                0x01,
                0x01,
                0x00,
                0x01,
                0x00,
                act_lo,
                0x01,
                active_flag,
            ])
            + (b"\x00" * 22)
            + encoded_name
            + bytes([0xFC, 0x00, 0xFC, 0x00])
            + (b"\x00" * 27)
        )

    def delete_device(self, device_id: int) -> dict[str, Any] | None:
        if not self.can_issue_commands():
            log.info("[DELETE] delete_device ignored: proxy client is connected")
            return None

        dev_lo = device_id & 0xFF
        self.start_roku_create()

        if not self._send_roku_step(
            step_name=f"delete-device[dev=0x{dev_lo:02X}]",
            family=0x09,
            payload=bytes([dev_lo]),
            ack_opcode=0x0103,
            timeout=30.0,
        ):
            return None

        if not self.request_activities():
            log.warning("[DELETE] failed to refresh activities after deleting dev=0x%02X", dev_lo)
            return None

        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            if self._burst.active and self._burst.kind == "activities":
                break
            time.sleep(0.01)
        while time.monotonic() < deadline:
            if not self._burst.active:
                break
            time.sleep(0.01)
        if self._burst.active:
            log.warning("[DELETE] timeout waiting for activities burst after deleting dev=0x%02X", dev_lo)
            return None

        confirmed_activities: list[int] = []
        for act_lo in self._activities_requiring_confirmation():
            confirm_payload = self._build_activity_confirm_payload(act_lo)
            if confirm_payload is None:
                log.warning("[DELETE] missing cached activity row for confirm act=0x%02X", act_lo)
                return None

            confirm_opcode = (
                OP_ACTIVITY_ASSIGN_FINALIZE
                if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2)
                else OP_ACTIVITY_CONFIRM
            )
            log.info("[DELETE] confirming updated activity act=0x%02X", act_lo)
            self._send_cmd_frame(confirm_opcode, confirm_payload)
            if self.wait_for_roku_ack_any([(0x0103, None)], timeout=5.0) is None:
                log.warning("[DELETE] missing ACK after activity confirm act=0x%02X", act_lo)
                return None

            activity = self.state.activities.get(act_lo)
            if isinstance(activity, dict):
                activity["needs_confirm"] = False
            self.clear_entity_cache(act_lo, clear_buttons=True, clear_favorites=True, clear_macros=True)
            confirmed_activities.append(act_lo)

        self.state.devices.pop(dev_lo, None)
        self.state.buttons.pop(dev_lo, None)
        self.state.ip_devices.pop(dev_lo, None)
        self.state.ip_buttons.pop(dev_lo, None)
        self.clear_entity_cache(dev_lo)

        return {
            "device_id": dev_lo,
            "confirmed_activities": confirmed_activities,
            "status": "success",
        }

    def add_device_to_activity(self, activity_id: int, device_id: int) -> dict[str, Any] | None:
        """Add ``device_id`` to ``activity_id`` and replay POWER_ON/OFF macro updates."""

        if not self.can_issue_commands():
            log.info("[ACTIVITY_ASSIGN] add_device_to_activity ignored: proxy client is connected")
            return None

        act_lo = activity_id & 0xFF
        dev_lo = device_id & 0xFF

        log.info("[ACTIVITY_ASSIGN] start act=0x%02X (%d) add dev=0x%02X (%d)", act_lo, act_lo, dev_lo, dev_lo)

        self._activity_map_complete.discard(act_lo)
        # Refresh mapping-derived members/slots to avoid carrying stale entries
        # from prior bursts into a new assignment transaction.
        self.state.activity_members.pop(act_lo, None)
        self.state.activity_command_refs.pop(act_lo, None)
        self.state.activity_favorite_slots.pop(act_lo, None)
        self.state.activity_favorite_labels.pop(act_lo, None)
        self._clear_favorite_label_requests_for_activity(act_lo)

        if not self.request_activity_mapping(act_lo):
            log.warning("[ACTIVITY_ASSIGN] failed to request activity map for act=0x%02X", act_lo)
            return None
        if not self._wait_for_activity_map_burst(act_lo, timeout=5.0):
            return None

        current_members = self.state.get_activity_members(act_lo)
        if not current_members:
            # Fallback for older cached data paths where only favorites were parsed.
            current_members = sorted(
                {
                    int(slot.get("device_id", 0)) & 0xFF
                    for slot in self.state.get_activity_favorite_slots(act_lo)
                    if int(slot.get("device_id", 0)) & 0xFF
                }
            )
        if not current_members:
            log.warning("[ACTIVITY_ASSIGN] no existing members discovered for act=0x%02X", act_lo)

        ordered_members: list[int] = []
        for member in current_members + [dev_lo]:
            if member not in ordered_members:
                ordered_members.append(member)

        log.info("[ACTIVITY_ASSIGN] members before=%s target=%s", current_members, ordered_members)

        self.start_roku_create()

        for index, member in enumerate(ordered_members):
            # Observed app traffic keeps 0x01 on the first two rows in the
            # device-confirm batch and uses 0x00 for subsequent rows.
            # Replaying this pattern prevents later adds from displacing the
            # previously-added third device.
            include_flag = 0x01 if index < 2 else 0x00
            payload = bytes([member & 0xFF, include_flag])
            log.info(
                "[ACTIVITY_ASSIGN] confirm member dev=0x%02X include=0x%02X",
                member & 0xFF,
                include_flag,
            )
            self._send_cmd_frame(OP_ACTIVITY_DEVICE_CONFIRM, payload)
            if self.wait_for_roku_ack_any([(0x0103, None)], timeout=5.0) is None:
                log.warning(
                    "[ACTIVITY_ASSIGN] missing ACK after 0x024F dev=0x%02X include=0x%02X",
                    member & 0xFF,
                    include_flag,
                )
                return None

        macro_updates: list[int] = []
        for macro_button in (ButtonName.POWER_ON, ButtonName.POWER_OFF):
            macro_name = BUTTONNAME_BY_CODE.get(macro_button, f"0x{macro_button:02X}")
            log.info("[ACTIVITY_ASSIGN] fetch macro act=0x%02X button=%s", act_lo, macro_name)
            self._send_cmd_frame(OP_REQ_MACRO_LABELS, bytes([act_lo, macro_button]))

            # POWER_ON follows an extra input-selection wizard step on the hub.
            # Replay it to keep the save-state machine aligned with the app.
            if macro_button == ButtonName.POWER_ON:
                pre_payload = self.wait_for_macro_payload(act_lo, macro_button, timeout=5.0)
                if pre_payload is None:
                    log.warning(
                        "[ACTIVITY_ASSIGN] missing pre-input macro payload act=0x%02X button=0x%02X",
                        act_lo,
                        macro_button,
                    )
                    return None
                self._send_cmd_frame(OP_REQ_ACTIVITY_INPUTS, b"\x01")
                if not self.wait_for_activity_inputs_burst(timeout=5.0):
                    ack_result = self.wait_for_roku_ack_any([(0x0103, None)], timeout=0.5)
                    if ack_result is None:
                        log.warning("[ACTIVITY_ASSIGN] missing activity-inputs response act=0x%02X", act_lo)
                        return None
                    ack_payload = ack_result[1]
                    ack_code = ack_payload[0] if ack_payload else 0x00
                    if ack_code not in (0x00, 0x07):
                        log.warning(
                            "[ACTIVITY_ASSIGN] activity-inputs returned error-like ACK act=0x%02X code=0x%02X",
                            act_lo,
                            ack_code,
                        )
                        return None
                    log.info(
                        "[ACTIVITY_ASSIGN] activity-inputs fell back to ACK-only response act=0x%02X code=0x%02X",
                        act_lo,
                        ack_code,
                    )
                self._send_cmd_frame(OP_REQ_MACRO_LABELS, bytes([act_lo, macro_button]))

            source_payload = self.wait_for_macro_payload(act_lo, macro_button, timeout=5.0)
            if source_payload is None:
                log.warning(
                    "[ACTIVITY_ASSIGN] missing macro payload act=0x%02X button=0x%02X",
                    act_lo,
                    macro_button,
                )
                return None

            updated_payload = self._build_macro_save_payload(
                source_payload,
                device_id=dev_lo,
                button_id=macro_button,
                allowed_device_ids=set(ordered_members),
            )
            if updated_payload is None:
                log.warning(
                    "[ACTIVITY_ASSIGN] unable to build macro save payload act=0x%02X button=0x%02X",
                    act_lo,
                    macro_button,
                )
                return None

            save_opcode = ((len(updated_payload) & 0xFF) << 8) | 0x12
            row_count = updated_payload[8] if len(updated_payload) >= 9 else 0
            log.info(
                "[ACTIVITY_ASSIGN] save macro act=0x%02X button=0x%02X opcode=0x%04X payload=%dB rows=%d",
                act_lo,
                macro_button,
                save_opcode,
                len(updated_payload),
                row_count,
            )
            if self.diag_dump:
                log.info("[ACTIVITY_ASSIGN] save macro payload %s", updated_payload.hex(" "))

            self._send_family_frame(0x12, updated_payload)
            ack_candidates = [(0x0112, macro_button), (0x0112, 0x01)]
            macro_ack = self.wait_for_roku_ack_any(
                ack_candidates,
                timeout=5.0,
            )
            if macro_ack is None and updated_payload != source_payload:
                log.warning(
                    "[ACTIVITY_ASSIGN] missing ACK after macro save act=0x%02X button=0x%02X; retrying source payload",
                    act_lo,
                    macro_button,
                )
                self._send_family_frame(0x12, source_payload)
                macro_ack = self.wait_for_roku_ack_any(
                    ack_candidates,
                    timeout=5.0,
                )

            if macro_ack is None:
                log.warning(
                    "[ACTIVITY_ASSIGN] missing ACK after macro save act=0x%02X button=0x%02X",
                    act_lo,
                    macro_button,
                )
                return None

            ack_opcode, ack_payload = macro_ack
            if ack_opcode == 0x0112 and ack_payload and ack_payload[0] != (macro_button & 0xFF):
                log.info(
                    "[ACTIVITY_ASSIGN] macro save ack fallback act=0x%02X button=0x%02X ack=0x%02X",
                    act_lo,
                    macro_button,
                    ack_payload[0],
                )
            macro_updates.append(macro_button)

        if self.hub_version == HUB_VERSION_X2:
            commit_payload = bytes([act_lo, 0x01])
            log.info("[ACTIVITY_ASSIGN] commit assignment act=0x%02X payload=%s", act_lo, commit_payload.hex(" "))
            self._send_cmd_frame(OP_ACTIVITY_ASSIGN_COMMIT, commit_payload)
            if self.wait_for_roku_ack_any([(0x0103, None)], timeout=5.0) is None:
                log.warning("[ACTIVITY_ASSIGN] missing ACK after 0x0265 commit act=0x%02X", act_lo)
                return None

        self.clear_entity_cache(
            act_lo,
            clear_buttons=False,
            clear_favorites=False,
            clear_macros=True,
        )

        log.info("[ACTIVITY_ASSIGN] completed act=0x%02X add dev=0x%02X with macro updates", act_lo, dev_lo)
        return {
            "activity_id": act_lo,
            "device_id": dev_lo,
            "members_before": current_members,
            "members_confirmed": ordered_members,
            "macros_updated": macro_updates,
            "status": "success",
        }

    def _build_favorite_map_payload(
        self,
        *,
        activity_id: int,
        device_id: int,
        command_id: int,
        slot_id: int,
    ) -> bytes:
        payload = bytearray(
            [
                0x01,
                0x00,
                0x01,
                0x01,
                0x00,
                0x01,
                activity_id & 0xFF,
                slot_id & 0xFF,
                device_id & 0xFF,
                0x00,
                0x00,
                0x00,
                0x00,
            ]
        )
        cmd_lo = command_id & 0xFF
        if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
            payload.extend([0x4E, 0x20 + cmd_lo])
        else:
            payload.extend((0x4E24).to_bytes(2, "big"))
        payload.extend(
            [
                cmd_lo,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
            ]
        )
        payload.append((sum(payload) - 2) & 0xFF)
        return bytes(payload)

    def _build_favorite_stage_payload(self, activity_id: int) -> bytes:
        """Build the observed 0x61 stage payload for favorite writes."""

        act_lo = activity_id & 0xFF
        if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
            payload = bytearray(
                [
                    0x01,
                    0x00,
                    0x01,
                    0x01,
                    0x00,
                    0x01,
                    act_lo,
                    0x01,
                    0x01,
                    0x02,
                    0x02,
                    0x03,
                    0x03,
                    0x04,
                    0x04,
                ]
            )
            payload.append((sum(payload) - 2) & 0xFF)
            return bytes(payload)

        return bytes([0x00, 0x01, 0x01, 0x00, 0x01, act_lo, 0x01, 0x01, 0x6A])

    def _build_command_to_button_payload(
        self,
        *,
        activity_id: int,
        button_id: int,
        device_id: int,
        command_id: int,
    ) -> bytes:
        """Build the observed 0x193E command-to-button mapping payload."""

        act_lo = activity_id & 0xFF
        btn_lo = button_id & 0xFF
        dev_lo = device_id & 0xFF
        cmd_lo = command_id & 0xFF

        payload = bytearray(
            [
                0x01,
                0x00,
                0x01,
                0x01,
                0x00,
                0x01,
                act_lo,
                btn_lo,
                dev_lo,
                0x00,
                0x00,
                0x00,
                0x00,
            ]
        )
        payload.extend([0x4E, 0x20 + cmd_lo, cmd_lo])
        payload.extend([0x00] * 8)
        payload.append((sum(payload) - 2) & 0xFF)
        return bytes(payload)

    def command_to_favorite(
        self,
        activity_id: int,
        device_id: int,
        command_id: int,
        *,
        slot_id: int | None = None,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Add a command favorite to an arbitrary activity."""

        if not self.can_issue_commands():
            log.info("[FAVORITE] command_to_favorite ignored: proxy client is connected")
            return None

        act_lo = activity_id & 0xFF
        dev_lo = device_id & 0xFF
        cmd_lo = command_id & 0xFF
        slot_lo = (0 if slot_id is None else slot_id) & 0xFF

        self.start_roku_create()

        if not self._send_roku_step(
            step_name=f"favorite-map[act=0x{act_lo:02X} slot=0x{slot_lo:02X}]",
            family=0x3E,
            payload=self._build_favorite_map_payload(
                activity_id=act_lo,
                device_id=dev_lo,
                command_id=cmd_lo,
                slot_id=slot_lo,
            ),
            ack_opcode=0x013E,
            ack_first_byte=None,
            ack_fallback_opcodes=(0x0103,),
            timeout=7.5,
            retries=1,
            retry_delay=0.15,
        ):
            return None

        if not self._send_roku_step(
            step_name=f"favorite-stage-61[act=0x{act_lo:02X}]",
            family=0x61,
            payload=self._build_favorite_stage_payload(act_lo),
            ack_opcode=0x0103,
        ):
            return None

        if not self._send_roku_step(
            step_name=f"favorite-commit-65[act=0x{act_lo:02X}]",
            family=0x65,
            payload=bytes([act_lo]),
            ack_opcode=0x0103,
        ):
            return None

        self.clear_entity_cache(act_lo, clear_buttons=False, clear_favorites=True, clear_macros=False)
        self._activity_map_complete.discard(act_lo)
        if refresh_after_write:
            self.request_activity_mapping(act_lo)

        return {
            "activity_id": act_lo,
            "device_id": dev_lo,
            "command_id": cmd_lo,
            "slot_id": slot_lo,
            "status": "success",
        }

    def command_to_button(
        self,
        activity_id: int,
        button_id: int,
        device_id: int,
        command_id: int,
        *,
        refresh_after_write: bool = True,
    ) -> dict[str, Any] | None:
        """Map a device command to a physical activity button using 0x193E."""

        if not self.can_issue_commands():
            log.info("[KEYMAP_WRITE] command_to_button ignored: proxy client is connected")
            return None

        act_lo = activity_id & 0xFF
        btn_lo = button_id & 0xFF
        dev_lo = device_id & 0xFF
        cmd_lo = command_id & 0xFF

        payload = self._build_command_to_button_payload(
            activity_id=act_lo,
            button_id=btn_lo,
            device_id=dev_lo,
            command_id=cmd_lo,
        )
        log.info(
            "[KEYMAP_WRITE] map act=0x%02X button=0x%02X dev=0x%02X cmd=0x%02X",
            act_lo,
            btn_lo,
            dev_lo,
            cmd_lo,
        )
        if self.diag_dump:
            log.info("[KEYMAP_WRITE] 193E payload %s", payload.hex(" "))

        self.start_roku_create()

        if not self._send_roku_step(
            step_name=f"keymap-write[act=0x{act_lo:02X} btn=0x{btn_lo:02X}]",
            family=0x3E,
            payload=payload,
            ack_opcode=0x013E,
            ack_first_byte=btn_lo,
            ack_fallback_opcodes=(0x0103,),
            timeout=7.5,
            retries=1,
            retry_delay=0.15,
        ):
            return None

        if not self._send_roku_step(
            step_name=f"keymap-commit-65[act=0x{act_lo:02X}]",
            family=0x65,
            payload=bytes([act_lo]),
            ack_opcode=0x0103,
        ):
            return None

        self.clear_entity_cache(act_lo, clear_buttons=True, clear_favorites=False, clear_macros=False)
        self._activity_map_complete.discard(act_lo)
        if refresh_after_write:
            self.request_activity_mapping(act_lo)
            self.get_buttons_for_entity(act_lo, fetch_if_missing=True)

        return {
            "activity_id": act_lo,
            "button_id": btn_lo,
            "device_id": dev_lo,
            "command_id": cmd_lo,
            "status": "success",
        }

    def create_wifi_device(
        self,
        device_name: str = "Home Assistant",
        commands: list[str] | None = None,
        request_port: int = 8060,
        brand_name: str = "m3tac0de",
    ) -> dict[str, Any] | None:
        if not self.can_issue_commands():
            log.info("[WIFI] create_wifi_device ignored: proxy client is connected")
            return None

        ip_address = self.get_routed_local_ip()

        if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
            return self._create_virtual_ip_wifi_device(
                device_name=device_name,
                commands=commands,
                ip_address=ip_address,
                request_port=request_port,
                brand_name=brand_name,
            )

        self.start_roku_create()
        log.info("[WIFI] starting exact Wifi Device create replay sequence")

        if not self._send_roku_step(
            step_name="create-device",
            family=0x07,
            payload=self._build_roku_device_payload(device_name=device_name, ip_address=ip_address, state_byte=0x00, brand_name=brand_name),
            ack_opcode=0x0107,
        ):
            return None

        device_id = self.wait_for_roku_device_id(timeout=5.0)
        if device_id is None:
            log.warning("[WIFI] hub did not provide device id after create request")
            return None
        log.info("[WIFI] hub assigned device id=0x%02X", device_id)

        command_defs: list[tuple[int, int, str, str]] = []

        if commands:
            for idx, command_name in enumerate(commands[: len(_ROKU_APP_SLOTS)]):
                slot, code = _ROKU_APP_SLOTS[idx]
                action = self._build_launch_action_path(
                    device_id=device_id,
                    command_name=command_name,
                    device_name=device_name,
                )
                command_defs.append((slot, code, command_name, action))

        for slot, code, name, action in command_defs:
            if self.hub_version in (HUB_VERSION_X1S, HUB_VERSION_X2):
                name_utf16 = name.encode("utf-16le")[:59]
                name_blob = b"\x00" + name_utf16
                name_blob = name_blob.ljust(60, b"\x00")
            else:
                name_blob = name.encode("ascii", errors="ignore")[:30].ljust(30, b"\x00")
            action_blob = action.encode("ascii", errors="ignore")[:255]
            payload_base = (
                bytes([slot, 0x00, 0x01, 0x21, 0x00, 0x01, device_id, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x00])
                + code.to_bytes(2, "big")
                + name_blob
                + bytes([len(action_blob)])
                + action_blob
            )
            payload_token = (sum(payload_base) - (slot + 1)) & 0xFF
            payload = payload_base + bytes([payload_token])
            if not self._send_roku_step(
                step_name=f"define-command[{slot:02d}] {name}",
                family=0x0E,
                payload=payload,
                ack_opcode=0x0103,
            ):
                return None

        mapping_defs: list[tuple[int, int]] = [
            (0xAB, 0x1713),
            (0xB3, 0x0074),
            (0xB4, 0x07C7),
            (0xAF, 0x0030),
            (0xAE, 0x002E),
            (0xB1, 0x0031),
            (0xB2, 0x002F),
            (0xB0, 0x002A),
            (0xB8, 0x006A),
            (0xB9, 0x0033),
            (0xB6, 0x2E77),
            (0xBB, 0x008D),
            (0xBC, 0x0092),
            (0xBD, 0x0097),
        ]
        for button_id, code in mapping_defs:
            payload = (
                bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, device_id, button_id, device_id, 0x00, 0x00, 0x00, 0x00])
                + code.to_bytes(2, "big")
                + b"\x00" * 10
            )
            if not self._send_roku_step(
                step_name=f"map-button[0x{button_id:02X}]",
                family=0x3E,
                payload=payload,
                ack_opcode=0x013E,
                ack_first_byte=button_id,
                ack_fallback_opcodes=(0x0103,),
            ):
                return None

        if not self._send_roku_step(
            step_name="post-map-commit",
            family=0x41,
            payload=bytes([device_id, 0x04]),
            ack_opcode=0x0103,
        ):
            return None

        for button_id, code, name in ((0xC6, 0x1713, "POWER_ON"), (0xC7, 0x1718, "POWER_OFF")):
            name_blob = name.encode("ascii", errors="ignore")[:30].ljust(30, b"\x00")
            payload_base = (
                bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, device_id, button_id, 0x01, device_id, 0x00, 0x00, 0x00, 0x00, 0x00])
                + code.to_bytes(2, "big")
                + b"\x00\xff"
                + name_blob
            )
            payload_token = (sum(payload_base) - 0x02) & 0xFF
            payload = payload_base + bytes([payload_token])
            if not self._send_roku_step(
                step_name=f"define-power[{name}]",
                family=0x12,
                payload=payload,
                ack_opcode=0x0112,
                ack_first_byte=button_id,
                ack_fallback_opcodes=(0x0103,),
            ):
                return None

        if not self._send_roku_step(
            step_name="sync-stage-7746",
            family=0x46,
            payload=bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, device_id]) + (b"\x00" * 112),
            ack_opcode=0x0103,
        ):
            return None

        if not self._send_roku_step(
            step_name="confirm-power-config",
            family=0x41,
            payload=bytes([device_id, 0x04]),
            ack_opcode=0x0103,
        ):
            return None

        payload_7b08 = self._build_roku_device_payload(
            device_name=device_name,
            ip_address=ip_address,
            state_byte=0x01,
            device_id=device_id,
            brand_name=brand_name,
        )
        if not self._send_roku_step(
            step_name="finalize-device-7b08",
            family=0x08,
            payload=payload_7b08,
            ack_opcode=0x0103,
        ):
            return None

        if not self._send_roku_step(
            step_name="save-tail-0064",
            family=0x64,
            payload=b"",
            ack_opcode=0x0103,
        ):
            return None

        if not self.request_devices():
            log.warning("[WIFI] failed to request device list refresh after create")

        log.info("[WIFI] replayed Wifi Device create sequence for dev=0x%02X", device_id)
        return {"device_id": device_id, "status": "success"}

    def _create_virtual_ip_wifi_device(
        self,
        *,
        device_name: str,
        commands: list[str] | None,
        ip_address: str,
        request_port: int,
        brand_name: str = "m3tac0de",
    ) -> dict[str, Any] | None:
        self.start_roku_create()
        log.info("[WIFI] starting virtual IP Wifi Device create replay sequence")

        if not self._send_roku_step(
            step_name="create-device",
            family=0x07,
            payload=self._build_roku_device_payload(device_name=device_name, ip_address=ip_address, state_byte=0x00, ip_device=True, brand_name=brand_name),
            ack_opcode=0x0107,
        ):
            return None

        device_id = self.wait_for_roku_device_id(timeout=5.0)
        if device_id is None:
            log.warning("[WIFI] hub did not provide device id after create request")
            return None

        request_ip = ipaddress.IPv4Address(ip_address).packed
        for idx, command_name in enumerate((commands or [])[:10]):
            slot = (idx + 1) & 0xFF
            # Observed X1S/X2 0x?E0E payloads encode command labels in a 59-byte field.
            # Using 59 keeps downstream request bytes aligned so method parses as POST (not xPOST).
            command_utf16 = command_name.encode("utf-16le")[:59].ljust(59, b"\x00")
            request_blob = self._build_virtual_ip_http_request(
                host=ip_address,
                port=request_port,
                path=self._build_launch_action_path(
                    device_id=device_id,
                    command_name=command_name,
                    device_name=device_name,
                ),
            )
            payload_base = (
                bytes([slot, 0x00, 0x01, 0x03, 0x00, 0x01, device_id, 0x00, 0x1C])
                + (b"\x00" * 7)
                + command_utf16
                + request_ip
                + int(request_port & 0xFFFF).to_bytes(2, "big")
                + b"\x00"
                + bytes([len(request_blob) & 0xFF])
                + request_blob
            )
            payload_token = (sum(payload_base) - (slot + 1)) & 0xFF
            payload = payload_base + bytes([payload_token])
            if not self._send_roku_step(
                step_name=f"define-ip-command[{slot:02d}] {command_name}",
                family=0x0E,
                payload=payload,
                ack_opcode=0x0103,
            ):
                return None

        if not self._send_roku_step(
            step_name="post-map-commit",
            family=0x41,
            payload=bytes([device_id, 0x04]),
            ack_opcode=0x0103,
        ):
            return None

        if not self._send_roku_step(
            step_name="sync-stage-7746",
            family=0x46,
            payload=bytes([0x01, 0x00, 0x01, 0x01, 0x00, 0x01, device_id]) + (b"\x00" * 112),
            ack_opcode=0x0103,
        ):
            return None

        payload_7b08 = self._build_roku_device_payload(
            device_name=device_name,
            ip_address=ip_address,
            state_byte=0x01,
            device_id=device_id,
            ip_device=True,
            brand_name=brand_name,
        )
        if not self._send_roku_step(
            step_name="finalize-device-7b08",
            family=0x08,
            payload=payload_7b08,
            ack_opcode=0x0103,
        ):
            return None

        if not self._send_roku_step(
            step_name="save-tail-0064",
            family=0x64,
            payload=b"",
            ack_opcode=0x0103,
        ):
            return None

        if not self.request_devices():
            log.warning("[WIFI] failed to request device list refresh after create")

        log.info("[WIFI] replayed virtual IP Wifi Device create sequence for dev=0x%02X", device_id)
        return {"device_id": device_id, "status": "success"}

    def _build_launch_action_path(self, *, device_id: int, command_name: str, device_name: str) -> str:
        hub_action_id = self._stable_hub_action_id()
        normalized_command = command_name.replace(" ", "_")
        normalized_device = device_name.replace(" ", "_")
        return f"launch/{hub_action_id}/{device_id}/{normalized_command}/{normalized_device}"

    def _build_virtual_ip_http_request(self, host: str, port: int, path: str) -> bytes:
        normalized_path = f"/{path.lstrip('/')}"
        return (
            f"POST {normalized_path} HTTP/1.1\r\n"
            f"Host:{host}:{int(port) & 0xFFFF}\r\n"
            "Content-Type:application/x-www-form-urlencoded\r\n"
            "\r\n"
        ).encode("ascii")

    def _stable_hub_action_id(self) -> str:
        """Return a stable hub identifier for WiFi command actions."""

        raw_mac = str(self.mdns_txt.get("MAC") or self.mdns_txt.get("mac") or "").strip()
        if raw_mac:
            normalized_mac = re.sub(r"[^0-9A-Fa-f]", "", raw_mac).lower()
            if normalized_mac:
                return normalized_mac

        return str(self.proxy_id).strip()

    def _build_virtual_device_frames(
        self,
        *,
        device_name: str,
        button_name: str,
        method: str,
        url: str,
        headers: dict[str, str],
    ) -> list[tuple[int, bytes]]:
        name_blob = self._utf16le_padded(device_name, length=64)
        button_blob = self._utf16le_padded(button_name, length=64)
        method_blob = method.encode("utf-8")
        url_blob = url.encode("utf-8")
        header_blob = self._encode_headers(headers)

        create_payload = b"\x01\x00\x00\x00" + name_blob
        define_payload = (
            button_blob
            + self._encode_len_prefixed(method_blob)
            + self._encode_len_prefixed(url_blob)
            + self._encode_len_prefixed(header_blob)
        )
        prepare_payload = b"\x01\x00"
        finalize_payload = name_blob[:8] + button_blob[:8]

        return [
            (OP_CREATE_DEVICE_HEAD, create_payload),
            (OP_DEFINE_IP_CMD, define_payload),
            (OP_PREPARE_SAVE, prepare_payload),
            (OP_FINALIZE_DEVICE, finalize_payload),
            (OP_SAVE_COMMIT, b""),
        ]

    def _encode_http_request(self, method: str, url: str, headers: dict[str, str]) -> bytes:
        header_lines = "".join(f"{k}:{v}\r\n" for k, v in headers.items())
        request = f"{method} {url} HTTP/1.1\r\n{header_lines}\r\n"
        return request.encode("utf-8")

    def _build_existing_device_frame(
        self,
        *,
        device_id: int,
        button_id: int,
        button_name: str,
        method: str,
        url: str,
        headers: dict[str, str],
    ) -> tuple[int, bytes]:
        """Construct the opcode/payload needed to add an IP command to an existing device."""

        header = bytes(
            [
                button_id & 0xFF,
                0x00,
                0x01,
                0x01,
                0x00,
                0x01,
                device_id & 0xFF,
                button_id & 0xFF,
                0x1C,
            ]
        ) + b"\x00" * 7

        payload = bytearray(header)
        payload.extend(self._utf16le_padded(button_name, length=64))
        payload.extend(self._encode_http_request(method, url, headers))
        return OP_DEFINE_IP_CMD_EXISTING, bytes(payload)

    def create_ip_button(
        self,
        *,
        device_name: str,
        button_name: str,
        method: str,
        url: str,
        headers: dict[str, str],
    ) -> dict[str, Any] | None:
        if not self.can_issue_commands():
            log.info("[CREATE] create_ip_button ignored: proxy client is connected")
            return None

        frames = self._build_virtual_device_frames(
            device_name=device_name,
            button_name=button_name,
            method=method,
            url=url,
            headers=headers,
        )

        self.start_virtual_device(
            device_name=device_name,
            button_name=button_name,
            method=method,
            url=url,
            headers=headers,
        )

        for opcode, payload in frames:
            self._send_cmd_frame(opcode, payload)
            time.sleep(0.05)

        result = self.wait_for_virtual_device(timeout=3.0)
        if result and result.get("device_id") is not None:
            log.info(
                "[CREATE] virtual dev=0x%04X btn=%s method=%s url=%s",
                result.get("device_id", 0),
                result.get("button_id"),
                result.get("method"),
                result.get("url"),
            )
        return result

    def add_ip_button_to_device(
        self,
        *,
        device_id: int,
        button_name: str,
        method: str,
        url: str,
        headers: dict[str, str],
    ) -> dict[str, Any] | None:
        """Add an IP-backed command to an existing device."""

        if not self.can_issue_commands():
            log.info("[CREATE] add_ip_button_to_device ignored: proxy client is connected")
            return None

        self.request_ip_commands_for_device(device_id, wait=True)
        existing = self.state.ip_buttons.get(device_id & 0xFF, {})
        next_button_id = (max(existing.keys()) + 1) if existing else 1

        device_name = self.state.devices.get(device_id & 0xFF, {}).get("name", f"Device {device_id}")

        opcode, payload = self._build_existing_device_frame(
            device_id=device_id,
            button_id=next_button_id,
            button_name=button_name,
            method=method,
            url=url,
            headers=headers,
        )

        self.start_virtual_device(
            device_name=device_name,
            button_name=button_name,
            method=method,
            url=url,
            headers=headers,
        )

        self._send_cmd_frame(opcode, payload)

        result = self.wait_for_virtual_device(timeout=3.0)
        self.request_ip_commands_for_device(device_id, wait=True)
        return result

    # ---------------------------------------------------------------------
    # mDNS advertisement
    # ---------------------------------------------------------------------
    def _start_mdns(self) -> None:
        from zeroconf import BadTypeInNameException, IPVersion, ServiceInfo, Zeroconf

        ip_bytes = socket.inet_aton(_route_local_ip(self.real_hub_ip))
        service_type = mdns_service_type_for_props(self.mdns_txt)
        instance = self.mdns_instance
        host = (self.mdns_host or instance) + "."

        props = {k: v.encode("utf-8") for k, v in self.mdns_txt.items()}

        # reset any previous registrations in case of restart
        self._mdns_infos = []

        zc = self._zc
        if zc is None:
            zc = Zeroconf(ip_version=IPVersion.V4Only)
            self._zc_owned = True
            self._zc = zc

        info = ServiceInfo(
            type_=service_type,
            name=f"{instance}.{service_type}",
            addresses=[ip_bytes],
            port=self.proxy_udp_port,
            properties=props,
            server=host,
        )

        try:
            zc.register_service(info)
        except BadTypeInNameException:
            log.exception(
                "[mDNS] service type %s was rejected; advertisement will not be started",
                service_type,
            )
            return
        self._mdns_infos.append(info)
        log.info(
            "[mDNS] registered %s on %s:%d (HVER=%s)",
            info.name,
            socket.inet_ntoa(ip_bytes),
            self.proxy_udp_port,
            self.mdns_txt.get("HVER", "unknown"),
        )

        self._adv_started = True
        log.info("[mDNS] registration complete; verify via Zeroconf browser if available")

    # ---------------------------------------------------------------------
    # Parsing helpers
    # ---------------------------------------------------------------------
    
    def _notify_hub_state(self, connected: bool) -> None:
        self._hub_connected = connected
        if connected and self._proxy_enabled and not self._adv_started:
            self._start_discovery()
        for cb in self._hub_state_listeners:
            try:
                cb(connected)
            except Exception:
                log.exception("hub state listener failed")

    def _notify_client_state(self, connected: bool) -> None:
        self._client_connected = connected
        for cb in self._client_state_listeners:
            try:
                cb(connected)
            except Exception:
                log.exception("client state listener failed")
        if not connected:
            self._clear_app_device_retry()

    
    def _notify_activity_change(self, new_id: int | None, old_id: int | None) -> None:
        name = None
        if new_id is not None:
            name = self.state.activities.get(new_id & 0xFF, {}).get("name")
        for cb in self._activity_listeners:
            try:
                cb(new_id, old_id, name)
            except Exception:
                log.exception("activity listener failed")

    def _notify_app_activation(self, record: dict[str, Any]) -> None:
        for cb in self._activation_listeners:
            try:
                cb(record)
            except Exception:
                log.exception("app activation listener failed")

    def _on_commands_burst_end(self, key: str) -> None:
        parts = key.split(":")
        if len(parts) >= 2 and parts[0] == "commands":
            try:
                ent_lo = int(parts[1])
            except ValueError:
                self._pending_command_requests.clear(); return

            pending = self._pending_command_requests.get(ent_lo)
            if pending is None:
                return

            targeted_cmd: int | None = None
            if len(parts) >= 3:
                try:
                    targeted_cmd = int(parts[2])
                except ValueError:
                    targeted_cmd = None

            if targeted_cmd is not None:
                pending.discard(targeted_cmd)
            elif 0xFF in pending:
                pending.discard(0xFF)
                self._commands_complete.add(ent_lo)
            else:
                pending.clear()

            if not pending:
                self._pending_command_requests.pop(ent_lo, None)
        else:
            self._pending_command_requests.clear()

    def _on_macros_burst_end(self, key: str) -> None:
        parts = key.split(":")
        if len(parts) >= 2 and parts[0] == "macros":
            try:
                act_lo = int(parts[1])
            except ValueError:
                self._pending_macro_requests.clear()
                return

            self._pending_macro_requests.discard(act_lo)
            self._macros_complete.add(act_lo)
        else:
            self._pending_macro_requests.clear()

    def _on_activity_map_burst_end(self, key: str) -> None:
        parts = key.split(":")
        if len(parts) >= 2 and parts[0] == "activity_map":
            try:
                act_lo = int(parts[1])
            except ValueError:
                self._pending_activity_map_requests.clear()
                return

            self._pending_activity_map_requests.discard(act_lo)
            self._activity_map_complete.add(act_lo)
        else:
            self._pending_activity_map_requests.clear()

    def _on_buttons_burst_end(self, key: str) -> None:
        if ":" in key:
            try:
                ent_lo = int(key.split(":", 1)[1])
                self._pending_button_requests.discard(ent_lo)
                self.state.clear_keymap_remainders(ent_lo)
            except ValueError:
                self._pending_button_requests.clear()
                self.state.clear_keymap_remainders()
        else:
            self._pending_button_requests.clear()
            self.state.clear_keymap_remainders()

    def _handle_idle(self, now: float) -> None:
        self._burst.tick(now, can_issue=self.can_issue_commands, sender=self._send_cmd_frame)
        self._maybe_retry_app_devices(now)

    def _maybe_retry_app_devices(self, now: float) -> None:
        if self._app_devices_deadline is None:
            return

        if now >= self._app_devices_deadline:
            if not self._app_devices_retry_sent:
                #log.info("[CMD] retrying app-sourced REQ_DEVICES after timeout")
                #self._send_cmd_frame(OP_REQ_DEVICES, b"")
                self._app_devices_retry_sent = True
            self._app_devices_deadline = None

    def _send_cmd_frame(self, opcode: int, payload: bytes) -> None:
        frame = self._build_frame(opcode, payload)
        log.info(
            "[SEND] hub %s (0x%04X) %dB",
            OPNAMES.get(opcode, f"OP_{opcode:04X}"),
            opcode,
            len(payload),
        )
        self.transport.send_local(frame)

    def _handle_hub_frame(self, data: bytes, cid: int) -> None:
        if self.diag_dump:
            log.info("[DUMP #%d] H→A %s", cid, _hexdump(data))
        frames = self._df_h2a.feed(data, cid)
        if frames:
            self._handle_hub_frames(frames)
            if self.diag_parse:
                self._log_frames("H→A", frames)

    def _handle_app_frame(self, data: bytes, cid: int) -> None:
        if self.diag_dump:
            log.info("[DUMP #%d] A→H %s", cid, _hexdump(data))
        frames = self._df_a2h.feed(data, cid)
        if frames:
            self._handle_app_frames(frames)
            if self.diag_parse:
                self._log_frames("A→H", frames)

    def _handle_app_frames(self, frames: List[Tuple[int, bytes, bytes, int, int]]) -> None:
        for opcode, _raw, _payload, _scid, _ecid in frames:
            if opcode == OP_REQ_DEVICES:
                self._app_devices_deadline = time.monotonic() + 1.0
                self._app_devices_retry_sent = False

    def _handle_hub_frames(self, frames: List[Tuple[int, bytes, bytes, int, int]]) -> None:
        for opcode, _raw, _payload, _scid, _ecid in frames:
            if opcode == OP_CATALOG_ROW_DEVICE:
                self._clear_app_device_retry()

    def _clear_app_device_retry(self) -> None:
        self._app_devices_deadline = None
        self._app_devices_retry_sent = False

    def _accumulate_keymap(self, act_lo: int, payload: bytes) -> None:
        self.state.accumulate_keymap(act_lo, payload)

    def parse_device_commands(self, payload: bytes, dev_id: int) -> Dict[int, str]:
        return self.state.parse_device_commands(payload, dev_id)

    # ---------------------------------------------------------------------
    # Structured frame logs
    # ---------------------------------------------------------------------
    def _log_frames(self, direction: str, frames: List[Tuple[int, bytes, bytes, int, int]]) -> None:
        for op, raw, payload, scid, ecid in frames:
            name = OPNAMES.get(op, f"OP_{op:04X}")
            hi = opcode_hi(op)
            fam = opcode_family(op)
            note = f"#{scid}→#{ecid}" if scid != ecid else f"#{ecid}"
            log.info("[FRAME %s] %s %s (0x%04X) len=%d", note, direction, name, op, len(raw))

            if op not in OPNAMES:
                log.debug(
                    "[FRAME %s] unknown opcode 0x%04X hi=0x%02X family(lo)=0x%02X",
                    direction,
                    op,
                    hi,
                    fam,
                )

            context = FrameContext(
                proxy=self,
                opcode=op,
                direction=direction,
                payload=payload,
                raw=raw,
                name=name,
            )

            for handler in frame_handler_registry.iter_for(op, direction):
                try:
                    handler.handle(context)
                except Exception:
                    log.debug("[PARSE] error while decoding op 0x%04X via %s", op, handler.__class__.__name__, exc_info=True)

    # ---------------------------------------------------------------------
    # Lifecycle
    # ---------------------------------------------------------------------

    def _start_discovery(self) -> None:
        if not self._proxy_enabled:
            return
        if self._adv_started:
            return
            
        self.proxy_udp_port = self.transport.proxy_udp_port
        self._start_mdns()
        self._adv_started = True

    def _stop_discovery(self) -> None:
        # unregister mDNS
        if self._zc is not None and self._mdns_infos:
            try:
                for info in self._mdns_infos:
                    try:
                        self._zc.unregister_service(info)
                        log.info("[mDNS] unregistered %s", info.name)
                    except Exception:
                        log.exception("[mDNS] failed to unregister service %s", info.name)
            finally:
                if self._zc_owned:
                    self._zc.close()
                    self._zc = None
                self._mdns_infos = []

        self._adv_started = False
    
    def start(self) -> None:
        self.transport.start()
        if self._proxy_enabled and self.transport.is_hub_connected and not self._adv_started:
            self._start_discovery()

    def stop(self) -> None:
        self._stop_discovery()
        self.transport.stop()
        log.info("[STOP] proxy stopped")


from . import opcode_handlers  # noqa: F401  # register frame handlers
