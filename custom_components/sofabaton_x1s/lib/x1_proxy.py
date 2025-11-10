# proxy.py — X1 Hub proxy (legible, opcode-forward)
# -------------------------------------------------
from __future__ import annotations

import logging
import random
import select
import socket
import struct
import threading
import time
from typing import Dict, List, Optional, Set, Tuple, Any
from collections import defaultdict
import re

# ============================================================================
# Protocol constants and fallbacks
# ============================================================================
SYNC0, SYNC1 = 0xA5, 0x5A

class ButtonName:  # minimal fallback
    UP=0xAE
    DOWN=0xB2
    LEFT=0xAF
    RIGHT=0xB1
    OK=0xB0
    HOME=0xB4
    BACK=0xB3
    MENU=0xB5
    VOL_UP=0xB6
    VOL_DOWN=0xB9
    MUTE=0xB8
    CH_UP=0xB7
    CH_DOWN=0xBA
    REW=0xBB
    PAUSE=0xBC
    FWD=0xBD
    RED=0xBE
    GREEN=0xBF
    YELLOW=0xC0
    BLUE=0xC1
    POWER_ON=0xC6
    POWER_OFF=0xC7

BUTTONNAME_BY_CODE = {v: k for k, v in ButtonName.__dict__.items() if isinstance(v, int)}

# ----------------------------------------------------------------------------
# Opcodes (named for legibility)
# ----------------------------------------------------------------------------
# A→H requests (from app/client to hub)
OP_REQ_DEVICES    = 0x000A  # yields CATALOG_ROW_DEVICE rows (0xD50B)
OP_REQ_ACTIVITIES = 0x003A  # yields CATALOG_ROW_ACTIVITY rows (0xD53B)
OP_REQ_BUTTONS     = 0x023C  # payload: [act_lo, 0xFF]
OP_REQ_COMMANDS   = 0x025C  # payload: [act_lo, 0xFF]
OP_REQ_ACTIVATE   = 0x023F  # payload: [id_lo, key_code] (id_lo = activity id OR device id)

# H→A responses (from hub to app/client)
OP_ACK_READY      = 0x0160
OP_MARKER         = 0x0C3D  # segment marker before continuation

OP_CATALOG_ROW_DEVICE   = 0xD50B  # Row from list of devices
OP_CATALOG_ROW_ACTIVITY = 0xD53B  # Row from list of activities
OP_DEVBTN_HEADER      = 0xD95D  # H→A: header page
OP_DEVBTN_PAGE        = 0xD55D  # H→A: repeated pages with 2-3 entries each
OP_DEVBTN_TAIL        = 0x495D  # H→A: tail/terminator
OP_DEVBTN_EXTRA       = 0x303D  # H→A: small follow-up page sometimes present
OP_DEVBTN_MORE        = 0x8F5D  # H→A: small follow-up page sometimes present (pff)
OP_KEYMAP_TBL_A   = 0xF13D
OP_KEYMAP_TBL_B   = 0xFA3D
OP_KEYMAP_CONT    = 0x543D  # observed continuation page after MARKER

# UDP CALL_ME (same frame used both directions over UDP)
OP_CALL_ME        = 0x0CC3

# noise we're not using
# OP_REQ_VERSION    = 0x0058  # yields WIFI_FW (0x0359) then INFO_BANNER (0x112F)
# OP_PING2          = 0x0140
# OP_REQ_KEYLABELS  = 0x024D  # payload: [act_lo, 0xFF]
# OP_LABELS_A1 = 0x6E13
# OP_LABELS_B1 = 0x5A13
# OP_LABELS_A2 = 0x8213
# OP_LABELS_B2 = 0x6413
# OP_BANNER         = 0x1D02  # hub ident, name, batch, hub fw (first screen)
# OP_WIFI_FW        = 0x0359  # WiFi firmware ver (Vx.y.z)
# OP_INFO_BANNER    = 0x112F  # vendor tag, batch date, remote fw byte, etc.



OPNAMES: Dict[int, str] = {

    OP_CALL_ME:        "CALL_ME",
    OP_REQ_ACTIVITIES: "REQ_ACTIVITIES",
    OP_REQ_DEVICES:    "REQ_DEVICES",
    OP_REQ_BUTTONS:    "REQ_BUTTONS",
    OP_REQ_COMMANDS:   "REQ_COMMANDS",
    OP_REQ_ACTIVATE:   "REQ_ACTIVATE",

    OP_ACK_READY:      "ACK_READY",
    OP_MARKER:         "MARKER",

    OP_CATALOG_ROW_DEVICE:   "CATALOG_ROW_DEVICE",
    OP_CATALOG_ROW_ACTIVITY: "CATALOG_ROW_ACTIVITY",

    OP_KEYMAP_TBL_A:   "KEYMAP_TABLE_A",
    OP_KEYMAP_TBL_B:   "KEYMAP_TABLE_B",
    OP_KEYMAP_CONT:    "KEYMAP_CONT",

    OP_DEVBTN_HEADER:    "DEVCTL_HEADER",
    OP_DEVBTN_PAGE:      "DEVCTL_PAGE",
    OP_DEVBTN_TAIL:      "DEVCTL_LASTPAGE_TYPE1",
    OP_DEVBTN_EXTRA:     "DEVCTL_LASTPAGE_TYPE2",
    OP_DEVBTN_MORE:      "DEVCTL_LASTPAGE_TYPE3",

    # OP_BANNER:         "BANNER",
    # OP_WIFI_FW:        "WIFI_FW",
    # OP_INFO_BANNER:    "INFO_BANNER",
    # OP_LABELS_A1:      "KEY_LABELS_A1",
    # OP_LABELS_B1:      "KEY_LABELS_B1",
    # OP_LABELS_A2:      "KEY_LABELS_A2",
    # OP_LABELS_B2:      "KEY_LABELS_B2",
    # OP_REQ_KEYLABELS:  "REQ_KEYLABELS",
    # OP_REQ_VERSION:    "REQ_VERSION",
    # OP_PING2:          "PING2",

}

# ============================================================================
# Utilities
# ============================================================================
log = logging.getLogger("x1proxy")

def _sum8(b: bytes) -> int: return sum(b) & 0xFF
def _hexdump(data: bytes) -> str: return data.hex(" ")

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
        proxy_udp_port: int = 9102,
        hub_listen_base: int = 8200,
        mdns_instance: str = "X1-HUB-PROXY",
        mdns_host: Optional[str] = None,
        mdns_txt: Optional[Dict[str, str]] = None,
        advertise_after_hub: bool = True,
        diag_dump: bool = True,
        diag_parse: bool = True,
        ka_idle: int = 30,
        ka_interval: int = 10,
        ka_count: int = 3,
    ) -> None:
        self.real_hub_ip = real_hub_ip
        self.real_hub_udp_port = int(real_hub_udp_port)
        self.proxy_udp_port = int(proxy_udp_port)
        self.hub_listen_base = int(hub_listen_base)
        self.mdns_instance = mdns_instance
        self.mdns_host = mdns_host or (mdns_instance + ".local")
        self.mdns_txt = mdns_txt or {}
        self.advertise_after_hub = advertise_after_hub
        self.diag_dump = bool(diag_dump)
        self.diag_parse = bool(diag_parse)
        self.ka_idle = int(ka_idle)
        self.ka_interval = int(ka_interval)
        self.ka_count = int(ka_count)

        self._stop = threading.Event()

        # sockets/threads
        self._udp_sock: Optional[socket.socket] = None
        self._mdns_thr: Optional[threading.Thread] = None
        self._udp_thr: Optional[threading.Thread] = None
        self._claim_thr: Optional[threading.Thread] = None
        self._bridge_thr: Optional[threading.Thread] = None

        # session state
        self._hub_sock: Optional[socket.socket] = None
        self._app_sock: Optional[socket.socket] = None
        self._hub_lock = threading.Lock()
        self._app_lock = threading.Lock()

        # deframers
        self._df_h2a = Deframer()
        self._df_a2h = Deframer()

        self._hub_listen_port: Optional[int] = None
        self._chunk_id = 0
        self._adv_started = False

        # local command queue → HUB (only when no APP connected)
        self._cmd_lock = threading.Lock()
        self._local_to_hub = bytearray()

        # last activity hint + mapped ButtonNames per activity
        self._entity_buttons: Dict[int, Set[int]] = {}
        self._entity_commands: dict[int, dict[int, str]] = defaultdict(dict)

        # activity/device caches
        self._current_activity: Optional[int] = None
        self._current_activity_hint: Optional[int] = None
        self._activities: Dict[int, Dict[str, Any]] = {}  # act_id -> {"name": str, "active": bool}
        self._devices: Dict[int, Dict[str, Any]] = {}     # dev_id -> {"brand": str, "name": str, "guid": str|None}
        
        self._commands_hexbuf: str = ""      # accumulates header+pages+tail

        self._totalframes: int = 0
        
        self._burst_active = False
        self._burst_kind: str | None = None
        self._burst_last_ts = 0.0
        self._burst_queue: list[tuple[int, bytes, bool, Optional[str]]] = []
        self._burst_idle_s = 0.15
        self._burst_listeners: dict[str, list[callable]] = {}
        self._response_grace_period = 1 # the hub has 1 second to start responding to our requests
        self._activity_listeners: list[callable] = []


        self._proxy_enabled = True  # runtime toggle, separate from advertise_after_hub
        self.on_burst_end("activities", self.handle_active_state)
        
        self._hub_state_listeners: list[callable] = []
        self._client_state_listeners: list[callable] = []
        self._hub_connected: bool = False
        self._client_connected: bool = False
        
        self._zc = None          # type: ignore[assignment]
        self._mdns_info = None   # type: ignore[assignment]

    # ---------------------------------------------------------------------
    # Local command API
    # ---------------------------------------------------------------------
    def handle_active_state(self, trigger: str) -> None:
        if self._current_activity != self._current_activity_hint:
            old = self._current_activity
            self._current_activity = self._current_activity_hint
            if self._current_activity is not None:
                self._notify_activity_change(self._current_activity & 0xFF,
                                             old & 0xFF if old is not None else None)
            else:
                # we went from “something” to “nothing”
                self._notify_activity_change(None, old & 0xFF if old is not None else None)
    
    def enable_proxy(self) -> None:
        self._proxy_enabled = True
        # if we already have the hub and we weren't advertising, start now
        with self._hub_lock:
            has_hub = self._hub_sock is not None
        if has_hub and not self._adv_started:
            self._start_discovery()
        log.info("[PROXY] enabled")

    def disable_proxy(self) -> None:
        self._proxy_enabled = False
        # close UDP so new apps can't discover/connect
        self._stop_discovery()
        log.info("[PROXY] disabled (existing TCP sessions stay alive)")
    
    def can_issue_commands(self) -> bool:
        with self._app_lock:
            return self._app_sock is None

    def _build_frame(self, opcode: int, payload: bytes = b"") -> bytes:
        head = bytes([SYNC0, SYNC1, (opcode >> 8) & 0xFF, opcode & 0xFF])
        frame = head + payload
        return frame + bytes([_sum8(frame)])

    def enqueue_cmd(
        self,
        opcode: int,
        payload: bytes = b"",
        *,
        expects_burst: bool = False,
        burst_kind: str | None = None,
    ) -> bool:
        if not self.can_issue_commands():
            log.info("[CMD] ignoring %s: proxy client is connected", OPNAMES.get(opcode, f"OP_{opcode:04X}"))
            return False

        is_burst = expects_burst  # you can later OR with a BURST_OPS set

        # if we are already in a burst, always defer
        if self._burst_active:
            self._burst_queue.append((opcode, payload, is_burst, burst_kind))
            log.info("[CMD] delaying %s until burst ends", OPNAMES.get(opcode, f"OP_{opcode:04X}"))
            return True

        # not in a burst → send now
        if is_burst:
            self._start_burst(burst_kind or "generic")

        self._queue_local_frame(opcode, payload)
        log.info("[CMD] queued %s (0x%04X) %dB", OPNAMES.get(opcode, f"OP_{opcode:04X}"), opcode, len(payload))
        return True

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

    def on_burst_end(self, key: str, cb):
        # key can be:
        #  "buttons"         -> all buttons updates
        #  "buttons:101"     -> just entity 101
        #  "commands"       -> all commands updates
        #  "commands:101"   -> just entity 101
        self._burst_listeners.setdefault(key, []).append(cb)

    # High-level helpers
    def request_devices(self) -> bool:    return self.enqueue_cmd(OP_REQ_DEVICES, expects_burst=True, burst_kind="devices")
    def request_activities(self) -> bool: return self.enqueue_cmd(OP_REQ_ACTIVITIES, expects_burst=True, burst_kind="activities")

    def request_buttons_for_entity(self, ent_id: int) -> bool:
        if not self.can_issue_commands():
            log.info("[CMD] request_buttons_for_entity ignored: proxy client is connected"); return False
        ent_lo = ent_id & 0xFF
        return self.enqueue_cmd(OP_REQ_BUTTONS, bytes([ent_lo, 0xFF]), expects_burst=True, burst_kind=f"buttons:{ent_lo}")

    def request_commands_for_entity(self, ent_id: int) -> bool:
        if not self.can_issue_commands():
            log.info("[CMD] request_commands_for_entity ignored: proxy client is connected"); return False
        ent_lo = ent_id & 0xFF
        self.enqueue_cmd(OP_REQ_COMMANDS, bytes([ent_lo, 0xFF]), expects_burst=True, burst_kind=f"commands:{ent_lo}")
        return True
        
    def get_activities(self) -> tuple[dict[int, dict], bool]:
        if self._activities:
            return ({k: v.copy() for k, v in self._activities.items()}, True)
            
        if self.can_issue_commands():
            self.enqueue_cmd(OP_REQ_ACTIVITIES, expects_burst=True, burst_kind="activities")
        return ({}, False)

    def get_devices(self) -> tuple[dict[int, dict], bool]:
        if self._devices:
            return ({k: v.copy() for k, v in self._devices.items()}, True)

        if self.can_issue_commands():
            self.enqueue_cmd(OP_REQ_DEVICES, expects_burst=True, burst_kind="devices")
        return ({}, False)

    def get_buttons_for_entity(self, ent_id: int, *, fetch_if_missing: bool = True) -> tuple[list[int], bool]:
        ent_lo = ent_id & 0xFF
        if ent_lo in self._entity_buttons:
            return (sorted(self._entity_buttons[ent_lo]), True)

        if fetch_if_missing and self.can_issue_commands():
            self.enqueue_cmd(
                OP_REQ_BUTTONS,
                bytes([ent_lo, 0xFF]),
                expects_burst=True,
                burst_kind=f"buttons:{ent_lo}",
            )

        return ([], False)

    def get_commands_for_entity(self, ent_id: int, *, fetch_if_missing: bool = True) -> tuple[dict[int, str], bool]:
        ent_lo = ent_id & 0xFF
        if ent_lo in self._entity_commands:
            return (dict(self._entity_commands[ent_lo]), True)

        if fetch_if_missing and self.can_issue_commands():
            self.enqueue_cmd(
                OP_REQ_COMMANDS,
                bytes([ent_lo, 0xFF]),
                expects_burst=True,
                burst_kind=f"commands:{ent_lo}",
            )

        return ({}, False)
    
    def get_proxy_status(self) -> bool:
        return self._proxy_enabled
    
    def send_command(self, ent_id: int, key_code: int) -> bool:
        if not self.can_issue_commands():
            log.info("[CMD] send_command ignored: proxy client is connected"); return False      

        if key_code == ButtonName.POWER_ON:
            self._current_activity_hint = ent_id
            
        id_lo = ent_id & 0xFF
        return self.enqueue_cmd(OP_REQ_ACTIVATE, bytes([id_lo, key_code]))


    # ---------------------------------------------------------------------
    # mDNS advertisement
    # ---------------------------------------------------------------------
    def _start_mdns(self) -> None:
        from zeroconf import Zeroconf, ServiceInfo, IPVersion

        ip_bytes = socket.inet_aton(_route_local_ip(self.real_hub_ip))
        service_type = "_x1hub._udp.local."
        instance = self.mdns_instance
        host = (self.mdns_host or instance) + "."

        props = {k: v.encode("utf-8") for k, v in self.mdns_txt.items()}

        info = ServiceInfo(
            type_=service_type,
            name=f"{instance}.{service_type}",
            addresses=[ip_bytes],
            port=self.proxy_udp_port,
            properties=props,
            server=host,
        )

        zc = Zeroconf(ip_version=IPVersion.V4Only)
        zc.register_service(info)

        self._zc = zc
        self._mdns_info = info
        self._adv_started = True
        log.info("[mDNS] registered %s on %s:%d", info.name, socket.inet_ntoa(ip_bytes), self.proxy_udp_port)


    # ---------------------------------------------------------------------
    # UDP listener
    # ---------------------------------------------------------------------
    
    def _open_udp_listener(self) -> socket.socket:
        """
        Bind a UDP socket. If the configured proxy_udp_port is busy,
        try a few higher ports. Update self.proxy_udp_port to the one
        we actually got so mDNS can advertise the right thing.
        """
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)

        base = self.proxy_udp_port
        tried = 0
        last_err = None

        # if user set 0, let OS pick
        if base == 0:
            s.bind(("0.0.0.0", 0))
            self.proxy_udp_port = s.getsockname()[1]
            log.info("[UDP] bound on *:%d (os-picked)", self.proxy_udp_port)
            return s

        # otherwise try base..base+31
        for port in range(base, base + 32):
            try:
                s.bind(("0.0.0.0", port))
                self.proxy_udp_port = port
                log.info("[UDP] bound on *:%d", port)
                return s
            except OSError as e:
                last_err = e
                tried += 1

        s.close()
        raise OSError(f"could not bind UDP near {base}: {last_err}")

    
    def _udp_loop(self) -> None:
        s = self._udp_sock
        if s is None:
            # fallback: shouldn't happen if _start_discovery was used
            s = self._open_udp_listener()
            self._udp_sock = s
            
        log.info("[UDP] listening for APP CALL_ME on *:%d", self.proxy_udp_port)

        while not self._stop.is_set():
            try:
                pkt, (src_ip, src_port) = s.recvfrom(2048)
            except OSError:
                break
            if len(pkt) < 16 or pkt[0] != SYNC0 or pkt[1] != SYNC1:
                continue
            op = (pkt[2] << 8) | pkt[3]
            if op != OP_CALL_ME:
                continue
            try:
                app_ip = socket.inet_ntoa(pkt[10:14])
                app_port = struct.unpack(">H", pkt[14:16])[0]
            except Exception:
                continue
            if not self._proxy_enabled:
                continue
            log.info("[UDP] APP CALL_ME from %s:%d -> app tcp %s:%d", src_ip, src_port, app_ip, app_port)
            threading.Thread(target=self._handle_app_session, args=((app_ip, app_port),),
                             name="x1proxy-app-connect", daemon=True).start()

    # ---------------------------------------------------------------------
    # Claim HUB
    # ---------------------------------------------------------------------
    def _claim_once(self) -> bool:
        self._hub_listen_port = _pick_port_near(self.hub_listen_base)
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        srv.bind(("0.0.0.0", self._hub_listen_port))
        srv.listen(1)
        srv.settimeout(1.0)
        log.info("[TCP] waiting <- HUB on *:%d (claim)", self._hub_listen_port)

        udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        my_ip = _route_local_ip(self.real_hub_ip)
        payload = b"\x00"*6 + socket.inet_aton(my_ip) + struct.pack(">H", self._hub_listen_port)
        frame = bytes([SYNC0, SYNC1, (OP_CALL_ME >> 8) & 0xFF, OP_CALL_ME & 0xFF]) + payload
        frame += bytes([_sum8(frame)])  # checksum via shared helper

        last = 0.0
        hub_sock = None
        try:
            while hub_sock is None and not self._stop.is_set():
                now = time.time()
                if now - last >= 2.0 + random.uniform(-0.25, 0.25):
                    udp.sendto(frame, (self.real_hub_ip, self.real_hub_udp_port))
                    last = now
                try:
                    hub_sock, hub_addr = srv.accept()
                except socket.timeout:
                    continue

            if hub_sock is None:
                return False

            hub_sock.settimeout(0.0)
            _enable_keepalive(hub_sock, idle=self.ka_idle, interval=self.ka_interval, count=self.ka_count)
            with self._hub_lock:
                self._hub_sock = hub_sock
                self._notify_hub_state(True)
            log.info("[TCP] connected <- HUB %s:%d (claimed)", *hub_addr)
            return True
        finally:
            try: srv.close()
            except Exception: pass
            try: udp.close()
            except Exception: pass

    def _hub_guard_loop(self) -> None:
        while not self._stop.is_set():
            with self._hub_lock: hub = self._hub_sock
            if hub is None:
                ok = self._claim_once()
                if not ok:
                    time.sleep(0.2); continue
                if self.advertise_after_hub and not self._adv_started:
                    self._start_discovery()
            else:
                time.sleep(0.3)

    def _handle_app_session(self, app_addr: Tuple[str, int]) -> None:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5.0); s.connect(app_addr); s.settimeout(0.0)
        _enable_keepalive(s, idle=self.ka_idle, interval=self.ka_interval, count=self.ka_count)
        with self._app_lock:
            if self._app_sock is not None:
                try: self._app_sock.shutdown(socket.SHUT_RDWR)
                except Exception: pass
                try: self._app_sock.close()
                except Exception: pass
            self._app_sock = s
        log.info("[TCP] connected -> APP %s:%d", *app_addr)
        self._notify_client_state(True)

    # ---------------------------------------------------------------------
    # Parsing helpers 
    # ---------------------------------------------------------------------
    
    def _notify_hub_state(self, connected: bool) -> None:
        self._hub_connected = connected
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

    
    def _notify_activity_change(self, new_id: int | None, old_id: int | None) -> None:
        name = None
        if new_id is not None:
            name = self._activities.get(new_id & 0xFF, {}).get("name")
        for cb in self._activity_listeners:
            try:
                cb(new_id, old_id, name)
            except Exception:
                log.exception("activity listener failed")
    
    def _notify_burst_end(self, key: str):
        # 1) exact listeners, e.g. "buttons:101"
        for cb in self._burst_listeners.get(key, []):
            cb(key)

        # 2) prefix listeners, e.g. "buttons"
        if ":" in key:
            prefix = key.split(":", 1)[0]
            for cb in self._burst_listeners.get(prefix, []):
                cb(key)

    def _start_burst(self, kind: str = "generic") -> None:
        self._burst_active = True
        self._burst_kind = kind
        self._burst_last_ts = time.monotonic() + self._response_grace_period
        
    def _queue_local_frame(self, opcode: int, payload: bytes) -> None:
        frame = self._build_frame(opcode, payload)
        with self._cmd_lock:
            self._local_to_hub.extend(frame)

    def _drain_post_burst(self) -> None:
        finished_kind = self._burst_kind or "generic"
        self._burst_active = False
        self._burst_kind = None
        
        # notify listeners before sending queued stuff
        self._notify_burst_end(finished_kind)

        while self._burst_queue:
            op, payload, is_burst, next_kind = self._burst_queue.pop(0)
            if not self.can_issue_commands():
                log.info("[CMD] dropped post-burst %s: proxy client is connected",
                         OPNAMES.get(op, f"OP_{op:04X}"))
                continue

            if is_burst:
                self._start_burst(next_kind or "generic")

            self._queue_local_frame(op, payload)
            log.info("[CMD] sent post-burst %s", OPNAMES.get(op, f"OP_{op:04X}"))

            # if we just started another burst, stop draining; the next round will continue
            if self._burst_active:
                break

    def _accumulate_keymap(self, act_lo: int, payload: bytes) -> None:
        if act_lo not in self._entity_buttons:
            self._entity_buttons[act_lo] = set()
        i, n = 0, len(payload)
        while i + 1 < n:
            if payload[i] == act_lo:
                k = payload[i + 1]
                if k in BUTTONNAME_BY_CODE:
                    self._entity_buttons[act_lo].add(k)
                    i += 8  # stride observed in dumps
                    continue
            i += 1


    def _bytes_to_hex(self, b: bytes) -> str:
        return b.hex()

    def parse_device_commands(self, raw_hex_data: str, dev_id: int) -> Dict[int, str]:
        """
        Processes a contiguous hex string for a single device to extract command IDs and labels.
        """
        #print(raw_hex_data)
        commands_found: Dict[int, str] = {}
        target_dev_id_byte = dev_id & 0xFF
        
        # CRITICAL FIX: Relaxing the Control Data pattern to allow any 5 bytes after the type (03|0D)
        # The regex matches the 9-byte prefix:
        # [Dev ID(1)] [Cmd ID(1)] [03|0D(1)] [Control Data(5 variable bytes)] [Payload(1)]
        command_prefix_re = re.compile(
            f'{target_dev_id_byte:02x}'                 # Device ID (1 byte)
            r'([0-9a-fA-F]{2})'                        # Command ID (1 byte) -> Group 1
            r'(03|0d)'                                 # Control Type (1 byte)
            r'[0-9a-fA-F]{10}'                         # Control Data (5 variable bytes: 10 hex chars)
            r'([0-9a-fA-F]{2})'                        # Control Data payload (1 byte) -> Group 2
            , re.IGNORECASE
        )

        # Split the full hex data by 0xFF delimiter.
        chunks = raw_hex_data.split('ff')
        for chunk in chunks:
            if not chunk: continue
            match = command_prefix_re.search(chunk)
            
            if match:
                command_id_hex = match.group(1)
                try:
                    command_id = int(command_id_hex, 16)
                except ValueError:
                    continue
                    
                # The fixed prefix length is 9 bytes = 18 hex characters
                prefix_length = 18 
                
                # Label data starts right after the fixed prefix.
                label_data_start = match.start() + prefix_length
                label_hex = chunk[label_data_start:]
                
                # Remove the 4 bytes (8 hex chars) of control data remnants that prefix the UTF-16BE label.
                label_hex = re.sub(r'^(00){4}', '', label_hex)

                # Remove trailing null bytes for padding
                cleaned_label_hex = re.sub(r'(00)+$', '', label_hex)

                # Handle odd length (truncated UTF-16BE) by completing the last byte pair with '0'
                initial_cleaned_length = len(cleaned_label_hex)
                if initial_cleaned_length % 2 != 0:
                    # Add '0' to the end to complete the final byte (e.g., '4' -> '40')
                    cleaned_label_hex += '0'

                try:
                    label_bytes = bytes.fromhex(cleaned_label_hex)
                    label = label_bytes.decode('utf-16be').strip('\x00')
                    
                    if (command_id, label) not in commands_found and label:
                        commands_found[command_id] = label
                        
                except (ValueError, UnicodeDecodeError):
                    continue

        return commands_found

    # ---------------------------------------------------------------------
    # Structured frame logs
    # ---------------------------------------------------------------------
    def _log_frames(self, direction: str, frames: List[Tuple[int, bytes, bytes, int, int]]) -> None:
        for op, raw, payload, scid, ecid in frames:
            name = OPNAMES.get(op, f"OP_{op:04X}")
            note = f"#{scid}→#{ecid}" if scid != ecid else f"#{ecid}"
            log.info("[FRAME %s] %s %s (0x%04X) len=%d", note, direction, name, op, len(raw))

            try:
                if op == OP_REQ_ACTIVATE and len(payload) == 2:
                    ent_id, code = payload

                    if ent_id in self._activities:
                        kind = "act"
                        name = self._activities[ent_id].get("name", "")
                        print("about to do it")
                        if code == ButtonName.POWER_ON:
                            self._current_activity_hint = ent_id
                            print("did it")
                    elif ent_id in self._devices:
                        kind = "dev"
                        name = self._devices[ent_id].get("name", "")
                    else:
                        kind = "id"
                        name = ""

                    cmd = self._entity_commands.get(ent_id, {}).get(code)
                    btn = BUTTONNAME_BY_CODE.get(code) if cmd is None else None
                    extra = f" cmd='{cmd}'" if cmd else (f" btn='{btn}'" if btn else "")

                    log.info("[KEY] %s %s=0x%02X (%d) name='%s' key=0x%02X%s",
                             direction, kind, ent_id, ent_id, name, code, extra)

                elif op == OP_ACK_READY:
                    log.info("[HINT] ACK_READY from hub")
                    if direction == "H→A" and self.can_issue_commands():
                        log.info("[HINT] no proxy client; auto-REQ_ACTIVITIES")
                        self.enqueue_cmd(OP_REQ_ACTIVITIES, expects_burst=True, burst_kind="activities")
                        if self._current_activity_hint is not None:
                            ent_lo = self._current_activity_hint & 0xFF
                            self.enqueue_cmd(OP_REQ_BUTTONS,  bytes([ent_lo, 0xFF]), expects_burst=True, burst_kind=f"buttons:{ent_lo}")
                            self.enqueue_cmd(OP_REQ_COMMANDS, bytes([ent_lo, 0xFF]), expects_burst=True, burst_kind=f"commands:{ent_lo}")
                    elif not self.can_issue_commands():
                        log.info("[HINT] proxy client connected; skipping auto-requests")
                        if self._current_activity_hint is not self._current_activity:
                            log.info("[HINT] current activity differs from hint; notifying listeners")
                            self._notify_activity_change(self._current_activity_hint & 0xFF,
                                                         self._current_activity & 0xFF if self._current_activity is not None else None)

                elif op == OP_CATALOG_ROW_DEVICE:
                    self._burst_active = True
                    if self._burst_kind is None:
                        self._burst_kind = "devices"
                    self._burst_last_ts = time.monotonic()
                    
                    row_idx = payload[0] if len(payload) >= 1 else None
                    dev_id  = int.from_bytes(payload[6:8], "big") if len(payload) >= 8 else None
                    name_bytes_raw = raw[36 : 36 + 36]

                    device_label = name_bytes_raw.decode('utf-16be').strip('\x00')                   

                    brand_bytes_raw = raw[96 : 96 + 36]
                    brand_label = brand_bytes_raw.decode('utf-16be', errors='ignore').strip('\x00')

                    if dev_id is not None:
                        self._devices[dev_id & 0xFF] = {"brand": brand_label, "name": device_label}
                        log.info("[DEV] #%s id=0x%04X (%d) brand='%s' name='%s'",
                                 row_idx, dev_id, dev_id, brand_label, device_label)
                    else:
                        log.info("[DEV] #%s brand='%s' name='%s'", row_idx, brand_label, device_label)

                elif op == OP_CATALOG_ROW_ACTIVITY:
                    self._burst_active = True
                    if self._burst_kind is None:
                        self._burst_kind = "activities"
                    self._burst_last_ts = time.monotonic()                
                    row_idx = payload[0] if len(payload) >= 1 else None

                    # Start of a fresh activities list → reset 'active'
                    if row_idx == 1 and self._current_activity_hint is not None:
                        log.info("[ACT] reset active (start of new activities list)")
                        self._current_activity_hint = None

                    act_id = int.from_bytes(payload[6:8], "big") if len(payload) >= 8 else None
                    
                    label_bytes_raw = raw[36:128]
                    activity_label = label_bytes_raw.decode('utf-16be').strip('\x00')

                    active_state_byte = raw[35]
                    is_active = True if active_state_byte == 0x01 else False


                    if act_id is not None:
                        self._activities[act_id & 0xFF] = {"name": activity_label, "active": is_active}
                        if is_active:
                            self._current_activity_hint = act_id

                    state = "ACTIVE" if is_active else "idle"
                    if row_idx is not None and act_id is not None:
                        log.info("[ACT] #%d name='%s' act_id=0x%04X (%d) state=%s",
                                 row_idx, activity_label, act_id, act_id, state)
                    elif act_id is not None:
                        log.info("[ACT] name='%s' act_id=0x%04X (%d) state=%s", activity_label, act_id, act_id, state)
                    else:
                        log.info("[ACT] name='%s' state=%s", activity_label, state)

                elif op in (OP_KEYMAP_TBL_A, OP_KEYMAP_TBL_B, OP_KEYMAP_CONT):

                    if (op == OP_KEYMAP_CONT):
                        activity_id_decimal = raw[16]
                    else:
                        activity_id_decimal = raw[11]

                    self._burst_active = True
                    if self._burst_kind is None:
                        self._burst_kind = f"buttons:{activity_id_decimal}"
                    self._burst_last_ts = time.monotonic()  
                    
                    self._accumulate_keymap(activity_id_decimal, payload)
                    keys = [f"{BUTTONNAME_BY_CODE.get(c, f'0x{c:02X}')}(0x{c:02X})"
                            for c in sorted(self._entity_buttons.get(activity_id_decimal, set()))]
                    log.info("[KEYMAP] act=0x%02X mapped{%d}: %s",
                             activity_id_decimal, len(keys), ", ".join(keys))
                          
                elif op == OP_REQ_COMMANDS and direction == "A→H":
                    dev_id = payload[0] if payload else 0
                    log.info("[DEVCTL] A→H requesting commands dev=0x%02X (%d)", dev_id, dev_id)

                elif op == OP_DEVBTN_HEADER and direction == "H→A":
                   
                    self._totalframes = int.from_bytes(payload[4:6], byteorder='big')
                    current_frame = int(payload[2])
                    dev_id = payload[3]

                    self._burst_active = True
                    if self._burst_kind is None:
                        self._burst_kind = f"commands:{dev_id}"
                    self._burst_last_ts = time.monotonic()  

                    try:
                        self._commands_hexbuf = ""  # start fresh for the upcoming burst
                        self._commands_hexbuf += self._bytes_to_hex(raw)
                    except Exception as e:
                        log.debug(f"{e}")
                        
                    try:
                        if self._totalframes == current_frame and self._commands_hexbuf is not None:
                            self._entity_commands[dev_id & 0xFF] = self.parse_device_commands(self._commands_hexbuf, dev_id)
                    except Exception as e:
                        log.debug(f"{e}")
     
                elif (op == OP_DEVBTN_PAGE or op == OP_DEVBTN_MORE or op == OP_DEVBTN_TAIL) and direction == "H→A":
                   
                    current_frame = int(payload[2])
                    dev_id = payload[3]

                    self._burst_active = True
                    if self._burst_kind is None:
                        self._burst_kind = f"commands:{dev_id}"
                    self._burst_last_ts = time.monotonic()  

                    if payload:
                        try:
                            self._commands_hexbuf += self._bytes_to_hex(raw)
                        except Exception as e:
                            log.debug(f"{e}")
                    try:
                        if self._totalframes == current_frame and self._commands_hexbuf is not None:
                            self._entity_commands[dev_id & 0xFF] = self.parse_device_commands(self._commands_hexbuf, dev_id)
                            log.info(" ".join(
                                f"{cmd_id:2d} : {label}" 
                                for cmd_id, label in self._entity_commands[dev_id].items()
                            ))
                    except Exception as e:
                        log.debug(f"{e}")
                            
            except Exception:
                log.debug("[PARSE] error while decoding op 0x%04X", op, exc_info=True)

    # ---------------------------------------------------------------------
    # Continuous bridge
    # ---------------------------------------------------------------------
    def _bridge_forever(self) -> None:
        app_to_hub = bytearray()

        while not self._stop.is_set():
            with self._hub_lock: hub = self._hub_sock
            with self._app_lock: app = self._app_sock

            rlist: List[socket.socket] = []
            if hub is not None: rlist.append(hub)
            if app is not None: rlist.append(app)

            wlist: List[socket.socket] = []
            if hub is not None and (app_to_hub or self._local_to_hub):
                wlist.append(hub)

            if not rlist and not wlist:
                time.sleep(0.05); continue

            try:
                r, w, _ = select.select(rlist, wlist, [], 0.5)
            except (OSError, ValueError):
                time.sleep(0.05); continue

            # HUB → reads
            if hub is not None and hub in r:
                try: data = hub.recv(65536)
                except (BlockingIOError, OSError): data = b""
                if not data:
                    with self._hub_lock:
                        try: hub.shutdown(socket.SHUT_RDWR)
                        except Exception: pass
                        try: hub.close()
                        except Exception: pass
                        self._hub_sock = None
                        self._notify_hub_state(False)
                    app_to_hub.clear()
                else:
                    self._chunk_id += 1; hcid = self._chunk_id
                    if self.diag_dump:  log.info("[DUMP #%d] H→A %s", hcid, _hexdump(data))
                    if self.diag_parse:
                        frames = self._df_h2a.feed(data, hcid)
                        if frames: self._log_frames("H→A", frames)
                    if app is not None:
                        try: app.sendall(data)
                        except Exception: pass

            # APP → reads
            if app is not None and app in r:
                try: data = app.recv(65536)
                except (BlockingIOError, OSError): data = b""
                if not data:
                    with self._app_lock:
                        try: app.shutdown(socket.SHUT_RDWR)
                        except Exception: pass
                        try: app.close()
                        except Exception: pass
                        self._app_sock = None
                    app_to_hub.clear()
                    log.info("[TCP] App disconnected")
                    self._notify_client_state(False)
                else:
                    self._chunk_id += 1; acid = self._chunk_id
                    if self.diag_dump:  log.info("[DUMP #%d] A→H %s", acid, _hexdump(data))
                    if self.diag_parse:
                        frames = self._df_a2h.feed(data, acid)
                        if frames: self._log_frames("A→H", frames)
                    app_to_hub.extend(data)

            # HUB writes (local commands first, then proxied data)
            if hub is not None and hub in w:
                if self._local_to_hub:
                    try:
                        with self._cmd_lock:
                            sent = hub.send(self._local_to_hub)
                            if sent: del self._local_to_hub[:sent]
                    except (BlockingIOError, InterruptedError, OSError):
                        pass
                if app_to_hub:
                    try:
                        sent = hub.send(app_to_hub)
                        if sent: del app_to_hub[:sent]
                    except (BlockingIOError, InterruptedError, OSError):
                        pass
                        
            if self._burst_active:
                now = time.monotonic()
                if now - self._burst_last_ts >= self._burst_idle_s:
                    self._drain_post_burst()


    # ---------------------------------------------------------------------
    # Lifecycle
    # ---------------------------------------------------------------------

    def _start_discovery(self) -> None:
        if self._adv_started:
            return
            
        if self._udp_sock is None:
            self._udp_sock = self._open_udp_listener()
            
        self._start_mdns()
        t = threading.Thread(target=self._udp_loop, name="x1proxy-udp", daemon=True)
        t.start()
        self._udp_thr = t
        self._adv_started = True

    def _stop_discovery(self) -> None:
        # stop UDP “call_me” listener first
        if self._udp_sock is not None:
            try:
                self._udp_sock.close()
            except Exception:
                pass
            self._udp_sock = None

        # then unregister mDNS
        if self._zc is not None and self._mdns_info is not None:
            try:
                self._zc.unregister_service(self._mdns_info)
                log.info("[mDNS] unregistered %s", self._mdns_info.name)
            except Exception:
                log.exception("[mDNS] failed to unregister service")
            finally:
                self._zc.close()
                self._zc = None
                self._mdns_info = None

        self._adv_started = False
    
    def start(self) -> None:
        self._stop.clear()
        t1 = threading.Thread(target=self._hub_guard_loop, name="x1proxy-hub-guard", daemon=True)
        t1.start(); self._claim_thr = t1
        t2 = threading.Thread(target=self._bridge_forever, name="x1proxy-bridge", daemon=True)
        t2.start(); self._bridge_thr = t2
        if not self.advertise_after_hub and not self._adv_started:
            self._start_discovery()

    def stop(self) -> None:
        self._stop.set()
        self._stop_discovery()
        with self._hub_lock:
            if self._hub_sock:
                try: self._hub_sock.shutdown(socket.SHUT_RDWR)
                except Exception: pass
                try: self._hub_sock.close()
                except Exception: pass
                self._hub_sock = None
                self._notify_hub_state(False)
        with self._app_lock:
            if self._app_sock:
                try: self._app_sock.shutdown(socket.SHUT_RDWR)
                except Exception: pass
                try: self._app_sock.close()
                except Exception: pass
                self._app_sock = None
        log.info("[STOP] proxy stopped")
