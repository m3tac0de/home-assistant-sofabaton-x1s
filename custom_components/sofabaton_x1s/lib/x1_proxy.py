# proxy.py — X1 Hub proxy (legible, opcode-forward)
# -------------------------------------------------
# Wire-access invariant: the hub services one request at a time and
# silently drops any A->H frame that arrives while it is streaming a
# response burst. ALL A->H traffic therefore flows through exactly one
# of two paths:
#   * enqueue_cmd -> BurstScheduler (fire-and-forget catalog reads), or
#   * an exchange() scope (blocking request/response helpers; see
#     proxy_exchange.py).
# tests/lib/test_sequencer_boundary.py enforces this at CI time.
from __future__ import annotations

import contextlib
import logging
import ipaddress
import re
import socket
import struct
import threading
import time
from collections import defaultdict, deque
from dataclasses import replace
from typing import Any, Callable, Dict, List, Optional, Tuple

from .hub_versions import (
    HUB_VERSION_X1,
    HUB_VERSION_X1S,
    HUB_VERSION_X2,
    PROXY_TXT_KEY,
    PROXY_TXT_VALUE,
    classify_hub_version,
    mdns_service_type_for_props,
)
from .hub_logging import LogTag, get_hub_logger
from .ack import AckOutcome, InputsBurstResult, SendStepResult
from .commands import (
    DeviceButtonAssembler,
    DeviceCommandAssembler,
    descriptive_play_blob_text,
    extract_ir_dump_blob,
    extract_ir_dump_label_field,
    looks_like_descriptive_play_blob,
    parse_ir_command_dump_frame,
)
from .device_create import (
    ACK_OPCODE_STATUS,
    ACK_STATUS_BYTE_OK,
    FAMILY_ACTIVITY_CREATE,
    FAMILY_INPUTS,
    CreateStep,
    build_button_binding_step,
    build_command_write_steps,
    build_device_create_step,
    build_device_update_step,
    build_macro_step,
    build_macro_step_record,
    build_remote_sync_step,
    run_create_sequence,
    synthesize_command_code,
)
from .devices import device_config_from_backup
from .inputs import (
    ControlKeyBlock,
    FavoriteSlot,
    InputEntry,
    InputsRecord,
    build_inputs_write,
    parse_inputs_burst,
)
from .wire_schema import InputEntryLayout, schema_for
from .macros import (
    MACRO_WRITE_PAGE_BODY_CHUNK,
    MacroAssembler,
    MacroKeyEntry,
    MacroRecord,
    build_macro_save_payload,
)

from .protocol_const import (
    BUTTONNAME_BY_CODE,
    ButtonName,
    DEVICE_CLASS_BLUETOOTH,
    DEVICE_CLASS_IR,
    DEVICE_CLASS_RF_315,
    DEVICE_CLASS_RF_433,
    DEVICE_CLASS_WIFI_HUE,
    DEVICE_CLASS_WIFI_IP,
    DEVICE_CLASS_WIFI_MQTT,
    DEVICE_CLASS_WIFI_ROKU,
    DEVICE_CLASS_WIFI_SONOS,
    known_public_device_classes,
    OPNAMES,
    normalize_device_class,
    opcode_family,
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
    OP_SET_HUB_NAME,
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
    OP_SET_IDLE_BEHAVIOR,
    OP_REQ_ACTIVITIES,
    OP_REQ_ACTIVATE,
    OP_REQ_IDLE_BEHAVIOR,
    OP_REQ_ACTIVITY_MAP,
    OP_REQ_BANNER,
    OP_DELETE_DEVICE,
    OP_STATUS_ACK,
    OP_ACTIVITY_ASSIGN_FINALIZE,
    OP_ACTIVITY_CONFIRM,
    OP_REQ_BUTTONS,
    OP_REQ_BLOB,
    OP_REQ_COMMANDS,
    OP_REQ_IPCMD_SYNC,
    OP_REQ_DEVICES,
    OP_REQ_MACRO_LABELS,
    OP_IDLE_BEHAVIOR,
    OP_ACTIVITY_DEVICE_CONFIRM,
    OP_REQ_ACTIVITY_INPUTS,
    OP_REQ_VERSION,
    OP_WIFI_FW,
    FAMILY_FAV_DELETE,
    FAMILY_FAV_ORDER_REQ,
    FAMILY_HUB_NAME_REPLY,
    SYNC0,
    SYNC1,
)
from .state_helpers import (
    ActivityCache,
    BurstScheduler,
    normalize_device_entry,
)
from .deframer import Deframer
from .transport_bridge import TransportBridge
from .proxy_restore import RestoreMixin
from .proxy_wifi_device import WifiDeviceMixin
from .proxy_backup import CacheBackupMixin
from .proxy_backup_export import BackupExportMixin
from .proxy_activity_ops import ActivityOpsMixin
from .proxy_activity_sync import ActivitySyncMixin
from .proxy_ack_waiters import AckWaitersMixin
from .proxy_catalog import CatalogMixin
from .proxy_exchange import ExchangeMixin
from .proxy_frame_decode import FrameDecodeMixin, _hexdump
from .proxy_ir_blob import IrBlobMixin

# ============================================================================
# Utilities
# ============================================================================
log = logging.getLogger("x1proxy")

ACTIVITY_INCOMPLETE_RETRY_DELAY_S = 0.75
_HUB_MODEL_BY_CODE = {
    0x01: HUB_VERSION_X1,
    0x02: HUB_VERSION_X1S,
    0x03: HUB_VERSION_X2,
}


def _normalize_banner_model(value: Any) -> str | None:
    text = str(value or "").strip().upper()
    if text in _HUB_MODEL_BY_CODE.values():
        return text
    return None


def _looks_like_production_date(batch: bytes) -> bool:
    """Return ``True`` when ``batch`` is a BCD-packed CCYYMMDD date.

    The four production-batch bytes in a banner encode the hub's manufacturing
    date (e.g. ``20 22 11 20`` -> ``2022-11-20``). That shape is intrinsic to a
    banner and absent from the other H->A frames that share this family's low
    opcode byte, so it is a stable structural fingerprint -- unlike the
    device-dependent flag bytes, it never varies into a value that is also a
    plausible date. Each byte must be valid BCD, the century in 19-21, the month
    in 01-12 and the day in 01-31.
    """

    if len(batch) != 4:
        return False

    def _bcd(value: int) -> int | None:
        hi, lo = value >> 4, value & 0x0F
        if hi > 9 or lo > 9:
            return None
        return hi * 10 + lo

    century, year, month, day = (_bcd(b) for b in batch)
    if century is None or year is None or month is None or day is None:
        return False
    return 19 <= century <= 21 and 1 <= month <= 12 and 1 <= day <= 31


def _sanitize_mdns_label_component(value: str) -> str:
    text = re.sub(r"[^A-Za-z0-9-]+", "-", str(value or "").strip())
    text = re.sub(r"-{2,}", "-", text).strip("-")
    return text or "X1"


def _mac_suffix_for_instance(mdns_txt: Dict[str, str]) -> str:
    raw_mac = str(mdns_txt.get("MAC") or mdns_txt.get("mac") or "").strip()
    compact = re.sub(r"[^0-9A-Fa-f]", "", raw_mac).lower()
    if len(compact) >= 6:
        return compact[-6:]
    return "000000"


def _mdns_instance_for_identity(model: str | None, mdns_txt: Dict[str, str]) -> str:
    display_model = _sanitize_mdns_label_component(_normalize_banner_model(model) or HUB_VERSION_X1)
    return f"{display_model}-HUB-{_mac_suffix_for_instance(mdns_txt)}"

def _sum8(b: bytes) -> int: return sum(b) & 0xFF
def to_export_view(entry: dict[str, Any]) -> dict[str, Any]:
    """Return a JSON-safe shallow copy of a device / activity entry.

    This is the *single* boundary at which ``raw_body`` is stripped.
    Everywhere else (``state.devices``, ``state.activities``, the
    snapshot helpers on :class:`~custom_components.sofabaton_x1s.hub.SofabatonHub`)
    keeps the raw record body so the on-demand backup / restore paths
    can decode the full schema without re-fetching. Pipe through this
    helper before serialising to JSON (WS payloads, persistent cache,
    diagnostic exports).
    """

    view = dict(entry)
    view.pop("raw_body", None)
    return view


def _input_create_step(
    *, device_id: int, payload: bytes, label_suffix: str
) -> CreateStep:
    """Wrap a family-0x46 payload into a :class:`CreateStep`.

    Local to the proxy so :mod:`lib.inputs` stays free of any
    create-sequence dependency.
    """

    return CreateStep(
        label=f"inputs dev=0x{device_id & 0xFF:02X} {label_suffix}",
        family=FAMILY_INPUTS,
        payload=payload,
        ack_opcode=ACK_OPCODE_STATUS,
        ack_first_byte=ACK_STATUS_BYTE_OK,
    )


def _hex_to_bytes(raw_hex: str) -> bytes:
    return bytes.fromhex(raw_hex)


def _ascii_padded(value: str, *, length: int) -> bytes:
    return value.encode("ascii", errors="ignore")[:length].ljust(length, b"\x00")


def _to_dbc(value: str) -> str:
    """Collapse full-width forms to the GB2312-friendly half-width variant."""

    chars: list[str] = []
    for ch in str(value or ""):
        code = ord(ch)
        if code == 0x3000:
            chars.append(" ")
        elif 0xFF01 <= code <= 0xFF5E:
            chars.append(chr(code - 0xFEE0))
        else:
            chars.append(ch)
    return "".join(chars)


def _encode_hub_name_wire(value: str) -> bytes:
    return _to_dbc(value).encode("gb2312", errors="ignore")


def _decode_hub_name_wire(payload: bytes, *, hub_version: str | None) -> str:
    raw = payload
    if hub_version == HUB_VERSION_X2 and len(raw) >= 2:
        raw = raw[2:]
    return raw.decode("gb2312", errors="ignore").strip("\x00").strip()


# Position of the tail token block inside a CATALOG_ROW_ACTIVITY payload.
# See the activity-row schema comment in ``opcode_handlers`` for details.
_ACTIVITY_ROW_TAIL_OFFSET_IN_PAYLOAD = 152
_ACTIVITY_ROW_TAIL_LEN = 60


# ACTIVITY_INPUTS (family 0x46 / response 0x47) schema lives in
# :mod:`lib.inputs`; see its module docstring for the canonical
# per-variant entry stride and trailing-region layout. Parser and
# builder are exposed there as :func:`parse_inputs_burst` and
# :func:`build_inputs_write`.



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



# Deframer moved to lib/deframer.py — re-exported above.

# ============================================================================
# Proxy
# ============================================================================
class X1Proxy(FrameDecodeMixin, IrBlobMixin, CatalogMixin, ExchangeMixin, AckWaitersMixin, ActivityOpsMixin, ActivitySyncMixin, CacheBackupMixin, WifiDeviceMixin, RestoreMixin, BackupExportMixin):
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
        self._log = get_hub_logger(log, self.proxy_id)
        self.diag_dump = bool(diag_dump)
        self.diag_parse = bool(diag_parse)
        if hub_version:
            self.hub_version = hub_version
        else:
            try:
                self.hub_version = classify_hub_version(self.mdns_txt)
            except ValueError:
                # No mDNS classification available yet (manual entry,
                # mid-handshake, or a synthetic test proxy). Keep the
                # variant pinned to the narrow-line layout until the
                # connect banner arrives and ``_apply_banner_identity``
                # re-classifies. Anything that talks to a real hub is
                # already classified by mDNS before construction, so
                # this path only matters for transitional state.
                self.hub_version = HUB_VERSION_X1
        # deframers
        self._df_h2a = Deframer()
        self._df_a2h = Deframer()
        self._adv_started = False

        self.state = ActivityCache()
        self._button_assembler = DeviceButtonAssembler()
        self._command_assembler = DeviceCommandAssembler()
        self._macro_assembler = MacroAssembler()
        self._burst = BurstScheduler()
        self._pending_button_requests: set[int] = set()
        self._button_burst_expected_frames: dict[int, int] = {}
        # Track pending command fetches per device, so multiple targeted
        # lookups for the same device (different commands) can be queued.
        self._pending_command_requests: dict[int, set[int]] = {}
        self._ir_dump_lock = threading.Lock()
        self._ir_dump_pending: dict[tuple[int, int], dict[str, Any]] = {}
        self._commands_complete: set[int] = set()
        self._pending_macro_requests: set[int] = set()
        self._macros_complete: set[int] = set()
        self._pending_activity_map_requests: set[int] = set()
        self._activity_map_complete: set[int] = set()
        self._activity_row_payloads: dict[int, bytes] = {}
        self._device_request_serial = 0
        self._device_request_inflight: int | None = None
        self._devices_catalog_ready = False
        self._device_pending_generation: int | None = None
        self._device_pending_expected_rows: int | None = None
        self._device_pending_rows: dict[int, dict[str, Any]] = {}
        self._activity_request_serial = 0
        self._activity_request_inflight: int | None = None
        self._activities_catalog_ready = False
        self._activity_retry_count = 0
        self._activity_retry_due_at: float | None = None
        self._activity_retry_send_pending = False
        self._activity_pending_generation: int | None = None
        self._activity_pending_expected_rows: int | None = None
        self._activity_pending_rows: dict[int, dict[str, Any]] = {}
        self._activity_pending_payloads: dict[int, bytes] = {}
        self._activity_pending_hint: int | None = None
        self._favorite_label_requests: dict[tuple[int, int], set[int]] = defaultdict(set)
        self._keybinding_label_requests: dict[tuple[int, int], set[int]] = defaultdict(set)
        self._activity_listeners: list[callable] = []
        self._activity_list_update_listeners: list[Callable[[], None]] = []
        self._hub_state_listeners: list[callable] = []
        self._client_state_listeners: list[callable] = []
        self._ota_update_listeners: list[callable] = []
        self._activation_listeners: list[callable] = []
        self._redundant_off_listeners: list[Callable[[], None]] = []
        # Set when ACK_READY arrives while the hub is already powered off;
        # resolved by the next active-state evaluation (see
        # handle_active_state). A no-op OFF press is the only known trigger.
        self._pending_redundant_off_check = False
        self._app_devices_deadline: float | None = None
        self._app_devices_retry_sent = False
        self._pending_virtual: dict[str, Any] | None = None
        self._pending_virtual_event = threading.Event()
        self._pending_virtual_lock = threading.Lock()
        self._pending_assigned_device_id: int | None = None
        self._pending_assigned_device_event = threading.Event()
        self._pending_assigned_device_lock = threading.Lock()
        self._ack_queue_lock = threading.Lock()
        self._ack_queue: deque[tuple[int, bytes, float]] = deque()
        self._ack_event = threading.Event()
        # Exchange guard: serializes blocking request/response exchanges
        # against each other (RLock so a helper that already holds an
        # exchange may call helpers that open their own). The depth
        # counter is only read/written by the thread holding the lock.
        self._exchange_lock = threading.RLock()
        self._exchange_depth = 0
        # Ident of the frame-processing thread (latched by _handle_idle,
        # which the transport bridge invokes on that thread). exchange()
        # refuses to run there: that thread delivers the acks an exchange
        # blocks on, so entering would deadlock.
        self._frame_thread_ident: int | None = None
        self._x2_remote_sync_id_lock = threading.Lock()
        self._x2_remote_sync_id: bytes | None = None
        self._x2_remote_sync_id_event = threading.Event()
        self._macro_payload_lock = threading.Lock()
        # Transient fetch-arrival signals: popped by wait_for_macro_record,
        # cleared by reset_ack_queues before every write transaction.
        self._macro_payload_events: dict[tuple[int, int], MacroRecord] = {}
        # Persistent macro cache read by structural bundles / exports. Only
        # per-entity invalidation (clear_entity_cache) or a cache import may
        # drop entries — never the ack-queue reset.
        self._macro_records_cache: dict[tuple[int, int], MacroRecord] = {}
        self._macro_payload_event = threading.Event()
        self._activity_inputs_lock = threading.Lock()
        self._activity_inputs_seen = 0
        self._activity_inputs_last_ts = 0.0
        self._activity_inputs_event = threading.Event()
        self._activity_inputs_payloads: list[bytes] = []
        self._device_key_sort_lock = threading.Lock()
        self._device_key_sort_pending: int | None = None
        self._device_key_sort_expected_pages: int | None = None
        self._device_key_sort_pages: dict[int, bytes] = {}
        # Set while REQ_ACTIVITY_INPUTS is awaiting a reply. Lets the
        # STATUS_ACK handler distinguish a hub rejection of *our* inputs
        # request from unrelated 0x0103 acks.
        self._activity_inputs_pending = False
        # Latched by the STATUS_ACK handler when the hub answers our
        # inputs request with a non-zero status (e.g. 0x07 "not
        # configured"). Read and reset exclusively inside
        # :meth:`wait_for_activity_inputs_burst`; never exposed to
        # callers -- the outcome surfaces through
        # :class:`InputsBurstResult`.
        self._inputs_burst_reject_pending = False
        self._banner_info_lock = threading.Lock()
        self._banner_info_event = threading.Event()
        self._banner_info: dict[str, Any] = {}
        self._idle_behavior_lock = threading.Lock()
        self._idle_behavior_events: dict[int, threading.Event] = {}
        self._idle_behavior_values: dict[int, int] = {}

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
        self._burst.on_burst_end("ir_dump", self._on_ir_dump_burst_end)
        self._burst.on_burst_end("macros", self._on_macros_burst_end)
        self._burst.on_burst_end("activity_map", self._on_activity_map_burst_end)
        self._burst.on_burst_end("activities", self._on_activities_burst_end)
        self._burst.on_burst_end("devices", self._on_devices_burst_end)
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

    def has_banner_identity(self) -> bool:
        info = self.get_banner_info()
        model = _normalize_banner_model(info.get("model"))
        name = str(info.get("name") or "").strip()
        firmware_version = info.get("firmware_version")
        return bool(
            model
            and name
            and isinstance(firmware_version, (int, float))
        )

    def update_discovery_identity(
        self,
        *,
        mdns_txt: Dict[str, str],
        hub_version: str | None,
    ) -> bool:
        changed = False
        next_txt = dict(mdns_txt)
        if self.mdns_txt != next_txt:
            self.mdns_txt = next_txt
            changed = True

        next_version = _normalize_banner_model(hub_version)
        if not next_version:
            try:
                next_version = classify_hub_version(self.mdns_txt)
            except ValueError:
                next_version = self.hub_version
        if self.hub_version != next_version:
            self.hub_version = next_version
            changed = True

        next_instance = _normalize_mdns_instance(
            _mdns_instance_for_identity(self.hub_version, self.mdns_txt)
        )
        next_host = next_instance + ".local"
        if self.mdns_instance != next_instance or self.mdns_host != next_host:
            self.mdns_instance = next_instance
            self.mdns_host = next_host
            changed = True

        self.transport.update_discovery_metadata(mdns_txt=self.mdns_txt)

        if changed and self._adv_started:
            self._stop_discovery()
        if self.transport.is_hub_connected and self.has_banner_identity():
            self._start_discovery()

        return changed

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
        pending_redundant_off = self._pending_redundant_off_check
        self._pending_redundant_off_check = False
        if new_id != old_id:
            if new_id is not None:
                self._notify_activity_change(new_id & 0xFF, old_id & 0xFF if old_id is not None else None)
            else:
                self._notify_activity_change(None, old_id & 0xFF if old_id is not None else None)
        elif pending_redundant_off and new_id is None:
            # ACK_READY fired while the hub was already powered off and the
            # refreshed state confirms nothing changed: the only known cause
            # is an OFF press on the remote while everything was already off.
            self._log.info("[HINT] OFF pressed while hub already powered off")
            self._notify_redundant_off_press()

    def flag_pending_redundant_off_check(self) -> None:
        """Arm the redundant-OFF check for the next active-state evaluation.

        Called when ACK_READY arrives while the cached state says the hub is
        already powered off (see :class:`AckReadyHandler`).
        """

        self._pending_redundant_off_check = True
    
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
        self._log.info("%s hex logging %s", LogTag.PROXY, "enabled" if enable else "disabled")

    def can_issue_commands(self) -> bool:
        return self.transport.can_issue_commands()

    def _build_frame(self, opcode: int, payload: bytes = b"") -> bytes:
        head = bytes([SYNC0, SYNC1, (opcode >> 8) & 0xFF, opcode & 0xFF])
        frame = head + payload
        return frame + bytes([_sum8(frame)])

    def _send_family_frame(self, family: int, payload: bytes) -> None:
        opcode = ((len(payload) & 0xFF) << 8) | (family & 0xFF)
        self._log.debug(
            "%s send family=0x%02X opcode=0x%04X payload=%dB",
            LogTag.WIFI,
            family,
            opcode,
            len(payload),
        )
        self._send_cmd_frame(opcode, payload)

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
        sent = self._burst.queue_or_send(
            opcode=opcode,
            payload=payload,
            expects_burst=expects_burst,
            burst_kind=burst_kind,
            can_issue=self.can_issue_commands,
            sender=self._send_cmd_frame,
        )
        if sent:
            self._log.debug("%s queued %s (0x%04X) %dB", LogTag.CMD, OPNAMES.get(opcode, f"OP_{opcode:04X}"), opcode, len(payload))
        else:
            self._log.debug(
                "%s ignoring %s: proxy client is connected",
                LogTag.CMD,
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

    def on_ota_update(self, cb) -> None:
        """cb()  Fired when the hub announces an OTA firmware update (opcode 0x0167)."""
        self._ota_update_listeners.append(cb)

    def notify_ota_in_progress(self) -> None:
        """Dispatch the OTA-in-progress event to registered listeners."""
        self._log.warning("[OTA] hub announced firmware update — pausing reconnects")
        for cb in self._ota_update_listeners:
            try:
                cb()
            except Exception:
                self._log.exception("ota update listener failed")

    def on_activity_change(self, cb) -> None:
        """cb(new_id: int | None, old_id: int | None, name: str | None)"""
        self._activity_listeners.append(cb)

    def on_redundant_off_press(self, cb: Callable[[], None]) -> None:
        """cb() fired when OFF is pressed while the hub is already powered off."""
        self._redundant_off_listeners.append(cb)

    def _notify_redundant_off_press(self) -> None:
        for cb in self._redundant_off_listeners:
            try:
                cb()
            except Exception:
                self._log.exception("redundant off-press listener failed")

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

    def get_banner_info(self) -> dict[str, Any]:
        with self._banner_info_lock:
            return dict(self._banner_info)

    def record_hub_name(self, name: str) -> bool:
        """Update cached banner identity with a newly confirmed hub name."""

        next_name = str(name or "").strip()
        if not next_name:
            return False

        changed = False
        with self._banner_info_lock:
            next_info = dict(self._banner_info)
            if str(next_info.get("name") or "").strip() != next_name:
                next_info["name"] = next_name
                self._banner_info = next_info
                changed = True

        self._banner_info_event.set()
        if changed:
            self._log.info("[HUB] cached hub name=%s", next_name)
        return True

    def request_banner_info(self) -> bool:
        return self.enqueue_cmd(OP_REQ_BANNER)

    def request_idle_behavior(self, device_id: int) -> bool:
        """Request the current idle/power behavior for one device."""

        return self.enqueue_cmd(OP_REQ_IDLE_BEHAVIOR, bytes([device_id & 0xFF]))

    def set_idle_behavior(self, device_id: int, mode: int) -> bool:
        """Set the idle/power behavior for one device."""

        dev_lo = device_id & 0xFF
        normalized_mode = int(mode) & 0xFF
        ok = self.enqueue_cmd(
            OP_SET_IDLE_BEHAVIOR,
            bytes([dev_lo, normalized_mode]),
        )
        if ok:
            self.record_idle_behavior_value(dev_lo, normalized_mode, source="local_set")
        return ok

    def get_idle_behavior(
        self,
        device_id: int,
        *,
        fetch_if_missing: bool = True,
    ) -> tuple[int | None, bool]:
        """Return cached idle behavior, optionally querying the hub if missing."""

        dev_lo = device_id & 0xFF
        cached = self.state.entities("device").get(dev_lo, {}).get("idle_behavior")
        if isinstance(cached, int):
            return (cached & 0xFF, True)

        with self._idle_behavior_lock:
            value = self._idle_behavior_values.get(dev_lo)

        if value is not None:
            return (value, True)

        if fetch_if_missing and self.can_issue_commands():
            self.request_idle_behavior(dev_lo)

        return (None, False)

    def fetch_idle_behavior(
        self,
        device_id: int,
        *,
        force_refresh: bool = True,
        timeout: float = 2.0,
    ) -> tuple[int | None, bool]:
        """Fetch one device's idle behavior, using cached data when allowed."""

        dev_lo = device_id & 0xFF
        cached, ready = self.get_idle_behavior(dev_lo, fetch_if_missing=False)
        if ready and not force_refresh:
            return (cached, True)

        if not self.can_issue_commands():
            return (cached, ready)

        with self._idle_behavior_lock:
            event = self._idle_behavior_events.setdefault(dev_lo, threading.Event())
            event.clear()

        if not self.request_idle_behavior(dev_lo):
            return (cached, ready)

        event.wait(timeout)
        refreshed, refreshed_ready = self.get_idle_behavior(dev_lo, fetch_if_missing=False)
        return (refreshed, refreshed_ready)

    def fetch_banner_info(
        self,
        *,
        force_refresh: bool = True,
        timeout: float = 2.0,
    ) -> tuple[dict[str, Any], bool]:
        cached = self.get_banner_info()
        if cached and not force_refresh:
            return (cached, True)

        if not self.can_issue_commands():
            return (cached, bool(cached))

        self._banner_info_event.clear()
        if not self.request_banner_info():
            return (cached, bool(cached))

        self._banner_info_event.wait(timeout)
        info = self.get_banner_info()
        return (info, bool(info))

    def set_hub_name(
        self,
        name: str,
        *,
        timeout: float = 5.0,
    ) -> bool:
        next_name = str(name or "").strip()
        if not next_name:
            self._log.warning("[HUB] set_hub_name ignored: empty name")
            return False
        if not self.can_issue_commands():
            self._log.warning("[HUB] set_hub_name ignored: transport not ready")
            return False

        payload = _encode_hub_name_wire(next_name)
        if not payload:
            self._log.warning("[HUB] set_hub_name ignored: name %r produced no encodable bytes", next_name)
            return False

        with self.exchange("hub_name"):
            self.clear_ack_queue()
            send_ts = time.monotonic()
            self._log.info("[HUB] setting hub name=%s", next_name)
            self._send_family_frame(OP_SET_HUB_NAME & 0xFF, payload)

            matched = self.wait_for_ack_family_low(
                FAMILY_HUB_NAME_REPLY,
                timeout=timeout,
                not_before=send_ts,
            )
        if matched is None:
            self._log.warning("[HUB] timed out waiting for hub-name reply")
            return False

        _ack_opcode, ack_payload = matched
        echoed_name = _decode_hub_name_wire(ack_payload, hub_version=self.hub_version)
        if echoed_name and echoed_name != next_name:
            self._log.info(
                "[HUB] hub echoed normalized name=%s (requested=%s)",
                echoed_name,
                next_name,
            )
        self.record_hub_name(echoed_name or next_name)
        return True

    def record_banner_payload(self, opcode: int, payload: bytes) -> dict[str, Any] | None:
        # This handler matches on the opcode low byte (family 0x02), and frames
        # dispatch to every matching handler, so other H->A frames sharing that
        # low byte (e.g. a 0x4102 save-transaction frame) also land here and must
        # be rejected. The banner is identified by its stable structural fields:
        #   * the frame already passed the deframer's checksum, and
        #   * the payload is long enough to hold the fixed identity header, and
        #   * payload[7] is a recognised hub hardware code, and
        #   * payload[8:12] is the BCD-packed production date.
        # Together those make a false match astronomically unlikely. Bytes 13/14
        # are deliberately *not* part of the gate: they are hub/firmware-dependent
        # flag bytes whose values differ across models and revisions, and gating
        # on them silently dropped the banner on hubs that report them nonzero.
        if opcode_family(opcode) != 0x02 or len(payload) < 15:
            return None

        model = _HUB_MODEL_BY_CODE.get(payload[7] & 0xFF)
        if model is None or not _looks_like_production_date(payload[8:12]):
            return None

        batch = payload[8:12].hex()
        firmware_version = payload[12] & 0xFF
        banner_name = payload[15:].decode("utf-8", errors="ignore").strip("\x00").strip()
        parsed = {
            "model": model,
            "production_batch": batch,
            "firmware_version": firmware_version,
            "name": banner_name,
        }

        changed = False
        with self._banner_info_lock:
            if self._banner_info != parsed:
                self._banner_info = dict(parsed)
                changed = True

        if changed:
            if self.hub_version != model:
                self._log.info(
                    "[BANNER] model corrected from %s to %s",
                    self.hub_version,
                    model,
                )
                self.hub_version = model
            self._log.info(
                "[BANNER] model=%s batch=%s fw=%d name=%s",
                model,
                batch,
                firmware_version,
                banner_name or "<unknown>",
            )

        self._banner_info_event.set()
        return parsed

    def record_idle_behavior_value(
        self,
        device_id: int,
        mode: int,
        *,
        source: str = "hub_reply",
    ) -> int:
        """Cache one device's idle/power behavior and wake any waiter."""

        dev_lo = device_id & 0xFF
        normalized_mode = int(mode) & 0xFF

        with self._idle_behavior_lock:
            self._idle_behavior_values[dev_lo] = normalized_mode
            event = self._idle_behavior_events.get(dev_lo)

        existing = dict(self.state.entities("device").get(dev_lo, {}))
        existing["idle_behavior"] = normalized_mode
        existing["power_mode"] = normalized_mode
        existing["power_model"] = normalized_mode
        self.state.devices[dev_lo] = normalize_device_entry(existing)

        self._log.info(
            "%s idle %s dev=0x%02X mode=%d",
            LogTag.REMOTE,
            source,
            dev_lo,
            normalized_mode,
        )

        if event is not None:
            event.set()

        return normalized_mode

    # High-level helpers
    def request_devices(self) -> bool:    return self.enqueue_cmd(OP_REQ_DEVICES, expects_burst=True, burst_kind="devices")
    def request_activities(self, *, is_retry: bool = False) -> bool:
        self._activity_retry_send_pending = is_retry
        ok = self.enqueue_cmd(OP_REQ_ACTIVITIES, expects_burst=True, burst_kind="activities")
        if not ok:
            self._activity_retry_send_pending = False
        return ok

    def request_buttons_for_entity(self, ent_id: int) -> bool:
        if not self.can_issue_commands():
            self._log.info("[CMD] request_buttons_for_entity ignored: proxy client is connected"); return False

        ent_lo = ent_id & 0xFF
        if ent_lo in self._pending_button_requests:
            self._log.debug(
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
            self._log.info("[CMD] request_commands_for_entity ignored: proxy client is connected"); return False
        ent_lo = ent_id & 0xFF
        if 0xFF in self._pending_command_requests.get(ent_lo, set()):
            self._log.debug(
                "[CMD] request_commands_for_entity ignored: burst already pending for 0x%02X",
                ent_lo,
            )
            return False

        self._pending_command_requests.setdefault(ent_lo, set()).add(0xFF)
        self.enqueue_cmd(OP_REQ_COMMANDS, bytes([ent_lo, 0xFF]), expects_burst=True, burst_kind=f"commands:{ent_lo}")
        return True

    def request_ir_command_dump(
        self,
        device_id: int,
        command_id: int | None = None,
        *,
        timeout: float = 10.0,
    ) -> dict[str, Any] | None:
        """Request the raw 0x020C [dev, item] blob dump for a device."""

        if not self.can_issue_commands():
            self._log.info("[CMD] request_ir_command_dump ignored: proxy client is connected")
            return None

        dev_lo = device_id & 0xFF
        cmd_lo = 0xFF if command_id is None else (command_id & 0xFF)
        request_key = (dev_lo, cmd_lo)
        event: threading.Event
        should_send = False

        with self._ir_dump_lock:
            pending = self._ir_dump_pending.get(request_key)
            if pending is not None and not pending["event"].is_set():
                event = pending["event"]
            else:
                now = time.monotonic()
                event = threading.Event()
                self._ir_dump_pending[request_key] = {
                    "event": event,
                    "device_id": dev_lo,
                    "requested_command_id": None if cmd_lo == 0xFF else cmd_lo,
                    "total_commands": None,
                    "commands": {},
                    "response_index_to_command_id": {},
                    "started_ts": now,
                    "last_progress_ts": now,
                    "burst_finished": False,
                }
                should_send = True

        if should_send:
            ok = self.enqueue_cmd(
                OP_REQ_BLOB,
                bytes([dev_lo, cmd_lo]),
                expects_burst=True,
                burst_kind=f"ir_dump:{dev_lo}:{cmd_lo}",
            )
            if not ok:
                with self._ir_dump_lock:
                    active = self._ir_dump_pending.get(request_key)
                    if active is not None and active["event"] is event:
                        self._ir_dump_pending.pop(request_key, None)
                return None

        idle_timeout = max(float(timeout), 0.1)
        hard_timeout = 120.0 if cmd_lo == 0xFF else max(idle_timeout * 3.0, 30.0)
        hard_deadline = time.monotonic() + hard_timeout

        while True:
            remaining = hard_deadline - time.monotonic()
            if remaining <= 0:
                break
            if event.wait(min(0.25, remaining)):
                break

            with self._ir_dump_lock:
                live_pending = self._ir_dump_pending.get(request_key)
                if live_pending is None:
                    break
                last_progress = float(
                    live_pending.get("last_progress_ts", live_pending.get("started_ts", 0.0))
                )

            if time.monotonic() - last_progress >= idle_timeout:
                break

        with self._ir_dump_lock:
            pending = self._ir_dump_pending.pop(request_key, None)

        if pending is None:
            return None

        return self._build_ir_dump_result(pending)


    def get_app_activations(self) -> list[dict[str, Any]]:
        return self.state.get_app_activations()
    
    def get_proxy_status(self) -> bool:
        return self._proxy_enabled
    
    def send_command(self, ent_id: int, key_code: int) -> bool:
        if not self.can_issue_commands():
            self._log.info(
                "[CMD] send_command ignored: transport not ready "
                "(hub_connected=%s, client_connected=%s)",
                self.transport.is_hub_connected,
                self.transport.is_client_connected,
            )
            return False

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
        version = hub_version or self.hub_version
        if not version:
            try:
                version = classify_hub_version(self.mdns_txt)
            except ValueError:
                self._log.warning(
                    "%s find-remote: hub_version unknown; cannot pick opcode.", LogTag.REMOTE
                )
                return False
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
        version = hub_version or self.hub_version
        if not version:
            try:
                version = classify_hub_version(self.mdns_txt)
            except ValueError:
                self._log.warning(
                    "%s sync: hub_version unknown; cannot pick opcode.", LogTag.REMOTE
                )
                return False
        self.hub_version = version

        if version == HUB_VERSION_X2:
            with self._x2_remote_sync_id_lock:
                self._x2_remote_sync_id = None
                self._x2_remote_sync_id_event.clear()

            if not self.enqueue_cmd(OP_X2_REMOTE_LIST, b"\x00"):
                return False

            remote_id = self.wait_for_x2_remote_sync_id(timeout=2.0)
            if remote_id is None:
                self._log.warning("%s sync: timed out waiting for X2 remote list response", LogTag.REMOTE)
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

    def _build_macro_record_entry(
        self,
        *,
        device_id: int,
        command_id: int,
        input_index: int = 0,
    ) -> MacroKeyEntry:
        return MacroKeyEntry(
            device_id=device_id & 0xFF,
            key_id=command_id & 0xFF,
            fid=0,
            duration=input_index & 0xFF,
            delay=0xFF,
        )


    def _build_paged_macro_save_payloads(self, payload: bytes) -> list[bytes]:
        """Split one family-0x12 macro-save body into app-shaped page payloads.

        ``payload`` is the canonical ``[outer_marker][outer_seq_be] + inner_body``
        produced by :func:`build_macro_save_payload`. The inner body already
        carries the correct ``total_pages`` at ``body[1:3]`` and a checksum at
        ``body[-1]`` computed over the final byte values, so this function only
        chops the body into 247-byte chunks and prepends a fresh
        ``[0x01][seq_be]`` wrapper to each page.
        """

        if len(payload) < 4:
            return [payload]

        body = payload[3:]
        chunk_size = 247
        total_pages = max(1, (len(body) + chunk_size - 1) // chunk_size)

        paged_payloads: list[bytes] = []
        for seq in range(1, total_pages + 1):
            chunk = body[(seq - 1) * chunk_size : seq * chunk_size]
            paged_payloads.append(bytes([0x01]) + seq.to_bytes(2, "big") + bytes(chunk))
        return paged_payloads

    def _send_paged_macro_save(
        self,
        *,
        payload: bytes,
        macro_button: int,
        ack_timeout: float = 5.0,
    ) -> tuple[int, bytes] | None:
        """Send one macro save using paged family-0x12 write layout."""

        paged_payloads = self._build_paged_macro_save_payloads(payload)

        last_ack: tuple[int, bytes] | None = None
        # ONE scope around the whole page loop: the pages of one save
        # must never interleave with any other exchange or queued read.
        with self.exchange("macro_save"):
            self.clear_ack_queue()
            for seq, page_payload in enumerate(paged_payloads, start=1):
                page_opcode = ((len(page_payload) & 0xFF) << 8) | 0x12
                self._log.debug(
                    "%s save macro page seq=%d/%d opcode=0x%04X payload=%dB",
                    LogTag.ACTIVITY,
                    seq,
                    len(paged_payloads),
                    page_opcode,
                    len(page_payload),
                )
                if self.diag_dump:
                    self._log.debug(
                        "%s save macro page %d/%d payload %s",
                        LogTag.WIRE,
                        seq,
                        len(paged_payloads),
                        page_payload.hex(" "),
                    )

                send_ts = time.monotonic()
                self._send_family_frame(0x12, page_payload)
                if seq < len(paged_payloads):
                    candidates = [(0x0103, None)]
                else:
                    # The final-page 0x0112 ack usually echoes the macro key in
                    # payload[0], but not always: a save that drops a device's
                    # last power-macro reference makes the hub cascade-remove
                    # that device from the activity and ack with a different
                    # byte (observed live: 0x01 after ~1.2 s on X1). Accept any
                    # 0x0112 — rejections arrive as 0x0103 with a non-zero
                    # status, checked below.
                    candidates = [(0x0112, None), (0x0103, None)]
                last_ack = self.wait_for_ack_any(
                    candidates,
                    timeout=ack_timeout,
                    not_before=send_ts,
                )
                if last_ack is None:
                    self._log.warning(
                        "%s missing ACK after macro save page seq=%d/%d button=0x%02X",
                        LogTag.ACTIVITY,
                        seq,
                        len(paged_payloads),
                        macro_button,
                    )
                    return None

                ack_opcode, ack_payload = last_ack
                # 0x0103 carries the hub status in payload[0]: 0x00 = accept,
                # anything else (observed: 0x0c) = rejection. We can't trust a
                # rejected page as if it succeeded.
                if ack_opcode == 0x0103 and (not ack_payload or ack_payload[0] != 0x00):
                    status = ack_payload[0] if ack_payload else None
                    self._log.warning(
                        "%s hub rejected macro save page seq=%d/%d button=0x%02X status=%s",
                        LogTag.ACTIVITY,
                        seq,
                        len(paged_payloads),
                        macro_button,
                        f"0x{status:02X}" if status is not None else "?",
                    )
                    return None
                if (
                    ack_opcode == 0x0112
                    and ack_payload
                    and ack_payload[0] != (macro_button & 0xFF)
                ):
                    self._log.info(
                        "%s macro save ack fallback button=0x%02X ack_payload=0x%02X",
                        LogTag.ACTIVITY,
                        macro_button,
                        ack_payload[0],
                    )


        return last_ack

    def _build_macro_save_payload(
        self,
        source_record: MacroRecord,
        *,
        device_id: int,
        button_id: int,
        allowed_device_ids: set[int] | None = None,
        input_index: int = 0,
    ) -> bytes:
        """Build a power-macro save payload from a fetched MacroRecord.

        The fetched ``MacroRecord`` comes from :class:`MacroAssembler` via the
        burst handler, so its ``key_sequence`` reflects the canonical
        schema (no need to re-scan for 0xFF separators, codec heuristics, or
        expanded-pair collapses).

        We append, rather than dedup/reorder, to mirror the official app's
        in-memory model: the device list grows by one when a device is added
        and the new device's rows land at the end of the sequence.
        """

        allowed: set[int] | None = None
        if allowed_device_ids is not None:
            allowed = {d & 0xFF for d in allowed_device_ids}

        compact_entries: list[MacroKeyEntry] = []
        for entry in source_record.key_sequence:
            if entry.is_delay_only:
                compact_entries.append(entry)
                continue
            if allowed is not None and entry.device_id not in allowed:
                continue
            compact_entries.append(entry)

        existing_pairs = {
            (entry.device_id, entry.key_id)
            for entry in compact_entries
            if not entry.is_delay_only
        }

        new_dev = device_id & 0xFF
        power_key = button_id & 0xFF
        if (new_dev, power_key) not in existing_pairs:
            compact_entries.append(
                self._build_macro_record_entry(device_id=new_dev, command_id=power_key)
            )

        # On POWER_ON the official app always emits a (dev, 0xC5) row for
        # the newly-added device (duration carries the input ordinal, or 0
        # when no input is selected). The hub uses the C5 row as the
        # paired entry to the C6 row even when no HDMI input is being
        # switched; omitting it produces a row-count mismatch and the
        # macro shows up corrupted in the app.
        if button_id == ButtonName.POWER_ON:
            input_entry = self._build_macro_record_entry(
                device_id=new_dev, command_id=0xC5, input_index=input_index
            )
            replaced = False
            for i, entry in enumerate(compact_entries):
                if entry.device_id == new_dev and entry.key_id == 0xC5:
                    compact_entries[i] = input_entry
                    replaced = True
                    break
            if not replaced:
                compact_entries.append(input_entry)

        return build_macro_save_payload(
            activity_id=source_record.activity_id,
            key_id=power_key,
            key_sequence=compact_entries,
            label="POWER_ON" if button_id == ButtonName.POWER_ON else "POWER_OFF",
            hub_version=self.hub_version,
            label_slot=source_record.raw_label_slot or None,
        )


    def get_routed_local_ip(self) -> str:
        """Return the local IPv4 address selected by OS routing toward the real hub."""

        return _route_local_ip(self.real_hub_ip)




    # ---------------------------------------------------------------------
    # mDNS advertisement
    # ---------------------------------------------------------------------
    def _start_mdns(self) -> None:
        from zeroconf import BadTypeInNameException, IPVersion, NonUniqueNameException, ServiceInfo, Zeroconf

        ip_bytes = socket.inet_aton(_route_local_ip(self.real_hub_ip))
        service_type = mdns_service_type_for_props(self.mdns_txt)
        instance = self.mdns_instance
        host = (self.mdns_host or instance) + "."

        props = {k: v.encode("utf-8") for k, v in self.mdns_txt.items()}
        # Always self-mark the advertisement as a proxy so discovery
        # (ours or any consumer's) can tell it apart from a physical
        # hub. Callers may still pre-set the key via mdns_txt.
        props.setdefault(PROXY_TXT_KEY, PROXY_TXT_VALUE.encode("utf-8"))

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
            self._log.exception(
                "[MDNS] service type %s was rejected; advertisement will not be started",
                service_type,
            )
            return False
        except NonUniqueNameException:
            self._log.warning(
                "[MDNS] service name %s is already in use; advertisement will not be started",
                info.name,
            )
            return False
        self._mdns_infos.append(info)
        self._log.info(
            "[MDNS] registered %s on %s:%d (HVER=%s)",
            info.name,
            socket.inet_ntoa(ip_bytes),
            self.proxy_udp_port,
            self.mdns_txt.get("HVER", "unknown"),
        )

        self._adv_started = True
        self._log.info("[MDNS] registration complete; verify via Zeroconf browser if available")
        return True

    # ---------------------------------------------------------------------
    # Parsing helpers
    # ---------------------------------------------------------------------
    
    def _notify_hub_state(self, connected: bool) -> None:
        self._hub_connected = connected
        for cb in self._hub_state_listeners:
            try:
                cb(connected)
            except Exception:
                self._log.exception("hub state listener failed")

    def _notify_client_state(self, connected: bool) -> None:
        self._client_connected = connected
        for cb in self._client_state_listeners:
            try:
                cb(connected)
            except Exception:
                self._log.exception("client state listener failed")
        if not connected:
            self._clear_app_device_retry()

    
    def _notify_activity_change(self, new_id: int | None, old_id: int | None) -> None:
        name = None
        if new_id is not None:
            name = self.state.entities("activity").get(new_id & 0xFF, {}).get("name")
        for cb in self._activity_listeners:
            try:
                cb(new_id, old_id, name)
            except Exception:
                self._log.exception("activity listener failed")

    def _notify_app_activation(self, record: dict[str, Any]) -> None:
        for cb in self._activation_listeners:
            try:
                cb(record)
            except Exception:
                self._log.exception("app activation listener failed")

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

    def _on_ir_dump_burst_end(self, key: str) -> None:
        parts = key.split(":")
        if len(parts) < 3 or parts[0] != "ir_dump":
            return

        try:
            request_key = (int(parts[1]) & 0xFF, int(parts[2]) & 0xFF)
        except ValueError:
            return

        with self._ir_dump_lock:
            pending = self._ir_dump_pending.get(request_key)
            if pending is None:
                return
            pending["burst_finished"] = True
            pending["event"].set()

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
                self._button_burst_expected_frames.pop(ent_lo, None)
            except ValueError:
                self._pending_button_requests.clear()
                self._button_burst_expected_frames.clear()
        else:
            self._pending_button_requests.clear()
            self._button_burst_expected_frames.clear()

    def _handle_idle(self, now: float) -> None:
        if self._frame_thread_ident is None:
            # The transport bridge invokes this callback on its
            # frame-processing thread; latch its ident so exchange()
            # can refuse to run there (see the deadlock note on
            # :meth:`exchange`).
            self._frame_thread_ident = threading.get_ident()
        self._burst.tick(now, can_issue=self.can_issue_commands, sender=self._send_cmd_frame)
        if (
            self._activity_retry_due_at is not None
            and now >= self._activity_retry_due_at
            and not self._burst.active
            and self.can_issue_commands()
        ):
            self._activity_retry_due_at = None
            self.request_activities(is_retry=True)
        self._maybe_retry_app_devices(now)

    def _maybe_retry_app_devices(self, now: float) -> None:
        if self._app_devices_deadline is None:
            return

        if now >= self._app_devices_deadline:
            if not self._app_devices_retry_sent:
                #self._log.info("[CMD] retrying app-sourced REQ_DEVICES after timeout")
                #self._send_cmd_frame(OP_REQ_DEVICES, b"")
                self._app_devices_retry_sent = True
            self._app_devices_deadline = None

    def _send_cmd_frame(self, opcode: int, payload: bytes) -> None:
        frame = self._build_frame(opcode, payload)
        if opcode == OP_REQ_DEVICES:
            self._begin_device_request()
        if opcode == OP_REQ_ACTIVITIES:
            is_retry = self._activity_retry_send_pending
            self._activity_retry_send_pending = False
            self._begin_activity_request(is_retry=is_retry)
        self._log.debug(
            "%s hub %s (0x%04X) %dB",
            LogTag.SEND,
            OPNAMES.get(opcode, f"OP_{opcode:04X}"),
            opcode,
            len(payload),
        )
        self.transport.send_local(frame)
        if self.diag_dump:
            self._log.debug("%s A→H %s", LogTag.WIRE, _hexdump(frame))

    # ---------------------------------------------------------------------
    # Lifecycle
    # ---------------------------------------------------------------------

    def _start_discovery(self) -> None:
        if not self._proxy_enabled:
            return
        if self._adv_started:
            return
        if not self.has_banner_identity():
            self._log.debug("[MDNS] discovery deferred until banner identity is ready")
            return

        self.proxy_udp_port = self.transport.proxy_udp_port
        if not self._start_mdns():
            return
        self.transport.start_notify_listener()
        self._adv_started = True

    def _stop_discovery(self) -> None:
        self.transport.stop_notify_listener()
        # unregister mDNS
        if self._zc is not None and self._mdns_infos:
            try:
                for info in self._mdns_infos:
                    try:
                        self._zc.unregister_service(info)
                        self._log.info("[MDNS] unregistered %s", info.name)
                    except Exception:
                        self._log.exception("[MDNS] failed to unregister service %s", info.name)
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
        self._log.info("%s proxy stopped", LogTag.PROXY)


from . import opcode_handlers  # noqa: F401  # register frame handlers
