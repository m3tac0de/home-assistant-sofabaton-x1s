"""Catalog request / snapshot / cache mixin for :class:`X1Proxy`.

Centralises the read-side traffic against the hub: the
``request_*`` ↦ burst ↦ ``ingest_*`` ↦ ``_commit_pending_*_snapshot``
pipeline that keeps ``self.state.devices`` / ``self.state.activities``
in sync with the hub's authoritative catalog, plus the per-entity
``get_*`` / ``ensure_*`` / ``clear_entity_cache`` helpers that other
mixins call when they need a specific row.

The IR-dump assembly helpers (``_record_ir_dump_frame``,
``_build_ir_dump_result``, ``_ir_dump_snapshot_complete``,
``try_finish_ir_dump_burst``) live here because they share the same
"per-frame ingest, finish-on-completion" shape as the device/activity
ingest path.
"""

from __future__ import annotations

import threading
import time
from typing import Any

from .hub_versions import HUB_VERSION_X2
from .commands import extract_ir_dump_blob, extract_ir_dump_label_field
from .protocol_const import (
    OP_REQ_ACTIVITY_MAP,
    OP_REQ_BUTTONS,
    OP_REQ_COMMANDS,
    OP_REQ_DEVICES,
    OP_REQ_IPCMD_SYNC,
    OP_REQ_MACRO_LABELS,
)
from .state_helpers import normalize_device_entry


ACTIVITY_INCOMPLETE_RETRY_DELAY_S = 0.75


def _to_export_view():
    from .x1_proxy import to_export_view

    return to_export_view


class CatalogMixin:
    """Mixin providing catalog request, snapshot ingest, and cache reads."""

    def request_activity_mapping(self, act_id: int) -> bool:
        if not self.can_issue_commands():
            self._log.info("[CMD] request_activity_mapping ignored: proxy client is connected"); return False

        act_lo = act_id & 0xFF
        if act_lo in self._pending_activity_map_requests:
            self._log.debug(
                "[CMD] request_activity_mapping ignored: burst already pending for 0x%02X",
                act_lo,
            )
            return False

        self._pending_activity_map_requests.add(act_lo)
        self._log.info("[ACTMAP] local request act=0x%02X (%d)", act_lo, act_lo)
        return self.enqueue_cmd(
            OP_REQ_ACTIVITY_MAP,
            bytes([act_lo]),
            expects_burst=True,
            burst_kind=f"activity_map:{act_lo}",
        )

    def request_macros_for_activity(self, act_id: int) -> bool:
        if not self.can_issue_commands():
            self._log.info("[CMD] request_macros_for_activity ignored: proxy client is connected"); return False

        act_lo = act_id & 0xFF
        if act_lo in self._pending_macro_requests:
            self._log.debug(
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
            self._log.info("[CMD] request_ip_commands_for_device ignored: proxy client is connected"); return False

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

    def get_activities(self, *, force_refresh: bool = True) -> tuple[dict[int, dict], bool]:
        to_export_view = _to_export_view()
        if force_refresh:
            if self.can_issue_commands():
                self.request_activities()
            return ({}, False)

        activities_view = self.state.entities("activity")
        if self._activities_catalog_ready:
            return ({k: to_export_view(v) for k, v in activities_view.items()}, True)

        return ({}, False)

    def get_devices(self, *, force_refresh: bool = False) -> tuple[dict[int, dict], bool]:
        to_export_view = _to_export_view()
        if force_refresh:
            if self.can_issue_commands():
                self.enqueue_cmd(OP_REQ_DEVICES, expects_burst=True, burst_kind="devices")
            return ({}, False)

        devices_view = self.state.entities("device")
        if self._devices_catalog_ready:
            return ({k: to_export_view(v) for k, v in devices_view.items()}, True)

        if self.can_issue_commands():
            self.enqueue_cmd(OP_REQ_DEVICES, expects_burst=True, burst_kind="devices")
        return ({}, False)

    def _record_ir_dump_frame(self, parsed, raw_frame: bytes) -> None:
        pending: dict[str, Any] | None = None
        pending_dev_id: int | None = parsed.device_id
        payload = raw_frame[4:-1]
        ir_blob = extract_ir_dump_blob(payload, parsed.page_no)
        label_field = extract_ir_dump_label_field(payload) if parsed.page_no == 1 else None

        with self._ir_dump_lock:
            _request_key, pending = self._get_active_ir_dump_pending(
                device_id=pending_dev_id,
                burst_kind=str(self._burst.kind or ""),
            )
            if pending is not None and pending_dev_id is None:
                pending_dev_id = int(pending.get("device_id", 0)) & 0xFF

            if pending is None:
                return

            if parsed.total_commands and pending.get("total_commands") is None:
                pending["total_commands"] = parsed.total_commands
            pending["last_progress_ts"] = time.monotonic()

            response_index_map = pending.setdefault("response_index_to_command_id", {})
            if parsed.is_page_one:
                response_index_map[parsed.response_index] = parsed.command_id

            effective_command_id = response_index_map.get(parsed.response_index, parsed.command_id)
            commands = pending.setdefault("commands", {})
            command_entry = commands.setdefault(
                effective_command_id,
                {
                    "command_id": effective_command_id,
                    "device_id": pending_dev_id,
                    "label": None,
                    "format_marker": None,
                    "expected_page_count": None,
                    "pages": {},
                },
            )

            if pending_dev_id is not None:
                command_entry["device_id"] = pending_dev_id
            if parsed.label:
                command_entry["label"] = parsed.label
            if parsed.format_marker is not None:
                command_entry["format_marker"] = parsed.format_marker
            if parsed.total_pages is not None:
                command_entry["expected_page_count"] = parsed.total_pages

            command_entry["pages"][parsed.page_no] = {
                "page_no": parsed.page_no,
                "opcode": parsed.opcode,
                "opcode_hex": f"0x{parsed.opcode:04X}",
                "payload_hex": payload.hex(" "),
                "frame_hex": raw_frame.hex(" "),
                "ir_blob_hex": ir_blob.hex(" ") if ir_blob is not None else None,
                "ir_blob_byte_count": len(ir_blob) if ir_blob is not None else None,
                "_ir_blob_bytes": ir_blob,
                "label_field_hex": label_field.hex(" ") if label_field is not None else None,
            }

    def _build_ir_dump_result(self, pending: dict[str, Any]) -> dict[str, Any]:
        commands_out: list[dict[str, Any]] = []
        total_commands = pending.get("total_commands")
        requested_command_id = pending.get("requested_command_id")

        for command_id in sorted(pending.get("commands", {})):
            record = pending["commands"][command_id]
            raw_page_items = [record["pages"][page_no] for page_no in sorted(record.get("pages", {}))]
            blob_parts = [
                bytes(page["_ir_blob_bytes"])
                for page in raw_page_items
                if page.get("_ir_blob_bytes") is not None
            ]
            page_items = [
                {k: v for k, v in page.items() if not k.startswith("_")}
                for page in raw_page_items
            ]
            expected_page_count = record.get("expected_page_count") or max((page["page_no"] for page in page_items), default=0)
            complete = bool(expected_page_count) and len(page_items) >= expected_page_count
            ir_blob = b"".join(blob_parts)

            commands_out.append(
                {
                    "command_id": command_id,
                    "device_id": record.get("device_id"),
                    "label": record.get("label"),
                    "format_marker": record.get("format_marker"),
                    "expected_page_count": expected_page_count,
                    "page_count": len(page_items),
                    "complete": complete,
                    "ir_blob_hex": ir_blob.hex(" ") if ir_blob else None,
                    "ir_blob_byte_count": len(ir_blob),
                    "pages": page_items,
                }
            )

        overall_complete = bool(pending.get("burst_finished"))
        if requested_command_id is None and total_commands is not None:
            overall_complete = overall_complete and len(commands_out) >= int(total_commands)
        if requested_command_id is None:
            overall_complete = overall_complete and all(command["complete"] for command in commands_out)
        else:
            requested_entry = next(
                (command for command in commands_out if command["command_id"] == requested_command_id),
                None,
            )
            overall_complete = overall_complete and bool(requested_entry and requested_entry["complete"])

        return {
            "device_id": pending.get("device_id"),
            "requested_command_id": requested_command_id,
            "total_commands": total_commands,
            "received_command_count": len(commands_out),
            "complete": overall_complete,
            "commands": commands_out,
        }

    def _ir_dump_snapshot_complete(self, pending: dict[str, Any]) -> bool:
        requested_command_id = pending.get("requested_command_id")
        commands: dict[int, dict[str, Any]] = pending.get("commands", {})
        total_commands = pending.get("total_commands")

        def _command_complete(record: dict[str, Any]) -> bool:
            expected_page_count = record.get("expected_page_count")
            if not expected_page_count:
                return False
            pages = record.get("pages", {})
            return len(pages) >= int(expected_page_count)

        if requested_command_id is not None:
            record = commands.get(int(requested_command_id))
            return bool(record and _command_complete(record))

        if total_commands is None:
            return False
        if len(commands) < int(total_commands):
            return False
        return all(_command_complete(record) for record in commands.values())

    def try_finish_ir_dump_burst(self, request_key: tuple[int, int]) -> bool:
        with self._ir_dump_lock:
            pending = self._ir_dump_pending.get(request_key)
            if pending is None:
                return False
            if not self._ir_dump_snapshot_complete(pending):
                return False

        return self._burst.finish(
            f"ir_dump:{request_key[0]}:{request_key[1]}",
            can_issue=self.can_issue_commands,
            sender=self._send_cmd_frame,
        )

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

    def _reset_pending_device_snapshot(self, generation: int | None = None) -> None:
        self._device_pending_generation = generation
        self._device_pending_expected_rows = None
        self._device_pending_rows = {}

    def _reset_pending_activity_snapshot(self, generation: int | None = None) -> None:
        self._activity_pending_generation = generation
        self._activity_pending_expected_rows = None
        self._activity_pending_rows = {}
        self._activity_pending_payloads = {}
        self._activity_pending_hint = None

    def _begin_device_request(self) -> None:
        self._device_request_serial += 1
        self._device_request_inflight = self._device_request_serial
        self._reset_pending_device_snapshot(self._device_request_inflight)

    def _begin_activity_request(self, *, is_retry: bool = False) -> None:
        self._activity_request_serial += 1
        self._activity_request_inflight = self._activity_request_serial
        self._activity_retry_due_at = None
        if not is_retry:
            self._activity_retry_count = 0
        self._reset_pending_activity_snapshot(self._activity_request_inflight)

    def _schedule_activity_retry(self, *, now: float | None = None) -> None:
        if self.hub_version != HUB_VERSION_X2:
            return
        if self._activity_retry_count >= 1:
            return
        base = time.monotonic() if now is None else now
        self._activity_retry_due_at = base + ACTIVITY_INCOMPLETE_RETRY_DELAY_S
        self._activity_retry_count += 1
        self._log.warning(
            "[ACT] incomplete activities snapshot on X2; retrying in %.2fs",
            ACTIVITY_INCOMPLETE_RETRY_DELAY_S,
        )

    def _activity_snapshot_complete(self) -> bool:
        expected = self._activity_pending_expected_rows
        if expected == 0:
            return True
        if expected is None:
            # No row ever arrived and no explicit empty-catalog ack: the
            # request was dropped or unanswered (the hub answers a truly
            # empty catalog with STATUS_ACK 0x07, which sets expected=0).
            # Treating silence as "empty" committed a wiped snapshot when
            # a queued catalog retry fired mid write-sequence (live-bench
            # finding, backup/restore chunk 2).
            return False
        if expected < 0:
            return False
        seen = set(self._activity_pending_rows.keys())
        return seen == set(range(1, expected + 1))

    def _device_snapshot_complete(self) -> bool:
        expected = self._device_pending_expected_rows
        if expected == 0:
            return True
        if expected is None:
            # See _activity_snapshot_complete: silence is a dropped
            # request, not an empty catalog.
            return False
        if expected < 0:
            return False
        seen = set(self._device_pending_rows.keys())
        return seen == set(range(1, expected + 1))

    def try_finish_devices_burst(self) -> bool:
        generation = self._device_request_inflight
        if generation is None or self._device_pending_generation != generation:
            return False
        if not self._device_snapshot_complete():
            return False
        return self._burst.finish(
            "devices",
            can_issue=self.can_issue_commands,
            sender=self._send_cmd_frame,
        )

    def try_finish_activities_burst(self) -> bool:
        generation = self._activity_request_inflight
        if generation is None or self._activity_pending_generation != generation:
            return False
        if not self._activity_snapshot_complete():
            return False
        return self._burst.finish(
            "activities",
            can_issue=self.can_issue_commands,
            sender=self._send_cmd_frame,
        )

    def note_catalog_status_ack(self, status: int) -> bool:
        """Handle hub status replies that mean an empty catalog request.

        Some hubs answer ``REQ_ACTIVITIES`` / ``REQ_DEVICES`` with a plain
        ``STATUS_ACK`` carrying ``0x07`` when the corresponding table is
        genuinely empty. In that case there will be no row burst to drive the
        normal completion path, so finish the active catalog burst immediately
        instead of waiting for the idle timeout.
        """

        ack_status = int(status) & 0xFF
        if ack_status != 0x07:
            return False

        active_kind = self._burst.kind if self._burst.active else None
        if active_kind is not None and active_kind.startswith("exchange:"):
            # An exchange holds the wire: fire-and-forget catalog reads are
            # queued behind it, not in flight, so this 0x07 answers the
            # exchange's own request (e.g. an empty favorites-order or
            # macro table) — never an empty-catalog reply. Claiming it here
            # committed a bogus rows=0 snapshot and finished the wrong
            # burst (observed live: X1 stress bench 2026-07-18, the wire
            # was released while the hub streamed rows and the next
            # exchange's send was silently dropped).
            return False

        if self._activity_request_inflight is not None and not self._activity_pending_rows:
            if self._activity_pending_generation != self._activity_request_inflight:
                self._reset_pending_activity_snapshot(self._activity_request_inflight)
            self._activity_pending_expected_rows = 0
            finished = self._burst.finish(
                "activities",
                can_issue=self.can_issue_commands,
                sender=self._send_cmd_frame,
            )
            if finished:
                self._log.info("[ACT] STATUS_ACK 0x07 indicates an empty activities catalog; finishing burst")
            return finished

        if self._device_request_inflight is not None and not self._device_pending_rows:
            if self._device_pending_generation != self._device_request_inflight:
                self._reset_pending_device_snapshot(self._device_request_inflight)
            self._device_pending_expected_rows = 0
            finished = self._burst.finish(
                "devices",
                can_issue=self.can_issue_commands,
                sender=self._send_cmd_frame,
            )
            if finished:
                self._log.info("[DEV] STATUS_ACK 0x07 indicates an empty devices catalog; finishing burst")
            return finished

        # Per-entity read bursts (macros, buttons, commands, activity_map)
        # get the same "table is empty / not configured" answer: a bare
        # STATUS_ACK 0x07 and no row burst. Finish the active burst now so
        # its burst-end bookkeeping (pending-request discard, completion
        # marking) runs immediately instead of after the scheduler's 5s
        # response grace — a macro-less device otherwise stalls a whole-hub
        # cache refresh ~5s per entity.
        kind = self._burst.kind if self._burst.active else None
        if kind and kind.split(":", 1)[0] in (
            "macros",
            "buttons",
            "commands",
            "activity_map",
        ):
            finished = self._burst.finish(
                kind,
                can_issue=self.can_issue_commands,
                sender=self._send_cmd_frame,
            )
            if finished:
                base, _, ent = kind.partition(":")
                if base == "buttons" and ent.isdigit():
                    # An empty keymap is a definitive answer: record the
                    # entity so ``ent_lo in state.buttons`` (the fetch/
                    # completeness predicate) treats it as fetched instead
                    # of waiting out the timeout and reporting incomplete.
                    self.state.buttons.setdefault(int(ent) & 0xFF, set())
                self._log.info(
                    "[CATALOG] STATUS_ACK 0x07 indicates an empty %s reply; finishing burst",
                    kind,
                )
            return finished

        return False

    def note_buttons_frame(self, act_lo: int, *, frame_no: int | None, total_frames: int | None) -> None:
        if frame_no != 1:
            return
        if total_frames is None or total_frames <= 0:
            return
        self._button_burst_expected_frames[act_lo & 0xFF] = total_frames

    def try_finish_buttons_burst(self, act_lo: int, *, frame_no: int | None) -> bool:
        ent_lo = act_lo & 0xFF
        expected = self._button_burst_expected_frames.get(ent_lo)
        if expected is None or frame_no is None or frame_no < expected:
            return False
        return self._burst.finish(
            f"buttons:{ent_lo}",
            can_issue=self.can_issue_commands,
            sender=self._send_cmd_frame,
        )

    def try_finish_activity_map_burst(self, act_lo: int) -> bool:
        ent_lo = act_lo & 0xFF
        if ent_lo not in self._activity_map_complete:
            return False
        return self._burst.finish(
            f"activity_map:{ent_lo}",
            can_issue=self.can_issue_commands,
            sender=self._send_cmd_frame,
        )

    def ingest_activity_row(
        self,
        *,
        row_idx: int | None,
        expected_rows: int | None,
        act_id: int | None,
        activity: dict[str, Any] | None,
        payload: bytes | None = None,
    ) -> bool:
        generation = self._activity_request_inflight
        if generation is None:
            self._log.warning(
                "[ACT] ignoring ghost activity row idx=%s act_id=%s: no request in flight",
                row_idx,
                act_id,
            )
            return False

        if row_idx is None or row_idx <= 0 or act_id is None or activity is None:
            return False

        if row_idx == 1:
            self._reset_pending_activity_snapshot(generation)
        elif self._activity_pending_generation != generation:
            self._log.warning(
                "[ACT] ignoring activity row idx=%s act_id=%s before row #1 for request=%s",
                row_idx,
                act_id,
                generation,
            )
            return False

        if expected_rows is not None and expected_rows > 0:
            if self._activity_pending_expected_rows is None:
                self._activity_pending_expected_rows = expected_rows
            elif self._activity_pending_expected_rows != expected_rows:
                self._log.warning(
                    "[ACT] row-count mismatch in pending snapshot: had=%s got=%s idx=%s",
                    self._activity_pending_expected_rows,
                    expected_rows,
                    row_idx,
                )
                self._reset_pending_activity_snapshot(generation)
                self._activity_pending_expected_rows = expected_rows
                if row_idx != 1:
                    self._log.warning(
                        "[ACT] ignoring activity row idx=%s after row-count mismatch until row #1 restarts snapshot",
                        row_idx,
                    )
                    return False

        self._activity_pending_rows[row_idx] = dict(activity)
        if payload is not None:
            self._activity_pending_payloads[act_id & 0xFF] = bytes(payload)

        if bool(activity.get("active", False)):
            self._activity_pending_hint = act_id

        return True

    def ingest_device_row(
        self,
        *,
        row_idx: int | None,
        expected_rows: int | None,
        dev_id: int | None,
        device: dict[str, Any] | None,
    ) -> bool:
        generation = self._device_request_inflight
        if generation is None:
            self._log.warning(
                "[DEV] ignoring ghost device row idx=%s dev_id=%s: no request in flight",
                row_idx,
                dev_id,
            )
            return False

        if row_idx is None or row_idx <= 0 or dev_id is None or device is None:
            return False

        if row_idx == 1:
            self._reset_pending_device_snapshot(generation)
        elif self._device_pending_generation != generation:
            self._log.warning(
                "[DEV] ignoring device row idx=%s dev_id=%s before row #1 for request=%s",
                row_idx,
                dev_id,
                generation,
            )
            return False

        if expected_rows is not None and expected_rows > 0:
            if self._device_pending_expected_rows is None:
                self._device_pending_expected_rows = expected_rows
            elif self._device_pending_expected_rows != expected_rows:
                self._log.warning(
                    "[DEV] row-count mismatch in pending snapshot: had=%s got=%s idx=%s",
                    self._device_pending_expected_rows,
                    expected_rows,
                    row_idx,
                )
                self._reset_pending_device_snapshot(generation)
                self._device_pending_expected_rows = expected_rows
                if row_idx != 1:
                    self._log.warning(
                        "[DEV] ignoring device row idx=%s after row-count mismatch until row #1 restarts snapshot",
                        row_idx,
                    )
                    return False

        self._device_pending_rows[row_idx] = {
            "id": dev_id & 0xFF,
            **normalize_device_entry(device),
        }
        return True

    def _commit_pending_device_snapshot(self) -> None:
        ordered_rows = sorted(self._device_pending_rows.items())
        committed: dict[int, dict[str, Any]] = {}
        for _row_idx, row in ordered_rows:
            dev_id = int(row["id"]) & 0xFF
            merged = normalize_device_entry(
                {
                    "brand": row.get("brand"),
                    "name": row.get("name"),
                    "device_class": row.get("device_class"),
                    "device_class_code": row.get("device_class_code"),
                }
            )
            raw_body = row.get("raw_body")
            if isinstance(raw_body, (bytes, bytearray)) and raw_body:
                merged["raw_body"] = bytes(raw_body)
            prior = self.state.entities("device").get(dev_id, {})
            cached_mode = self._idle_behavior_values.get(dev_id)
            if cached_mode is None and isinstance(prior.get("idle_behavior"), int):
                cached_mode = int(prior["idle_behavior"]) & 0xFF
            if cached_mode is not None:
                merged["idle_behavior"] = cached_mode
                merged["power_mode"] = cached_mode
                merged["power_model"] = cached_mode
            committed[dev_id] = merged
        self.state.devices = committed
        self._devices_catalog_ready = True

    def _on_devices_burst_end(self, key: str) -> None:
        generation = self._device_request_inflight
        complete = generation is not None and self._device_pending_generation == generation and self._device_snapshot_complete()

        if complete:
            self._commit_pending_device_snapshot()
            self._log.info(
                "[DEV] committed complete devices snapshot rows=%d request=%s",
                len(self._device_pending_rows),
                generation,
            )

        self._device_request_inflight = None

        if not complete:
            expected = self._device_pending_expected_rows
            seen = sorted(self._device_pending_rows.keys())
            if generation is not None:
                self._log.warning(
                    "[DEV] discarding incomplete devices snapshot request=%s expected=%s seen=%s",
                    generation,
                    expected,
                    seen,
                )
        self._reset_pending_device_snapshot()

    def _commit_pending_activity_snapshot(self) -> None:
        ordered_rows = sorted(self._activity_pending_rows.items())
        committed: dict[int, dict[str, Any]] = {}
        for _row_idx, row in ordered_rows:
            act_id = int(row["id"]) & 0xFF
            entry: dict[str, Any] = {
                "name": row["name"],
                "active": bool(row["active"]),
                "needs_confirm": bool(row["needs_confirm"]),
            }
            # Activity records share the device-record body layout
            # (just with family 0x37 on the create write). The pending
            # payload is ``payload[3:]`` of the catalog-row frame --
            # i.e., the full body, ready for parse_device_record.
            raw_payload = self._activity_pending_payloads.get(act_id)
            if isinstance(raw_payload, (bytes, bytearray)) and len(raw_payload) > 3:
                entry["raw_body"] = bytes(raw_payload[3:])
            committed[act_id] = entry

        self.state.activities = committed
        self._activity_row_payloads = dict(self._activity_pending_payloads)
        self.state.set_hint(self._activity_pending_hint)
        self._activities_catalog_ready = True

    def _on_activities_burst_end(self, key: str) -> None:
        generation = self._activity_request_inflight
        complete = generation is not None and self._activity_pending_generation == generation and self._activity_snapshot_complete()

        if complete:
            self._commit_pending_activity_snapshot()
            self._log.info(
                "[ACT] committed complete activities snapshot rows=%d request=%s",
                len(self._activity_pending_rows),
                generation,
            )
        self._activity_request_inflight = None

        if not complete:
            expected = self._activity_pending_expected_rows
            seen = sorted(self._activity_pending_rows.keys())
            if generation is not None:
                self._log.warning(
                    "[ACT] discarding incomplete activities snapshot request=%s expected=%s seen=%s",
                    generation,
                    expected,
                    seen,
                )
            self._schedule_activity_retry()
        self._reset_pending_activity_snapshot()

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

            favorite_label = self.state.get_favorite_label(act_lo, dev_id, command_id)
            if favorite_label:
                self.state.record_favorite_label(act_lo, dev_id, command_id, favorite_label)
                continue

            device_cmds = self.state.commands.get(dev_id & 0xFF)
            if device_cmds and command_id in device_cmds:
                label = device_cmds[command_id]
                self.state.record_favorite_label(act_lo, dev_id, command_id, label)
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
        # command_metadata is captured by the same REQ_COMMANDS parse that
        # fills state.commands; clearing one without the other leaves record
        # metadata (library_type/button_code) describing commands that no
        # longer exist in the label map.
        self.state.command_metadata.pop(ent_lo, None)
        self.state.device_key_sorts.pop(ent_lo, None)
        self._commands_complete.discard(ent_lo)
        self._pending_command_requests.pop(ent_lo, None)

        if clear_buttons:
            self.state.buttons.pop(ent_lo, None)
            self.state.button_details.pop(ent_lo, None)
            self._pending_button_requests.discard(ent_lo)

        if clear_favorites:
            self.state.activity_command_refs.pop(ent_lo, None)
            self.state.activity_favorite_slots.pop(ent_lo, None)
            self.state.activity_keybinding_slots.pop(ent_lo, None)
            self.state.activity_members.pop(ent_lo, None)
            self.state.activity_favorite_labels.pop(ent_lo, None)
            self.state.activity_keybinding_labels.pop(ent_lo, None)
            self._clear_favorite_label_requests_for_activity(ent_lo)
            self._clear_keybinding_label_requests_for_activity(ent_lo)
            self._pending_activity_map_requests.discard(ent_lo)
            self._activity_map_complete.discard(ent_lo)

        if clear_macros:
            self.state.activity_macros.pop(ent_lo, None)
            self._macros_complete.discard(ent_lo)
            self._pending_macro_requests.discard(ent_lo)
            self.drop_cached_macro_records(ent_lo)

    def activities_referencing_device(self, device_id: int) -> list[int]:
        """Return catalog activity ids whose cached structures reference *device_id*.

        The hub cascades device deletions and command-record rewrites into
        every activity server-side, but the cache holds those references in
        several independently-keyed maps that no single write flow owns.
        Write paths use this scan to decide which activities need a
        ``clear_entity_cache`` + re-fetch, instead of trusting the hub's
        ``needs_confirm`` flag (which marks only a subset) or the write
        plan's own step list (which omits activities that merely reference
        an edited command).

        The device itself is excluded; results are limited to ids present
        in the activity catalog at call time.
        """

        dev_lo = device_id & 0xFF
        referencing: set[int] = set()

        for act_lo, members in self.state.activity_members.items():
            if dev_lo in members:
                referencing.add(act_lo)
        for act_lo, refs in self.state.activity_command_refs.items():
            if any((int(ref_dev) & 0xFF) == dev_lo for ref_dev, _cmd in refs):
                referencing.add(act_lo)
        for slot_map in (
            self.state.activity_favorite_slots,
            self.state.activity_keybinding_slots,
        ):
            for act_lo, slots in slot_map.items():
                if any(
                    (int(slot.get("device_id", 0)) & 0xFF) == dev_lo for slot in slots
                ):
                    referencing.add(act_lo)
        for label_map in (
            self.state.activity_favorite_labels,
            self.state.activity_keybinding_labels,
        ):
            for act_lo, labels in label_map.items():
                if any((int(ref_dev) & 0xFF) == dev_lo for ref_dev, _cmd in labels):
                    referencing.add(act_lo)
        for act_lo, details in self.state.button_details.items():
            for meta in details.values():
                if (int(meta.get("device_id", 0)) & 0xFF) == dev_lo or (
                    int(meta.get("long_press_device_id") or 0) & 0xFF
                ) == dev_lo:
                    referencing.add(act_lo)
                    break
        # Power/user macros: state.activity_macros holds label-only
        # quick-access rows (POWER_* rows are filtered out at ingest), so
        # per-step device references only exist in the assembled
        # MacroRecord cache — the store exports and bundle assembly read.
        with self._macro_payload_lock:
            record_items = list(self._macro_records_cache.items())
        for (ent_lo, _key_id), record in record_items:
            if any(
                (entry.device_id & 0xFF) == dev_lo for entry in record.key_sequence
            ):
                referencing.add(ent_lo & 0xFF)

        referencing.discard(dev_lo)
        known = self.state.activities
        return sorted(act_lo for act_lo in referencing if act_lo in known)

    def _clear_favorite_label_requests_for_activity(self, act_lo: int) -> None:
        to_delete: list[tuple[int, int]] = []

        for pair, act_ids in self._favorite_label_requests.items():
            act_ids.discard(act_lo)
            if not act_ids:
                to_delete.append(pair)

        for pair in to_delete:
            self._favorite_label_requests.pop(pair, None)

    def _clear_keybinding_label_requests_for_activity(self, act_lo: int) -> None:
        to_delete: list[tuple[int, int]] = []

        for pair, act_ids in self._keybinding_label_requests.items():
            act_ids.discard(act_lo)
            if not act_ids:
                to_delete.append(pair)

        for pair in to_delete:
            self._keybinding_label_requests.pop(pair, None)


__all__ = ["CatalogMixin"]
