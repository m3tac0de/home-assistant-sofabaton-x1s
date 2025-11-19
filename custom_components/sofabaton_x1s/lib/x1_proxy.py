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

from .frame_handlers import FrameContext, frame_handler_registry

from .protocol_const import (
    BUTTONNAME_BY_CODE,
    ButtonName,
    OPNAMES,
    OP_ACK_READY,
    OP_BANNER,
    OP_CALL_ME,
    OP_CATALOG_ROW_ACTIVITY,
    OP_CATALOG_ROW_DEVICE,
    OP_DEVBTN_EXTRA,
    OP_DEVBTN_HEADER,
    OP_DEVBTN_MORE,
    OP_DEVBTN_PAGE,
    OP_DEVBTN_TAIL,
    OP_FIND_REMOTE,
    OP_INFO_BANNER,
    OP_KEYMAP_CONT,
    OP_KEYMAP_TBL_A,
    OP_KEYMAP_TBL_B,
    OP_KEYMAP_TBL_C,
    OP_LABELS_A1,
    OP_LABELS_A2,
    OP_LABELS_B1,
    OP_LABELS_B2,
    OP_MARKER,
    OP_PING2,
    OP_REQ_ACTIVITIES,
    OP_REQ_ACTIVATE,
    OP_REQ_BUTTONS,
    OP_REQ_COMMANDS,
    OP_REQ_DEVICES,
    OP_REQ_KEYLABELS,
    OP_REQ_VERSION,
    OP_WIFI_FW,
    SYNC0,
    SYNC1,
)

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
        proxy_enabled: bool = True,
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


        self._proxy_enabled = bool(proxy_enabled)  # runtime toggle, separate from advertise_after_hub
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
    
    def set_diag_dump(self, enable: bool) -> None:
        self.diag_dump = bool(enable)
        log.info("[PROXY] hex logging %s", "enabled" if enable else "disabled")

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

    def find_remote(self) -> bool:
        """Trigger the hub's "find my remote" feature."""
        return self.enqueue_cmd(OP_FIND_REMOTE)

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
        frame += bytes([_sum8(frame)])  

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
                if self._proxy_enabled and not self._adv_started:
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

    def _accumulate_keymap_old(self, act_lo: int, payload: bytes) -> None:
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

    def _accumulate_keymap(self, act_lo: int, payload: bytes) -> None:
        if act_lo not in self._entity_buttons:
            self._entity_buttons[act_lo] = set()
        
        i, n = 0, len(payload)
        
        while i + 1 < n:
            # 1. Check for the start of a record with the correct Activity ID
            if payload[i] == act_lo:
                button_code = payload[i + 1]
                
                # 2. Check if the next byte is a known button code (to filter out random data)
                if button_code in BUTTONNAME_BY_CODE:
                    
                    # 3. Check for the Hue-specific payload signature (00 00 00 00) at offset +3
                    # This check requires at least 7 bytes from the start of the record (i+6)
                    # The command data block starts at payload[i+3]
                    if i + 7 < n and payload[i + 3:i + 7] == b'\x00\x00\x00\x00':
                        stride = 16
                    else:
                        stride = 20

                    self._entity_buttons[act_lo].add(button_code)
                    
                    # 4. Move 'i' to the expected start of the next record
                    i += stride
                    continue
            i += 1

    def _bytes_to_hex(self, b: bytes) -> str:
        return b.hex()

    def parse_device_commands(self, raw_hex_data: str, dev_id: int) -> Dict[int, str]:
        """
        Processes a contiguous hex string for a single device to extract command IDs and labels.
        """
        commands_found: Dict[int, str] = {}
        target_dev_id_byte = dev_id & 0xFF
        
        # Combined regex to match BOTH old (IR/BT) and new (Hue/special) patterns:
        # 1. Dev ID (1 byte)
        # 2. Command ID (1 byte) -> Group 1
        # 3. Control Data Group (7 bytes total, 14 hex chars):
        #    - EITHER: (03|0D) + 5 variable bytes + 1 payload byte (Old)
        #    - OR: 1A 00 00 00 00 17 + 1 payload byte (New)
        command_prefix_re = re.compile(
            f'{target_dev_id_byte:02x}'                 # Device ID (1 byte)
            r'([0-9a-fA-F]{2})'                        # Command ID (1 byte) -> Group 1
            r'(?:'                                     # Non-capturing group for command/control data
            r'(?:03|0d)[0-9a-fA-F]{10}[0-9a-fA-F]{2}' # Old IR/BT pattern (7 bytes)
            r'|'
            r'1a0000000017[0-9a-fA-F]{2}'            # New Hue/Special pattern (7 bytes)
            r')'
            , re.IGNORECASE
        )

        # The fixed prefix length is 9 bytes = 18 hex characters (1 Dev ID + 1 Cmd ID + 7 Control/Payload)
        prefix_length = 18 

        # Split the full hex data by 0xFF delimiter.
        chunks = raw_hex_data.split('ff')
        for chunk in chunks:
            if not chunk: continue
            
            # Use search() to find the pattern anywhere in the chunk
            match = command_prefix_re.search(chunk)
            
            if match:
                command_id_hex = match.group(1)
                try:
                    command_id = int(command_id_hex, 16)
                except ValueError:
                    continue
                    
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
        if not self._proxy_enabled:
            return
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
        if self._proxy_enabled and self._hub_sock is not None and not self._adv_started:
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


from . import opcode_handlers  # noqa: F401  # register frame handlers
