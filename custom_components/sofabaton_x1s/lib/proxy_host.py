"""The host contract of the X1Proxy mixins (R6, CR-L3a-17).

The mixins in ``proxy_*.py`` and ``write_batch.py`` read state and call
methods that another class of :class:`X1Proxy` defines. ``_ProxyHost``
declares that borrowed surface in one place, composed of three smaller
Protocols so each can later be narrowed per mixin. Each mixin names it as
its base for the type checker only::

    class CatalogMixin(_ProxyHost if TYPE_CHECKING else object):

so nothing changes at runtime and no mixin imports another. The types are
the owners' own declarations; ``tests/test_proxy_host.py`` fails when a
member is renamed or dropped on :class:`X1Proxy`.
"""

from __future__ import annotations

import contextlib
import threading
from collections import deque
from typing import Any, Callable, Dict, Mapping, Protocol, Sequence, TYPE_CHECKING

if TYPE_CHECKING:
    from .ack import AckOutcome, InputsBurstResult, SendStepResult
    from .deframer import Deframer
    from .device_create import DeviceCreateRequest, DeviceCreateResult
    from .hub_logging import HubLogger
    from .macros import MacroAssembler, MacroRecord
    from .proxy_backup_export import _SyncBurstWaiter
    from .state_helpers import ActivityCache, BurstScheduler


class _WireHost(Protocol):
    """The wire: identity, logging, the send primitives, the exchange and the ack queue."""

    _ack_event: threading.Event
    _ack_queue: deque[tuple[int, bytes, float]]
    _ack_queue_lock: threading.Lock
    _banner_info_event: threading.Event
    _banner_info_lock: threading.Lock
    _burst: BurstScheduler
    _df_a2h: Deframer
    _df_h2a: Deframer
    _exchange_lock: threading.RLock
    _frame_thread_ident: int | None
    _handler_failures_seen: set[tuple[str, str]]
    _log: HubLogger
    diag_dump: bool
    diag_parse: bool
    hub_version: str
    mdns_instance: str
    mdns_txt: Dict[str, str]
    proxy_id: str

    def _send_cmd_frame(self, opcode: int, payload: bytes) -> None: ...
    def _send_family_frame(self, family: int, payload: bytes) -> None: ...
    def _send_step(
        self,
        *,
        step_name: str,
        family: int,
        payload: bytes,
        ack_opcode: int,
        ack_first_byte: int | None = ...,
        ack_fallback_opcodes: tuple[int, ...] = ...,
        timeout: float = ...,
        retries: int = ...,
        retry_delay: float = ...,
    ) -> SendStepResult: ...
    def _status_exchange(
        self,
        name: str,
        opcode: int,
        payload: bytes,
        *,
        timeout: float = ...,
        reset_acks: bool = ...,
    ) -> AckOutcome: ...
    def _wait_for_ack_any_impl(
        self,
        candidates: Sequence[tuple[int, int | None]],
        *,
        timeout: float = ...,
        not_before: float | None = ...,
        log_timeout: bool,
    ) -> tuple[int, bytes] | None: ...
    def can_issue_commands(self) -> bool: ...
    def clear_ack_queue(self) -> None: ...
    def enqueue_cmd(
        self,
        opcode: int,
        payload: bytes = ...,
        *,
        expects_burst: bool = ...,
        burst_kind: str | None = ...,
    ) -> bool: ...
    def exchange(self, name: str) -> contextlib.AbstractContextManager[None]: ...
    def get_banner_info(self) -> dict[str, Any]: ...
    def get_routed_local_ip(self) -> str: ...
    def on_burst_end(self, key: str, cb: Callable[[str], None]) -> None: ...
    def reset_ack_queues(self) -> None: ...
    def wait_for_ack_any(
        self,
        candidates: Sequence[tuple[int, int | None]],
        *,
        timeout: float = ...,
        not_before: float | None = ...,
    ) -> tuple[int, bytes] | None: ...
    def wait_for_any_response(
        self,
        *,
        timeout: float,
        not_before: float,
        poll_interval: float = ...,
        disconnect_check=...,
    ) -> tuple[int, bytes] | None: ...


class _CacheHost(Protocol):
    """The catalog cache: the entity state, the pending and complete sets, the
    per-kind caches with their locks and events, and the read helpers."""

    _activities_catalog_ready: bool
    _activity_inputs_event: threading.Event
    _activity_inputs_lock: threading.Lock
    _activity_inputs_payloads: list[bytes]
    _activity_map_complete: set[int]
    _activity_row_payloads: dict[int, bytes]
    _commands_complete: set[int]
    _device_key_sort_lock: threading.Lock
    _device_key_sort_pages: dict[int, bytes]
    _devices_catalog_ready: bool
    _favorite_label_requests: dict[tuple[int, int], set[int]]
    _idle_behavior_absent: set[int]
    _idle_behavior_events: dict[int, threading.Event]
    _idle_behavior_lock: threading.Lock
    _idle_behavior_values: dict[int, int]
    _ir_dump_lock: threading.Lock
    _ir_dump_pending: dict[tuple[int, int], dict[str, Any]]
    _ir_learn_lock: threading.Lock
    _macro_assembler: MacroAssembler
    _macro_payload_event: threading.Event
    _macro_payload_events: dict[tuple[int, int], MacroRecord]
    _macro_payload_lock: threading.Lock
    _macro_records_cache: dict[tuple[int, int], MacroRecord]
    _macros_complete: set[int]
    _pending_activity_map_requests: set[int]
    _pending_assigned_device_event: threading.Event
    _pending_assigned_device_lock: threading.Lock
    _pending_button_requests: set[int]
    _pending_command_requests: dict[int, set[int]]
    _pending_macro_requests: set[int]
    state: ActivityCache

    @property
    def _backup_burst_waiter(self) -> _SyncBurstWaiter: ...
    def _begin_activity_request(self, *, is_retry: bool = ...) -> None: ...
    def _begin_device_request(self) -> None: ...
    def _clear_favorite_label_requests_for_activity(self, act_lo: int) -> None: ...
    def _fetch_and_wait(
        self,
        burst_key: str,
        kick: Callable[[], Any],
        ready_check: Callable[[], bool],
        *,
        timeout: float,
    ) -> bool: ...
    def _forget_detail(self, kind: str, ent_lo: int) -> None: ...
    def _get_active_ir_dump_pending(
        self, *, device_id: int | None = ..., burst_kind: str | None = ...
    ) -> tuple[tuple[int, int], dict[str, Any]] | tuple[None, None]: ...
    def _note_detail_fetched(self, kind: str, ent_lo: int) -> None: ...
    def activities_referencing_device(self, device_id: int) -> list[int]: ...
    def clear_entity_cache(
        self,
        ent_id: int,
        clear_buttons: bool = ...,
        clear_favorites: bool = ...,
        clear_macros: bool = ...,
        *,
        clear_commands: bool = ...,
    ) -> None: ...
    def drop_cached_macro_records(self, activity_id: int) -> None: ...
    def ensure_commands_for_activity(
        self, act_id: int, *, fetch_if_missing: bool = ...
    ) -> tuple[dict[int, dict[int, str]], bool]: ...
    def fetch_device_input_record(
        self, device_id: int, *, timeout: float = ..., absent_as_empty: bool = ...
    ) -> dict[str, object] | None: ...
    def fetch_device_key_sort(
        self, device_id: int, *, timeout: float = ...
    ) -> dict[str, int | str] | None: ...
    def fetch_idle_behavior(
        self, device_id: int, *, force_refresh: bool = ..., timeout: float = ...
    ) -> tuple[int | None, bool]: ...
    def forget_idle_behavior(self, device_id: int | None = ...) -> None: ...
    def get_buttons_for_entity(
        self, ent_id: int, *, fetch_if_missing: bool = ...
    ) -> tuple[list[int], bool]: ...
    def get_cached_macro_records(self, activity_id: int) -> list[MacroRecord]: ...
    def get_commands_for_entity(
        self, ent_id: int, *, fetch_if_missing: bool = ...
    ) -> tuple[dict[int, str], bool]: ...
    def get_idle_behavior(
        self, device_id: int, *, fetch_if_missing: bool = ...
    ) -> tuple[int | None, bool]: ...
    def get_known_activity_ids(self) -> set[int]: ...
    def get_known_device_ids(self) -> set[int]: ...
    def get_macros_for_activity(
        self, act_id: int, *, fetch_if_missing: bool = ...
    ) -> tuple[list[dict[str, int | str]], bool]: ...
    def note_catalog_status_ack(self, status: int) -> bool: ...
    def query_device_input_index(
        self, device_id: int, cmd_id: int, *, timeout: float = ...
    ) -> int | None: ...
    def request_activities(self, *, is_retry: bool = ...) -> bool: ...
    def request_activity_mapping(self, act_id: int) -> bool: ...
    def request_devices(self) -> bool: ...
    def request_favorites_order(
        self, activity_id: int
    ) -> list[tuple[int, int]] | None: ...
    def request_ir_command_dump(
        self, device_id: int, command_id: int | None = ..., *, timeout: float = ...
    ) -> dict[str, Any] | None: ...
    def wait_for_activity_inputs_burst(
        self, *, timeout: float = ..., idle_window: float = ..., min_frames: int = ...
    ) -> InputsBurstResult: ...
    def wait_for_assigned_device_id(self, timeout: float = ...) -> int | None: ...
    def wait_for_macro_record(
        self, activity_id: int, button_id: int, *, timeout: float = ...
    ) -> MacroRecord | None: ...


class _OpsHost(Protocol):
    """The cross-mixin write helpers: builders, backup and restore, the Wifi
    sync steps and the persisted command records."""

    def _apply_wifi_input_configuration(
        self,
        *,
        device_id: int,
        device_name: str,
        ip_address: str,
        brand_name: str,
        commands: list[Any],
        input_command_ids: list[int] | None,
    ) -> bool: ...
    def _build_activity_confirm_payload(
        self, activity_id: int, *, name: str | None = ...
    ) -> bytes | None: ...
    def _build_device_power_binding_payload(
        self, *, device_id: int, button_id: int, command_id: int | None
    ) -> bytes: ...
    def _build_favorites_reorder_payload(
        self, act_lo: int, ordered_fav_ids: list[int]
    ) -> bytes: ...
    def _build_macro_save_payload(
        self,
        source_record: MacroRecord,
        *,
        device_id: int,
        button_id: int,
        allowed_device_ids: set[int] | None = ...,
        input_index: int = ...,
    ) -> bytes: ...
    def _build_paged_macro_save_payloads(self, payload: bytes) -> list[bytes]: ...
    def _build_wifi_device_payload(
        self,
        *,
        device_name: str,
        ip_address: str,
        state_byte: int,
        device_id: int = ...,
        device_class_byte: int = ...,
        ip_device: bool = ...,
        brand_name: str = ...,
        wifi_power_state: tuple[int, int, int] | None = ...,
    ) -> bytes: ...
    @staticmethod
    def _descriptive_play_blob_text(blob: bytes) -> str | None: ...
    @staticmethod
    def _edited_command_data_hex(
        restore_data: dict[str, Any], command_id: int
    ) -> str | None: ...
    @staticmethod
    def _extract_single_frame_play_blob(payload: bytes) -> bytes | None: ...
    def _ingest_ir_learn_frame(self, opcode: int, payload: bytes) -> None: ...
    def _register_command_in_device_sort(
        self, *, dev_lo: int, new_command_id: int, ack_timeout: float
    ) -> None: ...
    def _restore_input_payload(
        self,
        *,
        device_id: int,
        input_record: dict[str, Any] | None,
        inputs: list[dict[str, Any]],
        map_command_id,
    ) -> tuple[bytes | None, int]: ...
    def _run_activity_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult: ...
    def _run_ir_device_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult: ...
    def _run_network_callback_create(
        self, request: DeviceCreateRequest
    ) -> DeviceCreateResult: ...
    def _send_paged_macro_save(
        self, *, payload: bytes, macro_button: int, ack_timeout: float = ...
    ) -> tuple[int, bytes] | None: ...
    def _sync_step_wifi_input_config(self, payload: Mapping[str, Any]) -> bool: ...
    def _sync_step_wifi_power_config(self, payload: Mapping[str, Any]) -> bool: ...
    def add_device_to_activity(
        self, activity_id: int, device_id: int, *, input_cmd_id: int | None = ...
    ) -> dict[str, Any] | None: ...
    def backup_activity(
        self,
        activity_id: int,
        *,
        wait_timeout: float = ...,
        refresh_catalog: bool = ...,
    ) -> dict[str, Any] | None: ...
    def backup_device(
        self,
        device_id: int,
        *,
        wait_timeout: float = ...,
        include_blobs: bool = ...,
        reuse_commands: bool = ...,
        refresh_catalog: bool = ...,
    ) -> dict[str, Any] | None: ...
    def command_to_button(
        self,
        activity_id: int,
        button_id: int,
        device_id: int,
        command_id: int,
        *,
        long_press_device_id: int | None = ...,
        long_press_command_id: int | None = ...,
        refresh_after_write: bool = ...,
    ) -> dict[str, Any] | None: ...
    def command_to_favorite(
        self,
        activity_id: int,
        device_id: int,
        command_id: int,
        *,
        slot_id: int | None = ...,
        refresh_after_write: bool = ...,
        query_existing_order: bool = ...,
        existing_order_ids: list[int] | None = ...,
        repair_order: bool = ...,
    ) -> dict[str, Any] | None: ...
    def delete_device(self, device_id: int) -> dict[str, Any] | None: ...
    def delete_favorite(
        self, activity_id: int, fav_id: int, *, refresh_after_write: bool = ...
    ) -> dict[str, Any] | None: ...
    def overwrite_command_payload(
        self,
        *,
        device_id: int,
        command_id: int,
        command_name: str,
        library_type: int,
        library_data: bytes,
        button_code: int,
        ack_timeout: float = ...,
    ) -> dict[str, Any] | None: ...
    def persist_command_record(
        self,
        *,
        device_id: int,
        command_name: str,
        library_type: int,
        command_data: bytes,
        command_code: int = ...,
        command_id: int | None = ...,
        inter_frame_delay: float = ...,
        ack_timeout: float = ...,
    ) -> dict[str, Any] | None: ...
    def persist_ir_blob(
        self,
        *,
        device_id: int,
        command_name: str,
        blob: bytes,
        command_id: int | None = ...,
        inter_frame_delay: float = ...,
        ack_timeout: float = ...,
    ) -> dict[str, Any] | None: ...
    def reorder_favorites(
        self,
        activity_id: int,
        ordered_fav_ids: list[int],
        *,
        refresh_after_write: bool = ...,
    ) -> dict[str, Any] | None: ...
    def repair_x1_quick_access_order(self, activity_id: int) -> bool | None: ...
    def restore_activity(
        self,
        payload: dict[str, Any],
        *,
        device_id_map: dict[int, int],
        bundle_devices_by_source_id: dict[int, dict[str, Any]] | None = ...,
        command_id_maps_by_source_device_id: dict[int, dict[int, int]] | None = ...,
        send_remote_sync: bool = ...,
    ) -> dict[str, Any] | None: ...
    def restore_device(
        self, payload: dict[str, Any], *, wifi_commands_request_port: int = ...
    ) -> dict[str, Any] | None: ...
    def resync_remote(self, hub_version: str | None = ...) -> bool: ...
    def set_idle_behavior(self, device_id: int, mode: int) -> bool: ...


class _ProxyHost(_WireHost, _CacheHost, _OpsHost, Protocol):
    """Everything a mixin may borrow from the proxy it is mixed into."""
